/* ============================================================================
 *  IntMap · mobile-next — the phone's own doors, on a phone (375 × 812, touch)
 * ----------------------------------------------------------------------------
 *  ① The empty search field holds «Here, now» and «Photo's place» above the example maps. A finger on «Here, now»
 *    (the device position is emulated at Tokyo Tower) puts the dot on the map and opens the card; every section
 *    settles to a value or a reason (none left «Reading…»), and every control of the card is what a finger lands on
 *    above the sheet and the data credit.
 *  ② The share sheet's door: a photo the worker put in the inbox (the bytes sw.js would have stored) opened by
 *    `?share=<id>` — a pin at the camera's position, the card for that point saying the camera recorded it, and
 *    «Map of the day it was taken» puts the clock on the shutter time. The inbox entry is read once.
 *  ⚠ The worker itself is evaluated in node (tests/mobile-next-checks.test.mjs ③); this suite blocks service
 *    workers (playwright.config.js), so the inbox is filled the way the worker fills it.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const TOKYO_TOWER = { latitude: 35.658585, longitude: 139.745433, accuracy: 12 };

async function boot(page, path) {
  await page.goto(path || '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}
/* every control of `sel` is what a finger lands on, above the sheet's top and the data credit */
const REACH = (sel) => {
  const root = document.querySelector(sel), out = [];
  const sheetTop = document.getElementById('sidebar').getBoundingClientRect().top;
  const credit = document.getElementById('map-credit'), creditTop = credit && credit.checkVisibility() ? credit.getBoundingClientRect().top : innerHeight;
  const bound = Math.min(sheetTop, creditTop);
  for (const el of root.querySelectorAll('button')) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    const own = !!hit && (hit === el || el.contains(hit));
    if (!own || y > bound || y < 0) out.push((el.dataset.hn || el.id || el.textContent.trim().slice(0, 20)) + ' @y' + Math.round(y) + (own ? ' below ' + Math.round(bound) : ' covered by ' + (hit ? hit.id || hit.className : 'nothing')));
    /* a finger is 44 px: the control is that tall, or a 44 px band through its centre lands on it (a 32 px × that takes the finger with an ::after) */
    const band = [y - 21, y + 21].every((yy) => { const h = document.elementFromPoint(x, yy); return !!h && (h === el || el.contains(h)); });
    if (r.height < 43.5 && !band) out.push((el.dataset.hn || el.id) + ' takes a finger only ' + Math.round(r.height) + ' px tall');
  }
  return out;
};

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

test.describe('mobile-next: 375 × 812, touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, geolocation: TOKYO_TOWER, permissions: ['geolocation'] });

  test('① «Here, now» from the empty search field: the dot, the card, every section settled, every control reachable', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    await page.tap('#ms-input');
    await page.waitForSelector('#ms-results .hn-entry [data-hn-entry="here"]', { state: 'visible', timeout: 20_000 });
    const order = await page.evaluate(() => { const r = document.getElementById('ms-results'); return [...r.children].map((c) => c.className.split(' ')[0]); });
    expect(order[0], 'the phone\'s doors come first, above the example maps').toBe('hn-entry');
    const rows = await page.evaluate(() => [...document.querySelectorAll('.hn-entry button')].map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, own: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === b }; }));
    for (const r of rows) { expect(r.own, 'the row is what a finger lands on').toBe(true); expect(r.h).toBeGreaterThanOrEqual(44); }
    await page.tap('.hn-entry [data-hn-entry="here"]');
    await page.waitForSelector('#pd-popup', { state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('#pd-popup [data-pending]').length === 0 && !!document.querySelector('#pd-popup .hn-sec'), null, { timeout: 60_000 });
    const card = await page.evaluate(() => ({
      title: document.getElementById('pd-title').textContent,
      secs: [...document.querySelectorAll('#pd-popup .hn-sec')].map((s) => ({ h: s.querySelector('.hn-h').textContent, empty: !s.textContent.replace(s.querySelector('.hn-h').textContent, '').trim() })),
      priv: (document.querySelector('#pd-popup .hn-priv') || {}).textContent || '',
      center: window.__imap.getCenter(),
      sheet: (document.body.className.match(/sheet-(full|half|min|hidden)/) || [''])[0],
    }));
    expect(card.title).toContain('Here, now');
    /* (place-through-time) and «This place through time» — for the device's own position it offers the reading instead of
       doing it (status 'ask'), so it still says something: the empty check below covers it */
    expect(card.secs.map((x) => x.h).join('|'), 'weather, earthquakes, news, the past, through time').toMatch(/Weather now.*Earthquakes nearby.*News nearby.*This place in the past.*This place through time/i);
    expect(card.secs.length).toBe(5);
    for (const s of card.secs) expect(s.empty, s.h + ' says a value or a reason').toBe(false);
    expect(card.priv).toContain('stays on this device');
    expect(Math.abs(card.center.lat - TOKYO_TOWER.latitude) < 0.2 && Math.abs(card.center.lng - TOKYO_TOWER.longitude) < 0.2, 'the map went to the reader').toBe(true);
    expect(card.sheet, 'the answer is on the map: the sheet came down').toBe('sheet-min');
    await settle(page, ['#pd-popup', '#sidebar']);
    expect(await page.evaluate(REACH, '#pd-popup'), 'controls a finger cannot use').toEqual([]);
    /* the record the card drew is also what the past section offers: a tap puts the map in that year (when the record has one here) */
    const past = await page.$('#pd-popup [data-hn="past"]:not([disabled])');
    if (past) {
      await past.tap();
      await page.waitForFunction(() => !window.IntMapTime.isLive(), null, { timeout: 10_000 });
      const y = await page.evaluate(() => window.IntMapTime.when().getUTCFullYear());
      expect(y, 'the map is in the year of the former name').toBeLessThan(1900);
    }
  });

  test('② the share sheet\'s door: a photo with the camera\'s position opens its place and the day it was taken', async ({ page }) => {
    test.setTimeout(150_000);
    await boot(page);
    /* a JPEG whose EXIF says 35°39'30.9"N 139°44'43.6"E, 2019-04-01 14:22:05 +09:00 — built the way a camera writes it */
    const id = await page.evaluate(async () => {
      const b = []; const u16 = (v) => b.push(v & 255, v >> 8 & 255), u32 = (v) => b.push(v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255), at = () => b.length;
      const put32 = (p, v) => { b[p] = v & 255; b[p + 1] = v >> 8 & 255; b[p + 2] = v >> 16 & 255; b[p + 3] = v >>> 24 & 255; };
      b.push(0x49, 0x49); u16(42); u32(8);
      u16(2); const e0 = at(); u16(0x8769); u16(4); u32(1); u32(0); const e1 = at(); u16(0x8825); u16(4); u32(1); u32(0); u32(0);
      const ex = at(); u16(2); const d0 = at(); u16(0x9003); u16(2); u32(20); u32(0); const d1 = at(); u16(0x9011); u16(2); u32(7); u32(0); u32(0);
      const gp = at(); u16(4); const g = []; for (const [t, ty, c] of [[1, 2, 2], [2, 5, 3], [3, 2, 2], [4, 5, 3]]) { g.push(at()); u16(t); u16(ty); u32(c); u32(0); } u32(0);
      put32(e0 + 8, ex); put32(e1 + 8, gp);
      const str = (s) => { const p = at(); for (const c of s) b.push(c.charCodeAt(0)); b.push(0); return p; };
      put32(d0 + 8, str('2019:04:01 14:22:05')); put32(d1 + 8, str('+09:00'));
      b[g[0] + 8] = 78; b[g[2] + 8] = 69;
      const rat = (vs) => { const p = at(); for (const [n, d] of vs) { u32(n); u32(d); } return p; };
      put32(g[1] + 8, rat([[35, 1], [39, 1], [309, 10]])); put32(g[3] + 8, rat([[139, 1], [44, 1], [436, 10]]));
      const len = b.length + 8, jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...b, 0xFF, 0xD9]);
      /* what sw.js takeShare writes */
      const id = Date.now().toString(36) + 'abcdef', scope = new URL('./', document.baseURI).href, c = await caches.open('intmap-page-share-inbox');
      const key = scope + '__share/' + id + '/0';
      await c.put(key, new Response(new Blob([jpg], { type: 'image/jpeg' })));
      await c.put(scope + '__share/' + id + '/meta', new Response(JSON.stringify({ id, at: Date.now(), title: '', text: '', url: '', files: [{ key, name: 'IMG_0401.jpg', type: 'image/jpeg', size: jpg.length }], dropped: 0 })));
      return id;
    });
    await boot(page, '/index.html?share=' + id);
    await page.waitForSelector('#pd-popup', { state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => /recorded by the camera/.test(document.getElementById('pd-lead').textContent), null, { timeout: 30_000 });
    const st = await page.evaluate(() => ({ url: location.search, center: window.__imap.getCenter(), lead: document.getElementById('pd-lead').textContent }));
    expect(st.url, 'the query is spent — a reload is an ordinary start').not.toContain('share=');
    expect(st.lead).toContain('2019-04-01 14:22');
    expect(Math.abs(st.center.lat - 35.6586) < 0.05 && Math.abs(st.center.lng - 139.7455) < 0.05, 'the map is at the camera\'s position').toBe(true);
    await page.tap('#pd-popup [data-hn="lead:0"]');
    await page.waitForFunction(() => !window.IntMapTime.isLive(), null, { timeout: 10_000 });
    expect(await page.evaluate(() => window.IntMapTime.when().toISOString())).toBe('2019-04-01T05:22:05.000Z');
    const left = await page.evaluate(async (i) => (await (await caches.open('intmap-page-share-inbox')).keys()).filter((k) => k.url.includes(i)).length, id);
    expect(left, 'the inbox entry is read once').toBe(0);
  });
});
