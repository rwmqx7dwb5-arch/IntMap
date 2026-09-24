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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
  const agent = readFileSync(join(ROOT, 'js/atlas-agent.js'), 'utf8');
  assert.equal((agent.match(/gateBounces\+\+/g) || []).length, 1, 'there is still exactly one place a final is handed back');
  assert.equal((agent.match(/trace\.outputGate\+\+/g) || []).length, 1);
  assert.ok(!/\.(test|match|search|replace)\(|RegExp/.test(agent.replace(/^\s*[/*].*$/gm, '')),
    'the loop never matches a pattern against the reply');
  /* the declaration stayed optional: making `turn` required would force a word out of every reply
     without holding anyone to it — a model that answers "final" to the same promise is refused
     nothing by this gate, which reads the record instead (tests/r511 ④, tests/r663 ①) */
  assert.deepEqual(AGENT.TURN_SCHEMA.required, ['final_text']);
});
