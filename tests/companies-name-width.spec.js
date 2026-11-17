/* ============================================================================
 *  Companies / Countries rows — the name keeps a readable width
 * ----------------------------------------------------------------------------
 *  Measured on production (build dcd32a0, 2026-11-18, 1440×900, dark): once a live quote time
 *  («2026-11-18 01:14») sat in a Companies row, the name column shrank to 34 px and Apple, Microsoft and
 *  NVIDIA read «A…», «Mi…», «N…». The row is a flex line of rank · pick · logo · name · value · Details;
 *  the value (price + a no-wrap time stamp) could not shrink, so the only column that could — the name —
 *  gave up everything. The rule this spec holds is the row's, not one width: the name keeps its floor,
 *  and the time stamp, the pick and Details give way first.
 *  Each case drives the rendered list at a reader's size and theme and reads the DOM.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* the floor the rows promise (css/intmap.css `--stat-name-min`), read from the page rather than copied here */
async function nameFloor(page) {
  return page.evaluate(() => {
    const row = document.querySelector('#info-dashboard .co-row .stat-main, #countries-feed .stat-row .stat-main');
    return row ? parseFloat(getComputedStyle(row).minWidth) || 0 : 0;
  });
}

/* every visible row: the name's width, whether a short name is cut, and whether the row spills */
async function measureRows(page, feedSel) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel + ' .stat-row')].slice(0, 40).map((r) => {
    const nm = r.querySelector('.stat-name'); const main = r.querySelector('.stat-main');
    return { name: nm ? nm.textContent.trim() : '', w: main ? main.getBoundingClientRect().width : 0,
      cut: nm ? nm.scrollWidth > nm.clientWidth + 1 : false, spill: r.scrollWidth > r.clientWidth + 1 };
  }), feedSel);
}

/* a live quote time in every row, as the US feed gives during market hours */
async function liveQuotes(page) {
  await page.evaluate(() => {
    const now = Date.now();
    const C = window.IntMapCompanies;
    if (!window.__cnwQuotes) window.__cnwQuotes = C.DATA.map((c) => ({ price: c.price, priceT: c.priceT, priceTexact: c.priceTexact }));
    for (const c of C.DATA) { if (!(c.price > 0)) { const m0 = C.mcap(c); c.price = 1; const m1 = C.mcap(c); c.price = (m0 > 0 && m1 > 0) ? m0 / m1 : 100; } c.priceT = now; c.priceTexact = true; }
  });
}

/* the page is shared with the specs after this one: put back the size, the theme and the quotes this spec handed it */
const restore = {};
test.beforeEach(async ({ app }) => {
  restore.size = app.page.viewportSize();
  restore.theme = await app.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
});
test.afterEach(async ({ app }) => {
  const page = app.page;
  if (restore.size) await page.setViewportSize(restore.size);
  await page.evaluate((t) => {
    if (t == null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    const saved = window.__cnwQuotes; if (!saved) return;
    window.IntMapCompanies.DATA.forEach((c, i) => Object.assign(c, saved[i]));
    delete window.__cnwQuotes;
  }, restore.theme);
});

async function openCompanies(page) {
  await page.click('#btn-info');
  await page.waitForFunction(() => document.querySelectorAll('#info-dashboard .co-row').length > 50, null, { timeout: 30000 });
  await liveQuotes(page);
  /* re-render with the stamps in place */
  await page.fill('#search-input', 'x'); await page.dispatchEvent('#search-input', 'input');
  await page.fill('#search-input', ''); await page.dispatchEvent('#search-input', 'input');
  await page.waitForFunction(() => /\d\d:\d\d/.test(document.querySelector('#info-dashboard .co-row .co-asof')?.textContent || ''), null, { timeout: 15000 });
}

for (const [label, size, theme] of [
  ['desktop dark', { width: 1440, height: 900 }, 'dark'],
  ['desktop light', { width: 1440, height: 900 }, 'light'],
  ['phone', { width: 375, height: 812 }, 'light'],
]) {
  test(`Companies (${label}): with live quote times the names stay readable`, async ({ app }) => {
    const page = app.page;
    await page.setViewportSize(size);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await openCompanies(page);
    const floor = await nameFloor(page);
    expect(floor, 'the name column declares a floor').toBeGreaterThanOrEqual(64);
    const rows = await measureRows(page, '#info-dashboard');
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.w, `${r.name}: name column ${r.w.toFixed(0)}px`).toBeGreaterThanOrEqual(floor - 0.5);
      expect(r.spill, `${r.name}: the row does not spill sideways`).toBe(false);
    }
    /* the names that were reported cut, whole */
    for (const n of ['Apple', 'Microsoft', 'NVIDIA']) {
      const r = rows.find((x) => x.name === n);
      if (r) expect(r.cut, `${n} is shown whole`).toBe(false);
    }
    /* (companies-live-time-wrap) the stamp breaks only between its words: production split «2026-11-18 04:53» into
       «2026-11-» / «18 04:53» in a 54 px column. Each word is laid out on ONE line (one line box), and the date and the
       time are either on one line or on two — never a date cut in two. Read from the layout, not from the markup. */
    const stamps = await page.evaluate(() => [...document.querySelectorAll('#info-dashboard .co-row .stat-val .co-asof')].slice(0, 40).map((s) => {
      const lineOf = (el) => { const rs = [...el.getClientRects()]; return { n: rs.length, top: rs.length ? Math.round(rs[0].top) : null }; };
      const words = [...s.querySelectorAll('.co-asof-w')].map((w) => ({ t: w.textContent, ...lineOf(w) }));
      return { text: s.textContent, words };
    }));
    expect(stamps.length).toBeGreaterThan(10);
    for (const s of stamps) {
      expect(s.words.map((w) => w.t).join(' '), 'the words are the stamp').toBe(s.text);
      for (const w of s.words) expect(w.n, `«${w.t}» of «${s.text}» is on one line`).toBe(1);
      const date = s.words.find((w) => /^\d{4}-\d\d-\d\d$/.test(w.t)), time = s.words.find((w) => /^\d\d:\d\d$/.test(w.t));
      expect(!!(date && time), `«${s.text}» is a date and a time`).toBe(true);
      expect(time.top >= date.top, 'the time is beside or under its date').toBe(true);
    }
  });
}

test('Countries (phone): the same row rule holds for the country list', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#btn-stats');
  await page.waitForFunction(() => document.querySelectorAll('#countries-feed .stat-row').length > 50, null, { timeout: 30000 });
  const floor = await nameFloor(page);
  const rows = await measureRows(page, '#countries-feed');
  for (const r of rows) {
    expect(r.w, `${r.name}: name column`).toBeGreaterThanOrEqual(floor - 0.5);
    expect(r.spill, `${r.name}: the row does not spill sideways`).toBe(false);
  }
});
