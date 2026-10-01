/* ============================================================================
 *  time-compare-lapse — 「1914 年 | 今日」 and the clock played forward, measured on the page
 * ----------------------------------------------------------------------------
 *  ① The comparison window holds a clock of its own. With the window at 1914 and the main map at 1960, BOTH
 *    draw historical borders and they are different records: the window's are the borders of 1914, read from
 *    the same chain the main map uses (js/time-borders.js `collectionAt`), and the main map's those of 1960.
 *    With the main map at today the window still draws 1914 and the main map draws no era record at all.
 *    A layer whose source states only the present (the USGS feed) is NOT drawn in the 1914 window, and the
 *    window says why. The window's instant rides in the share link (`ct=`) and comes back from it.
 *    Atlas sets the same thing through `time.compare`, and its verdict is read off the window.
 *  ② The time-lapse plays the main clock from 1898 to 1903, one frame per year, never skipping one, each
 *    frame drawn before the next — and the Köppen layer, ticked, is held before 1901 and BEGINS to be drawn at
 *    1901 (its first period), which the lapse reports.
 *  The node half is tests/time-compare-lapse-checks.test.mjs.
 *  ⚠ ITS OWN CONTEXT PER TEST: both tests move the main clock and leave the comparison window open; a shared
 *  page would hand the next spec a map in 1903 with a window open over it.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { bootPage } from './helpers/app.js';

async function boot(browser, hash) {
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await bootPage(page, { url: '/index.html' + (hash || '') });
  return { ctx, page };
}
/* the window's state and what its border source holds and what the renderer drew of it */
const windowNow = (page) => page.evaluate(() => {
  const C = window.IntMapCompare, s = C.timeState(), m = C._map();
  let data = null, drawn = 0;
  try { data = m.layers.sourceData('cmp-hb'); } catch (_) { data = null; }
  try { drawn = m.coords.queryRenderedFeatures(undefined, { layers: ['cmp-hb-l', 'cmp-hb-f'] }).length; } catch (_) { drawn = -1; }
  const names = data && data.features ? [...new Set(data.features.map((f) => f.properties && (f.properties.NAME || f.properties.name)).filter(Boolean))] : [];
  return { s, names, drawn, badge: document.getElementById('cmp-when') ? document.getElementById('cmp-when').textContent : '' };
});
const mainBorders = (page) => page.evaluate(() => {
  const TB = window.IntMapTimeBorders; const fc = TB.currentFC();
  return { active: TB.active(), key: TB.current(), names: fc ? [...new Set(fc.features.map((f) => f.properties && (f.properties.NAME || f.properties.name)).filter(Boolean))] : [] };
});

test('① the comparison window draws 1914 beside the main map at another instant', async ({ browser }) => {
  test.setTimeout(240000);
  const { ctx, page } = await boot(browser);
  await page.evaluate(() => window.IntMapCompare.open());
  await expect(page.locator('#compare-window')).toBeVisible();

  /* a present-only layer in a 1914 window: not drawn, and the window says why */
  await page.selectOption('#cmp-layers-sel', 'eq');
  await page.click('#compare-window [data-t="own"]');
  await page.fill('#cmp-year', '1914');
  await page.press('#cmp-year', 'Enter');
  await page.locator('#cmp-year').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForFunction(() => { const s = window.IntMapCompare.timeState(); return s.iso && s.iso.startsWith('1914') && s.verdict; }, null, { timeout: 60000 });
  let w = await windowNow(page);
  expect(w.s.follow).toBe(false);
  expect(w.s.verdict.status).toBe('unstated');
  expect(w.s.held).toBe(true);
  await expect(page.locator('#cmp-tnote')).toBeVisible();
  expect((await page.locator('#cmp-tnote').textContent()).length).toBeGreaterThan(10);
  const eqVisible = await page.evaluate(() => { try { return window.IntMapCompare._map().layers.getLayout('cmpx-eq', 'visibility'); } catch (_) { return 'absent'; } });
  expect(eqVisible).not.toBe('visible');   /* held (none) — or never added, the feed being unreachable under hermetic routing */

  /* the historical borders: the window at 1914, the main map at 1960 */
  await page.selectOption('#cmp-layers-sel', 'histb');
  await page.evaluate(() => window.IntMapTime.setYear(1960, { source: 'ui' }));
  await page.waitForFunction(() => { const s = window.IntMapCompare.timeState(); return s.layer === 'histb' && s.drawn && s.drawn.features > 0; }, null, { timeout: 120000 });
  await page.waitForFunction(() => { const TB = window.IntMapTimeBorders; return TB.active() && !!TB.currentFC(); }, null, { timeout: 120000 });
  await page.waitForFunction(() => { try { return window.IntMapCompare._map().coords.queryRenderedFeatures(undefined, { layers: ['cmp-hb-l'] }).length > 0; } catch (_) { return false; } }, null, { timeout: 60000 });
  w = await windowNow(page);
  const main = await mainBorders(page);
  expect(w.s.iso.startsWith('1914')).toBe(true);
  expect(w.s.main.iso.startsWith('1960')).toBe(true);
  expect(w.drawn).toBeGreaterThan(0);
  expect(w.names.length).toBeGreaterThan(20);
  expect(main.names.length).toBeGreaterThan(20);
  /* two records, not one: each instant has polities the other does not */
  const onlyWindow = w.names.filter((n) => !main.names.includes(n)), onlyMain = main.names.filter((n) => !w.names.includes(n));
  expect(onlyWindow.length).toBeGreaterThan(0);
  expect(onlyMain.length).toBeGreaterThan(0);
  expect(w.s.drawn.key).not.toBe(main.key);
  expect(w.badge).toContain('1914');
  expect(w.badge).toContain('1960');
  /* under 1914's borders the window does not draw today's political base (the CARTO raster) — physical geography,
     the main map's own rule while an era record answers (js/historical-basemap.js) */
  const base = await page.evaluate(() => { const L = window.IntMapCompare._map().layers;
    return { carto: L.getLayout('cmp-base-carto', 'visibility'), dark: L.getLayout('cmp-base-dark', 'visibility'), water: L.has('cmp-imhb-water') ? L.getLayout('cmp-imhb-water', 'visibility') : 'absent' }; });
  expect(base.carto).not.toBe('visible');
  expect(base.dark).not.toBe('visible');
  expect(base.water).toBe('visible');
  console.log('[time-compare-lapse] 1914 window only:', onlyWindow.slice(0, 40).join(' | '));
  console.log('[time-compare-lapse] 1960 main only:', onlyMain.slice(0, 40).join(' | '));

  /* the main map back to today: it draws no era record; the window keeps 1914 */
  await page.evaluate(() => window.IntMapTime.setNow({ source: 'ui' }));
  await page.waitForFunction(() => !window.IntMapTimeBorders.active(), null, { timeout: 30000 });
  w = await windowNow(page);
  expect(w.s.iso.startsWith('1914')).toBe(true);
  expect(w.s.main.live).toBe(true);
  expect(w.names.length).toBeGreaterThan(20);

  /* the share link carries the window's instant, and opens it again */
  await page.waitForFunction(() => /[#&]ct=1914(&|$)/.test(location.hash), null, { timeout: 15000 });
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toMatch(/[#&]cmp=1/);
  const again = await boot(browser, hash);
  await again.page.waitForFunction(() => { const s = window.IntMapCompare.timeState(); return s.open && s.iso && s.iso.startsWith('1914') && s.follow === false; }, null, { timeout: 60000 });
  await again.ctx.close();

  /* Atlas sets the window through the capability; its verdict is read off the window */
  const res = await page.evaluate(async () => {
    const r = await window.IntMapOS.execute('time.compare', { year: 1500 }, { source: 'test' });
    return { status: r.status, code: r.code, iso: window.IntMapCompare.timeState().iso, state: window.IntMapOS.state() };
  });
  expect(res.status).toBe('completed');
  expect(res.iso.startsWith('1500')).toBe(true);
  expect(res.state).toContain('COMPARISON WINDOW is open at 1500');
  /* the same call again is already there, not a second change */
  const again2 = await page.evaluate(async () => { const r = await window.IntMapOS.execute('time.compare', { year: 1500 }, { source: 'test' }); return r.code; });
  expect(again2).toBe('already_there');
  await ctx.close();
});

test('② the time-lapse plays one drawn frame per year, and Köppen begins to be drawn at 1901', async ({ browser }) => {
  test.setTimeout(240000);
  const { ctx, page } = await boot(browser);
  /* every instant the clock is set to, in order */
  await page.evaluate(() => { window.__lapseYears = []; window.IntMapTime.on((e) => { if (e.source === 'lapse') window.__lapseYears.push(e.isLive ? 'now' : e.year); }); });
  /* the Köppen box ticked (the kernel holds it before its first period) */
  await page.evaluate(() => { const cb = document.getElementById('dl-climate'); if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.click('#ntl-toggle');
  await expect(page.locator('#ntl-lapse-play')).toBeVisible({ timeout: 30000 });
  await page.click('#ntl-lapse [data-unit="year"]').catch(() => {});
  await page.fill('#ntl-lapse-from', '1898');
  await page.fill('#ntl-lapse-to', '1903');
  await page.click('#ntl-lapse [data-fps="4"]');
  await page.click('#ntl-lapse-play');
  /* held before 1901 */
  await page.waitForFunction(() => window.IntMapTime.when().getUTCFullYear() === 1899 && window.IntMapLayerTime && window.IntMapLayerTime.held('dl-climate'), null, { timeout: 120000 });
  /* to the end */
  await page.waitForFunction(() => /Reached the end|終了時点/.test(document.getElementById('ntl-lapse-status').textContent) || (window.IntMapTime.when().getUTCFullYear() === 1903 && !document.getElementById('ntl-lapse-play').classList.contains('on')), null, { timeout: 180000 });
  const years = await page.evaluate(() => window.__lapseYears);
  expect(years).toEqual([1898, 1899, 1900, 1901, 1902, 1903]);
  expect(await page.evaluate(() => window.IntMapLayerTime.held('dl-climate'))).toBe(false);
  /* Atlas reads the lapse — the transition is named with the row's own name */
  await page.evaluate(() => window.IntMapConsole || window.IntMapAtlas && window.IntMapAtlas.load && window.IntMapAtlas.load());
  await page.waitForFunction(() => typeof window.IntMapOS.state === 'function' && /TIME-LAPSE/.test(window.IntMapOS.state()), null, { timeout: 60000 });
  const st = await page.evaluate(() => window.IntMapOS.state());
  expect(st).toMatch(/TIME-LAPSE stopped \(end\): 1898-06-15 → 1903-06-15/);
  expect(st).toMatch(/began to be drawn: [^;]+/);
  /* and Atlas plays it too, and stops it */
  const play = await page.evaluate(async () => { const r = await window.IntMapOS.execute('time.lapse', { from: '1950', to: '1990', unit: 'year', step: 10, fps: 1 }, { source: 'test' }); return r.status; });
  expect(play).toBe('completed');
  const stop = await page.evaluate(async () => { const r = await window.IntMapOS.execute('time.lapse', { play: false }, { source: 'test' }); return r.status; });
  expect(stop).toBe('completed');
  await ctx.close();
});
