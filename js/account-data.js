/* ============================================================================
 *  IntMap · YOUR DATA — what the account holds, why, for how long, and a full copy   (account-data-center)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of supabase/migrations/20261003130000_account_data_center.sql.
 *  Two questions, both answered by the DATABASE, never by a list in this file:
 *    · «what do you hold about me?» — public.account_data_inventory(): one row per table the account
 *      owns rows in (discovered from the FK catalogue — the same walk account deletion uses), with the
 *      number of rows and the catalogue's sentence (what / why / how long / who wrote it);
 *    · «give me all of it»           — public.export_account_data(): every row, every column, plus
 *      what the sign-in system holds, as ONE self-describing JSON file the reader downloads.
 *  ⚠ NOTHING HERE NAMES A TABLE. A table added by a later migration appears in this sheet and in the
 *  file the moment its foreign key to auth.users exists; its words arrive with its catalogue row.
 *
 *  Reached from: the account sheet («Your data» card, js/auth-ui.js) and Atlas
 *  (account.data / account.export, js/atlas-cap-account.js). Loaded on demand — never on the boot path.
 *  Its look reuses the account sheet's `.acct-*` rules (css/intmap.css); the few rules of its own are
 *  injected when the sheet first opens, so a reader who never opens it never downloads them.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';

/* ── pure helpers (tests/platform-backend-checks.test.mjs runs them in Node) ───────────────────── */

/** The file name of an export: the account's own words, the day it was made (UTC). */
export function exportFileName(doc) {
  const at = String((doc && doc.exported_at) || new Date().toISOString());
  const day = /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return 'intmap-account-' + day + '.json';
}

/** Group inventory rows for display: who wrote them, what is held, what is not.
 *  `lang` picks the catalogue column (jp → *_jp, anything else → *_en). A row the catalogue does not
 *  describe yet is KEPT and shown by its table name — the sheet explains, it never hides. */
export function inventoryView(rows, lang) {
  const jp = lang === 'jp' || lang === 'ja';
  const pick = (r, k) => (jp ? r[k + '_jp'] : r[k + '_en']) || r[k + '_en'] || '';
  const items = (Array.isArray(rows) ? rows : []).map((r) => ({
    table: String(r.tbl || ''),
    rows: Number(r.row_count) || 0,
    described: r.described !== false && !!(r.label_en || r.label_jp),
    by: r.written_by === 'intmap' ? 'intmap' : 'you',
    label: pick(r, 'label') || String(r.tbl || ''),
    purpose: pick(r, 'purpose'),
    retention: pick(r, 'retention'),
  }));
  const held = items.filter((i) => i.rows > 0);
  return {
    total: held.reduce((s, i) => s + i.rows, 0),
    you: held.filter((i) => i.by === 'you'),
    intmap: held.filter((i) => i.by === 'intmap'),
    none: items.filter((i) => i.rows === 0),
    undescribed: items.filter((i) => !i.described).map((i) => i.table),
  };
}

/* ── the two doors ────────────────────────────────────────────────────────────────────────────── */

/** @returns {Promise<{ok:boolean, rows?:any[], error?:string}>} */
export async function readInventory(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('account_data_inventory', {}, { get: true });
    if (error) return { ok: false, error: error.code === '42501' ? 'sign_in' : 'failed' };
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Fetch the whole account as JSON and hand it to the reader as a file.
 *  @returns {Promise<{ok:boolean, filename?:string, bytes?:number, total?:number, tables?:number, error?:string}>} */
export async function downloadAccountData(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  let doc;
  try {
    const { data, error } = await DB.rpc('export_account_data');
    if (error) return { ok: false, error: error.code === '42501' ? 'sign_in' : 'failed' };
    doc = data;
  } catch (_) { return { ok: false, error: 'failed' }; }
  if (!doc || doc.ok !== true) return { ok: false, error: (doc && doc.error) || 'failed' };
  const text = JSON.stringify(doc, null, 2);
  const filename = exportFileName(doc);
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 30000);
  } catch (_) { return { ok: false, error: 'failed' }; }
  const counts = doc.counts || {};
  return {
    ok: true, filename, bytes: text.length,
    tables: Object.keys(counts).filter((k) => counts[k] > 0).length,
    total: Object.keys(counts).reduce((s, k) => s + (Number(counts[k]) || 0), 0),
  };
}

/** The sentence for a failed door, in the reader's language. */
export function failureText(error, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (error === 'sign_in') return T('Sign in to see your data.', 'データを見るにはログインしてください。');
  if (error === 'rate_limited') return T('You have downloaded several copies in the last hour. Please try again a little later.', '直近1時間に何度か書き出しています。少し時間をおいてからお試しください。');
  if (error === 'unavailable') return T('The account service is not reachable right now.', 'アカウントのサービスに接続できません。');
  return T('Could not reach your data. Please try again.', 'データを取得できませんでした。もう一度お試しください。');
}

/* ── the sheet ────────────────────────────────────────────────────────────────────────────────── */

function el(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'text') n.textContent = props[k];
    else if (k === 'cls') n.className = props[k];
    else n.setAttribute(k, props[k]);
  }
  (kids || []).forEach((c) => { if (c) n.appendChild(c); });
  return n;
}

function ensureStyle() {
  if (document.getElementById('ydc-css')) return;
  const st = document.createElement('style'); st.id = 'ydc-css';
  st.textContent = '.ydc-lead{margin:2px 0 16px;font-size:13px;line-height:1.55;color:var(--text-muted);}'
    + '.ydc-item{padding:9px 0;}'
    + '.ydc-item + .ydc-item{box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.ydc-item summary{display:flex;align-items:baseline;justify-content:space-between;gap:10px;cursor:pointer;list-style:none;font-size:13.5px;color:var(--text-main);}'
    + '.ydc-item summary::-webkit-details-marker{display:none;}'
    + '.ydc-item summary b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;}'
    + '.ydc-item p{margin:6px 0 0;font-size:12px;line-height:1.55;color:var(--text-muted);}'
    + '.ydc-none{font-size:12px;line-height:1.6;color:var(--text-muted);}'
    + '.ydc-go{display:block;width:100%;background:var(--primary-fill);color:#fff;border:none;padding:11px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;margin:0 0 10px;}'
    + '.ydc-go[disabled]{opacity:0.55;cursor:default;}';
  document.head.appendChild(st);
}

function itemNode(i, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  const bits = [];
  if (i.purpose) bits.push(el('p', { text: i.purpose }));
  if (i.retention) bits.push(el('p', { text: T('Kept: ', '保持: ') + i.retention }));
  if (!i.described) bits.push(el('p', { text: T('This kind of data has no description yet; it is still included in your copy.', 'この種類のデータにはまだ説明がありませんが、書き出しには含まれます。') }));
  return el('details', { cls: 'ydc-item' }, [
    el('summary', null, [el('span', { text: i.label }), el('b', { text: String(i.rows) })]),
    ...bits,
  ]);
}

/** Open the «Your data» sheet. `HOST` is the app host (DB, user, lang, imToast, openAuthModal). */
export async function openYourData(HOST) {
  const lang = HOST && HOST.lang;
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (!HOST || !HOST.user) { try { HOST && HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return; }
  ensureStyle();
  const old = document.getElementById('ydc-modal'); if (old) old.remove();
  const body = el('div', { id: 'ydc-body' }, [el('p', { cls: 'ydc-lead', text: T('Reading what your account holds…', 'アカウントが保持しているものを読み込み中…') })]);
  const msg = el('p', { cls: 'acct-msg', role: 'status', 'aria-live': 'polite' });
  const go = el('button', { cls: 'ydc-go', id: 'ydc-download', text: T('Download a copy (JSON)', 'コピーをダウンロード（JSON）') });
  go.dataset.effect = 'private';   /* reads the reader's own account to the reader's own device — what Atlas's control press reads (scripts/data-effects.mjs) */
  const close = el('button', { cls: 'acct-close', id: 'ydc-close', text: T('Close', '閉じる') });
  const sheet = el('div', { cls: 'acct-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ydc-h', tabindex: '-1' }, [
    el('h2', { cls: 'acct-h', id: 'ydc-h', text: T('Your data', 'あなたのデータ') }),
    el('p', { cls: 'ydc-lead', text: T('Everything IntMap holds for this account, read from the database just now — the same set that deleting the account removes.', 'このアカウントについて IntMap が保持しているすべてを、いまデータベースから読み出したものです。アカウントを削除すると消えるものと同じ範囲です。') }),
    body, msg, go, close,
  ]);
  const m = el('div', { id: 'ydc-modal' }, [sheet]);
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:calc(var(--z-toast) + 2001);padding:20px;';
  const shut = () => { try { m.remove(); } catch (_) { } };
  close.onclick = shut;
  go.onclick = async () => {
    go.disabled = true; msg.textContent = T('Preparing your copy…', 'コピーを用意しています…');
    const r = await downloadAccountData(HOST.DB);
    go.disabled = false;
    msg.textContent = r.ok
      ? T('Downloaded ' + r.filename + ' — ' + r.total + ' records from ' + r.tables + ' kinds of data.', r.filename + ' をダウンロードしました（' + r.tables + ' 種類・' + r.total + ' 件）。')
      : failureText(r.error, lang);
  };
  try {
    if (window.IntMapDialog) window.IntMapDialog.open(m, { panel: sheet, labelledby: 'ydc-h', backdrop: true, close: shut });
    else document.body.appendChild(m);
  } catch (_) { document.body.appendChild(m); }
  try { sheet.focus(); } catch (_) { }

  const inv = await readInventory(HOST.DB);
  body.textContent = '';
  if (!inv.ok) { body.appendChild(el('p', { cls: 'ydc-lead', text: failureText(inv.error, lang) })); return; }
  const v = inventoryView(inv.rows, lang);
  body.appendChild(el('p', { cls: 'ydc-lead', text: T(v.total + ' records in ' + (v.you.length + v.intmap.length) + ' kinds of data.', (v.you.length + v.intmap.length) + ' 種類・' + v.total + ' 件のデータがあります。') }));
  if (v.you.length) {
    body.appendChild(el('div', { cls: 'acct-grp-t', text: T('What you created', 'あなたが作ったもの') }));
    body.appendChild(el('div', { cls: 'acct-card' }, v.you.map((i) => itemNode(i, lang))));
  }
  if (v.intmap.length) {
    body.appendChild(el('div', { cls: 'acct-grp-t', text: T('What IntMap recorded about your use', 'IntMap が利用について記録したもの') }));
    body.appendChild(el('div', { cls: 'acct-card' }, v.intmap.map((i) => itemNode(i, lang))));
  }
  if (v.none.length) {
    body.appendChild(el('div', { cls: 'acct-grp-t', text: T('Kinds of data you have none of', '保持していない種類') }));
    body.appendChild(el('div', { cls: 'acct-card' }, [el('div', { cls: 'ydc-none', text: v.none.map((i) => i.label).join(' · ') })]));
  }
}
