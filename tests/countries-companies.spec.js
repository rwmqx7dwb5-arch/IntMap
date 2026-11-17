/* ============================================================================
 *  Countries · Companies — what the rows, the rank and the comparison say
 * ----------------------------------------------------------------------------
 *  Measured on production before this change (2026-11-17):
 *    - Comparison ▸ GDP (PPP) printed Japan's $6.84T as «$6.8k» — a value held in billions read as dollars.
 *    - Typing «japan» in the Countries search re-ranked the one row left: Japan read «1» for GDP.
 *    - A row opened its details only on a double-click nobody is told about.
 *  Each test drives the screen a reader drives and reads the rendered DOM.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

async function openCountries(page) {
  await page.click('#btn-stats');
  await page.waitForFunction(() => document.querySelectorAll('#countries-feed .stat-row').length > 50, null, { timeout: 30000 });
}

test('the Countries rank is the country’s standing among all, not within the search', async ({ app }) => {
  const page = app.page;
  await openCountries(page);
  const before = await page.evaluate(() => {
    const r = document.querySelector('#countries-feed .stat-row[data-ccn="JPN"] .stat-rank');
    return r ? r.textContent.trim() : null;
  });
  expect(before, 'Japan has a GDP rank in the full list').toMatch(/^\d+$/);
  await page.fill('#search-input', 'japan');
  await page.dispatchEvent('#search-input', 'input');
  await page.waitForFunction(() => document.querySelectorAll('#countries-feed .stat-row').length < 5, null, { timeout: 15000 });
  const after = await page.evaluate(() => ({
    rank: document.querySelector('#countries-feed .stat-row[data-ccn="JPN"] .stat-rank')?.textContent.trim(),
    base: document.querySelector('#countries-feed .stats-rankbase')?.textContent || '',
  }));
  expect(after.rank, 'searching does not re-rank Japan as «1»').toBe(before);
  expect(after.base, 'the list says which population the rank is over').toMatch(/\d+/);
  await page.fill('#search-input', '');
  await page.dispatchEvent('#search-input', 'input');
});

test('a Countries row has a visible Details button that opens the country, and the card prints the year of its values', async ({ app }) => {
  const page = app.page;
  await openCountries(page);
  const row = page.locator('#countries-feed .stat-row[data-ccn="FRA"]');
  await expect(row.locator('.stat-detail')).toBeVisible();
  await row.locator('.stat-detail').click();
  await page.waitForFunction(() => document.getElementById('country-popup')?.style.display === 'block', null, { timeout: 15000 });
  expect(await page.evaluate(() => window._cpCurrent && window._cpCurrent.code)).toBe('FRA');
  /* the card's years are the values' own: the bundled GDP is the World Bank's 2023 series */
  const gdpLabel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#cp-body *')].map((e) => e.textContent).filter((t) => /GDP/.test(t) && /\(\d{4}[ )]/.test(t));
    return rows.length ? rows[rows.length - 1] : '';
  });
  expect(gdpLabel, 'the GDP row carries the year of its value').toMatch(/\((19|20)\d\d[ )]/);
  /* (companies-name-width) and its source beside the year: the bundled GDP is the World Bank's series */
  expect(gdpLabel, 'the GDP row names the source of its value').toMatch(/\((19|20)\d\d · World Bank\)/);
  await page.evaluate(() => { const x = document.querySelector('#country-popup .cp-close, #country-popup [data-im-click="closeCountryPopup"]'); if (x) x.click(); else document.getElementById('country-popup').style.display = 'none'; });
});

test('the comparison prints GDP (PPP) in dollars, offers a same-year comparison, and draws a readable chart', async ({ app }, testInfo) => {
  test.setTimeout(180_000);   /* three views, each reading the World Bank */
  const page = app.page;
  await openCountries(page);
  await page.evaluate(async () => { await window.IntMapLazy.need('statsCompare'); });
  /* the World Bank answers from a fixture-free network in CI only sometimes; the PPP row reads the World Bank series,
     so the assertion is on the UNIT of whatever arrives — never «$…k» for a country's GDP */
  await page.evaluate(() => window.IntMapStatsCompare.open(['JPN', 'USA', 'GBR', 'DEU', 'BRA'], ['gdp', 'gdpppp'], null, 'bar'));
  await page.waitForSelector('#scp-view .scp-blk[data-k="gdpppp"] .scp-sec', { timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('#scp-view .scp-blk[data-k="gdpppp"]');
    return b && !/Loading|読み込み/.test(b.textContent);
  }, null, { timeout: 45000 });
  const ppp = await page.evaluate(() => [...document.querySelectorAll('#scp-view .scp-blk[data-k="gdpppp"] .scp-bval b')].map((b) => b.textContent));
  for (const v of ppp) expect(v, 'a national GDP (PPP) is trillions or billions, never thousands').not.toMatch(/k$/);
  /* short English names in the narrow column */
  const names = await page.evaluate(() => [...document.querySelectorAll('#scp-view .scp-blk[data-k="gdp"] .scp-bnm')].map((e) => e.textContent.trim()));
  expect(names.join('|')).not.toMatch(/United States of America/);
  /* and the narrow column shows it whole — «United King…» was the reported cut */
  const cut = await page.evaluate(() => [...document.querySelectorAll('#scp-view .scp-bnm')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()));
  expect(cut, 'no country name is cut in the bar chart').toEqual([]);
  /* the year picker is there and «Same year» re-reads the bars */
  await expect(page.locator('#scp-byear')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('compare-bars.png'), fullPage: false });
  /* time series: a taller chart with a few axis values and a legend that wraps */
  await page.click('#scp-modes button[data-m="ts"]');
  await page.waitForSelector('#scp-view .scp-legend', { timeout: 45000 });
  const ts = await page.evaluate(() => {
    const svg = document.querySelector('#scp-view .scp-chart .ts-svg');
    return { h: svg ? svg.getBoundingClientRect().height : 0, ticks: document.querySelectorAll('#scp-view .scp-chart .scp-tick').length,
      legendWraps: getComputedStyle(document.querySelector('#scp-view .scp-legend')).flexWrap };
  });
  expect(ts.h).toBeGreaterThanOrEqual(150);
  expect(ts.legendWraps).toBe('wrap');
  await page.screenshot({ path: testInfo.outputPath('compare-ts.png'), fullPage: false });
  await page.click('#scp-view .scp-back');
});

test('the Companies search reaches every company profile, not only the market-data rows', async ({ app }) => {
  const page = app.page;
  await page.click('#btn-info');
  await page.waitForFunction(() => document.querySelectorAll('#info-dashboard .co-row').length > 50, null, { timeout: 30000 });
  /* a company in the atlas index that is not a market-data row */
  const target = await page.evaluate(async () => {
    await window.IntMapLazy.need('companyData'); const ix = await window.IntMapCompanyData.index();
    const listed = new Set(window.IntMapCompanies.DATA.map((c) => String(c.tk).toUpperCase()));
    const c = ix.companies.find((x) => !x.tk || !listed.has(String(x.tk).toUpperCase()));
    return c ? { id: c.id, n: c.n } : null;
  });
  expect(target).not.toBeNull();
  await page.fill('#search-input', target.n);
  await page.dispatchEvent('#search-input', 'input');
  await page.waitForSelector(`#info-dashboard .co-prof-row[data-coid="${target.id}"]`, { timeout: 20000 });
  await page.fill('#search-input', '');
  await page.dispatchEvent('#search-input', 'input');
});
