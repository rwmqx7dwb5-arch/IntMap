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

/* ── (country-figure-publisher) ───────────────────────────────────────────────────────────────────────
 *   The country card names each figure's publisher beside its year — every figure, every path
 *  ----------------------------------------------------------------------------
 *   Measured on production (build 1be2049, 2026-11-18): HDI read «(2022 · UNDP)», while GDP, GDP per capita,
 *   population, life expectancy, internet use and military spending read
 *   «(2025 · World Bank World Development Indicators (NY.GDP.MKTP.CD))» — the values the World Bank's latest series
 *   had replaced at start-up, and again after a trip through time and back to Now.
 *   The World Bank is answered here from a fixture (one row per series, for France) so the writer the card depends on
 *   runs the same way with or without the network; the card is then read as a reader reads it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────*/
/* the World Bank API's own shape: [meta, rows] — the indicator code read from the address asked for */
async function answerWorldBank(page) {
  await page.route(/^https:\/\/api\.worldbank\.org\/v2\//, (route) => {
    const code = decodeURIComponent((route.request().url().match(/\/indicator\/([^?]+)/) || [])[1] || '');
    const rows = [{ countryiso3code: 'FRA', country: { id: 'FR', value: 'France' }, indicator: { id: code }, date: '2024', value: 1000 }];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ page: 1, pages: 1, per_page: 20000, total: 1 }, rows]) });
  });
}

/* every «(year · publisher)» the open card prints */
async function cardStamps(page) {
  /* a row's Details button is visible and opens that country (it was only a double-click nobody was told about) */
  const det = page.locator('#countries-feed .stat-row[data-ccn="FRA"] .stat-detail');
  await expect(det).toBeVisible();
  await det.click();
  await page.waitForFunction(() => document.getElementById('country-popup')?.style.display === 'block', null, { timeout: 15000 });
  expect(await page.evaluate(() => window._cpCurrent && window._cpCurrent.code)).toBe('FRA');
  return page.evaluate(() => [...document.querySelectorAll('#cp-body .cm-row > span:first-child, #cp-body .ci-row > span:first-child')]
    .map((e) => e.textContent.trim()).map((t) => { const m = t.match(/\((\d{4}) · (.+)\)$/); return m ? { label: t, y: m[1], pub: m[2] } : { label: t }; }));
}

async function closeCard(page) {
  await page.evaluate(() => { const x = document.querySelector('#country-popup .cp-close, #country-popup [data-im-click="closeCountryPopup"]'); if (x) x.click(); else document.getElementById('country-popup').style.display = 'none'; });
}

/* a publisher is a name, never a citation: no series code, no parenthesis, no «World Development Indicators» */
function expectPublishers(stamps, when) {
  const named = stamps.filter((s) => s.pub);
  expect(named.length, `${when}: the card names sources`).toBeGreaterThanOrEqual(4);
  for (const s of named) {
    expect(s.pub, `${when}: «${s.label}» names a publisher, not the citation`).not.toMatch(/[()]|Indicators|\.[A-Z]{2,}\./);
    expect(s.pub.length, `${when}: «${s.label}»`).toBeLessThanOrEqual(24);
  }
  return named;
}

test('every figure on the country card names its publisher — after the World Bank refresh and after a trip through time', async ({ app }) => {
  test.setTimeout(120_000);
  const page = app.page;
  await answerWorldBank(page);
  try {
    await page.click('#btn-stats');
    await page.waitForFunction(() => document.querySelectorAll('#countries-feed .stat-row').length > 50, null, { timeout: 30000 });
    /* the one writer of a World Bank latest value (js/wb-layers.js applyStat → js/wb-indicators.js applyLatest), for every field it fills */
    const filled = await page.evaluate(async () => {
      const out = [];
      for (const f of ['gdp', 'gdppc', 'pop', 'milSpend', 'lifeExp', 'internet']) { const r = await window.IntMapWB.applyStat(f); if (r && r.n) out.push(f); }
      return out;
    });
    expect(filled.length, 'the World Bank series reached the table').toBeGreaterThanOrEqual(4);
    const now = expectPublishers(await cardStamps(page), 'after the refresh');
    expect(now.filter((s) => s.pub === 'World Bank').length, 'the World Bank figures say «World Bank»').toBeGreaterThanOrEqual(4);
    await closeCard(page);

    /* a trip through time and back to Now: js/time-countries.js sets the present aside and puts it back */
    await page.evaluate(() => window.IntMapTime.setYear(2010, { source: 'test' }));
    await page.waitForFunction(() => window._imTimeYear === 2010, null, { timeout: 30000 });
    await page.evaluate(() => window.IntMapTime.set(null, { source: 'test' }));
    await page.waitForFunction(() => !window._imTimeYear, null, { timeout: 30000 });
    const back = expectPublishers(await cardStamps(page), 'back at Now');
    expect(back.map((s) => s.label), 'the card after the trip is the card before it').toEqual(now.map((s) => s.label));
    await closeCard(page);
  } finally {
    await page.unroute(/^https:\/\/api\.worldbank\.org\/v2\//);
  }
});
