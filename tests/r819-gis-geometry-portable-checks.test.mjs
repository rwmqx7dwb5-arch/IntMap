/* ============================================================================
 *  #R819 · 幾何カーネルは運べるか — the geometry kernel, in the other thread
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT, MEASURED BEFORE ANY OF THIS WAS WRITTEN. js/gis-worker.js finished the receiving
 *  end of a geometry door in this same round — `provideGeometry(op, fn)`, the `geometry.op` job, the
 *  vocabulary read back out of the registry, the pre-flight, and a stop that ends the thread — and
 *  NOT ONE OPERATION IN js/gis-geometry.js COULD GO THROUGH IT. Every door there closed over the
 *  module scope around it (`PC`, `geodesy()`, `SAME_EPS`, sixty helpers), and `provide()` rebuilds a
 *  function from its OWN SOURCE TEXT: a borrowed name arrives unbound and the protocol says so by
 *  name (`job-not-self-contained`). The intake was complete and there was nothing to carry.
 *
 *  So what is measured here is NOT 「扉が増えたか」. A door that accepted a polygon and then computed
 *  it on this thread would pass that ([[intmap-restate-the-defect-not-the-fix]]). It is:
 *
 *    ① THE FACTORY IS SELF-CONTAINED — rebuilt from its own bytes inside a REAL worker thread, from
 *       the product's own assembled source, and it answers there
 *    ② ONE KERNEL, TWO THREADS — the same operation over the same shape answers the same JSON on
 *       this thread and in that one
 *    ③ WHAT CANNOT TRAVEL IS NAMED BEFORE A SHAPE IS COPIED, and the name is the kernel's own
 *    ④ AND THAT CLASSIFICATION IS NOT A CLAIM — every operation the kernel declares is DRIVEN
 *       through a kernel built the way the worker builds one, and the verdict the pre-flight gives
 *       has to be the verdict the arithmetic gives
 *    ⑤ THE PUBLIC ANSWERS DID NOT MOVE — the wrap is a wrap, so KERNEL_VERSION stays `geom-2`
 *    ⑥ A STOP REACHES A SINGLE ENORMOUS OPERATION, and leaves no half answer
 *
 *  ══ ⚠⚠⚠ WHY THE SWEEP LINE IS NOT AMONG THE OPERATIONS THAT TRAVEL ════════════════════════════
 *  MEASURED, in node, on the very object js/gis-geometry.js imports: `polygon-clipping`'s union is
 *  «function (geom) { … return operation.run("union", geom, moreGeoms); }». `operation` is a free
 *  name in ITS module, so the engine cannot be `provide`d; and the worker js/gis-worker.js builds is
 *  a CLASSIC worker assembled from a Blob, which can neither `import` a bare specifier nor
 *  `importScripts` a chunk whose fingerprinted URL a js/ module does not have. js/geodesy.js is the
 *  same shape. ⇒ THE OTHER THREAD'S KERNEL HAS NO DEPS, and every operation that consults one
 *  answers `clipper-unavailable` / `geodesy-unavailable` — the refusal it already answers on this
 *  thread before ready() has resolved. ③ and ④ are what keep that honest instead of hopeful.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes onto `window` at top level and exports nothing, so it is evaluated the
   way a browser evaluates it — the same boot tests/r743-gis-kernel-correctness-checks uses. */
async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const geometry = makeGisGeometry();
  const worker = makeGisWorker();
  w.IntMapGisGeometry = geometry;
  w.IntMapGisWorker = worker;
  /* The sweep line, on THIS thread only. Everything below that compares the two threads compares
     an operation that consults neither it nor js/geodesy.js — which is ④'s subject. */
  await geometry.ready();
  return { w, geometry, worker };
}

/* ══ THE DOOR — the product's registry and the product's assembled source, in a real thread ════
   ⚠ NOT A STUB. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool cannot spawn
   here; this runs `workerSource()` — the exact text the Blob is built from, preamble and all —
   inside node:worker_threads and speaks only the three message types that protocol has. A stub
   that ran the job on this thread could not be stopped mid-run, which is the one thing ⑥ sees.
   It is the same door tests/r759 and tests/r819-gis-worker-checks build, for the same reason. */
const SHIM = [
  "const { parentPort } = require('node:worker_threads');",
  'globalThis.self = { postMessage: (m, t) => parentPort.postMessage(m, t || []) };',
  "parentPort.on('message', (d) => { if (typeof self.onmessage === 'function') self.onmessage({ data: d }); });",
  '',
].join('\n');

function threadDoor(api) {
  const live = new Set();
  const door = {
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
          /* ⚠ THE SAME STOP js/gis-worker.js USES: a slot holds one job, so ending the thread ends
             that job and nothing else — there is no cooperative point inside a sweep to ask. */
          try { w.terminate(); } catch (_) { }
          resolve(res);
        };
        if (sig) { try { sig.addEventListener('abort', () => done({ ok: false, why: 'aborted' }), { once: true }); } catch (_) { } }
        w.on('message', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.type === 'ready') { w.postMessage({ type: 'run', id: 1, job: job, payload: payload }); return; }
          if (m.type !== 'done') return;
          done(m.ok ? { ok: true, value: m.value } : { ok: false, why: m.why || 'job-failed', detail: m.detail || null });
        });
        w.on('error', (e) => done({ ok: false, why: 'worker-died', detail: { message: String((e && e.message) || e) } }));
      });
    },
  };
  return door;
}

/* ── the shapes ────────────────────────────────────────────────────────────────────────────── */

const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const pt = (x, y) => ({ type: 'Point', coordinates: [x, y] });
/* The bow-tie whose shoelace is EXACTLY ZERO — the ring this kernel's `ringCollapsed` note is
   about, and a self-intersection the sweep has to find rather than read as a collapse. */
const BOWTIE = { type: 'Polygon', coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] };
/* Two parts of one MultiPolygon covering common ground — validate()'s third stage (#R783). */
const OVERLAPPING_PARTS = { type: 'MultiPolygon', coordinates: [box(0, 0, 2, 2).coordinates[0], box(1, 1, 3, 3).coordinates[0]].map((r) => [r]) };
const LINE = { type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0]] };

/* A ring of `n` vertices on a circle: no defect to report, so the time is the WALK — the scan, the
   unwrap, the sort and the box sweep over n edges — and not the reporting of findings. */
function circle(n) {
  const r = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; r.push([10 * Math.cos(a), 10 * Math.sin(a)]); }
  r.push(r[0].slice());
  return { type: 'Polygon', coordinates: [r] };
}

/* ══ ① 運ぶものが在る — the factory is rebuilt from its own bytes, in a real thread ══════════ */

test('R819 ① the geometry kernel travels as itself and answers in a real worker thread', async () => {
  const { geometry, worker } = await boot();

  /* Nothing is provided until somebody provides it, and the intake says so with the set it has. */
  assert.deepEqual(worker.geometryOps(), []);

  const installed = geometry.worker.install(worker);
  assert.equal(installed.ok, true, JSON.stringify(installed));
  assert.deepEqual(worker.geometryOps(), [geometry.worker.op]);

  /* ⚠ THE BYTES THAT RUN THERE ARE THE BYTES THAT RUN HERE, and this is the whole correctness
     argument for the door: not a copy authored for the worker, the function object this thread
     calls. A second implementation could not fail this by being wrong — it would fail by existing. */
  assert.equal(worker.librarySourceOf('geometry.' + geometry.worker.op), String(geometry.worker.kernelFunction()),
    'the provided text must be the kernel function\'s own source');
  assert.ok(worker.workerSource().indexOf(String(geometry.worker.kernelFunction())) >= 0,
    'the assembled worker source must carry the kernel');

  /* Installing twice is not a change: js/gis-worker.js retires idle workers on a revision bump, so
     a door that re-provided per call would spawn a fresh thread per call. */
  const rev = worker.status().revision;
  assert.equal(geometry.worker.install(worker).ok, true);
  assert.equal(worker.status().revision, rev, 're-installing must not bump the registry revision');

  const door = threadDoor(worker);
  try {
    const res = await door.run(worker.geometryJob, geometry.worker.request('validate', [BOWTIE]));
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.value.op, geometry.worker.op);
    assert.equal(res.value.value.ok, true);
    /* Had the factory closed over one name, this is where it would have arrived — and it would have
       arrived as the protocol's named refusal rather than as a wrong answer. */
    assert.notEqual(res.why, 'job-not-self-contained');
    assert.equal(res.value.value.value.valid, false, 'the bow-tie is not a valid ring');
  } finally { door.stop(); }
});

/* ══ ② 同じカーネル、二つの環境 ═══════════════════════════════════════════════════════════ */

test('R819 ② the same operation answers the same JSON on this thread and in the worker', async () => {
  const { geometry, worker } = await boot();
  assert.equal(geometry.worker.install(worker).ok, true);
  /* This thread's kernel HAS the sweep line and js/geodesy.js; the worker's has neither. The
     operations below consult neither, so any difference is a difference in the arithmetic. */
  assert.equal(geometry.available(), true, 'this thread must have the sweep line for the comparison to mean anything');

  const cases = [
    ['validate', [BOWTIE]],
    ['validate', [OVERLAPPING_PARTS]],
    ['validate', [{ type: 'Polygon', coordinates: [[[170, 0], [-170, 0], [-170, 10], [170, 10], [170, 0]]] }]],
    ['validate', [LINE]],
    ['areal', [OVERLAPPING_PARTS]],
    ['areal', [LINE]],
    ['pointInGeometry', [[1, 1], box(0, 0, 2, 2)]],
    ['pointInGeometry', [[9, 9], box(0, 0, 2, 2)]],
    /* A hole is a hole on both threads: parity, not a special case. */
    ['pointInGeometry', [[2, 2], { type: 'Polygon', coordinates: [box(0, 0, 4, 4).coordinates[0], box(1, 1, 3, 3).coordinates[0]] }]],
  ];

  const door = threadDoor(worker);
  try {
    for (const [op, args] of cases) {
      const there = await door.run(worker.geometryJob, geometry.worker.request(op, args));
      assert.equal(there.ok, true, op + ': ' + JSON.stringify(there));
      const here = geometry.call({ op: op, args: args });
      assert.deepEqual(there.value.value, JSON.parse(JSON.stringify(here.value)),
        'the two threads disagree about ' + op);
    }
  } finally { door.stop(); }
});

/* ══ ③ 運べないものは、形を写す前に名指される ═════════════════════════════════════════════ */

test('R819 ③ an operation that cannot travel is named before a polygon is copied, in the kernel\'s own words', async () => {
  const { geometry, worker } = await boot();

  /* Before anything is provided, every operation is unavailable — and the reason is the intake's,
     not this kernel's, because there is nothing there to ask yet. */
  const cold = geometry.worker.ready(worker, 'validate');
  assert.equal(cold.ok, false);
  assert.equal(cold.why, 'geometry-op-unavailable');

  assert.equal(geometry.worker.install(worker).ok, true);

  /* What CAN travel is derived from a kernel built the way the worker builds one — never listed. */
  const travels = geometry.worker.ops();
  assert.ok(travels.length > 0, 'something must travel, or the door is decoration');
  assert.ok(travels.indexOf('validate') >= 0);
  assert.ok(travels.indexOf('union') < 0, 'the sweep line cannot be provided — see the header');

  for (const op of travels) assert.equal(geometry.worker.ready(worker, op).ok, true, op + ' is listed as portable but refused');

  const no = geometry.worker.ready(worker, 'union');
  assert.equal(no.ok, false);
  assert.equal(no.why, 'clipper-unavailable', 'the refusal is the one the kernel already has for this fact');
  assert.deepEqual(no.detail.missing, ['clipper']);

  /* A name the kernel does not dispatch at all is a different answer, with the vocabulary. */
  const unknown = geometry.worker.ready(worker, 'triangulate');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.why, 'geometry-op-unavailable');
  assert.deepEqual(unknown.detail.have, travels);

  /* ⚠ AND THE PRE-FLIGHT IS NOT A SECOND OPINION. Sent anyway, the thread answers the same code —
     so the cheap verdict and the expensive one cannot disagree about one call. */
  const door = threadDoor(worker);
  try {
    const sent = await door.run(worker.geometryJob, geometry.worker.request('union', [[box(0, 0, 2, 2), box(1, 1, 3, 3)]]));
    assert.equal(sent.ok, false);
    assert.equal(sent.why, 'clipper-unavailable');
    /* ⚠ AND IT IS A REFUSAL, NOT AN EMPTY ANSWER. `{ok:true, geometry:null}` arriving here would be
       the 「該当なし」 that #R743 removed from every runner in js/gis-ops.js. */
    assert.equal(sent.value, undefined);

    const badArgs = await door.run(worker.geometryJob, geometry.worker.request('validate', null));
    assert.equal(badArgs.ok, false);
    assert.equal(badArgs.why, 'geometry-args-invalid');
  } finally { door.stop(); }
});

/* ══ ④ 「何が要るか」は主張ではなく、走らせて確かめる ═════════════════════════════════════ */

/* ⚠ THE TABLE INSIDE THE KERNEL SAYS WHICH BORROWED THINGS AN OPERATION MAY CONSULT, AND A CLAIM
   NEEDS A KEEPER ([[intmap-declared-version-needs-a-keeper]]). So every operation the kernel
   declares is DRIVEN here through a kernel built exactly as the worker builds one — no clipper, no
   js/geodesy.js — and the answer has to agree with the classification:
     · an operation the door offers must not refuse for a dependency;
     · an operation the door withholds must refuse for one it DECLARED.
   ⚠ THE PROBES ARE DERIVED FROM `ops()`, so an operation added to the kernel and not exercised here
   is a failing check and not a silent gap. */
const PROBES = {
  union: [[box(0, 0, 2, 2), box(1, 1, 3, 3)]],
  intersection: [box(0, 0, 2, 2), box(1, 1, 3, 3)],
  difference: [box(0, 0, 2, 2), box(1, 1, 3, 3)],
  dissolve: [[box(0, 0, 2, 2), box(1, 1, 3, 3)]],
  bufferKm: [pt(139.7, 35.7), 5],
  intersects: [box(0, 0, 2, 2), box(1, 1, 3, 3)],
  contains: [box(0, 0, 4, 4), box(1, 1, 2, 2)],
  within: [box(1, 1, 2, 2), box(0, 0, 4, 4)],
  disjoint: [box(0, 0, 1, 1), box(5, 5, 6, 6)],
  distanceKm: [box(0, 0, 1, 1), box(5, 5, 6, 6)],
  areal: [box(0, 0, 2, 2)],
  pointInGeometry: [[1, 1], box(0, 0, 2, 2)],
  validate: [BOWTIE],
  /* A shape that actually has to be re-noded, because a repair with nothing to fix never reaches
     the sweep line and would be classified by the probe rather than by the operation. */
  repair: [BOWTIE],
  coverage: [[box(0, 0, 1, 1), box(1, 0, 2, 1)], { overlaps: 'forbid' }],
};

const DEP_CODE = { clipper: 'clipper-unavailable', geodesy: 'geodesy-unavailable' };

test('R819 ④ every operation is classified by the code that runs it, not by a list beside it', async () => {
  const { geometry, worker } = await boot();
  assert.equal(geometry.worker.install(worker).ok, true);

  /* The kernel as the other thread builds it — the same construction, here, where it is cheap. */
  const bare = geometry.worker.kernelFunction()(null);
  const ops = bare.ops();
  assert.deepEqual(ops.filter((op) => !PROBES[op]), [], 'an operation the kernel declares is not exercised here');
  assert.deepEqual(geometry.ops().slice().sort(), ops.slice().sort(), 'the public door and the kernel must dispatch the same names');

  const travels = geometry.worker.ops();
  for (const op of ops) {
    const out = bare.call({ op: op, args: PROBES[op] });
    const why = (out && out.ok === false) ? out.why : null;
    const deps = bare.requires(op);
    if (travels.indexOf(op) >= 0) {
      assert.deepEqual(deps, [], op + ' is offered to the worker but declares dependencies');
      assert.ok(why !== 'clipper-unavailable' && why !== 'geodesy-unavailable',
        op + ' is offered to the worker and refused there for a dependency: ' + why);
    } else {
      assert.ok(deps.length > 0, op + ' is withheld from the worker but declares no dependency');
      const expected = deps.map((d) => DEP_CODE[d]);
      assert.ok(expected.indexOf(why) >= 0,
        op + ' is withheld for ' + deps.join('+') + ' but a dep-less kernel answered ' + why);
      /* The pre-flight refuses with a code the operation itself can raise — one vocabulary for one
         fact, rather than a wiring word the reader has never seen. */
      const pre = geometry.worker.ready(worker, op);
      assert.equal(pre.ok, false);
      assert.ok(expected.indexOf(pre.why) >= 0, op + ': the pre-flight says ' + pre.why);
    }
  }
});

/* ══ ⑤ 公開された答えは動いていない ═══════════════════════════════════════════════════════ */

/* ⚠ THE NUMBERS BELOW WERE MEASURED FROM THE KERNEL AS IT STOOD BEFORE THE WRAP (the revision in
   git at the time of writing) and are held against it after. That is what licenses leaving
   KERNEL_VERSION at `geom-2`: a saved recipe replays to the same answer, so there is nothing to
   announce (scripts/gis-kernel-versions.mjs, §WHEN THE HASH GATE FAILS). */
test('R819 ⑤ the public doors answer exactly what they answered before the kernel was wrapped', async () => {
  const { geometry } = await boot();

  assert.equal(geometry.version(), 'geom-2');
  assert.equal(geometry.available(), true);

  assert.deepEqual(geometry.union([box(0, 0, 2, 2), box(1, 1, 3, 3)]),
    { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [3, 1], [3, 3], [1, 3], [1, 2], [0, 2], [0, 0]]] });
  assert.deepEqual(geometry.union([box(0, 0, 1, 1), box(5, 5, 6, 6)]).type, 'MultiPolygon');
  assert.deepEqual(geometry.intersection(box(0, 0, 2, 2), box(1, 1, 3, 3)),
    { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] });
  assert.deepEqual(geometry.difference(box(0, 0, 2, 2), box(1, 1, 3, 3)),
    { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] });

  /* The Minkowski sum: an inscribed approximation, stated as one — its boundary lies inside the
     true buffer, so the radius measured back from the centre is at most the radius asked for. */
  const buf = geometry.bufferKm(pt(139.7, 35.7), 5);
  assert.equal(buf.type, 'Polygon');
  assert.equal(geometry.pointInGeometry([139.7, 35.7], buf), true);
  assert.equal(geometry.attempt.bufferKm(pt(0, 0), -5).why, 'inward-buffer-needs-area');

  assert.equal(geometry.distanceKm(pt(0, 0), box(1, 1, 2, 2)).toFixed(6), '157.249598');
  assert.equal(geometry.distanceKm(LINE, pt(5, 5)), geometry.distanceKm(pt(5, 5), LINE));
  assert.equal(geometry.intersects(box(0, 0, 2, 2), box(1, 1, 3, 3)), true);
  assert.equal(geometry.contains(box(0, 0, 4, 4), box(1, 1, 2, 2)), true);
  assert.equal(geometry.within(pt(1, 1), box(0, 0, 2, 2)), true);
  assert.equal(geometry.disjoint(box(0, 0, 1, 1), box(5, 5, 6, 6)), true);

  const v = geometry.validate(BOWTIE);
  assert.equal(v.ok, true);
  assert.equal(v.value.valid, false);
  assert.deepEqual(v.value.problems.map((p) => p.code), ['ring-self-intersects']);
  assert.deepEqual(geometry.validate(OVERLAPPING_PARTS).value.problems.map((p) => p.code), ['parts-overlap']);

  const r = geometry.repair(BOWTIE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.remaining, []);
  assert.equal(r.geometry.type, 'MultiPolygon');

  const cov = geometry.coverage([box(0, 0, 1, 1), box(1, 0, 2, 1)], { overlaps: 'forbid' });
  assert.equal(cov.ok, true);
  assert.equal(cov.value.conforms, true);
  const cov2 = geometry.coverage([box(0, 0, 1, 1), box(0.5, 0, 2, 1)], { overlaps: 'forbid' });
  assert.equal(cov2.value.conforms, false);
  assert.equal(cov2.value.counts.overlap, 1);

  /* The refusals are still refusals and still carry their name. */
  const WRAPS = { type: 'Polygon', coordinates: [[[-180, 80], [-60, 80], [60, 80], [180, 80], [180, 89], [-180, 89], [-180, 80]]] };
  assert.equal(geometry.attempt.union([WRAPS]).why, 'geometry-wraps-world');
  assert.equal(geometry.attempt.distanceKm(null, pt(0, 0)).why, 'missing-geometry');
});

/* ══ ⑥ 中止は、走っている 1 個の演算に届く ═══════════════════════════════════════════════ */

/* ⚠ ONE SHAPE, NOT MANY. Handing the thread back between features shortens nothing when the time is
   inside ONE of them, which is this case: a 200,000-vertex ring walked by one sweep with no
   cooperative point in it. The stop is therefore the thread's end, and what is measured is that the
   arithmetic DID NOT FINISH — compared against the same call allowed to run. */
test('R819 ⑥ a stop reaches one enormous geometry operation, and no half answer comes back', async () => {
  const { geometry, worker } = await boot();
  assert.equal(geometry.worker.install(worker).ok, true);

  const big = circle(200000);
  const payload = geometry.worker.request('validate', [big, { limit: 20 }]);
  const door = threadDoor(worker);
  try {
    const t0 = Date.now();
    const whole = await door.run(worker.geometryJob, payload);
    const took = Date.now() - t0;
    assert.equal(whole.ok, true, JSON.stringify(whole).slice(0, 200));
    assert.equal(whole.value.value.value.valid, true);

    const ctl = new AbortController();
    const t1 = Date.now();
    setTimeout(() => ctl.abort(), 20);
    const stopped = await door.run(worker.geometryJob, payload, { signal: ctl.signal });
    const waited = Date.now() - t1;
    assert.equal(stopped.ok, false);
    assert.equal(stopped.why, 'aborted');
    /* ⚠ NEITHER AN ANSWER NOR HALF OF ONE. `progress` carries counts and never values, and `done`
       is the only message that carries a result — so there is no path by which a killed walk is
       read as a finished one. */
    assert.equal(stopped.value, undefined);
    assert.ok(waited < took, 'the stop must return before the operation would have finished (' + waited + 'ms vs ' + took + 'ms)');
  } finally { door.stop(); }
});
