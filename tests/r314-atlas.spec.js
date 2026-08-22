/* ============================================================================
 *  R314 — the half of the kernel's browser proof that needs Atlas itself
 * ----------------------------------------------------------------------------
 *  These three assertions all require js/atlas-console.js — 719 kB fetched on demand (#R224) — so
 *  they cannot live in tests/r314.spec.js, which stands in the sixty-four-second gate. Same round,
 *  same subject, different tier: this one runs nightly and on demand, the way r226-seismic and
 *  r251-langs do for the same reason.
 *
 *  What is only checkable HERE is the join: the registry knows the descriptors from boot, and Atlas
 *  is what teaches it how to reach the engine. Until that happens a capability is `unavailable` —
 *  a true statement — and afterwards it runs.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  /* the module id is the loader's, not a guess: js/lazy-modules.js PUBLISHES window.IntMapConsole */
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

test('R314-atlas ①: loading Atlas binds the registry to the engine, and the same kernel is used', async () => {
  const r = await page.evaluate(async () => {
    const C = window.IntMapCapabilities;
    const k = await window.IntMapOS.kernel();
    return {
      ready: C.runtimeReady(),
      docs: C.docsReady(),
      avail: C.resolve('view.flyTo').availability(C.context()),
      /* ⚠ ONE kernel. If Atlas had built its own, the two would have separate operation registries
         and separate conflict locks — two kernels, which is the disagreement this round ends. */
      oneKernel: k === window.IntMapOS.__atlasKernel,
      execIsKernels: window.IntMapAtlasExec === k.exec,
    };
  });
  expect(r.ready, 'the registry never learned how to reach the engine').toBe(true);
  expect(r.docs, 'Atlas loaded and never handed the registry its catalogue').toBe(true);
  expect(r.avail.available).toBe(true);
  expect(r.oneKernel, 'Atlas built a SECOND kernel — installAtlasKernel is no longer idempotent').toBe(true);
  expect(r.execIsKernels).toBe(true);
});

test('R314-atlas ②: the built app sends a relevant catalogue instead of all of it', async () => {
  const r = await page.evaluate(() => {
    const C = window.IntMapCapabilities;
    return { all: C.catalogBytes(null), routing: C.catalogBytes(['routing.route', 'routing.isochrone']), sim: C.catalogBytes(['sim.earthquake']) };
  });
  expect(r.all, 'the full catalogue did not survive the build').toBeGreaterThan(50_000);
  expect(r.routing).toBeGreaterThan(1_000);
  expect(r.routing, 'selection is not actually selecting').toBeLessThan(r.all / 2);
  expect(r.sim).toBeGreaterThan(500);
  expect(r.sim).toBeLessThan(r.routing);
});

test('R314-atlas ③: the button and the command leave the same state', async () => {
  const r = await page.evaluate(async () => {
    const base = () => window.IntMapAtlasState.snapshot({ only: ['camera'] }).camera.base;
    const settle = () => new Promise((res) => setTimeout(res, 400));
    document.getElementById('btn-view-sat').click();           /* the UI path, as a reader clicks it */
    await settle();
    const viaUi = base();
    document.getElementById('btn-view-map').click();
    await settle();
    window.IntMapOS.exec('view.base.sat', { source: 'test' }); /* the kernel path, by name */
    await settle();
    const viaKernel = base();
    document.getElementById('btn-view-map').click();
    await settle();
    return { viaUi, viaKernel, restored: base() };
  });
  expect(r.viaUi).toBe('satellite');
  expect(r.viaKernel, 'the button and the command must reach the same engine work').toBe(r.viaUi);
  expect(r.restored).toBe('map');
});

test('R314-atlas ④: Atlas loaded without console errors', async () => {
  const errors = (diag.consoleErrors || []).concat(diag.pageErrors || []);
  expect(errors, 'loading the kernel produced console errors:\n' + errors.join('\n')).toEqual([]);
});
