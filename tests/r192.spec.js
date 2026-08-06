/* ============================================================================
 *  R192 — the parts only a real renderer, a real network and a real model can answer.
 *   ① the lifted aircraft mark is the glyph's own size at every zoom
 *   ② the far field never paints the sea, and the mask that says so is bundled
 *   ③ 震度 is the JMA definition, and the field no longer reaches three continents
 *   ④ the tsunami model propagates over real bathymetry with a physical source
 *   ⑤ the satellite tile pipeline runs in a worker
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapCanDraw && window.IntMapCanDraw(), null, { timeout: 60000 });
}

/* ── ① the mark is the same number of pixels in both renderings ──────────────────────────────── */
test('R192 aircraft: the lifted mark draws the glyph’s own half-length at every zoom', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) { const row = cb.closest('label') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach(t => row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 }))); }
    window.IntMapGeoEngine.camera.jumpTo({ center: [8.57, 50.05], zoom: 10.5, pitch: 0, bearing: 0 });
  });
  /* the sizes are computed when the layer refreshes, which needs aircraft — but the FEED is not what
     this test is about, so it accepts a synthetic set too and only skips when nothing was drawn */
  await page.waitForFunction(() => { try { return window.IntMapPlanes3D.state().aircraft > 0; } catch (_) { return false; } },
    null, { timeout: 90000 }).catch(() => { });
  const r = await page.evaluate(async () => {
    const out = [];
    for (const z of [2, 5, 9, 13, 17]) {
      window.IntMapGeoEngine.camera.jumpTo({ center: [8.57, 50.05], zoom: z, pitch: 0, bearing: 0 });
      await new Promise(s => setTimeout(s, 900));
      const st = window.IntMapPlanes3D.state();
      out.push({ z, halfPx: st.halfPx, glyphHalfPx: st.glyphHalfPx, thickPx: st.thickPx, aircraft: st.aircraft });
    }
    return out;
  });
  test.skip(!r.some(x => x.aircraft > 0), 'no aircraft were drawn here — the feed, not the mark');
  for (const row of r.filter(x => x.halfPx != null)) {
    /* THE contract of four rounds of 「同じデザインに」: the two renderings are the same size */
    expect(Math.abs(row.halfPx - row.glyphHalfPx), 'z' + row.z + ': lifted vs glyph half-length').toBeLessThan(0.05);
    /* …and the extrusion is sub-pixel thick, so a tilted camera sees a mark and not a block */
    expect(row.thickPx, 'z' + row.z + ': the body has no visible wall').toBeLessThan(1);
  }
  /* the glyph's own ramp really does vary — a test that only saw one zoom would pass on a constant */
  const lo = r.find(x => x.z === 2), hi = r.find(x => x.z === 13);
  if (lo && hi && lo.glyphHalfPx && hi.glyphHalfPx) expect(hi.glyphHalfPx).toBeGreaterThan(lo.glyphHalfPx * 1.5);
});

/* ── ② + ③ the intensity field ───────────────────────────────────────────────────────────────── */
test('R192 seismic: the field is bounded by what can be felt, and never covers the sea', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const S = window.IntMapSeismic;
    if (!S || !S.open) return { has: false };
    /* 2011 Tōhoku — the event every number below is checked against */
    S.open({ lng: 142.37, lat: 38.30, depth: 24, mw: 9.0 });
    await new Promise(res => setTimeout(res, 600));
    S.setScale('jma');
    await new Promise(res => setTimeout(res, 1200));
    await S.rebuildField();
    await new Promise(res => setTimeout(res, 2000));
    const st = S.state();
    const at = (lo, la) => { const a = S.at(lo, la); return a ? { km: Math.round(a.km), jma: +a.jma.toFixed(2), mmi: +a.mmi.toFixed(2) } : null; };
    return { has: true, field: st.field, far: st.far, mask: (window.IntMapLandMask ? window.IntMapLandMask.state() : null),
      sendai: at(140.87, 38.27), osaka: at(135.50, 34.69), beijing: at(116.40, 39.90), manila: at(121.0, 14.6) };
  });
  test.skip(!r.has, 'the seismic simulator is not installed here');
  /* the mask is bundled, so it is ready without a network round trip */
  expect(r.mask && r.mask.ready, 'the land mask decoded').toBe(true);
  expect(r.field, 'the fine field was built').toBeTruthy();
  /* THE REPORTED BUG: the far field only ever paints land, and it is not drawn at all without a mask */
  if (r.far) {
    expect(r.far.landMask, 'the far field had a mask').toBe(true);
    expect(r.far.landSource, 'and it is the bundled one, not a DEM read that can half-arrive').toBe('bundled');
    expect(r.far.sea, 'most of a whole-world annulus around Japan is sea, and none of it is painted').toBeGreaterThan(r.far.painted);
  }
  /* 「現在の分布は過大評価すぎに思える」 — an M9's 震度1 used to run 7,100 km, i.e. across Asia. The
     JMA scale is computed from ITS OWN definition now, and its lowest class ends where 震度1 was
     actually reported for this earthquake (Japan, ~1,400-1,900 km), not in Beijing or Manila. */
  expect(r.field.rEdgeKm, 'an M9 still carries 震度1 well past the fine field').toBeGreaterThan(1000);
  expect(r.field.rEdgeKm, 'but nowhere near three continents').toBeLessThan(3200);
  expect(r.sendai.jma, 'Sendai is the strongest of the four').toBeGreaterThan(r.osaka.jma);
  expect(r.osaka.jma, 'and the far cities fall away').toBeGreaterThan(r.beijing.jma);
  expect(r.beijing.jma, 'Beijing is below 震度1 — the reported over-estimate').toBeLessThan(0.5);
  expect(r.manila.jma, 'and Manila is not felt at all').toBeLessThan(0.5);
});

/* ── ④ the tsunami ───────────────────────────────────────────────────────────────────────────── */
test('R192 tsunami: the wave crosses a real ocean, from a physical sea-floor displacement', async ({ page }) => {
  test.setTimeout(300000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const T = window.IntMapTsunami;
    if (!T || !T.open) return { has: false };
    /* 2011 Tōhoku again, six hours of it */
    T.open({ lng: 142.37, lat: 38.30, mw: 9.1, depth: 24, hours: 6, run: true });
    for (let i = 0; i < 500; i++) { const s = T.state(); if (!s.busy && (s.sim || s.err)) break; await new Promise(res => setTimeout(res, 500)); }
    const st = T.state();
    return { has: true, err: st.err, sim: st.sim,
      dart: T.at(148.69, 38.71),           /* DART 21418 — observed peak ~1.8 m */
      guam: T.at(144.75, 13.47),           /* observed first arrival ~3-4 h */
      /* (#R193) the field is no longer a raster layer over an image source but the engine's
         dynamic-image primitive — same question, current name */
      layer: window.IntMapGeoEngine.layers.hasDynamicImage('tsu-field') };
  });
  test.skip(!r.has, 'the tsunami model is not installed here');
  expect(r.err, 'the model ran').toBeFalsy();
  expect(r.sim, 'and produced a simulation').toBeTruthy();
  /* the source: a shallow thrust lifts the sea floor by a few metres and drops less behind it */
  expect(r.sim.upliftM, 'sea-floor uplift is metres, not centimetres').toBeGreaterThan(1);
  expect(r.sim.upliftM, 'and not tens of metres').toBeLessThan(20);
  expect(Math.abs(r.sim.subsidenceM), 'with a smaller subsidence lobe behind it').toBeLessThan(r.sim.upliftM * 1.2);
  /* the grid: real bathymetry, a CFL-bounded step, and enough frames to be an animation */
  expect(r.sim.frames, 'it is animated').toBeGreaterThan(30);
  expect(r.sim.dt, 'the time step is bounded by the wave speed, not chosen').toBeLessThan(120);
  expect(r.layer, 'and it is painted').toBe(true);
  /* the propagation: amplitude offshore and an arrival time that is travel, not a guess */
  if (r.dart) expect(r.dart.maxM, 'a metre-scale wave at the DART line').toBeGreaterThan(0.3);
  if (r.guam && r.guam.arrivalS != null) {
    expect(r.guam.arrivalS, 'Guam is hours away, not minutes').toBeGreaterThan(2 * 3600);
    expect(r.guam.arrivalS, 'and not half a day').toBeLessThan(6 * 3600);
  }
});

/* ── ⑤ the satellite pipeline ────────────────────────────────────────────────────────────────── */
test('R192 imagery: the tile pipeline runs in a worker, and still returns the stitched tile', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.waitForFunction(() => !!window.IntMapSatProto, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const P = window.IntMapSatProto;
    const out = { worker: P.worker(), hi: P.hiDPI(), dpr: P.dpr() };
    /* Tokyo — Esri has real imagery well past z13 there, so the 2x stitch has something to build */
    try { out.tile = await P.tile2x(12, 1612, 3637); } catch (e) { out.tile = { err: String(e) }; }
    /* and the depth memo is still answerable synchronously after a resolve (#R179's contract) */
    try { out.mode = (await P.resolve(12, 1612, 3637)).mode; } catch (_) { }
    out.depth = P.depth(12, 3637, 1612);
    return out;
  });
  /* a browser without workers keeps the old path — the test asserts the CAPABILITY, not the tier.
     ⚠ and the 2x tile is gated on the HiDPI DECISION, not on the worker: a 1x display must not build
     the stitch at all (tests/r178 ①), so asking for it there is expected to answer "no". */
  if (r.worker && r.hi) {
    expect(r.tile.ok, 'the worker produced a tile').toBe(true);
    expect(r.tile.via, 'through the worker').toBe('worker');
    expect(r.tile.w, 'at double density').toBe(512);
  } else if (r.worker) {
    expect(r.tile.ok, 'a 1x display builds no stitched tile, worker or not').toBeFalsy();
  }
  expect(['native', 'cropped', 'raw', 'cache']).toContain(r.mode);
  expect(r.depth, 'and the depth memo is mirrored back to the main thread').toBeTruthy();
});
