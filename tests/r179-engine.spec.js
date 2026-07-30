// R179 — the renderer seam, verified in a real browser against the BUILT site.
//
// 「MapLibre依存脱却作業を完了させて。」 The coupling gate said 0 and it was telling the truth about
// what it counts: references to the renderer through MEMBER ACCESS, under the names `map`, `__imap`
// and `maplibregl`. Measured with the same AST widened to count every REFERENCE, there were 327 it
// could not see — 213 bare existence tests (`if(map)`, `typeof maplibregl!=='undefined'`) and 113
// places the handle is passed as a VALUE (`.addTo(map)`, `setupMaplibre(maplibregl)`, and the module
// contract itself, `window.IntMapModules.x(map, HOST)`).
//
// The part that mattered most is the SECOND VIEW. `ui.createView` handed back the renderer's own Map,
// so all three callers drove it raw — 106 calls in js/compare.js, 8 in js/playground.js, 5 in
// js/flight-sim.js — and a second engine could not have been given a second view at all. That is now
// `ui.createSubView`, which returns the SAME contract scoped to the new view.
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* ── ① a sub-view IS the contract, scoped ─────────────────────────────────────────────────────
   Not "has some methods": the same sections, so a caller written against the engine works against a
   second view unchanged — and so a Cesium adapter has one shape to implement rather than two. */
test('ui.createSubView returns the whole contract, scoped to its own view (#R179)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const GE = window.IntMapGeoEngine;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:200px;height:200px;';
    document.body.appendChild(host);
    const v = GE.ui.createSubView({ container: host, attributionControl: false, interactive: false,
      center: [0, 0], zoom: 2,
      style: { version: 8, sources: { r: { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'], tileSize: 256 } },
               layers: [{ id: 'r', type: 'raster', source: 'r' }] } });
    if (!v) return { made: false };
    await new Promise(res => setTimeout(res, 2500));
    const sections = ['camera', 'coords', 'layers', 'scene', 'ui', 'render', 'input', 'events'];
    const engineKeys = k => Object.keys(GE[k] || {}).sort();
    const viewKeys = k => Object.keys(v[k] || {}).sort();
    const missing = {};
    for (const s of sections) {
      const a = engineKeys(s), b = new Set(viewKeys(s));
      const gap = a.filter(x => !b.has(x));
      if (gap.length) missing[s] = gap;
    }
    const out = {
      made: true,
      sections: sections.filter(s => v[s] && typeof v[s] === 'object'),
      missing,
      /* it answers about ITSELF, not about the primary map */
      ownZoom: v.camera.getZoom(), primaryZoom: GE.camera.getZoom(),
      ownLayer: v.layers.has('r'), primaryHasIt: GE.layers.has('r'),
      hasDestroy: typeof v.destroy === 'function',
      id: v.id(),
    };
    /* PER-VIEW STATE, not shared: the eye pivot is the one #R178 warned about by name
       (「同じ性質の値は所有者を1つに」) — two views sharing one flag is a silent bug. */
    v.camera.setTiltPivot('eye');
    out.subPivot = v.camera.eyePivotDiag().pivot;
    out.primaryPivot = GE.camera.eyePivotDiag().pivot;
    v.destroy();
    out.goneAfterDestroy = (() => { try { return v.camera.getZoom(); } catch (_) { return null; } })();
    host.remove();
    return out;
  });
  expect(r.made, 'a sub-view can be created at all').toBe(true);
  expect(r.sections.sort()).toEqual(['camera', 'coords', 'events', 'input', 'layers', 'render', 'scene', 'ui']);
  expect(r.missing, 'every section carries the SAME methods as the engine — one shape to implement').toEqual({});
  expect(r.id, 'and it names the same renderer').toBe('maplibre');
  expect(r.ownLayer, 'it answers about its own style…').toBe(true);
  expect(r.primaryHasIt, '…and the primary map does not have that layer').toBe(false);
  expect(r.ownZoom, 'and about its own camera').toBeCloseTo(2, 1);
  expect(r.subPivot, 'per-view state: the sub-view has its own eye pivot…').toBe(true);
  expect(r.primaryPivot, '…and setting it there does not touch the primary map').toBe(false);
  expect(r.hasDestroy, 'the caller still owns its lifetime').toBe(true);
});

/* ── ② the compare pane really renders through the contract ───────────────────────────────────
   106 raw calls became contract calls, including four flags that were being hung on the renderer's
   own map object (`cmap.__wantGlobe` and friends) and are module variables now. A rewrite of that
   size is exactly where a silent no-op hides — #R162's lesson is that a `typeof` guard plus a
   try/catch can delete a feature without raising anything — so this asserts the pane's map is
   actually built, actually styled, and actually carrying its base layer. */
test('the compare pane drives its own view entirely through the contract (#R179)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    if (!(window.IntMapCompare && window.IntMapCompare.open)) return { opened: false };
    window.IntMapCompare.open();
    await wait(4000);
    const v = window.IntMapCompare._map && window.IntMapCompare._map();
    if (!v) return { opened: true, view: false };
    const out = {
      opened: true, view: true,
      /* a scoped ENGINE, not a renderer handle: the old return value had .addLayer on it */
      isContract: typeof v.layers === 'object' && typeof v.camera === 'object' && typeof v.addLayer !== 'function',
      styled: v.ready() || v.canDraw(),
      hasBase: v.layers.has('cmp-base-carto') || v.layers.has('cmp-base-sat'),
      baseVisible: v.layers.isVisible('cmp-base-carto') || v.layers.isVisible('cmp-base-sat'),
      zoom: v.camera.getZoom(),
      canvas: (() => { try { const c = v.render.canvas(); return !!(c && c.width > 0 && c.height > 0); } catch (_) { return false; } })(),
    };
    /* an extra overlay through the contract, to prove addSource/add really reach that view */
    try {
      v.layers.addSource('_probe', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      v.layers.add({ id: '_probe', type: 'circle', source: '_probe', paint: { 'circle-radius': 3 } });
      out.overlay = v.layers.has('_probe') && v.layers.hasSource('_probe');
    } catch (e) { out.overlay = 'threw: ' + e.message; }
    return out;
  });
  expect(r.opened, 'the compare pane exists').toBe(true);
  expect(r.view, 'and it built its view').toBe(true);
  expect(r.isContract, 'what it holds is the scoped ENGINE, not a renderer handle').toBe(true);
  expect(r.styled, 'the view parsed its style').toBe(true);
  expect(r.hasBase, 'its base layer was added through the contract').toBe(true);
  expect(r.baseVisible, '…and made visible, which is what applyBase() is for').toBe(true);
  expect(r.canvas, 'and it is really drawing').toBe(true);
  expect(r.overlay, 'sources and layers added through the contract land on THAT view').toBe(true);
});

/* ── ③ contours no longer need the library by name ────────────────────────────────────────────
   maplibre-contour must be handed the renderer's own namespace to register its tile protocol
   (`demSource.setupMaplibre(maplibregl)`), and that single call was the last bare `maplibregl`
   identifier outside the adapter. It is `scene.demContourSource` now; this proves the URL it hands
   back is a real protocol URL and that the layers built on it actually appear. */
test('contour tiles come from the engine, not from the library by name (#R179)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const GE = window.IntMapGeoEngine, wait = ms => new Promise(res => setTimeout(res, ms));
    const url = GE.scene.demContourSource({
      url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      encoding: 'terrarium', maxzoom: 13, worker: true,
      thresholds: { 11: [200, 1000], 12: [100, 500] }, elevationKey: 'ele', levelKey: 'level', contourLayer: 'contours' });
    const out = { url: typeof url === 'string' ? url.slice(0, 24) : url };
    /* …and the real layer, switched on the way a PERSON switches it — the Terrain ▸ Contours row.
       Going through the checkbox rather than an internal call is the point: addContours() is
       reached via whenStyleReady(), and a rewrite that quietly returned false here would still
       leave the URL above looking perfectly fine. */
    /* …and the layer built for real, through the app's own public entry for it: the contour
       granularity control (window._setContourDensity), which tears the source down and calls
       addContours() again. That is the function this round rewrote, so it is the one to exercise —
       and it is reached without depending on the layer-row gesture mechanics, which have their own
       history (#R37: the rows toggle on the ROW's pointerdown, not the checkbox's click). */
    out.foundEntry = typeof window._setContourDensity === 'function';
    if (out.foundEntry) window._setContourDensity(1);
    for (let i = 0; i < 40 && !GE.layers.has('contour-lines'); i++) await wait(250);
    out.builtSource = GE.layers.hasSource('contour-src');
    out.builtLayer = GE.layers.has('contour-lines');
    out.builtLabels = GE.layers.has('contour-labels');
    return out;
  });
  expect(typeof r.url, 'the engine returns a tile-URL template').toBe('string');
  // measured: "dem-contour://{z}/{x}/{y}" — maplibre-contour's own registered scheme
  expect(r.url, 'and it is a registered protocol URL, not an https one').toMatch(/^[a-z][a-z0-9-]*:\/\//);
  expect(r.url.startsWith('http'), 'specifically not a plain http(s) URL').toBe(false);
  expect(r.foundEntry, 'the contour rebuild entry exists').toBe(true);
  expect(r.builtSource, 'the contour source builds on it').toBe(true);
  expect(r.builtLayer, 'and the contour line layer with it').toBe(true);
  expect(r.builtLabels, '…and the labels, which read the same source-layer').toBe(true);
});

/* ── ④ renderer-owned UI is attached to a VIEW, not to a handle ───────────────────────────────
   `ui.marker(o)` handed back the renderer's object and every caller finished with `.addTo(map)` —
   the raw handle as a value, which is the class of reference the gate cannot see. */
test('markers and popups attach to the view they were asked of (#R179)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const GE = window.IntMapGeoEngine;
    const el = document.createElement('div'); el.style.cssText = 'width:8px;height:8px;background:red;';
    const mk = GE.ui.addMarker({ element: el }, [10, 20]);
    const out = { marker: !!mk, onPage: !!(mk && el.isConnected) };
    if (mk) { const ll = mk.getLngLat(); out.at = [Math.round(ll.lng), Math.round(ll.lat)]; mk.remove(); }
    const pop = GE.ui.addPopup({ closeButton: false }, [10, 20], '<b>x</b>');
    out.popup = !!pop; out.popupOpen = !!(pop && pop.isOpen && pop.isOpen());
    if (pop) pop.remove();
    return out;
  });
  expect(r.marker, 'a marker can be created and attached in one call').toBe(true);
  expect(r.onPage, 'and it is really in the document').toBe(true);
  expect(r.at, 'at the coordinates it was given').toEqual([10, 20]);
  expect(r.popup, 'and the same for a popup').toBe(true);
  expect(r.popupOpen, 'which is actually open on the map').toBe(true);
});
