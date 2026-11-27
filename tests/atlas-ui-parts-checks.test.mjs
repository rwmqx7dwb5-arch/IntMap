/* (atlas-ui-parts) the switches an answer invents, and the channel that keeps IntMap's own conversation out of the reader's text.
   Node-only: the registry is faked at the one seam (`ofSpelling`), the DOM is not needed for what is asserted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { switchCallProblem, SWITCH } = await import('../js/atlas-ui-spec.js');
const caps = (await import('../js/atlas-cap-ui.js')).default;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const AGENT = makeAtlasAgent();

const L = (en) => en;
const ROWS = {
  flyTo: { id: 'view.flyTo', risk: 'reversible-session', confirmation: 'none' },
  theme: { id: 'settings.theme', risk: 'persistent-setting', confirmation: 'none' },
  drop: { id: 'x.drop', risk: 'reversible-session', confirmation: 'always' },
  controls: { id: 'ui.inlineControls', risk: 'read-only', confirmation: 'none' },
};
const CAPS = { ofSpelling: (t) => ROWS[t] || null };

test('a switch call must be a registered, session-reversible, unconfirmed, plain capability', () => {
  assert.equal(switchCallProblem({ type: 'flyTo', place: 'Vienna' }, CAPS, L), '');
  assert.match(switchCallProblem({ type: 'nope' }, CAPS, L), /not a capability/);
  assert.match(switchCallProblem({ type: 'theme' }, CAPS, L), /outlasts the session/);
  assert.match(switchCallProblem({ type: 'drop' }, CAPS, L), /confirmation/);
  assert.match(switchCallProblem({ type: 'controls' }, CAPS, L), /another control/);
  assert.match(switchCallProblem('flyTo', CAPS, L), /object/);
  assert.match(switchCallProblem({ type: 'flyTo', pad: 'x'.repeat(SWITCH.callChars) }, CAPS, L), /longer/);
});

function inline(items) {
  const e = caps.find((c) => c.row[0] === 'ui.inlineControls');
  const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), warn: (h) => h, esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), L, CAPS, resolveLayer: () => null, layerOpacityControl: () => null };
  return e.run({ items }, {}, K);
}
const opt = (label, type = 'flyTo') => ({ label, calls: [{ type, place: label }] });

test('tabs and steps draw one control per option, the chosen one marked, calls carried for the press', async () => {
  const t = await inline([{ kind: 'tabs', label: 'Era', options: [opt('1910'), opt('2021')], selected: 1 }]);
  assert.equal(t.ok, true);
  assert.equal((t.html.match(/class="atl-ctl-tab[ "]/g) || []).length, 2);
  assert.match(t.html, /atl-ctl-tab on[^>]*data-i="1"/);
  assert.match(t.html, /data-calls="/);
  const s = await inline([{ kind: 'steps', options: [opt('a'), opt('b'), opt('c')] }]);
  assert.match(s.html, /type="range"[^>]*max="2"/);
  assert.match(s.html, /data-c2="/);
});

test('an option that cannot be run is refused with its reason, not drawn and not dropped silently', async () => {
  const r = await inline([{ kind: 'tabs', options: [opt('a'), { label: 'b', calls: [{ type: 'theme' }] }] }]);
  assert.equal(r.ok, false);
  assert.match(r.html, /options\[1\]\.calls\[0\]/);
  const one = await inline([{ kind: 'tabs', options: [opt('a')] }]);
  assert.equal(one.ok, false);
});

test('the reply has a channel to IntMap that is not the reader\'s text, and the check notes point at it', () => {
  assert.ok(AGENT.FINAL_SCHEMA.properties.note_to_intmap);
  const keys = Object.keys(AGENT.FINAL_SCHEMA.properties);
  assert.ok(keys.indexOf('note_to_intmap') < keys.indexOf('final_text'), 'decided before the words');
  const src = fs.readFileSync(new URL('../js/atlas-agent.js', import.meta.url), 'utf8');
  assert.ok(!/reply again with the answer as it stands and say why\./.test(src), 'the goal note no longer asks for the reason in the reader\'s text');
  assert.match(src, /put the reason in note_to_intmap/);
});

test('looking at the map never changes what the reader sees: capture mode goes on the clone, not on the body', () => {
  const src = fs.readFileSync(new URL('../js/atlas-view-capture.js', import.meta.url), 'utf8');
  assert.ok(!/document\.body\.classList\.add\(CAPTURE_CLASS\)/.test(src));
  assert.match(src, /onclone:\s*\(doc\)\s*=>[^}]*doc\.body\.classList\.add\(CAPTURE_CLASS\)/);
});

/* ── the initiative axis (scripts/atlas-eval/initiative.mjs) ── */
const { expressionOf, factsLine, initiativeOf, validateOpenQuestions, producesTable } = await import('../scripts/atlas-eval/initiative.mjs');
const { rubricRequest, readRubric } = await import('../scripts/atlas-eval/grade.mjs');
const { ATLAS_GRADE_SCHEMA } = await import('../supabase/functions/_shared/atlas-grade-schema.js');

test('the open set names no answer, expectation, capability or map, and spans more than one subject', () => {
  const set = JSON.parse(fs.readFileSync(new URL('../scripts/atlas-eval/open-questions.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateOpenQuestions(set), []);
  assert.ok(set.questions.length >= 5);
  assert.ok(validateOpenQuestions({ questions: [{ id: 'x', lang: 'en', text: 't', answer: {} }] }).length);
});

test('families come from what the registry says a capability produces, and a pressable switch is its own family', () => {
  const table = producesTable();
  assert.ok(Object.keys(table).length > 100, 'the registry rows were discovered, not listed');
  const words = expressionOf({ operations: [{ capabilityId: 'chart.compose', status: 'done' }, { capabilityId: 'view.flyTo', status: 'failed' }], calls: [] });
  assert.ok(words.families.includes('chart') && !words.capabilities.includes('view.flyTo'));
  /* (atlas-controls-receipts) the family is earned when the drawn switch, pressed, moved the map — not by the arguments asking for one */
  const call = { args: { items: [{ kind: 'tabs', options: [] }] }, resultText: JSON.stringify({ ok: true, status: 'completed', details: { drawn: [{ id: 'ctl1-0', kind: 'tabs', options: 2 }] } }) };
  const asked = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'done' }], calls: [{ args: call.args }] });
  assert.ok(!asked.families.includes('interactive') && !asked.controls.length, 'arguments alone state no control');
  const pressed = [{ id: 'ctl1-0', kind: 'tabs', found: true, options: [{ i: 0, confirmed: true, after: { snapshot: { time: 1900 } } }, { i: 1, confirmed: true, after: { snapshot: { time: 2000 } } }] }];
  const sw = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'done' }], calls: [call], pressed });
  assert.ok(sw.families.includes('interactive'));
  assert.match(factsLine(null), /no operations/);
  assert.match(factsLine(expressionOf({ operations: [] })), /words only/);
});

test('initiative rides beside the verdict: it never fails a reply, and an open question has no verdict', () => {
  const sc = { correctness: 2, commitment: 2, grounding: 2, language: 2, initiative: 0 };
  assert.ok(ATLAS_GRADE_SCHEMA.properties.scores.properties.initiative);
  const g = readRubric({ scores: sc, verdict: 'pass', evidence: 'x' });
  assert.equal(g.verdict, 'pass'); assert.equal(g.initiative, 0); assert.ok(!('initiative' in g.scores));
  const open = readRubric({ scores: { ...sc, correctness: 1 }, verdict: 'fail', evidence: '' }, { open: true });
  assert.equal(open.verdict, 'n/a');
  assert.equal(readRubric({ scores: { correctness: 2, commitment: 2, grounding: 2, language: 2 }, verdict: 'pass', evidence: '' }).initiative, null, 'an older grader gave none');
  const req = rubricRequest({ lang: 'en', text: 'q' }, 'a', 'capabilities that ran: x');
  assert.match(req.prompt, /WHAT THE TURN DID/); assert.match(req.system, /initiative/);
  const I = initiativeOf([{ id: 'a', metrics: { rubric: { measured: true, initiative: 2 } } }, { id: 'b', metrics: { rubric: { measured: true, initiative: 0 } } }, { id: 'c', metrics: { rubric: { measured: false } } }]);
  assert.equal(I.graded, 2); assert.equal(I.mean, 1); assert.deepEqual(I.wordsOnlyWhereMoreWasInvited, ['b']); assert.equal(I.ungraded, 1);
});
