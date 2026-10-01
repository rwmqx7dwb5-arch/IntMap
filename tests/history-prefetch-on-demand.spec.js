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
 *  ⚠ (hist-vector-tiles) WHAT THE INTENT FETCHES IS THE INDEX, NOT THE RECORD. The door now reads each
 *  record as time-cut tiles (scripts/build-hist-tiles.mjs): opening it reads `data/hvt/<name>.idx.json`
 *  (tens of kB), and the journey reads only the chunks the instant needs from `data/hvt/<name>.jsonl.gz`
 *  with Range requests (206). The named files are therefore asked of the door (`tilesOf`), and the
 *  journey must read the archive by range and NEVER the whole record.
 *  ⚠ «ARRIVED» IS ASKED OF THE PAGE, NOT OF THE PROTOCOL. Since hist-bundles-off-main the bundles
 *  are read by js/hist-bundles.js through js/fetch-deadline.js `readWithin` — a fetch whose body is
 *  read chunk by chunk from its stream — no longer by a <script> tag. MEASURED 2026-10-01 (local
 *  Playwright Chromium, and the deep-tier run 36772277497 on main 1a66ec7): for such a read of a
 *  13-41 MB body, read to `done`, the DevTools protocol reports `requestfailed` net::ERR_ABORTED in
 *  3 of 4 in-app reads (and in 1 of 3 on a bare page with no app code at all), while the page's
 *  own Resource Timing entry for the same request has status 200 and the whole body
 *  (encodedBodySize 11,218,612 / decodedBodySize 41,457,871 for data/hist-admin1.js) and the door
 *  reports the bundle opened. `requestfinished` therefore never came and this spec waited 60 s for
 *  an event about a request that had succeeded. The completion is now read from the page's
 *  Resource Timing (collected by a PerformanceObserver from the first script, so a full buffer
 *  cannot drop an entry); the `request` event, which fires either way, still says WHEN it was asked.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const QUIET_MS = 12000;
const RECORDS = ['data/cshapes.js', 'data/hist-admin1.js'];

/* same-origin files under data/, keyed by their path relative to the site root */
function dataPath(url) {
  try { const u = new URL(url); const i = u.pathname.indexOf('/data/'); return i >= 0 ? u.pathname.slice(i + 1) : null; } catch (_) { return null; }
}

test('the history bundles are not fetched at boot, and are fetched once the reader heads for the past', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(ctx);
  /* every completed same-origin data/ read, as the page itself records it (see the header) */
  await ctx.addInitScript(() => {
    const got = window.__imDataReads = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (/\/data\//.test(e.name)) got.push({ url: e.name, status: e.responseStatus, bytes: e.encodedBodySize, decoded: e.decodedBodySize });
      }).observe({ type: 'resource', buffered: true });
    } catch (_) { /* no observer — the wait below then fails, which is the honest answer */ }
  });
  const page = await ctx.newPage();
  const seen = [];   /* {path, phase} — when each data/ file was ASKED for */
  let phase = 'boot';
  page.on('request', (r) => { const p = dataPath(r.url()); if (p) seen.push({ path: p, phase }); });
  /* path -> {status, bytes} of the completed reads the page recorded */
  const arrived = () => page.evaluate(() => window.__imDataReads.map((e) => ({ url: e.url, status: e.status, bytes: e.bytes, decoded: e.decoded })))
    .then((rows) => { const m = new Map(); for (const r of rows) { const p = dataPath(r.url); if (p) m.set(p, r); } return m; });
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
    /* the files the intent must bring in: each record's index, named by the door itself */
    const NAMED = await page.evaluate((recs) => recs.map((f) => window.IntMapHistBundles.tilesOf(f)), RECORDS);
    expect(NAMED.every((p) => /^data\/hvt\/.+\.idx\.json$/.test(p)), 'the door names an index for each record').toBe(true);

    /* ── the reader presses Chronos ── */
    phase = 'intent';
    await page.click('#ntl-toggle');
    expect((await page.evaluate(() => window.IntMapTime.intended()) || {}).source).toMatch(/^ui:/);
    /* each named bundle read to the end, whole, with a 200 — by the page's own record */
    await page.waitForFunction((named) => named.every((p) => window.__imDataReads.some((e) => {
      try { return new URL(e.url).pathname.endsWith('/' + p) && e.status === 200 && e.decoded > 0; } catch (_) { return false; }
    })), NAMED, { timeout: 60000, polling: 250 });
    const got = await arrived();
    const intentRows = seen.filter((s) => s.phase === 'intent').map((s) => ({ path: s.path, bytes: (got.get(s.path) || {}).bytes }));
    const intentPaths = [...new Set(intentRows.map((s) => s.path))];
    for (const p of NAMED) expect(intentPaths, p + ' is warmed by the intent').toContain(p);
    const early = intentPaths.filter((p) => bootPaths.has(p));
    expect(early, 'fetched during the boot although only the intent to travel asks for them').toEqual([]);
    /* the measurement the dev note reports */
    console.log('[history-prefetch] boot data/ requests: ' + JSON.stringify([...bootPaths]));
    console.log('[history-prefetch] warmed on intent: ' + JSON.stringify(intentRows.map((s) => [s.path, s.bytes])));
    /* (hist-bundles-off-main) the door that reads them says it did — the same fact from the product's side */
    expect(await page.evaluate(() => ['__CSHAPES', '__HISTADM1'].map((g) => window.IntMapHistBundles.requested(g))), 'js/hist-bundles.js was asked for both bundles').toEqual([true, true]);

    /* ── and the journey still draws ── */
    await page.evaluate(() => window.IntMapTime.setYear(1900, { source: 'test' }));
    await page.waitForFunction(() => {
      try { return window.__imap.getSource('imtb-ln-src').serialize().data.features.length > 50; } catch (_) { return false; }
    }, null, { timeout: 60000, polling: 250 });
    const after = await arrived();
    console.log('[history-prefetch] after the intent and the journey: ' + JSON.stringify(seen.filter((s) => s.phase !== 'boot').map((s) => [s.path, (after.get(s.path) || {}).bytes])));
    /* (hist-vector-tiles) the journey read the archive by range — and the whole record never */
    expect(await page.evaluate(() => window.IntMapHistBundles.mode('__CSHAPES')), 'the door read cshapes as tiles').toBe('tiled');
    const ranged = await page.evaluate(() => window.__imDataReads.filter((e) => /\/data\/hvt\/cshapes\.jsonl\.gz$/.test(new URL(e.url).pathname)).map((e) => e.status));
    expect(ranged.length, 'chunks of the cshapes archive were read').toBeGreaterThan(0);
    expect(ranged.every((st) => st === 206), 'every archive read was a Range answer: ' + JSON.stringify(ranged)).toBe(true);
    const whole = seen.map((x) => x.path).filter((p) => RECORDS.includes(p));
    expect(whole, 'the whole record was fetched although its tiles were there').toEqual([]);
  } finally { await ctx.close(); }
});
