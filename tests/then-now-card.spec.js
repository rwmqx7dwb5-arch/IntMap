// then-now-card — 「あの頃といま」 in a real page: the swipe, its link, its card, and a finger on the divider.
//   ① thenNow at one place: the comparison window's map goes under a divider over the whole map (beside #map, under the
//     overlays), THEN on the left at 1914 with the borders of 1914, NOW on the right at today; the link says so;
//   ② the divider follows the pointer, and the link carries where it stands; the same link opens on the same swipe;
//   ③ the share panel's picture is then the two-instant card — a PNG that decodes at 1200 × 630 (and 1080 × 1080), whose
//     two panes hold a MAP (not the frame's dark ground, not one flat colour), whose THEN pane carries the border fill,
//     whose headline card and credit band hold text;
//   ④ at a phone's width, a finger moves the divider (real touch events, through CDP).
// ONE boot for all four (the suite's time is budgeted — scripts/test-budget.mjs): the link is opened in a second page while
// the first makes the card, and the phone half narrows the same page and turns touch emulation on.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

/* the main map draws a layer of its own data (the population-density choropleth, from the bundle) so that NOW is a map
   even with every tile host blocked; THEN draws the 1914 borders from the bundled border record */
const VIEW = '#v=12.0000,49.0000,3.60,0,0,f&l=dl-pop';

/* the made picture, decoded, and measured where the layout says things are. A pane is a MAP when its pixels are neither
   the frame's own ground (#0b0d12, painted where no picture arrived) nor one flat colour. */
const measure = (page, r) => page.evaluate(async (r) => {
  const img = new Image(); img.src = r.url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const stat = (b) => { const d = x.getImageData(b.x, b.y, b.w, b.h).data; let n = 0, ground = 0, s = 0, s2 = 0, sat = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4 * 5) { n++; const v = luma(d, i); s += v; s2 += v * v; if (v > 170) bright++;
      if (Math.abs(d[i] - 11) < 6 && Math.abs(d[i + 1] - 13) < 6 && Math.abs(d[i + 2] - 18) < 6) ground++;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); if (mx - mn > 28) sat++; }
    const mean = s / n; return { ground: ground / n, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), sat: sat / n, bright: bright / n }; };
  /* the panes' map areas: below the instant labels, above the headline and the band */
  const top = Math.round(c.height * 0.3), bottom = (r.card ? r.card.y : r.band.y) - 4, half = r.divider;
  return { w: c.width, h: c.height,
    then: stat({ x: 8, y: top, w: half - 16, h: bottom - top }), now: stat({ x: half + 8, y: top, w: c.width - half - 16, h: bottom - top }),
    card: r.card ? stat(r.card) : null, lines: r.band.lines.map((l) => stat(l).bright) };
}, r);

async function boot(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } }, opts || {}));
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  return { ctx, page };
}
const ready = (page) => page.waitForFunction(() => !!(window.IntMapCompare && window.IntMapCompare.thenNow && window.IntMapShare && window.IntMapBookmark), null, { timeout: 45_000 });
const state = (page) => page.evaluate(() => window.IntMapCompare.timeState());
const clipOf = (page) => page.evaluate(() => { const cm = document.getElementById('compare-map'); return cm ? (cm.style.clipPath || cm.style.webkitClipPath) : null; });

test('then-now-card ①–④ the swipe at one place, its link, its card and a finger', async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await boot(browser);
  try {
    await page.goto('/' + VIEW, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await ready(page);
    /* the restore's staged steps have run once the link's layer is on the map (its rows build from 700 ms) */
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.data-legend')).some((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 20), null, { timeout: 30_000 });
    const r0 = await page.evaluate(() => { const r = window.IntMapCompare.thenNow({ then: '1914', now: 'now' }); return { needsThen: r.needsThen }; });
    expect(r0.needsThen).toBe(false);
    await page.evaluate(() => window.IntMapCompare.judged());
    let s = await state(page);
    expect(s.mode).toBe('swipe');
    expect(s.follow).toBe(false);
    expect(s.label).toMatch(/1914/);
    expect(s.main.live, 'NOW is the present').toBe(true);
    expect(s.layer, 'with no layer picked, THEN draws the borders of its instant').toBe('histb');
    expect(s.split).toBe(0.5);
    /* the window's map is beside #map, under the overlays, cut at the divider; the window keeps its controls */
    const geo = await page.evaluate(() => { const cm = document.getElementById('compare-map'), mc = document.getElementById('map-container'), sw = document.getElementById('cmp-swipe');
      const r = cm.getBoundingClientRect(), m = mc.getBoundingClientRect();
      return { parent: cm.parentNode === mc, cover: Math.abs(r.width - m.width) < 2 && Math.abs(r.height - m.height) < 2, divider: !!sw && !sw.hidden,
        then: sw && sw.querySelector('.cmp-sw-then').textContent, now: sw && sw.querySelector('.cmp-sw-now').textContent,
        body: getComputedStyle(document.querySelector('#compare-window .cmp-body')).display, year: !!document.querySelector('#compare-window #cmp-year') }; });
    expect(geo).toMatchObject({ parent: true, cover: true, divider: true, body: 'none', year: true });
    expect(geo.then).toMatch(/1914/);
    expect(geo.now.length).toBeGreaterThan(0);
    expect(await clipOf(page)).toMatch(/inset\(0(px)? 50% 0(px)? 0(px)?\)/);
    /* the link says the swipe and the window's instant */
    await expect.poll(() => page.evaluate(() => window.IntMapBookmark.link())).toMatch(/[#&]cmp=s(&|$)[\s\S]*ct=1914/);

    /* ② the divider follows the pointer */
    const mc = await page.evaluate(() => { const r = document.getElementById('map-container').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const grip = await page.evaluate(() => { const r = document.querySelector('#cmp-swipe .cmp-sw-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(grip.x, grip.y); await page.mouse.down();
    await page.mouse.move(mc.x + mc.w * 0.45, grip.y, { steps: 4 });
    await page.mouse.move(mc.x + mc.w * 0.3, grip.y, { steps: 6 });
    await page.mouse.up();
    s = await state(page);
    expect(Math.abs(s.split - 0.3)).toBeLessThan(0.01);
    expect(await clipOf(page)).toMatch(/inset\(0(px)? 70% 0(px)? 0(px)?\)/);
    /* the keyboard moves it too (the slider pattern) */
    await page.focus('#cmp-swipe .cmp-sw-hit'); await page.keyboard.press('ArrowRight');
    expect(Math.abs((await state(page)).split - 0.31)).toBeLessThan(0.002);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => window.IntMapBookmark.link())).toMatch(/[#&]cmp=s30(&|$)/);
    const link = await page.evaluate(() => window.IntMapBookmark.link());
    /* the same link, opened while this page makes the card */
    const p2 = await ctx.newPage();
    const p2open = p2.goto('/' + link.slice(link.indexOf('#')), { waitUntil: 'domcontentloaded', timeout: 45_000 });

    /* ③ the share panel's picture is the two-instant card */
    const card = await page.evaluate(() => window.IntMapShare.open({ tab: 'image', title: 'Europe, 1914 and today' }).then((x) => x && Object.assign({}, x, { blob: undefined })));
    expect(card && card.ok, JSON.stringify(card && card.error)).toBe(true);
    expect(card.paired).toBe(true);
    expect([card.w, card.h, card.size]).toEqual([1200, 630, 'card']);
    expect(card.then).toMatch(/1914/);
    expect(card.name).toMatch(/^intmap-then-now-1914-.*-1200x630\.png$/);
    expect(card.credits.length).toBeGreaterThan(0);
    const base = (await page.locator('#map-credit').textContent()).replace(/\s+/g, ' ').trim();
    expect(card.credits.some((c) => c.includes(base)), base + ' is not credited in ' + card.credits.join(' | ')).toBe(true);
    /* THEN draws the 1914 borders, so the border records are credited (js/time-borders.js ERA_BORDER_CREDIT, the main map's credit too) */
    expect(card.credits.some((c) => /CShapes 2\.0/.test(c)), 'the border records are not credited in ' + card.credits.join(' | ')).toBe(true);
    const px = await measure(page, card);
    expect([px.w, px.h]).toEqual([1200, 630]);
    for (const k of ['then', 'now']) {
      expect(px[k].ground, k + ': the pane is the frame\'s dark ground — no map arrived').toBeLessThan(0.2);
      expect(px[k].sd, k + ': the pane is one flat colour — no map was drawn').toBeGreaterThan(4);
    }
    expect(px.then.sat, 'THEN carries the border fill of 1914').toBeGreaterThan(0.05);
    expect(px.card.bright, 'the headline card holds no text').toBeGreaterThan(0.02);
    for (const f of px.lines) expect(f, 'a credit line holds no text').toBeGreaterThan(0.02);
    /* the panel says which picture it is */
    await expect(page.locator('#share-panel .sh-pc-pair-d')).toContainText(/left|左/);
    /* the square shape, through Atlas's face */
    const sq = await page.evaluate(() => window.IntMapShare.postcard({ size: 'square' }).then((x) => x && Object.assign({}, x, { blob: undefined })));
    expect(sq.ok && sq.paired).toBe(true);
    expect([sq.w, sq.h]).toEqual([1080, 1080]);
    const pq = await measure(page, sq);
    expect(pq.then.ground).toBeLessThan(0.2); expect(pq.now.ground).toBeLessThan(0.2);

    /* ② the same link opens on the same swipe */
    await p2open;
    await ready(p2);
    await expect.poll(() => p2.evaluate(() => { const s = window.IntMapCompare.timeState(); return s && s.open && s.mode === 'swipe' ? Math.round(s.split * 100) + '@' + s.label : null; }), { timeout: 30_000 }).toMatch(/^30@.*1914/);
    expect(await clipOf(p2)).toMatch(/inset\(0(px)? 70% 0(px)? 0(px)?\)/);
    /* leaving the swipe puts the window's map back in the window */
    await p2.evaluate(() => window.IntMapCompare.setMode('sync'));
    expect(await p2.evaluate(() => document.getElementById('compare-map').parentNode.classList.contains('cmp-body'))).toBe(true);
    expect(await p2.evaluate(() => document.getElementById('cmp-swipe').hidden)).toBe(true);
    await p2.close();

    /* ④ a phone's width, and a finger: the same page narrowed, touch emulation on, real touch events through CDP */
    await page.evaluate(() => window.IntMapShare.close());
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await page.evaluate(() => window.IntMapCompare.setSplit(0.5));
    await page.waitForFunction(() => document.getElementById('map-container').getBoundingClientRect().width <= 390, null, { timeout: 10_000 });
    const g = await page.evaluate(() => { const r = document.querySelector('#cmp-swipe .cmp-sw-grip').getBoundingClientRect(), m = document.getElementById('map-container').getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      return { x, y, mx: m.left, mw: m.width, ours: !!(hit && hit.closest && hit.closest('#cmp-swipe')) }; });
    expect(g.ours, 'the grip is under the finger (nothing covers it)').toBe(true);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', g.x, g.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', g.x + (g.mx + g.mw * 0.75 - g.x) * i / 8, g.y);
    await touch('touchEnd', 0, 0);
    expect(Math.abs((await state(page)).split - 0.75)).toBeLessThan(0.02);
    expect(await clipOf(page)).toMatch(/inset\(0(px)? 25% 0(px)? 0(px)?\)/);
  } finally { await ctx.close(); }
});
