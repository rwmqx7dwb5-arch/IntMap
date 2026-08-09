/* SCRATCH — measurement only, deleted before commit. */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
];

for (const vp of VIEWPORTS) {
  test(`measure handover @ ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForFunction(() => {
      try { return !!window.__imap && window.IntMapGeoEngine.canDraw(); } catch (_) { return false; }
    }, null, { timeout: 90000 });
    await page.waitForTimeout(2500);

    const out = await page.evaluate(async () => {
      const G = window.IntMapGeoEngine, S = window.IntMapSpace;
      if (!S) return { err: 'no IntMapSpace' };
      // put the map at its floor, the way the zoom-out gesture leaves it
      const zr = G.camera.zoomRange ? G.camera.zoomRange() : [0, 22];
      G.camera.jumpTo({ center: [139.7, 35.7], zoom: zr[0], pitch: 0, bearing: 0 });
      await new Promise((r) => setTimeout(r, 1500));
      const c = G.camera.getCenter();
      const a = G.coords.project([c.lng, c.lat]), b = G.coords.project([c.lng + 90, c.lat]);
      const mapR = Math.hypot(b.x - a.x, b.y - a.y);
      const before = { zoom: G.camera.get().zoom, minZoom: G.camera.getMinZoom(), mapR };

      S.enterFromZoom();
      await new Promise((r) => setTimeout(r, 900));
      const st = S.state();
      return {
        before, dpr: devicePixelRatio, vh: innerHeight, vw: innerWidth,
        open: st.open, focus: st.focus, atNearLimit: st.atNearLimit,
        axisBlend: st.axisBlend, up: st.up, dist: st.dist,
        // f as the code computes it: earthRadiusPx / (H/2) where H is the DEVICE-pixel canvas height
        mapRoverHalfCssH: mapR / (innerHeight / 2),
      };
    });
    console.log(`\n### ${vp.name} ${vp.width}x${vp.height} →`, JSON.stringify(out, null, 1));
    await ctx.close();
    expect(out.err).toBeUndefined();
  });
}
