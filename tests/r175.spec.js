// R175 behavioural checks in a real browser, against the BUILT site (playwright.config.js builds
// first and serves dist/). Every number below was produced by running the failing version first.
//
//   1. with the tilt ceiling lifted, zooming in actually descends — at any tilt, including past 90°
//   2. the hover tooltip never leaves the map, however tall it is and wherever the pointer is
//   3. clicking an aircraft opens the detail card, and its button flies from that aircraft's own
//      position / altitude / heading / airspeed
//   4. the Vite bundle boots the same app: every module present, every vendor global republished
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);   /* (#R212) the style is already loaded — this tail was 1.5 s in 20 specs */
};

/* ── ① the reported bug ─────────────────────────────────────────────────────────────────────
   「Unlimited map tiltにした場合、ある程度からズームインできない。」 #R174 answered this by freezing
   the eye-anchor solve at the applied zoom, which fixed the pitch-60 case it measured and left the
   real one alone: after ANY tilt the look-at target sits in the sky, and a frozen sky target is what
   the camera converges on. Measured on the failing build, wheel-zooming 2.3 levels from z12/Tokyo:
   pitch 85 → the eye crawled 8,373 → 7,205 m and stopped (target frozen at 6,914 m);
   pitch 110 → the eye CLIMBED 8,373 → 12,955 m, i.e. zooming in moved away from the ground. */
for (const pitch of [85, 110]) {
  test(`with unlimited tilt at ${pitch}°, zooming in descends like an untilted map`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    const r = await page.evaluate(async (targetPitch) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const m = window.__imap, GE = window.IntMapGeoEngine;
      window.IntMapTilt.set(true); await wait(300);
      GE.camera.setCenterClamped(true);
      m.jumpTo({ center: [139.767, 35.68], zoom: 12, pitch: 60, bearing: 0 }); await wait(400);
      GE.camera.setCenterClamped(false); await wait(200);
      const start = GE.camera.eye().alt;
      for (let p = 62; p <= targetPitch; p += 6) { m.setPitch(Math.min(p, targetPitch)); await wait(60); }
      m.setPitch(targetPitch); await wait(400);
      const tilted = GE.camera.eye().alt, z0 = m.getZoom();
      const cv = m.getCanvas(), b = cv.getBoundingClientRect();
      for (let i = 0; i < 5; i++) {
        cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true }));
        await wait(420);
      }
      const zoomed = GE.camera.eye().alt, z1 = m.getZoom();
      // and tilting again at the new zoom must still leave the viewpoint exactly put (#R172's promise)
      const beforeRetilt = GE.camera.eye().alt;
      m.setPitch(targetPitch === 85 ? 70 : 130); await wait(500);
      const afterRetilt = GE.camera.eye().alt;
      return { start, tilted, zoomed, z0, z1, beforeRetilt, afterRetilt };
    }, pitch);

    expect(Math.abs(r.tilted - r.start), 'tilting still does not move the viewpoint').toBeLessThan(5);
    // a dolly: the eye scales with the look distance, exactly as an untilted map does
    const expected = r.start * Math.pow(2, r.z0 - r.z1);
    expect(r.z1 - r.z0, 'the wheel really zoomed').toBeGreaterThan(1.5);
    expect(r.zoomed).toBeLessThan(r.tilted * 0.5);            // it descends, and substantially
    expect(Math.abs(r.zoomed - expected) / expected, 'and by the same factor the distance changed').toBeLessThan(0.05);
    expect(Math.abs(r.afterRetilt - r.beforeRetilt), 'the eye anchor survives the zoom').toBeLessThan(5);
  });
}

/* ── ② 「ホバー時に出るポップアップは、画面外に出ないように」 ───────────────────────────────── */
test('a tall hover tooltip stays inside the map wherever the pointer is', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const res = await page.evaluate(() => {
    const el = window.ensureMapTooltip(), mc = document.getElementById('map-container');
    el.innerHTML = '<div style="font-weight:700;font-size:13px;">✈ TEST123</div>' +
      Array.from({ length: 22 }, (_, i) => `<div style="font-size:11px;margin-top:2px;">row ${i}: value</div>`).join('');
    el.style.display = 'block';
    const r = mc.getBoundingClientRect();
    const cases = [['top-left', 20, 20], ['top-mid', r.width / 2, 40], ['top-right', r.width - 20, 30],
      ['middle', r.width / 2, r.height / 2], ['bottom', r.width / 2, r.height - 30],
      ['bottom-right', r.width - 10, r.height - 10], ['left-edge', 4, r.height / 2]];
    const out = [];
    for (const [name, x, y] of cases) {
      window.positionTooltip({ x, y });
      const b = el.getBoundingClientRect();
      out.push({ name, l: b.left - r.left, t: b.top - r.top, rt: b.right - r.left, bt: b.bottom - r.top,
        below: el.classList.contains('map-tooltip-below') });
    }
    const h = el.offsetHeight;
    el.style.display = 'none';
    return { out, h, w: r.width, hh: r.height };
  });
  expect(res.h, 'the tooltip really is taller than the old 160 px floor allowed for').toBeGreaterThan(200);
  for (const c of res.out) {
    expect(c.t, `${c.name}: top edge on screen (the old clamp put it at -158)`).toBeGreaterThanOrEqual(-0.5);
    expect(c.l, `${c.name}: left edge on screen`).toBeGreaterThanOrEqual(-0.5);
    expect(c.rt, `${c.name}: right edge on screen`).toBeLessThanOrEqual(res.w + 0.5);
    expect(c.bt, `${c.name}: bottom edge on screen`).toBeLessThanOrEqual(res.hh + 0.5);
  }
  expect(res.out.find(c => c.name === 'top-left').below, 'near the top it flips below the anchor').toBe(true);
  expect(res.out.find(c => c.name === 'middle').below, 'with room above it keeps the original look').toBe(false);
});

/* ── ③ the aircraft detail card, driven off a STUBBED feed so the test never depends on what is
       actually flying over Tokyo (or on airplanes.live being reachable from CI). */
test('clicking an aircraft opens its card, and the card flies from its own conditions', async ({ page }) => {
  test.setTimeout(180000);
  await page.route('**/api.airplanes.live/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ now: Date.now(), ac: [{
      hex: 'abc123', flight: 'TEST123 ', r: 'JA-TEST', t: 'B738', desc: 'BOEING 737-800',
      /* feet, as the feed reports them: 20,000 ft = 6,096 m. Deliberately far from BOTH numbers a
         broken hand-off would produce — the simulator's 2,500 m default and its 1,500 m spawn lift. */
      lat: 35.68, lon: 139.767, alt_baro: 19500, alt_geom: 20000, gs: 260, ias: 240, tas: 300, mach: 0.62,
      track: 90, true_heading: 92, mag_heading: 85, baro_rate: -600, squawk: '1234', category: 'A0',
      oat: -20, nav_qnh: 1013, roll: 1.2, wd: 270, ws: 40, rssi: -8.5, messages: 4242, seen: 0.2, type: 'adsb_icao',
    }] }),
  }));
  await page.route('**/api.planespotters.net/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [] }),
  }));
  await boot(page);
  /* (#R209) the card's Fly button hands over to `window.IntMapFlightSim`, and js/flight-sim.js is no
     longer in the boot bundle — it arrives when a door asks for it. js/aircraft-detail.js awaits
     `IntMapLazy.need('flightSim')` on the click; this test reads `FS._st()` straight afterwards, so
     it asks for the module the way the app does rather than waiting longer for a global that would
     never appear on its own. What the flight is asserted to start FROM is untouched. */
  await loadLazyModules(page);

  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__imap.jumpTo({ center: [139.767, 35.68], zoom: 10.5, pitch: 0, bearing: 0 });
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    for (let i = 0; i < 40; i++) { await wait(400); if (window.IntMapPlanes3D.state().planes) break; }
  });
  await page.waitForFunction(() => window.IntMapPlanes3D.state().planes > 0, null, { timeout: 60000 });

  const card = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const m = window.__imap, P3 = window.IntMapPlanes3D;
    const pt = P3.screenPos('ABC123'); if (!pt) return { err: 'aircraft not drawn' };
    const cv = m.getCanvas(), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + pt.x, clientY: r.top + pt.y, bubbles: true, cancelable: true, view: window, detail: 1 }));
    await wait(1200);
    const P = window.IntMapAircraftPanel, b = document.getElementById('acp-body');
    return {
      open: P.isOpen(), forId: P.current(), selected: P3.selected(),
      title: (document.getElementById('acp-title') || {}).textContent,
      rows: [...b.querySelectorAll('.acp-row')].map(x => x.querySelector('.acp-k').textContent + '=' + x.querySelector('.acp-v').textContent),
      noPhoto: !!b.querySelector('.acp-photo-none'),
      fly: (b.querySelector('.acp-fly-s') || {}).textContent,
      ic: P.initialConditions(P.__cur || { lng: 139.767, lat: 35.68, geoAlt: 6096, tas: 300, trueHdg: 92, desc: 'BOEING 737-800', acType: 'B738', category: 'A0', type: 'civilian' }),
    };
  });

  expect(card.open, 'the click opened the detail card').toBe(true);
  expect(card.forId).toBe('ABC123');
  expect(card.selected, 'and selected the aircraft, so its track is drawn').toBe('ABC123');
  expect(card.title).toContain('TEST123');
  expect(card.noPhoto, 'no photo for this airframe → it says so rather than showing someone else’s').toBe(true);
  const rows = card.rows.join('\n');
  expect(rows).toContain('BOEING 737-800');
  expect(rows).toContain('JA-TEST');
  expect(rows, 'the fields the tooltip never had room for').toMatch(/240 kn/);      // IAS
  expect(rows).toMatch(/M 0\.620/);                                                  // Mach
  expect(rows).toMatch(/-20 °C/);                                                    // OAT
  expect(rows).toMatch(/270° 40 kn/);                                                // wind at the aircraft
  expect(rows, 'A0 means "no information" — it is not printed as a fact').not.toMatch(/A0/);
  expect(card.ic.key, 'a 737 flies as the airliner, not the trainer').toBe('airliner');

  // the button: a real flight, from this aircraft's own numbers
  const flown = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#acp-body .acp-fly').click();
    await wait(2500);
    const FS = window.IntMapFlightSim, st = FS._st();
    return { active: FS.active(), cardClosed: !window.IntMapAircraftPanel.isOpen(),
      alt: st && st.alt, hdg: st && (st.psi * 180 / Math.PI), V: st && st.V, keepAlt: st && !!st._keepAlt,
      lng: st && st.lng, lat: st && st.lat };
  });
  expect(flown.active, 'the simulator started').toBe(true);
  expect(flown.cardClosed).toBe(true);
  expect(flown.keepAlt, 'the caller supplied the altitude, so the +1,500 m spawn lift is opted out of').toBe(true);
  /* the feed reports FEET (alt_geom: 20,000 ft = 6,096 m) — the flight starts at the aircraft's real
     altitude in metres, and specifically NOT at the simulator's 1,500 m airborne spawn clearance nor
     at its 2,500 m default, which are the two numbers a broken hand-off would land on. */
  expect(flown.alt, 'at the aircraft’s own GPS altitude, 20,000 ft = 6,096 m').toBeGreaterThan(5900);
  expect(flown.alt).toBeLessThan(6300);
  expect(flown.hdg, 'on its own true heading').toBeGreaterThan(88);
  expect(flown.hdg).toBeLessThan(96);
  expect(Math.abs(flown.lng - 139.767)).toBeLessThan(0.2);
  await page.evaluate(() => window.IntMapFlightSim.stop());
});

/* ── ④ the build ships the same app ─────────────────────────────────────────────────────── */
test('the Vite bundle boots the whole app', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await boot(page);
  const s = await page.evaluate(() => ({
    modules: window.__imModuleCheck,
    vendor: { maplibregl: typeof window.maplibregl, mlcontour: typeof window.mlcontour, turf: typeof window.turf,
      topojson: typeof window.topojson, supabase: typeof window.supabase, sb: !!window.sb },
    intMapGlobals: Object.keys(window).filter(k => /^IntMap/.test(k)).length,
    build: window.INTMAP_BUILD,
  }));
  expect(s.modules.missing, 'no required global is missing from the bundle').toEqual([]);
  expect(s.modules.missingFactories, 'no module factory is missing from the bundle').toEqual([]);
  expect(s.vendor).toEqual({ maplibregl: 'object', mlcontour: 'object', turf: 'object', topojson: 'object', supabase: 'object', sb: true });
  expect(s.intMapGlobals, 'the whole IntMap surface is published').toBeGreaterThan(75);
  // (#R176) What this line is checking is that the bundle carries the stamp at all — pinning the round
  // that happened to be current when it was written makes it fail on every subsequent round instead.
  // The exact value is pinned once, in that round's own checks file.
  expect(s.build, 'the bundle carries a dated round stamp').toMatch(/^\d{4}-\d{2}-\d{2}-R\d+$/);
  expect(errors, 'the built page throws nothing on boot').toEqual([]);
  // the lazy chunks arrive without blocking boot
  await page.waitForFunction(() => typeof window.katex === 'object' && typeof window.html2canvas === 'function', null, { timeout: 30000 });
});
