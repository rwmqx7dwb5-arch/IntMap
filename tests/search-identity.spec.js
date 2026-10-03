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
  });
});
