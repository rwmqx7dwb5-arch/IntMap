/* ============================================================================
 *  atlas-delegation-eval — DELEGATION WAS UNMEASURED; EVALUATED HERE, NOT READ  (node --test)
 * ----------------------------------------------------------------------------
 *  research.delegate hands independent pieces of a request to worker models that run at the same time. The
 *  substrate is held by tests/atlas-delegation-checks.test.mjs; what was not held by anything is whether the
 *  EVALUATION can see a delegating turn: the judge read a research.delegate call as one operation and threw the
 *  children away (their states, their cost, their time), the problem set had no question that needs parallel
 *  pieces, and there was no way to put the same question to Atlas with and without delegating.
 *  Each check feeds the judge the result a delegating turn really returns (js/atlas-cap-research.js `meta.delegated`,
 *  carried by js/atlas-toolsurface.js) — refused and unobservable children included — and evaluates the answer.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const J = await imp('scripts/atlas-eval/judge.mjs');
const G = await imp('scripts/atlas-eval/grade.mjs');
const R = await imp('scripts/atlas-eval/replay.mjs');
const LAB = await imp('scripts/atlas-eval/lab.mjs');
const H = await imp('scripts/atlas-eval.mjs');
const B = await imp('scripts/atlas-delegation-bench.mjs');
const { makeAtlasCapabilities } = await imp('js/atlas-capabilities.js');
const { RESULT_STATES } = await imp('js/atlas-delegate.js');
const P = await R.productModules(imp);
const SETS = LAB.loadSets(ROOT);
const CAPS = makeAtlasCapabilities({});
const RULES = LAB.rulesOf(P);

const DELEGATION_QUESTIONS = SETS.answers.questions.filter((q) => (q.capabilities || []).includes('research.delegate'));
const Q = (id) => Object.assign({ set: 'answers', sendable: true, expect: {}, unset: {} }, DELEGATION_QUESTIONS.find((x) => x.id === id));

/* a research.delegate call as the model received it: the result carries `delegated` and `delegatedCostUsd`
   (js/atlas-toolsurface.js), and the harness's tap adds the call's own wall-clock `ms` */
const kid = (id, state, o = {}) => ({ id, state, code: o.code, summary: o.summary || 'found ' + id, findings: o.findings || [], gaps: [], sources: [], costUsd: o.costUsd == null ? 0.01 : o.costUsd, calls: 1, ms: o.ms });
const delegateCall = (kids, ms, args) => ({
  name: 'run_capability', args: { id: 'research.delegate', args: args || { tasks: kids.map((k) => ({ id: k.id, goal: 'g ' + k.id })) } }, ms,
  resultText: JSON.stringify({ ok: kids.some((k) => k.state === 'done' || k.state === 'partial'), capability: 'research.delegate', status: 'partial', delegated: kids, delegatedCostUsd: kids.reduce((m, k) => m + k.costUsd, 0) }),
});
const turn = (q, calls, reply, o = {}) => ({
  measured: true, ms: o.ms == null ? 25000 : o.ms, stopped: 'answered', reply, calls,
  operations: calls.map((c) => ({ capabilityId: c.args.id, args: c.args.args, status: 'completed' })), steps: [{ step: 1, calls: calls.map((c) => c.name) }], snapshot: {},
});

/* ══ ① THE JUDGE READS THE CHILDREN, NOT JUST THE CALL ═══════════════════════════════════════════════════ */
test('atlas-delegation-eval ① a delegating turn carries its children: count, states, cost, slowest child, and whether the call ran them at once', () => {
  const q = Q('delegate-north-america-census-total');
  const kids = [kid('us', 'done', { ms: 13800, costUsd: 0.0118 }), kid('ca', 'done', { ms: 11200, costUsd: 0.0094 }), kid('au', 'partial', { ms: 16400, costUsd: 0.0103 })];
  const j = J.judgeTurn(q, turn(q, [delegateCall(kids, 17100)], 'Together that is 393,864,050 people.'), RULES);
  const d = j.metrics.delegation;
  assert.equal(d.observed, true);
  assert.equal(d.calls, 1);
  assert.equal(d.delegatedCount, 3);
  assert.deepEqual(d.states, { done: 2, partial: 1 });
  assert.ok(Math.abs(d.costUsd - 0.0315) < 1e-9, 'the cost is the result\'s delegatedCostUsd');
  assert.equal(d.maxChildMs, 16400);
  assert.equal(d.slowestChild, 'au');
  assert.equal(d.sumChildMs, 41400);
  assert.equal(d.callMs, 17100);
  assert.equal(d.overlapped, true, '17.1 s for children that would take 41.4 s one after another: they ran at the same time');
  assert.ok(d.slowestShareOfCall > 0.95 && d.slowestShareOfCall <= 1, 'the call is almost exactly its slowest child: ' + d.slowestShareOfCall);
  assert.equal(d.regrouped, false);
  for (const k of Object.keys(d.states)) assert.ok(RESULT_STATES.includes(k), k + ' is a state js/atlas-delegate.js defines');
});

test('atlas-delegation-eval ② children run one after another are reported as such — and a call that was not timed is not guessed', () => {
  const kids = [kid('us', 'done', { ms: 10000 }), kid('ca', 'done', { ms: 12000 })];
  const serial = J.delegationOf([delegateCall(kids, 22500)], []);
  assert.equal(serial.overlapped, false, '22.5 s is not less than 10 s + 12 s');
  const untimed = J.delegationOf([Object.assign(delegateCall(kids, 1), { ms: undefined })], []);
  assert.equal(untimed.overlapped, null, 'no call time → not measured, not false');
  assert.equal(untimed.callMs, null);
  const noKidTimes = J.delegationOf([delegateCall([kid('a', 'done'), kid('b', 'done')], 9000)], []);
  assert.equal(noKidTimes.overlapped, null);
  assert.equal(noKidTimes.maxChildMs, null, 'a child time the record does not carry is null, never 0');
});

test('atlas-delegation-eval ③ a refused child is a state with its code, and a later delegate call is the model regrouping', () => {
  const first = delegateCall([kid('tokyo', 'done', { ms: 11300 }), kid('osaka', 'done', { ms: 9800 }), kid('hokkaido', 'refused', { code: 'delegation_children', costUsd: 0, ms: 310 })], 12400);
  const second = delegateCall([kid('hokkaido', 'done', { ms: 7900 })], 8200);
  const d = J.delegationOf([first, second], []);
  assert.deepEqual(d.states, { done: 3, refused: 1 });
  assert.deepEqual(d.refused, [{ id: 'hokkaido', code: 'delegation_children' }]);
  assert.equal(d.regrouped, true);
  assert.equal(d.calls, 2);
  const once = J.delegationOf([first], []);
  assert.equal(once.regrouped, false, 'a refusal with no later delegate call is not a regrouping');
  /* a refusal before any worker ran (too_many_tasks: js/atlas-cap-research.js states the number it was refused by) */
  const whole = { name: 'run_capability', args: { id: 'research.delegate', args: { tasks: [{}, {}, {}] } }, ms: 5, resultText: JSON.stringify({ ok: false, capability: 'research.delegate', code: 'too_many_tasks', maxChildren: 2, given: 3 }) };
  const w = J.delegationOf([whole, second], []);
  assert.deepEqual(w.wholeRefusals, [{ code: 'too_many_tasks', maxChildren: 2, given: 3 }]);
  assert.equal(w.regrouped, true);
  assert.equal(w.delegatedCount, 1);
});

test('atlas-delegation-eval ④ an unobservable child is counted apart from a failed one, and its cost is what the record says', () => {
  const d = J.delegationOf([delegateCall([kid('crude', 'done', { ms: 18900 }), kid('ironore', 'unobservable', { code: 'network', costUsd: 0, ms: 30000 }), kid('lng', 'failed', { code: 'shape', ms: 14200 })], 30900)], []);
  assert.deepEqual(d.states, { done: 1, unobservable: 1, failed: 1 });
  assert.deepEqual(d.unobservable, ['ironore']);
  assert.equal(d.refused.length, 0);
  assert.equal(d.slowestChild, 'ironore', 'the dead child is what the call waited for');
  assert.ok(d.slowestShareOfCall > 0.95);
});

test('atlas-delegation-eval ⑤ a turn that did not delegate is judged exactly as before; a delegation the tap did not see is not observed', () => {
  const q = Q('delegate-gulf-to-japan-routes-strait-name');
  const plain = turn(q, [{ name: 'run_capability', args: { id: 'research.analyze', args: { question: 'x' } }, ms: 5, resultText: JSON.stringify({ ok: true, capability: 'research.analyze', status: 'completed' }) }], 'The Strait of Hormuz.');
  const j = J.judgeTurn(q, plain, RULES);
  assert.equal(j.metrics.delegation, null);
  assert.equal(J.badnessOf([j], []).hasOwnProperty(q.id + ':delegationUnfinished'), false, 'no new key for a turn that did not delegate');
  assert.equal(J.metricsOf([j], []).delegation.turns, 0);
  /* the operation list names research.delegate, the tap saw nothing */
  const blind = Object.assign(turn(q, [], 'x'), { calls: null, operations: [{ capabilityId: 'research.delegate', status: 'completed' }] });
  const jb = J.judgeTurn(q, blind, RULES);
  assert.deepEqual(jb.metrics.delegation, { observed: false, calls: 1 });
  assert.deepEqual(J.metricsOf([jb], []).delegation.unobserved, [q.id], 'counted apart, never as zero children');
  assert.equal(J.badnessOf([jb], []).hasOwnProperty(q.id + ':delegationUnfinished'), false, 'an unobserved delegation can neither regress nor recover');
  /* the replayed turn carries no whole-turn clock: not 0 */
  assert.equal(J.judgeTurn(q, Object.assign(turn(q, []), { ms: null }), RULES).metrics.ms, null);
});

test('atlas-delegation-eval ⑥ the aggregate counts turns, children, states, refusals, unobservable children and regroupings, and the report says so', () => {
  const a = Q('delegate-japan-three-prefectures-census-total'), b = Q('delegate-gulf-to-japan-routes-strait-name');
  const t1 = J.judgeTurn(a, turn(a, [
    delegateCall([kid('tokyo', 'done', { ms: 11300 }), kid('osaka', 'done', { ms: 9800 }), kid('hokkaido', 'refused', { code: 'delegation_children', costUsd: 0, ms: 310 })], 12400),
    delegateCall([kid('hokkaido', 'done', { ms: 7900 })], 8200)], '合計は28,109,893人です。'), RULES);
  const t2 = J.judgeTurn(b, turn(b, [delegateCall([kid('crude', 'done', { ms: 18900 }), kid('ironore', 'unobservable', { ms: 30000, costUsd: 0 })], 30900)], 'The Strait of Hormuz.'), RULES);
  const A = J.metricsOf([t1, t2], []).delegation;
  assert.equal(A.turns, 2); assert.equal(A.calls, 3); assert.equal(A.children, 6);
  assert.deepEqual(A.states, { done: 4, refused: 1, unobservable: 1 });
  assert.deepEqual(A.refusedTurns, [a.id]); assert.deepEqual(A.unobservableTurns, [b.id]); assert.deepEqual(A.regroupedTurns, [a.id]);
  assert.equal(A.maxChildMs, 30000);
  assert.deepEqual(A.overlapped, { overlapped: 2, of: 2 });
  assert.equal(J.badnessOf([t1, t2], [])[b.id + ':delegationUnfinished'], 1, 'a child that came back with nothing is a fact that can regress');
  const md = J.renderMarkdown({ verdict: 'ok', url: 'u', when: 'w', dryRun: false, metrics: J.metricsOf([t1, t2], []), previous: null, regressions: [], improvements: [], turns: [t1, t2], probes: [] });
  assert.match(md, /## Delegation/);
  assert.match(md, /refused: hokkaido\/delegation_children/);
  assert.match(md, /a child came back unobservable in/);
});

/* ══ ② THE QUESTIONS THAT NEED PARALLEL PIECES ARE REAL, CHECKABLE AND REACHED ═══════════════════════════ */
test('atlas-delegation-eval ⑦ the delegation questions are well formed, sourced, and their answers are derived from verified rows — nothing invented', () => {
  assert.ok(DELEGATION_QUESTIONS.length >= 3, 'a multi-country sum, a multi-region sum and a multi-route question');
  assert.deepEqual(G.validateAnswerKey({ questions: DELEGATION_QUESTIONS }, (id) => !!CAPS.resolve(id)), []);
  assert.ok(CAPS.resolve('research.delegate'), 'the capability the questions name is in the registry');
  const byId = new Map(SETS.answers.questions.map((q) => [q.id, q]));
  /* the two totals are the sum of the figures verified in the rows they name — recomputed here */
  const total = (ids) => ids.reduce((s, id) => { const a = byId.get(id).answer; assert.equal(a.kind, 'number'); return s + a.value; }, 0);
  assert.equal(byId.get('delegate-north-america-census-total').answer.value, total(['us-population-2020-census', 'canada-population-2021-census', 'australia-population-2021-census']));
  assert.equal(byId.get('delegate-japan-three-prefectures-census-total').answer.value, total(['tokyo-population-2020-census', 'osaka-pref-population-2020-census', 'hokkaido-population-2020-census']));
  for (const q of DELEGATION_QUESTIONS) {
    assert.ok(/^https:\/\//.test(q.source.url) && q.source.states, q.id + ' names its source and what it states');
    assert.ok(!SETS.records.questions.some((r) => r.id === q.id), q.id + ' is in one set only');
  }
  const [a, b] = ['delegate-north-america-census-total', 'delegate-japan-three-prefectures-census-total'].map((id) => byId.get(id));
  assert.match(a.text, /2020 Census.*2021 Census/, 'the editions are pinned');
  assert.match(b.text, /令和2年/);
});

test('atlas-delegation-eval ⑧ the sum questions need the whole delegation: the three figures without the total do not grade correct, the total does', () => {
  const na = Q('delegate-north-america-census-total'), jp = Q('delegate-japan-three-prefectures-census-total'), strait = Q('delegate-gulf-to-japan-routes-strait-name');
  assert.equal(G.gradeAnswer(na.answer, 'The United States has 331,449,281 people, Canada 36,991,981 and Australia 25,422,788.').verdict, 'incorrect');
  assert.equal(G.gradeAnswer(na.answer, 'Together that is 393,864,050 people.').verdict, 'correct');
  assert.equal(G.gradeAnswer(na.answer, 'Together that is about 393.9 million people.').verdict, 'correct');
  assert.equal(G.gradeAnswer(jp.answer, '東京都14,047,594人、大阪府8,837,685人、北海道5,224,614人です。').verdict, 'incorrect');
  assert.equal(G.gradeAnswer(jp.answer, '3 つの合計は28,109,893人です。').verdict, 'correct');
  assert.equal(G.gradeAnswer(strait.answer, 'The iron-ore route runs through the Lombok Strait.').verdict, 'absent');
  assert.equal(G.gradeAnswer(strait.answer, 'Both pass the Strait of Hormuz.').verdict, 'correct');
});

/* ══ ③ THE SCRIPTED CASSETTES — DELEGATION JUDGED OFFLINE, THROUGH THE REAL LOOP ═════════════════════════ */
test('atlas-delegation-eval ⑨ every delegation cassette replays as recorded, and holds the delegation facts the judge must keep reading', async () => {
  const mine = LAB.loadCassettes(ROOT).filter((c) => c.arm);
  assert.equal(mine.length, 6, 'three questions × two arms');
  const res = await LAB.evaluateCassettes(mine, { P, sets: SETS, root: ROOT });
  for (const r of res) assert.deepEqual(r.problems, [], r.id);
  const by = Object.fromEntries(res.map((r) => [r.id, r.judged.metrics.delegation]));
  assert.deepEqual(by['delegate-census-total-all-children-done'].states, { done: 3 });
  assert.deepEqual(by['delegate-child-refused-and-regrouped'].refused, [{ id: 'hokkaido', code: 'delegation_children' }]);
  assert.equal(by['delegate-child-refused-and-regrouped'].regrouped, true);
  assert.deepEqual(by['delegate-child-unobservable-said-so'].unobservable, ['ironore']);
  for (const id of ['direct-census-total-no-delegation', 'direct-japan-census-total-no-delegation', 'direct-gulf-routes-no-delegation']) assert.equal(by[id], null, id + ' did not delegate');
  /* the call's own wall-clock reaches the judge through the dispatch entry, the way the live tap supplies it */
  assert.equal(by['delegate-census-total-all-children-done'].callMs, 17100);
  assert.equal(by['delegate-census-total-all-children-done'].overlapped, true);
});

test('atlas-delegation-eval ⑩ the cassette holds the reply to the unobservable child, and a delegation that stopped being read is caught', async () => {
  const bad = LAB.replyHeldTo({ replyMustMatch: [{ pattern: 'no answer came back|could not', why: 'the missing piece is said' }] }, 'Both leave through the Strait of Hormuz. The iron-ore route is the long way round the Cape.');
  assert.equal(bad.length, 1, 'a reply that writes the missing piece from memory and says nothing is caught');
  assert.deepEqual(LAB.replyHeldTo({ replyMustMatch: [{ pattern: 'no answer came back', why: 'said' }] }, 'that worker\'s request left but no answer came back'), []);
  assert.equal(LAB.replyHeldTo({ replyMustMatch: [{ pattern: '[', why: 'x' }] }, 'a').length, 1, 'a bad pattern is reported, not thrown');
  const d = J.delegationOf([delegateCall([kid('a', 'done'), kid('b', 'refused', { code: 'delegation_children' })], null)], []);
  assert.equal(LAB.delegationHeld({ delegation: { states: { done: 2 } } }, d).length, 1);
  assert.deepEqual(LAB.delegationHeld({ delegation: { states: { done: 1, refused: 1 } } }, d), []);
  assert.equal(LAB.delegationHeld({ delegation: null }, d).length, 1, 'recorded as not delegating, but it delegated');
  assert.deepEqual(LAB.delegationHeld({}, d), [], 'a recording that says nothing about delegation is not held to it');
  /* a cassette whose recorded reply hides the child is red */
  const cas = JSON.parse(JSON.stringify(LAB.loadCassettes(ROOT).find((c) => c.id === 'delegate-child-unobservable-said-so')));
  cas.model[1].text = 'The Gulf crude and the Qatari LNG tankers both leave through the Strait of Hormuz. The iron ore comes from Port Hedland.';
  cas.golden.text = cas.model[1].text;
  const [r] = await LAB.evaluateCassettes([cas], { P, sets: SETS, root: ROOT });
  assert.ok(r.problems.some((p) => /does not match/.test(p)), r.problems.join(' | '));
});

/* ══ ④ THE A/B BENCH ═════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-delegation-eval ⑪ the two arms differ only by the sentence in front, in the question\'s own language, and name research.delegate both ways', () => {
  for (const q of DELEGATION_QUESTIONS) {
    const a = B.prefixed('delegate', q), d = B.prefixed('direct', q);
    assert.ok(a.endsWith('\n\n' + q.text) && d.endsWith('\n\n' + q.text), 'the question itself is untouched');
    assert.notEqual(a, d);
    assert.match(a, /research\.delegate/); assert.match(d, /research\.delegate/);
    assert.equal(G.languageOf(a.split('\n\n')[0]), q.lang, 'the prefix is in the language of the question');
  }
  assert.deepEqual([...B.ARMS], ['delegate', 'direct']);
});

test('atlas-delegation-eval ⑫ the offline bench pairs the cassettes, reads delegation on one arm only, and never fails for cost or time', async () => {
  const rep = await B.runOffline({ root: ROOT, P, sets: SETS });
  assert.deepEqual(rep.harness, [], 'the paired cassettes replay as recorded');
  assert.equal(rep.rows.length, 6);
  const A = rep.summary.byArm;
  assert.equal(A.delegate.delegatedTurns, 3); assert.equal(A.direct.delegatedTurns, 0);
  assert.equal(A.delegate.followed, 3); assert.equal(A.direct.followed, 3);
  assert.equal(A.delegate.correct, 3); assert.equal(A.direct.correct, 3);
  assert.ok(A.delegate.workerCostUsd > 0 && A.direct.workerCostUsd === 0, 'the workers\' spend is on the delegating arm; a turn that did not delegate spent none');
  assert.deepEqual(A.delegate.childStates, { done: 8, refused: 1, unobservable: 1 });
  assert.equal(A.delegate.wallMs.n, 0, 'offline records no whole-turn clock: not measured, never 0');
  const pair = rep.summary.pairs.find((p) => p.id === 'delegate-japan-three-prefectures-census-total');
  assert.equal(pair.paired, true);
  assert.equal(pair.delegate.children.regrouped, true);
  assert.equal(pair.delta.toolCalls, 2 - 3);
  assert.equal(pair.delta.wallMs, null);
  const table = B.renderTable(rep);
  assert.match(table, /in production Atlas decides whether to delegate/);
  assert.match(table, /done 3, refused 1\) regrouped/);
  assert.match(table, /unobservable 1/);
  /* a question with one arm only is a harness error */
  const lone = B.pairedCassettes(LAB.loadCassettes(ROOT).filter((c) => c.id !== 'direct-gulf-routes-no-delegation'), null);
  assert.ok(lone.problems.some((p) => /no direct cassette/.test(p)));
  /* an arm that did not do what it was asked is reported, not hidden */
  const row = B.armRow('direct', J.judgeTurn(Q('delegate-gulf-to-japan-routes-strait-name'), turn(Q('delegate-gulf-to-japan-routes-strait-name'), [delegateCall([kid('a', 'done')], 10)], 'The Strait of Hormuz.'), RULES), {});
  assert.equal(row.followed, false); assert.equal(row.delegated, true);
});

test('atlas-delegation-eval ⑬ the bench CLI: offline exits 0 and writes JSON; online with no session fails with the nightly\'s message and exit 2', () => {
  const out = join(ROOT, 'test-results', 'atlas-delegation-bench-test');
  const off = spawnSync(process.execPath, ['scripts/atlas-delegation-bench.mjs', '--offline', '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(off.status, 0, off.stderr);
  assert.match(off.stdout, /delegation-bench\.json/);
  const env = Object.assign({}, process.env); delete env.ATLAS_EVAL_REFRESH_TOKEN;
  const on = spawnSync(process.execPath, ['scripts/atlas-delegation-bench.mjs'], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(on.status, 2);
  assert.match(on.stderr, /ATLAS_EVAL_REFRESH_TOKEN is not set\. A run without a session measures nothing/);
  const nightly = spawnSync(process.execPath, ['scripts/atlas-eval.mjs'], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(nightly.status, 2);
  assert.match(nightly.stderr, /ATLAS_EVAL_REFRESH_TOKEN is not set\. A run without a session measures nothing/, 'the same message the nightly gives');
});

test('atlas-delegation-eval ⑭ the bench asks through the nightly\'s own plumbing: the shared session and asking functions, the page\'s records, the same watchdog', async () => {
  assert.equal(typeof H.openAtlasSession, 'function'); assert.equal(typeof H.askOnFreshPage, 'function');
  /* a page whose turn never ends: the harness stops it and says it was not measured — it does not hang and does not guess */
  const calls = [];
  const page = {
    evaluate: async (fn) => {
      calls.push(fn);
      if (fn === H.PAGE.ask) return new Promise(() => { });
      return true;
    },
    waitForFunction: async () => true,
  };
  const S = { page, boot: async () => { calls.push('boot'); } };
  const got = await H.askOnFreshPage(S, 'q', { patienceMs: 20, sections: [] });
  assert.equal(got.unmeasured.unmeasured, 'harness_timeout');
  assert.ok(calls.includes(H.PAGE.stop), 'the stuck turn was stopped');
  assert.equal(calls[0], 'boot', 'a fresh page per question');
  assert.ok(calls.indexOf(H.PAGE.tap) < calls.indexOf(H.PAGE.ask), 'the tap is installed before the question is asked');
  /* the page's record of a prefixed question is read back as that question */
  const q = Q('delegate-north-america-census-total');
  const asked = B.prefixed('delegate', q);
  const obs = H.observeTurn(Object.assign({}, q, { text: asked }), { turn: { question: asked, status: 'answered', reply: 'x', aiCalls: 2, operations: [] }, steps: [], calls: [] }, { ms: 1000 });
  assert.equal(obs.measured, true); assert.equal(obs.aiCalls, 2);
  assert.equal(H.observeTurn(q, { turn: { question: asked, status: 'answered', operations: [] }, steps: [], calls: [] }, { ms: 1 }).measured, false, 'the unprefixed text is not the turn that ran');
  assert.deepEqual(B.benchQuestions(null).map((x) => x.id).sort(), DELEGATION_QUESTIONS.map((x) => x.id).sort(), 'the bench asks every delegation question, discovered from the key');
});
