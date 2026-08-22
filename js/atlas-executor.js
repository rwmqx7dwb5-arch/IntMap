/* ============================================================================
 *  IntMap · ATLAS — the execution kernel  (#R318)   IntMapOS.execute()
 * ----------------------------------------------------------------------------
 *  「現在の`OS.exec()`は非同期処理の完了を待たず、ログ上の成功を先に記録できます。」
 *
 *  It does, and the line is short enough to quote the shape of: `exec` writes `ok:true` into the
 *  log record, calls `c.run(ctx)`, and downgrades to `ok:false` only if the RETURNED VALUE has
 *  `.ok === false`. A command that returns a Promise therefore records a success before its own
 *  first await has resumed, and a rejection after that point is never recorded at all. Every async
 *  capability in the app has been reporting the same way since #R82.
 *
 *  `execute()` is the replacement. It is not a wrapper around `exec` — it is the eleven steps that
 *  turn "I called a function" into "I watched the app change":
 *
 *      resolve → availability → validate args → resolve required inputs → BEFORE snapshot
 *              → run → await settle / watch progress → AFTER snapshot → verify postcondition
 *              → structured ActionResult → lifecycle event
 *
 *  ⚠ `exec()` STAYS, UNCHANGED, AND KEEPS ITS CALLERS. Sixteen files call it and several dozen
 *  buttons are wired to it; replacing it in one round is exactly the "全面置換" this round was told
 *  not to do. What changes is that `execute()` exists above it, that the registry's executors go
 *  through `execute()`, and that a command registered WITH a descriptor is reached both ways.
 *
 *  ⚠ THE CONFLICT LOCK IS NOT A NICETY. Two operations that both write `map.route` interleave into
 *  a route drawn from one plan and a panel describing another — the #R290 shape ("読み込みの列に
 *  誰が先に並ぶか"). Capabilities declare `effects.conflictKeys`; operations holding the same key
 *  run one after another, and the LATER one may supersede the earlier when the caller says so.
 * ==========================================================================*/
import { makeAtlasResults } from './atlas-results.js';
import { makeAtlasState } from './atlas-state.js';
/* installAtlasKernel(OS, HOST, deps) — the WHOLE kernel, mounted on IntMapOS in one call.
   ⚠ IT LIVES HERE AND NOT IN js/app-body.js BECAUSE OF THE APP-SHELL LINE BUDGET (#R168 ⑧), and
   that budget is not bureaucracy: index.html + src/main.js + src/vendor.js + app-body + geo-engine
   + lazy-modules is what a reader downloads and parses before the map can draw. #R318 added a
   subject to that shell; the subject leaves, the way #R199 and #R200 moved theirs. What app-body
   keeps is the two lines that BIND it — the kernel is still assembled before IntMapOS is returned,
   and every method below is still IntMapOS's. */
export function installAtlasKernel(OS, HOST, deps) {
  /* ⚠ IDEMPOTENT, because either shell may get here first: a button that pressed
     IntMapOS.execute() fetches this module through OS.kernel(), and js/atlas-console.js
     imports it directly when Atlas loads. Building a second executor would give the two of
     them separate operation registries and separate conflict locks — two kernels, which is
     the disagreement this round exists to end. */
  if (OS.__atlasKernel) return OS.__atlasKernel;
  deps = deps || {};
  /* ⚠ THE REGISTRY IS HANDED IN, AND THIS MODULE DELIBERATELY DOES NOT IMPORT IT.
     js/atlas-capabilities.js is eager and reaches THIS file with a dynamic import(); a static
     import back the other way closes the loop between the boot chunk and this one, and Rollup
     resolves that by evaluating them in an order where one file's `const` is still in its
     temporal dead zone. Measured: «Cannot access 'Jt' before initialization», thrown out of the
     Atlas factory, which then never mounted at all. Both callers already have the registry. */
  var caps = deps.capabilities;
  if (!caps) throw new Error('installAtlasKernel: deps.capabilities is required');
  var results = makeAtlasResults(HOST);
  var state = makeAtlasState(HOST);
  var exec = makeAtlasExecutor(HOST, { capabilities: caps, results: results, state: state, os: function () { return OS; } });
  /* the sections with no module of their own to speak for them (js/atlas-state.js) */
  try { state.registerDefaultProviders({ GE: deps.GE, host: HOST }); } catch (_) { }
  /* …and anything that registered while the ledger was still being fetched. A provider that
     arrived early is remembered by the stub in js/atlas-capabilities.js rather than dropped —
     a subsystem should not have to know whether the kernel had loaded when it spoke up. */
  try { (OS._pendingProviders || []).forEach(function (p2) { state.registerStateProvider(p2[0], p2[1]); }); OS._pendingProviders = null; } catch (_) { }

  /* ══ execute() — THE ONE DOOR BOTH SHELLS USE ═══════════════════════════════════════════════
     `exec` runs a COMMAND and answers what the command said. `execute` runs a CAPABILITY and
     answers what the APP DID: it resolves the descriptor, checks availability, validates the
     arguments, refuses to invent a missing target, observes the app before and after, awaits the
     work however it is shaped, and only then decides which of the seven statuses this was. */
  OS.execute = function (capabilityId, args, opts) { return exec.execute(capabilityId, args, opts); };
  OS.capabilities = function () { return caps; };
  OS.results = function () { return results; };
  OS.operations = function () { return exec; };
  OS.cancel = function (operationId, why) { return exec.cancel(operationId, why); };
  OS.supersede = function (turnId) { return exec.supersede(turnId); };
  /* a subsystem publishes its own state; nobody has to remember to add a sentence for it */
  OS.registerStateProvider = function (name, fn) { return state.registerStateProvider(name, fn); };
  OS.snapshot = function (o) { return state.snapshot(o); };
  OS.stateLedger = function () { return state; };
  /* the operation lifecycle joins the syscall log IntMapOS already keeps, so a UI action and an
     Atlas action are visible to the same subscriber in the same shape */
  if (typeof deps.record === 'function') {
    exec.on(function (ev) {
      deps.record({ t: Date.now(), cmd: ev.capabilityId, source: ev.source || 'atlas', ok: ev.phase !== 'failed', operationId: ev.operationId, phase: ev.phase });
    });
  }
  OS.__atlasKernel = { caps: caps, results: results, state: state, exec: exec };
  return OS.__atlasKernel;

  /* ⚠ NESTED, AND NOT EXPORTED. tests/r175 ③ forbids an unexported top-level declaration and
     forbids an export nothing imports by name, and this factory is both — the ONE door is
     installAtlasKernel. Two callers building two executors would also give them separate
     operation registries and separate conflict locks: two kernels, which is the disagreement
     this round exists to end. It is hoisted, so the call above reaches it. */
/* ⚠ NOT EXPORTED. `installAtlasKernel` above is the only door — an export nothing imports by
   name is dead code by tests/r175 ③, and two callers building two executors would give them
   separate operation registries and separate conflict locks. Tests reach it the same way the
   app does: install a kernel on a bare object and read `.exec`. */
function makeAtlasExecutor(HOST, CTX) {
  return (function () {
    var Results = CTX.results;
    var State = CTX.state;
    var Caps = CTX.capabilities;

    var API = {};
    var LIFECYCLE = ['planned', 'validating', 'waiting-input', 'started', 'progress',
      'completed', 'partial', 'failed', 'cancelled', 'superseded'];
    API.LIFECYCLE = LIFECYCLE.slice();

    var subs = [];
    var ops = Object.create(null);          /* operationId → live record */
    var locks = Object.create(null);        /* conflictKey → tail promise */
    var lockOwner = Object.create(null);    /* conflictKey → operationId currently holding it */

    API.on = function (fn) {
      if (typeof fn !== 'function') return function () { };
      subs.push(fn);
      return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
    };
    function emit(ev) {
      subs.forEach(function (f) { try { f(ev); } catch (_) { } });
      try { if (CTX.os && CTX.os.emit) CTX.os.emit(Object.assign({ kernel: 'atlas' }, ev)); } catch (_) { }
    }
    function phase(op, name, extra) {
      if (LIFECYCLE.indexOf(name) < 0) return;
      op.lifecycle.push({ phase: name, t: now() });
      emit(Object.assign({ operationId: op.operationId, capabilityId: op.capabilityId, phase: name, source: op.source, turnId: op.turnId }, extra || null));
    }
    function now() { try { return Date.now(); } catch (_) { return 0; } }

    /* ── a JSON-Schema subset, enough for a capability's inputSchema ────────────────────────────
       Deliberately small and deliberately STRICT: an unknown property is an error, not a shrug.
       「未知のCapability、未知の引数、型違いを黙って捨てない。」 */
    function typeOf(v) {
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'array';
      if (typeof v === 'number') return (isFinite(v) && Math.floor(v) === v) ? 'integer' : 'number';
      return typeof v;
    }
    function validate(schema, value, path, errors) {
      path = path || '';
      if (!schema || typeof schema !== 'object') return;
      if (schema.type) {
        var types = Array.isArray(schema.type) ? schema.type : [schema.type];
        var actual = typeOf(value);
        var ok = types.some(function (t) {
          if (t === 'number') return actual === 'number' || actual === 'integer';
          return t === actual;
        });
        if (!ok) { errors.push({ path: path || '/', expected: types.join('|'), got: actual }); return; }
      }
      if (schema.enum && schema.enum.indexOf(value) < 0) { errors.push({ path: path || '/', expected: 'one of ' + schema.enum.join(','), got: String(value) }); return; }
      if (typeof value === 'number') {
        if (schema.minimum != null && value < schema.minimum) errors.push({ path: path, expected: '>= ' + schema.minimum, got: String(value) });
        if (schema.maximum != null && value > schema.maximum) errors.push({ path: path, expected: '<= ' + schema.maximum, got: String(value) });
      }
      if (typeof value === 'string') {
        if (schema.minLength != null && value.length < schema.minLength) errors.push({ path: path, expected: 'length >= ' + schema.minLength, got: String(value.length) });
        if (schema.maxLength != null && value.length > schema.maxLength) errors.push({ path: path, expected: 'length <= ' + schema.maxLength, got: String(value.length) });
        if (schema.pattern) { try { if (!(new RegExp(schema.pattern)).test(value)) errors.push({ path: path, expected: 'match ' + schema.pattern, got: value.slice(0, 40) }); } catch (_) { } }
      }
      if (Array.isArray(value)) {
        if (schema.minItems != null && value.length < schema.minItems) errors.push({ path: path, expected: 'at least ' + schema.minItems + ' items', got: String(value.length) });
        if (schema.maxItems != null && value.length > schema.maxItems) errors.push({ path: path, expected: 'at most ' + schema.maxItems + ' items', got: String(value.length) });
        if (schema.items) value.forEach(function (v, i) { validate(schema.items, v, path + '/' + i, errors); });
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        var props = schema.properties || {};
        (schema.required || []).forEach(function (k) {
          if (value[k] === undefined || value[k] === null) errors.push({ path: path + '/' + k, expected: 'required', got: 'missing' });
        });
        Object.keys(value).forEach(function (k) {
          if (props[k]) validate(props[k], value[k], path + '/' + k, errors);
          else if (schema.additionalProperties === false) errors.push({ path: path + '/' + k, expected: 'no such argument', got: 'present' });
        });
      }
    }
    API.validateArgs = function (schema, args) {
      var errors = [];
      validate(schema || {}, args || {}, '', errors);
      return { ok: !errors.length, errors: errors };
    };

    /* ── conflict serialisation ─────────────────────────────────────────────────────────────── */
    function acquire(keys, op) {
      if (!keys || !keys.length) return Promise.resolve(function () { });
      var prior = keys.map(function (k) { return locks[k] || Promise.resolve(); });
      var gate = Promise.all(prior).catch(function () { });
      var release;
      var held = new Promise(function (res) { release = res; });
      keys.forEach(function (k) { locks[k] = gate.then(function () { return held; }); });
      return gate.then(function () {
        keys.forEach(function (k) { lockOwner[k] = op.operationId; });
        return function () {
          keys.forEach(function (k) { if (lockOwner[k] === op.operationId) delete lockOwner[k]; });
          release();
        };
      });
    }
    API.holderOf = function (key) { return lockOwner[key] || null; };

    /* ── operation registry: cancel / supersede reach the RUNNING work ─────────────────────── */
    API.live = function () { return Object.keys(ops).map(function (k) { return ops[k]; }); };
    API.pending = function () {
      return API.live().filter(function (o) { return !o.settled; })
        .map(function (o) { return { operationId: o.operationId, capabilityId: o.capabilityId, phase: o.lifecycle.length ? o.lifecycle[o.lifecycle.length - 1].phase : 'planned', progress: o.progress }; });
    };
    API.cancel = function (operationId, why) {
      var op = ops[operationId];
      if (!op || op.settled) return false;
      op.cancelReason = why || 'cancelled';
      try { op.abort.abort(); } catch (_) { }
      return true;
    };
    /* supersede(turnId) — a new user request arrives; everything the previous turn still owes is
       replaced rather than left to land later on top of the new answer. */
    API.supersede = function (turnId) {
      var n = 0;
      API.live().forEach(function (o) {
        if (o.settled) return;
        if (turnId != null && o.turnId === turnId) return;
        o.cancelReason = 'superseded';
        try { o.abort.abort(); } catch (_) { }
        n++;
      });
      return n;
    };

    function abortSignalOf(op, outer) {
      var ac;
      try { ac = new AbortController(); } catch (_) { ac = { abort: function () { this.signal.aborted = true; }, signal: { aborted: false } }; }
      op.abort = ac;
      if (outer) {
        if (outer.aborted) { try { ac.abort(); } catch (_) { } }
        else if (outer.addEventListener) { try { outer.addEventListener('abort', function () { try { ac.abort(); } catch (_) { } }); } catch (_) { } }
      }
      return ac.signal;
    }

    /* ── waiting for the truth, with a ceiling ─────────────────────────────────────────────────
       「固定時間の`setTimeout`だけで完了を推測しないでください。イベント、Promise、状態APIを
         優先し、どうしても無ければ上限付きpollingを使ってください。」
       `untilTrue` is the "どうしても無ければ" branch and it is bounded on BOTH ends: a maximum wall
       time and a cancel signal. It returns whether the predicate ever became true — never a guess. */
    API.untilTrue = function (fn, opts) {
      opts = opts || {};
      var every = opts.every || 120, max = opts.max || 4000, signal = opts.signal;
      var t0 = now();
      return new Promise(function (res) {
        (function tick() {
          var v = false;
          try { v = !!fn(); } catch (_) { v = false; }
          if (v) return res(true);
          if (signal && signal.aborted) return res(false);
          if (now() - t0 >= max) return res(false);
          setTimeout(tick, every);
        })();
      });
    };

    /* ── the eleven steps ─────────────────────────────────────────────────────────────────────── */
    API.execute = function (capabilityId, args, opts) {
      opts = opts || {};
      args = args || {};
      var operationId = opts.operationId || Results.newOperationId('op');
      var op = {
        operationId: operationId, capabilityId: String(capabilityId || ''), args: args,
        source: opts.source || 'api', turnId: opts.turnId || null,
        lifecycle: [], progress: null, settled: false, cancelReason: null,
        before: null, after: null, verification: null, rawResult: null, t0: now()
      };
      ops[operationId] = op;
      var signal = abortSignalOf(op, opts.signal);

      function settle(r) {
        op.settled = true;
        op.result = r;
        phase(op, (r.status === 'completed' || r.status === 'partial' || r.status === 'failed' ||
          r.status === 'cancelled' || r.status === 'superseded') ? r.status : 'started');
        try { if (op.turnId && State) State.recordOperation(op.turnId, {
          operationId: r.operationId, capabilityId: r.capabilityId, args: args,
          status: r.status, code: r.code, objectIds: r.objectIds, unresolved: r.unresolved,
          inputRequest: r.inputRequest, produced: r.produced, ms: now() - op.t0
        }); } catch (_) { }
        return r;
      }
      function fail(code, extra) {
        return settle(Results.failed(Object.assign({ operationId: operationId, capabilityId: op.capabilityId, code: code }, extra || null)));
      }

      return (async function () {
        phase(op, 'planned');

        /* 1 — resolve */
        var cap = null;
        try { cap = Caps.resolve(capabilityId); } catch (_) { cap = null; }
        if (!cap) return fail('unknown_capability', { messageKey: 'atlas.code.unknown_capability', messageParams: { name: String(capabilityId || '') } });
        op.capabilityId = cap.id;

        phase(op, 'validating');

        /* 2 — availability (may need the lazy module's METADATA, never its code) */
        var av = { available: true, reason: null };
        try { if (typeof cap.availability === 'function') av = cap.availability(Caps.context()) || av; } catch (e) { av = { available: false, reason: (e && e.message) || 'error' }; }
        if (!av.available) return fail('unavailable', { messageKey: 'atlas.code.unavailable', messageParams: { why: av.reason || '' } });

        /* 3 — argument schema */
        var v = API.validateArgs(cap.inputSchema, args);
        if (!v.ok) return fail('bad_args', { messageKey: 'atlas.code.bad_args', observed: { errors: v.errors } });

        /* 4 — required inputs. A capability that needs a point and was given none does NOT get the
               map centre; it gets `needs_input` with a resume token. (#R302's regression condition.) */
        var need = null;
        try { if (typeof cap.resolveInputs === 'function') need = await cap.resolveInputs(Caps.context(), args, { signal: signal }); } catch (e) { need = { error: (e && e.message) || 'error' }; }
        if (need && need.error) return fail('threw', { messageKey: 'atlas.code.threw', observed: { error: need.error } });
        if (need && need.inputRequest) {
          phase(op, 'waiting-input');
          return settle(Results.needsInput({
            operationId: operationId, capabilityId: cap.id,
            inputRequest: Object.assign({}, need.inputRequest, { pendingArgs: args, capabilityId: cap.id }),
            candidates: need.candidates || [], unresolved: need.unresolved || []
          }));
        }
        if (need && need.args) args = need.args;
        if (need && need.candidates && need.candidates.length > 1 && need.ambiguous) {
          phase(op, 'waiting-input');
          return settle(Results.needsInput({
            operationId: operationId, capabilityId: cap.id, code: 'ambiguous_target',
            messageKey: 'atlas.code.ambiguous_target', candidates: need.candidates,
            inputRequest: { kind: 'choice', promptKey: 'atlas.input.choice', pendingArgs: args, capabilityId: cap.id }
          }));
        }

        /* 5 — the lock, then the BEFORE observation. In that order: a snapshot taken before the
               lock describes a world another operation is still allowed to change. */
        var releaseLock = await acquire((cap.effects && cap.effects.conflictKeys) || [], op);
        try {
          if (signal.aborted) return settle(Results[op.cancelReason === 'superseded' ? 'superseded' : 'cancelled']({ operationId: operationId, capabilityId: cap.id }));

          /* the lazy module, if any — asked for HERE, at execution, never at planning */
          if (cap.lazyModules && cap.lazyModules.length) {
            for (var i = 0; i < cap.lazyModules.length; i++) {
              try { if (window.IntMapLazy && window.IntMapLazy.need) await window.IntMapLazy.need(cap.lazyModules[i]); }
              catch (e) { return fail('unavailable', { messageKey: 'atlas.code.unavailable', observed: { module: cap.lazyModules[i], error: (e && e.message) || 'error' } }); }
            }
          }

          try { op.before = (typeof cap.observe === 'function') ? await cap.observe(Caps.context(), args) : null; } catch (_) { op.before = null; }
          op.beforeState = State ? State.snapshot({ only: sectionsFor(cap) }) : null;

          /* 6/7 — run, and AWAIT. A thrown error and a rejected promise are the same failure. */
          phase(op, 'started');
          var raw;
          try {
            raw = cap.execute(Caps.context(), args, {
              signal: signal, operationId: operationId,
              progress: function (p) { op.progress = p; phase(op, 'progress', { progress: p }); }
            });
            if (raw && typeof raw.then === 'function') raw = await raw;
          } catch (e) {
            if (signal.aborted) return settle(Results[op.cancelReason === 'superseded' ? 'superseded' : 'cancelled']({ operationId: operationId, capabilityId: cap.id }));
            return fail('threw', { messageKey: 'atlas.code.threw', observed: { error: (e && e.message) || 'error' } });
          }
          op.rawResult = raw;
          if (signal.aborted) return settle(Results[op.cancelReason === 'superseded' ? 'superseded' : 'cancelled']({ operationId: operationId, capabilityId: cap.id }));

          /* An executor may itself answer `needs_input` (it discovered the gap mid-flight). */
          if (raw && raw.status === 'needs_input') {
            phase(op, 'waiting-input');
            return settle(Results.needsInput(Object.assign({}, raw, { operationId: operationId, capabilityId: cap.id })));
          }

          /* 8 — the AFTER observation */
          try { op.after = (typeof cap.observe === 'function') ? await cap.observe(Caps.context(), args) : null; } catch (_) { op.after = null; }
          op.afterState = State ? State.snapshot({ only: sectionsFor(cap) }) : null;

          /* 9 — the postcondition. This is the whole point of the file. */
          var verdict;
          try {
            verdict = await cap.verify(Caps.context(), args, op.before, op.after, raw);
          } catch (e) {
            verdict = { status: 'failed', code: 'threw', observed: { error: (e && e.message) || 'error' } };
          }
          if (!verdict || typeof verdict !== 'object') verdict = { status: 'failed', code: 'no_verdict' };
          op.verification = verdict;

          /* 10 — the structured result */
          var r = Results.make(Object.assign({
            operationId: operationId, capabilityId: cap.id,
            produced: (verdict.produced || (cap.produces || [])).slice(),
            observed: Object.assign({ before: op.before, after: op.after }, verdict.observed || null),
            undoToken: (typeof cap.undo === 'function' && verdict.undoToken) ? verdict.undoToken : null
          }, verdict));
          return settle(r);
        } finally {
          try { releaseLock(); } catch (_) { }
        }
      })().catch(function (e) {
        return fail('threw', { messageKey: 'atlas.code.threw', observed: { error: (e && e.message) || 'error' } });
      });
    };

    function sectionsFor(cap) {
      var w = (cap.effects && cap.effects.writes) || [];
      var out = [];
      w.forEach(function (k) {
        var head = String(k).split('.')[0];
        var map = { map: 'activeLayers', camera: 'camera', routing: 'routing', panel: 'panels',
          settings: 'settings', object: 'objects', selection: 'selection', time: 'time',
          simulation: 'simulations', comparison: 'comparison' };
        var s = map[head] || map[k] || head;
        if (out.indexOf(s) < 0) out.push(s);
      });
      if (out.indexOf('objects') < 0) out.push('objects');
      return out;
    }

    API.undo = async function (capabilityId, undoToken) {
      var cap = Caps.resolve(capabilityId);
      if (!cap || typeof cap.undo !== 'function') return Results.failed({ capabilityId: capabilityId, code: 'unavailable', messageKey: 'atlas.code.unavailable' });
      try {
        var r = cap.undo(Caps.context(), undoToken);
        if (r && typeof r.then === 'function') r = await r;
        return Results.completed({ capabilityId: cap.id, observed: { undo: r || null } });
      } catch (e) {
        return Results.failed({ capabilityId: cap.id, code: 'threw', messageKey: 'atlas.code.threw', observed: { error: (e && e.message) || 'error' } });
      }
    };

    /* ── the record the debug pane reads ──────────────────────────────────────────────────────── */
    API.record = function (operationId) {
      var o = ops[operationId];
      if (!o) return null;
      return {
        operationId: o.operationId, capabilityId: o.capabilityId, args: o.args,
        lifecycle: o.lifecycle.slice(), before: o.before, rawResult: o.rawResult,
        after: o.after, verification: o.verification,
        finalStatus: o.result ? o.result.status : 'running'
      };
    };
    API.records = function (turnId) {
      return Object.keys(ops).map(function (k) { return ops[k]; })
        .filter(function (o) { return turnId == null || o.turnId === turnId; })
        .map(function (o) { return API.record(o.operationId); });
    };
    /* keep the map from growing without bound over a long session */
    API.sweep = function () {
      var keys = Object.keys(ops);
      if (keys.length <= 120) return 0;
      var done = keys.filter(function (k) { return ops[k].settled; });
      var drop = done.slice(0, done.length - 60);
      drop.forEach(function (k) { delete ops[k]; });
      return drop.length;
    };

    try { window.IntMapAtlasExec = API; } catch (_) { }
    return API;
  })();
}
}

