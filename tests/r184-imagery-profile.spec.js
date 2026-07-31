// (#R184) WHERE THE 3-D SATELLITE FRAME TIME GOES — measured, both axes at once.
//
// 「MapLibre/Cesium両方で、衛星画像、3Dの高速化・高画質化を行って。」
// 「Cesium時に、３D衛星画像が重すぎる。もっと高速・高画質に。」
// 「表示速度、画質を高めて。どちらか一方犠牲はNG」
//
// #R183 established the SIZE of the problem and could not find its cause: the same scene costs
// MapLibre ~9 ms above this environment's floor and Cesium ~140 ms, and two hypotheses were killed
// (tileCacheSize made no difference; five of the six imagery layers are show:false). What it could
// not do was attribute the remaining time, because "is it slow?" and "did it get worse-looking?"
// were being asked with different instruments at different times.
//
// This file asks them with ONE instrument, on ONE frozen scene, A/B against a control:
//   · SPEED   — median frame time over N settled frames, with the camera held still so tile
//               streaming is not being measured instead of rendering;
//   · QUALITY — the mean absolute Laplacian of the rendered pixels, read back from the canvas.
//               That is a sharpness measure: blurring an image lowers it, and resolving an aliased
//               edge barely touches it, so it distinguishes "smoother" from "softer" — which is
//               exactly the distinction a post-process anti-aliasing stage blurs over.
//
// The ABSOLUTE frame times here are a fiction of the runner (#R183: a hidden pane with an rAF shim
// tops out near 25 fps). The DIFFERENCES between two configurations measured back to back in the
// same tab are not, and that is all this file claims.
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

/* The measurement, installed in the page once and reused by every case below. */
const HARNESS = () => {
  const E = window.IntMapGeoEngine;
  /* the Cesium VIEW object (not a Cesium.Viewer): it owns _scene, _widget and _globe. Reached
     through the contract's raw() so this file names no renderer of its own. */
  const raw = () => E.raw();
  const scn = () => { const v = raw(); return v && (v._scene || (v.scene)); };
  const wid = () => { const v = raw(); return v && (v._widget || v); };
  /* one frozen scene: satellite imagery, real terrain, a tilted close view over the Alps */
  window.__prof = {
    async scene() {
      try { const cb = document.getElementById('dl-relief'); if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } } catch (_) {}
      try { if (window.satSelectProvider) window.satSelectProvider('esri'); } catch (_) {}
      E.camera.jumpTo({ center: [7.98, 46.55], zoom: 13, pitch: 65, bearing: 20 });
      /* wait for the tiles: measuring while imagery streams measures the network */
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        let done = false;
        try { const s = scn(); done = !!(s && s.globe && s.globe.tilesLoaded); } catch (_) {}
        if (done) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 1200));
      return Date.now() - t0;
    },
    /* median frame time over `n` frames, with the camera held still */
    async frames(n) {
      const s = scn();
      const times = [];
      let last = performance.now();
      await new Promise((res) => {
        const off = s.postRender.addEventListener(() => {
          const now = performance.now(); times.push(now - last); last = now;
          if (times.length >= n) { off(); res(); }
        });
        /* requestRenderMode is on, so a still camera draws nothing — ask for each frame */
        const kick = () => { if (times.length < n) { s.requestRender(); requestAnimationFrame(kick); } };
        requestAnimationFrame(kick);
        setTimeout(() => { try { off(); } catch (_) {} res(); }, 20000);
      });
      times.sort((a, b) => a - b);
      return { n: times.length, median: times[Math.floor(times.length / 2)] || null,
        p25: times[Math.floor(times.length * 0.25)] || null };
    },
    /* mean |Laplacian| over the rendered pixels — higher is sharper */
    sharpness() {
      const cv = wid().canvas;
      const W = Math.min(512, cv.width), H = Math.min(512, cv.height);
      const ox = Math.max(0, ((cv.width - W) / 2) | 0), oy = Math.max(0, ((cv.height - H) / 2) | 0);
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, ox, oy, W, H, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const lum = new Float32Array(W * H);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let sum = 0, cnt = 0, black = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (lum[p] < 2) black++;
        sum += Math.abs(4 * lum[p] - lum[p - 1] - lum[p + 1] - lum[p - W] - lum[p + W]); cnt++;
      }
      return { sharp: sum / Math.max(1, cnt), blackFrac: black / Math.max(1, cnt), w: W, h: H };
    },
    /* what the renderer is actually configured with, read back rather than assumed */
    config() {
      const s = scn(), g = s.globe;
      return { msaa: s.msaaSamples, fxaa: !!(s.postProcessStages && s.postProcessStages.fxaa && s.postProcessStages.fxaa.fxaa !== undefined ? s.postProcessStages.fxaa.enabled : (s.postProcessStages && s.postProcessStages.fxaa && s.postProcessStages.fxaa.enabled)),
        sse: g.maximumScreenSpaceError, tileCache: g.tileCacheSize,
        resolutionScale: wid().resolutionScale, dpr: window.devicePixelRatio,
        w: wid().canvas.width, h: wid().canvas.height,
        hdr: s.highDynamicRange, lighting: g.enableLighting,
        imagery: s.imageryLayers.length,
        shownImagery: (() => { let k = 0; for (let i = 0; i < s.imageryLayers.length; i++) if (s.imageryLayers.get(i).show) k++; return k; })(),
        aniso: (() => { try { return s.context._gl.getParameter(s.context._gl.getExtension('EXT_texture_filter_anisotropic') ? 0x84FF : 0); } catch (_) { return null; } })() };
    },
  };
};

test('R184 imagery: attribute the Cesium 3-D satellite frame time, and check quality both ways', async ({ page }) => {
  test.setTimeout(600_000);
  await asCesium(page);
  await page.evaluate(HARNESS);
  const load = await page.evaluate(() => window.__prof.scene());
  const base = await page.evaluate(() => window.__prof.config());
  console.log('R184 imagery · scene loaded in', load, 'ms · config', JSON.stringify(base));

  /* ── the A/B sweep. Each case is applied, settled, then measured for speed AND sharpness. ── */
  const cases = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, raw = () => E.raw();
    const scn = () => { const v = raw(); return v && (v._scene || v.scene); };
    const wid = () => { const v = raw(); return v && (v._widget || v); };
    const s = scn(), g = s.globe;
    const fx = s.postProcessStages && s.postProcessStages.fxaa;
    const out = [];
    const measure = async (name) => {
      s.requestRender();
      await new Promise((r) => setTimeout(r, 900));
      const f = await window.__prof.frames(24);
      const q = window.__prof.sharpness();
      out.push({ name, ms: f.median, p25: f.p25, frames: f.n, sharp: q.sharp, black: q.blackFrac });
    };
    const set = (o) => {
      if (o.msaa != null) s.msaaSamples = o.msaa;
      if (o.fxaa != null && fx) fx.enabled = o.fxaa;
      if (o.sse != null) g.maximumScreenSpaceError = o.sse;
      if (o.res != null) wid().resolutionScale = o.res;
    };
    const START = { msaa: s.msaaSamples, fxaa: fx ? fx.enabled : null, sse: g.maximumScreenSpaceError, res: wid().resolutionScale };

    const ATM = { ground: g.showGroundAtmosphere, sky: !!(s.skyAtmosphere && s.skyAtmosphere.show), fog: !!(s.fog && s.fog.enabled) };
    await measure('control (as shipped)');
    set({ fxaa: false }); await measure('MSAA 4, FXAA off');
    set({ msaa: 2 }); await measure('MSAA 2, FXAA off');
    set({ msaa: 1 }); await measure('MSAA 1, FXAA off');
    set({ msaa: 1, fxaa: true }); await measure('MSAA 1, FXAA on');
    set({ msaa: 2, fxaa: false, sse: 3 }); await measure('MSAA 2, FXAA off, SSE 3');
    set({ sse: 4 }); await measure('MSAA 2, FXAA off, SSE 4');
    /* the per-fragment costs a GLOBE has and a flat map does not: ground atmosphere is
       scattering evaluated on every globe fragment, sky atmosphere is a full-screen pass, and
       fog also drives tile LOD. If the 4x is "a globe costs more than a plane", it is here. */
    set({ msaa: START.msaa, fxaa: false, sse: START.sse });
    g.showGroundAtmosphere = false; await measure('MSAA 4, no FXAA, no ground atm');
    if (s.skyAtmosphere) s.skyAtmosphere.show = false; await measure('  + no sky atmosphere');
    if (s.fog) s.fog.enabled = false; await measure('  + no fog');
    g.showGroundAtmosphere = ATM.ground; if (s.skyAtmosphere) s.skyAtmosphere.show = ATM.sky; if (s.fog) s.fog.enabled = ATM.fog;
    set({ sse: START.sse, msaa: START.msaa, fxaa: START.fxaa }); await measure('control again');
    return { out, START, ATM };
  });

  console.log('\nR184 imagery · Cesium 3-D satellite, same frozen scene:');
  console.log('  case                          frame ms   sharpness');
  cases.out.forEach((c) => {
    console.log('  ' + c.name.padEnd(30) + String(c.ms == null ? '—' : c.ms.toFixed(1)).padStart(7)
      + '   ' + (c.sharp == null ? '—' : c.sharp.toFixed(2)).padStart(8) + '  (' + c.frames + ' frames, black ' + (c.black * 100).toFixed(0) + '%)');
  });

  /* The scene has to have actually rendered something, or every number above is about a blank
     canvas — which is the way this whole measurement could quietly be worthless. */
  const ctrl = cases.out[0];
  expect(ctrl.black, 'the measured frames must contain the rendered globe, not an empty canvas').toBeLessThan(0.9);
  expect(ctrl.sharp).toBeGreaterThan(0);
  expect(ctrl.frames).toBeGreaterThan(4);
});
