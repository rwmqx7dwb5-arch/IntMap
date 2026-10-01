// Renderer decoupling — no module outside the engine adapter holds, receives or touches the renderer.
//
// Gathered from tests/r171-checks, r172-checks, r173-checks (phases 5–6 of the migration: the modules
// cleared each round, and the count of renderer-independent modules as a one-way floor), r180-checks ①
// (the decoupling FINISHED — 324 value references to one) and r181-checks ⑦ (the same ratchet, re-stated
// as one of #R181's standing properties; folded into R180 ① below because it asserted the same three
// numbers). Titles keep the round that wrote them.
//
// Everything here is answered with a PARSER, never a regex over prose: `map.` appears in comments that
// DISCUSS `map.setPadding(...)`, and `[].map.call` is not the renderer (#R171). The coupling scanner is
// scripts/engine-coupling.mjs — the same one `npm run check:engine` runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { scanAll, scanFile, VALUE_BUDGET, IMAP_GLOBAL_FILES, ENGINE_FILE } from '../scripts/engine-coupling.mjs';
import { factoryCalls } from './app-source.mjs';

const ROOT = new URL('../', import.meta.url);
const R = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* (#R178) js/geo-engine.js is not a module — it is the renderer adapter, the one file that is SUPPOSED
   to name MapLibre — and js/app-body.js is the page's own program, so questions asked of the MODULES
   are not asked of either. */
const JS_FILES = readdirSync(new URL('js', ROOT)).filter((f) => f.endsWith('.js') && f !== 'app-body.js' && f !== 'geo-engine.js');

/* Real `map.<x>` member reads, via the parser. Computed access (`map[key]`) is excluded — the renderer
   is only ever reached as `map.method(...)`, and a `map[k]` is a lookup table.
   (#R184) PARSE IT THE WAY IT RUNS: every js/ file executes as an ES module, and js/satellites-live.js
   imports satellite.js, so script mode throws on it. Script first (the stricter reading for the files
   that really are plain scripts), module as the fallback. */
function rawMapUses(file) {
  const src = R('js/' + file);
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (_) {
    try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' }); }
    catch (e) { assert.fail(`${file} does not parse: ${e.message}`); }
  }
  const hits = [];
  walk.simple(ast, {
    MemberExpression(n) {
      if (!n.computed && n.object && n.object.type === 'Identifier' && n.object.name === 'map') hits.push((n.property && n.property.name) || '?');
    },
  });
  return hits;
}

/* ══ #R180 ① THE DECOUPLING IS FINISHED ═══════════════════════════════════════════════════════ */

/* (#R181 ⑦ "the decoupling ratchet is still at one" asserted the same budget, the same ≤1 values and
   the same zero member accesses; it is folded in here.) */
test('R180 ①: the renderer is held or tested as a value in exactly ONE place', () => {
  const outside = scanAll().filter((r) => basename(r.file) !== ENGINE_FILE);
  const values = outside.flatMap((r) => (r.values || []).map((v) => ({ f: r.file, ...v })));
  assert.equal(VALUE_BUDGET, 1, 'the ratchet is at one — #R179 left it at 324');
  assert.ok(values.length <= 1, `expected at most one, got ${values.length}: ` +
    values.map((v) => `${v.file || v.f}:${v.line}`).join(', '));
  if (values.length === 1) {
    assert.equal(basename(values[0].f), 'app-body.js',
      'the one remaining reference is the primary view being handed to the engine');
  }
  assert.equal(outside.reduce((n, r) => n + r.hits.length, 0), 0, 'member access stays at zero');
});

/* ⚠ READ, NOT RUN: a factory's parameter list is a property of its declaration; the factories run only
   inside the booted app shell. */
test('R180 ①: no module receives the renderer as a parameter any more', () => {
  /* (module-graph) a factory is an EXPORTED function now (`export function foo(HOST)`, or a function
     bound by `export const` / named in `export { … }`), not a `window.IntMapModules.foo=function(…)`
     assignment — the old regex matched nothing and passed blind. The exports are read off the parsed
     module, and the registry spelling is still refused should it ever come back. */
  const offenders = [];
  const seen = new Map();   /* 'js/<file>' → Set of exported function names this scan inspected */
  for (const f of readdirSync(new URL('js', ROOT)).filter((x) => x.endsWith('.js'))) {
    const src = R('js/' + f);
    for (const m of src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)) {
      const first = m[2].split(',')[0].trim();
      if (first === 'map') offenders.push(`${f}:${m[1]}`);
    }
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const fns = new Map();   /* top-level name → function node */
    const isFn = (n) => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');
    const exported = [];
    for (const st of ast.body) {
      const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (d && d.type === 'FunctionDeclaration' && d.id) fns.set(d.id.name, d);
      if (d && d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id.type === 'Identifier' && isFn(v.init)) fns.set(v.id.name, v.init);
      if (st.type !== 'ExportNamedDeclaration') continue;
      if (st.declaration && st.declaration.type === 'FunctionDeclaration') exported.push([st.declaration.id.name, st.declaration.id.name]);
      if (st.declaration && st.declaration.type === 'VariableDeclaration') for (const v of st.declaration.declarations) {
        if (v.id.type === 'Identifier') exported.push([v.id.name, v.id.name]);
        /* `export const { a, b } = (() => { function a(…){…} … return { a, b }; })()` — the functions are
           declared inside the closure; find them there by name */
        if (v.id.type === 'ObjectPattern') for (const p of v.id.properties) {
          if (p.type !== 'Property' || p.value.type !== 'Identifier') continue;
          const local = p.value.name;
          walk.full(v.init, (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === local && !fns.has('\0' + local)) fns.set('\0' + local, n); });
          exported.push([local, '\0' + local]);
        }
      }
      if (!st.source) for (const sp of st.specifiers || []) exported.push([sp.exported.name, sp.local.name]);
    }
    for (const [name, local] of exported) {
      const fn = fns.get(local);
      if (!fn) continue;
      (seen.get('js/' + f) || seen.set('js/' + f, new Set()).get('js/' + f)).add(name);
      const first = fn.params[0];
      if (first && first.type === 'Identifier' && first.name === 'map') offenders.push(`${f}:${name}`);
    }
  }
  /* the scan is not blind: every factory the shell calls by name was one of the functions it inspected */
  const unseen = [];
  for (const [file, names] of Object.entries(factoryCalls(ROOT))) {
    for (const n of names) if (!(seen.get(file) || new Set()).has(n)) unseen.push(`${file}:${n}`);
  }
  assert.deepEqual(unseen, [], 'factories the app calls that this scan did not inspect');
  assert.deepEqual(offenders, [], 'the module contract was the largest block of #R179\'s 112 held ' +
    'references: every factory was handed the raw renderer whether it wanted one or not');
});

test('R180 ①: window.__imap is gated to the adapter and the line that publishes it', () => {
  const stray = scanAll().filter((r) => (r.imaps || []).length && !IMAP_GLOBAL_FILES.has(basename(r.file)));
  assert.deepEqual(stray.map((r) => r.file), [],
    'reading the global into a local is the same coupling under a name no scan can predict — ' +
    '#R180 found three subsystems doing exactly that');
});

test('R180 ①: the gate finds the renderer even when its binding moves deeper', () => {
  /* #R180 broke this by accident: wrapping app-body's DOMContentLoaded body in the boot barrier
     the second engine needs put `let map` one function deeper, and the hard-coded "depth ≤ 1"
     rule stopped seeing the whole file — reporting 0 for the wrong reason. The rule finds the
     declaration now, so prove it does at BOTH depths, and that an unrelated local still is not
     mistaken for the renderer. */
  const dir = mkdtempSync(join(tmpdir(), 'imdepth-'));
  try {
    const shallow = join(dir, 'a.js');
    writeFileSync(shallow, `window.addEventListener('x',()=>{ let map; map=E.ui.createView({}); window.__imap=map; map.flyTo(1); });\n`);
    assert.ok(scanFile(shallow).hits.length >= 1, 'a renderer bound at depth 1 is seen');

    const deep = join(dir, 'b.js');
    writeFileSync(deep, `window.addEventListener('x',()=>{ const boot=()=>{ let map; map=E.ui.createView({}); window.__imap=map; map.flyTo(1); }; boot(); });\n`);
    assert.ok(scanFile(deep).hits.length >= 1, '…and so is one bound a level deeper — the boot barrier');

    const local = join(dir, 'c.js');
    writeFileSync(local, `window.IntMapModules.x=function(HOST){ function f(){ const map={}; map.k=1; return map; } return f; };\n`);
    assert.equal(scanFile(local).hits.length, 0, 'and somebody\'s plain object called `map` is not the renderer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ══ THE MODULES CLEARED ROUND BY ROUND (#R171 phase 5, #R172 phase 6, #R173) ═════════════════ */

test('#R171 the new view-controls module never touches the renderer', () => {
  assert.deepEqual(rawMapUses('view-controls.js'), [], 'js/view-controls.js must be written against IntMapGeoEngine alone');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'js/volume3d.js stays engine-only (#R170)');
});

test('#R171 the ten modules cleared this round stay clear of the renderer', () => {
  const cleared = ['ai-core.js', 'community.js', 'companies-ui.js', 'news-feed.js', 'news-timeline.js',
    'feedback.js', 'onboarding.js', 'elevation-profile.js', 'search-geocode.js', 'workspace.js'];
  const dirty = cleared.filter((f) => rawMapUses(f).length).map((f) => f + ' → ' + rawMapUses(f).join(','));
  assert.deepEqual(dirty, [], 'these modules were migrated to IntMapGeoEngine — a raw map call here is a regression');
});

test('#R172 the five modules migrated this round never touch the renderer again', () => {
  const cleared = ['widgets.js', 'mobile-ui.js', 'community-board.js', 'stats-compare.js', 'countries-ui.js'];
  const dirty = cleared.filter((f) => rawMapUses(f).length).map((f) => f + ' → ' + rawMapUses(f).join(','));
  assert.deepEqual(dirty, [], 'these were migrated to IntMapGeoEngine — a raw map call here is a regression');
});

/* (#R171 asserted the same floor at 26 — "the 14 that never touched the renderer, volume3d (#R170), the
   new view-controls, and the ten cleared here"; #R172 raised it to 31. One test, the higher floor.) */
test('#R172 the count of renderer-independent modules only goes up', () => {
  const clean = JS_FILES.filter((f) => rawMapUses(f).length === 0);
  // 26 after #R171, 31 after #R172 (widgets, mobile-ui, community-board, stats-compare, countries-ui).
  assert.ok(clean.length >= 31, `only ${clean.length} of ${JS_FILES.length} modules are renderer-independent — this must not go backwards`);
});

test('#R173 two more modules stopped touching the renderer', () => {
  assert.deepEqual(rawMapUses('street-view.js'), [], 'street-view is engine-only');
  assert.deepEqual(rawMapUses('monitors.js'), [], 'monitors is engine-only');
});
