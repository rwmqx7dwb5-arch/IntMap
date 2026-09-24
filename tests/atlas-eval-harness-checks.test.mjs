/* ============================================================================
 *  atlas-eval-harness — THE ATLAS EVALUATION WAS A PERSON. EVERY CHECK BELOW FEEDS THE HARNESS WHAT R802 SAW.
 * ----------------------------------------------------------------------------
 *  #R742 · #R747 · #R760 · #R775 · #R802 each put dozens of questions to the production Atlas by hand
 *  and each wrote 「⚠ 自動ハーネスはリポジトリに無い」. So when #R802 found Japanese requests that
 *  reached nothing, 23 of 46 turns ending on the working limit, research.situationMap fired seven times
 *  against its own 「not_rendered」, data.layerValues failing seventeen times, 「Sahara」 answered as
 *  New York and a turn of 10 m 34 s, nothing in the repository could notice any of them coming back.
 *
 *  scripts/atlas-eval.mjs now asks the recorded questions every night. It cannot be tested against the
 *  production model here (that costs money and needs a login), so these checks do the next thing:
 *  they hand scripts/atlas-eval/judge.mjs RECORDS SHAPED LIKE THE ONES R802 READ OFF THE PAGE, and
 *  require that each defect R802 found is DETECTED — written as the defect, not as the code that
 *  detects it ([[intmap-restate-the-defect-not-the-fix]]), and EVALUATED rather than read (#R505).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = {};
const J = await import('../scripts/atlas-eval/judge.mjs');
const H = await import('../scripts/atlas-eval.mjs');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');

const AGENT = makeAtlasAgent();
/* the rules handed in exactly as the harness hands them in — from the product, not from this file */
const RULES = { cutStops: AGENT.CUT_STOPS, turnBudgetMs: AGENT.LIMITS.turnBudgetMs, callKey: makeAtlasTurnResults({}).callKey };
const SET = H.loadQuestions();
const Q = (id) => { const q = SET.questions.find((x) => x.id === id); assert.ok(q, 'the problem set holds ' + id); return q; };
const call = (name, args, result) => ({ name, args, resultText: JSON.stringify(result), ms: 1 });
const run = (id, args, result) => call('run_capability', { id, args }, result);

/* ══ ① THE QUESTIONS R802 ASKED ARE THE ONES ASKED AGAIN, AND EVERY CRITERION NAMES ITS RECORD ═════
   A problem set that quietly drops a recorded question, or names a capability the registry no longer
   has, would pass every night while measuring nothing about the thing it was built for. */
test('atlas-eval-harness ① the recorded questions are in the set, and every criterion is sourced and reachable', () => {
  const C = makeAtlasCapabilities({});
  assert.deepEqual(J.validateQuestionSet(SET, (id) => !!C.resolve(id)), [], 'the problem set is well formed');
  for (const t of ['東京から大阪までの鉄道ルートを引いて、所要時間と距離を教えて。',
    '世界の原子力発電所を地図に表示して、日本のものだけ強調して。',
    '東京の今日の天気と、今後3日間の予報を教えて。地図にも出して。']) {
    const q = SET.questions.find((x) => x.text === t);
    assert.ok(q && q.sendable && q.lang === 'jp', 'R802 §2 — the Japanese request that ended with zero operations is asked again: ' + t);
  }
  /* an elided text is kept for its finding and NOT asked — asking a completed version would be inventing a question */
  assert.equal(Q('aircraft-pacific-highest').sendable, false);
  /* a criterion the record does not supply is absent AND explained */
  const bare = SET.questions.filter((q) => !Object.keys(q.expect).length);
  for (const q of bare) assert.ok(Object.keys(q.unset).length, q.id + ' judges nothing and does not say why');
});

/* ══ ② 「東京から大阪までの鉄道ルート」 — find_capability ×8, ZERO operations, step_budget, 45 s ═══════ */
test('atlas-eval-harness ② a Japanese request that reached nothing is reported as unreached, zero-operation and cut short', () => {
  const q = Q('rail-tokyo-osaka');
  const calls = Array.from({ length: 8 }, (_, i) => call('find_capability', { query: '鉄道 経路 ' + i }, { ok: true, candidates: [] }));
  const t = J.judgeTurn(q, { measured: true, ms: 45000, stopped: 'step_budget', reply: '', operations: [], calls, steps: [{ step: 0, calls: calls.map((c) => c.name) }], snapshot: {} }, RULES);
  assert.equal(t.metrics.reached, false, 'routing.route was never reached');
  assert.equal(t.metrics.zeroOps, true);
  assert.equal(t.metrics.cut, true, 'step_budget is a stop js/atlas-agent.js calls cut short');
  assert.equal(t.metrics.findCapability, 8);
  assert.ok(t.failures.some((f) => f.kind === 'reach') && t.failures.some((f) => f.kind === 'operations'));
  const M = J.metricsOf([t], []);
  assert.deepEqual(M.zeroOpTurns, ['rail-tokyo-osaka']);
  assert.deepEqual(M.reach, { reached: 0, of: 1 });
  assert.equal(J.verdictOf({ dryRun: false, turns: [t], probes: [], regressions: [] }), 'regressed', 'a recorded defect that is back is red on its first night');
  /* and the same question answered properly is not */
  const ok = J.judgeTurn(q, { measured: true, ms: 60000, stopped: 'answered', reply: '約2時間30分、約550 km です。', operations: [{ capabilityId: 'routing.route', args: {}, status: 'completed', code: 'ok' }], calls: [], steps: [], snapshot: {} }, RULES);
  assert.deepEqual(ok.failures, []);
});

/* ══ ③ research.situationMap: ok and not_rendered ALTERNATELY, seven times, for one subject ══════════ */
test('atlas-eval-harness ③ a result that says rendered and not_rendered at once, and the call fired again after it, are both seen', () => {
  const q = Q('ryoseikoku-1750');
  const args = { topic: '令制国 1750' };
  const ok = { ok: true, status: 'completed', code: 'ok', rendered: true };
  const lie = { ok: false, status: 'partial', code: 'not_rendered', rendered: true, unverified: true, error: 'not_rendered' };
  const calls = [ok, lie, ok, lie, ok, lie, ok].map((r) => run('research.situationMap', args, r));
  const t = J.judgeTurn(q, { measured: true, ms: 556000, stopped: 'answered', reply: '…', operations: calls.map(() => ({ capabilityId: 'research.situationMap', status: 'completed' })), calls, steps: [], snapshot: {} }, RULES);
  assert.equal(t.metrics.secondOfSameOp, 6, 'the same call made seven times is six second-times');
  assert.equal(t.metrics.observerContradictions, 3, 'three results contradicted themselves');
  assert.ok(t.metrics.repeats.some((p) => p.after === 'partial' && p.afterCode === 'not_rendered'), 'the cause — the observer said it did not happen — is carried with the repeat');
  assert.ok(t.failures.some((f) => f.kind === 'observer'));
});

/* ══ ④ data.layerValues ×17, all failed: 「Turn a data layer on first」 with the layer on ═════════════ */
test('atlas-eval-harness ④ a capability that failed every one of seventeen calls is reported, with the refusal it gave', () => {
  const q = Q('population-density-tokyo-delhi-lagos');
  const refusal = { ok: false, status: 'failed', code: 'no_readable_layer', error: 'No readable data on the active layers here. Turn a data layer on first.' };
  const places = ['Tokyo', 'Delhi', 'Lagos'];
  const calls = Array.from({ length: 17 }, (_, i) => run('data.layerValues', { place: places[i % 3], layer: 'pop' + (i % 5) }, refusal));
  const t = J.judgeTurn(q, { measured: true, ms: 300000, stopped: 'step_budget', reply: '', operations: calls.map((c) => ({ capabilityId: 'data.layerValues', args: c.args.args, status: 'failed', code: 'no_readable_layer' })), calls, steps: [], snapshot: {} }, RULES);
  assert.deepEqual(t.metrics.maxSameCapability, { capability: 'data.layerValues', n: 17 });
  assert.ok(t.failures.some((f) => f.kind === 'capability' && /17 time/.test(f.detail)), 'failed every time');
  assert.ok(t.failures.some((f) => f.kind === 'result'), 'the refusal R802 recorded is recognised');
  assert.ok(t.failures.some((f) => f.kind === 'reply'), 'the reader got no answer text');
  assert.ok(t.metrics.secondOfSameOp > 0, 'identical calls among them are second-times');
});

/* ══ ⑤ 「Korean Peninsula」 answered as 「◈ map center — BWh · Hot desert」 ═════════════════════════════ */
test('atlas-eval-harness ⑤ a named place answered about the map centre is a misresolution', () => {
  const q = Q('satellites-over-japan-now');
  const calls = [run('data.layerValues', { place: 'Korean Peninsula' }, { ok: true, status: 'completed', text: '◈ map center — BWh · Hot desert' })];
  const t = J.judgeTurn(q, { measured: true, ms: 20000, stopped: 'answered', reply: 'x', operations: [{ capabilityId: 'data.layerValues', status: 'completed' }], calls, steps: [], snapshot: {} }, RULES);
  assert.equal(t.metrics.answeredAboutCentre, 1);
  assert.equal(J.metricsOf([t], []).misresolution.answeredAboutCentre, 1);
});

/* ══ ⑥ the GDP-per-capita turn: tables and choropleth drawn, the reader got 「I'm comparing…」 ═══════ */
test('atlas-eval-harness ⑥ a cut turn whose whole reply was the narration is caught, and cut turns are counted by their stop', () => {
  const q = Q('gdp-per-capita-top10-not-in-total');
  const t = J.judgeTurn(q, { measured: true, ms: 200000, stopped: 'call_budget', reply: "I'm comparing the two rankings now.", operations: [{ capabilityId: 'data.rank', status: 'completed' }], calls: [], steps: [], snapshot: {} }, RULES);
  assert.ok(t.failures.some((f) => f.kind === 'reply'));
  assert.deepEqual(J.metricsOf([t], []).cutTurns, { n: 1, by: { call_budget: 1 } });
});

/* ══ ⑦ the Nile turn: 10 m 34 s, past the agent's OWN turn budget ═══════════════════════════════════ */
test('atlas-eval-harness ⑦ a turn longer than js/atlas-agent.js allows itself is reported over budget', () => {
  assert.ok(634000 > RULES.turnBudgetMs, 'the measured 10 m 34 s is past today\'s turnBudgetMs — else this check proves nothing');
  const t = J.judgeTurn(Q('iceland-eez-200nm'), { measured: true, ms: 634000, stopped: 'time_budget', reply: 'x', operations: [{ capabilityId: 'research.analyze', status: 'completed' }], calls: [], steps: [], snapshot: {} }, RULES);
  assert.equal(t.metrics.overBudget, true);
  const M = J.metricsOf([t], []);
  assert.deepEqual(M.overBudgetTurns, ['iceland-eez-200nm']);
  assert.equal(M.durationMs.max, 634000);
});

/* ══ ⑧ R802 §6: 「Sahara」 → New York, 「the Alps」 → a hamlet near Tromsø ═══════════════════════════════ */
test('atlas-eval-harness ⑧ the recorded wrong resolutions are recognised; the one left open is reported and does not alarm', () => {
  const row = (a) => SET.placeProbes.rows.find((r) => r.asked === a);
  const sahara = J.judgeProbe(row('Sahara'), { measured: true, top: { name: 'New York', country: 'United States' } });
  const alps = J.judgeProbe(row('the Alps'), { measured: true, top: { name: 'The Alps', country: 'Norway' } });
  const pac = J.judgeProbe(row('Pacific'), { measured: true, top: { name: 'Pacifica', country: 'United States' } });
  const tokyo = J.judgeProbe(row('Tokyo'), { measured: true, top: { name: 'Tokyo', country: 'Japan' } });
  assert.ok(sahara.failures.length >= 2, 'New York neither agrees with 「Sahara」 nor is anything but the recorded wrong answer');
  assert.equal(alps.failures.length, 1, 'the name agrees; the country is the recorded wrong one');
  assert.ok(pac.failures.length && pac.knownOpen, 'Pacific → Pacifica is still measured');
  assert.deepEqual(tokyo.failures, []);
  assert.equal(J.verdictOf({ dryRun: false, turns: [], probes: [pac, tokyo], regressions: [] }), 'ok', 'a known-open finding alone does not raise the alarm');
  assert.equal(J.verdictOf({ dryRun: false, turns: [], probes: [sahara, tokyo], regressions: [] }), 'regressed');
  /* R802's repair: 「not there」 instead of the wrong kind of place — so an empty answer fails only where
     R802 recorded the name as resolving (Sahara), and is the intended refusal elsewhere (Korean Peninsula) */
  assert.deepEqual(J.judgeProbe(row('Korean Peninsula'), { measured: true, top: null, error: '' }).failures, []);
  assert.equal(J.judgeProbe(row('Sahara'), { measured: true, top: null, error: '' }).failures.length, 1);
  /* a geocoder whose every source failed is 「could not ask」, not 「no such place」 */
  assert.equal(J.judgeProbe(row('Sahara'), { measured: true, top: null, error: 'provider_unavailable' }).measured, false);
});

/* ══ ⑨ 「COULD NOT MEASURE」 IS NOT ZERO AND NOT FAILED ═══════════════════════════════════════════════
   The memory intmap-prod-atlas-needs-login: without a session the page opens the login modal, the
   turn record stays 'running' with nothing done — which reads exactly like 「zero operations」. */
test('atlas-eval-harness ⑨ a turn that never reached Atlas is 「not measured」, and a night of them is red, not green', () => {
  const q = Q('rail-tokyo-osaka');
  const gate = H.observeTurn(q, { turn: { question: q.text, status: 'running', reply: '', operations: [] }, steps: [], calls: [], lastBubble: 'Please log in to use AI features.' }, { ms: 300 });
  assert.equal(gate.measured, false);
  assert.equal(gate.unmeasured, 'gate_refused');
  const turns = SET.questions.map((x) => J.judgeTurn(x, x.sendable ? { measured: false, unmeasured: 'not_signed_in' } : null, RULES));
  const M = J.metricsOf(turns, []);
  assert.deepEqual(M.zeroOpTurns, [], 'no unmeasured turn is counted as a zero-operation turn');
  assert.equal(M.measured, 0);
  assert.ok(M.unmeasured.not_signed_in > 0 && M.unmeasured.not_sendable === 1);
  assert.equal(M.expectationFailures.alarming, 0, 'nor as a failed expectation');
  assert.equal(J.verdictOf({ dryRun: false, turns, probes: [], regressions: [] }), 'unmeasured', 'a dormant evaluation is not green');
  assert.equal(J.verdictOf({ dryRun: true, turns, probes: [], regressions: [] }), 'dry-run');
  assert.deepEqual(J.badnessOf(turns, []), {}, 'and it can neither regress nor recover');
  const md = J.renderMarkdown({ url: 'x', when: 'now', dryRun: true, verdict: 'dry-run', metrics: M, previous: null, regressions: [], improvements: [], turns, probes: [] });
  assert.match(md, /未ログインのため測れない/, 'the report says why, in the words the reader asked for');
});

/* ══ ⑩ A REGRESSION STAYS A REGRESSION UNTIL IT RECOVERS ═════════════════════════════════════════════
   Comparing only with last night would call a persistent breakage 「fixed」 on its second night, and
   the one issue would open and close on alternate nights. */
test('atlas-eval-harness ⑩ the reference does not move while a fact is worse, and moves when it recovers', () => {
  const n1 = J.advance({ 'rail-tokyo-osaka:zeroOps': 0 }, { 'rail-tokyo-osaka:zeroOps': 1 });
  assert.equal(n1.regressions.length, 1);
  const n2 = J.advance(n1.reference, { 'rail-tokyo-osaka:zeroOps': 1 });
  assert.equal(n2.regressions.length, 1, 'still a regression on the second night');
  const n3 = J.advance(n2.reference, { 'rail-tokyo-osaka:zeroOps': 0 });
  assert.deepEqual(n3.regressions, []);
  const n4 = J.advance(n3.reference, { 'x:secondOfSameOp': 3 });
  assert.deepEqual(n4.regressions, [], 'a fact seen for the first time is adopted, not judged');
});

/* ══ ⑪ 「THE SAME OPERATION」 IS THE AGENT'S DEFINITION, NOT A SECOND ONE ═════════════════════════════
   #R742 measured a blank field making the same pin a new call seven times. If the harness keyed calls
   its own way it would disagree with the reuse ledger it is measuring. */
test('atlas-eval-harness ⑪ the harness counts repeats with js/atlas-turn-results.js callKey — empty fields are not a new call', () => {
  const r = J.repeatsOf([
    run('map.pin', { place: '36.5585, 21.1286' }, { ok: true, status: 'completed' }),
    run('map.pin', { place: '36.5585, 21.1286', title: '' }, { ok: true, status: 'completed' }),
  ], RULES.callKey);
  assert.equal(r.length, 1, 'a blank title does not make a new call');
  assert.equal(r[0].after, 'completed', 'and the cause says the reuse ledger did not answer it');
  const judge = rd('scripts/atlas-eval/judge.mjs'), harness = rd('scripts/atlas-eval.mjs');
  assert.doesNotMatch(judge, /function\s+callKey|CUT_STOPS\s*=|turnBudgetMs\s*[:=]\s*\d/, 'judge.mjs keeps no copy of the product\'s rules');
  assert.match(harness, /import\('\.\.\/js\/atlas-agent\.js'\)/);
  assert.match(harness, /import\('\.\.\/js\/atlas-turn-results\.js'\)/);
});

/* ══ ⑫ THE TAP MUST BE ON THE OBJECT THE CONSOLE USES — OR SAY IT IS NOT ════════════════════════════ */
test('atlas-eval-harness ⑫ a tool-call tap that saw nothing while the model made calls reports 「not observed」, not 「no repeats」', () => {
  const q = Q('iceland-eez-200nm');
  const o = H.observeTurn(q, { turn: { question: q.text, status: 'answered', reply: 'x', operations: [{ capabilityId: 'research.analyze' }] }, steps: [{ step: 0, calls: ['run_capability'] }], calls: [], snapshot: {} }, { ms: 5 });
  assert.equal(o.calls, null);
  const t = J.judgeTurn(q, o, RULES);
  assert.equal(t.metrics.secondOfSameOp, null);
  assert.deepEqual(J.metricsOf([t], []).secondOfSameOp.unobserved, ['iceland-eez-200nm']);
});

/* ══ ⑬ THE NIGHTLY: A MISSING SECRET IS RED, AND THE SPENT TOKEN IS REPLACED ═════════════════════════
   db-backup.yml succeeds-and-skips while dormant; an evaluation that is dormant and green is the
   「測っていない」 this round exists to end. */
test('atlas-eval-harness ⑬ the workflow fails without its secrets, keeps the rotated token, and raises one issue', () => {
  const text = rd('.github/workflows/atlas-eval.yml');
  const wf = yaml.load(text);
  assert.ok(wf.on.schedule && 'workflow_dispatch' in wf.on);
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps || []);
  const gate = steps.find((s) => s.env && Object.values(s.env).some((v) => /secrets\.ATLAS_EVAL_REFRESH_TOKEN/.test(String(v))) && /exit 1/.test(String(s.run || '')));
  assert.ok(gate, 'a step reads ATLAS_EVAL_REFRESH_TOKEN and exits 1 when it is absent');
  assert.doesNotMatch(String(gate.run), /present=false|::notice::/, 'absence is not a quiet skip');
  const later = steps.slice(steps.indexOf(gate) + 1);
  assert.ok(later.every((s) => !/steps\.gate\.outputs/.test(String(s.if || ''))), 'nothing after the gate is skipped on a 「dormant」 flag');
  assert.ok(steps.some((s) => /gh secret set ATLAS_EVAL_REFRESH_TOKEN/.test(String(s.run || ''))), 'the rotated refresh token is stored for the next night');
  assert.ok(steps.some((s) => /atlas-eval\.mjs[\s\S]*--alarm/.test(String(s.run || ''))), 'the alarm step raises or clears the one issue');
  assert.ok(steps.some((s) => /upload-artifact/.test(String(s.uses || ''))), 'the report is uploaded');
  assert.ok(!/\$\{\{\s*(inputs|github\.event)\.[^}]*\}\}/.test(steps.map((s) => String(s.run || '')).join('\n')), 'no workflow input is expanded inside a shell script');
});
