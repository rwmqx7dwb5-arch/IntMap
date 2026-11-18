/* ============================================================================
 *  IntMap · Atlas delegation — the substrate a piece of work is handed on through   (js/atlas-delegate.js)
 * ----------------------------------------------------------------------------
 *  Atlas may hand pieces of a request to worker models and integrate what they return. This file is the
 *  part of that which must NOT change when the way it is organised does (docs/architecture/05-ai.md
 *  «委譲（delegation）»): what a piece of work is, what it returns, where its state lives, and what it cost.
 *  How many workers, which model, where they run, and in what order — those are the parts expected to
 *  change, and each is a value passed in, not a structure written here.
 *
 *    the CONTRACT   { id?, goal, returns?, inputs?:[{ from:<task id> }] }  →  a RESULT
 *                   { id, state, code?, summary, findings[], gaps[], sources[], costUsd, calls, ms }
 *                   state: done | partial | failed | refused | unobservable | cancelled
 *                   ⚠ `failed` and `unobservable` are different answers (.agents/rules/one-pass-or-a-reason.md §5):
 *                   a refusal or an error the server named is observed; a request that left and never came
 *                   back is not — whether the provider ran it is unknown, and it is said so.
 *    the EXECUTOR   { id, run(task, ctx) → Promise<result fields> } — anything that keeps the contract.
 *                   The one here is a worker model behind ai-proxy (makeWorkerExecutor).
 *    the STATE      lives OUTSIDE the executor, in an append-only event log: every event has an id and typed
 *                   relations to others (spawned_by · uses_output_of), so a tree, a DAG or a conversation are
 *                   all views of the same record. The WORKSPACE is the results, appended, readable by any task
 *                   that names another as an input. The SPEND is read off the log (cost events), never kept
 *                   beside it. Only what this first implementation writes is in it — kinds are added, not
 *                   reserved.
 *    DEPENDENCIES   are data: an input names another task, and a task starts once the tasks it names have
 *                   ended. There is no scheduler; a scheduler can be added later reading the same relations.
 *    REPETITION     the same contract started twice in one delegation is the same task — the second start
 *                   returns the first one's handle and says so (`reused`), the way js/atlas-agent.js doneCalls
 *                   answers a repeated call. It is not refused and it is not run again.
 *
 *  Pure apart from the executor it is given: no DOM, no network, no globals — tests/atlas-delegation-checks.test.mjs
 *  runs it with a fake executor.
 * ==========================================================================*/

import { personaPrompt } from './atlas-persona.js';   /* the one identity — a worker is Atlas at work, not a second character (R285) */

export const RESULT_STATES = Object.freeze(['done', 'partial', 'failed', 'refused', 'unobservable', 'cancelled']);

/* The codes ai-proxy names a worker refusal by (supabase/functions/ai-proxy/ask.ts, consume_ai_child_turn) —
   each an observed answer from the server, so a task that meets one is `refused`, not `failed`. */
export const REFUSAL_CODES = Object.freeze(['delegation_off', 'delegation_key', 'delegation_parent', 'delegation_children', 'turn_calls', 'turn_cost', 'bad_task']);

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/* normaliseContract(c) → { ok, contract } | { ok:false, error } */
export function normaliseContract(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: 'contract_not_object' };
  const goal = s(c.goal, 2000);
  if (!goal) return { ok: false, error: 'goal_missing' };
  const inputs = (Array.isArray(c.inputs) ? c.inputs : [])
    .map((i) => (i && typeof i === 'object' ? s(i.from, 64) : s(i, 64))).filter(Boolean).map((from) => ({ from }));
  return { ok: true, contract: { id: s(c.id, 64), goal, returns: s(c.returns, 600), inputs } };
}

/* the identity of a piece of work: what it is asked to do and from what — not the id it was given */
export function contractKey(c) {
  return JSON.stringify([c.goal, c.returns, (c.inputs || []).map((i) => i.from).sort()]);
}

export function makeEventLog(now) {
  const clock = typeof now === 'function' ? now : () => Date.now();
  const events = [];
  let seq = 0;
  return {
    append(kind, task, data, rel) {
      const e = Object.freeze({
        id: 'e' + (++seq), at: clock(), kind: String(kind), task: task || null,
        data: Object.freeze(Object.assign({}, data || {})),
        rel: Object.freeze((rel || []).filter((r) => r && r.to).map((r) => Object.freeze({ kind: String(r.kind), to: String(r.to) }))),
      });
      events.push(e);
      return e;
    },
    all() { return events.slice(); },
    of(task) { return events.filter((e) => e.task === task); },
  };
}

/* makeDelegation({ executor, log?, now?, parent? }) — one delegation: the tasks one Atlas call hands on.
   → { start(contract) → handle, run(contracts) → Promise<result[]>, cancelAll(), log, workspace, spendUsd() } */
export function makeDelegation(o) {
  const opt = o || {};
  const executor = opt.executor;
  if (!executor || typeof executor.run !== 'function') throw new Error('makeDelegation: an executor is required');
  const clock = typeof opt.now === 'function' ? opt.now : () => Date.now();
  const log = opt.log || makeEventLog(clock);
  const parent = opt.parent ? String(opt.parent) : '';
  const tasks = new Map();      // id → { contract, key, promise, controller, holder }
  const byKey = new Map();      // contractKey → id
  const workspace = new Map();  // id → result (appended once, when the task ends)
  let n = 0;

  function finish(id, t0, r) {
    const res = Object.freeze({
      id, state: RESULT_STATES.includes(r && r.state) ? r.state : 'failed',
      code: (r && r.code) || undefined,
      summary: s(r && r.summary, 4000),
      findings: Array.isArray(r && r.findings) ? r.findings.slice(0, 40) : [],
      gaps: Array.isArray(r && r.gaps) ? r.gaps.slice(0, 20).map((g) => s(g, 400)).filter(Boolean) : [],
      sources: Array.isArray(r && r.sources) ? r.sources.slice(0, 40) : [],
      costUsd: Math.max(0, Number(r && r.costUsd) || 0),
      calls: Math.max(0, Number(r && r.calls) || 0),
      ms: Math.max(0, clock() - t0),
    });
    workspace.set(id, res);
    log.append('task.ended', id, { state: res.state, code: res.code || '', costUsd: res.costUsd, calls: res.calls, ms: res.ms });
    return res;
  }

  function start(raw) {
    const nc = normaliseContract(raw);
    if (!nc.ok) {
      const id = 'invalid' + (++n);
      const t0 = clock();
      log.append('task.created', id, { goal: '', invalid: nc.error }, parent ? [{ kind: 'spawned_by', to: parent }] : []);
      const res = finish(id, t0, { state: 'failed', code: nc.error });
      return { id, reused: false, promise: Promise.resolve(res), cancel() {} };
    }
    const c = nc.contract;
    const key = contractKey(c);
    if (byKey.has(key)) {
      const prior = tasks.get(byKey.get(key));
      log.append('task.reused', prior.id, {}, [{ kind: 'same_as', to: prior.id }]);
      return { id: prior.id, reused: true, promise: prior.promise, cancel: () => prior.controller.abort() };
    }
    let id = c.id && !tasks.has(c.id) ? c.id : 'task' + (++n);
    while (tasks.has(id)) id = 'task' + (++n);
    const controller = new AbortController();
    const rel = (parent ? [{ kind: 'spawned_by', to: parent }] : []).concat(c.inputs.map((i) => ({ kind: 'uses_output_of', to: i.from })));
    log.append('task.created', id, { goal: c.goal, returns: c.returns }, rel);
    const t0 = clock();
    const entry = { id, contract: c, key, controller, holder: null, promise: null };
    tasks.set(id, entry);
    byKey.set(key, id);
    entry.promise = (async () => {
      /* DEPENDENCIES: an input is another task's result. A name that is not a task of this delegation, or a
         task that did not end `done`/`partial`, leaves this one without what it was asked to start from. */
      const inputs = [];
      for (const i of c.inputs) {
        const dep = tasks.get(i.from);
        if (!dep || dep === entry) return finish(id, t0, { state: 'failed', code: 'input_unknown', summary: 'No task named "' + i.from + '" was started in this delegation.' });
        const r = await dep.promise;
        if (r.state !== 'done' && r.state !== 'partial') return finish(id, t0, { state: 'failed', code: 'input_unavailable', summary: 'The task it starts from ("' + i.from + '") ended ' + r.state + '.' });
        inputs.push({ from: i.from, summary: r.summary, findings: r.findings, gaps: r.gaps });
      }
      if (controller.signal.aborted) return finish(id, t0, { state: 'cancelled' });
      /* THE LEASE: who holds the right to run this task. One executor holds every lease here; the event is
         what a second executor (a server, a second tab) would read before running a task someone else holds. */
      entry.holder = String(executor.id || 'executor');
      log.append('task.lease', id, { holder: entry.holder });
      try {
        const r = await executor.run({ id, goal: c.goal, returns: c.returns, inputs }, {
          signal: controller.signal,
          emit: (kind, data) => log.append(kind, id, data),
        });
        return finish(id, t0, controller.signal.aborted && !(r && r.state) ? { state: 'cancelled' } : r);
      } catch (e) {
        if (controller.signal.aborted || (e && e.name === 'AbortError')) return finish(id, t0, { state: 'cancelled' });
        return finish(id, t0, { state: 'failed', code: 'executor_threw', summary: s(e && e.message, 400) });
      }
    })();
    return { id, reused: false, promise: entry.promise, cancel: () => controller.abort() };
  }

  return {
    start,
    async run(contracts) {
      const handles = (Array.isArray(contracts) ? contracts : []).map(start);
      const results = await Promise.all(handles.map((h) => h.promise));
      return results.map((r, i) => Object.assign({ reused: handles[i].reused }, r));
    },
    cancelAll() { tasks.forEach((t) => { try { t.controller.abort(); } catch (_) { /* already ended */ } }); },
    log,
    workspace: { get: (id) => workspace.get(id) || null, all: () => Array.from(workspace.values()) },
    /* THE SPEND, read off the log: what each provider request of this delegation reported it cost */
    spendUsd() { return log.all().filter((e) => e.kind === 'effect.done').reduce((m, e) => m + (Number(e.data.costUsd) || 0), 0); },
  };
}

/* ══ THE WORKER EXECUTOR — a model behind ai-proxy (task atlas_delegate) ══════════════════════════════
   ask(prompt, system, images, opts) is js/ai-core.js askAIJSONEnvelope. The worker's turn key is the parent's
   with the task id after it; ai-proxy reads x-intmap-parent-turn and decides — by its own policy, not this
   file — whether the worker has its own allowance, shares the parent's, or is switched off.
   One request; if what comes back is not the shape asked for, ONE repair request that names what was wrong
   (a retry that does something different — one-pass-or-a-reason §5). The calls a worker may make are the
   server's to bound. */
export const WORKER_SYSTEM = personaPrompt('working here as a research worker: you have been handed ONE piece of a larger request, and the Atlas talking to the reader will integrate your findings with those of other workers', { mode: 'internal' }) + [
  'Do only the piece you are given. Use the web search tool when it is attached to find and verify current facts; prefer primary and official sources.',
  'Never invent a fact, a figure, a date, a source or a coordinate. Give coordinates only when you know them (a well-known city, port, strait or facility); otherwise leave them out and name the place.',
  'Write in the language the piece is written in.',
  'Return ONE JSON object and nothing else: {"summary": string (what you found, 2-6 sentences), "findings": [{"claim": string, "place"?: string, "lat"?: number, "lon"?: number, "date"?: string, "source"?: string (URL)}], "gaps": [string] (what you could not establish, and why)}.',
].join('\n');

export function workerPrompt(task) {
  let p = 'YOUR PIECE OF THE WORK:\n' + task.goal;
  if (task.returns) p += '\n\nWHAT ATLAS NEEDS BACK:\n' + task.returns;
  (task.inputs || []).forEach((i) => {
    p += '\n\nWHAT ANOTHER WORKER FOUND (task "' + i.from + '") — build on it, do not repeat it:\n' + JSON.stringify({ summary: i.summary, findings: i.findings, gaps: i.gaps }).slice(0, 12000);
  });
  return p + '\n\nToday is ' + new Date().toISOString().slice(0, 10) + '.';
}

/* shapeOf(data) → { ok, out } | { ok:false, why } — the worker's answer held to the shape it was asked for */
export function shapeOf(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, why: 'the answer was not a JSON object' };
  if (typeof data.summary !== 'string' || !data.summary.trim()) return { ok: false, why: '"summary" was missing or empty' };
  if (data.findings != null && !Array.isArray(data.findings)) return { ok: false, why: '"findings" was not an array' };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const findings = (data.findings || []).filter((f) => f && typeof f === 'object' && typeof f.claim === 'string' && f.claim.trim()).map((f) => {
    const lat = num(f.lat), lon = num(f.lon);
    const ll = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    return { claim: s(f.claim, 800), place: f.place ? s(f.place, 200) : undefined, lat: ll ? lat : undefined, lon: ll ? lon : undefined, date: f.date ? s(f.date, 40) : undefined, source: f.source ? s(f.source, 500) : undefined };
  });
  return { ok: true, out: { summary: s(data.summary, 4000), findings, gaps: Array.isArray(data.gaps) ? data.gaps.map((g) => s(g, 400)).filter(Boolean) : [] } };
}

export function makeWorkerExecutor(o) {
  const opt = o || {};
  const ask = opt.ask;
  if (typeof ask !== 'function') throw new Error('makeWorkerExecutor: ask is required');
  const parentTurn = String(opt.parentTurn || '');
  const outerSignal = opt.signal || null;
  return {
    id: 'worker-model@page',
    async run(task, ctx) {
      const childKey = (parentTurn + '~' + task.id).slice(0, 120);
      const controller = new AbortController();
      const abort = () => { try { controller.abort(); } catch (_) { /* ended */ } };
      if (outerSignal) { if (outerSignal.aborted) abort(); else outerSignal.addEventListener('abort', abort, { once: true }); }
      if (ctx.signal) { if (ctx.signal.aborted) abort(); else ctx.signal.addEventListener('abort', abort, { once: true }); }
      let calls = 0, costUsd = 0, why = '';
      const sources = [];
      let prompt = workerPrompt(task);
      for (let attempt = 0; attempt < 2; attempt++) {
        const intent = ctx.emit('effect.intent', { attempt, turn: childKey });
        let env;
        calls += 1;
        try {
          env = await ask(prompt, WORKER_SYSTEM, null, { task: 'atlas_delegate', webMode: 'auto', turnId: childKey, parentTurnId: parentTurn, signal: controller.signal });
        } catch (e) {
          if (controller.signal.aborted || (e && e.name === 'AbortError')) return { state: 'cancelled', calls, costUsd, sources };
          const code = String((e && e.code) || '');
          ctx.emit('effect.failed', { intent: intent.id, code });
          if (REFUSAL_CODES.includes(code)) return { state: 'refused', code, summary: s(e && e.message, 400), calls, costUsd, sources };
          /* the request may or may not have reached the provider: nothing came back to say which */
          if (code === 'network' || code === 'stream_broken' || (e && e.status === 0)) return { state: 'unobservable', code: code || 'network', summary: s(e && e.message, 400), calls, costUsd, sources };
          return { state: 'failed', code: code || 'error', summary: s(e && e.message, 400), calls, costUsd, sources };
        }
        const meta = (env && env.meta) || {};
        const c = Math.max(0, Number(meta.costUsd) || 0);
        costUsd += c;
        ctx.emit('effect.done', { intent: intent.id, costUsd: c, model: String(meta.modelServed || meta.model || ''), web: !!meta.webUsed });
        (Array.isArray(env && env.citations) ? env.citations : []).forEach((x) => {
          if (x && x.url && !sources.some((y) => y.url === x.url)) sources.push({ url: s(x.url, 500), title: s(x.title, 200) });
        });
        const sh = shapeOf(env && env.data);
        if (sh.ok) return Object.assign({ state: 'done', calls, costUsd, sources }, sh.out);
        why = sh.why;
        if (attempt === 0) {
          prompt = workerPrompt(task) + '\n\nYOUR PREVIOUS ANSWER COULD NOT BE USED: ' + why + '. Return exactly the JSON object described, with a non-empty "summary".';
          continue;
        }
        const raw = s(env && env.text, 4000);
        return { state: raw ? 'partial' : 'failed', code: 'shape', summary: raw, gaps: ['The worker did not return the requested shape (' + why + ').'], calls, costUsd, sources };
      }
      return { state: 'failed', code: 'shape', summary: why, calls, costUsd, sources };
    },
  };
}
