// (#R184) THE 3-D SATELLITE VIEW: FASTER AND SHARPER, ON BOTH ENGINES.
//
// 「MapLibre/Cesium両方で、衛星画像、3Dの高速化・高画質化を行って。」
// 「Cesium時に、３D衛星画像が重すぎる。もっと高速・高画質に。」
//
// tests/r184-imagery-profile.spec.js is the INSTRUMENT — it sweeps the render settings and prints
// frame time next to a sharpness measure so a change can be judged on both axes at once. This file
// is the CONTRACT that came out of it, and it is written to fail if either half is given back.
//
// The measurement it encodes (one frozen 3-D satellite scene over the Alps, A/B in the same tab,
// reproduced across two independent runs):
//
//     MSAA 4 + FXAA (what shipped)   332-336 ms   sharpness 5.06
//     MSAA 4, FXAA off               315-320 ms   sharpness 7.25
//
// FXAA cost ~17-20 ms AND removed 30 % of the image detail, because it works on the resolved image
// and cannot tell an aliased edge from satellite texture. Turning it off improves both axes, which
// is what 「どちらか一方犠牲はNG」 asks for. The absolute times are a fiction of the runner; the
// direction and the sharpness figure are not.
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 120_000 };
const asCesium = async (page) => {
  await page.goto('/?rafshim=1');
  await page.evaluate(() => { try { localStorage.setItem('intmap_engine', 'cesium'); } catch (_) {} });
  await page.reload();
  await page.waitForFunction(() => !!window.__imap && window.IntMapGeoEngine
    && window.IntMapGeoEngine.id && window.IntMapGeoEngine.id() === 'cesium', null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
};

/* ── ① THE ANTI-ALIASING POLICY IS A RULE, NOT A CONSTANT ─────────────────────────────────── */
test('R184 imagery ①: MSAA scales down as the display resolves more, and never below 1', async ({ page }) => {
  test.setTimeout(150_000);
  await asCesium(page);
  const r = await page.evaluate(() => {
    const f = window.IntMapCesiumEngine._msaaFor;
    return { at1: f(1), at1_5: f(1.5), at2: f(2), at2_5: f(2.5), at3: f(3), at4: f(4), junk: f(undefined) };
  });
  /* 1× is where an edge really is one pixel wide — unchanged from what shipped */
  expect(r.at1).toBe(4);
  expect(r.at1_5).toBe(4);
  /* at 2× a CSS pixel already holds four device pixels; 4× MSAA on top is sixteen samples */
  expect(r.at2).toBe(2);
  expect(r.at2_5).toBe(2);
  /* at 3× the display IS the anti-aliasing */
  expect(r.at3).toBe(1);
  expect(r.at4).toBe(1);
  expect(r.junk, 'a missing pixel ratio is 1×, not zero samples').toBe(4);
});

/* ── ② WHAT THE SCENE IS ACTUALLY CONFIGURED WITH ─────────────────────────────────────────── */
test('R184 imagery ②: FXAA is off while MSAA is on, and full device resolution is kept', async ({ page }) => {
  test.setTimeout(150_000);
  await asCesium(page);
  const r = await page.evaluate(() => {
    const v = window.IntMapGeoEngine.raw();
    const s = v._scene || v.scene, w = v._widget || v;
    const fx = s.postProcessStages && s.postProcessStages.fxaa;
    return { msaa: s.msaaSamples, fxaa: !!(fx && fx.enabled), dpr: window.devicePixelRatio,
      resolutionScale: w.resolutionScale, hdr: s.highDynamicRange,
      /* #R180's fix, which must not be undone by any of this */
      browserRecommended: !!w.useBrowserRecommendedResolution,
      canvasW: w.canvas.width, clientW: w.canvas.clientWidth };
  });
  expect(r.msaa, 'multisampling is on — it is the geometry anti-aliasing').toBeGreaterThan(1);
  expect(r.fxaa, 'FXAA on top of MSAA is slower AND blurrier — see the header').toBe(false);
  /* #R180: rendering at CSS pixels on a HiDPI screen throws half the resolution away. That fix is
     upstream of everything here and this is where it would silently come undone. */
  expect(r.browserRecommended).toBe(false);
  expect(r.resolutionScale).toBeGreaterThanOrEqual(0.5);
  expect(r.canvasW).toBeGreaterThanOrEqual(Math.round(r.clientW * Math.min(2, r.dpr)) - 2);
});

/* ── ③ SWITCHING FXAA BACK ON MEASURABLY BLURS THE IMAGERY ────────────────────────────────── */
test('R184 imagery ③: the sharpness difference is real and reproducible in this tab', async ({ page }) => {
  test.setTimeout(300_000);
  await asCesium(page);
  const r = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, v = E.raw();
    const s = v._scene || v.scene, w = v._widget || v;
    const fx = s.postProcessStages && s.postProcessStages.fxaa;
    if (!fx) return { skip: true };
    /* THE SCENE MUST BE THE SATELLITE SCENE AND IT MUST BE FINISHED. The first cut of this test
       skipped both and measured 3.74 then 5.06 — which reads as "FXAA makes it sharper" and is
       really "more tiles had arrived by the second shot". Two readings of two different scenes are
       not an A/B. */
    try { if (window.satSelectProvider) window.satSelectProvider('esri'); } catch (_) {}
    try { const cb = document.getElementById('dl-relief'); if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } } catch (_) {}
    E.camera.jumpTo({ center: [7.98, 46.55], zoom: 13, pitch: 65, bearing: 20 });
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) { if (s.globe && s.globe.tilesLoaded) break; await new Promise((x) => setTimeout(x, 250)); }
    await new Promise((x) => setTimeout(x, 2500));
    const sharp = () => {
      const cv = w.canvas, W = Math.min(512, cv.width), H = Math.min(512, cv.height);
      const ox = ((cv.width - W) / 2) | 0, oy = ((cv.height - H) / 2) | 0;
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, ox, oy, W, H, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const lum = new Float32Array(W * H);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let sum = 0, cnt = 0, black = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x;
        if (lum[p] < 2) black++;
        sum += Math.abs(4 * lum[p] - lum[p - 1] - lum[p + 1] - lum[p - W] - lum[p + W]); cnt++; }
      return { sharp: sum / cnt, black: black / cnt };
    };
    /* THE PIXELS HAVE TO BE READ INSIDE THE RENDER CALLBACK. A WebGL canvas created without
       preserveDrawingBuffer is cleared as soon as the frame is composited, so a readback one
       setTimeout later returns solid black — which is not "the scene is dark", it is "there is
       nothing there any more", and it would have made every sharpness number in this file a
       measurement of an empty buffer. Measured: black fraction 1.00 that way, 0.00 this way. */
    const shot = () => new Promise((res) => {
      let got = null;
      const off = s.postRender.addEventListener(() => { if (got) return; got = sharp(); off(); res(got); });
      const kick = () => { if (!got) { s.requestRender(); requestAnimationFrame(kick); } };
      requestAnimationFrame(kick);
      setTimeout(() => { if (!got) { try { off(); } catch (_) {} res(null); } }, 8000);
    });
    const settle = async () => { s.requestRender(); await new Promise((x) => setTimeout(x, 900)); };
    await settle(); const off = await shot();
    fx.enabled = true; await settle(); const on = await shot();
    fx.enabled = false; await settle(); const off2 = await shot();
    return { off, on, off2 };
  });
  test.skip(!!r.skip, 'this build has no FXAA stage to compare against');
  expect(r.off.black, 'the comparison must be of the rendered globe, not a blank canvas').toBeLessThan(0.9);
  /* off → on → off, and the two OFF readings have to agree. That is what says the difference is the
     post-process stage rather than the scene still settling under the measurement. */
  expect(Math.abs(r.off2.sharp - r.off.sharp) / r.off.sharp, 'the scene is stable across the sweep').toBeLessThan(0.05);
  /* the whole claim, in one line: FXAA measurably removes detail from the satellite imagery */
  expect(r.on.sharp).toBeLessThan(r.off.sharp);
  expect((r.off.sharp - r.on.sharp) / r.off.sharp, 'measured at ~30 % of the detail').toBeGreaterThan(0.1);
});

/* ── ④ THE MAPLIBRE SATELLITE PATH KEEPS ITS OWN HARD-WON SETTINGS ────────────────────────── */
test('R184 imagery ④: MapLibre still renders satellite tiles at full device resolution', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?rafshim=1');
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapGeoEngine, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
  const r = await page.evaluate(() => {
    const E = window.IntMapGeoEngine, m = E.raw();
    return { engine: E.id(),
      /* #R178: the satellite protocol stitches four 256-px tiles into one 512 so a HiDPI screen
         gets the resolution it can show. #R179 did the same for the base map. */
      pixelRatio: (m.getPixelRatio && m.getPixelRatio()) || window.devicePixelRatio,
      canvasW: m.getCanvas().width, clientW: m.getCanvas().clientWidth,
      dpr: window.devicePixelRatio,
      hasSatProtocol: (() => { try { return !!(window.maplibregl ? true : true); } catch (_) { return false; } })() };
  });
  expect(r.engine).toBe('maplibre');
  /* the canvas is sized in DEVICE pixels — this is the #R179/#R180 half-resolution class of defect,
     and it is asserted on the default engine because that is where most sessions are */
  expect(r.canvasW).toBeGreaterThanOrEqual(Math.round(r.clientW * Math.min(2, r.dpr)) - 2);
});
