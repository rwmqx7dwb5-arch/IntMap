/* ============================================================================
 *  atlas-jobs-reliability — durable jobs that finish what they start (supabase/functions/atlas-jobs, _shared/atlas-job-runner.js,
 *  _shared/ai-quota-class.js, migrations 20261201100000 / 20261201110000)
 *
 *  ① a task starts the moment a slot is free and its inputs are done — not when the slowest of a wave of three is
 *  ② a per-MINUTE 429 is waited out and the same request asked again; a billing / per-day quota is refused at once
 *  ③ the lease is renewed while a request is in flight (a request may now outlast a lease)
 *  ④ the function's request window is the platform's, not a number of ours; its 429 reading is the one ai-proxy uses
 *  ⑤ the fences moved from the door to the claim: a job past them waits
 *  ⑥ the ledger: one definition, a refund goes to the day it was charged on, a count is not written by hand
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planJob } from '../js/atlas-job-core.js';
import { runJob, RATE_WAIT_BUDGET_MS } from '../supabase/functions/_shared/atlas-job-runner.js';
import { quotaClass, retryAfterHeader } from '../supabase/functions/_shared/ai-quota-class.js';
import { refundTurn } from '../supabase/functions/_shared/ai-ledger.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

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


const goal = (prompt) => /YOUR PIECE OF THE WORK:\n([^\n]+)/.exec(prompt)[1];
const tick = () => new Promise((r) => setImmediate(r));
const rateError = (retryAfterSeconds) => Object.assign(new Error('rate'), { code: 'provider_rate_limit', status: 429, retryAfterSeconds });

/* ① rolling slots */
test('① a task starts as soon as a slot is free and its inputs are done — it does not wait for the slowest of a wave', async () => {
  const plan = planJob([
    { id: 'slow', goal: 'slow search' }, { id: 'fast', goal: 'fast one' }, { id: 'other', goal: 'other slow' },
    { id: 'after', goal: 'after fast', inputs: [{ from: 'fast' }] },
  ]).tasks;
  const db = fakeDb(plan);
  const gates = {}; const started = []; const ended = [];
  const gate = (g) => new Promise((res) => { gates[g] = res; });
  const slow = gate('slow'), other = gate('other');
  const r = runJob(base(db, async (sys, prompt) => {
    const g = goal(prompt); started.push(g);
    if (g === 'slow search') await slow;
    if (g === 'other slow') await other;
    ended.push(g);
    return goodAnswer(g);
  }));
  await tick(); await tick(); await tick();
  assert.deepEqual(started.slice(0, 3).sort(), ['fast one', 'other slow', 'slow search'], 'three slots, three tasks');
  for (let i = 0; i < 20 && !started.includes('after fast'); i++) await tick();
  assert.ok(started.includes('after fast'), 'the dependent of the fast task started while the two slow ones were still running');
  assert.equal(ended.includes('slow search'), false);
  gates.slow(); gates.other();
  const out = await r;
  assert.equal(out.outcome, 'finished');
  assert.equal(db.st.job.finished.status, 'done');
  assert.equal([...db.st.tasks.values()].every((t) => t.finishes === 1 && t.status === 'done'), true);
});

test('① out of time, what is running is allowed to end and nothing new starts; then the lease is let go', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B' }, { id: 'c', goal: 'C', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let t = 0; const asked = [];
  const r = await runJob(base(db, async (sys, prompt) => { asked.push(goal(prompt)); t = 99999; return goodAnswer(goal(prompt)); }, { now: () => t }));
  assert.equal(r.outcome, 'more');
  assert.deepEqual(asked.sort(), ['A', 'B'], 'the two that were running ended; the dependent never started');
  assert.equal(db.st.job.releases, 1);
});

/* ② rate limits */
test('② a per-minute rate limit is waited out and the same request is asked again — it is not one of the two attempts', async () => {
  const db = fakeDb(planJob([{ id: 'a', goal: 'A' }]).tasks);
  let n = 0; const slept = [];
  await runJob(base(db, async () => { n++; if (n <= 2) throw rateError(7); return goodAnswer('A'); }, { sleep: async (ms) => { slept.push(ms); } }));
  assert.equal(n, 3, 'two rate limits, then the answer');
  assert.deepEqual(slept, [7000, 7000], "the provider's own Retry-After says how long");
  assert.equal(db.st.tasks.get('a').status, 'done');
  assert.equal(db.st.events.filter((e) => e.kind === 'task.rate_wait').length, 2, 'every wait is on the record');
  assert.equal(db.st.job.reserved, 0);
});

test('② a rate limit that outlasts the waiting budget ends the task refused (provider_rate_limit), after waiting no more than the budget', async () => {
  const db = fakeDb(planJob([{ id: 'a', goal: 'A' }]).tasks);
  let n = 0; let waited = 0;
  await runJob(base(db, async () => { n++; throw rateError(0); }, { sleep: async (ms) => { waited += ms; } }));
  assert.ok(waited <= RATE_WAIT_BUDGET_MS && waited > 0, 'waited ' + waited);
  assert.equal(n, waited / 20000 + 1, 'the default wait is 20 s; one request per wait, and the last one refused');
  assert.equal(db.st.tasks.get('a').status, 'refused');
  assert.equal(db.st.tasks.get('a').code, 'provider_rate_limit');
});

test('② a hard quota is refused at once and is never waited for', async () => {
  const db = fakeDb(planJob([{ id: 'a', goal: 'A' }]).tasks);
  let n = 0; let slept = 0;
  await runJob(base(db, async () => { n++; throw Object.assign(new Error('q'), { code: 'provider_quota', status: 429 }); }, { sleep: async (ms) => { slept += ms; } }));
  assert.equal(n, 1); assert.equal(slept, 0);
  assert.equal(db.st.tasks.get('a').status, 'refused');
});

test('② the classifier is the one taxonomy: per-minute and generic 429 → rate; billing and per-day → quota; anything else → none', () => {
  assert.equal(quotaClass(429, 'Rate limit reached for gpt in organization on tokens per min (TPM). Please try again in 1.2s').kind, 'rate');
  assert.equal(quotaClass(429, '').kind, 'rate');
  assert.equal(quotaClass(429, '{"error":{"code":"insufficient_quota"}}').kind, 'quota');
  assert.equal(quotaClass(429, 'billing_hard_limit_reached').kind, 'quota');
  assert.equal(quotaClass(429, '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}').kind, 'quota');
  assert.equal(quotaClass(429, '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel","retryDelay":"23s"}').retryAfterSeconds, 23);
  assert.equal(quotaClass(500, 'oops'), null);
  assert.equal(retryAfterHeader(new Headers({ 'retry-after': '12' })), 12);
  assert.equal(retryAfterHeader(new Headers()), undefined);
  /* ai-proxy reads its 429s through this one function, not a copy */
  assert.match(read('supabase/functions/ai-proxy/provider-call.ts'), /quotaClass\(status, bodyText\)/);
  assert.doesNotMatch(read('supabase/functions/ai-proxy/provider-call.ts'), /insufficient_quota/);
});

/* ③ the lease while a request is in flight */
test('③ the lease is renewed while a request is in flight, and the renewal stops when it ends', async () => {
  const db = fakeDb(planJob([{ id: 'a', goal: 'A' }]).tasks);
  let beats = 0;
  const inner = db.rpc;
  db.rpc = async (n, a) => { if (n === 'atlas_job_checkpoint') beats++; return inner(n, a); };
  await runJob(base(db, async () => { const before = beats; await new Promise((r) => setTimeout(r, 90)); assert.ok(beats - before >= 2, 'renewed during the request: ' + (beats - before)); return goodAnswer('A'); }, { heartbeatMs: 20 }));
  const after = beats;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(beats, after, 'no timer is left running after the request');
});

/* ④ the function */
test('④ the function asks the provider for what is left of the invocation, not a fixed 100 s; 429s are classified, not all read as quota', () => {
  const f = read('supabase/functions/atlas-jobs/index.ts');
  assert.doesNotMatch(f, /timeoutMs:\s*100_?000/);
  assert.match(f, /timeoutMs:\s*providerBudgetMs\(true,\s*o\.startedAt/);
  assert.match(f, /quotaClass\(res\.status/);
  assert.match(f, /provider_rate_limit/);
  assert.match(f, /heartbeatMs:/);
  assert.match(f, /atlas_jobs_waiting/);
  const r = read('supabase/functions/_shared/atlas-job-runner.js');
  assert.doesNotMatch(r, /ready\.slice\(0, TASK_CONCURRENCY\)/, 'no waves');
});

/* ⑤ the queue */
test('⑤ the fences are at the claim: create never counts, claim admits a queued job only below both limits and never holds a running job back', () => {
  const m = read('supabase/migrations/20261201100000_atlas_jobs_queue.sql');
  const create = /create or replace function public\.atlas_job_create[\s\S]*?\n\$\$;/.exec(m)[0];
  assert.doesNotMatch(create, /user_active_limit|'busy'|max_active/, 'create refuses nothing for the fences');
  const claim = /create or replace function public\.atlas_job_claim[\s\S]*?\n\$\$;/.exec(m)[0];
  assert.match(claim, /pg_advisory_xact_lock\(hashtextextended\('atlas_job_admit'/);
  assert.match(claim, /x\.status = 'running'[^\n]*already holds its place/);
  assert.match(claim, /v_running < c\.max_active_total/);
  assert.match(claim, /< c\.max_active_per_user/);
  assert.match(claim, /order by \(x\.status = 'running'\) desc, x\.created_at/);
  const resume = /create or replace function public\.atlas_job_resume[\s\S]*?\n\$\$;/.exec(m)[0];
  assert.doesNotMatch(resume, /user_active_limit|'busy'/);
  assert.doesNotMatch(read('js/atlas-cap-jobs.js'), /user_active_limit|case 'busy'/);
  assert.doesNotMatch(read('supabase/functions/atlas-jobs/index.ts'), /user_active_limit|"busy"/);
});

/* ⑥ the ledger */
test('⑥ a keyless refund names the day it was charged on; keyed refunds are unchanged', async () => {
  const calls = [];
  const db = { rpc: async (n, a) => { calls.push([n, a]); return { data: n === 'refund_ai_turn' ? 'refunded' : null, error: null }; } };
  const acct = { id: 'u1', isDev: false };
  assert.equal(await refundTurn(db, acct, '', null, '2026-11-25'), 'refunded');
  assert.deepEqual(calls[0], ['refund_ai_usage_on', { p_user: 'u1', p_date: '2026-11-25' }]);
  calls.length = 0;
  assert.equal(await refundTurn(db, acct, 'turn-1', 'g1', '2026-11-25'), 'refunded');
  assert.equal(calls[0][0], 'refund_ai_turn', 'a keyed turn carries its own day in the turn row');
  calls.length = 0;
  await refundTurn(db, acct, '', null, undefined);
  assert.equal(calls[0][0], 'refund_ai_turn', 'no day known: the old behaviour (today)');
  assert.equal(await refundTurn(db, { id: 'dev', isDev: true }, '', null, '2026-11-25'), 'skipped');
});

test('⑥ the ledger migration: the live definition, the day-named refund, and a count that only the ledger writes', () => {
  const m = read('supabase/migrations/20261201110000_ai_ledger_alignment.sql');
  assert.match(m, /returns table \(allowed boolean, used integer, lim integer\)/);
  assert.match(m, /add column if not exists updated_at/);
  assert.match(m, /function public\.refund_ai_usage_on\(p_user uuid, p_date date\)/);
  for (const fn of ['increment_ai_usage', 'refund_ai_usage_on', 'refund_ai_usage', 'refund_ai_turn']) {
    const body = new RegExp('function public\\.' + fn + '\\([\\s\\S]*?\\n\\$\\$;').exec(m);
    assert.ok(body, fn);
    if (fn !== 'refund_ai_usage') { assert.match(body[0], /set_config\('intmap\.ai_ledger', 'rpc', true\)/, fn + ' raises the ledger setting'); assert.match(body[0], /set_config\('intmap\.ai_ledger', '', true\)/, fn + ' and lowers it again'); }
    assert.match(body[0], /set search_path = ''/, fn + ' pins an empty search_path');
  }
  assert.match(m, /after insert on public\.ai_usage[\s\S]*when \(new\.count <> 0\)/);
  assert.match(m, /after update of count on public\.ai_usage[\s\S]*is distinct from old\.count/);
  assert.match(m, /errcode = '42501'/);
  /* the seed and the tests that write a count by hand say so */
  assert.match(read('supabase/seed.sql'), /set_config\('intmap\.ai_ledger', 'admin'/);
});

/* ⑦ images and the output size reach the child */
test('⑦ a worker task is shown the images it names, told which is which, and told when one is missing', async () => {
  const plan = planJob([{ id: 'a', goal: 'look at the photo', images: ['photo.png', '@view'] }], { images: true }).tasks;
  const db = fakeDb(plan);
  const stored = [{ name: 'photo.png', urls: ['data:image/png;base64,AAAA'] }];   /* @view was not sent */
  const baseFrom = db.from;
  db.from = (table) => table === 'atlas_job_tasks' ? { select: (cols) => (cols === 'images'
    ? { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { images: stored }, error: null }) }) }) }
    : baseFrom(table).select()) } : baseFrom(table);
  let seen = null; let est = null;
  await runJob(base(db, async (sys, prompt, o) => { seen = { prompt, images: o.images, startedAt: o.startedAt }; return goodAnswer('saw it'); }, { money: { estimate: (c, w, m, n) => { est = n; return 100000; }, actual: () => 50000 } }));
  assert.deepEqual(seen.images, ['data:image/png;base64,AAAA']);
  assert.match(seen.prompt, /IMAGES SHOWN TO YOU[\s\S]*image 1 = photo\.png/);
  assert.match(seen.prompt, /WERE NOT \(@view\)[\s\S]*did not see them/);
  assert.equal(est, 1, 'the request is reserved for the image it carries');
  assert.equal(typeof seen.startedAt, 'number', 'the request is given the invocation start, its time window');
});

test('⑦ the server carries images and maxOutput, and refuses by name rather than drop', () => {
  const f = read('supabase/functions/atlas-jobs/index.ts');
  assert.match(f, /maxOutput: true, images: true/);
  assert.match(f, /type: "input_image", image_url: u/);
  for (const code of ['images_missing', 'images_invalid', 'images_too_large']) assert.match(f, new RegExp(code));
  /* the limits are ai-proxy's own, held equal */
  const cfg = read('supabase/functions/ai-proxy/config.ts');
  assert.equal(Number(/MAX_IMAGES\s*=\s*(\d+)/.exec(cfg)[1]), Number(/MAX_IMAGES_PER_TASK\s*=\s*(\d+)/.exec(f)[1]));
  const mb = /MAX_IMAGES_BYTES\s*=\s*([^;\n]+)/.exec(cfg)[1].replace(/_/g, '').trim();
  const mine = /MAX_IMAGES_BYTES\s*=\s*([^;\n]+)/.exec(f)[1].replace(/_/g, '').trim();
  assert.equal(Function('return (' + mb + ')')(), Function('return (' + mine + ')')());
  const m = read('supabase/migrations/20261201100000_atlas_jobs_queue.sql');
  assert.match(m, /add column if not exists images jsonb/);
  assert.match(m, /t->'images'/);
  /* the page's reads never select the column */
  assert.doesNotMatch(read('js/atlas-jobs-client.js'), /select\('\*'\)\.eq\('job_id'/);
});
