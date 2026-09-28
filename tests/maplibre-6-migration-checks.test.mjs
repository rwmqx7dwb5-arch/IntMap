/* ============================================================================
 *  maplibre-6-migration — what js/geo-engine.js and src/vendor.js need from MapLibre 6, asked of the
 *  INSTALLED library (the browser half, which needs a renderer, is tests/maplibre-6-migration.spec.js)
 * ----------------------------------------------------------------------------
 *  5.24 → 6 removed or moved things without an error: `map.isEasing` and `map.transform` simply read
 *  `undefined`, an assignment to `map.transformCameraUpdate` installs nothing, a patch on the map's
 *  `_elevateCameraIfInsideTerrain` is never called. So the checks below either EVALUATE the installed
 *  library or measure the adapter's source against it — never against a copy of its names:
 *    ① every method the adapter calls on the renderer's map exists on the installed Map
 *    ② the renderer's camera internals are reached in ONE place (`_cam` / `_tr`), and nothing reads
 *       the members v6 took off the map, writes the hook property, or asks for getMatrixForModel
 *    ③ src/vendor.js imports the namespace (v6 has no default export) and hands MapLibre a built,
 *       self-contained worker before any Map exists — because the published worker imports a sibling
 *  (the renderer's de-duplication of equal style writes, which js/geo-command-log.js's skip table is
 *   built on, is evaluated on the installed library by tests/r322-checks ① — it read 5.24's bundle text)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const R = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const ml = await import('maplibre-gl');
const GEO = R('js/geo-engine.js');

/* the binding an identifier resolves to at a node, found by walking out through the enclosing
   functions and blocks — enough scope analysis to tell the renderer's map (`const m=_m()`) from a
   JavaScript Map that happens to be called `m` (`const m=new Map()`, which the adapter also has) */
function bindingOf(name, ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    const fnParams = (a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') ? a.params : null;
    if (fnParams && fnParams.some((p) => p.type === 'Identifier' && p.name === name)) return { kind: 'param', fn: a };
    const body = (a.type === 'BlockStatement' || a.type === 'Program') ? a.body : null;
    if (body) for (const st of body) {
      if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.id.name === name) return { kind: 'var', init: d.init };
      if (st.type === 'FunctionDeclaration' && st.id && st.id.name === name) return { kind: 'fn' };
    }
  }
  return null;
}
const isMapInit = (init) => !!init && (
  (init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === '_m') ||
  (init.type === 'NewExpression' && init.callee.type === 'MemberExpression' && init.callee.property.name === 'Map' &&
   init.callee.object.type === 'Identifier' && init.callee.object.name === 'maplibregl'));

test('① every method the adapter calls on the renderer\'s map exists on the installed MapLibre', () => {
  const called = new Map();
  walk.ancestor(parse(GEO), {
    CallExpression(n, _s, anc) {
      const c = n.callee;
      if (c.type !== 'MemberExpression' || c.computed || c.object.type !== 'Identifier') return;
      const b = bindingOf(c.object.name, anc);
      if (!(b && b.kind === 'var' && isMapInit(b.init))) return;
      const k = c.property.name;
      if (!called.has(k)) called.set(k, n.loc.start.line);
    },
  });
  assert.ok(called.size > 40, `the walk found the adapter's calls (${called.size}) — if this is small, the binding rule stopped matching`);
  const missing = [...called].filter(([k]) => typeof ml.Map.prototype[k] !== 'function').map(([k, l]) => `${k} (js/geo-engine.js:${l})`);
  assert.deepEqual(missing, [], 'called on the map but not a method of maplibre-gl ' + ml.getVersion() + "'s Map — under 6.x such a call reads undefined and the feature goes quiet");
  /* and the three the migration moved OFF the map are indeed gone from it, so nothing may call them there */
  for (const gone of ['isEasing', '_elevateCameraIfInsideTerrain']) assert.equal(typeof ml.Map.prototype[gone], 'undefined', `Map.prototype.${gone}`);
  assert.equal(typeof ml.Map.prototype.setTransformCameraUpdate, 'function', 'the public setter the eye pivot installs its hook through');
});

test('② the camera internals are reached in one place, and nothing reads what v6 took off the map', () => {
  const ast = parse(GEO);
  const fnOf = (anc) => { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (a.type === 'FunctionDeclaration') return a.id.name; } return null; };
  const bad = [];
  walk.ancestor(ast, {
    MemberExpression(n, _s, anc) {
      if (n.computed || n.property.type !== 'Identifier') return;
      const p = n.property.name, where = `js/geo-engine.js:${n.loc.start.line}`;
      if (p === '_camera' && fnOf(anc) !== '_cam') bad.push(`${where} reads _camera outside _cam()`);
      if (p === 'transform' && fnOf(anc) !== '_tr') bad.push(`${where} reads .transform outside _tr()`);
      if (p === 'getMatrixForModel') bad.push(`${where} asks for getMatrixForModel, which 6.0 removed`);
    },
    AssignmentExpression(n) {
      const l = n.left;
      if (l.type === 'MemberExpression' && !l.computed && l.property.name === 'transformCameraUpdate')
        bad.push(`js/geo-engine.js:${n.loc.start.line} assigns transformCameraUpdate — the map does not read it under 6.x; setTransformCameraUpdate does`);
    },
  });
  /* camera-math.js is handed transforms; it must not go looking for one on a map */
  walk.simple(parse(R('js/camera-math.js')), {
    MemberExpression(n) { if (!n.computed && n.property.name === 'transform') bad.push(`js/camera-math.js:${n.loc.start.line} reads .transform`); },
  });
  assert.deepEqual(bad, []);
});

test('③ src/vendor.js publishes the namespace and a self-contained worker, before any map exists', () => {
  assert.equal(ml.default, undefined, 'maplibre-gl 6 has no default export — `import maplibregl from` would bind undefined');
  const ast = parse(R('src/vendor.js'));
  let ns = null, workerUrl = null, setAt = -1, publishAt = -1;
  for (const [i, st] of ast.body.entries()) {
    if (st.type === 'ImportDeclaration' && st.source.value === 'maplibre-gl') {
      const s = st.specifiers.find((x) => x.type === 'ImportNamespaceSpecifier'); if (s) ns = s.local.name;
    }
    if (st.type === 'ImportDeclaration' && /^maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?worker&url$/.test(st.source.value)) {
      const s = st.specifiers.find((x) => x.type === 'ImportDefaultSpecifier'); if (s) workerUrl = s.local.name;
    }
    if (st.type !== 'ExpressionStatement') continue;
    const e = st.expression;
    if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.property.name === 'setWorkerUrl'
        && e.callee.object.name === ns && e.arguments[0] && e.arguments[0].name === workerUrl) setAt = i;
    if (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.object.name === 'window'
        && e.left.property.name === 'maplibregl' && e.right.name === ns) publishAt = i;
  }
  assert.ok(ns, 'maplibre-gl is imported as a namespace');
  assert.ok(workerUrl, 'the worker URL is imported through Vite\'s worker pipeline (?worker&url)');
  assert.ok(setAt >= 0, 'and handed to setWorkerUrl at module top level');
  assert.ok(publishAt > setAt, 'before window.maplibregl — the global every map is constructed from');
  /* WHY `?worker&url` and not `?url`: the published worker is not self-contained. A plain ?url copies
     it verbatim, and its first statement imports a file that would not be there. */
  const pkgDir = dirname(require.resolve('maplibre-gl/package.json'));
  const workerSrc = readFileSync(join(pkgDir, 'dist', 'maplibre-gl-worker.mjs'), 'utf8');
  const rel = parse(workerSrc).body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value);
  assert.ok(rel.some((v) => v.startsWith('./')), `the published worker imports a sibling (${rel.join(', ')}), which is why it must be BUILT, not copied`);
});
