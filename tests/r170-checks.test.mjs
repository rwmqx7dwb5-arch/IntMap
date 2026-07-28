// R170 source-level regression checks.
//
// The round's centrepiece is a one-line conceptual fix with a very wide blast radius: the app had
// ~80 places asking "may I add a source/layer now?" and answering with map.isStyleLoaded(), which in
// MapLibre means "style parsed AND every source cache loaded". While a user pans, that is false most
// of the time (measured: 12 of 14 samples over a 12 s pan), so a freshly ticked layer waited for an
// idle frame — measured toggle-ON → painted at 4497 ms / 3171 ms when the map was busy vs 189 ms when
// it happened to be idle. Same click, wildly different latency: the reported
// 「レイヤーをオンオフしても、時間差で表示されたり表示されなかったりする」. After the fix: 95 / 71 / 107 ms.
//
// These checks pin the things that would silently regress:
//   · canDraw() exists, is a hoisted declaration, and never answers from isStyleLoaded() ALONE;
//   · no js/ module has drifted back to a raw isStyleLoaded() add-guard;
//   · every module that calls _imCanDraw() declares it inside the SAME factory (the trap #R163's
//     scope checker caught: these files hold several factories and one helper does not cover them);
//   · the defaults the user asked for are actually the defaults (ticker off, workspace opt-in,
//     airborne flight start);
//   · the 3-D volume tool is wired end to end — menu item, i18n in five languages, Atlas action AND
//     its SYS catalogue entry (an uncatalogued action does not exist to the planner — the #R115 rule);
//   · the Companies vintage constants exist and every displayed metric has an as-of branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';

const R = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js — so INDEX
   is the concatenation. Pointed at the new index.html these assertions would pass vacuously.
   JS_FILES stays the MODULE list: js/app-body.js is the page's own program, not a module. */
const INDEX = appShell(new URL('../', import.meta.url));
const JS_FILES = readdirSync(new URL('../js', import.meta.url)).filter(f => f.endsWith('.js') && f !== 'app-body.js');

/* strip /* … *\/ and // comments so "the code says X" is never satisfied by prose about X */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

test('canDraw() is declared in index.html as a hoisted function and exposed to modules', () => {
  const code = INDEX;
  assert.match(code, /function canDraw\(\)\s*\{/, 'canDraw must be a function DECLARATION (hoisted — modules and code above it call it)');
  assert.match(code, /window\.IntMapCanDraw\s*=\s*canDraw/, 'canDraw must be reachable from js/ modules');
  assert.match(code, /get canDraw\(\)\s*\{\s*return canDraw;\s*\}/, 'IM_HOST must expose canDraw so modules can call HOST.canDraw()');
});

test('canDraw() does not answer from isStyleLoaded alone — it must fall through to the parsed-style test', () => {
  const body = INDEX.slice(INDEX.indexOf('function canDraw()'));
  const end = body.indexOf('\n  window.IntMapCanDraw');
  const fn = stripComments(body.slice(0, end > 0 ? end : 900));
  assert.match(fn, /isStyleLoaded\(\)\)\s*return true/, 'the fast "already fully loaded" path should still short-circuit');
  assert.ok(/_loaded\s*===\s*true/.test(fn), 'must consult the parsed-style flag (the whole point: true while tiles stream)');
  assert.ok(/getStyle\(\)/.test(fn), 'must keep a PUBLIC-API fallback in case the internal flag ever moves');
});

test('no js/ module still gates a layer add on a raw isStyleLoaded()', () => {
  const offenders = [];
  for (const f of JS_FILES) {
    const src = stripComments(R('js/' + f));
    const lines = src.split('\n').filter(l => /isStyleLoaded/.test(l)
      // the helper's own last-resort fallback, and weather.js's diagnostic read-back, are deliberate
      && !/function _(im)?[cC]anDraw\(\)/.test(l) && !/styleLoaded:/.test(l));
    if (lines.length) offenders.push(f + ': ' + lines[0].trim().slice(0, 110));
  }
  assert.deepEqual(offenders, [], 'these still use isStyleLoaded() as an add-guard — use HOST.canDraw()');
});

test('every factory that calls _imCanDraw() declares it in that same factory', () => {
  // The migration first inserted the helper only into each file's FIRST factory; files like
  // js/sims.js hold eight, so seven of them referenced a name that resolves to nothing at runtime.
  // scripts/check-split-scope.mjs caught it — this keeps it caught if the helper is ever moved.
  const SIG = /^window\.IntMapModules\.\w+ ?= ?function ?\([^)]*\) ?\{[^\n]*$/gm;
  const bad = [];
  for (const f of JS_FILES) {
    const src = R('js/' + f);
    if (!src.includes('_imCanDraw()')) continue;
    const starts = [...src.matchAll(SIG)].map(m => m.index + m[0].length);
    for (let i = 0; i < starts.length; i++) {
      const seg = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
      if (seg.includes('_imCanDraw()') && !seg.includes('function _imCanDraw()')) bad.push(f + ' factory#' + (i + 1));
    }
  }
  assert.deepEqual(bad, [], 'these factories use _imCanDraw() without declaring it');
});

test('whenStyleReady() resolves on canDraw, not on isStyleLoaded', () => {
  const src = stripComments(R('js/data-layers.js'));
  const i = src.indexOf('function whenStyleReady()');
  assert.ok(i > 0, 'whenStyleReady must still exist');
  const fn = src.slice(i, i + 1200);
  assert.ok(!/map\.isStyleLoaded\(\)/.test(fn), 'whenStyleReady must not gate on isStyleLoaded any more');
  assert.ok((fn.match(/_canDraw\(\)/g) || []).length >= 3, 'the sync check, the listener and the poll must all use _canDraw');
  assert.match(src, /function _canDraw\(\)/, '_canDraw must be a function DECLARATION — withCountries() calls it from further up the file (#R167 TDZ trap)');
});

/* ---------------------------------------------------------------- requested defaults */

test('the bottom ticker defaults to OFF', () => {
  assert.match(INDEX, /window\.imTicker='off';/, 'imTicker must default to off on every device');
  assert.ok(!/window\.imTicker=\(window\.matchMedia/.test(INDEX), 'the old desktop-on default must be gone');
  // and the Settings label that has claimed "Off (default)" since #R63 is now true
  assert.match(INDEX, /data-i18n="tickerOff">Off \(default\)/);
});

test('desktop defaults to normal mode; workspace is opt-in', () => {
  const ws = stripComments(R('js/workspace.js'));
  const m = ws.match(/const _wantWS=\(\)=>\{[^\n]*\n?[^\n]*/);
  assert.ok(m, '_wantWS must still exist');
  assert.ok(!/return !isMob\(\)/.test(m[0]), 'desktop must no longer default INTO workspace mode');
  assert.match(m[0], /s\.on===1\|\|s\.on===true/, 'only an explicitly saved on:1 may enter workspace mode');
});

test('a fresh desktop boot selects the Countries tab, once', () => {
  const s = stripComments(INDEX);
  assert.match(s, /function _defaultTab\(\)/);
  assert.match(s, /IntMapOS\.exec\('tab\.stats',\{source:'default'\}\)/, 'the default tab must be Countries (tab.stats)');
  assert.match(s, /_tabInit=true/, 'it must record that it has run so it never overrides a user who closed every tab');
  assert.match(s, /tabInit:_tabInit/, 'and persist that in the session snapshot');
});

test('flight sim: airborne start is the default and the globe is forced', () => {
  const fs = R('js/flight-sim.js');
  assert.match(fs, /const state=\{ ac:selAc, loc:[^}]*mode:'air' \}/, 'the pre-flight screen must default to an airborne start');
  assert.match(fs, /<button class="fss-m on" data-m="air">/, 'the Airborne button must carry the selected class');
  assert.ok(!/<button class="fss-m on" data-m="ground">/.test(fs), 'the runway button must no longer be preselected');
  assert.match(fs, /IntMapOS\.exec\('view\.proj\.globe',\{source:'flightsim'\}\)/, 'start() must switch to the globe');
  /* (#R171) The restore is UNCONDITIONAL now, so the old `pv.proj!==HOST.proj` guard is gone on purpose:
     entry also sets a projection SPEC (the all-zoom globe) that no app state records, and the guard would
     skip the restore for a pilot who was already on the globe — leaving the normal map permanently changed.
     The claim this line makes ("stop() puts BOTH the flat and the globe view back") is unchanged and now
     stronger; tests/r171-checks.test.mjs asserts the guard's absence, and tests/r171.spec.js flies it. */
  assert.match(fs, /pv\.proj==='flat'\?'view\.proj\.flat':'view\.proj\.globe'/, 'stop() must restore the pre-flight projection in BOTH directions');
});

test('flight sim: "fly again" resumes from where the flight ended', () => {
  const fs = R('js/flight-sim.js');
  assert.match(fs, /lastEnd=\{ lng:\+st\.lng, lat:\+st\.lat, hdg:_fsHdg\(\)/, 'the end point + heading must be recorded');
  assert.match(fs, /localStorage\.setItem\('intmap_fs_last'/, 'and persisted so a later launch can offer it');
  assert.match(fs, /fromEnd:!!lastEnd/, '"Fly again" must pass the end point through to the pre-flight screen');
  assert.match(fs, /state\.loc==='__last'&&lastEnd/, 'the start-location select must honour the last end point');
});

test('every geolocation call asks for the best available fix', () => {
  const bad = [];
  for (const f of JS_FILES) {
    const src = R('js/' + f);
    for (const m of src.matchAll(/\{enableHighAccuracy:(\w+)[^}]*\}/g)) {
      if (m[1] !== 'true') bad.push(f + ' → ' + m[0].slice(0, 70));
      if (/maximumAge:(?!0\b)/.test(m[0])) bad.push(f + ' accepts a cached fix → ' + m[0].slice(0, 70));
    }
  }
  assert.deepEqual(bad, [], 'geolocation must be high-accuracy with no cached fix (「位置情報はできる限り高精度に」)');
});

test('the place-search pill sits at the top of the map', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.map-search\{ position:absolute; top:10px;/, 'the search pill must sit level with .map-controls-top (both 10px)');
});

/* ---------------------------------------------------------------- 3-D volume tool */

test('the 3-D volume tool is wired from menu to renderer', () => {
  /* (#R175) the tag became an import in the Vite entry (src/main.js), which appShell() includes. */
  assert.match(INDEX, /import '\.\.\/js\/volume3d\.js';/, 'the module must be loaded by the Vite entry');
  assert.match(INDEX, /window\.IntMapVolume3D=window\.IntMapModules\.volume3d\(map,IM_HOST\)/, 'and instantiated exactly once');
  assert.match(INDEX, /id="btn-tool-volume"/, 'the Measure menu needs the entry');
  assert.match(INDEX, /setTool\('volume'\)/, 'which activates the tool');
  /* (#R171) release() = clear() plus handing the drag gesture back, now that the freehand / circle /
     rectangle shapes take the drag while they are armed. Closing the tool must do both. */
  assert.match(INDEX, /toolMode==='volume'&&window\.IntMapVolume3D\) window\.IntMapVolume3D\.release\(\)/, 'exitTool must drop the box');
  const tp = R('js/tool-panel.js');
  assert.match(tp, /HOST\.toolMode==='area'\|\|HOST\.toolMode==='volume'/, 'the footprint must preview like an area ring');
  assert.match(tp, /volume:'🧊 '\+HOST\.t\('vol3dTool'\)/, 'the panel needs a localized title');
  assert.match(tp, /id="v3d-base"/); assert.match(tp, /id="v3d-top"/);
});

test('the 3-D volume module talks only to IntMapGeoEngine, never to the raw map', () => {
  const src = stripComments(R('js/volume3d.js'));
  // `map` is the factory's first parameter; using it would couple the tool to MapLibre
  assert.ok(!/\bmap\.(add|get|set|query|on|off|remove)\w*\(/.test(src),
    'js/volume3d.js must not call the MapLibre map directly — that is the point of the engine facade');
  assert.match(src, /GE\(\)\.coords\.terrainElevation/, 'the ground read must go through the engine');
  assert.match(src, /E\.layers\.addExtrusion/); assert.match(src, /E\.layers\.setExtrusionRange/);
});

test('the engine contract declares real metric extrusion and the canDraw/ready split', () => {
  assert.match(INDEX, /extrusion3d:true/, 'MapLibre capabilities must advertise metric extrusion');
  assert.match(INDEX, /canDraw\(\)\{ try\{ return !!\(window\.IntMapCanDraw/, 'the adapter must implement canDraw');
  assert.match(INDEX, /canDraw:\(\)=>_adapter\.canDraw\(\)/, 'and the facade must expose it');
  assert.match(INDEX, /addExtrusion\(d,before\)/); assert.match(INDEX, /setExtrusionRange\(id,baseM,topM\)/);
  const cesium = INDEX.match(/const CESIUM_CONTRACT=[^;]+;/)[0];
  assert.match(cesium, /extrusion3d:true/, 'the Cesium contract must stay in sync with the capability list');
});

test('the volume tool compensates for 3-D terrain instead of trusting the raw numbers', () => {
  const src = R('js/volume3d.js');
  assert.match(src, /const off=\(has3DTerrain\(\)&&groundM!=null\)\?groundM:0;/,
    'with terrain on, the DEM height must be subtracted so the band stays ABOVE SEA LEVEL');
  assert.match(src, /function chaseGround\(\)/, 'the DEM answers 0 before its tiles land — the reading must be chased');
  assert.match(src, /function wire\(n\)/, 'the engine listeners must be wired lazily (the engine does not exist at construction time)');
});

test('Atlas can drive the 3-D volume, and the action is in the SYS catalogue', () => {
  const atlas = R('js/atlas-console.js');
  assert.match(atlas, /case 'volume3d': case 'volume': \{/, 'the dispatch action must exist');
  assert.match(atlas, /\{"type":"volume3d","place":str/, 'and be catalogued — an uncatalogued action does not exist to the planner (#R115)');
  assert.match(atlas, /"name":"measure"\|"radius"\|"draw"\|"volume"/, 'the tool action must accept the volume tool too');
});

test('the 3-D volume tool is localized in all five languages', () => {
  const i18n = R('js/i18n.js');
  for (const key of ['vol3dBtn', 'vol3dTool']) {
    const n = (i18n.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(n, 5, `${key} must be defined in EN/JP/DE/RU/ES (found ${n})`);
  }
});

/* ---------------------------------------------------------------- Companies as-of stamps */

test('the Companies dataset declares its vintage', () => {
  const c = R('js/companies.js');
  assert.match(c, /const CURATED_ASOF='\d{4}-\d{2}-\d{2}';/, 'the curated table needs a compile date');
  assert.match(c, /const CURATED_FY='FY\d{4}';/, 'and a fiscal-year basis for the annual figures');
  assert.match(c, /CURATED_ASOF, CURATED_FY,/, 'both must be exported for the UI to stamp with');
  assert.match(c, /priceAsOf:c=>/, 'live prices must expose their timestamp');
  assert.match(c, /priceAsOfExact:c=>/, 'and whether it is the quote time or merely the fetch time');
});

test('every live price carries the timestamp it came with', () => {
  const c = R('js/companies.js');
  assert.match(c, /function _applyPrice\(c,p,tMs\)/, '_applyPrice must accept the quote time');
  assert.match(c, /c\.priceT=\(tMs>0\?tMs:Date\.now\(\)\); c\.priceTexact=\(tMs>0\)/, 'and record whether it is exact');
  assert.match(c, /\+v\.ts\[v\.ts\.length-1\]\*1000/, 'the batched spark path must use the last close timestamp');
  assert.match(c, /\(\+m\.regularMarketTime\|\|0\)\*1000/, 'the per-symbol path must use the quote time Yahoo returns');
});

test('every Companies metric has an as-of branch, and the chips are rendered everywhere', () => {
  const ui = R('js/companies-ui.js');
  const fn = ui.slice(ui.indexOf('function _coAsOf(c,key)'), ui.indexOf('function _coAsOfTitle'));
  for (const key of ['rev', 'ni', 'emp', 'fnd', 'price', 'mcap', 'pe']) {
    assert.ok(fn.includes(`'${key}'`), `_coAsOf must handle the ${key} metric`);
  }
  // list rows, detail overlay, compare bars, compare table and the CSV export
  assert.equal((ui.match(/_coAsOfChip\(/g) || []).length >= 5, true, 'the chip must appear in every place a figure is printed');
  assert.match(ui, /concat\(met\.map\(k=>_coAsOf\(c,k\)\)\)/, 'the CSV export must carry the dates too');
});
