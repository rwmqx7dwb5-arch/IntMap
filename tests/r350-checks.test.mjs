/* ============================================================================
 *  R350 — the final answer was a STRING, so nothing could be compared with anything
 * ----------------------------------------------------------------------------
 *  Reported: one Atlas answer about the Chinese economy that opened with 「巨大な国内市場よりも
 *  製造業・投資・輸出」 over a body whose own figures make consumption the largest component of BOTH
 *  demand and growth; that used one word 「支えている」 for 構成比 / 成長寄与 / 供給能力; that chained
 *  「工業付加価値」 onto 「規模以上工業の増加率」 as if they were one series; that printed a URL nobody
 *  had ever fetched; and that led with 「⚠ 実行できなかった操作が 1 件あります」 because a flyTo Atlas had
 *  added ITSELF did not land.
 *
 *  ⚠ NONE OF THOSE WERE DECIDABLE BEFORE THIS ROUND, and that is the finding. `analysis` returned
 *  prose; the citation was a `SOURCES:` line peeled off the end with a regular expression; the
 *  places were a `PLACES:` JSON trailer peeled off the end with another; the call's own metadata was
 *  read from `window._aiLastMeta`, a global whichever call answers LAST overwrites. A string has no
 *  lead to compare with its body, no dimension, no series and no provenance — so every rule below
 *  had nothing to run against.
 *
 *  What this file proves, in the order the answer is built:
 *
 *    ① the contract exists, and its two copies (client + ai-proxy) agree
 *    ② a URL is judged once, by one function, and a fabricated host is refused
 *    ③ the registry is bound to ONE call — citations cannot swap between concurrent answers
 *    ④ every audit code can be made to go RED from a correct answer (a gate never seen red
 *      proves nothing — #R318 ②)
 *    ⑤ the China fixture: the meanings stay apart and the two series do not join
 *    ⑥ the pipeline spends ONE call on the valid path, at most one repair, then degrades
 *    ⑦ a URL the model wrote is not a link, and 「Web検証済み」 is a fact rather than a heading
 *    ⑧ goalImpact: whose goal an action served, so a courtesy that failed is not a failed turn
 *    ⑨ the mechanisms this round removes are GONE from the source — not merely unused
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

/* ⚠ ONE EXPORTED FACTORY PER FILE — tests/r175 ③. A js/ module may hold no private top-level
   declaration and no export that nothing imports by name, so each of these files publishes exactly
   one factory and everything else lives inside it. */
const EV = (await import('../js/atlas-evidence.js')).makeAtlasEvidence();
const CT = (await import('../js/atlas-answer-contract.js')).makeAtlasAnswerContract();
const AU = (await import('../js/atlas-answer-audit.js')).makeAtlasAnswerAudit();
const RN = (await import('../js/atlas-answer-render.js')).makeAtlasAnswerRender();
const PL = (await import('../js/atlas-answer-pipeline.js')).makeAtlasAnswerPipeline();
const { makeAtlasPlanner } = await import('../js/atlas-planner.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasResults } = await import('../js/atlas-results.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');

/* ══ THE FIXTURE ═════════════════════════════════════════════════════════════════════════════════
   ⚠ FROZEN NUMBERS, NOT A CLAIM ABOUT THE WORLD. These figures exist to test whether the code can
   tell 構成比 from 成長寄与 and one statistical series from another. They are labelled
   `fixture-2025` precisely so nobody mistakes them for the current national accounts. */
const FIXTURE = {
  demandShares: { finalConsumption: 56.9, capitalFormation: 38.9, netExports: 4.2, unit: 'percent_of_gdp', period: 'fixture-2025' },
  growthContributions: { finalConsumption: 2.6, capitalFormation: 0.8, netExports: 1.6, unit: 'percentage_points', period: 'fixture-2025' },
  industrialSeries: [
    { seriesId: 'gdp_manufacturing_value_added', value: 34.67, unit: 'trillion_CNY' },
    { seriesId: 'above_designated_size_manufacturing_growth', value: 6.4, unit: 'percent_yoy' },
  ],
};

function fixtureRegistry(opts) {
  opts = opts || {};
  const reg = EV.makeEvidenceRegistry({ callId: opts.callId || 'call-1', turnId: 't1', retrievedAt: 'fixture-2025-06-01' });
  reg.addAppData({
    title: 'Demand-side composition of GDP', publisher: 'IntMap fixture', validTime: FIXTURE.demandShares.period,
    supportFacts: [
      { seriesId: 'demand.final_consumption_share', concept: 'final consumption', value: FIXTURE.demandShares.finalConsumption, unit: FIXTURE.demandShares.unit, basis: 'current_price', geography: 'China', period: FIXTURE.demandShares.period },
      { seriesId: 'demand.capital_formation_share', concept: 'capital formation', value: FIXTURE.demandShares.capitalFormation, unit: FIXTURE.demandShares.unit, basis: 'current_price', geography: 'China', period: FIXTURE.demandShares.period },
      { seriesId: 'demand.net_exports_share', concept: 'net exports', value: FIXTURE.demandShares.netExports, unit: FIXTURE.demandShares.unit, basis: 'current_price', geography: 'China', period: FIXTURE.demandShares.period },
    ],
  });
  reg.addAppData({
    title: 'Contributions to GDP growth', publisher: 'IntMap fixture', validTime: FIXTURE.growthContributions.period,
    supportFacts: [
      { seriesId: 'growth.final_consumption_contribution', concept: 'final consumption', value: FIXTURE.growthContributions.finalConsumption, unit: FIXTURE.growthContributions.unit, basis: 'real', geography: 'China', period: FIXTURE.growthContributions.period },
      { seriesId: 'growth.capital_formation_contribution', concept: 'capital formation', value: FIXTURE.growthContributions.capitalFormation, unit: FIXTURE.growthContributions.unit, basis: 'real', geography: 'China', period: FIXTURE.growthContributions.period },
      { seriesId: 'growth.net_exports_contribution', concept: 'net exports', value: FIXTURE.growthContributions.netExports, unit: FIXTURE.growthContributions.unit, basis: 'real', geography: 'China', period: FIXTURE.growthContributions.period },
    ],
  });
  reg.addAppData({
    title: 'Industry series', publisher: 'IntMap fixture', validTime: FIXTURE.demandShares.period,
    supportFacts: FIXTURE.industrialSeries.map((s) => ({
      seriesId: s.seriesId, concept: s.seriesId, value: s.value, unit: s.unit,
      basis: s.unit === 'trillion_CNY' ? 'current_price' : 'real', geography: 'China', period: FIXTURE.demandShares.period,
    })),
  });
  return reg;
}

/* A correct answer over that fixture. Everything below mutates ONE field of it. */
function goodAnswer() {
  return CT.normalizeAnswer({
    directAnswer: {
      text: '需要面では最終消費が最大で、規模そのものを可能にしているのは製造能力・供給網・資本動員力という別の軸です。',
      claimIds: ['c1', 'c6'],
    },
    sections: [
      { id: 's1', heading: '需要面の構成', blocks: [{ type: 'paragraph', text: '需要面の内訳です。', claimIds: ['c1', 'c2', 'c3'] }] },
      { id: 's2', heading: '成長への寄与', blocks: [{ type: 'paragraph', text: '寄与度の内訳です。', claimIds: ['c4'] }] },
      { id: 's3', heading: '構造的な供給能力', blocks: [{ type: 'paragraph', text: '供給側の基盤です。', claimIds: ['c5', 'c6'] }] },
    ],
    limitations: ['固定した検証用データに基づく数値です。'],
    claims: [
      { id: 'c1', text: '需要面では最終消費が56.9%で最大です。', claimType: 'fact', importance: 'primary', dimension: 'share', confidence: 'high', evidenceIds: ['e1'], metric: { seriesId: 'demand.final_consumption_share', concept: 'final consumption', value: 56.9, unit: 'percent_of_gdp', basis: 'current_price', geography: 'China', period: 'fixture-2025' } },
      { id: 'c2', text: '資本形成は38.9%です。', claimType: 'fact', importance: 'major', dimension: 'share', confidence: 'high', evidenceIds: ['e1'], metric: { seriesId: 'demand.capital_formation_share', concept: 'capital formation', value: 38.9, unit: 'percent_of_gdp', basis: 'current_price', geography: 'China', period: 'fixture-2025' } },
      { id: 'c3', text: '純輸出は4.2%です。', claimType: 'fact', importance: 'major', dimension: 'share', confidence: 'high', evidenceIds: ['e1'], metric: { seriesId: 'demand.net_exports_share', concept: 'net exports', value: 4.2, unit: 'percent_of_gdp', basis: 'current_price', geography: 'China', period: 'fixture-2025' } },
      { id: 'c4', text: '成長寄与では最終消費が2.6ポイントです。', claimType: 'fact', importance: 'major', dimension: 'growth_contribution', confidence: 'high', evidenceIds: ['e2'], metric: { seriesId: 'growth.final_consumption_contribution', concept: 'final consumption', value: 2.6, unit: 'percentage_points', basis: 'real', geography: 'China', period: 'fixture-2025' } },
      { id: 'c5', text: '製造業付加価値は34.67兆元です。', claimType: 'fact', importance: 'major', dimension: 'level', confidence: 'high', evidenceIds: ['e3'], metric: { seriesId: 'gdp_manufacturing_value_added', concept: 'manufacturing value added', value: 34.67, unit: 'trillion_CNY', basis: 'current_price', geography: 'China', period: 'fixture-2025' } },
      { id: 'c6', text: '巨大な製造能力と供給網が規模を支えていると考えられます。', claimType: 'judgment', importance: 'primary', dimension: 'structural_capacity', confidence: 'medium', evidenceIds: [], basedOn: ['c5'] },
    ],
    places: [],
  }, { turnId: 't1', callId: 'call-1', language: 'Japanese', temporalMode: 'current' });
}

const CTX = { webUsed: true, temporalMode: 'current' };
const codes = (a) => a.errors.map((e) => e.code);
function auditGood() { return AU.auditAnswer(goodAnswer(), fixtureRegistry(), CTX); }

/* ══ ① THE CONTRACT, AND ITS TWO COPIES ══════════════════════════════════════════════════════ */

test('R350 ①a: the answer schema on the client and in ai-proxy are the same schema', () => {
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  const m = proxy.match(/const ANSWER_SCHEMA = (\{[\s\S]*?\n\});/);
  assert.ok(m, 'ai-proxy has no ANSWER_SCHEMA — the server no longer owns the shape it enforces');
  /* ⚠ COMPARED AS STRUCTURE, NOT AS TEXT. #R323 found three capability tables that all described one
     engine and none of which had ever been compared; a whitespace-insensitive string match would have
     re-created exactly that. */
  const server = JSON.parse(m[1]
    .replace(/(\w+):/g, '"$1":')
    .replace(/"(https?)":/g, '$1:')
    .replace(/,(\s*[}\]])/g, '$1'));
  assert.deepEqual(server, JSON.parse(JSON.stringify(CT.ANSWER_SCHEMA)),
    'js/atlas-answer-contract.js and supabase/functions/ai-proxy/index.ts describe different answers');
});

test('R350 ①b: the model is given no field in which to put a URL', () => {
  const s = JSON.stringify(CT.ANSWER_SCHEMA).toLowerCase();
  assert.ok(!/"url"|"link"|"href"|"source(name|url)"/.test(s), 'the schema offers the model somewhere to write a URL');
  assert.ok(/evidenceids/.test(s), 'the schema has no evidenceIds — nothing ties a claim to a record');
});

test('R350 ①c: the six meanings of 「支えている」 are an enumeration, not prose', () => {
  ['share', 'growth_contribution', 'structural_capacity', 'level', 'trend', 'causal_driver']
    .forEach((d) => assert.ok(CT.DIMENSIONS.includes(d), `dimension ${d} is missing`));
});

test('R350 ①d: a percentage and a percentage point are different classes', () => {
  assert.equal(CT.unitClass('percent_of_gdp'), 'percent');
  assert.equal(CT.unitClass('percentage_points'), 'percentage_point');
  assert.equal(CT.unitClass('ポイント'), 'percentage_point');
  assert.equal(CT.unitClass('trillion_CNY'), 'currency');
  assert.equal(CT.unitClass('percent_yoy'), 'percent');
});

test('R350 ①e: a figure is read out of the sentence with its unit, and a bare year is not a figure', () => {
  const t = CT.numericTokens('2025年の最終消費は56.9%、寄与は2.6ポイントでした。');
  assert.deepEqual(t.map((x) => x.value), [56.9, 2.6], 'the year was counted as a measurement');
  assert.deepEqual(t.map((x) => x.unitClass), ['percent', 'percentage_point']);
});

/* ══ ② ONE JUDGE OF A URL ════════════════════════════════════════════════════════════════════ */

test('R350 ②a: the fabricated host the reader was shown is refused', () => {
  assert.equal(EV.canonicalizeUrl('https://stats.gov.stats.gov.cn/tjsj/').reason, 'doubled_host');
  assert.equal(EV.looksDoubledHost('stats.gov.stats.gov.cn'), true);
  /* and real host names are not */
  ['www.stats.gov.cn', 'news.bbc.co.uk', 'm.media-amazon.com', 'data.worldbank.org', 'ec.europa.eu']
    .forEach((h) => assert.equal(EV.looksDoubledHost(h), false, h + ' was called a doubled host'));
});

test('R350 ②b: every rejection has its own reason, and none of them is a shrug', () => {
  const cases = [
    ['', 'empty'],
    ['ftp://example.com/x', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['https://user:pw@example.com/x', 'credentials'],
    ['https://example.com/a\nb', 'control_char'],
    ['https://localhost/x', 'private_host'],
    ['https://127.0.0.1/x', 'private_host'],
    ['https://169.254.169.254/latest/meta-data/', 'private_host'],
    ['https://metadata.google.internal/x', 'private_host'],
    ['https://box.internal/x', 'private_host'],
    ['https://example/x', 'no_tld'],
    ['https://example.com/' + 'x'.repeat(800), 'too_long'],
  ];
  cases.forEach(([u, why]) => {
    const r = EV.canonicalizeUrl(u);
    assert.equal(r.ok, false, u + ' was accepted');
    assert.equal(r.reason, why, u + ' was refused for the wrong reason');
  });
});

test('R350 ②c: the identity of a document ignores the campaign it arrived through', () => {
  const a = EV.canonicalizeUrl('https://Example.COM/a?utm_source=x&id=7#frag');
  const b = EV.canonicalizeUrl('https://example.com/a?id=7');
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.key, b.key, 'the same article registered twice');
  assert.ok(a.url.includes('utm_source'), 'the URL that is OPENED lost the publisher\'s own parameters');
  const reg = EV.makeEvidenceRegistry({ callId: 'c', retrievedAt: 'now' });
  reg.addClientSources([{ url: 'https://example.com/a?utm_source=x', title: 'A' }, { url: 'https://example.com/a', title: 'A again' }]);
  assert.equal(reg.size(), 1, 'the two spellings of one article became two records');
});

test('R350 ②d: a URL nothing fetched cannot become a record', () => {
  const reg = EV.makeEvidenceRegistry({ callId: 'c', retrievedAt: 'now' });
  assert.equal(reg.addClientSources([{ url: 'https://stats.gov.stats.gov.cn/x', title: 'invented' }]).length, 0);
  assert.equal(reg.size(), 0);
  assert.equal(reg.rejected()[0].reason, 'doubled_host');
});

/* ══ ③ ONE CALL, ONE REGISTRY ════════════════════════════════════════════════════════════════ */

test('R350 ③a: 「Web検証済み」 requires the hosted search to have RUN this call', () => {
  const reg = EV.makeEvidenceRegistry({ callId: 'c1', retrievedAt: 'now' });
  const cites = [{ url: 'https://example.org/a', title: 'A', startIndex: 0, endIndex: 5 }];
  assert.equal(reg.addProviderCitations(cites, { callId: 'c1', webUsed: false }).length, 0, 'a citation was admitted although no search ran');
  assert.equal(reg.addProviderCitations(cites, { callId: 'c1', webUsed: true }).length, 1);
  assert.equal(reg.all()[0].origin, 'hosted_web');
  assert.deepEqual(reg.all()[0].providerCitation, { startIndex: 0, endIndex: 5 });
});

test('R350 ③b: a citation stamped with another call has nowhere to land', () => {
  const reg = EV.makeEvidenceRegistry({ callId: 'c1', retrievedAt: 'now' });
  assert.equal(reg.addProviderCitations([{ url: 'https://example.org/a', title: 'A' }], { callId: 'OTHER', webUsed: true }).length, 0);
  assert.equal(reg.size(), 0, 'a concurrent answer\'s citation was absorbed');
  /* the bounded repair is the ONE exception, and it is explicit */
  reg.allowCall('c1-repair');
  assert.equal(reg.addProviderCitations([{ url: 'https://example.org/a', title: 'A' }], { callId: 'c1-repair', webUsed: true }).length, 1);
});

test('R350 ③c: hosted_web evidence with no search this call is an audit error', () => {
  const reg = fixtureRegistry();
  reg.addProviderCitations([{ url: 'https://example.org/a', title: 'A' }], { callId: 'call-1', webUsed: true });
  const a = AU.auditAnswer(goodAnswer(), reg, { webUsed: false, temporalMode: 'current' });
  assert.ok(codes(a).includes('web.unverified_label'), 'the heading would have been printed anyway');
});

/* ══ ④ EVERY CODE CAN BE MADE TO GO RED ══════════════════════════════════════════════════════ */

test('R350 ④a: the correct answer passes cleanly', () => {
  const a = auditGood();
  assert.deepEqual(codes(a), [], 'the reference answer does not pass its own audit: ' + JSON.stringify(a.errors, null, 1));
  assert.equal(a.status, 'passed');
});

/* Each row: a name, a mutation of the good answer (or registry), and the code it must raise. */
const MUTATIONS = [
  ['a primary claim loses its evidence', (e) => { e.claims[0].evidenceIds = []; }, 'evidence.primary_unsupported'],
  ['a share is declared in percentage points', (e) => { e.claims[0].metric.unit = 'percentage_points'; }, 'metric.percent_vs_point_confusion'],
  ['a growth contribution is declared in percent', (e) => { e.claims[3].metric.unit = 'percent'; }, 'metric.percent_vs_point_confusion'],
  ['the period is moved to another year', (e) => { e.claims[0].metric.period = 'fixture-2024'; }, 'metric.period_mismatch'],
  ['two series are chained inside one sentence', (e) => { e.claims[4].text = '製造業付加価値は34.67兆元で、規模以上工業の増加率は6.4%です。'; }, 'series.mixed_series_in_claim'],
  ['a nominal level and a real rate share a sentence', (e) => { e.claims[4].text = '製造業付加価値は34.67兆元で、消費の寄与は2.6ポイントです。'; e.claims[4].evidenceIds = ['e2', 'e3']; }, 'series.basis_mixed'],
  ['a figure matches no recorded fact', (e) => { e.claims[0].text = '需要面では最終消費が61.4%で最大です。'; }, 'metric.value_unsupported'],
  ['the declared series is not the one the figures came from', (e) => { e.claims[0].metric.seriesId = 'demand.capital_formation_share'; }, 'series.unsupported_series'],
  ['a weighty claim states no dimension', (e) => { e.claims[1].dimension = ''; }, 'dimension.unspecified'],
  ['a numeric claim carries no metric at all', (e) => { e.claims[1].metric = null; }, 'metric.missing'],
  ['a numeric claim names no series', (e) => { e.claims[1].metric.seriesId = ''; }, 'metric.missing_series_id'],
  ['a numeric claim names no period', (e) => { e.claims[1].metric.period = ''; }, 'metric.missing_period'],
  ['a judgment is worded as a fact', (e) => { e.claims[5].text = '製造能力と供給網が規模を支えています。'; }, 'evidence.inference_as_fact'],
  ['a judgment rests on nothing', (e) => { e.claims[5].basedOn = []; }, 'evidence.inference_without_basis'],
  ['the answer cites an evidence id that does not exist', (e) => { e.claims[0].evidenceIds = ['e99']; }, 'schema.unknown_evidence_ref'],
  ['a block points at a claim that does not exist', (e) => { e.answer.sections[0].blocks[0].claimIds = ['c99']; }, 'schema.unknown_claim_ref'],
  ['two claims share an id', (e) => { e.claims[1].id = 'c1'; }, 'schema.duplicate_id'],
  ['nothing is primary', (e) => { e.claims.forEach((c) => { c.importance = 'major'; }); }, 'schema.no_primary_claim'],
  ['the opening sentence is empty', (e) => { e.answer.directAnswer.text = ''; }, 'schema.empty_direct_answer'],
  ['the opening sentence rests on no primary claim', (e) => { e.answer.directAnswer.claimIds = ['c2']; }, 'lead.not_primary'],
  ['the opening sentence rules one thing over another', (e) => { e.answer.directAnswer.text = '中国経済を実際に支えているのは、巨大な国内市場よりも製造業・投資・輸出です。'; e.answer.directAnswer.claimIds = ['c6']; }, 'lead.exclusive_without_evidence'],
  ['the body outranks the superlative the lead rests on', (e) => { e.claims[1].text = '資本形成が38.9%で最大です。'; }, 'contradiction.superlative_beaten'],
  ['two claims give one series two values', (e) => { e.claims[1].metric.seriesId = 'demand.final_consumption_share'; e.claims[1].text = '最終消費は38.9%です。'; }, 'contradiction.value_mismatch'],
  ['the same series rises and falls in one answer', (e) => { e.claims[1].metric.seriesId = 'demand.final_consumption_share'; e.claims[1].metric.value = 56.9; e.claims[1].text = '最終消費は56.9%へ減少しました。'; e.claims[0].text = '需要面では最終消費が56.9%へ増加しました。'; }, 'contradiction.direction_flip'],
  ['a URL is written into the prose', (e) => { e.answer.sections[0].blocks[0].text = '詳細は https://example.com/a を参照。'; }, 'url.raw_in_prose'],
  ['a host name is written into the prose', (e) => { e.answer.sections[0].blocks[0].text = 'stats.gov.stats.gov.cn によると需要面の内訳です。'; }, 'url.host_in_prose'],
];

MUTATIONS.forEach(([name, mutate, code]) => {
  test('R350 ④ mutation — ' + name + ' → ' + code, () => {
    const clean = auditGood();
    assert.deepEqual(codes(clean), [], 'the baseline must be clean before a mutation means anything');
    const e = goodAnswer();
    mutate(e);
    const a = AU.auditAnswer(e, fixtureRegistry(), CTX);
    assert.ok(codes(a).includes(code), 'expected ' + code + ', got ' + JSON.stringify(codes(a)));
  });
});

test('R350 ④b: every code the audit can raise is declared with a severity', () => {
  const src = read('js/atlas-answer-audit.js');
  const raised = new Set([...src.matchAll(/push\('([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(raised.size >= 20, 'only ' + raised.size + ' codes are raised — the parser is reading the wrong thing');
  raised.forEach((c) => assert.ok(AU.AUDIT_CODES[c], c + ' is raised but has no declared severity'));
  Object.keys(AU.AUDIT_CODES).forEach((c) => assert.ok(raised.has(c), c + ' is declared but nothing can raise it'));
});

/* ══ ⑤ THE CHINA FIXTURE: THE MEANINGS STAY APART ════════════════════════════════════════════ */

test('R350 ⑤a: on the demand side consumption is the largest, and saying so is not an error', () => {
  const a = auditGood();
  assert.deepEqual(codes(a), []);
  const shares = goodAnswer().claims.filter((c) => c.dimension === 'share');
  const top = shares.slice().sort((x, y) => y.metric.value - x.metric.value)[0];
  assert.equal(top.metric.concept, 'final consumption', 'the fixture no longer makes consumption the largest share');
});

test('R350 ⑤b: net exports may be important without being most of GDP', () => {
  const e = goodAnswer();
  e.claims[2].text = '純輸出が4.2%で最大です。';                        /* claims the top share at 4.2 */
  const a = AU.auditAnswer(e, fixtureRegistry(), CTX);
  assert.ok(codes(a).includes('contradiction.superlative_beaten'));
});

test('R350 ⑤c: the value-added level and the industrial growth rate are not one series', () => {
  const reg = fixtureRegistry();
  const e = goodAnswer();
  e.claims[4].text = '製造業付加価値は34.67兆元、規模以上工業の増加率は6.4%です。';
  const a = AU.auditAnswer(e, reg, CTX);
  const seen = codes(a);
  assert.ok(seen.includes('series.mixed_series_in_claim'), JSON.stringify(seen));
  /* and split into two claims, each with its own series, the same figures are fine */
  const ok = goodAnswer();
  ok.claims.push({
    id: 'c7', text: '規模以上工業の増加率は6.4%です。', claimType: 'fact', importance: 'major',
    dimension: 'trend', confidence: 'high', evidenceIds: ['e3'], basedOn: [],
    metric: { seriesId: 'above_designated_size_manufacturing_growth', concept: 'industrial output growth', value: 6.4, unit: 'percent_yoy', basis: 'real', geography: 'China', period: 'fixture-2025', adjustment: '' },
  });
  ok.answer.sections[2].blocks[0].claimIds.push('c7');
  assert.deepEqual(codes(AU.auditAnswer(ok, fixtureRegistry(), CTX)), []);
});

test('R350 ⑤d: the reported opening sentence does not survive the audit', () => {
  const e = goodAnswer();
  e.answer.directAnswer.text = '中国経済を実際に支えているのは、巨大な国内市場よりも製造業・投資・輸出です。';
  e.answer.directAnswer.claimIds = ['c6'];
  const seen = codes(AU.auditAnswer(e, fixtureRegistry(), CTX));
  assert.ok(seen.includes('lead.exclusive_without_evidence'),
    'an exclusive verdict passed with one measured side: ' + JSON.stringify(seen));
});

/* ══ ⑥ ONE CALL, ONE REPAIR, THEN DEGRADE ════════════════════════════════════════════════════ */

function scriptedAsk(replies) {
  const calls = [];
  return {
    calls,
    ask: async (prompt, system, opts) => {
      calls.push({ task: opts.task, callId: opts.callId, turnId: opts.turnId, repair: /AUDIT FINDINGS/.test(prompt) });
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { text: JSON.stringify(r), meta: { webUsed: false }, citations: [], callId: opts.callId };
    },
  };
}
const RAW_GOOD = () => JSON.parse(JSON.stringify({
  directAnswer: goodAnswer().answer.directAnswer,
  sections: goodAnswer().answer.sections,
  limitations: goodAnswer().answer.limitations,
  claims: goodAnswer().claims,
  places: [{ name: 'Shenzhen', country: 'China', kind: 'city', claimIds: ['c5'] }],
}));
function pipelineOpts(ask) {
  return {
    question: '中華人民共和国は世界有数の経済規模。実際に支えているのは何？',
    dataBlock: '[TIME CONTEXT]\nfixture\n\n', systemPrompt: 'SYS', language: 'Japanese',
    temporalMode: 'current', requestedOutputs: ['explanation'], turnId: 't1', webMode: 'auto',
    clientSources: [], appFacts: [], retrievedAt: 'fixture-2025-06-01',
    ask, parseJSON: (t) => { try { return JSON.parse(t); } catch (_) { return null; } },
  };
}
/* the pipeline builds its own registry, so the fixture facts arrive as appFacts */
function withFixtureFacts(o) {
  o.appFacts = fixtureRegistry().all().map((r) => ({ title: r.title, publisher: r.publisher, validTime: r.validTime, supportFacts: r.supportFacts }));
  return o;
}

test('R350 ⑥a: a valid answer costs exactly one model call', async () => {
  const s = scriptedAsk([RAW_GOOD()]);
  const out = await PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(s.ask)));
  assert.equal(s.calls.length, 1, 'the valid path spent ' + s.calls.length + ' calls');
  assert.equal(out.env.audit.status, 'passed');
  assert.equal(s.calls[0].task, 'analysis_structured');
});

test('R350 ⑥b: a failed audit buys exactly ONE repair, on the same turn key', async () => {
  const bad = RAW_GOOD(); bad.claims[0].evidenceIds = [];
  const s = scriptedAsk([bad, RAW_GOOD()]);
  const out = await PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(s.ask)));
  assert.equal(s.calls.length, 2, 'expected one repair, got ' + (s.calls.length - 1));
  assert.equal(s.calls[1].repair, true, 'the second call was not aimed at the findings');
  assert.equal(s.calls[1].turnId, 't1', 'the repair opened a new turn — it would cost a second daily use');
  assert.notEqual(s.calls[1].callId, s.calls[0].callId, 'the repair reused the first call\'s id');
  assert.equal(out.env.audit.status, 'passed');
});

test('R350 ⑥c: two failures degrade in code rather than showing unverified prose', async () => {
  const bad = RAW_GOOD(); bad.claims[0].evidenceIds = [];
  const s = scriptedAsk([bad, bad]);
  const out = await PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(s.ask)));
  assert.equal(s.calls.length, PL.MAX_MODEL_CALLS, 'the repair loop is not bounded at ' + PL.MAX_MODEL_CALLS);
  assert.equal(out.env.audit.status, 'degraded');
  assert.ok(!out.env.claims.some((c) => c.id === 'c1'), 'the claim the audit rejected is still in the answer');
  assert.ok(String(out.env.answer.directAnswer.text || '').trim(), 'degrading emptied the answer instead of shortening it');
});

test('R350 ⑥d: a repair that is WORSE than the original is refused', async () => {
  const bad = RAW_GOOD(); bad.claims[0].evidenceIds = [];
  const worse = RAW_GOOD();
  worse.claims.forEach((c) => { c.evidenceIds = []; c.dimension = ''; });
  const s = scriptedAsk([bad, worse]);
  const out = await PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(s.ask)));
  assert.equal(out.audit.errors.length <= AU.auditAnswer(CT.normalizeAnswer(worse, {}), fixtureRegistry(), CTX).errors.length, true,
    'the newer, worse answer replaced the better one');
});

test('R350 ⑥e: two answers in flight keep their own citations', async () => {
  /* ⚠ THIS IS THE TEST THE OLD SHAPE COULD NOT PASS. The analyse path read window._aiLastCitations
     AFTER awaiting — the value belongs to whichever call answered LAST, not to this one. */
  const mk = (host, delay) => async (prompt, system, opts) => {
    await new Promise((r) => setTimeout(r, delay));
    return { text: JSON.stringify(RAW_GOOD()), meta: { webUsed: true }, citations: [{ url: 'https://' + host + '/a', title: host }], callId: opts.callId };
  };
  const [a, b] = await Promise.all([
    PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(mk('alpha.example.org', 40)))),
    PL.runStructuredAnswer(withFixtureFacts(pipelineOpts(mk('beta.example.org', 5)))),
  ]);
  const hostsOf = (r) => r.registry.all().filter((x) => x.origin === 'hosted_web').map((x) => x.host);
  assert.deepEqual(hostsOf(a), ['alpha.example.org']);
  assert.deepEqual(hostsOf(b), ['beta.example.org']);
});

/* ══ ⑦ WHAT REACHES THE SCREEN ═══════════════════════════════════════════════════════════════ */

const UI = {
  L: (en) => en,
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  /* a deliberately NAIVE markdown pass that linkifies bare URLs — the same thing mdMini() does.
     If the renderer let a model URL through, this would turn it into an anchor and the test fails. */
  mdMini: (s) => String(s).replace(/(https?:\/\/[^\s<)"']+)/g, '<a href="$1">$1</a>'),
  linkCards: (list) => (list || []).map((c) => '<a class="atl-lc" href="' + c.url + '">' + c.title + '</a>').join(''),
};

test('R350 ⑦a: a URL the model wrote never becomes a link', () => {
  const e = goodAnswer();
  e.answer.sections[0].blocks[0].text = '詳細は https://stats.gov.stats.gov.cn/tjsj/ と [ここ](https://evil.example/x) を参照。';
  const html = RN.renderAnswer(e, fixtureRegistry(), UI);
  assert.ok(!/href="https?:\/\/stats\.gov/.test(html), 'the invented URL was rendered as a link');
  assert.ok(!/evil\.example/.test(html), 'a markdown link the model wrote survived');
  assert.ok(html.includes('ここ'), 'the readable half of the link was thrown away with it');
});

test('R350 ⑦b: the source cards come from the registry, and 「Web検証済み」 only from hosted_web', () => {
  const reg = fixtureRegistry();
  reg.addClientSources([{ url: 'https://gathered.example.org/a', title: 'gathered' }]);
  reg.addProviderCitations([{ url: 'https://verified.example.org/b', title: 'verified' }], { callId: 'call-1', webUsed: true });
  const e = goodAnswer();
  e.claims[0].evidenceIds = ['e4', 'e5'];
  const html = RN.renderAnswer(e, reg, UI);
  assert.ok(html.includes('Web-verified sources'), 'a hosted-web citation was not filed as web-verified');
  /* ⚠ THE WHOLE href, MEMBERSHIP IN A SET — never a substring test against a host name, and never
     `.includes()` at all. `html.includes('verified.example.org')` is satisfied by
     `https://evil.example/?x=verified.example.org`, which is exactly the confusion this round
     exists to end; CodeQL flags it as js/incomplete-url-substring-sanitization and is right to.
     `Array.prototype.includes` on the extracted hrefs is already exact, but the rule cannot tell
     the two `includes` apart — so the check is written as set membership, which is unambiguous to
     the reader and to the analyser at once. */
  const hrefs = new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  const shown = JSON.stringify([...hrefs]);
  assert.ok(hrefs.has('https://verified.example.org/b'), 'the web-verified card is missing: ' + shown);
  assert.ok(hrefs.has('https://gathered.example.org/a'), 'the gathered article is missing: ' + shown);
  /* with no hosted-web record the heading must not appear at all */
  const reg2 = fixtureRegistry();
  reg2.addClientSources([{ url: 'https://gathered.example.org/a', title: 'gathered' }]);
  const e2 = goodAnswer(); e2.claims[0].evidenceIds = ['e4'];
  assert.ok(!RN.renderAnswer(e2, reg2, UI).includes('Web-verified sources'), 'the heading was printed with nothing behind it');
});

test('R350 ⑦c: a figure from IntMap\'s own data still shows a citation', () => {
  const html = RN.renderAnswer(goodAnswer(), fixtureRegistry(), UI);
  assert.match(html, /class="atl-cite atl-cite-data"/, 'app data was cited as nothing at all');
  assert.ok(!/href/.test(html.split('atl-cite-data')[0].split('atl-lead')[1] || ''), 'a record with no page was given a link anyway');
});

test('R350 ⑦d: a degraded answer says so, above the prose', () => {
  const e = goodAnswer();
  e.audit = { status: 'degraded', errors: [], warnings: [] };
  const html = RN.renderAnswer(e, fixtureRegistry(), UI);
  assert.ok(html.indexOf('Unverified statements were removed') >= 0, 'the reader is not told the answer was cut');
  assert.ok(html.indexOf('Unverified statements were removed') < html.indexOf('atl-lead'), 'the notice is below the answer it is about');
});

/* ══ ⑧ WHOSE GOAL DID THE ACTION SERVE ═══════════════════════════════════════════════════════ */

function planner() {
  const caps = makeAtlasCapabilities({});
  const k = installAtlasKernel({}, {}, { capabilities: makeAtlasCapabilities({}) });
  return makeAtlasPlanner({}, { WORLD_RE: /^world$/i, wctx: {}, capabilities: caps, results: makeAtlasResults({}), executor: k.executor || k.exec, state: k.state });
}

test('R350 ⑧a: a map move Atlas added itself is secondary; one the user asked for is primary', () => {
  const P = planner();
  const informational = P._requestProfile('中華人民共和国は世界有数の経済規模。実際に支えているのは何？');
  assert.equal(P.goalImpact(informational, { type: 'flyTo', place: 'China' }), 'secondary',
    'an unasked-for map move still counts against the turn');
  assert.equal(P.goalImpact(informational, { type: 'analyze', question: 'x' }), 'primary');

  const navigational = P._requestProfile('中国へ移動して');
  assert.equal(navigational.outputs.navigation, true, 'a navigation verb is not recognised as one');
  assert.equal(P.goalImpact(navigational, { type: 'flyTo', place: 'China' }), 'primary');

  const both = P._requestProfile('中国経済を説明し、地図も表示して');
  assert.equal(both.outputs.explanation && both.outputs.map, true);
  assert.equal(P.goalImpact(both, { type: 'flyTo', place: 'China' }), 'primary');
  assert.equal(P.goalImpact(both, { type: 'analyze', question: 'x' }), 'primary');
});

test('R350 ⑧b: the turn summary counts PRIMARY failures, and says the rest quietly', () => {
  const src = read('js/atlas-console.js');
  assert.match(src, /const primaryFails=fails\.filter\(/, 'the fail summary is still a plain count of failed actions');
  assert.match(src, /const secondaryFails=fails\.filter\(a=>a&&a\.__impact==='secondary'\)/, 'secondary failures are not separated');
  /* the leading warning is built from primaryFails, and the quiet note from secondaryFails */
  const head = src.match(/if\(primaryFails\.length\)\{[^\n]*\}/);
  assert.ok(head && /step\(s\) could not be completed/.test(head[0]), 'the leading warning no longer reads from primaryFails');
  assert.match(src, /if\(secondaryFails\.length\) body\+=/, 'a secondary failure is silent — 「map失敗を常に無視する」 is forbidden');
  /* and it is a NOTE appended to the body, never prepended to the head */
  assert.ok(src.indexOf("if(secondaryFails.length) body+=") > src.indexOf('if(primaryFails.length)'),
    'the quiet note is assembled before the answer it follows');
});

test('R350 ⑧c: every action is stamped with its goal impact as it runs', () => {
  const src = codeOnly(read('js/atlas-console.js'));
  assert.match(src, /a\.__impact=_PLANNER\.goalImpact\(_curProfile,a\)/, 'nothing records whose goal an action served');
});

/* ══ ⑨ THE OLD MECHANISMS ARE GONE ═══════════════════════════════════════════════════════════ */

test('R350 ⑨a: the SOURCES: line and the PLACES: trailer no longer exist', () => {
  const src = read('js/atlas-console.js');
  assert.ok(!/SOURCES\?\?\s*\[/.test(src) && !/SOURCES\?\\s\*\[:：\]/.test(src), 'the SOURCES regex is still there');
  assert.ok(!/replace\(\/\\n\?\\s\*PLACES/.test(src), 'the PLACES trailer is still peeled off the prose');
  assert.ok(!src.includes('output "SOURCES:'), 'the model is still told to write a SOURCES line');
  assert.ok(!src.includes('output "PLACES: "'), 'the model is still told to write a PLACES line');
});

test('R350 ⑨b: no Atlas answer reads the globals a concurrent call overwrites', () => {
  /* ⚠ COMMENTS STRIPPED FIRST. The replacement code explains what it replaced, and a check that
     greps the raw file finds its own epitaph and calls it a relapse. */
  const src = codeOnly(read('js/atlas-console.js'));
  const analyze = src.slice(src.indexOf('const sys2=_analysisSystemPrompt'), src.indexOf('const sys2=_analysisSystemPrompt') + 6000);
  assert.match(analyze, /runStructuredAnswer\(/, 'the analyse path does not go through the contract pipeline');
  assert.ok(!/_aiLastMeta|_aiLastCitations/.test(src),
    'an Atlas reply still reads window._aiLast* — whichever call answered LAST decides what it shows');
  assert.match(src, /_curPlanCites=/, 'the planner\'s citations are not carried from the call that produced them');
});

test('R350 ⑨c: the exported envelope carries the identity of the call it came from', () => {
  /* ⚠ THE ENVELOPE IS askAIJSONEnvelope AND NOT A NEW EXPORT, because js/app-body.js is one of the
     six files tests/r168 #8 budgets as «the shell» and origin/main sits ONE line under its ceiling:
     a new HOST member costs a getter PLUS a hoisted forwarding shim (tests/r169 #2 requires the shim
     to start its own line), and the shell has no room for two. It is also the right one — an analysis
     IS a JSON task. What was missing was never the function; it was the CALL IDENTITY, without which
     a caller cannot tell its own citations from a concurrent call's — exactly what
     window._aiLastCitations could never do. */
  const core = read('js/ai-core.js');
  assert.ok(core.includes('return {text, meta, citations, callId,'), 'the transport envelope does not carry its callId');
  assert.ok(core.includes('citations:env.citations, callId:env.callId, turnId:env.turnId, task:env.task }; }'),
    'the exported envelope drops the call identity on the way out');
  assert.ok(read('js/app-body.js').includes('get askAIJSONEnvelope()'), 'the host does not forward the envelope at all');
  const shell = ['index.html', 'src/main.js', 'src/vendor.js', 'js/app-body.js', 'js/geo-engine.js', 'js/lazy-modules.js']
    .map((f) => read(f)).join('\n').split('\n').length;
  /* ⚠ (#R386) the number lives in tests/r168 #8, where the reason for each rise is written down.
     This copy exists so a round that grows the shell HERE cannot pass by only looking at its own
     file — so it has to move with it. 8,000 → 8,020: see the measurement in tests/r168 #8. */
  assert.ok(shell < 8020, 'this round grew the app shell to ' + shell + ' lines — tests/r168 #8 budgets it');
});

test('R350 ⑨d: the proxy knows the task, budgets it, and refuses a shape the client cannot audit', () => {
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  assert.match(proxy, /"analysis_structured"/, 'the task is not in the allow-list — it would 400');
  assert.match(proxy, /analysis_structured: \d+,/, 'the task has no output budget');
  assert.match(proxy, /JSON_TASKS = new Set\(\[[^\]]*analysis_structured/, 'the task does not run in JSON mode');
  assert.match(proxy, /structuredAnswerOk\(out\.text\)/, 'a malformed structured answer is handed to the client as prose');
});

test('R350 ⑨e: the kernel stayed under its ceiling while gaining all of this', () => {
  const n = read('js/atlas-console.js').split(/\r?\n/).length;
  assert.ok(n < 5300, 'js/atlas-console.js is ' + n + ' lines — the ceiling is never raised (tests/r199 ⑤)');
});
