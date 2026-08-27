/* ============================================================================
 *  R406 — THE TURN LOOP, DRIVEN THE WAY THE BROWSER DRIVES IT
 * ----------------------------------------------------------------------------
 *  These run js/atlas-agent.js — the module the browser loads, not a copy — against a scripted
 *  model. `model` and `execute` are injected there for exactly this reason, so every assertion
 *  below is about the real implementation. 「通常経路とテスト対象が同じ実装を使用する」.
 *
 *  ⚠ NO TEST HERE MATCHES ON THE USER'S WORDS. The scripted model decides what to do, the way the
 *  real one does; what is asserted is what the LOOP does with that decision. A test that pinned
 *  「セーヌ川の長さは・」 to an expected branch would be re-introducing, in the test file, the exact
 *  thing this round removed from the source.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';

const AGENT = makeAtlasAgent();

/* A scripted model: a queue of replies, and a record of what it was shown. */
function scripted(replies) {
  const seen = [];
  let i = 0;
  const fn = async (req) => {
    seen.push(req);
    const r = replies[Math.min(i, replies.length - 1)];
    i++;
    return typeof r === 'function' ? r(req) : r;
  };
  fn.seen = seen;
  fn.count = () => i;
  return fn;
}

const TOOLS = {
  map_view: {
    name: 'map_view',
    description: 'Move the map.',
    parameters: { type: 'object', required: ['place'], properties: { place: { type: 'string', minLength: 1 } } },
  },
  highlight: {
    name: 'highlight',
    description: 'Highlight a place.',
    parameters: { type: 'object', required: ['target'], properties: { target: { type: 'string', minLength: 1 } } },
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web.',
    parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } } },
  },
};

const okExec = async (call) => ({ ok: true, name: call.name, observed: 'done' });

test('R406-agent ①: a reply with no tool calls ends the turn, runs nothing, and is the answer', async () => {
  let executed = 0;
  const model = scripted([{ text: 'La Seine fait environ 777 km.', toolCalls: [] }]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: async () => { executed++; return { ok: true }; },
    messages: [{ role: 'user', content: 'セーヌ川の長さは・' }],
  });
  assert.equal(r.text, 'La Seine fait environ 777 km.');
  assert.equal(executed, 0, 'a direct answer executed a tool');
  assert.equal(r.calls, 0);
  assert.equal(r.stopped, 'answered');
  assert.equal(model.count(), 1, 'a direct answer cost more than one model call');
});

test('R406-agent ②: the model is offered the tools and may decline them — nothing forces an action', async () => {
  const model = scripted([{ text: 'ok', toolCalls: [] }]);
  await AGENT.runTurn({ model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'hi' }] });
  const offered = (model.seen[0].tools || []).map((t) => t.name).sort();
  assert.deepEqual(offered, ['highlight', 'map_view', 'web_search'], 'the turn did not offer its tools');
});

test('R406-agent ③: a malformed call is handed BACK to the model, not to the reader, and it retries', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'highlight', arguments: {} }] },          /* missing required `target` */
    { text: '', toolCalls: [{ id: 'b', name: 'highlight', arguments: { target: 'France' } }] },
    { text: 'Highlighted France.', toolCalls: [] },
  ]);
  const ran = [];
  const r = await AGENT.runTurn({
    model, tools: TOOLS, messages: [{ role: 'user', content: 'x' }],
    execute: async (c) => { ran.push(c.arguments); return { ok: true }; },
  });
  assert.deepEqual(ran, [{ target: 'France' }], 'the argument-less call reached the executor');
  assert.equal(r.trace.rejected, 1);
  assert.equal(r.text, 'Highlighted France.');
  /* the rejection travelled to the model as a tool result, naming the field */
  const toolMsg = model.seen[1].messages.filter((m) => m.role === 'tool').pop();
  assert.equal(toolMsg.content[0].ok, false);
  assert.equal(toolMsg.content[0].error, 'invalid_arguments');
  assert.match(toolMsg.content[0].message, /"target" is required/);
});

test('R406-agent ④: an unknown tool is rejected mechanically and names what does exist', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'teleport', arguments: {} }] },
    { text: 'Cannot do that.', toolCalls: [] },
  ]);
  const r = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.trace.executed, 0);
  const toolMsg = model.seen[1].messages.filter((m) => m.role === 'tool').pop();
  assert.equal(toolMsg.content[0].error, 'unknown_tool');
  assert.match(toolMsg.content[0].message, /map_view/);
});

test('R406-agent ⑤: the final sentence is written AFTER the results, and the results reach the model', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'map_view', arguments: { place: 'Taiwan' } }] },
    (req) => {
      const tool = req.messages.filter((m) => m.role === 'tool').pop();
      /* the model can only write this sentence because it saw the mechanical result */
      return { text: 'Moved to ' + tool.content[0].observed, toolCalls: [] };
    },
  ]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, messages: [{ role: 'user', content: 'x' }],
    execute: async (c) => ({ ok: true, observed: c.arguments.place }),
  });
  assert.equal(r.text, 'Moved to Taiwan');
});

test('R406-agent ⑥: a failing tool does not end the turn — the model chooses what to do next', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'map_view', arguments: { place: 'Atlantis' } }] },
    { text: '', toolCalls: [{ id: 'b', name: 'web_search', arguments: { query: 'Atlantis' } }] },
    { text: 'No such place; here is what the search found.', toolCalls: [] },
  ]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, messages: [{ role: 'user', content: 'x' }],
    execute: async (c) => (c.name === 'map_view'
      ? { ok: false, error: 'not_found', message: 'no match' }
      : { ok: true, hits: 3 }),
  });
  assert.equal(r.trace.executed, 2, 'the loop stopped at the first failure instead of letting Atlas continue');
  assert.equal(r.text, 'No such place; here is what the search found.');
  assert.equal(r.results.filter((x) => x.ok === false).length, 1);
});

test('R406-agent ⑦: several tools in one step all run, and partial failure keeps the successes', async () => {
  const model = scripted([
    { text: '', toolCalls: [
      { id: 'a', name: 'map_view', arguments: { place: 'Seine' } },
      { id: 'b', name: 'highlight', arguments: { target: 'Seine basin' } },
    ] },
    { text: 'Done, mostly.', toolCalls: [] },
  ]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, messages: [{ role: 'user', content: 'x' }],
    execute: async (c) => (c.name === 'highlight' ? { ok: false, error: 'no_geometry' } : { ok: true }),
  });
  assert.equal(r.trace.executed, 2);
  assert.equal(r.results.filter((x) => x.ok).length, 1);
  assert.equal(r.results.filter((x) => !x.ok).length, 1);
  assert.equal(r.text, 'Done, mostly.');
});

test('R406-agent ⑧: the step ceiling is technical and bounded — a model that never answers still terminates', async () => {
  const model = scripted([{ text: '', toolCalls: [{ id: 'x', name: 'map_view', arguments: { place: 'a' } }] }]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'x' }],
    limits: { maxSteps: 3 },
  });
  assert.ok(r.trace.steps.length <= 4, 'the loop ran past its ceiling');
  assert.ok(['step_budget', 'call_budget'].indexOf(r.stopped) >= 0, 'stopped=' + r.stopped);
});

test('R406-agent ⑨: repeated malformed calls stop the loop instead of burning every step', async () => {
  const model = scripted([{ text: '', toolCalls: [{ id: 'x', name: 'highlight', arguments: {} }] }]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'x' }],
    limits: { maxSteps: 6, maxMalformed: 2 },
  });
  assert.equal(r.stopped, 'malformed_limit');
  assert.equal(r.trace.executed, 0);
  assert.ok(model.count() <= 3, 'burned ' + model.count() + ' model calls on a malformed loop');
});

test('R406-agent ⑩: the tool-call budget is enforced across steps', async () => {
  /* ⚠ (#R489) THE PLACES DIFFER NOW, AND THAT IS THE POINT OF THE TEST RESTORED RATHER THAN RELAXED.
     `scripted` repeats its last reply, so this used to ask for the SAME call — {place:'a'} — on every
     step, and «executed 3» measured the budget only because nothing collapsed a repeat. #R489 answers
     an identical call from the identical call it already made, so three requests for {place:'a'} are
     one execution and two reuses. Three DIFFERENT calls put the subject back where it was: three
     executions, stopped by the budget and not by anything else. The check below then states the half
     that is genuinely new — a repeat is not a way around the budget. */
  let i = 0;
  const model = async () => ({ text: '', toolCalls: [{ id: 'x' + (++i), name: 'map_view', arguments: { place: 'p' + i } }] });
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'x' }],
    limits: { maxSteps: 10, maxToolCalls: 3 },
  });
  assert.equal(r.trace.executed, 3, 'executed ' + r.trace.executed + ' with a budget of 3');
  assert.equal(r.trace.calls, 3);
});

test('R406-agent ⑩b: an IDENTICAL call is answered from the first one, and still costs budget', async () => {
  const model = scripted([{ text: '', toolCalls: [{ id: 'x', name: 'map_view', arguments: { place: 'a' } }] }]);
  let ran = 0;
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: async (c) => { ran++; return okExec(c); },
    messages: [{ role: 'user', content: 'x' }], limits: { maxSteps: 10, maxToolCalls: 3 },
  });
  assert.equal(ran, 1, 'the same call, made three times in one turn, is executed once');
  assert.equal(r.trace.reused, 2);
  /* ⚠ AND THE BUDGET IS UNCHANGED — reuse is not a way to buy extra calls (CONSTITUTION.md §5). */
  assert.equal(r.trace.calls, 3);
});

test('R406-agent ⑪: a turn that operated IntMap but said nothing is asked once for the sentence', async () => {
  let n = 0;
  const model = async (req) => {
    n++;
    if (n === 1) return { text: '', toolCalls: [{ id: 'a', name: 'map_view', arguments: { place: 'Taiwan' } }] };
    if (req.final) return { text: 'Moved the map to Taiwan.', toolCalls: [] };
    return { text: '', toolCalls: [] };
  };
  const r = await AGENT.runTurn({ model, tools: TOOLS, execute: okExec, messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.text, 'Moved the map to Taiwan.', 'a turn that acted rendered as silence');
});

test('R406-agent ⑫: abort stops the loop and does not force a closing model call', async () => {
  const ctl = new AbortController();
  const model = scripted([(() => { ctl.abort(); return { text: '', toolCalls: [{ id: 'a', name: 'map_view', arguments: { place: 'a' } }] }; })]);
  const r = await AGENT.runTurn({
    model, tools: TOOLS, execute: okExec, signal: ctl.signal,
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(r.stopped, 'aborted');
});

test('R406-agent ⑬: the schema check enforces enum, number range and nested required', async () => {
  const errs = [];
  AGENT.validateAgainst({
    type: 'object', required: ['mode', 'zoom'],
    properties: {
      mode: { type: 'string', enum: ['globe', 'flat'] },
      zoom: { type: 'number', minimum: 0, maximum: 22 },
      at: { type: 'object', required: ['lat'], properties: { lat: { type: 'number' } } },
    },
  }, { mode: 'donut', zoom: 99, at: {} }, 'view', errs);
  assert.ok(errs.some((e) => /must be one of/.test(e)), errs.join(' | '));
  assert.ok(errs.some((e) => /<= 22/.test(e)), errs.join(' | '));
  assert.ok(errs.some((e) => /"lat" is required/.test(e)), errs.join(' | '));
});

test('R406-agent ⑭: an empty-string required argument counts as missing', async () => {
  /* 「引数のない analyze が検証を通り、実行後に『何を分析しますか？』になる」 — an empty string is the
     shape that used to pass, so it is asserted separately from a missing key. */
  const bad = AGENT.reject({ name: 'highlight', arguments: { target: '   ' } }, TOOLS);
  assert.ok(bad, 'a blank required argument passed validation');
  assert.equal(bad.code, 'invalid_arguments');
});
