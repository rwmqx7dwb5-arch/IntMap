// Production smoke test — drives the LIVE deployed site.
// Run by the post-deploy check in deploy.yml and by the post-rollback check in rollback.yml.
// ⚠ (#R382) NOT by uptime.yml, which this line used to name: that workflow is a single HTTP probe
// for the app shell and has never invoked playwright. Nothing was lost by the mistake, but it
// made this file look watched every six hours when it is only watched on a deploy.
// Distinguishes a real product outage from a transient upstream API failure (§6.3, §8.5):
// it lets real network through and only fails on IntMap's own breakage.
import { test, expect } from '@playwright/test';
import { collectPageDiagnostics, ensureAtlasOnDemand } from './helpers/network.js';
import { loadLazyModules } from './helpers/app.js';
import { readPixel, explain, colourFor, separablePair } from './helpers/wind-ramp.js';
import { deltaE00, VISIBLE_AT_A_GLANCE } from './helpers/colour-difference.js';
import { findEye, describeEye } from './helpers/cyclone-eye.js';
import { fileURLToPath } from 'node:url';
import { repoCorsContract, parseAllowHeaders } from './helpers/fn-cors.js';

const PROD_URL = process.env.PROD_URL || 'https://rwmqx7dwb5-arch.github.io/IntMap/';

/* (#R333) Where the Edge Functions answer from. The project ref is a public identifier (it is in
   every request the site already makes), so naming it here reveals nothing a visitor cannot see. */
const FN_BASE = process.env.SUPABASE_FN_URL || 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

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
const MODULE_GLOBALS = ['IntMapCompanies', 'IntMapCompare', 'IntMapRouting',
  /* ⚠ (#R311) 'IntMapStatsCompare' USED TO BE THE SECOND NAME ON THIS LINE, and 'IntMapVolume3D' /
     'IntMapAircraftPanel' stood further down. js/stats-compare.js, js/volume3d.js,
     js/aircraft-detail.js, js/satellites-live.js and js/satellite-detail.js left the boot bundle
     this round, for the same reason and with the same replacement as #R209's two: at boot none of
     those globals exists, so a boot-time presence check would report a healthy deployment as
     broken. The (#R209) test below asks the loader for EVERY on-demand module — a list it reads out
     of the deployed loader — so all of them are covered rather than the ones this list named. */
  /* ⚠ (#R209) 'IntMapStreetView' AND 'IntMapFlightSim' USED TO BE THE NEXT TWO NAMES ON THIS LINE.
     js/street-view.js and js/flight-sim.js left the boot bundle this round — js/lazy-modules.js
     fetches them the first time the user reaches for the feature — so at boot neither global exists
     and keeping them here would report a perfectly healthy deployment as broken.
     THE CHECK IS NOT DROPPED, IT MOVED: the (#R209) test below asks the loader for every on-demand
     module and then requires each one to have arrived, which covers all EIGHT split files rather
     than the two this list happened to name. */
  'IntMapTimeBorders', 'IntMapMonitors',
  /* (#R231) js/basemap-switch.js — the phone's base-map square. An EAGER global (the file is an IIFE
     that publishes on import) and NOT an IntMapModules factory, so this list is where a deploy that
     lost the file is caught. */
  'IntMapBasemapSwitch',
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
  'IntMapTilt',           // js/view-controls.js
  'IntMapDrone',          // js/drone-nav.js (#R174) — a whole feature, invisible if the file is missing
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

/* ══ ⚠⚠⚠ (#R458) THIS FILE IS NO LONGER `mode: 'serial'`, AND MEASURING SAID WHY ═══════════════
   Serial mode was here because the tests share one page, built once in `beforeAll`. It does not
   do that job — `beforeAll` does — and what it DID do was throw away the verdicts underneath the
   first red one. MEASURED on the post-deploy smoke of run 32818517323: one assertion failed and
   the four tests after it (the forecast axis, #R398's units, #R398's isobars and #R333's CORS
   contract) reported 「did not run」, so a deploy shipped with four of its checks unasked. This is
   not new — the note in tests/r287-checks.test.mjs ⑧ is about the same cascade hiding a SECOND
   real defect for a whole round.

   ⚠ SERIAL DOES NOT PROTECT AGAINST THE SITE BEING DOWN. That case never reaches a test at all:
   `beforeAll` below does the goto and the boot wait, and if production is not answering it THROWS,
   which fails every test in the file with the real reason regardless of mode. Everything serial
   was still suppressing was therefore an INDEPENDENT verdict about a page that had already booted.

   MEASURED with a four-test probe (one `beforeAll`, test #2 forced to fail, `retries: 3`, this
   config's settings) — the whole reason this is a change and not a preference:
       mode: 'serial'   beforeAll ×4, test #1 re-run on all four attempts, tests #3 and #4 NEVER RUN
       default          beforeAll ×5, only test #2 re-run, tests #3 and #4 RUN and pass
   Default mode is also the cheaper of the two here: the cyclone test is the 16th of 24, so serial
   was re-running fifteen live-network tests on each of its three retries in order to reach it.

   ⚠ Tests within a file still run IN ORDER, IN ONE WORKER. That is Playwright's default for a
   file — `fullyParallel` is not set in playwright.prod.config.js — so the shared `page` and the
   order the tests were written in are exactly as before. On a failure the worker is replaced and
   the remaining tests get a freshly booted page, which is if anything a cleaner state than the one
   they inherited before. */

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
      /* read straight off window — including the names MODULE_GLOBALS used to carry (#R209's two and
         #R311's five), and the pair of bare functions js/playground.js installs instead of a namespace */
      globals: {
        IntMapFlightSim: typeof window.IntMapFlightSim, IntMapStreetView: typeof window.IntMapStreetView,
        IntMapSeismic: typeof window.IntMapSeismic, IntMapTsunami: typeof window.IntMapTsunami,
        IntMapTerrainWater: typeof window.IntMapTerrainWater, IntMapLOS: typeof window.IntMapLOS,
        IntMapNightSky: typeof window.IntMapNightSky,
        IntMapStatsCompare: typeof window.IntMapStatsCompare, IntMapVolume3D: typeof window.IntMapVolume3D,
        IntMapAircraftPanel: typeof window.IntMapAircraftPanel, IntMapSatellites: typeof window.IntMapSatellites,
        IntMapSatPanel: typeof window.IntMapSatPanel, IntMapDataCenters: typeof window.IntMapDataCenters,
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

/* ══ ⚠⚠⚠ (#R514) THE HOST THE FIVE TESTS BELOW DEPEND ON, ASKED FIRST AND BY NAME ═══════════════
   On 2026-09-05 the five ECMWF tests below went red on two deployments in a row, and what they said
   was 「Target page, context or browser has been closed」, 「field did not load」, 「no metadata」,
   「Received 0」 and 「Received ""」 — five descriptions of the same absence, none of them naming it.
   The absence was upstream: Open-Meteo had retired the CDN host the build read from, and its DNS name
   no longer existed. Nothing in the repository had changed since the last green run.
   So this asks the precondition ON ITS OWN, of the host the DEPLOYED build names (read out of the
   page, not spelled here — the spelling lives in js/wx-models.js and nowhere else): does the name
   resolve and answer the model's metadata, does it let THIS origin read it, and does it serve the
   ranged reads the field decoder is made of. Each line fails with the URL and the status in it, so
   the next time the host moves, the first red line says 「host」 rather than 「browser」. */
test('(#R514) the model host the deployed build names answers, and lets this origin read ranges from it', async () => {
  const origin = new URL(PROD_URL).origin;
  const u = await page.evaluate(() => {
    const M = window.IntMapWxModels;
    return M ? { meta: M.metaUrl(M.defaultId()), id: M.defaultId() } : null;
  });
  expect(u, 'the deployed build publishes its model registry').not.toBeNull();
  const r = await page.request.get(u.meta, { headers: { Origin: origin }, timeout: 30_000 });
  expect(r.status(), 'the model host answers its metadata at ' + u.meta).toBe(200);
  expect(r.headers()['access-control-allow-origin'], 'and lets ' + origin + ' read it').toBe('*');
  const j = await r.json();
  expect(Array.isArray(j.valid_times) && j.valid_times.length, 'and the run publishes an axis')
    .toBeGreaterThan(40);
  const f = await page.evaluate(([id, ref, vt]) => window.IntMapWxModels.fileUrl(id, ref, vt),
    [u.id, j.reference_time, j.valid_times[0]]);
  const rr = await page.request.get(f, { headers: { Origin: origin, Range: 'bytes=0-1023' }, timeout: 30_000 });
  expect(rr.status(), 'a ranged read of the first field file is served as a range: ' + f).toBe(206);
  expect(rr.headers()['access-control-allow-origin'], 'across origins').toBe('*');
  console.log('[R514] model host ' + new URL(u.meta).hostname + ' · run ' + j.reference_time
    + ' · ' + j.valid_times.length + ' steps · ' + (j.variables || []).length + ' variables');
});

/* ══ (#R276) THE WEATHER MODEL, AGAINST REAL DATA ════════════════════════════════════════════════
   These three cannot live in tests/smoke.spec.js: that context blocks every host but the two boot
   CDNs, on purpose, and what is being asked here is whether the ECMWF field the live site actually
   downloads produces the right PICTURE and the right NUMBER. This file already drives the deployed
   site with real network and retries, so it is where they belong — and it is also this round's
   production verification (AGENTS.md §5). They reuse the shared page, like every test above, so
   they cost assertions rather than boots.

   ⚠ EACH ONE STATES WHAT IT MEASURED WHEN IT SKIPS. A test that quietly passes because the thing it
   is about was absent is the failure this project has paid for most often. */

test('(#R276) prod draws the wind from the model, and the pixel is the colour the table asks for', async () => {
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.ready(); } catch { return false; } }, null, { timeout: 60_000 });
  const on = await page.evaluate(() => {
    const b = document.getElementById('btn-view-flat'); if (b) b.click();
    window.IntMapGeoEngine.camera.jumpTo({ center: [150, 20], zoom: 3 });
    const cb = document.getElementById('dl-wind');
    if (!cb) return false;
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  });
  test.skip(!on, 'no wind row on the deployed build');
  /* ⚠ (#R276 追記) THE BUDGET IS STATED AND THE ELAPSED TIME IS PRINTED, because 「時間がかかる」 is
     usually 「上限が無い」 and a silent wait tells nobody anything. MEASURED on the development
     machine, cold: the field is decoded in 7.5–9.1 s (410 ranged reads, ~27 MB) and painted within
     the same second. A shared CI runner with no GPU is several times slower, so the ceiling here is
     deliberately loose — it is a tripwire against a hang, not a performance target. */
  const t0 = Date.now();
  await page.waitForFunction(() => { const d = window.Wind && window.Wind._dbg(); return d && d.hasField && d.hasLyr && d.rasterOpacity > 0; }, null, { timeout: 150_000 });
  console.log('[R276] wind field ready in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  await page.waitForTimeout(6000);   /* the raster's own tiles */

  const m = await page.evaluate(() => new Promise((res) => {
    const map = window.IntMapGeoEngine.raw();
    map.once('render', () => {
      const c = map.getCanvas();
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const px = new Uint8Array(4);
      gl.readPixels(Math.round(c.width * 0.5), Math.round(c.height * 0.5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const X = c.clientWidth * 0.5, Y = c.clientHeight * 0.5;
      const ll = window.IntMapGeoEngine.coords.unproject([X, Y]);
      const EC = window.IntMapECMWF;
      const sp = EC.valueNow('wind_u_component_10m', ll.lat, ll.lng);
      const sc = EC.scale('wind_u_component_10m', true);
      /* THE SPEEDS THE MODEL ACTUALLY TAKES UNDER THIS ONE PIXEL — the patch the colour is painted
         from, DERIVED rather than picked. The raster source declares `tileSize: 512` (read off the
         live map), so at an integer zoom one texel is 512/512 = ONE screen pixel; MapLibre's
         `raster-resampling: linear` blends the texels either side, reaching ±1 texel; and the pixel
         has its own half-width. ±1.5 px. MEASURED over 477 live pixels across six views (138 of
         them straddling one of the seventeen anchors): ±1 px 467/477, ±1.5 px 476/477, and ±2, ±3,
         ±4 px no better — the curve is flat past the kernel, which is what says this is the support
         and not a fitted number. */
      const smp = EC.sampler('wind_u_component_10m');
      let lo = Infinity, hi = -Infinity;
      for (let dx = -1.5; dx <= 1.5; dx += 0.5) {
        for (let dy = -1.5; dy <= 1.5; dy += 0.5) {
          const q = window.IntMapGeoEngine.coords.unproject([X + dx, Y + dy]);
          const v = smp ? smp.value(q.lat, q.lng) : NaN;
          if (v === v && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      }
      /* the renderer's OWN table, carried out whole — the verdict is taken in Node so that
         tests/r287-checks.test.mjs can run the same decision over failures this page cannot show */
      const ramp = sc && sc.breakpoints
        ? { breakpoints: sc.breakpoints.slice(), colors: sc.colors.map((q) => [q[0], q[1], q[2]]) }
        : null;
      let want = null;
      try { want = EC.sdk().getColor(sc, sp, true); } catch { /* older SDK */ }
      return res({ px: Array.from(px), sp, want, ramp, lo, hi,
        model: window.Wind.model(), stats: window.Wind._dbg() });
    });
    map.triggerRepaint();
  }));

  expect(m.model.name, 'the field names the model it came from').toBe('ECMWF IFS HRES');
  expect(m.model.resolutionKm).toBe(9);
  expect(m.model.referenceTime, 'and the run it came from').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  expect(m.stats.webgl, 'the particles are drawn with WebGL').toBe(true);
  expect(m.stats.drawn, 'and there really are particles on screen').toBeGreaterThan(200);
  expect(typeof m.sp, 'the field answers for the point under the middle of the map').toBe('number');

  /* ⚠⚠ THE INVARIANT THIS ROUND EXISTS FOR. Before it, the pixel here was 0.36× the colour the
     table asks for, because the day/night shading sat on top of the weather. Exact equality is the
     only version of this worth asserting: anything looser passes while half the planet is grey.

     ⚠⚠⚠ (#R287) …AND WHAT MUST BE EXACT IS THE COLOUR, WHICH IS NOT THE SAME CLAIM AS 「the entry
     for the value at this point」. #R284 resampled the same seventeen anchors onto 0.1 m/s so the
     wind would be a gradient rather than seventeen flat bands, and that quietly removed the
     accident this assertion had been resting on: the pixel is painted from a raster TEXEL through
     `raster-resampling: linear`, so it answers for the patch of atmosphere it covers, while
     `valueNow()` answers for the mathematical point at its centre. Under seventeen bands those two
     readings landed in the same band and produced the same colour; at 0.1 m/s they are one to eight
     visible steps apart. MEASURED against production, 78 of 81 sampled pixels are EXACTLY a table
     entry — but only 20 of those 78 (26 %) are the entry for the point value, so the old form had
     become a coin flip that failed two deployments on a picture that was right.

     The ambiguity is SPATIAL, so it is settled in space and the colour stays byte-exact — the same
     move #R276 追記3 made for the eyewall pair, for the same reason: tightening a number until a
     correct picture passes is how a test stops meaning anything. Two exact claims replace one:
       ① the pixel IS one of the table's colours          → nothing was multiplied over the raster
                                                             (0.36× lands 128 RGB units away)
       ② the speed that entry stands for is a speed the
          field really takes under that pixel             → it is THIS field, here, now.
     Neither carries a colour tolerance. */
  expect(m.ramp, 'the deployed build exposes the colour table its own tiles are rendered from').not.toBeNull();
  /* (#R293) 1,041 entries now — windy.com's own table spans 0–104 m/s (「Windyと完全に同じ風速と色の
     対応に」) rather than the old 0–60, at the same 0.1 m/s step. The claim is 「resampled, not a
     staircase」, which is a floor rather than a count. */
  expect(m.ramp.breakpoints.length, 'and it is the resampled ramp (#R284), not the anchors alone')
    .toBeGreaterThan(600);
  /* the table is read here exactly as the SDK reads it — pinned against the SDK itself, so the
     verdict below cannot drift from the renderer by an off-by-one in the bucket search */
  if (m.want) {
    expect(colourFor(m.ramp, m.sp), 'the bucket rule used here is the SDK\'s own')
      .toEqual(m.want.slice(0, 3).map((v) => Math.round(v)));
  }

  const verdict = readPixel(m.ramp, m.px.slice(0, 3), m.lo, m.hi);
  expect(verdict.inRange, 'the painted pixel is inside the band the table paints for the wind that '
    + 'is really there — nothing is multiplied over the raster: ' + explain(m.px.slice(0, 3), verdict))
    .toBe(true);
  expect(verdict.speedInFootprint, 'and the speed its colour stands for is one the model really has '
    + 'under that pixel — ' + explain(m.px.slice(0, 3), verdict) + ' (point value '
    + m.sp.toFixed(2) + ')').toBe(true);
  expect(m.px[3], 'and it is opaque').toBe(255);
});

test('(#R276) prod shows a real cyclone: a calm eye inside a ring of strong wind', async () => {
  const found = await page.evaluate(async () => {
    const EC = window.IntMapECMWF;
    await EC.meta();
    const f = await EC.load('wind_u_component_10m');
    if (!f) return { err: 'field did not load' };
    const s = EC.sampler('wind_u_component_10m');
    /* Sweep the tropics on a half-degree lattice for the strongest wind. That IS the structure —
       a warm core with a light-wind centre inside its eyewall — and it needs no storm list to find. */
    let peak = { sp: -1 };
    for (let la = -40; la <= 40; la += 0.5) {
      for (let lo = -180; lo < 180; lo += 0.5) {
        const v = s.value(la, lo);
        if (v > peak.sp) peak = { sp: v, la, lo };
      }
    }
    /* ══ ⚠⚠⚠ (#R460) THIS PAGE READS THE BOX; tests/helpers/cyclone-eye.js SAYS WHICH POINT ══════
       What stood here walked the ±1.5° box from its south-west corner and STOPPED at the first
       point at or below 0.6 × peak, calling that the eye. A median 48 % of the box is below that
       line — up to 93 % of it — so the first hit is the corner the walk starts at: MEASURED over
       the 145 forecast hours production was serving on 2026-08-25, it returned exactly
       `peak.la - 1.5, peak.lo - 1.5` in 94 of the 101 hours that had an eye, a median 222 km from
       the storm, at a median 15.45 m/s of ordinary trade wind. The test's name, the camera below
       and every failure message it has ever printed were about a point outside the cyclone.
       ⚠ AND IT IS ONE SIDE OF THE OVERLAP #R458 HAD TO WORK AROUND: 「eyeFoot[1] >= 15.5」 is the
       footprint of that trade wind, not of an eye, and the eye this now names runs a median
       5.24 m/s. The pair-picking below still earns its keep — the EYEWALL's footprint straddles
       the wall whatever point is chosen — but the finder now hands it a real storm centre.
       ⚠ SO THE BOX IS GATHERED HERE AND THE CHOICE IS MADE IN NODE, the same split #R287 made for
       the colour verdict: tests/r460-checks.test.mjs can then put the identical decision through
       the fields this page cannot be made to show — a storm over land with calmer air inland, an
       eyewall whose ring has a gap, a box with no ring in it at all. */
    let box = null;
    if (peak.sp >= 25) {
      const n = 31, step = 0.1;
      const la0 = +(peak.la - 1.5).toFixed(2), lo0 = +(peak.lo - 1.5).toFixed(2);
      const v = [];
      for (let i = 0; i < n; i++) {
        v.push([]);
        for (let j = 0; j < n; j++) v[i].push(s.value(+(la0 + i * step).toFixed(2), +(lo0 + j * step).toFixed(2)));
      }
      box = { la0, lo0, step, n, v };
    }
    return { peak, box, validTime: EC.validTime() };
  });
  expect(found.err, 'the ECMWF wind field loaded on the deployed site').toBeUndefined();
  /* the strong-wind area always exists somewhere; the eye only when a cyclone does */
  expect(found.peak.sp, 'there is a strong-wind area somewhere on the planet').toBeGreaterThan(15);
  const storm = found.box ? findEye(found.peak, found.box)
    : { eye: null, why: 'the strongest wind anywhere in the tropics is ' + found.peak.sp.toFixed(1)
        + ' m/s, below the 25 m/s this looks for a cyclone at' };
  test.skip(!storm.eye,
    'no cyclone eye in this model hour — ' + storm.why + ' (valid ' + found.validTime + ')');
  console.log('[R460] eye ' + describeEye(found.peak, storm));

  /* Now the VISUAL half: fly to the eye and read the two pixels. The eye must be painted with a
     calmer colour than its eyewall, which is what "you can see the eye" means on a colour field. */
  const pic = await page.evaluate(async (e) => {
    const cb = document.getElementById('dl-wind');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.getElementById('btn-view-flat'); if (b) b.click();
    const map = window.IntMapGeoEngine.raw();
    window.IntMapGeoEngine.camera.jumpTo({ center: [e.eye.lo, e.eye.la], zoom: 5 });
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const d = window.Wind._dbg();
      if (d.hasField && d.hasLyr && d.rasterOpacity > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    /* ══ ⚠⚠⚠ (#R382) …AND THEN WAIT FOR THE PICTURE OF *THIS* VIEW, NOT FOR A CLOCK ═════════════
       The line here was `setTimeout(…, 6000)`, and 6 seconds is not a fact about anything. The
       wait above is satisfied the moment the FIELD is decoded and a raster layer exists — which it
       already is, because the test before this one turned the wind on at z3. Nothing then asked
       whether the tiles for the new zoom had been rendered, so this read whatever MapLibre was
       still drawing: the z3 ancestor, stretched over z5.
       MEASURED at the hour the 2026-08-24 deploy failed on (valid 01:00Z, run 23 Aug 18:00Z), at
       the eyewall of the typhoon at 24.5°N 136°E where the model reads 49.61 m/s:
           ancestor still on screen (0 – 1.2 s)   the pixel paints 42.1 m/s
           the z5 tiles landed      (1.2 s on)    the pixel paints 46.2 m/s
       and with the CPU throttled 10× — a shared two-core runner is in that range — the tiles do
       not land until **11.4 s**, i.e. long after the old 6 s had passed. What production actually
       read on the failing run was 38.1 m/s: coarser than either, an even earlier state of the same
       settling. Nothing was wrong with the map; the test was reading it before it was drawn.
       ⚠ THE SOURCE ID IS READ OFF THE LIVE STYLE, NOT WRITTEN DOWN HERE. js/weather.js keeps two
       slots (`wind-field-a` / `wind-field-b`) and swaps between them as the hour changes, so
       naming one of them would ask `isSourceLoaded` about a source that is not on the map — and
       that answers `undefined`, which is not a wait, it is a pass. */
    const windSources = () => {
      try {
        return map.getStyle().layers
          .filter((l) => l.type === 'raster' && /^wind-field-/.test(l.id))
          .map((l) => l.source);
      } catch (_) { return []; }
    };
    /* ⚠⚠ …AND THE FIRST LOOK HAS TO COME AFTER A FRAME. MEASURED while writing this: asked
       immediately after `jumpTo`, `isSourceLoaded` answers **true** — the source cache has not been
       told about the new viewport yet, so it is still answering for the OLD one, and the wait
       reported 「settled in 0.0 s」 and read exactly the frame it was meant to avoid. A wait that is
       satisfied before anything happens is not a wait. So each look is taken after a render, and
       two consecutive looks must agree. */
    let settled = false, settledMs = -1, agree = 0;
    const t1 = Date.now();
    const frame = () => new Promise((r) => { map.once('render', () => r()); map.triggerRepaint(); });
    while (Date.now() - t1 < 90000) {
      await frame();
      const ids = windSources();
      const now = ids.length > 0 && ids.every((id) => map.isSourceLoaded(id) === true)
        && map.areTilesLoaded();
      agree = now ? agree + 1 : 0;
      if (agree >= 2) { settled = true; settledMs = Date.now() - t1; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    /* js/weather.js reveals a slot through a 260 ms `raster-opacity-transition`; let it finish */
    await new Promise((r) => setTimeout(r, 1000));
    return new Promise((res) => {
      map.once('render', () => {
        const c = map.getCanvas();
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const read = (lng, lat) => {
          const p = window.IntMapGeoEngine.coords.project([lng, lat]);
          const rx = c.width / c.clientWidth, ry = c.height / c.clientHeight;
          const sx = Math.round(p.x * rx), sy = Math.round(c.height - p.y * ry);
          if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) return null;
          const px = new Uint8Array(4);
          gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return Array.from(px);
        };
        const EC = window.IntMapECMWF;
        const sc = EC.scale('wind_u_component_10m', true);
        const eyeV = EC.valueNow('wind_u_component_10m', e.eye.la, e.eye.lo);
        const ringV = EC.valueNow('wind_u_component_10m', e.peak.la, e.peak.lo);
        const want = (v) => { try { return EC.sdk().getColor(sc, v, true).slice(0, 3).map(Math.round); } catch { return null; } };
        /* THE SPEEDS THE MODEL ACTUALLY TAKES UNDER ONE PIXEL — the same ±1.5 px support the
           (#R287) test above derives and measured (477 live pixels across six views; 476 of them
           inside it, and ±2/±3/±4 no better, which is what says this is the filter's support and
           not a fitted number). Same renderer, same `raster-resampling: linear`, so the same
           support — it is stated here rather than shared because the two tests read different
           views and a helper would hide which one a failure came from. */
        const smp = EC.sampler('wind_u_component_10m');
        const foot = (lng, lat) => {
          const p = window.IntMapGeoEngine.coords.project([lng, lat]);
          let lo = Infinity, hi = -Infinity;
          for (let dx = -1.5; dx <= 1.5; dx += 0.5) {
            for (let dy = -1.5; dy <= 1.5; dy += 0.5) {
              const q = window.IntMapGeoEngine.coords.unproject([p.x + dx, p.y + dy]);
              const v = smp ? smp.value(q.lat, q.lng) : NaN;
              if (v === v && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
            }
          }
          return [lo, hi];
        };
        /* carried out whole so tests/r382-checks.test.mjs can put the same verdict through the
           failures this page cannot show (#R287) */
        const ramp = sc && sc.breakpoints
          ? { breakpoints: sc.breakpoints.slice(), colors: sc.colors.map((q) => [q[0], q[1], q[2]]) }
          : null;
        /* ══ ⚠⚠⚠ (#R458) EVERY POINT ON THIS SCREEN THE CROSS-CLAIM COULD BE ASKED OF ══════════
           The finder's two points are one candidate pair among many, and at some hours they are a
           pair the claim below cannot be made about at all (see `separablePair` in
           tests/helpers/wind-ramp.js for the measurement that says so). So the same box the finder
           searched is walked on the same 0.1° lattice, split by the finder's own 0.6 × peak line
           into 「calm」 and 「strong」, and each point is carried out with the two numbers the claim
           is stated in: the pixel it paints and the speeds the model takes under that pixel.
           ⚠ THE PAIR IS NOT CHOSEN HERE. This gathers; tests/helpers/wind-ramp.js decides, so
           tests/r458-checks.test.mjs can put the same decision through the overlap this page
           cannot be made to show. ⚠ AND IT READS THROUGH `read()`, in this one frame, so the
           candidates are pixels of the SAME picture the pair is judged in. */
        const cut = e.peak.sp * 0.6;
        const calm = [], strong = [], seen = new Set();
        const tScan = Date.now();
        const add = (la, lo) => {
          const k = la + ',' + lo;
          if (seen.has(k)) return;
          seen.add(k);
          const v = smp ? smp.value(la, lo) : NaN;
          if (!(v === v && isFinite(v))) return;
          const px = read(lo, la);
          if (!px) return;                       /* off screen — no pixel, no candidate */
          (v <= cut ? calm : strong).push({ la, lo, v, foot: foot(lo, la), px: px.slice(0, 3) });
        };
        add(e.eye.la, e.eye.lo);                 /* index 0 on each side is the pair the finder */
        add(e.peak.la, e.peak.lo);               /* chose, so 「keep it if it works」 is expressible */
        for (let dla = -1.5; dla <= 1.5 + 1e-9; dla += 0.1) {
          for (let dlo = -1.5; dlo <= 1.5 + 1e-9; dlo += 0.1) {
            add(+(e.peak.la + dla).toFixed(2), +(e.peak.lo + dlo).toFixed(2));
          }
        }
        res({
          eyePx: read(e.eye.lo, e.eye.la), ringPx: read(e.peak.lo, e.peak.la),
          eyeV, ringV, eyeWant: want(eyeV), ringWant: want(ringV),
          eyeFoot: foot(e.eye.lo, e.eye.la), ringFoot: foot(e.peak.lo, e.peak.la),
          eyeCands: calm, ringCands: strong, scanMs: Date.now() - tScan,
          ramp, settled, settledMs,
          particles: window.Wind._dbg().drawn,
        });
      });
      map.triggerRepaint();
    });
  }, { peak: found.peak, eye: storm.eye });

  expect(pic.eyePx, 'the eye is on screen').not.toBeNull();
  expect(pic.ringPx, 'and so is the eyewall').not.toBeNull();
  expect(pic.ringV, 'the eyewall is the strong half of the pair').toBeGreaterThan(pic.eyeV * 1.6);
  /* ⚠⚠ (#R276 追記) THE COMPARISON IS AGAINST THE TABLE, NOT AGAINST AN INVENTED QUANTITY. The first
     version of this line asked whether the eyewall was "hotter", defined as red − blue, and it FAILED
     in production on a picture that was perfectly correct:
         eye  rgb(160,195,55)   = the 13 m/s stop
         ring rgb(210,40,110)   = the 30 m/s stop
     …and 160−55 = 105 while 210−110 = 100. Red − blue is NOT monotone along this ramp, because the
     strong end runs through magenta into white and the blue channel climbs again. A derived measure
     written beside a colour table instead of read from it is exactly #R270's defect (「凡例が自分の色と
     矛盾していた」), one layer up. So both pixels are checked against `getColor` for their OWN speed,
     which is exact, and against each other, which is what "you can see the eye" means. */
  expect(pic.eyeWant, 'this SDK build exposes getColor').not.toBeNull();
  expect(pic.settled, 'the wind raster for THIS view landed before the pixels were read — a pixel '
    + 'read while the previous view\'s ancestor tile is still stretched over the screen belongs to '
    + 'that coarser picture, not to this one').toBe(true);
  console.log('[R276] cyclone raster settled in ' + (pic.settledMs / 1000).toFixed(1) + ' s');
  expect(pic.ramp, 'and the deployed build exposes the colour table its tiles are rendered from')
    .not.toBeNull();
  /* ⚠⚠ (#R276 追記3) EXACT EQUALITY IS THE WRONG TEST **HERE**, AND MEASURING SAID SO. The test above
     reads the middle of the map at z3 over open ocean and the pixel is byte-identical to the table
     entry — that is the invariant this round exists for and it holds. THIS pair is read at z5 across
     an EYEWALL, the steepest gradient in the atmosphere, where one screen pixel covers several model
     cells and MapLibre's `raster-resampling: linear` blends them: MEASURED in production, the eye
     came out one filtered step away from the 13.2 m/s entry and the assertion failed on a picture
     that was plainly right. Tightening a number until a correct picture passes is how a test stops
     meaning anything, so the QUESTION changed instead: each pixel had to be nearer its OWN table
     entry — `getColor(valueNow(...))` — than the other one's.

     ══ ⚠⚠⚠ (#R382) …AND THAT QUESTION IS STILL A POINT QUESTION ASKED OF A PATCH ═══════════════
     It is the very comparison #R287 measured and replaced one test above, kept here because at the
     time both readings happened to land near the same colour. They stopped. MEASURED on the deploy
     of 2026-08-24, which failed four attempts running:
         eyewall pixel [144,104,178] = the table's entry for 38.1 m/s
         `valueNow` at the same point                       49.61 m/s   → entry [223,214,158]
         the eye's entry (19.2 m/s)                                       [171,79,138]
     …and 38.1's colour is 2,954 from the EYE's entry and 18,741 from its own, so the pixel was
     "nearer the other one's" and the test went red on a picture that contained the storm. Read
     back through the ramp, the failure screenshot's own pixels reach 52 m/s in a pale core at the
     eyewall: the map was right.
     TWO things were wrong, and both are the test's:
       ① it read before the tiles of the new view had landed — see the wait above; and
       ② `valueNow()` answers for a mathematical POINT while the pixel answers for the PATCH of
          atmosphere it covers. Over open ocean those differ by a step or two. Across an eyewall
          the ±1.5 px patch spans **45.2 … 50.7 m/s** (measured, that hour) — and RGB DISTANCE
          ALONG THIS RAMP DOES NOT ORDER SPEEDS, which is #R276 追記's own lesson (「red − blue is
          not monotone along this ramp」) one layer up: reading the distance out of the table
          instead of inventing it did not make it monotone. The ramp loops through colour space,
          so MEASURED on the shipped table **195 of its 1,041 entries are nearer the EYE's colour
          than the EYEWALL's while being nearer the EYEWALL in speed** — and 38.1 m/s is one of
          them. A comparison decided by that is not measuring the picture.
     So the ambiguity is settled IN SPACE, exactly as #R287 settled it — `readPixel()` carried out
     whole, no tolerance anywhere in it — and the structural claim is then made in the field's own
     unit rather than in RGB: the speed the EYEWALL's pixel stands for is above everything the model
     has under the EYE, and the eye's below everything under the eyewall. Both bounds are read off
     the field. Nothing here is chosen.
     ⚠ (#R458) Nothing in the VERDICT is chosen — that is still true. WHICH TWO POINTS the verdict
     is taken at now is, because at some hours no two points can carry it. See below. */
  /* ══ ⚠⚠⚠ (#R458) …AND THE PAIR ITSELF HAS TO BE ONE THE CLAIM CAN BE MADE ABOUT ═════════════
     Claim ③ below compares one pixel against the OTHER point's footprint. That is a question
     about the picture only while the two footprints are disjoint in speed. When they overlap —
     eye.foot[1] >= ring.foot[0] — the two halves contradict each other by construction and a
     correct render can fail them, which is what happened four attempts running on the deploy of
     run 32818517323: the eye pixel read 15.5 m/s against a ring footprint that started at 15.045.
     ⚠ THE ANSWER IS NOT A LOOSER BOUND. Loosening ③ would keep asking an unanswerable question
     and call the silence a pass. The pair is chosen instead — the finder's own two points when
     they separate, otherwise the calmest and the strongest point this screen offers — and if even
     that pair overlaps, the hour is reported as unable to carry the claim, in the field's own
     unit, rather than skipped or waved through. The decision itself is in
     tests/helpers/wind-ramp.js so tests/r458-checks.test.mjs can watch it fail. */
  const pair = separablePair(pic.eyeCands, pic.ringCands);
  expect(pair.eye, 'the storm the finder measured is on this screen — ' + pair.why).not.toBeNull();
  console.log('[R458] eye ' + pair.eye.la + ',' + pair.eye.lo + ' foot '
    + pair.eye.foot[0].toFixed(2) + '…' + pair.eye.foot[1].toFixed(2) + ' | eyewall '
    + pair.ring.la + ',' + pair.ring.lo + ' foot ' + pair.ring.foot[0].toFixed(2) + '…'
    + pair.ring.foot[1].toFixed(2) + ' | gap ' + pair.gap.toFixed(2) + ' m/s'
    + (pair.repicked ? ' (re-picked; as found ' + pair.origGap.toFixed(2) + ')' : ' (as found)')
    + ' — from ' + pair.considered.calm + ' calm + ' + pair.considered.strong + ' strong candidates'
    + ' read in ' + pic.scanMs + ' ms');
  const eyePx = pair.eye.px.slice(0, 3), ringPx = pair.ring.px.slice(0, 3);
  const eyeFoot = pair.eye.foot, ringFoot = pair.ring.foot;
  const eyeRead = readPixel(pic.ramp, eyePx, eyeFoot[0], eyeFoot[1]);
  const ringRead = readPixel(pic.ramp, ringPx, ringFoot[0], ringFoot[1]);
  /* ① nothing was multiplied over the raster — #R276's 0.36× grey leaves this on the first channel */
  expect(eyeRead.inRange, 'the eye is inside the band the table paints for the wind that is really '
    + 'under it — ' + explain(eyePx, eyeRead)).toBe(true);
  expect(ringRead.inRange, 'and so is the eyewall — ' + explain(ringPx, ringRead)).toBe(true);
  /* ② …and it is THIS field, here, now: the speed each colour stands for is one the model has */
  expect(eyeRead.speedInFootprint, 'the eye\'s colour stands for a speed the model really has '
    + 'there (point value ' + pair.eye.v.toFixed(2) + ', painted as ' + eyeRead.nearest.v + ') — '
    + explain(eyePx, eyeRead)).toBe(true);
  expect(ringRead.speedInFootprint, 'and the eyewall\'s does too (point value '
    + pair.ring.v.toFixed(2) + ', which the table would paint '
    + JSON.stringify(colourFor(pic.ramp, pair.ring.v))
    + '; painted as ' + ringRead.nearest.v + ') — ' + explain(ringPx, ringRead)).toBe(true);
  /* ③ 「you can see the eye」 — stated in m/s, because red − blue is not monotone along this ramp
     (#R276 追記) and neither is distance-to-an-entry across its 35.9 → 46 m/s canyon (#R382) —
     and asked only at the hours where it is a question about the picture (#R458) */
  if (pair.separated) {
    expect(ringRead.nearest.v, 'the eyewall pixel reads as faster than anything the model has under '
      + 'the eye (' + ringRead.nearest.v + ' m/s vs the eye\'s footprint ' + eyeFoot[0].toFixed(1)
      + '…' + eyeFoot[1].toFixed(1) + ')').toBeGreaterThan(eyeFoot[1]);
    expect(eyeRead.nearest.v, 'and the eye pixel as calmer than anything under the eyewall ('
      + eyeRead.nearest.v + ' m/s vs ' + ringFoot[0].toFixed(1) + '…'
      + ringFoot[1].toFixed(1) + ')').toBeLessThan(ringFoot[0]);
    /* ══ ⚠⚠⚠ (#R487) …AND THE READER'S HALF IS ASKED IN THE READER'S UNIT ══════════════════
       「the two are far apart, which is the difference a reader actually sees」 — a claim about a
       PERSON, and it was put to the squared Euclidean distance between two sRGB triples, with the
       bound at 30 units. sRGB is a storage encoding; that distance does not order 「how different
       these look」. MEASURED on the shipped table, two pairs it ranks the opposite way round from
       the eye, by a factor of six and a half:
           4.7 m/s [77,143,131] vs 27.6 m/s [76,117,145]   RGB 29.5 → 「the same colour」, ΔE00 20.56
           9.0 m/s [53,160,53]  vs  9.6 m/s [83,162,54]    RGB 30.1 → 「far apart」,        ΔE00  3.17
       That is #R276 追記's own lesson (「red − blue is not monotone along this ramp」) and #R382's
       (「distance-to-an-entry does not order speeds」) for the THIRD time: a quantity written beside
       the colours instead of read out of the observer.
       ⚠ WHAT IT COST. Run 33096001326, both attempts: eye [75,145,155] over 2.15…7.20 m/s and
       eyewall [76,117,145] over 26.20…27.86 — 19.00 m/s apart, every other assertion here green,
       and this one red at 885 of the 900 it wanted. In ΔE00 that pair is **14.22**, seven times the
       bound below. The map was right; the ruler was not.
       ⚠ AND THE BOUND IS NOT READ OFF THE RAMP, deliberately. 「further apart than the table's own
       finest step」 writes no constant down and is worthless: flatten the ramp towards grey and the
       step goes to zero with it, so an unreadable map would clear its own bound. The threshold
       belongs to the eye — ΔE00 is scaled so 1.0 is one just-noticeable difference, and above 2 is
       the band that is visible AT A GLANCE, which is how a map is read. See
       tests/helpers/colour-difference.js; tests/r487-checks.test.mjs pins the formula against the
       reference pairs CIE 142 / Sharma et al. publish for exactly this reason. */
    const dE = deltaE00(eyePx, ringPx);
    const rgbDist = Math.sqrt((eyePx[0] - ringPx[0]) ** 2 + (eyePx[1] - ringPx[1]) ** 2
      + (eyePx[2] - ringPx[2]) ** 2);
    console.log('[R487] eye ' + JSON.stringify(eyePx) + ' vs eyewall ' + JSON.stringify(ringPx)
      + ' — ΔE00 ' + dE.toFixed(2) + ' (RGB distance ' + rgbDist.toFixed(1) + ')');
    expect(dE, 'the eye and its wall are visibly different colours: ' + JSON.stringify(eyePx)
      + ' vs ' + JSON.stringify(ringPx) + ' differ by ΔE00 ' + dE.toFixed(2) + ', at or below the '
      + VISIBLE_AT_A_GLANCE + ' at which a difference becomes visible at a glance')
      .toBeGreaterThan(VISIBLE_AT_A_GLANCE);
  } else {
    /* ⚠ NOT `test.skip`. Skipping would take the two single-pixel verdicts above down with it and
       report the hour as untested; this states exactly which claim could not be asked and why, in
       m/s, and leaves everything that IS measurable asserted. */
    const note = 'the eye/eyewall comparison could not be made at this model hour — ' + pair.why;
    console.log('[R458] ⚠ ' + note);
    test.info().annotations.push({ type: 'not measurable', description: note });
  }
  expect(pic.particles, 'and the particles are running over it').toBeGreaterThan(100);
});

test('(#R276) prod offers the whole forecast, and stepping it changes the file AND the numbers', async () => {
  const r = await page.evaluate(async () => {
    const EC = window.IntMapECMWF;
    const meta = await EC.meta();
    if (!meta) return { err: 'no metadata' };
    /* ⚠ the wind layer answers the SAME time event, and `_state().held` is ONE slot — whichever
       load resolves last owns it. So this asks `stateKey`, which is a pure function of the chosen
       step and of nothing else, and switches the wind off so the two loads do not race. */
    const wcb = document.getElementById('dl-wind');
    if (wcb && wcb.checked) { wcb.checked = false; wcb.dispatchEvent(new Event('change', { bubbles: true })); }
    const nowI = EC.nowIndex();
    EC.setIndex(nowI);
    await EC.load('temperature_2m');
    const a = { key: EC.stateKey('temperature_2m', ''), vt: EC.validTime(), v: EC.valueNow('temperature_2m', 35.68, 139.76) };
    EC.setIndex(Math.min(EC.count() - 1, nowI + 24));
    await EC.load('temperature_2m');
    const b = { key: EC.stateKey('temperature_2m', ''), vt: EC.validTime(), v: EC.valueNow('temperature_2m', 35.68, 139.76) };
    return {
      count: EC.count(), ref: EC.referenceTime(), nowI, a, b,
      lastAhead: (Date.parse(EC.validTime(EC.count() - 1)) - Date.now()) / 3600000,
      missing: ['temperature_2m', 'precipitation', 'cape', 'pressure_msl', 'cloud_cover', 'dew_point_2m',
        'wind_gusts_10m', 'wind_u_component_10m', 'wind_v_component_10m'].filter((v) => !EC.has(v)),
    };
  });
  expect(r.err, 'the model metadata is reachable from production').toBeUndefined();
  /* 「提供される全予報時刻を利用可能にする」 — the axis is the feed's, not a window on it */
  expect(r.count, 'the whole published axis is offered').toBeGreaterThan(40);
  expect(r.lastAhead, 'and it reaches days into the future, not one hour').toBeGreaterThan(48);
  expect(r.nowI, 'while the default step is inside it').toBeGreaterThanOrEqual(0);
  expect(r.missing, 'every layer this app declares has a variable in the feed').toEqual([]);
  /* the defect this round found: the step used to change nothing at all */
  expect(r.b.key, 'a step forward reads a DIFFERENT file').not.toBe(r.a.key);
  expect(r.b.key, 'whose name carries the new valid hour')
    .toContain(r.b.vt.slice(0, 13).replace(':', '') + '00.om');
  expect(r.b.vt, 'the valid time moved with it').not.toBe(r.a.vt);
  expect(typeof r.a.v, 'and both hours answer for a point').toBe('number');
  expect(typeof r.b.v).toBe('number');
});

/* ══ ⚠⚠⚠ (#R398) THE NUMBER THE READER IS GIVEN MUST LIE ON THE RAMP THE READER IS SHOWN ═════════
   「海面気圧レイヤーのカーソル読み出しが、自分の凡例と100倍食い違っている。」

   `pressure_msl` arrives in PASCALS and the SDK's ramp for it is written in hPa, so the corner
   printed 「101237 hPa」, the raster was painted the ramp's last colour EVERYWHERE (getColor gives
   one answer for every value on Earth once they are all past the top breakpoint), and the isobars
   — contoured at that same ramp's breakpoints — found no level to cross and drew nothing at all.
   Nothing in the app was in a position to notice: one variable in a unit its own key is not
   written in has no second case to disagree with.

   So this asks the relation of EVERY ECMWF raster the build ships, from the layer table itself,
   and it asks it of the LIVE field rather than of the source:

     ① the value the module reports lands on the key beside it — with a whole ramp-width of
        headroom either side, so a genuinely extreme hour cannot trip it and a factor of 100 cannot
        survive it;
     ② the renderer's ramp and the reader's ramp are one declared factor apart — not two tables;
     ③ where the field's own values vary at all, the colours they resolve to must vary too. That is
        the flat-sheet symptom stated without naming a colour: a field that spans a range and paints
        one colour is a ramp being read in the wrong unit. (A field that does NOT vary — a dry hour
        of precipitation — asserts nothing, which is why this cannot be flaky.) */
test('(#R398) every ECMWF raster reports its value in the unit its own key names', async () => {
  const r = await page.evaluate(async () => {
    const EC0 = window.IntMapECMWF, W = window.IntMapWeatherEC;
    const sdk = await EC0.loadSDK();
    await EC0.ready();
    const layers = (W && W._layers) ? W._layers.filter((l) => l.type === 'raster') : [];
    if (!layers.length) return { err: 'no raster weather layers on the deployed build' };
    /* one narrow band, read once per variable — the same request the readout itself makes */
    const band = EC0.bandNear(20, 50);
    const PTS = [[35, -80], [35, 139], [45, 10], [30, 75], [48, -3], [25, 120], [40, -100], [33, 35]];
    const out = [];
    for (const l of layers) {
      const EC = (W.engineFor && W.engineFor(l.id)) || EC0;
      await EC.load(l.variable, null, band);
      const lg = EC.legend(l.variable, true);
      const paint = sdk.getColorScale(l.variable, true, EC._settings().colorScales);
      /* ⚠ GUARDED ON PURPOSE. Read as `EC.fieldUnit(…)` this whole test dies with a TypeError on a
         build that has no such export — which is RED, but red for the absence of the fix rather
         than for the defect, and it would have told nobody whether the three assertions below can
         see anything. Degraded to the identity, the assertions are what fires: verified by
         running this against the pre-fix build, where ① and ③ both fail on `pressure_msl`. */
      const fu = EC.fieldUnit ? EC.fieldUnit(l.variable) : null;
      const per = fu ? fu.per : 1;
      const vals = PTS.map((p) => EC.valueNow(l.variable, p[0], p[1])).filter((v) => v != null && isFinite(v));
      const cols = vals.map((v) => JSON.stringify(sdk.getColor(paint, v * per)));
      out.push({
        id: l.id, variable: l.variable, per,
        unit: lg ? lg.unit : null, min: lg ? lg.min : null, max: lg ? lg.max : null,
        paintUnit: paint ? paint.unit : null,
        rampEnds: (lg && paint) ? (paint.type === 'breakpoint'
          ? [paint.breakpoints[0] / per, paint.breakpoints[paint.breakpoints.length - 1] / per]
          : [paint.min / per, paint.max / per]) : null,
        legendEnds: (lg && paint) ? (paint.type === 'breakpoint'
          ? [lg.stops[0].v, lg.stops[lg.stops.length - 1].v] : [lg.min, lg.max]) : null,
        n: vals.length, lo: Math.min.apply(null, vals), hi: Math.max.apply(null, vals),
        distinctColours: new Set(cols).size,
      });
    }
    return { out };
  });
  test.skip(!!r.err, r.err || '');

  for (const v of r.out) {
    const span = (v.max - v.min) || 1;
    expect(v.n, `${v.id}: the live field answers for points`).toBeGreaterThan(0);
    expect(v.unit, `${v.id}: its key names a unit`).toBeTruthy();
    /* ① the reading is on the key */
    expect(v.lo, `${v.id}: the lowest live value (${v.lo} ${v.unit}) is on its own key `
      + `(${v.min}…${v.max} ${v.unit})`).toBeGreaterThan(v.min - span);
    expect(v.hi, `${v.id}: the highest live value (${v.hi} ${v.unit}) is on its own key `
      + `(${v.min}…${v.max} ${v.unit})`).toBeLessThan(v.max + span);
    /* ② the two ramps are one declared factor apart — compared where they overlap, i.e. the ends
       of the ramp the renderer paints from, divided back, must be the ends the key draws */
    expect(v.rampEnds[0], `${v.id}: the renderer's ramp starts where the key does, ÷${v.per}`)
      .toBeCloseTo(v.legendEnds[0], 6);
    if (!/^wind_/.test(v.variable)) {   /* the wind key is deliberately capped at 30 m/s (#R297) */
      expect(v.rampEnds[1], `${v.id}: …and ends where it does`).toBeCloseTo(v.legendEnds[1], 6);
    }
    /* ③ a field that varies ACROSS THE RAMP must not paint one flat colour. The threshold is a
       fiftieth of the ramp's own width rather than 「> 0」, because two dry points a hundredth of a
       millimetre apart legitimately share a bucket; a hundredfold unit error does not — before the
       fix the sampled pressures spanned hundreds of the units they were reported in against a ramp
       120 wide, i.e. far past this threshold, and still resolved to one colour. */
    if (v.hi - v.lo > span / 50) {
      expect(v.distinctColours,
        `${v.id}: the field spans ${v.lo}…${v.hi} ${v.unit} — a fiftieth of its own ramp or more — `
        + 'yet every sample resolves to ONE colour, so the ramp is being read in the wrong unit')
        .toBeGreaterThan(1);
    }
  }
});

/* ══ ⚠⚠⚠ (#R398) AN ISOBAR LAYER THAT DRAWS NO ISOBARS ══════════════════════════════════════════
   Found while measuring the unit defect above, and independent of it: `ec-isobars` sent the SDK a
   vector url with neither `arrows=true` nor `contours=true`, and such a tile carries no `contours`
   layer at all. MEASURED on one file, one view, two sources side by side — plain url 0 features,
   `&contours=true` 900. The layer was visible, its source loaded, its tiles fetched, and every one
   of them empty, for as long as the row has existed.
   Three things have to hold for a labelled isobar to reach the reader, so all three are asked
   here — of the live tiles, not of the source: the contours exist, they are contoured at levels
   in the FIELD's unit (which is what the ramp handed to the renderer supplies), and the label the
   reader sees is that level divided back into the unit the key names. */
test('(#R398) the isobars draw, at levels in the field unit, labelled in the key unit', async () => {
  const r = await page.evaluate(async () => {
    const map = window.IntMapGeoEngine.raw(), EC = window.IntMapECMWF;
    /* ⚠ (#R439) THE ISOBARS ARE NO LONGER A ROW — they are a switch inside the sea-level-pressure
       legend (「等圧線レイヤーを取り込み」). This used to look up `dl-ec-isobars` and SKIP when it was
       absent, which after that change would have been a permanent green on the deployed build: the
       exact 「a skip here would have been green for the whole life of the bug」 failure the note at
       the bottom of this test is about. So it asks for the pair the switch now means — the pressure
       row, plus the published door — and skips only when neither exists. */
    const cb = document.getElementById('dl-ec-slp');
    if (!cb || !window._imWxIsobars) return { skip: 'no sea-level-pressure row on the deployed build' };
    document.getElementById('btn-view-flat')?.click();
    map.jumpTo({ center: [-30, 45], zoom: 3.4 });
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    /* (#R477) the coastline rides along on the one test that has a REAL opaque ECMWF raster on a
       REAL deployed build — 「Wind gustsでCoastlines & shoresが見えない」 was measured as an order,
       and an order is the one thing about these layers that only the live style can answer. It
       ships ON (#R476); this states it rather than assuming the deployed default. */
    const cc = document.getElementById('cb-coast');
    if (cc && !cc.checked) { cc.checked = true; cc.dispatchEvent(new Event('change', { bubbles: true })); }
    window._imWxIsobars(true);
    const t0 = Date.now();
    while (Date.now() - t0 < 45_000) {   /* inside the file's 90 s test timeout, so a source that
                                            never yields contours reaches the assertions below */
      const ids = map.getStyle().layers.map((l) => l.id).filter((i) => /^ec-isobars-\d+$/.test(i));
      if (ids.length) {
        const src = map.getStyle().layers.find((l) => l.id === ids[0]).source;
        const f = map.querySourceFeatures(src, { sourceLayer: 'contours' });
        if (f.length) {
          await new Promise((res) => setTimeout(res, 4000));
          const lblId = ids[0] + '-lbl';
          const placed = map.queryRenderedFeatures({ layers: [lblId] });
          const fu = EC.fieldUnit ? EC.fieldUnit('pressure_msl') : null;
          const per = fu ? fu.per : 1;
          const lg = EC.legend('pressure_msl', true);
          /* ⚠ (#R439) …AND WHERE THEY ARE IN THE STACK. The contours are drawn over the OPAQUE
             sea-level-pressure raster now (they are a switch on that layer), and every ECMWF layer
             is placed at the same anchor — so 「who is on top」 is 「who was added last」. MEASURED
             before the fix: `ec-isobars-0, ec-isobars-0-lbl, ec-slp-0`, i.e. every line fetched,
             parsed, drawn and then painted over. The tiles, the levels and the labels were all
             correct, so this is the one thing about them that the assertions above cannot see. */
          const order = map.getStyle().layers.map((l) => l.id);
          return {
            url: map.getSource(src).url, features: f.length,
            levels: [...new Set(f.map((x) => Number(x.properties.value)))].sort((a, b) => a - b),
            placedLabels: placed.length,
            labelExpr: JSON.stringify(map.getLayoutProperty(lblId, 'text-field')),
            per, keyMin: lg && lg.min, keyMax: lg && lg.max, keyUnit: lg && lg.unit,
            rasterAt: order.findIndex((i) => /^ec-slp-\d+$/.test(i)),
            lineAt: order.indexOf(ids[0]), labelAt: order.indexOf(lblId),
            /* (#R477) the same question about the base map's own two boundary lines */
            coastAt: order.indexOf('coast-only-line'), coastCasingAt: order.indexOf('coast-only-casing'),
            borderAt: order.indexOf('borders-only-line'), coastOn: !!(cc && cc.checked),
          };
        }
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    /* ⚠ NOT A SKIP. The row exists and was switched on; contours that never arrive IS the defect
       this test is about, so it falls through to the assertions with what it measured. A skip here
       would have been green for the whole life of the bug. */
    const ids = map.getStyle().layers.map((l) => l.id).filter((i) => /^ec-isobars-\d+$/.test(i));
    const src = ids.length && map.getStyle().layers.find((l) => l.id === ids[0]).source;
    const ord = map.getStyle().layers.map((l) => l.id);
    return { url: (src && map.getSource(src) || {}).url || '', features: 0, levels: [],
      placedLabels: 0, labelExpr: '', per: 1, keyMin: 0, keyMax: 0, keyUnit: '',
      rasterAt: ord.findIndex((i) => /^ec-slp-\d+$/.test(i)), lineAt: -1, labelAt: -1,
      coastAt: ord.indexOf('coast-only-line'), coastCasingAt: ord.indexOf('coast-only-casing'),
      borderAt: ord.indexOf('borders-only-line'), coastOn: !!(cc && cc.checked) };
  });
  test.skip(!!r.skip, r.skip || '');

  expect(r.url, 'the isobar source asks the SDK for contours').toContain('contours=true');
  expect(r.features, 'and the tiles carry them — an isobar layer with no isobars in it is the '
    + 'defect this test exists for, so this is a failure and never a skip').toBeGreaterThan(0);
  /* the levels are the renderer's ramp — i.e. the key's numbers × per. Divided back they must land
     inside the key, which is the same relation the readout obeys. */
  const back = r.levels.map((v) => v / r.per);
  expect(Math.min(...back), `the lowest contour level (${back[0]} ${r.keyUnit}) is on the key`)
    .toBeGreaterThanOrEqual(r.keyMin);
  expect(Math.max(...back), 'and so is the highest').toBeLessThanOrEqual(r.keyMax);
  /* (#R439) and they are ON TOP of the field they are contours of — see the note in the probe */
  expect(r.rasterAt, 'the sea-level-pressure raster is on the map (the contours ride on it)')
    .toBeGreaterThanOrEqual(0);
  expect(r.lineAt, 'the contour lines are drawn ABOVE the opaque raster, not under it')
    .toBeGreaterThan(r.rasterAt);
  expect(r.labelAt, 'and their labels above the lines').toBeGreaterThan(r.lineAt);
  /* and the label the reader actually reads is that same division */
  expect(r.labelExpr, 'the label divides by the declared factor').toContain(String(r.per));
  expect(r.placedLabels, 'and labels are actually placed — `line` placement puts none on these '
    + 'geometries, which is why the layer uses `point`').toBeGreaterThan(0);

  /* ══ ⚠⚠⚠ (#R477) THE BASE MAP'S OWN LINES ARE ABOVE THAT SAME OPAQUE RASTER ══════════════════
     「Wind gustsでCoastlines & shoresが見えない。」 Every ECMWF raster is opaque and lands at one
     anchor, so this is one question asked of whichever of them is up. It is asked HERE because the
     hermetic suite can only prove the MECHANISM (tests/smoke ㉑ raises a probe layer); this is the
     deployed build, with a real forecast raster painted over a real coastline. */
  expect(r.coastOn, 'the coastline row is on (it ships on since #R476)').toBe(true);
  expect(r.coastAt, 'the coastline is on the deployed map').toBeGreaterThanOrEqual(0);
  expect(r.coastAt, `the coastline (${r.coastAt}) is drawn ABOVE the opaque weather raster `
    + `(${r.rasterAt}) — under it, the shore is not faint, it is gone`).toBeGreaterThan(r.rasterAt);
  expect(r.borderAt, 'so is the national border it is a copy of').toBeGreaterThan(r.rasterAt);
  expect(r.coastCasingAt, 'and the casing stayed directly under its own line (#R210)')
    .toBe(r.coastAt - 1);
});


/* (#R333) THE TWO HALVES OF ONE COMMIT, DEPLOYED BY DIFFERENT MEANS.
   js/ reaches production by pushing to main (deploy.yml → Pages). An Edge Function reaches it only
   when a human runs `supabase functions deploy`. Nothing compared the two.

   #R318 shipped the `x-intmap-turn` header on both sides of that line — and only one side arrived.
   A custom request header the server does not list in Access-Control-Allow-Headers fails the
   browser's PREFLIGHT, so the POST is never sent: fetch() rejects with a bare "Failed to fetch" and
   no HTTP status ever reaches the client. Atlas answered every question that way, and every
   check in this repository stayed green, because the repository was self-consistent — js/ sent the
   header and ai-proxy's source allowed it. Only production disagreed.

   ⚠ THIS ASSERTION CANNOT MOVE INTO THE HERMETIC SUITE. Comparing the repo against itself is what
   was already true while Atlas was down. It has to ask production what it actually allows. */
test('(#R333) prod deployed the CORS contract this commit declares — every Edge Function', async ({ request }) => {
  const contract = repoCorsContract(REPO_ROOT);
  const unreadable = [...contract].filter(([, v]) => v.via === 'unknown').map(([n]) => n);
  /* A function whose contract cannot be read is NOT quietly skipped: a shortened list reads as a
     complete one (#R320), and "every function" is the whole claim this test makes. */
  expect(unreadable, 'every shipped function declares a CORS table this check can read').toEqual([]);
  expect(contract.size, 'and the repository ships functions to check').toBeGreaterThan(0);

  const origin = new URL(PROD_URL).origin;
  const behind = [];
  for (const [name, { headers: want }] of contract) {
    const res = await request.fetch(`${FN_BASE}/${name}`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST',
                 'access-control-request-headers': [...want].join(', ') },
      failOnStatusCode: false,
    });
    const got = parseAllowHeaders(res.headers()['access-control-allow-headers']);
    const missing = [...want].filter((h) => !got.has(h));
    if (missing.length) {
      behind.push(`${name}: production allows [${[...got].join(', ') || '—'}] and is missing ` +
        `[${missing.join(', ')}] — deploy it: supabase functions deploy ${name} --project-ref <ref>`);
    }
  }
  /* ⚠ ONE-WAY on purpose. Production allowing MORE than this commit declares is a function deployed
     from a branch that has not merged yet — normal while a parallel round is in flight, and not a
     defect. Only the other direction means a user is being refused something this commit promised. */
  expect(behind, 'production runs the CORS contract this commit declares').toEqual([]);
});
