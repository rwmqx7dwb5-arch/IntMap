/* ============================================================================
 *  atlas-jobs-atlas — durable jobs reached from Atlas (js/atlas-cap-jobs.js, js/atlas-jobs-client.js,
 *  supabase/functions/_shared/atlas-server-caps.js, the capability lane of atlas-job-runner.js)
 *
 *  ① the four `jobs.*` capabilities are in the registry with the facts they claim (start delegates and is not confirm-free
 *     after outside text; status only reads; cancel/amend touch only the reader's own job);
 *  ② a capability task runs on the server ONLY through a twin in atlas-server-caps.js, and every twin is of a registry row that
 *     is read-only — nothing that writes, asks or shows something runs without the page's guards;
 *  ③ the runner runs a capability task once, at no cost, hands its data to the task that builds on it, and refuses one with no twin
 *     before anything runs; planning refuses it by name;
 *  ④ the page client: the idempotency key, the card shows each piece as it ends, Stop/amend exist only while the job runs,
 *     a failed refresh is not a finished job.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { planJob, workerPrompt } from '../js/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { SERVER_CAPS, serverCapabilityIds, makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { planDigest, jobFacts, jobText, renderJobCard, makeJobsClient } from '../js/atlas-jobs-client.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/safe-html.js');   /* the page's one encoder (globalThis.IntMapSafe), which renderJobCard calls */
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});
const get = (id) => CAPS.all().find((c) => c.id === id);

/* ── ① ── */
test('the four jobs.* capabilities are registered, with what each does stated as facts', () => {
  for (const id of ['jobs.start', 'jobs.status', 'jobs.cancel', 'jobs.amend']) assert.ok(get(id), id + ' is in the registry');
  assert.equal(get('jobs.start').facets.delegates, true, 'starting a job starts other model work');
  assert.equal(get('jobs.start').confirmation, 'explicit', 'it spends the project\'s money with nobody watching: asked after outside text has been seen');
  const st = get('jobs.status');
  assert.equal(st.facets.mutatesState, false);
  assert.equal(st.ingests, 'external', 'a finished piece is a worker\'s words from the open web');
  for (const id of ['jobs.cancel', 'jobs.amend']) assert.equal(get(id).confirmation, 'none', id + ' only touches the reader\'s own job and is undone by starting again');
});

/* ── ② ── */
test('every server twin is of a registry row that only reads (so it may run with no page)', () => {
  const ids = serverCapabilityIds();
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const c = get(id);
    assert.ok(c, id + ' is a capability of the registry');
    assert.deepEqual(c.facets, { mutatesState: false, network: c.facets.network, asksUser: false, showsUI: false, savesFile: false, delegates: false }, id + ' must change, ask, show, save and delegate nothing');
    assert.equal(c.confirmation, 'none', id);
    assert.equal(SERVER_CAPS[id].id, id);
  }
});

const kpRows = [{ time_tag: '2026-11-20T00:00:00', kp: '2.33', observed: 'observed' }, { time_tag: '2026-11-20T03:00:00', kp: '3.67', observed: 'observed' }, { time_tag: '2026-11-20T06:00:00', kp: '5.00', observed: 'predicted' }, { time_tag: 'x', kp: null }];
const fakeFetch = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });

test('sim.spaceWeather twin: kp is answered from the feed; another part is refused by name; upstream failures carry their code', async () => {
  const ok = await makeServerCaps({ fetch: fakeFetch(200, kpRows) }).run('sim.spaceWeather', { part: 'kp' });
  assert.equal(ok.ok, true);
  assert.match(ok.text, /observed at 2026-11-20T03:00:00Z: 3\.7/);
  assert.equal(ok.data.kp.length, 3, 'a row with no Kp is dropped, as the page does');
  assert.ok(ok.sources[0].url.startsWith('https://services.swpc.noaa.gov/'));
  const other = await makeServerCaps({ fetch: fakeFetch(200, kpRows) }).run('sim.spaceWeather', { part: 'neo' });
  assert.equal(other.code, 'part_unsupported_on_server');
  assert.equal((await makeServerCaps({ fetch: fakeFetch(200, kpRows) }).run('sim.spaceWeather', {})).code, 'part_unsupported_on_server', 'all is not quietly answered as kp');
  assert.equal((await makeServerCaps({ fetch: fakeFetch(503, null) }).run('sim.spaceWeather', { part: 'kp' })).code, 'upstream_503');
  assert.equal((await makeServerCaps({ fetch: fakeFetch(200, { not: 'rows' }) }).run('sim.spaceWeather', { part: 'kp' })).code, 'upstream_shape');
  assert.equal((await makeServerCaps({ fetch: async () => { throw new Error('net'); } }).run('sim.spaceWeather', { part: 'kp' })).code, 'upstream_unreachable');
  assert.equal((await makeServerCaps({}).run('view.flyTo', {})).code, 'capability_unsupported_on_server');
});

/* ── ③ ── */
test('planning: a capability task is accepted only for a capability the server has a twin of', () => {
  const caps = makeServerCaps({ fetch: fakeFetch(200, kpRows) });
  const o = { kinds: ['worker', 'capability'], capabilityOk: (id) => caps.has(id) };
  const ok = planJob([{ id: 'kp', kind: 'capability', capability: 'sim.spaceWeather', args: { part: 'kp' } }, { id: 'sum', goal: 'explain', inputs: [{ from: 'kp' }] }], o);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.tasks[1].deps, ['kp']);
  assert.equal(planJob([{ kind: 'capability', capability: 'view.flyTo', args: {} }], o).error, 'capability_unsupported_on_server');
  assert.equal(planJob([{ kind: 'capability', capability: 'sim.spaceWeather', args: {} }]).error, 'kind_unsupported', 'a host that did not say it runs capabilities refuses them');
});

function fakeDb(plan) {
  const j = { id: 'job1', user_id: 'u1', status: 'running', lease_holder: 'h1', finished: null };
  const tasks = new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key, finishes: 0, cost: 0 }]));
  const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => (mine(a.p_holder) ? [{ ok: true, action: 'go', amends: [] }] : [{ ok: false, action: 'lost', amends: [] }]),
    atlas_job_reserve: () => true, atlas_job_settle: () => true,
    atlas_job_task_start: (a) => { const t = tasks.get(a.p_task); if (!t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_finish: (a) => { const t = tasks.get(a.p_task); if (!t || t.status !== 'running') return false; Object.assign(t, { status: a.p_status, code: a.p_code, result: a.p_result, cost: a.p_cost }); t.finishes++; return true; },
    atlas_job_task_block: (a) => { const t = tasks.get(a.p_task); t.status = 'failed'; t.code = a.p_code; return true; },
    atlas_job_finish: (a) => { j.status = a.p_status; j.finished = { status: a.p_status, result: a.p_result }; return true; },
    atlas_job_release: () => true,
  };
  return { j, tasks, events: [], rpc: async (n, a) => ({ data: rpcs[n](a), error: null }),
    from() { return { select: () => ({ eq: async () => ({ data: Array.from(tasks.values()).map((t) => ({ ...t })), error: null }) }), insert: async (r) => { this.events.push(r); return { error: null }; } }; } };
}
const money = { estimate: () => 1, actual: () => 7 };
const ctx = (db, over) => ({ db, job: db.j, holder: 'h1', money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', ...over });

test('the runner runs a capability task once at no cost and hands its data to the task that builds on it', async () => {
  const caps = makeServerCaps({ fetch: fakeFetch(200, kpRows) });
  const plan = planJob([{ id: 'kp', kind: 'capability', capability: 'sim.spaceWeather', args: { part: 'kp' } }, { id: 'sum', goal: 'explain the Kp', inputs: [{ from: 'kp' }] }], { kinds: ['worker', 'capability'], capabilityOk: (id) => caps.has(id) }).tasks;
  const db = fakeDb(plan);
  const prompts = [];
  const r = await runJob(ctx(db, { capabilities: caps, callModel: async (s, p) => { prompts.push(p); return { text: JSON.stringify({ summary: 'Kp rose', findings: [], gaps: [] }), usage: {}, citations: [], model: 'm' }; } }));
  assert.equal(r.outcome, 'finished');
  assert.equal(db.tasks.get('kp').status, 'done');
  assert.equal(db.tasks.get('kp').cost, 0, 'a capability task costs nothing');
  assert.equal(db.tasks.get('kp').finishes, 1);
  assert.equal(prompts.length, 1, 'only the worker task asked the model');
  assert.match(prompts[0], /WHAT ANOTHER WORKER FOUND \(task "kp"\)[\s\S]*Planetary Kp[\s\S]*"kp":\[/, 'the twin\'s text AND data reach the next task');
  assert.equal(db.j.finished.status, 'done');
});

test('a capability task with no twin is refused before anything runs, and a failed twin is failed once, not repeated', async () => {
  const plan = planJob([{ id: 'x', kind: 'capability', capability: 'view.flyTo', args: {} }], { kinds: ['capability'], capabilityOk: () => true }).tasks;
  const db = fakeDb(plan);
  let calls = 0;
  await runJob(ctx(db, { capabilities: { has: () => false, run: async () => { calls++; return { ok: true }; } } }));
  assert.equal(calls, 0);
  assert.equal(db.tasks.get('x').status, 'refused');
  assert.equal(db.tasks.get('x').code, 'capability_unsupported_on_server');
  const plan2 = planJob([{ id: 'y', kind: 'capability', capability: 'sim.spaceWeather', args: { part: 'kp' } }], { kinds: ['capability'], capabilityOk: () => true }).tasks;
  const db2 = fakeDb(plan2);
  let n = 0;
  await runJob(ctx(db2, { capabilities: makeServerCaps({ fetch: async () => { n++; return { ok: false, status: 503, json: async () => null }; } }) }));
  assert.equal(n, 1, 'one request — a failure observed once is reported, not retried behind the reader\'s back');
  assert.equal(db2.tasks.get('y').status, 'failed');
  assert.equal(db2.tasks.get('y').code, 'upstream_503');
  assert.equal(db2.j.finished.status, 'failed');
});

/* ── ④ ── */
const L = (en) => en, esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jobRow = (o) => ({ id: 'job1', title: 'T', status: 'running', stop_reason: '', tasks_total: 2, tasks_done: 1, amend_count: 1, spent_micros: 12000, cost_cap_micros: 1000000, created_at: 'now', result: null, error: '', ...o });
const taskRows = [
  { task_id: 'a', status: 'done', code: '', deps: [], contract: { kind: 'worker', goal: 'find A' }, result: { summary: 'A is 1', findings: [{ claim: 'x' }], gaps: ['no B'], sources: [{ url: 'https://example.test/a', title: 'A src' }] }, cost_micros: 12000 },
  { task_id: 'b', status: 'running', code: '', deps: ['a'], contract: { kind: 'worker', goal: 'use A' }, result: null, cost_micros: 0 },
];

test('a running job shows the pieces that already ended, and offers Stop and a note box only while it runs', () => {
  const f = jobFacts(jobRow(), taskRows);
  assert.equal(f.running, true);
  assert.equal(f.tasksEnded, 1);
  assert.equal(f.tasks[0].summary, 'A is 1', 'the first piece is readable before the last one ends');
  const html = renderJobCard(f, { L, esc });
  assert.match(html, /A is 1/);
  assert.match(html, /A src/);
  assert.match(html, /data-atl-job-cancel/);
  assert.match(html, /data-atl-job-note/);
  assert.match(jobText(f), /1 of 2 pieces ended/);
  const done = jobFacts(jobRow({ status: 'done', result: { summary: 'All done' } }), taskRows.map((t) => ({ ...t, status: 'done', result: t.result || { summary: 'B' } })));
  assert.equal(done.running, false);
  const h2 = renderJobCard(done, { L, esc });
  assert.doesNotMatch(h2, /data-atl-job-cancel|data-atl-job-note/);
  assert.match(h2, /All done/);
});

test('a source URL that is not http(s) is not made a link, and card text is escaped', () => {
  const f = jobFacts(jobRow(), [{ ...taskRows[0], result: { summary: '<img src=x onerror=1>', sources: [{ url: 'javascript:alert(1)', title: 'bad' }] } }]);
  const html = renderJobCard(f, { L, esc });
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<img/);
});

test('the idempotency digest depends on the work, not on key order', () => {
  assert.equal(planDigest([{ goal: 'a', id: 'x' }]), planDigest([{ id: 'x', goal: 'a' }]));
  assert.notEqual(planDigest([{ goal: 'a' }]), planDigest([{ goal: 'b' }]));
});

test('the client names every refusal and posts the key it was given; cancel and amend are the owner RPCs', async () => {
  const sent = [];
  const rpcs = [];
  const sb = { rpc: async (n, a) => { rpcs.push([n, a]); return { data: 'ok', error: null }; } };
  const mk = (status, body) => makeJobsClient({ sb, endpoint: 'https://x/functions/v1/atlas-jobs', authHeaders: async () => ({ a: 1 }), fetch: async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: status < 300, status, json: async () => body }; } });
  assert.deepEqual(await mk(202, { jobId: 'j9', created: true, status: 'queued' }).start({ tasks: [{ goal: 'g' }], idem: 'k1' }), { ok: true, jobId: 'j9', created: true, status: 'queued' });
  assert.deepEqual(sent[0], { op: 'create', idem: 'k1', title: '', tasks: [{ goal: 'g' }] });
  assert.equal((await mk(429, { error: 'user_active_limit' }).start({ tasks: [], idem: 'k' })).code, 'user_active_limit');
  assert.equal((await mk(400, { error: 'bad_plan', code: 'capability_unsupported_on_server', at: 0 }).start({ tasks: [], idem: 'k' })).code, 'capability_unsupported_on_server');
  const c = mk(200, {});
  await c.cancel('j9'); await c.amend('j9', ' only Japan ');
  assert.deepEqual(rpcs, [['atlas_job_cancel', { p_job: 'j9' }], ['atlas_job_amend', { p_job: 'j9', p_note: 'only Japan' }]]);
});

test('workerPrompt still hands a capability result\'s data to the next task', () => {
  assert.match(workerPrompt({ goal: 'g', inputs: [{ from: 'kp', summary: 's', data: { kp: [1] } }] }), /"data":\{"kp":\[1\]\}/);
});
