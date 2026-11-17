/* ============================================================================
 *  space-expansion — the sky tonight and the eclipse path, asked of a running app
 * ----------------------------------------------------------------------------
 *  The arithmetic is held in Node (tests/space-almanac-checks.test.mjs, tests/space-almanac-panel-checks.test.mjs);
 *  this asks the page what a reader gets from it, on a fixed clock so the answers are the same every run:
 *
 *   ①  the tools row opens the panel ASKING for a point (#R302) — nothing computed for the map's centre.
 *   ②  given Tokyo on 2026-08-12 (the Perseids' peak), the panel prints its six sections, names the Perseids among
 *      the active showers, and its state agrees with js/space-almanac.js computed for the same point and instant.
 *   ③  the eclipse layer draws the 2026-08-12 total eclipse — a band, a centre line and a greatest point — and the
 *      band crosses northern Spain (Burgos, 42.34 N 3.70 W, is inside it).
 *   ④  at phone width (375 px) the panel stays inside the viewport.
 *  Third-party hosts are blocked (installHermeticRouting): the satellite-pass section may then say it could not load,
 *  which is the honest answer — the test does not require passes.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers/app.js';
import { installHermeticRouting } from './helpers/network.js';

const TOKYO = { lng: 139.6917, lat: 35.6895 };
const PERSEIDS_NIGHT = Date.UTC(2026, 7, 12, 12, 0);   /* 21:00 JST on the Perseids' 2026 peak night */
const BURGOS = [-3.70, 42.34];

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }) => { await installHermeticRouting(context); });

test('① the tools row asks for a point before it computes anything', async ({ page }) => {
  await bootPage(page);
  await page.evaluate(() => window.IntMapLazy.need('skyAlmanac'));
  await page.evaluate(() => window.IntMapSkyAlmanac.open());
  const st = await page.evaluate(() => window.IntMapSkyAlmanac.state());
  expect(st.open).toBe(true);
  expect(st.site).toBeNull();
  expect(st.planetsSeen).toEqual([]);
  await page.evaluate(() => window.IntMapSkyAlmanac.close());
});

test('② Tokyo on the Perseids night: six sections, the Perseids active, the same answer as the almanac', async ({ page }, info) => {
  await bootPage(page);
  await page.evaluate(() => window.IntMapLazy.need('skyAlmanac'));
  await page.evaluate(([ll, when]) => window.IntMapSkyAlmanac.open(ll, { when }), [TOKYO, PERSEIDS_NIGHT]);
  await page.waitForFunction(() => { const s = window.IntMapSkyAlmanac.state(); return s.night && !s.busy; }, null, { timeout: 30_000 });
  const st = await page.evaluate(() => window.IntMapSkyAlmanac.state());
  expect(st.sections.length).toBe(6);
  expect(st.showers).toContain('PER');
  const direct = await page.evaluate(([ll, when]) => {
    const A = window.IntMapAlmanac.almanac({ lat: ll.lat, lng: ll.lng, when });
    return { seen: A.planets.filter((p) => p.visibleTonight).map((p) => p.id), showers: A.showers.map((s) => s.code) };
  }, [TOKYO, PERSEIDS_NIGHT]);
  expect(st.planetsSeen.slice().sort()).toEqual(direct.seen.slice().sort());
  expect(st.showers.slice().sort()).toEqual(direct.showers.slice().sort());
  /* the panel's own words are on screen, not just its state */
  const text = await page.evaluate(() => { const p = document.getElementById('sky-almanac'); return p ? p.innerText : ''; });
  expect(text).toMatch(/Perseids|ペルセウス/);
});

test('③ the eclipse layer draws 2026-08-12 across northern Spain', async ({ page }, info) => {
  await bootPage(page);
  /* the arithmetic arrives with the almanac (js/space-events.js, js/space-eclipse-path.js); the page is a bundle, so they are read off window */
  await page.evaluate(() => window.IntMapLazy.need('skyAlmanac'));
  const msMax = await page.evaluate(async () => {
    const E = window.IntMapSpaceEvents.eclipses(Date.UTC(2026, 7, 1), 30, true);
    return E.length ? E[0].ms : null;
  });
  expect(msMax).not.toBeNull();
  await page.evaluate((ms) => {
    const cb = document.getElementById('dl-eclipse');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    return new Promise((r) => setTimeout(r, 0)).then(() => window.IntMapEclipseLayer && window.IntMapEclipseLayer.show(ms));
  }, msMax);
  await page.waitForFunction(() => { const s = window.IntMapEclipseLayer && window.IntMapEclipseLayer.state(); return s && s.on && s.kind; }, null, { timeout: 30_000 });
  const st = await page.evaluate(() => window.IntMapEclipseLayer.state());
  expect(st.kind).toBe('total');
  const inside = await page.evaluate(async (pt) => {
    const P = window.IntMapEclipsePath.solarEclipsePath(Date.UTC(2026, 7, 12, 17, 47));
    const ring = P.umbra && (P.umbra.type === 'Polygon' ? [P.umbra.coordinates[0]] : P.umbra.coordinates.map((p) => p[0]));
    const hit = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
    return !!ring && ring.some(hit);
  }, BURGOS);
  expect(inside).toBe(true);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [-5, 45], zoom: 3 }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('eclipse-2026-08-12.png') });
});

test('④ at phone width the panel stays inside the viewport', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await bootPage(page);
  await page.evaluate(() => window.IntMapLazy.need('skyAlmanac'));
  await page.evaluate(([ll, when]) => window.IntMapSkyAlmanac.open(ll, { when }), [TOKYO, PERSEIDS_NIGHT]);
  await page.waitForFunction(() => { const s = window.IntMapSkyAlmanac.state(); return s.night && !s.busy; }, null, { timeout: 30_000 });
  const box = await page.evaluate(() => {
    const p = document.getElementById('sky-almanac'); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth };
  });
  expect(box).not.toBeNull();
  expect(box.l).toBeGreaterThanOrEqual(0);
  expect(box.r).toBeLessThanOrEqual(box.w + 0.5);
  await page.screenshot({ path: info.outputPath('sky-tonight-375.png') });
  await ctx.close();
});
