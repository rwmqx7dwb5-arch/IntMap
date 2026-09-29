// Tilt and the viewpoint — the unlimited-tilt setting (js/view-controls.js IntMapTilt), the eye
// altitude readout (IntMapEyeAlt), the one camera geometry (js/camera-math.js gEye) and the engine's
// tilt pivot / eye anchor (js/geo-engine.js).
//
// Gathered from tests/r171-checks (the tilt ceiling and the eye-altitude readout are real settings,
// wired both ways and reachable from Atlas), r172-checks (unlimited tilt keeps the viewpoint still,
// through the engine's own pre-apply hook) and r173-checks (the eye anchor answers EVERY proposal).
// Titles keep the round that wrote them.
//
// RUN where it can be: the ceiling arithmetic of IntMapTilt is lifted out of its IIFE and asked
// against an engine stub, and gEye — the ONE transcription of the renderer's camera geometry, a pure
// function in js/camera-math.js — is called. The pre-apply hook and the settings rows exist only in
// the booted app against a live renderer; those stay READ and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { appShell } from './app-source.mjs';
import { makeCameraMath } from '../js/camera-math.js';
import { codeOnly as stripComments } from '../scripts/code-only.mjs';

const R = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* (#R175) "the page" is index.html + src/main.js + js/app-body.js (+ js/geo-engine.js) */
const INDEX = appShell(new URL('../', import.meta.url));
/* (#R322) the pure camera GEOMETRY is its own file, deliberately NOT part of the shell text */
const GEOM = R('js/camera-math.js');

/* IntMapTilt's declarations, lifted out of ITS IIFE (IntMapEyeAlt declares a KEY of its own) and
   evaluated with an engine and a localStorage supplied by the test */
function liftTilt({ GE, stored }) {
  const src = R('js/view-controls.js');
  let iife = null;
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    if (!iife && n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === 'IntMapTilt') iife = n.right;
  });
  assert.ok(iife, 'js/view-controls.js no longer assigns window.IntMapTilt');
  const want = ['KEY', 'STANDARD', 'unlimited', 'engineMax', 'ceiling', 'fromAngle'];
  const stmts = [];
  walk.full(iife, (n) => {
    const declares = (n.type === 'FunctionDeclaration' && want.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((d) => want.includes(d.id && d.id.name)));
    if (declares && !stmts.includes(n)) stmts.push(n);
  });
  const text = stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n');
  const localStorage = { getItem: () => stored, setItem() {} };
  return new Function('GE', 'localStorage', `${text}\nreturn { STANDARD, engineMax, ceiling, fromAngle };`)(GE, localStorage);
}

/* ─── #R171 the tilt ceiling and the eye altitude ─────────────────────────────────────────────── */

/* ⚠ READ, NOT RUN: the Settings rows, their open/apply wiring and the locale keys are markup and data
   of the booted app. */
test('#R171 the tilt ceiling is a real setting, wired both ways, in five languages', () => {
  assert.match(INDEX, /id="setting-tilt-limit"/, 'the Settings row exists');
  assert.match(INDEX, /tl\.value=window\.IntMapTilt\.isUnlimited\(\)\?'unlimited':'standard'/, 'opening Settings reflects the saved state');
  assert.match(INDEX, /window\.IntMapTilt\.set\(tl\.value==='unlimited'\)/, 'Apply commits it');
  /* ⚠ (#R239) SAME CLAIM, NEW HOME. Every keyed string moved into js/locales/ui.<code>.js — asking all
     NINE locale files is the stricter form of the same question. (#R203: move the assertion, say why.) */
  for (const k of ['lblTiltLimit', 'tiltStandard', 'tiltUnlimited', 'tiltHint']) {
    for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
      const t = R('js/locales/ui.' + c + '.js');
      assert.ok(t.includes(k + ':') || t.includes('"' + k + '":'), `${k} missing from ${c}`);
    }
  }
});

test('#R171 the tilt ceiling is the RENDERER\'s, never a literal', () => {
  /* RUN: the ceiling comes from the engine capability, so an engine with a different range is not lied about */
  const cesiumLike = { camera: { tiltRange: () => [0, 180] } };
  const unlimited = liftTilt({ GE: () => cesiumLike, stored: '1' });
  assert.equal(unlimited.STANDARD, 78, '78 is the standard ceiling index.html sets at boot');
  assert.equal(unlimited.ceiling(), 180, 'unlimited tilt is whatever the RENDERER can do');
  assert.equal(liftTilt({ GE: () => ({ camera: { tiltRange: () => [0, 85] } }), stored: '1' }).ceiling(), 85, '…on either engine');
  assert.equal(liftTilt({ GE: () => undefined, stored: '1' }).ceiling(), 78, 'no engine yet → the standard ceiling, never a guess');
  assert.equal(liftTilt({ GE: () => cesiumLike, stored: null }).ceiling(), 78, 'standard tilt keeps the standard ceiling');
  /* angles past the top resolve into a real (pitch, bearing) pair */
  assert.deepEqual({ ...unlimited.fromAngle(200, 10) }, { pitch: 160, bearing: 190 }, 'past 180° the camera comes back down the far side, bearing reversed');
  assert.deepEqual({ ...unlimited.fromAngle(-30, 0) }, { pitch: 30, bearing: 180 }, 'so 0-360 is continuous: −30° is 30° leaning the other way');
  assert.equal(liftTilt({ GE: () => cesiumLike, stored: null }).fromAngle(120, 0).pitch, 78, 'and a standard session is held to its ceiling');
  /* ⚠ READ (this half): Atlas's tilt action is a branch of the dispatcher in the booted console */
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it. */
  const atlas = stripComments(R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js'));
  assert.match(atlas, /case 'pitch':/, 'the tilt action exists — the probe below is not vacuous (atlas-one-declaration: `tilt` reaches it through the registry)');
  assert.ok(!/case 'pitch':[\s\S]{0,400}?Math\.min\(85,tp\)/.test(atlas),
    'the Atlas tilt action must not clamp to a literal 85 — it has to honour the chosen ceiling');
  assert.match(atlas, /_cap=_T\?_T\.ceiling\(\):85/, 'Atlas reads the ceiling from IntMapTilt');
});

/* ⚠ READ, NOT RUN: a Settings row and the readout's DOM chip in the booted app. */
test('#R171 the viewpoint-altitude readout is a real setting, in five languages, and shows up in the readout', () => {
  assert.match(INDEX, /id="setting-eye-alt"/, 'the Settings row exists');
  assert.match(INDEX, /window\.IntMapEyeAlt\.set\(ea\.value==='on'\)/, 'Apply commits it');
  /* ⚠ (#R239) same move as above — every keyed string lives in js/locales/ui.<code>.js now. */
  for (const k of ['lblEyeAlt', 'eyeAltOff', 'eyeAltOn']) {
    for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
      const t = R('js/locales/ui.' + c + '.js');
      assert.ok(t.includes(k + ':') || t.includes('"' + k + '":'), `${k} missing from ${c}`);
    }
  }
  const readout = stripComments(R('js/map-readout.js'));
  assert.match(readout, /window\.IntMapEyeAlt\.text\(\)/, 'the readout asks the module for its chip');
  assert.match(readout, /if\(!eye\)\{ el\.style\.display='none'; return; \}/,
    'with the option on, the readout must stay up when the cursor leaves the map — the camera altitude is still true, and it is the ALWAYS-on readout');
});

test('#R171 the eye altitude is derived from the renderer, not guessed from the zoom', () => {
  /* (#R172) the metres-per-pixel no longer comes from unprojecting two screen points: past 90° of pitch
     the centre row is SKY, and the reading was ~100 km out. (#R177) SUPERSEDED IN MECHANISM, KEPT IN
     INTENT: the derivation lives in gEye — the single transcription of the renderer's camera geometry
     that the tilt anchor also calls. #R171-#R176 each wrote this geometry twice, and the two copies
     agreed with each other while disagreeing with the renderer by up to 7,115 km.
     RUN: gEye is called. On the plane its altitude is c2c pixels of the renderer's own map scale
     (worldSize, circumference at the latitude), cos(pitch) of it, above the target's terrain. */
  const { gEye, GEO_CIRC, GEO_RAD } = makeCameraMath();
  const cam = { lng: 139.7, lat: 35.7, zoom: 12, pitch: 0, bearing: 0, elevation: 0 };
  const c2c = 1000, tile = 512;
  const mpp = GEO_CIRC * Math.cos(cam.lat * GEO_RAD) / (tile * 2 ** cam.zoom);
  const eye = gEye(cam, c2c, tile, false, 1);
  assert.ok(Math.abs(eye.alt - c2c * mpp) < 1e-6, `the altitude is c2c × the renderer's metres-per-pixel (${eye.alt} vs ${c2c * mpp})`);
  assert.ok(Math.abs(gEye({ ...cam, zoom: 13 }, c2c, tile, false, 1).alt - eye.alt / 2) < 1e-6, 'one zoom level halves it — worldSize doubles');
  assert.ok(Math.abs(gEye(cam, 2 * c2c, tile, false, 1).alt - 2 * eye.alt) < 1e-6, 'the camera→centre distance is the renderer\'s (fov is the renderer\'s business)');
  assert.ok(Math.abs(gEye({ ...cam, elevation: 3776 }, c2c, tile, false, 1).alt - (eye.alt + 3776)) < 1e-6,
    'the terrain under the centre is carried, so the number is above SEA LEVEL');
  const up = gEye({ ...cam, pitch: 120 }, c2c, tile, false, 1);
  assert.ok(up && Number.isFinite(up.alt), 'and it is defined past 90° of pitch, where the centre row is SKY');
  /* ⚠ READ (these halves): the adapter's eyePosition reads a live MapLibre transform */
  const i = INDEX.indexOf('eyePosition(){');
  const adapter = INDEX.slice(i, i + 1200);
  assert.ok(i > 0, 'the adapter must expose the viewpoint position');
  /* (maplibre-6-migration) gC2C's second argument is the renderer's live transform now */
  assert.match(adapter, /return gEye\(cam,gC2C\(t,t\),tile,gSpherical\(t\),1\);/,
    'the viewpoint comes from the ONE camera geometry, not from a second copy of it');
  assert.match(adapter, /getCameraTargetElevation/, 'the terrain under the centre is carried, so the number is above SEA LEVEL');
  const geo = GEOM.slice(GEOM.indexOf('function gEye('), GEOM.indexOf('function gEye(') + 1600);
  assert.ok(!/unproject/.test(geo), 'and never from unprojecting screen points — past 90° of pitch the centre row is SKY');
  assert.match(INDEX, /cameraAltitude\(\)\{ const e=this\.eyePosition\(\); return e\?e\.alt:null; \}/,
    'the altitude is one component of the position, not a second derivation that can drift from it');
});

/* ⚠ READ, NOT RUN: the SYS catalogue TEXT is what the planner reads (#R115: uncatalogued = nonexistent). */
test('#R171 every new switch is operable from Atlas AND catalogued', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it. */
  const atlas = R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js');
  for (const a of ['tiltLimit', 'eyeAltitude']) {
    assert.ok(atlas.includes(`case '${a}':`), `Atlas must implement ${a}`);
    assert.ok(atlas.includes(`{"type":"${a}"`), `${a} must appear in the SYS catalogue or the planner does not know it exists`);
    assert.ok(new RegExp(`\\b${a}:\\{ lbl:`).test(atlas), `${a} should offer an inline on/off switch in the reply`);
  }
  assert.match(atlas, /"shape"\?:"square"\|"circle"/, 'the volume3d action must advertise the circular footprint');
  assert.match(atlas, /const round=\/\^\(circle\|round\|circular\|円\|丸\)\$\/i/, '…and implement it');
});

/* ⚠ READ, NOT RUN: the import list and the factory call are the booted page's loader. */
test('#R171 the module list, script tag and boot call for view-controls all agree', () => {
  /* (#R175) the tag became an import in the Vite entry (src/main.js), which appShell() includes. */
  assert.match(INDEX, /import '\.\.\/js\/view-controls\.js';/, 'the file must be loaded by the Vite entry');
  assert.match(INDEX, /window\.IntMapModules\.viewControls\((IM_HOST)\)/, 'the factory must be instantiated with the other module factories');
  const src = R('js/view-controls.js');
  /* (#R180) the renderer parameter is gone from every factory — no module receives the raw handle */
  assert.match(src, /window\.IntMapModules\.viewControls=function\(HOST\)/, 'factory shape');
  assert.match(src, /\(function waitForEngine\(n\)\{/,
    'the factories run before IntMapGeoEngine exists (#R170) — the module must wait for it rather than binding to nothing');
});

/* ─── #R172 unlimited tilt does not move the viewpoint ───────────────────────────────────────── */

/* ⚠ READ, NOT RUN: the correction rides MapLibre's pre-apply hook (setTransformCameraUpdate) on a live
   map; tests/r177.spec and r179.spec read the renderer camera's own field to prove it is set. */
test('#R172 the tilt pivot is expressed as an intent and implemented on the pre-apply hook', () => {
  assert.match(INDEX, /setTiltPivot\(mode\)\{/, 'the contract states WHAT ("pivot about the eye"), not HOW');
  /* (MapLibre 6) through the public setter: the map has no transformCameraUpdate property of its own
     any more, so the assignment 5.24 took would install nothing. */
  assert.match(INDEX, /m\.setTransformCameraUpdate\(\(t\)=>\{/, 'the correction rides along with the gesture');
  assert.doesNotMatch(INDEX, /\bm\.transformCameraUpdate\s*=/, 'and nothing writes the property MapLibre 6 no longer reads');
  const vc = stripComments(R('js/view-controls.js'));
  const tilt = vc.slice(vc.indexOf('window.IntMapTilt=(function()'), vc.indexOf('window.IntMapEyeAlt=(function()'));
  assert.ok(!/events\.on\('pitch/.test(tilt),
    "correcting from a 'pitch' event aborts the drag — MapLibre's jumpTo starts with stop(). Traced: the twelve-step drag died on the first correction");
  assert.ok(!/setEye\(/.test(tilt), 'the tilt module states the intent; the engine owns the geometry');
  assert.match(vc, /const want=unlimited\?'eye':'target'/, 'standard tilt keeps the renderer\'s own behaviour, byte for byte');
  assert.match(vc, /setCenterClamped\(!unlimited\)/,
    'the view target has to be unpinned for the eye to stay put — a ground-pinned target makes the eye a function of zoom and pitch');
});

/* ⚠ READ, NOT RUN: as above — the hook runs inside MapLibre's camera update. */
test('#R172 the pivot only fires on a PURE tilt, or "fly to Paris tilted" lands short', () => {
  /* (#R177/#R179) the window is wider because the hook says WHICH camera model it solves for and reads
     what the caller DECLARED; the assertions themselves are #R172's, untouched. */
  const hook = INDEX.slice(INDEX.indexOf('setTiltPivot(mode){'), INDEX.indexOf('setTiltPivot(mode){') + 20000);
  assert.match(hook, /Math\.abs\(cur\.lng-last\.lng\)>1e-9\|\|Math\.abs\(cur\.lat-last\.lat\)>1e-9/,
    'an update that also travels is a journey, not a tilt (measured: Paris arrived 4.3 km off centre without this)');
  assert.match(hook, /const last=req; req=cur;/,
    'the centre test compares like with like — the proposed camera has its own running state and never sees our override');
  assert.match(hook, /window\.__fsCamActive/, 'never while the flight sim owns the camera');
});

test('#R172 the viewpoint can be read and put back, and the scale is valid at any pitch', () => {
  /* RUN: gEye's look distance is c2c pixels of the renderer's own map scale at EVERY pitch — the
     unproject measurement it replaced was ~100 km out past 90°, because the centre row is SKY */
  const { gEye, GEO_CIRC, GEO_RAD } = makeCameraMath();
  const c2c = 900, tile = 512;
  for (const pitch of [0, 45, 89, 91, 135, 175]) {
    const cam = { lng: 2.35, lat: 48.85, zoom: 14, pitch, bearing: 30, elevation: 0 };
    const eye = gEye(cam, c2c, tile, false, 1);
    const expect = c2c * GEO_CIRC * Math.cos(cam.lat * GEO_RAD) / (tile * 2 ** cam.zoom);
    assert.ok(eye && Math.abs(eye.distance - expect) < 1e-6,
      `pitch ${pitch}: metres-per-pixel comes from the renderer's own map scale (worldSize and circumferenceAtLatitude)`);
  }
  /* ⚠ READ (these halves): the adapter methods and the capability on the live MapLibre adapter */
  assert.match(INDEX, /eyePosition\(\)\{/, 'the engine can say WHERE the viewpoint is');
  assert.match(INDEX, /setEye\(o\)\{/, '…and put it back');
  assert.match(INDEX, /eyeControl:true/, '…and declares it as a capability');
  const eyeSrc = INDEX.slice(INDEX.indexOf('eyePosition(){'), INDEX.indexOf('eyePosition(){') + 1200);
  assert.ok(!/unproject\(\[w\/2-50,h\/2\]\)/.test(eyeSrc),
    'past 90° of pitch the centre row is SKY — the unproject measurement was ~100 km out and is gone');
});

/* ─── #R173 the eye anchor ───────────────────────────────────────────────────────────────────── */

/* ⚠ READ, NOT RUN: the anchor is the pre-apply hook of a live MapLibre map (see #R172 above). */
test('#R173 the eye anchor answers every proposal, not only the ones that change the pitch', () => {
  const hook = INDEX.slice(INDEX.indexOf('setTiltPivot(mode){'), INDEX.indexOf('setTiltPivot(mode){') + 20000);
  /* (#R177) the bare `return {}` became `return NOOP()` so a declined frame can still hand back a
     BOUNDED target altitude. The claim is #R173's, unchanged: no proposal may be declined merely
     because the pitch did not move. */
  assert.ok(!/Math\.abs\(cur\.pitch-was\.pitch\)<1e-4\) return (\{\}|NOOP\(\))/.test(hook),
    'declining a no-op frame applied the PROPOSED camera and wiped the anchor — measured: the eye fell 18.6 km on the last frame');
  assert.match(hook, /const movedFromLast=/, 'travel is judged against the previous proposal…');
  assert.match(hook, /const movedFromApplied=/, '…and against the camera actually on screen, because the proposal is re-cloned between gestures');
  /* (#R175) the SHAPE of the travel branch changed; the invariant it protects did not. A travelling
     frame still never has its centre overridden — that is what kept "fly to Paris, pitch 55" from
     landing 4.3 km short. */
  const travel = hook.slice(hook.indexOf('if(movedFromApplied&&(movedFromLast||!last)'), hook.indexOf('try{ if(window.__fsCamActive)'));
  assert.match(travel, /if\(movedFromApplied&&\(movedFromLast\|\|!last\)\)/, 'a real journey is still recognised as travel');
  assert.ok(travel.length > 0 && !/center/.test(travel), 'and a journey never has its centre overridden');
  assert.match(hook, /window\.__fsCamActive/, 'never while the flight sim owns the camera');
});
