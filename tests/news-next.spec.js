/* ============================================================================
 *  news-story — a STORY as the reader meets it (docs/NEWS-EVENTS.md §17)
 * ----------------------------------------------------------------------------
 *  ① «Follow this story» opens the card on the headline's suggested words: it names them, counts the
 *    events, and the map holds a point for each placed event (counted from the renderer, not the intention);
 *  ② the timeline plays: each step moves the playhead one day and the map shows only what was reported
 *    up to that day; the slider and the bars move it too;
 *  ③ a word chip asks the server again with the words the reader chose — and the link names them;
 *  ④ closing takes the story off the map.
 *  The two database doors are answered from tests/fixtures/news-story-prod.json (production's headlines run
 *  through the shipped migration — tests/news-next-checks.test.mjs), so the result does not depend on whether
 *  the migration has been applied where the page points.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { readFileSync } from 'node:fs';

test.describe.configure({ mode: 'serial' });

const FX = JSON.parse(readFileSync(new URL('./fixtures/news-story-prod.json', import.meta.url), 'utf8'));
const SEED = FX.seeds.find((s) => s.title.startsWith('Far-right AfD'));
const ROUTE = '**/rest/v1/rpc/news_story*';
const words = (t) => new Set(String(t).toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u));
const asked = [];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

let page;
test.beforeAll(async ({ app }) => {
  page = app.page;
  await page.route(ROUTE, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = req.url();
    if (/\/rpc\/news_story_terms/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(SEED.stats) });
    }
    const body = JSON.parse(req.postData() || '{}');
    asked.push(body.p_terms);
    const rows = SEED.rows.filter((r) => (body.p_terms || []).every((t) => words(r.representative_title).has(t)));
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(rows) });
  });
});
test.afterAll(async () => {
  await page.evaluate(() => { try { window.IntMapNewsIntel.closeStory(); } catch (_) { } }).catch(() => {});
  await page.unroute(ROUTE).catch(() => {});
});

const card = () => page.locator('#nstory-popup');
const state = () => page.evaluate(() => window.IntMapNewsIntel.storyState());
const open = () => page.evaluate(([text, from]) => window.IntMapNewsIntel.story({ text, from }), [SEED.title, SEED.public_id]);
const T = { timeout: 30_000 };

/* ①–③ are ONE test in three steps: the shared page's reset before each test closes every open card
   (tests/helpers/app.js closeLeftOverlays), so a card cannot be carried from one test into the next. */
test('①–③ a story: opened on the headline\'s words, played day by day, asked again with the reader\'s words', async () => {
  await test.step('① the card opens on the suggested words and the map holds every placed event', async () => {
    await open();
    await expect(card()).toBeVisible(T);
    await expect(page.locator('#nstory-head .nint-h-sub')).toContainText('far', T);
    await expect(page.locator('#nstory-head .nint-h-sub')).toContainText('german');
    await expect(page.locator('#nstory-popup .nint-big')).toHaveText(String(SEED.rows.length));
    await expect(page.locator('.nst-chip.on')).toHaveCount(2);
    expect(asked[0].slice().sort()).toEqual(['far', 'german']);
    const placed = SEED.rows.filter((r) => r.rep_lng != null && r.rep_lat != null).length;
    await expect.poll(async () => (await state()).painted, T).toBe(placed);
    expect(await page.evaluate(() => window.IntMapGeoEngine.layers.has('nstory-pt'))).toBe(true);
    /* the event it was opened from is marked in the list */
    await expect(page.locator('#nstory-popup .nst-seed')).toHaveCount(1);
  });

  await test.step('② the timeline plays one day a step, and the map shows only what was reported up to that day', async () => {
    const days = (await state()).days;
    expect(days).toBeGreaterThan(2);
    await expect(page.locator('#nstory-popup .nst-time rect.nst-hit')).toHaveCount(days);
    /* the first bar: day 0 */
    await page.locator('#nstory-popup .nst-time rect.nst-hit').first().dispatchEvent('click');
    await expect.poll(async () => (await state()).frame).toBe(0);
    const firstDay = SEED.rows.filter((r) => r.first_published_at.slice(0, 10) === SEED.rows[0].first_published_at.slice(0, 10) && r.rep_lng != null).length;
    await expect.poll(async () => (await state()).painted).toBe(firstDay);
    await page.locator('#nstory-popup [data-nst="next"]').click();
    await expect.poll(async () => (await state()).frame).toBe(1);
    await page.locator('#nstory-popup [data-nst="play"]').click();
    await expect.poll(async () => (await state()).frame, { timeout: 10_000 }).toBeGreaterThan(2);
    expect((await state()).playing).toBe(true);
    await page.locator('#nstory-popup [data-nst="play"]').click();
    expect((await state()).playing).toBe(false);
    /* the slider */
    await page.locator('#nstory-popup .nst-scrub').fill(String(days - 1));
    await expect.poll(async () => (await state()).frame).toBe(days - 1);
    await expect(page.locator('#nstory-popup .nst-all')).toHaveClass(/on/);
  });

  await test.step('③ a word chip asks again with the reader\'s words, and the link names them', async () => {
    const before = asked.length;
    await page.locator('.nst-chip[data-nst-term="far"]').click();
    await expect.poll(() => asked.length).toBe(before + 1);
    expect(asked[asked.length - 1]).toEqual(['german']);
    await expect(page.locator('.nst-chip.on')).toHaveCount(1);
    const link = await page.evaluate(() => window.IntMapNewsIntel.storySummary().link);
    expect(link.endsWith('?story=german')).toBe(true);
  });
});

test('④ closing takes the story off the map', async () => {
  await open();
  await expect(card()).toBeVisible(T);
  await expect.poll(async () => (await state()).painted, T).toBeGreaterThan(0);
  await page.locator('#nstory-popup [data-nst="close"]').click();
  await expect(card()).toBeHidden();
  await expect.poll(async () => (await state()).painted).toBe(0);
  expect(await page.evaluate(() => window.IntMapGeoEngine.layers.getLayout('nstory-pt', 'visibility'))).toBe('none');
});
