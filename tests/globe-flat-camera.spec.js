// (globe-flat-camera) THE FLAT MAP'S CAMERA READS BACK THE CAMERA IT WAS GIVEN — ON BOTH ENGINES.
//
// On Cesium the flat map is COLUMBUS_VIEW, whose `positionWC` is the scene's own axes (height, easting,
// northing), not ECEF. The camera read-back (_hprRaw) inverted it as an ECEF point, so on the flat map
// jumpTo({center:[30,50], zoom:5, bearing:90, pitch:40}) came back as bearing −146°, pitch 106°
// (an upside-down map) and zoom 4.59 while Cesium's own camera held heading 90°, pitch −50°. MapLibre
// answered the same question correctly, so the two engines are compared on the SAME asks.
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
const flat = async (page) => { await page.evaluate(() => document.getElementById('btn-view-flat').click()); await settle(page, 3500); };

for (const engine of ['maplibre', 'cesium']) {
  test(`${engine}: on the flat map a camera that was asked for is the camera that is read back`, async ({ page }) => {
    test.setTimeout(180_000);
    await bootEngine(page, engine, BOOT);
    await flat(page);
    for (const a of ASKS) {
      await page.evaluate((c) => window.IntMapGeoEngine.camera.jumpTo({ center: { lng: c.center[0], lat: c.center[1] }, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch }), a);
      await settle(page);
      const got = await readCam(page);
      const tag = `${engine} ${JSON.stringify(a)} → ${JSON.stringify(got)}`;
      expect(Math.abs(got.lng - a.center[0]), tag).toBeLessThan(0.05);
      expect(Math.abs(got.lat - a.center[1]), tag).toBeLessThan(0.05);
      expect(Math.abs(got.zoom - a.zoom), tag).toBeLessThan(0.05);
      expect(Math.abs(got.bearing - a.bearing), tag).toBeLessThan(0.5);
      expect(Math.abs(got.pitch - a.pitch), tag).toBeLessThan(0.5);
    }
  });

  test(`${engine}: an eased move on the flat map lands where it was sent`, async ({ page }) => {
    test.setTimeout(180_000);
    await bootEngine(page, engine, BOOT);
    await flat(page);
    const a = ASKS[1];
    await page.evaluate((c) => window.IntMapGeoEngine.camera.easeTo({ center: { lng: c.center[0], lat: c.center[1] }, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch, duration: 600 }), a);
    await settle(page, 4000);
    const got = await readCam(page);
    const tag = `${engine} ${JSON.stringify(got)}`;
    expect(Math.abs(got.lng - a.center[0]), tag).toBeLessThan(0.1);
    expect(Math.abs(got.lat - a.center[1]), tag).toBeLessThan(0.1);
    expect(Math.abs(got.bearing - a.bearing), tag).toBeLessThan(1);
    expect(Math.abs(got.pitch - a.pitch), tag).toBeLessThan(1);
  });
}
