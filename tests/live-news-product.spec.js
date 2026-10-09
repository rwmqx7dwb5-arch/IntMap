// live-news-product — «Earthquake record here» in a real page, ONE boot:
//   ① a link `?qh=…,usp0006rew` opens the card through the boot door: the record (the real ComCat answer for Kobe,
//     served for USGS), the 1995 quake's rank, the chart, the decades — and the map holds the record's circles;
//   ② «Show this moment» puts the master clock on 1995-01-16: the card and the map now hold only what was recorded by
//     then, and «Back to now» returns;
//   ③ a radius chip re-reads the record at 100 km (fewer events); the request USGS received names a whole-degree point;
//   ④ Atlas time.quakeHistory reaches the same card through IntMapOS.execute and completes.
// USGS is served from tests/fixtures/quake-history-kobe.json (the answer to the very request the card makes); every
// other external host is blocked.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installHermeticRouting, routeUpstream } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const FIX = readFileSync(new URL('./fixtures/quake-history-kobe.json', import.meta.url), 'utf8');
const KOBE_EVENT = JSON.stringify((() => { const j = JSON.parse(FIX); return j.features.find((f) => f.id === 'usp0006rew'); })());
const POLL = { intervals: [100], timeout: 20_000 };
const qh = (page) => page.evaluate(() => (window.IntMapQuakeHistory ? window.IntMapQuakeHistory.state() : null));

test('live-news-product ①–④ the earthquake record of a place, on the map and the clock', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(ctx);
  const asked = [];
  await routeUpstream(ctx, (u) => /earthquake\.usgs\.gov\/fdsnws\/event\/1\//.test(u), (route) => {
    const u = new URL(route.request().url()); asked.push(u.href);
    const body = u.pathname.endsWith('/count') ? '{"count":387,"maxAllowed":20000}' : (u.searchParams.get('eventid') ? KOBE_EVENT : FIX);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/?qh=34.690,135.190,300,5,usp0006rew#v=135.2000,34.7000,5.00,0,0,f', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    /* ① the link opened the card, and the record arrived */
    await expect.poll(async () => { const s = await qh(page); return s && s.events; }, POLL).toBeGreaterThan(100);
    const pop = page.locator('#qh-popup');
    await expect(pop).toBeVisible();
    /* the boot splash leaves once the map is up; the card was opened under it by the link and is read on the map */
    await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 45_000 });
    await pop.screenshot({ path: test.info().outputPath('quake-record-card.png') });
    await expect(pop.locator('.qh-rank b')).toContainText(/M6\.9/);
    await expect(pop.locator('.qh-svg circle').first()).toBeAttached();
    await expect(pop.locator('.qh-decs rect').first()).toBeAttached();
    await expect.poll(async () => (await qh(page)).painted, POLL).toBeGreaterThan(100);
    const total = (await qh(page)).events;
    expect((await qh(page)).selected).toBe('usp0006rew');
    /* ② the clock to the quake's instant */
    await pop.locator('[data-qh="moment"]').click();
    await expect.poll(() => page.evaluate(() => window.IntMapTime.iso()), POLL).toBe('1995-01-16');
    await expect.poll(async () => (await qh(page)).painted, POLL).toBeLessThan(total);
    await expect(pop.locator('.qh-dyn .nst-day')).toContainText('1995-01-16');
    await expect(pop.locator('.qh-at')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('quake-record-1995.png') });
    await pop.locator('[data-qh="now"]').click();
    await expect.poll(() => page.evaluate(() => window.IntMapTime.isLive()), POLL).toBe(true);
    await expect.poll(async () => (await qh(page)).painted, POLL).toBe(total);
    /* ③ a smaller radius re-reads; USGS only ever saw a whole-degree point */
    await pop.locator('[data-qh-r="100"]').click();
    await expect.poll(async () => { const s = await qh(page); return s.radiusKm === 100 && !s.loading ? s.events : -1; }, POLL).toBeGreaterThan(0);
    expect((await qh(page)).events).toBeLessThan(total);
    expect(asked.length).toBeGreaterThan(0);
    for (const u of asked) expect(u).not.toMatch(/135\.19|34\.69/);
    /* ④ Atlas reaches the same card */
    const r = await page.evaluate(() => window.IntMapOS.execute('time.quakeHistory', { lat: 34.69, lng: 135.19, place: 'Kobe', select: 'largest' })
      .then((x) => ({ status: x.status, ok: x.ok })));
    expect(r.status).toBe('completed');
    await expect.poll(async () => { const s = await qh(page); return s.radiusKm === 300 && s.events; }, POLL).toBe(total);
  } finally { await ctx.close(); }
});
