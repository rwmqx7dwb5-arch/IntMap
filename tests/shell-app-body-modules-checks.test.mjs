/* ============================================================================
 *  shell-app-body-modules-checks — the app shell split into modules — factories, the core, what reaches what
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r200-checks.test.mjs
 *  tests/r162-checks.test.mjs
 *  tests/r170-checks.test.mjs
 *  tests/r166-checks.test.mjs
 *  tests/r408-checks.test.mjs
 *  tests/r196-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CARRIED_NAMES, LAZY_NAMES } from '../js/lazy-modules.js';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';
import * as acorn from 'acorn';
import { appShell, appSource, bootGuardKnows, factoryCalls, lazyFiles, lazyModules, publishedGlobals } from './app-source.mjs';
import { codeOnly, codeOnly as stripComments } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R200 · from r200-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R200 — ten more subjects out of the core, a hook that had never run,
 *                   and a darkness that is now the one the eye gets
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです」 continues from #R199, on the other file:
 *  js/app-body.js 5,149 → 4,360 lines, in TEN real ES modules (static `import`, no
 *  window.IntMapModules entry, no line in src/main.js's ordered list).
 *
 *  As in #R199, what makes that safe is not that code moved — it is that BOTH SIDES of every
 *  hand-off are DERIVED from the two files and compared here, never written down twice:
 *
 *    · what a module RETURNS            ==  what js/app-body.js destructures from the call
 *    · what a module READS off CTX      ==  what js/app-body.js passes in CTX
 *    · every CTX member is SHORTHAND    ==  it is the host's own binding, not a computed value
 *
 *  Plus the two defects this round fixed, each pinned by the property that was missing rather than
 *  by the line that fixes it:
 *    ② js/theme-sky.js subscribed to the master clock in its FACTORY BODY, which runs ~2,200 lines
 *      before js/app-body.js creates window.IntMapTime — so the subscription had never once happened.
 *    ③ js/night-side.js divided one darkness across five NESTED polygons as if alpha added up. It
 *      does not: the deepest night was 57 % dark while the constant said 78 %.
 * ==========================================================================*/
{
const CORE = read('js/app-body.js');

/* The ten files and the one name each exports. Every other list below is READ OUT of the sources. */
const MODULES = [
  ['js/session-tabs.js', 'makeSessionTabs'],
  ['js/layer-dropdown.js', 'makeLayerDropdown'],
  ['js/layer-favs.js', 'makeLayerFavs'],
  ['js/premium-plan.js', 'makePremiumPlan'],
  ['js/screenshot.js', 'makeScreenshot'],
  ['js/time-countries.js', 'makeTimeCountries'],
  /* the second pass: every section of js/app-body.js was swept for its surface, and these four
     measured 2/2/6/5 inbound against 0/0/0/1 outbound — cleaner cuts than anything in the first. */
  ['js/i18n-late.js', 'makeI18nLate'],
  ['js/wheel-zoom.js', 'makeWheelZoom'],
  ['js/keyboard-shortcuts.js', 'makeKeyboardShortcuts'],
  ['js/label-occlusion.js', 'makeLabelOcclusion'],
];

/* ── read a module: its CTX rebinds, the names it returns, every CTX.x it touches ── */
function readModule(rel, fnName) {
  const src = read(rel);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const ex = ast.body.filter((n) => n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.id);
  assert.equal(ex.length, 1, `${rel} exports exactly one factory`);
  const fn = ex[0].declaration;
  assert.equal(fn.id.name, fnName, `${rel} exports ${fnName}`);
  assert.deepEqual(fn.params.map((p) => p.name), ['HOST', 'CTX'], `${rel}: the factory takes (HOST, CTX)`);
  /* nothing else at the top level: a module that also declared a bare const would be re-introducing
     exactly the "global that is not a global" this whole split exists to remove (#R175's invariant) */
  const stray = ast.body.filter((n) => n !== ex[0] && n.type !== 'ImportDeclaration');
  assert.deepEqual(stray, [], `${rel}: the factory is the only top-level statement`);

  const body = fn.body.body;
  const first = body[0];
  assert.equal(first.type, 'VariableDeclaration', `${rel}: the factory opens with the CTX rebinds`);
  const rebinds = first.declarations.map((d) => {
    assert.equal(d.init.type, 'MemberExpression', `${rel}: every rebind reads CTX`);
    assert.equal(d.init.object.name, 'CTX');
    assert.equal(d.id.name, d.init.property.name, `${rel}: ${d.id.name} must keep its original name (the body is verbatim)`);
    return d.id.name;
  });

  const last = body[body.length - 1];
  const returned = last.type === 'ReturnStatement' ? last.argument.properties.map((p) => p.key.name) : null;

  const touched = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CTX' && !n.computed) touched.add(n.property.name);
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(fn);

  /* and every HOST.x the body reads — the values js/app-body.js REASSIGNS, which is the only reason
     a moved line is ever not verbatim */
  const host = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'HOST' && !n.computed) host.add(n.property.name);
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(fn);

  return { src, rebinds, returned, touched, host };
}

/* ── read the call site in js/app-body.js: makeX(IM_HOST, { … }) or const { … } = makeX(…) ── */
function readCallSite(fnName) {
  const ast = acorn.parse(CORE, { ecmaVersion: 'latest', sourceType: 'module' });
  let hit = null, calls = 0;
  (function walk(n, parent) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, parent));
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === fnName) {
      calls++;
      assert.equal(n.arguments.length, 2, `${fnName}(HOST, CTX)`);
      assert.equal(n.arguments[0].name, 'IM_HOST', `${fnName}: the first argument is the live host`);
      assert.equal(n.arguments[1].type, 'ObjectExpression');
      /* ⚠ (#R200) a module with an outbound surface is taken back through a HANDLE plus hoisted
         `function` shims — never a `const {…}` destructure at the block's old position. That was the
         first version of this round and it aborted the boot: js/map-ui.js reads two of these names off
         IM_HOST 1,800 lines earlier, and a const is in the temporal dead zone until its own line runs.
         So "what the core takes" is read off the SHIMS, which are hoisted exactly as the originals were. */
      const handle = (parent && parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier')
        ? parent.left.name : null;
      hit = {
        handle,
        given: n.arguments[1].properties.map((p) => p.key.name),
        shorthand: n.arguments[1].properties.filter((p) => p.shorthand).map((p) => p.key.name),
      };
    }
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k], n); }
  })(ast, null);
  assert.equal(calls, 1, `${fnName} is instantiated exactly once`);
  return hit;
}

/* spelling kept: browser script (src/main.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R200 ①: the ten subjects are real ES modules — no registry, no load order', () => {
  for (const [rel] of MODULES) {
    const src = read(rel);
    assert.doesNotMatch(src, /window\.IntMapModules(\.\w+|\[[^\]]+\])?\s*=(?!=)/,
      `${rel} must NOT register itself on the module registry — that is the dependency the user asked us to stop having`);
    assert.match(CORE, new RegExp(`^import \\{ \\w+ \\} from '\\./${rel.split('/')[1].replace('.', '\\.')}';$`, 'm'),
      `js/app-body.js names ${rel} in a static import, so the bundler — not src/main.js's list — orders it`);
    assert.doesNotMatch(read('src/main.js'), new RegExp(rel.replace('.', '\\.')),
      `${rel} must NOT be in the entry's ordered list either — the import graph is what orders it now`);
  }
});

test('R200 ②: what each module returns is what the core takes; what it reads is what the core passes', () => {
  for (const [rel, fn] of MODULES) {
    const m = readModule(rel, fn);
    const c = readCallSite(fn);
    /* a module with no outbound name is called as a statement; one with names is assigned to a handle
       and reached through hoisted shims. Either way the two sides must be the SAME set — a name in one
       and not the other is a silent undefined. */
    if (m.returned === null) assert.equal(c.handle, null, `${rel}: nothing is returned, so there is no handle to assign`);
    else {
      assert.ok(c.handle, `${rel}: the returned surface must be assigned to a handle the shims read`);
      const shims = [...CORE.matchAll(new RegExp(`function (\\w+)\\(\\)\\{ return ${c.handle}\\.(\\w+)\\.apply\\(this,arguments\\); \\}`, 'g'))];
      for (const s of shims) assert.equal(s[1], s[2], `${rel}: the shim must keep the original name (${s[1]} vs ${s[2]})`);
      assert.deepEqual(shims.map((s) => s[1]).sort(), [...m.returned].sort(),
        `${rel}: the factory's return and the core's hoisted shims must be the same set`);
    }
    assert.deepEqual([...m.touched].sort(), [...c.given].sort(),
      `${rel}: the CTX the module reads and the CTX the core passes must be the same set`);
    assert.ok(m.rebinds.every((k) => m.touched.has(k)), `${rel}: every rebind reads CTX`);
    /* every CTX member passed by shorthand: it IS app-body's own binding, not something computed at
       hand-off time (a computed copy is how a live value goes quietly stale) */
    assert.deepEqual(c.given.filter((k) => !c.shorthand.includes(k)), [],
      `${rel}: every CTX member is passed by shorthand`);
  }
});

test('R200 ③: the values app-body REASSIGNS are read live off IM_HOST, never captured', () => {
  /* The 21 non-verbatim lines of the 852 moved ones are all this rule (#R165's). For each HOST member
     a module reads, js/app-body.js must still own the closure variable behind a live getter — a
     captured copy is the #R162 failure mode with a longer fuse. */
  const seen = new Set();
  for (const [rel, fn] of MODULES) for (const k of readModule(rel, fn).host) seen.add(`${rel}:${k}`);
  assert.deepEqual([...seen].sort(), [
    'js/i18n-late.js:lang',
    'js/keyboard-shortcuts.js:lang',
    'js/keyboard-shortcuts.js:userTheme',
    'js/label-occlusion.js:markersArray',
    'js/label-occlusion.js:proj',
    'js/layer-favs.js:lang',
    'js/premium-plan.js:mapType',
    'js/session-tabs.js:mapType',
    'js/session-tabs.js:mode',
    'js/session-tabs.js:terrain3D',
    'js/time-countries.js:countryDataLoaded',
  ], 'the live-accessor surface of the ten modules');
  for (const k of ['mode', 'mapType', 'terrain3D', 'lang', 'countryDataLoaded', 'proj', 'markersArray', 'userTheme']) {
    assert.match(CORE, new RegExp(`get ${k}\\(\\)\\{ return \\w+; \\}`), `IM_HOST still owns ${k} behind a live getter`);
  }
  /* …and only ONE of the ten writes host state: the `t` shortcut cycles light → dark → auto. It goes
     through IM_HOST's accessor pair and is named as an owner in tests/atlas-console-kernel-checks.test.mjs (#R165's checks), which is
     the audit for written members. Every other module was chosen so nothing but reads crosses the cut. */
  for (const [rel] of MODULES) {
    if (rel === 'js/keyboard-shortcuts.js') {
      assert.match(read(rel), /HOST\.userTheme=nx/, 'the theme shortcut writes through the accessor pair');
      assert.match(read('tests/atlas-console-kernel-checks.test.mjs'), /'theme-sky\.js', 'keyboard-shortcuts\.js'\]/,
        '…and the RW contract names it as an owner');
      continue;
    }
    assert.doesNotMatch(read(rel), /HOST\.\w+\s*=(?!=)/, `${rel} must not write host state`);
  }
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R200 ④b: the names the layers menu hands back are HOISTED, because they are read earlier', () => {
  /* the regression this round actually produced, kept as a property rather than as a story: the two
     names js/map-ui.js captures off IM_HOST must be function DECLARATIONS in js/app-body.js (available
     from the closure's first line, as they were before they moved), and js/map-ui.js's mount must still
     come BEFORE the block that fills the handle in — which is precisely why a const cannot work here. */
  for (const nm of ['_collapseGroup', 'layerCbInfo', 'renderLayerFavs', 'updateOcclusion']) {
    assert.match(CORE, new RegExp(`^  function ${nm}\\(\\)\\{ return _IM_[A-Z]+\\.${nm}\\.apply\\(this,arguments\\); \\}$`, 'm'),
      `${nm} must be a hoisted shim`);
    assert.doesNotMatch(CORE, new RegExp(`const \\{[^}]*\\b${nm}\\b[^}]*\\} = make`), `${nm} must not come back as a const`);
  }
  assert.match(read('js/map-ui.js'), /const layerCbInfo=HOST\.layerCbInfo/, 'js/map-ui.js still captures it at factory time…');
  /* (module-graph) the registry is gone: app-body mounts it by the name it imports it under */
  const mountAt = /(?<![\w$.])layerSidebar\(IM_HOST\);/.exec(CORE);
  const mount = mountAt ? mountAt.index : -1;
  const fill = CORE.indexOf('_IM_LFAVS = makeLayerFavs(');
  assert.ok(mount > 0 && fill > 0 && mount < fill,
    '…and it is mounted BEFORE the favourites block, which is the ordering that makes the shim necessary');
});

test('R200 ④: no module inherited a closure variable', () => {
  const mine = /(session-tabs|layer-dropdown|layer-favs|premium-plan|screenshot|time-countries)\.js/;
  const problems = checkSplitScope().filter((p) => mine.test(p.file));
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R200 ⑤: the core keeps shrinking, and the ceiling follows the floor DOWN', () => {
  /* #R195's rule. Set from the measured floor at the end of this round with tight headroom, and it
     must come down again when the next subject leaves.
       js/app-body.js      5,375 (#R198) → 5,149 (#R199) → 4,360 (#R200)   budget 4,400
       js/atlas-console.js 6,580 (#R198) → 5,237 (#R199) → untouched here  budget 5,300 */
  const n = (p) => read(p).split('\n').length;
  const body = n('js/app-body.js');
  /* (#R795, completed in gate-parity-and-shards) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. #R795's own detector missed this one on its spelling; tests/helpers/line-ceilings.mjs asks about the fact. */
  assert.ok(body > 0);
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  const moved = MODULES.reduce((a, [rel]) => a + n(rel), 0);
  assert.ok(moved > 900, `the ten modules hold ${moved} lines — the core shrank by moving, not by losing`);
});

/* ── R200 ⑦ the night side's darkness → REPLACED by tests/r201-checks.test.mjs ①a–①d ─────────────────
   This test owned the five-ring arithmetic: NIGHT_PROFILE as the composite the eye gets, RING_ALPHA
   derived from it by inverting 1 − Π(1 − aᵢ), and the `match` on `['get','elev']` that chose per ring.
   #R201 deleted all of it — 「夜と昼の部分の変遷が階段状で不自然」 is a statement about FIVE FILLS, and
   no choice of five alphas is not five steps. The alpha is computed per pixel now, so there is no
   profile to invert and no ring to invert it for. What survived — the zoom expression is outermost,
   the last stop is a literal 0, anything data-driven rides on the stop OUTPUT — is asserted in
   r201-checks ①c against the mechanism that exists. Deleted rather than duplicated. */
}

/* ═══════════════════════ #R162 · from r162-checks.test.mjs ═══════════════════════ */
// R162 source-level regression checks — the index.html file split.
//
// index.html was 36,955 lines / 4.28 MB of single-file no-build app. #R162 moved the parts
// that are provably self-contained into css/ + js/ (standing rule 13):
//   • the whole stylesheet                     → css/intmap.css
//   • the 5-language UI string table           → js/i18n.js
//   • the built-in news gazetteer              → js/gazetteer.js
//   • dashboard cards + data-source registry   → js/reference-data.js
//   • IntMapLayerPreviews / Maddison / HistStates / HistId / IntMapMonitors → js/*.js
//
// The modules' BODIES were moved byte-identically; what used to be closure variables became
// explicit FACTORY PARAMETERS. That is only sound while those variables are assigned exactly
// once — a parameter captures a value, a closure re-reads a binding. If a later round makes
// `map` or `countryStats` reassignable, every extracted module silently keeps the stale value
// and nothing else in the suite would notice. That invariant is the load-bearing test here.
{
const root = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const rd = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n')
  : readFileSync(new URL(p, root), 'utf8'));
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);
const app = appSource(root);

/* Strip comments and string literals so identifier scanning is not fooled by prose or data. */
function code(src) { return codeOnly(src, { literals: 'blank' }); }
const HTML_CODE = code(html);

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R162 #1 index.html loads every extracted file, before the main script body', () => {
  const need = ['js/i18n.js', 'js/gazetteer.js', 'js/reference-data.js',
    'js/layer-previews.js', 'js/history.js', 'js/monitors.js'];
  // The app has small DOMContentLoaded handlers early in <head> (theme, stale-build notice);
  // the MAIN body is the last one — that is what must run after the module files are loaded.
  const mainAt = html.lastIndexOf("window.addEventListener('DOMContentLoaded'");
  assert.ok(mainAt > 0, 'the main DOMContentLoaded body still exists');
  for (const f of need) {
    /* (#R175) the tag became an import in src/main.js — same question, new mechanism.
       (module-graph) …or a static import in js/app-body.js itself, for a file with no top-level side effect
       that src/main.js stopped listing: an imported module is evaluated before its importer's body runs,
       so «before the main body» holds by the module semantics (and the import line still precedes it here). */
    const tag = [`import '../${f}';`, ` from './${f.slice(3)}';`].find((x) => html.includes(x));
    assert.ok(tag, `index.html loads ${f}`);
    assert.ok(html.indexOf(tag) < mainAt, `${f} is loaded BEFORE the main script body runs`);
    assert.ok(existsSync(new URL(f, root)), `${f} exists on disk`);
  }
  assert.ok(html.includes('<link rel="stylesheet" href="css/intmap.css">'), 'stylesheet is linked');
  assert.ok(existsSync(new URL('css/intmap.css', root)), 'css/intmap.css exists');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R162 #2 the moved code is GONE from index.html (no stale duplicate copy)', () => {
  for (const needle of [
    'const i18n={', 'const _BUILTIN_GZ=[', 'const _EXTRA_GZ=[',
    'const DEFAULT_DASH_CARDS=[', 'const DATA_SOURCES=[',
    'window.IntMapMonitors=(function(){', 'window.IntMapMaddison=(function(){',
    'window.IntMapHistStates=(function(){', 'window.IntMapHistId=(function(){',
    'window.IntMapLayerPreviews=(function(){',
  ]) assert.ok(!html.includes(needle), `index.html no longer defines ${needle}`);
  // …and the stylesheet is not re-inlined
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'no large inline <style> block remains');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R162 #3 index.html binds each extracted global back into the closure', () => {
  assert.ok(html.includes('const i18n=window.IntMapI18N;'), 'i18n rebound');
  assert.ok(html.includes('const _BUILTIN_GZ=window.IntMapGazetteer.builtin, _EXTRA_GZ=window.IntMapGazetteer.extra;'), 'gazetteer rebound');
  /* (module-graph) js/reference-data.js EXPORTS IntMapRefData now, and the shell rebinds from the import */
  assert.ok(html.includes('const DEFAULT_DASH_CARDS=IntMapRefData.dashCards;'), 'dash cards rebound');
  assert.ok(html.includes('const DATA_SOURCES=IntMapRefData.dataSources;'), 'data sources rebound');
  assert.match(rd('js/app-body.js'), /^import \{ IntMapRefData \} from '\.\/reference-data\.js';$/m, '…from the binding js/reference-data.js exports');
});

/* spelling kept: browser script (js/history.js, js/monitors.js, js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R162 #4 each factory is instantiated with exactly its declared dependencies', () => {
  /* (module-graph) the registry is gone: each factory is `export function name(params){` and the shell calls
     it by the name it imports it under — the dependencies it is handed are unchanged */
  const calls = {
    'window.IntMapMaddison=maddison();': ['js/history.js', 'maddison', []],
    'window.IntMapHistStates=histStates(countryStats);': ['js/history.js', 'histStates', ['countryStats']],
    'window.IntMapHistId=histId(countryStats);': ['js/history.js', 'histId', ['countryStats']],
    // (#R163) the private host object became the shared IM_HOST and the parameter was renamed H → HOST
    // (#R180) …and the renderer parameter is gone: no module receives the raw handle any more.
    'window.IntMapMonitors=monitors(IM_HOST);': ['js/monitors.js', 'monitors', ['HOST']],
    /* (#R225) one argument fewer: geoLayersDB went with the geopolitics layers it described */
    'window.IntMapLayerPreviews=layerPreviews(countryStats,loadCountryData);':
      ['js/layer-previews.js', 'layerPreviews', ['countryStats', 'loadCountryData']],
  };
  const body = rd('js/app-body.js');
  for (const [call, [file, name, params]] of Object.entries(calls)) {
    assert.ok(html.includes(call), `index.html instantiates ${name}`);
    assert.equal((code(html).match(new RegExp(`(?<![\\w$.])${name}\\(`, 'g')) || []).length, 1, `index.html instantiates ${name} exactly once`);
    assert.match(body, new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./${file.slice(3).replace('.', '\\.')}';$`, 'm'),
      `js/app-body.js imports ${name} from ${file}`);
    const src = rd(file);
    const sig = `export function ${name}(${params.join(',')}){`;
    assert.ok(src.includes(sig), `${file} declares ${name} taking (${params.join(',')})`);
  }
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R162 #5 INVARIANT: every value passed to a factory is assigned exactly once', () => {
  // A closure re-reads its binding; a parameter captures the value at call time. These are
  // equivalent ONLY while the binding is never reassigned after the factory runs. Guard it.
  // Lines that assign the bare name WITHOUT declaring it — i.e. true re-bindings. A line like
  // `let map=null, x=1` or `const map={…}` (an unrelated inner lookup table) is a declaration,
  // not a re-binding of the outer one.
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    const out = [];
    HTML_CODE.split('\n').forEach((l, i) => { if (asg.test(l) && !decl.test(l)) out.push({ line: i + 1, text: l.trim().slice(0, 80) }); });
    return out;
  };

  // `map`: declared `let map=null`, then bound exactly once — the MapLibre construction.
  const m = reassignments('map');
  assert.equal(m.length, 1, `map must be bound exactly once; found ${m.length}: ` + JSON.stringify(m));
  /* (#R178) the construction is spelled `map=GE().ui.createView({` now: even the PRIMARY view goes
     through the engine contract, since js/geo-engine.js is imported before app-body.js runs. The
     invariant is unchanged — one binding, one place, everything else after it. */
  assert.ok(m[0].text.includes('map=GE().ui.createView('),
    'the single map binding is the renderer construction — a later rebind would strand every extracted module on the old instance');

  // `countryStats` is declared once and thereafter only ever MUTATED IN PLACE.
  const cs = reassignments('countryStats');
  assert.equal(cs.length, 0, `countryStats must never be reassigned; found: ` + JSON.stringify(cs));

  // (#R225) `geoLayersDB` is GONE with the nine geopolitics layers it described. The invariant this
  // block protects — a factory is handed values that cannot be rebound under it — is carried by the
  // remaining data argument, and by the fact that the removed one can no longer be reassigned at all.
  assert.equal(reassignments('geoLayersDB').length, 0, 'geoLayersDB is gone and cannot be reassigned');
  assert.ok(/function\s+loadCountryData\s*\(/.test(HTML_CODE), 'loadCountryData is a function declaration');
});

/* spelling kept: browser script (js/monitors.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R162 #5b INVARIANT: mutable host values reach monitors as GETTERS, never copies', () => {
  // The bug this guards: js/monitors.js read `radiusItems` via `typeof radiusItems!=='undefined'`.
  // Once moved out of the closure that guard silently evaluated false, so activeArea() fell
  // through to "no area selected" — the radius→monitor path was lost with NO error. These four
  // are all rebound at runtime, so a captured parameter would reintroduce exactly that failure.
  // (#R163) these four moved from monitors' own inline host object into the shared IM_HOST, and the
  // module parameter was renamed H → HOST. Same invariant, one object: still getters, never copies.
  const host = html.slice(html.indexOf('const IM_HOST={'), html.indexOf('const IM_HOST={') + 3000);
  for (const [prop, src] of [['lang', 'currentLang'], ['user', 'currentUser'], ['mode', 'currentMode'], ['radiusItems', 'radiusItems']]) {
    assert.ok(new RegExp(`get\\s+${prop}\\(\\)\\s*\\{\\s*return\\s+${src};`).test(host),
      `${prop} must be a live getter over ${src}, not a captured value`);
  }
  const mon = rd('js/monitors.js');
  for (const stale of ["typeof radiusItems!=='undefined'", "typeof currentLang!=='undefined'", "typeof currentUser!=='undefined'", "typeof currentMode!=='undefined'"]) {
    assert.ok(!mon.includes(stale), `monitors.js must not probe the vanished closure binding (${stale})`);
  }
  assert.ok(mon.includes('HOST.radiusItems') && mon.includes('HOST.lang') && mon.includes('HOST.user') && mon.includes('HOST.mode'),
    'monitors.js reads the mutable state through the host interface');
});

/* spelling kept: browser script (js/i18n.js, js/gazetteer.js, js/reference-data.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R162 #6 the extracted files define the globals the app depends on', () => {
  /* (#R221) js/i18n.js still PUBLISHES window.IntMapI18N — it just builds it from js/locales/ui.*.js
     now instead of being a literal, so the assertion is on the assignment rather than on `={`. */
  assert.ok(/window\.IntMapI18N\s*=/.test(rd('js/i18n.js')), 'i18n.js sets window.IntMapI18N');
  assert.ok(rd('js/gazetteer.js').includes('window.IntMapGazetteer='), 'gazetteer.js sets window.IntMapGazetteer');
  /* (module-graph) the owner EXPORTS it, and keeps publishing the same object on the global (compat window) */
  assert.ok(rd('js/reference-data.js').includes('export const IntMapRefData = ') && /^globalThis\.IntMapRefData = IntMapRefData;/m.test(rd('js/reference-data.js')),
    'reference-data.js sets window.IntMapRefData');
  /* (module-graph) «extends the registry without clobbering it» → the registry is gone: the file does not
     touch it at all, and exports its factories instead */
  for (const [f, names] of [['js/layer-previews.js', ['layerPreviews']], ['js/history.js', ['maddison', 'histStates', 'histId']], ['js/monitors.js', ['monitors']]]) {
    assert.doesNotMatch(code(rd(f)), /\bIntMapModules\b/, `${f} does not touch the retired window.IntMapModules registry`);
    for (const n of names) assert.match(rd(f), new RegExp(`^export function ${n}\\(`, 'm'), `${f} exports its ${n} factory`);
  }
  // a missing file must announce itself instead of surfacing as "undefined" much later
  assert.ok(html.includes('required module file(s) failed to load'), 'index.html fails loudly if a module file is missing');
});

/* spelling kept: browser script (js/i18n.js, js/gazetteer.js, js/reference-data.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R162 #7 the data survived the move intact (all 5 languages, real row counts)', () => {
  const i18n = rd('js/i18n.js');
  /* (#R221) one file per language now — `rd('js/i18n.js')` returns the whole table (see the reader
     at the top), so the question is still "are all five here", asked of the new shape. */
  for (const lang of ['en', 'jp', 'de', 'ru', 'es']) {
    assert.ok(i18n.includes(`IntMapLang.define('${lang}'`), `${lang} is still carried (standing rule 3: all five languages)`);
  }
  const gz = rd('js/gazetteer.js');
  assert.ok((gz.match(/\['flashpoint',/g) || []).length > 10, 'flashpoint rows survived');
  /* (#R198) the export grew — `warm`/`index`/`world` joined it when the long tail
     (data/gazetteer-world.json) became a third source — so this asks the question it always meant:
     BOTH curated arrays are still the thing this file hands out. Pinning the literal return line
     would only be pinning the day it was written. */
  assert.match(gz, /return \{[^}]*\bbuiltin:_BUILTIN_GZ\b/, 'gazetteer still exports the built-in array');
  assert.match(gz, /return \{[^}]*\bextra:_EXTRA_GZ\b/, 'gazetteer still exports the extra array');
  const ref = rd('js/reference-data.js');
  assert.ok((ref.match(/_dc\(/g) || []).length > 100, 'dashboard cards survived');
  /* (#R246) …plus the ONE resolver for the registry's descriptions, which moved to
     js/locales/pages.<code>.js so that the pages audit measures them. Both tables still leave here. */
  assert.ok(ref.includes('return { dashCards:DEFAULT_DASH_CARDS, dataSources:DATA_SOURCES, useText, ensureDocs };'),
    'reference-data exports both tables');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R162 #8 index.html actually shrank and the CSS really moved', () => {
  const lines = html.split('\n').length;
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(lines > 0);
  const css = rd('css/intmap.css');
  assert.ok(css.length > 200000, 'css/intmap.css holds the real stylesheet');
  // ⚠ (#R210) This used to pin the LITERAL `--sidebar-w:440px`. The claim is "the design
  // tokens live in the extracted stylesheet", not "the sidebar is 440 px wide" — pinning
  // the value made a legitimate width change fail a split-integrity test (#R203's trap).
  assert.match(css, /--sidebar-w:\s*\d+(px|vw)/, 'the design tokens moved with it');
  assert.ok(css.includes('.mon-'), 'monitor styles stayed in CSS (no CSS-in-JS template literal — #R152)');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R162 #9 source-level suites read the whole app, not just index.html', () => {
  // Otherwise moving a line between files silently flips a `gone()` assertion green.
  assert.ok(app.length > html.length, 'appSource() is broader than index.html alone');
  // (#R210) derived from the stylesheet, so the two can never drift apart silently.
  const decl = (rd('css/intmap.css').match(/--sidebar-w:\s*\d+(?:px|vw)/) || [])[0];
  assert.ok(decl, 'css/intmap.css declares --sidebar-w');
  assert.ok(app.includes(decl), 'app source includes the extracted CSS');
  assert.ok(/window\.IntMapI18N\s*=/.test(app), 'app source includes the extracted JS');
  /* (#R221) …and the locale files, which is where the strings themselves went */
  assert.ok(app.includes("IntMapLang.define('jp'"), 'app source includes js/locales/');
});
}

/* ═══════════════════════ #R170 · from r170-checks.test.mjs ═══════════════════════ */
/* (#R170 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (f) => (String(f).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js — so INDEX
   is the concatenation. Pointed at the new index.html these assertions would pass vacuously.
   JS_FILES stays the MODULE list: js/app-body.js is the page's own program, not a module. */
const INDEX = appShell(new URL('../', import.meta.url));
/* (#R178) …and js/geo-engine.js is not a module either — it is the renderer adapter, carved out of
   app-body.js this round. It is part of the page's program (see appShell), so questions asked of
   the MODULES must not be asked of it: it is the one file that is SUPPOSED to name MapLibre. */
/* (#R180) …and js/cesium-engine.js joins js/geo-engine.js on that exemption for the same
   reason: this check asks whether a MODULE gates a layer add on the renderer's own
   isStyleLoaded() instead of on canDraw(). An ADAPTER is where that question is answered, not
   asked — `isStyleLoaded()` on the Cesium view IS the implementation the contract's
   styleReady() delegates to, exactly as `map.isStyleLoaded()` is on the MapLibre side. */
const ADAPTERS = new Set(['geo-engine.js', 'cesium-engine.js']);
const JS_FILES = readdirSync(new URL('../js', import.meta.url)).filter(f => f.endsWith('.js') && f !== 'app-body.js' && !ADAPTERS.has(f));

/* strip /* … *\/ and // comments so "the code says X" is never satisfied by prose about X */

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('#R170 canDraw() is declared in index.html as a hoisted function and exposed to modules', () => {
  const code = INDEX;
  assert.match(code, /function canDraw\(\)\s*\{/, 'canDraw must be a function DECLARATION (hoisted — modules and code above it call it)');
  assert.match(code, /window\.IntMapCanDraw\s*=\s*canDraw/, 'canDraw must be reachable from js/ modules');
  assert.match(code, /get canDraw\(\)\s*\{\s*return canDraw;\s*\}/, 'IM_HOST must expose canDraw so modules can call HOST.canDraw()');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('#R170 canDraw() does not answer from isStyleLoaded alone — it must fall through to the parsed-style test', () => {
  /* (#R178) the two answers moved into the ADAPTER as styleParsed(): app-body's canDraw() is now a
     one-line shim that asks the engine, because the fast path was reading `map.style._loaded` — a
     private field of a MapLibre class, and the last engine-specific thing outside js/geo-engine.js.
     Same predicate, same two-step structure; asserted where it now lives. */
  const fn = stripComments(INDEX.slice(INDEX.indexOf('styleParsed(){')).slice(0, 900));
  assert.match(stripComments(INDEX), /function canDraw\(\)\{[^}]*E\.canDraw\(\)/,
    'the app still has ONE named predicate, and it asks the engine');
  assert.match(fn, /_loaded===true\) return true;[\s\S]*?getStyle\(\);/, 'the fast "already fully loaded" path should still short-circuit');
  assert.ok(/_loaded\s*===\s*true/.test(fn), 'must consult the parsed-style flag (the whole point: true while tiles stream)');
  assert.ok(/getStyle\(\)/.test(fn), 'must keep a PUBLIC-API fallback in case the internal flag ever moves');
});

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R170 no js/ module still gates a layer add on a raw isStyleLoaded()', () => {
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

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R170 every factory that calls _imCanDraw() declares it in that same factory', () => {
  // The migration first inserted the helper only into each file's FIRST factory; files like
  // js/sims.js hold eight, so seven of them referenced a name that resolves to nothing at runtime.
  // scripts/check-split-scope.mjs caught it — this keeps it caught if the helper is ever moved.
  /* (module-graph) a factory is `export function name(…){` now; the old registry spelling matched nothing
     after the migration, which would have left this check passing on zero factories — so it also counts */
  const SIG = /^(?:export function \w+ ?|window\.IntMapModules\.\w+ ?= ?function ?)\([^)]*\) ?\{[^\n]*$/gm;
  const bad = [];
  const unscanned = [];
  for (const f of JS_FILES) {
    const src = R('js/' + f);
    if (!src.includes('_imCanDraw()')) continue;
    const starts = [...src.matchAll(SIG)].map(m => m.index + m[0].length);
    if (!starts.length) unscanned.push(f);
    for (let i = 0; i < starts.length; i++) {
      const seg = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
      if (seg.includes('_imCanDraw()') && !seg.includes('function _imCanDraw()')) bad.push(f + ' factory#' + (i + 1));
    }
  }
  assert.deepEqual(unscanned, [], 'these files use _imCanDraw() but the factory-signature scan found no factory in them');
  assert.deepEqual(bad, [], 'these factories use _imCanDraw() without declaring it');
});

/* spelling kept: browser script (js/data-layers.js, js/geo-engine.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R170 whenStyleReady() resolves on canDraw, not on isStyleLoaded', () => {
  const src = stripComments(R('js/data-layers.js'));
  const i = src.indexOf('function whenStyleReady()');
  assert.ok(i > 0, 'whenStyleReady must still exist');
  const fn = src.slice(i, i + 1200);
  assert.ok(!/map\.isStyleLoaded\(\)/.test(fn), 'whenStyleReady must not gate on isStyleLoaded any more');
  /* (restored-layer-before-style) the wait is the engine's now — GE().whenCanDraw() — so the claim
     «it resolves on canDraw, not on isStyleLoaded» is asked of THAT body: every check it makes is
     the adapter's canDraw(), and none is styleReady()/isStyleLoaded(). */
  assert.match(fn, /function whenStyleReady\(\)\{ return GE\(\)\.whenCanDraw\(\); \}/, 'whenStyleReady is the engine\'s wait');
  const GEsrc = stripComments(R('js/geo-engine.js'));
  const w = GEsrc.slice(GEsrc.indexOf('whenCanDraw(){'), GEsrc.indexOf('whenCanDraw(){') + 1200);
  assert.ok(GEsrc.includes('whenCanDraw(){'), 'the engine\'s wait exists');
  assert.match(w, /a\.canDraw\(\)/, 'it asks canDraw()');
  assert.ok(!/styleReady\(\)|isStyleLoaded\(\)/.test(w), 'and never styleReady()/isStyleLoaded()');
  assert.match(src, /function _canDraw\(\)/, '_canDraw must be a function DECLARATION — withCountries() calls it from further up the file (#R167 TDZ trap)');
});
}

/* ═══════════════════════ #R166 · from r166-checks.test.mjs ═══════════════════════ */
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
{
const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

/* Blank out comments and string/template literals so identifier scanning reads CODE only — the
   module headers document the rewrites in prose ("currentLang -> HOST.lang"), which would otherwise
   register as the very violation the scan is looking for. */
function code(src) { return codeOnly(src, { literals: 'blank' }); }

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
  /* ⚠ (#R469) …and 'slope' with them — 「⛰ 傾斜・斜面方向レイヤーは完全削除。」 The factory is gone
     from js/sims.js, so listing it here would fail this check for a module that no longer exists. */
  'js/sims.js': ['radiation', 'popArea', 'sun', 'transitReach'],
};
const ALL_FACS = Object.values(MOVED).flat();
/* (#R209) …of which these are fetched on demand: the factories whose file the loader import()s. */
const LAZY_FACS = new Set(Object.entries(MOVED).filter(([f]) => LAZY.includes(f)).flatMap(([, v]) => v));

/* (module-graph) the registry is gone. app-body calls a factory by the name it imports it under (`f(IM_HOST)`)
   and the loader on the namespace its import() resolved to (`m.f(IM_HOST)`); both are counted in code only,
   with a word boundary so `fooLos(` is not `los(`. */
const HTML_CODE = code(html);
const FACTORIES = factoryCalls(root);
const callCount = (f) => (HTML_CODE.match(new RegExp(`(?<![\\w$.])(?:m\\.)?${f}\\(IM_HOST\\)`, 'g')) || []).length;
const callAt = (f) => { const m = new RegExp(`(?<![\\w$.])${f}\\(IM_HOST\\)`).exec(HTML_CODE); return m ? m.index : -1; };
const importsByName = (f, file) => new RegExp(`^import \\{[^}]*\\b${f}\\b[^}]*\\} from '\\./${file.slice(3).replace('.', '\\.')}';$`, 'm').test(rd('js/app-body.js'));

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
  'objectList', 'popArea', 'sun', 'transitReach',   /* (#R469) −slope, deleted */
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

/* spelling kept: browser script (js/map-ui.js, js/playground.js, js/map-tools.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R166 #1 all seven files are loaded and every factory they define is instantiated', () => {
  for (const [file, facs] of Object.entries(MOVED)) {
    const src = rd(file);
    /* (module-graph) an eager file is reached because js/app-body.js imports its factories BY NAME (a link
       error if one is missing); «extends the registry without clobbering» is «does not touch it at all» */
    assert.ok(LAZY.includes(file) || facs.every((f) => importsByName(f, file)),
      `js/app-body.js imports every factory of ${file}, or js/lazy-modules.js fetches it on demand (#R175/#R209)`);
    assert.doesNotMatch(code(src), /\bIntMapModules\b/, `${file} does not touch the retired window.IntMapModules registry`);
    // Comment-blanked: every header says "this file adds no <style>" in prose.
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    for (const f of facs) {
      assert.ok(src.includes(`export function ${f}(HOST){`),
        `${file} declares the ${f} factory taking (HOST)`);
      const calls = callCount(f);
      assert.equal(calls, 1, `index.html must call ${f} exactly once (found ${calls})`);
    }
    // The file defines these factories and no others, so the lists above cannot drift silently.
    const defined = FACTORIES[file] || [];
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
    .map((f) => ({ f, at: callAt(f) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.f);
  assert.deepEqual(seen, order, 'factory call order in index.html must match the original block order');
  /* …and each excluded one is still instantiated exactly once — by the loader. #1 counts them. */
  for (const f of lazyFacs) assert.ok(new RegExp(`\\bm\\.${f}\\(IM_HOST\\);`).test(html), `${f} is still instantiated`);
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R166 #3 INVARIANT: every reassigned closure value these blocks read is a LIVE getter', () => {
  // Prove the classification rather than trusting it: each name is assigned somewhere in index.html
  // OUTSIDE its own declaration, so a captured copy would go stale.
  // renderUI is the stated exception: its only reassignment sat in the retired-ACLED block behind an
  // early `return` and never ran; the block was removed as dead code (2026-09-29,
  // dev-notes/2026-09-29-dead-code-removal.md). The getter over a function declaration stays required.
  const NOT_REASSIGNED = new Set(['renderUI']);
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    return html.split('\n').filter((l) => asg.test(l) && !decl.test(l)).length;
  };
  for (const [name, prop] of Object.entries(LIVE)) {
    if (!NOT_REASSIGNED.has(name)) assert.ok(reassignments(name) > 0,
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a getter`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

/* spelling kept: browser script (js/map-ui.js, js/playground.js, js/map-tools.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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

/* spelling kept: browser script (js/map-ui.js, js/playground.js, js/map-tools.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R166 #6 the boot guard names every new factory, so one missing file cannot hide', () => {
  for (const f of ALL_FACS) {
    assert.ok(bootGuardKnows(root, f), `the boot guard lists the ${f} factory`);   /* (#R798) eager list or the lazy registry */
  }
});

/* spelling kept: browser script (js/map-ui.js, js/playground.js, js/map-tools.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R166 #7 index.html actually shrank and no moved block came back inline', () => {
  const lines = html.split('\n').length;
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(lines > 0);
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
}

/* ═══════════════════════ #R408 · from r408-checks.test.mjs ═══════════════════════ */
/* (#R408 — the round's own account of why these checks exist heads its other half, in tests/shell-layer-panel-checks.test.mjs) */
{
const rd = read;

const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);

/* ── ④ THE FACTORY INVENTORY IS DERIVED, NOT TRUSTED ──────────────────────────────────────────
   一覧が「全部そろっている」ことを、一覧を読んで確かめることはできない。だから js/ が実際に
   登録するファクトリを数え、src/main.js の3つの一覧と**両方向で**突き合わせる。
   ⚠ 3つに分かれているのは種類が3つあるからで、種類は「いつ存在するか」で決まる:
     MODULE_FACTORIES  … 起動時に存在する（eager な import 閉包に居る）
     LAZY_FACTORIES    … js/lazy-modules.js に頼めば来る（tests/r209 ③ がその等式を持つ）
     CARRIED_FACTORIES … 誰も単体では取りに行かない。別の遅延モジュールが static import する。 */
/* コメントを外してから読む。⚠ この回の調査用スクリプトは最初これを忘れ、散文の中の
   「#R280's shape」のアポストロフィを引用符と読んで、存在しないファクトリを3件報告した。 */
function stripComments(src) { return codeOnly(src); }

/* eager とは「src/main.js の import の推移閉包に居る」こと。⚠ 直接の import だけを見ると
   `facilities` を取り落とす——js/osm-facilities.js を import しているのは js/layer-packs.js である。
   ⚠ そして行頭に錨を打たないこと。src/main.js には1行に2本並ぶ import が6箇所あり、
   `^import` で数えると `warFronts` が「eager でない」と誤判定される（実際にそう出た）。 */
function eagerClosure() {
  const main = stripComments(rd('src/main.js'));
  const seen = new Set();
  const queue = [...main.matchAll(/import\s+(?:[^'"]*from\s*)?['"]\.\.\/(js\/[^'"]+)['"]/g)].map((m) => m[1]);
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let body = '';
    try { body = stripComments(rd(f)); } catch (_) { continue; }
    for (const m of body.matchAll(/import\s+(?:[^'"]*from\s*)?['"]\.\/([^'"]+)['"]/g)) queue.push('js/' + m[1]);
  }
  return seen;
}

test('R408 ④: js/ が登録する全ファクトリが、3つの一覧のちょうど1つに載っている', () => {
  /* (module-graph) レジストリ（window.IntMapModules）と MODULE_FACTORIES は無くなった。ファクトリは名前で
     export され、起動時のものは js/app-body.js（と js/label-occlusion.js）が名前で import して呼ぶ——欠けて
     いれば link error で、起動ガードの一覧はそれ自体が要らなくなった。残る3分類はそのまま測る:
       起動時（MODULE の後継）… シェルが import して呼ぶもの（factoryCalls − 遅延）と、eager なファイルが
                                 provideLayerKind で engine に渡す GL レイヤー種（solid3d・limbLayer・orbitPoints）
       LAZY    … js/lazy-modules.js が mount するもの（LAZY_NAMES）
       CARRIED … 単体では取りに行かれず、遅延モジュールに static import されて provideLayerKind で渡るもの */
  const main = stripComments(rd('src/main.js'));
  assert.doesNotMatch(main, /\bMODULE_FACTORIES\b/, '手で持つ eager 一覧は残っていない（import が一覧である）');
  const root = new URL('../', import.meta.url);
  const lazyMounted = new Map(lazyModules(root).filter((m) => m.factory).map((m) => [m.name, m.file]));
  /* GL レイヤー種: provideLayerKind('name', fn) を呼ぶファイルが、その種の持ち主 */
  const kinds = new Map();
  for (const f of JS) {
    for (const m of stripComments(rd(f)).matchAll(/provideLayerKind\(\s*'([A-Za-z0-9_$]+)'\s*,\s*([A-Za-z0-9_$]+)\s*\)/g)) {
      kinds.set(m[1], f);
      assert.equal(m[2], m[1], `${f}: 種 ${m[1]} は同じ名前の関数を渡す`);
      assert.doesNotMatch(rd(f), new RegExp(`^export (?:async )?function ${m[1]}\\b`, 'm'), `${f}: 種 ${m[1]} は export しない（engine の _kinds だけが持つ）`);
    }
  }
  assert.ok(kinds.size >= 1, 'provideLayerKind による受け渡しが読めている');
  const eager = eagerClosure();

  const where = new Map();
  const reg = new Map();
  for (const [f, names] of Object.entries(factoryCalls(root))) for (const k of names) {
    reg.set(k, f);
    if (!lazyMounted.has(k)) where.set(k, 'MODULE');
  }
  for (const [k, f] of kinds) { reg.set(k, f); if (eager.has(f)) where.set(k, 'MODULE'); }
  assert.ok(reg.size >= 130, `js/ が登録するファクトリは ${reg.size} 件 — 数えられている`);
  /* (#R798) the two deferred lists are the registry's, imported by the entry — ちょうど1つ、を測る */
  const doubled = [];
  for (const k of LAZY_NAMES) { if (where.has(k)) doubled.push(`${k}: ${where.get(k)} と LAZY`); where.set(k, 'LAZY'); }
  for (const k of CARRIED_NAMES) { if (where.has(k)) doubled.push(`${k}: ${where.get(k)} と CARRIED`); where.set(k, 'CARRIED'); }
  assert.deepEqual(doubled, [], '2つの一覧に載っているファクトリ');

  const unlisted = [...reg.keys()].filter((k) => !where.has(k)).sort();
  assert.deepEqual(unlisted, [],
    'どの一覧にも無いファクトリは、改名しても起動ガードが黙る（#R280 の形）');

  /* ghosts: LAZY は loader が実際に mount し、CARRIED は実際に provideLayerKind で渡されている */
  const ghosts = [...where.keys()].filter((k) => !reg.has(k)
    || (where.get(k) === 'LAZY' && !lazyMounted.has(k))
    || (where.get(k) === 'CARRIED' && !kinds.has(k))).sort();
  assert.deepEqual(ghosts, [],
    '一覧が、もう誰も登録していない名前を持っている');

  /* ⚠ そして「どの一覧か」も検査する。起動時に存在しないものを MODULE_FACTORIES に置くと
     `missingFactories` が毎回の清潔な起動で非空になり（#R209）、逆に起動時に存在するものを
     LAZY / CARRIED に置くと、消えても誰も報告しない。 */
  const misplaced = [];
  for (const [k, f] of reg) {
    const w = where.get(k);
    if (w === 'MODULE' && !eager.has(f)) misplaced.push(`${k} は MODULE_FACTORIES だが ${f} は eager でない`);
    if (w !== 'MODULE' && eager.has(f)) misplaced.push(`${k} は ${w} だが ${f} は eager である`);
  }
  assert.deepEqual(misplaced, []);
});
}

/* ═══════════════════════ #R196 · from r196-checks.test.mjs ═══════════════════════ */
/* (#R196 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
const rd = read;

/* ── ① THE SPLITS ARE MOVES, NOT REWRITES ──────────────────────────────────────────────────────
   #R194's lesson: a "pure transport" is a claim until a machine compares the bytes. Both blocks
   below were lifted whole, so every line of the moved body must still exist verbatim in its new
   file — and must NOT still exist in the shell (a leftover inline copy of a moved function
   declaration WINS over the module, which is the failure mode #R168 #8 was written for). */
/* spelling kept: browser script (js/geodesy.js, js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ①a js/geodesy.js carries the antimeridian block verbatim, and the shell does not', () => {
  const g = rd('js/geodesy.js');
  const shell = rd('js/app-body.js');
  const needles = [
    'const _R_EARTH_KM=6371.0088, _HALF_CIRCUM=Math.PI*_R_EARTH_KM;',
    'function _clipHalf(poly,x,keepGE){',
    'function _splitPolyToWindows(poly){',
    'function _splitLineToWindows(line){',
    'function diskFillPolys(center,radiusKm,steps){',
    'function diskOutlineLines(center,radiusKm,steps){',
    'function sanitizeFeatures(feats){',
  ];
  for (const n of needles) {
    assert.ok(g.includes(n), `js/geodesy.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* …and the shell re-binds them under their ORIGINAL names, because IM_HOST publishes them and
     four other modules read them through it */
  /* ⚠ AS HOISTED FUNCTION DECLARATIONS. Five of the six are bound AT FACTORY TIME through IM_HOST by
     js/tool-panel.js, js/seismic.js, js/dash-extended.js and js/atlas-console.js, and a factory can
     run before a `const` further down the closure exists — #R167's dead-zone rule, which caught the
     first version of this split. */
  for (const n of ['_gcRingUnwrapped', '_splitPolyToWindows', '_splitLineToWindows', 'diskFillPolys', 'diskOutlineLines', 'sanitizeFeatures']) {
    assert.match(shell, new RegExp(`\\n  function ${n}\\(\\)\\{ return window\\.IntMapGeodesy\\.${n}\\.apply\\(null,arguments\\); \\}`),
      `${n} must be a hoisted function declaration delegating to window.IntMapGeodesy`);
  }
});

/* spelling kept: browser script (js/tile-warm.js, js/app-body.js, js/label-occlusion.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ①b js/tile-warm.js carries the prefetch block, and takes its five values through IM_HOST', () => {
  const w = rd('js/tile-warm.js');
  const shell = rd('js/app-body.js');
  for (const n of ['function registerTileSW(){', 'function predictivePrefetch(aggressive){', "postMessage({type:'prefetch',urls:uniq})"]) {
    assert.ok(w.includes(n), `js/tile-warm.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* ⚠ the free references are the whole risk of a split (#R194) — they arrive through the host */
  assert.match(w, /HOST\.mapType!=='sat'/, 'the basemap is read from IM_HOST, not closed over');
  assert.match(w, /HOST\.satState\.providerId/, 'the provider is read from IM_HOST');
  assert.match(shell, /get satBuildTiles\(\)\{ return satBuildTiles; \}/, 'IM_HOST must publish satBuildTiles');
  /* (#R200) …from js/label-occlusion.js now: the mount sat inside the label/occlusion block, which
     left js/app-body.js this round. The call did not move relative to the code around it — the file
     did — so this asks the file that holds it. */
  /* (module-graph) the registry is gone: the block calls the factory by the name it imports, and that named
     import (in a file js/app-body.js imports) is what puts js/tile-warm.js in the module graph — src/main.js
     stopped listing it (no top-level side effect). A missing file or export is a link error, which is the
     guard MODULE_FACTORIES used to be. */
  const occ = rd('js/label-occlusion.js');
  assert.equal((occ.match(/(?<![\w$.])tileWarm\(HOST\)/g) || []).length, 1, 'the block that always mounted it still does');
  assert.match(occ, /^import \{ tileWarm \} from '\.\/tile-warm\.js';$/m, 'the entry imports it');
  assert.match(rd('js/app-body.js'), /^import \{ makeLabelOcclusion \} from '\.\/label-occlusion\.js';$/m, '…through the file js/app-body.js imports');
  assert.match(w, /^export function tileWarm\(HOST\)\{/m, '…which exports the factory by that name');
  assert.ok(rd('src/main.js').includes("import '../js/geodesy.js';"), 'the entry imports js/geodesy.js');
  assert.ok(bootGuardKnows(new URL('../', import.meta.url), 'tileWarm'), 'the factory guard knows about tileWarm');
});
}
