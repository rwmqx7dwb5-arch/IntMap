// (plateau-cities-profile) THE PLATEAU LAYER ACROSS JAPAN: WHICH CITIES OPEN, HOW FAST, AND WHETHER THEY MEET THE GROUND.
//
// Per city: the camera goes there, the layer is switched on, and the spec records which datasets the layer opened (near the
// view only), the time to the first tile, the engine's tile/byte counts, and the LOWEST building-tile base in metres above the
// sea-level ground. With the city's own geoid correction the lowest base sits near the ground (a few m to the local terrain
// height); without it, it would sit ~28-44 m up (the geoid undulation of Japan, data/plateau-cities.json). Tokyo floated ~37 m
// before js/plateau-cities.js carried a per-city value.
//
// ⚠ AN INSTRUMENT, NOT A GATE (-profile): `IM_PROFILE=1 npx playwright test tests/plateau-cities-profile.spec.js`. Needs the
// network (api.plateauview.mlit.go.jp). Software-rendered runners give CPU submit times, never FPS (see the sibling spec).
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const PROBE = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json';
const CITIES = [
  { id: 'tokyo', lng: 139.7671, lat: 35.676, h: 1500, prefix: '131' },
  { id: 'osaka', lng: 135.4959, lat: 34.7025, h: 1500, prefix: '27' },
  { id: 'sapporo', lng: 141.3545, lat: 43.0621, h: 1500, prefix: '011' },
  { id: 'nagoya', lng: 136.9066, lat: 35.1815, h: 1500, prefix: '23' },
  { id: 'naha', lng: 127.6811, lat: 26.2124, h: 1500, prefix: '47' },
];

test('PLATEAU cities: opened near the view, grounded by their own geoid', async ({ page, request }) => {
  test.setTimeout(900_000);
  let reachable = false;
  try { reachable = (await request.get(PROBE, { timeout: 20_000 })).ok(); } catch (_) { /* offline */ }
  test.skip(!reachable, 'api.plateauview.mlit.go.jp unreachable — nothing to measure (not faked)');
  await bootEngine(page, 'cesium', { timeout: 120_000 });
  const rows = [];
  for (const c of CITIES) {
    const t0 = Date.now();
    await page.evaluate(async (c) => {
      const GE = window.IntMapGeoEngine, V = GE.raw(), C = window.__imCesium.Cesium;
      V._camera.setView({ destination: C.Cartesian3.fromDegrees(c.lng, c.lat, c.h), orientation: { heading: 0, pitch: C.Math.toRadians(-50), roll: 0 } });
      V._scene.requestRender();
      await window.IntMapBeta.plateauToggle(false);
      await window.IntMapBeta.plateauToggle(true);
    }, c);
    let first = null;
    try {
      await expect.poll(() => page.evaluate(() => { const s = window.IntMapGeoEngine.render.sceneStats(); return s && s.extra ? s.extra.tilesetTiles : 0; }),
        { timeout: 150_000, intervals: [500, 1000, 2000] }).toBeGreaterThan(4);
      first = Date.now() - t0;
    } catch (_) { /* not observed */ }
    await page.waitForTimeout(4000);
    const m = await page.evaluate((c) => {
      const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium, open = [], bases = [];
      for (const [id, rec] of V._tilesets) {
        if (!id.startsWith('plateau-bldg-')) continue;
        open.push(id.slice(13));
        for (const t of (rec.ts && rec.ts._selectedTiles) || []) {
          try {
            const bv = t.boundingVolume; const rect = bv && bv.rectangle ? bv : null;
            if (rect && isFinite(rect.minimumHeight)) bases.push(rect.minimumHeight);
            else if (bv && bv.boundingVolume && bv.boundingVolume.halfAxes) {
              const o = bv.boundingVolume; let lo = Infinity;
              for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
                const cc = C.Matrix3.multiplyByVector(o.halfAxes, new C.Cartesian3(sx, sy, sz), new C.Cartesian3());
                lo = Math.min(lo, C.Cartographic.fromCartesian(C.Cartesian3.add(o.center, cc, new C.Cartesian3())).height); }
              bases.push(lo);
            }
          } catch (_) { /* a tile without bounds */ }
        }
      }
      const s = window.IntMapGeoEngine.render.sceneStats();
      return { open, nearCity: open.filter((x) => x.startsWith(c.prefix)).length, lowestBase: bases.length ? Math.min(...bases) : null, tiles: bases.length, extra: s && s.extra };
    }, c);
    const row = { city: c.id, firstContentMs: first, ...m };
    rows.push(row);
    console.log('PC-CITY ' + JSON.stringify(row));
  }
  for (const r of rows) {
    expect(r.nearCity, r.city + ': the city under the camera is open').toBeGreaterThan(0);
    expect(r.open.length, r.city + ': only nearby datasets').toBeLessThanOrEqual(32);
    if (r.lowestBase != null) expect(r.lowestBase, r.city + ': buildings meet the ground, not float ~30-44 m above it').toBeLessThan(25);
  }
});
