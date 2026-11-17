/* ============================================================================
 *  GIS · gis-foundation-refine — the ops over the kernel's new shapes, `grid`, and four new
 *  `aggregate` statistics (js/gis-ops.js)
 * ----------------------------------------------------------------------------
 *  What each claims, and therefore what has to stay true:
 *
 *    ① centroid / pointOnSurface: one Point per input row, the row's columns kept; pointOnSurface's
 *       point is inside or on its polygon (asked of the kernel's own point-in-polygon)
 *    ② convexHull: one hull per `by` group (one for the whole dataset when `by` is absent), and the
 *       hull CONTAINS every member position; simplify: fewer positions, totals in stats
 *    ③ grid: every unclipped cell's measured area is cellKm² — at the equator and at 60°N, for
 *       squares and for hexagons — and the cells tile: their union has the area of their sum
 *    ④ grid across the antimeridian: one degree of data either side of 180° gets a grid one degree
 *       wide, not 359°, and a cell over the seam is split by the kernel and keeps its whole area
 *    ⑤ grid → aggregate is a hexbin count: every point is counted exactly once over cells that do
 *       not overlap, and clip cuts the cells to the input's area
 *    ⑥ grid refuses by name what would not fit in memory, before building anything
 *    ⑦ aggregate median / percentile / stdev / majority: the numbers against a reference written
 *       here, and the quantity rules — a category's median is refused, a density's median is not
 *
 *  ⚠ THE REFERENCES ARE WRITTEN HERE, NOT ASKED OF THE OP: the percentile is computed by sorting, the
 *  sample stdev by its definition, the cell area as cellKm². A check that asked the runner's own
 *  helpers would agree with them by construction.
 * ==========================================================================*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/geo-shared.mjs';

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisIndex } = await import('../js/gis-index.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisUnits = makeGisUnits();
  try { w.IntMapGisIndex = makeGisIndex(); } catch (_) { /* asked for, never required */ }
  await geometry.ready();
  return { w, data, geometry, ops };
}

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const ring = (W, S, E, N) => [[W, S], [E, S], [E, N], [W, N], [W, S]];
const boxF = (W, S, E, N, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [ring(W, S, E, N)] } });
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

async function ok(B, step) {
  const res = await B.ops.run(step);
  assert.equal(res.ok, true, step.op + ' refused: ' + res.why + ' ' + JSON.stringify(res.detail));
  return res;
}

/* ══ ① centroid / pointOnSurface ══════════════════════════════════════════════════════════════════ */

/* a C: its centroid lies in the gap, which is exactly why pointOnSurface exists */
const cShape = (p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0]]] } });

test('① centroid and pointOnSurface: one Point per row, columns kept; the surface point is inside, the centroid need not be', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'shapes', features: [cShape({ name: 'C', n: 1 }), boxF(179, -18, -179, -16, { name: 'fiji', n: 2 }), pt(5, 5, { name: 'p', n: 3 })] });
  const c = await ok(B, { op: 'centroid', inputs: [src.id] });
  const s = await ok(B, { op: 'pointOnSurface', inputs: [src.id] });
  for (const res of [c, s]) {
    const rows = res.dataset.features();
    assert.equal(rows.length, 3, 'one point per row');
    assert.deepEqual(rows.map((f) => f.properties.name), ['C', 'fiji', 'p'], 'the rows lost their columns or their order');
    assert.ok(rows.every((f) => f.geometry.type === 'Point'));
    assert.equal(res.dataset.geometryType, 'Point');
  }
  const [cC, cFiji] = c.dataset.features().map((f) => f.geometry.coordinates);
  assert.ok(!B.geometry.pointInGeometry(cC, cShape().geometry), 'the C\'s centroid is in the gap — this fixture measured nothing');
  assert.ok(Math.abs(Math.abs(cFiji[0]) - 180) < 0.01 && cFiji[1] < -16 && cFiji[1] > -18, 'Fiji\'s centroid is not at the seam: ' + cFiji);
  const [sC, sFiji] = s.dataset.features().map((f) => f.geometry.coordinates);
  assert.ok(B.geometry.pointInGeometry(sC, cShape().geometry), 'pointOnSurface is not inside the C');
  assert.ok(B.geometry.pointInGeometry(sFiji, src.features()[1].geometry), 'pointOnSurface is not inside the seam box');
  assert.equal(c.dataset.provenance.op, 'centroid');
  /* a refusal the kernel names reaches the reader under that name, not as an empty answer */
  const band = B.data.add({ title: 'band', features: [boxF(-180, -10, 180, 10)] });
  const bad = await B.ops.run({ op: 'centroid', inputs: [band.id] });
  assert.equal(bad.ok, false, 'a band symmetric about the equator was given a centroid');
  assert.equal(bad.why, 'geometry-failed');
  assert.equal(bad.detail.why, 'centroid-undefined');
});

/* ══ ② convexHull / simplify ══════════════════════════════════════════════════════════════════════ */

test('② convexHull: one hull per group (one for all when `by` is absent) that contains every member', async () => {
  const B = await boot();
  const r = rng(7);
  const feats = [];
  for (let i = 0; i < 60; i++) feats.push(pt(130 + r() * 4, 30 + r() * 4, { k: i % 2 ? 'odd' : 'even' }));
  feats.push(boxF(131, 31, 131.5, 31.5, { k: 'even' }));
  const src = B.data.add({ title: 'pts', features: feats });
  const all = await ok(B, { op: 'convexHull', inputs: [src.id] });
  assert.equal(all.dataset.features().length, 1);
  const hull = all.dataset.features()[0];
  assert.equal(hull.properties._hullOf, 61);
  for (const f of feats) {
    const ps = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates[0];
    for (const p of ps) assert.ok(B.geometry.pointInGeometry(p, hull.geometry) || B.geometry.attempt.distanceKm({ type: 'Point', coordinates: p }, hull.geometry).value < 1e-6, 'a member is outside its hull: ' + p);
  }
  assert.ok(hull.properties._areaKm2 > 0);
  const by = await ok(B, { op: 'convexHull', inputs: [src.id], params: { by: 'k' } });
  assert.deepEqual(by.dataset.features().map((f) => f.properties.k), ['even', 'odd'], 'one hull per group, in the table\'s order');
  assert.equal(by.dataset.features().reduce((t, f) => t + f.properties._hullOf, 0), 61);
  assert.equal((await B.ops.run({ op: 'convexHull', inputs: [src.id], params: { by: 'nope' } })).why, 'unknown-field');
});

test('② simplify: fewer positions on a dense line, the totals in stats, a negative tolerance refused', async () => {
  const B = await boot();
  const line = []; for (let i = 0; i <= 400; i++) line.push([135 + i * 0.005, 35 + 0.0005 * Math.sin(i)]);
  const ring_ = []; for (let i = 0; i < 360; i++) ring_.push([140 + Math.cos(i * Math.PI / 180), 40 + 0.8 * Math.sin(i * Math.PI / 180)]);
  ring_.push(ring_[0]);
  const src = B.data.add({ title: 'dense', features: [
    { type: 'Feature', properties: { id: 'l' }, geometry: { type: 'LineString', coordinates: line } },
    { type: 'Feature', properties: { id: 'r', _areaKm2: 1 }, geometry: { type: 'Polygon', coordinates: [ring_] } },
  ] });
  const res = await ok(B, { op: 'simplify', inputs: [src.id], params: { toleranceKm: 1 } });
  const st = res.stats.simplify;
  assert.equal(st.positionsBefore, 401 + 361);
  assert.ok(st.positionsAfter < st.positionsBefore / 4, 'barely simplified: ' + JSON.stringify(st));
  assert.equal(st.toleranceKm, 1);
  assert.equal(typeof st.topology, 'string', 'the kernel\'s statement about shared edges did not travel');
  const rows = res.dataset.features();
  assert.deepEqual(rows.map((f) => f.properties.id), ['l', 'r']);
  assert.equal(rows[1].properties._areaKm2, B.ops.areaKm2(rows[1].geometry), 'a stale _areaKm2 survived the simplification');
  assert.equal(B.geometry.validate(rows[1].geometry).value.valid, true);
  assert.equal((await B.ops.run({ op: 'simplify', inputs: [src.id], params: { toleranceKm: -1 } })).why, 'bad-param');
  assert.equal((await B.ops.run({ op: 'simplify', inputs: [src.id], params: {} })).why, 'missing-param');
});

/* ══ ③ grid: equal ground size, and a tiling ══════════════════════════════════════════════════════ */

for (const shape of ['square', 'hexagon']) {
  for (const lat of [0, 60]) {
    test(`③ grid ${shape} at ${lat}°: every unclipped cell is cellKm² on the ground, and the cells tile`, async () => {
      const B = await boot();
      const cellKm = 25;
      /* an extent about 4° × 2° at that latitude, with points so nothing is clipped */
      const src = B.data.add({ title: 'pts', features: [pt(10, lat), pt(14, lat + 2)] });
      const res = await ok(B, { op: 'grid', inputs: [src.id], params: { shape, cellKm } });
      const cells = res.dataset.features();
      assert.ok(cells.length > 20, 'too few cells to measure anything: ' + cells.length);
      assert.equal(res.stats.grid.clip, 'input-not-areal', 'points have no area to clip to, and the answer must say so');
      /* ⚠ THE TOLERANCE: both constructions make the spherical area exactly cellKm² (see GRID_SHAPES),
         so what remains is float64 rounding of a sum over 5–7 vertices — 1e-9 relative. */
      const A = cellKm * cellKm;
      for (const f of cells) {
        const a = B.ops.areaKm2(f.geometry);
        assert.ok(Math.abs(a - A) / A < 1e-9, `${f.id}: ${a} km², not ${A}`);
        assert.equal(f.properties._areaKm2, a, 'the row does not carry its own measured area');
      }
      /* the shape is a SQUARE at every latitude, not only at one: width at the middle ≈ height */
      if (shape === 'square') {
        const c = cells[Math.floor(cells.length / 2)].geometry.coordinates[0];
        const midLat = (c[0][1] + c[2][1]) / 2;
        const widthKm = B.w.IntMapGeodesy._distKm([c[0][0], midLat], [c[1][0], midLat]);
        const heightKm = B.w.IntMapGeodesy._distKm([c[0][0], c[0][1]], [c[0][0], c[2][1]]);
        assert.ok(Math.abs(heightKm - cellKm) / cellKm < 1e-6, 'height ' + heightKm);
        assert.ok(Math.abs(widthKm - cellKm) / cellKm < 0.01, 'width at the middle ' + widthKm + ' km is not ≈ ' + cellKm);
      }
      /* a tiling: no overlap and no sliver — the union of all cells has exactly the area of their sum */
      const u = B.geometry.attempt.union(cells.map((f) => f.geometry));
      assert.equal(u.ok, true);
      const sum = cells.reduce((t, f) => t + f.properties._areaKm2, 0);
      const ua = B.ops.areaKm2(u.geometry);
      assert.ok(Math.abs(ua - sum) / sum < 1e-6, `union ${ua} km² against the sum ${sum} km² — the cells overlap or leave gaps`);
      /* and the cells cover the extent they were asked for */
      for (const q of [[10.01, lat + 0.01], [13.99, lat + 1.99], [12, lat + 1]]) {
        assert.ok(cells.some((f) => B.geometry.pointInGeometry(q, f.geometry)), 'no cell covers ' + q);
      }
    });
  }
}

/* ══ ④ grid across the antimeridian ═══════════════════════════════════════════════════════════════ */

test('④ grid across 180°: the extent is the short way round, a seam cell is split by the kernel and keeps its area', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'fiji', features: [pt(179.5, -17), pt(-179.5, -16)] });
  for (const shape of ['square', 'hexagon']) {
    const res = await ok(B, { op: 'grid', inputs: [src.id], params: { shape, cellKm: 20 } });
    const g = res.stats.grid;
    assert.equal(g.crossesAntimeridian, true);
    assert.ok(g.extent[0] > g.extent[2], 'the extent should be stated west > east: ' + JSON.stringify(g.extent));
    /* one degree of longitude at 17°S is ~106 km: a handful of 20 km columns, not a planet's worth */
    assert.ok(res.dataset.features().length < 80, shape + ': ' + res.dataset.features().length + ' cells — the grid went the long way round');
    let split = 0;
    for (const f of res.dataset.features()) {
      const geom = f.geometry;
      for (const poly of (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates)) {
        for (const p of poly[0]) assert.ok(p[0] >= -180 && p[0] <= 180, 'a position outside [-180,180]: ' + p);
      }
      if (geom.type === 'MultiPolygon') split++;
      assert.ok(Math.abs(f.properties._areaKm2 - 400) / 400 < 1e-6, f.id + ' lost area at the seam: ' + f.properties._areaKm2);
    }
    assert.ok(split > 0, shape + ': no cell crossed the seam, so this measured nothing');
    for (const q of [[179.6, -16.5], [-179.6, -16.5], [180, -16.5]]) {
      assert.ok(res.dataset.features().some((f) => B.geometry.pointInGeometry(q, f.geometry)), shape + ': no cell covers ' + q);
    }
  }
  /* the bbox parameter states the same crossing as west > east */
  const viaBox = await ok(B, { op: 'grid', inputs: [src.id], params: { shape: 'square', cellKm: 20, bbox: '179.5,-17,-179.5,-16' } });
  assert.equal(viaBox.stats.grid.crossesAntimeridian, true);
  assert.ok(viaBox.dataset.features().length < 80);
});

/* ══ ⑤ grid → aggregate = hexbin ══════════════════════════════════════════════════════════════════ */

test('⑤ grid → aggregate count is a hexbin: every point counted once; clip cuts cells to the input area', async () => {
  const B = await boot();
  const r = rng(3);
  const pts = []; for (let i = 0; i < 400; i++) pts.push(pt(135 + r() * 2, 35 + r() * 2, { v: i }));
  const P = B.data.add({ title: 'events', features: pts });
  const hex = await ok(B, { op: 'grid', inputs: [P.id], params: { shape: 'hexagon', cellKm: 30 } });
  const agg = await ok(B, { op: 'aggregate', inputs: [hex.dataset.id, P.id], params: { stat: 'count' } });
  const counts = agg.dataset.features().map((f) => f.properties.count);
  /* ⚠ a point ON a shared edge would be counted by both neighbours — `intersects` is 「重なる」 — and the
     random positions here land on no edge, so the total is exactly the number of points */
  assert.equal(counts.reduce((a, b) => a + b, 0), 400, 'the hexbin counts do not add up to the points');
  assert.equal(agg.dataset.provenance.inputs[0], hex.dataset.id, 'the chain is not recorded as a chain');

  /* clip: a square window cut out of the extent — every cell lies inside it, the edge cells are smaller */
  const zone = B.data.add({ title: 'zone', features: [boxF(135.3, 35.3, 136.6, 36.4)] });
  const clipped = await ok(B, { op: 'grid', inputs: [zone.id], params: { shape: 'square', cellKm: 20 } });
  const zoneArea = B.ops.areaKm2(zone.features()[0].geometry);
  const cells = clipped.dataset.features();
  assert.equal(clipped.stats.grid.clip, 'area');
  const total = cells.reduce((t, f) => t + f.properties._areaKm2, 0);
  assert.ok(Math.abs(total - zoneArea) / zoneArea < 1e-6, `clipped cells ${total} km² against the zone ${zoneArea} km²`);
  assert.ok(cells.some((f) => f.properties._areaKm2 < f.properties._gridFullKm2 - 1e-6), 'no cell was cut by the zone edge');
  const unclipped = await ok(B, { op: 'grid', inputs: [zone.id], params: { shape: 'square', cellKm: 20, clip: false } });
  assert.equal(unclipped.stats.grid.clip, 'off');
  assert.ok(unclipped.dataset.features().every((f) => Math.abs(f.properties._areaKm2 - 400) / 400 < 1e-9));
});

/* ══ ⑥ the budget ═════════════════════════════════════════════════════════════════════════════════ */

test('⑥ grid refuses by name a cell count beyond the memory budget, and states the arithmetic', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'world', features: [pt(-170, -60), pt(170, 70)] });
  const res = await B.ops.run({ op: 'grid', inputs: [src.id], params: { shape: 'square', cellKm: 1 } });
  assert.equal(res.ok, false);
  assert.equal(res.why, 'grid-too-many-cells');
  assert.ok(res.detail.cells > res.detail.maxCells);
  assert.equal(res.detail.maxCells, Math.floor(res.detail.budgetBytes / res.detail.bytesPerCell));
  const bad = await B.ops.run({ op: 'grid', inputs: [src.id], params: { shape: 'triangle', cellKm: 10 } });
  assert.equal(bad.why, 'bad-param');
  const none = await B.ops.run({ op: 'grid', inputs: [src.id], params: { shape: 'square' } });
  assert.equal(none.why, 'missing-param');
});

/* ══ ⑦ the four statistics ════════════════════════════════════════════════════════════════════════ */

function refPercentile(xs, p) {
  const s = xs.slice().sort((a, b) => a - b);
  const h = (s.length - 1) * p / 100, lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}
function refStdev(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

test('⑦ aggregate median / percentile / stdev / majority against references, and the quantity rules', async () => {
  const B = await boot();
  const zones = B.data.add({ title: 'zones', features: [boxF(0, 0, 1, 1, { z: 'a' }), boxF(2, 0, 3, 1, { z: 'b' }), boxF(5, 0, 6, 1, { z: 'empty' })] });
  const vals = [7, 1, 3, 3, 10, 4.5];
  const cover = ['forest', 'urban', 'forest', '01100', '1100', 'urban'];
  const members = B.data.add({
    title: 'm', features: vals.map((v, i) => pt(0.1 + i * 0.15, 0.5, { v, cover: cover[i] }))
      .concat([pt(2.5, 0.5, { v: 42, cover: 'x' })]),
  });
  const run = (params) => B.ops.run({ op: 'aggregate', inputs: [zones.id, members.id], params });
  const row = (res, z) => res.dataset.features().find((f) => f.properties.z === z).properties;

  const med = await run({ stat: 'median', field: 'v' });
  assert.equal(med.ok, true, med.why);
  assert.equal(row(med, 'a').median_v, refPercentile(vals, 50));
  assert.equal(row(med, 'b').median_v, 42);
  assert.equal(row(med, 'empty').median_v, null, 'a zone with no members has no median');

  for (const p of [0, 25, 90, 100]) {
    const res = await run({ stat: 'percentile', field: 'v', p });
    assert.equal(res.ok, true, res.why);
    assert.ok(Math.abs(row(res, 'a')['p' + p + '_v'] - refPercentile(vals, p)) < 1e-12, 'p' + p);
  }
  assert.equal((await run({ stat: 'percentile', field: 'v' })).why, 'missing-param');
  assert.equal((await run({ stat: 'percentile', field: 'v', p: 101 })).why, 'bad-param');
  assert.equal((await run({ stat: 'median', field: 'v', p: 50 })).why, 'bad-param', 'p on another stat was ignored rather than refused');

  const sd = await run({ stat: 'stdev', field: 'v' });
  assert.ok(Math.abs(row(sd, 'a').stdev_v - refStdev(vals)) < 1e-12, 'not the SAMPLE standard deviation');
  assert.equal(row(sd, 'b').stdev_v, null, 'one value has no sample variance — 0 would claim it does not vary');

  /* majority counts by identity: "01100" and "1100" are two values, and a tie goes to input 1's first row */
  const mj = await run({ stat: 'majority', field: 'cover' });
  assert.equal(mj.ok, true, mj.why);
  assert.equal(row(mj, 'a').majority_cover, 'forest', 'forest and urban tie at 2; forest is first in input 1');
  assert.equal(row(mj, 'a')._majorityCount, 2);
  assert.equal(row(mj, 'a')._majorityTies, 1);

  /* the rules are js/gis-units.js's: a category has no median and no spread … */
  const catMed = await run({ stat: 'median', field: 'cover', quantity: { kind: 'category' } });
  assert.equal(catMed.ok, false);
  assert.equal(catMed.why, 'aggregation-refused');
  assert.equal(catMed.detail.remedy, 'majority');
  assert.ok(B.ops.op('aggregate').params.find((p) => p.name === 'stat').values.indexOf(catMed.detail.remedy) >= 0,
    'the remedy is a stat this op does not offer');
  const catSd = await run({ stat: 'stdev', field: 'v', quantity: { kind: 'category' } });
  assert.equal(catSd.why, 'aggregation-refused');
  assert.equal(catSd.detail.remedy, 'majority');
  /* … a measurement has no mode … */
  const density = { kind: 'density', space: 'perArea', unit: 'kg/m2' };
  assert.equal((await run({ stat: 'majority', field: 'v', quantity: density })).why, 'aggregation-refused');
  /* … and a density's median is fine where its plain mean is not */
  const dMed = await run({ stat: 'median', field: 'v', quantity: density });
  assert.equal(dMed.ok, true, 'the median of a density was refused: ' + dMed.why);
  assert.equal((await run({ stat: 'mean', field: 'v', quantity: density })).why, 'aggregation-needs-weight');
  const dPct = await run({ stat: 'percentile', field: 'v', p: 75, quantity: density });
  assert.equal(dPct.ok, true);
  assert.equal(dPct.stats.aggregation.method, 'percentile', 'the units kernel did not judge percentile under its own word');
});
