/* ============================================================================
 *  #R819 · 図形単体の妥当性から、データセット全体の整合性へ
 * ----------------------------------------------------------------------------
 *  js/gis-geometry.js could answer 「この幾何は幾何か」 in three stages — positions, the rings of one
 *  part, the parts of one MultiPolygon — and said so in its own comment that the fourth stage was a
 *  DIFFERENT SUBJECT it was not attempting: 地物どうしの重複, 区域間の隙間, 共有境界の不一致.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「coverage() が配列を返す」 is a sentence about an
 *  implementation and would pass over an answer that counts findings and hands back no geometry.
 *  What is measured is what a reader of 区域別統計 LOSES without this:
 *
 *    ① two municipal polygons that are each PERFECTLY VALID on their own overlap by a hectare, and
 *       the population joined to both counts that hectare's people twice. Nothing in the app could
 *       be asked about it, and validate() answers `valid: true` about both — correctly, because the
 *       defect is not in either geometry. What comes back has to be the OVERLAPPING GROUND, as
 *       geometry, or the next step cannot subtract it from anybody.
 *    ② the hectare that falls BETWEEN them is in no total at all — and the 1 µm sliver beside it is
 *       the float64 the file was written with. Which of the two is which is a statement about the
 *       survey, so it is the caller's tolerance, and a tolerated gap must still be MEASURED and
 *       returned rather than silently dropped.
 *    ③ one polygon split its side at a vertex the neighbour does not have. The two boundaries agree
 *       as lines and disagree as edges, no overlap and no gap exists, every re-noding of that set
 *       moves the border, and NO amount of per-geometry validation can see it (PostGIS answers this
 *       with ST_CoverageInvalidEdges, and answers it separately from ST_IsValid for this reason).
 *    ④ ⚠ AN OVERLAP IS NOT AUTOMATICALLY AN ERROR. IntMap draws disputed claims, duplicate records
 *       and survey seams on purpose (.agents/rules/historical-verification.md §2-5), so a door that
 *       hard-codes 「重なり＝異常」 would condemn the shipped record rather than measure it. The
 *       condition has to be STATED by the caller, and a call that states nothing must be refused
 *       rather than answered with a vacuous green.
 *    ⑤ and none of this may change what validate() and repair() already answer about ONE geometry.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const geometry = makeGisGeometry();
  w.IntMapGisGeometry = geometry;
  const up = await geometry.ready();
  assert.equal(up, true, 'polygon-clipping must load for this file to measure anything');
  return geometry;
}

/* An axis-aligned rectangle, counter-clockwise and closed — the shape a municipal boundary is not,
   and the only one whose overlaps and gaps a reader can check by hand. */
const box = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const poly = (...pts) => ({ type: 'Polygon', coordinates: [pts.concat([pts[0]])] });

function bbox(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (n) => {
    if (Array.isArray(n) && typeof n[0] === 'number') {
      if (n[0] < x0) x0 = n[0]; if (n[0] > x1) x1 = n[0];
      if (n[1] < y0) y0 = n[1]; if (n[1] > y1) y1 = n[1];
      return;
    }
    if (Array.isArray(n)) n.forEach(walk);
  };
  walk(g.coordinates);
  return [x0, y0, x1, y1];
}

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

/* ══ ① わずかに重なる2つの区域 — 重複部分が「幾何」として返る ═══════════════════════════ */

test('R819 ① two separately-valid areas that overlap: the overlapping ground comes back as geometry', async () => {
  const g = await boot();
  const a = box(0, 0, 1, 1);
  const b = box(0.9, 0, 2, 1);

  /* The defect is NOT in either geometry, and this is the line that says so: a per-geometry
     validator answers 「問題なし」 about both, for ever, whatever the other feature does. */
  assert.equal(g.validate(a).value.valid, true);
  assert.equal(g.validate(b).value.valid, true);

  const r = g.coverage([a, b], { overlaps: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.conforms, false);
  assert.equal(r.value.counts.overlap, 1);
  assert.equal(r.value.findings.length, 1);

  const f = r.value.findings[0];
  assert.equal(f.kind, 'overlap');
  assert.deepEqual(f.features, [0, 1], 'a finding names the two features it is about');
  /* ⚠ 件数では次の処理へ渡せない。The polygon that comes back is the ground that would be counted
     twice, and it is the ground a `difference` step would cut out of one side. */
  assert.ok(f.geometry && f.geometry.type === 'Polygon', 'the overlap is returned as a polygon');
  const bb = bbox(f.geometry);
  near(bb[0], 0.9, 1e-9, 'overlap west');
  near(bb[2], 1.0, 1e-9, 'overlap east');
  near(bb[1], 0.0, 1e-9, 'overlap south');
  near(bb[3], 1.0, 1e-9, 'overlap north');
});

test('R819 ① features that merely TOUCH share no interior and are not an overlap', async () => {
  const g = await boot();
  const r = g.coverage([box(0, 0, 1, 1), box(1, 0, 2, 1)], { overlaps: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.counts.overlap, 0);
  assert.equal(r.value.conforms, true);
});

test('R819 ① the overlap is found across the antimeridian, where the two rings are written 358° apart', async () => {
  const g = await boot();
  /* 179 → −179 is one 2° edge across the seam, and −179.5 → −178 is written the other side of the
     cut. In a naive plane these do not touch. */
  const a = poly([179, 0], [-179, 0], [-179, 1], [179, 1]);
  const b = box(-179.5, 0, -178, 1);
  const r = g.coverage([a, b], { overlaps: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.counts.overlap, 1, 'the seam must not hide a real overlap');
});

/* ══ ② 細い隙間 — 許容距離の指定に従って検出／許容される ═════════════════════════════════ */

/* Four rectangles that enclose a slot 0.0001° wide (≈ 11.1 m) and 1° tall. The slot is a HOLE in
   the union of the set: ground the coverage encloses and does not cover. */
function slottedSet() {
  return [
    box(0, 0, 1, 1),                 /* left  */
    box(1.0001, 0, 2, 1),            /* right */
    box(0, 1, 2, 1.5),               /* top bridge    */
    box(0, -0.5, 2, 0),              /* bottom bridge */
  ];
}

test('R819 ② a gap is a hole in the union, returned as geometry, with the features that bound it', async () => {
  const g = await boot();
  const r = g.coverage(slottedSet(), { gaps: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.counts.gap, 1);
  assert.equal(r.value.conforms, false);

  const f = r.value.findings[0];
  assert.equal(f.kind, 'gap');
  assert.ok(f.geometry && f.geometry.type === 'Polygon');
  const bb = bbox(f.geometry);
  near(bb[0], 1.0, 1e-9, 'gap west');
  near(bb[2], 1.0001, 1e-9, 'gap east');
  /* 「どの区域の間の隙間か」 — otherwise the reader has the hole and no idea whose it is. */
  assert.ok(f.features.includes(0) && f.features.includes(1), `neighbours: ${JSON.stringify(f.features)}`);
  assert.equal(f.detail.toleranceKm, 0);
  assert.equal(f.detail.erosion, 'not-asked');
});

test('R819 ② the same gap is tolerated or reported according to the stated distance, not to a number in the kernel', async () => {
  const g = await boot();

  /* 50 m: the 11 m slot is float64/survey noise and the set conforms — but it is still MEASURED and
     still handed back, in `tolerated`, because a tolerated finding that vanishes is a finding
     nobody can check. */
  const loose = g.coverage(slottedSet(), { gaps: 'forbid', gapToleranceKm: 0.05 });
  assert.equal(loose.ok, true, loose.why);
  assert.equal(loose.value.conforms, true);
  assert.equal(loose.value.counts.gap, 0);
  assert.equal(loose.value.findings.length, 0);
  assert.equal(loose.value.tolerated.length, 1);
  assert.equal(loose.value.tolerated[0].kind, 'gap');
  assert.equal(loose.value.tolerated[0].detail.erosion, 'empty');
  assert.ok(loose.value.tolerated[0].geometry, 'a tolerated gap still comes back as geometry');

  /* 1 m: the same slot is wider than that, so it is a hole in the world. */
  const tight = g.coverage(slottedSet(), { gaps: 'forbid', gapToleranceKm: 0.001 });
  assert.equal(tight.ok, true, tight.why);
  assert.equal(tight.value.conforms, false);
  assert.equal(tight.value.counts.gap, 1);
  assert.equal(tight.value.findings[0].detail.erosion, 'survives');
});

test('R819 ② the extent a set is supposed to fill is the caller’s, and what it does not fill comes back', async () => {
  const g = await boot();
  /* Two thirds of a rectangle. Nothing ENCLOSES the missing third, so it is not a hole in the union
     — 「隙間が無い」 and 「この範囲を覆う」 are two different claims and only the second can see it. */
  const set = [box(0, 0, 1, 1), box(1, 0, 2, 1)];
  const holes = g.coverage(set, { gaps: 'forbid' });
  assert.equal(holes.value.counts.gap, 0);

  const r = g.coverage(set, { cover: box(0, 0, 3, 1) });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.counts.uncovered, 1);
  assert.equal(r.value.conforms, false);
  const bb = bbox(r.value.findings[0].geometry);
  near(bb[0], 2, 1e-9, 'uncovered west');
  near(bb[2], 3, 1e-9, 'uncovered east');

  const full = g.coverage(set, { cover: box(0, 0, 2, 1) });
  assert.equal(full.value.conforms, true);
  assert.equal(full.value.counts.uncovered, 0);
});

/* ══ ③ 共有境界の頂点がずれている — 合っていない辺が返る ═══════════════════════════════ */

test('R819 ③ a shared boundary split at a vertex the neighbour does not have: the unmatched edges come back', async () => {
  const g = await boot();
  const a = box(0, 0, 1, 1);
  /* Same ground as box(1,0,2,1), with one extra vertex halfway down the shared side. */
  const b = poly([1, 0], [2, 0], [2, 1], [1, 1], [1, 0.5]);

  /* ⚠ THE DEFECT IS INVISIBLE TO EVERY OTHER TEST, and that is why this stage exists. */
  assert.equal(g.validate(a).value.valid, true);
  assert.equal(g.validate(b).value.valid, true);
  const overlapOnly = g.coverage([a, b], { overlaps: 'forbid', gaps: 'forbid' });
  assert.equal(overlapOnly.value.conforms, true, 'no overlap and no gap: the two cover the ground exactly once');

  const r = g.coverage([a, b], { edges: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.conforms, false);
  assert.equal(r.value.counts.edge, 2, 'one finding per feature whose linework a reader has to fix');

  const byFeature = new Map(r.value.findings.map((f) => [f.features[0], f]));
  assert.ok(byFeature.has(0) && byFeature.has(1));
  assert.equal(byFeature.get(0).kind, 'edge-mismatch');
  /* A's one long side against B's two halves: one edge on A, two on B — as linework, not as a
     count, because the reader has to go and look at exactly those edges. */
  assert.equal(byFeature.get(0).detail.edges, 1);
  assert.equal(byFeature.get(0).geometry.type, 'LineString');
  assert.equal(byFeature.get(1).detail.edges, 2);
  assert.equal(byFeature.get(1).geometry.type, 'MultiLineString');
  for (const f of r.value.findings) for (const p of JSON.stringify(f.geometry).matchAll(/\[(-?[\d.]+),/g)) {
    near(Number(p[1]), 1, 1e-9, 'every unmatched edge lies on the shared side x=1');
  }
});

test('R819 ③ a sliver pinched at both ends is a hole in nothing, and the matching distance is what finds it', async () => {
  const g = await boot();
  const a = box(0, 0, 1, 1);
  /* B's side is drawn through (1.0000005, 0.5) — 5.6 cm off the line A drew, so 5.6 cm of ground
     belongs to nobody. ⚠ MEASURED: because the two boundaries MEET at (1,0) and (1,1), the union
     is two parts touching at two points and has NO INNER RING — the lens is not a hole, and
     `gaps` cannot see it. A green 「gaps: 0」 here is a true statement about holes and would be a
     false one about 隙間, which is why the kernel says so where the stage is. */
  const b = poly([1, 0], [2, 0], [2, 1], [1, 1], [1.0000005, 0.5]);
  const gaps = g.coverage([a, b], { gaps: 'forbid' });
  assert.equal(gaps.ok, true, gaps.why);
  assert.equal(gaps.value.counts.gap, 0);
  const union = g.union([a, b]);
  assert.equal(union.type, 'MultiPolygon');
  assert.ok(union.coordinates.every((p) => p.length === 1), 'the union really has no hole to find');

  /* Nothing is compared at tolerance 0: the two sides are not the same line, and inventing a
     threshold at which they would be is the hardcoding .agents/rules forbid. */
  const exact = g.coverage([a, b], { edges: 'forbid' });
  assert.equal(exact.value.counts.edge, 0);

  /* Told that a metre is the distance within which two boundaries describe one border, the
     disagreement is found — and it is found as the LINEWORK a reader has to go and look at. */
  const stated = g.coverage([a, b], { edges: 'forbid', edgeToleranceKm: 0.001 });
  assert.equal(stated.ok, true, stated.why);
  assert.equal(stated.value.conforms, false);
  assert.equal(stated.value.counts.edge, 2, 'both boundaries are named, because either could be the wrong one');
  assert.ok(stated.value.findings.every((f) => f.geometry && /LineString/.test(f.geometry.type)));
  assert.equal(stated.value.findings[0].detail.toleranceKm, 0.001);
});

test('R819 ③ and the same distance forgives: two surveys of one border that round the shared vertex differently', async () => {
  const g = await boot();
  /* Both polygons split the shared side at the same place; they disagree about it by 1.1 cm. */
  const a = poly([0, 0], [1, 0], [1, 0.5], [1, 1], [0, 1]);
  const b = poly([1, 0], [2, 0], [2, 1], [1, 1], [1, 0.5000001]);

  const exact = g.coverage([a, b], { edges: 'forbid' });
  assert.equal(exact.value.counts.edge, 2, 'at 0 the two vertices are two vertices');

  const forgiving = g.coverage([a, b], { edges: 'forbid', edgeToleranceKm: 0.001 });
  assert.equal(forgiving.ok, true, forgiving.why);
  assert.equal(forgiving.value.counts.edge, 0, '1.1 cm is the same vertex to a caller who said a metre');
  assert.equal(forgiving.value.conforms, true);
});

/* ══ ④ 正しく分割された区分では異常が0件 ／「重なってよい」は異常ではない ═══════════════ */

test('R819 ④ a correctly split partition raises nothing, on every condition at once', async () => {
  const g = await boot();
  const r = g.coverage([box(0, 0, 1, 1), box(1, 0, 2, 1)], {
    overlaps: 'forbid', gaps: 'forbid', edges: 'forbid', cover: box(0, 0, 2, 1), gapToleranceKm: 0.001,
  });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.conforms, true);
  assert.deepEqual(
    { o: r.value.counts.overlap, g: r.value.counts.gap, u: r.value.counts.uncovered, e: r.value.counts.edge },
    { o: 0, g: 0, u: 0, e: 0 },
  );
  assert.equal(r.value.findings.length, 0);
  assert.equal(r.value.truncated, false);
});

test('R819 ④ 「重なってよい」 measures the overlap and does not call it wrong', async () => {
  const g = await boot();
  const set = [box(0, 0, 1, 1), box(0.9, 0, 2, 1)];

  /* The historical-dispute case: two claimants to the same ground. The reader wants the disputed
     polygon; the reader does NOT want to be told the record is broken. */
  const reported = g.coverage(set, { overlaps: 'report' });
  assert.equal(reported.ok, true, reported.why);
  assert.equal(reported.value.conforms, true, 'a stated-as-allowed overlap is not a violation');
  assert.equal(reported.value.counts.overlap, 0);
  assert.equal(reported.value.findings.length, 0);
  assert.equal(reported.value.tolerated.length, 1);
  assert.ok(reported.value.tolerated[0].geometry, 'and it is still returned as geometry');

  /* 'allow' does not compute it at all — the same two features, asked about their gaps. */
  const ignored = g.coverage(set, { overlaps: 'allow', gaps: 'forbid' });
  assert.equal(ignored.value.conforms, true);
  assert.equal(ignored.value.tolerated.length, 0);
  assert.equal(ignored.value.asked.overlaps, 'allow');
});

test('R819 ④ the conditions are the caller’s, so a call that asserts nothing is refused', async () => {
  const g = await boot();
  const one = box(0, 0, 1, 1);

  const vacuous = g.coverage([one, box(0.9, 0, 2, 1)], {});
  assert.equal(vacuous.ok, false);
  assert.equal(vacuous.why, 'coverage-nothing-asked');

  const unknown = g.coverage([one], { overlaps: 'must-not' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.why, 'coverage-unknown-condition');
  assert.equal(unknown.detail.condition, 'overlaps');

  assert.equal(g.coverage([], { overlaps: 'forbid' }).why, 'missing-geometry');
  assert.equal(g.coverage(null, { overlaps: 'forbid' }).why, 'missing-geometry');
  assert.equal(g.coverage([one], { gaps: 'forbid', gapToleranceKm: -1 }).why, 'bad-tolerance');
  assert.equal(g.coverage([one], { gaps: 'forbid', gapToleranceKm: 'wide' }).why, 'bad-tolerance');

  /* Every answer echoes what it was asked, so a stored finding can be read a month later without
     the call that produced it. */
  const r = g.coverage([one], { gaps: 'forbid', gapToleranceKm: 2 });
  assert.deepEqual(r.value.asked, {
    overlaps: 'allow', gaps: 'forbid', edges: 'allow', cover: false, gapToleranceKm: 2, edgeToleranceKm: 0,
  });
});

test('R819 ④ a Feature is read for its geometry and a feature with no interior is neither a defect nor an error', async () => {
  const g = await boot();
  const set = [
    { type: 'Feature', properties: { name: 'A' }, geometry: box(0, 0, 1, 1) },
    { type: 'Feature', properties: { name: 'B' }, geometry: box(0.9, 0, 2, 1) },
    { type: 'Feature', properties: { name: 'P' }, geometry: { type: 'Point', coordinates: [5, 5] } },
    { type: 'Feature', properties: { name: 'none' }, geometry: null },
  ];
  const r = g.coverage(set, { overlaps: 'forbid' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.counts.features, 4);
  assert.equal(r.value.counts.areal, 2);
  assert.deepEqual(r.value.findings[0].features, [0, 1], 'indexes are into the array the caller passed');
});

test('R819 ④ findings are capped and the cap is stated rather than silently shortening the list', async () => {
  const g = await boot();
  const set = [box(0, 0, 1, 1), box(0.9, 0, 2, 1), box(0.95, 0, 3, 1)];
  const r = g.coverage(set, { overlaps: 'forbid', limit: 1 });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.value.findings.length, 1);
  assert.equal(r.value.truncated, true);
});

/* ══ ⑤ 単体検証・修復の既存の挙動が変わっていない ══════════════════════════════════════ */

test('R819 ⑤ validate() and repair() answer exactly what they answered before', async () => {
  const g = await boot();

  /* The three stages validate() already had, one case each. */
  assert.equal(g.validate(box(0, 0, 1, 1)).value.valid, true);
  const bowtie = { type: 'Polygon', coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] };
  const bt = g.validate(bowtie).value;
  assert.equal(bt.valid, false);
  assert.ok(bt.problems.some((p) => p.code === 'ring-self-intersects'));
  const twoParts = { type: 'MultiPolygon', coordinates: [box(0, 0, 1, 1).coordinates, box(0.5, 0.5, 1.5, 1.5).coordinates] };
  const tp = g.validate(twoParts).value;
  assert.equal(tp.valid, false, 'the parts of ONE MultiPolygon overlapping is still stage three');
  assert.ok(tp.problems.some((p) => p.code === 'parts-overlap'));
  assert.equal(g.validate(null).why, 'missing-geometry');

  /* And the same two FEATURES stay valid on their own — which is the whole reason coverage() had to
     be a separate door rather than a stricter validate(). */
  assert.equal(g.validate(box(0, 0, 1, 1)).value.valid, true);
  assert.equal(g.validate(box(0.5, 0.5, 1.5, 1.5)).value.valid, true);

  /* repair(): an unclosed ring is closed, a self-crossing ring is re-noded, and both are enumerated
     rather than quietly returned. */
  const open = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] };
  const ro = g.repair(open);
  assert.equal(ro.ok, true);
  assert.ok(ro.changes.some((c) => c.code === 'closed-ring'));
  assert.equal(ro.remaining.length, 0);
  const rb = g.repair(bowtie);
  assert.equal(rb.ok, true);
  assert.ok(rb.changes.some((c) => c.code === 'resolved-self-intersection'));
  assert.equal(rb.remaining.length, 0);
  const rp = g.repair(twoParts);
  assert.ok(rp.changes.some((c) => c.code === 'resolved-part-overlap'));
  assert.equal(g.repair({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 95], [0, 0]]] }).why, 'latitude-out-of-range');

  /* ⚠ coverage() REPAIRS NOTHING, and that is stated rather than implied: which neighbour swallows
     a gap and which claimant owns a disputed hectare are claims about the data, not about geometry
     (js/gis-geometry.js says so where the door is defined). */
  assert.equal(typeof g.coverage, 'function');
  assert.equal(g.repairCoverage, undefined);
});

test('R819 ⑤ the kernel keeps every door it had, and the new one is on the readable shape', async () => {
  const g = await boot();
  for (const name of ['union', 'intersection', 'difference', 'dissolve', 'bufferKm', 'intersects', 'contains',
    'within', 'disjoint', 'distanceKm', 'pointInGeometry', 'validate', 'repair', 'toMulti', 'fromMulti',
    'unwrapRing', 'ringsOf', 'linesOf', 'pointsOf', 'hasArea', 'version', 'ready', 'available']) {
    assert.equal(typeof g[name], 'function', `${name} must still exist`);
  }
  for (const name of ['union', 'intersection', 'difference', 'dissolve', 'bufferKm', 'intersects', 'contains',
    'within', 'disjoint', 'distanceKm', 'areal']) {
    assert.equal(typeof g.attempt[name], 'function', `attempt.${name} must still exist`);
  }
  /* ⚠ 「答えは空だった」 と 「答えられなかった」 are still two answers, and coverage() speaks the
     same vocabulary: never a null that a caller reads as 「該当なし」. */
  const r = g.coverage([box(0, 0, 1, 1)], { overlaps: 'forbid' });
  assert.equal(r.ok, true);
  assert.equal(r.value.conforms, true);
  assert.equal(g.coverage([box(0, 0, 1, 1)], { overlaps: 'sometimes' }).ok, false);
});
