// hist-product — 「政体の盛衰」 in a real page: the Chronos panel's door, the ranking, the search, one polity's chart, and the
// clock moved by the sheet's own buttons and by a tap on the chart.
//   ① the Chronos panel opens the sheet; with nothing asked it ranks the polities by their largest drawn extent, read from
//     data/polity-arcs.json (the first row is the index's first dated polity — not a list written here);
//   ② the search finds the Mongol Empire by its Japanese name; its page states the first, last and largest years as the
//     index does, draws one bar per drawn state and names the record;
//   ③ «Go to its largest» moves the master clock to 1 July of that year; a tap on the chart's left edge moves it to the
//     first year drawn; the hover readout states the year and the area.
// On the shared page (tests/helpers/app.js — no boot of its own; the suite's time is budgeted, scripts/test-budget.mjs).
import { test, expect } from './helpers/app.js';
import { readFileSync } from 'node:fs';

const IDX = JSON.parse(readFileSync(new URL('../data/polity-arcs.json', import.meta.url), 'utf8'));
const BOOT = { timeout: 45_000 };

test('hist-product ①–③ rise and fall: ranking, search, chart and the clock', async ({ app }) => {
  const page = app.page;
  try {
    await page.waitForFunction(() => !!(window.IntMapTime && document.getElementById('ntl-toggle')), null, BOOT);
    await page.evaluate(() => { const tl = document.getElementById('news-timeline'), tg = document.getElementById('ntl-toggle'); if (tl && tg && tl.classList.contains('collapsed')) tg.click(); });
    /* ① the door and the ranking */
    const door = page.locator('#ntl-polityarc');
    await expect(door).toBeVisible(BOOT);
    await door.click();
    const sheet = page.locator('#pa-sheet');
    await expect(sheet).toBeVisible(BOOT);
    const firstDated = IDX.arcs.find((a) => a.d && a.d.length);
    await expect(sheet.locator('.pa-results .pa-row').first()).toContainText(new RegExp(firstDated.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + (firstDated.j || '\u0000')), BOOT);
    /* ② the search, in Japanese */
    const mongol = IDX.arcs.find((a) => a.n === 'Mongol Empire');
    expect(mongol, 'the index draws the Mongol Empire').toBeTruthy();
    await sheet.locator('.pa-q').fill(mongol.j || mongol.n);
    await sheet.locator('.pa-results .pa-row').first().click();
    await expect(sheet.locator('.pa-name')).toBeVisible(BOOT);
    await expect(sheet.locator('.pa-facts')).toContainText(String(mongol.pk[0]));
    await expect(sheet.locator('.pa-facts')).toContainText(mongol.pk[1].toLocaleString('en-US'));
    const bars = await sheet.locator('.pa-chart rect.pa-bar').count();
    expect(bars, 'one bar per drawn state').toBe(mongol.d.filter((p) => p[1] > 0).length);
    await expect(sheet.locator('.pa-src')).toContainText('Cliopatria');
    /* ③ the clock follows the sheet */
    await sheet.locator('[data-act="peak"]').click();
    await expect.poll(() => page.evaluate(() => window.IntMapTime.state().iso.slice(0, 10)), { timeout: 10_000, intervals: [100] }).toBe(String(mongol.pk[0]).padStart(4, '0') + '-07-01');
    const box = await sheet.locator('.pa-chart').boundingBox();
    await page.mouse.click(box.x + 3, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => window.IntMapTime.state().iso.slice(0, 4)), { timeout: 10_000, intervals: [100] }).toBe(String(mongol.d[0][0]).padStart(4, '0'));
    /* the hover readout states the year and the drawn area */
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
    await expect(sheet.locator('.pa-read')).toContainText('km²');
    await sheet.locator('.pa-x').click();
    await expect(sheet).toBeHidden();
  } finally {
    await page.evaluate(() => { try { window.IntMapTime.setNow({ source: 'test' }); } catch (_) { /* no clock */ } const s = document.getElementById('pa-sheet'); if (s) s.hidden = true; }).catch(() => {});
  }
});
