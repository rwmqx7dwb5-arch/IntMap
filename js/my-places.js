/* ============================================================================
 *  IntMap · MY PLACES — places that belong to the account, on every device   (my-places)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of supabase/migrations/20261003140000_saved_places.sql. A pin, a search
 *  result or the view in front of the reader becomes a named place with a note and an optional
 *  collection, saved to the ACCOUNT — so it is back on the map after a reload and on any other device.
 *
 *  ONE DOOR IN: every save goes through public.save_place() (the pin popup, this sheet, Atlas's
 *  places.save). The database decides the account (auth.uid()) and the identity of a place (its
 *  position at ~1 m — the session pins' own rule), so saving a saved place answers «already saved» and
 *  never makes a second row. Reading, editing and deleting are the owner's own rows under RLS.
 *  SHOWING places reuses the session pins (HOST.addPin): a saved place on the map IS a pin, with its
 *  name and note in the popup, listed in Objects, measured from, removed like any other — not a second
 *  marker system.
 *
 *  Reached from: the account sheet (js/auth-ui.js), the pin popup (js/app-body.js) and Atlas
 *  (js/atlas-cap-places.js). Loaded on demand. Its look reuses `.acct-*` (css/intmap.css); the rules of
 *  its own are injected when the sheet first opens.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';   /* the renderer, through the contract */
import { MapState } from './map-state.js';           /* (collection-workspace) a saved map IS a share link's fragment */
/* (map-document-unify) every saved thing is a map document — a map, a my map, a tour, an Atlas answer (js/map-doc.js) */
import { readMapDoc, fromSavedView, toSavedView, fromTourDraft, toTourInput, isTour, firstState, STEPS_MAX } from './map-doc.js';

const COLS = 'id,name,note,collection,lng,lat,zoom,source,created_at,updated_at';
const VIEW_COLS = 'id,name,note,collection,state,kind,steps,created_at,updated_at';
/* the columns of a database the documents' migration (20261004120000_map_documents.sql) has not reached yet — every
   row there is one map. Read only when the first read is refused for naming a column that is not there (42703). */
const VIEW_COLS_BEFORE_DOCUMENTS = 'id,name,note,collection,state,created_at,updated_at';

/* ── pure helpers (tests/platform-backend-checks.test.mjs runs them in Node) ───────────────────── */

/** A name for a place that has none yet: its position, as the pin popup writes it. */
export function placeLabel(lng, lat) {
  const a = Math.abs(+lat).toFixed(4) + '°' + (+lat >= 0 ? 'N' : 'S');
  const b = Math.abs(+lng).toFixed(4) + '°' + (+lng >= 0 ? 'E' : 'W');
  return a + ' ' + b;
}

/** Places grouped by collection, the unfiled group last, each group newest first. */
export function groupPlaces(places) {
  const by = new Map();
  (Array.isArray(places) ? places : []).forEach((p) => {
    const k = String((p && p.collection) || '');
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  });
  const keys = Array.from(by.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return keys.map((k) => ({
    collection: k,
    places: by.get(k).slice().sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''))),
  }));
}

/** (collection-workspace) A collection holds places AND maps: both grouped by collection, the unfiled group
 *  last, each list newest first. A collection that holds only maps is a group too. */
export function groupCollection(places, views) {
  const by = new Map();
  const put = (k, kind, x) => { if (!by.has(k)) by.set(k, { collection: k, places: [], views: [] }); by.get(k)[kind].push(x); };
  (Array.isArray(places) ? places : []).forEach((p) => put(String((p && p.collection) || ''), 'places', p));
  (Array.isArray(views) ? views : []).forEach((v) => put(String((v && v.collection) || ''), 'views', v));
  const newest = (x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''));
  return Array.from(by.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map((k) => { const g = by.get(k); return { collection: k, places: g.places.slice().sort(newest), views: g.views.slice().sort(newest) }; });
}

/** Which saved places a request names: by id, by name (case- and width-insensitive, whole or part),
 *  by collection — or all of them when nothing is named. Never guesses beyond what was named. */
export function matchPlaces(places, q) {
  const list = Array.isArray(places) ? places : [];
  q = q || {};
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (q.id) return list.filter((p) => String(p.id) === String(q.id));
  let out = list;
  if (q.collection) { const c = norm(q.collection); out = out.filter((p) => norm(p.collection) === c); }
  if (q.name) {
    const n = norm(q.name);
    const exact = out.filter((p) => norm(p.name) === n);
    out = exact.length ? exact : out.filter((p) => norm(p.name).includes(n));
  }
  return out;
}

/* ── the doors ────────────────────────────────────────────────────────────────────────────────── */

function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  /* (map-document-unify) the fence on a document's steps is a 54000 too; the database names which fence it is */
  if (c === '54000' && /saved_view_steps_limit/.test(String((error && error.message) || ''))) return 'too_many_steps';
  if (c === '54000') return 'full';
  if (c === '22023' || c === '23514') return 'invalid';
  return 'failed';
}

/** Save a place. @returns {Promise<{ok, id?, created?, count?, error?}>} */
export async function savePlace(DB, p) {
  if (!DB) return { ok: false, error: 'unavailable' };
  p = p || {};
  const lng = +p.lng, lat = +p.lat;
  if (!isFinite(lng) || !isFinite(lat)) return { ok: false, error: 'invalid' };
  const name = String(p.name || '').trim() || placeLabel(lng, lat);
  try {
    const { data, error } = await DB.rpc('save_place', {
      p_name: name.slice(0, 120), p_lng: lng, p_lat: lat,
      p_note: p.note == null ? null : String(p.note).slice(0, 2000),
      p_collection: p.collection == null ? null : String(p.collection).trim().slice(0, 60),
      p_zoom: p.zoom == null || !isFinite(+p.zoom) ? null : Math.max(0, Math.min(24, +p.zoom)),
      p_source: p.source || null,
    });
    if (error) return { ok: false, error: errOf(error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.place_id) return { ok: false, error: 'failed' };
    return { ok: true, id: row.place_id, created: !!row.created, count: Number(row.place_count) || 0, name };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** The account's places. @returns {Promise<{ok, places?, error?}>} */
export async function listPlaces(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('saved_places').select(COLS).order('created_at', { ascending: false });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, places: Array.isArray(data) ? data : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Delete places by id. @returns {Promise<{ok, removed?, error?}>} */
export async function removePlaces(DB, ids) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!list.length) return { ok: true, removed: 0 };
  try {
    const { data, error } = await DB.from('saved_places').delete().in('id', list).select('id');
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Edit a place's words (name / note / collection). @returns {Promise<{ok, error?}>} */
async function updatePlace(DB, id, patch) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const row = {};
  if (patch && patch.name != null) row.name = String(patch.name).trim().slice(0, 120);
  if (patch && patch.note != null) row.note = String(patch.note).slice(0, 2000);
  if (patch && patch.collection != null) row.collection = String(patch.collection).trim().slice(0, 60);
  if (!Object.keys(row).length) return { ok: true };
  try {
    const { error } = await DB.from('saved_places').update(row).eq('id', String(id));
    return error ? { ok: false, error: errOf(error) } : { ok: true };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/* ── (collection-workspace) SAVED MAPS — the map itself, kept in the account ─────────────────────── */

/** The map as it is now, as the share link writes it (js/map-state.js) — '' when the map names no view yet. */
function viewStateNow() {
  try { const h = MapState.hash(); return MapState.carries(h) ? h.replace(/^#/, '') : ''; } catch (_) { return ''; }
}

/** A fragment read back and WRITTEN AGAIN by the codec: nothing the codec does not write is kept or opened
 *  (a map from someone else's collection is text from outside — the tour player's rule, js/tour-player.js canon). */
export function canonicalState(state) {
  return MapState.canonical(state).replace(/^#/, '');   /* (map-document-unify) the one rule, js/map-state.js */
}

/** A name for a map that has none: its caption, else the day it is saved. */
export function viewLabel(state, lang, now) {
  try { const st = MapState.decode('#' + String(state || '').replace(/^#/, '')); if (st && st.title) return st.title; } catch (_) { }
  const d = (now instanceof Date ? now : new Date()).toISOString().slice(0, 10);
  return IntMapLang.t(lang, 'Map · ' + d, '地図 · ' + d);
}

/** Save a map — `v.state`, one map's fragment — or a whole map document — `v.doc` (js/map-doc.js: a tour, a my map,
 *  an Atlas answer). A document of one map with no words of its own is saved exactly as a map is (the four-argument
 *  door); anything more goes with its kind and its steps (the six-argument one).
 *  @returns {Promise<{ok, id?, created?, count?, name?, error?}>} */
export async function saveView(DB, v) {
  if (!DB) return { ok: false, error: 'unavailable' };
  v = v || {};
  const doc = v.doc ? toSavedView(v.doc) : null;
  const state = doc ? doc.state : canonicalState(v.state);
  if (!state) return { ok: false, error: 'no_map' };
  const name = String(v.name || '').trim() || (doc && doc.name) || viewLabel(state, v.lang);
  const args = {
    p_name: name.slice(0, 120), p_state: state,
    p_note: v.note != null ? String(v.note).slice(0, 2000) : (doc && doc.note ? doc.note : null),
    p_collection: v.collection == null ? null : String(v.collection).trim().slice(0, 60),
  };
  if (doc && (doc.steps || (doc.kind !== 'view' && doc.kind !== 'map'))) { args.p_kind = doc.kind; args.p_steps = doc.steps; }
  try {
    const { data, error } = await DB.rpc('save_view', args);
    /* 23514: the row's own CHECK — a document past 1 MiB of steps (the migration states the bound) */
    if (error) { const e = errOf(error); return { ok: false, error: e === 'full' ? 'full_maps' : (error.code === '23514' ? 'too_large' : e) }; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.view_id) return { ok: false, error: 'failed' };
    return { ok: true, id: row.view_id, created: !!row.created, count: Number(row.view_count) || 0, name };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/* the sheet's own button is called `saveView` (the map-centre save, older than saved maps); it reaches this door by this name */
const saveMapDoor = (DB, v) => saveView(DB, v);

/** The account's saved maps. @returns {Promise<{ok, views?, error?}>} */
export async function listViews(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    let { data, error } = await DB.from('saved_views').select(VIEW_COLS).order('created_at', { ascending: false });
    if (error && error.code === '42703') ({ data, error } = await DB.from('saved_views').select(VIEW_COLS_BEFORE_DOCUMENTS).order('created_at', { ascending: false }));
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, views: Array.isArray(data) ? data : [] };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Delete saved maps by id. @returns {Promise<{ok, removed?, error?}>} */
async function removeViews(DB, ids) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!list.length) return { ok: true, removed: 0 };
  try {
    const { data, error } = await DB.from('saved_views').delete().in('id', list).select('id');
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Rename a saved map, or file it in a collection (map-document-unify: the Library's «Collection…»). @returns {Promise<{ok, error?}>} */
async function updateView(DB, id, patch) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const row = {};
  if (patch && patch.name != null) row.name = String(patch.name).trim().slice(0, 120);
  if (patch && patch.collection != null) row.collection = String(patch.collection).trim().slice(0, 60);
  if (!Object.keys(row).length) return { ok: true };
  try {
    const { error } = await DB.from('saved_views').update(row).eq('id', String(id));
    return error ? { ok: false, error: errOf(error) } : { ok: true };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Open a saved map: the address takes its fragment and the share link's own restore applies it — the path a
 *  pasted link takes (js/map-ui.js IntMapBookmark.restore), so a saved map opens exactly as its link would. */
export function openView(view) {
  const state = canonicalState(view && view.state);
  if (!state) return { ok: false, reason: 'no-link' };
  const B = typeof window !== 'undefined' ? window.IntMapBookmark : null;
  if (!B || typeof B.restore !== 'function') return { ok: false, reason: 'no-map' };
  MapState.address(null, '#' + state);
  try { B.restore({ shared: true }); } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  return { ok: true, state };
}

/* ══ (map-document-unify) A DOCUMENT, OPENED — one map through the share link's restore, several as a tour ══════════
   A document of more than one step is played in the classroom mode (js/tour-player.js) as a tour a teacher wrote: its
   steps are packed into a `t` by js/tours.js and played as `?tour=custom` — the same player, keys and read-back,
   nothing copied. Every fragment is written again by the codec on the way (js/map-doc.js readMapDoc). */
export async function openDoc(doc, opts) {
  const d = readMapDoc(doc); if (!d || !firstState(d)) return { ok: false, reason: 'no-link' };
  if (isTour(d) && !(opts && opts.asMap)) return playDoc(d, 1);
  return openView({ state: firstState(d) });
}
/** play a document in the classroom mode from step n (from 1) → the player's read-back */
export async function playDoc(doc, n) {
  const tour = toTourInput(doc); if (!tour) return { ok: false, reason: 'no-steps' };
  const [T, P] = await Promise.all([import('./tours.js'), import('./tour-player.js')]);
  return P.startTour(T.CUSTOM_TOUR_ID, Math.max(1, Math.round(+n || 1)), { t: await T.encodeCustomTour(tour) });
}
/** the document on paper: played, then handed to the worksheet (js/tour-worksheet.js pictures the tour that is playing) */
async function printDoc(doc) {
  await playDoc(doc, 1);
  const P = await import('./tour-player.js'); if (!P.status()) return { ok: false, reason: 'no-tour' };
  const W = await import('./tour-worksheet.js');
  return W.makeWorksheet();
}
/** what the reader calls each kind of document, in their language */
export function kindLabel(kind, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (kind === 'map') return T('My map', 'マイマップ');
  if (kind === 'tour') return T('Tour', 'ツアー');
  if (kind === 'brief') return T('Atlas answer', 'Atlas の回答');
  return T('Map', '地図');
}

/* ══ (map-document-unify) WHAT IS KEPT ON THIS DEVICE AND NOT IN THE ACCOUNT ══════════════════════════════════════
   The reader's own maps (js/my-map.js — its library in this browser), the tour being written (js/tour-builder.js) and
   the tour Atlas assembled in this tab (js/tour-player.js). Each is asked of its OWNER — this file does not know where
   they keep it — and becomes a document (`doc()`) only when it is saved or played. */
export async function deviceDocs() {
  const out = [];
  try {
    const Z = typeof window !== 'undefined' ? window.IntMapLazy : null;
    if (Z && Z.need) {
      await Z.need('myMap');
      const M = window.IntMapMyMap;
      if (M && M.state) M.state().maps.filter((m) => m.count).forEach((m) => out.push({ from: 'mymap', id: m.id, kind: 'map', title: m.title, count: m.count, current: !!m.current,
        doc: () => M.documentOf(m.id), open: () => { M.switchMap(m.id); M.open(); return { ok: true }; } }));
    }
  } catch (_) { }
  try {
    const B = await import('./tour-builder.js');
    const d = B.getDraft();
    if (d.steps.length) out.push({ from: 'tour-draft', id: 'tour-draft', kind: 'tour', title: d.title, count: d.steps.length,
      doc: () => fromTourDraft(B.getDraft(), 'tour-draft'), open: () => B.openBuilder() });
  } catch (_) { }
  try {
    const P = await import('./tour-player.js');
    const t = P.tempTour();
    if (t && t.steps && t.steps.length) out.push({ from: 'atlas-tour', id: 'atlas-tour', kind: 'tour', title: t.title, count: t.steps.length,
      doc: () => fromTourDraft(P.tempTour(), 'atlas-tour'), open: () => P.startTour('atlas', 1) });
  } catch (_) { }
  return out;
}

/** Put places on the map as pins (the session pin system — popup, Objects list, measure, remove).
 *  Fits the camera to them. @returns {string[]} the pin ids (an already-pinned place returns its pin). */
export function showPlaces(HOST, places, opts) {
  const ids = [];
  const list = Array.isArray(places) ? places : [];
  if (!HOST || typeof HOST.addPin !== 'function' || !list.length) return ids;
  const src = IntMapLang.t(HOST.lang, 'My places', 'マイプレイス');
  list.forEach((p) => {
    try {
      /* (collection-workspace) a place from someone else's published collection has no id here and is labelled by
         that collection (opts.source) — it is not one of the reader's saved places until they save it */
      const meta = { title: String(p.name || ''), description: String(p.note || ''),
        source: (opts && opts.source) || (src + (p.collection ? ' · ' + p.collection : '')) };
      if (p.id != null) meta.savedPlaceId = String(p.id);
      const id = HOST.addPin(+p.lng, +p.lat, meta);
      if (id != null) ids.push(String(id));
    } catch (_) { }
  });
  if (!(opts && opts.fly === false)) {
    try {
      const GE = IntMapGeoEngine;
      if (GE && GE.hasRenderer && GE.hasRenderer()) {
        if (list.length === 1) {
          const p = list[0];
          GE.camera.flyTo({ center: [+p.lng, +p.lat], zoom: p.zoom != null ? +p.zoom : Math.max(GE.camera.getZoom(), 12), duration: 900 });
        } else {
          let w = 180, s = 90, e = -180, n = -90;
          list.forEach((p) => { w = Math.min(w, +p.lng); e = Math.max(e, +p.lng); s = Math.min(s, +p.lat); n = Math.max(n, +p.lat); });
          GE.camera.fitBounds([[w, s], [e, n]], { padding: 70, maxZoom: 13, duration: 900 });
        }
      }
    } catch (_) { }
  }
  return ids;
}

/** The sentence for a failed door, in the reader's language. */
export function placeFailureText(error, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (error === 'sign_in') return T('Sign in to keep places in your account.', '場所をアカウントに保存するにはログインしてください。');
  if (error === 'full') return T('This account already holds the most places it can. Delete some to save more.', 'このアカウントに保存できる場所の上限に達しています。いくつか削除してから保存してください。');
  if (error === 'invalid') return T('That place needs a name and a position on the globe.', '場所には名前と地球上の位置が必要です。');
  if (error === 'full_maps') return T('This account already holds the most maps it can. Delete some to save more.', 'このアカウントに保存できる地図の上限に達しています。いくつか削除してから保存してください。');
  if (error === 'no_map') return T('The map has no view to save yet.', '保存できる地図の表示がまだありません。');
  if (error === 'too_many_steps') return T('A tour in your account can hold at most ' + STEPS_MAX + ' steps. Split it into two.', 'アカウントに保存できるツアーは ' + STEPS_MAX + ' ステップまでです。2 つに分けてください。');
  if (error === 'too_large') return T('This is too large to keep in your account. Shorten its words or remove some steps.', 'アカウントに保存するには大きすぎます。文を短くするか、ステップを減らしてください。');
  if (error === 'unavailable') return T('The account service is not reachable right now.', 'アカウントのサービスに接続できません。');
  return T('Could not reach your places. Please try again.', '場所を取得できませんでした。もう一度お試しください。');
}

/** The pin popup's «Save» (js/app-body.js): the pin's own words become the place's. */
export async function savePinAsPlace(HOST, pin) {
  const lang = HOST && HOST.lang;
  const toast = (s) => { try { HOST.imToast(s); } catch (_) { } };
  if (!HOST || !HOST.user) { toast(placeFailureText('sign_in', lang)); try { HOST && HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return { ok: false, error: 'sign_in' }; }
  const meta = (pin && pin.meta) || {};
  const r = await savePlace(HOST.DB, { name: meta.title, note: meta.description || '', lng: pin.lng, lat: pin.lat, source: 'pin' });
  if (!r.ok) { toast(placeFailureText(r.error, lang)); return r; }
  try { pin.meta = Object.assign({}, meta, { title: meta.title || r.name, savedPlaceId: String(r.id) }); } catch (_) { }
  toast(r.created
    ? IntMapLang.t(lang, 'Saved to My places: ' + r.name, 'マイプレイスに保存しました: ' + r.name)
    : IntMapLang.t(lang, 'Already in My places: ' + r.name, 'マイプレイスに保存済みです: ' + r.name));
  return r;
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
  if (document.getElementById('mpl-css')) return;
  const st = document.createElement('style'); st.id = 'mpl-css';
  st.textContent = '.mpl-lead{margin:2px 0 14px;font-size:13px;line-height:1.55;color:var(--text-muted);}'
    + '.mpl-add{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 8px;}'
    + '.mpl-add input{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:10px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:13px;}'
    + '.mpl-add input.mpl-name{grid-column:1 / span 2;}'
    + '.mpl-btns{display:flex;gap:8px;margin:0 0 14px;}'
    + '.mpl-btns button{flex:1;}'
    + '.mpl-row{display:flex;align-items:center;gap:8px;padding:8px 0;}'
    + '.mpl-row + .mpl-row{box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.mpl-txt{flex:1;min-width:0;cursor:pointer;border:none;background:transparent;padding:0;text-align:left;font:inherit;color:inherit;}'
    + '.mpl-txt b{display:block;font-size:13.5px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.mpl-txt span{display:block;font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.mpl-kind{flex:0 0 auto;font-size:10.5px;font-weight:600;color:var(--text-muted);border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:1px 5px;}'
    + '.mpl-edit{flex:1;min-width:0;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:13px;}'
    + '.mpl-ic{flex:0 0 auto;border:none;background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;padding:6px 8px;border-radius:8px;}'
    + '.mpl-ic:hover{background:rgba(128,128,128,0.12);color:var(--text-main);}'
    + '.mpl-ic.mpl-del:hover{background:#ff3b30;color:#fff;}'
    /* (collection-workspace) the group header carries the collection's publishing */
    + '.mpl-gh{display:flex;align-items:center;gap:8px;}'
    + '.mpl-gh .acct-grp-t{flex:1;min-width:0;}'
    + '.mpl-pub{flex:0 0 auto;border:none;background:transparent;color:var(--accent, #0a84ff);font-size:12px;font-weight:600;cursor:pointer;padding:4px 6px;border-radius:7px;}'
    + '.mpl-pub[aria-pressed="true"]{color:#34c759;}'
    + '.mpl-share{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:rgba(128,128,128,0.08);font-size:12.5px;line-height:1.5;}'
    + '.mpl-share p{margin:0 0 8px;color:var(--text-muted);}'
    + '.mpl-share input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:12px;margin:0 0 8px;}'
    + '.mpl-share .mpl-btns{margin:0;}'
    /* (map-document-unify) a document's actions, on a line under its row */
    + '.mpl-acts{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;margin:-4px 0 4px;padding-left:2px;}'
    + '.mpl-acts:empty{display:none;}'
    + '.mpl-acts + .mpl-row{box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.mpl-acts .mpl-edit{flex:1 1 140px;}';
  document.head.appendChild(st);
}

/** Open the Library (the «My places» sheet). `HOST` is the app host (DB, user, lang, addPin, imToast, openAuthModal).
 *  (map-document-unify) `opts.save` — a map document (js/map-doc.js) the reader asked to keep: it is saved into the
 *  account once the sheet has read the account, and the sheet says what happened. */
export async function openMyPlaces(HOST, opts) {
  const lang = HOST && HOST.lang;
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (!HOST || !HOST.user) {
    if (opts && opts.save) { try { HOST.imToast(placeFailureText('sign_in', lang)); } catch (_) { } }
    try { HOST && HOST.openAuthModal && HOST.openAuthModal(); } catch (_) { } return;
  }
  ensureStyle();
  const old = document.getElementById('mpl-modal'); if (old) old.remove();

  const msg = el('p', { cls: 'acct-msg', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { id: 'mpl-list' });
  const name = el('input', { cls: 'mpl-name', id: 'mpl-name', type: 'text', maxlength: '120', 'aria-label': T('Name', '名前'), placeholder: T('Name — e.g. Meeting point', '名前（例: 集合場所）') });
  const coll = el('input', { id: 'mpl-coll', type: 'text', maxlength: '60', 'aria-label': T('Collection', 'コレクション'), placeholder: T('Collection (optional)', 'コレクション（任意）') });
  const note = el('input', { id: 'mpl-note', type: 'text', maxlength: '2000', 'aria-label': T('Note', 'メモ'), placeholder: T('Note (optional)', 'メモ（任意）') });
  const saveView = el('button', { cls: 'acct-btn', id: 'mpl-save-view', text: T('Save the map centre', '地図の中心を保存') });
  saveView.dataset.effect = 'private';   /* writes the reader's own row (save_place) — what Atlas's control press reads (scripts/data-effects.mjs) */
  /* (collection-workspace) the map itself — layers, clock, base map, view, caption — into the same collection */
  const saveMap = el('button', { cls: 'acct-btn', id: 'mpl-save-map', text: T('Save this map', 'この地図を保存') });
  saveMap.dataset.effect = 'private';    /* writes the reader's own row (save_view) */
  const showAll = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'mpl-show-all', text: T('Show all places on the map', 'すべての場所を地図に表示') });
  /* (watch-places) a saved place can be watched — earthquakes, warnings, volcanoes and news near it (js/place-watch.js) */
  const watchBtn = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'mpl-watch', text: T('Watch places…', '見守る場所…') });
  const close = el('button', { cls: 'acct-close', id: 'mpl-close', text: T('Close', '閉じる') });
  const sheet = el('div', { cls: 'acct-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mpl-h', tabindex: '-1' }, [
    /* (map-document-unify) ONE SHELF: places, saved maps, my maps, tours and Atlas answers — and what this device holds that the account does not */
    el('h2', { cls: 'acct-h', id: 'mpl-h', text: T('Library', 'ライブラリ') }),
    el('p', { cls: 'mpl-lead', text: T('Everything you keep of a map: places, maps, your own drawn maps, tours and Atlas answers. What is saved to your account opens on every device you sign in on; file it into collections, and publish a collection as a read-only link.', '地図について残したものすべて——場所・地図・自分で描いた地図・ツアー・Atlas の回答——です。アカウントに保存したものはログインしたどの端末でも開けます。コレクションにまとめ、閲覧専用のリンクとして公開することもできます。') }),
    el('div', { cls: 'acct-grp-t', text: T('Save', '保存') }),
    el('div', { cls: 'acct-card' }, [el('div', { cls: 'mpl-add' }, [name, coll, note]), el('div', { cls: 'mpl-btns' }, [saveView, saveMap])]),
    msg,
    el('div', { cls: 'mpl-btns' }, [showAll, watchBtn]),
    list, close,
  ]);
  const m = el('div', { id: 'mpl-modal' }, [sheet]);
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:calc(var(--z-toast) + 2001);padding:20px;';
  const shut = () => { try { m.remove(); } catch (_) { } };
  close.onclick = shut;

  let places = [], views = [], shares = [];
  /* the publishing doors live in js/shared-collection.js, read when the sheet first needs them */
  const SC = () => import('./shared-collection.js');

  /* One collection's publishing: the sentence that says what publishing shows, then the link once it exists.
     `collection` null = everything the account holds. */
  const sharePanel = (collection, label, host) => {
    const S = shares.find((s) => (s.collection == null ? null : String(s.collection)) === (collection == null ? null : String(collection)));
    const box = el('div', { cls: 'mpl-share' });
    if (!S) {
      const go = el('button', { cls: 'acct-btn', type: 'button', text: T('Create a read-only link', '閲覧専用リンクを作成') });
      go.dataset.effect = 'outward';   /* makes the collection readable by anyone with the link */
      box.append(el('p', { text: T('Anyone with the link will see ' + label + ' as it is now — the names, notes and positions of its places, and its maps. They will not see your account or e-mail. You can stop publishing at any time.',
        'リンクを知っている人は誰でも、' + label + 'を今の内容で見られます（場所の名前・メモ・位置と、地図）。アカウントやメールアドレスは見えません。公開はいつでもやめられます。') }), el('div', { cls: 'mpl-btns' }, [go]));
      go.onclick = async () => {
        go.disabled = true;
        const M = await SC();
        /* the title the visitor reads: the collection's name; the unfiled group and «everything» have none of their own */
        const title = collection ? collection : (collection === '' ? T('Places', '場所') : T('Places and maps', '場所と地図'));
        const r = await M.publishCollection(HOST.DB, collection, title);
        go.disabled = false;
        if (!r.ok) { msg.textContent = M.shareFailureText(r.error, lang); return; }
        await reload();
        msg.textContent = T('Published: ' + label + ' — copy the link below.', '公開しました: ' + label + '。下のリンクをコピーしてください。');
      };
    } else {
      const link = el('input', { type: 'text', readonly: 'readonly', 'aria-label': T('Link', 'リンク') });
      link.value = S.url;
      const copy = el('button', { cls: 'acct-btn', type: 'button', text: T('Copy link', 'リンクをコピー') });
      const stop = el('button', { cls: 'acct-btn acct-btn-quiet', type: 'button', text: T('Stop publishing', '公開をやめる') });
      stop.dataset.effect = 'private';   /* deletes the reader's own share row: the link stops answering */
      box.append(el('p', { text: T('Published as a read-only link. Whoever opens it sees this collection as it is now.', '閲覧専用のリンクで公開中です。開いた人には、このコレクションの今の内容が見えます。') }), link, el('div', { cls: 'mpl-btns' }, [copy, stop]));
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(S.url); msg.textContent = T('Link copied.', 'リンクをコピーしました。'); }
        catch (_) { try { link.select(); } catch (__) { } msg.textContent = T('Select the link and copy it.', 'リンクを選択してコピーしてください。'); }
      };
      let armed = 0;
      stop.onclick = async () => {
        if (Date.now() - armed > 4000) { armed = Date.now(); stop.textContent = T('Stop? The link stops working', 'やめる？ リンクは開けなくなります'); return; }
        const M = await SC();
        const r = await M.unpublish(HOST.DB, [S.id]);
        if (!r.ok) { msg.textContent = M.shareFailureText(r.error, lang); return; }
        await reload();
        msg.textContent = T('No longer published: ' + label, '公開をやめました: ' + label);
      };
    }
    host.appendChild(box);
  };

  /* the header of a group, with its publishing toggle */
  const groupHead = (collection, title, label) => {
    const S = shares.find((s) => (s.collection == null ? null : String(s.collection)) === (collection == null ? null : String(collection)));
    const pub = el('button', { cls: 'mpl-pub', type: 'button', 'aria-expanded': 'false', 'aria-pressed': S ? 'true' : 'false', text: S ? T('Published', '公開中') : T('Share', '共有') });
    const head = el('div', { cls: 'mpl-gh' }, [el('div', { cls: 'acct-grp-t', text: title }), pub]);
    const slot = el('div');
    pub.onclick = () => {
      const open = pub.getAttribute('aria-expanded') === 'true';
      slot.textContent = '';
      pub.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (!open) sharePanel(collection, label, slot);
    };
    return [head, slot];
  };

  const render = () => {
    list.textContent = '';
    if (!places.length && !views.length) {
      list.appendChild(el('div', { cls: 'acct-card' }, [el('div', { cls: 'mpl-lead', text: T('Nothing saved yet. Save the map centre or this map above, or open a pin and press Save.', 'まだ何も保存していません。上で地図の中心やこの地図を保存するか、ピンを開いて「保存」を押してください。') })]));
      showAll.disabled = true; renderDevice(); return;
    }
    showAll.disabled = !places.length;
    /* everything at once — one link for every place and map in the account */
    groupHead(null, T('Everything', 'すべて') + ' · ' + (places.length + views.length), T('all your places and maps', 'すべての場所と地図')).forEach((n) => list.appendChild(n));
    groupCollection(places, views).forEach((g) => {
      const gname = g.collection || T('Unfiled', '未分類');
      groupHead(g.collection, gname + ' · ' + (g.places.length + g.views.length), T('the collection «' + gname + '»', 'コレクション「' + gname + '」')).forEach((n) => list.appendChild(n));
      const rows = [];
      g.places.forEach((p) => {
        const txt = el('button', { cls: 'mpl-txt', type: 'button', title: T('Show on the map', '地図に表示') }, [
          el('b', { text: p.name }), el('span', { text: p.note || placeLabel(p.lng, p.lat) }),
        ]);
        const show = () => { showPlaces(HOST, [p]); shut(); };
        txt.onclick = show;
        const ren = el('button', { cls: 'mpl-ic', text: T('Rename', '名前変更') });
        ren.dataset.effect = 'private';
        /* the name is edited IN the row — window.prompt is not used in the account sheets (docs/architecture/08-ui.md §8.1.2:
           no styling, no translation, and on a phone it opens under the page's origin rather than IntMap's name) */
        let editing = null;
        ren.onclick = async () => {
          if (!editing) {
            editing = el('input', { cls: 'mpl-edit', type: 'text', maxlength: '120', 'aria-label': T('New name', '新しい名前') });
            editing.value = p.name;
            editing.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ren.click(); } else if (e.key === 'Escape') { e.stopPropagation(); render(); } };
            txt.replaceWith(editing); ren.textContent = T('Save', '保存');
            try { editing.focus(); editing.select(); } catch (_) { }
            return;
          }
          const v = editing.value.trim();
          if (!v || v === p.name) { render(); return; }
          const r = await updatePlace(HOST.DB, p.id, { name: v });
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          p.name = v.slice(0, 120); render();
        };
        const del = el('button', { cls: 'mpl-ic mpl-del', text: T('Delete', '削除') });
        del.dataset.effect = 'destructive';
        /* a delete cannot be undone, so the first press arms it and says so; the second, within a few seconds, deletes */
        let armed = 0;
        del.onclick = async () => {
          if (Date.now() - armed > 4000) { armed = Date.now(); del.textContent = T('Delete?', '削除する？'); setTimeout(() => { if (del.isConnected && Date.now() - armed >= 4000) del.textContent = T('Delete', '削除'); }, 4100); return; }
          const r = await removePlaces(HOST.DB, [p.id]);
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          places = places.filter((x) => x.id !== p.id); render();
          msg.textContent = T('Deleted: ' + p.name, '削除しました: ' + p.name);
        };
        rows.push(el('div', { cls: 'mpl-row' }, [txt, ren, del]));
      });
      /* (collection-workspace) a saved map: open it (the share link's own restore), rename it, delete it.
         (map-document-unify) …and every saved document: its kind on the row; a tour (several steps) opens in the
         classroom mode and can be printed as a worksheet; any of them can be moved to another collection. */
      g.views.forEach((v) => {
        const d = fromSavedView(v);
        const tour = isTour(d);
        const sub = v.note || (tour ? T(d.steps.length + ' steps', d.steps.length + ' ステップ') : T('Saved map', '保存した地図'));
        const txt = el('button', { cls: 'mpl-txt', type: 'button', title: tour ? T('Play this tour', 'このツアーを再生') : T('Open this map', 'この地図を開く') }, [
          el('b', { text: v.name }), el('span', { text: sub }),
        ]);
        /* a tour leaves the sheet first: the classroom mode takes the screen while its first step settles */
        txt.onclick = async () => { if (tour) { shut(); await openDoc(d); return; } const r = await openDoc(d); if (!r.ok) { msg.textContent = placeFailureText('no_map', lang); return; } shut(); };
        const ren = el('button', { cls: 'mpl-ic', text: T('Rename', '名前変更') });
        ren.dataset.effect = 'private';
        let editing = null;
        ren.onclick = async () => {
          if (!editing) {
            editing = el('input', { cls: 'mpl-edit', type: 'text', maxlength: '120', 'aria-label': T('New name', '新しい名前') });
            editing.value = v.name;
            editing.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ren.click(); } else if (e.key === 'Escape') { e.stopPropagation(); render(); } };
            txt.replaceWith(editing); ren.textContent = T('Save', '保存');
            try { editing.focus(); editing.select(); } catch (_) { }
            return;
          }
          const nv = editing.value.trim();
          if (!nv || nv === v.name) { render(); return; }
          const r = await updateView(HOST.DB, v.id, { name: nv });
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          v.name = nv.slice(0, 120); render();
        };
        const del = el('button', { cls: 'mpl-ic mpl-del', text: T('Delete', '削除') });
        del.dataset.effect = 'destructive';
        let armed = 0;
        del.onclick = async () => {
          if (Date.now() - armed > 4000) { armed = Date.now(); del.textContent = T('Delete?', '削除する？'); setTimeout(() => { if (del.isConnected && Date.now() - armed >= 4000) del.textContent = T('Delete', '削除'); }, 4100); return; }
          const r = await removeViews(HOST.DB, [v.id]);
          if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
          views = views.filter((x) => x.id !== v.id); render();
          msg.textContent = T('Deleted: ' + v.name, '削除しました: ' + v.name);
        };
        rows.push(el('div', { cls: 'mpl-row' }, [el('span', { cls: 'mpl-kind', text: kindLabel(d ? d.kind : 'view', lang) }), txt, ren, del]));
        rows.push(docActions(d, { collection: v }));
      });
      list.appendChild(el('div', { cls: 'acct-card' }, rows));
    });
    renderDevice();
  };

  /* ── (map-document-unify) the actions a document has, as a line under its row — only the ones that mean something
     for it: a tour is played and printed; a saved row is moved to a collection; a document on this device is saved to
     the account (into the collection typed above, if any). ── */
  const docActions = (d, o) => {
    const acts = [];
    /* each control states what its press does in its own markup (scripts/data-effects.mjs reads the literal) */
    const btn = (text) => { const b = el('button', { cls: 'mpl-ic', type: 'button', text }); acts.push(b); return b; };
    if (isTour(d)) {
      const play = btn(T('Play as a tour', 'ツアーとして再生'));
      play.dataset.effect = 'none';
      play.onclick = async () => { shut(); await playDoc(d, 1); };
      const print = btn(T('Print worksheet', 'ワークシートを印刷'));
      print.dataset.effect = 'none';
      print.onclick = async () => { shut(); await printDoc(d); };
    }
    if (o.save) {
      const keep = btn(T('Save to account', 'アカウントに保存'));
      keep.dataset.effect = 'private';   /* writes the reader's own row (save_view) */
      keep.onclick = async () => {
        keep.disabled = true;
        const r = await saveMapDoor(HOST.DB, { doc: o.save(), collection: coll.value || null, lang });
        keep.disabled = false;
        if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
        msg.textContent = r.created ? T('Saved to your Library: ' + r.name, 'ライブラリに保存しました: ' + r.name) : T('Already in your Library — updated: ' + r.name, 'ライブラリに保存済みでした（更新）: ' + r.name);
        await reload();
      };
    }
    if (o.collection) {
      const v = o.collection;
      /* filed in another collection IN the row (no window.prompt — §8.1.2), the same gesture as Rename */
      let editing = null;
      const mv = btn(T('Collection…', 'コレクション…'));
      mv.dataset.effect = 'private';   /* re-files the reader's own row */
      mv.onclick = async () => {
        if (!editing) {
          editing = el('input', { cls: 'mpl-edit', type: 'text', maxlength: '60', 'aria-label': T('Collection', 'コレクション'), placeholder: T('Collection (empty: unfiled)', 'コレクション（空欄: 未分類）') });
          editing.value = v.collection || '';
          editing.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); mv.click(); } else if (e.key === 'Escape') { e.stopPropagation(); render(); } };
          mv.before(editing); mv.textContent = T('Move', '移す');
          try { editing.focus(); editing.select(); } catch (_) { }
          return;
        }
        const nc = editing.value.trim();
        if (nc === (v.collection || '')) { render(); return; }
        const r = await updateView(HOST.DB, v.id, { collection: nc });
        if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
        v.collection = nc.slice(0, 60); render();
        msg.textContent = T('Moved to ' + (nc || 'Unfiled') + ': ' + v.name, (nc || '未分類') + ' に移しました: ' + v.name);
      };
    }
    return el('div', { cls: 'mpl-acts' }, acts);
  };

  /* ── (map-document-unify) ON THIS DEVICE — the maps, tours and drafts that are not in the account yet ── */
  const renderDevice = () => {
    if (!device.length) return;
    list.appendChild(el('div', { cls: 'acct-grp-t', text: T('On this device', 'この端末') + ' · ' + device.length }));
    list.appendChild(el('p', { cls: 'mpl-lead', text: T('Kept in this browser only. Save one to your account to open it on every device and file it in a collection.', 'このブラウザにだけあります。アカウントに保存すると、どの端末でも開け、コレクションにも入れられます。') }));
    const rows = [];
    device.forEach((x) => {
      const sub = x.from === 'mymap' ? T(x.count + ' item(s) drawn', '描いたもの ' + x.count + ' 件')
        : x.from === 'tour-draft' ? T('The tour you are writing · ' + x.count + ' steps', '作成中のツアー · ' + x.count + ' ステップ')
        : T('Made by Atlas in this tab · ' + x.count + ' steps', 'このタブで Atlas が作成 · ' + x.count + ' ステップ');
      const txt = el('button', { cls: 'mpl-txt', type: 'button', title: T('Open', '開く') }, [el('b', { text: x.title || (x.kind === 'tour' ? T('Untitled tour', '無題のツアー') : T('Untitled map', '無題の地図')) }), el('span', { text: sub })]);
      txt.onclick = async () => { await x.open(); shut(); };
      rows.push(el('div', { cls: 'mpl-row' }, [el('span', { cls: 'mpl-kind', text: kindLabel(x.kind, lang) }), txt]));
      let d = null; try { d = x.kind === 'tour' ? x.doc() : null; } catch (_) { d = null; }
      rows.push(docActions(d, { save: () => x.doc() }));
    });
    list.appendChild(el('div', { cls: 'acct-card' }, rows));
  };
  let device = [];
  const reload = async () => {
    const [rp, rv, rs, dv] = await Promise.all([listPlaces(HOST.DB), listViews(HOST.DB), SC().then((M) => M.listShares(HOST.DB)).catch(() => ({ ok: false })), deviceDocs().catch(() => [])]);
    device = dv || [];
    if (!rp.ok) { msg.textContent = placeFailureText(rp.error, lang); return; }
    places = rp.places; views = rv.ok ? rv.views : []; shares = rs.ok ? rs.shares : [];
    render();
  };
  showAll.onclick = () => { showPlaces(HOST, places); shut(); };
  watchBtn.onclick = () => { shut(); import('./place-watch.js').then((M) => M.openWatchDigest(HOST)).catch(() => { }); };
  saveView.onclick = async () => {
    let c = null, z = null;
    try { const GE = IntMapGeoEngine; if (GE && GE.hasRenderer && GE.hasRenderer()) { c = GE.camera.getCenter(); z = GE.camera.getZoom(); } } catch (_) { }
    const lng = c && (Array.isArray(c) ? c[0] : c.lng), lat = c && (Array.isArray(c) ? c[1] : c.lat);
    if (lng == null || lat == null) { msg.textContent = placeFailureText('invalid', lang); return; }
    saveView.disabled = true;
    const r = await savePlace(HOST.DB, { name: name.value, collection: coll.value, note: note.value, lng, lat, zoom: z, source: 'reader' });
    saveView.disabled = false;
    if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
    msg.textContent = r.created ? T('Saved: ' + r.name, '保存しました: ' + r.name) : T('Already saved — updated: ' + r.name, '保存済みの場所を更新しました: ' + r.name);
    name.value = ''; note.value = '';
    await reload();
  };
  saveMap.onclick = async () => {
    saveMap.disabled = true;
    const r = await saveMapDoor(HOST.DB, { name: name.value, collection: coll.value, note: note.value, state: viewStateNow(), lang });
    saveMap.disabled = false;
    if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
    msg.textContent = r.created ? T('Map saved: ' + r.name, '地図を保存しました: ' + r.name) : T('This map was already saved — updated: ' + r.name, '保存済みの地図を更新しました: ' + r.name);
    name.value = ''; note.value = '';
    await reload();
  };

  try {
    if (window.IntMapDialog) window.IntMapDialog.open(m, { panel: sheet, labelledby: 'mpl-h', backdrop: true, close: shut });
    else document.body.appendChild(m);
  } catch (_) { document.body.appendChild(m); }
  try { sheet.focus(); } catch (_) { }
  list.appendChild(el('p', { cls: 'mpl-lead', text: T('Reading your places…', '場所を読み込み中…') }));
  await reload();
  if (opts && opts.save) {
    const r = await saveMapDoor(HOST.DB, { doc: opts.save, lang });
    if (!r.ok) { msg.textContent = placeFailureText(r.error, lang); return; }
    msg.textContent = r.created ? T('Saved to your Library: ' + r.name, 'ライブラリに保存しました: ' + r.name) : T('Already in your Library — updated: ' + r.name, 'ライブラリに保存済みでした（更新）: ' + r.name);
    await reload();
  }
}
