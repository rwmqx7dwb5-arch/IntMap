// R173 behavioural checks in a real browser.
//
// Each of these measures the thing the report was about, not the mechanism behind it:
//   1. the cockpit is on a SPHERE — judged by the horizon sitting at the true dip below eye level,
//      which is exactly 0 on a flat map and grows with altitude on a round one;
//   2. tilting with the ceiling lifted does not move the viewpoint — by any route (drag, keyboard,
//      programmatic, ease), and a journey still lands where it was asked to;
//   3. the 3-D volume is a closed body, and it is the body that draws;
//   4. an aircraft can be picked WHERE IT IS DRAWN and its click draws the observed track — driven by
//      a stubbed ADS-B feed (#R170b) so the numbers are exact.
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

/* ⚠ (#R186) See the same note in tests/r172.spec.js. Köppen is on by default now, its legend covers
   the part of the map these drags start on, and a gesture that lands on a legend never reaches the
   renderer — measured as a tilt drag that moved the camera exactly 0 m. The subject here is the
   viewpoint, so the boot restores the map these tests were written against.

   Written as a SAVED SESSION rather than as clicks after boot — the layers are then never created at
   all, which is cheaper than creating and removing them on a runner with no GPU, where the cockpit
   test in this file is already at its wall-clock budget. */
const clearDefaultLayers = async (page) => {
  await page.addInitScript(() => {
    /* (#R189) `defv` — without the generation stamp `_restore()` reads this as a pre-#R188 session
       whose absences may be an outage's poison, and heals the default-on layers back on. */
    try { localStorage.setItem('intmap_session2', JSON.stringify({ v: 2, defv: 191, layers: [], tabInit: true, lsrOpen: false })); } catch (_) {}
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
  await page.waitForTimeout(600);   /* (#R212) the style is already loaded — this tail was 1.5 s in 20 specs */
};

/* the eye, as the engine reports it */
const eye = page => page.evaluate(() => { const E = window.IntMapGeoEngine.camera.eye();
  return { lng: E.lng, lat: E.lat, alt: E.alt }; });
const metres = (a, b) => Math.hypot((b.lng - a.lng) * 91000, (b.lat - a.lat) * 111320);
/* the sim's own pause (the P key), so the camera stops being rewritten every frame */
const pause = async page => { await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    /* the release matters: the sim ignores a key that is already held, so a keydown on its own
       pauses once and every later one is swallowed */
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', bubbles: true })); });
  await page.waitForTimeout(2500); };

test('the cockpit contains a real world, with the viewpoint at the aeroplane (#R173 globe withdrawn in #R174)', async ({ page }) => {
  /* Generous, because a cockpit is the heaviest thing this app draws and CI has no GPU. Measured in
     headless software GL: the flat cockpit ran at 5 fps and the spherical one at 3 — the extra cost is
     real (more of what is in front of the aeroplane is actually drawn), and on a machine rendering in
     software it pushes a fixed-wall-clock test past three minutes. On a GPU the same test takes ~1 min. */
  test.setTimeout(420000);
  await boot(page);
  /* (#R209) the simulator is no longer in the boot bundle — `window.IntMapFlightSim` exists only once
     `IntMapLazy.need('flightSim')` has resolved, which is what the app's own entry point awaits
     before it calls start(). The keyboard the `pause` helper drives is registered by that same
     module, so it has to arrive before the sim is started, not after. */
  await loadLazyModules(page);
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.66, lat: 35.05, alt: 6000, hdg: 0 }));
  await page.waitForTimeout(9000);
  /* PAUSE before measuring. Everything asserted below is a property of the camera and the frame on
     screen, not of the aeroplane moving — and a paused cockpit stops re-writing the whole camera 60
     times a second, which is what made a GPU-less runner take seven minutes to answer a page.evaluate
     (it answers in seconds here). The physics is frozen, the view is not. */
  await pause(page);

  const s = await page.evaluate(() => {
    const m = window.__imap, S = window.IntMapFlightSim._st();
    return { active: window.IntMapFlightSim.active(), zoom: m.getZoom(), globeness: window.IntMapGeoEngine.camera.globeness(),
      alt: S.alt, eyeAlt: window.IntMapGeoEngine.camera.altitude(), terrain: !!m.getTerrain(),
      proj: JSON.stringify(m.getProjection()), sky: !!document.querySelector('#map .fs-sky') };
  });
  expect(s.active).toBe(true);
  expect(s.terrain, 'a flight simulator does not trade away its DEM').toBe(true);
  expect(s.proj, 'the sim flies the app Globe, never a raw projection spec').toContain('globe');
  /* (#R174) THE POINT OF #R173 WAS WITHDRAWN, and this is where the record belongs. Putting the camera
     in the renderer's spherical regime meant the map could not look above the horizon at all — measured
     while pulling the nose up, the map's pitch stayed at 85.4° for every frame from 92° to 165° of view
     angle, with 1,077 px of padding compensating on a 720 px window. A flight simulator that cannot look
     up is not one, so the cockpit is back at working zoom and the sky is the renderer's again. What this
     test still guards — and what was always the valuable half — is that the cockpit contains a WORLD, that
     the viewpoint is AT the aeroplane, and that the DEM is under it. Looking up is guarded by
     tests/r174.spec.js. */
  expect(s.zoom, 'the cockpit sits where the DEM and the sky both work').toBeGreaterThan(11.1);
  expect(Math.abs(s.eyeAlt - s.alt), 'the viewpoint is at the aircraft').toBeLessThan(120);
  expect(s.sky, 'and the sim paints no sky of its own — that is the renderer’s job').toBe(false);

  /* the cockpit contains a WORLD (#R172's lesson: measure pixels, not projection names).
     A small patch, decoded in the page: a full-width screenshot decoded on top of a live cockpit
     crashed the tab on a GPU-less CI runner, and a few hundred square pixels of ground say the same. */
  const vp = page.viewportSize();
  const png = (await page.screenshot({ clip: { x: Math.round(vp.width * 0.30), y: Math.round(vp.height * 0.62),
    width: Math.round(vp.width * 0.30), height: Math.round(vp.height * 0.20) } })).toString('base64');
  const colours = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
    return seen.size;
  }, png);
  expect(colours, 'the lower half of the cockpit must contain real ground').toBeGreaterThan(40);

  // near the ground the map goes back to the flat regime, where the imagery is sharpest
  await pause(page);                                        // …flying again for the descent
  await page.evaluate(async () => { const S = window.IntMapFlightSim._st(), t = (S._terrF || 0) + 250, a0 = S.alt;
    for (let i = 0; i < 25; i++) { S.alt = a0 + (t - a0) * (i + 1) / 25; await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForTimeout(5000);                          // the camera follows the altitude every frame
  const low = await page.evaluate(() => ({ globeness: window.IntMapGeoEngine.camera.globeness(),
    zoom: window.__imap.getZoom(), alt: window.IntMapFlightSim._st().alt,
    eyeAlt: window.IntMapGeoEngine.camera.altitude() }));
  expect(low.alt).toBeLessThan(1200);
  expect(low.globeness, 'on approach the curvature is invisible and the detail is what matters').toBeLessThan(0.5);
  expect(Math.abs(low.eyeAlt - low.alt), 'and the viewpoint is still at the aircraft').toBeLessThan(120);
  expect(low.zoom, 'still at working zoom on the descent').toBeGreaterThan(11.1);

  /* ══ (#R377) …AND THE WORLD UNDER IT IS THE SEA, NOT A KILOMETRE OF BATHYMETRY ══════════════
     This spawn is over SURUGA BAY, and that is why the assertion above went red on main. The
     descent leg asks for "the ground + 250 m"; the ground came from the DEM, which carries water
     DEPTH at low zoom (measured −994 m here, 0 m from z12 up), so the target was −144 m — below
     the sea surface. The aeroplane was flown under water, the ground rose back to 0 m under it,
     the sim registered contact, `showResult()` set `paused = true`, and the loop stopped writing
     the camera while this test went on writing `st.alt`. The frozen eye was 248 m from the
     aircraft, and the viewpoint had never left it.
     #R152 floors the physics ground at the sea surface over open water, and the discriminator is
     `window.countryGeo` — but js/countries-ui.js REPLACES that object a few seconds after boot
     (Natural Earth 110 m → 10 m), and the per-cell answer was cached with no record of which
     outline produced it. Measured at 138.66°E 35.05°N: 110 m (177 features) says Japan, 10 m
     (258 features) says ocean.
     ⚠ ASKED WITH SYNTHETIC OUTLINES, IN BOTH DIRECTIONS, so it depends on neither Natural Earth
     being reachable nor on which scale won the race — and on the aeroplane THIS TEST IS ALREADY
     FLYING, so it costs no boot and no second flight (scripts/test-budget.mjs). */
  const box = (w, s, e, n) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ADMIN: 'TESTLAND' },
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] });
  const swap = async (poly, want) => {
    await page.evaluate((g) => { window.__r377set(g); }, poly);
    await page.waitForFunction((w) => window.IntMapFlightSim._st()._overOcean === w, want, { timeout: 8000 }).catch(() => { });
    return page.evaluate(() => window.IntMapFlightSim._st()._overOcean);
  };
  await page.evaluate(() => {
    window.__r377 = { prev: window.countryGeo, held: window.countryGeo };
    Object.defineProperty(window, 'countryGeo', { configurable: true, get: () => window.__r377.held, set: () => { } });
    window.__r377set = (v) => { window.__r377.held = v; };
  });
  const ac = await page.evaluate(() => { const S = window.IntMapFlightSim._st(); return [S.lng, S.lat]; });
  const LAND = box(ac[0] - 0.75, ac[1] - 0.5, ac[0] + 0.75, ac[1] + 0.5);
  const SEA = box(ac[0] + 1.5, ac[1] - 0.5, ac[0] + 2.5, ac[1] + 0.5);
  expect(await swap(LAND, false), 'inside the outline it is given, the aircraft is over land').toBe(false);
  expect(await swap(SEA, true), 'and the moment an outline that excludes it replaces that one, it is over the sea').toBe(true);
  /* the answer is load-bearing, not an opinion: #R152's floor pulls the physics ground back up */
  await page.evaluate(() => { window.IntMapFlightSim._st()._terrF = -900; });
  await page.waitForFunction(() => window.IntMapFlightSim._st()._terrF >= -1, null, { timeout: 8000 }).catch(() => { });
  expect(await page.evaluate(() => window.IntMapFlightSim._st()._terrF),
    'over open sea the physics ground is the surface, never the sea floor').toBeGreaterThanOrEqual(-1);
  await page.evaluate(() => { try { const p = (window.__r377 || {}).prev; delete window.countryGeo; window.countryGeo = p; } catch (_) { }
    try { delete window.__r377set; delete window.__r377; } catch (_) { } });

  await page.evaluate(() => window.IntMapFlightSim.stop());
});

test('the 3-D volume is a closed body — one solid, with a floor', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('btn-tool-volume').click());
  await page.waitForFunction(() => !!window.IntMapVolume3D, null, { timeout: 30000 });   /* (#R311) that click fetches the tool (js/lazy-modules.js) */
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => {
    const V = window.IntMapVolume3D;
    V.setAltitudes(1000, 3000); V.setStyle('#ff3b30', 0.45);
    V.setRing(V.circleRing([139.85, 35.60], 3000, 48));
    return V.state();
  });
  await page.waitForTimeout(1200);
  expect(st.canSolid, 'MapLibre can draw a closed body (a custom mesh, not an extrusion)').toBe(true);
  expect(st.body, 'and that is what is painted').toBe(true);
  expect(st.shell, 'the open shell is not painted at the same time').toBe(false);
  expect(st.points).toBe(48);

  // every footprint shape still reaches the same body
  for (const shape of ['rect', 'freehand', 'polygon', 'circle']) {
    const ok = await page.evaluate(s => {
      const V = window.IntMapVolume3D;
      V.setShape(s);
      V.setRing(s === 'rect' ? V.rectRing([139.80, 35.55], [139.90, 35.65])
        : V.circleRing([139.85, 35.60], 2500, 32));
      const st2 = V.state();
      return { shape: st2.shape, points: st2.points, body: st2.body, painted: st2.painted };
    }, shape);
    expect(ok.shape, `${shape} is selectable`).toBe(shape);
    expect(ok.points, `${shape} has a footprint`).toBeGreaterThan(3);
    expect(ok.painted, `${shape} draws`).toBe(true);
    expect(ok.body, `${shape} draws as the closed body`).toBe(true);
  }
});

/* ⚠ (remove-synthetic-planes) THE AIRCRAFT TEST THAT STOOD HERE BOOTED `?aviation=v1` — the per-browser
   airplanes.live sweep and its two MapLibre renderings (`lyr-planes`, `lyr-planes-3d`), with that
   host stubbed. The sweep is removed with its provider (HTTP 403 to every request since #R341), and
   so are the layers the test read; there is nothing left for it to boot. The aircraft layer is the
   GPU cloud now: the platform is gated by tests/r341.spec.js and tests/r379.spec.js, the card by
   tests/r352.spec.js, what the page does when the feed fails by
   tests/remove-synthetic-planes-checks.test.mjs, and live aircraft by tests/r341-live.spec.js. */
