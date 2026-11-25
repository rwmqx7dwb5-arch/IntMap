/* ============================================================================
 *  atlas-answer-sources · how a real answer shows its sources
 * ----------------------------------------------------------------------------
 *  The core is run in tests/atlas-answer-sources-checks.test.mjs. This is the reader's half, on the harness of
 *  tests/atlas-cited-answers.spec.js (only ai-proxy played). The answer cites two pages as 「(apnews.com)」:
 *    ① the cited hosts are chips, not underlined links; one pair of brackets is one cluster
 *    ② the chip's card (hover) names the host and offers the original article
 *    ③ the list counts the pages once each and does NOT count the background map's credits, which stand apart
 *    ④ on a phone the first press opens the card instead of leaving the page
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

const FAKE_SESSION = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-00000000c17f', aud: 'authenticated', role: 'authenticated',
    email: 'chips.reader@example.invalid', app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Chips Reader' }, created_at: new Date().toISOString() },
};
const ANSWER = '## 状況\n\n停戦協議が続いています ([apnews.com](https://apnews.com/article/a1))。被害も報じられました ([reuters.com](https://www.reuters.com/world/r1), [apnews.com](https://apnews.com/article/a1))。';
let turns = 0;

async function boot(browser, viewport) {
  const context = await browser.newContext({ viewport, storageState: seededStorageState(), hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess)); } catch { /* ignore */ }
  }, FAKE_SESSION);
  await context.route('**/functions/v1/ai-proxy', async (route) => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
    let text = '{}', extra = {};
    if (String(body.task || '') === 'atlas_turn' && body.protocol === 2) {
      turns++;
      text = JSON.stringify({ turn: 'final', final_text: ANSWER });
      extra = { output: [], meta: { protocol: 2 }, citations: [{ url: 'https://apnews.com/article/a1', title: 'Ceasefire talks continue' }, { url: 'https://www.reuters.com/world/r1', title: 'Strikes reported' }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ text, used: 1, limit: 100, charged: true }, extra)) });
  });
  const page = await context.newPage();
  const diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-in', { timeout: 30_000 });
  await page.fill('#atlas-panel .atl-in', '最近の東欧情勢について教えて');
  await page.click('#atlas-panel .atl-go');
  await page.waitForSelector('#atlas-panel a.atl-sc', { timeout: 90_000 });
  return { context, page, diag };
}

test('① hosts in brackets are chips; the cluster and the dedupe hold on a desktop panel', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page, diag } = await boot(browser, { width: 1280, height: 900 });
  try {
    const got = await page.evaluate(() => {
      const b = document.querySelector('#atlas-panel a.atl-sc').closest('.atl-b');
      return {
        chips: [...b.querySelectorAll('a.atl-sc')].map((a) => a.getAttribute('data-host')),
        blueLinks: b.querySelectorAll('.atl-md a.atl-a').length,
        h2: parseFloat(getComputedStyle(b.querySelector('h2.atl-h2')).fontSize) / parseFloat(getComputedStyle(b.querySelector('.atl-md')).fontSize),
      };
    });
    expect(got.chips).toEqual(['apnews.com', 'reuters.com', 'apnews.com']);
    expect(got.blueLinks).toBe(0);
    expect(got.h2, 'a heading is not twice the sentence under it').toBeLessThan(1.35);
    /* ② the card */
    await page.locator('#atlas-panel a.atl-sc').first().hover();
    await expect(page.locator('.atl-scard')).toBeVisible();
    await expect(page.locator('.atl-scard')).toContainText('apnews.com');
    await expect(page.locator('.atl-scard .atl-scard-open')).toHaveAttribute('href', 'https://apnews.com/article/a1');
    /* ③ two distinct pages, counted once each */
    const sum = await page.locator('#atlas-panel details.atl-srcs > summary').last().textContent();
    expect(sum).toMatch(/· 2\b/);
    expect(diag.pageErrors || [], 'no page errors').toEqual([]);
  } finally { await context.close(); }
});

test('④ on a phone the first press opens the card and does not leave the page', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await boot(browser, { width: 390, height: 780 });
  try {
    const before = page.url();
    await page.locator('#atlas-panel a.atl-sc').first().tap();
    await expect(page.locator('.atl-scard')).toBeVisible();
    expect(page.url()).toBe(before);
    expect(context.pages().length, 'no new tab was opened').toBe(1);
    const box = await page.locator('.atl-scard').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  } finally { await context.close(); }
});
