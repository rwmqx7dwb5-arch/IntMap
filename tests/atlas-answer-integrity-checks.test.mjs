/* ============================================================================
 *  atlas-answer-integrity — ONE ANSWER, BUILT FROM ONE SET OF DATED, SOURCED NUMBERS
 * ----------------------------------------------------------------------------
 *  Reported 2026-11-17 from a production Atlas answer to a life-expectancy ranking:
 *    · the ranking came from `LIFE` in js/tables.js — 54 hand-typed values with no year and no source — because
 *      `_fillMetric` skipped the World Bank once 25 values existed;
 *    · the turn corrected itself and the reply kept BOTH rankings (two calls, two keys), plus the indicator
 *      layer's 「Highest」 line — the same ranking three times;
 *    · the indicator layer said 「261か国が報告」, counting the World Bank's aggregates (WLD, EMU, AFW …);
 *    · the source list named only the basemap — no result carried where its numbers came from.
 *  Every check below EVALUATES the shipped function on data shaped like that turn's.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper the browser writes through */
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';
import { makeAtlasAnswerSources } from '../js/atlas-answer-sources.js';
import { makeAtlasMetrics, isRankableCountry } from '../js/atlas-metrics.js';
import { WB_INDICATORS, wbIndicatorFor, applyLatest, wbCitation } from '../js/wb-indicators.js';
import { IntMapTables } from '../js/tables.js';
import { stampFigure, figure } from '../js/country-figures.js';   /* the ONE store of a value's year and source */
import { IntMapLang } from '../js/lang-registry.js';
import { IntMapTime } from '../js/chronos.js';

const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
const LNORM = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const TRES = makeAtlasTurnResults({ norm: LNORM });
const LIFE = wbIndicatorFor('lifeExp').code;

/* a country table shaped like js/countries-ui.js builds it */
function table() {
  const row = (nameEn, extra) => Object.assign({ nameEn, sov: true }, extra || {});
  return {
    JPN: (() => { const r = row('Japan', { hdi: 0.92 }); stampFigure(r, 'hdi', IntMapTables.STAT_SOURCES.hdi.year, IntMapTables.STAT_SOURCES.hdi); return r; })(),
    CHE: row('Switzerland'), KOR: row('South Korea'), NGA: row('Nigeria'), TCD: row('Chad'),
    ATA: { nameEn: 'Antarctica', sov: false },
  };
}
function metrics(cs, lang) {
  const HOST = { countryStats: cs, lang: lang || 'en' };
  const LA = IntMapLang.pickArgs(), pick = IntMapLang.pick(() => HOST.lang);
  const R = (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null);
  return makeAtlasMetrics(HOST, { LA, lx: (x) => pick.arr(x), L: (...a) => pick(...a), esc, warn: (s) => s, R });
}

/* ── ① no undated constant answers over the World Bank ─────────────────────────────────────────── */
test('① the bundled tables that stay say who measured them and when; the undated ones are gone', () => {
  assert.equal(IntMapTables.LIFE, undefined, 'LIFE (undated life expectancies) is not shipped');
  assert.equal(IntMapTables.INTERNET, undefined, 'INTERNET (undated internet use) is not shipped');
  /* every remaining per-country figure table is labelled — by the field js/countries-ui.js fills from it */
  for (const f of ['gdp', 'hdi', 'dem', 'milSpend']) {
    const p = IntMapTables.STAT_SOURCES[f];
    assert.ok(p && p.source && /^\d{4}$/.test(p.year), f + ' has a source and a four-digit year: ' + JSON.stringify(p));
  }
  /* the start-up refresh is every field a series fills, discovered from the catalogue (js/wb-layers.js refreshStatsLatest) */
  assert.ok(WB_INDICATORS.filter((x) => x.stat).map((x) => x.stat).includes('lifeExp'));
  assert.ok(WB_INDICATORS.filter((x) => x.stat).map((x) => x.stat).includes('internet'));
});

test('① applyLatest: the World Bank value replaces a bundled one, with its year and its publisher', () => {
  const cs = table();
  cs.JPN.lifeExp = 84.0; stampFigure(cs.JPN, 'lifeExp', '', 'a bundled table');   /* the shape the report found */
  cs.CHE.lifeExp = 83.6;                                                                   /* a value nobody labelled */
  const latest = { JPN: { v: 84.71, y: '2023' }, CHE: { v: 84.06, y: '2022' }, WLD: { v: 73.3, y: '2023' }, EMU: { v: 82.4, y: '2023' } };
  const r = applyLatest(cs, 'lifeExp', latest);
  assert.equal(cs.JPN.lifeExp, 84.71, 'the World Bank value is used — not 84.0');
  assert.equal(figure(cs.JPN, 'lifeExp').y, 2023);
  assert.equal(figure(cs.JPN, 'lifeExp').src, wbCitation(LIFE).source);
  assert.equal(figure(cs.CHE, 'lifeExp').y, 2022, 'each value carries ITS year');
  assert.equal(cs.WLD, undefined, 'an aggregate is not a row of the table and gets none');
  assert.deepEqual(r.years, [2022, 2023]);
  assert.equal(r.n, 2);
  /* no threshold: a table that already holds many values is still replaced */
  const big = {}; for (let i = 0; i < 60; i++) big['C' + i] = { nameEn: 'c' + i, sov: true, lifeExp: 50 };
  const lt = {}; for (let i = 0; i < 60; i++) lt['C' + i] = { v: 70 + i / 10, y: '2023' };
  applyLatest(big, 'lifeExp', lt);
  assert.ok(Object.values(big).every((s) => s.lifeExp >= 70 && figure(s, 'lifeExp').y === 2023), 'all 60 replaced');
  /* a country the series does not report keeps its own value and label */
  const keep = table(); applyLatest(keep, 'hdi', {});
  assert.equal(applyLatest(keep, 'hdi', {}), null, 'hdi has no World Bank series — nothing to apply');
  assert.equal(keep.JPN.hdi, 0.92);
});

/* ── ② one subject, one surviving result ───────────────────────────────────────────────────────── */
const rankRes = (n, dataYear, ok) => ({ act: { type: 'rank', metric: 'lifeExp', n }, ok: ok !== false, html: '<ol>' + n + '</ol>',
  meta: ok === false ? null : { subject: 'worldbank:' + LIFE, facet: 'ranking:top', dataYear, rows: ['Japan', 'Switzerland'], brief: 'Top ' + n } });

test('② a later ranking of the same subject supersedes the earlier one — whatever its arguments', () => {
  const a = rankRes(10, ''), b = rankRes(15, '2023');
  const kept = TRES.keep([a, b]);
  assert.equal(kept.length, 1, 'one ranking survives');
  assert.equal(kept[0], b, 'the corrected (later) one');
  /* different facets of one subject are different statements and both stay */
  const map = { act: { type: 'indicator', q: 'life expectancy' }, ok: true, html: '<div>map</div>', meta: { subject: 'worldbank:' + LIFE, facet: 'map', brief: 'Map' } };
  assert.equal(TRES.keep([b, map]).length, 2);
  const bottom = Object.assign({}, b, { meta: Object.assign({}, b.meta, { facet: 'ranking:bottom' }) });
  assert.equal(TRES.keep([b, bottom]).length, 2, 'top and bottom are two questions');
});

test('② a newer measurement wins over a later fetch of older data; a failure never displaces an answer', () => {
  const newer = rankRes(10, '2021–2023'), older = rankRes(10, '2019');
  assert.equal(TRES.keep([newer, older])[0], newer, 'data for 2023 beats data for 2019, though fetched first');
  /* a failed re-run carries no subject — it can only reach the slot through the same op key; give it one */
  const failed = { act: newer.act, ok: false, html: 'x', meta: { subject: newer.meta.subject, facet: 'ranking:top' } };
  assert.equal(TRES.keep([newer, failed])[0], newer);
  assert.equal(TRES.subjectKey({ meta: { subject: 's', facet: 'f' } }), 'subject:s#f');
  assert.equal(TRES.subjectKey({ meta: {} }), '');
});

test('② present: a ranking the words already give is folded to its line; a map change is one line', () => {
  const r = rankRes(10, '2023');
  const map = { act: { type: 'indicator' }, ok: true, html: '<div>Highest …</div>', meta: { subject: 'worldbank:' + LIFE, facet: 'map', brief: 'Map: Life expectancy' } };
  const plain = { act: { type: 'flyTo' }, ok: true, html: '<div>moved</div>', meta: null };
  const prose = '平均寿命が最も長いのは Japan（84.7歳）、次いで Switzerland です。';
  assert.deepEqual(TRES.present([r, map, plain], prose).map((x) => x.fold), [true, true, false]);
  /* the words do not give the ranking: the block is shown */
  assert.equal(TRES.present([r], 'See the table below.')[0].fold, false);
  /* nothing written yet (between tools): nothing is folded */
  assert.deepEqual(TRES.present([r, map], '').map((x) => x.fold), [false, false]);
});

/* ── ③ countries are counted by the table, not by the code's length ─────────────────────────────── */
test('③ the indicator browser counts and ranks countries only — never WLD / EMU / AFW', async () => {
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const { makeIndicatorBrowser } = await import('../js/indicator-browser.js');
  const cs = table();
  const S = { years: ['2022', '2023'], best: '2023', by: { 2023: { JPN: 84.7, CHE: 84.1, NGA: 53.6, TCD: 52.5, WLD: 73.3, EMU: 82.4, AFW: 57.9, HIC: 80.4, ATA: 99 } } };
  const entry = { id: 'wblife', row: 'bx-wblife', base: 'wblife', mode: null, code: LIFE, key: LIFE, n: ['Life expectancy', '平均寿命'], unit: ' yr', ramp: [] };
  const b = makeIndicatorBrowser({
    lang: () => 'en', entries: () => [entry], paint: () => true, clear() {}, current: () => 'wblife',
    series: async () => S, seriesOf: () => S, yearOf: () => '2023', name: (n) => n[0],
    country: (iso) => cs[iso] || null, ready: async () => null, countryName: (iso) => (cs[iso] && cs[iso].nameEn) || iso,
    wanted: () => null, legend: () => null, hideLegend() {}, escape: (s) => s,
  });
  const f = await b.facts('wblife', 3);
  assert.equal(f.reporting, 4, 'four countries — not the 9 three-letter keys');
  assert.deepEqual(f.top.map((x) => x.iso), ['JPN', 'CHE', 'NGA']);
  assert.ok(!f.top.concat(f.bottom).some((x) => /WLD|EMU|AFW|HIC|ATA/.test(x.iso)), 'no aggregate, no non-country in the lists');
  assert.equal(isRankableCountry(cs.ATA), false);
  /* ④ …and the result names its subject and cites the series, with the very values it holds */
  const meta = b.atlasMeta(f);
  assert.equal(meta.subject, 'worldbank:' + LIFE);
  assert.equal(meta.dataYear, '2023');
  assert.equal(meta.provenance.length, 1);
  assert.equal(meta.provenance[0].source, wbCitation(LIFE).source);
  assert.equal(meta.provenance[0].licence, 'CC BY 4.0');
  assert.deepEqual(meta.provenance[0].values.slice().sort(), [84.7, 84.1, 53.6, 52.5].sort());
  /* the reader's block names the quantity, not the series code */
  const html = b.atlasHtml(f, (s) => s);
  assert.ok(!html.includes(LIFE), 'no indicator code in the reader-visible block: ' + html);
  delete globalThis.document; delete globalThis.localStorage;
});

/* ── ④ a country-table ranking carries its provenance into the answer's source list ─────────────── */
test('④ metricResult: subject, data year and one source item per publisher, from the printed rows', () => {
  const cs = table();
  applyLatest(cs, 'lifeExp', { JPN: { v: 84.71, y: '2023' }, CHE: { v: 84.06, y: '2022' }, NGA: { v: 53.6, y: '2023' } });
  const M = metrics(cs);
  const rows = M.metSpec('lifeExp') && [{ code: 'JPN', name: 'Japan', val: 84.71 }, { code: 'CHE', name: 'Switzerland', val: 84.06 }];
  const meta = M.metricResult('life expectancy', rows, 'ranking:top');
  assert.equal(meta.subject, 'worldbank:' + LIFE, 'the field is named by the series that fills it — the indicator layer\'s subject');
  assert.equal(meta.facet, 'ranking:top');
  assert.equal(meta.dataYear, '2022–2023');
  assert.equal(meta.provenance.length, 1);
  assert.deepEqual(meta.provenance[0].values, [84.71, 84.06]);
  assert.deepEqual(meta.rows, ['Japan', 'Switzerland']);
  /* the answer's source list reads it: a number in Atlas's words gets the World Bank's [n] */
  const SRC = makeAtlasAnswerSources({ lang: () => 'en', esc });
  const items = SRC.collect([{ ok: true, meta }], {});
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'number');
  assert.equal(items[0].date, '2022–2023');
  assert.match(SRC.linkNumbers('Japan has 84.71 years.', items, 'x'), /\[1\]/);
  /* a field with no World Bank series is its own subject, cited by the bundled label */
  const h = M.metricResult('hdi', [{ code: 'JPN', name: 'Japan', val: 0.92 }], 'ranking:top');
  assert.equal(h.subject, 'stat:hdi');
  assert.equal(h.provenance[0].source, IntMapTables.STAT_SOURCES.hdi.source);
  assert.equal(h.dataYear, IntMapTables.STAT_SOURCES.hdi.year);
  /* a value nobody labelled is cited by nobody */
  const none = M.metricResult('lifeExp', [{ code: 'KOR', name: 'South Korea', val: 83 }], 'ranking:top');
  assert.deepEqual(none.provenance, []);
  /* while the clock is in the past the table holds that year's figures, which the stamp does not describe */
  IntMapTime.setYear(1990, { source: 'test' });
  try { assert.deepEqual(M.metricResult('lifeExp', rows, 'ranking:top').provenance, []); }
  finally { IntMapTime.setNow({ source: 'test' }); }
  assert.equal(M.metricResult('lifeExp', rows, 'ranking:top').provenance.length, 1, 'back at the present, the citation returns');
});

test('④ the sources footer leads with one line; the account of how it was made is the tooltip', () => {
  const SRC = makeAtlasAnswerSources({ lang: () => 'en', esc });
  const html = SRC.footerHtml([{ n: 1, kind: 'number', what: 'Life expectancy', source: wbCitation(LIFE).source, values: [1] }], { id: 'a', linked: true });
  const note = /<div class="atl-srcs-note"[^>]*>([^<]*)<\/div>/.exec(html);
  assert.ok(note, html);
  assert.ok(note[1].length < 60, 'the visible note is one short line: ' + note[1]);
  assert.match(html, /title="[^"]*not written by Atlas/, 'the full account is kept in the tooltip');
  assert.match(html, /^<details class="atl-srcs"[^>]*><summary[^>]*>Sources of this answer · 1 — /, 'the footer is one collapsed line: count and the first source names');
  assert.doesNotMatch(SRC.footerHtml([{ n: 1, kind: 'number', what: 'x', source: 'S', values: [1] }], { id: 'a' }), /atl-srcs-note/, 'the key to [n] is not shown when no number in the answer was marked');
});
