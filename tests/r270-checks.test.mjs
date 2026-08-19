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
  const row = /'\.tw-row\{[^']*'/.exec(s);
  assert.ok(row, '.tw-row must be styled here');
  assert.match(row[0], /min-height:44px/, 'the grouped-list row is 44 px');
  assert.match(s, /'\.tw-val \.tw-segwrap\{/, 'a segmented control inside a row must be sized for it');
  /* the two <details> are cards, so their text starts on the same left edge as every row.
     ⚠ these declarations are written as CONCATENATED string literals, so a rule is the run of
     source from its selector to the closing brace — not one quoted string. */
  const rule = (sel) => { const i = s.indexOf("'" + sel + '{'); assert.ok(i > 0, sel + ' must be styled here');
    return s.slice(i, s.indexOf('}', i)).split("'+'").join(''); };
  const note = rule('.tw-note'), card = rule('.tw-card');
  assert.match(note, /border-radius/, '.tw-note must be a card');
  const pad = /padding:\s*\d+px\s+(\d+)px/.exec(note);
  assert.ok(pad, '.tw-note must state its padding');
  assert.equal(pad[1], '11', 'the horizontal padding must be the row’s, so the column has one left edge');
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
  assert.match(ex, /window\.IntMapClearGlyph\(\)/, 'the classic box must read the same definition');
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
  assert.deepEqual(where('wbfert'), ['lyrGrpSociety'], 'fertility joins the demographic family');
  /* ⚠ AND NOTHING MAY BE ON TWO SHELVES: `order.push` MOVES the row, so the second listing wins and
     the first silently loses it (the note by rowFor()). */
  const seen = new Map();
  for (const g of Object.keys(groups)) for (const id of groups[g]) {
    assert.ok(!seen.has(id), `${id} is on two shelves: ${seen.get(id)} and ${g}`);
    seen.set(id, g);
  }
  /* the rows named by earlier instructions stay where their reader put them */
  assert.deepEqual(groups.lyrGrpDemo, ['popgrid', 'gdppc', 'tfr', 'hdi', 'dem', 'cpi', 'lifeexp', 'energy'],
    '#R233’s seven plus #R254’s energy mix must be untouched');
  for (const id of ['aurora', 'nightsat']) {
    assert.ok(groups.lyrGrpHazard.includes(id), `${id} stays under 「災害・夜空 / Hazards & night sky」`);
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

/* ── ⑧ two scales, two palettes, two keys ───────────────────────────────────────────────────── */
test('R270 ⑧ the GDACS wash has its own colours and cannot be read as an issued warning', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const grab = (name) => {
    const m = new RegExp('const ' + name + '=\\{([^}]*)\\}').exec(s);
    assert.ok(m, `${name} must exist`);
    const out = {};
    for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) out[e[1]] = e[2];
    return out;
  };
  const tier = grab('TIERCOL'), gd = grab('GDACSCOL');
  assert.deepEqual(Object.keys(tier).sort(), ['1', '2', '3'], 'three warning tiers');
  assert.deepEqual(Object.keys(gd).sort(), ['1', '2', '3'], 'three GDACS levels');
  const shared = Object.values(tier).filter((c) => Object.values(gd).includes(c));
  assert.deepEqual(shared, [], `the two scales must share no colour (shared: ${shared})`);
  /* a key takes its palette from the thing it is a key to — the pairing is structural now */
  assert.match(s, /function keyRows\(col,name\)/, 'the key builder must take BOTH');
  assert.match(s, /const tierKey=\(\)=>keyRows\(TIERCOL,tierName\)/, 'warning names go with warning colours');
  assert.match(s, /const gdacsKey=\(\)=>keyRows\(GDACSCOL,GDACS_TIERNAME\)/, 'GDACS names go with GDACS colours');
  assert.ok(!/tierKey\(GDACS_TIERNAME\)/.test(s),
    'the call that drew one palette under the other scale’s names must be impossible to write');
});

test('R270 ⑧ a country whose agency draws areas is never washed as a whole country', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const m = /const GEOM_FEEDS=\{([^}]*)\}/.exec(s);
  assert.ok(m, 'the polygon-publishing feeds must be named');
  const geom = m[1].split(',').map((x) => x.split(':')[0].trim()).filter(Boolean).sort();
  assert.deepEqual(geom, ['eccc', 'inmet', 'jma', 'nws'],
    'exactly the four feeds whose loaders push geometry');
  const wi = s.indexOf('function washTier(c){');
  assert.ok(wi > 0, 'washTier() must exist');
  const w = [null, s.slice(wi, s.indexOf('function paintCountries', wi))];
  assert.match(w[1], /if\(drawsAreas\(c\)\) return 0/, 'those countries get no wash at all');
  assert.match(w[1], /return g\?\(10\+g\):0/, 'a GDACS level is a DIFFERENT range on the same field');
  /* the paint must know both ranges, or half of them would fall through to «nothing» */
  const pi = s.indexOf("'fill-color':['match',['to-number',['feature-state','wpAlert'],0]");
  assert.ok(pi > 0, 'the choropleth must paint from that field');
  const paint = s.slice(pi, s.indexOf("'fill-opacity'", pi));
  for (const k of ['\n            3,', '2,', '1,', '13,', '12,', '11,']) {
    assert.ok(paint.includes(k.trim()), `the wash must have a colour for ${k.trim().replace(',', '')}`);
  }
  /* the six are the two three-step scales — no seventh case, no fall-through into a colour */
  const cases = [...paint.matchAll(/(?:^|,)\s*(\d+),\s*(?:TIERWASH|GDACSWASH)\[/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(cases, [1, 2, 3, 11, 12, 13], `expected exactly the two scales, got ${cases}`);
  /* the wash carries its own alpha, because the opacity slider overwrites fill-opacity wholesale */
  assert.match(s, /const GDACSWASH=\{[^}]*rgba\(/, 'the GDACS wash colours must carry alpha');
  assert.match(s, /const TIERWASH=\{[^}]*rgba\(/, 'so must the national wash');
});
