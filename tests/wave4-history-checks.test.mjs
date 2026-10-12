/* ============================================================================
 *  wave4-history — 「家族史と国境」: the reader's family read at its own days over the border records
 *  (js/gedcom.js → js/family-history.js over js/place-history.js; Atlas `time.lifeAtPlace`)
 * ----------------------------------------------------------------------------
 *    ① A DATE IS THE FILE'S, IN ITS OWN CALENDAR: the GEDCOM grammar's qualifiers become spans of days; Julian, French
 *       Republican and Hebrew dates are converted (checked on days history states); a day that does not exist is refused;
 *    ② THE FILE: records, continuation lines, coordinates as GEDCOM writes them, an event the specification defines but
 *       no list here names, a family's events on both spouses; a byte-order mark, ANSEL refused when it has its own bytes;
 *    ③ HISTORY, NAMED (.agents/rules/historical-verification.md §2-1): lives at named places and years, read over the
 *       shipped records by the map's own modules — the changes counted are the dated changes of polity the records state,
 *       a record's handover (1886), another row of the same polity (OpenHistoricalMap's «Empire of Japan (1868-1869)»),
 *       an overlap and a seam are listed and NOT counted (dev-notes/2026-10-13-wave4-history.md compares them with history);
 *    ④ a date that is only a year says when the records change inside it (Lviv, 1918);
 *    ⑤ a place name is located only when ONE settlement answers; a country is never a place;
 *    ⑥ Atlas `time.lifeAtPlace` returns the same facts the sheet shows;
 *    ⑦ the doors and the privacy text.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from '../scripts/lib/import-module.mjs';
import { harness, historyAt } from '../scripts/place-history.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const G = await importModule('js/gedcom.js');
const H = await harness('en');
const clock = { min: -122999, on: () => () => {}, isLive: () => true, when: () => new Date(), set: () => {} };
const FH = await importModule('js/family-history.js', {
  mocks: { 'js/chronos.js': { IntMapTime: clock }, 'js/geo-engine.js': { IntMapGeoEngine: {} }, 'js/place-history.js': H.PH },
});

test('① GEDCOM dates: qualifiers are spans of days, other calendars are converted, impossible days are refused', () => {
  const D = (s) => G.parseDate(s);
  assert.deepEqual([D('12 MAR 1905').k0, D('12 MAR 1905').k1, D('12 MAR 1905').prec], [19050312, 19050313, 'day']);
  assert.deepEqual([D('MAR 1905').k0, D('MAR 1905').k1], [19050301, 19050401]);
  assert.deepEqual([D('ABT 1905').qual, D('ABT 1905').k0, D('ABT 1905').k1], ['about', 19050101, 19060101]);
  assert.deepEqual([D('BEF 1900').k0, D('BEF 1900').k1], [null, 19000101], 'before: no lower bound, ends where the year begins');
  assert.deepEqual([D('AFT 1900').k0, D('AFT 1900').k1], [19010101, null]);
  assert.deepEqual([D('BET 1900 AND 1905').k0, D('BET 1900 AND 1905').k1], [19000101, 19060101]);
  assert.deepEqual([D('FROM 1900 TO 1910').qual, D('FROM 1900 TO 1910').k1], ['period', 19110101]);
  assert.equal(D('44 B.C.').k0, -43 * 10000 + 101, '44 BC is astronomical −43');
  /* the day after 4 October 1582 (Julian) was 15 October 1582 (Gregorian): 4 October Julian is 14 October Gregorian */
  assert.equal(D('@#DJULIAN@ 4 OCT 1582').k0, 15821014);
  assert.equal(D('JULIAN 4 OCT 1582').k0, 15821014, 'GEDCOM 7 spells the calendar without the escape');
  assert.equal(D('@#DJULIAN@ 12 MAR 1890').k0, 18900324, 'a Russian Julian date of 1890 is 12 days behind');
  /* two days every history of the Revolution states */
  assert.equal(D('@#DFRENCH R@ 9 THER 2').k0, 17940727, '9 Thermidor An II');
  assert.equal(D('@#DFRENCH R@ 18 BRUM 8').k0, 17991109, '18 Brumaire An VIII');
  assert.equal(D('@#DFRENCH R@ 1 PLUV 14').problem, 'calendar-range', 'the calendar ended on 1 January 1806');
  const heb = D('@#DHEBREW@ 1 TSH 5785');
  if (heb.problem !== 'calendar-unavailable') assert.equal(heb.k0, 20241003, '1 Tishri 5785 (Rosh Hashanah 2024)');
  assert.deepEqual([D('11 FEB 1731/32').k0, D('11 FEB 1731/32').dual], [17320211, '1731/32'], 'a dual year is read as the later year and says so');
  assert.equal(D('30 FEB 1900').problem, 'unreadable');
  assert.equal(D('29 FEB 1900').problem, 'unreadable', '1900 is not a Gregorian leap year');
  assert.equal(D('@#DJULIAN@ 29 FEB 1700').k0, 17000311, '…but 1700 is a Julian one');
  assert.equal(D('(unknown)').problem, 'phrase');
  assert.equal(D('BET 1900').problem, 'unreadable', 'BET without its AND bounds nothing — not «1900 onwards»');
  assert.equal(D('FROM 1900').k1, null, '…while FROM alone is an open period');
  /* what a reader types */
  assert.equal(G.readDateInput('1905-03-12').k0, 19050312);
  assert.equal(G.readDateInput('1905年3月').prec, 'month');
  assert.equal(G.readDateInput('1900頃').qual, 'about');
  assert.equal(G.readDateInput('before 1900').qual, 'before');
  assert.equal(G.readDateInput('紀元前44年').k0, -429899);
});

const SAMPLE = [
  '0 HEAD', '1 SOUR Test', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
  '0 @I1@ INDI', '1 NAME Anna /Kowalska/', '1 SEX F',
  '1 BIRT', '2 DATE 1 MAY 1880', '2 PLAC Lemberg, Galizien, Österreich', '3 MAP', '4 LATI N49.8429', '4 LONG E24.0316',
  '1 DEAT', '2 DATE 1952', '2 PLAC Lwów',
  '1 _MILT', '2 DATE 1914', '2 PLAC Przemyśl',
  '1 NOTE a long', '2 CONC  note', '2 CONT second line',
  '0 @I2@ INDI', '1 NAME Jan /Kowalski/', '1 BIRT', '2 DATE ABT 1875',
  '0 @I3@ INDI', '1 NAME Ewa /Kowalska/', '1 BIRT', '2 DATE 1905', '2 PLAC Buenos Aires', '3 MAP', '4 LATI S34.6', '4 LONG W58.38',
  '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I1@', '1 CHIL @I3@', '1 MARR', '2 DATE 12 JUN 1903', '2 PLAC Lemberg',
  '0 TRLR',
].join('\r\n');

test('② the file: events by structure, coordinates, families, character sets', () => {
  const g = G.parseGedcom(SAMPLE);
  assert.equal(g.version, '5.5.1');
  assert.equal(g.people.length, 3);
  const anna = g.people.find((p) => p.id === '@I1@'), ewa = g.people.find((p) => p.id === '@I3@'), jan = g.people.find((p) => p.id === '@I2@');
  assert.equal(anna.name, 'Anna Kowalska');
  const birt = anna.events.find((e) => e.tag === 'BIRT');
  assert.deepEqual([birt.lng, birt.lat, birt.place], [24.0316, 49.8429, 'Lemberg, Galizien, Österreich']);
  assert.deepEqual([ewa.events[0].lng, ewa.events[0].lat], [-58.38, -34.6], 'S and W are negative');
  assert.ok(anna.events.some((e) => e.tag === '_MILT' && e.date.k0 === 19140101), 'an event no list names is still read (it carries a DATE)');
  assert.ok(!anna.events.some((e) => e.tag === 'NOTE'), 'a NOTE is not an event');
  for (const p of [anna, jan]) assert.ok(p.events.some((e) => e.tag === 'MARR' && e.date.k0 === 19030612 && e.with === (p === anna ? '@I2@' : '@I1@')), 'a family\'s event belongs to both spouses');
  assert.deepEqual([ewa.parents.sort(), anna.children, anna.spouses], [['@I1@', '@I2@'], ['@I3@'], ['@I2@']]);
  assert.deepEqual([g.counts.events, g.counts.located], [7, 2]);
  /* character sets */
  const enc = new TextEncoder();
  assert.equal(G.decode(new Uint8Array([0xEF, 0xBB, 0xBF, ...enc.encode('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Łucja\n')])).text.includes('Łucja'), true);
  assert.equal(G.decode(enc.encode('0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME é\n')).problem, 'ansel', 'ANSEL with its own bytes is refused, not guessed');
  assert.ok(G.decode(enc.encode('0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Anna\n')).text, '…and read where it is plain ASCII');
  assert.equal(G.decode(new Uint8Array([...enc.encode('0 HEAD\n1 CHAR ANSI\n1 NAME '), 0xE9])).text.slice(-1), 'é', 'ANSI is Windows-1252');
  /* the record's own administrative dates (CHANGE_DATE / CREATION_DATE) are not events: a life without a death must not
     run to the day the file was last edited, and a family's edit date must not be counted twice */
  const admin = G.parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 7.0', '0 @I1@ INDI', '1 NAME A /B/', '1 BIRT', '2 DATE 1900', '1 CHAN', '2 DATE 3 MAR 2024', '3 TIME 10:00', '1 CREA', '2 DATE 1 JAN 2020',
    '0 @I2@ INDI', '1 NAME C /D/', '0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 MARR', '2 DATE 1925', '1 CHAN', '2 DATE 3 MAR 2024', '0 TRLR'].join(String.fromCharCode(10)));
  assert.deepEqual(admin.people[0].events.map((e) => e.tag), ['BIRT', 'MARR']);
  assert.deepEqual([admin.counts.events, admin.people[1].events.map((e) => e.tag)], [3, ['MARR']]);
  assert.ok(G.parseGedcom('hello').problems.some((p) => p.what === 'not-gedcom'));
});

/* the lives the development record compares with history — named places, named years — read through the one door the
   page and Atlas share (`atlasRun` composes the same `atEvent` / `lifeAt` the sheet draws with) */
const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), warn: (s) => s, note: (s) => s, L: (en) => en, HOST: { lang: 'en' } };
async function life(lng, lat, from, to) {
  const r = await FH.atlasRun({ from, to }, K, { lng, lat });
  assert.equal(r.ok, true, 'the records were read at ' + lng + ',' + lat);
  return r.exec.lifeAtPlace;
}
const kinds = (F, k) => F.changes.filter((c) => c.kind === k).map((c) => c.date);

test('③ history, named: the changes counted are the dated changes of polity the records state', { timeout: 300_000 }, async () => {
  /* Lviv: Austria-Hungary → (CShapes) Austria 3 Nov 1918 → Poland 10 Sep 1919 → Soviet Union 8 May 1945 */
  let F = await life(24.0316, 49.8429, '1880-05-01', '1952');
  assert.deepEqual(kinds(F, 'polity'), ['1918-11-03', '1919-09-10', '1945-05-08']);
  assert.equal(F.changesCounted, 3);
  assert.ok(F.atStart.polities.some((p) => /Austria-Hungary/.test(p)), 'born in Austria-Hungary');
  assert.deepEqual(F.atEnd.polities, ['Soviet Union']);
  /* Kyoto: one change of polity (the Meiji restoration, 3 Jan 1868); OpenHistoricalMap's dated versions of the Empire of
     Japan are rows of one polity, and 1886 is where CShapes begins */
  F = await life(135.7681, 35.0116, '1850', '1930');
  assert.deepEqual(kinds(F, 'polity'), ['1868-01-03']);
  assert.ok(kinds(F, 'version').length >= 2, 'the versions are listed');
  assert.deepEqual(kinds(F, 'record'), ['1886-01-01'], '1886 is a change of record');
  /* Uzhhorod 1910–1995: the 25 days Cliopatria covers between CShapes' Soviet Union and Ukraine are a seam, not a polity */
  F = await life(22.2879, 48.6208, '1910', '1995');
  assert.equal(F.changesCounted, 3);
  assert.deepEqual(kinds(F, 'polity').slice(-1), ['1991-12-26']);
  /* Strasbourg 1860–1950: the transfer of 1871 is drawn as an overlap and counted once, on the day the French claim ends */
  F = await life(7.7521, 48.5734, '1860', '1950');
  assert.deepEqual(kinds(F, 'polity'), ['1870-09-03', '1871-05-10', '1919-06-28']);
  assert.deepEqual(kinds(F, 'overlap'), ['1871-05-04']);
  /* Istanbul (inland of the old city) 1900–1990: CShapes' state code 640 continues; the map's era-name table writes
     «Turkey» from 14 Oct 1923 — a new name for the state the record continues, listed and not counted */
  F = await life(28.95, 41.02, '1900', '1990');
  assert.deepEqual([F.changesCounted, kinds(F, 'renamed')], [0, ['1923-10-14']]);
});

test('④ a date that is only a year names the days the records change inside it', async () => {
  let F = await life(24.0316, 49.8429, '1918', '1919');
  assert.ok(F.atStart.polities.some((p) => /Austria-Hungary/.test(p)), 'read on its first day');
  assert.ok(F.atStart.changesWithinTheDate.some((c) => c.date === '1918-11-03'), 'the change of 3 Nov 1918 is inside «1918»');
  F = await life(24.0316, 49.8429, '1925-03-12', '1925-03-12');
  assert.deepEqual([F.atStart.changesWithinTheDate.length, F.atStart.polities], [0, ['Poland']]);
  assert.ok(F.atStart.subdivisions.some((u) => /Lwów/.test(u)), 'the first-level division of that day');
  F = await life(24.0316, 49.8429, 'BEF 1900', '1900');
  assert.equal(F.from, '1899-12-31', '«before 1900» is read on the last day before it');
});

test('⑤ a place name is located only when one settlement answers; a country is never a place', () => {
  const row = (name, kind, lng, lat) => ({ name, kind, lng, lat, exact: true });
  const deps = (local, hist) => ({ local: (q) => local[q] || [], hist: (q) => hist[q] || [], same: () => false });
  let r = FH.locate('St Mary, Lemberg, Galizien', deps({}, { Lemberg: [{ name: 'Lemberg', lng: 24.03, lat: 49.84, level: 3, kind: 'city', source: 'histCities' }] }));
  assert.deepEqual([r.status, r.part, r.rows[0].lng], ['one', 'Lemberg', 24.03], 'parts are asked from the smallest; the one that answers is said');
  r = FH.locate('Springfield', deps({ Springfield: [row('Springfield', 'town', -89.6, 39.8), row('Springfield', 'town', -72.6, 42.1)] }, {}));
  assert.equal(r.status, 'several');
  r = FH.locate('Poland', deps({ Poland: [row('Poland', 'country', 19, 52)] }, {}));
  assert.equal(r.status, 'none', 'a country is not where anyone was born');
  r = FH.locate('Crimea', deps({ Crimea: [row('Crimea', 'flashpoint', 34, 45)] }, {}));
  assert.equal(r.status, 'several', 'a row that is not a settlement is offered, never applied');
  assert.equal(FH.locate('Nowhere', deps({}, {})).status, 'none');
});

test('⑥ Atlas time.lifeAtPlace asks again for a date it cannot read, and never guesses one', async () => {
  const bad = await FH.atlasRun({ from: 'yesterday-ish' }, K, { lng: 24, lat: 49 });
  assert.equal(bad.ok, false);
  const backwards = await FH.atlasRun({ from: '1950', to: '1900' }, K, { lng: 24, lat: 49 });
  assert.equal(backwards.ok, false, '"to" before "from" is refused');
});

test('⑦ the doors and the privacy text', () => {
  const nt = rd('js/news-timeline.js');
  assert.match(nt, /import\('\.\/family-history\.js'\)\.then\(m=>m\.openFamily\(/, 'the Chronos panel opens the sheet');
  const cap = rd('js/atlas-cap-time.js');
  assert.match(cap, /row: \['time\.lifeAtPlace',\s+'lifeAtPlace'/);
  assert.match(cap, /import\('\.\/family-history\.js'\); return atlasRun\(a, K, got\.pt\)/);
  assert.match(rd('js/atlas-capabilities.js'), /\["time\.lifeAtPlace","lifeAtPlace"/, 'the registry row is generated');
  const legal = rd('js/legal-text.js');
  assert.match(legal, /<b>Family history across borders<\/b> — the people, dates and places/);
  assert.match(legal, /<b>家族史と国境<\/b>——入力した、または読み込んだ家系図ファイル/);
});
