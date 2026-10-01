/* ============================================================================
 *  module-graph — files are joined by import, not by window
 * ----------------------------------------------------------------------------
 *  What this holds (docs/architecture/03-files.md «ファイル同士の結び方», DECISIONS.md):
 *    ①② the owners of the most-read globals are ES modules, evaluated here by IMPORT, and a test can
 *       replace one import edge of the module under test (tests/helpers/import-module.mjs);
 *    ③–⑥ the migration tool (scripts/module-graph.mjs) does what it says on a fixture tree — and
 *       REFUSES the cases where a mechanical rewrite would change behaviour;
 *    ⑦ the gate (check:surface) refuses a module that reads an exported global off `window`;
 *    ⑧ on the real tree: the factory registry stays dissolved, no exported global is read off the
 *       global, and every line left in src/main.js says why it is there.
 *  Fixture trees are written to a fresh temporary directory per run, so no gate ever scans them.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { importModule } from './helpers/import-module.mjs';
import { migrate, migrateFactories, exportOwner, entryPlan, ensureImport, exportedGlobals, report } from '../scripts/module-graph.mjs';
import { measure } from '../scripts/global-surface.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

test('① the clock, the engine seam and the language registry are evaluated by import, not by reading their text', async () => {
  const { IntMapTime } = await importModule('js/chronos.js');
  assert.equal(typeof IntMapTime.on, 'function');
  assert.equal(globalThis.IntMapTime, IntMapTime, 'the compat window carries the SAME object the import does');
  const { IntMapLang } = await importModule('js/lang-registry.js');
  assert.equal(IntMapLang.t('en', 'Yes', 'はい'), 'Yes');
  assert.equal(IntMapLang.t('jp', 'Yes', 'はい'), 'はい');
  const { IntMapGeoEngine } = await importModule('js/geo-engine.js');
  assert.equal(typeof IntMapGeoEngine.use, 'function');
  assert.equal(typeof IntMapGeoEngine.provideLayerKind, 'function', 'the engine takes its custom-layer kinds by injection');
});

test('② a mock replaces one import edge of the module under test and nothing else', async () => {
  const stub = { on: () => () => {}, isLive: () => true, marker: 'stub' };
  const a = await importModule('tests/fixtures/module-graph/reads-time.mjs', { mocks: { 'js/chronos.js': { IntMapTime: stub } } });
  assert.equal(a.clock().marker, 'stub');
  const b = await importModule('tests/fixtures/module-graph/reads-time.mjs');
  assert.notEqual(b.clock().marker, 'stub', 'without the mock the real singleton is imported');
  assert.equal(b.clock(), globalThis.IntMapTime);
});

/* ── a tiny repository the tool can be run on ─────────────────────────────────────────────── */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'im-module-graph-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const page = '<!doctype html><script type="module" src="/src/main.js"></script>';
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('③ --export then --migrate: the owner exports, every reader imports, and the reads become the binding', () => {
  const root = tree({
    'index.html': page,
    'src/main.js': "import '../js/owner.js';\nimport '../js/reader.js';\nimport '../js/bare.js';\n",
    'js/owner.js': "window.IntMapX = (function () { return { n: 1, self: () => window.IntMapX }; })();\n",
    'js/reader.js': "// a reader\nwindow.useX = function () { return window.IntMapX.n + (typeof window.IntMapX); };\n",
    'js/bare.js': "window.useBare = () => IntMapX.n;\n",
  });
  try {
    assert.equal(exportOwner('IntMapX', { write: true, root }).ok, true);
    const owner = read(root, 'js/owner.js');
    assert.match(owner, /^export const IntMapX = \(function/m);
    assert.match(owner, /^globalThis\.IntMapX = IntMapX;/m, 'the compat publication remains — the SAME object');
    assert.match(owner, /self: \(\) => IntMapX/, "the owner's own read becomes its binding");
    const r = migrate('IntMapX', { write: true, root });
    assert.equal(r.ok, true);
    const reader = read(root, 'js/reader.js');
    assert.match(reader, /import \{ IntMapX \} from '\.\/owner\.js';/);
    assert.match(reader, /return IntMapX\.n \+ \(typeof IntMapX\)/);
    assert.doesNotMatch(reader, /window\.IntMapX/);
    assert.match(read(root, 'js/bare.js'), /import \{ IntMapX \} from '\.\/owner\.js';/, 'a bare implicit global is the same edge');
    assert.equal(migrate('IntMapX', { root }).changed.length, 0, 'idempotent: nothing left to move');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('④ --migrate REFUSES what a mechanical rewrite would change: a second writer, a shadowing binding, a classic page', () => {
  const root = tree({
    'index.html': page + '<script src="./js/classic.js"></script>',
    'src/main.js': "import '../js/owner.js';\nimport '../js/shadow.js';\nimport '../js/alias.js';\n",
    'js/owner.js': 'export const IntMapY = { n: 1 };\nglobalThis.IntMapY = IntMapY;\n',
    'js/shadow.js': 'window.f = function (IntMapY) { return window.IntMapY.n + IntMapY; };\n',
    'js/alias.js': 'const IntMapY = window.IntMapY;\nwindow.g = () => IntMapY.n;\n',
    'js/classic.js': 'window.h = () => window.IntMapY.n;\n',
  });
  try {
    const r = migrate('IntMapY', { write: true, root });
    const skipped = Object.fromEntries(r.skipped.map((s) => [s.rel, s.why]));
    assert.match(skipped['js/shadow.js'], /declares its own binding/, 'a parameter named IntMapY would capture the import');
    assert.match(skipped['js/classic.js'], /classic <script>|not reached/, 'a classic script cannot take an import');
    const alias = read(root, 'js/alias.js');
    assert.doesNotMatch(alias, /const IntMapY = window\.IntMapY/, 'the plain alias is dropped…');
    assert.match(alias, /import \{ IntMapY \} from '\.\/owner\.js';/, '…and replaced by the import');
    writeFileSync(join(root, 'js/other.js'), 'window.IntMapY = { n: 2 };\n');
    assert.match(migrate('IntMapY', { root }).why, /assigned outside its owner/, 'a reassigned global and an import binding would part');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('⑤ --factories: a registration becomes an export, an eager caller imports it, a lazy file is never pulled in statically', () => {
  const root = tree({
    'index.html': page,
    'src/main.js': "import '../js/eager.js';\nimport '../js/shell.js';\n",
    'js/eager.js': 'window.IntMapModules=window.IntMapModules||{};\nwindow.IntMapModules.eager=function(HOST){ return HOST.n; };\n',
    'js/lazyf.js': 'window.IntMapModules=window.IntMapModules||{};\nwindow.IntMapModules.lazyf=function(HOST){ return 2; };\n',
    'js/shell.js': "window.go=function(IM_HOST){ return window.IntMapModules.eager(IM_HOST); };\nwindow.later=()=>import('./lazyf.js').then(()=>window.IntMapModules.lazyf({}));\n",
  });
  try {
    const r = migrateFactories({ write: true, root });
    assert.equal(r.factories, 2);
    assert.match(read(root, 'js/eager.js'), /^export function eager\(HOST\)\{ return HOST\.n; \}/m);
    assert.doesNotMatch(read(root, 'js/eager.js'), /IntMapModules/, 'the registry init goes with it');
    assert.ok(r.problems.some((p) => /lazy js\/lazyf\.js/.test(p)), 'a static import of a lazy factory is refused and reported');
    assert.match(read(root, 'js/shell.js'), /window\.IntMapModules\.lazyf/, 'the refused file is left untouched, whole');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('⑥ --entry: a line that only declares leaves the entry; a line that does something stays, with its reason', () => {
  const root = tree({
    'index.html': page,
    'src/main.js': "import '../js/pure.js';\nimport '../js/effect.js';\nimport '../js/body.js';\n",
    'js/pure.js': 'export function pure(HOST) { return 1; }\nexport const K = 3;\n',
    'js/effect.js': "window.IntMapEffect = { on: true };\n",
    'js/body.js': "import { pure } from './pure.js';\nwindow.boot = () => pure({});\n",
  });
  try {
    const { lines } = entryPlan(root);
    const by = Object.fromEntries(lines.map((l) => [l.rel, l.keep]));
    assert.equal(by['js/pure.js'], '', 'pure and imported by js/body.js: it carries no order');
    assert.match(by['js/effect.js'], /does something/);
    assert.match(by['js/body.js'], /does something/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('⑦ ensureImport adds the edge once, after the existing imports, keeping the file\'s line ending', () => {
  const crlf = "import { a } from './a.js';   /* why */\r\nIntMapLang.t('x');\r\n";
  const once = ensureImport(crlf, 'js/f.js', 'IntMapLang', 'js/lang-registry.js');
  assert.equal(once, "import { a } from './a.js';   /* why */\r\nimport { IntMapLang } from './lang-registry.js';\r\nIntMapLang.t('x');\r\n");
  assert.equal(ensureImport(once, 'js/f.js', 'IntMapLang', 'js/lang-registry.js'), once, 'idempotent');
  assert.match(ensureImport("IntMapLang.define('xx', {});\n", 'js/locales/ui.xx.js', 'IntMapLang', 'js/lang-registry.js'),
    /^import \{ IntMapLang \} from '\.\.\/lang-registry\.js';\n/);
});

test('⑧ the real tree: no registry, no exported global read off window, and every entry line says why it stays', () => {
  const r = report();
  assert.equal(r.registrations, 0, 'window.IntMapModules stays dissolved');
  for (const g of exportedGlobals()) {
    const bad = g.readers.filter((x) => !x.exempt);
    assert.deepEqual(bad, [], `${g.name} is exported by ${g.owner}; read it by import`);
  }
  assert.ok(exportedGlobals().length >= 3, 'the four the migration started from are among the exported globals (a guard on the walk itself)');
  const { lines } = entryPlan();
  const loose = lines.filter((l) => !l.keep).map((l) => l.rel);
  assert.deepEqual(loose, [], 'a src/main.js line that carries no order is listed by hand again — node scripts/module-graph.mjs --entry --write');
  assert.doesNotMatch(codeOnly(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')), /MODULE_FACTORIES/, 'the after-the-fact factory list is not back');
  const m = measure();
  for (const n of ['IntMapLang', 'IntMapTime', 'IntMapGeoEngine']) assert.equal(m.reads[n] || 0, 0, `${n} is read off window again`);
});

test('⑨ the AIS guard reads digits again: a real MMSI is kept, a key that names the prototype is not', async () => {
  /* Found while clearing CodeQL for this change: the #R801 guard read `/^d{1,9}$/` — the letter d —
     so every numeric MMSI was refused and the ship layer kept nothing, while the pollution alert it
     was written for stayed open. The store is a Map now and the guard reads `\d`. The function is
     lifted from the shipped factory (it lives in its closure) and run on the store it declares. */
  const { liftFunction } = await import('./helpers/lift-function.mjs');
  const src = codeOnly(readFileSync(new URL('../js/data-layers.js', import.meta.url), 'utf8'));
  const body = liftFunction(src, 'handleAIS');
  const shipsByMMSI = new Map();
  const handleAIS = new Function('shipsByMMSI', 'scheduleShipRefresh', body + '\nreturn handleAIS;')(shipsByMMSI, () => {});
  handleAIS({ MessageType: 'PositionReport', MetaData: { MMSI: 244123456, latitude: 52.1, longitude: 4.3 }, Message: { PositionReport: { Latitude: 52.1, Longitude: 4.3, Sog: 3 } } });
  assert.equal(shipsByMMSI.size, 1, 'a nine-digit MMSI is a ship');
  assert.equal(shipsByMMSI.get('244123456').lat, 52.1);
  handleAIS({ MessageType: 'PositionReport', MetaData: { MMSI: '__proto__', latitude: 1, longitude: 1 } });
  assert.equal(shipsByMMSI.size, 1, '«__proto__» is not an MMSI');
  assert.equal({}.lat, undefined, 'and nothing reached Object.prototype');
});
