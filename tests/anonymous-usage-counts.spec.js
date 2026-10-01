/* ============================================================================
 *  anonymous-usage-counts · the built page's anonymous counter — what it would send, and when it sends nothing
 * ----------------------------------------------------------------------------
 *  The counter only ever SENDS from the production origin, so a local page can never be caught sending;
 *  what it can be asked is what it HAS COUNTED and WOULD send (window.IntMapUsage.preview() returns the
 *  exact request bodies a send would carry) and WHY it is not sending (status().reason). The transport
 *  itself is evaluated in Node with a production origin (tests/anonymous-usage-counts-checks.test.mjs ②).
 *
 *  ONE BOOT, on purpose: the whole suite sits at its measured ceiling (scripts/test-budget.mjs), and every
 *  question below is about the SAME page — so Do Not Track and Global Privacy Control are getters the test
 *  flips at run time (the counter asks for them on every event, which is the behaviour being measured:
 *  turning either on stops it without a reload).
 *    ① the bodies carry only rows the declaration accepts — read with the SAME validator the server uses;
 *    ② Do Not Track, then Global Privacy Control: nothing is recorded, and what was pending is dropped;
 *    ③ the Settings switch: off stops it at once (and discards), and the select shows the choice;
 *    ④ and nothing is beaconed to usage-count from a local page at all, whatever happens on it.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { acceptRow, METRICS } from '../supabase/functions/usage-count/shape.js';

test('anonymous-usage-counts — what the page would send is the declaration; DNT, GPC and the switch each stop it', async ({ page }) => {
  await page.addInitScript(() => {
    window.__beacons = [];
    const real = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
    navigator.sendBeacon = (url, data) => { window.__beacons.push(String(url)); return real ? real(url, data) : true; };
    window.__dnt = null; window.__gpc = false;
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { configurable: true, get: () => window.__dnt });
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => window.__gpc });
  });
  await page.goto('/?utm_source=Newsletter&utm_campaign=a%40b.c', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.IntMapUsage, null, { timeout: 45_000 });
  const status = () => page.evaluate(() => window.IntMapUsage.status());
  const preview = () => page.evaluate(() => window.IntMapUsage.preview());

  /* ① */
  expect(await status(), 'a local page records but never sends').toEqual({ on: true, sending: false, reason: 'local' });
  const bodies = await preview();
  expect(bodies.length).toBeGreaterThan(0);
  const rows = bodies.flatMap((b) => JSON.parse(b).c);
  for (const b of bodies) expect(Object.keys(JSON.parse(b)), 'a body is {c:[…]} and nothing else').toEqual(['c']);
  for (const r of rows) {
    expect(r.length, `a row is [metric, dimension, n]: ${JSON.stringify(r)}`).toBe(3);
    expect(acceptRow(r[0], r[1], r[2]), `outside the declaration: ${JSON.stringify(r)}`).not.toBeNull();
    expect(r[2]).toBeLessThanOrEqual(METRICS[r[0]].max);
  }
  const has = (m, d) => rows.some((r) => r[0] === m && (d === undefined || r[1] === d));
  expect(has('view', ''), 'the page view').toBe(true);
  expect(has('utm_source', 'newsletter'), 'a valid campaign tag, lower-cased').toBe(true);
  expect(has('utm_campaign'), 'a tag that carries an e-mail address is not recorded at all').toBe(false);
  expect(has('lang') && has('device'), 'language and device buckets').toBe(true);
  const ua = await page.evaluate(() => navigator.userAgent);
  expect(bodies.join('\n').includes(ua.slice(0, 20)), 'the User-Agent is not in the payload').toBe(false);

  /* ② Do Not Track, then Global Privacy Control — each stops it on the next event, no reload */
  await page.evaluate(() => { window.__dnt = '1'; });
  expect(await status()).toEqual({ on: true, sending: false, reason: 'dnt' });
  expect(await preview(), 'DNT: nothing is recorded').toEqual([]);
  await page.evaluate(() => { window.__dnt = null; window.__gpc = true; });
  expect(await status()).toEqual({ on: true, sending: false, reason: 'gpc' });
  expect(await preview(), 'GPC: nothing is recorded').toEqual([]);
  await page.evaluate(() => { window.__gpc = false; });

  /* ③ the Settings switch */
  const sel = page.locator('#setting-usage-counts');
  await expect(sel, 'the switch is in the Settings panel').toHaveCount(1);
  expect(await sel.inputValue(), 'on by default').toBe('on');
  await page.evaluate(() => { const s = document.getElementById('setting-usage-counts'); s.value = 'off'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await status()).toEqual({ on: false, sending: false, reason: 'off' });
  expect(await page.evaluate(() => localStorage.getItem('intmap_usage_counts')), 'the choice is remembered on this device').toBe('off');
  expect(await preview(), 'off: nothing is recorded').toEqual([]);
  await page.evaluate(() => window.IntMapUsage.set(true));
  expect(await sel.inputValue(), 'Atlas / the API flips the same select').toBe('on');
  expect(await page.evaluate(() => localStorage.getItem('intmap_usage_counts')), 'on is the default, so nothing is stored for it').toBeNull();

  /* ④ */
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => window.__beacons.filter((u) => /usage-count/.test(u))), 'nothing is beaconed from a local page').toEqual([]);
});
