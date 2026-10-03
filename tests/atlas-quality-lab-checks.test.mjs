/* ============================================================================
 *  atlas-quality-lab — IS ATLAS'S ANSWER RIGHT, AND CAN A PR BREAK A TURN UNSEEN?  (node --test)
 * ----------------------------------------------------------------------------
 *  Measured on 2026-09-30, before this work:
 *    · the nightly production evaluation (.github/workflows/atlas-eval.yml) had never run — its secrets
 *      do not exist — so the only measurement of Atlas's quality was 46 questions typed by hand;
 *    · its judge (scripts/atlas-eval/judge.mjs) read the capability a turn reached, the number of
 *      operations and regular expressions, and NOTHING that asks whether the answer is true: a turn that
 *      reached routing.route and wrote 「約 2 時間、900 km」 passed;
 *    · its problem set said of itself 「正しい所要時間・距離を記録していない」;
 *    · nothing between the model and the map — the tool surface, the schemas, the loop, the reuse ledger,
 *      the forced answer — was exercised as a WHOLE TURN on a PR.
 *  Each check below is written as the defect it guards against, and EVALUATES the code (#R505).
 * ==========================================================================*/
import { aiProxySource } from './helpers/ai-proxy-source.mjs';
/* (atlas-core-split) the task registry, evaluated — what a task is, is each tasks/<task>.ts */
const { TASKS } = await import('../supabase/functions/ai-proxy/tasks/index.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const G = await imp('scripts/atlas-eval/grade.mjs');
const J = await imp('scripts/atlas-eval/judge.mjs');
const R = await imp('scripts/atlas-eval/replay.mjs');
const LAB = await imp('scripts/atlas-eval/lab.mjs');
const H = await imp('scripts/atlas-eval.mjs');
const SC = await imp('scripts/atlas-eval/scripted-cassettes.mjs');
const SHARED = await imp('supabase/functions/_shared/atlas-grade-schema.js');
const P = await R.productModules(imp);
const SETS = LAB.loadSets(ROOT);
const CASSETTES = LAB.loadCassettes(ROOT);
const { makeAtlasCapabilities } = await imp('js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});
const RULES = LAB.rulesOf(P);

/* ══ ① THE ANSWER KEY — 50+ OBJECTIVE QUESTIONS, EACH WITH THE SOURCE ITS ANSWER WAS VERIFIED AT ═════════ */
test('atlas-quality-lab ① the answer key is well formed, sourced, and wide enough to read by kind and language', () => {
  const K = SETS.answers;
  assert.deepEqual(G.validateAnswerKey(K, (id) => !!CAPS.resolve(id)), [], 'every row has a kind, a unit, a tolerance, a source url and real capabilities');
  assert.ok(K.questions.length >= 50, 'at least 50 questions with a verified answer (the request); there are ' + K.questions.length);
  const by = (f) => K.questions.reduce((o, q) => ((o[q[f]] = (o[q[f]] || 0) + 1), o), {});
  for (const [cat, n] of Object.entries(by('category'))) assert.ok(n >= 5, 'a category with fewer than 5 questions cannot be read as a rate: ' + cat + ' has ' + n);
  for (const c of ['distance', 'duration', 'population', 'date']) assert.ok(by('category')[c], 'the four kinds the request named are present: ' + c);
  const L = by('lang');
  assert.ok(L.jp >= 20 && L.en >= 20, 'both languages the product authors in are asked (jp ' + L.jp + ', en ' + L.en + ')');
  /* the two problem sets share one id space: a report row and a cassette name a question by id alone */
  const ids = new Set(SETS.records.questions.map((q) => q.id));
  for (const q of K.questions) assert.ok(!ids.has(q.id), q.id + ' is in both sets');
  /* a question whose answer drifts must say which edition it asks about */
  for (const q of K.questions.filter((x) => x.category === 'population')) assert.match(q.text, /\d{4}|令和/, q.id + ' pins the census it asks about');
});

/* ══ ② THE DETERMINISTIC GRADE READS WHAT THE REPLY STATES ═══════════════════════════════════════════════ */
test('atlas-quality-lab ② a quantity is read the way the replies write it', () => {
  const q = (t) => G.quantities(t).map((x) => [x.value, x.unit]);
  assert.deepEqual(q('約2時間22分'), [[142, 'minutes']]);
  assert.deepEqual(q('2 hours and 27 minutes'), [[147, 'minutes']]);
  assert.deepEqual(q('1億2614万6099人'), [[126146099, 'people']], 'a Japanese compound number is ONE number');
  assert.deepEqual(q('1,404万7,594人'), [[14047594, 'people']]);
  assert.deepEqual(q('14.05 million people'), [[14050000, 'people']]);
  assert.deepEqual(q('3,776 m'), [[3776, 'm']]);
  assert.deepEqual(q('377,975 km²'), [[377975, 'km2']]);
  assert.deepEqual(q('515.4km'), [[515.4, 'km']]);
  assert.deepEqual(q('86 m below sea level'), [[-86, 'm']], 'below sea level is negative');
  assert.deepEqual(q('−86 m'), [[-86, 'm']]);
  assert.deepEqual(q('515-552 km').map((x) => x[0]), [515, 552], 'a hyphen between two numbers is a range, not a sign');
  assert.deepEqual(q('2026年 3,776 m').map((x) => x[0]), [2026, 3776], 'two numbers separated by a unit word are two numbers');
});

test('atlas-quality-lab ② a stated value is graded correct / incorrect / absent against the key', () => {
  const num = (value, unit, tolerance) => ({ kind: 'number', value, unit, tolerance });
  assert.equal(G.gradeAnswer(num(515.4, 'km', { rel: 0.02 }), '約900 kmです').verdict, 'incorrect', 'a wrong distance is wrong — the defect the judge alone passed');
  assert.equal(G.gradeAnswer(num(515.4, 'km', { rel: 0.02 }), 'ルートを地図に引きました。').verdict, 'absent', '「did not say」 is not 「said wrong」');
  assert.equal(G.gradeAnswer(num(126146099, 'people', { rel: 0.01 }), '総人口は約1億2615万人です').verdict, 'correct');
  assert.equal(G.gradeAnswer(num(331449281, 'people', { rel: 0.01 }), 'The 2020 Census counted a resident population of 331,449,281.').verdict, 'correct', 'a head count written before its noun is read');
  assert.equal(G.gradeAnswer(num(331449281, 'people', { rel: 0.01 }), 'In 2020 the census was taken.').verdict, 'absent', 'a year is not a head count');
  assert.equal(G.gradeAnswer(num(5539.5, 'km', { rel: 0.02 }), 'about 3,442 miles').verdict, 'correct', 'an answer in miles is converted, not failed');
  assert.equal(G.gradeAnswer(num(6190, 'm', { abs: 5 }), '20,310 ft').verdict, 'correct');
  assert.equal(G.gradeAnswer(num(3776, 'm', { abs: 1 }), '富士山は3.776 kmです').verdict, 'correct', 'km and m are one dimension');
  assert.equal(G.gradeAnswer({ kind: 'range', min: 140, max: 142, unit: 'minutes' }, '最速2時間21分').verdict, 'correct');
  assert.equal(G.gradeAnswer({ kind: 'date', value: '1995-01-17' }, 'January 17, 1995').verdict, 'correct');
  assert.equal(G.gradeAnswer({ kind: 'date', value: '1995-01-17' }, '1995年1月7日').verdict, 'incorrect');
  assert.equal(G.gradeAnswer({ kind: 'date', value: '1914-08' }, 'in August 1914').verdict, 'correct', 'a month-precision answer is graded at month precision');
  assert.equal(G.gradeAnswer({ kind: 'name', accept: ['Canberra', 'キャンベラ'] }, '首都は キャンベラ です').verdict, 'correct');
  assert.equal(G.gradeAnswer({ kind: 'count', value: 47 }, '都道府県は47あります').verdict, 'correct');
  assert.equal(G.gradeAnswer({ kind: 'count', value: 47 }, '43の県があります').verdict, 'incorrect');
  assert.equal(G.languageOf('日本には47の都道府県があります。'), 'jp');
  assert.equal(G.languageOf('Japan has 47 prefectures (Tokyo-to, Hokkaido).'), 'en');
});

test('atlas-quality-lab ② every verified answer, written as a careful reply would write it, grades correct', () => {
  /* the key and the grader agree with each other: a reply that states the key's own value in the key's own
     unit is read as correct. A row the grader cannot read is a row that can never pass. */
  for (const q of SETS.answers.questions) {
    const a = q.answer;
    const unitWord = { km: 'km', m: 'm', km2: 'km²', people: 'people', minutes: 'minutes' };
    const reply = a.kind === 'name' ? 'It is ' + a.accept[0] + '.'
      : a.kind === 'date' ? 'It was ' + a.value + '.'
      : a.kind === 'count' ? 'There are ' + a.value + '.'
      : a.kind === 'range' ? 'About ' + ((a.min + a.max) / 2) + ' ' + unitWord[a.unit] + '.'
      : 'About ' + a.value + ' ' + unitWord[a.unit] + '.';
    assert.equal(G.gradeAnswer(a, reply).verdict, 'correct', q.id + ': «' + reply + '» does not grade correct');
  }
});

/* ══ ③ THE INDEPENDENT GRADER — NEVER THE ANSWERER, AND A MALFORMED GRADE IS NOT A FAILING GRADE ═════════ */
test('atlas-quality-lab ③ the grader is a provider other than the one answering, or there is no grade', () => {
  const keyed = (...ps) => (p) => ps.indexOf(p) >= 0;
  assert.equal(SHARED.graderProviderFor('openai', keyed('openai', 'gemini')), 'gemini', 'production today: Atlas answers on OpenAI, Gemini is keyed');
  assert.notEqual(SHARED.graderProviderFor('gemini', keyed('openai', 'gemini')), 'gemini');
  assert.equal(SHARED.graderProviderFor('openai', keyed('openai')), null, 'only the answering provider keyed → refuse, never self-grade');
  const src = aiProxySource();
  /* read, because the Edge Function imports Deno globals and cannot be evaluated here: the task exists,
     its provider comes from the shared rule, and a developer's pick does not reach it */
  assert.match(src, /"atlas_grade",/, 'atlas_grade is an accepted task');
  assert.match(src, /import \{[^}]*graderProviderFor[^}]*\} from "\.\.\/_shared\/atlas-grade-schema\.js"/);
  assert.match(src, /const provider = \(graderProvider \|\| devPick\?\.provider/, 'the grader provider wins over a developer pick');
  assert.deepEqual([...TASKS.values()].filter((t) => t.grader).map((t) => t.name).sort(), ['atlas_grade']);
  assert.match(src, /if \(TASKS\.get\(String\(payload\.task \|\| ""\)\.toLowerCase\(\)\)\?\.grader\) return null;/, 'a developer\'s pick never reaches the grader — so its model is the grader provider\'s default (envModel is AI_PROVIDER\'s id and the grader is never AI_PROVIDER)');
  assert.deepEqual(TASKS.get('atlas_grade').schema, SHARED.ATLAS_GRADE_SCHEMA, 'the server owns the grade\'s shape');
  assert.match(src, /error: "no_independent_grader"/);
});

test('atlas-quality-lab ③ the rubric is asked against the verified answer, and read back strictly', () => {
  const q = SETS.answers.questions[0];
  const req = G.rubricRequest(q, 'reply text');
  assert.match(req.prompt, /VERIFIED ANSWER/);
  assert.ok(req.prompt.indexOf(q.source.url) >= 0, 'the grader sees where the answer was verified');
  for (const c of G.ATLAS_GRADE_CRITERIA) assert.ok(req.system.indexOf(c.id) >= 0, 'the instruction names criterion ' + c.id);
  const full = { scores: { correctness: 2, commitment: 2, grounding: 1, language: 2 }, verdict: 'pass', evidence: 'x' };
  assert.equal(G.readRubric(full).verdict, 'pass');
  assert.equal(G.readRubric({ ...full, scores: { ...full.scores, correctness: 1 } }).verdict, 'fail', 'a grader that says pass with correctness 1 contradicts its own rubric — the stricter reading is kept');
  assert.equal(G.readRubric({ ...full, scores: { ...full.scores, grounding: 3 } }).measured, false, 'a score outside 0/1/2 is ungraded, not failed');
  assert.equal(G.readRubric(null).measured, false);
  /* the server-owned schema names exactly the criteria the reader checks */
  assert.deepEqual(SHARED.ATLAS_GRADE_SCHEMA.properties.scores.required, G.ATLAS_GRADE_CRITERIA.map((c) => c.id));
});

/* ══ ④ THE JUDGE NOW ASKS WHETHER THE ANSWER IS RIGHT ═══════════════════════════════════════════════════ */
test('atlas-quality-lab ④ a turn that reached its tool and stated the wrong figure fails; a gap is not a defect that came back', () => {
  const q = Object.assign({ sendable: true, expect: {}, unset: {} }, SETS.answers.questions.find((x) => x.id === 'tokaido-shinkansen-tokyo-shinosaka-length'));
  const obs = (reply) => ({ measured: true, ms: 30000, stopped: 'answered', reply, operations: [{ capabilityId: 'routing.route', status: 'completed' }], calls: [], steps: [], snapshot: {} });
  const wrong = J.judgeTurn(q, obs('約900 kmです。'), RULES);
  assert.ok(wrong.failures.some((f) => f.kind === 'answer'), 'the wrong distance is a failure');
  const right = J.judgeTurn(q, obs('実キロは515.4 kmです。'), RULES);
  assert.deepEqual(right.failures, []);
  /* the first night a never-answered question fails is a quality gap, not a recorded defect returning … */
  assert.equal(J.verdictOf({ dryRun: false, turns: [wrong], probes: [], regressions: [] }), 'ok');
  /* … but once it was right, getting it wrong is a regression */
  const ref = J.advance(null, J.badnessOf([right], [])).reference;
  const adv = J.advance(ref, J.badnessOf([wrong], []));
  assert.deepEqual(adv.regressions.map((x) => x.key), ['tokaido-shinkansen-tokyo-shinosaka-length:answer']);
  /* a reply in the other language is a defect wherever it happens */
  const en = J.judgeTurn(q, obs('The track length is 515.4 km.'), RULES);
  assert.ok(en.failures.some((f) => f.kind === 'language'));
  assert.equal(J.verdictOf({ dryRun: false, turns: [en], probes: [], regressions: [] }), 'regressed');
  /* the aggregate breaks accuracy down the three ways the report reads it */
  const M = J.metricsOf([wrong, right], []);
  assert.equal(M.answers.graded, 2);
  assert.equal(M.answers.byCategory.distance.correct, 1);
  assert.equal(M.answers.byLang.jp.n, 2);
  assert.ok(M.answers.byCapability['routing.route'], 'by the capability the key names');
});

/* ══ ⑤ THE REPLAY — EVERY CASSETTE, THROUGH THE CURRENT CODE, WITH NO MODEL ═════════════════════════════ */
test('atlas-quality-lab ⑤ every cassette replays without divergence and is judged as recorded', async () => {
  assert.ok(CASSETTES.length >= 12, 'the cassettes are present: ' + CASSETTES.length);
  const res = await LAB.evaluateCassettes(CASSETTES, { P, sets: SETS });
  const red = res.filter((r) => r.problems.length);
  assert.deepEqual(red.map((r) => r.id + ': ' + r.problems.join(' | ')), []);
  /* the replay holds the judge to the recorded defects, not only the good turns */
  assert.ok(CASSETTES.filter((c) => c.expect.verdict === 'fail').length >= 5);
  assert.ok(CASSETTES.filter((c) => c.expect.verdict === 'pass').length >= 5);
});

test('atlas-quality-lab ⑤ the scripted cassettes are what their scenarios produce (re-record with --write)', async () => {
  const built = await SC.build(P);
  for (const b of built) {
    const c = CASSETTES.find((x) => x.id === b.id);
    assert.ok(c, 'scenario ' + b.id + ' has a cassette');
    const { __file, ...committed } = c;
    assert.equal(R.canon(committed), R.canon(JSON.parse(JSON.stringify(b))), b.id + ' is stale: node scripts/atlas-eval/scripted-cassettes.mjs --write');
  }
});

/* each of these is a regression in the code BETWEEN the model and the map, injected as a wrapper (no source
   file is touched — [[intmap-mutation-tests-poison-git-add]]); the replay must turn red for each */
const wrapSurface = (f) => Object.assign({}, P, { makeAtlasToolSurface: (deps) => f(P.makeAtlasToolSurface(deps), deps) });
const replayOne = async (id, PP, sets = SETS) => (await LAB.evaluateCassettes(CASSETTES.filter((c) => c.id === id), { P: PP, sets }))[0];

test('atlas-quality-lab ⑤ a surface that builds a different action is seen', async () => {
  const PP = Object.assign({}, P, { makeAtlasToolSurface: (deps) => P.makeAtlasToolSurface(Object.assign({}, deps, { runAction: (a, t) => deps.runAction(Object.assign({}, a, { mode: 'car' }), t) })) });
  const r = await replayOne('tokaido-route-answered', PP);
  assert.ok(r.problems.some((p) => /unrecorded_action/.test(p)), r.problems.join(' | '));
});

test('atlas-quality-lab ⑤ an observer status mishandled (unobserved read as partial) re-runs the call, and is seen', async () => {
  const PP = wrapSurface((S) => Object.assign({}, S, {
    makeExecute: (tools, agent) => { const ex = S.makeExecute(tools, agent); return async (c, t) => { const r = await ex(c, t); return r && r.status === 'unobserved' ? Object.assign({}, r, { status: 'partial', code: 'no_change' }) : r; }; },
  }));
  const r = await replayOne('unobserved-call-is-not-run-twice', PP);
  assert.ok(r.problems.some((p) => /reached the dispatch|unrecorded_action|calls/.test(p)), r.problems.join(' | '));
});

test('atlas-quality-lab ⑤ a loop that runs out of steps earlier is seen', async () => {
  const PP = Object.assign({}, P, { makeAtlasAgent: () => { const A = P.makeAtlasAgent(); return Object.assign({}, A, { runTurn: (o) => A.runTurn(Object.assign({}, o, { limits: { maxSteps: 4 } })) }); } });
  const r = await replayOne('cut-short-answer-written-after', PP);
  assert.ok(r.problems.some((p) => /divergence/.test(p)), r.problems.join(' | '));
});

test('atlas-quality-lab ⑤ a judge that stops finding a recorded defect is seen', async () => {
  const sets = JSON.parse(JSON.stringify(SETS));
  sets.records.questions.find((q) => q.id === 'population-density-tokyo-delhi-lagos').expect = {};
  const r = await replayOne('layer-values-refused-every-time', P, sets);
  assert.ok(r.problems.some((p) => /no longer finds the recorded defect/.test(p)), r.problems.join(' | '));
});

test('atlas-quality-lab ⑤ a find_capability ranking that moved is said, even when the turn survives it', async () => {
  const cas = JSON.parse(JSON.stringify(CASSETTES.find((c) => c.id === 'tokaido-route-answered')));
  cas.world.find[0].result.matches.reverse();
  const res = await R.replayCassette(cas, P);
  assert.ok(res.divergences.some((d) => d.kind === 'find_ranking'));
});

/* ══ ⑥ A PRODUCTION TURN BECOMES A CASSETTE THAT REPLAYS ═════════════════════════════════════════════════ */
test('atlas-quality-lab ⑥ --record writes a cassette from an observed turn, and it replays green', async () => {
  for (const id of ['tokaido-route-answered', 'layer-values-refused-every-time', 'unobserved-call-is-not-run-twice']) {
    const src = CASSETTES.find((c) => c.id === id);
    const r = await R.replayCassette(src, P);
    /* what the page publishes for a turn (observeTurn's shape) — the replies and dispatches js/atlas-console.js now keeps */
    const obs = Object.assign({}, r.obs, { replies: src.model, dispatches: src.world.dispatch });
    const q = LAB.questionOf(SETS, src);
    const judged = J.judgeTurn(q, obs, RULES);
    const cas = H.cassetteOf(Object.assign({ set: src.question.set }, q), obs, judged, { url: 'https://example.test/', build: 'b', when: '2026-10-01T00:00:00Z' });
    assert.equal(cas.origin.kind, 'recorded');
    const res = await LAB.evaluateCassettes([cas], { P, sets: SETS });
    assert.deepEqual(res[0].problems, [], id + ' round trip');
  }
  /* half a turn is not a cassette */
  assert.equal(H.cassetteOf({ id: 'x' }, { measured: true, calls: [], replies: null, dispatches: [] }, { failures: [], metrics: {} }, { when: 'w' }), null);
  /* the console keeps both sides of the turn in the record --record reads (read: the console needs a page) */
  const con = rd('js/atlas-console.js');
  assert.match(con, /_atlasDbg=\{[^}]*replies:\[\], dispatches:\[\] \}/);
  assert.match(con, /_atlasDbg\.replies\.push\(/);
  assert.match(con, /_atlasDbg\.dispatches\.push\(\{ action:_asked/);
});

/* ══ ⑦ THE REPORT OVER TIME ═══════════════════════════════════════════════════════════════════════════ */
test('atlas-quality-lab ⑦ the history carries forward night by night, and reads worst first', () => {
  const night = (when, right) => ({ when, verdict: 'ok', metrics: { measured: 2, questions: 2, reach: { reached: 1, of: 1 }, cutTurns: { n: 0 }, secondOfSameOp: { total: 0 }, durationMs: { p50: 1000 },
    answers: { correct: right, graded: 2, absent: 0, rubric: { pass: 0, graded: 0 }, byCategory: { distance: { n: 1, correct: right ? 1 : 0 }, date: { n: 1, correct: 1 } }, byLang: {}, byCapability: {} } } });
  let prev = null;
  for (let i = 0; i < LAB.HISTORY_KEEP + 5; i++) { const r = night('2026-10-' + String(1 + (i % 28)).padStart(2, '0'), i % 2); r.history = LAB.historyOf(prev, r); prev = r; }
  assert.equal(prev.history.length, LAB.HISTORY_KEEP, 'the series is bounded');
  assert.equal(LAB.historyOf(prev, Object.assign({}, night('x', 1), { dryRun: true })).length, LAB.HISTORY_KEEP, 'a dry run appends nothing');
  const md = LAB.renderTrend(prev.history, 3);
  assert.match(md, /By kind of question/);
  const rows = md.split('\n').filter((l) => /^\| (distance|date) \|/.test(l));
  assert.ok(rows.length === 2, md);
});

/* ══ ⑧ THE NIGHTLY ASKS BOTH SETS, GRADES, AND STOPS INSIDE ITS OWN CEILING ═════════════════════════════ */
test('atlas-quality-lab ⑧ the workflow asks the answer key with the independent grader and a deadline under the job ceiling', () => {
  const wf = yaml.load(rd('.github/workflows/atlas-eval.yml'));
  const job = wf.jobs.eval;
  const step = job.steps.find((s) => s.name === 'Evaluate');
  assert.match(step.run, /--set all/);
  assert.match(step.run, /--rubric/);
  const dl = +((/--deadline-min (\d+)/.exec(step.run) || [])[1]);
  assert.ok(dl > 0 && dl < job['timeout-minutes'], 'the run stops starting questions before GitHub kills the job (' + dl + ' < ' + job['timeout-minutes'] + ')');
  assert.ok(job.steps.some((s) => /GITHUB_STEP_SUMMARY/.test(String(s.run || ''))), 'the report is on the run page, not only in the artifact');
});
