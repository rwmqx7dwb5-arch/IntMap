/* ============================================================================
 *  THE RENDERER CONTRACT — what both engines implement, and the device-quality gates
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The engines need a real renderer (MapLibre / Cesium);
 *    what both declare and implement is read from the two facades.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #5 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 3 · Cesium poles: a live URL is not imagery when the network says no ────────────────────── */
test('R189 cesium: GIBS failure arms the bundled-floor fallback in map view', () => {
  const src = read('js/cesium-engine.js');
  assert.match(src, /this\._polarFallback=false;/, 'the fallback is armed only by an actual failure');
  assert.match(src, /band\.errorEvent\.addEventListener\(\(\)=>\{ if\(!this\._polarFallback\)\{ this\._polarFallback=true; this\._polarTreatment\(\); \}/,
    'a failed polar tile arms it');
  assert.match(src, /L\.show=this\._wantWorldBase\|\|fb;/,
    'the floor shows under the map basemap once armed (only the caps can show through)');
  /* and the perf default that was never set — preloadSiblings was tried and withdrawn (it changes
     what globe.tilesLoaded MEANS; CI measured r180 ⑥ / r184-fs ② timing out because of it) */
  assert.match(src, /this\._globe\.tileCacheSize=_mob\?320:768;/, 'the tile cache is no longer the default 100');
  assert.ok(!/preloadSiblings=true/.test(src), 'preloadSiblings stays withdrawn');
});
}

/* ═══ from tests/r193-checks.test.mjs (tests #6 of 9) ═══
    R193 — source contracts. The parts that can be proved without a renderer. */
{
const R = path.resolve(import.meta.dirname, '..');

test('R193 ⑥ both engines implement the dynamic-image primitive', () => {
  const g = read('js/geo-engine.js'), c = read('js/cesium-engine.js');
  for (const fn of ['addDynamicImage', 'touchDynamicImage', 'setDynamicImageOpacity', 'removeDynamicImage']) {
    assert.ok(g.includes(fn), 'geo-engine has ' + fn);
    assert.ok(c.includes(fn), 'cesium-engine has ' + fn);
  }
  /* the Cesium side MUST alternate canvases — a material image is compared by identity */
  assert.match(c, /rec\.at=next;/, 'Cesium hands back a different canvas object each touch');
  assert.match(c, /cv:\[mk\(\),mk\(\)\]/, 'which is why it keeps two');
});
}

/* ═══ from tests/r202-checks.test.mjs (tests #8, #9, #13, #14 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

/* ── ③ THE SEAMS ──────────────────────────────────────────────────────────────────────────── */
test('R202 ③a orbit3d: declared by both engines, implemented by both, reached only through the contract', () => {
  const ge = rd('js/geo-engine.js'), ce = rd('js/cesium-engine.js');
  assert.match(ge, /orbit3d:true/, 'MapLibre declares it');
  assert.match(ce, /orbit3d:true/, 'and so does Cesium');
  for (const m of ['addOrbit', 'setOrbit', 'removeOrbit', 'projectMercAlt']) {
    assert.match(ge, new RegExp(`${m}\\s*\\(`), `js/geo-engine.js implements ${m}`);
    assert.match(ce, new RegExp(`${m}\\s*\\(`), `js/cesium-engine.js implements ${m}`);
  }
  /* the custom layer is the ADAPTER's business — nothing outside geo-engine may name it (#R173) */
  const users = ['js/satellites-live.js', 'js/data-layers.js', 'js/app-body.js']
    .filter((f) => /IntMapModules\.orbitPoints/.test(rd(f)));
  assert.deepEqual(users, [], `only js/geo-engine.js may reach for the orbit layer; ${users} does`);
});

test('R202 ③b the pick projects at ALTITUDE, or it picks something that is not on screen', () => {
  const s = rd('js/satellites-live.js');
  assert.match(s, /projectMercAlt/, 'pickAt goes through the batched altitude projection');
  assert.match(s, /orbMercAlt|orbRate/, 'and it holds the same mercator/altitude triples the layer drew');
  /* the rate has to exist for the layer to move between propagations */
  assert.match(s, /lng2/, 'propagateAll carries the one-second-later fix');
  assert.match(s, /eciToGeodetic\(\{x:pv\.position\.x\+pv\.velocity\.x/, 'derived from the ECI velocity, not a second SGP4');
});

/* ── ③f THE GESTURE-TIME RESOLUTION CUT IS GONE (#R229) ───────────────────────────────────────────
   This asserted that js/render-scale.js was mobile-only, deferred and correctly armed — three rounds
   (#R202, #R221, #R227) refined HOW it lowered the map's resolution while the camera moved, and none
   of them asked WHETHER it should. Its own header quotes 「速度、画質を高めて。どちらか一方犠牲はNG」
   and then answers it by cutting the resolution to 70 % during every gesture, on the argument that
   splitting the trade in time is not a sacrifice. That argument was invented here, not agreed.
   「外せ」「なぜ確認しなかった」— the module is deleted and the map is always at full resolution. */
test('R202 ③f the gesture-time resolution cut is gone (#R229) and stays gone', () => {
  /* ⚠ the SYNTAX, not the mention — the comments that replaced this code name the thing they removed,
     which is the whole point of them (#R227's `code()` helper exists for the same reason) */
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/render-scale.js')), 'js/render-scale.js must not exist');
  assert.doesNotMatch(rd('src/main.js'), /import\s+['"][^'"]*render-scale\.js['"]/, 'nothing imports it');
  assert.doesNotMatch(rd('js/label-occlusion.js'), /IntMapModules\.renderScale\s*\(/, 'nothing mounts it');
});

test('R202 ③g the far plane is corrected from a PRISTINE value, never from its own output', () => {
  const ge = rd('js/geo-engine.js');
  assert.match(ge, /setHorizonReach/, 'the contract has it');
  assert.match(ge, /autoCalculateNearFarZ/, 'and it only multiplies while the transform is calculating automatically');
  assert.match(ge, /clearNearFarZOverride/, 'clearing first');
  assert.match(ge, /Math\.min\(60,mult\)/, 'with a ceiling, so depth precision has a floor');
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #4 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ③ the flat map wraps, and there is no other mode (#R297 removed the fixed extent) ────────── */
test('R223 ③ the flat map always renders world copies — the fixed-extent mode is gone', () => {
  /* ⚠ (#R298) THE SUBJECT MOVED, AND THE NEGATIVES HAVE TO MOVE WITH IT. The projection commands and
     the flat-pan rule left js/app-body.js for js/map-projection.js when the app shell hit its line
     budget (tests/r168 #8). Reading only the old file would leave the three 「…is gone」 assertions
     below asserting nothing at all — the exact failure mode this project keeps paying for — so the
     question is asked of BOTH halves of the subject. */
  const s = read('js/app-body.js') + '\n' + read('js/map-projection.js');
  /* #R223's own requirement (「平面地図の表示はデフォルトでは自由スクロールに」) is now unconditional */
  assert.match(s, /setRenderWorldCopies\(true\)/, 'a flat map always wraps');
  /* …and the mode it replaced is gone from the app, not merely defaulted away (#R297) */
  assert.ok(!/imFlatPan\s*=/.test(s), 'no imFlatPan state is written any more');
  assert.ok(!/flatPanSet/.test(s), 'the explicit-choice latch is gone with it');
  assert.ok(!/setting-flat-pan/.test(s), 'and nothing reads a Settings control for it');
  const html = read('index.html');
  assert.ok(!/setting-flat-pan|lblFlatPan/.test(html), 'the Settings row is removed from the markup');
  /* the compare map follows the main map rather than a setting that no longer exists */
  const c = read('js/compare.js');
  assert.ok(!/imFlatPan/.test(c), 'the compare map no longer consults the removed setting');
  assert.match(c, /function _cmpWorldCopies\(\)\{[^\n]*proj==='flat'\)/, 'it wraps whenever the main map is flat');
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #18 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('R232 mobile: the renderer quality gate asks the device, not the viewport width', () => {
  const b = read('js/app-body.js');
  /* ⚠ (#R498) RENAMED, NOT WEAKENED. The predicate is `_imPhoneClass` now because #R498 found five
     more phone COSTS still asking the 768 px width — the @2x tile decision, the canvas RAM guard,
     the DEM cache cap, the DEM viewport prefetch and the per-frame marker occlusion — so the name
     「this is a phone-class device」 outgrew 「this is a phone GPU」. The three properties #R232 is
     about are asserted here unchanged; the other five are in tests/r498-checks ③. */
  assert.match(b, /const _imPhoneClass=\(\)=>/, 'a device test exists');
  assert.match(b, /antialias:!_imPhoneClass\(\)/, 'MSAA follows the device');
  assert.match(b, /pixelRatio:\(_imPhoneClass\(\)\?Math\.min\(2,window\.devicePixelRatio\|\|1\)/, 'so does the DPR cap');
  assert.doesNotMatch(noJs(b), /antialias:!isMobile\(\)/, 'width no longer decides quality');
});
}

/* ═══ from tests/r234-checks.test.mjs (tests #13 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 7 · the hillshade's depth has one home, and the phone keeps its 13 ─────────────────────── */
test('R234 hillshade: one rule for DEM depth, raised only where something capped itself lower', () => {
  /* ⚠ the rule left the core — three files stream this bucket, so it is a module, not a closure
     variable inside the shell (and js/app-body.js has a hard line ceiling: tests/r200 ⑤). */
  const dem = read('js/dem-source.js');
  assert.match(dem, /function maxZoom\(\) \{ return isPhoneGPU\(\) \? 13 : 15; \}/, 'one place decides the DEM depth');
  assert.match(dem, /window\.IntMapDem = API; window\.__imDemMaxZoom = maxZoom;/, 'and it is published for the other callers');
  assert.equal(dem.match(/terrarium\/\{z\}\/\{x\}\/\{y\}\.png/g).length, 5, 'the five host aliases came with it (#R7)');
  const ab = read('js/app-body.js');
  assert.match(ab, /^import \{ makeDemSource \} from '\.\/dem-source\.js';$/m, 'the shell imports it');
  assert.match(ab, /addSource\('terrain-dem',_IM_DEM\.spec\(\)\)/, 'the main map reads it');
  assert.ok(!/'https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium/.test(ab),
    'and the shell no longer carries a second copy of the host list');
  /* the two that had capped themselves below the main map */
  assert.match(read('js/compare.js'), /maxzoom:\(window\.__imDemMaxZoom\?window\.__imDemMaxZoom\(\):13\)/,
    'the comparison map asks instead of pinning 13');
  assert.match(read('js/cesium-engine.js'), /maxzoom:Math\.min\(15,this\._dem\.maxzoom\(\)\)/,
    'the Cesium hillshade is no longer clamped a level below the DEM it is given');
  /* ⚠ the phone is UNCHANGED — this round's first instruction is that it must get faster */
  assert.ok(!/_imPhoneClass\(\)\?1[45]:/.test(ab), 'no phone-side DEM depth was raised');   /* (#R498) _imPhoneGPU → _imPhoneClass */
});
}
