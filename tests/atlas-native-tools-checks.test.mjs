/* ============================================================================
 *  atlas-native-tools — THE TURN'S OWN RESULTS WERE CUT OFF THE END OF EVERY ATLAS STEP, AND NOBODY WAS TOLD
 * ----------------------------------------------------------------------------
 *  THE DEFECT, AS MEASURED. js/atlas-console.js built ONE string per step — map state, context,
 *  ledger, 48 lines of conversation, [REQUEST], then [THIS TURN SO FAR] with every call and every
 *  result as JSON — and supabase/functions/ai-proxy kept `.slice(0, 24_000)` of it. The END is what
 *  went: this turn's tool results, and on a long conversation the request itself. One find_capability
 *  answer is 10,441 characters at the median and 39,235 at the largest of 20 ordinary queries (the
 *  real registry with the real catalogue text), so ONE search could push every later result off the
 *  end. Neither the model nor the reader was told. That is .agents/rules/one-pass-or-a-reason.md §2's
 *  second cause — the result did not reach the model deciding the next step — made by the transport.
 *
 *  Each check below states that defect, and each one EVALUATES the code that decides it — the
 *  composer (js/atlas-agent.js composeInput), the loop that feeds it (runTurn), and the proxy's own
 *  last fence (normalizeTurn, transpiled out of the Edge Function and run):
 *
 *    ① this turn's tool results reach the model's input — every one, the latest whole — however
 *      large the history and however large the searches;
 *    ② the prefix a provider caches is byte-identical from one step to the next;
 *    ③ whatever is given up is SAID: in the item, in a notice, in the trace — and what was cut can
 *      be read back whole (read_result);
 *    ④ every call the model made is answered — a native function_call with no output is a request
 *      the provider refuses, and `.slice(0, maxPerStep)` used to drop the rest in silence;
 *    ⑤ the proxy's fence is above the client's budget, keeps the request and the turn, and reports;
 *    ⑥ the reply is read from the provider's items, and the final shape is TURN_SCHEMA without calls;
 *    ⑦ the header states the model the code runs.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const AGENT = makeAtlasAgent();
const FENCE = makeAtlasPolicy().turnMechanics.fence;
const B = AGENT.INPUT_BUDGET;

/* ── the proxy's normalizer, evaluated. The region between the two markers is lifted, stripped of
      its types by esbuild, and run — together with schemaOk, which it calls. ─────────────────── */
const PROXY = rd('supabase/functions/ai-proxy/index.ts');
function region(from, to) {
  const a = PROXY.indexOf(from), b = PROXY.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, 'ai-proxy: the region «' + from + '» … «' + to + '» moved');
  return PROXY.slice(a, b);
}
const SERVER = (() => {
  const src = region('const MAX_SCHEMA_BYTES', '/* ══ (#R397) THE SCHEMA REACHED GEMINI')
    + region('const MAX_INPUT_ITEMS', '/* ⚠ A TASK IS A KEY INTO FOUR CONFIGURATION TABLES')
    + '\nreturn { normalizeTurn, fnParameters, placeAttachments, MAX_INPUT_CHARS, MAX_ITEM_CHARS, MAX_INPUT_ITEMS };';
  const js = transformSync(src, { loader: 'ts' }).code;
  return new Function(js)();
})();

/* ── a turn driven through the REAL loop, with an adapter that composes the input the way
      js/atlas-console.js _model does, and a scripted model that answers in the protocol-2 shape
      (readReply over the provider's items). ─────────────────────────────────────────────────── */
function nativeReply(calls, finalText) {
  const output = [];
  if (finalText != null) output.push({ type: 'message', role: 'assistant', content: JSON.stringify({ turn: calls.length ? 'continuing' : 'final', final_text: finalText }) });
  calls.forEach((c) => output.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args || {}) }));
  const text = finalText != null ? JSON.stringify({ turn: calls.length ? 'continuing' : 'final', final_text: finalText }) : '';
  return AGENT.readReply(text ? JSON.parse(text) : null, text, JSON.parse, { protocol: 2 }, output);
}
async function drive({ history, script, results, tail, seen = [] }) {
  const scriptErrors = [];
  const tools = {
    find_capability: { name: 'find_capability', description: 'search', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } },
    map_view: { name: 'map_view', description: 'move', parameters: { type: 'object', properties: { place: { type: 'string' } } } },
  };
  let step = 0;
  const out = await AGENT.runTurn({
    tools,
    execute: async (call) => (results[call.id] || { ok: true }),
    messages: [{ role: 'user', content: 'Q' }],
    model: async (req) => {
      const built = AGENT.composeInput({ history, request: '[MAP STATE WHEN THE REQUEST ARRIVED]\nstate\n\n[REQUEST]\nQ',
        transcript: req.messages, tail: tail ? tail(step) : '', fence: FENCE });
      seen.push({ built, tools: JSON.stringify(req.tools), final: !!req.final });
      const r = script[Math.min(step, script.length - 1)];
      step++;
      /* runTurn reads a throw from the model as a transport failure and ends the turn quietly — so an
         assertion inside a scripted step is re-raised here, where the test can see it */
      let reply;
      try { reply = typeof r === 'function' ? r(req) : r; } catch (e) { scriptErrors.push(e); throw e; }
      if (built.trim.droppedHistory || built.cut) reply.inputTrim = built.trim;
      return reply;
    },
  });
  if (scriptErrors.length) throw scriptErrors[0];
  return { out, seen };
}
const outputs = (items) => items.filter((it) => it.type === 'function_call_output');

/* ══ ① ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ①: this turn\'s tool results reach the model — a 48-line history and six 39k searches cannot push them off', async () => {
  const history = [];
  for (let i = 0; i < 48; i++) history.push({ role: i % 2 ? 'assistant' : 'user', content: 'h' + i + ' ' + 'x'.repeat(3990) });
  const results = {};
  const calls = [];
  for (let i = 0; i < 6; i++) { calls.push({ id: 'call_' + i, name: 'find_capability', args: { query: 'q' + i } }); results['call_' + i] = { ok: true, marker: 'RESULT-' + i + '-END', documentation: 'd'.repeat(39235) }; }
  const { seen } = await drive({ history, results, script: [nativeReply(calls.slice(0, 3), null), nativeReply(calls.slice(3), null), nativeReply([], 'done')] });
  const last = seen[seen.length - 1].built;
  const outs = outputs(last.input);
  assert.equal(outs.length, 6, 'every result of the turn is an item of the last step\'s input');
  /* the LATEST step's results arrive whole — the marker at the END of each record is there */
  for (const i of [3, 4, 5]) {
    const o = outs.find((x) => x.call_id === 'call_' + i);
    assert.ok(o.output.indexOf('RESULT-' + i + '-END') >= 0, 'the latest result call_' + i + ' reached the model whole');
  }
  /* the request itself is there, unchanged, and after whatever history survived */
  const req = last.input[last.requestIndex];
  assert.equal(req.content, '[MAP STATE WHEN THE REQUEST ARRIVED]\nstate\n\n[REQUEST]\nQ');
  /* what this CAUSED under the old transport: the same content as one string, sliced at 24,000 */
  const oneString = AGENT.legacyPrompt(last);
  assert.ok(oneString.slice(0, 24000).indexOf('RESULT-5-END') < 0, 'the fixture reproduces the defect: a 24,000 slice of the same content loses the turn\'s results');
  /* and the total fits the budget the composer promises */
  const total = last.input.reduce((a, it) => a + String(it.content || it.output || it.arguments || '').length, 0);
  assert.ok(total <= B.total, 'the composed input (' + total + ') is within INPUT_BUDGET.total (' + B.total + ')');
});

/* ══ ② ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ②: the prefix is byte-identical from one step to the next — each step only APPENDS', async () => {
  const history = [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }];
  const results = { a1: { ok: true, n: 1 }, a2: { ok: true, n: 2 }, a3: { ok: true, n: 3 } };
  const { seen } = await drive({ history, results, tail: (s) => '[CURRENT MAP STATE — now]\nstep ' + s,
    script: [nativeReply([{ id: 'a1', name: 'map_view', args: { place: 'Rome' } }], 'moving'),
      nativeReply([{ id: 'a2', name: 'find_capability', args: { query: 'x' } }, { id: 'a3', name: 'map_view', args: { place: 'Oslo' } }], null),
      nativeReply([], 'answer')] });
  assert.ok(seen.length >= 3);
  for (let k = 0; k + 1 < seen.length; k++) {
    const a = seen[k].built.input, b = seen[k + 1].built.input;
    /* step k's input minus what changes per step (the tail and the images marker at its end) */
    const stable = a.slice(0, a.length - 2);
    assert.deepEqual(b.slice(0, stable.length), stable, 'step ' + (k + 1) + ' does not begin with step ' + k + '\'s input');
    assert.equal(JSON.stringify(b.slice(0, stable.length)), JSON.stringify(stable), 'byte-identical, not merely equal');
    assert.equal(seen[k + 1].tools, seen[k].tools, 'the tool list is the same on every step — the final one included');
  }
  /* the console computes the system text once per turn and re-reads it only when the transport changes */
  const con = rd('js/atlas-console.js');
  assert.match(con, /let _sys=SYS\(_tools\); const _c0=_agentCtx\(\);/, 'SYS and the request context are fixed for the turn');
  assert.equal((con.match(/_sys=SYS\(_tools\)/g) || []).length, 2, 'SYS is rebuilt only where the transport falls back');
});

/* ══ ③ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ③: what is given up is said — a cut names its size and read_result returns the rest whole', async () => {
  const huge = 'H'.repeat(B.item * 2) + 'TAIL-OF-HUGE';
  const results = { big: { ok: true, documentation: huge } };
  let got = '';
  const seen = [];
  const { out } = await drive({ history: [], results, seen, script: [
    nativeReply([{ id: 'big', name: 'find_capability', args: { query: 'x' } }], null),
    () => {
      /* the model reads the cut note in ITS input and asks for the rest, from the offset the note names.
         (an assertion thrown in here would be swallowed as a transport failure, so it is asserted below) */
      const note = /read_result with \{"call_id":"big","offset":(\d+)\}/.exec(outputs(seen[seen.length - 1].built.input).map((o) => o.output).join('\n'));
      return nativeReply([{ id: 'r1', name: 'read_result', args: { call_id: 'big', offset: note ? +note[1] : -1 } }], null);
    },
    (req) => {
      const r = req.messages.filter((m) => m.role === 'tool').pop().content[0];
      assert.equal(r.ok, true, 'read_result answered');
      got = r.text;
      return nativeReply([{ id: 'r2', name: 'read_result', args: { call_id: 'big', offset: r.next } }], null);
    },
    (req) => { got += req.messages.filter((m) => m.role === 'tool').pop().content[0].text; return nativeReply([], 'ok'); },
  ] });
  const first = seen[1].built;
  assert.equal(first.cut, true, 'the composer reports that it cut');
  const o = outputs(first.input)[0].output;
  assert.match(o, new RegExp('this result is ' + AGENT.resultText(results.big && Object.assign({ id: 'big', name: 'find_capability' }, results.big)).length + ' characters'), 'the cut states the full size');
  assert.ok(o.lastIndexOf(FENCE.close) < o.indexOf('[CUT BY INTMAP'), 'the note is outside the fence — IntMap speaking, not the data');
  /* reading on reconstructs the record exactly */
  const full = AGENT.resultText(Object.assign({ id: 'big', name: 'find_capability' }, results.big));
  const rebuilt = full.slice(0, first.trim.truncated[0].shown) + got;
  assert.equal(rebuilt.length, full.length, 'the cut part plus read_result is as long as the whole record');
  assert.ok(rebuilt === full, 'the cut part plus read_result is the whole record');
  assert.ok(out.trace.inputTrims && out.trace.inputTrims.length, 'the loop recorded what was cut on each step');
  /* read_result is offered only on a step that cut something — the tool list is the cached prefix */
  assert.ok(!/read_result/.test(seen[0].tools), 'an ordinary step does not carry read_result');
  assert.match(rd('js/atlas-console.js'), /concat\(built\.cut\?\[AGENT\.READ_RESULT_TOOL\]:\[\]\)/, 'the console offers it exactly when the composer cut');
});

test('atlas-native-tools ③b: dropped history is announced by an item, oldest first, and never the request', () => {
  const history = [];
  for (let i = 0; i < 40; i++) history.push({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i + ':' + 'y'.repeat(9990) });
  const built = AGENT.composeInput({ history, request: '[REQUEST]\nnow', transcript: [{ role: 'user', content: 'now' }], fence: FENCE, budget: { total: 100000 } });
  assert.ok(built.trim.droppedHistory > 0);
  const notice = built.input[0];
  assert.match(notice.content, new RegExp('the ' + built.trim.droppedHistory + ' oldest messages'), 'one item says how many were left out');
  const kept = built.input.filter((it) => it.type === 'message' && /^m\d+:/.test(it.content)).map((it) => +/^m(\d+)/.exec(it.content)[1]);
  assert.equal(kept[0], built.trim.droppedHistory, 'the OLDEST went first');
  assert.equal(kept[kept.length - 1], 39, 'the newest is kept');
  assert.equal(built.input[built.requestIndex].content, '[REQUEST]\nnow');
});

test('atlas-native-tools ③c: under pressure the OLDER results of the turn are squeezed — the latest step\'s never are', () => {
  const tr = [{ role: 'user', content: 'q' }];
  for (let s = 0; s < 4; s++) {
    tr.push({ role: 'assistant', content: '', toolCalls: [{ id: 's' + s, name: 'find_capability', arguments: {} }] });
    tr.push({ role: 'tool', content: [{ id: 's' + s, ok: true, doc: 'D'.repeat(40000) + 'END' + s }] });
  }
  const built = AGENT.composeInput({ history: [], request: 'q', transcript: tr, fence: FENCE, budget: { total: 90000 } });
  const outs = outputs(built.input);
  assert.equal(outs.length, 4, 'nothing is dropped');
  assert.ok(outs[3].output.indexOf('END3') >= 0, 'the latest step\'s result is whole');
  assert.ok(built.trim.squeezed.length > 0 && built.trim.squeezed.every((t) => t.call_id !== 's3'));
  for (const t of built.trim.squeezed) assert.match(outs.find((o) => o.call_id === t.call_id).output, /read_result/, 'a squeezed result says how to read on');
});

/* ══ ④ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ④: every call the model made is answered — the ones past maxPerStep as not run, not dropped', async () => {
  const calls = [];
  for (let i = 0; i < AGENT.LIMITS.maxPerStep + 2; i++) calls.push({ id: 'k' + i, name: 'map_view', args: { place: 'P' + i } });
  const { seen } = await drive({ history: [], results: {}, script: [nativeReply(calls, null), nativeReply([], 'ok')] });
  const input = seen[1].built.input;
  const ids = input.filter((it) => it.type === 'function_call').map((it) => it.call_id);
  const answered = outputs(input).map((it) => it.call_id);
  assert.deepEqual(answered.slice().sort(), ids.slice().sort(), 'each function_call has exactly one function_call_output');
  assert.equal(ids.length, calls.length);
  assert.match(outputs(input).find((o) => o.call_id === 'k' + (calls.length - 1)).output, /step_call_limit/);
});

/* ══ ⑤ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ⑤: the proxy\'s fence sits above the client\'s budget, keeps the request and the turn, and reports what it cut', () => {
  assert.ok(SERVER.MAX_INPUT_CHARS >= B.total * 2 && SERVER.MAX_ITEM_CHARS >= B.item * 2,
    'a conforming client must never reach the server fence (MAX_INPUT_CHARS ' + SERVER.MAX_INPUT_CHARS + ', MAX_ITEM_CHARS ' + SERVER.MAX_ITEM_CHARS + ')');
  const input = [];
  for (let i = 0; i < 12; i++) input.push({ type: 'message', role: i % 2 ? 'assistant' : 'user', content: 'old' + i + ' ' + 'o'.repeat(SERVER.MAX_ITEM_CHARS - 10) });
  input.push({ type: 'attachments', channels: ['docs', 'files'] }, { type: 'message', role: 'user', content: 'THE REQUEST' },
    { type: 'function_call', call_id: 'c1', name: 'map_view', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'z'.repeat(SERVER.MAX_ITEM_CHARS + 500) });
  const t = SERVER.normalizeTurn({ protocol: 2, input, tools: [{ name: 'map_view', description: 'd', parameters: { type: 'object', properties: {} } }] });
  assert.ok(t && !t.error);
  assert.ok(t.items.some((it) => it.type === 'message' && it.content === 'THE REQUEST'), 'the request survives the fence');
  assert.ok(t.items.some((it) => it.type === 'function_call' && it.call_id === 'c1'), 'the call survives');
  const o = t.items.find((it) => it.type === 'function_call_output');
  assert.match(o.output, /CUT BY THE SERVER TO FIT — this item was \d+ characters/, 'an oversize item is cut IN the item, and says so');
  assert.match(t.items[0].content, /server left out the \d+ oldest messages/, 'dropped history is announced by an item');
  assert.ok(t.trim.droppedMessages > 0 && t.trim.cutItems === 1, 'and reported back in meta.inputTrimmed');
  /* the one-string path's slices are reported too, and both reach the reader of the response */
  assert.match(PROXY, /inputTrimmed: \(turnReq \? turnReq\.trim : legacyTrim\) \|\| undefined/);
  assert.match(PROXY, /promptChars: promptSent, promptKept: prompt\.length/);
  assert.match(PROXY, /protocol: turnReq \? 2 : 1/, 'meta says which protocol answered');
  /* the FIRST step has no call yet, and its tail (the state after nothing) is a later user message:
     the request is still the one kept — the history ends at the documents marker, not at the last
     user message */
  const first = input.slice(0, 14).concat([{ type: 'message', role: 'user', content: 'TAIL' }, { type: 'attachments', channels: ['images'] }]);
  const t0 = SERVER.normalizeTurn({ protocol: 2, input: first, tools: [] });
  assert.ok(t0.items.some((it) => it.type === 'message' && it.content === 'THE REQUEST'), 'the request survives on the first step');
  assert.ok(t0.items.some((it) => it.type === 'message' && it.content === 'TAIL'));
  /* a request that is not protocol 2 is the one-string request, untouched */
  assert.equal(SERVER.normalizeTurn({ prompt: 'x' }), null);
});

test('atlas-native-tools ⑤b: a root anyOf is not sent to a provider, it is SAID in the description', () => {
  const f = SERVER.fnParameters({ name: 'map_view', description: 'Move.', parameters: { type: 'object', anyOf: [{ required: ['place'] }, { required: ['lng', 'lat'] }], properties: { place: { type: 'string' } } } });
  assert.equal(f.parameters.anyOf, undefined);
  assert.match(f.description, /place or lng \+ lat/);
});

/* ══ ⑥ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ⑥: the reply is the provider\'s items; the final shape is TURN_SCHEMA without the calls', () => {
  const r = nativeReply([{ id: 'call_A', name: 'map_view', args: { place: 'Rome' } }], 'moving');
  assert.equal(r.toolCalls[0].id, 'call_A', 'the provider\'s own id');
  assert.deepEqual(r.toolCalls[0].arguments, { place: 'Rome' });
  assert.ok(r.items && r.items.length === 2, 'the items are kept for the next step to replay');
  assert.equal(r.turnState, 'continuing');
  assert.deepEqual(Object.keys(AGENT.FINAL_SCHEMA.properties).sort(), Object.keys(AGENT.TURN_SCHEMA.properties).filter((k) => k !== 'tool_calls').sort());
  assert.deepEqual(AGENT.FINAL_SCHEMA.required, AGENT.TURN_SCHEMA.required);
  /* an envelope reply (an older proxy) is still read as it always was */
  const legacy = AGENT.readReply({ final_text: '', tool_calls: [{ name: 'map_view', arguments_json: '{"place":"Rome"}' }] }, '', JSON.parse);
  assert.equal(legacy.toolCalls[0].arguments.place, 'Rome');
});

/* ══ ⑦ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-native-tools ⑦: the header names the model the code runs — the secret overrides the constant, so they must agree', () => {
  const constant = (/const OPENAI_DEFAULT_MODEL = "([^"]+)"/.exec(PROXY) || [])[1];
  const header = (/secrets set AI_MODEL=(\S+)/.exec(PROXY) || [])[1];
  assert.ok(constant && header);
  assert.equal(header, constant, 'the deploy header tells the operator to set AI_MODEL=' + header + ' while the code default is ' + constant);
});
