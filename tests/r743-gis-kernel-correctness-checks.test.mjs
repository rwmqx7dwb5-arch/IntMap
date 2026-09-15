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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r732-gis-geometry-crs-checks: js/geodesy.js publishes onto `window` at top
   level and exports nothing, so it is evaluated the way a browser evaluates it. */
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
