/* ============================================================================
 *  atlas-legacy-protocol-removal — ONE TRANSPORT FOR THE ATLAS TURN, AND NOTHING IT COULD REACH IS LOST
 * ----------------------------------------------------------------------------
 *  WHAT WAS REMOVED (approved by the user 2026-10-01). Atlas had two transports. The one in use is
 *  native function calling — ai-proxy protocol 2: the input as items, the tools as the provider's own
 *  functions, the calls back as `function_call` items with their ids. The other was the one-string
 *  envelope: the same items flattened into one prompt (`legacyPrompt`), every tool written out into
 *  the system text (`_toolBlock`, SYS() under `_aiProto === 'legacy'`), and the calls written by the
 *  model INTO its JSON as `tool_calls[].arguments_json`, read back by readReply.
 *
 *  WHERE THE OLD PATH COULD BE ENTERED (measured before removing it). Only in js/atlas-console.js
 *  `_model`, and only on two observations of the protocol-2 call: ⑴ it threw with code `empty`, or
 *  ⑵ it answered without meta.protocol 2. Neither is a provider, a model, a setting or a failure
 *  fallback — every other error was rethrown. And neither is produced by the deployed server:
 *    · supabase/functions/ai-proxy answers every protocol-2 turn with meta.protocol 2, on OpenAI,
 *      Gemini (callGeminiTurn) and Anthropic (callAnthropicTurn — tool_use / tool_result), and its
 *      empty-turn refusal is `empty_turn`, deliberately not `empty`;
 *    · `node scripts/release-state.mjs --edge` on 2026-10-01: 21 of 21 Edge Functions matched the source.
 *  So the path was reachable from exactly one thing: js/ai-core.js returning `meta: null` for a 200
 *  whose body did not parse — a malformed answer, which the page then misread as «an old server» and
 *  answered by switching the session to a transport nobody needed.
 *
 *  CONSTITUTION.md §5 — implementation may go, reachable capability and answer quality may not. So
 *  each check below states what must still hold, and EVALUATES the code that decides it:
 *
 *    ① every live capability is reachable through native calls alone — the real registry, the real
 *      tool surface, the real loop, a model that only ever answers in protocol-2 items;
 *    ② a reply that still writes calls into its JSON is not silently dropped: the model is told that
 *      nothing ran (the one output gate), and the calls it then makes as functions run;
 *    ③ …and when it also made function calls, those run once and the rest is still said;
 *    ④ …and a model that never stops writing the old shape does not leave the reader with silence;
 *    ⑤ an Atlas turn answered without protocol 2 is a malformed answer, said as one, never an empty
 *      reply — and never a switch to a second transport;
 *    ⑥ SYS() has one form, and the prompt the provider receives is byte-for-byte what it was.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liftFunction } from './helpers/lift-function.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const { personaPrompt } = await import('../js/atlas-persona.js');

const AGENT = makeAtlasAgent();

/* ── the model's side, in the only shape the page now reads: what ai-proxy returns for protocol 2 —
      `text` (what the model wrote, FINAL_SCHEMA) and `output` (the provider's items) — through the
      same readReply js/atlas-console.js `_model` calls. ───────────────────────────────────────── */
let seq = 0;
function protocol2(written, calls) {
  const text = written == null ? '' : JSON.stringify(written);
  const output = [];
  if (text) output.push({ type: 'message', role: 'assistant', content: text });
  (calls || []).forEach((c) => output.push({ type: 'function_call', call_id: 'call_' + (++seq), name: c.name, arguments: JSON.stringify(c.args || {}) }));
  return AGENT.readReply(text ? JSON.parse(text) : null, text, JSON.parse, { protocol: 2 }, output);
}
function scripted(replies) {
  const seen = [];
  let i = 0;
  const fn = async (req) => { seen.push(req); const r = replies[Math.min(i, replies.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  fn.seen = seen;
  fn.count = () => i;
  return fn;
}
const notesIn = (req) => req.messages.filter((m) => m.role === 'tool').flatMap((m) => m.content);

/* ── the real surface over the real registry, with a dispatch that records what reached it ── */
function surface() {
  const CAPS = makeAtlasCapabilities({});
  const ran = [];
  const TOOLS = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: async (action) => { ran.push(action); return { ok: true, html: '' }; } });
  return { CAPS, TOOLS, tools: TOOLS.baseTools(), ran };
}

/* The smallest value a schema accepts, read off the schema itself — no capability is named here, so
   a capability added tomorrow is exercised the same way. Where no value can be derived (a pattern, a
   cross-field rule), the capability's own validator refuses it and hands its schema back, and that is
   asserted below as what it is: the capability was ADDRESSED, and the model is told how to call it. */
function sample(s, depth) {
  depth = depth || 0;
  if (!s || typeof s !== 'object' || depth > 8) return 'x';
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  const alt = s.anyOf || s.oneOf;
  const t = Array.isArray(s.type) ? s.type[0] : s.type;
  if (!t && Array.isArray(alt) && alt.length) return sample(alt[0], depth + 1);
  if (t === 'object' || (!t && s.properties)) {
    const req = new Set(s.required || []);
    if (Array.isArray(alt) && alt[0] && Array.isArray(alt[0].required)) alt[0].required.forEach((k) => req.add(k));
    const o = {};
    req.forEach((k) => { o[k] = sample((s.properties || {})[k], depth + 1); });
    return o;
  }
  if (t === 'string') return 'x'.repeat(Math.max(1, s.minLength || 1));
  if (t === 'number' || t === 'integer') {
    const lo = Number.isFinite(s.minimum) ? s.minimum : (Number.isFinite(s.exclusiveMinimum) ? s.exclusiveMinimum + 1 : 1);
    return Number.isFinite(s.maximum) ? Math.min(lo, s.maximum) : lo;
  }
  if (t === 'boolean') return false;
  if (t === 'array') { const n = s.minItems || 0; const out = []; for (let i = 0; i < n; i++) out.push(sample(s.items, depth + 1)); return out; }
  return 'x';
}

/* What came back for the one call of step 0: its result if it was executed, or the typed note it was handed back
   with if the loop's own schema check refused it (a refused call is answered in the transcript, not in `results`).
   A call is LOST when nothing knows the name it used — the surface's unknown_tool / unknown_capability — or when
   there was nothing to run it; every other refusal names the capability and says how to call it. */
const NOT_ADDRESSED = new Set(['unknown_tool', 'unknown_capability', 'no_executor']);
const outcome = (out, model) => out.results[0] || (model.seen[1] ? notesIn(model.seen[1])[0] : null) || {};

/* ══ ① ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-legacy-protocol-removal ①: every live capability is reachable through native function calls alone', async () => {
  const { CAPS, TOOLS, tools, ran } = surface();
  const live = CAPS.all().filter((c) => !c.withdrawn);
  assert.ok(live.length > 0, 'the registry is empty — this check would pass on nothing');
  const reached = [], addressed = [], lost = [];
  for (const cap of live) {
    const before = ran.length;
    const model = scripted([
      protocol2({ turn: 'continuing', final_text: '' }, [{ name: 'run_capability', args: { id: cap.id, args: sample(TOOLS.schemaOf(cap.id)) } }]),
      protocol2({ turn: 'final', final_text: 'done' }, []),
    ]);
    const out = await AGENT.runTurn({ model, tools, execute: TOOLS.makeExecute(tools, AGENT), messages: [{ role: 'user', content: 'q' }] });
    /* the functions the provider is offered are the tools themselves — the tool block the old SYS() pasted is these */
    assert.deepEqual((model.seen[0].tools || []).map((t) => t.name).sort(), Object.keys(tools).sort(), 'the provider was not offered every base tool as a function');
    const r = outcome(out, model);
    if (ran.length > before) {
      assert.equal(ran[ran.length - 1].type, cap.legacy || cap.id, cap.id + ' reached the dispatch under the wrong name');
      reached.push(cap.id);
    } else if (r.ok === false && r.error && !NOT_ADDRESSED.has(r.error)) addressed.push(cap.id);
    else lost.push(cap.id + ' → ' + (r.error || JSON.stringify(r)));
  }
  assert.deepEqual(lost, [], 'capabilities a native call could not reach');
  assert.equal(reached.length + addressed.length, live.length);
  assert.ok(reached.length > addressed.length, 'most calls reach the dispatch outright (' + reached.length + ' reached, ' + addressed.length + ' handed back with their schema)');

  /* …and every BASE tool, called by its own function name, reaches its capability */
  const baseLost = [];
  for (const name of Object.keys(tools)) {
    const t = tools[name];
    if (!t.legacy) continue;   /* find_capability / run_capability: the surface's own, exercised above */
    const before = ran.length;
    const model = scripted([protocol2(null, [{ name, args: sample(t.parameters) }]), protocol2({ turn: 'final', final_text: 'done' }, [])]);
    const out = await AGENT.runTurn({ model, tools, execute: TOOLS.makeExecute(tools, AGENT), messages: [{ role: 'user', content: 'q' }] });
    const r = outcome(out, model);
    if (ran.length > before) assert.equal(ran[ran.length - 1].type, t.legacy);
    else if (!(r.ok === false && r.error && !NOT_ADDRESSED.has(r.error))) baseLost.push(name + ' → ' + (r.error || JSON.stringify(r)));
  }
  assert.deepEqual(baseLost, [], 'base tools a native call could not reach');
});

/* ══ ② ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-legacy-protocol-removal ②: calls written into the JSON are not run and not dropped — the model is told, and then calls', async () => {
  const { TOOLS, tools, ran } = surface();
  const oldShape = { turn: 'continuing', final_text: 'Moving the map.', tool_calls: [{ name: 'map_view', arguments_json: '{"place":"Rome"}' }] };
  const first = protocol2(oldShape, []);
  assert.equal(first.toolCalls.length, 0, 'a call written into the message is not a call');
  assert.deepEqual(first.callsInText, ['map_view'], 'readReply reports what was written instead of discarding it');
  const model = scripted([
    first,
    (req) => {
      const note = notesIn(req).pop();
      assert.equal(note.error, 'calls_in_text', 'the model was told why nothing happened');
      assert.match(note.message, /map_view/, 'and which call it wrote');
      assert.match(note.message, /as function calls/, 'and how to make it');
      return protocol2({ turn: 'continuing', final_text: '' }, [{ name: 'map_view', args: { place: 'Rome' } }]);
    },
    protocol2({ turn: 'final', final_text: 'Here is Rome.' }, []),
  ]);
  const out = await AGENT.runTurn({ model, tools, execute: TOOLS.makeExecute(tools, AGENT), messages: [{ role: 'user', content: 'Rome' }] });
  assert.equal(ran.length, 1, 'the call ran exactly once — when it was made as a function');
  assert.equal(ran[0].place, 'Rome');
  assert.equal(out.text, 'Here is Rome.');
  assert.equal(out.stopped, 'answered');
  assert.equal(out.trace.outputGate, 1, 'handed back through the one output gate');
  assert.deepEqual(out.trace.callsInText, [{ step: 0, names: ['map_view'] }], 'the trace records what was written and not run');
  assert.ok(!/Moving the map/.test(out.text), 'the sentence of the step that did nothing is not the answer');
});

/* ══ ③ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-legacy-protocol-removal ③: with function calls beside them, those run once, and the written ones are still said', async () => {
  const { TOOLS, tools, ran } = surface();
  const model = scripted([
    protocol2({ turn: 'continuing', final_text: '', tool_calls: [{ name: 'map_view', arguments_json: '{"place":"Oslo"}' }] }, [{ name: 'map_view', args: { place: 'Rome' } }]),
    (req) => {
      const notes = notesIn(req);
      assert.ok(notes.some((n) => n && n.ok !== false && n.id), 'the function call\'s own result is there');
      const note = notes.find((n) => n && n.error === 'calls_in_text');
      assert.ok(note, 'the written call is reported beside the results');
      assert.match(note.message, /the function calls you made did/);
      return protocol2({ turn: 'final', final_text: 'Rome.' }, []);
    },
  ]);
  const out = await AGENT.runTurn({ model, tools, execute: TOOLS.makeExecute(tools, AGENT), messages: [{ role: 'user', content: 'q' }] });
  assert.deepEqual(ran.map((a) => a.place), ['Rome'], 'only the function call ran; the written one did not run behind the model\'s back');
  assert.equal(out.trace.outputGate, 0, 'a reply that made calls is not a final, so the gate is not what answers it');
  assert.equal(out.text, 'Rome.');
});

/* ══ ④ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-legacy-protocol-removal ④: a model that keeps writing the old shape leaves the reader an answer, not silence', async () => {
  const { TOOLS, tools, ran } = surface();
  const stuck = protocol2({ turn: 'continuing', final_text: '', tool_calls: [{ name: 'map_view', arguments_json: '{"place":"Rome"}' }] }, []);
  const model = scripted([stuck, stuck, stuck, (req) => {
    assert.equal(req.final, true, 'the last call is the one that writes the answer');
    return protocol2({ turn: 'final', final_text: 'I could not move the map this time.' }, []);
  }]);
  const out = await AGENT.runTurn({ model, tools, execute: TOOLS.makeExecute(tools, AGENT), messages: [{ role: 'user', content: 'q' }] });
  assert.equal(ran.length, 0, 'nothing written into the message ran');
  assert.equal(out.trace.outputGate, AGENT.LIMITS.maxOutputGate, 'handed back until the gate\'s own budget ran out — no new limit');
  assert.equal(out.text, 'I could not move the map this time.', 'the reader gets words');
  assert.equal(out.trace.callsInText.length, AGENT.LIMITS.maxOutputGate + 1, 'every step that wrote calls is on the record');
  /* the raw old shape, unparseable, still never reaches the reader as prose */
  assert.equal(AGENT.readReply(null, '{"turn":"continuing","tool_calls":[{"name":"map_view"', JSON.parse).text, '');
});

/* ══ ⑤ ════════════════════════════════════════════════════════════════════════════════════════ */
/* (module-graph) js/ai-core.js exports its factory and is IMPORTED, fresh per call, with the browser around
   it installed as globals (its own imports are the real modules). The globals stay installed after an
   import, so ⑤ puts back the ones it found when it is done — the checks after it ran on globalThis. */
const BROWSER = ['window', 'document', 'location', 'localStorage', 'navigator', 'fetch'];
const foundBrowser = Object.fromEntries(BROWSER.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const restoreBrowser = () => { for (const k of BROWSER) { if (foundBrowser[k]) Object.defineProperty(globalThis, k, foundBrowser[k]); else delete globalThis[k]; } };
async function aiCore(respond) {
  const calls = [];
  const win = { INTMAP_AI_PROXY: { url: 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/ai-proxy' }, SUPABASE_ANON_KEY: 'anon-key' };
  win.window = win;
  const localStorage = { _m: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } };
  const location = { protocol: 'https:', hostname: SITE_HOST };   /* not localhost: aiDev() would lift the gate */
  const document = { getElementById() { return null; }, createElement() { return { classList: { add() {}, remove() {} }, style: {}, addEventListener() {}, querySelector() { return null; } }; }, body: { appendChild() {} } };
  const row = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { count: 0 } }; } });
  win.sb = { auth: { async getSession() { return { data: { session: { access_token: 'jwt' } } }; } }, from() { return row(); } };
  const fetchStub = async (url, opts) => { calls.push(JSON.parse(opts.body)); return respond(url, opts); };
  const M = await importModule('js/ai-core.js', { globals: { window: win, document, location, localStorage, navigator: {}, fetch: fetchStub } });
  const HOST = { lang: 'en', user: { id: '613271ce-0000-4000-8000-000000000000' }, aiUsage: { date: '', used: 0, limit: 10 }, AI_FREE_DAILY: 10, aiButtonSyncers: [], openAuthModal() {}, t(k) { return k; } };
  return { IM: M.aiCore(HOST), calls };
}
const res200 = (body) => ({ status: 200, ok: true, async json() { return JSON.parse(body); }, async text() { return body; } });
const turnOpts = { task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'q' }], tools: [], turnId: 't1' };

test('atlas-legacy-protocol-removal ⑤: an Atlas turn answered without protocol 2 is malformed — said, never an empty reply, never a second transport', async () => {
  try {
  for (const [what, body] of [['a body that does not parse', '<html>502</html>'], ['an answer with no meta', JSON.stringify({ text: '{"final_text":"x"}', used: 1, limit: 10 })],
    ['an answer from a protocol-1 server', JSON.stringify({ text: '{"final_text":"x"}', meta: { protocol: 1 } })]]) {
    const { IM, calls } = await aiCore(async () => res200(body));
    let err = null;
    try { await IM.askAIJSONEnvelope('', 'sys', null, Object.assign({}, turnOpts)); } catch (e) { err = e; }
    assert.ok(err, what + ': the turn was handed back as if the model had answered');
    assert.equal(err.code, 'provider_malformed', what + ': the failure is named');
    assert.match(err.message, /malformed/i, what + ': in the words the reader already knows for it');
    assert.equal(calls.filter((b) => b.task === 'atlas_turn').length, 1, what + ': one call — nothing retried it in another shape');
    assert.equal(calls[0].protocol, 2);
  }
  /* the protocol-2 answer is read as before */
  const ok = await aiCore(async () => res200(JSON.stringify({ text: '{"final_text":"x"}', meta: { protocol: 2 }, output: [{ type: 'function_call', call_id: 'c', name: 'map_view', arguments: '{}' }] })));
  const env = await ok.IM.askAIJSONEnvelope('', 'sys', null, Object.assign({}, turnOpts));
  assert.equal(env.meta.protocol, 2);
  assert.equal(env.output.length, 1);
  /* …and a caller that did not ask for protocol 2 is untouched: the check belongs to the turn protocol, not to every task */
  const other = await aiCore(async () => res200(JSON.stringify({ text: '{"a":1}' })));
  const env2 = await other.IM.askAIJSONEnvelope('p', 'sys', null, { task: 'json_extract' });
  assert.deepEqual(env2.data, { a: 1 });
  } finally { restoreBrowser(); }

  /* the page holds no second transport: no switch, no flattener, no schema for calls in the JSON */
  const con = codeOnly(rd('js/atlas-console.js'));
  assert.equal((con.match(/protocol:2,/g) || []).length, 1, 'the turn is asked for in one place, in protocol 2');
  assert.doesNotMatch(con, /_aiProto|legacyPrompt|TURN_SCHEMA|_toolBlock/, 'a piece of the one-string transport is still in the kernel');
  assert.doesNotMatch(codeOnly(rd('js/atlas-agent.js')), /legacyPrompt|TURN_SCHEMA|d\.tool_calls\s*:/, 'the loop still reads calls out of the JSON');
  assert.equal(AGENT.legacyPrompt, undefined);
  assert.equal(AGENT.TURN_SCHEMA, undefined);
});

/* ══ ⑥ ════════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-legacy-protocol-removal ⑥: SYS() has one form, and it tells the model calls are functions', () => {
  const src = rd('js/atlas-console.js');
  const lines = src.split('\n');
  const s = lines.findIndex((l) => /^\s*function SYS\(\w*\)\s*\{/.test(l));
  const e = lines.findIndex((l, i) => i > s && /^    \}$/.test(l));
  assert.ok(s > 0 && e > s, 'function SYS() moved');
  const lifted = ['_capIndex', '_directCaps'].map((n) => liftFunction(src, n)).join('\n');
  const CAPS = makeAtlasCapabilities({});
  const tools = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: () => {} }).baseTools();
  /* `_aiProto` is set in the environment on purpose: if a branch on it came back, the two builds would differ */
  const build = (proto) => {
    const env = { personaPrompt, POLICY: makeAtlasPolicy(), CAPS, Object, String, JSON, _aiProto: proto, __baseTools: tools, _langLine: () => 'English' };
    const stub = new Proxy(env, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (typeof k === 'string' ? () => '' : undefined))) });
    return new Function('__stub', 'with(__stub){ ' + lifted + '\n' + lines.slice(s, e + 1).join('\n') + ' return SYS(__baseTools); }')(stub);
  };
  const a = build(''), b = build('legacy');
  assert.equal(a, b, 'SYS() still depends on which transport the session is in');
  assert.doesNotMatch(a, /tool_calls|arguments_json/, 'the prompt names the retired envelope\'s fields');
  assert.match(a, /REPLY FORMAT: you operate IntMap by calling its tools as FUNCTIONS/);
  assert.match(a, /\[TOOLS\] The functions you hold \(/);
  for (const name of Object.keys(tools)) assert.ok(a.indexOf(name) >= 0, 'the prompt names the function ' + name);
  /* no tool is pasted as JSON into the system text any more — each is the provider's function declaration */
  assert.doesNotMatch(a, /\{"name":"map_view","description"/, 'a tool block is pasted into the prompt again');
  /* measured 2026-10-01 with the real registry and base tools: the native prompt was 14,181 characters before
     the removal and the same bytes after it (the retired form was 25,262) — recorded, not asserted as a
     number: the persona and the index move for their own reasons, and what this check holds is the shape */
  /* the written schema carries no calls, and its words name function calls, not a field that is gone */
  assert.deepEqual(Object.keys(AGENT.FINAL_SCHEMA.properties), ['turn', 'answer_mode', 'final_text']);
  assert.doesNotMatch(JSON.stringify(AGENT.FINAL_SCHEMA), /tool_calls/);
});
