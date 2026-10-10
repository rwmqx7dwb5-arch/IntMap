/* ============================================================================
 *  map-layer-system — the two products, as a reader meets them
 * ----------------------------------------------------------------------------
 *  ① 国別指標 / Country indicators: one row; ticking it opens the picker in its legend; a search in English
 *    or Japanese finds the indicator; choosing one paints it through the same painter as its own row
 *    (the legend's year picker and the fill layer appear); a country-table statistic is handed to its own
 *    row and taken back when another indicator is chosen — one choropleth on the map at a time.
 *  ② その年の世界 / The year book: the Chronos panel's «Read this year» opens the page for the clock's year,
 *    read off the border record the map draws — 1920 names the day Khiva leaves the record (1920-02-02).
 *
 *  The World Bank is not reached: every indicator read is answered here with a small series, so the result
 *  does not depend on the network (the numbers are checked by tests/map-layer-system-checks.test.mjs ④).
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

let page;
const WB = '**/api.worldbank.org/**';
const rows = ['2020', '2021', '2022'].flatMap((y) => [['JPN', 84.5], ['NGA', 53.1], ['DEU', 80.9]].map(([c, v]) => ({ countryiso3code: c, date: y, value: v })));
test.beforeAll(async ({ app }) => {
  page = app.page;
  await page.route(WB, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ page: 1, pages: 1, total: rows.length }, rows]) }));
});
test.afterAll(async () => {
  await page.evaluate(() => {
    for (const id of ['bx-wbind', 'dl-gdppc']) { const cb = document.getElementById(id); if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } }
    try { localStorage.removeItem('intmap.indicator'); } catch (_) { /* private mode */ }
    try { window.IntMapTime.setNow({ source: 'test' }); } catch (_) { /* no clock */ }
    const s = document.getElementById('yb-sheet'); if (s) s.hidden = true;
  }).catch(() => {});
  await page.unroute(WB).catch(() => {});
});

const BOOT = { timeout: 45_000 };
const tick = (id, on) => page.evaluate(([id, on]) => { const cb = document.getElementById(id); if (cb && cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); } return !!cb; }, [id, on]);

test('① the country-indicator row opens its picker; search finds; choosing paints one at a time', async () => {
  await page.waitForFunction(() => !!document.getElementById('bx-wbind'), null, BOOT);
  await page.evaluate(() => { try { localStorage.removeItem('intmap.indicator'); } catch (_) { /* */ } });
  /* what switched the row, recorded so a failure says who did it rather than only that the choice was gone */
  await page.evaluate(() => { const log = (window.__indLog = []); const cb = document.getElementById('bx-wbind');
    cb.addEventListener('change', () => log.push('bx-wbind ' + cb.checked + ' @' + Math.round(performance.now()) + ' ' + String((new Error().stack || '')).replace(/\s+/g, ' ').slice(0, 400)), true); });
  expect(await tick('bx-wbind', true)).toBe(true);
  const pick = page.locator('#data-legend-wbind .ind-pick');
  await expect(pick).toBeVisible(BOOT);
  await expect(page.locator('#data-legend-wbind .ind-q')).toBeVisible();
  /* a search by the reader's words */
  await page.locator('#data-legend-wbind .ind-q').fill('life expectancy');
  await expect(page.locator('#data-legend-wbind .ind-item').first()).toHaveAttribute('data-id', 'wblife');
  await page.locator('#data-legend-wbind .ind-item').first().click();
  await page.waitForFunction(() => window.IntMapIndicators && window.IntMapIndicators.current() && window.IntMapIndicators.current().id === 'wblife', null, BOOT);
  /* painted by the row's own painter: the fill layer is on the map and the legend has the series' year picker */
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.layers.has('wbind-fill') && window.IntMapGeoEngine.layers.getLayout('wbind-fill', 'visibility') === 'visible'; } catch (_) { return false; } }, null, BOOT);
  await expect(page.locator('#data-legend-wbind .bx-year')).toBeAttached(BOOT);
  /* the same series stands on two rows: the picker names the other one */
  await expect(page.locator('#data-legend-wbind .ind-note').first()).toContainText(/.+/);
  /* Japanese finds the same thing */
  const jp = await page.evaluate(() => window.IntMapIndicators.search('失業率')[0].id);
  expect(jp).toBe('wbunemp');
  /* a country-table statistic is drawn by its own row, and handed back when another indicator is chosen */
  await page.evaluate(() => window.IntMapIndicators.select('row:dl-gdppc'));
  await expect(page.locator('#dl-gdppc')).toBeChecked();
  await page.evaluate(() => window.IntMapIndicators.select('wbunemp'));
  await expect(page.locator('#dl-gdppc')).not.toBeChecked();
  const now = await page.evaluate(() => ({ cur: window.IntMapIndicators.current(), st: window.IntMapIndicators.state(), log: window.__indLog }));
  expect(now.cur && now.cur.id, JSON.stringify(now)).toBe('wbunemp');
  await tick('bx-wbind', false);
});

test('② the Chronos panel reads the clock\'s year as a page — 1920 off the border record', async () => {
  await page.evaluate(() => window.IntMapTime.setYear(1920, { source: 'test' }));
  await page.evaluate(() => { const tl = document.getElementById('news-timeline'), tg = document.getElementById('ntl-toggle'); if (tl && tg && tl.classList.contains('collapsed')) tg.click(); });
  const btn = page.locator('#ntl-yearbook');
  await expect(btn).toBeVisible(BOOT);
  await btn.click();
  const sheet = page.locator('#yb-sheet');
  await expect(sheet).toBeVisible(BOOT);
  await expect(sheet.locator('.yb-title')).toContainText('1920');
  /* (map-layer-system-chronos) the page is IN FRONT of the panel that opened it — the click on «Read this year» marks
     the Chronos panel as the one being used, and the sheet lay under it (only a 48 px strip of it showed at 1280×720).
     Asked of the hit test over the sheet's whole box, not of the one button the steps below press. */
  const covered = await page.evaluate(() => { const s = document.getElementById('yb-sheet'), b = s.getBoundingClientRect(), out = [];
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) { const x = b.left + b.width * fx, y = b.top + b.height * fy, h = document.elementFromPoint(x, y);
      if (!s.contains(h)) out.push(Math.round(x) + ',' + Math.round(y) + ' → ' + (h ? (h.id || h.className || h.tagName) : 'nothing')); }
    return out; });
  expect(covered, 'points of the year book covered by another surface').toEqual([]);
  /* the change days come from the record the map draws (CShapes 2.0), with the record's own citation */
  await expect(sheet).toContainText('1920-02-02', { timeout: 90_000 });
  await expect(sheet).toContainText('CShapes 2.0');
  /* the page follows the clock */
  await sheet.locator('.yb-step[data-step="1"]').click();
  await expect(sheet.locator('.yb-title')).toContainText('1921', BOOT);
  await sheet.locator('.yb-x').click();
  await expect(sheet).toBeHidden();
});
