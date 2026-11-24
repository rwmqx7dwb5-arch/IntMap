/* ============================================================================
 *  IntMap · THE CAPABILITY BRIDGE   (js/cap-bridge.js)
 * ----------------------------------------------------------------------------
 *  「AI が書いたプログラムから、Capability Registry の能力を何百回でも直接呼ぶ。途中の結果は実行環境の中に
 *  置き、最後の結果だけを Atlas に返す。」(Programmatic Tool Calling の IntMap 版)
 *
 *  Atlas calls a tool, reads the answer, decides the next call — one model round trip per step. A program
 *  that needs "the distance to the nearest port, for each of 500 cities" would spend 500 round trips, and
 *  every intermediate answer would pass through the model's context. With this bridge the PROGRAM makes
 *  the 500 calls itself, the intermediate results stay in the program's own memory, and what Atlas gets
 *  back is the program's final value plus `summary()` (what was called, what was refused).
 *
 *  ══ THIS FILE IS A CONTRACT, NOT A RUNTIME ════════════════════════════════════════════════════
 *  It names no language. The thing on the other side of the port is anything that can post a JSON
 *  message — a JavaScript Worker, Pyodide in the Python Worker js/compute-sandbox.js builds (compute.run,
 *  PR #1272), a future MCP-hosted process. The wire is JSON over one MessagePort (PROTOCOL below). The
 *  host half is `makeCapabilityBridge` (the policy) + `attachBridge` (the port). `makeBridgeClient` is the
 *  other half for JavaScript; it is self-contained so that `clientSource()` can hand its text to a Worker
 *  that has none of this file. A Python program awaits the same three calls through its JS proxy
 *  (`await bridge.call("data.gis", {...})`) — Pyodide resolves a JS Promise inside top-level await.
 *
 *  ══ THE BRIDGE DOES NOT RUN CAPABILITIES; IT ASKS THE EXECUTOR THAT DOES ══════════════════════
 *  `deps.execute(call, turn)` is js/atlas-toolsurface.js `makeExecute(...)`: the same function a
 *  `run_capability` tool call from the model goes through. Everything that gate does for the model it
 *  therefore does for the program — the schema check, the reader's confirmation after outside text
 *  (column 8 'explicit'), the 'always' rows, conflict-key serialisation, the observer's verdict. The
 *  bridge adds the three things a PROGRAM needs that a single tool call does not (see below).
 *
 *  ══ 1. PERMISSION BY WHAT THE CAPABILITY DOES (effectClass) ═══════════════════════════════════
 *  A grant is a set of classes; a call whose capability is outside it is refused BEFORE it runs.
 *     read      risk 'read' and writes nothing                (data.gis, data.query, research.*)
 *     state     changes what the session shows or holds        (map.drawDataset, view.flyTo, gisDraw)
 *     persist   survives the tab                               (settings.*)
 *     external  leaves the machine                             (navigation.start, a post, a send)
 *  Default grant: ['read']. The runner widens it for a run that is meant to draw, and `persist` /
 *  `external` need to be named: a program that reads is not thereby allowed to publish.
 *  ⚠ THE SEAM FOR THE EFFECT DECOMPOSITION. The class is derived from the registry's existing columns
 *  (risk, effects.writes, confirmation) in ONE function, `effectClass`. The session that is splitting
 *  those columns into finer attributes changes that one function — or injects `deps.effectsOf(cap)`
 *  returning {class, reads?, writes?} — and nothing else here moves. The wire carries the class as a
 *  string and never a column number.
 *
 *  ══ 2. THE FENCES ARE LAST FENCES, AND NOTHING IS RE-RUN OR DROPPED SILENTLY ══════════════════
 *  (.agents/rules/one-pass-or-a-reason.md) maxCalls, deadlineMs and cancel() exist so that a runaway
 *  loop stops; they are not a budget and they are not a repeat filter.
 *   · A call over the fence is REFUSED with its reason ('call-limit', 'deadline', 'cancelled') — a
 *     typed fact the program reads, never a silent skip.
 *   · THE SAME CALL TWICE (same capability, same arguments) is not run again and not discarded: the
 *     recorded answer is returned with `alreadyDone: true` and `ofSeq`, which is what js/atlas-agent.js
 *     `doneCalls` does for the model. To run it again, make it different.
 *   · A call that could not be SEEN to finish (the executor threw, the run was cancelled mid-call) is
 *     `observed: false` — 「観測できなかった」 — and is never reported as a failure of the capability.
 *
 *  ══ 3. OUTSIDE TEXT TAINTS THE REST OF THE RUN ════════════════════════════════════════════════
 *  A capability whose column 11 `ingests` is 'external' hands back sentences a third party wrote. Once
 *  one has been in front of the program, `turn.externalContentSeen` is true for every later call, which
 *  is exactly the fact the executor's 'explicit' confirmation reads. A program has no reader to ask: such
 *  a call answers `status:'needs_input'` / `error:'needs_confirm'` and the program must carry that
 *  to Atlas as its result. The bridge never sets `confirmed`.
 *
 *  LIMITS (each: observation, expiry, canonical place — .agents/rules/no-ad-hoc-hardcoding.md §4)
 *   maxCalls 5000 — NOT A MEASURED NUMBER. The motivating case is 500 calls (one per city); the fence is
 *     ten times that. Nothing has yet measured the executor's cost per call from a Worker.
 *     EXPIRES IF: a run measures the per-call cost; set the fence from it. Canonical: LIMITS below.
 *   deadlineMs 300000 — the same 300 s runaway fence js/compute-sandbox.js uses for one run (EXEC_MAX_MS),
 *     so the two fences agree. EXPIRES IF: that one changes.
 * ==========================================================================*/

export const PROTOCOL = Object.freeze({ version: 1, kinds: Object.freeze(['list', 'describe', 'call']) });

export const LIMITS = Object.freeze({ maxCalls: 5000, deadlineMs: 300000 });

export const CLASSES = Object.freeze(['read', 'state', 'persist', 'external']);

export const REFUSALS = Object.freeze(['bad-request', 'unknown-capability', 'not-granted', 'invalid-arguments',
  'call-limit', 'deadline', 'cancelled']);

/* The one place a capability record becomes a class. `deps.effectsOf` replaces it wholesale. */
export function effectClass(cap) {
  if (!cap) return null;
  const risk = String(cap.risk || '');
  const writes = (cap.effects && cap.effects.writes) || [];
  if (risk === 'external') return 'external';
  if (risk === 'persist') return 'persist';
  if (risk === 'read' && !writes.length) return 'read';
  return 'state';
}

/* A stable text for "the same arguments": object keys sorted at every depth. */
export function canonicalKey(id, args) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = norm(v[k]); }); return o; }
    return v;
  };
  let a = ''; try { a = JSON.stringify(norm(args === undefined ? {} : args)); } catch (_) { a = String(args); }
  return String(id) + '\u0000' + a;
}

function jsonSafe(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (_) { return { unserialisable: String(v) }; }
}

/**
 * makeCapabilityBridge(deps) -> bridge   (the policy; no port, no language)
 *   deps.registry      window.IntMapCapabilities-shaped: resolve(idOrAlias) -> record|null, all() -> records
 *   deps.execute       async (call, turn) -> mechanical result   (js/atlas-toolsurface.js makeExecute)
 *   deps.schemaOf      (capId) -> JSON schema                    (optional; describe() and the argument check)
 *   deps.validate      (schema, args) -> string[] errors         (optional; js/atlas-agent.js validateAgainst)
 *   deps.effectsOf     (cap) -> {class}                          (optional; replaces effectClass)
 *   deps.turn          the turn record handed to execute (its externalContentSeen is read and set)
 *   deps.grants        classes the run may use (default ['read'])
 *   deps.limits        {maxCalls, deadlineMs}
 *   deps.now           () -> ms  (tests)
 */
export function makeCapabilityBridge(deps) {
  deps = deps || {};
  const registry = deps.registry, execute = deps.execute;
  const limits = Object.assign({}, LIMITS, deps.limits || {});
  const grants = new Set(deps.grants || ['read']);
  const turn = deps.turn || {};
  const now = deps.now || (() => Date.now());
  const t0 = now();
  const classOf = (cap) => {
    if (typeof deps.effectsOf === 'function') { const e = deps.effectsOf(cap); return e && e.class ? String(e.class) : null; }
    return effectClass(cap);
  };

  let seq = 0, cancelled = null;
  const done = new Map();            /* canonicalKey -> { seq, promise } : the answer to a call already made */
  const inFlight = new Set();
  const stats = { calls: 0, executed: 0, repeats: 0, refused: {}, byCapability: {}, byClass: {}, unobserved: 0 };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const refuse = (s, reason, extra) => { bump(stats.refused, reason); return Object.assign({ v: PROTOCOL.version, seq: s, ok: false, refused: reason }, extra || {}); };

  function capOf(id) { let c = null; try { c = registry && registry.resolve ? registry.resolve(String(id || '')) : null; } catch (_) { c = null; } return c && !c.withdrawn ? c : null; }

  function describe(c) {
    const out = { id: c.id, category: c.category || '', class: classOf(c), granted: grants.has(classOf(c)),
      risk: c.risk || '', confirmation: c.confirmation || 'none', ingests: c.ingests || '' };
    if (typeof deps.schemaOf === 'function') { try { out.schema = jsonSafe(deps.schemaOf(c.id)); } catch (_) { out.schema = null; } }
    return out;
  }

  async function handle(msg) {
    const s = msg && typeof msg.seq === 'number' ? msg.seq : ++seq;
    if (!msg || msg.v !== PROTOCOL.version || PROTOCOL.kinds.indexOf(msg.kind) < 0) return refuse(s, 'bad-request', { detail: 'expected {v:1, kind:list|describe|call, seq}' });
    const kind = msg.kind;
    if (kind === 'list') {
      const q = String(msg.query || '').toLowerCase();
      const caps = (registry && registry.all ? registry.all() : []).filter((c) => c && !c.withdrawn && (!q || String(c.id).toLowerCase().indexOf(q) >= 0));
      return { v: PROTOCOL.version, seq: s, kind, ok: true, capabilities: caps.map((c) => ({ id: c.id, class: classOf(c), granted: grants.has(classOf(c)) })) };
    }
    const cap = capOf(msg.capability);
    if (!cap) return refuse(s, 'unknown-capability', { kind, capability: String(msg.capability || '') });
    if (kind === 'describe') return Object.assign({ v: PROTOCOL.version, seq: s, kind, ok: true }, describe(cap));

    /* ── call ── every refusal below happens BEFORE anything runs ── */
    if (cancelled) return refuse(s, 'cancelled', { kind, capability: cap.id, detail: cancelled });
    if (now() - t0 > limits.deadlineMs) return refuse(s, 'deadline', { kind, capability: cap.id, limitMs: limits.deadlineMs });
    const cls = classOf(cap);
    if (!grants.has(cls)) return refuse(s, 'not-granted', { kind, capability: cap.id, class: cls, granted: Array.from(grants) });
    const args = msg.args === undefined ? {} : msg.args;
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return refuse(s, 'invalid-arguments', { kind, capability: cap.id, errors: ['args must be an object'] });
    if (typeof deps.validate === 'function' && typeof deps.schemaOf === 'function') {
      const errs = []; try { deps.validate(deps.schemaOf(cap.id), args, cap.id, errs); } catch (_) { /* treated as valid, as the surface does */ }
      if (errs.length) return refuse(s, 'invalid-arguments', { kind, capability: cap.id, errors: errs.slice(0, 6) });
    }
    const key = canonicalKey(cap.id, args);
    const prior = done.get(key);
    if (prior) {            /* the same call: its answer, not a second run and not silence */
      stats.repeats++;
      const r = await prior.promise;
      return Object.assign({}, r, { seq: s, alreadyDone: true, ofSeq: prior.seq });
    }
    if (stats.executed >= limits.maxCalls) return refuse(s, 'call-limit', { kind, capability: cap.id, limit: limits.maxCalls });

    stats.calls++; stats.executed++; bump(stats.byCapability, cap.id); bump(stats.byClass, cls);
    const run = (async () => {
      let res = null;
      try { res = await execute({ name: 'run_capability', arguments: { id: cap.id, args } }, turn); }
      catch (e) { stats.unobserved++; return { v: PROTOCOL.version, seq: s, kind, ok: false, observed: false, why: 'execute-threw', detail: String((e && e.message) || e), capability: cap.id }; }
      if (cap.ingests === 'external') turn.externalContentSeen = true;     /* §3: from now on 'explicit' rows ask */
      return { v: PROTOCOL.version, seq: s, kind, ok: !!(res && res.ok), observed: true, capability: cap.id, result: jsonSafe(res) };
    })();
    done.set(key, { seq: s, promise: run });
    inFlight.add(run);
    try {
      const r = await run;
      if (cancelled) { stats.unobserved++; return { v: PROTOCOL.version, seq: s, kind, ok: false, observed: false, why: 'cancelled', capability: cap.id, detail: cancelled }; }
      return r;
    } finally { inFlight.delete(run); }
  }

  return {
    handle, grants: () => Array.from(grants), limits: () => Object.assign({}, limits),
    /* stop a runaway: later calls are refused 'cancelled'; calls in flight finish in the executor (it cannot be
       aborted from here) and their outcome is reported as not observed — nobody is told they failed */
    cancel(reason) { cancelled = String(reason || 'cancelled'); },
    /* what the run did — the part of the work Atlas is told, beside the program's final value */
    summary() {
      return { calls: stats.calls, executed: stats.executed, repeats: stats.repeats, refused: Object.assign({}, stats.refused),
        byCapability: Object.assign({}, stats.byCapability), byClass: Object.assign({}, stats.byClass), unobserved: stats.unobserved,
        inFlight: inFlight.size, externalContentSeen: !!turn.externalContentSeen, cancelled: cancelled, elapsedMs: now() - t0 };
    },
  };
}

/* Host half of the wire: answer every request on `port` through `bridge`. Returns a detach function. */
export function attachBridge(port, bridge) {
  port.onmessage = (e) => {
    const msg = e && e.data;
    Promise.resolve(bridge.handle(msg)).then((res) => port.postMessage(res),
      (err) => port.postMessage({ v: PROTOCOL.version, seq: msg && msg.seq, ok: false, observed: false, why: 'bridge-threw', detail: String((err && err.message) || err) }));
  };
  return () => { port.onmessage = null; };
}

/* The JavaScript half. SELF-CONTAINED ON PURPOSE (no import, no outer name): clientSource() ships its text
   to a Worker, and a test evaluates that text with nothing in scope. */
export function makeBridgeClient(port) {
  const pending = new Map(); let n = 0;
  port.onmessage = (e) => {
    const m = e && e.data; if (!m || typeof m.seq !== 'number') return;
    const p = pending.get(m.seq); if (!p) return;
    pending.delete(m.seq); p(m);
  };
  const ask = (msg) => new Promise((resolve) => { const seq = ++n; pending.set(seq, resolve); port.postMessage(Object.assign({ v: 1, seq }, msg)); });
  return {
    list: (query) => ask({ kind: 'list', query }),
    describe: (capability) => ask({ kind: 'describe', capability }),
    /* resolves with the answer INCLUDING refusals ({ok:false, refused}) — it does not throw, and it does not retry */
    call: (capability, args) => ask({ kind: 'call', capability, args }),
    pending: () => pending.size,
  };
}

export function clientSource() { return '(' + makeBridgeClient.toString() + ')'; }
