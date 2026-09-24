/* ============================================================================
 *  #R819 · 幾何の受け口はあった。呼び手がいなかった — the geometry dispatch into the other thread
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE DEFECT, MEASURED BEFORE THIS WAS WRITTEN. js/gis-geometry.js grew `worker.install` /
 *  `ready` / `request` and js/gis-worker.js grew the intake that dispatches them, and NOTHING IN
 *  js/ EVER BUILT A PAYLOAD FOR EITHER: tests/r759-gis-worker-checks ④ reported
 *  `registered jobs with no caller: ["geometry.op","grid.binary"]`. A door with no caller is the
 *  state #R759 was opened for — 「Worker が在る」 と 「普段の分析が Worker で走る」 は別である.
 *
 *  WHAT IS MEASURED HERE IS NOT 「入口が増えたか」. A caller that computed the answer on this thread
 *  and reported `used` would pass that ([[intmap-restate-the-defect-not-the-fix]]). It is:
 *
 *    ① 同じデータセットが、両方の経路で同じ列を出す — row for row, property for property, in a
 *       REAL node:worker_threads thread running the product's own assembled source, over a corpus
 *       that contains valid rings, self-crossing rings, unclosed rings and a missing geometry
 *    ② 運べないときは今日と同じ答えになる — no door, a door that refuses, an operation the dep-less
 *       kernel cannot answer, a budget nothing fits, and 小さい仕事（運ぶ価値の無い入力）。
 *       ⚠ そのどれでも THREAD IS SPAWNED という主張まで測る: 運ばないと決めたなら糸も立てない
 *    ③ 中止は途中結果を答えにしない — the run refuses by name, registers no dataset, and a signal
 *       that was already aborted never reaches a thread at all
 *    ④ `geometry.worker.install` が本番経路から呼ばれている — the fact r759 ④ measures, asked of
 *       the worker's own registry after an ordinary `ops.run({op:'validate'})`, and asked of the
 *       shipped bytes (the library source IS js/gis-geometry.js's kernel factory, not a copy)
 *
 *  ⚠ THE OTHER THREAD IS REAL. Node has no `Worker` and no `Blob`, so js/gis-worker.js's own pool
 *  cannot spawn here; the door below runs `workerSource()` — the exact text the Blob is built from —
 *  inside a node:worker_threads thread and speaks only the three message types that protocol has.
 *  It replaces `run`, which is the seam js/gis-ops.js calls, so everything above it (the size walk,
 *  the floor, the budget, the lanes, the abort, the assembly of the rows) is the product's.
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
   tests/r819-gis-worker-dispatch-checks and tests/r759-gis-worker-checks, for the reason those files
   give: a stub that ran the job here could not be stopped mid-run. */
function threadDoor(api) {
  const live = new Set();
  const door = {
    threads: 0,
    jobs: [],
    stop() { for (const w of live) { try { w.terminate(); } catch (_) { } } live.clear(); },
    run(job, payload, ro) {
      const r = ro || {};
      return new Promise((resolve) => {
        if (api.jobNames().indexOf(job) < 0) { resolve({ ok: false, why: 'job-unknown' }); return; }
        const sig = r.signal || null;
        if (sig && sig.aborted) { resolve({ ok: false, why: 'aborted' }); return; }
        door.threads++;
        door.jobs.push(job);
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

/* ⚠ THE PRODUCT'S MODULE, WITH ONE SEAM REPLACED AND NOTHING ELSE. `provideGeometry`, `geometryOps`,
   `geometryReady`, `planBlocks`, `budgetBytes`, `maxConcurrency` and `workerSource` are the shipped
   closures over the shipped registry — so the door the caller installs into, the budget it is given
   and the bytes the thread evaluates are all the real ones; only the thing that would have called
   `new Worker(new Blob(...))` is the node door. */
function opsWorker(worker, door, over) {
  return Object.assign({}, worker, { run: door.run }, over || {});
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  const worker = makeGisWorker();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  /* ⚠ EVERY KERNEL MOUNTS ITSELF ON `window`, so the worker door is ALREADY THERE the moment it is
     built — and js/gis-ops.js reads it at call time. Taken down again here so a run with no door is
     the product as it was before this round, and each case states which of the two it measures. */
  delete w.IntMapGisWorker;
  const up = await geometry.ready();
  assert.equal(up, true, 'polygon-clipping must load for this file to measure anything');
  return { w, data, ops, geometry, worker };
}

/* ── the corpus ────────────────────────────────────────────────────────────────────────────────
   ⚠ BIG ENOUGH TO BE CARRIED AND BROKEN ENOUGH TO HAVE SOMETHING TO SAY. The floor js/gis-ops.js
   measured is 250 positions, so a ring of 400 is carried and a box of 5 is not — and the point of
   mixing them in ONE dataset is that the two paths have to agree ROW BY ROW while only some of the
   rows crossed a thread. */

/* A closed ring of n vertices on a circle, optionally with m lobes (which is where the sweep line
   earns its keep) — and `cross` ties a bow-tie into it, which is a real self-intersection. */
function ring(n, lobes, cross) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n;
    const r = 1 + (lobes ? 0.3 * Math.sin(lobes * t) : 0);
    pts.push([10 + r * Math.cos(t), 20 + r * Math.sin(t)]);
  }
  if (cross) { const a = pts[1]; pts[1] = pts[Math.floor(n / 2)]; pts[Math.floor(n / 2)] = a; }
  pts.push(pts[0].slice());
  return { type: 'Polygon', coordinates: [pts] };
}
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const feat = (geometry, id) => ({ type: 'Feature', properties: { id: id }, geometry: geometry, id: id });

function corpus() {
  const big = ring(400, 0, false);
  /* the same 400-vertex ring with its ends left open — `ring-not-closed`, on a carried feature */
  const open = { type: 'Polygon', coordinates: [ring(400, 0, false).coordinates[0].slice(0, -1)] };
  const knot = ring(420, 0, true);
  const lobed = ring(600, 17, false);
  /* a MultiPolygon whose two parts cover common ground — the third stage of validate (#R783), on a
     feature large enough to be carried */
  const twin = { type: 'MultiPolygon', coordinates: [ring(300, 0, false).coordinates[0], ring(300, 0, false).coordinates[0].map((p) => [p[0] + 0.5, p[1]])].map((r) => [r]) };
  const lines = { type: 'LineString', coordinates: ring(500, 0, false).coordinates[0] };
  return {
    title: 'validity corpus',
    features: [
      feat(big, 'big'),
      feat(box(0, 0, 1, 1), 'small'),
      feat(open, 'open'),
      feat(knot, 'knot'),
      /* 「幾何が無い」 is not 「妥当である」 — the row that must come back `Unmeasured` on both paths */
      feat(null, 'none'),
      feat(lobed, 'lobed'),
      feat({ type: 'Point', coordinates: [200, 95] }, 'off-world'),
      feat(twin, 'twin'),
      feat(lines, 'line'),
      feat(box(2, 2, 3, 3), 'small2'),
    ],
  };
}

const small = () => ({
  title: 'all small',
  features: [feat(box(0, 0, 1, 1), 'a'), feat(box(1, 0, 2, 1), 'b'), feat(box(0, 1, 1, 2), 'c')],
});

function rows(r) {
  return r.dataset.features().map((f) => ({ id: f.properties.id, props: f.properties, geometry: f.geometry }));
}

function sameAnswer(there, here, what) {
  assert.equal(there.ok, here.ok, what + ': one path refused and the other did not');
  assert.deepEqual(rows(there), rows(here), what + ': the rows differ');
  assert.equal(there.stats.invalid, here.stats.invalid, what + ': the two paths disagree about how many geometries are invalid');
  assert.equal(there.stats.unmeasured, here.stats.unmeasured, what + ': the two paths disagree about how many could not be measured');
  assert.equal(there.stats.total, here.stats.total, what + ': the two paths disagree about how many rows there are');
}

const STEP = (ds) => ({ op: 'validate', inputs: [ds.id], params: {} });

/* ══ ① 同じ列が、両方の経路で出る ════════════════════════════════════════════════════════ */

test('R819 ① validate answers the same rows on this thread and in a real worker', async () => {
  const { w, data, ops, worker } = await boot();
  const ds = data.add(corpus());

  /* THE REFERENCE FIRST, with no door mounted at all — the path the product had before this round. */
  const here = await ops.run(STEP(ds));
  assert.equal(here.ok, true, 'the reference run refused: ' + JSON.stringify(here.why || here));
  assert.equal(here.stats.worker, 'not-used: worker-not-mounted', 'the reference run → ' + here.stats.worker);
  /* the corpus is worth measuring: it has invalid rows, an unmeasurable row and valid rows */
  assert.ok(here.stats.invalid > 0, 'the corpus contains no invalid geometry — ① would prove nothing');
  assert.equal(here.stats.unmeasured, 1, 'the corpus lost its missing geometry');

  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  let there;
  try { there = await ops.run(STEP(ds)); } finally { door.stop(); }

  assert.equal(there.ok, true, 'the carried run refused: ' + JSON.stringify(there.why || there));
  /* ⚠ THE CLAIM IS CHECKED, NOT TAKEN. If this said `used` while the sweep had quietly happened
     here, the whole round would be the defect it was opened for. */
  assert.ok(/^used: \d+ of \d+ features$/.test(there.stats.worker), 'it did not reach the other thread: ' + there.stats.worker);
  const carried = Number(/^used: (\d+)/.exec(there.stats.worker)[1]);
  assert.ok(carried > 0, 'nothing was carried');
  assert.equal(door.threads, carried, 'the number of threads and the number of carried features disagree');
  assert.deepEqual(Array.from(new Set(door.jobs)), [worker.geometryJob], 'something other than the geometry job was run');
  /* ⚠ AND ONLY THE BIG ONES WENT. 「運ぶ価値のある大きさ」 is the whole reason the floor exists;
     a run that carried all ten rows would be spending a round trip on a five-vertex box. */
  assert.ok(carried < here.stats.total, 'every row was carried — the floor is not doing anything');

  sameAnswer(there, here, 'the carried pass');
  assert.equal(w, globalThis.window);
});

/* ══ ② 運べないときは今日と同じ答えになる ════════════════════════════════════════════════ */

test('R819 ② with no door at all the answer is the one the product always gave', async () => {
  const { data, ops } = await boot();
  const ds = data.add(corpus());
  const a = await ops.run(STEP(ds));
  const b = await ops.run(STEP(ds));
  assert.equal(a.stats.worker, 'not-used: worker-not-mounted');
  sameAnswer(b, a, 'two runs with no door');
});

test('R819 ② an input too small to be worth carrying never spawns a thread', async () => {
  const { data, ops, worker } = await boot();
  const ds = data.add(small());
  const here = await ops.run(STEP(ds));

  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  let there;
  try { there = await ops.run(STEP(ds)); } finally { door.stop(); }

  assert.equal(there.stats.worker, 'not-used: nothing-large-enough', 'a five-vertex box was carried: ' + there.stats.worker);
  /* ⚠ 「運ばないと決めた」 と 「運ぼうとして失敗した」 の違いは、糸が立ったかどうかで見える。 */
  assert.equal(door.threads, 0, 'a thread was spawned for work not worth carrying');
  sameAnswer(there, here, 'the small input');
});

test('R819 ② an operation the dep-less kernel cannot answer is refused by name before a copy', async () => {
  const { geometry, worker } = await boot();
  /* ⚠ ASKED OF THE KERNEL, NOT OF A LIST HERE: `worker.ops()` is derived by asking a kernel built
     with no clipper and no geodesy, so this stays true whatever is added to the kernel next. */
  const portable = geometry.worker.ops();
  assert.ok(portable.indexOf('validate') >= 0, 'the operation this round carries is not carriable');
  const inst = geometry.worker.install(worker);
  assert.equal(inst.ok, true, JSON.stringify(inst));
  for (const op of ['union', 'coverage', 'bufferKm', 'distanceKm']) {
    assert.ok(portable.indexOf(op) < 0, op + ' is listed as carriable — this case is measuring nothing');
    const verdict = geometry.worker.ready(worker, op);
    assert.equal(verdict.ok, false, op + ' was declared ready in a thread that has no sweep line');
    /* the kernel's own vocabulary, named BEFORE a polygon is copied */
    assert.ok(verdict.why === 'clipper-unavailable' || verdict.why === 'geodesy-unavailable',
      op + ' was refused with a word nobody has a sentence for: ' + verdict.why);
  }
  assert.equal(geometry.worker.ready(worker, 'no-such-op').why, 'geometry-op-unavailable');
});

test('R819 ② a door that cannot be used finishes here — completely, and says why', async () => {
  const { data, ops, worker } = await boot();
  const ds = data.add(corpus());
  const here = await ops.run(STEP(ds));

  const door = threadDoor(worker);
  /* A budget that refuses the moment it is asked, so `used` would be impossible: the run must still
     produce every row. */
  globalThis.window.IntMapGisWorker = opsWorker(worker, door, {
    planBlocks: () => ({ ok: false, why: 'plan-invalid', detail: { field: 'units' } }),
  });
  let there;
  try { there = await ops.run(STEP(ds)); } finally { door.stop(); }
  assert.equal(there.stats.worker, 'not-used: plan-invalid', 'the reason the thread was not used is not stated: ' + there.stats.worker);
  assert.equal(door.threads, 0);
  sameAnswer(there, here, 'the refused plan');

  /* ⚠ AND A BUDGET NOTHING FITS IS ITS OWN ANSWER. A geometry is one call and cannot be split
     across blocks, so a feature larger than one block stays here rather than being cut in half. */
  const tiny = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, tiny, {
    planBlocks: (spec) => worker.planBlocks(Object.assign({}, spec, { budgetBytes: 1024 })),
  });
  let starved;
  try { starved = await ops.run(STEP(ds)); } finally { tiny.stop(); }
  assert.equal(starved.stats.worker, 'not-used: nothing-fits-the-budget', starved.stats.worker);
  assert.equal(tiny.threads, 0);
  sameAnswer(starved, here, 'the budget nothing fits');
});

test('R819 ② a worker whose answer is the wrong shape is refused, and the rows are computed here', async () => {
  const { data, ops, geometry, worker } = await boot();
  const ds = data.add(corpus());
  const here = await ops.run(STEP(ds));

  const door = threadDoor(worker);
  /* ⚠ THE WORKER IS A RUNNER, NOT AN AUTHORITY. An answer of the wrong shape must not be written
     into a table that would look finished ([[intmap-atlas-failed-because-intmap-said-so]] in the
     other direction: this is the thread lying about success rather than about failure). The wrapper
     here is the RIGHT one — the library that answered, and the kernel's own {ok,value} — so what is
     measured is the reading of the answer itself and not of the envelope. */
  globalThis.window.IntMapGisWorker = opsWorker(worker, door, {
    run: () => Promise.resolve({ ok: true, value: { op: geometry.worker.op, value: { ok: true, value: { valid: 'yes' } } } }),
  });
  let there;
  try { there = await ops.run(STEP(ds)); } finally { door.stop(); }
  assert.equal(there.stats.worker, 'not-used: worker-answer-malformed', there.stats.worker);
  sameAnswer(there, here, 'the malformed answer');
});

/* ══ ③ 中止は途中結果を答えにしない ══════════════════════════════════════════════════════ */

test('R819 ③ a stop during the carried pass leaves no half answer', async () => {
  const { data, ops, worker } = await boot();
  const ds = data.add(corpus());

  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  const stop = new AbortController();
  let ticks = 0, res;
  try {
    res = await ops.run(STEP(ds), { signal: stop.signal, onProgress: () => { ticks++; stop.abort(); } });
  } finally { door.stop(); }

  assert.equal(res.ok, false, 'the run finished after the reader asked it to stop');
  assert.equal(res.why, 'cancelled', 'it stopped for the wrong reason: ' + res.why);
  /* ⚠ THE ONE THING A CANCELLED RUN MUST NOT DO. A table assembled from the features that happened
     to land is a plausible report about nothing. */
  assert.equal(res.dataset, undefined, 'a partial table was registered as a result');
  assert.ok(ticks > 0, 'it never reported progress — the stop was never readable');
  assert.ok(res.detail && typeof res.detail.done === 'number', 'the cancellation says nothing about where it got to');
  assert.ok(res.detail.done < res.detail.total, 'it claims to have finished everything and to have been cancelled');
});

test('R819 ③ a signal that is already aborted never reaches a thread at all', async () => {
  const { data, ops, worker } = await boot();
  const ds = data.add(corpus());
  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  const dead = new AbortController();
  dead.abort();
  let res;
  try { res = await ops.run(STEP(ds), { signal: dead.signal }); } finally { door.stop(); }
  assert.equal(res.ok, false);
  assert.equal(res.why, 'cancelled');
  assert.equal(res.dataset, undefined);
  /* 「観測できなかった」 と 「失敗した」 は別 (.agents/rules/one-pass-or-a-reason.md §5): a reader
     who stopped it before it began is not a worker that could not be used, and nothing was spent
     proving that. */
  assert.equal(door.threads, 0, 'a thread was spawned for a run the reader had already stopped');
});

/* ══ ④ 本番経路が扉を開けている ══════════════════════════════════════════════════════════ */

test('R819 ④ an ordinary validate run installs the geometry kernel and runs the registered job', async () => {
  const { data, ops, geometry, worker } = await boot();
  /* nothing provided yet — the door is opened BY THE RUN, not by this file */
  assert.deepEqual(worker.geometryOps(), [], 'something had already installed a geometry kernel');

  const ds = data.add(corpus());
  const door = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, door);
  let r;
  try { r = await ops.run(STEP(ds)); } finally { door.stop(); }
  assert.equal(r.ok, true, JSON.stringify(r.why || r));

  /* ⚠ THE FACT tests/r759-gis-worker-checks ④ MEASURES, asked of the registry rather than of the
     source text: the production path — `ops.run({op:'validate'})`, with no test-only call anywhere
     above it — provided the kernel and ran the registered geometry job. */
  assert.deepEqual(worker.geometryOps(), [geometry.worker.op], 'the production path installed no geometry kernel');
  assert.ok(worker.jobNames().indexOf(worker.geometryJob) >= 0, 'nothing registers the geometry job any more');
  assert.ok(door.jobs.length > 0 && door.jobs.every((j) => j === worker.geometryJob), 'the geometry job was never run');

  /* ⚠ AND THE BYTES THAT ANSWERED THERE ARE THE BYTES THAT ANSWER HERE. js/gis-worker.js ships a
     library by evaluating its source text, so a caller that handed over a COPY of the kernel would
     be shipping a second implementation — this is the kernel factory itself. */
  assert.equal(worker.librarySourceOf('geometry.' + geometry.worker.op), String(geometry.worker.kernelFunction()),
    'the thread was given something other than the kernel this module answers with');

  /* Installed ONCE: js/gis-worker.js counts a registry change as a revision and retires idle
     workers built from an older one, so providing on every call would spawn a fresh thread per
     feature. A second run must not change the library. */
  const rev = worker.status().revision;
  const again = threadDoor(worker);
  globalThis.window.IntMapGisWorker = opsWorker(worker, again);
  try { await ops.run(STEP(ds)); } finally { again.stop(); }
  assert.equal(worker.status().revision, rev, 'the kernel was provided a second time and retired every idle thread');
});
