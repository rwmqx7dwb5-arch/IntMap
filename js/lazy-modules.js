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
 *      imports it". Hence the switch of literals in `fetchModule` — it is not styling.
 *      ⚠ AND THE SCAN READS COMMENTS TOO. Spelling the pattern out here with a placeholder file name
 *      made the gate report a dynamic import of a file that does not exist — the same way #R208's
 *      negative regex matched its own comment. Describe the shape; do not write a specimen of it.
 *   2. `scripts/static-checks.mjs` (factory calls) requires the literal string
 *      `window.IntMapModules.<name>(` to appear in index.html, js/app-body.js, js/geo-engine.js or a
 *      file js/app-body.js imports with a line-anchored `import … from './y.js';`. That is why this
 *      file is a NAMED sibling of app-body.js rather than something app-body import()s: the mount
 *      calls below are the ones the gate reads.
 *   3. `tests/r175-checks.test.mjs` forbids top-level declarations in js/*.js, and requires every
 *      named export to be `import { name } from './…'`-ed somewhere. `export function` + the sibling
 *      import in app-body.js satisfies both; everything else lives inside the returned IIFE.
 *   4. `src/main.js`'s boot guard cannot check a factory that has not been fetched yet — so the keys
 *      below move from MODULE_FACTORIES to LAZY_FACTORIES there, and the check is not DROPPED, it is
 *      MOVED to load time: `mount()` verifies the factory and the global it publishes actually
 *      arrived, and records a failure in `window.__imLazyCheck` if either did not.
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

export function makeLazyModules(HOST) {
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

    /* Modules that cannot be asked for alone. The seismic panel offers the tsunami run and calls
       window.IntMapTsunami directly (js/seismic.js), so asking for one means asking for both.
       (#R311) …and the satellite DETAIL CARD is the same shape — js/satellites-live.js calls
       window.IntMapSatPanel from its own click handler, and this keeps the panel first. */
    const ALSO = { seismic: ['tsunami'], satellitesLive: ['satelliteDetail'] };

    /* The global each module must have published by the time its promise resolves. Checked, not
       assumed — see the header. `playground` publishes a bare function, so it is named too. */
    const PUBLISHES = {
      flightSim: 'IntMapFlightSim', playground: '_openPlayground', seismic: 'IntMapSeismic',
      tsunami: 'IntMapTsunami', terrainWater: 'IntMapTerrainWater', los: 'IntMapLOS',
      streetView: 'IntMapStreetView', nightSky: 'IntMapNightSky',
      /* ══ (#R224) THE BIGGEST FILE IN THE BOOT BUNDLE ═══════════════════════════════════════════
         「モバイル版がまだ劇的に遅い…ブラウザが落ちることもある。」 js/atlas-console.js is 658 kB of the
         3.67 MB main chunk (#R218's measurement) and it is parsed on every session, including the
         many that never open Atlas. It is the LAST of the big eight to move, and it moved last for a
         reason: Atlas is this app's control plane, so a dozen features reach for `window.IntMapConsole`.
         Every one of them now goes through `window.IntMapAtlas` (js/app-body.js), which fetches the
         kernel first — so «Atlas can drive everything» is unchanged and only the MOMENT it arrives is. */
      atlasConsole: 'IntMapConsole',
      /* (#R291) the directions PANEL. The router (js/routing.js) is eager — Atlas must be able to
         route with no panel — and this is the ~30 kB of UI a session that never opens Layers →
         Tools → Directions never downloads (§2.3). */
      routeUi: 'IntMapRouteUI',
      /* ══ (#R311) SIX MORE, PICKED BY A TEST RATHER THAN BY SIZE ═══════════════════════════════
         The ten above are reached from a menu item. These six are the rest of what the entry pulled in
         that registers NOTHING at boot — no layer row, no DOM, no IntMapOS command, no listener — so
         there is a "before it is reached" to defer to, and every door awaits. */
      dataCenters: 'IntMapDataCenters', aircraftDetail: 'IntMapAircraftPanel', volume3d: 'IntMapVolume3D', statsCompare: 'IntMapStatsCompare',
      satellitesLive: 'IntMapSatellites', satelliteDetail: 'IntMapSatPanel',
      /* ══ (#R315) …AND THE FILE #R311 HAD TO LEAVE BEHIND, SPLIT INSTEAD OF DEFERRED ════════════
         js/analysis-panels.js was the biggest thing left in the entry (909 lines, 122 kB) and #R311
         measured why it could not join the six above: counting the statements each factory EXECUTES
         showed `correlate` appends #btn-correlate to the Layers panel at boot and `edu` mounts
         #edu-mount / #btn-edu and a map-click listener. Deferring the file would have deleted two
         Layers buttons until somebody asked for a panel they could no longer see.
         ⚠ SO IT IS SPLIT BY WHAT RUNS AT BOOT, NOT BY FEATURE. js/analysis-panels.js stays eager and
         keeps the five factories, that boot-time DOM, and a thin async facade on each public global
         (window.IntMapTimeSeries / IntMapAIResearch / IntMapCorrelate / IntMapEdu / _setDashView /
         _renderEventsArchive); the five files below hold the bodies and arrive when a facade is
         called. The globals they publish are deliberately `__imAnalysis…` and not `IntMap…` —
         js/atlas-controls.js's moduleCatalog() discovers `window.IntMap*` BY ENUMERATION, so a second
         IntMap-named object per panel would offer the planner five capabilities nothing dispatches. */
      analysisTimeSeries: '__imAnalysisTimeSeries', analysisResearch: '__imAnalysisResearch',
      analysisCorrelate: '__imAnalysisCorrelate', analysisEvents: '__imAnalysisEvents',
      analysisEdu: '__imAnalysisEdu',
    };

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

    /* ⚠ EVERY SPECIFIER HERE IS A LITERAL — see gate 1 in the header. Rewriting this as a table keyed by
       name would pass `node --check`, pass the browser, and fail static-checks with "exists but nothing
       imports it" for every one of these files at once. */
    function fetchModule(name) {
      switch (name) {
        case 'flightSim': return import('./flight-sim.js');
        case 'playground': return import('./playground.js');
        case 'seismic': return import('./seismic.js');
        case 'tsunami': return import('./tsunami.js');
        case 'terrainWater': return import('./terrain-water.js');
        case 'los': return import('./viewshed.js');
        case 'streetView': return import('./street-view.js');
        case 'nightSky': return import('./night-sky.js');
        case 'atlasConsole': return import('./atlas-console.js');
        case 'routeUi': return import('./routing-ui.js');
        case 'dataCenters': return import('./datacenters.js');
        case 'aircraftDetail': return import('./aircraft-detail.js');
        case 'volume3d': return import('./volume3d.js');
        case 'statsCompare': return import('./stats-compare.js');
        case 'satellitesLive': return import('./satellites-live.js');
        case 'satelliteDetail': return import('./satellite-detail.js');
        case 'analysisTimeSeries': return import('./analysis-timeseries.js');
        case 'analysisResearch': return import('./analysis-research.js');
        case 'analysisCorrelate': return import('./analysis-correlate.js');
        case 'analysisEvents': return import('./analysis-world-events.js');
        case 'analysisEdu': return import('./analysis-edu.js');
        default: return Promise.reject(new Error('no such lazy module: ' + name));
      }
    }

    /* Run the factory at the point js/app-body.js used to run it, with the same host object. The
       two assignments mirror what app-body did with the return value; the modules that publish
       themselves from inside their own factory (or, for night-sky, at import) need no assignment.
       ⚠ These literal `window.IntMapModules.x(` strings are what gate 2 reads. */
    function mount(name) {
      const M = window.IntMapModules;
      switch (name) {
        case 'flightSim': window.IntMapFlightSim=window.IntMapModules.flightSim(IM_HOST); return true;
        case 'playground': window.IntMapModules.playground(IM_HOST); return true;
        case 'seismic': window.IntMapModules.seismic(IM_HOST); return true;
        case 'tsunami': window.IntMapModules.tsunami(IM_HOST); return true;
        case 'terrainWater': window.IntMapModules.terrainWater(IM_HOST); return true;
        case 'los': window.IntMapModules.los(IM_HOST); return true;
        case 'streetView': window.IntMapStreetView=window.IntMapModules.streetView(IM_HOST); return true;
        case 'nightSky': return !!window.IntMapNightSky;    /* publishes itself at import time */
        case 'atlasConsole': window.IntMapConsole=window.IntMapModules.atlasConsole(IM_HOST); return true;
        case 'routeUi': window.IntMapRouteUI=window.IntMapModules.routeUi(IM_HOST); return true;
        case 'dataCenters': window.IntMapModules.dataCenters(IM_HOST); return true;
        case 'aircraftDetail': window.IntMapAircraftPanel=window.IntMapModules.aircraftDetail(IM_HOST); return true;
        case 'volume3d': window.IntMapVolume3D=window.IntMapModules.volume3d(IM_HOST); return true;
        case 'statsCompare': window.IntMapStatsCompare=window.IntMapModules.statsCompare(IM_HOST); return true;
        case 'satellitesLive': window.IntMapModules.satellitesLive(IM_HOST); return true;
        case 'satelliteDetail': window.IntMapModules.satelliteDetail(IM_HOST); return true;
        case 'analysisTimeSeries': window.IntMapModules.analysisTimeSeries(IM_HOST); return true;
        case 'analysisResearch': window.IntMapModules.analysisResearch(IM_HOST); return true;
        case 'analysisCorrelate': window.IntMapModules.analysisCorrelate(IM_HOST); return true;
        case 'analysisEvents': window.IntMapModules.analysisEvents(IM_HOST); return true;
        case 'analysisEdu': window.IntMapModules.analysisEdu(IM_HOST); return true;
        default: return !!M;
      }
    }

    function need(name) {
      if (P[name]) return P[name];
      const deps = (ALSO[name] || []).map(need);
      P[name] = Promise.all(deps)
        .then(() => fetchModule(name))
        .then(() => {
          /* The factory must have arrived with the file. If it did not, the file loaded but did not
             register — say so rather than throwing an undefined-is-not-a-function further down. */
          if (name !== 'nightSky' && !(window.IntMapModules && typeof window.IntMapModules[name] === 'function')) {
            record(name, 'the file loaded but registered no IntMapModules.' + name + ' factory');
            return false;
          }
          let mounted = false;
          try { mounted = mount(name); } catch (e) { record(name, 'its factory threw: ' + (e && e.message)); return false; }
          const g = PUBLISHES[name];
          if (mounted && g && typeof window[g] === 'undefined') { record(name, 'nothing was published on window.' + g); return false; }
          if (mounted) ok(name);
          return mounted;
        })
        .catch((e) => { record(name, 'could not be downloaded (' + (e && e.message) + ')'); return false; });
      return P[name];
    }

    /* Was it already asked for? Lets a caller that only READS state skip the fetch — an Atlas
       "close everything" sweep should not download a simulator in order to close it. */
    function ready(name) { return !!P[name] && typeof window[PUBLISHES[name]] !== 'undefined'; }

    /* The user is hovering the item / has opened the panel that leads here. Same promise as need(),
       started early; nothing waits on it. */
    function hint(name) { try { need(name); } catch (_) { } }

    const API = {
      need, ready, hint,
      names: () => Object.keys(PUBLISHES), publishes: (n) => PUBLISHES[n] || '',   /* (#R320) …and WHAT each one will be called once it arrives. js/atlas-controls.js walked Object.keys(window) to tell the planner which subsystems exist, so a module not yet fetched was a subsystem IntMap did not have — eight of them. This manifest exists from boot, so the name can be offered before the code is. */
      pending: () => Object.keys(P),
      /* what the boot guard would have said, for the modules it can no longer see at boot */
      check: () => window.__imLazyCheck || { loaded: [], failed: [] },
    };
    try { window.IntMapLazy = API; } catch (_) { }
    try { window.__imLazyCheck = window.__imLazyCheck || { loaded: [], failed: [] }; } catch (_) { }
    return API;
  })();
}
