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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r756-gis-raster-cancel-checks: js/geodesy.js publishes onto `window` at top
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
     was measured by tests/r819-gis-geometry-dispatch-checks, and was invisible HERE. That is the
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
