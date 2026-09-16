/* ============================================================================
 *  #R760 — 「この形が覆う第一級行政区分はどれか」が訊けなかった
 * ----------------------------------------------------------------------------
 *  Production, 2026-09-16, build R758: 「Draw a 500 km buffer around Tokyo and tell me which
 *  prefectures it covers.」 — `map.radius` ran three times, the circle was drawn correctly, and
 *  4m42s later the answer was one sentence of preamble with no list in it. The 4,515 first-level
 *  outlines were already shipped and js/atlas-admin1.js already turned a NAME into a shape. The
 *  missing direction was the other one: a SHAPE into names.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULE and deliberately do NOT depend on the real index: every
 *  unit below is synthesised and handed in through `deps.load`, so a failure here is a failure of
 *  the geometry and never of Natural Earth's contents (tests/r489 measures the real file).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAdmin1 } from '../js/atlas-admin1.js';

/* The shape build() reads: `f[]` of {i: ISO3, n: 'name|CODE', g: geometry}. */
const box = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const unit = (name, code, iso3, geo) => ({ i: iso3, n: name + '|' + code, g: geo });

/* A deliberately plain world, so which units a query meets is arithmetic a reader can check:
   four 2°×2° boxes in a row plus one far away and one that contains the whole query. */
const WORLD = {
  source: 'synthetic (tests/r760)',
  f: [
    unit('Alpha', 'XX-A', 'XXA', box(0, 0, 2, 2)),
    unit('Beta', 'XX-B', 'XXA', box(2, 0, 4, 2)),
    unit('Gamma', 'XX-C', 'XXA', box(4, 0, 6, 2)),
    unit('Delta', 'XX-D', 'XXA', box(10, 10, 12, 12)),
    /* a unit large enough to swallow a small query whole — the containment direction that a
       vertex-in-query test alone would miss */
    unit('Omega', 'YY-O', 'YYB', box(20, 20, 40, 40)),
    /* a ring with no vertex inside the query and none of the query's vertices inside it: only the
       EDGE CROSSING rung can find this one (a thin band cutting straight through) */
    unit('Band', 'YY-N', 'YYB', box(-10, 0.8, 10, 1.2)),
  ],
};

const A1 = (json) => makeAtlasAdmin1({ load: () => (json === undefined ? WORLD : json) });
const names = (r) => r.units.map((u) => u.canonicalName).sort();

/* ══ ① A UNIT WHOLLY INSIDE THE QUERY IS COVERED ══════════════════════════════════════════════ */
test('R760 ①: a unit entirely inside the query polygon is reported, with its identifiers', async () => {
  const r = await A1().coveredBy(box(-1, -1, 3, 3), { iso3: 'XXA' });
  assert.ok(names(r).includes('Alpha'), 'Alpha lies wholly inside: ' + JSON.stringify(names(r)));
  const alpha = r.units.find((u) => u.canonicalName === 'Alpha');
  assert.equal(alpha.stableId, 'XX-A', 'the answer carries the identifier the next turn passes back');
  assert.equal(alpha.countryCode, 'XX');
  assert.equal(alpha.name, 'Alpha', 'callers that render a list read `name`');
  assert.deepEqual(alpha.bbox, [0, 0, 2, 2]);
  assert.equal(r.truncated, false);
  assert.ok(r.scanned >= 3, 'it says how many units it looked at');
});

/* ══ ② PARTIAL OVERLAP COUNTS — INCLUDING OVERLAP THAT ONLY EDGES REVEAL ══════════════════════ */
test('R760 ②: a unit that only partly overlaps is covered, and edge-crossing alone is enough', async () => {
  const a1 = A1();
  /* Beta is half in, half out */
  const partial = await a1.coveredBy(box(1, 0.5, 3, 1.5));
  assert.ok(names(partial).includes('Beta'), 'half of Beta is inside: ' + JSON.stringify(names(partial)));

  /* ⚠ Band vs this query: no vertex of either shape falls inside the other (the band is wider than
     the query east-west and narrower north-south), so ONLY the edge-crossing rung can see it. */
  const qCross = box(1, -5, 1.5, 5);
  const band = WORLD.f.find((f) => f.n.startsWith('Band')).g;
  const ptsIn = (g, h) => g.coordinates[0].some((p) => a1.intersectsGeo({ type: 'Point', coordinates: p }, h));
  assert.equal(ptsIn(qCross, band), false, 'no query vertex is inside the band');
  assert.equal(ptsIn(band, qCross), false, 'no band vertex is inside the query');
  const crossed = await a1.coveredBy(qCross);
  assert.ok(names(crossed).includes('Band'), 'crossing edges are an intersection: ' + JSON.stringify(names(crossed)));

  /* the other direction: a query swallowed whole by one unit */
  const inside = await a1.coveredBy(box(30, 30, 31, 31));
  assert.deepEqual(names(inside), ['Omega'], 'a unit that contains the query covers it');
});

/* ══ ③ WHAT IT DOES NOT TOUCH IS NOT REPORTED ═════════════════════════════════════════════════ */
test('R760 ③: units the query does not reach are absent', async () => {
  const r = await A1().coveredBy(box(-1, -1, 3, 3));
  const got = names(r);
  assert.ok(!got.includes('Delta'), 'Delta is ten degrees away');
  assert.ok(!got.includes('Gamma'), 'Gamma starts at 4°E');
  assert.ok(!got.includes('Omega'), 'Omega is twenty degrees away');
});

/* ══ ④ THE BBOX SIEVE ERRS OUTWARD OR NOT AT ALL (#R743) ══════════════════════════════════════
   The measured failure #R743 is a prefilter that drops real hits: invisible to any test that only
   compares indexed runs with each other. So the reference is computed OUTSIDE the thing under
   test — every unit in the index, tested directly with the public predicate, no sieve at all. */
test('R760 ④: the bbox prefilter produces the same set as an exhaustive scan — zero false negatives', async () => {
  const a1 = A1();
  const index = a1.build(WORLD);
  const queries = [
    box(-1, -1, 3, 3), box(1, 0.5, 3, 1.5), box(1, -5, 1.5, 5), box(30, 30, 31, 31),
    box(-180, -90, 180, 90), box(5.9, 1.9, 6.1, 2.1), box(100, 60, 101, 61),
    a1.circlePolygon([3, 1], 200), a1.circlePolygon([25, 35], 50),
    { type: 'LineString', coordinates: [[-1, 1], [11, 11]] },
    { type: 'Point', coordinates: [1, 1] },
  ];
  for (const q of queries) {
    const sieved = names(await a1.coveredBy(q, { limit: 1000 }));
    const exhaustive = index.units.filter((u) => a1.intersectsGeo(q, u.geo))
      .map((u) => u.canonicalName).sort();
    assert.deepEqual(sieved, exhaustive,
      'sieved and exhaustive disagree for ' + JSON.stringify(q).slice(0, 80));
  }
});

/* ══ ⑤ A CIRCLE IS NOT A SQUARE IN DEGREES ════════════════════════════════════════════════════
   A degree of longitude shrinks with latitude. Writing the radius as one degree figure would draw
   a band far too narrow at high latitude — and the 500 km Tokyo question is precisely the shape
   that error would corrupt. */
test('R760 ⑤: the circle widens in longitude with latitude — twice as wide as tall at 60°N', async () => {
  const a1 = A1();
  const bboxOf = (g) => {
    const xs = g.coordinates[0].map((p) => p[0]), ys = g.coordinates[0].map((p) => p[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const [w0, h0] = bboxOf(a1.circlePolygon([0, 0], 500));
  assert.ok(Math.abs(w0 - h0) < 0.02 * h0, 'on the equator the two extents agree: ' + w0 + ' vs ' + h0);
  assert.ok(Math.abs(h0 - 2 * 500 / 111.32) < 0.05, 'the north-south extent is the equidistant one');

  const [w60, h60] = bboxOf(a1.circlePolygon([0, 60], 500));
  /* cos 60° = 0.5 exactly, so east-west is exactly twice north-south */
  assert.ok(Math.abs(w60 / h60 - 2) < 0.02, 'at 60°N the circle is twice as wide as tall: ' + (w60 / h60));

  /* and it actually reaches further east in degrees than the same circle on the equator */
  assert.ok(w60 > w0 * 1.9, 'a high-latitude circle is not squashed');
  assert.equal(a1.circlePolygon([0, 0], 0), null, 'a radius that is not a radius is refused');
});

/* ══ ⑥ THE CAP IS DECLARED, NOT SILENT ════════════════════════════════════════════════════════ */
test('R760 ⑥: passing the limit sets truncated and returns exactly limit units', async () => {
  const a1 = A1();
  const whole = await a1.coveredBy(box(-180, -90, 180, 90), { limit: 1000 });
  assert.ok(whole.units.length >= 4, 'the whole world meets every unit: ' + whole.units.length);
  assert.equal(whole.truncated, false, 'a list that fits is not truncated');

  const capped = await a1.coveredBy(box(-180, -90, 180, 90), { limit: 2 });
  assert.equal(capped.units.length, 2, 'exactly the cap');
  assert.equal(capped.truncated, true, '⚠ the caller is TOLD the list is not the whole set');
});

/* ══ ⑦ 「NOTHING COVERS IT」 AND 「THE INDEX NEVER LOADED」 ARE DIFFERENT ANSWERS ══════════════ */
test('R760 ⑦: an unreadable index reports error and an empty array, never a bare empty answer', async () => {
  const broken = makeAtlasAdmin1({ load: () => { throw new Error('gzip went missing'); } });
  const r = await broken.coveredBy(box(0, 0, 1, 1));
  assert.deepEqual(r.units, [], 'an array, so the caller does not have to null-check');
  assert.equal(r.scanned, 0);
  assert.equal(r.error, 'index_unavailable');

  /* ⚠ and the honest empty answer carries NO error — that is the distinction being kept */
  const empty = await A1().coveredBy(box(100, 60, 101, 61));
  assert.deepEqual(empty.units, []);
  assert.equal(empty.error, undefined, 'nothing there is not the same as nothing readable');
  assert.ok(empty.scanned > 0, 'it really did look');
});

/* ══ ⑧ A NAMED COUNTRY NARROWS THE SCAN ═══════════════════════════════════════════════════════ */
test('R760 ⑧: opts.iso3 scans only that country, and an unknown country scans nothing', async () => {
  const a1 = A1();
  const all = await a1.coveredBy(box(-180, -90, 180, 90), { limit: 1000 });
  const one = await a1.coveredBy(box(-180, -90, 180, 90), { iso3: 'YYB', limit: 1000 });
  assert.ok(one.scanned < all.scanned, 'narrowing looked at fewer units');
  assert.deepEqual(names(one), ['Band', 'Omega']);

  const none = await a1.coveredBy(box(-180, -90, 180, 90), { iso3: 'ZZZ' });
  assert.deepEqual(none.units, []);
  assert.equal(none.scanned, 0, 'a country this index does not hold is not silently widened to the planet');
});
