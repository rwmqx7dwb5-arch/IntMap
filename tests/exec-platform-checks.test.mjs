/* ============================================================================
 *  exec-platform — what a durable job can name is DERIVED from the capability registry, and what cannot run on a server is saved for the page
 *  ① js/atlas-server-class.js classifies every row; supabase/functions/_shared/atlas-cap-classes.js is what scripts/sync-atlas-cap-classes.mjs writes from it
 *  ② every server twin is of a row the registry classes 'read' (a twin of a row that changes things would run with none of the page's guards)
 *  ③ planning: a capability task may name a twin OR a parkable row; a page-only row is refused by name; a worker's own tool may not be parked
 *  ④ the runner SAVES a parkable task (done / parked, nothing sent to a model, no server run); a twin still runs; a page-only one is refused
 *  ⑤ the page applies what was saved once, through its executor, and says what it refused
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { planJob } from '../js/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { SERVER_CAPS, makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { capClass, PARKABLE_CAPS, READ_CAPS } from '../supabase/functions/_shared/atlas-cap-classes.js';
import { serverClass } from '../js/atlas-server-class.js';
import { render } from '../scripts/sync-atlas-cap-classes.mjs';
import { applyParked, jobFacts } from '../js/atlas-jobs-client.js';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const REG = makeAtlasCapabilities({}).all();

test('① the Edge Function mirror is exactly what the registry derives, and every class is a function of the row', async () => {
  const want = await render();
  const have = readFileSync(new URL('../supabase/functions/_shared/atlas-cap-classes.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(have, want, 'run: node scripts/sync-atlas-cap-classes.mjs');
  for (const c of REG) assert.equal(capClass(c.id), serverClass(c), c.id);
  assert.ok(PARKABLE_CAPS.size > 100 && READ_CAPS.size > 30, 'the table is wide, not a hand-picked few: ' + PARKABLE_CAPS.size + ' parkable, ' + READ_CAPS.size + ' read');
  const flags = REG.filter((c) => serverClass(c) !== 'page-only' && (c.facets.asksUser || c.facets.delegates || c.facets.savesFile));
  assert.deepEqual(flags.map((c) => c.id), [], 'a row that asks, delegates or saves a file is never parked or run on a server');
  assert.equal(REG.filter((c) => serverClass(c) === 'parkable' && c.confirmation !== 'none').length, 0, 'nothing that needs the reader confirmation is saved for later');
  assert.equal(capClass('research.delegate'), 'page-only', 'starting other model work is the page');
  assert.equal(capClass('view.zoom'), 'parkable');
  assert.equal(capClass('jobs.start'), 'page-only');
});

test('② every server twin is of a registry row classed read, under the registry id', () => {
  for (const id of Object.keys(SERVER_CAPS)) assert.equal(capClass(id), 'read', id);
});

const lane = makeServerCaps({});
const opts = { kinds: ['worker', 'capability'], capabilityOk: (id) => lane.has(id), parkable: (id) => capClass(id) === 'parkable' };
test('③ planning: twin or parkable for a capability task; a page-only row by name; a worker tool is never parked', () => {
  assert.equal(planJob([{ kind: 'capability', capability: 'view.flyTo', args: { place: 'Rotterdam' } }], opts).ok, true);
  assert.equal(planJob([{ kind: 'capability', capability: 'sim.spaceWeather', args: { part: 'kp' } }], opts).ok, true);
  assert.equal(planJob([{ kind: 'capability', capability: 'jobs.start', args: {} }], opts).error, 'capability_unsupported_on_server');
  assert.equal(planJob([{ kind: 'capability', capability: 'view.flyTo', args: {} }], { kinds: ['worker', 'capability'], capabilityOk: () => false }).error, 'capability_unsupported_on_server', 'a runner that does not say it can park refuses it');
  assert.equal(planJob([{ goal: 'x', tools: ['view.flyTo'] }], opts).error, 'capability_unsupported_on_server', 'the model loop needs the answer now');
});


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
const money = { estimate: () => 100000, actual: () => 50000 };
const runWith = (db, callModel, extra = {}) => runJob({ db, job: db.st.job, holder: 'h1', callModel, money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: makeServerCaps({}), ...extra });

test('④ the runner saves a parkable task, sends nothing to a model and runs nothing on the server', async () => {
  const plan = planJob([{ id: 'go', kind: 'capability', capability: 'layers.toggle', args: { name: 'Earthquakes', on: true } }, { id: 'tail', kind: 'capability', capability: 'view.flyTo', args: { place: 'Rotterdam' }, inputs: [{ from: 'go' }] }], opts).tasks;
  const db = fakeDb(plan);
  let modelCalls = 0;
  const r = await runWith(db, async () => { modelCalls++; return { text: '{}', usage, citations: [] }; });
  assert.equal(r.outcome, 'finished');
  assert.equal(modelCalls, 0);
  const t = db.st.tasks.get('go');
  assert.equal(t.status, 'done'); assert.equal(t.code, 'parked');
  assert.deepEqual(t.result.parked, { capability: 'layers.toggle', args: { name: 'Earthquakes', on: true } });
  assert.equal(db.st.tasks.get('tail').status, 'done', 'a task that builds on a parked one still runs');
  assert.equal(t.finishes, 1);
});

test('④ a capability that is neither a twin nor parkable is refused by name when it gets to the runner', async () => {
  const db = fakeDb([{ id: 'p', deps: [], key: 'k', contract: { id: 'p', kind: 'capability', goal: 'x', capability: 'jobs.start', args: {}, inputs: [] } }]);
  await runWith(db, async () => ({ text: '{}', usage, citations: [] }));
  assert.equal(db.st.tasks.get('p').status, 'refused');
  assert.equal(db.st.tasks.get('p').code, 'capability_unsupported_on_server');
});

test('⑤ the page applies each saved operation once through its executor, in order, and reports a refusal without retrying', async () => {
  const f = jobFacts({ id: 'J', status: 'done' }, [
    { task_id: 'a', status: 'done', code: 'parked', contract: { kind: 'capability', capability: 'layers.toggle', args: {} }, result: { summary: 's', parked: { capability: 'layers.toggle', args: { name: 'x' } } } },
    { task_id: 'b', status: 'done', code: 'parked', contract: { kind: 'capability', capability: 'view.flyTo', args: {} }, result: { summary: 's', parked: { capability: 'view.flyTo', args: { place: 'y' } } } },
    { task_id: 'c', status: 'done', code: '', contract: { kind: 'capability', capability: 'sim.spaceWeather', args: {} }, result: { summary: 'kp' } },
  ]);
  assert.equal(f.tasks[0].parked.capability, 'layers.toggle'); assert.equal(f.tasks[2].parked, null);
  const seen = new Set(); const memory = { has: (k) => seen.has(k), add: (k) => seen.add(k) };
  const ran = [];
  const apply = async (p) => { ran.push(p.capability); return p.capability === 'view.flyTo' ? { ok: false, why: 'not-granted' } : { ok: true }; };
  const first = await applyParked(f, apply, memory);
  assert.deepEqual(ran, ['layers.toggle', 'view.flyTo']);
  assert.deepEqual(first.map((x) => [x.task, x.ok, x.why]), [['a', true, ''], ['b', false, 'not-granted']]);
  assert.deepEqual(await applyParked(f, apply, memory), [], 'the second poll applies nothing');
  assert.equal(ran.length, 2);
  const throws = await applyParked(f, async () => { throw new Error('boom'); }, { has: () => false, add: () => {} });
  assert.equal(throws[0].ok, false); assert.match(throws[0].why, /boom/);
});

/* ── ⑥ the finished job as work products, and the working memory ── */
const { saveJobAsWork, productsOfJob, jobWorkId, noteJobStarted, noteJobEnded, jobOwedText } = await import('../js/atlas-job-products.js');
const { makeWorkStore, memoryBackend, currentProducts, findProduct } = await import('../js/atlas-work-store.js');
const { makeAtlasWorkingMemory } = await import('../js/atlas-working-memory.js');
const ended = (over = {}) => jobFacts({ id: '11111111-2222-3333-4444-555555555555', title: 'Ports', status: 'done', result: { summary: 'Rotterdam leads.' } }, [
  { task_id: 'a', status: 'done', code: '', contract: { goal: 'ports' }, result: { summary: 'Rotterdam moved 14 Mt', findings: [{ claim: 'x' }], sources: [{ url: 'https://example.org/p', title: 'P' }], gaps: ['Antwerp not stated'] } },
  { task_id: 'b', status: over.b || 'done', code: '', contract: { goal: 'more' }, result: over.b === 'failed' ? null : { summary: 'Antwerp 12 Mt' } },
]);

test('⑥ an ended job is filed as ONE work with an answer per piece; filing it again changes nothing; a resumed piece is the next version', async () => {
  const S = makeWorkStore(memoryBackend());
  const f1 = ended({ b: 'failed' });
  const r1 = await saveJobAsWork(f1, S, { now: 1000 });
  assert.equal(r1.ok, true); assert.equal(r1.workId, jobWorkId(f1.id)); assert.match(r1.workId, /^wk-job-/);
  let w = await S.get(r1.workId);
  assert.equal(currentProducts(w).length, 2, 'the piece that ended with something to say, and the combined result');
  assert.equal(w.status, 'blocked', 'a failed piece leaves the work blocked, not done');
  assert.equal((await saveJobAsWork(f1, S, { now: 2000 })).saved.length, 0, 'the same facts again file nothing');
  assert.equal((await S.list()).length, 1, 'and never make a second work');
  const f2 = ended();   /* the resumed job finished the piece it had failed */
  const r2 = await saveJobAsWork(f2, S, { now: 3000 });
  w = await S.get(r1.workId);
  assert.equal(r2.saved.length >= 1, true);
  assert.equal(w.status, 'done');
  assert.ok(findProduct(w, 'b — more'), 'the new piece is a product');
  assert.equal((await saveJobAsWork(Object.assign({}, f2, { running: true }), S)).why, 'still-running', 'a running job is not filed');
  assert.ok(productsOfJob(f2).some((p) => p.kind === 'document' && /Rotterdam leads/.test(p.content.text)));
});

test('⑥ a job that is owed survives the turn that started it and is resolved when it ends', () => {
  const wm = makeAtlasWorkingMemory({});
  const f = { id: 'job-1', title: 'Ports' };
  noteJobStarted(wm, f);
  wm.beginTurn(1, 'start'); wm.recordTurn({ turnId: 1, question: 'start', reply: 'started' });
  assert.match(wm.block(), /job-1/, 'still owed after the turn ended');
  noteJobEnded(wm, f);
  wm.beginTurn(2, 'status'); wm.recordTurn({ turnId: 2, question: 'status', reply: 'done' });
  assert.doesNotMatch(wm.block(), new RegExp(jobOwedText(f).slice(0, 40)), 'resolved at its end');
});
