// R165 behavioural checks in a real browser — the Atlas kernel moved out of index.html.
//
// WHY: static checks cannot see the #R162 failure shape (a binding vanishes, `typeof` guards turn
// false, a feature dies with zero errors). This round additionally introduces the first READ-WRITE
// host members: the kernel WRITES measurePoints / radiusColor / radiusKm / unitMode / userTheme
// through IM_HOST setters. The load-bearing proof here is END-TO-END WRITE-THROUGH: an Atlas action
// inside js/atlas-console.js assigns HOST.x, and index.html code that reads the bare closure
// variable (applyTheme, updateToolPanel, distHTML) must observe the new value. If the setter did
// not reach the closure variable, every assertion below stays on the old value — silently.
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
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R165 #1 the kernel file loaded, its factory ran, and the REAL console came back (not the no-map stub)', async () => {
  const check = await page.evaluate(() => window.__imModuleCheck);
  expect(check, 'the boot-time module check ran').toBeTruthy();
  expect(check.missing, 'no required module global is missing').toEqual([]);
  expect(check.missingFactories, 'no module factory is missing').toEqual([]);
  // The factory's first line returns a {open,run,toggle} STUB when map is missing — the presence of
  // the full command surface proves the real kernel was constructed.
  const api = await page.evaluate(() => Object.keys(window.IntMapConsole || {}).sort());
  expect(api).toEqual(expect.arrayContaining(['dispatch', 'run', 'runDirect', 'open', 'toggle', 'mountTab', 'brief', 'wctx']));
});

test('R165 #2 WRITE-THROUGH: the theme action sets HOST.userTheme and index.html applyTheme() sees it', async () => {
  // js/atlas-console.js: case 'theme' → HOST.userTheme='dark' + applyTheme(). applyTheme() is
  // index.html code reading the bare closure variable — it stamps <html data-theme>. If the setter
  // write did not reach the closure, data-theme would stay 'light' (colorScheme is light here).
  // NB: dispatch() keys the action on `a.type` (and returns a hollow ok:true for an unknown shape),
  // so every assertion below also checks the reply html — an accidental no-op cannot pass.
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(before).toBe('light');
  const r = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'theme', mode: 'dark' }));
  expect(r && r.ok, 'the theme action reported success').toBe(true);
  expect(r.html).toContain('dark');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  const r2 = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'theme', mode: 'light' }));
  expect(r2 && r2.ok).toBe(true);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
});

test('R165 #3 WRITE-THROUGH: units + measure actions set HOST.unitMode / HOST.measurePoints and the tool panel renders from them', async () => {
  // case 'units' → HOST.unitMode='imperial'; case 'measure' → HOST.measurePoints=[[A],[B]] then
  // refreshTool()+updateToolPanel(). updateToolPanel() and distHTML() are index.html code reading
  // the bare closure variables: the panel showing "2 points" with an imperial distance proves BOTH
  // writes landed in the closure. (Tokyo/Osaka resolve from the built-in gazetteer — Nominatim is
  // blocked by the hermetic policy and geocode() falls back cleanly.)
  const ru = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'units', mode: 'imperial' }));
  expect(ru && ru.ok, 'the units action reported success').toBe(true);
  expect(ru.html).toContain('imperial');
  expect(await page.evaluate(() => document.getElementById('setting-units')?.value)).toBe('imperial');

  const rm = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'measure', from: 'Tokyo', to: 'Osaka' }));
  expect(rm && rm.ok, 'the measure action reported success').toBe(true);
  expect(rm.html, 'the measure reply names both endpoints').toMatch(/Tokyo[\s\S]*Osaka/i);
  const panel = page.locator('#tool-panel');
  await expect(panel).toBeVisible();
  const text = await panel.innerText();
  expect(text, 'the panel shows the two measured points').toMatch(/\b2\b/);
  expect(text, 'the distance renders in IMPERIAL units — HOST.unitMode reached the closure').toMatch(/\bmi\b/);
  expect(text, 'imperial mode shows no metric figure').not.toMatch(/\bkm\b/);

  // restore the default so later suites see the stock state
  const rb = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'units', mode: 'both' }));
  expect(rb && rb.ok).toBe(true);
});

test('R165 #4 LIVE getter: the kernel built in English answers in Japanese after a runtime language switch', async () => {
  // The #R162/#R163 proof, now for the kernel: L(en,jp,…) reads HOST.lang on every call. A captured
  // copy of currentLang would keep answering in English forever.
  await page.evaluate(() => document.getElementById('lang-jp')?.click());
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'theme', mode: 'dark' }));
  expect(r && r.ok).toBe(true);
  expect(r.html, 'the reply is localized through the live HOST.lang').toContain('テーマ');
  await page.evaluate(() => document.getElementById('lang-en')?.click());
  await page.waitForTimeout(700);
  const r2 = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'theme', mode: 'auto' }));
  expect(r2 && r2.ok).toBe(true);
  expect(r2.html).toContain('Theme');
});

test('R165 #5 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  expect(diag.pageErrors, 'uncaught exceptions:\n' + diag.pageErrors.join('\n')).toEqual([]);
  expect(diag.consoleErrors, 'app console errors:\n' + diag.consoleErrors.join('\n')).toEqual([]);
});
