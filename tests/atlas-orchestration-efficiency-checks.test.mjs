/* Atlas orchestration efficiency — what the spend figure, the delegation record and the checkers must keep true.
   Every case runs the real code (nothing is read as text). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { costMicros, priceOf } from '../supabase/functions/_shared/ai-provider.js';
import { normalizeUsage } from '../supabase/functions/_shared/ai-usage.js';
import { journalArgs } from '../supabase/functions/_shared/ai-ledger.js';
import { makeDelegation, delegationKey, imagesShown } from '../js/atlas-delegate.js';
import { integrate } from '../js/atlas-orchestrate.js';

test('① cached input is subtracted once: normalised usage priced = uncached + cached + output', () => {
  const u = normalizeUsage('openai', { usage: { input_tokens: 10000, output_tokens: 0, input_tokens_details: { cached_tokens: 6000 } } });
  assert.deepEqual([u.input, u.cached_read], [4000, 6000]);
  const p = priceOf('gpt-6.2-sol');
  assert.equal(p.known, true, 'the production default model has its own row');
  assert.equal(costMicros('gpt-6.2-sol', u, 'openai'), 4000 * p.input + 6000 * p.cached);
  assert.ok(p.cached < p.input, 'a cache read is priced below fresh input');
});

test('② the journal row carries the call\'s cache read', () => {
  const a = journalArgs({ user: 'u', root: 'r', outcome: 'ok', total: { input: 100, cached_read: 40, output: 1 } });
  assert.equal(a.p_cached, 40);
  assert.equal(a.p_input, 140);
});

function fakeExecutor(log) {
  return { id: 't', async run(task) { log.push(task); return { state: 'done', summary: 'ok', findings: [{ claim: task.goal, source: 'u' }], costUsd: 0.01, calls: 1 }; } };
}
const W = (id, goal, extra) => Object.assign({ id, kind: 'worker', goal, returns: 'x' }, extra || {});

test('③ a worker\'s model reaches the executor (it used to stop at the contract)', async () => {
  const seen = [];
  const D = makeDelegation({ parent: 'p', executor: fakeExecutor(seen) });
  await D.run([W('a', 'one', { model: 'gpt-6-luna' }), W('b', 'two', { model: 'gpt-6.1-terra' })]);
  assert.deepEqual(seen.map((t) => t.model).sort(), ['gpt-6-luna', 'gpt-6.1-terra']);
});

test('④ the same list over a different picture is a different delegation', () => {
  const list = [W('a', 'read the map', { images: ['@view'] })];
  const osaka = (names) => imagesShown(names, { frames: () => ['data:image/png;base64,OSAKA'], framesText: () => '' });
  const tokyo = (names) => imagesShown(names, { frames: () => ['data:image/png;base64,TOKYO'], framesText: () => '' });
  assert.notEqual(delegationKey(list, osaka), delegationKey(list, tokyo));
  assert.equal(delegationKey(list, osaka), delegationKey(list, osaka), 'the same picture keeps its key, so a genuine resume still resumes');
  assert.equal(delegationKey([W('a', 'no image')]), delegationKey([W('a', 'no image')], osaka), 'a list with no images is unchanged by the shown-function');
});

test('⑤ a checker starts when its own task ends, not when the slowest task does', async () => {
  const order = [];
  const ex = { id: 't', async run(task) {
    order.push('start:' + task.id);
    await new Promise((r) => setTimeout(r, task.id === 'slow' ? 80 : 5));
    order.push('end:' + task.id);
    return { state: 'done', summary: 's', findings: [{ claim: 'c', source: 'u' }] };
  } };
  const D = makeDelegation({ parent: 'p', executor: ex });
  const res = await D.run([W('fast', 'f'), W('slow', 's')], { after: (r) => (r.id === 'fast' ? W('check-fast', 'check', { inputs: [{ from: 'fast' }] }) : null) });
  assert.ok(order.indexOf('start:check-fast') < order.indexOf('end:slow'), order.join(' '));
  assert.equal(res.followUps[0].state, 'done');
  assert.equal(res.followUps[1], null);
});

test('⑥ a reused result is another task\'s result again: its cost is counted once', () => {
  const r = (id, reused) => ({ id, state: 'done', findings: [], sources: [], gaps: [], costUsd: 0.02, calls: 1, reused });
  const c = integrate([r('a', false), r('b', true)]).cost;
  assert.equal(c.usd, 0.02);
  assert.equal(c.calls, 1);
});
