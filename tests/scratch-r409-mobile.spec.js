/* throwaway — the new legend on a phone: are the controls reachable and is the map still visible? */
import { test } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const SHOT = 'C:/Users/gyuuk/AppData/Local/Temp/claude/C--Users-gyuuk-OneDrive-IntMap/8cf3af58-4d79-46de-b896-e0e1d9b430f5/scratchpad/';

test('ww2 legend on a phone', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({
    storageState: seededStorageState(), viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, { timeout: 90_000 });
  await page.evaluate(() => {
    const el = document.getElementById('dl-ww2');
    el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.IntMapWarFronts.isOn('ww2') && document.querySelector('#data-legend-ww2 .war-range'), null, { timeout: 60_000 });
  await page.evaluate(() => { window.IntMapWarFronts.setDate('ww2', '1944-06-06'); window.IntMapGeoEngine.camera.jumpTo({ center: [2, 49], zoom: 4, pitch: 0, bearing: 0 }); });
  await page.waitForTimeout(5000);
  const collapsed = await page.evaluate(() => {
    const leg = document.getElementById('data-legend-ww2');
    const r = leg.getBoundingClientRect();
    return { collapsedClass: leg.classList.contains('legend-collapsed'), h: Math.round(r.height), legVisible: getComputedStyle(leg.querySelector('.war-leg')).display };
  });
  console.log('COLLAPSED ' + JSON.stringify(collapsed));
  await page.screenshot({ path: SHOT + 'r409-mobile-collapsed.png' });
  await page.evaluate(() => document.querySelector('#data-legend-ww2 .legend-min').click());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT + 'r409-mobile.png' });

  const geo = await page.evaluate(() => {
    const leg = document.getElementById('data-legend-ww2');
    const r = leg.getBoundingClientRect();
    const q = (s) => { const e = leg.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      vw: innerWidth, vh: innerHeight,
      legend: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      scrolls: leg.scrollHeight > leg.clientHeight,
      range: q('.war-range'), play: q('.ecl-b.ecl-play'), day: q('.war-day'), info: q('.war-info'),
      infoScrolls: (() => { const e = leg.querySelector('.war-info'); return e ? e.scrollHeight > e.clientHeight + 1 : null; })(),
    };
  });
  console.log('MOBILE ' + JSON.stringify(geo));
  const why = await page.evaluate(() => {
    const leg = document.getElementById('data-legend-ww2');
    const pl = leg.querySelector('.ecl-player');
    const pb = leg.querySelector('.ecl-b.ecl-play');
    const cs = (e) => { if (!e) return null; const c = getComputedStyle(e); return { display: c.display, visibility: c.visibility, w: c.width, h: c.height, minW: c.minWidth, of: c.overflow }; };
    const lc = getComputedStyle(leg);
    return {
      legendMaxH: lc.maxHeight, legendOverflowY: lc.overflowY, legendH: lc.height,
      peek: getComputedStyle(document.documentElement).getPropertyValue('--peek-h'),
      sheet: getComputedStyle(document.documentElement).getPropertyValue('--sheet-cover'),
      player: cs(pl), playBtn: cs(pb), playHTML: pb ? pb.outerHTML.slice(0, 120) : null,
      playerChildren: pl ? pl.children.length : null,
    };
  });
  console.log('WHY ' + JSON.stringify(why, null, 1));
  await ctx.close();
});
