// (#R180) 「IntMapの衛星画像、3Dを極限まで高速・高画質化したいです。」
//
// #R178 found the satellite layer running at half the display's resolution, #R179 found the
// BASE MAP doing the same thing, and both were the app's own arithmetic. This round's two are
// MapLibre's own defaults, and they cost resolution in exactly the two situations this app is
// built for: a tilted 3-D view, and a large high-density monitor. Neither is visible in a
// screenshot taken at 1× on a small window, which is why they are measured here against a
// REAL browser at a real device pixel ratio rather than asserted from the source.
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 60_000 };
const ready = (page) => page.waitForFunction(() => !!window.__imap && !!window.IntMapGeoEngine, null, BOOT);

/* ── ① ANISOTROPY AT EVERY TILT, INCLUDING NONE ───────────────────────────────────────────
   MapLibre applies EXT_texture_filter_anisotropic to a raster tile only when
   `transform.pitch > options.anisotropicFilterPitch`, whose default is 20. On the globe — the
   app's default projection — the surface curves away towards the limb at every pitch, so the
   default left the correction off for the most common view there is. */
test('R180 ①: anisotropic raster filtering is enabled at every pitch, not only past 20°', async ({ page }) => {
  await page.goto('/?rafshim=1');
  await ready(page);
  const got = await page.evaluate(() => {
    const m = window.__imap;
    return {
      pitchGate: m.getAnisotropicFilterPitch ? m.getAnisotropicFilterPitch() : null,
      /* and the extension really is there to be used — the gate is pointless without it */
      ext: (() => {
        try {
          const gl = m.getCanvas().getContext('webgl2') || m.getCanvas().getContext('webgl');
          return !!(gl && gl.getExtension('EXT_texture_filter_anisotropic'));
        } catch (_) { return false; }
      })(),
      maxAniso: (() => {
        try {
          const gl = m.getCanvas().getContext('webgl2') || m.getCanvas().getContext('webgl');
          const e = gl && gl.getExtension('EXT_texture_filter_anisotropic');
          return e ? gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;
        } catch (_) { return 0; }
      })(),
    };
  });
  expect(got.pitchGate, 'the app must lower MapLibre\'s 20° gate to 0').toBe(0);
  expect(got.ext, 'EXT_texture_filter_anisotropic must be available for the gate to mean anything').toBe(true);
  expect(got.maxAniso).toBeGreaterThan(1);
});

/* ── ② THE CANVAS IS NOT CLAMPED BELOW THE DISPLAY ────────────────────────────────────────
   MapLibre's maxCanvasSize defaults to [4096, 4096] and it CLAMPS: on any display whose CSS
   size × devicePixelRatio exceeds that, the drawing buffer is scaled down and the app's own
   `pixelRatio: devicePixelRatio` stops being honoured. A 1440p screen at DPR 2 is 5120 px
   wide, so this is the ordinary case, not an exotic one. Run at DPR 2 in a wide viewport so
   the old default would bind. */
test.describe('R180 ②: full device resolution on a large HiDPI display', () => {
  /* wide enough that the MAP pane alone (the viewport minus the sidebar) exceeds 2048 CSS px,
     so 2× puts the drawing buffer past MapLibre's 4096 default. Measured while writing this:
     a 1400 px viewport leaves the canvas 960 px wide — 1920 at 2×, nowhere near the cap — so
     the first version of this test proved nothing and said so rather than passing. */
  test.use({ viewport: { width: 3000, height: 1400 }, deviceScaleFactor: 2 });
  test('the drawing buffer is not clamped below CSS × devicePixelRatio', async ({ page }) => {
    await page.goto('/?rafshim=1');
    await ready(page);
    const got = await page.evaluate(() => {
      const m = window.__imap, cv = m.getCanvas();
      let lim = 0;
      try {
        const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
        lim = gl ? Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) : 0;
      } catch (_) {}
      return { dpr: window.devicePixelRatio, cssW: cv.clientWidth, cssH: cv.clientHeight,
               bufW: cv.width, bufH: cv.height, glLimit: lim,
               maxCanvas: (m._maxCanvasSize || null) };
    });
    /* the honest expectation: the buffer matches CSS × DPR, unless the GPU itself cannot go
       that far — in which case the ceiling is the hardware's, not a library default */
    const wantW = Math.round(got.cssW * got.dpr);
    const cap = Math.max(4096, Math.min(8192, got.glLimit || 8192));
    const expectW = Math.min(wantW, cap);
    expect(got.dpr, 'the fixture must actually be HiDPI or this proves nothing').toBe(2);
    expect(wantW, 'and wide enough that MapLibre\'s 4096 default would have bound').toBeGreaterThan(4096);
    expect(got.bufW).toBeGreaterThanOrEqual(Math.min(expectW, 4097));
    expect(Math.abs(got.bufW - expectW)).toBeLessThanOrEqual(2);
  });
});

/* ── ③ …AND THE 1× CASE IS UNTOUCHED ──────────────────────────────────────────────────────
   Every round that raised a resolution here also had to prove it did not raise a COST for the
   people it cannot help. #R179 already asserts the tile side of that (a 1× screen requests no
   @2x tile), and deliberately does NOT sniff for "@2x" in general, because js/layer-previews.js
   has always fetched `light_all@2x` thumbnails for the layer panel independently of any
   display — a trap that round records and that the first draft of this file walked straight
   into. So this asserts only what is NEW here: neither the raised canvas cap nor the lowered
   anisotropy gate may change what a 1× session renders. */
test.describe('R180 ③: a 1× screen is exactly as it was', () => {
  test.use({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  test('the drawing buffer still matches CSS pixels — the raised cap cannot bind here', async ({ page }) => {
    await page.goto('/?rafshim=1');
    await ready(page);
    const got = await page.evaluate(() => {
      const cv = window.__imap.getCanvas();
      return { dpr: window.devicePixelRatio, cssW: cv.clientWidth, cssH: cv.clientHeight,
               bufW: cv.width, bufH: cv.height, hiDPI: !!window.__imHiDPITiles,
               pitchGate: window.__imap.getAnisotropicFilterPitch() };
    });
    expect(got.dpr).toBe(1);
    expect(got.bufW, 'one drawing-buffer pixel per CSS pixel, as before').toBe(got.cssW);
    expect(got.bufH).toBe(got.cssH);
    expect(got.hiDPI, 'a 1× screen must not opt into double-density tiles').toBe(false);
    /* the anisotropy gate is not display-dependent — it is the same on every screen, and it
       costs nothing where there is no anisotropy to correct */
    expect(got.pitchGate).toBe(0);
  });
});
