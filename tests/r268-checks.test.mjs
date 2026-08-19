/* ============================================================================
 *  IntMap · #R268 source & data checks
 * ----------------------------------------------------------------------------
 *  Every assertion here is about something that WAS wrong this round and was measured before it was
 *  changed. They are written against the RELATION rather than against a literal wherever that is
 *  possible (#R264's lesson: a test that pins a constant passes while the thing it is about breaks).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① 地形をリセット did nothing at all ───────────────────────────────────────────────────── */
test('R268 ① the terrain reset is ONE function, and it marks the ground dirty', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function resetTerrainNow\(\)/, 'the single reset must exist');
  /* the panel button and the Atlas door both go through it */
  assert.match(s, /\.tw-resetT'\)\.onclick=\(\)=>\{\s*resetTerrainNow\(\);/, 'the button must call it');
  assert.match(s, /resetTerrain\(\)\{\s*return resetTerrainNow\(\);/, 'the Atlas door must call it');
  /* and it bumps the memoised field, which is the whole defect */
  const body = s.slice(s.indexOf('function resetTerrainNow'), s.indexOf('function resetTerrainNow') + 400);
  assert.ok(/editDirty\(\)/.test(body), 'resetTerrainNow must call editDirty()');
  /* no OTHER handler may clear `sculpt` without it */
  const clears = s.split(/sculpt=new Float32Array/).length - 1;
  const withDirty = s.split(/sculpt=new Float32Array[^;]*;[^]{0,200}?editDirty\(\)/).length - 1;
  assert.equal(clears, withDirty, 'every path that clears the sculpt must reach editDirty()');
});

/* ── ② the basin grew past the elevation cache ─────────────────────────────────────────────── */
test('R268 ② the growing basin reads elevation one tile-block at a time', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  /* ⚠ the budget is PER PLATFORM, because the LRU is: 140 tiles on a phone against 560 on a desktop.
     Comparing one number against the smaller cap is what caught the first version of this. */
  const bm = /GROW_TILE_BUDGET=\(\)=>[\s\S]{0,90}?\?(\d+):(\d+)/.exec(s);
  assert.ok(bm, 'the per-block tile budget must exist and must depend on the platform');
  const [bMobile, bDesktop] = [+bm[1], +bm[2]];
  const cm = /const _DEM_CACHE_MAX=[^;]*?(\d+)\s*:\s*(\d+)/.exec(codeOnly(read('js/app-body.js')));
  const [capMobile, capDesktop] = [+cm[1], +cm[2]];
  assert.ok(bMobile < capMobile, `a phone block (${bMobile}) must fit inside its LRU (${capMobile})`);
  assert.ok(bDesktop < capDesktop, `a desktop block (${bDesktop}) must fit inside its LRU (${capDesktop})`);
  /* the fixed 28-samples-per-axis probe is what missed two tiles in three */
  assert.doesNotMatch(s, /Math\.round\(Math\.max\(nNX,nNY\)\/28\)/, 'the fixed 28-sample lattice must be gone');
  /* cells per tile are derived from the zoom, not typed */
  assert.match(s, /const tw=1\/Math\.pow\(2,z\)/, 'the tile size must come from the zoom');
  /* and a hole is counted AND printed */
  assert.match(s, /basinVoid\+=voids/, 'voids must be accumulated');
  assert.match(s, /result\.sim&&result\.sim\.voids/, 'voids must be reported in the panel');
});

/* ── ③ the raise/lower tint is a switch ────────────────────────────────────────────────────── */
test('R268 ③ the sculpt tint can be turned off, and only the tint', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /let tintEdits=/, 'the state must exist');
  assert.match(s, /function setTint\(v\)/, 'the setter must exist');
  assert.match(s, /class="tw-tint"/, 'the panel must carry the checkbox');
  /* the gate is in the DRAWING loop only — the solver must not see it */
  assert.match(s, /for\(let k=0;k<NX\*NY&&tintEdits;k\+\+\)/, 'the tint gates the terrain raster loop');
  const solve = s.slice(s.indexOf('function solve()'), s.indexOf('function solve()') + 4000);
  assert.doesNotMatch(solve, /tintEdits/, 'the solver must not depend on a display preference');
});

/* ── ④ the sparse facility layers ──────────────────────────────────────────────────────────── */
test('R268 ④ the live facility query is merged with the shipped snapshot, never substituted', () => {
  const s = codeOnly(read('js/osm-facilities.js'));
  const i = s.indexOf('cache.set(ck,feats)');
  const j = s.indexOf("showing='live'", i);
  assert.ok(i > 0 && j > i, 'the live path must still exist');
  const between = s.slice(i, j);
  assert.match(between, /inBox\(all,bb0\)/, 'the snapshot in view must be added to the live answer');
  assert.match(between, /osmId/, 'the merge must dedupe by OSM id');
});

test('R268 ④ the space layer asks for the satellite-communication tag, in both places', () => {
  const live = codeOnly(read('js/osm-facilities.js'));
  const build = codeOnly(read('scripts/build-osm-sparse.mjs'));
  const tag = 'communication:satellite';
  assert.ok(live.includes(tag), 'the live query must include it');
  assert.ok(build.includes(tag), 'the snapshot builder must include it');
  /* …and the shipped snapshot must actually have been rebuilt with it */
  const j = json('data/osm-space.json');
  assert.ok(j.count > 14000, `the space snapshot has ${j.count} objects, expected more than 14,000`);
  const k = {};
  for (const f of j.features) k[f.k] = (k[f.k] || 0) + 1;
  for (const b of ['pad', 'spaceport', 'ground', 'radio']) assert.ok(k[b] > 0, `bucket ${b} must be present`);
  assert.ok(j.query.some((q) => q.includes(tag)), 'the snapshot must record the query it was built with');
});

/* ── ⑤ the legend title took a string where a name table was wanted ────────────────────────── */
test('R268 ⑤ a legend name that is a bare string is one name, not one letter per language', () => {
  const s = codeOnly(read('js/data-layers.js'));
  assert.match(s, /if\(typeof names==='string'\) names=\[names,names,names,names,names\];/,
    'ensureGenericLegend must normalise a string');
  const p = codeOnly(read('js/precip-annual.js'));
  assert.match(p, /_registerLayerOpacity\('annprecip', NM,/, 'the caller must pass the NAME TABLE');
  assert.doesNotMatch(p, /_registerLayerOpacity\('annprecip', NAME\(\)/, 'never the resolved string');
});

/* ── ⑥ GDP growth: zero is the hinge ───────────────────────────────────────────────────────── */
test('R268 ⑥ the GDP-growth ramp is diverging, white at zero and symmetric', () => {
  const s = read('js/wb-layers.js');
  const m = /\{id:'wbgdpgrow',[^}]*ramp:\[([^\]]*)\]/.exec(s);
  assert.ok(m, 'the GDP-growth layer must still exist');
  const parts = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  const stops = [];
  for (let i = 0; i < parts.length; i += 2) stops.push([Number(parts[i]), parts[i + 1]]);
  const zero = stops.find((x) => x[0] === 0);
  assert.ok(zero, 'there must be a stop exactly at 0');
  assert.equal(zero[1].toLowerCase(), '#ffffff', '…and it must be white');
  const lo = stops[0][0], hi = stops[stops.length - 1][0];
  assert.equal(lo, -hi, `the ramp must be symmetric about zero (${lo} … ${hi})`);
  /* ⚠ THE INVARIANT IS THE INSTRUCTION, NOT A CHANNEL ORDERING. 「0付近は白、正ほど青、負ほど赤」 says
     three things: white at zero, red on the negative side, blue on the positive side — and, because
     「ほど」 is a comparative, further from zero means further from white. A monotonic red channel is
     NOT that (a red → white → blue ramp has red rising on the way up to white), and asserting it is
     how a test ends up failing a correct palette. */
  const chan = (hex, o) => parseInt(hex.slice(1 + o * 2, 3 + o * 2), 16);
  const dist = (hex) => Math.max(...[0, 1, 2].map((o) => Math.abs(255 - chan(hex, o))));
  for (const [v, c] of stops) {
    if (v < 0) assert.ok(chan(c, 0) > chan(c, 2), `a shrinking economy must be reddish, got ${c} at ${v}`);
    if (v > 0) assert.ok(chan(c, 2) > chan(c, 0), `a growing economy must be bluish, got ${c} at ${v}`);
  }
  const neg = stops.filter((x) => x[0] <= 0).sort((a, b) => b[0] - a[0]);
  const pos = stops.filter((x) => x[0] >= 0).sort((a, b) => a[0] - b[0]);
  for (const side of [neg, pos]) for (let i = 1; i < side.length; i++) {
    assert.ok(dist(side[i][1]) > dist(side[i - 1][1]),
      `further from zero must be further from white: ${side[i - 1][1]} → ${side[i][1]}`);
  }
});

/* ── ⑦ every raster with an archive can be asked for another date ──────────────────────────── */
test('R268 ⑦ the GIBS date range is measured data, and every dated layer has one', () => {
  const r = json('data/gibs-range.json');
  const s = codeOnly(read('js/layer-packs.js'));
  const ids = [...s.matchAll(/\{id:'(gx[a-z0-9]+)',\s*gibs:'([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.ok(ids.length >= 6, `expected the GIBS list, found ${ids.length}`);
  for (const [id, gibs] of ids) {
    if (/staticDate/.test(s.slice(s.indexOf("{id:'" + id + "'"), s.indexOf("{id:'" + id + "'") + 260))) continue;
    const row = r.layers[id];
    assert.ok(row, `${id} has no measured temporal extent`);
    assert.equal(row.gibs, gibs, `${id} must name the same GIBS product as the layer`);
    assert.ok(row.from < row.to, `${id}: ${row.from} must precede ${row.to}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.from) && /^\d{4}-\d{2}-\d{2}$/.test(row.to), 'ISO dates');
  }
  /* the URL is built from the chosen date, not from «today» */
  assert.match(s, /const urlFor=\(L\)=>'https:\/\/gibs[^']*'\+L\.gibs\+'\/default\/'\+gxAt\(L\)/, 'urlFor must use gxAt');
  /* one promise for everybody — the second layer must not get a null while the first is fetching */
  assert.match(s, /if\(gxRangeP\) return gxRangeP;/, 'the in-flight promise must be shared');
});

test('R268 ⑦ the two-epoch rasters can be switched too', () => {
  const dl = codeOnly(read('js/data-layers.js'));
  assert.match(dl, /const NIGHTSAT_EPOCHS=\['2016-01-01','2012-01-01'\]/, 'night lights: the two epochs GIBS serves');
  assert.match(dl, /gibs\('VIIRS_Black_Marble',8,'png',window\._nightsatEpoch\)/, 'the URL must use the chosen epoch');
  /* (#R268 追記) …and the 1 km population grid, which GIBS publishes as one product PER EPOCH.
     Probed one tile each: 2000 / 2005 / 2010 / 2015 / 2020 all answer 200. */
  assert.match(dl, /const POPGRID_EPOCHS=\['2020','2015','2010','2005','2000'\]/, 'the five GPW epochs');
  assert.match(dl, /const popgridTiles=\(\)=>gibsStatic\('GPW_Population_Density_'\+window\._popgridYear/,
    'the URL must be built from the chosen epoch');
  assert.match(dl, /addRaster\('popgrid',popgridTiles\(\),7\)/, '…and the layer must use it');
  const lp = codeOnly(read('js/layer-packs.js'));
  assert.match(lp, /const WC_EPOCHS=/, 'land cover: both ESA WorldCover versions');
  assert.ok(lp.includes('esa-worldcover-map-10m-2020-v1_map') && lp.includes('esa-worldcover-map-10m-2021-v2_map'),
    'both Terrascope layer names must be present');
  assert.match(lp, /tiles:wcTiles\(\)/, 'the source must be built from the chosen year');
});

/* ── ⑧ religion / language ─────────────────────────────────────────────────────────────────── */
test('R268 ⑧ the ex-Yugoslav standards are separate names with one fill', () => {
  const L = json('data/language.json');
  assert.equal(L.countries.SRB.top, 'sr', 'Serbia leads in Serbian');
  assert.equal(L.countries.HRV.top, 'hr', 'Croatia leads in Croatian');
  assert.equal(L.countries.BIH.top, 'bs', 'Bosnia leads in Bosnian');
  assert.ok(L.countries.MNE.mix.cnr > 0, 'Montenegrin must appear in Montenegro');
  /* `sh` survives ONLY where the source itself says Serbo-Croat */
  for (const [iso, rec] of Object.entries(L.countries)) {
    if (!(rec.mix || {}).sh) continue;
    assert.match(rec.src, /Serbo[- ]?Croat/i, `${iso} is bucketed as sh without the source saying so`);
  }
  const s = codeOnly(read('js/layer-packs.js'));
  assert.match(s, /const LANG_ONE_COLOUR=\{sr:'sh',hr:'sh',bs:'sh',cnr:'sh',sh:'sh'\}/, 'one fill for the family');
  assert.match(s, /group:LANG_ONE_COLOUR/, 'the language layer must use it');
  /* the platform's own name for `sh` is the risky one this round is about */
  assert.match(s, /sh:LA\('Serbo-Croatian'/, 'sh must be named Serbo-Croatian, not Serbian (Latin)');
  assert.match(s, /cnr:LA\('Montenegrin'/, 'cnr must be named Montenegrin');
});

test('R268 ⑧ every language code the data carries has a name to show', () => {
  const L = json('data/language.json');
  const s = read('js/layer-packs.js');
  const fixed = new Set([...s.matchAll(/^\s{6}'?([a-z]{2,3})'?:LA\(/gm)].map((m) => m[1]));
  /* the twelve Chromium's «modern» CLDR subset leaves unresolved, measured in the running page */
  for (const c of ['ff', 'rar', 'gil', 'niu', 'bi', 'na', 'pau', 'mh', 'tvl', 'tpi', 'kl', 'dz', 'sh', 'cnr', 'crp']) {
    assert.ok(fixed.has(c), `language code ${c} has no name in LANG_FIX`);
  }
  const codes = new Set();
  for (const r of Object.values(L.countries)) { codes.add(r.top); Object.keys(r.mix || {}).forEach((k) => codes.add(k)); }
  for (const c of ['ff', 'gil', 'na', 'bi', 'pau', 'mh', 'tvl', 'tpi', 'kl', 'dz']) {
    assert.ok(codes.has(c), `${c} is named but no longer in the data — drop it or keep the data`);
  }
});

test('R268 ⑧ the composition popup is a bar chart and states the year', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  const i = s.indexOf('function popupHTML(');
  const body = s.slice(i, i + 3000);
  assert.match(body, /width:'\+w\.toFixed\(1\)\+'%/, 'each row must carry a bar scaled to the largest share');
  assert.match(body, /rec\.y\?/, 'the year must come from the record');
  assert.match(body, /'Data year','データの年'/, 'the year must be labelled');
  /* …and the year is in the data for most of it */
  const R = json('data/religion.json'), L = json('data/language.json');
  const withY = (j) => Object.values(j.countries).filter((r) => r.y).length;
  assert.ok(withY(R) > Object.keys(R.countries).length * 0.8, 'most religion rows must carry a year');
  assert.ok(withY(L) > 60, 'the language rows the Factbook dates must carry a year');
});

/* ── ⑨ warnings: more services, grouped, and actually re-read ──────────────────────────────── */
test('R268 ⑨ three more national services are wired, and each is loaded and reported', () => {
  const s = codeOnly(read('js/world-packs.js'));
  assert.match(s, /AUS:'bom'/, 'Australia');
  assert.match(s, /BRA:'inmet'/, 'Brazil');
  assert.match(s, /HKG:'hko'/, 'Hong Kong');
  for (const fn of ['loadBOM', 'loadINMET', 'loadHKO']) assert.ok(s.includes('function ' + fn) || s.includes('async function ' + fn), fn + ' must exist');
  for (const k of ['bom', 'inmet', 'hko']) {
    assert.ok(new RegExp("FEED_STATE\\." + k + "='ok'").test(s), k + ' must record a good fetch');
    assert.ok(new RegExp("FEED_STATE\\." + k + "='error'").test(s), k + ' must record a failed fetch');
  }
});

test('R268 ⑨ every live warning fetch bypasses the HTTP cache', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const start = s.indexOf('function alerts(');
  const end = s.indexOf('4 · TIDES') > 0 ? s.indexOf('STATE.alertsLegend') : s.length;
  const body = s.slice(start, end);
  const fetches = [...body.matchAll(/fetch\((?:'|")https?:[^)]*\)/g)].map((m) => m[0]);
  /* ⚠ ONLY THE WARNINGS. `area.json` is JMA's list of area CODES AND NAMES and the geoBoundaries
     files are prefecture OUTLINES — reference data that changes on a scale of years, and telling the
     browser not to cache them would cost a megabyte a minute for nothing. */
  const live = fetches.filter((f) => !/geoboundaries|media\.githubusercontent|const\/area\.json/.test(f));
  assert.ok(live.length >= 4, `expected the live warning fetches, found ${live.length}`);
  for (const f of live) assert.match(f, /cache:'no-store'/, 'a 60 s timer that re-reads a cached document changes nothing: ' + f.slice(0, 90));
});

test('R268 ⑨ the tap folds three levels deep and never opens on a list of towns', () => {
  const s = codeOnly(read('js/world-packs.js'));
  const i = s.indexOf('function grouped(rows,cap)');
  const body = s.slice(i, i + 4200);
  assert.match(body, /subs:new Map\(\)/, 'the admin-1 bucket must hold sub-units');
  assert.match(body, /areas:new Map\(\)/, 'the sub-unit must hold its areas');
  assert.match(body, /'By area','地域ごと'/, 'the first fold is the sub-units');
  assert.match(body, /'Each municipality','市区町村ごと'/, 'the second fold is the municipalities');
  /* the JMA rows must know which region they are in, or the middle level is empty */
  assert.match(s, /const regionOf=\(code\)=>/, 'the class10 lookup must exist');
  /* ⚠ (#R269) THE PROPERTY, NOT THE VARIABLE NAME. #R269 rewrote `loadJMA` for the JMA's live r8
     bulletin list — the area identifier is `code` there rather than `a.code` — and pinning the old
     spelling made a rewrite that KEPT this behaviour look like a regression. What #R268 is about is
     that every JMA row carries the class10 region it belongs to, falling back to its own name. */
  assert.match(s, /sub:r10\?nameOf\(r10\):nameOf\([a-zA-Z.]+\)/, 'every JMA row must carry its region');
  assert.match(s, /const r10=regionOf\(/, '…looked up through the class10 walk');
});

/* ── ⑩ the layer taxonomy ──────────────────────────────────────────────────────────────────── */
test('R268 ⑩ the four moved rows are on their new shelf, and no id is on two', () => {
  const s = read('js/data-layers.js');
  const i = s.indexOf('const GROUPS=[');
  const block = s.slice(i, s.indexOf('/* Explicit order for the Others', i));
  const groups = {};
  for (const m of block.matchAll(/\['(lyrGrp[A-Za-z]+)',\[([^\]]*)\]\]/g)) {
    groups[m[1]] = m[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  assert.ok(Object.keys(groups).length > 10, 'the taxonomy must parse');
  assert.ok(groups.lyrGrpAgri.includes('wbagri'), '農地率 belongs with agriculture');
  assert.ok(groups.lyrGrpAgri.includes('gxsoil'), '土壌水分 belongs with agriculture');
  assert.ok(groups.lyrGrpTerrain.includes('wbforest'), '森林面積率 is land cover');
  assert.ok(groups.lyrGrpClimate.includes('wbpm25'), 'PM2.5 belongs with the air-composition rasters');
  assert.ok(!groups.lyrGrpTerrain.includes('wbagri') && !groups.lyrGrpTerrain.includes('gxsoil'), 'and they left Terrain');
  assert.ok(!groups.lyrGrpClimate.includes('wbforest'), '…and forest left Climate');
  assert.ok(!groups.lyrGrpHealth.includes('wbpm25'), '…and PM2.5 left Health');
  /* ⚠ `order.push` MOVES the row, so an id in two groups renders only in the last one */
  const seen = new Map();
  for (const [g, ids] of Object.entries(groups)) for (const id of ids) {
    assert.ok(!seen.has(id), `${id} is in both ${seen.get(id)} and ${g}`);
    seen.set(id, g);
  }
});

/* ── ⑪ the search box's clear button, and the precipitation tile ───────────────────────────── */
test('R268 ⑪ neither layer-search clear button paints a background', () => {
  for (const f of ['js/map-ui.js', 'js/map-extras.js']) {
    const s = read(f);
    const cls = f.includes('map-ui') ? 'lsr-clear' : 'ls-clear';
    const rules = [...s.matchAll(new RegExp('[^\\n]*' + cls + '[^\\n]*', 'g'))].map((m) => m[0]);
    const painted = rules.filter((r) => /background:\s*rgba?\(/i.test(r));
    assert.equal(painted.length, 0, `${f}: ${cls} still has a background disc: ${painted[0] || ''}`);
  }
});

test('R268 ⑪ the annual-precipitation tile has a real screenshot', () => {
  const s = read('js/layer-previews.js');
  assert.match(s, /'dl-annprecip':'preview_precip\.png'/, 'the tile must name the capture');
  assert.ok(existsSync(join(ROOT, 'preview_precip.png')), 'the capture must be committed');
  const size = statSync(join(ROOT, 'preview_precip.png')).size;
  assert.ok(size > 20000 && size < 400000, `the capture is ${size} bytes — the other preview_*.png sit well inside this`);
  assert.ok(existsSync(join(ROOT, 'scripts', 'shot-layer-preview.mjs')), 'and the way to remake it must be committed');
});

test('R268 ⑪ the hovered point reports the precipitation the layer is drawing', () => {
  const s = codeOnly(read('js/map-readout.js'));
  assert.match(s, /window\.IntMapPrecipAnnual/, 'the readout must ask the layer');
  assert.match(s, /P\.valueAt\(lng,lat\)/, '…for the point value');
  assert.match(s, /P\.year&&P\.year\(\)/, '…and say which year it is from');
  /* it must come BEFORE the weather branch, or a weather layer would hide it */
  assert.ok(s.indexOf('IntMapPrecipAnnual') < s.indexOf('const lyr=activeWxLayer()'), 'ordering');
});
