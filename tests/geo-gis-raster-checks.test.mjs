/* ============================================================================
 *  GIS · GRIDS — 再投影（warp）・区域集計の規則・画素の被覆
 * ----------------------------------------------------------------------------
 *  Grid arithmetic that has to be right to the pixel: the warp (identity, UTM, rotated affines, voids,
 *  no default interpolation, classes, geodesic pixel size), the zonal rules (center / allTouched /
 *  fractional), and the fractional cover of a pixel by a zone — including the notches and holes no
 *  sample point touches.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R749 · the warp   (was tests/r749-gis-warp-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R749 · ラスターの warp — 既知の解と、warp の外から導いた数に照らす
 * ----------------------------------------------------------------------------
 *  js/gis-warp.js claims to do what GDAL's warp does — coordinate system, resolution, extent,
 *  resampling and NoData in one layer — and every one of those claims can be wrong while producing
 *  a picture that looks like a map. So what is measured here:
 *
 *    ① an identity warp MOVES NOTHING. Same grid, same pixel size, same values, bit for bit.
 *    ② a projected grid lands where the projection says it lands, checked pixel by pixel against
 *       the affine arithmetic written out HERE, and the two point doors are each other's inverse
 *    ②b the general (rotated) affine inverse is exact — a 90°-rotated grid transposes and nothing
 *       is smeared
 *    ③ A VOID DOES NOT GROW. One NaN pixel warped with bilinear is still one NaN pixel, and the
 *       report says how many samples fell back to nearest because of it
 *    ④ `method` has no default. A caller that did not say gets nothing, not 'nearest'
 *    ⑤ `align` has no default rule either, and two grids that do not overlap are refused by name
 *    ⑥ a band whose producer declared it categorical is not interpolated
 *    ⑦ at 70°N an output pixel is still the size of an input pixel ON THE GROUND — measured with a
 *       great-circle distance, not with degrees
 *    ⑧ the run can be stopped, and reports where it got to
 *
 *  ⚠ THE REFERENCES SIT OUTSIDE THE THING MEASURED. Nothing below asks js/gis-warp.js what the
 *  answer should be: ② and ②b compute the source pixel from the forward affine as it is DEFINED in
 *  that file's header (x = c + a·px + b·py), ⑦ measures with haversine written out from the radius
 *  js/geodesy.js publishes, and ③'s expectation is a count of pixels, not a report field compared
 *  with itself. A warp validated by its own arithmetic is two readers of one wrong rule agreeing
 *  (tests/r743 says the same about the prefilter).
 * ==========================================================================*/
describe('§ #R749 · the warp', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisWarp } = await import('../js/gis-warp.js');
    const raster = makeGisRaster();
    const crs = makeGisCrs();
    const warp = makeGisWarp();
    w.IntMapGisRaster = raster; w.IntMapGisCrs = crs; w.IntMapGisWarp = warp;
    await crs.ready();
    return { w, raster, crs, warp };
  }

  /* ── the grids under test, built from a stated function of position ─────────────────────────── */

  /* A north-up EPSG:4326 grid stated the way docs/GIS-CORE.md §1.4 states one. */
  function degreeGrid(o) {
    const { west, north, pixelLng, pixelLat, width, height } = o;
    const data = new Float64Array(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const lng = west + pixelLng * (c + 0.5);
        const lat = north - pixelLat * (r + 0.5);
        data[r * width + c] = o.value(lng, lat, c, r);
      }
    }
    return {
      width, height,
      crs: o.crs || 'EPSG:4326',
      bands: [Object.assign({ name: 'v', unit: null, nodata: null }, o.band || {})],
      grid: { west, north, pixelLng, pixelLat },
      read: (i) => ((i == null || i === 0) ? data : null),
      _data: data,
    };
  }

  /* A grid stated by its GeoTransform, which is what a decoded GeoTIFF has. */
  function affineGrid(o) {
    const { affine, width, height } = o;
    const data = new Float64Array(width * height);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = o.value(c, r);
    return {
      width, height,
      crs: o.crs,
      bands: [Object.assign({ name: 'v', unit: null, nodata: null }, o.band || {})],
      affine: affine.slice(),
      read: (i) => ((i == null || i === 0) ? data : null),
      _data: data,
    };
  }

  /* THE FORWARD AFFINE, as js/gis-warp.js's header DEFINES it (GDAL GeoTransform order). Written out
     here so every expectation below is derived from the definition rather than from the module's own
     inverse — which is the half of the arithmetic that can be wrong on its own. */
  const fwd = (A, px, py) => [A[0] + A[1] * px + A[2] * py, A[3] + A[4] * px + A[5] * py];

  /* Great-circle distance from the radius js/geodesy.js publishes — ⑦'s reference, and it has never
     heard of a pixel. */
  function haversineKm(R, a, b) {
    const d2r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * d2r, dLon = (b[0] - a[0]) * d2r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  const valueAt = (g, col, row) => g.read(0)[row * g.width + col];

  /* ── ① ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ① an identity warp moves nothing — same grid, same pixels, same values', async () => {
    const { warp } = await boot();
    /* A KNOWN SOLUTION: the value of a pixel is a function of where it is, so a shifted, rescaled or
       transposed output is visible in the numbers and not only in the header. */
    const src = degreeGrid({
      west: 130, north: 36, pixelLng: 0.25, pixelLat: 0.25, width: 24, height: 16,
      value: (lng, lat) => lng * 100 + lat,
    });

    const r = await warp.to4326(src, { method: 'nearest' });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.report.width, 24);
    assert.equal(r.report.height, 16);
    assert.equal(r.report.pixelLng, 0.25);
    assert.equal(r.report.pixelLat, 0.25);
    assert.equal(r.report.west, 130);
    assert.equal(r.report.north, 36);
    assert.equal(r.report.clipped, 0);
    assert.equal(r.report.failed, 0);
    assert.equal(r.report.missing, 0);
    assert.equal(r.report.partial, 0);
    assert.equal(r.report.filled, 24 * 16);
    assert.equal(r.report.from, 'EPSG:4326');
    assert.equal(r.report.to, 'EPSG:4326');

    const out = r.grid.read(0);
    for (let i = 0; i < 24 * 16; i++) {
      assert.equal(out[i], src._data[i], 'pixel ' + i + ' moved');
    }

    /* bilinear at exact pixel centres is the same answer to within float noise — and it must not be
       reported as a fallback, because nothing here is missing. */
    const b = await warp.to4326(src, { method: 'bilinear' });
    assert.equal(b.ok, true, b.why);
    const ob = b.grid.read(0);
    for (let i = 0; i < 24 * 16; i++) assert.ok(Math.abs(ob[i] - src._data[i]) < 1e-9, 'bilinear moved pixel ' + i);
    assert.equal(b.report.missing, 0);
  });

  /* ── ② ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ② a UTM grid lands where the projection says, and the two point doors invert each other', async () => {
    const { crs, warp } = await boot();
    /* EPSG:32654 — WGS 84 / UTM zone 54N, central meridian 141°E, which is where this app's Japanese
       sources are. 1 km pixels, north-up, so the source column and row are floor arithmetic below. */
    const A = [300000, 1000, 0, 3900000, 0, -1000];
    const W = 40, H = 30;
    const src = affineGrid({ affine: A, width: W, height: H, crs: 'EPSG:32654', value: (c, r) => c * 1000 + r });

    const r = await warp.to4326(src, { method: 'nearest' });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.report.from, 'EPSG:32654');
    assert.equal(r.report.to, 'EPSG:4326');
    /* A degree grid at 35°N is wider than it is tall per pixel: cos φ is why, and a warp that had
       produced a square degree pixel would have ignored the projection. */
    assert.ok(r.report.pixelLng > r.report.pixelLat, 'pixel is not wider in longitude than in latitude');

    const G = r.grid.grid, out = r.grid.read(0);
    let inside = 0, outside = 0;
    const check = (col, row) => {
      const lng = G.west + G.pixelLng * (col + 0.5);
      const lat = G.north - G.pixelLat * (row + 0.5);
      /* THE REFERENCE: 4326 → the source CRS with the point door, then the source pixel from the
         forward affine's own definition (north-up here, so a − and a ÷). Nothing from js/gis-warp.js. */
      const xy = crs.fromWgs84(lng, lat, 'EPSG:32654');
      assert.ok(xy, 'fromWgs84 refused: ' + crs.why());
      const sc = Math.floor((xy[0] - A[0]) / A[1]);
      const sr = Math.floor((A[3] - xy[1]) / -A[5]);
      const got = out[row * r.grid.width + col];
      if (sc >= 0 && sc < W && sr >= 0 && sr < H) {
        inside++;
        assert.equal(got, valueAt(src, sc, sr), 'output pixel ' + col + ',' + row + ' holds the wrong source pixel');
      } else {
        outside++;
        assert.ok(Number.isNaN(got), 'output pixel ' + col + ',' + row + ' is outside the source and is not missing');
      }
      /* AND THE TWO DOORS ARE EACH OTHER'S INVERSE: back through toWgs84 lands on the degree pair we
         started from. A one-way transform can be wrong in a way a one-way test cannot see. */
      const ll = crs.toWgs84(xy[0], xy[1], 'EPSG:32654');
      assert.ok(ll, 'toWgs84 refused: ' + crs.why());
      assert.ok(Math.abs(ll[0] - lng) < 1e-9 && Math.abs(ll[1] - lat) < 1e-9, 'round trip moved the position');
    };
    /* the four corners and the centre of the OUTPUT grid */
    check(0, 0); check(r.grid.width - 1, 0); check(0, r.grid.height - 1);
    check(r.grid.width - 1, r.grid.height - 1); check(r.grid.width >> 1, r.grid.height >> 1);
    assert.ok(inside >= 1, 'no probe landed on the source at all');

    /* The corners of a projected tile are NOT all inside its 4326 bounding box — that is the whole
       reason `clipped` is a counted field — so the run must have found some of both. */
    assert.ok(r.report.filled > 0 && r.report.clipped > 0, 'a rotated source produced no clipped pixels at all');
    assert.equal(r.report.filled + r.report.clipped + r.report.missing + r.report.failed, r.report.cells);
  });

  test('R749 ②b the general affine inverse is exact — a 90°-rotated grid transposes', async () => {
    const { warp } = await boot();
    /* Rotation terms only: x = west + p·py, y = north − p·px. So the source's COLUMNS run south and
       its ROWS run east — the case a north-up short cut would get silently wrong. */
    const p = 0.5, west = 10, north = 50, W = 6, H = 9;
    const A = [west, 0, p, north, -p, 0];
    const src = affineGrid({ affine: A, width: W, height: H, crs: 'EPSG:4326', value: (c, r) => c * 100 + r });

    const r = await warp.to4326(src, { method: 'nearest' });
    assert.equal(r.ok, true, r.why);
    /* The extent follows from the forward affine: px ∈ [0,W] → lat ∈ [north − pW, north];
       py ∈ [0,H] → lng ∈ [west, west + pH]. So the output is H wide and W tall. */
    assert.equal(r.grid.width, H);
    assert.equal(r.grid.height, W);
    assert.equal(r.report.pixelLng, p);
    assert.equal(r.report.pixelLat, p);
    assert.equal(r.report.clipped, 0);
    assert.equal(r.report.missing, 0);

    const G = r.grid.grid, out = r.grid.read(0);
    for (let row = 0; row < r.grid.height; row++) {
      for (let col = 0; col < r.grid.width; col++) {
        const lng = G.west + G.pixelLng * (col + 0.5);
        const lat = G.north - G.pixelLat * (row + 0.5);
        /* Solve the forward affine for (px, py) by hand — two independent equations, no matrix. */
        const py = (lng - A[0]) / A[2];
        const px = (lat - A[3]) / A[4];
        const sc = Math.floor(px), sr = Math.floor(py);
        assert.equal(out[row * r.grid.width + col], valueAt(src, sc, sr), 'transpose lost ' + col + ',' + row);
        /* and the forward affine agrees with where we think that pixel is */
        const xy = fwd(A, sc + 0.5, sr + 0.5);
        assert.ok(Math.abs(xy[0] - lng) < 1e-9 && Math.abs(xy[1] - lat) < 1e-9);
      }
    }
  });

  /* ── ③ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ③ a void does not grow — bilinear falls back to nearest and says so', async () => {
    const { warp } = await boot();
    const W = 9, H = 9, HOLE_C = 4, HOLE_R = 4;
    const src = degreeGrid({
      west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: W, height: H,
      value: (lng, lat, c, r) => ((c === HOLE_C && r === HOLE_R) ? NaN : c * 10 + r),
    });

    const b = await warp.to4326(src, { method: 'bilinear' });
    assert.equal(b.ok, true, b.why);
    const ob = b.grid.read(0);
    let nan = 0;
    for (let i = 0; i < W * H; i++) if (Number.isNaN(ob[i])) nan++;
    /* ⚠ THIS IS THE MEASUREMENT. A bilinear blend that averaged the void with its neighbours would
       have produced FOUR NaN pixels (or, worse, four plausible numbers polluted by it). One void in,
       one void out. */
    assert.equal(nan, 1, 'the void spread to ' + nan + ' pixels');
    assert.equal(b.report.missing, 1);
    /* and the fallback is REPORTED, so a reader who needs an uncontaminated interpolation can tell
       which samples are not one */
    assert.ok(b.report.partial >= 4, 'the nearest fallback was not counted (partial=' + b.report.partial + ')');
    assert.equal(b.report.filled, W * H - 1);

    const n = await warp.to4326(src, { method: 'nearest' });
    assert.equal(n.ok, true, n.why);
    const on = n.grid.read(0);
    let nan2 = 0;
    for (let i = 0; i < W * H; i++) if (Number.isNaN(on[i])) nan2++;
    assert.equal(nan2, 1);
    /* nearest never interpolates, so it can never fall back */
    assert.equal(n.report.partial, 0);

    /* A DECLARED SENTINEL IS A VOID TOO, and it must not survive into the output as a number. */
    const sent = degreeGrid({
      west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: W, height: H,
      band: { nodata: -9999 },
      value: (lng, lat, c, r) => ((c === HOLE_C && r === HOLE_R) ? -9999 : c * 10 + r),
    });
    const s = await warp.to4326(sent, { method: 'bilinear' });
    assert.equal(s.ok, true, s.why);
    const os = s.grid.read(0);
    let seen = 0, nan3 = 0;
    for (let i = 0; i < W * H; i++) { if (os[i] === -9999) seen++; if (Number.isNaN(os[i])) nan3++; }
    assert.equal(seen, 0, 'the sentinel was carried into the output as a value');
    assert.equal(nan3, 1);
    /* the output declares NO sentinel, because it writes NaN and never -9999 */
    assert.equal(s.grid.bands[0].nodata, null);
  });

  /* ── ④ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ④ `method` has no default — an unstated interpolation produces nothing', async () => {
    const { warp, raster } = await boot();
    const src = degreeGrid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 4, value: () => 1 });

    for (const opts of [undefined, {}, { method: '' }, { method: null }]) {
      const r = await warp.to4326(src, opts);
      assert.equal(r.ok, false, 'a warp with no stated method succeeded');
      assert.equal(r.why, 'resample-method-not-stated');
      assert.equal(r.grid, undefined, 'a refusal handed back a grid anyway');
    }
    /* and the refusal names what could have been said, from the declaration rather than from prose.
       ⚠ (#R752) THESE THREE LINES USED TO PIN THE SET TO ['bilinear','nearest'] — and that was a
       GUARD WRITTEN AS A POLICY ([[intmap-ceiling-guards-are-not-policies]]). What ④ is about is that
       `method` has no default, that an unknown name is refused, and that the refusal reads its
       vocabulary from the declaration instead of prose. None of that says how many methods exist, and
       the first correct change — #R752 adding cubic, average, mode and sum, which docs/GIS-CORE.md §6
       had listed as missing — was failed by an assertion that was never measuring the rule. The
       population is now asked of the kernel that owns it. */
    /* the kernel that owns the method ids */
    const known = raster.sampleMethods().slice().sort();
    const r = await warp.to4326(src, {});
    assert.deepEqual(r.detail.methods.slice().sort(), known, 'the refusal offers a set the kernel does not have');

    /* ⚠ A NAME THE KERNEL DOES NOT HAVE, and it must be derived rather than typed: 'cubic' stood here
       and became a real method, so the line stopped testing refusal and started testing absence. */
    const absent = 'lanczos';
    assert.ok(!known.includes(absent), 'pick a name the kernel really lacks: ' + absent);
    const bad = await warp.to4326(src, { method: absent });
    assert.equal(bad.ok, false);
    assert.equal(bad.why, 'resample-method-unknown');

    /* the declaration itself: ids come from the raster kernel, meanings from the warp */
    const ms = warp.methods();
    assert.deepEqual(ms.map((m) => m.id).sort(), known,
      'the warp offers a different set of methods from the kernel that implements them');
    for (const m of ms) {
      assert.equal(m.stated, true, m.id + ' is offered with no description');
      assert.equal(typeof m.interpolates, 'boolean');
      assert.equal(typeof m.categoricalSafe, 'boolean');
    }
    assert.equal(ms.find((m) => m.id === 'nearest').categoricalSafe, true);
    assert.equal(ms.find((m) => m.id === 'bilinear').categoricalSafe, false);
    assert.equal(ms.find((m) => m.id === 'bilinear').voidPolicy, 'nearest-fallback');
  });

  /* ── ⑤ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ⑤ align states its rule or chooses nothing, and disjoint grids are refused by name', async () => {
    const { warp } = await boot();
    const a = degreeGrid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 10, height: 10, value: () => 1 });
    const b = degreeGrid({ west: 5, north: 8, pixelLng: 0.5, pixelLat: 0.5, width: 20, height: 16, value: () => 2 });

    for (const opts of [undefined, {}, { rule: null }]) {
      const r = warp.align(a, b, opts);
      assert.equal(r.ok, false, 'align chose a rule nobody stated');
      assert.equal(r.why, 'align-rule-not-stated');
      assert.deepEqual(r.detail.rules.slice().sort(), ['coarser', 'finer', 'first']);
    }
    assert.equal(warp.align(a, b, { rule: 'nearest' }).why, 'align-rule-unknown');

    const finer = warp.align(a, b, { rule: 'finer' });
    assert.equal(finer.ok, true, finer.why);
    assert.equal(finer.target.pixelLng, 0.5);
    assert.equal(finer.from, 'b');
    const coarser = warp.align(a, b, { rule: 'coarser' });
    assert.equal(coarser.target.pixelLng, 1);
    assert.equal(coarser.from, 'a');
    const first = warp.align(a, b, { rule: 'first' });
    assert.equal(first.target.pixelLng, 1);
    assert.equal(first.from, 'a');
    /* the intersection, computed here from the two stated extents and nothing else */
    assert.deepEqual(finer.intersection, [5, 0, 10, 8]);

    /* ALIGNING A GRID WITH ITSELF IS THE GRID. If the origin were not snapped to the reference grid's
       own pixel edges, a resample onto this target would move every value for nothing. */
    const self = warp.align(a, a, { rule: 'first' });
    assert.deepEqual(self.target, { west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 10, height: 10 });
    const onto = await warp.resample(a, self.target, { method: 'nearest' });
    assert.equal(onto.ok, true, onto.why);
    const o = onto.grid.read(0);
    for (let i = 0; i < 100; i++) assert.equal(o[i], a._data[i]);
    assert.equal(onto.report.clipped, 0);

    /* TOUCHING IS NOT OVERLAPPING, and apart is apart. */
    const far = degreeGrid({ west: 100, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 4, value: () => 3 });
    const d = warp.align(a, far, { rule: 'finer' });
    assert.equal(d.ok, false);
    assert.equal(d.why, 'grids-disjoint');
    const touching = degreeGrid({ west: 10, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 4, value: () => 3 });
    assert.equal(warp.align(a, touching, { rule: 'finer' }).why, 'grids-disjoint');

    /* a grid in another CRS has no common grid until it has been through to4326 — said, not guessed */
    const utm = affineGrid({ affine: [3e5, 1e3, 0, 39e5, 0, -1e3], width: 4, height: 4, crs: 'EPSG:32654', value: () => 1 });
    assert.equal(warp.align(a, utm, { rule: 'finer' }).why, 'align-needs-4326');
    const rot = affineGrid({ affine: [0, 0, 1, 10, -1, 0], width: 4, height: 4, crs: 'EPSG:4326', value: () => 1 });
    assert.equal(warp.align(a, rot, { rule: 'finer' }).why, 'align-grid-rotated');
  });

  /* ── ⑥ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ⑥ a declared classification is not interpolated, and an undeclared one is not guessed at', async () => {
    const { warp } = await boot();
    const classes = degreeGrid({
      west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 6, height: 6,
      band: { name: 'landcover', categorical: true },
      value: (lng, lat, c) => (c < 3 ? 3 : 5),
    });

    const b = await warp.to4326(classes, { method: 'bilinear' });
    assert.equal(b.ok, false, 'a land-cover grid was blended');
    assert.equal(b.why, 'bilinear-on-categorical');
    assert.equal(b.detail.bandIndex, 0);
    assert.equal(b.detail.name, 'landcover');

    /* nearest is the method that exists for exactly this, and it must still work */
    const n = await warp.to4326(classes, { method: 'nearest' });
    assert.equal(n.ok, true, n.why);
    const on = n.grid.read(0);
    for (let i = 0; i < 36; i++) assert.ok(on[i] === 3 || on[i] === 5, 'a class between 3 and 5 appeared: ' + on[i]);
    /* the declaration travels with the output, so the next op refuses for the same reason */
    assert.equal(n.grid.bands[0].categorical, true);
    assert.equal((await warp.to4326(n.grid, { method: 'bilinear' })).why, 'bilinear-on-categorical');

    /* ⚠ AND BEING AN INTEGER IS NOT EVIDENCE. A household count is an integer and its interpolation
       is meaningful; a warp that refused it would be guessing at what the numbers MEAN. */
    const counts = degreeGrid({
      west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 6, height: 6,
      band: { name: 'households' },
      value: (lng, lat, c, r) => c + r,
    });
    assert.equal((await warp.to4326(counts, { method: 'bilinear' })).ok, true);
  });

  /* ── ⑦ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ⑦ at 70°N an output pixel is still an input pixel on the ground, measured geodesically', async () => {
    const { w, warp } = await boot();
    const R = w.IntMapGeodesy._R_EARTH_KM;
    /* EPSG:32633 — UTM zone 33N, central meridian 15°E. Northing 7,800,000 is a little above 70°N,
       which is where a degree of longitude is a third of what it is at the equator: a warp that chose
       its resolution in degrees rather than from the projection produces a grid three times too
       coarse east–west, and the only way to see that is to measure the ground. */
    const M = 1000;
    const A = [400000, M, 0, 7800000, 0, -M];
    const src = affineGrid({ affine: A, width: 50, height: 40, crs: 'EPSG:32633', value: (c, r) => c + r });

    const r = await warp.to4326(src, { method: 'nearest' });
    assert.equal(r.ok, true, r.why);
    const G = r.grid.grid;
    const lat = G.north - G.pixelLat * (r.grid.height / 2);
    const lng = G.west + G.pixelLng * (r.grid.width / 2);
    assert.ok(lat > 68 && lat < 73, 'the test grid is not where it was meant to be: ' + lat);

    const acrossKm = haversineKm(R, [lng, lat], [lng + G.pixelLng, lat]);
    const downKm = haversineKm(R, [lng, lat], [lng, lat - G.pixelLat]);
    /* ⚠ MEASURED IN METRES, NOT IN DEGREES. The tolerance is the convergence of the meridians across
       this tile (it sits 100 km west of the central meridian, so a pixel is rotated ~2.5°) plus the
       difference between the sphere this test measures on and the WGS 84 ellipsoid proj4 projects on —
       both a few parts in a thousand, so 15% is far outside either and far inside a wrong answer
       (a degree-square pixel would be ~3× out). */
    assert.ok(Math.abs(acrossKm - 1) < 0.15, 'an output pixel is ' + acrossKm.toFixed(3) + ' km across, not 1 km');
    assert.ok(Math.abs(downKm - 1) < 0.15, 'an output pixel is ' + downKm.toFixed(3) + ' km tall, not 1 km');
    /* and the two are very different in DEGREES, which is the fact a degree-based derivation misses */
    assert.ok(G.pixelLng / G.pixelLat > 2.5, 'the pixel is not stretched in longitude at all');
  });

  /* ── ⑧ ──────────────────────────────────────────────────────────────────────────────────────── */

  test('R749 ⑧ the run can be stopped, and says where it got to', async () => {
    const { warp } = await boot();
    const src = degreeGrid({ west: 0, north: 10, pixelLng: 0.1, pixelLat: 0.1, width: 50, height: 40, value: () => 1 });

    const seen = [];
    /* The ctx docs/GIS-CORE.md §2.6 describes, handed in by the caller — js/gis-warp.js does not keep
       a second copy of the pacing rule, so this is the shape it has to accept. */
    let ticks = 0;
    const ctx = {
      aborted: () => false,
      done: () => ticks,
      async tick(units, total) { ticks += units; seen.push([ticks, total]); return ticks < 500; },
    };
    const r = await warp.to4326(src, { method: 'nearest', ctx: ctx });
    assert.equal(r.ok, false, 'a cancelled warp reported success');
    assert.equal(r.why, 'cancelled');
    assert.ok(r.detail.done > 0 && r.detail.done < r.detail.total, 'the refusal does not say where it stopped');
    assert.equal(r.detail.total, 50 * 40);
    assert.ok(seen.length > 0 && seen[0][1] === 50 * 40, 'progress was reported without a total');

    /* and a ctx that never asks to stop changes nothing about the answer */
    let count = 0;
    const go = { aborted: () => false, done: () => count, async tick(u) { count += u; return true; } };
    const ok = await warp.to4326(src, { method: 'nearest', ctx: go });
    assert.equal(ok.ok, true, ok.why);
    assert.equal(count, 50 * 40);
  });

  /* ── refusals that must stay refusals ───────────────────────────────────────────────────────── */

  test('R749 ⑨ a grid that states no coordinate system, and a broken affine, are refused by name', async () => {
    const { warp } = await boot();
    const base = { width: 4, height: 4, bands: [{ name: 'v', unit: null, nodata: null }], read: () => new Float64Array(16) };

    const noCrs = Object.assign({}, base, { grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 } });
    const r1 = await warp.to4326(noCrs, { method: 'nearest' });
    assert.equal(r1.ok, false, 'a grid with no stated CRS was warped as if it were degrees');
    assert.equal(r1.why, 'crs-not-stated');

    const noAffine = Object.assign({}, base, { crs: 'EPSG:4326' });
    assert.equal((await warp.to4326(noAffine, { method: 'nearest' })).why, 'affine-missing');

    const singular = Object.assign({}, base, { crs: 'EPSG:4326', affine: [0, 1, 1, 10, 1, 1] });
    assert.equal((await warp.to4326(singular, { method: 'nearest' })).why, 'affine-singular');

    const badAffine = Object.assign({}, base, { crs: 'EPSG:4326', affine: [0, 1, 0, 10] });
    assert.equal((await warp.to4326(badAffine, { method: 'nearest' })).why, 'affine-invalid');

    const unknown = Object.assign({}, base, { crs: 'EPSG:32799', affine: [0, 1, 0, 10, 0, -1] });
    assert.equal((await warp.to4326(unknown, { method: 'nearest' })).why, 'crs-unknown');

    /* resample is the door for a grid ALREADY in degrees, and it says so rather than treating metres
       as degrees */
    const utm = affineGrid({ affine: [3e5, 1e3, 0, 39e5, 0, -1e3], width: 4, height: 4, crs: 'EPSG:32654', value: () => 1 });
    const rs = await warp.resample(utm, { west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 4 }, { method: 'nearest' });
    assert.equal(rs.ok, false);
    assert.equal(rs.why, 'resample-source-not-4326');

    const g = degreeGrid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 4, value: () => 1 });
    assert.equal((await warp.resample(g, { west: 0, north: 10, pixelLng: 0, pixelLat: 1, width: 4, height: 4 }, { method: 'nearest' })).why, 'target-invalid');
    assert.equal((await warp.resample(g, null, { method: 'nearest' })).why, 'target-invalid');
  });

  /* ── the point doors themselves ─────────────────────────────────────────────────────────────── */

  test('R749 ⑩ fromWgs84 guards the end that is in degrees, and refuses by name', async () => {
    const { crs } = await boot();
    /* ⚠ A NORTHING HANDED OVER AS A LATITUDE projects to a perfectly finite pair and is simply
       somewhere else. Going OUT of degrees there is no answer to measure, so the INPUT is measured —
       the header says why, and this is the measurement. */
    assert.equal(crs.fromWgs84(139, 4300000, 'EPSG:32654'), null);
    assert.equal(crs.why(), 'crs-axis-suspect');
    assert.equal(crs.fromWgs84(NaN, 35, 'EPSG:32654'), null);
    assert.equal(crs.why(), 'crs-position-invalid');
    assert.equal(crs.fromWgs84(139, 35, ''), null);
    assert.equal(crs.why(), 'crs-code-missing');
    assert.equal(crs.fromWgs84(139, 35, 'EPSG:32799'), null);
    assert.equal(crs.why(), 'crs-unknown');

    /* a pair already in 4326 comes back UNCHANGED — not round-tripped through proj4, which is what
       a warp walking millions of pixels would otherwise accumulate noise from */
    assert.deepEqual(crs.fromWgs84(139.123456789, 35.987654321, 'EPSG:4326'), [139.123456789, 35.987654321]);
    assert.deepEqual(crs.toWgs84(139.123456789, 35.987654321, 'CRS84'), [139.123456789, 35.987654321]);

    /* and the two are inverses on a real projection */
    const xy = crs.fromWgs84(141, 40, 'EPSG:32654');
    assert.ok(xy && Math.abs(xy[0] - 500000) < 1, 'the central meridian is not at 500,000 m: ' + (xy && xy[0]));
    const ll = crs.toWgs84(xy[0], xy[1], 'EPSG:32654');
    assert.ok(Math.abs(ll[0] - 141) < 1e-9 && Math.abs(ll[1] - 40) < 1e-9);

    /* isWgs84 is the judgement prepare() makes, published so js/gis-warp.js does not keep a fifth
       copy of the three spellings */
    assert.equal(crs.isWgs84('epsg::4326'), true);
    assert.equal(crs.isWgs84('CRS84'), true);
    assert.equal(crs.isWgs84('EPSG:3857'), false);
    assert.equal(crs.isWgs84(''), false);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R764 · zonal rules and cancellation reach   (was tests/r764-gis-scale-and-precision-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R764 · 境界の画素と、止められること
 * ----------------------------------------------------------------------------
 *  ⚠ TWO DEFECTS OF OPPOSITE KINDS, and the second one is the worse.
 *
 *  ① THE BOUNDARY RULE WAS A JUDGEMENT, STATED AND ARGUED — and it was the only one on offer.
 *     js/gis-raster.js's header says a pixel belongs to the zone whose polygon holds its CENTRE, and
 *     argues it well: splitting the VALUE of a class code is meaningless, and splitting a point
 *     measurement is an interpolation nobody asked for. Both stay true. What neither settles is the
 *     AREA — 「この流域の面積」 is answered out of the pixels' ground, and a zone that cuts a pixel in
 *     half is answered by neither counting it whole nor dropping it. On a coarse grid against a
 *     narrow catchment, a coastal strip or a small ward, that difference IS the answer.
 *     ⇒ The rule is chosen and NAMED IN THE ANSWER. ⚠ The default does not move: a reader who chose
 *     nothing gets the same numbers as before, to the bit.
 *
 *  ② THE COMMENT ABOVE THE RUNNER TABLE SAID THE OPPOSITE OF WHAT THE TABLE DID:
 *
 *         「The others finish in one turn and are handed it anyway,
 *           so a runner that grows tomorrow has it already.」
 *
 *     MEASURED: six of the twenty-four were handed nothing — filter, buffer, dissolve, timeWindow,
 *     join, compute. `buffer` unions a geodesic disk PER VERTEX. So the runner whose cost grows
 *     fastest in this file was the one being described as finishing in one turn, and a reader
 *     buffering a few thousand features had a stop button that could not reach the work — under a
 *     note explaining that it could. This is [[intmap-sync-loop-cannot-be-cancelled]] one level up,
 *     and it is why ⑨ below measures the TABLE rather than the sentence.
 *
 *  ⚠ WHAT IS MEASURED IS THE ANSWER AND THE WIRING, not the prose. A comment cannot be trusted to
 *  describe the table it sits on — that is the whole finding.
 * ==========================================================================*/
describe('§ #R764 · zonal rules and cancellation reach', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), raster = makeGisRaster(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster; w.IntMapGisOps = ops; w.IntMapGisExpr = makeGisExpr();
    await geometry.ready();
    return { w, data, geometry, raster, ops };
  }

  const featOf = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const boxOf = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const polyOf = (rings, p) => featOf({ type: 'Polygon', coordinates: rings }, p);

  /* ⚠ ONE PIXEL, AND ITS EDGES ARE WHOLE NUMBERS, so every expected weight below is a ratio a reader
     can check by hand rather than a number this file copied out of a run. The pixel spans lng 0→1 and
     lat 0→1; a zone spanning lng 0→0.4 of the same latitudes covers exactly 0.4 of its ground, because
     the spherical cell area is proportional to Δλ at a fixed latitude band. */
  function onePixel(value) {
    const cells = Float64Array.from([value]);
    return {
      kind: 'raster', title: 'g', width: 1, height: 1,
      grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
      bands: [{ name: 'v', unit: null, nodata: null }],
      read: () => cells,
    };
  }

  const ZONE_LEFT_40 = { type: 'Polygon', coordinates: [boxOf(0, 0, 0.4, 1)] };   /* 中心(0.5,0.5)の外 */

  /* ══ ① 既定は動かない ═══════════════════════════════════════════════════════════════════════ */

  test('#R764 ① 既定は center のまま — 選ばなかった読者の数は 1 ビットも動かない', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(10));
    const bare = await raster.zonal(g, 0, ZONE_LEFT_40, {});
    const named = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'center' });
    assert.equal(bare.ok, true, bare.why);
    assert.equal(bare.boundary, 'center', '既定の規則が答えに載っていない');
    /* 中心が区域の外なので、この画素は採られない — 出荷前と同じ答え */
    assert.equal(bare.count, 0);
    assert.equal(bare.areaKm2, 0);
    assert.deepEqual({ c: bare.count, a: bare.areaKm2, m: bare.mean }, { c: named.count, a: named.areaKm2, m: named.mean });
    void ops;
  });

  /* ══ ② allTouched ═══════════════════════════════════════════════════════════════════════════ */

  test('#R764 ② allTouched は、区域が触れた画素を丸ごと採る', async () => {
    const { data, raster } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'allTouched' });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.boundary, 'allTouched');
    assert.equal(r.count, 1, '触れている画素が採られていない');
    const whole = await raster.pixelAreaKm2(g, 0);
    assert.ok(Math.abs(r.areaKm2 - whole.km2) < 1e-6, '丸ごとではない: ' + r.areaKm2 + ' vs ' + whole.km2);
  });

  /* ══ ③ fractional — 手で確かめられる比 ═════════════════════════════════════════════════════ */

  test('#R764 ③ fractional は、画素のうち区域に入っている面積の割合を重みにする', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.boundary, 'fractional');
    const whole = await raster.pixelAreaKm2(g, 0);
    /* 0.4 は「この緯度帯で Δλ が 0.4 倍」——読者が手で確かめられる比であって、実行から写した数ではない */
    assert.ok(Math.abs(r.areaKm2 / whole.km2 - 0.4) < 1e-9,
      '重みが 0.4 になっていない: ' + (r.areaKm2 / whole.km2));
    assert.ok(Math.abs(r.valueAreaKm2 / whole.km2 - 0.4) < 1e-9);
  });

  test('#R764 ③ 区域の中に丸ごと入っている画素は 1 のまま（端だけが分けられる）', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(10));
    const covers = { type: 'Polygon', coordinates: [boxOf(-1, -1, 2, 2)] };
    const r = await raster.zonal(g, 0, covers, { boundary: 'fractional', areaOf: ops.areaKm2 });
    const whole = await raster.pixelAreaKm2(g, 0);
    assert.ok(Math.abs(r.areaKm2 - whole.km2) < 1e-6, '内部の画素が削られた: ' + r.areaKm2 + ' vs ' + whole.km2);
  });

  /* ══ ④⑤ 断り方 ═════════════════════════════════════════════════════════════════════════════ */

  test('#R764 ④ 面積の規則を渡されなければ fractional は名前を付けて断る（黙って center に落ちない）', async () => {
    const { data, raster } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional' });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'fraction-needs-area-rule');
    assert.equal(r.detail.needs, 'areaOf');
  });

  test('#R764 ⑤ 知らない規則は、語彙を添えて断られる', async () => {
    const { data, raster } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'halfway' });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'boundary-rule-unknown');
    assert.deepEqual(r.detail.rules, ['center', 'allTouched', 'fractional']);
  });

  /* ══ ⑥ 重みが効くのは「地面」だけ ═══════════════════════════════════════════════════════════ */

  test('#R764 ⑥ count と sum は画素を 1 つとして数える — 読み取り値の 3 分の 2 は読み取り値ではない', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.count, 1, '画素の数が重みで割られている');
    assert.equal(r.sum, 10, '観測値の合計が重みで割られている');
    /* 一方、地面についての統計は重みを取る */
    const whole = await raster.pixelAreaKm2(g, 0);
    assert.ok(Math.abs(r.sumTimesAreaKm2 - 10 * whole.km2 * 0.4) < 1e-6, '積分が重みを取っていない');
    /* 面積加重平均は 1 画素なので値そのもの（重みは分子と分母で打ち消える） */
    assert.ok(Math.abs(r.mean - 10) < 1e-12);
  });

  test('#R764 ⑥ 分類ごとの面積は重みを取る（分類は割らない。面積を割る）', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(3));
    const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2, classes: true });
    assert.equal(r.ok, true, r.why);
    const whole = await raster.pixelAreaKm2(g, 0);
    assert.ok(Math.abs(r.classAreasKm2['3'] / whole.km2 - 0.4) < 1e-9,
      '区分の面積が丸ごと数えられている: ' + JSON.stringify(r.classAreasKm2));
  });

  /* ══ ⑦ 使った規則は行にも載る ═══════════════════════════════════════════════════════════════ */

  test('#R764 ⑦ zonal op の各行が、どの規則で出した数かを持って出る', async () => {
    const { data, ops } = await boot();
    const g = data.add(onePixel(10));
    const zones = data.add({ title: 'z', features: [polyOf([boxOf(0, 0, 0.4, 1)], { id: 'z1' })] });
    const r = await ops.run({ op: 'zonal', inputs: [zones.id, g.id], params: { stat: 'mean', boundary: 'fractional' } });
    assert.equal(r.ok, true, r.why);
    const p = r.dataset.features()[0].properties;
    assert.equal(p._boundary, 'fractional', '行が規則を持っていない（後から検算できない）');
    /* そして op は面積の規則を自分で渡している — 呼ばれ方を測る */
    assert.ok(/areaOf: areaKm2/.test(read('js/gis-ops.js')), 'op が面積の規則を kernel へ配っていない');
  });

  test('#R764 ⑦ 知らない規則は op の側でも語彙を添えて断られる', async () => {
    const { data, ops } = await boot();
    const g = data.add(onePixel(10));
    const zones = data.add({ title: 'z', features: [polyOf([boxOf(0, 0, 1, 1)], { id: 'z1' })] });
    const r = await ops.run({ op: 'zonal', inputs: [zones.id, g.id], params: { stat: 'mean', boundary: 'nope' } });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'bad-param');
    assert.equal(r.detail.param, 'boundary');
    assert.deepEqual(r.detail.values, ['center', 'allTouched', 'fractional']);
  });

  /* ══ ⑧⑨ 止められること ═════════════════════════════════════════════════════════════════════ */

  const ABORTED = { aborted: true };

  test('#R764 ⑧ 中止は、今まで ctx を渡されていなかった 6 つの演算に届く', async () => {
    const { data, ops } = await boot();
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push(featOf({ type: 'Point', coordinates: [i / 100, i / 100] }, { n: i, code: 'a' }));
    const src = data.add({ title: 's', features: rows, time: { kind: 'constant', start: '2020', end: '2020' } });
    const right = data.add({ title: 'r', features: [featOf({ type: 'Point', coordinates: [0, 0] }, { code: 'a', m: 1 })] });

    const cases = [
      ['filter', { where: [{ field: 'n', op: '>=', value: 0 }] }, [src.id]],
      ['buffer', { radiusKm: 1 }, [src.id]],
      ['timeWindow', { from: '2019', to: '2021' }, [src.id]],
      ['compute', { outName: 'x', expr: 'n * 2' }, [src.id]],
      ['join', { leftField: 'code', rightField: 'code', fields: ['m'] }, [src.id, right.id]],
    ];
    for (const [op, params, inputs] of cases) {
      const r = await ops.run({ op: op, inputs: inputs, params: params }, { signal: ABORTED });
      assert.equal(r.ok, false, op + ' は中止されなかった');
      assert.equal(r.why, 'cancelled', op + ' の中止が名前を持っていない: ' + r.why);
    }

    /* dissolve は面が要るので別の入力で */
    const polys = data.add({ title: 'p', features: [polyOf([boxOf(0, 0, 1, 1)], { k: 'a' }), polyOf([boxOf(2, 2, 3, 3)], { k: 'b' })] });
    const rd = await ops.run({ op: 'dissolve', inputs: [polys.id], params: { by: 'k' } }, { signal: ABORTED });
    assert.equal(rd.ok, false);
    assert.equal(rd.why, 'cancelled', 'dissolve の中止が名前を持っていない: ' + rd.why);
  });

  test('#R764 ⑨ 実行表のどの行も ctx を渡されている — 註ではなく表を測る', () => {
    /* 綴りのまま: 主張が実行表の全行という構造で、全 op を評価するには op ごとの入力が要る（届くことは ⑧ が 6 つの演算で評価している）。 */
    const src = read('js/gis-ops.js');
    const at = src.indexOf('const RUN = {');
    assert.ok(at > 0, 'RUN の表が見つからない');
    const body = src.slice(at, src.indexOf('};', at));
    const rows = body.match(/^\s{8}[a-zA-Z]+: \(\) => [^\n]+$/gm) || [];
    assert.ok(rows.length >= 20, '表の行が読み取れていない: ' + rows.length);
    const without = rows.filter((r) => !/\bctx\b/.test(r));
    assert.deepEqual(without, [],
      'ctx を渡されていない runner がある（この回が直したのはまさにこれ）:\n' + without.join('\n'));
  });

  test('#R764 ⑨ ctx を渡されない呼び手は待たされない — 2 つ目の実装は作られていない', async () => {
    const { data, ops } = await boot();
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(featOf({ type: 'Point', coordinates: [i, i] }, { n: i }));
    const src = data.add({ title: 's', features: rows });
    /* signal も onProgress も渡さない = 出荷済みの呼ばれ方。答えは変わらない */
    const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 3 }] } });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.dataset.count, 2);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · the fractional cover of a pixel   (was tests/r783-raster-cover-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 画素の被覆は、標本ではなく証明で決まる (the pixel's cover, proved rather than sampled)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE SHORTCUT ASSERTED A PROOF IT DID NOT HAVE. js/gis-raster.js's `coverOf` read
 *
 *        if (inside === 4 && centreIn && !hasHole(geometry)) return 1;
 *
 *  — four corners and the centre in the zone, no hole anywhere ⇒ the pixel is WHOLLY inside. That is
 *  true of a convex zone and false of every concave one, because a slot can be cut in past all five
 *  probes. MEASURED before the fix, on a 1°×1° pixel against a zone with a slot 0.2° wide and 0.4°
 *  deep cut in from above (all four corners and the centre inside):
 *
 *        reported weight  1
 *        the sphere       0.9200038992201667      (= 1 − 0.2·(sin1° − sin0.6°) / (sin1° − sin0°))
 *        the clipper      0.9200038992201675
 *
 *  ⚠ AND MORE PROBES WOULD NOT HAVE HELPED: for any finite set of sample points a concave zone can be
 *  given a slot that misses every one of them. So the fix is not a denser sample — it is a question
 *  with a yes-or-no answer (「この画素の近くに区域の辺はあるか」) whose NO is a proof that the whole
 *  rectangle lies on one side of the zone's boundary, the centre then saying which side.
 *  What it cannot prove goes down the intersection road, which is exact.
 *
 *  ⚠ WHAT THE EXPECTED NUMBERS BELOW ARE. Every zone in this file is built out of axis-aligned boxes,
 *  and the ground of such a box on a sphere is proportional to Δλ·(sinφ₂ − sinφ₁) — so each expected
 *  weight is written here as that arithmetic and NOT copied out of a run of `coverOf`, nor asked of
 *  the clipper that `coverOf` itself asks. Two readers designed together cannot falsify each other
 *  ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/
describe('§ #R783 · the fractional cover of a pixel', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot(opts) {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisUnits } = await import('../js/gis-units.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), raster = makeGisRaster(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster; w.IntMapGisOps = ops;
    /* ⚠ 単位のカーネルは「在るとき」と「無いとき」の両方が測られる（⑫）——判断はあちらが持っている
       ので、無い build は 「してよい」 ではなく 「訊けなかった」 を答えなければならない。 */
    const units = (opts && opts.noUnits) ? null : makeGisUnits();
    if (units) w.IntMapGisUnits = units; else { try { delete w.IntMapGisUnits; } catch (_) { w.IntMapGisUnits = null; } }
    await geometry.ready();
    return { w, data, geometry, raster, ops, units };
  }

  /* ── the sphere, asked directly ────────────────────────────────────────────────────────────────
     The ground of the box [w,e]×[s,n] is R²·Δλ·(sinφ₂ − sinφ₁) up to the one constant that cancels in
     every ratio below, so `share` is that quantity without the constant. */
  const SIN = (d) => Math.sin(d * Math.PI / 180);
  const share = (w, s, e, n) => (e - w) * (SIN(n) - SIN(s));
  const PIXEL = share(0, 0, 1, 1);                    /* the one pixel every zone below is measured on */

  /* One pixel spanning lng 0→1, lat 0→1, so a weight IS a ratio of two boxes. `west` is a parameter
     because ⑧ writes the same pixel a whole turn away; `band` because ⑩–⑫ give the band a declared
     quantity and the weight tests give it none. */
  function onePixel(value, west, band) {
    const cells = Float64Array.from([value]);
    return {
      kind: 'raster', title: 'g', width: 1, height: 1,
      grid: { west: (west == null) ? 0 : west, north: 1, pixelLng: 1, pixelLat: 1 },
      bands: [band || { name: 'v', unit: null, nodata: null }],
      read: () => cells,
    };
  }

  const boxRing = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  /* the same zone written `by` degrees east — used by ⑧ to put the two frames a whole turn apart */
  const shift = (g, by) => ({
    type: g.type,
    coordinates: (g.type === 'Polygon')
      ? g.coordinates.map((r) => r.map((p) => [p[0] + by, p[1]]))
      : g.coordinates.map((part) => part.map((r) => r.map((p) => [p[0] + by, p[1]]))),
  });

  /* The weight the kernel reports for the single pixel, as a ratio of its own ground. */
  async function weightOf(zone, opts) {
    const { data, raster, ops } = (opts && opts.boot) || await boot();
    const g = data.add(onePixel(10, opts && opts.west));
    const r = await raster.zonal(g, 0, zone, { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.ok, true, 'zonal が断った: ' + r.why);
    const whole = await raster.pixelAreaKm2(g, 0);
    return r.areaKm2 / whole.km2;
  }

  const CLOSE = 1e-9;
  const near = (got, want, what) => assert.ok(Math.abs(got - want) < CLOSE,
    what + ': got ' + got + ', want ' + want + ' (差 ' + Math.abs(got - want) + ')');

  /* ══ ① 細い切り込み — 出荷されていた欠陥そのもの ═══════════════════════════════════════════════
     A zone that overhangs the pixel on every side, with a slot 0.2° wide cut down from above to
     lat 0.6. All four corners (0,0) (1,0) (1,1) (0,1) and the centre (0.5,0.5) are inside it. */
  const SLOT_ZONE = {
    type: 'Polygon',
    coordinates: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [0.6, 1.5], [0.6, 0.6], [0.4, 0.6], [0.4, 1.5], [-0.5, 1.5], [-0.5, -0.5]]],
  };

  test('#R783 ① 上から入る細い切り込み — 四隅と中心が全部区域内でも、被覆は 1 ではない', async () => {
    const B = await boot();
    /* まず近道の前提が本当に成り立っていることを測る（成り立たないなら、この検査は別の話をしている） */
    for (const p of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]) {
      assert.equal(B.geometry.pointInGeometry(p, SLOT_ZONE), true, '前提が崩れている: ' + JSON.stringify(p) + ' が区域外');
    }
    const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;     /* ≈ 0.9200038992201667 */
    near(await weightOf(SLOT_ZONE, { boot: B }), want, '切り込みの分が引かれていない');
  });

  test('#R783 ① 切り込みの分は、面積・積分・面積加重平均のすべてに効く', async () => {
    const { data, raster, ops } = await boot();
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: ops.areaKm2, classes: true });
    const whole = await raster.pixelAreaKm2(g, 0);
    const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
    near(r.areaKm2 / whole.km2, want, '区域の面積');
    near(r.sumTimesAreaKm2 / (10 * whole.km2), want, '面積積分');
    near(r.classAreasKm2['10'] / whole.km2, want, '土地被覆の面積');
    /* ⚠ count と sum は画素を 1 つとして数える（#R764 の判断は動かさない） */
    assert.equal(r.count, 1, '画素の数が重みで割られている');
    assert.equal(r.sum, 10, '観測値の合計が重みで割られている');
    near(r.mean, 10, '1 画素の面積加重平均は値そのもの');
  });

  /* ══ ② 湾状の凹部 ═══════════════════════════════════════════════════════════════════════════════
     Not a slit but a bay, entering from the west and 0.2° tall — again with every probe inside. */
  test('#R783 ② 横から入る湾状の凹部も引かれる', async () => {
    const bay = {
      type: 'Polygon',
      coordinates: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [-0.5, 1.5], [-0.5, 0.4], [0.3, 0.4], [0.3, 0.2], [-0.5, 0.2], [-0.5, -0.5]]],
    };
    const B = await boot();
    for (const p of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]) {
      assert.equal(B.geometry.pointInGeometry(p, bay), true, '前提が崩れている: ' + JSON.stringify(p));
    }
    const want = 1 - share(0, 0.2, 0.3, 0.4) / PIXEL;
    near(await weightOf(bay, { boot: B }), want, '湾の分が引かれていない');
  });

  /* ══ ③ 狭い区域 ═════════════════════════════════════════════════════════════════════════════════
     Narrower than the pixel, and touching no corner — the case the corners never decided either. */
  test('#R783 ③ 画素より狭い区域が真ん中を通る — 隅に触れないが被覆は 0 ではない', async () => {
    near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0.3, -1, 0.5, 2)] }), 0.2, '真ん中を通る帯');
  });

  test('#R783 ③ 中心を外れた狭い帯も、その幅ぶん数えられる', async () => {
    near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0.05, -1, 0.15, 2)] }), 0.1, '中心を外れた帯');
  });

  test('#R783 ③ 画素から完全に離れた区域は 0（近道が「証明できた」と言い出さない）', async () => {
    const r = await weightOf({ type: 'Polygon', coordinates: [boxRing(5, 5, 6, 6)] });
    assert.equal(r, 0, '離れた区域が数えられた: ' + r);
  });

  /* ══ ④ 穴 ═══════════════════════════════════════════════════════════════════════════════════════ */
  test('#R783 ④ 画素の中にまるごと入る穴は引かれる（どの標本点にも当たらない）', async () => {
    const zone = { type: 'Polygon', coordinates: [boxRing(-0.5, -0.5, 1.5, 1.5), boxRing(0.3, 0.3, 0.5, 0.6)] };
    const want = 1 - share(0.3, 0.3, 0.5, 0.6) / PIXEL;
    near(await weightOf(zone), want, '穴の分が引かれていない');
  });

  test('#R783 ④ 遠くの穴は、この画素の被覆を減らさない — 穴があること自体は理由にならない', async () => {
    const zone = { type: 'Polygon', coordinates: [boxRing(-0.5, -0.5, 1.5, 1.5), boxRing(1.2, 1.2, 1.4, 1.4)] };
    const w = await weightOf(zone);
    assert.equal(w, 1, '穴が画素の外にあるのに削られた: ' + w);
  });

  /* ══ ⑤ 複数パート ═══════════════════════════════════════════════════════════════════════════════ */
  test('#R783 ⑤ 複数パートは足し合わされる（どのパートも画素を丸ごと覆っていない）', async () => {
    const zone = {
      type: 'MultiPolygon',
      coordinates: [[boxRing(-0.5, -0.5, 0.2, 1.5)], [boxRing(0.5, -0.5, 0.8, 1.5)]],
    };
    near(await weightOf(zone), 0.2 + 0.3, '2 つのパートの和になっていない');
  });

  test('#R783 ⑤ 1 つのパートが画素を丸ごと覆い、もう 1 つが遠くにある場合は 1', async () => {
    const zone = {
      type: 'MultiPolygon',
      coordinates: [[boxRing(-0.5, -0.5, 1.5, 1.5)], [boxRing(40, 40, 41, 41)]],
    };
    const w = await weightOf(zone);
    assert.equal(w, 1, '丸ごと覆われているのに削られた: ' + w);
  });

  test('#R783 ⑤ 切り込みのあるパートと、離れたパートが同居していても切り込みは引かれる', async () => {
    const slot = SLOT_ZONE.coordinates[0];
    const zone = { type: 'MultiPolygon', coordinates: [[slot], [boxRing(40, 40, 41, 41)]] };
    const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
    near(await weightOf(zone), want, '複数パートだと切り込みが見えていない');
  });

  /* ══ ⑥ 回帰 — 凸な四角形は前と同じ数 ═══════════════════════════════════════════════════════════ */
  test('#R783 ⑥ 凸な四角形の被覆は変わらない（#R764 の 0.4 はそのまま）', async () => {
    near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0, 0, 0.4, 1)] }), 0.4, '端の画素');
    near(await weightOf({ type: 'Polygon', coordinates: [boxRing(0, 0.25, 1, 0.75)] }),
      share(0, 0.25, 1, 0.75) / PIXEL, '緯度で切った画素');
  });

  test('#R783 ⑥ 画素を丸ごと含む凸な区域は、ぴったり 1（内部の画素は削られない）', async () => {
    const w = await weightOf({ type: 'Polygon', coordinates: [boxRing(-1, -1, 2, 2)] });
    assert.equal(w, 1, '内部の画素が削られた: ' + w);
  });

  test('#R783 ⑥ center と allTouched は #R764 のまま — この修正は fractional の数だけを直す', async () => {
    const { data, raster } = await boot();
    const g = data.add(onePixel(10));
    const half = { type: 'Polygon', coordinates: [boxRing(0, 0, 0.4, 1)] };
    const c = await raster.zonal(g, 0, half, {});                             /* 既定 */
    assert.deepEqual({ ok: c.ok, boundary: c.boundary, count: c.count, area: c.areaKm2 },
      { ok: true, boundary: 'center', count: 0, area: 0 }, '既定の center が動いた');
    const a = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'allTouched' });
    const whole = await raster.pixelAreaKm2(g, 0);
    assert.equal(a.count, 1, 'allTouched が触れた画素を落とした');
    near(a.areaKm2, whole.km2, 'allTouched は丸ごと数える規則のまま');
  });

  /* ══ ⑦ 近道は「証明」であって「省略」ではない ═══════════════════════════════════════════════════
     The point of the boundary question is that the interior pixel still costs no clipper call. That is
     measured by counting the calls, because a shortcut that quietly stopped firing would leave every
     number in this file correct and the walk 10× slower. */
  function counting(geometry) {
    const n = { intersection: 0 };
    const wrapped = Object.assign(Object.create(null), geometry, {
      attempt: Object.assign(Object.create(null), geometry.attempt, {
        intersection: (a, b) => { n.intersection++; return geometry.attempt.intersection(a, b); },
      }),
    });
    return { wrapped, n };
  }

  test('#R783 ⑦ 丸ごと内部の画素は clipper を 1 度も呼ばない（近道は生きている）', async () => {
    const { w, data, geometry, raster, ops } = await boot();
    const { wrapped, n } = counting(geometry);
    w.IntMapGisGeometry = wrapped;
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, { type: 'Polygon', coordinates: [boxRing(-1, -1, 2, 2)] },
      { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.ok, true, r.why);
    assert.equal(n.intersection, 0, '内部の画素で交差計算が走った（近道が死んでいる）');
  });

  test('#R783 ⑦ 切り込みのある画素は clipper を呼ぶ（証明できないものを証明したと言わない）', async () => {
    const { w, data, geometry, raster, ops } = await boot();
    const { wrapped, n } = counting(geometry);
    w.IntMapGisGeometry = wrapped;
    const g = data.add(onePixel(10));
    const r = await raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.ok, true, r.why);
    assert.ok(n.intersection >= 1, '切り込みのある画素が交差計算なしで決められた');
  });

  /* ══ ⑧ 経度の枠が 1 周ずれていても、証明は証明のままでなければならない ═════════════════════════
     A grid written 200…201 and the same zone written −160…−159 are the same ground. The geometry
     kernel shifts a part by whole turns before it tests a point, and a pixel's longitudes come from
     the grid exactly as the producer wrote them, so the boundary question has to be asked across every
     turn — otherwise 「辺は遠い」 would be answered about the wrong copy of the world and the #R783
     defect would come back through the seam.
     ⚠ MEASURED 2026-09-17, AND IT IS NOT THIS FILE'S KERNEL: for two geometries written a whole turn
     apart the boolean road comes back EMPTY — js/gis-geometry.js's `alignTo` is handed a MULTI by
     `boolOpR` while its `lonRange` reads that multi as a list of rings, so it computes no range and
     shifts nothing (`intersection(pixel@200…201, box@−161…−158)` → null; the same pair written in one
     frame → the expected box). So the notched zone's weight cannot be checked against the sphere here
     yet. What CAN be checked, and is what this fix owns, is that the notch is never reported as WHOLE:
     the shortcut must refuse to prove an interior it cannot prove, whichever frame the zone arrived
     in. This assertion stays true once the kernel aligns multis as well. */
  test('#R783 ⑧ 1 周ずれた枠でも、切り込みのある画素を「丸ごと」と言わない', async () => {
    const w = await weightOf(shift(SLOT_ZONE, -160), { west: 200 });
    assert.ok(w < 1, '1 周ずれた枠で切り込みが丸ごと扱いになった: ' + w);
    const want = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;
    assert.ok(w === 0 || Math.abs(w - want) < CLOSE,
      '0（上流が枠を揃えられない）でも ' + want + '（揃えられた）でもない値が出た: ' + w);
  });

  test('#R783 ⑧ 1 周ずれた枠で画素を丸ごと覆う区域は 1 — 辺は「どの周でも」遠いので証明できる', async () => {
    const whole = await weightOf({ type: 'Polygon', coordinates: [boxRing(-161, -1, -158, 2)] }, { west: 200 });
    assert.equal(whole, 1, '1 周ずれた枠で内部の画素が削られた: ' + whole);
  });

  /* ══ ⑨ 画素が何枚もある区域 — 歩き全体が直った重みを運ぶ ═══════════════════════════════════════
     Four pixels in one row (so one row's ground answers for all four), with a slot cut into the
     second one only. The expected total is the four weights computed from the sphere above. */
  test('#R783 ⑨ 複数画素の走査でも、切り込みのある画素だけが減る', async () => {
    const { data, raster, ops } = await boot();
    const cells = Float64Array.from([1, 1, 1, 1]);
    const g = data.add({
      kind: 'raster', title: 'g', width: 4, height: 1,
      grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
      bands: [{ name: 'v', unit: null, nodata: null }], read: () => cells,
    });
    /* 区域は 4 画素すべてを覆い、2 枚目（lng 1→2）にだけ幅 0.2°・奥行き 0.4° の切り込みを持つ */
    const zone = {
      type: 'Polygon',
      coordinates: [[[-0.5, -0.5], [4.5, -0.5], [4.5, 1.5], [1.6, 1.5], [1.6, 0.6], [1.4, 0.6], [1.4, 1.5], [-0.5, 1.5], [-0.5, -0.5]]],
    };
    const r = await raster.zonal(g, 0, zone, { boundary: 'fractional', areaOf: ops.areaKm2 });
    assert.equal(r.ok, true, r.why);
    const whole = await raster.pixelAreaKm2(g, 0);
    const want = 4 - share(1.4, 0.6, 1.6, 1) / PIXEL;      /* 3 枚は 1、1 枚だけ切り込みぶん欠ける */
    near(r.areaKm2 / whole.km2, want, '4 画素の合計');
    assert.equal(r.count, 4, '画素の数が重みで割られている');
  });

  /* ============================================================================
   *  ⑩⑪⑫ · 「合計」は 3 つある — どれを出したのかは量の意味が決める（監査 §4.2 / §9）
   * ----------------------------------------------------------------------------
   *  One field called 「合計」 over a grid of unknown meaning is three different numbers wearing one
   *  name: Σ value（観測値の合計）, Σ value·km²（密度の面積積分）, Σ value·cover（画素総量の区域内
   *  配分）. They agree only when every pixel is whole and every cell has the same ground, which is
   *  true of no real zone on a sphere.
   *
   *  ⚠ WHAT IS MEASURED HERE IS NOT A NEW MEANING FOR AN OLD FIELD. `sum`, `sumTimesAreaKm2`, `mean`
   *  and the rest answer exactly what they answered before, and ⑫ measures that a caller who chooses
   *  nothing cannot even tell the choice exists. What is added is the ASKING — and the answer to it
   *  carries the unit kernel's verdict, because the judgement 「その集計をしてよいか」 belongs to
   *  js/gis-units.js and a second copy of it here would be a second rule.
   *
   *  ⚠⚠⚠ AND AN UNDECLARED QUANTITY IS NOT A PERMISSION. 「誰も述べていない」 must come back as a
   *  named refusal with NO number — never as a complete-looking total nobody vouched for.
   * ==========================================================================*/

  const DENSITY = { kind: 'density', unit: '1/km2' };          /* space は kind から perArea */
  const AMOUNT = { kind: 'amount', space: 'total', unit: 'kg' };
  const AMOUNT_NO_SPACE = { kind: 'amount', unit: 'kg' };      /* 読めるが、空間の意味は未申告 */
  const RATIO = { kind: 'ratio' };

  /* the same notched zone as ①, so the cover weight in play is the one the sphere gives */
  const NOTCH_WEIGHT = 1 - share(0.4, 0.6, 0.6, 1) / PIXEL;

  async function totalOf(rule, quantity, opts) {
    const B = (opts && opts.boot) || await boot();
    const band = { name: 'v', unit: 'kg', nodata: null };
    if (opts && opts.onBand) band.quantity = quantity;
    const g = B.data.add(onePixel(10, null, band));
    const r = await B.raster.zonal(g, 0, SLOT_ZONE, {
      boundary: (opts && opts.boundary) || 'fractional', areaOf: B.ops.areaKm2,
      total: rule, quantity: (opts && opts.onBand) ? null : quantity,
    });
    assert.equal(r.ok, true, 'zonal が断った: ' + r.why);
    const whole = await B.raster.pixelAreaKm2(g, 0);
    return { r: r, total: r.total, pixelKm2: whole.km2 };
  }

  /* ══ ⑩ 密度 — 足せるのは面積を掛けたあと ═══════════════════════════════════════════════════════ */

  test('#R783 ⑩ 密度の面積積分は許される（値は Σ value·km²、球面から独立に確かめられる）', async () => {
    const { total, pixelKm2 } = await totalOf('areaIntegral', DENSITY);
    assert.equal(total.rule, 'areaIntegral');
    assert.equal(total.verdict, 'allowed', '断られた: ' + total.why + ' ' + JSON.stringify(total.units));
    assert.equal(total.timesAreaKm2, true, '面積を掛けたことが答えに残っていない');
    near(total.value / (10 * pixelKm2), NOTCH_WEIGHT, '積分が切り込みぶんを含んでいる／欠いている');
    /* 判断は単位カーネルのもの——その語がそのまま運ばれていること */
    assert.equal(total.units.remedy, 'multiply-by-area-then-sum', '単位カーネルの処方が運ばれていない');
  });

  test('#R783 ⑩ 密度をそのまま足すことは断られ、代わりに何が効くかが名前で返る', async () => {
    for (const rule of ['observations', 'apportioned']) {
      const { total } = await totalOf(rule, DENSITY);
      assert.equal(total.verdict, 'refused', rule + ' が通った');
      assert.equal(total.value, null, rule + ' が数を出した（断りに数が付いている）');
      assert.deepEqual(total.fits, ['areaIntegral'], rule + ' の代替が名前で返っていない: ' + JSON.stringify(total.fits));
      assert.equal(total.why, 'total-rule-does-not-fit-the-quantity');
    }
  });

  /* ══ ⑪ 画素ごとの総量 — 観測値の合計と、区域内への配分 ═══════════════════════════════════════ */

  test('#R783 ⑪ 観測値の合計は Σ value（画素は 1 つとして数えられる）', async () => {
    const { total, r } = await totalOf('observations', AMOUNT);
    assert.equal(total.verdict, 'allowed', total.why);
    assert.equal(total.value, 10, '観測値の合計が重みで割られた');
    assert.equal(total.value, r.sum, '既存の sum と別の数になった');
    assert.equal(total.timesAreaKm2, false);
  });

  test('#R783 ⑪ 区域内配分は Σ value·被覆 — 境界の画素の総量が両隣に丸ごと渡らない', async () => {
    const { total } = await totalOf('apportioned', AMOUNT);
    assert.equal(total.verdict, 'allowed', total.why);
    near(total.value, 10 * NOTCH_WEIGHT, '配分が被覆を取っていない');
  });

  test('#R783 ⑪ center では画素が割られないので、配分は観測値の合計と一致する', async () => {
    const a = await totalOf('apportioned', AMOUNT, { boundary: 'center' });
    const b = await totalOf('observations', AMOUNT, { boundary: 'center' });
    assert.equal(a.total.value, b.total.value, 'center で 2 つの規則が違う数を出した');
    assert.equal(a.total.value, 10);
  });

  test('#R783 ⑪ 画素ごとの総量に面積を掛けて足すことは断られる（面積を二重に数えている）', async () => {
    const { total } = await totalOf('areaIntegral', AMOUNT);
    assert.equal(total.verdict, 'refused');
    assert.equal(total.value, null);
    assert.deepEqual(total.fits.slice().sort(), ['apportioned', 'observations'], '代替が名前で返っていない: ' + JSON.stringify(total.fits));
  });

  test('#R783 ⑪ どの規則も意味を持たない量（割合）は、3 つとも断られる', async () => {
    for (const rule of ['observations', 'areaIntegral', 'apportioned']) {
      const { total } = await totalOf(rule, RATIO);
      assert.equal(total.verdict, 'refused', rule + ' が割合を合計した');
      assert.equal(total.value, null);
      assert.deepEqual(total.fits, [], rule + ': 合う規則が無いのに候補が返った');
      assert.equal(total.units.remedy, 'weightedMean', '単位カーネルの処方（分母で重み付け）が運ばれていない');
    }
  });

  /* ══ ⑫ 未申告は許可ではない／既存の答えは 1 ビットも動かない ═════════════════════════════════ */

  test('#R783 ⑫ 量が未申告なら、規則の名前だけが返り数は返らない', async () => {
    for (const spec of [null, AMOUNT_NO_SPACE]) {
      for (const rule of ['observations', 'areaIntegral', 'apportioned']) {
        const { total } = await totalOf(rule, spec);
        assert.equal(total.verdict, 'undeclared', rule + ': 未申告が「してよい」と読み替えられた');
        assert.equal(total.value, null, rule + ': 未申告の量に数が出た');
        assert.equal(total.rule, rule, '何を頼まれたのかが答えに残っていない');
        assert.ok(total.why === 'quantity-undeclared' || total.why === 'quantity-space-undeclared',
          '未申告の理由が名前になっていない: ' + total.why);
      }
    }
  });

  test('#R783 ⑫ 単位カーネルが無い build は「訊けなかった」と答える（「してよい」ではない）', async () => {
    const B = await boot({ noUnits: true });
    const g = B.data.add(onePixel(10));
    const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'observations', quantity: AMOUNT });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.total.verdict, 'unavailable', '単位カーネル無しで合計が許された: ' + JSON.stringify(r.total));
    assert.equal(r.total.value, null);
    assert.equal(r.total.why, 'units-unavailable');
  });

  /* ⚠ MEASURED 2026-09-17: a record built by js/gis-datasets.js `add()` rebuilds each band as exactly
     {name, unit, nodata}, so a quantity declared ON THE BAND does not survive that door yet — for a
     dataset-backed grid only the CALLER can declare one today. That is a gap in the supply side and not
     in this rule, so the band road is measured here on a raster object that carries its own bands (the
     shape `zonal` validates and accepts), and the gap is stated rather than asserted: this test must
     not turn green-into-red the day the datasets kernel starts carrying the declaration. */
  test('#R783 ⑫ 量の申告は帯からも呼び手からも読まれ、どちらが述べたかが答えに残る', async () => {
    const B0 = await boot();
    const declaring = {
      kind: 'raster', title: 'g', width: 1, height: 1,
      grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
      bands: [{ name: 'v', unit: 'kg', nodata: null, quantity: AMOUNT }],
      read: () => Float64Array.from([10]),
    };
    const onBand = await B0.raster.zonal(declaring, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B0.ops.areaKm2, total: 'observations' });
    assert.equal(onBand.ok, true, onBand.why);
    assert.equal(onBand.total.quantityFrom, 'band', '帯の申告が読まれていない');
    assert.equal(onBand.total.verdict, 'allowed', onBand.total.why);
    const byCaller = await totalOf('observations', AMOUNT);
    assert.equal(byCaller.total.quantityFrom, 'caller', '呼び手の申告が読まれていない');
    /* 呼び手が述べたものが帯の申告より強い（この呼び出しについて述べているのは呼び手） */
    const B = await boot();
    const g = B.data.add(onePixel(10, null, { name: 'v', unit: 'kg', nodata: null, quantity: DENSITY }));
    const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'observations', quantity: AMOUNT });
    assert.equal(r.total.quantityFrom, 'caller');
    assert.equal(r.total.verdict, 'allowed', '呼び手の申告が帯の申告に負けた: ' + r.total.why);
  });

  test('#R783 ⑫ 知らない規則は語彙を添えて断られる（黙って合計しない）', async () => {
    const B = await boot();
    const g = B.data.add(onePixel(10));
    const r = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'grandTotal' });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'total-rule-unknown');
    assert.deepEqual(r.detail.rules.slice().sort(), ['apportioned', 'areaIntegral', 'observations']);
  });

  test('#R783 ⑫ 規則を選ばなかった呼び出しの答えは、1 ビットも動かず total の欄も生えない', async () => {
    const B = await boot();
    const g = B.data.add(onePixel(10, null, { name: 'v', unit: 'kg', nodata: null, quantity: AMOUNT }));
    const bare = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2 });
    const asked = await B.raster.zonal(g, 0, SLOT_ZONE, { boundary: 'fractional', areaOf: B.ops.areaKm2, total: 'apportioned' });
    assert.equal(Object.prototype.hasOwnProperty.call(bare, 'total'), false, '頼んでいない欄が生えた');
    for (const k of ['ok', 'boundary', 'count', 'nodataCount', 'sum', 'sumTimesAreaKm2', 'mean', 'min', 'max', 'areaKm2', 'valueAreaKm2']) {
      assert.deepEqual(bare[k], asked[k], k + ' が規則を頼んだだけで変わった');
    }
    assert.deepEqual(Object.keys(asked).filter((k) => !Object.prototype.hasOwnProperty.call(bare, k)), ['total'],
      '増えた欄が total だけではない');
    /* そして既存の 2 つの欄は #R764 の意味のまま — 一方は画素ごと、他方は面積積分 */
    assert.equal(bare.sum, 10, 'sum の意味が動いた');
    near(bare.sumTimesAreaKm2, 10 * (await B.raster.pixelAreaKm2(g, 0)).km2 * NOTCH_WEIGHT, 'sumTimesAreaKm2 の意味が動いた');
  });

  ISOLATED.built();
});
