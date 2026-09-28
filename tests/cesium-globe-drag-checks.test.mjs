// (cesium-globe-drag) THE GLOBE DRAG ON CESIUM IS MAPLIBRE'S, EVALUATED AGAINST MAPLIBRE ITSELF.
//
// MapLibre 6.4 moved the globe drag to versorSetLocationAtPoint: each move rotates the globe so the
// place under (pointer − delta) lands under the pointer, with the bearing held and a dial about the
// pole near it, and a pointer past the planet's edge aims through a falloff instead of at nothing.
// js/cesium-input.js transcribes that as `globeDrag`, parameterised by a small `geo` port (the ray
// through a pixel on a unit sphere, the way back to lng/lat, a projection, the centre's pixel).
//
// Nothing here compares the transcription to a number this round wrote down. The library ships its
// source, so MapLibre's OWN GlobeTransform and VerticalPerspectiveCameraHelper are compiled from
// node_modules/maplibre-gl/src (esbuild, in memory) and every step of every path is run twice on
// identical transforms: once by MapLibre's handleMapControlsPan, once by globeDrag with `geo`
// built from that transform. They must land on the same centre. A maplibre-gl bump that changes
// the drag then fails here with both centres printed, instead of arriving as "Cesium feels off".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as acorn from 'acorn';
import * as walker from 'acorn-walk';

const ROOT = new URL('../', import.meta.url);
const INPUT = readFileSync(new URL('js/cesium-input.js', ROOT), 'utf8');
const ML_SRC_DIR = new URL('node_modules/maplibre-gl/src/', ROOT);

function loadInput() {
  const win = {};
  new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', INPUT)(
    win, { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) }, () => 0, () => {});
  return win.IntMapCesiumInput;
}
const M = loadInput();

/* MapLibre's globe, compiled from the source the package ships */
const ML = await (async () => {
  const r = await build({
    stdin: {
      contents: [
        "export {GlobeTransform} from './geo/projection/globe_transform.ts';",
        "export {VerticalPerspectiveCameraHelper} from './geo/projection/vertical_perspective_camera_helper.ts';",
        "export {sphereSurfacePointToCoordinates, computeGlobePanCenter, getZoomAdjustment} from './geo/projection/globe_utils.ts';",
        "export {LngLat} from './geo/lng_lat.ts';",
        "export {default as Point} from '@mapbox/point-geometry';",
      ].join('\n'),
      resolveDir: fileURLToPath(ML_SRC_DIR), loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
  });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
})();

/* the constants the transcription names, found by their declaration in the library's source */
function libConst(re) {
  const seen = new Map();
  const walk = (u) => { for (const e of readdirSync(u, { withFileTypes: true })) {
    const c = new URL(e.name + (e.isDirectory() ? '/' : ''), u);
    if (e.isDirectory()) walk(c);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
      for (const m of readFileSync(c, 'utf8').matchAll(new RegExp(re.source, 'g'))) seen.set(e.name + ':' + m[1], m[1]);
    }
  } };
  walk(ML_SRC_DIR);
  const vals = new Set(seen.values());
  assert.equal(vals.size, 1, `${re}: ${vals.size ? 'declared with different values ' + [...seen.keys()] : 'not declared in maplibre-gl/src'}`);
  return [...vals][0];
}

const W = 800, H = 600;
function transform(c) {
  const tr = new ML.GlobeTransform();
  tr.resize(W, H);
  tr.setZoom(c.zoom); tr.setCenter(new ML.LngLat(c.lng, c.lat));
  tr.setBearing(c.bearing || 0); tr.setPitch(c.pitch || 0);
  tr.setTransitionState(1);
  return tr;
}
/* the port globeDrag reads, answered by MapLibre's transform */
const geoOf = (tr) => ({
  ray: (x, y) => ({ o: [...tr.cameraPosition], d: [...tr.getRayDirectionFromPixel(new ML.Point(x, y))] }),
  toLngLat: (v) => { const ll = ML.sphereSurfacePointToCoordinates(v); return { lng: ll.lng, lat: ll.lat }; },
  project: (lng, lat) => tr.locationToScreenPoint(new ML.LngLat(lng, lat)),
  centre: () => tr.centerPoint,
});

/* press + n moves, in canvas px from the middle of an 800×600 view */
const PATHS = [
  { name: 'z2.5 diagonal, off-centre', cam: { lng: 12, lat: 25, zoom: 2.5 }, press: [-120, 60], step: [30, -12], n: 8 },
  { name: 'z4 mid-latitude', cam: { lng: 12, lat: 45, zoom: 4 }, press: [80, 50], step: [-30, -18], n: 8 },
  { name: 'z6 Tokyo', cam: { lng: 139.7, lat: 35.7, zoom: 6 }, press: [-60, -40], step: [25, 20], n: 8 },
  { name: 'z3 near the north pole (dial)', cam: { lng: 20, lat: 78, zoom: 3 }, press: [70, -40], step: [-25, 10], n: 8 },
  { name: 'z3 near the south pole, turned 30°', cam: { lng: -60, lat: -80, zoom: 3, bearing: 30 }, press: [-50, 60], step: [20, 15], n: 8 },
  { name: 'z4 pitched 40', cam: { lng: 12, lat: 40, zoom: 4, pitch: 40 }, press: [0, 80], step: [20, -25], n: 8 },
  { name: 'z1.7 over the rim and beyond', cam: { lng: 12, lat: 25, zoom: 1.7 }, press: [150, 0], step: [20, 0], n: 12 },
  { name: 'z1.7 pointer off the planet throughout', cam: { lng: 12, lat: 25, zoom: 1.7 }, press: [370, -250], step: [-10, 5], n: 6 },
  { name: 'z1.7 across the antimeridian', cam: { lng: 175, lat: 10, zoom: 1.7 }, press: [-100, 0], step: [40, 0], n: 6 },
];

const D2R = Math.PI / 180;
const arc = (a, b) => {
  const c = Math.sin(a.lat * D2R) * Math.sin(b.lat * D2R) + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.cos((a.lng - b.lng) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
};
const dLng = (a, b) => { const d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

test('cesium-globe-drag ①: the constants globeDrag uses are still maplibre-gl\'s', () => {
  const C = M._consts;
  assert.equal(C.PAN_FALLOFF_BAND, Number(libConst(/\bconst PAN_FALLOFF_BAND\s*=\s*([\d.]+)/)));
  assert.equal(C.DIAL_MIN_RADIUS_PX, Number(libConst(/\bconst DIAL_MIN_RADIUS_PIXELS\s*=\s*([\d.]+)/)));
  assert.equal(C.PAN_MAX_ANGLE, Math.PI * Number(libConst(/\bconst PAN_MAX_ANGLE\s*=\s*Math\.PI\s*\*\s*([\d.]+)/)));
  assert.equal(C.MAX_VALID_LATITUDE, Number(libConst(/\bexport const MAX_VALID_LATITUDE\s*=\s*([\d.]+)/)));
});

test('cesium-globe-drag ②: every step of every path lands where MapLibre\'s handleMapControlsPan lands', () => {
  const { globeDrag } = M._math;
  const helper = new ML.VerticalPerspectiveCameraHelper();
  let worst = 0;
  for (const P of PATHS) {
    const ml = transform(P.cam), cs = transform(P.cam);
    const cam = { ...P.cam, bearing: P.cam.bearing || 0, pitch: P.cam.pitch || 0 };
    let x = W / 2 + P.press[0], y = H / 2 + P.press[1];
    for (let i = 0; i < P.n; i++) {
      x += P.step[0]; y += P.step[1];
      const [dx, dy] = P.step;
      helper.handleMapControlsPan({ panDelta: new ML.Point(dx, dy), around: new ML.Point(x, y) }, ml, ml.center);
      assert.ok(globeDrag(cam, x, y, dx, dy, geoOf(cs)), `${P.name} step ${i + 1}: globeDrag gave no answer`);
      cs.setCenter(new ML.LngLat(cam.lng, cam.lat)); cs.setZoom(cam.zoom);
      const at = `${P.name} step ${i + 1}: MapLibre ${ml.center.lng},${ml.center.lat} z${ml.zoom} vs globeDrag ${cam.lng},${cam.lat} z${cam.zoom}`;
      const e = Math.max(dLng(ml.center.lng, cam.lng), Math.abs(ml.center.lat - cam.lat), Math.abs(ml.zoom - cam.zoom));
      worst = Math.max(worst, e);
      assert.ok(e < 1e-9, at);
      assert.equal(ml.bearing, P.cam.bearing || 0, `${P.name}: MapLibre held the bearing`);
    }
  }
  console.log(`worst centre/zoom disagreement over ${PATHS.length} paths: ${worst.toExponential(2)}`);
});

/* ③ WHAT THE CHANGE IS, IN THE UNIT THE USER FEELS: the place under the pointer. Measured on
   MapLibre's own transform so the renderer is the same on both sides and only the LAW differs:
   the law this engine dragged with until now (computeGlobePanCenter, 5.24's drag and 6.x's glide)
   against the law it drags with now. ⚠ Neither is zero — MapLibre holds the bearing, which drops
   the twist and lets the grabbed place slide by twist × distance from the centre. */
test('cesium-globe-drag ③: the grabbed place slips exactly as much as it does on MapLibre, and the old law did not', () => {
  const { globeDrag, panCentre, zoomAdjust } = M._math;
  let differs = 0;
  console.log('path                                   slip at the last on-globe step: MapLibre / globeDrag / old law');
  for (const P of PATHS) {
    const trN = transform(P.cam), trO = transform(P.cam);
    const camN = { ...P.cam, bearing: P.cam.bearing || 0, pitch: P.cam.pitch || 0 };
    const camO = { ...camN };
    let x = W / 2 + P.press[0], y = H / 2 + P.press[1];
    if (!trN.isPointOnMapSurface(new ML.Point(x, y))) continue;
    const grab = trN.screenPointToLocation(new ML.Point(x, y));
    const ref = transform(P.cam), helper = new ML.VerticalPerspectiveCameraHelper();
    let last = null;
    for (let i = 0; i < P.n; i++) {
      x += P.step[0]; y += P.step[1];
      const [dx, dy] = P.step, p = new ML.Point(x, y);
      helper.handleMapControlsPan({ panDelta: new ML.Point(dx, dy), around: p }, ref, ref.center);
      globeDrag(camN, x, y, dx, dy, geoOf(trN));
      trN.setCenter(new ML.LngLat(camN.lng, camN.lat)); trN.setZoom(camN.zoom);
      const oldLat = camO.lat, c = panCentre(camO, dx, dy);
      camO.lng = c.lng; camO.lat = c.lat; camO.zoom += zoomAdjust(oldLat, camO.lat);
      trO.setCenter(new ML.LngLat(camO.lng, camO.lat)); trO.setZoom(camO.zoom);
      if (!ref.isPointOnMapSurface(p)) continue;
      last = { ml: arc(grab, ref.screenPointToLocation(p)), now: arc(grab, trN.screenPointToLocation(p)),
        old: trO.isPointOnMapSurface(p) ? arc(grab, trO.screenPointToLocation(p)) : NaN };
      assert.ok(Math.abs(last.now - last.ml) < 1e-7, `${P.name} step ${i + 1}: slip ${last.now} vs MapLibre ${last.ml}`);
    }
    if (!last) continue;
    console.log(`${P.name.padEnd(38)} ${last.ml.toFixed(4)}° / ${last.now.toFixed(4)}° / ${last.old.toFixed(4)}°`);
    if (!(Math.abs(last.old - last.ml) < 0.01)) differs++;
  }
  /* the change is real: on most paths the old law put a different place under the pointer */
  assert.ok(differs >= 4, `the old law and MapLibre 6 disagreed on only ${differs} paths`);
});

/* ④ WHO CALLS WHAT. The drag (mouse and touch) goes through globeDrag; the glide after the
   release stays on panCentre, because 6.x's handlePanInertia still uses computeGlobePanCenter. */
test('cesium-globe-drag ④: the drags call globeDrag and only the inertia calls panCentre', () => {
  const ast = acorn.parse(INPUT, { ecmaVersion: 'latest', sourceType: 'script' });
  const callers = { globeDrag: new Set(), panCentre: new Set() };
  walker.ancestor(ast, {
    CallExpression(node, _s, anc) {
      const n = node.callee && node.callee.name;
      if (!(n in callers)) return;
      const fn = [...anc].reverse().find((a) => a.type === 'FunctionDeclaration');
      callers[n].add(fn && fn.id ? fn.id.name : '(top)');
    },
  });
  assert.deepEqual([...callers.globeDrag].sort(), ['onMove', 'touchMove']);
  assert.deepEqual([...callers.panCentre].sort(), ['releaseInertia']);
});
