// @ts-check
/* ============================================================================
 *  IntMap · LOAD-ON-DEMAND MODULES — window.IntMapLazy  (#R209)
 * ----------------------------------------------------------------------------
 *  「つまり現在の分割は『保守しやすいファイル分割』が中心で、『必要になった機能だけ取得する
 *    実行時分割』はまだ浅いです。」
 *
 *  #R175 turned sixty <script src> tags into an ES-module graph, and #R162–#R208 split the program
 *  into 112 files — but every one of them was still in the ENTRY's static list, so the browser
 *  downloaded, parsed and executed all of them before the map could draw. Measured on this branch
 *  before any change (scripts/frame-profile.mjs --boot, iPhone-13 profile, CPU ÷4, tile bytes served
 *  from a local replay cache so only the app's own transfer is on the clock):
 *
 *      fast-4G  first draw 4,967 ms      slow-4G  first draw 15,168 ms      JS 1,800 kB over 7 files
 *
 *  This file is the other half of the split: the module graph a session actually TOUCHES. A feature
 *  reached from one right-click item is fetched when that item is clicked, and never otherwise.
 *
 *  ══ WHY A SEPARATE FILE, AND WHY THIS EXACT SHAPE ═════════════════════════════════════════════
 *  Four mechanical gates decide the shape; all four are load-bearing and none of them is optional:
 *
 *   1. `scripts/static-checks.mjs` (reachability) only sees a LITERAL, single-quoted, `./`-relative
 *      dynamic import written inside a js/ file. A loader table, a computed specifier, double quotes
 *      or a `../js/` path are invisible to it and the target is then reported as "exists but nothing
 *      imports it". Hence the literal specifier inside each registry entry's `load` — it is not styling.
 *      ⚠ AND THE SCAN READS COMMENTS TOO. Spelling the pattern out here with a placeholder file name
 *      made the gate report a dynamic import of a file that does not exist — the same way #R208's
 *      negative regex matched its own comment. Describe the shape; do not write a specimen of it.
 *   2. `scripts/static-checks.mjs` (factory calls) requires the literal string
 *      `window.IntMapModules.<name>(` to appear in index.html, js/app-body.js, js/geo-engine.js or a
 *      file js/app-body.js imports with a line-anchored `import … from './y.js';`. That is why this
 *      file is a NAMED sibling of app-body.js rather than something app-body import()s: the `mount`
 *      calls in the registry entries are the ones the gate reads.
 *   3. `tests/r175-checks.test.mjs` requires every named export to be reached by name from somewhere
 *      (js/, src/, scripts/ or tests/ — scripts/export-readers.mjs). `makeLazyModules` is imported by
 *      app-body.js; LAZY_NAMES / CARRIED_NAMES by src/main.js; LAZY_REGISTRY by the tests that used
 *      to regex two files for the same facts. (The ban on top-level declarations went with #R795.)
 *   4. `src/main.js`'s boot guard cannot check a factory that has not been fetched yet — so it
 *      imports LAZY_NAMES from the registry as the deferred half of its list, and the check is not
 *      DROPPED, it is MOVED to load time: `mount()` verifies the factory and the global it publishes
 *      actually arrived, and records a failure in `window.__imLazyCheck` if either did not.
 *
 *  ⚠ AND THAT LAST POINT IS THE WHOLE RISK OF THIS ROUND. This project's most expensive recurring
 *  defect is a feature that silently stops existing (#R162, #R200, #R205, #R208) — and "the module
 *  is not there yet" is a machine for producing exactly that. So nothing here is `&&`-guarded into
 *  silence: a load failure rejects, is recorded, and `tests/r209.spec.js` asserts the record is
 *  empty after every lazy module has been asked for.
 *
 *  ⚠ THERE ARE NO STUB OBJECTS. A stub that answers `open()` but not `state()` is the same silent
 *  hole one layer down, and a Proxy that answers everything with a Promise turns `active()` from
 *  `false` into a truthy object. Instead the ENTRY POINTS await — `IntMapLazy.need(name)` before the
 *  call — and the passive readers keep the `&&` guard they already had, which now answers "not
 *  loaded" the same way it always answered "not flying".
 * ==========================================================================*/

/* ══ (#R798) ONE DEFINITION PER DEFERRED MODULE ═══════════════════════════════════════════════
 *  Until this round a deferred module was FIVE rows in five tables — `PUBLISHES` (the global it
 *  owns), `fetchModule` (a `case` with its literal import), `mount` (a `case` with its factory
 *  call), `ALSO` (what must arrive with it), `SELF_PUBLISHING` (no factory) — plus a sixth row in
 *  src/main.js's LAZY_FACTORIES for the boot guard. Adding a module meant editing four to six places
 *  that had to agree, and tests/r209 ③ / r304 ② existed to catch the day they did not. Now each
 *  module is ONE entry and every list is derived from it: the loader reads it here, the boot guard
 *  imports LAZY_NAMES, and the tests read the same object rather than a regex over two files.
 *
 *  · `publishes` — the window global that must exist once the module has arrived (checked, not assumed)
 *  · `load`      — the literal dynamic import (⚠ literal: scripts/static-checks.mjs and
 *                  scripts/js-reachability.mjs read the specifier as text; a computed one is invisible)
 *  · `mount`     — runs the factory with the shared host, spelled `window.IntMapModules.x(IM_HOST)`
 *                  because scripts/static-checks.mjs's "every factory is called" rule and three
 *                  older suites read that spelling; the parameter is NAMED IM_HOST for the same reason
 *  · `self`      — the module publishes at import time and registers no factory (four of them)
 *  · `also`      — modules that cannot be asked for alone (the seismic panel calls the tsunami
 *                  module directly; the satellite layer calls its detail card)
 *  ⚠ Order is the order the boot guard reports in; it carries no other meaning. */
export const LAZY_REGISTRY = Object.freeze({
  flightSim: { publishes: 'IntMapFlightSim', load: () => import('./flight-sim.js'), mount: (IM_HOST) => { window.IntMapFlightSim=window.IntMapModules.flightSim(IM_HOST); } },
  playground: { publishes: '_openPlayground', load: () => import('./playground.js'), mount: (IM_HOST) => { window.IntMapModules.playground(IM_HOST); } },
  pandemicSim: { publishes: 'IntMapPandemicAtlas', load: () => import('./pandemic-atlas.js'), self: true },
  seismic: { publishes: 'IntMapSeismic', load: () => import('./seismic.js'), mount: (IM_HOST) => { window.IntMapModules.seismic(IM_HOST); }, also: ['tsunami'] },
  tsunami: { publishes: 'IntMapTsunami', load: () => import('./tsunami.js'), mount: (IM_HOST) => { window.IntMapModules.tsunami(IM_HOST); } },
  terrainWater: { publishes: 'IntMapTerrainWater', load: () => import('./terrain-water.js'), mount: (IM_HOST) => { window.IntMapModules.terrainWater(IM_HOST); } },
  los: { publishes: 'IntMapLOS', load: () => import('./viewshed.js'), mount: (IM_HOST) => { window.IntMapModules.los(IM_HOST); } },
  streetView: { publishes: 'IntMapStreetView', load: () => import('./street-view.js'), mount: (IM_HOST) => { window.IntMapStreetView=window.IntMapModules.streetView(IM_HOST); } },
  nightSky: { publishes: 'IntMapNightSky', load: () => import('./night-sky.js'), self: true },
  atlasConsole: { publishes: 'IntMapConsole', load: () => import('./atlas-console.js'), mount: (IM_HOST) => { window.IntMapConsole=window.IntMapModules.atlasConsole(IM_HOST); } },
  atlasQuery: { publishes: 'IntMapQuery', load: () => import('./atlas-query.js'), mount: (IM_HOST) => { window.IntMapQuery=window.IntMapModules.atlasQuery(IM_HOST); } },
  atlasChart: { publishes: 'IntMapAtlasChart', load: () => import('./atlas-chart.js'), mount: (IM_HOST) => { window.IntMapAtlasChart=window.IntMapModules.atlasChart(IM_HOST); } },
  atlasAnswerView: { publishes: 'IntMapAnswerView', load: () => import('./atlas-answer-view.js'), mount: (IM_HOST) => { window.IntMapAnswerView=window.IntMapModules.atlasAnswerView(IM_HOST); } },
  routeUi: { publishes: 'IntMapRouteUI', load: () => import('./routing-ui.js'), mount: (IM_HOST) => { window.IntMapRouteUI=window.IntMapModules.routeUi(IM_HOST); } },
  gisCore: { publishes: 'IntMapGis', load: () => import('./gis-core.js'), mount: (IM_HOST) => { window.IntMapGis=window.IntMapModules.gisCore(IM_HOST); } },
  dataCenters: { publishes: 'IntMapDataCenters', load: () => import('./datacenters.js'), mount: (IM_HOST) => { window.IntMapModules.dataCenters(IM_HOST); } },
  railways: { publishes: 'IntMapRailways', load: () => import('./railways.js'), mount: (IM_HOST) => { window.IntMapModules.railways(IM_HOST); } },
  aircraftDetail: { publishes: 'IntMapAircraftPanel', load: () => import('./aircraft-detail.js'), mount: (IM_HOST) => { window.IntMapAircraftPanel=window.IntMapModules.aircraftDetail(IM_HOST); } },
  volume3d: { publishes: 'IntMapVolume3D', load: () => import('./volume3d.js'), mount: (IM_HOST) => { window.IntMapVolume3D=window.IntMapModules.volume3d(IM_HOST); } },
  statsCompare: { publishes: 'IntMapStatsCompare', load: () => import('./stats-compare.js'), mount: (IM_HOST) => { window.IntMapStatsCompare=window.IntMapModules.statsCompare(IM_HOST); } },
  aviationLive: { publishes: 'IntMapAviation', load: () => import('./aviation-live.js'), mount: (IM_HOST) => { window.IntMapAviation=window.IntMapModules.aviationLive(IM_HOST); } },
  satellitesLive: { publishes: 'IntMapSatellites', load: () => import('./satellites-live.js'), mount: (IM_HOST) => { window.IntMapModules.satellitesLive(IM_HOST); }, also: ['satelliteDetail'] },
  satelliteDetail: { publishes: 'IntMapSatPanel', load: () => import('./satellite-detail.js'), mount: (IM_HOST) => { window.IntMapModules.satelliteDetail(IM_HOST); } },
  volcanoIntel: { publishes: 'IntMapVolcano', load: () => import('./volcano-intel.js'), mount: (IM_HOST) => { window.IntMapModules.volcanoIntel(IM_HOST); } },
  volcanoLayers: { publishes: 'IntMapVolcanoLayers', load: () => import('./volcano-layers.js'), mount: (IM_HOST) => { window.IntMapModules.volcanoLayers(IM_HOST); } },
  companyData: { publishes: 'IntMapCompanyData', load: () => import('./company-data.js'), mount: (IM_HOST) => { window.IntMapCompanyData=window.IntMapModules.companyData(IM_HOST); } },
  companyPanel: { publishes: 'IntMapCompanyPanel', load: () => import('./company-panel.js'), mount: (IM_HOST) => { window.IntMapCompanyPanel=window.IntMapModules.companyPanel(IM_HOST); }, also: ['companyData', 'companyFacilities'] },
  companyFacilities: { publishes: 'IntMapCompanyFacilities', load: () => import('./company-facilities.js'), mount: (IM_HOST) => { window.IntMapCompanyFacilities=window.IntMapModules.companyFacilities(IM_HOST); }, also: ['companyData'] },
  analysisTimeSeries: { publishes: '__imAnalysisTimeSeries', load: () => import('./analysis-timeseries.js'), mount: (IM_HOST) => { window.IntMapModules.analysisTimeSeries(IM_HOST); } },
  analysisResearch: { publishes: '__imAnalysisResearch', load: () => import('./analysis-research.js'), mount: (IM_HOST) => { window.IntMapModules.analysisResearch(IM_HOST); } },
  analysisCorrelate: { publishes: '__imAnalysisCorrelate', load: () => import('./analysis-correlate.js'), mount: (IM_HOST) => { window.IntMapModules.analysisCorrelate(IM_HOST); } },
  analysisEvents: { publishes: '__imAnalysisEvents', load: () => import('./analysis-world-events.js'), mount: (IM_HOST) => { window.IntMapModules.analysisEvents(IM_HOST); } },
  analysisEdu: { publishes: '__imAnalysisEdu', load: () => import('./analysis-edu.js'), mount: (IM_HOST) => { window.IntMapModules.analysisEdu(IM_HOST); } },
  warLayer: { publishes: '__imWarFronts', load: () => import('./war-layer.js'), mount: (IM_HOST) => { window.IntMapModules.warLayer(IM_HOST); } },
  waves: { publishes: 'IntMapWaves', load: () => import('./waves.js'), mount: (IM_HOST) => { window.IntMapWaves=window.IntMapModules.waves(IM_HOST); } },
  navigation: { publishes: 'IntMapNavigation', load: () => import('./navigation.js'), self: true },
  routingTraffic: { publishes: 'IntMapRouteTraffic', load: () => import('./routing-traffic.js'), self: true },
  newsEvents: { publishes: 'IntMapNewsEvents', load: () => import('./news-events.js'), mount: (IM_HOST) => { window.IntMapNewsEvents=window.IntMapModules.newsEvents(IM_HOST); } },
  photoGeo: { publishes: 'IntMapPhotoGeo', load: () => import('./photo-geo.js'), mount: (IM_HOST) => { window.IntMapPhotoGeo=window.IntMapModules.photoGeo(IM_HOST); } },
  shakeMap: { publishes: 'IntMapShakeMap', load: () => import('./shakemap.js'), mount: (IM_HOST) => { window.IntMapShakeMap=window.IntMapModules.shakeMap(IM_HOST); } },
  radiationLayer: { publishes: 'IntMapRadiationObs', load: () => import('./radiation-layer.js'), mount: (IM_HOST) => { window.IntMapRadiationObs=window.IntMapModules.radiationLayer(IM_HOST); } },
  netHealthLive: { publishes: '__imNetHealth', load: () => import('./net-health-live.js'), mount: (IM_HOST) => { window.IntMapModules.netHealthLive(IM_HOST); } },
});
/* the boot guard's two lists, derived: the factory-backed names, and the one registered by a file
   nobody fetches on its own (js/aviation-live.js imports js/aircraft-points.js statically — #R408) */
export const LAZY_NAMES = Object.freeze(Object.keys(LAZY_REGISTRY).filter((n) => !LAZY_REGISTRY[n].self));
export const CARRIED_NAMES = Object.freeze(['aircraftPoints']);

/** @param {import('../types/im-host').IMHost} HOST */ export function makeLazyModules(HOST) {
  return (function () {
    /* ⚠ THE ALIAS IS DELIBERATE AND IT IS NOT COSMETIC. The mount calls below are byte-identical to
       the ones js/app-body.js used to make, down to the host's name, and three suites (#R163 #1,
       #R166 #1/#2, #R176) assert those strings — "instantiated exactly once, with the shared host" —
       by literal match. The call has not changed; only the line it sits on has. Keeping the name
       keeps those invariants live rather than editing eight of them into a weaker shape.
       ⚠ …and for the same reason no comment in this file may spell one of them out: #R166 #1 counts
       occurrences, and a specimen in prose is a second one (it cost this round two red runs). */
    const IM_HOST = HOST;

    /* name → the promise of its arrival. One entry per module, created on first demand. */
    const P = Object.create(null);

    /* (#R798) the tables the loader used to carry are views over LAZY_REGISTRY — see the header */
    const R = LAZY_REGISTRY;
    const ALSO = (name) => (R[name] && R[name].also) || [];
    const SELF_PUBLISHING = (name) => !!(R[name] && R[name].self);
    const PUBLISHES = (name) => (R[name] && R[name].publishes) || '';

    function record(name, why) {
      try {
        const c = window.__imLazyCheck || (window.__imLazyCheck = { loaded: [], failed: [] });
        c.failed.push(name + ': ' + why);
        console.error('[IntMap] lazy module ' + name + ' — ' + why);
      } catch (_) { /* console is not a dependency */ }
    }
    function ok(name) {
      try {
        const c = window.__imLazyCheck || (window.__imLazyCheck = { loaded: [], failed: [] });
        if (c.loaded.indexOf(name) < 0) c.loaded.push(name);
      } catch (_) { }
    }

    function fetchModule(name) {
      return R[name] ? R[name].load() : Promise.reject(new Error('no such lazy module: ' + name));
    }
    /* Run the factory at the point js/app-body.js used to run it, with the same host object. */
    function mount(name) {
      const e = R[name]; if (!e) return !!window.IntMapModules;
      if (e.self) return typeof window[e.publishes] !== 'undefined';
      e.mount(IM_HOST); return true;
    }

    /* ⚠ (#R372) A DOWNLOAD FAILURE IS NOT A PERMANENT ANSWER, AND A PRELOAD MUST NOT DECIDE ONE — but a
       failure AFTER the file arrived IS permanent. Why each half: Architecture.md §1.1. */
    const FAILED = Object.create(null), RETRY_MS = 1500;   /* name → {at,hinted}, DOWNLOAD failures only */
    function need(name) { return demand(name, false); }   /* the public door takes ONE argument, so a stray .map(need) cannot mark a real click as a preload */
    function demand(name, hinted) {
      if (P[name]) return P[name];
      const f = FAILED[name]; if (f && Date.now() - f.at < RETRY_MS && (hinted || !f.hinted)) return Promise.resolve(false); delete FAILED[name];
      const p = Promise.all(ALSO(name).map((d) => demand(d, hinted)))   /* ⚠ not `.map(demand)` — map passes the INDEX second, which would mark every dependency as a preload */
        .then(() => fetchModule(name))
        .then(() => {
          /* The factory must have arrived with the file. If it did not, the file loaded but did not
             register — say so rather than throwing an undefined-is-not-a-function further down. */
          if (!SELF_PUBLISHING(name) && !(window.IntMapModules && typeof window.IntMapModules[name] === 'function')) {
            record(name, 'the file loaded but registered no IntMapModules.' + name + ' factory');
            return false;
          }
          let mounted = false;
          try { mounted = mount(name); } catch (e) { record(name, 'its factory threw: ' + (e && e.message)); return false; }
          const g = PUBLISHES(name);
          if (mounted && g && typeof window[g] === 'undefined') { record(name, 'nothing was published on window.' + g); return false; }
          if (mounted) ok(name);
          return mounted;
        })
        .catch((e) => { record(name, 'could not be downloaded (' + (e && e.message) + ')'); FAILED[name] = { at: Date.now(), hinted: !!hinted }; if (P[name] === p) delete P[name]; return false; });
      P[name] = p; return p;
    }

    /* Was it already asked for? Lets a caller that only READS state skip the fetch — an Atlas
       "close everything" sweep should not download a simulator in order to close it. */
    function ready(name) { return !!P[name] && typeof window[PUBLISHES(name)] !== 'undefined'; }

    /* The user is hovering the item / has opened the panel that leads here. Same promise as need(),
       started early; nothing waits on it. */
    function hint(name) { try { demand(name, true); } catch (_) { } }

    const API = {
      need, ready, hint,
      names: () => Object.keys(R), publishes: (n) => PUBLISHES(n),   /* (#R320) …and WHAT each one will be called once it arrives. js/atlas-controls.js walked Object.keys(window) to tell the planner which subsystems exist, so a module not yet fetched was a subsystem IntMap did not have — eight of them. This manifest exists from boot, so the name can be offered before the code is. */
      pending: () => Object.keys(P),
      /* what the boot guard would have said, for the modules it can no longer see at boot */
      check: () => window.__imLazyCheck || { loaded: [], failed: [] },
    };
    try { window.IntMapLazy = API; } catch (_) { }
    try { window.__imLazyCheck = window.__imLazyCheck || { loaded: [], failed: [] }; } catch (_) { }
    return API;
  })();
}
