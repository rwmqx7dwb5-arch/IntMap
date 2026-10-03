// sales-next — the browser half of tests/sales-next-checks.test.mjs: what only a real page can answer.
//   ① a declared tour opened in the classroom mode becomes a worksheet: the printer button walks every step, each
//     step's map is pictured (a PNG that DECODES at the postcard's size), the student sheet carries the questions and
//     answer lines and no teacher text, the teacher sheet adds what to read out and an address per step, the print
//     media shows the paper and nothing else, and closing it leaves the tour where the teacher was.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test('sales-next ① a classroom tour on paper — every step pictured, student and teacher sheets, print shows only the paper', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  try {
    await page.goto('/?tour=ww1-europe&step=2', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.locator('#im-tour')).toBeVisible({ timeout: 60_000 });
    const sheetBtn = page.locator('#im-tour [data-imt="sheet"]');
    await expect(sheetBtn).toBeVisible();
    const steps = await page.locator('#im-tour .imt-dot').count();
    expect(steps).toBeGreaterThanOrEqual(2);

    await sheetBtn.click();
    await expect(page.locator('#im-worksheet')).toBeVisible({ timeout: 200_000 });
    await expect(page.locator('#im-worksheet-progress')).toHaveCount(0);

    /* the student sheet: one section per step, every map pictured and decodable, questions and lines, no teacher text */
    const paper = page.locator('#im-worksheet .imw-paper');
    await expect(paper.locator('.imw-step')).toHaveCount(steps);
    await expect(paper.locator('.imw-miss')).toHaveCount(0);
    const sizes = await paper.locator('.imw-step img').evaluateAll(async (imgs) => Promise.all(imgs.map(async (i) => { await i.decode(); return [i.naturalWidth, i.naturalHeight]; })));
    expect(sizes).toEqual(Array(steps).fill([1200, 630]));
    await expect(paper.locator('.imw-ask')).toHaveCount(steps);
    await expect(paper.locator('.imw-lines')).toHaveCount(steps);
    await expect(paper.locator('.imw-say')).toHaveCount(0);
    await expect(paper.locator('.imw-link')).toHaveCount(0);
    await expect(paper.locator('.imw-who')).toHaveCount(1);
    await expect(paper.locator('.imw-unit')).toHaveCount(1);   /* ww1-europe declares one curriculum unit */
    expect(((await paper.locator('.imw-foot').textContent()) || '').length).toBeGreaterThan(20);   /* the credits, in text */

    /* the teacher sheet */
    await page.locator('#im-worksheet .imw-seg button').nth(1).click();
    await expect(paper.locator('.imw-say')).toHaveCount(steps);
    const links = await paper.locator('.imw-link').allTextContents();
    expect(links.length).toBe(steps);
    links.forEach((l, i) => expect(l).toContain('index.html?tour=ww1-europe&step=' + (i + 1)));

    /* on paper: only the worksheet, without its toolbar */
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({
      sheet: getComputedStyle(document.getElementById('im-worksheet')).display,
      bar: getComputedStyle(document.querySelector('#im-worksheet .imw-bar')).display,
      room: getComputedStyle(document.querySelector('.operation-room')).display,
      tour: getComputedStyle(document.getElementById('im-tour')).display,
    }));
    expect(printed).toEqual({ sheet: 'block', bar: 'none', room: 'none', tour: 'none' });
    await page.emulateMedia({ media: 'screen' });

    /* the preview holds the keys: a right arrow does not move the tour underneath */
    await page.keyboard.press('ArrowRight');
    await page.locator('#im-worksheet [data-imw="close"]').click();
    await expect(page.locator('#im-worksheet')).toHaveCount(0);
    await expect(page.locator('#im-tour .imt-dot[aria-current="step"]')).toHaveAttribute('data-imt-go', '1');   /* back on step 2 */
    expect(await page.evaluate(() => new URLSearchParams(location.search).get('step'))).toBe('2');
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});
