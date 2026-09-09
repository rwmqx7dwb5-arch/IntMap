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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
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
  assert.deepEqual(AGENT.TURN_SCHEMA.properties.turn.enum, AGENT.TURN_STATES, 'the schema reads the same list');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'continuing' }, '', JSON.parse).turnState, 'continuing');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'FINAL' }, '', JSON.parse).turnState, 'final');
  assert.equal(AGENT.readReply({ final_text: 'a', turn: 'halfway' }, '', JSON.parse).turnState, '', 'a word outside the vocabulary is no declaration');
  assert.equal(AGENT.readReply({ final_text: 'a' }, '', JSON.parse).turnState, '', 'and neither is silence');
  /* ⚠ THE POINT OF THIS LINE: a model that never says the word behaves exactly as it did before, and
     no reply Atlas could make before is refused now (CONSTITUTION.md §5). */
  assert.deepEqual(AGENT.TURN_SCHEMA.required, ['final_text'], 'declaring what the reply is stays optional');
  /* the schema must still be strictly expressible or supabase/functions/ai-proxy drops the WHOLE
     thing to bare json_object and the enum stops being enforced at all (tests/r406-turn ⑭'s rule) */
  const expressible = (n) => !n || typeof n !== 'object' ? false
    : n.type === 'array' ? expressible(n.items)
      : n.type !== 'object' ? true
        : Object.keys(n.properties || {}).length > 0 && Object.keys(n.properties).every((k) => expressible(n.properties[k]));
  assert.ok(expressible(AGENT.TURN_SCHEMA));
});

/* ══ ② THE ORDER OF THE FIELDS IS THE ORDER OF THE DECISION ════════════════════════════════════
      A strict json_schema is generated in property order, so this is not cosmetic: it is what stops
      the sentence being committed to before the calls exist. ═══════════════════════════════════ */
test('R663 ②: the reply is generated decision-first — what it IS, what it DOES, then what it SAYS', () => {
  const keys = Object.keys(AGENT.TURN_SCHEMA.properties);
  assert.equal(keys[0], 'turn');
  assert.ok(keys.indexOf('tool_calls') < keys.indexOf('final_text'), 'the calls are chosen before the prose is written');
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
  assert.match(notes[0].message, /tool_calls was empty/);
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
  const surf = R('js/atlas-toolsurface.js').replace(/\/\*[\s\S]*?\*\//g, '');   /* the CODE, not the comments that record the measurement */
  assert.ok(!/sim\.tsunami|震源/.test(surf), 'no capability and no sentence is named in the surface');
  /* the same reading serves a case that refuses for an entirely different reason */
  const other = await exec({ name: 'run_capability', arguments: { id: 'sim.nightSky', args: { lat: 1, lng: 1 } } });
  assert.match(other.message, /震源/, 'one reading, every case — the text comes from the result, not from a table');
});

/* ══ ⑦ THE SYSTEM PROMPT TELLS ATLAS THE FIELD EXISTS — and the shell did not grow ═════════════ */
test('R663 ⑦: SYS() carries the new wire shape, and js/atlas-console.js stayed under its ceiling', () => {
  const con = R('js/atlas-console.js');
  assert.match(con, /"turn":"final"\|"continuing"/, 'the REPLY FORMAT names the field and its vocabulary');
  assert.match(con, /"answer_mode":"text"\|"map"\|"chart"\|"mixed"/, '…and #R511\'s field is still named');
  assert.match(con, /a reply that says what you are about to do is "continuing"/, 'and what to do with it');
  assert.ok(con.split(String.fromCharCode(10)).length < 4_910, 'the shrink-only ceiling held — the sentences went onto existing lines');
});
