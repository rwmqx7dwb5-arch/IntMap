/* ============================================================================
 *  IntMap · ENTRY — the module graph that replaced sixty <script src> tags  (#R175)
 * ----------------------------------------------------------------------------
 *  Every file below used to be a CLASSIC <script src="js/…"> in index.html, executed in document order
 *  at parse time. They are ES modules now, imported here in the IDENTICAL order — and that swap is safe
 *  for a mechanically checked reason rather than a hopeful one: an AST sweep of all 58 files finds ZERO
 *  top-level declarations, and therefore zero cross-file lexical dependencies. Every one of them is a
 *  pure side-effect module that publishes itself on `window` and reads its collaborators back off
 *  `window` / IM_HOST — the discipline the #R162–#R169 splits established. A module's top-level
 *  `const`/`function` is module-PRIVATE where a classic script's is global, so having none of either is
 *  exactly the property that makes this conversion incapable of changing a single name resolution.
 *  tests/r175-checks.test.mjs re-runs that sweep on every commit, so it cannot quietly stop being true.
 *
 *  ORDER IS LOAD-BEARING — several files call factories an earlier file registered on
 *  window.IntMapModules — and the same test pins this list against index.html's own module-check list.
 *
 *  Boot sequence, unchanged in effect: a type="module" script is deferred, so this runs after the
 *  document is parsed and BEFORE DOMContentLoaded fires. That is exactly when the classic tags used to
 *  finish, and exactly what index.html's main body waits for.
 * ==========================================================================*/
import './vendor.js';

/* (#R178) FIRST after the vendor bundle, and before anything that could ask for it: js/geo-engine.js
   publishes window.IntMapGeoEngine, which is now how every module reaches the renderer. It used to be
   created inside app-body.js's map.on('load'), i.e. after all of these have already run their
   factories — the reason the first decoupled module threw "Cannot read properties of undefined". The
   engine tolerates there being no map yet, so importing it this early costs nothing. */
import '../js/geo-engine.js';

/* (#R180) …and immediately after it, WHICH engine this session runs on. This must
   come before js/app-body.js registers its DOMContentLoaded handler so that the
   handler can see `window.IntMapEnginePending` and wait for it; with the default
   (MapLibre) the module publishes nothing and the boot path is unchanged. Cesium
   itself is imported dynamically from inside it, so it lands in its own Rollup
   chunk and a MapLibre session transfers none of it. */
import '../js/engine-select.js';

import '../js/newsgeo.js';
/* (#R183) The one guarded weather/UV client, imported before anything that could ask it for a
   number. js/wx-source.js publishes window.IntMapWx synchronously (no factory), so it costs nothing
   here and guarantees the widget board, the point-weather popup and every other reader share one
   circuit breaker rather than each re-hammering a dead quota.
   It sits AFTER newsgeo deliberately: tests/r175-checks pins newsgeo as the first feature module,
   and nothing about this file needs to precede it — its consumers all call it lazily. */
import '../js/wx-source.js';
/* (#R183) …and the pure "how close should the camera go for THIS kind of place" decision, which
   js/search-geocode.js consults from gotoPlace. Its own file because that factory's body may
   contain only declarations (tests/r169-checks #4) and because being map-free is what lets the
   whole table be tested without a browser. */
import '../js/place-framing.js';
/* (#R198) …and the same shape for the other "how big should this be" decision: js/label-scale.js is the
   ONE ladder every text size on the map comes from, and the only thing that can hold "a non-place label
   is smaller than a place label" as a property rather than a coincidence. Pure arithmetic — no DOM, no
   renderer, no app state — so it is verified in Node, and it must precede every module that builds a
   symbol layer, which is all of them. */
import '../js/label-scale.js';
/* (#R242) …and the OTHER two «how is text drawn on the map» decisions, in one module beside it: which
   FACE the renderer uses for a label (the app ships its own Inter SDF atlases and hands MapLibre the
   UI's CJK family for the ideographic blocks) and how wide a news band comes out. It must precede the
   map's construction, which reads `cjkFamily()` and `glyphRewrite` out of it. */
import '../js/map-typography.js';
/* (#R289) …and the third such decision: what a BEARING is called. Six files each carried their own
   copy of the sixteen English abbreviations — see js/compass.js. Pure data, verified in Node. */
import '../js/compass.js';
/* (#R289) CHRONOS — the one master clock, window.IntMapTime. Published at IMPORT time now, which
   is strictly earlier than the closure it used to live in. See js/chronos.js. */
import '../js/chronos.js';
import '../js/layer-home.js';   /* (#R313) the SET of layers allowed to move the camera on a toggle — CONSTITUTION §3's one exception, and the one table that holds it */
/* ══ (#R232) THE LANGUAGE REGISTRY, THEN THE DIRECTORY THAT IS THE LANGUAGE LIST ═══════════════
   「今後IntMapの設定言語を追加するのが、1発で終わるように。」
   ⚠ ADDING A LANGUAGE IS NOW ONE FILE — `js/locales/ui.<code>.js` — AND NOTHING HERE. The seven
   import lines that used to stand below are gone: src/locale-boot.js globs the locale directory, so
   the set of languages IS the set of files, and js/lang-registry.js derives each row's label, tag and
   pill from the code. Nothing else in the app — including the 2,238 inline L(…) call sites — has to
   be touched; see the registry's header.
   ⚠ AND THE GLOB IS LAZY, WHICH IS THE OTHER HALF. Those seven eager imports were 492 kB of the boot
   bundle for six languages nobody in that session reads (ui.zh.js and ui.zh-hans.js are 211 kB each).
   Only English — the fallback every other table chains onto — is imported here; the reader's own
   language is fetched as its own chunk and awaited on js/app-body.js's boot barrier. */
import '../js/lang-registry.js';
import './locale-boot.js';
import '../js/locales/ui.en.js';
import '../js/i18n.js';
/* (#R233) …and the door #R232 left unguarded: `setLang()` repainted the whole UI from a table whose
   own chunk had not been fetched yet, so switching language at RUNTIME left Settings and the sidebar
   tabs in English while everything carried inline turned Japanese (「基本的なUIですら言語が混在」).
   One registered repaint, awaited before the switch and re-run if a locale lands by any other route. */
import '../js/lang-switch.js';
import '../js/gazetteer.js';
import '../js/reference-data.js';
import '../js/layer-previews.js';
import '../js/history.js';
import '../js/monitors.js';
import '../js/companies.js';
/* (#R311) js/stats-compare.js is on-demand now (js/lazy-modules.js); js/compare.js below is the MAP-compare window, a different feature, and stays. */
import '../js/compare.js';
/* (#R291) the routing subsystem — five pure modules then the router; the PANEL is lazy. Architecture.md §8.4. */
import '../js/routing-store.js'; import '../js/routing-providers.js'; import '../js/routing-geocode.js'; import '../js/routing-cards.js'; import '../js/routing-export.js';
/* (#R347) two more, eager because both are read before the panel exists (the failure taxonomy and
   the planning/navigation clock split, §33). ⚠ js/routing-traffic.js is deliberately NOT here —
   check:perf priced «eager for provider selection» at 22 kB of boot JS. DEV-NOTES #R347. */
import '../js/routing-errors.js'; import '../js/routing-time.js';
import '../js/routing.js';
/* (#R184) the six route ANALYSES (elevation, borders, conditions along the way, the schedule,
   alternative differences, and routing on OSM's record of a historical network). The three
   capabilities that change how the route is ASKED for stayed in js/routing.js, where the request is
   built. Order does not matter — the panel reaches for window.IntMapRoutingOps lazily. */
import '../js/routing-ops.js';
import '../js/time-borders.js';
/* (#R192) the main-thread side of the satellite tile worker (src/sat-worker.js) — it publishes
   window.IntMapSatWorker and starts nothing until js/app-body.js asks for a tile. */
import './sat-worker-client.js';
/* (#R193) …and the tsunami solver's, which publishes window.IntMapTsunamiWorker and starts nothing
   until the propagation panel asks for a run (src/tsunami-worker.js). */
import './tsunami-worker-client.js';
/* (#R341) …and the aviation worker's, which publishes window.IntMapAviationWorker and starts
   nothing until the aircraft layer asks for a poll (src/aviation-worker.js). */
import './aviation-worker-client.js';
import '../js/data-layers.js';
import '../js/workspace.js';
import '../js/widgets.js';   /* (#R292) …and with it the ten js/widget-*.js modules it imports itself: the platform's load order is the PLATFORM's business, so the entry keeps the one line it had before the board was split. Roles: docs/FILES.md §3; structure: Architecture.md §7.5 */
import '../js/wb-layers.js';
import '../js/us-elections.js';
import '../js/beta-overlays.js';
import '../js/cameras.js';
/* (#R224) js/atlas-console.js is NOT imported here any more — it is the ninth on-demand module
   (js/lazy-modules.js), fetched the first time anything reaches for Atlas. 658 kB of the boot
   bundle, for a panel most sessions never open. See LAZY_FACTORIES below.
   What IS imported is the ~30-line loader every caller goes through, so that «Atlas can drive
   everything» keeps meaning what it says while the kernel itself arrives later. */
import '../js/atlas-loader.js';
/* (#R225) the ON-DEVICE instrument for 「スマホでの地図スクロール、ズームが壊滅的に遅い」. Dormant
   unless ?perf=1 is in the URL — one regexp test otherwise — because four rounds of measuring the
   wrong machine is what this file exists to end. See its header. */
import '../js/perf-hud.js';
/* (#R217) "which tile segments are the same river, and where does that river really go" — pure
   set-of-names matching plus the OSM course resolver. Ahead of js/map-ui.js because the river-label
   click is its first caller; it publishes window.IntMapRiverCourse at import and fetches nothing
   until a label is actually clicked. */
import '../js/river-course.js';
/* (#R218) the streamline integrator — bilinear sampling of a lon/lat vector field, RK4 on the unit
   direction, and the evenly-spaced-seed rule. Pure arithmetic in its own file for the same reason as
   the line above: js/ocean-currents.js is its only caller today, and a numerical method that decides
   what the map draws must be runnable in a test without a renderer (tests/r218-checks). */
import '../js/streamline.js';
import '../js/map-ui.js';
import '../js/map-tools.js';
/* (#R192) "where is the land" — the bundled 1-bit world mask (data/land-mask.png). Ahead of the
   seismic simulator because that is its first caller, but it is a fact about the Earth and not
   about earthquakes: anything else that needs a land/sea sign asks here rather than growing a
   second copy. Nothing loads until someone calls warm(). */
import '../js/land-mask.js';
/* (#R215) …and the SAME question asked finely. js/land-mask.js answers a point anywhere with no
   network at 19.5 km; this rasterises the app's own 10 m country outline into whatever grid the
   caller is already building, so a coastline is decided at the caller's resolution instead of at a
   19.5 km majority («大きなタイルでごまかすな»). It holds nothing: the geometry belongs to
   js/countries-ui.js and this only draws it. */
import '../js/coast-mask.js';
/* (#R223) …and "how soft is the ground here", the same shape again (data/vs30.png, 0.25°, 239 kB).
   The intensity field's site term used to fall back to ONE class wherever the DEM could not reach —
   the far annulus, and any cell whose tile never arrived — which is what draws concentric rings.
   Nothing fetches until seismic.js calls warm(). */
import '../js/vs30-mask.js';
/* (#R197) …and "how deep is the sea here" — the bundled 0.25° global sea floor (data/bathymetry.png).
   Same shape as the land mask: a fact about the Earth, one owner, and nothing fetched until the one
   thing that needs a whole ocean at once — the global tsunami solver — calls warm(). */
import '../js/bathymetry.js';
/* (#R196) "place this on the map" as ONE gesture — it hides the requesting panel while the click is
   awaited, because on a phone that panel is what the user was being asked to tap through. It
   publishes window.IntMapPick synchronously and holds no state until someone calls start(). */
import '../js/map-pick.js';
/* (#R196) index.html's TENTH split — the antimeridian / pole-safe geometry the measurement tools,
   the seismic rings and the dashboard all build their shapes with. Pure functions of coordinates:
   no DOM, no renderer, no app state, so it needed no handover and is testable in Node. */
import '../js/geodesy.js';
/* (#R224) …and beside it, the other piece of pure geometry the seismic panel needs: a drawn outline
   is a fault's SURFACE PROJECTION, and this turns it into a dipping plane (dip, down-dip width, top
   and bottom depth, 3-D area, mean slip). Eager and tiny — the seismic module is lazy, but this has
   no DOM, no renderer and no state, so it costs one `window.` assignment and is verified in Node
   against real earthquakes instead of against a screenshot. */
import '../js/fault-geometry.js';
/* (#R196) index.html's ELEVENTH split — the service-worker tile cache and the directional prefetch.
   It only registers a factory; js/app-body.js calls it from the exact point the code used to occupy,
   because it attaches `moveend`/`move` handlers whose order relative to the shell's is observable. */
import '../js/tile-warm.js';

/* (#R192) the tsunami propagation model — linear long waves over the real sea floor, initialised
   from the same event the seismic panel is already describing. After seismic.js because that is
   what hands it an event; it registers itself and computes nothing until asked. */
import '../js/insolation.js';               /* (#R176) terrain shadow + the annual sunlight budget */
/* (#R276) the ECMWF IFS model (forecast axis, .om URLs, decoded field, colour scales) and the WebGL particle renderer that draws the wind from it — both publish a window global synchronously and js/weather.js reads both, so they precede it. */
import '../js/wx-ecmwf.js';
import '../js/wx-wind.js';   /* (#R293) js/wx-reanalysis.js went with the MERRA-2 source it existed for — 「気温レイヤーで、MERRA-2 再解析は削除。」 */
import '../js/weather.js';
import '../js/layer-packs.js';   /* (#R254) …which imports js/datacenters.js itself — see the note there */
/* (#R211) the sixth pack — trade, energy, warnings, tides, crops. Same shape as layer-packs.js
   (a factory on window.IntMapModules, instantiated once from js/app-body.js) and, like it, it must
   be loaded EAGERLY rather than on demand: it creates layer rows at boot, and the progress gate and
   the session restore both key off those rows existing. */
import '../js/world-packs.js';
/* (#R213) 「業界を選べば、そのなかでの利害関係や実際の数値が人物相関図的にマッピングされるレイヤー」 —
   the seventh member of the same family, and its own file because standing instruction 13 says new work
   leaves the core. It must come AFTER world-packs.js: it reuses that module's panel/row toolkit through
   `window.IntMapWorld._ui` rather than carrying a second copy of it, and it says so out loud if the
   toolkit is not there instead of half-building a layer. */
import '../js/industry-web.js';
/* (#R222) the field DECODER before the layer that reads it: a plain window module with no HOST, so
   nothing here depends on load order beyond "defined before first use". Both ocean-current layers
   (the World-data plate and the older data-layers row) read the same grid through it. */
import '../js/ocean-currents-field.js';
import '../js/ocean-currents.js';   /* (#R216) 世界の海流 — same World-data toolkit; AFTER world-packs for the same reason industry-web is */
import '../js/precip-annual.js';   /* (#R266) 年降水量 — CHELSA 1 km normal + GPCC per-year, both bundled rasters */
/* (#R322) the SHELL only. #R311 measured that two of this file's five factories build Layers-panel
   buttons at boot, so it cannot be deferred whole; the five bodies live in
   js/analysis-{timeseries,research,correlate,world-events,edu}.js and js/lazy-modules.js fetches each
   one when its facade is first called. Adding them here would download all five at boot again. */
import '../js/analysis-panels.js';
import '../js/sims.js';
import '../js/tables.js';
import '../js/legal.js';        /* …which imports js/legal-text.js — the words privacy.html / terms.html also read */
import '../js/feedback.js';
import '../js/onboarding.js';
import '../js/mobile-ui.js';
/* (#R231) the phone's base-map square + its popover — the five view controls, lifted out of the Map &
   layers sheet ("レイヤー選択欄から分離"). After js/mobile-ui.js because initMobileUI() installs it. */
import '../js/basemap-switch.js';
import '../js/news-timeline.js';
import '../js/dash-extended.js';
import '../js/map-extras.js';
import '../js/countries-ui.js';
import '../js/news-ui.js';
import '../js/companies-ui.js';
import '../js/tool-panel.js';
import '../js/solid3d.js';
/* (#R202) the orbit-point custom layer, behind IntMapGeoEngine.layers.addOrbit — the same shape as
   solid3d.js: a MapLibre adapter implementation detail that only js/geo-engine.js reaches for. */
import '../js/orbit-points.js';
/* (#R227) …and the third one: the atmosphere's limb, behind IntMapGeoEngine.layers.addLimb. It
   exists because maplibre discards the whole `sky` block while the globe is drawn, so everything
   #R196–#R226 computed for the Earth's edge never reached a pixel. See js/limb-layer.js. */
import '../js/limb-layer.js';
/* ⚠⚠ (#R229) js/render-scale.js (#R202) AND js/glass-motion.js (#R221) WERE DELETED HERE, and the
   reason is not performance. Both lowered what the reader was looking at while the camera moved —
   the map's own resolution (DPR 2 → 1.4, half the fragments) and the frosted glass on every panel —
   and NEITHER was ever asked for. Both file headers quote an instruction that says the opposite
   (「品質は落とすな」 / 「速度、画質を高めて。どちらか一方犠牲はNG」) and then argue that splitting
   the trade IN TIME is not a sacrifice, because the still frame is unchanged. That argument was
   invented here, not agreed: 「それって品質に影響しますか？」→ yes, it does — a frame being looked at
   during a gesture is still a frame. 「外せ　良いわけないだろうが　なぜ確認しなかった」.
   ⚠ THE RULE THIS BREAKS IS NOT ABOUT RENDERING. It is 「勝手なことを確認せずにやるな」 — do not
   decide anything on the reader's behalf without asking first. Anything that changes what the app
   looks like is theirs to approve, before it is written. */
/* (#R311) js/volume3d.js is on-demand (js/lazy-modules.js): `#btn-tool-volume` and Atlas's volume3d action await it. */
import '../js/view-controls.js';
import '../js/drone-nav.js';
/* (#R184) the ten operational capabilities that hang off js/drone-nav.js's #R174 seams — wind at
   altitude, the radio link, restricted areas, the return-leg reserve, landing sites, route
   comparison, return-to-home and multi-aircraft conflicts. After the planner, because it attaches
   to the planner's published API. */
import '../js/drone-ops.js';
/* (#R184/#R311) js/aircraft-detail.js, js/satellites-live.js and js/satellite-detail.js are on-demand
   (js/lazy-modules.js): the aircraft click fetches the first, the `dl-sats` row the other two. The
   satellite layer is the one module here with a real npm dependency of its own (satellite.js, MIT —
   SGP4/SDP4 is not something to hand-roll), which now lands in that chunk rather than in the boot one. */
import '../js/auth-ui.js';
import '../js/community.js';
import '../js/satellite.js';
import '../js/ai-core.js';
import '../js/place-labels.js';
import '../js/window-manager.js';
import '../js/search-geocode.js';
import '../js/news-context.js';
import '../js/news-feed.js';
/* (#R207) the news OUTLET filter — the picker in Settings and the predicate the feed is filtered by.
   Registers a factory only; js/app-body.js calls it where the other settings pickers are wired. */
import '../js/news-sources.js';
import '../js/article-reader.js';
import '../js/community-board.js';
/* (#R311) the map hover tooltip — one surface used by every hover handler in the app, moved out of
   js/app-body.js so the shell budget (tests/r168 #8) is paid rather than raised. See that file. */
import '../js/map-tooltip.js';
import '../js/map-readout.js';
import '../js/elevation-profile.js';
/* (#R186) the real night sky behind the globe (stars from the bundled Bright Star Catalogue, the Sun
   at its true position) and the coarse whole-Earth satellite base that removes the blank-tile wait.
   Both publish a window API and do nothing until app-body starts them, so their position in this
   list only has to be BEFORE js/app-body.js — like every other module here. */
import '../js/space-sky.js';
import '../js/world-base.js';
/* (#R196) the day/night side of the planet and the city lights on it, both fading in as the camera
   pulls back to the whole-Earth view. Publishes window.IntMapNightSide and builds nothing — not a
   layer, not the GIBS request — until the camera is first wide enough for either to be visible. */
import '../js/night-side.js';
/* (#R197) THE SPACE EXPLORER, in two files for the two different kinds of thing it is.
   js/ephemeris.js is arithmetic — the JPL approximate elements, the truncated ELP-2000/82 Moon and
   the IAU rotational elements. No DOM, no renderer, no app state, so it is verified in Node
   (tests/r197-space.test.mjs) against an independent solar series, against Kepler's third law, and
   against the Moon's own libration.
   js/space.js is the view: its own WebGL sphere renderer, the body list, the clock and the two
   scales. It registers a factory and allocates NOTHING — no context, no texture, no star catalogue —
   until the button at the far end of the zoom is pressed. */
/* (#R208) the sky from a POINT ON THE GROUND — the same catalogue as js/space-sky.js seen from a
   person's horizon instead of from the map's camera, with the skyline measured off the DEM. Loads
   after js/ephemeris.js because it asks it for the Sun, Moon and planets, and allocates nothing
   until the right-click item is used. */
import '../js/ephemeris.js';
/* (#R212) 「次の皆既月食まであと何日、みたいな表示…ほかの現象も」 — the events are SEARCHED in the
   ephemeris above (Meeus ch. 54 shadow radii for the eclipses), so this must come after it and before
   the view that lists them. Pure arithmetic like js/ephemeris.js: no DOM, no renderer. */
import '../js/space-events.js';
/* (#R213) 「Voyager 1 / 2、New Horizons、Parker Solar Probe…」「小惑星、彗星も」「太陽系のさらに外の宇宙も」
   — three populations js/ephemeris.js cannot carry, because none of them is a closed-form series:
   sampled Horizons trajectories (Hermite), SBDB osculating elements (Kepler, elliptic AND hyperbolic)
   and SIMBAD deep-sky positions with measured distances. Arithmetic only, like the two files above,
   so it is verified in Node — and it FETCHES NOTHING until one of the three switches is pressed. */
import '../js/space-bodies.js';
/* (#R219) the distance ladder out of the solar system — published radii from the Kuiper cliff to the
   particle horizon, so «zoom out past the planets» has a measured object on every step instead of an
   empty claim. Pure data + arithmetic, verified in Node (tests/r219-checks). */
import '../js/space-cosmos.js';
import '../js/space.js';
/* (#R195) the `imapsat://` tile protocol — 259 lines of Esri fetching, placeholder detection,
   ancestor cropping and the @2x stitch, lifted out of js/app-body.js. Like every module here it only
   registers a factory; js/app-body.js calls it from the exact point the code used to occupy, because
   the style object below that point reads the flag the factory sets. */
import '../js/sat-proto.js';

/* (#R175) LAST, deliberately: js/app-body.js is index.html's old inline body, and it must register its
   DOMContentLoaded listener only after every module above has published its globals — exactly the order
   the classic tag block had. */
import '../js/app-body.js';

/* ── (#R162/#R163) THE REQUIRED-MODULE GUARD, moved here verbatim from the inline <script> that used to
      sit right after the tag block. It has to run after every import above and before the app's
      DOMContentLoaded body, which is precisely where it now sits. A file that failed to load says so
      loudly instead of surfacing later as "cannot read property of undefined"; the FACTORY list is
      checked as well as the namespace, because one missing file leaves the namespace itself present (an
      earlier file created it) while the feature it carries is gone. ── */
const MODULE_FACTORIES = [
  'maddison', 'histStates', 'histId', 'layerPreviews', 'monitors', 'companies',
  'compare', 'routing', 'timeBorders',
  'dataLayers', 'workspace', 'widgets', 'wbLayers', 'betaOverlays', 'cameras',
  'layerRegistry', 'layerSidebar', 'ticker', 'layerPresets', 'labelPopup',
  'geojsonUpload', 'viewHash', 'share', 'projView', 'drawTool',
  'isolate', 'seaRoute', 'outline', 'moveShape', 'isochrone',
  'arc3d', 'objectList', 'wind', 'weatherEC', 'weatherPanel', 'earthSky',
  'landCover', 'betaPack2', 'religionLang', 'timeZones', 'gibsScience', 'timeSeries',
  'aiResearch', 'correlate', 'worldEvents', 'edu', 'radiation', 'popArea',
  'slope', 'sun', 'transitReach',
  'legal', 'feedback', 'onboarding', 'progressCtl', 'mobileUI', 'layoutReflow',
  'newsTimeline', 'dashExtended', 'locate', 'annotations', 'layerHoverPopup',
  'runwaySearch', 'terrain', 'railSeaOverlays', 'countriesUi', 'newsUi', 'companiesUi',
  'toolPanel', 'authUi', 'community', 'satellite', 'aiCore', 'placeLabels',
  'windowManager', 'searchGeocode', 'newsContext', 'newsFeed', 'articleReader', 'communityBoard',
  'mapReadout', 'mapTooltip', 'elevationProfile', 'viewControls', 'solid3d', 'droneNav',
  'droneOps', 'routingOps',
  'satProto', 'tileWarm', 'orbitPoints', 'limbLayer', 'newsSources', 'industryWeb',
  'oceanCurrents', 'usElections', 'precipAnnual',
];
/* ── (#R209) …AND THE ONES THAT ARE NOT HERE YET, ON PURPOSE ────────────────────────────────────
   These files are not in the import list above: they are fetched by js/lazy-modules.js the
   first time the user reaches for the feature. The guard below therefore CANNOT check them at boot
   — `typeof M[k] !== 'function'` is the correct answer for a module nobody has asked for, and
   reporting it would make every clean boot look broken.
   ⚠ THE CHECK IS NOT DROPPED, IT IS MOVED. js/lazy-modules.js verifies, at the moment each one
   lands, that the factory registered AND that the global it owns was published, and records any
   failure in window.__imLazyCheck.failed — which tests/r209.spec.js asserts is empty after asking
   for every one of them. Naming them here keeps ONE list of every factory the program has, so a
   file that is deleted or renamed still has somewhere to be missing from. (#R311) six more.
   ⚠ (#R322) …and five that are HALVES of a factory that is still eager. `timeSeries`, `aiResearch`,
   `correlate`, `worldEvents` and `edu` stay in MODULE_FACTORIES above, because js/analysis-panels.js
   still registers all five at boot — it is their BODIES that moved, into the five `analysis*` keys
   below, and the boot guard cannot see those for the same reason it cannot see the others.
   (#R341) …and `aviationLive`, which carries the whole live-aircraft platform: the controller, the
   GPU primitive it imports, and the worker that owns the fleet. Nothing of it is downloaded until
   the aircraft layer, aircraft search or an Atlas aviation command asks for it. */
const LAZY_FACTORIES = ['flightSim', 'playground', 'seismic', 'tsunami', 'terrainWater', 'los', 'streetView', 'atlasConsole', 'routeUi', 'dataCenters', 'aircraftDetail', 'volume3d', 'statsCompare', 'satellitesLive', 'satelliteDetail', 'analysisTimeSeries', 'analysisResearch', 'analysisCorrelate', 'analysisEvents', 'analysisEdu', 'aviationLive'];
(function () {
  const miss = ['IntMapI18N', 'IntMapGazetteer', 'IntMapRefData', 'IntMapTables', 'IntMapModules', 'IntMapWx', 'IntMapPlaceFraming', 'IntMapLabelScale', 'IntMapCosmos', 'IntMapFaultGeom', 'IntMapRouteStore', 'IntMapRouteProviders', 'IntMapRouteGeocode', 'IntMapRouteCards', 'IntMapRouteExport', 'IntMapRouteErrors', 'IntMapRouteClock'].filter((k) => !window[k]);
  const M = window.IntMapModules || {};
  const missFac = MODULE_FACTORIES.filter((k) => typeof M[k] !== 'function');
  if (miss.length) console.error('[IntMap] required module file(s) failed to load: ' + miss.join(', ') + ' — check the js/ directory is deployed');
  if (missFac.length) console.error('[IntMap] module factories missing: ' + missFac.join(', ') + ' — the matching js/ file did not load');
  window.__imModuleCheck = { missing: miss, missingFactories: missFac, lazy: LAZY_FACTORIES.slice() };
})();
