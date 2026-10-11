/* ============================================================================
 *  maplibre-from-source — MapLibre is built from the TypeScript its package ships, by this build
 *  (vite.config.js: maplibreSource, maplibreSharedWorker, the `maplibre-gl` alias)
 * ----------------------------------------------------------------------------
 *  6.13 made its two published files self-contained (upstream #8621): the renderer and the worker each
 *  carry the ~500 kB both of them use, and a page that loads both ships it twice. MEASURED on the
 *  published files: eager +466 kB raw / +130 kB gzip. The package also ships src/, and built from its two
 *  entries (src/index.ts, src/source/worker.ts — the ones MapLibre's own rolldown build bundles) the
 *  shared modules are one chunk again. What has to stay true for that to be the same library:
 *    ① the alias names the installed package's renderer entry, and that entry exports exactly what the
 *       published renderer exports (the namespace src/vendor.js publishes is the same object shape)
 *    ② its TypeScript is compiled with MapLibre's own class-field semantics, not IntMap's tsconfig —
 *       a field declared without an initializer is not a field (upstream useDefineForClassFields false)
 *    ③ the chunk groups hold the whole library: every package MapLibre's source reaches, discovered
 *       from the installed package.json files
 *    ④ the worker may evaluate the bundler's own runtime (it has no module record), and still not a
 *       plugin's virtual module it does not import
 *    ⑤ a build that failed reports its own error — the app-shell step does not replace it with ENOENT
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as acorn from 'acorn';
import { transformWithOxc } from 'vite';

const require = createRequire(import.meta.url);
const PKG_DIR = dirname(require.resolve('maplibre-gl/package.json'));
const PKG = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));
const slash = (p) => p.replace(/\\/g, '/');
const viteCfg = await import('../vite.config.js');
const cfg = viteCfg.default;
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

test('① `maplibre-gl` is the installed package\'s source entry, and it exports what the published renderer exports', async () => {
  const alias = cfg.resolve.alias.find((a) => a.find instanceof RegExp && a.find.test('maplibre-gl'));
  assert.ok(alias, 'vite.config.js aliases the bare specifier');
  assert.ok(!alias.find.test('maplibre-gl/dist/maplibre-gl.css'), 'and only the bare specifier — the stylesheet is still the published one');
  assert.equal(alias.replacement, slash(join(PKG_DIR, 'src/index.ts')));
  assert.ok(existsSync(alias.replacement), `the package ships its source (${PKG.name} ${PKG.version})`);
  const js = (await transformWithOxc(readFileSync(alias.replacement, 'utf8'), alias.replacement, { lang: 'ts', sourcemap: false })).code;
  const fromSource = new Set();
  for (const st of parse(js).body) {
    if (st.type === 'ExportNamedDeclaration') {
      for (const s of st.specifiers || []) fromSource.add(s.exported.name);
      const d = st.declaration;
      if (d && d.id) fromSource.add(d.id.name);
      if (d && d.declarations) for (const v of d.declarations) fromSource.add(v.id.name);
    }
    if (st.type === 'ExportDefaultDeclaration') fromSource.add('default');
  }
  const published = Object.keys(await import('maplibre-gl'));
  assert.deepEqual([...fromSource].sort(), [...published].sort(),
    'the source entry and the published renderer export the same names — the namespace window.maplibregl holds is unchanged');
});

test('② MapLibre\'s TypeScript is compiled with MapLibre\'s class-field semantics', async () => {
  const plugin = viteCfg.maplibreSource();
  const file = slash(join(PKG_DIR, 'src/util/ajax.ts'));
  const src = readFileSync(file, 'utf8');
  assert.match(src, /class AJAXError extends Error \{[\s\S]*?\n\s+status: number;/, 'the fixture: a field declared without an initializer');
  const out = (await plugin.transform(src, file)).code;
  const cls = out.slice(out.indexOf('class AJAXError'), out.indexOf('class AJAXError') + 600);
  assert.doesNotMatch(cls, /^\s*status\s*;/m, 'a declaration is not a class field');
  assert.doesNotMatch(cls, /defineProperty\(this,\s*["'`]status/, 'nor a defineProperty of undefined');
  assert.match(cls, /this\.status\s*=/, 'the constructor\'s assignment is what sets it');
  /* the same as upstream's published build of the same class */
  const dist = readFileSync(join(PKG_DIR, 'dist/maplibre-gl-worker.mjs'), 'utf8');
  assert.match(dist, /this\.status=\w+,this\.statusText=\w+/, 'MapLibre\'s own dist assigns, it does not define');
  /* and the rule is the file's, not this one class's: a subclass redeclaring a field the base set */
  const probe = slash(join(PKG_DIR, 'src/__probe__.ts'));
  const sub = (await plugin.transform('class A { x = 1 }\nexport class B extends A { x: number; }\n', probe)).code;
  assert.doesNotMatch(sub.slice(sub.indexOf('class B')), /\bx\b/, 'a redeclared field does not reset what the base class set');
  assert.equal(await plugin.transform('class C { y: number; }', slash(join(PKG_DIR, 'dist/x.ts'))), null, 'files outside src/ are not its business');
  const oxcExclude = [].concat(cfg.oxc.exclude);
  assert.ok(oxcExclude.some((re) => re instanceof RegExp && re.test(file)), 'and Vite\'s own TypeScript pass does not compile them again with IntMap\'s tsconfig');
});

test('③ the chunk groups hold every package MapLibre\'s source reaches', () => {
  const groups = cfg.build.rolldownOptions.output.codeSplitting.groups.filter((g) => /^maplibre-gl/.test(g.debugName || ''));
  assert.equal(groups.length, 2, 'the renderer\'s group and the shared group');
  /* a package's own directory, looked up the way Node walks node_modules (a package's `exports` may
     not expose ./package.json, so require.resolve cannot be asked for it) */
  const dirOf = (name, from) => createRequire(join(from, 'package.json')).resolve.paths(name).map((b) => join(b, name)).find((d) => existsSync(join(d, 'package.json')));
  const reach = new Set(), q = [[ 'maplibre-gl', PKG_DIR ]];
  while (q.length) {
    const [name, dir] = q.shift();
    for (const d of Object.keys(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies || {})) {
      if (d.startsWith('@types/') || reach.has(d)) continue;
      reach.add(d); q.push([d, dirOf(d, dir)]);
    }
  }
  assert.ok(reach.size >= Object.keys(PKG.dependencies).length - 1, 'discovered from the installed package.json files');
  const missing = [...reach].filter((p) => !groups.every((g) => g.test(`/x/node_modules/${p}/index.js`)));
  assert.deepEqual(missing, [], 'none of them falls to another group (the lazy cesium group also names pbf and @mapbox/vector-tile)');
});

test('④ the worker may evaluate the bundler\'s runtime, and still not a plugin\'s virtual module', async () => {
  const W = slash(join(PKG_DIR, 'src/source/worker.ts')), S = slash(join(PKG_DIR, 'src/util/util.ts'));
  const RUNTIME = '\0rolldown/runtime.js', POLY = '\0vite/modulepreload-polyfill.js';
  const infos = { [W]: { id: W, importedIds: [S] }, [S]: { id: S, importedIds: [] }, [POLY]: { id: POLY, importedIds: [] } };
  const getModuleInfo = (id) => infos[id] || null;
  const p = viteCfg.maplibreSharedWorker();
  p.configResolved({ command: 'build' });
  await p.load.call({ resolve: async () => ({ id: W }), emitFile: () => 'R', error: (m) => { throw new Error(m); } }, p.resolveId('virtual:maplibre-gl-worker-url'));
  const chunk = (fileName, modules, imports, extra = {}) => ({ type: 'chunk', fileName, modules: Object.fromEntries(modules.map((m) => [m, {}])), imports, ...extra });
  const run = (extraShared) => p.generateBundle.call({ getModuleInfo, error: (m) => { throw new Error(m); } }, {}, {
    w: chunk('assets/maplibre-gl-worker-a.js', [W], ['assets/maplibre-gl-shared-b.js'], { isEntry: true, facadeModuleId: W }),
    s: chunk('assets/maplibre-gl-shared-b.js', [S, ...extraShared], ['assets/rolldown-runtime-c.js']),
    r: chunk('assets/rolldown-runtime-c.js', [RUNTIME], []),
  });
  assert.doesNotThrow(() => run([]), 'the runtime chunk the shared code imports is accepted');
  assert.throws(() => run([POLY]), /modulepreload-polyfill/, 'a plugin\'s module the worker does not import is refused, as before');
});

test('⑤ a failed build reports its own error: the app shell is written only for a bundle that was written', () => {
  const p = viteCfg.appShell();
  p.configResolved({ root: process.cwd(), build: { outDir: 'dist-never-written' } });
  p.buildStart();
  assert.doesNotThrow(() => p.closeBundle.handler.call({}), 'no bundle was written — nothing to read, nothing thrown over the real error');
});
