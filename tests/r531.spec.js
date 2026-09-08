/* ============================================================================
 *  R531 — 昔の国境が、海の上まで引かれていない
 * ----------------------------------------------------------------------------
 *  「昔の国境は海岸より先まであるのが気持ち悪い。1900年以前など。」
 *
 *  1900年のフランスの輪郭には [3.547,43.32] → [3.965,43.541] という**1本の辺**があり、これは
 *  セート沖からル・グロー・デュ・ロワまで約 40 km、まっすぐ海の上を横切る。#R531 はこれを
 *  「直す」のではなく**描かない**——政治的記録の環は「国どうしの境界」と「その記録が持つ海岸線の
 *  写し」の 2 種類の辺でできていて、後者は地図の基図のほうが正確に知っているから
 *  （`data/border-coast.js` / `scripts/build-border-coast.mjs`）。
 *
 *  ⚠ **この検査は「描かれる線そのもの」を読む。** 印のファイルを読む検査は
 *  `tests/r531-checks.test.mjs` にあり、そこでは全リングを再導出して突き合わせている。
 *  ここでしか分からないのは、**その印が実際にレイヤーへ届いているか**——起動して時代を動かし、
 *  `imtb-line` が読んでいる source の中身を見る。scout の実測どおり、#R531 以前は
 *  「線が実際に引かれているか」を測る spec が 1 本も無く、`imtb-ln-src` が空でも全部緑だった。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const CAMERA = { center: [4.1, 43.45], zoom: 8.6 };   /* the Gulf of Lion — the reported view */
const CHORD = [[3.547, 43.32], [3.965, 43.541]];      /* the reported edge */

const READ = () => {
  const o = { poly: 0, lines: 0, coords: 0, layerSource: null, chord: false, attribution: '' };
  try { o.layerSource = window.__imap.getLayer('imtb-line').source; } catch (_) {}
  try { o.poly = window.__imap.getSource('imtb-src').serialize().data.features.length; } catch (_) {}
  try {
    const d = window.__imap.getSource('imtb-ln-src').serialize().data;
    o.lines = d.features.length;
    for (const f of d.features) {
      const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : (g.coordinates || []);
      for (const l of ls) {
        o.coords += l.length;
        for (let i = 0; i < l.length - 1; i++) {
          if (l[i][0] === 3.547 && l[i][1] === 43.32 && l[i + 1][0] === 3.965 && l[i + 1][1] === 43.541) o.chord = true;
        }
      }
    }
  } catch (_) {}
  try { o.attribution = window.__imap.getSource('imtb-ln-src').attribution || ''; } catch (_) {}
  return o;
};

test('R531 ① 1900年に旅すると国境線は出るが、報告された海上の弦は引かれない', async ({ app }) => {
  const page = app.page;
  await page.evaluate((c) => window.__imap.jumpTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0 }), CAMERA);
  await page.evaluate(() => window.IntMapTime.set(new Date('1900-07-01T12:00:00Z'), { source: 'test' }));
  /* the bundle and its marks are two lazy loads — wait for the line source to be filled, not for a timer */
  await page.waitForFunction(() => {
    try { return window.__imap.getSource('imtb-ln-src').serialize().data.features.length > 50; } catch (_) { return false; }
  }, null, { timeout: 60000, polling: 200 });

  const r = await page.evaluate(READ);
  expect(r.layerSource, 'imtb-line must stroke the line source, not the polygons').toBe('imtb-ln-src');
  expect(r.poly, 'the polygons are still the click target and the label anchors').toBeGreaterThan(100);
  expect(r.lines, 'the border line is empty — the era map has no borders at all').toBeGreaterThan(50);
  expect(r.lines, 'every polity draws a line, so nothing was dropped — the marks never arrived').toBeLessThan(r.poly);
  expect(r.coords, 'the line source carries no geometry').toBeGreaterThan(1000);
  expect(r.chord, 'the 40 km chord across the Gulf of Lion is being stroked again').toBe(false);
  expect(r.attribution, 'the line the reader sees must credit the records it comes from').toContain('CShapes');
});

test('R531 ② 現在に戻すと、国境線の source も空になる', async ({ app }) => {
  const page = app.page;
  await page.evaluate(() => window.IntMapTime.set(new Date('1900-07-01T12:00:00Z'), { source: 'test' }));
  await page.waitForFunction(() => {
    try { return window.__imap.getSource('imtb-ln-src').serialize().data.features.length > 0; } catch (_) { return false; }
  }, null, { timeout: 60000, polling: 200 });
  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
  /* an era border left over the present map is the defect #R101 recorded for the polygons */
  await page.waitForFunction(() => {
    try { return window.__imap.getSource('imtb-ln-src').serialize().data.features.length === 0; } catch (_) { return false; }
  }, null, { timeout: 20000, polling: 200 });
});
