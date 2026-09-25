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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');

/* js/map-tools.js:1042 — `const SRC='im-iso-src'`, drawn as im-iso-fill / im-iso-line / im-iso-ctr */
const ISO_SRC = 'im-iso-src';

/* A renderer that holds exactly the sources it is given. Every façade name below is one the real
   observers call (js/geo-engine.js): layers.sourceData, scene.getStyle, camera.*, hasRenderer. */
/* (atlas-observer-undo) the reach is now asked of the renderer — `render.drawn()` — by the effect key
   js/map-tools.js claims `im-iso-src` under. The answer comes from the SHIPPED facade
   (js/geo-engine.js makeFacade) over an adapter holding exactly `sources`, not from a retyped copy. */
await import('../js/geo-engine.js');
const ENGINE = window.IntMapGeoEngine;
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
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = renderer(sources);
  try { return fn(); } finally { if (had === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = had; }
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
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = camRenderer(cam);
  try { return fn(); } finally { if (had === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = had; }
}
/* What `cameraNow()` produced for that camera — taken from the SHIPPED observer, not retyped.
   ⚠ It installs and restores around the AWAIT: the camera observer is async (#R726 — it waits for
   the flight to land), and a `try/finally` that returns the promise restores the engine before the
   observer ever reads it, which yields a null snapshot and a verdict about nothing. */
async function snapshot(cam) {
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = camRenderer(cam);
  try { return await CAPS.resolve('view.flyTo').observe(); }
  finally { if (had === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = had; }
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
   ⚠ NOT A CHECK ON THE SPELLING OF THE SOURCE (#R505 / #R488). The `case 'flyTo'` block is lifted out
   of the shipped file and EVALUATED, once per branch, against a recording camera — so what is asserted
   is that the destination the result DECLARES is the destination that was handed to the camera. A
   branch that moves the camera and forgets to declare fails here. The census under it is what makes a
   NEW branch fail too: a success return nobody drove is a red test rather than a silent omission. */
const CONSOLE_SRC = readFileSync(join(ROOT, 'js/atlas-console.js'), 'utf8');
const FLYTO_BLOCK = (() => {
  const a = CONSOLE_SRC.indexOf("case 'flyTo': {");
  const b = CONSOLE_SRC.indexOf("case 'weather':", a);
  assert.ok(a > 0 && b > a, "js/atlas-console.js no longer has a flyTo case — this check lost its subject");
  return CONSOLE_SRC.slice(a + "case 'flyTo':".length, b);
})();

function flyToHarness(opts) {
  const flights = [];
  const D = {
    WORLD_RE: /^(world|whole world|globe|earth|全世界|世界)$/i,
    DEIXIS_RE: /^(here|there|ここ|そこ)$/i,
    /* js/atlas-console.js:1056 — R(ok, html, extra) merges the extra onto the result */
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
  const make = new Function('return async function flyToCase(a, D) {'
    + ' const { WORLD_RE, DEIXIS_RE, R, note, warn, esc, L, _ambigNote, _setLast, _bboxOK, placeExtent, geocode, flyToBox, GE } = D;'
    + FLYTO_BLOCK + ' }');
  return { run: (a) => make()(a, D), flights };
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
