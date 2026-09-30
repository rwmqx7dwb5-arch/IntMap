/* ============================================================================
 *  startup-lazy-layers — what the page evaluates at boot, and what it fetches when asked
 * ----------------------------------------------------------------------------
 *  The round moved two layer/feature BODIES out of the entry chunk and kept their ROWS / ENTRY POINTS
 *  eager: the World-data family (js/world-packs.js behind js/world-packs-rows.js) and the space
 *  explorer (js/space.js, with the three arithmetic modules only it reads, behind
 *  js/space-approach.js). It also gave data/stars.bin one reader, handed the 9.76 MB ecoregions file to
 *  the renderer by URL, and took the Noto rule sheets off the critical path. Measured before → after
 *  (vite build, .perf/build-report.json): eager 4,945,707 → 4,669,431 B raw, 1,622,339 → 1,520,634 B
 *  gzip, 288 → 286 modules, 7 eager chunks both times.
 *
 *    ① NO module js/lazy-modules.js fetches is reachable from the entry by STATIC imports. A bundler
 *       puts a module in the entry chunk exactly when the entry's static graph reaches it, so this is
 *       the property «it did not come back into the entry chunk», asked of the real graph — for every
 *       registry entry, not a list of the two this round moved. (R209 ① only asked whether src/main.js
 *       names the file itself; a sibling that imports it statically would have passed.)
 *    ② …and the eager halves ARE in that graph — a row that is not there at boot is not a row.
 *    ③ js/lazy-modules.js `lazyBody`: clicks reach the body in the order they were made, «off» before
 *       any fetch fetches nothing, it is synchronous once the body has arrived, and a failed arrival is
 *       not remembered — RUN on the shipped function.
 *    ④ the space facade answers before the explorer arrives, queues Atlas's two calls in order, and
 *       hands over to the explorer's own entry points when it lands — RUN (the approach factory is
 *       evaluated against a stub host; the explorer is a stand-in that records what reached it).
 *    ⑤ the ecoregions source is given to the renderer as the URL, not as a parsed document.
 *    ⑥ when a build is present, its own report agrees with ① and ②.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseSource } from './helpers/ast.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { LAZY_REGISTRY, lazyBody } from '../js/lazy-modules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (abs) => relative(ROOT, abs).replace(/\\/g, '/');

/* the entry's STATIC import closure, from the parsed source of every file it reaches */
function staticClosure(entry) {
  const seen = new Set(); const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.m?js$/.test(f) || !existsSync(f)) continue;
    const ast = parseSource(readFileSync(f, 'utf8'), { sourceType: 'module', orNull: true });
    if (!ast) continue;
    for (const n of ast.body) {
      const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source.value : null;
      if (src && /^\.\.?\//.test(src)) stack.push(resolve(dirname(f), src));
    }
  }
  return new Set([...seen].map(rel));
}
/* the file each registry entry fetches — read off the `load` function the loader itself calls */
const lazyTargets = () => Object.entries(LAZY_REGISTRY).map(([name, e]) => {
  const m = /import\(\s*'\.\/([^']+)'\s*\)/.exec(String(e.load));
  return { name, file: m ? 'js/' + m[1] : null };
});

test('startup-lazy-layers ① no module the loader fetches on demand is reachable from the entry by a static import', () => {
  const eager = staticClosure('src/main.js');
  assert.ok(eager.has('js/app-body.js') && eager.size > 150, `the entry graph was not read (${eager.size} files)`);
  const targets = lazyTargets();
  assert.ok(targets.length >= 40 && targets.every((t) => t.file), 'every registry entry names a literal file');
  const back = targets.filter((t) => eager.has(t.file)).map((t) => t.name + ' → ' + t.file);
  assert.deepEqual(back, [], 'these are fetched on demand AND statically reachable from the entry — the bundler puts them back in the entry chunk');
  /* …and what ONLY a deferred module imports stays out too (the explorer's three arithmetic modules) */
  for (const f of ['js/world-packs.js', 'js/space.js', 'js/space-events.js', 'js/space-bodies.js', 'js/space-cosmos.js']) {
    assert.ok(!eager.has(f), `${f} is back in the boot graph`);
  }
});

test('startup-lazy-layers ② the eager halves — the rows, the toolkit, the approach — are in the boot graph', () => {
  const eager = staticClosure('src/main.js');
  for (const f of ['js/world-packs-rows.js', 'js/space-approach.js', 'js/star-catalogue.js', 'js/lazy-modules.js']) {
    assert.ok(eager.has(f), `${f} is not reached from the entry — its rows / entry points would not exist at boot`);
  }
  /* the consumers of the World-data toolkit boot after its owner (they read window.IntMapWorld._ui) */
  const main = read('src/main.js');
  assert.ok(main.indexOf("'../js/world-packs-rows.js'") < main.indexOf("'../js/industry-web.js'"), 'the toolkit owner is imported before its first consumer');
});

test('startup-lazy-layers ③ lazyBody: asked order, no fetch for «off», synchronous once here, a failure not kept', async () => {
  let asks = 0, release = null;
  const door = lazyBody(() => { asks++; return new Promise((r) => { release = r; }); });
  assert.equal(door.asked(), false);
  assert.equal(door.arrived(), false);
  const got = [];
  door.run((ok) => got.push('on:' + ok));
  door.run((ok) => got.push('off:' + ok));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(asks, 1, 'two clicks, ONE fetch');
  assert.deepEqual(got, [], 'nothing runs before the body is here');
  release(true);
  await door.need();
  assert.deepEqual(got, ['on:true', 'off:true'], 'on then off, in the order they were made');
  door.run((ok) => got.push('sync:' + ok));
  assert.deepEqual(got.slice(-1), ['sync:true'], 'once the body is here, run() is synchronous again');
  /* a failed arrival is not the answer forever: the next ask fetches again */
  let tries = 0;
  const flaky = lazyBody(() => Promise.resolve(++tries > 1));
  assert.equal(await flaky.need(), false);
  assert.equal(flaky.asked(), false, 'a failed arrival is forgotten');
  assert.equal(await flaky.need(), true, 'and the next ask reads again');
  assert.equal(tries, 2);
});

test('startup-lazy-layers ④ the space facade answers before the explorer, queues Atlas in order, and hands over', async () => {
  const calls = [];
  let resolveNeed = null;
  const w = {
    console, Math, Date, performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: () => null, body: { appendChild() {} }, createElement: () => ({ style: {}, appendChild() {} }), querySelector: () => null },
    IntMapLang: { pick: () => (a) => a },
    IntMapGeoEngine: { camera: { get: () => ({ zoom: 5 }), getMinZoom: () => 0 }, events: { on() {} }, render: {} },
    IntMapLazy: { need: (n) => { calls.push('need:' + n); return new Promise((r) => { resolveNeed = r; }); } },
  };
  w.window = w;
  const ctx = vm.createContext(w);
  /* the approach is a module that imports lazyBody; evaluate it with that one binding supplied */
  const src = read('js/space-approach.js').replace(/^\s*import\s*\{\s*lazyBody\s*\}\s*from\s*'\.\/lazy-modules\.js';\s*$/m, '');
  vm.runInContext('var lazyBody = ' + lazyBody.toString() + ';\n' + src, ctx, { filename: 'js/space-approach.js' });
  w.IntMapModules.space({ lang: 'en', proj: 'globe' });
  const S = w.IntMapSpace;
  assert.equal(typeof S.mount, 'function');
  assert.equal(S.isOpen(), false, 'not open, and asking cost nothing');
  assert.equal(S.state().loaded, false, 'the facade says the explorer is not here rather than inventing its state');
  assert.deepEqual(calls, [], 'reading state downloads nothing');
  const opened = S.open({ body: 'mars' });
  S.setRate(3600);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ['need:spaceBody'], 'Atlas\'s open fetched the explorer, once');
  const reached = [];
  w.__imSpaceBody = { open: (o) => { reached.push('open:' + o.body); return true; }, setRate: (r) => reached.push('rate:' + r),
    isOpen: () => true, enterFromZoom: () => true, state: () => ({ open: true, loaded: true }) };
  /* the explorer's factory hands the facade its entry points (js/space.js, end of the factory) */
  Object.assign(S, w.__imSpaceBody);
  resolveNeed(true);
  assert.equal(await opened, true);
  await Promise.resolve();
  assert.deepEqual(reached, ['open:mars', 'rate:3600'], 'open then setRate, in Atlas\'s order');
  assert.equal(S.state().loaded, true, 'every later call goes to the explorer itself');
  /* and the explorer really does that hand-over */
  assert.match(codeOnly(read('js/space.js')), /Object\.assign\(window\.IntMapSpace,api\)/);
});

test('startup-lazy-layers ⑤ the ecoregions source is the URL — the renderer\'s worker reads the 9.76 MB file, not the page', () => {
  /* spelling kept: js/layer-packs.js builds the source inside a factory against the live renderer */
  const s = codeOnly(read('js/layer-packs.js'));
  const i = s.indexOf('function ensureEco('), j = s.indexOf('function addEcoLayers(', i);
  assert.ok(i > 0 && j > i, 'ensureEco / addEcoLayers moved');
  assert.doesNotMatch(s.slice(i, j), /__loadEcoregions/, 'the map path parses the file on the page again');
  assert.match(s, /addSource\('eco-regions',\{type:'geojson',data,/, 'the source is built from what addEcoLayers is handed');
  assert.match(s.slice(i, j), /addEcoLayers\(ECO_URL\)/, '…and it is handed the URL');
  assert.match(s, /const ECO_URL='data\/ecoregions_2017\.geojson';/);
  /* both engines take the URL form: Cesium's adapter fetches a string `data` itself */
  assert.match(codeOnly(read('js/cesium-engine.js')), /if\(typeof \(spec&&spec\.data\)==='string'\) this\._fetchGeoJSON\(rec,spec\.data\);/);
});

const REPORT = join(ROOT, '.perf', 'build-report.json');
const reportFresh = () => {
  if (!existsSync(REPORT)) return 'no build in this tree (npm run build writes .perf/build-report.json)';
  const t = statSync(REPORT).mtimeMs;
  const newer = ['js/world-packs-rows.js', 'js/space-approach.js', 'src/main.js', 'js/lazy-modules.js'].filter((f) => statSync(join(ROOT, f)).mtimeMs > t);
  return newer.length ? 'the build report is older than ' + newer.join(', ') : false;
};
test('startup-lazy-layers ⑥ the build\'s own report agrees: the bodies are async chunks, the rows are in the entry', { skip: reportFresh() }, () => {
  const r = JSON.parse(readFileSync(REPORT, 'utf8'));
  const where = new Map();
  for (const [name, c] of Object.entries(r.chunks)) {
    const mods = Array.isArray(c.modules) ? c.modules.map((m) => m.id || m.name || m) : Object.keys(c.modules);
    for (const id of mods) where.set(String(id).replace(/\\/g, '/'), r.eager.chunks.includes(name));
  }
  const eagerOf = (f) => { for (const [id, e] of where) if (id === f || id.endsWith('/' + f)) return e; return undefined; };
  for (const f of ['js/world-packs.js', 'js/space.js', 'js/space-events.js', 'js/space-bodies.js', 'js/space-cosmos.js']) {
    assert.equal(eagerOf(f), false, `${f} is not in an async chunk of this build`);
  }
  for (const f of ['js/world-packs-rows.js', 'js/space-approach.js', 'js/star-catalogue.js']) {
    assert.equal(eagerOf(f), true, `${f} is not in the eager graph of this build`);
  }
});

/* ⑦ the Noto sheets no longer block the first paint, so a CJK face can arrive after the renderer has
   rasterised labels with the fallback. When document.fonts reports a CJK face finished loading, the
   glyph cache is emptied once per burst (coalesced to a frame) — and a Latin face asks for nothing.
   RUN: js/map-typography.js evaluated against a fake document.fonts and engine. */
test('⑦ a CJK face that lands after the first paint refreshes the map glyphs once; a Latin face does not', async () => {
  const vm = await import('node:vm');
  const src = readFileSync(join(ROOT, 'js', 'map-typography.js'), 'utf8');
  const listeners = {}; let frames = [];
  let refreshed = 0;
  const win = {
    addEventListener() {}, requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    IntMapGeoEngine: { scene: { refreshCjkGlyphs: () => { refreshed++; return true; } } },
  };
  const doc = {
    readyState: 'complete', documentElement: { lang: 'ja' }, head: { appendChild() {} }, baseURI: 'http://x/',
    createElement: () => ({ dataset: {} }),
    fonts: { addEventListener: (t, f) => { listeners[t] = f; }, forEach() {} },
  };
  const ctx = { window: win, document: doc, requestAnimationFrame: win.requestAnimationFrame, navigator: {}, URL, console, getComputedStyle: () => ({}) };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(typeof listeners.loadingdone, 'function', 'map-typography listens for document.fonts loadingdone');
  const flush = () => { const f = frames; frames = []; f.forEach((x) => x()); };
  listeners.loadingdone({ fontfaces: [{ family: 'Inter' }] }); flush();
  assert.equal(refreshed, 0, 'a Latin face does not empty the glyph cache');
  listeners.loadingdone({ fontfaces: [{ family: '"Noto Sans JP"' }] });
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans SC' }] });
  flush();
  assert.equal(refreshed, 1, 'two CJK faces in one frame are one refresh');
  listeners.loadingdone({ fontfaces: [{ family: 'Noto Sans TC' }] }); flush();
  assert.equal(refreshed, 2, 'a later face refreshes again — the fact, not a timer, decides');
});
