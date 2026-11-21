/* ============================================================================
 *  globe-polish — THE MAP'S RENDER RESOLUTION FOLLOWS THE SCREEN'S, NOT THE SCREEN AT BOOT
 * ----------------------------------------------------------------------------
 *  MapLibre's getPixelRatio() is `_overridePixelRatio ?? devicePixelRatio`; the app passes `pixelRatio`
 *  explicitly, which freezes it at boot. Browser zoom (Ctrl +/-) and dragging the window to another monitor
 *  change devicePixelRatio afterwards, and the canvas stayed at the old ratio: place names, borders and glyphs
 *  drawn at 1× and stretched (the «blurred labels» report). The page is booted at dpr 1, the browser's own
 *  emulation then moves it to dpr 2 (and the viewport shrinks by a pixel, as real browser zoom also changes the CSS width, so the window fires resize), and what is measured
 *  is the canvas the reader sees: its backing store must reach 2× its CSS size.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers/app.js';

test('the canvas re-renders at the new devicePixelRatio after a zoom / monitor change', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'device metrics emulation is CDP');
  await bootPage(page);
  const read = () => page.evaluate(() => {
    const c = window.__imap.getCanvas();
    return { dpr: window.devicePixelRatio, pr: window.__imap.getPixelRatio(), ratio: c.width / c.clientWidth };
  });
  const before = await read();
  expect(before.pr).toBeCloseTo(before.dpr, 2);

  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize();
  const target = before.dpr >= 2 ? 1 : 2;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width - 1, height: vp.height, deviceScaleFactor: target, mobile: false });

  await expect.poll(async () => (await read()).pr, { timeout: 10000 }).toBeCloseTo(target, 2);
  await expect.poll(async () => (await read()).ratio, { timeout: 10000 }).toBeCloseTo(target, 1);
});
