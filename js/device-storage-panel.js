/* ============================================================================
 *  IntMap · js/device-storage-panel.js — 「この端末に保存されているもの」: WHAT THIS BROWSER HOLDS FOR INTMAP,
 *  HELD AGAINST WHAT INTMAP SAYS IT KEEPS   (wave4-security)
 * ----------------------------------------------------------------------------
 *  The third of the reader's three questions about their own data, beside «what does the account hold»
 *  (js/account-data.js — the server) and «who has this page talked to» (js/connections-panel.js — the network):
 *  WHAT IS KEPT ON THIS DEVICE. The browser is asked, never a list: every localStorage and sessionStorage key,
 *  every IndexedDB database the browser will name, every Cache Storage cache and how many entries it holds, every
 *  cookie, and the browser's own estimate of how much the site uses. Each item is held against
 *  data/device-storage-ledger.json — derived by scripts/device-storage-ledger.mjs from EVERY storage write in the
 *  browser code, with what each name holds in the reader's words — and grouped by KIND, most personal first:
 *  sign-in and keys → what you made → a record of what you did → preferences → copies and housekeeping.
 *
 *  ⚠ VALUES ARE NEVER SHOWN AND NEVER EXPORTED. A key's value can be a sign-in token or an API key; the list says
 *  what the item IS, how big it is and who wrote it. The file the reader can download carries the same and no more.
 *  ⚠ «NOT NAMED» IS NOT «UNKNOWN TO THE READER». The site's address (its GitHub Pages host) is shared by every
 *  page the same account publishes, and a browser's storage belongs to the address, not to the app. A name IntMap's
 *  code does not write may be another page's — so «Forget this device» deletes only what the ledger names, and an
 *  unnamed item is deleted only by the reader's own tap on that item.
 *  ⚠ «COULD NOT READ» IS NOT «NOT NAMED» (.agents/rules/one-pass-or-a-reason.md §5): if the ledger cannot be fetched,
 *  nothing is called unnamed and nothing can be forgotten in bulk — the panel says it could not compare.
 *
 *  Reached from: Settings ▸ Privacy ▸ «Stored on this device» (js/connection-watch.js owns the group's one click
 *  listener) and Atlas (`system.deviceStorage`, js/atlas-cap-system.js — the summary as text; `show:true` opens this).
 *  On demand only. Words are en + jp (CONSTITUTION.md §7). No emoji: pictures are js/icons.js line icons.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';
import { iconNode } from './icons.js';
import * as bus from './bus.js';

/* where the derived ledger is shipped (scripts/device-storage-ledger.mjs OUT) */
const LEDGER_URL = './data/device-storage-ledger.json';
/* how long the page waits for its own origin's small file before saying it could not read it.
   OBSERVED: the same wait as js/connections-panel.js LEDGER_MS for a same-origin JSON of this order (~25 kB).
   EXPIRES: never in practice — it only separates slow from absent. */
const LEDGER_MS = 8000;

const docLang = () => { try { return IntMapLang.normalise(document.documentElement.lang || 'en'); } catch (_) { return 'en'; } };
const isJp = (lang) => lang === 'jp' || lang === 'ja';
const LA = IntMapLang.pickArgs();

/* ══ THE KINDS, IN THE READER'S WORDS — one row per scripts/device-storage-ledger.mjs KINDS, in its order (most personal
   first). tests/wave4-security-checks.test.mjs holds the keys to the ledger's `kinds`, so a kind added there without
   words here is a red test, not a heading that prints the code. Each row: heading, what deleting it means. */
export const KIND_WORDS = Object.freeze({
  credential: [LA('Sign-in and keys', 'ログインとキー'), LA('Anyone with this browser can use these. Delete them on a shared or borrowed computer.', 'このブラウザを使える人なら誰でも使えます。共用・借用の端末では消してください。'), 'lock'],
  content: [LA('What you made', 'あなたが作ったもの'), LA('Kept only here unless you saved it to your account. Deleting it cannot be undone.', 'アカウントに保存していない限り、ここにしかありません。消すと元に戻せません。'), 'pencil'],
  history: [LA('A record of what you did here', 'ここでの操作の記録'), LA('Lets IntMap pick up where you left off. Nothing is lost by deleting it.', 'IntMap が続きから始めるためのものです。消しても失われるものはありません。'), 'clock'],
  preference: [LA('Your preferences', '設定'), LA('Deleting one returns that setting to its default.', '消すとその設定は既定値に戻ります。'), 'gear'],
  cache: [LA('Copies and housekeeping', '写しと内部の記録'), LA('Rebuilt by itself when needed. Deleting them frees space; the next visit is slower.', '必要になれば自動で作り直します。消すと容量が空き、次回の表示は遅くなります。'), 'save'],
});
const KIND_ORDER = Object.keys(KIND_WORDS);
const AREA_WORDS = Object.freeze({
  local: LA('kept until deleted', '消すまで保持'), session: LA('this tab only', 'このタブだけ'),
  idb: LA('database', 'データベース'), cache: LA('file store', 'ファイル保存領域'), cookie: LA('cookie', 'Cookie'),
});

/* ── pure: names, matching, judging (tests/wave4-security-checks.test.mjs runs these in Node) ─────────── */

/** does the stored name `key` match the ledger name `glob` (`*` is any run of characters, the empty run included)? */
export function globMatch(glob, key) {
  const parts = String(glob).split('*'), k = String(key);
  if (parts.length === 1) return glob === k;
  if (!k.startsWith(parts[0])) return false;
  let at = parts[0].length;
  for (let i = 1; i < parts.length - 1; i++) { const j = k.indexOf(parts[i], at); if (j < 0) return false; at = j + parts[i].length; }
  const last = parts[parts.length - 1];
  return k.length - last.length >= at && k.endsWith(last);
}

/** the ledger row that names a stored item: the exact name first, then the longest pattern of the same area */
export function rowFor(ledger, area, name) {
  const rows = (ledger && Array.isArray(ledger.names)) ? ledger.names : [];
  let best = null;
  for (const r of rows) {
    if (r.area !== area) continue;
    if (r.name === name) return r;
    if (r.name.includes('*') && globMatch(r.name, name) && (!best || r.name.length > best.name.length)) best = r;
  }
  return best;
}

/** Each observed item, judged. @returns {{ comparable, kinds:{kind,items}[], unnamed, unread, totals }} */
export function judge(seen, ledger) {
  const comparable = !!(ledger && Array.isArray(ledger.names));
  const items = (seen && Array.isArray(seen.items)) ? seen.items : [];
  const by = new Map(), unnamed = [], unread = [];
  for (const it of items) {
    if (!comparable) { unread.push({ ...it, row: null }); continue; }
    const row = rowFor(ledger, it.area, it.name);
    if (!row || !KIND_WORDS[row.kind]) { unnamed.push({ ...it, row: null }); continue; }
    if (!by.has(row.kind)) by.set(row.kind, []);
    by.get(row.kind).push({ ...it, row });
  }
  const bySize = (a, b) => (b.bytes || 0) - (a.bytes || 0) || a.name.localeCompare(b.name);
  const kinds = KIND_ORDER.filter((k) => by.has(k)).map((kind) => ({ kind, items: by.get(kind).sort(bySize) }));
  const sum = (list) => list.reduce((s, i) => s + (i.bytes || 0), 0);
  return {
    comparable, kinds, unnamed: unnamed.sort(bySize), unread: unread.sort(bySize),
    totals: {
      items: items.length,
      named: kinds.reduce((s, g) => s + g.items.length, 0),
      unnamed: unnamed.length,
      bytesListed: sum(items),
      byKind: Object.fromEntries(kinds.map((g) => [g.kind, g.items.length])),
      cookies: items.filter((i) => i.area === 'cookie').length,
    },
  };
}

/** the items «Forget this device» deletes — only those the ledger names (the address is shared: see the header) */
export function forgettable(judged) {
  return judged && judged.comparable ? judged.kinds.flatMap((g) => g.items) : [];
}

const kb = (n, lang) => {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  const v = n / 1024;
  if (v < 1024) return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' kB';
  const m = v / 1024;
  return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' MB';
};

/** The page as a model (headline, tone, sections of rows) — what render() draws and describe() reads as text. */
export function compose(seen, ledger, lang) {
  const T = IntMapLang.pick(() => lang);
  const J = judge(seen, ledger), N = J.totals, s = seen || {};
  const sections = [];
  const sizeText = (it) => (it.entries != null
    ? T(it.entries + (it.entries === 1 ? ' entry' : ' entries'), it.entries + ' 件')
    : (it.bytes != null ? kb(it.bytes, lang) : T('size not reported by the browser', 'ブラウザが大きさを報告しません')));
  const itemRow = (it, tone, icon, words, extra) => {
    const bits = [];
    if (words) bits.push(words);
    bits.push(sizeText(it) + ' · ' + T(...AREA_WORDS[it.area]));
    if (extra) bits.push(extra);
    return {
      tone, icon, title: it.name,
      detail: bits.join(' — '), area: it.area, name: it.name, kind: it.row ? it.row.kind : null,
      signsOut: !!(it.row && it.row.signsOut),
    };
  };
  const wordsOf = (row) => (row ? ((isJp(lang) && row.jp) || row.en || '') : '');
  if (J.unnamed.length) sections.push({
    id: 'unnamed', title: T('Not named in IntMap\'s list', 'IntMap の一覧に名前の無いもの'),
    note: T('IntMap\'s code does not write these names. This site\'s address is shared by every page the same GitHub account publishes, so some may belong to another of those pages; an older version of IntMap may have left others. «Forget this device» leaves them alone — delete one yourself only if you know it is IntMap\'s.',
      'IntMap のコードはこれらの名前を書きません。このサイトのアドレスは同じ GitHub アカウントが公開するすべてのページと共有されているため、他のページのものである場合があります。古い版の IntMap が残したものもありえます。「この端末から消去」はこれらに触れません — IntMap のものと分かる場合だけ、個別に消してください。'),
    rows: J.unnamed.map((it) => itemRow(it, 'warn', 'question', '')),
  });
  if (!J.comparable && J.unread.length) sections.push({
    id: 'unread', title: T('Stored (could not be compared)', '保存されているもの（照合できませんでした）'),
    rows: J.unread.map((it) => itemRow(it, 'muted', 'dot', '')),
  });
  for (const g of J.kinds) {
    const [head, note, icon] = KIND_WORDS[g.kind];
    sections.push({
      id: 'kind-' + g.kind, kind: g.kind, title: T(...head), note: T(...note),
      rows: g.items.map((it) => itemRow(it, g.kind === 'credential' ? 'bad' : 'ok', icon, wordsOf(it.row),
        it.row.signsOut ? T('Log out to remove it (Account ▸ Log out).', 'ログアウトすると消えます（アカウント ▸ ログアウト）。') : '')),
    });
  }
  /* what this list can and cannot see — always shown, so a short list is never mistaken for a complete one */
  const cov = s.coverage || {};
  const cv = [];
  cv.push({ tone: cov.storage ? 'ok' : 'warn', icon: cov.storage ? 'check-circle' : 'warning', title: T('Local and tab storage', 'ローカル・タブの保存領域'),
    detail: cov.storage ? T('every key, read from the browser', 'すべてのキーをブラウザから読みました') : T('this browser refused to let the page read it', 'このブラウザはページに読ませませんでした') });
  cv.push({ tone: cov.idb === 'listed' ? 'ok' : 'warn', icon: cov.idb === 'listed' ? 'check-circle' : 'warning', title: T('Databases (IndexedDB)', 'データベース（IndexedDB）'),
    detail: cov.idb === 'listed' ? T('named by the browser; their sizes are counted only in the total below', 'ブラウザが名前を報告。大きさは下の合計にだけ含まれます')
      : T('this browser does not list them, so databases are missing from this list', 'このブラウザは一覧を返さないため、データベースはこの一覧にありません') });
  cv.push({ tone: cov.caches ? 'ok' : 'warn', icon: cov.caches ? 'check-circle' : 'warning', title: T('File stores (Cache Storage)', 'ファイル保存領域（Cache Storage）'),
    detail: cov.caches ? T('every store and how many files it holds', 'すべての保存領域と、その中のファイル数') : T('not available to this page', 'このページからは使えません') });
  cv.push({ tone: 'ok', icon: 'check-circle', title: T('Cookies', 'Cookie'),
    detail: N.cookies ? T(N.cookies + ' readable by this page', 'このページから読めるもの ' + N.cookies + ' 件') : T('none — IntMap\'s code sets no cookies', 'なし — IntMap のコードは Cookie を設定しません') });
  if (s.estimate && s.estimate.usage != null) cv.push({ tone: 'muted', icon: 'gauge', title: T('Total the browser reports for this site', 'このサイトについてブラウザが報告する合計'),
    detail: kb(s.estimate.usage, lang) + (s.estimate.quota ? T(' of ' + kb(s.estimate.quota, lang) + ' allowed', '（上限 ' + kb(s.estimate.quota, lang) + '）') : '')
      + (s.persisted === true ? T(' · kept even when space runs low', ' · 容量が減っても保持') : s.persisted === false ? T(' · the browser may clear it when space runs low', ' · 容量が減るとブラウザが消すことがあります') : '') });
  cv.push({ tone: 'muted', icon: 'eye-off', title: T('Values are never shown', '中身は表示しません'),
    detail: T('the list says what each item is, never what it contains — a key can hold a sign-in token', '一覧は各項目が何かを示すだけで、中身は表示しません — キーにはログインのトークンが入っていることがあります') });
  sections.push({ id: 'coverage', title: T('What this list can see', 'この一覧に見えるもの'), rows: cv });

  const credentials = (J.totals.byKind.credential || 0);
  const tone = !J.comparable || J.unnamed.length ? 'warn' : credentials ? 'bad' : 'ok';
  const n = N.items;
  const headline = !J.comparable
    ? T(n + (n === 1 ? ' item' : ' items') + ' stored — IntMap\'s list could not be read to compare', n + ' 件を保存 — IntMap の一覧を読めず照合できませんでした')
    : credentials
      ? T(n + (n === 1 ? ' item' : ' items') + ' stored here — ' + credentials + ' can sign in or use a key', 'この端末に ' + n + ' 件 — うち ' + credentials + ' 件はログインやキーとして使えます')
      : J.unnamed.length
        ? T(n + (n === 1 ? ' item' : ' items') + ' stored here — ' + J.unnamed.length + ' not named in IntMap\'s list', 'この端末に ' + n + ' 件 — ' + J.unnamed.length + ' 件は IntMap の一覧に名前がありません')
        : T(n + (n === 1 ? ' item' : ' items') + ' stored here — every one is in IntMap\'s list', 'この端末に ' + n + ' 件 — すべて IntMap の一覧どおりです');
  const sub = T(kb(N.bytesListed, lang) + ' in the items whose size the browser reports · nothing here is sent anywhere by this list',
    '大きさを報告する項目の合計 ' + kb(N.bytesListed, lang) + ' · この一覧はどこにも送信しません');
  return { tone, headline, sub, sections, totals: N, comparable: J.comparable, judged: J };
}

/** The whole record as a file the reader keeps — names, kinds, words, sizes. NEVER a value. */
export function reportDocument(seen, ledger) {
  const J = judge(seen, ledger);
  const item = (i) => {
    const o = { area: i.area, name: i.name };
    if (i.bytes != null) o.bytes = i.bytes;
    if (i.entries != null) o.entries = i.entries;
    if (i.row) o.statement = { name: i.row.name, kind: i.row.kind, en: i.row.en, jp: i.row.jp, writtenBy: i.row.by };
    return o;
  };
  return {
    format: 'intmap-device-storage', version: 1,
    page: (typeof location !== 'undefined') ? location.origin + location.pathname : '',
    observedAt: new Date((seen && seen.at) || Date.now()).toISOString(),
    statement: J.comparable ? (ledger.src || LEDGER_URL) : null,
    coverage: (seen && seen.coverage) || {}, estimate: (seen && seen.estimate) || null, persisted: seen ? seen.persisted : null,
    totals: J.totals,
    kinds: J.kinds.map((g) => ({ kind: g.kind, items: g.items.map(item) })),
    unnamed: J.unnamed.map(item), unread: J.unread.map(item),
    valuesIncluded: false,
  };
}

/* ── the browser, asked ────────────────────────────────────────────────────────────────────────── */
/** Every item the browser holds for this address. Never reads a value except to measure it. */
export async function observe() {
  const items = [], coverage = { storage: false, idb: 'unsupported', caches: false };
  for (const [area, get] of [['local', () => localStorage], ['session', () => sessionStorage]]) {
    try {
      const st = get();
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i); if (k == null) continue;
        const v = st.getItem(k) || '';
        /* UTF-16: two bytes a character, the way browsers count the storage allowance */
        items.push({ area, name: k, bytes: 2 * (k.length + v.length) });
      }
      coverage.storage = true;
    } catch (_) { /* storage refused: coverage says so */ }
  }
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const d of dbs || []) if (d && d.name) items.push({ area: 'idb', name: d.name, bytes: null });
      coverage.idb = 'listed';
    }
  } catch (_) { coverage.idb = 'refused'; }
  try {
    if (typeof caches !== 'undefined' && caches) {
      for (const listed of await caches.keys()) {
        let entries = null;
        try { entries = (await (await caches.open(listed)).keys()).length; } catch (_) { entries = null; }
        items.push({ area: 'cache', name: listed, bytes: null, entries });
      }
      coverage.caches = true;
    }
  } catch (_) { coverage.caches = false; }
  try {
    for (const c of String(document.cookie || '').split(';')) {
      const k = c.split('=')[0].trim(); if (k) items.push({ area: 'cookie', name: k, bytes: c.trim().length });
    }
  } catch (_) { /* no document */ }
  let estimate = null, persisted = null;
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); estimate = { usage: e.usage, quota: e.quota }; } } catch (_) { /* not reported */ }
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (_) { /* not reported */ }
  return { at: Date.now(), items, coverage, estimate, persisted };
}

/** delete one item; resolves true when the browser says it is gone. A cookie is not deleted from here: IntMap's code
    sets none, so any cookie the page can read is another page's on the shared address, and the browser's own site
    settings are where a reader removes it. */
async function forget(it) {
  try {
    if (it.area === 'local') { localStorage.removeItem(it.name); return localStorage.getItem(it.name) == null; }
    if (it.area === 'session') { sessionStorage.removeItem(it.name); return sessionStorage.getItem(it.name) == null; }
    if (it.area === 'cache') return await caches.delete(it.name);
    if (it.area === 'idb') {
      return await new Promise((res) => {
        const rq = indexedDB.deleteDatabase(it.name);
        rq.onsuccess = () => res(true); rq.onerror = () => res(false);
        /* a page holds it open — this one (the module that uses it keeps its connection) or another IntMap tab. The request
           is not lost: the browser deletes the database the moment the last connection closes, which a reload does for
           this page. MEASURED (2026-10-13, Chromium): the dashboard cache 'intmap' answers blocked in 1 ms. */
        rq.onblocked = () => res('blocked');
      });
    }
  } catch (_) { /* refused */ }
  return false;
}

/* ── the statement, once per page ─────────────────────────────────────────────────────────────── */
let ledgerP = null;
/** the derived ledger, or { unreadable: why } — never throws; asked again only after a failure */
export function loadLedger() {
  if (!ledgerP) {
    ledgerP = jsonWithin(LEDGER_URL, LEDGER_MS)
      .then((b) => (b && Array.isArray(b.names) ? b : { unreadable: 'shape' }))
      .catch((e) => ({ unreadable: (e && e.reason) || 'failed' }));
    ledgerP.then((b) => { if (b.unreadable) ledgerP = null; });
  }
  return ledgerP;
}

/** The page as text and facts — what Atlas reads. Never opens or deletes anything. */
export async function describe(langIn) {
  const lang = langIn || docLang();
  const L = await loadLedger();
  const seen = await observe();
  const m = compose(seen, L.unreadable ? null : L, lang);
  const lines = [m.headline, m.sub];
  for (const s of m.sections) {
    lines.push('', s.title);
    for (const r of s.rows) lines.push('- ' + r.title + (r.detail ? ' — ' + r.detail : ''));
  }
  const J = m.judged;
  return {
    text: lines.join('\n'), model: m,
    facts: {
      items: m.totals.items, comparable: m.comparable, bytesListed: m.totals.bytesListed, byKind: m.totals.byKind,
      credentials: (J.kinds.find((g) => g.kind === 'credential') || { items: [] }).items.map((i) => i.name),
      unnamed: J.unnamed.map((i) => ({ area: i.area, name: i.name })),
      cookies: m.totals.cookies, coverage: seen.coverage, estimate: seen.estimate, persisted: seen.persisted,
    },
  };
}

/* ── the page ────────────────────────────────────────────────────────────────────────────────── */
const CSS = `
#im-dev .modal-content{ width:min(580px,94vw); max-width:none; padding:22px 20px 18px; position:relative; }
#im-dev .imd-head{ display:flex; align-items:center; gap:12px; margin:0 40px 14px 0; }
#im-dev .imd-badge{ width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; color:#fff; background:var(--imd-tone); }
#im-dev .imd-badge svg{ width:22px; height:22px; }
#im-dev h3{ margin:0; font-size:17px; line-height:1.3; }
#im-dev .imd-sub{ margin:3px 0 0; font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
#im-dev .imd-sec{ margin:14px 0 0; }
#im-dev .imd-sec h4{ margin:0 0 6px 4px; font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--text-muted); }
#im-dev .imd-note{ margin:0 4px 8px; font-size:12px; line-height:1.5; color:var(--text-muted); }
#im-dev .imd-group{ border-radius:14px; background:rgba(128,128,128,0.09); overflow:hidden; }
#im-dev .imd-row{ display:flex; gap:10px; padding:10px 8px 10px 14px; min-height:44px; box-sizing:border-box; align-items:flex-start; }
#im-dev .imd-row + .imd-row{ border-top:1px solid rgba(128,128,128,0.16); }
#im-dev .imd-ic{ flex:0 0 auto; width:18px; height:18px; margin-top:1px; color:var(--imd-tone); }
#im-dev .imd-ic svg{ width:18px; height:18px; }
#im-dev .imd-body{ flex:1 1 auto; min-width:0; }
#im-dev .imd-t{ font-size:13px; line-height:1.35; color:var(--text-main); overflow-wrap:anywhere; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
#im-dev .imd-d{ font-size:12.5px; line-height:1.45; color:var(--text-muted); margin-top:2px; overflow-wrap:anywhere; }
#im-dev .imd-del{ flex:0 0 auto; min-width:44px; min-height:44px; margin:-10px 0; border:none; background:transparent; color:var(--text-muted); border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; }
#im-dev .imd-del svg{ width:18px; height:18px; }
#im-dev .imd-del[data-armed="1"]{ color:#fff; background:var(--widget-danger,#ff3b30); padding:0 10px; }
#im-dev .imd-del:focus-visible{ outline:2px solid var(--accent,#0a84ff); outline-offset:-2px; }
#im-dev [data-tone="ok"]{ --imd-tone:#34c759; }
#im-dev [data-tone="warn"]{ --imd-tone:var(--widget-warning,#ff9f0a); }
#im-dev [data-tone="bad"]{ --imd-tone:var(--widget-danger,#ff3b30); }
#im-dev [data-tone="muted"]{ --imd-tone:var(--text-muted); }
#im-dev details.imd-sec > summary{ cursor:pointer; list-style:none; margin:0 0 6px 4px; font-size:12px; font-weight:600; color:var(--text-muted); min-height:32px; display:flex; align-items:center; gap:6px; }
#im-dev details.imd-sec > summary::-webkit-details-marker{ display:none; }
#im-dev details.imd-sec > summary::after{ content:''; width:7px; height:7px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); transition:transform .2s; }
#im-dev details.imd-sec[open] > summary::after{ transform:rotate(45deg); }
#im-dev details.imd-sec > summary b{ font-weight:600; color:var(--text-main); font-variant-numeric:tabular-nums; }
#im-dev .imd-foot{ display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
#im-dev .imd-foot .ai-test-btn{ flex:1 1 150px; min-height:44px; display:flex; align-items:center; justify-content:center; text-decoration:none; box-sizing:border-box; }
#im-dev .imd-foot .imd-forget[data-armed="1"]{ background:var(--widget-danger,#ff3b30); color:#fff; border-color:transparent; }
#im-dev .imd-msg{ margin:8px 4px 0; font-size:12px; color:var(--text-muted); min-height:1em; }
@media (forced-colors: active){ #im-dev .imd-badge{ border:1px solid CanvasText; } }
`;
function ensureCSS() {
  if (document.getElementById('im-dev-css')) return;
  const st = document.createElement('style'); st.id = 'im-dev-css'; st.textContent = CSS; document.head.appendChild(st);
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const pic = (name) => { try { return iconNode(name); } catch (_) { return document.createTextNode(''); } };

/* A destructive tap asks twice, in place: the first arms the button (it says what it will do), the second does it.
   An armed button disarms by itself after ARM_MS. OBSERVED by eye, not measured: four seconds is long enough to read
   «Delete?» and tap again, short enough that a stray tap later does nothing. */
const ARM_MS = 4000;
function twoStep(btn, armedLabel, run) {
  let t = 0;
  const rest = [...btn.childNodes].map((n) => n.cloneNode(true)), restLabel = btn.getAttribute('aria-label');
  const disarm = () => { btn.dataset.armed = '0'; btn.replaceChildren(...rest.map((n) => n.cloneNode(true))); if (restLabel) btn.setAttribute('aria-label', restLabel); };
  btn.addEventListener('click', async () => {
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1'; btn.textContent = armedLabel; btn.setAttribute('aria-label', armedLabel);
      t = setTimeout(disarm, ARM_MS);
      return;
    }
    clearTimeout(t); btn.disabled = true;
    await run();
  });
}

let lastLedger = null, lastSeen = null;
function message(text) { const m = document.querySelector('#im-dev .imd-msg'); if (m) m.textContent = text; }

function rowNode(r, lang) {
  const T = IntMapLang.pick(() => lang);
  const row = el('div', 'imd-row'); row.dataset.tone = r.tone || 'muted'; row.setAttribute('role', 'listitem');
  if (r.area) { row.dataset.area = r.area; row.dataset.name = r.name; }
  const ic = el('span', 'imd-ic'); ic.setAttribute('aria-hidden', 'true'); ic.appendChild(pic(r.icon || 'dot'));
  const body = el('div', 'imd-body');
  body.appendChild(el('div', 'imd-t', r.title));
  if (r.detail) body.appendChild(el('div', 'imd-d', r.detail));
  row.append(ic, body);
  /* every stored item can be deleted from here — except the sign-in, which is removed by logging out (deleting the key
     under a live sign-in client is undone by the client's next token refresh) */
  if (r.area && r.area !== 'cookie' && !r.signsOut) {
    const del = el('button', 'imd-del'); del.type = 'button';
    del.setAttribute('aria-label', T('Delete ' + r.name, r.name + ' を消す'));
    del.appendChild(pic('trash'));
    twoStep(del, T('Delete?', '削除する？'), async () => {
      const ok = await forget({ area: r.area, name: r.name });
      await refresh();
      message(ok === 'blocked' ? T('IntMap is using this database right now; the browser deletes it as soon as IntMap is reloaded or its other tabs close.', 'IntMap がこのデータベースを使用中です。IntMap を再読み込みするか、他のタブを閉じると、ブラウザが消去します。')
        : ok ? T('Deleted ' + r.name + '. IntMap writes an item again only when a feature needs it.', r.name + ' を消しました。IntMap は機能が必要としたときにだけ再び書き込みます。')
          : T('The browser did not delete ' + r.name + '.', 'ブラウザは ' + r.name + ' を消しませんでした。'));
    });
    row.appendChild(del);
  }
  return row;
}
const HEAD_ICON = { ok: 'shield', warn: 'warning', bad: 'lock' };
/* the sections that need attention never fold; the rest do (a reader looks for the unusual first) */
const FOLDS = (id) => id !== 'unnamed' && id !== 'kind-credential' && id !== 'unread';

function render(root, m, lang) {
  const T = IntMapLang.pick(() => lang);
  const panel = root.querySelector('.modal-content');
  const keepScroll = panel.scrollTop;
  const opened = new Set([...panel.querySelectorAll('details.imd-sec[open]')].map((d) => d.dataset.sec));
  const msgText = (panel.querySelector('.imd-msg') || {}).textContent || '';
  panel.replaceChildren();
  const x = el('button', 'imd-x'); x.type = 'button'; x.setAttribute('aria-label', T('Close', '閉じる'));
  x.style.cssText = 'position:absolute;top:12px;right:12px;width:44px;height:44px;border:none;background:transparent;color:var(--text-muted);font-size:22px;cursor:pointer;';
  x.textContent = '×'; x.addEventListener('click', close);
  const head = el('div', 'imd-head'); head.dataset.tone = m.tone;
  const badge = el('div', 'imd-badge'); badge.setAttribute('aria-hidden', 'true'); badge.appendChild(pic(HEAD_ICON[m.tone] || 'shield'));
  const hb = el('div', '');
  const h = el('h3', '', m.headline); h.id = 'im-dev-title';
  hb.append(h, el('p', 'imd-sub', m.sub));
  head.append(badge, hb);
  panel.append(x, head);
  for (const s of m.sections) {
    const fold = FOLDS(s.id);
    const box = el(fold ? 'details' : 'section', 'imd-sec'); box.dataset.sec = s.id;
    if (fold && opened.has(s.id)) box.open = true;
    const h4 = el(fold ? 'summary' : 'h4', '');
    h4.id = 'imd-h-' + s.id;
    if (fold) { h4.append(document.createTextNode(s.title + ' ')); if (s.id !== 'coverage') h4.appendChild(el('b', '', String(s.rows.length))); }
    else { h4.textContent = s.title; box.setAttribute('aria-labelledby', h4.id); }
    box.appendChild(h4);
    if (s.note) box.appendChild(el('p', 'imd-note', s.note));
    const g = el('div', 'imd-group'); g.setAttribute('role', 'list');
    for (const r of s.rows) g.appendChild(rowNode(r, lang));
    box.appendChild(g);
    panel.appendChild(box);
  }
  const foot = el('div', 'imd-foot');
  const all = forgettable(m.judged);
  if (all.length) {
    const fg = el('button', 'ai-test-btn imd-forget', T('Forget this device', 'この端末から消去'));
    fg.type = 'button'; fg.id = 'imd-forget-all';
    twoStep(fg, T('Delete ' + all.length + ' items and reload?', all.length + ' 件を消して再読み込みしますか？'), async () => {
      const left = [];
      /* 'blocked' is a deletion the browser has accepted and finishes when this page lets go — which the reload below does */
      for (const it of all) { const ok = await forget(it); if (ok !== true && ok !== 'blocked') left.push(it.name); }
      message(left.length ? T('Could not delete: ' + left.join(', '), '消せなかったもの: ' + left.join(', ')) : T('Deleted. IntMap is reloading, signed out and with its defaults.', '消しました。IntMap をログアウトした既定の状態で再読み込みします。'));
      /* the running page still holds settings and a sign-in in memory and would write them back; a reload starts clean */
      if (!left.length) setTimeout(() => { try { location.reload(); } catch (_) { /* the message stands */ } }, 600);
    });
    foot.appendChild(fg);
  }
  const dl = el('button', 'ai-test-btn', T('Download this list (JSON)', 'この一覧をダウンロード（JSON）'));
  dl.type = 'button'; dl.id = 'imd-download';
  dl.addEventListener('click', () => {
    const r = download();
    message(r ? T('Saved ' + r + ' to this device — names and sizes only, no contents; nothing was sent.', r + ' をこの端末に保存しました（名前と大きさだけで中身は含みません。どこにも送信していません）。') : T('Could not save the file.', 'ファイルを保存できませんでした。'));
  });
  const pol = el('button', 'ai-test-btn', T('Privacy Policy', 'プライバシーポリシー'));
  pol.type = 'button';
  /* the in-app policy is opened through its own link (js/legal.js owns that handler); a page without it gets the public page */
  pol.addEventListener('click', () => { const lp = document.getElementById('link-privacy'); if (lp) { close(); lp.click(); return; } window.open('./privacy.html', '_blank', 'noopener'); });
  foot.append(dl, pol);
  panel.appendChild(foot);
  panel.appendChild(el('p', 'imd-msg', msgText));
  panel.scrollTop = keepScroll;
}

function download() {
  try {
    const doc = reportDocument(lastSeen, lastLedger);
    const name = 'intmap-device-storage-' + new Date(lastSeen.at).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { /* nothing to revoke */ } }, 30000);
    return name;
  } catch (_) { return ''; }
}

async function refresh() {
  const root = document.getElementById('im-dev');
  if (!root || root.style.display === 'none') return;
  lastSeen = await observe();
  const lang = docLang();
  render(root, compose(lastSeen, lastLedger, lang), lang);
}

/** open the list; resolves once it is drawn */
export async function open() {
  ensureCSS();
  let root = document.getElementById('im-dev');
  if (!root) {
    root = el('div', 'modal-overlay'); root.id = 'im-dev';
    const panel = el('div', 'modal-content'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'im-dev-title'); panel.setAttribute('aria-busy', 'true');
    const T = IntMapLang.pick(docLang);
    panel.appendChild(el('p', 'imd-sub', T('Reading…', '確認しています…')));
    root.appendChild(panel); document.body.appendChild(root);
    try { window.IntMapDialog.adopt(root, { panel, labelledby: 'im-dev-title', backdrop: true, close }); } catch (_) { /* no registry: Escape and the trap are lost, the list is not */ }
  }
  root.style.display = 'flex';
  const L = await loadLedger();
  lastLedger = L.unreadable ? null : L;
  await refresh();
  root.querySelector('.modal-content').removeAttribute('aria-busy');
  return root;
}
export function close() { const r = document.getElementById('im-dev'); if (r) r.style.display = 'none'; }
export function shown() { const r = document.getElementById('im-dev'); return !!r && r.style.display !== 'none'; }
/* the language changes the words, not the facts; another tab writing or deleting changes the facts */
try { bus.on('intmap-lang', () => { if (shown()) refresh(); }); } catch (_) { /* headless */ }
try { window.addEventListener('storage', () => { if (shown()) refresh(); }); } catch (_) { /* headless */ }
