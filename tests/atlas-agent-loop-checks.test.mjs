/* ============================================================================
 *  js/atlas-agent.js — the turn loop: tools, schemas, the output gate, the wire shape
 * ----------------------------------------------------------------------------
 *  The loop driven the way the browser drives it (a scripted model over the real tool surface and
 *  registry): direct answers, malformed calls handed back, budgets, the answer_mode gate (#R511),
 *  the decision-first wire shape (#R663), and the empty / promissory final (#R742).
 *  ⚠ No test here matches on the user's words — what is asserted is what the LOOP does with a choice.
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* shared by the sections below (each used to declare its own copy) */
const R = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r406-agent.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
  /* (#R731) a model that repeats the SAME answered call now stops on `repeated_calls`, earlier than the
     ceiling — still bounded, still technical; the ceiling stays for a model that keeps changing its call */
  assert.ok(['step_budget', 'call_budget', 'repeated_calls'].indexOf(r.stopped) >= 0, 'stopped=' + r.stopped);
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r406-turn.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R406 — A WHOLE TURN, FROM THE TYPED SENTENCE TO WHAT THE READER IS SHOWN
 * ----------------------------------------------------------------------------
 *  These drive the REAL modules — js/atlas-agent.js over js/atlas-toolsurface.js over the real
 *  js/atlas-capabilities.js registry and the real js/atlas-schemas.js table. Only two things are
 *  stubbed, and both are stubbed at the seams the browser itself injects: the model (a script) and
 *  the dispatch (a recorder). Everything between them is production code.
 *
 *  ⚠⚠⚠ NO ASSERTION HERE MAY DEPEND ON THE WORDS OF THE REQUEST, AND THE SUITE PROVES IT.
 *  Every scenario runs over a LIST of spellings of the same request — different punctuation, a
 *  missing question mark, a middle dot instead of one, a different language, a different word order
 *  — and asserts the outcome is IDENTICAL across all of them. 「セーヌ川の長さは・」 and
 *  「セーヌ川の長さは？」 differed only by U+30FB vs U+FF1F, and that one character decided whether
 *  IntMap thought a question had been asked. A test that pinned either spelling to an expected
 *  branch would be putting that defect back, in the test file (§11 of the work order says so).
 *
 *  ⚠ WHAT IS AND IS NOT BEING TESTED. The model's judgement is the model's; these tests do not
 *  assert that a good model chooses `map_view` for 「台湾へ移動して」. They assert what the LOOP does
 *  with a choice: that a direct answer runs nothing, that a call missing a required argument never
 *  reaches the dispatch, that the closing sentence is written after the results, and that none of it
 *  varies with how the sentence was spelt.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* One turn, with the real surface over the real registry. `script` is a list of model replies (or
   functions of the request); `ran` collects the ACTION OBJECTS that reached the dispatch. */
async function turn(userText, script, opts = {}) {
  const ran = [];
  const rendered = new Set(opts.renders || []);
  const failing = new Set(opts.fails || []);
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => {
      ran.push(action);
      if (failing.has(action.type)) return { ok: false, meta: { code: 'not_found' }, error: 'no match' };
      return { ok: true, html: rendered.has(action.type) ? '<div>answer</div>' : '', meta: { status: 'completed', produced: ['map'] } };
    },
  });
  const tools = surface.baseTools();
  let i = 0;
  const seen = [];
  const model = async (req) => {
    seen.push(req);
    const r = script[Math.min(i, script.length - 1)];
    i++;
    return typeof r === 'function' ? r(req) : r;
  };
  const out = await AGENT.runTurn({
    model, tools, execute: surface.makeExecute(tools, AGENT),
    system: 'sys', messages: (opts.history || []).concat([{ role: 'user', content: userText }]),
  });
  return { out, ran, tools, seen, calls: i };
}

const answer = (t) => ({ text: t, toolCalls: [] });
const call = (name, args) => ({ text: '', toolCalls: [{ id: 'a', name, arguments: args }] });

/* Every scenario is run over these rewritings of "the same request". They are never inspected by
   the code under test — that is the point. */
const SPELLINGS = {
  plainQuestion: ['セーヌ川の長さは・', 'セーヌ川の長さは？', 'セーヌ川の長さは', 'セーヌ川は何km？',
    'How long is the Seine', 'Quelle est la longueur de la Seine ?', 'województwo dolnośląskieってどんな場所？',
    'seine length', '   セーヌ川の長さは。   '],
  mapRequest: ['セーヌ川を地図で表示して', '台湾へ移動して', 'フランスをハイライトして',
    'fly to Taiwan', 'zeig mir Taiwan', '台湾に行って', 'Taiwan'],
};

/* ── ① A DIRECT ANSWER IS A COMPLETE TURN, WHATEVER THE SENTENCE LOOKED LIKE ──────────────── */
test('R406-turn ①: a turn the model answers directly runs nothing and changes nothing — for every spelling', async () => {
  const seen = [];
  for (const q of SPELLINGS.plainQuestion) {
    const { out, ran, calls } = await turn(q, [answer('約777キロメートルです。')]);
    seen.push({ q, ran: ran.length, calls, text: out.text, stopped: out.stopped });
  }
  /* identical in every respect that matters — no action, one model call, the model's text */
  for (const r of seen) {
    assert.equal(r.ran, 0, `${r.q} executed ${r.ran} action(s) for a direct answer`);
    assert.equal(r.calls, 1, `${r.q} cost ${r.calls} model calls`);
    assert.equal(r.text, '約777キロメートルです。', `${r.q} lost the answer`);
    assert.equal(r.stopped, 'answered');
  }
  /* and the middle dot behaves exactly like the full-width question mark — the reported defect */
  const dot = seen.find((r) => r.q === 'セーヌ川の長さは・');
  const qm = seen.find((r) => r.q === 'セーヌ川の長さは？');
  assert.deepEqual({ ...dot, q: '' }, { ...qm, q: '' },
    'the middle dot and the question mark still take different paths');
});

/* ── ② THE TOOLS OFFERED DO NOT DEPEND ON THE REQUEST ─────────────────────────────────────── */
test('R406-turn ②: the same tools are offered for every request, and the catalogue is not among them', async () => {
  const sets = [];
  let biggest = 0;
  for (const q of SPELLINGS.plainQuestion.concat(SPELLINGS.mapRequest)) {
    const { tools, seen } = await turn(q, [answer('ok')]);
    sets.push(Object.keys(tools).sort().join(','));
    biggest = Math.max(biggest, JSON.stringify(seen[0].tools).length);
  }
  assert.equal(new Set(sets).size, 1, 'the tool surface varied with the wording of the request');
  /* the whole surface, schemas included, against the 64,250 characters of catalogue it replaced */
  assert.ok(biggest < 12_000, `the tool block is ${biggest} characters — it must not become the catalogue again`);
  const names = sets[0].split(',');
  assert.ok(names.includes('find_capability'), 'nothing can reach the capabilities that are not core tools');
  assert.ok(names.includes('run_capability'));
});

/* ── ③ AN EXPLICIT OPERATION REACHES THE DISPATCH AS THE ACTION IT ALWAYS WAS ─────────────── */
test('R406-turn ③: a map tool becomes the legacy action object, and success is reported after it ran', async () => {
  const order = [];
  const { out, ran } = await turn('台湾へ移動して', [
    call('map_view', { place: 'Taiwan' }),
    (req) => {
      order.push('model-2');
      const tool = req.messages.filter((m) => m.role === 'tool').pop();
      assert.equal(tool.content[0].ok, true, 'the model was not shown the result before answering');
      return answer('台湾へ移動しました。');
    },
  ]);
  assert.deepEqual(ran, [{ type: 'flyTo', place: 'Taiwan' }], 'the dispatch did not get the action it has always taken');
  assert.equal(out.text, '台湾へ移動しました。');
  assert.deepEqual(order, ['model-2'], 'the closing sentence was not written after the result');
});

/* ── ④ THE ARGUMENT-LESS ACTION NEVER REACHES EXECUTION ───────────────────────────────────── */
test('R406-turn ④: analyze without a question and highlight without a target are refused before they run', async () => {
  for (const [tool, args] of [['research', {}], ['highlight', {}], ['map_view', {}]]) {
    const { out, ran } = await turn('x', [call(tool, args), answer('done')]);
    assert.equal(ran.length, 0, `${tool} with no arguments reached the dispatch`);
    assert.equal(out.trace.rejected, 1, `${tool} was not rejected`);
    assert.equal(out.text, 'done', 'the reader was shown the rejection instead of an answer');
  }
});

test('R406-turn ⑤: the rejection is addressed to the model, names the field, and is never rendered', async () => {
  let secondReq = null;
  await turn('x', [
    call('research', {}),
    (req) => { secondReq = req; return answer('ok'); },
  ]);
  const tool = secondReq.messages.filter((m) => m.role === 'tool').pop();
  assert.equal(tool.content[0].ok, false);
  assert.equal(tool.content[0].error, 'invalid_arguments');
  assert.match(tool.content[0].message, /question/, 'the model was not told WHICH argument was missing');
  assert.ok(tool.content[0].schema, 'the model was not given the schema to correct against');
});

/* ── ⑥ DISCOVERY REACHES THE CAPABILITIES THAT ARE NOT CORE TOOLS ─────────────────────────── */
test('R406-turn ⑥: find_capability returns a few real capabilities with their real schemas', async () => {
  let found = null;
  await turn('x', [call('find_capability', { query: 'isochrone reachable area' }), (req) => {
    found = req.messages.filter((m) => m.role === 'tool').pop().content[0];
    return answer('ok');
  }]);
  assert.equal(found.ok, true);
  assert.ok(found.matches.length > 0, 'discovery found nothing for a real IntMap feature');
  /* ⚠⚠⚠ (#R413) THIS USED TO BE `matches.length <= 8`, AND THAT CEILING WAS THE DEFECT.
     `search()` breaks equal scores with `a.id.localeCompare(b.id)`, so cutting at eight let the
     ALPHABET decide what Atlas was allowed to know about: measured on 「現在地から大阪駅までの経路」,
     ten capabilities score 16 — identically, because the only signal a Japanese request produces is
     the per-CATEGORY hint row — and sorted by id, `routing.route` lands NINTH and was dropped, while
     the five navigation.* that arrived instead all reply «plan a route first». Atlas asked the reader
     to type their own address because IntMap had handed it a toolkit that could not draw a route.
     ⚠ The invariant is NOT a smaller number. It is that nothing is dropped, and that the RESULT
     stays small because the shared catalogue blocks are de-duplicated rather than clipped — which is
     what the byte assertion below actually measures. CONSTITUTION.md §5. */
  assert.equal(found.matches.length, CAPS.search('isochrone reachable area', { want: 3, min: 1 }).ranked.length,
    'every capability that scored comes back — discovery must not truncate its own ranking');
  assert.ok(JSON.stringify(found).length < 40_000,
    `discovery returned ${JSON.stringify(found).length} bytes — de-duplication, not truncation, is what keeps this small`);
  found.matches.forEach((m) => {
    assert.ok(CAPS.resolve(m.id), `${m.id} is not a real capability id`);
    assert.equal(m.schema.type, 'object', `${m.id} came back without a real schema`);
  });
});

test('R406-turn ⑦: run_capability re-validates against THAT capability schema, not the generic one', async () => {
  /* run_capability's own schema can only say `args` is an object; the surface must check the rest,
     or it becomes the hole the argument-less action walks back in through. */
  const { ran, out } = await turn('x', [
    call('run_capability', { id: 'routing.isochrone', args: {} }),
    answer('ok'),
  ]);
  assert.equal(ran.length, 0, 'an under-specified capability ran through the generic envelope');
  assert.equal(out.results[0].error, 'invalid_arguments');
  assert.ok(out.results[0].schema, 'no schema came back for the model to correct against');
});

test('R406-turn ⑧: run_capability with good arguments reaches the dispatch under the legacy name', async () => {
  const { ran } = await turn('x', [call('run_capability', { id: 'view.projection', args: { mode: 'globe' } }), answer('ok')]);
  assert.equal(ran.length, 1);
  assert.equal(ran[0].type, 'projection', 'the capability id was not translated to the dispatch spelling');
  assert.equal(ran[0].mode, 'globe');
});

test('R406-turn ⑧b: a `type` smuggled into the arguments cannot redirect the call to another case', async () => {
  /* the dispatch switches on action.type; if the arguments were spread OVER the tool's own type,
     a call that passed map_view's schema would execute whatever case the argument named. */
  const a = await turn('x', [call('map_view', { place: 'Rome', type: 'layer' }), answer('ok')]);
  assert.equal(a.ran[0].type, 'flyTo', 'an argument redirected a core tool to another dispatch case');
  const b = await turn('x', [call('run_capability', { id: 'view.projection', args: { mode: 'globe', type: 'time' } }), answer('ok')]);
  assert.equal(b.ran[0].type, 'projection', 'an argument redirected run_capability to another dispatch case');
});

/* ── ⑨ ANSWER + MAP: ONE FAILURE DOES NOT MAKE THE OTHER A FAILURE ────────────────────────── */
test('R406-turn ⑨: in a combined request a failed map step does not discard the answer', async () => {
  const { out, ran } = await turn('セーヌ川の長さを答えて、流域も地図で見せて', [
    { text: '', toolCalls: [
      { id: 'a', name: 'research', arguments: { question: 'length of the Seine' } },
      { id: 'b', name: 'highlight', arguments: { query: 'Seine basin' } },
    ] },
    (req) => {
      const res = req.messages.filter((m) => m.role === 'tool').pop().content;
      assert.equal(res.filter((r) => r.ok).length, 1, 'the model could not see which half worked');
      assert.equal(res.filter((r) => !r.ok).length, 1);
      return answer('長さは約777kmです。流域の描画はできませんでした。');
    },
  ], { fails: ['highlight'], renders: ['analyze'] });
  assert.equal(ran.length, 2, 'the second step was skipped because the first family failed');
  assert.match(out.text, /777/);
  assert.equal(out.stopped, 'answered');
});

test('R406-turn ⑩: a tool that drew its own sourced answer says so, so the model does not write it twice', async () => {
  let res = null;
  await turn('現在のギリシャ情勢を調べて', [
    call('research', { question: 'Greece current situation', use: ['web'] }),
    (req) => { res = req.messages.filter((m) => m.role === 'tool').pop().content[0]; return answer('要点は次のとおりです。'); },
  ], { renders: ['analyze'] });
  assert.equal(res.rendered, true, 'the model was not told the answer had already been shown');
});

/* ── ⑪ CONVERSATION: WHAT IS SETTLED IS NOT ASKED AGAIN ───────────────────────────────────── */
test('R406-turn ⑪: the turn carries the conversation, so a settled subject is available to the model', async () => {
  const history = [
    { role: 'user', content: '旅行行きたい' },
    { role: 'assistant', content: 'どちらへ行かれますか？' },
    { role: 'user', content: '台湾' },
    { role: 'assistant', content: '台湾ですね。' },
  ];
  let req = null;
  await turn('一週間の旅程を考えて', [(r) => { req = r; return answer('7日間の案です…'); }], { history });
  const text = req.messages.map((m) => String(m.content)).join('\n');
  assert.match(text, /台湾/, 'the settled subject was not carried into the turn');
  assert.equal(req.messages.length, 5, 'the history was truncated or duplicated');
});

test('R406-turn ⑪b: asking the reader is a tool Atlas may reach for, and it needs a real question', async () => {
  /* 「曖昧さが結果を大きく変える場合だけ確認する」 — WHETHER to ask is Atlas's judgement, so nothing
     here asserts that a vague request produces a question. What is asserted is that the door exists,
     that it reaches the same dispatch case it always did, and that an empty question cannot go out. */
  const bad = await turn('x', [call('ask_user', {}), answer('…')]);
  assert.equal(bad.ran.length, 0, 'a question with no text reached the reader');
  assert.equal(bad.out.trace.rejected, 1);

  const good = await turn('旅行行きたい', [
    call('ask_user', { question: 'どちらへ行かれますか？', options: ['台湾', 'アイスランド'], allowText: true }),
    answer('選んでください。'),
  ]);
  assert.equal(good.ran.length, 1);
  assert.equal(good.ran[0].type, 'ask', 'the dialog capability was not reached under its dispatch name');
  assert.equal(good.ran[0].question, 'どちらへ行かれますか？');
  assert.deepEqual(good.ran[0].options, ['台湾', 'アイスランド']);
});

/* ── ⑫ FAILURE: NOTHING IS CLAIMED THAT DID NOT HAPPEN ────────────────────────────────────── */
test('R406-turn ⑫: when everything fails the turn still ends with one answer and no invented success', async () => {
  const { out, ran } = await turn('存在しない場所へ移動して', [
    call('map_view', { place: 'Atlantis' }),
    (req) => {
      const r = req.messages.filter((m) => m.role === 'tool').pop().content[0];
      assert.equal(r.ok, false);
      return answer('その場所は見つかりませんでした。');
    },
  ], { fails: ['flyTo'] });
  assert.equal(ran.length, 1);
  assert.equal(out.text, 'その場所は見つかりませんでした。');
  assert.equal(out.results.filter((r) => r.ok).length, 0);
});

/* ── ⑬ THE WIRE FORMAT ────────────────────────────────────────────────────────────────────── */
test('R406-turn ⑬: a function call parses both an arguments object and an arguments string', async () => {
  /* (atlas-legacy-protocol-removal) the calls are the provider's function_call items — the only transport there is */
  const fc = (args) => [{ type: 'function_call', call_id: 'c1', name: 'map_view', arguments: args }];
  const a = AGENT.readReply({ final_text: '' }, '', JSON.parse, { protocol: 2 }, fc({ place: 'Rome' }));
  const b = AGENT.readReply({ final_text: '' }, '', JSON.parse, { protocol: 2 }, fc('{"place":"Rome"}'));
  assert.deepEqual(a.toolCalls, b.toolCalls);
  assert.equal(a.toolCalls[0].arguments.place, 'Rome');
  assert.equal(a.toolCalls[0].id, 'c1', 'the provider\'s own id');
  /* an unparseable arguments string is an EMPTY argument set, which the schema check then rejects
     and hands back — never a crash, and never a silently half-applied call */
  const c = AGENT.readReply({ final_text: '' }, '', JSON.parse, { protocol: 2 }, fc('{oops'));
  assert.deepEqual(c.toolCalls[0].arguments, {});
  /* final_text alone is a complete reply */
  const d = AGENT.readReply({ final_text: 'hello' }, '', JSON.parse);
  assert.equal(d.text, 'hello');
  assert.equal(d.toolCalls.length, 0);
});

test('R406-turn ⑭: the envelope schema is strictly expressible, so the enforcement is not silently dropped', () => {
  /* supabase/functions/ai-proxy/index.ts converts a caller schema with strictJsonSchema(), which
     returns null — dropping the WHOLE schema to plain json_object — for any object with no declared
     properties. That is why the arguments travel as a string. This re-runs that rule. */
  const expressible = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'array') return expressible(node.items);
    if (node.type !== 'object') return true;
    const keys = Object.keys(node.properties || {});
    return keys.length > 0 && keys.every((k) => expressible(node.properties[k]));
  };
  assert.ok(expressible(AGENT.FINAL_SCHEMA), 'FINAL_SCHEMA would be rejected by the proxy and silently downgraded');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r511-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R511 — THE MAP AS AN OUTPUT MODALITY: `answer_mode`, held by code; `map.compose`, one call
 * ----------------------------------------------------------------------------
 *  These drive the SHIPPED modules — js/atlas-agent.js, js/atlas-toolsurface.js over the real
 *  registry and schemas, js/atlas-map-compose.js over the real geo ledger — with a scripted model,
 *  a scripted geocoder and a fake engine. Nothing here is a copy of the implementation.
 *
 *  ⚠ NO TEST HERE MATCHES ON THE USER'S WORDS, and none makes the LOOP know a tool's name: the gate
 *  reads a flag on a RESULT (`changedMap`), the way #R419's `endsTurn` is read. ⑤ proves it with a
 *  tool called `zzz`. What is asserted is what the loop does with what Atlas DECLARED.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');


const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* ── a scripted model ─────────────────────────────────────────────────────────────────────── */
function scripted(replies) {
  const seen = [];
  let i = 0;
  const fn = async (req) => { seen.push(req); const r = replies[Math.min(i, replies.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  fn.seen = seen; fn.count = () => i;
  return fn;
}
const TOOLS = {
  zzz: { name: 'zzz', description: 'draws', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } },
  web_search: { name: 'web_search', description: 'search', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } } } },
};
/* what the transcript showed the model on a given step, as the loop hands it over */
const toolNotes = (req) => (req.messages || []).filter((m) => m.role === 'tool').flatMap((m) => m.content || []);

/* ══ ① the gate: a "map" final with nothing drawn is handed back ONCE, then the drawn one passes ═══ */
test('R511 ①: a "map" final before anything drew is bounced as map_not_drawn; after compose it is accepted', async () => {
  const model = scripted([
    { text: 'ここがホルムズ海峡です。', toolCalls: [], answerMode: 'map' },                                  /* step 0: says map, drew nothing */
    (req) => {                                                                                                   /* step 1: sees the note, draws */
      const notes = toolNotes(req);
      assert.equal(notes.length, 1, 'exactly one note came back');
      assert.equal(notes[0].error, 'map_not_drawn');
      assert.match(notes[0].message, /answer_mode "map"/);
      assert.match(notes[0].message, /compose_map/, 'the note names the one-call tool');
      return { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'hormuz' } }], answerMode: 'map' };
    },
    { text: 'ホルムズ海峡①を地図に示しました。', toolCalls: [], answerMode: 'map' },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true, changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.stopped, 'answered');
  assert.equal(out.text, 'ホルムズ海峡①を地図に示しました。');
  assert.equal(out.answerMode, 'map');
  assert.equal(out.mapDrawn, true);
  assert.equal(out.trace.outputGate, 1);
  assert.equal(model.count(), 3, 'three model calls: the bounced final, the draw, the accepted final');
});

/* ══ ② R406 ① unchanged: a "text" answer (or none declared) on step 0 ends the turn with nothing run ═ */
test('R511 ②: "text" — and an undeclared mode — end the turn on step 0 exactly as before', async () => {
  for (const mode of ['text', '', undefined]) {
    let executed = 0;
    const model = scripted([{ text: 'La Seine fait environ 777 km.', toolCalls: [], answerMode: mode }]);
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => { executed++; return { ok: true }; }, messages: [{ role: 'user', content: 'x' }] });
    assert.equal(out.stopped, 'answered');
    assert.equal(executed, 0);
    assert.equal(model.count(), 1, `mode=${JSON.stringify(mode)}: one call, no bounce`);
    assert.equal(out.trace.outputGate, 0);
    assert.equal(out.mapDrawn, false);
  }
});

/* ══ ③ the bounce is bounded — a model that insists still terminates, and its words are kept ══════ */
test('R511 ③: after maxOutputGate bounces a "mixed" final with nothing drawn is accepted as it stands', async () => {
  const model = scripted([{ text: 'The map would show it.', toolCalls: [], answerMode: 'mixed' }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.stopped, 'answered');
  assert.equal(out.trace.outputGate, AGENT.LIMITS.maxOutputGate);
  assert.equal(model.count(), AGENT.LIMITS.maxOutputGate + 1);
  assert.equal(out.text, 'The map would show it.', 'the reader still gets the sentence');
  assert.equal(out.answerMode, 'mixed');
  assert.equal(out.mapDrawn, false, '…and the record says the map was NOT drawn, so the caller can see the disagreement');
  /* it never bounces into the last step: with maxSteps 2 the first final is accepted */
  const m2 = scripted([{ text: 'x', toolCalls: [], answerMode: 'map' }]);
  const o2 = await AGENT.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'x' }], limits: { maxSteps: 2 } });
  assert.equal(o2.trace.outputGate, 1);
  assert.equal(o2.stopped, 'answered');
});

/* ══ ④ readReply: the declaration is read off the envelope; anything else is no declaration ════════ */
test('R511 ④: readReply reads answer_mode and FINAL_SCHEMA declares it as an enum', () => {
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'map' }, '', JSON.parse).answerMode, 'map');
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'MIXED' }, '', JSON.parse).answerMode, 'mixed');
  assert.equal(AGENT.readReply({ final_text: 'a', answer_mode: 'picture' }, '', JSON.parse).answerMode, '');
  assert.equal(AGENT.readReply({ final_text: 'a' }, '', JSON.parse).answerMode, '');
  assert.deepEqual(AGENT.FINAL_SCHEMA.properties.answer_mode.enum, ['text', 'map', 'chart', 'mixed']);   /* (#R543) 'chart' joined the vocabulary; the gate below it became one gate over a SET rather than a second gate beside the first */
  assert.deepEqual(AGENT.FINAL_SCHEMA.required, ['final_text'], 'declaring a mode is not required — an ordinary answer stays an ordinary answer');
  assert.deepEqual(AGENT.ANSWER_MODES, ['text', 'map', 'chart', 'mixed']);
});

/* ══ ⑤ the flag, not the name: only a SUCCESSFUL result with changedMap counts ═══════════════════ */
test('R511 ⑤: the gate reads `changedMap` on a successful result — a failed draw does not satisfy it', async () => {
  const model = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'text' },
  ]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: false, error: 'failed', changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(out.trace.outputGate, 1, 'the failed draw did not count, so the "map" final was bounced once');
  assert.equal(out.mapDrawn, false);
  /* and a successful one, whatever the tool is called, does */
  const m2 = scripted([
    { text: '', toolCalls: [{ id: 'a', name: 'zzz', arguments: { x: 'p' } }], answerMode: 'map' },
    { text: 'done', toolCalls: [], answerMode: 'map' },
  ]);
  const o2 = await AGENT.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true, changedMap: true }), messages: [{ role: 'user', content: 'x' }] });
  assert.equal(o2.trace.outputGate, 0);
  assert.equal(o2.mapDrawn, true);
  assert.equal(m2.count(), 2);
});

/* ══ ⑥ the surface: compose_map is CORE, its schema is real, and `changedMap` is stamped from the registry ═ */
test('R511 ⑥: compose_map is a CORE tool over map.compose, and the surface stamps changedMap from produces+status', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async (a) => {
    ran.push(a);
    if (a.type === 'compose') return { ok: true, html: '<div/>', meta: { status: 'completed', produced: ['map', 'explanation'] } };
    if (a.type === 'analyze') return { ok: true, html: '<div/>', meta: { status: 'completed', produced: ['explanation'] } };
    /* ⚠ (#R551) A PARTIAL THAT PAINTED NOTHING NOW SAYS SO. Every verifier in js/atlas-capabilities.js
       that cannot see its postcondition returns `produced: []`, because 「完成したか」 and 「何か出たか」
       stopped being the same question the moment map.compose could be partial with markers really on
       the map. This fixture stands in for that kernel, so it declares what that kernel declares. */
    if (a.type === 'highlight') return { ok: true, html: '', meta: { status: 'partial', produced: [], unverified: true } };
    return { ok: false, meta: { code: 'failed' }, error: 'no' };
  } });
  const core = surface.CORE.find((c) => c.name === 'compose_map');
  assert.ok(core, 'compose_map is in CORE');
  assert.equal(core.cap, 'map.compose');
  const tools = surface.baseTools();
  assert.ok(tools.compose_map, 'present on every turn');
  assert.deepEqual(tools.compose_map.parameters.required, ['items']);
  assert.equal(tools.compose_map.parameters.properties.items.minItems, 1);
  assert.ok(!('lat' in tools.compose_map.parameters.properties.items.items.properties), 'no coordinate field for the model to fill');
  assert.match(tools.compose_map.description, /never write coordinates/i);
  const exec = surface.makeExecute(tools, AGENT);
  const a = await exec({ name: 'compose_map', arguments: { items: [{ name: 'Strait of Hormuz', country: 'Iran' }] } });
  assert.equal(a.ok, true); assert.equal(a.changedMap, true, 'a completed map-producing capability changed the map');
  assert.equal(ran[0].type, 'compose', 'the tool call became the legacy action the dispatch speaks');
  const b = await exec({ name: 'research', arguments: { question: 'why' } });
  assert.equal(b.changedMap, undefined, 'an explanation-only capability did not');
  const c = await exec({ name: 'highlight', arguments: { countries: ['Iran'] } });
  assert.equal(c.changedMap, undefined, 'a partial that painted nothing did not — because it DECLARED that, not because it was partial (#R551)');
  /* schema: a call with no items is rejected before anything runs */
  const bad = AGENT.reject({ name: 'compose_map', arguments: { title: 'x' } }, tools);
  assert.equal(bad && bad.code, 'invalid_arguments');
});

/* ══ ⑦ the compose module over the real ledger, a scripted geocoder and a fake engine ═════════════ */
function fakeEngine(preset) {
  const calls = { addSource: [], addLayer: [], addBefore: [], setSourceData: [], flyTo: [], fitBounds: [], setVisible: [] };
  const layers = new Set(preset || []), sources = new Set();
  let data = null;
  const g = {
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id) => { sources.add(id); calls.addSource.push(id); },
      setSourceData: (id, d) => { data = d; calls.setSourceData.push(id); }, has: (id) => layers.has(id),
      add: (d, before) => { layers.add(d.id); calls.addLayer.push(d.id); calls.addBefore.push(before); }, setVisible: (id, v) => calls.setVisible.push([id, v]),
      getLayout: () => 'visible', setFilter: () => {},
    },
    camera: { flyTo: (o) => calls.flyTo.push(o), fitBounds: (b, o) => calls.fitBounds.push([b, o]), getZoom: () => 3 },
    events: { onLayer: () => {}, on: () => {} },
    render: { canvas: () => ({ style: {} }) },
  };
  return { GE: () => g, calls, data: () => data, layers };
}
const GEO = { 'strait of hormuz, iran': { lng: 56.5, lat: 26.6, name: 'Strait of Hormuz' }, 'strait of malacca, malaysia': { lng: 100.8, lat: 2.5, name: 'Strait of Malacca' },
  'kotovsk, russia': { lng: 41.99, lat: 52.59, name: 'Kotovsk' }, 'tokyo, japan': { lng: 139.69, lat: 35.69, name: 'Tokyo' }, 'san francisco, united states': { lng: -122.42, lat: 37.77, name: 'San Francisco' } };
function makeCompose(opts) {
  const eng = fakeEngine(opts && opts.layers);
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const asked = [];
  const geocode = async (q) => { asked.push(q); const k = String(q).toLowerCase(); if (opts && opts.hang && opts.hang.test(q)) return new Promise(() => {}); return GEO[k] || null; };
  const dispatched = [];
  const dispatch = async (a) => { dispatched.push(a); return { ok: a.countries ? a.countries[0] !== 'Atlantis' : true }; };
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode, ledger, geoObject: GEOBJ.geoObject, dispatch, itemTimeoutMs: (opts && opts.itemTimeoutMs) || 8000, passBudgetMs: (opts && opts.passBudgetMs) || 26000 });
  return { C, eng, ledger, asked, dispatched };
}

test('R511 ⑦a: ledger first, geocoder second, the country appended once — and every result files back with its role', async () => {
  const { C, eng, ledger, asked } = makeCompose();
  ledger.record({ name: 'Bab-el-Mandeb', kind: 'water', countryCode: 'YE', lng: 43.3, lat: 12.6, provenance: 'geocoded_point' });
  const r = await C.run({ title: '中国の原油輸入路', items: [
    { name: 'Bab-el-Mandeb', country: 'Yemen', kind: 'water', role: '紅海の出口' },
    { name: 'Strait of Hormuz', country: 'Iran', kind: 'water', role: '入口' },
    { name: 'Kotovsk, Russia', country: 'Russia', kind: 'city' },
  ] });
  assert.equal(r.ok, true);
  assert.ok(!asked.some((q) => /bab-el-mandeb/i.test(q)), 'a place the ledger knows is not geocoded again');
  assert.ok(asked.includes('Strait of Hormuz, Iran'), 'an unknown place is asked for WITH its country');
  assert.ok(asked.includes('Kotovsk, Russia') && !asked.includes('Kotovsk, Russia, Russia'), '(#R489) the country is appended only when it is not already there');
  assert.deepEqual(r.meta.produced, ['map', 'explanation']);
  assert.deepEqual(r.meta.compose.placed.map((p) => p.n), [1, 2, 3], 'numbered in the order given');
  assert.equal(r.exec.status, 'ok');
  assert.equal(r.exec.unplaced.length, 0);
  const e = ledger.resolve('Strait of Hormuz', {});
  assert.ok(e && e.lng === 56.5 && e.role === '入口', 'the resolved place is in the ledger WITH the role it played');
  assert.equal(ledger.resolve('Bab-el-Mandeb', {}).role, '紅海の出口', '…and a known place gets its role for this answer');
  const feats = eng.data().features;
  assert.equal(feats.filter((f) => f.properties.t === 'pt').length, 3);
  assert.equal(eng.calls.fitBounds.length, 1, 'the camera framed all three');
  assert.ok(/atl-cmp/.test(r.html) && /入口/.test(r.html) && /中国の原油輸入路/.test(r.html), 'the legend carries the title, the names and the roles');
  assert.ok(/data-geo="/.test(r.html), 'legend rows carry the record id for the two-way link');
});

test('R511 ⑦b: what cannot be resolved is UNPLACED by name — never guessed, and told to Atlas and to the reader', async () => {
  const { C, eng } = makeCompose();
  const r = await C.run({ items: [{ name: 'Strait of Hormuz', country: 'Iran' }, { name: 'Nowhere Reef', country: 'Atlantis' }] });
  assert.equal(r.ok, true, 'one placed is enough to draw');
  assert.equal(r.exec.status, 'partial');
  assert.deepEqual(r.exec.unplaced, [{ name: 'Nowhere Reef', reason: 'not_found', tried: ['Nowhere Reef, Atlantis', 'Nowhere Reef'] }]   /* (#R515) `tried` = the spellings that were actually spent — the model is the only party that can supply another */);
  assert.match(r.exec.note, /NOT on the map/);
  assert.match(r.html, /Nowhere Reef/, 'the reader is told too');
  assert.equal(eng.data().features.length, 1, 'nothing was drawn for it');
  assert.equal(eng.calls.flyTo.length, 1, 'one place → fly, not fit');
  /* every item unresolvable → an honest failure, no legend, nothing produced */
  const { C: C2 } = makeCompose();
  const r2 = await C2.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis' }] });
  assert.equal(r2.ok, false);
  assert.equal(r2.meta.code, 'PLACE_NOT_FOUND');
  assert.deepEqual(r2.meta.produced, []);
  assert.equal(r2.html, '');
  /* and a model-supplied coordinate is ignored: the place is still resolved by NAME */
  const { C: C3, asked } = makeCompose();
  const r3 = await C3.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis', lng: 10, lat: 10 }] });
  assert.equal(r3.ok, false, 'a coordinate the model wrote is not a coordinate');
  assert.ok(asked.length >= 1);
});

test('R511 ⑦c: relations join placed items by name or number as great-circle arcs; an unplaced endpoint is skipped, not invented', async () => {
  const { C, eng } = makeCompose();
  const r = await C.run({ items: [
    { name: 'Tokyo', country: 'Japan', kind: 'city' }, { name: 'San Francisco', country: 'United States', kind: 'city' }, { name: 'Nowhere Reef', country: 'Atlantis' },
  ], relations: [
    { from: 'Tokyo', to: 2, type: 'flow', label: '航空路' },
    { from: 1, to: 'Nowhere Reef', type: 'link' },
    { from: 'Tokyo', to: 'Tokyo' },
  ] });
  assert.equal(r.exec.relationsDrawn, 1);
  assert.equal(r.exec.relationsSkipped.length, 2);
  assert.equal(r.exec.relationsSkipped[0].reason, 'endpoint_unplaced');
  assert.equal(r.exec.relationsSkipped[1].reason, 'same_endpoint');
  const rel = eng.data().features.find((f) => f.properties.t === 'rel');
  assert.ok(rel, 'the arc is in the source');
  assert.equal(rel.properties.arrow, 1, 'a flow has arrowheads');
  assert.equal(rel.geometry.type, 'MultiLineString', 'Tokyo → San Francisco crosses the antimeridian and is split');
  const pts = rel.geometry.coordinates.flat();
  assert.ok(pts.length > 10, 'a great circle, not a chord');
  assert.ok(pts.every((p) => Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180));
  assert.ok(Math.max(...pts.map((p) => p[1])) > 45, 'the arc bows north of both endpoints, as a great circle between them does');
  assert.match(r.html, /航空路/);
  /* ⚠ a NUMBER is the position in the caller's `items`, not the marker number — measured on the
     live site: with item 1 unplaced, «from: 2» landed on the third item and the relation was
     reported as joining a place to itself */
  const { C: C2, eng: e2 } = makeCompose();
  const r2 = await C2.run({ items: [{ name: 'Nowhere Reef', country: 'Atlantis' }, { name: 'Tokyo', country: 'Japan' }, { name: 'San Francisco', country: 'United States' }],
    relations: [{ from: 2, to: 3, type: 'flow' }, { from: 1, to: 2 }] });
  assert.deepEqual(r2.exec.placed.map((p) => [p.n, p.name]), [[1, 'Tokyo'], [2, 'San Francisco']], 'markers are numbered by what landed');
  assert.equal(r2.exec.relationsDrawn, 1, 'items 2→3 are Tokyo→San Francisco, both placed');
  assert.equal(r2.exec.relationsSkipped[0].reason, 'endpoint_unplaced', 'item 1 is the unplaced one');
  const rel2 = e2.data().features.find((f) => f.properties.t === 'rel');
  assert.equal(rel2.properties.from, e2.data().features.find((f) => f.properties.name === 'Tokyo').properties.id);
});

test('R511 ⑦f: the layers go at the top of the stack, just under the reader\'s pins — not under an opaque fill', async () => {
  /* measured on the preview: anchored on the POI layer's list they landed under `country-fill` and rendered nothing */
  const { C, eng } = makeCompose({ layers: ['nlq-fill', 'country-fill', 'user-pin-shadow', 'user-pin-dot'] });
  await C.run({ items: [{ name: 'Tokyo', country: 'Japan' }] });
  assert.equal(eng.calls.addLayer.length, C.LAYERS.length);
  assert.ok(eng.calls.addBefore.every((b) => b === 'user-pin-shadow'), 'every compose layer is inserted directly under the pins');
  const { C: C2, eng: e2 } = makeCompose({ layers: ['nlq-fill', 'country-fill'] });
  await C2.run({ items: [{ name: 'Tokyo', country: 'Japan' }] });
  assert.ok(e2.calls.addBefore.every((b) => b === undefined), 'with no pins on the map they go on top — never under a fill');
});

test('R511 ⑦e: a name the gazetteer cannot find WITH its country is tried bare — a strait is not IN a country', async () => {
  const { C, asked } = makeCompose();
  GEO['strait of gibraltar'] = { lng: -5.6, lat: 35.95, name: 'Strait of Gibraltar' };
  const r = await C.run({ items: [{ name: 'Strait of Gibraltar', country: 'Spain', kind: 'water' }] });
  assert.deepEqual(asked, ['Strait of Gibraltar, Spain', 'Strait of Gibraltar'], 'country first, then the bare name — two requests, not one');
  assert.equal(r.exec.placed.length, 1);
  assert.equal(r.exec.unplaced.length, 0);
  delete GEO['strait of gibraltar'];
});

test('R511 ⑦d: a fill goes through the highlight path with the run stamp, and a geocoder that hangs is a timeout, not a wait', async () => {
  const { C, dispatched } = makeCompose();
  const r = await C.run({ __paintRun: 'run7', items: [{ name: 'Iran', kind: 'country', fill: true, role: 'producer' }, { name: 'Strait of Hormuz', country: 'Iran' }] });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'highlight');
  assert.deepEqual(dispatched[0].countries, ['Iran']);
  /* (#R551) the stamp is now the REVISION's, not the turn's: several fills inside one revision share
     it (js/atlas-console.js's _hlAdd keeps them all), and the next revision gets a new one so its
     fills REPLACE rather than pile onto the draft they are correcting. Asserted as the property it
     has to have, not as a literal — the artefact id is derived, and a spelling is not the point. */
  assert.equal(typeof dispatched[0].__paintRun, 'string');
  assert.match(dispatched[0].__paintRun, /^map:run7#r1$/, 'the run it belongs to, plus which revision of that map');
  assert.equal(r.exec.fills[0].ok, true);
  assert.match(r.html, /Iran/);
  const { C: C2 } = makeCompose({ hang: /Malacca/, itemTimeoutMs: 40 });
  const t0 = Date.now();
  const r2 = await C2.run({ items: [{ name: 'Strait of Malacca', country: 'Malaysia' }, { name: 'Strait of Hormuz', country: 'Iran' }] });
  assert.ok(Date.now() - t0 < 2000, 'did not wait on the hung lookup');
  /* (#R551) …and it carries the spellings it SPENT: 「時計が尽きた」 is only useful to Atlas if it also
     says what was being asked, and it is the same question the web rung is handed next. */
  assert.deepEqual(r2.exec.unplaced, [{ name: 'Strait of Malacca', reason: 'timeout', tried: ['Strait of Malacca, Malaysia', 'Strait of Malacca'] }]);
  assert.equal(r2.exec.placed.length, 1, 'the other one still landed');
});

/* ══ ⑧ the prose link: text nodes only, first occurrence, never inside a link ═══════════════════ */
test('R511 ⑧: linkProse numbers the first mention of each place in the text nodes and leaves markup, links and other words alone', () => {
  const C = makeAtlasMapCompose({});
  const recs = [{ id: 'water:IR:hormuz', n: 1, color: '#0a84ff', spellings: ['Strait of Hormuz', 'ホルムズ海峡'] }, { id: 'city:JP:tokyo', n: 2, color: '#ff453a', spellings: ['Tokyo'] }];
  const html = '<p>The <b>Strait of Hormuz</b> and the Strait of Hormuz again; Tokyoite is not Tokyo. <a href="#">Tokyo</a> ホルムズ海峡。</p>';
  const out = C.linkProse(html, recs);
  assert.equal((out.match(/atl-geo-ref/g) || []).length, 2, 'one reference per record');
  assert.match(out, /<b><span class="atl-geo-ref" data-geo="water:IR:hormuz">Strait of Hormuz<span class="atl-geo-n"[^>]*>1<\/span><\/span><\/b>/, 'the first mention, inside the <b>, got the badge');
  assert.ok(out.indexOf('Tokyoite') >= 0 && !/Tokyo<span class="atl-geo-n"[^>]*>2<\/span><\/span>ite/.test(out), 'a word containing the name is not the name');
  assert.match(out, /is not <span class="atl-geo-ref" data-geo="city:JP:tokyo">Tokyo/, 'the standalone Tokyo is');
  assert.match(out, /<a href="#">Tokyo<\/a>/, 'the one inside the link is untouched');
  assert.equal(out.indexOf('data-geo="water:IR:hormuz"'), out.lastIndexOf('data-geo="water:IR:hormuz"'), 'the Japanese spelling was not linked a second time');
  assert.equal(C.linkProse(html, []), html, 'no records → unchanged');
  assert.equal(C.linkProse('<p data-x="Tokyo">x</p>', recs), '<p data-x="Tokyo">x</p>', 'never inside a tag');
  /* recordsFor reads the bubble's own results */
  const recsFor = C.recordsFor([{ ok: true, meta: { compose: { placed: [{ id: 'a', n: 1 }] } } }, { ok: true, meta: {} }, { ok: true, meta: { compose: { placed: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] } } }]);
  assert.deepEqual(recsFor.map((r) => r.id), ['a', 'b']);
});

/* ══ ⑨ the wiring: registry, schema, catalogue, observer, console, docs — one fact, one place ════ */
test('R511 ⑨: map.compose is registered, documented, observed, dispatched and described — and the shell did not grow', () => {
  const cap = CAPS.resolve('compose');
  assert.ok(cap && cap.id === 'map.compose');
  assert.deepEqual(cap.produces, ['map', 'explanation']);
  /* (#R551) not `paint`: that verifier asks 「何か動いたか」, and 5 of 16 places moves the count just
     as well as 16 of 16. map.compose has a verifier that reads requested-vs-placed. */
  assert.equal(cap.observerKind, 'mapCompose');
  for (const alias of ['mapCompose', 'composeMap', 'explainOnMap']) assert.equal(CAPS.resolve(alias).id, 'map.compose', alias);
  assert.ok(SCHEMAS.schemaFor('map.compose'), 'a schema of its own');
  assert.ok(makeAtlasCatalogText({}, {}).idsCovered().includes('map.compose'), 'the catalogue describes it');
  const caps = R('js/atlas-capabilities.js');
  /* (atlas-observer-undo) asked of the renderer by the effect key, and the module claims its source under it */
  assert.match(caps, /compose: ownedFeatures\('map\.compose'\)/, 'the paint observer reads the compose surface');
  const mod = R('js/atlas-map-compose.js');
  assert.match(mod, /render\.claim\(SRC, 'map\.compose'/, '…which the module claims under the key map.compose writes');
  assert.match(mod, /const SRC = 'atl-compose-src'/, '…and that is the source the module writes');
  const con = (R('js/atlas-console.js') + '\n' + capsSource());
  assert.match(con, /^import \{ makeAtlasMapCompose \} from '\.\/atlas-map-compose\.js';/m, 'imported at line start (scripts/js-reachability.mjs anchors there)');
  assert.match(capabilityEntry('compose').run, /return await COMPOSE\.run\(a,dctx\);/, 'the capability\'s run reaches the module — with the execution context (#R551)');
  for (const alias of ['mapCompose', 'composeMap', 'explainOnMap']) assert.equal(CAPS.dispatchName(alias), 'compose', `every spelling the registry promises reaches that case (atlas-one-declaration): ${alias}`);
  assert.match(con, /"answer_mode":"text"\|"map"\|"chart"\|"mixed"/, 'the REPLY FORMAT tells Atlas the field exists');
  assert.match(con, /COMPOSE\.linkProse\(head,_cr\)/, 'the answer is linked to the markers it drew');
  assert.match(con, /COMPOSE\.bind\(ai\)/);
  assert.match(capabilityEntry('reset').run, /COMPOSE\.clear\(\)/, 'clearing highlights clears the composition');
  assert.match(capabilityEntry('clearAll').run, /COMPOSE\.clear\(\)/);
  /* the overlay chip's layer list IS the module's list — one fact. (atlas-one-declaration) It is no longer typed a second
     time in js/atlas-console.js: the chip's kind is the effect key the module claims its source under, and the layers are
     the ones reading that source. tests/atlas-one-declaration-checks.test.mjs RUNS the module's painter and the chip's
     resolver against one renderer and holds the result equal to C.LAYERS. */
  assert.doesNotMatch(con, /compose:\['atl-compose/, '_OVL types the compose layers again — the claim is the list');
  assert.match(con, /'map\.compose':'map\.compose'/, 'the compose chip switches what map.compose claimed');
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.match(R('docs/FILES.md'), /atlas-map-compose\.js/, 'docs/FILES.md describes the file');
  assert.match(R('js/atlas-styles.js'), /\.atl-geo-n\{/, 'the badge is styled');
});

/* ══ ⑩ the policy text did not grow a rule about meaning ═══════════════════════════════════════ */
test('R511 ⑩: no sentence was added to js/atlas-policy.js, and the loop does not read a tool NAME to decide the gate', async () => {
  /* RUN, not read (consolidation): the policy is asked for every clause it can hand the model, and the
     gate is driven with names and flags pulled apart, so what it decides from is observed. */
  const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
  const P = makeAtlasPolicy();
  const pol = Object.keys(P).map((k) => String(P[k]())).join('\n');
  assert.ok(pol.length > 0 && !/answer_mode|compose/.test(pol), 'the mechanics live in the REPLY FORMAT and the tool, not in the core instruction');
  /* (#R543) the gate generalised from one modality to a set; the CLAIM is unchanged and is the one that
     matters: the loop decides from flags stamped on results, never from what a tool is called. */
  const NAMED = { compose_map: { name: 'compose_map', description: 'draws', parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string', minLength: 1 } } } } };
  const mapFinal = (name, result) => AGENT.runTurn({
    model: scripted([
      { text: '', toolCalls: [{ id: 'a', name, arguments: { x: 'p' } }], answerMode: 'map' },
      { text: 'done', toolCalls: [], answerMode: 'map' },
      { text: 'done', toolCalls: [], answerMode: 'text' },
    ]),
    tools: Object.assign({}, TOOLS, NAMED), execute: async () => result, messages: [{ role: 'user', content: 'x' }],
  });
  const byName = await mapFinal('compose_map', { ok: true });
  assert.equal(byName.trace.outputGate, 1, 'the gate reads a flag on the result, never a name — a tool CALLED compose_map with no flag drew nothing');
  assert.equal(byName.mapDrawn, false);
  /* …and the flags it reads are exactly the two the tool surface stamps */
  const byModes = await mapFinal('zzz', { ok: true, producedModes: ['map'] });
  assert.equal(byModes.trace.outputGate, 0, 'r.producedModes is read');
  assert.equal(byModes.mapDrawn, true);
  const byFlag = await mapFinal('zzz', { ok: true, changedMap: true });
  assert.equal(byFlag.trace.outputGate, 0, '#R511\'s flag is still honoured as the map member of the set');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r663-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R663 — A TURN ENDED BY OMISSION, AND THE ANSWER WAS WRITTEN BEFORE THE DECISION
 * ----------------------------------------------------------------------------
 *  Measured on the live site, logged in, with the ai-proxy request body read off the wire:
 *  「東北沖でM9の地震が起きたときの津波の伝播をシミュレーションして見せて」 came back as ONE model call,
 *  ZERO tool calls, and the sentence 「まず、利用可能な津波シミュレーション機能の設定を確認します。」.
 *  `window.IntMapTsunami` stayed undefined and the map gained no source. #R582's capability index WAS
 *  in that system prompt — the reply names the capability it is about to reach — so the defect is not
 *  that Atlas could not see the tool. It is that the wire shape made 「これから調べます」 a complete,
 *  well-formed turn:
 *
 *    ① `final_text` was the FIRST property of a strict json_schema, which is generated in property
 *       order — so the reader's sentence was written before `tool_calls` was ever reached;
 *    ② the turn ENDED when `tool_calls` came back empty, the cheapest thing a model can emit, so
 *       「途中である」 and 「終わった」 were the same bytes and the intention had nowhere to go but the
 *       sentence the reader gets.
 *
 *  ⚠ WHAT THIS ROUND IS FORBIDDEN TO DO, and what these checks hold it to: no rule about meaning, no
 *  list of spellings 「まず」/「確認します」, no clause in js/atlas-policy.js, no second gate beside the
 *  #R511/#R543 one. What is added is one word Atlas may say about its own reply, and the same
 *  consistency check that already holds it to `answer_mode` (CONSTITUTION.md §5).
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');

const AGENT = makeAtlasAgent();

/* a model that reads from a script, and records what it was asked */
const scripted = (steps) => {
  const seen = [];
  const fn = async (req) => { seen.push(req); return steps[Math.min(seen.length - 1, steps.length - 1)]; };
  fn.seen = seen;
  return fn;
};
/* the tool surface of the reported turn, reduced to what the loop needs: a name and a schema */
const TOOLS = {
  find_capability: { name: 'find_capability', description: 'find', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
  run_capability: { name: 'run_capability', description: 'run', parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
};
const ran = () => { const calls = []; return { calls, execute: async (c) => { calls.push(c.name); return { ok: true, note: 'done' }; } }; };

/* ══ ① THE DECLARATION EXISTS ON THE WIRE, AND SAYING NOTHING IS STILL A COMPLETE REPLY ═════════ */
test('R663 ①: readReply reads `turn`, the schema declares the vocabulary, and it is NOT required', () => {
  assert.deepEqual(AGENT.TURN_STATES, ['final', 'continuing']);
  assert.deepEqual(AGENT.FINAL_SCHEMA.properties.turn.enum, AGENT.TURN_STATES, 'the schema reads the same list');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'continuing' }, '', JSON.parse).turnState, 'continuing');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'FINAL' }, '', JSON.parse).turnState, 'final');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'halfway' }, '', JSON.parse).turnState, '', 'a word outside the vocabulary is no declaration');
  assert.equal(AGENT.readReply({ final_text: 'a' }, '', JSON.parse).turnState, '', 'and neither is silence');
  /* ⚠ THE POINT OF THIS LINE: a model that never says the word behaves exactly as it did before, and
     no reply Atlas could make before is refused now (CONSTITUTION.md §5). */
  assert.deepEqual(AGENT.FINAL_SCHEMA.required, ['final_text'], 'declaring what the reply is stays optional');
  /* the schema must still be strictly expressible or supabase/functions/ai-proxy drops the WHOLE
     thing to bare json_object and the enum stops being enforced at all (tests/r406-turn ⑭'s rule) */
  const expressible = (n) => !n || typeof n !== 'object' ? false
    : n.type === 'array' ? expressible(n.items)
      : n.type !== 'object' ? true
        : Object.keys(n.properties || {}).length > 0 && Object.keys(n.properties).every((k) => expressible(n.properties[k]));
  assert.ok(expressible(AGENT.FINAL_SCHEMA));
});

/* ══ ② THE ORDER OF THE FIELDS IS THE ORDER OF THE DECISION ════════════════════════════════════
      A strict json_schema is generated in property order, so this is not cosmetic: it is what stops
      the sentence being committed to before the calls exist. ═══════════════════════════════════ */
test('R663 ②: the reply is generated decision-first — what it IS, what it DOES, then what it SAYS', () => {
  const keys = Object.keys(AGENT.FINAL_SCHEMA.properties);
  assert.equal(keys[0], 'turn');
  /* (atlas-legacy-protocol-removal) the calls are not a field any more: they are the provider's function_call items,
     emitted beside the message rather than after the prose inside it */
  assert.equal(keys.indexOf('tool_calls'), -1, 'no call rides in the written JSON');
  assert.deepEqual(keys, ['turn', 'answer_mode', 'final_text']);
  assert.equal(keys[keys.length - 1], 'final_text');
});

/* ══ ③ THE REPORTED TURN, REPRODUCED AND THEN RECOVERED ════════════════════════════════════════ */
test('R663 ③: a reply that calls itself mid-turn and issued no call is handed back, and the calls then run', async () => {
  const model = scripted([
    { text: 'まず、利用可能な津波シミュレーション機能の設定を確認します。', toolCalls: [], turnState: 'continuing' },
    { text: '', toolCalls: [{ id: 'a', name: 'find_capability', arguments: { query: 'tsunami' } }], turnState: 'continuing' },
    { text: '津波の伝播を描きました。', toolCalls: [], turnState: 'final' },
  ]);
  const ex = ran();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'sim' }] });
  assert.equal(out.trace.outputGate, 1, 'handed back exactly once');
  assert.deepEqual(ex.calls, ['find_capability'], 'and the tool the sentence promised actually ran');
  assert.equal(out.text, '津波の伝播を描きました。');
  assert.ok(!/確認します/.test(out.text), 'the promise never reaches the reader as the answer');
  /* the note is mechanical and names the contradiction, never a word of the prose */
  const notes = model.seen[1].messages.filter((m) => m.role === 'tool').map((m) => m.content[0]);
  assert.equal(notes[0].error, 'no_calls_issued');
  assert.match(notes[0].message, /this reply made none, so nothing ran/);
});

/* ══ ④ NOTHING WAS TAKEN AWAY: an undeclared or "final" zero-call reply still ends on step 0 ════ */
test('R663 ④: silence and "final" still end the turn on the first step, having touched nothing', async () => {
  for (const reply of [{ text: 'セーヌ川は約777 kmです。', toolCalls: [] },
    { text: 'セーヌ川は約777 kmです。', toolCalls: [], turnState: 'final' }]) {
    const model = scripted([reply]);
    const ex = ran();
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'q' }] });
    assert.equal(model.seen.length, 1, 'one model call');
    assert.equal(out.trace.outputGate, 0);
    assert.equal(out.stopped, 'answered');
    assert.equal(out.text, 'セーヌ川は約777 kmです。');
    assert.deepEqual(ex.calls, []);
  }
});

/* ══ ⑤ IT IS THE SAME GATE — bounded by the same budget, and the reader is never left with nothing ══ */
test('R663 ⑤: the bounces are bounded by maxOutputGate, and the accepted reply is still the answer', async () => {
  const stuck = { text: '確認します。', toolCalls: [], turnState: 'continuing' };
  const model = scripted([stuck]);
  const ex = ran();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'q' }] });
  assert.equal(out.trace.outputGate, AGENT.LIMITS.maxOutputGate, 'handed back at most twice');
  assert.equal(model.seen.length, AGENT.LIMITS.maxOutputGate + 1);
  /* ⚠ the reader gets the sentence rather than an empty bubble: text held back mid-turn is taken
     back by the branch that accepts the reply as final. */
  assert.equal(out.text, '確認します。');
  assert.equal(out.stopped, 'answered');
});

/* ══ ⑥ ONE GATE, NOT TWO — and it reads flags, never words ═════════════════════════════════════ */
test('R663 ⑥: no second bounce was added, no rule about meaning, and js/atlas-policy.js is untouched', () => {
  const agent = R('js/atlas-agent.js');
  assert.equal((agent.match(/gateBounces\+\+/g) || []).length, 1, 'there is still exactly one place a final is handed back');
  assert.equal((agent.match(/trace\.outputGate\+\+/g) || []).length, 1);
  /* the gate's own slice: it may read the declaration and the results, never the tool's name */
  const from = agent.indexOf('const need = MODE_NEEDS');
  const gate = agent.slice(from, agent.indexOf('continue;', from));
  assert.match(gate, /turnState === 'continuing'/, 'the second declaration is checked in the SAME gate');
  assert.ok(!/r\.name|call\.name|tools\[/.test(gate), 'the gate reads flags on results, never a name');
  /* ⚠⚠ AND THE LOOP MATCHES NO PATTERN AGAINST ANYTHING. The fix this round was forbidden to make
     is a rule that reads the reply's words — 「まず」/「確認します」/"I will now" — which is #R406's
     original defect wearing a different hat (.agents/rules/no-ad-hoc-hardcoding.md §1). The claim is
     structural rather than a list of banned spellings: js/atlas-agent.js runs no regular expression
     at all, so there is nowhere for one to live. */
  assert.ok(!/\.(test|match|search|replace)\(|RegExp/.test(agent.replace(/^\s*[/*].*$/gm, '')),
    'the loop never matches a pattern against the reply');
  const POLICY = makeAtlasPolicy();
  assert.deepEqual(Object.keys(POLICY).filter((k) => k !== 'all').sort(),
    ['coordinateProvenance', 'core', 'mapWhatYouName', 'sensitiveRequests', 'turnMechanics'].sort(),
    'the policy still has exactly the five clauses #R582 counted');
  assert.ok(!/turn"|continuing/.test(R('js/atlas-policy.js')), 'the wire shape is described in the REPLY FORMAT, not in the core instruction');
});

/* ══ ⑧ …AND THE OTHER HALF THE REPRODUCTION FOUND: A FAILURE WITH NO REASON ════════════════════
      With ① in place the measured turn stopped narrating and called `run_capability('sim.tsunami')`
      — eight times, permuting the arguments, until the step budget ran out. Every result came back
      `{"ok":false,"error":"failed"}` and nothing else, because the dispatch case had refused with
      「震源はどこですか（地名または経緯度）」 rendered into the READER's bubble and the field
      js/atlas-toolsurface.js reads (`res.error`) is one almost no case sets. A recovery chosen from
      the word "failed" is a guess. ══════════════════════════════════════════════════════════════ */
test('R663 ⑧: a refusal reaches Atlas as the sentence IntMap wrote, not as the bare word "failed"', async () => {
  const CAPS = makeAtlasCapabilities({});
  const SCHEMAS = makeAtlasSchemas();
  /* the dispatch, refusing exactly the way js/atlas-console.js's tsunami case refuses */
  const runAction = async () => ({ ok: false, html: '<div class="atl-warn">⚠ 震源はどこですか（地名または経緯度）。</div>' });
  const SURF = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction });
  const tools = SURF.baseTools();
  const exec = SURF.makeExecute(tools, AGENT);
  const out = await exec({ name: 'run_capability', arguments: { id: 'sim.tsunami', args: { lat: 38.3, lng: 143 } } });
  assert.equal(out.ok, false);
  assert.match(out.message, /震源はどこですか/, 'the reason the reader was given is the reason Atlas is given');
  assert.ok(!/<div|class=/.test(out.message), 'as text, not as markup');
  /* ⚠ and it is ONE reading for every case: nothing here knows which capability refused */
  const surf = codeOnly(R('js/atlas-toolsurface.js'));   /* the CODE, not the comments that record the measurement */
  assert.ok(!/sim\.tsunami|震源/.test(surf), 'no capability and no sentence is named in the surface');
  /* the same reading serves a case that refuses for an entirely different reason */
  const other = await exec({ name: 'run_capability', arguments: { id: 'sim.nightSky', args: { lat: 1, lng: 1 } } });
  assert.match(other.message, /震源/, 'one reading, every case — the text comes from the result, not from a table');
});

/* ══ ⑦ THE SYSTEM PROMPT TELLS ATLAS THE FIELD EXISTS — and the shell did not grow ═════════════ */
test('R663 ⑦: SYS() carries the new wire shape, and js/atlas-console.js stayed under its ceiling', () => {
  /* read, not run: SYS() is assembled inside the Atlas kernel (js/atlas-console.js), a closure over the
     whole HOST that only a browser can build. */
  const con = (R('js/atlas-console.js') + '\n' + capsSource());
  assert.match(con, /"turn":"final"\|"continuing"/, 'the REPLY FORMAT names the field and its vocabulary');
  assert.match(con, /"answer_mode":"text"\|"map"\|"chart"\|"mixed"/, '…and #R511\'s field is still named');
  assert.match(con, /a reply that says what you are about to do is "continuing"/, 'and what to do with it');
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r742-empty-answer-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R742 — A TURN THAT SAID NOTHING, AND A TURN THAT SAID WHAT IT WAS ABOUT TO DO
 * ----------------------------------------------------------------------------
 *  Measured on https://rwmqx7dwb5-arch.github.io/IntMap/ on 2026-09-15, 33 questions:
 *
 *    A. THREE questions ended with the single word 「Done.」 — 「Show me the Roman Empire at its
 *       greatest extent…」, 「Which countries have never been members of the United Nations?」,
 *       「…where the Amazon rainforest has been deforested most since 2000」. One step, 5–12 s,
 *       `actionOutcomes` empty, `mapDrawn:false`. On the wire: `tool_calls:[]`, no `answer_mode`,
 *       no `turn`, `final_text:""` — which `required:['final_text']` accepts, because a string
 *       schema with no `minLength` accepts the empty string. The loop's gate compares a
 *       DECLARATION with the turn's record, so a reply that declared nothing was compared with
 *       nothing, `stopped` read 'answered', and js/atlas-console.js's `||esc(L('Done.'…))` was the
 *       whole answer the reader got.
 *
 *    B. THREE more ended on their working limit with the reader holding a promise: 「Measuring the
 *       straight-line distance … and drawing it on the map」 for Lisbon→Cape Town — a turn whose own
 *       record says `measure:ok, drawLine:ok`. The distance was computed and never reached the
 *       reader, because that sentence, written on a step that then issued calls, had already become
 *       the turn's `text`, and the "write the answer" hand-back only runs when `text` is empty.
 *
 *  ⚠ WHAT THESE CHECKS HOLD THE FIX TO, and what it was forbidden to do: no list of spellings
 *  (「まず」/"I will now"/"Measuring"), no rule about what prose means, no clause in
 *  js/atlas-policy.js, no second gate beside #R511/#R543/#R663's, and nothing that writes a
 *  sentence on Atlas's behalf. Both defects are visible as contradictions between two things the
 *  machine RECORDED: "the turn is over" against "the reader has nothing", and "this reply is the
 *  answer" against "this reply issued the calls that continue the turn".
 *  ⑤ runs the pre-fix module — the shipped source with the four changes reverted — so that ①–③ are
 *  known to measure the defect rather than to agree with whatever the loop happens to do.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

const AGENT = makeAtlasAgent();

/* a model that reads from a script and records every request it was handed */
const scripted = (steps) => {
  const seen = [];
  const fn = async (req) => {
    seen.push(req);
    const s = steps[Math.min(seen.length - 1, steps.length - 1)];
    return typeof s === 'function' ? s(req) : s;
  };
  fn.seen = seen;
  return fn;
};
const TOOLS = {
  find_capability: { name: 'find_capability', description: 'find', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
  measure: { name: 'measure', description: 'measure', parameters: { type: 'object', required: ['what'], properties: { what: { type: 'string' } } } },
  ask: { name: 'ask', description: 'asks the reader', endsTurn: true, parameters: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } },
};
const ran = () => { const calls = []; return { calls, execute: async (c) => { calls.push(c.name); return { ok: true, note: 'done' }; } }; };
/* the typed notes the loop handed back to the model on a given step */
const notesOn = (req) => (req.messages || []).filter((m) => m.role === 'tool').flatMap((m) => m.content || []);

/* ── THE PRE-FIX MODULE, built from the shipped source with this round's four changes reverted.
      Each reversion asserts it actually applied: a mutation that matched nothing is a check that
      measures nothing (memory: intmap-recurring-lessons). The relative import is rewritten to an
      absolute URL because the mutant is evaluated from a data: URL, which has no directory. ───── */
const REVERSIONS = [
  ['if (calls.length) midText = reply.text; else text = reply.text;', 'text = reply.text;'],
  ["'no_calls_issued'\n              : (!String(answerHere || '').trim() ? 'no_answer_written' : ''));", "'no_calls_issued' : '');"],
  ["if (!String(text || '').trim() && stopped !== 'aborted'", "if (!String(text || '').trim() && results.length && stopped !== 'aborted'"],
  /* (#R802) …and the closing call this round gave a CUT turn. #R742's pre-fix module is the agent WITHOUT
     that round's four changes, so this round's one line has to come out with them — otherwise the
     reconstructed pre-fix agent still writes the answer and ⑤ can no longer observe the defect it names. */
  ['      if (cutShort) writeAnswer = true;   /* (#R802) the turn ran out — see above */\n', ''],
  ["if (!String(text || '').trim() && stopped === 'answered') stopped = 'no_answer';", ''],
];
async function preFixAgent() {
  let src = readFileSync(join(ROOT, 'js/atlas-agent.js'), 'utf8').split('\r\n').join('\n');
  src = src.split("from './atlas-turn-results.js'").join("from '" + pathToFileURL(join(ROOT, 'js/atlas-turn-results.js')).href + "'");
  for (const [from, to] of REVERSIONS) {
    const parts = src.split(from);
    assert.equal(parts.length, 2, 'the reversion matched the shipped source exactly once: ' + from.slice(0, 48));
    src = parts.join(to);
  }
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
  return mod.makeAtlasAgent();
}

/* ══ ① THE MEASURED TURN A: NOTHING SAID, NOTHING RUN, NOTHING DECLARED ════════════════════════ */
test('R742 ①: an empty final with no calls and no declaration is handed back, and the answer then written', async () => {
  const model = scripted([
    { text: '', toolCalls: [] },                                     /* step 0: the production reply */
    (req) => {
      const n = notesOn(req);
      assert.equal(n.length, 1, 'exactly one note came back');
      assert.equal(n[0].error, 'no_answer_written');
      assert.match(n[0].message, /final_text is empty/);
      assert.ok(!/Done\./.test(n[0].message), 'the note never proposes words for the reader');
      return { text: 'The Roman Empire at its greatest extent covered …', toolCalls: [] };
    },
  ]);
  const ex = ran();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'Show me the Roman Empire at its greatest extent' }] });
  assert.equal(out.trace.outputGate, 1, 'handed back exactly once');
  assert.equal(out.stopped, 'answered');
  assert.equal(out.text, 'The Roman Empire at its greatest extent covered …');
  assert.deepEqual(ex.calls, []);
  assert.equal(model.seen.length, 2, 'the bounced reply and the written answer');
});

/* ══ ② IT IS BOUNDED, AND A TURN THAT STILL WROTE NOTHING SAYS SO RATHER THAN REPORTING SUCCESS ══ */
test('R742 ②: the bounces are the same bounded budget, and an answerless turn does not end "answered"', async () => {
  const model = scripted([{ text: '', toolCalls: [] }]);
  const ex = ran();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'q' }] });
  assert.equal(out.trace.outputGate, AGENT.LIMITS.maxOutputGate, 'the same ceiling #R511 set, not a new one');
  assert.equal(out.text, '', 'the loop never writes a sentence on Atlas\'s behalf');
  assert.equal(out.stopped, 'no_answer', 'a turn with no answer in it is not a turn that answered');
  assert.deepEqual(ex.calls, []);
  /* ⚠ and the last hand-back reached a turn that ran NO tool — the condition that made it
     unreachable for exactly the measured turns is gone */
  const forced = (out.trace.steps || []).filter((s) => s.forced);
  assert.equal(forced.length, 1, 'the answer was asked for once more before the turn gave up');
  assert.equal(model.seen[model.seen.length - 1].final, true);
  assert.match(String(model.seen[model.seen.length - 1].messages.pop().content), /WRITE THE ANSWER/);
});

/* ══ ③ THE MEASURED TURN B: THE PROMISE IS NOT THE ANSWER, AND THE RESULT REACHES THE READER ════
      Nothing here reads a word: what separates this sentence from an answer is that the SAME reply
      issued the calls that continue the turn. ═══════════════════════════════════════════════════ */
test('R742 ③: a sentence written on a step that issued calls never becomes the turn\'s answer', async () => {
  const PROMISE = 'Measuring the straight-line distance from Lisbon to Cape Town and drawing it on the map.';
  const model = scripted([(req) => (req.final
    ? { text: 'Lisbon to Cape Town is about 8,300 km.', toolCalls: [] }
    : { text: PROMISE, toolCalls: [{ id: 'm' + req.step, name: 'measure', arguments: { what: 'lisbon-capetown-' + req.step } }] })]);
  const ex = ran();
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'distance Lisbon → Cape Town' }], limits: { maxSteps: 2 } });
  assert.equal(out.stopped, 'step_budget', 'the turn was cut by its working limit, as the measured one was');
  assert.ok(!/Measuring/.test(out.text), 'the promise never reaches the reader as the answer');
  assert.equal(out.text, 'Lisbon to Cape Town is about 8,300 km.', 'the number the turn actually produced does');
  assert.equal(out.results.length, 2);
});

/* ══ ③b NOTHING WAS TAKEN: the provisional sentence is taken back when no answer was written over
      it — which is the turn that ends by asking the reader a question (#R419), where that sentence
      and the question card are all there is. ═══════════════════════════════════════════════════ */
test('R742 ③b: a turn that ends by asking still carries the sentence written beside the question', async () => {
  const model = scripted([{ text: 'Which radius did you mean?', toolCalls: [{ id: 'a', name: 'ask', arguments: { q: 'radius?' } }] }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }] });
  assert.equal(out.stopped, 'awaiting_user');
  assert.equal(out.text, 'Which radius did you mean?');
  assert.equal(model.seen.length, 1, 'and no call was spent writing an answer under a question');
});

/* ══ ④ THE LEGITIMATE SILENCE #R663 ④ PROTECTS IS UNTOUCHED ════════════════════════════════════ */
test('R742 ④: a plain answer with no calls and no declaration still ends the turn on step 0', async () => {
  for (const reply of [{ text: 'セーヌ川は約777 kmです。', toolCalls: [] },
    { text: 'セーヌ川は約777 kmです。', toolCalls: [], turnState: 'final' }]) {
    const model = scripted([reply]);
    const ex = ran();
    const out = await AGENT.runTurn({ model, tools: TOOLS, execute: ex.execute, messages: [{ role: 'user', content: 'q' }] });
    assert.equal(model.seen.length, 1, 'one model call');
    assert.equal(out.trace.outputGate, 0);
    assert.equal(out.stopped, 'answered');
    assert.equal(out.text, 'セーヌ川は約777 kmです。');
    assert.deepEqual(ex.calls, []);
  }
});

/* ══ ⑤ THE SAME THREE TURNS, ON THE PRE-FIX MODULE: the defect, reproduced ═════════════════════ */
test('R742 ⑤: before this round, ①②③ are the production transcripts — Done., and a promise as the answer', async () => {
  const PRE = await preFixAgent();
  /* A — one step, `stopped:'answered'`, and an empty answer for js/atlas-console.js to render as 「Done.」 */
  const m1 = scripted([{ text: '', toolCalls: [] }]);
  const a = await PRE.runTurn({ model: m1, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }] });
  assert.equal(m1.seen.length, 1, 'one model call — nothing was ever handed back');
  assert.equal(a.trace.outputGate, 0);
  assert.equal(a.stopped, 'answered', 'an answerless turn reported success');
  assert.equal(a.text, '');
  /* B — the promise, kept as the answer, and the forced final never asked for a real one */
  const PROMISE = 'Measuring the straight-line distance from Lisbon to Cape Town and drawing it on the map.';
  const m2 = scripted([(req) => (req.final
    ? { text: 'Lisbon to Cape Town is about 8,300 km.', toolCalls: [] }
    : { text: PROMISE, toolCalls: [{ id: 'm' + req.step, name: 'measure', arguments: { what: 'lisbon-capetown-' + req.step } }] })]);
  const b = await PRE.runTurn({ model: m2, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }], limits: { maxSteps: 2 } });
  assert.equal(b.text, PROMISE, 'the reader was shown what the turn was about to do');
  /* and the properties that must NOT have changed are already true before the fix */
  const m3 = scripted([{ text: 'セーヌ川は約777 kmです。', toolCalls: [] }]);
  const c = await PRE.runTurn({ model: m3, tools: TOOLS, execute: async () => ({ ok: true }), messages: [{ role: 'user', content: 'q' }] });
  assert.equal(c.stopped, 'answered');
  assert.equal(c.text, 'セーヌ川は約777 kmです。');
});

/* ══ ⑥ ONE GATE, STILL — and still not a word of prose is read ═════════════════════════════════ */
test('R742 ⑥: the third contradiction joined the same gate, and the loop still matches no pattern', () => {
  /* read, not run: the claim is universal over the loop's source — ONE hand-back site and NO pattern
     matched against a reply anywhere — which no finite set of scripted turns can establish; the
     behaviour itself is run in ①–⑤. */
  const agent = readFileSync(join(ROOT, 'js/atlas-agent.js'), 'utf8');
  assert.equal((agent.match(/gateBounces\+\+/g) || []).length, 1, 'there is still exactly one place a final is handed back');
  assert.equal((agent.match(/trace\.outputGate\+\+/g) || []).length, 1);
  assert.ok(!/\.(test|match|search|replace)\(|RegExp/.test(agent.replace(/^\s*[/*].*$/gm, '')),
    'the loop never matches a pattern against the reply');
  /* the declaration stayed optional: making `turn` required would force a word out of every reply
     without holding anyone to it — a model that answers "final" to the same promise is refused
     nothing by this gate, which reads the record instead (tests/r511 ④, tests/r663 ①) */
  assert.deepEqual(AGENT.FINAL_SCHEMA.required, ['final_text']);
});
}
