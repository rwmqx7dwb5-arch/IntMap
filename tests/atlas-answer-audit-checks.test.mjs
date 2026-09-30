/* ============================================================================
 *  js/atlas-answer-audit.js — the structured answer, its evidence, and the audit that reports
 * ----------------------------------------------------------------------------
 *  The answer contract and its server copy, the evidence registry bound to one call, every audit code
 *  made to go red (#R350), and the audit that reports instead of rewriting the answer (#R472).
 *  ⚠ tests/gate-parity-and-shards-checks reads THIS file's text and appends a line-ceiling probe to it
 *  in memory (the #R350 section's helpers).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r350-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
 *    ⑥ the pipeline spends ONE call (#R472 removed the repair and the degrade — tests/r472-checks)
 *    ⑦ a URL the model wrote is not a link, and 「Web検証済み」 is a fact rather than a heading
 *    ⑨ the mechanisms this round removes are GONE from the source — not merely unused
 *
 *  ⚠ ⑧ (goalImpact: whose goal an action served) is gone: #R406 deleted js/atlas-planner.js, and
 *  with it the request profile every impact verdict was read from. An action Atlas adds itself is
 *  now a tool call it chose, and the turn's account of it is the tool result.
 * ==========================================================================*/

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

/* ⚠ ONE EXPORTED FACTORY PER FILE — tests/r175 ③. A js/ module may hold no private top-level
   declaration and no export that nothing imports by name, so each of these files publishes exactly
   one factory and everything else lives inside it. */
const EV = (await import('../js/atlas-evidence.js')).makeAtlasEvidence();
const CT = (await import('../js/atlas-answer-contract.js')).makeAtlasAnswerContract();
const AU = (await import('../js/atlas-answer-audit.js')).makeAtlasAnswerAudit();
const RN = (await import('../js/atlas-answer-render.js')).makeAtlasAnswerRender();
const PL = (await import('../js/atlas-answer-pipeline.js')).makeAtlasAnswerPipeline();

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
  /* read, not run: supabase/functions/ai-proxy/index.ts is a Deno TypeScript module that node cannot
     import, so its schema literal is parsed out of the text and compared as structure. */
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
  /* read, not run: the claim is about every raise site in the audit — a site a fixture never reaches is
     invisible to a run, so the sites are enumerated from the source (④'s mutations run them). */
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

/* R350 ⑥b / ⑥c / ⑥d (the repair call, the degrade, and refusing a repair that is worse) removed in
   #R472: js/atlas-answer-pipeline.js no longer asks a second time and no longer rebuilds the answer
   from the claims that passed. Measured on the live site, the thing `degrade` was deleting was a
   CORRECT answer, condemned by `evidence.primary_unsupported` for lacking an id that IntMap's own
   ANSWER CONTRACT makes impossible to obtain (with the contract the provider returns 0 citation
   annotations; the same call without it returns 2). The audit still runs and every code still fires
   — ④ above — but its findings are reported to Atlas rather than executed on the reader's answer.
   tests/r472-checks.test.mjs holds what replaced these. */

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

/* R350 ⑦d (the degraded banner, above the prose) removed in #R472 with the degrading it announced.
   Nothing cuts an answer down any more, so there is no banner to draw — see tests/r472-checks. */

/* R350 ⑧a-⑧c (goalImpact / primaryFails / __impact) removed in #R406: js/atlas-planner.js is deleted, so the request profile the impact verdict was derived from no longer exists and js/atlas-console.js no longer splits its failures by it. */

/* ══ ⑨ THE OLD MECHANISMS ARE GONE ═══════════════════════════════════════════════════════════ */

test('R350 ⑨a: the SOURCES: line and the PLACES: trailer no longer exist', () => {
  /* read, not run: the subject is the Atlas kernel (js/atlas-console.js), a closure over the whole HOST
     that only a browser can build; the claim is that the trailer parsers are absent. */
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(!/SOURCES\?\?\s*\[/.test(src) && !/SOURCES\?\\s\*\[:：\]/.test(src), 'the SOURCES regex is still there');
  assert.ok(!/replace\(\/\\n\?\\s\*PLACES/.test(src), 'the PLACES trailer is still peeled off the prose');
  assert.ok(!src.includes('output "SOURCES:'), 'the model is still told to write a SOURCES line');
  assert.ok(!src.includes('output "PLACES: "'), 'the model is still told to write a PLACES line');
});

test('R350 ⑨b: no Atlas answer reads the globals a concurrent call overwrites', () => {
  /* read, not run: same kernel as ⑨a — the analyse path and the window._aiLast* reads live inside it. */
  /* ⚠ COMMENTS STRIPPED FIRST. The replacement code explains what it replaced, and a check that
     greps the raw file finds its own epitaph and calls it a relapse. */
  const src = codeOnly((read('js/atlas-console.js') + '\n' + capsSource()));
  const analyze = src.slice(src.indexOf('const sys2=_analysisSystemPrompt'), src.indexOf('const sys2=_analysisSystemPrompt') + 6000);
  assert.match(analyze, /runStructuredAnswer\(/, 'the analyse path does not go through the contract pipeline');
  assert.ok(!/_aiLastMeta|_aiLastCitations/.test(src),
    'an Atlas reply still reads window._aiLast* — whichever call answered LAST decides what it shows');
  assert.match(src, /_curPlanCites=/, 'the planner\'s citations are not carried from the call that produced them');
});

test('R350 ⑨c: the exported envelope carries the identity of the call it came from', () => {
  /* read, not run: askAIJSONEnvelope needs a signed-in Supabase session and the network, and the host
     getter is part of the shell (js/app-body.js), which node cannot boot. */
  /* ⚠ THE ENVELOPE IS askAIJSONEnvelope AND NOT A NEW EXPORT, because js/app-body.js is one of the
     six files tests/r168 #8 budgets as «the shell» and origin/main sits ONE line under its ceiling:
     a new HOST member costs a getter PLUS a hoisted forwarding shim (tests/r169 #2 requires the shim
     to start its own line), and the shell has no room for two. It is also the right one — an analysis
     IS a JSON task. What was missing was never the function; it was the CALL IDENTITY, without which
     a caller cannot tell its own citations from a concurrent call's — exactly what
     window._aiLastCitations could never do. */
  const core = read('js/ai-core.js');
  assert.ok(core.includes('return {text, meta, citations, callId,'), 'the transport envelope does not carry its callId');
  /* (#R809) read the fields of the exported envelope, not the spelling of its closing brace — the
     protocol-2 `output` joined it after `task`, and that must not read as the identity being dropped */
  const exported = (/async function askAIJSONEnvelope\([\s\S]*?return \{([^}]*)\}; \}/.exec(core) || [])[1] || '';
  for (const f of ['citations:env.citations', 'callId:env.callId', 'turnId:env.turnId', 'task:env.task']) {
    assert.ok(exported.includes(f), 'the exported envelope drops the call identity on the way out (' + f + ')');
  }
  assert.ok(read('js/app-body.js').includes('get askAIJSONEnvelope()'), 'the host does not forward the envelope at all');
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
});

test('R350 ⑨d: the proxy knows the task, budgets it, and refuses a shape the client cannot audit', () => {
  /* read, not run: the Deno edge function cannot be imported by node (see ①a). */
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  assert.match(proxy, /"analysis_structured"/, 'the task is not in the allow-list — it would 400');
  assert.match(proxy, /analysis_structured: \d+,/, 'the task has no output budget');
  assert.match(proxy, /JSON_TASKS = new Set\(\[[^\]]*analysis_structured/, 'the task does not run in JSON mode');
  assert.match(proxy, /structuredAnswerOk\(out\.text\)/, 'a malformed structured answer is handed to the client as prose');
});

/* (#R795, completed in gate-parity-and-shards) R350 ⑨e was this ceiling and nothing else, so the test is retired with it: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. #R795's own detector missed this one on its spelling; tests/helpers/line-ceilings.mjs asks about the fact. */
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r472-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R472 — 監査は「報告」に戻った。回答を消す権限を持っていたのが欠陥だった
 * ----------------------------------------------------------------------------
 *  報告:「ちゃんと観光情報を答えた直後に、自分で『証拠がありません』と言い始める」。画面には
 *  Atlas 自身の回答（「前の案内を訂正します——養老公園です」）と、その下に `analyze` が描いた
 *  「⚠ 裏付けを確認できなかった記述は、この回答から取り除きました」が縦に並んでいた。
 *
 *  ⚠⚠⚠ **本番で実測してから直した。** `analysis_structured` では hosted web search は走っている
 *    （`webUsed:true`・検索2回）のに、provider が返す citation 注釈は **0 件**である。同じ質問・
 *    同じ schema・同じ webMode で、違いは system prompt だけ:
 *
 *        IntMap の ANSWER CONTRACT あり → 引用 **0** 件
 *        ANSWER CONTRACT なし           → 引用 **2** 件
 *
 *    注釈はモデルが URL を書いた場所に付く。IntMap の契約は「URL を書くな」と言う。
 *    **つまり `hosted_web` の記録は、この経路では構造上ぜったいに台帳へ入らない。**
 *
 *  ⚠⚠⚠ **その結果、正しい回答が消されていた。** モデルは2回の検索で赤坂スポーツ公園・住所・
 *    見頃を正しく書いた。欠けていたのは「文とページを結ぶ id」だけで、**その id が存在し得ない
 *    のは IntMap 自身の規則のせい**である。監査は `evidence.primary_unsupported` を上げ、
 *    修復は同じ空の一覧を見せられて「无法核实」と書き、`degrade()` が全 claim を削除し、
 *    `directAnswer.text` が空になり、呼び出し側が「分析没有回传结果」を出した。**道具は何も返さない。**
 *
 *  ⚠⚠ **並んでいた2つ目の回答は、1つ目の正しい下流である。** 中身を抜かれたと告げられた Atlas が
 *    自分で答え直したのは #R419 の設計どおり。**原因は1つで、2つではない。**
 *
 *  直し方は機構を足すことではない——**機構を外すこと**だった。
 *
 *    · `degrade()`     削除。コードが回答を書き換えることは、もう無い。
 *    · `repairBrief()` と修復の呼び出し  削除。**正常経路も異常経路も 1 回になった。**
 *    · 劣化バナー      削除（消すものが無いのだから、告げる中身も無い）。
 *    · 監査は残る。全コードが今までどおり発火し、その結果は開発トレースと **Atlas** へ渡る。
 *
 *  ⚠ **読者の保護は 1 つも減っていない。** #R350 を名づけた保証——「モデルが捏造した URL が
 *    リンクとして読者に届かない」——は **renderer と registry** にある（`stripModelUrls()` と、
 *    台帳の記録からしか作られない出典カード）。`degrade()` はそれを守ってはいなかった。
 *    **削っていただけである。** ⑤ がそれを測る。
 *
 *  ⚠ (#R345 の形) この検査は自分の説明文を読んではならない。上の見出しには `degrade` も
 *    `repairBrief` も書いてある。製品側は `codeOnly()` で注記を剥がしてから見る。
 * ==========================================================================*/

const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const PL = (await import('../js/atlas-answer-pipeline.js')).makeAtlasAnswerPipeline();
const AU = (await import('../js/atlas-answer-audit.js')).makeAtlasAnswerAudit();
const RN = (await import('../js/atlas-answer-render.js')).makeAtlasAnswerRender();
const EV = (await import('../js/atlas-evidence.js')).makeAtlasEvidence();

/* ══ THE REPORTED TURN, AS PRODUCTION ACTUALLY PRODUCED IT ═══════════════════════════════════════
   The hosted search RAN, the provider returned ZERO citations (measured on the live site), and the
   only thing IntMap had gathered for a question about wisteria was a Japanese earthquake feed. */
const ANSWER = () => ({
  directAnswer: { text: '岐阜県で藤の名所として知られる公園は、大垣市の赤坂スポーツ公園です。', claimIds: ['c1'] },
  sections: [{ id: 's1', heading: '所在地と見頃', blocks: [{ type: 'text', text: '所在地は大垣市草道島町40-1、見頃は例年4月下旬〜5月です。', claimIds: ['c2'] }] }],
  limitations: [],
  claims: [
    { id: 'c1', text: '赤坂スポーツ公園は岐阜県の代表的な藤の名所である。', claimType: 'fact', importance: 'primary', dimension: 'level', confidence: 'high', evidenceIds: [], basedOn: [] },
    { id: 'c2', text: '所在地は大垣市草道島町40-1で、見頃は例年4月下旬から5月である。', claimType: 'fact', importance: 'major', dimension: 'level', confidence: 'high', evidenceIds: [], basedOn: [] },
  ],
  places: [],
});

function scripted(over) {
  const seen = [];
  const ask = async (prompt, system, opts) => {
    seen.push({ callId: opts.callId, webMode: opts.webMode, prompt });
    const a = ANSWER();
    return { text: JSON.stringify(a), data: a,
      meta: { webUsed: opts.webMode !== 'off' }, citations: [], callId: opts.callId };
  };
  return { seen, opts: Object.assign({
    question: '岐阜県で藤の名所はどこ？', dataBlock: '[TIME CONTEXT]\nr472\n\n', systemPrompt: 'SYS',
    language: 'Japanese', temporalMode: 'current', requestedOutputs: ['explanation'], turnId: 't-r472',
    webMode: 'auto',
    clientSources: [{ url: 'https://example.org/quake', title: '日本の地震', src: 'USGS', date: '2026-08-25' }],
    appFacts: [], retrievedAt: 'r472-2026-08-25',
    ask, parseJSON: (t) => { try { return JSON.parse(t); } catch (_) { return null; } },
  }, over || {}) };
}

/* ── ① 報告そのもの: 回答が消えない ─────────────────────────────────────────────────────
   ⚠ 修正前は degraded / 2件中0件 / 主文が空文字列 → 呼び出し側の「分析没有回传结果」。 */
test('R472 ①: 引用が1件も返らない本番の条件でも、回答はそのまま読者に届く', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  assert.equal(out.env.claims.length, 2, '主張が削られた: ' + out.env.claims.length + '/2');
  assert.equal(out.env.answer.directAnswer.text, ANSWER().directAnswer.text, '主文が別の文に差し替わった');
  assert.equal(out.env.answer.sections.length, 1, '節が消えた');
  assert.equal(out.env.audit.status, 'findings', '監査の状態: ' + out.env.audit.status);
  assert.ok(out.audit.errors.some((e) => e.code === 'evidence.primary_unsupported'),
    '監査は今までどおり所見を上げること——直したのは判定ではなく、判定の権限である');
});

/* ── ② 正常経路も異常経路も 1 回 ────────────────────────────────────────────────────── */
test('R472 ②: 監査が所見を上げても、モデルへの問い合わせは 1 回のまま', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  assert.equal(s.seen.length, 1, 'モデルを ' + s.seen.length + ' 回呼んでいる');
  assert.equal(out.trace.calls.length, 1, 'トレースが 2 回目を記録している');
});

/* ── ③ 監査は Atlas へ報告する（判決ではなく所見として） ──────────────────────────────── */
test('R472 ③: 所見はコードのまま Atlas へ渡り、「取り除いた」とは言わない', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  const meta = PL.auditMeta(out.env);
  assert.ok(meta, '所見があるのに Atlas へ何も渡していない');
  assert.ok(meta.auditFindings.includes('evidence.primary_unsupported'), JSON.stringify(meta.auditFindings));
  assert.match(String(meta.auditNote), /rendered in full/,
    'Atlas に「全文が画面に出ている」と伝えていない——#R419 はこれを伝えないことで壊れた');
  /* (#R760) 所見は判決ではないので、判決の綴り（#R142 の `unverified`）に乗せない */
  assert.equal(meta.unverified, undefined, '所見が「何も起きなかった」の旗に乗っている');
  assert.ok(!/removed|gutted|取り除/.test(String(meta.auditNote)),
    '何も取り除いていないのに、取り除いたと言っている');
  assert.equal(meta.degraded, undefined, 'degraded の旗が残っている');
  assert.equal(meta.removedClaims, undefined, 'removedClaims が残っている');
});

test('R472 ③b: 所見が無ければ Atlas に余計な但し書きを渡さない', async () => {
  /* 監査が何も上げない最小の答え: 主文があり、それが primary を引く */
  const env = { answer: { directAnswer: ANSWER().directAnswer, sections: [], limitations: [] }, claims: [], places: [], audit: { status: 'passed', errors: [], warnings: [] } };
  assert.equal(PL.auditMeta(env), null, '所見ゼロの回答に但し書きが付いている');
});

/* ── ④ 機構が消えていること（形として） ──────────────────────────────────────────────
   ⚠ 「使われていない」ではなく「無い」。#R350 ⑨ と同じ主張の仕方。 */
test('R472 ④: 回答を書き換える／問い直す機構がソースから消えている', () => {
  /* read, not run: 「無い」 is the claim — a private function that nothing calls cannot be observed by
     running the module; the exported half is asserted by value below. */
  const audit = CODE('js/atlas-answer-audit.js');
  const pipe = CODE('js/atlas-answer-pipeline.js');
  const render = CODE('js/atlas-answer-render.js');
  assert.ok(!/function\s+degrade\s*\(/.test(audit), 'degrade() がまだ在る');
  assert.ok(!/function\s+repairBrief\s*\(/.test(audit), 'repairBrief() がまだ在る');
  assert.equal(AU.degrade, undefined, 'degrade がまだ公開されている');
  assert.equal(AU.repairBrief, undefined, 'repairBrief がまだ公開されている');
  assert.equal(PL.MAX_MODEL_CALLS, undefined, '呼び出し回数の上限がまだ在る——数えるものが無いのだから');
  assert.equal(PL.degradeMeta, undefined, 'degradeMeta がまだ公開されている');
  const asks = pipe.match(/await\s+ask\(/g) || [];
  assert.equal(asks.length, 1, 'パイプラインの ask() が ' + asks.length + ' か所ある');
  assert.ok(!/atl-degraded/.test(render), '劣化バナーの綴りが renderer に残っている');
  assert.ok(!/atl-degraded/.test((CODE('js/atlas-console.js') + '\n' + capsSource())), '劣化バナーの綴りが kernel に残っている');
});

/* ── ⑤ 読者の保護は 1 つも減っていない ───────────────────────────────────────────────
   ⚠⚠ 「制限は増やすな」は逆向きにも効く——**検査を外して通したのではない**ことを、
   外せる場所ごとに測る。#R350 を名づけた保証は renderer と registry にあって degrade には無い。 */
test('R472 ⑤a: モデルが書いた URL は、今でもリンクにならない', () => {
  const e = { answer: { directAnswer: { text: '詳しくは https://fabricated.example.com/x を参照。', claimIds: [] }, sections: [], limitations: [] }, claims: [], places: [], audit: { status: 'findings', errors: [], warnings: [] } };
  const reg = EV.makeEvidenceRegistry({ callId: 'c', turnId: 't', retrievedAt: 'now' });
  const html = RN.renderAnswer(e, reg, { L: (en) => en, esc: (s2) => String(s2), mdMini: (s2) => String(s2), linkCards: () => '' });
  assert.ok(!/<a[ >]/.test(html), '捏造 URL がリンクになった');
  assert.ok(!/https?:\/\//.test(html), '踏める形の URL が本文に残っている');
  assert.match(html, /fabricated\.example\.com/, 'stripModelUrlsはホスト名だけを残す——消してしまうと文が壊れる');
});

test('R472 ⑤b: 出典カードは今でも台帳の記録からしか作られない', () => {
  const reg = EV.makeEvidenceRegistry({ callId: 'c', turnId: 't', retrievedAt: 'now' });
  assert.deepEqual(reg.addProviderCitations([{ url: 'https://x.example.org/a', title: 'A' }], { webUsed: false }), [],
    '検索が走っていないのに hosted_web の記録が作れる');
  assert.deepEqual(reg.addProviderCitations([{ url: 'https://x.example.org/a', title: 'A' }], { webUsed: true, callId: 'other' }), [],
    '別の呼び出しの引用が入り込める');
  assert.equal(reg.size(), 0);
});

test('R472 ⑤c: 監査規則は 1 つも消えていない', () => {
  const codes = Object.keys(AU.AUDIT_CODES);
  assert.ok(codes.length >= 39, 'AUDIT_CODES が ' + codes.length + ' 件に減っている（実測 39）');
  ['evidence.primary_unsupported', 'schema.unknown_evidence_ref', 'url.raw_in_prose', 'url.host_in_prose',
    'web.unverified_label', 'citation.call_mismatch', 'metric.value_unsupported', 'contradiction.superlative_beaten',
  ].forEach((c) => assert.ok(codes.includes(c), c + ' が AUDIT_CODES から消えている'));
  /* (consolidation) 「宣言されている規則はどれも、まだ誰かが上げる」 was asserted here a second time over
     the same source scan; #R350 ④b above asserts it in both directions, so it lives there once. */
});

/* ── ⑥ プロンプトが嘘をつかない ────────────────────────────────────────────────────
   ⚠ 「これが存在する全ての出典だ」は、検索がこれから走る呼び出しに対しては偽である。
   そして IntMap が記事を1本も持たない問いでは、それが**空の一覧**についての宣言だった。 */
test('R472 ⑥a: 検索が走る呼び出しに「これが存在する全ての出典だ」と言わない', async () => {
  const s = scripted();
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.ok(!/only sources that exist/i.test(p), '検索が走るのに一覧を「完全」と宣言している');
  assert.match(p, /no id here yet/i, '検索で開くページに id が無いことを伝えていない');
  assert.match(p, /is a fabrication/i, '一覧に無い id が捏造であるという歯止めが消えた');
});

test('R472 ⑥b: 検索を使わない呼び出しでは、その一覧は本当に完全なのでそう言う', async () => {
  const s = scripted({ webMode: 'off' });
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.match(p, /\[e1\]/, '事前に集めた出典が呼び出しに出ていない');
  assert.match(p, /only sources that exist/i, '検索が走らない呼び出しからも強い指示が消えた');
  assert.ok(!/no id here yet/i.test(p), '検索が走らないのに「まだ id が無い」と言っている');
});

test('R472 ⑥c: 台帳が空でも、答えるなとは言わない', async () => {
  const s = scripted({ clientSources: [] });
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.match(p, /IntMap holds no source of its own/i, '空であることを伝えていない');
  assert.match(p, /never invent an id/i, '捏造の歯止めが消えた');
});
}
