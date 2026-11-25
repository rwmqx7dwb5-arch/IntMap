/* delegate-streaming — a slow child holds nothing back; a child can re-read what was cut; the width follows the provider; a worker is told how hard to think */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDelegation, makeWorkerExecutor } from '../js/atlas-delegate.js';

const tick = () => new Promise((r) => setTimeout(r, 5));

test('begin(): an early task is readable while a slow one still runs, and firstUsable does not wait for it', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const executor = { run: async (t) => { if (t.goal === 'slow') await gate; return { state: 'done', summary: t.goal, findings: [], costUsd: 0.01, calls: 1 }; } };
  const D = makeDelegation({ executor });
  const b = D.begin([{ id: 'fast', goal: 'fast' }, { id: 'slow', goal: 'slow' }]);
  await b.firstUsable;
  const early = b.settled();
  assert.equal(early[0].state, 'done'); assert.equal(early[1], null);
  release();
  const all = await b.all;
  assert.deepEqual(all.map((r) => r.state), ['done', 'done']);
});

test('run() is still begin().all: every task, in list order', async () => {
  const D = makeDelegation({ executor: { run: async (t) => ({ state: 'done', summary: t.goal, costUsd: 0, calls: 0 }) } });
  const r = await D.run([{ goal: 'a' }, { goal: 'b' }]);
  assert.deepEqual(r.map((x) => x.summary), ['a', 'b']);
});

test('width: a throttled worker halves the ceiling, a recovered one gives a slot back, and every task still runs', async () => {
  let n = 0;
  const executor = { run: async (t) => { n++; if (t.goal === 'bad') return { state: 'failed', code: 'provider_unavailable', detail: { status: 503 } }; await tick(); return { state: 'done', summary: t.goal }; } };
  const D = makeDelegation({ executor, maxConcurrent: 4 });
  const out = await D.run([{ goal: 'bad' }, { goal: 'a' }, { goal: 'b' }, { goal: 'c' }, { goal: 'd' }, { goal: 'e' }]);
  assert.equal(n, 6); assert.equal(out.length, 6);
  const w = D.log.all().filter((e) => e.kind === 'delegation.width').map((e) => e.data);
  assert.ok(w.length >= 1, 'the failure narrowed the width');
  assert.equal(w[0].ceiling, 2); assert.equal(w[0].why, 'provider_unavailable');
});

test('width: a stated ceiling is never exceeded when it recovers', async () => {
  let inflight = 0, peak = 0;
  const executor = { run: async (t) => { inflight++; peak = Math.max(peak, inflight); if (t.goal === 'bad') { inflight--; return { state: 'failed', code: 'timeout' }; } await tick(); inflight--; return { state: 'done', summary: t.goal }; } };
  const D = makeDelegation({ executor, maxConcurrent: 2 });
  await D.run([{ goal: 'bad' }, ...Array.from({ length: 8 }, (_, i) => ({ goal: 'g' + i }))]);
  assert.ok(peak <= 2, 'peak ' + peak);
});

test('effort: a contract carries it to the request as effortHint, and a different effort is a different request', async () => {
  const seen = [];
  const ask = async (prompt, sys, imgs, o) => { seen.push({ hint: o.effortHint, key: o.replayKey }); return { data: { summary: 'ok' }, meta: {} }; };
  const D = makeDelegation({ executor: makeWorkerExecutor({ ask }) });
  await D.run([{ goal: 'lookup', effort: 'low' }, { goal: 'lookup', effort: 'xhigh' }, { goal: 'plain' }, { goal: 'bogus', effort: 'ludicrous' }]);
  const by = Object.fromEntries(seen.map((x, i) => [i, x]));
  assert.deepEqual(seen.map((x) => x.hint), ['low', 'xhigh', undefined, undefined]);
  assert.notEqual(by[0].key, by[1].key);
});

test('a worker re-reads an answer that was cut, by reference and range — nothing is lost to the cut', async () => {
  const big = 'A'.repeat(4000) + 'MIDDLE' + 'B'.repeat(20000) + 'TAIL-MARK';
  const prompts = [];
  let step = 0;
  const ask = async (prompt) => {
    prompts.push(prompt); step++;
    if (step === 1) return { data: { calls: [{ capability: 'data.big', args: {} }] }, meta: {} };
    if (step === 2) return { data: { calls: [{ capability: 'read_step', args: { ref: '1', offset: 20000, length: 12000 } }] }, meta: {} };
    return { data: { summary: 'done' }, meta: {} };
  };
  const capability = { run: async () => ({ ok: true, text: big }), classify: () => 'read', describe: () => 'none' };
  const D = makeDelegation({ executor: makeWorkerExecutor({ ask, capability, maxCalls: null }) });
  const [r] = await D.run([{ goal: 'g', tools: ['data.big'] }]);
  assert.equal(r.state, 'done');
  assert.match(prompts[1], /read_step/);                          // the cut says how to read on
  assert.doesNotMatch(prompts[1], /TAIL-MARK/);                   // it was cut for the prompt…
  assert.match(prompts[2], /TAIL-MARK/);                          // …and the rest arrives on request
});

test('research.delegate wait:"any" returns after the first findings; asking the same list again waits for the rest, pays once', async () => {
  const caps = (await import('../js/atlas-cap-research.js')).default;
  const e = caps.find((c) => c.row[0] === 'research.delegate');
  let release; const gate = new Promise((r) => { release = r; });
  let asked = 0;
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'ta-stream-1', turnSignal: () => undefined, classifyCapability: () => 'read', runReadCapability: async () => ({ ok: true, text: 'x' }),
    _delegationPolicy: { mode: 'independent', maxChildren: null, childMaxCalls: null, maxConcurrent: null },
    askAIJSONEnvelope: async (prompt) => { asked++; if (/slowpiece/.test(prompt)) await gate; return { data: { summary: 's' }, meta: { costUsd: 0.1 } }; } };
  const tasks = [{ id: 'q', goal: 'quickpiece' }, { id: 'w', goal: 'slowpiece' }];
  const first = await e.run({ tasks, wait: 'any' }, {}, K);
  assert.equal(first.meta.status, 'partial'); assert.deepEqual(first.meta.pending, ['w']); assert.equal(first.meta.code, 'tasks_still_running');
  const second = e.run({ tasks, wait: 'all' }, {}, K);
  await tick(); release();
  const done = await second;
  assert.equal(done.meta.status, 'completed'); assert.equal(asked, 2, 'nothing asked twice');
  assert.ok(Math.abs(first.meta.delegatedCostUsd + done.meta.delegatedCostUsd - 0.2) < 1e-9, 'each task paid for once across the two answers');
});
