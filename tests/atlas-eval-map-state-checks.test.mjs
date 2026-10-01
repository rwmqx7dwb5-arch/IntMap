/* ============================================================================
 *  atlas-eval-map-state — IS THE MAP RIGHT, GRADED APART FROM THE WORDS  (node --test)
 * ----------------------------------------------------------------------------
 *  Measured on 2026-10-01, before this work: the quality lab (#853) graded every one of the 74 answer-key
 *  questions by the numbers, dates and names in the REPLY. PRODUCT.md §2.2-2 says the answer is the MAP's
 *  state, and nothing asked whether the map ended at the right place, year, layer or drawing: a turn that
 *  wrote 「515.4 km」 and left the start-up view passed 「ルートを地図に出して」.
 *  Each check below is written as the defect it guards against, and EVALUATES the code (#R505).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const MS = await imp('scripts/atlas-eval/map-state.mjs');
const G = await imp('scripts/atlas-eval/grade.mjs');
const J = await imp('scripts/atlas-eval/judge.mjs');
const R = await imp('scripts/atlas-eval/replay.mjs');
const LAB = await imp('scripts/atlas-eval/lab.mjs');
const SC = await imp('scripts/atlas-eval/scripted-cassettes.mjs');
const P = await R.productModules(imp);
const SETS = LAB.loadSets(ROOT);
const CASSETTES = LAB.loadCassettes(ROOT);
const { makeAtlasCapabilities } = await imp('js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});
const has = (id) => !!CAPS.resolve(id);
const V = MS.mapVocabulary(ROOT);
const RULES = Object.assign(LAB.rulesOf(P), { eraReference: V.era });
const clone = (v) => JSON.parse(JSON.stringify(v));
const keyQ = (id) => SETS.answers.questions.find((q) => q.id === id) || SETS.records.questions.find((q) => q.id === id);

/* ══ ① THE VOCABULARY IS DISCOVERED FROM THE PRODUCT, NOT LISTED ═══════════════════════════════════════ */
test('atlas-eval-map-state ① layer ids, snapshot sections, atlas fields and object kinds come from the product', () => {
  const decl = readdirSync(join(ROOT, 'js/layers')).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(V.layers.size, decl.length, 'one layer id per declaration in js/layers/');
  for (const f of decl) assert.ok(V.layers.has(f.replace(/\.js$/, '')), f + ' — the declaration id is its file name (scripts/layer-descriptors.mjs)');
  for (const s of ['viewport', 'activeLayers', 'time', 'comparison', 'objects', 'atlas']) assert.ok(V.sections.has(s), 'a provider is registered for ' + s);
  for (const k of ['lines', 'measure', 'pins', 'polygons', 'highlightCountries']) assert.ok(V.atlasKeys.has(k), 'the console\'s atlas section has ' + k);
  for (const k of ['route', 'pin', 'outline']) assert.ok(V.objectKinds.has(k), 'the object inventory emits ' + k);
  /* the sections a harness must capture are derived from the criteria written */
  const read = MS.sectionsRead([...SETS.answers.questions, ...SETS.records.questions]);
  for (const s of read) assert.ok(V.sections.has(s), s);
  assert.ok(read.includes('viewport') && read.includes('time'), read.join(','));
});

/* ══ ② THE KEY'S EXPECTED MAPS ARE WELL FORMED AND NAME ONLY WHAT EXISTS ═══════════════════════════════ */
test('atlas-eval-map-state ② both problem sets\' mapState validate against the discovered vocabulary', () => {
  assert.deepEqual(G.validateAnswerKey(SETS.answers, has, V), []);
  assert.deepEqual(J.validateQuestionSet(SETS.records, has, V), []);
  const withMap = SETS.answers.questions.filter((q) => q.mapState);
  assert.ok(withMap.length > 0, 'the answer key states expected maps');
  /* a question whose words ask nothing of the map carries none — a guessed expectation is a false alarm */
  for (const id of ['japan-population-2020-census', 'channel-tunnel-inauguration-date', 'japan-prefecture-count']) assert.equal(keyQ(id).mapState, undefined, id);
  /* every coordinate names where it was read */
  for (const q of withMap) for (const p of (q.mapState.view && q.mapState.view.contains) || []) assert.match(p.source, /^https:\/\//, q.id + ' ' + p.name);
});

test('atlas-eval-map-state ② a key that names something the product does not have is red', () => {
  const base = keyQ('tokaido-shinkansen-tokyo-shinosaka-length');
  const bad = (ms) => G.validateAnswerKey({ questions: [Object.assign(clone(base), { mapState: ms })] }, has, V);
  const near = /** a valid point */ base.mapState.view.contains[0];
  assert.match(bad({ layers: { on: ['dl-no-such-layer'], why: 'w' } }).join(' '), /no declaration in js\/layers/);
  assert.match(bad({ drawn: [{ path: 'nosuch.n', min: 1, why: 'w' }] }).join(' '), /no provider in js\/ registers/);
  assert.match(bad({ drawn: [{ path: 'atlas.nosuch', min: 1, why: 'w' }] }).join(' '), /has no field «nosuch»/);
  assert.match(bad({ drawn: [{ path: 'objects.kind:nosuch', min: 1, why: 'w' }] }).join(' '), /no object of kind «nosuch»/);
  assert.match(bad({ view: { contains: [Object.assign({}, near, { source: '' })], why: 'w' } }).join(' '), /names no source url/);
  assert.match(bad({ view: { contains: [near] } }).join(' '), /carries no «why»/);
  assert.match(bad({ clock: { year: 1750, live: true, why: 'w' } }).join(' '), /exactly one of/);
  assert.match(bad({ nonsense: 1 }).join(' '), /unknown criterion/);
});

/* ══ ③ HISTORY IS CHECKED AS HISTORY — THE KEY AGAINST THE ENUMERATION AND THE INSTITUTION'S DATES ═══════ */
test('atlas-eval-map-state ③ an era key is held to what scripts/hist-fidelity.mjs enumerates for that year and place', () => {
  const r1900 = keyQ('japan-admin-1900');
  const bad = (era) => J.validateQuestionSet({ questions: [Object.assign(clone(r1900), { mapState: { era: Object.assign(clone(r1900.mapState.era), era) } })] }, has, V);
  assert.deepEqual(bad({}), [], 'the committed 1900 key holds');
  /* the #R730 defect, as a key: a ritsuryō province asked for in 1900 is not in the record (abolished 1871-08-29) */
  assert.match(bad({ includes: ['山城国'] }).join(' '), /does not draw in 1900/);
  /* and a key that excludes what the record does draw names the rows */
  assert.match(bad({ year: 1750, includes: [], excludes: { pattern: '国$', why: 'w' } }).join(' '), /but the record draws 山城国/);
  /* a place and year with nothing in the record is a map that does not exist */
  assert.match(bad({ in: [-170, -60, -160, -50], includes: [] }).join(' '), /draws no unit/);
});

/* ══ ④ UNOBSERVED IS NOT A MISMATCH ═══════════════════════════════════════════════════════════════════ */
test('atlas-eval-map-state ④ a section the snapshot does not carry is unobserved; one that was read and differs is a mismatch', () => {
  const ms = keyQ('great-circle-haneda-new-chitose').mapState;   /* view + two pins */
  assert.equal(MS.gradeMap(ms, {}).verdict, 'unobserved');
  assert.equal(MS.gradeMap(ms, null).verdict, 'unobserved');
  assert.equal(MS.gradeMap(ms, { viewport: null, objects: null, atlas: null }).verdict, 'unobserved', 'null = no provider = not read');
  const frame = { viewport: { west: 136.5, south: 33.5, east: 145, north: 44.5 } };
  const g1 = MS.gradeMap(ms, frame);
  assert.equal(g1.verdict, 'unobserved', 'the frame was read and holds both; the pins were not read');
  assert.equal(g1.match, 1);
  /* any-of: one alternative read and short, the other unread — still unobserved, never a miss */
  assert.equal(MS.gradeMap(ms, Object.assign({ objects: { n: 0, items: [] } }, frame)).verdict, 'unobserved');
  assert.equal(MS.gradeMap(ms, Object.assign({ objects: { n: 0, items: [] }, atlas: { pins: null } }, frame)).verdict, 'mismatch', 'every alternative read and empty');
  assert.equal(MS.gradeMap(ms, Object.assign({ objects: { n: 2, items: [{ kind: 'pin' }, { kind: 'pin' }] } }, frame)).verdict, 'match');
  /* the frame was read and the place is not in it */
  const g2 = MS.gradeMap(ms, { viewport: { west: 120, south: 20, east: 130, north: 30 }, atlas: { pins: { n: 2 } } });
  assert.equal(g2.verdict, 'mismatch');
  assert.match(g2.criteria.find((c) => c.criterion === 'view').detail, /HND, CTS outside the frame/);
});

test('atlas-eval-map-state ④ the frame is read across the antimeridian; a ticked row that is not painted is not on', () => {
  assert.ok(MS.inFrame({ west: 170, south: -50, east: 190, north: -30 }, -178, -40), 'east of 180 on a frame that crosses it');
  assert.ok(MS.inFrame({ west: 170, south: -50, east: -170, north: -30 }, 179, -40), 'west > east (normalised bounds) is the same 20° frame across 180');
  assert.ok(!MS.inFrame({ west: 170, south: -50, east: -170, north: -30 }, 0, -40), '…not the 340° the other way round');
  assert.ok(MS.inFrame({ west: -200, south: -90, east: 200, north: 90 }, 12, 0), 'a frame wider than the world holds everything');
  assert.ok(!MS.inFrame({ west: 0, south: 0, east: 10, north: 10 }, 5, 11), 'latitude outside');
  const ms = { layers: { on: ['cb-admin1'], off: ['dl-ww1'], why: 'w' } };
  assert.equal(MS.gradeMap(ms, { activeLayers: [{ id: 'cb-admin1', label: 'x', painted: true }] }).verdict, 'match');
  assert.equal(MS.gradeMap(ms, { activeLayers: [{ id: 'cb-admin1', label: 'x', painted: false }] }).verdict, 'mismatch');
  assert.equal(MS.gradeMap(ms, { activeLayers: [{ id: 'cb-admin1', painted: true }, { id: 'dl-ww1', painted: true }] }).verdict, 'mismatch');
  assert.equal(MS.gradeMap(ms, { activeLayers: [] }).verdict, 'mismatch', 'an empty list was read: nothing is on');
  /* the clock */
  const c = { clock: { year: 1750, why: 'w' } };
  assert.equal(MS.gradeMap(c, { time: { live: false, travelDate: '1750-07-01' } }).verdict, 'match');
  assert.equal(MS.gradeMap(c, { time: { live: true, travelDate: null } }).verdict, 'mismatch');
  assert.equal(MS.gradeMap({ clock: { year: -200, why: 'w' } }, { time: { live: false, travelDate: '-000200-07-01' } }).verdict, 'match', 'the signed six-digit year js/chronos.js writes');
  /* the comparison panel */
  const cp = { comparison: { open: true, codes: ['JPN', 'DEU'], why: 'w' } };
  assert.equal(MS.gradeMap(cp, { comparison: { open: true, codes: ['JPN', 'DEU', 'FRA'] } }).verdict, 'match');
  assert.equal(MS.gradeMap(cp, { comparison: { open: true, codes: ['JPN'] } }).verdict, 'mismatch');
});

/* ══ ⑤ THE ERA: WHAT THE READER SAW AGAINST WHAT THAT YEAR SHOWS ══════════════════════════════════════ */
test('atlas-eval-map-state ⑤ an era is graded by the units in force at the observed year in the observed frame', () => {
  const ms = keyQ('ryoseikoku-1750').mapState;
  const japan = { viewport: { west: 128, south: 30, east: 146, north: 46 }, activeLayers: [{ id: 'cb-admin1', painted: true }] };
  const at = (travelDate, live = false) => Object.assign({ time: { live, travelDate } }, japan);
  const ok = MS.gradeMap(ms, at('1750-07-01'), { eraReference: V.era });
  assert.equal(ok.verdict, 'match', JSON.stringify(ok.criteria));
  /* Atlas set the clock to 1900: the provinces the question asked for are not what the reader sees */
  const wrong = MS.gradeMap(ms, at('1900-07-01'), { eraReference: V.era });
  assert.equal(wrong.verdict, 'mismatch');
  assert.match(wrong.criteria.find((c) => c.criterion === 'era').detail, /missing .*国/);
  assert.equal(MS.gradeMap(ms, at(null, true), { eraReference: V.era }).verdict, 'mismatch', 'a live clock shows today\'s subdivisions');
  /* the frame elsewhere */
  const away = Object.assign({}, at('1750-07-01'), { viewport: { west: -10, south: 40, east: 10, north: 55 } });
  assert.match(MS.gradeMap(ms, away, { eraReference: V.era }).criteria.find((c) => c.criterion === 'era').detail, /does not reach/);
  /* without the enumeration handed in, the era is unobserved — the clock and layer still grade */
  const noRef = MS.gradeMap(ms, at('1750-07-01'));
  assert.equal(noRef.criteria.find((c) => c.criterion === 'era').verdict, 'unobserved');
  assert.equal(noRef.criteria.find((c) => c.criterion === 'clock').verdict, 'match');
});

/* ══ ⑥ THE TWO AXES STAY APART ══════════════════════════════════════════════════════════════════════════ */
test('atlas-eval-map-state ⑥ the map axis adds no failure to the text verdict, and regresses on its own key', async () => {
  const cas = CASSETTES.find((c) => c.id === 'measured-and-stated-wrong');
  const r = await R.replayCassette(cas, P);
  const t = J.judgeTurn(LAB.questionOf(SETS, cas), r.obs, RULES);
  assert.equal(t.metrics.grade.verdict, 'incorrect', 'the sentence was wrong');
  assert.equal(t.metrics.map.verdict, 'match', 'the map was right');
  assert.deepEqual(t.failures.map((f) => f.kind), ['answer'], 'the map grade is not a failure kind');
  const b = J.badnessOf([t], []);
  assert.equal(b[t.id + ':map'], 0);
  /* an unobserved map is no fact: it can neither regress nor recover */
  const u = J.judgeTurn(LAB.questionOf(SETS, cas), Object.assign({}, r.obs, { snapshot: {} }), RULES);
  assert.ok(!(u.id + ':map' in J.badnessOf([u], [])));
  const x = J.judgeTurn(LAB.questionOf(SETS, cas), Object.assign({}, r.obs, { snapshot: { viewport: { west: 0, south: 0, east: 1, north: 1 }, atlas: {} } }), RULES);
  assert.equal(x.metrics.map.verdict, 'mismatch');
  const adv = J.advance(b, J.badnessOf([x], []));
  assert.deepEqual(adv.regressions.map((g) => g.key), [t.id + ':map'], 'a map that was right and is now wrong is a regression');
  const M = J.metricsOf([t, x, u], []);
  assert.equal(M.map.graded, 3);
  assert.deepEqual([M.map.match, M.map.mismatch, M.map.unobserved], [1, 1, 1]);
  assert.equal(M.map.byLang.jp.n, 3);
  assert.equal(M.answers.graded, 3, 'the text axis counts the same turns on its own');
});

/* ══ ⑦ THE REPLAY RUNS THE MAP AXIS ═════════════════════════════════════════════════════════════════════ */
test('atlas-eval-map-state ⑦ every scripted cassette whose question states a map declares its verdict, and the replay holds it', async () => {
  const scripted = SC.SCENARIOS.filter((s) => keyQ(s.question.id).mapState);
  assert.ok(scripted.length > 0);
  for (const s of scripted) assert.ok(['match', 'mismatch', 'unobserved'].includes(s.expect.map), s.id + ' declares expect.map');
  const res = await LAB.evaluateCassettes(CASSETTES, { P, sets: SETS });
  assert.deepEqual(res.filter((r) => r.problems.length).map((r) => r.id + ': ' + r.problems.join(' | ')), []);
  const verdicts = new Set(res.filter((r) => r.judged && r.judged.metrics.map).map((r) => r.judged.metrics.map.verdict));
  for (const v of ['match', 'mismatch', 'unobserved']) assert.ok(verdicts.has(v), 'the replayed set exercises ' + v);
  /* a map that moved is seen: the same turn with the frame somewhere else is red */
  const moved = clone(CASSETTES.find((c) => c.id === 'malformed-call-handed-back'));
  moved.world.snapshot.viewport = { west: 138, south: 34, east: 141, north: 37 };
  const red = (await LAB.evaluateCassettes([moved], { P, sets: SETS }))[0];
  assert.ok(red.problems.some((p) => /the map grades mismatch; recorded match/.test(p)), red.problems.join(' | '));
  /* a replay that diverged does not grade the recorded map as this run's */
  const div = clone(CASSETTES.find((c) => c.id === 'tokaido-route-answered'));
  div.golden.text = 'something else';
  const d = (await LAB.evaluateCassettes([div], { P, sets: SETS }))[0];
  assert.equal(d.judged.metrics.map.verdict, 'unobserved');
  assert.match(LAB.renderReplay(res), /\| map \|[\s\S]*Map axis in the replayed set: \d+ match \/ \d+ mismatch \/ \d+ unobserved/);
});

/* ══ ⑧ THE REPORT — NIGHT AND TIME SERIES — CARRIES THE MAP AXIS ════════════════════════════════════════ */
test('atlas-eval-map-state ⑧ the nightly report and its history read the map axis apart from the answers', () => {
  const turn = (id, map, cat = 'distance') => ({ id, lang: 'jp', text: id, category: cat, capabilities: ['routing.route'], measured: true, failures: [],
    metrics: { grade: { verdict: 'correct', expected: '', stated: [] }, map: { verdict: map, criteria: [{ criterion: 'view', verdict: map, detail: 'd' }] }, reached: null, zeroOps: false, cut: false, noReply: false, overBudget: false, secondOfSameOp: 0, operations: 1, stopped: 'answered' } });
  const turns = [turn('a', 'match'), turn('b', 'mismatch'), turn('c', 'unobserved', 'date')];
  const M = J.metricsOf(turns, []);
  const report = { verdict: 'ok', url: 'u', when: '2026-10-01T00:00:00Z', metrics: M, turns, probes: [], regressions: [], improvements: [], previous: null };
  const md = J.renderMarkdown(report);
  assert.match(md, /## Map — the final map against the state the question asks for/);
  assert.match(md, /right: \*\*1 \/ 2\*\* observed · wrong: 1 · unobserved: 1/);
  assert.match(md, /\* map: mismatch — view mismatch \(d\)/);
  const row = LAB.summaryOf(report);
  assert.deepEqual(row.map, [1, 2]);
  assert.equal(row.mapUnobserved, 1);
  assert.deepEqual(row.mapByCategory.date, [0, 0], 'a category whose maps were all unobserved has no rate, not 0%');
  const trend = LAB.renderTrend([row, row], 5);
  assert.match(trend, /\| map right \(observed\) \| map unobserved \|/);
  assert.match(trend, /### Map by kind of question — final map right of the observed/);
  assert.match(trend, /\| distance \| 1\/2 \| 1\/2 \|/);
  /* an older night with no map axis reads as no data, not as 0 */
  const old = Object.assign({}, row, { map: undefined, mapUnobserved: undefined, mapByCategory: undefined });
  assert.match(LAB.renderTrend([old], 1), /\| — \| — \|/);
});
