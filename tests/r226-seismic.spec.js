/* ============================================================================
 *  R226 — the part only a real renderer can answer: ONE intensity field, two questions.
 *   ① the cell and the ceiling — 「MMI震度分布の…解像度を上げて。」
 *   ② the painted raster is fully opaque — 「不透明度100%は全然100%ではない。」
 *
 *  ⚠ ONE BUILD, because a build of this field is ~7 s and the suite has a ceiling
 *  (scripts/test-budget.mjs). Both questions are about the same picture, so both are
 *  asked of the same picture.
 *  ⚠ There is no test here that the row sampler agrees with `at()`. It cannot disagree:
 *  `at()` IS the row sampler (js/map-readout.js), which is stronger than any sampling.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

test('R226 seismic: a 1.0 km cell at a 2,560 ceiling, painted with exactly one transparency', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapCanDraw && window.IntMapCanDraw(), null, { timeout: 60000 });
  await loadLazyModules(page);

  const r = await page.evaluate(async () => {
    const S = window.IntMapSeismic;
    if (!S || !S.open) return { has: false };
    /* ⚠ A SMALL EVENT ON PURPOSE. The gate has a ceiling (scripts/test-budget.mjs) and a 3,000 km
       field is 6.55 M cells. Both questions this file asks are answered by ANY field: the cell target
       is what a narrow span lands on (the ceiling itself is pinned in Node, tests/r226-checks ②), and
       the alpha is a property of every painted pixel. */
    await S.open({ lng: 138.73, lat: 35.36, depth: 12, mw: 6.4 });
    await new Promise(res => setTimeout(res, 1200));
    const t0 = performance.now();
    await S.rebuildField();
    /* ⚠ the panel's own refresh can supersede a build (`seq!==fldSeq` returns early), so waiting on
       the promise alone is not waiting for A field — wait for the state to settle. */
    for (let i = 0; i < 120; i++) {
      const s = S.state(); if (!s.fieldBusy && s.field) break;
      await new Promise(res => setTimeout(res, 1000));
    }
    const wallMs = Math.round(performance.now() - t0);
    const f = S.state().field;
    if (!f) return { has: true, built: false };

    S.setOpacity(1);
    let url = null;
    try { const s = window.__imap && window.__imap.getSource('seis-mmi-img');
      url = (s && (s.url || (s.options && s.options.url))) || null; } catch (_) { }
    let px = null;
    if (url) {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      let opaque = 0, clear = 0, partial = 0;
      for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 255) opaque++; else if (a === 0) clear++; else partial++; }
      px = { opaque, clear, partial, size: bmp.width };
    }
    let layerOp = null; try { layerOp = window.IntMapGeoEngine.layers.getPaint('seis-mmi-fill', 'raster-opacity'); } catch (_) { }
    return { has: true, built: true, wallMs, fieldMs: f.ms, spanKm: f.spanKm, cells: f.cells,
      n: Math.round(Math.sqrt(f.cells)), cellKm: +(f.spanKm / Math.sqrt(f.cells)).toFixed(3),
      demTiles: f.demTiles, painted: f.painted, px, layerOp };
  });
  test.skip(!r.has, 'the seismic simulator is not installed here');
  expect(r.built, 'the field built').toBe(true);
  /* eslint-disable-next-line no-console */
  console.log('R226 intensity field:', JSON.stringify(r));

  /* ── ① the CELL is what the reader sees (#R204: the same N is 0.3 km for an M6 and 3.1 km for an
     M9), so the cell is what is pinned. This span is under the ceiling, so CELL_KM decides it. */
  expect(r.cellKm, 'a 1.0 km cell (or the 640 floor, which is finer)').toBeLessThan(1.06);
  expect(r.n, 'and this is the desktop grid, not the phone one').toBeGreaterThanOrEqual(640);
  expect(r.painted, 'and it painted something').toBeGreaterThan(1000);

  /* ── ② the PNG's own alpha: 0 or 255, never a second hidden transparency */
  test.skip(!r.px, 'the image source did not expose its URL in this build');
  expect(r.px.opaque, 'the raster painted something').toBeGreaterThan(1000);
  expect(r.px.partial, 'no painted pixel carries a second, hidden transparency').toBe(0);
  expect(r.layerOp, 'the slider at 100 % really is 1.0 on the layer').toBe(1);
});
