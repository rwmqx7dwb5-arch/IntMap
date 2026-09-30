/* ============================================================================
 *  IntMap · legend keys, year rows and shelves — a key is a statement about the layer it keys
 *  (js/wb-layers.js, js/layer-previews.js, js/data-layers.js, js/world-packs.js, js/layer-packs.js,
 *   js/time-countries.js, js/datacenters.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r270-checks ③④⑤⑥⑧ and tests/r265-checks ⑨.
 *  #R270 — eight reports in one round; the assertions are about the PROPERTIES that make each defect
 *  impossible again — never about the literals that round happened to write.
 *    ③ the World-Bank keys drew a staircase for layers that paint a gradient
 *    ④ the year is on the layer, for every layer whose year means something
 *    ⑤ one fill for four South-Slavic standards made the colour key read 「セルビア語」
 *    ⑥ three rows were on the wrong shelf; two layers shared one name
 *    ⑧ two scales shared one palette, and the key named the other one
 *  #R265 ⑨ 「データセンター、AIインフラレイヤーに表示範囲内のものを表示する機能はいらない。」
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byKey } from './helpers/layer-groups.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ③ the World-Bank key is the gradient the layer paints ──────────────────────────────────── */
test('R270 ③ the key is a gradient whose stops sit where the interpolation puts them', () => {
  /* EVALUATED: `rampKey` is lifted out of the comment-stripped js/wb-layers.js and asked to draw the
     key for an UNEVEN ramp — the case a per-stop chip row (a staircase) gets wrong. */
  const s = codeOnly(read('js/wb-layers.js'));
  const rampKey = new Function('HOST', '_kFmt', liftFunction(s, 'rampKey') + '\nreturn rampKey;')(
    { escapeHtml: String }, (v) => String(v));
  const html = rampKey({ ramp: [0, '#000000', 10, '#ff0000', 40, '#00ff00', 100, '#0000ff'], unit: '' });
  const grad = /linear-gradient\(90deg,([^)]*)\)/.exec(html);
  assert.ok(grad, 'the key must be a gradient bar');
  const stops = grad[1].split(',').map((x) => x.trim());
  assert.deepEqual(stops, ['#000000 0.00%', '#ff0000 10.00%', '#00ff00 40.00%', '#0000ff 100.00%'],
    'a stop must be placed at its VALUE’s fraction — the same function `interpolate` applies');
  assert.ok(!/width:11px;height:11px;border-radius:2px/.test(html), 'the per-stop chips must be gone');
  /* the fill really is an interpolation, so the key and the map are the same statement.
     ⚠ READ, NOT RUN: the paint is handed to the renderer inside the layer factory. */
  assert.match(s, /\['interpolate',\['linear'\],\['get','v'\]\]\.concat\(L\.ramp\)/,
    'the fill must interpolate over the same ramp array');
});

test('R270 ③ the tile thumbnail interpolates too, and reads the LAYER’s ramp', () => {
  /* EVALUATED: `rampColor` (and the hex reader it uses) is lifted out of js/layer-previews.js. */
  const p = codeOnly(read('js/layer-previews.js'));
  const rampColor = new Function(liftFunction(p, '_hx') + '\n' + liftFunction(p, 'rampColor') + '\nreturn rampColor;')();
  const ramp = [0, '#000000', 100, '#ffffff', 200, '#ff0000'];
  assert.equal(rampColor(ramp, 50), '#808080', 'the thumbnail must interpolate between the two stops it lands between');
  assert.equal(rampColor(ramp, 150), '#ff8080');
  assert.equal(rampColor(ramp, -5), '#000000', 'below the first stop is the first colour');
  assert.equal(rampColor(ramp, 999), '#ff0000', 'above the last stop is the last colour');
  /* ⚠ READ, NOT RUN: which ramp the thumbnail is handed is wiring between two page factories. */
  assert.match(p, /IntMapWB\.rampOf/, 'the thumbnail must read the layer’s own ramp');
  assert.match(codeOnly(read('js/wb-layers.js')), /rampOf:\(id\)=>/, '…which the layer must publish');

  /* ⚠ THE CROSS-FILE CHECK IS THE ONE THAT WOULD HAVE CAUGHT IT. #R268 made GDP growth diverging in
     js/wb-layers.js and left js/layer-previews.js's copy on the old red→green ramp, so the tile and
     the map disagreed about the layer's colours for a whole round. The fallback copy must equal the
     layer's ramp for every id that has both. */
  const layerRamps = {};
  for (const e of read('js/wb-layers.js').matchAll(/\{id:'(wb[a-z0-9]+)',[\s\S]*?ramp:\[([^\]]*)\]/g)) {
    layerRamps[e[1]] = e[2].replace(/\s+/g, '');
  }
  let compared = 0;
  for (const e of read('js/layer-previews.js').matchAll(/'bx-(wb[a-z0-9]+)':\{c:[^,]*,r:\[([^\]]*)\]/g)) {
    const id = e[1], have = e[2].replace(/\s+/g, '');
    if (!layerRamps[id]) continue;
    compared++;
    assert.equal(have, layerRamps[id], `the thumbnail ramp for ${id} must be the layer's own ramp`);
  }
  assert.ok(compared > 30, `expected the whole World-Bank family to be compared, got ${compared}`);
});

/* ── ④ the year is on the layer ─────────────────────────────────────────────────────────────── */
test('R270 ④ one year row, driving the ONE clock, on every layer whose year is only the clock’s', () => {
  /* ⚠ READ, NOT RUN: the year row is DOM built into six legends and bound to the master clock at page start. */
  const dl = codeOnly(read('js/data-layers.js'));
  assert.match(dl, /window\._legendClockYear=legendClockYear/, 'the builder must be exported, not copied');
  const m = /function legendClockYear\(el,opts\)\{([\s\S]*?)\n      return row; \}/.exec(dl);
  assert.ok(m, 'legendClockYear() must exist');
  assert.match(m[1], /IntMapTime\.setYear/, 'choosing a year must move the master clock');
  assert.match(m[1], /IntMapTime\.setNow/, '…and 「現在」 must return it to live');
  assert.match(m[1], /IntMapTime\.on\(/, '…and the row must follow the clock when something else moves it');
  assert.ok(!/let\s+_clockYear\s*=/.test(m[1]), 'the row must hold no year of its own — one clock');
  for (const el of ['lgdGdppc', 'lgdPop', 'lgdTfr', 'lgdMil', 'lgdMilGDP', 'lgdHDI']) {
    assert.ok(new RegExp('legendClockYear\\(' + el + ',').test(dl), `${el} must carry the year row`);
  }
  /* the three world-pack layers read the same builder rather than growing one of their own */
  const wp = codeOnly(read('js/world-packs-rows.js') + read('js/world-packs.js'))   /* (startup-lazy-layers) the panel toolkit and the layers that call it */;
  assert.match(wp, /clockYear\(opts\)\{[\s\S]*?window\._legendClockYear/, 'the panel must delegate to it');
  /* ⚠ NOT «exactly three». Energy asks twice on purpose: its bounds are the CSV's own year span, so
     the row can only be built once the file has landed, and the render runs before that. */
  const calls = (wp.match(/panel\.clockYear\(/g) || []).length;
  assert.ok(calls >= 3, `trade, energy and crops must each ask for the row (found ${calls})`);
});

test('R270 ④ HDI has UNDP’s own annual series, and the label never claims a year UNDP has not published', () => {
  assert.ok(existsSync(join(ROOT, 'data/hdi-series.json')), 'the series must be bundled');
  const j = JSON.parse(read('data/hdi-series.json'));
  assert.ok(Array.isArray(j.years) && j.years.length >= 30, 'a real series, not one column');
  assert.equal(j.years[0], 1990, 'UNDP publishes from 1990');
  assert.ok(j.years[j.years.length - 1] >= 2022, 'and through at least 2022');
  const isos = Object.keys(j.hdi);
  assert.ok(isos.length >= 150, `expected the world, got ${isos.length} countries`);
  for (const iso of isos) {
    assert.match(iso, /^[A-Z]{3}$/, `${iso} is not a country code — aggregates must be dropped`);
    assert.equal(j.hdi[iso].length, j.years.length, `${iso} must have one slot per year`);
    for (const v of j.hdi[iso]) assert.ok(v === null || (v > 0 && v <= 1), `${iso}: ${v} is not an HDI`);
  }
  /* the overlay refuses to carry a value into a year UNDP does not publish.
     EVALUATED: `hdiIndex` is lifted out of js/time-countries.js and run over the shipped series. */
  const tc = codeOnly(read('js/time-countries.js'));
  const hdiIndex = new Function('hdiSeries', liftFunction(tc, 'hdiIndex') + '\nreturn hdiIndex;')(j);
  const last = j.years.length - 1;
  assert.equal(hdiIndex(j.years[0] - 1), -1, 'before the series, there is no HDI');
  assert.equal(hdiIndex(1850), -1, 'and none a century before it');
  assert.equal(hdiIndex(j.years[0]), 0, 'the first published year is the first column');
  assert.equal(hdiIndex(2000), j.years.indexOf(2000), 'a published year reads its own column');
  assert.equal(hdiIndex(j.years[last] + 5), last, 'after the series, the latest published column — never a year UNDP has not published');
  assert.equal(new Function('hdiSeries', liftFunction(tc, 'hdiIndex') + '\nreturn hdiIndex;')(null)(2000), -1,
    'no series loaded is no HDI, not a guessed column');
  /* ⚠ READ, NOT RUN: publication and repaint are page wiring between the overlay and the legend. */
  assert.match(tc, /window\._imHdiYear=/, 'the year actually drawn must be published for the legend');
  assert.match(codeOnly(read('js/data-layers.js')), /_syncYearHints\(\)/,
    'the dated source line must be repainted with the map it describes, not on a timer');
});

/* ── ⑤ the colour key is a key ──────────────────────────────────────────────────────────────── */
test('R270 ⑤ each South-Slavic standard has its own colour, so the key can name it', () => {
  /* ⚠ READ, NOT RUN: colOf is a closure of the language-layer pack factory; the names it keys are asked of the table. */
  const s = codeOnly(read('js/layer-packs.js'));
  assert.ok(!/LANG_ONE_COLOUR/.test(s), 'the shared-fill table must be gone, not merely unused');
  assert.ok(!/grpOf/.test(s), '…and so must the grouping it existed for');
  const m = /const colOf=\(key,cat\)=>\{([\s\S]*?)\};/.exec(s);
  assert.ok(m, 'colOf() must exist');
  assert.ok(!/group/.test(m[1]), 'a category’s colour must be its own rank, with no family branch');
  /* the names #R268 separated are still separate — this round must not have undone that */
  /* (#R538) keyed by Glottocode now, not by ISO 639-1 — the NAMES are what this asserts */
  assert.match(s, /[a-z0-9]{4}\d{4}:LA\('Serbo-Croatian'/, 'the joint standard keeps its own name');
  assert.match(s, /[a-z0-9]{4}\d{4}:LA\('Montenegrin'/, 'Montenegrin keeps its own name');
});

/* ── ⑥ the shelves ──────────────────────────────────────────────────────────────────────────── */
test('R270 ⑥ the three moved rows are on exactly one shelf each, and it is the right one', () => {
  const s = codeOnly(read('js/data-layers.js'));
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const groups = byKey;
  const where = (id) => Object.keys(groups).filter((g) => groups[g].includes(id));
  assert.deepEqual(where('wbhomicide'), ['lyrGrpSociety'], 'a homicide rate is not a defence layer');
  assert.deepEqual(where('osmemg'), ['lyrGrpHazard'], 'fire and police stations are not health');
  /* ⚠ (#R271) …AND THE DEMOGRAPHIC FAMILY MOVED. #R270 sent 合計特殊出生率（世界銀行） to Society &
     education because that is where the rest of the World-Bank demographic series were; #R271 moved
     that whole family — 人口増加率・65歳以上・都市・農村・人口密度・難民 — to 人口・経済, where a
     reader looking for population statistics looks. The property is 「it is with its family」, and it
     still is; only the family's address changed. */
  assert.deepEqual(where('wbfert'), ['lyrGrpDemo'], 'fertility joins the demographic family');
  for (const id of ['wbpopgrow', 'wbaging', 'wburb', 'wbrural', 'wbdensity'])
    assert.deepEqual(where(id), ['lyrGrpDemo'], id + ' is part of that same family');
  /* ⚠ AND NOTHING MAY BE ON TWO SHELVES: `order.push` MOVES the row, so the second listing wins and
     the first silently loses it (the note by rowFor()). */
  const seen = new Map();
  for (const g of Object.keys(groups)) for (const id of groups[g]) {
    assert.ok(!seen.has(id), `${id} is on two shelves: ${seen.get(id)} and ${g}`);
    seen.set(id, g);
  }
  /* ⚠ (#R271) THE ROWS NAMED BY EARLIER INSTRUCTIONS ARE STILL CURATED, ON A DIFFERENT SHELF.
     #R270 wrote 「say the word and they move」 about 民主主義指数 / 汚職指標 / 平均寿命; the word
     arrived (「大規模にレイヤーカテゴリ分類を再編しろ」) and they moved to the shelf their own subject
     names. オーロラ予測 went to 宇宙・軌道 and 夜間光 to 人口・経済, and with both gone the heading
     no longer says 「夜空」 — it is 「災害・緊急」 in all nine locale files now. What survives is the
     property: none of them fell back into Beta / Others, and none is on two shelves. */
  for (const id of ['popgrid', 'gdppc', 'tfr', 'hdi', 'dem', 'cpi', 'lifeexp', 'energy', 'aurora', 'nightsat']) {
    const w = where(id);
    assert.equal(w.length, 1, id + ' must be on exactly one shelf');
    assert.ok(!/Others|Beta/i.test(w[0]), id + ' fell back into ' + w[0]);
  }
});

test('R270 ⑥ no two World-Bank layers share a display name', () => {
  /* ⚠ READ, NOT RUN: the names are tuple literals in the layer table; reading every row is the whole check. */
  const src = read('js/wb-layers.js');
  const byLang = [{}, {}];
  for (const e of src.matchAll(/\{id:'(wb[a-z0-9]+)', code:[\s\S]*?n:LA\('([^']*)','([^']*)'/g)) {
    for (const i of [0, 1]) {
      const nm = e[2 + i];
      assert.ok(!byLang[i][nm], `「${nm}」 is the name of both ${byLang[i][nm]} and ${e[1]}`);
      byLang[i][nm] = e[1];
    }
  }
  assert.ok(Object.keys(byLang[1]).length > 50, 'the whole family must have been read');
  /* the two that collided with a layer in ANOTHER file now say which source they are */
  assert.match(src, /wblife'[\s\S]{0,200}Life expectancy \(World Bank\)/, 'life expectancy must be disambiguated');
  assert.match(src, /wbfert'[\s\S]{0,200}Fertility rate \(World Bank\)/, 'fertility must be disambiguated');
});

/* ── ⑧ a key takes its colours from the thing it is a key to ────────────────────────────────── */
test('R270 ⑧ a swatch and its label can never be about different scales', () => {
  /* ⚠ READ, NOT RUN: the key rows and palettes are closures of the alerts pack factory. */
  const s = codeOnly(read('js/world-packs.js'));
  /* ⚠⚠ (#R273) GDACS IS GONE, so the two scales this test was written about are now the agencies'
     OWN palettes and IntMap's normalised one — 「各国の警報階級を同じ紫・赤・黄に押し込んでいる。
     これがかなり危険です」. The property #R270 established survives unchanged and is what is
     asserted: a key row's colour and its name are produced together, so the call that drew one
     palette under another scale's names cannot be written. */
  assert.ok(!/GDACSCOL|GDACSWASH|GDACS_TIERNAME/.test(s), 'the GDACS palette must be gone, not renamed');
  assert.match(s, /function keyRows\(pairs\)/, 'a key row is a colour AND a name, together');
  assert.match(s, /const agencyKey=\(feed\)=>keyRows\(/, 'an agency key is built from that agency’s own palette');
  assert.match(s, /const normKey=\(\)=>keyRows\(/, '…and the normalised key from the normalised one');
  /* the three published palettes and IntMap's own must not be confusable */
  const grab = (name) => {
    const m = new RegExp(name + ':\\{([^}]*)\\}').exec(s);
    assert.ok(m, `${name} must exist`);
    const out = {};
    for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) out[e[1]] = e[2];
    return out;
  };
  const jma = grab('jma'), cap = grab('cap');
  const norm = (() => { const m = /const PAL_NORM=\{([^}]*)\}/.exec(s); assert.ok(m, 'PAL_NORM must exist');
    const o = {}; for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) o[e[1]] = e[2]; return o; })();
  assert.deepEqual(Object.keys(jma).sort(), ['20', '30', '40', '50'], 'the JMA has four published ranks');
  assert.deepEqual(Object.keys(norm).sort(), ['1', '2', '3', '4'], 'IntMap normalises onto four');
  const shared = Object.values(norm).filter((c) => Object.values(jma).includes(c) || Object.values(cap).includes(c));
  assert.deepEqual(shared, [], `IntMap’s scale must share no colour with an official one (shared: ${shared})`);
});

test('R270 ⑧ a country whose agency draws areas is never washed as a whole country', () => {
  /* ⚠ READ, NOT RUN: washTier reads drawnISO/quietSet, which only a running alerts layer fills. */
  const s = codeOnly(read('js/world-packs.js'));
  /* ⚠⚠ (#R271) THE LIST OF THOSE COUNTRIES IS NO LONGER WRITTEN DOWN, AND THAT IS THE POINT.
     #R270 kept a hand-written `GEOM_FEEDS={jma,nws,eccc,inmet}`; four more feeds started publishing
     shapes this round (DWD, MET Norway, MeteoAlarm-via-NUTS, and the province/state resolvers), and
     a hand-written table would have been wrong the moment they did. `drawnISO` is rebuilt from the
     features that actually reached the source on every publish, so the property #R270 asserted —
     「a country whose own units are on the map is never also painted whole」 — is now a measurement
     rather than a list. */
  assert.ok(!/const GEOM_FEEDS=\{/.test(s), 'the hand-written table must be gone, not extended');
  assert.match(s, /drawnISO/, 'the drawn set must be derived from the published features');
  /* ⚠⚠⚠ (#R273) …AND THE PROPERTY IS NOW ABSOLUTE. #R271 let a country be drawn at its units AND
     washed for the areas that could not be placed; measured with Japan at the municipality, that
     tinted the whole country for ELEVEN unplaced areas out of 1,490 — 「発令されてない箇所が紫色」
     with a smaller cause. A country is drawn at its units OR washed, never both, and the shortfall
     is stated in words instead (`placedLine`). */
  const wi = s.indexOf('function washTier(c){');
  assert.ok(wi > 0, 'washTier() must exist');
  const w = s.slice(wi, s.indexOf('function paintCountries', wi));
  assert.match(w, /if\(!supported\(c\)\) return 0;/, 'a country with no feed is state 0 — the hatch');
  assert.match(w, /if\(u&&!drawnISO\[c\]\) return 10\+/, 'a wash requires that NOTHING was drawn there');
  /* ⚠ (#R288) 「発令なし」 IS NOW DECIDED AT THE ADMINISTRATIVE UNIT, so the country-wide grey is
     tier 1 only where this map does NOT hold that country's units; where it does, the units carry
     it (tier 2, which no arm of the paint expression claims). The property #R270 asserted — a
     country is never painted whole where its own units are on the map — is unchanged and is what
     the two arms below say together. */
  /* ⚠ (#R290) …and the question is 「is the unit layer drawing this country RIGHT NOW」 rather than
     「are its shapes in the cache」: the quiet collection is bounded by the view and by the zoom
     (see quietISOs), so a country whose units are held but off-screen must keep the country-wide
     sheet or nothing would paint it at all. */
  /* ⚠ (#R299) …AND THE OTHER HALF OF #R270's OWN SENTENCE FINALLY REACHED THE ZOOMS IT DID NOT COVER.
     `quietSet` is empty below `QUIET_UNIT_Z` and while a unit index is still landing, so in both
     windows this line fell through to tier 1 — the country-wide 「読んだ。何も出ていない」 grey — over
     countries that were DRAWING WARNINGS. 「a country whose agency draws areas is never washed as a
     whole country」 is the title of this very test. So the relation is what is pinned, not the
     spelling: the last answer chooses between 「the units carry it」 and 「the country sheet carries
     it」, and a country that is drawing something takes the first arm. */
  assert.match(w, /return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/,
    'a country whose service is read but quiet is grey — per unit where it can be');
  assert.match(w, /\(quietSet\[c\]\|\|drawnISO\[c\]\)|drawnISO\[c\][^;]*\|\|[^;]*quietSet\[c\]/,
    '…and a country that IS drawing is never washed whole — which is this test’s own title');
  /* the paint must know all three states, or one of them falls through to «nothing» */
  const pi = s.indexOf("'match',['to-number',['feature-state','wpAlert'],-1]");
  assert.ok(pi > 0, 'the choropleth must paint from that field');
  const paint = s.slice(pi, pi + 400);
  /* one case = a state number followed by the colour it paints — `_wash(...)` for the four unplaced
     ranks and, since #R293, the NAMED grey constant rather than a second copy of its literal */
  const cases = [...paint.matchAll(/(\d+),(?:_wash\(|QUIET_COL|'rgba)/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(cases, [1, 11, 12, 13, 14], `expected grey plus the four unplaced ranks, got ${cases}`);
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, 'and «no feed» is a hatch, not a colour');
  /* the wash carries its own alpha, because the opacity slider overwrites fill-opacity wholesale.
     (#R273) the two hand-written wash tables became ONE function that dims whichever palette is on,
     which is what lets the mode switch be a paint swap rather than a second set of colours. */
  assert.match(s, /const _wash=\(hex\)=>/, 'the wash colour must carry its own alpha');
  assert.match(s, /return 'rgba\('[\s\S]{0,160}0\.62\)'/, '…and be weaker than a unit fill');
});

/* ══════════════════ #R265 ⑨ ══════════════════ */
/* ── ⑨ THE DATA-CENTRE LAYER STOPS ANSWERING ABOUT THE VIEW ─────────────────────────────────────
   「データセンター、AIインフラレイヤーに表示範囲内のものを表示する機能はいらない。」 Deleted, not hidden —
   and nothing else about the layer is reduced with it. */
test('R265 ⑨ the in-view summary is gone, and the layer keeps everything else', () => {
  /* ⚠ READ, NOT RUN: an absence, plus the renderer wiring that stays. */
  const s = read('js/datacenters.js');
  for (const re of [/件（表示範囲内）/, /sites in view/, /Largest published capacity in view/,
    /No site in view publishes a capacity figure/, /function inView\(/, /byOrigin/]) {
    assert.doesNotMatch(s, re, `${re} belongs to the deleted summary`);
  }
  assert.doesNotMatch(s, /setTimeout\(\(\)=>dcRender\(\),320\)/, 'and so does the repaint that kept it current');
  /* what stays: the OSM fetch for the view (that is how the layer gets data), the card, the filter */
  assert.match(s, /GE\(\)\.events\.on\('moveend',\(\)=>\{ if\(on\)\{ setTimeout\(\(\)=>refresh\(\),250\); \} \}\)/);
  assert.match(s, /id='dc-detail'/);
  assert.match(s, /toggleKey\(k\)\{/);
  assert.match(s, /key:\(\)=>KEY_ROWS\(\)\.map/, 'the colour key, which is also the class switch, survives');
  const c = read('js/layer-packs.js');
  assert.match(c, /k\.querySelectorAll\('\.dc-keyrow'\)\.forEach/, 'and the legend rows still switch classes off');
});
