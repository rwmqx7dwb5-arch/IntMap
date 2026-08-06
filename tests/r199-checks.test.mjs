/* ============================================================================
 *  IntMap · #R199 — the Atlas kernel's six subsystems, and the two halves of a hand-off
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです … 一つの変更が予想外の場所へ影響する可能性はまだ高い」
 *
 *  js/atlas-console.js shed 1,371 lines into six real ES modules. What makes that safe is not that
 *  the code moved — it is that BOTH SIDES of each hand-off are derived from the files themselves and
 *  compared here, rather than written down twice and hoped to agree:
 *
 *    · what a module RETURNS  ==  what js/atlas-console.js destructures from its call
 *    · what a module READS off CTX  ==  what the call site puts in CTX
 *
 *  Either list drifting is the #R162 failure mode exactly — a name that silently reads as `undefined`
 *  inside a try/catch and takes a whole branch with it. A test that copied the names could not see it;
 *  one that re-derives them from the two files cannot miss it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const KERNEL = read('js/atlas-console.js');

/* The seven files, the one name each exports, and the file that instantiates it. Nothing else is
   written down here: every list below is READ OUT of the sources. */
const MODULES = [
  ['js/atlas-reply.js', 'makeAtlasReply', 'js/atlas-console.js'],
  ['js/atlas-geo-resolve.js', 'makeAtlasGeoResolve', 'js/atlas-console.js'],
  ['js/atlas-controls.js', 'makeAtlasControls', 'js/atlas-console.js'],
  ['js/atlas-sources.js', 'makeAtlasSources', 'js/atlas-console.js'],
  ['js/atlas-sims.js', 'makeAtlasSims', 'js/atlas-console.js'],
  ['js/atlas-verify.js', 'makeAtlasVerify', 'js/atlas-console.js'],
  ['js/theme-sky.js', 'makeThemeSky', 'js/app-body.js'],
];

/* ── read a module: its factory's CTX rebinds, its returned names, every CTX.x it touches ── */
function readModule(rel, fnName) {
  const src = read(rel);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const ex = ast.body.filter((n) => n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.id);
  assert.equal(ex.length, 1, `${rel} exports exactly one factory`);
  const fn = ex[0].declaration;
  assert.equal(fn.id.name, fnName, `${rel} exports ${fnName}`);
  assert.deepEqual(fn.params.map((p) => p.name), ['HOST', 'CTX'], `${rel}: the factory takes (HOST, CTX)`);

  const body = fn.body.body;
  /* first statement: const a=CTX.a, b=CTX.b, … — the rebinds, under the ORIGINAL names */
  const first = body[0];
  assert.equal(first.type, 'VariableDeclaration', `${rel}: the factory opens with the CTX rebinds`);
  const rebinds = first.declarations.map((d) => {
    assert.equal(d.init.type, 'MemberExpression', `${rel}: every rebind reads CTX`);
    assert.equal(d.init.object.name, 'CTX');
    assert.equal(d.id.name, d.init.property.name, `${rel}: ${d.id.name} must keep its original name (the body is verbatim)`);
    return d.id.name;
  });

  /* last statement: return { … } — the names the kernel gets back */
  const last = body[body.length - 1];
  assert.equal(last.type, 'ReturnStatement', `${rel}: the factory ends by returning its surface`);
  const returned = last.argument.properties.map((p) => p.key.name);

  /* every CTX.x anywhere in the file — a typo here is an undefined that no gate would catch */
  const touched = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'CTX' && !n.computed) touched.add(n.property.name);
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(fn);

  return { src, rebinds, returned, touched };
}

/* ── read the call site: const { … } = makeX(HOST, { … }); ── */
function readCallSite(fnName, site) {
  const ast = acorn.parse(read(site), { ecmaVersion: 'latest', sourceType: 'module' });
  let hit = null, calls = 0;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'VariableDeclarator' && n.init && n.init.type === 'CallExpression' &&
        n.init.callee.type === 'Identifier' && n.init.callee.name === fnName) {
      calls++;
      assert.equal(n.id.type, 'ObjectPattern', `${fnName}: the kernel destructures the factory's surface`);
      assert.equal(n.init.arguments.length, 2, `${fnName}(HOST, CTX)`);
      assert.match(n.init.arguments[0].name, /^(HOST|IM_HOST)$/, `${fnName}: the first argument is the live host`);
      assert.equal(n.init.arguments[1].type, 'ObjectExpression');
      hit = {
        taken: n.id.properties.map((p) => {
          assert.equal(p.key.name, p.value.name, `${fnName}: ${p.key.name} is destructured under its original name`);
          return p.key.name;
        }),
        given: n.init.arguments[1].properties.map((p) => p.key.name),
        shorthand: n.init.arguments[1].properties.filter((p) => p.shorthand).map((p) => p.key.name),
      };
    }
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k]); }
  })(ast);
  assert.equal(calls, 1, `${fnName} is instantiated exactly once`);
  return hit;
}

test('R199 ①: the seven subsystems are real ES modules — no window.IntMapModules, no load order', () => {
  for (const [rel, , site] of MODULES) {
    const src = read(rel);
    assert.doesNotMatch(src, /window\.IntMapModules(\.\w+|\[[^\]]+\])?\s*=(?!=)/, `${rel} must NOT register itself on the module registry — that is the dependency the user asked us to stop having`);
    assert.match(read(site), new RegExp(`^import \\{ \\w+ \\} from '\\./${rel.split('/')[1].replace('.', '\\.')}';$`, 'm'),
      `${site} names ${rel} in a static import, so the bundler — not src/main.js's list — orders it`);
    assert.doesNotMatch(read('src/main.js'), new RegExp(rel.replace('.', '\\.')),
      `${rel} must NOT be in the entry's ordered list either — the import graph is what orders it now`);
  }
  /* and the kernel is still the ONE thing on the registry, so nothing about how the app boots changed */
  assert.match(KERNEL, /^window\.IntMapModules\.atlasConsole=function\(HOST\)\{$/m, 'the kernel itself is still a registered factory');
});

test('R199 ②: what each module returns is exactly what its host takes — derived from both files', () => {
  for (const [rel, fn, site] of MODULES) {
    const m = readModule(rel, fn);
    const c = readCallSite(fn, site);
    assert.deepEqual([...m.returned].sort(), [...c.taken].sort(),
      `${rel}: the factory's return and the kernel's destructuring must be the SAME set (a name in one and not the other is a silent undefined)`);
    /* every CTX.x the module reads — the rebinds AND the handful read directly — must be exactly what
       the kernel passes. Not a subset in either direction: an extra key is dead weight that will rot,
       a missing one is `undefined` inside a try/catch. */
    assert.deepEqual([...m.touched].sort(), [...c.given].sort(),
      `${rel}: the CTX the module reads and the CTX the kernel passes must be the SAME set`);
    assert.ok(m.rebinds.every((k) => m.touched.has(k)), `${rel}: every rebind reads CTX`);
    assert.ok(m.returned.length > 0 && m.rebinds.length > 0, `${rel} has a real surface`);
  }
});

test('R199 ③: the moved bodies are verbatim — every rebind keeps its original name, one exception, declared', () => {
  /* The transport was proved byte-for-byte against the pre-move file when it was made: 1,370 of the
     1,371 moved lines, 172,275 of 172,440 bytes, plus 5,209 of 5,209 kept lines on the kernel side.
     What can still be checked from HEAD alone is the PROPERTY that made it possible — every value the
     block used to read from the console's closure is rebound under the same identifier — and the single
     line where that was not possible, which must stay visible rather than blend in. */
  const geo = read('js/atlas-geo-resolve.js');
  assert.match(geo, /const _lastPlace=CTX\.lastPlace\(\); if\(_lastPlace\) return \{lng:_lastPlace\.lng/,
    'geocode()\'s deixis fallback reads _lastPlace through a live thunk');
  assert.match(KERNEL, /^\s*let _hist=\[\]; let _lastPlace=null;/m,
    '…because the kernel still OWNS _lastPlace: it is a let the kernel reassigns in five other places, so a value captured at factory time would be stale');
  assert.match(KERNEL, /lastPlace: \(\) => _lastPlace/, 'and the thunk is what the kernel hands over');
  /* no other module reaches for a moving value through CTX: every other CTX member is passed by
     shorthand, i.e. it IS the host's own binding rather than something computed at hand-off */
  for (const [rel, fn, site] of MODULES) {
    if (rel === 'js/atlas-geo-resolve.js') continue;
    const c = readCallSite(fn, site);
    assert.deepEqual(c.given.filter((k) => !c.shorthand.includes(k)), [],
      `${rel}: every CTX member is passed by shorthand — i.e. it is the host's own binding, not a computed value`);
  }
  /* …and js/theme-sky.js, which came out of js/app-body.js rather than the Atlas kernel, reads the six
     values app-body REASSIGNS through IM_HOST's live accessors — #R165's rule, not an exception to it.
     userTheme is the one it also WRITES, which is why IM_HOST gives it a setter as well as a getter. */
  const sky = read('js/theme-sky.js');
  for (const k of ['userTheme', 'mapType', 'namesOn', 'bordersOn', 'satActive', 'satPanelDismissed']) {
    assert.match(sky, new RegExp(`HOST\\.${k}\\b`), `js/theme-sky.js reads ${k} live, off the host`);
  }
  assert.match(sky, /HOST\.userTheme='auto'/, 'and writes userTheme back through the same accessor');
  const body = read('js/app-body.js');
  for (const k of ['userTheme', 'namesOn', 'bordersOn', 'satActive', 'satPanelDismissed']) {
    assert.match(body, new RegExp(`get ${k}\\(\\)\\{ return ${k}; \\}`), `IM_HOST still owns ${k}`);
  }
  assert.match(body, /set userTheme\(v\)\{ userTheme=v; \}/, 'and the one the sky writes has a setter');
});

test('R199 ④: no module inherited a closure variable, and none shadows HOST', () => {
  const problems = checkSplitScope().filter((p) => /atlas-(reply|geo-resolve|controls|sources|sims|verify)\.js/.test(p.file));
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R199 ⑤: the two files 「中心部がまだ巨大」 named have ceilings, and they follow the floor DOWN', () => {
  /* #R195's rule, applied to the other half of the complaint: a ceiling raised once and never lowered
     stops asserting anything. Both numbers below were set from the measured floor at the end of this
     round, with deliberately tight headroom, and both must come DOWN when the next slice leaves.
       js/atlas-console.js  6,580 → 5,237   budget 5,300
       js/app-body.js       5,375 → 5,149   budget 5,200
     app-body kept the smaller share on purpose: it is ~800 members long and its largest single unit is
     IM_HOST itself (232 lines), which cannot leave the thing it is the locator FOR. Its themes have to
     be cut the way #R168 cut index.html's, one coherent subject at a time; theme+sky was the first. */
  const n = (p) => read(p).split('\n').length;
  const atlas = n('js/atlas-console.js');
  const body = n('js/app-body.js');
  assert.ok(atlas < 5_300, `js/atlas-console.js is ${atlas} lines; it was 6,580 before #R199 and must not grow back`);
  assert.ok(body < 5_200, `js/app-body.js is ${body} lines; it was 5,375 before #R199 and must not grow back`);
  /* the seven modules together account for what left, so "smaller" cannot mean "deleted" */
  const moved = MODULES.reduce((a, [rel]) => a + n(rel), 0);
  assert.ok(moved > 1_500, `the seven modules hold ${moved} lines — the core shrank by moving, not by losing`);
});

test('R199 ⑥: the build stamps have MOVED ON from this round', () => {
  /* #R198 shipped with both stamps still reading R196, because #R196's own checks pinned R196 and
     therefore stopped asking anything the moment that round ended. The pin belongs in the CURRENT
     round's file — tests/r200-checks.test.mjs now — and this, the previous round's copy, becomes the
     negative form: a stamp still reading R199 means a round shipped without bumping it. */
  const idx = read('index.html');
  assert.doesNotMatch(idx, /window\.__imBuild='R199';/);
  assert.doesNotMatch(idx, /window\.INTMAP_BUILD='2026-08-07-R199';/);
});
