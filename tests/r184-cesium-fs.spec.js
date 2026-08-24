// (#R184) THE FLIGHT SIMULATOR ON THE SECOND ENGINE.
//
// 「Cesium選択時にもフライトシミュレーターを使えるように。」
//
// The simulator is the app's most camera-hungry feature: it takes the camera for the length of a
// flight, drives it every frame from a 6-DOF rigid-body model, suspends every gesture, replaces the
// sky, and opens a second view as a moving map. Each of those is a place where an adapter can
// implement the method name and do nothing — so nothing here asserts "it did not throw". Every check
// is that the CAMERA ACTUALLY WENT WHERE THE AEROPLANE IS.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';
import { loadLazyModules } from './helpers/app.js';

const BOOT = { timeout: 120_000 };
/* (#R201) ONE page load — see tests/helpers/engine.js */
const asCesium = (page) => bootEngine(page, 'cesium', BOOT);
// (#R209) THE SIMULATOR IS NOT IN THE BOOT BUNDLE ANY MORE. js/lazy-modules.js fetches
// js/flight-sim.js — and with it `window.IntMapFlightSim` — the first time something asks for it,
// which is what the right-click item that starts a flight now does (`IntMapLazy.need('flightSim')`).
// So each test here asks the same way, immediately after its own boot barrier. Waiting for the
// global instead would be waiting for something that is never coming on its own.

/* ── ① THE CAPABILITIES THE SIMULATOR NEEDS ARE REALLY THERE ──────────────────────────────── */
test('R184 Cesium FS ①: every camera capability the simulator drives is implemented, not stubbed', async ({ page }) => {
  test.setTimeout(180_000);
  await asCesium(page);
  await loadLazyModules(page);   // (#R209) ask for the on-demand modules the way the app asks
  const r = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const gest = E.input.names();
    return {
      engine: E.id(),
      hasFS: !!(window.IntMapFlightSim && window.IntMapFlightSim.start),
      /* the whole surface the loop touches */
      fromTo: typeof E.camera.fromTo === 'function' && !!E.camera.fromTo({ lng: 8, lat: 46 }, 3000, { lng: 8.01, lat: 46.01 }, 2900),
      setMaxPitch: E.camera.setMaxPitch(179),
      maxPitchBack: E.camera.getMaxPitch(),
      gestures: gest,
      /* the simulator suspends every gesture by NAME — a name the adapter does not know is a
         gesture that stays live under the pilot's hands */
      suspend: ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch']
        .map((h) => [h, E.input.set(h, false)]),
      sky: (() => { try { const was = E.scene.getSky(); E.scene.setSky({ 'sky-color': '#3f78c2' }); const now = E.scene.getSky(); E.scene.setSky(was); return { ok: true, now: !!now }; } catch (e) { return { ok: false, err: String(e) }; } })(),
      subView: (() => { try { const el = document.createElement('div'); el.style.cssText = 'width:120px;height:120px;position:absolute;left:-999px;'; document.body.appendChild(el);
        const v = E.ui.createSubView({ container: el, interactive: false }); const ok = !!(v && v.camera && v.camera.jumpTo); return { ok }; } catch (e) { return { ok: false, err: String(e) }; } })(),
      terrain: E.coords.terrainElevation([8.0, 46.5]),
      eye: E.camera.eye(),
    };
  });
  expect(r.engine).toBe('cesium');
  expect(r.hasFS, 'the simulator module must exist on this engine, not be replaced by a no-op stub').toBe(true);
  expect(r.fromTo, 'the eye-to-target camera solve is what the cockpit view is made of').toBe(true);
  expect(r.setMaxPitch).toBe(true);
  expect(r.maxPitchBack, 'a cockpit looks past the vertical when the nose comes up').toBeGreaterThanOrEqual(179);
  /* every gesture the simulator suspends must be a gesture this engine knows */
  const unknown = r.suspend.filter(([, ok]) => !ok).map(([h]) => h);
  expect(unknown, 'a gesture the adapter does not know stays live under the pilot').toEqual([]);
  expect(r.sky.ok).toBe(true);
  expect(r.subView.ok, 'the moving map is a second view of the same world').toBe(true);
  expect(r.eye, 'the simulator reads the viewpoint back every frame').toBeTruthy();
});

/* ── ② A REAL FLIGHT MOVES THE REAL CAMERA ────────────────────────────────────────────────── */
test('R184 Cesium FS ②: the aircraft flies and the camera is at the aircraft', async ({ page }) => {
  /* ⚠ (#R400) 180 s → 300 s, AND THE NUMBERS ARE HERE BECAUSE RAISING A TIMEOUT TO MAKE A TEST PASS
     is the move this repository distrusts. Measured, not guessed. Locally the three tests in this
     file cost 9 s / 87 s / 38 s = 134 s; tests/durations.json records 234 s for the same file in
     CI, so a CI runner is ~1.75× slower than this machine and ② lands at roughly 152 s there. The
     cap was 180 s — an 18 % margin on the heaviest Cesium test in the suite, which starts a
     renderer with software WebGL and flies an aircraft for twenty simulated seconds. It held on
     2026-08-19 and 2026-08-21 and went over on 2026-08-23; nothing else in that nightly's failure
     was this test's doing.
     ⚠ THIS IS A CLOCK, NOT AN ASSERTION. Every expectation below is unchanged: what the test proves
     about the camera is exactly what it proved before. What changed is that a slow runner no longer
     turns a green fact into a red night — which matters because an alarm that cries wolf is an alarm
     that gets ignored, and #R304 measured what that costs (fourteen unread red nights). */
  test.setTimeout(300_000);
  await asCesium(page);
  await loadLazyModules(page);   // (#R209) ask for the on-demand modules the way the app asks
  const r = await page.evaluate(async () => {
    const FS = window.IntMapFlightSim, E = window.IntMapGeoEngine;
    const start = { lng: 8.0, lat: 46.5, alt: 3000, hdg: 90, speed: 120, aircraft: 'f35', keepAlt: true };
    const ok = FS.start(start);
    if (!ok && !FS.active()) return { started: false };
    /* let it fly — the loop is driven by rAF, which ?rafshim=1 keeps ticking in a hidden tab */
    const samples = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r2) => setTimeout(r2, 100));
      const st = FS._st();
      if (!st) break;
      const eye = E.camera.eye();
      samples.push({ lng: st.lng, lat: st.lat, alt: st.alt, V: st.V,
        eLng: eye && eye.lng, eLat: eye && eye.lat, eAlt: eye && eye.alt,
        bearing: E.camera.getBearing(), pitch: E.camera.getPitch() });
    }
    const st = FS._st();
    const out = { started: true, active: FS.active(), n: samples.length,
      first: samples[0], last: samples[samples.length - 1],
      hud: !!document.getElementById('fs-hud'),
      camSkips: window.__fsCamSkips || 0 };
    FS.stop();
    await new Promise((r2) => setTimeout(r2, 1200));
    out.afterStop = { active: FS.active(), maxPitch: E.camera.getMaxPitch(),
      gesturesBack: E.input.names().every((g) => E.input.set(g, true)) };
    return out;
  });
  expect(r.started, 'the simulator starts on this engine').toBe(true);
  expect(r.n).toBeGreaterThan(10);
  /* THE AEROPLANE MOVED. An F-35 at 120 m/s covers ~400 m in 3.5 s; anything under 50 m means the
     physics ran and the position did not, which is what a stubbed camera looks like from outside. */
  const R = 6371000, d2r = Math.PI / 180;
  const gc = (a, b) => { const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
  const flew = gc(r.first, r.last);
  expect(flew, 'the aircraft covers real ground').toBeGreaterThan(50);
  /* THE CAMERA IS AT THE AEROPLANE — the cockpit view, not a distant orbit. #R182's whole lesson is
     that a camera can be given the right numbers under the wrong convention and still "work", so
     this measures the DISTANCE between the eye and the aircraft rather than trusting the call. */
  const eyeOff = gc({ lat: r.last.lat, lng: r.last.lng }, { lat: r.last.eLat, lng: r.last.eLng });
  expect(eyeOff, 'the eye is in the cockpit, not kilometres behind it').toBeLessThan(50);
  /* THE DEFECT THIS PINS. Driving a positional camera through MapLibre's centre+zoom solve put the
     eye 3,174 m from the aeroplane's altitude while its longitude, latitude and heading were all
     correct — which is exactly the kind of wrongness that looks like a working feature. Told the
     position directly, the error is 2 nanometres, so the tolerance can be a metre and mean it. */
  expect(Math.abs(r.last.eAlt - r.last.alt), 'and at the aircraft\'s own altitude').toBeLessThan(1);
  /* the eye tracked the aircraft rather than sitting still while it flew away */
  const eyeMoved = gc({ lat: r.first.eLat, lng: r.first.eLng }, { lat: r.last.eLat, lng: r.last.eLng });
  expect(eyeMoved).toBeGreaterThan(flew * 0.5);
  expect(r.hud, 'the HUD is part of the simulator, not of MapLibre').toBe(true);
  /* stopping puts the world back */
  expect(r.afterStop.active).toBe(false);
  expect(r.afterStop.gesturesBack).toBe(true);
});

/* ── ③ THE DEFAULT ENGINE IS UNCHANGED ────────────────────────────────────────────────────── */
test('R184 Cesium FS ③: the simulator on MapLibre is untouched', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?rafshim=1');
  // (#R209) `IntMapFlightSim` stood in for "the app is up" here, and it cannot any more: it is
  // published on demand, so a boot that is entirely healthy never defines it. The signal is an eager
  // global instead — IntMapLayers, one of tests/smoke.spec.js's critical set — and the simulator is
  // asked for below, which is the same order the right-click item does it in.
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapLayers, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
  await loadLazyModules(page);
  const r = await page.evaluate(async () => {
    const FS = window.IntMapFlightSim, E = window.IntMapGeoEngine;
    FS.start({ lng: 8.0, lat: 46.5, alt: 3000, hdg: 90, speed: 120, aircraft: 'f35', keepAlt: true });
    const a = FS._st() && { lng: FS._st().lng, lat: FS._st().lat };
    for (let i = 0; i < 20; i++) await new Promise((r2) => setTimeout(r2, 100));
    const b = FS._st() && { lng: FS._st().lng, lat: FS._st().lat };
    const eye = E.camera.eye();
    const out = { engine: E.id(), a, b, eye: eye && { lng: eye.lng, lat: eye.lat, alt: eye.alt }, active: FS.active() };
    FS.stop();
    return out;
  });
  expect(r.engine).toBe('maplibre');
  expect(r.a).toBeTruthy();
  expect(r.b).toBeTruthy();
  expect(Math.abs(r.b.lng - r.a.lng) + Math.abs(r.b.lat - r.a.lat)).toBeGreaterThan(0);
});
