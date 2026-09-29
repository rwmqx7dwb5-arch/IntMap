/* ============================================================================
 *  GIS · THE GEOMETRY KERNEL — 任意形状の演算・継ぎ目・MultiPolygon の妥当性
 * ----------------------------------------------------------------------------
 *  js/gis-geometry.js and the geometric half of js/gis-ops.js: buffers that are Minkowski sums,
 *  clips through concave windows and holes, the antimeridian, distance to a shape rather than to a
 *  box centre, a prefilter that errs outward, union and its partition, emptiness vs failure, the
 *  validity and repair of MultiPolygons, and areas across the seam. Every number is compared with one
 *  derived independently of the kernel (analytic areas, haversine, spherical excess, the sweep line).
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R732 · arbitrary shapes, the seam, reprojection, the layer bridge   (was tests/r732-gis-geometry-crs-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R732 · 任意形状の幾何演算・座標変換・既存レイヤー接続・整合性
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① every declared op has a runner, and the panel's list is the declaration itself
 *    ② a buffer of a line or an area is a real Minkowski sum — measured against the analytic area
 *    ③ a concave window with a hole clips correctly, and disjoint answers come back disjoint
 *    ④ the antimeridian is handled rather than refused, and only a world-wrapping ring is refused
 *    ⑤ distance and the predicates read the SHAPE, not a bounding-box centre
 *    ⑥ the id generator observes the namespace it shares with the project loader
 *    ⑦ a failed recomputation leaves its downstream marked, and the ops refuse to consume it
 *    ⑧ a reprojection is a real reprojection, and a file that cannot be converted is refused
 *    ⑨ the layer bridge hands over geometry whole, and the map's own window keeps lines and areas
 *
 *  ⚠ ② ③ ④ ⑤ ARE THE ONES #R729 COULD NOT MAKE. Three of them replace assertions that used to
 *  hold the OPPOSITE — `buffer-needs-points`, `clip-window-not-convex`,
 *  `clip-window-crosses-antimeridian` — and tests/geo-gis-datasets-checks.test.mjs (#R729) ③ points here for that
 *  reason. A refusal that becomes an implementation has to keep being measured, or the round that
 *  removed the refusal is the round that stopped looking.
 *
 *  ⚠ ② AND ④ COMPARE AGAINST NUMBERS DERIVED FROM GEOMETRY, NOT AGAINST NUMBERS THIS FILE SAW
 *  ONCE. A recorded output would pass for whatever the code happens to produce tomorrow; the
 *  analytic area of a capsule and of a lat/lon box do not move.
 * ==========================================================================*/
describe('§ #R732 · arbitrary shapes, the seam, reprojection, the layer bridge', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const ops = makeGisOps();
    const project = makeGisProject();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisProject = project;
    await geometry.ready();
    return { w, data, geometry, ops, project };
  }

  const R_EARTH_KM = 6371.0088;
  const KM_PER_DEG = Math.PI * R_EARTH_KM / 180;          /* 111.195 km — a degree of latitude */

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);
  const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
  const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

  /* ══ ① 宣言が一覧であって、一覧が二つある状態を作らない ═════════════════════════════════════ */

  test('R732 ① every declared op has a runner, and ops() is the declaration itself', async () => {
    const { ops } = await boot();
    const declared = ops.ops().map((d) => d.id);
    assert.ok(declared.length >= 9, 'the op table was not read at all (' + declared.length + ')');

    /* ⚠ BOTH SIDES COME FROM THE SOURCE. Writing the nine names here would be the third list — the
       one this round removed two of — and it would pass on the day a tenth op is declared and never
       wired. The dispatch table in run() is keyed by op id, so the keys ARE the wiring. */
    const src = read('js/gis-ops.js');
    const declBlock = src.slice(src.indexOf('const DECL = {'), src.indexOf('const ORDER ='));
    /* ⚠ `[a-z]+` UNTIL #R735, and that is a spelling this check had no business fixing. The rule it
       measures is 「DECL のキーは全部 run() に配線されている」; the character class was a guard on the
       regex, and the first op named in camelCase — rasterMask, rasterDiff, timeWindow — was reported as
       a missing declaration by a check that simply could not see it. (The memory note is
       「ceiling guards are not policies」: a number or a pattern that exists to make the scan land must
       not be read as the policy the scan is measuring.) */
    const inDecl = Array.from(declBlock.matchAll(/^      ([A-Za-z][A-Za-z0-9]*): \{$/gm)).map((m) => m[1]);
    const runBlock = src.slice(src.indexOf('const RUN = {'), src.indexOf('const runner = RUN['));
    const wired = Array.from(runBlock.matchAll(/^        ([A-Za-z][A-Za-z0-9]*): \(\) =>/gm)).map((m) => m[1]);

    assert.deepEqual(inDecl.slice().sort(), declared.slice().sort(), 'ops() does not hand out exactly what DECL declares');
    assert.deepEqual(wired.slice().sort(), declared.slice().sort(), 'a declared op has no runner, or a runner has no declaration');

    /* The list the panel would have had to keep is gone: ORDER is derived. */
    assert.match(src, /const ORDER = Object\.keys\(DECL\);/, 'ORDER is a hand-written list again');

    /* Every op that reaches the kernel says so, so a panel can grey it and run() can await it.
       ⚠ THIS WAS `if (d.id === 'filter') continue; assert(needsGeometry)` UNTIL #R735 — a hand-written
       exception list of one, which read as 「filter 以外は全部カーネルを使う」 and was true only while
       that happened to hold. #R735 added four ops that do not touch shapes at all (a grid mask, a grid
       difference, a point sample, a time window), and each of them would have been failed for declaring
       the truth. The rule being measured is the IMPLICATION — a runner that calls the kernel must
       declare it — so the runner's own body is what is asked, in both directions. */
    const runnerOf = new Map(Array.from(runBlock.matchAll(/^        ([A-Za-z][A-Za-z0-9]*): \(\) => ([A-Za-z][A-Za-z0-9]*)\(/gm)).map((m) => [m[1], m[2]]));
    const bodyOf = (fn) => {
      const at = src.search(new RegExp('\\n    (?:async )?function ' + fn + '\\('));
      if (at < 0) return null;
      const rest = src.slice(at + 1);
      const end = rest.search(/\n    (?:async )?function [A-Za-z]/);
      return end < 0 ? rest : rest.slice(0, end);
    };
    for (const d of ops.ops()) {
      const fn = runnerOf.get(d.id);
      assert.ok(fn, d.id + ' has no runner in the dispatch table');
      const body = bodyOf(fn);
      assert.ok(body, 'the runner ' + fn + ' was not found in the source');
      /* ⚠ ONE DIRECTION, AND THE DIRECTION IS THE DEFECT. A runner that asks the kernel without
         declaring it runs before the lazy import has landed and answers 「0 件」 for 「訊けなかった」 —
         that is the failure worth a gate. The converse is NOT measurable from this body and must not be
         asserted: `zonal` declares it and never names GG here, because the kernel call is inside
         js/gis-raster.js (pointInGeometry decides which pixels are in the zone). Declaring it is what
         makes run() await the import for that path, so the declaration is right and a check that called
         it wrong would be pushing the code towards a real bug. */
      if (/\bGG\b|\bgeometry\(\)/.test(body)) assert.equal(d.needsGeometry, true, d.id + ' uses the geometry kernel without declaring it');
    }
  });

  /* ══ ② 線と面のバッファは本物（解析解と突き合わせる） ═════════════════════════════════════ */

  test('R732 ② a line buffer is a Minkowski sum, measured against the analytic capsule', async () => {
    const { geometry, ops, data } = await boot();

    /* A 1° meridian segment buffered by r is a capsule: a 2r-wide rectangle of length L, plus the two
       half-discs that close its ends — area = 2rL + πr². Along a meridian the length is exact
       (a degree of latitude is a degree of latitude everywhere), so the target is arithmetic. */
    const L = KM_PER_DEG, r = 10;
    const analytic = 2 * r * L + Math.PI * r * r;
    const g = geometry.bufferKm({ type: 'LineString', coordinates: [[0, 0], [0, 1]] }, r, 256);
    const got = ops.areaKm2(g);
    assert.ok(got != null && got > 0, 'a line buffer produced nothing — this is what #R729 refused to do');
    assert.ok(Math.abs(got - analytic) / analytic < 0.01, 'line buffer area ' + got.toFixed(1) + ' vs analytic ' + analytic.toFixed(1));

    /* ⚠ AND IT ERRS INWARD, WHICH IS MEASURED AS CONVERGENCE RATHER THAN AGAINST THE FORMULA ABOVE.
       2rL + πr² is the PLANAR capsule; on a sphere it is itself off by a little, so its sign against
       a spherical measurement says nothing (measured: 2538.06 planar against 2538.11 in the limit).
       What inscribed-ness really claims is that the polygons are subsets that grow towards the true
       shape as they get finer — a build that started circumscribing would draw area that is not
       within r of anything, and would show up here as a sequence running the other way. */
    const at = (n) => ops.areaKm2(geometry.bufferKm({ type: 'LineString', coordinates: [[0, 0], [0, 1]] }, r, n));
    const series = [8, 32, 64, 256].map(at);
    for (let i = 1; i < series.length; i++) {
      assert.ok(series[i] > series[i - 1], 'the buffer does not grow with steps: ' + series.join(' < '));
    }
    assert.ok((series[3] - series[2]) < (series[1] - series[0]), 'the series is not settling, so it is not converging on a shape');

    /* An AREA grows outward and shrinks inward, and #R729 could do neither. */
    const square = { type: 'Polygon', coordinates: [box(0, 0, 1, 1)] };
    const plain = ops.areaKm2(square);
    assert.ok(ops.areaKm2(geometry.bufferKm(square, 5, 128)) > plain, 'an outward buffer did not grow the area');
    assert.ok(ops.areaKm2(geometry.bufferKm(square, -5, 128)) < plain, 'an inward buffer did not shrink the area');

    /* ⚠ ONE OUTPUT FEATURE PER INPUT FEATURE. #R729 emitted one per POSITION because it could not
       union overlapping disks; a MultiPoint whose disks overlap must now be one shape whose area
       counts the overlap once. Two points 10 km apart with a 10 km radius overlap heavily. */
    const mp = data.add({ title: 'mp', features: [feat({ type: 'MultiPoint', coordinates: [[0, 0], [0, 10 / KM_PER_DEG]] })] });
    const res = await ops.run({ op: 'buffer', inputs: [mp.id], params: { radiusKm: 10, steps: 128 } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.dataset.count, 1, 'a MultiPoint buffer came back as several features again');
    assert.ok(ops.areaKm2(res.dataset.features()[0].geometry) < 2 * Math.PI * 100, 'the overlap is being counted twice');
    assert.equal(res.dataset.features()[0].properties._bufferSteps, 128, 'the approximation does not say how coarse it is');
  });

  /* ══ ③ 凹んだ窓・穴・離れた結果 ═══════════════════════════════════════════════════════════ */

  test('R732 ③ a concave window with a hole clips, and disjoint answers come back disjoint', async () => {
    const { geometry, ops } = await boot();

    /* An L is concave at exactly one vertex, which is all Sutherland–Hodgman needed to be wrong. */
    const L = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] };
    const cover = { type: 'Polygon', coordinates: [box(0, 0, 3, 3)] };
    const cut = geometry.intersection(cover, L);
    assert.ok(cut, 'a concave window produced nothing');
    /* Clipping a shape by a window that contains it returns the shape: same area, to the last km². */
    assert.ok(Math.abs(ops.areaKm2(cut) - ops.areaKm2(L)) < 1, 'the concave window lost or gained area');

    /* A hole in the CLIPPER is a hole in the answer — #R729 refused the whole run for this. */
    const holed = { type: 'Polygon', coordinates: [box(0, 0, 10, 10), box(3, 3, 7, 7)] };
    const kept = geometry.intersection(cover, holed);
    assert.ok(kept, 'a window with a hole produced nothing');
    assert.ok(ops.areaKm2(kept) < ops.areaKm2({ type: 'Polygon', coordinates: [box(0, 0, 3, 3)] }) + 1, 'the hole was ignored');

    /* ⚠ THE ZERO-WIDTH LINK IS GONE. A bar across a holed square meets it in TWO pieces; #R729
       returned one ring joining them along the boundary, whose point set was right and whose ring
       was not simple. The answer is two polygons, and nothing joins them. */
    const bar = { type: 'Polygon', coordinates: [box(-1, 4, 11, 6)] };
    const two = geometry.intersection(holed, bar);
    assert.equal(two.type, 'MultiPolygon', 'a disjoint answer came back as one ring again');
    assert.equal(two.coordinates.length, 2, 'expected two separated pieces, got ' + two.coordinates.length);

    /* And a clipped LINE comes back as the runs inside a concave window, not as one span. */
    const across = { type: 'LineString', coordinates: [[-1, 5], [11, 5]] };
    const line = geometry.intersects(across, holed);
    assert.equal(line, true, 'a line crossing the window does not intersect it');
  });

  /* ══ ④ 継ぎ目は扱う。拒むのは世界を巻く環だけ ═════════════════════════════════════════════ */

  test('R732 ④ the antimeridian is handled, and only a world-wrapping ring is refused', async () => {
    const { geometry, ops } = await boot();

    /* Two boxes that both straddle 180°, overlapping in a 10° × 4° window centred on the seam.
       In the naive plane each reads as a 340° sweep the wrong way round and they do not meet. */
    const a = { type: 'Polygon', coordinates: [box(170, -5, -170, 5)] };
    const b = { type: 'Polygon', coordinates: [box(175, -2, -175, 2)] };
    const hit = geometry.intersection(a, b);
    assert.ok(hit, 'two shapes across the seam did not meet — the plane is still naive');

    /* The overlap is 10° of longitude by 4° of latitude at the equator; at this latitude the two
       degrees are worth the same, so the target is arithmetic rather than recorded. */
    const analytic = 10 * KM_PER_DEG * 4 * KM_PER_DEG;
    const got = ops.areaKm2(hit);
    assert.ok(Math.abs(got - analytic) / analytic < 0.01, 'seam overlap ' + got.toFixed(0) + ' vs analytic ' + analytic.toFixed(0));

    /* And it comes back INSIDE [-180,180] — split at the seam, the way every disk on the map is. */
    let minLon = Infinity, maxLon = -Infinity;
    (function walk(c) {
      if (typeof c[0] === 'number') { minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0]); return; }
      for (const x of c) walk(x);
    })(hit.coordinates);
    assert.ok(minLon >= -180.0001 && maxLon <= 180.0001, 'the answer was left unwrapped (' + minLon + '…' + maxLon + ')');

    /* ⚠ THE ONE REFUSAL THAT SURVIVED, AND IT IS ABOUT THE PLANE RATHER THAN THE DATA. A ring that
       spans a whole turn is a polar cap or a whole-world ring, and no cylindrical plane holds one. */
    const wraps = { type: 'Polygon', coordinates: [[[-180, 80], [-60, 80], [60, 80], [180, 80], [180, 89], [-180, 89], [-180, 80]]] };
    assert.equal(geometry.toMulti(wraps), null, 'a world-wrapping ring was accepted into the plane');
  });

  /* ══ ⑤ 距離と述語は形そのものを読む ═══════════════════════════════════════════════════════ */

  test('R732 ⑤ distance and the predicates read the shape, never a bounding-box centre', async () => {
    const { geometry, data, ops } = await boot();

    /* A point 0.01° north of the middle of an east–west road. The distance to the ROAD is that
       0.01°; the distance to the centre of the road's bounding box is the same here BY DESIGN, so
       the test that separates them is the one below it. */
    const road = { type: 'LineString', coordinates: [[139.7, 35.6], [139.8, 35.6]] };
    const near = { type: 'Point', coordinates: [139.75, 35.61] };
    const d = geometry.distanceKm(near, road);
    assert.ok(Math.abs(d - 0.01 * KM_PER_DEG) < 0.01, 'point-to-line distance ' + d);

    /* ⚠ THE CASE A CENTRE CANNOT ANSWER: a C-shaped area whose bounding-box centre lies in the
       notch, i.e. OUTSIDE the shape. A point sitting at that centre is 1° from the shape and 0 from
       the centre, so any implementation that kept using the centre reports 0 here. */
    const C = {
      type: 'Polygon',
      coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0]]],
    };
    /* [1.5, 1.5] IS the centre of C's bounding box — 0…3 on both axes — and it sits in the notch,
       outside the shape. So the two answers are 0 km from the centre and half a degree from the
       shape, and nothing but reading the shape can produce the second one. */
    const atCentre = { type: 'Point', coordinates: [1.5, 1.5] };
    assert.equal(geometry.pointInGeometry([1.5, 1.5], C), false, 'the notch is being read as inside');
    const dc = geometry.distanceKm(atCentre, C);
    assert.ok(dc > 0.4 * KM_PER_DEG, 'the distance to a C-shape was measured from its box centre (' + dc + ')');
    assert.ok(Math.abs(dc - 0.5 * KM_PER_DEG) < 1, 'expected half a degree to the nearest edge, got ' + dc);

    /* within() is exact for areas: a ring whose vertices are all inside a concave shape can still
       bulge out between two of them, so it is asked as 「a の外に b はあるか」 rather than by vertex. */
    const bulge = { type: 'Polygon', coordinates: [[[0.5, 0.5], [2.5, 0.5], [2.5, 2.5], [0.5, 2.5], [0.5, 0.5]]] };
    assert.equal(geometry.within(bulge, C), false, 'a square spanning the notch was called contained');
    assert.equal(geometry.within({ type: 'Polygon', coordinates: [box(0.1, 0.1, 0.9, 2.9)] }, C), true, 'a square inside the C was called outside');

    /* The whole reason this round exists, as one chain: what is within 500 m of the road, by ward. */
    const facilities = [];
    for (let i = 0; i <= 10; i++) facilities.push(pt(139.70 + i * 0.01, 35.6 + (i % 2 ? 0.002 : 0.02), { name: 'f' + i }));
    data.add({ id: 'ds-fac', title: 'facilities', features: facilities, provenance: { kind: 'import' } });
    data.add({ id: 'ds-road', title: 'road', features: [feat(road)], provenance: { kind: 'import' } });
    data.add({
      id: 'ds-wards', title: 'wards', provenance: { kind: 'import' },
      features: [poly([box(139.69, 35.59, 139.75, 35.63)], { ward: 'A' }), poly([box(139.75, 35.59, 139.82, 35.63)], { ward: 'B' })],
    });

    const rel = await ops.run({ id: 'ds-near', op: 'relate', inputs: ['ds-fac', 'ds-road'], params: { predicate: 'nearer-than', maxKm: 0.5 } });
    assert.equal(rel.ok, true, JSON.stringify(rel));
    /* 0.002° ≈ 222 m is inside 500 m; 0.02° ≈ 2.2 km is not. Five of the eleven sit at 0.002°. */
    assert.equal(rel.dataset.count, 5, 'relate kept ' + rel.dataset.count + ' of 11');
    /* The measurement is kept, not only the verdict. */
    for (const f of rel.dataset.features()) {
      assert.ok(f.properties._distanceKm > 0 && f.properties._distanceKm <= 0.5, 'the measured distance was not written back');
    }

    const agg = await ops.run({ id: 'ds-byward', op: 'aggregate', inputs: ['ds-wards', 'ds-near'], params: { stat: 'count' } });
    assert.equal(agg.ok, true, JSON.stringify(agg));
    const counts = {};
    for (const f of agg.dataset.features()) counts[f.properties.ward] = f.properties.count;

    /* ⚠ 3 + 3 = 6 FOR 5 FACILITIES, AND THAT IS THE ANSWER RATHER THAN AN ERROR. The wards meet at
       139.75 and one facility sits exactly on that line, so it is in both — 「重なるもの」 counts for
       every area it touches, and a partition is a different question from an overlay. The check is
       written as the arithmetic it is, because rounding it to 5 would mean the boundary case had
       silently been dropped from one side, which is a choice no dataset here authorises. */
    assert.equal(counts.A + counts.B, 6, 'the wards do not account for every kept facility: ' + JSON.stringify(counts));
    const onEdge = rel.dataset.features().filter((f) => f.geometry.coordinates[0] === 139.75);
    assert.equal(onEdge.length, 1, 'the shared-edge facility is not where this test thinks it is');
    assert.equal(counts.A, 3);
    assert.equal(counts.B, 3);

    /* ⚠ AGGREGATE NO LONGER MEANS 「面に含まれる点」. A road that crosses a ward counts for it, which
       is what a reader means by 区域別 and what #R729 could not answer at all. */
    const byRoad = await ops.run({ id: 'ds-roadward', op: 'aggregate', inputs: ['ds-wards', 'ds-road'], params: { stat: 'count' } });
    assert.equal(byRoad.ok, true, JSON.stringify(byRoad));
    const roadCounts = byRoad.dataset.features().map((f) => f.properties.count);
    assert.deepEqual(roadCounts, [1, 1], 'a line crossing both wards was counted for neither');
  });

  /* ══ ⑥ 自動採番は、自分が共有している名前空間を見る ═══════════════════════════════════════ */

  test('R732 ⑥ the id generator observes the namespace the project loader writes into', async () => {
    const { data } = await boot();

    /* This is the reload: a saved project restores its datasets BY NAME, because a saved recipe
       names its inputs. Before #R732 the counter only moved for ids it had made itself. */
    data.add({ id: 'ds-1', title: 'restored', features: [], provenance: { kind: 'import' } });
    data.add({ id: 'ds-2', title: 'restored', features: [], provenance: { kind: 'import' } });
    const fresh = data.add({ title: 'a file dropped after the reload', features: [], provenance: { kind: 'import' } });
    assert.equal(fresh.id, 'ds-3', 'the generator reissued a name that was already taken');
    assert.equal(data.list().length, 3);

    /* It never goes down: an id that has been issued may still be named by a saved recipe. */
    data.remove('ds-3');
    const next = data.add({ title: 'after a delete', features: [], provenance: { kind: 'import' } });
    assert.equal(next.id, 'ds-4', 'the counter went backwards and could reattach an old recipe to new data');

    /* And a caller-supplied id far ahead moves it too, rather than leaving a hole to walk into. */
    data.add({ id: 'ds-40', title: 'far ahead', features: [], provenance: { kind: 'import' } });
    assert.equal(data.add({ title: 'x', features: [], provenance: { kind: 'import' } }).id, 'ds-41');

    /* A genuine collision is still an error rather than a silent rename. */
    assert.throws(() => data.add({ id: 'ds-1', title: 'twice', features: [] }), /already registered/);
  });

  /* ══ ⑦ 失敗した再計算は、下流に印を残し、その印は拘束力を持つ ═════════════════════════════ */

  test('R732 ⑦ a failed recomputation marks its downstream, and the ops refuse to consume it', async () => {
    const { data, ops, project } = await boot();

    const pts = data.add({ id: 'ds-pts', title: 'pts', features: [pt(0, 0, { v: 1 }), pt(0.05, 0, { v: 2 })], provenance: { kind: 'import' } });
    const buf = await ops.run({ id: 'ds-buf', op: 'buffer', inputs: [pts.id], params: { radiusKm: 5, steps: 32 } });
    assert.equal(buf.ok, true, JSON.stringify(buf));
    const down = await ops.run({ id: 'ds-down', op: 'aggregate', inputs: ['ds-buf', 'ds-pts'], params: { stat: 'count' } });
    assert.equal(down.ok, true, JSON.stringify(down));
    const before = down.dataset.features().map((f) => f.properties.count);

    /* Change the radius to something the op must refuse. The target is removed and its re-run fails,
       so `ds-down` is never re-run — and before #R732 it simply stayed, holding the answer to 5 km
       with nothing anywhere saying so. */
    const res = await project.setParams('ds-buf', { radiusKm: -1 });
    assert.equal(res.ok, false);
    assert.deepEqual(res.rebuilt, []);
    assert.ok(res.failed.some((f) => f.id === 'ds-down' && f.why === 'upstream-failed'), JSON.stringify(res.failed));

    const stale = data.get('ds-down');
    assert.ok(stale, 'the downstream dataset was removed — it should be kept and marked');
    assert.ok(stale.stale, 'the downstream dataset is still presenting itself as current');
    /* ⚠ THE REASON THAT TRAVELS DOWN IS THE ROOT CAUSE, NOT ITS CONSEQUENCE. 'upstream-failed' is
       what setParams tells its CALLER about this step; what the DATASET carries is the refusal that
       actually happened, because that is the one the reader has to act on. Overwriting it with
       'upstream-failed' would replace the diagnosis with a restatement of the symptom. */
    assert.equal(stale.stale.why, 'inward-buffer-needs-area');
    assert.deepEqual(stale.features().map((f) => f.properties.count), before, 'the last computed answer was thrown away rather than marked');

    /* ⚠ AND THE STATE IS BINDING. Consuming it would put the staleness into a NEW record whose own
       provenance says it is current — the one place it would stop being visible. */
    const next = await ops.run({ id: 'ds-next', op: 'filter', inputs: ['ds-down'], params: { where: [{ field: 'count', op: '>=', value: 0 }] } });
    assert.equal(next.ok, false);
    assert.equal(next.why, 'input-stale');
    assert.equal(next.detail.id, 'ds-down');

    /* It travels the way the failure does — down — and the FIRST reason is the one that is kept. */
    assert.equal(data.get('ds-pts').stale, null, 'staleness travelled upstream, which is not where the failure was');

    /* ⚠ AND THE STEP THAT FAILED IS STILL THERE. Freeing its id is what a rebuild has to do; losing
       it is not. Before #R732 a radius the op refuses DELETED the dataset the reader was editing, and
       the next setParams could only answer 'no-such-dataset' — there was no way back to a working
       value from inside the panel. */
    const target = data.get('ds-buf');
    assert.ok(target, 'the dataset being edited was destroyed by its own failed recomputation');
    assert.ok(target.stale, 'it came back unmarked, as though it still answered the recipe');
    assert.equal(target.stale.why, 'inward-buffer-needs-area', 'the mark does not carry the reason the reader has to act on');
    assert.equal(target.provenance.params.radiusKm, 5, 'the refused parameter was written into the recipe anyway');

    /* A successful rebuild clears it, because a rebuild is a new record rather than a cleared flag. */
    const ok = await project.setParams('ds-buf', { radiusKm: 6 });
    assert.equal(ok.ok, true, JSON.stringify(ok.failed));
    assert.equal(data.get('ds-down').stale, null, 'a rebuilt dataset is still marked out of date');
  });

  /* ══ ⑧ 再投影は本物で、変換できないものは拒む ═══════════════════════════════════════════════ */

  test('R732 ⑧ a reprojection is a real one, and an unconvertible file is refused', async () => {
    installWindow();
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const crs = makeGisCrs();
    assert.equal(await crs.ready(), true, 'proj4 did not load');

    /* Web Mercator. The target is Tokyo Station's own 4326 position, not a number recorded from a
       previous run of this code — a recorded number would pass for whatever it produced tomorrow. */
    const g = crs.transformGeometry({ type: 'Point', coordinates: [15557311.0509, 4257201.4] }, 'EPSG:3857');
    assert.ok(g, 'EPSG:3857 did not convert');
    assert.ok(Math.abs(g.coordinates[0] - 139.7537) < 1e-3, 'longitude ' + g.coordinates[0]);
    assert.ok(Math.abs(g.coordinates[1] - 35.6838) < 1e-3, 'latitude ' + g.coordinates[1]);

    /* ⚠ UTM IS A FORMULA, NOT A TABLE. 326NN/327NN are defined by the zone arithmetic, so zone 54
       works without anybody having written it down — and 99 is not a zone, so it is refused. */
    const utm = crs.transformGeometry({ type: 'Point', coordinates: [381000, 3948000] }, 'EPSG:32654');
    assert.ok(utm, 'EPSG:32654 did not convert');
    assert.ok(Math.abs(utm.coordinates[0] - 139.685) < 0.01 && Math.abs(utm.coordinates[1] - 35.669) < 0.01, JSON.stringify(utm.coordinates));
    assert.equal(crs.known('EPSG:32799'), false, 'zone 99 was accepted, so the zone is not being checked');

    /* A system that is genuinely not derivable is REFUSED rather than approximated by a near one. */
    assert.equal(crs.known('EPSG:2451'), false);
    assert.equal(crs.transformGeometry({ type: 'Point', coordinates: [0, 0] }, 'EPSG:2451'), null);

    /* ⚠ 「ファイルが述べなかった」 IS MEASURED, NOT ASSUMED. Numbers outside the range a degree can
       take are not degrees, whatever the file failed to say — and before #R732 they were drawn as
       degrees, which js/geodesy.js then CLAMPED to ±89.9999 into a plausible-looking wrong place. */
    const projected = crs.looksProjected([{ geometry: { type: 'Point', coordinates: [15557311.05, 4257201.4] } }]);
    assert.equal(projected.projected, true);
    assert.equal(projected.outOfRange, 1);
    const degrees = crs.looksProjected([{ geometry: { type: 'Polygon', coordinates: [box(139, 35, 140, 36)] } }]);
    assert.equal(degrees.projected, false, 'an ordinary lat/lon file would now be refused');

    /* The importer is the one that has to act on that, and it does so BEFORE the coordinates are
       sanitised — the clamp is what turns a projected file into a believable one. */
    const imp = read('js/geo-import.js');
    assert.match(imp, /settleCrs/, 'js/geo-import.js no longer settles the CRS');
    assert.ok(imp.indexOf('settleCrs(') < imp.lastIndexOf('sanitizeFeatures'),
      'the CRS is settled after sanitizeFeatures, which clamps latitudes and hides the evidence');
  });

  /* ══ ⑨ レイヤー接続は形状を落とさない ═══════════════════════════════════════════════════════ */

  test('R732 ⑨ the layer bridge hands over geometry whole, and the map window keeps lines and areas', async () => {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const data = makeGisDatasets();
    const layers = makeGisLayers();
    w.IntMapData = data;

    /* With no map there is no answer, and saying 「0 件」 would be a different claim. */
    assert.deepEqual(layers.sources(), []);
    assert.equal((await layers.toDataset('anything')).why, 'map-unavailable');

    const road = { type: 'Feature', properties: { n: 1 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } };
    const ward = poly([box(0, 0, 2, 2)], { n: 2 });
    w.IntMapLayers = {
      list: () => ['demo'],
      state: () => ({ id: 'demo', on: true, label: 'demo' }),
      featuresIn: () => [road, ward],
      featuresInSource: () => null,
    };

    const found = layers.sources();
    assert.ok(found.some((x) => x.id === 'demo'), 'a layer that answers featuresIn was not discovered: ' + JSON.stringify(found));

    const got = layers.read('demo');
    assert.equal(got.ok, true, JSON.stringify(got));
    /* ⚠ THE WHOLE POINT: the line is still a line. The Atlas path used to replace it with the centre
       of its bounding box, and everything about 「道路からの距離」 died there. */
    assert.equal(got.features.length, 2);
    assert.equal(got.features[0].geometry.type, 'LineString');
    assert.deepEqual(got.features[0].geometry.coordinates, [[0, 0], [1, 1]]);
    assert.equal(got.features[1].geometry.type, 'Polygon');
    assert.equal(got.features[0].properties.n, 1, 'the attributes were dropped');

    const ds = layers.toDataset('demo');
    assert.equal(ds.ok, true, JSON.stringify(ds));
    assert.equal(ds.dataset.geometryType, 'Mixed');
    assert.equal(ds.dataset.sourceCrs, 'EPSG:4326');
    assert.equal(ds.dataset.provenance.kind, 'layer');
    assert.equal(ds.dataset.provenance.layer, 'demo');
    assert.ok(ds.dataset.provenance.at > 0, 'the provenance does not say WHEN the layer was read');

    /* ⚠ AND THE MAP'S OWN WINDOW STOPPED DROPPING THEM. js/map-ui.js asked 「is this a Point」 where
       it meant 「is this in the box」, so every line and every area a layer held was silently 0. */
    const mapUi = read('js/map-ui.js');
    const win = mapUi.slice(mapUi.indexOf('function _srcFeatsIn'), mapUi.indexOf('function _srcFeatsIn') + 2000);
    assert.ok(!/geometry\.type\s*===\s*'Point'/.test(win), '_srcFeatsIn is filtering by geometry type again');
    assert.match(mapUi, /featuresInSource/, 'the source window is not reachable from the GIS bridge');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R743 · kernel correctness against independent references   (was tests/r743-gis-kernel-correctness-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R743 · 基本空間演算の正しさ — 参照実装と、独立に導いた数に照らす
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① a distance query keeps the pairs that are within the distance — AT EVERY LATITUDE
 *    ② the prefilter errs outward, measured against the run with no prefilter at all
 *    ③ union is a union: every part of both inputs appears exactly once, disjoint or not
 *    ④ a union's parts partition — their areas sum to the area of A ∪ B, taken independently
 *    ⑤ 「答えは空だった」 and 「答えられなかった」 are two answers from the kernel, not one null
 *    ⑥ an op that could not compute does not report a plain success
 *    ⑦ disjoint and contains do not assert a verdict out of a failure
 *
 *  ⚠ ① ③ ⑤ ⑥ ⑦ ARE DEFECTS MEASURED IN THIS REPOSITORY, not hypotheticals. ① dropped true pairs
 *  everywhere off the equator because a km was converted to degrees of LATITUDE and the result
 *  applied to both axes — under a comment arguing that this erred outward. ③ returned an EMPTY
 *  dataset with ok:true for two squares that do not touch, and double-counted land for two that do.
 *  ⑤ answered one null for 「交わらなかった」 and 「クリッパが例外を投げた」. ⑥ read that null as an
 *  absent row in all eight runners. ⑦ turned a failure into 「離れている」 and 「含まれる」.
 *
 *  ⚠ WHAT THIS FILE COMPARES AGAINST, AND WHY NOT THE OTHER PATH. tests/r735 ⑥ measures the indexed
 *  candidate source against the unindexed walk — and ① was invisible to it, because both walks call
 *  ONE prefilter with ONE number. Two readers of a wrong rule agree. So the references here sit
 *  outside the thing measured: haversine written out below from the radius js/geodesy.js publishes,
 *  the spherical excess of a ring, and polygon-clipping — the same engine the kernel loads, but
 *  driven HERE over every feature with no candidate machinery in between, which is exactly the
 *  layer ③ was wrong in.
 * ==========================================================================*/
describe('§ #R743 · kernel correctness against independent references', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisIndex } = await import('../js/gis-index.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const index = makeGisIndex();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisIndex = index; w.IntMapGisOps = ops;
    await geometry.ready();
    return { w, data, geometry, index, ops };
  }

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
  const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);
  const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

  /* A ring that spans a whole turn — a polar cap. No cylindrical plane holds one, and the kernel has
     named that refusal in its header since #R732 without any line returning it. */
  const WRAPS = { type: 'Polygon', coordinates: [[[-180, 80], [-60, 80], [60, 80], [180, 80], [180, 89], [-180, 89], [-180, 80]]] };

  /* ── the references, derived from nothing in js/gis-ops.js ──────────────────────────────────── */

  /* Great-circle distance from the radius js/geodesy.js publishes. This is the number ① is about,
     and it does not know what a bounding box is. */
  function haversineKm(R, a, b) {
    const d2r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * d2r, dLon = (b[0] - a[0]) * d2r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* The area of a closed ring on the sphere, by the standard line-integral form of the spherical
     excess. Independent of areaKm2 in js/gis-ops.js and of the clipper. */
  function ringAreaKm2(R, ring) {
    const d2r = Math.PI / 180;
    let total = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const x1 = ring[j][0], y1 = ring[j][1], x2 = ring[i][0], y2 = ring[i][1];
      total += (x2 - x1) * d2r * (2 + Math.sin(y1 * d2r) + Math.sin(y2 * d2r));
    }
    return Math.abs(total * R * R / 2);
  }

  function multiAreaKm2(R, geom) {
    if (!geom) return 0;
    const polys = (geom.type === 'Polygon') ? [geom.coordinates] : (geom.type === 'MultiPolygon') ? geom.coordinates : [];
    let a = 0;
    for (const rings of polys) rings.forEach((r, i) => { a += (i ? -1 : 1) * ringAreaKm2(R, r); });
    return a;
  }

  /* ══ ① 距離の問い合わせは、どの緯度でも取りこぼさない ═══════════════════════════════════ */

  test('R743 ① a distance query keeps the pairs that are within the distance, at every latitude', async () => {
    const { data, ops, w } = await boot();
    const R = w.IntMapGeodesy._R_EARTH_KM;

    /* ⚠ THE PAIR THAT WAS SHIPPED WRONG: two points one degree of longitude apart at 60°N. The
       reference says how far apart they are; the op is asked for 80 km. */
    const A = [0, 60], B = [1, 60];
    const apart = haversineKm(R, A, B);
    assert.ok(apart > 50 && apart < 60, 'the fixture moved: ' + apart + ' km');
    assert.ok(apart < 80, 'the fixture is no longer inside the query');

    const aDs = data.add({ title: 'a', features: [pt(A[0], A[1], { id: 'a' })] });
    const bDs = data.add({ title: 'b', features: [pt(B[0], B[1], { id: 'b' })] });
    const res = await ops.run({ op: 'relate', inputs: [aDs.id, bDs.id], params: { predicate: 'nearer-than', maxKm: 80 } });
    assert.equal(res.ok, true, 'relate refused: ' + res.why);
    assert.equal(res.dataset.count, 1,
      'a pair ' + apart.toFixed(2) + ' km apart was dropped from an 80 km query — the prefilter erred inward');
    const got = res.dataset.features()[0].properties._distanceKm;
    assert.ok(Math.abs(got - apart) < 0.01, 'the measured distance disagrees with haversine: ' + got + ' vs ' + apart);
  });

  /* ══ ② ふるいは外側に誤る — ふるいの無い走査と突き合わせる ═══════════════════════════ */

  test('R743 ② the prefilter errs outward, measured against the answer with no prefilter', async () => {
    const { data, ops, w } = await boot();
    const R = w.IntMapGeodesy._R_EARTH_KM;
    const MAX_KM = 120;

    /* Latitudes from the equator into the polar cap: the error this measures grows as 1/cos φ, so a
       fixture that stops at 45° sees a third of it. */
    let seed = 20260916;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const subjects = [], members = [];
    const lats = [0, 20, 40, 55, 60, 70, 78, 84, -60, -75];
    lats.forEach((lat, i) => {
      const lng = -170 + i * 34;
      subjects.push(pt(lng, lat, { id: 's' + i }));
      /* Neighbours strewn around each subject in DEGREES, so some of them land inside 120 km only
         because a degree of longitude is short up there — the population the old pad threw away. */
      for (let k = 0; k < 12; k++) members.push(pt(lng + (rnd() - 0.5) * 8, lat + (rnd() - 0.5) * 3, { id: i + '-' + k }));
    });

    const sDs = data.add({ title: 's', features: subjects });
    const mDs = data.add({ title: 'm', features: members });

    /* ⚠ THE REFERENCE IS EVERY PAIR, MEASURED — no index, no boxes, no ops: the definition of the
       query written out. This is the comparison tests/r735 ⑥ could not make. */
    const expect = new Set();
    for (const s of subjects) {
      for (const m of members) {
        if (haversineKm(R, s.geometry.coordinates, m.geometry.coordinates) <= MAX_KM) { expect.add(s.properties.id); break; }
      }
    }
    assert.ok(expect.size >= 6, 'the fixture matches almost nothing (' + expect.size + ') — it would pass while measuring nothing');

    const res = await ops.run({ op: 'relate', inputs: [sDs.id, mDs.id], params: { predicate: 'nearer-than', maxKm: MAX_KM } });
    assert.equal(res.ok, true, 'relate refused: ' + res.why);
    const got = res.dataset.features().map((f) => f.properties.id).sort();
    assert.deepEqual(got, [...expect].sort(), 'the op and the exhaustive measurement disagree');

    /* And with the index taken away, so a future index cannot hide behind the same padded box. */
    const kernel = w.IntMapGisIndex;
    w.IntMapGisIndex = null;
    const walked = await ops.run({ op: 'relate', inputs: [sDs.id, mDs.id], params: { predicate: 'nearer-than', maxKm: MAX_KM } });
    w.IntMapGisIndex = kernel;
    assert.equal(walked.ok, true);
    assert.deepEqual(walked.dataset.features().map((f) => f.properties.id).sort(), [...expect].sort());
  });

  /* ══ ③ 和集合は和集合である — 離れていても両方が残る ═════════════════════════════════ */

  test('R743 ③ union keeps every part of both inputs, disjoint or not', async () => {
    const { data, ops } = await boot();

    /* ⚠ THE SHIPPED ANSWER FOR THIS INPUT WAS AN EMPTY DATASET WITH ok:true. Two squares that do not
       touch make no pair, and the loop that ran was a loop over pairs. */
    const a = data.add({ title: 'a', features: [poly([box(0, 0, 1, 1)], { name: 'west' })] });
    const b = data.add({ title: 'b', features: [poly([box(10, 0, 11, 1)], { name: 'east' })] });
    const res = await ops.run({ op: 'union', inputs: [a.id, b.id] });
    assert.equal(res.ok, true, 'union refused: ' + res.why);
    assert.equal(res.dataset.count, 2, 'a union of two disjoint squares held ' + res.dataset.count + ' rows');
    assert.deepEqual(res.dataset.features().map((f) => f.properties.name).sort(), ['east', 'west'],
      'an operand vanished from its own union');
    assert.deepEqual(res.dataset.features().map((f) => f.properties._overlaySide).sort(), ['a', 'b'],
      'the rows do not say which input they came from');
  });

  /* ══ ④ 部分は分割である — 面積は A ∪ B の面積に一致する ═══════════════════════════════ */

  test('R743 ④ the parts of a union partition it — their areas sum to the area of A ∪ B', async () => {
    const { data, ops, w, geometry } = await boot();
    const R = w.IntMapGeodesy._R_EARTH_KM;

    const A = [poly([box(0, 0, 2, 2)], { a: 'A1' }), poly([box(5, 5, 6, 6)], { a: 'A2' })];
    const B = [poly([box(1, 1, 3, 3)], { b: 'B1' }), poly([box(20, 20, 21, 21)], { b: 'B2' })];
    const aDs = data.add({ title: 'a', features: A });
    const bDs = data.add({ title: 'b', features: B });

    /* ⚠ THE REFERENCE IS THE CLIPPER DRIVEN HERE OVER ALL FOUR FEATURES AT ONCE — no candidate
       source, no boxes, no ops. The engine is shared with the kernel; the LAYER being measured is
       not, and the layer is where ③ was wrong. */
    const whole = multiAreaKm2(R, geometry.union(A.concat(B).map((f) => f.geometry)));
    assert.ok(whole > 0, 'the reference union is empty — the fixture measures nothing');

    const res = await ops.run({ op: 'union', inputs: [aDs.id, bDs.id] });
    assert.equal(res.ok, true, 'union refused: ' + res.why);
    const rows = res.dataset.features();
    const summed = rows.reduce((s, f) => s + multiAreaKm2(R, f.geometry), 0);
    /* ⚠ THE OLD ANSWER FAILED THIS BY A FACTOR, NOT BY A ROUNDING: each pair carried the whole of
       both operands, so the same land was counted once per pair. */
    assert.ok(Math.abs(summed - whole) / whole < 1e-6,
      'the parts sum to ' + summed.toFixed(3) + ' km² but A ∪ B is ' + whole.toFixed(3) + ' km²');

    const sides = rows.map((f) => f.properties._overlaySide);
    assert.ok(sides.includes('both'), 'the intersection of the overlapping pair is missing');
    assert.ok(sides.includes('a') && sides.includes('b'), 'the parts belonging to one input only are missing');
    /* The row from the overlap carries BOTH tables, which is the whole point of an overlay. */
    const both = rows.find((f) => f.properties._overlaySide === 'both');
    assert.equal(both.properties.a, 'A1');
    assert.equal(both.properties.b, 'B1');
  });

  /* ══ ⑤ カーネルは「空」と「できなかった」を別々に述べる ═══════════════════════════════ */

  test('R743 ⑤ the kernel answers emptiness and failure as two different things', async () => {
    const { geometry } = await boot();

    const west = { type: 'Polygon', coordinates: [box(0, 0, 1, 1)] };
    const east = { type: 'Polygon', coordinates: [box(10, 0, 11, 1)] };
    /* An honest empty answer: they really do not meet. */
    const empty = geometry.attempt.intersection(west, east);
    assert.equal(empty.ok, true, 'a computable, empty intersection was reported as a failure');
    assert.equal(empty.geometry, null);

    /* ⚠ THE REFUSAL THE HEADER HAS NAMED SINCE #R732 AND NO LINE OF CODE EVER RETURNED. */
    const refused = geometry.attempt.intersection(west, WRAPS);
    assert.equal(refused.ok, false, 'a shape the kernel cannot express was reported as an empty answer');
    assert.equal(refused.why, 'geometry-wraps-world');

    /* The plain doors still answer exactly as they did, because they are one line over these. */
    assert.equal(geometry.intersection(west, east), null);
    assert.equal(geometry.intersection(west, WRAPS), null);
  });

  /* ══ ⑥ 計算できなかった実行は、素直な成功を報告しない ═══════════════════════════════ */

  test('R743 ⑥ an op that could not compute does not report a plain success', async () => {
    const { data, ops } = await boot();

    const subject = data.add({ title: 's', features: [poly([box(0, 81, 10, 88)], { id: 's1' })] });
    const windows = data.add({ title: 'w', features: [feat(WRAPS, { id: 'w1' })] });

    /* Nothing computable came back, so the answer is a refusal by name — not 「0 件」, which is an
       answer about the reader's data and would have been wrong. */
    const res = await ops.run({ op: 'clip', inputs: [subject.id, windows.id] });
    assert.equal(res.ok, false, 'a run that computed nothing reported ok with an empty dataset');
    assert.equal(res.why, 'geometry-failed');
    assert.equal(res.detail.why, 'geometry-wraps-world');
    assert.ok(res.detail.failed >= 1);

    /* And when SOME of it computed, the loss rides in stats — the channel js/gis-panel.js already
       prints for every op without knowing what any op measures. */
    const mixed = data.add({ title: 'w2', features: [feat(WRAPS, { id: 'w1' }), poly([box(0, 81, 5, 88)], { id: 'w2' })] });
    const part = await ops.run({ op: 'clip', inputs: [subject.id, mixed.id] });
    assert.equal(part.ok, true, 'clip refused: ' + part.why);
    assert.equal(part.stats.geometryFailed, 1, 'the row that could not be computed left no trace');
    assert.equal(part.stats.geometryWhy, 'geometry-wraps-world');
  });

  /* ══ ⑦ 失敗から判定を作らない ═══════════════════════════════════════════════════════════ */

  test('R743 ⑦ disjoint and contains do not make a verdict out of a failure', async () => {
    const { geometry } = await boot();

    const small = { type: 'Polygon', coordinates: [box(0, 81, 5, 88)] };

    /* ⚠ THE OLD ANSWERS WERE `true` AND `true`. disjoint is !intersects and intersects answers false
       when it cannot compute; contains is !difference(b, a) and a null difference reads as 「余りが
       無い」. Both are the strongest claim the function can make, made out of an error. */
    const dis = geometry.attempt.disjoint(small, WRAPS);
    assert.equal(dis.ok, false, 'disjoint answered a verdict for a pair it cannot measure');
    assert.equal(dis.why, 'geometry-wraps-world');

    const con = geometry.attempt.contains(WRAPS, small);
    assert.equal(con.ok, false, 'contains answered a verdict for a pair it cannot measure');

    /* A pair it CAN measure still answers, and answers what the plain door answers. */
    const a = { type: 'Polygon', coordinates: [box(0, 0, 10, 10)] };
    const b = { type: 'Polygon', coordinates: [box(1, 1, 2, 2)] };
    assert.equal(geometry.attempt.contains(a, b).value, true);
    assert.equal(geometry.contains(a, b), true);
    assert.equal(geometry.attempt.disjoint(a, b).value, false);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · MultiPolygon validity and repair   (was tests/r783-multipolygon-validity-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · MultiPolygon 全体の妥当性を、誰も測っていなかった
 * ----------------------------------------------------------------------------
 *  #R752 gave js/gis-geometry.js validate() and repair(), and they measured EVERY RING of every part
 *  and EVERY RING PAIR INSIDE one part: a ring that crosses itself, a hole outside its shell, a hole
 *  inside another hole. What no reader asked was the question OGC asks ABOUT THE MULTIPOLYGON:
 *  the interiors of its parts must not intersect. MEASURED on the code as shipped: validate() looped
 *  `for (i) checkPolygon(a[i], …)` and returned `valid: true` for two squares overlapping in a
 *  quarter of their area — each part is faultless on its own, and nothing compared one part with the
 *  next. repair() had the same shape one level down: it cleaned each part and concatenated the
 *  results, so a defect that only exists BETWEEN parts came out of a repair untouched and unstated.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「parts-overlap を返す」 is a sentence about an
 *  implementation; what is measured is what a reader loses — a geometry called VALID whose area is
 *  the sum of parts that cover the same ground twice, and a REPAIR that says it repaired it.
 *
 *  ⚠ AND THE OTHER HALF IS MEASURED TOO, BECAUSE A NEW CHECK CAN ONLY FAIL TWO WAYS: it can miss
 *  the defect, or it can condemn good data. Parts that are simply apart, parts that touch, a part
 *  sitting in another part's HOLE (disjoint interiors — valid, and the commonest real shape after
 *  plain islands), and the two halves of one part cut at the antimeridian (they share the seam edge)
 *  must all stay valid. ⑧ runs the whole of data/ecoregions_2017.geojson through it for that reason.
 * ==========================================================================*/
describe('§ #R783 · MultiPolygon validity and repair', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const geometry = makeGisGeometry();
    w.IntMapGisGeometry = geometry;
    await geometry.ready();
    return geometry;
  }

  /* A closed square ring, counter-clockwise (RFC 7946's exterior sense), so winding is never the
     thing under test below. */
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  /* …and the same square drawn the other way round, for the ring a hole needs. */
  const hole = (x0, y0, x1, y1) => box(x0, y0, x1, y1).slice().reverse();
  const multi = (parts) => ({ type: 'MultiPolygon', coordinates: parts });
  const codes = (list) => list.map((p) => p.code);
  const at = (list, code) => list.find((p) => p.code === code) || null;

  /* ══ ① 単体では有効な二つの正方形が、一部重なっている ═══════════════════════════════════ */

  test('R783 ① two faultless squares that overlap are not a valid MultiPolygon', async () => {
    const g = await boot();
    const r = g.validate(multi([[box(0, 0, 2, 2)], [box(1, 1, 3, 3)]]));

    assert.equal(r.ok, true);
    assert.equal(r.value.valid, false, 'overlapping parts were reported as valid');
    const p = at(r.value.problems, 'parts-overlap');
    assert.ok(p, 'no parts-overlap among ' + JSON.stringify(codes(r.value.problems)));
    assert.deepEqual(p.detail.parts, [0, 1], 'the problem must name WHICH two parts');
    /* WHERE, not just WHAT (the file's own rule): the path must lead to the offending part. */
    assert.deepEqual(p.path, ['coordinates', 0]);
    assert.equal(codes(r.value.problems).filter((c) => c.startsWith('ring-') || c.startsWith('hole-')).length, 0,
      'each part is faultless on its own — a per-ring complaint would be sending the reader to the wrong place');
  });

  /* ══ ② 一方が他方の中にある（入れ子のシェル）═════════════════════════════════════════════ */

  test('R783 ② a part nested inside another part is named as nesting, not as overlap', async () => {
    const g = await boot();
    const r = g.validate(multi([[box(0, 0, 10, 10)], [box(2, 2, 4, 4)]]));

    assert.equal(r.value.valid, false);
    const p = at(r.value.problems, 'part-inside-part');
    assert.ok(p, 'no part-inside-part among ' + JSON.stringify(codes(r.value.problems)));
    assert.equal(p.detail.part, 1, 'the inner part is the subject');
    assert.equal(p.detail.insideOf, 0);
    assert.deepEqual(p.path, ['coordinates', 1]);
    assert.equal(at(r.value.problems, 'parts-overlap'), null,
      'nesting and partial overlap are different defects and must not share a code');

    /* ⚠ AND THE SAME SHAPE WITH THE VERTICES ON THE OUTER BOUNDARY. A diamond inscribed in a square
       touches it at four points and crosses it nowhere, so a walk that only looks for boundary
       crossings — or that probes with the inner part's VERTICES, every one of which lies on the outer
       boundary where a parity test answers arbitrarily — reports nothing at all. */
    const inscribed = g.validate(multi([[box(0, 0, 4, 4)], [[[2, 0], [4, 2], [2, 4], [0, 2], [2, 0]]]]));
    assert.equal(inscribed.value.valid, false, 'an inscribed part is still a nested part');
    assert.equal(at(inscribed.value.problems, 'part-inside-part').detail.part, 1);
  });

  /* ══ ③ 同じパートが二度書かれている ════════════════════════════════════════════════════ */

  test('R783 ③ the same part written twice is duplication, not nesting', async () => {
    const g = await boot();
    const r = g.validate(multi([[box(0, 0, 5, 5)], [box(0, 0, 5, 5)]]));

    assert.equal(r.value.valid, false);
    const p = at(r.value.problems, 'part-duplicates-part');
    assert.ok(p, 'no part-duplicates-part among ' + JSON.stringify(codes(r.value.problems)));
    assert.equal(p.detail.part, 1, 'the later part is the redundant one');
    assert.equal(p.detail.duplicateOf, 0);
    assert.equal(at(r.value.problems, 'part-inside-part'), null,
      'a part equal to another is not "inside" it — mutual containment has its own name');

    /* The same region traced with an extra collinear vertex is the same region. A test that compared
       vertex lists would call this two different parts. */
    const loose = g.validate(multi([[box(0, 0, 5, 5)], [[[0, 0], [2.5, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]]));
    assert.ok(at(loose.value.problems, 'part-duplicates-part'), 'duplication is about the region, not the vertex list');
  });

  /* ══ ④ 離れた二つのパートは有効なまま（誤検出の側）══════════════════════════════════════ */

  test('R783 ④ parts that are apart, or that touch, stay valid', async () => {
    const g = await boot();

    const apart = g.validate(multi([[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]]));
    assert.equal(apart.value.valid, true, 'disjoint parts: ' + JSON.stringify(codes(apart.value.problems)));

    /* Bounding boxes that overlap while the shapes do not — the case a box-only test condemns. */
    const boxesOverlap = g.validate(multi([[box(0, 0, 10, 1)], [box(0, 5, 10, 6)]]));
    assert.equal(boxesOverlap.value.valid, true, 'straddling boxes: ' + JSON.stringify(codes(boxesOverlap.value.problems)));

    /* Touching along a whole edge, and at a single corner. Both have meeting boundaries and disjoint
       interiors, and this file reports INTERIOR intersection — see the note on crossesTransversally. */
    const edge = g.validate(multi([[box(0, 0, 2, 2)], [box(2, 0, 4, 2)]]));
    assert.equal(edge.value.valid, true, 'edge-touching parts: ' + JSON.stringify(codes(edge.value.problems)));
    const corner = g.validate(multi([[box(0, 0, 2, 2)], [box(2, 2, 4, 4)]]));
    assert.equal(corner.value.valid, true, 'corner-touching parts: ' + JSON.stringify(codes(corner.value.problems)));

    /* One part, cut at the antimeridian into the two pieces that are what GeoJSON can write. They
       share the seam edge at ±180, and aligning them into one window is what makes that visible. */
    const seam = g.validate(multi([[box(170, 0, 180, 10)], [box(-180, 0, -170, 10)]]));
    assert.equal(seam.value.valid, true, 'the seam halves of one part: ' + JSON.stringify(codes(seam.value.problems)));

    /* And a Polygon has one part, so nothing here may change what it answers. */
    const single = g.validate({ type: 'Polygon', coordinates: [box(0, 0, 2, 2)] });
    assert.equal(single.value.valid, true);
  });

  /* ══ ⑤ 穴の中のパートは有効 — 内部が交わらないので ═════════════════════════════════════ */

  test('R783 ⑤ a part inside another part\'s hole is valid; one overlapping the hole\'s rim is not', async () => {
    const g = await boot();

    const donut = [box(0, 0, 10, 10), hole(3, 3, 7, 7)];
    const inHole = g.validate(multi([donut, [box(4, 4, 6, 6)]]));
    assert.equal(inHole.value.valid, true,
      'a part in a hole has a disjoint interior: ' + JSON.stringify(codes(inHole.value.problems)));

    /* Filling the hole exactly is still disjoint interiors — the part touches the rim and no more. */
    const fillsHole = g.validate(multi([donut, [box(3, 3, 7, 7)]]));
    assert.equal(fillsHole.value.valid, true, 'a part that fills the hole: ' + JSON.stringify(codes(fillsHole.value.problems)));

    /* But one that spills over the rim covers ground the donut already covers. */
    const overRim = g.validate(multi([donut, [box(4, 4, 9, 9)]]));
    assert.equal(overRim.value.valid, false, 'a part spilling out of the hole overlaps the ring around it');
    assert.ok(at(overRim.value.problems, 'parts-overlap'), JSON.stringify(codes(overRim.value.problems)));

    /* ⚠ AND THE SHAPE THAT LOOKS LIKE NESTING AND IS NOT: a square inside the donut's shell that
       SWALLOWS THE HOLE. Every one of its corners is inside the donut, its boundary crosses nothing —
       and it is not contained, because it covers the ground the donut deliberately left out. A
       containment test that only asks about the inner part's vertices calls this nesting. */
    const swallowsHole = g.validate(multi([donut, [box(1, 1, 9, 9)]]));
    assert.equal(swallowsHole.value.valid, false);
    assert.ok(at(swallowsHole.value.problems, 'parts-overlap'),
      'a part that swallows the hole is not nested in the donut: ' + JSON.stringify(codes(swallowsHole.value.problems)));
    assert.equal(at(swallowsHole.value.problems, 'part-inside-part'), null);
  });

  /* ══ ⑥ repair() は、パート間の問題を直したなら直したと述べる ══════════════════════════════ */

  test('R783 ⑥ repair resolves what happens BETWEEN parts, and enumerates it', async () => {
    const g = await boot();

    const r = g.repair(multi([[box(0, 0, 2, 2)], [box(1, 1, 3, 3)]]));
    assert.equal(r.ok, true);
    assert.ok(r.geometry, 'the two overlapping squares are one region, not nothing');
    assert.ok(codes(r.changes).includes('resolved-part-overlap'),
      'a repair is a claim, so it is enumerated: ' + JSON.stringify(codes(r.changes)));
    assert.deepEqual(r.remaining, [], 'nothing may be left behind unstated');
    const after = g.validate(r.geometry);
    assert.equal(after.value.valid, true, 'the output of a repair must pass the check that asked for it');
    /* Two overlapping squares union to ONE part, and that is a change to the geometry's own type. */
    assert.equal(r.geometry.type, 'Polygon');
    assert.ok(codes(r.changes).includes('type-changed'));

    const nested = g.repair(multi([[box(0, 0, 10, 10)], [box(2, 2, 4, 4)]]));
    assert.ok(codes(nested.changes).includes('resolved-part-nesting'), JSON.stringify(codes(nested.changes)));
    assert.equal(g.validate(nested.geometry).value.valid, true);

    const dup = g.repair(multi([[box(0, 0, 5, 5)], [box(0, 0, 5, 5)]]));
    assert.ok(codes(dup.changes).includes('resolved-duplicate-part'), JSON.stringify(codes(dup.changes)));
    assert.equal(g.validate(dup.geometry).value.valid, true);

    /* ⚠ A PART THAT NEEDED NOTHING GOES OUT AS IT CAME IN — the file's own rule, applied to the new
       stage: a valid MultiPolygon must not be re-noded, merged or reordered by a repair. */
    const good = multi([[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]]);
    const untouched = g.repair(good);
    assert.deepEqual(untouched.geometry, good, 'a valid MultiPolygon came back changed');
    assert.deepEqual(untouched.changes, []);
  });

  /* ══ ⑦ 直せないときは「直せなかった」と述べる ═══════════════════════════════════════════ */

  test('R783 ⑦ a repair that does not fix the parts says so instead of returning a quiet valid', async () => {
    const g = await boot();

    /* opts.node:false is the caller saying 「位相は触るな」. The overlap then SURVIVES the repair, and
       the one thing that must not happen is silence about it. */
    const r = g.repair(multi([[box(0, 0, 2, 2)], [box(1, 1, 3, 3)]]), { node: false });
    assert.equal(r.ok, true);
    assert.ok(codes(r.remaining).includes('parts-overlap'),
      'what a repair did NOT fix belongs in `remaining`: ' + JSON.stringify(codes(r.remaining)));
    assert.ok(!codes(r.changes).includes('resolved-part-overlap'), 'it must not claim a repair it did not make');
  });

  /* ══ ⑩ 継ぎ目をまたいで重なっているとき、平面の読み方を間違えない ═══════════════════════ */

  test('R783 ⑩ parts that overlap across the antimeridian are unioned in the plane they were measured in', async () => {
    const g = await boot();
    /* Part 0 is 170°E–180°; part 1 is written 175°E → 175°W, which is how GeoJSON writes a shape
       that crosses the seam. They really do overlap. ⚠ cleanPolygon deliberately LEAVES a part that
       needs nothing exactly as written (#R752), so the array handed to a planar union holds a ring
       that reads 350° WIDE — and the first version of this repair did hand it over, turning the
       overlap into one self-intersecting ring while reporting that it had resolved it. */
    const mp = multi([[box(170, 0, 180, 10)], [[[175, 5], [-175, 5], [-175, 15], [175, 15], [175, 5]]]]);

    const v = g.validate(mp);
    assert.equal(v.value.valid, false, 'the overlap is across the seam, not absent');
    assert.ok(at(v.value.problems, 'parts-overlap'), JSON.stringify(codes(v.value.problems)));

    const r = g.repair(mp);
    assert.equal(r.ok, true);
    assert.ok(codes(r.changes).includes('resolved-part-overlap'));
    /* The answer is the two pieces the seam cuts the union into — every ring inside [-180,180], and
       no ring spanning the world the wrong way. */
    const rings = (r.geometry.type === 'Polygon' ? [r.geometry.coordinates] : r.geometry.coordinates).flat();
    for (const ring of rings) {
      const lngs = ring.map((p) => p[0]);
      assert.ok(Math.min(...lngs) >= -180 && Math.max(...lngs) <= 180, 'a ring left the window: ' + JSON.stringify(ring));
      assert.ok(Math.max(...lngs) - Math.min(...lngs) <= 180, 'a ring reads as wrapping the wrong way: ' + JSON.stringify(ring));
    }
    /* ⚠ AND WHAT IS LEFT IS STATED. The seam splitter returns the western piece with its −180 edge
       walked twice, which validate() calls `ring-self-intersects`; that is js/geodesy.js
       _splitPolyToWindows's output, not a between-parts defect, and it is in `remaining` rather than
       hidden behind the resolution above. What may NOT survive is the overlap itself. */
    assert.equal(codes(r.remaining).filter((c) => c.startsWith('part')).length, 0,
      'the between-parts defect survived: ' + JSON.stringify(codes(r.remaining)));
  });

  /* ══ ⑪ 1 周ずれた枠で書かれた二つの図形の boolean が、常に空だった ═══════════════════════ */

  /* ⚠⚠⚠ A PRE-EXISTING DEFECT, FOUND BY MEASUREMENT RATHER THAN BY READING (js/gis-raster.js's
   *  `coverOf`). alignTo exists precisely so that 「二つの図形が継ぎ目の反対側に書かれている」 does
   *  not make them 358° apart in the plane, and its own note says so. But boolOpR, unionR and
   *  bufferKmR hand it a MULTIPOLYGON — a list of PARTS — while lonRange inside it reads its argument
   *  as a list of RINGS. One level too shallow, `p[0]` is a position array rather than a number, every
   *  comparison against it is false, the range comes back null, and alignTo returns its input
   *  UNSHIFTED. So the intersection of a pixel written at 200°E with a box written at −161°E — the
   *  same ground — was null. Not refused: EMPTY, which every caller reads as 「該当なし」.
   *
   *  ⚠ IT BECAME VISIBLE TODAY. js/gis-raster.js's `coverOf` used to shortcut 「four corners inside →
   *  1」 and now descends to a real intersection, so a zone written a turn away used to score a wrong
   *  1 and now scores 0 and the pixel is dropped. Both are wrong; the dropped one is the one a reader
   *  can see.
   *
   *  ⚠ THE RULE GOES ON THE FACT, NOT ON THE CALLER. Neither function takes a flag and no caller is
   *  special-cased: a position is an array of numbers and anything else is a list of something, so
   *  「渡されたのは環かパートか」 is a question the value itself answers, at any depth. */

  test('R783 ⑪ a boolean between two shapes written one turn apart is not empty', async () => {
    const g = await boot();
    /* The measured case: one pixel at 200-201°E (a grid written past the seam) and the box that
       covers it, written as −161…−158°E. −161 + 360 = 199, so the box really does contain the pixel. */
    const pixel = { type: 'Polygon', coordinates: [box(200, 10, 201, 11)] };
    const zone = { type: 'Polygon', coordinates: [box(-161, 9, -158, 12)] };

    const hit = g.attempt.intersection(pixel, zone);
    assert.equal(hit.ok, true, 'refused: ' + hit.why);
    assert.ok(hit.geometry, 'the intersection of a pixel with the box that contains it came back empty');
    const rings = (hit.geometry.type === 'Polygon' ? [hit.geometry.coordinates] : hit.geometry.coordinates).flat();
    const lngs = rings.flat().map((p) => p[0]);
    assert.ok(Math.min(...lngs) >= -180 && Math.max(...lngs) <= 180, 'the answer left the window: ' + JSON.stringify(rings));
    /* It is the pixel, not a sliver and not the zone: 1° × 1° of ground. */
    const shoelace = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
    assert.ok(Math.abs(rings.reduce((s, r) => s + shoelace(r), 0) - 1) < 1e-9, 'area is not the pixel: ' + rings.map(shoelace));

    /* The union of the two is the zone — 3° × 3° — and not two disjoint parts on opposite sides. */
    const both = g.attempt.union([pixel, zone]);
    assert.equal(both.ok, true, 'refused: ' + both.why);
    assert.equal(both.geometry.type, 'Polygon', 'the two came back as separate parts, so they were never aligned');
    assert.ok(Math.abs(shoelace(both.geometry.coordinates[0]) - 9) < 1e-9);

    /* ⚠ AND THE CONTROL: written in the SAME window, the answers may not move. A fix that shifts
       shapes which needed no shifting is the failure mode of the one being fixed. */
    const near = { type: 'Polygon', coordinates: [box(-160, 10, -159, 11)] };
    const same = g.attempt.intersection(near, zone);
    assert.equal(same.ok, true);
    assert.equal(same.geometry.type, 'Polygon');
    /* By its extent and its area rather than by a vertex order typed here — the order is the
       sweep-line's to choose and asserting a guess at it measures the guess. */
    const ring = same.geometry.coordinates[0];
    assert.deepEqual([Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])),
      Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))], [-160, 10, -159, 11]);
    assert.ok(Math.abs(shoelace(ring) - 1) < 1e-9);
    const apart = g.attempt.intersection({ type: 'Polygon', coordinates: [box(0, 0, 1, 1)] }, zone);
    assert.equal(apart.ok, true);
    assert.equal(apart.geometry, null, 'two shapes that really are apart must still answer empty');

    /* ⚠⚠⚠ AND THE INVARIANT THE DEFECT ACTUALLY BROKE, WHICH IS STRONGER THAN ANY OF THE ABOVE:
       THE SAME GROUND WRITTEN A WHOLE TURN AWAY IS THE SAME GROUND. A turn is exactly 360° and exact
       in float64, so every answer about a shape written at −160°E must be the answer about the same
       shape written at 200°E — to the last digit, not approximately. MEASURED against the kernel as
       it shipped, all three doors broke it: the intersection went from 72,561 km² to NOTHING, the
       union from 362,769 to 435,331 km² (the two operands counted as if they were a world apart), and
       the buffer from 348,513 to 437,364 km² — the last one impossible on its own terms, a 5 km rim
       of 195,530 km² on a boundary of 1,977 km, where perimeter × r caps it at 106,681. */
    const R = 6371.0088, D2R = Math.PI / 180;
    const ringKm2 = (r) => { let s = 0; for (let i = 0, n = r.length - 1; i < n; i++) { let d = r[i + 1][0] - r[i][0]; while (d > 180) d -= 360; while (d < -180) d += 360; s += d * D2R * (2 + Math.sin(r[i][1] * D2R) + Math.sin(r[i + 1][1] * D2R)); } return Math.abs(s * R * R / 2); };
    const km2 = (geom) => (geom ? (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates)
      .reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * ringKm2(r), 0), 0) : 0);
    /* A Polygon's coordinates are RINGS, and writing this one level too deep is exactly the mistake
       under test — it hands `p[0] + 360` a number and produces [undefined, undefined]. */
    const aTurnAway = (poly) => ({ type: 'Polygon', coordinates: poly.coordinates.map((r) => r.map((p) => [p[0] + 360, p[1]])) });

    const body = { type: 'Polygon', coordinates: [box(-160, 10, -155, 14)] };
    const over = { type: 'Polygon', coordinates: [box(-158, 11, -150, 13)] };
    const far = aTurnAway(body);
    for (const [what, here, there] of [
      ['intersection', g.attempt.intersection(body, over), g.attempt.intersection(far, over)],
      ['union', g.attempt.union([body, over]), g.attempt.union([far, over])],
      ['bufferKm', g.attempt.bufferKm(body, 50), g.attempt.bufferKm(far, 50)],
    ]) {
      assert.equal(here.ok, true, what + ' refused in-window: ' + here.why);
      assert.equal(there.ok, true, what + ' refused a turn away: ' + there.why);
      const A = km2(here.geometry), B = km2(there.geometry);
      assert.ok(A > 0, what + ' answered nothing even in-window');
      assert.ok(Math.abs(A - B) <= 1e-6 * A, what + ': ' + A.toFixed(0) + ' km² in-window but ' + B.toFixed(0) + ' km² a turn away');
      /* Whichever window it was asked in, the answer comes back in the one GeoJSON has. */
      for (const geom of [here.geometry, there.geometry]) {
        const lg = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).flat().flat().map((p) => p[0]);
        assert.ok(Math.min(...lg) >= -180.000001 && Math.max(...lg) <= 180.000001, what + ' left the window');
      }
    }
  });

  /* ══ ⑧ 実データ — 判定そのものを、独立した engine と突き合わせる ═══════════════════════ */

  /* ⚠⚠⚠ THIS TEST WAS WRITTEN THE OTHER WAY ROUND FIRST, AND THE DATA REFUTED IT. It asserted
   *  「shipped record: zero condemned」 on the assumption that a new check firing on committed bytes
   *  is a false positive. MEASURED over data/ecoregions_2017.geojson: 126 of its 635 MultiPolygons
   *  hold a between-parts defect — 555 nested parts and 10 overlaps — and the SWEEP-LINE AGREES WITH
   *  EVERY ONE OF THEM. For the first sample checked, the intersection of the two parts came back with
   *  EXACTLY the area of the smaller one: the ground is in the geometry twice, and its area has been
   *  double-counted by every op that ever summed it. RESOLVE Ecoregions 2017 is simply not a
   *  topologically clean record, and 「新しい検査は既存データを落第させてはならない」 would have meant
   *  writing a check that agrees with whatever ships.
   *
   *  ⇒ So the invariant is not a count, which any future refresh of the record would invalidate for
   *  reasons that have nothing to do with this code. It is AGREEMENT WITH AN INDEPENDENT ANSWER:
   *  every pair this stage reports must be a pair whose intersection the sweep line measures as
   *  non-empty, and every pair the sweep line finds must be reported. That oracle is independent in
   *  the way that matters — Martinez–Rueda re-nodes both boundaries and computes an AREA, where this
   *  stage casts rays and looks at orientations — and it is the strongest one available in-tree
   *  ([[intmap-co-designed-reader-cannot-falsify]]: a reader designed with the thing it measures
   *  cannot falsify it, so the reader here is one nobody wrote for this purpose).
   *
   *  ⚠ ONE DISAGREEMENT IS ALLOWED AND NAMED: the CLASS (nested / duplicated / merely overlapping) of
   *  a pair in which a part crosses itself. A bow-tie's interior is read by parity here and by
   *  re-noding there, and for Albertine Rift parts 114 & 118 those two readings differ over 0.027% of
   *  one part's area. The FINDING may not disagree, only the name. */

  test('R783 ⑧ every finding on the shipped record is confirmed by the sweep line, and none is missed', async () => {
    const g = await boot();
    const PCm = await import('polygon-clipping');
    const PC = PCm.default || PCm;
    const fc = JSON.parse(read('data/ecoregions_2017.geojson'));
    const PART_CODES = ['parts-overlap', 'part-inside-part', 'part-duplicates-part'];

    const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
    const area = (poly) => poly.reduce((s, r, i) => s + (i ? -1 : 1) * ringArea(r), 0);
    const bbox = (poly) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of poly) for (const p of r) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; } return b; };
    const boxesMeet = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
    const near = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(Math.abs(x), Math.abs(y), 1e-12);
    /* Whether the pair is one the kernel says it may name only coarsely — see the header. */
    const ambiguous = (geom, i, j) => [i, j].some((k) => {
      const v = g.validate({ type: 'Polygon', coordinates: geom.coordinates[k] }, { limit: 4 });
      return codes(v.value.problems).some((c) => c === 'ring-self-intersects' || c === 'rings-intersect');
    });

    let features = 0, oraclePairs = 0, found = 0;
    const missed = [], spurious = [], misnamed = [];
    const t0 = Date.now();
    for (const f of fc.features || []) {
      const geom = f && f.geometry;
      if (!geom || geom.type !== 'MultiPolygon') continue;
      if (++features > 60) break;
      const cs = geom.coordinates;

      const mine = new Map();
      for (const p of g.validate(geom, { limit: 0 }).value.problems) {
        if (!PART_CODES.includes(p.code)) continue;
        const d = p.detail;
        const other = (d.insideOf != null) ? d.insideOf : ((d.duplicateOf != null) ? d.duplicateOf : d.parts.find((x) => x !== d.part));
        mine.set(Math.min(d.part, other) + ',' + Math.max(d.part, other), { code: p.code, inner: (d.insideOf != null) ? d.part : null });
        found++;
      }

      const boxes = cs.map(bbox);
      const oracle = new Map();
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        if (!boxesMeet(boxes[i], boxes[j])) continue;
        let inter = [];
        try { inter = PC.intersection(cs[i], cs[j]); } catch (_) { continue; }
        const ia = inter.reduce((s, poly) => s + area(poly), 0);
        if (!(ia > 1e-12)) continue;                 /* touching, or a sliver below the same-position width */
        const a = area(cs[i]), b = area(cs[j]);
        let code = 'parts-overlap', inner = null;
        if (near(ia, a) && near(ia, b)) code = 'part-duplicates-part';
        else if (near(ia, a)) { code = 'part-inside-part'; inner = i; }
        else if (near(ia, b)) { code = 'part-inside-part'; inner = j; }
        oracle.set(i + ',' + j, { code: code, inner: inner });
        oraclePairs++;
      }

      const name = (f.properties && f.properties.ECO_NAME) || '?';
      for (const [k, v] of oracle) {
        const m = mine.get(k);
        if (!m) { missed.push(name + ' ' + k + ' ' + v.code); continue; }
        const sameName = m.code === v.code && (v.inner == null || m.inner === v.inner);
        if (!sameName && !ambiguous(geom, ...k.split(',').map(Number))) misnamed.push(name + ' ' + k + ': ' + m.code + ' vs ' + v.code);
      }
      for (const k of mine.keys()) if (!oracle.has(k)) spurious.push(name + ' ' + k);
    }
    const ms = Date.now() - t0;

    assert.ok(oraclePairs > 100, 'the record must actually exercise the stage — sweep line found ' + oraclePairs);
    assert.deepEqual(spurious, [], 'reported over ground the sweep line says is not shared');
    assert.deepEqual(missed, [], 'the sweep line found an interior intersection this stage did not report');
    assert.deepEqual(misnamed, [], 'a pair with a well-defined interior was given the wrong name');
    assert.ok(found >= oraclePairs, found + ' findings for ' + oraclePairs + ' intersecting pairs');
    assert.ok(ms < 120000, 'the comparison took ' + ms + ' ms');
  });

  /* ══ ⑨ 実データでの repair — 重なった地面は一度だけになる ═══════════════════════════════ */

  test('R783 ⑨ repairing a shipped MultiPolygon removes the double-counted ground and nothing else', async () => {
    const g = await boot();
    const fc = JSON.parse(read('data/ecoregions_2017.geojson'));
    const PART_CODES = ['parts-overlap', 'part-inside-part', 'part-duplicates-part'];
    const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
    const allArea = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates)
      .reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * ringArea(r), 0), 0);

    let repaired = 0, clean = 0;
    for (const f of fc.features || []) {
      const geom = f && f.geometry;
      if (!geom || geom.type !== 'MultiPolygon') continue;
      if (repaired >= 5 && clean >= 40) break;
      const before = g.validate(geom, { limit: 0 });
      const hasPartDefect = codes(before.value.problems).some((c) => PART_CODES.includes(c));
      /* Repairing all 635 is 14 s of measuring nothing new — the quotas above are what this test
         needs, and the whole-record pass is ⑧'s subject. */
      if (hasPartDefect ? (repaired >= 5) : !(before.value.valid && clean < 40)) continue;
      const r = g.repair(geom);
      if (!r.ok) continue;

      if (hasPartDefect && repaired < 5) {
        repaired++;
        assert.ok(codes(r.changes).some((c) => c.startsWith('resolved-part-') || c === 'resolved-duplicate-part'),
          'a between-parts defect was repaired without saying so: ' + JSON.stringify([...new Set(codes(r.changes))]));
        const left = codes(r.remaining).filter((c) => PART_CODES.includes(c));
        assert.deepEqual(left, [], 'the repair left ground shared and did not resolve it');
        /* The area of the repaired geometry is the ground covered ONCE. It cannot grow. */
        assert.ok(allArea(r.geometry) <= allArea(geom) + 1e-9,
          'the repair grew the geometry: ' + allArea(r.geometry) + ' > ' + allArea(geom));
      }

      /* ⚠ AND THE OTHER HALF, ON THE SAME RECORD: a MultiPolygon with nothing wrong between its parts
         must not be merged, reordered or re-noded by the new stage.
         ⚠ ASKED WITH `winding:'keep'`, and the first version of this assertion was wrong without it:
         this record is wound the ESRI way (exterior rings clockwise), so the DEFAULT repair reverses
         every shell and says so — eleven `reversed-ring-winding` entries on the first clean feature.
         That is #R752's behaviour on a note validate() does not count as a defect, it predates today,
         and holding the new stage responsible for it would be measuring the wrong thing. With winding
         left alone, topology is the only thing left that could change the shape. */
      if (!hasPartDefect && before.value.valid && clean < 40) {
        clean++;
        const kept = g.repair(geom, { winding: 'keep' });
        assert.deepEqual(kept.changes, [], 'a valid MultiPolygon was changed: ' + JSON.stringify(kept.changes.slice(0, 3)));
        assert.deepEqual(kept.geometry, geom, 'a valid MultiPolygon came back a different shape');
      }
    }
    assert.ok(repaired >= 5, 'the record must exercise the repair — got ' + repaired);
    assert.ok(clean >= 10, 'the record must exercise the untouched case — got ' + clean);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R774 · areas across the antimeridian   (was tests/r774-gis-seam-area-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R774 · 日付変更線を跨ぐ面について、内外判定と面積が同じ形を意味する
 * ----------------------------------------------------------------------------
 *  ⚠ MEASURED ON THE SHIPPED BUILD (2026-09-17, commit 5d5f9312). One polygon, 179°E → 179°W,
 *  0°–1° — an undivided band two degrees wide across the antimeridian:
 *      ops.pointInPolygon([180, 0.5])  → true      （幅 2° の帯として読んだ）
 *      ops.pointInPolygon([0,   0.5])  → false
 *      ops.areaKm2(...)                → 4,426,211 km²   （経度差 358° として読んだ）
 *      同じ緯度の、継ぎ目にかからない幅 2° の帯 → 24,727 km²
 *  比は 179 倍。⚠ 二つの読み方がひとつの多角形にあり、読者はどちらにも出会えた。
 *  ⚠ js/gis-crs.js areaOn（`measure` が CRS を名指したときの平面路）は同じ環を
 *  `plane-seam-crossed` で拒んでいる。答えてしまっていたのは測地路だけだった。
 *
 *  ⚠⚠⚠ AND THE OTHER READING HAD TO SURVIVE. js/gis-ops.js の註が守っていたのは
 *  IntMapGeodesy.diskFillPolys の極の円盤で、89.9999° 線に沿って閉じる 360° の辺を持つ。
 *  各辺を「短い方」へ正規化するとその辺が消え、環は極を 1 周したものとして読まれ、
 *  面積は補集合になる（実測 89°N の 500 km buffer が 785,022 km² ではなく 509,280,824 km²）。
 *  ⇒ だから下の検査は「継ぎ目が直ったこと」と「極が動いていないこと」を同じ本数で測る。
 *  ⚠ 期待値は測る対象の外から取る: 極と赤道の円盤は同じ 500 km の円なので、
 *  互いが互いの参照になる（[[intmap-co-designed-reader-cannot-falsify]]）。
 * ==========================================================================*/
describe('§ #R774 · areas across the antimeridian', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const geometry = makeGisGeometry();
    w.IntMapGisGeometry = geometry;
    const ops = makeGisOps();
    w.IntMapGisOps = ops;
    await geometry.ready();
    return { w, ops, geometry };
  }

  const P = (rings) => ({ type: 'Polygon', coordinates: rings });
  const band = (w, e, s, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  /* 継ぎ目を跨ぐ、分割されていない帯。GeoJSON はこれを書ける。 */
  const SEAM_BAND = [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]];
  /* 同じ緯度・同じ経度幅の、継ぎ目にかからない帯。 */
  const PLAIN_BAND = [band(10, 12, 0, 1)];

  const REL = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));

  /* ══ ① 面積が、内外判定と同じ形を意味する ═══════════════════════════════════════════════════ */

  test('#R774 ① 継ぎ目を跨ぐ幅 2° の帯は、同じ緯度の幅 2° の帯と同じ面積', async () => {
    const { ops } = await boot();
    const seam = ops.areaKm2(P(SEAM_BAND));
    const plain = ops.areaKm2(P(PLAIN_BAND));
    assert.ok(REL(seam, plain) < 1e-9, '継ぎ目の帯が ' + seam.toFixed(1) + ' km²、同じ帯が ' + plain.toFixed(1) + ' km²');
    /* 出荷されていた値。これを踏まないことが、この検査の理由そのもの。 */
    assert.ok(seam < 1e5, '出荷時の 4,426,211 km² のままである: ' + seam);
  });

  test('#R774 ① 面積が示す帯と、内外判定が示す帯が同じ（二つの読み方が残っていない）', async () => {
    const { ops } = await boot();
    assert.equal(ops.pointInPolygon([180, 0.5], P(SEAM_BAND)), true, '継ぎ目の上の点が外と判定された');
    assert.equal(ops.pointInPolygon([0, 0.5], P(SEAM_BAND)), false, '地球の反対側が内と判定された');
    /* 内外が「幅 2°」と言うなら、面積も 2° ぶんでなければならない。反対側まで含む読み方なら
       358/2 = 179 倍になる——出荷時はそれだった。 */
    const ratio = ops.areaKm2(P(SEAM_BAND)) / ops.areaKm2(P(PLAIN_BAND));
    assert.ok(ratio < 1.000001, '面積と内外が別の形を意味している（比 ' + ratio.toFixed(1) + '）');
  });

  test('#R774 ① 穴も同じ規則で読まれる — 継ぎ目を跨ぐ穴が外側から引かれる', async () => {
    const { ops } = await boot();
    const outer = [[178, 0], [-178, 0], [-178, 4], [178, 4], [178, 0]];
    const hole = [[179, 1], [-179, 1], [-179, 2], [179, 2], [179, 1]];
    const withHole = ops.areaKm2(P([outer, hole]));
    const solid = ops.areaKm2(P([outer]));
    const holeAlone = ops.areaKm2(P([hole]));
    assert.ok(withHole < solid, '穴が引かれていない');
    assert.ok(REL(solid - holeAlone, withHole) < 1e-9, '穴の面積が外側と別の規則で読まれている');
    assert.ok(withHole < 2e5, '出荷時の 13,167,667 km² のままである: ' + withHole);
  });

  test('#R774 ① MultiPolygon の各面が独立に読まれる', async () => {
    const { ops } = await boot();
    const multi = { type: 'MultiPolygon', coordinates: [SEAM_BAND, PLAIN_BAND] };
    const sum = ops.areaKm2(P(SEAM_BAND)) + ops.areaKm2(P(PLAIN_BAND));
    assert.ok(REL(ops.areaKm2(multi), sum) < 1e-12);
  });

  /* ══ ② 極は動いていない — 註が守っていた読み方はそのまま ═══════════════════════════════════ */

  test('#R774 ② 極の円盤は、赤道の同じ円盤と同じ面積のまま（補集合になっていない）', async () => {
    const { w, ops } = await boot();
    const G = w.IntMapGeodesy;
    const areaOfDisk = (centre) => G.diskFillPolys(centre, 500, 96).reduce((a, poly) => a + ops.areaKm2(P(poly)), 0);
    const polar = areaOfDisk([0, 89]);
    const equator = areaOfDisk([139.7, 35.7]);
    /* 同じ半径の円なので、片方がもう片方の参照になる。球面上の 500 km 円は π r² に近い。 */
    assert.ok(REL(polar, equator) < 0.01, '極の円盤 ' + polar.toFixed(0) + ' km² と平地の円盤 ' + equator.toFixed(0) + ' km² が一致しない');
    assert.ok(REL(polar, Math.PI * 500 * 500) < 0.02, '極の円盤が 785,000 km² 付近にない: ' + polar);
    /* 出荷前に一度測られている壊れ方（補集合）。 */
    assert.ok(polar < 1e7, '極の円盤が補集合として読まれた: ' + polar);
  });

  test('#R774 ② 継ぎ目の上の円盤も、平地の円盤と同じ面積のまま', async () => {
    const { w, ops } = await boot();
    const G = w.IntMapGeodesy;
    const areaOfDisk = (centre) => G.diskFillPolys(centre, 500, 96).reduce((a, poly) => a + ops.areaKm2(P(poly)), 0);
    assert.ok(REL(areaOfDisk([179.8, 0]), areaOfDisk([0, 0])) < 1e-9, '分割済みの継ぎ目の円盤が動いた');
  });

  /* ══ ③ 規則が、どの辺が何であるかに付いている ═══════════════════════════════════════════════ */

  test('#R774 ③ 継ぎ目にかからない環は 1 バイトも触られない（正規化は跨いだ環だけに効く）', async () => {
    const { ops } = await boot();
    /* 経度幅が 180° を超える、しかし継ぎ目を跨がない環（どの辺も 180° 未満）。 */
    const wide = [[-170, 0], [-60, 0], [60, 0], [170, 0], [170, 5], [60, 5], [-60, 5], [-170, 5], [-170, 0]];
    const a = ops.areaKm2(P([wide]));
    assert.ok(a > 1e7, '幅 340° の帯が小さく読まれた: ' + a);
    /* 同じ帯を 2 つに割ったものと一致する（分割は答えを変えない）。 */
    const halves = ops.areaKm2(P([band(-170, 0, 0, 5)])) + ops.areaKm2(P([band(0, 170, 0, 5)]));
    assert.ok(REL(a, halves) < 1e-9, '分割したかどうかで答えが変わる: ' + a + ' / ' + halves);
  });

  test('#R774 ③ 幾何カーネルが載っていなければ、跨いだ環は null — 持っていない巻き直しで測ったとは言わない', async () => {
    const { w, ops } = await boot();
    delete w.IntMapGisGeometry;
    assert.equal(ops.areaKm2(P(SEAM_BAND)), null, '巻き直しが無いのに数を返した');
    assert.ok(ops.areaKm2(P(PLAIN_BAND)) > 0, '跨いでいない環まで測れなくなった');
  });

  /* ══ ④ 巻き直しの正本はひとつ ════════════════════════════════════════════════════════════════ */

  test('#R774 ④ 面積は js/gis-geometry.js の unwrapRing を呼ぶ — 2 つ目の巻き直しを持たない', async () => {
    /* ⚠ 評価で測る（以前は js/gis-ops.js を読み、`unwrapRing` の綴りと `while (… > 180)` の不在を
       見ていた）。綴りの在否は「呼んでいる」とも「2 つ目が無い」とも言えない——別名の巻き直しは
       正規表現をすり抜け、呼ばれない `unwrapRing` の綴りは通る。だからカーネルの unwrapRing を
       差し替え、面積が**カーネルが返した環そのもの**で測られることを確かめる。自前の巻き直しを
       もう一度かけていれば、差し替えた答えとは違う面積になる。 */
    const { w, ops, geometry } = await boot();
    const asked = [];
    const answerWith = (ring) => new Proxy(geometry, {
      get(t, k) {
        if (k === 'unwrapRing') return (pts) => { asked.push(pts.length); return ring.map((p) => p.slice()); };
        const v = t[k];
        return (typeof v === 'function') ? v.bind(t) : v;
      },
    });
    /* カーネルが「本初子午線を挟む幅 2° の帯」と答えれば、跨いだ帯の面積はその帯の面積そのもの。
       ⚠ 答えに負の経度を含めてある——こちらがもう一度巻き直せば、その負の経度が動いて面積が変わる。 */
    const MERIDIAN_BAND = band(-1, 1, 0, 1);
    w.IntMapGisGeometry = answerWith(MERIDIAN_BAND);
    const plain = ops.areaKm2(P([MERIDIAN_BAND]));
    assert.equal(asked.length, 0, '跨いでいない環までカーネルに回された');
    assert.equal(ops.areaKm2(P(SEAM_BAND)), plain, '面積が、カーネルの巻き直しの答えで測られていない');
    assert.equal(asked.length, 1, '跨いだ環がカーネルの unwrapRing に渡されていない');
    /* 違う答え（幅 4°）を返せば、面積もそれに従う——こちらの 2 つ目の規則が上書きしていない */
    w.IntMapGisGeometry = answerWith(band(-2, 2, 0, 1));
    const wide = ops.areaKm2(P(SEAM_BAND));
    assert.ok(REL(wide, 2 * plain) < 1e-9, 'カーネルの答えとは違う環で測っている: ' + wide + ' vs ' + 2 * plain);
  });

  ISOLATED.built();
});
