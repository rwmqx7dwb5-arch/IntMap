// R177 behavioural checks in a real browser, against the BUILT site (playwright.config.js builds
// first and serves dist/). Every number quoted below was produced by running the failing version
// first — these are regressions, not aspirations.
//
//   1. with the tilt ceiling lifted the viewpoint does not move — on the SPHERE as well as the plane
//   2. …and the thing that measures it does not share an equation with the thing that fixes it
//   3. a zoom is still a dolly at every tilt (#R175 must survive)
//   4. a journey still arrives where it was sent (#R173 must survive)
//   5. standard tilt is untouched — the hook is not even installed
//   6. the anchor never hands the renderer a camera it cannot hold
import { test, expect } from '@playwright/test';
import { installCameraRuler } from './helpers/camera-ruler.js';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* ⚠ (#R197) THE VIEWPOINT SWEEP THAT WAS HERE IS GONE — 「何重にもテストとか意味がない」.
   r177 swept 7 cases for viewpoint hold; #R175's dolly guard survives in r179.
   Five files swept the same invariant — "tilting does not move the viewpoint" — because it was
   re-reported five rounds running, and each round added its own sweep instead of extending the one
   before it. tests/r179.spec.js now carries all of them: it drives a REAL POINTER DRAG rather than
   the API (and #R179 is the round that found the API path was never the broken one), it covers both
   projections from z1.7 to z18 plus the 69°N case that used to live in tests/r177, and it asserts
   drift, inter-frame stepping, inertia, tilt saturation and the 90° crossing in one place.
   The copies were DELETED, not skipped: a disabled test is a slower test that proves nothing. */


/* ⚠ (#R197) THE VIEWPOINT SWEEP THAT WAS HERE IS GONE — 「何重にもテストとか意味がない」.
   r177 swept 7 cases for stepping through 0-180°.
   Five files swept the same invariant — "tilting does not move the viewpoint" — because it was
   re-reported five rounds running, and each round added its own sweep instead of extending the one
   before it. tests/r179.spec.js now carries all of them: it drives a REAL POINTER DRAG rather than
   the API (and #R179 is the round that found the API path was never the broken one), it covers both
   projections from z1.7 to z18 plus the 69°N case that used to live in tests/r177, and it asserts
   drift, inter-frame stepping, inertia, tilt saturation and the 90° crossing in one place.
   The copies were DELETED, not skipped: a disabled test is a slower test that proves nothing. */


/* ── ② the readout's viewpoint IS the renderer's viewpoint ──────────────────────────────────────
   camera.eye() feeds the always-on 「視点」 chip, the 3-D solid shader's camera, and the tilt
   anchor. Checking it against the draw matrix is what makes the anchor's own test independent:
   if this passes, the two can never silently share an error again. */
test('camera.eye() agrees with the matrix the renderer draws with', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(installCameraRuler);
  const rows = [];
  for (const proj of ['globe', 'mercator'])
    for (const z of [3, 6, 12])
      for (const [p, b] of [[0, 0], [45, 0], [45, 90], [80, 200]]) {
        rows.push(await page.evaluate(async (s) => {
          const m = window.__imap;
          window.IntMapTilt.set(true);
          window.IntMapGeoEngine.camera.setTiltPivot('target');   // land exactly where asked
          m.setProjection({ type: s.proj });
          m.jumpTo({ center: [139.767, 35.681], zoom: s.z, pitch: s.p, bearing: s.b });
          await new Promise(r => setTimeout(r, 150));
          const T = window.__eye(), G = window.IntMapGeoEngine.camera.eye();
          return { tag: `${s.proj} z${s.z} p${s.p} b${s.b}`, space: T.space, err: G ? window.__gap(T, G) : 1e12,
                   alt: Math.round(T.alt) };
        }, { proj, z, p, b }));
      }
  for (const r of rows) expect(r.err, `${r.tag} [${r.space}] eye altitude ${r.alt} m`).toBeLessThan(1);
  expect(rows.some(r => r.space === 'sphere'), 'the sphere model was exercised').toBe(true);
  expect(rows.some(r => r.space === 'merc'), 'the mercator model was exercised').toBe(true);
});

/* ── ③ #R175 must survive: a zoom is a DOLLY at every tilt ──────────────────────────────────── */
test('a zoom is still a dolly at every tilt (#R175)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(installCameraRuler);
  const rows = await page.evaluate(async () => {
    const m = window.__imap, el = m.getCanvasContainer();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const out = [];
    for (const pitch of [0, 60, 85, 110, 150]) {
      window.IntMapTilt.set(false);
      m.setProjection({ type: 'mercator' });
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      window.IntMapTilt.set(true);
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      m.setPitch(pitch); await wait(250);
      const z0 = m.getZoom(), a0 = window.__eye().alt;
      for (let i = 0; i < 4; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await wait(320);
      }
      out.push({ pitch, ratio: window.__eye().alt / a0, expect: Math.pow(2, z0 - m.getZoom()) });
    }
    return out;
  });
  for (const r of rows) {
    expect(r.expect, `zoom really changed at pitch ${r.pitch}`).toBeLessThan(0.9);
    expect(Math.abs(r.ratio - r.expect), `pitch ${r.pitch}: eye ratio ${r.ratio} vs zoom ratio ${r.expect}`).toBeLessThan(0.03);
  }
});

/* ── ④ #R173 must survive: a journey still arrives ──────────────────────────────────────────── */
test('a journey still lands where it was sent (#R173)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap;
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const km = (a, b) => { const D = Math.PI / 180, R = 6371008.8;
      const h = Math.sin((b.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin((b.lng - a.lng) * D / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
    window.IntMapTilt.set(true);
    m.setProjection({ type: 'mercator' });
    m.jumpTo({ center: [139.767, 35.681], zoom: 10, pitch: 0, bearing: 0 }); await wait(300);
    m.jumpTo({ center: [2.3522, 48.8566], zoom: 11, pitch: 55, bearing: 0 }); await wait(500);
    const jump = km(m.getCenter(), { lng: 2.3522, lat: 48.8566 });
    m.jumpTo({ center: [139.767, 35.681], zoom: 10, pitch: 0, bearing: 0 }); await wait(300);
    m.flyTo({ center: [2.3522, 48.8566], zoom: 11, pitch: 55, duration: 0 }); await wait(700);
    return { jump, fly: km(m.getCenter(), { lng: 2.3522, lat: 48.8566 }) };
  });
  expect(r.jump, 'jumpTo to Paris arrives at Paris').toBeLessThan(1000);
  expect(r.fly, 'flyTo to Paris arrives at Paris').toBeLessThan(1000);
});

/* ── ⑤ standard tilt is BYTE-IDENTICAL: the hook is not installed at all ────────────────────── */
test('standard tilt does not go through any of this', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap;
    window.IntMapTilt.set(false);
    await new Promise(res => setTimeout(res, 200));
    return { hook: m.transformCameraUpdate == null, ceiling: m.getMaxPitch() };
  });
  expect(r.hook, 'no transformCameraUpdate while the ceiling is standard').toBe(true);
  expect(r.ceiling).toBe(78);
});

/* ── ⑥ never hand the renderer a camera it cannot hold ──────────────────────────────────────
   Tilted past the horizon on the sphere, the pivot the eye implies leaves ±85.051° and the zoom
   that goes with it leaves the map's range. Forcing it answered z −0.167 at 85.0511°N — and the
   next camera change FROZE the page (not threw) inside MapLibre's tile cover. Plain MapLibre at the
   same pitch is fine, so that camera was ours. */
test('the anchor never emits a camera outside the renderer\'s range', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await Promise.race([
    page.evaluate(async () => {
      const m = window.__imap;
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.IntMapTilt.set(true);
      const seen = [];
      for (const s of [{ z: 6, p: 0, b: 0 }, { z: 6, p: 120, b: 45 }, { z: 12, p: 0, b: 0 },
                       { z: 3, p: 175, b: 0 }, { z: 15, p: 90, b: 300 }]) {
        m.setProjection({ type: 'globe' });
        m.jumpTo({ center: [139.767, 35.681], zoom: s.z, pitch: s.p, bearing: s.b });
        await wait(350);
        const t = m.transform, R = 6371008.8;
        const look = ((t.cameraToCenterDistance || 1080) / t.worldSize) * 2 * Math.PI * R * Math.cos(m.getCenter().lat * Math.PI / 180);
        seen.push({ tag: `z${s.z} p${s.p}`, zoom: m.getZoom(), lat: m.getCenter().lat,
                    elev: +m.getCameraTargetElevation() || 0, look,
                    sphere: !!t.isGlobeRendering });
      }
      return seen;
    }, null),
    new Promise(res => setTimeout(() => res('FROZE'), 60000)),
  ]);
  expect(r, 'the page must still be running').not.toBe('FROZE');
  for (const s of r) {
    expect(s.zoom, `${s.tag}: zoom ${s.zoom} in range`).toBeGreaterThanOrEqual(0);
    expect(s.zoom, `${s.tag}: zoom ${s.zoom} in range`).toBeLessThanOrEqual(19);
    expect(Math.abs(s.lat), `${s.tag}: centre latitude ${s.lat} in range`).toBeLessThanOrEqual(85.06);
    /* WHAT FROZE THE RENDERER was a target 1,488 km above sea level at z12 — 89 times the distance
       the camera was looking — because MapLibre sizes its frustum from
       `cameraToCenterDistance + elevation·pixelPerMeter / cos(pitch)`. The bound belongs on the model
       that USES the number: the mercator one. On the sphere the pivot is the surface point and the
       elevation moves nothing at all, so it is not constrained there — and it cannot be, because
       `isGlobeRendering` follows the RENDER, so the frame that crosses the zoom where the models swap
       is still solving as mercator when it writes it. */
    if (!s.sphere)
      expect(Math.abs(s.elev), `${s.tag}: target ${Math.round(s.elev)} m against a ${Math.round(s.look)} m look distance`)
        .toBeLessThanOrEqual(51 * Math.abs(s.look));
  }
});
