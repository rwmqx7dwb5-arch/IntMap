/* ============================================================================
 *  curriculum-sales-kit — «Make a tour for this unit» reaches the builder; the handout is one A4 page
 * ----------------------------------------------------------------------------
 *  tests/curriculum-sales-kit-checks.test.mjs holds every link to the registries and reads it back with the app's own
 *  readers; this asks the BUILT app and the browser the two things node cannot:
 *  ① «MAKE A TOUR FOR THIS UNIT», FROM THE PAGE: the link opens the tour builder (not the classroom mode) with the unit's
 *     maps as its steps, the map on the first step, and leaves no tour in the address (a reload does not hand the draft over
 *     again).
 *  ② THE HANDOUT PRINTS ON ONE A4 SHEET, in English and Japanese — printed to PDF by the browser, pages counted.
 *  ⚠ NOT HERE: opening every stated map. MEASURED 2026-10-07 against the built app (hermetic network): each of the 14 stated
 *  layers ticked and was on the map (window.__imLayerPainted), and «where the main crops are grown» was not — its data is a
 *  live GAEZ request the hermetic network refuses — so it was taken out of the data rather than excused here. Kept as a spec
 *  it cost 15 s, the suite's total was then 0.2 min over its ceiling (scripts/test-budget.mjs), and the time may only go down;
 *  each layer's own spec holds its drawing, and the checks hold every stated layer to the share-carried registry.
 *  The network is hermetic (tests/helpers/network.js).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { MODEL } from '../scripts/curriculum-kit.mjs';

const units = MODEL.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units));

test('① «Make a tour for this unit» opens the tour builder with the unit\'s maps as its steps', async ({ browser }) => {
  test.setTimeout(180000);
  const unit = units.find((u) => u.make.jp && u.maps.length >= 2);
  const ctx = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await page.goto('/ja/curriculum.html', { waitUntil: 'load' });
  const href = await page.locator('a[data-unit-make="' + unit.key + '"]').getAttribute('href');
  expect(href).toContain('edit=1');
  await page.locator('a[data-unit-make="' + unit.key + '"]').click();
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  const builder = page.locator('#im-tour-builder');
  await expect(builder, 'the builder is open').toBeVisible({ timeout: 30000 });
  await expect(page.locator('html'), 'the classroom mode is not started').not.toHaveAttribute('data-classroom', '1');
  await expect(builder.locator('li[data-i]'), 'one step per map of the unit').toHaveCount(unit.maps.length);
  await expect(builder.locator('li[data-i="0"] input').first()).toHaveValue(unit.maps[0].title[1]);
  await page.waitForFunction(() => !/[?&]tour=/.test(location.search), null, { timeout: 15000 });
  expect(new URL(page.url()).hash, 'the map is the first step\'s').toBe(unit.maps[0].hash);
  await ctx.close();
});

test('② the school handout prints on one A4 sheet, in English and in Japanese', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf is Chromium\'s');
  const ctx = await browser.newContext();
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  for (const p of ['/school-handout.html', '/ja/school-handout.html']) {
    await page.goto(p, { waitUntil: 'load' });
    await expect(page.locator('button[data-print]'), p + ': the print button is shown once the script runs').toBeVisible();
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages, p + ' prints on one sheet').toBe(1);
    const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box && [Math.round(+box[1]), Math.round(+box[2])], p + ': the sheet is A4 (595 × 842 pt)').toEqual([595, 842]);
  }
  await ctx.close();
});
