/* ============================================================================
 *  The boot graph: which js/ modules load when, the lazy-module registry, the Vite build and the launch screen
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r164-checks.test.mjs, tests/r190-checks.test.mjs, tests/r204-checks.test.mjs, tests/r175-checks.test.mjs, tests/r184-checks.test.mjs, tests/r304-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';
import { deadExports } from '../scripts/export-readers.mjs';
import { jsReachability } from '../scripts/js-reachability.mjs';
import { appShell, appSource, bootGuardKnows, lazyModules, publishedGlobals } from './app-source.mjs';
import { codeOnly, codeOnly as noComments } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r164-checks.test.mjs — 7 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が src/main.js・index.html・js/app-body.js（全モジュールとブラウザ用ライブラリを読み込む入口）で node では評価できない */
// R164 source-level regression checks — the third index.html split.
//
// #R162 moved the self-contained tables, #R163 the seven big feature modules. #R164 moves the six
// remaining ZERO-WRITE blocks (~545 KB): the data-layer catalogue/engine, the floating-window
// workspace, the widget board, the World-Bank choropleths, the beta overlays and the live-webcams
// layer. "Zero-write" was established by AST before extraction: none of these blocks assigns to any
// closure variable, so every dependency can be served by an IM_HOST getter — no setters needed.
//
// The load-bearing invariant is unchanged from #R162/#R163 and asserted again here for the new
// files: a module that reads a closure value which is REASSIGNED at runtime must read it through a
// live getter. A captured copy freezes at factory time, and because this codebase guards soft
// dependencies with `typeof X!=='undefined'` inside try/catch, the module then keeps "working"
// while silently reading a dead value. tests/r164.spec.js proves the live behaviour in a real
// browser; this file fixes the structure that makes it true.

const root = new URL('../', import.meta.url);
const rd = read;
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

/* Blank out comments and string/template literals so identifier scanning reads CODE only. */
function code(src) { return codeOnly(src, { literals: 'blank' }); }

/* The six modules this round extracted. `global` is set when index.html assigns the factory's
   return value; the bare-IIFE modules publish their own window.* surface from inside the body.
   `needle` is a string that lived only inside the moved block — it must be GONE from index.html. */
const MOVED = [
  { key: 'dataLayers', file: 'js/data-layers.js', global: null, needle: 'lyrEU:"EU members"' },
  { key: 'workspace', file: 'js/workspace.js', global: 'IntMapWorkspace', needle: 'window.IntMapWorkspace=(function(){' },
  { key: 'widgets', file: 'js/widgets.js', global: null, needle: 'Widget board v3' },
  { key: 'wbLayers', file: 'js/wb-layers.js', global: null, needle: 'refreshStatsLatest' },
  { key: 'betaOverlays', file: 'js/beta-overlays.js', global: null, needle: 'DeepStateMap' },
  { key: 'cameras', file: 'js/cameras.js', global: null, needle: 'otcmDone' },
];

/* Closure values the #R164 modules read that are REASSIGNED at runtime → must be host getters and
   must never appear as a bare identifier inside the new files. (lang/mode/countryGeo were already
   live members before this round; the other six getters are new in #R164.) */
const LIVE = {
  currentLang: 'lang', currentMode: 'mode', countryGeo: 'countryGeo',
  unitMode: 'unitMode', userTZ: 'userTZ',
  /* ⚠ (#R311) `mapTooltipEl` LEFT THIS LIST because it left the shell, not because the invariant
     was relaxed. The hover tooltip is js/map-tooltip.js now, so there is no closure variable in
     js/app-body.js to go stale — `IM_HOST.mapTooltipEl` is the #R198 DELEGATING getter, which
     tests/r163 #2 checks by shape and which holds no value at all. Testing it here would assert
     that a variable this file no longer has is still reassigned, i.e. it could only ever be red. */
  globalData: 'globalData', newsFeatures: 'newsFeatures', renderUI: 'renderUI',
};

test('R164 #1 each block was moved out, loaded, and instantiated at its original spot', () => {
  for (const { key, file, global, needle } of MOVED) {
    const src = rd(file);
    assert.ok(!html.includes(needle),
      `index.html must not still contain "${needle}" — a leftover in-page copy of ${file} would win`);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(src.includes(`window.IntMapModules.${key}=function(HOST){`),
      `${file} declares the ${key} factory taking (HOST)`);
    const call = global
      ? `window.${global}=window.IntMapModules.${key}(IM_HOST);`
      : `window.IntMapModules.${key}(IM_HOST);`;
    assert.ok(html.includes(call), `index.html instantiates ${key} with the shared host at the original position`);
  }
});

test('R164 #2 INVARIANT: every reassigned closure value the new modules read is a LIVE getter', () => {
  // Prove the classification rather than trusting it: each of these is assigned somewhere in
  // index.html OUTSIDE its own declaration, so a captured copy would go stale. (renderUI's only
  // reassignment sits in the retired-ACLED block behind an early `return` — dead code — but the
  // getter costs nothing and stays correct if that block ever comes back to life.)
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

test('R164 #3 no new module reads a reassigned value as a bare identifier', () => {
  // The rewrite that makes #2 meaningful: inside js/, these names must only ever appear as
  // HOST.<prop>. A bare `currentLang` in a module file is exactly the #R162 silent failure.
  for (const { file } of MOVED) {
    const src = code(rd(file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const bare = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
      const hits = (src.match(bare) || []).length;
      assert.equal(hits, 0,
        `${file} still mentions ${name} as a bare identifier — it must read HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R164 #4 the parser-backed split-scope check passes (and covers the new files)', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R164 #5 the boot guard names every new factory, so one missing file cannot hide', () => {
  for (const { key } of MOVED) {
    assert.ok(new RegExp(`'${key}'`).test(html), `the boot guard lists the ${key} factory`);
  }
});

test('R164 #6 index.html actually shrank and no module body came back inline', () => {
  const lines = html.split('\n').length;
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(lines > 0);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});

test('R164 #7 the moved blocks stayed zero-write: no module assigns to a HOST member source', () => {
  // The whole reason these six could move with getters only. `HOST.x = …` or `HOST.x++` anywhere
  // in a module would silently write to a getter-only property (a no-op in sloppy mode inside
  // try/catch) — the write would just vanish. Keep the contract explicit.
  for (const { file } of MOVED) {
    const src = code(rd(file));
    const writes = src.match(/HOST\.[A-Za-z_$][\w$]*\s*(?:=(?!=)|\+\+|--|[+\-*/%&|^]=)/g) || [];
    assert.deepEqual(writes, [], `${file} writes through HOST — these members are getter-only: ${writes.join(', ')}`);
  }
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が src/main.js・index.html・js/app-body.js（全モジュールとブラウザ用ライブラリを読み込む入口）で node では評価できない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 6 · the launch screen ───────────────────────────────────────────────────────────────────── */
test('R190 boot: the default layers are fired at style-ready, and the screen waits for them', () => {
  const body = read('js/app-body.js');
  const m = /window\.__imBoot\.set\(80,'style'\);([\s\S]{0,3600}?)setTimeout\(settle,4000\);/.exec(body);
  assert.ok(m, 'the launch-screen block must still be one readable sequence');
  assert.ok(m[1].indexOf('__imFireDefaultLayers') < m[1].indexOf('GE().events.once(\'idle\',settle)'),
    'the layers are asked for BEFORE the first idle, so the downloads overlap');
  assert.match(m[1], /window\.__imLayerPainted&&window\.__imLayerPainted\(id\)/,
    'and the screen lifts on layers that are really on the map, not on ticked boxes');
  const dl = read('js/data-layers.js');
  assert.match(dl, /window\.__imLayerPainted=check;/, 'answered by the existing reconciler, not a second id table');
  /* ⚠ the ending NAMES are tests/r186's contract: exactly one of idle / timeout / no-renderer, because
     "a launch screen that lifts without saying why is the failure mode". Inventing `idle-timeout` and
     `layers-timeout` made a slow runner record NO recognised ending (measured in CI: layers at
     9,290 ms, escape at 12,134 ms). Which escape fired is said in the console instead. */
  for (const bad of ['idle-timeout', 'layers-timeout']) {
    assert.ok(!body.includes(`go('${bad}')`), `${bad} is outside the ending vocabulary r186 pins`);
  }
  assert.match(body, /const go=\(why\)=>\{ if\(ended\) return; ended=true; try\{ window\.__imBoot\.done\(why\|\|'idle'\)/,
    'and the default ending is one of them');
});
}

/* ══════════ from tests/r204-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（起動画面の CSS と index.html） */
/* (#R204) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */
const rd = read;

/* ── ② THE LAUNCH SCREEN IS EXACTLY WHAT #R186 ASKED FOR ─────────────────────────────────────
   ⚠ #R204 rebuilt this element on a WRONG DIAGNOSIS of 「起動したときに地図が真っ暗になっている場合が
   ある」: it found the launch screen sitting opaque over a drawn map on a slow network and split its
   backdrop out into a scrim. The user's environment is MapLibre and the report is 「地図の領域が全面
   まっ黒（何も見えない）」 — the MAP is black, not the cover. The change was reverted; what this test
   guards now is that it STAYED reverted, because #R186 asked for an opaque screen until ready and
   #R190 fixed it lifting early, and neither of those is this round's to trade away. */
test('R204 ② the launch screen is opaque until a milestone ends it, and nothing thins it early', () => {
  const html = rd('index.html'), css = rd('css/intmap.css'), body = rd('js/app-body.js');
  assert.match(css, /\.boot-splash\{[^}]*background:var\(--bg-color\)/, 'the cover paints, as #R186 asked');
  assert.doesNotMatch(css, /\.boot-back\b/, 'no separate scrim layer');
  assert.doesNotMatch(html, /boot-live|boot-back/, 'and no scrim state on the element');
  assert.doesNotMatch(body, /__imBoot\.live/, 'the app does not thin the cover');
  /* the endings #R190 made a contract are untouched */
  assert.match(body, /const go=\(why\)=>\{ if\(ended\) return; ended=true; try\{ window\.__imBoot\.done\(why\|\|'idle'\)/);
  assert.match(html, /no ready signal after 20 s/, 'and the failsafe is still there');
});
}

/* ══════════ from tests/r175-checks.test.mjs — 9 of its 16 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が src/main.js・index.html・js/app-body.js（全モジュールとブラウザ用ライブラリを読み込む入口）で node では評価できない（到達可能性・export の読み手・split-scope は scripts/ の導出を実行している） */
/* ============================================================================
 *  R175 source-level checks
 * ----------------------------------------------------------------------------
 *  Three subjects this round:
 *    ① the eye-anchored tilt must DOLLY on zoom instead of freezing the look-at target's altitude
 *    ② the hover tooltip must be clamped as the box it really is, and the aircraft detail card exists
 *    ③ the Vite migration's load-bearing invariants — the ones that, if they quietly stopped holding,
 *       would break the whole app at build time rather than at review time
 * ==========================================================================*/

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const html = appSource(root);
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
const vendor = readFileSync(join(ROOT, 'src/vendor.js'), 'utf8');
const jsFiles = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort();

/* ── ③ the Vite migration's invariants ───────────────────────────────────────────────────── */
test('R175 ③: every js/ module is imported by the entry, in index.html’s old order', () => {
  const { imported, dyn, sib, isReachable } = jsReachability(ROOT, jsFiles);
  /* (#R180) …plus the ones a reachable module imports DYNAMICALLY. The claim this test makes —
     no js/ module is unreachable, i.e. no feature silently does not exist — is unchanged. What
     changed is that a module can be reachable on purpose without being in the static graph:
     the second rendering engine is loaded by `import('./cesium-engine.js')` from
     js/engine-select.js precisely so a MapLibre session (the default) transfers none of its
     4.8 MB, and putting it in src/main.js would undo that. A file nothing imports at all still
     fails, which is the case worth catching. */
  /* (#R341) THE FIVE FORMS OF REACHABILITY ARE DERIVED IN ONE PLACE NOW.
     This test and scripts/static-checks.mjs §8 ask the same question — is this js/ module dead
     code? — and each used to carry its own copy of the answer. The copies drifted the moment a new
     FORM appeared: #R341 added a worker in src/ that imports js/ modules, taught static-checks
     about it, and this test went red on two files that are demonstrably alive. That is the #R318
     shape, one level down. scripts/js-reachability.mjs is the single derivation; adding a sixth
     form is now one edit rather than two that must be kept identical. */
  for (const f of jsFiles) assert.ok(isReachable('js/' + f),
    `js/${f} is never imported by src/main.js, no reachable module import()s it, no page loads it, and no src/ worker imports it`);
  for (const rel of imported) assert.ok(existsSync(join(ROOT, rel)), `src/main.js imports ${rel}, which does not exist`);
  for (const rel of dyn) assert.ok(existsSync(join(ROOT, rel)), `a js/ module dynamically imports ${rel}, which does not exist`);
  for (const rel of sib) assert.ok(existsSync(join(ROOT, rel)), `a js/ module imports ${rel}, which does not exist`);
  /* (#R178) js/geo-engine.js is imported FIRST, and that ordering is load-bearing: every module below
     is written against window.IntMapGeoEngine and calls it from its factory, which runs at import
     time. newsgeo stays first among the MODULES. */
  assert.equal(imported[0], 'js/geo-engine.js', 'the renderer contract is imported before anything can ask for it');
  /* (#R180) …and WHICH engine fills that contract is decided immediately after it, before
     js/app-body.js registers the DOMContentLoaded handler that builds the view. The order is
     load-bearing in the same way #R178's was: engine-select publishes the pending-engine
     promise that app-body's boot barrier waits on, and a handler registered before the
     promise exists would boot on MapLibre no matter what the user chose. */
  assert.equal(imported[1], 'js/engine-select.js', 'the engine choice is made before the app body can build a view');
  assert.equal(imported[2], 'js/newsgeo.js', 'newsgeo stays first among the feature modules');
  assert.equal(imported[imported.length - 1], 'js/app-body.js', 'the application body is imported LAST');
  assert.equal(new Set(imported).size, imported.length, 'no module is imported twice');
});

test('R175 ③: every export of a js/ module is reached by name from another file', () => {
  /* (#R795) THIS TEST USED TO ASK TWO THINGS, AND ONE OF THEM WAS A RULE ABOUT SHAPE.
     ① "no js/ module has an unexported top-level declaration" was the Vite migration's tripwire:
        a classic script's top-level `const` was a window global, a module's is private, so a
        declaration that appeared during the migration could silently change a name resolution.
        The hazard it guarded is "some file reads a bare name that resolves to nothing" — and that
        is what scripts/check-split-scope.mjs measures DIRECTLY, for every free identifier of every
        js/ file, with a scope-resolving parser (r168 #7 runs it). The ban outlived its reason and
        became a cost: js/gis-core.js and js/gis-runtime.js imported EACH OTHER so that each export
        had a js/ reader; js/runtime.js hung a Map off a function (`everyTick.pending`) because a
        module-scope `const` was forbidden; whole assemblers were wrapped in one closure to be one
        binding. None of that made the program safer. An ordinary module with private top-level
        functions is the normal thing this rule now permits.
     ② "every export is imported by name" is kept, as the property it always meant — an export no
        file reaches is dead code — but a READER is anything in the repository that reaches the
        name (js/, src/, scripts/, tests/), not only a js/ sibling: a headless entry point whose
        only caller is the test that proves it works headlessly is alive, and forcing a js/ import
        of it is how the cycle above was born. The derivation is scripts/export-readers.mjs. */
  const { dead } = deadExports(ROOT);
  assert.deepEqual(dead, [], 'exported but never reached by name from another file — dead code:\n' + dead.join('\n'));
});

test('R175 ③: no js/ module reads a name that resolves to nothing (the property the declaration ban stood for)', () => {
  /* (#R795) the replacement for the ban is not "nothing"; it is the free-identifier check, run here
     as well as in r168 #7 so that a reader of THIS file sees what holds the migration up. */
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R175 ③: index.html is markup again — the program is not inlined in it', () => {
  const inline = [...index.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].length);
  const biggest = Math.max(0, ...inline);
  assert.ok(biggest < 20000, `the largest inline <script> is ${biggest} bytes — a bundler cannot minify inline code`);
  assert.ok(index.length < 120000, `index.html is ${index.length} bytes; it was 566 KB before #R175 and must not grow back`);
  assert.match(index, /<script type="module" src="\/src\/main\.js"><\/script>/, 'one module entry');
  assert.doesNotMatch(index, /<script src="js\//, 'no classic js/ tags remain');
  assert.doesNotMatch(index, /<script[^>]*src="https:\/\/unpkg\.com/, 'the CDN library tags are gone');
  assert.doesNotMatch(index, /<script[^>]*src="https:\/\/cdn\.jsdelivr\.net/, 'and so are the jsDelivr ones');
});

test('R175 ③: the vendor shim republishes every global the CDN tags used to define', () => {
  for (const g of ['maplibregl', 'mlcontour', 'turf', 'topojson', 'supabase', 'sb', 'html2canvas', 'katex']) {
    assert.match(vendor, new RegExp(`window\\.${g}\\s*=`), `window.${g} must still exist — call sites read it by name`);
  }
  assert.match(vendor, /persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: \{ passkey: true \}/,
    'the Supabase client keeps the exact options it had inline');
  assert.match(vendor, /import\('html2canvas'\)/, 'html2canvas stays off the critical path');
  assert.match(vendor, /import\('katex'\)/, 'and so does KaTeX');
});

test('R175 ③: the pinned versions did not drift when they moved to npm', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  /* (maplibre-6-migration) EXACTLY PINNED, not a particular number: the adapter reaches renderer
     internals (the composed camera, its transform — js/geo-engine.js `_cam`/`_tr`), and a float would
     move them under it between two installs. The behaviour the pin used to stand for is measured by
     tests/maplibre-6-migration.spec.js and -checks.test.mjs on whatever version is installed. */
  assert.match(pkg.dependencies['maplibre-gl'], /^\d+\.\d+\.\d+$/, 'pinned EXACTLY since #R158 — camera-API behaviour depends on it');
  /* ⚠ maplibre-contour is EXACTLY PINNED, not «0.1.0». The literal was a copy of the version the CDN
     tag carried when #R175 moved it to npm, with no behaviour pinned to it (unlike maplibre-gl above);
     it went red on the first patch release (0.1.1, a fix for a tile buffer detached by the transfer to
     MapLibre's worker), which is a copy of the tree failing because the tree moved. What «did not
     drift» asserts is «cannot float» — and that the vendor shim's own list of versions still says
     what package.json says, which is the next test. */
  assert.match(pkg.dependencies['maplibre-contour'], /^\d+\.\d+\.\d+$/, 'maplibre-contour is pinned exactly');
  /* ⚠ EXACTLY PINNED, not a particular number — see the same note in tests/r156-checks. Both KaTeX
     and Vite moved this round to leave a published advisory behind; «did not drift» has always meant
     «cannot float», which is what an exact pin says and what a hard-coded version cannot check. */
  assert.match(pkg.dependencies['katex'], /^\d+\.\d+\.\d+$/, 'katex is pinned exactly');
  assert.match(pkg.devDependencies['vite'], /^\d+\.\d+\.\d+$/, 'vite is pinned exactly');
  assert.equal(pkg.dependencies['html2canvas'], '1.4.1');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.match(pkg.scripts.serve, /npm run build && node scripts\/serve\.mjs --root dist/, '`npm run serve` still means "the real site" — it just builds first');
});

test('R175 ③: the versions src/vendor.js names are the versions package.json declares', () => {
  /* The header of src/vendor.js lists `package@version → window.<global>` for every library it
     re-publishes. That list is prose, and prose that copies a version drifts on the next bump
     (measured: it said katex@0.16.11 while package.json declared 0.18.7). The declared spec is the
     truth — `npm ci` installs exactly it, and every exact pin above is asserted as such — so each
     entry is compared with it: an exact version must equal the pin; a bare major (`@2`) must be the
     pin's major. The list itself is read out of the header, not written here. */
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const header = vendor.slice(0, vendor.indexOf('*/'));
  const rows = [...header.matchAll(/^\s*\*\s+((?:@[\w.-]+\/)?[\w.-]+)@(\d+(?:\.\d+){0,2})\s+→/gm)];
  assert.ok(rows.length >= 1, 'the header lists the libraries it re-publishes');
  const wrong = [];
  for (const [, name, said] of rows) {
    const spec = declared[name];
    if (!spec) { wrong.push(`${name}@${said}: not a dependency in package.json`); continue; }
    const pinned = spec.replace(/^[\^~]/, '');
    const agrees = said.split('.').length === 3 ? said === pinned : pinned.split('.')[0] === said;
    if (!agrees) wrong.push(`${name}@${said}: package.json declares ${spec}`);
  }
  assert.deepEqual(wrong, [], 'src/vendor.js names a version package.json does not declare');
});

test('R175 ③: every root asset the site references is in the build’s copy list', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  const referenced = new Set();
  for (const m of index.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) referenced.add(m[1]);
  for (const m of html.matchAll(/['"]([\w-]+\.(?:png|jpg|woff2|json))['"]/g)) referenced.add(m[1]);
  const copied = new Set(STATIC_ASSETS);
  const missing = [];
  for (const r of referenced) {
    const clean = r.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    if (!clean || !/^[\w\-./]+$/.test(clean)) continue;
    if (clean.startsWith('src/') || clean.startsWith('js/') || clean.startsWith('css/')) continue;  // bundled
    if (!existsSync(join(ROOT, clean))) continue;                                                   // built by CI, e.g. build-info.json
    if (clean.endsWith('.png')) continue;                                                           // every root PNG is copied
    const topDir = clean.split('/')[0];
    if (!copied.has(clean) && !copied.has(topDir)) missing.push(clean);
  }
  assert.deepEqual(missing, [], 'these ship today but the Vite build would not copy them: ' + missing.join(', '));
  assert.ok(copied.has('sw.js') && copied.has('admin.html') && copied.has('data'));
});

test('R175 ③: production publishes the build output, not the sources', () => {
  const dep = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(dep, /run: npm run build/, 'the deploy builds');
  assert.match(dep, /cp -r dist\/\. _site\//, 'and publishes dist/');
  assert.doesNotMatch(dep, /git archive HEAD \| tar -x -C _site/, 'the raw-tree publish is gone');
  const pw = readFileSync(join(ROOT, 'playwright.config.js'), 'utf8');
  assert.match(pw, /npm run build && node scripts\/serve\.mjs --port \$\{PORT\} --root dist/,
    'the browser tests run against the built site, so a build-only failure cannot reach production');
});
}

/* ══════════ from tests/r184-checks.test.mjs — 2 of its 9 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が src/main.js・index.html・js/app-body.js（全モジュールとブラウザ用ライブラリを読み込む入口）で node では評価できない */
/* (#R184) the round's header note is kept with its largest block, in tests/layer-space-satellites-checks.test.mjs */

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

/* ── ① THE NEW MODULES ARE IMPORTED, INSTANTIATED AND GUARDED ─────────────────────────────── */
test('R184 #1: every new module is in the import graph, the factory guard and app-body', () => {
  const main = rd('src/main.js');
  const body = rd('js/app-body.js');
  /* ⚠ (#R311) THE TWO SATELLITE FILES ARE FETCHED ON DEMAND NOW, so "is it in the import graph" and
     "where is it instantiated" have different answers for them — js/lazy-modules.js rather than
     src/main.js + js/app-body.js. Both questions are still asked, of the file that now answers them,
     and the guard list is still one list (LAZY_FACTORIES is the deferred half of it). What is no
     longer asserted is that they are in the BOOT bundle, which this round made false on purpose:
     70 kB of SGP4 and 21 kB of detail card for a session that never ticks the satellite row. */
  const loader = rd('js/lazy-modules.js');
  const MODULES = [
    ['js/satellites-live.js', 'satellitesLive', true],
    ['js/satellite-detail.js', 'satelliteDetail', true],
    ['js/drone-ops.js', 'droneOps', false],
    ['js/routing-ops.js', 'routingOps', false],
  ];
  for (const [file, factory, lazy] of MODULES) {
    assert.ok(rd(file).length > 500, `${file} exists and has content`);
    const where = lazy ? loader : main, how = lazy ? `import('./${file.slice(3)}')` : `import '../${file}'`;
    assert.ok(where.includes(how), `${file} is ${lazy ? 'fetched by js/lazy-modules.js' : 'imported by src/main.js'}`);   /* the registry entry's load() carries the literal */
    if (lazy) assert.ok(!main.includes(`import '../${file}'`), `${file} is ALSO in src/main.js — it would be downloaded at boot regardless`);
    assert.match(rd(file), new RegExp(`IntMapModules\\.${factory}\\s*=`),
      `${file} declares exactly the factory the guard looks for`);
    /* the guard list — a file that fails to deploy must say so loudly (#R162/#R163) */
    assert.ok(bootGuardKnows(root, factory),   /* (#R798) the deferred list is the registry's, imported by the entry */
      `${factory} is in ${lazy ? 'LAZY' : 'MODULE'}_FACTORIES`);
    assert.match(lazy ? loader : body, new RegExp(`IntMapModules\\.${factory}\\(IM_HOST\\)`),
      `${factory} is instantiated once in ${lazy ? 'js/lazy-modules.js' : 'js/app-body.js'}`);
  }
  /* the pair travels together: the card must exist before the layer's click handler can find it */
  assert.ok(LAZY_REGISTRY.satellitesLive && (LAZY_REGISTRY.satellitesLive.also || []).includes('satelliteDetail'),   /* (#R798) the registry's `also` */
    'asking for the satellite layer must also bring its detail card — js/satellites-live.js calls it by name');
});

/* ── ⑤ EVERY NEW FILE PARSES, AND ADDS NO <style> ─────────────────────────────────────────── */
test('R184 #5: the new modules parse and keep the CSS rule', () => {
  /* comments blanked, because every one of these files SAYS "this file adds no <style>" in its
     header and the naive scan then reports the promise as the violation */
  const decomment = (s) => codeOnly(s);
  const FILES = ['js/satellite-detail.js', 'js/drone-ops.js', 'js/routing-ops.js'];
  for (const f of FILES) {
    const src = rd(f);
    assert.doesNotThrow(() => acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }), `${f} parses`);
    assert.ok(!/<style[\s>]|createElement\(\s*['"]style/.test(decomment(src)),
      `${f} adds no <style> — the CSS lives in css/intmap.css (#R162)`);
  }
  /* satellites-live.js is the one ES module among them (it imports satellite.js) */
  assert.doesNotThrow(() => acorn.parse(rd('js/satellites-live.js'), { ecmaVersion: 2022, sourceType: 'module' }),
    'js/satellites-live.js parses as a module');
});
}

/* ══════════ from tests/r304-checks.test.mjs — 4 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が src/main.js・index.html・js/app-body.js（全モジュールとブラウザ用ライブラリを読み込む入口）で node では評価できない（遅延モジュールの一覧は LAZY_REGISTRY と app-source の導出を実行している） */
/* ============================================================================
 *  IntMap · #R304 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round is about a tier of tests that ran every night, went red, and told nobody — and about
 *  two assertions inside it that were COPIES of facts rather than statements about them.
 *
 *    · js/lazy-modules.js knew eight modules when tests/r209.spec.js was written and ten by #R291.
 *      The spec said `toBe(8)`. It had been failing every night since the round that made it ten.
 *    · #R296 deleted three simulators on the user's instruction. tests/r166.spec.js went on
 *      demanding the globals they used to publish, and tests/r197.spec.js went on opening one of
 *      them. Both had been failing every night since that round.
 *    · The nightly itself was red on all fourteen runs from 2026-08-08 to 08-21 and `browser-gate`
 *      reported it honestly every time. Nobody was lied to; nobody looked.
 *
 *  So what is pinned here is (a) that the derivations those specs now read really do track their
 *  sources, and (b) that the nightly's verdict reaches a reader — an issue, and the command every
 *  session runs before it starts.
 *
 *  ⚠ THESE RUN IN `npm test`. A check that lives in a tier nobody watches is the disease, not the
 *  cure — which is why this file is in package.json's `test:checks` list in the same commit that
 *  creates it.
 * ==========================================================================*/
const rootURL = new URL('../', import.meta.url);
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that two dozen times; ask the question of the text that RUNS. */

/* ── ① THE LOADER'S TABLES ARE READABLE, AND THEY AGREE WITH THEMSELVES ───────────────────────
   Everything the two rewritten specs assert rests on this derivation working. If a round rewrote
   js/lazy-modules.js into a shape tests/app-source.mjs cannot read, `lazyModules()` would return an
   empty list and BOTH specs would pass vacuously — the exact failure this round exists to end. */
test('R304 ① every deferred module names a file and a global, both read out of the loader', () => {
  const L = lazyModules(rootURL);
  assert.ok(L.length >= 10, `js/lazy-modules.js declares ${L.length} modules — the derivation found nothing`);
  for (const m of L) {
    assert.ok(m.file && m.file.startsWith('js/'), `${m.name} names the file the loader import()s`);
    assert.ok(m.global && /^[A-Za-z_]/.test(m.global), `${m.name} names the global it must publish`);
    /* ⚠ EITHER THE MODULE OR THE LOADER PUBLISHES IT, and which one is a per-module fact:
       js/night-sky.js assigns its own global at import time, js/flight-sim.js returns an object that
       the loader's mount switch assigns. Both are 「the global arrived」; demanding the first shape
       would fail most of them for being written the way the loader asks them to be. */
    assert.ok(new RegExp('window\\.' + m.global + '\\s*=').test(read(m.file) + read('js/lazy-modules.js')),
      `js/lazy-modules.js or ${m.file} assigns window.${m.global}`);
  }
  const names = L.map((m) => m.name);
  assert.equal(new Set(names).size, names.length, 'no module is declared twice');
});

/* ── ② src/main.js's LAZY_FACTORIES IS THE LOADER'S LIST, MINUS THE ONE WITH NO FACTORY ───────
   That list exists so a deleted or renamed module still has somewhere to be missing from (its own
   comment says so), which only works while the two agree. It was checked in the browser by naming
   ONE member of it — and a list that is spot-checked drifts by exactly the members nobody named.
   Here rather than only in the deep tier, because this is a source fact and `npm test` can have it. */
test('R304 ② the boot guard names every deferred factory, and only those', () => {
  const L = lazyModules(rootURL);
  const want = L.filter((m) => m.factory).map((m) => m.name).sort();
  /* (#R798) the entry imports the list from the registry; what is asserted is that the registry's
     factory-backed names — as lazyModules() derives them from the source — are what the entry ships */
  assert.match(read('src/main.js'), /const LAZY_FACTORIES = LAZY_NAMES\.slice\(\)/, 'src/main.js derives LAZY_FACTORIES from the registry');
  const got = LAZY_NAMES.slice().sort();
  assert.deepEqual(got, want, 'src/main.js\'s LAZY_FACTORIES equals the loader\'s factory-backed modules');
  /* ⚠ (#R347) THE EXCEPTION IS A TABLE NOW, NOT A NAME. This asserted `['nightSky']`, which was a
     copy of a rule js/lazy-modules.js wrote as `name !== 'nightSky'` — and the second module that
     publishes itself at import (js/navigation.js) loaded correctly, published all eight of its
     globals, and was still recorded as a FAILURE, because a rule written as one name can only ever
     describe one file. The loader now declares SELF_PUBLISHING, so this reads that instead of
     naming the members: the fact under test is «the two lists agree», not «there is exactly one».
     ⚠ Derived from the loader, not typed here — a count is a copy (this file's own ① says so). */
  const noFactory = L.filter((x) => !x.factory).map((x) => x.name).sort();
  /* (#R798) the exemption is the `self: true` flag of the registry entry, read from the same object */
  const declared = Object.keys(LAZY_REGISTRY).filter((n) => LAZY_REGISTRY[n].self === true).sort();
  assert.deepEqual(noFactory, declared,
    'the modules with no factory are exactly the ones the loader exempts from having one');
  assert.ok(declared.includes('nightSky'), 'and the original one is still among them');
});

/* ── ③ THE MOVED-BLOCK GLOBALS FOLLOW THE SOURCE, INCLUDING WHEN A FEATURE IS DELETED ─────────
   The #R296 deletions are the concrete case: the derived list must NOT contain them, and must still
   contain the ones that stayed. A derivation that returned everything, or nothing, would pass one
   of those and fail the other — so both directions are asserted. */
test('R304 ③ publishedGlobals() tracks js/, in both directions', () => {
  const FILES = ['js/map-ui.js', 'js/map-tools.js', 'js/weather.js', 'js/layer-packs.js',
    'js/analysis-panels.js', 'js/sims.js', 'js/playground.js', 'js/viewshed.js', 'js/dash-extended.js'];
  const t = publishedGlobals(rootURL, FILES);
  for (const f of FILES) assert.ok(Object.keys(t[f] || {}).length > 0, `${f} contributed factories`);
  const all = new Set(Object.values(t).flatMap((f) => Object.values(f).flat()));

  /* deleted by #R296 — 「電波・通信圏と見通し線解析を統合」/「4つのうち…全削除」/「存在意義が不明」 */
  for (const g of ['IntMapRF', 'IntMapDisaster', 'IntMapEarthReplay'])
    assert.ok(!all.has(g), `${g} was deleted, so nothing derives it any more`);
  /* still there, and each is a different SHAPE of publication the walk has to handle:
     a bare statement, an assignment from an IIFE, and one made inside an IIFE two levels down */
  for (const g of ['IntMapLayers', 'IntMapSun', 'IntMapLOS', 'IntMapBeta2', '_imPlacePopup', 'IntMapOverlays'])
    assert.ok(all.has(g), `${g} is still published by a factory, and the walk sees it`);
  assert.ok(all.size > 40, `the derived list is ${all.size} globals — it has not collapsed`);
});

/* ── ④ NO SPEC COUNTS THE DEFERRED MODULES ANY MORE ───────────────────────────────────────────
   The literal defect: `expect(s.names.length, …).toBe(8)`. Asked of the code that runs, so the
   sentence above explaining what went wrong does not trip it. */
test('R304 ④ the lazy-module list is derived wherever it is asserted, never counted', () => {
  /* (consolidation) the #R209 node checks now live in tests/atlas-console-kernel-checks.test.mjs */
  for (const f of ['tests/r209.spec.js', 'tests/atlas-console-kernel-checks.test.mjs']) {
    const src = noComments(read(f));
    assert.doesNotMatch(src, /names\(\)[^\n]*\.length[^\n]*(toBe|equal)\(\s*\d+/,
      `${f} must not assert a COUNT of the loader's modules`);
    assert.doesNotMatch(src, /\.names\s*\)?\.length\s*,[^\n]*\)\s*\.toBe\(\s*\d+\s*\)/,
      `${f} must not assert a COUNT of the loader's modules`);
  }
  assert.match(read('tests/r209.spec.js'), /lazyModules\(/, 'tests/r209.spec.js reads the loader instead');
  assert.match(read('tests/r166.spec.js'), /publishedGlobals\(/, 'tests/r166.spec.js reads the factories instead');
});
}
