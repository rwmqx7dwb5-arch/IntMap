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
  /* ⚠ (#R564) ASKED OF THE VALUE, NOT OF THE SPELLING. #R564 gave the era line a second, DEEPER tier
     drawn at a lower weight, so the dash became `cfg.deep ? [2,2] : [3,2]` and a check pinned to the
     literal failed on a file that still drew the first tier exactly as before. The claim was never
     about a literal: it is that the era FIRST-LEVEL line looks like the present-day one. So the paint
     block is evaluated for the first tier, and compared with what js/app-body.js gives ref-admin1. */
  const paint = (deep) => {
    const at = TA.indexOf('id: cfg.line');
    assert.ok(at >= 0, 'the era line layer is not created in the shape this check reads');
    const pAt = TA.indexOf('paint: {', at);
    assert.ok(pAt > at, 'the era line layer no longer carries a paint block');
    let depth = 0, k = TA.indexOf('{', pAt);
    const src = TA;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; } }
    const box = { cfg: { deep }, COL: '#cba6f7', W: ['modern-width-ladder'], DEEP_Z: 6, out: null };
    vm.createContext(box);
    vm.runInContext('out = ' + src.slice(src.indexOf('{', pAt), k + 1) + ';', box);
    return JSON.parse(JSON.stringify(box.out));
  };
  const modernDash = /'line-dasharray':\s*(\[[^\]]*\])/.exec(/ref-admin1'[\s\S]{0,900}/.exec(APP)[0]);
  assert.ok(modernDash, 'js/app-body.js no longer declares ref-admin1 with a dash to compare against');
  assert.deepEqual(paint(false)['line-dasharray'], JSON.parse(modernDash[1]),
    'the era first-level line no longer keeps the dash the modern province line uses');
  assert.deepEqual(paint(false)['line-width'], ['modern-width-ladder'],
    'the era first-level line no longer uses the shared width ladder');
  assert.notDeepEqual(paint(true)['line-dasharray'], paint(false)['line-dasharray'],
    'the deeper tier is drawn identically to the first level — a county reads as a state');
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

/* ⚠ (#R564) RUN, NOT READ. The switchboard used to name each layer on its own line, so a regex could
   pin the gate beside the id. It now walks the tier list, and both ids live in the tier configuration
   two hundred lines away — a spelling check would have to be loosened to something that no longer says
   anything. Evaluating it says MORE than the old one did: it asserts the visibility every layer
   actually receives in every combination of the two boxes and the clock. */
function runSwitchboard({ traveling, on = true, namesOn = true }) {
  const seen = {};
  const box = {
    active: traveling, ensureModernDeep() {}, note: () => 'coverage sentence',
    TIERS: [{ cfg: { line: 'imta-line', lbl: 'imta-lbl' } }, { cfg: { line: 'imta2-line', lbl: 'imta2-lbl' } }],
    GE: () => ({ hasRenderer: () => true, layers: { has: () => true, setLayout: (id, k, v) => { seen[id] = v; } } }),
    document: { getElementById: (id) => ({ checked: id === 'cb-admin1' ? on : namesOn, closest: () => null }) },
    window: {},
  };
  vm.createContext(box);
  vm.runInContext(SWITCHBOARD() + '\nwindow._applyAdmin1();', box);
  return seen;
}

test('⑤ ⚠ the modern province line hides while travelling — the defect this round exists for', () => {
  const body = SWITCHBOARD();
  assert.ok(!/window\._applyAdmin1\s*=/.test(APP), 'and it is NOT in the app shell — see the note above');
  const past = runSwitchboard({ traveling: true }), now = runSwitchboard({ traveling: false });
  assert.equal(now['ref-admin1'], 'visible', "today's province line must be drawn at Now");
  assert.equal(past['ref-admin1'], 'none', "today's province line must hide the moment the clock leaves Now — the defect this file exists for");
  assert.equal(past['imta-line'], 'visible', 'the era province line must draw while travelling');
  assert.equal(now['imta-line'], 'none', 'the era province line must not survive the return to Now');
  /* one feature, one switch, in BOTH directions (#R94g without #R94l's carve-out) */
  const off = runSwitchboard({ traveling: true, on: false });
  assert.equal(off['imta-line'], 'none', 'unchecking the province row must switch the era line off too');
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
  const past = runSwitchboard({ traveling: true }), noNames = runSwitchboard({ traveling: true, namesOn: false });
  assert.equal(past['imta-lbl'], 'visible', 'era province names must draw while travelling');
  assert.equal(noNames['imta-lbl'], 'none', 'era province names must follow cb-names');
  /* ⚠ …and TODAY'S province name is driven from here too, or it returns to Now seconds after the
     boundary it belongs to — measured 0.8-2.9 s late while `applyLabelLang` owned that half alone. */
  assert.equal(runSwitchboard({ traveling: false })['ofm-admin1'], 'visible', "today's province names are on the same switchboard");
  assert.equal(past['ofm-admin1'], 'none', "today's province names must go with today's province line");
  /* ⚠ (#R564) the LINE follows cb-admin1 and the NAME follows cb-names — unchecking the names must
     not take the boundaries with it. */
  assert.equal(noNames['imta-line'], 'visible', 'unchecking place names took the era boundaries with it');
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
  /* (#R564) the row now paints FOUR layers (a deeper tier on each side of the clock), so the claim is
     that the audit knows about both sides — not that the list has exactly two entries. Which four is
     derived from the module itself in tests/r564-checks ⑥. */
  const listed = (/'cb-admin1':\[([^\]]*)\]/.exec(DL) || [])[1] || '';
  for (const id of ['ref-admin1', 'imta-line']) {
    assert.ok(listed.includes("'" + id + "'"), 'the audit table does not list ' + id);
  }
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
  /* (#R564) the URL is the tier's, not a literal beside the injection — so the two halves are asked
     separately: it IS injected as a script, and the URL it injects is this bundle's. */
  assert.match(TA, /createElement\('script'\)[\s\S]{0,120}s\.src = cfg\.file/, 'it is injected, so the browser parses it off the main graph');
  assert.match(TA, /file: 'data\/hist-admin1\.js', global: '__HISTADM1'/, 'the first tier no longer names the bundle it reads');
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
  assert.match(TA, /units:\s*fc\.features\.length/, 'it counts what is actually drawn, not a denominator');
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
