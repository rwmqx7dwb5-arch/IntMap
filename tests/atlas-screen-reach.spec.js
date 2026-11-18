// (atlas-screen-reach) PAGE → Atlas. check:catalog / check:capabilities measure capability → page (does `ui.at` exist).
// This measures the other direction on the LIVE page: every element the page treats as a control must be one
// `system.control` (js/atlas-controls.js findControl) would look at. Enumerated from the DOM, never from a list.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test('every control the page builds is one Atlas can reach', async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.IntMapAtlas, null, { timeout: 45_000 });
  await page.evaluate(() => window.IntMapAtlas.ensure());
  await page.waitForFunction(() => !!(window.IntMapUIAudit && window.IntMapUIAudit.reach), null, { timeout: 45_000 });
  /* open the surfaces that build their controls lazily, the way a reader does — by pressing the page's own buttons */
  const seen = [];
  for (const id of ['btn-settings', 'btn-layers', 'btn-tools', 'btn-news']) {
    await page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); }, id);
    await page.waitForTimeout(400);
    seen.push(await page.evaluate(() => window.IntMapUIAudit.reach()));
  }
  const worst = seen.reduce((a, b) => (b.unreached > a.unreached ? b : a), seen[0]);
  expect(worst.total, 'the audit looked at real controls').toBeGreaterThan(100);
  expect(worst.list, 'controls Atlas cannot reach: ' + JSON.stringify(worst.list.slice(0, 30))).toEqual([]);
  /* the measure can go red: a div that takes a click and a tab stop but is no control Atlas lists is counted */
  const planted = await page.evaluate(() => {
    const d = document.createElement('div'); d.id = 'planted-unreachable'; d.setAttribute('onclick', 'void 0'); d.textContent = 'x'; document.body.appendChild(d);
    const r = window.IntMapUIAudit.reach(); d.remove();
    return r.list.some((x) => x.id === 'planted-unreachable');
  });
  expect(planted, 'reach() names an element that takes a click but is outside findControl').toBe(true);
  await context.close();
});
