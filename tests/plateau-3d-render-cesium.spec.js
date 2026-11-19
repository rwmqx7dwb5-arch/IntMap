// (plateau-3d-render-cesium) THE PLATEAU 3D TILES PATH, DRAWN IN A REAL BROWSER AND MEASURED.
//
// tests/cesium-3dtiles-perf-checks.test.mjs reads the SOURCE; nothing before this drew a tile. This
// spec turns the `beta-dl-plateau3d` layer on the Cesium engine, parks the camera over Tokyo Station,
// and asks the engine what it actually has: tiles whose content is ready, triangles selected, bytes
// held, the CPU time of each frame (render.instrumentFrames), and whether the console stayed clean.
//
// ⚠ IT NEEDS THE NETWORK. The tilesets live on api.plateauview.mlit.go.jp (and their content on
// MLIT's asset store). When the catalogue cannot be reached the test SKIPS and says why — it does not
// pass on an empty scene, and it does not assert numbers it did not observe. (Note: that host answers
// HEAD with 404 and GET with 200; probe with GET.)
// ⚠ NO FPS FLOOR. The CI runner has no GPU (software GL), so frame time is recorded and printed, and
// the only bounds are "frames were measured" and "a frame is not absurd" (< 5 s), not a speed claim.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const PROBE = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json';

test('PLATEAU Tokyo 3D tiles load and draw on the Cesium globe', async ({ page, request }) => {
  test.setTimeout(240_000);
  let reachable = false;
  try { const r = await request.get(PROBE, { timeout: 20_000 }); reachable = r.ok(); } catch (_) { /* offline */ }
  test.skip(!reachable, 'api.plateauview.mlit.go.jp unreachable from this runner — nothing to measure (not faked)');

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await bootEngine(page, 'cesium', { timeout: 90_000 });
  expect(await page.evaluate(() => window.IntMapGeoEngine.can('tiles3d'))).toBe(true);

  /* frame times, from the engine's own single scene.render wrapper */
  await page.evaluate(() => {
    window.__plateauFrames = [];
    window.IntMapGeoEngine.render.instrumentFrames((dt) => { window.__plateauFrames.push(dt); });
  });

  await page.evaluate(() => window.IntMapBeta.plateauToggle(true));
  /* Tokyo Station, 600 m out, 45° down: LOD2 tiles are only selected when the screen-space error asks */
  await page.evaluate(() => {
    const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium;
    V._camera.setView({
      destination: C.Cartesian3.fromDegrees(139.7671, 35.6760, 650),
      orientation: { heading: C.Math.toRadians(20), pitch: C.Math.toRadians(-40), roll: 0 },
    });
    V._scene.requestRender();
  });

  /* wait for ANY ward's tileset to have content ready — the camera is over Chiyoda (13101) */
  let info = null;
  await expect.poll(async () => {
    info = await page.evaluate(() => {
      const L = window.IntMapGeoEngine.layers; const s = window.IntMapGeoEngine.render.sceneStats();
      const out = []; for (let c = 13101; c <= 13123; c++) { const i = L.tilesetInfo('plateau-bldg-' + c); if (i) out.push(i); }
      return { sets: out, stats: s && s.extra };
    });
    return info.stats ? info.stats.tilesetTiles : 0;
  }, { timeout: 150_000, intervals: [1000, 2000, 3000] }).toBeGreaterThan(0);

  /* let it settle and keep drawing for a moment so frame times mean something */
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const f = window.__plateauFrames.slice().sort((a, b) => a - b);
    const q = (p) => f.length ? f[Math.min(f.length - 1, Math.floor(p * f.length))] : null;
    const s = window.IntMapGeoEngine.render.sceneStats();
    return { frames: f.length, p50: q(0.5), p95: q(0.95), max: f[f.length - 1] ?? null, extra: s && s.extra,
             mem: performance.memory ? performance.memory.usedJSHeapSize : null };
  });
  console.log('PLATEAU-3DTILES-MEASURED ' + JSON.stringify(m));

  expect(m.extra.tilesets).toBeGreaterThan(0);
  expect(m.extra.tilesetTiles, 'tiles whose content is ready').toBeGreaterThan(0);
  expect(m.extra.tilesetTriangles, 'triangles selected for this view').toBeGreaterThan(0);
  expect(m.frames, 'scene.render frames measured').toBeGreaterThan(0);
  expect(m.max, 'no frame stalls for 5 s').toBeLessThan(5000);
  /* the layer's own error surface: no tileset may report one */
  const bad = await page.evaluate(() => { const L = window.IntMapGeoEngine.layers; const r = [];
    for (let c = 13101; c <= 13123; c++) { const id = 'plateau-bldg-' + c, i = L.tilesetInfo(id); if (i && i.error) r.push(id + ': ' + i.error); } return r; });
  expect(bad).toEqual([]);
  expect(errors.filter((e) => !/favicon|ERR_BLOCKED|net::ERR_FAILED.*(tiles|basemap)/i.test(e))).toEqual([]);
});
