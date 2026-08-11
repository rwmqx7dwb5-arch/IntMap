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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
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
     through IM_HOST's accessor pair and is named as an owner in tests/r165-checks.test.mjs, which is
     the audit for written members. Every other module was chosen so nothing but reads crosses the cut. */
  for (const [rel] of MODULES) {
    if (rel === 'js/keyboard-shortcuts.js') {
      assert.match(read(rel), /HOST\.userTheme=nx/, 'the theme shortcut writes through the accessor pair');
      assert.match(read('tests/r165-checks.test.mjs'), /'theme-sky\.js', 'keyboard-shortcuts\.js'\]/,
        '…and the RW contract names it as an owner');
      continue;
    }
    assert.doesNotMatch(read(rel), /HOST\.\w+\s*=(?!=)/, `${rel} must not write host state`);
  }
});

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
  const mount = CORE.indexOf('window.IntMapModules.layerSidebar(IM_HOST);');
  const fill = CORE.indexOf('_IM_LFAVS = makeLayerFavs(');
  assert.ok(mount > 0 && fill > 0 && mount < fill,
    '…and it is mounted BEFORE the favourites block, which is the ordering that makes the shim necessary');
});

test('R200 ④: no module inherited a closure variable', () => {
  const mine = /(session-tabs|layer-dropdown|layer-favs|premium-plan|screenshot|time-countries)\.js/;
  const problems = checkSplitScope().filter((p) => mine.test(p.file));
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R200 ⑤: the core keeps shrinking, and the ceiling follows the floor DOWN', () => {
  /* #R195's rule. Set from the measured floor at the end of this round with tight headroom, and it
     must come down again when the next subject leaves.
       js/app-body.js      5,375 (#R198) → 5,149 (#R199) → 4,360 (#R200)   budget 4,400
       js/atlas-console.js 6,580 (#R198) → 5,237 (#R199) → untouched here  budget 5,300 */
  const n = (p) => read(p).split('\n').length;
  const body = n('js/app-body.js');
  assert.ok(body < 4_400, `js/app-body.js is ${body} lines; it was 5,149 before #R200 and must not grow back`);
  assert.ok(n('js/atlas-console.js') < 5_300, 'js/atlas-console.js keeps #R199\'s ceiling');
  const moved = MODULES.reduce((a, [rel]) => a + n(rel), 0);
  assert.ok(moved > 900, `the ten modules hold ${moved} lines — the core shrank by moving, not by losing`);
});

test('R200 ⑥: the sky subscribes to the master clock at a moment when the clock EXISTS', () => {
  const sky = read('js/theme-sky.js');
  /* the defect: a factory-body statement guarded on something built ~2,200 lines later. What must be
     true now is (a) the subscription is inside a function, (b) something calls that function from a
     path that runs after boot, (c) it attaches once. */
  assert.doesNotMatch(sky, /^\s*try\{ if\(window\.IntMapTime&&window\.IntMapTime\.on\) window\.IntMapTime\.on\(/m,
    'the subscription must not be a statement in the factory body — that runs before window.IntMapTime exists');
  assert.match(sky, /function _followClock\(\)\{/, 'it is a function…');
  assert.match(sky, /if\(_followClock\._on\) return false;/, '…that attaches at most once…');
  assert.match(sky, /function _applySkyAtmosphere\(sat\)\{[\s\S]{0,200}?_followClock\(\);/,
    '…and the sky applying itself is what calls it (first runs inside map-load, after the clock is built)');
  /* the same shape in js/night-side.js was already correct — its wire() is called from apply(), which
     app-body calls from map-load — and this is what says so, so a future move cannot break it quietly. */
  const ns = read('js/night-side.js');
  assert.match(ns, /function wire\(\)\{[\s\S]{0,900}?window\.IntMapTime&&window\.IntMapTime\.on/,
    'the night side subscribes from wire(), not from module scope');
  assert.match(CORE, /window\.IntMapNightSide&&window\.IntMapNightSide\.apply\(\)/, 'and app-body calls apply() from map-load');
});

test('R200 ⑥b: every window.IntMapTime.<method> a module calls is one the clock really has', () => {
  /* ⚠ THE SECOND HALF OF THE SAME BUG, and the one no amount of re-reading js/theme-sky.js would have
     shown: four files asked for `IntMapTime.now()`. There is no such method — the master clock's
     surface is get/when/iso/year/isLive/min/state/on/set/setYear/setDaysAgo/setNow, and `now` is a
     PRIVATE `const now=()=>new Date()` inside that IIFE. Written as `if(T&&T.now){…}` the mistake is
     invisible: the guard is simply false forever and every one of them silently used the wall clock,
     so the sky, the terminator, the city lights, the star field and Cesium's own solar lighting all
     ignored the time machine. The surface below is READ OUT of js/app-body.js, not written down. */
  const iife = /window\.IntMapTime=\(function\(\)\{[\s\S]*?\n  \}\)\(\);/.exec(CORE);
  assert.ok(iife, 'the master clock is still built in js/app-body.js');
  const api = new Set([...iife[0].matchAll(/\bOS\.(\w+)\s*=/g)].map((m) => m[1]));
  assert.ok(api.has('when') && api.has('on') && api.has('isLive'), `the clock exposes ${[...api].join('/')}`);
  const dir = join(ROOT, 'js');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:window\.IntMapTime|\bT)\.(\w+)\s*[({]/g)) {
      /* `T` is the local alias every one of these sites uses for window.IntMapTime */
      if (!/const T=window\.IntMapTime/.test(src) && !/window\.IntMapTime\./.test(src)) continue;
      if (!api.has(m[1]) && /^(now|when|get|iso|year|isLive|state|set|setYear|setDaysAgo|setNow|on|min)$/.test(m[1]))
        assert.fail(`js/${f} calls IntMapTime.${m[1]}(), which the clock does not expose`);
    }
    assert.doesNotMatch(src, /IntMapTime[\s\S]{0,40}?\bT\.now\b/, `js/${f} must not ask for IntMapTime.now — it does not exist`);
  }
});

/* ── ⑦ the night side's darkness → REPLACED by tests/r201-checks.test.mjs ①a–①d ─────────────────
   This test owned the five-ring arithmetic: NIGHT_PROFILE as the composite the eye gets, RING_ALPHA
   derived from it by inverting 1 − Π(1 − aᵢ), and the `match` on `['get','elev']` that chose per ring.
   #R201 deleted all of it — 「夜と昼の部分の変遷が階段状で不自然」 is a statement about FIVE FILLS, and
   no choice of five alphas is not five steps. The alpha is computed per pixel now, so there is no
   profile to invert and no ring to invert it for. What survived — the zoom expression is outermost,
   the last stop is a literal 0, anything data-driven rides on the stop OUTPUT — is asserted in
   r201-checks ①c against the mechanism that exists. Deleted rather than duplicated. */

test('R200 ⑧: the build stamps have moved on from this round', () => {
  /* (#R201) the negative form, the way #R199's became one: the exact pin belongs to the CURRENT
     round's file (tests/r201-checks ⑥), and a stamp still naming R200 means a round shipped
     without bumping it — which is the failure #R174 recorded. */
  const idx = read('index.html');
  assert.doesNotMatch(idx, /window\.__imBuild='R200';/);
  assert.doesNotMatch(idx, /window\.INTMAP_BUILD='[0-9-]+-R200';/);
});
