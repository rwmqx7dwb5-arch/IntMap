/* ============================================================================
 *  wave4-news — TODAY ON THE MAP as the reader meets it (docs/NEWS-EVENTS.md §18)
 * ----------------------------------------------------------------------------
 *  ① with the clock at the end of 2026-10-05 and a last visit at noon, the edition counts the day, says how many were
 *    first reported since the visit, lists the top ten in rank order, and the map holds a point for every placed
 *    event (counted from the renderer); a clock in the past does NOT mark a visit;
 *  ② «Play the edition» moves the camera to the first stop and the list follows;
 *  ③ a day chip opens that UTC day and the link names it; closing takes the edition off the map;
 *  ④ the live clock marks the visit.
 *  The read of news_events is answered from tests/fixtures/news-edition-prod.json.gz (production's rows for that day —
 *  tests/wave4-news-checks.test.mjs), so the result does not depend on the collection's contents today.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test.describe.configure({ mode: 'serial' });

const FX = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/news-edition-prod.json.gz', import.meta.url))));
const ROUTE = '**/rest/v1/news_events*';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range' };
const SEEN = Date.parse('2026-10-05T12:00:00Z');
const CLOCK = '2026-10-06T00:00:00.000Z';
const KEY = 'intmap_news_edition_seen';
const asked = [];

let page;
test.beforeAll(async ({ app }) => {
  page = app.page;
  await page.route(ROUTE, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = decodeURIComponent(req.url());
    /* «N new since your last visit» is ONE server head count (js/news-events.js editionCount: `first_published_at > seen`,
       count=exact) — answered from the same production day, so the card and the entry are measured against one number */
    const gt = /first_published_at=gt\.([^&]+)/.exec(url);
    if (gt && !/last_article_at=gte\./.test(url)) {
      const seen = Date.parse(gt[1]), n = FX.rows.filter((r) => Date.parse(r.first_published_at) > seen).length;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...CORS, 'content-range': '*/' + n }, body: req.method() === 'HEAD' ? '' : '[]' });
    }
    if (!/last_article_at=gte\./.test(url)) return route.fallback();
    asked.push(url);
    /* the window the page asked for, applied to the production day — the server's half of the rule */
    const until = Date.parse(/first_published_at=lt\.([^&]+)/.exec(url)[1]), since = Date.parse(/last_article_at=gte\.([^&]+)/.exec(url)[1]);
    const rows = FX.rows.filter((r) => Date.parse(r.first_published_at) < until && Date.parse(r.last_article_at) >= since);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(rows) });
  });
});
test.afterAll(async () => {
  await page.evaluate((k) => { try { window.IntMapNewsIntel.closeEdition(); window.IntMapTime.setNow({ source: 'test' }); localStorage.removeItem(k); } catch (_) { } }, KEY).catch(() => {});
  await page.unroute(ROUTE).catch(() => {});
});

const card = () => page.locator('#nedition-popup');
const state = () => page.evaluate(() => window.IntMapNewsIntel.editionState());
const T = { timeout: 30_000 };

test('①–④ the day\'s edition: counted, ranked, drawn, played, archived, and the visit marked only by the live clock', async () => {
  await test.step('① the edition of the 24 hours to the clock, with what is new since the last visit', async () => {
    await page.evaluate(([k, seen, at]) => { localStorage.setItem(k, String(seen)); window.IntMapTime.set(new Date(at), { source: 'test' }); }, [KEY, SEEN, CLOCK]);
    const r = await page.evaluate(() => window.IntMapNewsIntel.edition({}));
    await expect(card()).toBeVisible(T);
    expect(r.kind).toBe('rolling');
    expect(r.events).toBe(FX.rows.length);
    expect(asked.at(-1)).toMatch(/order=independent_source_count\.desc,article_count\.desc,first_published_at\.asc/);
    await expect(page.locator('#nedition-popup .nint-big')).toHaveText(String(FX.rows.length));
    const since = FX.rows.filter((x) => Date.parse(x.first_published_at) > SEEN).length;
    await expect(page.locator('#nedition-popup .ned-since b')).toHaveText(String(since));
    expect(r.newSinceLastVisit).toBe(since);
    await expect(page.locator('#nedition-popup .ned-top > li')).toHaveCount(10);
    await expect(page.locator('#nedition-popup .ned-top > li').first()).toContainText('plague');
    const placed = FX.rows.filter((x) => x.rep_lng != null && x.rep_lat != null).length;
    await expect.poll(async () => (await state()).painted, T).toBe(placed);
    expect(await page.evaluate(() => window.IntMapGeoEngine.layers.has('nedition-pin'))).toBe(true);
    /* a clock in the past read the past: the visit is not marked */
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(String(SEEN));
    expect(r.visitMarked).toBe(false);
  });

  await test.step('② «Play the edition» visits the top in order', async () => {
    await page.locator('#nedition-popup [data-ned="play"]').click();
    await expect.poll(async () => (await state()).stop).toBe(0);
    expect((await state()).playing).toBe(true);
    await expect(page.locator('#nedition-popup .ned-ev.cur')).toHaveCount(1);
    await page.locator('#nedition-popup [data-ned="play"]').click();
    await expect.poll(async () => (await state()).playing).toBe(false);
  });

  await test.step('③ a day chip opens that UTC day, the link names it, and closing clears the map', async () => {
    await page.locator('#nedition-popup [data-ned-day="2026-10-05"]').click();
    await expect.poll(async () => (await state()).day, T).toBe('2026-10-05');
    await expect(page.locator('#nedition-head .nint-h-sub')).toContainText('UTC');
    expect(await page.evaluate(() => window.__imNewsEdition.link())).toContain('?edition=2026-10-05');
    await page.locator('#nedition-popup [data-ned="close"]').click();
    await expect(card()).toBeHidden();
    await expect.poll(async () => (await state()).painted).toBe(0);
  });

  await test.step('④ the live clock marks the visit', async () => {
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    const r = await page.evaluate(() => window.IntMapNewsIntel.edition({}));
    expect(r.visitMarked).toBe(true);
    expect(Number(await page.evaluate((k) => localStorage.getItem(k), KEY))).toBeGreaterThan(SEEN);
    await page.evaluate(() => window.IntMapNewsIntel.closeEdition());
  });
});
