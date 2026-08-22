// R164 behavioural checks in a real browser — the six blocks moved out of index.html.
//
// WHY: static checks cannot see the #R162 failure shape (a binding vanishes, `typeof` guards turn
// false, a feature dies with zero errors). Every #R164 module is exercised here for real, and the
// LIVE-getter contract is proved by switching the UI language at runtime and watching modules that
// were constructed in English follow it.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 45_000 });
  await page.waitForTimeout(2500);   // also lets cameras' buildUI (+900 ms) run
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R164 #1 every module file loaded and every factory was instantiated', async () => {
  const check = await page.evaluate(() => window.__imModuleCheck);
  expect(check, 'the boot-time module check ran').toBeTruthy();
  expect(check.missing, 'no required module global is missing').toEqual([]);
  expect(check.missingFactories, 'no module factory is missing').toEqual([]);
});

test('R164 #2 each extracted surface exists with its real API (not an empty stub)', async () => {
  const api = await page.evaluate(() => {
    const shape = (o) => (o && typeof o === 'object' ? Object.keys(o).sort() : null);
    return {
      workspace: shape(window.IntMapWorkspace),
      widgets: shape(window.IntMapWidgets2),
      wb: shape(window.IntMapWB),
      beta: shape(window.IntMapBeta),
      audit: shape(window.IntMapLayerAudit),
    };
  });
  expect(api.workspace).toEqual(expect.arrayContaining(['open', 'close', 'toggle', 'active', 'tickerReflow']));
  expect(api.widgets).toEqual(expect.arrayContaining(['sync', 'render', '_active', '_setActive']));
  expect(api.wb).toEqual(expect.arrayContaining(['fetch', 'get']));
  expect(api.beta).toEqual(expect.arrayContaining(['ukrToggle', 'bldgToggle', 'hbToggle', 'volcToggle', 'hbCurrent']));
  expect(api.audit).toEqual(expect.arrayContaining(['run', 'check', 'log']));
});

test('R164 #3 the data-layer engine really built the panel and its window surface', async () => {
  // js/data-layers.js is the single biggest thing that moved (298 KB). It builds most of the
  // ~130 layer rows and publishes the layer helpers the rest of the app calls.
  const rows = await page.locator('.lyr-row').count();
  expect(rows, `only ${rows} layer rows built`).toBeGreaterThanOrEqual(100);
  const surface = await page.evaluate(() => ({
    sample: typeof window.sampleKoppenAt, choro: typeof window.choroValueAt,
    own: typeof window._imLayerOwn, dated: typeof window.refreshDatedLayer,
    reorg: typeof window.reorganizeLayerPanel, kname: window.kName && window.kName('Af'),
  }));
  expect(surface.sample).toBe('function');
  expect(surface.choro).toBe('function');
  expect(surface.own).toBe('object');
  expect(surface.dated).toBe('function');
  expect(surface.reorg).toBe('function');
  expect(surface.kname, 'Köppen names resolve through the host language').toBe('Tropical rainforest');
});

test('R164 #4 cameras + beta overlays wired their own layer rows; widgets seeded its board', async () => {
  // cameras publishes NO global — its only observable surface is the #dl-webcams row it builds.
  await expect(page.locator('#dl-webcams')).toBeAttached();
  // 'histb' has no row since #R122; the three remaining beta rows are built by buildUI at +0 ms.
  for (const k of ['ukrfront', 'bldg3d', 'volc2']) {
    await expect(page.locator(`#beta-dl-${k}`)).toBeAttached();
  }
  const widgets = await page.evaluate(() => window.IntMapWidgets2._active());
  expect(Array.isArray(widgets), '_active() returns the live widget list').toBe(true);
  expect(widgets.length, 'the default board was seeded (Clock/FX/Featured/Random/On-this-day)').toBeGreaterThan(0);
});

test('R164 #5 LIVE getters: modules built in English follow a runtime language switch', async () => {
  // THE load-bearing assertion (#R162's silent failure mode). All three probes below are surfaces
  // of already-constructed modules that read HOST.lang on every call/render:
  //  · js/data-layers.js — window.kName() picks the language column per call
  //  · js/cameras.js     — the #dl-webcams-lbl text is re-baked by its intmap-lang listener
  //  · js/beta-overlays.js — the #beta-dl-ukr-lbl text likewise
  const probe = () => page.evaluate(() => ({
    koppen: window.kName('Af'),
    cams: (document.getElementById('dl-webcams-lbl') || {}).textContent || '',
    ukr: (document.getElementById('beta-dl-ukrfront-lbl') || {}).textContent || '',
  }));
  /* ⚠ (#R304) WAIT FOR THE EVENT, NOT FOR 700 ms. Every `intmap-lang` listener in this app re-bakes
     its own labels on a short timer of its own (js/beta-overlays.js uses `setTimeout(relabel, 20)`),
     so a fixed sleep is a race against whatever else the machine is doing. MEASURED: at two workers
     this test failed on 「the beta-overlay label follows the switch」 and passed 6/6 run alone — the
     contention flake #R186/#R196 already describe, and one of five in the nightly's 23 failures that
     were not regressions at all. Waiting for the row this test is about to actually change makes it
     deterministic without weakening it: if the relabel never happens the wait times out, which is
     still a failure, and every assertion below still runs on the settled text. */
  const setLang = async (code) => {
    const was = await page.evaluate(() => (document.getElementById('beta-dl-ukrfront-lbl') || {}).textContent || '');
    await page.evaluate((c) => document.getElementById('lang-' + c)?.click(), code);
    await page.waitForFunction((w) => ((document.getElementById('beta-dl-ukrfront-lbl') || {}).textContent || '') !== w,
      was, { timeout: 20_000 });
    await page.waitForTimeout(200);   /* the other listeners fire on the same tick, not later */
  };

  const en = await probe();
  expect(en.koppen).toBe('Tropical rainforest');
  expect(en.cams.length, 'the cameras row label exists').toBeGreaterThan(0);
  expect(en.ukr.length, 'the Ukraine-frontline row label exists').toBeGreaterThan(0);

  await setLang('jp');
  const jp = await probe();
  expect(jp.koppen, 'data-layers built at boot reads the NEW language — HOST.lang is live, not a copy').toBe('熱帯雨林');
  expect(jp.cams, 'the cameras label follows the switch').toContain('ライブカメラ');
  expect(jp.ukr, 'the beta-overlay label follows the switch').not.toBe(en.ukr);

  await setLang('en');
  const back = await probe();
  expect(back.koppen, 'and it follows the language back').toBe('Tropical rainforest');
  expect(back.cams).toBe(en.cams);
  expect(back.ukr).toBe(en.ukr);
});

test('R164 #6 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  expect(diag.pageErrors, 'uncaught exceptions:\n' + diag.pageErrors.join('\n')).toEqual([]);
  expect(diag.consoleErrors, 'app console errors:\n' + diag.consoleErrors.join('\n')).toEqual([]);
});
