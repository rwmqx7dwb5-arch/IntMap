/* throwaway — look at the two new layers with my own eyes (deleted before commit) */
import { test } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const SHOT = 'C:/Users/gyuuk/AppData/Local/Temp/claude/C--Users-gyuuk-OneDrive-IntMap/8cf3af58-4d79-46de-b896-e0e1d9b430f5/scratchpad/';

test('look at ww2 then ww1', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1400, height: 900 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, { timeout: 90_000 });

  const open = async (id, day, center, zoom) => {
    await page.evaluate(({ id }) => {
      const el = document.getElementById('dl-' + id);
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id });
    await page.waitForFunction((id) => window.IntMapWarFronts.isOn(id) && document.querySelector('#data-legend-' + id + ' .war-range'), id, { timeout: 60_000 });
    await page.evaluate(({ id, day, center, zoom }) => {
      window.IntMapWarFronts.setDate(id, day);
      window.IntMapGeoEngine.camera.jumpTo({ center, zoom, pitch: 0, bearing: 0 });
    }, { id, day, center, zoom });
    await page.waitForTimeout(6000);
  };

  await open('ww2', '1943-07-05', [22, 50], 3.4);
  await page.screenshot({ path: SHOT + 'r409-ww2.png' });
  const leg2 = await page.locator('#data-legend-ww2').screenshot({ path: SHOT + 'r409-ww2-legend.png' });
  console.log('legend bytes', leg2.length);

  /* and the play button: it must move the layer and NOT the master clock */
  const played = await page.evaluate(async () => {
    const clock0 = window.IntMapTime.iso();
    const d0 = window.IntMapWarFronts.date('ww2');
    document.querySelector('#data-legend-ww2 .ecl-b.ecl-play').click();
    await new Promise((r) => setTimeout(r, 2500));
    const mid = window.IntMapWarFronts.date('ww2');
    document.querySelector('#data-legend-ww2 .ecl-b.ecl-play').click();
    await new Promise((r) => setTimeout(r, 300));
    return { clock0, clock1: window.IntMapTime.iso(), d0, mid, stopped: window.IntMapWarFronts.date('ww2') };
  });
  console.log('PLAY', JSON.stringify(played));

  await page.evaluate(() => { const el = document.getElementById('dl-ww2'); el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await open('ww1', '1916-07-01', [8, 48], 4.0);
  await page.screenshot({ path: SHOT + 'r409-ww1.png' });
  await page.locator('#data-legend-ww1').screenshot({ path: SHOT + 'r409-ww1-legend.png' });

  const info = await page.evaluate(() => ({
    kinds: [...document.querySelectorAll('#data-legend-ww1 .war-kind')].map((e) => e.textContent),
    evs: [...document.querySelectorAll('#data-legend-ww1 .war-ev')].length,
    more: (document.querySelector('#data-legend-ww1 .war-more') || {}).textContent || '',
    labels: window.IntMapGeoEngine.layers.has('ww1-evtlbl'),
  }));
  console.log('LEGEND', JSON.stringify(info));
  await ctx.close();
});
