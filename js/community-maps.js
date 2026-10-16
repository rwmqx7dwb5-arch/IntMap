/* ============================================================================
 *  IntMap · COMMUNITY MAPS — the collections readers chose to share with everyone, found, opened and kept   (community-maps)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of supabase/migrations/20261013080000_community_maps.sql.
 *  A published collection (js/shared-collection.js) travelled only as far as its owner handed the link. Here its owner
 *  may LIST it — a second, explicit act, under a name typed for the purpose (never the account's e-mail or profile
 *  name) and a summary — and then anyone can find it: by words, by what others kept most, by what was updated last,
 *  or by the area the map is showing. Opening one is opening its link (the card js/shared-collection.js draws, with
 *  its «Add to My places»). Keeping a copy leaves a receipt the owner sees only as a count («kept by 3 readers»), and
 *  a collection listed from a copy names the one it was started from — while that one is listed itself.
 *
 *  THE DOORS ARE THE DATABASE'S (this file decides nothing about who may see what):
 *    community_maps()          the directory — anon may read it; asked as a GET (read-only in PostgREST)
 *    list_community_map()      publish + list in one call; «already listed» is listed=false
 *    unlist_community_map()    out of the directory, the link kept
 *    my_collection_reach()     the owner's counts, per published collection
 *    report_community_map()    a signed-in reader's report (one per account; again = update)
 *    community_map_reports_admin() / moderate_community_map()   an administrator's queue and decision
 *
 *  Reached from: the account sheet (js/auth-ui.js «Community maps»), the gallery (js/showcase-gallery.js), the Library's
 *  share panel (js/my-places.js — listing), the shared collection's card (js/shared-collection.js — its listing, the
 *  original, reporting) and Atlas (js/atlas-cap-community.js). Loaded on demand; never on the boot path.
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7); every owner-written word is set as text, never as markup.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';   /* the renderer, through the contract — the area the reader is looking at */

/* ── THE WORDS THE DATABASE BOUNDS (the migration's CHECKs are the outer bound on the same values;
      tests/wave4-community-checks.test.mjs reads the migration and holds the two equal) ──────────── */
export const AUTHOR_MAX = 40;
export const SUMMARY_MAX = 500;
export const REPORT_NOTE_MAX = 1000;
export const REPORT_REASONS = Object.freeze(['spam', 'offensive', 'personal_info', 'copyright', 'misleading', 'other']);
export const SORTS = Object.freeze(['new', 'reused', 'updated']);
/* one page of cards: the database answers at most 50 (community_maps p_limit) — 20 is what the sheet asks for */
const PAGE = 20;
const TOKEN_RE = /^[0-9a-f]{32}$/;

/* ── pure helpers (Node runs them) ───────────────────────────────────────────────────────────── */

/** The name a listing is shown under: trimmed, no control characters, at most AUTHOR_MAX — '' when there is none. */
export function authorOk(s) {
  // eslint-disable-next-line no-control-regex
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return t.length >= 1 && t.length <= AUTHOR_MAX ? t : '';
}

/** One directory entry as the database answered it, with every field typed — or null when it is not one. */
export function entryOf(raw) {
  if (!raw || typeof raw !== 'object' || !TOKEN_RE.test(String(raw.token || ''))) return null;
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  const f = (v) => (v == null || !Number.isFinite(+v) ? null : +v);
  const b = raw.based_on && TOKEN_RE.test(String(raw.based_on.token || ''))
    ? { title: String(raw.based_on.title || ''), author: String(raw.based_on.author || ''), token: String(raw.based_on.token) } : null;
  return {
    token: String(raw.token), title: String(raw.title || ''), summary: String(raw.summary || ''), author: String(raw.author || ''),
    listedAt: raw.listed_at || null, updatedAt: raw.updated_at || null,
    places: n(raw.places), maps: n(raw.maps), tours: n(raw.tours),
    lng: f(raw.lng), lat: f(raw.lat), bbox: Array.isArray(raw.bbox) && raw.bbox.length === 4 ? raw.bbox.map(Number) : null,
    reused: n(raw.reused), derived: n(raw.derived), basedOn: b,
  };
}

/** The area the map is showing as [west, south, east, north] in −180…180, the antimeridian crossed as west > east —
 *  or null when the view spans the whole globe (no area to ask about). Accepts a renderer's bounds object
 *  (getWest()…) or a plain [[w, s], [e, n]]. */
export function bboxOfBounds(b) {
  if (!b) return null;
  let w, s, e, n;
  if (typeof b.getWest === 'function') { w = +b.getWest(); s = +b.getSouth(); e = +b.getEast(); n = +b.getNorth(); }
  else if (Array.isArray(b) && b.length === 2) { w = +b[0][0]; s = +b[0][1]; e = +b[1][0]; n = +b[1][1]; }
  else return null;
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (e - w >= 360) return null;
  const wrap = (x) => { let y = ((x + 180) % 360 + 360) % 360 - 180; if (y === -180 && x > 0) y = 180; return y; };
  const clampLat = (y) => Math.max(-90, Math.min(90, y));
  return [wrap(w), clampLat(s), wrap(e), clampLat(n)];
}

/** What a listing's reach says, in the reader's language ('' when nobody has kept it yet). */
export function reachText(reused, derived, lang) {
  const T = IntMapLang.pick(() => lang);
  const parts = [];
  if (reused > 0) parts.push(T('Kept by ' + reused + (reused === 1 ? ' reader' : ' readers'), reused + ' 人が保存'));
  if (derived > 0) parts.push(T(derived + (derived === 1 ? ' collection' : ' collections') + ' built on it', 'これを元にした地図 ' + derived + ' 件'));
  return parts.join(' · ');
}

/** What a collection holds, in one line. */
export function contentsText(e, lang) {
  const T = IntMapLang.pick(() => lang);
  const parts = [];
  if (e.places) parts.push(T(e.places + (e.places === 1 ? ' place' : ' places'), '場所 ' + e.places));
  if (e.maps) parts.push(T(e.maps + (e.maps === 1 ? ' map' : ' maps'), '地図 ' + e.maps));
  if (e.tours) parts.push(T(e.tours + (e.tours === 1 ? ' tour' : ' tours'), 'ツアー ' + e.tours));
  return parts.join(' · ');
}

/** The name of each report reason, in the reader's language. */
export function reasonLabel(r, lang) {
  const T = IntMapLang.pick(() => lang);
  if (r === 'spam') return T('Spam or advertising', 'スパム・宣伝');
  if (r === 'offensive') return T('Offensive or hateful', '攻撃的・差別的');
  if (r === 'personal_info') return T('Someone’s personal information', '他人の個人情報');
  if (r === 'copyright') return T('Copies someone else’s work', '他人の著作物の無断転載');
  if (r === 'misleading') return T('Deliberately misleading', '意図的に誤解を招く');
  return T('Another reason', 'その他の理由');
}

function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  if (c === '22023') return 'invalid';
  if (c === '23514') return 'too_long';
  if (c === '55000') return 'hidden';
  if (c === 'P0002') return 'not_listed';
  if (c === 'PGRST202' || c === '42883') return 'not_deployed';
  return 'failed';
}

/** The sentence for a failed door, in the reader's language. */
export function failureText(error, lang) {
  const T = IntMapLang.pick(() => lang);
  if (error === 'sign_in') return T('Sign in first.', 'ログインしてください。');
  if (error === 'invalid') return T('A listing needs a name to show and something in the collection.', '掲載には表示名と、コレクションの中身が必要です。');
  if (error === 'too_long') return T('The name can be at most ' + AUTHOR_MAX + ' characters and the summary ' + SUMMARY_MAX + '.', '表示名は ' + AUTHOR_MAX + ' 文字、紹介文は ' + SUMMARY_MAX + ' 文字までです。');
  if (error === 'hidden') return T('IntMap’s administrators have taken this collection out of Community maps. Its link still works.', 'このコレクションは IntMap の管理者によって、みんなの地図から外されています。リンクは引き続き使えます。');
  if (error === 'not_listed') return T('That collection is not in Community maps.', 'そのコレクションは、みんなの地図に掲載されていません。');
  if (error === 'not_deployed') return T('Community maps are not available on this server yet.', 'このサーバーではまだ、みんなの地図を利用できません。');
  if (error === 'unavailable') return T('The account service is not reachable right now.', 'アカウントのサービスに接続できません。');
  return T('Could not reach Community maps. Please try again.', 'みんなの地図に接続できませんでした。もう一度お試しください。');
}

/* ── the doors ────────────────────────────────────────────────────────────────────────────────── */

/** The directory, a page at a time. q = { query, sort, offset, limit, bbox } → {ok, items, hasMore, sort, offset, error?}
 *  (no total: the database reads one page plus one row, never every listing — supabase/migrations/20261013080000_community_maps.sql §6) */
export async function browse(DB, q) {
  if (!DB) return { ok: false, error: 'unavailable' };
  q = q || {};
  const args = { p_sort: SORTS.indexOf(q.sort) >= 0 ? q.sort : 'new', p_limit: Math.max(1, Math.min(50, Math.round(+q.limit || PAGE))), p_offset: Math.max(0, Math.round(+q.offset || 0)) };
  /* an argument left out is the function's default (supabase-js writes `null` as the word null in a GET) */
  const words = String(q.query == null ? '' : q.query).trim();
  if (words) args.p_query = words.slice(0, 100);
  if (Array.isArray(q.bbox) && q.bbox.length === 4 && q.bbox.every(Number.isFinite)) args.p_bbox = q.bbox.map((x) => +(+x).toFixed(4));
  try {
    const { data, error } = await DB.rpc('community_maps', args, { get: true });
    if (error) return { ok: false, error: errOf(error) };
    if (!data || data.ok !== true) return { ok: false, error: 'failed' };
    return { ok: true, hasMore: data.has_more === true, sort: data.sort, offset: +data.offset || 0, items: (Array.isArray(data.items) ? data.items : []).map(entryOf).filter(Boolean) };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** List a collection (null = everything) under `author`, with `summary`. → {ok, token?, listed?, derivedFrom?, error?} */
export async function listMap(DB, o) {
  if (!DB) return { ok: false, error: 'unavailable' };
  o = o || {};
  const author = o.author == null ? null : authorOk(o.author);
  if (o.author != null && !author) return { ok: false, error: String(o.author).trim().length > AUTHOR_MAX ? 'too_long' : 'invalid' };
  try {
    const { data, error } = await DB.rpc('list_community_map', {
      p_collection: o.collection == null ? null : String(o.collection).trim().slice(0, 60),
      p_author: author || null,
      p_summary: o.summary == null ? null : String(o.summary).slice(0, SUMMARY_MAX),
      p_title: o.title == null || !String(o.title).trim() ? null : String(o.title).trim().slice(0, 120),
    });
    if (error) return { ok: false, error: errOf(error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !TOKEN_RE.test(String(row.token || ''))) return { ok: false, error: 'failed' };
    return { ok: true, token: row.token, listed: !!row.listed, derivedFrom: row.derived_from_title || null };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Take a collection (null = everything) out of the directory; the link is kept. → {ok, was?, error?} */
export async function unlistMap(DB, collection) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('unlist_community_map', { p_collection: collection == null ? null : String(collection).trim().slice(0, 60) });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, was: data === true };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** The owner's reach per published collection → {ok, byShare: {id: {reused, derived}}} */
export async function reach(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('my_collection_reach', {}, { get: true });
    if (error) return { ok: false, error: errOf(error) };
    const byShare = {};
    (Array.isArray(data) ? data : []).forEach((r) => { byShare[String(r.share_id)] = { reused: +r.reused || 0, derived: +r.derived || 0 }; });
    return { ok: true, byShare };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Report a listed collection. → {ok, created?, error?} */
async function reportMap(DB, token, reason, note) {
  if (!DB) return { ok: false, error: 'unavailable' };
  if (!TOKEN_RE.test(String(token || '')) || REPORT_REASONS.indexOf(reason) < 0) return { ok: false, error: 'invalid' };
  try {
    const { data, error } = await DB.rpc('report_community_map', { p_token: token, p_reason: reason, p_note: String(note == null ? '' : note).slice(0, REPORT_NOTE_MAX) });
    if (error) return { ok: false, error: errOf(error) };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, created: !!(row && row.created) };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** An administrator's queue (42501 → 'sign_in' for anyone else). */
async function adminQueue(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('community_map_reports_admin', {}, { get: true });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, items: Array.isArray(data) ? data : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** An administrator's decision: 'hide' (with the reason the owner reads) | 'restore' | 'dismiss'. */
async function moderate(DB, token, action, reason) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('moderate_community_map', { p_token: token, p_action: action, p_reason: reason == null ? null : String(reason).slice(0, 300) });
    if (error) return { ok: false, error: errOf(error) };
    return data && data.ok ? { ok: true } : { ok: false, error: (data && data.error) || 'failed' };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Is the signed-in reader an administrator? (the database's own answer — public.is_admin()) */
async function isAdmin(DB) {
  try { const { data, error } = await DB.rpc('is_admin', {}, { get: true }); return !error && data === true; } catch (_) { return false; }
}

/** The area the map is showing now, or null (the renderer is the one that knows). */
export function viewBbox() {
  try { const GE = IntMapGeoEngine; if (GE && GE.hasRenderer && GE.hasRenderer()) return bboxOfBounds(GE.camera.getBounds()); } catch (_) { }
  return null;
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
  if (document.getElementById('cmm-css')) return;
  const st = document.createElement('style'); st.id = 'cmm-css';
  st.textContent = '.cmm-lead{margin:2px 0 12px;font-size:13px;line-height:1.55;color:var(--text-muted);}'
    + '.cmm-search{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:10px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:14px;margin:0 0 8px;}'
    + '.cmm-seg{display:flex;gap:2px;padding:2px;border-radius:9px;background:rgba(128,128,128,0.14);margin:0 0 8px;}'
    + '.cmm-seg button{flex:1;border:none;background:transparent;color:var(--text-main);font-size:12.5px;font-weight:600;padding:6px 4px;border-radius:7px;cursor:pointer;}'
    + '.cmm-seg button[aria-pressed="true"]{background:var(--card-bg);box-shadow:0 1px 3px rgba(0,0,0,.14);}'
    /* the iOS segmented control in the dark: the chosen segment is lighter than the sheet, not the same colour */
    + '[data-theme="dark"] .cmm-seg button[aria-pressed="true"]{background:#636366;}'
    + '.cmm-area{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-muted);margin:0 0 10px;}'
    + '.cmm-card{padding:11px 12px;border-radius:12px;background:rgba(128,128,128,0.07);margin:0 0 8px;}'
    + '.cmm-card h3{margin:0 0 2px;font-size:14.5px;font-weight:700;line-height:1.3;color:var(--text-main);}'
    + '.cmm-by{font-size:12px;color:var(--text-muted);margin:0 0 6px;}'
    + '.cmm-sum{font-size:12.5px;line-height:1.5;margin:0 0 6px;color:var(--text-main);white-space:pre-line;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}'
    + '.cmm-meta{font-size:11.5px;color:var(--text-muted);margin:0 0 8px;}'
    + '.cmm-orig{border:none;background:transparent;padding:0;margin:0 0 8px;font:inherit;font-size:11.5px;color:var(--accent, #0a84ff);cursor:pointer;text-align:left;}'
    + '.cmm-acts{display:flex;gap:8px;}'
    + '.cmm-acts .acct-btn{flex:1;}'
    + '.cmm-more{width:100%;margin:4px 0 10px;}'
    + '.cmm-empty{font-size:13px;color:var(--text-muted);padding:14px 4px;}'
    + '.cmm-mod{margin:14px 0 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,149,0,.45);}'
    + '.cmm-mod h3{margin:0 0 6px;font-size:13px;font-weight:700;}'
    + '.cmm-mod .cmm-acts{flex-direction:column;gap:6px;}'
    + '.cmm-mod input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:12px;margin:0 0 6px;}'
    /* the Library's listing box (js/my-places.js) */
    + '.cmm-list-box{margin:10px 0 0;padding:10px 0 0;box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.3);}'
    + '.cmm-list-box input,.cmm-list-box textarea{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:12.5px;margin:0 0 8px;font-family:inherit;}'
    + '.cmm-list-box textarea{min-height:54px;resize:vertical;}'
    + '.cmm-stat{font-size:12px;color:var(--text-main);margin:0 0 8px;}'
    /* the shared collection's card (js/shared-collection.js): the report form */
    + '.cmm-in-card select,.cmm-in-card input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:12.5px;margin:0 0 6px;}'
    + '.cmm-in-card .acct-btn{width:100%;margin:0 0 4px;}';
  document.head.appendChild(st);
}

/** Open one listed collection — its link's card (js/shared-collection.js), the way the link itself would open. */
export async function openEntry(HOST, token) {
  const S = await import('./shared-collection.js');
  return S.openShared(HOST, token);
}

/** One directory card. `onOpen(token)` opens an entry (the sheet closes first). */
function card(e, lang, onOpen) {
  const T = IntMapLang.pick(() => lang);
  const kids = [el('h3', { text: e.title }), el('p', { cls: 'cmm-by', text: T('by ', '作成: ') + e.author })];
  if (e.summary) kids.push(el('p', { cls: 'cmm-sum', text: e.summary }));
  const meta = [contentsText(e, lang), reachText(e.reused, e.derived, lang)].filter(Boolean).join(' · ');
  if (meta) kids.push(el('p', { cls: 'cmm-meta', text: meta }));
  if (e.basedOn) {
    const o = el('button', { cls: 'cmm-orig', type: 'button', text: T('Built on «' + e.basedOn.title + '» by ' + e.basedOn.author, '元にした地図: 「' + e.basedOn.title + '」（' + e.basedOn.author + '）') });
    o.dataset.effect = 'none';
    o.onclick = () => onOpen(e.basedOn.token);
    kids.push(o);
  }
  const open = el('button', { cls: 'acct-btn', type: 'button', text: T('Open on the map', '地図で開く') });
  open.dataset.effect = 'none';
  open.onclick = () => onOpen(e.token);
  kids.push(el('div', { cls: 'cmm-acts' }, [open]));
  return el('article', { cls: 'cmm-card' }, kids);
}

/** Open the Community maps sheet. opts = { query, sort, area } — `area: true` starts with «only this area». */
export async function openCommunityMaps(HOST, opts) {
  opts = opts || {};
  const lang = HOST && HOST.lang;
  const T = IntMapLang.pick(() => lang);
  ensureStyle();
  const old = document.getElementById('cmm-modal'); if (old) old.remove();

  const st = { query: String(opts.query || ''), sort: SORTS.indexOf(opts.sort) >= 0 ? opts.sort : 'new', area: !!opts.area, offset: 0, items: [], hasMore: false, gen: 0 };
  const msg = el('p', { cls: 'acct-msg', role: 'status', 'aria-live': 'polite' });
  const search = el('input', { cls: 'cmm-search', id: 'cmm-q', type: 'search', maxlength: '100', 'aria-label': T('Search Community maps', 'みんなの地図を検索'), placeholder: T('Search titles, summaries and names', '題・紹介文・作成者で検索') });
  search.value = st.query;
  const seg = el('div', { cls: 'cmm-seg', role: 'group', 'aria-label': T('Order', '並び順') });
  const sortName = { new: T('Newest', '新着'), reused: T('Most kept', '保存が多い'), updated: T('Recently changed', '最近の更新') };
  SORTS.forEach((k) => {
    const b = el('button', { type: 'button', 'aria-pressed': k === st.sort ? 'true' : 'false', text: sortName[k] });
    b.dataset.effect = 'none';
    b.onclick = () => { st.sort = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); load(false); };
    seg.appendChild(b);
  });
  const areaBox = el('input', { type: 'checkbox', id: 'cmm-area' });
  areaBox.checked = st.area;
  const area = el('label', { cls: 'cmm-area', for: 'cmm-area' }, [areaBox, el('span', { text: T('Only collections about the area on the map', '地図に表示している範囲のものだけ') })]);
  const list = el('div', { id: 'cmm-list' });
  const more = el('button', { cls: 'acct-btn acct-btn-quiet cmm-more', type: 'button', text: T('Show more', 'さらに表示') });
  more.dataset.effect = 'none';
  more.hidden = true;
  const modSlot = el('div');
  const close = el('button', { cls: 'acct-close', id: 'cmm-close', type: 'button', text: T('Close', '閉じる') });
  const sheet = el('div', { cls: 'acct-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cmm-h', tabindex: '-1' }, [
    el('h2', { cls: 'acct-h', id: 'cmm-h', text: T('Community maps', 'みんなの地図') }),
    el('p', { cls: 'cmm-lead', text: T('Collections of places, maps and tours that readers chose to share with everyone. Open one on the map; add it to your Library to build on it — what you list from it says where it came from. To share your own, publish a collection in your Library and list it.',
      '読者がみんなに向けて公開した、場所・地図・ツアーのコレクションです。地図で開き、ライブラリに追加すればそれを元に作れます（元にしたものから掲載すると、元の地図が示されます）。自分のものを載せるには、ライブラリでコレクションを公開して掲載してください。') }),
    search, seg, area, msg, list, more, modSlot, close,
  ]);
  const m = el('div', { id: 'cmm-modal' }, [sheet]);
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:calc(var(--z-toast) + 2001);padding:20px;';
  const shut = () => { try { m.remove(); } catch (_) { } };
  close.onclick = shut;
  const onOpen = async (token) => { shut(); const r = await openEntry(HOST, token); if (r && r.ok === false) { try { HOST.imToast(failureText(r.error === 'not_found' ? 'not_listed' : r.error, lang)); } catch (_) { } } };

  const render = () => {
    list.textContent = '';
    if (!st.items.length) {
      list.appendChild(el('p', { cls: 'cmm-empty', text: st.query || st.area
        ? T('Nothing matches. Try other words, or turn off «only this area».', '一致するものはありません。別の言葉を試すか、「範囲のものだけ」を外してください。')
        : T('No collection has been listed yet. Be the first: publish a collection in your Library and list it.', 'まだ掲載されたコレクションはありません。ライブラリでコレクションを公開して、最初の掲載をしてください。') }));
    }
    st.items.forEach((e) => list.appendChild(card(e, lang, onOpen)));
    more.hidden = !st.hasMore;
    msg.textContent = '';
  };
  /* one request per change: a newer one makes an older answer stale (gen), so a slow page cannot overwrite a newer one */
  const load = async (append) => {
    const gen = ++st.gen;
    if (!append) st.offset = 0;
    const bbox = st.area ? viewBbox() : null;
    if (st.area && !bbox) { st.items = []; st.hasMore = false; render(); msg.textContent = T('The map is showing the whole globe — zoom in to ask about an area.', '地図が地球全体を表示しています。範囲で探すには拡大してください。'); return; }
    msg.textContent = T('Reading…', '読み込み中…');
    const r = await browse(HOST.DB, { query: st.query, sort: st.sort, offset: append ? st.items.length : 0, limit: PAGE, bbox });
    if (gen !== st.gen) return;
    if (!r.ok) { msg.textContent = failureText(r.error, lang); return; }
    st.items = append ? st.items.concat(r.items) : r.items;
    st.hasMore = r.hasMore;
    render();
  };
  let typing = null;
  search.addEventListener('input', () => { st.query = search.value; clearTimeout(typing); typing = setTimeout(() => load(false), 250); });
  areaBox.onchange = () => { st.area = areaBox.checked; load(false); };
  more.onclick = () => load(true);

  /* the app's one dialog manager (js/dialog.js — a classic script that publishes window.IntMapDialog and exports nothing;
     the account sheets read it the same way): Escape, the backdrop, focus return */
  try {
    const D = window.IntMapDialog;
    if (D) D.open(m, { panel: sheet, labelledby: 'cmm-h', backdrop: true, close: shut });
    else document.body.appendChild(m);
  } catch (_) { document.body.appendChild(m); }
  try { sheet.focus(); } catch (_) { }
  await load(false);
  if (HOST && HOST.user && HOST.DB && await isAdmin(HOST.DB)) moderation(HOST, modSlot, lang);
  return { ok: true, hasMore: st.hasMore, items: st.items.slice() };
}

/* ── an administrator's part of the sheet: the reported collections and the three decisions ─────────── */
async function moderation(HOST, slot, lang) {
  const T = IntMapLang.pick(() => lang);
  const q = await adminQueue(HOST.DB);
  if (!q.ok) return;
  slot.textContent = '';
  const box = el('section', { cls: 'cmm-mod' }, [el('h3', { text: T('Reported collections (administrators)', '報告されたコレクション（管理者）') + ' · ' + q.items.length })]);
  if (!q.items.length) box.appendChild(el('p', { cls: 'cmm-meta', text: T('No reports.', '報告はありません。') }));
  q.items.forEach((it) => {
    const status = { open: T('not yet settled', '未対応'), dismissed: T('dismissed', '却下'), actioned: T('acted on', '対応済み') };
    const reasons = (Array.isArray(it.reasons) ? it.reasons : []).map((r) => reasonLabel(r.reason, lang) + (r.note ? ': ' + r.note : '') + ' (' + (status[r.status] || r.status) + ')').join(' / ');
    const why = el('input', { type: 'text', maxlength: '300', 'aria-label': T('Reason shown to the owner', '持ち主に示す理由'), placeholder: T('Reason shown to the owner (required to hide)', '持ち主に示す理由（外すときは必須）') });
    const res = el('p', { cls: 'cmm-meta', role: 'status' });
    const act = (action, text) => {
      const b = el('button', { cls: 'acct-btn acct-btn-quiet', type: 'button', text });
      /* hiding and restoring change what every reader finds; dismissing settles the queue (scripts/data-effects.mjs) */
      if (action === 'dismiss') b.dataset.effect = 'private'; else b.dataset.effect = 'outward';
      b.onclick = async () => {
        const r = await moderate(HOST.DB, it.ref, action, why.value);   /* the queue's ref: the collection, published or not */
        res.textContent = r.ok ? T('Done.', '完了しました。') : failureText(r.error, lang);
        if (r.ok) moderation(HOST, slot, lang);
      };
      return b;
    };
    box.appendChild(el('div', { cls: 'cmm-card' }, [
      el('h3', { text: String(it.title || '') }),
      el('p', { cls: 'cmm-by', text: T('by ', '作成: ') + String(it.author || '—') + (it.published ? '' : T(' · not published now', ' · 現在は非公開')) + (it.hidden_at ? T(' · hidden: ', ' · 非表示: ') + String(it.hidden_reason || '') : '') }),
      el('p', { cls: 'cmm-meta', text: T('Open reports: ', '未対応の報告: ') + (+it.open || 0) + ' / ' + (+it.total || 0) + ' — ' + reasons }),
      why,
      el('div', { cls: 'cmm-acts' }, [act('hide', T('Take out of Community maps', 'みんなの地図から外す')), act('restore', T('Put back in Community maps', 'みんなの地図に戻す')), act('dismiss', T('Dismiss reports', '報告を却下'))]),
      res,
    ]));
  });
  slot.appendChild(box);
}

/* ══ THE LIBRARY'S LISTING BOX — inside a published collection's share panel (js/my-places.js) ═══════════════
   `share` is the owner's own row (js/shared-collection.js listShares — listed_at, author_name, summary are the owner's own
   columns; hidden_at / hidden_reason come from the owner's hold on the collection, community_map_holds), `reachOf` its counts. `done()` asks the sheet to read the account again. */
export function listingBox(HOST, share, reachOf, done) {
  const lang = HOST && HOST.lang;
  const T = IntMapLang.pick(() => lang);
  ensureStyle();
  const box = el('div', { cls: 'cmm-list-box' });
  const res = el('p', { cls: 'cmm-meta', role: 'status', 'aria-live': 'polite' });
  const r = reachOf || { reused: 0, derived: 0 };
  const stat = reachText(r.reused, r.derived, lang);
  if (share.hidden_at) {
    box.append(el('p', { cls: 'cmm-stat', text: T('Taken out of Community maps by IntMap’s administrators: ', 'IntMap の管理者によって、みんなの地図から外されました: ') + String(share.hidden_reason || '') }));
    if (stat) box.append(el('p', { cls: 'cmm-stat', text: stat }));
    return box;
  }
  if (share.listed_at) {
    const off = el('button', { cls: 'acct-btn acct-btn-quiet', type: 'button', text: T('Take out of Community maps', 'みんなの地図から外す') });
    off.dataset.effect = 'private';   /* the owner's own listing — the link stays */
    box.append(el('p', { cls: 'cmm-stat', text: T('Listed in Community maps as «' + (share.author_name || '') + '». Anyone can find it there.', 'みんなの地図に「' + (share.author_name || '') + '」として掲載中です。誰でも見つけられます。') }),
      el('p', { cls: 'cmm-stat', text: stat || T('Nobody has kept a copy yet.', 'まだ誰も保存していません。') }), el('div', { cls: 'mpl-btns' }, [off]), res);
    off.onclick = async () => {
      const u = await unlistMap(HOST.DB, share.collection);
      res.textContent = u.ok ? T('Taken out of Community maps. The link still works.', 'みんなの地図から外しました。リンクは引き続き使えます。') : failureText(u.error, lang);
      if (u.ok && done) done();
    };
    return box;
  }
  const name = el('input', { type: 'text', maxlength: String(AUTHOR_MAX), 'aria-label': T('Name to show', '表示名'), placeholder: T('Name to show (not your e-mail) — e.g. Ms Tanaka, Grade 8', '表示名（メールアドレスではない名前）——例: 田中（中2社会）') });
  const sum = el('textarea', { maxlength: String(SUMMARY_MAX), 'aria-label': T('Summary', '紹介文'), placeholder: T('What is it for? (optional)', '何のための地図か（任意）') });
  const go = el('button', { cls: 'acct-btn', type: 'button', text: T('List in Community maps', 'みんなの地図に掲載') });
  go.dataset.effect = 'outward';   /* makes the collection findable by anyone */
  box.append(el('p', { cls: 'cmm-stat', text: T('List it in Community maps and anyone can find it — its title, the name you type here, the summary, and what the link shows. You can take it out at any time.',
    'みんなの地図に掲載すると、誰でも見つけられるようになります（題・ここに入力する表示名・紹介文と、リンクで見える内容）。いつでも外せます。') }), name, sum, el('div', { cls: 'mpl-btns' }, [go]), res);
  if (stat) box.insertBefore(el('p', { cls: 'cmm-stat', text: stat }), box.firstChild);
  go.onclick = async () => {
    if (!authorOk(name.value)) { res.textContent = failureText(name.value.trim().length > AUTHOR_MAX ? 'too_long' : 'invalid', lang); try { name.focus(); } catch (_) { } return; }
    go.disabled = true;
    const l = await listMap(HOST.DB, { collection: share.collection, author: name.value, summary: sum.value });
    go.disabled = false;
    if (!l.ok) { res.textContent = failureText(l.error, lang); return; }
    res.textContent = T('Listed in Community maps.', 'みんなの地図に掲載しました。') + (l.derivedFrom ? T(' It names «' + l.derivedFrom + '» as the collection it was built on.', '元にした地図として「' + l.derivedFrom + '」が示されます。') : '');
    if (done) done();
  };
  return box;
}

/* ══ THE SHARED COLLECTION'S CARD — its listing, the original, and reporting (js/shared-collection.js) ═══════ */
export function listingSection(HOST, token, listing, onOpenOriginal) {
  const lang = HOST && HOST.lang;
  const T = IntMapLang.pick(() => lang);
  ensureStyle();
  const kids = [el('p', { cls: 'scol-sub', text: T('In Community maps · by ', 'みんなの地図 · 作成: ') + String(listing.author || '') })];
  if (listing.summary) kids.push(el('p', { cls: 'cmm-sum', text: String(listing.summary) }));
  const stat = reachText(+listing.reused || 0, +listing.derived || 0, lang);
  if (stat) kids.push(el('p', { cls: 'cmm-meta', text: stat }));
  const b = listing.based_on;
  if (b && TOKEN_RE.test(String(b.token || ''))) {
    const o = el('button', { cls: 'cmm-orig', type: 'button', text: T('Built on «' + b.title + '» by ' + b.author, '元にした地図: 「' + b.title + '」（' + b.author + '）') });
    o.dataset.effect = 'none';
    o.onclick = () => onOpenOriginal(String(b.token));
    kids.push(o);
  }
  /* reporting: a reason from the closed vocabulary and a note; signed in (one report per account) */
  const res = el('p', { cls: 'cmm-meta', role: 'status', 'aria-live': 'polite' });
  const rep = el('button', { cls: 'cmm-orig', type: 'button', text: T('Report this collection', 'このコレクションを報告') });
  rep.dataset.effect = 'none';
  const form = el('div');
  rep.onclick = () => {
    if (form.childNodes.length) { form.textContent = ''; return; }
    if (!HOST.user) { res.textContent = failureText('sign_in', lang); try { HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return; }
    const sel = el('select', { 'aria-label': T('Why', '理由') });
    REPORT_REASONS.forEach((r) => { const o = el('option', { value: r, text: reasonLabel(r, lang) }); sel.appendChild(o); });
    const note = el('input', { type: 'text', maxlength: String(REPORT_NOTE_MAX), 'aria-label': T('Note', 'メモ'), placeholder: T('What is wrong? (optional)', '何が問題か（任意）') });
    const send = el('button', { cls: 'acct-btn', type: 'button', text: T('Send report', '報告を送る') });
    send.dataset.effect = 'outward';   /* the reader's word to IntMap's administrators */
    send.onclick = async () => {
      send.disabled = true;
      const r = await reportMap(HOST.DB, token, sel.value, note.value);
      send.disabled = false;
      res.textContent = r.ok ? (r.created ? T('Thank you — IntMap’s administrators will look at it.', 'ありがとうございます。IntMap の管理者が確認します。') : T('Your earlier report was updated.', '以前の報告を更新しました。')) : failureText(r.error, lang);
      if (r.ok) form.textContent = '';
    };
    form.append(sel, note, send);
  };
  kids.push(rep, form, res);
  return el('div', { cls: 'cmm-in-card' }, kids);
}
