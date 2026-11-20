/* ============================================================================
 *  IntMap · Atlas job core — the contract of a piece of work, and the planning of a list of them   (js/atlas-job-core.js)
 * ----------------------------------------------------------------------------
 *  The part of delegation that does not depend on WHERE it runs: what a contract is (normaliseContract), what makes two
 *  contracts the same work (contractKey), which tasks of a list lead back to themselves (cycleMembers), what a worker is
 *  told (workerSystem / workerPrompt) and what shape its answer must have (shapeOf).
 *
 *  Two readers: js/atlas-delegate.js (the page runs a delegation) and supabase/functions/atlas-jobs (the server runs the
 *  same contracts after the tab is closed). A byte-identical mirror lives at supabase/functions/_shared/atlas-job-core.js
 *  (node scripts/sync-atlas-job-core.mjs) because an Edge Function cannot import a file outside supabase/functions/.
 *
 *  ⚠ NO IMPORTS, NO GLOBALS — it must evaluate unchanged in a browser, in node and in Deno.
 * ==========================================================================*/

export const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

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

/* cycleMembers(contracts) → Set of the INDICES whose inputs lead back to themselves. `contracts` are normalised contracts
   (null where one did not normalise). Only names that are tasks of the list count as edges; a name that is not one is
   `input_unknown` at run time, not a cycle. Strongly connected components (Tarjan): a component of two or more tasks, or
   a task that names itself, is a cycle. */
export function cycleMembers(contracts) {
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

/* workerSystem(persona) — the worker's standing instructions; `persona` is personaPrompt(…) of the host (the page imports js/atlas-persona.js, the server its mirror) */
export function workerSystem(persona) {
  return String(persona) + [
  'Do only the piece you are given. Use the web search tool when it is attached to find and verify current facts; prefer primary and official sources.',
  'Never invent a fact, a figure, a date, a source or a coordinate. Give coordinates only when you know them (a well-known city, port, strait or facility); otherwise leave them out and name the place.',
  'Write in the language the piece is written in.',
  'Return ONE JSON object and nothing else: {"summary": string (what you found, 2-6 sentences), "findings": [{"claim": string, "place"?: string, "lat"?: number, "lon"?: number, "date"?: string, "source"?: string (URL), "verdict"?: "supported"|"unsupported"|"contradicted" (ONLY when you were asked to check a claim another worker made: repeat that claim verbatim in "claim")}], "gaps": [string] (what you could not establish, and why)}.',
].join('\n');
}

/* extra — what the reader changed while the work was running (server jobs): the latest instructions, which outrank the contract where they differ */
export function workerPrompt(task, extra) {
  let p = 'YOUR PIECE OF THE WORK:\n' + task.goal;
  if (task.returns) p += '\n\nWHAT ATLAS NEEDS BACK:\n' + task.returns;
  (task.inputs || []).forEach((i) => {
    p += '\n\nWHAT ANOTHER WORKER FOUND (task "' + i.from + '") — build on it, do not repeat it:\n' + JSON.stringify({ summary: i.summary, findings: i.findings, gaps: i.gaps, data: i.data }).slice(0, 12000);
  });
  if (Array.isArray(extra) && extra.length) p += '\n\nTHE READER CHANGED THE REQUEST WHILE THIS WAS RUNNING — their latest instructions, oldest first; they outrank the piece above wherever they differ:\n' + extra.map((x, i) => (i + 1) + '. ' + s(x, 1000)).join('\n');
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
  return { ok: true, out: { summary: s(data.summary, 4000), findings, gaps: Array.isArray(data.gaps) ? data.gaps.map((g) => s(g, 400)).filter(Boolean) : [] } };
}

/* ══ PLANNING A LIST OF CONTRACTS INTO A JOB  (atlas-durable-jobs) ═══════════════════════════════════
   planJob(contracts, { kinds? }) → { ok, tasks:[{ id, key, contract, deps }] } | { ok:false, error, at? }
   The same rules makeDelegation applies at run time, applied once up front so that a job the server accepts is one it can
   finish: every contract normalises, every id is unique, every input names a task of THIS list, the inputs lead nowhere
   in a circle, and nothing is the same work twice (the second start of one contract is the first — `reused`, not run again).
   `kinds` — what this runner can execute (default `worker` only). `capabilityOk(id)` — for a `capability` task, whether this
   runner has a twin of that capability (supabase/functions/_shared/atlas-server-caps.js): one it has not is refused by name
   (`capability_unsupported_on_server`) here, at planning, rather than started and failed there. */
export const JOB_MAX_TASKS = 8;   /* observation 2026-11-20: research.delegate hands on 2 workers by default (DELEGATION_DEFAULTS.maxChildren); 8 is four times that. Expires if a plan legitimately needs more — raise it here, the one place. */
export function planJob(contracts, o) {
  const kinds = (o && Array.isArray(o.kinds)) ? o.kinds : ['worker'];
  const list = Array.isArray(contracts) ? contracts : [];
  if (!list.length) return { ok: false, error: 'no_tasks' };
  if (list.length > JOB_MAX_TASKS) return { ok: false, error: 'too_many_tasks' };
  const norm = [];
  for (let i = 0; i < list.length; i++) {
    const nc = normaliseContract(list[i]);
    if (!nc.ok) return { ok: false, error: nc.error, at: i };
    if (!kinds.includes(nc.contract.kind)) return { ok: false, error: 'kind_unsupported', at: i };
    if (nc.contract.kind === 'capability' && !(o && typeof o.capabilityOk === 'function' && o.capabilityOk(nc.contract.capability))) return { ok: false, error: 'capability_unsupported_on_server', at: i };
    norm.push(nc.contract);
  }
  const ids = new Set();
  const tasks = [];
  const byKey = new Map();
  let n = 0;
  for (const c of norm) {
    const key = contractKey(c);
    if (byKey.has(key)) continue;
    let id = c.id && !ids.has(c.id) ? c.id : 'task' + (++n);
    while (ids.has(id)) id = 'task' + (++n);
    ids.add(id); byKey.set(key, id);
    tasks.push({ id, key, contract: Object.assign({}, c, { id }), deps: c.inputs.map((i) => i.from) });
  }
  for (let i = 0; i < tasks.length; i++) for (const d of tasks[i].deps) if (!ids.has(d)) return { ok: false, error: 'input_unknown', at: i };
  const cyc = cycleMembers(tasks.map((t) => t.contract));
  if (cyc.size) return { ok: false, error: 'input_cycle', at: Array.from(cyc)[0] };
  return { ok: true, tasks };
}

/* readyTasks(tasks) — the tasks that may start now: still `queued` and every task they name ended `done`/`partial`.
   `tasks` are { id, status, deps }. A queued task whose dependency ended any other way is returned in `blocked` — it
   will never start, and the runner ends it `failed / input_unavailable` (the page does the same in makeDelegation). */
export function readyTasks(tasks) {
  const by = new Map((tasks || []).map((t) => [t.id, t]));
  const ready = [], blocked = [];
  for (const t of tasks || []) {
    if (t.status !== 'queued') continue;
    const ds = (t.deps || []).map((d) => by.get(d));
    if (ds.some((d) => !d || d.status === 'failed' || d.status === 'cancelled' || d.status === 'refused')) blocked.push(t);
    else if (ds.every((d) => d.status === 'done' || d.status === 'partial')) ready.push(t);
  }
  return { ready, blocked };
}
