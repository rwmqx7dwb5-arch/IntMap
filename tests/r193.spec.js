/* ============================================================================
 *  R193 — the parts only a real renderer, a real network and a real model can answer.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, { timeout: 90000 });
  await page.waitForTimeout(2500);
};

test('R193 tsunami: the solve is off the page, streams, and animates without an encoder', async ({ page }) => {
  test.setTimeout(300000);
  await ready(page);
  await page.waitForFunction(() => !!window.IntMapTsunami, null, { timeout: 30000 });
  expect(await page.evaluate(() => !!(window.IntMapTsunamiWorker && window.IntMapTsunamiWorker.available()))).toBe(true);

  /* ① the run reaches a playable state and finishes, and the first frames arrive BEFORE it does */
  const r = await page.evaluate(async () => {
    const t0 = performance.now();
    let firstPlayable = null;
    window.IntMapTsunami.open({ lng: 142.37, lat: 38.32, mw: 9.1, depth: 24, hours: 3 });
    const end = performance.now() + 280000;
    while (performance.now() < end) {
      const s = window.IntMapTsunami.state();
      if (firstPlayable == null && s.sim && s.sim.frames > 0) firstPlayable = Math.round(performance.now() - t0);
      if (s.sim && !s.busy) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    const s = window.IntMapTsunami.state();
    return { firstPlayable, wall: Math.round(performance.now() - t0), s };
  });
  expect(r.s.sim).toBeTruthy();
  expect(r.s.busy).toBe(false);
  /* streaming: something was playable strictly before the run finished */
  expect(r.firstPlayable).toBeLessThan(r.wall);
  expect(r.s.sim.frames).toBeGreaterThan(20);

  /* ② the physics still agrees with the record — a real ocean, not a disc */
  const phys = await page.evaluate(() => ({
    dart: window.IntMapTsunami.at(148.69, 38.71),      /* DART 21418, east of the source */
    /* a point ~1,900 km down the Japan→Guam line, which a long wave DOES reach inside three hours */
    mid: window.IntMapTsunami.at(144.04, 20.92),
    /* …and Guam itself, which it does NOT: the modelled first arrival there is 3 h 10 m, so in a
       three-hour run "no wave yet" is the physically correct answer and the one to assert. */
    guam: window.IntMapTsunami.at(144.75, 13.47),
    sim: window.IntMapTsunami.state().sim,
  }));
  /* the sea floor moved up by metres and down by metres — the classic thrust dipole */
  expect(phys.sim.upliftM).toBeGreaterThan(2);
  expect(phys.sim.subsidenceM).toBeLessThan(-0.5);
  /* the buoy nearest the source sees a wave of the order actually recorded (~1.8 m) */
  expect(phys.dart.maxM).toBeGreaterThan(0.5);
  expect(phys.dart.maxM).toBeLessThan(8);
  /* the wave TRAVELLED to the mid-ocean point: not instantly, and inside the run */
  expect(phys.mid).toBeTruthy();
  expect(phys.mid.arrivalS).toBeGreaterThan(1200);
  expect(phys.mid.arrivalS).toBeLessThan(3 * 3600);
  /* and it has not reached Guam in three hours, because Guam is more than three hours away */
  expect(phys.guam.arrivalS === null || phys.guam.arrivalS > 2.5 * 3600).toBe(true);
  /* The model resolved a real sea floor rather than falling back to a constant depth.
     ⚠ (#R197) `noData` IS GONE, AND ITS ABSENCE IS THE STRONGER STATEMENT. It counted the cells whose
     DEM tile had not arrived — #R192 measured 19 % of an ocean-wide box running on a constant. There
     are no tiles now: the sea floor is data/bathymetry.png, bundled, complete, and read before the
     first time step, so there is no quantity left to be non-zero. What is asserted instead is the
     domain that replaced the box — global, one fixed resolution, both hemispheres. */
  expect(phys.sim.noData, 'there is no missing-data counter left to report').toBeUndefined();
  expect(phys.sim.global).toBe(true);
  expect(phys.sim.nx).toBe(1440);
  expect(phys.sim.ny).toBe(640);
  expect(phys.sim.seaCells).toBeGreaterThan(500000);   /* the whole ocean, not a box of it */

  /* ③ the picture is a texture the renderer owns, and refreshing it is cheap */
  const paint = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const has = E.layers.hasDynamicImage('tsu-field');
    const t = performance.now();
    for (let i = 0; i < 15; i++) window.IntMapTsunami.setTime(i * 400);
    return { has, msPerTouch: (performance.now() - t) / 15 };
  });
  expect(paint.has).toBe(true);
  /* #R192 encoded a PNG data URL per frame. Whatever this costs, it must be a small fraction of a
     frame — the threshold is generous because CI runs on a software renderer. */
  expect(paint.msPerTouch).toBeLessThan(25);

  /* ④ playback advances in simulated seconds at the rate it was asked for */
  const play = await page.evaluate(async () => {
    window.IntMapTsunami.setTime(0);
    window.IntMapTsunami.setSpeed(300);
    window.IntMapTsunami.play();
    const t = performance.now();
    await new Promise((r) => setTimeout(r, 4000));
    window.IntMapTsunami.pause();
    return { tSim: window.IntMapTsunami.state().tSim, real: (performance.now() - t) / 1000 };
  });
  /* at ×300 over ~4 s that is ~1,200 simulated seconds; allow wide slack for a busy CI machine, but
     it must be far more than #R192 managed (2 of 74 frames in eight seconds) */
  expect(play.tSim).toBeGreaterThan(200);

  await page.evaluate(() => window.IntMapTsunami.close());
  expect(await page.evaluate(() => window.IntMapGeoEngine.layers.hasDynamicImage('tsu-field'))).toBe(false);
});

test('R193 imagery: a second tile in a placeholder area costs one request, not nine', async ({ page }) => {
  test.setTimeout(180000);
  await ready(page);
  await page.waitForFunction(() => !!window.IntMapSatProto, null, { timeout: 30000 });

  const count = (pat) => {
    let n = 0;
    const h = (req) => { if (pat.test(req.url())) n++; };
    page.on('request', h);
    return { stop: () => { page.off('request', h); return n; } };
  };

  /* deep open ocean at z16: Esri's imagery ends far above, so every one of these is a placeholder
     that has to be answered from an ancestor */
  const c1 = count(/World_Imagery/);
  const first = await page.evaluate(() => window.IntMapSatProto.resolve(16, 27000, 58000));
  const n1 = c1.stop();
  expect(first.mode).toBe('cropped');           /* real imagery, cropped from the ancestor */
  expect(n1).toBeGreaterThan(2);                /* the FIRST tile is what discovers the depth */

  const memo = await page.evaluate(() => window.IntMapSatProto.depth(16, 58000, 27000));
  expect(memo).toBeTruthy();
  expect(memo.stop).toBeGreaterThan(0);
  expect(memo.stop).toBeLessThan(16);

  const c2 = count(/World_Imagery/);
  const second = await page.evaluate(() => window.IntMapSatProto.resolve(16, 27001, 58000));
  const n2 = c2.stop();
  expect(second.mode).toBe('cropped');          /* the SAME answer… */
  expect(n2).toBeLessThanOrEqual(2);            /* …for one request instead of the whole climb */

  /* and a city tile is still native, untouched by any of this */
  const tokyo = await page.evaluate(() => window.IntMapSatProto.resolve(16, 25800, 58211));
  expect(['native', 'cache']).toContain(tokyo.mode);
});

test('R193 startup: the heavy optional payloads are off the boot path', async ({ page }) => {
  test.setTimeout(180000);
  const seen = [];
  page.on('response', (r) => { try { seen.push({ url: r.url(), t: Date.now() }); } catch (_) { } });
  const t0 = Date.now();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, { timeout: 90000 });
  const readyMs = Date.now() - t0;

  const before = (re) => seen.filter((s) => re.test(s.url) && s.t - t0 <= readyMs);
  /* the 2.2 MB full-resolution Köppen raster must not be on the path to a drawable map… */
  expect(before(/koppen_mercator_[0-9-]+\.png$/).length).toBe(0);
  /* …and neither must the two lazy vendor chunks or the preview thumbnails */
  expect(before(/katex-|html2canvas/).length).toBe(0);
  expect(before(/preview_(contours|wind|plates|ecoregions|nightlights|basemap)\.png/).length).toBe(0);

  /* …and when the Köppen layer IS switched on, the picture that paints is the small one.
     ⚠ The suite seeds `{"layers":[]}` (playwright.config.js), so the default-on layers are off here —
     asserting on boot traffic alone would pass against a page that simply never drew Köppen. */
  await page.waitForTimeout(3000);
  const enabled = await page.evaluate(() => {
    const c = document.getElementById('dl-climate');
    if (!c) return false;
    if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  });
  expect(enabled).toBe(true);
  await page.waitForFunction(() => {
    try { return window.IntMapGeoEngine.layers.hasSource('src-climate'); } catch (_) { return false; }
  }, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const small = seen.filter((s) => /koppen_mercator_[0-9-]+_4k\.png$/.test(s.url));
  const full = seen.filter((s) => /koppen_mercator_[0-9-]+\.png$/.test(s.url));
  expect(small.length).toBeGreaterThan(0);
  /* the small one is fetched FIRST — the full-resolution file may follow at idle, never before */
  if (full.length) expect(small[0].t).toBeLessThanOrEqual(full[0].t);
});
