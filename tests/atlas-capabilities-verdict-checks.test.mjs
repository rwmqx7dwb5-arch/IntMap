/* ============================================================================
 *  js/atlas-capabilities.js — the verdicts: rendered, not rendered, not rendering
 * ----------------------------------------------------------------------------
 *  The observer / verify pairs that said 「not_rendered」 over a map that showed the answer: the
 *  reachable area and the camera (#R740), the painted countries (#R742), and 「it did not move」 vs
 *  「I could not see it move」 (#R768).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilityEntry } from './helpers/atlas-kernel.mjs';
import { importModule, swappable } from './helpers/import-module.mjs';

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
/* ⚠ (consolidation) loading js/geo-engine.js PUBLISHES window.IntMapGeoEngine as a side effect (its compat
   window). Only the facade factory is wanted (#R740, #R768 ⑤), so it is loaded ONCE, here, read off the
   module's export, and the global is put back the way it was found. */
const _geBefore = window.IntMapGeoEngine;
const { IntMapGeoEngine: ENGINE } = await import('../js/geo-engine.js');
if (_geBefore === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = _geBefore;
/* (module-graph) js/atlas-capabilities.js IMPORTS the engine — it no longer reads window.IntMapGeoEngine —
   so every stub renderer below is handed to it at that import edge: ONE swappable seat, set per case and
   put back after it. Between cases the seat is empty — an engine with no method to ask. */
const engineSeat = swappable();
let _seated = null;
const seatEngine = (r) => { _seated = r || null; engineSeat.set(r || {}); };
const seatedEngine = () => _seated;
const capabilitiesWithSeat = () => importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r740-isochrone-verdict-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R740 — THE REACHABLE AREA WAS ON THE SCREEN AND THE VERDICT SAID
 *         「not_rendered」, FIVE TIMES, UNTIL THE TURN DIED AND `reset` ERASED IT
 * ----------------------------------------------------------------------------
 *  Measured on production, 2026-09-15, signed in:
 *  「渋谷駅から徒歩30分で行ける範囲を地図に出して。面積も教えて。」 — `IntMapAtlasDebug.lastPlan()`
 *  recorded six isochrone calls in 1m09s / 16 steps:
 *
 *      isochrone "渋谷駅" [ok]            ← because `visible`/`objects` moved, not because
 *      isochrone "渋谷駅" [not_rendered]     anything looked at the reachable area
 *      isochrone "渋谷駅" [not_rendered]
 *      isochrone "渋谷駅" [not_rendered]
 *      isochrone "渋谷駅" [not_rendered]
 *      isochrone "渋谷駅" [not_rendered]
 *      reset [ok]                        ← and this took the polygon back off the map
 *      stopped: step_budget
 *
 *  The polygon was correct on the first draw and stayed visible the whole time. The area was never
 *  answered; the reply ended in the future tense. Five stacked `fill-opacity:0.18` fills also made
 *  the basemap under it unreadable.
 *
 *  ⚠ AND THE SAME SHAPE AGAIN, ON THE CAMERA — second half of this file. 「did anything move」 is the
 *  wrong question for a reader who asked for a STATE, whether the state is a polygon on the map or a
 *  continent on the screen. The file keeps its name because it keeps its subject.
 *
 *  ⚠ THESE TESTS DO NOT READ THE SOURCE (#R505). They build the SHIPPED registry
 *  (`makeAtlasCapabilities`), take the capability's own `observe`/`verify` off it, and EVALUATE them
 *  against a stub renderer whose only job is to answer `layers.sourceData(id)` — because the defect
 *  was in what the verifier looked at, and only running it can show what it looks at.
 * ==========================================================================*/


if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await capabilitiesWithSeat();   /* (module-graph) the engine edge is the seat above */

/* js/map-tools.js:1042 — `const SRC='im-iso-src'`, drawn as im-iso-fill / im-iso-line / im-iso-ctr */
const ISO_SRC = 'im-iso-src';

/* A renderer that holds exactly the sources it is given. Every façade name below is one the real
   observers call (js/geo-engine.js): layers.sourceData, scene.getStyle, camera.*, hasRenderer. */
/* (atlas-observer-undo) the reach is now asked of the renderer — `render.drawn()` — by the effect key
   js/map-tools.js claims `im-iso-src` under. The answer comes from the SHIPPED facade
   (js/geo-engine.js makeFacade) over an adapter holding exactly `sources`, not from a retyped copy. */
function drawnFacade(sources) {
  const f = ENGINE.makeFacade({
    raw: () => ({}), canDraw: () => true, isVisible: () => true,
    hasSource: (id) => id in sources,
    sourceData: (id) => ((id in sources) ? { type: 'FeatureCollection', features: sources[id] } : null),
    getStyle: () => ({ layers: [{ id: 'im-iso-fill', source: ISO_SRC }, { id: 'im-iso-line', source: ISO_SRC }, { id: 'im-iso-ctr', source: ISO_SRC }] })
  });
  f.render.claim(ISO_SRC, 'map.isochrone');
  return f.render;
}
function renderer(sources) {
  return {
    hasRenderer: () => true,
    render: drawnFacade(sources),
    layers: {
      sourceData: (id) => {
        if (!(id in sources)) throw new Error('no such source: ' + id);
        return { type: 'FeatureCollection', features: sources[id] };
      }
    },
    scene: { getStyle: () => ({ layers: [{ id: 'im-iso-fill' }, { id: 'im-iso-line' }, { id: 'im-iso-ctr' }] }) },
    camera: { getCenter: () => ({ lng: 139.7, lat: 35.66 }), getZoom: () => 13, getBearing: () => 0, getPitch: () => 0 }
  };
}
function polygons(n) {
  return Array.from({ length: n }, (_, i) => ({ type: 'Feature', properties: { min: 30, col: '#0a84ff', i },
    geometry: { type: 'Polygon', coordinates: [[[139.7, 35.6], [139.8, 35.6], [139.8, 35.7], [139.7, 35.6]]] } }));
}

function withMap(sources, fn) {
  const had = seatedEngine();
  seatEngine(renderer(sources));
  try { return fn(); } finally { seatEngine(had); }
}

/* ── the camera half (the fourth case of the same shape, below) ──────────────────────────────────
   `getBounds()` returns the four readers BOTH adapters really expose — js/geo-engine.js:1145 hands
   back MapLibre's LngLatBounds, js/cesium-engine.js:2352 builds an object with the same four. */
function camRenderer(cam) {
  return {
    hasRenderer: () => true,
    isAnimating: () => false,
    layers: { sourceData: () => { throw new Error('not a source question'); } },
    scene: { getStyle: () => ({ layers: [] }) },
    camera: {
      getCenter: () => ({ lng: cam.lng, lat: cam.lat }),
      getZoom: () => cam.zoom, getBearing: () => cam.bearing || 0, getPitch: () => cam.pitch || 0,
      getBounds: () => (cam.view ? {
        getWest: () => cam.view[0], getSouth: () => cam.view[1],
        getEast: () => cam.view[2], getNorth: () => cam.view[3]
      } : null)
    }
  };
}
function withCamera(cam, fn) {
  const had = seatedEngine();
  seatEngine(camRenderer(cam));
  try { return fn(); } finally { seatEngine(had); }
}
/* What `cameraNow()` produced for that camera — taken from the SHIPPED observer, not retyped.
   ⚠ It installs and restores around the AWAIT: the camera observer is async (#R726 — it waits for
   the flight to land), and a `try/finally` that returns the promise restores the engine before the
   observer ever reads it, which yields a null snapshot and a verdict about nothing. */
async function snapshot(cam) {
  const had = seatedEngine();
  seatEngine(camRenderer(cam));
  try { return await CAPS.resolve('view.flyTo').observe(); }
  finally { seatEngine(had); }
}

/* The camera the production turn was in: Europe is on the screen, zoom 4, north-up, flat. */
const EUROPE = { lng: 15, lat: 50, zoom: 4, bearing: 0, pitch: 0, view: [-12, 35, 42, 62] };

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const iso = CAPS.resolve('routing.isochrone');
const generic = CAPS.resolve('map.choropleth');   /* a capability that is still on the generic `paint` verdict */

test('R740 ①: the reach is watched by a verifier of its own, not by the generic paint diff', () => {
  assert.ok(iso, 'routing.isochrone is in the registry');
  assert.equal(iso.observerKind, 'isochrone',
    'routing.isochrone is back on `paint` — the verdict is a count diff again');
  assert.equal(typeof iso.observe, 'function');
  assert.equal(typeof iso.verify, 'function');
  /* the observation is OF the isochrone source: reading it with the source absent must not be
     silently survivable as "0 features present" — the stub throws, the helper returns -1. */
  const seen = withMap({ [ISO_SRC]: polygons(3) }, () => iso.observe());
  assert.equal(seen.iso, 3, `the observation did not read ${ISO_SRC}: ${JSON.stringify(seen)}`);
});

test('R740 ②: drawing the SAME reachable area again is rendered, not `not_rendered`', () => {
  /* THE PRODUCTION FAILURE. The map does not move between the two readings — same source, same three
     polygons, byte-identical observations — and that is precisely the state Atlas was in on redraws
     two through six. */
  withMap({ [ISO_SRC]: polygons(3) }, () => {
    const before = iso.observe();
    const after = iso.observe();
    assert.equal(JSON.stringify(before), JSON.stringify(after),
      'the two observations must be identical for this test to be about a redraw at all');
    const v = iso.verify({}, { place: '渋谷駅', minutes: 30, mode: 'walk' }, before, after, { ok: true, html: '' });
    assert.equal(v.status, 'completed', `a redraw of the same reach was called ${v.status}/${v.code}`);
    assert.equal(v.code, 'ok');
    assert.equal(v.observed.isochrone.features, 3, 'the verdict carries what is actually on the map');
  });
});

test('R740 ③: a first draw is rendered too — 0 → n is completed', () => {
  const before = withMap({ [ISO_SRC]: [] }, () => iso.observe());
  withMap({ [ISO_SRC]: polygons(1) }, () => {
    const v = iso.verify({}, { place: '渋谷駅', minutes: 30 }, before, iso.observe(), { ok: true, html: '' });
    assert.equal(v.status, 'completed');
    assert.equal(v.code, 'ok');
  });
});

test('R740 ④: an empty reach source is still `not_rendered` — the refusal was not removed', () => {
  withMap({ [ISO_SRC]: [] }, () => {
    const before = iso.observe();
    const v = iso.verify({}, { place: '渋谷駅', minutes: 30 }, before, iso.observe(), { ok: true, html: '' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'not_rendered');
    assert.deepEqual(v.produced, []);
    assert.equal(v.observed.isochrone.features, 0);
  });
});

test('R740 ⑤: an unreadable source is not reported as a rendered map', () => {
  /* `sourceFeatureCount` answers -1 when the source is not there at all (the #R397 guard). That is
     "could not observe", and it may never become `ok`. */
  withMap({}, () => {
    const o = iso.observe();
    assert.equal(o.iso, -1);
    const v = iso.verify({}, { place: '渋谷駅' }, o, o, { ok: true, html: '' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'not_rendered');
  });
});

test('R740 ⑥: a dispatch that failed is still `failed`, not a rendered map', () => {
  withMap({ [ISO_SRC]: polygons(3) }, () => {
    const o = iso.observe();
    const v = iso.verify({}, { place: '渋谷駅' }, o, o, { ok: false, meta: { code: 'geocode_failed' }, html: '' });
    assert.equal(v.status, 'failed');
    assert.equal(v.code, 'geocode_failed');
  });
});

test('R740 ⑦: the generic `paint` verdict still refuses a map that declares nothing and did not move', () => {
  /* ⚠ THIS TEST USED TO SAY 「the generic `paint` verdict is unchanged」, AND THAT SENTENCE WAS THE
     DEFECT #R742 HAD TO UNDO. This round gave the reach its own verifier and left the generic paint
     verdict asking「did anything move」— then wrote the leaving-it-alone down as deliberate. It was
     the SAME defect: measured on production 2026-09-15,「Which countries border Kazakhstan?」 painted
     six neighbours and was told `not_rendered` three times, and 「シベリア鉄道の経路」 five times.
     What was worth keeping is the REFUSAL, and it is kept here: with nothing moving and nothing
     declared, there is no evidence of a drawing and none is invented. What #R742 added is the third
     rung — a painter that declares WHAT it painted, held against the map (tests/r742-…). */
  assert.equal(generic.observerKind, 'paint');
  withMap({ 'nlq-poly-src': [], 'nlq-line-src': [], 'user-pins': [], 'nlq-poi-src': [],
    'atl-compose-src': [], 'shk-cont-src': [], 'nlq-fac-src': [] }, () => {
    const before = generic.observe();
    const v = generic.verify({}, {}, before, generic.observe(), { ok: true, html: '' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'not_rendered');
    /* …and a result that DOES declare what it painted, over a map whose painter declared no state at
       all (`window._imAtlasPaint` is absent here), is「could not be observed」— never a pass. */
    const claimed = generic.verify({}, {}, before, generic.observe(),
      { ok: true, html: '', meta: { painted: { choro: ['JPN', 'USA'] } } });
    assert.equal(claimed.code, 'not_rendered', 'a declaration with nothing to hold it against proves nothing');
  });
});

test('R740 ⑧: the paint observation now SEES the reach — and that is why the verdict, not a list, had to move', () => {
  /* It used to assert the opposite: `paintNow()` enumerated its surfaces by hand and `im-iso-src` was
     not among them, so a reach appearing moved NOTHING the generic observer read. (atlas-observer-undo)
     retired the hand list: painters CLAIM their sources with the renderer and the observation carries
     every claimed surface, so the reach appearing now does move it. ⚠ What this round's rule still
     says is true: a DIFF over it calls an identical redraw not_rendered, which is why routing.isochrone
     keeps a verifier that reads the reach AFTER the call (②) rather than the generic paint diff. */
  const base = { 'nlq-poly-src': [], 'nlq-line-src': [], 'user-pins': [], 'nlq-poi-src': [],
    'atl-compose-src': [], 'shk-cont-src': [], 'nlq-fac-src': [] };
  const empty = withMap({ ...base, [ISO_SRC]: [] }, () => generic.observe());
  const drawn = withMap({ ...base, [ISO_SRC]: polygons(3) }, () => generic.observe());
  assert.notEqual(JSON.stringify(empty), JSON.stringify(drawn), 'a claimed surface appearing did not move the paint observation');
  assert.equal(drawn.surfaces[ISO_SRC], 3, 'the observation carries what the claimed reach holds');
  const redraw = withMap({ ...base, [ISO_SRC]: polygons(3) }, () => generic.observe());
  assert.equal(JSON.stringify(drawn), JSON.stringify(redraw), 'an identical redraw is still identical — the diff alone cannot tell it from a failure');
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE SAME SHAPE, A FOURTH TIME — THE CAMERA
 * ------------------------------------------------------------------------------------------------
 *  Measured on production, 2026-09-15, signed in:
 *  「ヨーロッパの気温をGFSモデルで表示して、等圧線も重ねて。ついでに風のパーティクルも気温の上に出して。」
 *
 *      flyTo "ヨーロッパ" [no_change] ×2 → flyTo "Europe" [no_change] ×2 → flyTo "ヨーロッパ" [ok]
 *      stopped: repeated_calls   (7 steps, 92 s)
 *
 *  Europe was on the screen from the first step, and all three layers really were drawn. The whole
 *  turn went on flying to where the camera already was — the loop even changed language, as if the
 *  WORD had been what failed. The verifier's stated invariant was 「one that asked for movement is
 *  complete only when the camera really is somewhere else」, and the reader had asked for a VIEW.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

const flyTo = CAPS.resolve('view.flyTo');
const zoomCap = CAPS.resolve('view.zoom');
const pitchCap = CAPS.resolve('view.pitch');
const bearingCap = CAPS.resolve('view.bearing');

test('R740 ⑨: a flyTo to a point ALREADY on the screen is completed, not `no_change`', async () => {
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    /* Paris — inside the viewport the camera is already showing; the camera does not move */
    const v = flyTo.verify({}, { lng: 2.35, lat: 48.86 }, same, same, { ok: true, html: 'Moved to: Paris' });
    assert.notEqual(v.status, 'partial', `the reader asked for a view they already had and got ${v.code}`);
    assert.equal(v.status, 'completed');
    assert.equal(v.code, 'already_there', 'and it says WHY it is complete — not the failure code `no_change`');
    assert.equal(v.observed.already, true);
  });
});

test('R740 ⑩: a flyTo to a point that is NOT on the screen and did not move is still `no_change`', async () => {
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    /* Tokyo, while the map shows Europe: the camera really did fail to go there */
    const v = flyTo.verify({}, { lng: 139.7, lat: 35.68 }, same, same, { ok: true, html: '' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'no_change');
  });
});

test('R740 ⑪: a NAMED destination is not guessed — it stays `no_change`, and that is the honest answer', async () => {
  /* The production case itself. Nothing in this process knows where 「ヨーロッパ」 is: the dispatch
     resolves it into a module-private `_lastPlace` and returns the name only as prose. Passing this
     would require guessing that a camera which did not move was already looking at it. The repair is
     structural and belongs to the mover — see the comment in js/atlas-capabilities.js. */
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    const v = flyTo.verify({}, { place: 'ヨーロッパ' }, same, same, { ok: true, html: 'Moved to: ヨーロッパ' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'no_change');
  });
  /* …and a matching zoom must not be mistaken for a matching PLACE */
  withCamera(EUROPE, () => {
    const v = flyTo.verify({}, { place: 'ヨーロッパ', zoom: 4 }, same, same, { ok: true, html: '' });
    assert.equal(v.code, 'no_change', 'the zoom agreed while the destination was never checked');
  });
});

test('R740 ⑫: a camera that really moved is `ok`, and a failed dispatch is still `failed`', async () => {
  const before = await snapshot(EUROPE);
  const after = await snapshot({ ...EUROPE, lng: 139.7, lat: 35.68, view: [130, 30, 145, 42] });
  withCamera(EUROPE, () => {
    assert.equal(flyTo.verify({}, { place: '東京' }, before, after, { ok: true, html: '' }).code, 'ok');
    const f = flyTo.verify({}, { place: 'nowhere' }, before, before, { ok: false, meta: { code: 'not_found' }, html: '' });
    assert.equal(f.status, 'failed');
    assert.equal(f.code, 'not_found');
  });
});

test('R740 ⑬: asking twice for a number the camera already holds is completed on every axis', async () => {
  const cam = { ...EUROPE, bearing: 0, pitch: 60, zoom: 4 };
  const same = await snapshot(cam);
  withCamera(cam, () => {
    assert.equal(zoomCap.verify({}, { to: 4 }, same, same, { ok: true, html: '' }).code, 'already_there',
      '「ズーム4にして」を2回言うと2回目が失敗になる — the same defect on the zoom axis');
    assert.equal(pitchCap.verify({}, { deg: 60 }, same, same, { ok: true, html: '' }).code, 'already_there',
      '「30°に傾けて」を2回言って2回目が失敗になるのは同じ欠陥');
    assert.equal(bearingCap.verify({}, { deg: 0 }, same, same, { ok: true, html: '' }).code, 'already_there');
    /* …and a number it does NOT hold is unchanged from before */
    assert.equal(zoomCap.verify({}, { to: 9 }, same, same, { ok: true, html: '' }).code, 'no_change');
    assert.equal(pitchCap.verify({}, { deg: 0 }, same, same, { ok: true, html: '' }).code, 'no_change');
  });
});

test('R740 ⑭: `deg` is the BEARING on one capability and the PITCH on another, and the verdict knows which', async () => {
  /* The reason the capability id reaches the shared verifier at all. This camera holds pitch 60 and
     bearing 0; `{deg:60}` is satisfied by one of them and not by the other, and a verifier that had
     to infer the axis would have to guess. */
  const cam = { ...EUROPE, bearing: 0, pitch: 60 };
  const same = await snapshot(cam);
  withCamera(cam, () => {
    assert.equal(pitchCap.verify({}, { deg: 60 }, same, same, { ok: true, html: '' }).code, 'already_there');
    assert.equal(bearingCap.verify({}, { deg: 60 }, same, same, { ok: true, html: '' }).code, 'no_change');
  });
});

test('R740 ⑮: a bearing is compared on the circle — 359° and 1° are two degrees apart', async () => {
  const cam = { ...EUROPE, bearing: 359.8 };
  const same = await snapshot(cam);
  withCamera(cam, () => {
    assert.equal(bearingCap.verify({}, { deg: 0 }, same, same, { ok: true, html: '' }).code, 'already_there',
      '0° and 359.8° are the same direction — a straight subtraction calls them 360 apart');
    assert.equal(bearingCap.verify({}, { deg: 180 }, same, same, { ok: true, html: '' }).code, 'no_change');
  });
});

test('R740 ⑯: a camera op that asked for nothing, and an unobservable viewport, behave as before', async () => {
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    /* a re-assert (`view.resetNorth` sends no arguments) was always a completion */
    assert.equal(CAPS.resolve('view.resetNorth').verify({}, {}, same, same, { ok: true, html: '' }).code, 'ok');
  });
  /* no bounds to read → the point cannot be measured → the verdict is the one it always was */
  withCamera({ ...EUROPE, view: null }, () => {
    const v = flyTo.verify({}, { lng: 2.35, lat: 48.86 }, same, same, { ok: true, html: '' });
    assert.equal(v.status, 'partial');
    assert.equal(v.code, 'no_change', 'an unreadable viewport must not be read as agreement');
  });
});

/* ── the mover's declaration (#R736's rule, now on the camera) ─────────────────────────────────
   Europe as the gazetteer returns it: a footprint, which is what `flyToBox` fits. */
const EUROPE_BOX = [[-12, 35], [42, 62]];
const destOf = (dest) => ({ ok: true, html: 'Moved to: ヨーロッパ', meta: { dest } });

test('R740 ⑰: THE PRODUCTION CASE — a named place the dispatch declared, already on the screen', async () => {
  /* flyTo "ヨーロッパ" ×4, all `no_change`, while Europe filled the screen. The gazetteer's answer
     now travels with the result, so the verdict can be measured instead of guessed. */
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    const v = flyTo.verify({}, { place: 'ヨーロッパ' }, same, same,
      destOf({ lng: 15, lat: 48.5, box: EUROPE_BOX, name: 'Europe' }));
    assert.equal(v.status, 'completed', `the fourth flight to Europe was called ${v.status}/${v.code}`);
    assert.equal(v.code, 'already_there');
  });
});

test('R740 ⑱: a declaration is READ, not trusted — a destination the camera is not showing fails', async () => {
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    /* Japan declared while the map shows Europe: the dispatch says it flew there and it did not */
    const far = flyTo.verify({}, { place: '日本' }, same, same,
      destOf({ lng: 138, lat: 38, box: [[128, 30], [146, 46]], name: 'Japan' }));
    assert.equal(far.code, 'no_change');
    /* …and a box only a sliver of which is on screen is not the box the reader named */
    const sliver = flyTo.verify({}, { place: 'Eurasia' }, same, same,
      destOf({ lng: 90, lat: 50, box: [[35, 35], [180, 62]], name: 'Eurasia' }));
    assert.equal(sliver.code, 'no_change', 'a box the viewport clips to a corner is not «already there»');
  });
});

test('R740 ⑲: no declaration, or an unmeasurable one, is still `no_change` — nothing is guessed', async () => {
  const same = await snapshot(EUROPE);
  withCamera(EUROPE, () => {
    assert.equal(flyTo.verify({}, { place: 'ヨーロッパ' }, same, same,
      { ok: true, html: 'Moved to' }).code, 'no_change', 'a result with no meta declares nothing');
    assert.equal(flyTo.verify({}, { place: 'ヨーロッパ' }, same, same, destOf({ name: 'Europe' })).code,
      'no_change', 'a dest with neither a box nor a coordinate cannot be measured');
    assert.equal(flyTo.verify({}, { place: 'ヨーロッパ' }, same, same,
      destOf({ box: [[42, 62], [-12, 35]], name: 'Europe' })).code, 'no_change', 'and an inside-out box is not a box');
  });
});

test('R740 ⑳: a VIEWPORT that straddles the antimeridian is measured on the circle', async () => {
  /* Fiji. The view runs from west 176° to east −177°, so its west edge is a LARGER number than its
     east edge; subtracting them gives −353° and a naive reading calls the screen empty or infinite.
     ⚠ A wrapped BOX cannot occur: js/atlas-geo-resolve.js `_bboxOK` refuses east ≤ west, so every box
     that reaches `flyToBox` — and therefore every box declared here — is unwrapped. The wrap that is
     real is the one on this side; ⑲ above keeps the refusal of the other. */
  const FIJI = { lng: 179, lat: -17, zoom: 6, bearing: 0, pitch: 0, view: [176, -20, -177, -14] };
  const same = await snapshot(FIJI);
  withCamera(FIJI, () => {
    const here = destOf({ lng: 178, lat: -17, box: [[177, -19], [179, -15]], name: 'Viti Levu' });
    assert.equal(flyTo.verify({}, { place: 'フィジー' }, same, same, here).code, 'already_there',
      'the box is on the screen; only the arithmetic wrapped');
    const across = destOf({ lng: -178.5, lat: -17, box: [[-179, -19], [-178, -15]], name: 'Taveuni' });
    assert.equal(flyTo.verify({}, { place: 'タベウニ' }, same, same, across).code, 'already_there',
      'and so is the half of the screen whose longitudes are negative');
    const away = destOf({ lng: 15, lat: 48.5, box: EUROPE_BOX, name: 'Europe' });
    assert.equal(flyTo.verify({}, { place: 'ヨーロッパ' }, same, same, away).code, 'no_change',
      'a wrapped viewport must not swallow the rest of the planet');
  });
});

/* ── and the other half of the same fact: the dispatch really does declare, on EVERY branch ──────
   ⚠ NOT A CHECK ON THE SPELLING OF THE SOURCE (#R505 / #R488). view.flyTo's run is imported from the
   shipped js/atlas-cap-view.js and CALLED, once per branch, with a recording camera as its K — no text is
   lifted any more (atlas-capability-modules: the case became a function of its dependencies) — so what is asserted
   is that the destination the result DECLARES is the destination that was handed to the camera. A
   branch that moves the camera and forgets to declare fails here. The census under it is what makes a
   NEW branch fail too: a success return nobody drove is a red test rather than a silent omission. */
const FLYTO_ENTRY = (await import('../js/atlas-cap-view.js')).default.find((e) => e.row[1] === 'flyTo');
assert.ok(FLYTO_ENTRY && typeof FLYTO_ENTRY.run === 'function', 'js/atlas-cap-view.js no longer has the flyTo entry — this check lost its subject');
const FLYTO_BLOCK = capabilityEntry('flyTo').run;   /* its source, for the census of branches below */

function flyToHarness(opts) {
  const flights = [];
  const D = {
    WORLD_RE: /^(world|whole world|globe|earth|全世界|世界)$/i,
    DEIXIS_RE: /^(here|there|ここ|そこ)$/i,
    /* js/atlas-console.js's R(ok, html, extra) merges the extra onto the result */
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
    note: (x) => String(x), warn: (x) => String(x), esc: (x) => String(x == null ? '' : x),
    L: (en) => en, _ambigNote: () => '', _setLast: (x) => x,
    _bboxOK: (b) => Array.isArray(b) && Array.isArray(b[0]) && Array.isArray(b[1]),
    placeExtent: async () => opts.extent || null,
    geocode: async () => opts.geo || null,
    flyToBox: (box) => { if (!opts.fitWorks) return false; flights.push({ box }); return true; },
    GE: () => ({ camera: {
      flyTo: (o) => flights.push({ center: o.center, zoom: o.zoom }),
      zoomTo: (z) => flights.push({ zoom: z }),
      getCenter: () => ({ lng: 15, lat: 50 }), getZoom: () => 4
    } })
  };
  /* D is the run's K: exactly the kernel names view.flyTo's run declares it reads (its first line) */
  return { run: (a) => FLYTO_ENTRY.run(a, {}, D), flights };
}

test("R740 ㉑: every branch of the shipped flyTo case declares the destination it flew to", async () => {
  /* ① the whole planet */
  let h = flyToHarness({});
  let r = await h.run({ place: 'world' });
  assert.ok(r.meta && r.meta.dest, 'the world branch flew and declared nothing');
  assert.equal(r.meta.dest.lat, 20);
  assert.deepEqual(h.flights.at(-1).center, [r.meta.dest.lng, 20], 'the declaration is the centre it actually used');

  /* ② an explicit coordinate */
  h = flyToHarness({});
  r = await h.run({ lng: 2.35, lat: 48.86 });
  assert.deepEqual([r.meta.dest.lng, r.meta.dest.lat], [2.35, 48.86]);
  assert.deepEqual(h.flights.at(-1).center, [2.35, 48.86], 'declared what it handed to the camera');
  assert.equal(h.flights.at(-1).zoom, r.meta.dest.zoom);

  /* ③ a named place with a real footprint — the production path */
  h = flyToHarness({ extent: { lng: 15, lat: 48.5, box: EUROPE_BOX, name: 'Europe' }, fitWorks: true });
  r = await h.run({ place: 'ヨーロッパ' });
  assert.deepEqual(r.meta.dest.box, EUROPE_BOX, 'the footprint it fitted is the footprint it declared');
  assert.deepEqual(h.flights.at(-1).box, EUROPE_BOX);

  /* ③b …and when the fit fails it flew to a POINT, so it must not claim a fitted box */
  h = flyToHarness({ extent: { lng: 15, lat: 48.5, box: EUROPE_BOX, name: 'Europe' }, fitWorks: false });
  r = await h.run({ place: 'ヨーロッパ' });
  assert.equal(r.meta.dest.box, null, 'a box that was never fitted must not be declared as one');
  assert.deepEqual(h.flights.at(-1).center, [15, 48.5]);

  /* ④ the gazetteer fallback, with a usable bbox and with an explicit zoom */
  h = flyToHarness({ geo: { lng: 139.7, lat: 35.68, bbox: [[139, 35], [140, 36]], name: '渋谷' }, fitWorks: true });
  r = await h.run({ place: '渋谷' });
  assert.deepEqual(r.meta.dest.box, [[139, 35], [140, 36]]);
  h = flyToHarness({ geo: { lng: 139.7, lat: 35.68, name: '渋谷' } });
  r = await h.run({ place: '渋谷', zoom: 12 });
  assert.equal(r.meta.dest.zoom, 12);
  assert.equal(h.flights.at(-1).zoom, 12);

  /* ⑤ nothing was resolved: declaring a destination here would be the lie the verdict must refuse */
  h = flyToHarness({});
  r = await h.run({ place: 'no such place' });
  assert.equal(r.ok, false);
  assert.equal(r.meta, undefined, 'a failed flyTo declared a destination it never reached');

  /* the census — five returns, five branches driven above */
  assert.equal((FLYTO_BLOCK.match(/return R\(true/g) || []).length, 4, 'a success branch was added or removed');
  assert.equal((FLYTO_BLOCK.match(/return R\(false/g) || []).length, 1, 'a failure branch was added or removed');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r742-paint-verdict-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R742 — THE SIX COUNTRIES WERE ON THE MAP AND THE VERDICT SAID
 *         「not_rendered」, UNTIL THE TURN DIED RE-PAINTING THEM
 * ----------------------------------------------------------------------------
 *  Measured on production, 2026-09-15, signed in:
 *
 *    「Which countries border Kazakhstan?」   highlight [FAIL/failed] → [FAIL/not_rendered]
 *                                            → [FAIL/not_rendered]      10 steps, 26.2 s
 *                                            …while the map had the six neighbours painted
 *                                            correctly from the first call.
 *    「シベリア鉄道の経路」                     railAxis [FAIL/not_rendered] ×5, 18 steps, 1m44s
 *    「地中海の最深点へ飛んでマークして」          the same pin at 36.5585, 21.1286 dropped SEVEN
 *                                            times, 22 steps, 2m14s, six pins on the map
 *
 *  Root cause: `paint.verify` decided「did this draw anything」by diffing the observation, and every
 *  value in the observation is a CARDINAL — feature counts, visible-layer counts, object counts, and
 *  (since #R736) the painter's own counts of highlighted countries, polygons, lines and shaded codes.
 *  A cardinal cannot tell a redraw from a failure, and it cannot tell a REPAIR from either: six
 *  countries repainted as six OTHER countries is 6 → 6. Second root cause: `meta.partial` returned
 *  `not_rendered` without reading the map at all, so thirteen shapes drawn and one target unresolved
 *  was reported as「nothing was drawn」.
 *
 *  ⚠ THIS IS #R740's SHAPE ON THE OTHER HALF OF THE SAME FILE. There the camera learned to ask「is
 *  the reader looking at what they asked for」instead of「did the camera move」; the generic paint
 *  verdict was left asking the movement question, and tests/r740 ⑦ wrote that down as deliberate.
 *
 *  ⚠ THESE TESTS DO NOT READ THE SOURCE (#R505). They build the SHIPPED registry
 *  (`makeAtlasCapabilities`) and the SHIPPED painter state (`makeEraHighlight().paintState`), wire
 *  them together the way js/atlas-console.js:364 does, and EVALUATE the observer/verifier pair
 *  against a stub renderer — because the defect was in what the verdict could SEE.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await capabilitiesWithSeat();   /* (module-graph) the engine edge is the seat above */
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const hl = CAPS.resolve('map.highlight');

/* the seven sources `paintNow()` counts. They stay empty throughout: a country highlight adds a
   feature to NONE of them (it paints with `setFeatureState` on `nlq-src`), which is the whole
   reason the painter has to declare its own state. */
const SOURCES = ['nlq-poly-src', 'nlq-line-src', 'user-pins', 'nlq-poi-src', 'atl-compose-src',
  'shk-cont-src', 'nlq-fac-src'];

function renderer() {
  const empty = { type: 'FeatureCollection', features: [] };
  return {
    hasRenderer: () => true,
    layers: { sourceData: (id) => { if (SOURCES.indexOf(id) < 0) throw new Error('no such source: ' + id); return empty; } },
    scene: { getStyle: () => ({ layers: [{ id: 'nlq-fill' }, { id: 'ofm-country' }] }) },
    camera: { getCenter: () => ({ lng: 60, lat: 48 }), getZoom: () => 3, getBearing: () => 0, getPitch: () => 0 }
  };
}

/* the live values js/atlas-console.js:364 hands to `paintState`, in their real shapes:
   `_hl` a Set of ISO3, `_eraHl` names, `_hlPolys`/`_hlLines` objects with a `name`,
   `_choroState` code → normalised value, `_choroMetric` the measure being shaded. */
function supplier(s) {
  return {
    countries: () => new Set(s.countries || []),
    era: () => (s.era || []).slice(),
    polys: () => (s.polys || []).map((n) => ({ name: n, geo: {}, color: '#ff9500' })),
    lines: () => (s.lines || []).map((n) => ({ name: n, geo: {} })),
    choro: () => (s.choro || []).reduce((o, c, i) => { o[c] = (i + 1) / 10; return o; }, {}),
    metric: () => s.metric || null
  };
}

/* one observation of a map in state `s` — taken from the SHIPPED observer, with the SHIPPED painter
   declaration installed exactly where js/atlas-console.js installs it. */
function observe(s) {
  const hadP = window._imAtlasPaint, hadG = seatedEngine();
  window._imAtlasPaint = makeEraHighlight({ GE: () => seatedEngine(), resolveCountrySync: () => null })
    .paintState(supplier(s));
  seatEngine(renderer());
  try { return hl.observe(); }
  finally {
    if (hadP === undefined) delete window._imAtlasPaint; else window._imAtlasPaint = hadP;
    seatEngine(hadG);
  }
}

/* THE DIFFERENTIAL. Before this round the painter declared counts and nothing else, so an
   observation had no `ids` at all — that reading, put through the SHIPPED verifier, reproduces the
   old verdict exactly (no declaration to hold against the map → nothing is claimed). It is the same
   device tests/r551 ④⑤ use: the old pair is kept runnable so the comparison cannot quietly stop. */
function asR741(o) { const a = Object.assign({}, o.atlas); delete a.ids; return Object.assign({}, o, { atlas: a }); }

const KAZ_NEIGHBOURS = ['CHN', 'KGZ', 'RUS', 'TKM', 'UZB', 'TJK'];
const SIX_OTHERS = ['DEU', 'FRA', 'ITA', 'ESP', 'POL', 'AUT'];
const painted = (d) => ({ ok: true, html: '<div>✦ …</div>', meta: { painted: d } });

test('R742 ⓪: map.highlight is on the generic paint verdict, and the painter declares who is painted', () => {
  assert.equal(hl.observerKind, 'paint', 'map.highlight moved off `paint` — this file lost its subject');
  const o = observe({ countries: KAZ_NEIGHBOURS, choro: [], polys: [], lines: [] });
  assert.equal(o.atlas.hlCountries, 6, 'the count #R736 added, still reported (tests/r736-atlas-multiprobe.spec.js reads it)');
  assert.deepEqual(o.atlas.ids.countries, KAZ_NEIGHBOURS.slice().sort(), 'and WHO, in a stable order');
  /* none of the counted sources holds it — a highlight is a feature-state paint, not a source */
  /* (atlas-observer-undo) the counted sources are now the renderer's claimed surfaces; this stub renderer offers none */
  assert.ok(o.surfaces == null || Object.values(o.surfaces).every((v) => v === 0 || typeof v === 'string'));
});

test('R742 ①: repainting the SAME six countries is completed, not `not_rendered`', () => {
  /* THE PRODUCTION FAILURE. Atlas was told three times that a correct map was not drawn. */
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(JSON.stringify(before), JSON.stringify(after), 'this test is about a redraw: the map must not move');

  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, before, after, painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(v.status, 'completed', `a redraw of the same six countries was called ${v.status}/${v.code}`);
  assert.equal(v.code, 'already_there', 'and it says WHY — the reader asked for a state and the state is there');
  assert.equal(v.observed.already, true);

  /* …and the verdict this replaces */
  const old = hl.verify({}, { countries: KAZ_NEIGHBOURS }, asR741(before), asR741(after), painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(old.code, 'not_rendered', 'the old reading had no identities, so it could only answer «nothing moved»');
});

test('R742 ②: repainting six countries as six OTHER countries is a change, though the count did not move', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: SIX_OTHERS });
  assert.equal(before.atlas.hlCountries, after.atlas.hlCountries,
    'the cardinals are identical — that is exactly why a count diff cannot see this repair');

  const v = hl.verify({}, { countries: SIX_OTHERS }, before, after, painted({ countries: SIX_OTHERS }));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'the map really did change, so this is not «already there»');

  const old = hl.verify({}, { countries: SIX_OTHERS }, asR741(before), asR741(after), painted({ countries: SIX_OTHERS }));
  assert.equal(old.code, 'not_rendered', 'and the correction used to read as the failure it was repairing');
});

test('R742 ③: a claim over a map that has nothing on it is still `not_rendered` — the refusal was not removed', () => {
  /* The declaration is READ, not trusted: a dispatch that says it painted six countries over a bare
     map gets the verdict the map supports. */
  const empty = observe({});
  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, empty, observe({}), painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(v.status, 'partial');
  assert.equal(v.code, 'not_rendered');
  assert.deepEqual(v.produced, []);

  /* and half a declaration is not a pass either */
  const half = hl.verify({}, {}, observe({ countries: ['RUS'] }), observe({ countries: ['RUS'] }),
    painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(half.code, 'not_rendered', 'five of six missing is not the state the reader asked for');

  /* a failed dispatch is still failed */
  const f = hl.verify({}, {}, empty, empty, { ok: false, meta: { code: 'no_border_geometry' }, html: '' });
  assert.equal(f.status, 'failed');
  assert.equal(f.code, 'no_border_geometry');
});

test('R742 ④: some targets unresolved while the rest ARE on the map is completed, and the names survive', () => {
  /* Fourteen oblasts asked for, four painted, two never resolved: the map was read as「nothing was
     drawn」 before the map was read at all. `unresolved` has to reach Atlas either way — it is what
     the repair loop acts on (js/atlas-console.js `_mkExec`). */
  const drawn = ['RUS', 'KGZ', 'UZB', 'TKM'];
  const before = observe({ countries: drawn });
  const after = observe({ countries: drawn });
  const raw = { ok: true, html: '<div>…</div>', meta: { partial: true, painted: { countries: KAZ_NEIGHBOURS } },
    exec: { unresolved: [{ name: '', iso3: 'CHN', reason: 'no_border_geometry' }, { name: 'ないない国', iso3: 'TJK' }] } };

  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, before, after, raw);
  assert.equal(v.status, 'completed', `four of six painted was called ${v.status}/${v.code}`);
  assert.equal(v.code, 'partially_resolved', 'and the code says which part failed — the targets, not the drawing');
  assert.equal(v.unresolved.length, 2, 'the repair loop still gets the names');
  assert.equal(v.unresolved[1].name, 'ないない国');
  assert.equal(v.observed.reach.have, 4);
  assert.equal(v.observed.reach.want, 6);

  /* nothing of it on the map at all → the refusal stands, names and all */
  const none = hl.verify({}, {}, observe({}), observe({}), raw);
  assert.equal(none.status, 'partial');
  assert.equal(none.code, 'not_rendered');
  assert.equal(none.unresolved.length, 2);

  const old = hl.verify({}, {}, asR741(before), asR741(after), raw);
  assert.equal(old.code, 'not_rendered', 'the old pair never looked at the map when `partial` was set');
});

test('R742 ⑤: nothing is guessed — no declaration, or one about a surface the reading does not hold', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(hl.verify({}, {}, before, after, { ok: true, html: '' }).code, 'not_rendered',
    'a result that declares nothing must keep the verdict it always had');
  assert.equal(hl.verify({}, {}, before, after, painted({})).code, 'not_rendered', 'an empty declaration declares nothing');
  assert.equal(hl.verify({}, {}, before, after, painted({ reach: ['渋谷駅'] })).code, 'not_rendered',
    'a surface this observation does not hold is «could not observe», never «yes»');
  assert.equal(hl.verify({}, {}, before, after, painted({ countries: [''] })).code, 'not_rendered',
    'a nameless target has no identity to check');
});

test('R742 ⑥: the other painted surfaces are identified the same way, by the supplier\'s own key', () => {
  /* Not only countries: the same turn paints regions, rivers, era polities and a choropleth, and each
     one used to be a bare cardinal. The keys are `paintState`'s, which are the console's. */
  const s = { countries: ['KAZ'], era: ['大日本帝国'], polys: ['東海地方'], lines: ['Yenisei'], choro: ['JPN', 'USA'], metric: 'pop' };
  const o = observe(s);
  assert.deepEqual(o.atlas.ids, { countries: ['KAZ'], era: ['大日本帝国'], polys: ['東海地方'], lines: ['Yenisei'], choro: ['JPN', 'USA'] });
  const same = observe(s);
  assert.equal(hl.verify({}, {}, o, same, painted({ polys: ['東海地方'], lines: ['Yenisei'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ choro: ['JPN', 'USA'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ era: ['大日本帝国'], countries: ['KAZ'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ polys: ['関西地方'] })).code, 'not_rendered');
  /* re-shading the SAME countries by a different measure is still a change (#R736's `choroMetric`) */
  assert.equal(hl.verify({}, {}, o, observe(Object.assign({}, s, { metric: 'gdp' })), painted({ choro: ['JPN', 'USA'] })).code, 'ok');
});

test('R742 ⑦: an observation that could not be taken is not read as agreement', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(hl.verify({}, {}, before, null, painted({ countries: KAZ_NEIGHBOURS })).status, 'completed',
    'an unobservable map keeps the legacy verdict — unchanged from before this round');
  const half = hl.verify({}, {}, null, null,
    { ok: true, html: '', meta: { partial: true }, exec: { unresolved: ['x'] } });
  assert.equal(half.code, 'not_rendered', '…and an unobservable map with unresolved targets still refuses');
  assert.deepEqual(half.unresolved, ['x']);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r768-atlas-one-pass-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R768 — 「IT DID NOT MOVE」 AND 「I COULD NOT SEE IT MOVE」 WERE THE SAME ANSWER,
 *         SO ATLAS SPENT A WHOLE TURN RETRYING A MOVE THAT NEVER FAILED
 * ----------------------------------------------------------------------------
 *  Measured on production, 2026-09-16, signed in,
 *  gpt-5.6-luna, the SAME question twice:
 *
 *    tab in the background   「アイスランドに飛んで」  9 model calls, 8 operations,
 *                                                   SEVEN of them partial/no_change,
 *                                                   stopped: step_budget
 *                                                   (the reader is told the turn hit its
 *                                                    working limit — it did not, it hit a lie)
 *    tab in front            「アイスランドに飛んで」  1 model call, completed/ok,
 *                                                   stopped: answered
 *
 *  A page that is not compositing runs no animation frames, so the camera really does stay where it
 *  was. `view.flyTo`'s verifier read that as `no_change` — the code for 「the request did not take
 *  effect」 — and Atlas, correctly, tried again. .agents/rules/one-pass-or-a-reason.md §2 calls this
 *  the first of the three causes of a repeat: THE OBSERVER LIED. §5 draws the line these tests hold:
 *  「描かれたことを確認できなかった」は失敗ではなく観測できなかったである。
 *
 *  ⚠ NOTHING HERE CONSTRAINS ATLAS (CONSTITUTION.md §5, and the user's instruction in #R768:
 *  「AIモデルが決定権をもっていて、なにをやるか決めるというのはそれでいい。コード側で変に縛ったりする
 *  のは嫌」). No call is refused, no plan is shortened, no step budget moves. What changes is that the
 *  sentence Atlas is handed is true.
 *
 *  ⚠ THESE TESTS DO NOT READ THE SOURCE FOR THE VERDICT (#R505). They build the SHIPPED registry and
 *  EVALUATE the shipped verifier against a stub renderer, because the defect was in what the verdict
 *  could see. ⑤ is the one source-level check, and it measures a structural fact a running verdict
 *  cannot: that the render-tick wait has ONE implementation rather than two that can drift apart.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await capabilitiesWithSeat();   /* (module-graph) the engine edge is the seat above */

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const fly = CAPS.resolve('view.flyTo');

const CAM = { lng: -21.9, lat: 64.1, zoom: 5, bearing: 0, pitch: 0 };

/* A renderer stub whose ONLY variable is whether it is drawing. `ticking` is the question this round
   gave the engine facade (js/geo-engine.js render.ticking); `mode` picks what it answers:
     'live'   — a render tick arrived            (a normal, foreground page)
     'asleep' — no tick within the window        (the measured backgrounded tab)
     'throws' — the engine cannot answer at all  (an adapter that predates this round) */
function renderer(mode, camera) {
  const cam = camera || CAM;
  return {
    hasRenderer: () => true,
    layers: { sourceData: () => ({ type: 'FeatureCollection', features: [] }) },
    scene: { getStyle: () => ({ layers: [] }) },
    camera: {
      getCenter: () => ({ lng: cam.lng, lat: cam.lat }), getZoom: () => cam.zoom,
      getBearing: () => cam.bearing, getPitch: () => cam.pitch,
      getBounds: () => null
    },
    render: {
      triggerRepaint() {},
      canvas: () => null,
      onNextFrame(ms, fn) { if (mode === 'throws') throw new Error('this adapter cannot say'); fn(mode === 'live'); },
      ticking(ms) {
        if (mode === 'throws') throw new Error('this adapter cannot say');
        return Promise.resolve(mode === 'live');
      }
    }
  };
}

/* the pair, in the order the executor runs it (js/atlas-executor.js: observe → run → observe →
   verify). The observation is where 「was the page drawing?」 is taken, so a verdict asked without it
   is a verdict that never saw the map — which is why this drives both halves rather than the second. */
async function verdict(mode, { before, after, args, raw }) {
  const had = seatedEngine();
  seatEngine(renderer(mode, after));
  try {
    await fly.observe();
    return fly.verify({}, args, before, after, raw === undefined ? { ok: true } : raw, 'view.flyTo');
  } finally { seatEngine(had); }
}

/* the production shape: the reader asked for a place, and the camera is exactly where it was */
const STUCK = { before: CAM, after: CAM, args: { place: 'Iceland' } };

test('R768 ① a camera that did not move because the page is not drawing is NOT `no_change`', async () => {
  const v = await verdict('asleep', STUCK);
  assert.equal(v.code, 'not_rendering',
    'a backgrounded page must not be reported as「the map did not change」— that is the sentence that spent 9 model calls on one flyTo');
  assert.notEqual(v.status, 'failed', 'the request did not fail; it could not be observed (rule §5)');
  assert.equal(v.observed && v.observed.rendering, false, 'the verdict has to carry WHY, or the next reader re-derives it');
});

test('R768 ② a drawing page is unchanged from before this round', async () => {
  const v = await verdict('live', STUCK);
  assert.equal(v.code, 'no_change', 'when the renderer really is ticking and nothing moved, the old verdict is the right one');
  assert.equal(v.status, 'partial');
});

test('R768 ③ the probe may only weaken a claim — an engine that cannot answer changes nothing', async () => {
  const v = await verdict('throws', STUCK);
  assert.equal(v.code, 'no_change',
    'an unanswerable probe must leave the verdict exactly as it was; nothing may be downgraded on a question we could not get an answer to');
});

test('R768 ③b a verdict asked without an observation claims nothing either', () => {
  /* the reading belongs to the observer, so a caller that skips it must not inherit the LAST
     operation's answer. (It is one slot — see the declaration beside CAMERA_SETTLE_MS.) */
  const had = seatedEngine();
  seatEngine(renderer('asleep', CAM));
  try {
    const v = fly.verify({}, STUCK.args, STUCK.before, STUCK.after, { ok: true }, 'view.flyTo');
    assert.equal(typeof v.then, 'undefined', 'the camera verdict is synchronous — every camera capability shares it');
    assert.ok(v.code === 'no_change' || v.code === 'not_rendering');
  } finally { seatEngine(had); }
});

test('R768 ④ a camera that DID move is still complete, even on a page that is not drawing', async () => {
  const moved = { lng: 139.7, lat: 35.7, zoom: 5, bearing: 0, pitch: 0 };
  const v = await verdict('asleep', { before: CAM, after: moved, args: { place: 'Tokyo' } });
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'the judgement is only ever an upgrade (#R740) — this round must not have inverted that');
});

test('R768 ⑤ the render-tick wait has ONE implementation, and the capture path uses it', async () => {
  /* RUN, not read (consolidation). ① the facade's wait, over an adapter that fires 'render' and one that
     never does; ② the capture path, over a GE whose wait is a recorder — the frame it grabs has to be the
     one the ENGINE's wait handed it, `live` included. */
  const handlers = [];
  const facade = (fires) => ENGINE.makeFacade({
    raw: () => ({}), canDraw: () => true, isVisible: () => true,
    once: (ev, fn) => { handlers.push(ev); if (fires) setTimeout(fn, 5); },
    triggerRepaint: () => {},
  });
  assert.equal(typeof facade(true).render.onNextFrame, 'function', 'the engine facade owns the wait');
  const tick = (f) => new Promise((res) => f.render.onNextFrame(60, res));
  assert.equal(await tick(facade(true)), true, 'a render tick answers true');
  assert.equal(await tick(facade(false)), false, 'no tick inside the window answers false');
  assert.ok(handlers.every((e) => e === 'render'), 'the wait is on the renderer\'s own render event');

  const { makeViewCapture } = await import('../js/atlas-view-capture.js');
  const cv = () => ({ width: 4, height: 4, getContext: () => ({ drawImage() {} }) });
  const hadDoc = globalThis.document; const waits = [];
  globalThis.document = {
    getElementById: (id) => (id === 'map-container' ? { clientWidth: 4, clientHeight: 4 } : null),
    createElement: () => cv(), body: { classList: { contains: () => false, add() {}, remove() {} } },
  };
  try {
    const GE = () => ({ hasRenderer: () => true, render: { canvas: cv, onNextFrame: (ms, fn) => { waits.push(ms); fn(true); } } });
    const got = await makeViewCapture({ GE, L: (en) => en, esc: (s) => s }).captureCanvas({ GE, include: 'map' });
    assert.deepEqual(waits.length, 1, 'the capture path asks the engine rather than writing the wait again');
    assert.equal(got.live, true, 'and what the engine\'s wait answered is what the capture reports');
  } finally { if (hadDoc === undefined) delete globalThis.document; else globalThis.document = hadDoc; }
  /* read, not run: the old shape is a second wait living in the capture file; its ABSENCE is the claim. */
  const vc = fs.readFileSync(path.join(ROOT, 'js', 'atlas-view-capture.js'), 'utf8');
  /* the shape it used to have, in the file that used to have it: a `once('render')` paired with its
     own setTimeout fallback. Two of those drift apart — which is exactly why the camera verifier had
     nowhere to ask the question and invented `no_change` instead. */
  assert.ok(!/once\(\s*['"]render['"]/.test(vc),
    'js/atlas-view-capture.js must not keep its own copy of the tick wait');
});

test('R768 ⑥ the reader is told what actually happened, and what to do about it', async () => {
  /* RUN, not read (consolidation): the sentence is asked of the results module the way the console asks
     it — text(key, params, L) with the positional picker (en = slot 0, ja = slot 1). */
  const { makeAtlasResults } = await import('../js/atlas-results.js');
  const RES = makeAtlasResults({});
  const en = RES.text('atlas.code.not_rendering', {}, (...row) => row[0]);
  const ja = RES.text('atlas.code.not_rendering', {}, (...row) => row[1]);
  assert.ok(en && ja, 'a code the reader can be shown needs a sentence (js/atlas-results.js)');
  assert.ok(/IntMap/.test(ja) && /前面/.test(ja),
    'the Japanese sentence must name the one action that fixes it — bringing IntMap to the front');
  assert.ok(/background/i.test(en), 'and the English one must say why');
});

test('R768 ⑦ the standing rule exists and forbids closing this with a lower ceiling', () => {
  /* read, not run: the claim is about the words of two documents (the standing rule and AGENTS.md), not
     about code. */
  const rule = fs.readFileSync(path.join(ROOT, '.agents', 'rules', 'one-pass-or-a-reason.md'), 'utf8');
  assert.match(rule, /上限を下げて塞いではならない/,
    'the rule has to say the thing that is tempting and wrong: capping the steps leaves the repeats and kills the deliverable instead');
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agents, /one-pass-or-a-reason\.md/, 'AGENTS.md §3 must point at the canonical file');
});
}
