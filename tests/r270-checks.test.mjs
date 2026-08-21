/* ============================================================================
 *  IntMap · #R270 source checks
 * ----------------------------------------------------------------------------
 *  Eight reports in one round. The assertions below are about the PROPERTIES that make each defect
 *  impossible again — never about the literals this round happened to write.
 *
 *    ① the terrain & water panel opened underneath the sidebar, in a z-band this app does not have
 *    ② the layer-search ✕ was a character no family in this app's stack draws
 *    ③ the World-Bank keys drew a staircase for layers that paint a gradient
 *    ④ the year is on the layer, for every layer whose year means something
 *    ⑤ one fill for four South-Slavic standards made the colour key read 「セルビア語」
 *    ⑥ three rows were on the wrong shelf; two layers shared one name
 *    ⑦ 「day/night off」 was being read as 「the Sun's position is unknown」
 *    ⑧ two scales shared one palette, and the key named the other one
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① the terrain & water panel is a floating window like every other one ──────────────────── */
test('R270 ① the terrain panel joins the window band and is placed against a MEASURED sidebar', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.ok(!/z-index:1402/.test(s),
    'the panel must not carry a z-index of its own outside the app’s floating-window band');
  assert.match(s, /HOST\.registerWindow/,
    'the panel must be registered with the window manager, which is what keeps it in the band');
  assert.match(s, /HOST\.bringToFront/, 'opening it must raise it, like every other window');
  /* the placement reads the DOM rather than assuming a width — #R252's 「動く障害物は矩形を実測しろ」 */
  const m = /function placeClear\(\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(m, 'placeClear() must exist');
  assert.match(m[1], /getBoundingClientRect/, 'the free space must be measured, not assumed');
  assert.match(m[1], /#sidebar/, 'the left sidebar is the thing that covered it');
  assert.match(m[1], /_twMoved/, 'a position the reader chose must not be overwritten');

  /* the band itself is the window manager's, and it is still below the sidebars */
  const wm = codeOnly(read('js/window-manager.js'));
  const b = /WIN_Z_BASE=(\d+),\s*WIN_Z_CAP=(\d+)/.exec(wm);
  assert.ok(b, 'the window band must be declared in one place');
  const z = /panel\.style\.zIndex='(\d+)'/.exec(s);
  assert.ok(z, 'the panel must state its z-index');
  assert.ok(+z[1] >= +b[1] && +z[1] <= +b[2],
    `the panel's z-index (${z[1]}) must be inside the window band ${b[1]}–${b[2]}`);
});

test('R270 ① one row height in the panel, and the disclosures are on the list', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  /* ⚠ (#R275) ONE ROW HEIGHT IS STILL THE POINT; the NUMBER is now a declaration shared with the
     block and the disclosure, and it differs between a thumb and a desktop legend column (see the
     note on TW_ROW). Pinning 44 made a fix to the SCALE look like a regression of the RHYTHM. */
  const row = /'\.tw-row\{[\s\S]{0,320}/.exec(s);
  assert.ok(row, '.tw-row must be styled here');
  assert.match(row[0], /min-height:'\+TW_ROW\+'/, 'the grouped-list row height is the one declaration');
  for (const sel of ['.tw-blk', '.tw-note > summary'])
    assert.ok(s.indexOf("'" + sel + '{') > 0 || s.indexOf(sel) > 0, sel + ' must be styled here');
  assert.equal((s.match(/min-height:'\+TW_ROW\+'/g) || []).length, 3,
    'the row, the prose block and the disclosure summary all read the same height');
  assert.match(s, /'\.tw-val \.tw-segwrap\{/, 'a segmented control inside a row must be sized for it');
  /* the two <details> are cards, so their text starts on the same left edge as every row.
     ⚠ these declarations are written as CONCATENATED string literals, so a rule is the run of
     source from its selector to the closing brace — not one quoted string. */
  const rule = (sel) => { const i = s.indexOf("'" + sel + '{'); assert.ok(i > 0, sel + ' must be styled here');
    return s.slice(i, s.indexOf('}', i)).split("'+'").join(''); };
  const note = rule('.tw-note'), card = rule('.tw-card');
  assert.match(note, /border-radius/, '.tw-note must be a card');
  /* ⚠⚠ (#R273) THE INSET MOVED FROM THE CARD TO THE SUMMARY, and it had to: with the padding on the
     card the two disclosures came out 37.0 and 36.5 px tall against a 44 px row — a card is a card
     but it was not on the rhythm. The summary is a ROW now (44 px, inset 12 like every other row
     inside a bordered card), so what #R270 asserted — one left edge — is asserted of the element
     that actually carries the text. */
  /* (#R275) …and the rhythm is a declaration, not a number — see the note above `row`. */
  const sum = rule('.tw-note > summary');
  assert.match(sum, /min-height:'\+TW_ROW\+'/, 'a disclosure sits on the row rhythm');
  /* (#R275) the inset is `TW_INSET`, the SAME token the caption and the block read, which is what
     「one left edge」 means once the panel has two device scales. */
  assert.match(sum, /padding:0 '\+TW_INSET\+'px/, '.tw-note > summary must state its inset');
  assert.match(rule('.tw-cap'), /padding:0 '\+TW_INSET\+'px/, '…and it is the caption’s inset too');
  assert.match(card, /border-radius/, '.tw-card is the shape .tw-note now matches');
});

/* ── ② the clear mark is geometry, and there is exactly one of it ───────────────────────────── */
test('R270 ② both layer-search clear buttons draw the SAME geometric ✕, and neither uses the glyph', () => {
  const ui = codeOnly(read('js/map-ui.js'));
  const ex = codeOnly(read('js/map-extras.js'));
  const defs = (read('js/map-ui.js').match(/window\.IntMapClearGlyph\s*=/g) || []).length
             + (read('js/map-extras.js').match(/window\.IntMapClearGlyph\s*=/g) || []).length;
  assert.equal(defs, 1, 'the mark must be defined exactly once');
  assert.match(ui, /window\.IntMapClearGlyph=function/, 'js/map-ui.js is where it is defined');
  assert.match(ui, /stroke-linecap="round"/, 'it is two strokes, not a character');
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(ex, /window\.IntMapClearGlyph\(\)/, 'and the classic box that had to match it no longer exists');
  /* the glyph itself must not come back in either clear button */
  const X = String.fromCharCode(0x2715);
  assert.ok(!new RegExp('ls-clear[^;]*>' + X).test(ex), 'the classic clear button must not print U+2715');
  assert.ok(!new RegExp("className='lsr-clear'; b\\.textContent='" + X).test(ui),
    'the sidebar clear button must not print U+2715');
  /* …and the native WebKit ✕ that `type=search` adds is suppressed, or there would be two marks */
  assert.match(ui, /-webkit-search-cancel-button\{[^']*display:none/,
    'the native search cancel button must be suppressed on both boxes');
});

/* ── ③ the World-Bank key is the gradient the layer paints ──────────────────────────────────── */
test('R270 ③ the key is a gradient whose stops sit where the interpolation puts them', () => {
  const s = codeOnly(read('js/wb-layers.js'));
  const m = /function rampKey\(L\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(m, 'rampKey() must exist');
  assert.match(m[1], /linear-gradient/, 'the key must be a gradient bar');
  assert.match(m[1], /\(v-lo\)\/span/,
    'a stop must be placed at its VALUE’s fraction — the same function `interpolate` applies');
  assert.ok(!/width:11px;height:11px;border-radius:2px;background:'\+ramp/.test(s),
    'the per-stop chips must be gone');
  /* the fill really is an interpolation, so the key and the map are the same statement */
  assert.match(s, /\['interpolate',\['linear'\],\['get','v'\]\]\.concat\(L\.ramp\)/,
    'the fill must interpolate over the same ramp array');
});

test('R270 ③ the tile thumbnail interpolates too, and reads the LAYER’s ramp', () => {
  const p = codeOnly(read('js/layer-previews.js'));
  const m = /function rampColor\(ramp,v\)\{([\s\S]*?)\n    \}/.exec(p);
  assert.ok(m, 'rampColor() must exist');
  assert.match(m[1], /\(v-a\)\/\(b-a\)/, 'the thumbnail must interpolate between the two stops it lands between');
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
  const wp = codeOnly(read('js/world-packs.js'));
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
  /* the overlay refuses to carry a value into a year UNDP does not publish */
  const tc = codeOnly(read('js/time-countries.js'));
  assert.match(tc, /function hdiIndex\(year\)/, 'the year → column map must exist');
  const hi = /function hdiIndex\(year\)\{([\s\S]*?)\n    \}/.exec(tc);
  assert.ok(hi, 'hdiIndex() must be one function');
  assert.match(hi[1], /if\(year<ys\[0\]\) return -1/, 'before the series, there is no HDI');
  assert.match(tc, /window\._imHdiYear=/, 'the year actually drawn must be published for the legend');
  assert.match(codeOnly(read('js/data-layers.js')), /_syncYearHints\(\)/,
    'the dated source line must be repainted with the map it describes, not on a timer');
});

/* ── ⑤ the colour key is a key ──────────────────────────────────────────────────────────────── */
test('R270 ⑤ each South-Slavic standard has its own colour, so the key can name it', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  assert.ok(!/LANG_ONE_COLOUR/.test(s), 'the shared-fill table must be gone, not merely unused');
  assert.ok(!/grpOf/.test(s), '…and so must the grouping it existed for');
  const m = /const colOf=\(key,cat\)=>\{([\s\S]*?)\};/.exec(s);
  assert.ok(m, 'colOf() must exist');
  assert.ok(!/group/.test(m[1]), 'a category’s colour must be its own rank, with no family branch');
  /* the names #R268 separated are still separate — this round must not have undone that */
  assert.match(s, /sh:LA\('Serbo-Croatian'/, 'the joint standard keeps its own name');
  assert.match(s, /cnr:LA\('Montenegrin'/, 'Montenegrin keeps its own name');
});

/* ── ⑥ the shelves ──────────────────────────────────────────────────────────────────────────── */
test('R270 ⑥ the three moved rows are on exactly one shelf each, and it is the right one', () => {
  const s = codeOnly(read('js/data-layers.js'));
  const groups = {};
  for (const e of s.matchAll(/\['(lyrGrp[A-Za-z]+)',\[([^\]]*)\]\]/g)) {
    groups[e[1]] = e[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
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

/* ── ⑦ the Sun is known when the day/night display is off ───────────────────────────────────── */
test('R270 ⑦ «day/night off» is not «the Sun’s position is unknown» — and the Map basemap is unchanged', () => {
  const s = codeOnly(read('js/theme-sky.js'));
  const m = /function _sunElevAtCentre\(\)\{([\s\S]*?)\n  \}/.exec(s);
  assert.ok(m, '_sunElevAtCentre() must exist');
  const body = m[1];
  /* the vector basemap still answers «unknown», which is what keeps #R241's 「Mapでは大気ゼロ」 true */
  const iSat = body.indexOf('_satelliteUp()');
  const iNight = body.indexOf('_nightSideOff()');
  assert.ok(iSat >= 0 && iNight >= 0, 'both predicates must be consulted');
  assert.ok(iSat < iNight, 'the basemap is decided first, so the Map path is untouched');
  assert.match(body, /if\(!_satelliteUp\(\)\) return null/, 'no satellite basemap → no air, as before');
  assert.match(body, /if\(_nightSideOff\(\)\) return 90/,
    'with the display off the Sun is overhead at the camera centre — the light _aimSun() set');
  assert.ok(!/if\(_nightSideOff\(\)\) return null/.test(body),
    'answering «unknown» there is what switched the app’s own atmosphere off');
  /* the relative azimuth must agree with that reading, or the model is asked about another sun */
  const az = /function _relAzimuth\(\)\{([\s\S]*?)\n  \}/.exec(s);
  assert.ok(az, '_relAzimuth() must exist');
  assert.match(az[1], /_satelliteUp\(\)&&_nightSideOff\(\)\) return 0/, 'a sun at the zenith has no azimuth');
  /* the two things that must NOT change: the Map basemap has no air, and the sun still points */
  assert.match(s, /function _airOn\(\)\{ try\{ return HOST\.mapType==='sat'/, '#R241’s rule must stand');
  assert.match(s, /'atmosphere-blend':\(sat\?_airRamp\([\d.]+\):0\)/, 'the Map basemap keeps a blend of 0');
});

/* ── ⑧ a key takes its colours from the thing it is a key to ────────────────────────────────── */
test('R270 ⑧ a swatch and its label can never be about different scales', () => {
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
  assert.match(w, /return quietSet\[c\]\?2:1;/, 'a country whose service is read but quiet is grey — per unit where it can be');
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
