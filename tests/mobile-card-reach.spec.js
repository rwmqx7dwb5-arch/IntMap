/* ============================================================================
 *  IntMap · mobile-card-reach — a card on a phone must be REACHABLE, not merely visible
 * ----------------------------------------------------------------------------
 *  Production (5453fa7, 375 × 812, touch) showed two cards a finger could not use:
 *    A. the volcano card (a `.country-popup` mounted in #map-container) was drawn as a bottom sheet at
 *       y 0…812 — UNDER the real sheet (its search row at y 734) and under the data credit. «If it erupted
 *       now» and the thermal button were covered by #sidebar; the card did not scroll, because the part of
 *       it that held them was not on the screen.
 *    B. with the sheet at `half`, an Atlas example opens a sample card (`.atl-pv`) whose lower part —
 *       the free-plan line and «Log in to ask this» — sat below the screen, and `scrollIntoView
 *       ({block:'nearest'})` did nothing: the sheet's scroll box extends below the screen, so the card
 *       was already «inside» it.
 *  ⚠ THE POPULATION IS EVERY BUTTON OF THE CARD, not the two the report named. A button is reachable when,
 *  after the reader scrolls the card (a real finger, CDP touch), `elementFromPoint` at its centre is the
 *  button itself AND the point is on the map: below the top chrome, above the sheet and above the credit.
 *  «Visible» (display, opacity, in the viewport) passes with a sheet on top of it — see
 *  memory intmap-visible-is-not-unoccluded.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}

/* a real finger: drag up inside `sel` by `dy` px (CDP touch, not scrollTop) */
async function swipeUpIn(page, cdp, sel, dy) {
  const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 }; }, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y - (dy * i) / 8, id: 1 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

/* in the page: after scrolling the card's own box to bring each button in, is the button what a finger lands on,
   and is that point on the map (not under the sheet, the credit or the top chrome)? */
const REACH = ({ card, buttons, floor }) => {
  const root = document.querySelector(card);
  const sheetTop = document.getElementById('sidebar').getBoundingClientRect().top;
  const credit = document.getElementById('map-credit'), creditTop = credit && credit.checkVisibility() ? credit.getBoundingClientRect().top : innerHeight;
  const out = [];
  for (const el of root.querySelectorAll(buttons)) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const own = !!hit && (hit === el || el.contains(hit));
    const bound = Math.min(sheetTop, creditTop);
    const why = !own ? ('covered by ' + (hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0]) : 'nothing'))
      : (r.bottom > bound + 0.5 ? 'runs below ' + Math.round(bound) : (y < floor ? 'under the top chrome' : ''));
    if (why) out.push((el.dataset.volcp || el.className || el.id || el.textContent.slice(0, 24)) + ' @y' + Math.round(y) + ' ' + why);
  }
  return out;
};

test.describe('mobile-card-reach: 375 × 812, touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('A the volcano card: every button answers a finger above the sheet and the credit, and the card scrolls under a finger', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    await page.waitForFunction(() => !!window.IntMapBeta, null, { timeout: 30_000 });
    await page.evaluate(() => window.IntMapBeta.volcToggle(true));
    await page.waitForFunction(() => { try { return window.__imVolcLayer && window.__imVolcLayer.count() > 1000; } catch (_) { return false; } }, null, { timeout: 60_000 });
    await page.evaluate(async () => { await window.IntMapLazy.need('volcanoIntel'); await window.IntMapVolcano.open(283030); });   /* Fuji (GVP 283030) */
    await page.waitForFunction(() => { const b = document.querySelector('#volc-popup'); return b && getComputedStyle(b).display !== 'none' && b.querySelector('[data-volcp="ashsim"]'); }, null, { timeout: 30_000 });
    await page.waitForTimeout(1200);

    const cdp = await page.context().newCDPSession(page);
    const g = await page.evaluate(() => { const c = document.getElementById('volc-popup').getBoundingClientRect(); const t = document.getElementById('sidebar').getBoundingClientRect().top;
      const cr = document.getElementById('map-credit').getBoundingClientRect();
      return { cardBottom: c.bottom, sheetTop: t, creditTop: cr.top, creditShown: document.getElementById('map-credit').checkVisibility(), scrollable: document.getElementById('volc-popup').scrollHeight > document.getElementById('volc-popup').clientHeight }; });
    expect(g.cardBottom, 'the card ends above the sheet\'s top, not under it').toBeLessThanOrEqual(g.sheetTop + 0.5);
    if (g.creditShown) expect(g.cardBottom, 'the card ends above the data credit').toBeLessThanOrEqual(g.creditTop + 0.5);

    if (g.scrollable) {
      const before = await page.evaluate(() => document.getElementById('volc-popup').scrollTop);
      await swipeUpIn(page, cdp, '#volc-popup', 240);
      expect(await page.evaluate(() => document.getElementById('volc-popup').scrollTop), 'a finger scrolls the card itself').toBeGreaterThan(before);
    }
    const miss = await page.evaluate(REACH, { card: '#volc-popup', buttons: 'button, a[href]', floor: 0 });
    expect(miss, 'buttons of the volcano card a finger cannot use').toEqual([]);
    expect(await page.evaluate(() => !!document.querySelector('#volc-popup [data-volcp="ashsim"]')), 'the ash what-if is in the card').toBe(true);
  });

  test('B Atlas, signed out, sheet at half: the sample card is wholly on the screen and its login button answers a finger', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.click('#btn-community');
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForFunction(() => document.querySelectorAll('#atlas-panel .atl-chip').length > 0, null, { timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => { const c = document.querySelector('#atlas-panel .atl-chip'); c.click(); });
    await page.waitForSelector('#atlas-panel .atl-pv-login', { timeout: 10_000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const el = document.querySelector('#atlas-panel .atl-pv-login'), b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { bottom: b.bottom, vh: innerHeight, hits: hit === el || el.contains(hit), detent: (document.body.className.match(/sheet-(full|min|hidden)/) || ['sheet-half'])[0] };
    });
    expect(r.hits, 'the login button is what a finger lands on').toBe(true);
    expect(r.bottom, `the login button is on the screen (sheet ${r.detent})`).toBeLessThanOrEqual(r.vh);
  });
});
