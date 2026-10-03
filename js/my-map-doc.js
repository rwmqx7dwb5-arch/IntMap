// @ts-check
/* ============================================================================
 *  IntMap · MY MAP — the document, its link form and its geometry   (map-next)
 * ----------------------------------------------------------------------------
 *  The pure half of js/my-map.js: no DOM, no renderer, no clock, no storage. What a reader's own map
 *  IS (pins, lines and areas, each with a name, a note and a colour), how it is written into a link,
 *  how a link is read back WITHOUT trusting it, and what geometry it draws, analyses and exports.
 *  js/my-map.js holds the panel, the drawing gestures and the map layers; the node checks
 *  (tests/map-next-checks.test.mjs) hold this file by running it.
 *
 *  ── THE DOCUMENT ──────────────────────────────────────────────────────────────────────────────
 *    { v:1, id, title, updated, features:[{ id, kind:'pin'|'line'|'area', name, note, color, coords }] }
 *  `coords` are the reader's own vertices, [lng, lat] in WGS 84 degrees: one for a pin, two or more
 *  for a line, three or more for an area (the ring is open — its closing edge is implied). Longitudes
 *  are kept in [-180, 180]; an edge is the GREAT CIRCLE between its two vertices («a straight line on
 *  the Earth»), the same edge the measure and area tools draw and measure (js/app-body.js `_gcDensify`,
 *  `ringArea`), so an edge across the antimeridian goes the short way round.
 *
 *  ── ⚠ THE PRECISION IS DECIDED ONCE, WHERE A VERTEX IS MADE ─────────────────────────────────────
 *  Every vertex is rounded to 1e-6° when it enters the document, not when it leaves it in a link. A
 *  map whose stored copy were finer than its link would be two maps: the author's and everybody
 *  else's, differing by the rounding, and the author could not tell which one a reader is looking at.
 *  See COORD_SCALE for why 1e-6°.
 *
 *  ── THE LINK FORM — the value of the map state's `mymap` field (js/map-state.js, `&mm=`) ──────────
 *    { v:1, i:id, t:title, f:[[kind letter, name, note, colour index, path], …] }
 *  `path` is the vertices as the Encoded Polyline Algorithm Format (Google; deltas, zig-zag, 5-bit
 *  groups offset by 63) at COORD_SCALE — printable ASCII, about a third of the JSON-of-numbers size.
 *  js/map-state.js packs the whole value as base64url JSON exactly as it packs the simulators' `s=`.
 *  ⚠ THE READER DOES NOT TRUST THE LINK. A link is text anybody can write, so `fromLinkValue` re-reads
 *  every field through the same rules a vertex typed by hand goes through, and a feature it cannot read
 *  is COUNTED and named in the answer (`dropped`) — never silently left out (the map a reader sees must
 *  not be smaller than the map they were sent without saying so).
 * ==========================================================================*/
import { captionText, TITLE_MAX, NOTE_MAX } from './map-state.js';

/* ⚠ 1e-6° IS NOT A TASTE. OBSERVATION: one millionth of a degree of latitude is 0.111 m, and of
   longitude 0.111 m × cos φ — finer than one CSS pixel of the map up to zoom 20 at the equator
   (0.149 m/px at z20 for a 512-px tile pyramid), which is past the zoom a reader clicks a vertex at on
   any base map this app draws. A click therefore cannot carry more than this, and keeping more would
   be keeping pointer noise. It is also the precision OSM stores (7 decimals) less one digit, and the
   largest scaled longitude, 180e6 × 2 for the zig-zag, still fits a 32-bit integer — the polyline
   encoder below shifts with `>>`.
   EXPIRES: if a vertex is ever placed by something finer than a pointer on a map (a survey import).
   正本: this line — js/my-map.js imports it. */
export const COORD_SCALE = 1e6;

/* The colours a feature may take: the iOS system palette the app's other reader-made objects use
   (red, orange, yellow, green, blue, purple). A link carries the INDEX, so a colour it names is always
   one of these — a hand-written link cannot put an arbitrary string into a paint property. */
export const PALETTE = Object.freeze(['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de']);

/** the three kinds, their letter in a link and the fewest vertices each needs */
export const KINDS = Object.freeze({
  pin: Object.freeze({ letter: 'p', min: 1, max: 1 }),
  line: Object.freeze({ letter: 'l', min: 2, max: Infinity }),
  area: Object.freeze({ letter: 'a', min: 3, max: Infinity }),
});
const KIND_OF_LETTER = Object.freeze(Object.keys(KINDS).reduce((o, k) => { /** @type {any} */ (o)[KINDS[/** @type {'pin'} */ (k)].letter] = k; return o; }, {}));

/* ⚠ HOW FINELY AN EDGE IS DRAWN, AND WHY 0.1°. An edge is a great circle; the renderer, the GIS
   kernels and every GIS a file is exported to join two vertices with a straight line in lon/lat. So an
   edge is handed over as pieces short enough that the straight line between two consecutive pieces lies
   on the great circle to within a pixel. OBSERVATION (computed, not measured on screen): the gap between
   a great-circle arc of length L and the lon/lat chord under it is at most L² · tan φ / (8 R); for a
   piece of 0.1° of arc (11.1 km) that is 4.2 m at 60° latitude and 12.4 m at 80° — under one CSS pixel
   at 60° up to zoom 14 (4.8 m/px). EXPIRES: if the renderer learns to draw geodesic edges itself.
   正本: this line. */
export const DENSIFY_DEG = 0.1;

/** @typedef {{ id:string, kind:('pin'|'line'|'area'), name:string, note:string, color:string, coords:number[][] }} Feature */
/** @typedef {{ v:1, id:string, title:string, updated:number, features:Feature[] }} Doc */

const str = (/** @type {any} */ v) => String(v == null ? '' : v);
const finite = (/** @type {any} */ v) => typeof v === 'number' && isFinite(v);

/** a number of degrees, rounded where every vertex is rounded */
function quant(/** @type {number} */ d) { return Math.round(d * COORD_SCALE) / COORD_SCALE; }
/** a longitude in [-180, 180] — the same meridian, named once */
function wrapLng(/** @type {number} */ lng) {
  let l = ((lng + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lng > 0) l = 180;
  return l;
}

let seq = 0;
/** a new identifier: time and a counter, so two made in one millisecond differ, and a random tail so two
    browsers do not make the same one (an identifier says «this is the same map» — js/my-map.js `apply`) */
export function newId(/** @type {string} */ prefix) {
  return str(prefix) + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
}
const ID_RE = /^[a-z][a-z0-9]{3,40}$/;

/** the colour a value names: one of PALETTE, or the first when it names none */
export function colorOf(/** @type {any} */ c) {
  const s = str(c).toLowerCase();
  if (PALETTE.indexOf(s) >= 0) return s;
  if (/^\d+$/.test(s) && +s < PALETTE.length) return PALETTE[+s];
  return PALETTE[0];
}

/** vertices for one kind → { ok:true, coords } | { ok:false, why, detail }.
    Every vertex is a finite [lng, lat] with lat in [-90, 90]; a longitude outside [-180, 180] is the same
    meridian and is wrapped (a map with world copies hands out 190° for 170° W). Consecutive repeats are
    one vertex; an area's closing vertex, when it repeats the first, is implied and dropped. */
export function cleanCoords(/** @type {string} */ kind, /** @type {any} */ coords) {
  const K = KINDS[/** @type {'pin'} */ (kind)];
  if (!K) return { ok: false, why: 'kind-unknown', detail: { kind: str(kind), kinds: Object.keys(KINDS) } };
  if (!Array.isArray(coords)) return { ok: false, why: 'coords-not-a-list' };
  /** @type {number[][]} */ const out = [];
  for (let i = 0; i < coords.length; i++) {
    const p = coords[i];
    if (!Array.isArray(p) || p.length < 2) return { ok: false, why: 'vertex-not-a-pair', detail: { index: i } };
    const lng = +p[0], lat = +p[1];
    if (!finite(lng) || !finite(lat)) return { ok: false, why: 'vertex-not-finite', detail: { index: i } };
    if (lat < -90 || lat > 90) return { ok: false, why: 'latitude-out-of-range', detail: { index: i, lat } };
    const q = [quant(wrapLng(lng)), quant(lat)];
    const last = out[out.length - 1];
    if (last && last[0] === q[0] && last[1] === q[1]) continue;
    out.push(q);
  }
  if (kind === 'area' && out.length > 1) { const a = out[0], z = out[out.length - 1]; if (a[0] === z[0] && a[1] === z[1]) out.pop(); }
  if (out.length < K.min) return { ok: false, why: 'too-few-vertices', detail: { kind, have: out.length, need: K.min } };
  if (out.length > K.max) return { ok: false, why: 'too-many-vertices', detail: { kind, have: out.length, max: K.max } };
  return { ok: true, coords: out };
}

/** a feature from parts → { ok:true, feature } | { ok:false, why, detail }. The name and the note are
    plain text cleaned by the share link's own caption rule (js/map-state.js captionText): control and
    bidirectional-override characters become spaces and the text is cut at TITLE_MAX / NOTE_MAX. */
export function makeFeature(/** @type {any} */ o) {
  o = o || {};
  const kind = str(o.kind);
  const c = cleanCoords(kind, o.coords);
  if (!c.ok) return c;
  return { ok: true, feature: /** @type {Feature} */ ({
    id: (typeof o.id === 'string' && ID_RE.test(o.id)) ? o.id : newId('f'),
    kind: /** @type {any} */ (kind), name: captionText(o.name, TITLE_MAX), note: captionText(o.note, NOTE_MAX),
    color: colorOf(o.color), coords: /** @type {number[][]} */ (c.coords) }) };
}

/** an empty document */
export function newDoc(/** @type {any} */ title) {
  return /** @type {Doc} */ ({ v: 1, id: newId('m'), title: captionText(title, TITLE_MAX), updated: Date.now(), features: [] });
}

/** a document read back from storage (or anything) → a Doc, or null. Every feature passes makeFeature
    again — what was stored by an older build is held to today's rules, and what fails is dropped and
    COUNTED (`dropped`), never kept in a shape nothing else would accept. */
export function readDoc(/** @type {any} */ o) {
  if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.features)) return null;
  const id = (typeof o.id === 'string' && ID_RE.test(o.id)) ? o.id : newId('m');
  /** @type {Feature[]} */ const features = []; let dropped = 0;
  const ids = new Set();
  o.features.forEach((/** @type {any} */ f) => {
    const r = makeFeature(f);
    if (!r.ok) { dropped++; return; }
    const ft = /** @type {Feature} */ (r.feature);
    if (ids.has(ft.id)) ft.id = newId('f');
    ids.add(ft.id); features.push(ft);
  });
  return { doc: /** @type {Doc} */ ({ v: 1, id, title: captionText(o.title, TITLE_MAX), updated: finite(o.updated) ? o.updated : Date.now(), features }), dropped };
}

/* ══ THE LINK FORM ══════════════════════════════════════════════════════════════════════════════ */

/** vertices → the Encoded Polyline Algorithm Format at COORD_SCALE (longitude first, as stored) */
export function encodePath(/** @type {number[][]} */ coords) {
  let out = '', pl = 0, pa = 0;
  const one = (/** @type {number} */ v) => {
    let x = v < 0 ? ~(v << 1) : (v << 1);
    while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; }
    out += String.fromCharCode(x + 63);
  };
  coords.forEach((p) => {
    const l = Math.round(p[0] * COORD_SCALE), a = Math.round(p[1] * COORD_SCALE);
    one(l - pl); one(a - pa); pl = l; pa = a;
  });
  return out;
}
/** the inverse — or null when the text is not a whole number of vertices in the alphabet */
export function decodePath(/** @type {any} */ s) {
  if (typeof s !== 'string') return null;
  /** @type {number[]} */ const vals = [];
  let i = 0;
  while (i < s.length) {
    let shift = 0, x = 0, b;
    do {
      if (i >= s.length) return null;
      b = s.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      x |= (b & 0x1f) << shift; shift += 5;
      if (shift > 35) return null;
    } while (b >= 0x20);
    vals.push((x & 1) ? ~(x >> 1) : (x >> 1));
  }
  if (vals.length % 2) return null;
  /** @type {number[][]} */ const out = []; let l = 0, a = 0;
  for (let k = 0; k < vals.length; k += 2) { l += vals[k]; a += vals[k + 1]; out.push([l / COORD_SCALE, a / COORD_SCALE]); }
  return out;
}

/** a document → the value of the map state's `mymap` field */
export function toLinkValue(/** @type {Doc} */ doc) {
  return { v: 1, i: doc.id, t: doc.title || '', f: doc.features.map((f) => [KINDS[f.kind].letter, f.name || '', f.note || '', Math.max(0, PALETTE.indexOf(f.color)), encodePath(f.coords)]) };
}

/** the value of a `mymap` field (decoded from a link anybody could have written) →
    { ok:true, doc, dropped } | { ok:false, why }. A feature that does not read is counted, not kept. */
export function fromLinkValue(/** @type {any} */ v) {
  if (!v || typeof v !== 'object' || v.v !== 1 || !Array.isArray(v.f)) return { ok: false, why: 'not-a-map' };
  const id = (typeof v.i === 'string' && ID_RE.test(v.i)) ? v.i : null;
  if (!id) return { ok: false, why: 'no-identifier' };
  /** @type {Feature[]} */ const features = []; let dropped = 0;
  v.f.forEach((/** @type {any} */ r) => {
    if (!Array.isArray(r)) { dropped++; return; }
    const kind = KIND_OF_LETTER[str(r[0])];
    const coords = decodePath(r[4]);
    const m = kind && coords ? makeFeature({ kind, name: r[1], note: r[2], color: r[3], coords }) : null;
    if (!m || !m.ok) { dropped++; return; }
    features.push(/** @type {Feature} */ (m.feature));
  });
  return { ok: true, doc: /** @type {Doc} */ ({ v: 1, id, title: captionText(v.t, TITLE_MAX), updated: Date.now(), features }), dropped };
}

/* ══ GEOMETRY — what is drawn, analysed and exported ════════════════════════════════════════════
   `G` is js/geodesy.js (window.IntMapGeodesy), handed in so this file stays pure. The great circle is
   walked in CONTINUOUS longitude and then cut at the antimeridian into pieces that each lie in
   [-180, 180] — the renderer is run with world copies off for the measure tools, and a piece that
   crossed the seam would be drawn the long way round the world. */

/** the number of pieces an edge is drawn in (see DENSIFY_DEG) */
function piecesFor(/** @type {number[]} */ a, /** @type {number[]} */ b) {
  const r = Math.PI / 180, la1 = a[1] * r, la2 = b[1] * r, dl = (b[0] - a[0]) * r;
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2;
  const deg = 2 * Math.asin(Math.min(1, Math.sqrt(h))) / r;
  return Math.max(1, Math.ceil(deg / DENSIFY_DEG));
}
/** a vertex list → the great-circle path through it, longitudes continuous */
function gcPath(/** @type {number[][]} */ pts, /** @type {any} */ G, /** @type {boolean} */ close) {
  const seq = close ? pts.concat([pts[0]]) : pts;
  /** @type {number[][]} */ const out = []; let prev = null;
  for (let i = 0; i < seq.length - 1; i++) {
    const seg = G._gcPoints(seq[i], seq[i + 1], piecesFor(seq[i], seq[i + 1]));
    for (let k = (i === 0 ? 0 : 1); k < seg.length; k++) {
      let lo = seg[k][0];
      if (prev != null) { while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; }
      out.push([lo, seg[k][1]]); prev = lo;
    }
  }
  return out;
}
/** one feature → its GeoJSON geometry as drawn: a Point, or a (Multi)LineString / (Multi)Polygon of
    great-circle pieces cut at the antimeridian. ⚠ AN AREA THAT CONTAINS A POLE IS NOT HANDLED HERE —
    its ring does not close in longitude, and cutting it as an ordinary ring would draw the complement;
    `polar` says so and the panel tells the reader rather than drawing the wrong half of the Earth. */
export function geometryOf(/** @type {Feature} */ f, /** @type {any} */ G) {
  if (f.kind === 'pin') return { type: 'Point', coordinates: f.coords[0].slice() };
  if (f.kind === 'line') {
    const parts = G._splitLineToWindows(gcPath(f.coords, G, false));
    return parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts };
  }
  const ring = gcPath(f.coords, G, true);
  const span = ring[ring.length - 1][0] - ring[0][0];
  if (Math.abs(span) > 180) return null;   /* the ring winds round a pole — see polar() */
  const rings = G._splitPolyToWindows(ring).map((/** @type {number[][]} */ r) => r.concat([r[0].slice()]));
  return rings.length === 1 ? { type: 'Polygon', coordinates: [rings[0]] } : { type: 'MultiPolygon', coordinates: rings.map((/** @type {any} */ r) => [r]) };
}
/** does this area's ring wind round a pole? (its great-circle ring gains or loses 360° of longitude) */
export function polar(/** @type {Feature} */ f, /** @type {any} */ G) {
  if (f.kind !== 'area') return false;
  const ring = gcPath(f.coords, G, true);
  return Math.abs(ring[ring.length - 1][0] - ring[0][0]) > 180;
}
/** a point to hang a feature's name on: the pin, the middle vertex of a line's path, an area's vertex mean
    (in continuous longitude, so a ring across the antimeridian does not label the far side of the world) */
export function labelPoint(/** @type {Feature} */ f, /** @type {any} */ G) {
  if (f.kind === 'pin') return f.coords[0].slice();
  if (f.kind === 'line') { const p = gcPath(f.coords, G, false); const m = p[Math.floor(p.length / 2)]; return [wrapLng(m[0]), m[1]]; }
  let x = 0, y = 0, prev = null;
  for (const c of f.coords) { let lo = c[0]; if (prev != null) { while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; } x += lo; y += c[1]; prev = lo; }
  return [wrapLng(x / f.coords.length), y / f.coords.length];
}

/** the document as a GeoJSON FeatureCollection (RFC 7946) — the geometry that is drawn, and per feature
    the reader's words and what was measured (`measure(f)` → { lengthKm?, areaKm2? }, handed in: the
    measurement is js/app-body.js's, so the tool and this map give one answer). An area round a pole has
    no geometry here and says why (`geometry: null`, `polar: true`) — RFC 7946 §3.2 allows a null one. */
export function toFeatureCollection(/** @type {Doc} */ doc, /** @type {any} */ G, /** @type {(f:Feature)=>any} */ measure) {
  return {
    type: 'FeatureCollection',
    features: doc.features.map((f) => {
      const g = geometryOf(f, G);
      /** @type {Object<string, any>} */ const p = { name: f.name, note: f.note, kind: f.kind, color: f.color, vertex_count: f.coords.length };
      const m = measure ? measure(f) : null;
      if (m && finite(m.lengthKm)) p.length_km = m.lengthKm;
      if (m && finite(m.areaKm2)) p.area_km2 = m.areaKm2;
      if (!g) p.polar = true;
      return { type: 'Feature', id: f.id, geometry: g, properties: p };
    }),
  };
}
