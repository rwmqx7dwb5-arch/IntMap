/* ============================================================================
 *  #R566 — 「ホバーが重い」: the shared point-in-polygon read every vertex of every shape, every time
 * ----------------------------------------------------------------------------
 *  `window._imPipGeo` (js/map-ui.js) is the ONE predicate five call sites share — js/data-layers.js's
 *  `choroValueAt`, js/map-ui.js's own World-Bank fallback, js/layer-packs.js's `offsetAt`,
 *  js/wb-layers.js's `_imBxChoroValueAt` and js/datacenters.js's country lookup. It had no bounding
 *  box, so the heaviest caller walked `countryGeo` — 258 features, ~548,000 vertices after the idle
 *  swap to the 10 m outlines (js/countries-ui.js:470) — on the main thread for every hover readout.
 *
 *  The fix may only ever REMOVE WORK: a box that says "no" without reading a ring. So the only thing
 *  worth measuring is that
 *      ① the shipped predicate and a naive full walk agree on EVERY point, and
 *      ② the shipped predicate stops READING VERTICES for points it can reject.
 *  ② is counted, not timed: a wall clock measures the machine, a counter measures the algorithm.
 *
 *  ⚠ THE SHIPPED FUNCTION IS RUN, NOT READ. Nothing here matches source text — a spelling check
 *  cannot tell a live box from a dead one (#R488). js/map-ui.js is an ES module (it imports
 *  ./runtime.js), which `vm.runInContext` cannot evaluate — the precedent rig in
 *  tests/r498-checks.test.mjs works because js/mobile-map-input.js has no import statement. So the
 *  real file is loaded the way the browser loads it, with `import()`, over a stubbed window, and
 *  `IntMapModules.layerRegistry` is called to get the real `window._imPipGeo`.
 *
 *  The real geometry is data/ecoregions_2017.geojson (847 features, 614k vertices, 5,213 holes and
 *  shapes that touch both sides of the antimeridian) — the same SHAPE of data as countryGeo, and
 *  actually in this repository, so the equivalence is asserted against polygons nobody designed for
 *  this test.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── the shipped predicate, from the shipped file ─────────────────────────────────────────────── */
async function shippedPip() {
  const g = globalThis;
  g.window = g;
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null });
  g.document = { getElementById: () => null, createElement: el, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], body: el() };
  g.addEventListener = () => {};
  if (!('navigator' in g)) Object.defineProperty(g, 'navigator', { value: { language: 'en' }, configurable: true });
  g.localStorage = { getItem: () => null, setItem() {} };
  g.IntMapLang = { pick: () => (en) => en, pickArgs: () => (en) => en, t: (_l, en) => en };
  g.IntMapGeoEngine = { hasRenderer: () => false, ready: () => false,
    layers: { has: () => false, get: () => null, getLayout: () => 'none', sourceData: () => null },
    coords: { project: () => null, queryRenderedFeatures: () => [] },
    render: { canvas: () => null }, events: { on() {}, onLayer() {} }, camera: {} };
  await import(pathToFileURL(join(ROOT, 'js/map-ui.js')).href);
  assert.equal(typeof g.window.IntMapModules?.layerRegistry, 'function',
    'js/map-ui.js no longer registers IntMapModules.layerRegistry');
  g.window.IntMapModules.layerRegistry({ lang: 'en', canDraw: () => false, demElevAt: () => null });
  assert.equal(typeof g.window._imPipGeo, 'function',
    'the shared point-in-polygon window._imPipGeo is gone from js/map-ui.js');
  return g.window._imPipGeo;
}

/* ── the naive full walk: what the predicate did before #R566, written here and NOT imported ──── */
function naivePip(x, y, g) {
  const ring = (r) => { let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) ins = !ins;
    } return ins; };
  const poly = (p) => { if (!p || !p.length || !ring(p[0])) return false;
    for (let k = 1; k < p.length; k++) if (ring(p[k])) return false; return true; };
  try {
    if (!g) return false;
    if (g.type === 'Polygon') return poly(g.coordinates);
    if (g.type === 'MultiPolygon') return g.coordinates.some(poly);
  } catch (_) {}
  return false;
}

/* deterministic PRNG — a failing point has to be reproducible */
function rng(seed) { let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ── counted geometry: every index read of every ring is tallied ──────────────────────────────── */
function counted(geom, tally) {
  const ringProxy = (r) => new Proxy(r, { get(t, k) {
    if (typeof k === 'string' && k !== 'length' && k === String(+k)) tally.reads++;
    return t[k]; } });
  const part = (p) => p.map(ringProxy);
  return geom.type === 'Polygon'
    ? { type: 'Polygon', coordinates: part(geom.coordinates) }
    : { type: 'MultiPolygon', coordinates: geom.coordinates.map(part) };
}

/* ── the synthetic shapes the real data does not guarantee ────────────────────────────────────── */
const SQUARE_WITH_HOLE = { type: 'Polygon', coordinates: [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]] ] };
const TWO_PARTS = { type: 'MultiPolygon', coordinates: [
  [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]],
  [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]],
   [[23, 23], [27, 23], [27, 27], [23, 27], [23, 23]]] ] };
/* a shape written PAST the antimeridian (Fiji-style, unclipped) and the same shape cut at ±180 */
const OVER_180 = { type: 'Polygon', coordinates: [
  [[175, -18], [185, -18], [185, -16], [175, -16], [175, -18]] ] };
const CLIPPED_180 = { type: 'MultiPolygon', coordinates: [
  [[[175, -18], [180, -18], [180, -16], [175, -16], [175, -18]]],
  [[[-180, -18], [-175, -18], [-175, -16], [-180, -16], [-180, -18]]] ] };
/* a shape whose box is the whole world because it is clipped at both edges (Russia-style) */
const BOTH_EDGES = { type: 'MultiPolygon', coordinates: [
  [[[-180, 60], [-170, 60], [-170, 70], [-180, 70], [-180, 60]]],
  [[[30, 60], [180, 60], [180, 70], [30, 70], [30, 60]]] ] };
/* things that must not start throwing where they used to answer false */
const BROKEN = [
  { type: 'Polygon', coordinates: [] },
  { type: 'Polygon', coordinates: [[]] },
  { type: 'MultiPolygon', coordinates: [[], [[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
  { type: 'Polygon', coordinates: [[[NaN, NaN], [1, 0], [1, 1], [NaN, NaN]]] },
  { type: 'Polygon', coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]], null] },
  { type: 'Point', coordinates: [0, 0] },
  { type: 'Polygon' },
  null,
];

/* ── the real corpus: enough of a real file to be real, capped so the naive walk stays affordable ─ */
function realFeatures(vertexCap) {
  const j = JSON.parse(readFileSync(join(ROOT, 'data/ecoregions_2017.geojson'), 'utf8'));
  const count = (g) => { let v = 0;
    const p = (part) => part.forEach((r) => { v += r.length; });
    if (g.type === 'Polygon') p(g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p);
    return v; };
  const out = []; let total = 0;
  for (const f of j.features) {
    const g = f && f.geometry; if (!g || !g.coordinates) continue;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
    const v = count(g); if (!v) continue;
    if (total + v > vertexCap) continue;
    out.push(g); total += v;
    if (out.length >= 120) break;
  }
  assert.ok(out.length > 30 && total > 20000,
    'data/ecoregions_2017.geojson no longer yields a real polygon corpus (got ' + out.length + ' / ' + total + ')');
  return { geoms: out, vertices: total };
}

/* ══ ① the answer is identical — synthetic shapes, holes, parts, the antimeridian, and rubbish ══ */
test('① _imPipGeo answers exactly what the naive full walk answers (built shapes)', async () => {
  const pip = await shippedPip();
  const shapes = [SQUARE_WITH_HOLE, TWO_PARTS, OVER_180, CLIPPED_180, BOTH_EDGES, ...BROKEN];
  const r = rng(560);
  let checked = 0;
  for (const g of shapes) {
    /* points on the shapes' own scale, on their edges, and anywhere on Earth */
    const pts = [];
    for (let i = 0; i < 400; i++) pts.push([r() * 400 - 200, r() * 180 - 90]);
    for (let i = 0; i < 400; i++) pts.push([r() * 40 - 5, r() * 40 - 5]);
    for (const v of [0, 3, 5, 7, 10, 20, 25, 30, 175, 180, 185, -175, -180])
      for (const w of [-18, -17, -16, 0, 5, 25, 60, 65, 70]) pts.push([v, w]);
    for (const [x, y] of pts) {
      assert.equal(pip(x, y, g), naivePip(x, y, g),
        'disagreement at ' + x + ',' + y + ' on ' + JSON.stringify(g).slice(0, 90));
      checked++;
    }
  }
  assert.ok(checked > 8000, 'too few points to mean anything (' + checked + ')');
});

/* ══ ② the answer is identical on polygons nobody wrote for this test ════════════════════════════ */
test('② _imPipGeo answers exactly what the naive full walk answers (real ecoregion polygons)', async () => {
  const pip = await shippedPip();
  const { geoms } = realFeatures(60000);
  const r = rng(1560);
  let checked = 0, inside = 0;
  /* random points worldwide, plus points aimed AT each shape (a corpus of misses proves nothing) */
  const pts = [];
  for (let i = 0; i < 420; i++) pts.push([r() * 360 - 180, r() * 170 - 85]);
  for (const g of geoms) {
    const first = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
    for (let i = 0; i < 3; i++) { const p = first[Math.floor(r() * first.length)]; pts.push([p[0], p[1]]); }
    const a = first[0], b = first[Math.floor(first.length / 2)];
    pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  for (const g of geoms) for (const [x, y] of pts) {
    const got = pip(x, y, g), want = naivePip(x, y, g);
    assert.equal(got, want, 'disagreement at ' + x + ',' + y);
    if (want) inside++;
    checked++;
  }
  assert.ok(checked > 100000, 'too few (point, polygon) pairs (' + checked + ')');
  assert.ok(inside > 50, 'the corpus produced almost no HITS (' + inside + ') — it only proves misses');
});

/* ══ ③ a rejected point costs zero vertex reads, and the box is built once ══════════════════════ */
test('③ a point outside the box reads no vertices at all (and the box is not rebuilt)', async () => {
  const pip = await shippedPip();
  for (const g of [SQUARE_WITH_HOLE, TWO_PARTS, CLIPPED_180]) {
    const tally = { reads: 0 };
    const cg = counted(g, tally);
    /* first call may walk the shape once to learn its box */
    assert.equal(pip(1000, 1000, cg), false);
    const build = tally.reads;
    assert.ok(build > 0, 'nothing was read even once — the counter is not wired to the rings');
    tally.reads = 0;
    for (let i = 0; i < 50; i++) assert.equal(pip(1000 + i, -1000 - i, cg), false);
    assert.equal(tally.reads, 0,
      'a point far outside the shape still read ' + tally.reads + ' vertices over 50 calls');
  }
  /* a point INSIDE still goes through the ray-cast — the box must not be answering "yes" */
  const tally = { reads: 0 };
  const cg = counted(SQUARE_WITH_HOLE, tally);
  pip(1000, 1000, cg); tally.reads = 0;
  assert.equal(pip(1, 1, cg), true);
  assert.ok(tally.reads >= SQUARE_WITH_HOLE.coordinates[0].length,
    'a point inside the box did not walk the ring — the box is deciding hits, not just misses');
});

/* ══ ④ on the real corpus the walk actually collapses ═══════════════════════════════════════════ */
test('④ the same sweep over real polygons reads a small fraction of the vertices it used to', async () => {
  const pip = await shippedPip();
  const { geoms, vertices } = realFeatures(60000);
  const r = rng(2560);
  const pts = []; for (let i = 0; i < 120; i++) pts.push([r() * 360 - 180, r() * 170 - 85]);
  const tally = { reads: 0 };
  const cg = geoms.map((g) => counted(g, tally));
  /* the boxes are learned once — this is the cost the app pays on the first hover, not on every one */
  for (const g of cg) pip(1e6, 1e6, g);
  const warm = tally.reads;
  tally.reads = 0;
  for (const [x, y] of pts) for (const g of cg) pip(x, y, g);
  const after = tally.reads;
  /* the naive walk, counted the same way */
  const nt = { reads: 0 };
  const ng = geoms.map((g) => counted(g, nt));
  for (const [x, y] of pts) for (const g of ng) naivePip(x, y, g);
  const before = nt.reads;
  const pct = (after / before) * 100;
  assert.ok(before > 1000000, 'the naive sweep is too small to be evidence (' + before + ')');
  assert.ok(pct < 5, 'the box is not removing the walk: ' + after + ' / ' + before
    + ' vertex reads (' + pct.toFixed(2) + '%), corpus ' + vertices + ' vertices, warm-up ' + warm);
  /* printed so the number in DEV-NOTES is a measurement and not a hope */
  console.log('    #R566 vertex reads over ' + pts.length + ' points × ' + geoms.length + ' polygons: '
    + before.toLocaleString() + ' → ' + after.toLocaleString() + ' (' + pct.toFixed(2) + '%)');
});

/* ══ ⑤ nothing has to be invalidated when countryGeo is swapped 110 m → 10 m ════════════════════ */
test('⑤ a replaced collection is never answered out of the old shapes boxes', async () => {
  const pip = await shippedPip();
  /* the swap js/countries-ui.js performs: HOST.countryGeo = hi — new feature objects, new arrays */
  const coarse = [{ id: 'AA', geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }];
  const fine = [{ id: 'AA', geometry: { type: 'Polygon', coordinates: [[[40, 40], [50, 40], [50, 50], [40, 50], [40, 40]]] } }];
  const at = (feats, x, y) => feats.find((f) => pip(x, y, f.geometry)) || null;
  assert.ok(at(coarse, 5, 5), 'the coarse collection lost its own point');
  assert.equal(at(fine, 5, 5), null, 'the point moved with the data — the fine collection must miss it');
  assert.ok(at(fine, 45, 45), 'the fine collection did not answer for its own point');
  assert.equal(at(coarse, 45, 45), null, 'the coarse collection answered for a point it does not contain');

  /* and a shape edited IN PLACE (a part appended) must not keep the box it had before */
  const g = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] };
  assert.equal(pip(60, 60, g), false);
  g.coordinates.push([[[59, 59], [61, 59], [61, 61], [59, 61], [59, 59]]]);
  assert.equal(pip(60, 60, g), naivePip(60, 60, g), 'a stale box survived an in-place edit');
});
