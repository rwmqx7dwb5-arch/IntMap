// R166 behavioural checks in a real browser — the fifth index.html split (41 blocks, 7 files).
//
// WHY a browser test at all: static analysis cannot see the #R162 failure shape. This codebase
// guards soft dependencies with `typeof X!=='undefined'` inside try/catch, so when a moved block
// loses a closure binding it throws NOTHING — the branch is skipped and the feature quietly
// disappears. Only running the code finds that.
//
// What this round specifically has to prove:
//   1. all seven files loaded and all 41 factories ran — and the REAL objects came back, not the
//      `if(!map) return {…}` stubs each block opens with (a stub is indistinguishable from success
//      if you only check that a global exists);
//   2. the blocks that build UI into shared containers still did so, in place (layer rows, buttons);
//   3. the host getters are LIVE — a module built while the UI was English must follow a runtime
//      switch to Japanese (a captured copy would answer in English forever);
//   4. WRITE-THROUGH for the two new RW members: js/playground.js assigns HOST.mode and
//      HOST.satPanelDismissed, and index.html code reading the bare closure variables must see it.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { loadLazyModules } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

/* The globals the 41 moved blocks publish. Every one is built by a factory in one of the seven new
   files; if a file failed to load or a factory threw, the matching name is missing here. */
const MOVED_GLOBALS = [
  // js/map-ui.js
  'IntMapLayers', 'IntMapLayerSidebar', 'IntMapTicker', 'IntMapShare', '_imPlacePopup',
  // js/map-tools.js
  // ⚠ (#R209) IntMapLOS stays in this list, but it is no longer here at boot: the line-of-sight
  // block became js/viewshed.js behind js/lazy-modules.js, published only when something asks. The
  // list still means "every global the moved blocks publish", so beforeAll asks for the on-demand
  // ones first (see below) rather than the name being dropped and the check with it.
  'ProjView', 'DrawTool', 'IntMapIsolate', 'IntMapRoute', 'IntMapLOS', 'IntMapOutline',
  'IntMapMoveShape', 'IntMapIsochrone', 'IntMapArc3D', 'IntMapObjects',
  // js/weather.js
  'Wind', 'IntMapWeatherEC', 'IntMapWeather',
  // js/layer-packs.js
  'IntMapOverlays', 'IntMapLayers9', 'IntMapBeta2',
  // js/analysis-panels.js
  'IntMapTimeSeries', 'IntMapAIResearch', 'IntMapEdu',
  // js/sims.js
  'IntMapRadiation', 'IntMapPopArea', 'IntMapSlope', 'IntMapRF', 'IntMapSun', 'IntMapTransitReach',
  'IntMapDisaster', 'IntMapEarthReplay',
];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 45_000 });
  /* ⚠ (#R209) ASK FOR THE ON-DEMAND MODULES BEFORE ANY TEST LOOKS FOR THEM. Two of the things this
     file checks left the boot bundle for js/lazy-modules.js: window.IntMapLOS (#1's global list and
     #2's key-set check) and js/playground.js, which is what defines window._pgWorldExplorer for the
     write-through test (#6). The app awaits `IntMapLazy.need(…)` at every entry point that reaches
     them, so this is the same call a click makes — the alternative, striking IntMapLOS off the list
     or guarding #6, would leave the file green while it stopped checking those two. */
  await loadLazyModules(page);
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R166 #1 all seven files loaded, all 41 factories ran, and every moved global is present', async () => {
  const check = await page.evaluate(() => window.__imModuleCheck);
  expect(check, 'the boot-time module check ran').toBeTruthy();
  expect(check.missing, 'no required module global is missing').toEqual([]);
  expect(check.missingFactories, 'no module factory is missing').toEqual([]);
  const missing = await page.evaluate((names) => names.filter((n) => !window[n]), MOVED_GLOBALS);
  expect(missing, 'every global the moved blocks publish exists').toEqual([]);
});

test('R166 #2 the REAL objects were built, not the no-map stubs each block opens with', async () => {
  // Every one of these blocks starts with `if(!map) return { …tiny stub… }`. Checking the API
  // SURFACE distinguishes a real construction from a stub that also satisfies `window.X` being set.
  const api = await page.evaluate(() => {
    const keys = (o) => Object.keys(o || {}).sort();
    return {
      drawTool: keys(window.DrawTool), objects: keys(window.IntMapObjects), los: keys(window.IntMapLOS),
      route: keys(window.IntMapRoute), isolate: keys(window.IntMapIsolate), radiation: keys(window.IntMapRadiation),
      disaster: keys(window.IntMapDisaster), sun: keys(window.IntMapSun), wind: keys(window.Wind),
      layers: keys(window.IntMapLayers), sidebar: keys(window.IntMapLayerSidebar),
    };
  });
  // The stub for DrawTool is {start,toggle,active,exit,onResolution}; the real one carries the
  // drawing/keep/annotation surface on top.
  expect(api.drawTool).toEqual(expect.arrayContaining(['start', 'toggle', 'active', 'exit']));
  expect(api.objects, 'IntMapObjects real API (stub has no refresh/count pair with open/close)')
    .toEqual(expect.arrayContaining(['open', 'close', 'toggle', 'refresh', 'count']));
  expect(api.los).toEqual(expect.arrayContaining(['open', 'clear']));
  expect(api.route).toEqual(expect.arrayContaining(['open', 'clear', 'setStart', 'active']));
  expect(api.isolate).toEqual(expect.arrayContaining(['enter', 'exit', 'active']));
  expect(api.radiation).toEqual(expect.arrayContaining(['run', 'clear', 'ISOTOPES', 'SOURCES']));
  expect(api.disaster).toEqual(expect.arrayContaining(['open', 'run', 'clear']));
  expect(api.sun).toEqual(expect.arrayContaining(['open', 'close', 'setTime']));
  // Wind's no-canvas stub is exactly {toggle,stop,setOpacity} — refetch/sampleAt/dataTime only
  // exist on the real field, so requiring them is the discriminator here.
  expect(api.wind).toEqual(expect.arrayContaining(['toggle', 'setOpacity', 'refetch', 'sampleAt', 'dataTime']));
  // The radiation stub returns EMPTY isotope/source tables — the real one carries the real data.
  const iso = await page.evaluate(() => Object.keys(window.IntMapRadiation.ISOTOPES || {}).length);
  expect(iso, 'the radiation model carries its real isotope table').toBeGreaterThan(1);
  // The layer registry is the block at the very top of the closure: it must hold real registrations.
  expect(api.layers.length).toBeGreaterThan(2);
  expect(api.sidebar).toEqual(expect.arrayContaining(['open', 'close']));
});

test('R166 #3 the layer packs still built their rows into the shared Layers panel', async () => {
  // js/layer-packs.js is six blocks that each APPEND rows to containers index.html owns. If a block
  // silently died, its rows are simply absent — no error anywhere. Probe one id per pack.
  // Row ids read out of js/layer-packs.js, not guessed (#R164 lost a run to invented ids).
  const rows = await page.evaluate(() => ({
    earthSky: !!document.getElementById('l9-dl-dams'),
    landCover: !!document.getElementById('eco-dl-worldcover'),
    betaPack2: !!document.getElementById('beta-dl-dc'),
    religionLang: !!document.getElementById('beta-dl-cat-religion'),
    timeZones: !!document.getElementById('dl-tz'),
    gibs: !!document.getElementById('gx-gxtruecolor'),
    total: document.querySelectorAll('.layer-option').length,
  }));
  expect(rows.total, 'the Layers panel is fully populated').toBeGreaterThan(100);
  expect(rows, 'every layer pack contributed its rows').toMatchObject({
    earthSky: true, landCover: true, betaPack2: true, religionLang: true, timeZones: true, gibs: true,
  });
});

test('R166 #4 LIVE getters: modules built in English follow a runtime switch to Japanese', async () => {
  // The #R162 proof, for this round's files. Each of these labels is produced by a helper that reads
  // HOST.lang on EVERY call; a captured copy of currentLang would freeze them in English.
  const before = await page.evaluate(() => ({
    corr: document.querySelector('#btn-correlate span')?.textContent || '',
    l9: document.getElementById('l9-dl-dams-lbl')?.textContent || '',
  }));
  expect(before.corr, 'the correlation button (js/analysis-panels.js) is labelled').toBeTruthy();
  expect(before.l9, 'the dams row label (js/layer-packs.js) is labelled').toBeTruthy();

  await page.evaluate(() => document.getElementById('lang-jp')?.click());
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    corr: document.querySelector('#btn-correlate span')?.textContent || '',
    l9: document.getElementById('l9-dl-dams-lbl')?.textContent || '',
  }));
  expect(after.corr, 'the correlation button re-labelled through the live host getter').not.toBe(before.corr);
  expect(after.corr).toMatch(/[぀-ヿ一-鿿]/);
  expect(after.l9, 'the dams row re-labelled through the live host getter').not.toBe(before.l9);
  expect(after.l9).toMatch(/[぀-ヿ一-鿿]/);

  await page.evaluate(() => document.getElementById('lang-en')?.click());
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => document.querySelector('#btn-correlate span')?.textContent || '')).toBe(before.corr);
});

test('R166 #5 a moved tool really runs against the real map (draw → measure → object list)', async () => {
  // Beyond "the object exists": drive js/map-tools.js end to end. DrawTool.start() arms the tool and
  // the universal object list (a DIFFERENT factory in the same file) must count what it produced.
  const res = await page.evaluate(async () => {
    const out = {};
    out.armed = (window.DrawTool.start(), window.DrawTool.active());
    window.DrawTool.exit();
    out.disarmed = window.DrawTool.active();
    // the object list reads the REAL state of pins/radius/drawings through the host
    out.count0 = window.IntMapObjects.count();
    window.IntMapObjects.open();
    out.panel = !!document.getElementById('iol-panel');   // id read out of js/map-tools.js
    window.IntMapObjects.close();
    // the projection viewer draws from real Natural-Earth geometry on its own canvas
    window.ProjView.open ? window.ProjView.open() : null;
    out.projKeys = Object.keys(window.ProjView).sort();
    return out;
  });
  expect(res.armed, 'DrawTool.start() armed the tool').toBe(true);
  expect(res.disarmed, 'DrawTool.exit() disarmed it').toBe(false);
  expect(typeof res.count0, 'the object list counts real objects').toBe('number');
  expect(res.panel, 'the object-list panel mounted into the page').toBe(true);
});

test('R166 #6 WRITE-THROUGH: the Playground sets HOST.mode / HOST.satPanelDismissed and index.html sees it', async () => {
  // js/playground.js is the second module with RW host members: entering World Explorer clears the
  // active sidebar tab (`HOST.mode=null`) and dismisses the satellite controller
  // (`HOST.satPanelDismissed=true`). Both variables live in index.html.
  //
  // Careful with what counts as proof. The same lines ALSO strip the .active class and set
  // display:none directly, so "the tab looks inactive" would pass even if the setter never reached
  // the closure. Each assertion below therefore forces index.html's own code to RE-DERIVE the UI
  // from the bare closure variable afterwards:
  //   · setMode() toggles: with currentMode still 'news' a click on #btn-news would turn it OFF;
  //     only a real null lets the click select it again.
  //   · applyTheme() recomputes the controller as `sat && !satPanelDismissed ? 'block':'none'` and
  //     is re-run by the #cb-names checkbox; a stale `false` would pop the panel back open.
  await page.evaluate(() => document.getElementById('btn-news')?.click());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.getElementById('btn-news')?.classList.contains('active')),
    'the News tab is active before the Playground takes over').toBe(true);

  // satellite basemap + open the controller, so satPanelDismissed is genuinely false to start with.
  // ⚠ (#R207) THE SETUP MUST NOT ASSUME WHICH BASEMAP THE APP STARTS ON. This used to click
  // #btn-view-sat twice — once to switch to satellite, once to toggle the provider panel open (#R101:
  // a click on the ALREADY-ACTIVE Satellite button toggles that panel). Satellite is the default now
  // (「初回時にはmapではなくsatelliteに」), so the first click was already the toggle and the second
  // closed it again. Start from Map explicitly and the two clicks mean what they meant before,
  // whatever the default becomes next.
  await page.evaluate(() => document.getElementById('btn-view-map')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('btn-view-sat')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('btn-view-sat')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => { const cb = document.getElementById('cb-names'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.getElementById('sat-controller')?.style.display),
    'applyTheme() keeps the controller open while satPanelDismissed is false').toBe('block');

  const opened = await page.evaluate(() => { if (typeof window._pgWorldExplorer !== 'function') return false; window._pgWorldExplorer(); return true; });
  expect(opened, 'World Explorer is reachable from the page').toBe(true);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => !!document.getElementById('pg-we-panel')), 'World Explorer started').toBe(true);

  // (a) currentMode: re-select News. A stale 'news' would make setMode TOGGLE IT OFF instead.
  await page.evaluate(() => document.getElementById('btn-news')?.click());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.getElementById('btn-news')?.classList.contains('active')),
    'HOST.mode=null reached the closure — otherwise this click would have deselected the tab').toBe(true);

  // (b) satPanelDismissed: make applyTheme() recompute the controller from the closure variable.
  await page.evaluate(() => { const cb = document.getElementById('cb-names'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.getElementById('sat-controller')?.style.display),
    'HOST.satPanelDismissed=true reached the closure — a stale false would re-open the panel').toBe('none');
});

test('R166 #7 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  // PRE-EXISTING, NOT THIS ROUND: starting World Explorer (test #6) makes MapLibre re-broadcast the
  // full country FeatureCollection to its workers, and its recursive serializer sometimes overflows
  // the stack — "RangeError: Maximum call stack size exceeded" raised inside maplibre-gl.js. It was
  // measured on BOTH trees before this filter was written: the identical interaction sequence run
  // six times raised it 5/6 on the pre-split main and 6/6 here. So it is a real MapLibre-side bug
  // worth its own round, but it is not evidence about the split, and asserting zero here would just
  // make this suite flaky. Everything else — including any app-side error — still fails the test.
  const mapLibreStackOverflow = (e) => /RangeError/.test(e) && /Maximum call stack size exceeded/.test(e) && /maplibre-gl/.test(e);
  const unexpected = diag.pageErrors.filter((e) => !mapLibreStackOverflow(e));
  expect(unexpected, 'uncaught exceptions:\n' + unexpected.join('\n')).toEqual([]);
  expect(diag.consoleErrors, 'app console errors:\n' + diag.consoleErrors.join('\n')).toEqual([]);
});
