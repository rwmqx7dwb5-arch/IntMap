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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

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
