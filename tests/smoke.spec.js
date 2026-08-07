// Smoke test: does IntMap actually RUN in a real browser?
// One shared boot (the app is a large single-file page), then focused assertions that
// map 1:1 to the commission's §4.4 checklist. Distinguishes a genuine product breakage
// (uncaught exception, missing UI, blank screen) from a blocked external API (benign).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

// Critical globals that MUST exist for the app to be functional. (The page defines ~60
// window.IntMap* modules; these are the load-bearing ones checked as a boot signal.)
const CRITICAL_GLOBALS = [
  'IntMapOS', 'IntMapLayers', 'IntMapConsole', 'IntMapTime',
  'IntMapShare', 'IntMapAtlasQA', 'IntMapRegionResolver',
];

test.describe.configure({ mode: 'serial' });

let page, diag, response;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  // Count real DOCUMENT loads (survives reloads via sessionStorage; NOT incremented by the
  // app's same-document hash updates for shareable URLs). This is the honest reload-loop signal.
  await context.addInitScript(() => {
    try {
      const n = parseInt(sessionStorage.getItem('__smokeDocLoads') || '0', 10) + 1;
      sessionStorage.setItem('__smokeDocLoads', String(n));
    } catch { /* ignore */ }
  });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // Wait until the core app has booted: critical globals defined + the map container mounted.
  await page.waitForFunction(
    (globals) => globals.every((g) => typeof window[g] !== 'undefined') && !!document.getElementById('map'),
    CRITICAL_GLOBALS,
    { timeout: 45_000 },
  );
  // Let late boot work settle so we catch any deferred exceptions too.
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('serves the top page with a 2xx status (no 4xx/5xx)', async () => {
  expect(response, 'navigation returned a response').toBeTruthy();
  expect(response.status(), `HTTP status was ${response.status()}`).toBeLessThan(400);
});

test('no uncaught JavaScript exceptions (pageerror)', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});

test('no critical console.error from the app itself', async () => {
  // Blocked-external / network errors are filtered out by isBenign(); only app-origin errors remain.
  expect(diag.consoleErrors, `unexpected console.error(s):\n${diag.consoleErrors.join('\n---\n')}`).toHaveLength(0);
});

test('critical window.IntMap* modules are defined', async () => {
  const present = await page.evaluate(
    (globals) => globals.filter((g) => typeof window[g] !== 'undefined'),
    CRITICAL_GLOBALS,
  );
  expect(present, 'all critical globals present').toEqual(CRITICAL_GLOBALS);
});

test('the map container is mounted and visible', async () => {
  const mapEl = page.locator('#map');
  await expect(mapEl).toBeVisible();
  const box = await mapEl.boundingBox();
  expect(box, 'map container has a bounding box').toBeTruthy();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);
});

test('the layer UI initialised (~130 layer rows built)', async () => {
  const rows = await page.locator('.lyr-row').count();
  // The catalogue builds ~130 rows; assert a healthy lower bound so a boot that half-builds
  // the UI (a classic index.html regression) fails loudly, without being brittle to +/- a few.
  expect(rows, `only ${rows} .lyr-row elements built`).toBeGreaterThanOrEqual(100);
});

test('the initial screen is not blank', async () => {
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, 'body has visible text').toBeGreaterThan(20);
  const visibleControls = await page.locator('button:visible, [role="button"]:visible').count();
  expect(visibleControls, 'has visible interactive controls').toBeGreaterThan(0);
});

test('no infinite-reload loop', async () => {
  // The app writes the map camera into the URL hash (shareable links), which fires
  // framenavigated without reloading — so count real DOCUMENT loads instead. A fresh
  // context has empty storage, so the stale-build guard must not reload: expect exactly 1
  // (allow 2 for a single legitimate stale-guard reload); more means a reload loop.
  const docLoads = await page.evaluate(() => Number(sessionStorage.getItem('__smokeDocLoads') || '0'));
  expect(docLoads, `document loads: ${docLoads} (hash updates seen: ${diag.navigations.length})`).toBeLessThanOrEqual(2);
});
