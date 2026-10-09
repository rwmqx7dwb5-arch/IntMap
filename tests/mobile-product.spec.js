/* ============================================================================
 *  IntMap · mobile-product — the thumb on the phone's clock, on a phone (375 × 812, touch)
 * ----------------------------------------------------------------------------
 *  ① On another year the clock says that year, beside its face, and the year is what a finger lands on.
 *  ② A real finger (CDP touch events) dragged sideways along the clock, with the map centred on Kyoto in 1900: the
 *    map moves through time with the sheet where it was (Chronos does not open), the bubble above the sheet names the
 *    instant and what the map states over the centre, and the thumb lands on the DAY Kyoto's unit changes in 1943 —
 *    1943-07-01, not mid-June. A slow stroke near 1600 stops on Cliopatria's 1602 (Tokugawa). The bubble and the
 *    centre ring are above the sheet, and the ring is on the centre.
 *  ③ A tap (no travel) still opens Chronos — the clock is still the clock.
 *  ④ The arrow keys on the clock step to the next / previous change at the centre.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const KYOTO = [135.7681, 35.0116];

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.getElementById('m-clock') && !!window.IntMapHistScale, null, { timeout: 30_000 });
}
async function at(page, year) {
  await page.evaluate(([lng, lat, y]) => { window.__imap.jumpTo({ center: [lng, lat], zoom: 5 }); window.IntMapTime.setYear(y, { source: 'test' }); }, [...KYOTO, year]);
  await page.waitForFunction((y) => window.IntMapTime.year() === y, year);
}
const clockBox = (page) => page.evaluate(() => { const r = document.getElementById('m-clock').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
/* a finger: touchStart, moves, touchEnd — through the browser's own input pipeline */
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  return {
    down: (x, y) => send('touchStart', x, y),
    move: async (x0, y, x1, steps) => { for (let i = 1; i <= steps; i++) { await send('touchMove', x0 + (x1 - x0) * i / steps, y); await page.waitForTimeout(16); } },
    up: () => send('touchEnd', 0, 0),
  };
}
/* the pixels the thumb travels from one year to another on this screen — the module's own rate (js/time-thumb.js) */
const pxBetween = (page, y0, y1) => page.evaluate(([a, b]) => {
  const HS = window.IntMapHistScale, cur = new Date().getFullYear(), min = window.IntMapTime.min;
  const perPx = HS.rail.POS / (+document.getElementById('m-clock').dataset.railScreens * innerWidth);
  return (HS.rail.toPos(b, min, cur) - HS.rail.toPos(a, min, cur)) / perPx;
}, [y0, y1]);
const bubbleText = (page) => page.evaluate(() => { const b = document.getElementById('tt-bubble'); return b && b.classList.contains('on') ? b.innerText : ''; });

test.describe('mobile-product: 375 × 812, touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('①–④ the clock says the year, and a finger moves it with the map in full view, stopping where the centre changes', async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page);
    await at(page, 1900);
    /* ① the year, on the clock */
    await expect(page.locator('#m-clock .m-clock-y')).toHaveText('1900');
    const own = await page.evaluate(() => { const y = document.querySelector('#m-clock .m-clock-y'), r = y.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: r.width, own: !!h && !!h.closest('#m-clock') }; });
    expect(own.w, 'the year is drawn').toBeGreaterThan(20);
    expect(own.own, 'the year is part of the button a finger lands on').toBe(true);
    const detent0 = await page.evaluate(() => document.getElementById('sidebar').className.match(/sheet-(\w+)/g));

    /* ② the first touch fetches the thumb; a press that lifts before it arrives is a tap, so start with a short stroke */
    const c = await clockBox(page), F = await finger(page);
    await F.down(c.x, c.y);
    await F.move(c.x, c.y, c.x - 12, 3);
    await page.waitForFunction(() => !!document.getElementById('m-clock').dataset.railScreens, null, { timeout: 20_000 });
    /* the moves made while the module was on its way were not seen by it; the next one is (measured from the press) */
    await F.move(c.x - 12, c.y, c.x - 14, 1);
    /* the bubble names the centre; wait until the record has been read (it is read once per centre) */
    await page.waitForFunction(() => { const b = document.getElementById('tt-bubble'); return !!b && b.classList.contains('on') && !/Reading the historical records/.test(b.innerText); }, null, { timeout: 60_000 });
    /* from where the clock stood when the stroke began (1900) to 1943 */
    const dx = await pxBetween(page, 1900, 1943);
    expect(dx, '1900 → 1943 is a stroke a thumb makes').toBeGreaterThan(40);
    await F.move(c.x - 14, c.y, c.x + dx, 12);
    await page.waitForFunction(() => window.IntMapTime.iso() === '1943-07-01', null, { timeout: 10_000 });
    const mid = await bubbleText(page);
    expect(mid).toMatch(/map centre/i);
    expect(mid, 'the unit the record draws over Kyoto').toMatch(/京都|Kyoto|Kyōto/);
    expect(mid, 'the polity at the centre').toMatch(/Japan/);
    const geo = await page.evaluate(() => {
      const sb = document.getElementById('sidebar').getBoundingClientRect(), b = document.getElementById('tt-bubble').getBoundingClientRect(), r = document.getElementById('tt-ring');
      const rr = r.getBoundingClientRect(), p = window.__imap.project(window.__imap.getCenter()), mc = document.getElementById('map-container').getBoundingClientRect();
      return { sheetTop: sb.top, bubbleBottom: b.bottom, ringOn: r.classList.contains('on'), ring: [rr.left + rr.width / 2, rr.top + rr.height / 2], centre: [mc.left + p.x, mc.top + p.y] };
    });
    expect(geo.bubbleBottom, 'the bubble is above the sheet').toBeLessThan(geo.sheetTop);
    expect(geo.ringOn, 'the centre is marked').toBe(true);
    expect(Math.abs(geo.ring[0] - geo.centre[0]) + Math.abs(geo.ring[1] - geo.centre[1]), 'the ring is on the centre').toBeLessThan(3);
    await F.up();
    /* the stroke did not open Chronos and did not move the sheet */
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('news-timeline').classList.contains('collapsed') || !document.getElementById('news-timeline').classList.contains('active'))).toBe(true);
    expect(await page.evaluate(() => document.getElementById('sidebar').className.match(/sheet-(\w+)/g))).toEqual(detent0);
    expect(await page.evaluate(() => window.IntMapTime.iso()), 'the clock stays where the thumb lifted').toBe('1943-07-01');
    await expect(page.locator('#m-clock .m-clock-y')).toHaveText('1943');
    expect(await page.evaluate(() => document.getElementById('tt-live').textContent), 'the settled instant is announced once').toMatch(/Jul.*1943|1943/);

    /* where years are narrower than a pixel the thumb stops within reach of a change: near 1600, Cliopatria's 1602 */
    await at(page, 1600);
    const c2 = await clockBox(page);
    await F.down(c2.x, c2.y);
    await F.move(c2.x, c2.y, c2.x + 9, 3);   /* a stroke just past START_PX, resting a few pixels from 1602 */
    await page.waitForFunction(() => window.IntMapTime.iso() === '1602-01-01', null, { timeout: 60_000 });
    await page.waitForFunction(() => /Tokugawa/.test((document.getElementById('tt-bubble') || {}).innerText || ''), null, { timeout: 10_000 });
    await F.up();

    /* ③ ④ on the same page (one boot for the file): a tap still opens Chronos; the arrow keys step to where the centre
       changes. The click that ends a stroke is swallowed for 60 ms (js/time-thumb.js onUp) — the tap comes after it. */
    await page.waitForTimeout(100);
    await at(page, 1600);
    await page.tap('#m-clock');
    await page.waitForFunction(() => document.getElementById('news-timeline').classList.contains('active') || !document.getElementById('news-timeline').classList.contains('collapsed'), null, { timeout: 10_000 });
    /* close Chronos the way the panel closes, then step with the keyboard */
    await page.evaluate(() => { const tg = document.getElementById('ntl-toggle'); if (tg) tg.click(); });
    await at(page, 1600);
    await page.focus('#m-clock');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.IntMapTime.iso() === '1602-01-01', null, { timeout: 60_000 });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => window.IntMapTime.iso() === '1572-01-01', null, { timeout: 30_000 });
    expect(await page.evaluate(() => document.getElementById('tt-live').textContent)).toMatch(/1572/);
  });
});
