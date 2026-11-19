/* delegation-agent-loop — a worker granted `tools` calls read capabilities itself, inside the server's per-worker request bound */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkerExecutor, normaliseContract, toolCallOf } from '../js/atlas-delegate.js';

const ctx = () => { const ev = []; return { ev, signal: undefined, emit: (kind, data) => { const e = { id: 'e' + ev.length, kind, data }; ev.push(e); return e; } }; };
const FINAL = { summary: 'done', findings: [{ claim: 'c' }] };
const env = (data) => ({ data, meta: { costUsd: 0.01 }, citations: [] });
function scripted(answers, seen) { let i = 0; return async (prompt) => { seen.push(prompt); return env(answers[Math.min(i++, answers.length - 1)]); }; }
const lane = (log) => ({ classify: (id) => (id === 'data.gis' || id === 'map.read' ? 'read' : id === 'map.draw' ? 'other' : 'unknown'),
  run: async (id, args) => { log.push([id, args]); return { ok: true, text: 'result of ' + id, meta: { n: 1 } }; }, describe: (id) => '{"type":"object","id":"' + id + '"}' });

test('the contract keeps a bounded, de-duplicated tool grant, and nothing for a worker without one', () => {
  const a = normaliseContract({ id: 'a', goal: 'g', tools: ['data.gis', 'data.gis', ' map.read '] });
  assert.deepEqual(a.contract.tools, ['data.gis', 'map.read']);
  assert.equal('tools' in normaliseContract({ id: 'b', goal: 'g' }).contract, false);
  assert.equal(normaliseContract({ id: 'c', goal: 'g', tools: Array.from({ length: 40 }, (_, i) => 't' + i) }).contract.tools.length, 12);
});

test('toolCallOf reads only a well-formed call', () => {
  assert.deepEqual(toolCallOf({ call: { capability: 'data.gis', args: { op: 'buffer' } } }), { capability: 'data.gis', args: { op: 'buffer' } });
  assert.equal(toolCallOf({ summary: 'x' }), null);
  assert.equal(toolCallOf({ call: { args: {} } }), null);
});

test('a worker calls a granted read capability, sees its result in the next request, then answers', async () => {
  const seen = [], log = [];
  const ex = makeWorkerExecutor({ ask: scripted([{ call: { capability: 'data.gis', args: { op: 'buffer' } } }, FINAL], seen), parentTurn: 'p', maxCalls: 4, capability: lane(log) });
  const c = ctx();
  const r = await ex.run({ id: 't', goal: 'g', tools: ['data.gis'] }, c);
  assert.equal(r.state, 'done'); assert.equal(r.calls, 2);
  assert.deepEqual(log, [['data.gis', { op: 'buffer' }]]);
  assert.match(seen[0], /CAPABILITIES YOU MAY CALL/); assert.match(seen[0], /data\.gis arguments: \{"type":"object"/);
  assert.match(seen[1], /RESULTS OF YOUR CALLS SO FAR/); assert.match(seen[1], /result of data\.gis/);
  assert.ok(c.ev.some((e) => e.kind === 'effect.done' && e.data.capability === 'data.gis' && e.data.costUsd === 0));
});

test('a capability outside the grant, or one that is not read-only, is not run and the worker is told', async () => {
  const seen = [], log = [];
  const ex = makeWorkerExecutor({ ask: scripted([{ call: { capability: 'map.draw', args: {} } }, FINAL], seen), parentTurn: 'p', maxCalls: 4, capability: lane(log) });
  const r = await ex.run({ id: 't', goal: 'g', tools: ['data.gis', 'map.draw'] }, ctx());
  assert.equal(r.state, 'done'); assert.equal(log.length, 0, 'map.draw is not read-only: never run');
  assert.doesNotMatch(seen[0], /map\.draw/, 'a non-read capability is not even offered');
  assert.match(seen[1], /FAILED: not in your grant/);
});

test('the last request is always asked for the answer, and a call made then is not run', async () => {
  const seen = [], log = [];
  const ex = makeWorkerExecutor({ ask: scripted([{ call: { capability: 'data.gis', args: { n: 1 } } }], seen), parentTurn: 'p', maxCalls: 2, capability: lane(log) });
  const r = await ex.run({ id: 't', goal: 'g', tools: ['data.gis'] }, ctx());
  assert.equal(seen.length, 2, 'no request beyond the server bound');
  assert.match(seen[1], /THIS IS YOUR LAST REQUEST/);
  assert.equal(log.length, 1, 'the call on the last request is not run');
  assert.notEqual(r.state, 'done');
});

test('without a grant, or without a lane, the worker is what it was: it only researches', async () => {
  const seen = [], log = [];
  const a = await makeWorkerExecutor({ ask: scripted([FINAL], seen), parentTurn: 'p', capability: lane(log) }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(a.state, 'done'); assert.doesNotMatch(seen[0], /CAPABILITIES YOU MAY CALL/);
  const b = await makeWorkerExecutor({ ask: scripted([FINAL], seen), parentTurn: 'p' }).run({ id: 't', goal: 'g', tools: ['data.gis'] }, ctx());
  assert.equal(b.state, 'done'); assert.doesNotMatch(seen[1], /CAPABILITIES YOU MAY CALL/);
});
