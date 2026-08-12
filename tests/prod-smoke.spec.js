// Production smoke test — drives the LIVE deployed site.
// Used by (a) the post-deploy check in deploy.yml and (b) the scheduled uptime workflow.
// Distinguishes a real product outage from a transient upstream API failure (§6.3, §8.5):
// it lets real network through and only fails on IntMap's own breakage.
import { test, expect } from '@playwright/test';
import { collectPageDiagnostics, ensureAtlasOnDemand } from './helpers/network.js';
import { loadLazyModules } from './helpers/app.js';

const PROD_URL = process.env.PROD_URL || 'https://rwmqx7dwb5-arch.github.io/IntMap/';

/* The boot signal. ⚠ (#R209) EVERY NAME HERE HAS TO BE IN THE BOOT BUNDLE. Eight feature globals are
   now fetched on demand (js/lazy-modules.js), and one of those in this list would silently redefine
   "the app has booted" as "the app has booted AND somebody clicked the right thing" — i.e. a wait
   that never ends on a perfectly healthy deployment. All four below are eager and stay eager. */
const CRITICAL_GLOBALS = ['IntMapOS', 'IntMapLayers', 'IntMapConsole', 'IntMapTime'];

// (#R163) Globals that only exist if their js/ file was really deployed AND its factory ran.
// Since #R162/#R163 the app is index.html + css/ + js/, so "the page booted" no longer implies
// "everything shipped": a js/ file missing from the deployment leaves the page working and one
// feature silently gone — the same failure shape the split has to defend against, one layer up.
// index.html's boot guard records the outcome in window.__imModuleCheck; assert both.
const MODULE_GLOBALS = ['IntMapCompanies', 'IntMapStatsCompare', 'IntMapCompare', 'IntMapRouting',
  /* ⚠ (#R209) 'IntMapStreetView' AND 'IntMapFlightSim' USED TO BE THE NEXT TWO NAMES ON THIS LINE.
     js/street-view.js and js/flight-sim.js left the boot bundle this round — js/lazy-modules.js
     fetches them the first time the user reaches for the feature — so at boot neither global exists
     and keeping them here would report a perfectly healthy deployment as broken.
     THE CHECK IS NOT DROPPED, IT MOVED: the (#R209) test below asks the loader for every on-demand
     module and then requires each one to have arrived, which covers all EIGHT split files rather
     than the two this list happened to name. */
  'IntMapTimeBorders', 'IntMapMonitors',
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
  'IntMapAircraftPanel',  // js/aircraft-detail.js (#R175) — the live-aircraft detail card
  // (#R198) js/label-scale.js — if this file fails to deploy, every symbol layer that asks it for a
  // size throws inside its own try and the map comes up with NO LABELS AT ALL. Exactly the failure
  // shape this list exists for.
  'IntMapLabelScale',
  // (#R217) js/river-course.js — EAGER, so a boot-time presence check is the right shape for it:
  // src/main.js imports it directly rather than through js/lazy-modules.js, and it publishes its
  // global at import without fetching anything. If the file failed to deploy, the map still boots,
  // the river labels still draw, and a click on one just lights up nothing — a feature silently
  // gone with every assertion above green, which is the exact failure this list exists to catch.
  'IntMapRiverCourse',
  /* (#R227) the scattering model, published by js/theme-sky.js so the MapLibre adapter can hand it
     to the limb layer (js/limb-layer.js). It is eager — assigned when that module is evaluated — so
     its absence in production means the sky files did not deploy, and the Earth's edge would fall
     back to the renderer's own five-step atmosphere without anything else looking wrong. */
  'IntMapSkyModel',
  /* (#R219) the cosmic distance ladder — eager, so its absence means js/space-cosmos.js is missing
     from the deploy rather than merely unasked-for */
  'IntMapCosmos',
  /* (#R222) the ocean-current field decoder — eager, and the failure it guards against is silent in
     the worst way: BOTH ocean-current layers still draw their named lines from the JSON, so the map
     looks right and the entire measured flow field is simply absent. */
  'IntMapCurrentField',
  /* (#R224) the fault-plane solver — eager, and its absence is silent in the same way: the seismic
     panel still takes a drawn rupture, still paints a field and still prints an Mw. It just prints
     the one computed from the outline's SHADOW with no dip, no width and no depth, which is the
     defect this round removed. */
  'IntMapFaultGeom'];
// js/playground.js publishes no window.* global of its own — its hub is reached through
// window._openPlayground, which the test below asserts as a function. Neither do js/legal.js,
// js/feedback.js, js/mobile-ui.js or js/news-timeline.js: they mount DOM instead, so the test
// below asserts their nodes. Those four are also named in the boot guard, which this file asserts
// is clean (`missingFactories` empty) — that is the real backstop for a missing file.
// ⚠ (#R209) js/playground.js IS NO LONGER ONE OF THEM. It is fetched on demand, so src/main.js
// moved it out of MODULE_FACTORIES into LAZY_FACTORIES and the boot guard cannot see it at all —
// `missingFactories` is silent about it by design. Its backstop is now the loader's own record,
// window.__imLazyCheck.failed, asserted in the (#R209) test below.

test.describe.configure({ mode: 'serial' });

let page, diag, response, lazyError;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  /* (#R224) the Atlas kernel is fetched on demand now — reach for it the way a reader's first click
     does, or `IntMapConsole` is legitimately absent and this reports a healthy deploy as broken. */
  await ensureAtlasOnDemand(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  response = await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    (globals) => globals.every((g) => typeof window[g] !== 'undefined') && !!document.getElementById('map'),
    CRITICAL_GLOBALS,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2000);
  /* (#R209) …AND THEN ASK FOR THE ON-DEMAND MODULES, THE WAY THE APP ITSELF ASKS. The eight split
     files are downloaded by js/lazy-modules.js when a menu item is clicked, so nothing at boot
     touches them and nothing above could notice a chunk that never reached the CDN. Asking here
     also puts the page back in the state the rest of this file was written against, when all eight
     were mounted at boot.
     ⚠ CAPTURED, NOT THROWN. A throw in beforeAll fails every test in the file, including the two
     the uptime workflow reads first ("responds 200", "no uncaught exceptions") — so a single
     missing chunk would blank out the diagnosis instead of naming it. Same shape as `response`
     above: gathered here, asserted in the one test that is about it. */
  lazyError = await loadLazyModules(page).then(() => null, (e) => e);
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

/* ══ (#R209) THE CHUNKS NOBODY DOWNLOADS AT BOOT ═══════════════════════════════════════════════
   Eight feature modules left the boot bundle this round. That reproduces the exact failure this
   file exists to catch, one layer deeper: a chunk missing from the CDN leaves the page booting,
   every assertion above green, and the feature gone until somebody clicks it — and because nothing
   at boot touches those files, nothing at boot can notice. The old MODULE_GLOBALS entries could not
   have caught it either; they were boot-time presence checks.
   So beforeAll asks the loader for all of them (what a click does) and this is where the answer is
   read. Three readings, because the failures they catch are different:
     · the loader's OWN record — written by the load path, not by this test: it checks that the
       factory registered AND that the global the module owns actually appeared;
     · those globals, read from outside the loader, so a loader that lies is not self-certifying;
     · the deployed entry's LAZY_FACTORIES against the deployed loader's list, so a half-propagated
       deployment (new src/main.js with an old js/lazy-modules.js, or the reverse) is not silently
       fine — GitHub Pages serving a mixed build is exactly the shape of outage this file is for. */
test('(#R209) prod serves every on-demand chunk — the deferred modules arrive when asked', async () => {
  expect(lazyError, `on-demand module(s) did not arrive on the live site: ${lazyError && lazyError.message}`).toBeNull();
  const s = await page.evaluate(() => {
    const L = window.IntMapLazy;
    return {
      names: L ? L.names() : null,
      /* the loader's own "is it here": the module was asked for AND its global is on window */
      notReady: L ? L.names().filter((n) => !L.ready(n)) : null,
      rec: window.__imLazyCheck || null,
      lazyFactories: (window.__imModuleCheck || {}).lazy || null,
      /* read straight off window — including the two names MODULE_GLOBALS used to carry, and the
         pair of bare functions js/playground.js installs instead of a namespace */
      globals: {
        IntMapFlightSim: typeof window.IntMapFlightSim, IntMapStreetView: typeof window.IntMapStreetView,
        IntMapSeismic: typeof window.IntMapSeismic, IntMapTsunami: typeof window.IntMapTsunami,
        IntMapTerrainWater: typeof window.IntMapTerrainWater, IntMapLOS: typeof window.IntMapLOS,
        IntMapNightSky: typeof window.IntMapNightSky,
        _openPlayground: typeof window._openPlayground, _pgWorldExplorer: typeof window._pgWorldExplorer,
      },
    };
  });
  expect(s.names, 'js/lazy-modules.js deployed and published the loader').toBeTruthy();
  expect(s.names.length, 'and it still knows every deferred module').toBeGreaterThanOrEqual(8);
  expect(s.rec, 'the loader keeps the record its failures go into').toBeTruthy();
  expect(s.rec.failed, 'no chunk failed to download, register a factory or publish its global').toEqual([]);
  expect(s.rec.loaded.slice().sort(), 'and every one of them is recorded as arrived').toEqual(s.names.slice().sort());
  expect(s.notReady, `deferred module(s) asked for but not present: ${(s.notReady || []).join(', ')}`).toEqual([]);
  for (const [k, t] of Object.entries(s.globals)) {
    expect(t, `window.${k} arrived with its chunk — the js/ file it lives in deployed`).not.toBe('undefined');
  }
  /* one list still knows every factory the program has (src/main.js §LAZY_FACTORIES) */
  expect(Array.isArray(s.lazyFactories) && s.lazyFactories.length > 0, 'the deployed entry names its deferred factories').toBe(true);
  const drift = s.lazyFactories.filter((k) => !s.names.includes(k));
  expect(drift, `the deployed entry names deferred factories the deployed loader cannot fetch: ${drift.join(', ')}`).toEqual([]);
  console.log(`[prod-smoke] on-demand chunks ${s.rec.loaded.length}/${s.names.length} · ${s.names.join(' ')}`);
});

test('(#R164) prod cameras module built its layer row (it publishes no global)', async () => {
  // js/cameras.js is the one #R164 module with no window.* surface: it wires itself into the layer
  // panel as the #dl-webcams row (~900 ms after boot; beforeAll already waited past that).
  await expect(page.locator('#dl-webcams')).toBeAttached();
});

test('(#R166) prod playground module loaded (it publishes no window global either)', async () => {
  // js/playground.js only installs window._openPlayground / _pgWorldExplorer from inside its
  // factory, so a global-name check cannot see it. Assert the entry point is a real function.
  // ⚠ (#R209) …and that factory now runs only when the module is ASKED FOR — beforeAll asks, which
  // is the same call `#btn-playground` makes. So this still measures "the file deployed and its
  // factory ran"; what it no longer measures is "it was in the boot bundle", which this round made
  // deliberately false. Kept rather than folded into the (#R209) test because `_pgWorldExplorer` is
  // a SECOND entry point (js/atlas-console.js reaches for it by name) that the loader's own
  // published-global check does not know about.
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
  /* (#R225) 27 → 25: `geoLayersDB` and `GEO_LABEL_JP` left with the nine geopolitics layers they
     described (「レイヤー自体を削除してほしい」). The count is hard-coded ON PURPOSE — what it catches is a
     PARTIAL deploy, which a «more than zero» test would not. ⚠ It is only run post-deploy (NEVER tier),
     so nothing before the deploy can catch it drifting; move it in the same commit as the table. */
  expect(tables.n, 'js/tables.js deployed with all 25 tables').toBe(25);
  expect(tables, 'the tables carry real values').toMatchObject({ gdp: 27361, cap: 'Tokyo' });
});

test('prod layer UI initialised and screen not blank', async () => {
  const rows = await page.locator('.lyr-row').count();
  expect(rows, `only ${rows} layer rows`).toBeGreaterThanOrEqual(100);
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length).toBeGreaterThan(20);
});

/* (#R207) 「初回時にはmapではなくsatelliteに。3Dはオフ。」 — asserted against the DEPLOYED site, because
   this is a default and a default is exactly the kind of thing that survives a local test and gets
   lost in a build. Asked of the renderer (which layer is painting) and of the control, not of a
   module-private variable. */
test('(#R207) prod opens on the satellite basemap, with 3-D off', async () => {
  await page.waitForFunction(() => {
    try { return window.__imap.getLayoutProperty('layer-sat', 'visibility') === 'visible'; } catch { return false; }
  }, null, { timeout: 30_000 });
  const seen = await page.evaluate(() => ({
    satVisible: window.__imap.getLayoutProperty('layer-sat', 'visibility'),
    satActive: !!document.getElementById('btn-view-sat')?.classList.contains('active'),
    terrain: !!window.__imap.getTerrain(),
    capFirst: (window.__imap.getStyle().layers[0] || {}).id,
  }));
  expect(seen.satVisible, 'the satellite layer is the one painting').toBe('visible');
  expect(seen.satActive, 'and the Satellite segment is lit').toBe(true);
  expect(seen.terrain, '3-D terrain is not attached').toBe(false);
  /* and the polar-cap floor shipped with it — 「南極付近が衛星画像零の暗黒領域」 */
  expect(seen.capFirst, 'the polar-cap background is beneath everything').toBe('layer-polar-cap');
  console.log(`[prod-smoke] basemap=satellite · terrain=off · bottom layer=${seen.capFirst}`);
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

/* ══ (#R179) THE ROUND'S OWN WORK, AGAINST THE LIVE SITE ══════════════════════════════════════
   #R178's follow-up recorded that 「CI が緑」 and 「ライブで効いている」 are different claims. These
   three are the #R179 versions of that: the reported gesture performed on production, the
   second-view seam plus the declaration record the two side-effect fixes rest on, and the base
   map's tile density. */

test('(#R179) prod holds the viewpoint while LOOKING UP — the reported gesture', async () => {
  /* The #R178 test above drags at the band the app boots into, where the tilt saturates at 76.7°
     and so never reaches 90° — which is exactly why the report came back a seventh time. This one
     zooms in first, so the drag really crosses the horizon. */
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    if (!window.__imap || !window.IntMapTilt || !window.IntMapGeoEngine) return { err: 'no engine' };
    const m = window.__imap, C = window.IntMapGeoEngine.camera;
    window.IntMapTilt.set(false); await wait(300);
    m.jumpTo({ center: [139.767, 35.681], zoom: 14, pitch: 0, bearing: 0, elevation: 0 });
    await wait(1200);
    window.IntMapTilt.set(true); await wait(400);
    const el = m.getCanvasContainer(), b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height * 0.8);
    const fire = (t, type, x, y, bts) => t.dispatchEvent(new MouseEvent(type,
      { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: bts, ctrlKey: true, view: window }));
    const eye = () => C.eye();
    const gap = (a, z) => { const D = Math.PI / 180, R = 6371008.8;
      const h = Math.sin((z.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(z.lat * D) * Math.sin((z.lng - a.lng) * D / 2) ** 2;
      return Math.hypot(2 * R * Math.asin(Math.min(1, Math.sqrt(h))), z.alt - a.alt); };
    const first = eye(); if (!first) return { err: 'no eye' };
    fire(el, 'mousedown', cx, cy, 1); await wait(40);
    let y = cy, drift = 0, step = 0, prev = first, maxPitchStep = 0, prevP = m.getPitch();
    for (let i = 0; i < 45; i++) {
      y -= 6; fire(document, 'mousemove', cx, y, 1); await wait(40);
      const e = eye(); if (!e) break;
      drift = Math.max(drift, gap(first, e)); step = Math.max(step, gap(prev, e)); prev = e;
      maxPitchStep = Math.max(maxPitchStep, Math.abs(m.getPitch() - prevP)); prevP = m.getPitch();
    }
    fire(document, 'mouseup', cx, y, 0); await wait(800);
    const end = eye();
    const out = { drift, step, rest: gap(first, end), pitch: m.getPitch(), maxPitchStep,
                  alt0: first.alt, altEnd: end.alt, diag: C.eyePivotDiag() };
    window.IntMapTilt.set(false);
    return out;
  });
  expect(r.err, `engine unavailable: ${r.err}`).toBeUndefined();
  /* the whole point of this test: the live drag must get PAST the horizon */
  expect(r.pitch, 'the live drag really looked up past 90 degrees').toBeGreaterThan(120);
  expect(r.diag.underGuard, 'the repair to the renderer own underground correction is live').toBe('active');
  expect(r.drift, `the viewpoint must not move (${Math.round(r.drift)} m; was 5,610 m at this zoom)`).toBeLessThan(50);
  expect(r.step, `and must not jump between frames (${Math.round(r.step)} m)`).toBeLessThan(50);
  expect(r.rest, 'drag inertia must not move it either').toBeLessThan(50);
  expect(Math.abs(r.altEnd - r.alt0), 'the eye altitude must not change').toBeLessThan(50);
  expect(r.maxPitchStep, 'and the tilt must not leap').toBeLessThan(12);
  console.log(`[prod-smoke] looked up to ${r.pitch.toFixed(1)} deg · drift ${Math.round(r.drift)} m · eye ${Math.round(r.alt0)} m`);
});

test('(#R179) prod deployed the per-view seam and the declaration record', async () => {
  const r = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    if (!E) return { err: 'no engine' };
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = { hasSubView: typeof E.ui.createSubView === 'function',
                  hasAddMarker: typeof E.ui.addMarker === 'function',
                  hasContours: typeof E.scene.demContourSource === 'function',
                  hasDiag: typeof E.camera.eyePivotDiag === 'function' };
    /* a real second view, built and torn down on the live site */
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:160px;height:160px;';
    document.body.appendChild(host);
    const v = out.hasSubView ? E.ui.createSubView({ container: host, attributionControl: false, interactive: false,
      center: [0, 0], zoom: 2, style: { version: 8, sources: {}, layers: [] } }) : null;
    if (v) { await wait(1500);
      out.subSections = ['camera', 'layers', 'scene', 'coords', 'render', 'input', 'events', 'ui'].filter((k) => !!v[k]);
      out.subAnswersForItself = Math.abs(v.camera.getZoom() - 2) < 0.01;
      out.subIsContract = typeof v.addLayer !== 'function';
      try { v.destroy(); } catch (_) {} }
    host.remove();
    /* …and the declaration the two side-effect fixes read */
    E.camera.flyTo({ center: [2.35, 48.86], zoom: 6, duration: 900 });
    await wait(250);
    out.decl = E.camera.eyePivotDiag().decl;
    await wait(1500);
    out.declCleared = E.camera.eyePivotDiag().decl;
    return out;
  });
  expect(r.err).toBeUndefined();
  expect(r.hasSubView, 'ui.createSubView deployed — an additional view can be a scoped engine').toBe(true);
  expect(r.hasAddMarker, 'renderer UI attaches to a view').toBe(true);
  expect(r.hasContours, 'contour tiles come from the engine').toBe(true);
  expect(r.hasDiag, 'and the pivot reports both its halves').toBe(true);
  expect(r.subSections, 'a live sub-view carries every contract section')
    .toEqual(['camera', 'layers', 'scene', 'coords', 'render', 'input', 'events', 'ui']);
  expect(r.subIsContract, 'and it is the contract, not a renderer handle').toBe(true);
  expect(r.subAnswersForItself, 'answering about its own camera').toBe(true);
  expect(r.decl, 'a journey names a centre and a zoom').toMatchObject({ center: true, zoom: true });
  expect(r.declCleared, 'and the record is dropped when the movement ends').toBe(null);
});

test('(#R179) prod base map serves the pixels the display asks for', async ({ browser }) => {
  /* The shared page above is a 1× context, and #R178's satellite test asserts the DECISION rather
     than the outcome for exactly that reason. The base map's density can be checked properly, so
     it is: a fresh context at each ratio, watching what the live site actually requests. */
  for (const dsf of [1, 2]) {
    const ctx = await browser.newContext({ deviceScaleFactor: dsf });
    const p2 = await ctx.newPage();
    const carto = [];
    p2.on('request', (rq) => { const u = rq.url(); if (/basemaps\.cartocdn\.com\//.test(u)) carto.push(u); });
    try {
      await p2.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await p2.waitForFunction(() => !!window.__imap, null, { timeout: 60_000 });
      await p2.waitForTimeout(4000);
      /* ⚠ (#R207) ASK FOR THE BASE MAP — 「初回時にはmapではなくsatelliteに」 means it is no longer
         what a fresh session opens on, and everything below reads the VISIBLE Carto layer. This test
         is about the base map's tile density, not about which basemap production defaults to (that is
         asserted separately), so it selects it rather than inheriting it. Caught by running this file
         against LIVE production BEFORE merging the change: 16/16 green, and this is the one that
         would have gone red fifteen minutes after the deploy. */
      /* ⚠ WAIT FOR THE CONDITION, NOT FOR A DURATION. The first version of this slept 3.5 s after the
         click and went red on the post-deploy run while passing everywhere else: `applyTheme()` only
         switches the basemap once the style is ready, and on a loaded runner against a cold CDN that
         had not happened yet. What the assertions below need is a VISIBLE Carto layer, so that is
         what is waited for — which is also faster on a warm run than any sleep long enough to be safe
         on a cold one. */
      await p2.evaluate(() => document.getElementById('btn-view-map')?.click());
      await p2.waitForFunction(() => {
        try {
          const m = window.__imap, st = m.getStyle();
          return ['layer-light-nl', 'layer-dark-nl', 'layer-light', 'layer-dark'].some((id) => {
            const lyr = (st.layers || []).find((l) => l.id === id);
            if (!lyr) return false;
            if ((m.getLayoutProperty(id, 'visibility') || 'visible') === 'none') return false;
            return /cartocdn\.com/.test((((st.sources[lyr.source] || {}).tiles || [])[0]) || '');
          });
        } catch (_) { return false; }
      }, null, { timeout: 45_000 }).catch(() => {});
      await p2.waitForTimeout(2500);   /* let the visible layer actually request its tiles */
      const decision = await p2.evaluate(() => window.__imHiDPITiles);
      expect(decision, `the one HiDPI decision at dpr ${dsf}`).toBe(dsf >= 1.5);
      /* WHICH Carto requests are the map's is asked of the live style. The layer panel's preview
         thumbnails (js/layer-previews.js) fetch `light_all@2x` / `dark_all@2x` of their own accord at
         any density, so a URL-shaped guess reports @2x traffic on a 1× screen that the map never
         asked for — measured as a CI failure before this was derived instead of assumed. */
      const seg = await p2.evaluate(() => {
        try {
          const m = window.__imap, st = m.getStyle();
          for (const id of ['layer-light-nl', 'layer-dark-nl', 'layer-light', 'layer-dark']) {
            const lyr = (st.layers || []).find((l) => l.id === id);
            if (!lyr) continue;
            if (((m.getLayoutProperty(id, 'visibility') || 'visible')) === 'none') continue;
            const t = ((st.sources[lyr.source] || {}).tiles || [])[0] || '';
            const mm = /cartocdn\.com\/([^/]+)\//.exec(t);
            if (mm) return mm[1];
          }
          return null;
        } catch (_) { return null; }
      });
      expect(seg, 'the live base map names its style').toBeTruthy();
      const mine = carto.filter((u) => u.includes('/' + seg + '/'));
      expect(mine.length, `the live base map loaded tiles at dpr ${dsf}`).toBeGreaterThan(3);
      const at2x = mine.filter((u) => /@2x\.png/.test(u)).length;
      if (dsf >= 1.5) expect(at2x, 'every base-map tile is double-density on a 2x display').toBe(mine.length);
      else expect(at2x, 'and a 1x display pays for none of it').toBe(0);
      console.log(`[prod-smoke] dpr ${dsf} · style ${seg} · base-map tiles ${mine.length} · @2x ${at2x}`);
    } finally { await ctx.close(); }
  }
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
