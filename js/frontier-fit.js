/* ============================================================================
 *  IntMap · ONE SHAPE FOR A COUNTRY ON THE MAP — the polygon whose land frontier IS the drawn border
 * ----------------------------------------------------------------------------
 *  「Isolate したとき、ハイライトしたときの輪郭と、実際に描かれている国境線にずれがある。」(2026-11-27, reported
 *  again after two fixes.)
 *
 *  A country reaches the screen from two surveys. Its area (the Isolate mask's hole, the highlight's fill) is a
 *  Natural Earth polygon (window.countryGeo); its frontier (`borders-only-line`, js/app-body.js) is the OpenFreeMap
 *  `boundary` line, which is OSM. The two differ by 0.7–1.6 km at the median and up to 5.7 km (MEASURED 2026-11-27
 *  on DEU-CZE, FRA-ESP, USA-MEX, ZAF-LSO, BEN-NGA, RUS-KAZ at z7–8), i.e. 8 px median and 26 px at worst on
 *  Germany at z9. The two earlier fixes kept two geometries and tried to make them agree:
 *    · they CHOSE the frontier by its country code (`adm0_l` / `adm0_r`), and the tiles do not carry it reliably —
 *      MEASURED in Europe at z5: of 124 frontier features 71 name both sides, 35 one side, 18 neither; the
 *      German–Czech line at z9 names only CZE. Where the code was missing nothing was snapped and nothing was drawn.
 *    · they MOVED each polygon vertex onto its nearest frontier point, so between two vertices the hole cut a chord
 *      across every bend of the line.
 *
 *  This module makes the two one shape instead. The polygon's frontier edges are REPLACED by the frontier line itself
 *  (its own vertices, walked along its own segments), so the hole, the fill, the edge line and the highlight line are
 *  all drawn from one geometry whose frontier is, vertex for vertex, the line the base map draws.
 *
 *    1. WHICH EDGES ARE FRONTIER is a fact of the polygon data, not a guess: Natural Earth admin-0 is topologically
 *       clean, so an edge shared with another country's polygon is a land frontier and an unshared edge is coast
 *       (MEASURED: CHE / CZE / LSO 100 % shared, DEU 1,609 of 3,005, BEN 610 of 615). Coast is never moved.
 *    2. WHICH LINE is found by geometry: the frontier segment nearest each end of a frontier edge, within TOL.
 *       A code is used only as NEGATIVE evidence — a segment that names both its sides, neither of them this
 *       country, is not this country's frontier.
 *    3. THE PATH between the two ends is walked through the line's own graph (tiles share their vertices across
 *       the seam — measured: 2,122 segments, 18 dead ends, all on tile clip lines in the buffer), and only through
 *       vertices within TOL of that edge: «the part of the line that runs along this edge». No path → the edge's
 *       ends still land on the line, and the chord between them is the polygon's own.
 *
 *  Pure functions over plain coordinates (no window, no renderer) so tests/isolate-outline-geometry-checks.test.mjs
 *  measures the result as geometry. js/map-tools.js feeds it the frontier segments the renderer has loaded.
 * ==========================================================================*/

import { NATIONAL_BORDER_FILTER } from './border-style.js';

/* TOL: how far apart two surveys of the same frontier may be and still be read as one line. MEASURED 2026-11-27: the
   largest gap on six frontiers was 5.7 km (ZAF-LSO, RUS-KAZ); 0.1° (≈ 11 km at the equator, less in longitude
   further north — distances here scale longitude by cos(lat)) is twice that. It only bounds a search: a larger gap is
   left as surveyed (the safe side), and a frontier line within TOL that is not along a frontier EDGE is never used.
   Expires if either survey changes so much that the two drift further apart. */
export const FRONTIER_TOL_DEG = 0.1;
/* ofm carries the national frontier from z5 (measured 2026-11-18); below it the polygon edge stands for the line. Expires if
   OpenFreeMap changes its boundary tiles. */
export const OFM_FRONTIER_MINZOOM = 5;
/* the vertex key: 1e-6° (≈ 0.1 m) is below the resolution of any vector tile this map loads (z14 is ≈ 5e-6° per tile
   unit), so two tiles' copies of one vertex fall on one key and two different vertices never do */
const Q = 1e6;
const key = (x, y) => Math.round(x * Q) + ',' + Math.round(y * Q);

/* The frontier as a graph. `lines`: [{ coords:[[lng,lat],...], l?:code, r?:code }] (the ofm `boundary` features, any
   number of tile copies). Duplicate segments (the copies in two tiles' buffers) collapse onto one edge. */
export function frontierGraph(lines, tol = FRONTIER_TOL_DEG) {
  const nodes = [], adj = [], ids = new Map(), segA = [], segB = [], segL = [], segR = [], seen = new Set();
  const node = (p) => { const k = key(p[0], p[1]); let i = ids.get(k); if (i == null) { i = nodes.length; ids.set(k, i); nodes.push([p[0], p[1]]); adj.push([]); } return i; };
  for (const ln of lines || []) {
    const c = ln && ln.coords; if (!c || c.length < 2) continue;
    for (let i = 0; i + 1 < c.length; i++) {
      const a = node(c[i]), b = node(c[i + 1]); if (a === b) continue;
      const sk = a < b ? a + '_' + b : b + '_' + a; if (seen.has(sk)) continue; seen.add(sk);
      segA.push(a); segB.push(b); segL.push(ln.l || null); segR.push(ln.r || null); adj[a].push(b); adj[b].push(a);
    }
  }
  const cell = tol, cells = new Map();
  let bw = Infinity, bs = Infinity, be = -Infinity, bn = -Infinity;
  for (const p of nodes) { if (p[0] < bw) bw = p[0]; if (p[0] > be) be = p[0]; if (p[1] < bs) bs = p[1]; if (p[1] > bn) bn = p[1]; }
  for (let s = 0; s < segA.length; s++) {
    const a = nodes[segA[s]], b = nodes[segB[s]];
    const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
    const y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; let L = cells.get(k); if (!L) cells.set(k, L = []); L.push(s); }
  }
  return { nodes, adj, segA, segB, segL, segR, cells, cell, tol, size: segA.length, bbox: [bw, bs, be, bn] };
}

const kxAt = (lat) => Math.max(0.05, Math.cos(lat * Math.PI / 180));
function segDist(p, a, b, kx) {   /* distance (degrees, longitude scaled by kx) from p to segment ab, and the parameter */
  const ex = (b[0] - a[0]) * kx, ey = b[1] - a[1], px = (p[0] - a[0]) * kx, py = p[1] - a[1];
  const l = ex * ex + ey * ey; let t = l ? (px * ex + py * ey) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(px - t * ex, py - t * ey), t };
}
const len = (a, b, kx) => Math.hypot((b[0] - a[0]) * kx, b[1] - a[1]);

/* the nearest point on the frontier to p within tol, on a segment that may be this country's (codes: negative evidence) */
function nearest(G, p, codes) {
  const kx = kxAt(p[1]), r = Math.ceil(G.tol / G.cell / kx), cx = Math.floor(p[0] / G.cell), cy = Math.floor(p[1] / G.cell);
  let best = null, bd = G.tol; const done = new Set();
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - 1; y <= cy + 1; y++) {
    const L = G.cells.get(x + ',' + y); if (!L) continue;
    for (const s of L) {
      if (done.has(s)) continue; done.add(s);
      const l = G.segL[s], rr = G.segR[s];
      if (codes && l && rr && codes.indexOf(l) < 0 && codes.indexOf(rr) < 0) continue;   /* names both sides, neither is us */
      const a = G.nodes[G.segA[s]], b = G.nodes[G.segB[s]]; const m = segDist(p, a, b, kx);
      if (m.d < bd) { bd = m.d; best = { s, t: m.t, q: [a[0] + (b[0] - a[0]) * m.t, a[1] + (b[1] - a[1]) * m.t], d: m.d }; }
    }
  }
  return best;
}

/* The walk along the line from projection P to projection R (each {s,t,q}), through vertices within tol of the polygon
   edge u→v only. Returns the interior points then R.q, or null when the line does not run along this edge. */
function walk(G, P, R, u, v) {
  if (P.s === R.s) return [R.q];
  const kx = kxAt((u[1] + v[1]) / 2);
  const ok = (n) => segDist(G.nodes[n], u, v, kx).d <= G.tol;
  const pa = G.segA[P.s], pb = G.segB[P.s], ra = G.segA[R.s], rb = G.segB[R.s];
  const dist = new Map(), prev = new Map(), heap = [];
  const pushH = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const popH = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const relax = (n, d, from) => { if (!ok(n)) return; const o = dist.get(n); if (o == null || d < o) { dist.set(n, d); prev.set(n, from); pushH(d, n); } };
  relax(pa, len(P.q, G.nodes[pa], kx), -1); relax(pb, len(P.q, G.nodes[pb], kx), -1);
  let goal = -1, goalD = Infinity; const LIMIT = 20000; let steps = 0;
  while (heap.length && steps++ < LIMIT) {
    const [d, n] = popH(); if (d !== dist.get(n)) continue; if (d >= goalD) break;
    if (n === ra || n === rb) { const t = d + len(G.nodes[n], R.q, kx); if (t < goalD) { goalD = t; goal = n; } }
    for (const m of G.adj[n]) relax(m, d + len(G.nodes[n], G.nodes[m], kx), n);
  }
  if (goal < 0) return null;
  const path = []; for (let n = goal; n !== -1; n = prev.get(n)) path.push(G.nodes[n]);
  path.reverse(); path.push(R.q); return path;
}

/* Which edges of `geometry` are land frontier: an edge whose two vertices are an edge of another polygon in `others`
   (Natural Earth's shared topology). Returns a Set of 'x,y|x,y' keys (unordered). */
export function sharedEdges(geometry, others) {
  const mine = new Set(), out = new Set();
  const ek = (a, b) => { const ka = key(a[0], a[1]), kb = key(b[0], b[1]); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const rings = (g) => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of rings(geometry)) for (let i = 0; i + 1 < r.length; i++) { mine.add(ek(r[i], r[i + 1])); const p = r[i]; if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
  for (const og of others || []) {
    if (!og || og === geometry) continue;
    for (const r of rings(og)) {
      let hit = false; for (const p of r) { if (p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n) { hit = true; break; } }
      if (!hit) continue;
      for (let i = 0; i + 1 < r.length; i++) { const k = ek(r[i], r[i + 1]); if (mine.has(k)) out.add(k); }
    }
  }
  return out;
}

/* Re-draw one ring with its frontier edges replaced by the frontier line. Returns { ring, runs } — runs are the pieces
   of the result that ARE the frontier line (for a layer that strokes only the frontier). */
function fitRing(ring, G, shared, codes) {
  const n = ring.length; if (n < 4) return { ring, runs: [] };
  /* a ring nowhere near the loaded line (an island, the far side of a large country) is returned as it is, before any work */
  { const [bw, bs, be, bn] = G.bbox, m = G.tol * 4; let near = false;
    for (let i = 0; i < n; i++) { const p = ring[i]; if (p[0] >= bw - m && p[0] <= be + m && p[1] >= bs - G.tol && p[1] <= bn + G.tol) { near = true; break; } }
    if (!near) return { ring, runs: [] }; }
  const ek = (a, b) => { const ka = key(a[0], a[1]), kb = key(b[0], b[1]); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  const pr = new Array(n).fill(undefined);
  const proj = (i) => { if (pr[i] === undefined) pr[i] = nearest(G, ring[i], codes); return pr[i]; };
  /* steps[i]: the walk for edge i → i+1, or null */
  const steps = new Array(n - 1).fill(null);
  const [bw, bs, be, bn] = G.bbox, mx = G.tol * 4, my = G.tol;
  const away = (p) => p[0] < bw - mx || p[0] > be + mx || p[1] < bs - my || p[1] > bn + my;
  for (let i = 0; i + 1 < n; i++) {
    if (away(ring[i]) && away(ring[i + 1])) continue;   /* no loaded line can run along this edge */
    if (!shared.has(ek(ring[i], ring[i + 1]))) continue;
    const P = proj(i), R = proj(i + 1); if (!P || !R) continue;
    steps[i] = walk(G, P, R, ring[i], ring[i + 1]);
  }
  const moved = (i) => { const prevStep = steps[(i - 1 + (n - 1)) % (n - 1)], step = steps[i % (n - 1)]; return !!(prevStep || step); };
  const at = (i) => (moved(i) && proj(i)) ? proj(i).q : ring[i];
  const out = [], runs = []; let run = null;
  const push = (arr, q) => { const l = arr[arr.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) arr.push(q); };
  push(out, at(0));
  for (let i = 0; i + 1 < n; i++) {
    const st = steps[i];
    if (st) { if (!run) { run = []; push(run, at(i)); } for (const q of st) { push(out, q); push(run, q); } }
    else { if (run) { if (run.length > 1) runs.push(run); run = null; } push(out, at(i + 1)); }
  }
  if (run && run.length > 1) {
    /* a run that reaches the ring's end continues into the one that starts it */
    if (steps[0] && runs.length && runs[0][0][0] === run[run.length - 1][0] && runs[0][0][1] === run[run.length - 1][1]) runs[0] = run.concat(runs[0].slice(1));
    else runs.push(run);
  }
  const f = out[0], l = out[out.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) out.push(f.slice());
  return { ring: out, runs };
}

/* The one shape: `geometry` (Polygon / MultiPolygon) with every land-frontier edge replaced by the frontier line in G.
   `shared` from sharedEdges(); `codes` the country's ISO 3166-1 alpha-3 codes (or null). Without a graph the geometry
   is returned as it is, and `frontier` is every ring (the polygon edge stands for the line where the tiles carry none). */
export function fitGeometry(geometry, G, shared, codes) {
  const g = geometry; if (!g || !/Polygon$/.test(g.type || '')) return { geometry: g, frontier: [], fitted: false };
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!G || !G.size) return { geometry: g, frontier: polys.flat(), fitted: false };
  if (!shared || !shared.size) return { geometry: g, frontier: [], fitted: true };   /* no land frontier (an island): nothing to replace, no line to draw */
  const frontier = [];
  const fitted = polys.map((poly) => poly.map((r) => { const f = fitRing(r, G, shared, codes); for (const run of f.runs) frontier.push(run); return f.ring; }));
  return { geometry: g.type === 'Polygon' ? { type: 'Polygon', coordinates: fitted[0] } : { type: 'MultiPolygon', coordinates: fitted }, frontier, fitted: true };
}

/* ── THE SHAPE ON THE MAP, as the renderer has it loaded now ───────────────────────────────────────────────────────
   Every reader that draws a country against the visible border asks HERE — the Isolate mask and its edge line, the
   highlight's fill and line (js/map-tools.js), Atlas's country highlight (js/atlas-console.js) — so the four are one
   geometry. `GE` is the engine contract (window.IntMapGeoEngine), `feat` a feature of `countryGeo`, `filter` the
   national-border filter of js/border-style.js (the same expression `borders-only-line` draws with), `minZoom` the
   zoom from which the tiles carry that line. Below it, or with no frontier loaded, the polygon is the shape and its
   rings are the line (what the map draws there too). `key` changes only when what is loaded changes, so a caller
   re-fitting on every idle re-draws only when the answer can differ. */
/* the feature of today's countryGeo that a polygon IS (the same geometry object — a caller that hands over a country hands over
   that object), or, with no polygon, the one with this code. A polygon from anywhere else (an era polity, a Nominatim boundary) is
   not a country of this map and is not fitted to its border. */
export function countryOf(countryGeo, geometry, iso3) {
  const fs = countryGeo && countryGeo.features; if (!fs) return null;
  if (geometry) return fs.find((x) => x && x.geometry === geometry) || null;
  if (!iso3) return null; const c = String(iso3).toUpperCase();
  return fs.find((x) => x && (String(x.id).toUpperCase() === c || [x.properties && x.properties.__code, x.properties && x.properties.ISO_A3_EH, x.properties && x.properties.ADM0_A3].some((v) => v != null && String(v).toUpperCase() === c))) || null;
}
/* The tiles name a frontier's sides by ISO 3166-1 alpha-3 (`adm0_l` / `adm0_r`) — when they name them at all. A country feature
   carries its code under several property names; this is the one reading of them. */
export function countryCodes(f) {
  try { const p = (f && f.properties) || {}, out = [];
    for (const c of [f && f.id, p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3]) { const v = c == null ? '' : String(c).toUpperCase(); if (/^[A-Z]{3}$/.test(v) && out.indexOf(v) < 0) out.push(v); }
    return out.length ? out : null; } catch (_) { return null; }
}
const _shared = new WeakMap();   /* geometry → its shared-edge set; the polygon data never changes under a geometry */
function shapeOnMap(GE, feat, countryGeo, { filter, minZoom, codes } = {}) {
  const g = feat && feat.geometry;
  const rings = !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const plain = { geometry: g, frontier: rings, fitted: false, key: 'orig' };
  try {
    if (!g || !GE || !GE.layers.hasSource('ofm') || GE.camera.getZoom() < minZoom) return plain;
    let w = 180, s = 90, e = -180, n = -90;
    for (const r of rings) for (const p of r) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    const T = FRONTIER_TOL_DEG; w -= T * 4; e += T * 4; s -= T; n += T;   /* T in longitude is up to 1/cos(lat) wider */
    const fs = GE.coords.querySourceFeatures('ofm', { sourceLayer: 'boundary', filter }) || [];
    const lines = []; let sig = 0;
    for (const f of fs) {
      const fg = f && f.geometry; const ls = !fg ? [] : fg.type === 'LineString' ? [fg.coordinates] : fg.type === 'MultiLineString' ? fg.coordinates : [];
      const p = f.properties || {};
      for (const l of ls) {
        let inBox = false; for (const q of l) { if (q[0] >= w && q[0] <= e && q[1] >= s && q[1] <= n) { inBox = true; break; } }
        if (!inBox) continue; lines.push({ coords: l, l: p.adm0_l || null, r: p.adm0_r || null }); sig += l.length;
      }
    }
    if (!lines.length) return { ...plain, key: 'none' };
    let shared = _shared.get(g);
    if (!shared) { shared = sharedEdges(g, ((countryGeo && countryGeo.features) || []).map((f) => f && f.geometry)); _shared.set(g, shared); }
    const G = frontierGraph(lines);
    return { ...fitGeometry(g, G, shared, codes || null), key: lines.length + ':' + sig + ':' + G.size };
  } catch (_) { return plain; }
}

/* THE ENTRY EVERY READER USES: the shape of `geo` (a geometry or feature; or, with none, the country `iso3`) as this map draws it.
   A country of `countryGeo` is fitted to the national border (js/border-style.js NATIONAL_BORDER_FILTER, the expression the border
   is drawn with); any other polygon is its own shape and its rings are its line. Readers: js/map-tools.js (Isolate, the highlight),
   js/atlas-console.js (Atlas's country highlight, through the host table — it is a lazy chunk). */
export function countryShapeOnMap(GE, countryGeo, geo, iso3) {
  const g = geo && geo.type === 'Feature' ? geo.geometry : geo;
  try { const f = countryOf(countryGeo, g, g ? null : iso3);
    if (f) return shapeOnMap(GE, f, countryGeo, { filter: NATIONAL_BORDER_FILTER(), minZoom: OFM_FRONTIER_MINZOOM, codes: countryCodes(f) });
    const era = g && eraShapeOnMap(GE, g); if (era) return era; } catch (_) { /* below */ }
  const rings = !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  return { geometry: g, frontier: rings, fitted: false, key: 'orig' };
}

/* ── THE SAME FOR A POLITY OF THE YEAR CHRONOS IS DRAWING ─────────────────────────────────────────────────────────────
   While the clock is in the past the border on screen is not the polygon's own ring: js/time-borders.js strokes the era record
   through `imtb-ln-src` (OpenHistoricalMap's detail line where it holds one) and, where the era's borders are today's, draws
   today's line into `imtb-now-src` and clips the era line away. Both are what is drawn, so a polity of the drawn collection
   (IntMapTimeBorders.currentFC — the highlight and Isolate hand over those very geometry objects) is fitted to exactly those
   lines; its shared edges are the ones it shares with the other polities drawn. No codes: an era line carries none. */
const _eraShared = new WeakMap();
function eraShapeOnMap(GE, g) {
  const TB = (typeof window !== 'undefined') ? window.IntMapTimeBorders : null;
  if (!(TB && TB.active && TB.active() && TB.currentFC)) return null;
  const fc = TB.currentFC(); const feats = (fc && fc.features) || [];
  if (!feats.some((x) => x && x.geometry === g)) return null;
  const lines = []; let sig = 0;
  for (const id of ['imtb-ln-src', 'imtb-now-src']) {
    let d = null; try { d = GE.layers.hasSource(id) ? GE.layers.sourceData(id) : null; } catch (_) { d = null; }
    for (const ft of (d && d.features) || []) {
      const fg = ft && ft.geometry; const ls = !fg ? [] : fg.type === 'LineString' ? [fg.coordinates] : fg.type === 'MultiLineString' ? fg.coordinates : [];
      for (const l of ls) { if (l && l.length > 1) { lines.push({ coords: l }); sig += l.length; } }
    }
  }
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  if (!lines.length) return { geometry: g, frontier: rings, fitted: false, key: 'era-none' };
  let byFc = _eraShared.get(fc); if (!byFc) { byFc = new WeakMap(); _eraShared.set(fc, byFc); }
  let shared = byFc.get(g); if (!shared) { shared = sharedEdges(g, feats.map((x) => x && x.geometry)); byFc.set(g, shared); }
  const G = frontierGraph(lines);
  return { ...fitGeometry(g, G, shared, null), key: 'era:' + lines.length + ':' + sig };
}
