/* ============================================================================
 *  atlas-completion-verdict — the evaluation's own observation path, held to what it reports
 * ----------------------------------------------------------------------------
 *  Three defects an external audit reproduced in the Atlas evaluation (scripts/atlas-eval.mjs and scripts/atlas-eval/):
 *  ② a live turn that SAID complete over an empty map was counted as absent but its claim read `unknown`, so no false
 *    completion was ever recorded: PAGE.observe copied the turn record field by field and `completion` was not among them;
 *  ③ a `result` deliverable with no `path` was present for every status but `failed` — running, needs_input, cancelled,
 *    unobserved and partial all counted as the thing existing;
 *  ⑦ 「さっきの線を赤くして」 was one turn graded on one map, so deleting the line and drawing a red one under a new id was
 *    a match. It is now a conversation: the map turn 1 left is the reference turn 2's change is graded against.
 *  Each check EVALUATES the code (the real modules over handed-in records); nothing is read from the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const H = await imp('scripts/atlas-eval.mjs');
const D = await imp('scripts/atlas-eval/deliverables.mjs');
const MS = await imp('scripts/atlas-eval/map-state.mjs');
const J = await imp('scripts/atlas-eval/judge.mjs');
const R = await imp('scripts/atlas-eval/replay.mjs');
const LAB = await imp('scripts/atlas-eval/lab.mjs');
const P = await R.productModules(imp);
const SETS = LAB.loadSets(ROOT);
const CASSETTES = LAB.loadCassettes(ROOT);

/* ── ② the declaration reaches the deliverable axis ─────────────────────────────────────────────── */

/* PAGE.observe runs inside the page; here the page is a window that holds exactly what js/atlas-state.js holds after
   js/atlas-console.js endTurn — a record that declared complete — and a map with no line on it */
function observeOnPage(turn, snap) {
  const saved = { S: globalThis.IntMapAtlasState, D: globalThis.IntMapAtlasDebug, doc: globalThis.document, calls: globalThis.__atlasEvalCalls };
  globalThis.IntMapAtlasState = { lastTurn: () => turn, snapshot: () => snap };
  globalThis.IntMapAtlasDebug = { lastPlan: () => ({ steps: [], stopped: turn.status, replies: [], dispatches: [] }) };
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.__atlasEvalCalls = [];
  try { return H.PAGE.observe([]); } finally {
    globalThis.IntMapAtlasState = saved.S; globalThis.IntMapAtlasDebug = saved.D; globalThis.document = saved.doc; globalThis.__atlasEvalCalls = saved.calls;
  }
}
const LINE_Q = { id: 'line-q', text: 'draw it', mapState: { drawn: [{ path: 'objects.kind:line', min: 1, why: 'a line' }] } };
const EMPTY_MAP = { objects: { n: 0, items: [] } };

test('② a live turn that declared complete over an empty map: absent, claim complete, false completion — all three recorded', () => {
  const raw = observeOnPage({ question: 'draw it', status: 'answered', reply: 'Drawn.', completion: 'complete', operations: [{ capabilityId: 'map.drawLine', status: 'completed' }] }, EMPTY_MAP);
  assert.equal(raw.turn.completion, 'complete', 'the page copy carries the declaration');
  const obs = H.observeTurn(LINE_Q, raw, { ms: 10 });
  assert.equal(obs.completion, 'complete');
  const d = D.deliverablesOfTurn(LINE_Q, obs);
  assert.equal(d.absent, 1);
  assert.equal(d.claim, 'complete');
  assert.equal(d.claimBasis, 'recorded');
  assert.equal(d.falseCompletion, true);
  assert.deepEqual(D.completionRateOf([d]).falseCompletion, ['line-q']);
});

test('② a missing declaration stays unknown; one the record can derive (unmet / output_unmet) is derived and says so', () => {
  const none = D.deliverablesOfTurn(LINE_Q, H.observeTurn(LINE_Q, observeOnPage({ question: 'draw it', status: 'error', reply: 'x', operations: [] }, EMPTY_MAP), { ms: 1 }));
  assert.equal(none.claim, 'unknown', 'not observed is not 「declared nothing」');
  assert.equal(none.claimBasis, 'not recorded');
  assert.equal(none.falseCompletion, false);
  assert.equal(none.honestIncomplete, false);
  const unmet = D.deliverablesOfTurn(LINE_Q, H.observeTurn(LINE_Q, observeOnPage({ question: 'draw it', status: 'answered', reply: 'Here.', unmet: [{ kind: 'output', mode: 'map' }], operations: [] }, EMPTY_MAP), { ms: 1 }));
  assert.equal(unmet.claim, 'partial');
  assert.match(unmet.claimBasis, /^derived: unmet/);
  assert.equal(unmet.honestIncomplete, true);
  assert.deepEqual(D.claimOf({ stopped: 'output_unmet', reply: 'x' }), { claim: 'partial', claimBasis: 'derived: stopped output_unmet without completion' });
  assert.equal(D.claimOf({ stopped: 'output_unmet', reply: '' }).claim, 'none', 'the agent\'s own rule: no text is none');
  assert.equal(D.claimOf({ stopped: 'answered', unmet: [] }).claim, 'unknown', 'an empty or absent unmet never proves complete');
  assert.equal(D.claimOf({ completion: 'complete', unmet: [{}] }).claimBasis, 'recorded', 'what the record says wins');
});

test('② a replayed turn carries the declaration the loop made, as a live one does', async () => {
  const cas = CASSETTES.find((c) => c.id === 'drawn-line-restyled-by-id-across-turns');
  const r = await R.replayCassette(cas, P);
  assert.equal(r.obs.completion, 'complete');
  assert.ok(Array.isArray(r.obs.unmet));
});

/* ── ③ a result deliverable exists only when it was observed completed ─────────────────────────── */

const RES = { kind: 'result', capability: 'data.table' };
const withOps = (...statuses) => ({ operations: statuses.map((s) => ({ capabilityId: 'data.table', status: s })), calls: [] });
test('③ without a path: completed is present; running/needs_input pending; cancelled; unobserved; failed/partial/superseded absent', () => {
  const v = (...s) => D.observeDeliverable(RES, withOps(...s)).verdict;
  assert.equal(v('completed'), 'present');
  assert.equal(v('running'), 'pending');
  assert.equal(v('needs_input'), 'pending');
  assert.equal(v('cancelled'), 'cancelled');
  assert.equal(v('unobserved'), 'unobserved');
  assert.equal(v('partial'), 'absent');
  assert.equal(v('failed'), 'absent');
  assert.equal(v('superseded'), 'absent');
  assert.equal(v(''), 'unobserved', 'a status the record does not carry is not read as done');
  assert.equal(v('failed', 'completed'), 'present', 'one call that completed is the thing existing');
  assert.equal(v('failed', 'running'), 'pending');
  assert.equal(D.observeDeliverable(RES, { operations: [], calls: [] }).verdict, 'absent');
  assert.equal(D.observeDeliverable(RES, { operations: null, calls: null }).verdict, 'unobserved');
});
test('③ with a path: rows inside a result that is still running are not the table', () => {
  const d = { kind: 'result', capability: 'data.table', path: 'rows', min: 2 };
  assert.equal(D.observeDeliverable(d, { operations: [], calls: [{ name: 'data.table', result: { status: 'running', rows: [1, 2, 3] } }] }).verdict, 'pending');
  assert.equal(D.observeDeliverable(d, { operations: [], calls: [{ name: 'data.table', result: { status: 'cancelled', rows: [1, 2, 3] } }] }).verdict, 'cancelled');
  assert.equal(D.observeDeliverable(d, { operations: [], calls: [{ name: 'data.table', result: { status: 'completed', rows: [1, 2, 3] } }] }).verdict, 'present');
  assert.equal(D.observeDeliverable(d, { operations: [], calls: [{ name: 'data.table', result: { rows: [1, 2, 3] } }] }).verdict, 'present', 'a result that names no state is read by its value, as before');
});
test('③ the turn and the rate: pending and cancelled are observed missing — not finished, in the denominator, a false completion when claimed complete; unobserved stays out', () => {
  const q = { id: 'r', deliverables: [RES] };
  const t = (s) => D.deliverablesOfTurn(q, Object.assign({ measured: true, completion: 'complete' }, withOps(s)));
  const pend = t('running'), canc = t('cancelled'), seen = t('unobserved'), ok = t('completed');
  assert.equal(pend.finished, false); assert.equal(pend.pending, 1); assert.equal(pend.falseCompletion, true);
  assert.equal(canc.finished, false); assert.equal(canc.cancelled, 1); assert.equal(canc.falseCompletion, true);
  assert.equal(seen.finished, null); assert.equal(seen.unobserved, 1); assert.equal(seen.falseCompletion, false);
  assert.equal(ok.finished, true);
  const rate = D.completionRateOf([pend, canc, seen, ok]);
  assert.equal(rate.deliverables, 3, 'present + absent + pending + cancelled; unobserved is apart');
  assert.equal(rate.deliverablesPresent, 1);
  assert.equal(rate.deliverablesPending, 1);
  assert.equal(rate.deliverablesCancelled, 1);
  assert.equal(rate.deliverablesUnobserved, 1);
  assert.equal(rate.deliverableRate, 1 / 3);
  assert.equal(rate.observedTurns, 3);
  assert.deepEqual(rate.falseCompletion, ['r', 'r']);
});

/* ── ⑦ a restyle is graded against the map the earlier turn left ───────────────────────────────── */

const Q7 = SETS.records.questions.find((x) => x.id === 'restyle-drawn-line-across-turns');
const CAS7 = CASSETTES.find((c) => c.id === 'drawn-line-restyled-by-id-across-turns');
const BEFORE = CAS7.earlier[0].world.snapshot;
const clone = (v) => JSON.parse(JSON.stringify(v));
const afterWith = (edit) => { const s = clone(BEFORE); edit(s.objects.items); s.objects.n = s.objects.items.length; return s; };
const RED = { color: '#ff0000', width: 5, opacity: 0.6 };
const grade = (after, before = BEFORE) => MS.gradeMap(Q7.mapState, after, { before });

test('⑦ the question is a conversation: turn 1 draws two lines, turn 2 restyles one; the key validates', () => {
  const V = MS.mapVocabulary();
  assert.equal(Q7.earlier.length, 1);
  assert.ok(Q7.mapState.restyle, 'graded as a change, not as one map');
  assert.deepEqual(J.validateQuestionSet({ questions: [Q7] }, () => true, V), []);
  assert.ok(J.validateQuestionSet({ questions: [Object.assign({}, Q7, { earlier: undefined })] }, () => true, V).some((p) => /names no earlier turn/.test(p)), 'a restyle with no earlier turn is refused');
  assert.ok(MS.validateMapState({ restyle: Object.assign({}, Q7.mapState.restyle, { withinKm: undefined }) }, V, 'q').some((p) => /withinKm/.test(p)), 'the tolerance is the key\'s own claim');
  assert.equal(BEFORE.objects.items.length, 2, 'turn 1 left the target and an unrelated line');
});
test('⑦ restyled in place → match', () => {
  const g = grade(afterWith((it) => Object.assign(it[0], RED)));
  assert.equal(g.verdict, 'match', JSON.stringify(g.criteria));
});
test('⑦ deleted and drawn again under another id → mismatch', () => {
  const g = grade(afterWith((it) => { const red = Object.assign(clone(it[0]), RED, { id: 'line_3' }); it.splice(0, 1); it.push(red); }));
  assert.equal(g.verdict, 'mismatch');
  assert.match(g.criteria[0].detail, /line_1 .* is gone/);
  assert.match(g.criteria[0].detail, /new object\(s\) appeared: line_3/);
});
test('⑦ same id, course moved → mismatch', () => {
  const g = grade(afterWith((it) => { Object.assign(it[0], RED); it[0].shape = Object.assign({}, it[0].shape, { last: [2.2945, 48.8584], key: 'moved000' }); }));
  assert.equal(g.verdict, 'mismatch');
  assert.match(g.criteria[0].detail, /course changed/);
});
test('⑦ the unrelated line changed too → mismatch', () => {
  const g = grade(afterWith((it) => { Object.assign(it[0], RED); Object.assign(it[1], RED); }));
  assert.equal(g.verdict, 'mismatch');
  assert.match(g.criteria[0].detail, /line_2 \(not the one asked about\) changed color/);
});
test('⑦ the wrong line restyled → mismatch; the target left as it was → mismatch', () => {
  assert.equal(grade(afterWith((it) => Object.assign(it[1], RED))).verdict, 'mismatch');
  assert.equal(grade(afterWith(() => { })).verdict, 'mismatch');
});
test('⑦ what was not read is unobserved, never a pass and never a miss', () => {
  const ok = afterWith((it) => Object.assign(it[0], RED));
  assert.equal(grade(ok, null).verdict, 'unobserved', 'no earlier map');
  assert.equal(grade(ok, { atlas: {} }).verdict, 'unobserved', 'earlier map without objects');
  const noCourse = clone(BEFORE); noCourse.objects.items.forEach((x) => { delete x.shape; });
  assert.equal(grade(ok, noCourse).verdict, 'unobserved', 'courses not carried: which line is meant cannot be read');
  const one = clone(BEFORE); one.objects.items.splice(0, 1);
  assert.equal(grade(afterWith((it) => it.splice(0, 1)), one).verdict, 'unobserved', 'turn 1 drew no London–Paris line: nothing single to grade against');
});
test('⑦ the replay runs the conversation: turn 1 then turn 2, the restyle graded against turn 1\'s map, the cassette green', async () => {
  const [res] = await LAB.evaluateCassettes([CAS7], { P, sets: SETS });
  assert.deepEqual(res.problems, []);
  assert.equal(res.judged.metrics.map.verdict, 'match');
  assert.equal(res.judged.metrics.earlier[0].map.verdict, 'match', 'turn 1\'s own map: two lines');
  const r = await R.replayCassette(CAS7, P);
  assert.deepEqual(r.obs.before, BEFORE);
  /* the same conversation, with turn 2's world reporting the line deleted and redrawn: the same cassette goes red */
  const bad = clone(CAS7);
  bad.world.snapshot = afterWith((it) => { const red = Object.assign(clone(it[0]), RED, { id: 'line_3' }); it.splice(0, 1); it.push(red); });
  const [red] = await LAB.evaluateCassettes([bad], { P, sets: SETS });
  assert.ok(red.problems.some((p) => /the map grades mismatch; recorded match/.test(p)));
  /* a cassette whose earlier turns are not the question's is refused */
  const drift = clone(CAS7); drift.earlier[0].text = 'something else';
  const [d] = await LAB.evaluateCassettes([drift], { P, sets: SETS });
  assert.ok(d.problems.some((p) => /earlier turn/.test(p)));
});
test('⑦ the live harness asks the earlier turns first on the same page, observes each, and grades the change against it', async () => {
  const seq = [];
  let turnNo = 0;
  const snaps = [BEFORE, afterWith((it) => Object.assign(it[0], RED))];
  const page = {
    evaluate: async (fn, arg) => {
      if (fn === H.PAGE.ask) { seq.push('ask:' + arg); turnNo++; return { ms: 5, err: '' }; }
      if (fn === H.PAGE.observe) { seq.push('observe'); const text = turnNo === 1 ? Q7.earlier[0].text : Q7.text; return { turn: { question: text, status: 'answered', reply: 'ok', completion: 'complete', operations: [{ capabilityId: 'map.object', status: 'completed' }] }, steps: [], calls: [], snapshot: snaps[turnNo - 1] }; }
      return true;
    },
    waitForFunction: async () => true,
  };
  const S = { page, boot: async () => { seq.push('boot'); } };
  const got = await H.askOnFreshPage(S, Q7.text, { patienceMs: 1000, sections: ['objects'], earlier: Q7.earlier.map((e) => e.text) });
  assert.deepEqual(seq, ['boot', 'ask:' + Q7.earlier[0].text, 'observe', 'ask:' + Q7.text, 'observe'], 'one boot: the conversation stays on one page');
  const obs = H.observeTurn(Q7, got.raw, got.askRes, got.earlier);
  assert.deepEqual(obs.before, BEFORE);
  const judged = J.judgeTurn(Object.assign({ sendable: true }, Q7), obs, { cutStops: {}, turnBudgetMs: 0, callKey: () => '' });
  assert.equal(judged.metrics.map.verdict, 'match');
  /* an earlier turn the harness could not finish: the question is not measured (never graded against a map nobody read) */
  const stuck = { evaluate: async (fn) => (fn === H.PAGE.ask ? new Promise(() => { }) : true), waitForFunction: async () => true };
  const st = await H.askOnFreshPage({ page: stuck, boot: async () => { } }, Q7.text, { patienceMs: 20, sections: [], earlier: ['first'] });
  assert.equal(st.unmeasured.unmeasured, 'harness_timeout');
  assert.match(st.unmeasured.detail, /earlier turn «first»/);
});
