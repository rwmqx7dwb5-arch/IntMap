/* ============================================================================
 *  #R819 · 受け口はあった。呼び手がいなかった — the dispatch into the other thread
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT, MEASURED BEFORE THIS WAS WRITTEN. js/gis-expr.js grew a job that evaluates an
 *  expression over rows or over planes, js/gis-worker.js grew the library door it needs, and
 *  tests/gis-worker-checks proved both of them against a real thread — and NOTHING IN js/ EVER
 *  BUILT A PAYLOAD FOR EITHER. `expr.rows` was a registered job with no caller, which is exactly the
 *  state tests/r759-gis-worker-checks ④ was opened for: 「Worker が在る」 と 「普段の分析が Worker
 *  で走る」 は別である. The two things that were missing were both entrances:
 *
 *    · js/gis-datasets.js's number rule could not be handed over at all. `asNumber` reached for a
 *      `leadingZero` that is not in its own text, so js/gis-worker.js — which ships a function by
 *      evaluating its source — would have rebuilt it into a ReferenceError. The only way past that
 *      without a factory is a SECOND spelling of 「この文字列は数か」, which is the drift
 *      .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids.
 *    · js/gis-ops.js `rasterCalc` held a COMPILED expression — a closure — and handed it to
 *      js/gis-raster.js `combine`, whose own comment says why that cannot travel.
 *
 *  SO WHAT IS MEASURED HERE IS NOT 「入口が増えたか」. An entrance that computed the answer on this
 *  thread and reported `used` would pass that ([[intmap-restate-the-defect-not-the-fix]]). It is:
 *
 *    ① 同じ式が、両方の経路で同じ格子を出す — pixel for pixel, in a REAL worker_threads thread
 *       running the product's own assembled source, over a corpus of expressions
 *    ② 運べない式は実行前に判定され、主スレッドの経路が同じ答えを出す — and the note says which
 *       thread answered, in the kernel's own vocabulary
 *    ③ 数値規則は二つ目ではない — the factory js/gis-datasets.js hands over IS the rule the module
 *       itself calls, it survives being rebuilt in a scope that has nothing of that module in it,
 *       and it answers cell for cell as the module answers (U+00A0 included)
 *    ④ 中止は途中結果を答えにしない — the run refuses by name, registers nothing, and says how much
 *       of this layer's own output had already been written into
 *
 *  ⚠ THE OTHER THREAD IS REAL. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool
 *  cannot spawn here; the door below runs `workerSource()` — the exact text the Blob is built from —
 *  inside a node:worker_threads thread and speaks only the three message types that protocol has.
 *  It is handed to `runBlocks` as its `run`, which is the seam that module already publishes, so
 *  everything above it (the plan, the blocks, `take`, `partial`, the abort) is the product's.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const SHIM = [
  "const { parentPort } = require('node:worker_threads');",
  'globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t || []) };',
  "parentPort.on('message', (d) => { if (typeof self.onmessage === 'function') self.onmessage({ data: d }); });",
  '',
].join('\n');

/* The product's protocol, in a thread node can actually make. Same door as
   tests/gis-worker-checks and tests/r759-gis-worker-checks, for the reason those files give:
   a stub that ran the job here could not be stopped mid-run. */
function threadDoor(api) {
  const live = new Set();
  const door = {
    threads: 0,
    stop() { for (const w of live) { try { w.terminate(); } catch (_) { } } live.clear(); },
    run(job, payload, ro) {
      const r = ro || {};
      return new Promise((resolve) => {
        if (api.jobNames().indexOf(job) < 0) { resolve({ ok: false, why: 'job-unknown' }); return; }
        const sig = r.signal || null;
        if (sig && sig.aborted) { resolve({ ok: false, why: 'aborted' }); return; }
        door.threads++;
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
          if (m.type === 'progress') { if (typeof r.onProgress === 'function') r.onProgress({ done: m.done, total: m.total }); return; }
          if (m.type !== 'done') return;
          done(m.ok ? { ok: true, value: m.value, transferred: 0 } : { ok: false, why: m.why || 'job-failed', detail: m.detail || null });
        });
        w.on('error', (e) => done({ ok: false, why: 'worker-died', detail: { message: String((e && e.message) || e) } }));
      });
    },
  };
  return door;
}

/* ⚠ THE PRODUCT'S KERNEL, WITH ONE SEAM REPLACED AND NOTHING ELSE. `runBlocks` already takes the
   runner as an option (js/gis-worker.js publishes it for exactly this reason), so the plan, the
   split, the block payloads, `take`, `partial` and the abort are all the shipped ones; only the
   thing that would have called `new Worker(new Blob(...))` is the node door.
   ⚠ AND THE BUDGET IS MADE SMALL ON PURPOSE, so a 256-pixel grid is many blocks: a single block
   would leave `take`, the block window and `partial` unmeasured, and those are what a cancellation
   in the middle of a real grid actually runs through. */
function opsWorker(worker, door, opts) {
  const o = opts || {};
  const api = Object.assign({}, worker, {
    runBlocks: (job, plan, ro) => worker.runBlocks(job, plan, Object.assign({}, ro, { run: door.run })),
  });
  if (o.budgetBytes != null) {
    api.planBlocks = (spec) => worker.planBlocks(Object.assign({}, spec, { budgetBytes: o.budgetBytes }));
  }
  return api;
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const data = makeGisDatasets();
  const ops = makeGisOps();
  const raster = makeGisRaster();
  const expr = makeGisExpr();
  const worker = makeGisWorker();
  /* ⚠ EVERY KERNEL MOUNTS ITSELF ON `window`, so the worker door is ALREADY THERE the moment it is
     built — and js/gis-ops.js reads it at call time. Taken down again here so that the reference run
     below is the product WITHOUT a door (「口そのものが無かった」), and each case states which of the
     two it is measuring rather than inheriting one from the case before it. */
  delete w.IntMapGisWorker;
  w.IntMapData = data;
  w.IntMapGisOps = ops;
  w.IntMapGisRaster = raster;
  w.IntMapGisExpr = expr;
  return { w, data, ops, raster, expr, worker };
}

/* 16×16 — big enough that the budget below splits it into many blocks, small enough to compare
   every pixel by hand. The voids are deliberate and they are of BOTH kinds: a NaN that arrived in
   the data, and the sentinel a producer declared. */
const W = 16, H = 16, N = W * H;
const NODATA = -9999;

function grids(data) {
  const av = [], bv = [];
  for (let i = 0; i < N; i++) {
    av.push(i % 37 === 0 ? NaN : (i % 53 === 0 ? NODATA : (i % 11) - 3));
    bv.push(i % 29 === 0 ? NODATA : ((i % 7) - 3));
  }
  const mk = (vals, name) => data.add({
    kind: 'raster', title: name, width: W, height: H,
    grid: { west: 0, north: H, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: name, nodata: NODATA }], read: () => vals.slice(),
  });
  return { a: mk(av, 'a'), b: mk(bv, 'b') };
}

/* ⚠ DERIVED FROM THE KERNEL'S OWN DECLARATION where it can be: every operator and every literal
   kind the two-band vocabulary can reach. A corpus typed for one expression would measure one
   expression, and the whole point of carrying a TREE is that it is not one expression. */
const EXPRS = [
  'a - b', '(a - b) / b', 'a * 0.1', 'a + b * 2', 'a % 3', '-a',
  'max(a, b)', 'min(a, b)', 'abs(a - b)', 'round(a / 3, 2)', 'sqrt(abs(a))',
  'if(a > b, a, b)', 'coalesce(a, b)', 'isnull(a)', 'a > b', 'not (a > b)',
  'a >= b and b != 0', 'a = null or b > 0', 'pow(a, 2) - pow(b, 2)',
];

function sameBytes(got, want, what) {
  assert.equal(got.length, want.length, what + ': a different number of pixels');
  for (let i = 0; i < want.length; i++) {
    const g = got[i], w = want[i];
    if (Number.isNaN(w)) { assert.ok(Number.isNaN(g), what + ': pixel ' + i + ' is ' + g + ', the other thread said void'); continue; }
    assert.equal(g, w, what + ': pixel ' + i);
  }
}

/* ══ ① 同じ式が、両方の経路で同じ格子を出す ══════════════════════════════════════════════ */

test('R819 ① rasterCalc answers the same grid on this thread and in a real worker', async () => {
  const { data, ops, worker } = await boot();
  const { a, b } = grids(data);

  /* THE REFERENCE FIRST, with no door mounted at all — which is also the measurement that the
     default answer did not move: this is the path the product had before this round. */
  const want = new Map();
  for (const src of EXPRS) {
    const r = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: src, outName: 'v' } });
    assert.equal(r.ok, true, src + ' refused on the main thread: ' + JSON.stringify(r.why || r));
    /* ⚠ 「口そのものが無かった」 is its own answer, not folded into 「使えなかった」. */
    assert.equal(r.stats.worker, 'not-used: worker-not-mounted', src + ' → ' + r.stats.worker);
    want.set(src, Array.from(r.dataset.read(0)));
  }

  /* ⚠ ONE BLOCK PER EXPRESSION HERE — the corpus is what this case is about, and every extra block
     is a whole node thread. The MANY-BLOCK path is measured by the two cases below, where it is the
     subject rather than a multiplier. */
  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  try {
    for (const src of EXPRS) {
      const r = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: src, outName: 'v' } });
      assert.equal(r.ok, true, src + ' refused off thread: ' + JSON.stringify(r.why || r));
      /* ⚠ THE CLAIM IS CHECKED, NOT TAKEN. If this said `used` while the arithmetic had quietly
         happened here, the whole round would be the defect it was opened for. */
      assert.equal(r.stats.worker, 'used', src + ' did not reach the other thread: ' + r.stats.worker);
      sameBytes(r.dataset.read(0), want.get(src), src);
    }
    assert.ok(door.threads >= EXPRS.length, 'the blocks were not run in threads (' + door.threads + ')');
  } finally { door.stop(); }

  /* ⚠ AND THE JOB IT RAN IS THE ONE js/gis-expr.js REGISTERS — the registered job that had no
     caller. Asked of the registry rather than spelled here. */
  const { makeGisExpr } = await import('../js/gis-expr.js');
  assert.ok(worker.jobNames().indexOf(makeGisExpr().worker.job) >= 0, 'nothing registered the expression job');
});

test('R819 ① the counts and the band declaration are the same on both paths', async () => {
  const { data, ops, worker } = await boot();
  const { a, b } = grids(data);
  const step = { op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: '(a - b) / b', outName: 'ratio', unit: 'm' } };

  const here = await ops.run(step);
  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door, { budgetBytes: 24 * 24 });
  let there;
  try { there = await ops.run(step); } finally { door.stop(); }

  assert.equal(here.ok, true); assert.equal(there.ok, true);
  /* ⚠ 「欠損が何画素か」 is the number a reader acts on, and a path that counted them differently
     would be a second answer wearing the first one's label. */
  assert.equal(there.stats.count, here.stats.count, 'the two paths disagree about how many pixels have an answer');
  assert.equal(there.stats.nodata, here.stats.nodata, 'the two paths disagree about how many pixels are void');
  assert.equal(there.stats.failed, here.stats.failed);
  assert.equal(there.stats.error, here.stats.error);
  assert.deepEqual(there.dataset.bands, here.dataset.bands, 'the band declaration moved');
  assert.deepEqual(there.dataset.grid, here.dataset.grid, 'the lattice moved');
});

/* ══ ② 運べない式は実行前に判定される ════════════════════════════════════════════════════ */

test('R819 ② an expression that cannot be carried is judged before a thread, and answered here', async () => {
  const { data, ops, worker, expr } = await boot();
  const { a, b } = grids(data);

  /* ⚠ THE JUDGEMENT IS ASKED OF THE KERNEL, not of a list here: `portable` is what js/gis-ops.js
     asks, and this is the same question about the same tree. A node kind the kernel cannot carry is
     not something a reader can type today — which is the point: the door refuses BEFORE a payload
     rather than after a DataCloneError, whatever grows the tree next. */
  const carried = expr.parse('a - b');
  assert.equal(expr.portable(carried.ast).ok, true);
  const orphan = { t: 'bin', op: '**', a: { t: 'field', name: 'a' }, b: { t: 'num', v: 2 } };
  const verdict = expr.portable(orphan);
  assert.equal(verdict.ok, false, 'the kernel would have carried a tree it cannot read');
  assert.ok(expr.refusals().indexOf(verdict.why) >= 0, 'an undeclared refusal code: ' + verdict.why);

  const door = threadDoor(worker);
  /* A door that would refuse the moment it was asked, so `used` here would be impossible: the run
     must still produce the whole answer. */
  const blind = Object.assign({}, opsWorker(worker, door, { budgetBytes: 24 * 24 }), {
    planBlocks: () => ({ ok: false, why: 'plan-invalid', detail: { field: 'units' } }),
  });
  globalThis.window.IntMapGisWorker = blind;
  let there;
  try { there = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: '(a - b) / b', outName: 'v' } }); }
  finally { door.stop(); }
  delete globalThis.window.IntMapGisWorker;
  const here = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: '(a - b) / b', outName: 'v' } });

  assert.equal(there.ok, true, 'a door that could not be used took the answer with it: ' + JSON.stringify(there.why || there));
  assert.equal(there.stats.worker, 'not-used: plan-invalid', 'the reason the thread was not used is not stated: ' + there.stats.worker);
  /* ⚠ AND THE ANSWER IS THE SAME ONE. 「使えなかった」 must cost the reader nothing but time. */
  sameBytes(there.dataset.read(0), here.dataset.read(0), 'the fallback');
  assert.equal(there.stats.count, here.stats.count);
  assert.equal(there.stats.nodata, here.stats.nodata);
});

/* ══ ③ 数値規則は二つ目ではない ══════════════════════════════════════════════════════════ */

test('R819 ③ the rule handed over is the rule the module itself calls, rebuilt from its own text', async () => {
  const { data } = await boot();
  const factory = data.numberRuleFactory;
  assert.equal(typeof factory, 'function', 'js/gis-datasets.js hands over no rule at all');

  /* ⚠⚠⚠ THE CONTRACT, READ OUT OF THE SHIPPED TEXT. js/gis-worker.js rebuilds a library from
     `fn.toString()` in the worker's global scope, so a name borrowed from the module around it is
     not in the text and arrives as a ReferenceError. Rebuilding it HERE — in a scope that has
     nothing of js/gis-datasets.js in it — is that same reconstruction. This is the defect the round
     started from: `asNumber` reached for `leadingZero`, which is not inside `asNumber`. */
  const src = String(factory);
  const rebuilt = new Function('return (' + src + ')')()();
  for (const k of ['asNumber', 'isEmpty', 'typeColumn', 'asDate']) {
    assert.equal(typeof rebuilt[k], 'function', 'the rebuilt rule has no ' + k);
  }

  /* ⚠ CELL FOR CELL, AND U+00A0 IS IN THE CORPUS ON PURPOSE. js/gis-datasets.js strips the no-break
     space a spreadsheet writes as a thousands separator and leaves `1 000` (a plain space) as text —
     a difference of ONE CHARACTER between two spellings of the rule, and the only implementation
     difference this round found between a copy of the rule and the rule. There is now no copy: the
     module calls what is rebuilt here, so the two cannot drift. */
  const cells = [
    '1', '1.5', '-2', '1e3', '.5', '0', '0.5', '+7', '01100', '007', '-0.25', '0e3',
    '', '   ', ' ', 'x', '12 km', '1 000', '1 000', ' 1 000 ',
    '2020', '0005-03-01', '2026-02-30', '2026-02-28T12:00:00Z', '03/04/2020',
    null, undefined, 4, NaN, Infinity, true, {}, [],
  ];
  for (const c of cells) {
    const label = ' about ' + JSON.stringify(c === undefined ? 'undefined' : c);
    assert.equal(Object.is(rebuilt.asNumber(c), data.asNumber(c)), true, 'asNumber disagrees' + label);
    assert.equal(rebuilt.isEmpty(c), data.isEmpty(c), 'isEmpty disagrees' + label);
    assert.equal(Object.is(rebuilt.asDate(c), data.asDate(c)), true, 'asDate disagrees' + label);
    assert.deepEqual(rebuilt.typeColumn('c', [c]), data.typeColumn('c', [c]), 'typeColumn disagrees' + label);
  }
  /* and over a whole column, where the verdict is the one a panel prints */
  assert.deepEqual(rebuilt.typeColumn('code', cells), data.typeColumn('code', cells));
  assert.deepEqual(rebuilt.typeColumn('n', ['1', '2', '3']), data.typeColumn('n', ['1', '2', '3']));
  assert.deepEqual(rebuilt.typeColumn('c', ['01100', '00733']), data.typeColumn('c', ['01100', '00733']));

  /* ⚠ AND THE MODULE'S OWN DOORS ARE THAT FACTORY'S OUTPUT, not a parallel implementation: the
     three the expression kernel asks for are the ones exported. */
  const built = factory();
  for (const k of ['asNumber', 'isEmpty', 'typeColumn']) {
    assert.equal(typeof built[k], 'function', 'the factory does not build ' + k);
  }
});

test('R819 ③ the expression kernel accepts that factory as its rule and refuses without one', async () => {
  const { data, expr, worker } = await boot();
  const bare = expr.worker.install(worker, {});
  assert.equal(bare.ok, false);
  assert.equal(bare.reason, 'expr-no-number-rule');
  const ok = expr.worker.install(worker, { rule: data.numberRuleFactory });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  /* the bytes the worker evaluates are this module's own function, not a copy of it */
  assert.equal(worker.librarySourceOf(expr.worker.ruleLibrary), String(data.numberRuleFactory));
});

/* ══ ④ 中止は途中結果を答えにしない ══════════════════════════════════════════════════════ */

test('R819 ④ a stop during the carried pass leaves no half answer and says what it had written', async () => {
  const { data, ops, worker } = await boot();
  const { a, b } = grids(data);

  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door, { budgetBytes: 24 * 8 });
  const stop = new AbortController();
  let ticks = 0;
  let res;
  try {
    res = await ops.run(
      { op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: '(a - b) / b', outName: 'v' } },
      { signal: stop.signal, onProgress: () => { ticks++; stop.abort(); } });
  } finally { door.stop(); }

  assert.equal(res.ok, false, 'the run finished after the reader asked it to stop');
  assert.equal(res.why, 'cancelled', 'it stopped for the wrong reason: ' + res.why);
  /* ⚠ THE ONE THING A CANCELLED RUN MUST NOT DO. A grid assembled from the blocks that happened to
     land is a plausible map of nothing. */
  assert.equal(res.dataset, undefined, 'a partial grid was registered as a result');
  assert.ok(ticks > 0, 'it never reported progress — the stop was never readable');
  /* ⚠ AND IT IS NOT 「何も起きなかった」. `take` had written into this layer's own output, so the
     refusal states how much of it — measured by js/gis-worker.js, never planned. */
  assert.ok(res.detail && typeof res.detail.done === 'number', 'the cancellation says nothing about where it got to');
  if (res.detail.partial) {
    const p = res.detail.partial;
    assert.equal(typeof p.blocks, 'number');
    assert.equal(typeof p.of, 'number');
    assert.ok(p.blocks <= p.of, 'partial claims more blocks than the plan has');
    assert.ok(p.of > 1, 'the grid was one block — this case did not measure a cancellation between blocks');
  }
});

test('R819 ④ a signal that is already aborted never reaches a thread at all', async () => {
  const { data, ops, worker } = await boot();
  const { a, b } = grids(data);
  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door, { budgetBytes: 24 * 8 });
  const dead = new AbortController();
  dead.abort();
  let res;
  try {
    res = await ops.run(
      { op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'a - b', outName: 'v' } },
      { signal: dead.signal });
  } finally { door.stop(); }
  assert.equal(res.ok, false);
  assert.equal(res.why, 'cancelled');
  assert.equal(res.dataset, undefined);
  /* ⚠ 「観測できなかった」 と 「失敗した」 は別 (.agents/rules/one-pass-or-a-reason.md §5): a reader
     who stopped it before it began is not a worker that could not be used, and nothing was spent
     proving that. */
  assert.equal(door.threads, 0, 'a thread was spawned for a run the reader had already stopped');
});
