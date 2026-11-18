/* ============================================================================
 *  exploration-flows — «select a country → compare at one year and definition → table / chart / map → source»
 * ----------------------------------------------------------------------------
 *  The path keeps the OBJECT, the YEAR and the SOURCE the whole way. Each break that was measured is
 *  checked here by EVALUATING the code that ships — the functions are lifted out of the files by the
 *  parser, with stubs only for what they close over:
 *    ① the card's country is in the comparison it opens; the Countries tray is read; an array still replaces
 *    ② the year a comparison is read at is reset by a new selection and kept by a re-show
 *    ③ the banner states the year the values ARE for (the panel's year, else the clock's, else «latest»)
 *    ④ «Show on map» finds the map's layer for the same World Bank series, and says so when the panel's
 *       values are not the World Bank's; the layer is shown at the comparison's year
 *    ⑤ the country card names the source of each fact, and nothing when no writer named one
 *  Source is read only where a handler is an inline closure (the card's click delegation, the table).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource } from './helpers/ast.mjs';
import { setFigure, figure } from '../js/country-figures.js';
import '../js/safe-html.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SC = read('js/stats-compare.js');
const CUI = read('js/countries-ui.js');
const WBL = read('js/wb-layers.js');
const S = globalThis.IntMapSafe;
const html = S.markup;

/* the declarations named, as the text that ships (function declarations and `const x=…` alike) */
function lift(src, names) {
  const ast = parseSource(src); const out = {};
  (function go(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name) && !out[n.id.name]) out[n.id.name] = src.slice(n.start, n.end);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && names.includes(n.id.name) && !out[n.id.name]) out[n.id.name] = 'const ' + src.slice(n.start, n.end) + ';';
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v); }
  })(ast);
  for (const nm of names) assert.ok(out[nm], 'lifted: ' + nm);
  return names.map((nm) => out[nm]).join('\n');
}
/* `env` keys become `let` bindings the lifted code may reassign; `ret` is evaluated as an object literal after it */
function run(code, env, ret) {
  const ks = Object.keys(env);
  const body = (ks.length ? 'let ' + ks.map((k) => k + '=__env.' + k).join(',') + ';\n' : '') + code + '\nreturn ' + ret + ';';
  return new Function('__env', body)(env);   // eslint-disable-line no-new-func
}

/* ══ ① ② the selection a comparison opens with, and its year ═════════════════════════════════════════ */

const known = (cd) => ['JPN', 'USA', 'DEU', 'FRA', 'GBR', 'ITA', 'CAN', 'CHN', 'IND', 'BRA', 'KOR', 'MEX'].includes(cd);
const OS = run(lift(SC, ['_openState']), {}, '{ _openState }')._openState;

test('① the card\'s country (a code) joins what is compared and what the tray holds — it is never left out', () => {
  assert.deepEqual(OS(['USA', 'DEU'], null, 'JPN', [], null, known).codes, ['USA', 'DEU', 'JPN'],
    'after an earlier comparison the card\'s country is added, the others kept');
  assert.deepEqual(OS(['USA'], null, 'USA', [], null, known).codes, ['USA'], 'already compared: nothing doubles');
  assert.deepEqual(OS(['USA'], null, 'JPN', ['FRA', 'USA'], null, known).codes, ['USA', 'FRA', 'JPN'], 'the tray is read on open');
  const ten = ['USA', 'DEU', 'FRA', 'GBR', 'ITA', 'CAN', 'CHN', 'IND', 'BRA', 'KOR'];
  const full = OS(ten, null, 'JPN', [], null, known).codes;
  assert.equal(full.length, 10); assert.ok(full.includes('JPN'), 'at the 10-country limit the card\'s country is the one kept');
  assert.deepEqual(OS(['USA'], null, 'XXX', [], null, known).codes, ['USA'], 'a code with no row is not added');
});

test('① nothing named: compared ∪ tray, else the card\'s country; an ARRAY still names the whole selection', () => {
  assert.deepEqual(OS([], null, undefined, ['FRA', 'DEU'], 'JPN', known).codes, ['FRA', 'DEU']);
  assert.deepEqual(OS([], null, undefined, [], 'JPN', known).codes, ['JPN']);
  assert.deepEqual(OS(['USA', 'DEU'], null, ['FRA', 'JPN', 'XXX'], ['ITA'], 'CAN', known).codes, ['FRA', 'JPN'],
    'the tray\'s «view comparison» and Atlas pass the set they mean');
});

test('② the year belongs to ONE comparison — a new selection starts at «latest», a re-show keeps the year', () => {
  assert.equal(OS(['USA', 'DEU'], 2015, 'JPN', [], null, known).tYear, null, 'a country added → a new comparison');
  assert.equal(OS(['USA', 'DEU'], 2015, ['FRA'], [], null, known).tYear, null, 'another set named → a new comparison');
  assert.equal(OS(['USA', 'DEU'], 2015, undefined, [], null, known).tYear, 2015, 're-shown as it was → the year stays');
  assert.equal(OS(['USA', 'DEU'], 2015, ['DEU', 'USA'], [], null, known).tYear, 2015, 'the same set named again → the year stays');
  assert.equal(OS(['USA', 'DEU'], 2015, 'USA', [], null, known).tYear, 2015, 'the card of a country already compared → the year stays');
});

test('①② open() itself, evaluated: it reads the tray through HOST and the card through _cpCurrent, and applies both answers', () => {
  const rendered = [];
  const P = run(lift(SC, ['_openState', 'open']), {
    BAR_SORTS: ['added', 'desc', 'asc'], barSort: 'added', sel: null, indOrder: null, srcSel: {}, mode: 'bar', host: {},
    IND: [{ k: 'gdp', def: 1 }, { k: 'pop', def: 1 }], codes: ['USA', 'DEU'], tYear: 2015,
    countryStats: Object.fromEntries(['JPN', 'USA', 'DEU', 'FRA'].map((c) => [c, { code: c }])),
    HOST: { compareSet: new Set(['FRA']) }, window: { _cpCurrent: { code: 'JPN' } },
    render: () => rendered.push(1), paintOnMap: () => {},
  }, '{ open, get codes(){ return codes; }, get tYear(){ return tYear; }, get host(){ return host; } }');
  P.open('JPN');
  assert.deepEqual(P.codes, ['USA', 'DEU', 'FRA', 'JPN']);
  assert.equal(P.tYear, null, 'a new comparison does not carry the old year silently');
  assert.equal(P.host, null, 'the view is rebuilt'); assert.equal(rendered.length, 1);
});

test('① the card\'s Compare passes its own country (an inline delegated handler — read)', () => {
  const m = CUI.match(/if\(a==='compare'\)\{([^\n]*)/);
  assert.ok(m, 'the compare branch');
  assert.match(m[1], /_cpCurrent/); assert.match(m[1], /IntMapStatsCompare\.open\(\s*_c\b/);
  assert.doesNotMatch(m[1], /\.open\(\)/, 'open() with nothing is the defect');
});

/* ══ ③ the banner ═════════════════════════════════════════════════════════════════════════════════════ */

function banner(env) {
  const tb = { style: {}, innerHTML: '', cls: new Set(), classList: { add(c) { tb.cls.add(c); }, remove(c) { tb.cls.delete(c); } } };
  const B = run(lift(SC, ['_yearShown', '_paintBanner']), Object.assign({ html, LL: (...a) => a[0], window: {} }, env), '{ _paintBanner, _yearShown }');
  B._paintBanner({ querySelector: (q) => (q === '#scp-timebanner' ? tb : null) });
  return { tb, text: String(tb.innerHTML), shown: tb.style.display !== 'none', B };
}

test('③ clock at 1990, «Same year: 2015» → the banner says 2015 (the values\' year), not 1990', () => {
  for (const m of ['bar', 'table']) {
    const b = banner({ tYear: 2015, _ttYear: () => 1990, mode: m });
    assert.ok(b.shown); assert.match(b.text, /<b>2015<\/b>/, m); assert.doesNotMatch(b.text, /1990/, m);
  }
});

test('③ no year picked: the travel year while travelling; «latest for each country» on the live clock', () => {
  const t = banner({ tYear: null, _ttYear: () => 1990, mode: 'bar' });
  assert.match(t.text, /<b>1990<\/b>/);
  const deep = banner({ tYear: null, _ttYear: () => 1939, mode: 'bar' });
  assert.ok(deep.tb.cls.has('warn'), 'a year before the annual series is still flagged');
  const live = banner({ tYear: null, _ttYear: () => null, mode: 'table' });
  assert.ok(live.shown); assert.match(live.text, /latest/i); assert.doesNotMatch(live.text, /<b>\d{4}<\/b>/);
});

test('③ the time-series draws every year: a panel year does not name it; live, there is no single year to state', () => {
  const ts = banner({ tYear: 2015, _ttYear: () => 1990, mode: 'ts' });
  assert.match(ts.text, /<b>1990<\/b>/, 'the series read while travelling');
  assert.equal(banner({ tYear: 2015, _ttYear: () => null, mode: 'ts' }).shown, false);
  const Y = ts.B._yearShown;
  assert.deepEqual(Y(2015, 1990, 'bar'), { y: 2015, kind: 'same' });
  assert.deepEqual(Y(null, null, 'bar'), { y: null, kind: 'latest' });
});

test('③ the banner is the same rule latestData reads values by — `tYear ?? travel` — and is repainted where the table changes the year', () => {
  assert.match(SC, /const travel=_ttYear\(\), ttY=\(tYear!=null\)\?tYear:travel;/, 'the values\' rule this banner states');
  assert.match(SC, /#scp-year'\)\.onchange=[^\n]*_paintBanner\(host\)/);
});

/* ══ ④ the indicator on the map ═══════════════════════════════════════════════════════════════════════ */

function secHtmlWith(WB) {
  return run(lift(SC, ['secHtml']), {
    html, LL: (...a) => a[0], window: { IntMapSafe: S, IntMapWB: WB }, srcSel: {}, _ttYear: () => null,
  }, '{ secHtml }').secHtml;
}
const ind = (k, o) => Object.assign({ k, l: [k], fmt: String }, o);

test('④ a World Bank indicator with a map layer gets «Show on map»; one without, or a bundled figure, does not', () => {
  const WB = { layerFor: (k) => ({ infl: 'wbinfl', debt: 'wbdebt' }[k] || null) };
  const sec = secHtmlWith(WB);
  assert.match(String(sec(ind('infl', { imf: 'PCPIPCH' }), 'World Bank')), /class="scp-onmap" data-k="infl"/);
  assert.doesNotMatch(String(sec(ind('infl', { imf: 'PCPIPCH' }), 'World Bank')), /scp-onmapnote/, 'same publisher: nothing to warn');
  assert.doesNotMatch(String(sec(ind('gdp', { imf: 'NGDPD' }), 'World Bank')), /scp-onmap/);
  assert.doesNotMatch(String(sec(ind('area', { fig: 'area', src: 'Natural Earth' }), 'Natural Earth')), /scp-onmap/);
  assert.doesNotMatch(String(secHtmlWith(undefined)(ind('infl'), 'World Bank')), /scp-onmap/, 'no map module: no button');
});

test('④ when the panel\'s values are not the World Bank\'s (IMF WEO, a gap-fill) it says the layer is World Bank', () => {
  const sec = secHtmlWith({ layerFor: (k) => (k === 'debt' ? 'wbdebt' : null) });
  assert.match(String(sec(ind('debt', { imf: 'GGXWDG_NGDP' }), 'IMF WEO')), /scp-onmapnote">the map layer shows World Bank data/);
  assert.match(String(sec(ind('debt', { imf: 'GGXWDG_NGDP' }), 'World Bank', '', false, true)), /scp-onmapnote/, 'mixed values');
});

test('④ wb-layers finds the layer by the SERIES and shows it at the comparison\'s year', () => {
  const sets = []; let selected = null; let clock = null;
  const entries = [{ id: 'wbinfl', key: 'FP.CPI.TOTL.ZG' }, { id: 'wbco2:pc', key: 'EN.GHG.CO2.PC.CE.AR5' }];
  const W = run(lift(WBL, ['indEntryFor', 'indShow']), {
    wbIndicator: (k) => ({ infl: { code: 'FP.CPI.TOTL.ZG' }, co2: { code: 'EN.GHG.CO2.PC.CE.AR5' }, gdp: { code: 'NY.GDP.MKTP.CD' } }[k]),
    _wbKey: (c) => (Array.isArray(c) ? c.join('+') : c), indicatorEntries: () => entries,
    clockYear: () => (clock == null ? null : String(clock)), IND: { cur: null, view: null },
    IntMapTime: { setYear: (y) => { sets.push(y); clock = y; } },
    indBrowser: () => Promise.resolve({ select: (id) => { selected = id; return { id }; } }),
  }, '{ indEntryFor, indShow, IND }');
  assert.equal(W.indEntryFor('co2').id, 'wbco2:pc', 'a two-way row: the mode painting the same series');
  assert.equal(W.indEntryFor('gdp'), null);
  return W.indShow('infl', null).then((r) => {
    assert.deepEqual(r, { id: 'wbinfl', year: null }); assert.equal(selected, 'wbinfl');
    assert.equal(W.IND.year, '', 'live clock, no year → «latest per country», what «latest for each country» compares');
    assert.deepEqual(sets, [], 'the clock is not moved');
    return W.indShow('infl', 2015);
  }).then((r) => {
    assert.deepEqual(sets, [2015], 'a year: the map\'s year is the clock\'s, moved as the row\'s own picker moves it');
    assert.deepEqual(r, { id: 'wbinfl', year: 2015 }); assert.equal(W.IND.year, undefined);
    return W.indShow('gdp', 2015);
  }).then((r) => assert.equal(r, null, 'no layer for the series → nothing is switched on'));
});

test('④ indPaint consumes the choice once: «latest per country» for this paint, the series default after', () => {
  const wbYear = {}; const painted = [];
  const P = run(lift(WBL, ['indPaint']), {
    indicatorEntries: () => [{ id: 'wbinfl', base: 'wbinfl', code: 'X', n: ['n'], ramp: [0, '#000'], unit: '' }],
    wbById: {}, IND: { cur: null, year: '' }, wbYear, document: { querySelector: () => null },
    choroOn: (L) => { painted.push(String(wbYear.wbind)); return Promise.resolve(); }, layerInflight: { track() {} },
  }, '{ indPaint, IND }');
  P.indPaint('wbinfl'); assert.deepEqual(painted, ['']); assert.equal(P.IND.year, undefined);
  P.indPaint('wbinfl'); assert.deepEqual(painted, ['', 'undefined'], 'the next choice from the browser keeps its old meaning');
});

test('④ the highlight gives way to the indicator\'s fill, and the table names each column\'s source (read)', () => {
  assert.match(SC, /setLayout\('imcmp-fill','visibility',_indicatorOnMap\(\)\?'none':'visible'\)/);
  assert.doesNotMatch(SC, /LL\('Sources per indicator: [^']*shown in bar/, 'the table no longer sends the reader elsewhere for its sources');
  assert.match(SC, /bByK\[b\.ind\.k\]=\{ind:b\.ind,latest:b\.map,src:b\.srcName/);
});

/* ══ ⑤ the country card's sources ═════════════════════════════════════════════════════════════════════ */

test('⑤ each fact names who published it (figure().src); a fact no writer named shows no source line', () => {
  const s = {};
  setFigure(s, 'gdp', 4200, 2023, { source: 'World Bank', licence: 'CC BY 4.0' });
  setFigure(s, 'gdppc', 33000, null, null);
  const C = run(lift(CUI, ['srcOf', 'sec']), {
    s, figure, escC: (x) => S.html(x == null ? '' : x), TR: (...a) => a[0],
  }, '{ sec }');
  const out = C.sec('Economy', [['GDP (2023)', '$4.2T', 'gdp'], ['GDP per capita', '$33k', 'gdppc'], ['Currency', 'JPY']]);
  assert.match(out, /GDP \(2023\)<span class="cm-src"[^>]*>Data source: World Bank<\/span>/);
  assert.equal((out.match(/cm-src/g) || []).length, 1, 'only the fact whose writer named a source');
  assert.equal(figure(s, 'gdp').src, 'World Bank', 'the one store');
});

/* (exploration-flows) measured on production 2026-11-18: «2020» with Brazil — the table read the per-country series and showed
   «—» under values the bars showed, because the World Bank's single-country requests timed out. One path for both views. */
test('the table and the bars read a picked year through the same latestData path', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/stats-compare.js', import.meta.url), 'utf8');
  const tbl = src.slice(src.indexOf('async function renderTable()'), src.indexOf('const wrap=body.querySelector(\'#scp-tblv\')'));
  assert.match(tbl, /inds\.map\(ind=>latestData\(ind\)\)/);
  assert.doesNotMatch(tbl, /blockData\(/, 'the table no longer has a second data path for a picked year');
});
