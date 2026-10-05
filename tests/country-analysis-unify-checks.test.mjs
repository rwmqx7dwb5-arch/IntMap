/* ============================================================================
 *  country-analysis-unify — one catalogue of World Bank indicators, one read, and one door per question
 * ----------------------------------------------------------------------------
 *  MEASURED before this round (2026-10-04): the World Bank's series were named in seven tables
 *  (js/wb-layers.js, js/stats-compare.js, js/analysis-timeseries.js, js/analysis-correlate.js,
 *  js/time-countries.js, js/layer-packs.js, js/layer-previews.js) and the request was written in nine
 *  places, each with its own cache and its own idea of «empty» and «failed». A country had two time-series
 *  charts (the card's modal, the comparison's view) and three ways of being researched (Atlas's brief, the
 *  console's brief, a research panel) depending on what had happened to load. The map had two ways of being
 *  saved as a picture, and the one the Share menu called «Screenshot» captured #map-container alone — the attribution
 *  row (#map-credit) is outside it, so the PNG carried no credits.
 *
 *  What these checks hold, as the defects themselves (each EVALUATED where it can be):
 *    ① a World Bank series is written in ONE file — no series code and no API address anywhere else in js/;
 *    ② the read answers in one vocabulary (ok / none / unavailable, `late` for a read that ran out of time),
 *      keeps what an answer says and nothing a failure says, shares a read in flight and bounds the burst;
 *    ③ one country's timeline IS the comparison panel's time-series view — the card and Atlas open it;
 *    ④ every 「AI調査」 goes to Atlas's brief, and the brief offers the next questions;
 *    ⑤ 「Screenshot」 is the share panel's Image tab — the picture with the legends and the credits.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { WB_INDICATORS, wbIndicator, wbIndicatorFor, makeWorldBankReader } from '../js/wb-indicators.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CATALOGUE = 'js/wb-indicators.js';

/* every .js under js/, recursively — the tree a series could be written into */
function jsTree(dir = 'js') {
  const out = [];
  for (const f of readdirSync(join(ROOT, dir))) {
    const rel = dir + '/' + f;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...jsTree(rel));
    else if (f.endsWith('.js')) out.push(rel);
  }
  return out;
}
/* every string a file can put on the wire: string literals and the cooked text of template pieces */
function strings(rel) {
  const out = [];
  let ast;
  try { ast = acorn.parse(read(rel), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); }
  catch (_) { ast = acorn.parse(read(rel), { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }); }
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    else if (n.type === 'TemplateElement' && n.value && typeof n.value.cooked === 'string') out.push(n.value.cooked);
  });
  return out;
}
/* a World Bank WDI code: two or more dot-separated upper-case segments, the first two to four letters (SP.POP.TOTL,
   EN.ATM.PM25.MC.M3, GOV_WGI_CC.SC) — and every code the catalogue holds, whatever its shape */
const CODES = new Set(WB_INDICATORS.flatMap((I) => [].concat(I.parts || I.code, I.fallback || [])));
const LOOKS_LIKE_WDI = /^[A-Z][A-Z_]{1,9}\.[A-Z0-9_]{2,8}(\.[A-Z0-9]{1,6}){0,4}$/;

/* ══ ① ONE CATALOGUE, ONE ADDRESS ═════════════════════════════════════════════════════════════ */

test('① no file but the catalogue writes a World Bank series code or the API address', () => {
  const codeHits = [], urlHits = [];
  for (const rel of jsTree()) {
    if (rel === CATALOGUE) continue;
    for (const s of strings(rel)) {
      if (CODES.has(s) || (LOOKS_LIKE_WDI.test(s) && s.split('.').length >= 3)) codeHits.push(rel + ': ' + s);
      if (/api\.worldbank\.org\/v\d/.test(s)) urlHits.push(rel + ': ' + s.slice(0, 80));
    }
  }
  assert.deepEqual(codeHits, [], 'a World Bank series is written outside js/wb-indicators.js — name it by its key (wbIndicator) instead');
  assert.deepEqual(urlHits, [], 'a World Bank request is built outside js/wb-indicators.js — use readWorldBank');
  /* …and the catalogue itself holds them (the check above is not passing because the codes went nowhere) */
  const own = new Set(strings(CATALOGUE));
  for (const c of CODES) assert.ok(own.has(c), c + ' is not in the catalogue');
  assert.ok(strings(CATALOGUE).some((s) => /^https:\/\/api\.worldbank\.org\/v2\/$/.test(s)), 'the catalogue holds the one address');
});

test('① the catalogue is one entry per key and per series, each named in en and jp, each field filled once', () => {
  const keys = WB_INDICATORS.map((I) => I.k);
  assert.equal(new Set(keys).size, keys.length, 'a key is written twice');
  const series = WB_INDICATORS.map((I) => (I.parts || [I.code]).join('+'));
  assert.equal(new Set(series).size, series.length, 'a series is catalogued twice (two names for one quantity)');
  for (const I of WB_INDICATORS) {
    assert.ok(!!I.code !== !!I.parts, I.k + ': a series is a code or a set of summed parts, never both');
    assert.ok(Array.isArray(I.n) && I.n.length >= 2 && I.n[0] && I.n[1], I.k + ': named in en and jp');
    assert.equal(wbIndicator(I.k), I);
  }
  const stats = WB_INDICATORS.filter((I) => I.stat).map((I) => I.stat);
  assert.equal(new Set(stats).size, stats.length, 'two series fill one country-table field');
  for (const f of stats) assert.equal(wbIndicatorFor(f).stat, f);
  assert.equal(wbIndicator('nope'), undefined, 'an unknown key is absent, not a guess');
});

test('① the readers name indicators by key — the series they paint is the catalogue\'s, discovered from the tree', async () => {
  /* the gate that holds every Layers row to the series it claims (scripts/lib/indicator-series.mjs) reads the rows
     through the catalogue now; if a row named a key the catalogue does not have, its series would vanish from the
     discovery and the row's `measures` claim would fail there — so the discovery finding the family IS the check */
  const { discoverSeries } = await import('../scripts/lib/indicator-series.mjs');
  const files = jsTree().filter((f) => !f.includes('/locales/')).map((f) => [f, codeOnly(read(f))]);
  const found = discoverSeries(files);
  for (const [row, k] of [['wburb', 'urban'], ['wbref', 'ref'], ['wbco2', 'co2t'], ['wbco2', 'co2'], ['cpi', 'cpi'], ['lifeexp', 'life']]) {
    const I = wbIndicator(k);
    assert.ok(found.get(row) && found.get(row).series.has('worldbank:' + (I.parts || [I.code]).join('+')), row + ' paints ' + k + "'s series, read through the catalogue");
  }
});

/* ══ ② THE READ ═══════════════════════════════════════════════════════════════════════════════ */

function stubbedReader(script) {
  const calls = []; let active = 0, peak = 0;
  const readWithin = (u, ms, init, opts) => {
    calls.push({ u, ms, idle: !!(opts && opts.idle) });
    active++; peak = Math.max(peak, active);
    return Promise.resolve(script(u)).then((r) => { active--; return r; }, (e) => { active--; throw e; });
  };
  const R = makeWorldBankReader({ readWithin, clockFor: () => 100 });
  return { R, calls, peak: () => peak };
}
const body = (rows) => ({ text: JSON.stringify([{ page: 1 }, rows]) });
const late = () => Promise.reject(Object.assign(new Error('deadline'), { reason: 'timeout' }));

test('② an answer is ok or none and is kept; a failure is unavailable, says whether it was late, and is asked again', async () => {
  const { R, calls } = stubbedReader((u) => {
    if (/indicator\/A\?/.test(u)) return body([{ countryiso3code: 'JPN', date: '2020', value: 3 }, { countryiso3code: 'FRA', date: '2020', value: null }]);
    if (/indicator\/B\?/.test(u)) return { text: JSON.stringify([{ page: 1 }, null]) };
    if (/indicator\/C\?/.test(u)) return late();
    if (/indicator\/D\?/.test(u)) return { text: JSON.stringify({ message: 'not found' }) };
    throw new Error('unexpected ' + u);
  });
  const a = await R.read({ code: 'A' });
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.rows, [{ iso3: 'JPN', date: '2020', y: 2020, v: 3 }], 'a null value is not a value');
  assert.equal(await R.read({ code: 'A' }), a, 'an answer is kept: asking again is not a second request');
  const b = await R.read({ code: 'B' });
  assert.equal(b.status, 'none');
  await R.read({ code: 'B' });
  const c = await R.read({ code: 'C' });
  assert.equal(c.status, 'unavailable'); assert.equal(c.late, true, 'a read that ran out of time says so — it is not the host saying no');
  const d = await R.read({ code: 'D' });
  assert.equal(d.status, 'unavailable'); assert.equal(d.late, false);
  await R.read({ code: 'C' }); await R.read({ code: 'D' });
  const per = (k) => calls.filter((x) => new RegExp('indicator/' + k + '\\?').test(x.u)).length;
  assert.deepEqual([per('A'), per('B'), per('C'), per('D')], [1, 1, 2, 2], 'answers kept, failures asked again');
});

test('② the address carries what was asked; the clock is the host\'s times the caller\'s scale; a big body is timed on silence', async () => {
  const { R, calls } = stubbedReader(() => body([]));
  await R.read({ code: 'GOV_WGI_CC.SC', source: 3, date: '2023', perPage: 400 });
  await R.read({ code: 'X.Y', country: 'JPN', date: '1970:2030', perPage: 80, scale: 4, idle: true });
  await R.read({ code: 'X.Y', mrnev: 1 });
  assert.equal(calls[0].u, 'https://api.worldbank.org/v2/country/all/indicator/GOV_WGI_CC.SC?format=json&source=3&date=2023&per_page=400');
  assert.equal(calls[1].u, 'https://api.worldbank.org/v2/country/JPN/indicator/X.Y?format=json&date=1970:2030&per_page=80');
  assert.equal(calls[1].ms, 400); assert.equal(calls[1].idle, true);
  assert.match(calls[2].u, /&mrnev=1&per_page=400$/);
  assert.equal(R.clock(), 100);
});

test('② a read in flight is shared, `keep:false` keeps nothing after it, and no more than six run at once', async () => {
  const gates = [];
  const { R, calls, peak } = stubbedReader(() => new Promise((res) => gates.push(() => res(body([{ countryiso3code: 'JPN', date: '2020', value: 1 }])))));
  const p1 = R.read({ code: 'S' }), p2 = R.read({ code: 'S' });
  assert.equal(p1, p2, 'two askers of one address share one request');
  const many = Array.from({ length: 10 }, (_, i) => R.read({ code: 'M' + i, keep: false }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.length, 6, 'the seventh request waited for a slot');
  while (gates.length) { gates.shift()(); await new Promise((r) => setTimeout(r, 0)); }
  await Promise.all([p1].concat(many));
  assert.equal(peak(), 6);
  assert.equal(calls.length, 11);
  const again = R.read({ code: 'M0', keep: false });
  await new Promise((r) => setTimeout(r, 0)); gates.shift()(); await again;
  assert.equal(calls.length, 12, '`keep:false` asked again — the caller keeps its own derived form');
});

/* ══ ③ ONE COUNTRY'S TIMELINE ═════════════════════════════════════════════════════════════════ */

test('③ the timeline opens the comparison panel\'s time-series view on that one country, with the rows marked for it', () => {
  const src = codeOnly(read('js/stats-compare.js'));
  const calls = [];
  const timeline = new Function('scope', 'with (scope) { ' + liftFunction(src, 'timeline') + '\nreturn timeline; }')({
    countryStats: { JPN: {} }, IND: [{ k: 'gdp', tl: 1 }, { k: 'tfr' }, { k: 'co2', tl: 1 }],
    open: (...a) => calls.push(a), state: () => ({ open: true, codes: ['JPN'], mode: 'ts' }) });
  assert.deepEqual(timeline('JPN'), { open: true, codes: ['JPN'], mode: 'ts' });
  assert.deepEqual(calls, [[['JPN'], ['gdp', 'co2'], null, 'ts']]);
  assert.equal(timeline('ZZZ'), null, 'a code the country table does not have opens nothing');
  assert.equal(calls.length, 1);
  /* the rows that say `tl` are rows of the panel's table, each a catalogue indicator */
  const tl = [...src.matchAll(/W\('([a-z0-9]+)',\s*\{[^}]*\btl:1/g)].map((m) => m[1]);
  assert.ok(tl.length >= 1, 'the panel marks the rows a timeline shows');
  for (const k of tl) assert.ok(wbIndicator(k), k + ' is a catalogue indicator');
});

test('③ Atlas\'s timeSeries opens the same view and reports what the panel says it opened', async () => {
  const D = await import('../js/atlas-cap-data.js');
  const row = D.default.find((r) => r.row[0] === 'data.timeSeries');
  const g = globalThis, keep = g.window;
  const seen = [];
  g.window = { IntMapLazy: { need: async (n) => { seen.push('need:' + n); return true; } },
    IntMapStatsCompare: { timeline: (c) => { seen.push('timeline:' + c); return { open: true, codes: [c], mode: 'ts' }; } } };
  try {
    const K = { ensureData: async () => {}, resolveCountry: async () => ({ code: 'JPN', name: 'Japan' }), showCountryDetail: () => seen.push('card'),
      R: (ok, html) => ({ ok, html }), note: (s) => s, warn: (s) => 'WARN' + s, L: (en) => en, esc: (s) => String(s) };
    const r = await row.run({ country: 'Japan' }, {}, K);
    assert.equal(r.ok, true);
    assert.deepEqual(seen, ['card', 'need:statsCompare', 'timeline:JPN']);
    g.window.IntMapStatsCompare.timeline = () => ({ open: false, codes: [] });
    assert.equal((await row.run({ country: 'Japan' }, {}, K)).ok, false, 'a panel that did not open is not reported as opened');
  } finally { g.window = keep; }
});

test('③ the card\'s time-series button reaches the timeline, and the old chart is gone', () => {
  /* 綴りのまま: 主張は配線と不在（カードのボタンがどの窓口を呼ぶか／旧モジュールと旧グローバルが無いこと）で、DOM 上のクリックは node で再現できない */
  const cu = codeOnly(read('js/countries-ui.js'));
  assert.match(cu, /if\(a==='timeseries'\)\{[^\n]*IntMapLazy\.need\('statsCompare'\)[^\n]*const SC=window\.IntMapStatsCompare; if\(SC\) SC\.timeline\(_c\)/);
  assert.equal(existsSync(join(ROOT, 'js/analysis-timeseries.js')), false);
  for (const rel of jsTree()) assert.doesNotMatch(read(rel), /IntMapTimeSeries|__imAnalysisTimeSeries/, rel + ' still reaches the old chart');
});

/* ══ ④ ONE BRIEF ══════════════════════════════════════════════════════════════════════════════ */

test('④ every 「AI調査」 is Atlas\'s brief, fetched if need be — no ladder, no second panel', () => {
  /* 綴りのまま: 主張は配線と不在（ボタンがどの窓口を呼ぶか／旧パネルへの経路が無いこと）で、ボタンは DOM と遅延ロードの上でしか押せない */
  const cu = codeOnly(read('js/countries-ui.js'));
  const branch = cu.slice(cu.indexOf("if(a==='brief'){"), cu.indexOf("if(a==='brief'){") + 400);
  assert.match(branch, /window\.IntMapAtlas\.call\('brief',_n,_l\)/);
  assert.match(codeOnly(read('js/map-ui.js')), /if\(ai\) ai\.onclick=\(\)=>\{ try\{ window\.IntMapAtlas\.call\('brief',name,lngLat\); \}catch\(_\)\{\} \};/);
  assert.equal(existsSync(join(ROOT, 'js/analysis-research.js')), false);
  for (const rel of jsTree()) {
    const code = codeOnly(read(rel));
    assert.doesNotMatch(code, /IntMapAIResearch|__imAnalysisResearch/, rel + ' still reaches the research panel');
    assert.doesNotMatch(code, /IntMapConsole\.brief\b/, rel + ' calls the console\'s brief past the loader (it is there only if Atlas happened to load)');
  }
});

test('④ the brief ends with the next questions — the same offer the arrival makes, under the answer', () => {
  /* 綴りのまま: 主張は「同じ組み立てを 2 か所が使う」という配線で、組み立ては DOM 上でしか動かない */
  const rd = codeOnly(read('js/atlas-reading.js'));
  assert.match(rd, /function offer\(el, qs\)/);
  assert.match(rd, /return \{ arrive, askReading, readingStarters, offer \};/);
  assert.equal((rd.match(/offerHtml\(/g) || []).length, 3, 'one builder, used by the arrival and by the offer');
  const brief = liftFunction(codeOnly(read('js/atlas-console.js')), 'briefEntry');
  assert.match(brief, /READ\.offer\(ai, pointExamples\(act\.lng,act\.lat,/);
});

/* ══ ⑤ ONE PICTURE ════════════════════════════════════════════════════════════════════════════ */

test('⑤ 「Screenshot」 saves the share panel\'s Image-tab picture — the one that carries the legends and the credits', () => {
  /* 綴りのまま: 主張はボタンの配線と旧モジュールの不在で、ボタンは DOM の上でしか押せない（絵そのものは tests の postcard 検査が評価している） */
  const ab = codeOnly(read('js/app-body.js'));
  /* (share-simple) it saves that picture at once instead of opening the panel on it — the same postcard() the Image tab makes */
  assert.match(ab, /const _ss=document\.getElementById\('btn-screenshot'\); if\(_ss\) _ss\.onclick=\(\)=>\{ try\{ window\.IntMapShare\.screenshot\(\); \}catch\(_\)\{\} \};/);
  assert.match(codeOnly(read('js/map-ui.js')), /async function screenshot\(o\)\{[\s\S]*?await import\('\.\/map-recorder\.js'\);[\s\S]*?m\.postcard\(/);
  assert.equal(existsSync(join(ROOT, 'js/screenshot.js')), false);
  assert.doesNotMatch(ab, /makeScreenshot|screenshot\.js/);
  /* the picture the tab makes burns the credits in — js/map-recorder.js postcard, drawn from the same capture Atlas uses */
  const mr = codeOnly(read('js/map-recorder.js'));
  assert.match(mr, /import \{ makeViewCapture \} from '\.\/atlas-view-capture\.js';/);
  assert.match(mr, /export function drawnCredits\(/);
});
