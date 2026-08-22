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
import { appShell, lazyFiles, publishedGlobals } from './app-source.mjs';
import { readFileSync } from 'node:fs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

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
/* (#R209) the js/ files that are no longer in the entry's list because they are fetched on demand —
   derived from js/lazy-modules.js's own literal specifiers. */
const LAZY = lazyFiles(new URL('../', import.meta.url));

const MOVED = {
  'js/map-ui.js': ['layerRegistry', 'layerSidebar', 'ticker', 'layerPresets', 'labelPopup', 'geojsonUpload', 'viewHash', 'share'],
  'js/playground.js': ['playground'],
  /* (#R176) `los` left this file for js/viewshed.js when the star-polygon viewshed became a raster
     one — the factory name, the signature and the single call site are all unchanged, so
     the invariants this test guards still hold; only its address moved. */
  'js/map-tools.js': ['projView', 'drawTool', 'isolate', 'seaRoute', 'outline', 'moveShape', 'isochrone', 'arc3d', 'objectList'],
  'js/viewshed.js': ['los'],
  'js/weather.js': ['wind', 'weatherEC', 'weatherPanel'],
  'js/layer-packs.js': ['earthSky', 'landCover', 'betaPack2', 'religionLang', 'timeZones', 'gibsScience'],
  'js/analysis-panels.js': ['timeSeries', 'aiResearch', 'correlate', 'worldEvents', 'edu'],
  /* ⚠ (#R296) rf / disaster / earthReplay left this file with their features — 「電波・通信圏と
     見通し線解析を統合」, 「4つのうち…全削除」, 「存在意義が不明だから全削除」. What this list is FOR is
     that every factory a file DECLARES is instantiated — shortening it is the honest edit; the check
     is unchanged and still fails if a declared factory goes uninstantiated. */
  'js/sims.js': ['radiation', 'popArea', 'slope', 'sun', 'transitReach'],
};
const ALL_FACS = Object.values(MOVED).flat();
/* (#R209) …of which these are fetched on demand: the factories whose file the loader import()s. */
const LAZY_FACS = new Set(Object.entries(MOVED).filter(([f]) => LAZY.includes(f)).flatMap(([, v]) => v));

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
  'objectList', 'popArea', 'slope', 'sun', 'transitReach',
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
    assert.ok(html.includes(`import '../${file}';`) || LAZY.includes(file),
      `src/main.js imports ${file}, or js/lazy-modules.js fetches it on demand (#R175/#R209)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    // Comment-blanked: every header says "this file adds no <style>" in prose.
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    for (const f of facs) {
      assert.ok(src.includes(`window.IntMapModules.${f}=function(HOST){`),
        `${file} declares the ${f} factory taking (HOST)`);
      const calls = html.split(`window.IntMapModules.${f}(IM_HOST);`).length - 1;
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
  /* ⚠ (#R209) …AND A LAZY MODULE IS OUTSIDE THAT CLAIM, WHICH IS WHY IT IS EXCLUDED RATHER THAN
     RE-ORDERED. The property being pinned is "these blocks build shared UI in this sequence". A
     module fetched when the user clicks a menu item is instantiated long after every eager block has
     finished, so it HAS no position in that sequence — writing one down would pin a fiction. What
     keeps the exclusion honest is the precondition asserted below: a lazy factory may leave this
     list only if it builds no shared UI at instantiation time, i.e. it appends nothing to the layer
     dropdown and registers no layer. Break that and this test fails, rather than the app quietly
     losing a row for anyone who never opens the feature. */
  const lazyFacs = ALL_FACS.filter((f) => LAZY_FACS.has(f));
  for (const f of lazyFacs) {
    const file = Object.keys(MOVED).find((k) => MOVED[k].includes(f));
    const src = code(rd(file));
    assert.ok(!/IntMapLayers\s*\.\s*register|getElementById\(['"]layer-dropdown['"]\)/.test(src),
      `${file} carries the lazy factory ${f}, so it must build no shared layer UI when instantiated`);
  }
  const order = ORDER.filter((f) => !LAZY_FACS.has(f));
  const seen = ALL_FACS
    .filter((f) => !LAZY_FACS.has(f))
    .map((f) => ({ f, at: html.indexOf(`window.IntMapModules.${f}(IM_HOST);`) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.f);
  assert.deepEqual(seen, order, 'factory call order in index.html must match the original block order');
  /* …and each excluded one is still instantiated exactly once — by the loader. #1 counts them. */
  for (const f of lazyFacs) assert.ok(html.includes(`window.IntMapModules.${f}(IM_HOST);`), `${f} is still instantiated`);
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
  /* Blocks that opened with `window.X=(function(){` are the easy half to check directly.
     ⚠ (#R304) THE LIST IS READ OFF THE FILES NOW, NOT TYPED OUT. It went on naming `IntMapRF`,
     `IntMapDisaster` and `IntMapEarthReplay` four rounds after #R296 deleted them — harmless in
     itself, because this is a NEGATIVE assertion, but the same staleness in the other direction is
     not: a global that left index.html AFTER this list was written was never guarded against coming
     back. Derived, it follows js/ in both directions. */
  const moved = [...new Set(Object.values(publishedGlobals(root, Object.keys(MOVED)))
    .flatMap((f) => Object.values(f).flat()))];
  assert.ok(moved.length > 20, `the moved-global list derived from js/ is ${moved.length} — it collapsed`);
  for (const g of moved) {
    assert.ok(!new RegExp(`window\\.${g}\\s*=\\s*\\(function`).test(html),
      `${g} must not be defined inline in index.html again`);
  }
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
