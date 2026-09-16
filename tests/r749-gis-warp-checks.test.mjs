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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r732 and tests/r743: js/geodesy.js publishes onto `window` at top level and
   exports nothing, so it is evaluated the way a browser evaluates it. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

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
