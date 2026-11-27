/* Isolate / highlight outline vs the drawn national border — measured as GEOMETRY, not as spelling.
 *
 * 「Isolate したとき、ハイライトしたときの輪郭と、実際に描かれている国境線にずれがある。」 The outline (mask hole, highlight fill)
 * was the Natural Earth polygon and the border line the OpenFreeMap `boundary` tiles; js/frontier-fit.js makes them one shape.
 * The fixture is real data captured from the running app over the Erzgebirge at z9 (Germany–Czechia), where the tiles name only
 * the Czech side — the case the previous, code-filtered fix could not reach (gap measured there: 8 px median, 26 px max).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frontierGraph, sharedEdges, fitGeometry, countryOf, countryCodes, FRONTIER_TOL_DEG } from '../js/frontier-fit.js';

const FX = JSON.parse(readFileSync(new URL('./fixtures/frontier-fit-erzgebirge.json', import.meta.url), 'utf8'));
const lines = FX.lines.map(([l, r, flat]) => { const c = []; for (let i = 0; i < flat.length; i += 2) c.push([flat[i], flat[i + 1]]); return { l, r, coords: c }; });
const chain = FX.chain;
/* Germany: the real shared chain closed through the north (unshared — stands for the rest of its outline); Czechia: the same
   chain reversed, closed through the south. Shared edges are therefore exactly the chain, as in Natural Earth. */
const north = [[12.9, 51.5], [13.76, 51.5]], south = [[13.76, 49.5], [12.9, 49.5]];
const DEU = { type: 'Polygon', coordinates: [[...chain, ...north, chain[0]]] };
const CZE = { type: 'Polygon', coordinates: [[...chain.slice().reverse(), ...south, chain[chain.length - 1]]] };

const M = 111320;   /* metres per degree of latitude */
function distToRing(p, ring) {   /* metres from p to the nearest point of a ring/polyline (local equirectangular) */
  const kx = Math.cos(p[1] * Math.PI / 180); let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1]; const ex = (b[0] - a[0]) * kx, ey = b[1] - a[1], px = (p[0] - a[0]) * kx, py = p[1] - a[1];
    const l = ex * ex + ey * ey; let t = l ? (px * ex + py * ey) / l : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - t * ex, py - t * ey) * M; if (d < best) best = d;
  }
  return best;
}
/* the line's own points, densified, on the stretch both survey copies agree on (west of the z8/z9 double copy near 13.62–13.75).
   A segment ending in a dead end is left out: tile pieces stop at the clip line inside the tile buffer, outside the square the
   tile draws, and the neighbouring tile carries the line on (measured: the one such end here is 1.6 m off the other copy). */
const _deg = new Map(); for (const ln of lines) for (const p of [ln.coords[0], ln.coords[ln.coords.length - 1]]) { const k = p.join(','); _deg.set(k, (_deg.get(k) || 0) + 1); }
for (const ln of lines) for (let i = 1; i + 1 < ln.coords.length; i++) { const k = ln.coords[i].join(','); _deg.set(k, (_deg.get(k) || 0) + 2); }
const deadEnd = (p) => _deg.get(p.join(',')) === 1;
function linePoints(lo, hi) {
  const out = [];
  for (const ln of lines) for (let i = 0; i + 1 < ln.coords.length; i++) {
    const a = ln.coords[i], b = ln.coords[i + 1]; if (deadEnd(a) || deadEnd(b)) continue;
    for (let k = 0; k < 4; k++) { const p = [a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4]; if (p[0] >= lo && p[0] <= hi) out.push(p); }
  }
  return out;
}
const pct = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

test('the fixture shows the defect: the surveyed polygon stands hundreds of metres beside the drawn border', () => {
  const pts = linePoints(12.98, 13.6); assert.ok(pts.length > 500);
  const d = pts.map((p) => distToRing(p, DEU.coordinates[0]));
  assert.ok(pct(d, 0.5) > 300, 'median gap before the fit ' + pct(d, 0.5).toFixed(0) + ' m');
  assert.ok(lines.every((l) => !(l.l === 'DEU' || l.r === 'DEU')), 'and the tiles never name Germany here — a code filter selects nothing');
});

test('fitted, the land frontier IS the drawn border: every point of the line lies on the outline and every outline vertex on the line', () => {
  const G = frontierGraph(lines); const shared = sharedEdges(DEU, [DEU, CZE]);
  assert.equal(shared.size, chain.length - 1, 'shared edges are exactly the chain (Natural Earth topology)');
  const fit = fitGeometry(DEU, G, shared, ['DEU']); assert.ok(fit.fitted);
  const ring = fit.geometry.coordinates[0];
  const d = linePoints(12.98, 13.6).map((p) => distToRing(p, ring));
  assert.ok(pct(d, 1) < 0.5, 'line → outline: max ' + pct(d, 1).toFixed(3) + ' m');
  const all = lines.map((l) => l.coords);
  const onLine = ring.filter((p) => p[0] >= 12.98 && p[0] <= 13.6 && p[1] < 51).map((p) => Math.min(...all.map((c) => distToRing(p, c))));
  assert.ok(onLine.length > 300, 'the outline took the line\'s own vertices (' + onLine.length + '), not the 53 surveyed ones');
  assert.ok(pct(onLine, 1) < 0.5, 'outline → line: max ' + pct(onLine, 1).toFixed(3) + ' m');
  /* the frontier pieces handed to the edge layer are the same geometry as the outline */
  const fr = fit.frontier.flat(); assert.ok(fr.length > 300);
  assert.ok(fr.every((p) => distToRing(p, ring) < 1e-6), 'the edge line is drawn from the outline itself');
});

test('the coast (unshared edges) is never moved', () => {
  const G = frontierGraph(lines); const fit = fitGeometry(DEU, G, sharedEdges(DEU, [CZE]), ['DEU']);
  const ring = fit.geometry.coordinates[0];
  for (const p of north) assert.ok(ring.some((q) => q[0] === p[0] && q[1] === p[1]), 'coast vertex ' + p + ' kept');
});

test('two neighbours fitted to the same line share one frontier — no sliver between the two highlights', () => {
  const G = frontierGraph(lines);
  const de = fitGeometry(DEU, G, sharedEdges(DEU, [CZE]), ['DEU']).geometry.coordinates[0];
  const cz = fitGeometry(CZE, G, sharedEdges(CZE, [DEU]), ['CZE']).geometry.coordinates[0];
  const d = cz.filter((p) => p[0] >= 12.98 && p[0] <= 13.6 && p[1] > 50).map((p) => distToRing(p, de));
  assert.ok(d.length > 300 && pct(d, 1) < 0.5, 'max ' + pct(d, 1).toFixed(3) + ' m');
});

test('a code is only negative evidence: a line that names both sides, neither of them this country, is not used', () => {
  const foreign = lines.map((l) => ({ ...l, l: 'AUT', r: 'POL' }));
  const fit = fitGeometry(DEU, frontierGraph(foreign), sharedEdges(DEU, [CZE]), ['DEU']);
  assert.deepEqual(fit.geometry.coordinates[0], DEU.coordinates[0]);
  /* …while a line with one side missing (the real tiles) is used — the previous fix required the code and drew nothing here */
  const oneSide = fitGeometry(DEU, frontierGraph(lines), sharedEdges(DEU, [CZE]), ['DEU']);
  assert.notDeepEqual(oneSide.geometry.coordinates[0], DEU.coordinates[0]);
});

test('no frontier loaded → the polygon is the shape and its rings are the line; an island has no frontier to draw', () => {
  const none = fitGeometry(DEU, null, sharedEdges(DEU, [CZE]), ['DEU']);
  assert.equal(none.fitted, false); assert.equal(none.geometry, DEU); assert.equal(none.frontier.length, 1);
  const island = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const fit = fitGeometry(island, frontierGraph(lines), sharedEdges(island, [DEU, CZE]), null);
  assert.equal(fit.geometry, island); assert.deepEqual(fit.frontier, []);
});

test('tile copies of one segment collapse onto one edge; the tolerance is the measured gap with room, not a fit parameter', () => {
  const G1 = frontierGraph(lines), G2 = frontierGraph([...lines, ...lines]);
  assert.equal(G1.size, G2.size);
  assert.ok(FRONTIER_TOL_DEG * M > 5700 && FRONTIER_TOL_DEG * M < 20000, 'TOL covers the largest gap measured (5.7 km)');
});

test('countryOf: a country polygon is recognised by identity, never by a look-alike; codes come from the one reader', () => {
  const f = { id: 'DEU', properties: { ISO_A3: 'DEU', ADM0_A3: 'DEU' }, geometry: DEU };
  const cg = { features: [f, { id: 'CZE', properties: {}, geometry: CZE }] };
  assert.equal(countryOf(cg, DEU), f);
  assert.equal(countryOf(cg, JSON.parse(JSON.stringify(DEU))), null, 'a copy is not the map\'s country (an era polity or a Nominatim shape is not fitted)');
  assert.equal(countryOf(cg, null, 'deu'), f);
  assert.deepEqual(countryCodes(f), ['DEU']);
});

/* THE ONE ENTRY every reader draws from (Isolate's mask and edge, the place highlight, Atlas's country and era highlights) —
   exercised with an engine stand-in that answers what the renderer answers. */
import { countryShapeOnMap } from '../js/frontier-fit.js';
function stubGE({ zoom, tiles = [], sources = {} }) {
  return {
    camera: { getZoom: () => zoom },
    coords: { querySourceFeatures: (id, q) => (id === 'ofm' && q.sourceLayer === 'boundary' ? tiles : []) },
    layers: { hasSource: (id) => id === 'ofm' || id in sources, sourceData: (id) => sources[id] },
  };
}
const asTiles = lines.map((l) => ({ geometry: { type: 'LineString', coordinates: l.coords }, properties: { admin_level: 2, adm0_l: l.l || undefined, adm0_r: l.r || undefined } }));

test('countryShapeOnMap: a country of the map is fitted to the loaded border from z5, and is its own polygon below', () => {
  const deu = { id: 'DEU', properties: { ISO_A3: 'DEU' }, geometry: DEU }, cze = { id: 'CZE', properties: { ISO_A3: 'CZE' }, geometry: CZE };
  const cg = { features: [deu, cze] };
  const at9 = countryShapeOnMap(stubGE({ zoom: 9, tiles: asTiles }), cg, DEU);
  assert.ok(at9.fitted && at9.geometry !== DEU);
  const d = linePoints(12.98, 13.6).map((p) => distToRing(p, at9.geometry.coordinates[0]));
  assert.ok(pct(d, 1) < 0.5, 'max ' + pct(d, 1).toFixed(3) + ' m');
  const byCode = countryShapeOnMap(stubGE({ zoom: 9, tiles: asTiles }), cg, null, 'DEU');
  assert.deepEqual(byCode.geometry, at9.geometry, 'asked by code (Atlas) it is the same shape as asked by polygon (a click)');
  const at4 = countryShapeOnMap(stubGE({ zoom: 4, tiles: asTiles }), cg, DEU);
  assert.equal(at4.geometry, DEU); assert.equal(at4.fitted, false);
  const other = countryShapeOnMap(stubGE({ zoom: 9, tiles: asTiles }), cg, JSON.parse(JSON.stringify(DEU)));
  assert.equal(other.fitted, false, 'a polygon that is not the map\'s country (a Nominatim shape) is left as it is');
});

test('countryShapeOnMap: a polity Chronos is drawing is fitted to the era lines actually drawn (imtb-ln-src / imtb-now-src)', () => {
  const prev = globalThis.window;
  const fc = { features: [{ geometry: DEU, properties: {} }, { geometry: CZE, properties: {} }] };
  globalThis.window = { IntMapTimeBorders: { active: () => true, currentFC: () => fc } };
  try {
    const half = Math.floor(lines.length / 2);
    const src = (ls) => ({ type: 'FeatureCollection', features: ls.map((l) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: l.coords }, properties: {} })) });
    const GE = stubGE({ zoom: 9, sources: { 'imtb-ln-src': src(lines.slice(0, half)), 'imtb-now-src': src(lines.slice(half)) } });
    const sh = countryShapeOnMap(GE, { features: [] }, DEU);
    assert.ok(sh.fitted);
    const d = linePoints(12.98, 13.6).map((p) => distToRing(p, sh.geometry.coordinates[0]));
    assert.ok(pct(d, 1) < 0.5, 'era outline vs drawn era line: max ' + pct(d, 1).toFixed(3) + ' m');
    globalThis.window.IntMapTimeBorders.active = () => false;
    assert.equal(countryShapeOnMap(GE, { features: [] }, DEU).fitted, false, 'at the live date an era polygon is not the map\'s');
  } finally { if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
});
