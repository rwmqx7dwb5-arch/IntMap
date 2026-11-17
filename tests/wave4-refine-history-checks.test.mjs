/* ============================================================================
 *  wave4-refine (history) — the defects found in «持ち主が変わった土地» (js/territory-change.js) and «家族史と国境»
 *  (js/family-history.js, js/gedcom.js) by running them on real data, each held by the case that showed it.
 * ----------------------------------------------------------------------------
 *    T1  ACROSS TWO RECORDS A NAME IS NOT AN IDENTITY: a cell whose two instants are drawn by different records that
 *        share no identifier, under different names, is compared by name only — listed apart, not counted, not drawn.
 *        Measured before: Europe 1885 → 1887 «changed hands» 5.3 million km² (Russian Empire → Russia 2.8 million)
 *        across the 1886 seam. Within ONE record its names are its identity (the record before 1886 states no other).
 *        A ribbon two records leave along one border is the border drawn twice, not land (RIBBON_DEG, canon in
 *        scripts/build-hist-clio.mjs).
 *    T2  A CLAIM THAT ONLY BEGINS OR ENDS moved no land: listed under overlaps, out of the total — the one judgement
 *        js/family-history.js claimChange, which a life's changes are counted with too.
 *    F1  A PLACE NAME IS CHECKED AGAINST THE REST OF ITS TEXT by identifier (today's countries and first-level
 *        divisions, the real shipped files): «Paris, Lamar, Texas, USA» is not Paris, France; a Pleiades name no record
 *        attests on the event's date is no candidate («Troy, …, New York, USA» in 1900 is not Troia).
 *    F2–F8, and the input: LDS ordinances are not life events; «CAL 1900»; strict charsets; a non-Gregorian year is said
 *        as its Gregorian days; FROM / TO are read including their ends and say so; «@@» is «@»; the form's «where they
 *        lived» is a residence, not the birth and death place; «12 March 1905»; the file written back is the file read.
 *    UX  territoryChange says a bare year is read on 15 June, and what a lattice will cost before laying it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from '../scripts/lib/import-module.mjs';
import { harness, run } from '../scripts/territory-change.mjs';
import { harness as phHarness } from '../scripts/place-history.mjs';
import { makeAtlasAdmin1 } from '../js/atlas-admin1.js';
import { decodeNECountries } from '../js/ne-countries.js';

import * as T from '../js/territory-change.js';
/* the module as the page loads it — for the parts that need none of the page (FH below is the same file with the clock mocked) */
import * as FHM from '../js/family-history.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const G = await importModule('js/gedcom.js');
const PH = await phHarness('en');
const clock = { min: -122999, on: () => () => {}, isLive: () => true, when: () => new Date(), set: () => {} };
const FH = await importModule('js/family-history.js', {
  mocks: { 'js/chronos.js': { IntMapTime: clock }, 'js/geo-engine.js': { IntMapGeoEngine: {} }, 'js/place-history.js': PH.PH },
});

const sq = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const P = (...rings) => ({ type: 'Polygon', coordinates: rings });
const F = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const LAND = [F(P(sq(-1, -1, 11, 3)), { NAME: 'Land' })];
const at = (y) => { const d = new Date(0); d.setFullYear(y, 5, 15); d.setHours(12, 0, 0, 0); return { now: false, when: d, year: y, iso: null }; };
const compare = (past, now, o) => T.territoryChange([0, 0, 10, 2], at(1900), at(1920),
  { borders: { collectionAt: async (w) => ({ tier: 'test', fc: { type: 'FeatureCollection', features: w.getFullYear() === 1900 ? past : now } }), recordOf: () => ({ src: 'TEST' }) },
    land: () => ({ features: LAND }), lang: 'en', yieldTo: () => Promise.resolve() }, Object.assign({ stepDeg: 0.05 }, o || {}));
const pair = (x) => x.from.map((n) => n.en).join(' / ') + ' → ' + x.to.map((n) => n.en).join(' / ');

test('T1 across two records a name is not an identity: listed apart, not counted, not drawn — within one record it is', async () => {
  /* the 1886 seam as the records write it: the record before names the polity, CShapes codes it */
  const R = await compare([F(P(sq(0, 0, 5, 2)), { NAME: 'Russian Empire' }), F(P(sq(5, 0, 10, 2)), { NAME: 'Kingdom of Prussia', _qid: 'Q27306', _rec: 'clio' })],
    [F(P(sq(0, 0, 5, 2)), { NAME: 'Russia', _gw: 365 }), F(P(sq(5, 0, 10, 2)), { NAME: 'Germany', _gw: 255 })]);
  assert.equal(R.transfers.length, 0, 'nothing the records identify changed hands');
  assert.equal(R.totals.changedKm2, 0);
  assert.deepEqual(R.nameOnly.map(pair).sort(), ['Kingdom of Prussia → Germany', 'Russian Empire → Russia']);
  assert.ok(R.totals.nameOnlyKm2 > 0 && R.seam, 'the land is listed apart, and the answer says it is a seam');
  const X = T.forAtlas(R, 'en');
  assert.equal(X.totals.changedKm2, 0); assert.equal(X.nameOnly.length, 2); assert.match(X.seam, /different records/);
  /* the same name across the seam is not a change, and no change is claimed */
  const same = await compare([F(P(sq(0, 0, 10, 2)), { NAME: 'Austria-Hungary' })], [F(P(sq(0, 0, 10, 2)), { NAME: 'Austria-Hungary', _gw: 300 })]);
  assert.equal(same.transfers.length + same.nameOnly.length, 0);
  /* within ONE record (no identifier at either instant, both untagged) the record's own names decide: a transfer */
  const one = await compare([F(P(sq(0, 0, 10, 2)), { NAME: 'Kingdom of Prussia' })], [F(P(sq(0, 0, 4, 2)), { NAME: 'Kingdom of Prussia' }), F(P(sq(4, 0, 10, 2)), { NAME: 'German Empire' })]);
  assert.deepEqual(one.transfers.map(pair), ['Kingdom of Prussia → German Empire']);
  assert.equal(one.nameOnly.length, 0);
});

test('T1 measured on the shipped records: Europe 1885 → 1887 and Africa 1880 → 1914 across the 1886 seam', { timeout: 300_000 }, async () => {
  const H = await harness('en');
  const EU = await run(H, [-11, 35, 45, 62], '1885', '1887', 0.1);
  assert.ok(!EU.transfers.some((x) => pair(x) === 'Russian Empire → Russia'), 'the Russian Empire did not lose 2.8 million km² to Russia in 1886');
  assert.ok(EU.nameOnly.some((x) => pair(x) === 'Russian Empire → Russia'), '…it is listed as a pair compared by name only');
  /* before this rule 5,314,457 km² «changed hands» (default step); what is left is only what one identifier pair says */
  assert.ok(EU.totals.changedKm2 < 100000, 'changed ' + EU.totals.changedKm2);
  assert.ok(EU.seam);
  const AF = await run(H, [-20, -36, 52, 38], '1880', '1914', 0.25);
  assert.ok(!AF.transfers.some((x) => pair(x) === 'Cape Colony → Union of South Africa'), 'a seam between records is not counted as a transfer');
  assert.ok(AF.totals.nameOnlyKm2 > AF.totals.changedKm2);
});

test('T1 a ribbon between two records\' drawings of one border is set apart; a border one record moves is not', async () => {
  /* the canon of the width: the builder that measured it */
  const m = /const SLIVER_W = ([\d.]+);/.exec(rd('scripts/build-hist-clio.mjs'));
  assert.ok(m, 'scripts/build-hist-clio.mjs states SLIVER_W'); assert.equal(T.RIBBON_DEG, +m[1]);
  const X = (w, e, rec) => F(P(sq(w, 0, e, 2)), Object.assign({ NAME: 'Xland', _qid: 'Q1' }, rec ? { _rec: rec } : {}));
  const Y = (w, e, rec) => F(P(sq(w, 0, e, 2)), Object.assign({ NAME: 'Yland', _qid: 'Q2' }, rec ? { _rec: rec } : {}));
  /* the same two polities at both instants, the border 0.1° apart in two records: the border drawn twice */
  const R = await compare([X(0, 5, 'clio'), Y(5, 10, 'clio')], [X(0, 4.9, 'ohm'), Y(4.9, 10, 'ohm')]);
  assert.equal(R.transfers.length, 0, 'not a transfer');
  assert.equal(R.drawing.length, 1); assert.ok(R.drawing[0].km2 > 0 && R.totals.drawingKm2 === R.drawing[0].km2);
  /* the same record moving it: a transfer */
  const S = await compare([X(0, 5, 'clio'), Y(5, 10, 'clio')], [X(0, 4.9, 'clio'), Y(4.9, 10, 'clio')]);
  assert.deepEqual(S.transfers.map(pair), ['Xland → Yland']); assert.equal(S.drawing.length, 0);
  /* wider than the measured distance between two drawings: land */
  const W = await compare([X(0, 5, 'clio'), Y(5, 10, 'clio')], [X(0, 4, 'ohm'), Y(4, 10, 'ohm')]);
  assert.deepEqual(W.transfers.map(pair), ['Xland → Yland']);
});

test('T2 a claim that only begins or ends is an overlap, not a transfer — one judgement with the family page', async () => {
  const A = F(P(sq(0, 0, 10, 2)), { NAME: 'Aland', _gw: 1 }), C = F(P(sq(5, 0, 10, 2)), { NAME: 'Claimant', _gw: 2 });
  const began = await compare([A], [A, C]);
  assert.equal(began.transfers.length, 0, 'measured before: «Aland → Aland / Claimant» counted as land that changed hands');
  assert.equal(began.totals.changedKm2, 0);
  assert.deepEqual(began.overlaps.map((x) => x.began.map((n) => n.en)), [['Claimant']]);
  const ended = await compare([A, C], [A]);
  assert.deepEqual(ended.overlaps.map((x) => x.ended.map((n) => n.en)), [['Claimant']]);
  assert.equal(ended.transfers.length, 0);
  /* a polity gone AND one come is still a transfer, flagged as drawn over two shapes */
  const B = F(P(sq(5, 0, 10, 2)), { NAME: 'Bland', _gw: 3 });
  const moved = await compare([A], [F(P(sq(0, 0, 5, 2)), { NAME: 'Aland', _gw: 1 }), B, C]);
  const t = moved.transfers.find((x) => pair(x) === 'Aland → Bland / Claimant');
  assert.ok(t && t.overlap);
  /* the judgement itself, as the family page's life count reads it */
  const same = (x, y) => x === y;
  assert.equal(FH.claimChange(['a'], ['a', 'b'], same).kind, 'overlap');
  assert.equal(FH.claimChange(['a', 'b'], ['a'], same).kind, 'overlap');
  assert.equal(FH.claimChange(['a'], ['b'], same).kind, 'change');
  assert.equal(FH.claimChange(['a'], ['a'], same).kind, 'same');
  assert.match(rd('js/territory-change.js'), /import \{ claimChange \} from '\.\/family-history\.js'/, 'the region reads the same judgement, not a copy of it');
});

test('UX territoryChange says a bare year is read on 15 June, and what a lattice will cost before laying it', async () => {
  const R = await compare([F(P(sq(0, 0, 10, 2)), { NAME: 'A', _gw: 1 })], [F(P(sq(0, 0, 10, 2)), { NAME: 'B', _gw: 2 })]);
  assert.equal(T.readOn(R.from), '1900-06-15');
  const X = T.forAtlas(R, 'en');
  assert.deepEqual([X.instantsReadOn.from, X.instantsReadOn.to], ['1900-06-15', '1920-06-15']); assert.match(X.instantsReadOn.bareYear, /15 June/);
  assert.match(T.answerHtml(R, 'en'), /15 June/);
  assert.deepEqual(T.estimate(R.lattice), R.estimate, 'the estimate is said before the lattice is laid, from the lattice alone');
  assert.ok(X.estimate && X.estimate.cells === R.lattice.cols * R.lattice.rows && X.estimate.secondsAbout.length === 2);
  /* asked for the cost alone: no record is read, no cell is laid */
  let asked = 0;
  const E = await T.territoryChange([-180, -85, 180, 85], at(1900), at(1920), { borders: { collectionAt: async () => { asked++; return null; } }, land: () => null, lang: 'en' }, { stepDeg: 0.001, estimateOnly: true });
  assert.equal(asked, 0); assert.ok(E.estimateOnly && E.estimate.cells > 6e10 && E.estimate.seconds[1] > E.estimate.seconds[0]);
  assert.match(T.answerHtml(E, 'jp'), /見積もり/);
  /* no limit: a step that cannot be held is refused by what the page could not allocate, with the estimate */
  const huge = await T.territoryChange([-180, -85, 180, 85], at(1900), at(1920), { borders: { collectionAt: async () => ({ fc: { features: [] } }) }, land: () => null, lang: 'en' }, { stepDeg: 1e-5 });
  assert.equal(huge.failed, 'lattice-too-large'); assert.ok(T.forAtlas(huge, 'en').estimate.cells > 1e14);
});

/* ══ F1 — the real outline files: today's countries (Natural Earth 110 m) and the first-level divisions ══ */
const NE = decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/ne-countries/ne_110m_admin_0_countries.json.gz'))).toString()));
const ADM1 = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/admin1-world.json.gz'))).toString());
const A1 = makeAtlasAdmin1({ load: () => ADM1 });
const C = FHM.containerReader(NE, await A1.load(), A1);
const row = (name, kind, lng, lat) => ({ name, kind, lng, lat, exact: true });

test('F1 a place name is checked against the rest of its text by identifier, and a historical name by its date', async () => {
  assert.ok(C.names('USA').includes('c:USA') && C.names('Texas').some((x) => /^a1:US-TX/.test(x)), 'a country by its code, a state by its name');
  assert.ok(C.within({ lng: 2.35, lat: 48.85 }).includes('c:FRA'));
  const deps = (local, hist) => Object.assign({ local: (q) => local[q] || [], hist: (q, w) => (hist[q] ? hist[q](w) : []), same: () => false }, C);
  /* measured before: Paris, France — the rest of the text ignored */
  let r = FH.locate('Paris, Lamar, Texas, USA', deps({ Paris: [row('Paris', 'capital', 2.35, 48.85)] }, {}));
  assert.notEqual(r.status, 'one'); assert.equal(r.rows[0].conflict, 'Texas, USA', 'it names the parts that name a place IntMap holds (Lamar is a county it does not)');
  /* the candidate the text agrees with is preferred over the one it contradicts */
  r = FH.locate('Paris, Lamar, Texas, USA', deps({ Paris: [row('Paris', 'capital', 2.35, 48.85), row('Paris', 'town', -95.555, 33.661)] }, {}));
  assert.deepEqual([r.status, r.rows[0].lng], ['one', -95.555]);
  /* «Georgia» names the country and the US state: Atlanta agrees with the state */
  r = FH.locate('Atlanta, Georgia', deps({ Atlanta: [row('Atlanta', 'city', -84.39, 33.75)] }, {}));
  assert.equal(r.status, 'one');
  /* a part that names nothing IntMap holds is no evidence; a city with no containers named is as before */
  assert.equal(FH.locate('Lyon, Rhône', deps({ Lyon: [row('Lyon', 'city', 4.84, 45.76)] }, {})).status, 'one');
  /* a file may name the state of its day: offered, with what it contradicts, never applied */
  r = FH.locate('Lemberg, Galizien, Österreich', deps({}, { Lemberg: () => [{ name: 'Lemberg', lng: 24.03, lat: 49.84, level: 3, kind: 'city', source: 'histCities' }] }));
  assert.deepEqual([r.status, r.rows[0].conflict], ['several', 'Österreich']);

  /* Pleiades through the real reader (js/where-when.js histCandidates over data/hist-places.json): Troy is Troia only
     on a date some record of the name attests */
  globalThis.window = globalThis.window || globalThis;
  await import('../js/hist-scale.js');
  const places = JSON.parse(rd('data/hist-places.json'));
  window.IntMapHistPlaces = { ensure: async () => places, records: () => places.places };
  const WW = await import('../js/where-when.js');
  const histDeps = Object.assign({ local: () => [], hist: (q, w) => WW.histCandidates(q, w, 'en'), same: () => false });
  /* «Ilion» is attested from 30 BC to AD 300 (the record's own names): a candidate in AD 100, none in 1900 — the
     event's date was never asked before, so a name of antiquity answered for a birth of 1900 */
  assert.ok(FH.locate('Ilion', histDeps, G.parseDate('100')).rows.some((x) => x.source === 'pleiades'));
  assert.equal(FH.locate('Ilion', histDeps, G.parseDate('12 MAR 1900')).status, 'none');
  /* «Troy» IS attested today (Pleiades' English name of the site, 1700–2100): the rest of the text decides — measured
     before: «Troy, Rensselaer, New York, USA» → Troia, Turkey, applied */
  const troy1900 = FH.locate('Troy, Rensselaer, New York, USA', Object.assign({}, histDeps, C), G.parseDate('12 MAR 1900'));
  assert.notEqual(troy1900.status, 'one'); assert.ok(troy1900.rows.every((x) => x.conflict), 'offered only with what it contradicts');
  delete window.IntMapHistPlaces;
});

test('F1 the readers are all read before a name is asked: the world gazetteer is waited for', async () => {
  globalThis.window = globalThis.window || globalThis;
  let warmed = false;
  /* resolves a few turns later (the place-history harness stubs the page's timers, so not on a timer) */
  window.IntMapGazetteer = { warm: async () => { for (let i = 0; i < 5; i++) await null; warmed = true; return []; } };
  window.IntMapHistCities = undefined; window.IntMapHistPlaces = undefined;
  /* the outline readers handed in over the real files (the page reads them through js/data-door.js, which this harness's stubbed timers cannot run) */
  const D = await FHM.locateDeps((q) => (warmed ? [row(q, 'city', 1, 1)] : []), C);
  assert.ok(warmed, 'locateDeps resolved only after the gazetteer was read');
  assert.equal(D.local('Somewhere').length, 1);
  assert.ok(D.names('Texas').some((x) => /^a1:US-TX/.test(x)), 'the divisions were read too');
  delete window.IntMapGazetteer;
});

test('F2–F8 the file and the form', () => {
  /* F2: LDS ordinances (individual and spouse sealing) are rites, not events of the life */
  const g = G.parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME A /B/', '1 BIRT', '2 DATE 1820', '1 BAPL', '2 DATE 14 MAR 1994', '2 TEMP SLAKE', '1 CONL', '2 DATE 1994', '1 ENDL', '2 DATE 1995', '1 INIL', '2 DATE 1995', '1 SLGC', '2 DATE 1995', '1 FAMS @F1@',
    '0 @I2@ INDI', '1 NAME C /D/', '1 FAMS @F1@', '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 SLGS', '2 DATE 1996', '1 MARR', '2 DATE 1845', '0 TRLR'].join('\n'));
  assert.deepEqual(g.people[0].events.map((e) => e.tag), ['BIRT', 'MARR'], 'measured before: BAPL 1994 read as an event of a life of 1820');
  /* F3 */
  const cal = G.readDateInput('CAL 1900');
  assert.deepEqual([cal.qual, cal.k0, cal.k1], ['calculated', 19000101, 19010101], 'measured before: «ca» + «L 1900», refused');
  assert.equal(G.readDateInput('c.1850').qual, 'about'); assert.equal(G.readDateInput('ca 1850').qual, 'about'); assert.equal(G.readDateInput('約1850').qual, 'about');
  /* F4: strict decoders */
  const lat = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  assert.equal(G.decode(lat('0 HEAD\r\n1 CHAR FOO\r\n1 NAME J\xf6rg\r\n')).problem, 'invalid-bytes', 'measured before: decoded with U+FFFD');
  assert.equal(G.decode(lat('0 HEAD\r\n1 CHAR UTF-8\r\n1 NAME J\xf6rg\r\n')).problem, 'invalid-bytes');
  assert.match(G.decode(lat('0 HEAD\r\n1 CHAR MACINTOSH\r\n1 NAME J\x9arg\r\n')).text, /Jörg/);
  assert.match(G.decode(lat('0 HEAD\r\n1 CHAR ISO-8859-1\r\n1 NAME J\xf6rg\r\n')).text, /Jörg/);
  assert.match(G.decode(new TextEncoder().encode('0 HEAD\n1 CHAR FOO\n1 NAME Łucja\n')).text, /Łucja/, 'an unknown charset that is valid UTF-8 is read');
  /* F5: a year of another calendar is said as its Gregorian days */
  const heb = FH.dateWords(G.parseDate('@#DHEBREW@ 5700'), 'en');
  assert.match(heb, /1939/); assert.match(heb, /1940/); assert.match(heb, /Hebrew/);
  assert.match(FH.dateWords(G.parseDate('ABT @#DJULIAN@ 1700'), 'en'), /^about .*1700.*1701/);
  assert.equal(FH.dateWords(G.parseDate('1905'), 'en'), '1905', 'a Gregorian year is still a year');
  /* F6: FROM / TO include their ends — the day read and the words agree */
  assert.equal(FH.instantOf(G.parseDate('TO 1910')), 19101231);
  assert.equal(FH.instantOf(G.parseDate('FROM 1900')), 19000101);
  assert.equal(FH.instantOf(G.parseDate('BEF 1910')), 19091231);
  assert.match(rd('js/gedcom.js'), /TO x alone has k0 null and k1 = the day after x's last day/);
  /* F7 */
  assert.equal(G.parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME Jan /Kowal@@ski/\n0 TRLR').people[0].name, 'Jan Kowal@ski');
  assert.equal(G.parseGedcom('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME @@home a@@b\n0 TRLR').people[0].name, '@home a@@b', '7.0 doubles only a leading @');
  /* F8: «where they lived» is a residence, not the place of the birth and the death */
  const p = FHM.draftPerson({ name: 'N', place: 'Lviv', lng: 24.03, lat: 49.84, by: 'Lviv', birth: '1905', death: '1987' });
  const of = Object.fromEntries(p.events.map((e) => [e.tag, e]));
  assert.ok(of.BIRT && of.BIRT.lng == null && !of.BIRT.place, 'measured before: the birth placed at «where they lived»');
  assert.ok(of.DEAT && of.DEAT.lng == null && !of.DEAT.place);
  assert.deepEqual([of.RESI.place, of.RESI.lng], ['Lviv', 24.03]);
});

test('UX a month as a word, and the family written back as the file it was read from', () => {
  for (const [s, k0] of [['12 March 1905', 19050312], ['March 12, 1905', 19050312], ['March 1905', 19050301], ['about 12 Mar. 1905', 19050312], ['12 mars 1905', 19050312]]) {
    const d = G.readDateInput(s);
    assert.equal(d.k0, k0, s + ' → ' + JSON.stringify(d));
  }
  assert.equal(G.readDateInput('12 March 1905').gedcom, '12 MAR 1905');
  assert.equal(G.readDateInput('12 Foo 1905').problem, 'unreadable', 'a word that is not a month is not guessed into one');
  const src = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Jan /Kowal@@ski/', '1 SEX M', '1 BIRT', '2 DATE @#DJULIAN@ 12 MAR 1705', '2 PLAC Lemberg', '3 MAP', '4 LATI N49.84', '4 LONG E24.03', '1 FAMS @F1@',
    '0 @I2@ INDI', '1 NAME Anna', '1 SEX F', '1 FAMS @F1@', '0 @I3@ INDI', '1 NAME Kid', '1 FAMC @F1@', '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 CHIL @I3@', '1 MARR', '2 DATE 1730', '2 PLAC Kraków', '0 TRLR'].join('\n');
  const g = G.parseGedcom(src);
  const people = g.people.map((p) => Object.assign({}, p, { events: p.events.map((e) => Object.assign({}, e, { date: e.date.raw })) }));
  people.push({ id: '@Pabc1', name: 'Typed', sex: '', parents: [], spouses: [], children: [], events: [{ tag: 'BIRT', date: '12 March 1905', typed: true, place: 'x'.repeat(400), lng: -3.5, lat: -12.25 }, { tag: 'DEAT', date: 'gibberish', typed: true }] });
  const out = G.writeGedcom(people);
  assert.ok(out.split('\r\n').every((l) => l.length <= 255), 'no line longer than 255');
  assert.match(out, /2 DATE @#DJULIAN@ 12 MAR 1705/, 'a calendar escape is written as the grammar writes it');
  assert.match(out, /1 NAME Jan Kowal@@ski/);
  const back = G.parseGedcom(out);
  const summary = (p) => [p.name, p.sex, p.parents.length, p.spouses.length, p.events.map((e) => [e.tag, e.date.raw, e.place ? e.place.length : 0, e.lng, e.lat, e.with || null])];
  assert.deepEqual(summary(back.people[0]), ['Jan Kowal@ski', 'M', 0, 1, [['BIRT', '@#DJULIAN@ 12 MAR 1705', 7, 24.03, 49.84, null], ['MARR', '1730', 6, undefined, undefined, '@I2@']]]);
  assert.deepEqual(back.people[2].parents, ['@I1@', '@I2@']);
  assert.deepEqual(summary(back.people[3]), ['Typed', '', 0, 0, [['BIRT', '12 MAR 1905', 400, -3.5, -12.25, null], ['DEAT', '(gibberish)', 0, undefined, undefined, null]]]);
});
