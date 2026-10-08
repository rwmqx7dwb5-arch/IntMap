/* ============================================================================
 *  hist-product — 「政体の盛衰」: one polity read across the whole of time
 *  (scripts/build-polity-arcs.mjs → data/polity-arcs.json → js/polity-arc.js; Atlas `time.polityArc`)
 * ----------------------------------------------------------------------------
 *    ① THE INDEX IS WHAT THE MAP DRAWS TODAY: re-derived from the bundles by the map's own code, it equals the committed file;
 *    ② NO SMOOTHING: two neighbouring points of a polity always differ (in area or in records) — the only compression is
 *       the lossless one; every arc's peak is the largest of its points;
 *    ③ THE EDGES ARE CLASSIFIED: an edge on the day a record begins or hands over is a record's (`reach`), not the polity's
 *       (Qing 1689 → 1885, Empire of Japan from 1886); a polity still drawn at the end is `today` (Spain);
 *    ④ HISTORY, NAMED (.agents/rules/historical-verification.md §2-1): for polities whose founding, fall and greatest extent
 *       are well attested, the map's statement agrees with the history — and the ones that do not are written down in
 *       dev-notes/2026-10-08-hist-product.md rather than asserted here;
 *    ⑤ the search, the ranking (dated records only), a Wikidata item chosen by year, the other names with their reasons;
 *    ⑥ Atlas `time.polityArc` returns the same facts the page shows, numbered candidates when several match, NOT_FOUND
 *       when none does — and moves nothing in either case;
 *    ⑦ the doors: the Chronos panel builds the button, a named row of «this place through time» carries one (never inside
 *       the row's own button, never in Atlas's inert bubble), the place card dispatches it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from '../scripts/lib/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const IDX = JSON.parse(rd('data/polity-arcs.json'));
const clock = { min: -122999, on: () => () => {}, isLive: () => true, when: () => new Date(), set: () => {} };
const P = await importModule('js/polity-arc.js', {
  mocks: { 'js/chronos.js': { IntMapTime: clock }, 'js/geo-engine.js': { IntMapGeoEngine: { camera: { fitBounds: () => {} } } }, 'js/fetch-deadline.js': { jsonWithin: async () => IDX } },
});
const arc = (n) => { const a = IDX.arcs.find((x) => x.n === n); assert.ok(a, 'the index draws ' + n); return a; };
const D = (n) => P.describe(IDX, arc(n));

test('① data/polity-arcs.json is what the map draws today (re-derived from the bundles)', { timeout: 600_000 }, async () => {
  const B = await import('../scripts/build-polity-arcs.mjs');
  const fresh = await B.build();
  assert.equal(JSON.stringify(fresh) + '\n', rd(B.OUT), 'data/polity-arcs.json is stale — run node scripts/build-polity-arcs.mjs');
});

test('② no smoothing: neighbouring points differ; the peak is the largest point; boxes are boxes', () => {
  for (const a of IDX.arcs) {
    const d = a.d || [];
    for (let i = 1; i < d.length; i++) {
      assert.ok(d[i][0] > d[i - 1][0], a.n + ': points ascend');
      assert.ok(d[i][1] !== d[i - 1][1] || d[i][2] !== d[i - 1][2], a.n + ' ' + d[i][0] + ': a point that changes nothing');
    }
    if (d.length) assert.equal(a.pk[1], Math.max(...d.map((p) => p[1])), a.n + ': the peak is its largest drawn area');
    for (const b of [a.bb, a.pk[3]]) assert.ok(Array.isArray(b) && b.length === 4 && b[0] <= b[2] && b[1] <= b[3] && b[2] - b[0] <= 360, a.n + ': a box');
  }
  assert.ok(IDX.skipped.described > 0 && IDX.skipped.sheetFill > 0, 'descriptions and the sheets\' gap pieces are counted, not drawn');
});

test('③ an edge where a record begins or hands over is the record\'s, not the polity\'s', () => {
  const I = IDX.instants;
  const qing = D('Qing');
  assert.deepEqual([qing.first.y, qing.first.edge], [I.dayFrom, 'reach'], 'Qing begins where OpenHistoricalMap does');
  assert.deepEqual([qing.last.y, qing.last.edge, qing.last.by], [I.csFrom - 1, 'reach', 'cshapes'], '…and hands over to CShapes');
  const japan = D('Empire of Japan');
  assert.deepEqual([japan.first.y, japan.first.edge], [I.csFrom, 'reach']);
  assert.equal(D('Spain').last.edge, 'today');
  assert.equal(D('Spain').last.y, I.to);
  /* a polity drawn across a seam carries the seam inside its span */
  assert.ok(D('Ottoman Empire').seams.some((s) => s.y === I.dayFrom && s.rec === 'ohm'));
});

test('④ history, named: founding, fall and greatest extent as the map states them', () => {
  const m = D('Mongol Empire');
  assert.deepEqual([m.first.y, m.last.y, m.peak.y], [1206, 1293, 1279], 'Temüjin proclaimed 1206; the Toluid empire divides after 1294; the Song falls 1279');
  const r = D('Roman Empire');
  assert.equal(r.peak.y, 117, 'the Roman Empire is drawn largest in 117 (Trajan)');
  assert.equal(r.last.y, 394, 'drawn to 394 — divided 395');
  assert.equal(D('Holy Roman Empire').last.y, 1806, 'dissolved 6 August 1806');
  assert.equal(D('Byzantine Empire').last.y, 1453, 'Constantinople falls 1453');
  assert.equal(D('Tokugawa Shogunate').last.y, 1867, 'the shogunate ends with the Restoration (1868)');
  assert.equal(D('Ming Dynasty').last.y, 1644, 'Beijing falls 1644');
  assert.equal(D('Macedonian Empire').peak.y, -322, 'drawn largest in 323 BC (Alexander\'s death)');
  assert.equal(D('Russian Empire').first.y, 1721, 'proclaimed 1721');
  assert.equal(D('Russian Empire').last.y, 1917, 'last drawn on 1 July 1917');
});

test('⑤ search, ranking, the Wikidata item and the year, the other names (through the doors of the page and of Atlas)', async () => {
  assert.equal(P.search(IDX, 'モンゴル帝国')[0].n, 'Mongol Empire', 'Japanese name, exact');
  assert.equal(P.search(IDX, 'mongol empire')[0].n, 'Mongol Empire', 'case-insensitive');
  assert.equal(P.search(IDX, 'Q12557')[0].n, 'Mongol Empire', 'by Wikidata item');
  const K = (lang) => ({ R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), L: (en, jp) => (lang === 'jp' ? jp : en), warn: (s) => s, note: (s) => s, esc: (s) => String(s), HOST: { lang } });
  const rank = (await P.atlas({}, K('en'))).meta.polityArc.ranking;
  const dated = IDX.arcs.filter((a) => a.d && a.d.length);
  assert.deepEqual(rank.map((r) => r.en), dated.slice(0, rank.length).map((a) => a.n), 'the ranking is the polities of the dated records, largest first');
  for (let i = 1; i < rank.length; i++) assert.ok(rank[i - 1].largestKm2 >= rank[i].largestKm2);
  /* two names share Q12544: the year chooses */
  const at = async (year) => (await P.atlas({ qid: 'Q12544', year }, K('en'))).meta.polityArc.en;
  assert.equal(await at(500), 'Eastern Roman Empire');
  assert.equal(await at(1000), 'Byzantine Empire');
  const byz = (await P.atlas({ name: 'Byzantine Empire' }, K('en'))).meta.polityArc;
  assert.ok(byz.alsoAs.some((r) => r.en === 'Eastern Roman Empire' && r.why === 'qid' && r.qid === 'Q12544'));
  /* the same-name reason is the reader's language's, and only Japanese has one to give */
  assert.ok((await P.atlas({ name: 'Empire of Japan' }, K('jp'))).meta.polityArc.alsoAs.some((r) => r.why === 'name'));
  assert.ok(!(await P.atlas({ name: 'Empire of Japan' }, K('en'))).meta.polityArc.alsoAs.some((r) => r.why === 'name'));
  /* the years its drawing changes are the index's points */
  const mg = IDX.arcs.find((a) => a.n === 'Mongol Empire');
  assert.deepEqual((await P.atlas({ name: 'Mongol Empire' }, K('en'))).meta.polityArc.changeYears, mg.d.map((p) => p[0]));
});

test('⑥ Atlas time.polityArc: the page\'s facts; candidates or NOT_FOUND move nothing', async () => {
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), L: (en) => en, warn: (s) => s, note: (s) => s, esc: (s) => String(s), HOST: { lang: 'en' } };
  let moved = 0; clock.set = () => { moved++; };
  const r = await P.atlas({ name: 'Mongol Empire' }, K);
  assert.equal(r.ok, true);
  assert.deepEqual([r.meta.polityArc.first.y, r.meta.polityArc.last.y, r.meta.polityArc.largest.year, r.meta.polityArc.largest.km2], [1206, 1293, 1279, arc('Mongol Empire').pk[1]]);
  assert.match(r.html, /not of the territory really controlled/);
  const amb = await P.atlas({ name: 'Ottoman' }, K);
  assert.equal(amb.ok, false); assert.equal(amb.meta.code, 'AMBIGUOUS'); assert.ok(amb.meta.candidates.length > 1);
  const none = await P.atlas({ name: 'Zzzyzx Kingdom' }, K);
  assert.equal(none.meta.code, 'NOT_FOUND');
  assert.equal(moved, 0, 'reading moves no clock');
  const go = await P.atlas({ name: 'Roman Empire', go: 'peak' }, K);
  assert.equal(go.ok, true); assert.equal(moved, 1, 'go:"peak" moves the clock once');
  const rank = await P.atlas({}, K);
  assert.equal(rank.meta.polityArc.ranking[0].en, IDX.arcs.find((a) => a.d && a.d.length).n);
});

test('⑦ the doors: Chronos, the place card\'s rows (not in a button, not in Atlas\'s bubble), the capability row', async () => {
  assert.match(rd('js/news-timeline.js'), /id='ntl-polityarc'[\s\S]{0,400}import\('\.\/polity-arc\.js'\)\.then\(m=>m\.openArc\(\{ lang:\(\)=>HOST\.lang \}\)\)/);
  assert.match(rd('js/place-dossier.js'), /k\.indexOf\('pharc:'\) === 0[\s\S]{0,700}import\('\.\/polity-arc\.js'\)\.then\(\(m\) => m\.openArc\(/);
  const PH = await importModule('js/place-history.js', { mocks: { 'js/chronos.js': { IntMapTime: clock } } });
  const E = { key: 'q:Q12557', name: 'Mongol Empire', labels: [{ k: 12060101, label: 'Mongol Empire' }], from: { k: 12060101, edge: 'stated', tier: 'clio' }, to: { k: 12940101, edge: 'stated', tier: 'clio' },
    tiers: ['clio'], ids: [{ tier: 'clio', file: 'data/hist-clio.js', id: { qid: 'Q12557' } }], notes: [], sheets: [], realm: false, of: null, life: null, withheld: null, unnamed: false, jump: { k: 12060101 } };
  const rec = { nation: { status: 'ok', entries: [E, Object.assign({}, E, { unnamed: true })], gaps: [], records: [], missing: [] }, admin: null };
  const card = PH.historyHtml(rec, 'en');
  assert.equal((card.match(/data-hn="pharc:/g) || []).length, 1, 'a named row has the door; an unnamed one does not');
  assert.ok(!/<button[^>]*class="ph-go"[^>]*>(?:(?!<\/button>)[\s\S])*pharc/.test(card), 'not inside the row\'s own button');
  assert.ok(!/pharc/.test(PH.historyHtml(rec, 'en', { inert: true })), 'Atlas\'s bubble is inert');
  assert.match(rd('js/atlas-capabilities.js'), /\["time\.polityArc","polityArc",/);
});
