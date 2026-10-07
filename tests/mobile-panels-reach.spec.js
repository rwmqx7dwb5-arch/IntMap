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

/* (spacetime-train) MOTION HAS STOPPED — the condition a fixed wait stood in for. Each named element's box (and its scroll
   offset) is read on three consecutive frames and must be the same on all three, and no finite animation or transition that
   moves it, its ancestors or its descendants may be running. Reading the box forces the style flush, so a transition that a
   class change has just asked for has already begun by the first read: a check made before the motion starts cannot pass.
   Unlike a fixed wait it cannot judge a panel half-way through its move, and it does not wait past the moment it stops. */
async function settle(page, sels, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const ok = await page.evaluate((list) => new Promise((res) => {
      const els = list.map((s) => document.querySelector(s));
      if (els.some((e) => !e)) { res(false); return; }
      const snap = () => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, e.scrollTop, e.scrollLeft].map((v) => Math.round(v * 2) / 2).join(','); }).join('|');
      const moving = () => document.getAnimations().some((a) => {
        if (a.playState !== 'running' || !a.effect || !(a.effect.target instanceof Element)) return false;
        if (a.effect.getTiming().iterations === Infinity) return false;   /* a spinner never stops; it does not move the panel */
        const t = a.effect.target; return els.some((e) => t === e || t.contains(e) || e.contains(t));
      });
      const a = snap();
      requestAnimationFrame(() => { const b = snap(); requestAnimationFrame(() => { const c = snap(); res(a === b && b === c && !moving()); }); });
    }), sels);
    if (ok) return;
    if (Date.now() > deadline) throw new Error('still moving after ' + timeout + ' ms: ' + sels.join(', '));
  }
}

/* a real finger: drag up inside the element `sel` by `dy` px (CDP touch, not scrollTop) */
async function swipeUpIn(page, cdp, sel, dy) {
  const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.6 }; }, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y - (dy * i) / 8, id: 1 }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page, [sel]);
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
    /* (mobile-next) a lone control that floats by itself (#iol-fab) is a floater too */
    if (!el.matches('button, a[href], input, select, textarea, [role="button"]') && !el.querySelector('button, a[href], input, select, textarea, [role="button"]')) continue;
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
    const SEL = 'button, a[href], input, select, textarea, [role="button"]';
    for (const el of [root.matches(SEL) ? root : null, ...root.querySelectorAll(SEL)].filter(Boolean)) {
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
    await settle(page, ['#ash-panel', '#sidebar']);
    const cdp = await page.context().newCDPSession(page);
    await expectReachable(page, cdp, '#ash-panel');
    /* the sheet moves: the panel follows its NEW top (half is a smaller map than peek, so the panel is capped and scrolls) */
    await page.evaluate(() => window.__setDetent('half', false));
    await settle(page, ['#ash-panel', '#sidebar']);
    await expectReachable(page, cdp, '#ash-panel');
  });

  test('a simulator panel (radiation) is held above the sheet', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(async () => { window.IntMapRadiation.openPanel({ lng: 138.73, lat: 35.36 }); });
    await page.waitForSelector('#rad-panel', { state: 'visible', timeout: 20_000 });
    await settle(page, ['#rad-panel', '#sidebar']);
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
    await settle(page, ['#im-tour-builder', '#sidebar']);
    await expectReachable(page, cdp, '#im-tour-builder');
  });

  test('the place profile card', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const pt = await page.evaluate(() => { const mc = document.getElementById('map-container').getBoundingClientRect(); return { x: Math.round(mc.x + mc.width * 0.5), y: Math.round(mc.y + mc.height * 0.3) }; });
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /About the place/.test(x.textContent));
      const sec = b && b.closest('.ctx-sec');
      if (sec && sec.hidden) { const g = sec.previousElementSibling; if (g && g.classList.contains('ctx-grp')) g.click(); }
    });
    await page.evaluate(() => [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /About the place/.test(x.textContent)).click());
    await page.waitForSelector('#pd-popup', { state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('#pd-popup [data-pending]').length === 0, null, { timeout: 30_000 });
    await settle(page, ['#pd-popup', '#sidebar']);
    await expectReachable(page, cdp, '#pd-popup');
  });

  /* (mobile-next) production f01c607, 375 × 812: with a pin on the map the object-list pill #iol-fab (a lone button, `bottom:104px`)
     appeared at y 670 and, with the sheet at half, lay across the layer screen's search field (input.lsr-q) — the overlap's taps
     went to the pill. The census missed it because it looked only for a control INSIDE a floater. */
  test('a lone floating button (#iol-fab) is held above the sheet, and never takes a finger meant for the sheet', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const pt = await page.evaluate(() => { const mc = document.getElementById('map-container').getBoundingClientRect(); return { x: Math.round(mc.x + mc.width * 0.5), y: Math.round(mc.y + mc.height * 0.3) }; });
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /Drop a pin/.test(x.textContent));
      const sec = b && b.closest('.ctx-sec');
      if (sec && sec.hidden) { const g = sec.previousElementSibling; if (g && g.classList.contains('ctx-grp')) g.click(); }
    });
    await page.evaluate(() => [...document.querySelectorAll('#ctx-menu button[data-act]')].find((x) => /Drop a pin/.test(x.textContent)).click());
    await page.waitForFunction(() => { const f = document.getElementById('iol-fab'); return !!f && getComputedStyle(f).display !== 'none'; }, null, { timeout: 20_000 });
    /* the layer screen at half — the state production showed */
    await page.click('#m-fab-map');
    await page.evaluate(() => window.__setDetent('half', false));
    await settle(page, ['#iol-fab', '#sidebar']);
    await expectReachable(page, cdp, '#iol-fab');
    /* the sheet's own field is the sheet's: nothing that floats takes its taps */
    const q = await page.evaluate(() => {
      const f = document.getElementById('iol-fab').getBoundingClientRect();
      const inp = [...document.querySelectorAll('#sidebar input.lsr-q, #sidebar #lsr-q, .m-sheet input.lsr-q')].find((e) => e.checkVisibility());
      const out = { fabBottom: f.bottom, sheetTop: document.getElementById('sidebar').getBoundingClientRect().top, field: null };
      if (inp) { const r = inp.getBoundingClientRect(); const x = r.left + 12, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); out.field = { y: Math.round(y), own: hit === inp || inp.contains(hit), hit: hit ? (hit.id || hit.className) : null }; }
      return out;
    });
    expect(q.fabBottom, 'the pill is above the sheet').toBeLessThanOrEqual(q.sheetTop);
    if (q.field && q.field.y > 0 && q.field.y < 812) expect(q.field.own, 'the layer search field takes its own taps (got ' + q.field.hit + ')').toBe(true);
    /* full: no map above the sheet — the lone pill steps back and the sheet keeps every tap */
    await page.evaluate(() => window.__setDetent('full', false));
    await settle(page, ['#iol-fab', '#sidebar']);
    const full = await page.evaluate(() => {
      const f = document.getElementById('iol-fab'), r = f.getBoundingClientRect();
      const hit = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return { took: !!hit && (hit === f || f.contains(hit)), fit: f.getAttribute('data-m-fit') };
    });
    expect(full.took, 'over a full sheet the pill takes no finger (data-m-fit=' + full.fit + ')').toBe(false);
    /* and it comes back when the sheet comes down */
    await page.evaluate(() => window.__setDetent('half', false));
    await settle(page, ['#iol-fab', '#sidebar']);
    await expectReachable(page, cdp, '#iol-fab');
  });

  test('an Atlas sample card, the sheet put back to half: every control still answers a finger', async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await page.click('#btn-community');
    await page.evaluate(() => window.__setDetent('half', false));
    await page.waitForFunction(() => document.querySelectorAll('#atlas-panel .atl-chip').length > 0, null, { timeout: 30_000 });
    await settle(page, ['#atlas-panel', '#sidebar']);
    await page.evaluate(() => document.querySelector('#atlas-panel .atl-chip').click());
    await page.waitForSelector('#atlas-panel .atl-pv-login', { timeout: 10_000 });
    await settle(page, ['#atlas-panel .atl-ex', '#sidebar']);
    await page.evaluate(() => window.__setDetent('half', true));
    await settle(page, ['#atlas-panel .atl-ex', '#sidebar']);
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
