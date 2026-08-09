// R176 behavioural checks in a real browser, against the BUILT site (playwright.config.js builds
// first and serves dist/). Every number quoted below was produced by running the failing version
// first — these are regressions, not aspirations.
//
//   1. with the tilt ceiling lifted, the viewpoint does not move — at ANY zoom, not just z12
//   2. Line of sight resolves per raster cell, at the DEM's own zoom, and re-runs cleanly
//   3. the drone launcher exists nowhere, and the planner still opens
//   4. sculpting the ground and dropping water conserves mass and overtops by exactly the excess
//   5. seismic arrivals reproduce the 2011 Tohoku record and published IASP91 travel times
//   6. terrain shade and the annual sunlight budget answer with real terrain
import { test, expect } from '@playwright/test';
import { installCameraRuler } from './helpers/camera-ruler.js';
import { loadLazyModules } from './helpers/app.js';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* ⚠ (#R197) THE VIEWPOINT SWEEP THAT WAS HERE IS GONE — 「何重にもテストとか意味がない」.
   r176 swept 3 cases for viewpoint hold, plus the dolly guard r179 also carries.
   Five files swept the same invariant — "tilting does not move the viewpoint" — because it was
   re-reported five rounds running, and each round added its own sweep instead of extending the one
   before it. tests/r179.spec.js now carries all of them: it drives a REAL POINTER DRAG rather than
   the API (and #R179 is the round that found the API path was never the broken one), it covers both
   projections from z1.7 to z18 plus the 69°N case that used to live in tests/r177, and it asserts
   drift, inter-frame stepping, inertia, tilt saturation and the 90° crossing in one place.
   The copies were DELETED, not skipped: a disabled test is a slower test that proves nothing. */


/* ── ② Line of sight ───────────────────────────────────────────────────────────────────────── */
test('the viewshed resolves per raster cell, and re-runs at the same site', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  /* (#R209) THREE OF THIS FILE'S SUBJECTS LEFT THE BOOT BUNDLE — js/viewshed.js (IntMapLOS, here),
     js/terrain-water.js (IntMapTerrainWater, ④/⑤) and js/seismic.js (IntMapSeismic, ⑥, which brings
     js/tsunami.js with it). They are fetched the first time a door reaches for the feature, so after
     the barrier above the globals genuinely do not exist yet. Every one of the app's own doors awaits
     `IntMapLazy.need(…)` first, and these tests drive those same features, so they make the same
     call. ⚠ The boot barrier is left alone deliberately: it names an EAGER global, which is what a
     boot barrier is for, and re-listing a deferred one there would only ever hang. */
  await loadLazyModules(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap;
    m.jumpTo({ center: [138.7274, 35.3606], zoom: 12 });           // Mt Fuji's summit
    await new Promise(res => setTimeout(res, 800));
    window.IntMapLOS.open({ lng: 138.7274, lat: 35.3606 });
    const a = await window.IntMapLOS.analyze({ obsH: 30, tgtH: 0, rangeKm: 6, k: 1.3333, mhz: 0 });
    const b = await window.IntMapLOS.analyze({ obsH: 30, tgtH: 100, rangeKm: 6, k: 1.3333, mhz: 0 });
    return { a, b, layer: !!m.getLayer('los-img'), src: !!m.getSource('los-img-src'), site: !!m.getLayer('los-site') };
  });
  expect(r.layer && r.src && r.site, 'the raster and the site marker are on the map').toBe(true);
  // the summit reads its real height, so the DEM was genuinely sampled
  expect(r.a.groundM).toBeGreaterThan(3600);
  expect(r.a.groundM).toBeLessThan(3800);
  // a 6 km run reaches terrarium's native z15 — metre-scale cells, not a 900-gon
  expect(r.a.demZ).toBeGreaterThanOrEqual(14);
  expect(r.a.cellM).toBeLessThan(20);
  expect(r.a.demMissing, 'the tile budget must fit the DEM cache, so nothing is evicted mid-sweep').toBe(0);
  // raising the TARGET can only reveal more ground, never less
  expect(r.b.areaKm2).toBeGreaterThanOrEqual(r.a.areaKm2);
  // and the earth horizon is quoted from the summit's real altitude, not a 30 m mast
  expect(r.a.horizonKm).toBeGreaterThan(150);
});

/* ── ③ 「DronesはMeasureに置くな。どこにも置くな。」 ──────────────────────────────────────────── */
test('there is no drone button anywhere, and the planner still opens', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => !!document.getElementById('btn-tool-drone'))).toBe(false);
  expect(await page.evaluate(() => document.querySelectorAll('[data-proxy="btn-tool-drone"]').length)).toBe(0);
  const r = await page.evaluate(async () => {
    const ok = await window.IntMapConsole.dispatch({ type: 'tool', name: 'drone' });
    return { ok: !!(ok && ok.ok), open: window.IntMapDrone.state().open };
  });
  expect(r.open, 'Atlas still opens the planner directly').toBe(true);
});

/* ── ④ terrain sculpting + water ───────────────────────────────────────────────────────────── */
test('a dug basin holds exactly what it can, and spills exactly the rest', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  await loadLazyModules(page);   // (#R209) js/terrain-water.js is fetched on demand — see ② above
  const r = await page.evaluate(async () => {
    const TW = window.IntMapTerrainWater, m = window.__imap;
    m.jumpTo({ center: [139.85, 35.90], zoom: 11.5 });               // flat Kanto plain
    await new Promise(res => setTimeout(res, 1200));
    await TW.open({ refit: true });
    await new Promise(res => setTimeout(res, 400));
    TW.brush(139.85, 35.90, 'lower', { radiusM: 500, heightM: 25 });
    const dug = TW.probe(139.85, 35.90);
    TW.addSource(139.85, 35.90, 3e6);                                // under capacity
    const part = TW.probe(139.85, 35.90);
    TW.addSource(139.85, 35.90, 3e7);                                // over capacity
    const full = TW.probe(139.85, 35.90);
    return { grid: TW.state().grid, dug, part, full, solveMs: TW.state().result.solveMs,
             layer: !!m.getLayer('tw-water') };
  });
  expect(r.layer, 'the water raster is drawn').toBe(true);
  expect(r.grid.cellM, 'the grid is metres, from the real DEM').toBeLessThan(200);
  expect(r.solveMs, 'and the whole solve is real-time').toBeLessThan(400);
  // the brush really cut a closed basin out of flat ground
  expect(r.dug.basin, 'the sculpted pit is a depression').not.toBeNull();
  expect(r.dug.basin.capacityM3).toBeGreaterThan(1e6);
  // under capacity: nothing spills, and the water level sits below the rim
  expect(r.part.basin.full).toBe(false);
  expect(r.part.basin.overflowM3).toBe(0);
  expect(r.part.basin.levelM).toBeLessThan(r.part.basin.spillM);
  expect(r.part.depthM, 'and it is genuinely deep').toBeGreaterThan(5);
  // over capacity: the level is the rim and the overflow is EXACTLY the excess (this is the bug that
  // reported zero inflow for twenty million cubic metres)
  expect(r.full.basin.full).toBe(true);
  expect(Math.abs(r.full.basin.levelM - r.full.basin.spillM)).toBeLessThan(0.01);
  const excess = r.full.basin.inflowM3 - r.full.basin.capacityM3;
  expect(Math.abs(r.full.basin.overflowM3 - excess) / excess, 'mass balance').toBeLessThan(0.001);
});

test('a levee drawn on flat ground creates a basin that holds water', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  await loadLazyModules(page);   // (#R209) js/terrain-water.js is fetched on demand — see ② above
  const r = await page.evaluate(async () => {
    const TW = window.IntMapTerrainWater, m = window.__imap;
    m.jumpTo({ center: [139.85, 35.90], zoom: 11.5 });
    await new Promise(res => setTimeout(res, 1200));
    await TW.open({ refit: true });
    await new Promise(res => setTimeout(res, 400));
    const before = TW.probe(139.85, 35.90);
    const d = 0.008;
    TW.addLevee([[139.85 - d, 35.90 - d], [139.85 + d, 35.90 - d], [139.85 + d, 35.90 + d],
                 [139.85 - d, 35.90 + d], [139.85 - d, 35.90 - d]], 10, 80);
    const after = TW.probe(139.85, 35.90);
    TW.clearWater(); TW.addSource(139.85, 35.90, 4e6);
    const wet = TW.probe(139.85, 35.90);
    return { before, after, wet, leveeLayer: !!m.getLayer('tw-levee-line') };
  });
  expect(r.leveeLayer).toBe(true);
  expect(r.before.basin, 'flat ground has no basin').toBeNull();
  expect(r.after.basin, 'drawing the line made one').not.toBeNull();
  // the rim is the ground plus the crest the user asked for
  expect(r.after.basin.spillM - r.after.groundM).toBeGreaterThan(4);
  expect(r.wet.depthM, 'and it holds water').toBeGreaterThan(1);
});

/* ── ⑤ seismic ─────────────────────────────────────────────────────────────────────────────── */
test('P and S arrivals reproduce the 2011 Tohoku record and published IASP91 times', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await loadLazyModules(page);   // (#R209) js/seismic.js (and js/tsunami.js with it) arrives on demand — see ② above
  const r = await page.evaluate(() => {
    const S = window.IntMapSeismic;
    S.setSite('rock');
    S.open({ lng: 142.37, lat: 38.30, depth: 29, mw: 9.1 });         // the real 2011-03-11 source
    const tokyo = S.at(139.767, 35.681);                             // 372 km away
    const teleP = { 30: S.arrival('P', 0, 30), 60: S.arrival('P', 0, 60), 90: S.arrival('P', 0, 90) };
    const teleS = { 30: S.arrival('S', 0, 30), 60: S.arrival('S', 0, 60) };
    const far = S.at(-118.24, 34.05);                                // Los Angeles, 8,457 km
    S.close();
    return { tokyo, teleP, teleS, far, rings: S.state().mmiRings };
  });
  // published IASP91 first-arrival times for a surface source, within a few seconds
  expect(Math.abs(r.teleP[30] - 373)).toBeLessThan(8);
  expect(Math.abs(r.teleP[60] - 607)).toBeLessThan(10);
  expect(Math.abs(r.teleP[90] - 783)).toBeLessThan(12);
  expect(Math.abs(r.teleS[30] - 680)).toBeLessThan(20);
  expect(Math.abs(r.teleS[60] - 1105)).toBeLessThan(25);
  // Tokyo felt P about a minute after origin and the strong shaking about ninety seconds in
  expect(r.tokyo.km).toBeGreaterThan(340);
  expect(r.tokyo.km).toBeLessThan(400);
  expect(r.tokyo.tP).toBeGreaterThan(35); expect(r.tokyo.tP).toBeLessThan(75);
  expect(r.tokyo.tS).toBeGreaterThan(70); expect(r.tokyo.tS).toBeLessThan(130);
  expect(r.tokyo.durS, 'and it shook for minutes, not seconds').toBeGreaterThan(60);
  expect(r.tokyo.mmi).toBeGreaterThan(6);   // observed about JMA 5+, i.e. roughly MMI VII
  expect(r.tokyo.mmi).toBeLessThan(9);
  // the ground-motion model is regional: it must decline to give Los Angeles an intensity
  expect(r.far.calibrated, 'no MMI is claimed 8,000 km away').toBe(false);
  // and the intensity contours stay inside the model's stated range
  expect(r.rings.length).toBeGreaterThan(1);
  for (const g of r.rings) expect(g.km).toBeLessThanOrEqual(1000);
});

/* ── ⑥ terrain shade and the year ──────────────────────────────────────────────────────────── */
test('terrain shade follows the sun, and a valley’s year is read off its own horizon', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const I = window.IntMapInsolation, m = window.__imap;
    m.jumpTo({ center: [138.73, 35.40], zoom: 12 });                 // Mt Fuji
    await new Promise(res => setTimeout(res, 1000));
    // UTC instants, not local ones: the browser under test does not run in JST, and 12:00 local
    // there is the middle of the Japanese night (measured: the sun 19° BELOW the horizon).
    const morning = await I.shade(new Date(Date.UTC(2026, 0, 14, 23, 0, 0)), { refit: true }); // 08:00 JST
    const noon = await I.shade(new Date(Date.UTC(2026, 5, 21, 3, 0, 0)), { refit: true });     // 12:00 JST
    const valley = await I.analyse(137.66, 36.57, { radiusKm: 25 }); // deep Northern-Alps valley
    return { morning, noon, valley, layer: !!m.getLayer('insol-shade') };
  });
  expect(r.layer, 'the shade raster is on the map').toBe(true);
  // a 10° winter sun over a 3,776 m cone shades a large part of the view; a 78° summer sun shades none
  expect(r.morning.altDeg).toBeLessThan(20);
  expect(r.morning.shadedFrac).toBeGreaterThan(0.1);
  expect(r.noon.altDeg).toBeGreaterThan(60);
  expect(r.noon.shadedFrac).toBeLessThan(r.morning.shadedFrac);
  expect(r.morning.cellM, 'at metre resolution from the real DEM').toBeLessThan(60);
  // the valley loses a large share of its year to the ridges around it
  expect(r.valley.annualOpenHours).toBeGreaterThan(4000);
  expect(r.valley.annualHours).toBeLessThan(r.valley.annualOpenHours * 0.8);
  expect(r.valley.winterSolstice).toBeLessThan(r.valley.summerSolstice);
  expect(r.valley.maxHorizonDeg.deg, 'and it really is hemmed in').toBeGreaterThan(15);
  expect(r.valley.beamKWhM2).toBeGreaterThan(200);
});
