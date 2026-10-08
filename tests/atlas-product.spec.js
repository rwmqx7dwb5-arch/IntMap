/* ============================================================================
 *  atlas-product — «時をまたぐ道のり» in the real page   (js/journey-through-time.js, Atlas `time.journey`)
 * ----------------------------------------------------------------------------
 *  The polities a journey passes through are held over the shipped records in Node (tests/atlas-product-checks.test.mjs
 *  ⑦: the Polish Corridor, Wilno, West Berlin). What only a browser can say is asked here, through the door Atlas uses
 *  (IntMapConsole.dispatch), with no login and no network, at ONE instant (1925) so the spec carries no more of the
 *  computation than the claim needs:
 *    ② the drawn instant is ON THE MAP — the line layer exists and the renderer's tiles hold every stretch the result
 *       declares (`meta.painted.lines`);
 *    ③ the same call again replaces its stretches: the source holds the same number, not twice as many.
 *  The route panel's «Borders that year» needs a computed route, which needs a routing API; no existing test path
 *  injects a route result, so it is not driven here (the panel and Atlas call the same `journeys`).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => {
    try { return !!window.__imap && window.__imap.isStyleLoaded() && !!window.IntMapTimeBorders && typeof window.IntMapLazy !== 'undefined'; } catch (_) { return false; }
  }, null, { timeout: 60_000 });
  /* the console is fetched on demand — ask for it the way the app does */
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!(window.IntMapConsole && window.IntMapConsole.dispatch), null, { timeout: 45_000 });
});
test.afterAll(async () => { await page?.context()?.close(); });

const PARIS_MOSCOW = { type: 'journey', points: [[2.3522, 48.8566], [37.6173, 55.7558]], years: [1925] };

/* the line layer's source, read back from the renderer's worker tiles (rendered, not only assigned) */
async function drawn(names) {
  return page.evaluate(async (want) => {
    const m = window.__imap, t0 = performance.now();
    let feats = [];
    while (performance.now() - t0 < 15_000) {
      feats = m.getSource('nlq-line-src') ? m.querySourceFeatures('nlq-line-src') : [];
      const got = new Set(feats.map((f) => f.properties && f.properties.name));
      if (want.every((n) => got.has(n))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const data = m.getSource('nlq-line-src') && m.getSource('nlq-line-src')._data;
    const assigned = data && Array.isArray(data.features) ? data.features : (data && data.geojson && data.geojson.features) || null;
    return { layer: !!m.getLayer('nlq-line'), tiled: [...new Set(feats.map((f) => f.properties && f.properties.name))], assigned: assigned ? assigned.map((f) => f.properties.name) : null };
  }, names);
}

let first;
test('② the drawn instant is on the map: the line layer holds the stretches the result declares', async () => {
  first = await page.evaluate((a) => window.IntMapConsole.dispatch(a), PARIS_MOSCOW);
  expect(first.ok, first.html).toBe(true);
  expect(first.exec.journey.drawnOnMap).toBe('1925');
  const names = first.meta.painted.lines;
  expect(names.length).toBeGreaterThan(5);
  expect(names.every((n) => n.startsWith('1925 · '))).toBe(true);
  const d = await drawn(names);
  expect(d.layer).toBe(true);
  for (const n of names) expect(d.tiled, n).toContain(n);
});

test('③ the same call again replaces its stretches — nothing is drawn twice', async () => {
  const again = await page.evaluate((a) => window.IntMapConsole.dispatch(a), PARIS_MOSCOW);
  expect(again.ok).toBe(true);
  expect(again.meta.resultKey).toBe(first.meta.resultKey);
  const count = await page.evaluate(() => (window.__imap.getSource('nlq-line-src').serialize().data.features || []).length);
  expect(count).toBe(first.meta.painted.lines.length);
});
