/* ============================================================================
 *  supporter-funnel — the support offer, as a reader meets it
 * ----------------------------------------------------------------------------
 *  ① when the reader is told today's Atlas questions are gone, ONE small non-modal card appears;
 *  ② «Not now» puts it to sleep — the same signal again does not bring it back, and the sleep is kept
 *    on the device (what a reload reads; the rule itself is evaluated in the node checks ④);
 *  ③ the support panel shows «where support goes», with this month's figure when the record answers
 *    and «could not be loaded» (not zero) when it does not;
 *  ④ the Stripe link follows the language: the JPY page for Japanese, the USD page otherwise.
 *
 *  The signal is the one js/ai-core.js raises where it tells a signed-in reader they are out
 *  (`intmap:ai-limit`; tests/supporter-funnel-checks.test.mjs ⑥ holds ai-core to raising it at
 *  exactly those places). A signed-in session cannot be made in a test run, so this file starts
 *  at the signal and measures everything the reader then sees.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ONE BOOTED PAGE PER WORKER (tests/helpers/app.js): this file asks about what happens after the boot,
   so it does not pay for one of its own. Its state is put back at the end (the offer's record, the
   language) so the next file on the worker meets the page as it was. The database is never reached:
   every call to operating_stats is answered here, so the result does not depend on whether the
   migration has been applied where the page points. */
test.describe.configure({ mode: 'serial' });

let page;
const STORE = 'intmap.supporter.v1';
const RPC = '**/rest/v1/rpc/operating_stats*';
test.beforeAll(async ({ app }) => { page = app.page; await page.evaluate((k) => localStorage.removeItem(k), STORE); });
test.afterAll(async () => {
  await page.unroute(RPC).catch(() => {});
  await page.evaluate((k) => { localStorage.removeItem(k); const c = document.getElementById('supporter-offer'); if (c) c.hidden = true; }, STORE).catch(() => {});
});

const BOOT = { timeout: 45_000 };
const offer = () => page.locator('#supporter-offer');
const limitSignal = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('intmap:ai-limit')));
const setLang = async (code) => {
  const tag = code === 'jp' ? 'ja' : code;
  if (await page.evaluate((t) => document.documentElement.lang === t, tag)) return;   // already there: a switch re-renders the page for nothing
  await page.evaluate((c) => document.getElementById('lang-' + c)?.click(), code);
  await page.waitForFunction((tag) => document.documentElement.lang === tag, code === 'jp' ? 'ja' : code, BOOT);
};
const openPanel = () => page.evaluate(() => document.getElementById('btn-blueberry').click());
const closePanel = () => page.evaluate(() => document.getElementById('blueberry-close-x').click());

test('①the daily-limit signal raises one small card that does not block the map', async () => {
  await expect(offer()).toHaveCount(0);                       // nothing until the reader is told
  await limitSignal();
  await expect(offer()).toBeVisible();
  await expect(offer()).toHaveAttribute('data-reason', 'limit');
  await expect(page.locator('#supporter-offer-title')).not.toHaveText('');
  /* non-modal: no overlay was opened, and the map still answers a point in the middle of the screen */
  const hit = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(el && el.closest('#map')); });
  expect(hit, 'the offer covered the middle of the map').toBe(true);
  const box = await offer().boundingBox();
  expect(box.width).toBeLessThanOrEqual(600);
});

test('② «Not now» puts it to sleep — the signal again does not bring it back, and the sleep is on the device', async () => {
  await page.locator('#supporter-offer-later').click();
  await expect(offer()).toBeHidden();
  await limitSignal();
  await expect(offer()).toBeHidden();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STORE);
  expect(stored.sleepUntil, 'closing did not record a sleep — a reload would bring the card back').toBeGreaterThan(Date.now());
  /* the record is the device's: what a reload reads (js/supporter.js offerAllowed — tests/supporter-funnel-checks ④ evaluates it) */
});

test('③ the panel says where support goes — the month from the record, or that it could not be read', async () => {
  await setLang('en');
  /* the record does not answer → «could not be loaded», never 0. Answered as PostgREST answers a function
     that is not there (the state until the migration is applied) — a network failure would be retried by
     supabase-js for a GET, which is the library's behaviour and costs this file seconds, not a fact about it */
  await page.route(RPC, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.operating_stats without parameters in the schema cache' }) }));
  await openPanel();
  const month = page.locator('#supporter-row-month .supporter-costs-value');
  await expect(page.locator('#supporter-costs')).toBeVisible();
  await expect(page.locator('#supporter-row-atlas .supporter-costs-value')).toContainText('10');
  await expect(month).toContainText('could not be loaded');
  await closePanel();
  await page.unroute(RPC);
  /* the record answers → its numbers, its start date, and the note that IntMap's own testing is in it */
  await page.route(RPC, (route) => {
    expect(route.request().method(), 'the page must read operating_stats with GET (a read-only transaction)').toBe('GET');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ month: '2026-10', metered_since: '2026-10-01', provider_calls: 1234, unmetered_calls: 0, input_tokens: 140082, cached_tokens: 53863, output_tokens: 4266, as_of: '2026-10-01T14:04:20Z' }) });
  });
  await openPanel();
  await expect(month).toContainText('1,234');
  await expect(month).toContainText('2026-10-01');
  await expect(month).toContainText("IntMap's own testing");
  await expect(month).not.toContainText(/answer/i);
  await closePanel();
  await page.unroute(RPC);
});

test('④ the Stripe link follows the language', async () => {
  const href = async () => { await openPanel(); const h = await page.locator('#blueberry-go').getAttribute('href'); await closePanel(); return h; };
  await setLang('en');
  expect(await href()).toContain('locale=en');
  await setLang('jp');
  expect(await href()).toContain('locale=ja');
  /* «every language but Japanese gets the USD page» is the one expression in js/app-body.js, held by
     tests/supporter-funnel-checks.test.mjs — a third switch here would only re-render the page again */
  await setLang('en');
  expect(await href()).toContain('locale=en');
});
