/* ============================================================================
 *  IntMap · marketing-next — «on this day» in the app: the card in the search's empty state and the sheet
 * ----------------------------------------------------------------------------
 *  The node half (tests/marketing-next-checks.test.mjs) holds the index, the words and the links. This holds what only
 *  the app can show: the empty search field draws today's card (or none on a day the records date nothing to), one tap
 *  on the headline puts the clock on the headline's day through the share link's restore, «All» opens the sheet with
 *  every event of the day, ‹ › step the day, and a row opens its own date. The index is the site's own file; the
 *  words are asked of js/on-this-day.js, the module the app runs.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { eventsOn, headline, describe, stepDay, dayWords } from '../js/on-this-day.js';

async function boot(page) {
  await page.route(/geocoding-api\.open-meteo\.com|nominatim\.openstreetmap\.org|photon\.komoot\.io/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded() && !!window.IntMapTime, null, { timeout: 60_000 });
}
const clockIso = (page) => page.evaluate(() => { const s = window.IntMapTime.state(); return s.isLive ? null : s.iso; });

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the empty search field shows the day\'s card; its headline and the sheet\'s rows open their own dates', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const idx = await (await page.request.get('/data/on-this-day.json')).json();
    const md = await page.evaluate(() => { const d = new Date(); return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const list = eventsOn(idx, md), top = headline(list);
    await page.click('#ms-input');
    await expect(page.locator('#ms-results .sg-strip')).toBeVisible({ timeout: 15_000 });
    if (!top) {
      /* a day the records date nothing to: no card at all, never an empty one */
      await page.waitForTimeout(2000);
      await expect(page.locator('#ms-results .otd-card')).toHaveCount(0);
    } else {
      const card = page.locator('#ms-results .otd-card');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.locator('.otd-top .otd-t')).toHaveText(describe(top, idx, 'en').text);
      await expect(card.locator('.otd-k')).toContainText(dayWords(md, 'en'));
      await card.locator('.otd-top').click();
      await expect.poll(() => clockIso(page), { timeout: 15_000 }).toBe(top.d);
      await expect(page.locator('#ms-results .otd-card')).toHaveCount(0);   /* the search is over: the list closed */
    }
    if (!top) return;   /* without today's card the sheet has no door from the search; Atlas's door is the node half's */
    /* the sheet: today's events, stepped one day forward and back, and a row opened */
    await page.click('#ms-input');
    const target = md;
    await page.locator('#ms-results .otd-all').click();
    const sheet = page.locator('#im-otd');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.otd-row')).toHaveCount(eventsOn(idx, target).length);
    const next = stepDay(target, 1);
    await sheet.locator('.otd-step[data-step="1"]').click();
    await expect(sheet.locator('h2 span')).toHaveText(dayWords(next, 'en'));
    await expect(sheet.locator('.otd-row')).toHaveCount(eventsOn(idx, next).length);
    await sheet.locator('.otd-step[data-step="-1"]').click();
    await expect(sheet.locator('h2 span')).toHaveText(dayWords(target, 'en'));
    const rows = eventsOn(idx, target);
    const pick = rows.findIndex((e) => e.d !== top.d);
    if (pick >= 0) {
      await sheet.locator('.otd-row[data-i="' + pick + '"]').click();
      await expect(sheet).toHaveCount(0);
      await expect.poll(() => clockIso(page), { timeout: 15_000 }).toBe(rows[pick].d);
    }
  });
});
