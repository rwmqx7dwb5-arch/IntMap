/* ============================================================================
 *  cesium-koppen-and-boot-probe — Köppen on the Cesium engine, on the built site.
 *
 *  「Cesium エンジンで起動すると、Köppen（気候区分）がオンで凡例も出ているのに地球儀が塗られない」
 *  MEASURED before the fix, this spec's own boot: `lyr-climate` and `src-climate` in the Cesium
 *  style, the row ticked, and the layer record `imagery:false, provider:null` — the adapter's
 *  `new SingleTileImageryProvider({url, rectangle})` threw (Cesium ≥1.104 requires tileWidth) into a
 *  catch that returned null. The node half (tests/cesium-koppen-and-boot-probe-checks.test.mjs)
 *  evaluates the provider against real Cesium; what only a browser can show is that the GLOBE is
 *  painted, in the right place, and stays painted while the picture is replaced.
 *
 *  ⚠ THE PLACE IS THE ASSERTION. The Sahara at 23° N, 10° E is BWh, pure red in the palette. The
 *  Köppen PNG is Web Mercator; draped geographically (what SingleTileImageryProvider does) the pixel
 *  at 23° N would carry the row for about 43.7° N — the Alps, green. So «red at the Sahara» is both
 *  «painted» and «painted as Mercator».
 *
 *  ⚠ UNSEEDED, AND THE ROW IS TICKED THE WAY A READER TICKS IT. Until basic-display-not-layers (#900,
 *  2026-10-02) Köppen was default-on and this spec waited for it after boot; since then no layer is on for a
 *  first visit, so that wait measured a layer nobody had asked for and timed out at 90 s on the nightly deep
 *  tier (2026-10-02/03, `lyr-climate` absent). The claim is about painting once it IS on, not about the default.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('Köppen paints the Cesium globe, as Mercator, and keeps painting through updateImage', async ({ page }) => {
  test.setTimeout(240_000);
  await bootEngine(page, 'cesium', { timeout: 120_000 });
  await page.waitForFunction(() => !!document.getElementById('dl-climate'), null, { timeout: 60_000 });
  await page.evaluate(() => {
    const cb = document.getElementById('dl-climate');
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const ready = () => page.waitForFunction(() => {
    const r = window.IntMapGeoEngine.raw()._layerById.get('lyr-climate');
    return !!(r && r.imagery && r.imagery.ready && !r.retiring);
  }, null, { timeout: 90_000 });
  await ready();

  const first = await page.evaluate(() => {
    const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium;
    const r = V._layerById.get('lyr-climate'), P = r.provider;
    return { unpainted: r.unpainted, tileWidth: P.tileWidth, mercator: P.tilingScheme.projection instanceof C.WebMercatorProjection };
  });
  expect(first.unpainted).toBeNull();
  expect(first.tileWidth).toBeGreaterThan(0);
  expect(first.mercator, 'the Köppen PNG is Web Mercator; a geographic drape slides every zone').toBe(true);

  /* the share of BWh-red pixels in a 21×21 block at the centre of a view over the Sahara, with the layer
     opaque so the base map does not tint it. A block, not one pixel, so a label or a border line that
     happens to cross the centre cannot decide the answer.
     ⚠ `tilesLoaded` is read only AFTER a few frames have been rendered at the new camera: straight
     after jumpTo it still answers for the previous view (measured — the first version sampled the
     unrefined tile and saw sand, 252,223,165).
     ⚠ And every read is of a frame drawn THIS task: the scene runs in requestRenderMode, so a bare
     render() with nothing changed draws nothing, and the drawing buffer (not preserved) reads back
     black — measured as 0,0,0 over a globe the screenshot showed painted. requestRender() first. */
  const sahara = () => page.evaluate(async () => {
    const E = window.IntMapGeoEngine, V = E.raw();
    E.camera.jumpTo({ center: [10, 23], zoom: 5, pitch: 0, bearing: 0 });
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 200));
      V._scene.requestRender(); V._scene.render();
      if (i >= 3 && V._globe.tilesLoaded) break;
    }
    V._scene.requestRender(); V._scene.render();
    const cv = V._scene.canvas, c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const x = c2.getContext('2d'); x.drawImage(cv, 0, 0);
    const d = x.getImageData((cv.width >> 1) - 10, (cv.height >> 1) - 10, 21, 21).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) red++;
    return { share: red / (d.length / 4), centre: Array.from(d.slice(220 * 4, 220 * 4 + 3)) };
  });
  await page.evaluate(() => window.IntMapGeoEngine.layers.setPaint('lyr-climate', 'raster-opacity', 1));
  const on = await sahara();
  expect(on.share, `Sahara block ${JSON.stringify(on)} — BWh is (255,0,0); a geographic drape shows the Alps here`).toBeGreaterThan(0.5);

  /* control: the red is the layer's, not the base map's */
  await page.evaluate(() => window.IntMapGeoEngine.layers.setVisible('lyr-climate', false));
  const off = await sahara();
  expect(off.share, `with the layer hidden the Sahara block is ${JSON.stringify(off)}`).toBeLessThan(0.05);
  await page.evaluate(() => window.IntMapGeoEngine.layers.setVisible('lyr-climate', true));

  /* updateImage (an era switch, a class highlight, the full-resolution swap) keeps the old picture on
     screen until the new one has decoded, then retires it */
  const swap = await page.evaluate(() => {
    const E = window.IntMapGeoEngine, V = E.raw();
    const before = V._layerById.get('lyr-climate').imagery;
    E.layers.updateImage('src-climate', { url: 'koppen_mercator_1961-1990_4k.png', coordinates: window.KCOORDS });
    const r = V._layerById.get('lyr-climate');
    return { keptOnScreen: r.retiring === before, replaced: r.imagery !== before };
  });
  expect(swap.replaced).toBe(true);
  expect(swap.keptOnScreen, 'the layer went blank while the next picture decoded').toBe(true);
  await ready();
  const after = await sahara();
  expect(after.share, `after updateImage the Sahara block is ${JSON.stringify(after)}`).toBeGreaterThan(0.5);
});
