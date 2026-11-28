/* ============================================================================
 *  job-cost-routing — one finished piece of work has a cost record, a worker can be given a model by the task
 *  that needs it, and the same analysis on the same data is answered once.
 * ----------------------------------------------------------------------------
 *  Everything here EVALUATES the shipped code (the turn loop over a scripted model, the pure modules, the proxy's
 *  config functions) — no test reads a file for a spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeRunLedger, runLine, makeRunHistory } from '../js/atlas-run-ledger.js';
import { reusableCode, fingerprintInput, reuseKey, makeResultReuse } from '../js/atlas-result-reuse.js';
import { normaliseContract, contractKey, requestKey } from '../js/atlas-delegate.js';
import { delegationModelOptions, delegationModelHint } from '../supabase/functions/ai-proxy/config.ts';
import { createHash } from 'node:crypto';

const sha = async (t) => createHash('sha256').update(String(t)).digest('hex');

test('run ledger: sums what the proxy reported, tells delegated workers apart, and never counts «not reported» as free', () => {
  let t = 1000;
  const l = makeRunLedger({ now: () => t });
  l.model({ model: 'm-a', costUsd: 0.10, ms: 2000 });
  l.model({ model: 'm-a', costUsd: 0.05, ms: 1000, web: true });
  l.model({ model: 'm-b' /* the proxy said nothing about the cost */, ms: 500 });
  l.tool({ name: 'research.delegate', ms: 9000, delegatedCostUsd: 0.2, delegatedTasks: 2 });
  l.tool({ name: 'map.view', ms: 50, ok: false });
  t = 14000;
  const s = l.summary();
  assert.equal(s.modelCalls, 3);
  assert.equal(s.wallMs, 13000);
  assert.ok(Math.abs(s.parentCostUsd - 0.15) < 1e-9, 'the turn\'s own calls');
  assert.ok(Math.abs(s.delegatedCostUsd - 0.2) < 1e-9, 'the workers are a separate sum');
  assert.ok(Math.abs(s.costUsd - 0.35) < 1e-9, 'total = own + delegated');
  assert.equal(s.costUnknownCalls, 1, 'an unreported cost is counted, not added as zero');
  assert.equal(s.webCalls, 1);
  assert.equal(s.models[0].id, 'm-a');
  assert.equal(s.tools.find((x) => x.id === 'map.view').failed, 1);
  const line = runLine(s);
  assert.match(line, /unreported/, 'the line says its total is incomplete');
  assert.match(line, /m-a ×2/);
  assert.equal(runLine({ modelCalls: 0 }), null);
});

test('run ledger: a turn where no call reported a cost says so instead of printing $0', () => {
  const l = makeRunLedger({ now: () => 0 });
  l.model({ model: 'm' });
  assert.match(runLine(l.summary()), /cost not reported/);
});

test('run history keeps the last N and totals them', () => {
  const h = makeRunHistory(2);
  for (const c of [1, 2, 3]) { const l = makeRunLedger({ now: () => 0 }); l.model({ model: 'm', costUsd: c }); h.add(l.summary(), 'q' + c); }
  assert.equal(h.all().length, 2);
  assert.equal(h.totals().costUsd, 5);
});

test('the turn loop returns the run record: per-answer cost and model, tool time, delegated spend', async () => {
  const A = makeAtlasAgent();
  let i = 0;
  const replies = [
    { text: '', toolCalls: [{ id: 'a', name: 'map_view', arguments: { place: 'Rotterdam' } }], usage: { model: 'gpt-x', costUsd: 0.04, priceKnown: true } },
    { text: 'done', toolCalls: [], usage: { model: 'gpt-y', costUsd: 0.01, priceKnown: false } },
  ];
  const tools = { map_view: { name: 'map_view', description: 'm', parameters: { type: 'object', required: ['place'], properties: { place: { type: 'string', minLength: 1 } } } } };
  const r = await A.runTurn({
    model: async () => replies[i++], tools, execute: async () => ({ ok: true, delegatedCostUsd: 0.3, delegated: [{}, {}] }),
    messages: [{ role: 'user', content: 'q' }],
  });
  assert.equal(r.run.modelCalls, 2);
  assert.ok(Math.abs(r.run.parentCostUsd - 0.05) < 1e-9);
  assert.ok(Math.abs(r.run.costUsd - 0.35) < 1e-9, 'delegated workers are in the turn\'s total');
  assert.equal(r.run.unpricedCalls, 1);
  assert.deepEqual(r.run.models.map((m) => m.id).sort(), ['gpt-x', 'gpt-y']);
  assert.equal(r.run.tools[0].calls, 1);
  assert.equal(A.runHistory.all().length, 1, 'the turn is in the history');
  assert.equal(r.trace.run, r.run);
});

test('readReply carries the proxy\'s cost and served model onto the reply, and nothing when the proxy said nothing', () => {
  const A = makeAtlasAgent();
  const withMeta = A.readReply({ final_text: 'x' }, '', JSON.parse, { modelServed: 'gpt-s', costUsd: 0.02, priceKnown: true }, null);
  assert.deepEqual(withMeta.usage, { model: 'gpt-s', costUsd: 0.02, priceKnown: true });
  const none = A.readReply({ final_text: 'x' }, '', JSON.parse, {}, null);
  assert.equal(none.usage.costUsd, undefined);
});

/* ── model options ─────────────────────────────────────────────────────────────────────────────────── */
test('offered worker models: only priced ids, with their prices; an env list narrows it; an unknown id is not offered', () => {
  const env = (m) => (k) => m[k] || '';
  const open = delegationModelOptions(env({}), 'openai');
  assert.ok(open.length >= 2, 'the OpenAI chain is offered');
  assert.ok(open.every((o) => o.usdPerMTok.output > 0), 'every offered model carries its price');
  const narrowed = delegationModelOptions(env({ ATLAS_MODEL_OPTIONS: 'gpt-6-luna, not-a-priced-model' }), 'openai');
  assert.deepEqual(narrowed.map((o) => o.id), ['gpt-6-luna']);
  assert.deepEqual(delegationModelOptions(env({ ATLAS_MODEL_OPTIONS: 'nothing-priced' }), 'openai'), []);
});

test('a model hint is honoured only when offered; otherwise ignored with a reason', () => {
  const opts = delegationModelOptions((k) => '', 'openai');
  const id = opts[0].id;
  assert.deepEqual(delegationModelHint(id, opts), { model: id, ignored: '' });
  assert.deepEqual(delegationModelHint('gpt-unknown', opts), { model: '', ignored: 'not_offered' });
  assert.deepEqual(delegationModelHint('', opts), { model: '', ignored: '' });
});

test('a task\'s own model is part of its contract, its identity and its request key', () => {
  const a = normaliseContract({ goal: 'g', model: 'gpt-6-luna' });
  assert.equal(a.contract.model, 'gpt-6-luna');
  assert.equal(normaliseContract({ goal: 'g' }).contract.model, undefined);
  assert.notEqual(contractKey(a.contract), contractKey(normaliseContract({ goal: 'g' }).contract), 'a stronger model is not a duplicate');
  assert.notEqual(requestKey('p', 'auto', 'm1'), requestKey('p', 'auto', 'm2'));
  assert.equal(requestKey('p', 'auto'), requestKey('p', 'auto', ''), 'no model: the key is what it was');
});

/* ── result reuse ──────────────────────────────────────────────────────────────────────────────────── */
const input = (v, id = 'd1') => JSON.stringify([{ id, kind: 'vector', features: [{ properties: { v } }] }]);

test('reuse key follows the exact input accessible to the runtime', async () => {
  const f1 = await fingerprintInput(input(1), sha);
  const f2 = await fingerprintInput(input(1), sha);
  const f3 = await fingerprintInput(input(2), sha);
  assert.equal(f1, f2, 'the same payload yields the same fingerprint');
  assert.notEqual(f1, f3, 'an edited value is a different input');
  assert.notEqual(f1, await fingerprintInput(input(1, 'other-id'), sha), 'Python can also read the dataset ID');
  const k = (fp, code) => reuseKey({ kind: 'compute.run', spec: { code }, inputs: [fp], conditions: { r: 1 } }, sha);
  assert.equal(await k(f1, 'x=1'), await k(f2, 'x=1'));
  assert.notEqual(await k(f1, 'x=1'), await k(f1, 'x=2'), 'different code, different key');
  assert.equal(await reuseKey({ kind: 'k', spec: {}, inputs: [null] }, sha), null, 'an input that cannot be fingerprinted yields no key');
  assert.equal(await fingerprintInput(input('x'.repeat(50)), sha, 10), null, 'too large to hash: no fingerprint');
});

test('code that can answer differently from the same key is not reusable', () => {
  assert.equal(reusableCode('result = df.groupby("a").mean()'), true);
  assert.equal(reusableCode('import numpy as np\nresult = np.random.rand(3)'), false);
  assert.equal(reusableCode('import time\nresult = time.time()'), false);
});

test('the store serves a hit only while what it points at is unchanged, and counts what it saved', () => {
  const S = makeResultReuse({ max: 2, now: () => 7 });
  S.put('a', { datasets: [{ id: 'd1', count: 3 }], elapsedMs: 4000 });
  let alive = true;
  const hit = S.get('a', () => alive);
  assert.equal(hit.reused, true);
  assert.equal(S.stats().savedMs, 4000);
  alive = false;
  assert.equal(S.get('a', () => alive), null, 'a removed output is recomputed, not faked');
  assert.equal(S.stats().stale, 1);
  assert.equal(S.get(null), null);
  S.put('x', { v: 1 }); S.put('y', { v: 2 }); S.put('z', { v: 3 });
  assert.equal(S.stats().size, 2, 'bounded');
});

/* ── the sandbox, end to end through a stand-in Worker that speaks the real protocol ─────────────────── */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeComputeSandbox } = await import('../js/compute-sandbox.js');
const { makeGisDatasets } = await import('../js/gis-datasets.js');

function counting(started) {
  return class {
    constructor() { this.dead = false; started.n++; }
    postMessage(m) { if (m && m.t === 'run') setTimeout(() => { if (!this.dead && this.onmessage) this.onmessage({ data: { t: 'done', ok: true, observed: true, outputs: { result: JSON.stringify({ v: [{ x: 1 }], nf: 0 }) } } }); }, 0); }
    terminate() { this.dead = true; }
  };
}

test('compute.run: the same code on the same data runs once; changed data, removed output and random code run again', async () => {
  const D = makeGisDatasets();
  D.add({ id: 'in1', title: 't', features: [{ type: 'Feature', geometry: null, properties: { v: 1 } }] });
  const started = { n: 0 };
  const C = makeComputeSandbox({ Worker: counting(started), registry: D, publish: false });
  const call = (code) => C.run({ code, inputs: ['in1'] });
  const a = await call('result = rows(0)');
  assert.equal(a.ok, true); assert.equal(started.n, 1);
  const b = await call('result = rows(0)');
  assert.equal(b.reused, true, 'second identical call is answered from the first');
  assert.equal(started.n, 1, 'no second interpreter run');
  assert.equal(b.datasets[0].id, a.datasets[0].id, 'it points at the dataset that already exists');
  /* data edited → different content → recomputed */
  D.remove('in1'); D.add({ id: 'in1', title: 't', features: [{ type: 'Feature', geometry: null, properties: { v: 2 } }] });
  const c = await call('result = rows(0)');
  assert.notEqual(c.reused, true); assert.equal(started.n, 2);
  /* the output dataset removed → the cache cannot point at it */
  D.remove(c.datasets[0].id);
  const d = await call('result = rows(0)');
  assert.notEqual(d.reused, true); assert.equal(started.n, 3);
  /* code with randomness is never served from the cache */
  await call('import random\nresult = [random.random()]'); await call('import random\nresult = [random.random()]');
  assert.equal(started.n, 5);
  assert.ok(C.reuseStats().hits >= 1);
});
