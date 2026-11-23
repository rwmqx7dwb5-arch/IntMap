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
 *  runs it with a fake executor. The one exception is pageDelegationStore(), the page's single IndexedDB store for
 *  resuming (it reads `indexedDB` once, and is absent where there is none).
 * ==========================================================================*/

import { normalizeFacts } from './atlas-fact-merge.js';   /* (fact-merge) a result's `facts` are held to one shape */
import { personaPrompt } from './atlas-persona.js';   /* the one identity — a worker is Atlas at work, not a second character (R285) */
import { idbBackend, memoryBackend } from './atlas-notebook-store.js';   /* (delegate-child-loop) the device store's two backends — a delegation is kept in its OWN database beside the notebook's */

export const RESULT_STATES = Object.freeze(['done', 'partial', 'failed', 'refused', 'unobservable', 'cancelled']);

/* The codes ai-proxy names a worker refusal by (supabase/functions/ai-proxy/ask.ts, consume_ai_child_turn) —
   each an observed answer from the server, so a task that meets one is `refused`, not `failed`. */
export const REFUSAL_CODES = Object.freeze(['delegation_off', 'delegation_key', 'delegation_parent', 'delegation_children', 'turn_calls', 'turn_cost', 'bad_task']);

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/* a JSON text that does not depend on key order — the identity of an arguments object */
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/* The two kinds of piece of work. `worker`: a model researches it (the default). `capability`: one read-only IntMap
   capability is run with these arguments, no model in between — the cheap, exact way to fan a lookup out (the weather
   in five cities, a figure for each of ten countries). Which capabilities may be named is the executor's call
   (js/atlas-orchestrate.js makeCapabilityExecutor), not this file's. */
export const CONTRACT_KINDS = Object.freeze(['worker', 'capability']);

/* The most a capability task's arguments may weigh once written as JSON. Observation 2026-11-19: the arguments Atlas
   writes for a read capability are a handful of short fields (the largest schema in js/atlas-cap-*.js carries ~10
   keys); 4000 characters is an order of magnitude over that. Expires if a read capability starts taking a document
   as an argument — then pass it by reference (an input task) instead of raising this. Canonical: here only. */
const ARGS_MAX_CHARS = 4000;
/* How many capabilities one worker may be granted. Observation 2026-11-19: Atlas's own read tools it reaches for in one turn are a handful; 12 is above that. Expires if a worker is asked to choose among more — then it should search (find_capability) rather than be handed a longer list. */
const TOOLS_MAX = 12;

/* normaliseContract(c) → { ok, contract } | { ok:false, error } */
export function normaliseContract(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: 'contract_not_object' };
  const kind = c.kind === 'capability' ? 'capability' : 'worker';
  const inputs = (Array.isArray(c.inputs) ? c.inputs : [])
    .map((i) => (i && typeof i === 'object' ? s(i.from, 64) : s(i, 64))).filter(Boolean).map((from) => ({ from }));
  if (kind === 'capability') {
    const capability = s(c.capability, 80);
    if (!capability) return { ok: false, error: 'capability_missing' };
    const args = (c.args && typeof c.args === 'object' && !Array.isArray(c.args)) ? c.args : {};
    if (stable(args).length > ARGS_MAX_CHARS) return { ok: false, error: 'args_too_large' };
    return { ok: true, contract: { id: s(c.id, 64), kind, goal: s(c.goal, 2000) || ('capability ' + capability), returns: s(c.returns, 600), inputs, capability, args } };
  }
  const goal = s(c.goal, 2000);
  if (!goal) return { ok: false, error: 'goal_missing' };
  /* (delegation-agency) the read capabilities this worker may call ITSELF, by id — the parent's grant, nothing wider. Absent = the worker
     only researches (the model and its web search), which is what it was before. */
  const tools = Array.from(new Set((Array.isArray(c.tools) ? c.tools : []).map((x) => s(x, 80)).filter(Boolean))).slice(0, TOOLS_MAX);
  return { ok: true, contract: Object.assign({ id: s(c.id, 64), kind, goal, returns: s(c.returns, 600), inputs }, tools.length ? { tools } : null) };
}

/* the identity of a piece of work: what it is asked to do and from what — not the id it was given */
export function contractKey(c) {
  return stable([c.kind || 'worker', c.goal, c.returns, (c.inputs || []).map((i) => i.from).sort(), c.capability || '', c.args || null, (c.tools || []).slice().sort()]);
}

function makeEventLog(now) {
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

/* cycleMembers(contracts) → Set of the INDICES whose inputs lead back to themselves. `contracts` are normalised contracts
   (null where one did not normalise). Only names that are tasks of the list count as edges; a name that is not one is
   `input_unknown` at run time, not a cycle. Strongly connected components (Tarjan): a component of two or more tasks, or
   a task that names itself, is a cycle. */
function cycleMembers(contracts) {
  const list = Array.isArray(contracts) ? contracts : [];
  const at = new Map();
  list.forEach((c, i) => { if (c && c.id && !at.has(c.id)) at.set(c.id, i); });
  const edges = list.map((c) => (c ? (c.inputs || []).map((i) => at.get(i.from)).filter((j) => j !== undefined) : []));
  const out = new Set();
  let idx = 0;
  const index = new Array(list.length).fill(-1), low = new Array(list.length).fill(0), on = new Array(list.length).fill(false), stack = [];
  const visit = (v) => {
    index[v] = low[v] = idx++; stack.push(v); on[v] = true;
    edges[v].forEach((w) => {
      if (index[w] < 0) { visit(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], index[w]);
    });
    if (low[v] === index[v]) {
      const comp = [];
      let w;
      do { w = stack.pop(); on[w] = false; comp.push(w); } while (w !== v);
      if (comp.length > 1 || edges[v].indexOf(v) >= 0) comp.forEach((x) => out.add(x));
    }
  };
  for (let v = 0; v < list.length; v++) if (index[v] < 0) visit(v);
  return out;
}

/* resolveArgs(args, inputs) → { ok, args } | { ok:false, why }
   An argument that is a string of exactly the form  @<task id>:<path>  is replaced by what that task's result holds at
   <path> (dot-separated keys and array positions; the result's `data` and `summary` are the roots: `@acq:data.gis.dataset`).
   Only a task named in `inputs` can be referred to — a reference is a dependency, and a dependency is declared. A string
   beginning `@@` is the literal string without its first `@`. A reference that leads nowhere refuses the whole step. */
const REF_RE = /^@([A-Za-z0-9._-]{1,64}):([A-Za-z0-9_.\-\[\]]+)$/;
export function resolveArgs(args, inputs) {
  const byFrom = new Map((Array.isArray(inputs) ? inputs : []).map((i) => [i.from, i]));
  let why = '';
  const walk = (v) => {
    if (why) return v;
    if (typeof v === 'string') {
      if (v.startsWith('@@')) return v.slice(1);
      const m = REF_RE.exec(v);
      if (!m) return v;
      const src = byFrom.get(m[1]);
      if (!src) { why = 'The argument "' + v + '" refers to task "' + m[1] + '", which is not one of its inputs (name it in "inputs").'; return v; }
      let cur = { data: src.data, summary: src.summary };
      for (const k of m[2].split('.').filter(Boolean)) {
        if (cur == null || typeof cur !== 'object' || !(k in Object(cur))) { why = 'The argument "' + v + '" leads nowhere: task "' + m[1] + '" has no "' + k + '" there.'; return v; }
        cur = cur[k];
      }
      return cur;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = walk(v[k]); }); return o; }
    return v;
  };
  const out = walk(args == null ? {} : args);
  return why ? { ok: false, why } : { ok: true, args: out };
}

/* The result fields that may ride along as raw data (a capability's own answer). Bounded because a result is held in
   memory, written to the event log's snapshot and handed to the model: observation 2026-11-19 — a read capability's
   meta is a few hundred bytes to a few kB; 20000 characters is generous. Over it, the data is dropped and the
   result says so in `gaps` rather than being cut mid-structure. */
const DATA_MAX_CHARS = 20000;

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
  const subscribers = new Set();
  /* RESUME — the results a previous run of this delegation already had (snapshot().results). A task whose contract is
     the same one and that ended `done`/`partial` is not run again: it is answered from the record and says so
     (`resumed`). Anything else — it failed, it was refused, nothing was recorded — runs. This is what lets a second
     executor (a reloaded page, a server) pick the same delegation up without redoing, or re-paying for, finished work. */
  const resumeByKey = new Map();
  ((opt.resume && Array.isArray(opt.resume.results)) ? opt.resume.results : []).forEach((e) => {
    if (e && e.key && e.result && (e.result.state === 'done' || e.result.state === 'partial')) resumeByKey.set(String(e.key), e.result);
  });
  const keys = new Map();       // id → contractKey, for snapshot()
  let n = 0;

  /* every append goes through here so a watcher sees the event the moment it is written; a watcher that throws is
     the watcher's problem and never the work's */
  function note(kind, task, data, rel) {
    const e = log.append(kind, task, data, rel);
    subscribers.forEach((fn) => { try { fn(e); } catch (_) { /* a watcher must not break the delegation */ } });
    return e;
  }

  function finish(id, t0, r) {
    let data;
    if (r && r.data !== undefined) {
      let txt = '';
      try { txt = stable(r.data); } catch (_) { txt = ''; }
      if (txt && txt.length <= DATA_MAX_CHARS) { try { data = JSON.parse(txt); } catch (_) { data = undefined; } }
    }
    const dropped = !!(r && r.data !== undefined && data === undefined);
    const res = Object.freeze({
      id, state: RESULT_STATES.includes(r && r.state) ? r.state : 'failed',
      code: (r && r.code) || undefined,
      detail: (r && r.detail && typeof r.detail === 'object') ? Object.freeze(Object.fromEntries(Object.entries(r.detail).filter(([, v]) => v !== undefined))) : undefined,
      summary: s(r && r.summary, 4000),
      findings: Array.isArray(r && r.findings) ? r.findings.slice(0, 40) : [],
      facts: normalizeFacts(r && r.facts).slice(0, 200),   /* (fact-merge) claims as data: js/atlas-fact-merge.js */
      gaps: (Array.isArray(r && r.gaps) ? r.gaps.slice(0, 20).map((g) => s(g, 400)).filter(Boolean) : [])
        .concat(dropped ? ['The raw data of this result was too large to keep and was dropped (the summary above is complete).'] : []),
      sources: Array.isArray(r && r.sources) ? r.sources.slice(0, 40) : [],
      data,
      costUsd: Math.max(0, Number(r && r.costUsd) || 0),
      calls: Math.max(0, Number(r && r.calls) || 0),
      ms: Math.max(0, clock() - t0),
    });
    workspace.set(id, res);
    note('task.ended', id, { state: res.state, code: res.code || '', costUsd: res.costUsd, calls: res.calls, ms: res.ms });
    return res;
  }

  /* FORWARD NAMES — a task may name, as an input, a task that appears LATER in the same list. run() declares every id of
     its list before any task starts; a name in this map is a task that is about to be started, and waiting on it is
     waiting on that task's result. start() on its own (a single task, no list) has no forward names, so a name it does
     not know is `input_unknown`, as it always was. */
  const forward = new Map();    // declared id → { promise, resolve, settled }
  const settleForward = (id, promise) => {
    const f = forward.get(id);
    if (f && !f.settled) { f.settled = true; promise.then(f.resolve, f.resolve); }
  };

  function start(raw, force) {
    const nc = normaliseContract(raw);
    if (!nc.ok) {
      const id = 'invalid' + (++n);
      const t0 = clock();
      note('task.created', id, { goal: '', invalid: nc.error }, parent ? [{ kind: 'spawned_by', to: parent }] : []);
      const res = finish(id, t0, { state: 'failed', code: nc.error });
      const p = Promise.resolve(res);
      if (raw && typeof raw === 'object' && raw.id) settleForward(String(raw.id).slice(0, 64), p);
      return { id, reused: false, resumed: false, promise: p, cancel() {} };
    }
    const c = nc.contract;
    const key = contractKey(c);
    if (byKey.has(key)) {
      const prior = tasks.get(byKey.get(key));
      note('task.reused', prior.id, {}, [{ kind: 'same_as', to: prior.id }]);
      if (c.id) settleForward(c.id, prior.promise);   /* a later task that named THIS spelling of the id gets the same answer */
      return { id: prior.id, reused: true, resumed: false, promise: prior.promise, cancel: () => prior.controller.abort() };
    }
    let id = c.id && !tasks.has(c.id) ? c.id : 'task' + (++n);
    while (tasks.has(id)) id = 'task' + (++n);
    const controller = new AbortController();
    const rel = (parent ? [{ kind: 'spawned_by', to: parent }] : []).concat(c.inputs.map((i) => ({ kind: 'uses_output_of', to: i.from })));
    note('task.created', id, { goal: c.goal, returns: c.returns, kind: c.kind, capability: c.capability || undefined }, rel);
    const t0 = clock();
    const entry = { id, contract: c, key, controller, holder: null, promise: null };
    tasks.set(id, entry);
    byKey.set(key, id);
    keys.set(id, key);
    if (force && force.code) {
      /* a task the list itself shows cannot start (its inputs lead back to it): ended with the reason, never run, never left waiting */
      entry.promise = Promise.resolve(finish(id, t0, { state: 'failed', code: force.code, summary: force.summary }));
      settleForward(id, entry.promise);
      return { id, reused: false, resumed: false, promise: entry.promise, cancel() {} };
    }
    if (resumeByKey.has(key)) {
      const prior = resumeByKey.get(key);
      note('task.resumed', id, { from: prior.id || '', costUsd: Number(prior.costUsd) || 0, calls: Number(prior.calls) || 0 });
      /* what the first run spent was spent then; this run spent nothing, so the spend read off this log stays true */
      entry.promise = Promise.resolve(finish(id, t0, Object.assign({}, prior, { costUsd: 0, calls: 0 })));
      settleForward(id, entry.promise);
      return { id, reused: false, resumed: true, promise: entry.promise, cancel() {} };
    }
    entry.promise = (async () => {
      /* DEPENDENCIES: an input is another task's result. A name that is not a task of this delegation, or a
         task that did not end `done`/`partial`, leaves this one without what it was asked to start from. */
      const inputs = [];
      for (const i of c.inputs) {
        const dep = tasks.get(i.from);
        const fwd = dep ? null : forward.get(i.from);
        if (dep === entry || (!dep && !fwd)) return finish(id, t0, { state: 'failed', code: 'input_unknown', summary: 'No task named "' + i.from + '" was started in this delegation.' });
        const r = await (dep ? dep.promise : fwd.promise);
        if (r.state !== 'done' && r.state !== 'partial') return finish(id, t0, { state: 'failed', code: 'input_unavailable', summary: 'The task it starts from ("' + i.from + '") ended ' + r.state + '.' });
        inputs.push({ from: i.from, summary: r.summary, findings: r.findings, gaps: r.gaps, data: r.data });
      }
      if (controller.signal.aborted) return finish(id, t0, { state: 'cancelled' });
      /* A capability task's arguments may name what an input produced (`@task:data.gis.dataset`) — the way one analysis step
         is handed the dataset the step before it made. Resolved here, from the inputs this task has just been given, and
         refused BY NAME when the reference leads nowhere: a step run with a guessed argument is not the step asked for. */
      let runArgs = c.args;
      if (c.kind === 'capability') {
        const ra = resolveArgs(c.args, inputs);
        if (!ra.ok) return finish(id, t0, { state: 'failed', code: 'input_ref_unresolved', summary: ra.why });
        runArgs = ra.args;
      }
      /* THE LEASE: who holds the right to run this task. One executor holds every lease here; the event is
         what a second executor (a server, a second tab) would read before running a task someone else holds. */
      entry.holder = String(executor.id || 'executor');
      note('task.lease', id, { holder: entry.holder });
      try {
        const r = await executor.run({ id, kind: c.kind, goal: c.goal, returns: c.returns, inputs, capability: c.capability, args: runArgs, tools: c.tools }, {
          signal: controller.signal,
          emit: (kind, data) => note(kind, id, data),
        });
        return finish(id, t0, controller.signal.aborted && !(r && r.state) ? { state: 'cancelled' } : r);
      } catch (e) {
        if (controller.signal.aborted || (e && e.name === 'AbortError')) return finish(id, t0, { state: 'cancelled' });
        return finish(id, t0, { state: 'failed', code: 'executor_threw', summary: s(e && e.message, 400) });
      }
    })();
    settleForward(id, entry.promise);
    return { id, reused: false, resumed: false, promise: entry.promise, cancel: () => controller.abort() };
  }

  return {
    start,
    /* run(contracts) — start every task of a list and wait for all of them. The list is read WHOLE before anything starts:
       a task may name an input that comes later in it (it waits for that task), and a set of tasks whose inputs lead back
       to themselves is ended `input_cycle` at once instead of waiting for each other for ever. */
    async run(contracts) {
      const list = Array.isArray(contracts) ? contracts : [];
      const norm = list.map((raw) => normaliseContract(raw));
      const declared = new Set();
      norm.forEach((x) => { if (x.ok && x.contract.id && !tasks.has(x.contract.id)) declared.add(x.contract.id); });
      declared.forEach((id) => {
        let resolve; const promise = new Promise((r) => { resolve = r; });
        forward.set(id, { promise, resolve, settled: false });
      });
      const cyc = cycleMembers(norm.map((x) => (x.ok ? x.contract : null)));
      const handles = list.map((raw, i) => start(raw, cyc.has(i) ? { code: 'input_cycle', summary: 'Its inputs lead back to itself through "' + (norm[i].ok ? norm[i].contract.id : '') + '".' } : undefined));
      /* a declared name no task took (its id was already in use, so it was given another) must not leave a waiter waiting */
      forward.forEach((f) => { if (!f.settled) { f.settled = true; f.resolve({ state: 'failed', code: 'input_unknown', summary: 'No task of this list took that name.', findings: [], gaps: [], sources: [] }); } });
      const results = await Promise.all(handles.map((h) => h.promise));
      return results.map((r, i) => Object.assign({ reused: handles[i].reused, resumed: handles[i].resumed }, r));
    },
    cancelAll() { tasks.forEach((t) => { try { t.controller.abort(); } catch (_) { /* already ended */ } }); },
    /* stop ONE task (its dependents then end `failed`/`input_unavailable`, as for any task that did not finish) */
    cancel(id) { const t = tasks.get(String(id)); if (t) { try { t.controller.abort(); } catch (_) { /* already ended */ } } return !!t; },
    /* watch the log as it is written: fn(event) for each event from now on → an unsubscribe function. The live view of
       a delegation (which task is running, which has ended, what it cost so far) is this, read — not a second record. */
    subscribe(fn) { if (typeof fn !== 'function') return () => {}; subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    /* everything needed to continue this delegation elsewhere, as plain JSON (feed it back as makeDelegation({resume})) */
    snapshot() {
      return JSON.parse(JSON.stringify({
        v: 1, parent, at: clock(),
        results: Array.from(workspace.entries()).map(([id, result]) => ({ id, key: keys.get(id) || '', result })),
        events: log.all(),
      }));
    },
    log,
    workspace: { get: (id) => workspace.get(id) || null, all: () => Array.from(workspace.values()) },
    /* THE SPEND, read off the log: what each provider request of this delegation reported it cost */
    spendUsd() { return log.all().filter((e) => e.kind === 'effect.done').reduce((m, e) => m + (Number(e.data.costUsd) || 0), 0); },
  };
}

/* ══ WHERE A DELEGATION IS KEPT BETWEEN EXECUTORS — snapshot() written down, read back as makeDelegation({resume}) ══
   A delegation is identified by its LIST: every contract's key, in order, with whether it asked for a checker
   (`verify`). The same list asked again — after the tab was closed, the page reloaded, the turn cut off — finds the
   snapshot the last run wrote, and its tasks that ended done/partial are answered from it (makeDelegation `resume`).
   A different list is a different delegation: a dependent task's key names its input by id, not by what that input
   returned, so only inside the SAME list does a matching key mean the same work from the same inputs. */
export function delegationKey(contracts) {
  const list = (Array.isArray(contracts) ? contracts : []).map((raw) => {
    const nc = normaliseContract(raw);
    return [nc.ok ? contractKey(nc.contract) : 'invalid:' + nc.error, !!(raw && raw.verify === true)];
  });
  return 'd-' + requestKey(stable(list), 'delegation').slice(2);
}

/* How long a written snapshot answers for its list. OBSERVATION: it is ai-proxy's TURN_TTL_S (900 s,
   supabase/functions/ai-proxy/config.ts) — the window in which the server itself treats a turn as alive and hands a
   held answer back for the same request (replay.ts) instead of computing it again. A finished task kept longer than
   that would answer a reader's question about the world with a reading the server would no longer replay. EXPIRES
   when TURN_TTL_S moves. CANONICAL: TURN_TTL_S; tests/delegate-child-loop-checks.test.mjs holds the two equal. */
const RESUME_TTL_MS = 900 * 1000;

/* makeDelegationStore(backend, { fallback?, now?, ttlMs? }) — backend is the four-promise shape js/atlas-notebook-store.js
   memoryBackend / idbBackend speak (all / put / del / clear, entries keyed by `id`).
     get(key)            → the snapshot written for that list within ttlMs, or null (older entries are deleted as read)
     save(key, snapshot) → Promise<boolean> — true when it was written
   A backend that refuses (IndexedDB unavailable: private browsing, a full disk) is replaced by `fallback` for the rest of
   the page and the store says so (`state()` → 'fallback'); a store that cannot keep anything never fails the delegation
   it serves — the delegation runs, and only resuming it elsewhere is lost. */
export function makeDelegationStore(backend, o) {
  const opt = o || {};
  const clock = typeof opt.now === 'function' ? opt.now : () => Date.now();
  const ttl = Number(opt.ttlMs) > 0 ? Number(opt.ttlMs) : RESUME_TTL_MS;
  let B = backend, state = 'primary';
  const use = async (fn) => {
    try { return await fn(B); } catch (e) {
      if (state !== 'primary' || !opt.fallback) throw e;
      B = opt.fallback; state = 'fallback';
      return fn(B);
    }
  };
  return {
    state: () => state,
    async get(key) {
      let all = [];
      try { all = await use((b) => b.all()); } catch (_) { return null; }
      const t = clock();
      let hit = null;
      for (const e of (Array.isArray(all) ? all : [])) {
        if (!e || !e.id) continue;
        if (!(t - Number(e.at) < ttl)) { try { await use((b) => b.del(e.id)); } catch (_) { /* gone with the next read */ } continue; }
        if (e.id === key && e.snapshot && Array.isArray(e.snapshot.results)) hit = e.snapshot;
      }
      return hit;
    },
    async save(key, snapshot) {
      if (!key || !snapshot) return false;
      try { await use((b) => b.put({ id: String(key), at: clock(), snapshot: JSON.parse(JSON.stringify(snapshot)) })); return true; } catch (_) { return false; }
    },
  };
}

/* (delegate-child-loop) WHERE research.delegate KEEPS ITS DELEGATIONS ON THIS DEVICE — one store for the page (kept HERE, not in the capability module: the build refuses state at the top of a capability module — a copy and its module would be two instances, scripts/atlas-caps-split.mjs), in its own
   IndexedDB database ('intmap-atlas-delegation', beside the notebook's, never in it), falling back to memory for the rest of
   the page when IndexedDB refuses (js/atlas-delegate.js makeDelegationStore). A host with no IndexedDB at all (node) keeps
   nothing unless it hands one in with useDelegationStore() — so resuming is a property of the page, not of every caller. */
let _delegationStore;
export function pageDelegationStore() {
  if (_delegationStore !== undefined) return _delegationStore;
  let idb = null;
  try { idb = (typeof indexedDB !== 'undefined' && indexedDB) ? indexedDB : null; } catch (_) { idb = null; }
  _delegationStore = idb ? makeDelegationStore(idbBackend(idb, 'intmap-atlas-delegation'), { fallback: memoryBackend() }) : null;
  return _delegationStore;
}
/* A host with no IndexedDB (node, a test) hands in the store it wants the page to use; null turns keeping off again. */
export function useDelegationStore(store) { _delegationStore = store; return store; }

/* ══ THE WORKER EXECUTOR — a model behind ai-proxy (task atlas_delegate) ══════════════════════════════
   ask(prompt, system, images, opts) is js/ai-core.js askAIJSONEnvelope. The worker's turn key is the parent's
   with the task id after it; ai-proxy reads x-intmap-parent-turn and decides — by its own policy, not this
   file — whether the worker has its own allowance, shares the parent's, or is switched off.
   One request; if what comes back is not the shape asked for, ONE repair request that names what was wrong
   (a retry that does something different — one-pass-or-a-reason §5). The calls a worker may make are the
   server's to bound. */
const WORKER_SYSTEM = personaPrompt('working here as a research worker: you have been handed ONE piece of a larger request, and the Atlas talking to the reader will integrate your findings with those of other workers', { mode: 'internal' }) + [
  'Do only the piece you are given. Use the web search tool when it is attached to find and verify current facts; prefer primary and official sources.',
  'Never invent a fact, a figure, a date, a source or a coordinate. Give coordinates only when you know them (a well-known city, port, strait or facility); otherwise leave them out and name the place.',
  'Write in the language the piece is written in.',
  'Return ONE JSON object and nothing else: {"summary": string (what you found, 2-6 sentences), "findings": [{"claim": string, "place"?: string, "lat"?: number, "lon"?: number, "date"?: string, "source"?: string (URL), "verdict"?: "supported"|"unsupported"|"contradicted" (ONLY when you were asked to check a claim another worker made: repeat that claim verbatim in "claim")}], "gaps": [string] (what you could not establish, and why), "facts"?: [{"subject": {"name"?: string (in the language of your source), "ids"?: {"wikidata"?: "Q…", "osm"?: "node/…"} (ONLY ids you read from a source), "ref"?: string}, "attribute": string, "value": number|string|boolean, "unit"?: string, "at"?: string (the date the value is ABOUT), "source"?: string (URL), "retrievedAt"?: string}] (the same claims as data, one per figure or stated attribute: Atlas matches them across workers by object and attribute, so state the object by its identifiers when you have them and give the unit exactly as the source does)}.',
].join('\n');

function workerPrompt(task) {
  let p = 'YOUR PIECE OF THE WORK:\n' + task.goal;
  if (task.returns) p += '\n\nWHAT ATLAS NEEDS BACK:\n' + task.returns;
  (task.inputs || []).forEach((i) => {
    p += '\n\nWHAT ANOTHER WORKER FOUND (task "' + i.from + '") — build on it, do not repeat it:\n' + JSON.stringify({ summary: i.summary, findings: i.findings, gaps: i.gaps, data: i.data }).slice(0, 12000);
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
    const verdict = (f.verdict === 'supported' || f.verdict === 'unsupported' || f.verdict === 'contradicted') ? f.verdict : undefined;
    return { claim: s(f.claim, 800), verdict, place: f.place ? s(f.place, 200) : undefined, lat: ll ? lat : undefined, lon: ll ? lon : undefined, date: f.date ? s(f.date, 40) : undefined, source: f.source ? s(f.source, 500) : undefined };
  });
  return { ok: true, out: { summary: s(data.summary, 4000), findings, facts: normalizeFacts(data.facts), gaps: Array.isArray(data.gaps) ? data.gaps.map((g) => s(g, 400)).filter(Boolean) : [] } };
}

/* requestKey(prompt, webMode) → a key in ai-proxy's REPLAY_KEY_OK alphabet that is the same for the same request and (to
   2^-64) different for any other: two independent 32-bit hashes of the text, written in hex. Not a secret and not a
   signature — the server binds the key to the account and the turn; this only has to tell requests apart. */
export function requestKey(prompt, webMode) {
  const text = String(webMode || '') + '\n' + String(prompt || '');
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x5bd1e995) >>> 0;
  }
  return 'w-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* A failure the server NAMED and that says the attempt itself, not the request, went wrong: the provider was
   unavailable, a 5xx came back, or the web search ran out its time. Only these are tried again (one-pass-or-a-reason
   §5: a retry follows an observed failure). A refusal is the server's decision and is never retried; a request that
   left and never came back (`unobservable`) is not known to have failed, so it is not retried either. */
export function isTransientFailure(code, detail) {
  const d = detail || {};
  return code === 'provider_unavailable' || code === 'timeout' || d.timeout === true || (Number(d.status) >= 500 && Number(d.status) < 600);
}

/* (delegation-agency) A WORKER THAT MAY CALL READ CAPABILITIES. The worker's answer is either the findings object or ONE call
   {"call":{"capability":id,"args":{...}}}; a call is run by the host's kernel lane (the same one a capability task uses) and its
   result goes into the next request. Every request is one of the child's server-bounded calls, so the loop cannot outrun the
   server, and the last request is always asked for the answer. */
const stripTags = (h) => { let o = '', inTag = false; for (const ch of String(h == null ? '' : h)) { if (ch === '<') inTag = true; else if (ch === '>') { inTag = false; o += ' '; } else if (!inTag) o += ch; } return o.split(' ').filter(Boolean).join(' '); };
export function toolCallOf(data) {
  const c = data && typeof data === 'object' && !Array.isArray(data) ? data.call : null;
  if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.capability !== 'string' || !c.capability.trim()) return null;
  const args = (c.args && typeof c.args === 'object' && !Array.isArray(c.args)) ? c.args : {};
  return { capability: s(c.capability, 80), args };
}
/* (delegate-child-loop) THE SEARCH A WORKER MAY BE GRANTED. `find_capability` in a contract's `tools` is the parent's grant to
   SEARCH: the worker then calls {"call":{"capability":"find_capability","args":{"query":"<words>"}}}, the host searches the
   registry (the lane's `find` — js/atlas-console.js findCapabilities, the same search Atlas's own find_capability runs), and
   every match the host classifies as read-only joins this worker's grant from the next request on; any other match is
   reported with the reason it may not be called. It is the name Atlas already holds the same search under, and no
   capability id has that spelling, so the grant cannot be confused with a capability. */
const FIND = 'find_capability';
function toolSection(allowed, describe, steps, remaining, canFind) {
  let p = '\n\nCAPABILITIES YOU MAY CALL (read-only IntMap operations; nothing else, and none that changes the map): ' + (allowed.length ? allowed.join(', ') : '(none yet)') + '.';
  allowed.forEach((id) => { let d = ''; try { d = typeof describe === 'function' ? s(describe(id), 1200) : ''; } catch (_) { d = ''; } if (d) p += '\n  ' + id + ' arguments: ' + d; });
  p += '\nTo call one, return ONLY {"call":{"capability":"<id>","args":{...}}} instead of the findings. Its result comes back in your next request.';
  if (canFind) p += '\nTo look for a capability you do not have, return ONLY {"call":{"capability":"' + FIND + '","args":{"query":"<a few words for what you need>"}}}: IntMap searches its whole registry, and every read-only match becomes one you may call from your next request on (the others are named with the reason you may not call them).';
  if (steps.length) p += '\n\nRESULTS OF YOUR CALLS SO FAR:\n' + steps.map((x, i) => (i + 1) + '. ' + x.capability + ' ' + JSON.stringify(x.args).slice(0, 300) + ' → ' + (x.ok ? '' : 'FAILED: ') + x.text).join('\n');
  p += remaining <= 1 ? '\n\nTHIS IS YOUR LAST REQUEST: make no more calls; return the findings JSON now from what you have, and say in "gaps" what you could not establish.' : '\n\nYou have ' + remaining + ' request(s) left including the one that returns the findings.';
  return p;
}

/* makeWorkerExecutor({ ask, parentTurn, signal, maxCalls? })
   maxCalls — how many requests one worker may make (the first, a repair of a wrong shape, a retry after a transient
   failure). Pass the server's own bound (meta.delegationPolicy.childMaxCalls): the server refuses a call past it with
   `turn_calls`, so asking for more only buys a refusal. Setting it is also what turns the retry on. Unset → 2 requests
   (the first and one repair of a wrong shape) and no retry: what this executor did before it could retry. */
export function makeWorkerExecutor(o) {
  const opt = o || {};
  const ask = opt.ask;
  if (typeof ask !== 'function') throw new Error('makeWorkerExecutor: ask is required');
  const parentTurn = String(opt.parentTurn || '');
  const outerSignal = opt.signal || null;
  const maxCalls = Number.isInteger(opt.maxCalls) && opt.maxCalls >= 1 ? opt.maxCalls : 2;
  /* a retry after a transient failure is the caller's opt-in, by saying how many requests the server allows: without
     it the one spare request stays what it always was, the repair of a wrong shape */
  const retryTransient = Number.isInteger(opt.maxCalls) && opt.maxCalls >= 1;
  const cap = opt.capability && typeof opt.capability.run === 'function' && typeof opt.capability.classify === 'function' ? opt.capability : null;   /* { run, classify, describe?, find? } — the host's kernel lane (find: the registry search a worker granted find_capability uses) */
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
      /* the grant: only ids the parent named AND the host classifies as read-only; with no lane, or no grant, the worker researches only */
      const allowed = cap ? (task.tools || []).filter((id) => cap.classify(id) === 'read') : [];
      /* (delegate-child-loop) …and the grant to SEARCH, when the parent named it and the host has a search: what it finds is
         added to `allowed` under the same read-only rule, so the grant never widens past what the host classifies as read */
      const canFind = !!(cap && typeof cap.find === 'function' && (task.tools || []).includes(FIND));
      const steps = [];
      const base = (done) => workerPrompt(task) + ((allowed.length || canFind) ? toolSection(allowed, cap.describe, steps, maxCalls - done, canFind) : '');
      let prompt = base(0);
      let webMode = 'auto';
      let degraded = '';   /* what the final answer was made without, after a retry that changed the request */
      /* one search of the registry, as a step: read-only matches join the grant; the others are named with why they may not be
         called. Throws only when the task was cancelled while it searched. */
      const searchStep = async (args) => {
        const query = s(args && args.query, 200);
        if (!query) return { ok: false, text: 'give the words to search for in args.query' };
        const ti = ctx.emit('effect.intent', { capability: FIND, by: 'worker', turn: childKey });
        let ids = [];
        try { ids = await cap.find(query); } catch (e) {
          if (controller.signal.aborted) throw e;
          ctx.emit('effect.failed', { intent: ti.id, code: 'threw' });
          return { ok: false, text: 'the search failed: ' + s(e && e.message, 200) };
        }
        if (controller.signal.aborted) throw new Error('cancelled');
        ctx.emit('effect.done', { intent: ti.id, costUsd: 0, capability: FIND });
        const found = Array.from(new Set((Array.isArray(ids) ? ids : []).map((x) => s(x, 80)).filter(Boolean)));
        if (!found.length) return { ok: true, text: 'nothing in IntMap\'s registry matched these words; try other words, or answer without it' };
        return { ok: true, text: found.map((id) => {
          const kind = cap.classify(id);
          if (kind === 'read') { const had = allowed.includes(id); if (!had) allowed.push(id); return id + ' — ' + (had ? 'already yours' : 'you may call it now (its arguments are listed above)'); }
          return id + ' — you may NOT call it: ' + (kind === 'other' ? 'it is not read-only (capability_not_read_only); leave it to Atlas' : 'no such capability');
        }).join('; ') };
      };
      for (let attempt = 0; attempt < maxCalls; attempt++) {
        const intent = ctx.emit('effect.intent', { attempt, turn: childKey, webMode });
        let env;
        calls += 1;
        try {
          env = await ask(prompt, WORKER_SYSTEM, null, { task: 'atlas_delegate', webMode, turnId: childKey, parentTurnId: parentTurn, signal: controller.signal,
            /* the key is the REQUEST's identity — what is asked and how (prompt + web mode), under this child's turn key. A duplicate of THIS
               request (the same delegation resumed by another executor) is answered with the first's answer instead of being run again;
               a different request — the repair, the retry, or another research.delegate call that reused the id "task1" in the same turn —
               has a different key and is never handed this one's answer. */
            replayKey: requestKey(prompt, webMode) });
        } catch (e) {
          if (controller.signal.aborted || (e && e.name === 'AbortError')) return { state: 'cancelled', calls, costUsd, sources };
          const code = String((e && e.code) || '');
          /* (delegation-limits) WHY, as the server said it — measured 2026-11-19: a worker failed `provider_unavailable` after 90.7 s and
             nothing recorded whether its web search had timed out (the failed child's ledger row is released with its refund) */
          const m = (e && e.meta) || {};
          const detail = { timeout: m.timeout === true ? true : undefined, tooLarge: m.tooLarge === true ? true : undefined, status: Number(e && e.status) || undefined, model: m.model ? String(m.model).slice(0, 60) : undefined };
          ctx.emit('effect.failed', { intent: intent.id, code, timeout: !!detail.timeout, status: detail.status || 0 });
          if (REFUSAL_CODES.includes(code)) return { state: 'refused', code, detail, summary: s(e && e.message, 400), calls, costUsd, sources };
          /* the request may or may not have reached the provider: nothing came back to say which */
          if (code === 'network' || code === 'stream_broken' || (e && e.status === 0)) return { state: 'unobservable', code: code || 'network', detail, summary: s(e && e.message, 400), calls, costUsd, sources };
          /* An OBSERVED transient failure, with a request left in the budget: try again, but not the same request. A web
             search that ran out its time is not asked to search again (it would meet the same wall); it is asked to answer
             from what the model knows, and the result says it was made without the web. Any other transient failure is
             asked again for less — fewer, shorter findings — which is a different, cheaper request. */
          if (retryTransient && isTransientFailure(code, detail) && attempt + 1 < maxCalls) {
            const change = detail.timeout ? 'web_off' : 'concise';
            if (change === 'web_off') { webMode = 'off'; degraded = 'The web search timed out, so this was answered without it, from what the model knows: treat every claim as unverified.'; }
            prompt = base(attempt + 1) + '\n\nA PREVIOUS ATTEMPT AT THIS PIECE FAILED (' + (code || 'error') + '). '
              + (change === 'web_off' ? 'Web search is NOT available this time: answer only from what you reliably know, say plainly what you could not check, and give no source URL you cannot vouch for.' : 'Be concise: at most 5 findings, each one sentence, and say what you could not establish.');
            ctx.emit('effect.retry', { intent: intent.id, code, change, attempt: attempt + 1 });
            continue;
          }
          return { state: 'failed', code: code || 'error', detail, summary: s(e && e.message, 400), calls, costUsd, sources };
        }
        const meta = (env && env.meta) || {};
        const c = Math.max(0, Number(meta.costUsd) || 0);
        costUsd += c;
        ctx.emit('effect.done', { intent: intent.id, costUsd: c, model: String(meta.modelServed || meta.model || ''), web: !!meta.webUsed });
        (Array.isArray(env && env.citations) ? env.citations : []).forEach((x) => {
          if (x && x.url && !sources.some((y) => y.url === x.url)) sources.push({ url: s(x.url, 500), title: s(x.title, 200) });
        });
        const wanted = (allowed.length || canFind) ? toolCallOf(env && env.data) : null;
        if (wanted && attempt + 1 < maxCalls) {
          let step;
          if (canFind && wanted.capability === FIND) {
            try { step = await searchStep(wanted.args); } catch (e) { return { state: 'cancelled', calls, costUsd, sources }; }
          } else if (!allowed.includes(wanted.capability)) {
            /* the reason, not only the refusal: a capability that changes something is no worker's, whatever the grant says */
            const kind = cap.classify(wanted.capability);
            step = { ok: false, text: 'not in your grant (' + (allowed.join(', ') || 'nothing yet') + ')'
              + (kind === 'other' ? ' — and it is not read-only (capability_not_read_only): it changes something IntMap shows or keeps, so no worker may run it; leave it to Atlas and say so in "gaps"'
                : (kind === 'unknown' ? ' — and no capability has that id' : (canFind ? ' — find it with ' + FIND + ' first' : ''))) };
          } else {
            const ti = ctx.emit('effect.intent', { capability: wanted.capability, by: 'worker', turn: childKey });
            try {
              const out = await cap.run(wanted.capability, wanted.args, { signal: controller.signal });
              ctx.emit('effect.done', { intent: ti.id, costUsd: 0, capability: wanted.capability });
              step = { ok: !(out && out.ok === false), text: s(out && (out.text != null ? out.text : stripTags(out.html)), 3000) || (out && out.code) || '' };
              if (out && out.meta && step.ok) step.text += (step.text ? '\n' : '') + 'DATA: ' + s(JSON.stringify(out.meta), 1500);
            } catch (e) {
              if (controller.signal.aborted) return { state: 'cancelled', calls, costUsd, sources };
              ctx.emit('effect.failed', { intent: ti.id, code: 'threw' });
              step = { ok: false, text: s(e && e.message, 300) };
            }
          }
          steps.push({ capability: wanted.capability, args: wanted.args, ok: step.ok, text: step.text });
          prompt = base(attempt + 1);
          continue;
        }
        const sh = shapeOf(env && env.data);
        if (sh.ok) {
          const out = Object.assign({ state: 'done', calls, costUsd, sources }, sh.out);
          if (degraded) { out.state = 'partial'; out.code = 'degraded'; out.gaps = [degraded].concat(out.gaps || []); }
          return out;
        }
        why = sh.why;
        if (attempt + 1 < maxCalls) {
          prompt = base(attempt + 1) + '\n\nYOUR PREVIOUS ANSWER COULD NOT BE USED: ' + why + '. Return exactly the JSON object described, with a non-empty "summary".';
          continue;
        }
        const raw = s(env && env.text, 4000);
        return { state: raw ? 'partial' : 'failed', code: 'shape', summary: raw, gaps: (degraded ? [degraded] : []).concat(['The worker did not return the requested shape (' + why + ').']), calls, costUsd, sources };
      }
      return { state: 'failed', code: 'shape', summary: why, calls, costUsd, sources };
    },
  };
}
