/* ============================================================================
 *  IntMap · the map's motion — a wheel, a drag, a finger  (map-motion)
 * ----------------------------------------------------------------------------
 *  「地図の挙動を Google Earth 並に滑らかにしたい」（ズームとスクロールの挙動）.
 *
 *  Trusted input (CDP mouse / wheel / touch) against the built app. Two kinds of assertion:
 *
 *  ① TRAJECTORY — run in the RENDERER'S time (scripts/map-motion-lib.mjs `virtualRun`): the clock
 *    MapLibre's wheel, drag, inertia and ease read is frozen and advanced 1000/60 ms per step, one
 *    real frame rendered per step. MEASURED why: a runner with no GPU (SwiftShader, what CI has)
 *    draws a frame every 50–100 ms, and in real time the same app scored a wheel evenness of 0.55–0.8
 *    there whether the fix was in or not — the number described the frame clock, not the map. In the
 *    renderer's time the real app computes the trajectory a 60 Hz display would show, on any machine.
 *  ② WHAT RUNS WHILE THE CAMERA MOVES — counts, in real time (the probe, scripts/map-motion-probe.js):
 *    writes to <html>/<body>, and symbol placements per moving frame. A count does not depend on
 *    how fast the frames are.
 *
 *  Each figure below was measured on one machine in the same minutes, before → after
 *  (`node scripts/map-motion.mjs --dist before,after`, GPU, 60 Hz):
 *    wheel evenness (mean |Δspeed| / mean speed, 8 notches 45 ms apart)   0.62–0.67 → 0.15–0.17
 *    glide start (first moving frame after release / drag speed)          0.08–0.24 → 0.5–0.9
 *    <body>/<html> class+style writes during a wheel zoom                 26–30     → 0
 *    symbol placements per moving frame                                   ≈1.1      → ≈0.1
 *  The thresholds sit between the columns; each assertion names the mechanism it guards.
 *  No millisecond budget anywhere: that would be a statement about the runner's GPU.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { seededStorageState } from './helpers/session-seed.js';
import { installHermeticRouting } from './helpers/network.js';
import { PROBE, GESTURES, PLANS, analyse, measure, virtualRun } from '../scripts/map-motion-lib.mjs';

/* serial: one worker per describe and ONE boot for its tests (with the suite's fullyParallel a describe's
   tests would spread over workers and each would boot its own page — measured as most of this file's
   time). The price is that a red test skips the rest of its describe. */
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function open(browser, mobile) {
  const ctx = await browser.newContext({
    ...(mobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1280, height: 800 } }),
    storageState: seededStorageState(), timezoneId: 'UTC', locale: 'en-US', serviceWorkers: 'block',
  });
  await installHermeticRouting(ctx);
  await ctx.addInitScript({ path: PROBE });
  const page = await ctx.newPage();
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded()
    && (!window.IntMapGeoEngine.canDraw || window.IntMapGeoEngine.canDraw()), null, { timeout: 90_000 });
  /* no wait for `idle` (nothing here is about the tiles, and with the network blocked idle comes late):
     the app's own milestones instead — the launch screen has lifted (it takes the touches until then)
     and the main thread has had its first idle after it (js/boot-stage.js) */
  await page.evaluate(async () => { const B = window.__imBootStage; if (B) { await B.interactive(); await B.settled(); } });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
const inRendererTime = async (s, g, plan) => analyse(await virtualRun(s.page, s.cdp, g, plan), g.kind);

test.describe('desktop · wheel and drag', () => {
  let s;
  test.beforeAll(async ({ browser }) => { s = await open(browser, false); });
  test.afterAll(async () => { if (s) await s.ctx.close(); });

  test('a wheel notch moves the zoom’s target, not its clock: no near-stop per notch', async () => {
    const r = await inRendererTime(s, GESTURES.desktop.wheel, PLANS.wheel());
    expect(r.movingFrames, 'the wheel moved the camera').toBeGreaterThan(10);
    /* js/geo-engine.js _smoothWheel. The stock handler restarts a 200 ms curve at every notch and the
       zoom's speed nearly stops each time; the spring carries the speed across notches. */
    /* in the renderer's time, notches landing between frames at their own times: stock 0.217–0.224,
       spring 0.090–0.104 (deterministic — the clock is the test's) */
    expect(r.path.evenness, `zoom speed changed by ${r.path.evenness} of its mean, frame to frame`).toBeLessThan(0.16);
  });

  test('…and it still zooms toward the cursor (the place under the pointer stays under it)', async () => {
    /* #R20 restored the renderer's cursor-anchored wheel after a custom glide lost it; the spring
       replaces only the zoom's path, so the place under the pointer must stay under it */
    const g = GESTURES.desktop.wheel;
    const L0 = await s.page.evaluate((v) => { const m = window.__imap; m.jumpTo(v);
      const c = m.getCanvas().getBoundingClientRect(); const ll = m.unproject([c.width * 0.6, c.height * 0.45]);
      return { lng: ll.lng, lat: ll.lat, x: c.width * 0.6, y: c.height * 0.45 }; }, g.view);
    const r = analyse(await virtualRun(s.page, s.cdp, g, PLANS.wheel()), g.kind);
    expect(r.movingFrames).toBeGreaterThan(10);
    const at = await s.page.evaluate((L) => { const m = window.__imap; const p = m.project([L.lng, L.lat]);
      return { dx: p.x - L.x, dy: p.y - L.y, dz: m.getZoom() }; }, L0);
    expect(at.dz - g.view.zoom, 'the wheel zoomed in').toBeGreaterThan(1);
    expect(Math.hypot(at.dx, at.dy), `pixels the cursor's place drifted (${at.dx.toFixed(1)}, ${at.dy.toFixed(1)})`).toBeLessThan(3);
  });

  test('while the camera moves, nothing rewrites <html>/<body> and labels are not re-placed every frame', async () => {
    const r = analyse(await measure(s.page, s.cdp, GESTURES.desktop.wheel, 0, { tiles: false }), 'zoom');
    expect(r.movingFrames, 'the wheel moved the camera').toBeGreaterThan(3);
    /* js/space-sky.js wrote <body>'s class on every frame; every observer of <body> woke for it */
    expect(r.pageWrites, `class/style writes on <html>/<body>: ${JSON.stringify(r.styleWriters)}`).toBe(0);
    /* js/app-body.js ARRIVAL_FADE_MS — at fadeDuration 0 the renderer forces a full placement per frame */
    expect(r.labels.placementShare, 'symbol placements per moving frame').toBeLessThan(0.5);
  });

  let defaultDrag = null;   /* the default-settings drag, measured once and read by the Inertia test too (serial) */
  test('the glide after a drag starts at the speed the drag was released at', async () => {
    const r = defaultDrag = await inRendererTime(s, GESTURES.desktop.drag, PLANS.drag());
    /* js/geo-engine.js _glideOptions: linearity × f′(0) = 2. Stock: a quarter of the speed or less. */
    expect(r.path.glideStart, 'first glide frame speed / drag speed').toBeGreaterThan(0.4);
  });

  test('a tool that suspends and restores the pan does not drop the glide', async () => {
    await s.page.evaluate(() => { const I = window.IntMapGeoEngine.input; I.set('dragPan', false); I.set('dragPan', true); });
    const r = await inRendererTime(s, GESTURES.desktop.drag, PLANS.drag());
    expect(r.path.glideStart, 'MapLibre’s enable() without options resets the inertia; the view’s glide rides every enable').toBeGreaterThan(0.4);
  });

  test('the Inertia slider is applied: at 0 the map stops on release, at 1 it glides', async () => {
    const travel = async (inertia) => {
      /* Inertia 1 is the default: the drag the glide test above already measured (deterministic in the
         renderer's time, so a second run would draw the same frames) */
      if (inertia === 1 && defaultDrag) return defaultDrag.path.glidePx;
      await s.page.evaluate((v) => { window.imNavInertia = v; window._applyNavSens(); }, inertia);
      return (await inRendererTime(s, GESTURES.desktop.drag, PLANS.drag())).path.glidePx;
    };
    try {
      const glide = await travel(1), stop = await travel(0);
      expect(glide, 'pixels the default glide carries the map after release').toBeGreaterThan(20);
      /* the slider was saved, restored and shown, and applied to nothing: both used to glide alike */
      expect(stop, `pixels after release at Inertia 0 (the default glide went ${glide})`).toBeLessThan(glide * 0.25);
    } finally {
      await s.page.evaluate(() => { window.imNavInertia = 1; window._applyNavSens(); });
    }
  });

  test('the level the wheel is going to is fetched now; the levels it passes are still held', async () => {
    /* js/sat-proto.js _satWantedThere / _satWarmDestination. Hermetic: the bytes never arrive, but the
       DECISIONS are made before any fetch and are counted (IntMapSatProto.zoomGate) */
    const on = await s.page.evaluate(() => { const P = window.IntMapSatProto; if (!P || !P.zoomGate) return null;
      P.resetZoomStats(); return window.IntMapGeoEngine.layers.getLayout('layer-sat', 'visibility'); });
    test.skip(on !== 'visible', 'the satellite basemap is not the one drawn in this session');
    const g = Object.assign({}, GESTURES.desktop.wheel, { view: { center: [139.7, 35.68], zoom: 8, pitch: 0, bearing: 0 } });
    await virtualRun(s.page, s.cdp, g, PLANS.wheel());
    const st = await s.page.evaluate(() => window.IntMapSatProto.zoomGate());
    expect(st.ahead, `requests released because the destination draws them: ${JSON.stringify(st)}`).toBeGreaterThan(0);
    expect(st.warmed, 'destination tiles handed to the worker before the renderer asked').toBeGreaterThan(0);
    expect(st.held, 'and the passing levels are still held (#R205)').toBeGreaterThan(0);
  });

  test('the night side is repainted in slices: the canvas only ever receives a finished picture', async () => {
    /* js/night-side.js paint(). The whole-Earth night image (1024² pixels) was one 35–58 ms task on the
       first idle after a zoom-out crossed z5.4 — the frame the motion ended on. The assertion is about
       ORDER, not milliseconds: the call that asks for a repaint returns with the canvas unchanged, and
       the new picture arrives afterwards, whole. (night-side-catchup: the slices are ordinary tasks of
       ≤5 ms rather than idle callbacks, and a coarse picture precedes the exact one — both are finished
       pictures, so the order asserted here is the same.) */
    const sat = await s.page.evaluate(() => { const b = document.getElementById('btn-view-sat'); if (b && !b.classList.contains('active')) b.click();
      return true; });
    expect(sat).toBe(true);
    await s.page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [0, 10], zoom: 1.2, pitch: 0, bearing: 0 }));
    await s.page.waitForFunction(() => window.IntMapNightSide && window.IntMapNightSide.state().built, null, { timeout: 60_000 });
    const r = await s.page.evaluate(async () => {
      const cv = (window.__imap.getSource('im-night-lights') || {}).canvas;
      const row = () => { const d = cv.getContext('2d').getImageData(0, Math.round(cv.height / 2), cv.width, 1).data; let h = 0; for (let c = 3; c < d.length; c += 4) h = (h * 31 + d[c]) | 0; return h; };
      const h0 = row();
      window.IntMapTime.set(new Date(Date.now() - 12 * 3600e3), { source: 'map-motion' });   /* the other half of the Earth is night */
      window.IntMapNightSide.refresh();
      const h1 = row();
      let h2 = h1;
      for (let i = 0; i < 60 && h2 === h0; i++) { await new Promise((res) => setTimeout(res, 100)); h2 = row(); }
      window.IntMapTime.set(null, { source: 'map-motion' });
      return { h0, h1, h2 };
    });
    expect(r.h1, 'the repaint did not run inside the call that asked for it').toBe(r.h0);
    expect(r.h2, 'and the new picture arrived afterwards').not.toBe(r.h0);
  });
});

test.describe('phone · finger', () => {
  let s;
  test.beforeAll(async ({ browser }) => { s = await open(browser, true); });
  test.afterAll(async () => { if (s) await s.ctx.close(); });

  test('a flicked finger glides on instead of braking at lift-off — and no frame stands still between', async () => {
    const r = await inRendererTime(s, GESTURES.mobile.pan, PLANS.pan());
    expect(r.movingFrames, 'the finger moved the camera').toBeGreaterThan(5);
    expect(r.path.glideStart, 'first glide frame speed / finger speed').toBeGreaterThan(0.4);
    /* js/geo-engine.js _glideRelease ③: the glide is anchored at the last frame the finger moved, so
       the frame drawn at the release already carries on (it stood still: 0.80 0.00 0.46) */
    expect(r.path.stalls, 'frames on which the camera stood still between two that moved').toBe(0);
  });

  test('released fingers carry the zoom on: a pinch glides out at the speed it was released at', async () => {
    const r = await inRendererTime(s, GESTURES.mobile.pinch, PLANS.pinch());
    expect(r.movingFrames, 'the fingers zoomed the camera').toBeGreaterThan(10);
    /* the renderer's zoom inertia started at 0.22 of the release speed after a standing frame, and was
       over in 76 ms (module constants nobody could pass); _glideRelease gives pan and zoom one law */
    expect(r.path.glideStart, 'first glide frame zoom speed / pinch zoom speed').toBeGreaterThan(0.55);
    expect(r.path.stalls, 'no standing frame at the release').toBe(0);
  });

});
