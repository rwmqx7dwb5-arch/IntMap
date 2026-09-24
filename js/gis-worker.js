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
 *  ══ ⚠⚠⚠ (#R783) AND THAT SENTENCE WAS A DESCRIPTION OF A LIMIT, READ AS A DESCRIPTION OF A RULE ══
 *  The external audit (§5, P2) measured what had actually moved: ONE registered job over numbers,
 *  reached from one place. 「カーネルを参照する演算は丸ごと移せない」 was true of the SHAPE the door
 *  had — a job is rebuilt from its own source text, so a call to a kernel's function was a free name
 *  in a scope that has none — and the answer to that is not 「then re-write the kernel's rule inside
 *  the job」, which is the second implementation .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids
 *  and the one that quietly loses the rule. It is A LIBRARY DOOR:
 *
 *    `provide(name, fn)` PUTS THE KERNEL'S OWN FUNCTION TEXT IN THE WORKER, and a job reaches it as
 *    `ctx.lib.<name>`. The bytes evaluated in the thread are `fn.toString()` of the very function
 *    this thread calls — not a copy authored here — so 「両方が同じだけ間違っていれば緑」 is not
 *    available: there is one implementation and two callers of it.
 *    ⚠ `ctx.lib`, NOT A FREE NAME, and that is not decoration. A job whose text said `invAt(…)`
 *    would carry a free identifier in js/, which scripts/check-split-scope.mjs resolves against the
 *    browser's globals and rightly refuses — and inside the worker it would sit in the one scope
 *    where a shadowed intrinsic (`Math`, `self`) is unobservable until an answer is wrong. A member
 *    of an object passed in shadows nothing and is visible to both gates.
 *    ⚠ A LIBRARY IS SELF-CONTAINED FOR THE SAME REASON A JOB IS, and it does not get `ctx.lib`
 *    either: a helper that needs another takes it as a PARAMETER, so the dependency is in the call
 *    and not in a scope that never crossed postMessage. `register(name, fn, { uses: [...] })`
 *    declares what a job reaches for and is refused (`job-library-missing`) when it is not there —
 *    a ReferenceError at the first pixel of a 4096² grid is a diagnosis nobody wants at that hour.
 *
 *  ══ ⚠⚠⚠ (#R783) THE CEILING IS MEMORY, SO THE UNIT OF WORK IS A MEMORY BUDGET ══════════════════
 *  The same audit: 「並列化だけ進めると応答性は改善してもメモリ不足を早める」. A 4096×4096 float64
 *  band is 128 MiB; two inputs and an output are 384 MiB; a payload the caller still holds is
 *  resident TWICE while the worker has it. So the answer to a big grid is not a count of items
 *  (「一律の上限」 — the thing CONSTITUTION.md §5 refuses) but the shape GDAL's warp has: split the
 *  work into blocks that FIT A STATED BUDGET, run them, and let each block's bytes go.
 *    · `budgetBytes()` — the one number, with its observation (see BLOCK_BUDGET_BYTES);
 *    · `planBlocks({units, bytesPerUnit, budgetBytes?, inFlight?})` — how many blocks that is, or
 *      `budget-too-small` when a single unit does not fit (a named refusal, not a silent overrun);
 *    · `runBlocks(job, plan, {make, take, …})` — runs them, keeping at most `inFlight` in the air,
 *      and REPORTS THE PEAK it actually held so 「予算内に収まった」 is a number somebody can read.
 *  ⚠ A BLOCK PAYLOAD IS TRANSFERRED BY DEFAULT (`own:'worker'`), unlike `run()`'s. `make()` builds it
 *  for this block and nobody else holds a view of it — the reason `run()` defaults to copying (the
 *  caller's own grid planes) does not apply, and copying it would be the second resident copy this
 *  whole mechanism exists to avoid.
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
 *  Two jobs registered HERE. `grid.binary`: two bands (or a band and a scalar) and an operator,
 *  missing values propagated. It runs in the worker for real — the arithmetic is in the text the Blob
 *  is built from and nowhere else. And (#R819) `geometry.op`, which owns NO arithmetic at all: it is
 *  the intake for a shape and an operation name, and the operation itself is a function
 *  js/gis-geometry.js provided. See the long note above the job for why transport may live here
 *  while arithmetic may not.
 *  ⚠ THE OTHERS ARE REGISTERED BY THEIR OWN KERNELS, WHICH IS THE WHOLE POINT: js/gis-raster.js
 *  registers `raster.diff` (#R759) and js/gis-warp.js registers `warp.geometry` with the two
 *  functions it provides (#R783). A registry this file filled itself would be a list of jobs whose
 *  arithmetic belongs to somebody else — scripts/gis-kernel-versions.mjs says the same thing about
 *  this module: 「the arithmetic it runs belongs to the kernel that registered it」.
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

    /* ── how much at once (#R783) ──────────────────────────────────────────────────────────────
       THE SAME OBSERVATION AS THE CEILING ABOVE, TURNED INTO THE UNIT OF WORK. Measured with the
       same pencil against the grids this app can already import: one 4096×4096 float64 plane is
       128 MiB, and a payload the caller still holds is resident TWICE while a worker has it — so a
       run that hands whole grids across cannot be made safe by counting items, only by BOUNDING
       BYTES. 64 MiB (67,108,864) is 8,388,608 float64 cells: a 4096² grid splits into 2 blocks, not
       into 400, so this is a CEILING on residency and not a chunk size, and MAX_WORKERS of them in
       the air is 256 MiB — which sits beside the caller's own 384 MiB and stays well under the
       ~1.5 GiB a tab was measured to stake above.
       ⚠ IT IS NOT A LIMIT ON HOW MUCH WORK MAY BE DONE (CONSTITUTION.md §5): every unit is run, in
       as many blocks as it takes. A caller that knows better states its own `budgetBytes`.
       EXPIRES IF: payloads become SharedArrayBuffer-backed (then nothing is resident twice and this
       arithmetic is void), or the tab ceiling above is re-measured.
       CANONICAL: this constant, published as budgetBytes() so no caller writes a second one. */
    const BLOCK_BUDGET_BYTES = 64 * 1024 * 1024;

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
      '/* (#R783) the functions provide() shipped, reached by a job as ctx.lib.<name>. A null',
      "   prototype, so a library called 'toString' is a library and not a borrowed method. */",
      'var LIBS = Object.create(null);',
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
      '    /* (#R783) the provided functions. One object for every job, because a library is the',
      '       kernel that provided it, not a per-job copy of it. */',
      '    lib: LIBS,',
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
    /* (#R783) the library — the same kind of Map, for the same reason, and it is the ONLY list of
       what a job may reach for: `uses` is checked against this, and `libraries()` maps over it. */
    const LIB = new Map();
    let revision = 0;

    /* A job name is used as a JSON key in the assembled source and as a dispatch key; anything
       outside this shape is a mistake at the call site, not a thing to normalise. */
    const NAME_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i;

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }
    function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (_) { return null; } }

    /* ── one reconstruction, two doors (#R783) ─────────────────────────────────────────────────
       A job and a library are rebuilt by the worker in exactly the same way, so the refusals that
       belong to «this text cannot be rebuilt» are decided HERE, once. Two spellings of it would be
       two answers to 「その関数は運べるのか」, and the one that matters is whichever the caller
       happened to use. The `kind` only chooses the PREFIX of the code, because the reader's sentence
       for a job that cannot travel is not the sentence for a helper that cannot. */
    function carriable(kind, name, fn) {
      if (typeof name !== 'string' || !NAME_RE.test(name)) return fail(kind + '-name-invalid', { name: (typeof name === 'string') ? name : null });
      if (typeof fn !== 'function') return fail(kind + '-not-a-function', { name: name });
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
      if (!src || /\[native code\]/.test(src)) return fail(kind + '-not-serialisable', { name: name });
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
      catch (e) { if (e instanceof SyntaxError) return fail(kind + '-source-unparsable', { name: name, message: String((e && e.message) || e) }); }
      return { ok: true, name: name, src: src };
    }

    function register(name, fn, opts) {
      const o = opts || {};
      const c = carriable('job', name, fn);
      if (!c.ok) return c;
      const src = c.src;
      /* deps travel as JSON into the assembled source; anything that does not survive that trip
         would arrive as something else and the job would be right about the wrong constants. */
      let deps = null;
      if (o.deps != null) {
        deps = clone(o.deps);
        if (deps == null) return fail('job-deps-not-json', { name: name });
      }
      /* ⚠ (#R783) WHAT THE JOB REACHES FOR IS DECLARED AND CHECKED NOW. Without this the first
         evidence that a library was never provided is a TypeError on the first pixel of the grid —
         after the spawn, after the transfer, in the one place where the caller has already thrown
         the work away. The vocabulary travels with the refusal (`have`), because a caller that
         misspelled a name needs to see the set it missed, not a list kept at the call site. */
      let uses = null;
      if (o.uses != null) {
        if (!Array.isArray(o.uses) || !o.uses.every((u) => typeof u === 'string')) return fail('job-uses-invalid', { name: name, uses: clone(o.uses) });
        const gone = o.uses.filter((u) => !LIB.has(u));
        if (gone.length) return fail('job-library-missing', { name: name, missing: gone, have: libraryNames() });
        uses = o.uses.slice();
      }
      REG.set(name, { name: name, src: src, deps: deps, uses: uses, decl: (o.decl != null ? clone(o.decl) : null) });
      revision++;
      return { ok: true, name: name };
    }

    /* ── provide: a kernel's own function, in the other thread (#R783) ─────────────────────────
       ⚠ THE ARGUMENT IS THE FUNCTION THE CALLER ITSELF CALLS, and that is the entire correctness
       argument for this door: the worker evaluates `fn.toString()`, so the bytes that run there are
       the bytes that run here. A helper written out a second time inside a job would be a rule with
       two owners, and the second one is always the one that forgets the edge case (js/gis-raster.js
       `missing()` on ±Infinity is this repository's standing example).
       ⚠ A LIBRARY IS SELF-CONTAINED TOO. It is rebuilt in the worker's global scope and does NOT
       receive `ctx.lib`; a helper that needs another takes it as a parameter. A captured name
       surfaces at the first call as the protocol's `job-not-self-contained`, with the identifier.
       ⚠ RE-PROVIDING THE SAME TEXT IS NOT A CHANGE. The revision retires idle workers, so a caller
       that provides on every call would spawn a fresh thread for every block; the text is compared
       and an identical one leaves the revision alone. */
    function provide(name, fn) {
      const c = carriable('lib', name, fn);
      if (!c.ok) return c;
      const had = LIB.get(name);
      if (had && had.src === c.src) return { ok: true, name: name, unchanged: true };
      LIB.set(name, { name: name, src: c.src });
      revision++;
      return { ok: true, name: name };
    }

    function librarySourceOf(name) { const r = LIB.get(name); return r ? r.src : null; }
    function libraryNames() { const out = []; LIB.forEach(function (_r, name) { out.push(name); }); return out; }
    function libraries() { const out = []; LIB.forEach(function (rec, name) { out.push({ name: name, bytes: rec.src.length }); }); return out; }

    /* The exact text the worker will evaluate for one job — published so a check can read the
       contract (no closure, no DOM) out of the shipped bytes without a browser. */
    function sourceOf(name) { const r = REG.get(name); return r ? r.src : null; }

    function buildSource() {
      let s = PREAMBLE;
      /* (#R783) THE LIBRARY GOES FIRST, and not because a job would fail otherwise — `ctx.lib` is
         read when a job RUNS, by which time every assignment in this script has happened. It goes
         first so that the text a check prints reads in the order it is depended on. */
      LIB.forEach(function (rec, name) {
        s += 'LIBS[' + JSON.stringify(name) + '] = (' + rec.src + ');\n';
      });
      REG.forEach(function (rec, name) {
        s += 'JOBS[' + JSON.stringify(name) + '] = { deps: ' + JSON.stringify(rec.deps) + ', fn: (' + rec.src + ') };\n';
      });
      return s;
    }

    function jobs() {
      const out = [];
      REG.forEach(function (rec, name) { out.push({ name: name, decl: clone(rec.decl), deps: clone(rec.deps), uses: rec.uses ? rec.uses.slice() : null, bytes: rec.src.length }); });
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

    /* ── the budget, and the split that fits in it (#R783) ─────────────────────────────────────
       ⚠ THE UNIT IS THE CALLER'S AND SO IS ITS COST. This layer cannot know whether a unit is an
       output pixel, a row or a feature, and it must not guess: `bytesPerUnit` is what the caller
       will actually hold for one of them (for js/gis-warp.js it is the size of the geometry that
       comes BACK, which is the biggest thing in flight there). What this owns is the arithmetic —
       how many units fit, how many blocks that is, and how many may be in the air at once.
       ⚠ A SINGLE UNIT THAT DOES NOT FIT IS A NAMED REFUSAL, not a block that quietly exceeds the
       budget: 「予算に収まらない」 is a fact the caller can act on (raise the budget, or ask for less
       per unit), and a silent overrun is the out-of-memory the budget was introduced to prevent. */
    function isCount(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1; }

    function planBlocks(spec) {
      const s = spec || {};
      if (!isCount(s.units)) return fail('plan-invalid', { field: 'units', value: (typeof s.units === 'number' ? s.units : null) });
      if (!(typeof s.bytesPerUnit === 'number' && isFinite(s.bytesPerUnit) && s.bytesPerUnit > 0)) return fail('plan-invalid', { field: 'bytesPerUnit', value: (typeof s.bytesPerUnit === 'number' ? s.bytesPerUnit : null) });
      const budget = (s.budgetBytes == null) ? BLOCK_BUDGET_BYTES : s.budgetBytes;
      if (!(typeof budget === 'number' && isFinite(budget) && budget > 0)) return fail('plan-invalid', { field: 'budgetBytes', value: (typeof budget === 'number' ? budget : null) });
      const want = (s.inFlight == null) ? 1 : s.inFlight;
      if (!isCount(want)) return fail('plan-invalid', { field: 'inFlight', value: (typeof want === 'number' ? want : null) });
      /* ⚠ THE BUDGET IS FOR EVERYTHING IN THE AIR, NOT PER BLOCK. A caller asking for four threads
         gets quarter-sized blocks, so parallelism does not multiply the residency — which is the
         exact failure the audit named (「並列化だけ進めると…メモリ不足を早める」). */
      const per = Math.floor(budget / (s.bytesPerUnit * want));
      if (per < 1) return fail('budget-too-small', { budgetBytes: budget, bytesPerUnit: s.bytesPerUnit, inFlight: want, needs: s.bytesPerUnit * want });
      const unitsPerBlock = Math.min(s.units, per);
      const blocks = Math.ceil(s.units / unitsPerBlock);
      /* No more threads than there are blocks, and never more than the pool has — a plan that
         promised five would be a plan whose peak nobody could reach. */
      const inFlight = Math.max(1, Math.min(want, blocks, MAX_WORKERS));
      const bytesPerBlock = unitsPerBlock * s.bytesPerUnit;
      return {
        ok: true,
        plan: {
          units: s.units, bytesPerUnit: s.bytesPerUnit, budgetBytes: budget,
          unitsPerBlock: unitsPerBlock, blocks: blocks, bytesPerBlock: bytesPerBlock,
          inFlight: inFlight, peakBytesPlanned: bytesPerBlock * inFlight,
        },
      };
    }

    /* ── runBlocks: the plan, executed, with the peak it actually held ─────────────────────────
       opts: { make(from, count, index) → payload | {ok:false,…},
               take(value, from, count, index) → void | {ok:false,…},
               signal, onProgress, own, run }
       ⚠ `make` AND `take` ARE WHERE THE BYTES LIVE AND DIE. This function never keeps a reference to
       a block's payload or to its result once `take` has had it, which is what makes the peak the
       plan's peak and not the whole grid's.
       ⚠ THE FIRST REFUSAL ENDS THE RUN AND IS THE ANSWER, and blocks already in the air are aborted
       rather than awaited for their own sake — a caller that has been told 「駄目でした」 is not
       helped by three more threads finishing arithmetic nobody will read.
       ⚠ `run` IS AN OPTION BECAUSE THE SCHEDULER IS NOT WELDED TO THIS POOL. In the product it is
       this module's `run` (the default). Node speaks the same three-message protocol over
       worker_threads — tests/r759-gis-worker-checks built exactly that door — and a scheduler that
       could only be exercised through a Blob would be a scheduler measured by nobody. */
    async function runBlocks(job, plan, opts) {
      const o = opts || {};
      /* planBlocks' own answer, or the plan inside it — and nothing else. ⚠ A HALF-STATED PLAN IS
         REFUSED RATHER THAN COMPLETED: a missing `inFlight` would make the window zero-wide and the
         run would finish instantly having done nothing, which is the shape of success this module
         must not be able to report. */
      const P = (plan && plan.ok === true && plan.plan) ? plan.plan : plan;
      if (!P || typeof P !== 'object' || !isCount(P.units) || !isCount(P.blocks) || !isCount(P.unitsPerBlock)
        || !isCount(P.inFlight) || !(typeof P.bytesPerUnit === 'number' && isFinite(P.bytesPerUnit) && P.bytesPerUnit > 0)) {
        return fail('plan-invalid', { field: 'plan' });
      }
      if (typeof o.make !== 'function') return fail('blocks-make-missing', { job: (typeof job === 'string') ? job : null });
      const runner = (typeof o.run === 'function') ? o.run : run;
      const own = (o.own == null) ? 'worker' : o.own;
      /* ⚠ ONE SIGNAL FOR THE WHOLE RUN, AND THIS LAYER OWNS IT. The caller's is forwarded into it,
         and a refusal from any block aborts it too — that is what ends the threads still holding
         blocks nobody will read. Without a controller the caller's signal is passed through
         untouched, and a refusal then lets the survivors finish (there is no handle to stop them);
         both are stated rather than assumed, because `terminate()` is the only stop that reaches
         arithmetic already running. */
      let mine = null;
      try { if (typeof AbortController === 'function') mine = new AbortController(); } catch (_) { mine = null; }
      if (mine && o.signal) {
        if (o.signal.aborted) { try { mine.abort(); } catch (_) { } }
        else { try { o.signal.addEventListener('abort', function () { try { mine.abort(); } catch (_) { } }, { once: true }); } catch (_) { } }
      }
      const sig = mine ? mine.signal : (o.signal || null);
      const giveUp = () => { if (mine) { try { mine.abort(); } catch (_) { } } };

      let peak = 0, live = 0, transferred = 0, units = 0, next = 0, bad = null, taken = 0;
      const running = new Set();

      const one = async (index) => {
        const from = index * P.unitsPerBlock;
        const count = Math.min(P.unitsPerBlock, P.units - from);
        const bytes = count * P.bytesPerUnit;
        let payload;
        try { payload = o.make(from, count, index); }
        catch (e) { return fail('block-make-threw', { index: index, message: String((e && e.message) || e) }); }
        if (payload && payload.ok === false) return payload;
        live += bytes;
        if (live > peak) peak = live;
        try {
          const res = await runner(job, payload, {
            own: own, signal: sig,
            onProgress: (typeof o.onProgress === 'function')
              ? function (p) { o.onProgress({ done: from + ((p && typeof p.done === 'number' && isFinite(p.done)) ? p.done : 0), total: P.units, block: index }); }
              : null,
          });
          if (!res || !res.ok) return res || fail('worker-answered-nothing', { index: index });
          if (typeof res.transferred === 'number') transferred += res.transferred;
          if (typeof o.take === 'function') {
            let t;
            /* ⚠ AWAITED, AND THE BUG THAT SENTENCE FIXED IS WHY IT IS WORTH A NOTE. `take` consumes
               the block, and consuming it can be asynchronous — js/gis-warp.js samples the geometry
               through an interruptible walk. An unawaited promise made the block count as taken
               while its consumer was still running, so 29 blocks were in flight at once, the
               reader's cancellation was dropped on the floor, and the peak was the whole grid's. It
               was invisible to a caller whose `take` was synchronous. */
            try { t = await o.take(res.value, from, count, index); }
            catch (e) { return fail('block-take-threw', { index: index, message: String((e && e.message) || e) }); }
            if (t && t.ok === false) return t;
            taken++;
          }
          units += count;
          return { ok: true };
        } finally { live -= bytes; }
      };

      for (;;) {
        if (!bad && sig && sig.aborted) bad = fail('aborted');
        while (!bad && running.size < P.inFlight && next < P.blocks) {
          const index = next++;
          const p = one(index).then(function (r) {
            running.delete(p);
            if (r && r.ok !== true && !bad) { bad = r; giveUp(); }
          }, function (e) {
            running.delete(p);
            if (!bad) { bad = fail('block-threw', { index: index, message: String((e && e.message) || e) }); giveUp(); }
          });
          running.add(p);
        }
        if (!running.size) break;
        await Promise.race(running);
      }
      /* ⚠ (#R819) A STOPPED RUN SAYS HOW MUCH OF THE CALLER'S OUTPUT IT ALREADY WROTE INTO. `take`
         consumes a block by writing it somewhere the CALLER owns, so when a run is cancelled or a
         block refuses, that destination is already part-written — and a refusal that does not say so
         is a refusal a caller can mistake for 「何も起きなかった」. This is not permission to use the
         half: `ok` is false, and `partial` is the measurement of what has to be thrown away or
         redone. It is measured, never planned. */
      if (bad) return Object.assign({}, bad, { partial: { units: units, blocks: taken, of: P.blocks } });
      return {
        ok: true, job: job, units: units, blocks: P.blocks,
        unitsPerBlock: P.unitsPerBlock, bytesPerBlock: P.bytesPerBlock,
        budgetBytes: P.budgetBytes, inFlight: P.inFlight,
        /* ⚠ MEASURED, NOT PLANNED. `peakBytesPlanned` is what the arithmetic allowed; this is the
           largest sum this run actually had in the air, which is the number a reader needs when the
           two disagree. */
        peakBytes: peak, transferred: transferred,
      };
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
        jobs: REG.size, libraries: LIB.size, budgetBytes: BLOCK_BUDGET_BYTES,
        /* ⚠ (#R819) 「中止は本当に効くか」 IS A DIFFERENT QUESTION FROM 「並列に走るか」, and a caller
           choosing a runner needs it answered. A stop only reaches arithmetic ALREADY RUNNING where
           there is a thread to end; on the main-thread path the same call holds the CPU until it
           returns whatever a signal says, so a caller that must be able to stop a single enormous
           operation is being told here whether that is available at all. Derived, not stored. */
        stopReachesRunningWork: available(),
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

    /* ══ (#R819) THE INTAKE FOR A GEOMETRY OPERATION ══════════════════════════════════════════════
       ⚠ THIS FILE STILL OWNS NO GEOMETRY. The arithmetic of a union, a buffer or a distance is
       js/gis-geometry.js's, and a second copy of any of it here is the defect
       .agents/rules/no-ad-hoc-hardcoding.md §2-3 names. What was missing was not arithmetic — it was
       A PLACE TO SEND SHAPES TO. `grid.binary`, `raster.diff` and `warp.geometry` all take numbers
       in typed arrays; a caller holding two polygons had no door at all, so every vector operation
       ran on the thread that paints however long it took.
       ⚠ SO THE JOB IS TRANSPORT, AND THE OPERATION IS A LIBRARY. `provideGeometry(op, fn)` puts the
       kernel's OWN function text in the worker (js/gis-worker.js `provide()`, header), and this job
       resolves it by the operation's name. There is no table of operation names in this file: the
       vocabulary IS what has been provided, `geometryOps()` reads it back out of the registry, and
       an operation nobody provided is refused BY NAME with that vocabulary attached — before a
       payload is built, if the caller asks `geometryReady(op)` first.
       ⚠ WHAT TRAVELS IS WHAT THE KERNEL'S FUNCTION TAKES AND RETURNS. Geometries are GeoJSON —
       plain objects and arrays of numbers, which structured clone carries and which nothing here
       has to know the shape of. `args` is applied positionally, so the door does not invent a
       calling convention for somebody else's function; a kernel function that reports its progress
       takes a callback as its LAST argument and the caller says so with `withProgress`, because
       appending one unasked would change the arity of every function that counts its own.
       ⚠ AND THE ANSWER IS READ THE WAY THE KERNEL WRITES IT. js/gis-geometry.js has two spellings —
       a plain value, and `attempt.*`'s `{ok,why}` — so a refusal from the kernel is carried through
       as a refusal rather than arriving as a successful `undefined`.
       ⚠ NOTHING IS TRANSFERRED BACK. A GeoJSON answer holds no ArrayBuffer, so there is no buffer to
       hand over and nothing is detached from anybody.
       ⚠ WHO PROVIDES, AND WHAT THEY MEASURED. js/gis-geometry.js `worker.install()` provides ITS OWN
       kernel factory here, and that kernel — built in the other thread with no environment to borrow
       from — answers `clipper-unavailable` / `geodesy-unavailable` for every operation that reaches
       the sweep line or js/geodesy.js. Neither can be provided: measured, polygon-clipping's `union`
       is «return operation.run(…)» over a free module name, and a classic worker assembled from a
       Blob can neither import a bare specifier nor importScripts a fingerprinted chunk. So the
       vocabulary the kernel offers is the operations that consult NEITHER, that file derives it by
       asking a dep-less kernel rather than by listing it, and none of that is this file's business:
       the intake dispatches whatever was provided and the refusals are the kernel's own.

       ══ ⚠⚠⚠ AND THE STOP FOR A SINGLE ENORMOUS SHAPE IS terminate(), NOT A YIELD ═══════════════
       Handing the thread back between FEATURES does not shorten the time spent inside ONE feature,
       and a sweep line over a 200,000-vertex polygon is one indivisible call: there is no point
       inside it that this file is entitled to interrupt, and a worker cannot read a message while a
       synchronous call is running anyway. So the stop is the one the header already describes —
       a slot holds at most one job, and `abortTask` ENDS THE THREAD. That is why the geometry door
       is here rather than beside the paced walks in js/gis-ops.js: those can be asked to stop and
       this can be MADE to.
       ⚠ A STOPPED RUN HAS NO ANSWER, AND NEITHER HALF OF ONE. `progress` carries counts and never
       values, the protocol's `done` is the only message that carries a result, and an aborted task
       settles as `aborted` — there is no path by which a partial walk is read as a finished one. */
    const GEOM_LIB_PREFIX = 'geometry.';
    const GEOM_JOB = 'geometry.op';

    function geometryOpJob(p, ctx) {
      const prefix = (ctx && ctx.deps && ctx.deps.prefix) || '';
      const lib = (ctx && ctx.lib) || {};
      const op = (p && p.op != null) ? String(p.op) : '';
      /* The vocabulary is the registry's, read here rather than listed — a caller that misspelled a
         name needs the set it missed, and this is the only place that has it. */
      const have = [];
      for (const k in lib) { if (k.indexOf(prefix) === 0) have.push(k.slice(prefix.length)); }
      const fn = op ? lib[prefix + op] : null;
      if (typeof fn !== 'function') return { ok: false, why: 'geometry-op-unavailable', detail: { op: op || null, have: have } };
      const args = (p && Array.isArray(p.args)) ? p.args.slice() : null;
      if (!args) return { ok: false, why: 'geometry-args-invalid', detail: { op: op, got: (p && p.args === undefined) ? 'undefined' : typeof (p && p.args) } };
      if (p && p.withProgress === true) {
        args.push(function (done, total) { ctx.progress(done, total); });
      }
      let out;
      try { out = fn.apply(null, args); }
      catch (e) { return { ok: false, why: 'geometry-op-threw', detail: { op: op, name: (e && e.name) || null, message: String((e && e.message) || e) } }; }
      /* Three shapes, and they are the kernel's own, not a convention invented here. */
      if (out && typeof out === 'object' && out.ok === false) return { ok: false, why: out.why || 'geometry-op-refused', detail: out.detail || { op: op } };
      const value = (out && typeof out === 'object' && out.ok === true && ('value' in out)) ? out.value : out;
      ctx.progress(1, 1);
      return { ok: true, value: { op: op, value: (value === undefined ? null : value) } };
    }

    register(GEOM_JOB, geometryOpJob, {
      deps: { prefix: GEOM_LIB_PREFIX },
      decl: {
        id: GEOM_JOB,
        inputs: [{ name: 'args', type: 'value[]' }],
        params: [
          { name: 'op', type: 'name', required: true, vocabularyFrom: 'geometry-op-unavailable' },
          { name: 'withProgress', type: 'boolean', required: false },
        ],
        output: { op: 'name', value: 'value' },
      },
    });

    /* The three doors a caller needs beside the job, and none of them holds a list: the prefix is
       written once, above. */
    function provideGeometry(op, fn) {
      if (typeof op !== 'string' || !op) return fail('geometry-op-invalid', { op: (typeof op === 'string') ? op : null });
      return provide(GEOM_LIB_PREFIX + op, fn);
    }
    function geometryOps() {
      const out = [];
      LIB.forEach(function (_rec, name) { if (name.indexOf(GEOM_LIB_PREFIX) === 0) out.push(name.slice(GEOM_LIB_PREFIX.length)); });
      return out;
    }
    /* ⚠ ASKED BEFORE THE SHAPES ARE COPIED. The same verdict the job reaches, reached on this thread
       where it costs nothing — so a caller learns 「その演算は渡されていない」 without having cloned
       a polygon into a thread first (.agents/rules/one-pass-or-a-reason.md §4). */
    function geometryReady(op) {
      const name = (typeof op === 'string') ? op : '';
      if (name && LIB.has(GEOM_LIB_PREFIX + name)) return { ok: true, op: name };
      return fail('geometry-op-unavailable', { op: name || null, have: geometryOps() });
    }

    const API = {
      /* capability (sync) and measurement (async) — see the note on canConstruct() */
      available: available,
      probe: probe,
      run: run,
      /* the registered jobs, derived from the registry itself — there is no second list */
      jobs: jobs,
      jobNames: jobNames,
      register: register,
      /* (#R783) the library door — a kernel's own function text, in the other thread */
      provide: provide,
      libraries: libraries,
      libraryNames: libraryNames,
      librarySourceOf: librarySourceOf,
      /* (#R819) the geometry intake — one job, and the vocabulary is whatever has been provided */
      geometryJob: GEOM_JOB,
      provideGeometry: provideGeometry,
      geometryOps: geometryOps,
      geometryReady: geometryReady,
      /* (#R783) the memory budget and the split that fits in it. `budgetBytes()` is the one number
         (see BLOCK_BUDGET_BYTES) so no caller writes a second one. */
      budgetBytes: function () { return BLOCK_BUDGET_BYTES; },
      planBlocks: planBlocks,
      runBlocks: runBlocks,
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
