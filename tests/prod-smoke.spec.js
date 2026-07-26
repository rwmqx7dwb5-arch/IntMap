// Production smoke test — drives the LIVE deployed site.
// Used by (a) the post-deploy check in deploy.yml and (b) the scheduled uptime workflow.
// Distinguishes a real product outage from a transient upstream API failure (§6.3, §8.5):
// it lets real network through and only fails on IntMap's own breakage.
import { test, expect } from '@playwright/test';
import { collectPageDiagnostics } from './helpers/network.js';

const PROD_URL = process.env.PROD_URL || 'https://rwmqx7dwb5-arch.github.io/IntMap/';

const CRITICAL_GLOBALS = ['IntMapOS', 'IntMapLayers', 'IntMapConsole', 'IntMapTime'];

// (#R163) Globals that only exist if their js/ file was really deployed AND its factory ran.
// Since #R162/#R163 the app is index.html + css/ + js/, so "the page booted" no longer implies
// "everything shipped": a js/ file missing from the deployment leaves the page working and one
// feature silently gone — the same failure shape the split has to defend against, one layer up.
// index.html's boot guard records the outcome in window.__imModuleCheck; assert both.
const MODULE_GLOBALS = ['IntMapCompanies', 'IntMapStatsCompare', 'IntMapCompare', 'IntMapRouting',
  'IntMapStreetView', 'IntMapFlightSim', 'IntMapTimeBorders', 'IntMapMonitors',
  'IntMapLayerPreviews', 'IntMapMaddison', 'IntMapHistStates', 'IntMapHistId',
  'IntMapNewsGeo', 'IntMapI18N', 'IntMapGazetteer', 'IntMapRefData',
  // (#R164) the third split: data-layers / workspace / widgets / wb-layers / beta-overlays.
  'IntMapLayerAudit', 'IntMapWorkspace', 'IntMapWidgets2', 'IntMapWB', 'IntMapBeta',
  // (#R166) the fifth split — at least one global per new file, so a missing file is caught even
  // though seven files now carry 41 factories between them.
  'IntMapLayerSidebar',   // js/map-ui.js
  'DrawTool',             // js/map-tools.js
  'Wind',                 // js/weather.js
  'IntMapBeta2',          // js/layer-packs.js
  'IntMapAIResearch',     // js/analysis-panels.js
  'IntMapRadiation',      // js/sims.js
  // (#R167) the sixth split — one global per new file. js/tables.js is data, not factories, so it
  // gets checked the same way: the 27 tables it carries feed the Countries tab and the gazetteer,
  // and a file that failed to deploy would leave both looking merely "empty".
  'IntMapTables',         // js/tables.js
  'RunwaySearch',         // js/map-extras.js
  'IntMapCache',          // js/dash-extended.js
  '_imWelcome',           // js/onboarding.js
  // (#R171) the two files written straight into js/ as new features rather than split out of
  // index.html. Same rule, same reason: without a global named here, a file that failed to deploy
  // leaves the app working and one feature silently missing.
  'IntMapVolume3D',       // js/volume3d.js  (#R170, never listed here)
  'IntMapTilt'];          // js/view-controls.js
// js/playground.js publishes no window.* global of its own — its hub is reached through
// window._openPlayground, which the test below asserts as a function. Neither do js/legal.js,
// js/feedback.js, js/mobile-ui.js or js/news-timeline.js: they mount DOM instead, so the test
// below asserts their nodes. All four are also named in index.html's boot guard, which this file
// asserts is clean (`missingFactories` empty) — that is the real backstop for a missing file.

test.describe.configure({ mode: 'serial' });

let page, diag, response;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  response = await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    (globals) => globals.every((g) => typeof window[g] !== 'undefined') && !!document.getElementById('map'),
    CRITICAL_GLOBALS,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test(`prod responds 200 and boots (${PROD_URL})`, async () => {
  expect(response, 'navigation returned a response').toBeTruthy();
  expect(response.status(), `HTTP status ${response.status()}`).toBeLessThan(400);
});

test('prod has no uncaught JavaScript exceptions', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});

test('prod critical modules + map container present', async () => {
  const present = await page.evaluate(
    (globals) => globals.filter((g) => typeof window[g] !== 'undefined'),
    CRITICAL_GLOBALS,
  );
  expect(present).toEqual(CRITICAL_GLOBALS);
  await expect(page.locator('#map')).toBeVisible();
});

test('(#R163) prod deployed every js/ module file — no factory silently missing', async () => {
  const got = await page.evaluate((globals) => ({
    present: globals.filter((g) => typeof window[g] !== 'undefined'),
    check: window.__imModuleCheck || null,
  }), MODULE_GLOBALS);
  const missing = MODULE_GLOBALS.filter((g) => !got.present.includes(g));
  expect(missing, `module global(s) absent in production — the js/ file did not deploy: ${missing.join(', ')}`).toEqual([]);
  expect(got.check, 'index.html ran its boot-time module check').toBeTruthy();
  expect(got.check.missing, 'no required module global missing').toEqual([]);
  expect(got.check.missingFactories, 'no module factory missing').toEqual([]);
});

test('(#R164) prod cameras module built its layer row (it publishes no global)', async () => {
  // js/cameras.js is the one #R164 module with no window.* surface: it wires itself into the layer
  // panel as the #dl-webcams row (~900 ms after boot; beforeAll already waited past that).
  await expect(page.locator('#dl-webcams')).toBeAttached();
});

test('(#R166) prod playground module loaded (it publishes no window global either)', async () => {
  // js/playground.js only installs window._openPlayground / _pgWorldExplorer from inside its
  // factory, so a global-name check cannot see it. Assert the entry point is a real function.
  const ok = await page.evaluate(() => typeof window._openPlayground === 'function' && typeof window._pgWorldExplorer === 'function');
  expect(ok, 'js/playground.js deployed and its factory ran').toBe(true);
});

test('(#R167) prod deployed the DOM-only modules (legal / news timeline) and the tables', async () => {
  // These four files publish no window.* surface — they mount nodes. Ids read out of the module
  // sources, not guessed. The tables get a VALUE check: an empty object would satisfy a name check
  // while leaving every country card blank.
  await expect(page.locator('#legal-tab-privacy')).toBeAttached();   // js/legal.js
  await expect(page.locator('#ntl-toggle')).toBeAttached();          // js/news-timeline.js
  const tables = await page.evaluate(() => {
    const T = window.IntMapTables || {};
    return { n: Object.keys(T).length, gdp: T.GDP && T.GDP.USA, cap: T.CAPITAL && T.CAPITAL.JPN };
  });
  expect(tables.n, 'js/tables.js deployed with all 27 tables').toBe(27);
  expect(tables, 'the tables carry real values').toMatchObject({ gdp: 27361, cap: 'Tokyo' });
});

test('prod layer UI initialised and screen not blank', async () => {
  const rows = await page.locator('.lyr-row').count();
  expect(rows, `only ${rows} layer rows`).toBeGreaterThanOrEqual(100);
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length).toBeGreaterThan(20);
});

test('prod exposes a build identifier', async () => {
  // Version identification (§7.3): the live page must report which build is serving.
  const build = await page.evaluate(() => window.INTMAP_BUILD || null);
  expect(build, 'window.INTMAP_BUILD is set').toBeTruthy();
  console.log(`[prod-smoke] live build = ${build}`);
});
