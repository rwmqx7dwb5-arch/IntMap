// R172 behavioural checks in a real browser.
//
// This round exists because #R171's tests could not see the defect they shipped. They measured the
// CURVATURE of the projection the flight simulator asked for — and it really was curved — while the
// cockpit rendered a white void with no world in it. So the tests here measure what a person sees:
//
//   1. flying: the cockpit must contain GROUND, judged from the pixels, not from a projection name;
//   2. unlimited tilt: the VIEWPOINT must not move while tilting (it used to swing on an arc and
//      end up under the world), and standard tilt must keep MapLibre's own behaviour untouched;
//   3. the 3-D volume: a closed body, no altitude ceiling, and the band typed in a chosen unit;
//   4. live aircraft: lifted to their reported altitude — driven by a STUBBED ADS-B feed so the
//      numbers are exact and the test does not depend on who happens to be flying (#R170b).
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';
/* (test-time-headroom) the fixed sleeps in this file are waits for the state they stood in for — tests/helpers/settle.js.
   Every expect() below is unchanged; only the moment it looks moved. Before/after: dev-notes/2026-10-13-test-time-headroom.md */
import { until } from './helpers/settle.js';

/* ⚠ (#R186) THESE TESTS GESTURE ON THE MAP, SO THE MAP HAS TO BE UNDER THE POINTER.
   #R186 made Köppen and the submarine cables on by default, which also opens their legends — and the
   Köppen legend occupies roughly x 465-745 of the map area, exactly where the drags below start.
   Measured with document.elementsFromPoint(700,500): `SPAN.kl-nm > DIV#koppen-legend > CANVAS`, and
   the camera then did not move at all (0 m) because the gesture never reached the renderer. That is
   #R182's own finding — input arrives and nothing happens because the UI is covering the canvas.
   The subject here is the CAMERA, not the legends, so the boot restores the conditions these tests
   were written against rather than moving the gestures: moving them would change the drag geometry
   the distance assertions are tuned to, which would be adjusting the answer to fit.

   Written as a SAVED SESSION rather than as two clicks after boot: #R186's default-on layers are
   suppressed by exactly this path, so they are never created at all — cheaper than creating and then
   removing them on a runner with no GPU, where this file's heaviest test is already at its
   wall-clock budget. addInitScript runs before the app's own scripts, so it is read on the first
   tick. */
const clearDefaultLayers = async (page) => {
  await page.addInitScript(() => {
    /* (#R189) `defv` — without the generation stamp `_restore()` reads this as a pre-#R188 session
       whose absences may be an outage's poison, and heals the default-on layers back on. */
    try { localStorage.setItem('intmap_session2', JSON.stringify({ v: 2, defv: 191, layers: [], tabInit: true, lsrOpen: false, sbOpen: true })); } catch (_) {}
  });
};

/* (remove-synthetic-planes) `query` was how the aircraft test in this file pinned the airplanes.live
   sweep (`?aviation=v1`). That path and its test are removed; the parameter stays because boot() is
   this file's one door to the page, and no remaining test passes one. */
const boot = async (page, query) => {
  await clearDefaultLayers(page);
  await page.goto('/index.html' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  /* (test-time-headroom) the 600 ms tail (#R212) is the renderer's own «can draw» now — the barrier tests/helpers/app.js
     bootPage() uses */
  await until(page, () => { try { return !window.IntMapGeoEngine.canDraw || window.IntMapGeoEngine.canDraw(); } catch (_) { return true; } }, null, { timeout: 60000 });
};

/* How much of the lower half of the viewport is NOT the background wash? A cockpit looking at
   terrain is full of distinct colours; the #R171 white void had almost none. Counted on the PNG,
   because a WebGL canvas without preserveDrawingBuffer reads back black through drawImage.
   (#R173) The PATCH is small on purpose. Decoding a full-width screenshot inside the page allocates
   an image plus its ImageData on top of a cockpit that is already the heaviest thing this app draws,
   and on a CI runner without a GPU that was enough to crash the tab outright ("Target crashed",
   three times in a row). A few hundred square pixels of ground answer the same question. */
const groundDetail = async (page, clip) => {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
    return seen.size;
  }, png);
};

test('the flight simulator shows a WORLD, not a white void', async ({ page }) => {
  /* (#R173) 420 s, not 180: the cockpit now draws the spherical regime, which is heavier — measured in
     headless software GL at 3 fps against the flat cockpit's 5 — and a machine without a GPU spends
     minutes on what a GPU does in seconds. The assertions below are unchanged. */
  test.setTimeout(420000);
  await boot(page);
  /* (#R209) js/flight-sim.js is fetched on demand now, so `window.IntMapFlightSim` is absent at boot.
     The app's own right-click item awaits `IntMapLazy.need('flightSim')` before it starts the sim;
     this test drives the same feature, so it asks the same way rather than sleeping for a global
     that will never appear on its own. */
  await loadLazyModules(page);
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.66, lat: 35.30, alt: 3500, hdg: 90 }));
  /* (test-time-headroom) not 9 s of flight: the cockpit is up — the state the reading below asks about */
  await until(page, () => { try { const m = window.__imap; return window.IntMapFlightSim.active() && m.getZoom() > 11.1 && !!m.getTerrain(); } catch (_) { return false; } }, null, { timeout: 60000 });
  /* (#R173) PAUSE before the heavy reads. What is asserted is a property of the frame on screen, and a
     paused cockpit stops rewriting the camera every frame — on a GPU-less runner that was the difference
     between seven minutes and seconds. */
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', bubbles: true })); });
  await until(page, () => (window.IntMapFlightSim._st()._pauseStart || 0) > 0, null, { timeout: 15000 });   /* (test-time-headroom) paused, not 2.5 s */

  const during = await page.evaluate(() => ({
    active: window.IntMapFlightSim.active(),
    zoom: window.__imap.getZoom(),
    proj: JSON.stringify(window.__imap.getProjection()),
    terrain: !!window.__imap.getTerrain(),
  }));
  expect(during.active).toBe(true);
  expect(during.proj, 'the sim flies the app Globe — never a raw projection spec').toContain('globe');
  expect(during.terrain, 'a flight simulator without a DEM has nothing to fly over').toBe(true);
  /* (#R174) The #R173 solve was withdrawn — the spherical regime it put the camera in cannot look above
     the horizon (measured: the map froze at 85.4° while the pilot looked to 165°). The cockpit is back at
     working zoom, which is where the DEM and the renderer's own sky both work. What this test is really
     for is the pixel count below, which is what #R171 lost. */
  expect(during.zoom).toBeGreaterThan(11.1);

  const vp = page.viewportSize();
  /* (test-time-headroom) asked until the ground has arrived, rather than once after a 9 s flight: a white void never
     reaches the threshold however long it is asked, which is the defect this guards */
  // Measured on the restored build: hundreds of distinct binned colours of terrain and imagery in this
  // patch. The #R171 cockpit was a single fog colour with the HUD over it, which counts about three.
  await expect.poll(() => groundDetail(page, { x: Math.round(vp.width * 0.30), y: Math.round(vp.height * 0.62),
    width: Math.round(vp.width * 0.30), height: Math.round(vp.height * 0.20) }),
  { timeout: 60000, intervals: [500, 1000], message: 'the lower half of the cockpit must contain real ground' }).toBeGreaterThan(40);

  // …and the engine refuses to go back to the projection that blanked it
  const refused = await page.evaluate(() => window.IntMapGeoEngine.camera.setProjection('globe-true'));
  expect(refused, 'the contract declines what it cannot honour').toBe(false);

  await page.evaluate(() => window.IntMapFlightSim.stop());
});

/* (test-time-headroom) ONE BOOT FOR THE TWO 3-D VOLUME TESTS. Each booted the whole app to open the same tool. The
   footprint shapes are drawn first (they are drawn by hand on a freshly opened tool, as before); the model's own claims —
   the closed body, no ceiling, the units — are then asked of the same tool through its API, and setRing() replaces the
   footprint, so they start from the state the second test used to build. Every expect() of both is here, unchanged. */
test('the 3-D volume: every footprint shape draws, not only the polygon — and the body is closed, has no altitude ceiling, and takes a unit', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  await page.evaluate(() => { window.__imap.jumpTo({ center: [138.73, 35.36], zoom: 11, pitch: 55, bearing: 20 }); document.getElementById('btn-tool-volume').click(); });
  await page.waitForFunction(() => !!window.IntMapVolume3D, null, { timeout: 30000 });   /* (#R311) that click fetches the tool (js/lazy-modules.js) */
  await until(page, () => !!document.getElementById('v3d-base'));   /* (test-time-headroom) the tool is open — its panel is built — not a sleep */

  const out = {};
  for (const kind of ['circle', 'rect', 'freehand']) {
    await page.evaluate(k => { document.querySelector(`.v3d-shape[data-shape="${k}"]`).click(); }, kind);
    await until(page, (k) => window.IntMapVolume3D.state().shape === k, kind, { timeout: 5000 });
    await page.mouse.move(660, 470); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(660 + i * 13, 470 + i * 7); await page.waitForTimeout(40); }
    await page.mouse.up();
    await until(page, (k) => { const s = window.IntMapVolume3D.state(); return s.shape === k && s.points >= 3 && s.painted; }, kind, { timeout: 10000 });
    out[kind] = await page.evaluate(() => { const s = window.IntMapVolume3D.state(); return { pts: s.points, area: Math.round(s.areaM2), painted: s.painted, shape: s.shape }; });
  }
  // polygon last, by clicking vertices
  await page.evaluate(() => { document.querySelector('.v3d-shape[data-shape="polygon"]').click(); });
  await until(page, () => window.IntMapVolume3D.state().shape === 'polygon', null, { timeout: 5000 });
  for (const [k, [x, y]] of [[600, 430], [800, 430], [720, 560]].entries()) {
    await page.mouse.click(x, y);
    await until(page, (n) => window.IntMapVolume3D.state().points >= n, k + 1, { timeout: 5000 });
  }
  await until(page, () => window.IntMapVolume3D.state().painted, null, { timeout: 10000 });
  out.polygon = await page.evaluate(() => { const s = window.IntMapVolume3D.state(); return { pts: s.points, area: Math.round(s.areaM2), painted: s.painted, shape: s.shape }; });

  for (const k of ['circle', 'rect', 'freehand', 'polygon']) {
    expect(out[k].shape, `${k} must be the active shape`).toBe(k);
    expect(out[k].pts, `${k} must produce a footprint`).toBeGreaterThanOrEqual(3);
    expect(out[k].area, `${k} must enclose real ground`).toBeGreaterThan(0);
    expect(out[k].painted, `${k} must reach the renderer`).toBe(true);
  }

  /* ── the closed body, its ceiling and its unit, on the same open tool ── */

  const st = await page.evaluate(() => {
    const V = window.IntMapVolume3D;
    V.setUnit('m'); V.setAltitudes(1000, 3000);
    V.setRing(V.circleRing([138.73, 35.40], 6000, 64));
    const s = V.state();
    // units convert both ways without touching the model
    const asKm = (V.setUnit('km'), V.fieldValue(V.base()));
    const asFt = (V.setUnit('ft'), V.fieldValue(V.base()));
    V.setUnit('m');
    // no ceiling: a geostationary shell is a legal band now
    V.setAltitudes(35786000, 35800000);
    const geo = [V.base(), V.top()];
    V.setAltitudes(1000, 3000);
    return { body: s.body, shell: s.shell, canSolid: s.canSolid, solid: s.solid, points: s.points, asKm, asFt, geo, limits: V.limits() };
  });
  expect(st.points, 'circleRing(…,64) is 64 vertices; closedRing() adds the repeat only when it hands the ring to the renderer').toBe(64);
  /* (#R174) there is no `solid` flag any more — a volume IS a closed body (「わざわざSolidを選択制なんて
     するな」), and the open shell survives only as the fallback for a renderer without solids. So what is
     asserted is the body itself, which is the thing that was ever worth asserting. */
  // (#R173) the closed body is ONE mesh drawn by the engine's solid contract — a floor and a filled
  // interior that a fill-extrusion cannot express — so what is asserted is that the solid is what draws.
  expect(st.canSolid, 'the renderer can draw a closed body').toBe(true);
  expect(st.body, 'and it is the closed body that is painted').toBe(true);
  expect(st.shell, 'the open shell is not painted at the same time').toBe(false);
  expect(st.asKm, '1000 m is 1 km').toBe(1);
  expect(st.asFt, '1000 m is 3281 ft').toBe(3281);
  expect(st.geo, 'a 35,786 km band is not clamped away').toEqual([35786000, 35800000]);
  expect(st.limits.max).toBeGreaterThan(1e8);

  // (#R174) …and there is no way, anywhere, to ask for the open shell instead
  const gone = await page.evaluate(() => ({ api: typeof window.IntMapVolume3D.setSolid,
    flag: 'solid' in window.IntMapVolume3D.state(), box: !!document.querySelector('#v3d-solid') }));
  expect(gone.api, 'the module no longer offers the choice').toBe('undefined');
  expect(gone.flag, 'nor reports one').toBe(false);
  expect(gone.box, 'and the panel has no checkbox for it').toBe(false);
});

/* ⚠ (remove-synthetic-planes) THE AIRCRAFT TEST THAT STOOD HERE BOOTED `?aviation=v1` — the per-browser
   airplanes.live sweep and its two MapLibre renderings (`lyr-planes`, `lyr-planes-3d`), with that
   host stubbed. The sweep is removed with its provider (HTTP 403 to every request since #R341), and
   so are the layers the test read; there is nothing left for it to boot. The aircraft layer is the
   GPU cloud now: the platform is gated by tests/r341.spec.js and tests/r379.spec.js, the card by
   tests/r352.spec.js, what the page does when the feed fails by
   tests/remove-synthetic-planes-checks.test.mjs, and live aircraft by tests/r341-live.spec.js. */
