/* ============================================================================
 *  server-capability-lane — one capability, reached from a job's capability task AND from a worker that calls it itself
 *  (supabase/functions/_shared/atlas-server-caps.js, the tool loop of atlas-job-runner.js, js/atlas-job-core.js planJob)
 *
 *  ① the lane DISCOVERS what it can run: catalogue() is derived from the twins, every twin is of a read-only registry row, and a
 *     twin's id is the registry's id (one name, not a second vocabulary);
 *  ② the world-graph twins answer from the persisted graph only and say so; what needs the page is refused BY NAME;
 *  ③ planning: a worker's tools are held to the same lane as a capability task;
 *  ④ the tool loop: the model's call is run through the lane, its answer comes back in the next request, the same call twice is
 *     answered not run, the cost cap ends it, a cancelled job stops it, and a slice that ends mid-loop hands the task back WITH
 *     its progress so the next slice resumes at the next round (nothing paid twice).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { planJob } from '../js/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { SERVER_CAPS, makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const REG = makeAtlasCapabilities({}).all();

const NODE = { ref: 'port:rotterdam', type: 'port', name: 'Rotterdam', ids: { wikidata: 'Q34370' } };
const fakeWorldDb = (log = []) => ({
  rpc: async (name, args) => {
    log.push([name, args]);
    if (name === 'world_graph_find') return { data: args.p_q === 'Rotterdam' || args.p_q === 'port:rotterdam' ? [NODE] : [], error: null };
    if (name === 'world_graph_subgraph') return { data: { nodes: [NODE, { ref: 'company:apm', type: 'company', name: 'APM' }], edges: [{ id: 1, rel: 'operated_by', from_ref: 'port:rotterdam', to_ref: 'company:apm' }], claims: [{ id: 1, ref: 'port:rotterdam', key: 'teu', value: 1 }] }, error: null };
    return { data: null, error: { message: 'unknown rpc' } };
  },
});

/* ── ① ── */
test('the lane discovers its catalogue from the twins, and every twin is a read-only row of the registry under the same id', () => {
  const lane = makeServerCaps({ db: fakeWorldDb() });
  const cat = lane.catalogue();
  assert.deepEqual(cat.map((c) => c.id).sort(), Object.keys(SERVER_CAPS).sort(), 'the catalogue is the table, not a second list');
  assert.ok(cat.length >= 3);
  for (const c of cat) {
    assert.ok(typeof c.args === 'string' && c.args.length > 10, c.id + ' says how it is called');
    const row = REG.find((r) => r.id === c.id);
    assert.ok(row, c.id + ' is a registry capability');
    assert.equal(row.facets.mutatesState || row.facets.asksUser || row.facets.showsUI || row.facets.savesFile || row.facets.delegates, false, c.id + ' only reads');
    assert.equal(row.confirmation, 'none', c.id);
  }
});

test('a twin that reads the database refuses by name when the runtime has none', async () => {
  const r = await makeServerCaps({}).run('research.object', { name: 'Rotterdam' });
  assert.equal(r.code, 'no_db');
});

/* ── ② ── */
test('research.object: the persisted record with its claims, scoped; nothing found is not "does not exist"; the page-only argument is refused by name', async () => {
  const lane = makeServerCaps({ db: fakeWorldDb() });
  const hit = await lane.run('research.object', { name: 'Rotterdam' });
  assert.equal(hit.ok, true);
  assert.equal(hit.data.scope, 'persisted_world_graph');
  assert.equal(hit.data.object.ref, 'port:rotterdam');
  assert.equal(hit.data.claims.length, 1);
  const miss = await lane.run('research.object', { name: 'Nowhere' });
  assert.equal(miss.ok, true);
  assert.equal(miss.data.object, null);
  assert.match(miss.text, /not a claim that it does not exist/);
  assert.equal((await lane.run('research.object', { place: 'near the strait' })).code, 'part_unsupported_on_server');
  assert.equal((await lane.run('research.object', {})).code, 'needs_input');
});

test('research.related: follows the named ties to a depth, as of a date; proximity needs the page; a bad date is refused', async () => {
  const log = [];
  const lane = makeServerCaps({ db: fakeWorldDb(log) });
  const r = await lane.run('research.related', { ref: 'port:rotterdam', rels: ['operated_by'], depth: 9, at: '2020-06-30' });
  assert.equal(r.ok, true);
  assert.equal(r.data.nodes.length, 2);
  const sub = log.find((l) => l[0] === 'world_graph_subgraph')[1];
  assert.deepEqual(sub.p_rels, ['operated_by']);
  assert.equal(sub.p_depth, 3, 'depth is bounded as the MCP door bounds it');
  assert.equal(sub.p_at_ms, Date.parse('2020-06-30T00:00:00Z'));
  assert.equal((await lane.run('research.related', { ref: 'port:rotterdam', km: 50 })).code, 'part_unsupported_on_server');
  assert.equal((await lane.run('research.related', { ref: 'port:rotterdam', at: 'last year' })).code, 'bad_at');
  const typed = await lane.run('research.related', { ref: 'port:rotterdam', types: ['port'] });
  assert.deepEqual(typed.data.nodes.map((n) => n.ref), ['port:rotterdam'], 'a type filter keeps the start and what matches');
});

/* ── ③ ── */
test('planJob holds a worker\'s tools to the same lane: a tool with no twin is refused by name, at planning', () => {
  const lane = makeServerCaps({ db: fakeWorldDb() });
  const opts = { kinds: ['worker', 'capability'], capabilityOk: (id) => lane.has(id) };
  const ok = planJob([{ id: 'w', goal: 'who runs Rotterdam', tools: ['research.object', 'research.related'] }], opts);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.tasks[0].contract.tools, ['research.object', 'research.related']);
  const bad = planJob([{ id: 'w', goal: 'x', tools: ['research.object', 'map.flyTo'] }], opts);
  assert.equal(bad.error, 'capability_unsupported_on_server');
  assert.equal(bad.at, 0);
  assert.equal(planJob([{ goal: 'plain researcher' }], opts).ok, true, 'a worker with no tools is as before');
});

/* ── ④ ── */
function fakeDb(plan, o = {}) {
  const st = {
    job: { id: 'job1', user_id: 'u1', status: 'running', lease_holder: 'h1', cancel_requested: false, enabled: true, cap: o.cap ?? 10000000, spent: 0, reserved: 0, finished: null, amends: [], releases: 0 },
    tasks: new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key, progress: null, finishes: 0 }])),
    events: [], progressWrites: [], onCheckpoint: o.onCheckpoint || null,
  };
  const j = st.job;
  const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => { if (st.onCheckpoint) st.onCheckpoint(st); if (!mine(a.p_holder)) return [{ ok: false, action: 'lost', amends: [] }]; if (j.cancel_requested) return [{ ok: true, action: 'cancel', amends: [] }]; return [{ ok: true, action: 'go', amends: [] }]; },
    atlas_job_reserve: (a) => { if (!mine(a.p_holder) || j.spent + j.reserved + a.p_micros > j.cap) return false; j.reserved += a.p_micros; return true; },
    atlas_job_settle: (a) => { j.reserved = Math.max(0, j.reserved - a.p_reserved); j.spent += a.p_actual; return true; },
    atlas_job_task_start: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_progress: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.progress = a.p_progress; st.progressWrites.push(a.p_yield); if (a.p_yield) t.status = 'queued'; return true; },
    atlas_job_task_finish: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.status = a.p_status; t.code = a.p_code; t.result = a.p_result; t.finishes += 1; t.cost = a.p_cost; t.calls = a.p_calls; return true; },
    atlas_job_task_block: () => true,
    atlas_job_finish: (a) => { if (!mine(a.p_holder)) return false; j.status = a.p_status; j.finished = { status: a.p_status, reason: a.p_stop_reason, result: a.p_result }; j.lease_holder = null; return true; },
    atlas_job_release: (a) => { if (!mine(a.p_holder)) return false; j.lease_holder = null; j.releases += 1; return true; },
  };
  return {
    st,
    rpc: async (name, args) => ({ data: rpcs[name](args), error: null }),
    from: (table) => ({ select: () => ({ eq: async () => ({ data: table === 'atlas_job_tasks' ? Array.from(st.tasks.values()).map((t) => ({ ...t })) : [], error: null }) }), insert: async (row) => { st.events.push(row); return { error: null }; } }),
  };
}
const usage = { input: 1000, cached_read: 0, output: 500 };
const asksFor = (...calls) => ({ text: JSON.stringify({ calls }), usage, citations: [] });
const answers = (summary) => ({ text: JSON.stringify({ summary, findings: [{ claim: summary }], gaps: [] }), usage, citations: [] });
const money = { estimate: () => 100000, actual: () => 50000 };
const runWith = (db, callModel, extra = {}) => runJob({ db, job: db.st.job, holder: 'h1', callModel, money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: makeServerCaps({ db: fakeWorldDb() }), ...extra });
const toolPlan = () => planJob([{ id: 'w', goal: 'who operates Rotterdam', tools: ['research.object', 'research.related'] }], { kinds: ['worker'], capabilityOk: () => true }).tasks;

test('the tool loop: the model asks, the lane runs it, the answer is in the next request, the final answer ends the task', async () => {
  const db = fakeDb(toolPlan());
  const prompts = [];
  const r = await runWith(db, async (sys, prompt) => {
    prompts.push(prompt);
    if (prompts.length === 1) return asksFor({ capability: 'research.object', args: { name: 'Rotterdam' } });
    if (prompts.length === 2) return asksFor({ capability: 'research.related', args: { ref: 'port:rotterdam', rels: ['operated_by'] } }, { capability: 'research.object', args: { name: 'Rotterdam' } });
    return answers('APM operates it');
  });
  assert.equal(r.outcome, 'finished');
  assert.match(prompts[0], /TOOLS YOU MAY CALL[\s\S]*research\.object[\s\S]*research\.related/);
  assert.doesNotMatch(prompts[0], /TOOL ANSWERS SO FAR/);
  assert.match(prompts[1], /TOOL ANSWERS SO FAR[\s\S]*\[1\] research\.object[\s\S]*Rotterdam/);
  assert.match(prompts[2], /\[2\] research\.related/);
  assert.doesNotMatch(prompts[2], /\[3\]/, 'the repeated call was not run a second time');
  assert.match(prompts[2], /YOU REPEATED A CALL: answer \[1\]/, 'and the model is told where its answer is');
  const t = db.st.tasks.get('w');
  assert.equal(t.status, 'done');
  assert.equal(t.result.toolCalls, 2);
  assert.equal(t.calls, 3, 'three model requests');
  assert.equal(t.cost, 150000);
  assert.equal(db.st.job.reserved, 0);
  assert.equal(db.st.events.filter((e) => e.kind === 'task.tool_call').length, 2);
  assert.equal(db.st.job.finished.status, 'done');
});

test('a tool outside the grant is answered "not one of your tools" and is not run; a failed tool is data, not the end', async () => {
  const log = [];
  const db = fakeDb(toolPlan());
  let n = 0;
  await runWith(db, async (sys, prompt) => {
    n += 1;
    if (n === 1) return asksFor({ capability: 'map.flyTo', args: { lat: 1 } }, { capability: 'research.object', args: {} });
    log.push(prompt);
    return answers('done anyway');
  });
  assert.match(log[0], /map\.flyTo[^\n]*FAILED not_granted/);
  assert.match(log[0], /research\.object[^\n]*FAILED needs_input/);
  assert.equal(db.st.tasks.get('w').status, 'done');
});

test('a round that brings nothing new twice is told to answer now, and the call it makes then is not honoured', async () => {
  const db = fakeDb(toolPlan());
  const prompts = [];
  await runWith(db, async (sys, prompt) => {
    prompts.push(prompt);
    if (prompts.length <= 4) return asksFor({ capability: 'research.object', args: { name: 'Rotterdam' } });
    return answers('ok');
  });
  assert.match(prompts[3], /YOU HAVE ALL THE ANSWERS/, 'after two rounds of repeats the instruction changes');
  assert.equal(db.st.tasks.get('w').status, 'done');
  assert.equal(db.st.tasks.get('w').result.toolCalls, 1, 'run once');
});

test('the cost cap ends the loop, with no further request', async () => {
  const db = fakeDb(toolPlan(), { cap: 250000 });
  let n = 0;
  await runWith(db, async () => { n += 1; return asksFor({ capability: 'research.object', args: { name: 'R' + n } }); });
  const t = db.st.tasks.get('w');
  assert.equal(t.status, 'refused');
  assert.equal(t.code, 'cost_cap');
  assert.equal(n, 4, 'four rounds fit under a 250k cap (each reserves 100k and settles 50k: 0, 50, 100, 150 spent); the fifth reservation was refused before any request');
  assert.equal(db.st.job.reserved, 0);
});

test('a cancelled job stops the loop at the next round', async () => {
  const db = fakeDb(toolPlan(), { onCheckpoint: (st) => { if (st.progressWrites.length >= 1) st.job.cancel_requested = true; } });
  let n = 0;
  await runWith(db, async () => { n += 1; return asksFor({ capability: 'research.object', args: { name: 'R' + n } }); });
  assert.equal(n, 1);
  assert.equal(db.st.tasks.get('w').status, 'cancelled');
});

test('a slice that ends mid-loop hands the task back WITH its progress; the next slice resumes at the next round and nothing is paid twice', async () => {
  const db = fakeDb(toolPlan());
  let clock = 0;
  const seen = [];
  const model = async (sys, prompt) => {
    seen.push(prompt);
    clock += 40000;   /* each request takes longer than the slice's budget */
    return seen.length === 1 ? asksFor({ capability: 'research.object', args: { name: 'Rotterdam' } }) : answers('resumed');
  };
  const r1 = await runWith(db, model, { now: () => clock });
  assert.equal(r1.outcome, 'more', 'the slice releases the job for the next one');
  const t = db.st.tasks.get('w');
  assert.equal(t.status, 'queued', 'the task was handed back');
  assert.equal(t.progress.entries.length, 1);
  assert.equal(t.progress.calls, 1);
  assert.deepEqual(db.st.progressWrites, [true]);
  db.st.job.lease_holder = 'h1';   /* the next slice claims the job */
  const r2 = await runWith(db, model, { now: () => clock });
  assert.equal(r2.outcome, 'finished');
  assert.match(seen[1], /TOOL ANSWERS SO FAR[\s\S]*\[1\] research\.object/, 'the second slice starts from the first one\'s answers');
  assert.equal(seen.length, 2, 'the answered call was not asked for again');
  assert.equal(db.st.tasks.get('w').status, 'done');
  assert.equal(db.st.tasks.get('w').calls, 2);
  assert.equal(db.st.tasks.get('w').finishes, 1);
});

test('a worker whose tools the host cannot run is refused by name and nothing is requested', async () => {
  const db = fakeDb(toolPlan());
  let n = 0;
  await runWith(db, async () => { n += 1; return answers('x'); }, { capabilities: { has: () => false, catalogue: () => [], run: async () => ({ ok: false }) } });
  assert.equal(n, 0);
  assert.equal(db.st.tasks.get('w').status, 'refused');
  assert.equal(db.st.tasks.get('w').code, 'capability_unsupported_on_server');
});
