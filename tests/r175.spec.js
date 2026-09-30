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
import { publishedGlobals, lazyFiles, jsFiles } from './app-source.mjs';
import { STAMP_RE } from '../scripts/build-stamp.mjs';

/* ══ (#R304) 「THE WHOLE INTMAP SURFACE IS PUBLISHED」, SAID AS THE SURFACE RATHER THAN A COUNT ══
   ④ below asserted `Object.keys(window).filter(/^IntMap/).length > 75`, and the figure went under
   75 the moment #R224 and #R291 moved the Atlas kernel and the directions panel behind
   js/lazy-modules.js — correctly, on purpose. The nightly deep run has been red for it ever since,
   and a count never said WHICH global anyway: seventy-six of the wrong ones would have passed.
   The claim the test's title actually makes is that the BUILT bundle ships the same app, so that
   is what it asks: every global an eager factory publishes is on `window` after boot. The files
   the loader fetches on demand are removed here and asserted in tests/r209.spec.js instead. */
const R175_ROOT = new URL('../', import.meta.url);
const EAGER_GLOBALS = (() => {
  const lazy = new Set(lazyFiles(R175_ROOT));
  const t = publishedGlobals(R175_ROOT, jsFiles(R175_ROOT).filter((f) => !lazy.has(f)));
  return [...new Set(Object.values(t).flatMap((f) => Object.values(f).flat()))]
    .filter((g) => /^IntMap/.test(g)).sort();
})();

/* (remove-synthetic-planes) `query` was how the aircraft test in this file pinned the airplanes.live
   sweep (`?aviation=v1`). That path and its test are removed; the parameter stays because boot() is
   this file's one door to the page, and no remaining test passes one. */
const boot = async (page, query) => {
  await page.goto('/index.html' + (query || ''), { waitUntil: 'domcontentloaded' });
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

/* ⚠ (remove-synthetic-planes) THE AIRCRAFT TEST THAT STOOD HERE BOOTED `?aviation=v1` — the per-browser
   airplanes.live sweep and its two MapLibre renderings (`lyr-planes`, `lyr-planes-3d`), with that
   host stubbed. The sweep is removed with its provider (HTTP 403 to every request since #R341), and
   so are the layers the test read; there is nothing left for it to boot. The aircraft layer is the
   GPU cloud now: the platform is gated by tests/r341.spec.js and tests/r379.spec.js, the card by
   tests/r352.spec.js, what the page does when the feed fails by
   tests/remove-synthetic-planes-checks.test.mjs, and live aircraft by tests/r341-live.spec.js. */

/* ── ④ the build ships the same app ─────────────────────────────────────────────────────── */
test('the Vite bundle boots the whole app', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await boot(page);
  const s = await page.evaluate((EAGER) => ({
    modules: window.__imModuleCheck,
    vendor: { maplibregl: typeof window.maplibregl, mlcontour: typeof window.mlcontour, turf: typeof window.turf,
      topojson: typeof window.topojson, supabase: typeof window.supabase, sb: !!window.sb },
    missingEager: EAGER.filter((g) => typeof window[g] === 'undefined'),
    build: window.INTMAP_BUILD,
  }), EAGER_GLOBALS);
  expect(s.modules.missing, 'no required global is missing from the bundle').toEqual([]);
  expect(s.modules.missingFactories, 'no module factory is missing from the bundle').toEqual([]);
  expect(s.vendor).toEqual({ maplibregl: 'object', mlcontour: 'object', turf: 'object', topojson: 'object', supabase: 'object', sb: true });
  expect(EAGER_GLOBALS.length, 'the eager surface was derived from js/, not from nothing').toBeGreaterThan(50);
  expect(s.missingEager, 'the whole eager IntMap surface is published by the built bundle').toEqual([]);
  // (#R176) What this line is checking is that the bundle carries the stamp at all — pinning the round
  // that happened to be current when it was written makes it fail on every subsequent round instead.
  // (2026-09-25) The build writes it from the commit being built (scripts/build-stamp.mjs); the shape
  // is that module's own STAMP_RE, and a page served with the token unfilled fails here.
  expect(s.build, 'the built bundle carries the generated stamp').toMatch(STAMP_RE);
  expect(errors, 'the built page throws nothing on boot').toEqual([]);
  /* ══ ⚠⚠ (#R304) THEY DO NOT ARRIVE ANY MORE, AND THAT IS THE POINT OF THE ROUND THAT CHANGED IT ══
     This waited 30 s for `window.katex` and `window.html2canvas` to turn up on their own. src/vendor.js
     later keyed both to their FIRST USE — memoised dynamic imports behind `window.IntMapVendor` —
     because they were 258 kB and 198 kB arriving at t = 1.04 s on a phone «for two features most
     sessions never touch»: html2canvas runs when the reader presses 📷 Screenshot, katex when an Atlas
     answer contains LaTeX. So the honest claim is the stronger one that file makes: absent until first
     use, present after it, never half-loaded. The nightly deep run has been red on this line ever since. */
  const vendor = await page.evaluate(async () => {
    const before = { katex: typeof window.katex, html2canvas: typeof window.html2canvas };
    const h = await window.IntMapVendor.html2canvas();
    const k = await window.IntMapVendor.katex();
    return { before, after: { katex: typeof window.katex, html2canvas: typeof window.html2canvas },
      same: { katex: k === window.katex, html2canvas: h === window.html2canvas } };
  });
  expect(vendor.before, 'neither heavy library is on the boot path').toEqual({ katex: 'undefined', html2canvas: 'undefined' });
  expect(vendor.after.html2canvas, 'html2canvas arrives when its first use asks for it').toBe('function');
  expect(vendor.after.katex, 'and so does KaTeX').toBe('object');
  expect(vendor.same, 'and each promise resolves to the library it published').toEqual({ katex: true, html2canvas: true });
});
