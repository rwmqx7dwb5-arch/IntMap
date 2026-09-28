/* ============================================================================
 *  maplibre-6-migration · WHAT THE ADAPTER NEEDS FROM MAPLIBRE 6, ASKED OF THE RUNNING RENDERER
 * ----------------------------------------------------------------------------
 *  maplibre-gl 5.24 → 6.x moved or removed every renderer internal js/geo-engine.js stood on:
 *  `map.transform` (the Map composes a Camera now), `transform.getMatrixForModel` (removed),
 *  `_elevateCameraIfInsideTerrain` / `isEasing` / `transformCameraUpdate` (on the camera, not the
 *  map), and the worker became a file of its own. Each of those fails SILENTLY — a read of a missing
 *  field is `undefined`, a patch on the wrong object is never called — so every fact below is asked
 *  of the live renderer, not of this repository's source:
 *    ① the transform the adapter reads is the one the painter draws with; the map has no transform
 *       or isEasing of its own; isAnimating() is true through a flyTo and false after it
 *    ② the worker is served from this origin and really parses data (a GeoJSON source is tiled in
 *       the worker — hermetic, no tile server involved)
 *    ③ a point UP IN THE AIR is picked where MAPLIBRE ITSELF draws one: a symbol lifted with 6.6's
 *       `symbol-height-offset` is MapLibre placing a point at an altitude by its own code path, and
 *       projectAltitude() must land on the pixels it drew, well away from the ground point
 *    ③b IntMap's own elevated custom layer (satellites; aircraft and the 3-D volume share its GLSL)
 *       draws where projectMercAlt picks — flat, globe and in the z11→z12 cross-fade
 *    ④ the globe hands over to the plane between z11 and z12 (tests/r241 and js/theme-sky.js tie
 *       AIR_Z to that band)
 *    ⑤ the flight simulator's cockpit geometry: a camera built with camera.fromTo puts the eye where
 *       it was asked to be (tests/r158 #6 used to pin the version for this; this measures it)
 *  The eye pivot and its underground repair are tests/r179.spec.js (they read the camera through
 *  tests/helpers/camera-ruler.js, as ① does).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installCameraRuler } from './helpers/camera-ruler.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    try { return !!window.__imap && window.__imap.isStyleLoaded() && window.IntMapGeoEngine.canDraw(); } catch (_) { return false; }
  }, null, { timeout: 60000 });
  await page.evaluate(installCameraRuler);
});
test.afterAll(async () => { await page?.close(); });

test('① the adapter reads the transform the painter draws with, and isAnimating() sees a flight', async () => {
  const r = await page.evaluate(async () => {
    const m = window.__imap, E = window.IntMapGeoEngine;
    const out = {
      samePainter: window.__mlTr() === (m.painter && m.painter.transform),
      mapHasTransform: 'transform' in m,
      mapHasIsEasing: typeof m.isEasing,
      idle: E.camera.isAnimating(),
    };
    m.jumpTo({ center: [139.767, 35.681], zoom: 5, pitch: 0, bearing: 0 });
    E.camera.flyTo({ center: [2.35, 48.85], zoom: 6, duration: 1500 });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    out.flying = E.camera.isAnimating();
    await new Promise((res) => m.once('moveend', res));
    out.landed = E.camera.isAnimating();
    return out;
  });
  expect(r.samePainter, 'the camera\'s transform is the painter\'s — the one every matrix read must come from').toBe(true);
  expect(r.mapHasTransform, 'MapLibre 6 keeps no transform on the map — nothing may read one there').toBe(false);
  expect(r.mapHasIsEasing, 'nor isEasing').toBe('undefined');
  expect(r.idle).toBe(false);
  expect(r.flying, 'a flyTo is an animation the renderer is running').toBe(true);
  expect(r.landed, 'and it is over once the camera has arrived').toBe(false);
});

test('② the renderer\'s worker comes from this origin and tiles data', async () => {
  const r = await page.evaluate(async () => {
    const m = window.__imap, url = window.maplibregl.getWorkerUrl();
    const u = new URL(url, location.href);
    const src = await (await fetch(u.href)).text();
    /* a GeoJSON source is cut into tiles IN THE WORKER; querySourceFeatures reads those tiles back */
    const id = 'mlv6-worker-probe';
    m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { probe: 'yes', nested: { a: [1, 2] } }, geometry: { type: 'Point', coordinates: [139.767, 35.681] } }] } });
    m.addLayer({ id, type: 'circle', source: id, paint: { 'circle-radius': 4 } });
    m.jumpTo({ center: [139.767, 35.681], zoom: 6, pitch: 0, bearing: 0 });
    const t0 = performance.now(); let feats = [];
    while (performance.now() - t0 < 15000) {
      feats = m.querySourceFeatures(id);
      if (feats.length) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    const f = feats[0];
    m.removeLayer(id); m.removeSource(id);
    return { sameOrigin: u.origin === location.origin, path: u.pathname, bytes: src.length,
             importsSibling: /from\s*["']\.\/maplibre-gl-shared/.test(src),
             tiled: feats.length, probe: f && f.properties.probe, nested: f && f.properties.nested };
  });
  expect(r.sameOrigin, 'the worker is ours to serve — the CSP admits worker-src \'self\'').toBe(true);
  expect(r.path).toMatch(/\/assets\/[^/]+\.js$/);
  expect(r.importsSibling, 'it is self-contained — dist/maplibre-gl-worker.mjs imports a sibling a plain ?url copy would not ship').toBe(false);
  expect(r.tiled, 'a GeoJSON source came back from the worker as tiles').toBeGreaterThan(0);
  expect(r.probe).toBe('yes');
  /* 6.0 carries nested properties through the worker as values (5.x flattened them to JSON strings);
     no reader in js/ parsed them, which dev-notes/2026-09-27-maplibre-6-migration.md records */
  expect(r.nested, 'nested properties arrive as values').toEqual({ a: [1, 2] });
});

/* ③ — the renderer's own drawing of an elevated point is the yardstick (see the header). WHERE it drew
   is read off the canvas as the difference between two frames that differ only in the probe's
   visibility, inside a render tick (the context has no preserveDrawingBuffer — tests/r203's method).
   Not queryRenderedFeatures: measured in the z11→z12 cross-fade, MapLibre's hit-test finds a lifted
   symbol neither where it is drawn nor at its ground point, so it cannot be the yardstick there. */
for (const c of [
  { tag: 'flat z10, pitch 60, 10 km', proj: 'mercator', z: 10, p: 60, alt: 10000 },
  { tag: 'globe z8, pitch 50, 50 km', proj: 'globe', z: 8, p: 50, alt: 50000 },
  { tag: 'globe mid-fade z11.8, pitch 45, 3 km', proj: 'globe', z: 11.8, p: 45, alt: 3000 },
]) {
  test(`③ a point in the air is picked where MapLibre draws it — ${c.tag}`, async () => {
    const r = await page.evaluate(async (c) => {
      const m = window.__imap, E = window.IntMapGeoEngine;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const snap = () => new Promise((res) => {
        m.once('render', () => {
          const cv = m.getCanvas(), W = cv.width, H = cv.height, c2 = document.createElement('canvas');
          c2.width = W; c2.height = H; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
          res({ W, H, k: W / (cv.clientWidth || W), d: g.getImageData(0, 0, W, H).data });
        });
        m.triggerRepaint();
      });
      const lng = 139.767, lat = 35.681, id = 'mlv6-lift-probe';
      m.setProjection({ type: c.proj });
      m.jumpTo({ center: [lng, lat], zoom: c.z, pitch: c.p, bearing: 0 });
      const font = (() => { for (const L of m.getStyle().layers) if (L.type === 'symbol' && L.layout && L.layout['text-font']) return L.layout['text-font']; return undefined; })();
      m.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } } });
      m.addLayer({ id, type: 'symbol', source: id, layout: Object.assign({ 'text-field': '■', 'text-size': 28, visibility: 'none',
        'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-height-offset': c.alt, 'symbol-height-anchor': 'absolute' },
        font ? { 'text-font': font } : {}), paint: { 'text-color': '#000000', 'text-halo-width': 0 } });
      /* let everything else settle, so the only difference between the two frames is the probe */
      const t0 = performance.now();
      while (performance.now() - t0 < 15000 && !(m.loaded() && !m.isMoving())) await wait(100);
      await wait(800);
      const off = await snap();
      m.setLayoutProperty(id, 'visibility', 'visible');
      let drawn = 0; const t1 = performance.now();
      while (performance.now() - t1 < 15000) { drawn = m.queryRenderedFeatures({ layers: [id] }).length; if (drawn) break; await wait(100); }
      await wait(400);
      const on = await snap();
      let n = 0, sx = 0, sy = 0;
      for (let i = 0, p = 0; i < on.d.length; i += 4, p++) {
        if (Math.abs(on.d[i] - off.d[i]) + Math.abs(on.d[i + 1] - off.d[i + 1]) + Math.abs(on.d[i + 2] - off.d[i + 2]) > 120) {
          n++; sx += p % on.W; sy += Math.floor(p / on.W); }
      }
      const lifted = E.coords.projectAltitude({ lng, lat }, c.alt), ground = m.project([lng, lat]);
      m.removeLayer(id); m.removeSource(id);
      return { g: E.camera.globeness(), drawn, changed: n, at: n ? { x: sx / n / on.k, y: sy / n / on.k } : null,
               lifted, ground: { x: ground.x, y: ground.y } };
    }, c);
    expect(r.drawn, 'MapLibre drew the elevated probe').toBeGreaterThan(0);
    expect(r.changed, 'and it changed the picture').toBeGreaterThan(20);
    expect(r.lifted, 'the engine projects a point at altitude').toBeTruthy();
    const off = Math.hypot(r.lifted.x - r.at.x, r.lifted.y - r.at.y);
    expect(Math.hypot(r.at.x - r.ground.x, r.at.y - r.ground.y), 'the altitude moves the drawn point well clear of the ground point').toBeGreaterThan(40);
    expect(off, `projectAltitude() is where MapLibre drew the point (${JSON.stringify(r)})`).toBeLessThan(5);
  });
}

/* ③b — …and OUR elevated custom layers draw there too, so what is picked is what is drawn. The orbit
   layer (satellites; the aircraft and 3-D-volume layers share its js/lifted-projection.js) gets one dot
   at a known altitude, and its pixels are compared with projectMercAlt. MEASURED before
   js/lifted-projection.js: under 6.x the dot was not drawn at all in the z11→z12 cross-fade (6.4.1 gave
   custom layers the live fade, and metres were blended with the plane's reading of them as mercator
   units), and in the flat regime it was drawn at its GROUND point on 5.24 and 6.x alike while the pick
   was lifted. */
for (const c of [
  { tag: 'flat z10, pitch 60, 10 km', proj: 'mercator', z: 10, p: 60, alt: 10000 },
  { tag: 'globe z8, pitch 50, 50 km', proj: 'globe', z: 8, p: 50, alt: 50000 },
  { tag: 'globe mid-fade z11.5, pitch 50, 8 km', proj: 'globe', z: 11.5, p: 50, alt: 8000 },
]) {
  test(`③b the elevated custom layer draws where the pick looks — ${c.tag}`, async () => {
    const r = await page.evaluate(async (c) => {
      const m = window.__imap, E = window.IntMapGeoEngine;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const snap = () => new Promise((res) => {
        m.once('render', () => {
          const cv = m.getCanvas(), W = cv.width, H = cv.height, c2 = document.createElement('canvas');
          c2.width = W; c2.height = H; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
          res({ W, k: W / (cv.clientWidth || W), d: g.getImageData(0, 0, W, H).data });
        });
        m.triggerRepaint();
      });
      const lng = 139.767, lat = 35.681, id = 'mlv6-orbit-probe';
      m.setProjection({ type: c.proj });
      m.jumpTo({ center: [lng, lat], zoom: c.z, pitch: c.p, bearing: 0 });
      if (!E.layers.addOrbit(id)) return { added: false };
      const t0 = performance.now();
      while (performance.now() - t0 < 15000 && !(m.loaded() && !m.isMoving())) await wait(100);
      await wait(800);
      const off = await snap();
      E.layers.setOrbit(id, { visible: true, opacity: 1, list: [{ lng, lat, lng2: lng, lat2: lat, altKm: c.alt / 1000, alt2Km: c.alt / 1000, rgba: [255, 0, 255, 255], size: 22 }] });
      await wait(300);
      const on = await snap();
      let n = 0, sx = 0, sy = 0;
      for (let i = 0, q = 0; i < on.d.length; i += 4, q++) {
        if (Math.abs(on.d[i] - off.d[i]) + Math.abs(on.d[i + 1] - off.d[i + 1]) + Math.abs(on.d[i + 2] - off.d[i + 2]) > 120) {
          n++; sx += q % on.W; sy += Math.floor(q / on.W); }
      }
      const la = lat * Math.PI / 180, mx = (180 + lng) / 360;
      const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + la / 2))) / 360;
      const pick = E.layers.projectMercAlt(new Float64Array([mx, my, c.alt]));
      const ground = m.project([lng, lat]);
      E.layers.removeOrbit(id);
      return { added: true, g: E.camera.globeness(), changed: n, at: n ? { x: sx / n / on.k, y: sy / n / on.k } : null,
               pick: pick ? { x: pick[0], y: pick[1] } : null, ground: { x: ground.x, y: ground.y } };
    }, c);
    expect(r.added, 'the orbit layer can be added').toBe(true);
    expect(r.changed, `the dot is drawn at all (${JSON.stringify(r)})`).toBeGreaterThan(40);
    expect(Math.hypot(r.at.x - r.ground.x, r.at.y - r.ground.y), 'it is drawn up in the air, not on its ground point').toBeGreaterThan(40);
    expect(Math.hypot(r.pick.x - r.at.x, r.pick.y - r.at.y), `and projectMercAlt picks where it is drawn (${JSON.stringify(r)})`).toBeLessThan(6);
  });
}

test('④ the globe hands over to the plane between z11 and z12', async () => {
  const g = await page.evaluate(async () => {
    const m = window.__imap, E = window.IntMapGeoEngine, out = {};
    m.setProjection({ type: 'globe' });
    for (const z of [10.9, 11.5, 12.1]) {
      m.jumpTo({ center: [139.767, 35.681], zoom: z, pitch: 0, bearing: 0 });
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      out[z] = E.camera.globeness();
    }
    return out;
  });
  expect(g['10.9'], 'a sphere below z11').toBe(1);
  expect(g['11.5'], 'a cross-fade between').toBeGreaterThan(0);
  expect(g['11.5']).toBeLessThan(1);
  expect(g['12.1'], 'a plane from z12').toBe(0);
});

test('⑤ the cockpit camera puts the eye where it was asked to be', async () => {
  const r = await page.evaluate(async () => {
    const m = window.__imap, E = window.IntMapGeoEngine;
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    m.setProjection({ type: 'globe' });
    /* as js/flight-sim.js does for a flight: an unclamped target, or jumpTo drops fromTo's elevation */
    E.camera.setCenterClamped(false);
    const eye = { lng: 138.73, lat: 35.36 }, alt = 3200, D = 1800;   /* js/flight-sim.js's look-ahead */
    const rows = [];
    for (const [br, pitchDeg] of [[20, 80], [200, 95], [95, 60]]) {
      /* the target D metres ahead along (bearing, pitch) — the geometry js/flight-sim.js hands fromTo */
      const r = Math.PI / 180, horiz = D * Math.sin(pitchDeg * r), drop = D * Math.cos(pitchDeg * r);
      const dLat = horiz * Math.cos(br * r) / 111320, dLng = horiz * Math.sin(br * r) / (111320 * Math.cos(eye.lat * r));
      const cam = E.camera.fromTo(eye, alt, { lng: eye.lng + dLng, lat: eye.lat + dLat }, alt - drop);
      m.setMaxPitch(179);
      E.camera.jumpTo(cam);
      await frame();
      const a = window.__eye(); await frame(); const b = window.__eye();
      rows.push({ br, pitchDeg, zoom: m.getZoom(), space: a.space, gap: window.__gap({ lng: eye.lng, lat: eye.lat, alt }, a), still: window.__gap(a, b) });
    }
    E.camera.setCenterClamped(true);
    return rows;
  });
  for (const row of r) {
    expect(row.space, 'the cockpit\'s look-ahead puts the camera in the plane regime').toBe('merc');
    expect(row.gap, `the eye is where the cockpit asked (${JSON.stringify(row)})`).toBeLessThan(2);
    expect(row.still, 'and it does not move on the next frame').toBeLessThan(0.5);
  }
});
