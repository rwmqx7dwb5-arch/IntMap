/* ============================================================================
 *  IntMap · the country borders of the past — which record answers a date, where the handovers
 *  are, and whose identity a click reports  (js/time-borders.js over data/cshapes.js,
 *  data/hist-borders.js and data/hist-eras.js)
 *  (consolidated from tests/r349 ②④, r380 ⑧, r518, r690, r698 ②, r700-seam-density and
 *   r710-historical-identity; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  Chronos answers a year from one of three records: data/cshapes.js from 1886 (day-exact, INCLUSIVE
 *  ends), data/hist-borders.js 1689–1885 (OpenHistoricalMap, day-exact, EXCLUSIVE ends — #R518 built it
 *  for 1850–1885, #R690 widened it to a derived floor of 1689), and data/hist-eras.js below that
 *  (aourednik snapshots, down to 123000 BC since #R679). js/time-borders.js `YEARS` is only the list
 *  of file names the remote fallback can still ask for.
 *  #R518's ⚠ list, in order of how quietly it would happen: the window going empty; the two end-date
 *  conventions being «tidied» into one (151 of 180 successions start the day their predecessor ends);
 *  the nine-language names being lost; the stepper blind below 1886; the attribution missing in a
 *  language; a click answering with the modern carrier (the Two Sicilies answered «Italy / Kingdom of
 *  Sardinia»). #R710: a historical polity's identity must not depend on whether a translation exists
 *  or on which modern country lies under the tap.
 *
 *  ⚠ WHERE THE MODULE CAN BE ASKED, IT IS ASKED (#R505/#R488): through the harness
 *  scripts/histeras/time-borders.mjs, or by lifting a function by its braces and running it. Checks
 *  that still read the source say why — mostly because the subject is `go()`'s dispatch into a live
 *  renderer, or the build script's text.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { clockFloor } from './helpers/hist-scale.mjs';
import { eraBundle } from './helpers/hist-eras.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';   /* (#R695) ask the module, not its source (#R488) */
import { migrateBatches, loadGeom } from '../scripts/histborders/fetch.mjs';
import { simplifyRing } from '../scripts/histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const TB = rd('js/time-borders.js');
const TBC = codeOnly(TB);
const BUILD = rd('scripts/build-hist-borders.mjs');
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const load = (path, global) => { const w = {}; new Function('window', rd(path))(w); return w[global]; };
const HB = load('data/hist-borders.js', '__HISTB');
const CS = load('data/cshapes.js', '__CSHAPES');
const aliveOn = (y, m, d) => { const t = ymd(y, m, d);
  return HB.feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t); };
const hbAlive = (y) => aliveOn(y, 6, 15);

/* ══ the fallback resolver, and the era table (#R349) ═══════════════════════════════════════ */

test('R349 ②: nearest() answers 1875 with the 1880 snapshot and 1830 with 1815', () => {
  const years = TB.match(/const YEARS\s*=\s*\[([^\]]+)\]/);
  assert.ok(years, 'js/time-borders.js must declare YEARS');
  const YEARS = years[1].split(',').map((n) => +n.trim());
  assert.ok(YEARS.includes(1815) && YEARS.includes(1880), 'the two pre-1900 snapshots are offered');
  /* run the shipped resolver rather than reading it: lift the exact source of `nearest`.
     ⚠ (#R679) the parameter list is not the claim — what R349 asserts is what it ANSWERS below CShapes */
  const fn = TB.match(/const nearest\s*=\s*\(?[\w\s,]*\)?\s*=>\s*\{[\s\S]*?\};/);
  assert.ok(fn, 'the nearest() resolver must still be a single expression this test can lift');
  const nearest = new Function('YEARS', 'MAXGAP', 'CS_MIN',
    fn[0].replace(/^const nearest\s*=/, 'const nearest =') + ' return nearest;')(YEARS, 20, 1886);
  assert.equal(nearest(1875), 1880, '1875 is nearer 1880 than 1815 — and below CShapes there is nothing better');
  assert.equal(nearest(1850), 1880, 'the midpoint of the 1815/1880 gap is 1847.5');
  assert.equal(nearest(1830), 1815, '…and 1830 is on the other side of it');
  /* the guard is still doing its job ABOVE CShapes, where the snapshots are only a fallback */
  assert.equal(nearest(1980), 1960, 'a degraded 1980 must not be answered with the post-Soviet 1994 map');
});

/* ⚠ `_ERA_WIKI` is a literal table inside the border layer's closure; its ROWS are parsed out of the
   shipped file (every row, not a hand list — #R380 found fifteen rows still opening at 1900 while a
   hand-written list of twenty codes was green). */
test('R349 ④: no era span still opens at 1900 just because the window used to', () => {
  const tbl = TB.slice(TB.indexOf('const _ERA_WIKI'), TB.indexOf('};', TB.indexOf('const _ERA_WIKI')));
  const rows = [...tbl.matchAll(/\b([A-Z]{3}):\[(\[[^\]]*\](?:,\[[^\]]*\])*)\]/g)];
  assert.ok(rows.length >= 100, `only ${rows.length} rows parsed out of the era table — the parser, not the table, is what failed`);
  const ALLOW = { NER: 'the Third Military Territory of Niger was created in 1900 — there was no «Niger» to name before it' };
  const stillOpen = rows.map((m) => [m[1], +/^\[\s*(\d{4})/.exec(m[2])[1]])
    .filter(([code, first]) => first === 1900 && !ALLOW[code]).map(([code]) => code);
  assert.deepEqual(stillOpen, [], `these era spans still open at the old window bound: ${stillOpen.join(', ')}`);
  /* the states that certainly existed before 1900 — each must now say when it began */
  for (const [code, want] of [['CHN', 1850], ['RUS', 1850], ['GBR', 1850], ['TUR', 1850], ['GRC', 1850],
    ['IRN', 1850], ['THA', 1850], ['ETH', 1850], ['PRT', 1850], ['IDN', 1850],
    ['GUY', 1850], ['SUR', 1850], ['KWT', 1899], ['FJI', 1874], ['SLB', 1893], ['LAO', 1893]]) {
    const m = tbl.match(new RegExp(code + ':\\[\\[(\\d{4}),'));
    assert.ok(m, `${code} is missing from the era table`);
    assert.equal(+m[1], want, `${code} still opens at ${m[1]}`);
  }
  /* and the ones that needed an EARLIER era of their own, not just a lower bound */
  for (const [code, era] of [['FRA', 'Second_French_Empire'], ['DEU', 'German_Confederation'],
    ['JPN', 'Tokugawa_shogunate'], ['ITA', 'Kingdom_of_Sardinia'], ['AUT', 'Austrian_Empire'],
    ['IND', 'Company_rule_in_India'], ['KOR', 'Joseon'], ['BRA', 'Empire_of_Brazil'],
    ['MMR', 'Konbaung_dynasty'], ['TWN', 'Taiwan_under_Qing_rule']]) {
    assert.ok(tbl.includes("'" + era + "'"), `${code}'s pre-1900 era (${era}) is missing`);
  }
});

/* ── (#R380 ⑧) the Sources page says what the code does below CShapes ─────────────────────────── */
test('R380 ⑧: the Sources page says the snapshots are the ONLY border source below 1886', () => {
  const LANGS = ['en', 'ja', 'de', 'es', 'fr', 'ru', 'ko', 'zh-hans', 'zh-hant'];
  assert.ok(/const CS_MIN\s*=\s*1886\s*,/.test(TB), 'CShapes no longer starts at 1886 — the Sources page says it does');
  /* ⚠⚠⚠ (#R679) THIS ONCE READ THE FALLBACK LIST AND THEREFORE CHECKED NOTHING: `YEARS` starts at 100,
     so `entry.includes('100')` matched the prose 「100 年刻み」 in every language. The reach is the era
     record's, and it is the number a READER sees (the era magnitude, 123000), not −122999. */
  const HB_FLOOR = HB.window[0];
  const ERA = eraBundle().snaps.map((x) => x.y).sort((a, b) => a - b);
  assert.ok(ERA.length >= 53 && ERA[0] < 1, `the era record lost its deep end: ${ERA[0]}`);
  const OLDEST = String(ERA[0] <= 0 ? 1 - ERA[0] : ERA[0]);
  for (const lg of LANGS) {
    const src = rd('js/locales/pages.' + lg + '.js');
    const i = src.indexOf('historical-basemaps (aourednik)');
    assert.ok(i > 0, `pages.${lg}.js has no historical-basemaps entry`);
    const entry = src.slice(i, src.indexOf('\n', i));
    assert.ok(entry.includes('1886'), `pages.${lg}.js does not say where CShapes stops`);
    assert.ok(entry.includes(OLDEST), `pages.${lg}.js does not say how far back the snapshots go (${OLDEST})`);
    /* ⚠ (#R690) the day-exact floor is the bundle's own `window[0]`, derived at build time — typing
       «1850» here would have failed the round that took the record down to 1689 for telling the truth */
    assert.ok(entry.includes(String(HB_FLOOR)),
      `pages.${lg}.js does not say where the day-exact record starts (${HB_FLOOR})`);
  }
});

/* ══ #R518 — the borders of 1850–1885 ═══════════════════════════════════════════════════════
   「1850–1885の国境を本気で埋めて」 The clock reached 1850; CShapes begins 1886-01-01; between them the
   app had NO polygons, and `nearest()` answered all thirty-six years with world_1880. */

/* ⚠ (#R690) THE BAND #R518 BUILT IS NOW PART OF A WIDER ONE, so the claim is «1850-1885 is still
   inside it and still full» — pinning the equality would fail the widening it was meant to survive. */
test('#R518 ① every year of 1850-1885 has a world to draw', () => {
  assert.ok(HB.window[0] <= 1850 && HB.window[1] >= 1885,
    'the record no longer covers the band #R518 built it for: ' + JSON.stringify(HB.window));
  const thin = [];
  for (let y = 1850; y <= 1885; y++) {
    const n = aliveOn(y, 6, 15).length;
    if (n < 100) thin.push(y + ':' + n);
  }
  assert.deepEqual(thin, [], 'years with fewer than 100 polities: ' + thin.join(', '));
});

test('#R518 ① the window carries far more than the one frame it replaced', () => {
  const b = new Set();
  for (const f of HB.feats) { b.add(ymd(f[2], f[3], f[4])); b.add(ymd(f[5], f[6], f[7])); }
  const inWin = [...b].filter((k) => k >= ymd(1850, 1, 1) && k <= ymd(1885, 12, 31));
  assert.ok(inWin.length >= 200, 'only ' + inWin.length + ' transition dates in the window');
});

/* each of these is a polity the 1880 snapshot cannot contain, drawn on a date it demonstrably existed */
test('#R518 ① the states that only exist inside this window are in it', () => {
  const want = [
    [1863, 'Confederate States'],              /* 1861-1865, in twelve day-dated steps */
    [1859, 'Kingdom of the Two Sicilies'],     /* to 1860 */
    [1860, 'Papal States'],                    /* to 1870 */
    [1860, 'Kingdom of Prussia'],              /* to 1871 */
    [1860, 'Hanover'],                         /* annexed 1866 */
    [1855, 'Russian America'],                 /* sold 1867 */
  ];
  const missing = [];
  for (const [y, nm] of want) {
    if (!aliveOn(y, 6, 15).some((f) => f[0].en === nm)) missing.push(y + ' ' + nm);
  }
  assert.deepEqual(missing, [], 'absent from the record: ' + missing.join(' | '));
});

test('#R518 ② OHM end dates really are exclusive in this data', () => {
  /* the measurement the convention rests on, re-taken from the shipped file */
  const by = new Map();
  for (const f of HB.feats) { if (!f[1]) continue; const a = by.get(f[1]); a ? a.push(f) : by.set(f[1], [f]); }
  let pairs = 0, touching = 0, overlap = 0;
  for (const arr of by.values()) {
    arr.sort((a, b) => ymd(a[2], a[3], a[4]) - ymd(b[2], b[3], b[4]));
    for (let i = 0; i + 1 < arr.length; i++) {
      pairs++;
      const e = ymd(arr[i][5], arr[i][6], arr[i][7]), s = ymd(arr[i + 1][2], arr[i + 1][3], arr[i + 1][4]);
      if (e === s) touching++; else if (e > s) overlap++;
    }
  }
  assert.ok(pairs > 50, 'too few successions to judge (' + pairs + ')');
  /* ⚠ what must be zero is the OVERLAP — and it was 107 of 176 when parseDate added a day to a day-exact end */
  assert.equal(overlap, 0, overlap + ' of ' + pairs + ' successions overlap — the end is being read as inclusive somewhere');
  assert.ok(touching / pairs > 0.3,
    'only ' + touching + '/' + pairs + ' successions touch — the exclusive-end reading no longer describes this data');
});

test('#R518 ② the selector reads the end exclusively, and csFC still reads its own inclusively', async () => {
  /* EVALUATED (was: three regexes over the two bodies). `hbFC` and `csFC` are LIFTED by their braces
     (tests/helpers/lift-function.mjs — #R531: a body taken by what it returns swallowed its
     neighbour) and run on one record whose last day is 1871-01-18. Everything they call besides the
     date test — geometry, line, name tables — is stubbed, because the date test is the subject.
     ⚠ (hist-bundles-off-main) THE DATE TEST ITSELF NOW RUNS WHERE THE RECORD IS: each selector asks
     its handle `at(t, end)`, and the handle here is the REAL job of js/hist-bundles.js holding the
     one-record bundle — so what is measured is both halves, the end each selector names and the
     predicate that end selects. A stub for the handle would measure neither. */
  const ymdDecl = /const _ymd=([^;\n]+);/.exec(TBC);
  assert.ok(ymdDecl, 'js/time-borders.js no longer declares _ymd');
  const hbw = {}; vm.runInContext(rd('js/hist-bundles.js'), vm.createContext({ window: hbw, Map, Set, WeakMap, Uint8Array, Promise, Error, JSON }));
  const job = hbw.IntMapHistBundles.histJob;
  const handle = (global, d) => { const S = {}; job(S, { op: 'adopt', global, value: d }, () => {});
    return { at: async (t, end) => job(S, { op: 'at', global, t, end }, () => {}) }; };
  const hb = { feats: [[{ en: 'OHM polity' }, 'Q1', 1860, 1, 1, 1871, 1, 18, []]] };
  const cs = { feats: [['CShapes polity', 999, 1860, 1, 1, 1871, 1, 18, []]] };
  const make = new Function('d0', 'H0', 'H1', 'var _ymd=' + ymdDecl[1] + '; var _lnOf=new WeakMap();'
    + 'var _hbGeomOf=function(){return null;},_hbLineOf=function(){return null;},_csGeomOf=function(){return null;},_csLineOf=function(){return null;},_csD=d0,_hbH=H0,_csH=H1;'
    + 'var hnFor=function(){return null;}; var _csName=function(n){return n;}; var _lineFeat=function(g){return g;};\n'
    + 'async ' + liftFunction(TBC, 'hbFC') + '\nasync ' + liftFunction(TBC, 'csFC') + '\nreturn { hbFC: hbFC, csFC: csFC };');
  const F = make(cs, handle('__HISTB', hb), handle('__CSHAPES', cs));
  const n = async (p) => (await p).features.length;
  assert.equal(await n(F.hbFC(hb, 1871, 1, 17)), 1, 'hbFC dropped a record the day before it ends');
  assert.equal(await n(F.hbFC(hb, 1871, 1, 18)), 0, 'hbFC must skip a record whose end is at or before the day');
  assert.equal(await n(F.csFC(cs, 1871, 1, 18)), 1, 'csFC must keep a record whose end IS the day');
  assert.equal(await n(F.csFC(cs, 1871, 1, 19)), 0, 'csFC must not adopt the exclusive reading — nor keep a record after its last day');
});

test('#R518 ② and no day of the window draws the same entity twice', () => {
  /* the failure the convention prevents, checked where it would actually show */
  const b = new Set();
  for (const f of HB.feats) { b.add(ymd(f[2], f[3], f[4])); b.add(ymd(f[5], f[6], f[7])); }
  const dates = [...b].filter((k) => k >= ymd(1850, 1, 1) && k <= ymd(1885, 12, 31));
  const dup = [];
  for (const k of dates) {
    const y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100;
    const seen = new Set();
    for (const f of aliveOn(y, m, d)) {
      if (!f[1]) continue;
      if (seen.has(f[1])) dup.push(k + ' ' + f[0].en);
      seen.add(f[1]);
    }
  }
  assert.deepEqual(dup.slice(0, 8), [], dup.length + ' duplicate(s), e.g. ' + dup.slice(0, 8).join(' | '));
});

test('#R518 ③ every record has an English name, and the language keys are the app\'s own', () => {
  const codes = new Set(['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']);
  const bad = [];
  for (const f of HB.feats) {
    if (!f[0] || !f[0].en) { bad.push('a record with no English name'); continue; }
    for (const k of Object.keys(f[0])) if (!codes.has(k)) bad.push(f[0].en + ' carries an unknown language key ' + k);
  }
  assert.deepEqual(bad.slice(0, 6), []);
  /* ⚠ the population is the SHIPPED ui.<code>.js files — a language added to the app appears there */
  const shipped = new Set(readdirSync(join(ROOT, 'js/locales'))
    .map((f) => /^ui\.(.+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]));
  assert.ok(shipped.size >= 9, 'only ' + shipped.size + ' ui.<code>.js files found');
  for (const c of codes) assert.ok(shipped.has(c), 'the record carries names for ' + c + ' but the app ships no ui.' + c + '.js');
  const noNames = [...shipped].filter((c) => !codes.has(c));
  assert.deepEqual(noNames, [], 'the app ships these languages and the border record has no names for them: ' + noNames.join(', '));
});

test('#R518 ③ the record is genuinely multilingual, not English nine times', () => {
  const per = {};
  for (const c of ['jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) per[c] = HB.feats.filter((f) => f[0][c]).length;
  for (const c of Object.keys(per)) assert.ok(per[c] >= 200, c + ' has only ' + per[c] + ' names');
});

test('#R518 ③ tagSame reads the record\'s own name BEFORE _eraLocName', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE ORDER INSIDE `tagSame`: its else-branch writes the label into a
     collection a live renderer holds, and the ORDER has to be read off the expression — the comment
     above it names `_eraLocName` first, so a positional comparison passes whichever way it runs. */
  assert.match(TB, /const loc=own\|\|_eraLocName\(nm\);/,
    'the else-branch of tagSame no longer prefers the record\'s own name over _eraLocName');
  assert.match(TB, /const own=\(f\.properties\._i18n&&\(f\.properties\._i18n\[lg\]\|\|null\)\)\|\|null;/,
    'tagSame no longer reads _i18n for the current language');
  /* ⚠ AND hbFC MUST ACTUALLY PUT IT THERE — asked of the FEATURE, not of the spelling (#R695). */
  const { api } = timeBorders({ lang: 'jp', year: 1800 });
  const feat = api.histNameFor('histBorders', 'Kahlur State', 'Q860407', { en: 'Kahlur State', jp: 'カフルール' });
  assert.equal(feat && feat.en, 'Kahlur State', 'hbFC no longer attaches the name tuple to the feature');
  assert.equal(feat.jp, 'カフルール', "the record's own name must survive the merge, whatever the table says");
});

/* ⚠ SPELLING, ON PURPOSE: `go()` injects bundles with <script> tags and dispatches into a live
   renderer; the ORDER of its two branches is what is asserted. */
test('#R518 ④ go() serves the day-exact band from the bundle, above the snapshot fallback', () => {
  const m = /const HB_MIN=(-?\d+), ?HB_MAX=(\d+);/.exec(TB);
  assert.ok(m, 'go() no longer declares the day-exact band');
  assert.ok(+m[1] <= 1850 && +m[2] >= 1885, 'the declared band no longer contains 1850-1885');
  const go = TB.slice(TB.indexOf('async function go(when)'));
  const band = go.indexOf('year>=HB_MIN&&year<=HB_MAX');
  const fall = go.indexOf('const ny=nearest(');
  assert.ok(band > 0, 'go() has no 1850-1885 band');
  assert.ok(band < fall, 'the snapshot fallback is reached before the bundle');
});

/* ⚠ (#R604) THE TWO FLOORS ARE NO LONGER ONE NUMBER: the clock reaches below the day-exact record
   because the SUBDIVISIONS do, and below it the country answer is the era series. So the assertion
   is «the record is REACHABLE and does not start above the clock». */
test('#R518 ④ the day-exact country record is reachable from the clock, and says where it stops', () => {
  const floor = clockFloor();
  assert.ok(Number.isInteger(floor), 'the kernel declares no floor');
  assert.ok(HB.window[0] >= floor, 'the record starts somewhere the clock cannot reach');
  assert.ok(HB.window[0] <= 1850 && HB.window[1] >= 1885,
    'data/hist-borders.js no longer covers the band #R518 built it for: ' + JSON.stringify(HB.window));
  /* ⚠ (#R679) asking the fallback list how far the map reaches is asking the spare tyre how far the car goes */
  const YEARS = eraBundle().snaps.map((s) => s.y).sort((a, b) => a - b);
  assert.ok(YEARS.some((y) => y < 1), 'the era record has nothing before the common era');
  assert.ok(YEARS[0] <= floor,
    `the clock reaches ${floor} and the oldest thing that can answer is ${YEARS[0]}`);
});

test('#R518 ④ the change-date API asks BOTH records', async () => {
  /* EVALUATED (was: regexes that `_allBounds` names hbBounds and csBounds and that the three change
     functions call it). Each record is handed one transition the other does not have; the stepper
     must walk onto both, forwards and backwards, and list both. */
  const { api, window: w } = timeBorders({ lang: 'en', year: 1870 });
  const HSc = w.IntMapHistScale;
  w.__HISTB = { window: [1689, 1885], rings: [], feats: [[{ en: 'H' }, null, 1870, 5, 6, 1880, 2, 3, []]] };
  w.__CSHAPES = { rings: [], feats: [['C', 2, 1900, 3, 4, 1950, 1, 1, []]] };
  const at = (y, m, d) => HSc.utcAt(y, m - 1, d, 12);
  const day = (x) => (x ? HSc.ymd(x) : null);
  assert.equal(day(await api.changeAfter(at(1870, 1, 1))), '1870-05-06', 'changeAfter still reads only one record\'s dates (the day-exact one is missing)');
  assert.equal(day(await api.changeAfter(at(1890, 1, 1))), '1900-03-04', 'changeAfter still reads only one record\'s dates (CShapes is missing)');
  assert.equal(day(await api.changeBefore(at(1899, 1, 1))), '1880-02-03', 'changeBefore still reads only one record\'s dates');
  const all = (await api.changeDates()).map(day);
  for (const d of ['1870-05-06', '1880-02-03', '1900-03-04']) assert.ok(all.includes(d), 'changeDates lost ' + d + ': ' + all.join(' '));
  /* ⚠ (#R695) THE REACH IS ASKED OF THE FUNCTION — the era sheets are in the stepper's list, so the
     published floor moved DOWN; a floor that rose back to CShapes is the defect. */
  const r = api.range();
  assert.ok(r.min < 1886, 'the published range still starts at CShapes — everything below it is unreachable from the stepper');
  assert.equal(r.max, HB.window ? Math.max(r.max, HB.window[1]) : r.max);
});

/* ⚠ (#R530) THE LICENCE THIS PINS WAS WRONG ONCE, AND A CHECK THAT PINS A WRONG FACT KEEPS IT:
   OpenHistoricalMap is CC0 (its /copyright page and its Overpass API, both measured 2026-09-07).
   The claim is unchanged: the source is credited on the map and on the Sources page, in all nine.
   ⚠ SPELLING, ON PURPOSE, FOR THE MAP CREDIT: it is the `attribution` of a renderer source. */
test('#R518 ⑤ OpenHistoricalMap and its licence are credited on the map and on the Sources page', () => {
  assert.match(TB, /attribution:'[^']*OpenHistoricalMap \(CC0\)[^']*'/, 'the map source no longer credits OHM');
  assert.match(rd('js/reference-data.js'), /OpenHistoricalMap \(CC0 1\.0\)/, 'the Sources registry has no OHM row');
  const missing = [];
  for (const c of ['en', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh-hant', 'zh-hans']) {
    const s = rd('js/locales/pages.' + c + '.js');
    if (!s.includes('OpenHistoricalMap (CC0 1.0)')) missing.push(c + ' (key)');
    /* ⚠ (#R530) ASK THE ENTRY, NOT THE FILE — every locale satisfies /ODbL 1\.0\./ through other rows */
    else {
      const entry = new RegExp('["\']OpenHistoricalMap \\(CC0 1\\.0\\)["\']\\s*:\\s*(["\'])((?:\\\\.|(?!\\1)[^\\\\])*)\\1').exec(s);
      if (!entry) missing.push(c + ' (unreadable entry)');
      else if (!/CC0/.test(entry[2])) missing.push(c + ' (licence line)');
    }
    /* the claim this round made false must be gone from every language, not just English */
    if (/1880[^"']{0,40}(?:borders|Grenzen|fronteras|frontières|границ|국경|国境|國界|国界)/.test(s)
        && !/hist-borders|OpenHistoricalMap/.test(s)) missing.push(c + ' (still says 1880 answers the era)');
  }
  assert.deepEqual(missing, [], 'sources page: ' + missing.join(', '));
});

/* ── the click resolver, RUN (#R710's harness): `resolveHist` and the helpers it calls are lifted out
   of js/time-borders.js by the AST and run against two stub modern carriers ─────────────────────── */
const functions = new Map();
simple(parse(TB, { ecmaVersion: 'latest', sourceType: 'module' }), {
  FunctionDeclaration(n) { functions.set(n.id.name, TB.slice(n.start, n.end)); },
});
const square = (a, b) => ({ type: 'Polygon', coordinates: [[[a, -90], [b, -90], [b, 90], [a, 90], [a, -90]]] });
function clickHarness() {
  const ctx = {
    HOST: { lang: 'en' }, countryStats: {
      AAA: { nameEn: 'Modern western country', wiki: 'Modern_west', flag: 'western flag' },
      BBB: { nameEn: 'Modern eastern country', wiki: 'Modern_east', flag: 'eastern flag' },
    },
    window: { countryGeo: { features: [{ id: 'AAA', geometry: square(-180, 0) }, { id: 'BBB', geometry: square(0, 180) }] } },
    cache: new Map(), shownY: 1500, _hn: JSON.parse(rd('data/histnames.json')),
    _LTB: { arr: n => Array.isArray(n) ? n[0] : n },
    _VANISHED: [], _GW2ISO: { 123: 'AAA' }, _ERA_WIKI: {},
    _ERA_LOC: [], _COLONIZER: {}, _normNm: n => n.toLowerCase().trim(),
  };
  vm.createContext(ctx);
  vm.runInContext(['_bbox', '_bboxArea', '_contains', 'featureAt', 'hnFor', '_eraLocName', 'resolveHist'].map(n => functions.get(n)).join('\n'), ctx);
  return { ctx, resolve(name, properties = {}, lng = -20) {
    const f = { properties: { NAME: name, ...properties }, geometry: square(-40, 40) };
    ctx.cache.set(ctx.shownY, { features: [f] });
    return ctx.resolveHist(name, { lng, lat: 20 });
  } };
}

/* ⑥ a click answers with the polity that was clicked. Measured before this was added: a click on the
   Kingdom of the Two Sicilies in 1860 answered «Italy» with the article for the Kingdom of Sardinia,
   because resolveHist resolves to a modern country for the statistics and then overwrote name and
   Wikipedia with that country's. The carrier still supplies `code`; the identity must not come from it. */
test('#R518 ⑥ resolveHist keeps the record\'s own identity over its modern carrier\'s', () => {
  /* EVALUATED (was: three regexes for `if(!same){ out.name=hbLoc…`, the «same state» test and the
     carrier-flag guard). The resolver is run on a polity whose CShapes carrier is a modern country. */
  const h = clickHarness();
  const two = h.resolve('Kingdom of the Two Sicilies', { _gw: 123 });
  assert.equal(two.code, 'AAA', 'the carrier no longer supplies the statistics code');
  assert.equal(two.name, 'Kingdom of the Two Sicilies', 'resolveHist no longer restores the 1850-1885 record\'s own name and article');
  assert.equal(two.wiki, 'Kingdom_of_the_Two_Sicilies', 'resolveHist no longer restores the 1850-1885 record\'s own name and article');
  assert.equal(two.flag, null, 'the carrier\'s flag is put back on a polity that is not the carrier');
  /* …and «is it really the same state» still holds: a polity that IS the carrier keeps the carrier's detail */
  const same = h.resolve('Modern western country');
  assert.equal(same.wiki, 'Modern_west', 'the «is it really the same state» test is gone — every carrier name would be overwritten');
  assert.equal(same.flag, 'western flag');
  /* and the names those titles are built from have to look like article titles */
  const odd = HB.feats.filter((f) => /[\/#|<>\[\]{}]/.test(f[0].en)).map((f) => f[0].en);
  assert.deepEqual(odd.slice(0, 5), [], 'names that cannot become a Wikipedia title: ' + odd.slice(0, 5).join(' | '));
});

test('#R518 ⑦ scripts/build-hist-borders.mjs --check passes', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-hist-borders.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /hist-borders ok/);
});

test('R710: historical identity is independent of translation availability and the modern country under the tap', () => {
  const h = clickHarness();
  for (const properties of [{}, { _i18n: { en: 'Historical polity', jp: '歴史上の政体' } }]) {
    const west = h.resolve('Historical polity', properties, -20);
    const east = h.resolve('Historical polity', properties, 20);
    assert.equal(west.code, 'AAA'); assert.equal(east.code, 'BBB', 'statistical carriers remain available');
    for (const result of [west, east]) {
      assert.equal(result.name, 'Historical polity'); assert.equal(result.wiki, 'Historical_polity');
      assert.equal(result.flag, null, 'a statistical carrier cannot lend its modern flag');
      assert.equal(result.geometry.coordinates[0][0][0], -40, 'the full historical territory is retained');
    }
  }
  h.ctx.HOST.lang = 'jp';
  assert.equal(h.resolve('Historical polity', { _i18n: { en: 'Historical polity', jp: '歴史上の政体' } }).name, '歴史上の政体');
  assert.equal(h.resolve('Untranslated polity').name, 'Untranslated polity');
});

test('R710: source QID translations and CShapes carrier IDs enrich without replacing the historical identity', () => {
  const h = clickHarness(); h.ctx.HOST.lang = 'jp';
  const [qid, row] = Object.entries(h.ctx._hn.byQid).find(([, r]) => r.n.jp);
  const own = h.ctx.hnFor('histBorders', 'Source polity', qid, { en: 'Source polity' });
  const result = h.resolve('Source polity', { _i18n: own, _gw: 123 });
  assert.equal(result.code, 'AAA'); assert.equal(result.name, row.n.jp); assert.equal(result.wiki, 'Source_polity');
  assert.equal(result.flag, null);
  assert.equal(h.resolve('Colonial polity (Possessor)', { _gw: 123 }).wiki, 'Colonial_polity');
});

test('R710: same-name country and attested former-state identity retain their existing detail', () => {
  const h = clickHarness();
  const unchanged = h.resolve('Modern western country');
  assert.equal(unchanged.wiki, 'Modern_west'); assert.equal(unchanged.flag, 'western flag');
  h.ctx.window.IntMapHistStates = { STATES: [{ code: 'FORMER', name: 'Former state', wiki: 'Former_state', flag: 'era flag' }], hbRe: () => /^Former state$/ };
  const former = h.resolve('Former state');
  assert.equal(former.name, 'Former state'); assert.equal(former.wiki, 'Former_state'); assert.equal(former.flag, 'era flag');
});

test('R710: every shipped era spelling remains its own identity without a translation table', () => {
  const h = clickHarness(), bundle = { window: {} };
  vm.createContext(bundle); vm.runInContext(rd('data/hist-eras.js'), bundle);
  const names = new Set(bundle.window.__HISTERAS.snaps.flatMap(s => s.feats.map(f => f[0].en)).filter(Boolean));
  for (const name of names) {
    const result = h.resolve(name);
    assert.equal(result.name, name, name + ' must not become the modern country beneath it');
    assert.notEqual(result.wiki, 'Modern_west'); assert.notEqual(result.wiki, 'Modern_east');
    assert.equal(result.flag, null);
  }
  console.log('Historical identity census: ' + names.size + ' distinct shipped spellings retain their source identity.');
});

/* ══ #R690 — the borders below 1850 became a record instead of a snapshot ════════════════════
   「1850年より前の国境を、スナップショットから日単位の記録へ」 2,101 of OHM's 3,985 admin_level=2 relations
   END before 1850, so 53% of what it publishes sat under the window. The bundle now runs from 1689. */
const ringArea = (r) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
const polyArea = (polys) => { let a = 0; for (const p of polys) p.forEach((ring, k) => { a += (k === 0 ? 1 : -1) * Math.abs(ringArea(ring)); }); return a; };

test('#R690 ① the day-exact record reaches below 1850 and carries far more than #R518 shipped', () => {
  assert.ok(HB.window[0] < 1850, 'the record still stops at ' + HB.window[0] + ' — the widening is gone');
  assert.equal(HB.window[1], 1885, 'the record no longer stops where CShapes begins');
  /* #R518 shipped 494 records; a rebuild that lost the widened half would still be well-formed */
  assert.ok(HB.feats.length > 900, 'only ' + HB.feats.length + ' records — #R518 alone shipped 494');
  const b = new Set();
  for (const f of HB.feats) { b.add(ymd(f[2], f[3], f[4])); b.add(ymd(f[5], f[6], f[7])); }
  const below = [...b].filter((k) => k >= ymd(HB.window[0], 1, 1) && k < ymd(1850, 1, 1));
  assert.ok(below.length > 300, 'only ' + below.length + ' transition dates below 1850 — this is what «day by day» means here');
});

/* ⚠ each of these was gone before 1850, and each is a different reason the frozen frame was wrong */
test('#R690 ① the states that only the widened band can show are in it, on the right dates', () => {
  const want = [
    [1789, /^Holy Roman Empire$/, 'dissolved 1806'],
    [1789, /^Kingdom of Great Britain$/, '1707-1800, before the union with Ireland'],
    [1789, /^Republic of Venice$/, 'extinguished 1797'],
    [1789, /^Poland-Lithuania$/, 'partitioned away by 1795'],
    [1700, /^Mughal Empire$/, 'at its greatest extent'],
    [1700, /^Qing$/, 'the dynasty the 1880 frame cannot date'],
    [1750, /^Ottoman Empire$/, 'between the treaties'],
  ];
  const missing = [];
  for (const [y, re, why] of want) if (!hbAlive(y).some((f) => re.test(f[0].en))) missing.push(y + ' ' + re.source + ' (' + why + ')');
  assert.deepEqual(missing, [], 'absent from the record: ' + missing.join(' | '));
  /* and the partitions really are separate dated records, not one polygon with one span */
  const pl = HB.feats.filter((f) => /^Poland-Lithuania$/.test(f[0].en));
  assert.ok(pl.length >= 3, 'Poland-Lithuania is ' + pl.length + ' record(s) — the partitions have been flattened');
});

/* ⚠ THE BAR IS ASKED OF data/cshapes.js, THE RECORD NEXT DOOR (world_1815 sums to a third more than
   there is land on Earth, so a bar built on the era sheets measures how contested an era was) */
const csWorld = () => {
  let min = Infinity, max = 0;
  for (let y = 1886; y <= 2019; y++) {
    const t = ymd(y, 6, 15); let a = 0;
    for (const f of CS.feats) if (ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) >= t)
      a += polyArea(f[8].map((poly) => poly.map((ri) => CS.rings[ri])));
    if (a < min) min = a; if (a > max) max = a;
  }
  return { min, max, bar: min - (max - min) };
};

test('#R690 ② every year of the window covers as much of the world as CShapes does', () => {
  const { bar } = csWorld();
  assert.ok(bar > 0 && Number.isFinite(bar), 'the bar could not be derived from data/cshapes.js');
  const thin = [];
  for (let y = HB.window[0]; y <= HB.window[1]; y++) {
    const a = hbAlive(y).reduce((s, f) => s + polyArea(f[8].map((poly) => poly.map((ri) => HB.rings[ri]))), 0);
    if (a < bar) thin.push(y + ':' + a.toFixed(0));
  }
  assert.deepEqual(thin.slice(0, 8), [], thin.length + ' year(s) under the ' + bar.toFixed(0) + ' deg² a world takes: ' + thin.slice(0, 8).join(', '));
});

/* ⚠ «why not LOWER than 1689» needs the ~2.1 GB Overpass download; offline, the floor is shown to be
   TIGHT (above) and the builder is shown to compute it rather than read a literal (here).
   ⚠ SPELLING, ON PURPOSE: the builder's floor derivation runs over that download. */
test('#R690 ② the builder derives the floor instead of spelling one', () => {
  assert.doesNotMatch(BUILD, /(const|let|var)\s+Y_MIN\s*=\s*-?\d/, 'the builder has gone back to a typed floor');
  assert.match(BUILD, /window:\s*\[floor,\s*Y_MAX\]/, 'the bundle no longer records the derived floor');
  const derive = liftFunction(codeOnly(BUILD), 'cshapesWorld');
  assert.match(derive, /min\s*-\s*\(\s*max\s*-\s*min\s*\)/, 'the bar is no longer CShapes\' own spread below its own minimum');
  assert.match(derive, /1886/, 'the bar is no longer measured over CShapes\' own reach');
});

/* HB_MIN exists only because `go()` must decide whether to inject a 13 MB file before it can read it.
   ⚠ SPELLING, ON PURPOSE, FOR THE COPY: it is that copy's equality with the bundle that is asserted. */
test('#R690 ③ HB_MIN and HB_MAX are the bundle\'s own window, to the year', () => {
  const m = /const HB_MIN=(-?\d+), ?HB_MAX=(\d+);/.exec(TB);
  assert.ok(m, 'js/time-borders.js no longer declares the band');
  assert.equal(+m[1], HB.window[0], 'HB_MIN has drifted from the bundle\'s derived floor');
  assert.equal(+m[2], HB.window[1], 'HB_MAX has drifted from the bundle\'s own top');
  /* ⚠ (#R695) the stepper's reach is ASKED OF THE FUNCTION */
  const { api } = timeBorders({ lang: 'en' });
  const r = api.range();
  assert.ok(r && Number.isFinite(r.min) && Number.isFinite(r.max), 'the stepper publishes no reach at all');
  assert.ok(r.min <= HB.window[0], 'the published range starts above this record — its band is unreachable from the stepper');
  assert.ok(r.max >= HB.window[1], 'the published range ends below this record');
});

/* ⚠ SPELLING, ON PURPOSE: the per-instant fall-through is `go()`'s dispatch (see #R518 ④). The
   comments come off first — the prose beside the band names `fc.features.length` to explain it. */
test('#R690 ④ a day inside the band with nothing to draw still reaches the snapshot below', () => {
  const code = codeOnly(TB);
  const go = code.slice(code.indexOf('async function go(when)'));
  const band = go.indexOf('year>=HB_MIN&&year<=HB_MAX');
  const guard = go.indexOf('fc&&fc.features.length');
  const fall = go.indexOf('const ny=nearest(');
  assert.ok(band > 0 && guard > band, 'the 1689-1885 band no longer tests that the collection has features');
  assert.ok(guard < fall, 'the snapshot fallback is reached before the bundle');
  /* and the CShapes band above must NOT have grown the same guard — an empty year there is a real answer */
  const cs = go.slice(go.indexOf('year>=CS_MIN&&year<=CS_MAX'), band);
  assert.doesNotMatch(cs, /features\.length/, 'the CShapes band has adopted the fall-through it must not have');
});

/* ⚠ EVALUATED, NOT GREPPED (#R505): `waysOf` is lifted out of the builder and run */
test('#R690 ⑤ only outer/inner/role-less ways are outline, and only a role-less relation is recursed into', () => {
  const src = liftFunction(codeOnly(BUILD), 'waysOf');
  const BOUNDARY_WAY = new Set(['outer', 'inner', '']);
  const waysOf = new Function('BOUNDARY_WAY', src + '; return waysOf;')(BOUNDARY_WAY);
  const pt = (n) => [{ lon: n, lat: n }, { lon: n + 1, lat: n }];
  const child = { id: 2, members: [{ type: 'way', role: 'outer', geometry: pt(50) }] };
  const rel = { id: 1, members: [
    { type: 'way', role: 'outer', geometry: pt(0) },
    { type: 'way', role: 'inner', geometry: pt(10) },
    { type: 'way', role: '', geometry: pt(20) },
    { type: 'way', role: 'label', geometry: pt(30) },
    { type: 'way', role: 'admin_centre', geometry: pt(40) },
    { type: 'relation', role: 'subarea', ref: 2 },
  ] };
  const resolve = (id) => (id === 2 ? child : null);
  const got = waysOf(rel, resolve);
  assert.deepEqual(got.map((w) => w.pts[0][0]).sort((a, b) => a - b), [0, 10, 20],
    'label / admin_centre / subarea are being read as boundary');
  /* …and a role-LESS relation member IS the boundary — the whole geometry of the Confederate States */
  const only = { id: 3, members: [{ type: 'relation', role: '', ref: 2 }] };
  assert.deepEqual(waysOf(only, resolve).map((w) => w.pts[0][0]), [50],
    'a role-less relation member is no longer expanded — the Confederate States have no geometry without it');
});

test('#R690 ⑥ the builder does no date arithmetic through Date.UTC', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE BAN: «no Date.UTC anywhere in the builder» is a claim over every
     line of it (#R602 measured the trap in four places); the replacement is then RUN. */
  assert.doesNotMatch(codeOnly(BUILD), /Date\.UTC/,
    'Date.UTC applies the two-digit-year rule below year 100 (#R602) and this record now reaches years it would corrupt');
  const nextDay = new Function('MLEN', 'isLeap', liftFunction(codeOnly(BUILD), 'nextDay') + '; return nextDay;')(
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0);
  assert.deepEqual(nextDay([1700, 2, 28]), [1700, 3, 1], '1700 is not a leap year');
  assert.deepEqual(nextDay([1704, 2, 28]), [1704, 2, 29], '1704 is');
  assert.deepEqual(nextDay([1704, 12, 31]), [1705, 1, 1]);
  assert.deepEqual(nextDay([1689, 6, 15]), [1689, 6, 16]);
});

/* ⚠ RUN, DO NOT READ: #R669 keyed a 3.4 GB cache by batch position and lost all of it */
test('#R690 ⑦ a relation is found in the cache by its own id, whatever batch it arrived in', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-histb-test-'));
  try {
    mkdirSync(join(dir, 'geom'), { recursive: true });
    writeFileSync(join(dir, 'geom', '100.json'), JSON.stringify({ elements: [
      { type: 'relation', id: 100, members: [] }, { type: 'relation', id: 101, members: [] }] }));
    writeFileSync(join(dir, 'geom', '200.json'), JSON.stringify({ elements: [{ type: 'relation', id: 200, members: [] }] }));
    assert.equal(migrateBatches(dir), 3, 'the batch files were not brought forward one relation at a time');
    assert.equal(loadGeom(dir, 101).id, 101, 'a relation is still only reachable through its batch');
    assert.equal(loadGeom(dir, 200).id, 200);
    assert.equal(loadGeom(dir, 999), undefined, 'a relation never asked for must be distinguishable from one with no answer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#R690 ⑧ the widened half carries the source\'s own names, not English nine times', () => {
  const below = HB.feats.filter((f) => ymd(f[5], f[6], f[7]) <= ymd(1850, 1, 1));
  assert.ok(below.length > 500, 'only ' + below.length + ' records end before 1850');
  const thin = [];
  for (const c of ['jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) {
    const n = below.filter((f) => f[0][c]).length;
    if (n < below.length * 0.4) thin.push(c + ':' + n + '/' + below.length);
  }
  assert.deepEqual(thin, [], 'languages that thin out below 1850: ' + thin.join(', '));
});

/* ══ #R698 ② — the stepper's label names the sheet the reader asked for ══════════════════════
   `changeAt` read `shownY`, which `go()` assigns only after `await fetchFC(...)`, while the panel that
   draws the label is a synchronous clock subscriber — so the label named the PREVIOUS sheet. ORDER is
   the subject, which no amount of source-reading can see. */
test('#R698 ② changeAt answers from the date, not from what has already been drawn', async () => {
  const { api, window: w } = timeBorders({ lang: 'jp', year: 500 });
  const HSc = w.IntMapHistScale;
  /* the era bundle, published the way the <script> tag publishes it — nothing here fetches */
  w.__HISTERAS = { rings: [], snaps: [{ y: -122999 }, { y: -2999 }, { y: 500 }, { y: 600 }, { y: 1650 }] };
  const day = (d) => (d ? HSc.ymd(d) : null);
  /* ⚠ NOTHING HAS BEEN DRAWN AT ALL — `go()` has never run, so `shownY` is null */
  assert.equal(day(await api.changeAt(HSc.utcAt(-2999, 5, 15, 12))), '-002999-01-01',
    'the label must name the sheet for the instant it was asked about');
  assert.equal(day(await api.changeAt(HSc.utcAt(500, 5, 15, 12))), '0500-01-01');
  assert.equal(day(await api.changeAt(HSc.utcAt(1600, 5, 15, 12))), '1650-01-01',
    'the sheet is chosen by the same nearest() go() uses — 1600 is closer to 1650 than to 500');
  /* ⚠ AND ASKING TWICE IN A ROW, IN THE ORDER A READER TRAVELS, MUST NOT SHOW THE FIRST ANSWER */
  const seen = [];
  for (const y of [1600, 500, -2999, 600]) seen.push(day(await api.changeAt(HSc.utcAt(y, 5, 15, 12))));
  assert.deepEqual(seen, ['1650-01-01', '0500-01-01', '-002999-01-01', '0600-01-01'],
    'the label lags a step behind the reader');
  /* ⚠ THE DAY-EXACT WINDOW IS UNTOUCHED, and asking it needs its own record on `window` — this harness
     has no <script> tag, so hbLoad() would never settle and the test would hang rather than fail */
  w.__HISTB = { window: [1689, 1885], rings: [], feats: [[{ en: 'Y' }, null, 1689, 1, 1, 1885, 12, 31, []]] };
  assert.equal(day(await api.changeAt(HSc.utcAt(1750, 5, 15, 12))), '1689-01-01',
    'the day-exact branch must still answer from the record and the date');
});

/* ══ #R700 — THE RESOLUTION STEP AT THE RECORD HANDOVERS: the property, not the number ════════
   The three records are separate surveys, so the outline visibly changes resolution on the handover
   day (docs/MAP-LAYERS.md §7.13, scripts/asset-report.mjs). ⚠ WHAT IS GUARDED IS NOT «the step is
   2.83×» (that belongs to the upstreams): geometry within an unchanged record stays stable, and a
   handover draws the selected source geometry. ⚠ The record that answers a year comes from RUNNING
   js/time-borders.js's own dispatch; the marks are read by the real js/border-coast.js. */
const bundleJson = (f) => {
  const s = rd('data/' + f);
  return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
};
const HISTB = bundleJson('hist-borders.js');
const CSHAPES = bundleJson('cshapes.js');
const HISTERAS = bundleJson('hist-eras.js');
const IMBCOAST = bundleJson('border-coast.js');
/* js/border-coast.js indexes the marks BY RING IDENTITY, so it must see the very objects the bundles
   pooled — without it every year silently falls through to the snapshot tier (measured: «1700» x4). */
const bcWin = { __IMBCOAST: IMBCOAST, __HISTB: HISTB, __CSHAPES: CSHAPES, __HISTERAS: HISTERAS };
vm.runInContext(rd('js/border-coast.js'),
  vm.createContext({ window: bcWin, Map, Array, console,
    document: { createElement: () => ({ style: {} }), head: { appendChild() {} } } }),
  { filename: 'js/border-coast.js' });
const seamTB = timeBorders({ year: 1700, lang: 'en' });
seamTB.window.__HISTB = HISTB; seamTB.window.__CSHAPES = CSHAPES; seamTB.window.__HISTERAS = HISTERAS;
seamTB.window.IntMapBorderCoast = bcWin.IntMapBorderCoast;

const REGION = { iberia: [-10, 36, 3, 44], japan: [129, 30, 146, 46] };
const RAD = Math.PI / 180;
const haversine = (a, b) => {
  const dlat = (b[1] - a[1]) * RAD, dlon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const inside = (p, bx) => p[0] >= bx[0] && p[0] <= bx[2] && p[1] >= bx[1] && p[1] <= bx[3];
const ringsOf = (g) => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
/* vertices per 100 km and the median edge length inside one window — BOTH (a density alone is
   dominated by how much the coast bends; an edge length alone says nothing about how much line) */
function measure(paths, bx) {
  const seen = new Set(), seg = [];
  for (const r of paths) {
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      if (!inside(a, bx) || !inside(b, bx)) continue;
      /* an edge two polygons share is one edge on the screen, so it is counted once */
      const k = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]))
        ? a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1]
        : b[0] + ',' + b[1] + '|' + a[0] + ',' + a[1];
      if (seen.has(k)) continue;
      seen.add(k);
      const d = haversine(a, b);
      if (d > 0) seg.push(d);
    }
  }
  const km = seg.reduce((s, d) => s + d, 0);
  assert.ok(seg.length > 50, 'the window holds almost no line — it is not measuring the record');
  return { n: seg.length, km, per100km: (seg.length / km) * 100, medKm: median(seg) };
}
const openRing = (r) => {
  const n = r.length;
  return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r.slice(0, n - 1) : r.slice();
};
const resimplify = (paths, tol) => paths.map((r) => {
  const o = openRing(r);
  if (o.length < 4) return r;
  const s = simplifyRing(o, tol);
  return s ? s.concat([s[0]]) : r;
});
/* which record answered — the cache key js/time-borders.js chose, date taken off (not a typed list) */
const recordOf = (key) => String(key).replace(/-?\d+$/, '') || 'snapshot';
const CACHE = new Map();
async function yearAt(y) {
  if (CACHE.has(y)) return CACHE.get(y);
  await seamTB.api._go(y);                     /* the module's own dispatch decides; nothing here does */
  const fc = seamTB.api.currentFC();
  const paths = ((fc && fc.features) || []).flatMap((f) => ringsOf(f.geometry));
  const row = { year: y, key: String(seamTB.api.current()), record: recordOf(seamTB.api.current()), paths, by: {} };
  for (const [name, bx] of Object.entries(REGION)) row.by[name] = measure(paths, bx);
  CACHE.set(y, row);
  return row;
}
const gap = (a, b) => Math.abs(Math.log(b / a));
const WINDOWS = [[1686, 1691], [1883, 1888]];
const SEAMS = [[1688, 1689], [1885, 1886]];

test('#R700 ① the resolution step sits ON the record boundary, and only there', async () => {
  for (const [from, to] of WINDOWS) {
    const rows = [];
    for (let y = from; y <= to; y++) rows.push(await yearAt(y));
    const changes = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].record !== rows[i - 1].record) changes.push(i);
    assert.equal(changes.length, 1,
      from + '-' + to + ': expected exactly one record handover, got ' + changes.length
      + ' (' + rows.map((r) => r.year + ':' + r.record).join(' ') + ')');
    const at = changes[0];
    for (const name of Object.keys(REGION)) {
      const d = rows.map((r) => r.by[name].per100km);
      for (let i = 1; i < rows.length; i++) {
        const g = gap(d[i - 1], d[i]);
        if (i === at) {
          /* A handover may converge after either source is refined — a minimum discontinuity would
             make better geometry fail this regression. */
          assert.ok(Number.isFinite(g));
        } else {
          assert.ok(g <= 0.05, name + ': density moved ' + (Math.exp(g) * 100 - 100).toFixed(1)
            + '% inside one record at ' + rows[i - 1].year + '→' + rows[i].year
            + ' — then the step is not the record boundary');
        }
      }
    }
    /* the rows docs/MAP-LAYERS.md §7.13 tabulates, re-derived — printed, so the table can be refreshed */
    for (const r of rows) {
      if (!SEAMS.flat().includes(r.year)) continue;
      console.log('  ' + r.year + ' ' + r.key + '  '
        + Object.keys(REGION).map((n) => n + ' ' + r.by[n].per100km.toFixed(2) + '/100km, median '
          + r.by[n].medKm.toFixed(1) + ' km').join('   '));
    }
  }
});

const regionalRings = (paths, bx) => new Set(paths.filter(r => r.some(p => inside(p, bx))).map(r => JSON.stringify(r)));
function assertSourceFidelity(paths, source, year, bx, label) {
  const date = year * 10000 + 701; // yearAt() calls the real module's year-only July 1 dispatch.
  const active = source.feats.filter(f => f[2] * 10000 + f[3] * 100 + f[4] <= date
    && (source === CSHAPES ? f[5] * 10000 + f[6] * 100 + f[7] >= date : f[5] * 10000 + f[6] * 100 + f[7] > date));
  const expected = regionalRings(active.flatMap(f => f[8].flatMap(p => p.map(i => source.rings[i]))), bx);
  const actual = regionalRings(paths, bx);
  assert.ok(expected.size > 0, label + ': source fixture is empty');
  assert.ok(actual.size === expected.size && [...actual].every(r => expected.has(r)),
    label + ': dispatched source geometry changed (rings ' + actual.size + ', expected ' + expected.size + ')');
}

test('#R700 ② each handover draws the date-valid source geometry without additional simplification', async () => {
  /* R711: Japan's density log step is 0.246 while its median-edge step is only 0.043 — a ratio between
     those unrelated statistics would reject restored source bends. Compare the dispatched coordinates
     to the active source rings instead, with both end conventions. */
  for (const [index, [a, b]] of SEAMS.entries()) {
    const lo = await yearAt(a), hi = await yearAt(b);
    assert.notEqual(lo.record, hi.record, a + '/' + b + ' are answered by one record — the handover moved');
    const source = [HISTB, CSHAPES][index];
    for (const [name, bx] of Object.entries(REGION)) {
      assertSourceFidelity(hi.paths, source, b, bx, name + ' ' + b);
      if (index === 1) assertSourceFidelity(lo.paths, HISTB, a, bx, name + ' ' + a);
      /* sensitivity: dispatching a coarsened copy must fail */
      assert.throws(() => assertSourceFidelity(resimplify(hi.paths, 0.015), source, b, bx, name + ' lossy copy'),
        /dispatched source geometry changed/);
    }
  }
});

/* the middle record's tolerance is a choice of ours; re-simplifying the SHIPPED rings is a LOWER bound */
const TOL_SWEEP = [0.015, 0.02, 0.03, 0.05];
async function seams(tol) {
  const rows = {};
  for (const y of SEAMS.flat()) rows[y] = await yearAt(y);
  const middle = rows[1689].record;
  const dens = {};
  for (const y of SEAMS.flat()) {
    const r = rows[y];
    const paths = (tol && r.record === middle) ? resimplify(r.paths, tol) : r.paths;
    dens[y] = {};
    for (const [name, bx] of Object.entries(REGION)) dens[y][name] = measure(paths, bx).per100km;
  }
  const out = {};
  for (const name of Object.keys(REGION)) {
    out[name] = { a: dens[1689][name] / dens[1688][name], b: dens[1886][name] / dens[1885][name] };
  }
  return out;
}

test('#R700 ③ coarsening the middle record trades density between the two handovers', async () => {
  /* ⚠ THE CLAIM IS NOT «any change makes it worse»: the SAME move pushes the other handover the other
     way, so the step is traded between the two dates and never removed (AGENTS.md §3-1, not a number). */
  const swept = [];
  for (const tol of [null, ...TOL_SWEEP]) swept.push([tol, await seams(tol)]);
  for (const name of Object.keys(REGION)) {
    for (let i = 1; i < swept.length; i++) {
      const [pt, p] = swept[i - 1], [ct, c] = swept[i];
      const label = name + ' ' + (pt === null ? 'as shipped' : pt) + ' → ' + ct + ': ';
      assert.ok(c[name].a < p[name].a, label + 'coarsening the middle record did not shrink the 1688→1689 step ('
        + p[name].a.toFixed(2) + '× → ' + c[name].a.toFixed(2) + '×) — then it is not our simplification that sets it');
      assert.ok(c[name].b > p[name].b, label + 'the 1885→1886 handover did not move the other way ('
        + p[name].b.toFixed(2) + '× → ' + c[name].b.toFixed(2)
        + '×) — then the trade-off scripts/asset-report.mjs states is not there');
    }
  }
});

test('#R700 ④ the coarse-only sweep reports both handovers without requiring a nonzero gap', async () => {
  const rows = [];
  for (const tol of [null, ...TOL_SWEEP]) rows.push([tol, await seams(tol)]);
  const shipped = rows[0][1];
  for (const name of Object.keys(REGION)) {
    /* the arithmetic floor: the middle record can at best meet the other two halfway */
    const floor = Math.sqrt(Math.abs(shipped[name].a * shipped[name].b));
    let best = Infinity;
    for (const [, s] of rows) {
      best = Math.min(best, Math.max(Math.abs(Math.log(s[name].a)), Math.abs(Math.log(s[name].b))));
    }
    assert.ok(best >= Math.log(floor) * 0.9,
      name + ': a step of ' + Math.exp(best).toFixed(2) + '× was reached, below the ' + floor.toFixed(2)
      + '× the two outer records leave — then one of them changed and docs/MAP-LAYERS.md §7.13 must be re-measured');
  }
  /* the measurement the documents quote, re-derived — one command to refresh the table */
  for (const [tol, s] of rows) {
    for (const name of Object.keys(REGION)) {
      console.log('  ' + name + ' tol=' + (tol === null ? 'as shipped' : tol)
        + '  1688→1689 ' + s[name].a.toFixed(2) + '×  1885→1886 ' + s[name].b.toFixed(2) + '×');
    }
  }
});
