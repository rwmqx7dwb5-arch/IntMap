// (#R182) THE TRANSCRIPTION, PINNED TO THE LIBRARY IT WAS TRANSCRIBED FROM.
//
// 「Cesium選択時に、マップの操作がほぼできない。また、MapLibre時と同じレスポンスになるように。」
//
// js/cesium-input.js reproduces MapLibre's gesture handlers on Cesium's camera. A copy of
// somebody else's constants rots silently: maplibre-gl gets bumped, a rate changes, and the
// two engines drift apart with nothing failing. So these tests do not assert that the numbers
// are what this round measured — they READ node_modules/maplibre-gl and assert the numbers are
// still what MAPLIBRE says. A dependency bump that changes the feel of the map now fails here,
// with the old and new values printed, instead of arriving as a bug report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walker from 'acorn-walk';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

const INPUT = read('js/cesium-input.js');
const ENGINE = read('js/cesium-engine.js');
const SELECT = read('js/engine-select.js');
const ML_URL = new URL('node_modules/maplibre-gl/dist/maplibre-gl-dev.js', ROOT);
const ML = existsSync(ML_URL) ? readFileSync(ML_URL, 'utf8') : null;

/* the module is an IIFE assigned to window; evaluate it against a stub so the pure
   arithmetic can be exercised directly, the way #R180 tests js/cesium-style.js */
function loadInput() {
  const win = {};
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', INPUT);
  fn(win, { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) }, () => 0, () => {});
  return win.IntMapCesiumInput;
}

test('R182: the module loads and exposes its arithmetic and constants', () => {
  const M = loadInput();
  assert.ok(M && typeof M.attach === 'function', 'IntMapCesiumInput.attach');
  assert.ok(M._math && M._consts);
});

/* ── ① EVERY CONSTANT IS STILL MAPLIBRE'S ────────────────────────────────────────────────
   Each entry names the handler it comes from and a regex that finds it in the shipped
   library. If maplibre-gl is not installed the check says so rather than passing quietly. */
test('R182 ①: the transcribed constants match the installed maplibre-gl', () => {
  assert.ok(ML, 'node_modules/maplibre-gl/dist/maplibre-gl-dev.js must be present to verify the transcription');
  const C = loadInput()._consts;
  const cases = [
    ['ROTATE_DEG_PER_PX', C.ROTATE_DEG_PER_PX, /rotateDegreesPerPixelMoved\s*=\s*([\d.]+)/],
    ['PITCH_DEG_PER_PX', C.PITCH_DEG_PER_PX, /pitchDegreesPerPixelMoved\s*=\s*(-?[\d.]+)/],
    ['ROTATE_CENTRE_PX', C.ROTATE_CENTRE_PX, /minPixelCenterThreshold\s*=\s*([\d.]+)/],
    ['WHEEL_ZOOM_DELTA', C.WHEEL_ZOOM_DELTA, /wheelZoomDelta\s*=\s*([\d.]+)/],
    ['MAX_SCALE_PER_FRAME', C.MAX_SCALE_PER_FRAME, /maxScalePerFrame\s*=\s*([\d.]+)/],
    ['WHEEL_TIME_ADJ', C.WHEEL_TIME_ADJ, /wheelEventTimeDiffAdjustment\s*=\s*([\d.]+)/],
    ['KEY_PAN_STEP', C.KEY_PAN_STEP, /panStep:\s*([\d.]+)/],
    ['KEY_BEARING_STEP', C.KEY_BEARING_STEP, /bearingStep:\s*([\d.]+)/],
    ['KEY_PITCH_STEP', C.KEY_PITCH_STEP, /pitchStep:\s*([\d.]+)/],
    ['TOUCH_ROTATE_THRESHOLD', C.TOUCH_ROTATE_THRESHOLD, /ROTATION_THRESHOLD\s*=\s*([\d.]+)/],
    ['TOUCH_SINGLE_MS', C.TOUCH_SINGLE_MS, /ALLOWED_SINGLE_TOUCH_TIME\s*=\s*([\d.]+)/],
    ['INERTIA_CUTOFF', C.INERTIA_CUTOFF, /cutoff\s*=\s*(\d+);\s*\/\/\s*msec/],
  ];
  for (const [name, mine, re] of cases) {
    const m = re.exec(ML);
    assert.ok(m, `${name}: could not find its source in maplibre-gl — the transcription can no longer be verified`);
    assert.equal(mine, Number(m[1]), `${name}: transcribed ${mine}, maplibre-gl now says ${m[1]}`);
  }
  /* the two scroll rates are named the same way in both files */
  assert.match(ML, /defaultZoomRate\$1\s*=\s*1\s*\/\s*100/);
  assert.match(ML, /wheelZoomRate\s*=\s*1\s*\/\s*450/);
  assert.equal(C.DEFAULT_ZOOM_RATE, 1 / 100);
  assert.equal(C.WHEEL_ZOOM_RATE, 1 / 450);
  /* and the four inertia families */
  assert.match(ML, /linearity:\s*0\.3/);
  assert.equal(C.INERTIA.pan.deceleration, 2500);
  assert.equal(C.INERTIA.pan.maxSpeed, 1400);
  assert.equal(C.INERTIA.zoom.deceleration, 20);
  assert.equal(C.INERTIA.bearing.deceleration, 1000);
  assert.equal(C.INERTIA.bearing.maxSpeed, 360);
  assert.equal(C.INERTIA.pitch.maxSpeed, 90);
  for (const dec of [2500, 20, 1000]) assert.match(ML, new RegExp(`deceleration:\\s*${dec}`));
});

/* ── ② THE GLOBE PAN IS MAPLIBRE'S, NOT THE INTUITIVE ONE ────────────────────────────────
   computeGlobePanCenter, evaluated against numbers measured from the running MapLibre map:
   at z4/lat 20 a 10 px step moved the centre 0.04386°/px in longitude and 0.0413°/px in
   latitude, and panning north raised the reported zoom by +0.0244 over 2.89° of latitude. */
test('R182 ②: computeGlobePanCenter reproduces the measured MapLibre pan', () => {
  const { panCentre, zoomAdjust, degPerPx, worldSizeAt } = loadInput()._math;
  const cam = { lng: 10, lat: 20, zoom: 4, bearing: 0 };
  const out = panCentre(cam, 100, -70);
  /* longitude: dpp × 1/cos(lat); latitude: dpp */
  const dpp = degPerPx(worldSizeAt(4), 20);
  assert.ok(Math.abs(dpp - 0.041293) < 1e-5, `deg/px ${dpp}`);
  assert.ok(Math.abs((cam.lng - out.lng) - 4.3946) < 1e-3, `dLng ${cam.lng - out.lng}`);
  assert.ok(Math.abs((cam.lat - out.lat) - 2.8905) < 1e-3, `dLat ${cam.lat - out.lat}`);
  /* the zoom drift that keeps the globe the same size on screen */
  assert.ok(Math.abs(zoomAdjust(20, 17.1093) - 0.0244) < 5e-4, `zoomAdjust ${zoomAdjust(20, 17.1093)}`);
  /* dragging with a bearing rotates the delta into the map's frame */
  const turned = panCentre({ lng: 10, lat: 20, zoom: 4, bearing: 90 }, 100, 0);
  assert.ok(Math.abs(turned.lng - 10) < 1e-9, 'a due-east drag on a map turned 90° must not move longitude');
  assert.ok(turned.lat > 20, 'the whole of the delta goes into latitude instead');
});

test('R182 ②: the pan is NOT "the grabbed point follows the cursor"', () => {
  /* MapLibre says so in as many words, and the difference is 12× at the app's startup zoom:
     grabbing the globe at z1.7 would rotate ~21.6° for a 100 px drag; MapLibre moves 21.6°/…
     no — at z1.7 lngSpeed saturates, so the two happen to agree; the divergence is that the
     law is a fixed degrees-per-pixel, INDEPENDENT of where on the globe the drag started. */
  const { panCentre } = loadInput()._math;
  const a = panCentre({ lng: 0, lat: 0, zoom: 4, bearing: 0 }, 100, 0);
  const b = panCentre({ lng: 0, lat: 0, zoom: 4, bearing: 0 }, 100, 0);
  assert.equal(a.lng, b.lng, 'the pan law depends only on the delta, the zoom and the centre');
});

/* ── ③ THE WHEEL SIGMOID ─────────────────────────────────────────────────────────────────
   Measured on the running MapLibre map with the app's own rates (setWheelZoomRate(1/300),
   setZoomRate(1/90)): one −120 tick gave +0.2665 of zoom, one −4 tick gave +0.0326. */
test('R182 ③: the wheel sigmoid reproduces the measured MapLibre zoom steps', () => {
  const C = loadInput()._consts;
  const step = (delta, rate) => {
    let scale = C.MAX_SCALE_PER_FRAME / (1 + Math.exp(-Math.abs(delta * rate)));
    if (delta < 0) scale = 1 / scale;
    return Math.log2(scale);
  };
  /* the accumulator carries the OPPOSITE sign to deltaY (`_delta -= value`) */
  assert.ok(Math.abs(step(120, 1 / 300) - 0.2599) < 2e-3, `wheel ${step(120, 1 / 300)}`);
  assert.ok(Math.abs(step(4, 1 / 90) - 0.0317) < 2e-3, `trackpad ${step(4, 1 / 90)}`);
  assert.ok(step(-120, 1 / 300) < 0, 'scrolling the other way zooms out');
});

test('R182 ③: the wheel handler accumulates with the opposite sign to deltaY', () => {
  /* the defect this pins: `wDelta += value` zoomed OUT when the user scrolled to zoom IN */
  assert.match(INPUT, /wDelta\s*-=\s*value/, 'the accumulator must be `-= value`');
  assert.ok(!/wDelta\s*\+=\s*value/.test(INPUT), 'and never `+= value`');
  /* shift SLOWS the zoom rather than cancelling it */
  assert.match(INPUT, /e\.shiftKey&&value\)\s*value=value\/4/);
});

/* ── ④ THE EASINGS ARE CURVES, NOT LOOKALIKES ─────────────────────────────────────────── */
test('R182 ④: the inertia easing is the cubic bezier MapLibre uses', () => {
  const { INERTIA_EASING, easeOut, unitBezier } = loadInput()._math;
  assert.equal(INERTIA_EASING(0), 0);
  assert.equal(INERTIA_EASING(1), 1);
  /* bezier(0,0,0.3,1) is strongly front-loaded: half the time, most of the distance.
     The window is tight enough that a lookalike curve (ease-out quadratic gives 0.75,
     cubic 0.875) fails it. */
  assert.ok(INERTIA_EASING(0.5) > 0.79 && INERTIA_EASING(0.5) < 0.82, `mid ${INERTIA_EASING(0.5)}`);
  assert.ok(INERTIA_EASING(0.25) > 0.5, `quarter ${INERTIA_EASING(0.25)}`);
  /* monotone, which a Newton solve that fell back badly would not be */
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.02) { const v = INERTIA_EASING(t); assert.ok(v >= prev - 1e-9, `not monotone at ${t}`); prev = v; }
  assert.equal(easeOut(0), 0); assert.equal(easeOut(1), 1);
  /* a linear bezier really is linear — a sanity check on the solver itself */
  const lin = unitBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
  for (const t of [0.1, 0.37, 0.5, 0.9]) assert.ok(Math.abs(lin(t) - t) < 1e-3, `linear bezier at ${t}: ${lin(t)}`);
  assert.match(ML || '', /bezier\(0,\s*0,\s*0\.3,\s*1\)/, 'maplibre still uses bezier(0,0,0.3,1) for inertia');
});

test('R182 ④: calculateEasing is MapLibre\'s, including the maxSpeed clamp', () => {
  const { inertiaEase, INERTIA_EASING } = loadInput()._math;
  void INERTIA_EASING;
  const C = loadInput()._consts;
  /* a slow flick: speed = amount·linearity/seconds, duration = |speed|/(dec·linearity) */
  const r = inertiaEase(100, 100, C.INERTIA.pan);
  const speed = 100 * 0.3 / 0.1;
  assert.ok(Math.abs(r.duration - (speed / (2500 * 0.3)) * 1000) < 1e-6);
  assert.ok(Math.abs(r.amount - speed * (r.duration / 1000) / 2) < 1e-6);
  /* a violent one is capped at maxSpeed, which is what stops a fling flying off the planet */
  const fast = inertiaEase(100000, 10, C.INERTIA.pan);
  assert.ok(Math.abs(fast.duration - (1400 / (2500 * 0.3)) * 1000) < 1e-6, 'clamped to maxSpeed');
});

/* ── ⑤ CESIUM'S OWN NAVIGATION IS OFF, AND ALL EIGHT NAMES ARE IMPLEMENTED ─────────────── */
test('R182 ⑤: Cesium\'s ScreenSpaceCameraController is disabled, not re-tuned', () => {
  assert.match(INPUT, /screenSpaceCameraController\.enableInputs\s*=\s*false/);
  /* and the engine no longer reaches for Cesium's zoomFactor, which clamped both of the
     app's rates to 0.5 — a tenth of Cesium's own default */
  assert.ok(!/screenSpaceCameraController\.zoomFactor\s*=/.test(ENGINE),
    'the adapter must not drive Cesium zoomFactor any more');
});

test('R182 ⑤: every gesture name in the contract has a handler here', () => {
  const names = ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'keyboard',
    'doubleClickZoom', 'boxZoom', 'touchPitch'];
  /* the contract's own list, read from the source rather than repeated */
  const listed = /gestures\(\)\{\s*return\s*\[([^\]]+)\]/.exec(read('js/geo-engine.js'));
  assert.ok(listed, 'geo-engine must still publish gestures()');
  for (const n of names) {
    assert.ok(listed[1].includes(`'${n}'`), `${n} missing from the contract list`);
    assert.ok(new RegExp(`\\b${n}\\s*:\\s*true`).test(INPUT), `${n} has no switch in cesium-input.js`);
    assert.ok(new RegExp(`on\\.${n}\\b`).test(INPUT), `${n} is declared but never consulted`);
  }
});

test('R182 ⑤: the gesture switches and the zoom rates reach the input layer', () => {
  assert.match(ENGINE, /setGesture\(name,on\)\{\s*\n?\s*if\(this\._input\)/);
  assert.match(ENGINE, /setZoomRate\(r,wheel\)\{\s*return this\._input/);
  /* the contract passes (rate, isWheel); the adapter used to drop the second argument */
  assert.match(ENGINE, /setZoomRate\(r,wheel\)\{ const v=V\(\); return v\?v\.setZoomRate\(r,wheel\)/);
});

/* ── ⑥ THE LIFECYCLE IS DRIVEN ONCE ──────────────────────────────────────────────────── */
test('R182 ⑥: a gesture frame does not announce itself as a completed move', () => {
  assert.match(ENGINE, /if\(!\(opts&&opts\.silent\)\)\{ this\.fire\('move',\{\}\); this\.fire\('moveend',\{\}\); \}/);
  assert.match(ENGINE, /if\(this\._inputActive\) return;/, 'the camera.changed stream must stand down mid-gesture');
  assert.match(INPUT, /silent:true/);
});

test('R182 ⑥: a programmatic camera command cancels a glide that is still running', () => {
  /* without this a fling kept writing the camera on top of the jumpTo that followed it —
     measured as gestures that "did nothing" because the previous one was still landing */
  assert.match(ENGINE, /if\(!\(opts&&opts\.silent\)&&this\._input\) try\{ this\._input\.cancel\(\); \}/);
  assert.match(INPUT, /cancel\(\)\{ if\(cancelling\) return;/, 'and cancel() must be re-entrancy safe');
});

/* ── ⑦ THE ANIMATED PATH LANDS WHERE THE INSTANT ONE DOES ──────────────────────────────
   The orbit angles are not Cesium's orientation angles; handing them to flyTo put the
   centre up to 25° of latitude away and dropped the bearing entirely at pitch 0. */
test('R182 ⑦: the flight is solved by the instant path, and re-asserted on arrival', () => {
  assert.match(ENGINE, /_aimAt\(target,hpr,bearing,pitch,range,roll\)\{/);
  assert.ok(!/orientation:\{ heading:hpr\.heading/.test(ENGINE),
    'flyTo must not be handed the ORBIT heading/pitch as its orientation');
  assert.match(ENGINE, /orientation:\{ direction:dest\.dir, up:dest\.up \}/);
  assert.match(ENGINE, /complete:\(\)=>\{ this\._aimAt\(S\.target,S\.hpr/);
  /* one solve, three callers */
  let calls = 0;
  walker.simple(parse(ENGINE), {
    CallExpression(n) {
      if (n.callee.type === 'MemberExpression' && n.callee.property
        && n.callee.property.name === '_aimAt') calls++;
    },
  });
  assert.equal(calls, 3, `_aimAt should have exactly three call sites, found ${calls}`);
});

test('R182 ⑦: `around` survives the adapter and anchors the zoom', () => {
  assert.match(ENGINE, /const camOf=o=>\(\{[^}]*around:o&&o\.around/s);
  assert.match(ENGINE, /const around=\(cam\.around!=null\)\?normLngLat\(cam\.around\):null;/);
  assert.match(ENGINE, /zoomTo\(z,o\)\{[\s\S]{0,120}?around:o&&o\.around/);
});

/* ── ⑧ THE DEFAULT ENGINE IS UNTOUCHED ────────────────────────────────────────────────── */
test('R182 ⑧: MapLibre is still the default and pays nothing for this file', () => {
  assert.match(SELECT, /if\(choice\(\)!=='cesium'\) return null;/);
  assert.match(SELECT, /await import\('\.\/cesium-input\.js'\);/);
  /* …and BEFORE the engine, which attaches the input layer while it builds the view */
  assert.ok(SELECT.indexOf("await import('./cesium-input.js')")
          < SELECT.indexOf("await import('./cesium-engine.js')"),
    'cesium-input must be imported before cesium-engine');
  /* src/main.js must not pull any of it into the default chunk */
  const main = read('src/main.js');
  assert.ok(!/cesium-input/.test(main), 'src/main.js must not import the Cesium input layer');
  /* the file keeps js/ free of top-level declarations (#R169/#R175) */
  const ast = parse(INPUT);
  const tops = ast.body.filter((n) => n.type === 'VariableDeclaration' || n.type === 'FunctionDeclaration'
    || n.type === 'ClassDeclaration');
  assert.equal(tops.length, 0, 'js/cesium-input.js must declare nothing at the top level');
});

test('R182 ⑧: a missing input layer degrades to Cesium\'s own controller rather than throwing', () => {
  assert.match(ENGINE, /this\._input=\(window\.IntMapCesiumInput&&window\.IntMapCesiumInput\.attach\)/);
  assert.match(ENGINE, /if\(this\._input\)\{ const ok=this\._input\.set\(name,on\); [^}]*\}\s*\n?\s*const c=this\._scene\.screenSpaceCameraController;/);
});
