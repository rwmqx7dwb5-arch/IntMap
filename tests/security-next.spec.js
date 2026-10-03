// ============================================================================
//  IntMap — 「このページの通信」 in a real browser   (security-next)
//  js/connection-watch.js witnesses what the page contacts from the browser's own accounts; this asks the
//  BROWSER, not the code: requests the page really made (fulfilled by this spec's routes), a WebSocket, and
//  a script the Content Security Policy refused, each must appear in the list (js/connections-panel.js) in
//  the section its row of the statement (data/connection-ledger.json) puts it in — and a host requested
//  after the list is open must appear without reopening it. Playwright's own record of the main frame's
//  finished requests is held against the list, so a request the witness missed is a red test.
// ============================================================================
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const OK = (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('the list shows what the page really contacted, judged against the statement, live', async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  /* registered after the hermetic block, so these win (Playwright runs routes in reverse order of registration) */
  await context.route('https://undeclared.example/**', OK);
  await context.route('https://later.example/**', OK);
  await context.route('https://c.basemaps.cartocdn.com/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: PNG }));
  const page = await context.newPage();
  const finished = new Set();
  page.on('requestfinished', (r) => {
    try {
      if (r.frame() !== page.mainFrame()) return;
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol) && u.host !== new URL(page.url()).host) finished.add(u.host);
    } catch (_) { /* a worker's request has no frame — the list says how it sees those */ }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!document.getElementById('map') && typeof window.IntMapSafe === 'object' && !!document.getElementById('btn-connections'), null, { timeout: 45_000 });

  await page.evaluate(async () => {
    await fetch('https://undeclared.example/probe.json').then((r) => r.text()).catch(() => '');
    await new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = 'https://c.basemaps.cartocdn.com/light_all/1/1/1.png'; });
    try { const ws = new WebSocket('wss://127.0.0.1:9/never'); ws.onerror = () => {}; } catch (_) { /* refused by the browser: nothing to record */ }
    await new Promise((res) => { const s = document.createElement('script'); s.src = 'https://blocked.example/x.js'; s.onerror = res; document.head.appendChild(s); setTimeout(res, 1500); });
  });
  expect(await page.evaluate(() => window.WebSocket.name), 'the wrapped constructor still calls itself WebSocket').toBe('WebSocket');

  await page.evaluate(() => document.getElementById('btn-connections').click());
  const panel = page.locator('#im-conn .modal-content');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator('#im-conn-title')).toContainText(/not named in IntMap|IntMap の記載に名前/, { timeout: 10_000 });

  const where = (host) => page.evaluate((h) => {
    const row = document.querySelector('#im-conn [data-host="' + h + '"]');
    return row ? row.closest('[data-sec]').dataset.sec : null;
  }, host);
  expect(await where('undeclared.example'), 'a host the statement does not name').toBe('unlisted');
  expect(await where('c.basemaps.cartocdn.com'), 'a stated host, grouped by what it is sent').toBe('sends-area');
  expect(await where('127.0.0.1:9'), 'a WebSocket the page opened').toBe('unlisted');
  expect(await where('blocked.example'), 'what the security policy refused is kept apart').toBe('refused');
  expect(await page.locator('#im-conn [data-sec="coverage"]').count(), 'what the list cannot see is always said').toBe(1);

  /* the witness missed nothing the main frame actually finished loading */
  const listed = await page.evaluate(() => [...document.querySelectorAll('#im-conn [data-host]')].filter((r) => r.closest('[data-sec]').dataset.sec !== 'refused').map((r) => r.dataset.host));
  const missed = [...finished].filter((h) => !listed.includes(h));
  expect(missed, 'requests the browser finished that the list does not show').toEqual([]);

  /* live: a host contacted while the list is open appears in it without reopening */
  await page.evaluate(() => fetch('https://later.example/x.json').then((r) => r.text()).catch(() => ''));
  await expect(page.locator('#im-conn [data-host="later.example"]')).toHaveCount(1, { timeout: 5_000 });

  /* Escape closes it through the shared dialog registry */
  await page.keyboard.press('Escape');
  await expect(page.locator('#im-conn')).toBeHidden();
  await context.close();
});
