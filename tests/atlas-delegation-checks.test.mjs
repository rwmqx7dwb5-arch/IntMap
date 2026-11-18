/* ============================================================================
 *  atlas-delegation — the substrate Atlas hands work on through, evaluated (not read)
 *  js/atlas-delegate.js · supabase/functions/ai-proxy/config.ts · _shared/ai-provider.js · ask.ts
 *  The database half (consume_ai_child_turn, reserve/settle_ai_spend) is supabase/tests/49_atlas_delegation_test.sql.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDelegation, makeWorkerExecutor, normaliseContract, shapeOf, RESULT_STATES, REFUSAL_CODES } from '../js/atlas-delegate.js';
import { priceOf, costMicros, MODEL_PRICE_USD_PER_MTOK } from '../supabase/functions/_shared/ai-provider.js';
import { delegationPolicy, turnCostCapMicros, DELEGATION_DEFAULTS, TURN_COST_CAP_USD } from '../supabase/functions/ai-proxy/config.ts';
import { TASKS } from '../supabase/functions/ai-proxy/tasks/index.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

/* an executor whose tasks end only when the test says so — it can see whether they ran at once */
function gatedExecutor() {
  const running = new Set(), gates = new Map(), seen = [];
  return {
    running, seen,
    open(id, r) { gates.get(id)(r || { state: 'done', summary: 'found ' + id }); },
    executor: { id: 'fake', run(task) { seen.push(task); running.add(task.id); return new Promise((res) => gates.set(task.id, (r) => { running.delete(task.id); res(r); })); } },
  };
}

test('① independent tasks run at the same time, and each ends with a state from the contract', async () => {
  const g = gatedExecutor();
  const D = makeDelegation({ executor: g.executor, parent: 't1-1' });
  const p = D.run([{ id: 'oil', goal: 'crude oil routes' }, { id: 'lng', goal: 'LNG routes' }]);
  await tick();
  assert.deepEqual([...g.running].sort(), ['lng', 'oil'], 'both were running before either ended');
  g.open('oil'); g.open('lng', { state: 'partial', summary: 'half' });
  const out = await p;
  assert.deepEqual(out.map((r) => r.state), ['done', 'partial']);
  out.forEach((r) => assert.ok(RESULT_STATES.includes(r.state)));
  const created = D.log.all().filter((e) => e.kind === 'task.created');
  assert.ok(created.every((e) => e.rel.some((r) => r.kind === 'spawned_by' && r.to === 't1-1')), 'every task names the turn that opened it');
});

test('② a dependency is data: the task starts when the one it names ends, and receives its findings', async () => {
  const g = gatedExecutor();
  const D = makeDelegation({ executor: g.executor });
  const p = D.run([{ id: 'ports', goal: 'ports' }, { id: 'routes', goal: 'routes between them', inputs: [{ from: 'ports' }] }]);
  await tick();
  assert.deepEqual([...g.running], ['ports'], 'the dependent task has not started');
  g.open('ports', { state: 'done', summary: 'Ras Tanura, Port Hedland', findings: [{ claim: 'x' }] });
  await tick(); await tick();
  assert.ok(g.running.has('routes'));
  const routesTask = g.seen.find((t) => t.id === 'routes');
  assert.equal(routesTask.inputs[0].from, 'ports');
  assert.equal(routesTask.inputs[0].summary, 'Ras Tanura, Port Hedland');
  g.open('routes');
  await p;
  const rel = D.log.all().find((e) => e.kind === 'task.created' && e.task === 'routes').rel;
  assert.ok(rel.some((r) => r.kind === 'uses_output_of' && r.to === 'ports'), 'the relation is in the record, not in someone\'s head');
});

test('③ a dependency that did not succeed leaves its dependant without its input — said, not run', async () => {
  const g = gatedExecutor();
  const D = makeDelegation({ executor: g.executor });
  const p = D.run([{ id: 'a', goal: 'a' }, { id: 'b', goal: 'b', inputs: [{ from: 'a' }] }, { id: 'c', goal: 'c', inputs: [{ from: 'nope' }] }]);
  await tick();
  g.open('a', { state: 'failed', code: 'x' });
  const out = await p;
  assert.equal(out[1].state, 'failed'); assert.equal(out[1].code, 'input_unavailable');
  assert.equal(out[2].code, 'input_unknown');
  assert.equal(g.seen.length, 1, 'neither dependant reached the executor');
});

test('④ the same contract twice is the same task — answered once, said so (not refused, not rerun)', async () => {
  let runs = 0;
  const D = makeDelegation({ executor: { id: 'x', async run() { runs++; return { state: 'done', summary: 's' }; } } });
  const out = await D.run([{ goal: 'same piece' }, { goal: 'same piece' }]);
  assert.equal(runs, 1);
  assert.equal(out[0].id, out[1].id);
  assert.equal(out[1].reused, true);
  assert.ok(D.log.all().some((e) => e.kind === 'task.reused'));
});

test('⑤ cancellation reaches a running task; an invalid contract is a failed task, never a throw', async () => {
  const D = makeDelegation({ executor: { id: 'x', run: (t, ctx) => new Promise((_, rej) => ctx.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); })) } });
  const p = D.run([{ goal: 'long' }, { goal: '' }]);
  await tick();
  D.cancelAll();
  const out = await p;
  assert.equal(out[0].state, 'cancelled');
  assert.equal(out[1].state, 'failed'); assert.equal(out[1].code, 'goal_missing');
  assert.equal(normaliseContract(null).ok, false);
});

test('⑥ the lease and the spend are read off the log', async () => {
  const D = makeDelegation({ executor: { id: 'page', async run(t, ctx) { ctx.emit('effect.done', { costUsd: 0.25 }); ctx.emit('effect.done', { costUsd: 0.5 }); return { state: 'done', summary: 's', costUsd: 0.75 }; } } });
  await D.run([{ goal: 'g' }]);
  assert.equal(D.spendUsd(), 0.75);
  assert.equal(D.log.all().find((e) => e.kind === 'task.lease').data.holder, 'page');
});

/* ── the worker executor ─────────────────────────────────────────────────── */
function fakeAsk(replies) {
  const calls = [];
  const fn = async (prompt, system, imgs, opts) => {
    calls.push({ prompt, system, opts });
    const r = replies[calls.length - 1];
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}
const run1 = (ask, task) => makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 't9-100' }) }).run([task || { id: 'w', goal: 'find the ports' }]).then((x) => x[0]);

test('⑦ a worker call carries its own key and names its parent, on the worker task', async () => {
  const ask = fakeAsk([{ data: { summary: 'ok', findings: [{ claim: 'Port Hedland', lat: -20.3, lon: 118.6, source: 'https://x' }] }, meta: { costUsd: 0.01 }, citations: [{ url: 'https://x', title: 'X' }] }]);
  const r = await run1(ask);
  assert.equal(r.state, 'done');
  assert.equal(ask.calls[0].opts.task, 'atlas_delegate');
  assert.equal(ask.calls[0].opts.parentTurnId, 't9-100');
  assert.equal(ask.calls[0].opts.turnId, 't9-100~w');
  assert.equal(r.findings[0].lat, -20.3);
  assert.equal(r.sources[0].url, 'https://x');
  assert.equal(r.costUsd, 0.01);
});

test('⑧ a wrong shape gets ONE repair that names what was wrong; a second wrong shape is partial with the text', async () => {
  const ask = fakeAsk([{ data: { findings: [] }, meta: {} }, { data: { summary: 'fixed' }, meta: {} }]);
  const r = await run1(ask);
  assert.equal(r.state, 'done'); assert.equal(r.calls, 2);
  assert.match(ask.calls[1].prompt, /could not be used: "summary" was missing/i);
  const ask2 = fakeAsk([{ data: null, text: 'prose', meta: {} }, { data: null, text: 'prose again', meta: {} }]);
  const r2 = await run1(ask2);
  assert.equal(r2.state, 'partial'); assert.equal(r2.code, 'shape'); assert.equal(r2.summary, 'prose again');
  assert.equal(ask2.calls.length, 2, 'never a third time');
});

test('⑨ a server refusal is `refused` with its code; a request that never came back is `unobservable`, not `failed`', async () => {
  for (const code of REFUSAL_CODES) {
    const e = new Error('refused'); e.code = code;
    const r = await run1(fakeAsk([e]));
    assert.equal(r.state, 'refused', code); assert.equal(r.code, code);
  }
  const net = new Error('net'); net.code = 'network'; net.status = 0;
  assert.equal((await run1(fakeAsk([net]))).state, 'unobservable');
  const prov = new Error('p'); prov.code = 'provider_unavailable'; prov.status = 502;
  assert.equal((await run1(fakeAsk([prov]))).state, 'failed');
});

test('⑩ shapeOf keeps only real coordinates and claims', () => {
  const s = shapeOf({ summary: 'x', findings: [{ claim: 'a', lat: 200, lon: 0 }, { claim: '' }, { claim: 'b', lat: 1, lon: 2 }] });
  assert.equal(s.ok, true);
  assert.equal(s.out.findings.length, 2);
  assert.equal(s.out.findings[0].lat, undefined, 'an impossible latitude is not passed on');
  assert.equal(s.out.findings[1].lon, 2);
});

/* ── the server's policy and prices ──────────────────────────────────────── */
test('⑪ the policy is configuration: an unset environment is the defaults, never zero; "off" is the kill switch', () => {
  const env = (o) => (k) => o[k] || '';
  assert.deepEqual({ ...delegationPolicy(env({})) }, { ...DELEGATION_DEFAULTS });
  assert.equal(delegationPolicy(env({ ATLAS_DELEGATION: 'off' })).mode, 'off');
  assert.equal(delegationPolicy(env({ ATLAS_DELEGATION: 'shared' })).mode, 'shared');
  assert.equal(delegationPolicy(env({ ATLAS_DELEGATION: 'nonsense' })).mode, DELEGATION_DEFAULTS.mode);
  assert.equal(delegationPolicy(env({ ATLAS_DELEGATION_CHILDREN: '5', ATLAS_DELEGATION_CHILD_CALLS: '4' })).maxChildren, 5);
  assert.equal(turnCostCapMicros(env({})), TURN_COST_CAP_USD * 1e6);
  assert.equal(turnCostCapMicros(env({ AI_TURN_COST_CAP_USD: '7.5' })), 7_500_000);
});

test('⑫ a price is known or the most expensive row — an unknown model can reach the cap early, never pass it', () => {
  const sol = priceOf('gpt-6.1-sol');
  assert.equal(sol.known, true);
  const unknown = priceOf('gpt-99-imaginary');
  assert.equal(unknown.known, false);
  const rows = Object.values(MODEL_PRICE_USD_PER_MTOK);
  assert.equal(unknown.output, Math.max(...rows.map((r) => r.output)));
  /* the measured most expensive production turn (config.ts TURN_COST_CAP_USD): $0.61 at sol prices */
  const usd = costMicros('gpt-6.1-sol', { input: 367309, cached_read: 79461, output: 1803 }, 'openai') / 1e6;
  assert.ok(usd > 0.60 && usd < 0.62, String(usd));
  assert.ok(TURN_COST_CAP_USD / usd > 4, 'the cap leaves room for workers at the same scale');
  /* Anthropic reports the uncached remainder: the cached part is added, not subtracted */
  assert.ok(costMicros('claude-haiku-4-5-20251001', { input: 1000, cached_read: 1000, output: 0 }, 'anthropic') > costMicros('claude-haiku-4-5-20251001', { input: 1000, cached_read: 1000, output: 0 }, 'openai'));
});

test('⑬ the worker task exists, is the only task a worker call may carry, and is only a worker\'s', () => {
  assert.equal(TASKS.get('atlas_delegate').delegate, true);
  assert.deepEqual([...TASKS.values()].filter((t) => t.delegate).map((t) => t.name), ['atlas_delegate']);
  /* the refusal sits after the task is known and before any provider is called — read where it stands */
  const src = readFileSync(new URL('../supabase/functions/ai-proxy/ask.ts', import.meta.url), 'utf8');
  const gate = src.indexOf('if (!!parentTurn !== !!spec.delegate)');
  assert.ok(gate > src.indexOf('const spec = TASKS.get(task)!') && gate < src.indexOf('const answer = async'), 'the task gate precedes the provider call');
  assert.ok(src.indexOf('reserveSpend(') < src.indexOf('const answer = async'), 'the spend is reserved before the provider is called');
});

/* ── (delegation-limits) measured on production 2026-11-19 ───────────────────── */
test('⑭ a failed worker says why, as the server said it (timeout, status) — the refunded ledger row cannot', async () => {
  const e = new Error('The AI provider timed out.'); e.code = 'provider_unavailable'; e.status = 503; e.meta = { timeout: true, model: 'gpt-6.2-sol' };
  const r = await run1(fakeAsk([e]));
  assert.equal(r.state, 'failed');
  assert.equal(r.detail.timeout, true);
  assert.equal(r.detail.status, 503);
});

test('⑮ research.delegate refuses past the server\'s policy before anything is spent, and says the number', async () => {
  const caps = (await import('../js/atlas-cap-research.js')).default;
  const entry = caps.find((c) => c.row[0] === 'research.delegate');
  let asked = 0;
  const K = {
    R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 't5-1', turnSignal: () => undefined, askAIJSONEnvelope: async () => { asked++; return { data: { summary: 's' }, meta: {} }; },
    _delegationPolicy: { mode: 'independent', maxChildren: 2, childMaxCalls: 3 },
  };
  const three = { tasks: [{ goal: 'a' }, { goal: 'b' }, { goal: 'c' }] };
  const r = await entry.run(three, {}, K);
  assert.equal(r.ok, false); assert.equal(r.meta.code, 'too_many_tasks'); assert.equal(r.meta.maxChildren, 2); assert.equal(r.meta.given, 3);
  assert.equal(asked, 0, 'no worker was asked');
  const off = await entry.run(three, {}, Object.assign({}, K, { _delegationPolicy: { mode: 'off' } }));
  assert.equal(off.meta.code, 'delegation_off'); assert.equal(asked, 0);
  const two = await entry.run({ tasks: [{ goal: 'a' }, { goal: 'b' }] }, {}, K);
  assert.equal(two.ok, true); assert.equal(asked, 2, 'within the policy, both run');
  const unknown = await entry.run({ tasks: [{ goal: 'x' }, { goal: 'y' }, { goal: 'z' }] }, {}, Object.assign({}, K, { _delegationPolicy: null }));
  assert.equal(unknown.meta.delegated.length, 3, 'with no policy reported yet, the server decides');
});

test('⑯ every Atlas turn answer states the worker policy; the console reads it from there', () => {
  const ask = readFileSync(new URL('../supabase/functions/ai-proxy/ask.ts', import.meta.url), 'utf8');
  assert.match(ask, /spec\.protocol2 \? \{ delegationPolicy: \{ mode: delegation\.mode, maxChildren: delegation\.maxChildren, childMaxCalls: delegation\.childMaxCalls \} \}/);
  const con = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(con, /env\.meta\.delegationPolicy/);
  assert.match(con, /get _delegationPolicy\(\)/);
});
