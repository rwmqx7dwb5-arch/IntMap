/* ============================================================================
 *  atlas-durable-jobs — a job that outlives the tab (js/atlas-job-core.js, supabase/functions/_shared/atlas-job-runner.js,
 *  supabase/functions/atlas-jobs, supabase/migrations/20261120090000_atlas_durable_jobs.sql)
 *
 *  ① the contract the page and the server share: planJob / readyTasks / workerPrompt, and the mirror is byte-identical;
 *  ② the runner against an in-memory twin of the SQL state machine: a dependent pair finishes, the reader's amendment
 *     reaches the next request, a cancel and the stop switch stop BEFORE the next provider request, the cost cap refuses a
 *     request without sending it, a lost lease writes nothing, a task finishes once, a slice that runs out of time lets go;
 *  ③ the SQL and the function carry the fences they claim (the SQL itself runs in supabase/tests/52_atlas_durable_jobs_test.sql).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planJob, readyTasks, workerPrompt, JOB_MAX_TASKS } from '../js/atlas-job-core.js';
import { runJob, parseJson } from '../supabase/functions/_shared/atlas-job-runner.js';
import { inSync } from '../scripts/sync-atlas-job-core.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* ── ① the shared contract ── */
test('the server mirror of the job core is byte-identical to the page file', () => { assert.equal(inSync(), true); });

test('planJob: ids, dependencies, duplicates and what cannot be run', () => {
  const ok = planJob([{ id: 'a', goal: 'find A' }, { id: 'b', goal: 'compare', inputs: [{ from: 'a' }] }, { goal: 'find A' }]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.tasks.map((t) => t.id), ['a', 'b'], 'the same contract twice is one task');
  assert.deepEqual(ok.tasks[1].deps, ['a']);
  assert.equal(planJob([]).error, 'no_tasks');
  assert.equal(planJob(Array.from({ length: JOB_MAX_TASKS + 1 }, (_, i) => ({ goal: 'g' + i }))).error, 'too_many_tasks');
  assert.equal(planJob([{ goal: '' }]).error, 'goal_missing');
  assert.equal(planJob([{ kind: 'capability', capability: 'weather.now', args: {} }]).error, 'kind_unsupported', 'a capability task has no server twin yet — refused by name');
  assert.equal(planJob([{ id: 'a', goal: 'x', inputs: [{ from: 'nobody' }] }]).error, 'input_unknown');
  assert.equal(planJob([{ id: 'a', goal: 'x', inputs: [{ from: 'b' }] }, { id: 'b', goal: 'y', inputs: [{ from: 'a' }] }]).error, 'input_cycle');
});

test('readyTasks: a task starts once what it starts from is done; one that can never start is blocked', () => {
  const r = readyTasks([{ id: 'a', status: 'done', deps: [] }, { id: 'b', status: 'queued', deps: ['a'] }, { id: 'c', status: 'queued', deps: ['x'] }, { id: 'x', status: 'failed', deps: [] }, { id: 'd', status: 'queued', deps: ['b'] }]);
  assert.deepEqual(r.ready.map((t) => t.id), ['b']);
  assert.deepEqual(r.blocked.map((t) => t.id), ['c']);
});

test('workerPrompt carries what the reader changed, as instructions that outrank the piece', () => {
  const p = workerPrompt({ goal: 'research X' }, ['only 2020 data']);
  assert.match(p, /YOUR PIECE OF THE WORK:\nresearch X/);
  assert.match(p, /CHANGED THE REQUEST[\s\S]*1\. only 2020 data/);
  assert.doesNotMatch(workerPrompt({ goal: 'research X' }, []), /CHANGED THE REQUEST/);
});

test('parseJson reads the first object, with or without a fence', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('here: {"a":{"b":2}} done'), { a: { b: 2 } });
  assert.equal(parseJson('no json'), null);
});

/* ── ② the runner, against an in-memory twin of the state machine (the SQL is run by pgTAP 52) ── */
function fakeDb(plan, o = {}) {
  const st = {
    job: { id: 'job1', user_id: 'u1', status: 'running', lease_holder: 'h1', cancel_requested: false, enabled: true, cap: o.cap ?? 1000000, spent: 0, reserved: 0, finished: null, amends: [], releases: 0 },
    tasks: new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key, finishes: 0 }])),
    events: [],
    onCheckpoint: o.onCheckpoint || null,
  };
  const j = st.job;
  const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => {
      if (st.onCheckpoint) st.onCheckpoint(st);
      if (!mine(a.p_holder)) return [{ ok: false, action: 'lost', amends: [] }];
      if (!j.enabled) return [{ ok: true, action: 'kill_switch', amends: j.amends.slice() }];
      if (j.cancel_requested) return [{ ok: true, action: 'cancel', amends: j.amends.slice() }];
      return [{ ok: true, action: 'go', amends: j.amends.slice() }];
    },
    atlas_job_reserve: (a) => { if (!mine(a.p_holder) || j.spent + j.reserved + a.p_micros > j.cap) return false; j.reserved += a.p_micros; return true; },
    atlas_job_settle: (a) => { j.reserved = Math.max(0, j.reserved - a.p_reserved); j.spent += a.p_actual; return true; },
    atlas_job_task_start: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_finish: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.status = a.p_status; t.code = a.p_code; t.result = a.p_result; t.finishes += 1; return true; },
    atlas_job_task_block: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'queued') return false; t.status = 'failed'; t.code = a.p_code; return true; },
    atlas_job_finish: (a) => { if (!mine(a.p_holder)) return false; j.status = a.p_status; j.finished = { status: a.p_status, reason: a.p_stop_reason, result: a.p_result }; j.lease_holder = null; return true; },
    atlas_job_release: (a) => { if (!mine(a.p_holder)) return false; j.lease_holder = null; j.releases += 1; return true; },
  };
  return {
    st,
    rpc: async (name, args) => ({ data: rpcs[name](args), error: null }),
    from: (table) => ({
      select: () => ({ eq: async () => ({ data: table === 'atlas_job_tasks' ? Array.from(st.tasks.values()).map((t) => ({ ...t })) : [], error: null }) }),
      insert: async (row) => { st.events.push(row); return { error: null }; },
    }),
  };
}

const goodAnswer = (summary) => ({ text: JSON.stringify({ summary, findings: [{ claim: summary }], gaps: [] }), usage: { input: 1000, cached_read: 0, output: 500 }, citations: [{ url: 'https://example.test/' + encodeURIComponent(summary), title: 't' }], model: 'm' });
const money = { estimate: () => 100000, actual: () => 50000 };
const base = (db, callModel, extra = {}) => ({ db, job: db.st.job, holder: 'h1', callModel, money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', ...extra });

test('a dependent pair runs in order, the second is handed the first\'s findings, and the job ends done with both results', async () => {
  const plan = planJob([{ id: 'a', goal: 'find A' }, { id: 'b', goal: 'use A', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  const prompts = [];
  const r = await runJob(base(db, async (sys, prompt) => { prompts.push(prompt); return goodAnswer(prompts.length === 1 ? 'A is 1' : 'B is 2'); }));
  assert.equal(r.outcome, 'finished');
  assert.equal(prompts.length, 2, 'one request per task');
  assert.match(prompts[1], /WHAT ANOTHER WORKER FOUND \(task "a"\)[\s\S]*A is 1/);
  const f = db.st.job.finished;
  assert.equal(f.status, 'done');
  assert.deepEqual(f.result.tasks.map((t) => t.state), ['done', 'done']);
  assert.match(f.result.summary, /A is 1[\s\S]*B is 2/);
  assert.equal(db.st.job.spent, 100000, 'what the provider billed is what is spent');
  assert.equal(db.st.job.reserved, 0, 'nothing stays reserved');
  assert.equal([...db.st.tasks.values()].every((t) => t.finishes === 1), true, 'each task finished once');
});

test('what the reader changes while the work runs reaches the next request, and a dropped task never runs', async () => {
  const plan = planJob([{ id: 'a', goal: 'find A' }, { id: 'b', goal: 'use A', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let n = 0;
  const prompts = [];
  await runJob(base(db, async (sys, prompt) => { prompts.push(prompt); n++; if (n === 1) db.st.job.amends.push('restrict to 2020'); return goodAnswer('x' + n); }));
  assert.doesNotMatch(prompts[0], /CHANGED THE REQUEST/);
  assert.match(prompts[1], /CHANGED THE REQUEST[\s\S]*restrict to 2020/);

  const db2 = fakeDb(plan);
  const calls = [];
  await runJob(base(db2, async (sys, prompt) => { calls.push(prompt); db2.st.tasks.get('b').status = 'cancelled'; return goodAnswer('only a'); }));
  assert.equal(calls.length, 1, 'a task the reader dropped does not run');
  assert.equal(db2.st.job.finished.status, 'done');
});

test('a cancel stops the job BEFORE the next provider request, and ends it cancelled with nothing left open', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let calls = 0;
  await runJob(base(db, async () => { calls++; db.st.job.cancel_requested = true; return goodAnswer('A'); }));
  assert.equal(calls, 1, 'the second task never reached the provider');
  assert.equal(db.st.job.finished.status, 'cancelled');
  assert.equal(db.st.job.finished.reason, 'user');
});

test('the stop switch ends a running job at its next checkpoint, with its own reason', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let calls = 0;
  await runJob(base(db, async () => { calls++; db.st.job.enabled = false; return goodAnswer('A'); }));
  assert.equal(calls, 1);
  assert.equal(db.st.job.finished.status, 'cancelled');
  assert.equal(db.st.job.finished.reason, 'kill_switch');
});

test('the cost cap refuses a request without sending it; a job where nothing finished ends failed with cost_cap', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }]).tasks;
  const db = fakeDb(plan, { cap: 50000 });   // below one request's estimate (100000)
  let calls = 0;
  await runJob(base(db, async () => { calls++; return goodAnswer('A'); }));
  assert.equal(calls, 0, 'no request was sent');
  assert.equal(db.st.tasks.get('a').status, 'refused');
  assert.equal(db.st.job.finished.status, 'failed');
  assert.equal(db.st.job.finished.reason, 'cost_cap');
  assert.equal(db.st.job.spent, 0);
});

test('a lost lease writes nothing and calls no model', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }]).tasks;
  const db = fakeDb(plan);
  db.st.job.lease_holder = 'someone-else';
  let calls = 0;
  const r = await runJob(base(db, async () => { calls++; return goodAnswer('A'); }));
  assert.equal(r.outcome, 'lost');
  assert.equal(calls, 0);
  assert.equal(db.st.job.finished, null);
  assert.equal(db.st.tasks.get('a').status, 'queued');
});

test('one observed provider failure is retried once, differently; a wrong shape is repaired once with the reason named; neither is repeated again', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B' }]).tasks;
  const db = fakeDb(plan);
  const seen = { a: [], b: [] };
  await runJob(base(db, async (sys, prompt) => {
    const which = /\nA\b|^YOUR PIECE OF THE WORK:\nA\n/.test(prompt) ? 'a' : 'b';
    seen[which].push(prompt);
    if (which === 'a') {
      if (seen.a.length === 1) { const e = new Error('slow'); e.code = 'provider_unavailable'; e.timeout = true; throw e; }
      return goodAnswer('A done');
    }
    return seen.b.length === 1 ? { text: 'not json', usage: {}, citations: [] } : goodAnswer('B done');
  }));
  assert.equal(seen.a.length, 2);
  assert.match(seen.a[1], /TIMED OUT[\s\S]*Web search is NOT available/, 'a timeout is retried without the web, and said so');
  assert.equal(db.st.tasks.get('a').status, 'partial', 'an answer made without the web is partial, not done');
  assert.equal(seen.b.length, 2);
  assert.match(seen.b[1], /COULD NOT BE USED: the answer was not a JSON object/);
  assert.equal(db.st.tasks.get('b').status, 'done');

  const db2 = fakeDb(planJob([{ id: 'a', goal: 'A' }]).tasks);
  let n = 0;
  await runJob(base(db2, async () => { n++; const e = new Error('down'); e.code = 'provider_unavailable'; e.status = 503; throw e; }));
  assert.equal(n, 2, 'a repeated failure stops after the one retry');
  assert.equal(db2.st.tasks.get('a').status, 'failed');
});

test('a slice that is out of time lets go of the job for the next tick instead of starting more', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let t = 0;
  const r = await runJob(base(db, async () => { t += 40000; return goodAnswer('A'); }, { now: () => t }));
  assert.equal(r.outcome, 'more');
  assert.equal(db.st.job.releases, 1);
  assert.equal(db.st.job.status, 'running', 'not ended: the next claim continues it');
  assert.equal(db.st.tasks.get('b').status, 'queued');
});

/* ── ③ the SQL and the function carry the fences they claim ── */
test('the migration: RLS on every table, owner-only read, the runner functions are service_role only, the reader\'s two are not', () => {
  const sql = read('supabase/migrations/20261120090000_atlas_durable_jobs.sql');
  for (const t of ['atlas_jobs', 'atlas_job_tasks', 'atlas_job_events', 'atlas_jobs_control']) assert.match(sql, new RegExp('alter table public\\.' + t + '\\s+enable row level security'), t + ' has RLS');
  assert.match(sql, /unique \(user_id, idem_key\)/, 'creation is idempotent on (reader, idem)');
  assert.match(sql, /skip locked/i, 'a claim never waits on, or doubles, another runner');
  for (const f of ['atlas_job_create', 'atlas_job_claim', 'atlas_job_checkpoint', 'atlas_job_reserve', 'atlas_job_settle', 'atlas_job_task_start', 'atlas_job_task_finish', 'atlas_job_finish', 'atlas_job_release']) {
    assert.match(sql, new RegExp('revoke execute on function public\\.' + f + '\\([^)]*\\) from public, anon, authenticated'), f + ' is not callable by a reader');
    assert.match(sql, new RegExp('grant\\s+execute on function public\\.' + f + '\\([^)]*\\) to service_role'), f + ' is service_role\'s');
  }
  for (const f of ['atlas_job_cancel', 'atlas_job_amend']) assert.match(sql, new RegExp('grant\\s+execute on function public\\.' + f + '\\([^)]*\\) to authenticated'), f + ' is the reader\'s');
  assert.match(sql, /auth\.uid\(\)\) for update/, 'the reader\'s controls act on their own jobs only');
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*to authenticated/i, 'no client write on the tables');
});

test('the function: the stop switch, the tick secret, the daily ceiling and the reader charge are all there', () => {
  const ts = read('supabase/functions/atlas-jobs/index.ts');
  assert.match(ts, /ATLAS_JOBS"\)\.toLowerCase\(\) === "off"/, 'the secret stop switch');
  assert.match(ts, /timingSafeEqual\(got, secret\)/, 'the tick is gated by a constant-time secret');
  assert.match(ts, /if \(!secret\) return json\(\{ error: "not_configured" \}, 503\)/, 'and fails closed without it');
  assert.match(ts, /spendCeiling\(\{ fn: "atlas-jobs"/, 'every provider request takes from the project-wide ceiling');
  assert.match(ts, /openTurn\(db, account/, 'a new job costs one daily use');
  assert.match(ts, /getUser\(\)/, 'create verifies the reader itself (verify_jwt is off for the tick)');
  assert.match(read('supabase/config.toml'), /\[functions\.atlas-jobs\]\s*\nverify_jwt = false/);
});

