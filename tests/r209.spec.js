/* ============================================================================
 *  #R209 — the browser half of runtime code-splitting
 * ----------------------------------------------------------------------------
 *  The source-level checks (tests/r209-checks.test.mjs) prove the eight modules left the entry and
 *  that every door awaits the loader. Only a browser can prove the thing that actually matters:
 *
 *      the feature still exists.
 *
 *  This project's most expensive recurring defect is a feature that silently stops existing
 *  (#R162, #R200, #R205, #R208), and "the file is not downloaded yet" is a machine for producing
 *  it. So this asks for all eight and reads the loader's own record — which is written by the load
 *  path itself, not by the test — plus the two facts the boot guard can no longer see: that none of
 *  them is present BEFORE it is asked for, and that all of them are present after.
 *
 *  Uses the worker-scoped shared page (#R208): one boot for the file.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

test('R209 ①: none of the deferred modules is in the boot bundle, and the boot guard is still clean', async ({ app }) => {
  const s = await app.page.evaluate(() => ({
    check: window.__imModuleCheck,
    lazyCheck: window.__imLazyCheck,
    names: window.IntMapLazy ? window.IntMapLazy.names() : null,
    /* the eight globals, BEFORE anybody asks for them */
    present: {
      flightSim: typeof window.IntMapFlightSim, playground: typeof window._openPlayground,
      seismic: typeof window.IntMapSeismic, tsunami: typeof window.IntMapTsunami,
      terrainWater: typeof window.IntMapTerrainWater, los: typeof window.IntMapLOS,
      streetView: typeof window.IntMapStreetView, nightSky: typeof window.IntMapNightSky,
    },
    factories: ['flightSim', 'playground', 'seismic', 'tsunami', 'terrainWater', 'los', 'streetView']
      .map((k) => [k, typeof (window.IntMapModules || {})[k]]),
  }));

  expect(s.names, 'the loader is published at boot — every door reaches it by name').toBeTruthy();
  expect(s.names.length, 'and it knows all eight').toBe(8);

  /* ⚠ THE POINT OF THE ROUND. If these were 'object' the files would be in the boot bundle after
     all and the split would be a comment; the sizes in DEV-NOTES would be measuring nothing. */
  for (const [k, t] of Object.entries(s.present)) {
    expect(t, `${k} must NOT be present before it is asked for — it is fetched on demand`).toBe('undefined');
  }
  for (const [k, t] of s.factories) {
    expect(t, `the ${k} factory is not registered at boot either`).toBe('undefined');
  }

  /* …and the boot guard, which no longer knows about them, is clean rather than noisy. */
  expect(s.check.missingFactories, 'no EAGER factory is missing').toEqual([]);
  expect(s.check.missing, 'no required global is missing').toEqual([]);
  expect(s.check.lazy, 'the guard still names the deferred ones, so one list knows every factory').toContain('flightSim');
  expect(s.lazyCheck.failed, 'nothing has failed to load yet').toEqual([]);
});

test('R209 ②: asking for the seismic simulator brings the tsunami model with it', async ({ app }) => {
  /* js/seismic.js calls window.IntMapTsunami directly when an event screens as tsunamigenic, so the
     two cannot be fetched separately — the panel would offer a run that silently does nothing. */
  /* ⚠ ON THE SHARED PAGE, AND ORDERED FIRST — not on a fresh one. The claim needs a page where
     tsunami has not been fetched yet, and `app.freshPage()` buys that with a whole second boot
     (measured: it was 40% of this file). The file is serial, so running before the test that asks
     for all eight gives the same precondition for nothing. */
  const p = app.page;
  const before = await p.evaluate(() => typeof window.IntMapTsunami);
  const after = await p.evaluate(async () => {
    await window.IntMapLazy.need('seismic');
    return { tsunami: typeof window.IntMapTsunami, failed: window.__imLazyCheck.failed };
  });
  expect(before, 'not there to begin with').toBe('undefined');
  expect(after.tsunami, 'asking for seismic fetched tsunami too').not.toBe('undefined');
  expect(after.failed).toEqual([]);
});

test('R209 ③: every deferred module actually arrives, registers and publishes', async ({ app }) => {
  test.setTimeout(120_000);
  const res = await app.page.evaluate(async () => {
    const names = window.IntMapLazy.names();
    await Promise.all(names.map((n) => window.IntMapLazy.need(n)));
    return {
      names,
      failed: window.__imLazyCheck.failed,
      loaded: window.__imLazyCheck.loaded,
      globals: {
        flightSim: typeof window.IntMapFlightSim, playground: typeof window._openPlayground,
        seismic: typeof window.IntMapSeismic, tsunami: typeof window.IntMapTsunami,
        terrainWater: typeof window.IntMapTerrainWater, los: typeof window.IntMapLOS,
        streetView: typeof window.IntMapStreetView, nightSky: typeof window.IntMapNightSky,
      },
      /* a few members each caller actually uses — a module that loaded but registered half of
         itself would pass a `typeof !== 'undefined'` check and fail the user */
      members: {
        flightSim: typeof (window.IntMapFlightSim || {}).setup,
        seismic: typeof (window.IntMapSeismic || {}).open,
        tsunami: typeof (window.IntMapTsunami || {}).open,
        terrainWater: typeof (window.IntMapTerrainWater || {}).open,
        los: typeof (window.IntMapLOS || {}).open,
        streetView: typeof (window.IntMapStreetView || {}).open,
        nightSky: typeof (window.IntMapNightSky || {}).open,
      },
    };
  });

  /* the loader's OWN verdict — it checks the factory registered and the global appeared */
  expect(res.failed, 'the loader recorded no failure').toEqual([]);
  expect(res.loaded.sort(), 'and recorded every one as loaded').toEqual(res.names.sort());
  for (const [k, t] of Object.entries(res.globals)) expect(t, `${k} published its global`).not.toBe('undefined');
  for (const [k, t] of Object.entries(res.members)) expect(t, `${k} published a usable API`).toBe('function');
});

test('R209 ④: the right-click menu still opens a deferred simulator', async ({ app }) => {
  /* The end-to-end claim: the door the user actually uses works, with the file arriving in between.
     Anything less tests the loader rather than the feature. */
  const page = app.page;
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.73, 35.36], zoom: 9, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(400);
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await expect(page.locator('#ctx-menu')).toBeVisible({ timeout: 10_000 });
  /* the menu opens with its four groups collapsed — the simulators live under the last one */
  await page.locator('#ctx-menu').getByText(/Analysis & simulation/i).first().click();
  await page.locator('#ctx-menu').getByText(/Seismic waves from here/i).click();
  /* the panel only exists once the file has arrived and its factory has run */
  await expect(page.locator('#sq-panel, .sq-panel, [id*="seismic"]').first()).toBeVisible({ timeout: 45_000 });
  const st = await page.evaluate(() => ({ open: !!(window.IntMapSeismic && window.IntMapSeismic.state().open), failed: window.__imLazyCheck.failed }));
  expect(st.failed, 'and it arrived cleanly').toEqual([]);
  expect(st.open, 'the simulator is open').toBe(true);
  await page.evaluate(() => { try { window.IntMapSeismic.close(); } catch (_) { } });
});

test('R209 ⑤: turf still answers every call the app makes, and the heavy pair arrives on demand', async ({ app }) => {
  const r = await app.page.evaluate(async () => {
    const t = window.turf;
    const eager = {
      point: typeof t.point, bbox: typeof t.bbox, distance: typeof t.distance,
      booleanPointInPolygon: typeof t.booleanPointInPolygon, union: typeof t.union,
      greatCircle: typeof t.greatCircle, circle: typeof t.circle, area: typeof t.area,
      kinks: typeof t.kinks, along: typeof t.along, bboxClip: typeof t.bboxClip,
    };
    /* a real answer, not just a function reference */
    const d = t.distance(t.point([0, 0]), t.point([0, 1]), { units: 'kilometres' });
    const before = { convex: typeof t.convex, buffer: typeof t.buffer };
    await t.ensureHeavy();
    return { eager, d, before, after: { convex: typeof t.convex, buffer: typeof t.buffer } };
  });
  for (const [k, v] of Object.entries(r.eager)) expect(v, `turf.${k} is bundled`).toBe('function');
  expect(r.d, 'and computes — one degree of latitude is ~111 km').toBeGreaterThan(110);
  expect(r.d).toBeLessThan(112);
  expect(r.before.convex, 'convex is NOT in the boot bundle (it reaches turf-jsts, 332 kB)').toBe('undefined');
  expect(r.before.buffer, 'nor is buffer').toBe('undefined');
  expect(r.after.convex, 'and ensureHeavy() brings them').toBe('function');
  expect(r.after.buffer).toBe('function');
});
