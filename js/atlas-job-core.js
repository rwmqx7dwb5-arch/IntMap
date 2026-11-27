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

/* ══ (atlas-child-loop-reuse) DOES AN EARLIER ANSWER TO THE SAME CALL STILL ANSWER IT? ═══════════════════════════════════════════════════════════
   A worker's loop answers a repeat of a call (the same capability, the same arguments) from the first answer instead of running it again
   (one-pass-or-a-reason §1 — «もう済んでいる»). It did so for EVERY first answer, a refusal included, so a worker that asked in ONE request to
   search for `data.value` and to read Japan's population with it was refused the read (the grant did not hold it yet: «call it in your next
   request»), and when it did exactly that in the next request it was handed the same refusal — the read never ran (measured 2026-11-27,
   external audit: 0 real fetches). The reason an answer was given decides whether it still holds:
     · `ok`         — a success: it holds (the same read, the same answer).
     · 'grant'      — refused because the grant did not hold the capability: it holds only while the grant still does not.
     · 'transient'  — the capability or the fetch failed for a reason of the moment (it threw, or it said `category:'transient'`): it does not
                      hold — the next call is a retry after an OBSERVED failure (one-pass-or-a-reason §5).
     · otherwise    — the capability's own answer (no such row, a bad argument): it holds; the same call gets the same answer.
   ONE rule for the page's worker (js/atlas-delegate.js) and the server's (supabase/functions/_shared/atlas-job-runner.js). */
export function priorStands(prior, grantHasIt) {
  if (!prior) return false;
  if (prior.ok) return true;
  if (prior.why === 'grant') return !grantHasIt;
  if (prior.why === 'transient') return false;
  return true;
}
/* failureWhy(out) → 'transient' | '' — what a capability's FAILED answer says of itself: a result that declares its failure to be of the moment
   (`category:'transient'` in its meta or on itself) is one; anything else is the capability's own answer. A thrown call is the caller's to name. */
export function failureWhy(out) {
  if (!out || out.ok !== false) return '';
  const m = out.meta && typeof out.meta === 'object' ? out.meta : {};
  /* `retryable:true` beside a category other than 'input' says the same (an 'input' failure is retried with OTHER arguments, which is a different call) */
  const cat = m.category || out.category;
  return (cat === 'transient' || ((m.retryable === true || out.retryable === true) && cat !== 'input')) ? 'transient' : '';
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
  const tools = Array.from(new Set((Array.isArray(c.tools) ? c.tools : []).map((x) => s(x, 80)).filter(Boolean)));   /* no count: a grant is every id the parent named (each is still held to read-only by the executor) */
  /* (model-options) the model THIS piece asks to run on — one of the ids the server offers (policy.models); absent = the server's configured tier. The server decides whether it is offered. */
  const model = s(c.model, 80);
  /* (worker-reach) THE IMAGES THIS WORKER IS TO SEE, by the names the parent already holds them under: an attachment of the reader's
     (the name the attachment ledger gives it — js/atlas-attach-log.js) or IMAGE_VIEW for the map frames the parent captured this turn.
     Which names resolve, and to what, is the executor's (js/atlas-delegate.js resolveTaskImages); no count — every name is kept. */
  const images = Array.from(new Set((Array.isArray(c.images) ? c.images : []).map((x) => s(x, 200)).filter(Boolean)));
  /* (worker-reach) THE MOST THIS WORKER MAY WRITE IN ONE ANSWER, in output tokens, when the parent states it — handed to ai-proxy as
     maxOutputHint, which raises the task's budget up to the model's documented ceiling and never below the task's own (tasks/spec.ts
     hintedMaxOutput). Absent = the task's budget (tasks/atlas_delegate.ts). Anything that is not a positive whole number is not a size. */
  const maxOutput = Number.isInteger(c.maxOutput) && c.maxOutput > 0 ? c.maxOutput : 0;
  /* (delegate-effort) HOW HARD THIS WORKER THINKS, when the parent says: one of the words ai-proxy reads in `effortHint` (low … xhigh),
     chosen by the model for THIS piece (a lookup needs less than a judgement). Absent = the task's own default. The server decides what it
     applies (tasks/atlas_delegate.ts effortHint). A word that is not one of them is no effort, not an error. */
  const effort = EFFORT_WORDS.includes(String(c.effort || '').toLowerCase()) ? String(c.effort).toLowerCase() : '';
  return { ok: true, contract: Object.assign({ id: s(c.id, 64), kind, goal, returns: s(c.returns, 600), inputs }, tools.length ? { tools } : null, model ? { model } : null, images.length ? { images } : null, maxOutput ? { maxOutput } : null, effort ? { effort } : null) };
}

const EFFORT_WORDS = ['low', 'medium', 'high', 'xhigh'];   /* the words ai-proxy reads in effortHint (js/atlas-effort.js MODES without 'auto') */

/* (worker-reach) the name a contract's `images` uses for the map frames the parent captured in this turn (view.inspect) */
export const IMAGE_VIEW = '@view';

/* the identity of a piece of work: what it is asked to do and from what — not the id it was given. What it is shown (`images`) and how
   much it may write (`maxOutput`) are part of it — the same goal asked again with a larger budget after a cut-off answer must run again,
   not be answered from the cut one — and are appended only when present, so every contract without them keeps the key it always had. */
export function contractKey(c) {
  const k = [c.kind || 'worker', c.goal, c.returns, (c.inputs || []).map((i) => i.from).sort(), c.capability || '', c.args || null, (c.tools || []).slice().sort(), c.model || ''];
  if ((c.images && c.images.length) || c.maxOutput) k.push((c.images || []).slice(), c.maxOutput || 0);
  if (c.effort) k.push('effort:' + c.effort);   /* the same piece asked to think harder is a different request */
  return stable(k);
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
  'When you may call IntMap capabilities, put every call that does not need another call\'s answer in the SAME request: they are run together and all their answers come back in your next request. Make a call wait for a later request only when its arguments depend on an answer you do not have yet.',
  'You return EVIDENCE, not a conclusion: Atlas weighs what you found against what the other workers found and decides; a verdict of yours would decide for it. Quote rather than paraphrase, and report what you looked for and did not find as plainly as what you found.',
  'Return ONE JSON object and nothing else: {"summary": string (what you did — what you looked for, where, and what came back; NOT an answer to the question), "findings": [{"claim": string (what the source states, as it states it), "source": string (the URL; the outlet or publication when there is no URL; or the id of the IntMap capability you called), "excerpt": string (the source\'s own words, verbatim, or the raw values the capability returned — the part the claim rests on), "date"?: string (the date the source gives), "place"?: string, "lat"?: number, "lon"?: number, "verdict"?: "supported"|"unsupported"|"contradicted" (ONLY when you were asked to check a claim another worker made: repeat that claim verbatim in "claim")}], "notFound": [{"looked": string (what you looked for), "where": string (the searches, sites or capabilities you looked in)}] (what you looked for and did not find), "gaps": [string] (what you could not establish, and why), "facts"?: [{"subject": {"name"?: string (in the language of your source), "ids"?: {"wikidata"?: "Q…", "osm"?: "node/…"} (ONLY ids you read from a source), "ref"?: string}, "attribute": string, "value": number|string|boolean, "unit"?: string, "at"?: string (the date the value is ABOUT), "source"?: string (URL), "retrievedAt"?: string, "scope"?: "admin-area"|"metro-area"|"radius"|"grid-cell"|"point"|"facility"|"company"|"global" (what the figure is a measurement OF), "basis"?: "present-day"|"as-of-time" (the borders it was counted in), "period"?: {"from": string, "to": string} (the span a total covers), "aggregation"?: "sum"|"mean"|"median"|"min"|"max"}] (the same claims as data, one per figure or stated attribute: Atlas matches them across workers by object and attribute, so state the object by its identifiers when you have them and give the unit exactly as the source does; state scope, basis, period and aggregation ONLY when the source says them: two figures that differ are only a disagreement if they measure the same thing, and a field you leave out is reported as not stated, not as equal)}. A finding without both "source" and "excerpt" is your own statement, and Atlas is told it carries no evidence.',
].join('\n');
}

/* extra — what the reader changed while the work was running (server jobs): the latest instructions, which outrank the contract where they differ */
/* ══ WHAT A WORKER IS HANDED OF ANOTHER WORKER'S RESULT — a manifest and the whole, not the first 12,000 characters ══════════════════════════
   The input used to be `JSON.stringify(...).slice(0, 12000)`: a 1,251-row table stopped in the middle of row 96 and the worker answered as if the
   table had ended there (measured 2026-11-27). The cut is now stated and the rest is kept:
     · an input that fits is given whole, exactly as before;
     · a larger one is given as a MANIFEST (which task, a version digest of the exact bytes, how many rows and which columns the table has, how many
       findings) followed by as much of it as fits, and — where the worker can read (`opts.read`: the page's delegation keeps the whole under `ref`) —
       the way to read any range of the rest. A reader that cannot (the server runner) is told how many characters it did not see, so it says so in
       `gaps` instead of treating a prefix as the whole.
   `inputView(i, {read})` → { text, ref, whole } — `whole` is the full text when it was cut (the caller keeps it under `ref`), else null. */
const INPUT_SHOW_CHARS = 12000;
function tableOf(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    let best = null;
    Object.keys(data).forEach((k) => { const v = data[k]; if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && (!best || v.length > best.length)) best = v; });
    return best;
  }
  return null;
}
export function inputView(i, o) {
  const whole = JSON.stringify({ summary: i.summary, findings: i.findings, gaps: i.gaps, data: i.data });
  if (whole.length <= INPUT_SHOW_CHARS) return { text: whole, ref: '', whole: null };
  const ref = 'input:' + String(i.from);
  let h = 5381; for (let k = 0; k < whole.length; k++) h = ((h * 33) ^ whole.charCodeAt(k)) >>> 0;
  const rows = tableOf(i.data);
  const manifest = { task: String(i.from), version: h.toString(36), chars: whole.length, findings: Array.isArray(i.findings) ? i.findings.length : 0,
    rows: rows ? rows.length : undefined, columns: (rows && rows[0] && typeof rows[0] === 'object') ? Object.keys(rows[0]).slice(0, 40) : undefined };
  const room = INPUT_SHOW_CHARS - 600;
  const tail = (o && o.read)
    ? '\n[characters 0-' + room + ' of ' + whole.length + ' shown — nothing was dropped: read any other range with {"capability":"read_step","args":{"ref":"' + ref + '","offset":N,"length":L}}]'
    : '\n[only characters 0-' + room + ' of ' + whole.length + ' are shown; the rest was NOT given to you — do not treat what is shown as the whole, and say in "gaps" what you could not see]';
  return { text: 'MANIFEST ' + JSON.stringify(manifest) + '\n' + whole.slice(0, room) + tail, ref, whole };
}

export function workerPrompt(task, extra, opts) {
  let p = 'YOUR PIECE OF THE WORK:\n' + task.goal;
  if (task.returns) p += '\n\nWHAT ATLAS NEEDS BACK:\n' + task.returns;
  (task.inputs || []).forEach((i) => {
    const v = inputView(i, { read: !!(opts && opts.read) });
    p += '\n\nWHAT ANOTHER WORKER FOUND (task "' + i.from + '") — build on it, do not repeat it:\n' + v.text;
  });
  if (Array.isArray(extra) && extra.length) p += '\n\nTHE READER CHANGED THE REQUEST WHILE THIS WAS RUNNING — their latest instructions, oldest first; they outrank the piece above wherever they differ:\n' + extra.map((x, i) => (i + 1) + '. ' + s(x, 1000)).join('\n');
  return p + '\n\nToday is ' + new Date().toISOString().slice(0, 10) + '.';
}

/* shapeOf(data, normalizeFacts?) → { ok, out } | { ok:false, why } — the worker's answer held to the shape it was asked for.
   `normalizeFacts` is the host's reader of the `facts` list (the page passes js/atlas-fact-merge.js; it needs the geo-object module, which has no
   server twin yet). Without one, `facts` is [] — a server job carries findings, not matched facts. */
export function shapeOf(data, normalizeFacts) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, why: 'the answer was not a JSON object' };
  if (typeof data.summary !== 'string' || !data.summary.trim()) return { ok: false, why: '"summary" was missing or empty' };
  if (data.findings != null && !Array.isArray(data.findings)) return { ok: false, why: '"findings" was not an array' };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const findings = (data.findings || []).filter((f) => f && typeof f === 'object' && typeof f.claim === 'string' && f.claim.trim()).map((f) => {
    const lat = num(f.lat), lon = num(f.lon);
    const ll = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const verdict = (f.verdict === 'supported' || f.verdict === 'unsupported' || f.verdict === 'contradicted') ? f.verdict : undefined;
    return { id: f.id ? s(f.id, 80) : undefined, claim: s(f.claim, 800), verdict, place: f.place ? s(f.place, 200) : undefined, lat: ll ? lat : undefined, lon: ll ? lon : undefined, date: f.date ? s(f.date, 40) : undefined, source: f.source ? s(f.source, 500) : undefined, excerpt: excerptOf(f.excerpt) };
  });
  /* (atlas-parallel-truth) EVIDENCE IS COUNTED, NOT ASSUMED. A finding is evidence when it names a source AND carries the excerpt
     (or raw values) it rests on; anything else is the worker's own statement. A reply with none — a prose verdict, however well
     written — is still returned (Atlas may read it), but evidence.none is true and a gap says so, so it is never taken as sourced. */
  const notFound = (Array.isArray(data.notFound) ? data.notFound : [])
    .map((x) => (typeof x === 'string' ? { looked: s(x, 400) } : (x && typeof x === 'object' ? { looked: s(x.looked, 400), where: x.where ? s(x.where, 400) : undefined } : null)))
    .filter((x) => x && x.looked);
  const sourced = findings.filter((f) => findingBasis(f).evidenced).length;
  const evidence = { findings: findings.length, sourced, unsourced: findings.length - sourced, notFound: notFound.length, none: sourced === 0 };
  const gaps = Array.isArray(data.gaps) ? data.gaps.map((g) => s(g, 400)).filter(Boolean) : [];
  if (evidence.none) gaps.push(findings.length
    ? 'None of this worker\'s ' + findings.length + ' finding(s) carries a source together with the excerpt or raw values it rests on: what it says is its own statement, not evidence.'
    : 'This worker returned no finding with a source and an excerpt: its summary is its own statement, not evidence.');
  else if (evidence.unsourced) gaps.push(evidence.unsourced + ' of this worker\'s findings carry no source with an excerpt: those are its own statements, not evidence.');
  return { ok: true, out: Object.assign({ summary: s(data.summary, 4000), findings }, typeof normalizeFacts === 'function' ? { facts: normalizeFacts(data.facts) } : null, { notFound, evidence, gaps }) };
}

/* findingBasis(f) — THE ONE JUDGEMENT of whether a finding carries evidence, for the worker's own tally (shapeOf below) and for the turn's measurements
   (js/atlas-turn-metrics.js): both used to decide it separately and disagreed on a finding that names an outlet and holds no words of the source
   (the worker counted 0 sourced, the answer's tally 1 grounded). `cited` — it names where it came from. `evidenced` — and it holds what the source says
   (the excerpt, or the raw values a capability returned). A name with nothing behind it is cited, not evidenced. */
export function findingBasis(f) {
  const x = f && typeof f === 'object' ? f : {};
  const first = Array.isArray(x.sources) && x.sources.length ? x.sources[0] : '';
  const source = s(x.source || x.url || (first && typeof first === 'object' ? first.url : first), 500);
  const ex = x.excerpt != null && x.excerpt !== '' ? x.excerpt : x.values;
  const held = ex == null || ex === '' ? false : (typeof ex === 'string' ? !!ex.trim() : (typeof ex === 'object' ? Object.keys(ex).length > 0 : true));
  return { cited: !!source, evidenced: !!source && held, source };
}

/* an excerpt is the source's words, or the raw values a capability returned: a string is kept as it is, anything else is written as JSON */
function excerptOf(x) {
  if (x == null || x === '') return undefined;
  if (typeof x === 'string') return x.trim() ? s(x, 2000) : undefined;
  let j = '';
  try { j = stable(x); } catch (_) { j = ''; }
  return j ? s(j, 2000) : undefined;
}

/* ══ PLANNING A LIST OF CONTRACTS INTO A JOB  (atlas-durable-jobs) ═══════════════════════════════════
   planJob(contracts, { kinds? }) → { ok, tasks:[{ id, key, contract, deps }] } | { ok:false, error, at? }
   The same rules makeDelegation applies at run time, applied once up front so that a job the server accepts is one it can
   finish: every contract normalises, every id is unique, every input names a task of THIS list, the inputs lead nowhere
   in a circle, and nothing is the same work twice (the second start of one contract is the first — `reused`, not run again).
   `kinds` — what this runner can execute (default `worker` only). `capabilityOk(id)` — for a `capability` task, whether this
   runner has a twin of that capability (supabase/functions/_shared/atlas-server-caps.js): one it has not is refused by name
   (`capability_unsupported_on_server`) here, at planning, rather than started and failed there. */
export function planJob(contracts, o) {
  const kinds = (o && Array.isArray(o.kinds)) ? o.kinds : ['worker'];
  const list = Array.isArray(contracts) ? contracts : [];
  if (!list.length) return { ok: false, error: 'no_tasks' };
  const norm = [];
  const runnable = (id) => !!(o && typeof o.capabilityOk === 'function' && o.capabilityOk(id));
  /* a capability that changes the map or the session is SAVED by the job and applied by the page (js/atlas-server-class.js) — a capability TASK may name one; a worker's own tool may not (the model loop needs the answer now) */
  const parkable = (id) => !!(o && typeof o.parkable === 'function' && o.parkable(id));
  for (let i = 0; i < list.length; i++) {
    const nc = normaliseContract(list[i]);
    if (!nc.ok) return { ok: false, error: nc.error, at: i };
    if (!kinds.includes(nc.contract.kind)) return { ok: false, error: 'kind_unsupported', at: i };
    if (nc.contract.kind === 'capability' && !runnable(nc.contract.capability) && !parkable(nc.contract.capability)) return { ok: false, error: 'capability_unsupported_on_server', at: i };
    /* a worker's granted tools are run by the same lane: one the runner has no twin of is refused by name here, not found missing in the middle of a model loop */
    if (nc.contract.kind === 'worker' && (nc.contract.tools || []).some((t) => !runnable(t))) return { ok: false, error: 'capability_unsupported_on_server', at: i };
    /* (worker-reach) what a runner does not carry to its model is refused by name, not dropped: the page's attachments and map frames
       are not on a server, and a runner hands `maxOutput` on only when it says so (`o.images` / `o.maxOutput`) */
    if (nc.contract.kind === 'worker' && nc.contract.images && !(o && o.images === true)) return { ok: false, error: 'images_unsupported_on_server', at: i };
    if (nc.contract.kind === 'worker' && nc.contract.maxOutput && !(o && o.maxOutput === true)) return { ok: false, error: 'output_size_unsupported_on_server', at: i };
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
