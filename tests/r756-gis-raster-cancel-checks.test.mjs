/* ============================================================================
 *  #R756 · 画素のループは止まらなかった — cancellation reaching INSIDE the raster walks
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT THIS FILE IS WRITTEN FOR, MEASURED BEFORE IT WAS TOUCHED:
 *
 *    ·  js/gis-warp.js had a per-row abort — `if (ctx && !(await ctx.tick(W, N)))` — that was NEVER
 *       EVALUATED. `useCtx()` reads `opts.ctx`, and the number of places in js/ that passed a `ctx`
 *       to a warp was ZERO; the callers passed `{ method, signal, onProgress }`. A written-down
 *       cancellation with no caller is a cancellation that does not exist.
 *    ·  js/gis-raster.js `combine` was not async, took no ctx, and walked `width·height` in one
 *       uninterruptible `for`. Its caller ticked ONCE, before the walk. So a reader who started a
 *       calculation over a large grid could not get the thread back until it ended — and the code
 *       that would have set `signal.aborted` does not run on a held thread, so the stop button was
 *       not slow, it was UNREACHABLE. `mask`, `diff`, `merge` and `zonal` had the same shape.
 *
 *  That is [[intmap-sync-loop-cannot-be-cancelled]], one level down from where it was first found.
 *
 *  ⚠ SO WHAT IS MEASURED HERE IS NOT 「関数は ctx を受け取るか」. A function that accepts a ctx and
 *  ignores it passes that ([[intmap-restate-the-defect-not-the-fix]]). What is measured is that the
 *  work STOPS — that the number of pixels the walk actually touched is smaller than the grid — and
 *  that stopping leaves no half-built answer wearing `ok: true`.
 *
 *    ① a stopped combine really stops: fewer pixels were visited than the grid has
 *    ② every whole-grid walk stops, and none of them hands back half an answer as a success
 *    ③ js/gis-warp.js's abort is REACHED, and is reached BETWEEN two pixels — not only between rows
 *    ④ a call that hands over no ctx still answers synchronously, with the same numbers
 *    ⑤ a ctx that never asks to stop changes NOT ONE PIXEL (the yield has no false negatives)
 *    ⑥ there is ONE shape of a cancellation in this layer, not one per walk
 *    ⑦ the pause is NOT a count of rows or pixels written into this layer
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r749-gis-raster-pipeline-checks and tests/r749-gis-warp-checks: js/geodesy.js
   publishes onto `window` at top level and exports nothing, so it is evaluated as a browser does. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

async function boot() {
  const w = installWindow();
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const raster = makeGisRaster();
  const geometry = makeGisGeometry();
  const crs = makeGisCrs();
  const warp = makeGisWarp();
  w.IntMapGisRaster = raster; w.IntMapGisGeometry = geometry;
  w.IntMapGisCrs = crs; w.IntMapGisWarp = warp;
  await geometry.ready();
  await crs.ready();
  return { w, raster, geometry, crs, warp };
}

/* ── the grids, stated as a function of position (same shape tests/r749 states one) ──────────── */

function grid(o) {
  const { west, north, pixelLng, pixelLat, width, height } = o;
  const data = new Float64Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) data[r * width + c] = o.value(c, r);
  }
  return {
    width, height,
    crs: o.crs || 'EPSG:4326',
    bands: [Object.assign({ name: o.name || 'v', unit: o.unit === undefined ? null : o.unit, nodata: null }, o.band || {})],
    grid: { west, north, pixelLng, pixelLat },
    read: (i) => ((i == null || i === 0) ? data : null),
    _data: data,
  };
}

/* A grid big enough that stopping it is a real question: 120,000 pixels. The values are not
   constant, so a walk that stopped early and a walk that ran on cannot produce the same array by
   accident. */
function bigPair() {
  const spec = { west: 0, north: 60, pixelLng: 0.001, pixelLat: 0.0001, width: 400, height: 300 };
  const a = grid(Object.assign({}, spec, { value: (c, r) => r * 400 + c }));
  const b = grid(Object.assign({}, spec, { value: (c, r) => (c % 7) - 3 }));
  return { a, b, total: 400 * 300 };
}

/* The ctx docs/GIS-CORE.md §2.6 describes and js/gis-ops.js `makeCtx` builds: `tick(units,total)`
   accumulates and answers 「続けてよいか」. ⚠ THE STUB IS NOT MORE CAPABLE THAN THE REAL ONE — it
   counts the units it is handed and nothing else, so nothing here can stop that the real one could
   not ([[intmap-r671-lessons]]). */
function stopAfter(limit) {
  let done = 0;
  const asks = [];
  return {
    asks,
    aborted: () => false,
    done: () => done,
    async tick(units, total) { done += units; asks.push([units, total]); return done < limit; },
  };
}

function neverStops() {
  let done = 0;
  const asks = [];
  return { asks, aborted: () => false, done: () => done, async tick(units, total) { done += units; asks.push([units, total]); return true; } };
}

/* NaN-aware, because every grid here writes NaN for a void and NaN !== NaN. */
function sameValues(x, y, what) {
  assert.equal(x.length, y.length, what + ': different lengths');
  for (let i = 0; i < x.length; i++) {
    const a = x[i], b = y[i];
    if (Number.isNaN(a) && Number.isNaN(b)) continue;
    if (a !== b) assert.fail(what + ': pixel ' + i + ' differs — ' + a + ' vs ' + b);
  }
}

const SQUARE = {
  type: 'Polygon',
  coordinates: [[[0.05, 59.99], [0.35, 59.99], [0.35, 60.0], [0.05, 60.0], [0.05, 59.99]]],
};

/* ══ ① ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ① a stopped combine stops — fewer pixels were visited than the grid has', async () => {
  const { raster } = await boot();
  const { a, b, total } = bigPair();

  /* ⚠ THE COUNTER IS IN THE ARITHMETIC ITSELF, not in the report. `fn` is called exactly once per
     pixel the walk reached, so this number is the defect restated: before #R756 it was `total` no
     matter what the reader asked for, because there was nothing in the loop that could stop. */
  let visited = 0;
  const ctx = stopAfter(2000);
  const r = await raster.combine(a, b, 0, 0, (x, y) => { visited++; return (x == null || y == null) ? null : x + y; }, { ctx: ctx });

  assert.equal(r.ok, false, 'a stopped run reported success');
  assert.equal(r.why, 'cancelled');
  assert.ok(visited > 0, 'the walk never started');
  assert.ok(visited < total, 'the arithmetic ran over all ' + total + ' pixels after the reader asked it to stop');
  /* and the report says where it got to, with the same number the arithmetic counted */
  assert.equal(r.done, visited, 'the run reported ' + r.done + ' pixels and computed ' + visited);
  assert.equal(r.total, total);
  /* ⚠ AND NO HALF-BUILT GRID CAME BACK. A stopped calculation whose output were handed over anyway
     is a picture of the first few rows with the rest silently void, which reads as data. */
  assert.equal(r.raster, undefined, 'a stopped combine handed back a partly filled grid');
});

/* ══ ② ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ② every whole-grid walk stops, and none returns half an answer as a success', async () => {
  const { raster } = await boot();
  const { a, b, total } = bigPair();

  const runs = [
    ['combine', (ctx) => raster.combine(a, b, 0, 0, (x, y) => (x == null ? null : x), { ctx: ctx })],
    ['mask', (ctx) => raster.mask(a, 0, { op: '>=', value: 100 }, { ctx: ctx })],
    ['diff', (ctx) => raster.diff(a, b, 0, { ctx: ctx })],
    ['merge', (ctx) => raster.merge(a, b, 0, { overlap: 'first', ctx: ctx })],
    ['zonal', (ctx) => raster.zonal(a, 0, SQUARE, { ctx: ctx })],
  ];

  for (const [name, run] of runs) {
    const ctx = stopAfter(1500);
    const r = await run(ctx);
    assert.equal(r.ok, false, name + ' reported success after being stopped');
    assert.equal(r.why, 'cancelled', name + ' stopped under another name');
    assert.ok(r.done > 0, name + ' never started');
    assert.ok(r.done < r.total, name + ' walked all ' + r.total + ' of its pixels anyway');
    assert.equal(r.raster, undefined, name + ' handed back a partly built grid');
    assert.equal(r.count, undefined, name + ' handed back statistics of a walk it did not finish');
    /* the zone's window is smaller than the grid, so its total is its own — what must hold for all
       five is that the total is the walk they were actually running */
    if (name !== 'zonal') assert.equal(r.total, total, name + ' misreported the size of its walk');
  }
});

/* ══ ③ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ③ the warp abort is reached, and between two pixels rather than between two rows', async () => {
  const { warp } = await boot();
  /* ⚠ A GRID WHOSE ROW IS WIDER THAN THE WHOLE BUDGET, WHICH IS THE POINT. A walk paced by ROWS
     cannot let go before pixel 2,048 however short the reader's patience is; the defect is that a
     row is a COUNT and a row of this grid is 50 times the work of a row of a 40-wide one. */
  const src = grid({ west: 0, north: 10, pixelLng: 0.001, pixelLat: 0.01, width: 2048, height: 4, value: (c, r) => c + r });
  const N = 2048 * 4;

  const ctx = stopAfter(300);
  const r = await warp.to4326(src, { method: 'nearest', ctx: ctx });
  assert.equal(r.ok, false, 'a stopped warp reported success');
  assert.equal(r.why, 'cancelled');
  assert.ok(r.done > 0, 'the warp never started');
  assert.ok(r.done < src.width, 'the warp could not be let go of before a whole row of ' + src.width + ' pixels was done');
  assert.equal(r.total, N);
  assert.equal(r.grid, undefined, 'a stopped warp handed back a grid');
  assert.ok(ctx.asks.length > 0 && ctx.asks[0][1] === N, 'progress was reported without a total');

  /* and the same warp with nobody asking it to stop completes — so ③ measured a stop, not a break */
  const full = await warp.to4326(src, { method: 'nearest' });
  assert.equal(full.ok, true, full.why);
  assert.equal(full.report.cells, N);
});

/* ══ ④ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ④ a call that hands over no ctx answers synchronously, as it always did', async () => {
  const { raster } = await boot();
  const a = grid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 3, value: (c, r) => r * 4 + c });
  const b = grid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 3, value: () => 2 });

  /* ⚠ MEASURED AS 「THE ANSWER ITSELF CAME BACK」, not as 「it did not throw」. js/gis-warp.js calls
     `sample` inside its own loop and js/gis-datasets.js describes a grid on the spot; a kernel that
     started returning promises to callers that never asked for one would break both silently. */
  const results = {
    combine: raster.combine(a, b, 0, 0, (x, y) => x * y, { name: 'ab' }),
    mask: raster.mask(a, 0, { op: '>=', value: 4 }),
    diff: raster.diff(a, b, 0),
    merge: raster.merge(a, b, 0, { overlap: 'max' }),
    zonal: raster.zonal(a, 0, { type: 'Polygon', coordinates: [[[0.1, 8.1], [3.9, 8.1], [3.9, 9.9], [0.1, 9.9], [0.1, 8.1]]] }),
  };
  for (const [name, r] of Object.entries(results)) {
    assert.equal(typeof (r && r.then), 'undefined', name + ' returned a promise to a caller that handed over no ctx');
    assert.equal(r.ok, true, name + ' refused: ' + r.why);
  }

  /* the numbers themselves, stated rather than compared against another run of the same code */
  assert.deepEqual(Array.from(results.combine.raster.read(0)), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  assert.equal(results.mask.kept, 8);
  assert.equal(results.mask.dropped, 4);
  assert.deepEqual(Array.from(results.diff.raster.read(0)), [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Array.from(results.merge.raster.read(0)), [2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(results.zonal.count, 8, 'the zone covers the top two rows');
  assert.equal(results.zonal.sum, 0 + 1 + 2 + 3 + 4 + 5 + 6 + 7);
});

/* ══ ⑤ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ⑤ a ctx that never asks to stop changes not one pixel', async () => {
  const { raster, warp } = await boot();
  const { a, b, total } = bigPair();

  /* ⚠ THE FALSE-NEGATIVE CHECK. Pacing a loop means breaking it into pieces, and a piece boundary
     that carried state badly — a row's ground area recomputed against the wrong row, a column list
     walked twice — would change the ANSWER while every cancellation test above stayed green. So the
     reference is the SAME CALL WITH NO CTX, and the comparison is pixel by pixel. */
  const pairs = [
    ['combine', () => raster.combine(a, b, 0, 0, (x, y) => (x == null || y == null) ? null : x / (y || 1), { name: 'q' })],
    ['mask', () => raster.mask(a, 0, { op: 'between', value: [500, 90000] })],
    ['diff', () => raster.diff(a, b, 0)],
    ['merge', () => raster.merge(a, b, 0, { overlap: 'mean' })],
  ];
  for (const [name, plain] of pairs) {
    const ref = plain();
    assert.equal(ref.ok, true, name + ' refused: ' + ref.why);
    const ctx = neverStops();
    const withCtx = await (name === 'combine'
      ? raster.combine(a, b, 0, 0, (x, y) => (x == null || y == null) ? null : x / (y || 1), { name: 'q', ctx: ctx })
      : name === 'mask' ? raster.mask(a, 0, { op: 'between', value: [500, 90000] }, { ctx: ctx })
        : name === 'diff' ? raster.diff(a, b, 0, { ctx: ctx })
          : raster.merge(a, b, 0, { overlap: 'mean', ctx: ctx }));
    assert.equal(withCtx.ok, true, name + ' refused with a ctx: ' + withCtx.why);
    sameValues(ref.raster.read(0), withCtx.raster.read(0), name);
    assert.equal(withCtx.nodataCount, ref.nodataCount, name + ': a different number of voids');
    assert.equal(ctx.done(), total, name + ': the progress line stopped short of 100%');
  }

  /* zonal: every statistic, because its walk is the one that was flattened from rows×columns */
  const zRef = raster.zonal(a, 0, SQUARE, { classes: true });
  const zCtx = await raster.zonal(a, 0, SQUARE, { classes: true, ctx: neverStops() });
  assert.equal(zRef.ok, true, zRef.why);
  for (const k of ['count', 'nodataCount', 'sum', 'sumTimesAreaKm2', 'mean', 'min', 'max', 'areaKm2', 'valueAreaKm2']) {
    assert.equal(zCtx[k], zRef[k], 'zonal ' + k + ' moved when a ctx was handed over');
  }
  assert.deepEqual(zCtx.classAreasKm2, zRef.classAreasKm2, 'zonal class areas moved when a ctx was handed over');
  assert.ok(zRef.count > 0, 'the zone measured nothing, so ⑤ compared two empty answers');

  /* and the warp, whose loop moved out of js/gis-warp.js entirely */
  const src = grid({ west: 0, north: 10, pixelLng: 0.05, pixelLat: 0.05, width: 60, height: 40, value: (c, r) => c * r });
  const wRef = await warp.to4326(src, { method: 'bilinear' });
  const wCtx = await warp.to4326(src, { method: 'bilinear', ctx: neverStops() });
  assert.equal(wRef.ok, true, wRef.why);
  assert.equal(wCtx.ok, true, wCtx.why);
  sameValues(wRef.grid.read(0), wCtx.grid.read(0), 'warp');
  assert.deepEqual(wCtx.report, wRef.report, 'the warp reported different counts with a ctx');
});

/* ══ ⑥ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ⑥ there is one shape of a cancellation in this layer, not one per walk', async () => {
  const { raster, warp } = await boot();
  const { a, b } = bigPair();

  const stopped = [];
  stopped.push(['combine', await raster.combine(a, b, 0, 0, (x) => x, { ctx: stopAfter(900) })]);
  stopped.push(['mask', await raster.mask(a, 0, { op: '>', value: 0 }, { ctx: stopAfter(900) })]);
  stopped.push(['diff', await raster.diff(a, b, 0, { ctx: stopAfter(900) })]);
  stopped.push(['merge', await raster.merge(a, b, 0, { overlap: 'min', ctx: stopAfter(900) })]);
  stopped.push(['zonal', await raster.zonal(a, 0, SQUARE, { ctx: stopAfter(900) })]);
  stopped.push(['warp', await warp.to4326(a, { method: 'nearest', ctx: stopAfter(900) })]);
  /* polygonize and fromSamplerAsync read a `signal` instead of a ctx — a different door, and the
     reader on the other side of it is the same reader. */
  const ab = new (globalThis.AbortController)();
  ab.abort();
  const cls = grid({ west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 40, height: 40, value: (c, r) => (c + r) % 3 });
  stopped.push(['polygonize', await raster.polygonize(cls, 0, { signal: ab.signal })]);
  stopped.push(['fromSamplerAsync', await raster.fromSamplerAsync({
    bounds: [0, 0, 1, 1], width: 8, height: 8, signal: ab.signal, sample: async () => 1,
  })]);

  for (const [name, r] of stopped) {
    assert.equal(r.ok, false, name + ' reported success');
    assert.equal(r.why, 'cancelled', name + ' stopped under another name');
    /* ⚠ BOTH READERS. js/gis-ops.js reports the pair at the top level and js/gis-panel.js prints
       `detail.done`/`detail.total`; a walk that wrote only one of the two would be invisible to one
       of them ([[intmap-two-readers-one-field-list]]), and that is what js/gis-warp.js used to do. */
    assert.equal(typeof r.done, 'number', name + ': no top-level `done`');
    assert.equal(typeof r.total, 'number', name + ': no top-level `total`');
    assert.ok(r.detail && r.detail.done === r.done && r.detail.total === r.total, name + ': `detail` disagrees with the top level');
    assert.ok(r.done <= r.total, name + ': it walked past the end of its own work');
  }

  /* and the constructor the whole layer builds it with is the ONE place it is written */
  assert.deepEqual(raster.cancelled(3, 9), { ok: false, why: 'cancelled', done: 3, total: 9, detail: { done: 3, total: 9 } });
});

/* ══ ⑦ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R756 ⑦ how long a pause waits is not a count written into this layer', () => {
  const warpSrc = read('js/gis-warp.js');
  const rasterSrc = read('js/gis-raster.js');

  /* ⚠ THE DEFECT, RESTATED: js/gis-warp.js ticked once per output ROW, so 「16 ms」 was being spent
     in units that are a different duration on every grid (docs/GIS-CORE.md §2.6). The fix is not
     「行より細かく刻む」 — a finer count is still a count — it is that this file no longer decides
     the length of a pause at all. So it must not contain its own pixel walk any more. */
  assert.ok(!/ctx\.tick\(W, N\)/.test(warpSrc), 'js/gis-warp.js still paces by whole rows');
  assert.ok(/R\.paced|S\.R\.paced/.test(warpSrc), 'js/gis-warp.js no longer hands its walk to the kernel');

  /* and the kernel's walk asks the pacer — it does not hold a millisecond budget of its own beside
     the one js/gis-ops.js `makeCtx` owns, which would be two gates on one budget */
  const paced = rasterSrc.slice(rasterSrc.indexOf('function paced('), rasterSrc.indexOf('/* ── validity'));
  assert.ok(paced.length > 100, 'paced() was not found — this check stopped measuring anything');
  assert.ok(/await ctx\.tick\(units, total\)/.test(paced), 'the walk does not ask the pacer at all');
  assert.ok(!/nowMs\(\)/.test(paced), 'the walk keeps a second clock beside the pacer’s');
});
