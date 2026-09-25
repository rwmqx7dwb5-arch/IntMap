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
        11 ingests     OPTIONAL (#R801). '' | 'external'. 'external' = the RESULT this row hands back
                       to the model carries sentences a THIRD PARTY wrote — a fetched page, a
                       headline, a reader's file, a gloss built from web text — as opposed to
                       IntMap's own observation of what it did (a camera moved, a layer is on).
                       js/atlas-toolsurface.js stamps it on the tool result and js/atlas-agent.js
                       reads it for ONE fact: whether outside content has now been in front of the
                       model this turn (`turn.externalContentSeen`), which is what column 8's
                       'explicit' asks. A row that omits the cell ingests nothing external.
       ⚠ COLUMN 9 IS THE #R302 REGRESSION CONDITION. A capability whose target is required and whose
       arguments do not carry one answers `needs_input` — it does NOT quietly take the map centre. */
    var T = [
      /* id                          legacy            aliases                                                        cat        obs        writes                    produces               risk       confirm   target      lazy        [ingests] */
      ['map.clearHighlights',        'reset',          '',                                                            'map',     'paint',   'map.highlight,map.compose',          'map',                 'session', 'none',   '',         ''],
      ['layers.toggle',              'layer',          '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
      ['layers.opacity',             'opacity',        '',                                                            'layers',  'layer',   'map.layer',              'map',                 'session', 'none',   'layer',    ''],
      ['view.projection',            'projection',     '',                                                            'view',    'camera',  'camera',                 'map',                 'session', 'none',   '',         ''],
      ['view.basemap',               'base',           '',                                                            'view',    'layer',   'map.basemap',            'map',                 'session', 'none',   '',         ''],
      ['panel.compare',              'compare',        '',                                                            'panel',   'panel',   'panel.compare',          'panel',               'session', 'none',   '',         ''],
      ['view.flyTo',                 'flyTo',          '',                                                            'view',    'camera',  'camera',                 'camera,map',          'session', 'none',   'place',    ''],
      ['data.weather',               'weather',        '',                                                            'data',    'panel',   'panel.weather',          'panel,explanation',   'read',    'none',   'place',    ''],
      ['research.brief',             'brief',          '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'place?',   '', 'external'],
      /* (#R491) the term gloss. It writes nothing and paints nothing — it opens a card beside the
         text and produces an explanation, which is why its observer is 'none' and its risk 'read'. */
      ['reader.gloss',               'gloss',          'explainTerm,defineTerm',                                      'research','none',    '',                       'explanation',         'read',    'none',   'text',     '', 'external'],
      ['research.askHere',           'askHere',        '',                                                            'research','none',    '',                       'explanation',         'read',    'none',   'point',    ''],
      /* ⚠⚠ (#R495) THE JOIN. Every row above answers about ONE dataset — rank a metric, read a point,
         sum an area, score countries — and 「人口100万人以上で、年間降水量500mm未満、海から200km以上、
         過去30日でM5以上の地震があった都市」 is a question about four at once. `read` and `none`: it
         measures and pins, it changes no setting the reader has to undo. */
      ['data.query',                 'query',          'crossQuery,dataQuery',                                        'data',    'queryRows','map.object',           'map,explanation',     'session','none',   '',         'atlasQuery', 'external'],
      /* ⚠⚠ (#R743) THE OTHER HALF OF THE LINE ABOVE. `data.query` READS the datasets a reader has
         imported; nothing could ask for one to be MADE. So every spatial analysis Atlas could
         perform was one somebody had already built as a feature of the app, and a request like
         「施設から5km圏を作り、統合し、その範囲の人口を集計して地図に出して」 had no door at all.
         ⚠ ONE ROW, NOT ONE PER OP. js/gis-ops.js declares its ops — inputs, accepted geometry,
         payload kind, parameters, types — and js/gis-atlas.js hands the planner THAT declaration
         rather than a copy of it. A row per op here would be the hand-written list this project
         keeps re-learning not to write: the op added to DECL tomorrow would answer run() and be
         invisible to the planner. `writes` is 'map.object' only because a step may be asked to draw
         its result; the analysis itself changes no setting the reader has to undo. */
      ['data.gis',                   'gis',            'gisRun,spatialOp,runGisOp',                                   'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'gisCore'],
      /* ⚠ (#R743) AND DRAWING IS ITS OWN PROMISE. A step that draws only when asked cannot
         honestly declare 'map.object': the observer would measure a map that did not move and
         call a correct answer not_rendered — the shape #R736/#R737 measured, where 21 tool calls
         went into re-drawing a map that had been right from the first. One capability computes
         and promises nothing about the map; this one draws and promises exactly that. */
      ['map.drawDataset',            'gisDraw',        'drawDataset,showDataset',                                     'map',     'paint',   'map.object',             'map',                 'session','none',   '',         'gisCore'],
      /* ⚠⚠ (#R543) THE CHART — the second thing an answer is allowed to BE. #R511 made the map an
         output of the answer rather than a side effect of it; the numbers stayed prose. Every row
         above that ranks, compares, relates or queries produces values, and the only way any of them
         reached the reader as a picture was if one of three panels happened to be the thing opened.
         `writes` is empty and `risk` is `read` on purpose: a chart changes nothing the reader has to
         undo — it is drawn INTO the reply, which is also why its observer is `chart` and not `paint`
         (nothing on the map moves, so a map observer would call every chart `not_rendered`). */
      ['chart.compose',              'chart',          'chartCompose,plot,graph',                                     'data',    'chart',   '',                       'chart,explanation',   'read',    'none',   '',         'atlasChart'],
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
      /* (#R760) WHICH FIRST-LEVEL UNITS A SHAPE COVERS — prefectures, states, provinces, oblasts.
         Answered entirely from the bundled data/admin1-world.json.gz (4,515 units, in the repository
         since #R290), so it reaches no network: measured in this worktree at 32 prefectures in 121 ms
         for a 500 km circle on Tokyo.
         ⚠ OBSERVER 'none', AND THAT IS THE POINT (#R743). Computing which units a shape covers and
         PAINTING them are two capabilities. This one writes nothing and produces prose; an observer
         that measured the map would report a perfectly correct run as not_rendered, which is the
         defect #R743 removed from the GIS ops. Painting is map.highlight, given the names this returns.
         ⚠ COLUMN 9 IS EMPTY, NOT 'area'. The two argument shapes the case accepts — place + km, and a
         bare ring in points — are not both spellings of one target kind: hasTarget('area') reads
         area/target/place/region/polygon/radiusKm/km/bbox and NOT points, so a ring-only call would
         answer needs_input. Widening that list would widen it for data.populationIn as well. What
         refuses an argument-less call is the anyOf in js/atlas-schemas.js — before anything runs,
         which is what #R406 required of every capability that cannot act on an empty object. */
      ['data.coverage',              'admin1Coverage', 'subdivisionsCovered,regionsCovered',                          'data',    'none',    '',                       'explanation',         'read',    'none',   '',         ''],
      ['data.satelliteCompare',      'satelliteCompare','satCompare,satChange',                                       'data',    'panelPaint','panel.satcompare',     'panel,map',           'session', 'none',   'place',    ''],
      ['data.layerValues',           'layerData',      'layerValue,layerQuery',                                       'data',    'none',    '',                       'explanation',         'read',    'none',   'point',    ''],
      ['map.object',                 'object',         'mapObject',                                                   'map',     'object',  'map.object',             'object',              'session', 'explicit','',        ''],
      /* ⚠ (#R740) `isochrone`, NOT `paint` — a reachable area that is on the map is rendered whether
         or not the count moved. The measurement and the general rule are at the observer below. */
      ['routing.isochrone',          'isochrone',      'reach,reachability,reachable,catchment',                      'routing', 'isochrone','map.isochrone',         'map',                 'session', 'none',   'place',    ''],
      ['routing.setEndpoints',       'route',          '',                                                            'routing', 'route',   'map.route',              'panel',               'session', 'none',   'place',    ''],
      ['routing.optimizeStops',      'optimizeRoute',  'tsp,multiStop,optimize,optimizeStops',                        'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'points',   ''],
      ['routing.route',              'directions',     'roadRoute,navigate,drivingRoute,walkingRoute,transitRoute',   'routing', 'route',   'map.route',              'route,map,panel',     'session', 'none',   'place',    'routeUi'],
      ['panel.streetView',           'streetview',     'streetView,pano',                                             'panel',   'panel',   'panel.streetview',       'panel',               'session', 'none',   'point',    'streetView'],
      ['sim.radiation',              'radiation',      'fallout,dispersion,plume,radiationSim',                       'sim',     'sim',     'map.radiation',          'map',                 'session', 'none',   'place',    ''],
      ['sim.flightSim',              'flightSim',      'flightsim,flightsimulator,flysim,pilot',                      'sim',     'sim',     'camera,map.flightsim',   'map,camera',          'session', 'none',   'place?',   'flightSim'],
      ['data.runways',               'runway',         'airports',                                                    'data',    'panel',   'panel.runway',           'panel',               'read',    'none',   'place',    ''],
      ['panel.education',            'edu',            'learn',                                                       'panel',   'panel',   'panel.edu',              'panel',               'session', 'none',   '',         ''],
      ['panel.ecmwf',                'ecmwf',          'weatherLayers',                                               'panel',   'panel',   'panel.ecmwf',            'panel',               'session', 'none',   '',         ''],
      ['data.wxModel',               'wxModel',        'weatherModel,forecastModel',                                  'data',    'wxModel', 'map.layer,map.layerOption',              'map,explanation',     'session', 'none',   '',         ''],
      ['layers.railAxis',            'railAxis',       'railwayAxis,gaugeAxis',                                       'data',    'paint',   'map.layer,map.layerOption',              'map,explanation',     'session', 'none',   '',         'railways'],
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
      ['map.volume3d',               'volume3d',       'volume',                                                      'map',     'object',  'map.object,map.volume',             'object,map',          'session', 'none',   'place',    ''],
      ['routing.drone',              'drone',          '',                                                            'routing', 'route',   'map.drone',              'route,map,panel',     'session', 'none',   '',         ''],
      /* ══ (#R347) ACTIVE NAVIGATION — §34 ═════════════════════════════════════════════════════
         「「AtlasにはできるがUIからできない」「UIにはできるがAtlasにはできない」という状態を原則なくす。」
         Five, not one, because they differ in every column that matters: starting needs the route to
         exist and the reader to grant a permission (`external` risk — a position leaves the device);
         asking how long is left is a pure READ; stopping is neither.
         ⚠ `navigation.start` IS THE ONLY 'external' RISK IN THE ROUTING CATEGORY. It turns on a sensor
         and sends one position to a router. Atlas may do it on a plain instruction, but the risk column
         is what makes that visible in the plan rather than buried in an executor.
         ⚠ (#R801) WHAT LEAVES, TO WHOM: the device's position, to the routing relay — so column 8 is
         'explicit': on a plain instruction it still runs; on the model's say-so after outside content
         (a page, an article, an attachment) has been in the turn, the reader is asked first
         (js/atlas-executor.js 4b). */
      ['navigation.start',           'startNavigation','startNav,beginNavigation,guideMe,driveThere',           'routing', 'route',   'map.route,navigation',   'route,map,panel',     'external','explicit','',        'navigation'],
      ['navigation.stop',            'stopNavigation', 'endNavigation,stopNav',                              'routing', 'none',    'navigation',             'panel',               'session', 'none',   '',         ''],
      ['navigation.status',          'navStatus',      'howLongLeft,etaNow,remaining,nextTurn,arrivalTime',           'routing', 'none',    '',                       'explanation',         'read',    'none',   '',         ''],
      ['navigation.camera',          'navCamera',      'recenter,overview,followMe,northUp',                          'routing', 'camera',  'camera,camera.follow',                 'map,camera',          'session', 'none',   '',         ''],
      ['navigation.voice',           'navVoice',       'mute,unmute,voiceGuidance',                                   'routing', 'setting', 'navigation',             'setting',             'session', 'none',   '',         ''],
      /* ⚠ `measure` ARMS the tool; the line appears when the USER clicks. Declaring 'map' here made
         the verifier promise a drawing that correctly is not there yet (§6's panel rule). */
      ['map.measure',                'measure',        '',                                                            'map',     'panel',   'map.tool',               'panel',               'session', 'none',   '',         ''],
      ['panel.correlate',            'correlate',      '',                                                            'panel',   'panel',   'panel.correlate',        'panel',               'session', 'none',   '',         ''],
      ['panel.settings',             'settings',       '',                                                            'panel',   'panel',   'panel.settings',         'panel',               'session', 'none',   '',         ''],
      ['panel.workspace',            'workspace',      'windows,windowMode,windowWorkspace',                          'panel',   'panel',   'panel.workspace',        'panel',               'session', 'none',   '',         ''],
      ['panel.shortcuts',            'shortcuts',      'keyboard,hotkeys',                                            'panel',   'panel',   'panel.shortcuts',        'panel',               'session', 'none',   '',         ''],
      ['map.objectList',             'objects',        'objectList,manageObjects,listObjects,myObjects',              'map',     'panel',   'panel.objects',          'panel',               'session', 'none',   '',         ''],
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
      ['map.outline',                'outline',        'extent,showExtent',                                           'map',     'paint',   'map.highlight,map.outline',          'object,map',          'session', 'none',   'place',    ''],
      /* ══ ⚠⚠⚠ (#R754) THE SIMULATOR ITSELF, NOT THE SCREEN IT IS DRAWN ON ═══════════════════════
         The row above opens the Playground PANEL, and until this round that was the only thing Atlas
         could do about a pandemic: asked to simulate one from Lagos it answered, correctly given what
         it had been told, that IntMap has no transmission simulator (#R747 §6). It has had one since
         #R575. What it had no door to was placing a seed, advancing days and reading a day back.
         ⚠ TWO ROWS, NOT ONE, FOR #R743'S REASON. Computing promises the map nothing; drawing promises
         exactly that. One row declaring both would make the observer measure an unmoved map on every
         run nobody asked to draw and call a correct answer not_rendered — #R736/#R737's 21 wasted
         calls, and #R742's 52 failures in 207. The vocabulary (presets, parameters, ranges) is
         js/pandemic-model.js's PANDEMIC_PARAMS, handed to the planner by js/pandemic-atlas.js
         declaration() rather than copied into a list here. */
      ['sim.pandemicRun',            'pandemicRun',    'simulatePandemic,runPandemic,pandemicSimulate,outbreakSim',   'sim',     'none',    '',                       'explanation',         'read',    'none',   'place',    'pandemicSim'],
      ['map.pandemicDay',            'pandemicDraw',   'drawPandemic,showPandemicDay,pandemicMap',                    'map',     'pandemic','map.object',             'map',                 'session', 'none',   '',         'pandemicSim'],
      ['panel.playground',           'playground',     'game',                                                        'panel',   'panel',   'panel.playground',       'panel',               'session', 'none',   '',         'playground'],
      ['panel.news',                 'news',           '',                                                            'panel',   'panel',   'panel.news',             'panel',               'session', 'none',   '',         ''],
      ['panel.account',              'account',        'login',                                                       'panel',   'panel',   'panel.account',          'panel',               'session', 'none',   '',         ''],
      ['panel.donate',               'donate',         '',                                                            'panel',   'panel',   'panel.donate',           'panel',               'session', 'none',   '',         ''],
      ['panel.feedback',             'feedback',       '',                                                            'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
      ['panel.bugReport',            'bugReport',      'bug',                                                         'panel',   'panel',   'panel.feedback',         'panel',               'session', 'none',   '',         ''],
      ['map.highlight',              'highlight',      '',                                                            'map',     'paint',   'map.highlight',          'map',                 'session', 'none',   '',         ''],
      /* (#R511) one map explanation in one call — numbered places with roles, arcs between them,
         shaded regions, one frame, a legend. `paint`: the observer counts its own source
         (`atl-compose-src`, in paintNow below) to know it drew. Writes the highlight key too,
         because a shaded item goes through the highlight path. */
      ['map.compose',                'compose',        'mapCompose,composeMap,explainOnMap',                          'map',     'mapCompose', 'map.compose,map.highlight', 'map,explanation', 'session', 'none',   '',         ''],
      /* (#R546) one earthquake's ground-motion FIELD from USGS ShakeMap — the contours, the painted
         intensity surface, and who was inside which shaking. `paint`: the observer counts the contour
         source, which is the one every metric produces (a metric USGS ships no palette for has lines
         and no surface, and `state().painted` is how Atlas tells those two apart). Lazy: js/shakemap.js. */
      ['map.shakemap',               'shakemap',       'shakeMap,groundShaking,intensityMap,shaking',                  'map',     'paint',   'map.shakemap',           'map,explanation',     'session', 'none',   '',         'shakeMap'],
      ['data.value',                 'value',          'stat,lookup',                                                 'data',    'none',    '',                       'explanation',         'read',    'none',   'country',  ''],
      ['layers.allOff',              'layersOff',      'allLayersOff',                                                'layers',  'layer',   'map.layer',              'map',                 'session', 'explicit','',        ''],
      ['map.clear',                  'clear',          '',                                                            'map',     'clear',   'map.all',                'map',                 'session', 'none',   '',         ''],
      /* (atlas-observer-undo) PUT THE MAP BACK THE WAY IT WAS BEFORE A TURN. ONE mechanism, not one undo
         per capability: js/atlas-state.js snapshots every restorable section when a turn opens (camera,
         clock, layer switches, Atlas's own drawings, the object list, the claimed surfaces) and this
         puts the snapshot back. Column 5 is what it touches — and therefore what `hasUndo` below
         reports for every other row: a capability whose effects all fall inside it is reversible. What
         it cannot put back (a drawing the turn REPLACED, an object it deleted) the verdict names. */
      ['map.undo',                   'undo',           'undoTurn,undoLast,revertTurn',                                'map',     'undo',    'camera,time,map.basemap,map.layer,map.highlight,map.choropleth,map.polygon,map.line,map.poi,map.object,map.isochrone,map.fly,map.ballistic,map.elevation,map.factions,map.compose,map.shakemap', 'map', 'session', 'none', '', ''],
      ['view.fullscreen',            'fullscreen',     '',                                                            'view',    'none',    'view.fullscreen',        'view',                'session', 'none',   '',         ''],
      /* ⚠ (#R801) WHAT LEAVES, TO WHOM: the device's position, read from the sensor and returned to
         the MODEL as a fact ({lat,lng,accuracyM}, #R413) — column 8 'explicit', same rule as
         navigation.start above. */
      ['view.locate',                'locate',         'myLocation,whereAmI',                                         'view',    'camera',  'camera,map.location',                 'camera,map',          'session', 'explicit','',        ''],
      /* ⚠ (#R493) THE ONLY CAPABILITY WHOSE RESULT IS A PICTURE. Every other row hands Atlas facts
         it can already read off the state ledger; this one hands it the PIXELS — the frame the
         reader is looking at, attached to the next model call as a real image. It writes nothing
         and moves nothing (observer `none`, empty `writes`), so it holds no conflict key and can
         run beside anything. risk='read' for the same reason.
         ⚠ (#R801) WHAT LEAVES, TO WHOM: the pixels on the reader's screen, to the MODEL as an image
         — column 8 'explicit' (js/atlas-executor.js 4b). */
      ['view.inspect',               'inspect',        'lookAtMap,seeMap,viewInspect,readScreen',                     'view',    'none',    '',                       'explanation',         'read',    'explicit','',        ''],
      ['map.poi',                    'poi',            'mapPois,facilities',                                          'map',     'paint',   'map.poi',                'map',                 'session', 'none',   'place?',   ''],
      ['research.mapReport',         'mapReport',      'newsMap,reportMap',                                           'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
      ['research.situationMap',      'researchMap',    'research_map,situationMap',                                   'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   '',         ''],
      ['sim.ballistic',              'missile',        'ballistic,ballisticMissile,strike,icbm',                      'sim',     'sim',     'map.ballistic',          'map',                 'session', 'none',   'place',    ''],
      ['map.elevationHighlight',     'elevationBelow', 'belowSeaLevel,elevationHighlight,elevationScan',              'map',     'paint',   'map.elevation',          'map',                 'session', 'none',   'place',    ''],
      ['research.historicalMap',     'historicalMap',  'historical,powerMap,allianceMap',                             'research','factions','map.factions',           'map,explanation',     'session', 'none',   '',         ''],
      ['sim.flyAnimate',             'fly',            'flight,trajectory',                                           'sim',     'sim',     'camera,map.fly',         'camera,map',          'session', 'none',   'place',    ''],
      ['map.drawLine',               'drawLine',       'line',                                                        'map',     'paint',   'map.line',               'object,map',          'session', 'none',   'points',   ''],
      ['map.drawPolygon',            'drawPolygon',    'polygon',                                                     'map',     'paint',   'map.polygon',            'object,map',          'session', 'none',   'points',   ''],
      ['ui.inlineControls',          'controls',       '',                                                            'ui',      'none',    '',                       'panel',               'session', 'none',   '',         ''],
      ['dialog.ask',                 'ask',            'choose,clarify,options',                                      'dialog',  'none',    '',                       'explanation',         'read',    'none',   '',         ''],
      /* ⚠ (#R773) 添付は会話に属する。読者が前のターンで付けた画像や PDF は、費用（1 件 8 MB）の
         ため毎ターンは載せない——在ることだけを述べ、要ると Atlas が決めたときにこれが**次の一手の
         目の前へ戻す**。地図も設定も触らないので observer は 'none'、writes は空、risk は 'read'。 */
      /* ⚠⚠ (#R783) COLUMN 9 IS EMPTY, AND IT HAS TO BE. It said 'text', and `hasTarget('text')`
         accepts query/text/question/value/place/term — this capability's only argument is `name`
         (js/atlas-schemas.js), so the one call its own schema declares sufficient could not satisfy
         its own target: every `run_capability{id:'attach.recall',args:{name:'paper.pdf'}}` answered
         `needs_input` 「使用する値を教えてください」 and the recall #R773 implemented never once
         reached the dispatch. ⚠ THE FIX IS NOT A WIDER `hasTarget` — adding `name` to the text list
         would loosen what «the reader gave me something to work on» means for every other capability
         that targets text. What refuses an argument-less call is `required:['name']` in
         js/atlas-schemas.js, enforced on what Atlas sends by js/atlas-toolsurface.js, exactly as for
         data.coverage above (#R760). tests/r783-capability-reachable-checks.test.mjs ①/② measure
         both halves of that for all 145 rows rather than for these two. */
      /* ⚠ (#R801) WHAT LEAVES, TO WHOM: a file the reader attached in an EARLIER turn, back into
         the MODEL's next input — column 8 'explicit' (js/atlas-executor.js 4b). */
      ['attach.recall',              'recallAttachment','recall_attachment,recallFile,reopenAttachment',               'dialog',  'none',    '',                       'explanation',         'read',    'explicit','',        '', 'external'],
      ['research.analyze',           'analyze',        'research,synthesize',                                         'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
      ['settings.engine',            'engine',         '',                                                            'settings','setting', 'settings.engine',        'setting',             'persist', 'explicit','',        ''],
      ['settings.tiltLimit',         'tiltLimit',      '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
      ['settings.eyeAltitude',       'eyeAltitude',    '',                                                            'settings','setting', 'settings.camera',        'setting',             'persist', 'explicit','',        ''],
      /* (#R313) the animated streaks inside the Wind layer, on their own switch — the colour
         raster and the particles come from one forecast field and are toggled separately. */
      ['layers.windParticles',       'windParticles',  'windAnimation',                                               'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      /* (#R439) the 4 hPa contours over the sea-level-pressure field — a switch inside that layer's
         legend, so it is its own verb rather than a layer name (js/weather.js `sub`). */
      ['layers.isobars',             'isobars',        'pressureContours,isolines',                                   'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      /* The base-display preset the layer panel offers as a radio — Default / Clean / Custom
         (js/data-layers.js IntMapBaseDisplay). It was a control the reader had and Atlas did not:
         「基本表示をデフォルトに戻して」 sent Atlas through nine find_capability calls and out of
         steps with nothing done (measured on production, 2026-09-15). */
      ['layers.baseDisplay',         'baseDisplay',    'baseMode,basemapMode,basicDisplay,basePreset,defaultDisplay,cleanDisplay,displayPreset', 'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'persist', 'none',   '',         ''],
      ['layers.nightSide',           'nightSide',      '',                                                            'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      ['layers.planeAltitude',       'planeAltitude',  'aircraftAltitude',                                            'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      ['layers.aircraftTrack',       'aircraftTrack',  'planeTrack',                                                  'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      ['layers.satellites',          'satellites',     'satellite,sats,orbit',                                        'layers',  'layer',   'map.layer,map.layerOption',              'map',                 'session', 'none',   '',         ''],
      ['panel.ticker',               'ticker',         '',                                                            'panel',   'panel',   'panel.ticker',           'panel',               'session', 'none',   '',         ''],
      ['data.compareStats',          'compareStats',   'compareCountries,statsCompare',                               'data',    'panel',   'panel.compare',          'panel',               'session', 'none',   'country',  ''],
      ['map.scoreMap',               'scoreMap',       'customLayer,evaluate',                                        'map',     'paint',   'map.choropleth',         'map',                 'session', 'none',   '',         ''],
      ['data.exploreRelated',        'explore',        'findRelated,relatedMetrics',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   'metric',   ''],
      ['research.impact',            'impact',         'impactAnalysis,nearbyCritical',                               'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   '', 'external'],
      ['research.events',            'events',         'newsEvents,groupNews',                                        'research','paint',   'map.poi',                'map,explanation',     'session', 'none',   'place?',   'newsEvents', 'external'],
      /* (#R386) 出来事のカテゴリで News の一覧と地図を同時に絞る。docs/NEWS-EVENTS.md §9/§10。
         ⚠ observer は `paint`、produces は `map,explanation` ——research.events と同じ形である。
            最初は `panel` / `panel,map` と書いたが、capability audit の `map-verified` が
            **正しく赤くした**: 地図を約束するなら、地図を見る観測者でなければならない。
            この操作が実際に変えるのは `news-points` のピンと、返す件数の説明である。
         ⚠ `lazy` は js/lazy-modules.js に実在する id でなければならない（#R347 が 4 件の
            「存在しない lazy を名指しした行」を測っている）。`newsEvents` はそこに在る。 */
      ['news.category',              'newsCategory',   'newsFilter,eventCategory',                                    'data',    'paint',   'panel.news',             'map,explanation',     'session', 'none',   'text',     'newsEvents', 'external'],
      ['system.module',              'module',         '',                                                            'system',  'panel',   'panel.any',              'panel',               'session', 'none',   '',         ''],
      ['system.monitor',             'monitor',        '',                                                            'system',  'none',    '',                       '',                    'read',    'none',   '',         ''],
      ['system.control',             'control',        '',                                                            'system',  'control', 'ui.any',                 'panel',               'session', 'none',   '',         ''],
      /* (#R395) THE VOLCANO SUBSYSTEM WAS RUNNABLE AND UNREACHABLE. js/beta-overlays.js has
         registered volcano.* kernel commands since #R353, and the registry had no row for any of
         them — so a reader could press the buttons and Atlas could not, which is precisely the
         five-disagreeing-lists failure this file exists to end. `data.layerValues` already answers
         «how many volcanoes are on screen» and these two do not overlap it: one opens the record for
         a NAMED volcano, the other narrows the catalog to a question.
         ⚠ THESE ROWS SIT ABOVE `dialog.answer` ON PURPOSE — tests/r347-checks ㉒ reads the `lazy`
         column with a regex that only matches rows ending in a comma, and the last row has none, so
         a row appended after it would never have its lazy module checked. */
      ['data.volcano',               'volcano',        'volcanoCard,volcanoInfo',                                     'data',    'panel',   'panel.volcano',          'panel',               'session', 'none',   'text',     'volcanoIntel'],
      ['map.volcanoFilter',          'volcanoFilter',  'volcanoMode,volcanoTime',                                     'map',     'paint',   'map.volcano',            'map',                 'session', 'none',   '',         'volcanoIntel'],
      /* (#R567) THE WORLD HERITAGE PAIR, and it is the volcano pair's shape for the volcano pair's
         reason: one opens the record for a NAMED property, the other narrows which properties are
         drawn. Column 10 is empty because the layer is not lazy — it lives in js/beta-overlays.js,
         which is eager, so both commands exist from boot rather than after a download. */
      ['data.heritage',              'heritage',       'worldHeritage,heritageInfo',                                  'data',    'panel',   'panel.heritage',         'panel',               'session', 'none',   'text',     ''],
      ['map.heritageFilter',         'heritageFilter', '',                                                            'map',     'paint',   'map.heritage',           'map',                 'session', 'none',   '',         ''],
      /* (#R585) MEASURED radiation. Two rows, and they are not one row: switching the layer on is a
         claim about the MAP, while «what are the instruments around Zaporizhzhia reading» is a claim
         about DATA and must be answerable without the reader having the layer on. The same split
         volcano needed for the same reason.
         ⚠ NEITHER OF THESE IS THE PLUME SIMULATION. `sim.radiation` models where material would go;
         these report what was measured. Keeping them distinct in the registry is what stops the
         planner answering a question about a real reading with a model — docs/RADIATION.md. */
      ['map.radiation',              'radiationObserved','radiationLayer,doseRate,gammaDoseRate',                     'map',     'paint',   'map.radiation',          'map',                 'session', 'none',   '',         'radiationLayer'],
      /* ⚠⚠ (#R783) AND COLUMN 9 IS EMPTY HERE FOR THE SAME REASON, ONE SPELLING DOWN. It said
         'point', and `hasTarget('point')` reads `lng`+`lat`; this case reads `a.lon`
         (js/atlas-controls.js), its schema requires `lat`+`lon` (js/atlas-schemas.js) and the
         catalogue shows the reader-facing shape as `"lon"` (js/atlas-catalog-text.js) — so the
         coordinate every other reader of this capability calls `lon` was the one the target gate
         could not see, and a call carrying exactly what the schema demanded answered `needs_input`
         asking for the coordinate it had just been given. ⚠ THE SPELLING CONVERGES ON THE CASE,
         NOT ON THE GATE: teaching `hasTarget('point')` to accept `lon` would let a lat/lon call
         past the gate into the nine other point capabilities whose cases read `a.lng` only — the
         false refusal would move one level down instead of going away. With the column empty the
         gate is `required:['lat','lon']`, and the case still names its own refusal 「中心となる
         座標を指定してください」 rather than quietly taking the map centre (#R302). */
      ['data.radiationNear',         'radiationNear',  'measuringStations,doseNear',                                  'data',    'none',    '',                       'explanation',         'read',    'none',   '',         'radiationLayer'],
      /* (#R527) 「山並み写真から撮影地点・撮影方向を探す」 — js/photo-geo.js. It traces the ridge in a
         photograph and matches it against the TERRAIN; an EXIF coordinate in the file is shown and
         never used as the answer, which is the whole honesty of the feature.
         ⚠ COLUMN 9 IS EMPTY ON PURPOSE, AND THAT IS NOT «no input needed». The two things this
         needs — a photograph and a search rectangle — are ones only the READER can hand over, so
         there is no place name that starts it and nothing for the map centre to stand in for
         (#R302). An argument-less call opens the panel and asks; it does not refuse in a sentence.
         `panel` observes it because the panel IS what one call delivers: the sweep that follows is
         minutes long and is reported through the `photoGeo` state section (js/atlas-state.js). */
      ['photo.locate',               'photoLocate',    'photoGeolocate,whereWasThisTaken,skylineMatch',               'photo',   'panel',   'panel.photoGeo',         'panel,explanation',   'session', 'none',   '',         'photoGeo'],
      /* (#R650) WHO Disease Outbreak News as an event layer — js/outbreaks.js. It PAINTS (one
         circle per country the window holds items for) and it EXPLAINS (the counts, the leading
         countries, and the items themselves in `meta.items`), which is why column 7 carries both.
         ⚠ COLUMN 11 IS EMPTY BECAUSE THE MODULE IS EAGER, not because it was forgotten: the layer
         row has to exist before anyone can ask for it, so js/outbreaks.js rides the shell the way
         js/industry-web.js and js/ocean-currents.js do. The 3,195-item archive it reads is the part
         that is deferred — nothing is fetched until the layer is switched on. */
      ['map.outbreaks',              'outbreaks',      'diseaseOutbreaks,outbreakLayer,epidemics,whoOutbreaks,diseaseMap', 'map', 'paint', 'map.outbreaks',          'map,explanation',     'session', 'none',   '',         ''],
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
    /* ⚠⚠⚠ (#R397) THE THREE OBSERVERS BELOW NAMED THINGS THAT DO NOT EXIST, AND `try{}catch(_){}`
       ATE THE PROOF. This is the #R388 shape — a façade method spelled from memory, a TypeError
       swallowed, and a feature that never worked while every gate stayed green — except here it was
       the VERIFIER itself, so the damage was that Atlas could not see what it had just done:

         · `GE().layers.list()` DOES NOT EXIST. The layers façade (js/geo-engine.js:1813+) has
           has/add/remove/setVisible/isVisible/getLayout/sourceData and no enumerator at all, so the
           `?` guard took the null branch on every call and `visibleLayerIds()` returned `[]` FOREVER.
           The `layer` observer's `observed.layers` (13 capabilities) was always empty and
           `paintNow().visible` was always 0.
         · `getCenter()` RETURNS `{lng,lat}`, NOT AN ARRAY — in both adapters (js/geo-engine.js:1141
           and js/cesium-engine.js:639-640). Reading `c[0]`/`c[1]` gave `undefined` → `+undefined` →
           NaN, and `JSON.stringify(NaN)` is `null`, so `changed(before, after)` compared
           `{"lng":null,"lat":null,…}` against itself. THE CAMERA OBSERVER COULD ONLY SEE ZOOM,
           BEARING AND PITCH. A `view.flyTo` that crossed the planet at an unchanged zoom — flying
           to Kenya from another country-level view is exactly that — was reported
           `partial / no_change`, which then fed the repair loop a failure that had not happened.
         · `'nlq-pin-src'` and `'atl-poi-src'` ARE NOT SOURCE IDS ANYWHERE IN THIS REPOSITORY. They
           occurred on one line, this file's, and nowhere else. The real ids are `'user-pins'`
           (js/app-body.js:2953) and `'nlq-poi-src'` (js/atlas-console.js:1638), so
           `sourceFeatureCount` took its `catch` and `paintNow().pins`/`.poi` were always `-1`: the
           `paint` observer (23 capabilities) could not see a pin or a POI appear.

       ⚠ THE LESSON IS THE GUARD, NOT THE SPELLING. `GE().layers.list ? … : null` and
       `catch (_) { return -1 }` are both written as caution and both convert "this name is wrong"
       into a plausible reading. Every façade name below is now checked by
       tests/r397-checks.test.mjs against the façade's own source, so a rename breaks a test instead
       of blinding the verifier. */
    function visibleLayerIds() {
      var out = [];
      try {
        /* The style is the only enumerator either adapter offers (`scene.getStyle()`), and its
           layer objects already carry `layout.visibility` — so this is ONE call, not one per layer. */
        var st = GE().scene.getStyle();
        var ls = (st && Array.isArray(st.layers)) ? st.layers : [];
        for (var i = 0; i < ls.length; i++) {
          var l = ls[i]; if (!l || !l.id) continue;
          if (!(l.layout && l.layout.visibility === 'none')) out.push(String(l.id));
        }
      } catch (_) { }
      return out;
    }
    function cameraNow() {
      try {
        var c = GE().camera.getCenter();
        /* Accept the object both adapters return AND an array, so the next adapter cannot reproduce
           the silent-NaN failure by returning the other shape. */
        var lng = (c && c.lng != null) ? +c.lng : (Array.isArray(c) ? +c[0] : NaN);
        var lat = (c && c.lat != null) ? +c.lat : (Array.isArray(c) ? +c[1] : NaN);
        /* An unreadable centre is NOT a centre of NaN. Returning null makes the verifier say
           `no_change` because it could not observe, which is the honest answer; a NaN that
           stringifies to null claims the camera was observed and found identical. */
        if (!isFinite(lng) || !isFinite(lat)) return null;
        return { lng: +lng.toFixed(5), lat: +lat.toFixed(5), zoom: +(+GE().camera.getZoom()).toFixed(3),
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
    /* ══ ⚠⚠⚠ 「IS IT ON THE MAP」 IS ASKED OF THE RENDERER, ONCE (render.drawn — js/geo-engine.js) ══════
       This file used to answer it itself, from source ids typed into `paintNow()`, the isochrone
       observer and the faction observer — and every typed id was a surface somebody else had to
       remember to list. The #R551 shape cost `research.historicalMap` its own verifier, then `factions`,
       then `routing.isochrone` (#R740: five redraws of one reach called `not_rendered`), then the
       markers (R802 §3: `research.situationMap` alternating ok / not_rendered in one turn).
       Now the PAINTER claims its sources beside the code that creates them, under the effect keys the
       capabilities in the table below declare they write (`GE().render.claim(id, 'map.isochrone')`),
       and the renderer answers for both engines through members both adapters implement.
       ⚠ THREE ANSWERS, NOT TWO: drawn / gone / 「could not be asked」. `rendererDrawn()` is null when the
       contract has no answer at all (an older renderer, a test stub) — and then nothing below changes
       the verdict it gave before. */
    function rendererDrawn(q) {
      try { var E = GE(); if (!E || !E.render || typeof E.render.drawn !== 'function') return null; return E.render.drawn(q || {}) || null; } catch (_) { return null; }
    }
    /* true / false / null — `false` is 「the renderer is up but cannot draw yet」, `null` 「no one to ask」 */
    function rendererObservable() { var r = rendererDrawn({ sources: [] }); return r ? !!r.observable : null; }
    /* the features on the map in the surfaces claimed under `owner`: -1 when none of them exists or the
       renderer cannot be asked, because 「could not observe」 is never 0 (the #R397 reading) */
    function ownedFeatures(owner) {
      var r = rendererDrawn({ owners: [owner] }); if (!r || !r.observable) return -1;
      var n = -1;
      Object.keys(r.surfaces).forEach(function (id) {
        var s = r.surfaces[id]; if (s.state === 'absent' || s.state === 'unknown') return;
        n = Math.max(n, 0) + (s.state === 'drawn' ? (s.features != null ? +s.features : 1) : 0);
      });
      return n;
    }
    /* the surfaces claimed under the effects THIS capability declares it writes (column 5 of the table) —
       null when it declares none, or nothing is claimed under them, or there is no renderer to ask */
    function ownSurfaces(capId) {
      var c = capId && byId[capId]; var w = (c && c.effects && c.effects.writes) || [];
      if (!w.length) return null;
      var r = rendererDrawn({ owners: w });
      return (r && Object.keys(r.surfaces).length) ? r : null;
    }
    /* every claimed surface and what it holds now — DISCOVERED from the claims, not listed here */
    function surfaceInventory() {
      var r = rendererDrawn({}); if (!r || !r.observable) return null;
      var o = {};
      Object.keys(r.surfaces).sort().forEach(function (id) { var s = r.surfaces[id]; o[id] = s.state === 'drawn' ? (s.features != null ? +s.features : 'drawn') : s.state; });
      return o;
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
    /* the Atlas-drawn canvases: what each holds right now.
       ⚠ THE SURFACES ARE NO LONGER LISTED HERE. Seven source ids used to be typed on these lines (#R397
       found two of them invented; #R740 found the reach missing; R802 the markers), and a surface
       nobody typed was one no count could see move. They are now the surfaces painters CLAIM with the
       renderer (`surfaces`, from `render.drawn()`), so a new painter is observed the moment it claims.
       `compose` and `factions` stay as named readings because two verifiers below read exactly those —
       they are asked by EFFECT KEY, the same key the table declares, not by source id. */
    function paintNow() {
      return { surfaces: surfaceInventory(),
        compose: ownedFeatures('map.compose'),     /* (#R511) js/atlas-map-compose.js claims its one source under this key */
        factions: ownedFeatures('map.factions'),   /* js/atlas-sims.js claims the faction fills of the historical power map */
        visible: visibleLayerIds().length, objects: objectIds().length,
        /* ⚠⚠⚠ (#R736) THE SURFACES ABOVE ARE SOURCES; A COUNTRY HIGHLIGHT IS NOT ONE. It paints with
           `setFeatureState` on `nlq-src` (and, while Chronos is in the past, into `nlq-era-src`), so every
           count above is identical before and after a highlight that worked perfectly — and `verify()` below
           calls an unmoved reading `not_rendered`. Measured in production 2026-09-15: three highlights
           painted, three verdicts of `not_rendered`, and the turn died at its working limit re-trying them.
           So the painter declares its own painted state (js/atlas-console.js `window._imAtlasPaint`) and this
           reading carries it. A surface added there is observed here on the next turn; a surface added to a
           list kept HERE is one somebody must remember to list, which is the failure #R735 already paid for
           with `nlq-fac-src` (.agents/rules/no-ad-hoc-hardcoding.md §2.4). */
        atlas: (function(){ try{ var P=window._imAtlasPaint; return (P&&P.now&&P.now())||null; }catch(_){ return null; } })() };
    }

    function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }
    var CAMERA_SETTLE_MS = 2500;   /* see the camera observer below */
    /* ══ ⚠⚠⚠ (#R768) WAS THE PAGE DRAWING WHEN THE CAMERA WAS LAST OBSERVED? ═══════════════════════
       true / false / null (= could not be asked). Written by the camera OBSERVER, read by its
       verdict, because 「is this page compositing?」 is something you SEE, not something you decide.
       ⚠ IT IS NOT IN THE OBSERVATION OBJECT ON PURPOSE. `changed()` is a JSON comparison of the whole
       sample (line above), so a field that flipped between the before and after samples would read as
       「the camera moved」 — a completion invented out of a fact about the window manager.
       ⚠ ONE SLOT IS ENOUGH because camera operations do not interleave: `writes` makes them share a
       conflict key, so the executor serialises them (js/atlas-executor.js). If that ever stops being
       true, this becomes per-operation state and the verdict reads it from `op`. */
    var _camDrew = null;
    /* legacy(raw) — what a not-yet-migrated dispatch case said about itself. A verifier may use it,
       but it may never be the ONLY evidence for `completed` on a capability that writes something. */
    function legacyOk(raw) { return !!(raw && raw.ok !== false); }
    function legacyCode(raw) { return (raw && raw.meta && raw.meta.code) || ''; }

    /* ══ ⚠⚠⚠ (#R740) WHAT THE READER ASKED FOR IS A VIEW, NOT A MOVEMENT ══════════════════════════
       The camera verdict used to read: 「one that asked for movement is complete only when the camera
       really is somewhere else」. That invariant is wrong, and it is the SAME wrongness the isochrone
       verifier above was built to end — 「did anything move」 instead of 「is what was asked for on the
       map」. `clear` already knows it (`moved ? 'ok' : 'already_clear'`, both `completed`).
       MEASURED on production 2026-09-15, signed in, 「ヨーロッパの気温をGFSモデルで表示して、等圧線も
       重ねて。ついでに風のパーティクルも気温の上に出して。」 — 7 steps, 92 s, ending in
       `stopped: repeated_calls`:
           flyTo "ヨーロッパ" [no_change] ×2 → flyTo "Europe" [no_change] ×2 → flyTo "ヨーロッパ" [ok]
       Europe was on the screen from the first step. The three layers all answered `ok` and really were
       drawn; the whole turn was spent flying to where the camera already was — the loop even switched
       language, as if the WORD had been the problem.
       ⚠ THE JUDGEMENT IS ONLY EVER AN UPGRADE. Below, a measured goal can turn `no_change` into
       `already_there`; it can never turn a completion into a failure. So a request this file cannot
       measure keeps exactly the verdict it had before, and nothing is claimed that was not observed. */
    /* the rectangle the reader is actually looking at. BOTH adapters expose the same four readers on
       the object `camera.getBounds()` returns (js/geo-engine.js:1145 → MapLibre's LngLatBounds,
       js/cesium-engine.js:2352 builds the same four) — `contains()` is NOT on both, so it is not used. */
    function viewportNow() {
      try {
        var b = GE().camera.getBounds(); if (!b) return null;
        var w = +b.getWest(), e = +b.getEast(), s = +b.getSouth(), n = +b.getNorth();
        if (!isFinite(w) || !isFinite(e) || !isFinite(s) || !isFinite(n)) return null;
        return { w: w, e: e, s: s, n: n };
      } catch (_) { return null; }
    }
    /* true / false / null — and `null` means 「could not be observed」, never 「probably yes」. */
    function pointInView(lng, lat) {
      if (!isFinite(lng) || !isFinite(lat)) return null;
      var v = viewportNow(); if (!v) return null;
      if (lat < Math.min(v.s, v.n) || lat > Math.max(v.s, v.n)) return false;
      var span = v.e - v.w;
      if (span >= 360 || span <= -360) return true;                 /* the whole planet is on screen */
      span = ((span % 360) + 360) % 360;
      var off = (((lng - v.w) % 360) + 360) % 360;                  /* east of the west edge, wrapping once */
      return off <= span;
    }
    /* the box shape every caller of `flyToBox` works in: [[west,south],[east,north]] — the same one
       js/atlas-geo-resolve.js `_bboxOK` validates. A box that is not that shape is not a box. */
    function boxOf(b) {
      try {
        var w = +b[0][0], s = +b[0][1], e = +b[1][0], n = +b[1][1];
        if (!isFinite(w) || !isFinite(s) || !isFinite(e) || !isFinite(n)) return null;
        if (e <= w || n <= s) return null;
        return { w: w, s: s, e: e, n: n };
      } catch (_) { return null; }
    }
    /* ⚠ THE FLOOR IS A FLOOR, NOT A GUESS ABOUT GEOGRAPHY.
       OBSERVED: js/atlas-geo-resolve.js `flyToBox` (:693) fits the box through `camera.forBounds`
       with padding ≈ 9% of the smaller viewport side, and falls back to `fitBounds(padding:46)`. A
       camera that has just landed there therefore contains the WHOLE box — the measured fraction is
       1.0 on both axes, and padding and `maxZoom` can only make the viewport larger, never smaller.
       The floor is set below that to absorb the ONE thing that is approximate: `getBounds()` reports
       a rectangle for a view that is a trapezoid once the camera is pitched, and the globe adapter
       computes it from a view rectangle (js/cesium-engine.js:2342).
       EXPIRES IF: `flyToBox` stops fitting the whole box (e.g. it gains a zoom floor of its own).
       CANONICAL: this line — nothing else needs this number. */
    var BOX_ON_SCREEN_MIN = 0.5;
    function boxOnScreen(box) {
      var b = boxOf(box); if (!b) return null;
      var v = viewportNow(); if (!v) return null;
      var vs = Math.min(v.s, v.n), vn = Math.max(v.s, v.n);
      var latSeen = (Math.min(vn, b.n) - Math.max(vs, b.s)) / (b.n - b.s);
      if (!(latSeen > 0)) return false;
      var span = v.e - v.w;
      if (span >= 360 || span <= -360) return latSeen >= BOX_ON_SCREEN_MIN;   /* every longitude is on screen */
      var vw = ((span % 360) + 360) % 360;
      var bw = b.e - b.w;
      /* the box's west edge measured east from the view's west edge — and the same edge one turn
         back, which is where a box that starts WEST of the view sits. The wider overlap is the one. */
      var off = (((b.w - v.w) % 360) + 360) % 360;
      var seen = function (o) { return Math.max(0, Math.min(o + bw, vw) - Math.max(o, 0)); };
      var lngSeen = Math.max(seen(off), seen(off - 360)) / bw;
      return Math.min(latSeen, lngSeen) >= BOX_ON_SCREEN_MIN;
    }
    function axisMet(cam, cl) {
      var got = +cam[cl.axis];
      if (!isFinite(got) || !isFinite(cl.want)) return null;
      var d = Math.abs(got - cl.want);
      if (cl.wrap) { d = d % cl.wrap; d = Math.min(d, cl.wrap - d); }   /* 359° and 1° are 2° apart */
      return d <= cl.tol;
    }
    /* ⚠ WHAT EACH CAMERA CAPABILITY'S NUMBERS MEAN — and it has to be per capability, because NINE of
       them share one observer and `deg` drives the BEARING in `case 'bearing'` and the PITCH in
       `case 'pitch'` (js/atlas-console.js). A shared verifier cannot tell those apart without being
       told which capability it is verifying, so build() passes the id.
       ⚠ WHAT IS MEASURABLE IS WHAT THE ARGUMENTS STATE AS A NUMBER, WHAT THEY STATE AS A COORDINATE,
       AND WHAT THE DISPATCH DECLARES IT RESOLVED. Not measurable, and therefore left alone:
         · a direction WORD (`dir:'north'`, `toward:'ne'`) is resolved by a table that lives in the
           dispatch case; a second copy of that table here would be the same judgement in two places
           (.agents/rules/no-ad-hoc-hardcoding.md §2.3), and
         · a `delta` asks for movement by its very nature.
       ⚠ A NAMED PLACE USED TO BE THE THIRD ITEM ON THAT LIST, and it was the production failure
       itself: js/atlas-console.js resolved 「ヨーロッパ」, handed the extent to the module-private
       `_setLast(ext)`, and returned `R(true, note('Moved to: …'))` with no `meta`, so the gazetteer's
       answer never reached this file and the only way to pass would have been to guess. The repair is
       #R736's rule applied to the camera — THE MOVER DECLARES WHAT IT RESOLVED — so the flyTo case
       now returns its destination in `meta.dest` (the third argument of `R()`, exactly as
       `case 'query'` already does with `resultKey`), and this table reads it. ⚠ READS, NOT TRUSTS:
       the declared destination is held against the viewport below, so a dispatch that declares a
       destination it did not fly to still answers `no_change`. */
    var CAMERA_GOAL = {
      'view.flyTo': function (a, raw) {
        /* THE MOVER'S OWN DECLARATION FIRST. js/atlas-console.js's `case 'flyTo'` now returns the
           destination it actually handed to the camera in `meta.dest` — every branch that moves, and
           nothing at all from a branch that resolved nothing. That is what makes a NAMED place
           measurable here: the gazetteer answer never reached this file before, and guessing that an
           unmoved camera must already have been looking at 「ヨーロッパ」 is the one thing a verdict
           may not do. ⚠ The declaration is read, not trusted: what it says is held against the
           viewport, so a dispatch that declared a destination it did not fly to still fails. */
        var d = raw && raw.meta && raw.meta.dest;
        if (d) {
          var g0 = [];
          /* a fitted box is the request; its centre alone would pass a camera zoomed into one street */
          if (d.box && boxOf(d.box)) g0.push({ kind: 'box', box: d.box });
          else if (d.lng != null && d.lat != null) g0.push({ kind: 'point', lng: +d.lng, lat: +d.lat });
          else return null;                                    /* declared something unmeasurable */
          if (d.zoom != null) g0.push({ axis: 'zoom', want: +d.zoom, tol: 0.05 });
          return g0;
        }
        if (!(a.lng != null && a.lat != null)) return null;
        var g = [{ kind: 'point', lng: +a.lng, lat: +a.lat }];
        if (a.zoom != null) g.push({ axis: 'zoom', want: +a.zoom, tol: 0.05 });
        return g;
      },
      'view.zoom': function (a) { return (a.to != null) ? [{ axis: 'zoom', want: +a.to, tol: 0.05 }] : null; },
      'view.bearing': function (a) {
        if (a.deg == null) return null;
        var g = [{ axis: 'bearing', want: +a.deg, tol: 0.5, wrap: 360 }];
        if (a.pitch != null) g.push({ axis: 'pitch', want: +a.pitch, tol: 0.5 });   /* the case eases both at once */
        return g;
      },
      'view.pitch': function (a) {
        if (a.deg != null) return [{ axis: 'pitch', want: +a.deg, tol: 0.5 }];
        if (a.on === false) return [{ axis: 'pitch', want: 0, tol: 0.5 }];          /* 「傾きを戻して」 */
        return null;
      }
    };
    function cameraGoalMet(capId, args, cam, raw) {
      var mk = CAMERA_GOAL[capId];
      if (!mk || !args || !cam) return null;
      var goal = null; try { goal = mk(args, raw); } catch (_) { goal = null; }
      if (!goal || !goal.length) return null;
      for (var i = 0; i < goal.length; i++) {
        var g = goal[i];
        var met = (g.kind === 'box') ? boxOnScreen(g.box)
          : (g.kind === 'point') ? pointInView(g.lng, g.lat) : axisMet(cam, g);
        if (met !== true) return met;   /* false = measured and not met · null = could not observe */
      }
      return true;
    }

    /* ══ ⚠⚠⚠ (#R742) THE SAME QUESTION, ASKED OF A PAINT: 「IS WHAT WAS ASKED FOR ON THE MAP」 ═════
       The camera table above ended 「did anything move」 for the camera. The paint verdict below still
       asked it, and every value `paintNow()` reads is a CARDINAL — counts of features, of visible
       layers, of objects, and (since #R736) the painter's own counts of highlighted countries,
       polygons, lines and shaded codes. A cardinal cannot tell a redraw from a failure, and it cannot
       tell a REPAIR from either: six countries repainted as six other countries is 6 → 6.
       MEASURED on production 2026-09-15, signed in:
           「Which countries border Kazakhstan?」 — the map painted the six neighbours on the first
           call, and the verdicts were `highlight:FAIL/failed` → `FAIL/not_rendered` → `FAIL/not_rendered`
           over ten steps; 「シベリア鉄道の経路」 — `railAxis:FAIL/not_rendered` five times in 1m44s;
           「地中海の最深点へ飛んでマークして」 — 22 steps, 2m14s, the same pin dropped six times.
       So the paint verdict gets the third rung the camera has: the PAINTER declares what it painted
       (`raw.meta.painted`, keyed by the same names js/atlas-era-highlight.js reports under `ids`) and
       this holds the declaration against the map as it is NOW. ⚠ READ, NOT TRUSTED — a dispatch that
       declares six countries it did not paint still answers `not_rendered`. ⚠ AND NOTHING IS GUESSED:
       no declaration, or a declaration naming a surface this reading does not hold, returns `null`
       and the verdict is exactly the one it was before. */
    /* ⚠⚠⚠ (#R747) …AND THE SAME QUESTION ASKED OF A REMOVAL. #R742 gave the painter a way to say
       WHAT IT PUT ON THE MAP, and every reading below is「is it there」. A painter that TOOK things
       off has nothing to point at, so it fell to the last line of `paint.verify` — `not_rendered`,
       i.e. failed — and Atlas, told its clear had failed, cleared again. MEASURED on production
       2026-09-15, signed in:「Colour the world by population density」 spent SIX of its sixteen
       operations on `reset`, every one `FAIL/not_rendered`, and 「Clear everything from the map」
       ended `stopped:'repeated_calls'` in 36 s with `map.clearHighlights` twice refused — while the
       map was, in fact, clear. `map.clear` had already been given `clear`'s verdict for exactly this
       reason (the block below its verifier says so), but the rule was attached to that ONE ROW: the
       capability that clears HIGHLIGHTS, and `highlight {on:false}` which clears them through the
       drawing capability itself, were never covered.
       So the declaration gets its other half: an EMPTY list for a surface means「nothing of this kind
       should be on the map now」, and it is verified the same way — READ, NOT TRUSTED. A clear that
       declares the highlights gone while six countries are still painted is still `not_rendered`.
       ⚠ Absent ≠ undeclared: `{}` and a missing `meta.painted` still return null, because a painter
       that said nothing has not made a claim. Only a NAMED surface with an empty list is a claim. */
    function PAINT_GOAL(raw) {
      var d = raw && raw.meta && raw.meta.painted;
      if (!d || typeof d !== 'object') return null;
      var out = [];
      Object.keys(d).forEach(function (kind) {
        var v = d[kind]; if (v == null) return;
        var want = [];
        (Array.isArray(v) ? v : [v]).forEach(function (x) { var s = String(x == null ? '' : x); if (s && want.indexOf(s) < 0) want.push(s); });
        if (want.length) out.push({ kind: kind, want: want });
        else if (Array.isArray(v)) out.push({ kind: kind, want: [], empty: true });   /* (#R747) 「this surface is to be empty」 */
      });
      return out.length ? out : null;
    }
    /* how much of the declaration is on the map — {want, have} — or `null` when it cannot be measured.
       ⚠ COUNTS, WHERE THE CAMERA HAS A BOOLEAN, because a paint CAN be half-done: fourteen oblasts of
       which eleven resolved is a real state of the world and the camera has no equivalent of it. */
    function paintReach(after, raw) {
      var goal = PAINT_GOAL(raw); if (!goal) return null;
      var ids = after && after.atlas && after.atlas.ids;
      if (!ids) return null;                                     /* the painter declared no state to read */
      var want = 0, have = 0;
      for (var i = 0; i < goal.length; i++) {
        var seen = ids[goal[i].kind];
        if (!Array.isArray(seen)) return null;                   /* a surface this reading does not hold */
        if (goal[i].empty) { want++; if (seen.length === 0) have++; continue; }   /* (#R747) an emptied surface is one thing asked for, and the map answers it */
        for (var j = 0; j < goal[i].want.length; j++) { want++; if (seen.indexOf(goal[i].want[j]) >= 0) have++; }
      }
      return want ? { want: want, have: have } : null;
    }
    /* the camera's discipline exactly: true / false / null, and `null` is never 「probably yes」. */
    function paintGoalMet(after, raw) { var r = paintReach(after, raw); return r ? (r.have === r.want) : null; }

    var OBSERVERS = {
      none: {
        observe: function () { return null; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          return { status: 'completed', code: legacyCode(raw) || 'ok', html: (raw && raw.html) || '' };
        }
      },
      /* ══ ⚠⚠ (#R543) A CHART IS PRODUCED INTO THE REPLY, NOT ONTO THE MAP ═══════════════════════
         So `observe()` has nothing global to sample — `paintNow()` would report the same numbers
         before and after and call every chart `not_rendered`. What CAN be observed is the artefact
         itself: js/atlas-chart.js stamps `data-mark` on every point, bar and event it actually
         emits, and reports how many it drew. This counts the marks IN THE HTML THE READER WILL
         RECEIVE and holds that against the renderer's own count. ⚠ THE COUNT IS THE EVIDENCE, THE
         REPORT IS ONLY THE CLAIM: a renderer that returns `ok` around an empty figure is `partial /
         not_rendered`, the same verdict `paint` gives a draw that painted nothing. This is why the
         mark is an attribute and not a class — #R488's dead selector passed every spelling check. */
      chart: {
        observe: function () { return null; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var html = (raw && raw.html) || '';
          var marks = (html.match(/data-mark="1"/g) || []).length;
          var claimed = (raw && raw.meta && raw.meta.chart && +raw.meta.chart.plotted) || 0;
          if (!marks) return { status: 'partial', produced: [], code: 'not_rendered', observed: { chart: { marks: 0, claimed: claimed } }, html: html };
          if (claimed && marks !== claimed) return { status: 'partial', produced: [], code: 'not_rendered', observed: { chart: { marks: marks, claimed: claimed } }, html: html };
          return { status: 'completed', code: 'ok', observed: { chart: { marks: marks, kind: (raw.meta && raw.meta.chart && raw.meta.chart.kind) || '' } }, html: html };
        }
      },
      camera: {
        /* ⚠ THE AFTER SAMPLE IS TAKEN WHEN THE CAMERA HAS ARRIVED, NOT WHEN THE CALL RETURNED.
           flyTo / easeTo / fitBounds in js/atlas-console.js return at once and animate for ~1.1 s
           (`duration:1100`), and the executor observes the instant the call returns — so a move
           that was plainly under way was compared against itself and reported `no_change`.
           Measured on production (2026-09-15): 「富士山の標高は？地図で見せて」 flew to Fuji and was
           told it had not moved, and Atlas went researching instead of reading the map. The wait
           ends when the renderer says it is no longer easing (GE().isAnimating) and two samples
           100 ms apart agree; CAMERA_SETTLE_MS bounds it at 2.5 s — the longest animation any
           dispatch case writes is 1.1 s, and a bound that holds twice that is still far below
           a tool timeout. Raise it when a longer camera animation is written. A camera that is
           idle when sampled (the BEFORE sample, a read) returns immediately. */
        observe: async function () {
          var t0 = Date.now(), prev = cameraNow();
          try { _camDrew = await GE().render.ticking(700); } catch (_) { _camDrew = null; }
          while ((Date.now() - t0) < CAMERA_SETTLE_MS) {
            var moving = false; try { moving = !!(GE().isAnimating && GE().isAnimating()); } catch (_) { moving = false; }
            await new Promise(function (r) { setTimeout(r, 100); });
            var cur = cameraNow();
            if (!moving && !changed(prev, cur)) return cur;
            prev = cur;
          }
          return cameraNow();
        },
        verify: function (ctx, args, before, after, raw, capId) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (!hasRenderer()) return { status: 'failed', code: 'unavailable', html: (raw && raw.html) || '' };
          if (!before || !after) return { status: 'partial', produced: [], code: 'no_change', html: (raw && raw.html) || '' };
          /* the camera IS somewhere else: whatever was asked for, something happened */
          if (changed(before, after)) return { status: 'completed', code: 'ok', observed: { camera: after }, html: (raw && raw.html) || '' };
          /* nothing moved. A camera op that asked for no movement (a re-assert) is complete. */
          var wantsMove = !!(args && (args.place || args.lng != null || args.to != null || args.delta != null ||
            args.deg != null || args.dir != null || args.direction != null || args.zoom != null || args.toward));
          if (!wantsMove) return { status: 'completed', code: 'ok', observed: { camera: after }, html: (raw && raw.html) || '' };
          /* ⚠ (#R740) …and one that named a view the camera is ALREADY in is complete too. The reader
             asked for a state, not for a movement; re-flying to where you already are is the request
             being satisfied, and calling it a failure is what spent a whole turn on `repeated_calls`.
             Its own code, not `no_change`, because it is not a failure — `clear`'s `already_clear`. */
          if (cameraGoalMet(capId, args, after, raw) === true) {
            return { status: 'completed', code: 'already_there', observed: { camera: after, already: true }, html: (raw && raw.html) || '' };
          }
          /* ══ ⚠⚠⚠ (#R768) 「IT DID NOT MOVE」 AND 「I COULD NOT SEE IT MOVE」 ARE DIFFERENT ANSWERS ══
             A page that is not compositing runs no animation frames, so `flyTo` really does leave the
             camera where it was — and this file used to report that as `no_change`, i.e. a failure of
             the request. It is not one: the request was fine, the renderer was asleep.
             MEASURED on production 2026-09-16, signed in, 「アイスランドに飛んで」 in a backgrounded
             tab: 9 model calls, 8 operations, SEVEN of them `partial / no_change`, ending in
             `step_budget` with the reader told the turn hit its working limit. The identical question
             with the tab in front: ONE model call, `completed / ok`, `answered`.
             ⚠ Atlas was not wrong to retry — a failed move is exactly the case where trying again is
             right (.agents/rules/one-pass-or-a-reason.md §5). It was told the wrong thing. So this
             says what is actually true, and Atlas decides what to do with it: nothing here refuses a
             call, shortens a plan or spends a step (CONSTITUTION.md §5).
             ⚠ THE OBSERVER ASKED, NOT THIS VERDICT. `_camDrew` is the reading taken beside the AFTER
             sample (see it above) — which is also the honest moment to take it, and it keeps this
             function SYNCHRONOUS. An earlier draft of this round made `verify` async instead and so
             changed the contract of every camera capability (flyTo, bearing, pitch, resetNorth) for a
             fact none of them decides; twelve tests in tests/r740-isochrone-verdict-checks.test.mjs
             said so, and they were right.
             ⚠ THE READING MAY ONLY WEAKEN A CLAIM. `null` — an engine that cannot answer, or that
             threw — leaves the verdict exactly as it was. Nothing is ever DOWNgraded to a failure on
             the strength of a question we could not get an answer to. */
          if (_camDrew === false) return { status: 'partial', produced: [], code: 'not_rendering', observed: { camera: after, rendering: false }, html: (raw && raw.html) || '' };
          /* asked for a view this file cannot measure, and nothing moved: unchanged from before */
          return { status: 'partial', produced: [], code: 'no_change', observed: { camera: after }, html: (raw && raw.html) || '' };
        }
      },
      layer: {
        observe: function () { return { visible: visibleLayerIds(), n: visibleLayerIds().length }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          /* #R73's real question, kept: the dispatch case already polls the style for a delta and
             flags `meta.unverified` when nothing painted. Honour that flag rather than re-deriving. */
          if (raw && raw.meta && raw.meta.unverified) return { status: 'partial', produced: [], code: 'no_change', html: raw.html || '' };
          if (raw && raw.meta && raw.meta.already) return { status: 'completed', code: 'ok', html: raw.html || '' };
          return { status: 'completed', code: 'ok', observed: { layers: after }, html: (raw && raw.html) || '' };
        }
      },
      paint: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw) {
          var html = (raw && raw.html) || '';
          var unresolved = (raw && raw.exec && Array.isArray(raw.exec.unresolved)) ? raw.exec.unresolved : [];
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: html };
          /* the dispatch says some of what it was asked for never resolved. ⚠ (#R742) THAT IS A
             STATEMENT ABOUT THE TARGETS, NOT ABOUT THE MAP: this used to return `not_rendered` without
             looking at the map at all, so thirteen oblasts drawn and one unresolved was reported as
             「nothing was drawn」 and Atlas redrew all fourteen. The map is read first, below; the
             names ride along as `unresolved` either way, because the repair loop reads them. */
          var short = !!(raw && raw.meta && raw.meta.partial);
          /* a clear-shaped op is complete when the canvases came DOWN; a draw-shaped one when they
             went UP. Anything that moved is evidence; nothing moving is `not_rendered`. */
          if (!before || !after) {
            return short ? { status: 'partial', produced: [], code: 'not_rendered', html: html, unresolved: unresolved }
              : { status: 'completed', code: legacyCode(raw) || 'ok', html: html };
          }
          var moved = changed(before, after);
          var reach = paintReach(after, raw);                    /* what the painter declared, held against the map */
          if (short) {
            /* something of it IS on the map: a draw that reached most of its targets is a draw */
            if (moved || (reach && reach.have > 0)) {
              return { status: 'completed', code: 'partially_resolved', observed: { paint: after, reach: reach || null }, unresolved: unresolved, html: html };
            }
            return { status: 'partial', produced: [], code: 'not_rendered', observed: { paint: after }, unresolved: unresolved, html: html };
          }
          if (moved) return { status: 'completed', code: 'ok', observed: { paint: after }, html: html };
          /* ⚠ (#R742) …and a redraw of what is ALREADY painted is complete too — the reader asked for
             a state. `already_there` is the camera's word for the same fact and says it to the reader
             in every language already (js/atlas-results.js `atlas.code.already_there`). */
          if (paintGoalMet(after, raw) === true) {
            return { status: 'completed', code: 'already_there', observed: { paint: after, already: true }, html: html };
          }
          return { status: 'partial', produced: [], code: 'not_rendered', observed: { paint: after }, html: html };
        }
      },
      /* ══ ⚠⚠⚠ A POWER MAP THAT IS ON THE MAP IS RENDERED, WHETHER OR NOT THE COUNT MOVED ══════════
         `research.historicalMap` was declared `paint`, and `paintNow()` did not read the faction
         source at all — so the verdict was whatever ELSE happened to move. Measured on production
         (2026-09-15, 「1900年の世界地図を見せて」): the first draw passed because the clock had just
         changed, the next four were all called `not_rendered` while their legends sat in the reply
         and their fills on the globe; Atlas, told four times that nothing was drawn, drew the same
         map SIX times and spent every step of the turn on it, and the reader never got the answer.
         The #R551 shape again: a count diff answers «did something move», not «is the thing that was
         asked for on the map». So this verifier reads the faction source AFTER the call: features
         there = the map is up; none = `not_rendered`. A redraw of an identical map is rendered. */
      /* ══ A CLEAR THAT FOUND NOTHING TO CLEAR IS COMPLETE ══════════════════════════════════════
         `map.clear` was `paint`, so removing something that is not a paint — the weather card, a
         route the routing module owns — moved no count and was reported `not_rendered`; and a clear
         of a map that was already clean was reported the same way, as if it had failed. The state
         the reader asked for is the state; that is the queryRows reading (#R495), pointed at
         removal. What is observed is the map AND the open panels; what the case says it cleared
         rides along as `observed.cleared` so Atlas can name it. */
      clear: {
        observe: function () { return { paint: paintNow(), panels: openPanelIds() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var cleared = (raw && raw.exec && Array.isArray(raw.exec.cleared)) ? raw.exec.cleared : [];
          var moved = !!(before && after && changed(before, after));
          return { status: 'completed', code: moved ? 'ok' : 'already_clear', observed: { cleared: cleared, paint: after && after.paint, panels: after && after.panels }, html: (raw && raw.html) || '' };
        }
      },
      factions: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var n = (after && +after.factions) || 0;
          if (n > 0) return { status: 'completed', code: 'ok', observed: { factions: n }, html: (raw && raw.html) || '' };
          return { status: 'partial', produced: [], code: 'not_rendered', observed: { factions: 0 }, html: (raw && raw.html) || '' };
        }
      },
      /* ══ ⚠⚠⚠ (#R740) A REACHABLE AREA THAT IS ON THE MAP IS RENDERED — THE THIRD TIME ═══════════
         `routing.isochrone` was declared `paint`, and `paintNow()` does not read the isochrone source
         at all (js/map-tools.js:1042 `const SRC='im-iso-src'`, drawn as im-iso-fill / im-iso-line /
         im-iso-ctr). So the verdict was whatever ELSE happened to move.
         MEASURED on production 2026-09-15, signed in, 「渋谷駅から徒歩30分で行ける範囲を地図に出して。
         面積も教えて。」 — six isochrone calls in 1m09s: the first `ok` (because `visible`/`objects`
         moved, not because anything looked at the reach), the next five `not_rendered` while the
         polygon sat on the screen the whole time. Atlas, told five times that nothing was drawn,
         redrew the same area five times, burned the step budget, and then called `reset`, which took
         the highlight DOWN; the reply ended in a promise in the future tense and the area the reader
         asked for was never answered. ⚠ And the five redraws stacked: five `fill-opacity:0.18`
         polygons over one another is better than 60% opaque, so the repair loop also made the basemap
         underneath unreadable.
         ⚠⚠ THIS IS THE THIRD TIME IN THIS FILE — the #R551 shape (a count diff answers «did something
         move», not «is the thing that was asked for on the map») already cost `research.historicalMap`
         and `factions` their own verifiers, above. The reason it keeps coming back is that the surfaces
         a verdict can see are enumerated HERE, by hand, in `paintNow()`: a module that paints a new
         source is invisible until somebody remembers to list it, and nothing makes them remember.
         THE GENERAL FIX IS THE ONE #R736 STARTED: the painter DECLARES its own painted surface
         (js/atlas-console.js `window._imAtlasPaint`) and the verdict asks that declaration — a list
         that is discovered rather than typed (.agents/rules/no-ad-hoc-hardcoding.md §2.4). Until
         js/map-tools.js declares itself there, this verifier names the one source the reach writes,
         and reads it AFTER the call: features there = the area is up, redraw or not; none =
         `not_rendered`. The refusal is not removed — an empty source is still a failure to render. */
      isochrone: {
        /* (atlas-observer-undo) the reach is asked of the renderer by its effect key — js/map-tools.js
           claims `im-iso-src` under 'map.isochrone' where it creates it — so no source id lives here */
        observe: function () { return { iso: ownedFeatures('map.isochrone') }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var n = (after && +after.iso) || 0;
          if (n > 0) return { status: 'completed', code: 'ok', observed: { isochrone: { features: n } }, html: (raw && raw.html) || '' };
          return { status: 'partial', produced: [], code: 'not_rendered', observed: { isochrone: { features: 0 } }, html: (raw && raw.html) || '' };
        }
      },
      /* ══ ⚠⚠⚠ (#R551) A COUNT THAT WENT UP IS NOT A MAP THAT IS FINISHED ═══════════════════════
         `map.compose` was declared `paint`, and `paint` asks one question: did anything move? For a
         composition that is the wrong question in BOTH directions.
           · Sixteen places were asked for and five landed. The compose source went 0 → 5, something
             moved, so the verdict was `completed` — and js/atlas-agent.js filed the call as a
             finished success it need not repeat. The module had said `exec.status:'partial'` all
             along; nothing above it was reading that.
           · Sixteen markers redrawn at CORRECTED coordinates is 16 → 16. Nothing moved by the
             count, so a real repair would have been called `not_rendered`.
         So this verifier does not diff a tally. It reads what was ASKED FOR against what is ON THE
         MAP RIGHT NOW (`after.compose` is the live feature count of the one source every compose
         layer reads), and it reports the names that are still missing as `unresolved` so the repair
         loop and Atlas both get them by name rather than as a number. */
      mapCompose: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var ex = (raw && raw.exec) || {};
          var counts = ex.counts || {};
          var missing = Array.isArray(ex.unplaced) ? ex.unplaced : [];
          var names = missing.map(function (u) { return (u && u.name) || String(u || ''); }).filter(Boolean);
          var filled = Array.isArray(ex.fills) && ex.fills.some(function (f) { return f && f.ok; });
          var drew = !!(after && +after.compose > 0);
          var obs = { compose: { requested: +counts.requested || 0, placed: +counts.placed || 0,
            unplaced: names.length, features: (after && +after.compose) || 0,
            artifact: ex.artifact || '', revision: +ex.revision || 0 } };
          /* nothing is on the map and nothing was shaded: the claim is not backed by anything */
          if (!drew && !filled) return { status: 'partial', produced: [], code: 'not_rendered', observed: obs, unresolved: names, html: (raw && raw.html) || '' };
          /* something is there, but not what was asked for */
          if (ex.status === 'partial' || names.length || (raw && raw.meta && raw.meta.partial)) {
            return { status: 'partial', code: 'incomplete', observed: obs, unresolved: names, html: (raw && raw.html) || '' };
          }
          return { status: 'completed', code: 'ok', observed: obs, html: (raw && raw.html) || '' };
        }
      },
      /* ══ ⚠⚠⚠ (#R376) A RASTER SOURCE SWAP DRAWS THE SAME NUMBER OF FEATURES IT DREW BEFORE ══════
         `data.wxModel` was declared `paint`, and `paintNow()` counts Atlas's own query sources plus
         the visible-layer and object tallies. Changing WHICH forecast model a weather layer reads
         moves none of them: same layer count, same object count, and the tiles are raster.
         MEASURED on production, three times, all three models: the switch SUCCEEDED — legend,
         picker, `modelOf()` and the style's source url all became DWD ICON — and the capability
         answered `status:"partial" code:"not_rendered" ok:false`, with `observed.paint.visible = 0`.
         ⚠ THAT IS THE SAME DEFECT AS CLAIMING A SUCCESS THAT DID NOT HAPPEN, pointed the other way:
         a caller who believes the answer stops trusting a feature that works. #R318's rule — `ok` is
         DERIVED from `status`, never asserted — is what made it show up as a lie instead of hiding,
         and the fix belongs where the lie is: the observer has to watch what this capability
         actually changes.
         ⚠ AND IT IS NOT 「trust what the dispatch case returned」. `setModel` resolves only at
         `commit()`, i.e. when the new slot has been revealed — but a verifier that reads only `raw`
         is the shape the audit's ⑰ forbids. This reads the DISPLAYED model back out of the module,
         which is a different source of truth from the one that reported. */
      wxModel: {
        observe: function () {
          try {
            var W = window.IntMapWeatherEC;
            if (!W || !W._layers || !W.modelOf) return null;
            var o = {};
            W._layers.forEach(function (l) { var m = W.modelOf(l.id); if (m) o[l.id] = m; });
            return o;
          } catch (_) { return null; }
        },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          var want = (args && String(args.model || '')) || '';
          var lid = (args && String(args.layer || args.name || '')) || '';
          var alt = 'ec-' + lid.replace(/^(dl-)?(ec-)?/, '');
          var got = after && (after[lid] || after[alt]);
          /* the layer this call named is displaying the model this call asked for */
          if (want && got === want) return { status: 'completed', code: 'ok', observed: { wxModel: after }, html: (raw && raw.html) || '' };
          /* something moved, even if the arguments did not name it in a way we could resolve here */
          if (before && after && changed(before, after)) return { status: 'completed', code: 'ok', observed: { wxModel: after }, html: (raw && raw.html) || '' };
          /* ⚠ 「まだ出ていない」 is a real state and gets its own code — the map may still be building
             the new slot, and `not_rendered` would be a claim about painting we cannot make. */
          return { status: 'partial', produced: [], code: 'not_displayed', observed: { wxModel: after }, html: (raw && raw.html) || '' };
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
          if (!after.painted) return { status: 'partial', produced: [], code: 'not_rendered', observed: { routing: after }, html: (raw && raw.html) || '' };
          if (!after.visible) return { status: 'partial', produced: [], code: 'not_visible', observed: { routing: after }, html: (raw && raw.html) || '' };
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
            return { status: 'partial', produced: [], code: 'no_change', html: (raw && raw.html) || '' };
          }
          return { status: 'completed', code: 'ok', objectIds: made, observed: { objects: after }, html: (raw && raw.html) || '' };
        }
      },
      /* ══ ⚠⚠⚠ (#R495) A QUERY THAT MATCHED NOTHING IS A COMPLETE ANSWER ═══════════════════════
         `data.query` pins its matching rows, so it promises the map — but 「条件を全部満たす都市は
         無い」 is a RESULT, not a failure, and it draws nothing. Under `object` or `paint` that run
         reports `partial / no_change`, i.e. `ok:false`, for an answer that is correct and complete.
         That is #R376's defect pointed the other way: a caller who is told a working feature failed
         stops using it. So the observer watches what this capability ACTUALLY changes — the pins it
         says it made — and treats «no rows, no pins» as the completed run it is. It still cannot
         claim a map it did not draw: when the reply carries object ids, they must be on the map.
         ⚠ NOT A WIDENING OF THE AUDIT'S ⑱. It is a NEW map observer, listed there beside `wxModel`
         for the same stated reason, and it reads the object ledger rather than trusting `raw`. */
      queryRows: {
        observe: function () { return { ids: objectIds() }; },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: (raw && raw.html) || '' };
          var made = (raw && raw.objectIds) ? raw.objectIds.slice() : [];
          if (!made.length) return { status: 'completed', code: 'ok', html: (raw && raw.html) || '' };
          var have = (after && after.ids) || [];
          var landed = made.filter(function (id) { return have.indexOf(id) >= 0; });
          if (!landed.length) return { status: 'partial', produced: [], code: 'not_rendered', observed: { objects: after }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', objectIds: landed, observed: { objects: after }, html: (raw && raw.html) || '' };
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
      /* ══ ⚠⚠⚠ (#R754) THIS ONE ASKS THE PAINTER, AND IT ASKS AFTER ═════════════════════════════
         TWO defects are being avoided at once.
         ① `paintNow()` above is a HAND-WRITTEN list of source ids whose own comment forbids adding
            to it — the failure #R735 paid for with `nlq-fac-src` and #R736 with setFeatureState. The
            pandemic canvas is not in that list and must not be added to it, so the PAINTER declares
            its own state (js/pandemic-atlas.js `painted()`, which reads the live source off the map)
            and this observer calls it. A surface declared beside the code that paints it cannot be
            the surface somebody forgot to list.
         ② IT IS MEASURED AFTER, NOT AS A DIFF — the same correction `factions` and `isochrone` 
            already carry. Drawing day 60 twice moves no count, and a count diff would call the
            second one not_rendered while the dots sat on the globe. What is being asserted is «the
            layer holds the run», which is a fact about the map NOW, not about how it changed.
         ⚠ null IS NOT ZERO. An unreadable canvas returns null and is reported as unobserved rather
            than as empty, because `not_rendered` is a claim and this cannot support it. */
      pandemic: {
        observe: function () { try { var P = window.IntMapPandemicAtlas; return (P && P.painted && P.painted()) || null; } catch (_) { return null; } },
        verify: function (ctx, args, before, after, raw) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          if (!after) return { status: 'completed', code: 'ok', observed: { pandemic: null }, html: (raw && raw.html) || '' };
          if (!after.features) return { status: 'partial', produced: [], code: 'not_rendered', observed: { pandemic: after }, html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', observed: { pandemic: after }, html: (raw && raw.html) || '' };
        }
      },
      sim: {
        observe: function () { return paintNow(); },
        verify: function (ctx, args, before, after, raw, capId) {
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: raw.html || '' };
          /* A simulation that is still computing says so. `raw.running` is what a migrated executor
             sets; a legacy case cannot, so its absence is not evidence of completion — the canvas is. */
          if (raw && raw.running) return { status: 'running', code: 'running', progress: raw.progress || null, html: raw.html || '' };
          /* ⚠⚠⚠ (#R760) A SIMULATOR THAT IS OPEN AND WAITING FOR THE READER HAS NOT FAILED TO DRAW.
             `observe()` here is `paintNow()`, which counts map sources and knows nothing about windows,
             so a simulator whose whole deliverable is a window it just opened moved no number and fell
             to the line below. Measured on production 2026-09-16, 「Fly me through the Grand Canyon in
             the flight simulator」: `sim.flightSim` returned `not_rendered` SEVEN times in 87 s while the
             chooser was on screen saying 「pick your aircraft & runway, then START」, and the reader was
             told the answer might be incomplete. The opener knows what it opened; this reads that
             declaration rather than re-deriving it from a surface that cannot hold it. */
          if (raw && raw.meta && raw.meta.opened) return { status: 'completed', code: 'ok', observed: { opened: raw.meta.opened, paint: after }, html: (raw && raw.html) || '' };
          if (before && after && !changed(before, after)) {
            /* (atlas-observer-undo) …and a simulation re-run over its own drawing moves no count either —
               the #R747 shape. Before calling that `not_rendered`, ask the renderer whether the surfaces
               claimed under THIS capability's declared effects are on the map now. Only an upgrade: no
               claim, or a renderer that cannot be asked, leaves the verdict exactly as it was. */
            var own = ownSurfaces(capId);
            if (own && own.observable && own.drawn.length) return { status: 'completed', code: 'already_there', observed: { paint: after, surfaces: own.drawn, already: true }, html: (raw && raw.html) || '' };
            return { status: 'partial', produced: [], code: 'not_rendered', observed: { paint: after }, html: (raw && raw.html) || '' };
          }
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
          if (!panelMoved && !mapMoved) return { status: 'partial', produced: [], code: 'no_change', html: (raw && raw.html) || '' };
          if (panelMoved && !mapMoved) return { status: 'partial', produced: [], code: 'not_rendered', observed: { panels: after.panels }, html: (raw && raw.html) || '' };
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
          if (before && after && !changed(before, after)) return { status: 'partial', produced: [], code: 'no_change', html: (raw && raw.html) || '' };
          return { status: 'completed', code: 'ok', html: (raw && raw.html) || '' };
        }
      },
      /* ══ (atlas-observer-undo) `map.undo` IS VERIFIED LIKE EVERYTHING ELSE: BY READING, NOT BELIEVING ══
         The undo is js/atlas-state.js `undo()` — ONE mechanism for every turn: the turn's opening
         snapshot of each restorable section, put back section by section. This verdict does not take
         the dispatch's word that it worked: it asks the ledger to capture every section AGAIN and hold
         it against the snapshot (`undoCheck`). A section that did not come back is named in
         `unresolved` — a fly path the turn replaced cannot be redrawn from a snapshot, and saying so is
         the whole point — and a second undo inside the same turn is `already_there`, not a second
         rewind (.agents/rules/one-pass-or-a-reason.md §4: the same call says 「already done」). */
      undo: {
        observe: function () { return null; },
        verify: function (ctx, args, before, after, raw) {
          var html = (raw && raw.html) || '';
          if (raw && raw.ok === false) return { status: 'failed', code: legacyCode(raw) || 'failed', html: html };
          var ex = (raw && raw.exec) || {};
          if (ex.already) return { status: 'completed', code: 'already_there', observed: { undo: { turnId: ex.turnId, already: true } }, html: html };
          var S = null; try { S = window.IntMapAtlasState; } catch (_) { S = null; }
          var chk = (S && typeof S.undoCheck === 'function') ? S.undoCheck(ex.turnId) : null;
          if (!chk) return { status: 'failed', code: 'unavailable', html: html };
          if (chk.unresolved.length) return { status: 'partial', code: 'incomplete', observed: { undo: chk }, unresolved: chk.unresolved.slice(), html: html };
          return { status: 'completed', code: 'ok', observed: { undo: chk }, html: html };
        }
      }
    };
    API.OBSERVERS = OBSERVERS;

    /* ══ ⚠⚠⚠ (atlas-observer-undo) 「I COULD NOT LOOK」 IS NOT 「IT IS NOT THERE」 — FOR EVERY CAPABILITY ═══
       #R768 taught the camera this (`not_rendering`), and only the camera. Every other verdict that
       ends 「nothing moved」 said `not_rendered` / `no_change` whether or not the renderer could have
       shown anything at all — during a style reload, before the style is parsed — and Atlas, told its
       draw had failed, drew again. ONE rule, applied here to every capability that writes the map or
       the camera, instead of one copy per observer: a negative verdict given while the renderer
       itself answers `observable:false` becomes `not_rendering`. ⚠ ONLY A NEGATIVE CAN BE CHANGED, AND
       ONLY INTO 「unobserved」: a completion is never touched, a renderer that cannot be asked (`null`)
       changes nothing, and nothing is refused, retried or capped here (CONSTITUTION.md §5). */
    var NEGATIVE_CODES = { not_rendered: 1, no_change: 1 };
    function drawsOnMap(writes) { return (writes || []).some(function (w) { var h = String(w).split('.')[0]; return h === 'map' || h === 'camera'; }); }
    function unobservedOr(v, writes) {
      if (v && typeof v.then === 'function') return v.then(function (x) { return unobservedOr(x, writes); });
      if (!v || v.status !== 'partial' || !NEGATIVE_CODES[v.code] || !drawsOnMap(writes)) return v;
      if (rendererObservable() !== false) return v;
      return Object.assign({}, v, { code: 'not_rendering', observed: Object.assign({}, v.observed || null, { rendering: false, observable: false }) });
    }

    /* ══ BUILD THE DESCRIPTORS ═══════════════════════════════════════════════════════════════════ */
    var byId = Object.create(null), byAlias = Object.create(null), order = [];
    var runtime = { dispatch: null, docs: null };

    /* bindRuntime — Atlas hands the kernel its dispatcher and its catalogue text when it loads.
       Nothing here calls into Atlas before that; a capability executed earlier answers `unavailable`
       with a reason, which is a true statement, not a silent failure. */
    API.bindRuntime = function (o) {
      if (o && o.schemas) runtime.schemas = o.schemas;   /* (#R406) js/atlas-schemas.js */
      if (!o) return;
      if (typeof o.dispatch === 'function') runtime.dispatch = o.dispatch;
      if (o.docs) runtime.docs = o.docs;
      if (o.resolvePlace) runtime.resolvePlace = o.resolvePlace;
      if (o.pinnedPoint) runtime.pinnedPoint = o.pinnedPoint;
      if (o.selection) runtime.selection = o.selection;
      /* (atlas-semantic-search) the meaning half of the search — see searchFused. Absent = the atlas-embed Edge Function. */
      if (typeof o.semantic === 'function') runtime.semantic = o.semantic;
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
      return function (ctx, args, opts) {
        if (!runtime.dispatch) return Promise.resolve({ ok: false, meta: { code: 'unavailable' } });
        var a = Object.assign({}, args, { type: cap.legacy || cap.id });
        /* ⚠ (#R551) the execution context travels as dispatch's SECOND argument, so a legacy case
           that needs to know which turn it is serving can ask — and one that does not is unchanged. */
        return runtime.dispatch(a, { turnId: (opts && opts.turnId) || null, source: (opts && opts.source) || '',
          operationId: (opts && opts.operationId) || '', capabilityId: cap.id });
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
        case 'text': return any(['query', 'text', 'question', 'value', 'place', 'term']);   /* (#R491) a phrase to explain is a text target like any other */
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
      var ingests = row[11] === 'external' ? 'external' : '';   /* (#R801) column 11, optional — see the column notes */
      var withdrawn = WITHDRAWN[id] || null;
      var cap = {
        id: id, version: 1, legacy: legacy,
        aliases: [legacy].concat(aliases).filter(Boolean),
        category: row[3], observerKind: obsKind,
        titleKey: 'atlas.capability.' + id,
        targetPolicy: target,
        lazyModules: lazy,
        effects: { reads: [], writes: writes, conflictKeys: writes.slice() },
        produces: produces,
        risk: { read: 'read-only', session: 'reversible-session', persist: 'persistent-setting', external: 'external' }[row[7]] || 'reversible-session',
        confirmation: row[8],
        ingests: ingests,
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
        /* ⚠ (#R740) A SHARED VERIFIER IS TOLD WHICH CAPABILITY IT IS VERIFYING. Nine capabilities are
           on the `camera` observer alone, and `deg` means bearing on one of them and pitch on another
           — a verifier that had to infer which axis a number referred to would be guessing, which is
           the one thing a verdict may never do. The extra argument is ignored by every observer that
           does not need it, and `verify(ctx,args,before,after,raw)` still behaves as it always did. */
        verify: function (ctx, args, before, after, raw) { return unobservedOr(obs.verify(ctx, args, before, after, raw, id), writes); },
        examples: [], negativeExamples: [], limitations: []
      };
      cap.execute = legacyExecute(cap);
      /* ⚠ (#R406) THE ARGUMENT SCHEMA, AND IT IS THE TYPES ONLY. All 126 capabilities used to share
         one literal here — `{type:'object'}` — which validates ANY object, so an `analyze` with no
         question and a `highlight` with no target both passed and failed only after execution.
         js/atlas-schemas.js now declares, per capability, what each argument must BE and which ones
         a call must CARRY. Only the first half is handed to the kernel: js/atlas-executor.js
         validates arguments at step ③ and resolves a missing target at step ④, so a BUTTON that
         presses view.flyTo with nothing and lets resolveInputs() ask the reader is behaving
         correctly — enforcing `required` here would turn that into bad_args and break the resume
         path. The demands are enforced by js/atlas-toolsurface.js on what ATLAS sends, which is
         where an argument-less action actually came from.
         ⚠ AND IT IS BOUND, NOT IMPORTED. This file is EAGER (js/app-body.js builds the registry at
         boot); a static import would put the table in the boot chunk for a reader who never opens
         Atlas. Before Atlas loads the fallback is the old permissive shape, which is exactly what
         a pre-Atlas button had before. */
      Object.defineProperty(cap, 'inputSchema', { enumerable: true, get: function () {
        try { var sc = runtime.schemas ? runtime.schemas.schemaFor(id) : null;
          return { type: 'object', properties: (sc && sc.properties) || {} }; }
        catch (_) { return { type: 'object', properties: {} }; }
      } });
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

    /* ══ (atlas-observer-undo) WHICH ROWS THE ONE UNDO REVERSES — DERIVED FROM THE TABLE, NOT LISTED ══
       `hasUndo` in `toJSON()` is `typeof c.undo === 'function'`, and 0 of 145 rows had one. A row gets an
       `undo` (which runs `map.undo` for the turn the operation belonged to — js/atlas-executor.js hands
       that turn back as the `undoToken`, through IntMapOS.execute so the kernel verifies it) ONLY when every
       effect it declares in column 5 is one the undo PUTS BACK, not merely one it touches:
         · UNDO_EXACT — the effects whose state a restorer captures whole and restores whole (the camera
           with projection and base, the clock, layer switches and opacity, Atlas's own highlights,
           shading, polygons, lines and markers). Column 5 of `map.undo` touches these AND the effects it
           can only take ADDITIONS off (objects, claimed surfaces): a pin a turn added goes, a pin it
           deleted cannot be recreated from an id — so a row writing those is not declared reversible.
         · a row whose effect has NO restorer at all declares that effect under its own key (column 5:
           `map.layerOption` for a layer's settings other than on/off and opacity, `map.location`,
           `camera.follow`, `map.outline`, `map.volume`), so it falls outside by construction — and the undo
           NAMES it when it ran in the turn being taken back (js/atlas-state.js `untouched()`).
       ⚠ THE DECLARATION IS HELD AGAINST THE MECHANISM: tests/atlas-observer-undo-checks.test.mjs requires
       UNDO_EXACT ⊆ map.undo's column 5 and runs the undo over each restorer this file's tests can build. */
    var UNDO_EXACT = ['camera', 'time', 'map.basemap', 'map.layer', 'map.highlight', 'map.choropleth', 'map.polygon', 'map.line', 'map.poi'];
    API.undoExact = function () { return UNDO_EXACT.slice(); };
    (function () {
      var U = byId['map.undo']; if (!U) return;
      order.forEach(function (cid) {
        var c = byId[cid]; if (c === U || c.withdrawn) return;
        var w = c.effects.writes;
        if (!w.length || !w.every(function (k) { return UNDO_EXACT.indexOf(k) >= 0 && U.effects.writes.indexOf(k) >= 0; })) return;
        c.undoneBy = U.id;
        c.undo = function (ctx, token) {
          var OS = null; try { OS = window.IntMapOS; } catch (_) { OS = null; }
          if (!OS || typeof OS.execute !== 'function') return Promise.resolve({ ok: false, meta: { code: 'unavailable' } });
          return OS.execute(U.id, (token && token.turnId != null) ? { turn: token.turnId } : {}, { source: 'undo' });
        };
      });
    })();

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
        confirmation: 'none', ingests: '', targetPolicy: targetPolicyOf(''), forbiddenSubstitutes: [], equivalents: [],
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
    /* ⚠⚠⚠ (#R413) `norm` DID NOT SPLIT camelCase, AND THAT CLOSED HALF THE DOOR ══════════════════
       Every alias in the table above is written the way a planner EMITS it — `myLocation`,
       `streetView`, `lineOfSight`, `askHere`, `timeSeries`, `countryInfo`. `norm` lower-cased and
       collapsed whitespace, so those became `mylocation`, `streetview`, … — strings no human
       phrasing contains. `score()` then compared them against a request that says «my location» and
       found nothing: `'my location'.indexOf('mylocation')` is −1.
       MEASURED ON THE TABLE AS IT STANDS: **143 camelCase ALIASES, of which 60 scored 0** when written
       as the ordinary words they are made of (186 and 93 counting the `legacy` spellings too). Since
       #R406 made `find_capability` the ONLY
       door to 121 of the 126 capabilities, a spelling that scores 0 is a capability that does not
       exist — and the door does not merely stay shut, it ANSWERS: «Nothing matched. IntMap may not
       have this; answer the reader directly, or search the web.» So Atlas was being told, in so many
       words, that IntMap cannot show a street view or find the reader's own position.
       Splitting the boundary costs ONE replace and cannot lose a match — an identifier a planner emits
       verbatim normalises to the same words the alias does, so `myLocation` and «my location» both hit. */
    function norm(s) {
      return String(s == null ? '' : s)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase().replace(/[\s·・･_\-]+/g, ' ').trim();
    }
    /* the terms of a request: Latin/digit words of 3+ characters, and the CJK runs themselves
       (Japanese and Chinese carry no spaces, so a run is cut into evidence against the block it is
       being compared with — see runWindows below — rather than into windows here). */
    function termsOf(nq) {
      var latin = (nq.match(/[a-z0-9]{3,}/g) || []).filter(function (t, i, a) { return a.indexOf(t) === i; });
      var runs = (nq.match(/[぀-ヿ㐀-鿿]+/g) || []).filter(function (t, i, a) { return a.indexOf(t) === i; });
      return { latin: latin, runs: runs, words: runWords(runs) };
    }
    /* ⚠⚠⚠ (atlas-find-semantic) A RUN IS NOT A WORD, AND THE LANGUAGE CAN SAY WHERE ITS WORDS ARE.
       A run is cut by SCRIPT, and a Japanese particle is written in the same script as the words it joins,
       so 「現在地の天気」 is one run. Its only evidence was the whole run or a 4-character fragment
       (runWindows below) — and 天気 is two characters inside it. MEASURED (2026-09-25, this code):
       find_capability('現在地の天気') returned ten routing/navigation rows and NOT data.weather;
       「ここの天気」 returned nothing; 「今いる場所の天気」 only view.locate. The weather block writes 天気.
       ⇒ The platform's word segmenter (Intl.Segmenter, ICU's dictionary) is asked where the words of
       each run are: 現在地|の|天気. Each word of two or more characters is a term exactly like a Latin
       word, worth what its own df says — no vocabulary is listed here. A run the segmenter keeps whole
       (「ありがとう」, #R745) yields nothing new. Where the platform has no segmenter the run is read as
       before. */
    var _seg = null;
    function runWords(runs) {
      if (_seg === null) { try { _seg = new Intl.Segmenter('ja', { granularity: 'word' }); } catch (_) { _seg = false; } }
      if (!_seg) return [];
      var out = [];
      runs.forEach(function (run) {
        for (var it = _seg.segment(run)[Symbol.iterator](), s = it.next(); !s.done; s = it.next()) {
          var w = s.value.segment;
          if (s.value.isWordLike && w.length >= 2 && w !== run && out.indexOf(w) < 0) out.push(w);
        }
      });
      return out;
    }
    var _docNorm = null;   /* id → normalised catalogue block, filled once (a block is up to ~24 kB) */
    var _docBlk = null;    /* the DISTINCT blocks: text, the capabilities each documents, and where */
    var _docDf = {};       /* term → how many BLOCKS carry it */
    var DOC_TERM_POINTS = 6, DOC_TERM_CAP = 30, DOC_TERM_MAX_DF = 4;   /* one alias match is 40, an exact alias 100 — the documentation may lift a capability into view, never over the one that is named */
    var DOC_RUN_MIN = 4;   /* the shortest FRAGMENT of a spaceless run that is not an accident (#R745, said as a length) */
    /* a Latin term is a WORD («iss» is not inside «missile» or «emission»); a CJK window is a substring */
    var _termRe = {};
    function hasTerm(d, t) {
      if (!/^[a-z0-9]+$/.test(t)) return d.indexOf(t) >= 0;
      var re = _termRe[t] || (_termRe[t] = new RegExp('(^|[^a-z0-9])' + t + '(?=$|[^a-z0-9])'));
      return re.test(d);
    }
    /* the blocks that document one capability, normalised one by one. ⚠ SPLIT BEFORE NORMALISING:
       norm() collapses every run of whitespace, newlines included, so a record normalised whole no
       longer states where one block ends and the next begins. */
    function docNorms() {
      if (_docNorm) return _docNorm;
      _docNorm = {};
      API.all().forEach(function (c) {
        var d = '';
        try { d = String(runtime.docs.text([c.id]) || ''); } catch (_) { d = ''; }
        _docNorm[c.id] = d.split('\n').map(norm).filter(Boolean);
      });
      return _docNorm;
    }
    /* ══ (#R802) A BLOCK IS NOT A CAPABILITY ═════════════════════════════════════════════════════
       js/atlas-catalog-text.js documents the 145 capabilities in 60 SHARED blocks, and the biggest of
       them documents THIRTY-THREE at once — data.weather, map.pin, routing.route, layers.aircraftTrack
       and twenty-nine others. Two things follow, and both were wrong here.

       ⚠⚠⚠ ① `df` WAS COUNTING CAPABILITIES, SO THE BIGGEST BLOCK COULD NOT SCORE AT ALL. The gate
       below says, in its own words, «a term carried by more than four BLOCKS is not a match» — but
       it counted the ids of `docNorms()`, and thirty-three of those ids carry the same block. So every
       term inside it — including 「東京から大阪への経路」, the sentence the block writes out as the
       example of `routing.route` — had df ≥ 33 and scored NOTHING.
       MEASURED (production 2026-09-18, build R783): find_capability('東京から大阪までの鉄道ルート')
       → 0 matches; the turn that asked for a Tokyo–Osaka rail route called find_capability EIGHT
       times, executed nothing, and stopped on `step_budget` after 45 s with `operations: []`.
       The number the gate names is the number it now counts: blocks.

       ⚠⚠⚠ ② AND A TERM IN A SHARED BLOCK IS NOT EVIDENCE ABOUT ALL THIRTY-THREE. Counting blocks lets
       the routing sentence score — and it would score identically for map.pin, map.clear and
       layers.aircraftTrack, which is the flood the capability-count was accidentally holding back:
       thirty-three equal scores are decided by `a.id.localeCompare(b.id)`, so the answer to a request
       about trains would be read off the alphabet.
       A catalogue block is written as a run of ENTRIES, each opening with the action it documents —
       `{"type":"directions"…` then `{"type":"route"…` — so the stretch from one opening to the next
       IS the text about that capability. Evidence is credited to the capability whose stretch it
       falls in, and the heading before the first entry belongs to all of them (it is what the block is
       about). A block that opens no entry at all is prose about everyone in it and is read whole; a
       block that opens entries for others and none for this capability is about the others.
       ⚠ DERIVED, NOT LISTED. The openings are found from each capability's OWN spellings — the same
       `norm()` that #R413 taught to split camelCase — so a capability added to the table is
       sectioned on the next boot and no hand-kept list can go stale
       (.agents/rules/no-ad-hoc-hardcoding.md §2.4). */
    function docBlocks() {
      if (_docBlk) return _docBlk;
      var all = docNorms(), byText = Object.create(null), list = [];
      _docBlk = { of: Object.create(null), list: list };
      /* ⚠ THE BLOCKS ARE FOUND, NOT DECLARED. `docs.text([id])` hands back every block that documents
         that id, concatenated — and js/atlas-catalog-text.js ends its blocks with a newline, so the
         concatenation states its own seams (three blocks end without one and are read together with
         what follows them, which is how the prompt reads them too). Twenty-five of the 145
         capabilities are documented in two blocks, and a record read as ONE text hands them the other
         block's sentences as well: that is how sim.lineOfSight came back for a request about trains. */
      Object.keys(all).forEach(function (id) {
        var mine = _docBlk.of[id] = [];
        all[id].forEach(function (d) {
          var k = byText[d];
          if (k == null) { k = byText[d] = list.length; list.push({ text: d, ids: [], own: Object.create(null), whole: Object.create(null), unnamed: [], heading: 0 }); }
          if (list[k].ids.indexOf(id) < 0) list[k].ids.push(id);
          if (mine.indexOf(list[k]) < 0) mine.push(list[k]);
        });
      });
      list.forEach(function (b) {
        var marks = [];
        b.ids.forEach(function (id) {
          var cap = byId[id], spellings = (cap ? cap.aliases : []).concat([id.split('.').pop()]), found = [];
          /* an entry opens with `{"type":"<spelling>"`; only if the block never writes that form do we
             fall back to the bare quoted spelling, which is how a capability named in prose is found */
          for (var form = 0; form < 2 && !found.length; form++) {
            spellings.forEach(function (a) {
              var na = norm(a);
              if (!na) return;
              var needle = form ? '"' + na + '"' : '"type":"' + na + '"';
              for (var i = b.text.indexOf(needle); i >= 0; i = b.text.indexOf(needle, i + 1)) found.push(i);
            });
          }
          if (!found.length) { b.unnamed.push(id); return; }
          found.forEach(function (p) { if (!marks.some(function (m) { return m[0] === p && m[1] === id; })) marks.push([p, id]); });
        });
        /* ⚠ A BLOCK THAT NAMES NOBODY IS ABOUT EVERYBODY IN IT — a few blocks are prose with no
           {"type":…} entry at all, and there the whole text is the only thing anyone has. But where
           the block DOES write entries and simply never writes one for this capability, the text is
           about the others: handing it over is how routing.isochrone came to own a block of panel
           descriptions, and answered 「現在地」 from it. */
        if (!marks.length) b.unnamed.forEach(function (id) { b.whole[id] = 1; });
        marks.sort(function (x, y) { return x[0] - y[0]; });
        b.heading = marks.length ? marks[0][0] : b.text.length;
        for (var i = 0; i < marks.length; i++) {
          var j = i;
          while (j + 1 < marks.length && marks[j + 1][0] === marks[i][0]) j++;   /* two capabilities may open at the same words */
          var to = j + 1 < marks.length ? marks[j + 1][0] : b.text.length;
          for (var k = i; k <= j; k++) (b.own[marks[k][1]] || (b.own[marks[k][1]] = [])).push([marks[k][0], to]);
          i = j;
        }
      });
      return _docBlk;
    }
    function docOwns(b, id, at) {
      if (b.whole[id]) return true;
      if (at < b.heading) return true;
      var sp = b.own[id];
      if (!sp) return false;
      for (var i = 0; i < sp.length; i++) if (at >= sp[i][0] && at < sp[i][1]) return true;
      return false;
    }
    /* where a block carries a term. The first 32 occurrences are enough to decide whose stretch it
       falls in: a term that appears more often than that in ONE block is a term the block is built
       around, and every stretch of it is a hit. */
    var _termReG = {};
    function docAt(d, t) {
      var out = [], i;
      if (/^[a-z0-9]+$/.test(t)) {
        var re = _termReG[t] || (_termReG[t] = new RegExp('(^|[^a-z0-9])' + t + '(?=$|[^a-z0-9])', 'g')), m;
        re.lastIndex = 0;
        while ((m = re.exec(d)) && out.length < 32) out.push(m.index + m[1].length);
        return out;
      }
      for (i = d.indexOf(t); i >= 0 && out.length < 32; i = d.indexOf(t, i + 1)) out.push(i);
      return out;
    }
    /* ⚠⚠⚠ (#R745, AND WHY IT SURVIVES THIS CHANGE) ONE WINDOW OUT OF A LONGER RUN IS NOT EVIDENCE
       ABOUT THE RUN. Japanese and Chinese carry no spaces, so a request has to be cut — and the cuts
       of a word straddle its boundaries. 「ありがとう」 yields あり・りが・がと・とう, and あり sits in
       ONE catalogue block, inside the example 「…地震があり、半径100km以内に…」: df=1 is the rarest a
       term can be, so the fragment scored a full 6 points and find_capability('ありがとう') answered
       with `data.query` — a thank-you routed to a spatial query (measured in the nightly deep tier,
       2026-09-15). #R745 answered it by demanding that a run be recognised by MORE THAN ONE of its
       own windows.
       ⚠ THAT RULE IS KEPT AND SAID AS A LENGTH INSTEAD — the same argument from the side that also
       works. A window counts when it lies inside a CONTIGUOUS stretch that this block also carries,
       and a stretch qualifies when it is EITHER the whole run (the request wrote that word: 「衛星」,
       「地震」, 「現在地」) OR a fragment of at least DOC_RUN_MIN characters. 「ありがとう」 still scores
       nothing — the block carries あり but not ありが — while 「東京から大阪までの鉄道ルート」, which the
       old rule cut into 東京・京か・から…, every one of them either absent or in too many blocks, total
       0, now matches the six-character stretch 「東京から大阪」 that block 04 writes as the example of
       routing.route, and scores the windows inside it, each still worth what its own df says.
       ⚠ WHY THE FRAGMENT FLOOR IS FOUR AND NOT THREE. Three characters is one noun and one particle:
       「東京の」. MEASURED (production 2026-09-18) — 「東京の天気」 and 「東京の今日の天気と3日間の予報」
       reached sim.earthquake, whose block writes 東京 in an example, because 東京+の was three
       contiguous characters; the reader was answered about earthquakes, and no weather capability was
       ever called. A fragment of four carries two content characters, and a run of three or fewer is
       still matched whole, so nothing that is a word in its own right is lost.
       ⚠ THE SAME RULE IN EVERY SCRIPT: a piece of the request long enough not to be an accident. In a
       script that writes spaces the pieces are its words (the 3+ character terms above, matched at
       word boundaries); in a script that does not, they are the whole run or four of its characters. */
    function runWindows(run, d) {
      var keep = [], n = run.length, seen = Object.create(null);
      var take = function (from, len) {
        if (len < 2) { if (!seen[run]) { seen[run] = 1; keep.push(run); } return; }
        for (var k = from; k + 2 <= from + len; k++) {
          var w = run.slice(k, k + 2);
          if (!seen[w]) { seen[w] = 1; keep.push(w); }
        }
      };
      if (d.indexOf(run) >= 0) { take(0, n); return keep; }   /* the whole run: the request's own word */
      if (n <= DOC_RUN_MIN) return keep;
      for (var i = 0; i + DOC_RUN_MIN <= n; i++) {
        var len = 0;
        while (i + len + 1 <= n && d.indexOf(run.slice(i, i + len + 1)) >= 0) len++;
        if (len >= DOC_RUN_MIN) take(i, len);
      }
      return keep;
    }
    /* ⚠ A TERM IS WORTH WHAT IT DISTINGUISHES. 「位置」 and 「現在」 sit in thirty blocks and say nothing
       about which one is meant; «iss» sits in one. So each term's points are divided by the number of
       blocks that carry it beyond the first two — the same idea as inverse document frequency, kept
       to one line. Without it the LONGEST block won every search (measured: map.clear and
       sim.lineOfSight outranked layers.satellites on the ISS request).
       ⚠ A TERM CARRIED BY MORE THAN FOUR BLOCKS IS NOT A MATCH AT ALL. Half a point apiece still
       summed to «score > 0» for nearly every capability, and find_capability — which returns EVERY
       scoring row, by design (#R413) — handed Atlas 60 ids and 42 kB of documentation for the ISS
       request; the next model call took 94 s (measured on production, 2026-09-15). */
    var _evQ = null, _evBy = null;
    /* returns { pts, n }: the points, and how many DISTINCT terms earned them (atlas-semantic-search — the breadth
       of the evidence is one of the things a tie is broken by; see search below) */
    function docTermScore(cap, nq) {
      if (!runtime.docs) return { pts: 0, n: 0 };
      /* what a term is worth: nothing at all past DOC_TERM_MAX_DF blocks, and less the more blocks
         carry it. The number is memoised across the whole session — a term's df cannot change. */
      var award = function (t) {
        var df = _docDf[t];
        if (df == null) {
          df = 0;
          var L = docBlocks().list;
          for (var i = 0; i < L.length; i++) if (hasTerm(L[i].text, t)) df++;
          _docDf[t] = df;
        }
        return df > DOC_TERM_MAX_DF ? 0 : DOC_TERM_POINTS * Math.min(1, 2 / Math.max(1, df));
      };
      /* the evidence ONE BLOCK holds about ONE request — the terms it carries, what each is worth,
         and WHERE it carries them. Computed once per block per request: thirty-three capabilities
         share the largest block and would otherwise re-derive all of this thirty-three times. */
      var evidence = function (b) {
        if (_evQ !== nq) { _evQ = nq; _evBy = new Map(); }
        var hit = _evBy.get(b);
        if (hit) return hit;
        var ev = [], terms = termsOf(nq), d = b.text, seen = Object.create(null);
        var add = function (t) {
          if (seen[t] || !hasTerm(d, t)) return;     /* the same term twice is still one piece of evidence */
          seen[t] = 1;
          var pts = award(t);
          if (pts > 0) ev.push({ t: t, pts: pts, at: docAt(d, t) });
        };
        terms.latin.forEach(add);
        terms.runs.forEach(function (run) { runWindows(run, d).forEach(add); });
        terms.words.forEach(add);                    /* the words the language finds inside a run — see runWords */
        _evBy.set(b, ev);
        return ev;
      };
      var mine = docBlocks().of[cap.id] || [], pts = 0, n = 0, counted = Object.create(null);
      mine.forEach(function (b) {
        var ev = evidence(b);
        for (var i = 0; i < ev.length; i++) {
          if (counted[ev[i].t]) continue;            /* a term in both of its blocks is still one term */
          var owned = false;
          for (var j = 0; j < ev[i].at.length && !owned; j++) owned = docOwns(b, cap.id, ev[i].at[j]);
          if (!owned) continue;                      /* carried by this block, but written about another capability */
          counted[ev[i].t] = 1;
          pts += ev[i].pts;
          n++;
        }
      });
      return { pts: Math.min(DOC_TERM_CAP, pts), n: n };
    }
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
      routing: 'route|directions|drive|walk|transit|reach|isochrone|経路|道順|徒歩|車|到達|route|wegbeschreibung|fahren|laufen|erreichbar|маршрут|проезд|пешком|доступн|ruta|indicaciones|conducir|caminar|alcance|路線|路線圖|步行|可達|路线|步行|可达|itinéraire|trajet|à pied|accessible|경로|길찾기|도보|도달|navigate|navigation|guidance|eta|remaining|arrive|arrival|next turn|overview|recenter|mute|voice|案内|ナビ|誘導|到着|残り|曲がり|全体表示|現在地|ミュート|音声|何分|führung|ankunft|verbleib|abbieg|übersicht|stumm|sprachansage|навигац|ведение|прибыт|остал|поворот|обзор|голос|navegación|guía|llegada|restante|giro|resumen|silenciar|voz|導航|導引|抵達|剩餘|轉彎|總覽|靜音|語音|导航|导引|抵达|剩余|转弯|总览|静音|语音|guidage|arrivée|restant|virage|aperçu|muet|voix|내비|안내|도착|남은|회전|전체|음소거|음성',
      /* ⚠ (#R347) THE NAVIGATION HALF OF ROUTING, ADDED HERE RATHER THAN AS AN ALIAS. `aliases` is a
         list of English identifiers the planner may emit; a Japanese word in it is a translation
         tuple held as adjacent data, which scripts/i18n-pair-audit.mjs counts (and was counting).
         This row is the place the file already keeps match terms in every language at once, and it
         is exempt by design — see the note above. `navigation.*` capabilities are category `routing`,
         so they read this row. */
      sim: 'simulate|simulation|quake|tsunami|radiation|missile|sun|shadow|sky|flight|シミュ|地震|津波|放射|ミサイル|日照|影|星空|飛行|simulation|erdbeben|tsunami|strahlung|rakete|sonne|schatten|himmel|симул|землетряс|цунами|радиац|ракет|солнц|тень|небо|simulación|terremoto|tsunami|radiación|misil|sol|sombra|cielo|模擬|地震|海嘯|輻射|飛彈|陽光|陰影|星空|模拟|海啸|辐射|导弹|阳光|阴影|simulation|séisme|tsunami|radiation|missile|soleil|ombre|ciel|시뮬|지진|해일|방사|미사일|태양|그림자|하늘',
      data: 'rank|top|compare|statistic|population|value|gdp|ランキング|比較|人口|統計|値|rangliste|vergleich|bevölkerung|statistik|рейтинг|сравн|население|статистик|clasificación|comparar|población|estadística|排名|比較|人口|統計|排行|比较|统计|classement|comparer|population|statistique|순위|비교|인구|통계',
      research: 'research|analyze|explain|news|report|history|調べ|分析|説明|ニュース|歴史|recherche|analysieren|erklären|nachrichten|geschichte|исследов|анализ|объясн|новост|истори|investigar|analizar|explicar|noticias|historia|研究|分析|說明|新聞|歷史|说明|新闻|历史|recherche|analyser|expliquer|actualités|histoire|조사|분석|설명|뉴스|역사',
      map: 'highlight|draw|pin|circle|polygon|clear|colour|color|ハイライト|描|ピン|円|消し|色|hervorheben|zeichnen|stecknadel|kreis|löschen|farbe|выдел|нарисов|метк|круг|очист|цвет|resaltar|dibujar|marcador|círculo|borrar|color|標示|繪製|圖釘|圓|清除|顏色|标示|绘制|图钉|清除|颜色|surligner|dessiner|épingle|cercle|effacer|couleur|강조|그리|핀|원|지우|색',
      panel: 'open|close|panel|settings|window|開|閉じ|パネル|設定|öffnen|schließen|fenster|einstellungen|откр|закр|панель|настройк|abrir|cerrar|panel|ajustes|開啟|關閉|面板|設定|打开|关闭|设置|ouvrir|fermer|panneau|paramètres|열기|닫기|패널|설정',
      photo: 'photo|picture|image|skyline|ridge|mountain|where was this taken|viewpoint|camera|写真|画像|山並み|稜線|尾根|撮影地|撮影地点|撮影方向|foto|bild|kammlinie|grat|berg|aufnahmeort|standort|фото|снимок|силуэт гор|гребень|гора|место съёмки|imagen|cumbres|cresta|montaña|lugar de la foto|照片|山稜|稜線|拍攝地點|拍攝方向|山脊|拍摄地点|拍摄方向|photo|image|crête|montagne|lieu de prise de vue|사진|능선|산등성이|촬영 위치|촬영 방향',
      settings: 'theme|dark|light|language|unit|accent|テーマ|ダーク|ライト|言語|単位|thema|dunkel|hell|sprache|einheit|тема|тёмн|светл|язык|единиц|tema|oscuro|claro|idioma|unidad|主題|深色|淺色|語言|單位|主题|深色|浅色|语言|单位|thème|sombre|clair|langue|unité|테마|어두운|밝은|언어|단위',
      time: 'time|date|year|past|history|時刻|日付|年|過去|zeit|datum|jahr|vergangen|время|дата|год|прошл|tiempo|fecha|año|pasado|時間|日期|年|過去|时间|日期|过去|temps|date|année|passé|시간|날짜|년|과거',
    };
    var VERB_HINTS = (function () {
      var o = {};
      Object.keys(VERB_TERMS).forEach(function (k) { o[k] = VERB_TERMS[k].split('|'); });
      return o;
    })();
    API.VERB_HINTS = VERB_HINTS;

    /* ⚠⚠⚠ (#R802) THE RULE #R727 ③ GAVE THE DOCUMENTATION, GIVEN ALSO TO THE ALIASES. `hasTerm` above
       knows that «iss» is not inside «missile» — and the alias match forty lines below it was a bare
       `indexOf`, so «ratio» was inside «duration». MEASURED on the production request «plan a rail
       route from Tokyo to Osaka with duration and distance»: data.ratio scored 65 (40 for its alias
       and 25 for its id, both taken off the word «duration») and came FIRST, ahead of both routing
       capabilities the sentence actually names.
       ⚠ THE BOUNDARY IS DEMANDED AT THE START AND NOT AT THE END, and the difference is inflection: a
       request says «earthquakes» while the alias is `earthquake`, so a word may be matched by its
       stem — but a word may not be matched by something buried inside it. A spelling that does not
       begin with a Latin letter is contained as before. */
    var _spellRe = {};
    function spelledIn(nq, na) {
      if (!na) return false;
      if (!/^[a-z0-9]/.test(na)) return nq.indexOf(na) >= 0;
      var re = _spellRe[na] || (_spellRe[na] = new RegExp('(^|[^a-z0-9])' + na.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return re.test(nq);
    }
    /* ⚠⚠⚠ (#R802) A CATEGORY HINT CANNOT TELL TWO CAPABILITIES APART, SO IT MUST NOT DECIDE WHICH OF
       THEM COMES FIRST. Every row of VERB_TERMS is keyed by CATEGORY, so a hit awards the same +8 to
       every capability in that category: 「経路」 gives routing.route and navigation.voice eight points
       each, and eleven routing capabilities came back on EXACTLY EIGHT — at which point the tie-break
       was `a.id.localeCompare(b.id)`, which is the alphabet, which is nothing about the request.
       MEASURED on production (2026-09-18, build R783): find('経路'), find('ルート案内') and find('鉄道 経路')
       all answered navigation.camera, navigation.start, navigation.status … with routing.route — the
       capability those words name — out of sight below, and the turn that wanted a rail route called
       find_capability eight times and ran nothing at all.
       ⚠ THE HINT STILL SCORES. It is the only home this file has for the Korean, Russian, Spanish and
       French spellings of «route» (tests/r318 ⑦d asks for all nine), and removing it would make those
       requests match nothing — CONSTITUTION.md §5: the defect is the ORDERING, so the ordering is what
       changes. The parts are reported separately and `search` sorts by SELF first: what the request
       said about THIS capability — its own aliases, its own id, the stretch of the catalogue written
       about it — decides the order, and a category hint breaks ties among equals. `score()` still
       returns one number, and it is the same number it always was. */
    API.scoreParts = function (cap, q, ctx) {
      var self = 0, hint = 0, terms = 0, nq = norm(q);
      if (!nq) return { self: 0, hint: 0, total: 0, terms: 0 };
      if (cap.withdrawn) return { self: -1, hint: 0, total: -1, terms: 0 };
      /* ⚠ (#732) …AND THE PHRASES THE PRODUCT ALREADY HOLDS FOR IT, scored by the same rule. The row's
         spellings are English identifiers by design, so a capability whose subject the reader names in
         another language could only be reached through the documentation's share — 「現在地」 scored 3
         for `view.locate` and lost to two capabilities whose category hint contains the word. Where the
         product keeps the reader's own phrases for an act (js/atlas-catalog-text.js `phrases`, which
         hands over the table the resolver itself decides with), they ARE spellings of it. One set, so
         a phrase that is also an alias counts once. */
      var spell = Object.create(null);
      cap.aliases.concat((runtime.docs && typeof runtime.docs.phrases === 'function') ? (runtime.docs.phrases(cap.id) || []) : [])
        .forEach(function (a) { var na = norm(a); if (na) spell[na] = 1; });
      var runs = null;
      Object.keys(spell).forEach(function (na) {
        if (nq === na) { self += 100; terms++; }
        else if (na.length >= 4 && spelledIn(nq, na)) { self += 40; terms++; }
        /* a spelling in a script without spaces is a WORD of the request when it is one of the request's
           own runs — the rule `runWindows` states for the documentation («the whole run: the request wrote
           that word»), given to the spellings: 「現在地 表示」 names 現在地, 「現在地から大阪駅まで」 does not */
        else if (!/^[a-z0-9]/.test(na) && (runs || (runs = termsOf(nq).runs)).indexOf(na) >= 0) { self += 40; terms++; }
      });
      if (spelledIn(nq, norm(cap.id.split('.').pop()))) { self += 25; terms++; }
      (VERB_HINTS[cap.category] || []).forEach(function (h) { if (h && nq.indexOf(norm(h)) >= 0) hint += 8; });
      /* ⚠ THE DOCUMENTATION IS PART OF THE SEARCH. Aliases and hints are the words a request may use in
         nine languages, but the catalogue block is where a capability's SUBJECT lives — «ISS», 「衛星」,
         「通過」 — and a request that names the subject in its own words matched nothing here.
         Measured on production (2026-09-15): find_capability('ISS（NORAD 25544）のリアルタイム位置と…')
         → matches: [], and Atlas, told IntMap had no such control, went researching a position the
         satellite layer was propagating. Each distinct term of the request that the block carries
         adds a little; the cap keeps a long block from outranking an exact alias. It is SELF evidence
         because #R802 made it evidence about this capability rather than about the thirty others its
         block also documents. */
      var dt = docTermScore(cap, nq);
      self += dt.pts;
      terms += dt.n;
      if (ctx) {
        if (ctx.recent && ctx.recent.indexOf(cap.id) >= 0) self += 12;
        if (ctx.requiredOutputs && ctx.requiredOutputs.length) {
          var hit = cap.produces.some(function (p) { return ctx.requiredOutputs.indexOf(p) >= 0; });
          if (hit) self += 10;
        }
      }
      if (cap.isFallback) self -= 5;
      return { self: self, hint: hint, total: self + hint, terms: terms };
    };
    API.score = function (cap, q, ctx) { return API.scoreParts(cap, q, ctx).total; };
    /* search(q, opts) — the ranking. `opts.min` is the score below which a capability is not
       CONFIDENTLY relevant; when too few clear that bar the caller widens, and the widest setting
       is the whole registry. Nothing is ever dropped for being 141st in the DOM.
       ⚠ (#R802) `self` IS THE FIRST KEY AND THE ALPHABET IS THE LAST.
       ⚠⚠⚠ AND A CATEGORY HINT STOPS NAMING ITS WHOLE CATEGORY THE MOMENT SOMETHING IN THAT CATEGORY IS
       NAMED. This is the second half of the production failure, and it was worse than an empty answer.
       MEASURED (2026-09-18, build R783) on 「世界の原子力発電所を地図に表示して、日本のものだけ強調して。」:
       every phrasing Atlas tried came back with
       `layers.aircraftTrack, layers.allOff, layers.baseDisplay, layers.countryInfo, layers.isobars,
       layers.nightSide, layers.opacity, layers.planeAltitude` — which is not a result, it is the first
       eight ids of `layers.*` in alphabetical order. 「表示」 is a `layers` hint, so it gave +8 to every
       capability in the category at once, and with nothing to break the tie the list was the registry's
       own order. Atlas believed it, rephrased eight times, executed ONE operation (`time.travel`) and
       stopped on `step_budget` with an empty map. The reader was told the plants would be shown.
       ⚠ THE RULE IS NOT A CAP ON HOW MANY ROWS COME BACK (#R413 forbids that, and this file's header
       says why). It is about WHAT A HINT IS EVIDENCE OF: the category. While nothing in that category
       has been named by the request, «the whole category» is the honest answer and it is returned in
       full — that is what carries 「오사카 경로」, «itinéraire vers Osaka», «маршрут до Осаки», whose
       scripts VERB_TERMS is the only home for, and tests/r318 ⑦d and tests/r413 ⑦ hold it there. The
       moment one capability in the category IS named, the others are saying nothing about this request
       and they are not candidates. When that leaves nothing at all, find_capability falls to its
       「Nothing matched this wording … Rephrasing this search will not find more.」 — which is what
       stops the rephrasing. */
    API.search = function (q, opts) {
      opts = opts || {};
      var ctx = opts.context || null;
      var named = Object.create(null);
      var rows = API.all().filter(function (c) { return !c.withdrawn; })
        .map(function (c) {
          var p = API.scoreParts(c, q, ctx);
          if (p.self > 0 && p.total > 0) named[c.category] = 1;
          return { id: c.id, score: p.total, self: p.self, terms: p.terms, category: c.category };
        })
        .filter(function (r) { return r.score > 0 && (r.self > 0 || !named[r.category]); })
        .sort(lexicalOrder);
      declareTies(rows, lexicalOrder);
      var min = opts.min == null ? 8 : opts.min;
      /* ⚠ CONFIDENCE IS ABOUT THE CAPABILITY, NOT ABOUT THE CATEGORY. Rows that share one category hint
         are copies of one weak observation, and answering «confident» to that is how a caller stops
         widening while holding nothing. A row is strong when the request named IT. */
      var strong = rows.filter(function (r) { return r.score >= min && r.self > 0; });
      /* (atlas-semantic-search) `basis` says what this ranking was decided by. This synchronous door never asks the
         meaning half — `searchFused` below does — and it says so rather than leaving a reader to
         assume that an empty list means «nothing means this». */
      return { ranked: rows, strong: strong, confident: strong.length >= (opts.want || 3),
        basis: 'lexical', semantic: { state: 'not_consulted' } };
    };
    /* ⚠⚠⚠ (atlas-semantic-search) THE LAST KEY WAS THE ALPHABET, AND THE ALPHABET SAYS NOTHING ABOUT A REQUEST.
       MEASURED (this checkout, before the change): 「現在地」 scores navigation.camera,
       routing.isochrone, map.radius and view.locate at the same `self` — and view.locate, the one
       capability whose job is the reader's position, came FOURTH because «v» sorts after «m», «n»
       and «r». #R802 had already moved `self` in front of the alphabet; the alphabet was still what
       decided every tie that survived.
       Now the keys are all evidence about the request: what it said about THIS capability (`self`),
       the category hint (`score`), and how many DISTINCT pieces of evidence there were (`terms` —
       three different words of the request pointing at one capability are more evidence than one
       word worth the same points). When all three are equal NOTHING in the request tells the rows
       apart, and the ranking SAYS so: tied rows share one `rank`, so a reader of the ranking can see
       that their order is not a judgement. (Within a tie the order is the registry's, because an
       array has to have one; it is declared, not claimed.) `searchFused` adds the meaning of the
       request as a further key, which is what actually separates 「現在地」's four. */
    function lexicalOrder(a, b) { return b.self - a.self || b.score - a.score || (b.terms || 0) - (a.terms || 0); }
    function declareTies(rows, cmp) {
      for (var i = 0; i < rows.length; i++) rows[i].rank = (i && cmp(rows[i - 1], rows[i]) === 0) ? rows[i - 1].rank : i + 1;
      return rows;
    }

    /* ══ (atlas-semantic-search) THE MEANING HALF: searchFused ════════════════════════════════════════════════════
       ⚠⚠⚠ WHAT WAS MEASURED. Everything above matches SPELLINGS — aliases, ids, the words of the
       catalogue — and 134 of the 145 capabilities can be reached ONLY through it (find_capability).
       On production (#R802) three Japanese requests ran zero operations; in this checkout
       「現在地」 still puts view.locate fourth and 「地図を現代に戻す」 matches nothing, although
       time.* exists to do exactly that. #R802 repaired the spelling match as far as spellings go;
       a request and a capability that MEAN the same thing in words they do not share are beyond it
       in any language, and a multilingual embedding is the instrument for that.
       ⚠ THE LEXICAL SEARCH IS NOT REPLACED (CONSTITUTION.md §5 — reach is not reduced). The two
       rankings are FUSED; when the meaning half cannot be asked, the answer is the lexical one AND
       SAYS SO (`basis`, `semantic.state`, `semantic.reason`). «Could not be consulted» and «nothing
       means this» are different answers and must not come back as the same empty list
       (.agents/rules/one-pass-or-a-reason.md §5).

       HOW IT IS SPLIT, AND WHY THE SYNCHRONOUS DOOR STAYS SYNCHRONOUS. `search` above is called
       synchronously (js/atlas-toolsurface.js `find`, and the checks of #R318, #R413, #R727, #R728,
       #R733 and #R802); an embedding is a network round trip. So `search` is left exactly as a
       synchronous lexical answer, and `searchFused(q, opts)` is the asynchronous door that returns
       the SAME shape (ranked / strong / confident) plus what decided it. It never rejects.

       WHERE THE VECTORS COME FROM. The page does not hold a key. `runtime.semantic` is a transport
       `(query, catalogue, signal) → Promise<{state, sims?}>`; the default one below asks the
       atlas-embed Edge Function with the reader's session, which embeds the query, compares it in
       Postgres with the stored vectors of THIS catalogue, and returns one cosine similarity per
       capability. A catalogue it has never seen is sent to it once (in the background — the search
       that found it unknown answers lexically and says `catalog_indexing`). Tests bind a
       deterministic transport through bindRuntime({ semantic }). */

    /* The text each capability is embedded from. Its own words first — the id and aliases — then the
       stretches of the catalogue written ABOUT it (the same sectioning #R802 gave the lexical
       evidence, so a 33-capability block does not make 33 identical vectors), then the headings of
       its blocks (what the block is about). Cut to SEMANTIC_MAX_DOC_CHARS, which is the Edge
       Function's bound (atlas-embed/core.js MAX_DOC_CHARS; a test holds the two equal); the cut is
       made BEFORE hashing, so it is part of the key and never a silent loss on one side. */
    var SEMANTIC_MAX_DOC_CHARS = 6000;
    API.SEMANTIC_MAX_DOC_CHARS = SEMANTIC_MAX_DOC_CHARS;
    function semanticDoc(cap) {
      var own = [], heads = [];
      (docBlocks().of[cap.id] || []).forEach(function (b) {
        if (b.whole[cap.id]) { own.push(b.text); return; }
        (b.own[cap.id] || []).forEach(function (sp) { own.push(b.text.slice(sp[0], sp[1])); });
        if (b.heading > 0) heads.push(b.text.slice(0, b.heading));
      });
      var head = norm(cap.id.replace('.', ' ')) + (cap.aliases.length ? ': ' + cap.aliases.map(norm).join(', ') : '');
      return [head].concat(own, heads).join('\n').slice(0, SEMANTIC_MAX_DOC_CHARS);
    }
    API.semanticDocs = function () {
      if (!runtime.docs) return [];
      return API.all().filter(function (c) { return !c.withdrawn; })
        .map(function (c) { return { id: c.id, text: semanticDoc(c) }; });
    };
    /* the key the vectors are stored under — the SAME canonical form and digest as
       supabase/functions/atlas-embed/core.js (catalogueHash), which recomputes it server-side */
    function canonicalCatalogue(entries) {
      var rows = entries.map(function (e) { return [String(e.id), String(e.text)]; });
      rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
      return JSON.stringify(rows);
    }
    var _catP = null, _catDocs = null;
    API.semanticCatalogue = function () {
      if (_catP && _catDocs === runtime.docs) return _catP;
      _catDocs = runtime.docs;
      var entries = API.semanticDocs();
      var subtle = null;
      try { subtle = globalThis.crypto && globalThis.crypto.subtle; } catch (_) { subtle = null; }
      if (!entries.length || !subtle) { _catP = Promise.resolve(null); return _catP; }
      _catP = subtle.digest('SHA-256', new TextEncoder().encode(canonicalCatalogue(entries))).then(function (buf) {
        var hex = Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
        return { hash: hex, entries: entries };
      }, function () { return null; });
      return _catP;
    };

    /* ── WHAT STANDS OUT. A cosine similarity is always SOME number, for every capability, so «the
       nearest capability» exists for 「ありがとう」 too — and answering a thank-you with the nearest
       capability is exactly the failure #R745 and #R802 ③ removed. A capability is SEMANTIC EVIDENCE
       only when it stands out from this query's own similarities to the whole registry.
       The rule: a robust z-score (median and MAD, so the relevant capabilities do not inflate the
       spread they are measured against) above the level that, if NO capability were about the
       request, would be exceeded by any of the n capabilities with probability SEMANTIC_ALPHA —
       z* = Φ⁻¹(1 − α/n), a Bonferroni bound. With n = 144 live capabilities and α = 0.05, z* ≈ 3.39.
       ⚠ THE NUMBERS (no-ad-hoc-hardcoding §4):
         · SEMANTIC_ALPHA = 0.05 is a POLICY — how often an unrelated request may be handed one
           spurious candidate — not a measurement.
         · the normal approximation of the null distribution is an ESTIMATE: no production
           similarities have been recorded yet (the Edge Function is new). Every fused result
           carries `semantic.threshold` and each row its `z`, so the first production queries are
           the measurement; the expiry is the first recorded 「ありがとう」 or 「現在地」 whose z
           contradicts it.
         · n is COUNTED from the answer, never written down. */
    var SEMANTIC_ALPHA = 0.05;
    /* Φ⁻¹ for the upper tail, Abramowitz & Stegun 26.2.23 (|error| < 4.5e-4) — z* is a threshold,
       and a fourth decimal cannot move a capability across it in any way a reader would see. */
    function upperQuantile(p) {
      var t = Math.sqrt(-2 * Math.log(p));
      return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    }
    function median(xs) {
      var a = xs.slice().sort(function (x, y) { return x - y; }), m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    API.semanticCandidates = function (sims) {
      var ids = Object.keys(sims || {}).filter(function (id) { var c = byId[id]; return c && !c.withdrawn && Number.isFinite(+sims[id]); });
      var n = ids.length;
      if (n < 2) return { rows: [], threshold: null, n: n };
      var xs = ids.map(function (id) { return +sims[id]; });
      var med = median(xs);
      var scale = 1.4826 * median(xs.map(function (x) { return Math.abs(x - med); }));
      if (!(scale > 0)) {   /* more than half the registry at one value: fall back to the standard deviation */
        var mean = xs.reduce(function (s, x) { return s + x; }, 0) / n;
        scale = Math.sqrt(xs.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / n);
      }
      var zStar = upperQuantile(SEMANTIC_ALPHA / n);
      if (!(scale > 0)) return { rows: [], threshold: zStar, n: n };   /* nothing stands out from anything */
      var rows = ids.map(function (id) { var s = +sims[id]; return { id: id, similarity: s, z: (s - med) / scale }; })
        .filter(function (r) { return r.z >= zStar; })
        .sort(function (a, b) { return b.similarity - a.similarity; });
      declareTies(rows, function (a, b) { return b.similarity - a.similarity; });
      return { rows: rows, threshold: zStar, n: n };
    };

    /* ── THE FUSION. Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, SIGIR 2009):
       score = Σ 1 / (K + rank) over the rankings a row appears in, K = 60 as that paper sets it.
       Ranks, not scores, because the two scales are not comparable (40 points for an alias against a
       cosine of 0.43). Tied rows carry one rank, so a declared tie contributes equally.
       Order: fused score, then the similarity (the meaning of the request), then the lexical keys;
       whatever is still equal is a declared tie, as above. */
    var RRF_K = 60;
    API.fuse = function (lexical, semantic, opts) {
      opts = opts || {};
      var by = Object.create(null), out = [];
      var row = function (id) {
        if (!by[id]) { var c = byId[id]; by[id] = { id: id, category: c ? c.category : '', score: 0, self: 0, terms: 0, lexical: null, semantic: null }; out.push(by[id]); }
        return by[id];
      };
      /* ⚠ THE LEXICAL RANK THAT ENTERS THE FUSION IS THE RANK BY EVIDENCE ABOUT THE CAPABILITY — `self`,
         then `terms` — WITHOUT the category hint. #R802's rule, carried into the fusion: a hint gives
         the same points to its whole category, so it cannot tell two capabilities apart, and letting
         it open a rank gap would let it outvote the meaning half. MEASURED on the fake model of the
         check (tests/r824 ①): with the hint in the rank, 「現在地」 — a `routing` hint word — put
         routing.isochrone (lexical rank 1 by +8 of hint) above view.locate (semantic rank 1). The
         hint still orders rows the fusion leaves equal (the comparator below). */
      var evidence = function (a, b) { return b.self - a.self || (b.terms || 0) - (a.terms || 0); };
      var lx = declareTies((lexical.ranked || []).map(function (r) { return { id: r.id, self: r.self, terms: r.terms || 0 }; }).sort(evidence), evidence);
      var lxRank = Object.create(null);
      lx.forEach(function (r) { lxRank[r.id] = r.rank; });
      (lexical.ranked || []).forEach(function (r) {
        var x = row(r.id);
        x.lexical = { rank: r.rank, score: r.score, self: r.self, terms: r.terms || 0 };
        x.self = r.self; x.terms = r.terms || 0;
        x.score += 1 / (RRF_K + lxRank[r.id]);
      });
      (semantic.rows || []).forEach(function (r) {
        var x = row(r.id);
        x.semantic = { rank: r.rank, similarity: r.similarity, z: r.z };
        x.score += 1 / (RRF_K + r.rank);
      });
      var sim = function (x) { return x.semantic ? x.semantic.similarity : -Infinity; };
      var cmp = function (a, b) {
        return (b.score - a.score) || (sim(b) - sim(a) || 0) || lexicalOrder(a.lexical || { self: 0, score: 0, terms: 0 }, b.lexical || { self: 0, score: 0, terms: 0 });
      };
      out.sort(cmp);
      declareTies(out, cmp);
      var min = opts.min == null ? 8 : opts.min;
      /* strong: named by the request (the lexical rule above) OR standing out in meaning — both are
         evidence about THAT capability, which is what «strong» has meant since #R802 */
      var strong = out.filter(function (x) { return !!x.semantic || (x.lexical && x.lexical.score >= min && x.lexical.self > 0); });
      return { ranked: out, strong: strong, confident: strong.length >= (opts.want || 3) };
    };

    /* ── THE DEFAULT TRANSPORT: the atlas-embed Edge Function, with the reader's own session.
       A reason code comes back for everything that is not an answer, and the code is what the result
       reports. The seed of an unknown catalogue runs in the background, ONCE per catalogue per page:
       its outcome is kept (`semanticStatus`) and a failed seed is not re-sent on every search — the
       searches report why instead (one-pass-or-a-reason §5: retry only when something differs). */
    var _seed = { catalog: null, state: 'none', at: 0 };
    API.semanticStatus = function () { return Object.assign({}, _seed); };
    function httpTransport(q, cat, signal) {
      var W = null; try { W = window; } catch (_) { W = null; }
      var base = W && String(W.SUPABASE_URL || '').replace(/\/+$/, '');
      if (!base) return Promise.resolve({ state: 'no_endpoint' });
      var DB = null; try { DB = HOST && HOST.DB; } catch (_) { DB = null; }
      if (!DB || !DB.auth || typeof DB.auth.getSession !== 'function') return Promise.resolve({ state: 'signed_out' });
      return Promise.resolve(DB.auth.getSession()).then(function (res) {
        var tok = res && res.data && res.data.session && res.data.session.access_token;
        if (!tok) return { state: 'signed_out' };
        var post = function (body, sig) {
          return fetch(base + '/functions/v1/atlas-embed', {
            method: 'POST', signal: sig,
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, apikey: String(W.SUPABASE_ANON_KEY || '') },
            body: JSON.stringify(body),
          }).then(function (r) {
            return r.json().then(function (j) { return (j && j.state) ? j : { state: 'http_' + r.status }; },
              function () { return { state: 'http_' + r.status }; });
          });
        };
        return post({ op: 'search', catalog: cat.hash, q: q }, signal).then(function (j) {
          if (j.state !== 'catalog_unknown') return j;
          if (_seed.catalog === cat.hash) {
            return { state: _seed.state === 'running' ? 'catalog_indexing' : ('catalog_seed_' + _seed.state) };
          }
          _seed = { catalog: cat.hash, state: 'running', at: Date.now() };
          /* ⚠ THE SEED HAS ITS OWN DEADLINE, or a hung request would leave this page saying
             `catalog_indexing` for ever. SEED_TIMEOUT_MS is an ESTIMATE: the function gives one
             embeddings call 30 s (atlas-embed EMBED_TIMEOUT_MS) and today's catalogue is ONE batch
             (≈122,000 characters against BATCH_CHARS 200,000), so 60 s is that call, the store and a
             cold start. A seed that the page stopped waiting for may still have been stored — the
             next search then simply finds the catalogue known. */
          var sctl = null; try { sctl = new AbortController(); } catch (_) { sctl = null; }
          var stimer = setTimeout(function () { try { sctl && sctl.abort(); } catch (_) { } }, SEED_TIMEOUT_MS);
          post({ op: 'seed', catalog: cat.hash, entries: cat.entries }, sctl && sctl.signal).then(function (s) {
            clearTimeout(stimer);
            if (_seed.catalog === cat.hash) _seed = { catalog: cat.hash, state: s.state === 'ok' ? 'ok' : s.state, at: Date.now() };
          }, function () {
            clearTimeout(stimer);
            if (_seed.catalog === cat.hash) _seed = { catalog: cat.hash, state: 'unreachable', at: Date.now() };
          });
          return { state: 'catalog_indexing' };
        });
      });
    }

    /* How long a search waits for the meaning half before answering from spellings. ESTIMATE, not a
       measurement: an Edge Function answers a warm call in well under a second and a cold start in
       a few; nothing has been recorded for this one yet. Every result carries `semantic.ms`, which
       is the measurement; the expiry is a recorded production distribution. */
    var SEMANTIC_TIMEOUT_MS = 8000;
    var SEED_TIMEOUT_MS = 60000;   /* see the seed in httpTransport above */
    API.searchFused = function (q, opts) {
      opts = opts || {};
      var lexical = API.search(q, opts);
      var t0 = Date.now();
      var lexicalOnly = function (reason) {
        return Object.assign({}, lexical, { basis: 'lexical', semantic: { state: 'unavailable', reason: reason, ms: Date.now() - t0 } });
      };
      if (!norm(q)) return Promise.resolve(lexicalOnly('empty_query'));
      var transport = runtime.semantic || httpTransport;
      return API.semanticCatalogue().then(function (cat) {
        if (!cat) return lexicalOnly(runtime.docs ? 'no_digest' : 'no_catalogue');
        var ctl = null; try { ctl = new AbortController(); } catch (_) { ctl = null; }
        var timer = null;
        var timeout = new Promise(function (res) {
          timer = setTimeout(function () { try { ctl && ctl.abort(); } catch (_) { } res({ state: 'timeout' }); }, opts.timeoutMs || SEMANTIC_TIMEOUT_MS);
        });
        return Promise.race([Promise.resolve().then(function () { return transport(String(q), cat, ctl && ctl.signal); }), timeout])
          .then(function (ans) {
            clearTimeout(timer);
            if (!ans || ans.state !== 'ok' || !ans.sims) return lexicalOnly((ans && ans.state) || 'no_answer');
            var sem = API.semanticCandidates(ans.sims);
            var fused = API.fuse(lexical, sem, opts);
            return Object.assign(fused, { basis: 'lexical+semantic',
              semantic: { state: 'ok', model: ans.model || null, threshold: sem.threshold, compared: sem.n, candidates: sem.rows.length, ms: Date.now() - t0 } });
          }, function () { clearTimeout(timer); return lexicalOnly('unreachable'); });
      }, function () { return lexicalOnly('no_digest'); });
    };

    /* catalogText(ids) — the planner's catalogue. `null` means EVERY capability, which reproduces
       the text js/atlas-console.js used to carry inline, byte for byte. */
    API.catalogText = function (ids) {
      if (!runtime.docs) return '';
      return runtime.docs.text(ids);
    };
    API.catalogBytes = function (ids) { return API.catalogText(ids).length; };
    /* ══ index() — WHAT INTMAP CAN DO, AT THE MOMENT ATLAS DECIDES  (#R582) ══════════════════════
       ⚠ THIS IS NOT THE CATALOGUE COMING BACK. #R406 removed 64,250 characters of prose from the
       prompt and put it behind find_capability, and that was right: a model does not need the
       argument documentation of 135 capabilities in order to answer 「ありがとう」. But it took
       something else out with it, and nothing replaced that. What SYS() then said about the other
       124 was one sentence on one tool — «Search everything IntMap can do» — which names the DOOR
       and not one thing behind it. A door is not an inventory. Atlas cannot decide to open it for a
       capability it has no reason to believe exists, and every decision it makes BEFORE opening it
       is made about an IntMap with nine tools in it.

       MEASURED (#R582): 「エンゲルス空軍基地からナッシュビルまでICBM」 was answered with a refusal
       to help plan a strike. IntMap's answer to that request is sim.ballistic — a Keplerian
       trajectory solve with Allen–Eggers drag, a Coriolis-curved ground track and optional blast
       rings (js/atlas-sims.js), documented in js/atlas-catalog-text.js as the thing to use for
       exactly this — and sim.ballistic has NO UI ENTRY POINT ANYWHERE IN THE PRODUCT. Asking Atlas
       is the only way to reach it. So the request was not so much mis-answered as answered about a
       different application: one in which the simulator does not exist, where the sentence is only
       a sentence about a real air base and a real city. js/atlas-policy.js §② already tells Atlas to
       TRANSFORM AND EXECUTE rather than refuse — it can only do that with a tool it has been given a
       reason to look for. NOTHING IS ADDED TO THE POLICY HERE, and CONSTITUTION.md §5 is why: the
       defect is that a capability was unreachable, and the repair is to make it reachable.

       ⚠ IT IS AN INDEX AND DELIBERATELY NOT A DESCRIPTION. Ids only, grouped by category: 2.5 kB
       for all 135, against the 81,951 the prose costs. run_capability takes these strings verbatim,
       and find_capability turns any one of them into its schema and its documentation. Enough to
       know what exists; not enough to call one blind.

       ⚠ AND IT IS DERIVED. It is the table above, not a list anyone maintains. A capability added to
       the table is in the prompt on the next turn; a hand-written list would be the failure this
       file's own header describes («A list that a human must remember to update is a list that will
       be wrong»), which is .agents/rules/no-ad-hoc-hardcoding.md §2.4. tests/r582-checks.test.mjs
       derives the expected set from the registry rather than naming it, so no capability can be
       added to IntMap without appearing here. */
    /* ⚠⚠⚠ (#R733) THE SENTENCE WAS FALSE ABOUT NINE OF ITS OWN ENTRIES, AND THE FALSEHOOD COST THE
       WHOLE TURN. Measured in production on 「地図を現代に戻したうえで、日本の人口上位5都市にピンを
       立てて、その人口を棒グラフで比べて」: all eight planner steps called `find_capability` — fifteen
       calls in total, three `research.analyze`, and NOT ONE map, chart or clock operation. The turn
       died at `stopped:'step_budget'` after 6m37s with `mapDrawn:false` and none of the three things
       the reader asked for.
       This index listed `chart.compose`, `map.compose`, `view.flyTo`, `map.highlight`,
       `layers.toggle`, `research.analyze`, `view.locate`, `view.inspect` and `dialog.ask` — every one
       of which SYS() hands the model IN THE SAME PROMPT as a typed tool it may call right now — under
       a sentence saying 「they are not tools you may call directly」. A model that believes the prompt
       has to go looking for the thing already in its hand, and looking is what it did until the
       budget ran out.
       ⚠ THE DIRECT SET IS PASSED IN, NOT LISTED HERE. js/atlas-toolsurface.js already knows which
       capabilities it exposed — every tool it builds carries its `capabilityId` — so the caller hands
       that set over and the index states the truth about it. A copy of the CORE names kept here would
       be the second source of truth .agents/rules/no-ad-hoc-hardcoding.md §2.3 forbids, and the one
       that goes stale the first time CORE changes. */
    API.index = function (directIds) {
      var direct = {};
      [].concat(directIds || []).forEach(function (id) {
        if (!id) return;
        var c = null; try { c = API.resolve(id); } catch (_) { c = null; }
        direct[(c && c.id) || String(id)] = true;
      });
      var byCat = {}, nDirect = 0;
      API.all().forEach(function (c) {
        if (!c || c.withdrawn) return;
        if (direct[c.id]) { nDirect++; return; }   /* already in the model's hand — see above */
        var k = c.category || 'other';
        (byCat[k] || (byCat[k] = [])).push(c.id);
      });
      var cats = Object.keys(byCat).sort();
      if (!cats.length) return '';
      return '[WHAT INTMAP CAN DO] Every capability id IntMap has BEYOND the tools you were given, by '
        + 'category. These are not tools you may call directly: find_capability turns one into its '
        + 'arguments and its documentation, and run_capability then runs it. '
        + (nDirect ? 'The tools listed under [TOOLS] are ALREADY YOURS: call one by name, and never '
          + 'spend a step searching for it. ' : '')
        + 'Nothing outside this list and those tools exists; everything in them does.\n'
        + cats.map(function (k) { return k + ': ' + byCat[k].join(', ') + '.'; }).join('\n') + '\n';
    };

    /* ══ THE MACHINE-READABLE AUDIT (§2) ═════════════════════════════════════════════════════════ */
    API.toJSON = function () {
      return {
        version: 1, count: order.length,
        capabilities: API.all().map(function (c) {
          return {
            id: c.id, legacy: c.legacy, aliases: c.aliases.slice(), category: c.category,
            observerKind: c.observerKind, effects: c.effects, produces: c.produces,
            risk: c.risk, confirmation: c.confirmation, ingests: c.ingests || '', targetPolicy: c.targetPolicy,
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
