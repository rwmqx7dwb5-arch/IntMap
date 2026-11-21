// (world-3d-buildings-profile) THE WORLDWIDE / NATIONAL BUILDING TILESETS: WHICH OPEN, AND WHETHER THEY MEET THE GROUND.
//
// What is compared per selected tile: the ellipsoidal height of its lowest building base (a Re:Earth tile: the glb's own POSITION
// bounds under its node matrix — the node origin sits at ellipsoid height 0 and local Y is up, checked on a Paris tile: lowest base
// 71.55 m = Seine-level 26.9 m + N 44.7 m; a 3D BAG tile: its box's lowest corner, a bound) plus the applied offset, minus the
// LOWEST ground the DEM has under that tile. With the geoid offset the difference is a few metres; without it, N.
//
// ⚠ THE GROUND HALF IS NOISY: the DEM under a software-rendered headless run is often still at a coarse level (or 0) after 12 s, so the
// per-city gap prints plausible values in Amsterdam and nonsense at Denver or Sydney. The datum itself is verified on the data, not on
// this probe: dev-notes/2026-11-20-world-3d-buildings.md §2 (lowest base in a tile of every city = known sea-level ground + N).
//
// ⚠ AN INSTRUMENT, NOT A GATE (-profile): `IM_PROFILE=1 npx playwright test tests/world-3d-buildings-profile.spec.js`.
// Needs the network (buildings.reearth.land, data.3dbag.nl). Software-rendered runners give CPU time, never FPS.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const CITIES = [
  { id: 'amsterdam', lng: 4.9041, lat: 52.3676, want: ['3dbag'] },
  { id: 'paris', lng: 2.3522, lat: 48.8566, want: ['reearth-buildings'] },
  { id: 'newyork', lng: -73.9857, lat: 40.7484, want: ['reearth-buildings'] },
  { id: 'denver', lng: -104.99, lat: 39.7392, want: ['reearth-buildings'] },
  { id: 'mumbai', lng: 72.8777, lat: 19.076, want: ['reearth-buildings'] },
  { id: 'sydney', lng: 151.2093, lat: -33.8688, want: ['reearth-buildings'] },
];

test('world 3D buildings: opened near the view, grounded by the geoid', async ({ page, request }) => {
  test.setTimeout(900_000);
  let reachable = false;
  try { reachable = (await request.get('https://buildings.reearth.land/tileset.json', { timeout: 20_000 })).ok(); } catch (_) { /* offline */ }
  test.skip(!reachable, 'buildings.reearth.land unreachable — nothing to measure (not faked)');
  await bootEngine(page, 'cesium', { timeout: 120_000 });
  const rows = [];
  for (const c of CITIES) {
    const t0 = Date.now();
    await page.evaluate(async (c) => {
      const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium;
      V._camera.setView({ destination: C.Cartesian3.fromDegrees(c.lng, c.lat - 0.004, 900), orientation: { heading: 0, pitch: C.Math.toRadians(-50), roll: 0 } });
      V._scene.requestRender();
      await window.IntMapBeta.plateauToggle(false);
      await window.IntMapBeta.plateauToggle(true);
    }, c);
    let first = null;
    try {
      await expect.poll(() => page.evaluate(() => { const V = window.IntMapGeoEngine.raw(); let n = 0; for (const [id, r] of V._tilesets) if (id.startsWith('world3d-') && r.ts) n += r.ts.statistics.numberOfTilesWithContentReady; return n; }),
        { timeout: 120_000, intervals: [500, 1000, 2000] }).toBeGreaterThan(2);
      first = Date.now() - t0;
    } catch (_) { /* not observed */ }
    await page.waitForTimeout(12000);
    const measure = () => page.evaluate(async () => {
      const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium, sc = V._scene, ds = [];
      const groundMin = (rect) => { let m = Infinity; for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
        const g = sc.globe.getHeight(new C.Cartographic(rect.west + (rect.east - rect.west) * i / 12, rect.south + (rect.north - rect.south) * j / 12)); if (g != null && isFinite(g)) m = Math.min(m, g); } return m; };
      for (const [id, rec] of V._tilesets) {
        if (!id.startsWith('world3d-') || !rec.ts) continue;
        const tr = C.Matrix4.getTranslation(rec.ts.modelMatrix, new C.Cartesian3());
        for (const t of rec.ts._selectedTiles || []) {
          try {
            const bv = t.boundingVolume, o = bv && bv.boundingVolume; let lo = Infinity, rect = null;
            if (id !== 'world3d-reearth-buildings' && o && o.halfAxes) {   // an oriented box (3D BAG): the tileset's modelMatrix is already applied to it
              rect = null; const pts = [];
              for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
                const cc = C.Matrix3.multiplyByVector(o.halfAxes, new C.Cartesian3(sx, sy, sz), new C.Cartesian3());
                const cg = C.Cartographic.fromCartesian(C.Cartesian3.add(o.center, cc, new C.Cartesian3())); pts.push(cg); lo = Math.min(lo, cg.height); }
              rect = C.Rectangle.fromCartographicArray(pts); if (!isFinite(lo)) continue;
              const gm = groundMin(rect); if (isFinite(gm)) ds.push({ id: id.slice(8), kind: 'box-corner', d: lo - gm });
            } else if (id === 'world3d-reearth-buildings') {   // a Re:Earth region says nothing about bases (and Cesium turns it into a box once the tileset is moved): read the glb's own POSITION bounds + node matrix
              const url = t.content && t.content.url; if (!url || !/\.glb(\?|$)/.test(url)) continue;
              const b = new Uint8Array(await (await fetch(url)).arrayBuffer()), dv = new DataView(b.buffer);
              const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + dv.getUint32(12, true))));
              const m = j.nodes[0].matrix; if (!m) continue;
              const org = new C.Cartesian3(m[12], -m[14], m[13]);          // glTF Y-up -> ECEF Z-up (the loader's own axis rotation)
              const h0 = C.Cartographic.fromCartesian(org).height;
              const ys = j.accessors.filter((q) => q.type === 'VEC3' && q.min && q.max).map((q) => q.min[1]); if (!ys.length) continue;
              const og = C.Cartographic.fromCartesian(org), gm = groundMin({ west: og.longitude - 0.004, east: og.longitude + 0.004, south: og.latitude - 0.004, north: og.latitude + 0.004 }); if (!isFinite(gm)) continue;
              ds.push({ id: id.slice(8), kind: 'glb-base', z: +(url.match(/\/(\d+)\/\d+\/\d+\.glb/) || [])[1], d: h0 + Math.min(...ys) + C.Cartesian3.dot(tr, C.Cartesian3.normalize(org, new C.Cartesian3())) - gm });
            }
          } catch (_) { /* a tile without bounds / unreadable */ }
        }
      }
      const q = (arr, p) => { const a = arr.map((x) => x.d).sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(1) : null; };
      const out = {};
      for (const id of new Set(ds.map((x) => x.id))) { const s = ds.filter((x) => x.id === id); out[id] = { tiles: s.length, kind: s[0].kind, p10: q(s, 0.1), median: q(s, 0.5), p90: q(s, 0.9) }; }
      return out;
    });
    const applied = await measure();
    const info = await page.evaluate(() => { const V = window.IntMapGeoEngine.raw(), C = window.__imCesium.Cesium, out = {};
      for (const [id, r] of V._tilesets) if (id.startsWith('world3d-') && r.ts) { const t = C.Matrix4.getTranslation(r.ts.modelMatrix, new C.Cartesian3()); out[id.slice(8)] = { tiles: r.ts.statistics.numberOfTilesWithContentReady, mb: Math.round(r.ts.totalMemoryUsageInBytes / 1048576), offsetM: +C.Cartesian3.magnitude(t).toFixed(1), err: r.error }; }
      return out; });
    // the same view with NO correction, for contrast
    await page.evaluate(() => { const V = window.IntMapGeoEngine.raw(); for (const [id, r] of V._tilesets) if (id.startsWith('world3d-')) V._placeTileset(r, { heightOffset: 0, anchor: { lng: 0, lat: 0 } }); });
    await page.waitForTimeout(2000);
    const none = await measure();
    const row = { city: c.id, firstContentMs: first, open: Object.keys(info), info, applied, uncorrected: none };
    rows.push(row);
    console.log('W3D-CITY ' + JSON.stringify(row));
  }
  for (const r of rows) {
    const want = CITIES.find((c) => c.id === r.city).want;
    for (const w of want) expect(r.open, r.city + ' opens ' + w).toContain(w);
  }
});
