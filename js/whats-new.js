/* ============================================================================
 *  IntMap · js/whats-new.js — 「新着」: WHAT CHANGED IN INTMAP, IN THE APP   (ops-next)
 * ----------------------------------------------------------------------------
 *  The entries are whats-new.json, written when the site is built by scripts/whats-new.mjs from the
 *  reader's lines (`newsen` / `newsjp`) of the records every merge writes (dev-notes/). Nothing here is
 *  typed by hand, and nothing is said that no record says.
 *
 *  THREE READERS, ONE MODEL:
 *    · the page — Settings ▸ 「新着」 (index.html #btn-whats-new), `whatsNew.open()` (js/layer-state.js keeps
 *      the handle eager; this module is fetched when first used);
 *    · the unread mark on that button — counted the first time the button is on screen (an
 *      IntersectionObserver, so nothing is fetched at start-up), against the ids this device has seen;
 *    · Atlas — `system.whatsNew` (js/atlas-cap-system.js) reads `entries()` and can open the page.
 *
 *  ⚠ «UNREAD» IS «NOT YET SHOWN ON THIS DEVICE». The first time this device reads the list there is nothing
 *  to compare with, so every entry then present is recorded as seen and no mark is drawn — a mark of 40 on a
 *  first visit would be noise, not news. From then on, an entry the device has not shown is unread until the
 *  page is opened. The ids live in localStorage under one key and are pruned to the ids the list still has.
 *  Words are en + jp (CONSTITUTION.md §7). No emoji: pictures are js/icons.js line icons.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';
import { iconNode } from './icons.js';
import * as bus from './bus.js';
import { hubHref } from './weekly-earth.js';   /* (weekly-earth) the weekly digest's pages, one more way back to IntMap */

/* where the build writes the list (scripts/whats-new.mjs JSON_PATH) */
const LIST_URL = './whats-new.json';
/* OBSERVED: a same-origin JSON of ~15 kB (40 entries on 2026-10-03). EXPIRES: never in practice — it only
   separates 「slow」 from 「not there」. CANON: this constant (js/service-status.js waits the same for its own). */
const LIST_MS = 8000;
const SEEN_KEY = 'intmap-whats-new-seen';
const SCHEMA = 'intmap-whats-new/1';

const docLang = () => { try { return IntMapLang.normalise(document.documentElement.lang || 'en'); } catch (_) { return 'en'; } };

let listP = null;
/** the list, or { unreadable: why } — never throws; asked again only after a failure */
export function load() {
  if (!listP) {
    listP = jsonWithin(LIST_URL, LIST_MS).then((b) => (b && b.schema === SCHEMA && Array.isArray(b.entries) ? b : { unreadable: 'parse' }),
      (e) => { listP = null; return { unreadable: (e && e.reason) || 'network' }; });
  }
  return listP;
}

/* ── the pure parts (tests/ops-next-checks.test.mjs evaluates them) ─────────────────────────── */

/** the entries in this reader's language: [{ id, date, text, pr, url }] newest first; `since` (YYYY-MM-DD) and `limit` narrow it */
export function entriesIn(list, lang, { since, limit } = {}) {
  const all = (list && Array.isArray(list.entries) ? list.entries : [])
    .filter((e) => e && e.id && e.date && (!since || e.date >= since))
    .map((e) => ({ id: e.id, date: e.date, text: (lang === 'jp' ? e.jp : e.en) || e.en || e.jp || '', pr: e.pr || null, url: e.url || null }));
  return Number.isInteger(limit) && limit > 0 ? all.slice(0, limit) : all;
}

/** which entries are unread, given the ids already seen (null = this device has never looked) */
export function unreadOf(list, seen) {
  if (!Array.isArray(seen)) return [];
  const s = new Set(seen);
  return ((list && list.entries) || []).filter((e) => e && e.id && !s.has(e.id)).map((e) => e.id);
}

/** the seen set after a look: every current id (pruned to what the list still has) */
export function seenAfter(list) { return ((list && list.entries) || []).filter((e) => e && e.id).map((e) => e.id); }

/* ── this device's record of what it has shown ─────────────────────────────────────────────── */
function readSeen() { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch (_) { return null; } }
function writeSeen(ids) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch (_) { /* private mode: the mark just cannot be remembered */ } }

/** how many entries are unread on this device; the first look records a baseline and answers 0 */
async function unreadCount() {
  const list = await load();
  if (list.unreadable) return 0;
  const seen = readSeen();
  if (!seen) { writeSeen(seenAfter(list)); return 0; }
  return unreadOf(list, seen).length;
}

/* ── the mark on the Settings button ─────────────────────────────────────────────────────────── */
export async function paintMark(btn) {
  if (!btn) return;
  const n = await unreadCount();
  let m = btn.querySelector('.wn-mark');
  if (!n) { if (m) m.remove(); btn.removeAttribute('data-unread'); return; }
  ensureCSS();
  if (!m) { m = document.createElement('span'); m.className = 'wn-mark'; btn.appendChild(m); }
  m.textContent = String(n);
  m.setAttribute('aria-label', IntMapLang.t(docLang(), n + ' new', n + ' 件の新着'));
  btn.setAttribute('data-unread', String(n));
}

/* ── for Atlas (`system.whatsNew`) ─────────────────────────────────────────────────────────────── */
export async function describe({ since, limit, lang } = {}) {
  const L = lang || docLang();
  const list = await load();
  if (list.unreadable) return { ok: false, reason: list.unreadable, entries: [], text: IntMapLang.t(L, 'The list of changes could not be read.', '更新情報を読めませんでした。') };
  const rows = entriesIn(list, L, { since, limit });
  const unread = new Set(unreadOf(list, readSeen()));
  return { ok: true, entries: rows.map((r) => Object.assign({ unread: unread.has(r.id) }, r)), total: list.entries.length,
    text: rows.map((r) => r.date + ' — ' + r.text + (r.pr ? ' (#' + r.pr + ')' : '')).join('\n') };
}

/* ── the page ────────────────────────────────────────────────────────────────────────────────── */
const CSS = `
#im-whats-new .modal-content{ width:min(560px,94vw); max-width:none; padding:22px 20px 18px; max-height:86vh; overflow:auto; }
#im-whats-new .wn-head{ display:flex; align-items:center; gap:12px; margin:0 34px 6px 0; }
#im-whats-new .wn-badge{ width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; color:#fff; background:var(--primary-color,#0a84ff); }
#im-whats-new .wn-badge svg{ width:22px; height:22px; }
#im-whats-new h3{ margin:0; font-size:18px; line-height:1.25; }
#im-whats-new .wn-sub{ margin:2px 0 0; font-size:12px; color:var(--text-muted); }
#im-whats-new .wn-day{ margin:16px 0 0; }
#im-whats-new .wn-day h4{ margin:0 0 6px 4px; font-size:12px; font-weight:600; letter-spacing:.02em; text-transform:uppercase; color:var(--text-muted); }
#im-whats-new .wn-group{ border-radius:14px; background:rgba(128,128,128,0.09); overflow:hidden; margin:0; padding:0; list-style:none; }
#im-whats-new .wn-row{ padding:11px 14px; min-height:44px; box-sizing:border-box; font-size:14px; line-height:1.45; color:var(--text-main); }
#im-whats-new .wn-row + .wn-row{ border-top:1px solid rgba(128,128,128,0.16); }
#im-whats-new .wn-row[data-unread]{ box-shadow:inset 3px 0 0 var(--primary-color,#0a84ff); }
#im-whats-new .wn-new{ display:inline-block; margin-right:6px; padding:1px 7px; border-radius:980px; font-size:11px; font-weight:600; color:#fff; background:var(--primary-color,#0a84ff); vertical-align:1px; }
#im-whats-new .wn-pr{ display:block; margin-top:2px; font-size:12px; color:var(--text-muted); }
#im-whats-new .wn-foot{ display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
#im-whats-new .wn-foot .ai-test-btn{ flex:1 1 160px; min-height:44px; display:flex; align-items:center; justify-content:center; text-decoration:none; box-sizing:border-box; }
.wn-mark{ display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; margin-left:6px; border-radius:980px; font-size:11px; font-weight:600; line-height:1; color:#fff; background:var(--widget-danger,#ff3b30); vertical-align:1px; box-sizing:border-box; }
`;
function ensureCSS() {
  if (document.getElementById('im-whats-new-css')) return;
  const st = document.createElement('style'); st.id = 'im-whats-new-css'; st.textContent = CSS; document.head.appendChild(st);
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function dayWords(iso, lang) {
  const [y, m, d] = String(iso).split('-').map(Number);
  try { return new Intl.DateTimeFormat(IntMapLang.locale(lang), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d)); }
  catch (_) { return iso; }
}

function render(root, list, lang, unread) {
  const panel = root.querySelector('.modal-content');
  panel.replaceChildren();
  const x = el('button', ''); x.type = 'button'; x.setAttribute('aria-label', IntMapLang.t(lang, 'Close', '閉じる'));
  x.style.cssText = 'position:absolute;top:12px;right:12px;width:44px;height:44px;border:none;background:transparent;color:var(--text-muted);font-size:22px;cursor:pointer;';
  x.textContent = '×'; x.addEventListener('click', close);
  const head = el('div', 'wn-head');
  const badge = el('div', 'wn-badge'); badge.setAttribute('aria-hidden', 'true');
  try { badge.appendChild(iconNode('sparkle')); } catch (_) { /* no picture */ }
  const hb = el('div', '');
  const h = el('h3', '', IntMapLang.t(lang, 'What’s new', '新着')); h.id = 'im-whats-new-title';
  hb.append(h, el('p', 'wn-sub', IntMapLang.t(lang, 'Changes to IntMap you can see, newest first. The date is the day each change was recorded.', 'IntMap に加わった、読者に見える変更（新しい順）。日付はその変更が記録された日です。')));
  head.append(badge, hb);
  panel.append(x, head);
  if (list.unreadable) {
    panel.appendChild(el('p', 'wn-sub', IntMapLang.t(lang, 'The list of changes could not be read. Try again when online.', '更新情報を読めませんでした。オンラインのときにもう一度お試しください。')));
  } else {
    const rows = entriesIn(list, lang);
    if (!rows.length) panel.appendChild(el('p', 'wn-sub', IntMapLang.t(lang, 'Nothing has been announced yet.', 'まだお知らせはありません。')));
    let day = null, ul = null;
    for (const r of rows) {
      if (r.date !== day) {
        day = r.date;
        const sec = el('section', 'wn-day');
        const h4 = el('h4', '', dayWords(r.date, lang)); h4.id = 'wn-d-' + r.date; sec.setAttribute('aria-labelledby', h4.id);
        ul = el('ul', 'wn-group');
        sec.append(h4, ul); panel.appendChild(sec);
      }
      const li = el('li', 'wn-row');
      if (unread.has(r.id)) { li.setAttribute('data-unread', ''); li.appendChild(el('span', 'wn-new', IntMapLang.t(lang, 'New', '新着'))); }
      li.appendChild(document.createTextNode(r.text));
      /* the link is the build's own (repository + /pull/N); anything that is not https is not drawn as a link */
      if (r.url && /^https:\/\//.test(r.url)) { const a = el('a', 'wn-pr', IntMapLang.t(lang, 'Change #' + r.pr, '変更 #' + r.pr)); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); }
      ul.appendChild(li);
    }
  }
  const foot = el('div', 'wn-foot');
  const page = el('a', 'ai-test-btn', IntMapLang.t(lang, 'Updates page', '更新情報のページ'));
  page.href = lang === 'jp' ? './ja/updates.html' : './updates.html'; page.target = '_blank'; page.rel = 'noopener';
  const feed = el('a', 'ai-test-btn', IntMapLang.t(lang, 'Feed (Atom)', 'フィード（Atom）'));
  feed.href = lang === 'jp' ? './ja/updates.xml' : './updates.xml'; feed.target = '_blank'; feed.rel = 'noopener';
  /* (weekly-earth) the other thing IntMap publishes every week — the planet's large natural events (scripts/weekly-earth-pages.mjs) */
  const weekly = el('a', 'ai-test-btn', IntMapLang.t(lang, 'This week on Earth', '今週の地球'));
  weekly.href = hubHref(lang); weekly.target = '_blank'; weekly.rel = 'noopener';
  foot.append(page, feed, weekly);
  panel.appendChild(foot);
}

/** open the page; resolves once it is drawn. Opening it marks every entry seen (after drawing which were new). */
export async function open() {
  ensureCSS();
  let root = document.getElementById('im-whats-new');
  if (!root) {
    root = el('div', 'modal-overlay'); root.id = 'im-whats-new';
    const panel = el('div', 'modal-content'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'im-whats-new-title'); panel.setAttribute('aria-busy', 'true');
    panel.style.position = 'relative';
    panel.appendChild(el('p', 'wn-sub', IntMapLang.t(docLang(), 'Reading…', '読み込んでいます…')));
    root.appendChild(panel); document.body.appendChild(root);
    try { window.IntMapDialog.adopt(root, { panel, labelledby: 'im-whats-new-title', backdrop: true }); } catch (_) { /* no registry: Escape and the trap are lost, the page is not */ }
  }
  root.style.display = 'flex';
  const lang = docLang();
  const list = await load();
  const seen = readSeen();
  const unread = new Set(list.unreadable ? [] : unreadOf(list, seen));
  render(root, list, lang, unread);
  root.querySelector('.modal-content').removeAttribute('aria-busy');
  if (!list.unreadable) {
    writeSeen(seenAfter(list));
    try { paintMark(document.getElementById('btn-whats-new')); } catch (_) { /* no button */ }
  }
  return root;
}
export function close() { const r = document.getElementById('im-whats-new'); if (r) r.style.display = 'none'; }
export function shown() { const r = document.getElementById('im-whats-new'); return !!r && r.style.display !== 'none'; }
try { bus.on('intmap-lang', () => { if (shown()) open(); }); } catch (_) { /* headless */ }
