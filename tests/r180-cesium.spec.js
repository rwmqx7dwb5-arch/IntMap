// (#R180) THE SECOND ENGINE, IN A REAL BROWSER.
//
// 「デフォルトはこれまで通りMapLibreだが、設定から選択すれば、Cesiumも選べるように。」
//
// Everything here is measured against the built site with the setting actually switched, not
// asserted from the source — #R179's own note is that a reference count of 0 was true about
// what it counted and false about the app, and the same trap is open here: an adapter can
// implement every method name and draw nothing. So these ask the SCENE what it has.
//
// The MapLibre half matters just as much and is asserted first: the default session must not
// be able to tell that a second engine exists.
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };
const asCesium = async (page) => {
  /* set the stored choice the way the Settings panel does and RELOAD — not addInitScript,
     which survives page.reload() and would make "switch back to MapLibre" untestable. */
  await page.goto('/?rafshim=1');
  await page.evaluate(() => { try { localStorage.setItem('intmap_engine', 'cesium'); } catch (_) {} });
  await page.reload();
  await page.waitForFunction(() => !!window.__imap && window.IntMapGeoEngine
    && window.IntMapGeoEngine.id && window.IntMapGeoEngine.id() === 'cesium', null, BOOT);
  /* one settled frame with the boot style applied */
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
};

/* ── ⓪ THE DEFAULT IS UNTOUCHED ───────────────────────────────────────────────────────────
   The most important test in the file. MapLibre stays the default, and a default session must
   transfer none of the second engine — not the 4.8 MB chunk, not its Workers, not its Assets. */
test('R180 ⓪: a default session runs MapLibre and downloads nothing of Cesium', async ({ page }) => {
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/?rafshim=1');
  await page.waitForFunction(() => !!window.__imap, null, BOOT);
  await page.waitForTimeout(2500);
  const id = await page.evaluate(() => window.IntMapGeoEngine.id());
  expect(id).toBe('maplibre');
  const cesiumish = urls.filter((u) => /\/cesium[/-]|cesium\.js|Cesium\//i.test(u));
  expect(cesiumish, 'a MapLibre session must not fetch one byte of the second engine').toEqual([]);
  /* and the choice is readable, so the Settings panel is not guessing */
  const sel = await page.evaluate(() => ({
    choice: window.IntMapEngineSelect.choice(),
    active: window.IntMapEngineSelect.active(),
    pending: typeof window.IntMapEnginePending,
  }));
  expect(sel.choice).toBe('maplibre');
  expect(sel.active).toBe('maplibre');
  expect(sel.pending, 'with the default there is no promise in the boot path at all').toBe('undefined');
});

/* ── ① IT STARTS, AND IT IS REALLY CESIUM ─────────────────────────────────────────────── */
test('R180 ①: selecting Cesium boots the app on Cesium with the whole boot style built', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await asCesium(page);
  const got = await page.evaluate(() => {
    const E = window.IntMapGeoEngine, v = window.__imap, s = v._scene;
    let vec = 0, ents = 0;
    for (let i = 0; i < v._dsColl.length; i++) { const d = v._dsColl.get(i); vec++; ents += d.entities.values.length; }
    return {
      id: E.id(), caps: E.capabilities().engine,
      sources: Object.keys(E.scene.getStyle().sources || {}).length,
      imagery: s.imageryLayers.length, vectorLayers: vec, entities: ents,
      ready: E.ready(), canDraw: E.canDraw(), hasRenderer: E.hasRenderer(),
      failure: window.IntMapEngineSelect.failure(),
      appErrors: (window.__imErrors || []).map((e) => e.msg).slice(0, 3),
    };
  });
  expect(got.failure, 'Cesium must have started, not fallen back').toBe(null);
  expect(got.id).toBe('cesium');
  expect(got.caps).toBe('cesium');
  expect(got.hasRenderer).toBe(true);
  expect(got.canDraw).toBe(true);
  /* the boot style has 20 layers over 8 sources, and the app adds a great many more; these
     bounds are deliberately loose — the claim is "it built the style", not an exact census */
  expect(got.sources, 'the app\'s sources were accepted').toBeGreaterThan(15);
  expect(got.imagery, 'raster layers became Cesium ImageryLayers').toBeGreaterThanOrEqual(6);
  expect(got.vectorLayers, 'and vector layers became DataSources').toBeGreaterThan(20);
  expect(got.entities, 'which actually contain drawn features').toBeGreaterThan(100);
  expect(errors, 'no uncaught exception').toEqual([]);
  expect(got.appErrors).toEqual([]);
});

/* ── ② THE CANVAS AND ITS RESOLUTION ──────────────────────────────────────────────────────
   Two defects found by measuring: Cesium's own default sizes the drawing buffer in CSS pixels
   (the half-resolution defect #R178/#R179 fixed twice already, arriving through a third door),
   and without the widget CSS the canvas stays at the HTML default of 300×150. The second is
   not cosmetic — the engine derives the ZOOM from the canvas height, so a wrong canvas is a
   wrong camera. */
test.describe('R180 ②: the drawing surface', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the canvas fills its container and renders at devicePixelRatio', async ({ page }) => {
    await asCesium(page);
    const got = await page.evaluate(() => {
      const v = window.__imap, c = v.getContainer(), cv = v.getCanvas();
      return { dpr: window.devicePixelRatio, cw: c.clientWidth, ch: c.clientHeight,
               cssW: cv.clientWidth, cssH: cv.clientHeight, bufW: cv.width, bufH: cv.height };
    });
    expect(got.dpr).toBe(2);
    expect(got.cw).toBeGreaterThan(200);
    expect(got.cssW, 'the canvas fills the container — 300×150 is the bug').toBe(got.cw);
    expect(got.cssH).toBe(got.ch);
    expect(got.bufW, 'and carries devicePixelRatio pixels, not CSS pixels').toBe(got.cssW * 2);
    expect(got.bufH).toBe(got.cssH * 2);
  });
});

/* ── ③ THE CAMERA AGREES WITH MAPLIBRE ────────────────────────────────────────────────────
   The two engines have incompatible camera models — MapLibre's is (centre, zoom, pitch,
   bearing) over a Mercator world in pixels, Cesium's is a position and an orientation in ECEF
   metres — so "the same view after switching" is a claim that has to be measured, not assumed.
   The anchor is #R178's own figure for MapLibre at the app's startup view. */
test('R180 ③: the startup view puts the eye where MapLibre puts it, and the round trip is exact', async ({ page }) => {
  await asCesium(page);
  const boot = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    return { z: E.camera.getZoom(), c: E.camera.getCenter(), eye: E.camera.eye() };
  });
  expect(boot.z, 'the app boots at zoom 1.7').toBeCloseTo(1.7, 3);
  expect(boot.c.lng).toBeCloseTo(10, 4);
  expect(boot.c.lat).toBeCloseTo(20, 4);
  /* #R178 measured MapLibre's eye at globe z1.7 as 24,422 km. Cesium is asked for the same
     view through the same contract; if the mapping were wrong this would be out by megametres,
     which is exactly the failure mode #R176/#R177 spent two rounds on. 1 % is a generous band
     for a number that has six significant figures of agreement. */
  expect(boot.eye.alt).toBeGreaterThan(24_422_000 * 0.99);
  expect(boot.eye.alt).toBeLessThan(24_422_000 * 1.01);

  /* …and a single jumpTo round-trips exactly, across the bands and past the horizon-adjacent
     pitches. The look-at point sits ON the terrain, so the engine re-asserts the camera when
     the ground under it arrives (_settle); without that a mountain lands kilometres out. */
  const rounds = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const out = [];
    for (const t of [[2.35, 48.86, 4, 0, 0], [139.69, 35.68, 9, 55, 30], [-122.4, 37.8, 14, 60, 215]]) {
      E.camera.jumpTo({ center: [t[0], t[1]], zoom: t[2], pitch: t[3], bearing: t[4] });
      await new Promise((r) => setTimeout(r, 3500));
      const c = E.camera.getCenter();
      out.push({
        z: t[2], p: t[3],
        dM: Math.hypot((c.lng - t[0]) * 111320 * Math.cos(t[1] * Math.PI / 180), (c.lat - t[1]) * 110574),
        dZ: E.camera.getZoom() - t[2],
        dP: E.camera.getPitch() - t[3],
      });
    }
    return out;
  });
  for (const r of rounds) {
    expect(Math.abs(r.dM), `centre at z${r.z}/pitch${r.p}`).toBeLessThan(60);
    expect(Math.abs(r.dZ), `zoom at z${r.z}/pitch${r.p}`).toBeLessThan(0.02);
    expect(Math.abs(r.dP), `pitch at z${r.z}/pitch${r.p}`).toBeLessThan(0.5);
  }
});

/* ── ④ THE STYLE LANGUAGE, INTERPRETED INTO A REAL SCENE ─────────────────────────────────
   The Node checks prove the evaluator; this proves the evaluator is WIRED — that a layer added
   through the contract with an expression paint really produces a Cesium primitive carrying
   the value the expression computes. */
test('R180 ④: a layer added through the contract draws, with its expressions evaluated', async ({ page }) => {
  await asCesium(page);
  const got = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, v = window.__imap;
    E.layers.addSource('r180', { type: 'geojson', data: { type: 'FeatureCollection', features: [
      { type: 'Feature', id: 1, properties: { kind: 'a', n: 7 }, geometry: { type: 'Point', coordinates: [139.69, 35.68] } },
      { type: 'Feature', id: 2, properties: { kind: 'b' }, geometry: { type: 'Polygon', coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]] } },
    ] } });
    E.layers.add({ id: 'r180-pt', type: 'circle', source: 'r180', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 0, 4, 10, 18],
               'circle-color': ['case', ['==', ['get', 'kind'], 'a'], '#ff3b30', '#0a84ff'] } });
    E.layers.add({ id: 'r180-fill', type: 'fill', source: 'r180', filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#30a46c', 'fill-opacity': 0.5 } });
    /* DataSourceCollection.add is asynchronous — a probe that reads immediately sees nothing */
    await new Promise((r) => setTimeout(r, 800));
    const gv = (x) => (x && x.getValue ? x.getValue() : x);
    const ds = (id) => { const rec = v._layerById.get(id); return rec && rec.ds; };
    const pt = ds('r180-pt').entities.values, fl = ds('r180-fill').entities.values;
    const before = { n: pt.length, size: gv(pt[0].point.pixelSize), col: gv(pt[0].point.color).toCssHexString() };
    E.layers.setPaint('r180-fill', 'fill-color', '#ff00ff');
    await new Promise((r) => setTimeout(r, 400));
    const after = gv(ds('r180-fill').entities.values[0].polygon.material.color).toCssHexString();
    E.layers.setVisible('r180-fill', false);
    const hidden = E.layers.isVisible('r180-fill');
    /* pick where the feature actually IS. The camera is still at the boot view, so the screen
       centre is the middle of the Atlantic — the first draft of this test asked there and
       reported "not pickable" about a point 9,000 km away. */
    E.camera.jumpTo({ center: [139.69, 35.68], zoom: 10, pitch: 0, bearing: 0 });
    await new Promise((r) => setTimeout(r, 1200));
    const at = E.coords.project({ lng: 139.69, lat: 35.68 });
    const picked = E.coords.queryRenderedFeatures([at.x, at.y]).map((f) => f.layer.id);
    return { before, fillCount: fl.length, after, hidden, picked, has: E.layers.has('r180-pt') };
  });
  expect(got.has).toBe(true);
  expect(got.before.n, 'the geometry-type filter kept only the Point').toBe(1);
  /* n=7 through interpolate(0→4, 10→18) is 13.8, and a circle-radius is a RADIUS */
  expect(got.before.size).toBeCloseTo(27.6, 4);
  expect(got.before.col, 'the case/== on a property chose the right branch').toBe('#ff3b30');
  expect(got.fillCount, 'the legacy $type filter kept only the Polygon').toBe(1);
  expect(got.after, 'setPaint re-resolves, and fill-opacity 0.5 is carried into the alpha').toBe('#ff00ff80');
  expect(got.hidden).toBe(false);
  expect(got.picked, 'and the drawn feature is pickable — queryRenderedFeatures answers').toContain('r180-pt');
});

/* ── ⑤ VECTOR TILES ───────────────────────────────────────────────────────────────────────
   The coverage bar chosen for this round was full parity INCLUDING vector tiles — the six
   `type:'vector'` sources (OpenFreeMap place labels, the languages tileset, the DEM contours,
   two Open-Meteo tilesets). Cesium has no vector-tile pipeline; this is the one built for it. */
test('R180 ⑤: an MVT source decodes and its features reach the scene', async ({ page }) => {
  await asCesium(page);
  const got = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, v = window.__imap;
    E.camera.jumpTo({ center: [10, 20], zoom: 3, pitch: 0, bearing: 0 });
    /* the OpenFreeMap tileset the place-label layer uses; give the pyramid time to fetch */
    for (let i = 0; i < 40; i++) {
      const rec = v._layerById.get('ofm-country');
      if (rec && rec.ds && rec.ds.entities.values.length) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const rec = v._layerById.get('ofm-country');
    const src = v._sources.get(rec && rec.def.source);
    const gv = (x) => (x && x.getValue ? x.getValue() : x);
    const labels = rec && rec.ds ? rec.ds.entities.values : [];
    return {
      sourceType: src && src.type,
      sourceLayer: rec && rec.def['source-layer'],
      stats: src && src.vt && src.vt.stats(),
      entities: labels.length,
      sampleText: labels.slice(0, 3).map((e) => gv(e.label && e.label.text)),
      shown: labels.filter((e) => gv(e.label && e.label.show) === true).length,
    };
  });
  expect(got.sourceType, 'this really is a vector-tile source').toBe('vector');
  expect(got.sourceLayer, 'and the layer selects a source-layer within the tileset').toBe('place');
  expect(got.stats.tiles, 'the TileJSON resolved to a tile template').toBe(true);
  expect(got.stats.error, 'no tile failed to decode').toBe(0);
  expect(got.stats.ready, 'tiles decoded').toBeGreaterThan(3);
  expect(got.entities, 'and their features became drawable entities').toBeGreaterThan(50);
  expect(got.sampleText.filter(Boolean).length, 'carrying real names from the tile').toBe(3);
  /* the declutter must HIDE most of them — that is the whole point of it — but not all */
  expect(got.shown).toBeGreaterThan(0);
  expect(got.shown).toBeLessThan(got.entities);
});

/* ── ⑥ TERRAIN, FROM THE SAME DEM THE MAPLIBRE SIDE STREAMS ──────────────────────────────
   Keyless: no Cesium Ion asset, no token. Two defects lived here and both produced plausible
   numbers rather than errors — the terrarium encoding resampled as RGB (Tokyo −6,592 m) and
   HeightmapTerrainData's default highestEncodedHeight of 255 clamping everything (Fuji
   −57,092 m). So the test is three known summits and a depression. */
test('R180 ⑥: terrain comes from the app\'s own terrarium DEM and reads true heights', async ({ page }) => {
  test.slow();
  await asCesium(page);
  const got = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, v = window.__imap;
    E.layers.addSource('terrain-dem', { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'] });
    const attached = E.scene.setTerrain({ source: 'terrain-dem', exaggeration: 1.0 });
    /* wait for the height to STOP MOVING, not for it to become non-zero. The DEM refines in
       levels — over Mt Fuji the reading went 0 → coarse → 3,752 m across about four seconds —
       so taking the first non-zero value samples a half-loaded pyramid and reports a smoothed
       figure from a tile that spans ocean. This is the same convergence the engine's own
       _settle waits for. */
    const sample = async (lng, lat, zoom) => {
      E.camera.jumpTo({ center: [lng, lat], zoom, pitch: 0, bearing: 0 });
      let last = null, stable = 0;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const h = E.coords.terrainElevation({ lng, lat });
        const quiet = !!v._scene.globe.tilesLoaded;
        if (h != null && last != null && Math.abs(h - last) < 1) { stable++; if (stable >= 2 && quiet) return h; }
        else stable = 0;
        last = h;
      }
      return last;
    };
    const fuji = await sample(138.7274, 35.3606, 12);
    const dead = await sample(35.5, 31.5, 11);
    return { attached, fuji, dead, ion: !!(window.__imCesium && window.__imCesium.Cesium.Ion.defaultAccessToken),
             provider: v._scene.terrainProvider.constructor.name };
  });
  expect(got.attached).toBe(true);
  expect(got.ion, 'no Ion token — the app is keyless').toBe(false);
  /* Mt Fuji is 3,776 m; a z12 terrarium sample is ~38 m/px and does not land on the survey
     marker, so the band is generous — but −6,592 m and −57,092 m are both far outside it, and
     those were the two real bugs. */
  expect(got.fuji, 'Mt Fuji').toBeGreaterThan(3400);
  expect(got.fuji).toBeLessThan(3900);
  /* the Dead Sea shore is about −430 m: the sign matters as much as the magnitude, because the
     clamped structure could not represent a negative height at all */
  expect(got.dead, 'the Dead Sea is below sea level').toBeLessThan(-250);
  expect(got.dead).toBeGreaterThan(-600);
});

/* ── ⑦ AN ADDITIONAL VIEW — #R179's per-view contract, on engine two ──────────────────────
   #R179 closed `ui.createView` because a second view kept the raw handle under a local name.
   The replacement is `ui.createSubView`, which returns the SAME contract scoped to the new
   view. That shape is only worth anything if the second engine can honour it. */
test('R180 ⑦: a sub-view is a full contract that answers about ITSELF', async ({ page }) => {
  await asCesium(page);
  const got = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:320px;height:240px;';
    document.body.appendChild(host);
    E.camera.jumpTo({ center: [0, 0], zoom: 8 });
    const sub = E.ui.createSubView({ container: host, center: [10, 20], zoom: 3 });
    if (!sub) return { made: false };
    await new Promise((r) => setTimeout(r, 600));
    sub.layers.addSource('sub-only', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const out = {
      made: true, id: sub.id(),
      sections: ['camera', 'layers', 'scene', 'events', 'render', 'coords', 'input', 'ui'].filter((k) => !!sub[k]),
      subZoom: sub.camera.getZoom(), mainZoom: E.camera.getZoom(),
      subHasSource: sub.layers.hasSource('sub-only'),
      mainHasSource: E.layers.hasSource('sub-only'),
      destroys: typeof sub.destroy === 'function',
    };
    sub.destroy(); host.remove();
    return out;
  });
  expect(got.made, 'the second engine can build an additional view at all').toBe(true);
  expect(got.id).toBe('cesium');
  expect(got.sections).toEqual(['camera', 'layers', 'scene', 'events', 'render', 'coords', 'input', 'ui']);
  expect(Math.abs(got.subZoom - 3), 'it answers about its OWN camera').toBeLessThan(0.2);
  expect(Math.abs(got.mainZoom - 8), 'and the primary view is untouched').toBeLessThan(0.2);
  expect(got.subHasSource).toBe(true);
  expect(got.mainHasSource, 'its sources are its own').toBe(false);
  expect(got.destroys).toBe(true);
});

/* ── ⑧ AND IT CAN BE TURNED BACK OFF ─────────────────────────────────────────────────────
   A setting that cannot be undone is a trap. The stored value is the ONLY thing that decides,
   so clearing it must return the next session to MapLibre with nothing left behind. */
test('R180 ⑧: switching back leaves a plain MapLibre session', async ({ page }) => {
  await asCesium(page);
  await page.evaluate(() => { window.IntMapEngineSelect.set('maplibre'); });
  await page.reload();
  await page.waitForFunction(() => !!window.__imap, null, BOOT);
  const got = await page.evaluate(() => ({
    id: window.IntMapGeoEngine.id(),
    choice: window.IntMapEngineSelect.choice(),
    pending: typeof window.IntMapEnginePending,
    layers: window.IntMapGeoEngine.scene.getStyle().layers.length,
  }));
  expect(got.id).toBe('maplibre');
  expect(got.choice).toBe('maplibre');
  expect(got.pending, 'and no engine promise is created at all').toBe('undefined');
  expect(got.layers).toBeGreaterThan(10);
});
