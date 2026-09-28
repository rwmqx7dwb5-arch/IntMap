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
 *    ③ src/vendor.js imports the namespace (v6 has no default export) and hands MapLibre the worker
 *       the build emits, before any Map exists — because the published worker imports a sibling
 *    ④ …and that worker is a chunk of the SAME build, importing the renderer's own shared chunk: the
 *       placement is asked of the module graph, and the build refuses a worker chunk that would
 *       evaluate a module outside the worker's graph (dev-notes/2026-09-28-maplibre-shared-worker.md)
 *    ⑤ scripts/build-report.mjs counts that worker chunk as boot, by the name a module gives it
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

/* the plugin that answers vendor.js's worker import, evaluated rather than read (vite.config.js) */
const viteCfg = await import('../vite.config.js');
const workerPlugin = (command) => {
  const p = viteCfg.maplibreSharedWorker();
  p.configResolved({ command });
  return p;
};
const PKG_DIR = dirname(require.resolve('maplibre-gl/package.json'));
const ML_FILE = (f) => join(PKG_DIR, 'dist', f).replace(/\\/g, '/');

test('③ src/vendor.js publishes the namespace and the worker the build emits, before any map exists', async () => {
  assert.equal(ml.default, undefined, 'maplibre-gl 6 has no default export — `import maplibregl from` would bind undefined');
  const ast = parse(R('src/vendor.js'));
  const defaults = new Map();
  let ns = null, workerArg = null, setAt = -1, publishAt = -1;
  for (const [i, st] of ast.body.entries()) {
    if (st.type === 'ImportDeclaration') {
      const d = st.specifiers.find((x) => x.type === 'ImportDefaultSpecifier'); if (d) defaults.set(d.local.name, st.source.value);
      const s = st.specifiers.find((x) => x.type === 'ImportNamespaceSpecifier'); if (s && st.source.value === 'maplibre-gl') ns = s.local.name;
    }
    if (st.type !== 'ExpressionStatement') continue;
    const e = st.expression;
    if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.property.name === 'setWorkerUrl'
        && e.callee.object.name === ns && e.arguments[0] && e.arguments[0].type === 'Identifier') { setAt = i; workerArg = e.arguments[0].name; }
    if (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.object.name === 'window'
        && e.left.property.name === 'maplibregl' && e.right.name === ns) publishAt = i;
  }
  assert.ok(ns, 'maplibre-gl is imported as a namespace');
  assert.ok(setAt >= 0, 'a worker URL is handed to setWorkerUrl at module top level');
  assert.ok(publishAt > setAt, 'before window.maplibregl — the global every map is constructed from');
  const spec = defaults.get(workerArg);
  assert.ok(spec, 'the URL setWorkerUrl receives is an import');
  /* …and that import is the one the build plugin answers — in both modes */
  const build = workerPlugin('build');
  const id = build.resolveId(spec);
  assert.ok(id, `vite.config.js maplibreSharedWorker resolves ${spec}`);
  const emitted = [];
  const code = await build.load.call({
    resolve: async (s) => ({ id: require.resolve(s).replace(/\\/g, '/'), external: false }),
    emitFile: (o) => { emitted.push(o); return 'REF0'; },
    error: (m) => { throw new Error(m); },
  }, id);
  assert.equal(emitted.length, 1, 'the build emits the worker once');
  assert.equal(emitted[0].type, 'chunk', 'as a CHUNK of this build — not a separate worker bundle that repeats the shared code');
  assert.equal(emitted[0].id, ML_FILE('maplibre-gl-worker.mjs'), 'and the chunk is the published worker');
  assert.match(code, /import\.meta\.ROLLUP_FILE_URL_REF0/, 'the URL is the emitted chunk\'s, hashed with the build');
  const dev = workerPlugin('serve');
  assert.match(await dev.load.call({}, dev.resolveId(spec)), /maplibre-gl-worker\.mjs\?worker&url/,
    '`vite dev` has no chunks: it answers with Vite\'s dev worker URL');
  /* WHY BUILT and not copied (`?url`): the published worker is not self-contained. A verbatim copy's
     first statement imports a file that would not be there. */
  const workerSrc = readFileSync(ML_FILE('maplibre-gl-worker.mjs'), 'utf8');
  const rel = parse(workerSrc).body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value);
  assert.ok(rel.some((v) => v.startsWith('./')), `the published worker imports a sibling (${rel.join(', ')}), which is why it must be BUILT, not copied`);
});

/* a synthetic module graph with MapLibre 6's shape: the worker and the renderer both import the shared
   module, the worker's dynamic import() pulls in Vite's preload helper, and the renderer carries the
   modulepreload polyfill (which touches `document` at top level) */
function mlGraph() {
  const W = ML_FILE('maplibre-gl-worker.mjs'), S = ML_FILE('maplibre-gl-shared.mjs'), M = ML_FILE('maplibre-gl.mjs');
  const PRELOAD = '\0vite/preload-helper.js', POLY = '\0vite/modulepreload-polyfill.js';
  const infos = { [W]: [S, PRELOAD], [S]: [], [M]: [S], [PRELOAD]: [], [POLY]: [] };
  const objs = Object.fromEntries(Object.entries(infos).map(([k, v]) => [k, { id: k, importedIds: v }]));
  return { W, S, M, PRELOAD, POLY, getModuleInfo: (id) => objs[id] || null };
}
/* a build-mode plugin that has emitted the worker `g.W` — the specifier is the one vendor.js imports */
async function armedPlugin(g) {
  const spec = [...parse(R('src/vendor.js')).body].find((st) => st.type === 'ImportDeclaration' && /worker/.test(st.source.value)).source.value;
  const p = workerPlugin('build');
  await p.load.call({ resolve: async () => ({ id: g.W }), emitFile: () => 'REF1', error: (m) => { throw new Error(m); } }, p.resolveId(spec));
  return p;
}

test('④ what the worker imports shares ONE chunk with the renderer, and the build refuses a worker chunk that would run anything else', async () => {
  const g = mlGraph();
  const p = await armedPlugin(g);
  /* the placement, evaluated through the real chunk groups with this graph */
  const groups = viteCfg.default.build.rolldownOptions.output.codeSplitting.groups;
  const ctx = { getModuleInfo: g.getModuleInfo };
  const hit = (gr, id) => (typeof gr.test === 'function' ? gr.test(id) : gr.test.test(id));
  const nameOf = (gr, id) => (typeof gr.name === 'function' ? gr.name(id, ctx) : gr.name);
  const owner = (id) => groups.filter((gr) => hit(gr, id) && nameOf(gr, id)).sort((a, b) => b.priority - a.priority).map((gr) => nameOf(gr, id))[0];
  assert.equal(owner(g.S), 'maplibre-gl-shared', 'the shared module is its own chunk');
  assert.equal(owner(g.PRELOAD), 'maplibre-gl-shared', 'a helper the worker reaches goes with it');
  assert.equal(owner(g.M), 'maplibre-gl', 'the renderer stays in its chunk');
  assert.equal(owner(g.POLY), 'maplibre-gl', 'and so does a helper the worker never imports');
  assert.equal(owner(g.W), undefined, 'the worker itself is its own entry chunk, in no group');
  /* the refusal, on a finished bundle */
  const chunk = (fileName, modules, imports, extra = {}) => ({ type: 'chunk', fileName, modules: Object.fromEntries(modules.map((m) => [m, {}])), imports, ...extra });
  const run = (bundle) => p.generateBundle.call({ getModuleInfo: g.getModuleInfo, error: (m) => { throw new Error(m); } }, {}, bundle);
  const ok = {
    w: chunk('assets/maplibre-gl-worker-a.js', [g.W], ['assets/maplibre-gl-shared-b.js'], { isEntry: true, facadeModuleId: g.W }),
    s: chunk('assets/maplibre-gl-shared-b.js', [g.S, g.PRELOAD], []),
    r: chunk('assets/maplibre-gl-c.js', [g.M, g.POLY], ['assets/maplibre-gl-shared-b.js']),
  };
  assert.doesNotThrow(() => run(ok), 'the shape the build produces is accepted');
  const merged = { ...ok, s: chunk('assets/maplibre-gl-shared-b.js', [g.S, g.PRELOAD, g.POLY], []) };
  assert.throws(() => run(merged), /modulepreload-polyfill/, 'a main-thread module in a chunk the worker loads fails the build, by name');
  const noWorker = { s: ok.s, r: ok.r };
  assert.throws(() => run(noWorker), /not emitted as a chunk/, 'and so does a build that lost the worker chunk');
});

test('⑤ build-report counts the emitted worker chunk as boot — named by its PRELIMINARY file name', async () => {
  const { buildReportPlugin } = await import('../scripts/build-report.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'mlw-report-'));
  try {
    const out = join(dir, 'r.json');
    const mod = (code) => ({ code, renderedLength: code.length });
    const chunk = (name, fileName, modules, imports, extra = {}) => ({
      type: 'chunk', name, fileName, code: Object.values(modules).map((m) => m.code).join('\n'), modules,
      imports, dynamicImports: [], isEntry: false, isDynamicEntry: false, facadeModuleId: null, viteMetadata: { importedCss: new Set() }, ...extra,
    });
    const bundle = (named) => ({
      'assets/main-a.js': chunk('main', 'assets/main-a.js', { [join(ROOT, 'src/main.js')]: mod('app()') }, ['assets/maplibre-gl-b.js'], { isEntry: true, facadeModuleId: join(ROOT, 'index.html') }),
      'assets/maplibre-gl-b.js': chunk('maplibre-gl', 'assets/maplibre-gl-b.js', {
        '\0virtual:maplibre-gl-worker-url': mod(named ? 'var u=new URL("maplibre-gl-worker-!~{01n}~.js",import.meta.url).href;' : 'var u=1;'),
      }, ['assets/maplibre-gl-shared-c.js']),
      'assets/maplibre-gl-shared-c.js': chunk('maplibre-gl-shared', 'assets/maplibre-gl-shared-c.js', { [ML_FILE('maplibre-gl-shared.mjs')]: mod('shared()') }, []),
      'assets/maplibre-gl-worker-d.js': chunk('maplibre-gl-worker', 'assets/maplibre-gl-worker-d.js', { [ML_FILE('maplibre-gl-worker.mjs')]: mod('worker()') },
        ['assets/maplibre-gl-shared-c.js'], { isEntry: true, facadeModuleId: ML_FILE('maplibre-gl-worker.mjs'), preliminaryFileName: 'assets/maplibre-gl-worker-!~{01n}~.js' }),
    });
    buildReportPlugin({ out }).generateBundle({}, bundle(true));
    const r = JSON.parse(readFileSync(out, 'utf8'));
    assert.ok(r.eager.chunks.includes('assets/maplibre-gl-worker-d.js'), 'the worker chunk is EAGER');
    assert.equal(r.eager.chunks.filter((f) => f.includes('shared')).length, 1, 'and the shared chunk it imports is counted once');
    assert.deepEqual(r.eager.workers.files, ['assets/maplibre-gl-worker-d.js']);
    assert.equal(r.eager.requests, 4, 'main + renderer + shared + worker');
    assert.ok(!r.async.chunks.includes('assets/maplibre-gl-worker-d.js'), 'and it is not ASYNC');
    assert.throws(() => buildReportPlugin({ out }).generateBundle({}, bundle(false)), /no module names/,
      'an emitted entry that no module names is an error, not a quietly ASYNC chunk');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
