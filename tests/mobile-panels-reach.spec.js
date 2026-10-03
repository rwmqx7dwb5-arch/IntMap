/* ============================================================================
 *  IntMap · mobile-panels-reach — everything that floats over the map on a phone is REACHABLE, whatever it is
 * ----------------------------------------------------------------------------
 *  #936 fixed one family (`#map-container > .country-popup`). Production (ba7e477, 375 × 812, touch) then showed the
 *  same defect in things that family's rule does not name:
 *    1. the ash panel (#ash-panel, «If it erupted now») ran to y 812; «Run on the live upper-air wind» sat under the
 *       sheet's grip (#sheet-grip, y 740) and a finger landed on the sheet.
 *    2. an Atlas sample card, opened and then the sheet put back to `half`, left «Log in to ask this» at y 1088.
 *  ⚠ THE POPULATION IS DISCOVERED, NOT LISTED. A floater is any direct child of <body>, #map-container or its column
 *  that is positioned (fixed / absolute), drawn, holds a control, and is neither the sheet nor a modal (a box that
 *  covers the screen). The census below finds them by those facts in every state the tests open, so a panel added
 *  tomorrow is measured the first time it is drawn — and one that is not held above the sheet fails here, by name.
 *  A control is reachable when, after a real finger scrolls the panel, `elementFromPoint` at its centre is the control
 *  itself AND the point is on the map: above the sheet's top and above the data credit.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}

/* a real finger: drag up inside the element `sel` by `dy` px (CDP touch, not scrollTop) */
async function swipeUpIn(page, cdp, sel, dy) {
  const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 }; }, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y - (dy * i) / 8, id: 1 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

/* in the page: every floater, by the facts above. Returns [{ id, label }] — `label` is what a reader of the failure needs. */
const CENSUS = () => {
  const mc = document.getElementById('map-container'), sheet = document.getElementById('sidebar');
  const hosts = [document.body, mc, mc && mc.parentElement].filter(Boolean);
  const seen = new Set(), out = [];
  for (const h of hosts) for (const el of h.children) {
    if (seen.has(el)) continue; seen.add(el);
    if (el === sheet || el.contains(sheet) || el.closest('#sidebar')) continue;
    if (el.matches('.m-sheet, .m-scrim') || el.id === 'map-credit') continue;          /* the sheet's own screens · the bound itself */
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height >= 0.9 * innerWidth * innerHeight) continue;                 /* a modal / the map itself */
    if (!el.querySelector('button, a[href], input, select, textarea, [role="button"]')) continue;
    out.push({ el, label: (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) });
  }
  return out.map((o) => { o.el.setAttribute('data-census', o.label); return o.label; });
};

/* in the page: for each floater, scroll each of its controls into view and ask what a finger lands on */
const REACH = (labels) => {
  const sheetTop = document.getElementById('sidebar').getBoundingClientRect().top;
  const credit = document.getElementById('map-credit'), creditTop = credit && credit.checkVisibility() ? credit.getBoundingClientRect().top : innerHeight;
  const bound = Math.min(sheetTop, creditTop), out = [];
  for (const lab of labels) {
    const root = document.querySelector('[data-census="' + CSS.escape(lab).replace(/\\#/g, '#') + '"]') || [...document.querySelectorAll('[data-census]')].find((e) => e.getAttribute('data-census') === lab);
    if (!root) { out.push(lab + ' vanished'); continue; }
    for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const own = !!hit && (hit === el || el.contains(hit) || (el.labels && [...el.labels].some((l) => l.contains(hit))));
      const what = (el.dataset && (el.dataset.volcp || el.dataset.act)) || el.id || String(el.className).split(' ')[0] || el.textContent.trim().slice(0, 24);
      const why = !own ? ('covered by ' + (hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0]) : 'nothing'))
        : (y > bound ? 'below the sheet/credit (' + Math.round(bound) + ')' : (y < 0 ? 'above the screen' : ''));
      if (why) out.push(lab + ' › ' + what + ' @y' + Math.round(y) + ' ' + why);
    }
  }
  return out;
};

/* the floaters, then the verdict — and a finger really scrolls the one that overflows */
async function expectReachable(page, cdp, must) {
  const labels = await page.evaluate(CENSUS);
  expect(labels, 'the census finds ' + must).toContain(must);
  const over = await page.evaluate((l) => { const e = document.querySelector('[data-census="' + l + '"]'); const sc = [e, ...e.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY)); if (!sc) return null; sc.setAttribute('data-census-scroll', '1'); return { before: sc.scrollTop }; }, must);
  if (over) {
    await swipeUpIn(page, cdp, '[data-census-scroll]', 240);
    expect(await page.evaluate(() => document.querySelector('[data-census-scroll]').scrollTop), must + ': a finger scrolls the panel itself').toBeGreaterThan(over.before);
  }
  const miss = await page.evaluate(REACH, labels);
  expect(miss, 'controls a finger cannot use').toEqual([]);
}

test.describe('mobile-panels-reach: 375 × 812, touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('the ash panel: «Run on the live upper-air wind» is above the sheet and answers a finger', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    await page.evaluate(async () => { await window.IntMapLazy.need('ashPlume'); window.IntMapAshPlume.open({ lng: 138.73, lat: 35.36 }); });
    await page.waitForSelector('#ash-panel .ash-go', { state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(800);
    const cdp = await page.context().newCDPSession(page);
    await expectReachable(page, cdp, '#ash-panel');
    /* the sheet moves: the panel follows its NEW top (half is a smaller map than peek, so the panel is capped and scrolls) */
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForTimeout(700);
    await expectReachable(page, cdp, '#ash-panel');
  });

  test('a simulator panel (radiation) is held above the sheet', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(async () => { window.IntMapRadiation.openPanel({ lng: 138.73, lat: 35.36 }); });
    await page.waitForSelector('#rad-panel', { state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(600);
    await expectReachable(page, cdp, '#rad-panel');
  });

  test('the tour builder', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
    await page.waitForFunction(() => !!window.IntMapAtlasExec, null, { timeout: 60_000 });
    const r = await page.evaluate(async () => { const X = window.IntMapAtlasExec; return X ? await X.execute('panel.tourBuilder', { action: 'open' }, {}) : 'no exec'; });
    console.log('tour open ->', JSON.stringify(r).slice(0, 200));
    await page.waitForSelector('#im-tour-builder', { state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(600);
    await expectReachable(page, cdp, '#im-tour-builder');
  });

  test('the place profile card', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const pt = await page.evaluate(() => { const mc = document.getElementById('map-container').getBoundingClientRect(); return { x: Math.round(mc.x + mc.width * 0.5), y: Math.round(mc.y + mc.height * 0.3) }; });
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /Place profile/.test(x.textContent));
      const sec = b && b.closest('.ctx-sec');
      if (sec && sec.hidden) { const g = sec.previousElementSibling; if (g && g.classList.contains('ctx-grp')) g.click(); }
    });
    await page.evaluate(() => [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /Place profile/.test(x.textContent)).click());
    await page.waitForSelector('#pd-popup', { state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('#pd-popup [data-pending]').length === 0, null, { timeout: 30_000 });
    await page.waitForTimeout(600);
    await expectReachable(page, cdp, '#pd-popup');
  });

  test('an Atlas sample card, the sheet put back to half: every control still answers a finger', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.click('#btn-community');
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForFunction(() => document.querySelectorAll('#atlas-panel .atl-chip').length > 0, null, { timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector('#atlas-panel .atl-chip').click());
    await page.waitForSelector('#atlas-panel .atl-pv-login', { timeout: 10_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__setDetent('half', true));
    await page.waitForTimeout(900);
    const cdp = await page.context().newCDPSession(page);
    const box = await page.evaluate(() => { const e = document.querySelector('#atlas-panel .atl-ex'), b = e.getBoundingClientRect(); return { h: b.height, scrolls: e.scrollHeight > e.clientHeight + 2, sheetTop: document.getElementById('sidebar').getBoundingClientRect().top, detent: (document.body.className.match(/sheet-(full|min|hidden)/) || ['sheet-half'])[0] }; });
    expect(box.detent, 'the sheet is at half').toBe('sheet-half');
    expect(box.scrolls, 'the card is taller than the window it is read through, so the window must scroll').toBe(true);
    await swipeUpIn(page, cdp, '#atlas-panel .atl-ex', 300);
    const r = await page.evaluate(() => {
      const el = document.querySelector('#atlas-panel .atl-pv-login'); el.scrollIntoView({ block: 'nearest' });
      const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { top: b.top, bottom: b.bottom, vh: innerHeight, own: hit === el || el.contains(hit), scrolled: document.querySelector('#atlas-panel .atl-ex').scrollTop };
    });
    expect(r.scrolled, 'a finger scrolled the examples area itself').toBeGreaterThan(0);
    expect(r.own, 'the login button is what a finger lands on').toBe(true);
    expect(r.bottom, 'the login button is on the screen').toBeLessThanOrEqual(r.vh);
    expect(r.top, 'the login button is below the top of the sheet').toBeGreaterThan(box.sheetTop);
  });
});
