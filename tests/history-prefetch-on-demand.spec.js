/* ============================================================================
 *  history-prefetch-on-demand — the history bundles wait for the reader to head for the past
 * ----------------------------------------------------------------------------
 *  「デスクトップの全セッションが、歴史機能に触れなくても起動直後に約 55 MB の歴史データを
 *   先読みして main thread で parse する」のをやめる。
 *
 *  Before this change js/time-borders.js and js/time-admin1.js each warmed their bundle at the
 *  map's first idle (≤ 4 s / 6 s, then an idle callback with a 6 s / 8 s ceiling) on every desktop
 *  session. They now warm on js/chronos.js `IntMapTime.onIntent` — the Chronos button, a year
 *  control, or the clock set to a past year.
 *
 *  ⚠ THIS SPEC IS ABOUT THE BOOT, SO IT OPENS ITS OWN CONTEXT (tests/helpers/app.js: a spec whose
 *  subject is start-up must not share a booted page).
 *  ⚠ THE 12 s WAIT IS THE CLAIM, NOT A SETTLE. The assertion is «nothing was fetched in the window
 *  the old warm-up used»: its latest possible start was the 4 s backstop plus the 6 s idle ceiling
 *  (time-borders) — 10 s — so a wait shorter than that could pass on the old code.
 *  ⚠ WHICH FILES ARE THE BUNDLES IS MEASURED, NOT LISTED. The spec presses the Chronos button and
 *  records what that brings in; the claim is that NONE of those files was requested during the boot.
 *  The two files the report named are required to be among them, so an intent that fetched nothing
 *  cannot pass vacuously.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const QUIET_MS = 12000;
const NAMED = ['data/cshapes.js', 'data/hist-admin1.js'];

/* same-origin files under data/, keyed by their path relative to the site root */
function dataPath(url) {
  try { const u = new URL(url); const i = u.pathname.indexOf('/data/'); return i >= 0 ? u.pathname.slice(i + 1) : null; } catch (_) { return null; }
}

test('the history bundles are not fetched at boot, and are fetched once the reader heads for the past', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  const seen = [];   /* {path, phase, bytes} */
  let phase = 'boot';
  page.on('request', (r) => { const p = dataPath(r.url()); if (p) seen.push({ path: p, phase, bytes: null, req: r }); });
  page.on('requestfinished', (r) => {
    const row = seen.find((s) => s.req === r); if (!row) return;
    row.sized = r.sizes().then((z) => { row.bytes = z.responseBodySize; }, () => {});
  });
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
    await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 60000 });
    /* the device is a desktop and the connection is not metered — otherwise the second half has
       nothing to prove (js/mem-budget.js `maySpeculate` would rightly withhold the copy) */
    expect(await page.evaluate(() => window.IntMapMemBudget.maySpeculate(() => false)), 'this context must be a desktop on an unmetered connection').toBe(true);
    await page.waitForTimeout(QUIET_MS);
    expect(await page.evaluate(() => window.IntMapTime.intended()), 'nothing in the boot may count as the reader\'s intent').toBeNull();
    const bootPaths = new Set(seen.filter((s) => s.phase === 'boot').map((s) => s.path));

    /* ── the reader presses Chronos ── */
    phase = 'intent';
    const waits = NAMED.map((p) => page.waitForEvent('requestfinished', { predicate: (r) => dataPath(r.url()) === p, timeout: 60000 }));
    await page.click('#ntl-toggle');
    expect((await page.evaluate(() => window.IntMapTime.intended()) || {}).source).toMatch(/^ui:/);
    await Promise.all(waits);
    await Promise.all(seen.map((s) => s.sized));
    const intentRows = seen.filter((s) => s.phase === 'intent');
    const intentPaths = [...new Set(intentRows.map((s) => s.path))];
    for (const p of NAMED) expect(intentPaths, p + ' is warmed by the intent').toContain(p);
    const early = intentPaths.filter((p) => bootPaths.has(p));
    expect(early, 'fetched during the boot although only the intent to travel asks for them').toEqual([]);
    /* the measurement the dev note reports */
    console.log('[history-prefetch] boot data/ requests: ' + JSON.stringify([...bootPaths]));
    console.log('[history-prefetch] warmed on intent: ' + JSON.stringify(intentRows.map((s) => [s.path, s.bytes])));

    /* ── and the journey still draws ── */
    await page.evaluate(() => window.IntMapTime.setYear(1900, { source: 'test' }));
    await page.waitForFunction(() => {
      try { return window.__imap.getSource('imtb-ln-src').serialize().data.features.length > 50; } catch (_) { return false; }
    }, null, { timeout: 60000, polling: 250 });
    await Promise.all(seen.map((s) => s.sized));
    console.log('[history-prefetch] after the intent and the journey: ' + JSON.stringify(seen.filter((s) => s.phase !== 'boot').map((s) => [s.path, s.bytes])));
  } finally { await ctx.close(); }
});
