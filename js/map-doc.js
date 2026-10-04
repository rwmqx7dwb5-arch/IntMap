// @ts-check
/* ============================================================================
 *  IntMap · THE MAP DOCUMENT — one shape for everything a reader keeps of a map   (map-document-unify)
 * ----------------------------------------------------------------------------
 *  「地図を保存・共有する仕組みを 1 つの『地図ドキュメント』に。」 A reader could keep a map four ways, and each
 *  way was its own island:
 *    · a SAVED MAP in the account (js/my-places.js — supabase `saved_views`, one share-link fragment);
 *    · a MY MAP in this browser (js/my-map.js — localStorage `intmap_mymaps`; on the map it is the `mm=` field);
 *    · a TOUR — the one a teacher writes (js/tour-builder.js, localStorage `intmap_tour_draft`, shared as
 *      `?tour=custom&t=…`) and the one Atlas assembles in a tab (js/tour-player.js, sessionStorage);
 *    · an ATLAS ANSWER — a notebook entry (js/atlas-notebook-store.js) or a briefing (js/atlas-briefing-codec.js),
 *      whose view is the notebook's own capture of the camera, the clock and the layers.
 *  None of them could become another: a tour could not be kept in the account or filed in a collection, a my map
 *  could not follow the reader to another device, an Atlas answer could not be kept as a map.
 *
 *  THE DOCUMENT is what they all are — an ordered list of map states, each with the words that go with it:
 *    { v:1, id, kind:'view'|'map'|'tour'|'brief', title, note,
 *      steps:[{ state, title, say, ask }], origin:{ from, ref }, updatedAt }
 *  `state` is the share link's fragment WITHOUT its '#', as js/map-state.js `encode` writes it (and '' for a step
 *  that names no map — a tour step the author has not set yet). A my map's drawing is the fragment's `mm=` field,
 *  so a step carries it with no code of its own; a tour's steps are its steps; an Atlas answer's view becomes the
 *  fragment its camera, clock and layers would have written (`stateOfNotebookView`, below).
 *  `kind` is what the reader called it (a view, a my map, a tour, an Atlas answer) — what it CAN do is read from
 *  its steps: more than one is a tour the classroom player plays.
 *
 *  This file is the data and nothing else — no DOM, no storage, no network. It turns each of the four forms into
 *  a document and back, so the Library (js/my-places.js), the account (`save_view`), a published collection
 *  (js/shared-collection.js) and Atlas (js/atlas-cap-places.js) hold ONE kind of thing.
 *  ⚠ A FRAGMENT FROM OUTSIDE IS WRITTEN AGAIN BY THE CODEC (js/map-state.js `canonical`) every time it enters a
 *  document — a saved row, a link, a tour, a stored draft are all text somebody could have written.
 * ==========================================================================*/
import { canonical, encode, captionText } from './map-state.js';
import { toLinkValue } from './my-map-doc.js';

export const DOC_VERSION = 1;
export const KINDS = Object.freeze(['view', 'map', 'tour', 'brief']);
/* the account's own limits on a saved map's words (supabase/migrations/20261003211500_collection_workspace.sql:
   name 1-120, note ≤ 2000) — a document is cut to them on the way in, so what is kept is what was shown */
export const NAME_MAX = 120;
export const DOC_NOTE_MAX = 2000;
/* ⚠ THE MOST STEPS ONE DOCUMENT HOLDS — the account's fence on a saved document's steps
   (supabase/migrations/20261004120000_map_documents.sql, which states the estimate). THE ONE COPY in the page. */
export const STEPS_MAX = 200;

const str = (/** @type {any} */ v) => String(v == null ? '' : v);
/** a fragment from outside → the codec's own, without '#' ('' when it names no map) @param {any} h */
export const stateOf = (h) => canonical(h).replace(/^#/, '');
/** does this fragment carry a reader's own drawing (`mm=`)? — a map is a «my map» by what it holds @param {string} state */
export const holdsMyMap = (state) => /(^|&)mm=/.test(str(state).replace(/^#/, ''));

/** @typedef {{ state:string, title:string, say:string, ask:string }} Step */
/** @typedef {{ v:number, id:string, kind:string, title:string, note:string, steps:Step[], origin:{from:string, ref:(string|null)}, updatedAt:number }} MapDoc */

/** one step, held to the document's rules @param {any} s @returns {Step} */
function cleanStep(s) {
  const o = s || {};
  return { state: stateOf(o.state != null ? o.state : o.hash), title: str(o.title), say: str(o.say), ask: str(o.ask) };
}

/** anything → a document, or null when it holds no step. Every fragment is written again by the codec; the
    title and note are cut to the account's limits; an unknown kind becomes the kind its steps say.
    @param {any} o @returns {MapDoc|null} */
export function readMapDoc(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.steps)) return null;
  const steps = o.steps.slice(0, STEPS_MAX).map(cleanStep);
  if (!steps.length) return null;
  const kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : kindOf(steps);
  const origin = o.origin && typeof o.origin === 'object' ? { from: str(o.origin.from), ref: o.origin.ref == null ? null : str(o.origin.ref) } : { from: '', ref: null };
  return { v: DOC_VERSION, id: str(o.id), kind, title: captionText(o.title, NAME_MAX), note: str(o.note).slice(0, DOC_NOTE_MAX), steps, origin, updatedAt: +o.updatedAt || 0 };
}
/** the kind a document's steps say it is, when nobody said: several steps are a tour; one that carries a drawing is a my map */
export function kindOf(/** @type {Step[]} */ steps) {
  if (steps.length > 1) return 'tour';
  return steps[0] && holdsMyMap(steps[0].state) ? 'map' : 'view';
}
/** is this document played as a tour (more than one step)? @param {MapDoc|null} d */
export const isTour = (d) => !!(d && d.steps.length > 1);
/** the first step that names a map — the document's map when it is opened as one @param {MapDoc|null} d */
export const firstState = (d) => { const s = d && d.steps.find((x) => x.state); return s ? s.state : ''; };
/** does a step carry words — the things a single fragment cannot hold? */
const worded = (/** @type {Step} */ s) => !!(s.title || s.say || s.ask);

/* ══ THE ACCOUNT — a row of `saved_views` (js/my-places.js) ══════════════════════════════════════════
   A row is { id, name, note, collection, state, kind, steps }. `state` is the document's first map (the row is a map
   link before it is anything else — a build that does not know `steps` still opens it); `steps` is null for a
   document that is ONE map with no words of its own (every row saved before documents existed is that), else the
   whole list. So a one-map row is byte-for-byte the row it always was. */
/** @param {any} row @returns {MapDoc|null} */
export function fromSavedView(row) {
  if (!row || typeof row !== 'object') return null;
  const steps = Array.isArray(row.steps) && row.steps.length ? row.steps : [{ state: row.state }];
  return readMapDoc({ id: row.id, kind: row.kind, title: row.name, note: row.note, steps, origin: { from: 'account', ref: row.id == null ? null : row.id }, updatedAt: Date.parse(row.updated_at || '') || 0 });
}
/** a document → what js/my-places.js saveView sends (`save_view`). null when no step names a map (a row's `state`
    must). @param {MapDoc|null} d @returns {{ name:string, note:string, state:string, kind:string, steps:(Step[]|null) }|null} */
export function toSavedView(d) {
  const doc = d && readMapDoc(d); if (!doc) return null;
  const state = firstState(doc); if (!state) return null;
  const one = doc.steps.length === 1 && !worded(doc.steps[0]);
  return { name: doc.title, note: doc.note, state, kind: doc.kind, steps: one ? null : doc.steps.map((s) => ({ state: s.state, title: s.title, say: s.say, ask: s.ask })) };
}

/* ══ A READER'S OWN MAP (js/my-map.js) ════════════════════════════════════════════════════════════════
   A my map is a drawing with no camera of its own; on the map it is the `mymap` field of the state in front of the
   reader. So its document is THE MAP AS IT IS SHOWN WITH THAT DRAWING ON IT: `here` is the decoded state of the map
   (js/map-state.js decode / snapshot) and the drawing replaces whatever drawing that state had. */
/** @param {any} mapDoc a js/my-map-doc.js document @param {any} here the map state it is shown over @returns {MapDoc|null} */
export function fromMyMap(mapDoc, here) {
  if (!mapDoc || !Array.isArray(mapDoc.features) || !here || !here.view) return null;
  const st = Object.assign({}, here, { mymap: toLinkValue(mapDoc) });
  return readMapDoc({ id: mapDoc.id, kind: 'map', title: mapDoc.title, note: '', steps: [{ state: encode(st) }], origin: { from: 'mymap', ref: mapDoc.id }, updatedAt: +mapDoc.updated || 0 });
}

/* ══ A TOUR — the builder's draft, the one Atlas assembled in a tab, a decoded `?tour=custom&t=` ════════
   All three are { title, steps: [{ title, say, ask, hash }] } (js/tour-builder.js getDraft, js/tour-player.js
   tempTour, js/tours.js decodeCustomTour); `from` says which. */
/** @param {any} t @param {string} [from] 'tour-draft' | 'atlas-tour' | 'custom-tour' @returns {MapDoc|null} */
export function fromTourDraft(t, from) {
  if (!t || !Array.isArray(t.steps)) return null;
  return readMapDoc({ id: '', kind: 'tour', title: t.title, note: '', steps: t.steps, origin: { from: from || 'tour-draft', ref: null }, updatedAt: 0 });
}
/** a decoded `?tour=custom&t=…` (js/tours.js decodeCustomTour) @param {any} t */
export const fromCustomTour = (t) => fromTourDraft(t, 'custom-tour');
/** a document → the tour shape the builder loads, the player plays and js/tours.js encodeCustomTour packs into a `t`
    (a step's map as a fragment WITH its '#', or null when it has none) @param {MapDoc|null} d */
export function toTourInput(d) {
  const doc = d && readMapDoc(d); if (!doc) return null;
  return { title: doc.title, steps: doc.steps.map((s) => ({ title: s.title, say: s.say, ask: s.ask, hash: s.state ? '#' + s.state : null })) };
}
/** a document → its tour link: the page, `?tour=custom&t=…&step=1` and step 1's map. `t` is js/tours.js's packing,
    handed in (`encodeCustomTour`) so this file reads without the tours' declarations.
    @param {MapDoc|null} d @param {string} page the page's address (js/map-state.js pageLink) @param {(t:any)=>Promise<string>} pack
    @param {(base:string, t:string, first:string)=>string} link js/tours.js customTourLink */
export async function toTourLink(d, page, pack, link) {
  const tour = toTourInput(d); if (!tour) return '';
  const first = tour.steps[0] && tour.steps[0].hash ? tour.steps[0].hash : '';
  return link(page, await pack(tour), first);
}
/** a document → the link of its map (its first step): the page and the fragment; '' when it names no map
    @param {MapDoc|null} d @param {string} page */
export function toLink(d, page) { const s = firstState(d); return s ? str(page) + '#' + s : ''; }

/* ══ AN ATLAS ANSWER — the notebook's view, as the map state ══════════════════════════════════════════
   The notebook keeps the view as Atlas's restorers capture it (js/atlas-notebook.js captureView):
     { camera:{ lng, lat, zoom, bearing, pitch, base:'map'|'satellite', projection:'globe'|'flat'|'3d-terrain' },
       time:{ live, t }, layersOn:[checkbox id…], layerOpacity }
   THE ONE TRANSLATION into the map state's fields (js/atlas-briefing-codec.js briefingLink used to hold the camera's
   half of it alone). `o.time` adds the clock as the link writes it (`tt`, the day — the share link's resolution);
   `o.layers` adds the layers and the display items, sorted by `o.classify(id)` → 'layer' | 'display' | null (the
   layer manifest's own answer: a row the share link carries; a box that is neither — a base toggle — is not a
   field of the link, so it is left out rather than guessed into one). */
/** @param {any} view @param {{ time?:boolean, layers?:boolean, classify?:(id:string)=>(string|null) }} [o]
    @returns {any|null} a state js/map-state.js encode writes, or null when the view kept no camera */
export function stateOfNotebookView(view, o) {
  const c = view && view.camera;
  if (!c || !isFinite(+c.lng) || !isFinite(+c.lat) || !isFinite(+c.zoom)) return null;
  /** @type {any} */ const st = {
    view: { lng: +c.lng, lat: +c.lat, zoom: +c.zoom, bearing: +c.bearing || 0, pitch: +c.pitch || 0, proj: c.projection === 'flat' ? 'flat' : 'globe' },
    base: c.base === 'satellite' ? 'sat' : 'map', terrain: c.projection === '3d-terrain',
  };
  const opt = o || {};
  if (opt.time) {
    const tv = view.time;
    if (tv && !tv.live && tv.t != null && isFinite(+tv.t)) st.time = { at: utcDay(new Date(+tv.t)) };
  }
  if (opt.layers && typeof opt.classify === 'function' && Array.isArray(view.layersOn)) {
    const k = opt.classify;
    st.layers = view.layersOn.filter((/** @type {string} */ id) => k(id) === 'layer');
    st.display = view.layersOn.filter((/** @type {string} */ id) => k(id) === 'display');
  }
  return st;
}
/* ⚠ THE CLOCK'S DAY AS THE ADDRESS BAR WRITES IT — the rule's owner is js/hist-scale.js `ymd` (UTC; a year past 9999 or
   before 0 in ECMA's expanded six-digit form, which Date.parse round-trips), which js/chronos.js ymdISO also reads.
   That owner is a window global evaluated by the page, and this file is read by node without a page, so the rule is
   stated again here — and tests/map-document-unify-checks.test.mjs ③ runs BOTH over the same dates (years −200, 1,
   1918, 9999, 10000) and fails the day they differ. */
function utcDay(/** @type {Date} */ d) {
  const y = d.getUTCFullYear(), p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const ys = (y >= 0 && y <= 9999) ? String(y).padStart(4, '0') : (y < 0 ? '-' : '+') + String(Math.abs(y)).padStart(6, '0');
  return ys + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/** one notebook entry (js/atlas-notebook-store.js normalize) → an Atlas-answer document: one step, its map the
    entry's view, its title the question and its words the answer. The answer is Atlas's text as the notebook
    keeps it (Markdown) — shown as text wherever a step's words are shown.
    @param {any} e @param {{ classify?:(id:string)=>(string|null) }} [o] @returns {MapDoc|null} */
export function fromNotebookEntry(e, o) {
  if (!e || !e.question) return null;
  const st = stateOfNotebookView(e.view, Object.assign({ time: true, layers: true }, o || {}));
  return readMapDoc({ id: e.id, kind: 'brief', title: e.title || e.question, note: e.note || '',
    steps: [{ state: st ? encode(st) : '', title: e.question, say: e.answer || '', ask: '' }], origin: { from: 'notebook', ref: e.id }, updatedAt: +e.updatedAt || +e.at || 0 });
}
/** a briefing (js/atlas-briefing-codec.js readBriefing) → one document, a step per section
    @param {any} b @param {{ classify?:(id:string)=>(string|null) }} [o] @returns {MapDoc|null} */
export function fromBriefing(b, o) {
  if (!b || !Array.isArray(b.sections) || !b.sections.length) return null;
  const opt = Object.assign({ time: true, layers: true }, o || {});
  const steps = b.sections.map((/** @type {any} */ s) => { const st = stateOfNotebookView(s.view, opt); return { state: st ? encode(st) : '', title: str(s.question), say: str(s.answer), ask: '' }; });
  return readMapDoc({ id: '', kind: 'brief', title: b.title || (b.sections[0] && b.sections[0].question), note: '', steps, origin: { from: 'briefing', ref: null }, updatedAt: +b.at || 0 });
}

/** a document carries a map at all? (a document whose steps all lack one cannot be saved or opened as a map) */
export const hasMap = (/** @type {MapDoc|null} */ d) => !!firstState(d);
