// (plateau-render-quality-profile) THE 3D PATH MEASURED FROM SEVERAL VIEWPOINTS, AND THE BUILDING/TERRAIN HEIGHT CHECKED.
//
// Extends plateau-3d-render-profile.spec.js (one view, no heights). Per viewpoint it records: time to the first
// ready tile, frame-time distribution (CPU submit time of scene.render, from render.instrumentFrames), the
// engine's tile / triangle / byte counts, and JS heap. A second test compares where PLATEAU's building bases sit
// with where the terrain surface sits (the geoid question the data notes left open).
//
// ⚠ AN INSTRUMENT, NOT A GATE (-profile): `npm run test:profile`, or `IM_PROFILE=1 npx playwright test <file>`.
// ⚠ HEADLESS LIMIT (memory: intmap-headless-preview-limits). The runner's WebGL is usually SwiftShader (CPU).
//   The spec READS the unmasked renderer string and writes `gpu: 'software'|'hardware'|'unknown'` into every
//   record. Frame times are never presented as FPS on a software renderer: `fpsClaim` is null there — "not
//   measured", which is neither a pass nor a fail. Heap uses performance.memory (Chromium only; null elsewhere).
// ⚠ NEEDS THE NETWORK (api.plateauview.mlit.go.jp, probed with GET). Unreachable → skip with the reason.
// ⚠ IM_MOBILE=1 emulates a phone: 390x844 viewport, DPR 3, a mobile UA (so the engine's own `mob` branch picks the
//   128 MB cache and SSE 24) and a 4x CPU throttle through CDP. It is an emulation, not a phone.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const PROBE = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json';
const MOBILE = process.env.IM_MOBILE === '1';

const VIEWS = [
  { id: 'tokyo-high', lng: 139.7671, lat: 35.676, h: 2500, heading: 20, pitch: -45, plateau: true },
  { id: 'tokyo-low', lng: 139.7671, lat: 35.676, h: 650, heading: 20, pitch: -40, plateau: true },
  { id: 'tokyo-ward-wide', lng: 139.74, lat: 35.66, h: 9000, heading: 0, pitch: -60, plateau: true },
  { id: 'fuji-terrain', lng: 138.7274, lat: 35.3606, h: 9000, heading: 200, pitch: -25, plateau: false, terrain: true },
];

async function frameStats(page) {
  return page.evaluate(() => {
    const f = window.__rq.frames.slice().sort((a, b) => a - b);
    const q = (p) => (f.length ? f[Math.min(f.length - 1, Math.floor(p * f.length))] : null);
    const s = window.IntMapGeoEngine.render.sceneStats();
    return { frames: f.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: f.length ? f[f.length - 1] : null,
             extra: s && s.extra };
  }).then(async (r) => ({ ...r, heap: await heapBytes() }));
}

let CDP = null;
async function setup(page, context) {
  CDP = await context.newCDPSession(page);
  await CDP.send('Performance.enable');
  if (MOBILE) {
    await page.setViewportSize({ width: 390, height: 844 });
    await CDP.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
}
/* performance.memory is bucketed/clamped in headless (read 1,000,000,000 flat); the CDP counter is the real one */
async function heapBytes() { const r = await CDP.send('Performance.getMetrics'); const m = r.metrics.find((x) => x.name === 'JSHeapUsedSize'); return m ? m.value : null; }

test.use(MOBILE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', deviceScaleFactor: 3, hasTouch: true } : {});

test('3D render quality across viewpoints', async ({ page, request, context }) => {
  test.setTimeout(900_000);
  let reachable = false;
  try { reachable = (await request.get(PROBE, { timeout: 20_000 })).ok(); } catch (_) { /* offline */ }
  test.skip(!reachable, 'api.plateauview.mlit.go.jp unreachable — nothing to measure (not faked)');
  await setup(page, context);
  await bootEngine(page, 'cesium', { timeout: 120_000 });

  const gpu = await page.evaluate(() => {
    try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
      const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : null; } catch (_) { return null; } });
  const kind = !gpu ? 'unknown' : /swiftshader|llvmpipe|software|basic render/i.test(gpu) ? 'software' : 'hardware';
  console.log('RQ-ENV ' + JSON.stringify({ gpu, kind, mobile: MOBILE, viewport: page.viewportSize() }));

  await page.evaluate(() => { window.__rq = { frames: [] }; window.IntMapGeoEngine.render.instrumentFrames((dt) => { window.__rq.frames.push(dt); }); });
  const rows = [];
  for (const v of VIEWS) {
    await page.evaluate(async (v) => {
      window.__rq.frames.length = 0;
      const GE = window.IntMapGeoEngine;
      GE.scene.setTerrain(v.terrain ? { source: 'terrain-dem', exaggeration: 1 } : null);
      await window.IntMapBeta.plateauToggle(!!v.plateau);
      const V = GE.raw(), C = window.__imCesium.Cesium;
      window.__rq.t0 = performance.now();
      V._camera.setView({ destination: C.Cartesian3.fromDegrees(v.lng, v.lat, v.h),
        orientation: { heading: C.Math.toRadians(v.heading), pitch: C.Math.toRadians(v.pitch), roll: 0 } });
      V._scene.requestRender();
    }, v);
    let firstMs = null;
    const t0 = Date.now();
    try {
      await expect.poll(async () => { const s = await page.evaluate(() => { const x = window.IntMapGeoEngine.render.sceneStats(); return x && x.extra; });
        const n = v.plateau ? (s ? s.tilesetTiles : 0) : (window.__rq.frames.length > 30 ? 1 : 0).valueOf();
        return n; }, { timeout: 120_000, intervals: [500, 1000, 2000] }).toBeGreaterThan(0);
      firstMs = Date.now() - t0;
    } catch (_) { /* leave firstMs null: not observed */ }
    await page.waitForTimeout(3000);
    const m = await frameStats(page);
    const row = { view: v.id, gpu: kind, mobile: MOBILE, firstContentMs: firstMs, observed: firstMs != null, ...m,
                  fpsClaim: kind === 'hardware' && m.p50 ? Math.round(1000 / m.p50) : null };
    rows.push(row);
    console.log('RQ-VIEW ' + JSON.stringify(row));
  }
  expect(rows.length).toBe(VIEWS.length);
});

test('PLATEAU building bases against the terrain surface', async ({ page, request, context }) => {
  test.setTimeout(400_000);
  let reachable = false;
  try { reachable = (await request.get(PROBE, { timeout: 20_000 })).ok(); } catch (_) { /* offline */ }
  test.skip(!reachable, 'api.plateauview.mlit.go.jp unreachable — nothing to measure (not faked)');
  await setup(page, context);
  await bootEngine(page, 'cesium', { timeout: 120_000 });
  const probe = async (terrain) => {
    await page.evaluate(async (terrain) => {
      const GE = window.IntMapGeoEngine;
      GE.scene.setTerrain(terrain ? { source: 'terrain-dem', exaggeration: 1 } : null);
      await window.IntMapBeta.plateauToggle(true);
      const V = GE.raw(), C = window.__imCesium.Cesium;
      V._camera.setView({ destination: C.Cartesian3.fromDegrees(139.7671, 35.676, 1200),
        orientation: { heading: 0, pitch: C.Math.toRadians(-60), roll: 0 } });
      V._scene.requestRender();
    }, terrain);
    await expect.poll(() => page.evaluate(() => { const s = window.IntMapGeoEngine.render.sceneStats(); return s && s.extra ? s.extra.tilesetTiles : 0; }),
      { timeout: 150_000, intervals: [1000, 2000] }).toBeGreaterThan(4);
    await page.waitForTimeout(4000);
    return page.evaluate(async () => {
      const GE = window.IntMapGeoEngine, V = GE.raw(), C = window.__imCesium.Cesium, sc = V._scene;
      /* the lowest point of every loaded building tile (region/box bounds) ≈ where the building meets the ground */
      const bases = []; const bad = [];
      for (let c = 13101; c <= 13123; c++) { const rec = V._tilesets.get('plateau-bldg-' + c); if (!rec || !rec.ts) continue;
        const sel = rec.ts._selectedTiles || [];
        for (const t of sel) { try { const bv = t.boundingVolume; const rect = bv && bv.rectangle ? bv : null;
          if (rect && isFinite(rect.minimumHeight)) bases.push({ min: rect.minimumHeight, lng: C.Math.toDegrees((rect.rectangle.west + rect.rectangle.east) / 2), lat: C.Math.toDegrees((rect.rectangle.south + rect.rectangle.north) / 2) });
          else if (bv && bv.boundingVolume && bv.boundingVolume.halfAxes) { const o = bv.boundingVolume, cg = C.Cartographic.fromCartesian(o.center); let lo = Infinity;
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const cc = C.Matrix3.multiplyByVector(o.halfAxes, new C.Cartesian3(sx, sy, sz), new C.Cartesian3()); const h = C.Cartographic.fromCartesian(C.Cartesian3.add(o.center, cc, new C.Cartesian3())).height; if (h < lo) lo = h; }
            bases.push({ min: lo, lng: C.Math.toDegrees(cg.longitude), lat: C.Math.toDegrees(cg.latitude) }); }
        } catch (e) { bad.push(String(e)); } } }
      const ground = [];
      const pts = [[139.7671, 35.676], [139.7454, 35.6586], [139.7005, 35.6896], [139.7967, 35.7101]].map(([lng, lat]) => C.Cartographic.fromDegrees(lng, lat));
      let sampled = null; try { sampled = await C.sampleTerrainMostDetailed(sc.terrainProvider, pts.map((c) => C.Cartographic.clone(c))); } catch (e) { sampled = null; }
      pts.forEach((c, i) => ground.push({ lng: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude), terrain: sampled && Number.isFinite(sampled[i].height) ? sampled[i].height : null }));
      /* roof heights sampled from the 3D tiles themselves at the same points */
      const roofs = [];
      for (const [lng, lat] of [[139.7671, 35.676], [139.7454, 35.6586]]) { try { const h = sc.sampleHeight(C.Cartographic.fromDegrees(lng, lat)); roofs.push({ lng, lat, sampled: Number.isFinite(h) ? h : null }); } catch (e) { roofs.push({ lng, lat, sampled: null, err: String(e) }); } }
      return { baseCount: bases.length, bases: bases.slice(0, 12), ground, roofs, bad, sampleHeightSupported: !!sc.sampleHeightSupported };
    });
  };
  const noTerrain = await probe(false);
  console.log('RQ-HEIGHT-NOTERRAIN ' + JSON.stringify(noTerrain));
  const withTerrain = await probe(true);
  console.log('RQ-HEIGHT-TERRAIN ' + JSON.stringify(withTerrain));
  expect(noTerrain.baseCount + withTerrain.baseCount).toBeGreaterThan(0);
});
