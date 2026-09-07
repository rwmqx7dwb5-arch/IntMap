/* ============================================================================
 *  R530 — the SUBDIVISIONS travel in time too
 * ----------------------------------------------------------------------------
 *  「国境線だけでなく地方区分の境界もChronosに完全対応させるように。完全対応。」
 *
 *  ⚠ WHAT THESE CHECKS EXIST TO CATCH, AND WHY NOTHING CAUGHT IT BEFORE.
 *  `ref-admin1` — the violet dashed province line, default ON — read no clock at
 *  all: it was not in `window._applyBorders`, so a reader on 1900 got the CShapes
 *  1900 countries with the 2026 provinces still drawn over them. Measured before
 *  this round, `git grep ref-admin1 tests/` returned ZERO lines: the layer had no
 *  check of any kind, which is exactly why five years of green gates never said a
 *  word about it. Every check below is written against the LAYER's behaviour, not
 *  against a spelling, so a future refactor that keeps the words and loses the
 *  rule fails here ([[intmap-r488-lessons]]).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TA = read('js/time-admin1.js');
const APP = read('js/app-body.js');
const PL = read('js/place-labels.js');
const DL = read('js/data-layers.js');
const MAIN = read('src/main.js');

/* the bundle, evaluated for real — a check that reads the literal as TEXT would pass
   on a file that cannot be parsed (#R505's lesson in its smallest form). */
let DATA = null;
test('① data/hist-admin1.js evaluates and carries the shape js/time-admin1.js reads', () => {
  const src = read('data/hist-admin1.js');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'data/hist-admin1.js' });
  DATA = ctx.window.__HISTADM1;
  assert.ok(DATA, 'window.__HISTADM1 must be defined');
  assert.equal(DATA.v, 1);
  assert.match(DATA.src, /OpenHistoricalMap/, 'the bundle names its source');
  assert.ok(Array.isArray(DATA.rings) && DATA.rings.length > 1000, 'ring pool');
  assert.ok(Array.isArray(DATA.feats) && DATA.feats.length > 2000, 'features');
  for (const f of DATA.feats) {
    assert.equal(f.length, 10, 'feat = [name,lvl,sy,sm,sd,ey,em,ed,polys,names]');
    assert.equal(typeof f[0], 'string');
    assert.ok(f[1] === 3 || f[1] === 4, 'admin_level is 3 or 4');
    for (let i = 2; i <= 7; i++) assert.equal(typeof f[i], 'number', 'date parts are numbers');
    assert.ok(f[3] >= 1 && f[3] <= 12 && f[6] >= 1 && f[6] <= 12, 'months in range');
    assert.ok(f[4] >= 1 && f[4] <= 31 && f[7] >= 1 && f[7] <= 31, 'days in range');
    assert.ok(Array.isArray(f[8]) && f[8].length, 'at least one polygon');
    for (const poly of f[8]) for (const ri of poly) assert.ok(DATA.rings[ri], 'every ring index resolves');
    assert.equal(typeof f[9], 'object');
  }
});

test('② the record is DAY-exact, not year-rounded — the whole point of #R421 applied here', () => {
  const key = f => f[2] * 10000 + f[3] * 100 + f[4];
  const days = new Set(DATA.feats.map(key));
  const years = new Set(DATA.feats.map(f => f[2]));
  /* If every start date were January 1 of its year the two sets would be the same size,
     which is precisely the shape #R421 removed from the country side. */
  assert.ok(days.size > years.size * 1.5,
    `start dates must be finer than years — ${days.size} distinct days over ${years.size} distinct years`);
  const withMonthDay = DATA.feats.filter(f => !(f[3] === 1 && f[4] === 1)).length;
  assert.ok(withMonthDay > 200, `expected many month/day-exact starts, got ${withMonthDay}`);
});

test('③ the subdivisions actually CHANGE across the clock, and are not empty at any decade', () => {
  const alive = (y, m, d) => {
    const t = y * 10000 + m * 100 + d;
    return DATA.feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length;
  };
  const counts = [1850, 1870, 1900, 1914, 1938, 1950, 1990, 2020].map(y => alive(y, 6, 15));
  for (const c of counts) assert.ok(c > 300, `every sampled decade must draw something — got ${counts.join(',')}`);
  /* …and they must not be the SAME set every year, which is what a layer that ignores the
     clock would look like from here. */
  assert.ok(new Set(counts).size >= 5, `the count must move with the clock — ${counts.join(',')}`);
});

test('④ the era layer is created, and it is NOT a second copy of the province style', () => {
  /* Travelling must change WHERE a boundary runs, not what it looks like (#R212). The era
     line reads js/border-style.js through window.IntMapBorderStyle rather than re-typing
     the violet — and the literal fallback must BE the same violet, or the two drift the
     moment the module fails to evaluate. */
  assert.match(TA, /window\.IntMapBorderStyle/, 'the era line reads the shared border style');
  const BS = read('js/border-style.js');
  const canon = /ADMIN1_COLOR\s*=\s*'([^']+)'/.exec(BS);
  assert.ok(canon, 'js/border-style.js still declares ADMIN1_COLOR');
  assert.ok(TA.includes(canon[1]), `the fallback literal must equal ADMIN1_COLOR (${canon[1]})`);
  assert.match(TA, /'line-dasharray':\s*\[3,\s*2\]/, 'the era province line keeps the dash the modern one uses');
  for (const id of ['imta-src', 'imta-line', 'imta-lbl']) assert.ok(TA.includes(id), `${id} is defined`);
});

/* ⚠ THE SWITCHBOARD LIVES IN js/time-admin1.js, NOT IN THE SHELL, AND THAT IS LOAD-BEARING.
   Written first inside js/app-body.js, it put the six app-shell files FIFTY lines over the 8,050
   the budget allows — and the shell had exactly ONE line of headroom (tests/r168 #8, with copies
   of the same number in r350 ⑨c and r479 ⑧). It also belongs here on the merits: the module that
   draws the era units is the right owner of the rule deciding which set is on screen. */
const SWITCHBOARD = () => {
  const m = /window\._applyAdmin1 = function \(\) \{[\s\S]*?\n    \};/.exec(TA);
  assert.ok(m, 'window._applyAdmin1 is defined in js/time-admin1.js');
  return m[0];
};

test('⑤ ⚠ the modern province line hides while travelling — the defect this round exists for', () => {
  const body = SWITCHBOARD();
  assert.ok(!/window\._applyAdmin1\s*=/.test(APP), 'and it is NOT in the app shell — see the note above');
  /* ref-admin1 shows only when the box is on AND we are NOT travelling. */
  assert.match(body, /ref-admin1'[^\n]*\(on && !traveling\)/, 'ref-admin1 is gated on !traveling');
  /* the era line shows only when the box is on AND we ARE travelling. */
  assert.match(body, /imta-line'[^\n]*\(on && traveling\)/, 'imta-line is gated on traveling');
  /* and `traveling` is this module's own state — never the COUNTRY time machine's. */
  assert.match(body, /const traveling = active;/, "traveling is the admin-1 module's own `active`");
  assert.ok(!/IntMapTimeBorders/.test(body), 'it must not ask the COUNTRY time machine about provinces');
});

test('⑥ the province checkbox hands its decision to the switchboard, in every retry path', () => {
  /* `_wireRef` re-fires on the box, on 4 timers and on every `sourcedata` — each of those
     sets visibility directly, so without this hand-back any one of them re-shows today's
     provinces over a past year a fraction of a second later. */
  const wire = /function _wireRef\(cbId,layerId\)\{[\s\S]*?_wireRef\('cb-admin1','ref-admin1'\)/.exec(APP);
  assert.ok(wire, '_wireRef is still the province row wiring');
  assert.match(wire[0], /layerId==='ref-admin1'[\s\S]{0,120}_applyAdmin1/,
    'the province branch must call window._applyAdmin1 after setting visibility');
});

test('⑦ one feature, one switch — and the NAMES follow the switch the modern names follow', () => {
  const body = SWITCHBOARD();
  assert.match(body, /cb-admin1/, 'the line follows cb-admin1');
  assert.match(body, /cb-names/, 'the era names follow cb-names, as ofm-admin1 does (#R198)');
  assert.match(body, /imta-lbl'[^\n]*\(namesOn && traveling\)/, 'era province names are gated on cb-names');
  /* ⚠ …and TODAY'S province name is driven from here too, or it returns to Now seconds after the
     boundary it belongs to — measured 0.8-2.9 s late while `applyLabelLang` owned that half alone. */
  assert.match(body, /ofm-admin1'[^\n]*\(namesOn && !traveling\)/, "today's province names are on the same switchboard");
});

test('⑧ ⚠ the two time machines are asked SEPARATELY for the two label tiers', () => {
  /* One flag would print today's prefecture name beside the era's on the same point for
     every year the country side has already returned to modern borders (2020-2025). */
  assert.match(PL, /IntMapTimeAdmin1[\s\S]{0,80}active\(\)/, 'place-labels asks the admin-1 time machine');
  const line = PL.split('\n').find(l => l.includes("id==='ofm-admin1'") && l.includes('_showThis'));
  assert.ok(line, 'the per-layer visibility decision still names ofm-admin1');
  assert.ok(/ofm-country'&&_travelingLbl/.test(line), 'ofm-country hides on the COUNTRY time machine');
  assert.ok(/ofm-admin1'&&_travelingAdm/.test(line), 'ofm-admin1 hides on the ADMIN-1 time machine');
});

test('⑨ the layer audit knows the row paints one of TWO layers', () => {
  /* `painted()` asks "is ANY of these visible". With only the modern id listed, a correctly
     travelling map reads as «checked but blank» and the audit pulses the box off→on. */
  assert.match(DL, /'cb-admin1':\['ref-admin1','imta-line'\]/,
    "the audit table lists both the modern and the era province layer");
});

test('⑩ the module is imported, registered, and instantiated exactly once', () => {
  assert.match(MAIN, /import '\.\.\/js\/time-admin1\.js';/, 'src/main.js imports it');
  assert.match(MAIN, /'timeAdmin1'/, 'it is in MODULE_FACTORIES, so a missing file is reported at boot');
  assert.match(TA, /window\.IntMapModules\.timeAdmin1\s*=\s*function/, 'it registers the factory');
  const inst = APP.match(/window\.IntMapTimeAdmin1\s*=\s*window\.IntMapModules\.timeAdmin1\(/g) || [];
  assert.equal(inst.length, 1, 'instantiated exactly once');
  /* the country twin is imported before it, because app-body instantiates them in that order */
  assert.ok(MAIN.indexOf("js/time-borders.js") < MAIN.indexOf("js/time-admin1.js"), 'after its twin');
});

test('⑪ the clock is read as an INSTANT, and the debounce is the country side\'s number', () => {
  assert.match(TA, /window\.IntMapTime\.on\(/, 'it subscribes to Chronos');
  assert.ok(!/e\.iso/.test(TA), "must not read e.iso — that is UTC and shifts the reader's day (#R421)");
  assert.match(TA, /go\(w\)[\s\S]{0,40}\},\s*45\)/, 'the 45 ms coalescing #R122 measured');
  assert.match(TA, /e\.when/, 'the whole instant, not e.year');
});

test('⑫ the 6.5 MB bundle is not on the boot path, and not fetched on a phone at all', () => {
  /* the same rule and the same reasons as data/cshapes.js (#R192/#R201). */
  assert.match(TA, /requestIdleCallback/, 'warmed at idle');
  assert.match(TA, /saveData|effectiveType/, 'skipped on Data Saver / 2G');
  assert.match(TA, /HOST\.isMobile/, 'skipped on a phone');
  /* ⚠ NAMING IT IN A COMMENT IS NOT IMPORTING IT. The claim is that no module graph pulls the
     6.5 MB literal into a chunk — so the test is for an import STATEMENT, not for the string. */
  const importsIt = src => /\bimport\s*\(?\s*['"][^'"]*hist-admin1/.test(src) || /\bfrom\s*['"][^'"]*hist-admin1/.test(src);
  assert.ok(!importsIt(MAIN), 'the data file is never imported into the bundle');
  assert.ok(!importsIt(TA), '…and its own module reads it as a <script>, not as a module');
  assert.match(TA, /createElement\('script'\)[\s\S]{0,120}hist-admin1\.js/, 'it is injected, so the browser parses it off the main graph');
  const bytes = fs.statSync(path.join(ROOT, 'data/hist-admin1.js')).size;
  assert.ok(bytes < 9 * 1024 * 1024, `the bundle must stay in the country bundle's class — ${bytes} B`);
});

test('⑬ nine languages, in the order IntMapLang actually uses', () => {
  /* ⚠ fr and ko are positions 7 and 8; the two Chinese scripts are 5 and 6. A tuple written
     in the natural en/ja/de/ru/es/fr/ko/zh/zh order hands French to a zh-Hant reader (#R502). */
  const call = /_LT\.arr\(LA\(([\s\S]*?)\n      \)\);/.exec(TA);
  assert.ok(call, 'note() builds its tuple with LA(…) so the i18n instruments can see it');
  const args = call[1];
  const order = [
    [/dated subdivisions are in force/, 'en'],
    [/この日付で記録のある地方区分/, 'jp'],
    [/datierte Verwaltungseinheiten/, 'de'],
    [/датированных единиц/, 'ru'],
    [/subdivisiones fechadas/, 'es'],
    [/此日期有記錄的行政區/, 'zh-Hant'],
    [/此日期有记录的行政区/, 'zh-Hans'],
    [/subdivisions datées/, 'fr'],
    [/기록이 있는 행정구역/, 'ko']
  ];
  let last = -1;
  for (const [re, code] of order) {
    const at = args.search(re);
    assert.ok(at >= 0, `the ${code} string is present`);
    assert.ok(at > last, `${code} must come after the previous slot — the registry's order, not the alphabet`);
    last = at;
  }
  /* and it must RESOLVE, not hand the caller the array pickArgs() returns unchanged. */
  assert.match(TA, /const _LT\s*=\s*window\.IntMapLang\.pick\(\(\)\s*=>\s*HOST\.lang\)/,
    'the chooser is pick(getLang) with a LIVE accessor, not a captured value');
});

test('⑭ the coverage is REPORTED rather than filled in', () => {
  assert.match(TA, /function coverage\(/, 'coverage() exists');
  assert.match(TA, /units:\s*shownFC\.features\.length/, 'it counts what is actually drawn');
  const body = SWITCHBOARD();
  assert.match(body, /traveling \? note\(\) : ''/, 'the province row carries the sentence while travelling');
  assert.match(body, /removeAttribute\('title'\)/, 'and drops it at Now, so it never states a stale date');
  /* ⚠ and nothing anywhere clips a present-day unit to an era country, or draws one under a
     past date — the two forbidden "fixes" (CONSTITUTION: 偽物・ハリボテ禁止). */
  assert.ok(!/admin1-world/.test(TA), 'the era layer must not fall back to the present-day index');
});

test('⑮ ⚠ the era province name answers a tap, because the modern one does', () => {
  /* #R201 put `ofm-admin1` into every list in js/map-ui.js after 「クリック可能ではない！ほかの地名
     ラベルと違う挙動にするな！」. Replacing it with `imta-lbl` for every past date and NOT doing the
     same would re-create that report for the years the time machine is on.
     ⚠ And it must be wired THERE, not here: a second click owner in js/time-admin1.js is the same
     defect wearing a different name. The first draft of this round had one, and it could not have
     worked — `GE().events.on` takes (event, cb), so the layer id would have been the callback. */
  const UI = read('js/map-ui.js');
  assert.match(UI, /const PLACE_LBL=\[[^\]]*'imta-lbl'/, 'the era province label is a place label');
  assert.match(UI, /onLayer\('click','imta-lbl',onLabel\(false\)\)/, 'and it gets the same handler ofm-admin1 gets');
  assert.ok(!/events\.on\('click',\s*'/.test(TA), 'js/time-admin1.js must not own a click of its own');
});

test('⑯ the source is declared where every other bundled set is declared', () => {
  const RD = read('js/reference-data.js');
  assert.match(RD, /OpenHistoricalMap/, 'js/reference-data.js names it');
  const dir = path.join(ROOT, 'js/locales');
  const pages = fs.readdirSync(dir).filter(f => /^pages\..+\.js$/.test(f));
  assert.ok(pages.length >= 9, `expected the nine page locales, found ${pages.length}`);
  for (const p of pages) {
    assert.ok(read('js/locales/' + p).includes('OpenHistoricalMap'),
      `${p} must describe the source too — one language at a time is how the other eight fall to English (#R502)`);
  }
});
