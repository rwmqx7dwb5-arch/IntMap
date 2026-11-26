/* ============================================================================
 *  IntMap · atlas-cited-answers — an Atlas answer's sources come from the tools it ran
 * ----------------------------------------------------------------------------
 *  js/atlas-answer-sources.js joins a number in Atlas's prose to the source of the tool result whose value it
 *  equals, lists every source under the reply (with the line card and the answer's Cite), and the same list goes
 *  into the notebook entry, its Markdown export and a briefing. These checks RUN the modules the browser runs:
 *    ① the query engine states, per printed column, the source and the values (js/atlas-query.js `provenanceOf`)
 *    ② a number is marked only when it equals a returned value at the prose's precision — never a count, a date,
 *       a name, an entity or the inside of a link — and a number that matches nothing stays unmarked
 *    ③ an item without an author is not an item; the map's credits are listed once, not beside the border records
 *    ④ the list says it was read from the tools and not written by Atlas, and what an unmarked number means
 *    ⑤ the notebook keeps the list (and refuses a non-http address), its Markdown writes it, a briefing carries it
 *    ⑥ the line card's Atlas answer states its records as data, in both languages
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule } from './helpers/import-module.mjs';
import { makeAtlasAnswerSources, sourcesMarkdown } from '../js/atlas-answer-sources.js';
import { entryFromTurn, normalize, toMarkdown } from '../js/atlas-notebook-store.js';
import { sectionFromEntry } from '../js/atlas-briefing-codec.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');   /* the page hands in window.IntMapSafe.html */
const core = (lang) => makeAtlasAnswerSources({ lang: () => lang || 'en', esc });

/* the query engine as tests/atlas-query-checks.test.mjs builds it — gazetteer rows on the window, the picker at its edge */
const gzRow = (en, pop, iso2, gid) => ['city', [en], 10, 50, en, en, pop, iso2, gid, 'PPLA', '', 0];
async function engine(rows) {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  const { atlasQuery } = await importModule('js/atlas-query.js', {
    globals: { window: { IntMapGazetteer: { warm: async () => rows, worldMeta: () => ({ count: rows.length, placeKinds: null }) } }, document: { baseURI: 'http://localhost/' } },
    mocks: { 'js/lang-registry.js': { IntMapLang: { pick, pickArgs: () => ((...a) => a) } } },
  });
  const API = atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn });
  return API;
}

test('① a query answer states each printed column’s source and the values its rows carry', async () => {
  const API = await engine([gzRow('Mosul', 1683000, 'IQ', '99072'), gzRow('Wuzhong', 7202654, 'CN', '1790842'), gzRow('Smallton', 900, 'CN', '7')]);
  const out = await API.answer({ from: 'cities', show: ['pop'], where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.ok(out.ok);
  const pop = (out.provenance || []).find((p) => p.kind === 'number' && Array.isArray(p.what) && /pop/i.test(p.what[0]));
  assert.ok(pop, 'the population column is stated: ' + JSON.stringify(out.provenance));
  assert.match(pop.source, /GeoNames/, 'an intrinsic column is the table’s own record');
  assert.deepEqual(pop.values.slice().sort((a, b) => a - b), [1683000, 7202654], 'the values are the printed rows’ — not the row the conditions dropped');
  /* and it rides the capability's result meta, which the executor carries to the reply (js/atlas-executor.js 10) */
  const cd = readFileSync(new URL('../js/atlas-cap-data.js', import.meta.url), 'utf8');
  assert.match(cd, /_qr\.provenance[^;]*provenance:_qr\.provenance/, 'data.query hands the statement on in meta.provenance');
});

test('② a number is marked only when it equals a value a source returned, at the prose’s precision', () => {
  const C = core('jp');
  const items = C.collect([{ ok: true, meta: { provenance: [
    { kind: 'number', what: ['Population', '人口'], source: 'GeoNames cities1000 (CC BY 4.0)', values: [3124000, 35.6789, 7] },
  ] } }], {});
  const html = '<p>人口3,124,000人の都市。気温は35.68度、M5.2、上位7件、2026-11-16 14:30 現在。<a href="x">3124000</a> <code>35.68</code> &#39; 12</p>';
  const out = C.linkNumbers(html, items, 't1');
  const marks = out.match(/data-atl-srcn="1"/g) || [];
  assert.equal(marks.length, 2, 'Japanese-glued 3,124,000 and 35.68 (35.6789 at two places) — and nothing else:\n' + out);
  assert.match(out, /3,124,000人の都市<sup class="atl-srcn">/, 'the mark follows the phrase the number belongs to, never splits a number from its unit (atlas-result-delivery)');
  assert.doesNotMatch(out, /\d<sup[^>]*>(?:<a[^>]*>\[\d+\]<\/a>)+<\/sup>[^\s、。，．,.;；:：!?！？()（）<]/, 'a mark never sits between a number and the unit glued to it');
  assert.doesNotMatch(out, /上位7<sup/, 'a one-digit count is not read as a measurement');
  assert.doesNotMatch(out, /M5\.2<sup/, 'a number glued to a Latin letter is part of a name');
  assert.match(out, /<a href="x">3124000<\/a>/, 'the inside of a link is left alone');
  assert.match(out, /<code>35\.68<\/code>/, 'code is left alone');
  assert.match(out, /&#39; 12<\/p>/, 'an entity is never read as digits, and 12 matches nothing');
  /* a number of the prose that no result returned stays unmarked — the list says what that means (④) */
  assert.equal(C.linkNumbers('<p>about 3,100,000</p>', items, 't1'), '<p>about 3,100,000</p>');
  /* dates and times are not quantities */
  assert.deepEqual(C.numbersIn('2026-11-16 14:30').map((t) => t.value), []);
});

test('③ no author, no item — and the map’s credits are listed once, not beside the border records', () => {
  const C = core('en');
  const items = C.collect([
    { ok: true, meta: { provenance: [{ kind: 'number', what: 'x', source: '', values: [12] }, { kind: 'claim', what: 'x', source: 'S', values: [12] }] } },
    { ok: false, meta: { provenance: [{ kind: 'number', what: 'x', source: 'Failed', values: [12] }] } },
    { ok: true, meta: { provenance: [{ kind: 'line', what: ['Prussia', 'プロイセン'], source: ['OpenHistoricalMap relation', 'OpenHistoricalMap のリレーション'], at: { lng: 13, lat: 52 } }] } },
  ], {
    borders: { at: '1900-06-15', data: [{ credit: 'Seshat Cliopatria', licence: 'CC BY 4.0', cite: 'Bennett et al. 2025' }] },
    credits: ['© OpenStreetMap contributors', 'Seshat Cliopatria', ''], at: { lng: 10, lat: 50 },
  });
  assert.deepEqual(items.map((i) => [i.n, i.kind, i.source]), [
    [1, 'line', 'OpenHistoricalMap relation'],
    [2, 'line', 'Seshat Cliopatria'],
    [3, 'map', '© OpenStreetMap contributors'],
  ], 'an empty source, an unknown kind and a failed result give nothing; Cliopatria is not repeated as a map credit');
  assert.equal(items[1].cite, 'Bennett et al. 2025', 'the citation the record’s publisher asks for is carried');
  assert.equal(core('jp').collect([{ ok: true, meta: { provenance: [{ kind: 'line', what: 'x', source: ['E', 'J'] }] } }], {})[0].source, 'J', 'a source held in both languages is read in the reply’s');
});

test('④ the list says it was read from the tools, what an unmarked number means, and offers the line card and Cite', () => {
  for (const lang of ['en', 'jp']) {
    const C = core(lang);
    const items = C.collect([], { borders: { at: '1900-06-15', data: [{ credit: 'CShapes 2.0', licence: 'CC BY-NC-SA 4.0' }] }, at: { lng: 10, lat: 50 } });
    const h = C.footerHtml(items, { id: 'b1', credit: 'Map: IntMap' });
    assert.match(h, lang === 'jp' ? /Atlas が書いたものではありません/ : /not written by Atlas/);
    assert.match(h, lang === 'jp' ? /印の無い数字は、どの結果とも照合できなかった/ : /without a mark was not matched/);
    assert.match(h, /data-atl-line="10,50"/, 'a line item opens the line card where the map was');
    assert.match(h, /atl-srcs-citebox/, 'the answer can be cited');
    assert.match(h, /CC BY-NC-SA 4\.0/, 'the licence is shown as the record states it');
  }
  assert.equal(core('en').footerHtml([], {}), '', 'an answer with nothing sourced shows no list — it does not pretend to have one');
});

test('⑤ the notebook keeps the list, its Markdown writes it, and a briefing carries it', () => {
  const plain = core('jp').plainItems(core('jp').collect([{ ok: true, meta: { provenance: [{ kind: 'number', what: ['Population', '人口'], of: ['Cities', '都市'], source: 'GeoNames', licence: 'CC BY 4.0', values: [1] }] } }], {}));
  assert.deepEqual(plain[0], { n: 1, kind: 'number', what: '人口 (都市)', source: 'GeoNames', licence: 'CC BY 4.0', cite: '', url: '', date: '' }, 'no values and no markup are stored');
  const e = entryFromTurn({ question: '人口の多い都市は？', reply: '上海です。', status: 'answered', at: 1 },
    { now: 1, provenance: plain.concat([{ n: 2, kind: 'map', what: 'x', source: 'S', url: 'javascript:alert(1)' }]), credit: '地図: IntMap データ: GeoNames' });
  assert.equal(e.provenance.length, 2);
  assert.equal(e.provenance[1].url, '', 'an address that is not http(s) is not kept');
  assert.equal(normalize(e).credit, '地図: IntMap データ: GeoNames');
  const md = toMarkdown([e], 'jp');
  assert.match(md, /\*\*この回答の出典\*\*/);
  assert.match(md, /\[1\] 人口 \(都市\) — GeoNames · CC BY 4\.0/);
  assert.match(md, /出典表記: 地図: IntMap/);
  assert.deepEqual(sourcesMarkdown([], 'en', 'x'), [], 'nothing to list, nothing written');
  const s = sectionFromEntry(e, false);
  assert.equal(s.provenance.length, 2, 'the briefing section carries the list');
  assert.equal(s.credit, e.credit);
});

test('⑥ the line card’s Atlas answer states its records as data, in both languages', () => {
  const src = readFileSync(new URL('../js/border-provenance-card.js', import.meta.url), 'utf8');
  assert.match(src, /provenance\.push\(\{ kind: 'line'/, 'time.borderSource returns each record drawing a shape as a line item');
  assert.match(src, /source: \[recordName\(sd, en\), recordName\(sd, jp\)\]/, 'named as the card names it, in en and jp');
});
