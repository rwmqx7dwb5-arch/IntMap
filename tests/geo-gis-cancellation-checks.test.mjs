/* ============================================================================
 *  GIS · STOPPING AND THE OTHER THREAD — 中止・Worker
 * ----------------------------------------------------------------------------
 *  A long GIS step can be stopped from inside its loop, a stop changes nothing that was not stopped,
 *  and the worker thread returns the same bytes as this one — or says why it could not be used and
 *  finishes here.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import { ROOT, installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · raster walks stop   (was tests/r756-gis-raster-cancel-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R756 · raster walks stop', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（「この層が自分の時計を持たない」）。 */
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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · ops cancel from inside the pixel loop   (was tests/r756-gis-ops-cancel-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R756 · 中止は、仕事が実際に在る層まで届いているか
 * ----------------------------------------------------------------------------
 *  js/gis-warp.js has had a per-row 「まだ続けてよいか」 since #R749 and js/gis-raster.js grew one per
 *  slice in #R756 — and NOTHING IN js/gis-ops.js PASSED `ctx`, so both were unreachable code that
 *  read as a working cancel. `useCtx()` returned null on every call in the product.
 *
 *  ⚠ THE INVARIANTS ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「run() passes ctx」 is a sentence about an argument
 *  list and it would pass over a kernel that takes the ctx and never asks it anything. What is
 *  measured is what the reader LOSES: the grid large enough to be worth cancelling is exactly the
 *  one that could not be cancelled, because the single uninterrupted pixel loop never let go of the
 *  thread the cancel button's own click handler runs on
 *  ([[intmap-sync-loop-cannot-be-cancelled]], one level down).
 *
 *  ⚠ AND THE OTHER DIRECTION IS MEASURED TOO. A check that only ever sees 「止まった」 passes over an
 *  implementation that answers `cancelled` to everything. Every case below has a twin that must run
 *  to completion and produce the same pixels it produced before the slicing existed.
 * ==========================================================================*/
describe('§ #R756 · ops cancel from inside the pixel loop', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisWarp } = await import('../js/gis-warp.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisRaster = makeGisRaster();
    w.IntMapGisWarp = makeGisWarp();
    w.IntMapGisCrs = makeGisCrs();
    w.IntMapGisExpr = makeGisExpr();
    await geometry.ready();
    return { w, data, ops, RK: w.IntMapGisRaster };
  }

  /* A grid big enough that the work is real. ⚠ 「大きい」 IS THE POINT: a lattice small enough to
     finish inside one frame never reaches a yield, so a check built on a small one measures nothing
     and is green whether or not the cancel is wired. */
  const W = 700, H = 700;

  /* The source text of one runner, so a case that depends on a runner NOT having a top-level guard
     says so out loud and fails the day one is added — rather than passing for a new reason. */
  function runnerOf(op) {
    const src = read('js/gis-ops.js');
    const name = 'run' + op.charAt(0).toUpperCase() + op.slice(1);
    const at = src.indexOf('function ' + name + '(');
    assert.ok(at >= 0, 'no runner named ' + name + ' in js/gis-ops.js');
    const lines = src.slice(at).split(/\r?\n/);
    const end = lines.findIndex((l, i) => i > 0 && l === '    }');
    return lines.slice(0, end < 0 ? lines.length : end).join('\n');
  }

  function grid(data, RK, title, fn) {
    const px = new Float64Array(W * H);
    for (let i = 0; i < px.length; i++) px[i] = fn(i);
    const b = RK.build(
      { west: 0, north: 10, pixelLng: 10 / W, pixelLat: 10 / H, width: W, height: H },
      [{ name: 'v', unit: null, nodata: null }], px);
    assert.ok(b && b.ok, 'the fixture grid was refused: ' + JSON.stringify(b));
    return data.add({
      kind: 'raster', title: title,
      width: b.raster.width, height: b.raster.height, grid: b.raster.grid,
      bands: b.raster.bands, read: b.raster.read,
    });
  }

  /* A signal that fires the first time the op reports progress — i.e. from INSIDE the work, which is
     the only moment that distinguishes a wired cancel from an unwired one. An abort set before the
     call is caught by the guard at the top of every runner and proves nothing about the pixel loop. */
  function abortOnFirstProgress() {
    const ac = new AbortController();
    let ticks = 0;
    return {
      signal: ac.signal,
      onProgress: () => { ticks++; ac.abort(); },
      ticks: () => ticks,
    };
  }

  /* ══ ⑨ 画素ループの内側で中止が効く ══════════════════════════════════════════════════════ */

  test('R756 ⑨ a raster op cancels from inside its pixel loop instead of running to the end', async () => {
    const { data, ops, RK } = await boot();
    const a = grid(data, RK, 'a', (i) => i % 97);
    const b = grid(data, RK, 'b', (i) => i % 31);

    /* ⚠ TWO DIFFERENT LEVERS, BECAUSE THE TWO KINDS OF OP FAIL DIFFERENTLY.
       `rasterCalc` evaluates the reader's expression per pixel and takes many frames, so aborting on
       its first progress report is an abort from INSIDE the loop. `rasterMask` and `rasterDiff` are a
       comparison and a subtraction — fast enough on any lattice a test may allocate that they can
       finish inside one frame, so waiting for a progress report there would measure the machine.
       What makes them decisive instead is that NEITHER HAS A GUARD AT THE TOP OF ITS RUNNER: an
       already-aborted signal is invisible to them unless the kernel asks the ctx mid-walk. So a
       pre-aborted signal is precisely the handover under test, and it is deterministic. */
    const started = new AbortController();
    started.abort();
    const pre = [
      { op: 'rasterMask', inputs: [a.id], params: { op: '>', value: 5 } },
      { op: 'rasterDiff', inputs: [a.id, b.id], params: {} },
    ];
    for (const step of pre) {
      assert.ok(!/await ctx\.tick/.test(runnerOf(step.op)),
        step.op + ' grew a guard at the top of its runner — this case no longer measures the handover');
      const res = await ops.run(step, { signal: started.signal });
      /* ⚠ THE DEFECT: these came back `{ ok: true }` with a finished grid, because the kernel was
         never handed anything to ask. */
      assert.equal(res.ok, false, step.op + ' ran to completion after the reader asked it to stop');
      assert.equal(res.why, 'cancelled', step.op + ' stopped for the wrong reason: ' + res.why);
      assert.equal(res.dataset, undefined, step.op + ' registered a partial answer as a result');
    }

    const g = abortOnFirstProgress();
    const calc = await ops.run(
      { op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'a * b + 1' } },
      { signal: g.signal, onProgress: g.onProgress });
    assert.equal(calc.ok, false, 'rasterCalc ran to completion after the reader asked it to stop');
    assert.equal(calc.why, 'cancelled', 'rasterCalc stopped for the wrong reason: ' + calc.why);
    assert.ok(g.ticks() > 0, 'rasterCalc never reported progress — it never let go of the thread');
    assert.equal(calc.dataset, undefined, 'rasterCalc registered a partial answer as a result');
  });

  /* ══ ⑩ 止まらないときは、刻みが答えを変えていない ════════════════════════════════════════ */

  test('R756 ⑩ slicing the loop does not change one pixel of the answer', async () => {
    const { data, ops, RK } = await boot();
    const a = grid(data, RK, 'a', (i) => i % 97);
    const b = grid(data, RK, 'b', (i) => i % 31);

    /* ⚠ THE REFERENCE IS THE KERNEL ASKED WITHOUT A ctx AT ALL — the same walk with no yielding in it.
       Comparing the sliced run against itself would be measuring nothing. */
    const plain = RK.combine(a, b, 0, 0, (x, y) => x * y + 1, { name: 'v', unit: null, nodata: null });
    assert.ok(plain && plain.ok, 'the unsliced reference was refused: ' + JSON.stringify(plain));

    let progress = 0;
    const res = await ops.run(
      { op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'a * b + 1' } },
      { onProgress: () => { progress++; } });
    assert.equal(res.ok, true, 'rasterCalc refused: ' + JSON.stringify(res.why || res));

    const got = res.dataset.read(0), want = plain.raster.read(0);
    assert.equal(got.length, want.length, 'the sliced run produced a different number of pixels');
    for (let i = 0; i < want.length; i++) {
      const g = got[i], w = want[i];
      if (g !== g && w !== w) continue;                       /* NaN in both is agreement, not a diff */
      assert.equal(g, w, 'pixel ' + i + ' differs: sliced ' + g + ' vs unsliced ' + w);
    }
  });

  /* ══ ⑪ warp の行ごとの中断が、本当に評価される ═══════════════════════════════════════════ */

  test('R756 ⑪ the warp’s per-row check is reached, and a completed warp is unchanged by it', async () => {
    const { data, ops, RK } = await boot();
    const a = grid(data, RK, 'a', (i) => i % 97);
    /* A different lattice, so resample has real work rather than a copy. */
    const target = grid(data, RK, 'target', () => 0);

    const g = abortOnFirstProgress();
    const stopped = await ops.run(
      { op: 'resample', inputs: [a.id, target.id], params: { method: 'nearest' } },
      { signal: g.signal, onProgress: g.onProgress });
    /* ⚠ THE DEFECT: js/gis-warp.js:583 was never evaluated, so this finished. */
    assert.equal(stopped.ok, false, 'the warp ran to completion after the reader asked it to stop');
    assert.equal(stopped.why, 'cancelled', 'the warp stopped for the wrong reason: ' + stopped.why);

    const done = await ops.run(
      { op: 'resample', inputs: [a.id, target.id], params: { method: 'nearest' } });
    assert.equal(done.ok, true, 'an uncancelled resample refused: ' + JSON.stringify(done.why || done));
    assert.equal(done.dataset.width, W, 'the resampled grid lost its width');
    assert.equal(done.dataset.height, H, 'the resampled grid lost its height');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R759 · the worker thread   (was tests/r759-gis-worker-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R759 · Worker があることと、分析が Worker で走ることは別 — the second thread, with a caller
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT, MEASURED BEFORE ANY OF THIS WAS WRITTEN:
 *
 *    ·  js/gis-worker.js (#R752) implements a pool, a registry, a transfer contract and a
 *       cancellation that reaches running arithmetic. `run(`, `register(` and `probe(` had ZERO
 *       callers in js/ and ZERO in tests/.
 *    ·  ONE job was registered (`grid.binary`) and nothing ever ran it.
 *    ·  Every pixel walk in js/gis-raster.js therefore ran on the thread that paints, `paced` so it
 *       could be stopped — which is responsiveness, and is not the second CPU the file was written
 *       to add.
 *
 *  「Worker が実装されている」 was true. 「普段の分析が Worker で走る」 was not, and nothing in the
 *  repository could tell the two apart, because the only readers of that module were its own tests.
 *
 *  SO WHAT IS MEASURED HERE IS NOT 「diff は worker という引数を受け取るか」 — a function that accepts
 *  a door and ignores it would pass that ([[intmap-restate-the-defect-not-the-fix]]). It is that the
 *  pixels are computed IN ANOTHER THREAD, from the job's own registered SOURCE TEXT, and that the
 *  answer is the same one byte for byte.
 *
 *    ① the two runners return the SAME BYTES, and both agree with a fixture written independently
 *    ② the stop reaches arithmetic already running in the other thread, and leaves no half answer
 *    ③ a door that cannot be used finishes on this thread — completely, and says why
 *    ④ the registered jobs and their callers, both DISCOVERED from the source, not listed by hand
 *    ⑤ the job's SOURCE TEXT alone computes the same answer — it closes over nothing
 *
 *  ⚠ THE OTHER THREAD IS REAL. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool
 *  cannot spawn here (`available()` is false, which is what ③ uses). The door below therefore runs
 *  the REAL assembled source — `workerSource()`, the exact text the Blob is built from, including
 *  the protocol preamble — inside a node:worker_threads thread, and speaks only the three message
 *  types that protocol has (`ready` / `progress` / `done`). A stub that ran the job on this thread
 *  would be a stub that cannot be stopped mid-run, which is the one thing ② has to see
 *  ([[intmap-r671-lessons]]: a fake more capable — or more convenient — than the real one fixes the
 *  bug on the way past).
 * ==========================================================================*/
describe('§ #R759 · the worker thread', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* Same boot as tests/geo-gis-cancellation-checks.test.mjs (#R756): js/geodesy.js publishes onto `window` at top
     level and exports nothing, so it is evaluated as a browser does. */
  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisWorker } = await import('../js/gis-worker.js');
    const raster = makeGisRaster();
    const worker = makeGisWorker();
    w.IntMapGisRaster = raster;
    return { w, raster, worker };
  }

  /* ── the door: the product's registry and the product's assembled source, in a real thread ───── */

  /* `self` is what the assembled source talks to. Everything below it is js/gis-worker.js's text. */
  const SHIM = [
    "const { parentPort } = require('node:worker_threads');",
    'globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t || []) };',
    "parentPort.on('message', (d) => { if (typeof self.onmessage === 'function') self.onmessage({ data: d }); });",
    '',
  ].join('\n');

  /* The registry, `available()` and `register()` are the REAL ones (they need no Worker); only the
     pool is this file's, because Node spells a thread differently. One thread per run, exactly as
     js/gis-worker.js does — `terminate()` is not selective, so a worker holds at most one job. */
  function threadDoor(api, opts) {
    const o = opts || {};
    const live = new Set();
    const door = {
      api,
      /* ⚠ THE RAW PROTOCOL, NOT THE KERNEL'S VIEW OF IT. How far the THREAD got is the only evidence
         that `terminate()` reached arithmetic that was running; the kernel stops reading progress the
         moment it aborts, so its own `done` cannot tell a killed walk from a finished one. */
      maxDone: 0,
      available: () => o.available !== false,
      jobNames: () => api.jobNames(),
      register: (name, fn, ro) => api.register(name, fn, ro),
      stop() { for (const w of live) { try { w.terminate(); } catch (_) { } } live.clear(); },
      run(job, payload, ro) {
        const r = ro || {};
        return new Promise((resolve) => {
          if (api.jobNames().indexOf(job) < 0) { resolve({ ok: false, why: 'job-unknown' }); return; }
          const sig = r.signal || null;
          if (sig && sig.aborted) { resolve({ ok: false, why: 'aborted' }); return; }
          const w = new NodeWorker(SHIM + api.workerSource(), { eval: true });
          live.add(w);
          let settled = false;
          const done = (res) => {
            if (settled) return;
            settled = true;
            live.delete(w);
            try { w.terminate(); } catch (_) { }
            resolve(res);
          };
          if (sig) { try { sig.addEventListener('abort', () => done({ ok: false, why: 'aborted' }), { once: true }); } catch (_) { } }
          w.on('message', (m) => {
            if (!m || typeof m !== 'object') return;
            if (m.type === 'ready') { w.postMessage({ type: 'run', id: 1, job: job, payload: payload }); return; }
            if (m.type === 'progress') {
              if (typeof m.done === 'number' && m.done > door.maxDone) door.maxDone = m.done;
              if (typeof r.onProgress === 'function') r.onProgress({ done: m.done, total: m.total });
              return;
            }
            if (m.type !== 'done') return;
            done(m.ok ? { ok: true, value: m.value, transferred: 0 } : { ok: false, why: m.why || 'job-failed', detail: m.detail || null });
          });
          w.on('error', (e) => done({ ok: false, why: 'worker-died', detail: { message: String((e && e.message) || e) } }));
        });
      },
    };
    return door;
  }

  /* ── the grids ───────────────────────────────────────────────────────────────────────────────── */

  function grid(o) {
    const { west, north, pixelLng, pixelLat, width, height } = o;
    const data = new Float64Array(width * height);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = o.value(c, r);
    return {
      width, height,
      bands: [{ name: o.name || 'v', unit: o.unit === undefined ? null : o.unit, nodata: o.nodata === undefined ? null : o.nodata }],
      grid: { west, north, pixelLng, pixelLat },
      read: (i) => ((i == null || i === 0) ? data : null),
      _data: data,
    };
  }

  /* ⚠ A GRID THAT CONTAINS EVERY KIND OF PIXEL THE MISSING RULE HAS TO SEPARATE, and values whose
     differences are all distinct, so two arrays cannot agree by accident. */
  const SPEC = { west: 0, north: 10, pixelLng: 1, pixelLat: 1, width: 4, height: 3 };
  const A_VALUES = [1, 2, NaN, -9999, 5, Infinity, 7, 8, -9999, 10, 11, -Infinity];
  const B_VALUES = [0.5, -2, 3, 4, NaN, 6, 7, -7, 9, 10, -11, 12];

  function pair(o) {
    const op = o || {};
    const a = grid(Object.assign({}, SPEC, { name: 'a', unit: op.unitA === undefined ? 'mm' : op.unitA, nodata: op.nodataA === undefined ? -9999 : op.nodataA, value: (c, r) => A_VALUES[r * SPEC.width + c] }));
    const b = grid(Object.assign({}, SPEC, { name: 'b', unit: op.unitB === undefined ? 'mm' : op.unitB, nodata: op.nodataB === undefined ? null : op.nodataB, value: (c, r) => B_VALUES[r * SPEC.width + c] }));
    return { a, b };
  }

  /* ⚠⚠⚠ WRITTEN HERE, FROM THE RULE AS A SENTENCE, AND NOT FROM EITHER RUNNER. An equality check
     between two paths is green when both are wrong in the same way; this is the third opinion.
     THE RULE: a pixel is missing when its value is not a finite number, or when it equals the
     sentinel its own band declared (a declared −9999 in `a`; `b` declares none, so its −9999s are
     measurements). A difference is the subtraction when neither side is missing, and NaN otherwise. */
  const EXPECTED_DIFF = [
    1 - 0.5,          /* 1, 0.5 */
    2 - -2,           /* 2, −2 */
    NaN,              /* a is NaN */
    NaN,              /* a is its own declared sentinel */
    NaN,              /* b is NaN */
    NaN,              /* a is +Infinity, which is not a measurement */
    7 - 7,            /* 7, 7 */
    8 - -7,           /* 8, −7 */
    NaN,              /* a is the sentinel again */
    10 - 10,          /* 10, 10 */
    11 - -11,         /* 11, −11 */
    NaN,              /* a is −Infinity */
  ];

  function sameBytes(x, y, what) {
    assert.equal(x.length, y.length, what + ': different lengths');
    const bx = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    const by = new Uint8Array(y.buffer, y.byteOffset, y.byteLength);
    for (let i = 0; i < bx.length; i++) {
      if (bx[i] !== by[i]) assert.fail(what + ': byte ' + i + ' differs (pixel ' + Math.floor(i / 8) + ') — ' + x[Math.floor(i / 8)] + ' vs ' + y[Math.floor(i / 8)]);
    }
  }

  /* The ctx docs/GIS-CORE.md §2.6 describes and js/gis-ops.js `makeCtx` builds. ⚠ NOT MORE CAPABLE
     THAN THE REAL ONE: it counts the units it is handed and answers 「続けてよいか」, and nothing here
     can stop a run that the real one could not. */
  function ctxStopping(limit) {
    let done = 0;
    const asks = [];
    return {
      asks,
      aborted: () => false,
      done: () => done,
      signal: null,
      onProgress: null,
      async tick(units, total) { done += units; asks.push([units, total]); return done < limit; },
    };
  }
  function ctxPatient() {
    let done = 0;
    const asks = [];
    return { asks, aborted: () => false, done: () => done, signal: null, onProgress: null, async tick(units, total) { done += units; asks.push([units, total]); return true; } };
  }

  /* ══ ① ═══════════════════════════════════════════════════════════════════════════════════════ */

  test('R759 ① the other thread and this one return the same bytes, and a fixture agrees with both', async () => {
    const { raster, worker } = await boot();
    const door = threadDoor(worker);
    try {
      const { a, b } = pair();

      const here = raster.diff(a, b, 0);
      assert.equal(here.ok, true, 'the main-thread difference refused: ' + here.why);
      /* no door offered → nothing to report about one, and the shape every caller before #R759 reads */
      assert.equal(here.worker, undefined, 'a call that offered no worker was told about one');

      const there = await raster.diff(a, b, 0, { worker: door });
      assert.equal(there.ok, true, 'the worker difference refused: ' + there.why + ' ' + JSON.stringify(there.detail || null));
      assert.deepEqual(there.worker, { used: true, job: 'raster.diff' }, 'the run does not say which thread computed it');

      const hv = here.raster.read(0), tv = there.raster.read(0);
      assert.ok(tv instanceof Float64Array, 'the worker answer is not a Float64Array');
      sameBytes(hv, tv, 'diff');

      /* ⚠ AND NOT ONLY EQUAL TO EACH OTHER. Both are measured against a fixture written from the rule
         as prose, so 「両方が同じだけ間違っていれば緑」 is not available to this check. */
      assert.equal(hv.length, EXPECTED_DIFF.length, 'the fixture and the grid are different sizes');
      for (let i = 0; i < EXPECTED_DIFF.length; i++) {
        const want = EXPECTED_DIFF[i];
        if (Number.isNaN(want)) {
          assert.ok(Number.isNaN(hv[i]), 'pixel ' + i + ' should be missing and is ' + hv[i]);
          assert.ok(Number.isNaN(tv[i]), 'pixel ' + i + ' should be missing in the worker answer and is ' + tv[i]);
        } else {
          assert.equal(hv[i], want, 'pixel ' + i + ' on this thread');
          assert.equal(tv[i], want, 'pixel ' + i + ' in the worker');
        }
      }

      /* the counts, the band name and the unit are one implementation, so they cannot differ either */
      assert.equal(there.count, here.count);
      assert.equal(there.nodataCount, here.nodataCount);
      assert.equal(here.count + here.nodataCount, EXPECTED_DIFF.length);
      assert.equal(here.nodataCount, EXPECTED_DIFF.filter(Number.isNaN).length);
      assert.deepEqual(there.raster.bands, here.raster.bands);

      /* ⚠ THE INPUTS ARE STILL THE CALLER'S. `own:'caller'` copies the payload; transferring it would
         have detached these two arrays and emptied the grids the reader asked about. */
      assert.equal(a.read(0).length, SPEC.width * SPEC.height, 'the input grid a was detached by the run');
      assert.equal(b.read(0).length, SPEC.width * SPEC.height, 'the input grid b was detached by the run');
      assert.equal(a.read(0)[0], 1, 'the input grid a came back changed');

      /* ⚠⚠⚠ THE MISSING RULE IS ONE RULE. The job cannot call `missing()` (it is rebuilt from its own
         source text in a scope that has no such name), so the two spellings are measured against each
         other here, pixel by pixel, over a grid that contains NaN, ±Infinity, a declared sentinel and
         a band that declares none. */
      const av = a.read(0), bv = b.read(0);
      for (let i = 0; i < av.length; i++) {
        const missByRule = raster.missing(av[i], a.bands[0].nodata) || raster.missing(bv[i], b.bands[0].nodata);
        assert.equal(Number.isNaN(hv[i]), missByRule, 'pixel ' + i + ': the walk and missing() disagree about whether it is a void');
      }

      /* a ctx that never asks to stop changes not one pixel, on either thread (#R756 ⑤, off-thread) */
      const patient = ctxPatient();
      const paced = await raster.diff(a, b, 0, { worker: door, ctx: patient });
      assert.equal(paced.ok, true, 'a paced worker run refused: ' + paced.why);
      sameBytes(paced.raster.read(0), hv, 'diff with a ctx');
      /* ⚠ THE ctx MEANS THE SAME THING ON BOTH PATHS: the units it accumulated are PIXELS, and a run
         that finished accounted for all of them, so a progress line reaches 100% (#R756's last-pass
         rule, off-thread). */
      assert.equal(patient.done(), SPEC.width * SPEC.height, 'the worker path counted units that are not pixels');
      const total = patient.asks[patient.asks.length - 1][1];
      assert.equal(total, SPEC.width * SPEC.height, 'the pacer was told a total that is not the walk');
    } finally { door.stop(); }
  });

  /* ══ ② ═══════════════════════════════════════════════════════════════════════════════════════ */

  test('R759 ② a stop reaches the arithmetic already running in the other thread', async () => {
    const { raster, worker } = await boot();
    const door = threadDoor(worker);
    try {
      /* ⚠ BIG ENOUGH THAT STOPPING IT IS A REAL QUESTION. The thread reports progress 64 times while
         it runs, and the reader's answer to the first of those has to arrive before the last one. */
      const W = 2000, H = 2000, N = W * H;
      const spec = { west: 0, north: 60, pixelLng: 0.001, pixelLat: 0.0001, width: W, height: H };
      const a = grid(Object.assign({}, spec, { value: (c, r) => r * W + c }));
      const b = grid(Object.assign({}, spec, { value: (c) => (c % 7) - 3 }));

      /* ⓐ the reader asks to stop at the first progress report the thread sends */
      const ctx = ctxStopping(1);
      const r = await raster.diff(a, b, 0, { worker: door, ctx: ctx });
      assert.equal(r.ok, false, 'a stopped run reported success');
      assert.equal(r.why, 'cancelled', 'it stopped under another name');
      assert.ok(r.done > 0, 'the walk never started');
      assert.ok(r.done < N, 'the thread ran over all ' + N + ' pixels after the reader asked it to stop');
      assert.equal(r.total, N, 'the run misreported the size of its walk');
      /* both readers of a cancellation, as #R756 ⑥ requires of every walk in this layer */
      assert.ok(r.detail && r.detail.done === r.done && r.detail.total === r.total, 'detail disagrees with the top level');
      /* ⚠ AND NO HALF-BUILT GRID CAME BACK, and no statistics of a walk that did not finish */
      assert.equal(r.raster, undefined, 'a stopped run handed back a partly filled grid');
      assert.equal(r.count, undefined, 'a stopped run handed back the statistics it never gathered');
      /* ⚠ AND IT WAS NOT QUIETLY RE-RUN HERE. A cancellation is not a broken worker; falling back
         would spend the whole grid on this thread for a reader who asked for none of it. */
      assert.ok(ctx.done() < N, 'the run walked the whole grid on this thread after being stopped');

      /* ⚠⚠⚠ AND THE THREAD ITSELF DID NOT FINISH. This is the measurement, and it is the one the
         kernel cannot make: `terminate()` killed a loop that was running, so the job never reached its
         closing `progress(n, n)`. A run that had completed and been declared cancelled afterwards
         would have reported every pixel — which is a stop button that looks like it works. */
      await new Promise((res) => setTimeout(res, 50));
      assert.ok(door.maxDone > 0, 'the thread never reported anything — ② is not measuring a running walk');
      assert.ok(door.maxDone < N, 'the thread walked all ' + N + ' pixels; the stop did not reach the arithmetic');

      /* ⓑ a reader who had already stopped before the call gets no thread at all */
      const pre = {
        aborted: () => true, done: () => 0, signal: null, onProgress: null,
        async tick() { return false; },
      };
      const r2 = await raster.diff(a, b, 0, { worker: door, ctx: pre });
      assert.equal(r2.ok, false);
      assert.equal(r2.why, 'cancelled');
      assert.equal(r2.done, 0, 'a run that never started reported progress');
      assert.equal(r2.total, N);
    } finally { door.stop(); }
  });

  /* ══ ③ ═══════════════════════════════════════════════════════════════════════════════════════ */

  test('R759 ③ a door that cannot be used finishes here — completely, and says why', async () => {
    const { raster, worker } = await boot();
    const { a, b } = pair();
    const here = raster.diff(a, b, 0);
    const want = here.raster.read(0);

    /* ⓐ THE REAL DOOR, IN AN ENVIRONMENT WITHOUT WORKERS. Node has no `Worker`, so js/gis-worker.js's
       own `available()` answers false — which is the same answer a browser gives when the
       constructors are missing, and it must not be an empty result. */
    assert.equal(worker.available(), false, 'this environment grew a Worker — ⓐ is no longer measuring an absent one');
    const real = await raster.diff(a, b, 0, { worker: worker });
    assert.equal(real.ok, true, 'an unavailable worker turned a computable difference into a refusal');
    assert.deepEqual(real.worker, { used: false, reason: 'worker-unavailable' }, 'the reader is not told why it ran here');
    sameBytes(real.raster.read(0), want, 'fallback from an unavailable door');
    assert.equal(real.count, here.count);

    /* ⓑ a door that IS available and whose thread never comes up (a Content-Security-Policy refusing
       blob: is the real case) — the same shape js/gis-worker.js reports as `worker-blocked` */
    const blocked = {
      available: () => true,
      jobNames: () => worker.jobNames(),
      register: (n, f, o) => worker.register(n, f, o),
      run: async () => ({ ok: false, why: 'worker-blocked', detail: { message: 'blob: refused' } }),
    };
    const rb = await raster.diff(a, b, 0, { worker: blocked });
    assert.equal(rb.ok, true, 'a blocked worker swallowed the answer');
    assert.equal(rb.worker.used, false);
    assert.equal(rb.worker.reason, 'worker-blocked');
    assert.deepEqual(rb.worker.detail, { message: 'blob: refused' }, 'the reason the thread refused was dropped');
    sameBytes(rb.raster.read(0), want, 'fallback from a blocked door');

    /* ⓒ a door that answers the wrong shape. The worker is a RUNNER, not an authority: an answer that
       is not the grid asked for is recomputed here rather than handed on. */
    const wrong = {
      available: () => true,
      jobNames: () => worker.jobNames(),
      register: (n, f, o) => worker.register(n, f, o),
      run: async () => ({ ok: true, value: { values: new Float64Array(3), length: 3 } }),
    };
    const rw = await raster.diff(a, b, 0, { worker: wrong });
    assert.equal(rw.ok, true);
    assert.equal(rw.worker.used, false);
    assert.equal(rw.worker.reason, 'worker-answer-malformed');
    sameBytes(rw.raster.read(0), want, 'fallback from a door that answered the wrong shape');

    /* ⓓ an object that is not a door at all, and one whose capability question throws */
    const rn = await raster.diff(a, b, 0, { worker: {} });
    assert.equal(rn.ok, true);
    assert.deepEqual(rn.worker, { used: false, reason: 'worker-door-invalid' });
    const rt = await raster.diff(a, b, 0, { worker: { run: () => { }, available: () => { throw new Error('no'); } } });
    assert.equal(rt.ok, true);
    assert.equal(rt.worker.reason, 'worker-door-invalid');
    sameBytes(rt.raster.read(0), want, 'fallback from a door that threw');

    /* ⓔ ⚠ AND THE REFUSALS ARE STILL THE REFUSALS. A door does not make an uncomputable difference
       computable, and it does not change the name of the refusal either. */
    const c = grid(Object.assign({}, SPEC, { width: 3, value: () => 1 }));
    const mis = await raster.diff(a, c, 0, { worker: worker });
    assert.equal(mis.ok, false);
    assert.equal(mis.why, 'grid-mismatch', 'two grids that are not one grid were resampled to be subtractable');
  });

  /* ══ ④ ═══════════════════════════════════════════════════════════════════════════════════════ */

  test('R759 ④ every registered job and every caller, discovered from the source', async () => {
    /* ⚠ NEITHER SIDE IS A HAND-WRITTEN LIST (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
       THE REGISTERED SIDE IS THE REGISTRY ITSELF — js/gis-worker.js publishes `jobNames()` off the one
       Map it keeps, and a second list here would be the thing that falls behind it. It is read AFTER a
       difference has run through a door, because that is when everything that registers has
       registered.
       THE CALLING SIDE IS COUNTED OUT OF js/, with a name that reaches `run()` through a constant
       resolved through that constant — `run(DIFF_JOB, …)` is otherwise invisible to a text search, and
       invisible is exactly how a job with no caller survived a whole round. */
    const { raster, worker } = await boot();
    const door = threadDoor(worker);
    let registered;
    try {
      const { a, b } = pair();
      const r = await raster.diff(a, b, 0, { worker: door });
      assert.equal(r.ok, true, 'the run that registers the job refused: ' + r.why);
      registered = worker.jobNames().slice().sort();
    } finally { door.stop(); }

    const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort();
    const called = new Map();       /* job name → the files that run it */
    const literal = /^'([^']*)'$/;
    /* ⚠ (#R819) A JOB NAME ALSO ARRIVES THROUGH THE DOOR THAT PUBLISHES IT. This scan resolved a
       literal and a same-file string const, and js/gis-ops.js reaches the geometry job the way the
       module offers it — `W.run(W.geometryJob, …)` — so the caller existed, ran in a real thread and
       was measured by tests/gis-geometry-dispatch-checks, and was invisible HERE. That is the
       shape this repository keeps finding: the gate had learned the SPELLINGS of a caller rather
       than the fact that one exists (tests/r763 ⑧ was the same week).
       ⇒ a field any js/ module publishes with a string value (`geometryJob: GEOM_JOB`) resolves too,
       through the same constant table.
       ⚠ THE INVARIANT IS UNCHANGED AND NO WEAKER: the name still has to resolve to a REGISTERED job.
       A field that resolves to nothing, or to a name nobody registered, is still no caller — which is
       why `grid.binary` below stays an orphan and this edit cannot hide the next one. */
    const published = new Map();   /* published field name → the job name it carries */
    for (const f of files) {
      const src = read(join('js', f));
      const consts = new Map();
      for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/g)) consts.set(m[1], m[2]);
      for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*('[^']*'|[A-Za-z_$][\w$]*)\s*[,}]/g)) {
        const lit = literal.exec(m[2]);
        const name = lit ? lit[1] : (consts.has(m[2]) ? consts.get(m[2]) : null);
        if (name) published.set(m[1], name);
      }
    }
    for (const f of files) {
      const src = read(join('js', f));
      const consts = new Map();
      for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/g)) consts.set(m[1], m[2]);
      for (const m of src.matchAll(/\brun\(\s*('[^']*'|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*,/g)) {
        const tok = m[1];
        const lit = literal.exec(tok);
        let name = null;
        if (lit) name = lit[1];
        else if (consts.has(tok)) name = consts.get(tok);
        else if (tok.indexOf('.') > 0) name = published.get(tok.slice(tok.indexOf('.') + 1)) || null;
        if (!name || registered.indexOf(name) < 0) continue;
        if (!called.has(name)) called.set(name, new Set());
        called.get(name).add(f);
      }
    }

    assert.ok(registered.indexOf('raster.diff') >= 0, 'nothing registers the difference job any more — ④ stopped measuring the thing it is for');
    assert.ok(called.has('raster.diff') && called.get('raster.diff').has('gis-raster.js'), 'the difference job is registered and nothing runs it');

    /* ⚠ THE NUMBER THAT MUST NOT GROW. `grid.binary` is js/gis-worker.js's own demonstration job and
       it still has no caller: `diff` does not use it, because it knows nothing about a band's declared
       sentinel and returns no counts, and teaching it those would be a second owner of 「このセルは
       欠損か」 (js/gis-raster.js `missing()` owns it). A NEW orphan is a job written for nobody, which
       is exactly the state #R759 found the whole module in. */
    const orphans = registered.filter((n) => !called.has(n)).sort();
    assert.deepEqual(orphans, ['grid.binary'],
      'registered jobs with no caller: ' + JSON.stringify(orphans) + ' — a job nobody runs is the defect #R759 was opened for');

    /* and the module is reached at all now, which is the sentence the review disputed */
    const rasterSrc = read('js/gis-raster.js');
    assert.ok(/\bw\.run\(|\.run\(DIFF_JOB/.test(rasterSrc), 'js/gis-raster.js does not run a job at all');
  });

  /* ══ ⑤ ═══════════════════════════════════════════════════════════════════════════════════════ */

  test('R759 ⑤ the job computes the same answer from its source text alone', async () => {
    const { raster, worker } = await boot();
    const { a, b } = pair();

    /* Registering happens inside `diff` — this asks for it the way the product does, through a door. */
    const door = threadDoor(worker);
    try {
      const there = await raster.diff(a, b, 0, { worker: door });
      assert.equal(there.ok, true);

      /* ⚠⚠⚠ THE CONTRACT, READ OUT OF THE SHIPPED TEXT. js/gis-worker.js rebuilds a job from
         `fn.toString()` in the worker's global scope, so a variable borrowed from the module around it
         is not in the text and arrives as a ReferenceError. Rebuilding it HERE — in a scope that has
         nothing of js/gis-raster.js in it — is that same reconstruction, and the answer it produces is
         measured against the one the kernel gave. */
      const src = worker.sourceOf('raster.diff');
      assert.ok(src && !/\[native code\]/.test(src), 'the registry has no source for the difference job');
      assert.ok(!/\bmissing\(|\brefuse\(|\bisNum\(|\bpaced\(/.test(src),
        'the job text reaches for a helper of the module around it — it would be a ReferenceError in the worker');
      const rebuilt = new Function('return (' + src + ')')();
      const progress = [];
      const out = rebuilt({
        a: a.read(0), b: b.read(0), nodataA: a.bands[0].nodata, nodataB: b.bands[0].nodata,
      }, { deps: null, progress: (d, t) => progress.push([d, t]) });
      assert.equal(out.ok, true, 'the rebuilt job refused: ' + out.why);
      sameBytes(out.value.values, there.raster.read(0), 'the rebuilt job');
      assert.equal(out.value.count, there.count);
      assert.equal(out.value.nodataCount, there.nodataCount);
      /* it hands its buffer over rather than having it copied (js/gis-worker.js's one-way contract) */
      assert.deepEqual(out.transfer, [out.value.values.buffer], 'the job does not offer its result for transfer');
      /* and it says where it got to, ending at the end */
      assert.ok(progress.length > 0, 'the job reports no progress at all');
      assert.deepEqual(progress[progress.length - 1], [A_VALUES.length, A_VALUES.length]);
    } finally { door.stop(); }
  });

  ISOLATED.built();
});
