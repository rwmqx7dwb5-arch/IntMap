/* (atlas-completion) WHETHER A TURN DELIVERED WHAT IT DECLARED — js/atlas-agent.js runTurn.
 *
 *  MEASURED before this: a model that declared answer_mode "map" three times and drew nothing ended
 *  {"modelCalls":3,"stopped":"answered","mapDrawn":false,"outputGate":2} — the output gate's two
 *  bounces ran out and the turn reported the same success as one that drew. A plan step the turn
 *  failed was not compared against anything either. And three failures left no trace of themselves:
 *  a provider reply marked incomplete, a forced last hand-back that threw (an empty catch), and a
 *  transport Error's code / status / retryable flattened into its message.
 *
 *  These drive the REAL runTurn with a scripted model; nothing is read off the source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeAtlasPlan } from '../js/atlas-plan.js';

const AGENT = makeAtlasAgent();
const TOOLS = {
  zzz: { name: 'zzz', description: 'draws', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } },
};
const USER = [{ role: 'user', content: 'x' }];

function scripted(replies) {
  let i = 0;
  const fn = async (req) => { const r = replies[Math.min(i, replies.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  fn.count = () => i;
  return fn;
}

test('atlas-completion ①: a "map" declared and never drawn ends output_unmet / partial, with the output listed', async () => {
  const model = scripted([{ text: 'ここに地図で示しました。', toolCalls: [], answerMode: 'map' }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  /* (atlas-unbounded-execution) the bounce ends on no progress, not a count: the same reply again is accepted as it stands */
  assert.equal(model.count(), 2, 'handed back once, then the identical reply is the answer as it stands');
  assert.equal(out.trace.outputGate, 1);
  assert.equal(out.stopped, 'output_unmet', 'not "answered"');
  assert.equal(out.completion, 'partial');
  assert.deepEqual(out.unmet, [{ kind: 'output', id: 'output:map', mode: 'map', code: 'map_not_drawn' }]);
  assert.equal(out.text, 'ここに地図で示しました。', 'the sentence Atlas wrote is returned as it stands');
  assert.equal(out.mapDrawn, false);
  assert.ok(!AGENT.CUT_STOPS.output_unmet, 'not a cut: the turn did not run out');
});

test('atlas-completion ②: a "mixed" answer is still met by a map OR a chart (MODE_NEEDS some), and a drawn map is complete', async () => {
  const drew = (modes) => async () => ({ ok: true, producedModes: modes });
  for (const [mode, modes] of [['map', ['map']], ['mixed', ['chart']], ['mixed', ['map']], ['chart', ['chart']]]) {
    const model = scripted([
      { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }], answerMode: mode },
      { text: 'done', toolCalls: [], answerMode: mode },
    ]);
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: drew(modes), messages: USER });
    assert.equal(out.stopped, 'answered', mode + ' met by ' + modes);
    assert.equal(out.completion, 'complete');
    assert.deepEqual(out.unmet, []);
  }
  /* no declaration, no plan: an ordinary answer is complete */
  const plain = await AGENT.runTurn({ model: scripted([{ text: 'La Seine fait 777 km.', toolCalls: [] }]), tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.equal(plain.completion, 'complete');
  assert.deepEqual(plain.unmet, []);
});

test('atlas-completion ③: a PLAN step observed failed makes the answered turn partial, with the step listed', async () => {
  const plan = makeAtlasPlan();
  const model = scripted([
    { text: '', toolCalls: [{ id: 'p', name: 'plan', arguments: { goal: 'g', steps: ['fetch', 'draw'], current: 1 } }, { id: 'a', name: 'zzz', arguments: { x: 'p' } }] },
    { text: '', toolCalls: [{ id: 'p2', name: 'plan', arguments: { current: 2 } }, { id: 'b', name: 'zzz', arguments: { x: 'q' } }] },
    { text: 'Here is what I found.', toolCalls: [] },
  ]);
  let n = 0;
  const execute = async () => (++n === 1 ? { ok: true, capability: 'data.fetch' } : { ok: false, error: 'failed', capability: 'map.draw' });
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute, messages: USER, plan });
  assert.equal(out.stopped, 'answered', 'stopped is unchanged — the plan is read into completion, not into stopped');
  assert.equal(out.completion, 'partial');
  assert.deepEqual(out.unmet, [{ kind: 'goal', need: 'draw · q', state: 'failed', why: 'failed' }]);

  /* the same plan, every step observed completed → complete */
  const plan2 = makeAtlasPlan();
  const m2 = scripted([
    { text: '', toolCalls: [{ id: 'p', name: 'plan', arguments: { goal: 'g', steps: ['fetch', 'draw'], current: 1 } }, { id: 'a', name: 'zzz', arguments: { x: 'p' } }] },
    { text: '', toolCalls: [{ id: 'p2', name: 'plan', arguments: { current: 2 } }, { id: 'b', name: 'zzz', arguments: { x: 'q' } }] },
    { text: 'Done.', toolCalls: [] },
  ]);
  const ok = await AGENT.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true, capability: 'x.y' }), messages: USER, plan: plan2 });
  assert.equal(ok.completion, 'complete');
  assert.deepEqual(ok.unmet, []);

  /* a plan from an EARLIER turn that this turn never touched is not held against this turn */
  const later = await AGENT.runTurn({ model: scripted([{ text: 'unrelated', toolCalls: [] }]), tools: TOOLS, execute: async () => ({ ok: true }), messages: USER, plan });
  assert.equal(later.completion, 'complete');
});

test('atlas-completion ④: readReply keeps how the provider said the reply ended, and runTurn records an incomplete one', async () => {
  assert.deepEqual(AGENT.readReply({ final_text: 'a' }, '', JSON.parse, { status: 'incomplete', incompleteReason: 'max_output_tokens' }).finish,
    { status: 'incomplete', reason: 'max_output_tokens' });
  assert.deepEqual(AGENT.readReply({ final_text: 'a' }, '', JSON.parse, { finishReason: 'end_turn' }).finish, { status: 'complete', reason: 'end_turn' });
  assert.deepEqual(AGENT.readReply({ final_text: 'a' }, '', JSON.parse).finish, { status: 'complete', reason: null });

  const model = scripted([{ text: 'cut off mid', toolCalls: [], finish: { status: 'incomplete', reason: 'max_output_tokens' } }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.deepEqual(out.trace.incomplete, [{ step: 0, reason: 'max_output_tokens' }]);
  assert.equal(out.outputIncomplete, true);
  const fine = await AGENT.runTurn({ model: scripted([{ text: 'ok', toolCalls: [] }]), tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.equal(fine.outputIncomplete, false);
  assert.equal(fine.trace.incomplete, undefined);
});

test('atlas-completion ⑤: a forced last hand-back that throws is recorded in trace.finalError, not swallowed', async () => {
  /* the tool ran, Atlas wrote nothing, so the loop asks once more — and that call fails */
  const err = Object.assign(new Error('provider refused'), { code: 'provider_blocked', status: 400, retryable: false });
  /* (atlas-unbounded-execution) the hand-back now follows a turn that FINISHED with nothing written (a stopped turn gets
     none): a call, then the empty reply twice — the gate bounces once, the identical reply is accepted, and the loop asks */
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }] },
    (req) => { if (req.final) throw err; return { text: '', toolCalls: [] }; },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.deepEqual(out.trace.finalError, { code: 'provider_blocked', status: 400, retryable: false, message: 'provider refused' });
  assert.equal(out.completion, 'none', 'nothing was written for the reader');
});

test('atlas-completion ⑥: a transport failure after step 0 keeps the Error\'s code / status / retryable', async () => {
  const err = Object.assign(new Error('temporarily unavailable'), { code: 'upstream_5xx', status: 503, retryable: true });
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }] },
    () => { throw err; },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.equal(out.stopped, 'transport');
  assert.equal(out.trace.transportError, 'temporarily unavailable', 'the string is unchanged');
  assert.deepEqual(out.trace.transportErrorInfo, { code: 'upstream_5xx', status: 503, retryable: true, message: 'temporarily unavailable' });
  /* an Error that says nothing about itself is null, never a guess */
  const bare = await AGENT.runTurn({ model: scripted([{ text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }] }, () => { throw new Error('x'); }]),
    tools: TOOLS, execute: async () => ({ ok: true }), messages: USER });
  assert.deepEqual(bare.trace.transportErrorInfo, { code: null, status: null, retryable: null, message: 'x' });
});

test('atlas-completion ⑦: execute is told the plan step its call is filed under, and still reads the turn\'s live facts', async () => {
  const plan = makeAtlasPlan();
  const seen = [];
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'before-plan' } }] },
    { text: '', toolCalls: [{ id: 'p', name: 'plan', arguments: { goal: 'g', steps: ['fetch', 'draw'], current: 2 } }, { id: 'b', name: 'zzz', arguments: { x: 'p' } }], webUsed: true },
    { text: 'done', toolCalls: [] },
  ]);
  const execute = async (call, turn) => { seen.push({ x: call.arguments.x, planStep: turn.planStep, ext: turn.externalContentSeen }); return { ok: true, capability: 'x.y' }; };
  await AGENT.runTurn({ model, tools: TOOLS, execute, messages: USER, plan });
  assert.deepEqual(seen, [
    { x: 'before-plan', planStep: -1, ext: false },   /* no plan declared yet this turn */
    { x: 'p', planStep: 1, ext: true },               /* 0-based index of step 2; externalContentSeen set on this step is read live */
  ]);
  /* without a plan ledger the step is -1 */
  const s2 = [];
  await AGENT.runTurn({ model: scripted([{ text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'q' } }] }, { text: 'ok', toolCalls: [] }]), tools: TOOLS,
    execute: async (c, t) => { s2.push(t.planStep); return { ok: true }; }, messages: USER });
  assert.deepEqual(s2, [-1]);
});
