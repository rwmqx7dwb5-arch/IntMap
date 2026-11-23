// (globe-flat-camera) THE FLAT MAP'S CAMERA READS BACK THE CAMERA IT WAS GIVEN (CESIUM; MAPLIBRE WAS MEASURED CORRECT).
//
// On Cesium the flat map is COLUMBUS_VIEW, whose `positionWC` is the scene's own axes (height, easting,
// northing), not ECEF. The camera read-back (_hprRaw) inverted it as an ECEF point, so on the flat map
// jumpTo({center:[30,50], zoom:5, bearing:90, pitch:40}) came back as bearing −146°, pitch 106°
// (an upside-down map) and zoom 4.59 while Cesium's own camera held heading 90°, pitch −50°. MapLibre
// answered the same question correctly, so only Cesium is booted here.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const BOOT = { timeout: 90_000 };
const ASKS = [
  { center: [30, 50], zoom: 5, bearing: 90, pitch: 40 },
  { center: [139.7, 35.7], zoom: 8, bearing: -30, pitch: 20 },
  { center: [-70, -20], zoom: 3, bearing: 0, pitch: 55 },
];

const settle = (page, ms = 2500) => page.evaluate((b) => new Promise((r) => setTimeout(r, b)), ms);
const readCam = (page) => page.evaluate(() => {
  const x = window.IntMapGeoEngine.camera.get();
  return { lng: x.center.lng, lat: x.center.lat, zoom: x.zoom, bearing: x.bearing, pitch: x.pitch };
});
const flat = async (page) => { await page.evaluate(() => document.getElementById('btn-view-flat').click()); await settle(page, 2500); };

/* MapLibre reads these back correctly on the flat map (measured 2026-11-20) and the defect was Cesium-only, so only Cesium is
   booted here — the second boot would cost ~25 s of the browser budget for a property nothing in this change can move */
for (const engine of ['cesium']) {
  /* ONE boot per engine: the asked-for camera reads back, then an eased move lands where it was sent */
  test(`${engine}: on the flat map the camera asked for is the camera read back, jumped and eased`, async ({ page }) => {
    test.setTimeout(120_000);
    await bootEngine(page, engine, BOOT);
    await flat(page);
    for (const a of ASKS.slice(0, 2)) {
      await page.evaluate((c) => window.IntMapGeoEngine.camera.jumpTo({ center: { lng: c.center[0], lat: c.center[1] }, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch }), a);
      await settle(page, 1200);
      const got = await readCam(page);
      const tag = `${engine} jump ${JSON.stringify(a)} → ${JSON.stringify(got)}`;
      expect(Math.abs(got.lng - a.center[0]), tag).toBeLessThan(0.05);
      expect(Math.abs(got.lat - a.center[1]), tag).toBeLessThan(0.05);
      expect(Math.abs(got.zoom - a.zoom), tag).toBeLessThan(0.05);
      expect(Math.abs(got.bearing - a.bearing), tag).toBeLessThan(0.5);
      expect(Math.abs(got.pitch - a.pitch), tag).toBeLessThan(0.5);
    }
    const e = ASKS[2];
    await page.evaluate((c) => window.IntMapGeoEngine.camera.easeTo({ center: { lng: c.center[0], lat: c.center[1] }, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch, duration: 500 }), e);
    await settle(page, 2500);
    const got = await readCam(page);
    const tag = `${engine} ease ${JSON.stringify(got)}`;
    expect(Math.abs(got.lng - e.center[0]), tag).toBeLessThan(0.1);
    expect(Math.abs(got.lat - e.center[1]), tag).toBeLessThan(0.1);
    expect(Math.abs(got.bearing - e.bearing), tag).toBeLessThan(1);
    expect(Math.abs(got.pitch - e.pitch), tag).toBeLessThan(1);
  });
}
