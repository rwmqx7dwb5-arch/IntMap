// R166 source-level regression checks — the fifth index.html split.
//
// #R162–#R165 took index.html from 36,955 lines to 16,740 by moving whole features into js/.
// What was left was a long tail: ~40 self-contained top-level blocks of 5–47 KB each. Moving them
// one-file-per-block would have produced 41 files, so #R166 groups them by SUBJECT — seven files,
// each holding several factories.
//
// That grouping introduces the one risk this round has that the earlier ones did not: with many
// factories in one file it becomes tempting to "tidy up" by calling them together at the top. They
// must NOT be. Each block used to run at a specific point of the closure, and these blocks build UI
// into shared containers (layer rows, panel buttons) where order is visible. So the invariant pinned
// below is: every factory is called exactly ONCE, and the 41 calls appear in index.html in exactly
// the order their blocks used to occupy.
//
// Everything else is the standing contract from #R163–#R165: values that are REASSIGNED at runtime
// are read through IM_HOST getters and never as bare identifiers, and writes go through the RW
// members declared in tests/r165-checks.test.mjs (js/playground.js is the second — and only other —
// module allowed to write, for mode + satPanelDismissed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
const html = rd('index.html');

/* Blank out comments and string/template literals so identifier scanning reads CODE only — the
   module headers document the rewrites in prose ("currentLang -> HOST.lang"), which would otherwise
   register as the very violation the scan is looking for. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* file -> the factories it defines */
const MOVED = {
  'js/map-ui.js': ['layerRegistry', 'layerSidebar', 'ticker', 'layerPresets', 'labelPopup', 'geojsonUpload', 'viewHash', 'share'],
  'js/playground.js': ['playground'],
  'js/map-tools.js': ['projView', 'drawTool', 'isolate', 'seaRoute', 'los', 'outline', 'moveShape', 'isochrone', 'arc3d', 'objectList'],
  'js/weather.js': ['wind', 'weatherEC', 'weatherPanel'],
  'js/layer-packs.js': ['earthSky', 'landCover', 'betaPack2', 'religionLang', 'timeZones', 'gibsScience'],
  'js/analysis-panels.js': ['timeSeries', 'aiResearch', 'correlate', 'worldEvents', 'edu'],
  'js/sims.js': ['radiation', 'popArea', 'slope', 'rf', 'sun', 'transitReach', 'disaster', 'earthReplay'],
};
const ALL_FACS = Object.values(MOVED).flat();

/* The order the 41 blocks occupied in the closure — i.e. the order their factory calls must appear
   in index.html. Interleaved with the earlier rounds' calls, which are not listed here. */
const ORDER = [
  'layerRegistry', 'layerSidebar', 'ticker',
  'playground',
  'projView', 'wind', 'drawTool',
  'earthSky', 'landCover', 'betaPack2', 'religionLang',
  'isolate', 'timeSeries', 'los', 'seaRoute', 'weatherEC',
  'layerPresets', 'aiResearch', 'correlate', 'worldEvents', 'edu',
  'labelPopup', 'geojsonUpload', 'weatherPanel', 'viewHash', 'share',
  'outline', 'moveShape', 'isochrone', 'radiation', 'arc3d',
  'objectList', 'popArea', 'slope', 'rf', 'sun', 'transitReach', 'disaster', 'earthReplay',
  'timeZones', 'gibsScience',
];

/* Closure values these blocks read that are REASSIGNED at runtime → live host getters, and never a
   bare identifier inside a js/ file. (namesOn/bordersOn/geoDB/satPanelDismissed are new this round.) */
const LIVE = {
  currentLang: 'lang', currentProj: 'proj', currentMapType: 'mapType', currentMode: 'mode',
  countryGeo: 'countryGeo', globalData: 'globalData', radiusItems: 'radiusItems',
  userPins: 'userPins', toolMode: 'toolMode', userTZ: 'userTZ', renderUI: 'renderUI',
  namesOn: 'namesOn', bordersOn: 'bordersOn', geoDB: 'geoDB', satPanelDismissed: 'satPanelDismissed',
};

test('R166 #1 all seven files are loaded and every factory they define is instantiated', () => {
  for (const [file, facs] of Object.entries(MOVED)) {
    const src = rd(file);
    assert.ok(html.includes(`<script src="${file}"></script>`), `index.html loads ${file}`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    // Comment-blanked: every header says "this file adds no <style>" in prose.
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    for (const f of facs) {
      assert.ok(src.includes(`window.IntMapModules.${f}=function(map,HOST){`),
        `${file} declares the ${f} factory taking (map,HOST)`);
      const calls = html.split(`window.IntMapModules.${f}(map,IM_HOST);`).length - 1;
      assert.equal(calls, 1, `index.html must call ${f} exactly once (found ${calls})`);
    }
    // The file defines these factories and no others, so the lists above cannot drift silently.
    const defined = [...src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function/g)].map((m) => m[1]);
    assert.deepEqual(defined.slice().sort(), facs.slice().sort(), `${file} defines exactly its declared factories`);
  }
});

test('R166 #2 ORDER: the 41 calls appear exactly where their blocks used to run', () => {
  // Grouping many blocks into one file makes "call them all together" look harmless. It is not:
  // these blocks append layer rows and panel buttons to shared containers, so their relative order
  // is user-visible. Pin it.
  const seen = ALL_FACS
    .map((f) => ({ f, at: html.indexOf(`window.IntMapModules.${f}(map,IM_HOST);`) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.f);
  assert.deepEqual(seen, ORDER, 'factory call order in index.html must match the original block order');
});

test('R166 #3 INVARIANT: every reassigned closure value these blocks read is a LIVE getter', () => {
  // Prove the classification rather than trusting it: each name is assigned somewhere in index.html
  // OUTSIDE its own declaration, so a captured copy would go stale.
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    return html.split('\n').filter((l) => asg.test(l) && !decl.test(l)).length;
  };
  for (const [name, prop] of Object.entries(LIVE)) {
    assert.ok(reassignments(name) > 0,
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a getter`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

test('R166 #4 no new module reads a reassigned value as a bare identifier', () => {
  for (const file of Object.keys(MOVED)) {
    const src = code(rd(file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
      const hits = (src.match(bare) || []).length;
      assert.equal(hits, 0,
        `${file} still mentions ${name} as a bare identifier — it must read HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R166 #5 the parser-backed split-scope check passes (and covers the seven new files)', () => {
  // Regex scope analysis lies (#R162). This is acorn: it fails on any free identifier that is a
  // closure top-level name of index.html, and on any name that resolves to nothing at runtime.
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R166 #6 the boot guard names every new factory, so one missing file cannot hide', () => {
  for (const f of ALL_FACS) {
    assert.ok(html.includes(`'${f}'`), `the boot guard lists the ${f} factory`);
  }
});

test('R166 #7 index.html actually shrank and no moved block came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 12_500, `index.html should be well under the pre-R166 16,740 lines; it is ${lines}`);
  // Blocks that opened with `window.X=(function(){` are the easy half to check directly.
  for (const g of ['IntMapLayers', 'IntMapLayerSidebar', 'IntMapTicker', 'IntMapShare', 'ProjView', 'DrawTool',
    'IntMapIsolate', 'IntMapRoute', 'IntMapLOS', 'IntMapOutline', 'IntMapMoveShape', 'IntMapIsochrone',
    'IntMapArc3D', 'IntMapObjects', 'Wind', 'IntMapWeatherEC', 'IntMapWeather', 'IntMapTimeSeries',
    'IntMapAIResearch', 'IntMapEdu', 'IntMapRadiation', 'IntMapPopArea', 'IntMapSlope', 'IntMapRF',
    'IntMapSun', 'IntMapTransitReach', 'IntMapDisaster', 'IntMapEarthReplay']) {
    assert.ok(!new RegExp(`window\\.${g}\\s*=\\s*\\(function`).test(html),
      `${g} must not be defined inline in index.html again`);
  }
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
