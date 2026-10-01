/* ============================================================================
 *  IntMap · the sky over the globe — the limb, the sky model, and who owns the rim
 *  (js/sky-model.js, js/limb-layer.js, js/theme-sky.js, js/geo-engine.js's limb contract)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r227-checks, tests/r214-checks ⑤, tests/r224-checks ⑤ and
 *  tests/r270-checks ⑦.
 *
 *  #R227 — ① the limb is drawn by this app, and maplibre's own pass is off exactly where it draws
 *          ② the shader states no physics of its own — every coefficient arrives from js/sky-model.js
 *          ③ the sun ray is ONE integral, and both the CPU march and the GPU table call it
 *          ④ render-scale no longer waits for `idle` alone, and #R202's crash guards are intact
 *          ⑤ the model is published for the layer to read (the #R162 «nothing assigns it» trap)
 *  #R214 ⑤ — turning the day/night side off reaches the renderer that owns the light.
 *  #R224 ⑤ — the sky's grey-green horizon was the quadrature.
 *  #R270 ⑦ — «day/night off» was being read as «the Sun's position is unknown».
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { skyColour, sunOpticalDepth, skyModelTables } from '../js/sky-model.js';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = pathToFileURL(ROOT + '/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments in this project carry the reasoning, so a check that greps them proves nothing */
const code = (p) => codeOnly(read(p));
test('R227 ① the app draws the limb, and the renderer\'s own atmosphere is off where it does', () => {
  /* ⚠ READ, NOT RUN: the limb is a WebGL custom layer and the ownership gate reads the live renderer (globeness, eye altitude). */
  const layer = code('js/limb-layer.js');
  /* (module-graph) the factory is a module-private function handed to the seam at load —
     IntMapGeoEngine.provideLayerKind — where it used to be assigned onto window.IntMapModules */
  assert.match(layer, /function limbLayer\(\)\{/, 'js/limb-layer.js defines the factory');
  assert.match(layer, /\nIntMapGeoEngine\.provideLayerKind\('limbLayer',\s*limbLayer\);/,
    'js/limb-layer.js registers the factory the adapter looks for');
  assert.match(layer, /type:'custom'/, 'it is a custom layer, not a style layer');

  const eng = code('js/geo-engine.js');
  for (const fn of ['addLimb', 'setLimb', 'removeLimb', 'hasLimb']) {
    assert.ok(new RegExp('\\b' + fn + '\\s*[:(]').test(eng), fn + ' is part of the engine contract');
  }
  assert.match(eng, /provideLayerKind\(name,make\)\{ if\(typeof make==="function"\) _kinds\[name\]=make;/,
    'the adapter keeps the kinds it is handed');
  assert.match(eng, /_kinds\.limbLayer\(\)\.makeLayer\(/,
    'the adapter builds it, so a second engine answers the same intent its own way');
  /* ⚠ and it refuses on a CPU rasteriser. Measured: on SwiftShader the full-screen pass that decides
     which pixels are in the band took boot-to-loaded from 10.5 s to 46.5 s. On a GPU the same layer
     is CHEAPER than the renderer's own atmosphere (4.7 ms against 5.1). */
  assert.match(eng, /swiftshader\|llvmpipe\|software/,
    'a software rasteriser keeps maplibre\'s own halo rather than a per-pixel march');
  assert.match(eng, /limb=1/, 'and `?limb=1` forces it on, so the drawn band can be tested at all');

  /* ══ ⚠⚠⚠ (#R238b) THIS ASSERTION IS DELETED, NOT RELAXED — IT PINNED AN UNASKED REMOVAL ═══════════
     「一度つけてんのに勝手に外すな」. #R227 zeroed `atmosphere-blend` so its new layer would not add
     to maplibre's pass, and wrote this line to hold the zero in place. Diffing R226 against HEAD
     showed that zero was the ONLY thing in the sky block that ever reached a pixel on the globe —
     the five functions that produce #R213–#R222's band are byte-for-byte identical, so nothing about
     the band was lost except what carried it. A test that pins a removal nobody approved is a test
     that makes the removal permanent, which is exactly what happened here across five rounds.
     What #R227 was really FOR — the app draws the Earth's edge itself, on a context that can afford
     it — is asserted above and is untouched. The two now draw together. */
  const sky = code('js/theme-sky.js');
  assert.doesNotMatch(sky, /'atmosphere-blend':\(limb\?0:/,
    'the app\'s own band is not switched off to make room for the custom layer');
  assert.match(sky, /'atmosphere-blend':\(sat/, 'the #R187/#R205 ramps are what is written, in their pre-#R227 shape');
  assert.match(sky, /function _limbOwnsRim\(\)/, 'one predicate decides it');
  /* ══ ⚠⚠ (#R237) THIS ASSERTION'S CLAIM IS REVERSED ON PURPOSE, AND THAT IS THE ROUND ═════════════
     #R227 wrote «the eye above the shell — where a limb IS a limb», and it was right about the RING:
     you cannot see a limb from inside it. But the layer now draws the air IN FRONT of the planet too
     (js/limb-layer.js), and that is visible from anywhere — so the shell stopped being the boundary
     of what the layer has to say. Leaving the gate there is what produced
     「ある程度までズームインすると途端に見えなくなってしまう」: measured on a zoom sweep, ownership
     flipped between z9 (eye 183 km) and z10 (eye 92 km), and what it flipped TO was maplibre's own
     pass, which measures 2 px wide at luminance 14. The air went out in one frame at a fixed zoom.
     The gate is `globeness` now — the SAME quantity maplibre multiplies its own atmosphere by — so
     the two owners cannot disagree about when there is a globe, and there is no zoom at which the
     air switches off in a step. #R227's real requirement, «only claim the rim where the layer can
     actually draw», is unchanged and is what this now checks. */
  assert.doesNotMatch(sky, /_eyeAltM\(\)>_ATM_TOP_M[\s\S]{0,40}return false/,
    'the 100 km cliff is gone from the ownership test');
  assert.match(sky, /if\(!\(_globeness\(\)>0\)\) return false/,
    'and what decides it is whether there is a globe, which is maplibre’s own gate');
  assert.match(sky, /_sunElevAtCentre\(\)==null\) return false/,
    'with the day/night display off or on the vector map the Sun is unknown, and #R221\'s gate still wins');
  /* …and the rim owner has to be part of what makes the sky block worth re-parsing, or a camera
     that climbs without the Sun moving would leave both halos drawn, or neither */
  assert.match(sky, /limb===_applySkyAtmosphere\._limb/,
    '_skyFollowCamera compares who owns the rim, not only the two colours');
});

test('R227 ② the shader restates no physics — the numbers come from js/sky-model.js', () => {
  /* ⚠ READ, NOT RUN: the GLSL is compiled only by a GPU context; the uniforms and the absence of literals are asked of its text, the tables are imported and run. */
  const layer = code('js/limb-layer.js');
  /* every coefficient the march needs is a uniform */
  for (const u of ['u_BR', 'u_BO', 'u_BM', 'u_HR', 'u_HM', 'u_RG', 'u_RT',
    'u_sunI', 'u_exposure', 'u_gamma', 'u_g', 'u_o3Peak', 'u_o3Half']) {
    assert.ok(layer.includes(u), u + ' is a uniform rather than a literal');
  }
  /* and none of them is ALSO written down here. These are the values js/sky-model.js owns; a copy
     in the shader is how the drawn limb and the computed sky start to disagree (#R226). */
  for (const lit of ['5.8e-6', '13.5e-6', '33.1e-6', '21e-6', '0.650e-6', '1.881e-6', '0.085e-6',
    '6371000', '6471000', '0.76', '25000.0', '15000.0']) {
    assert.ok(!layer.includes(lit), 'the shader does not restate ' + lit);
  }
  const T = skyModelTables();
  assert.deepEqual(T.BR, [5.8e-6, 13.5e-6, 33.1e-6], 'and the tables are where they live');
  assert.equal(T.RT - T.RG, 100000, 'the shell the sun table is built over is the model\'s own');
  assert.ok(Array.isArray(T.ms.data) && T.ms.data.length === 16 && T.ms.data[0].length === T.ms.n,
    'the multiple-scattering table is handed over as it stands (16 heights × 24 Sun elevations)');

  /* the march has to be fine enough that the limb is not the lilac #R226 measured at N = 32 */
  const m = layer.match(/MARCH_N\s*=\s*(\d+)/);
  assert.ok(m && Number(m[1]) >= 128, 'the view ray is marched at least as finely as #R226 measured 3 counts at');
});

test('R227 ③ the sun ray is one integral, called by both the CPU march and the GPU table', () => {
  const model = code('js/sky-model.js');
  assert.match(model, /export function sunOpticalDepth\(/, 'it is exported');
  assert.match(model, /const _od = sunOpticalDepth\(/,
    'skyColour\'s own march calls it rather than keeping a private copy');
  /* the loop it replaced must be gone: `odRs += ... * dts` appears exactly once in the file, inside
     the exported function itself */
  const n = (model.match(/odRs\s*\+=/g) || []).length;
  assert.equal(n, 0, 'the inner sun loop no longer exists inside radiance()');

  /* and it answers the physics: more air toward the horizon, none through the planet */
  const up = sunOpticalDepth(0, 90), flat = sunOpticalDepth(0, 5);
  assert.ok(up && flat && flat[0] > up[0] * 5,
    'a 5° Sun crosses far more air than one overhead');
  assert.equal(sunOpticalDepth(0, -20), null, 'and below the horizon the planet is in the way');
  assert.ok(sunOpticalDepth(60000, -5), 'while at 60 km the same elevation still sees the Sun');
});

/* (#R229) ④ used to assert that render-scale armed through three doors instead of one — #R227 made
   the resolution cut MORE reliable in the first 35 seconds, which is the window the reader is most
   likely to be looking at. The cut itself was never agreed to. The module is deleted. */
test('R227 ④ the gesture-time resolution cut is gone (#R229)', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/render-scale.js')), 'js/render-scale.js must not exist');
  assert.ok(!/renderScale/.test(read('src/main.js')), 'and nothing imports or mounts it');
});

test('R227 ⑤ the model is published, and what reads it is what publishes it', () => {
  /* ⚠ READ, NOT RUN: publication is a window assignment inside the renderer-bound theme factory and the engine adapter. */
  const sky = code('js/theme-sky.js');
  assert.match(sky, /window\.IntMapSkyModel\s*=\s*\{\s*tables:\s*skyModelTables,\s*sunOpticalDepth\s*\}/,
    'js/theme-sky.js assigns it — a window.X nothing assigns is the #R162 trap');
  assert.match(sky, /import \{[^}]*skyModelTables[^}]*\} from '\.\/sky-model\.js'/,
    'from the file that already imports the model');
  const eng = code('js/geo-engine.js');
  assert.match(eng, /window\.IntMapSkyModel/, 'and the adapter is the one that reads it');
  assert.match(eng, /if\(!\(S&&S\.tables&&S\.sunOpticalDepth\)\) return false/,
    'refusing to add a layer it cannot feed, rather than adding a blank one');

  /* the module has to be loaded at boot like the other two custom layers, or the factory is absent */
  const main = read('src/main.js');
  assert.match(main, /import '\.\.\/js\/limb-layer\.js'/, 'it is imported');
  /* (module-graph) the module guard's MODULE_FACTORIES list is gone: that import is a link — a missing
     file is refused at build — and the factory is present exactly when the module has evaluated,
     because evaluating it is what registers the kind (asserted in ① above). */
  assert.match(code('js/limb-layer.js'), /\nIntMapGeoEngine\.provideLayerKind\('limbLayer',\s*limbLayer\);/,
    'and evaluating it is what hands the factory over');

  /* the model still answers — this is the same march the shader mirrors */
  const c = skyColour(45, 0).rgb;
  assert.ok(c[2] > c[0], 'a sunlit sky is blue');
});

/* ══════════════════ #R214 ⑤ — the switch reaches the light ══════════════════ */
/* ═══ ⑤ THE DAY/NIGHT SWITCH REACHES THE THING THAT IS ACTUALLY DRAWING ═══════════════════════ */

test('R214 ⑤: turning the day/night side off reaches the renderer that owns it', () => {
  /* ⚠ READ, NOT RUN: the hand-off runs between three renderer-bound factories (night side, theme sky, app body). */
  const ns = read('js/night-side.js'), ts = read('js/theme-sky.js'), ab = read('js/app-body.js');
  /* ⚠ #R162's trap: a `window.X` nobody assigns makes the feature vanish silently inside a
     try/catch. Both ends of this hand-off are asserted, because only one of them is visible from
     either file. */
  assert.ok(/window\.IntMapThemeSky\s*=/.test(ts), 'js/theme-sky.js must publish the hook itself');
  /* ⚠ and NOT from js/app-body.js — tests/r200 ⑤ ratchets that file and eight lines broke it. */
  assert.ok(!/window\.IntMapThemeSky\s*=/.test(ab), 'the hook must not be published from the core file');
  assert.ok(/window\.IntMapThemeSky/.test(ns), 'js/night-side.js must use it when the switch flips');
  /* ⚠⚠ (#R215) THIS ASSERTION USED TO REQUIRE THE OPPOSITE, AND IT WAS WRONG. #R214 excused MapLibre
     on a stated argument — "its night side is a layer this module removes, and this light is only
     the fill-extrusion shading" — and the report came back a fifth time («オフにしてもオフにならない。
     MapLibre。»). The argument is half true: the layers really do go. But maplibre-gl's own
     atmosphere pass builds `u_sun_pos` FROM `style.light` (drawAtmosphere → getSunPos), so the globe's
     halo is itself bright over the day side and dark over the night side, and this app re-aims that
     light at the real Sun every sixty seconds. No engine is excused. Measured on MapLibre: on →
     anchor 'map' at the Sun's own azimuth/polar; off → anchor 'viewport' at the default [1.15,210,30]. */
  const aim = ts.slice(ts.indexOf('function _nightSideOff'), ts.indexOf('function _aimSun') + 700);
  assert.ok(!/_rendererLightsTheGlobe/.test(aim),
    'the un-aiming is unconditional — the engine gate is what left MapLibre lit (#R215)');
  assert.ok(/setSunDirection\(null\)/.test(aim), 'and it restores the default light rather than inventing one');
  /* …and it has to survive the periodic re-aim, which is what made the old behaviour look like the
     switch "not working": the setting was read nowhere, so the next tick lit the globe again. */
  assert.ok(aim.indexOf('_nightSideOff()') < aim.indexOf('_sunOverheadPoint()'),
    'the setting is consulted BEFORE the sun is aimed, so the 60-second re-aim cannot undo it');
});

/* ══════════════════ #R224 ⑤ — the quadrature ══════════════════ */
/* ── ⑤ THE SKY'S GREY-GREEN HORIZON WAS THE QUADRATURE ─────────────────────────────────────────── */
test('R224 ⑤ the sky model converges, and its low-elevation horizon is blue', async () => {
  const src = read('js/sky-model.js');
  /* ⚠ (#R226) the COUNT is not what #R224 established — the warp and the convergence test are. Pinning
     the literal 32 meant this failed the moment the limb ray was convergence-tested too (#R226 raised
     it to 256 on the same argument, measured the same way). What has to stay true is that the march is
     warped, ordered, and fine enough — so that is what is asserted. */
  const _n = src.match(/const N = (\d+), M = (\d+), KWARP = (\d+);/);
  assert.ok(_n, 'the march states its sample count, sun sub-march and warp');
  assert.ok(+_n[1] >= 32, `the view march is at least #R224's 32 (found ${_n[1]})`);
  assert.equal(+_n[3], 7, 'and the warp constant is unchanged');
  assert.match(src, /const tLow = Math\.max\(tIn, Math\.min\(tMax, -\(o\[0\] \* d\[0\]/,
    'the warp is anchored at the ray’s LOWEST point — the eye inside the air, the tangent from space');
  assert.match(src, /out\.sort\(\(p, q\) => p\[0\] - q\[0\]\);/,
    'and the samples are marched in increasing t, because the optical depth so far attenuates the next one');
  const { skyColour } = await import(new URL('js/sky-model.js', root));
  /* #R223 measured #93a394 here — G above BOTH R and B. A daytime horizon is not green. */
  for (const ve of [1, 3, 5, 10]) {
    const c = skyColour(60, 0, 90, ve).rgb;
    assert.ok(c[2] > c[1] && c[1] > c[0], `sun 60°, view ${ve}°: ${c} is not B>G>R`);
  }
  /* …and a low Sun is still warm, which is the other half of being right */
  const set = skyColour(2, 0, 90, 3).rgb;
  assert.ok(set[0] > set[1] && set[1] > set[2], `sunset horizon ${set} should be R>G>B`);
  /* #R202's Cesium calibration is still where it was measured (the far end of the gradient) */
  const noon = skyColour(75, 30, 90).rgb;
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0], `noon sky ${noon} stays blue`);
  /* the band no longer falls back to a neutral grey above +6° */
  const sky = read('js/theme-sky.js');
  assert.match(sky, /const w=Math\.max\(0,Math\.min\(1,lm\/12\)\);/);
  assert.ok(!/\(6-e\)\/12/.test(sky), 'the elevation cut-off is gone');
});

/* ══════════════════ #R270 ⑦ — the Sun is known when the display is off ══════════════════ */
/* ── ⑦ the Sun is known when the day/night display is off ───────────────────────────────────── */
test('R270 ⑦ «day/night off» is not «the Sun’s position is unknown» — and the Map basemap is unchanged', () => {
  /* EVALUATED: `_sunElevAtCentre` and `_relAzimuth` are lifted out of the comment-stripped
     js/theme-sky.js and run with the three predicates they consult set to every combination, a Sun
     20° up to the east of the camera, and a camera whose bearing is known. */
  const s = codeOnly(read('js/theme-sky.js'));
  const fns = liftFunction(s, '_sunElevAtCentre') + '\n' + liftFunction(s, '_relAzimuth');
  const run = ({ sat, off, sun = { lat: 0, lng: 70 }, centre = { lat: 0, lng: 0 } }) => new Function(
    '_satelliteUp', '_nightSideOff', '_sunOverheadPoint', 'GE', fns + '\nreturn { elev: _sunElevAtCentre(), az: _relAzimuth() };')(
    () => sat, () => off, () => sun, () => ({ camera: { getCenter: () => centre, getBearing: () => 0 } }));
  /* the vector basemap still answers «unknown», which is what keeps #R241's 「Mapでは大気ゼロ」 true —
     whatever the day/night switch says, because the basemap is decided first */
  assert.equal(run({ sat: false, off: false }).elev, null, 'no satellite basemap → no air, as before');
  assert.equal(run({ sat: false, off: true }).elev, null, 'the basemap is decided first, so the Map path is untouched');
  /* with the display off the Sun is overhead at the camera centre — the light _aimSun() set.
     Answering «unknown» there is what switched the app's own atmosphere off. */
  const off = run({ sat: true, off: true });
  assert.equal(off.elev, 90, 'with the display off the Sun is overhead at the camera centre — the light _aimSun() set');
  /* the relative azimuth must agree with that reading, or the model is asked about another sun */
  assert.equal(off.az, 0, 'a sun at the zenith has no azimuth');
  /* …and with the display ON, the real Sun is still what is read: 70° of longitude away on the equator */
  const on = run({ sat: true, off: false });
  assert.ok(Math.abs(on.elev - 20) < 1e-9, `the Sun 70° away stands 20° up (got ${on.elev})`);
  assert.ok(Math.abs(on.az - 90) < 1e-9, `due east of a north-up camera is 90° off the view (got ${on.az})`);
  /* the two things that must NOT change: the Map basemap has no air, and the sun still points.
     ⚠ READ, NOT RUN: both are paint and predicate wiring inside the renderer-bound theme factory. */
  assert.match(s, /function _airOn\(\)\{ try\{ return HOST\.mapType==='sat'/, '#R241’s rule must stand');
  assert.match(s, /'atmosphere-blend':\(sat\?_airRamp\([\d.]+\):0\)/, 'the Map basemap keeps a blend of 0');
});
