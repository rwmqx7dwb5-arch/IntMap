// R178 behavioural checks in a real browser, against the BUILT site.
//
// The SIXTH report of 「Unlimited map tilt にした場合、視点の位置を変えるな…高度が明らかに変わっている」.
// #R177 shipped seven passing cases and the report came back, because every one of them started at
// z3 or deeper: the band the app actually BOOTS INTO was never measured. Reproduced on the #R177
// build, at the default startup view (globe, centre [10,20], zoom 1.7) with a plain ctrl-drag:
//
//     viewpoint drift 3,712 km · frame-to-frame step 2,529 km
//     eye altitude 24,422 km → 20,709 km
//     trail  p60/z0.11/d0 → p63/z0.00/d1,183,695 → p66/z0.00/d3,712,407
//
// and the same wall exists on the flat map, where it is even closer in: held to 20° at z1.7.
//
// Two limits produce it, and neither is the renderer refusing something unreasonable:
//   ① the app's own minZoom of 0 (MapLibre's floor is −2), and
//   ② the camera the eye implies leaves the range MapLibre will keep — on the sphere the look-at
//      point walks over the pole, on the plane it leaves the box that keeps the world covering the
//      viewport (measured ±60.4° of latitude at z1.7, nothing to do with 85.051°).
//
// Asked which of "hold the viewpoint" and "tilt to 180°" wins where they cannot both hold, the
// answer was 「視点を優先し、そこで傾きを止める」. So these tests assert BOTH halves: the viewpoint
// never moves anywhere, and the tilt comes to rest instead of the eye sliding.
import { test, expect } from '@playwright/test';
import { installCameraRuler } from './helpers/camera-ruler.js';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);   /* (#R212) the style is already loaded — this tail was 1.5 s in 20 specs */
};

/* ── ① the exact reproduction: a ctrl-drag from the view the app boots into ───────────────────── */
test('the STARTUP view holds the viewpoint through a real tilt drag (#R178)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(installCameraRuler);
  const r = await page.evaluate(async () => {
    const m = window.__imap, el = m.getCanvasContainer();
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    // deliberately NOT jumpTo'd anywhere — this is the camera the app starts with
    window.IntMapTilt.set(true);
    await frame(); await frame();
    const b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    const fire = (t, type, x, y, bts) => t.dispatchEvent(new MouseEvent(type,
      { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: bts, ctrlKey: true, view: window }));
    const E0 = window.__eye();
    fire(el, 'mousedown', cx, cy, 1); await frame();
    let y = cy, prev = E0, drift = 0, jump = 0, altMin = E0.alt, altMax = E0.alt, pitchStep = 0, prevP = m.getPitch();
    for (let i = 0; i < 40; i++) {
      y -= 6; fire(document, 'mousemove', cx, y, 1); await frame();
      const E = window.__eye();
      drift = Math.max(drift, window.__gap(E0, E));
      jump = Math.max(jump, window.__gap(prev, E));
      altMin = Math.min(altMin, E.alt); altMax = Math.max(altMax, E.alt);
      pitchStep = Math.max(pitchStep, Math.abs(m.getPitch() - prevP));
      prevP = m.getPitch(); prev = E;
    }
    fire(document, 'mouseup', cx, y, 0); await frame();
    await new Promise(res => setTimeout(res, 700));           // let inertia finish
    const Eend = window.__eye();
    return { zoom0: 1.7, space: E0.space, drift, jump, alt0: E0.alt, altMin, altMax,
             endPitch: m.getPitch(), pitchStep, afterInertia: window.__gap(E0, Eend) };
  });
  expect(r.space, 'the startup view is on the SPHERE — the model #R172-#R177 never solved for').toBe('sphere');
  expect(r.endPitch, 'the drag really tilted the map').toBeGreaterThan(30);
  expect(r.drift, 'the viewpoint must not move').toBeLessThan(2);
  expect(r.jump, 'and it must not jump between frames').toBeLessThan(2);
  expect(Math.abs(r.altMax - r.alt0), 'the eye altitude must not climb').toBeLessThan(2);
  expect(Math.abs(r.alt0 - r.altMin), 'the eye altitude must not fall').toBeLessThan(2);
  expect(r.afterInertia, 'and drag inertia must not move it either').toBeLessThan(2);
  // 「そこで傾きを止める」: the drag saturates instead of the eye sliding — and it comes to REST,
  // it does not leap onward into the far-side solutions that reappear past the horizon.
  expect(r.pitchStep, 'the tilt must never step').toBeLessThan(12);
});

/* ⚠ (#R197) THE VIEWPOINT SWEEP THAT WAS HERE IS GONE — 「何重にもテストとか意味がない」.
   r178 swept 6 cases through the 0-180° range.
   Five files swept the same invariant — "tilting does not move the viewpoint" — because it was
   re-reported five rounds running, and each round added its own sweep instead of extending the one
   before it. tests/r179.spec.js now carries all of them: it drives a REAL POINTER DRAG rather than
   the API (and #R179 is the round that found the API path was never the broken one), it covers both
   projections from z1.7 to z18 plus the 69°N case that used to live in tests/r177, and it asserts
   drift, inter-frame stepping, inertia, tilt saturation and the 90° crossing in one place.
   The copies were DELETED, not skipped: a disabled test is a slower test that proves nothing. */


/* ── ③ the zoom floor is the tilt setting's, and it is handed back ──────────────────────────────
   Holding the eye on a sphere spends the zoom, and the app's own floor of 0 is what stopped the
   startup view being held past 60°. The adapter widens it to MapLibre's real floor while the eye
   pivot is installed and restores the app's own value when the setting goes off — including after a
   projection switch, which is the other writer of the same property. */
test('unlimited tilt owns the zoom floor and gives it back (#R178)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
    const out = {};
    window.IntMapTilt.set(false); await wait(200); out.offBefore = m.getMinZoom();
    window.IntMapTilt.set(true); await wait(200); out.on = m.getMinZoom();
    window.IntMapTilt.set(false); await wait(200); out.offAfter = m.getMinZoom();
    // a projection switch must not be able to strand either value
    window.IntMapTilt.set(true); await wait(150);
    window.IntMapOS.exec('view.proj.flat', { source: 'test' }); await wait(400); out.flatOn = m.getMinZoom();
    window.IntMapTilt.set(false); await wait(250); out.flatOff = m.getMinZoom();
    window.IntMapOS.exec('view.proj.globe', { source: 'test' }); await wait(400); out.globeOff = m.getMinZoom();
    return out;
  });
  expect(r.offBefore, 'the app owns the floor while the setting is off').toBe(0);
  expect(r.on, 'and the tilt setting widens it to the renderer\'s own floor').toBe(-2);
  expect(r.offAfter, 'turning it off hands the app\'s floor straight back').toBe(0);
  expect(r.flatOn, 'still widened after a projection switch').toBe(-2);
  expect(r.flatOff, 'and the flat map gets ITS floor back, not the globe\'s').toBe(1.2);
  expect(r.globeOff, 'and the globe gets its own').toBe(0);
});

/* ── ④ the feasibility question is asked of the RENDERER, not of a rule we wrote ────────────────
   Every round before this one hand-wrote "in range" (|lat| ≤ 85.051, zoom within [min,max]) and
   every one of them missed something — the flat map's real wall at the startup zoom is ±60.4° of
   latitude, which no such rule contains. transform.applyConstrain IS the renderer's answer, it is
   pure, and both transforms implement it; this pins that it stays reachable and non-mutating, since
   silently losing it would take the guard back to "always feasible" without any test failing. */
test('the renderer can still be asked whether it would move a camera (#R178)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
    m.setProjection({ type: 'mercator' });
    m.jumpTo({ center: [10, 20], zoom: 1.7, pitch: 0, bearing: 0 });
    await wait(600);
    const t = m.transform, before = { lat: m.getCenter().lat, zoom: m.getZoom() };
    const near = t.applyConstrain(new maplibregl.LngLat(10, 20), 1.7);
    const far = t.applyConstrain(new maplibregl.LngLat(10, 84), 1.7);
    await wait(120);
    return { has: typeof t.applyConstrain === 'function',
             keptNear: Math.abs(near.center.lat - 20) < 1e-7 && Math.abs(near.zoom - 1.7) < 1e-7,
             movedFar: Math.abs(far.center.lat - 84) > 1e-6,
             pure: Math.abs(m.getCenter().lat - before.lat) < 1e-9 && Math.abs(m.getZoom() - before.zoom) < 1e-9 };
  });
  expect(r.has, 'transform.applyConstrain must exist').toBe(true);
  expect(r.keptNear, 'a camera it would keep must read as feasible').toBe(true);
  expect(r.movedFar, 'and one it would move must read as infeasible').toBe(true);
  expect(r.pure, 'asking must not move the map').toBe(true);
});
