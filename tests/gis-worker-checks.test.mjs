/* ============================================================================
 *  #R819 · 重い計算を「完了できる単位」で分離する — the expression kernel and a geometry
 *          operation, in the other thread, and a stop that reaches them
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT, MEASURED BEFORE ANY OF THIS WAS WRITTEN, and docs/GIS-CORE.md §3.6 states it in
 *  its own words:
 *
 *    ·  「まだ運べないもの: combine と rasterCalc。`fn` はクロージャ（js/gis-expr.js の compile 済みで
 *       AST と数値規則を閉じ込めている）で、Worker は fn.toString() を評価するので
 *       job-not-self-contained になる」 — every computed column and every raster expression ran on
 *       the thread that paints, and nothing about that was a property of the ARITHMETIC: the tree
 *       was already plain JSON. What could not travel was the CLOSURE around it.
 *    ·  「幾何の runner（sweep line そのもの）はまだ載っていない」 — a caller holding two polygons
 *       had no door to send them to at all. Every registered job took numbers in typed arrays.
 *
 *  SO WHAT IS MEASURED HERE IS NOT 「Worker に渡す関数が増えたか」. A door that accepts a tree and
 *  then computes it on this thread would pass that ([[intmap-restate-the-defect-not-the-fix]]). It is:
 *
 *    ① THE TREE IS DATA — it survives structuredClone unchanged, and it carries no function
 *    ② 運べない式は実行前に判定される — the refusal arrives before a thread is spent, and it wears
 *       one of the nine codes the kernel already declares (a tenth would have no sentence)
 *    ③ ONE KERNEL, TWO ENVIRONMENTS — the same expression over the same rows answers the same
 *       values on this thread and inside a real worker built from the product's own assembled source
 *    ④ THE NUMBER RULE IS NOT A SECOND ONE — the rule handed to the worker answers as
 *       js/gis-datasets.js answers, cell for cell, or this check fails
 *    ⑤ THE GEOMETRY INTAKE dispatches to the function that was PROVIDED, and refuses by name — with
 *       the vocabulary — when the operation was not
 *    ⑥ THE STOP REACHES A SINGLE ENORMOUS OPERATION, and leaves no half answer
 *    ⑦ A CANCELLED runBlocks SAYS HOW MUCH OF THE CALLER'S OUTPUT IT ALREADY WROTE INTO
 *
 *  ⚠ THE OTHER THREAD IS REAL. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool
 *  cannot spawn here. The door below runs the REAL assembled source — `workerSource()`, the exact
 *  text the Blob is built from, protocol preamble and all — inside a node:worker_threads thread and
 *  speaks only the three message types that protocol has. It is the same door
 *  tests/r759-gis-worker-checks built, for the reason that file gives: a stub that ran the job on
 *  this thread could not be stopped mid-run, which is the one thing ⑥ has to see.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const expr = makeGisExpr();
  const worker = makeGisWorker();
  const data = makeGisDatasets();
  w.IntMapData = data;
  return { w, expr, worker, data };
}

/* ══ THE NUMBER RULE, HANDED OVER AS ONE FUNCTION ═════════════════════════════════════════════
   ⚠ THIS IS NOT A SECOND RULE, AND ④ IS WHAT KEEPS IT FROM BECOMING ONE. js/gis-worker.js rebuilds a
   provided function from its own source text, so a factory that borrowed a name from the module
   around it would arrive unbound — which is why the three functions are written here as one
   self-contained factory rather than handed over from js/gis-datasets.js, whose `asNumber` reaches
   for a `leadingZero` that is NOT in its own text.
   ⚠ AND THE SAME OBJECT IS USED ON BOTH SIDES OF ③: this thread evaluates with `numberRule()` and
   the worker evaluates with this factory rebuilt, so ③ compares KERNELS and not rules. ④ then holds
   this factory against js/gis-datasets.js cell for cell, so a drift between the two is a red test
   and not a column that compares one way in the panel and another way in a worker. */
function numberRuleFactory() {
  var pad = /^[+-]?0\d/;
  var num = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  /* ⚠ THE SEPARATOR THAT IS STRIPPED IS U+00A0 AND NOT A PLAIN SPACE — js/gis-datasets.js strips the
     no-break space a spreadsheet writes as a thousands separator, and leaves `1 000` as text
     («a number is the whole cell or it is not a number»). ④ is what caught the difference. */
  var nbsp = /\u00a0/g;
  function isEmpty(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }
  function asNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim().replace(nbsp, '');
    if (s === '') return null;
    if (!num.test(s)) return null;
    if (pad.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function typeColumn(name, values) {
    var empty = 0, nums = 0, total = 0, padded = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      total++;
      if (isEmpty(v)) { empty++; continue; }
      if (asNumber(v) != null) nums++;
      else if (typeof v === 'string' && pad.test(v.trim()) && num.test(v.trim().replace(nbsp, ''))) padded++;
    }
    var filled = total - empty;
    var col = { name: name, type: (filled > 0 && nums === filled) ? 'number' : 'text', empty: empty, filled: filled, total: total };
    if (padded > 0) col.padded = padded;
    return col;
  }
  return { asNumber: asNumber, isEmpty: isEmpty, typeColumn: typeColumn };
}

/* ══ THE DOOR — the product's registry and the product's assembled source, in a real thread ════ */

const SHIM = [
  "const { parentPort } = require('node:worker_threads');",
  'globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t || []) };',
  "parentPort.on('message', (d) => { if (typeof self.onmessage === 'function') self.onmessage({ data: d }); });",
  '',
].join('\n');

function threadDoor(api) {
  const live = new Set();
  const door = {
    api,
    /* ⚠ THE RAW PROTOCOL, NOT THE KERNEL'S VIEW OF IT. How far the THREAD got is the only evidence
       that terminate() reached arithmetic that was running. */
    maxDone: 0,
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
          /* ⚠ THE SAME STOP js/gis-worker.js USES. A slot holds one job, so ending the thread ends
             that job and nothing else — there is no cooperative point inside a sweep line to ask. */
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

/* The corpus: every function the kernel declares, appearing at least once, plus every operator and
   every literal kind. Derived from `functions()` rather than typed out, so a function added to the
   kernel and not exercised here is a failing check and not a silent gap. */
function corpus(expr) {
  const byName = {
    abs: 'abs([n])', floor: 'floor([n])', ceil: 'ceil([n])', sqrt: 'sqrt([n])',
    log: 'log([n])', ln: 'ln([n])', pow: 'pow([n], 2)', round: 'round([n], 1)',
    min: 'min([n], [m])', max: 'max([n], [m])', if: 'if([n] > 1, [n], [m])',
    coalesce: 'coalesce([blank], [n])', number: 'number([code])', text: 'text([n])',
    len: 'len([name])', upper: 'upper([name])', lower: 'lower([name])', trim: 'trim([name])',
    concat: 'concat([name], [n])', substr: 'substr([name], 2, 3)',
    contains: 'contains([name], [name])', startswith: 'startswith([name], [name])',
    isnull: 'isnull([blank])',
  };
  const names = expr.functions().map((f) => f.name);
  const missing = names.filter((n) => !byName[n]);
  assert.deepEqual(missing, [], 'a function the kernel declares is not exercised here: ' + missing.join(', '));
  return names.map((n) => byName[n]).concat([
    '[n] + [m] - 1', '[n] * [m] / 2', '[n] % 3', '-[n]', 'not ([n] > 1)',
    '[n] > [m] and [n] != 0 or [blank] = null', '[name] = "x"', 'true', 'false', 'null',
    '[code] = "01100"', '[blank] + 1',
  ]);
}

const ROWS = [
  { n: 4, m: 9, name: '  Tokyo  ', code: '01100', blank: '' },
  { n: '2.5', m: '0', name: 'osaka', code: '1100', blank: null },
  { n: null, m: 7, name: '', code: '007', blank: '  ' },
  { n: -3, m: '1e2', name: '札幌市中央区', code: '0', blank: undefined },
  { n: 0, m: 0, name: 'x', code: '12', blank: '' },
];

/* ══ ① 構文木はデータである ═══════════════════════════════════════════════════════════════ */

test('R819 ① the tree survives structuredClone unchanged and carries no function', async () => {
  const { expr } = await boot();
  let seen = 0;
  for (const src of corpus(expr)) {
    const p = expr.parse(src);
    assert.equal(p.ok, true, src + ' → ' + JSON.stringify(p));
    /* The transport's own judgement, not a list of allowed types: structuredClone throws
       DataCloneError on anything a postMessage could not carry. */
    const copy = structuredClone(p.ast);
    assert.deepEqual(copy, p.ast, 'the tree changed on the way through structured clone: ' + src);
    /* And nothing reachable from it is a function — the defect the whole round is about was a
       CLOSURE, so 「関数を含まない」 is measured rather than assumed. */
    const walk = (v) => {
      assert.notEqual(typeof v, 'function', 'a function is reachable from the tree of ' + src);
      if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(p.ast);
    assert.equal(expr.portable(p.ast).ok, true, src + ' is not portable: ' + JSON.stringify(expr.portable(p.ast)));
    seen++;
  }
  assert.ok(seen >= 30, 'the corpus is measuring almost nothing (' + seen + ')');
});

/* ══ ② 運べない式は実行前に判定される ═════════════════════════════════════════════════════ */

test('R819 ② an unportable tree is refused before anything runs, in the kernel\'s own vocabulary', async () => {
  const { expr } = await boot();
  const declared = expr.refusals();

  const cases = [
    /* a closure hiding in a tree somebody assembled — the exact thing structuredClone throws on */
    [{ t: 'call', name: 'abs', args: [{ t: 'num', v: 1, extra: () => 1 }] }, 'expr-bad-ast'],
    [{ t: 'num', v: Infinity }, 'expr-bad-ast'],
    [{ t: 'num', v: '1' }, 'expr-bad-ast'],
    [{ t: 'nope', v: 1 }, 'expr-bad-ast'],
    [{ t: 'bin', op: '**', a: { t: 'num', v: 1 }, b: { t: 'num', v: 2 } }, 'expr-bad-ast'],
    [{ t: 'un', op: '!', a: { t: 'num', v: 1 } }, 'expr-bad-ast'],
    [{ t: 'bin', op: '+', a: { t: 'num', v: 1 } }, 'expr-bad-ast'],
    [{ t: 'call', name: 'nope', args: [] }, 'expr-unknown-function'],
    [{ t: 'call', name: 'abs', args: [] }, 'expr-arity'],
    [null, 'expr-bad-ast'],
  ];
  for (const [ast, why] of cases) {
    const r = expr.portable(ast);
    assert.equal(r.ok, false, 'accepted a tree it cannot carry: ' + JSON.stringify(ast));
    assert.equal(r.why, why, JSON.stringify(ast) + ' → ' + JSON.stringify(r));
    /* ⚠ A TENTH CODE WOULD BE A REFUSAL WITH NO SENTENCE — tests/r729-gis-core-checks ④ measures
       every declared code against js/gis-panel.js, and this judgement was deliberately written to
       answer with the nine that already have one. */
    assert.ok(declared.indexOf(r.why) >= 0, 'undeclared refusal code: ' + r.why);
  }

  /* And the one that proves the point of the pre-flight: the tree with a function in it is a tree
     structuredClone itself refuses, so without this judgement the failure would arrive AFTER the
     transfer was attempted. */
  assert.throws(() => structuredClone({ t: 'num', v: 1, extra: () => 1 }));
});

test('R819 ② every node kind the evaluator can read is one the carry judgement knows', async () => {
  const { expr } = await boot();
  const src = read('js/gis-expr.js');
  /* ⚠ `\r?` — the checkout's line endings are the machine's (core.autocrlf), and a gate whose
     verdict depends on the runner is the defect [[intmap-gate-verdict-must-not-depend-on-the-runner]]
     records. What is being read here is the switch, not the bytes. */
  const body = /function evalNode\(node, row, R\) \{([\s\S]*?)\r?\n {4}\}/.exec(src);
  assert.ok(body, 'evalNode was not found — this check is measuring nothing');
  const kinds = new Set();
  for (const m of body[1].matchAll(/case '([a-z]+)':/g)) kinds.add(m[1]);
  assert.ok(kinds.size >= 8, 'the switch was not read (' + kinds.size + ')');
  const known = new Set(expr.nodeKinds());
  const orphan = Array.from(kinds).filter((k) => !known.has(k)).sort();
  /* A kind the evaluator gained and the carry judgement did not would be refused as unreadable —
     safe, and silent. This is the moment somebody is told. */
  assert.deepEqual(orphan, [], 'evalNode reads node kinds the carry judgement does not know: ' + orphan.join(', '));
});

/* ══ ③ 同じカーネルを、二つの実行環境から ═════════════════════════════════════════════════ */

test('R819 ③ the same expression answers the same values on this thread and in a real worker', async () => {
  const { expr, worker } = await boot();

  /* The door refuses to exist without the rule — asked BEFORE a job is registered. */
  const noRule = expr.worker.install(worker, {});
  assert.equal(noRule.ok, false, JSON.stringify(noRule));
  assert.equal(noRule.reason, 'expr-no-number-rule');
  assert.equal(worker.jobNames().indexOf(expr.worker.job), -1, 'the job was registered although the rule was never handed over');

  const installed = expr.worker.install(worker, { rule: numberRuleFactory });
  assert.equal(installed.ok, true, JSON.stringify(installed));
  assert.ok(worker.libraryNames().indexOf(expr.worker.kernelLibrary) >= 0, 'the kernel was not provided');
  assert.equal(worker.jobNames().indexOf(expr.worker.job) >= 0, true);

  /* ⚠ THE BYTES THE WORKER EVALUATES ARE THE FUNCTION THIS THREAD CALLS. */
  assert.equal(worker.librarySourceOf(expr.worker.kernelLibrary), String(expr.worker.kernelFunction()));

  const door = threadDoor(worker);
  const rule = numberRuleFactory();
  try {
    for (const src of corpus(expr)) {
      const p = expr.parse(src);
      assert.equal(p.ok, true, src);
      const here = ROWS.map((row) => {
        const r = expr.evaluate(p.ast, row, rule);
        return r.error ? { error: r.error.why } : { value: r.value };
      });
      const res = await door.run(expr.worker.job, { ast: p.ast, rows: ROWS.map((r) => Object.assign({}, r)) });
      assert.equal(res.ok, true, src + ' → ' + JSON.stringify(res));
      const there = res.value.list.map((v, i) => (res.value.error && v === null && here[i].error) ? { error: here[i].error } : { value: v });
      /* Values first, and they must be identical — not close, identical. */
      assert.deepEqual(res.value.list, here.map((h) => ('error' in h ? null : h.value)), 'the two threads disagree about ' + src);
      assert.equal(res.value.length, ROWS.length);
      assert.equal(res.value.errors, here.filter((h) => 'error' in h).length, 'the two threads disagree about which rows refused: ' + src);
      assert.equal(there.length, ROWS.length);
    }
  } finally { door.stop(); }
});

test('R819 ③ the columnar form is the same kernel too, and its conversion is the caller\'s', async () => {
  const { expr, worker } = await boot();
  assert.equal(expr.worker.install(worker, { rule: numberRuleFactory }).ok, true);
  /* The rule js/gis-ops.js rasterCalc applies to an output grid, handed over as ITS OWN function
     rather than restated inside the job — the whole argument for the library door. */
  function toBand(v) {
    if (v === true) return 1;
    if (v === false) return 0;
    return (typeof v === 'number') ? v : NaN;
  }
  assert.equal(worker.provide('expr.toBand', toBand).ok, true);

  const p = expr.parse('(a - b) / b');
  const a = Float64Array.from([10, 20, 30, NaN]);
  const b = Float64Array.from([5, 0, 3, 2]);
  const door = threadDoor(worker);
  try {
    const res = await door.run(expr.worker.job, { ast: p.ast, bands: { a: a, b: b }, length: 4, convert: 'expr.toBand' });
    assert.equal(res.ok, true, JSON.stringify(res));
    const rule = numberRuleFactory();
    const here = [];
    for (let i = 0; i < 4; i++) here.push(toBand(expr.evaluate(p.ast, { a: a[i], b: b[i] }, rule).value));
    assert.deepEqual(Array.from(res.value.values).map((v) => (Number.isNaN(v) ? 'NaN' : v)), here.map((v) => (Number.isNaN(v) ? 'NaN' : v)));
    /* Division by zero is null (rule ③ of js/gis-expr.js) and a missing input propagates — both
       arrive as a void in the band, which is js/gis-raster.js's missing rule and not a second one. */
    assert.equal(Number.isNaN(res.value.values[1]), true, '/0 must not become a measurement');
    assert.equal(Number.isNaN(res.value.values[3]), true, 'a missing input must not become a number');
  } finally { door.stop(); }
});

/* ══ ④ 数値規則は二つ目ではない ═══════════════════════════════════════════════════════════ */

test('R819 ④ the rule handed to the worker answers as js/gis-datasets.js answers', async () => {
  const { data } = await boot();
  const mine = numberRuleFactory();
  const cells = ['1', '1.5', '-2', '1e3', '01100', '007', '0', '0.5', '+7', '', '   ', 'x', '12 km', '1 000', '1\u00a0000', null, undefined, 4, NaN];
  for (const c of cells) {
    assert.equal(mine.asNumber(c), data.asNumber(c), 'asNumber disagrees about ' + JSON.stringify(c));
    assert.equal(mine.isEmpty(c), data.isEmpty(c), 'isEmpty disagrees about ' + JSON.stringify(c));
    const a = mine.typeColumn('c', [c]), b = data.typeColumn('c', [c]);
    assert.equal(a.padded || 0, b.padded || 0, 'the padded verdict disagrees about ' + JSON.stringify(c));
  }
});

/* ══ ⑤ 幾何の受け口 ═══════════════════════════════════════════════════════════════════════ */

test('R819 ⑤ the geometry intake runs the function that was provided, and names what was not', async () => {
  const { worker } = await boot();

  /* Before anything is provided the vocabulary is empty and the refusal says so — on THIS thread,
     before a polygon has been copied into a worker. */
  const cold = worker.geometryReady('union');
  assert.equal(cold.ok, false);
  assert.equal(cold.why, 'geometry-op-unavailable');
  assert.deepEqual(cold.detail.have, []);

  /* A real, self-contained geometry function: the spherical-excess-free planar ring area, which is
     arithmetic a kernel owns — this file provides one only to prove the transport. */
  function ringArea(ring) {
    var s = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      s += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    }
    return { ok: true, value: Math.abs(s) / 2 };
  }
  function refuse() { return { ok: false, why: 'geometry-empty', detail: { rings: 0 } }; }

  assert.equal(worker.provideGeometry('ringArea', ringArea).ok, true);
  assert.equal(worker.provideGeometry('nothing', refuse).ok, true);
  assert.deepEqual(worker.geometryOps().sort(), ['nothing', 'ringArea']);
  assert.equal(worker.geometryReady('ringArea').ok, true);

  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const door = threadDoor(worker);
  try {
    const ok = await door.run(worker.geometryJob, { op: 'ringArea', args: [square] });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.value.op, 'ringArea');
    assert.equal(ok.value.value, 4, 'the answer is the kernel function\'s own, computed in the thread');
    assert.deepEqual(ok.value.value, ringArea(square).value, 'the two threads disagree about the same function');

    /* A refusal the kernel wrote travels as a refusal, not as a successful undefined. */
    const no = await door.run(worker.geometryJob, { op: 'nothing', args: [] });
    assert.equal(no.ok, false);
    assert.equal(no.why, 'geometry-empty');
    assert.deepEqual(no.detail, { rings: 0 });

    /* An operation nobody provided is named, WITH the vocabulary — not a TypeError at the first
       vertex of somebody's 200,000-point polygon. */
    const missing = await door.run(worker.geometryJob, { op: 'union', args: [square, square] });
    assert.equal(missing.ok, false);
    assert.equal(missing.why, 'geometry-op-unavailable');
    assert.deepEqual(missing.detail.have.sort(), ['nothing', 'ringArea']);

    const bad = await door.run(worker.geometryJob, { op: 'ringArea', args: null });
    assert.equal(bad.ok, false);
    assert.equal(bad.why, 'geometry-args-invalid');
  } finally { door.stop(); }
});

/* ══ ⑥ 中止は、走っている 1 個の演算に届く ═══════════════════════════════════════════════ */

/* ⚠ ONE FEATURE, NOT MANY. Yielding between features shortens nothing when the time is inside ONE of
   them, which is the case this check exists for: a single call that runs for a long time and has no
   cooperative point in it. The stop is therefore the thread's end, and what is measured is that the
   arithmetic DID NOT FINISH — `maxDone` is the raw protocol's own count, because the kernel stops
   listening the moment it aborts and its own answer cannot tell a killed walk from a finished one. */
test('R819 ⑥ a stop reaches a single enormous operation, and leaves no half answer', async () => {
  const { worker } = await boot();

  function grind(spec, progress) {
    var n = spec.steps, inner = spec.inner, acc = 0;
    var step = Math.max(1, Math.floor(n / 64));
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < inner; j++) acc += Math.sqrt(i * 2654435761 + j);
      if ((i % step) === 0 && progress) progress(i, n);
    }
    return { ok: true, value: { steps: n, acc: acc } };
  }
  assert.equal(worker.provideGeometry('grind', grind).ok, true);

  const door = threadDoor(worker);
  const spec = { steps: 4096, inner: 12000 };
  try {
    const ctl = new AbortController();
    let first = 0;
    const started = Date.now();
    const res = await door.run(worker.geometryJob, { op: 'grind', args: [spec], withProgress: true }, {
      signal: ctl.signal,
      /* The stop is asked for while the arithmetic is demonstrably running. */
      onProgress: (p) => { if (!first && p.done > 0) { first = p.done; ctl.abort(); } },
    });
    assert.ok(first > 0, 'the operation never reported progress — the run was not observed at all');
    assert.equal(res.ok, false, 'a cancelled run answered ok: ' + JSON.stringify(res));
    assert.equal(res.why, 'aborted');
    /* ⚠ AND NOTHING CAME BACK. A partial walk is not an answer, and the protocol has no message that
       could deliver one: progress carries counts, `done` carries the result, and this run has none. */
    assert.equal(res.value, undefined, 'a cancelled run handed back a value');
    assert.ok(door.maxDone < spec.steps, 'the thread ran to completion (' + door.maxDone + '/' + spec.steps + ') — the stop did not reach it');
    assert.ok(Date.now() - started < 60000, 'the stop did not return promptly');

    /* The same operation, allowed to finish, IS the same answer — so ⑥ measured a stop and not a
       broken door. */
    const whole = await door.run(worker.geometryJob, { op: 'grind', args: [{ steps: 8, inner: 8 }] });
    assert.equal(whole.ok, true, JSON.stringify(whole));
    assert.deepEqual(whole.value.value, grind({ steps: 8, inner: 8 }).value);
  } finally { door.stop(); }
});

/* ══ ⑦ 中止された分割走行は、書き込んでしまった分を述べる ═══════════════════════════════ */

test('R819 ⑦ a cancelled runBlocks reports what it had already written into the caller\'s output', async () => {
  const { worker } = await boot();
  function count(spec) { return { ok: true, value: { from: spec.from, count: spec.count } }; }
  assert.equal(worker.provideGeometry('count', count).ok, true);

  const door = threadDoor(worker);
  try {
    const plan = worker.planBlocks({ units: 40, bytesPerUnit: 1024, budgetBytes: 10 * 1024, inFlight: 1 });
    assert.equal(plan.ok, true, JSON.stringify(plan));
    assert.equal(plan.plan.blocks, 4);

    const ctl = new AbortController();
    const written = [];
    const res = await worker.runBlocks(worker.geometryJob, plan, {
      run: door.run,
      own: 'caller',
      signal: ctl.signal,
      make: (from, count2) => ({ op: 'count', args: [{ from: from, count: count2 }] }),
      take: (value) => { written.push(value.value.from); ctl.abort(); },
    });
    assert.equal(res.ok, false, 'a cancelled run answered ok: ' + JSON.stringify(res));
    assert.equal(res.why, 'aborted');
    /* ⚠ THE HALF IS NAMED. `take` wrote into the caller's destination for block 0 and the run then
       stopped, so a refusal that said nothing about it would be a refusal a caller could read as
       「何も起きなかった」 — and ship a part-written output. */
    assert.ok(res.partial, 'the refusal does not say how much was already taken');
    assert.equal(res.partial.blocks, written.length);
    assert.equal(res.partial.of, 4);
    assert.ok(res.partial.units > 0 && res.partial.units < 40, JSON.stringify(res.partial));

    /* And a run nobody stopped has no `partial` at all — the field is a measurement, not a habit. */
    const ok = await worker.runBlocks(worker.geometryJob, plan, {
      run: door.run, own: 'caller',
      make: (from, count2) => ({ op: 'count', args: [{ from: from, count: count2 }] }),
      take: () => { },
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.partial, undefined);
    assert.equal(ok.units, 40);
  } finally { door.stop(); }
});
