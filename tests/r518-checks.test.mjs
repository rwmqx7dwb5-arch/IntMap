/* ============================================================================
 *  #R518 — the borders of 1850–1885
 * ----------------------------------------------------------------------------
 *  「1850–1885の国境を本気で埋めて」
 *
 *  The clock reaches 1850; the bundled CShapes record begins 1886-01-01. Between them the app had
 *  NO polygons at all, and `nearest()` answered all thirty-six years with the one remote snapshot
 *  world_1880 — 1850 drawn with the borders of 1880. data/hist-borders.js (OpenHistoricalMap,
 *  ODbL 1.0) fills that window day by day.
 *
 *  ⚠ WHAT THESE CHECKS EXIST TO STOP, in order of how quietly it would happen:
 *   ① The window going empty again — the bundle dropped, or a rebuild that loses a year.
 *   ② The two end-date conventions being "tidied" into one. OHM's end is EXCLUSIVE and CShapes'
 *      is INCLUSIVE; 151 of the 180 same-entity successions in this window start on the day their
 *      predecessor ends, so one convention for both draws two worlds on every one of those days.
 *   ③ The nine-language names being lost. `tagSame`'s else-branch DELETES `_locName` when
 *      `_eraLocName` returns null, which for «Kurhessen» it always does — so the source's own name
 *      has to be read before that line, and a refactor that reorders them silently reverts to
 *      English for the whole era.
 *   ④ The border stepper staying blind below 1886: its dates come from `changeDates`, which asked
 *      CShapes alone until this round.
 *   ⑤ The ODbL attribution going missing in one of the nine languages. It is the licence, not politeness.
 *   ⑥ A click answering with the modern carrier instead of the polity that was clicked — measured
 *      before the fix: the Kingdom of the Two Sicilies answered «Italy / Kingdom of Sardinia».
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockFloor } from './helpers/hist-scale.mjs';
import { eraBundle } from './helpers/hist-eras.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';   /* (#R695) ask the module, not its source (#R488) */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const TB = rd('js/time-borders.js');

const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const HB = (() => { const w = {}; new Function('window', rd('data/hist-borders.js'))(w); return w.__HISTB; })();
const aliveOn = (y, m, d) => { const t = ymd(y, m, d);
  return HB.feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t); };

/* ① the window is full — every single year of it, not just the ends ---------------------------*/
/* ⚠ (#R690) THE BAND THIS ROUND BUILT IS NOW A PART OF A WIDER ONE, so the claim moves from «the
   window IS 1850-1885» to «1850-1885 is still inside it and still full». The record reaches 1689
   now, and the floor is derived rather than typed — tests/r690-histborders-deep-checks.test.mjs
   holds that half. Pinning the equality here would have made this file fail for the widening it was
   supposed to survive, which is the #R530 shape: a check that pins a fact keeps it. */
test('① every year of 1850-1885 has a world to draw', () => {
  assert.ok(HB.window[0] <= 1850 && HB.window[1] >= 1885,
    'the record no longer covers the band #R518 built it for: ' + JSON.stringify(HB.window));
  const thin = [];
  for (let y = 1850; y <= 1885; y++) {
    const n = aliveOn(y, 6, 15).length;
    if (n < 100) thin.push(y + ':' + n);
  }
  assert.deepEqual(thin, [], 'years with fewer than 100 polities: ' + thin.join(', '));
});

test('① the window carries far more than the one frame it replaced', () => {
  const b = new Set();
  for (const f of HB.feats) { b.add(ymd(f[2], f[3], f[4])); b.add(ymd(f[5], f[6], f[7])); }
  const inWin = [...b].filter((k) => k >= ymd(1850, 1, 1) && k <= ymd(1885, 12, 31));
  assert.ok(inWin.length >= 200, 'only ' + inWin.length + ' transition dates in the window');
});

/* ⚠ the era this fills is the era the app could actually reach, so name the states it is FOR.
   Each of these is a polity the 1880 snapshot cannot contain — it was gone before 1880 — and each
   is drawn on a date it demonstrably existed. A rebuild that loses them has lost the point. */
test('① the states that only exist inside this window are in it', () => {
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

/* ② the two end-date conventions stay two ----------------------------------------------------*/
test('② OHM end dates really are exclusive in this data', () => {
  /* the measurement the convention rests on, re-taken from the shipped file: a successor that
     begins on the day its predecessor "ends" is the normal case, not the exception */
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
  /* ⚠ the bar is «no successor starts before its predecessor ends», not «all of them touch»: a
     state really can vanish with a gap before the next record for the same id. What must be zero
     is the OVERLAP — and it was 107 of 176 when parseDate added a day to a day-exact end. */
  assert.equal(overlap, 0, overlap + ' of ' + pairs + ' successions overlap — the end is being read as inclusive somewhere');
  assert.ok(touching / pairs > 0.3,
    'only ' + touching + '/' + pairs + ' successions touch — the exclusive-end reading no longer describes this data');
});

test('② the selector reads the end exclusively, and csFC still reads its own inclusively', () => {
  /* ⚠ (#R531) THE BODY IS TAKEN BY BRACE, NOT BY WHAT IT RETURNS. This used to end the match at
     `return {type:'FeatureCollection'`; when csFC started returning a local instead, the lazy match
     ran past its end, swallowed hbFC, and this check failed on hbFC's `<=t` while csFC was fine.
     tests/helpers/lift-function.mjs is the one matcher. */
  const hb = liftFunction(codeOnly(TB), 'hbFC');
  const cs = liftFunction(codeOnly(TB), 'csFC');
  assert.match(hb, /_ymd\(f\[5\],f\[6\],f\[7\]\)<=t/, 'hbFC must skip a record whose end is at or before the day');
  assert.match(cs, /_ymd\(f\[5\],f\[6\],f\[7\]\)<t/, 'csFC must keep a record whose end IS the day');
  assert.doesNotMatch(cs, /_ymd\(f\[5\],f\[6\],f\[7\]\)<=t/, 'csFC must not adopt the exclusive reading');
});

test('② and no day of the window draws the same entity twice', () => {
  /* the failure the convention prevents, checked where it would actually show: on every
     transition date in the window, one wikidata id may appear at most once */
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

/* ③ the nine-language names --------------------------------------------------------------------*/
test('③ every record has an English name, and the language keys are the app\'s own', () => {
  const codes = new Set(['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']);
  const bad = [];
  for (const f of HB.feats) {
    if (!f[0] || !f[0].en) { bad.push('a record with no English name'); continue; }
    for (const k of Object.keys(f[0])) if (!codes.has(k)) bad.push(f[0].en + ' carries an unknown language key ' + k);
  }
  assert.deepEqual(bad.slice(0, 6), []);
  /* ⚠ the registry does not spell every code: five are rows in `LANG_ROWS`, the rest are
     `declare()`d from the files on disk (js/lang-registry.js §"languages IS the set of files"). So
     the population is the SHIPPED ui.<code>.js files — a language added to the app appears there,
     and this record can then be seen to be missing it. */
  const shipped = new Set(readdirSync(join(ROOT, 'js/locales'))
    .map((f) => /^ui\.(.+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]));
  assert.ok(shipped.size >= 9, 'only ' + shipped.size + ' ui.<code>.js files found');
  for (const c of codes) assert.ok(shipped.has(c), 'the record carries names for ' + c + ' but the app ships no ui.' + c + '.js');
  const noNames = [...shipped].filter((c) => !codes.has(c));
  assert.deepEqual(noNames, [], 'the app ships these languages and the border record has no names for them: ' + noNames.join(', '));
});

test('③ the record is genuinely multilingual, not English nine times', () => {
  const per = {};
  for (const c of ['jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) per[c] = HB.feats.filter((f) => f[0][c]).length;
  for (const c of Object.keys(per)) assert.ok(per[c] >= 200, c + ' has only ' + per[c] + ' names');
});

test('③ tagSame reads the record\'s own name BEFORE _eraLocName', () => {
  /* ⚠ THE ORDER HAS TO BE READ OFF THE EXPRESSION, not off where the two spellings first appear in
     the block: the comment above them names `_eraLocName` first, so a positional comparison passes
     whichever way the code actually runs. */
  assert.match(TB, /const loc=own\|\|_eraLocName\(nm\);/,
    'the else-branch of tagSame no longer prefers the record\'s own name over _eraLocName');
  assert.match(TB, /const own=\(f\.properties\._i18n&&\(f\.properties\._i18n\[lg\]\|\|null\)\)\|\|null;/,
    'tagSame no longer reads _i18n for the current language');
  /* ⚠ AND hbFC MUST ACTUALLY PUT IT THERE — asked of the FEATURE, not of the spelling. #R518 wrote
     this as `assert.match(TB, /_i18n:f\[0\]/)`, and #R695 made the record's own tuple the LAST
     thing merged into a shared table (so the upstream still wins and the empty languages get
     filled). That is the same fact, spelled differently — the #R488 shape, where a correct change
     goes red and an incorrect one (dropping the tuple into a variable that is never attached)
     would have stayed green. So the collection is built and read. */
  const { api } = timeBorders({ lang: 'jp', year: 1800 });
  const feat = api.histNameFor('histBorders', 'Kahlur State', 'Q860407', { en: 'Kahlur State', jp: 'カフルール' });
  assert.equal(feat && feat.en, 'Kahlur State', 'hbFC no longer attaches the name tuple to the feature');
  assert.equal(feat.jp, 'カフルール', "the record's own name must survive the merge, whatever the table says");
});

/* ④ the band is wired, and the stepper can see it ---------------------------------------------*/
test('④ go() serves the day-exact band from the bundle, above the snapshot fallback', () => {
  /* ⚠ (#R690) THE SPELLING IS NO LONGER A LITERAL PAIR. HB_MIN is a copy of the bundle's derived
     floor, so what this asserts is that the band is declared AND that it contains #R518's window;
     that the copy equals the bundle is r690's job. */
  const m = /const HB_MIN=(-?\d+), ?HB_MAX=(\d+);/.exec(TB);
  assert.ok(m, 'go() no longer declares the day-exact band');
  assert.ok(+m[1] <= 1850 && +m[2] >= 1885, 'the declared band no longer contains 1850-1885');
  const go = TB.slice(TB.indexOf('async function go(when)'));
  const band = go.indexOf('year>=HB_MIN&&year<=HB_MAX');
  /* ⚠ (#R679) `nearest` takes the era record's own year list now, so the call reads
     `nearest(year,erYears(_erd))` — the ORDER of the two branches is what ④ asserts, not the
     argument list. */
  const fall = go.indexOf('const ny=nearest(');
  assert.ok(band > 0, 'go() has no 1850-1885 band');
  assert.ok(band < fall, 'the snapshot fallback is reached before the bundle');
});

/* ⚠ (#R604) THE TWO FLOORS ARE NO LONGER ONE NUMBER, AND THAT IS THE POINT OF THIS ROUND.
   #R518's claim was «the day-exact country record starts where the clock does», which was true while
   both said 1850. The clock now reaches year 1 (js/chronos.js) because the SUBDIVISIONS reach there;
   data/hist-borders.js still starts at 1850 because that is where its own record starts, and below it
   the country answer is the aourednik snapshot series (js/time-borders.js `YEARS`, extended this round
   to the 36 the repo publishes). So the assertion is not «same number» but «the record is REACHABLE
   and does not start above the clock» — a record whose floor sat under the clock's would be the
   defect #R518 removed, and one whose floor sat above it is now normal and is answered elsewhere. */
test('④ the day-exact country record is reachable from the clock, and says where it stops', () => {
  /* (#R679) the floor is evaluated, not grepped — the third round in a row in which a regex
     over js/chronos.js stopped matching and threw at import. tests/helpers/hist-scale.mjs. */
  const floor = clockFloor();
  assert.ok(Number.isInteger(floor), 'the kernel declares no floor');
  assert.ok(HB.window[0] >= floor, 'the record starts somewhere the clock cannot reach');
  assert.ok(HB.window[0] <= 1850 && HB.window[1] >= 1885,
    'data/hist-borders.js no longer covers the band #R518 built it for: ' + JSON.stringify(HB.window));
  /* ⚠ (#R679) `YEARS` IS THE FALLBACK'S LIST NOW. What answers a year below 1850 is
     data/hist-eras.js, which carries all 53 snapshots upstream publishes including the
     seventeen before the common era; the thirty-six decimal years left in js/time-borders.js
     are the file names the remote path can still ask for. Asking the fallback how far the map
     reaches is asking the spare tyre how far the car goes. */
  const ERA = eraBundle();
  const YEARS = ERA.snaps.map((s) => s.y).sort((a, b) => a - b);
  assert.ok(YEARS.some((y) => y < 1), 'the era record has nothing before the common era');
  assert.ok(YEARS[0] <= floor,
    `the clock reaches ${floor} and the oldest thing that can answer is ${YEARS[0]}`);
});

test('④ the change-date API asks BOTH records', () => {
  const m = TB.match(/async function _allBounds\(\)\{[\s\S]*?return out\.sort/);
  assert.ok(m, '_allBounds not found');
  assert.match(m[0], /hbBounds/);
  assert.match(m[0], /csBounds/);
  for (const fn of ['changeAfter', 'changeBefore', 'changeDates']) {
    const b = TB.match(new RegExp('function ' + fn + '\\([\\s\\S]{0,260}'));
    assert.match(b[0], /_allBounds/, fn + ' still reads only one record\'s dates');
  }
  /* ⚠ (#R695) THE REACH IS ASKED OF THE FUNCTION. #R518's own words for this were «the published
     range still starts at CShapes» — a claim about a FLOOR, pinned by matching the source text
     `range:()=>({min:HB_MIN,max:CS_MAX})`. When #R695 put the era sheets in the stepper's list the
     floor moved DOWN, which is the opposite of the defect this defends, and the spelling-match went
     red for it while a floor that rose back to CShapes would still have passed. */
  const { api } = timeBorders({ lang: 'en' });
  const r = api.range();
  assert.ok(r.min < 1886, 'the published range still starts at CShapes — everything below it is unreachable from the stepper');
  assert.equal(r.max, HB.window ? Math.max(r.max, HB.window[1]) : r.max);
});

/* ⑤ attribution — ODbL is share-alike, so naming the source is the licence, not politeness -----*/
/* ⚠ (#R530) THE LICENCE THIS PINS WAS WRONG, AND A CHECK THAT PINS A WRONG FACT KEEPS IT.
   OpenHistoricalMap is CC0, not ODbL: its own /copyright page calls the project «dedicated to the
   public domain» and its Overpass API answers «The data is made available under CC0» (both measured
   2026-09-07). The rows below now read CC0 — the claim they defend is unchanged: the source must be
   credited on the map and on the Sources page, in all nine languages. */
test('⑤ OpenHistoricalMap and its licence are credited on the map and on the Sources page', () => {
  assert.match(TB, /attribution:'[^']*OpenHistoricalMap \(CC0\)[^']*'/, 'the map source no longer credits OHM');
  assert.match(rd('js/reference-data.js'), /OpenHistoricalMap \(CC0 1\.0\)/, 'the Sources registry has no OHM row');
  const missing = [];
  for (const c of ['en', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh-hant', 'zh-hans']) {
    const s = rd('js/locales/pages.' + c + '.js');
    if (!s.includes('OpenHistoricalMap (CC0 1.0)')) missing.push(c + ' (key)');
    /* ⚠ (#R530) ASK THE ENTRY, NOT THE FILE. This used to be `/ODbL 1\.0\./.test(s)` over the WHOLE
       locale — which every one of these files satisfies through its OpenStreetMap and mledoze rows,
       so it never once said anything about OpenHistoricalMap. It passed while the licence named here
       was wrong, and it would have gone on passing if the OHM row had carried no licence at all.
       The description itself must name CC0. */
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

/* ⑥ a click answers with the polity that was clicked ------------------------------------------*/
test('⑥ resolveHist keeps the record\'s own identity over its modern carrier\'s', () => {
  /* Measured before this was added: a click on the Kingdom of the Two Sicilies in 1860 answered
     «Italy» with the article for the Kingdom of Sardinia, because everything in resolveHist
     resolves to a modern country for the statistics and then overwrites name and Wikipedia with
     that country's. The carrier still supplies `code`; the identity must not come from it. */
  assert.match(TB, /if\(!same\)\{ out\.name=hbLoc; out\.wiki=hbEn/,
    'resolveHist no longer restores the 1850-1885 record\'s own name and article');
  assert.match(TB, /const same=s&&String\(s\.nameEn\|\|''\)\.toLowerCase\(\)\.trim\(\)===hbEn\.toLowerCase\(\)\.trim\(\);/,
    'the «is it really the same state» test is gone — every carrier name would be overwritten');
  assert.match(TB, /if\(!out\.flag&&!out\._own&&out\.code/,
    'the carrier\'s flag is put back on a polity that is not the carrier');
  /* and the names those titles are built from have to look like article titles */
  const odd = HB.feats.filter((f) => /[\/#|<>\[\]{}]/.test(f[0].en)).map((f) => f[0].en);
  assert.deepEqual(odd.slice(0, 5), [], 'names that cannot become a Wikipedia title: ' + odd.slice(0, 5).join(' | '));
});

/* ⑦ the bundle's own gate runs, offline -------------------------------------------------------*/
test('⑦ scripts/build-hist-borders.mjs --check passes', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-hist-borders.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /hist-borders ok/);
});
