/* ============================================================================
 *  #R783 · カーネルを参照する演算を別スレッドへ / 予算に収まる単位で分ける
 * ----------------------------------------------------------------------------
 *  THE MEASUREMENT THAT OPENED THIS ROUND (external audit §5, P2): js/gis-worker.js had ONE job of
 *  its own over numbers and JSON, and the only op wired to it was `rasterDiff`. 「カーネルを参照する
 *  演算は丸ごと移せない」 was true of the SHAPE of the door — a job is rebuilt from its own source
 *  text, so a call to a kernel's function was a free name in a scope that has none. And the audit
 *  named the trap in the obvious next step: 「並列化だけ進めると応答性は改善してもメモリ不足を早める」
 *  — a 4096² float64 plane is 128 MiB, and a payload the caller still holds is resident twice.
 *
 *  So what is measured here is NOT 「worker という引数を受け取るか」 (a function that takes a door and
 *  ignores it would pass that — [[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ① THE SPLIT RUN AND THE WHOLE RUN ARE THE SAME ANSWER, byte for byte, over five resampling
 *       methods — and `nearest` is also measured against a fixture derived in this file from the
 *       affine as js/gis-warp.js's header DEFINES it, so 「両方が同じだけ間違っていれば緑」 is not
 *       available. ⚠ THE TOLERANCE IS ZERO, AND THAT IS A CLAIM, NOT A CONVENIENCE: the worker runs
 *       `invAt`'s and `boxOf`'s own source text over the same affine in the same order, and IEEE-754
 *       arithmetic is deterministic, so a difference of one bit would mean the two threads are not
 *       running one implementation. A tolerance here would hide exactly that.
 *    ② A SMALLER BUDGET MEANS MORE BLOCKS AND LESS RESIDENCY, measured on both sides: the plan's
 *       own peak AND the largest block this file watched cross the thread boundary.
 *    ③ THE STOP REACHES ARITHMETIC ALREADY RUNNING in the other thread (the thread never reports
 *       its last progress), and the module is not left broken by it — the same warp run afterwards
 *       answers the same bytes as the unblocked one.
 *    ④ THE LIBRARY IS THE KERNEL'S OWN TEXT: the job reaches it through `ctx.lib`, js/gis-warp.js
 *       holds ONE implementation of the inverse, an undeclared library is refused at registration,
 *       and a helper that captured something is a NAMED refusal from the thread rather than a wrong
 *       answer.
 *    ⑤ THE SCHEDULER'S ARITHMETIC AND ITS OWNERSHIP DEFAULT, measured directly.
 *
 *  ⚠ THE OTHER THREAD IS REAL. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool
 *  cannot spawn here. The door below runs the REAL assembled source — `workerSource()`, including
 *  the protocol preamble and every provided library — inside a node:worker_threads thread, speaking
 *  only the three message types that protocol has. It is the door tests/r759-gis-worker-checks
 *  built, plus the two functions this round added; a stub that ran the job on this thread could not
 *  be stopped mid-run, which is the one thing ③ has to see.
 *  ⚠ AND THE SCHEDULER IS THE PRODUCT'S. `runBlocks` is called on the real module with only its
 *  `run` replaced, so the block arithmetic, the in-flight window and the peak accounting under test
 *  are the ones that ship.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r749-gis-warp-checks: js/geodesy.js publishes onto `window` at top level and
   exports nothing, so it is evaluated the way a browser evaluates it. */
async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const raster = makeGisRaster();
  const crs = makeGisCrs();
  const warp = makeGisWarp();
  const worker = makeGisWorker();
  w.IntMapGisRaster = raster; w.IntMapGisCrs = crs; w.IntMapGisWarp = warp; w.IntMapGisWorker = worker;
  await crs.ready();
  return { w, raster, crs, warp, worker };
}

/* ── the door: the product's registry, library and scheduler, in a real thread ────────────────── */

/* `self` is what the assembled source talks to. Everything below it is js/gis-worker.js's text. */
const SHIM = [
  "const { parentPort } = require('node:worker_threads');",
  'globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t || []) };',
  "parentPort.on('message', (d) => { if (typeof self.onmessage === 'function') self.onmessage({ data: d }); });",
  '',
].join('\n');

/* Every ArrayBuffer reachable from a payload — the door's own walk, because `own:'worker'` means
   TRANSFER and a runner that quietly copied instead would make ⑤'s detach unobservable. */
function buffers(v, out, seen) {
  if (v == null || typeof v !== 'object') return out;
  if (ArrayBuffer.isView(v)) { if (v.buffer) out.add(v.buffer); return out; }
  if (v instanceof ArrayBuffer) { out.add(v); return out; }
  if (seen.has(v)) return out;
  seen.add(v);
  for (const k of Object.keys(v)) buffers(v[k], out, seen);
  return out;
}
function bytesOf(v) {
  let n = 0;
  for (const b of buffers(v, new Set(), new Set())) n += b.byteLength;
  return n;
}

function threadDoor(api, opts) {
  const o = opts || {};
  const live = new Set();
  const door = {
    api,
    /* ⚠ WHAT THE THREAD ITSELF DID, which the kernel cannot report: how far a killed walk got, how
       many results crossed at once, and how big the biggest one was. ③ and ② are these numbers. */
    maxDone: 0, runs: 0, owns: [], maxLive: 0, maxResultBytes: 0, progress: 0,
    /* ⚠ (③ⓑ) A HOOK ON THE RAW PROTOCOL, so a test can stop the thread AT A MOMENT IT KNOWS THE
       ARITHMETIC IS RUNNING — a progress message is the thread saying so about itself. A timer would
       measure this machine's speed instead of the cancellation. */
    hook: null,
    available: () => o.available !== false,
    jobNames: () => api.jobNames(),
    libraryNames: () => api.libraryNames(),
    librarySourceOf: (n) => api.librarySourceOf(n),
    register: (n, f, r) => api.register(n, f, r),
    provide: (n, f) => api.provide(n, f),
    planBlocks: (s) => api.planBlocks(s),
    /* THE PRODUCT'S SCHEDULER, with only the runner replaced (header). */
    runBlocks: (job, plan, ro) => api.runBlocks(job, plan, Object.assign({}, ro || {}, { run: door.run })),
    stop() { for (const w of live) { try { w.terminate(); } catch (_) { } } live.clear(); },
    run(job, payload, ro) {
      const r = ro || {};
      door.runs++;
      door.owns.push(r.own == null ? 'caller' : r.own);
      return new Promise((resolve) => {
        if (api.jobNames().indexOf(job) < 0) { resolve({ ok: false, why: 'job-unknown' }); return; }
        const sig = r.signal || null;
        if (sig && sig.aborted) { resolve({ ok: false, why: 'aborted' }); return; }
        const w = new NodeWorker(SHIM + api.workerSource(), { eval: true });
        live.add(w);
        if (live.size > door.maxLive) door.maxLive = live.size;
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
          if (m.type === 'ready') {
            const transfer = (r.own === 'worker') ? Array.from(buffers(payload, new Set(), new Set())) : [];
            w.postMessage({ type: 'run', id: 1, job: job, payload: payload }, transfer);
            return;
          }
          if (m.type === 'progress') {
            door.progress++;
            if (typeof m.done === 'number' && m.done > door.maxDone) door.maxDone = m.done;
            if (typeof door.hook === 'function') { try { door.hook(m); } catch (_) { } }
            if (typeof r.onProgress === 'function') r.onProgress({ done: m.done, total: m.total });
            return;
          }
          if (m.type !== 'done') return;
          if (m.ok) {
            const bytes = bytesOf(m.value);
            if (bytes > door.maxResultBytes) door.maxResultBytes = bytes;
            done({ ok: true, value: m.value, transferred: 0 });
            return;
          }
          done({ ok: false, why: m.why || 'job-failed', detail: m.detail || null });
        });
        w.on('error', (e) => done({ ok: false, why: 'worker-died', detail: { message: String((e && e.message) || e) } }));
      });
    },
  };
  return door;
}

/* ── the grids ───────────────────────────────────────────────────────────────────────────────── */

function degreeGrid(o) {
  const { west, north, pixelLng, pixelLat, width, height } = o;
  const data = new Float64Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) data[r * width + c] = o.value(c, r);
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

/* ⚠ A SOURCE THAT CONTAINS EVERY KIND OF PIXEL THE RULES HAVE TO SEPARATE — a declared sentinel, a
   NaN, a ±Infinity — and values whose neighbours all differ, so a block boundary that shifted a row
   by one could not agree by accident. */
const SRC = { west: 0, north: 20, pixelLng: 0.5, pixelLat: 0.5, width: 40, height: 32 };
function source() {
  return degreeGrid(Object.assign({}, SRC, {
    band: { nodata: -9999 },
    value: (c, r) => {
      const i = r * SRC.width + c;
      if (i % 101 === 7) return NaN;
      if (i % 97 === 11) return -9999;
      if (i % 211 === 13) return Infinity;
      return c * 1.5 - r * 0.25 + (i % 7) * 0.125;
    },
  }));
}

/* Inside the source on every side, so ① compares grids with no clipping in them; the OUTSIDE case
   is measured separately by ①b. */
const TARGET = { west: 1.1, north: 18.3, pixelLng: 0.31, pixelLat: 0.27, width: 37, height: 29 };
/* Hanging off the north-west corner: clipped pixels on two edges. */
const TARGET_OUT = { west: -2.4, north: 23.1, pixelLng: 0.4, pixelLat: 0.35, width: 31, height: 26 };

function sameBytes(x, y, what) {
  assert.equal(x.length, y.length, what + ': different lengths');
  const bx = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  const by = new Uint8Array(y.buffer, y.byteOffset, y.byteLength);
  for (let i = 0; i < bx.length; i++) {
    if (bx[i] !== by[i]) {
      const p = Math.floor(i / 8);
      assert.fail(what + ': byte ' + i + ' differs (pixel ' + p + ', row ' + Math.floor(p / TARGET.width) + ') — ' + x[p] + ' vs ' + y[p]);
    }
  }
}

/* The ctx docs/GIS-CORE.md §2.6 describes and js/gis-ops.js `makeCtx` builds. ⚠ NOT MORE CAPABLE
   THAN THE REAL ONE: it counts the units it is handed and answers 「続けてよいか」. */
function ctxStopping(limit) {
  let done = 0;
  const asks = [];
  return {
    asks, aborted: () => false, done: () => done, signal: null, onProgress: null,
    async tick(units, total) { done += units; asks.push([units, total]); return done < limit; },
  };
}
function ctxPatient(signal) {
  let done = 0;
  const asks = [];
  return { asks, aborted: () => false, done: () => done, signal: signal || null, onProgress: null, async tick(units, total) { done += units; asks.push([units, total]); return true; } };
}

/* ══ ① ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R783 ① the blocked run in the other thread and the whole run here are the same bytes', async () => {
  const { warp, worker } = await boot();
  const door = threadDoor(worker);
  try {
    const src = source();
    /* Both point methods and areal ones: an areal block also carries the FOOTPRINT of every output
       pixel, and its corner rows are reused across the block boundary — which is the one place a
       split could quietly move an answer. */
    for (const method of ['nearest', 'bilinear', 'cubic', 'average', 'mode', 'sum']) {
      const here = await warp.resample(src, TARGET, { method });
      assert.equal(here.ok, true, method + ': the main-thread resample refused: ' + here.why);
      assert.equal(here.report.worker, undefined, method + ': a call that offered no worker was told about one');

      /* A budget that forces several blocks: 3 rows of an areal point-and-footprint block is the
         order of a few hundred bytes, so this is 「分割される小ささ」 rather than a round number. */
      const bytesPerRow = TARGET.width * 8 * 2;
      const there = await warp.resample(src, TARGET, { method, worker: door, budgetBytes: bytesPerRow * 3 });
      assert.equal(there.ok, true, method + ': the blocked resample refused: ' + there.why + ' ' + JSON.stringify(there.detail || null));
      const note = there.report.worker;
      assert.ok(note && note.used === true, method + ': the run does not say the other thread computed its geometry: ' + JSON.stringify(note));
      assert.equal(note.job, 'warp.geometry');
      assert.ok(note.blocks >= 3, method + ': the budget did not split the walk (blocks=' + note.blocks + ')');

      sameBytes(there.grid.read(0), here.grid.read(0), method);
      /* ⚠ AND NOT ONLY THE PIXELS. Every counter the report separates — what was interpolated
         partially, what was aggregated over an incompletely observed footprint, what was clipped —
         is a statement about the same walk and must survive being cut into blocks. */
      for (const k of ['filled', 'missing', 'partial', 'incomplete', 'clipped', 'failed', 'cells', 'width', 'height']) {
        assert.equal(there.report[k], here.report[k], method + ': report.' + k + ' moved when the walk was blocked');
      }
      assert.deepEqual(there.report.bands, here.report.bands, method + ': the per-band counters moved when the walk was blocked');
      assert.equal(there.report.clipped, 0, method + ': ① is meant to compare grids with no clipping in them');
    }

    /* ⚠⚠⚠ THE THIRD OPINION, DERIVED HERE FROM THE DEFINITION AND NOT FROM EITHER RUN. `nearest`
       answers with the source pixel that OWNS the output pixel's centre, and which pixel that is
       follows from the grid contract (docs/GIS-CORE.md §1.4): column = floor((lng − west)/pixelLng),
       row = floor((north − lat)/pixelLat). A missing source pixel — NaN, ±Infinity or the band's
       declared −9999 — is missing in the output (js/gis-raster.js `missing()`). */
    const nearestHere = await warp.resample(src, TARGET, { method: 'nearest' });
    const got = nearestHere.grid.read(0);
    const sv = src.read(0);
    let checked = 0, voids = 0;
    for (let r = 0; r < TARGET.height; r++) {
      for (let c = 0; c < TARGET.width; c++) {
        const lng = TARGET.west + TARGET.pixelLng * (c + 0.5);
        const lat = TARGET.north - TARGET.pixelLat * (r + 0.5);
        const col = Math.floor((lng - SRC.west) / SRC.pixelLng);
        const row = Math.floor((SRC.north - lat) / SRC.pixelLat);
        assert.ok(col >= 0 && col < SRC.width && row >= 0 && row < SRC.height, 'the fixture left the source grid');
        const v = sv[row * SRC.width + col];
        const want = (typeof v === 'number' && isFinite(v) && v !== -9999) ? v : NaN;
        const at = r * TARGET.width + c;
        if (Number.isNaN(want)) { assert.ok(Number.isNaN(got[at]), 'pixel ' + at + ' should be missing and is ' + got[at]); voids++; }
        else assert.equal(got[at], want, 'pixel ' + at + ' (row ' + r + ', col ' + c + ')');
        checked++;
      }
    }
    assert.equal(checked, TARGET.width * TARGET.height);
    assert.ok(voids > 0, 'the fixture contains no missing pixels — the missing rule is not being measured');

    /* ①b clipping, which only the blocked/unblocked pair can disagree about: a block that got its
       row range wrong would clip a different number of pixels. */
    const outHere = await warp.resample(src, TARGET_OUT, { method: 'average' });
    const outThere = await warp.resample(src, TARGET_OUT, { method: 'average', worker: door, budgetBytes: TARGET_OUT.width * 8 * 6 * 2 });
    assert.equal(outHere.ok, true, 'the overhanging warp refused: ' + outHere.why);
    assert.equal(outThere.ok, true, 'the overhanging blocked warp refused: ' + outThere.why);
    assert.ok(outHere.report.clipped > 0, '①b is meant to have pixels off the source grid');
    assert.equal(outThere.report.clipped, outHere.report.clipped, 'the blocked walk clipped a different number of pixels');
    assert.equal(outThere.report.worker.used, true);
    sameBytes(outThere.grid.read(0), outHere.grid.read(0), 'overhanging average');

    /* ⚠⚠⚠ ①c A PROJECTED SOURCE IS DECLINED BY NAME AND RUNS HERE, COMPLETELY. The inverse mapping
       of such a warp needs a projection per output pixel, and proj4 is not in a worker assembled
       from this repository's own text — so the answer is not a slower warp or a wrong one, it is
       this thread with the reason written down. This is the boundary of what #R783 moved, measured
       rather than described in a comment. */
    const utm = {
      width: 24, height: 20, crs: 'EPSG:32654',
      bands: [{ name: 'v', unit: null, nodata: null }],
      affine: [500000, 500, 0, 3900000, 0, -500],
      read: (() => { const d = new Float64Array(24 * 20); for (let i = 0; i < d.length; i++) d[i] = i * 0.75; return (i) => ((i == null || i === 0) ? d : null); })(),
    };
    const utmHere = await warp.to4326(utm, { method: 'bilinear' });
    assert.equal(utmHere.ok, true, 'the projected warp refused: ' + utmHere.why);
    const utmThere = await warp.to4326(utm, { method: 'bilinear', worker: door, budgetBytes: 1 << 20 });
    assert.equal(utmThere.ok, true, 'the projected warp with a door refused: ' + utmThere.why);
    assert.equal(utmThere.report.worker.used, false, 'a warp that needs a projection per pixel claims to have run off-thread');
    assert.equal(utmThere.report.worker.reason, 'crs-not-in-worker');
    assert.equal(utmThere.report.worker.detail.crs, utmHere.report.from, 'the reason does not say which system it was');
    sameBytes(utmThere.grid.read(0), utmHere.grid.read(0), 'projected source, door declined');
    assert.equal(utmThere.report.filled, utmHere.report.filled, 'the declined run did not finish the walk');
  } finally { door.stop(); }
});

/* ══ ② ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R783 ② a smaller budget means more blocks, and the residency stays inside it — measured', async () => {
  const { warp, worker } = await boot();
  const src = source();
  /* WHAT ONE OUTPUT ROW COSTS, derived here from what the job returns: two float64 per pixel for
     the centre, and for an areal method four more for the footprint box. */
  const rowBytes = (areal) => TARGET.width * (areal ? 6 : 2) * 8;

  const runs = [];
  for (const budget of [1 << 20, 64 * rowBytes(false), 8 * rowBytes(false), rowBytes(false)]) {
    const door = threadDoor(worker);
    try {
      const r = await warp.resample(src, TARGET, { method: 'nearest', worker: door, budgetBytes: budget });
      assert.equal(r.ok, true, 'budget ' + budget + ': refused ' + r.why);
      const note = r.report.worker;
      assert.equal(note.used, true, 'budget ' + budget + ': ' + JSON.stringify(note));
      /* ⚠ THE PLAN'S OWN ACCOUNTING … */
      assert.ok(note.peakBytes <= note.budgetBytes,
        'budget ' + budget + ': the run held ' + note.peakBytes + ' bytes against a budget of ' + note.budgetBytes);
      assert.equal(note.budgetBytes, budget, 'the stated budget did not reach the planner');
      assert.ok(note.rowsPerBlock * rowBytes(false) <= budget, 'a block of ' + note.rowsPerBlock + ' rows does not fit the budget');
      assert.equal(note.blocks, Math.ceil(TARGET.height / note.rowsPerBlock), 'the block count and the block height disagree');
      /* ⚠ … AND WHAT THIS FILE WATCHED CROSS THE BOUNDARY, which is the number that would still be
         true if the accounting above were wrong (the reference sits outside the thing measured —
         [[intmap-co-designed-reader-cannot-falsify]]). */
      assert.ok(door.maxResultBytes <= budget,
        'budget ' + budget + ': the largest block the thread sent back was ' + door.maxResultBytes + ' bytes');
      assert.equal(door.maxLive, 1, 'more than one thread held a block at once — the budget covers everything in flight');
      assert.equal(door.runs, note.blocks, 'the scheduler ran a different number of jobs than it planned');
      runs.push({ budget, blocks: note.blocks, peak: note.peakBytes, watched: door.maxResultBytes });
    } finally { door.stop(); }
  }

  /* MONOTONE: a smaller budget never buys fewer blocks, and never a larger peak. */
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].blocks >= runs[i - 1].blocks,
      'budget ' + runs[i].budget + ' produced ' + runs[i].blocks + ' blocks where ' + runs[i - 1].budget + ' produced ' + runs[i - 1].blocks);
    assert.ok(runs[i].watched <= runs[i - 1].watched, 'a smaller budget held more bytes');
  }
  assert.ok(runs[0].blocks < runs[runs.length - 1].blocks, 'the budget changed nothing about the split');
  assert.equal(runs[runs.length - 1].blocks, TARGET.height, 'a one-row budget did not produce one block per row');

  /* ⚠⚠⚠ AND A BUDGET THAT CANNOT HOLD ONE UNIT IS A NAMED REFUSAL THAT COSTS NOTHING. The door is
     declined, the reason is carried into the report, and the reader still gets their grid — 「別の
     スレッドが駄目だった」 is not 「答えが無い」 (js/gis-raster.js says it in those words). */
  const door = threadDoor(worker);
  try {
    const here = await warp.resample(src, TARGET, { method: 'nearest' });
    const tight = await warp.resample(src, TARGET, { method: 'nearest', worker: door, budgetBytes: rowBytes(false) - 1 });
    assert.equal(tight.ok, true, 'an impossible budget turned a computable warp into a refusal');
    assert.equal(tight.report.worker.used, false);
    assert.equal(tight.report.worker.reason, 'budget-too-small');
    assert.equal(tight.report.worker.detail.bytesPerUnit, rowBytes(false), 'the refusal does not say what a unit costs');
    assert.equal(door.runs, 0, 'a run was started under a budget that could not hold one block');
    sameBytes(tight.grid.read(0), here.grid.read(0), 'fallback from an impossible budget');
    assert.equal(tight.report.filled, here.report.filled);

    /* The planner's arithmetic itself, asked directly: the budget is for everything IN FLIGHT, so
       asking for four threads buys quarter-sized blocks rather than four times the residency. */
    const one = worker.planBlocks({ units: 1000, bytesPerUnit: 16, budgetBytes: 4096 });
    assert.equal(one.plan.unitsPerBlock, 256);
    assert.equal(one.plan.blocks, 4);
    assert.equal(one.plan.peakBytesPlanned, 4096);
    const four = worker.planBlocks({ units: 1000, bytesPerUnit: 16, budgetBytes: 4096, inFlight: 4 });
    assert.equal(four.plan.unitsPerBlock, 64, 'parallelism multiplied the residency instead of dividing the block');
    assert.ok(four.plan.peakBytesPlanned <= 4096, 'four blocks in flight exceed the one budget');
    /* the default budget is the module's one number, and nobody else writes it down */
    const dflt = worker.planBlocks({ units: 1e6, bytesPerUnit: 8 });
    assert.equal(dflt.plan.budgetBytes, worker.budgetBytes());
    assert.equal(worker.status().budgetBytes, worker.budgetBytes(), 'the status reports a second budget');
  } finally { door.stop(); }
});

/* ══ ③ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R783 ③ the stop reaches the other thread, and the module is not broken by it', async () => {
  const { warp, worker } = await boot();
  const src = source();

  /* ⓐ THE READER STOPS THE SAMPLING. The pacer refuses to continue at the first ask, which happens
     after the first block's geometry has arrived — so the remaining blocks must never be asked for. */
  {
    const door = threadDoor(worker);
    try {
      const N = TARGET.width * TARGET.height;
      const ctx = ctxStopping(1);
      const r = await warp.resample(src, TARGET, { method: 'average', worker: door, ctx: ctx, budgetBytes: TARGET.width * 6 * 8 });
      assert.equal(r.ok, false, 'a stopped warp reported success');
      assert.equal(r.why, 'cancelled', 'it stopped under another name');
      assert.ok(r.done > 0, 'the walk never started');
      assert.ok(r.done < N, 'the walk covered all ' + N + ' pixels after the reader asked it to stop');
      assert.equal(r.total, N, 'the cancellation misreports the size of the walk — a block total reached the reader');
      /* both readers of a cancellation, as #R756 requires of every walk in this layer */
      assert.ok(r.detail && r.detail.done === r.done && r.detail.total === r.total, 'detail disagrees with the top level');
      assert.equal(r.grid, undefined, 'a stopped warp handed back a partly filled grid');
      assert.ok(door.runs < TARGET.height, 'the scheduler kept asking for geometry after the reader stopped (' + door.runs + ' blocks)');
    } finally { door.stop(); }
  }

  /* ⓑ ⚠⚠⚠ THE STOP REACHES ARITHMETIC ALREADY RUNNING, which pacing never could (#R735): the
     geometry of one big block is a loop in another thread, and `terminate()` does not ask its
     permission. The measurement is the THREAD's own progress — a job that had finished and been
     declared cancelled afterwards would have reported every row. */
  {
    const door = threadDoor(worker);
    try {
      const big = { west: 1, north: 18, pixelLng: 0.0004, pixelLat: 0.0004, width: 2000, height: 2000 };
      const cells = big.width * big.height;
      const stopper = new AbortController();
      const ctx = ctxPatient(stopper.signal);
      /* ⚠ ONE BLOCK FOR THE WHOLE GRID, so the stop lands INSIDE the geometry loop rather than
         between two blocks — 4,000,000 inverse mappings, of which the first progress report is the
         first 1/64th. The reader stops the moment the thread says it has started. */
      const budget = cells * 2 * 8;
      door.hook = () => { stopper.abort(); };
      const r = await warp.resample(src, big, { method: 'nearest', worker: door, ctx: ctx, budgetBytes: budget });
      assert.equal(r.ok, false, 'an aborted warp reported success');
      assert.equal(r.why, 'cancelled');
      assert.equal(r.total, cells);
      assert.ok(door.progress > 0, 'the thread never reported anything — ⓑ is not measuring a running walk');
      assert.ok(door.maxDone < cells, 'the thread computed all ' + cells + ' positions; the stop did not reach the arithmetic');
      assert.equal(r.grid, undefined, 'an aborted warp handed back a grid');
    } finally { door.stop(); }
  }

  /* ⓒ AND NOTHING IS LEFT BROKEN. The same door, the same module, the same warp — and the answer is
     the unblocked answer, byte for byte. A cancellation that poisoned the registry, the revision or
     the counters would show up here and nowhere else. */
  {
    const door = threadDoor(worker);
    try {
      const here = await warp.resample(src, TARGET, { method: 'average' });
      const after = await warp.resample(src, TARGET, { method: 'average', worker: door, budgetBytes: TARGET.width * 6 * 8 * 4 });
      assert.equal(after.ok, true, 'the warp after a cancellation refused: ' + after.why);
      assert.equal(after.report.worker.used, true, 'the door stopped being usable after a cancellation');
      sameBytes(after.grid.read(0), here.grid.read(0), 'after a cancellation');
      assert.equal(after.report.filled, here.report.filled, 'the counters carried over from the cancelled run');
      assert.equal(after.report.clipped, here.report.clipped);
    } finally { door.stop(); }
  }
});

/* ══ ④ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R783 ④ the library in the worker is the kernel own function text, and there is one of it', async () => {
  const { warp, worker } = await boot();
  const door = threadDoor(worker);
  try {
    /* Registering happens inside the warp — this asks for it the way the product does, through a
       door, rather than by calling `provide` from the test. */
    const r = await warp.resample(source(), TARGET, { method: 'average', worker: door, budgetBytes: 1 << 20 });
    assert.equal(r.ok, true, 'the run that provides the library refused: ' + r.why);

    /* ⓐ THE JOB DECLARES WHAT IT REACHES FOR, AND IT IS THERE. */
    const job = worker.jobs().filter((j) => j.name === 'warp.geometry')[0];
    assert.ok(job, 'the warp registered no geometry job');
    assert.deepEqual(job.uses.slice().sort(), ['warpBoxOf', 'warpInvAt'], 'the job does not declare the library it calls');
    for (const name of job.uses) assert.ok(worker.libraryNames().indexOf(name) >= 0, name + ' is declared and not provided');

    /* ⓑ ⚠ THE JOB REACHES THE LIBRARY THROUGH `ctx.lib` AND NOT AS A FREE NAME. A free identifier
       would resolve to nothing in js/ (scripts/check-split-scope.mjs says so) and would sit, inside
       the worker, in the one scope where a shadowed intrinsic is unobservable. */
    const src = worker.sourceOf('warp.geometry');
    assert.ok(/ctx\s*&&\s*ctx\.lib/.test(src), 'the job does not read its library off the ctx it is handed');
    assert.ok(/\blib\.warpInvAt\b/.test(src) && /\blib\.warpBoxOf\b/.test(src), 'the job does not take its helpers from the library object');
    assert.ok(!/[^.\w]warpInvAt\s*\(/.test(src) && !/[^.\w]warpBoxOf\s*\(/.test(src), 'the job calls a helper as a free name — it would be a ReferenceError in the worker');
    assert.ok(!/\bisNum\(|\brefuse\(|\bpaced\(|\bwindow\b/.test(src), 'the job reaches for something of the module around it');

    /* ⓒ ⚠⚠⚠ ONE IMPLEMENTATION OF THE INVERSE, AND THE WORKER RUNS THAT ONE. The arithmetic appears
       ONCE in js/gis-warp.js — a second spelling is the drift that makes the two threads disagree —
       and the text shipped to the worker is the text that is in the file. */
    const warpSrc = read('js/gis-warp.js');
    const inverse = /\(A\[5\] \* dx - A\[2\] \* dy\) \/ det/g;
    assert.equal((warpSrc.match(inverse) || []).length, 1, 'the affine inverse is written more than once in js/gis-warp.js');
    const lib = worker.librarySourceOf('warpInvAt');
    assert.ok(lib && inverse.test(lib), 'the shipped library is not the inverse this file holds');
    assert.ok(warpSrc.indexOf(lib.slice(lib.indexOf('{'))) > 0, 'the shipped library text is not present in js/gis-warp.js');

    /* ⓓ AND IT COMPUTES WHAT THE FORWARD AFFINE SAYS IT SHOULD, rebuilt in a scope that has nothing
       of the module in it — which is the reconstruction the worker performs. The reference is the
       forward affine as js/gis-warp.js's header DEFINES it, inverted by hand. */
    const invAt = new Function('return (' + lib + ')')();
    const A = [3, 0.25, 0.05, 40, 0.1, -0.5];
    const det = A[1] * A[5] - A[2] * A[4];
    const fwd = (px, py) => [A[0] + A[1] * px + A[2] * py, A[3] + A[4] * px + A[5] * py];
    for (const [px, py] of [[0, 0], [1, 0], [0, 1], [13.5, 7.25], [99, 41]]) {
      const xy = fwd(px, py);
      const back = invAt(A, det, xy[0], xy[1]);
      assert.ok(Math.abs(back[0] - px) < 1e-9 && Math.abs(back[1] - py) < 1e-9,
        'the inverse is not the inverse of the affine at ' + px + ',' + py + ': ' + back);
    }

    /* ⓔ AN UNDECLARED LIBRARY IS REFUSED AT REGISTRATION, not at the first pixel of the grid. */
    const bad = worker.register('t.needsMissing', function (p, ctx) { return { ok: true, value: ctx.lib.nope(p) }; }, { uses: ['nope'] });
    assert.equal(bad.ok, false);
    assert.equal(bad.why, 'job-library-missing');
    assert.deepEqual(bad.detail.missing, ['nope']);
    assert.ok(bad.detail.have.indexOf('warpInvAt') >= 0, 'the refusal does not carry the vocabulary it was measured against');

    /* ⓕ ⚠⚠⚠ AND A HELPER THAT CAPTURED SOMETHING IS A NAMED REFUSAL FROM THE THREAD, not a wrong
       answer. The contract is that a library is rebuilt in the worker's global scope, so a borrowed
       name is not in the text; the protocol reports THAT as `job-not-self-contained` with the
       identifier, which is the one moment the broken contract is observable. */
    const secret = 41;
    assert.equal(worker.provide('t.borrow', function (x) { return x + secret; }).ok, true);
    assert.equal(worker.register('t.borrower', function (p, ctx) { return { ok: true, value: ctx.lib['t.borrow'](p.x) }; }, { uses: ['t.borrow'] }).ok, true);
    const got = await door.run('t.borrower', { x: 1 });
    assert.equal(got.ok, false, 'a captured variable produced an answer: ' + JSON.stringify(got.value));
    assert.equal(got.why, 'job-not-self-contained');
    assert.ok(/secret/.test(String(got.detail && got.detail.message)), 'the refusal does not name the identifier: ' + JSON.stringify(got.detail));
  } finally { door.stop(); }
});

/* ══ ⑤ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('R783 ⑤ the scheduler runs every unit once, hands ownership over, and stops at the first refusal', async () => {
  const { worker } = await boot();
  const door = threadDoor(worker);
  try {
    /* A job over a payload the caller BUILT for this block — which is why `runBlocks` transfers by
       default where `run` copies (js/gis-worker.js's transfer contract). */
    assert.equal(worker.register('t.sum', function (p) {
      let s = 0;
      for (let i = 0; i < p.v.length; i++) s += p.v[i];
      return { ok: true, value: { sum: s, from: p.from } };
    }).ok, true);

    const units = 1000, bytesPerUnit = 8;
    const plan = worker.planBlocks({ units, bytesPerUnit, budgetBytes: 128 * bytesPerUnit });
    assert.equal(plan.ok, true);
    assert.equal(plan.plan.blocks, 8);

    const made = [];
    const seenSum = [];
    const res = await door.runBlocks('t.sum', plan, {
      make: (from, count) => {
        const v = new Float64Array(count);
        for (let i = 0; i < count; i++) v[i] = from + i;
        made.push({ from, count, v });
        return { v: v, from: from };
      },
      take: (value) => { seenSum.push(value.sum); },
    });
    assert.equal(res.ok, true, 'the blocked run refused: ' + res.why);
    assert.equal(res.units, units, 'the scheduler did not run every unit');
    assert.equal(res.blocks, 8);
    assert.ok(res.peakBytes <= plan.plan.budgetBytes, 'the run held more than the budget');
    /* EVERY UNIT ONCE AND EXACTLY ONCE, measured as the sum of 0…999 arriving in pieces. */
    assert.equal(seenSum.reduce((a, b) => a + b, 0), (units - 1) * units / 2, 'the blocks do not tile the units');
    assert.equal(made.length, 8);
    /* ⚠ OWNERSHIP: the block payload is transferred, so the array `make` built is detached
       afterwards — no second resident copy. */
    assert.deepEqual(door.owns, new Array(8).fill('worker'), 'the scheduler copied the block payloads it had just built');
    for (const m of made) assert.equal(m.v.buffer.byteLength, 0, 'a transferred block payload is still resident on this side');

    /* … and a caller that says so keeps theirs. */
    const kept = new Float64Array([1, 2, 3]);
    const copy = await door.runBlocks('t.sum', worker.planBlocks({ units: 3, bytesPerUnit: 8, budgetBytes: 1024 }), {
      own: 'caller', make: () => ({ v: kept, from: 0 }), take: () => { },
    });
    assert.equal(copy.ok, true);
    assert.equal(kept.buffer.byteLength, 24, 'own:caller detached the caller array anyway');

    /* THE FIRST REFUSAL ENDS THE RUN. A `take` that refuses block 1 must not be followed by blocks
       2…7 — a scheduler that ran them all would spend the whole grid on work nobody will read. */
    const before = door.runs;
    const taken = [];
    const stopped = await door.runBlocks('t.sum', plan, {
      make: (from, count) => ({ v: new Float64Array(count), from: from }),
      take: (value, from, count, index) => { taken.push(index); return (index === 1) ? { ok: false, why: 'take-refused' } : undefined; },
    });
    assert.equal(stopped.ok, false, 'a refusing take was reported as a success');
    assert.equal(stopped.why, 'take-refused', 'the refusal was renamed on the way out');
    assert.ok(door.runs - before <= 3, 'the scheduler kept running blocks after a refusal (' + (door.runs - before) + ')');
    assert.deepEqual(taken, [0, 1], 'blocks were taken after the run had been refused');

    /* A reader who had already stopped gets no thread at all. */
    const ac = new AbortController();
    ac.abort();
    const none = await door.runBlocks('t.sum', plan, { signal: ac.signal, make: () => ({ v: new Float64Array(1), from: 0 }), take: () => { } });
    assert.equal(none.ok, false);
    assert.equal(none.why, 'aborted');

    /* and the refusals of the planner are the planner's, by name */
    assert.equal(worker.planBlocks({ units: 0, bytesPerUnit: 8 }).why, 'plan-invalid');
    assert.equal(worker.planBlocks({ units: 10, bytesPerUnit: 0 }).why, 'plan-invalid');
    assert.equal(worker.runBlocks('t.sum', { ok: false }, { make: () => ({}) }).then ? (await worker.runBlocks('t.sum', { ok: false }, { make: () => ({}) })).why : null, 'plan-invalid');
    assert.equal((await door.runBlocks('t.sum', plan, {})).why, 'blocks-make-missing');
  } finally { door.stop(); }
});
