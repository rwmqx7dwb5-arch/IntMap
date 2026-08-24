/* ============================================================================
 *  #R209 — RUNTIME CODE-SPLITTING: the source-level half
 * ----------------------------------------------------------------------------
 *  「ソースは110本のJSファイルに分割されていますが、src/main.jsは86本を起動時に直接importして
 *    います。…つまり現在の分割は『保守しやすいファイル分割』が中心で、『必要になった機能だけ
 *    取得する実行時分割』はまだ浅いです。」
 *
 *  This file guards the two things that make the split real rather than nominal, and BOTH of them
 *  are guards against the same failure: a feature that silently stops existing.
 *
 *    ① every module js/lazy-modules.js fetches is out of the entry, has an entry point that awaits
 *       it, and is named in src/main.js's LAZY_FACTORIES so one list still knows every factory;
 *    ② every `turf.<name>` the source calls is actually on the object src/vendor.js publishes —
 *       because naming the imports is what let the bundler drop the rest, and a call to a function
 *       that is no longer named is now a runtime TypeError instead of working.
 *
 *  The browser half is tests/r209.spec.js: it asks for all eight modules and asserts the loader's
 *  own failure record is empty.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as acorn from 'acorn';
import { lazyFiles } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const R = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const entry = R('src/main.js');
const loader = R('js/lazy-modules.js');
const LAZY = lazyFiles(root);

/* comment- and string-blanked source, so a rule never matches its own prose (#R208, and twice more
   in this round: the reachability scan and the factory-call counter both read comments). */
function code(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}

test('R209 ①: the loader fetches a real, non-empty set, and none of them is still in the entry', () => {
  assert.ok(LAZY.length >= 8, `js/lazy-modules.js should fetch the eight modules this round moved out; it names ${LAZY.length}`);
  for (const rel of LAZY) {
    assert.ok(existsSync(join(ROOT, rel)), `${rel} is import()-ed by the loader but does not exist`);
    /* ⚠ BOTH would "work". A file in src/main.js AND import()-ed is downloaded eagerly anyway, so the
       split would be a comment rather than a change — and nothing else in the suite would notice. */
    assert.ok(!entry.includes(`import '../${rel}';`),
      `${rel} is fetched on demand, so it must NOT also be in src/main.js — it would be downloaded at boot regardless`);
  }
});

test('R209 ②: the loader is a single top-level export, and every specifier is a literal', () => {
  const ast = acorn.parse(loader, { ecmaVersion: 'latest', sourceType: 'module' });
  const kinds = ast.body.map((n) => n.type);
  assert.deepEqual(kinds, ['ExportNamedDeclaration'],
    'js/lazy-modules.js must be exactly one exported factory — a top-level const/function would be a module-private binding the app cannot reach (tests/r175-checks)');
  /* The reachability gate reads LITERALS. A table keyed by name passes node --check, passes the
     browser and fails scripts/static-checks.mjs with "exists but nothing imports it" for every
     target at once — so pin the form here, where the message can say why. */
  const dyn = [...code(loader).matchAll(/import\(([^)]*)\)/g)].map((m) => m[1].trim());
  for (const spec of dyn) {
    assert.match(spec, /^'\.\/[A-Za-z0-9_.-]+\.js'$/,
      `every dynamic import in the loader must be a literal './name.js' in SINGLE quotes — scripts/static-checks.mjs:318 sees no other form. Got: ${spec}`);
  }
});

test('R209 ③: every lazy factory is named in LAZY_FACTORIES, and in no other list', () => {
  const m = /const LAZY_FACTORIES = \[([^\]]*)\]/.exec(entry);
  assert.ok(m, 'src/main.js declares LAZY_FACTORIES');
  const lazyKeys = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const eager = /const MODULE_FACTORIES = \[([\s\S]*?)\]/.exec(entry)[1];

  /* Derived from the loader, not written down again: the factory keys it mounts. */
  const mounted = [...code(loader).matchAll(/window\.IntMapModules\.(\w+)\(/g)].map((x) => x[1]);
  assert.ok(mounted.length >= 7, 'the loader mounts the factories it fetches');
  for (const k of mounted) {
    assert.ok(lazyKeys.includes(k), `${k} is mounted by the loader, so src/main.js must list it in LAZY_FACTORIES`);
    /* ⚠ THIS IS THE ONE THAT GOES RED FIRST IF SOMEBODY "FIXES" A FAILING BOOT GUARD BY PUTTING THE
       KEY BACK. The boot guard runs before any of these files is fetched, so a lazy key in
       MODULE_FACTORIES makes __imModuleCheck.missingFactories non-empty on every clean load, and
       eight browser specs assert it is empty. */
    assert.ok(!new RegExp(`'${k}'`).test(eager),
      `${k} is fetched on demand — it must not be in MODULE_FACTORIES, where the boot guard would report it missing on every load`);
  }
  for (const k of lazyKeys) {
    assert.ok(mounted.includes(k) || k === 'nightSky',
      `LAZY_FACTORIES names ${k}, but js/lazy-modules.js never mounts it — the list has drifted from the loader`);
  }
});

test('R209 ④: every entry point to a lazy feature awaits the loader first', () => {
  /* The whole risk of on-demand loading is a click that reaches a global which has not arrived. The
     eight modules have exactly these doors, and each one must go through IntMapLazy.need(). */
  const DOORS = [
    ['js/tool-panel.js', 'streetView'], ['js/tool-panel.js', 'los'], ['js/tool-panel.js', 'terrainWater'],
    ['js/tool-panel.js', 'seismic'], ['js/tool-panel.js', 'nightSky'],
    ['js/app-body.js', 'playground'], ['js/playground.js', 'flightSim'],
    ['js/session-tabs.js', 'flightSim'], ['js/aircraft-detail.js', 'flightSim'],
    /* two that are NOT buttons, and both would have degraded silently rather than failed:
       js/analysis-panels.js's Learn card opens the playground; js/drone-ops.js's radio-link budget
       IS window.IntMapLOS._phys, read from a SYNCHRONOUS hazard callback, so it is asked for in
       prepare() — the one async step that always precedes a plan. */
    ['js/analysis-panels.js', 'playground'], ['js/drone-ops.js', 'los'],
    ['js/atlas-console.js', 'los'], ['js/atlas-console.js', 'streetView'], ['js/atlas-console.js', 'flightSim'],
    ['js/atlas-console.js', 'terrainWater'], ['js/atlas-console.js', 'seismic'],
    ['js/atlas-console.js', 'nightSky'], ['js/atlas-console.js', 'tsunami'], ['js/atlas-console.js', 'playground'],
    /* (#R395) Atlas can now open a volcano's record by name, so it is a door onto volcanoIntel too.
       ⚠ THE DOOR IS IN js/atlas-controls.js, NOT THE DISPATCH: js/atlas-console.js's line ceiling
       only ever comes down (#R199/#R318) and it was full, so the answer moved next to the other
       control-surface helpers and the switch kept one `case` label. */
    ['js/atlas-controls.js', 'volcanoIntel'],
  ];
  for (const [file, name] of DOORS) {
    assert.ok(code(R(file)).includes(`IntMapLazy.need('${name}')`),
      `${file} opens the ${name} feature, so it must await window.IntMapLazy.need('${name}') first — otherwise the click reaches a global that has not been downloaded`);
  }
});

test('R209 ⑤: the loader reports a failure rather than swallowing it', () => {
  const c = code(loader);
  assert.match(c, /window\.__imLazyCheck/, 'the loader keeps a record the browser test can read');
  assert.match(c, /console\.error/, 'and says so loudly — a module that did not arrive must not be silent (#R162, #R205)');
  /* the two things that can go wrong AFTER the bytes arrive, both checked at load time because the
     boot guard can no longer check them at boot */
  assert.match(c, /registered no IntMapModules\./, 'it checks the factory registered');
  assert.match(c, /nothing was published on window\./, 'and that the global the module owns appeared');
});

test('R209 ⑥: every turf function the app calls is on the object src/vendor.js publishes', () => {
  /* Naming the imports is what let the bundler drop 150 kB (gzipped) of @turf from the boot path.
     The cost of naming them is that `turf.somethingElse(…)` is now a TypeError at runtime instead
     of quietly working — so the set of names is derived from the CALLS and checked against the
     publication, in both directions. */
  const vendor = R('src/vendor.js');
  const pub = /window\.turf = \{([\s\S]*?)\n\};/.exec(vendor);
  assert.ok(pub, 'src/vendor.js publishes window.turf as an explicit object');
  const published = new Set([...code(pub[1]).matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*(?:,|$|\()/gm)].map((m) => m[1]));

  /* the two that arrive later, and the loader's own members — not "missing", deferred */
  const HEAVY = ['convex', 'buffer'];
  const LOADER = ['ensureHeavy', '_heavyP'];
  const called = new Map();          /* name → the files that call it */
  for (const dir of ['js', 'src']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.js'))) {
      if (dir === 'src' && f === 'vendor.js') continue;
      for (const m of code(R(`${dir}/${f}`)).matchAll(/\bturf\.([A-Za-z_$][\w$]*)/g)) {
        if (!called.has(m[1])) called.set(m[1], new Set());
        called.get(m[1]).add(`${dir}/${f}`);
      }
    }
  }
  const missing = [...called.keys()].filter((n) => !published.has(n) && !HEAVY.includes(n) && !LOADER.includes(n));
  assert.deepEqual(missing, [],
    `these turf functions are called but no longer bundled — add them to the named imports in src/vendor.js:\n  ${missing.join(', ')}`);

  /* …and the two heavy ones are NOT in the eager object, or the 332 kB comes straight back. Their
     callers are checked BY NAME rather than by count: a second caller that forgets to await
     ensureHeavy() would find them undefined, draw an unbuffered hull, and say nothing. */
  for (const n of HEAVY) {
    assert.ok(!published.has(n), `${n} reaches turf-jsts (332 kB) and must stay behind window.turf.ensureHeavy()`);
    for (const f of (called.get(n) || [])) {
      assert.match(code(R(f)), /turf\.ensureHeavy\(\)/,
        `${f} calls turf.${n}, which is not in the boot bundle — it must await window.turf.ensureHeavy() first`);
    }
  }
  assert.doesNotMatch(vendor, /from '@turf\/turf'/,
    "the umbrella package must not be imported: it declares no sideEffects, so even named imports from it ship every sub-module (measured — turf-jsts stayed in the chunk with neither of its callers imported)");
});
