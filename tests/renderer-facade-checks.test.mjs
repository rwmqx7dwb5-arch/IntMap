/* ============================================================================
 *  IntMap · the renderer facade (js/geo-engine.js) — one contract, a MapLibre adapter, a Cesium contract
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r152-checks.test.mjs #13 (phase 1 of the abstraction) and
 *  tests/r160-checks.test.mjs (D1)–(D3) (phase 2). From their headers:
 * ==========================================================================*/
//   #13 IntMapGeoEngine — renderer abstraction + MapLibre adapter + Cesium contract; Atlas camera routed through it
// (D) MapLibre-dependency reduction — Phase 2 of the IntMapGeoEngine renderer abstraction (R152 was Phase 1).
// The adapter/facade contract is broadened with the common camera getters, zoom controls, a render surface and
// feature-state, and the self-contained Atlas camera-control dispatch cases (zoom/bearing/pitch) now read AND
// drive the camera through the engine instead of the raw `map` — so a future engine swap needs no call-site edits.
//
// ⚠ THE CONTRACT IS RUN, NOT READ. Both rounds used to pin the adapter's and the facade's source lines
// verbatim. js/geo-engine.js is an ES module whose MapLibre adapter drives `window.__imap`, so a
// recording stand-in there is the whole renderer as far as the adapter can tell: every claim below
// about "1:1 pass-through" is now asked of the calls the renderer actually receives. The Atlas half
// (the dispatch cases in js/atlas-console.js) stays a source read — see (D3).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));

/* the engine, loaded once for this file into `window` === the global object, and taken down after */
let GE;
const had = {};
before(async () => {
  for (const k of ['window', 'location', '__imap']) had[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  globalThis.window = globalThis;
  if (!globalThis.location) globalThis.location = { search: '' };
  await import('../js/geo-engine.js');
  GE = globalThis.IntMapGeoEngine;
});
after(() => {
  for (const [k, d] of Object.entries(had)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
});

/* a map that records every call the adapter makes on it, and answers the getters with fixed values */
function recordingMap() {
  const calls = [];
  const rec = (name, ret) => (...a) => { calls.push([name, ...a]); return ret; };
  const m = {
    getZoom: rec('getZoom', 3.5), getCenter: rec('getCenter', { lng: 1, lat: 2 }), getBearing: rec('getBearing', 10),
    getPitch: rec('getPitch', 20), getBounds: rec('getBounds', 'BOUNDS'), getCanvas: rec('getCanvas', 'CANVAS'),
    zoomTo: rec('zoomTo'), zoomIn: rec('zoomIn'), zoomOut: rec('zoomOut'), stop: rec('stop'),
    resize: rec('resize'), triggerRepaint: rec('triggerRepaint'), flyTo: rec('flyTo'), easeTo: rec('easeTo'),
    setFeatureState: rec('setFeatureState'), getFeatureState: rec('getFeatureState', {}), removeFeatureState: rec('removeFeatureState'),
    on() {},
  };
  globalThis.__imap = m;
  return { m, calls, of: (name) => calls.filter((c) => c[0] === name).map((c) => c.slice(1)) };
}

test('R152 #13 IntMapGeoEngine renderer abstraction + MapLibre adapter + Cesium contract', () => {
  assert.equal(typeof GE, 'object', 'engine defined');
  /* (#R179) the adapter is built PER VIEW now — a factory over a map getter, so the compare pane
     and the flight-sim minimap each get their own with their own state. Same object, same id. */
  /* spelling kept for this one line — the factory is private to the module's closure; its product is checked below */
  assert.match(html, /function makeMapLibreAdapter\(_m\)\{/, 'MapLibre adapter (per-view factory)');
  assert.equal(GE.adapter().id, 'maplibre', 'MapLibre adapter');
  assert.equal(typeof GE.adapter().capabilities, 'object', '…carrying its declared capabilities');
  const ces = GE.contracts().cesium;
  assert.equal(ces.id, 'cesium', 'Cesium contract (no SDK)');
  assert.equal(ces.implemented, false, 'Cesium contract (no SDK)');
  /* (#R179) …through A(), the adapter GETTER the facade is built over — see the note in r161-checks */
  const r = recordingMap();
  const opts = { center: [139.7, 35.7], zoom: 5 };
  GE.camera.flyTo(opts);
  assert.deepEqual(r.of('flyTo'), [[opts]], 'camera facade delegates to the adapter');   /* (a11y-shared-dialog) through the reduced-motion door, which leaves `opts` alone when motion is not reduced */
  /* a future renderer can be swapped in — and one without an id cannot */
  const original = GE.adapter();
  try {
    const flown = [];
    const other = { id: 'test-renderer', flyTo: (o) => flown.push(o) };
    GE.use({ flyTo() {} });
    assert.equal(GE.adapter(), original, 'an adapter with no id is refused');
    GE.use(other);
    assert.equal(GE.adapter(), other, 'a future renderer can be swapped in');
    GE.camera.flyTo(opts);
    assert.deepEqual(flown, [opts], '…and the facade then drives THAT renderer');
  } finally { GE.use(original); }
  // Atlas camera execution routes through the engine (R160 aliases `const GE=IntMapGeoEngine.camera` in these cases)
  /* (#R171) The pitch case now builds its easeTo options first, because the tilt ceiling is a user setting
     and an angle past the top also turns the bearing around — so the literal `GE.easeTo({pitch:tp,…})` is
     gone while the claim (Atlas drives the camera through the engine) is unchanged. */
  /* spelling kept — the Atlas dispatch cases live in js/atlas-console.js, which runs only with the whole app host */
  assert.match(html, /const GE=IntMapGeoEngine\.camera;[\s\S]*?GE\.easeTo\(opt\)/, 'Atlas pitch routes through the engine');
  assert.match(html, /GE\.easeTo\(\{bearing:tb/, 'Atlas bearing routes through the engine');
});

test('R160 (D1) MapLibreAdapter contract broadened (camera getters, zoom, render, feature-state) — 1:1 pass-through', () => {
  const A = GE.adapter();
  /* with no renderer, every getter answers its empty value instead of throwing */
  globalThis.__imap = null;
  assert.equal(A.getZoom(), null, 'adapter.getZoom');
  assert.equal(A.getCenter(), null, 'adapter.getCenter');
  assert.equal(A.getBearing(), 0, 'adapter.getBearing');
  assert.equal(A.getPitch(), 0, 'adapter.getPitch');
  assert.equal(A.getBounds(), null, 'adapter.getBounds');
  const r = recordingMap();
  assert.equal(A.getZoom(), 3.5, 'adapter.getZoom');
  assert.deepEqual(A.getCenter(), { lng: 1, lat: 2 }, 'adapter.getCenter');
  assert.equal(A.getBearing(), 10, 'adapter.getBearing');
  assert.equal(A.getPitch(), 20, 'adapter.getPitch');
  assert.equal(A.getBounds(), 'BOUNDS', 'adapter.getBounds');
  /* (#R179) the three zoom controls are no longer BARE pass-throughs: each one now records that a
     zoom was named before forwarding it (_declare), because the eye-anchored tilt had no other way
     to tell 「zoom in」 from a gesture and was fighting it — measured, a zoom-button press while
     looking up on the globe drove the viewpoint 2,143 km under the ground. Still 1:1 in the sense
     #R160 meant it: one contract call, one renderer call, no reinterpretation of the argument. */
  const o = { duration: 250 };
  A.zoomTo(7, o); A.zoomIn(o); A.zoomOut(o);
  assert.deepEqual(r.of('zoomTo'), [[7, o]], 'adapter.zoomTo');
  assert.deepEqual(r.of('zoomIn'), [[o]], 'adapter.zoomIn');
  assert.deepEqual(r.of('zoomOut'), [[o]], 'adapter.zoomOut');
  A.resize(); A.triggerRepaint();
  assert.equal(r.of('resize').length, 1, 'adapter.resize');
  assert.equal(r.of('triggerRepaint').length, 1, 'adapter.triggerRepaint');
  /* (#R322) setFeatureState is no longer a BARE pass-through either, for the same kind of reason as
     the zoom controls above: the adapter now counts what it is asked to do, and — when the census
     says an operation repeats itself and the renderer does not deduplicate it — may decline to
     forward a command that would change nothing. Still 1:1 in the sense #R160 meant: one contract
     call, at most one renderer call, and the ARGUMENT is never reinterpreted.
     ⚠ SO THE CHECK ASKS THE PROPERTY RATHER THAN THE SPELLING — and now asks it of the renderer:
     the census ships with featureState OFF (tests/command-census-checks.test.mjs ①), so every call
     must arrive, once, carrying the caller's own objects. */
  const f = { source: 's', id: 1 }, s = { hover: true };
  globalThis.__imap = null;
  A.setFeatureState(f, s);                                /* it still answers nothing when there is no renderer */
  const r2 = recordingMap();
  A.setFeatureState(f, s);
  A.setFeatureState(f, s);
  const fwd = r2.of('setFeatureState');
  assert.equal(fwd.length, 2, 'and forwards them exactly once per call — nothing but the census may stand in front');
  assert.ok(fwd.every(([ff, ss]) => ff === f && ss === s), 'it still forwards the CALLER\'S OWN arguments, unchanged');
  A.removeFeatureState(f, 'hover'); A.removeFeatureState(f);
  assert.deepEqual(r2.of('removeFeatureState'), [[f, 'hover'], [f]], 'adapter.removeFeatureState (with/without key)');
});

test('R160 (D2) IntMapGeoEngine facade exposes the broadened contract', () => {
  /* (#R179) the facade is a FUNCTION of an adapter now (engineFacade(A)), so the bindings read
     `A().x()` rather than `_adapter.x()` — an additional view has to get the same object, and it
     cannot if the object closes over the engine's own adapter. The claim is unchanged. */
  const r = recordingMap();
  const C = GE.camera;
  assert.deepEqual([C.getZoom(), C.getCenter(), C.getBearing(), C.getPitch(), C.getBounds()],
    [3.5, { lng: 1, lat: 2 }, 10, 20, 'BOUNDS'], 'camera getters on the facade');
  const o = { duration: 100 };
  C.zoomTo(6, o); C.zoomIn(o); C.zoomOut(o); C.stop();   /* (a11y-shared-dialog) _calm = the reduced-motion door */
  assert.deepEqual([r.of('zoomTo'), r.of('zoomIn'), r.of('zoomOut'), r.of('stop').length],
    [[[6, o]], [[o]], [[o]], 1], 'zoom controls on the facade');
  const f = { source: 's', id: 2 }, s = { sel: 1 };
  GE.layers.setFeatureState(f, s); GE.layers.removeFeatureState(f, 'sel');
  assert.deepEqual([r.of('setFeatureState'), r.of('removeFeatureState')], [[[f, s]], [[f, 'sel']]],
    'feature-state on the layers namespace');
  // (#R161) the render namespace gained container/size/setCursor — assert the R160 members only
  GE.render.resize(); GE.render.triggerRepaint();
  assert.deepEqual([r.of('resize').length, r.of('triggerRepaint').length, GE.render.canvas()], [1, 1, 'CANVAS'],
    'render namespace (resize/repaint/canvas)');
});

test('R160 (D3) Atlas camera-control dispatch (zoom/bearing/pitch) reads AND drives via the engine', () => {
  /* spelling kept — the dispatch cases live in js/atlas-console.js's switch, which runs only with the whole app host (auth, model, map) */
  ok('const GE=IntMapGeoEngine.camera; if(a.to!=null){ tz=+a.to; GE.zoomTo(tz,{duration:600}); }', 'zoom case routes through the engine');
  ok('GE.getZoom()-1; GE.zoomOut();', 'zoom-out reads + drives through the engine');
  ok('(a.delta!=null?(GE.getBearing()+(+a.delta)):0)); GE.easeTo({bearing:tb', 'bearing case reads getBearing + drives easeTo through the engine');
  /* (#R171) The literal call shape here was pinning the CLAMP as well as the routing: the tilt ceiling is a
     user setting now (Settings ▸ Map tilt limit), so a hard-coded Math.min(85,…) is exactly what must NOT be
     there, and easeTo takes an options object because an angle past the top also changes the bearing. The
     claim this test exists to make — "reads through the engine, drives through the engine" — is unchanged. */
  ok('(a.delta!=null?(GE.getPitch()+(+a.delta)):(a.on===false?0:60))', 'pitch case reads getPitch through the engine');
  ok('GE.easeTo(opt); }catch(_){}', 'pitch case drives easeTo through the engine');
});
