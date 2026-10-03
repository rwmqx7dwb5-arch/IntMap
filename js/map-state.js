// @ts-check
/* ============================================================================
 *  IntMap · MAP STATE — the one named state of the map, and every form of it derived  (map-state-store)
 * ----------------------------------------------------------------------------
 *  「構造改革とイノベーション。保守ではなく改革。」 The map's state — where the camera is, which
 *  projection and base map, which instant, which layers, the comparison window, the simulators' own
 *  numbers — had no owner with a name. Six things each assembled their own copy of it: the address
 *  bar's `#v=…` (js/map-ui.js, a hand-concatenated string and nine hand-written regular expressions
 *  to read it back), the reader's saved session (js/session-tabs.js), the share link
 *  (IntMapBookmark.link), Atlas's picture of the app (js/atlas-state.js `camera` / `time`), the
 *  comparison window's `ct=` (js/compare.js) and the window variables between them. Four defects in
 *  one day came out of that shape — a restored link losing the clock to the war layer, a second link
 *  pasted during a restore being dropped, a link without `tt` not returning to now, a layer writing
 *  the clock on its own — and each was fixed where it surfaced, because there was no place where
 *  «the state» was.
 *
 *  THIS IS THAT PLACE. Three parts, one file:
 *    · SCHEMA — every field the map's state has, declared once: its address-bar spelling (and the
 *      legacy spellings it still reads), whether it is restored on every open or only on a full one,
 *      when in the restore it is applied, how the saved session spells it, and which module owns it.
 *    · CODEC  — the address-bar form as a PURE projection of the state tree (`encode` / `decode`), so
 *      the link, the address bar and the embed are one function of one value. Byte-compatible with
 *      every link shipped before it (tests/map-state-store-checks.test.mjs round-trips every one the
 *      repository holds).
 *    · STORE  — owners register `read()` (the truth of their field) and `apply()` (carrying out an
 *      intent); readers subscribe; a restore is ONE application of a decoded state, with a generation
 *      (#881's restoreGen, moved here), and every change a reader is told about says whether the
 *      restore made it or the reader did.
 *
 *  ⚠ THE STORE DOES NOT HOLD A SECOND COPY OF ANYTHING. A field's value is what its owner's `read()`
 *  says now — the camera is the renderer's, the clock is Chronos's — so the store cannot drift from
 *  the map. What the store owns is the SHAPE (the schema), the FORMS (codec, session, link) and the
 *  RESTORE (generation, cause, staging).
 *
 *  ⚠ NO WINDOW GLOBAL. Every reader imports `MapState`; the browser specs reach it through the
 *  surfaces that already existed (IntMapBookmark), so scripts/global-surface.mjs has nothing new
 *  to count. This module imports nothing, so any module may import it without an ordering question —
 *  ⚠ but a module that LAZY chunks also import (js/chronos.js) must not: see the note at the `time`
 *  owner in js/map-ui.js (measured: one more request for every session).
 * ==========================================================================*/

/** @typedef {{ lng:number, lat:number, zoom:number, bearing:number, pitch:number, proj:('globe'|'flat'|null) }} ViewValue */
/** @typedef {null | { at:string, instant?:(string|null), year?:(number|null) } | { daysAgo:number }} TimeValue */
/** @typedef {null | { xray:boolean, at:string }} CompareValue */
/** @typedef {{ gen:number, full:boolean, cause:string, later:(fn:()=>void, ms:number)=>void, current:()=>boolean, state:Object<string,any> }} RestoreCtx */
/** @typedef {{ read?:()=>any, apply?:(value:any, ctx:RestoreCtx, prepared?:any)=>void, prepare?:(value:any, ctx:RestoreCtx)=>any }} Owner */
/** @typedef {{ key:string, cause:string, gen:number, restoring:boolean }} ChangeEvent */

/* ══ THE SCHEMA ══════════════════════════════════════════════════════════════════════════════════
   ⚠ ORDER IS THE ADDRESS BAR'S ORDER: `#v=…&l=…&d=…&tt=…&cmp=…&ct=…&sat=1&t3=1&s=…&title=…&note=…&b=…`, the order js/map-ui.js
   concatenated since #R211 (the caption appended after it, map-postcard). It is also the restore order — every field but the view is staged on a
   timer, and two steps at the same instant (the isobars' switch and the clock, both at 900 ms) fire in
   the order they were scheduled, which is this order, as before.
   `restore` — 'always': applied on every open, a plain reload included (the view; #R42b);
               'full':   only on a shared / first / non-crashed open (js/map-ui.js decides `full`).
   `at`      — when in the restore the owner's `apply` runs, in ms after the restore began; 0 is
               synchronous. These are the delays js/map-ui.js has staged since #R101/#R211 (the layer
               rows build lazily from ~900 ms; the simulators are lazy modules, hence the late pass) —
               they move only with a measurement, and this table is where they are stated.
   `session` — the key the reader's saved session (localStorage `intmap_session2`) uses, or null.
   `owner`   — the module that registers the field's `read`/`apply`. Documentation, and what
               tests/map-state-store-checks.test.mjs holds against the registrations in the tree. The `time`
               field's VALUE is the master clock's (js/chronos.js); js/map-ui.js registers it — see the note
               there for the measured reason the clock does not import this module itself. */
export const SCHEMA = Object.freeze([
  { key: 'view',    params: ['v'],         restore: 'always', at: [0],                session: null,     owner: 'js/map-ui.js',
    doc: 'camera centre, zoom, bearing, pitch and projection' },
  { key: 'layers',  params: ['l'],         restore: 'full',   at: [700, 1800, 3200],  session: null,     owner: 'js/map-ui.js',
    doc: 'the data layers the link carries — the manifest\'s `share` LAYER rows that are ticked (never a map display item)' },
  /* (basic-display-not-layers) the map display is not a layer (「基本表示をレイヤーって言うな」, 2026-10-02), so the
     display items a link carries — day & night, 3-D buildings: the manifest's `share` rows of `kind: 'display'` —
     have their own field, applied at the same instants and in the same way as the layers were. ⚠ A LINK WRITTEN
     BEFORE THIS FIELD carried them in `l=`, and its silence about them meant «off». So a link with no `d=` reads
     its display items out of `l=` (decode below): this field's owner keeps the ids that are display items, the
     layers' owner drops them, and an old link opens the same map. A new link never puts one in `l=`, so the same
     rule reads a new link's silence as «off» too. */
  { key: 'display', params: ['d'],         restore: 'full',   at: [700, 1800, 3200],  session: null,     owner: 'js/map-ui.js',
    doc: 'the map display items the link carries — the manifest\'s `share` rows of `kind: \'display\'` that are ticked; with no `d`, the ids `l` names (links from before this field)' },
  { key: 'time',    params: ['tt', 'ts'],  restore: 'full',   at: [900],              session: 'year',   owner: 'js/map-ui.js',
    doc: 'the master clock: null is «now»; `ts` is the day-based form links used before #R101' },
  { key: 'compare', params: ['cmp', 'ct'], restore: 'full',   at: [1300],             session: null,     owner: 'js/compare.js',
    doc: 'the comparison window: open or not, X-ray or side by side, and its own instant (\'\' follows the main map)' },
  { key: 'base',    params: ['sat'],       restore: 'always', at: [300],              session: 'base',   owner: 'js/map-ui.js',
    doc: 'the base map: \'map\' or \'sat\'' },
  { key: 'terrain', params: ['t3'],        restore: 'full',   at: [1200],             session: 'terr3d', owner: 'js/map-ui.js',
    doc: '3-D terrain on or off' },
  { key: 'sims',    params: ['s'],         restore: 'full',   at: [1500, 4000],       session: null,     owner: 'js/map-ui.js',
    doc: 'every simulator\'s own inputs (IntMapShareState), one opaque base64url parameter' },
  /* (map-postcard) THE LINK'S MEANING, NOT ONLY ITS STATE. A link carried where the map is and what it draws, and
     nothing of why it was sent — the sentence the sender would have typed beside it in a chat stayed in the chat and
     was lost the moment the link was forwarded. Two plain-text fields, written by the share panel (or Atlas) and shown
     to whoever opens the link as a quiet caption over the map, in the document's title, in an embed, and on the map
     postcard (js/map-recorder.js). Last in the address bar, so every link written before them is byte-identical.
     ⚠ 'always', not 'full': a caption is text, it cannot be the layer that brought the app down (the reason a
     crashed reload falls back to the view alone), so a reload never loses what the link says. Applied at the first staged
     instant (the base map's, 300 ms): it depends on nothing, and the synchronous step stays the camera's alone. */
  { key: 'title',   params: ['title'],     restore: 'always', at: [300],              session: null,     owner: 'js/map-ui.js',
    doc: 'the link\'s title — plain text, at most TITLE_MAX characters; absent is «no title»' },
  { key: 'note',    params: ['note'],      restore: 'always', at: [300],              session: null,     owner: 'js/map-ui.js',
    doc: 'the sender\'s note — plain text, at most NOTE_MAX characters; absent is «no note»' },
  /* (atlas-briefing) AN ATLAS INVESTIGATION, CARRIED BY THE LINK. The caption above says why a link was sent; this
     field carries what was FOUND — one or more of the reader's notebook entries (question, answer, the view, the
     calls that drew it, the query rows, the cited sources), packed by js/atlas-briefing-codec.js into one opaque
     base64url value. In the fragment, so the host never receives it (RFC 3986 §3.5). Last in the address bar, so
     every link written before it is byte-identical. 'full', not 'always': opening a briefing rebuilds a map, and
     a reload whose previous attempt at this very address did not survive must not run it again (the crash rule
     the layers obey). Applied at the first staged instant: the owner only fetches the reader, which waits for
     this restore to settle before it puts the briefing's own view back. */
  { key: 'brief',   params: ['b'],         restore: 'full',   at: [300],              session: null,     owner: 'js/briefing-link.js',
    doc: 'an Atlas briefing — packed notebook entries (js/atlas-briefing-codec.js); absent is «no briefing»' },
  { key: 'toggles', params: [],            restore: null,     at: [],                 session: 'layers', owner: 'js/session-tabs.js',
    doc: 'every ticked row of the layer panel, base toggles included — the session\'s set, a superset of `layers` (see the note at `toggles` in js/session-tabs.js)' },
]);
/** @param {string} key */
const FIELD = (key) => SCHEMA.find((f) => f.key === key) || null;
/** every address-bar parameter the schema spells, legacy spellings included */
export const PARAMS = Object.freeze(SCHEMA.reduce((a, f) => a.concat(f.params), /** @type {string[]} */ ([])));
/* (share-embed-distribution) the restore's closing step: 3.5 s, after the last layer pass (3.2 s) and before the
   simulators' late pass (4 s) — a link that arrives inside it is queued, not dropped (js/map-ui.js). */
export const SETTLE_MS = 3500;
/* (map-postcard) how long a caption may be. ESTIMATES, chosen for the places the text is read, not measured
   thresholds: a title is a headline — 100 characters is two lines of the postcard's title at its smallest size in
   the 1200 × 630 frame (js/map-recorder.js layoutFrame) — and a note is the length of a post, 280 characters (the
   unit X / Twitter set), which is what a sender writes beside a link. They bound a HAND-MADE link too: the codec
   cuts there on the way in, so an address cannot push a page of text into the caption, the title bar or a picture.
   Expire if the postcard's type sizes change. */
export const TITLE_MAX = 100;
export const NOTE_MAX = 280;
/** a caption's text as the codec keeps it: control characters (and the bidirectional overrides that would let a
    link reorder the words around it) become spaces, runs of white space become one, trimmed, and cut at `max`
    characters — characters, not UTF-16 units, so a cut never splits an emoji or a surrogate pair.
    @param {any} s @param {number} max @returns {string} */
export function captionText(s, max) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const a = Array.from(t); return a.length > max ? a.slice(0, max).join('').trim() : t;
}

/* ══ THE CODEC — pure, no DOM, no clock ═══════════════════════════════════════════════════════════ */

/** the raw text of one parameter, or null — the same `[#&]name=([^&]+)` every reader used to write by hand
    @param {string} hash @param {string} name @returns {string|null} */
function param(hash, name) { const m = new RegExp('[#&]' + name + '=([^&]+)').exec(String(hash || '')); return m ? m[1] : null; }
/** base64url of the JSON — short enough for an address bar, and opaque so nobody hand-edits it (#R211)
    @param {any} o @returns {string} */
export function packObject(o) { try { if (!o) return '';
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (_) { return ''; } }
/** @param {string} s @returns {any} */
export function unpackObject(s) { try { const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch (_) { return null; } }

/** (atlas-briefing) the one test of a packed briefing's spelling — base64url, nothing that could end the parameter
    @param {any} s @returns {string} the value, or '' */
function briefText(s) { const t = String(s == null ? '' : s); return /^[A-Za-z0-9_-]+$/.test(t) ? t : ''; }

/** does this address name a map state at all? (a `v=` — a link without one is not a map link)
    @param {string} hash */
export function carries(hash) { return /[#&]v=/.test(String(hash || '')); }

/** the address-bar form → the state tree. Fields the link does not name are given the value their
    ABSENCE states (no `tt` is «now», no `l` is «no data layers», no `cmp` is «no window»; no `d` is null, «what `l` names», see `display`) — a full
    restore applies the whole state a link describes (share-embed-distribution).
    @param {string} hash @returns {{ view: ViewValue|null, layers: string[], display: (string[]|null), time: TimeValue, compare: CompareValue, base: ('map'|'sat'), terrain: boolean, sims: any, title: string, note: string, brief: string }} */
export function decode(hash) {
  const H = String(hash || '');
  let view = null;
  const v = param(H, 'v');
  if (v != null) { try { const p = decodeURIComponent(v).split(',');
    view = { lng: +p[0], lat: +p[1], zoom: +p[2], bearing: +p[3] || 0, pitch: +p[4] || 0,
      proj: p[5] === 'g' ? 'globe' : (p[5] === 'f' ? 'flat' : null) }; } catch (_) { view = null; } }
  const l = param(H, 'l');
  let layers = []; try { layers = l ? decodeURIComponent(l).split(',') : []; } catch (_) { layers = []; }
  /* (basic-display-not-layers) null when there is no `d`: a link from before the field, whose display items are
     whatever `l` names — the owner reads them from `ctx.state.layers` (the codec cannot tell a display id from a
     layer id, and it imports nothing). Null and not a copy of `l`, so encode(decode(link)) is the link. */
  const d = param(H, 'd');
  /** @type {string[]|null} */ let display = null; if (d != null) { try { display = decodeURIComponent(d).split(','); } catch (_) { display = []; } }
  /** @type {TimeValue} */ let time = null;
  const tt = param(H, 'tt');
  if (tt != null) { try { time = { at: decodeURIComponent(tt) }; } catch (_) { time = null; } }
  else { const ts = /[#&]ts=(\d+)/.exec(H); if (ts) time = { daysAgo: 3650 - parseInt(ts[1], 10) }; }
  /** @type {CompareValue} */ let compare = null;
  const cmp = param(H, 'cmp');
  if (cmp != null) { const ct = param(H, 'ct'); let at = '';
    try { at = ct != null ? decodeURIComponent(ct) : ''; } catch (_) { at = ''; }
    compare = { xray: cmp === 'x', at }; }
  const s = param(H, 's');
  /* (map-postcard) a caption is text the link's author typed: decoded, then cleaned and cut by the same rule the writer
     applies (captionText) — a malformed escape is «no caption», never an exception */
  const text = (/** @type {string} */ name, /** @type {number} */ max) => { const r = param(H, name); if (r == null) return '';
    try { return captionText(decodeURIComponent(r), max); } catch (_) { return ''; } };
  return { view, layers, display, time, compare,
    base: /[#&]sat=1/.test(H) ? 'sat' : 'map',
    terrain: /[#&]t3=1/.test(H),
    sims: s ? unpackObject(s) : null,
    title: text('title', TITLE_MAX), note: text('note', NOTE_MAX),
    brief: briefText(param(H, 'b')) };
}

/** the state tree → the address-bar form. '' when there is no view (nothing to link to).
    @param {{ view?: ViewValue|null, layers?: string[], display?: (string[]|null), time?: TimeValue, compare?: CompareValue, base?: string, terrain?: boolean, sims?: any, title?: string, note?: string, brief?: string }} st
    @returns {string} */
export function encode(st) {
  try {
    const v = st && st.view; if (!v) return '';
    let h = '#v=' + [(+v.lng).toFixed(4), (+v.lat).toFixed(4), (+v.zoom).toFixed(2), Math.round(+v.bearing || 0), Math.round(+v.pitch || 0),
      (v.proj === 'globe' ? 'g' : 'f')].join(',');
    const ls = st.layers || []; if (ls.length) h += '&l=' + ls.join(',');
    const ds = st.display || []; if (ds.length) h += '&d=' + ds.join(',');
    const t = st.time;
    if (t && 'at' in t && t.at) h += '&tt=' + encodeURIComponent(t.at);
    else if (t && 'daysAgo' in t && isFinite(t.daysAgo)) h += '&ts=' + Math.round(3650 - t.daysAgo);
    const c = st.compare;
    if (c) { h += '&cmp=' + (c.xray ? 'x' : '1'); if (c.at) h += '&ct=' + encodeURIComponent(c.at); }
    if (st.base === 'sat') h += '&sat=1';
    if (st.terrain) h += '&t3=1';
    const s = st.sims ? packObject(st.sims) : ''; if (s) h += '&s=' + s;
    const ti = captionText(st.title, TITLE_MAX); if (ti) h += '&title=' + encodeURIComponent(ti);
    const no = captionText(st.note, NOTE_MAX); if (no) h += '&note=' + encodeURIComponent(no);
    const bf = briefText(st.brief); if (bf) h += '&b=' + bf;
    return h;
  } catch (_) { return ''; }
}

/* ══ THE SHARED READERS — the one place each value is assembled from its source ══════════════════
   The owners call these with the live source; js/atlas-state.js calls the same functions with the
   engine and clock it was handed, so a headless Atlas (the node checks) and the app read the camera
   and the clock through ONE assembly instead of two that agree by coincidence. */
/** @param {any} E the renderer contract (js/geo-engine.js) @param {any} host IM_HOST (or {}) @returns {ViewValue|null} */
export function viewOf(E, host) {
  const cam = E && E.camera; if (!cam) return null;
  const c = cam.getCenter(); const z = +cam.getZoom();
  if (!c || !isFinite(+c.lng) || !isFinite(+c.lat) || !isFinite(z)) return null;
  const p = host && host.proj;
  return { lng: +c.lng, lat: +c.lat, zoom: z, bearing: +cam.getBearing() || 0, pitch: +cam.getPitch() || 0,
    proj: p === 'globe' ? 'globe' : (p === 'flat' ? 'flat' : null) };
}
/** @param {any} T a clock (js/chronos.js) @returns {TimeValue} */
export function timeOf(T) {
  if (!T || typeof T.isLive !== 'function' || T.isLive()) return null;
  let instant = null; try { const d = typeof T.get === 'function' ? T.get() : null; instant = d ? d.toISOString() : null; } catch (_) { instant = null; }
  let year = null; try { year = typeof T.year === 'function' ? T.year() : null; } catch (_) { year = null; }
  return { at: typeof T.iso === 'function' ? T.iso() : (instant || ''), instant, year };
}

/* ══ THE STORE ═══════════════════════════════════════════════════════════════════════════════════ */
/** @type {Object<string, Owner>} */
const owners = Object.create(null);
/** @type {Set<(e:ChangeEvent)=>void>} */
const subs = new Set();
/** @type {Set<(e:{phase:string, gen:number, full:boolean, state:any})=>void>} */
const restoreSubs = new Set();
let gen = 0, restoring = false, bootHash = '';
/** the field whose `apply` is running right now — a change it causes is the restore's, not the reader's */
let applying = /** @type {string|null} */ (null);
/** a value a restore handed a field whose owner had not registered yet — handed over on registration */
/** @type {Object<string, { value:any, ctx:RestoreCtx }>} */
const pending = Object.create(null);

function emit(/** @type {ChangeEvent} */ e) { subs.forEach((f) => { try { f(e); } catch (_) { } }); }

/** run one owner's apply, marked as the restore's
    @param {string} key @param {Owner} o @param {any} value @param {RestoreCtx} ctx @param {any} prepared */
function runApply(key, o, value, ctx, prepared) {
  if (!ctx.current() || !o || typeof o.apply !== 'function') return;
  const was = applying; applying = key;
  try { o.apply(value, ctx, prepared); } catch (_) { } finally { applying = was; }
}
/** stage a field's restore: prepare now, apply at each declared instant
    @param {any} f a SCHEMA row @param {Owner} o @param {any} value @param {RestoreCtx} ctx */
function stage(f, o, value, ctx) {
  let prepared; try { prepared = typeof o.prepare === 'function' ? o.prepare(value, ctx) : undefined; } catch (_) { prepared = undefined; }
  (f.at || []).forEach((/** @type {number} */ ms) => {
    if (ms <= 0) runApply(f.key, o, value, ctx, prepared);
    else ctx.later(() => runApply(f.key, o, value, ctx, prepared), ms);
  });
}

export const MapState = {
  SCHEMA, PARAMS, SETTLE_MS, encode, decode, carries, TITLE_MAX, NOTE_MAX, captionText, briefText,

  /** own(key, { read, apply, prepare }) — the module that decides a field. Re-registering replaces.
      A restore that reached this field before its owner existed hands its value over now (if that
      restore is still the latest). @param {string} key @param {Owner} o */
  own(key, o) {
    if (!FIELD(key) || !o) return false;
    owners[key] = o;
    const p = pending[key]; if (p) { delete pending[key]; if (p.ctx.current()) stage(FIELD(key), o, p.value, p.ctx); }
    return true;
  },
  /** @param {string} key */
  owns(key) { return !!(owners[key] && typeof owners[key].read === 'function'); },
  /** the current value of one field, from its owner — undefined when nobody owns it @param {string} key */
  read(key) { const o = owners[key]; if (!o || typeof o.read !== 'function') return undefined; try { return o.read(); } catch (_) { return undefined; } },
  /** the whole state tree (or `only` those keys) @param {string[]} [only] */
  snapshot(only) { /** @type {Object<string,any>} */ const out = {};
    SCHEMA.forEach((f) => { if (only && only.indexOf(f.key) < 0) return; const v = MapState.read(f.key); if (v !== undefined) out[f.key] = v; });
    return out; },
  /** the address-bar form of the map as it is now */
  hash() { return encode(MapState.snapshot()); },
  /** the share link of the map as it is now */
  link() { try { return location.origin + location.pathname + location.search + MapState.hash(); } catch (_) { return ''; } },
  /** (classroom-tours) address(query, hash) — the address bar's PAGE fields and, when given, a link's fragment.
      The query is the page's mode, not the map: `?tour=<id>&step=<n>` (js/tours.js), `?embed=1`. It carries no
      field of SCHEMA and the codec never reads it; the map stays in the fragment, which only `encode` writes.
      This writes; it does not restore — a caller that hands over a new fragment then asks the share link's
      restore (IntMapBookmark.restore, js/map-ui.js) to apply it, the path a pasted link takes.
      @param {string|null} query  '?a=b…' ('' clears the query; null keeps it)
      @param {string|null} [hash] a fragment the codec wrote (null keeps the one in the bar) */
  address(query, hash) {
    try {
      const q = query == null ? location.search : (query ? (query.charAt(0) === '?' ? query : '?' + query) : '');
      history.replaceState(null, '', location.pathname + q + (hash == null ? location.hash : hash));
      return true;
    } catch (_) { return false; }
  },
  /** the saved session's spelling of the map's fields (js/session-tabs.js adds the app chrome around it) */
  session() { /** @type {Object<string,any>} */ const out = {};
    SCHEMA.forEach((f) => { if (!f.session) return; const v = MapState.read(f.key);
      if (f.key === 'time') { const y = v && 'year' in v ? v.year : null; out[f.session] = (y && y < new Date().getFullYear()) ? y : null; }
      else if (f.key === 'base') out[f.session] = v === undefined ? 'map' : v;
      else if (f.key === 'terrain') out[f.session] = !!v;
      else out[f.session] = v === undefined ? [] : v; });
    return out; },

  /** changed(key) — an owner says its field moved. The cause is the restore's when the change happened
      inside that field's restore step, else the reader's (or what `opts.cause` names).
      @param {string} key @param {{cause?:string}} [opts] */
  changed(key, opts) {
    const cause = (opts && opts.cause) || (applying === key ? 'restore' : 'reader');
    emit({ key, cause, gen, restoring });
  },
  /** on(fn) — fn({ key, cause, gen, restoring }) on every change; returns the unsubscribe @param {(e:ChangeEvent)=>void} fn */
  on(fn) { if (typeof fn !== 'function') return () => { }; subs.add(fn); return () => { subs.delete(fn); }; },
  /** onRestore(fn) — fn({ phase:'start'|'settled', gen, full, state }) @param {(e:any)=>void} fn */
  onRestore(fn) { if (typeof fn !== 'function') return () => { }; restoreSubs.add(fn); return () => { restoreSubs.delete(fn); }; },
  /** is a restore being applied right now? */
  restoring() { return restoring; },
  /** the latest restore's generation */
  generation() { return gen; },

  /** boot(hash) — the address the document was opened with (js/map-ui.js BOOT_HASH) @param {string} hash */
  boot(hash) { bootHash = String(hash || ''); },
  /** did this document open on a map state? Then the link — not the reader's saved session — owns
      everything it describes, the clock included (js/session-tabs.js yields its year to it). */
  carriesState() { return carries(bootHash); },

  /** restore(hash, { full, onSettle }) — apply ONE decoded state. Every field is handed to its owner at
      the instants the schema declares; a newer restore supersedes every staged step of an older one
      (the generation — #881). Returns the restore's context, or null when the address names no map.
      @param {string} hash @param {{ full?:boolean, cause?:string, onSettle?:()=>void }} [opts] @returns {RestoreCtx|null} */
  restore(hash, opts) {
    const st = decode(hash); if (!st.view) return null;
    opts = opts || {};
    const my = ++gen; restoring = true;
    Object.keys(pending).forEach((k) => { delete pending[k]; });   /* an older restore's waiting values are superseded too */
    /** @type {RestoreCtx} */
    const ctx = { gen: my, full: !!opts.full, cause: opts.cause || 'restore', state: st,
      current: () => my === gen,
      later: (fn, ms) => { setTimeout(() => { if (my === gen) fn(); }, ms); } };
    restoreSubs.forEach((f) => { try { f({ phase: 'start', gen: my, full: ctx.full, state: st }); } catch (_) { } });
    SCHEMA.forEach((f) => {
      if (!f.restore || (f.restore === 'full' && !ctx.full)) return;
      const o = owners[f.key], value = /** @type {any} */ (st)[f.key];
      if (!o) { pending[f.key] = { value, ctx }; return; }
      stage(f, o, value, ctx);
    });
    ctx.later(() => { restoring = false;
      restoreSubs.forEach((f) => { try { f({ phase: 'settled', gen: my, full: ctx.full, state: st }); } catch (_) { } });
      if (opts && typeof opts.onSettle === 'function') { try { opts.onSettle(); } catch (_) { } } }, SETTLE_MS);
    return ctx;
  },
};
