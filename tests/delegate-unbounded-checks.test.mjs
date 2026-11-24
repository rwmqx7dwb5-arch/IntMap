/* ============================================================================
 *  delegate-unbounded — Atlas's delegation has no fixed COUNT; what stops a worker is progress, money and the user
 *  js/atlas-delegate.js (makeWorkerExecutor with maxCalls:null · makeDelegation's maxConcurrent queue) ·
 *  js/atlas-cap-research.js research.delegate (policy with null counts) · js/atlas-job-core.js (no silent truncation)
 *
 *  These assert PROPERTIES, not the numbers: with the server stating no count, every task runs; the queue never has more
 *  workers in flight than it was told and everything finishes; a worker with no call count stops when its output stops
 *  changing, when its different ways of asking are used up, or when it only repeats answered calls — and says why.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeWorkerExecutor, makeDelegation } = await import('../js/atlas-delegate.js');
const { normaliseContract, planJob } = await import('../js/atlas-job-core.js');
const caps = (await import('../js/atlas-cap-research.js')).default;
const entry = caps.find((c) => c.row[0] === 'research.delegate');

const ctx = () => { const ev = []; return { ev, signal: undefined, emit: (kind, data) => { const e = { id: 'e' + ev.length, kind, data }; ev.push(e); return e; } }; };
const FINAL = { summary: 'done', findings: [{ claim: 'a claim' }] };
const env = (data, text) => ({ data, text: text || '', meta: { costUsd: 0.01 }, citations: [] });
const script = (answers) => { let i = 0; const seen = []; const ask = async (prompt, sys, img, opts) => { seen.push({ prompt, opts }); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return env(a.data !== undefined ? a.data : a, a.text); }; ask.seen = seen; return ask; };
const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || null);
const lane = (log) => ({ classify: (id) => (id === 'read.a' || id === 'read.b' ? 'read' : 'unknown'), describe: () => '{}', run: async (id, args) => { log.push([id, args]); return { ok: true, text: 'answer of ' + id }; } });
const call = (capability, args) => ({ call: { capability, args: args || {} } });

test('a null count is no count: the research.delegate policy with null counts launches every task, and a number still bounds', async () => {
  const mk = (pol, n, over) => {
    const asked = [];
    const K = Object.assign({ R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: String, warn: (x) => x, _curTurnKey: 'root', turnSignal: () => undefined,
      _delegationPolicy: pol, askAIJSONEnvelope: async (p, s, i, o) => { asked.push(o); return env(FINAL); } }, over || null);
    return { K, asked, tasks: Array.from({ length: n }, (_, i) => ({ id: 't' + i, goal: 'piece ' + i })) };
  };
  const a = mk({ mode: 'independent', maxChildren: null, childMaxCalls: null, maxConcurrent: null }, 7);
  const r = await entry.run({ tasks: a.tasks, fresh: true }, {}, a.K);
  assert.notEqual(r.meta && r.meta.code, 'too_many_tasks');
  assert.equal(a.asked.length, 7, 'every one of the seven workers ran');
  const b = mk({ mode: 'independent', maxChildren: 2, childMaxCalls: 3 }, 3);
  const rb = await entry.run({ tasks: b.tasks, fresh: true }, {}, b.K);
  assert.equal(rb.ok, false); assert.equal(rb.meta.code, 'too_many_tasks', 'a NUMBER the server gives still bounds');
});

test('the queue: never more workers in flight than maxConcurrent, in order, and every task finishes', async () => {
  for (const [limit, total] of [[1, 5], [2, 7], [3, 3], [null, 6]]) {
    let flight = 0, peak = 0; const order = [];
    const executor = { id: 'x', async run(task) { order.push(task.id); flight++; peak = Math.max(peak, flight); await new Promise((r) => setTimeout(r, 5)); flight--; return { state: 'done', summary: task.id }; } };
    const D = makeDelegation({ parent: 'p', executor, maxConcurrent: limit });
    const res = await D.run(Array.from({ length: total }, (_, i) => ({ id: 't' + i, goal: 'g' + i })));
    assert.equal(res.length, total); assert.ok(res.every((r) => r.state === 'done'), 'nothing was dropped by queueing');
    if (limit !== null) assert.ok(peak <= limit, 'peak ' + peak + ' within ' + limit); else assert.equal(peak, total, 'null → all at once');
    if (limit === 1) assert.deepEqual(order, ['t0', 't1', 't2', 't3', 't4'], 'waiting tasks run in the order they were listed');
  }
});

test('the queue: dependencies still order tasks, hold no slot while waiting, and a cycle still fails input_cycle', async () => {
  const done = [];
  const executor = { id: 'x', async run(task) { await new Promise((r) => setTimeout(r, 3)); done.push(task.id); return { state: 'done', summary: task.id }; } };
  const D = makeDelegation({ parent: 'p', executor, maxConcurrent: 1 });
  const res = await D.run([{ id: 'b', goal: 'second', inputs: [{ from: 'a' }] }, { id: 'a', goal: 'first' }, { id: 'c', goal: 'third', inputs: [{ from: 'b' }] }]);
  assert.deepEqual(done, ['a', 'b', 'c'], 'a task that names an input starts after it, even when listed before it and with one slot');
  assert.ok(res.every((r) => r.state === 'done'));
  const cyc = await makeDelegation({ parent: 'p', executor, maxConcurrent: 1 }).run([{ id: 'x1', goal: 'g1', inputs: [{ from: 'x2' }] }, { id: 'x2', goal: 'g2', inputs: [{ from: 'x1' }] }]);
  assert.ok(cyc.every((r) => r.code === 'input_cycle'));
});

test('the queue: stopping the delegation releases the tasks still waiting for a slot', async () => {
  const executor = { id: 'x', run: (task, c) => new Promise((resolve) => { c.signal.addEventListener('abort', () => resolve({ state: 'cancelled' }), { once: true }); }) };
  const D = makeDelegation({ parent: 'p', executor, maxConcurrent: 1 });
  const p = D.run([{ id: 'a', goal: 'g1' }, { id: 'b', goal: 'g2' }, { id: 'c', goal: 'g3' }]);
  await new Promise((r) => setTimeout(r, 5)); D.cancelAll();
  const res = await p;
  assert.ok(res.every((r) => r.state === 'cancelled'), 'nobody is left waiting for ever');
});

test('a worker with no count repairs only while its output changes, and says why it stopped when it repeats itself', async () => {
  const same = script([{ data: { nonsense: 1 } }]);   /* the same malformed output, for ever */
  const r = await makeWorkerExecutor({ ask: same, parentTurn: 'p', maxCalls: null }).run({ id: 't', goal: 'g' }, ctx());
  assert.notEqual(r.state, 'done');
  assert.equal(same.seen.length, 2, 'one repair, asked once; the same output again ends it (not a third request)');
  assert.match(r.gaps.join(' '), /same output again/);
  const changing = script([{ data: { a: 1 } }, { data: { a: 2 } }, { data: { a: 3 } }, { data: { a: 4 } }, { data: { a: 5 } }, FINAL]);
  const r2 = await makeWorkerExecutor({ ask: changing, parentTurn: 'p', maxCalls: null }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(r2.state, 'done'); assert.ok(changing.seen.length > 2, 'while the output keeps changing it keeps repairing — no count stops it');
});

test('a worker with no count retries a transient failure only with a different request, and reports when they are used up', async () => {
  const a = script([fail('provider_unavailable'), fail('provider_unavailable'), fail('provider_unavailable'), fail('provider_unavailable')]);
  const r = await makeWorkerExecutor({ ask: a, parentTurn: 'p', maxCalls: null }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(r.state, 'failed'); assert.equal(r.code, 'provider_unavailable');
  assert.match(r.gaps.join(' '), /every different way of asking/);
  const prompts = a.seen.map((x) => x.prompt);
  assert.equal(new Set(prompts).size, prompts.length, 'no request was sent twice');
  assert.ok(a.seen.length >= 2 && a.seen.some((x) => x.opts.webMode === 'off'), 'it changed how it asked (the web off) before stopping');
  const ok = script([fail('timeout', { meta: { timeout: true } }), FINAL]);
  const r2 = await makeWorkerExecutor({ ask: ok, parentTurn: 'p', maxCalls: null }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(r2.state, 'partial'); assert.equal(r2.code, 'degraded');
});

test('a worker with no count answers a repeated capability call from the first result and two repeats in a row end it', async () => {
  const log = [];
  const ask = script([call('read.a', { q: 1 }), call('read.a', { q: 1 }), call('read.a', { q: 1 })]);
  const r = await makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: null, capability: lane(log) }).run({ id: 't', goal: 'g', tools: ['read.a'] }, ctx());
  assert.equal(log.length, 1, 'the call ran once; the repeats were answered from the first result');
  assert.equal(r.code, 'repeated_calls'); assert.match(r.gaps.join(' '), /twice in a row/);
  assert.match(ask.seen[2].prompt, /ALREADY ANSWERED/);
  const log2 = [];
  const ok = script([call('read.a', { q: 1 }), call('read.a', { q: 1 }), call('read.b', { q: 2 }), call('read.a', { q: 1 }), FINAL]);
  const r2 = await makeWorkerExecutor({ ask: ok, parentTurn: 'p', maxCalls: null, capability: lane(log2) }).run({ id: 't', goal: 'g', tools: ['read.a', 'read.b'] }, ctx());
  assert.equal(r2.state, 'done', 'a new call between the repeats is progress, so the worker carries on to its artifact');
  assert.equal(log2.length, 2);
});

test('a number the server gives still bounds the worker as before; with none given it is the old two-request worker', async () => {
  const log = [];
  const forever = script([call('read.a', { n: 1 }), call('read.b', { n: 2 }), call('read.a', { n: 3 }), call('read.b', { n: 4 }), call('read.a', { n: 5 })]);
  const r = await makeWorkerExecutor({ ask: forever, parentTurn: 'p', maxCalls: 3, capability: lane(log) }).run({ id: 't', goal: 'g', tools: ['read.a', 'read.b'] }, ctx());
  assert.equal(forever.seen.length, 3); assert.notEqual(r.state, 'done');
  const old = script([{ data: { x: 1 } }, { data: { x: 2 } }, { data: { x: 3 } }]);
  await makeWorkerExecutor({ ask: old, parentTurn: 'p' }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(old.seen.length, 2);
});

test('no silent truncation: every capability a parent names is granted, and no count refuses a plan', () => {
  const tools = Array.from({ length: 60 }, (_, i) => 'cap.' + i);
  assert.deepEqual(normaliseContract({ id: 'a', goal: 'g', tools }).contract.tools, tools);
  const plan = planJob(Array.from({ length: 50 }, (_, i) => ({ goal: 'g' + i })));
  assert.equal(plan.ok, true); assert.equal(plan.tasks.length, 50);
});
