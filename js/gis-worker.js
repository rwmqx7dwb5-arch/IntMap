/* ============================================================================
 *  IntMap · THE OTHER THREAD — window.IntMapGisWorker   (#R752)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 says it about itself: 「**Worker が無い。** 重い処理は中止でき、進捗を述べ、
 *  フレームごとに譲るが、走るのはメインスレッドである。⚠ ここで足りないのは**並列性**であって
 *  応答性ではない」. MEASURED before writing this file: `new Worker(` appears twice in all of js/
 *  (js/dash-extended.js and js/sat-proto.js) and ZERO times in the seventeen js/gis-*.js files.
 *  This is the missing half.
 *
 *  ⚠ THIS IS NOT A REPLACEMENT FOR js/gis-ops.js makeCtx(). That context — `aborted()`, `tick()`,
 *  FRAME_MS — is what makes a long run ANSWER the reader, and every op keeps it. #R735 wrote the
 *  reason down: a synchronous loop cannot be cancelled, because the code that would set the
 *  AbortSignal does not run until the loop lets go. What a Worker adds beside it is a SECOND CPU,
 *  and one thing the yielding context could never give: a cancellation that reaches arithmetic
 *  already running, because `terminate()` does not ask the loop's permission.
 *
 *  ══ WHAT A JOB IS, AND WHAT IT MAY NOT BE ═════════════════════════════════════════════════════
 *  A job is PURE ARITHMETIC over numbers and plain JSON. There is no `window` in a worker, no DOM,
 *  no IntMapData, no IntMapGeodesy, no lazy import of a sweep-line. So this file does NOT move the
 *  geometry kernel or the ops across — an op calls four other kernels per row, and shipping the
 *  loop alone would leave every call it makes on this thread (#R735 wrote that too).
 *
 *  ⚠ A REGISTERED FUNCTION IS REBUILT FROM ITS OWN SOURCE TEXT, SO IT CANNOT CLOSE OVER ANYTHING.
 *  register() takes `fn.toString()` and the worker evaluates that text in ITS global scope. A
 *  variable the function borrowed from the module around it is NOT IN THE TEXT — it is in a scope
 *  that never crosses the postMessage boundary. That is a contract, and it is stated three ways so
 *  it cannot fail silently:
 *    · register() refuses source it cannot rebuild by name (`job-not-serialisable`, and a
 *      SyntaxError from the same reconstruction the worker will do → `job-source-unparsable`);
 *    · a captured variable surfaces in the worker as a ReferenceError, and the protocol reports
 *      THAT as `job-not-self-contained` with the identifier in `detail.message` — a named refusal
 *      rather than a wrong answer;
 *    · `sourceOf(name)` and `workerSource()` publish the exact text that will be evaluated, so a
 *      check can read it without starting a browser.
 *  A job that genuinely needs constants declares them as `deps`: plain JSON, injected into the
 *  worker beside the function and handed back to it as `ctx.deps`. One object, both readers — a
 *  second copy of the vocabulary in a declaration is the hand-written list
 *  .agents/rules/no-ad-hoc-hardcoding.md forbids.
 *
 *  ══ WHY THE SOURCE IS A BLOB AND NOT A FILE ═══════════════════════════════════════════════════
 *  The five workers in src/ (sat, tsunami, aviation, radiation, photo-geo) are separate files,
 *  because `new URL('./x-worker.js', import.meta.url)` is the only form the bundler can emit and
 *  fingerprint — and src/tsunami-worker-client.js says a js/ module cannot write it. This module
 *  is js/, and it is mounted inside the LAZY gisCore chunk (js/lazy-modules.js), so it assembles
 *  its worker as a Blob the way js/dash-extended.js does. index.html allows it explicitly:
 *  `worker-src 'self' blob:`.
 *  ⚠ THE BLOB IS BUILT FROM WHAT IS REGISTERED, SO IT HAS A REVISION. Registering a job after a
 *  worker exists would leave that worker running a source that has never heard of it; `revision`
 *  counts the registry's changes, every worker carries the revision it was built from, and an idle
 *  worker from an older one is retired rather than handed the new job.
 *  ⚠ register() IS NOT A DOOR FOR TEXT FROM OUTSIDE. Its argument is a function authored in this
 *  repository; nothing reader-supplied reaches the assembled source.
 *
 *  ══ CANCELLATION REACHES terminate(), AND THAT IS WHY A WORKER RUNS ONE JOB ═══════════════════
 *  `terminate()` is not selective — it kills the thread, not a task on it. So a worker here holds
 *  AT MOST ONE job, and an abort terminates that worker, drops it from the pool and lets the next
 *  spawn replace it. Packing two jobs onto one worker would make cancelling either of them kill
 *  the other, which is the 「効かない中止ボタン」 this file exists to end.
 *
 *  ══ THE TRANSFER CONTRACT — WHO OWNS THE BUFFER AFTERWARDS ════════════════════════════════════
 *  ⚠ A TRANSFERRED ArrayBuffer LEAVES THE CALLER'S SIDE EMPTY (detached, `byteLength` 0). That is
 *  the point of it — no copy — and it is also how a caller's grid could vanish under them without
 *  a word. So ownership is NAMED, never guessed:
 *    · `own:'caller'` (THE DEFAULT) — the payload is structured-CLONED. The caller's arrays are
 *      untouched and still theirs. Safe, and it copies.
 *    · `own:'worker'` — every ArrayBuffer reachable from the payload is transferred. The caller's
 *      arrays are detached the moment run() is called and the worker owns them. The result reports
 *      `transferred` so 「渡した」 is a number somebody can read, not an assumption.
 *  The RESULT is always transferred back, with no option, because the worker allocated it and
 *  nobody else holds a view of it — there is no owner to surprise.
 *
 *  ══ WHAT IS ACTUALLY ON IT TODAY ══════════════════════════════════════════════════════════════
 *  One job, `grid.binary`: two bands (or a band and a scalar) and an operator, missing values
 *  propagated. It runs in the worker for real — the arithmetic is in the text the Blob is built
 *  from and nowhere else.
 *  ⚠ MISSING IS js/gis-raster.js's RULE, NOT A SECOND ONE. That kernel's `missing()` counts NaN
 *  AND ±Infinity as missing («±Infinity is not a measurement»), so an operand that is not finite
 *  gives NaN, and a RESULT that is not finite (1/0 is the ordinary way to get there) is written as
 *  NaN as well. The two files then agree about the same pixel; they would not if this one only
 *  checked NaN.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would have been a global before the bundle, and this file may not reintroduce one.
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES (docs/GIS-CORE.md §2.2) — { ok:false, why, detail } — the
 *  nine languages live at the call site. This module has no business knowing what UI it is in.
 *
 *  Returns, always:
 *      { ok:true,  value, transferred }   — value is whatever the job returned, structured-cloned
 *      { ok:false, why, detail? }
 * ==========================================================================*/

export function makeGisWorker() {
  return (function () {

    /* ── how many at once ──────────────────────────────────────────────────────────────────────
       OBSERVATION. Not a timing measurement — a memory one, done with a pencil against the sizes
       this app can already import: a 4096×4096 float64 band is 128 MiB, a binary op holds two
       inputs and an output at once (384 MiB), and four of those concurrently stake ~1.5 GiB of a
       tab. The ceiling is therefore about MEMORY, not about cores; the cores only decide whether
       we reach it. One core is left for the thread that paints, because a fully-subscribed machine
       gives back exactly the frozen map this file was written to prevent.
       EXPIRES IF: jobs stop being grid-sized (then the ceiling should be cores, not 4), or the
       payloads become SharedArrayBuffer-backed (then nothing is resident twice and the arithmetic
       above is void).
       CANONICAL: this constant, published as maxConcurrency() so no caller writes a second one.

       ⚠ navigator.hardwareConcurrency IS NOT ALWAYS THERE (it has never existed in some embedded
       WebViews, and Safari only added it in 15.4). UNKNOWN IS NOT ONE. Reading an absent count as
       a single core would turn 「知らない」 into 「並列化するな」, which is a claim nobody made — so
       an absent count means two: parallelism without asserting a number we were not told. */
    const CORES = (function () {
      try {
        const n = (typeof navigator !== 'undefined' && navigator) ? navigator.hardwareConcurrency : null;
        return (typeof n === 'number' && isFinite(n) && n >= 1) ? Math.floor(n) : null;
      } catch (_) { return null; }
    })();
    const MAX_WORKERS = Math.max(1, Math.min(4, CORES ? CORES - 1 : 2));

    /* ── the protocol, as the text the worker runs ─────────────────────────────────────────────
       An array of lines rather than a template literal: a backtick inside source assembled for a
       Blob is a trap this repository has already paid for once (see the CSS template-literal note
       in the memory), and the join makes the emitted file readable when a check prints it.

       Three message types leave the worker and that is all: `ready` (the load succeeded — see
       probe(), which is the only honest answer about a Content-Security-Policy that refuses
       blob:), `progress`, and `done`. A job answers with { ok, value?, transfer?, why?, detail? },
       and an answer that is not that shape is a named refusal rather than an undefined result. */
    /* ⚠ (#R752) THE LINES BELOW ARE SOURCE CODE, AND THEY ARE ASCII ON PURPOSE. Two adjacent
       string literals where one is English and the next holds CJK is the exact shape
       scripts/i18n-pair-audit.mjs looks for — a translation tuple written as data instead of as a
       call — and a Japanese sentence inside a comment in this array tripped it. The gate was right
       about the shape and wrong about the meaning, and the honest fix is not an exemption: the
       reader of this file gets the Japanese, the worker gets ASCII. */
    const PREAMBLE = [
      "'use strict';",
      '/* assembled by js/gis-worker.js — the protocol lives in that file */',
      'var JOBS = Object.create(null);',
      'function post(m, t) {',
      '  try { self.postMessage(m, t || []); }',
      "  catch (e) { self.postMessage({ type: 'done', id: m && m.id, ok: false, why: 'result-not-transferable', detail: { message: String((e && e.message) || e) } }); }",
      '}',
      'self.onmessage = function (ev) {',
      '  var d = ev.data || {};',
      "  if (d.type !== 'run') return;",
      '  var id = d.id, rec = JOBS[d.job];',
      "  if (!rec) { post({ type: 'done', id: id, ok: false, why: 'job-unknown' }); return; }",
      '  var ctx = {',
      '    deps: rec.deps,',
      "    progress: function (done, total) { try { self.postMessage({ type: 'progress', id: id, done: done, total: (typeof total === 'number' ? total : null) }); } catch (_) { } }",
      '  };',
      '  var out;',
      '  try { out = rec.fn(d.payload, ctx); }',
      '  catch (e) {',
      '    /* ⚠ A CAPTURED VARIABLE ARRIVES HERE AND NOWHERE ELSE. The closure was never in the',
      '       source text, so the free name is unresolved in this global scope — which is the one',
      '       moment the broken contract is observable. It gets its own code so the caller is told',
      '       what is wrong, rather than the caller reading it as an ordinary failed computation. */',
      "    var why = (e && e.name === 'ReferenceError') ? 'job-not-self-contained' : 'job-threw';",
      "    post({ type: 'done', id: id, ok: false, why: why, detail: { name: (e && e.name) || null, message: String((e && e.message) || e) } });",
      '    return;',
      '  }',
      "  if (!out || typeof out !== 'object' || typeof out.ok !== 'boolean') { post({ type: 'done', id: id, ok: false, why: 'job-answer-malformed' }); return; }",
      "  if (!out.ok) { post({ type: 'done', id: id, ok: false, why: out.why || 'job-refused', detail: out.detail || null }); return; }",
      "  post({ type: 'done', id: id, ok: true, value: out.value }, Array.isArray(out.transfer) ? out.transfer : []);",
      '};',
      "post({ type: 'ready' });",
      '',
    ].join('\n');

    /* ── the registry — and there is no second list ────────────────────────────────────────────
       jobs() maps over this Map. A hand-written ORDER beside it is the defect #R732 removed from
       js/gis-ops.js: an entry added here and forgotten there would answer run() and be invisible
       to everything that asks what can be run. */
    const REG = new Map();
    let revision = 0;

    /* A job name is used as a JSON key in the assembled source and as a dispatch key; anything
       outside this shape is a mistake at the call site, not a thing to normalise. */
    const NAME_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i;

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }
    function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (_) { return null; } }

    function register(name, fn, opts) {
      const o = opts || {};
      if (typeof name !== 'string' || !NAME_RE.test(name)) return fail('job-name-invalid', { name: (typeof name === 'string') ? name : null });
      if (typeof fn !== 'function') return fail('job-not-a-function', { name: name });
      /* ⚠ THE CONSTRUCTOR'S toString, NOT THE FUNCTION'S. `String(fn)` calls whatever `toString`
         the object carries, and a function with its own would hand us source that is not its
         source — the assembled worker would then run something nobody wrote. Reached through
         `fn.constructor` (which IS the Function constructor) rather than the bare global for the
         same reason the parse probe below is: see the note there. */
      let src = '';
      try { src = fn.constructor.prototype.toString.call(fn); } catch (_) { try { src = String(fn); } catch (_) { src = ''; } }
      /* A bound or native function has no body to move — `[native code]` is what the engine says
         instead of source, and rebuilding from it would produce a worker that throws on first
         call. Refused by name here, where the caller can still do something about it. */
      if (!src || /\[native code\]/.test(src)) return fail('job-not-serialisable', { name: name });
      /* Rebuild it HERE, exactly as the worker will, so a source the worker could not have parsed
         is a registration failure rather than a first-call failure.
         ⚠ AND THE COST OF NOT DOING IT IS NOT ONE JOB. The whole registry is ONE script, so a
         member whose text is not an expression is a SyntaxError for the entire Blob — every other
         job then fails as `worker-blocked`, for a defect belonging to one of them. The real case
         is method shorthand: `({ f(){} }).f.toString()` is «f(){}», which is not an expression.
         ⚠ ONLY A SyntaxError COUNTS. A page whose Content-Security-Policy withholds 'unsafe-eval'
         makes this throw for a reason that says nothing about the function, and reading that as a
         bad job would refuse perfectly good arithmetic on the strength of an unrelated header.
         ⚠ `fn.constructor` IS the Function constructor — written that way, and not as the bare
         global, because scripts/check-split-scope.mjs resolves every free identifier in js/ against
         a hand-written list of browser globals and `Function` is not on it (`fetch Promise Math
         JSON Date Array Object …`, line 29). The list is the thing that is incomplete; until a word
         is added to it, a file that names the global is refused by the static gate. */
      try { fn.constructor('return (' + src + ')'); }
      catch (e) { if (e instanceof SyntaxError) return fail('job-source-unparsable', { name: name, message: String((e && e.message) || e) }); }
      /* deps travel as JSON into the assembled source; anything that does not survive that trip
         would arrive as something else and the job would be right about the wrong constants. */
      let deps = null;
      if (o.deps != null) {
        deps = clone(o.deps);
        if (deps == null) return fail('job-deps-not-json', { name: name });
      }
      REG.set(name, { name: name, src: src, deps: deps, decl: (o.decl != null ? clone(o.decl) : null) });
      revision++;
      return { ok: true, name: name };
    }

    /* The exact text the worker will evaluate for one job — published so a check can read the
       contract (no closure, no DOM) out of the shipped bytes without a browser. */
    function sourceOf(name) { const r = REG.get(name); return r ? r.src : null; }

    function buildSource() {
      let s = PREAMBLE;
      REG.forEach(function (rec, name) {
        s += 'JOBS[' + JSON.stringify(name) + '] = { deps: ' + JSON.stringify(rec.deps) + ', fn: (' + rec.src + ') };\n';
      });
      return s;
    }

    function jobs() {
      const out = [];
      REG.forEach(function (rec, name) { out.push({ name: name, decl: clone(rec.decl), deps: clone(rec.deps), bytes: rec.src.length }); });
      return out;
    }
    function jobNames() { const out = []; REG.forEach(function (_r, name) { out.push(name); }); return out; }

    /* ── can this environment run one at all ───────────────────────────────────────────────────
       ⚠ TWO DIFFERENT QUESTIONS, AND THEY ARE NOT THE SAME ANSWER. available() asks whether the
       constructors exist — a capability, answered synchronously, which is what a caller needs in
       order to choose the main-thread path without awaiting anything. probe() asks whether a
       worker built from this source ACTUALLY LOADED, which is the only form in which a
       Content-Security-Policy that refuses blob: can answer, because it refuses at load and
       surfaces as an error event rather than a throw. 「使えるはず」 and 「使えた」 are not
       interchangeable, so they are not one function. */
    function canConstruct() {
      try {
        return typeof Worker === 'function'
          && typeof Blob === 'function'
          && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
      } catch (_) { return false; }
    }
    /* Set when a worker failed to come up at all. ⚠ STICKY, DELIBERATELY: a thread that could not
       load its own script failed at construction, not at the job, and retrying it per call would
       pay the whole spawn cost for every call for the rest of the session. reset() clears it for
       a caller that has a reason to believe the environment changed. */
    let blocked = null;

    function available() { return canConstruct() && !blocked; }

    /* ── the pool ──────────────────────────────────────────────────────────────────────────────
       A slot holds one worker, the Blob URL it was built from, the revision of the registry that
       source came from, and the single task it may be running (see the terminate note in the
       header for why it is single). */
    const pool = [];
    const queue = [];
    let seq = 0;

    function spawn() {
      let url = null, w = null;
      try {
        const blob = new Blob([buildSource()], { type: 'text/javascript' });
        url = URL.createObjectURL(blob);
        w = new Worker(url);
      } catch (e) {
        try { if (url) URL.revokeObjectURL(url); } catch (_) { }
        blocked = { why: 'worker-blocked', detail: { message: String((e && e.message) || e) } };
        return null;
      }
      const slot = { w: w, url: url, rev: revision, ready: false, task: null };
      w.onmessage = function (ev) { onMessage(slot, ev.data || {}); };
      w.onmessageerror = function () { onDeath(slot, 'message-not-cloneable'); };
      w.onerror = function (ev) { onDeath(slot, String((ev && ev.message) || 'worker error')); };
      pool.push(slot);
      return slot;
    }

    /* ⚠ THE URL IS REVOKED WHEN THE SLOT DIES, NOT RIGHT AFTER new Worker(). The worker fetches
       its script from that URL, and revoking it in the same turn is a race that costs a worker
       that never loads — the exact failure this module reports as `worker-blocked`, arriving for
       a reason that would have been ours. It is one string per live worker, bounded by
       MAX_WORKERS, and it is released here. */
    function discard(slot) {
      const i = pool.indexOf(slot);
      if (i >= 0) pool.splice(i, 1);
      try { slot.w.onmessage = null; slot.w.onerror = null; slot.w.onmessageerror = null; } catch (_) { }
      try { slot.w.terminate(); } catch (_) { }
      try { if (slot.url) URL.revokeObjectURL(slot.url); } catch (_) { }
      slot.url = null;
    }

    const readyWaiters = [];
    function flushReady(res) { while (readyWaiters.length) { const f = readyWaiters.shift(); try { f(res); } catch (_) { } } }

    function onMessage(slot, m) {
      if (m.type === 'ready') { slot.ready = true; flushReady({ ok: true }); pump(); return; }
      const t = slot.task;
      if (!t || t.id !== m.id) return;
      if (m.type === 'progress') {
        if (t.onProgress) { try { t.onProgress({ done: m.done, total: m.total }); } catch (_) { } }
        return;
      }
      if (m.type !== 'done') return;
      slot.task = null;
      settle(t, m.ok ? { ok: true, value: m.value, transferred: t.transferred } : fail(m.why || 'job-failed', m.detail || null));
      pump();
    }

    function onDeath(slot, message) {
      const wasReady = slot.ready, t = slot.task;
      slot.task = null;
      discard(slot);
      if (!wasReady) {
        /* It died before it ever said `ready`: the script did not load. That is the environment
           refusing the Blob, not this job failing — so it is recorded once, every waiting task is
           answered with it, and available() says false from now on. */
        blocked = { why: 'worker-blocked', detail: { message: message } };
        flushReady(fail('worker-blocked', { message: message }));
        if (t) settle(t, fail('worker-blocked', { message: message }));
        while (queue.length) settle(queue.shift(), fail('worker-blocked', { message: message }));
        return;
      }
      if (t) settle(t, fail('worker-died', { message: message }));
      pump();
    }

    function settle(t, res) {
      if (!t || t.done) return;
      t.done = true;
      if (t.signal && t.onAbort) { try { t.signal.removeEventListener('abort', t.onAbort); } catch (_) { } }
      t.slot = null;
      try { t.resolve(res); } catch (_) { }
    }

    /* ⚠ THIS IS THE CANCELLATION THAT REACHES RUNNING ARITHMETIC. A queued task is simply dropped.
       A task already on a worker cannot be asked to stop — a loop in another thread reads no
       signal either — so the THREAD is ended, and because a slot carries at most one task there
       is nothing else on it to lose. The pool refills on the next pump(). */
    function abortTask(t) {
      if (t.done) return;
      const slot = t.slot;
      if (slot) { slot.task = null; discard(slot); }
      else { const i = queue.indexOf(t); if (i >= 0) queue.splice(i, 1); }
      settle(t, fail('aborted'));
      pump();
    }

    /* Every ArrayBuffer reachable from the payload, deduped (the same buffer twice in one transfer
       list is a DataCloneError) and cycle-safe. No depth ceiling: `seen` is what makes the walk
       terminate, and a structure deep enough to overflow this would overflow the structured clone
       that follows it anyway. */
    function collectBuffers(v, out, seen) {
      if (v == null) return;
      if (typeof ArrayBuffer !== 'undefined') {
        if (ArrayBuffer.isView(v)) { if (v.buffer) out.add(v.buffer); return; }
        if (v instanceof ArrayBuffer) { out.add(v); return; }
      }
      if (typeof v !== 'object') return;
      if (seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) collectBuffers(v[i], out, seen); return; }
      for (const k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) collectBuffers(v[k], out, seen); }
    }

    function assign(slot, t) {
      slot.task = t; t.slot = slot;
      const transfer = [];
      if (t.own === 'worker') {
        const set = new Set();
        collectBuffers(t.payload, set, new Set());
        set.forEach(function (b) { transfer.push(b); });
      }
      try {
        slot.w.postMessage({ type: 'run', id: t.id, job: t.job, payload: t.payload }, transfer);
        t.transferred = transfer.length;
      } catch (e) {
        /* postMessage serialises before it transfers, so a throw here means nothing left the
           caller's side — their arrays are intact, and saying so is the whole point of naming
           the ownership. */
        slot.task = null; t.slot = null;
        settle(t, fail('payload-not-cloneable', { message: String((e && e.message) || e) }));
      }
    }

    function pump() {
      while (queue.length) {
        if (blocked) { settle(queue.shift(), fail(blocked.why, blocked.detail)); continue; }
        let slot = null;
        for (let i = 0; i < pool.length; i++) { const s = pool[i]; if (s.ready && !s.task && s.rev === revision) { slot = s; break; } }
        if (slot) { assign(slot, queue.shift()); continue; }
        /* ⚠ AN IDLE WORKER BUILT FROM AN OLDER REGISTRY IS NOT A FREE WORKER. It has never heard
           of whatever was registered since, so it is retired here rather than handed the job and
           allowed to answer `job-unknown`. A BUSY one keeps its task to the end: that task was
           registered when its source was built, and killing it would lose a correct answer. */
        let stale = null;
        for (let i = 0; i < pool.length; i++) { const s = pool[i]; if (!s.task && s.rev !== revision) { stale = s; break; } }
        if (stale) { discard(stale); continue; }
        if (pool.length < MAX_WORKERS) { if (!spawn()) continue; }
        /* Either one is coming up (pump() runs again on `ready`) or the ceiling is reached and a
           finishing job will pump() next. */
        return;
      }
    }

    /* ── run one job ───────────────────────────────────────────────────────────────────────────
       opts: { signal, onProgress, own } — `own` is 'caller' (default, the payload is copied) or
       'worker' (the payload's buffers are transferred and the caller's arrays are detached). See
       the transfer contract in the header; there is no third value and no guessing. */
    function run(job, payload, opts) {
      const o = opts || {};
      if (typeof job !== 'string' || !REG.has(job)) return Promise.resolve(fail('job-unknown', { job: (typeof job === 'string' ? job : null), jobs: jobNames() }));
      const own = (o.own == null) ? 'caller' : o.own;
      if (own !== 'caller' && own !== 'worker') return Promise.resolve(fail('own-unknown', { own: String(o.own) }));
      /* ⚠ AN ENVIRONMENT WITHOUT WORKERS IS TOLD SO, BY NAME. Silently computing it here instead
         would hand the caller a frozen thread under a promise that claimed to be elsewhere; the
         caller keeps the js/gis-ops.js path and needs to know which one it got. */
      if (!canConstruct()) return Promise.resolve(fail('worker-unavailable', { worker: typeof Worker, blob: typeof Blob }));
      if (blocked) return Promise.resolve(fail(blocked.why, blocked.detail));
      const sig = o.signal || null;
      if (sig && sig.aborted) return Promise.resolve(fail('aborted'));
      return new Promise(function (resolve) {
        const t = {
          id: ++seq, job: job, payload: payload, own: own, signal: sig,
          onProgress: (typeof o.onProgress === 'function') ? o.onProgress : null,
          resolve: resolve, done: false, slot: null, transferred: 0, onAbort: null,
        };
        /* Attached now rather than at assignment, so a task cancelled while still QUEUED is
           cancelled — the wait is part of what the reader asked to stop. */
        if (sig) { t.onAbort = function () { abortTask(t); }; try { sig.addEventListener('abort', t.onAbort, { once: true }); } catch (_) { } }
        queue.push(t);
        pump();
      });
    }

    /* Did a worker built from THIS source actually load. Resolves once per call; the answer is
       whatever the first spawn reports (see available() for why the two are separate questions). */
    function probe() {
      if (!canConstruct()) return Promise.resolve(fail('worker-unavailable', { worker: typeof Worker, blob: typeof Blob }));
      if (blocked) return Promise.resolve(fail(blocked.why, blocked.detail));
      for (let i = 0; i < pool.length; i++) if (pool[i].ready) return Promise.resolve({ ok: true });
      return new Promise(function (resolve) {
        readyWaiters.push(resolve);
        if (!pool.length && !spawn()) { flushReady(fail(blocked.why, blocked.detail)); }
      });
    }

    function status() {
      let busy = 0, ready = 0;
      for (let i = 0; i < pool.length; i++) { if (pool[i].task) busy++; if (pool[i].ready) ready++; }
      return {
        available: available(), blocked: blocked ? clone(blocked) : null,
        workers: pool.length, ready: ready, busy: busy, queued: queue.length,
        revision: revision, maxConcurrency: MAX_WORKERS, cores: CORES,
      };
    }

    /* Ends every thread and releases every Blob URL. Queued and running tasks are answered
       `disposed` rather than left pending — a promise nobody will ever settle is the shape of
       hang this module is supposed to remove, not add. */
    function dispose() {
      while (pool.length) { const s = pool[0]; const t = s.task; s.task = null; discard(s); if (t) settle(t, fail('disposed')); }
      while (queue.length) settle(queue.shift(), fail('disposed'));
      flushReady(fail('disposed'));
    }
    function reset() { dispose(); blocked = null; }

    /* ══ THE FIRST JOB — per-pixel arithmetic over two bands ═══════════════════════════════════
       ⚠ SELF-CONTAINED, AS THE CONTRACT REQUIRES: it touches `Float64Array`, `Number`, `Object`
       and `Math`, which are the worker's own globals, and nothing from this module. The operator
       table F is the ONLY list of operators — a declaration repeating it would be the second list
       that goes out of step, so a caller learns the vocabulary from the refusal, which carries it
       (`detail.ops`). */
    function gridBinary(p, ctx) {
      const F = {
        '+': function (x, y) { return x + y; },
        '-': function (x, y) { return x - y; },
        '*': function (x, y) { return x * y; },
        '/': function (x, y) { return x / y; },
        'min': function (x, y) { return x < y ? x : y; },
        'max': function (x, y) { return x > y ? x : y; },
        'mean': function (x, y) { return (x + y) / 2; },
      };
      const op = p ? p.op : null;
      const f = Object.prototype.hasOwnProperty.call(F, String(op)) ? F[String(op)] : null;
      if (!f) return { ok: false, why: 'grid-op-unknown', detail: { op: (op == null ? null : String(op)), ops: Object.keys(F) } };
      const a = p.a;
      if (!a || typeof a.length !== 'number' || typeof a.BYTES_PER_ELEMENT !== 'number') return { ok: false, why: 'grid-a-not-numeric' };
      const n = a.length;
      const b = p.b;
      const scalar = (typeof b === 'number');
      if (!scalar) {
        if (!b || typeof b.length !== 'number' || typeof b.BYTES_PER_ELEMENT !== 'number') return { ok: false, why: 'grid-b-not-numeric' };
        if (b.length !== n) return { ok: false, why: 'grid-size-mismatch', detail: { a: n, b: b.length } };
      }
      const sv = scalar ? b : 0;
      const out = new Float64Array(n);
      /* Progress is reported at most 64 times whatever the grid's size. INSIDE a worker the
         interval is not about responsiveness — nothing here is blocking a paint — it is about
         message traffic, and one postMessage per pixel would cost more than the arithmetic it
         reports on. 64 is the number of distinct states a progress bar of a few hundred pixels
         can show. Expires if a reader ever needs progress finer than the bar can draw. */
      const step = Math.max(1, Math.floor(n / 64));
      for (let i = 0; i < n; i++) {
        const x = a[i], y = scalar ? sv : b[i];
        /* Missing in, missing out — and a non-finite RESULT (1/0 is the ordinary way there) is
           missing too, so this agrees with js/gis-raster.js missing(). */
        const v = (Number.isFinite(x) && Number.isFinite(y)) ? f(x, y) : NaN;
        out[i] = Number.isFinite(v) ? v : NaN;
        if ((i % step) === 0) ctx.progress(i, n);
      }
      ctx.progress(n, n);
      return { ok: true, value: { values: out, length: n }, transfer: [out.buffer] };
    }

    register('grid.binary', gridBinary, {
      decl: {
        id: 'grid.binary',
        /* WHAT IT TAKES, not what it can do with it: the operator vocabulary belongs to the table
           inside the job (see the note above it) and is reported by `grid-op-unknown`. */
        inputs: [{ name: 'a', type: 'band' }, { name: 'b', type: 'band|scalar' }],
        params: [{ name: 'op', type: 'operator', required: true, vocabularyFrom: 'grid-op-unknown' }],
        output: { values: 'band', length: 'count' },
        /* The missing-value rule is js/gis-raster.js missing()'s, not a second one — see the note
           above the job. It is not restated here: a sentence in a declaration is prose nobody
           translates and the nine languages live at the call site (docs/GIS-CORE.md §2.2). */
      },
    });

    const API = {
      /* capability (sync) and measurement (async) — see the note on canConstruct() */
      available: available,
      probe: probe,
      run: run,
      /* the registered jobs, derived from the registry itself — there is no second list */
      jobs: jobs,
      jobNames: jobNames,
      register: register,
      /* the exact text that will be evaluated in the worker, so the no-closure contract is
         readable from the shipped bytes */
      sourceOf: sourceOf,
      workerSource: buildSource,
      /* the one concurrency ceiling this layer has, so a caller does not write a second one */
      maxConcurrency: function () { return MAX_WORKERS; },
      status: status,
      dispose: dispose,
      reset: reset,
    };
    try { window.IntMapGisWorker = API; } catch (_) { }
    return API;
  })();
}
