/* ============================================================================
 *  IntMap · search-identity — a search row's NAME and the place it FLIES TO are one place
 * ----------------------------------------------------------------------------
 *  Observed on production (2026-10-03, b797887):
 *    · 「Tokyo」 offered 「Japan · Tokyo」; tapping it (phone, 375 × 812) landed at 36.143°N 138.442°E —
 *      Japan's label point, a mountainside in Nagano, 932 m up — and the field then read 「Japan」.
 *      The row was a CAPITAL match drawn with the COUNTRY's coordinate (js/search-geocode.js
 *      `localFuzzyPlaces`), so its label named one place and its point was another.
 *    · 「Tokyo」 also offered Togo, Takeo, Mokpo and Soyo: an edit distance of 2 is half of a five-letter
 *      word, and nothing asked the measure every other door uses (js/atlas-geo-resolve.js `agreement`).
 *    · Enter did nothing a reader could see for five seconds: it re-ran the search and moved nowhere.
 *  The three geocoders are answered with nothing here: what is under test is what the device itself
 *  offers, which is what produced every one of the observations above.
 *  tests/search-identity-checks.test.mjs carries the halves that need no browser.
 *  (where-when-search) The same boots also carry «where + when» (js/where-when.js; the parse is evaluated in
 *  tests/where-when-search-checks.test.mjs): one reading goes on ONE Enter (an instant alone; one place) and flies AND sets
 *  the master clock; several places stay on the card to choose from; the palette reads the same line the same way.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const TOKYO = { lat: 35.6895, lng: 139.6917 };   /* GeoNames 1850147 — the row data/gazetteer-world.json.gz holds */
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

async function boot(page) {
  await page.route(/geocoding-api\.open-meteo\.com|nominatim\.openstreetmap\.org|photon\.komoot\.io/, (route) => {
    const u = route.request().url();
    const body = /photon/.test(u) ? '{"features":[]}' : /open-meteo/.test(u) ? '{"results":[]}' : '[]';
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
  /* the country table is what the capital rows come from; it loads on the field's first focus (js/app-body.js) */
  const ne = page.waitForResponse((r) => /ne-countries\//.test(r.url()), { timeout: 30_000 }).catch(() => null);
  await page.focus('#ms-input');
  await ne; await page.waitForTimeout(1500);
}
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#ms-results .ms-item:not(.ms-atlas)')]
  .map((e) => ({ label: e.firstChild ? e.firstChild.textContent : e.textContent, kind: (e.querySelector('.ms-kind') || {}).textContent || '' })));
const landed = async (page) => {
  await page.waitForTimeout(600);
  await page.waitForFunction(() => !window.__imap.isMoving(), null, { timeout: 20_000 });
  return page.evaluate(() => { const c = window.__imap.getCenter(); return { lat: c.lat, lng: c.lng, field: document.getElementById('ms-input').value }; });
};
async function typeTokyo(page) {
  await page.click('#ms-input');
  await page.fill('#ms-input', '');
  await page.keyboard.type('Tokyo', { delay: 30 });
}
const STRANGERS = /^(Togo|Takeo|Mokpo|Soyo)\b/;

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('every row the card offers for 「Tokyo」 lands on the place its label names, no stranger is offered, and Enter flies to the first candidate (but not an IME confirming)', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    await typeTokyo(page);
    await page.click('#ms-btn');
    await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item').length >= 1 && !document.querySelector('#ms-results .ms-loading'), null, { timeout: 15_000 });
    const card = await rows(page);
    expect(card.filter((r) => STRANGERS.test(r.label)), `rows ${JSON.stringify(card)}`).toEqual([]);
    const named = card.map((r, i) => ({ ...r, i })).filter((r) => /^Tokyo\b/.test(r.label));
    expect(named.length, `a row names Tokyo ${JSON.stringify(card)}`).toBeGreaterThanOrEqual(1);
    expect(card[0].label, 'the first row is the place whose whole name is the query').toMatch(/^Tokyo\b/);
    /* the identity: EVERY row whose label names Tokyo — first, or after a container as 「Japan · Tokyo」 did — lands at Tokyo, and the field shows the name the row leads with */
    for (let i = 0; i < card.length; i++) {
      if (i > 0) { await typeTokyo(page); await page.click('#ms-btn'); await page.waitForFunction(() => !document.querySelector('#ms-results .ms-loading') && document.querySelectorAll('#ms-results .ms-item').length >= 1, null, { timeout: 15_000 }); }
      await page.locator('#ms-results .ms-item:not(.ms-atlas)').nth(i).click();
      const at = await landed(page);
      const lead = card[i].label.split(',')[0].split(' · ')[0].trim();
      expect(at.field, `row ${i} 「${card[i].label}」 writes its own name into the field`).toBe(lead);
      if (card[i].label.split(/[,·]/).some((s) => s.trim() === 'Tokyo')) expect(km(at, TOKYO), `row ${i} 「${card[i].label}」 landed at ${at.lat.toFixed(3)}, ${at.lng.toFixed(3)}`).toBeLessThan(30);
    }

    /* …and Enter: one boot carries both (the suite's total time is at its ceiling — docs/TESTING.md) */
    await page.evaluate(() => { const x = document.querySelector('.src-card-close'); if (x) x.click(); window.__imap.jumpTo({ center: [0, 20], zoom: 2 }); });
    const before = await page.evaluate(() => window.__imap.getCenter());
    /* an IME composition's confirming Enter: the reader is still writing the name, not asking to go */
    await page.click('#ms-input');
    await page.fill('#ms-input', 'Tokyo');
    await page.evaluate(() => document.getElementById('ms-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true })));
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => ({ c: window.__imap.getCenter(), moving: window.__imap.isMoving() }));
    expect(still.moving || km(still.c, before) > 1, 'a composition Enter moved the map').toBe(false);
    await typeTokyo(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__imap.isMoving() || document.querySelector('.search-result-card'), null, { timeout: 6_000 });
    const at = await landed(page);
    expect(km(at, TOKYO), `Enter landed at ${at.lat.toFixed(3)}, ${at.lng.toFixed(3)}`).toBeLessThan(30);
    expect(at.field).toBe('Tokyo');

    /* (where-when-search) 「1914」: an instant alone is one reading — ONE Enter sets the clock and the map stays */
    await page.evaluate(() => { const x = document.querySelector('.src-card-close'); if (x) x.click(); window.IntMapTime.setNow({ source: 'test' }); });
    const c0 = await page.evaluate(() => window.__imap.getCenter());
    await page.click('#ms-input'); await page.fill('#ms-input', '1914');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.IntMapTime.isLive(), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const t1914 = await page.evaluate(() => ({ y: window.IntMapTime.year(), c: window.__imap.getCenter(), moving: window.__imap.isMoving() }));
    expect(t1914.y).toBe(1914);
    expect(t1914.moving || km(t1914.c, c0) > 1, 'a time-only line moved the map').toBe(false);
    /* 「江戸 1868-01」: one place (only the historical record knows 江戸 — it is Tokyo) — ONE Enter flies and sets the month */
    await page.evaluate(() => { window.IntMapTime.setNow({ source: 'test' }); window.__imap.jumpTo({ center: [0, 20], zoom: 2 }); });
    await page.click('#ms-input'); await page.fill('#ms-input', '江戸 1868-01');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.IntMapTime.isLive(), null, { timeout: 30_000 });
    const edo = await landed(page);
    expect(await page.evaluate(() => window.IntMapTime.iso())).toBe('1868-01-15');
    expect(km(edo, TOKYO), `江戸 1868-01 landed at ${edo.lat.toFixed(3)}, ${edo.lng.toFixed(3)}`).toBeLessThan(30);
    /* 「Salisbury 1950」: several places answer (Salisbury, England; Salisbury — Harare — in the city record) — Enter keeps
       the card open to choose from, and neither the clock nor the map moves */
    await page.evaluate(() => { const x = document.querySelector('.src-card-close'); if (x) x.click(); window.IntMapTime.setNow({ source: 'test' }); window.__imap.jumpTo({ center: [0, 20], zoom: 2 }); });
    await page.click('#ms-input'); await page.fill('#ms-input', 'Salisbury 1950');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item:not(.ms-atlas)').length >= 2 && !document.querySelector('#ms-results .ms-loading'), null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    const amb = await page.evaluate(() => ({ live: window.IntMapTime.isLive(), c: window.__imap.getCenter(), rows: [...document.querySelectorAll('#ms-results .ms-item:not(.ms-atlas)')].map((e) => e.textContent) }));
    expect(amb.live, `several places moved the clock ${JSON.stringify(amb.rows)}`).toBe(true);
    expect(km(amb.c, { lat: 20, lng: 0 }), 'several places moved the map').toBeLessThan(1);
    expect(amb.rows.every((r) => /Salisbury · 1950/.test(r)), JSON.stringify(amb.rows)).toBe(true);
    await page.keyboard.press('Escape');
    /* …and the palette reads 「Berlin May 1945」 as one place at one month */
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.waitForSelector('#cp-input', { timeout: 10_000 });
    await page.fill('#cp-input', 'Berlin May 1945');
    await page.waitForSelector('#im-palette .cp-row[data-kind="when"]', { timeout: 20_000 });
    const first = await page.evaluate(() => document.querySelector('#im-palette .cp-row[data-kind="when"] .cp-t').textContent);
    expect(first).toMatch(/^Berlin · May 1945$/);
    await page.click('#im-palette .cp-row[data-kind="when"]');
    await page.waitForFunction(() => !window.IntMapTime.isLive(), null, { timeout: 6_000 });
    const may = await landed(page);
    expect(await page.evaluate(() => window.IntMapTime.iso())).toBe('1945-05-15');
    expect(km(may, { lat: 52.52, lng: 13.405 }), `Berlin · May 1945 landed at ${may.lat.toFixed(3)}, ${may.lng.toFixed(3)}`).toBeLessThan(40);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('the first suggestion for 「Tokyo」, tapped twice, lands on Tokyo both times; Enter does the same', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    for (let n = 0; n < 2; n++) {
      await typeTokyo(page);
      await page.waitForFunction(() => document.querySelectorAll('#ms-results .ms-item:not(.ms-atlas)').length >= 1, null, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const list = await rows(page);
      expect(list.filter((r) => STRANGERS.test(r.label)), `suggestions ${JSON.stringify(list)}`).toEqual([]);
      expect(list[0].label, `suggestions ${JSON.stringify(list)}`).toMatch(/^Tokyo\b/);
      await page.locator('#ms-results .ms-item:not(.ms-atlas)').first().tap();
      const at = await landed(page);
      expect(km(at, TOKYO), `tap ${n + 1} landed at ${at.lat.toFixed(3)}, ${at.lng.toFixed(3)}`).toBeLessThan(30);
      expect(at.field).toBe('Tokyo');
      await page.evaluate(() => window.__imap.jumpTo({ center: [0, 20], zoom: 2 }));
    }
    await typeTokyo(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__imap.isMoving() || document.querySelector('.search-result-card'), null, { timeout: 6_000 });
    const at = await landed(page);
    expect(km(at, TOKYO), `Enter landed at ${at.lat.toFixed(3)}, ${at.lng.toFixed(3)}`).toBeLessThan(30);

    /* (where-when-search) the phone's sheet: 「Constantinople 1453」 suggests the city by the name it had; a tap flies to
       Istanbul and sets the clock to 1453 */
    await page.evaluate(() => { window.IntMapTime.setNow({ source: 'test' }); window.__imap.jumpTo({ center: [0, 20], zoom: 2 }); });
    await page.click('#ms-input'); await page.fill('#ms-input', '');
    await page.keyboard.type('Constantinople 1453', { delay: 10 });
    const row = page.locator('#ms-results .ms-item', { hasText: 'Constantinople · 1453' }).first();
    await row.waitFor({ timeout: 30_000 });
    expect(await row.textContent()).toMatch(/Istanbul/);
    await row.tap();
    const ist = await landed(page);
    expect(km(ist, { lat: 41.0082, lng: 28.9784 }), `landed at ${ist.lat.toFixed(3)}, ${ist.lng.toFixed(3)}`).toBeLessThan(30);
    expect(await page.evaluate(() => ({ y: window.IntMapTime.year(), live: window.IntMapTime.isLive() }))).toEqual({ y: 1453, live: false });
  });
});
