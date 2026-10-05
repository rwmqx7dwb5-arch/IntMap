// map-postcard — the browser half of tests/map-postcard-checks.test.mjs: what only a real page can answer.
//   ① a link with a title and a note opens with them over the map (and in the document's title), clear of the search
//     field and the legends; the share panel's Image tab makes a PNG of the chosen shape that DECODES at that size, with
//     the caption card, the legend picture and the credit band in its pixels, and the panel's caption edit reaches the
//     address bar; Atlas `postcard` makes one and sets the caption;
//   ② the same link as an embed keeps the caption (no close button); on a phone it sits above the credit pill.
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const TITLE = 'Climates of Europe — ケッペンの気候区分';
const NOTE = 'The climate zones and their legend, with every source credited in the band.';
const HASH = '#v=10.0000,48.0000,4.00,0,0,f&l=dl-climate&title=' + encodeURIComponent(TITLE) + '&note=' + encodeURIComponent(NOTE);
const boxOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const overlap = (a, b) => !!(a && b && a.w > 0 && b.w > 0 && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);

/* decode a made picture and read its pixels where the layout says things are */
const readPicture = (page, r) => page.evaluate(async (r) => {
  const img = new Image(); img.src = r.url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const stats = (b) => { const d = x.getImageData(b.x, b.y, b.w, b.h).data; let dark = 0, bright = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 3) { const v = luma(d, i); n++; if (v < 90) dark++; if (v > 170) bright++; } return { dark: dark / n, bright: bright / n }; };
  return { w: c.width, h: c.height, card: r.card ? stats(r.card) : null, legend: r.legendBoxes.length ? stats(r.legendBoxes[0]) : null,
    lines: r.band.lines.map((l) => stats(l).bright) };
}, r);

test('map-postcard ① the caption a link carries, and the map as one picture', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto('/' + HASH, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => !!(window.IntMapShare && window.IntMapShare.postcard), null, { timeout: 45_000 });
    /* the caption over the map, and in the title bar */
    await expect(page.locator('#im-caption')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#im-caption .imc-t')).toHaveText(TITLE);
    await expect(page.locator('#im-caption .imc-n')).toHaveText(NOTE);
    await expect.poll(() => page.title()).toMatch(new RegExp('^' + TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — '));
    /* the climate legend is on the map; the caption is clear of it and of the search field */
    await page.waitForFunction(() => { const el = document.getElementById('koppen-legend'); return el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 30; }, null, { timeout: 30_000 });
    await page.waitForTimeout(1200);   /* the caption is re-placed after the legend stack settles */
    const cap = await boxOf(page, '#im-caption');
    expect(overlap(cap, await boxOf(page, '#map-search')), 'the caption covers the search field').toBe(false);
    expect(overlap(cap, await boxOf(page, '#koppen-legend')), 'the caption covers the legend').toBe(false);
    /* the Image tab: a 1200 × 630 PNG that decodes, with the caption, the legend and the credits in its pixels */
    const r = await page.evaluate(() => window.IntMapShare.open({ tab: 'image' }).then((x) => x && Object.assign({}, x, { blob: undefined })));
    expect(r && r.ok, JSON.stringify(r && r.error)).toBe(true);
    expect([r.w, r.h, r.size]).toEqual([1200, 630, 'card']);
    expect(r.title).toBe(TITLE); expect(r.note).toBe(NOTE);
    expect(r.legends, 'the climate legend is in the picture').toBeGreaterThanOrEqual(1);
    expect(r.credits.length).toBeGreaterThan(0);
    const base = (await page.locator('#map-credit').textContent()).replace(/\s+/g, ' ').trim();
    expect(r.credits.some((c) => c.includes(base)), base + ' is not credited in ' + r.credits.join(' | ')).toBe(true);
    const px = await readPicture(page, r);
    expect([px.w, px.h]).toEqual([1200, 630]);
    expect(px.card.bright, 'the caption card holds no text').toBeGreaterThan(0.02);
    expect(px.card.dark, 'the caption card is not its dark ground').toBeGreaterThan(0.3);
    expect(px.legend.bright, 'the legend picture has no light card ground').toBeGreaterThan(0.3);
    expect(px.legend.dark, 'the legend picture holds no text').toBeGreaterThan(0.005);
    for (const f of px.lines) { expect(f, 'a credit line holds no text').toBeGreaterThan(0.02); expect(f).toBeLessThan(0.7); }
    /* the climate raster's own credit (Beck et al., CC BY 4.0) is in the band — the source declares it, the engine keeps it */
    expect(r.credits.some((c) => /Beck et al\. 2023/.test(c) && /CC BY 4\.0/.test(c)), 'Köppen is not credited in ' + r.credits.join(' | ')).toBe(true);
    /* the legend picture carries the key, not the handles: the hint the rows point at (aria-describedby) and the opacity
       row are blank card ground in the picture, while the title above them is ink — measured where the page laid them out */
    const ink = await page.evaluate(async ({ url, box }) => {
      const lg = document.getElementById('koppen-legend'), L = lg.getBoundingClientRect(), k = box.w / L.width;
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const at = (sel) => { const el = lg.querySelector(sel); if (!el) return null; const q = el.getBoundingClientRect(); if (q.height < 1) return null;
        const b = { x: Math.round(box.x + (q.left - L.left) * k) + 1, y: Math.round(box.y + (q.top - L.top) * k) + 1, w: Math.max(1, Math.round(q.width * k) - 2), h: Math.max(1, Math.round(q.height * k) - 2) };
        const d = x.getImageData(b.x, b.y, b.w, b.h).data, l = []; for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        const med = l.slice().sort((a, z) => a - z)[l.length >> 1]; return l.filter((v) => Math.abs(v - med) > 40).length / l.length; };
      return { title: at('h4'), hint: at('.kl-hint'), opacity: at('.dl-op-row') };
    }, { url: r.url, box: r.legendBoxes[0] });
    expect(ink.title, 'the measure cannot see text: the legend title has no ink').toBeGreaterThan(0.02);
    expect(ink.hint, 'the hint was not measured').not.toBeNull();
    expect(ink.hint, 'the operating hint is drawn into the legend picture').toBeLessThan(0.005);
    expect(ink.opacity, 'the opacity row was not measured').not.toBeNull();
    expect(ink.opacity, 'the opacity row is drawn into the legend picture').toBeLessThan(0.005);
    /* what the panel shows is that file, and Save writes it */
    await expect(page.locator('#share-panel .sh-pc-pv img')).toHaveAttribute('src', r.url);
    await expect(page.locator('#share-panel .sh-pc-save')).toHaveAttribute('download', r.name);
    expect(r.name).toMatch(/^intmap-.+-1200x630\.png$/);
    /* another shape */
    await page.click('#share-panel .sh-seg [data-size="square"]');
    await expect.poll(async () => (await page.locator('#share-panel .sh-pc-pv img').getAttribute('src')) !== r.url, { timeout: 30_000 }).toBe(true);
    const sq = await page.evaluate(async () => { const im = document.querySelector('#share-panel .sh-pc-pv img'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
    expect(sq).toEqual([1080, 1080]);
    /* a caption edit in the panel reaches the address bar and the map */
    await page.fill('#share-panel .sh-cap-t', 'Edited title');
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 10_000 }).toContain('&title=Edited%20title');
    await expect(page.locator('#im-caption .imc-t')).toHaveText('Edited title');
    await expect(page.locator('#share-panel .sh-url')).toHaveValue(/&title=Edited%20title/);
    /* Atlas makes one, and the caption it gives is the link's */
    const a = await page.evaluate(async () => { const x = await window.IntMapOS.execute('panel.postcard', { size: 'portrait', title: 'From Atlas' }, { source: 'test' }); return { status: x.status }; });
    expect(a.status).toBe('completed');
    expect(await page.evaluate(() => window.IntMapShare.caption().title)).toBe('From Atlas');
    const pt = await page.evaluate(async () => { const im = document.querySelector('#share-panel .sh-pc-pv img'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
    expect(pt).toEqual([1080, 1350]);
    /* closing the caption hides it; the link still carries it */
    await page.evaluate(() => window.IntMapShare.close());
    await page.click('#im-caption .imc-x');
    await expect(page.locator('#im-caption')).toBeHidden();
    expect(await page.evaluate(() => window.IntMapShare.link())).toContain('&title=From%20Atlas');
  } finally { await ctx.close(); }
});

test('map-postcard ② an embed keeps the caption, and a phone shows it above the credit pill', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 640, height: 400 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto('/?embed=1' + HASH, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.locator('#im-caption')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#im-caption .imc-t')).toHaveText(TITLE);
    await expect(page.locator('#im-caption .imc-x')).toBeHidden();
    const cap = await boxOf(page, '#im-caption');
    expect(cap.x >= 0 && cap.y >= 0 && cap.x + cap.w <= 640 && cap.y + cap.h <= 400, 'the caption is inside the frame: ' + JSON.stringify(cap)).toBe(true);
    expect(overlap(cap, await boxOf(page, '#im-embed-bar')), 'the caption covers the embed bar').toBe(false);
    expect(overlap(cap, await boxOf(page, '#map-credit')), 'the caption covers the credit').toBe(false);
  } finally { await ctx.close(); }
  const phone = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await installHermeticRouting(phone);
  const p2 = await phone.newPage();
  try {
    await p2.goto('/' + HASH, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(p2.locator('#im-caption')).toBeVisible({ timeout: 45_000 });
    await p2.waitForTimeout(1500);
    const cap = await boxOf(p2, '#im-caption'), cr = await boxOf(p2, '#map-credit');
    expect(cap.x >= 0 && cap.x + cap.w <= 390 && cap.y >= 0, 'the caption is on the screen: ' + JSON.stringify(cap)).toBe(true);
    expect(overlap(cap, cr), 'the caption covers the credit pill').toBe(false);
    expect(cap.y + cap.h <= cr.y + 0.5, 'the caption is above the credit pill').toBe(true);
  } finally { await phone.close(); }
});

/* ③ (share-simple) 「shareからどちらを押してもShare this viewウィンドウが開くのはちょっときもい。しかも、素人からしたら画面が複雑すぎ。」
   The Share menu's two items do two things: «Map screenshot» saves the picture without opening any panel, and «Share / copy
   link» opens on the link and its Copy button alone — the caption, the embed and the picture are folded under «More options»,
   which a caller who asks for one of them (the Image tab, a caption) finds open. */
test('map-postcard ③ the screenshot saves at once, and the share panel opens on the link alone', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto('/#v=10.0000,48.0000,4.00,0,0,f', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => !!(window.IntMapShare && window.IntMapShare.screenshot), null, { timeout: 45_000 });
    await page.waitForFunction(() => { try { return window.IntMapGeoEngine.ready(); } catch (_) { return false; } }, null, { timeout: 45_000 });
    /* the menu's screenshot: a PNG download, and no panel */
    await page.click('#btn-share-menu');
    const dl = page.waitForEvent('download', { timeout: 60_000 });
    await page.click('#btn-screenshot');
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^intmap-.+\.png$/);
    expect(await page.evaluate(() => { const p = document.getElementById('share-panel'); return !!p && getComputedStyle(p).display !== 'none'; })).toBe(false);
    /* the menu's link: the address and Copy are shown, everything else is folded */
    await page.click('#btn-share-menu');
    await page.click('#btn-share');
    await expect(page.locator('#share-panel .sh-url')).toBeVisible();
    await expect(page.locator('#share-panel .sh-copy')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('#share-panel .sh-more').open)).toBe(false);
    await expect(page.locator('#share-panel .sh-cap-t')).toBeHidden();
    await expect(page.locator('#share-panel .sh-tabs')).toBeHidden();
    /* unfolded, the caption and the embed/picture tabs are all there */
    await page.click('#share-panel .sh-more > summary');
    await expect(page.locator('#share-panel .sh-cap-t')).toBeVisible();
    await expect(page.locator('#share-panel .sh-tab[data-tab="embed"]')).toBeVisible();
    await expect(page.locator('#share-panel .sh-tab[data-tab="image"]')).toBeVisible();
    /* a caller who asks for the picture finds the fold open on it */
    await page.evaluate(() => window.IntMapShare.close());
    await page.evaluate(() => window.IntMapShare.open({ tab: 'image' }));
    expect(await page.evaluate(() => document.querySelector('#share-panel .sh-more').open)).toBe(true);
    await expect(page.locator('#share-panel .sh-pane[data-pane="image"]')).toBeVisible();
    await expect(page.locator('#share-panel .sh-url')).toBeVisible();
  } finally { await ctx.close(); }
});
