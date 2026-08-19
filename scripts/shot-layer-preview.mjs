/* ============================================================================
 *  IntMap · THE LAYER TILE'S THUMBNAIL IS A REAL SCREENSHOT   (#R268)
 * ----------------------------------------------------------------------------
 *  「年降水量レイヤーは…サムネイル画像（実スクリーンショット）をつけるように。」
 *
 *  js/layer-previews.js gives every layer tile a picture. Most are the layer's own upstream tile at
 *  a recognisable place; six are `preview_*.png` in the repo root — actual captures of THIS app with
 *  THAT layer on, which is what #R79f/#R79g asked for and what a reader recognises. The annual
 *  precipitation layer had no entry at all, so its tile fell back to the generic swatch.
 *
 *  This is how that capture is made, so it is repeatable rather than a file somebody once produced:
 *
 *      npm run preview            (or any served build)  → http://127.0.0.1:4268
 *      node scripts/shot-layer-preview.mjs preview_precip.png
 *
 *  Real Chromium through Playwright, because the picture IS the point: the in-app browser pane does
 *  not composite (see the standing note on headless preview limits) and its canvas readback returns
 *  plausible nonsense. The app's own chrome is hidden first so the tile shows the MAP, and the crop
 *  is 240:121 — the tile's aspect-ratio in js/layer-previews.js — so nothing is ever stretched.
 * ==========================================================================*/
import { chromium } from '@playwright/test';

const BASE = process.env.IM_BASE || 'http://127.0.0.1:4268';
const OUT = process.argv[2] || 'preview_precip.png';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 960, height: 620 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console error:', m.text().slice(0, 140)); });
await page.goto(BASE + '/?cb=shot', { waitUntil: 'load' });
await page.waitForFunction(() => window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60000 });

await page.evaluate(() => {
  /* ⚠ whatever is on BY DEFAULT is in the picture too — the submarine-cable layer draped coloured
     lines over the whole first capture. Everything thematic goes off; the basemap and its labels
     stay, because that is what makes the tile recognisable (the same choice preview_basemap.png
     made). */
  document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach((cb) => {
    if (!cb.checked) return;
    if (/^cb-(names|geolabels|borders|admin1)$/.test(cb.id)) return;
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const cb = document.getElementById('dl-annprecip');
  if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  window.__imap.jumpTo({ center: [96, 16], zoom: 3.05, pitch: 0, bearing: 0 });
});
await page.waitForTimeout(9000);
/* the layer is a single image source — wait until it is actually painted */
const painted = await page.evaluate(() => {
  try { return !!window.IntMapGeoEngine.layers.has('lyr-annprecip') && window.IntMapGeoEngine.layers.getLayout('lyr-annprecip', 'visibility') === 'visible'; } catch (_) { return false; }
});
console.log('layer painted:', painted);
/* ⚠ HIDE THE SIBLINGS ALONG THE CANVAS'S ANCESTOR CHAIN, NOT A LIST OF SELECTORS. A hand-written
   list hits a SHELL sooner or later — `.operation-room` and `#map-container` are ancestors of the
   map, and the first attempt at this hid one of them and produced a blank grey picture. Walking up
   from the canvas and hiding everything BESIDE the chain leaves exactly the map, whatever the
   chrome is called this round. */
await page.evaluate(() => {
  const cv = document.querySelector('.maplibregl-canvas') || document.querySelector('canvas');
  if (!cv) return;
  for (let n = cv; n && n.parentElement && n !== document.body; n = n.parentElement) {
    for (const sib of [...n.parentElement.children]) if (sib !== n) sib.style.display = 'none';
  }
});
await page.waitForTimeout(1500);
/* 240:121 is the tile's aspect-ratio (js/layer-previews.js) — crop the VIEWPORT, never stretch.
   ⚠ not an element clip: the chrome above is hidden with `display:none`, and an element whose
   ancestor is hidden has no bounding box at all (measured: `boundingBox()` returned null). */
const vp = page.viewportSize();
/* 480 px wide is twice the tile's own 240, which is where the other preview_*.png files sit
   (83–239 kB); the layer's banded palette compresses well at that size. */
const W = Math.min(vp.width, 480), H = Math.round(W * 121 / 240);
await page.screenshot({
  path: OUT,
  clip: { x: Math.round((vp.width - W) / 2), y: Math.round((vp.height - H) / 2), width: W, height: H },
});
console.log('wrote', OUT);
await b.close();
