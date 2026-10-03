/* ============================================================================
 *  IntMap · PUBLISHED COLLECTIONS — a collection of places and maps, read-only at a link   (collection-workspace)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of the publishing in supabase/migrations/20261003211500_collection_workspace.sql.
 *  A collection in «My places» holds places and saved maps (js/my-places.js). Its owner may publish it — a
 *  deliberate act, from the collection's row in the sheet or by asking Atlas — and gets ONE link,
 *  `?collection=<token>`. Whoever opens it sees the collection as it is NOW: its places as pins, framed,
 *  and its maps to open, with the owner's title and notes. Nobody sees who published it. Signed in, the
 *  visitor can keep a copy in their own account (copy_shared_collection — once is the same as twice).
 *
 *  THE DOORS ARE THE DATABASE'S: publish_collection() (one share per collection — publishing again answers
 *  with the same link), the owner's own DELETE (unpublish — the link stops answering at once),
 *  shared_collection(token) (the public read; anon may call it), copy_shared_collection(token).
 *
 *  Reached from: the page's address (`?collection=` — js/auth-ui.js loads this file only then), the «My
 *  places» sheet (js/my-places.js) and Atlas (js/atlas-cap-places.js). Loaded on demand.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';   /* the renderer, through the contract */
import { showPlaces, openView } from './my-places.js';

/* the token the database mints: 32 hex characters (gen_random_uuid() without its dashes) */
const TOKEN_RE = /^[0-9a-f]{32}$/;
/* A visitor who presses «Add to My places» signed out is sent to sign in, and a sign-in comes back to the bare page
   (js/auth-ui.js redirectTo = origin + pathname — the query is gone). The token waits here, in THIS TAB only
   (sessionStorage), and the copy the visitor asked for is made once they are signed in — not asked for a second time
   (.agents/rules/one-pass-or-a-reason.md). js/auth-ui.js reads the same key to load this file. */
export const PENDING_KEY = 'intmap-collection-pending';
const pending = {
  get() { try { const t = String(sessionStorage.getItem(PENDING_KEY) || ''); return TOKEN_RE.test(t) ? t : ''; } catch (_) { return ''; } },
  set(t) { try { sessionStorage.setItem(PENDING_KEY, t); } catch (_) { } },
  clear() { try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { } },
};

/* ── pure helpers (tests/collection-workspace-checks.test.mjs runs them in Node) ───────────────── */

/** `?collection=<token>` read back → the token, or '' (a value that is not a token is not one) */
export function tokenFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return ''; }
  const t = String(q.get('collection') || '').trim().toLowerCase();
  return TOKEN_RE.test(t) ? t : '';
}

/** The link of a published collection, on the page it is made from (the app's own address, no fragment). */
export function shareUrl(token, loc) {
  if (!TOKEN_RE.test(String(token || ''))) return '';
  const L = loc || (typeof location !== 'undefined' ? location : null);
  const base = L ? (String(L.origin || '') + String(L.pathname || '/')) : '';
  return base + '?collection=' + token;
}

/** The address without `?collection=` — what the bar shows once the visitor has closed the collection. */
export function searchWithout(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return ''; }
  q.delete('collection');
  const s = q.toString();
  return s ? '?' + s : '';
}

/** Which collection a share is: NULL = everything, '' = the unfiled ones, else its name. */
export function shareKey(collection) { return collection == null ? '\u0000all' : String(collection); }

function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  if (c === '54000') return 'full';
  if (c === '22023') return 'empty';
  return 'failed';
}

/** The sentence for a failed door, in the reader's language. */
export function shareFailureText(error, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (error === 'sign_in') return T('Sign in to publish or keep a collection.', 'コレクションを公開・保存するにはログインしてください。');
  if (error === 'empty') return T('There is nothing in that collection to publish.', 'そのコレクションには公開できる場所や地図がありません。');
  if (error === 'not_found') return T('This collection is not published (any more). Ask whoever sent the link for a new one.', 'このコレクションは公開されていません（公開が終わった可能性があります）。リンクを送った人に新しいリンクを頼んでください。');
  if (error === 'full') return T('Your account already holds the most places or maps it can. Delete some, then try again.', 'アカウントに保存できる場所または地図の上限に達しています。いくつか削除してからもう一度お試しください。');
  if (error === 'unavailable') return T('The account service is not reachable right now.', 'アカウントのサービスに接続できません。');
  return T('Could not reach the collection. Please try again.', 'コレクションを取得できませんでした。もう一度お試しください。');
}

/* ── the doors ────────────────────────────────────────────────────────────────────────────────── */

/** Publish a collection (null = everything). @returns {Promise<{ok, token?, url?, created?, places?, views?, error?}>} */
export async function publishCollection(DB, collection, title) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('publish_collection', {
      p_collection: collection == null ? null : String(collection).trim().slice(0, 60),
      p_title: title == null || !String(title).trim() ? null : String(title).trim().slice(0, 120),
    });
    if (error) return { ok: false, error: errOf(error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !TOKEN_RE.test(String(row.token || ''))) return { ok: false, error: 'failed' };
    return { ok: true, token: row.token, url: shareUrl(row.token), created: !!row.created, places: Number(row.place_count) || 0, views: Number(row.view_count) || 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** The account's published collections. @returns {Promise<{ok, shares?, error?}>} */
export async function listShares(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('collection_shares').select('id,collection,title,token,created_at').order('created_at', { ascending: true });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, shares: (Array.isArray(data) ? data : []).map((s) => Object.assign({}, s, { url: shareUrl(s.token) })) };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Stop publishing: the owner's DELETE on their share. @returns {Promise<{ok, removed?, error?}>} */
export async function unpublish(DB, ids) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!list.length) return { ok: true, removed: 0 };
  try {
    const { data, error } = await DB.from('collection_shares').delete().in('id', list).select('id');
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** The public read. @returns {Promise<{ok, title?, collection?, places?, views?, published_at?, updated_at?, error?}>} */
export async function readShared(DB, token) {
  if (!DB) return { ok: false, error: 'unavailable' };
  if (!TOKEN_RE.test(String(token || ''))) return { ok: false, error: 'not_found' };
  try {
    const { data, error } = await DB.rpc('shared_collection', { p_token: token });
    if (error) return { ok: false, error: errOf(error) };
    if (!data || data.ok !== true) return { ok: false, error: (data && data.error) || 'not_found' };
    return { ok: true, title: String(data.title || ''), collection: data.collection, published_at: data.published_at || null, updated_at: data.updated_at || null,
      places: Array.isArray(data.places) ? data.places : [], views: Array.isArray(data.views) ? data.views : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Keep a published collection in one's own account. @returns {Promise<{ok, collection?, placesAdded?, placesHad?, viewsAdded?, viewsHad?, error?}>} */
export async function copyShared(DB, token, into) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.rpc('copy_shared_collection', { p_token: token, p_into: into == null ? null : String(into).trim().slice(0, 60) });
    if (error) return { ok: false, error: errOf(error) };
    if (!data || data.ok !== true) return { ok: false, error: (data && data.error) || 'failed' };
    return { ok: true, collection: data.collection, placesAdded: +data.places_added || 0, placesHad: +data.places_had || 0, viewsAdded: +data.views_added || 0, viewsHad: +data.views_had || 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** What a finished copy says, in the reader's language. */
export function copyResultText(r, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  const had = r.placesHad + r.viewsHad;
  return T('Added to My places · ' + r.collection + ': ' + r.placesAdded + ' place(s), ' + r.viewsAdded + ' map(s)' + (had ? ' (' + had + ' already there)' : ''),
    'マイプレイス「' + r.collection + '」に追加しました: 場所 ' + r.placesAdded + ' 件・地図 ' + r.viewsAdded + ' 件' + (had ? '（' + had + ' 件は保存済み）' : ''));
}

/* ── the visitor's card ───────────────────────────────────────────────────────────────────────── */

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
  if (document.getElementById('scol-css')) return;
  const st = document.createElement('style'); st.id = 'scol-css';
  st.textContent = '#scol-card{position:fixed;left:14px;bottom:calc(var(--m-credit-h, 0px) + 18px);z-index:calc(var(--z-toast) + 10);width:min(340px,calc(100vw - 28px));max-height:min(60vh,520px);overflow:auto;'
    + 'background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:0 10px 34px rgba(0,0,0,.28);border:1px solid rgba(128,128,128,.18);padding:14px 14px 12px;font-size:13px;-webkit-backdrop-filter:saturate(1.6) blur(18px);backdrop-filter:saturate(1.6) blur(18px);}'
    + '#scol-card .scol-k{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--text-muted);text-transform:uppercase;margin:0 0 2px;}'
    + '#scol-card h2{font-size:16px;font-weight:700;margin:0 0 2px;line-height:1.3;}'
    + '#scol-card .scol-sub{color:var(--text-muted);font-size:12px;margin:0 0 10px;}'
    + '#scol-card .scol-row{display:flex;flex-direction:column;align-items:flex-start;width:100%;border:none;background:transparent;text-align:left;padding:7px 8px;border-radius:9px;cursor:pointer;font:inherit;color:inherit;}'
    + '#scol-card .scol-row:hover{background:rgba(128,128,128,.12);}'
    + '#scol-card .scol-row b{font-size:13px;font-weight:600;}'
    + '#scol-card .scol-row span{font-size:11.5px;color:var(--text-muted);}'
    + '#scol-card .scol-t{font-size:11px;font-weight:600;color:var(--text-muted);margin:8px 0 2px 8px;}'
    + '#scol-card .scol-btns{display:flex;gap:8px;margin-top:10px;}'
    + '#scol-card .scol-btns button{flex:1;}'
    + '#scol-card .scol-msg{font-size:12px;color:var(--text-muted);margin:8px 0 0;min-height:0;}';
  document.head.appendChild(st);
}

/** Show a read collection: its places as pins (framed) and a card listing them and its maps.
 *  @returns {{pins: string[]}} */
export function showShared(HOST, token, col) {
  const lang = HOST && HOST.lang;
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  ensureStyle();
  const old = document.getElementById('scol-card'); if (old) old.remove();
  const label = T('Shared collection', '共有されたコレクション') + ' · ' + col.title;
  const pins = col.places.length ? showPlaces(HOST, col.places, { source: label }) : [];

  const msg = el('p', { cls: 'scol-msg', role: 'status', 'aria-live': 'polite' });
  const body = [];
  if (col.places.length) {
    body.push(el('div', { cls: 'scol-t', text: T('Places', '場所') + ' · ' + col.places.length }));
    col.places.forEach((p) => {
      const b = el('button', { cls: 'scol-row', type: 'button' }, [el('b', { text: p.name }), p.note ? el('span', { text: p.note }) : null]);
      b.onclick = () => showPlaces(HOST, [p], { source: label });
      body.push(b);
    });
  }
  if (col.views.length) {
    body.push(el('div', { cls: 'scol-t', text: T('Maps', '地図') + ' · ' + col.views.length }));
    col.views.forEach((v) => {
      const b = el('button', { cls: 'scol-row', type: 'button', title: T('Open this map', 'この地図を開く') }, [el('b', { text: v.name }), v.note ? el('span', { text: v.note }) : null]);
      b.onclick = () => { const r = openView(v); if (!r.ok) msg.textContent = T('This map could not be opened here.', 'この地図はここでは開けません。'); };
      body.push(b);
    });
  }
  if (!col.places.length && !col.views.length) body.push(el('p', { cls: 'scol-sub', text: T('The collection is empty right now.', 'このコレクションは今は空です。') }));

  const keep = el('button', { cls: 'acct-btn', id: 'scol-keep', type: 'button', text: T('Add to My places', 'マイプレイスに追加') });
  keep.dataset.effect = 'private';   /* writes the visitor's own rows (copy_shared_collection) — scripts/data-effects.mjs */
  const close = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'scol-close', type: 'button', text: T('Close', '閉じる') });
  const card = el('section', { id: 'scol-card', role: 'region', 'aria-labelledby': 'scol-h' }, [
    el('p', { cls: 'scol-k', text: T('Shared collection · read-only', '共有されたコレクション · 閲覧専用') }),
    el('h2', { id: 'scol-h', text: col.title }),
    el('p', { cls: 'scol-sub', text: T(col.places.length + ' place(s) · ' + col.views.length + ' map(s)', '場所 ' + col.places.length + ' 件 · 地図 ' + col.views.length + ' 件') }),
  ].concat(body, [el('div', { cls: 'scol-btns' }, [keep, close]), msg]));
  const doCopy = async () => {
    keep.disabled = true;
    const r = await copyShared(HOST.DB, token, null);
    keep.disabled = false;
    msg.textContent = r.ok ? copyResultText(r, lang) : shareFailureText(r.error, lang);
    return r;
  };
  keep.onclick = async () => {
    if (!HOST.user) { pending.set(token); msg.textContent = shareFailureText('sign_in', lang); try { HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return; }
    pending.clear();
    await doCopy();
  };
  close.onclick = () => {
    pending.clear();
    try { card.remove(); } catch (_) { }
    /* the address stops naming the collection, so a reload is the reader's own map again */
    try { history.replaceState(history.state, '', location.pathname + searchWithout(location.search) + location.hash); } catch (_) { }
  };
  document.body.appendChild(card);
  return { pins, copy: doCopy };
}

/** `?collection=<token>` — or the token a signed-out «Add to My places» left in this tab: read the collection and
 *  show it once the map can draw; in the second case, once the visitor is signed in, make the copy they asked for. */
export async function bootFromUrl(HOST) {
  const fromUrl = tokenFromSearch(typeof location !== 'undefined' ? location.search : '');
  const waiting = pending.get();
  const token = fromUrl || waiting;
  if (!token || !HOST) return { ok: false, error: 'not_found' };
  const col = await readShared(HOST.DB, token);
  try { const GE = IntMapGeoEngine; if (GE && GE.whenCanDraw) await GE.whenCanDraw(); } catch (_) { }
  if (!col.ok) { pending.clear(); try { HOST.imToast(shareFailureText(col.error, HOST.lang)); } catch (_) { } return col; }
  const shown = showShared(HOST, token, col);
  if (waiting === token) {
    /* the sign-in is completed by js/auth-ui.js asynchronously (an OAuth return exchanges its code over the network — it
       polls 16 × 400 ms for the same reason); the copy waits for the account for as long, and is made once */
    for (let i = 0; i < 16 && !HOST.user; i++) await new Promise((r) => setTimeout(r, 400));
    if (HOST.user) { pending.clear(); const r = await shown.copy(); return Object.assign({ ok: true, copied: r }, shown); }
  }
  return Object.assign({ ok: true }, shown);
}
