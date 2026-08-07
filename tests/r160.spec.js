// R160 behavioural checks in a real browser (classic, non-workspace desktop mode).
// (B) The RIGHT layer sidebar OVERLAYS the map — opening/closing it never resizes or recentres the map
//     ("右サイドバーの開閉で地図領域の位置を動かすな"); the right-anchored HUD slides to clear the open panel.
// (C) Changing a setting no longer force-reopens the right sidebar ("設定を変更すると勝手に右サイドバーが出てくる").
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() }); // desktop classic mode
  await installHermeticRouting(context);
  // Force CLASSIC (non-workspace) mode so the left/right sidebars are the real classic panels (ws-mode makes them
  // floating windows). The reported bugs live in classic mode.
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(
    () => typeof window.IntMapLayerSidebar !== 'undefined' && !!window.__imap && typeof window.__imap.project === 'function' && !!document.getElementById('map'),
    null,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R160 (B) opening/closing the RIGHT sidebar never moves the map (fixed full-width container, geo-point stable)', async () => {
  // view a region at a normal zoom
  await page.evaluate(() => window.__imap.jumpTo({ center: [2.3, 48.85], zoom: 6 }));
  await page.waitForTimeout(400);
  // make sure the right panel is CLOSED to start
  await page.evaluate(() => window.IntMapLayerSidebar.close());
  await page.waitForTimeout(500);

  const before = await page.evaluate(() => {
    const map = window.__imap; const mc = document.getElementById('map-container');
    const r = mc.getBoundingClientRect();
    const g = map.unproject([r.width * 0.4, r.height / 2]); // a point that stays visible on both sides of the panel edge
    const p = map.project(g);
    return { pageX: r.left + p.x, pageY: r.top + p.y, lng: g.lng, lat: g.lat, w: r.width, right: r.right };
  });

  // OPEN the right sidebar — with the overlay layout the map-container does NOT change size or move
  await page.evaluate(() => window.IntMapLayerSidebar.open());
  await page.waitForTimeout(700);

  const after = await page.evaluate((g) => {
    const map = window.__imap; const mc = document.getElementById('map-container');
    const r = mc.getBoundingClientRect();
    const mr = getComputedStyle(mc).marginRight;
    const p = map.project({ lng: g.lng, lat: g.lat });
    return { pageX: r.left + p.x, pageY: r.top + p.y, w: r.width, right: r.right, marginRight: mr };
  }, before);

  expect(after.marginRight, 'the map is never pushed by a margin-right').toBe('0px');
  expect(Math.abs(after.w - before.w), `map-container width must NOT change (${before.w}→${after.w})`).toBeLessThan(2);
  expect(Math.abs(after.right - before.right), `map-container right edge must NOT move`).toBeLessThan(2);
  expect(Math.abs(after.pageX - before.pageX), `map pan X drift ${Math.round(after.pageX - before.pageX)}px`).toBeLessThan(6);
  expect(Math.abs(after.pageY - before.pageY), `map pan Y drift ${Math.round(after.pageY - before.pageY)}px`).toBeLessThan(6);
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});

test('R160 (B) the right-anchored HUD slides left to clear the open right sidebar', async () => {
  await page.evaluate(() => window.IntMapLayerSidebar.close());
  await page.waitForTimeout(500);
  const closedRight = await page.evaluate(() => {
    const el = document.querySelector('.map-controls-top'); return el ? Math.round(el.getBoundingClientRect().right) : null;
  });
  await page.evaluate(() => window.IntMapLayerSidebar.open());
  await page.waitForTimeout(700); // let the .38s right-transition finish (real browser → transitions run)
  const openState = await page.evaluate(() => {
    const el = document.querySelector('.map-controls-top');
    const panelW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lsr-w')) || 300;
    return { right: el ? Math.round(el.getBoundingClientRect().right) : null, panelW };
  });
  // the top-right controls move LEFT by ~ the panel width so they are not hidden behind it
  expect(closedRight, 'controls anchored to the right when the panel is closed').toBeGreaterThan(openState.right);
  expect(closedRight - openState.right, `controls shifted left by ~panel width (${closedRight - openState.right}px vs ${openState.panelW}px)`).toBeGreaterThan(openState.panelW - 40);
});

test('R160 (C) changing a setting does not re-open a right sidebar the user closed', async () => {
  // open Settings so every control reflects the current state (so Apply changes nothing but what we intend)
  await page.evaluate(() => document.getElementById('btn-open-settings')?.click());
  await page.waitForTimeout(300);
  // user deliberately CLOSES the right sidebar
  await page.evaluate(() => window.IntMapLayerSidebar.close());
  await page.waitForTimeout(400);
  const beforeApply = await page.evaluate(() => document.body.classList.contains('lsr-open'));
  expect(beforeApply, 'right sidebar is closed before applying settings').toBeFalsy();
  // Apply settings WITHOUT changing the layer-panel mode
  await page.evaluate(() => document.getElementById('btn-close-settings')?.click());
  await page.waitForTimeout(500);
  const afterApply = await page.evaluate(() => document.body.classList.contains('lsr-open'));
  expect(afterApply, 'the right sidebar must stay CLOSED after a settings apply (no force-reopen)').toBeFalsy();
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});
