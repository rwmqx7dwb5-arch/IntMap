/* ============================================================================
 *  IntMap · ENTRY — the page's one module script  (#R175 → module-graph)
 * ----------------------------------------------------------------------------
 *  #R175 turned sixty <script src> tags into ES modules imported here IN THE SAME ORDER, which was safe
 *  because no file had a top-level declaration: every one published itself on `window` and read its
 *  collaborators back off `window`. That made this list LOAD-BEARING — the only place the program said
 *  who needed whom — and it grew to 136 lines plus a 107-name list of factories checked after boot.
 *
 *  ⚠ WHAT THIS LIST IS NOW (module-graph). Files say what they need with `import`, and a module is
 *  evaluated after everything it imports — so ORDER IS DERIVED FROM THE IMPORT GRAPH. Factories are
 *  exports that js/app-body.js imports by name (a missing one is a link error, not a console line).
 *  A file whose top level only declares is reached through whoever imports it and is NOT listed here.
 *  What remains are files that still DO something when evaluated (publish on `window`, attach a
 *  listener, register rows) and whose readers have not all moved to `import` yet — the migration's
 *  remaining work, not an order to memorise. `node scripts/module-graph.mjs --entry` says, for every
 *  line, why it is still here; `--entry --write` removes the ones that no longer carry anything.
 *  The four slots tests/layer-boot-graph-checks.test.mjs pins (vendor and the engine first, newsgeo
 *  the first feature module, app-body last) stay where they are, for the reasons beside them.
 *
 *  Boot sequence, unchanged in effect: a type="module" script is deferred, so this runs after the
 *  document is parsed and BEFORE DOMContentLoaded fires — what index.html's main body waits for.
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
/* (safe-output-single-module) THE OUTPUT ENCODER, window.IntMapSafe — as early as the pinned first three
   allow, and before every module that renders. It used to be index.html's first <head> script; it is a
   file now so that sources.html, admin.html and the modules Node evaluates read the SAME body instead of
   keeping copies. Neither the three slots above nor anything they import touches IntMapSafe
   (tests/safe-output-single-module-checks measures that), and no inline script in index.html does. */
import '../js/safe-html.js';
/* (csp-without-inline) …and the one listener that runs what markup NAMES (`data-im-click="…"`) instead of
   what it used to CARRY (`onclick="…"`): the page's CSP admits no inline event attribute any more. It must
   be listening before any module renders such markup — an <img data-im-error> can fail the moment it is
   inserted. Nothing it does at load is more than three addEventListener calls on window. */
import '../js/inline-actions.js';
/* (client-error-log) …and, as early as the pinned first three allow, the error reporter: an exception thrown by
   any module evaluated after this line, or by the app at any later time, reaches IntMap's own record
   (public.client_errors) instead of nowhere — the Sentry loader it replaces never had a DSN. */
import '../js/client-error-report.js';
/* (anonymous-usage-counts) …and the anonymous usage counter, early enough to read the arrival (referrer,
   utm tags, a link's map view) before js/map-ui.js rewrites the address with this session's own view. */
import '../js/usage-counts.js';
/* (ui-layer-owner) …and the two owners of the screen's shape, before any module that builds a style
   string: which LAYOUT this viewport gets and which DEVICE it is (window.IntMapDevice — the 768 px
   boundary written once, and the classes on <body>), and who is IN FRONT (window.IntMapStack — the
   floating windows' order and the `.im-front` mark, reading the --z-* layers of css/intmap.css).
   No imports and no work at load beyond reading media queries, so their place costs nothing. */
import '../js/ui-device.js';
import '../js/ui-stack.js';
/* (mobile-performance) …and WHEN a phone may read each shipped file — boot / settled / need — before any
   reader of one. No imports beyond the device predicate js/ui-device.js published just above; nothing is
   read here. js/boot-stage.js has the plan and the measurement. */
import '../js/boot-stage.js';
import '../js/mem-budget.js';   /* (#R669) …and, before anything that decodes an elevation tile, the ONE owner of how many of them this device may hold. Five stores kept five hand-written ceilings for the same 262,144-byte tile and four of them never asked what device they were on (about 600 MB authorised on a phone), and it is also where 「携帯か」 is answered for the thirty-nine cost decisions that used to ask the viewport width. No DOM and no `window`, so the photo-search worker imports the same file and the two cannot disagree. */
/* (#R479) CARTO's key, the two tile-URL builders and the basemap credit. Anywhere before
   js/app-body.js works (it builds tile URLs at map setup); the first three slots and the last one
   are pinned by tests/layer-boot-graph-checks.test.mjs (#R175), so it sits here among the feature modules. */
import '../js/carto-basemap.js';
import '../js/historical-basemap.js';
/* (#R183) The one guarded weather/UV client, imported before anything that could ask it for a
   number. js/wx-source.js publishes window.IntMapWx synchronously (no factory), so it costs nothing
   here and guarantees the widget board, the point-weather popup and every other reader share one
   circuit breaker rather than each re-hammering a dead quota.
   It sits AFTER newsgeo deliberately: tests/layer-boot-graph-checks.test.mjs (#R175) pins newsgeo as the first feature module,
   and nothing about this file needs to precede it — its consumers all call it lazily. */
import '../js/wx-source.js';
/* (a11y-shared-dialog) the ONE dialog registry and the ONE «Enter/Space presses a role=button» listener
   — window.IntMapDialog, synchronous, no factory. Before every module that shows a modal or wires a
   pressable row; see js/dialog.js. */
import '../js/dialog.js';
import '../js/nominatim-gate.js';   /* (#R489) …and, for the same reason one guarded weather client exists, ONE queue in front of Nominatim. Seven files call that host; two kept private floors and five kept none, so «one request per second» was one per second EACH and fourteen Atlas oblast outlines left as fast as the network took them. EAGER and BEFORE the window-global callers (js/routing.js, js/river-course.js, js/search-geocode.js, js/routing-geocode.js): those reach it as window.IntMapNominatimGate rather than by name (they predate named imports in js/). */
import '../js/overpass.js';   /* …and ONE Overpass client with a clock (window.IntMapOverpass for the classic-shaped callers) — js/overpass.js */
/* (#R183) …and the pure "how close should the camera go for THIS kind of place" decision, which
   js/search-geocode.js consults from gotoPlace. Its own file because that factory's body may
   contain only declarations (tests/engine-app-shell-split-checks.test.mjs (#R169) #4) and because being map-free is what lets the
   whole table be tested without a browser. */
import '../js/place-framing.js';
/* (#R426) …and the other half of that decision, which had been folded into js/countries-ui.js as a
   min/max over the whole Natural Earth feature: WHICH PARTS OF A COUNTRY ARE THE COUNTRY. Norway's
   union is 135.2° of latitude because Bouvet Island is Norwegian, and framing that is not framing
   Norway. Pure like the module above, and for the same reason — it is verified in Node against the
   real geometry. It must precede js/countries-ui.js, which builds every country row from it. */
import '../js/country-extent.js';
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
import '../js/hist-scale.js';
import '../js/ohm-rings.js';   /* (#R604) …and the deep-time ARITHMETIC the clock and the Chronos panel both read: decimal years, the OpenHistoricalMap date filter, the year rail. No DOM, no map, no clock, so tests/history-chronos-clock-checks.test.mjs (#R604) can evaluate it — which is the whole reason it is not three helpers inside its two readers (#R570). (#R669) js/ohm-rings.js rides it for the same reason: it is the ONE owner of «an OpenHistoricalMap relation, as a polygon» — the click highlight assembles upstream geometry with it and scripts/build-hist-admin1.mjs evaluates the same file rather than carrying a second copy. */
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
import '../js/layer-rows.js';   /* (layer-manifest) the Layers registry's own rows (地名・国境・道路…) are written from js/layer-manifest.js HERE — after the English table (their text) and before js/data-layers.js, the first module that reads the registry. They were ten lines of index.html. */
import '../js/layer-time-kernel.js';   /* (world-at-time) a box whose layer states nothing about the instant on the clock is held back from its module — after layer-rows (its own hold for an undrawable style), before any module builds a row */
/* (#R233) …and the door #R232 left unguarded: `setLang()` repainted the whole UI from a table whose
   own chunk had not been fetched yet, so switching language at RUNTIME left Settings and the sidebar
   tabs in English while everything carried inline turned Japanese (「基本的なUIですら言語が混在」).
   One registered repaint, awaited before the switch and re-run if a locale lands by any other route. */
import '../js/lang-switch.js';
import '../js/gazetteer.js';
import '../js/reference-data.js';
import '../js/layer-previews.js';
import '../js/history.js';
import '../js/hist-cities.js';
/* (#R311) js/stats-compare.js is on-demand now (js/lazy-modules.js); js/compare.js below is the MAP-compare window, a different feature, and stays. */
import '../js/compare.js';
/* (#R291) the routing subsystem — five pure modules then the router; the PANEL is lazy. Architecture.md §8.4. */
import '../js/routing-store.js';
import '../js/routing-providers.js';
import '../js/routing-geocode.js';
import '../js/routing-cards.js';
import '../js/routing-export.js';
/* (#R347) two more, eager because both are read before the panel exists (the failure taxonomy and
   the planning/navigation clock split, §33). ⚠ js/routing-traffic.js is deliberately NOT here —
   check:perf priced «eager for provider selection» at 22 kB of boot JS. DEV-NOTES #R347. */
import '../js/routing-errors.js';
import '../js/routing-time.js';
/* (hist-bundles-off-main) the ONE door to the ring-pooled historical records (data/cshapes.js,
   data/hist-borders.js, data/hist-eras.js, data/hist-admin*.js and the gap records): they are fetched,
   parsed and asked on a Worker it owns, and the page holds only what an instant draws. Read by
   js/time-borders.js, js/time-admin1.js, js/war-layer.js and js/border-coast.js; it starts nothing
   until one of them opens a bundle. */
import '../js/hist-bundles.js';
import '../js/border-coast.js';
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
import './radiation-worker-client.js';   /* (#R568) …and the radioactive-plume solver's, which publishes window.IntMapRadiationWorker and starts nothing until the dispersion panel (js/sims.js) asks for a run. The physics is js/radiation-model.js, imported by js/sims.js AND by src/radiation-worker.js — one copy, on whichever thread ends up running it. */
import '../js/data-layers.js';
import '../js/widgets.js';   /* (#R292) …and with it the ten js/widget-*.js modules it imports itself: the platform's load order is the PLATFORM's business, so the entry keeps the one line it had before the board was split. Roles: docs/FILES.md §3; structure: Architecture.md §7.5 */
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
   what the map draws must be runnable in a test without a renderer (tests/hazard-other-geometry-kernel-checks.test.mjs (#R218)). */
import '../js/streamline.js';
import '../js/map-ui.js';
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

/* (#R276) the forecast model (axis, .om URLs, decoded field, colour scales) and the WebGL particle renderer that draws the wind from it — both publish a window global synchronously and js/weather.js reads both, so they precede it. (#R356) js/wx-models.js is the registry of WHICH models exist (pure data and pure functions; no network, no SDK) and js/wx-ecmwf.js is now the multi-model engine that builds its instances from it — window.IntMapECMWF is the default instance and window.IntMapWxEngine builds the rest on demand, so the registry precedes the engine. */
import '../js/wx-ecmwf.js';
import '../js/wx-wind.js';   /* (#R293) js/wx-reanalysis.js went with the MERRA-2 source it existed for — 「気温レイヤーで、MERRA-2 再解析は削除。」 */
import '../js/weather.js';
/* (#R211) the sixth pack — trade, energy, warnings, tides, crops. Same shape as layer-packs.js
   (a factory on window.IntMapModules, instantiated once from js/app-body.js). Its ROWS must be eager:
   the progress gate and the session restore both key off those rows existing. (startup-lazy-layers)
   …and only its rows are: the five layers (js/world-packs.js) are fetched by js/lazy-modules.js the
   first time one of those rows is switched on — see js/world-packs-rows.js. */
import '../js/world-packs-rows.js';
/* (#R222) the field DECODER before the layer that reads it: a plain window module with no HOST, so
   nothing here depends on load order beyond "defined before first use". Both ocean-current layers
   (the World-data plate and the older data-layers row) read the same grid through it. */
import '../js/ocean-currents-field.js';
import '../js/outbreaks.js';   /* (#R216) 世界の海流 — same World-data toolkit; AFTER world-packs for the same reason industry-web is. (#R650) …and the WHO Disease Outbreak News layer. */
import '../js/sims.js';
import '../js/tables.js';
import '../js/legal.js';        /* …which imports js/legal-text.js — the words privacy.html / terms.html also read */
/* (#R231) the phone's base-map square + its popover — the five view controls, lifted out of the Map &
   layers sheet ("レイヤー選択欄から分離"). After js/mobile-ui.js because initMobileUI() installs it. */
import '../js/basemap-switch.js';
import '../js/countries-ui.js';
import '../js/news-ui.js';
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
   (tests/space-ephemeris-checks.test.mjs (#R197)) against an independent solar series, against Kepler's third law, and
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
/* (startup-lazy-layers) …which js/space.js now imports itself, so it arrives with the explorer */
/* (#R213) 「Voyager 1 / 2、New Horizons、Parker Solar Probe…」「小惑星、彗星も」「太陽系のさらに外の宇宙も」
   — three populations js/ephemeris.js cannot carry, because none of them is a closed-form series:
   sampled Horizons trajectories (Hermite), SBDB osculating elements (Kepler, elliptic AND hyperbolic)
   and SIMBAD deep-sky positions with measured distances. Arithmetic only, like the two files above,
   so it is verified in Node — and it FETCHES NOTHING until one of the three switches is pressed. */
/* (startup-lazy-layers) …imported by js/space.js — see above */
/* (#R219) the distance ladder out of the solar system — published radii from the Kuiper cliff to the
   particle horizon, so «zoom out past the planets» has a measured object on every step instead of an
   empty claim. Pure data + arithmetic, verified in Node (tests/engine-space-checks.test.mjs (#R219)). */

/* (#R175) LAST, deliberately: js/app-body.js is index.html's old inline body, and it must register its
   DOMContentLoaded listener only after every module above has published its globals — exactly the order
   the classic tag block had. */
import '../js/app-body.js';
import { LAZY_NAMES, CARRIED_NAMES } from '../js/lazy-modules.js';
/* (share-embed-distribution) …and the EMBED VIEW, only in an embed. index.html's first script sets <html data-embed>
   from `?embed=1`; js/embed-mode.js — the stylesheet that keeps only the map, its legends and the credits, the
   read-only gate and the bar — is a chunk of its own, so a normal start-up neither fetches nor parses it. */
if (window.IntMapDevice.embedded()) import('../js/embed-mode.js');   /* js/ui-device.js — the one answer to «is this an embed» */
/* (classroom-tours) …and the CLASSROOM MODE, only when it is asked for: a page opened with `?tour=<id>` (the
   address js/tours.js tourLink writes — its fragment is the step's own share link, which the boot restore
   applies), or the Settings entry #btn-tours. js/tour-player.js is a chunk of its own, so a normal start-up
   neither fetches nor parses it. Atlas's panel.tour reaches the same file from inside its own kernel. */
if (/[?&]tour=/.test(location.search)) import('../js/tour-player.js').then((m) => m.bootFromUrl());
document.addEventListener('click', (e) => { const b = e.target && e.target.closest ? e.target.closest('#btn-tours') : null; if (b) import('../js/tour-player.js').then((m) => m.openPicker()); });

/* ── (#R162/#R163 → module-graph) THE REQUIRED-MODULE GUARD ─────────────────────────────────────
   It used to hold MODULE_FACTORIES — 107 names, checked AFTER boot against window.IntMapModules,
   because a factory was a string key on a shared object and nothing else could say one was missing.
   Factories are exports now, and js/app-body.js imports each one BY NAME from the file that defines
   it: a missing file or a misspelt factory is a link error, refused by the bundler at build time and
   by the browser before a single module evaluates. That failure can no longer reach a booted page,
   so `missingFactories` is always empty — the field stays because the browser specs and the
   production smoke assert exactly that, and an empty answer is the true one.
   What a link cannot check is the globals still published for readers that reach them through
   `window` rather than `import`; those stay checked here until their last reader moves. ── */
/* (#R798) the deferred half and the carried one are DERIVED from js/lazy-modules.js's registry —
   one definition per module, and this guard reads it rather than keeping a second list. */
const LAZY_FACTORIES = LAZY_NAMES.slice(); const CARRIED_FACTORIES = CARRIED_NAMES.slice();
(function () {
  const miss = ['IntMapI18N', 'IntMapGazetteer', 'IntMapRefData', 'IntMapTables', 'IntMapWx', 'IntMapPlaceFraming', 'IntMapLabelScale', 'IntMapFaultGeom', 'IntMapRouteStore', 'IntMapRouteProviders', 'IntMapRouteGeocode', 'IntMapRouteCards', 'IntMapRouteExport', 'IntMapRouteErrors', 'IntMapRouteClock'].filter((k) => !window[k]);
  if (miss.length) console.error('[IntMap] required module file(s) failed to load: ' + miss.join(', ') + ' — check the js/ directory is deployed');
  window.__imModuleCheck = { missing: miss, missingFactories: [], lazy: LAZY_FACTORIES.slice(), carried: CARRIED_FACTORIES.slice() };
})();
