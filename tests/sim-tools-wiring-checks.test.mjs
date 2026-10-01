/* ============================================================================
 *  IntMap · the simulator tools and what every new tool owes the app — a place to open it, an Atlas
 *  action and catalogue entry, a way to close it, attribution, a privacy sentence, and module hygiene
 *  (js/insolation.js, js/sims.js Sun panel, js/drone-nav.js, js/tool-panel.js, js/atlas-*.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r176-checks ③ ⑥, «the three simulators are in the right places» and
 *  «the new files are modules» (① ② ④ ⑤ went to the seam-coupling-and-camera, viewshed-los, terrain-water and
 *  seismic topic files; the build-stamp test is folded into tests/perf-startup-and-cache-checks).
 *
 *  #R176 — each subject encodes a defect that was MEASURED that round, so the assertion is written
 *  against the mechanism that fixes it rather than against a symptom.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';
import * as acorn from 'acorn';
import { lazyFiles, factoryCalls } from './app-source.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const index = R('index.html');
/* (#R178) the application body is TWO files now: js/geo-engine.js was carved out of app-body.js
   this round (the renderer adapter + the IntMapGeoEngine facade, moved verbatim), because the engine
   had been created inside map.on('load') and therefore did not exist when the modules — now written
   against it — run their factories. Every invariant below is about the same program, so `body` is
   still that program; it just spans both files. */
/* (#R322) …and THREE now: the camera geometry moved to js/camera-math.js when the renderer-command
   census pushed the shell over its line ceiling (tests/r168 #8). The functions are byte-identical to
   the versions that were in js/geo-engine.js, modulo the indentation of the move, so every invariant
   below asks the same question of the same program. */
const body = [R('js/app-body.js'), R('js/geo-engine.js'), R('js/camera-math.js')].join('\n');
/* the entry, src/main.js, is where the import graph below starts */
/* (#R209) …or fetched on demand. Every assertion below that reads the entry is asking one thing:
   "is this file REACHED — does the feature it carries exist at all?" Eight modules left the entry's
   list this round and are `import()`-ed by js/lazy-modules.js instead, so the same question is now
   asked of both loaders. The lazy list is DERIVED from that loader's own literal specifiers, which
   is the only place they can live (static-checks sees no other form), so this cannot drift. */
const LAZY = lazyFiles(root);
/* (module-graph) …and a file the entry no longer names is still REACHED when a module the entry
   imports imports it: src/main.js dropped the import lines of files app-body.js already imports. So
   «reached at start-up» is the static import graph from src/main.js, walked, not one file's text. */
const EAGER = (() => {
  const seen = new Set();
  for (const stack = ['src/main.js']; stack.length;) {
    const rel = stack.pop();
    if (seen.has(rel) || !existsSync(join(ROOT, rel))) continue;
    seen.add(rel);
    for (const st of acorn.parse(R(rel), { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      if ((st.type === 'ImportDeclaration' || ((st.type === 'ExportNamedDeclaration' || st.type === 'ExportAllDeclaration') && st.source))
        && st.source.value.startsWith('.')) stack.push(posix.join(posix.dirname(rel), st.source.value));
    }
  }
  return seen;
})();
const reached = (rel) => EAGER.has(rel) || LAZY.includes(rel);
/* …and the same for "is its factory instantiated": (module-graph) the factory is an export now, and
   app-body.js / the lazy loader CALL it by name with IM_HOST — factoryCalls() reads those calls off
   the AST (app-body's imported names, each lazy entry's mount). */
const FACTORIES = factoryCalls(root);
const instantiated = (file, name) => (FACTORIES[file] || []).includes(name);

const los = R('js/viewshed.js');
const water = R('js/terrain-water.js');
const quake = R('js/seismic.js');
const insol = R('js/insolation.js');
const sims = R('js/sims.js');
/* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
   The question below is unchanged; the read follows the answer to where it lives now. */
const atlas = (R('js/atlas-console.js') + '\n' + capsSource()) + '\n' + R('js/atlas-catalog-text.js');
const toolPanel = R('js/tool-panel.js');
const refs = R('js/reference-data.js');
/* (#R280) the policy TEXT is js/legal-text.js now — js/legal.js is the modal that renders it,
   and privacy.html / terms.html render the same string. What this file asserts is that the
   policy SAYS what the new tools send, so it has to read where the words are. */
const legal = R('js/legal-text.js');

/* ── ③ 「DronesはMeasureに置くな。どこにも置くな。」 ─────────────────────────────────────────── */
test('R176 ③: the drone launcher is gone from every menu, the planner is not', () => {
  /* ⚠ READ, NOT RUN: menus are index.html markup and the planner is reached through the eager shell and the Atlas kernel. */
  assert.doesNotMatch(index, /id="btn-tool-drone"/, 'not in the Measure dropdown');
  assert.doesNotMatch(index, /data-proxy="btn-tool-drone"/, 'not in the mobile tools sheet');
  assert.doesNotMatch(R('js/drone-nav.js'), /getElementById\('btn-tool-drone'\)/, 'and nothing hunts for the button any more');
  /* the feature itself is untouched — the user asked for the BUTTON to go, not the planner */
  assert.ok(EAGER.has('js/drone-nav.js'), 'the planner is still loaded');
  assert.ok(instantiated('js/drone-nav.js', 'droneNav'), 'and still instantiated');
  assert.match(body, /\bdroneNav\((IM_HOST)\)/, '…with the host');
  assert.match(atlas, /window\.IntMapDrone&&window\.IntMapDrone\.toggle\(\)/, 'and Atlas opens it directly now');
  assert.ok(capabilityEntry('drone'), 'the full drone action still exists');
});

/* ── ⑥ the sunlight engine ──────────────────────────────────────────────────────────────────────
   Measured on Mt Fuji: 38.9 % of the view in terrain shadow at a 10.7° winter-morning sun, 0 % at a
   77.7° summer noon; a valley floor in the Northern Alps gets 2,343 h of sun a year against 4,396 h
   with an open horizon. */
test('R176 ⑥: terrain shade is a sweep, and the year is read off a real horizon profile', () => {
  /* ⚠ READ, NOT RUN: the shade sweep reads DEM tiles and paints a canvas; the Sun panel is DOM. */
  assert.ok(existsSync(join(ROOT, 'js/insolation.js')), 'the engine has its own file');
  assert.ok(EAGER.has('js/insolation.js'), 'loaded by the Vite entry');
  assert.ok(instantiated('js/insolation.js', 'insolation'), 'and instantiated');
  assert.match(body, /\binsolation\((IM_HOST)\);/, '…with the host');
  assert.match(insol, /function shadowMask\(g,azCompass,altDeg\)\{/, 'the shadow is one pass over the grid');
  assert.match(insol, /M\[k\]=Math\.max\(z,S\);/, 'carrying max(z, S) along the ray — O(N²), not O(N² · ray)');
  assert.match(insol, /async function horizon\(lng,lat,o\)\{/, 'a point owns a 360° horizon profile');
  assert.match(insol, /const drop=d\*d\/\(2\*K\*R_EARTH\);/, 'with curvature and refraction, which decide the low winter sun');
  assert.match(insol, /function dni\(altDeg\)\{/, 'clear-sky beam via Kasten & Young air mass');
  assert.match(insol, /async function dayShadow\(date,o\)\{/, '冬至の影: the union of a whole day’s shade');
  /* the user asked for ONE sun tool, not two — the existing panel drives it */
  assert.match(sims, /panel\.querySelector\('\.sun-terr'\)\.onclick=\(\)=>toggleTerrain\(\);/, 'the terrain toggle is on the existing Sun panel');
  assert.match(sims, /panel\.querySelector\('\.sun-solst'\)\.onclick=\(\)=>solsticeShade\(\);/, 'and so is the solstice button');
  assert.match(sims, /terrainShadow:\(on\)=>\{/, 'exposed so Atlas and tests can drive it');
  assert.ok(/PV/.test(sims) && /発電可能時間/.test(sims), 'and the PV-usable hours are reported');
  /* the Sun panel bakes every label at construction and was built once, so a language switch left it
     in the old one — measured: the three new buttons stayed English after switching to JP */
  assert.match(sims, /window\.addEventListener\('intmap-lang',\(\)=>\{ if\(!panel\) return;[\s\S]{0,220}panel=null;/,
    'the panel is rebuilt when the language changes');
});

/* ── the wiring every new feature owes the app (standing instructions 3 and 4, and the Atlas rule) ── */
test('R176: the three simulators are in the right places, catalogued, and sourced', () => {
  /* ⚠ READ, NOT RUN: right-click menu, Atlas actions and catalogue, attribution and the privacy text are page wiring and prose. */
  /* NOT in the Measure menu — the whole point of ③ */
  assert.doesNotMatch(index, /btn-tool-(terrain|water|quake|seismic|sun)/, 'no new buttons were added to the toolbar');
  /* the map right-click menu, like Line of sight */
  assert.match(toolPanel, /window\.IntMapTerrainWater&&window\.IntMapTerrainWater\.open/, 'terrain & water is on the right-click menu');
  assert.match(toolPanel, /window\.IntMapSeismic&&window\.IntMapSeismic\.open/, 'and the seismic simulator');
  assert.match(toolPanel, /window\.IntMapSun\.analysePoint\(lngLat\.lng,lngLat\.lat\)/, 'and the sunlight analysis');
  /* Atlas: an action AND a catalogue entry, or the planner cannot reach it (#R115) */
  for (const [c, cat] of [['terrainWater', 'TERRAIN EDITING & WATER ROUTING'],
                          ['earthquake', 'SEISMIC WAVE SIMULATION'],
                          ['sunHours', 'SUNLIGHT HOURS & TERRAIN SHADE']]) {
    assert.ok(capabilityEntry(c), `Atlas implements ${cat}`);
    assert.ok(atlas.includes(cat), `and advertises ${cat} in the SYS catalogue`);
  }
  /* and a way to turn each of them off again (#R85) */
  assert.match(atlas, /window\.IntMapTerrainWater\.close\(\); did\.push/, 'clear knows about terrain & water');
  assert.match(atlas, /window\.IntMapSeismic\.close\(\); did\.push/, 'and the seismic overlay');
  assert.match(atlas, /window\.IntMapInsolation\) window\.IntMapInsolation\.clear\(\);/, 'and the terrain shade');
  /* every model that produces a number on screen is attributed (standing instruction 4) */
  for (const s of ['IASP91', 'Brune (1970)', 'Wald, Quitoriano', 'Kasten & Young'])
    assert.ok(refs.includes(s), `${s} is credited in the sources list`);
  assert.match(legal, /the seismic-wave simulator computes everything in your browser/, 'and the privacy page says what each new tool sends');
  assert.match(legal, /terrain-sculpting &amp; water-routing/, 'including the DEM the water simulator reads');
});

/* ── the split invariants every round since #R162 has to keep ─────────────────────────────────── */
test('R176: the new files are modules, with no top-level declarations', () => {
  for (const f of ['js/viewshed.js', 'js/terrain-water.js', 'js/seismic.js', 'js/insolation.js']) {
    const src = R(f);
    /* (#R232) parsed as a MODULE, because js/seismic.js now imports js/seismic-events.js — the
       published source parameters of the past earthquakes it can load. An ImportDeclaration is the
       one top-level form that cannot leak a global (it is module-private by definition, which is the
       whole mechanism #R175 rests on), so it is excluded rather than counted. */
    const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' });
    /* (module-graph) the factory is now `export function <name>(HOST)` instead of an assignment onto
       window.IntMapModules — an export is the module's declared interface, not a global, so it is
       excluded too, but ONLY when it is a function the app actually instantiates (factoryCalls). Any
       other export, or any other top-level declaration, still counts. */
    const isFactory = (n) => n.type === 'ExportNamedDeclaration' && n.declaration
      && n.declaration.type === 'FunctionDeclaration' && instantiated(f, n.declaration.id.name);
    const decls = ast.body.filter((n) => /Declaration$/.test(n.type) && n.type !== 'ExpressionStatement'
      && n.type !== 'ImportDeclaration' && !isFactory(n));
    assert.equal(decls.length, 0,
      `${f} must declare nothing at top level (module scope is private; ${decls.map((d) => d.type).join(',')})`);
    /* …and it must be reachable from the single entry point, or it simply does not run */
    assert.ok(reached(f), `${f} is imported by src/main.js, or import()-ed by js/lazy-modules.js`);
  }
});
