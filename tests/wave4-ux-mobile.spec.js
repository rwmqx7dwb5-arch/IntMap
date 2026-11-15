/* ============================================================================
 *  wave4-ux-mobile — the phone sheet's home, asked of a running app with a real finger
 * ----------------------------------------------------------------------------
 *  ONE cold phone visit (390 × 844, touch, no storage, Service Worker blocked, third-party hosts blocked), then:
 *
 *   ①  the first screen is unchanged: the sheet rests at `min` (the search row), and nothing of the home has been
 *      fetched or drawn — js/start-home.js is not requested until the reader reaches for the sheet.
 *   ②  ONE pull of the sheet with a finger (CDP touch, the head dragged upwards) lands on the starts: the home is
 *      drawn while the finger is still down, «Live now» is on screen at the rest the sheet comes to, and each switch
 *      carries the name its layer's tile carries. The time from navigation to that screen is printed (the
 *      «30 seconds» this home is for).
 *   ③  a switch turns its layer's own checkbox and lowers the sheet onto the map. Third-party hosts are blocked, so
 *      some live layers refuse and untick their own box WITHOUT a change event (the radar row): the switch must then
 *      say «off» too (MEASURED: the first version kept saying «on», and the next press switched the layer back ON and
 *      lowered the sheet). On the first layer that holds, a second press turns it off and the sheet stays where it is
 *      (switching off is not an answer).
 *   ④  choosing a tab takes the home away with the widget board (one owner of «no tab»), and widening the window
 *      hands the board back to the column.
 *
 *  ⚠ Like tests/first-impression.spec.js this opens its own context with an EMPTY storageState: its subject is the
 *  unseeded first visit.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';
import { installHermeticRouting } from './helpers/network.js';

test.describe.configure({ mode: 'serial' });

let context, page, cdp;
const fetched = [];
let t0 = 0;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light', storageState: { cookies: [], origins: [] } });
  await installHermeticRouting(context);
  context.on('request', (req) => { try { fetched.push(new URL(req.url()).pathname); } catch (_) { /* not a URL */ } });
  page = await context.newPage();
  cdp = await context.newCDPSession(page);
  t0 = Date.now();
  await page.goto(BASE + '/');
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 60_000 });
});
test.afterAll(async () => { await context?.close(); });

/** a finger on (x, y0) dragged to (x, y1) in `steps` moves, then lifted — the sheet's own touch path */
async function drag(x, y0, y1, steps) {
  const pt = (y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(Math.round(y0 + (y1 - y0) * i / steps)) });
    await page.waitForTimeout(16);
  }
  return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('① the first screen is the map and the search row; the home is not fetched', async () => {
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => ({ min: document.body.classList.contains('sheet-min'), home: !!document.querySelector('.m-home') }));
  expect(st.min, 'the sheet rests at its lowest reading stop').toBe(true);
  expect(st.home, 'no home is drawn before the reader reaches for the sheet').toBe(false);
  expect(fetched.filter((p) => /\/start-home[-.]/.test(p)), 'js/start-home.js is not on the start-up path').toEqual([]);
});

test('② one pull of the sheet lands on «Live now», named as the tiles name them', async () => {
  const head = await page.locator('#m-head').boundingBox();
  const x = Math.round(head.x + head.width / 2), y0 = Math.round(head.y + 12);
  const lift = await drag(x, y0, y0 - 380, 12);
  /* the finger is still down: the home is already in the sheet (dragStart asked for it) */
  await page.waitForSelector('.m-home .sh-chip', { state: 'attached', timeout: 15_000 });
  await lift();
  await page.waitForFunction(() => !document.body.classList.contains('sheet-min'), null, { timeout: 5000 });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2); return r.bottom <= innerHeight && r.top >= 0 && !!hit && el.contains(hit); };
    const chips = [...document.querySelectorAll('.m-home [data-sh-live]')];
    const rows = window.IntMapLayerSidebar.rows();
    return {
      shown: getComputedStyle(document.querySelector('.m-home')).display !== 'none',
      firstChipOnScreen: chips.length ? vis(chips[0]) : false,
      chips: chips.map((b) => ({ id: b.getAttribute('data-sh-live'), name: b.textContent, row: (rows.find((r) => r.id === b.getAttribute('data-sh-live')) || {}).name })),
      boardInHome: !!document.querySelector('.m-home > #widget-board'),
      /* every control of the starts answers a finger at 44 px (docs/architecture/09-mobile.md §9.2) */
      small: [...document.querySelectorAll('.sh-start button')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 44).map((b) => b.className + ' ' + Math.round(b.getBoundingClientRect().height)),
      order: [...document.querySelector('.sh-start').children].map((n) => n.className),
    };
  });
  console.log('[wave4-ux-mobile] navigation → starts on screen after one pull: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', JSON.stringify(st.order));
  await page.screenshot({ path: test.info().outputPath('home-half.png') });
  expect(st.shown).toBe(true);
  expect(st.chips.length, 'at least one live layer is offered').toBeGreaterThan(0);
  for (const c of st.chips) expect(c.name, c.id + ' says what its tile says').toBe(c.row);
  expect(st.firstChipOnScreen, 'the first switch is on screen at the rest one pull reaches, and takes the tap').toBe(true);
  expect(st.order[0], '«Live now» comes first').toBe('sh-live');
  expect(st.boardInHome, 'the widget board follows in the same scroller').toBe(true);
  expect(st.small, 'no control of the starts is smaller than a finger').toEqual([]);
});

test('③ a switch turns its layer on and lowers the sheet, tells the truth when the layer refuses, and off again leaves the sheet', async () => {
  const ids = await page.$$eval('.m-home [data-sh-live]', (bs) => bs.map((b) => b.getAttribute('data-sh-live')));
  const chip = (id) => '.m-home [data-sh-live="' + id + '"]';
  const seen = [];
  let held = null;
  for (const id of ids) {
    await page.evaluate(() => window.__setDetent('half'));
    await page.waitForTimeout(500);
    await page.tap(chip(id));
    await page.waitForFunction(() => document.body.classList.contains('sheet-min'), null, { timeout: 5000 });
    /* the layer's own outcome: third-party hosts are blocked here, so some layers refuse and untick their own box */
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__setDetent('half'));
    await page.waitForTimeout(500);
    const st = await page.evaluate((s) => ({ checked: document.getElementById(s.id).checked, pressed: document.querySelector(s.sel).getAttribute('aria-pressed') }), { id, sel: chip(id) });
    seen.push(id + ':' + (st.checked ? 'on' : 'refused'));
    expect(st.pressed, id + ': the switch says what the box says, after the layer\'s own outcome').toBe(String(st.checked));
    if (st.checked) { held = id; break; }
  }
  console.log('[wave4-ux-mobile] live switches tried', JSON.stringify(seen));
  expect(held, 'at least one live layer holds with third-party hosts blocked').not.toBeNull();
  await page.tap(chip(held));
  await page.waitForFunction((i) => !document.getElementById(i).checked, held, { timeout: 5000 });
  await page.waitForTimeout(500);
  const st = await page.evaluate((s) => ({ min: document.body.classList.contains('sheet-min'), pressed: document.querySelector(s).getAttribute('aria-pressed') }), chip(held));
  expect(st.min, 'switching off is not an answer on the map').toBe(false);
  expect(st.pressed).toBe('false');
});

test('④ a tab takes the home away with the board; a wide window gets the board back', async () => {
  await page.tap('#btn-news');
  await page.waitForTimeout(600);
  const tab = await page.evaluate(() => ({ home: getComputedStyle(document.querySelector('.m-home')).display, board: document.getElementById('widget-board').style.display }));
  expect(tab.board).toBe('none');
  expect(tab.home, 'no tab chosen is the one condition, and the board\'s owner states it').toBe('none');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForFunction(() => !document.querySelector('.m-home'), null, { timeout: 5000 });
  expect(await page.evaluate(() => document.getElementById('widget-board').parentElement.id)).toBe('sidebar');
});
