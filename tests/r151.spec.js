// R151 runtime regression tests — verify behavior through the real page (hermetic, no network).
//   #3  Köppen row width stays constant while the legend is resized (scrollbar-gutter reserved)
//   #4  toolbar consolidation: Radius lives in the Measure menu; Screenshot + link in one Share menu
//   #8  Street View open() auto-shows coverage; close() restores it
//   #10 Companies batched spark helper + full-history cache exist on the module surface
//   #11 Atlas source cards drop SNS / UGC / shortener / video hosts (IntMapAtlasDebug.linkCards)
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';

const CRITICAL = ['IntMapConsole', 'IntMapAtlasDebug', 'IntMapStreetView'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(600);
});
test.afterAll(async () => { await page?.context()?.close(); });

test('#3 Köppen climate-name row width is constant across a resize (scrollbar gutter reserved)', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const r = await page.evaluate(() => {
    let lg = document.getElementById('koppen-legend');
    if (!lg) { lg = document.createElement('div'); lg.id = 'koppen-legend'; lg.className = 'koppen-legend'; document.body.appendChild(lg); }
    lg.innerHTML = '<h4>K</h4><div class="kl-scroll"></div><div class="kl-hint">h</div>';
    lg.style.display = 'flex'; lg.style.top = '74px'; lg.style.height = ''; lg.style.maxHeight = '';
    const sc = lg.querySelector('.kl-scroll');
    const mk = (n) => { sc.innerHTML = ''; for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'kl-item'; d.innerHTML = '<span class="kl-sw"></span>Zone ' + i; sc.appendChild(d); } };
    // few rows: no inner scrollbar needed
    mk(3); window._fitKoppenLegend(lg);
    const rowFew = sc.querySelector('.kl-item').getBoundingClientRect().width;
    // many rows: inner scroll active — with scrollbar-gutter:stable the row content width must NOT shift
    mk(40); lg.style.height = '300px'; window._fitKoppenLegend(lg);
    const rowMany = sc.querySelector('.kl-item').getBoundingClientRect().width;
    const gutter = getComputedStyle(sc).scrollbarGutter;
    lg.remove();
    return { rowFew: Math.round(rowFew), rowMany: Math.round(rowMany), gutter };
  });
  expect(r.gutter).toContain('stable');
  expect(Math.abs(r.rowFew - r.rowMany)).toBeLessThanOrEqual(1);   // row width unchanged whether or not the scrollbar shows
});

test('#4 toolbar: Radius is inside the Measure menu; Screenshot + link are inside the Share menu', async () => {
  const r = await page.evaluate(() => {
    const inMeasure = !!document.querySelector('#measure-dropdown #btn-tool-radius');
    const shareMenu = !!document.getElementById('btn-share-menu');
    const shotInShare = !!document.querySelector('#share-dropdown #btn-screenshot');
    const linkInShare = !!document.querySelector('#share-dropdown #btn-share');
    return { inMeasure, shareMenu, shotInShare, linkInShare };
  });
  expect(r.inMeasure).toBe(true);
  expect(r.shareMenu).toBe(true);
  expect(r.shotInShare).toBe(true);
  expect(r.linkInShare).toBe(true);
});

test('#8 opening Street View auto-shows coverage; closing restores it', async () => {
  const r = await page.evaluate(async () => {
    const SV = window.IntMapStreetView;
    if (!SV || !SV.coverage || !SV.open || !SV.coverageOn) return { module: false };
    SV.coverage(false);                       // start OFF
    const before = SV.coverageOn();
    SV.open({ lng: -73.9857, lat: 40.7580 }); // opening a panorama should turn coverage ON
    const during = SV.coverageOn();
    SV.close();                               // closing restores (it was auto-enabled → back OFF)
    const after = SV.coverageOn();
    return { module: true, before, during, after };
  });
  expect(r.module).toBe(true);
  expect(r.before).toBe(false);
  expect(r.during).toBe(true);    // coverage auto-shown while SV is open
  expect(r.after).toBe(false);    // auto-coverage removed on close (manual state preserved)
});

test('#10 Companies module exposes batched history/price plumbing', async () => {
  const r = await page.evaluate(() => {
    const C = window.IntMapCompanies;
    if (!C) return { module: false };
    return { module: true, hasLoadPrices: typeof C.loadPrices === 'function', hasSetYear: typeof C.setYear === 'function', hasSeries: typeof C.priceSeries === 'function', dataLen: (C.DATA || []).length };
  });
  expect(r.module).toBe(true);
  expect(r.hasLoadPrices).toBe(true);
  expect(r.hasSetYear).toBe(true);
  expect(r.hasSeries).toBe(true);
  expect(r.dataLen).toBeGreaterThan(100);
});

test('#11 Atlas source cards drop SNS / video / shortener hosts but keep reputable ones', async () => {
  const r = await page.evaluate(() => {
    const D = window.IntMapAtlasDebug;
    if (!D || !D.linkCards || !D.badSourceHost) return { api: false };
    const bad = ['twitter.com', 'x.com', 'www.facebook.com', 'youtube.com', 'youtu.be', 'reddit.com', 't.me', 'bit.ly'].map(h => D.badSourceHost(h));
    const good = ['reuters.com', 'www.bbc.com', 'nasa.gov', 'un.org', 'en.wikipedia.org'].map(h => D.badSourceHost(h));
    const html = D.linkCards([
      { url: 'https://twitter.com/someone/status/1', title: 'a tweet' },
      { url: 'https://www.youtube.com/watch?v=x', title: 'a video' },
      { url: 'https://www.reuters.com/world/article', title: 'real report' },
      { url: 'https://www.bbc.com/news/article', title: 'bbc report' },
    ]);
    return { api: true, bad, good, html };
  });
  expect(r.api).toBe(true);
  expect(r.bad.every(Boolean)).toBe(true);       // every SNS/video/shortener host flagged
  expect(r.good.some(Boolean)).toBe(false);      // no reputable/official host flagged
  expect(r.html).toContain('reuters.com');
  expect(r.html).toContain('bbc.com');
  expect(r.html).not.toContain('twitter.com');
  expect(r.html).not.toContain('youtube.com');
});

test('no uncaught page errors during R151 interactions', () => {
  expect(diag.pageErrors, 'pageerror list should be empty: ' + JSON.stringify(diag.pageErrors)).toHaveLength(0);
});
