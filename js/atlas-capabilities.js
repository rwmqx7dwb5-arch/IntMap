/* ============================================================================
 *  IntMap · THE CAPABILITY REGISTRY  (#R318)   window.IntMapCapabilities
 * ----------------------------------------------------------------------------
 *  「Atlas用カタログ、IntMapOS、dispatch、UI操作、テストで別々の能力一覧を持つのをやめ、
 *    一つのCapability Registryを正本にしてください。」
 *
 *  Before this file there were FIVE lists of what IntMap can do, and no two of them agreed:
 *
 *    1. the dispatch switch in js/atlas-console.js          — 115 case groups, 263 spellings
 *    2. the prompt catalogue inside `function SYS()`        — 38 topical blocks, 58 kB of text
 *    3. `ATLAS_ACTION_CAPABILITIES`                         — FOUR entries, out of 115
 *    4. `IntMapOS.list()`                                   — the commands that happened to be inverted
 *    5. `controlCatalog()` / `moduleCatalog()`              — whatever the DOM held, first 140 of it
 *
 *  Every recurring Atlas defect in the diary is a disagreement between two of those lists. #R278's
 *  「その機能は実行できません」 was (1) without (2). #R115's radius-instead-of-isochrone was (2)
 *  without the capability. The 140-item slice in js/atlas-controls.js decides in DOM ORDER which
 *  controls exist at all. A list that a human must remember to update is a list that will be wrong.
 *
 *  So: ONE registry, and everything else is DERIVED from it —
 *      · the planner's catalogue text          → catalogText()   (js/atlas-catalog-text.js)
 *      · `SYS()`'s action section              → the same call
 *      · the audit gate                        → toJSON(), read by scripts/atlas-capability-audit.mjs
 *      · what `IntMapOS.execute()` will run    → resolve()
 *      · what the UI button and Atlas both hit → the same capability id
 *
 *  ⚠ WHAT THIS FILE IS *NOT*: a second hand-written catalogue. The 58 kB of planner documentation
 *  did not get retyped — js/atlas-catalog-text.js holds the SYS blocks VERBATIM, and this file
 *  names which capability each block documents. Retyping them would have created exactly the
 *  duplicate-source-of-truth this round exists to remove.
 *
 *  ⚠ WHY THE TEXT IS IN A SIBLING FILE. js/atlas-console.js is loaded ON DEMAND (#R224: it is
 *  658 kB of the boot bundle and mobile browsers were dying on it). The DESCRIPTORS have to be
 *  eager — IntMapOS.execute() and the UI need them before Atlas exists, and §10 requires a
 *  capability to be discoverable BEFORE its module loads. The 58 kB of prompt prose does not: only
 *  the planner reads it. So the metadata is here, in the boot bundle, and the prose is imported by
 *  js/atlas-console.js, in the Atlas chunk. Moving the prose here would put 58 kB back on the boot
 *  path and undo #R224 for no gain.
 *
 *  ⚠ NO ARBITRARY EXECUTION. There is no eval, no "call this method name", no dynamic capability.
 *  Atlas's reach is WIDE — every row below — and it is CLOSED: what is not in the table cannot run.
 * ==========================================================================*/
/* ══ installCapabilityKernel(OS, HOST, deps) — WHAT IS EAGER, AND WHAT IS NOT ══════════════════
   §3 and §10 of this round's commission require ONE thing before a module loads: that a capability
   be DISCOVERABLE. That is this file — 115 descriptors, their observers, and the relevance search.
   Nothing else has to be here. The executor, the result shape and the state ledger are only reached
   when something actually RUNS a capability, and by then either Atlas is being fetched or a button
   has been pressed — so they are fetched then, not at boot.
   ⚠ THE SPLIT IS NOT COSMETIC, IT WAS MEASURED. #R311 put a startup budget on the eager bundle
   (scripts/perf-budget.mjs) and mounting the whole kernel eagerly cost +18.9 kB brotli on a page a
   reader may never ask a question on. #R224 made js/atlas-console.js load on demand for the same
   reason. Discoverability is the requirement; carrying the machinery is not.
   ⚠ AND `execute()` STILL EXISTS FROM BOOT. It returns a Promise — it always did — so the fetch
   hides inside the await a caller was already doing. What a caller can never observe is a
   capability that is missing because its code has not arrived. */
export function installCapabilityKernel(OS, HOST, deps) {
  deps = deps || {};
  var caps = makeAtlasCapabilities(HOST);
  var kernelP = null;
  OS.capabilities = function () { return caps; };
  OS.kernel = function () {
    if (!kernelP) {
      kernelP = import('./atlas-executor.js')
        .then(function (m) { return m.installAtlasKernel(OS, HOST, Object.assign({ capabilities: caps }, deps)); });
    }
    return kernelP;
  };
  OS.execute = function (capabilityId, args, opts) {
    return OS.kernel().then(function (k) { return k.exec.execute(capabilityId, args, opts); });
  };
  /* Everything below answers WITHOUT fetching when nothing has run yet, because "nothing has run"
     is a true and cheap answer — a boot-time reader must not pay for a subsystem to be told it is
     idle. Once the kernel is up, installAtlasKernel replaces each of these with the real one. */
  OS.snapshot = function (o) { return kernelP ? null : null; };
  OS.registerStateProvider = function (name, fn) {
    /* a provider that arrives before the ledger does is remembered, not dropped */
    (OS._pendingProviders || (OS._pendingProviders = [])).push([name, fn]);
    return true;
  };
  OS.cancel = function () { return false; };
  OS.supersede = function () { return 0; };
  return caps;
}

export function makeAtlasCapabilities(HOST) {
  return (function () {
    var API = {};

    /* ══ THE TABLE ═══════════════════════════════════════════════════════════════════════════════
       One row per capability. Columns:
         0 id          canonical, language-independent, stable. The planner, the audit, the UI and
                       the tests all name a capability by THIS, never by a spelling.
         1 legacy      the `a.type` js/atlas-console.js's dispatch still answers to. '' = none.
         2 aliases     every OTHER spelling the dispatch accepts, comma-separated.
         3 category    for grouping in the catalogue and for relevance search.
         4 observer    which observer/verifier pair watches it (see OBSERVERS below).
         5 writes      effects.writes — also the conflictKeys, which serialise overlapping ops.
         6 produces    what a completed run puts in front of the user.
         7 risk        'read' | 'session' (reversible within the session) | 'persist' | 'external'
         8 confirm     'none' | 'explicit' (only when Atlas proposes it itself) | 'always'
         9 target      required input kind: '' | 'place' | 'point' | 'area' | 'points' | 'country'
                       | 'layer' | 'metric' | 'text'.  A trailing '?' means optional.
        10 lazy        IntMapLazy module ids this needs AT EXECUTION (never at planning).
       ⚠ COLUMN 9 IS THE #R302 REGRESSION CONDITION. A capability whose target is required and whose
       arguments do not carry one answers `needs_input` — it does NOT quietly take the map centre. */
    var T = [
      /* id                          legacy            aliases                                                        cat        obs        writes                    produces               risk       confirm   target      lazy */
      ['map.clearHighlights',        'reset',          '',                                                            'map',     'paint',   'map.highlight',          'map',                 'session', 'none',   '',         ''],
      ['layers.toggle',              'layer',          '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
      ['layers.opacity',             'opacity',        '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
      ['view.projection',            'projection',     '',                                                            'view',    'camera',  'camera',                 'map',                 'session', 'none',   '',         ''],
      ['view.basemap',               'base',           '',                                                            'view',    'layer',   'map.basemap',            'map',                 'session', 'none',   '',         ''],
      ['panel.compare',              'compare',        '',                                                            'panel',   'panel',   'panel.compare',          'panel',               'session', 'none',   '',         ''],
      ['view.flyTo',                 'flyTo',          '',                                                            'view',    'camera',  'camera',                 'camera,map',          'session', 'none',   'place',    ''],
      ['data.weather',               'weather',        '',                                                            'data',    'panel',   'panel.weather',          'panel,explanation',   'read',    'none',   'place',    ''],
      ['research.brief',             'brief',          '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'place?',   ''],
      ['research.askHere',           'askHere',        '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'point',    ''],
      ['data.rank',                  'rank',           '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
      ['data.ratio',                 'ratio',          '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
      ['data.relate',                'relate',         '',                                                            'data',    'paint',   'map.choropleth',         'map,explanation',     'session', 'none',   'metric',   ''],
      ['map.choropleth',             'mapMetric',      'choropleth',                                                  'map',     'paint',   'map.choropleth',         'map',                 'session', 'none',   'metric',   ''],
      ['settings.theme',             'theme',          '',                                                            'settings','setting', 'settings.theme',         'setting',             'persist', 'explicit','',        ''],
      ['settings.accent',            'accent',         'accentColor,accentColour',                                    'settings','setting', 'settings.accent',        'setting',             'persist', 'explicit','',        ''],
      ['settings.language',          'language',       '',                                                            'settings','setting', 'settings.language',      'setting',             'persist', 'explicit','',        ''],
      ['view.terrain3d',             'terrain3d',      '',                                                            'view',    'layer',   'map.terrain',            'map',                 'session', 'none',   '',         ''],
      ['view.grid',                  'grid',           '',                                                            'view',    'layer',   'map.grid',               'map',                 'session', 'none',   '',         ''],
      ['view.resetNorth',            'resetNorth',     'resetView',                                                   'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
      ['view.zoom',                  'zoom',           '',                                                            'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
      ['view.bearing',               'bearing',        'rotate',                                                      'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
      ['view.pitch',                 'pitch',          'tilt',                                                        'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
      ['view.pan',                   'pan',            'move',                                                        'view',    'camera',  'camera',                 'camera',              'session', 'none',   '',         ''],
      ['panel.tab',                  'tab',            '',                                                            'panel',   'panel',   'panel.tab',              'panel',               'session', 'none',   '',         ''],
      ['layers.countryInfo',         'countryInfo',    '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['data.countryCard',           'selectCountry',  'country',                                                     'data',    'panel',   'panel.country',          'panel',               'session', 'none',   'country',  ''],
      ['data.timeSeries',            'timeSeries',     'timeseries',                                                  'data',    'panel',   'panel.timeseries',       'panel',               'session', 'none',   'country',  ''],
      ['map.isolateCountry',         'isolate',        '',                                                            'map',     'paint',   'map.isolate',            'map',                 'session', 'none',   'country',  ''],
      ['sim.lineOfSight',            'los',            'lineOfSight',                                                 'sim',     'sim',     'map.los',                'map',                 'session', 'none',   'place',    'los'],
      ['data.populationIn',          'population',     'populationIn,popIn',                                          'data',    'none',    '',                       'explanation',         'read',    'none',   'area',     ''],
      ['data.satelliteCompare',      'satelliteCompare','satCompare,satChange',                                       'data',    'panelPaint','panel.satcompare',     'panel,map',           'session', 'none',   'place',    ''],
      ['data.layerValues',           'layerData',      'layerValue,layerQuery',                                       'data',    'none',    '',                       'explanation',         'read',    'none',   'point',    ''],
      ['map.object',                 'object',         'mapObject',                                                   'map',     'object',  'map.object',             'object',              'session', 'explicit','',        ''],
      ['routing.isochrone',          'isochrone',      'reach,reachability,reachable,catchment',                      'routing', 'paint',   'map.isochrone',          'map',                 'session', 'none',   'place',    'routing'],
      ['routing.setEndpoints',       'route',          '',                                                            'routing', 'route',   'map.route',              'panel',               'session', 'none',   'place',    'routing'],
      ['routing.optimizeStops',      'optimizeRoute',  'tsp,multiStop,optimize,optimizeStops',                        'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'points',   'routing'],
      ['routing.route',              'directions',     'roadRoute,navigate,drivingRoute,walkingRoute,transitRoute',   'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'place',    'routing'],
      ['panel.streetView',           'streetview',     'streetView,pano',                                             'panel',   'panel',   'panel.streetview',       'panel',               'session', 'none',   'point',    'streetView'],
      ['sim.radiation',              'radiation',      'fallout,dispersion,plume,radiationSim',                       'sim',     'sim',     'map.radiation',          'map',                 'session', 'none',   'place',    ''],
      ['sim.flightSim',              'flightSim',      'flightsim,flightsimulator,flysim,pilot',                      'sim',     'sim',     'camera,map.flightsim',   'map,camera',          'session', 'none',   'place?',   'flightSim'],
      ['data.runways',               'runway',         'airports',                                                    'data',    'panel',   'panel.runway',           'panel',               'read',    'none',   'place',    ''],
      ['panel.education',            'edu',            'learn',                                                       'panel',   'panel',   'panel.edu',              'panel',               'session', 'none',   '',         ''],
      ['panel.ecmwf',                'ecmwf',          'weatherLayers',                                               'panel',   'panel',   'panel.ecmwf',            'panel',               'session', 'none',   '',         ''],
      ['panel.widgets',              'widgets',        '',                                                            'panel',   'panel',   'panel.widgets',          'panel',               'session', 'none',   '',         ''],
      ['panel.screenshot',           'screenshot',     '',                                                            'panel',   'panel',   'panel.screenshot',       'panel,file',          'session', 'none',   '',         ''],
      ['panel.share',                'share',          '',                                                            'panel',   'panel',   'panel.share',            'panel',               'session', 'none',   '',         ''],
      ['panel.search',               'search',         '',                                                            'panel',   'panel',   'panel.search',           'panel',               'session', 'none',   'text',     ''],
      ['settings.tempUnit',          'tempUnit',       '',                                                            'settings','setting', 'settings.units',         'setting',             'persist', 'explicit','',        ''],
      ['settings.units',             'units',          '',                                                            'settings','setting', 'settings.units',         'setting',             'persist', 'explicit','',        ''],
      ['time.travel',                'timeTravel',     'setTime,timeSet',                                             'time',    'time',    'time',                   'map,time',            'session', 'none',   '',         ''],
      ['map.pin',                    'pin',            '',                                                            'map',     'object',  'map.object',             'object,map',          'session', 'none',   'place',    ''],
      ['map.tool',                   'tool',           '',                                                            'map',     'panel',   'map.tool',               'panel',               'session', 'none',   '',         ''],
      ['map.radius',                 'radius',         '',                                                            'map',     'object',  'map.object',             'object,map',          'session', 'none',   'place',    ''],
      ['map.volume3d',               'volume3d',       'volume',                                                      'map',     'object',  'map.object',             'object,map',          'session', 'none',   'place',    ''],
      ['routing.drone',              'drone',          '',                                                            'routing', 'route',   'map.drone',              'route,map,panel',     'session', 'none',   '',         ''],
      /* ⚠ `measure` ARMS the tool; the line appears when the USER clicks. Declaring 'map' here made
         the verifier promise a drawing that correctly is not there yet (§6's panel rule). */
      ['map.measure',                'measure',        '',                                                            'map',     'panel',   'map.tool',               'panel',               'session', 'none',   '',         ''],
      ['panel.correlate',            'correlate',      '',                                                            'panel',   'panel',   'panel.correlate',        'panel',               'session', 'none',   '',         ''],
      ['panel.settings',             'settings',       '',                                                            'panel',   'panel',   'panel.settings',         'panel',               'session', 'none',   '',         ''],
      ['panel.workspace',            'workspace',      'windows,windowMode,windowWorkspace',                          'panel',   'panel',   'panel.workspace',        'panel',               'session', 'none',   '',         ''],
      ['panel.shortcuts',            'shortcuts',      'keyboard,hotkeys',                                            'panel',   'panel',   'panel.shortcuts',        'panel',               'session', 'none',   '',         ''],
      ['map.objectList',             'objects',        'objectList,manageObjects,listObjects,myObjects',              'map',     'panel',   'panel.objects',          'panel',               'session', 'none',   '',         ''],
      ['sim.slopeAspect',            'slope',          'aspect,terrainAnalysis,steepness,gradient',                   'sim',     'layer',   'map.terrainAnalysis',    'map',                 'session', 'none',   '',         ''],
      ['sim.rfCoverage',             'rfCoverage',     'coverage,radioCoverage,signalCoverage,reception,viewshed',    'sim',     'sim',     'map.coverage',           'map',                 'session', 'none',   'point',    'los'],
      ['sim.sunPosition',            'sun',            'shadow,shadows,sunlight,sunPosition,daylight,insolation',     'sim',     'sim',     'map.sun',                'map',                 'session', 'none',   'point',    ''],
      ['sim.terrainWater',           'terrainWater',   'waterFlow,terrainEdit,watershedSim,sculpt',                   'sim',     'sim',     'map.terrainWater',       'map',                 'session', 'none',   'point',    'terrainWater'],
      ['sim.earthquake',             'earthquake',     'seismic,quakeSim,seismicWaves,earthquakeSim',                 'sim',     'sim',     'map.seismic',            'map',                 'session', 'none',   'point',    'seismic'],
      ['sim.sunHours',               'sunHours',       'shadeHours,terrainShadow,solarHours,insolationYear',          'sim',     'sim',     'map.sunhours',           'map',                 'session', 'none',   'point',    ''],
      ['sim.nightSky',               'nightSky',       'starsFromHere,skyFromHere,stargazing,standHere,skyStanding',  'sim',     'sim',     'map.nightsky',           'map',                 'session', 'none',   'point',    'nightSky'],
      ['sim.space',                  'space',          'solarSystem,planet,planets,explore Space',                    'sim',     'sim',     'map.space',              'map',                 'session', 'none',   '',         ''],
      ['sim.tsunami',                'tsunami',        'tsunamiSim,tsunamiPropagation',                               'sim',     'sim',     'map.tsunami',            'map',                 'session', 'none',   'point',    'tsunami'],
      ['system.diagnose',            'diagnose',       'health,selfCheck,systemStatus,status',                        'system',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
      ['map.clearAll',               'clearAll',       '',                                                            'map',     'paint',   'map.all',                'map',                 'session', 'explicit','',        ''],
      ['map.outline',                'outline',        'extent,showExtent',                                           'map',     'paint',   'map.highlight',          'object,map',          'session', 'none',   'place',    ''],
      ['panel.playground',           'playground',     'game',                                                        'panel',   'panel',   'panel.playground',       'panel',               'session', 'none',   '',         'playground'],
      ['panel.news',                 'news',           '',                                                            'panel',   'panel',   'panel.news',             'panel',               'session', 'none',   '',         ''],
      ['panel.account',              'account',        'login',                                                       'panel',   'panel',   'panel.account',          'panel',               'session', 'none',   '',         ''],
      ['panel.donate',               'donate',         '',                                                            'panel',   'panel',   'panel.donate',           'panel',               'session', 'none',   '',         ''],
      ['panel.feedback',             'feedback',       '',                                                            'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
      ['panel.bugReport',            'bugReport',      'bug',                                                         'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
      ['map.highlight',              'highlight',      '',                                                            'map',     'paint',   'map.highlight',          'map',                 'session', 'none',   '',         ''],
      ['data.value',                 'value',          'stat,lookup',                                                 'data',    'none',    '',                       'explanation',         'read',    'none',   'country',  ''],
      ['layers.allOff',              'layersOff',      'allLayersOff',                                                'layers',  'layer',   'map.layer',              'map',                 'session', 'explicit','',        ''],
      ['map.clear',                  'clear',          '',                                                            'map',     'paint',   'map.all',                'map',                 'session', 'none',   '',         ''],
      ['view.fullscreen',            'fullscreen',     '',                                                            'view',    'none',    'view.fullscreen',        'view',                'session', 'none',   '',         ''],
      ['view.locate',                'locate',         'myLocation,whereAmI',                                         'view',    'camera',  'camera',                 'camera,map',          'session', 'none',   '',         ''],
      ['map.poi',                    'poi',            'mapPois,facilities',                                          'map',     'paint',   'map.poi',                'map',                 'session', 'none',   'place?',   ''],
      ['research.mapReport',         'mapReport',      'newsMap,reportMap',                                           'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
      ['research.situationMap',      'researchMap',    'research_map,situationMap',                                   'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
      ['sim.ballistic',              'missile',        'ballistic,ballisticMissile,strike,icbm',                      'sim',     'sim',     'map.ballistic',          'map',                 'session', 'none',   'place',    ''],
      ['map.elevationHighlight',     'elevationBelow', 'belowSeaLevel,elevationHighlight,elevationScan',              'map',     'paint',   'map.elevation',          'map',                 'session', 'none',   'place',    ''],
      ['research.historicalMap',     'historicalMap',  'historical,powerMap,allianceMap',                             'research','paint',   'map.factions',           'map,explanation',     'session', 'none',   '',         ''],
      ['sim.flyAnimate',             'fly',            'flight,trajectory',                                           'sim',     'sim',     'camera,map.fly',         'camera,map',          'session', 'none',   'place',    ''],
      ['map.drawLine',               'drawLine',       'line',                                                        'map',     'paint',   'map.line',               'object,map',          'session', 'none',   'points',   ''],
      ['map.drawPolygon',            'drawPolygon',    'polygon',                                                     'map',     'paint',   'map.polygon',            'object,map',          'session', 'none',   'points',   ''],
      ['ui.inlineControls',          'controls',       '',                                                            'ui',      'none',    '',                       'panel',               'session', 'none',   '',         ''],
      ['dialog.ask',                 'ask',            'choose,clarify,options',                                      'dialog',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
      ['research.analyze',           'analyze',        'research,synthesize',                                         'research','none',    '',                       'explanation',         'read',    'none',   '',         ''],
      ['settings.engine',            'engine',         '',                                                            'settings','setting', 'settings.engine',        'setting',             'persist', 'explicit','',        ''],
      ['settings.tiltLimit',         'tiltLimit',      '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
      ['settings.eyeAltitude',       'eyeAltitude',    '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
      /* (#R313) the animated streaks inside the Wind layer, on their own switch — the colour
         raster and the particles come from one forecast field and are toggled separately. */
      ['layers.windParticles',       'windParticles',  'windAnimation',                                               'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['layers.nightSide',           'nightSide',      '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['layers.planeAltitude',       'planeAltitude',  'aircraftAltitude',                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['layers.aircraftTrack',       'aircraftTrack',  'planeTrack',                                                  'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['layers.satellites',          'satellites',     'satellite,sats,orbit',                                        'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   '',         ''],
      ['panel.ticker',               'ticker',         '',                                                            'panel',   'panel',   'panel.ticker',           'panel',               'session', 'none',   '',         ''],
      ['data.compareStats',          'compareStats',   'compareCountries,statsCompare',                               'data',    'panel',   'panel.compare',          'panel',               'session', 'none',   'country',  ''],
      ['map.scoreMap',               'scoreMap',       'customLayer,evaluate',                                        'map',     'paint',   'map.choropleth',         'map',                 'session', 'none',   '',         ''],
      ['data.exploreRelated',        'explore',        'findRelated,relatedMetrics',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   'metric',   ''],
      ['research.impact',            'impact',         'impactAnalysis,nearbyCritical',                               'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   ''],
      ['research.events',            'events',         'newsEvents,groupNews',                                        'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   ''],
      ['system.module',              'module',         '',                                                            'system',  'panel',   'panel.any',              'panel',               'session', 'none',   '',         ''],
      ['system.monitor',             'monitor',        '',                                                            'system',  'none',    '',                       '',                    'read',    'none',   '',         ''],
      ['system.control',             'control',        '',                                                            'system',  'control', 'ui.any',                 'panel',               'session', 'none',   '',         ''],
      ['dialog.answer',              'answer',         '',                                                            'dialog',  'none',    '',                       'explanation',         'read',    'none',   '',         '']
    ];

    /* Capabilities that are DELIBERATELY not offered to the planner, with the reason and the proof.
       ⚠ THE ENTRY IS THE ONLY WAY TO BE ABSENT. The audit fails on anything else that is missing. */
    var WITHDRAWN = {
      'system.monitor': {
        why: '#R231 withdrew area monitors 「一旦撤去」 — the dispatch case exists only to answer FEATURE_WITHDRAWN, and docs/AREA-MONITORS.md is the record of the design that is waiting',
        proofCode: 'FEATURE_WITHDRAWN'
      }
    };
    /* Capabilities documented by the ALWAYS-SENT rules text rather than by a catalogue block.
       `ask` is the clarification action, and it is described where the rule about WHEN to clarify
       is (the PRECISION vs AMBIGUITY paragraph) — separating the two would be worse prompt. The
       value is the literal the audit looks for, so this cannot become a claim nobody checks. */
    var RULE_DOCUMENTED = { 'dialog.ask': '{"type":"ask"' };

    /* Capabilities the planner may reach but that are not user-facing FEATURES: they exist so that
       anything not otherwise modelled is still reachable. Kept out of relevance search's front rank
       so they cannot crowd out a real capability (§14: the fallback is a fallback). */
    var FALLBACKS = { 'system.control': 1, 'system.module': 1, 'ui.inlineControls': 1, 'dialog.answer': 1, 'dialog.ask': 1 };

    /* Non-equivalent substitutions the planner has actually made, recorded so it cannot make them
       again. #R115: 「徒歩1時間で行ける範囲」 became a radius circle, because a circle was in the
       catalogue and an isochrone was not. Both are in it now; this says they are not the same thing. */
    var FORBIDDEN_SUBSTITUTES = {
      'routing.isochrone': ['map.radius'],
      'map.radius': ['routing.isochrone'],
      'routing.route': ['sim.flyAnimate', 'map.drawLine'],
      'research.mapReport': ['research.historicalMap'],
      'research.historicalMap': ['research.mapReport'],
      'sim.ballistic': ['sim.flyAnimate'],
      'sim.tsunami': ['sim.earthquake']
    };
    /* Genuinely interchangeable pairs — the ONLY substitutions repair is allowed to make. */
    var EQUIVALENTS = {
      'research.mapReport': ['research.situationMap'],
      'research.situationMap': ['research.mapReport'],
      'data.countryCard': ['data.timeSeries']
    };

    /* ══ OBSERVERS ═══════════════════════════════════════════════════════════════════════════════
       「すべての副作用付きCapabilityは、`observe()`と`verify()`を持たなければ登録できない。」
       An observer reads REAL app state and returns a comparable object. A verifier turns the
       before/after pair plus the raw return into one of the seven statuses. They are shared by
       KIND, because "did a layer actually paint" is one question however many layers ask it.
       ⚠ EVERY ONE OF THESE READS THE APP, NOT THE CALL. That is the whole point of the file. */
    function GE() { try { return window.IntMapGeoEngine; } catch (_) { return null; } }
    function hasRenderer() { try { return !!(GE() && GE().hasRenderer()); } catch (_) { return false; } }
    function visibleLayerIds() {
      var out = [];
      try {
        var st = GE().layers.list ? GE().layers.list() : null;
        (st || []).forEach(function (id) { try { if (GE().layers.getLayout(id, 'visibility') !== 'none') out.push(id); } catch (_) { } });
      } catch (_) { }
      return out;
    }
    function sourceFeatureCount(src) {
      try { var d = GE().layers.sourceData(src); return (d && Array.isArray(d.features)) ? d.features.length : -1; } catch (_) { return -1; }
    }
    function cameraNow() {
      try {
        var c = GE().camera.getCenter();
        return { lng: +(+c[0]).toFixed(5), lat: +(+c[1]).toFixed(5), zoom: +(+GE().camera.getZoom()).toFixed(3),
          bearing: +(+GE().camera.getBearing()).toFixed(2), pitch: +(+GE().camera.getPitch()).toFixed(2) };
      } catch (_) { return null; }
    }
    function openPanelIds() {
      var out = [];
      try {
        document.querySelectorAll('.panel, .im-panel, .widget, [data-panel]').forEach(function (el) {
          if (!el.id) return;
          var cs = null; try { cs = getComputedStyle(el); } catch (_) { }
          if (cs && cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null) out.push(el.id);
        });
      } catch (_) { }
      return out.sort();
    }
    function objectIds() {
      try {
        var O = window.IntMapObjects;
        if (!O || !O.list) return [];
        return (O.list() || []).map(function (o) { return String(o && (o.id != null ? o.id : o)); });
      } catch (_) { return []; }
    }
    /* ⚠ THE THREE QUESTIONS ARE ALREADY SEPARATE IN js/routing.js AND THAT IS THE POINT.
       `hasRoute()` = a result exists. `painted()` = its layers are on the map. `visible()` = they are
       actually being shown. The dispatch case collapsed all three into one ok:true, which is how a
       route could be "计算済み" and invisible at the same time. Reading all three keeps them apart. */
    function routingNow() {
      try {
        var R = window.IntMapRouting;
        if (!R) return null;
        var sum = null; try { sum = R.summary ? R.summary() : null; } catch (_) { }
        return {
          hasRoute: !!(R.hasRoute && R.hasRoute()),
          painted: !!(R.painted && R.painted()),
          visible: !!(R.visible && R.visible()),
          alt: (sum && (sum.altIndex != null ? sum.altIndex : sum.selected)) != null
            ? (sum.altIndex != null ? sum.altIndex : sum.selected) : null,
          panel: (function () { try { return !!(window.IntMapRouteUI && window.IntMapRouteUI.isOpen && window.IntMapRouteUI.isOpen()); } catch (_) { return false; } })()
        };
      } catch (_) { return null; }
    }
    function settingsNow() {
      try {
        return { theme: HOST && HOST.userTheme, accent: HOST && HOST.accent, lang: HOST && HOST.lang,
          units: HOST && HOST.units, tempUnit: HOST && HOST.tempUnit };
      } catch (_) { return null; }
    }
    function timeNow() {
      try { var T = window.IntMapTime; return T && T.get ? T.get() : null; } catch (_) { return null; }
    }
    /* the Atlas-drawn canvases: how many features each holds right now */
    function paintNow() {
      return { poly: sourceFeatureCount('nlq-poly-src'), line: sourceFeatureCount('nlq-line-src'),
        pins: sourceFeatureCount('nlq-pin-src'), poi: sourceFeatureCount('atl-poi-src'),
        visible: visibleLayerIds().length, objects: objectIds().length };
    }

    function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
    /* legacy(raw) — what a not-yet-migrated dispatch case said about itself. A verifier may use it,
       but it may never be the ONLY evidence for `completed` on a capability that writes something. */
    function legacyOk(raw) { return !!(raw && raw.ok !== false); }
    function legacyCode(raw) { return (raw && raw.meta && raw.meta.code) || ''; }

    var OBSERVERS = {
      none: {
        observe: function () { return null; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          return { status: 'completed', code: legacyCode(raw) || 'ok', html: (raw && raw.html) || '' };
        }
      },
      camera: {
        observe: function () { return cameraNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (!hasRenderer()) return { status: 'failed', code: 'unavailable', html: (raw && raw.html) || '' };
          if (!before || !after) return { status: 'partial', code: 'no_change', html: (raw && raw.html) || '' };
          /* a camera op that asked for no movement (a re-assert) is complete when nothing moved;
             one that asked for movement is complete only when the camera really is somewhere else. */
          var wantsMove = !!(args && (args.place || args.lng != null || args.to != null || args.delta != null ||
            args.deg != null || args.dir != null || args.direction != null || args.zoom != null || args.toward));
          if (wantsMove && !changed(before, after)) return { status: 'partial', code: 'no_change', html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: { camera: after }, html: (raw && raw.html) || '' };
        }
      },
      layer: {
        observe: function () { return { visible: visibleLayerIds(), n: visibleLayerIds().length }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          /* #R73's real question, kept: the dispatch case already polls the style for a delta and
             flags `meta.unverified` when nothing painted. Honour that flag rather than re-deriving. */
          if (raw && raw.meta && raw.meta.unverified) return { status: 'partial', code: 'no_change', html: raw.html || '' };
          if (raw && raw.meta && raw.meta.already) return { status: 'completed', code: 'ok', html: raw.html || '' };
          return { status: 'completed', code: 'ok', observed: { layers: after }, html: (raw && raw.html) || '' };
        }
      },
      paint: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (raw && raw.meta && raw.meta.partial) return { status: 'partial', code: 'not_rendered', html: raw.html || '', unresolved: (raw.exec && raw.exec.unresolved) || [] };
          /* a clear-shaped op is complete when the canvases came DOWN; a draw-shaped one when they
             went UP. Anything that moved is evidence; nothing moving is `not_rendered`. */
          if (!before || !after) return { status: 'completed', code: legacyCode(raw) || 'ok', html: (raw && raw.html) || '' };
          if (changed(before, after)) return { status: 'completed', code: 'ok', observed: { paint: after }, html: (raw && raw.html) || '' };
          return { status: 'partial', code: 'not_rendered', observed: { paint: after }, html: (raw && raw.html) || '' };
        }
      },
      panel: {
        observe: function () { return { open: openPanelIds() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          /* 「パネルを開いただけで、本来必要な入力や計算が未完了なら needs_input または running。」
             A panel capability that DECLARES a computation (produces includes something other than
             'panel') is not finished by the panel appearing. That case is handled by the capability's
             own verifier override; here, the panel itself is the deliverable. */
          if (!before || !after) return { status: 'completed', code: 'ok', html: (raw && raw.html) || '' };
          if (changed(before.open, after.open)) return { status: 'completed', code: 'ok', observed: { panels: after.open }, html: (raw && raw.html) || '' };
          /* it may have been open already — that is a completion, not a no-op failure */
          return { status: 'completed', code: 'ok', observed: { panels: after.open, already: true }, html: (raw && raw.html) || '' };
        }
      },
      route: {
        observe: function () { return routingNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (!after) return { status: 'failed', code: 'unavailable', html: (raw && raw.html) || '' };
          /* 「経路が計算された」と「地図に描かれた」を別々に観測する。 The module already separates
             them (hasRoute / painted / visible); the old dispatch collapsed all three into ok:true —
             and #R291 measured a route that was computed and never drawn. */
          if (!after.hasRoute) return { status: 'failed', code: 'no_route', html: (raw && raw.html) || '' };
          if (!after.painted) return { status: 'partial', code: 'not_rendered', observed: { routing: after }, html: (raw && raw.html) || '' };
          if (!after.visible) return { status: 'partial', code: 'not_visible', observed: { routing: after }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: { routing: after }, html: (raw && raw.html) || '' };
        }
      },
      object: {
        observe: function () { return { ids: objectIds() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          var made = [];
          try {
            var had = (before && before.ids) || [];
            made = ((after && after.ids) || []).filter(function (id) { return had.indexOf(id) < 0; });
          } catch (_) { }
          if (raw && raw.objectIds && raw.objectIds.length) made = raw.objectIds.slice();
          if (before && after && !changed(before.ids, after.ids) && !made.length) {
            /* a removal is a change too; only "nothing at all happened" is a non-event */
            return { status: 'partial', code: 'no_change', html: (raw && raw.html) || '' };
          }
          return { status: 'completed', code: 'ok', objectIds: made, observed: { objects: after }, html: (raw && raw.html) || '' };
        }
      },
      setting: {
        observe: function () { return settingsNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (before && after && !changed(before, after)) return { status: 'completed', code: 'ok', observed: { settings: after, already: true }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: { settings: after }, html: (raw && raw.html) || '' };
        }
      },
      time: {
        observe: function () { return timeNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          return { status: 'completed', code: 'ok', observed: { time: after }, html: (raw && raw.html) || '' };
        }
      },
      sim: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          /* A simulation that is still computing says so. `raw.running` is what a migrated executor
             sets; a legacy case cannot, so its absence is not evidence of completion — the canvas is. */
          if (raw && raw.running) return { status: 'running', code: 'running', progress: raw.progress || null, html: raw.html || '' };
          if (before && after && !changed(before, after)) return { status: 'partial', code: 'not_rendered', observed: { paint: after }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: { paint: after }, html: (raw && raw.html) || '' };
        }
      },
      /* Some capabilities deliver BOTH a window and a change to the map — the dated-satellite
         comparison is one: the imagery lands on the map and the window is how it is read. One
         observer that watches only panels would attest half of that and call it done. */
      panelPaint: {
        observe: function () { return { panels: openPanelIds(), paint: paintNow() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (!before || !after) return { status: 'completed', code: legacyCode(raw) || 'ok', html: (raw && raw.html) || '' };
          var panelMoved = changed(before.panels, after.panels);
          var mapMoved = changed(before.paint, after.paint);
          if (!panelMoved && !mapMoved) return { status: 'partial', code: 'no_change', html: (raw && raw.html) || '' };
          if (panelMoved && !mapMoved) return { status: 'partial', code: 'not_rendered', observed: { panels: after.panels }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: after, html: (raw && raw.html) || '' };
        }
      },
      control: {
        observe: function () { return { panels: openPanelIds(), paint: paintNow(), camera: cameraNow() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (raw && raw.meta && raw.meta.code === 'ambiguous_target') {
            return { status: 'needs_input', code: 'ambiguous_target', candidates: (raw.meta.candidates || []), html: raw.html || '' };
          }
          /* §14: 「`click()`後にpostconditionを検証する。対象操作にpostconditionが無ければ
             `completed`を返さない。」 The generic control fallback has no declared postcondition of
             its own, so the ONLY evidence available is that the app changed at all. */
          if (before && after && !changed(before, after)) return { status: 'partial', code: 'no_change', html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', html: (raw && raw.html) || '' };
        }
      }
    };
    API.OBSERVERS = OBSERVERS;

    /* ══ BUILD THE DESCRIPTORS ═══════════════════════════════════════════════════════════════════ */
    var byId = Object.create(null), byAlias = Object.create(null), order = [];
    var runtime = { dispatch: null, docs: null };

    /* bindRuntime — Atlas hands the kernel its dispatcher and its catalogue text when it loads.
       Nothing here calls into Atlas before that; a capability executed earlier answers `unavailable`
       with a reason, which is a true statement, not a silent failure. */
    API.bindRuntime = function (o) {
      if (!o) return;
      if (typeof o.dispatch === 'function') runtime.dispatch = o.dispatch;
      if (o.docs) runtime.docs = o.docs;
      if (o.resolvePlace) runtime.resolvePlace = o.resolvePlace;
      if (o.pinnedPoint) runtime.pinnedPoint = o.pinnedPoint;
      if (o.selection) runtime.selection = o.selection;
    };
    API.runtimeReady = function () { return !!runtime.dispatch; };
    API.docsReady = function () { return !!runtime.docs; };

    var CTXOBJ = null;
    API.context = function () {
      if (!CTXOBJ) CTXOBJ = { HOST: HOST, GE: GE, runtime: runtime, hasRenderer: hasRenderer };
      return CTXOBJ;
    };

    /* The legacy adapter. 「既存dispatch caseは当面互換アダプターとして残し、Registryのexecutorへ
       委譲させる。」 Both directions exist during the migration and BOTH go through this one door:
         · Atlas's planner calls execute(id) → here → the dispatch case (the engine work)
         · a UI button calls IntMapOS.execute(id) → here → the same case
       so there is exactly one path from either shell to the engine, and it is observed. */
    function legacyExecute(cap) {
      return function (ctx, args) {
        if (!runtime.dispatch) return Promise.resolve({ ok: false, meta: { code: 'unavailable' } });
        var a = Object.assign({}, args, { type: cap.legacy || cap.id });
        return runtime.dispatch(a);
      };
    }

    function targetPolicyOf(spec) {
      var kind = String(spec || '').replace(/\?$/, '');
      var optional = /\?$/.test(String(spec || ''));
      if (!kind) return { required: false, accepts: [], mapCenterAllowed: false, kind: '' };
      var accepts = { place: ['coordinates', 'place', 'selected-object', 'pinned-point'],
        point: ['coordinates', 'place', 'selected-object', 'pinned-point', 'map-click'],
        area: ['polygon', 'radius', 'selected-object', 'drawn'],
        points: ['coordinates', 'place'], country: ['country', 'selected-object'],
        layer: ['layer-name'], metric: ['metric-key'], text: ['text'] }[kind] || ['text'];
      return { required: !optional, accepts: accepts, mapCenterAllowed: false, kind: kind };
    }

    /* Does this argument set already carry the target the capability needs? Purely structural —
       it asks whether a value is PRESENT, never whether it is good. */
    function hasTarget(kind, args) {
      args = args || {};
      var any = function (keys) { return keys.some(function (k) { var v = args[k]; return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); }); };
      switch (kind) {
        case 'place': return any(['place', 'from', 'to', 'country', 'name', 'target', 'region', 'location', 'at', 'origin', 'center', 'destination']) || (args.lng != null && args.lat != null);
        case 'point': return (args.lng != null && args.lat != null) || any(['place', 'at', 'location', 'point']);
        case 'area': return any(['area', 'target', 'place', 'region', 'polygon', 'radiusKm', 'km', 'bbox']);
        case 'points': return any(['points', 'places', 'stops', 'from', 'to']);
        case 'country': return any(['country', 'countries', 'place', 'name', 'target']);
        case 'layer': return any(['name', 'layer', 'layers', 'all']);
        case 'metric': return any(['metric', 'metricA', 'metricY', 'components', 'key']);
        case 'text': return any(['query', 'text', 'question', 'value', 'place']);
        default: return true;
      }
    }

    function build(row) {
      var id = row[0], legacy = row[1], aliases = row[2] ? row[2].split(',') : [];
      var obsKind = row[4];
      var obs = OBSERVERS[obsKind] || OBSERVERS.none;
      var writes = row[5] ? row[5].split(',') : [];
      var produces = row[6] ? row[6].split(',') : [];
      var target = targetPolicyOf(row[9]);
      var lazy = row[10] ? row[10].split(',') : [];
      var withdrawn = WITHDRAWN[id] || null;
      var cap = {
        id: id, version: 1, legacy: legacy,
        aliases: [legacy].concat(aliases).filter(Boolean),
        category: row[3], observerKind: obsKind,
        titleKey: 'atlas.capability.' + id,
        inputSchema: { type: 'object' },   /* the dispatch accepts a wide argument set; the audit
                                              checks that every documented argument is reachable */
        targetPolicy: target,
        lazyModules: lazy,
        effects: { reads: [], writes: writes, conflictKeys: writes.slice() },
        produces: produces,
        risk: { read: 'read-only', session: 'reversible-session', persist: 'persistent-setting', external: 'external' }[row[7]] || 'reversible-session',
        confirmation: row[8],
        withdrawn: withdrawn, isFallback: !!FALLBACKS[id],
        forbiddenSubstitutes: FORBIDDEN_SUBSTITUTES[id] || [],
        equivalents: EQUIVALENTS[id] || [],
        availability: function () {
          if (withdrawn) return { available: false, reason: 'withdrawn' };
          if (!runtime.dispatch) return { available: false, reason: 'atlas-kernel-not-loaded' };
          return { available: true, reason: null };
        },
        resolveInputs: function (ctx, args) {
          if (!target.required) return null;
          if (hasTarget(target.kind, args)) return null;
          /* 「map centerを暗黙の選択地点にしないでください。」 — the whole reason this branch exists. */
          return { inputRequest: { kind: (target.kind === 'points' ? 'polyline' : target.kind === 'area' ? 'polygon' : target.kind === 'point' || target.kind === 'place' ? 'point' : 'text'),
            promptKey: 'atlas.input.' + (target.kind === 'points' ? 'polyline' : target.kind === 'area' ? 'polygon' : target.kind === 'point' || target.kind === 'place' ? 'point' : 'text'),
            constraints: { accepts: target.accepts } } };
        },
        observe: obs.observe,
        verify: obs.verify,
        examples: [], negativeExamples: [], limitations: []
      };
      cap.execute = legacyExecute(cap);
      /* the doc block that documents it, resolved lazily from js/atlas-catalog-text.js */
      Object.defineProperty(cap, 'description', { enumerable: true, get: function () {
        try { return runtime.docs ? runtime.docs.summaryFor(id) : ''; } catch (_) { return ''; }
      } });
      return cap;
    }

    T.forEach(function (row) {
      var cap = build(row);
      byId[cap.id] = cap; order.push(cap.id);
      cap.aliases.forEach(function (a) {
        var k = String(a).toLowerCase();
        if (byAlias[k] && byAlias[k] !== cap.id) { try { console.warn('IntMap capability alias clash: ' + a + ' → ' + byAlias[k] + ' / ' + cap.id); } catch (_) { } return; }
        byAlias[k] = cap.id;
      });
      byAlias[cap.id.toLowerCase()] = cap.id;
    });

    /* ══ THE PUBLIC FACE ═════════════════════════════════════════════════════════════════════════ */
    API.list = function () { return order.slice(); };
    API.all = function () { return order.map(function (id) { return byId[id]; }); };
    API.resolve = function (idOrAlias) {
      if (!idOrAlias) return null;
      var k = String(idOrAlias).toLowerCase();
      var id = byId[idOrAlias] ? idOrAlias : byAlias[k];
      return id ? byId[id] : null;
    };
    API.has = function (x) { return !!API.resolve(x); };
    API.aliasMap = function () { var m = {}; Object.keys(byAlias).forEach(function (k) { m[k] = byAlias[k]; }); return m; };
    API.withdrawn = function () { return Object.keys(WITHDRAWN).slice(); };
    API.ruleDocumented = function () { return Object.assign({}, RULE_DOCUMENTED); };
    /* define() — a capability added by a module rather than by this table. It is subject to the SAME
       rules: an id, an executor, and (if it writes anything) an observer and a verifier. */
    API.define = function (d) {
      if (!d || !d.id || typeof d.execute !== 'function') return false;
      var writes = (d.effects && d.effects.writes) || [];
      if (writes.length && (typeof d.observe !== 'function' || typeof d.verify !== 'function')) {
        try { console.warn('IntMap: capability ' + d.id + ' writes ' + writes.join(',') + ' but has no observe/verify — refused'); } catch (_) { }
        return false;
      }
      if (byId[d.id]) return false;
      var cap = Object.assign({ version: 1, aliases: [], category: 'other', lazyModules: [],
        effects: { reads: [], writes: [], conflictKeys: [] }, produces: [], risk: 'reversible-session',
        confirmation: 'none', targetPolicy: targetPolicyOf(''), forbiddenSubstitutes: [], equivalents: [],
        availability: function () { return { available: true, reason: null }; },
        observe: function () { return null; }, verify: OBSERVERS.none.verify,
        examples: [], negativeExamples: [], limitations: [] }, d);
      byId[cap.id] = cap; order.push(cap.id);
      cap.aliases.concat([cap.id]).forEach(function (a) { byAlias[String(a).toLowerCase()] = cap.id; });
      return true;
    };

    /* ══ RELEVANCE SEARCH (§10) ═══════════════════════════════════════════════════════════════════
       「現在の`controlCatalog().slice(0,140)`のような切り捨てを能力発見へ使わない。」
       Retrieval is DETERMINISTIC and scores every capability — it never truncates the population.
       What it returns is a RANKING; the caller decides how deep to go, and the honest fallback of
       "send everything" is still there and is still exercised (see catalogText(null)). */
    function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s·・･_\-]+/g, ' ').trim(); }
    /* ══ SEARCH HINTS ═══════════════════════════════════════════════════════
       MATCH TERMS, not text the app writes. These are the words a REQUEST may
       use, all nine languages at once, one packed row per category. Nothing here is ever shown to
       anyone: `score()` compares the incoming sentence against EVERY spelling regardless of the UI
       language, because 「大阪への経路」 must rank routing.route whether the app is set to Japanese
       or not. Translating a row would not merely be wasted — it would BREAK the ranking, which is
       exactly why js/newsgeo.js's matcher tables carry the same marker (scripts/i18n-pair-audit.mjs
       honours it only on rows with a non-linguistic key, and a `|`-separated record is one). */
    var VERB_TERMS = {
      view: 'fly|go to|zoom|move|rotate|tilt|north|camera|locate|移動|飛んで|ズーム|回転|傾け|fliege|zoom|drehen|neigen|лететь|приблизить|повернуть|наклон|volar|acercar|girar|inclinar|飛往|缩放|旋轉|傾斜|飞往|縮放|旋转|倾斜|voler|zoomer|pivoter|incliner|이동|확대|회전|기울',
      layers: 'layer|overlay|show|hide|opacity|レイヤー|表示|非表示|不透明|ebene|anzeigen|ausblenden|deckkraft|слой|показать|скрыть|непрозрачность|capa|mostrar|ocultar|opacidad|圖層|顯示|隱藏|透明度|图层|显示|隐藏|couche|afficher|masquer|opacité|레이어|표시|숨기|불투명',
      routing: 'route|directions|drive|walk|transit|reach|isochrone|経路|道順|徒歩|車|到達|route|wegbeschreibung|fahren|laufen|erreichbar|маршрут|проезд|пешком|доступн|ruta|indicaciones|conducir|caminar|alcance|路線|路線圖|步行|可達|路线|步行|可达|itinéraire|trajet|à pied|accessible|경로|길찾기|도보|도달',
      sim: 'simulate|simulation|quake|tsunami|radiation|missile|sun|shadow|sky|flight|シミュ|地震|津波|放射|ミサイル|日照|影|星空|飛行|simulation|erdbeben|tsunami|strahlung|rakete|sonne|schatten|himmel|симул|землетряс|цунами|радиац|ракет|солнц|тень|небо|simulación|terremoto|tsunami|radiación|misil|sol|sombra|cielo|模擬|地震|海嘯|輻射|飛彈|陽光|陰影|星空|模拟|海啸|辐射|导弹|阳光|阴影|simulation|séisme|tsunami|radiation|missile|soleil|ombre|ciel|시뮬|지진|해일|방사|미사일|태양|그림자|하늘',
      data: 'rank|top|compare|statistic|population|value|gdp|ランキング|比較|人口|統計|値|rangliste|vergleich|bevölkerung|statistik|рейтинг|сравн|население|статистик|clasificación|comparar|población|estadística|排名|比較|人口|統計|排行|比较|统计|classement|comparer|population|statistique|순위|비교|인구|통계',
      research: 'research|analyze|explain|news|report|history|調べ|分析|説明|ニュース|歴史|recherche|analysieren|erklären|nachrichten|geschichte|исследов|анализ|объясн|новост|истори|investigar|analizar|explicar|noticias|historia|研究|分析|說明|新聞|歷史|说明|新闻|历史|recherche|analyser|expliquer|actualités|histoire|조사|분석|설명|뉴스|역사',
      map: 'highlight|draw|pin|circle|polygon|clear|colour|color|ハイライト|描|ピン|円|消し|色|hervorheben|zeichnen|stecknadel|kreis|löschen|farbe|выдел|нарисов|метк|круг|очист|цвет|resaltar|dibujar|marcador|círculo|borrar|color|標示|繪製|圖釘|圓|清除|顏色|标示|绘制|图钉|清除|颜色|surligner|dessiner|épingle|cercle|effacer|couleur|강조|그리|핀|원|지우|색',
      panel: 'open|close|panel|settings|window|開|閉じ|パネル|設定|öffnen|schließen|fenster|einstellungen|откр|закр|панель|настройк|abrir|cerrar|panel|ajustes|開啟|關閉|面板|設定|打开|关闭|设置|ouvrir|fermer|panneau|paramètres|열기|닫기|패널|설정',
      settings: 'theme|dark|light|language|unit|accent|テーマ|ダーク|ライト|言語|単位|thema|dunkel|hell|sprache|einheit|тема|тёмн|светл|язык|единиц|tema|oscuro|claro|idioma|unidad|主題|深色|淺色|語言|單位|主题|深色|浅色|语言|单位|thème|sombre|clair|langue|unité|테마|어두운|밝은|언어|단위',
      time: 'time|date|year|past|history|時刻|日付|年|過去|zeit|datum|jahr|vergangen|время|дата|год|прошл|tiempo|fecha|año|pasado|時間|日期|年|過去|时间|日期|过去|temps|date|année|passé|시간|날짜|년|과거',
    };
    var VERB_HINTS = (function () {
      var o = {};
      Object.keys(VERB_TERMS).forEach(function (k) { o[k] = VERB_TERMS[k].split('|'); });
      return o;
    })();
    API.VERB_HINTS = VERB_HINTS;

    API.score = function (cap, q, ctx) {
      var s = 0, nq = norm(q);
      if (!nq) return 0;
      cap.aliases.forEach(function (a) {
        var na = norm(a);
        if (!na) return;
        if (nq === na) s += 100;
        else if (nq.indexOf(na) >= 0 && na.length >= 4) s += 40;
      });
      if (nq.indexOf(norm(cap.id.split('.').pop())) >= 0) s += 25;
      (VERB_HINTS[cap.category] || []).forEach(function (h) { if (h && nq.indexOf(norm(h)) >= 0) s += 8; });
      if (ctx) {
        if (ctx.recent && ctx.recent.indexOf(cap.id) >= 0) s += 12;
        if (ctx.requiredOutputs && ctx.requiredOutputs.length) {
          var hit = cap.produces.some(function (p) { return ctx.requiredOutputs.indexOf(p) >= 0; });
          if (hit) s += 10;
        }
      }
      if (cap.withdrawn) s = -1;
      if (cap.isFallback) s -= 5;
      return s;
    };
    /* search(q, opts) — the ranking. `opts.min` is the score below which a capability is not
       CONFIDENTLY relevant; when too few clear that bar the caller widens, and the widest setting
       is the whole registry. Nothing is ever dropped for being 141st in the DOM. */
    API.search = function (q, opts) {
      opts = opts || {};
      var ctx = opts.context || null;
      var rows = API.all().filter(function (c) { return !c.withdrawn; })
        .map(function (c) { return { id: c.id, score: API.score(c, q, ctx) }; })
        .filter(function (r) { return r.score > 0; })
        .sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
      var min = opts.min == null ? 8 : opts.min;
      var strong = rows.filter(function (r) { return r.score >= min; });
      return { ranked: rows, strong: strong, confident: strong.length >= (opts.want || 3) };
    };

    /* catalogText(ids) — the planner's catalogue. `null` means EVERY capability, which reproduces
       the text js/atlas-console.js used to carry inline, byte for byte. */
    API.catalogText = function (ids) {
      if (!runtime.docs) return '';
      return runtime.docs.text(ids);
    };
    API.catalogBytes = function (ids) { return API.catalogText(ids).length; };

    /* ══ THE MACHINE-READABLE AUDIT (§2) ═════════════════════════════════════════════════════════ */
    API.toJSON = function () {
      return {
        version: 1, count: order.length,
        capabilities: API.all().map(function (c) {
          return {
            id: c.id, legacy: c.legacy, aliases: c.aliases.slice(), category: c.category,
            observerKind: c.observerKind, effects: c.effects, produces: c.produces,
            risk: c.risk, confirmation: c.confirmation, targetPolicy: c.targetPolicy,
            lazyModules: c.lazyModules, withdrawn: c.withdrawn ? c.withdrawn.why : null,
            isFallback: c.isFallback, forbiddenSubstitutes: c.forbiddenSubstitutes,
            equivalents: c.equivalents,
            hasExecute: typeof c.execute === 'function',
            hasObserve: typeof c.observe === 'function',
            hasVerify: typeof c.verify === 'function',
            hasUndo: typeof c.undo === 'function'
          };
        })
      };
    };
    /* The classification §2 asks for, computed rather than asserted. */
    API.classify = function () {
      return API.all().map(function (c) {
        var cls;
        if (c.withdrawn) cls = 'intentionally-withdrawn';
        else if (c.isFallback) cls = 'fallback-only';
        else if (!c.effects.writes.length) cls = 'read-only';
        else if (c.observerKind === 'none') cls = 'no-postcondition';
        else cls = 'fully-modelled';
        return { id: c.id, classification: cls, category: c.category, lazy: c.lazyModules.length > 0 };
      });
    };

    try { window.IntMapCapabilities = API; } catch (_) { }
    return API;
  })();
}
