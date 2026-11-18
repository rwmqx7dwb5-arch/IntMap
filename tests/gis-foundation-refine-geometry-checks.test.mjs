/* ============================================================================
 *  gis-foundation-refine · THE GEOMETRY KERNEL — poles, long edges, boundaries, and the measures a
 *  shape has of itself (js/gis-geometry.js `geom-4`, js/geodesy.js `_diskRing`)
 * ----------------------------------------------------------------------------
 *  What was measured wrong before this round, executing the kernel:
 *    ① bufferKm(Point[10,89.9], 50 km) was 5,529 km² (π·50² = 7,854) and pointInGeometry put the
 *      centre and the pole outside it — the disk's 350° edge along the pole was folded the short way;
 *    ② bufferKm(LineString[[0,89],[180,89]], 20 km) was 2,497 km² where the capsule is 10,152 — both
 *      ends were offset on the bearing at the start of an edge whose bearing turns over the pole;
 *    ③ a point on the west edge of box(0,0,10,10) was `within` it and one on the east edge was not;
 *    ④ box(0,0,10,10) and box(10,0,20,10), sharing an edge, were `disjoint`.
 *  And what was missing: bbox, centroid, pointOnSurface, convexHull, simplify (§ ⑤–⑨).
 *
 *  ⚠ EVERY EXPECTED NUMBER IS DERIVED OUTSIDE THE KERNEL — the formula is named beside it — and
 *  every area is measured HERE by an independent spherical-excess sum (Chamberlain–Duquette on the
 *  ring as written), not by the kernel and not by js/gis-ops.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/geo-shared.mjs';

const w = installWindow();
const { makeGisGeometry } = await import('../js/gis-geometry.js');
const G = makeGisGeometry();
w.IntMapGisGeometry = G;
assert.equal(await G.ready(), true, 'the sweep line did not load');

const R = 6371.0088;                                        /* js/geodesy.js _R_EARTH_KM — the app's one radius */
const D2R = Math.PI / 180;
const pt = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const line = (c) => ({ type: 'LineString', coordinates: c });
const poly = (...rings) => ({ type: 'Polygon', coordinates: rings });
const box = (w0, s, e, n) => [[w0, s], [e, s], [e, n], [w0, n], [w0, s]];
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

/* Spherical area of one ring (Chamberlain & Duquette 2007, "Some algorithms for polygons on a
   sphere"): A = R²/2 · |Σ (λᵢ₊₁ − λᵢ₋₁) sin φᵢ|, longitudes made continuous step by step. Holes
   subtract. Independent of the kernel: it reads the coordinates as written. */
function ringArea(ring) {
  const pts = ring.slice(0, -1).map((p) => p.slice());
  for (let i = 1; i < pts.length; i++) { while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360; while (pts[i - 1][0] - pts[i][0] > 180) pts[i][0] += 360; }
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) s += (pts[(i + 1) % n][0] - pts[(i - 1 + n) % n][0]) * D2R * Math.sin(pts[i][1] * D2R);
  return Math.abs(s) * R * R / 2;
}
function areaOf(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let a = 0;
  for (const rings of polys) rings.forEach((r, i) => { a += (i ? -1 : 1) * ringArea(r); });
  return a;
}
/* A spherical cap of angular radius δ: 2πR²(1 − cos δ). */
const cap = (km) => 2 * Math.PI * R * R * (1 - Math.cos(km / R));
/* The set within δ of a great-circle arc of angle L: two zones of the sphere 2·R²·L·sin δ (the area
   between a great circle and its parallel small circle at δ is R²·L·sin δ per unit of arc) plus the
   two half-caps at the ends, which make one cap. */
const capsule = (Lrad, km) => 2 * R * R * Lrad * Math.sin(km / R) + cap(km);
const gcAngle = (a, b) => {
  const [l1, p1] = [a[0] * D2R, a[1] * D2R], [l2, p2] = [b[0] * D2R, b[1] * D2R];
  return 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
};
/* The inscribed n-gon of a circle has n·sin(2π/n)/(2π) of its area — the stated direction of the
   kernel's error (r·(1−cos(π/n)) inside the true boundary). */
const inscribed = (n) => n * Math.sin(2 * Math.PI / n) / (2 * Math.PI);

/* ══ ① a disk that holds a pole is a cap ═══════════════════════════════════════════════════════ */

test('① a 50 km buffer round a point at or near a pole has the cap area, and holds the centre and the pole', () => {
  for (const c of [[10, 89.8], [10, 89.9], [10, 89.99], [10, 90], [-170, -89.9], [179.9, 89.9], [-179.95, -89.95]]) {
    const g = G.bufferKm(pt(c[0], c[1]), 50, 128);
    assert.ok(g, 'no buffer at ' + c);
    const a = areaOf(g), want = cap(50);
    /* inscribed 128-gon: 0.04 % under; the lon/lat chords near the pole may sit a hair outside. */
    assert.ok(a >= want * inscribed(128) * 0.9995 && a <= want * 1.0005, `area at ${c}: ${a.toFixed(1)} km², cap ${want.toFixed(1)}`);
    assert.equal(G.pointInGeometry(c, g), true, 'the centre is outside its own buffer at ' + c);
    const pole = [c[0], c[1] > 0 ? 90 : -90];
    assert.equal(G.pointInGeometry(pole, g), true, 'the pole is outside a buffer that holds it at ' + c);
    assert.equal(G.within(pt(...pole), g), true, 'the pole is not within (DE-9IM) at ' + c);
    assert.equal(G.validate(g).value.valid, true, 'the cap is not a valid geometry at ' + c);
    const b = G.bbox(g);
    assert.deepEqual([b[0], b[2]], [-180, 180], 'a cap goes all the way round: ' + b);
    assert.equal(b[3] === 90 || b[1] === -90, true, 'the cap reaches the pole: ' + b);
  }
});

test('① 500 km at 89°N and 15,000 km (both poles) are the caps they are', () => {
  const a1 = areaOf(G.bufferKm(pt(0, 89), 500, 96));
  assert.ok(rel(a1, cap(500)) < 1e-3, '500 km at 89°N: ' + a1);
  const g2 = G.bufferKm(pt(0, 0), 15000, 256);
  assert.ok(rel(areaOf(g2), cap(15000)) < 1e-3, '15,000 km: ' + areaOf(g2) + ' vs ' + cap(15000));
  assert.equal(G.pointInGeometry([0, 90], g2), true);
  assert.equal(G.pointInGeometry([180, 0], g2), false, 'the antipode is inside a disk that leaves it out');
});

test('① the map\'s disk (js/geodesy.js) is one walk with the kernel\'s — and is drawable at the pole', () => {
  const D = w.IntMapGeodesy;
  const r = D._diskRing([0, 90], 100, 64);
  assert.equal(r.north, true);
  for (const p of r.ring) assert.ok(Math.abs(p[1] - (90 - 100 / R / D2R)) < 1e-9, 'a disk centred on the pole is not one parallel: ' + p);
  const first = r.ring[0], last = r.ring[r.ring.length - 1];
  assert.equal(Math.abs(last[0] - first[0]), 360, 'a ring round the pole closes one turn over');
  for (const poly0 of D.diskFillPolys([0, 90], 100, 64)) for (const ring of poly0) for (const p of ring) assert.ok(p[1] <= 89.9999 && p[0] >= -180 && p[0] <= 180, 'the map still gets its clamped window: ' + p);
});

/* ══ ② long and high-latitude edges ═══════════════════════════════════════════════════════════ */

test('② a line buffer is the capsule of its great-circle edges — over the pole, across the seam, on the equator', () => {
  const cases = [
    [[0, 89], [180, 89]],          /* 222 km over the pole */
    [[0, 89], [90, 89]],
    [[0, 85], [10, 85]],
    [[0, 89], [0, 89.9]],
    [[179.5, 0], [-179.5, 0]],     /* across ±180 */
    [[0, 0], [60, 0]],             /* 6,672 km */
    [[-30, 10], [40, 55]],         /* long and oblique: the bearing turns along it */
  ];
  for (const c of cases) {
    const g = G.bufferKm(line(c), 20, 64);
    const want = capsule(gcAngle(c[0], c[1]), 20);
    const a = areaOf(g);
    assert.ok(a <= want * 1.0005 && a >= want * inscribed(64) * 0.999, `${JSON.stringify(c)}: ${a.toFixed(1)} km², capsule ${want.toFixed(1)}`);
    assert.equal(G.validate(g).value.valid, true);
  }
  /* the arc over the pole contains the pole */
  assert.equal(G.pointInGeometry([45, 90], G.bufferKm(line([[0, 89], [180, 89]]), 20, 64)), true);
});

test('② an edge between antipodal positions has no one great circle, and is refused by name', () => {
  const r = G.attempt.bufferKm(line([[0, 0], [180, 0]]), 10);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'edge-antipodal');
});

test('② a ring\'s edges are its lon/lat edges: inward buffers of a band and a cap are the band and cap shrunk', () => {
  /* the band between ±(10° − δ): 2πR²·2 sin(10° − δ) (zone area); no slot at ±180 where the band is cut */
  const d = 50 / R / D2R;
  const band = G.bufferKm(poly(box(-180, -10, 180, 10)), -50, 64);
  assert.ok(rel(areaOf(band), 2 * Math.PI * R * R * 2 * Math.sin((10 - d) * D2R)) < 1e-4, 'inward band: ' + areaOf(band));
  /* the cap north of 80° + δ: 2πR²(1 − sin(80° + δ)); the pole is not a boundary, so no disk is eaten there */
  const cap80 = G.bufferKm(poly(box(-180, 80, 180, 90)), -50, 64);
  assert.ok(rel(areaOf(cap80), 2 * Math.PI * R * R * (1 - Math.sin((80 + d) * D2R))) < 1e-4, 'inward cap: ' + areaOf(cap80));
  assert.equal(G.pointInGeometry([0, 90], cap80), true);
  /* an outward buffer of a high-latitude box adds, exactly: the zone between each parallel and the
     parallel δ beyond it (R²·Δλ·|sin φ₁ − sin φ₀|), a strip of R²·L·sin δ along each meridian (a great
     circle), and four quarter caps at the right-angled corners. The kernel's boundary is within
     r·(1−cos(π/64)) of the true one — inside at the disks, and up to that far outside where a chord
     spans a curved offset (the offset of a meridian is a small circle) — so the difference is bounded
     by that width times the outer perimeter. */
  const b = poly(box(0, 60, 90, 70));
  const out = G.bufferKm(b, 10, 64);
  const dl = 10 / R, quarter = Math.PI / 2;
  const exact = R * R * quarter * (Math.sin(60 * D2R) - Math.sin(60 * D2R - dl)) + R * R * quarter * (Math.sin(70 * D2R + dl) - Math.sin(70 * D2R))
    + 2 * R * R * 10 * D2R * Math.sin(dl) + cap(10);
  const perimeter = (90 * Math.cos(60 * D2R) + 90 * Math.cos(70 * D2R) + 20) * D2R * R + 2 * Math.PI * 10;
  assert.equal(G.contains(out, b), true);
  assert.ok(Math.abs(areaOf(out) - areaOf(b) - exact) <= 10 * (1 - Math.cos(Math.PI / 64)) * perimeter, 'outward 10 km adds ' + (areaOf(out) - areaOf(b)) + ' km², exactly ' + exact);
});

/* ══ ③ ④ the predicates are DE-9IM ═══════════════════════════════════════════════════════════ */

const SQ = poly(box(0, 0, 10, 10));

test('③ a position on the boundary intersects and is not within — on every edge alike', () => {
  for (const p of [[0, 5], [10, 5], [5, 0], [5, 10], [0, 0], [10, 10], [10, 0], [0, 10]]) {
    assert.equal(G.intersects(pt(...p), SQ), true, 'boundary ' + p + ' does not intersect');
    assert.equal(G.within(pt(...p), SQ), false, 'boundary ' + p + ' is within');
    assert.equal(G.contains(SQ, pt(...p)), false);
    assert.equal(G.attempt.within(pt(...p), SQ).value, false);
  }
  assert.equal(G.within(pt(5, 5), SQ), true);
  assert.equal(G.intersects(pt(11, 5), SQ), false);
  /* holes the same: their boundary is the polygon's boundary */
  const donut = poly(box(0, 0, 10, 10), [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]);
  for (const p of [[2, 3], [4, 3], [3, 2], [3, 4]]) assert.deepEqual([G.within(pt(...p), donut), G.intersects(pt(...p), donut)], [false, true], 'hole edge ' + p);
  assert.equal(G.within(pt(3, 3), donut), false);
  assert.equal(G.intersects(pt(3, 3), donut), false);
});

test('④ shapes that touch intersect; containment needs an interior point', () => {
  const E = poly(box(10, 0, 20, 10)), C = poly(box(10, 10, 20, 20));
  assert.deepEqual([G.intersects(SQ, E), G.disjoint(SQ, E), G.contains(SQ, E), G.within(E, SQ)], [true, false, false, false], 'edge-sharing squares');
  assert.deepEqual([G.intersects(SQ, C), G.disjoint(SQ, C)], [true, false], 'corner-touching squares');
  assert.deepEqual([G.intersects(SQ, poly(box(10.001, 0, 20, 10))), G.disjoint(SQ, poly(box(10.001, 0, 20, 10)))], [false, true]);
  assert.equal(G.contains(SQ, poly(box(0, 0, 5, 5))), true, 'a square inside touching the boundary is contained');
  assert.equal(G.contains(SQ, SQ), true);
  assert.equal(G.within(line([[0, 2], [0, 8]]), SQ), false, 'a line along the boundary has no interior point inside');
  assert.equal(G.within(line([[0, 2], [5, 5]]), SQ), true);
  assert.equal(G.within(line([[5, 5], [15, 5]]), SQ), false);
  const notch = poly([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10], [0, 0]]);
  assert.equal(G.within(line([[1, 9], [9, 9]]), notch), false, 'a chord across a notch leaves the shape');
  assert.equal(G.intersects(line([[10, 5], [15, 5]]), SQ), true, 'a line touching from outside');
  assert.equal(G.attempt.distanceKm(SQ, E).value, 0, 'touching shapes are 0 km apart');
});

test('③④ the seam and the pole are not boundaries the sphere has', () => {
  const west = poly(box(170, 0, 180, 10)), east = poly(box(-180, 0, -170, 10));
  assert.equal(G.intersects(west, east), true, 'two halves meeting at ±180');
  const halves = { type: 'MultiPolygon', coordinates: [[box(170, 0, 180, 10)], [box(-180, 0, -170, 10)]] };
  assert.equal(G.within(pt(180, 5), halves), true);
  assert.equal(G.within(pt(-180, 5), halves), true);
  const band = poly(box(-180, -10, 180, 10));
  for (const x of [180, -180, 0]) assert.equal(G.within(pt(x, 0), band), true, 'band at ' + x);
  assert.deepEqual([G.within(pt(50, 10), band), G.intersects(pt(50, 10), band)], [false, true]);
  assert.equal(G.contains(band, line([[170, 0], [-170, 0]])), true);
  assert.equal(G.contains(band, poly([[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]])), true);
  assert.equal(G.intersects(line([[179, 0], [-179, 0]]), line([[180, -1], [180, 1]])), true);
  assert.equal(G.intersects(line([[179, 0], [-179, 0]]), pt(-180, 0)), true);
  assert.equal(G.within(pt(33, 90), poly(box(-180, 80, 180, 90))), true, 'the pole is inside a cap');
  const sector = poly(box(0, 80, 10, 90));
  assert.deepEqual([G.within(pt(5, 90), sector), G.intersects(pt(5, 90), sector)], [false, true], 'the pole is a corner of a sector');
  assert.equal(G.intersects(pt(0, 90), pt(120, 90)), true, 'one pole, two longitudes');
});

test('③ pointInGeometry is the half-open ASSIGNMENT rule, and it partitions', () => {
  /* a 2×2 tiling: every position on the grid lines goes to exactly one tile */
  const tiles = [box(0, 0, 5, 5), box(5, 0, 10, 5), box(0, 5, 5, 10), box(5, 5, 10, 10)].map((r) => poly(r));
  for (let x = 0; x <= 10; x += 2.5) for (let y = 0; y <= 10; y += 2.5) {
    const n = tiles.filter((t) => G.pointInGeometry([x, y], t)).length;
    const inner = x < 10 && y < 10;
    assert.equal(n, inner ? 1 : 0, `[${x},${y}] is in ${n} tiles`);
  }
  /* a polygon and the island that fills its hole */
  const donut = poly(box(0, 0, 10, 10), [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]), island = poly(box(2, 2, 4, 4));
  for (const p of [[2, 3], [4, 3], [3, 2], [3, 4], [2, 2], [4, 4], [4, 2], [2, 4]]) {
    assert.equal(Number(G.pointInGeometry(p, donut)) + Number(G.pointInGeometry(p, island)), 1, 'hole edge ' + p);
  }
  /* the two halves of a shape cut at ±180, whichever way the seam is spelled */
  for (const x of [180, -180]) {
    assert.equal(Number(G.pointInGeometry([x, 5], poly(box(170, 0, 180, 10)))) + Number(G.pointInGeometry([x, 5], poly(box(-180, 0, -170, 10)))), 1, 'seam ' + x);
  }
  /* a pie of 36 sectors round the pole: the pole, at any longitude, is in exactly one */
  const pie = [];
  for (let i = 0; i < 36; i++) pie.push(poly(box(-180 + 10 * i, 80, -170 + 10 * i, 90)));
  for (const lon of [-180, -175, 0, 33, 179.5]) assert.equal(pie.filter((s) => G.pointInGeometry([lon, 90], s)).length, 1, 'pole at ' + lon);
});

/* ══ ⑤ bbox ═══════════════════════════════════════════════════════════════════════════════════ */

test('⑤ bbox is the smallest arc of longitude, w > e across the antimeridian (RFC 7946 §5.2)', () => {
  assert.deepEqual(G.bbox(SQ), [0, 0, 10, 10]);
  assert.deepEqual(G.bbox(poly([[170, -1], [-170, -1], [-170, 1], [170, 1], [170, -1]])), [170, -1, -170, 1]);
  assert.deepEqual(G.bbox({ type: 'MultiPolygon', coordinates: [[box(170, 0, 180, 10)], [box(-180, 0, -170, 10)]] }), [170, 0, -170, 10]);
  assert.deepEqual(G.bbox({ type: 'MultiPoint', coordinates: [[179, 0], [-179, 1]] }), [179, 0, -179, 1]);
  assert.deepEqual(G.bbox(line([[170, 0], [-170, 5]])), [170, 0, -170, 5]);
  assert.deepEqual(G.bbox(poly(box(-180, -10, 180, 10))), [-180, -10, 180, 10]);
  /* 340° wide without crossing the seam is NOT the world */
  assert.deepEqual(G.bbox(poly([[-170, 0], [-60, 0], [60, 0], [170, 0], [170, 5], [60, 5], [-60, 5], [-170, 5], [-170, 0]])), [-170, 0, 170, 5]);
  assert.deepEqual(G.bbox({ type: 'GeometryCollection', geometries: [pt(10, 1), pt(-20, 2)] }), [-20, 1, 10, 2]);
  assert.equal(G.bbox({ type: 'MultiPoint', coordinates: [] }), null);
  assert.equal(G.attempt.bbox(null).why, 'missing-geometry');
});

/* ══ ⑥ centroid ═══════════════════════════════════════════════════════════════════════════════ */

/* The area-weighted mean of the unit vector over a lon/lat box, by a 400×400 midpoint rule with
   dA = cos φ dλ dφ — independent of the kernel's closed form. */
function boxCentroid(w0, s, e, n) {
  let x = 0, y = 0, z = 0;
  const N = 400;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const lo = (w0 + (e - w0) * (i + 0.5) / N) * D2R, la = (s + (n - s) * (j + 0.5) / N) * D2R, c = Math.cos(la);
    x += c * c * Math.cos(lo); y += c * c * Math.sin(lo); z += c * Math.sin(la);
  }
  return [Math.atan2(y, x) / D2R, Math.atan2(z, Math.hypot(x, y)) / D2R];
}

test('⑥ centroid: area-weighted on the sphere, across the seam, refused where it has no direction', () => {
  const c = G.centroid(poly(box(0, 0, 10, 10))).coordinates, want = boxCentroid(0, 0, 10, 10);
  assert.ok(Math.abs(c[0] - want[0]) < 1e-4 && Math.abs(c[1] - want[1]) < 1e-4, c + ' vs ' + want);
  const hi = G.centroid(poly(box(20, 50, 40, 70))).coordinates, wantHi = boxCentroid(20, 50, 40, 70);
  assert.ok(Math.abs(hi[0] - wantHi[0]) < 1e-4 && Math.abs(hi[1] - wantHi[1]) < 1e-4, hi + ' vs ' + wantHi);
  /* symmetric about 180°E and the equator ⇒ [180, 0] (by symmetry) */
  const seam = G.centroid(poly([[179, -1], [-179, -1], [-179, 1], [179, 1], [179, -1]])).coordinates;
  assert.ok(Math.abs(Math.abs(seam[0]) - 180) < 1e-9 && Math.abs(seam[1]) < 1e-9, 'seam: ' + seam);
  const halves = G.centroid({ type: 'MultiPolygon', coordinates: [[box(179, -1, 180, 1)], [box(-180, -1, -179, 1)]] }).coordinates;
  assert.ok(Math.abs(Math.abs(halves[0]) - 180) < 1e-9 && Math.abs(halves[1]) < 1e-9, 'halves: ' + halves);
  /* a hole subtracts: a frame symmetric about its middle has its centroid there (by symmetry in λ) */
  const frame = G.centroid(poly(box(0, 0, 10, 10), [[2, 2], [2, 8], [8, 8], [8, 2], [2, 2]])).coordinates;
  assert.ok(Math.abs(frame[0] - 5) < 1e-9, 'frame: ' + frame);
  const solidMinusHole = boxCentroid(0, 0, 10, 10);
  assert.ok(frame[1] < solidMinusHole[1] + 0.5 && frame[1] > 4.5, 'frame lat: ' + frame);
  /* lines: length-weighted along great circles — an equatorial and a meridian line by symmetry */
  assert.ok(Math.abs(G.centroid(line([[0, 0], [60, 0]])).coordinates[0] - 30) < 1e-9);
  const mer = G.centroid(line([[0, 0], [0, 60]])).coordinates;
  assert.ok(Math.abs(mer[1] - 30) < 1e-9 && Math.abs(mer[0]) < 1e-9, 'meridian: ' + mer);
  /* points: unit-vector mean */
  const ps = G.centroid({ type: 'MultiPoint', coordinates: [[179, 0], [-179, 0]] }).coordinates;
  assert.ok(Math.abs(Math.abs(ps[0]) - 180) < 1e-9, 'points across the seam: ' + ps);
  /* the highest dimension present decides */
  const mixed = G.attempt.centroid({ type: 'GeometryCollection', geometries: [pt(100, 50), poly(box(0, 0, 10, 10))] });
  assert.equal(mixed.dimension, 2);
  assert.deepEqual(mixed.geometry.coordinates, G.centroid(poly(box(0, 0, 10, 10))).coordinates);
  /* a cap's centroid is its pole */
  assert.equal(G.centroid(poly(box(-180, 80, 180, 90))).coordinates[1], 90);
  /* refusals */
  assert.equal(G.attempt.centroid({ type: 'MultiPoint', coordinates: [[0, 0], [180, 0]] }).why, 'centroid-undefined');
  assert.equal(G.attempt.centroid(poly(box(-180, -10, 180, 10))).why, 'centroid-undefined', 'a band symmetric about the equator');
  assert.equal(G.attempt.centroid({ type: 'MultiPoint', coordinates: [] }).why, 'geometry-empty');
});

/* ══ ⑦ pointOnSurface ═════════════════════════════════════════════════════════════════════════ */

test('⑦ pointOnSurface is inside areas (C-shapes, holes, the seam, a cap), on lines, a member of points', () => {
  const C = poly([[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]);
  const donut = poly(box(0, 0, 10, 10), [[1, 1], [1, 9], [9, 9], [9, 1], [1, 1]]);
  const seam = poly([[179, -1], [-179, -1], [-179, 1], [179, 1], [179, -1]]);
  const polar = G.bufferKm(pt(10, 89.9), 50, 64);
  for (const g of [C, donut, seam, polar, poly(box(-180, 80, 180, 90))]) {
    const p = G.pointOnSurface(g).coordinates;
    assert.equal(G.pointInGeometry(p, g), true, 'outside: ' + p);
    assert.equal(G.within(pt(...p), g), true, 'not within: ' + p);
    assert.ok(p[0] >= -180 && p[0] <= 180);
  }
  /* the centroid of the C is in its gap — the reason this door exists */
  assert.equal(G.pointInGeometry(G.centroid(C).coordinates, C), false);
  const L = line([[0, 0], [5, 1], [10, 0]]);
  assert.deepEqual(G.pointOnSurface(L).coordinates, [5, 1]);
  assert.equal(G.intersects(G.pointOnSurface(line([[0, 0], [10, 0]])), line([[0, 0], [10, 0]])), true);
  const mp = { type: 'MultiPoint', coordinates: [[0, 0], [1, 0], [50, 0]] };
  assert.ok(mp.coordinates.some((q) => q[0] === G.pointOnSurface(mp).coordinates[0]));
});

/* ══ ⑧ convexHull ═════════════════════════════════════════════════════════════════════════════ */

/* Area of a spherical polygon by Eriksson's triangle formula, fanned from vertex 0:
   tan(E/2) = |a·(b×c)| / (1 + a·b + b·c + c·a). */
function sphPolyArea(lonlats) {
  const v = lonlats.map(([lo, la]) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let E = 0;
  for (let i = 1; i + 1 < v.length; i++) { const a = v[0], b = v[i], c = v[i + 1]; E += 2 * Math.atan2(Math.abs(dot(a, cross(b, c))), 1 + dot(a, b) + dot(b, c) + dot(c, a)); }
  return E * R * R;
}

test('⑧ convexHull is the spherical hull — its edges are great circles, across the seam and round a pole', () => {
  const mp = { type: 'MultiPoint', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [2, 7]] };
  const h = G.attempt.convexHull(mp);
  assert.equal(h.ok, true);
  assert.equal(h.vertices, 4);
  for (const p of mp.coordinates) assert.equal(G.intersects(pt(...p), h.geometry), true, 'hull leaves out ' + p);
  /* the great circle from (10,10) to (0,10) peaks at atan(tan 10° / cos 5°) — north of the parallel
     a lon/lat box would draw; a point just under that peak is in the hull and not in the box */
  const peak = Math.atan(Math.tan(10 * D2R) / Math.cos(5 * D2R)) / D2R;
  assert.equal(G.pointInGeometry([5, peak - 0.005], h.geometry), true, 'the hull is not spherical');
  assert.ok(rel(areaOf(h.geometry), sphPolyArea([[0, 0], [10, 0], [10, 10], [0, 10]])) < 5e-3);
  /* across the seam */
  const s = G.attempt.convexHull({ type: 'MultiPoint', coordinates: [[179, 0], [-179, 0], [-179, 2], [179, 2], [180, 1]] });
  assert.ok(rel(areaOf(s.geometry), sphPolyArea([[179, 0], [181, 0], [181, 2], [179, 2]])) < 5e-3, 'seam hull ' + areaOf(s.geometry));
  /* round a pole: closed along the pole, the pole inside */
  const p = G.attempt.convexHull({ type: 'MultiPoint', coordinates: [[0, 80], [90, 80], [180, 80], [-90, 80]] });
  assert.equal(G.pointInGeometry([0, 90], p.geometry), true);
  assert.ok(rel(areaOf(p.geometry), sphPolyArea([[0, 80], [90, 80], [180, 80], [-90, 80]])) < 1e-2, 'polar hull ' + areaOf(p.geometry));
  /* not in an open hemisphere ⇒ refused, by name */
  assert.equal(G.attempt.convexHull({ type: 'MultiPoint', coordinates: [[0, 0], [120, 0], [-120, 0], [0, 10]] }).why, 'hull-not-in-hemisphere');
  assert.equal(G.attempt.convexHull({ type: 'MultiPoint', coordinates: [[0, 0], [180, 0]] }).why, 'hull-not-in-hemisphere');
  /* degenerate input answers in its own dimension */
  assert.deepEqual(G.convexHull({ type: 'MultiPoint', coordinates: [[0, 0], [10, 0], [5, 0]] }), { type: 'LineString', coordinates: [[0, 0], [10, 0]] });
  assert.deepEqual(G.convexHull(pt(1, 2)), { type: 'Point', coordinates: [1, 2] });
  /* a concave polygon's hull covers it */
  const notch = poly([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10], [0, 0]]);
  assert.equal(G.contains(G.convexHull(notch), notch), true);
});

/* ══ ⑨ simplify ═══════════════════════════════════════════════════════════════════════════════ */

test('⑨ simplify: Douglas–Peucker in km, positions kept not moved, always valid, backed off where it must be', () => {
  const ring = [];
  for (let i = 0; i < 360; i += 2) ring.push([Math.cos(i * D2R) * 5 + ((i % 4) ? 0.01 : 0), Math.sin(i * D2R) * 5]);
  ring.push(ring[0]);
  const g = poly(ring);
  const r = G.attempt.simplify(g, 20);
  assert.equal(r.ok, true);
  assert.equal(r.topology, 'per-feature');
  assert.equal(r.positionsBefore, 181);
  assert.ok(r.positionsAfter < 40 && r.positionsAfter >= 4, 'after ' + r.positionsAfter);
  assert.equal(G.validate(r.geometry).value.valid, true);
  const given = new Set(ring.map((p) => p.join(',')));
  for (const p of r.geometry.coordinates[0]) assert.ok(given.has(p.join(',')), 'a position moved: ' + p);
  /* every dropped position is within the tolerance of the simplified boundary (the DP guarantee) */
  const outline = line(r.geometry.coordinates[0]);
  for (const p of ring) assert.ok(G.distanceKm(pt(...p), outline) <= 20 + 1e-6, 'dropped ' + p + ' is ' + G.distanceKm(pt(...p), outline) + ' km away');
  /* a ring keeps at least four positions */
  const tiny = G.simplify(g, 5000);
  assert.ok(tiny.coordinates[0].length >= 4);
  assert.equal(G.validate(tiny).value.valid, true);
  /* across the seam: the 11 m kink is dropped, the ring is the same 2°×1° box */
  const s = G.simplify(poly([[179, 0], [179.5, 0.0001], [-179, 0], [-179, 1], [179, 1], [179, 0]]), 1);
  assert.deepEqual(s.coordinates[0], [[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]);
  /* lines keep their ends */
  assert.deepEqual(G.simplify(line([[0, 0], [1, 0.001], [2, 0], [3, 0.5], [4, 0]]), 1).coordinates, [[0, 0], [2, 0], [3, 0.5], [4, 0]]);
  /* a hole in a bump of the shell: dropping the bump would leave the hole outside — the shell backs off */
  const bump = poly([[0, 0], [10, 0], [10, 10], [5, 10.5], [0, 10], [0, 0]], [[4.9, 10.1], [5, 10.3], [5.1, 10.1], [4.9, 10.1]]);
  const b = G.attempt.simplify(bump, 100);
  assert.equal(b.ok, true);
  assert.equal(G.validate(b.geometry).value.valid, true);
  assert.ok(b.ringsBackedOff >= 1, 'nothing was backed off');
  assert.ok(b.geometry.coordinates[0].some((p) => p[0] === 5 && p[1] === 10.5), 'the bump holding the hole was dropped');
  /* refusals */
  assert.equal(G.attempt.simplify(poly([[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]), 1).why, 'geometry-invalid');
  assert.equal(G.attempt.simplify(g, -1).why, 'bad-tolerance');
});

/* ══ the door ═════════════════════════════════════════════════════════════════════════════════ */

test('the kernel version is geom-4, and the new measures travel to the worker except simplify (km needs the radius)', () => {
  assert.equal(G.version(), 'geom-4');
  const travels = G.worker.ops();
  for (const op of ['bbox', 'centroid', 'pointOnSurface', 'convexHull']) assert.ok(travels.includes(op), op + ' does not travel');
  assert.ok(!travels.includes('simplify'));
  assert.deepEqual(G.requires('simplify'), ['geodesy']);
});
