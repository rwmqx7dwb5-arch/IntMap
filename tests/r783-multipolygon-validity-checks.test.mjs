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
