// R179 behavioural checks in a real browser, against the BUILT site.
//
// The SEVENTH report of 「Unlimited map tilt にした場合…視点の位置を変えるな…高度が明らかに変わっている」,
// and the first one that says WHERE: 「上を見上げると」 — LOOKING UP, i.e. past 90° of pitch.
//
// #R178 shipped nine passing cases and the report came back, because of what its sample space was:
//   · its ONE real ctrl-drag ran at the startup band, where the tilt saturates at 76.7° — so the
//     gesture the user describes was never performed by any test;
//   · everything that DID cross 90° got there with setPitch, and #R177 had already written down
//     that setPitch and a real drag are different code paths ("提案の作られ方が違う").
//
// Reproduced on the #R178 build with a real ctrl-drag pushed past 90°:
//
//     flat z1.7 Tokyo   drift 21,784,350 m   frame step 1,118,710 m   pitch frozen at 90.0
//     flat z6   Tokyo        1,394,705 m                 74,683 m     pitch frozen at 90.0
//     flat z14  Tokyo            5,610 m                    309 m     pitch frozen at 90.0
//                               eye 1,071,682 m → 56,088 m at z6, 4,186 m → 219 m at z14
//
// The cause is an ORDERING fact inside MapLibre, not arithmetic of ours: Camera._applyUpdated
// Transform runs `_elevateCameraIfInsideTerrain` BEFORE `transformCameraUpdate`, and that check
// judges `_requestedCameraState` — the proposal, which #R173 established never receives this
// hook's overrides. During a drag the proposal is cloned once at gesture start, so its elevation
// stays 0; past 90° the cosine in `getCameraAltitude()` turns negative, the camera reads as
// underground, and the check rewrites the pitch to exactly 90 and pushes the zoom in. Our hook
// then faithfully holds the eye of an already-mangled camera, and the next frame reads that
// mangled camera as truth — hence the monotone collapse. setPitch escaped it because jumpTo
// re-clones the proposal FROM the applied transform, elevation included.
//
// The repair is not to switch the check off (measured: that holds the eye but leaves the renderer
// permanently believing the camera is underground, and stalls at 177°). It is to let it judge
// first, and — only when it wants to move the camera — hand it the elevation this engine is about
// to apply and ask again. Measured after: the check fires ZERO times, the eye holds to 0 m, and
// the tilt reaches 180°.
import { test, expect } from '@playwright/test';
import { installCameraRuler } from './helpers/camera-ruler.js';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* The drag, as a person performs it: ctrl held, pointer walked upwards, 70 steps of 6 px, which is
   more than the whole 0-180° range so the tilt is always pushed to wherever it really stops.
   Returns everything about the VIEWPOINT, measured with the matrix ruler (tests/helpers). */
const tiltDrag = async (page, cc) => page.evaluate(async (c) => {
  const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
  const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  window.IntMapTilt.set(true);
  m.setProjection({ type: c.proj });
  /* elevation reset EXPLICITLY. Not tidiness: a target elevation left over from a previous
     look-up survives jumpTo (the point the camera looks at is unpinned while this setting is on),
     and it makes the eye legitimately high — which is enough to stop the NEXT case reproducing
     at all. Measured while writing these tests: running the cases in sequence in one page turned
     flat z6 from 1,394,705 m of drift into 0, because the wrecked leftover from the case before
     it kept MapLibre's underground check quiet. Every case gets a fresh page AND a clean camera. */
  m.jumpTo({ center: [139.767, 35.681], zoom: c.z, pitch: 0, bearing: 0, elevation: 0 });
  await wait(800);
  const el = m.getCanvasContainer(), b = el.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height * 0.8);
  const fire = (t, type, x, y, bts) => t.dispatchEvent(new MouseEvent(type,
    { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: bts, ctrlKey: true, view: window }));
  const E0 = window.__eye();
  fire(el, 'mousedown', cx, cy, 1); await frame();
  let y = cy, prev = E0, drift = 0, jump = 0, pitchStep = 0, prevP = m.getPitch(), altMin = E0.alt, altMax = E0.alt;
  for (let i = 0; i < 70; i++) {
    y -= 6; fire(document, 'mousemove', cx, y, 1); await frame();
    const E = window.__eye(); if (!E) break;
    drift = Math.max(drift, window.__gap(E0, E));
    jump = Math.max(jump, window.__gap(prev, E));
    altMin = Math.min(altMin, E.alt); altMax = Math.max(altMax, E.alt);
    pitchStep = Math.max(pitchStep, Math.abs(m.getPitch() - prevP));
    prevP = m.getPitch(); prev = E;
  }
  fire(document, 'mouseup', cx, y, 0); await frame();
  await wait(800);                                            // let drag inertia finish
  return { space: E0.space, alt0: E0.alt, altMin, altMax, drift, jump, pitchStep,
           endPitch: m.getPitch(), afterInertia: window.__gap(E0, window.__eye()) };
}, cc);

/* ── ① the exact reproduction, on its own, at the zoom where it was worst ────────────────────── */
test('LOOKING UP with a real drag holds the viewpoint — flat z6, the 1,394 km case (#R179)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(installCameraRuler);
  const r = await tiltDrag(page, { proj: 'mercator', z: 6 });
  expect(r.endPitch, 'the drag must actually get past the horizon — this is 「上を見上げる」').toBeGreaterThan(120);
  expect(r.drift, 'the viewpoint must not move').toBeLessThan(2);
  expect(r.jump, 'and must not jump between frames').toBeLessThan(2);
  expect(Math.abs(r.altMax - r.alt0), 'the eye altitude must not climb').toBeLessThan(2);
  expect(Math.abs(r.alt0 - r.altMin), '…nor fall: it fell 1,071,682 m → 56,088 m before this').toBeLessThan(2);
  expect(r.afterInertia, 'and drag inertia must not move it either').toBeLessThan(2);
});

/* ── ② every projection × zoom, dragged with the real gesture ────────────────────────────────
   The pitch each case can reach differs and that is BY DESIGN (#R178: 「視点を優先し、そこで傾きを
   止める」) — on the sphere holding the eye spends the zoom and runs out of parameterisation, so
   only the mercator cases reach the far side. What must hold everywhere is that the eye does not
   move and the tilt does not step. `look` marks the cases that must cross 90°, since a case that
   saturates below it cannot exercise the bug this round is about. */
for (const c of [{ proj: 'mercator', z: 1.7, tag: 'flat z1.7 (STARTUP)', sphere: false, look: false },
                 { proj: 'mercator', z: 3, tag: 'flat z3', sphere: false, look: true },
                 { proj: 'mercator', z: 9, tag: 'flat z9', sphere: false, look: true },
                 { proj: 'mercator', z: 14, tag: 'flat z14', sphere: false, look: true },
                 { proj: 'mercator', z: 18, tag: 'flat z18', sphere: false, look: true },
                 { proj: 'globe', z: 1.7, tag: 'globe z1.7 (STARTUP)', sphere: true, look: false },
                 { proj: 'globe', z: 6, tag: 'globe z6', sphere: true, look: false },
                 { proj: 'globe', z: 9, tag: 'globe z9', sphere: true, look: true },
                 { proj: 'globe', z: 12.5, tag: 'globe z12.5', sphere: false, look: true },
                 { proj: 'globe', z: 14, tag: 'globe z14', sphere: false, look: true }]) {
  test(`a real tilt drag holds the viewpoint — ${c.tag} (#R179)`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    await page.evaluate(installCameraRuler);
    const r = await tiltDrag(page, c);
    expect(r.space, 'which of the renderer\'s two camera models this band uses').toBe(c.sphere ? 'sphere' : 'merc');
    expect(r.drift, 'the viewpoint must not move at ANY tilt').toBeLessThan(2);
    expect(r.jump, 'and must not step between frames').toBeLessThan(2);
    expect(r.afterInertia, 'inertia included').toBeLessThan(2);
    // the tilt saturates rather than leaping into the far-side solutions that reappear past the
    // horizon (#R178 measured 76.7° → 140° in a single frame before that was walked instead)
    expect(r.pitchStep, 'the tilt comes to rest, it does not leap').toBeLessThan(12);
    expect(r.endPitch, 'some tilt is always available').toBeGreaterThan(15);
    if (c.look) expect(r.endPitch, 'this band must be able to LOOK UP, or it cannot test the report').toBeGreaterThan(95);
  });
}

/* ── ③ the repair is installed with the setting, and leaves NOTHING behind ────────────────────
   It leans on a renderer internal, and #R162's lesson is that a `typeof` guard around one deletes
   the feature in SILENCE if it is ever renamed — which here would take the whole seventh-round fix
   with it. So the engine reports both halves and this pins the report. It also pins that turning
   the setting off restores MapLibre's own method exactly, rather than leaving a patched map. */
test('the eye pivot installs both halves and restores the renderer afterwards (#R179)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
    const D = () => window.IntMapGeoEngine.camera.eyePivotDiag();
    const patched = () => Object.prototype.hasOwnProperty.call(m, '_elevateCameraIfInsideTerrain');
    window.IntMapTilt.set(false); await wait(250);
    const off = { diag: D(), patched: patched() };
    window.IntMapTilt.set(true); await wait(250);
    const on = { diag: D(), patched: patched() };
    window.IntMapTilt.set(false); await wait(250);
    const back = { diag: D(), patched: patched(), stillCallable: typeof m._elevateCameraIfInsideTerrain === 'function' };
    return { off, on, back };
  });
  expect(r.on.diag.pivot, 'the setting is on').toBe(true);
  expect(r.on.diag.hook, 'the camera hook is installed').toBe(true);
  expect(r.on.diag.underGuard, 'and so is the repair to the correction that runs ahead of it').toBe('active');
  expect(r.on.patched, 'which means the map carries it as its own property').toBe(true);
  expect(r.off.diag.underGuard, 'nothing is installed while the setting is off').toBe('off');
  expect(r.back.diag.underGuard, 'and turning it off removes it again').toBe('off');
  expect(r.back.patched, 'leaving MapLibre\'s own method in place, not a patched copy').toBe(false);
  expect(r.back.stillCallable, 'and still callable').toBe(true);
});

/* ── ④ it is a REPAIR of the INPUT, not a suppression of the ANSWER ───────────────────────────
   Measured, the two are easy to confuse and only one of them is honest: simply neutralising the
   check also holds the eye to 0 m, but then the renderer's protection against a camera under the
   ground is gone for everyone who turns unlimited tilt on (and it stalled at 177° besides). So
   this pins all three facts at once, on the SAME proposal — a look-up at pitch 150 with the
   elevation the proposal really carries during a drag, which is 0:
     · MapLibre's own method, called directly, answers with a pitch/zoom correction. That IS the
       defect's mechanism, and pinning it means the test fails loudly if a future MapLibre stops
       behaving this way rather than quietly guarding nothing.
     · Through the engine's repair the same proposal draws no correction at all, because the
       elevation it is shown is the one the engine is about to apply.
     · And with the flight simulator driving the camera itself (__fsCamActive, the one case the
       tilt hook stands down for), the repair stands down too and the answer is MapLibre's own
       again — which is only possible if it delegates rather than returning nothing. */
test('the underground check is repaired, not suppressed (#R179)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
    window.IntMapTilt.set(true); await wait(300);
    m.setProjection({ type: 'mercator' });
    m.jumpTo({ center: [139.767, 35.681], zoom: 16, pitch: 0, bearing: 0, elevation: 0 });
    await wait(700);
    /* MapLibre's own, from the prototype it was patched over — a fresh clone each time, since the
       repair mutates the transform it is handed (that is the whole point of it) */
    let proto = Object.getPrototypeOf(m);
    while (proto && !Object.prototype.hasOwnProperty.call(proto, '_elevateCameraIfInsideTerrain'))
      proto = Object.getPrototypeOf(proto);
    const lookUp = () => { const t = m.transform.clone(); t.setPitch(150); t.setElevation(0); return t; };
    const corrects = a => !!(a && (a.pitch != null || a.zoom != null));
    const raw = proto && proto._elevateCameraIfInsideTerrain;
    const out = {
      foundProto: typeof raw === 'function',
      rawFires: typeof raw === 'function' ? corrects(raw.call(m, lookUp())) : null,
      repaired: corrects(m._elevateCameraIfInsideTerrain(lookUp())),
    };
    try { window.__fsCamActive = true; out.whileFlying = corrects(m._elevateCameraIfInsideTerrain(lookUp())); }
    finally { window.__fsCamActive = false; }
    return out;
  });
  expect(r.foundProto, 'MapLibre\'s own method must still be on the prototype').toBe(true);
  expect(r.rawFires, 'unrepaired, it rewrites the camera on a look-up — the defect\'s mechanism').toBe(true);
  expect(r.repaired, 'shown the elevation the engine applies, it finds nothing wrong').toBe(false);
  expect(r.whileFlying, 'and it is delegated to, not replaced: the flight sim gets MapLibre\'s own answer').toBe(true);
});

/* ══ THE TWO PRE-EXISTING LOOK-UP SIDE EFFECTS (「①②両方直す」) ═══════════════════════════════
   Both were measured on `main` as well, so neither is this round's doing — they were found while
   fixing the reported drag and the user asked for them in the same pass. They turned out to be one
   thing: the eye-hold competing with a caller who had said what it wanted. The adapter now records
   which camera properties were NAMED (camera.eyePivotDiag().decl) and the hook reads that instead
   of inferring intent from two frames of history, which is all it had to go on before.

   The distinction that matters, and it is not a heuristic: a declared CENTRE is a journey (the
   camera is described afresh, so the look-at target returns to the ground), while a declared ZOOM
   on its own is #R175's DOLLY (the view is kept and the eye scales). Getting that backwards is
   what put the eye 2,143 km underground on a zoom-button press. */

/* ── ⑥ ① zooming while looking up must not put the eye under the ground ───────────────────────
   Measured before: the wheel at globe z6, pitch 105°, took the eye to −0.193 of its altitude, and
   a zoom-button press at pitch 180 to −2,143,365 m. Both the gesture and the button are checked,
   because they reach the hook by different branches (the wheel moves the centre, so it is travel;
   the button does not, so it is the anchored dolly) — #R177's lesson about setPitch and a real drag
   applies to zoom too. The tilt is taken to the two regimes deliberately: ~105° at globe z6 is the
   SPHERE camera (the originally reported case), 180° lands in the mercator one. */
for (const c of [{ tilt: 120, z: 6, tag: 'globe z6, tilt 120° (the reported case)' },
                 { tilt: 180, z: 4, tag: 'globe z4, tilt 180°' },
                 { tilt: 180, z: 11, tag: 'globe z11, tilt 180°' }]) {
  test(`zooming while looking up keeps the eye above the surface — ${c.tag} (#R179)`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    await page.evaluate(installCameraRuler);
    const r = await page.evaluate(async (cc) => {
      const m = window.__imap, C = () => window.IntMapGeoEngine.camera;
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const out = {};
      for (const how of ['button', 'wheel']) {
        /* a CLEAN reset. Turning the setting off uninstalls the hook and re-pins the target to the
           ground; resetting with a jumpTo does not work, because the hook is still installed and
           re-solves the elevation from whatever it is handed. */
        window.IntMapTilt.set(false); await wait(250);
        C().setProjection({ type: 'globe' });
        m.jumpTo({ center: [139.767, 35.681], zoom: cc.z, pitch: 0, bearing: 0, elevation: 0 }); await wait(600);
        window.IntMapTilt.set(true); await wait(250);
        window.IntMapTilt.tiltTo(cc.tilt); await wait(700);
        const E0 = window.__eye(), z0 = m.getZoom();
        const el = m.getCanvasContainer(), b = el.getBoundingClientRect();
        const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
        let minAlt = E0.alt;
        for (let i = 0; i < 6; i++) {
          if (how === 'button') { C().zoomIn({ duration: 0 }); await wait(220); }
          else { for (let k = 0; k < 4; k++) { el.dispatchEvent(new WheelEvent('wheel',
                   { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: -120 })); await frame(); }
                 await wait(220); }
          const E = window.__eye(); if (!E) break;
          minAlt = Math.min(minAlt, E.alt);
        }
        out[how] = { space: E0.space, pitch: +m.getPitch().toFixed(1), alt0: E0.alt, minAlt,
                     dz: m.getZoom() - z0 };
      }
      return out;
    }, c);
    for (const how of ['button', 'wheel']) {
      const v = r[how];
      expect(v.pitch, `the tilt really is past the horizon — ${how}`).toBeGreaterThan(95);
      expect(v.minAlt, `the viewpoint must never go below sea level — ${how}`).toBeGreaterThan(0);
      // …and it must still ZOOM. #R175's report was 「unlimited tiltだとズームインできない」, and a
      // limit that answers "stay" on every press would be that bug wearing this fix's clothes.
      expect(v.dz, `and zooming in must still zoom in — ${how}`).toBeGreaterThan(1.5);
    }
  });
}

/* ── ⑦ ② a look-up must not leave the eye high once you go somewhere else ─────────────────────
   Measured before: look up to 150°, then fly to Paris, and the target elevation the look-up needed
   was still there — the eye landed at 11,470,292 m where a clean camera sits at 3,472,023 m, and
   the same 3.30× for a same-zoom flyTo. The reference is the identical destination reached with the
   setting OFF, so this compares the app against itself rather than against a number written here.
   The centre is checked too: #R173 measured a 4.3 km miss when a journey was re-anchored, so the
   fix must not have re-introduced that. */
for (const s of [{ tag: 'flyTo elsewhere, zooming out', proj: 'mercator',
                   start: { center: [139.767, 35.681], zoom: 14 }, dest: { center: [2.35, 48.86], zoom: 4, pitch: 0, bearing: 0 } },
                 { tag: 'flyTo elsewhere, same zoom', proj: 'mercator',
                   start: { center: [139.767, 35.681], zoom: 14 }, dest: { center: [2.35, 48.86], zoom: 14, pitch: 0, bearing: 0 } },
                 { tag: 'flyTo a TILTED destination', proj: 'mercator',
                   start: { center: [139.767, 35.681], zoom: 14 }, dest: { center: [2.35, 48.86], zoom: 12, pitch: 55, bearing: 20 } },
                 { tag: 'globe, flyTo elsewhere', proj: 'globe',
                   start: { center: [139.767, 35.681], zoom: 14 }, dest: { center: [2.35, 48.86], zoom: 4, pitch: 0, bearing: 0 } }]) {
  test(`going somewhere after a look-up lands where the zoom says — ${s.tag} (#R179)`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    await page.evaluate(installCameraRuler);
    const r = await page.evaluate(async (ss) => {
      const m = window.__imap, C = () => window.IntMapGeoEngine.camera;
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const elev = () => { try { return +m.getCameraTargetElevation() || 0; } catch (_) { return 0; } };
      // the SAME destination with the setting off — the app measured against itself
      window.IntMapTilt.set(false); await wait(250);
      C().setProjection({ type: ss.proj });
      m.jumpTo({ ...ss.dest, elevation: 0 }); await wait(800);
      const clean = window.__eye().alt, cleanCtr = m.getCenter();
      // …and reached after looking up
      window.IntMapTilt.set(true); await wait(250);
      C().setProjection({ type: ss.proj });
      m.jumpTo({ ...ss.start, pitch: 0, bearing: 0, elevation: 0 }); await wait(700);
      window.IntMapTilt.tiltTo(150); await wait(700);
      const lookedPitch = m.getPitch(), lookedElev = elev();
      C().jumpTo(ss.dest); await wait(900);
      const c1 = m.getCenter();
      return { clean, lookedPitch, lookedElev, elev: elev(), alt: window.__eye().alt,
               offCtr: Math.hypot((c1.lng - cleanCtr.lng) * Math.cos(cleanCtr.lat * Math.PI / 180),
                                  c1.lat - cleanCtr.lat) * 111320 };
    }, s);
    expect(r.lookedPitch, 'the look-up really happened').toBeGreaterThan(95);
    expect(Math.abs(r.lookedElev), '…and it really did lift the look-at target').toBeGreaterThan(100);
    expect(r.alt / r.clean, 'the viewpoint must land where the declared zoom says (was 3.30×)').toBeCloseTo(1, 2);
    expect(Math.abs(r.elev), 'nothing of the look-up is inherited').toBeLessThan(1);
    expect(r.offCtr, 'and the journey still arrives on centre (#R173 measured 4.3 km when it did not)').toBeLessThan(50);
  });
}

/* ── ⑧ the declaration itself reaches the hook ────────────────────────────────────────────────
   ⑥ and ⑦ both rest on the adapter recording what the caller named. If that stopped arriving, the
   hook would silently go back to guessing from history and both defects would return with no test
   failing on the mechanism. So this checks the record directly, including that it is CLEARED — a
   declaration that outlived its animation would make the next gesture look programmatic. */
test('the adapter records what the caller declared, and clears it (#R179)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap, C = () => window.IntMapGeoEngine.camera;
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const D = () => C().eyePivotDiag();
    window.IntMapTilt.set(true); await wait(250);
    C().setProjection({ type: 'mercator' });
    C().jumpTo({ center: [139.767, 35.681], zoom: 8, pitch: 0, bearing: 0 }); await wait(600);
    const out = {};
    /* THE RECORD ITSELF, read while the movement is still running. An instantaneous call is no use
       for this: jumpTo/setPitch fire 'moveend' synchronously, which is where the record is dropped,
       so by the time control returns it is already null — the record lasting exactly as long as its
       movement is the behaviour, not a gap in it. Hence an animated flyTo, sampled mid-flight. */
    C().flyTo({ center: [2.35, 48.86], zoom: 6, duration: 900 });
    await wait(200); out.midFlight = D().decl;
    await wait(1200); out.afterFlight = D().decl;
    /* …and WHAT THE HOOK DID with it, which is the part the two fixes actually rest on. */
    C().setProjection({ type: 'mercator' });
    C().jumpTo({ center: [139.767, 35.681], zoom: 8, pitch: 0, bearing: 0 }); await wait(600);
    C().setPitch(40); await wait(500); out.tiltBranch = D().lastBranch;
    C().zoomIn({ duration: 0 }); await wait(500); out.zoomBranch = D().lastBranch;
    C().flyTo({ center: [2.35, 48.86], zoom: 6, duration: 0 }); await wait(700); out.journeyBranch = D().lastBranch;
    // and a plain gesture names nothing, so every heuristic from #R173/#R175/#R177 still applies
    const el = m.getCanvasContainer(), b = el.getBoundingClientRect();
    for (let i = 0; i < 3; i++) el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
      clientX: Math.round(b.left + b.width / 2), clientY: Math.round(b.top + b.height / 2), deltaY: -120 }));
    await wait(700);
    out.gestureDecl = D().decl; out.gestureBranch = D().lastBranch;
    return out;
  });
  expect(r.midFlight, 'a journey names a centre and a zoom').toMatchObject({ center: true, zoom: true });
  expect(r.afterFlight, 'and the record is dropped when the movement ends').toBe(null);
  expect(r.tiltBranch, 'a pitch-only call keeps the eye HELD — the whole feature').toMatch(/^held\//);
  expect(r.zoomBranch, 'a zoom with no centre is a DOLLY, so the eye is still held and scaled').toMatch(/^held\//);
  expect(r.journeyBranch, 'a declared centre is a JOURNEY, so nothing of a look-up is inherited').toMatch(/^journey\//);
  expect(r.gestureDecl, 'a gesture declares nothing').toBe(null);
  expect(r.gestureBranch, 'so it lands in the branches the earlier rounds measured').toMatch(/^(travel|held)\//);
});

/* ── ⑤ zooming and panning still work with the setting on ─────────────────────────────────────
   #R175's instruction was 「unlimited tiltだとズームインできない」, fixed there at its real cause.
   This round touches the same hook and the same modifier chain, so the two gestures that are not
   a tilt are pinned here: measured wheel Δz 2.26-2.53, the zoom button exactly +1, and a pan that
   really travels — with the setting both off and on, at pitch 0 and leaning at 60°. */
test('unlimited tilt still lets you zoom and pan (#R175 regression guard) (#R179)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const rows = await page.evaluate(async () => {
    const m = window.__imap, wait = ms => new Promise(res => setTimeout(res, ms));
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const el = m.getCanvasContainer(), b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    const out = [];
    for (const unlimited of [false, true]) for (const startPitch of [0, 60]) {
      window.IntMapTilt.set(false); await wait(200);
      m.jumpTo({ center: [139.767, 35.681], zoom: 8, pitch: 0, bearing: 0, elevation: 0 }); await wait(600);
      window.IntMapTilt.set(unlimited); await wait(250);
      if (startPitch) { m.setPitch(startPitch); await wait(500); }
      const z0 = m.getZoom(), c0 = m.getCenter();
      for (let i = 0; i < 10; i++) { el.dispatchEvent(new WheelEvent('wheel',
        { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: -120 })); await frame(); }
      await wait(1000);
      const z1 = m.getZoom();
      m.zoomIn({ duration: 0 }); await wait(500);
      const z2 = m.getZoom();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: 1, view: window }));
      await frame();
      let x = cx;
      for (let i = 0; i < 12; i++) { x += 8; document.dispatchEvent(new MouseEvent('mousemove',
        { bubbles: true, cancelable: true, clientX: x, clientY: cy, button: 0, buttons: 1, view: window })); await frame(); }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: cy, button: 0, buttons: 0, view: window }));
      await frame(); await wait(900);
      const c1 = m.getCenter();
      out.push({ unlimited, startPitch, wheel: z1 - z0, button: z2 - z1,
                 pan: Math.hypot((c1.lng - c0.lng) * Math.cos(c0.lat * Math.PI / 180), c1.lat - c0.lat) * 111320 });
    }
    return out;
  });
  for (const r of rows) {
    const w = `unlimited=${r.unlimited} pitch=${r.startPitch}`;
    expect(r.wheel, `the wheel must zoom in — ${w}`).toBeGreaterThan(1.5);
    expect(r.button, `the zoom button must step exactly one level — ${w}`).toBeCloseTo(1, 2);
    expect(r.pan, `and a drag must travel — ${w}`).toBeGreaterThan(1000);
  }
});
