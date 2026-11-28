import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeGoalVerify } from '../js/atlas-goal-verify.js';
import { makeAtlasWorkingMemory } from '../js/atlas-working-memory.js';

const AGENT = makeAtlasAgent();
const TOOLS = { measure: { name: 'measure', description: 'measure', parameters: { type: 'object', properties: {} } } };
const answer = { text: 'Comparison shown.', toolCalls: [] };
const user = { role: 'user', content: 'Compare only the selected red line under the previous conditions.' };

test('the independent reader gets the middle of the request and answer and the goal of the current plan', async () => {
  const need = 'Use the 1889 administrative boundary.';
  const finding = 'The measured difference was 87 metres.';
  const request = 'x'.repeat(1580) + '\n' + need + '\n' + 'y'.repeat(1580);
  const text = 'x'.repeat(1580) + '\n' + finding + '\n' + 'y'.repeat(1580);
  const verify = makeGoalVerify({ ask: async (prompt) => {
    assert.ok(prompt.includes(need));
    assert.ok(prompt.includes(finding));
    assert.ok(prompt.includes('Measure the ridge'));
    return { data: { unmet: [] } };
  } });
  assert.deepEqual(await verify({ request, text, plan: { id: 2, goal: 'Measure the ridge', thisTurn: true } }), { unmet: [] });
});

test('the full record uses the text channel when it exceeds the prompt ceiling', async () => {
  const firstPart = 120000 - 'REQUEST (the reader\'s own words):\n'.length - 1;
  const request = 'x'.repeat(firstPart) + '\u{1F5FA}' + 'x'.repeat(16000) + '\nUse the middle boundary.\n' + 'y'.repeat(135000);
  const answer = 'x'.repeat(3000) + '\nThe actual count is 87.\n' + 'y'.repeat(3000);
  let received;
  const verify = makeGoalVerify({ ask: async (prompt, system, images, options) => {
    received = { prompt, files: options.files };
    return { data: { unmet: [] } };
  } });
  assert.deepEqual(await verify({ request, text: answer }), { unmet: [] });
  assert.ok(received.prompt.length < 24000);
  assert.ok(received.files.length > 1);
  assert.ok(received.files.every(({ text }) => text.length <= 120000));
  assert.ok(received.files[1].text.startsWith('\u{1F5FA}'), 'both halves of the supplementary character reach the same text part');
  const record = received.files.map(({ text }) => text).join('');
  assert.ok(record.includes(request));
  assert.ok(record.endsWith(answer));
});

test('a trimmed input or incomplete provider answer cannot confirm a goal', async () => {
  for (const meta of [{ inputTrimmed: { promptChars: 25000, promptKept: 24000 } }, { status: 'incomplete' }]) {
    const verify = makeGoalVerify({ ask: async () => ({ data: { unmet: [] }, meta }) });
    assert.equal(await verify({ request: user.content, text: answer.text }), null);
  }
});

test('follow-up verification reads the earlier user request, fixed conditions, and initial map targets', async () => {
  const memory = makeAtlasWorkingMemory();
  memory.recordTurn({ question: 'Compare only prefectures north of the ridge.', turnId: 1, decisions: { year: 1889 } });
  memory.beginTurn(2, user.content);
  let reviewed = '';
  const verify = makeGoalVerify({ ask: async (prompt) => { reviewed = prompt; return { data: { unmet: [] } }; } });
  await AGENT.runTurn({ model: async () => answer, tools: TOOLS, execute: async () => ({ ok: true }), messages: [user], verify, memory,
    verifierContext: { map: { objects: { items: [{ id: 'line-7', kind: 'line', color: '#ff0000' }] } }, workingContext: 'Focus: north of the ridge' } });
  assert.match(reviewed, /Compare only prefectures north of the ridge/);
  assert.match(reviewed, /"key":"year","value":1889/);
  assert.match(reviewed, /"id":"line-7","kind":"line","color":"#ff0000"/);
  assert.match(reviewed, /Focus: north of the ridge/);
});

test('an inconclusive read accepts the answer without claiming that the goal was verified', async () => {
  const out = await AGENT.runTurn({ model: async () => answer, tools: TOOLS, execute: async () => ({ ok: true }), messages: [user],
    verify: async () => ({ unmet: [], met: [{ need: 'comparison shown', how: 'answer' }], unconfirmed: [{ need: 'red line only' }] }) });
  assert.equal(out.completion, 'complete');
  assert.equal(out.trace.goalCheck, 'unobserved');
  assert.deepEqual(out.trace.goalUnconfirmed.map((need) => need.need), ['red line only']);
  assert.equal(out.trace.goalLedger.met[0].need, 'comparison shown');
});

test('a blank verification verdict does not record the goal as observed', async () => {
  const out = await AGENT.runTurn({ model: async () => answer, tools: TOOLS, execute: async () => ({ ok: true }), messages: [user],
    verify: async () => ({ unmet: [], met: [] }) });
  assert.equal(out.completion, 'complete');
  assert.equal(out.trace.goalCheck, 'unobserved');
});

for (const secondRead of [null, { unmet: [] }, { unmet: [], met: [{ need: 'unrelated', how: 'headline' }] },
  { unmet: [], met: [{ need: 'red line only', prev: 'g1' }] }, { unmet: [], unconfirmed: [{ need: 'red line only', prev: 'g1' }] }]) {
  test('a later read without confirming the known gap preserves it: ' + JSON.stringify(secondRead), async () => {
    let step = 0, round = 0;
    const out = await AGENT.runTurn({
      model: async () => [answer, { text: '', toolCalls: [{ id: 'c1', name: 'measure', arguments: {} }] }, answer][step++],
      tools: TOOLS, execute: async () => ({ ok: true }), messages: [user],
      verify: async () => ++round === 1 ? { unmet: [{ need: 'red line only', why: 'no line measured' }] } : secondRead,
    });
    assert.equal(round, 2);
    assert.equal(out.trace.goalCheck, 'unobserved');
    assert.equal(out.completion, 'partial');
    assert.deepEqual(out.unmet.map((need) => need.need), ['red line only']);
  });
}

test('positive evidence closes the same gap by its stable id after rewording', async () => {
  let step = 0, round = 0;
  const verify = makeGoalVerify({ ask: async () => ({ data: ++round === 1
    ? { unmet: [{ need: 'red line only', why: 'no line measured', seen: 'missing' }] }
    : { unmet: [], met: [{ need: 'comparison uses just the chosen feature', prev: 'g1', how: 'the inputs contain only line-7' }] } }) });
  const out = await AGENT.runTurn({
    model: async () => [answer, { text: '', toolCalls: [{ id: 'c1', name: 'measure', arguments: {} }] }, answer][step++],
    tools: TOOLS, execute: async () => ({ ok: true }), messages: [user], verify,
  });
  assert.equal(round, 2);
  assert.equal(out.trace.goalCheck, 'met');
  assert.equal(out.completion, 'complete');
  assert.deepEqual(out.unmet, []);
});

test('an objection keeps its reason for review and preserves the confirmed gap', async () => {
  let modelCalls = 0;
  const out = await AGENT.runTurn({
    model: async () => ++modelCalls === 1 ? answer : { ...answer, noteToIntMap: 'The comparison already suffices.' },
    tools: TOOLS, execute: async () => ({ ok: true }), messages: [user],
    verify: async () => ({ unmet: [{ need: 'red line only', why: 'no line measured' }] }),
  });
  assert.equal(modelCalls, 2);
  assert.equal(out.trace.goalContested.reason, 'The comparison already suffices.');
  assert.equal(out.completion, 'partial');
  assert.deepEqual(out.unmet.map((need) => need.need), ['red line only']);
});
