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

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* ── ① 「視点の位置を変えるなと言っているのに、変わる」 ─────────────────────────────────────────
   The fourth report of this. Measured on the failing build with a real ctrl-drag: 22,218 km of
   viewpoint drift at z3 and 58,506 m at z6 over Tromsø, with single-frame jumps of 23,152 km when
   the old |lat|>89.5 guard declined a frame and the proposal was applied verbatim. Every previous
   round measured at z12 — where the tangent plane it used is nearly true — and read 0.
   The viewpoint is measured HERE in the renderer's own Mercator coordinates, which is the only
   yardstick that does not share the bug. */
for (const c of [{ z: 3, lng: 139.767, lat: 35.681, tag: 'z3 Tokyo' },
                 { z: 6, lng: 15.0, lat: 69.65, tag: 'z6 Tromsø' },
                 { z: 12, lng: 139.767, lat: 35.681, tag: 'z12 Tokyo' }]) {
  test(`unlimited tilt holds the viewpoint still at ${c.tag}`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    const r = await page.evaluate(async (cc) => {
      const m = window.__imap, el = m.getCanvasContainer();
      const frame = () => new Promise(res => requestAnimationFrame(() => res()));
      const b = el.getBoundingClientRect();
      const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
      const fire = (t, type, x, y, buttons) => t.dispatchEvent(new MouseEvent(type,
        { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, ctrlKey: true, view: window }));
      const D = Math.PI / 180, C = 2 * Math.PI * 6371008.8;
      const mX = lng => (180 + lng) / 360;
      const mY = lat => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * D / 2))) / 360;
      // the camera's position in the world the renderer draws — merc units, no metres-per-degree
      const eye = () => { const t = m.transform, ws = (t.tileSize || 512) * Math.pow(2, m.getZoom());
        const d = (t.cameraToCenterDistance || 1080) / ws, ctr = m.getCenter();
        const p = m.getPitch() * D, br = m.getBearing() * D, e0 = (+m.getCameraTargetElevation() || 0);
        return { x: mX(ctr.lng) - d * Math.sin(p) * Math.sin(br), y: mY(ctr.lat) + d * Math.sin(p) * Math.cos(br),
                 z: e0 / (C * Math.cos(ctr.lat * D)) + d * Math.cos(p) }; };
      window.IntMapTilt.set(false);
      m.jumpTo({ center: [cc.lng, cc.lat], zoom: cc.z, pitch: 0, bearing: 0 });
      await frame(); await frame();
      window.IntMapTilt.set(true);
      m.jumpTo({ center: [cc.lng, cc.lat], zoom: cc.z, pitch: 0, bearing: 0 });
      await frame(); await frame();
      const E0 = eye(), S = C * Math.cos(cc.lat * D);
      fire(el, 'mousedown', cx, cy, 1); await frame();
      let y = cy, prev = E0, drift = 0, jump = 0;
      for (let i = 0; i < 18; i++) {
        y -= 6; fire(document, 'mousemove', cx, y, 1); await frame(); await frame();
        const E = eye();
        drift = Math.max(drift, Math.hypot(E.x - E0.x, E.y - E0.y, E.z - E0.z) * S);
        jump = Math.max(jump, Math.hypot(E.x - prev.x, E.y - prev.y, E.z - prev.z) * S);
        prev = E;
      }
      fire(document, 'mouseup', cx, y, 0); await frame();
      return { drift, jump, endPitch: m.getPitch() };
    }, c);
    expect(r.endPitch, 'the drag really tilted the map').toBeGreaterThan(30);
    expect(r.drift, 'the viewpoint must not move').toBeLessThan(1);
    expect(r.jump, 'and it must not jump between frames').toBeLessThan(1);
  });
}

test('a zoom is still a dolly at every tilt (#R175 must survive #R176)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const rows = await page.evaluate(async () => {
    const m = window.__imap, el = m.getCanvasContainer();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const alt = () => { const t = m.transform, R = 6371008.8;
      const ws = (t.tileSize || 512) * Math.pow(2, m.getZoom());
      const mpp = (2 * Math.PI * R * Math.cos(m.getCenter().lat * Math.PI / 180)) / ws;
      return (t.cameraToCenterDistance || 1080) * mpp * Math.cos(m.getPitch() * Math.PI / 180) + (+m.getCameraTargetElevation() || 0); };
    const out = [];
    for (const pitch of [0, 85, 110, 150]) {
      window.IntMapTilt.set(false);
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      window.IntMapTilt.set(true);
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      m.setPitch(pitch); await wait(250);
      const z0 = m.getZoom(), a0 = alt();
      for (let i = 0; i < 4; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await wait(320);
      }
      out.push({ pitch, ratio: alt() / a0, expect: Math.pow(2, z0 - m.getZoom()) });
    }
    return out;
  });
  for (const r of rows) {
    expect(r.expect, `zoom really changed at pitch ${r.pitch}`).toBeLessThan(0.9);
    // the eye descends by exactly the zoom ratio — the same meaning tilted or not
    expect(Math.abs(r.ratio - r.expect), `pitch ${r.pitch}: eye ratio ${r.ratio} vs zoom ratio ${r.expect}`).toBeLessThan(0.03);
  }
});

/* ── ② Line of sight ───────────────────────────────────────────────────────────────────────── */
test('the viewshed resolves per raster cell, and re-runs at the same site', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
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
