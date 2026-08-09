/* ============================================================================
 *  R195 — the two things only a real renderer can answer.
 *
 *  ① The tsunami picture is drawn WHERE THE WATER IS. A dynamic image is a quad
 *     whose texture runs linearly in the renderer's own vertical coordinate —
 *     Mercator on MapLibre — while the field is sampled at equal steps of
 *     LATITUDE. Painting row j into image row N−1−j put the wave up to 8° from
 *     its own epicentre. The assertion below does its OWN Mercator arithmetic,
 *     so it cannot agree with the app by sharing its mistake.
 *
 *  ② The hover triad is dispatched by ONE hit test, and still behaves exactly
 *     like the renderer's own delegation: enter carries features, leave does
 *     not, move fires only over the layer, and off() really detaches.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

const ready = async (page) => {
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, { timeout: 90000 });
  await page.waitForTimeout(2000);
};

test('R195 tsunami: the painted wave sits on the epicentre it came from', async ({ page }) => {
  test.setTimeout(300000);
  await ready(page);
  /* ⚠ (#R209) THE MODULE IS FETCHED ON DEMAND NOW, so waiting for `window.IntMapTsunami` to appear
     by itself waits for something nobody asked for. js/lazy-modules.js took the tsunami simulator
     out of the boot bundle; the app's own entry point awaits `IntMapLazy.need('tsunami')` first, and
     so does this. It throws by name if the module fails, so nothing here is made quieter — only the
     ready() barrier above stays a BOOT barrier, and it names eager globals. */
  await loadLazyModules(page);

  const r = await page.evaluate(async () => {
    window.IntMapTsunami.open({ lng: 142.37, lat: 38.32, mw: 9.1, depth: 24, hours: 3 });
    const end = performance.now() + 260000;
    while (performance.now() < end) {
      const s = window.IntMapTsunami.state();
      if (s.sim && !s.busy) break;
      if (s.err) return { err: s.err };
      await new Promise((r) => setTimeout(r, 200));
    }
    const src = window.__imap.getSource('tsu-field');
    if (!src || !src.canvas) return { err: 'no canvas source' };
    const cv = src.canvas, c = src.coordinates;
    /* t = 0 is the co-seismic displacement, centred on the fault.
       ⚠ (#R197) AND THE CANVAS HAS TO BE REPAINTED BEFORE IT IS READ. `setTime` marks the dynamic
       image dirty; the engine redraws it on the next frame. Reading immediately therefore sampled
       whatever was last drawn — the END of the run. That was harmless while the picture was a box
       round the epicentre (the source is still the brightest row three hours later) and is not
       harmless now the picture is the whole planet: measured, the brightest row of the t=3 h global
       field is 38.7° from the epicentre, which is the failure this comment replaces. */
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    /* ⚠ (#R197) THE ROW WITH THE STRONGEST PIXEL, NOT THE ROW WITH THE MOST INK. Both find the uplift
       while the picture is a box round the epicentre. On the GLOBAL picture they disagree, and the
       sum is the one that is wrong: Okada's far tail is evaluated inside a window measured in METRES
       (±4,326 km for an M9.1), so at 77°N that window spans ±156° of LONGITUDE against ±49° at the
       epicentre's own latitude. A thousand columns of one-centimetre tail out-sum two hundred columns
       of nine-metre uplift, and the measured answer was 76.98°N — 38.7° from the source. The peak of
       the co-seismic displacement is a maximum, so it is found by taking a maximum. */
    let best = -1; const rowMax = [];
    for (let y = 0; y < cv.height; y++) {
      let s = 0;
      for (let x = 0; x < cv.width; x++) { const a = d[(y * cv.width + x) * 4 + 3]; if (a > s) s = a; }
      rowMax.push(s); if (s > best) best = s;
    }
    /* ⚠ AND THE MIDDLE OF THE PLATEAU, NOT ITS FIRST ROW. The colour ramp SATURATES: the core of a
       nine-metre uplift is a band of rows that all reach the same alpha, so "the first row equal to
       the maximum" is the NORTHERN EDGE of the source — measured 3.37° from the epicentre. The
       displacement is symmetric about the fault, so the midpoint of the saturated band is the thing
       being looked for. */
    const hit = []; for (let y = 0; y < rowMax.length; y++) if (rowMax[y] >= best) hit.push(y);
    const bestRow = hit[(hit.length - 1) >> 1];
    /* …this test's own projection arithmetic, deliberately not the app's ── */
    const R = Math.PI / 180;
    const my = (la) => Math.log(Math.tan(Math.PI / 4 + la * R / 2));
    const iy = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / R;
    const n = Math.max(...c.map((p) => p[1])), s2 = Math.min(...c.map((p) => p[1]));
    const v = (bestRow + 0.5) / cv.height;
    return {
      w: cv.width, h: cv.height, north: n, south: s2, bestRow, opaque: best, sim: window.IntMapTsunami.state().sim,
      latMercator: iy(my(n) + (my(s2) - my(n)) * v),   /* where MapLibre actually draws that row */
      latGeographic: n + (s2 - n) * v,                 /* where #R193 believed it did */
    };
  });

  expect(r.err, 'the run produced a field').toBeFalsy();
  expect(r.opaque, 'the picture is not empty').toBeGreaterThan(0);
  /* the box is wide enough for the two readings to disagree — otherwise the test proves nothing */
  expect(Math.abs(r.latMercator - r.latGeographic)).toBeGreaterThan(4);
  /* ⚠ THE ASSERTION. The uplift is painted at the latitude the renderer will draw it at. One row of
     the picture is ~0.5° now (#R197: 1440 × 640 solved, decimated to 720 × 320 for the animation), so
     a degree is a little over two rows and 8° — the bug — is nowhere near. */
  expect(Math.abs(r.latMercator - 38.32), 'the co-seismic uplift is drawn at the epicentre').toBeLessThan(1.2);
  /* ⚠ (#R197) …and the texture is tall enough that Mercator compression skips no row of water. That
     used to be written `h >= w`, which was the same statement while the domain was a square box round
     the epicentre. The domain is the planet now — 360° wide against 160° tall — so the picture is
     legitimately wider than it is tall, and the property being pinned is the one chooseImgH() exists
     for: the texture has MORE rows than the field has, because Mercator needs them. */
  expect(r.h, 'the texture is taller than the field it draws').toBeGreaterThan(r.sim.fy);
  expect(r.w, 'and exactly as wide as the field, which needs no resampling').toBe(r.sim.fx);
});

test('R195 hover: one hit test per pointer move, with the delegation semantics unchanged', async ({ page }) => {
  test.setTimeout(120000);
  await ready(page);

  /* a layer of our own, covering the left half of the world, so the pointer provably crosses in
     and out of it regardless of which app layers this seat has enabled */
  await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    E.camera.jumpTo({ center: [0, 0], zoom: 1, pitch: 0 });
    E.layers.addSource('r195-src', { type: 'geojson', data: { type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[-170, -70], [-2, -70], [-2, 70], [-170, 70], [-170, -70]]] } } });
    E.layers.add({ id: 'r195-fill', type: 'fill', source: 'r195-src', paint: { 'fill-color': '#f00', 'fill-opacity': 0.25 } });
    window.__r195 = { log: [] };
    const L = window.__r195.log;
    window.__r195.h = {
      move: (e) => L.push(['move', e.features ? e.features.length : -1]),
      enter: (e) => L.push(['enter', e.features ? e.features.length : -1]),
      leave: (e) => L.push(['leave', e.features ? e.features.length : -1]),
    };
    E.events.onLayer('mousemove', 'r195-fill', window.__r195.h.move);
    E.events.onLayer('mouseenter', 'r195-fill', window.__r195.h.enter);
    E.events.onLayer('mouseleave', 'r195-fill', window.__r195.h.leave);
  });
  await page.waitForTimeout(1200);

  const box = await page.evaluate(() => {
    const r = window.__imap.getCanvas().getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  /* sweep left → right across the antimeridian of the polygon's eastern edge */
  for (let i = 0; i <= 24; i++) await page.mouse.move(box.x + 10 + i * (box.w - 20) / 24, box.y + box.h / 2);
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const L = window.__r195.log;
    return {
      moves: L.filter((x) => x[0] === 'move').length,
      enters: L.filter((x) => x[0] === 'enter').length,
      leaves: L.filter((x) => x[0] === 'leave').length,
      enterCarriesFeatures: L.filter((x) => x[0] === 'enter').every((x) => x[1] > 0),
      moveCarriesFeatures: L.filter((x) => x[0] === 'move').every((x) => x[1] > 0),
      leaveCarriesNone: L.filter((x) => x[0] === 'leave').every((x) => x[1] === -1),
      order: L.map((x) => x[0]).join(',').replace(/(^|,)move(,move)+/g, '$1move…'),
      /* the mechanism is genuinely in use: the renderer holds no hover delegation of its own */
      rendererHoverDelegates: ['mousemove', 'mouseenter', 'mouseleave']
        .reduce((a, k) => a + (((window.__imap._delegatedListeners || {})[k]) || []).length, 0),
    };
  });

  expect(r.moves, 'the pointer was over the layer and said so').toBeGreaterThan(3);
  expect(r.enters, 'entered exactly once on the way in').toBe(1);
  expect(r.leaves, 'left exactly once on the way out').toBe(1);
  expect(r.enterCarriesFeatures).toBe(true);
  expect(r.moveCarriesFeatures).toBe(true);
  expect(r.leaveCarriesNone).toBe(true);
  expect(r.order.startsWith('enter,move')).toBe(true);
  expect(r.order.endsWith('leave')).toBe(true);
  expect(r.rendererHoverDelegates, 'no per-layer hover handler is left with the renderer').toBe(0);

  /* off() detaches: nothing more arrives */
  const after = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, h = window.__r195.h;
    E.events.offLayer('mousemove', 'r195-fill', h.move);
    E.events.offLayer('mouseenter', 'r195-fill', h.enter);
    E.events.offLayer('mouseleave', 'r195-fill', h.leave);
    window.__r195.log.length = 0;
    return 0;
  });
  expect(after).toBe(0);
  for (let i = 0; i <= 8; i++) await page.mouse.move(box.x + 10 + i * (box.w - 20) / 8, box.y + box.h / 2 + 4);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__r195.log.length), 'detached handlers stay detached').toBe(0);
});
