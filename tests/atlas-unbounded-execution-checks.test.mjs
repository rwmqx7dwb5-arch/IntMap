/* ============================================================================
 *  tests/atlas-unbounded-execution-checks.test.mjs — no fixed count decides how long Atlas works
 *  (dev-notes/2026-11-24-atlas-unbounded-execution.md)
 * ----------------------------------------------------------------------------
 *  The user's decision (2026-11-24): the fixed ceilings of an Atlas turn — 8 model calls, 32 tool
 *  calls, 8 calls per reply, 2 output-gate bounces, a 600 s turn clock — are abolished. A turn stops
 *  on a FACT: Atlas finished, asked, or was stopped; the loop knows nothing new is coming (the same
 *  answered call again, nothing but rejected calls, the same contradiction from the same reply); or
 *  the server refused the next call for money. And a stopped turn is not made to write an answer it
 *  could not reach: it ends with what it has, the sentences written on the way kept.
 *
 *  These are PROPERTIES, not numbers: nothing below asserts the value of a limit. Every scripted
 *  model either stops by itself or is the subject of a stop the loop must find.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';

const AGENT = makeAtlasAgent();
const TOOLS = {
  measure: { name: 'measure', description: 'measure', parameters: { type: 'object', required: ['what'], properties: { what: { type: 'string', minLength: 1 } } } },
  zzz: { name: 'zzz', description: 'draws', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } },
};
function scripted(fn) {
  const seen = [];
  const m = async (req) => { seen.push(req); return fn(req, seen.length - 1); };
  m.seen = seen;
  return m;
}
const user = (q) => [{ role: 'user', content: q }];
const okExec = () => { const calls = []; return { calls, execute: async (c) => { calls.push(c); return { ok: true, html: '<div>ok</div>' }; } }; };

test('① a turn that keeps making progress is never cut by a count — 20 distinct steps, then the answer', async () => {
  const N = 20;
  const model = scripted((req, i) => (i < N
    ? { text: '', toolCalls: [{ id: 'c' + i, name: 'measure', arguments: { what: 'leg-' + i } }] }
    : { text: 'All twenty legs measured.', toolCalls: [] }));
  const ex = okExec();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: user('measure every leg') });
  assert.equal(out.stopped, 'answered');
  assert.equal(out.text, 'All twenty legs measured.');
  assert.equal(ex.calls.length, N, 'every distinct call ran');
  assert.equal(model.seen.length, N + 1, 'no forced final, no cut');
  assert.equal(model.seen.filter((r) => r.final).length, 0);
});

test('② every call of one reply runs — none is answered «not run» for being one too many', async () => {
  const many = Array.from({ length: 15 }, (_, k) => ({ id: 'm' + k, name: 'measure', arguments: { what: 'p' + k } }));
  const model = scripted((req, i) => (i === 0 ? { text: '', toolCalls: many } : { text: 'done', toolCalls: [] }));
  const ex = okExec();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: user('q') });
  assert.equal(ex.calls.length, 15);
  assert.ok(!out.results.some((r) => r && r.error === 'step_call_limit'));
});

test('③ no turn clock: a turn whose clock reads hours still finishes its work', async () => {
  let t = 0;
  const now = () => (t += 3_600_000);   /* every read is an hour later */
  const model = scripted((req, i) => (i < 3 ? { text: '', toolCalls: [{ id: 'c' + i, name: 'measure', arguments: { what: 'x' + i } }] } : { text: 'ok', toolCalls: [] }));
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q'), now });
  assert.equal(out.stopped, 'answered');
  assert.ok(!out.results.some((r) => r && r.error === 'time_budget_exhausted'));
});

test('④ no progress still stops: the same answered call made again ends the turn (repeated_calls)', async () => {
  const model = scripted(() => ({ text: 'checking', toolCalls: [{ id: 'same', name: 'measure', arguments: { what: 'one' } }], turnState: 'continuing' }));
  const ex = okExec();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: user('q') });
  assert.equal(out.stopped, 'repeated_calls');
  assert.equal(ex.calls.length, 1, 'the tool ran once');
  assert.ok(model.seen.length <= 3);
});

test('⑤ a stopped turn is not made to write an answer it could not reach — the words on the way are kept', async () => {
  const model = scripted(() => ({ text: 'Comparing the two rankings now.', toolCalls: [{ id: 'same', name: 'measure', arguments: { what: 'gdp' } }], turnState: 'continuing' }));
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q') });
  assert.equal(out.stopped, 'repeated_calls');
  assert.equal(model.seen.filter((r) => r.final).length, 0, 'no forced final');
  assert.equal(out.text, '', 'the provisional sentence is not promoted into the answer');
  assert.deepEqual(out.interim.map((x) => x.text), ['Comparing the two rankings now.'], 'kept once, not once per step');
});

test('⑥ the server refusing for money ends the turn as `budget`, with no further call', async () => {
  for (const code of ['turn_cost', 'day_cost']) {
    const model = scripted((req, i) => {
      if (i === 2) { const e = new Error('spent'); e.code = code; e.status = 409; e.retryable = false; throw e; }
      return { text: 'Step ' + i + ' done, continuing.', toolCalls: [{ id: 'c' + i, name: 'measure', arguments: { what: 'x' + i } }] };
    });
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q') });
    assert.equal(out.stopped, 'budget', code);
    assert.ok(AGENT.CUT_STOPS.budget === 1, 'budget is a stop that cut the turn short');
    assert.equal(model.seen.length, 3, 'nothing was tried after the refusal');
    assert.equal(out.interim.length, 2);
  }
  /* a transport failure is still a transport failure */
  const model = scripted((req, i) => { if (i === 1) throw new Error('network'); return { text: '', toolCalls: [{ id: 'c', name: 'measure', arguments: { what: 'x' } }] }; });
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q') });
  assert.equal(out.stopped, 'transport');
});

test('⑦ the output gate hands back again while the reply moves, and stops when it does not', async () => {
  let n = 0;
  const model = scripted(() => (++n <= 5 ? { text: 'Draft ' + n + ' of the map answer.', toolCalls: [], answerMode: 'map' } : { text: 'Final draft.', toolCalls: [], answerMode: 'map' }));   /* then the same reply again: no progress */
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q') });
  assert.ok(out.trace.outputGate > 2, 'a changing reply is handed back more than the old ceiling allowed — ' + out.trace.outputGate);
  /* …and the identical reply twice ends it */
  const same = scripted(() => ({ text: 'The map shows it.', toolCalls: [], answerMode: 'map' }));
  const o2 = await AGENT.runTurn({ model: same, tools: TOOLS, execute: okExec().execute, messages: user('q') });
  assert.equal(o2.trace.outputGate, 1);
  assert.equal(o2.stopped, 'output_unmet');
});

test('⑧ Atlas declares what its next reply needs: effort and output reach the next model call', async () => {
  const model = scripted((req, i) => (i === 0
    ? { text: '', toolCalls: [{ id: 'a', name: 'measure', arguments: { what: 'x' } }], nextEffort: 'xhigh', nextOutput: 12000 }
    : { text: 'long report', toolCalls: [] }));
  await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q') });
  assert.equal(model.seen[0].effort, undefined, 'the first call carries no declaration');
  assert.equal(model.seen[1].effort, 'xhigh');
  assert.equal(model.seen[1].maxOutput, 12000);
  /* readReply reads them from what the model wrote; null (the strict dialect's «absent») is no declaration */
  const r = AGENT.readReply({ final_text: 'x', next_effort: 'high', next_output_tokens: 9000 }, '', JSON.parse, {}, []);
  assert.equal(r.nextEffort, 'high'); assert.equal(r.nextOutput, 9000);
  const r0 = AGENT.readReply({ final_text: 'x', next_effort: null, next_output_tokens: null }, '', JSON.parse, {}, []);
  assert.equal(r0.nextEffort, ''); assert.equal(r0.nextOutput, 0);
  assert.ok(AGENT.FINAL_SCHEMA.properties.next_effort && AGENT.FINAL_SCHEMA.properties.next_output_tokens);
  assert.deepEqual(AGENT.FINAL_SCHEMA.required, ['final_text'], 'both stay optional');
});

test('⑨ a bound a CALLER passes is still honoured (the node checks and a scripted child use it)', async () => {
  const model = scripted((req, i) => ({ text: '', toolCalls: [{ id: 'c' + i, name: 'measure', arguments: { what: 'x' + i } }] }));
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec().execute, messages: user('q'), limits: { maxSteps: 3 } });
  assert.equal(out.stopped, 'step_budget');
  assert.equal(model.seen.length, 3, 'and no forced final after the cut');
});

test('⑩ the defaults bound nothing — no count, no clock, no bounce budget', () => {
  const L = AGENT.LIMITS;
  for (const k of ['maxSteps', 'maxToolCalls', 'maxPerStep', 'maxOutputGate']) assert.equal(L[k], Infinity, k);
  assert.ok(!(L.turnBudgetMs > 0), 'no turn clock');
  assert.ok(L.toolTimeoutMs > 0, 'one tool call is still told when it did not finish');
});
