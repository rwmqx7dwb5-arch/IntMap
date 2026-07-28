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

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
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
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.66, lat: 35.30, alt: 3500, hdg: 90 }));
  await page.waitForTimeout(9000);
  /* (#R173) PAUSE before the heavy reads. What is asserted is a property of the frame on screen, and a
     paused cockpit stops rewriting the camera every frame — on a GPU-less runner that was the difference
     between seven minutes and seconds. */
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', bubbles: true })); });
  await page.waitForTimeout(2500);

  const during = await page.evaluate(() => ({
    active: window.IntMapFlightSim.active(),
    zoom: window.__imap.getZoom(),
    proj: JSON.stringify(window.__imap.getProjection()),
    terrain: !!window.__imap.getTerrain(),
  }));
  expect(during.active).toBe(true);
  expect(during.proj, 'the sim flies the app Globe — never a raw projection spec').toContain('globe');
  expect(during.terrain, 'a flight simulator without a DEM has nothing to fly over').toBe(true);
  /* (#R173) …and it no longer has to choose. The cockpit flies below the globe→mercator crossover now
     (the look distance is solved on the sphere rather than pinned at 1.8 km), so the zoom assertion is
     inverted — what this test is really for is the pixel count below, which is what #R171 lost. */
  expect(during.zoom).toBeLessThan(11.1);

  const vp = page.viewportSize();
  const colours = await groundDetail(page, { x: Math.round(vp.width * 0.30), y: Math.round(vp.height * 0.62),
    width: Math.round(vp.width * 0.30), height: Math.round(vp.height * 0.20) });
  // Measured on the restored build: hundreds of distinct binned colours of terrain and imagery in this
  // patch. The #R171 cockpit was a single fog colour with the HUD over it, which counts about three.
  expect(colours, 'the lower half of the cockpit must contain real ground').toBeGreaterThan(40);

  // …and the engine refuses to go back to the projection that blanked it
  const refused = await page.evaluate(() => window.IntMapGeoEngine.camera.setProjection('globe-true'));
  expect(refused, 'the contract declines what it cannot honour').toBe(false);

  await page.evaluate(() => window.IntMapFlightSim.stop());
  await page.waitForTimeout(1500);
});

test('with unlimited tilt the VIEWPOINT does not move — and standard tilt is untouched', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const eye = () => page.evaluate(() => {
    const e = window.IntMapGeoEngine.camera.eye(), m = window.__imap;
    return { lng: e.lng, lat: e.lat, alt: e.alt, pitch: m.getPitch(), zoom: m.getZoom() };
  });
  const drag = async () => {
    await page.keyboard.down('Control');
    await page.mouse.move(700, 500); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(700, 500 - i * 18); await page.waitForTimeout(35); }
    await page.mouse.up(); await page.keyboard.up('Control');
    await page.waitForTimeout(1000);
  };
  const move = (a, b) => Math.hypot((b.lng - a.lng) * 90000, (b.lat - a.lat) * 110574);

  // STANDARD — MapLibre orbits the eye around the map centre. That behaviour must not change.
  await page.evaluate(() => { window.IntMapTilt.set(false); window.__imap.jumpTo({ center: [139.7, 35.68], zoom: 12, pitch: 40, bearing: 0 }); });
  await page.waitForTimeout(900);
  const s0 = await eye(); await drag(); const s1 = await eye();
  expect(s1.pitch, 'the standard ceiling still stops at 78°').toBeLessThanOrEqual(78.5);
  expect(move(s0, s1), 'standard tilt keeps orbiting, exactly as before').toBeGreaterThan(1000);

  // UNLIMITED — the camera turns its head; the viewpoint stays where it is.
  await page.evaluate(() => { window.IntMapTilt.set(true); window.__imap.jumpTo({ center: [139.7, 35.68], zoom: 12, pitch: 40, bearing: 0 }); });
  await page.waitForTimeout(900);
  const u0 = await eye(); await drag(); const u1 = await eye();
  expect(u1.pitch, 'the ceiling really is lifted past the horizon').toBeGreaterThan(90);
  expect(move(u0, u1), 'the viewpoint must not move at all — measured 0 m over a 40°→150° drag').toBeLessThan(150);
  expect(Math.abs(u1.alt - u0.alt), 'nor its altitude').toBeLessThan(150);
  expect(Math.abs(u1.zoom - u0.zoom), 'nor the scale').toBeLessThan(0.05);

  // …and a flyTo that also travels still lands on its target (the pivot must not hijack a journey)
  await page.evaluate(() => window.__imap.flyTo({ center: [2.35, 48.85], zoom: 9, pitch: 55, bearing: 20, duration: 600 }));
  await page.waitForTimeout(2000);
  const paris = await page.evaluate(() => { const c = window.__imap.getCenter(); return { lng: +c.lng.toFixed(3), lat: +c.lat.toFixed(3) }; });
  expect(paris).toEqual({ lng: 2.35, lat: 48.85 });
});

test('the 3-D volume is a closed body, has no altitude ceiling, and takes a unit', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('btn-tool-volume').click());
  await page.waitForTimeout(800);

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
  expect(st.solid, 'the body is closed by default').toBe(true);
  // (#R173) the closed body is now ONE mesh drawn by the engine's solid contract — a floor and a filled
  // interior that a fill-extrusion cannot express — so what is asserted is that the solid is what draws.
  expect(st.canSolid, 'the renderer can draw a closed body').toBe(true);
  expect(st.body, 'and it is the closed body that is painted').toBe(true);
  expect(st.shell, 'the open shell is not painted at the same time').toBe(false);
  expect(st.asKm, '1000 m is 1 km').toBe(1);
  expect(st.asFt, '1000 m is 3281 ft').toBe(3281);
  expect(st.geo, 'a 35,786 km band is not clamped away').toEqual([35786000, 35800000]);
  expect(st.limits.max).toBeGreaterThan(1e8);

  // turning the body off leaves only the shell
  const hollow = await page.evaluate(() => { window.IntMapVolume3D.setSolid(false); return window.IntMapVolume3D.state(); });
  expect(hollow.body, 'Solid off puts the closed body away…').toBe(false);
  expect(hollow.shell, '…and leaves the open shell').toBe(true);
});

test('every footprint shape draws, not only the polygon', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => { window.__imap.jumpTo({ center: [138.73, 35.36], zoom: 11, pitch: 55, bearing: 20 }); document.getElementById('btn-tool-volume').click(); });
  await page.waitForTimeout(1200);

  const out = {};
  for (const kind of ['circle', 'rect', 'freehand']) {
    await page.evaluate(k => { document.querySelector(`.v3d-shape[data-shape="${k}"]`).click(); }, kind);
    await page.waitForTimeout(400);
    await page.mouse.move(660, 470); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(660 + i * 13, 470 + i * 7); await page.waitForTimeout(40); }
    await page.mouse.up(); await page.waitForTimeout(900);
    out[kind] = await page.evaluate(() => { const s = window.IntMapVolume3D.state(); return { pts: s.points, area: Math.round(s.areaM2), painted: s.painted, shape: s.shape }; });
  }
  // polygon last, by clicking vertices
  await page.evaluate(() => { document.querySelector('.v3d-shape[data-shape="polygon"]').click(); });
  await page.waitForTimeout(400);
  for (const [x, y] of [[600, 430], [800, 430], [720, 560]]) { await page.mouse.click(x, y); await page.waitForTimeout(300); }
  await page.waitForTimeout(800);
  out.polygon = await page.evaluate(() => { const s = window.IntMapVolume3D.state(); return { pts: s.points, area: Math.round(s.areaM2), painted: s.painted, shape: s.shape }; });

  for (const k of ['circle', 'rect', 'freehand', 'polygon']) {
    expect(out[k].shape, `${k} must be the active shape`).toBe(k);
    expect(out[k].pts, `${k} must produce a footprint`).toBeGreaterThanOrEqual(3);
    expect(out[k].area, `${k} must enclose real ground`).toBeGreaterThan(0);
    expect(out[k].painted, `${k} must reach the renderer`).toBe(true);
  }
});

test('live aircraft stand at their reported altitude', async ({ page }) => {
  test.setTimeout(180000);
  /* A STUBBED ADS-B feed (#R170b): three aircraft with known altitudes, so the assertion is about
     OUR geometry rather than about who is flying over Frankfurt right now. alt_baro/alt_geom are
     feet in the real API; 36,000 ft = 10,972.8 m. */
  await page.route('**/api.airplanes.live/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ now: Date.now(), ac: [
      { hex: 'aaa111', flight: 'TEST001 ', lat: 50.03, lon: 8.57, alt_baro: 36000, alt_geom: 36000, gs: 450, track: 90, t: 'A320' },
      { hex: 'bbb222', flight: 'TEST002 ', lat: 50.10, lon: 8.60, alt_baro: 4000, alt_geom: 4000, gs: 210, track: 270, t: 'B738' },
      { hex: 'ccc333', flight: 'TEST003 ', lat: 50.05, lon: 8.50, alt_baro: 'ground', gs: 12, track: 0, t: 'E190' },
    ] }),
  }));
  await boot(page);
  await page.evaluate(() => window.__imap.jumpTo({ center: [8.57, 50.03], zoom: 9, pitch: 70, bearing: 0 }));
  await page.waitForTimeout(1200);
  const enabled = await page.evaluate(() => {
    const cb = document.querySelector('.geo-layer-cb[data-layer="planes"]') || document.getElementById('dl-planes');
    if (!cb) return false;
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  });
  expect(enabled, 'the aircraft layer has a checkbox to turn on').toBe(true);
  await page.waitForFunction(() => { try { return window.IntMapPlanes3D.state().features > 0; } catch (_) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  const s = await page.evaluate(() => window.IntMapPlanes3D.state());
  expect(s.on, 'lifted aircraft are the default').toBe(true);
  expect(s.visible, 'the 3-D layer is the visible one').toBe(true);
  expect(s.flatVisible, 'and the flat glyphs are not — one representation at a time').toBe(false);
  expect(s.planes).toBe(3);
  expect(s.lifted, 'two are airborne; the third is on the ground and stays on it').toBe(2);
  expect(s.maxAlt, '36,000 ft = 10,973 m').toBeGreaterThan(10900);
  expect(s.maxAlt).toBeLessThan(11050);
  // bodies + posts: 3 aircraft, 2 of them with a post down to the ground
  expect(s.features).toBe(5);

  // the flat rendering is still one click away, and it is exclusive
  const flat = await page.evaluate(() => { window.IntMapPlanes3D.set(false); return window.IntMapPlanes3D.state(); });
  expect(flat.visible).toBe(false);
  expect(flat.flatVisible).toBe(true);
});
