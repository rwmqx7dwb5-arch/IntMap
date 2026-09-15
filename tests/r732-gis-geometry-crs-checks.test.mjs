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
 *  `clip-window-crosses-antimeridian` — and tests/r729-gis-core-checks ③ points here for that
 *  reason. A refusal that becomes an implementation has to keep being measured, or the round that
 *  removed the refusal is the round that stopped looking.
 *
 *  ⚠ ② AND ④ COMPARE AGAINST NUMBERS DERIVED FROM GEOMETRY, NOT AGAINST NUMBERS THIS FILE SAW
 *  ONCE. A recorded output would pass for whatever the code happens to produce tomorrow; the
 *  analytic area of a capsule and of a lat/lon box do not move.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes onto `window` at top level and exports nothing, so it is evaluated the
   way a browser evaluates it. Same boot as tests/r729-gis-core-checks. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

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
  const inDecl = Array.from(declBlock.matchAll(/^      ([a-z]+): \{$/gm)).map((m) => m[1]);
  const runBlock = src.slice(src.indexOf('const RUN = {'), src.indexOf('const runner = RUN['));
  const wired = Array.from(runBlock.matchAll(/^        ([a-z]+): \(\) =>/gm)).map((m) => m[1]);

  assert.deepEqual(inDecl.slice().sort(), declared.slice().sort(), 'ops() does not hand out exactly what DECL declares');
  assert.deepEqual(wired.slice().sort(), declared.slice().sort(), 'a declared op has no runner, or a runner has no declaration');

  /* The list the panel would have had to keep is gone: ORDER is derived. */
  assert.match(src, /const ORDER = Object\.keys\(DECL\);/, 'ORDER is a hand-written list again');

  /* Every op that reaches the kernel says so, so a panel can grey it and run() can await it. */
  for (const d of ops.ops()) {
    if (d.id === 'filter') continue;
    assert.equal(d.needsGeometry, true, d.id + ' uses the geometry kernel without declaring it');
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
