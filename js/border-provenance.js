/* ============================================================================
 *  IntMap · WHERE THIS LINE COMES FROM — the core of the border provenance inspector  (border-provenance)
 * ----------------------------------------------------------------------------
 *  「線 1 本ごとに根拠を辿れる世界の歴史地図」. A boundary on the map is drawn by one of several records
 *  (CShapes, OpenHistoricalMap's relations and its vector tiles, Seshat's Cliopatria, the historical-
 *  basemaps sheets, IntMap's own reconstructions) and until this file a reader who pressed the LINE got
 *  nothing at all — `imtb-line` had no listener, and the province lines had none either. This module is
 *  the small, always-loaded half of the answer:
 *
 *    rowKey(row)            the fingerprint of a bundle row, written by scripts/build-border-provenance.mjs
 *                           beside every fact it indexes and compared by the card before it uses one, so
 *                           a rebuilt bundle can never borrow the previous build's relation id
 *    decimalsOf(polys)      how many decimal places a row's vertices are actually written to — measured
 *                           on the row, never assumed from the bundle's target
 *    registerReader(r)      the records that draw lines say what they can answer for; nothing here
 *                           names a layer, a bundle or a record
 *    wireLineClick(GE,HOST) ONE listener for every registered line, which yields to every other owner
 *                           of the tap (the shapes #R210 and #R707 built) and only then opens the card
 *    lineNear(GE,pt,HOST)   the same hit test, for a handler that must step aside for a line
 *    sidesAt(ll,r) / last() what Atlas asks (js/atlas-cap-time.js `time.borderSource`)
 *
 *  The card itself — every word the reader sees, the index loads, the report hand-off — is
 *  js/border-provenance-card.js, fetched on the first press (it is not on the boot path).
 *  ⚠ NO DOM AT EVALUATION, NO window AT EVALUATION (its one import, the language registry, has none either): the build script and the node tests import this
 *  file for `rowKey` and must get the same answer the page gets.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';

/* the indexes the build writes (scripts/build-border-provenance.mjs), by the name a side asks for */
export const PROVENANCE_INDEX = Object.freeze({
  ohm: 'data/border-provenance-ohm.json',
  clio: 'data/border-provenance-clio.json',
  gaps: 'data/border-provenance-gaps.json',
});

/** FNV-1a (32 bit) of a row's identity: its English name and its two dates as the bundle writes them.
 *  A tier row writes the name as a string, a country record as `{en: …}`; both are read. */
export function rowKey(f) {
  if (!f) return '';
  const nm = (typeof f[0] === 'string') ? f[0] : ((f[0] && f[0].en) || '');
  const s = nm + '|' + f[2] + '-' + f[3] + '-' + f[4] + '|' + f[5] + '-' + f[6] + '-' + f[7];
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** {decimals, vertices} of a row's rings, as written. `polys` is [[ring,…],…] of [lng,lat] pairs. */
export function decimalsOf(polys) {
  let dec = 0, n = 0;
  const one = (x) => { const s = String(x), i = s.indexOf('.'); if (i >= 0) { const e = s.indexOf('e'); const d = (e > 0 ? e : s.length) - i - 1; if (d > dec) dec = d; } };
  for (const poly of polys || []) for (const ring of poly || []) for (const p of ring || []) { n++; one(p[0]); one(p[1]); }
  return { decimals: dec, vertices: n };
}

/* ── which shapes are under a point, or on either side of a line ──────────────
   ⚠ THE SIDES ARE FOUND BY SAMPLING, NOT BY DISTANCE TO THE RING. The stroked line is not always the polygon's
   own ring: js/border-coast.js draws only the border runs, swaps in the zoomed detail and splices reviewed
   river courses (js/hist-courses.js), so «which ring passes nearest the press» could name a shape whose ring
   is a kilometre from the drawn line. The shapes that cover the press and the eight points around it at the
   tap radius are the shapes the line separates, whatever geometry the line was drawn from. */
const _bbOf = new WeakMap();
function _bb(g) {
  let b = _bbOf.get(g); if (b) return b;
  b = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
  for (const poly of polys) for (const p of (poly && poly[0]) || []) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
  _bbOf.set(g, b); return b;
}
function _inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; }
  return c;
}
function _inGeom(x, y, g) {
  if (!g) return false;
  const b = _bb(g); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
  for (const poly of polys) {
    if (!poly || !poly.length || !_inRing(x, y, poly[0])) continue;
    let hole = false; for (let k = 1; k < poly.length; k++) if (_inRing(x, y, poly[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
/** The features whose polygon covers `lngLat` (rDeg 0) or any of the nine points within rDeg of it, most-covered
 *  first. `rDeg` is a latitude span; the longitude span is widened by 1/cos(lat) so the ring of samples is round. */
export function shapesAt(features, lngLat, rDeg) {
  const x0 = +lngLat.lng, y0 = +lngLat.lat, r = +rDeg || 0;
  const pts = [[x0, y0]];
  if (r > 0) { const k = 1 / Math.max(0.05, Math.cos(y0 * Math.PI / 180)); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pts.push([x0 + Math.cos(a) * r * k, y0 + Math.sin(a) * r]); } }
  const hits = [];
  for (const f of features || []) {
    if (!f || !f.geometry) continue;
    let n = 0; for (const p of pts) if (_inGeom(p[0], p[1], f.geometry)) n++;
    if (n) hits.push([n, f]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map((h) => h[1]);
}

/* ── the readers ──────────────────────────────────────────────────────────────
   A reader is a record family that draws lines on the map:
     { id, family: 'country' | 'subdivision',
       layers()              → the ids of its line layers that are drawn right now,
       sidesAt(lngLat, rDeg) → Promise<side[]>: the shapes of its records under the point (rDeg 0) or within
                               rDeg of it — the two sides of a line, or the one shape a place sits in,
       lineFacts(features)   → Promise<object|null>, optional: what the clicked line feature itself states,
       date()                → the instant the reader is drawing, {y, m, d}, or null }
   Registration order is the order the card lists them in; nothing else depends on it. */
const _readers = [];
export function registerReader(r) {
  if (!r || typeof r.id !== 'string' || typeof r.layers !== 'function' || typeof r.sidesAt !== 'function') throw new Error('border-provenance: a reader needs id, layers() and sidesAt()');
  const i = _readers.findIndex((x) => x.id === r.id);
  if (i >= 0) _readers[i] = r; else _readers.push(r);
}

/* the tap tolerance, asked of the pointer the way js/map-ui.js and js/time-borders.js ask it (#R668) */
function _pad(HOST) {
  try { if (typeof window !== 'undefined' && typeof window._imTouchPrimary === 'function' ? window._imTouchPrimary() : (HOST && HOST.isMobile && HOST.isMobile())) return 15; } catch (_) { /* a mouse */ }
  return 6;
}

/** The registered lines under a screen point: [{reader, features}] (features as the renderer returns them), or []. */
export function lineNear(GE, pt, HOST) {
  const out = [];
  try {
    if (!pt || !GE().hasRenderer()) return out;
    const pad = _pad(HOST), box = [[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]];
    for (const r of _readers) {
      let ids = [];
      try { ids = (r.layers() || []).filter((id) => { try { return !!GE().layers.get(id) && GE().layers.getLayout(id, 'visibility') !== 'none'; } catch (_) { return false; } }); } catch (_) { ids = []; }
      if (!ids.length) continue;
      const fs = GE().coords.queryRenderedFeatures(box, { layers: ids }) || [];
      if (fs.length) out.push({ reader: r, features: fs });
    }
  } catch (_) { return []; }
  return out;
}

/* ⚠ A LINE IS THE LAST OWNER OF A TAP, NEVER THE FIRST. Every layer that owns clicks exclusively (place labels,
   era names, markers — `events.clickLayers({ownersOnly:true})`, the registry js/map-ui.js `_ownedByOther`
   asks) wins when it is under the same padded point; the owners that listen at map level claim the DOM
   event and are heard through `clickClaimed` one microtask later, which is when this decides. */
function _ownedElsewhere(GE, pt, HOST) {
  try {
    const mine = new Set(); for (const r of _readers) { try { (r.layers() || []).forEach((id) => mine.add(id)); } catch (_) { /* none */ } }
    const all = (GE().events.clickLayers ? GE().events.clickLayers({ ownersOnly: true }) : []).filter((id) => !mine.has(id))
      .filter((id) => { try { return !!GE().layers.get(id) && GE().layers.getLayout(id, 'visibility') !== 'none'; } catch (_) { return false; } });
    if (!all.length) return false;
    const pad = _pad(HOST);
    const hit = GE().coords.queryRenderedFeatures([[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]], { layers: all });
    return !!(hit && hit.length);
  } catch (_) { return false; }
}

/* a tool, the drawing pen, Compare's country picker or an isolated country owns the map gesture */
function _gestureOwned(HOST) {
  try {
    if (HOST && HOST.toolMode) return true;
    if (typeof window === 'undefined') return false;
    if (window.__scpPick) return true;
    if (window.DrawTool && typeof window.DrawTool.active === 'function' && window.DrawTool.active()) return true;
    if (window.IntMapIsolate && window.IntMapIsolate.active && window.IntMapIsolate.active()) return true;
  } catch (_) { /* nothing owns it */ }
  return false;
}

/* the last card's facts, for Atlas's «and where does this line come from?» after a press */
let _last = null;
export function remember(prov) { _last = prov || null; }
export function last() { return _last; }

let _wired = false;
/** One map-level click listener for every registered line. Idempotent; `GE` is the engine accessor. */
export function wireLineClick(GE, HOST) {
  if (_wired) return; _wired = true;
  GE().events.on('click', (e) => {
    try {
      if (!e || !e.point || !e.lngLat) return;
      if (GE().events.clickClaimed && GE().events.clickClaimed(e)) return;
      if (_gestureOwned(HOST)) return;
      const hits = lineNear(GE, e.point, HOST);
      if (!hits.length) return;
      if (_ownedElsewhere(GE, e.point, HOST)) return;
      const ll = { lng: e.lngLat.lng, lat: e.lngLat.lat }, pt = { x: e.point.x, y: e.point.y };
      Promise.resolve().then(() => {
        if (GE().events.clickClaimed && GE().events.clickClaimed(e)) return;
        try { GE().events.claimClick(e); } catch (_) { /* the card still opens */ }
        import('./border-provenance-card.js').then((m) => m.BorderProvenanceCard.openAt({ GE, HOST, lngLat: ll, point: pt, hits, pad: _pad(HOST) }))
          .catch(() => { try { HOST.imToast && HOST.imToast(IntMapLang.t(HOST.lang, 'Could not load where this line comes from', 'この線の根拠を読み込めませんでした')); } catch (_) { /* silent */ } });
      });
    } catch (_) { /* never break another listener */ }
  });
}

/** Every registered reader's shapes at a point, for Atlas — `rDeg` 0 is «the shape this place is in». */
export async function sidesAt(lngLat, rDeg) {
  const out = [];
  for (const r of _readers) {
    let sides = [];
    try { sides = (await r.sidesAt(lngLat, rDeg || 0)) || []; } catch (_) { sides = []; }
    if (sides.length) out.push({ reader: r.id, family: r.family, date: (r.date && r.date()) || null, sides });
  }
  return out;
}
