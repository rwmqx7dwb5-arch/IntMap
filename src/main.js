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

import '../js/newsgeo.js';
import '../js/i18n.js';
import '../js/gazetteer.js';
import '../js/reference-data.js';
import '../js/layer-previews.js';
import '../js/history.js';
import '../js/monitors.js';
import '../js/companies.js';
import '../js/stats-compare.js';
import '../js/compare.js';
import '../js/routing.js';
import '../js/street-view.js';
import '../js/flight-sim.js';
import '../js/time-borders.js';
import '../js/data-layers.js';
import '../js/workspace.js';
import '../js/widgets.js';
import '../js/wb-layers.js';
import '../js/beta-overlays.js';
import '../js/cameras.js';
import '../js/atlas-console.js';
import '../js/map-ui.js';
import '../js/playground.js';
import '../js/map-tools.js';
import '../js/viewshed.js';                 /* (#R176) IntMapModules.los, moved out of map-tools.js */
import '../js/terrain-water.js';            /* (#R176) sculpt the terrain, route the water */
import '../js/seismic.js';                  /* (#R176) P/S/surface waves through IASP91 */
import '../js/insolation.js';               /* (#R176) terrain shadow + the annual sunlight budget */
import '../js/weather.js';
import '../js/layer-packs.js';
import '../js/analysis-panels.js';
import '../js/sims.js';
import '../js/tables.js';
import '../js/legal.js';
import '../js/feedback.js';
import '../js/onboarding.js';
import '../js/mobile-ui.js';
import '../js/news-timeline.js';
import '../js/dash-extended.js';
import '../js/map-extras.js';
import '../js/countries-ui.js';
import '../js/news-ui.js';
import '../js/companies-ui.js';
import '../js/tool-panel.js';
import '../js/solid3d.js';
import '../js/volume3d.js';
import '../js/view-controls.js';
import '../js/drone-nav.js';
import '../js/aircraft-detail.js';
import '../js/auth-ui.js';
import '../js/community.js';
import '../js/satellite.js';
import '../js/ai-core.js';
import '../js/place-labels.js';
import '../js/window-manager.js';
import '../js/search-geocode.js';
import '../js/news-context.js';
import '../js/news-feed.js';
import '../js/article-reader.js';
import '../js/community-board.js';
import '../js/map-readout.js';
import '../js/elevation-profile.js';

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
  'statsCompare', 'compare', 'routing', 'streetView', 'flightSim', 'timeBorders',
  'dataLayers', 'workspace', 'widgets', 'wbLayers', 'betaOverlays', 'cameras',
  'atlasConsole', 'layerRegistry', 'layerSidebar', 'ticker', 'layerPresets', 'labelPopup',
  'geojsonUpload', 'viewHash', 'share', 'playground', 'projView', 'drawTool',
  'isolate', 'seaRoute', 'los', 'outline', 'moveShape', 'isochrone',
  'arc3d', 'objectList', 'wind', 'weatherEC', 'weatherPanel', 'earthSky',
  'landCover', 'betaPack2', 'religionLang', 'timeZones', 'gibsScience', 'timeSeries',
  'aiResearch', 'correlate', 'worldEvents', 'edu', 'radiation', 'popArea',
  'slope', 'rf', 'sun', 'transitReach', 'disaster', 'earthReplay',
  'legal', 'feedback', 'onboarding', 'progressCtl', 'mobileUI', 'layoutReflow',
  'newsTimeline', 'dashExtended', 'locate', 'annotations', 'layerHoverPopup', 'layerSearch',
  'runwaySearch', 'terrain', 'railSeaOverlays', 'countriesUi', 'newsUi', 'companiesUi',
  'toolPanel', 'authUi', 'community', 'satellite', 'aiCore', 'placeLabels',
  'windowManager', 'searchGeocode', 'newsContext', 'newsFeed', 'articleReader', 'communityBoard',
  'mapReadout', 'elevationProfile', 'volume3d', 'viewControls', 'solid3d', 'droneNav',
  'aircraftDetail',
];
(function () {
  const miss = ['IntMapI18N', 'IntMapGazetteer', 'IntMapRefData', 'IntMapTables', 'IntMapModules'].filter((k) => !window[k]);
  const M = window.IntMapModules || {};
  const missFac = MODULE_FACTORIES.filter((k) => typeof M[k] !== 'function');
  if (miss.length) console.error('[IntMap] required module file(s) failed to load: ' + miss.join(', ') + ' — check the js/ directory is deployed');
  if (missFac.length) console.error('[IntMap] module factories missing: ' + missFac.join(', ') + ' — the matching js/ file did not load');
  window.__imModuleCheck = { missing: miss, missingFactories: missFac };
})();
