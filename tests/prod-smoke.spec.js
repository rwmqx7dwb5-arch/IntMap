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
  'IntMapTilt',           // js/view-controls.js
  'IntMapDrone',          // js/drone-nav.js (#R174) — a whole feature, invisible if the file is missing
  'IntMapAircraftPanel']; // js/aircraft-detail.js (#R175) — the live-aircraft detail card
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

/* ── (#R178) the three things this round shipped, verified on the LIVE site ─────────────────────
   A deploy that boots is not a deploy that WORKS. The tilt fix is the sixth attempt at one report,
   the decoupling moved 87 KB of code between files, and the imagery change is gated on the client's
   own display — so each is asserted here against production rather than inferred from a green CI. */
test('(#R178) prod holds the viewpoint through a tilt at the zoom it boots into', async () => {
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    if (!window.__imap || !window.IntMapTilt || !window.IntMapGeoEngine) return { err: 'no engine' };
    window.IntMapTilt.set(true);
    await wait(700);
    const el = window.__imap.getCanvasContainer(), b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    const fire = (t, type, x, y, bts) => t.dispatchEvent(new MouseEvent(type,
      { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: bts, ctrlKey: true, view: window }));
    const eye = () => window.IntMapGeoEngine.camera.eye();
    const gap = (a, z) => { const D = Math.PI / 180, R = 6371008.8;
      const h = Math.sin((z.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(z.lat * D) * Math.sin((z.lng - a.lng) * D / 2) ** 2;
      return Math.hypot(2 * R * Math.asin(Math.min(1, Math.sqrt(h))), z.alt - a.alt); };
    const first = eye(); if (!first) return { err: 'no eye' };
    fire(el, 'mousedown', cx, cy, 1); await wait(40);
    let y = cy, drift = 0, prev = first, step = 0;
    for (let i = 0; i < 30; i++) {
      y -= 6; fire(document, 'mousemove', cx, y, 1); await wait(40);
      const e = eye(); if (!e) break;
      drift = Math.max(drift, gap(first, e)); step = Math.max(step, gap(prev, e)); prev = e;
    }
    fire(document, 'mouseup', cx, y, 0); await wait(700);
    const end = eye();
    const out = { drift, step, rest: gap(first, end), pitch: window.__imap.getPitch(),
                  minZoom: window.__imap.getMinZoom(), alt0: first.alt, altEnd: end.alt };
    window.IntMapTilt.set(false);
    return out;
  });
  expect(r.err, `engine unavailable: ${r.err}`).toBeUndefined();
  expect(r.pitch, 'the drag really tilted the live map').toBeGreaterThan(20);
  expect(r.minZoom, 'the tilt setting widened the zoom floor to the renderer\'s own').toBe(-2);
  expect(r.drift, `the viewpoint must not move (${Math.round(r.drift)} m)`).toBeLessThan(50);
  expect(r.step, `and must not jump between frames (${Math.round(r.step)} m)`).toBeLessThan(50);
  expect(r.rest, 'drag inertia must not move it either').toBeLessThan(50);
  expect(Math.abs(r.altEnd - r.alt0), 'the eye altitude must not change').toBeLessThan(50);
  console.log(`[prod-smoke] tilt ${r.pitch.toFixed(1)}° · viewpoint drift ${Math.round(r.drift)} m · eye ${Math.round(r.alt0)} m`);
});

test('(#R178) prod deployed the renderer contract as its own module', async () => {
  const r = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    if (!E) return { err: 'IntMapGeoEngine missing' };
    return { id: E.id(), hasRenderer: E.hasRenderer(),
             /* the sections the decoupling depends on — a partial deploy would show up as a gap here */
             sections: ['camera', 'layers', 'scene', 'coords', 'render', 'input', 'events', 'ui'].filter((k) => !!E[k]),
             newApis: ['sourceData', 'setSourceTiles', 'updateImage', 'getLayout'].filter((k) => typeof E.layers[k] === 'function'),
             cesium: !!(E.contracts() || {}).cesium };
  });
  expect(r.err).toBeUndefined();
  expect(r.id, 'the live adapter is MapLibre').toBe('maplibre');
  expect(r.hasRenderer, 'and it has a live renderer').toBe(true);
  expect(r.sections, 'every contract section deployed').toEqual(['camera', 'layers', 'scene', 'coords', 'render', 'input', 'events', 'ui']);
  expect(r.newApis, 'including the source/layer entries the decoupling needed').toEqual(['sourceData', 'setSourceTiles', 'updateImage', 'getLayout']);
  expect(r.cesium, 'and the Cesium contract is still declared for the next engine').toBe(true);
});

test('(#R178) prod satellite protocol is live, and its HiDPI decision is honest', async () => {
  const r = await page.evaluate(() => {
    const S = window.IntMapSatProto;
    if (!window.__imSatProto || !S) return { err: 'satellite protocol not registered' };
    return { dpr: S.dpr(), hiDPI: S.hiDPI(), placeholderMax: S.placeholderMax,
             can2x: typeof S.tile2x === 'function' };
  });
  expect(r.err).toBeUndefined();
  expect(r.can2x, 'the @2x stitcher deployed').toBe(true);
  expect(r.placeholderMax, 'the grey-placeholder threshold deployed').toBe(3500);
  /* the runner is a 1× display, so the honest answer is "no @2x here" — asserting the DECISION
     rather than the outcome is what makes this meaningful on any machine */
  expect(r.hiDPI, `dpr ${r.dpr} must decide @2x as ${r.dpr >= 1.5}`).toBe(r.dpr >= 1.5);
  console.log(`[prod-smoke] satellite protocol live · dpr ${r.dpr} · @2x ${r.hiDPI}`);
});

test('(#R178) prod service worker caches every terrarium DEM alias', async () => {
  const sw = await (await page.request.get(new URL('sw.js', PROD_URL).href)).text();
  const body = sw.slice(sw.indexOf('const TILE_HOSTS'), sw.indexOf("self.addEventListener('install'"));
  expect(body.length, 'sw.js deployed with its tile tables').toBeGreaterThan(100);
  const isTile = new Function(body + '\nreturn isTileRequest;')();
  const aliases = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium/12/1/1.png',
    'https://s3.dualstack.us-east-1.amazonaws.com/elevation-tiles-prod/terrarium/12/1/1.png',
  ];
  const missed = aliases.filter((u) => !isTile(u));
  expect(missed, `DEM aliases still bypassing the cache: ${missed.join(', ')}`).toEqual([]);
});
