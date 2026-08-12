/* ============================================================================
 *  #R227 — source-level checks
 *  ① the limb is drawn by this app, and maplibre's own pass is off exactly where it draws
 *  ② the shader states no physics of its own — every coefficient arrives from js/sky-model.js
 *  ③ the sun ray is ONE integral, and both the CPU march and the GPU table call it
 *  ④ render-scale no longer waits for `idle` alone, and #R202's crash guards are intact
 *  ⑤ the model is published for the layer to read (the #R162 «nothing assigns it» trap)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skyColour, sunOpticalDepth, skyModelTables } from '../js/sky-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments in this project carry the reasoning, so a check that greps them proves nothing */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('R227 ① the app draws the limb, and the renderer\'s own atmosphere is off where it does', () => {
  const layer = code('js/limb-layer.js');
  assert.match(layer, /window\.IntMapModules\.limbLayer\s*=\s*function/,
    'js/limb-layer.js registers the factory the adapter looks for');
  assert.match(layer, /type:'custom'/, 'it is a custom layer, not a style layer');

  const eng = code('js/geo-engine.js');
  for (const fn of ['addLimb', 'setLimb', 'removeLimb', 'hasLimb']) {
    assert.ok(new RegExp('\\b' + fn + '\\s*[:(]').test(eng), fn + ' is part of the engine contract');
  }
  assert.match(eng, /IntMapModules\.limbLayer\(\)\.makeLayer\(/,
    'the adapter builds it, so a second engine answers the same intent its own way');
  /* ⚠ and it refuses on a CPU rasteriser. Measured: on SwiftShader the full-screen pass that decides
     which pixels are in the band took boot-to-loaded from 10.5 s to 46.5 s. On a GPU the same layer
     is CHEAPER than the renderer's own atmosphere (4.7 ms against 5.1). */
  assert.match(eng, /swiftshader\|llvmpipe\|software/,
    'a software rasteriser keeps maplibre\'s own halo rather than a per-pixel march');
  assert.match(eng, /limb=1/, 'and `?limb=1` forces it on, so the drawn band can be tested at all');

  /* the two halves of the same switch: while our layer owns the rim, maplibre's pass is zero */
  const sky = code('js/theme-sky.js');
  assert.match(sky, /'atmosphere-blend':\(limb\?0:/,
    'atmosphere-blend is 0 exactly when the limb layer is the one drawing');
  assert.match(sky, /function _limbOwnsRim\(\)/, 'one predicate decides it');
  assert.match(sky, /_eyeAltM\(\)>_ATM_TOP_M/, 'and it is the eye above the shell — where a limb IS a limb');
  assert.match(sky, /_sunElevAtCentre\(\)==null\) return false/,
    'with the day/night display off or on the vector map the Sun is unknown, and #R221\'s gate still wins');
  /* …and the rim owner has to be part of what makes the sky block worth re-parsing, or a camera
     that climbs without the Sun moving would leave both halos drawn, or neither */
  assert.match(sky, /limb===_applySkyAtmosphere\._limb/,
    '_skyFollowCamera compares who owns the rim, not only the two colours');
});

test('R227 ② the shader restates no physics — the numbers come from js/sky-model.js', () => {
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
  assert.match(main, /'orbitPoints', 'limbLayer'/, 'and named in the module guard\'s list');

  /* the model still answers — this is the same march the shader mirrors */
  const c = skyColour(45, 0).rgb;
  assert.ok(c[2] > c[0], 'a sunlit sky is blue');
});
