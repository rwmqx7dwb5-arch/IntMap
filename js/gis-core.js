/* ============================================================================
 *  IntMap · THE GIS CORE, IN ONE DOOR — window.IntMapGis   (#R729)
 * ----------------------------------------------------------------------------
 *  Four files arrive together or not at all:
 *
 *      js/gis-datasets.js   window.IntMapData         what a dataset is
 *      js/gis-ops.js        window.IntMapGisOps       what can be done to one, and to its output
 *      js/gis-project.js    window.IntMapGisProject   what survives closing the tab
 *      js/gis-panel.js      window.IntMapGisPanel     the operating surface
 *
 *  ⚠ WHY ONE LAZY ENTRY AND NOT FOUR. js/lazy-modules.js is part of the app SHELL, and the shell
 *  has a line budget (tests/r168-checks ⑧) with single-digit headroom most rounds — four entries is
 *  twelve lines in three tables. It is also not a real choice: the registry with no ops is a list
 *  nothing can act on, and the ops with no registry have nowhere to put their output. There is no
 *  session that wants one of the four.
 *
 *  ⚠ AND THE READER PAYS FOR NONE OF IT UNTIL A FILE LANDS. js/map-ui.js asks for `gisCore` when a
 *  file has actually been read, and the Data button asks for it when it is pressed. A session that
 *  never opens a dataset never downloads a polygon clipper.
 *
 *  ⚠ THIS FILE MOUNTS; IT DOES NOT DECIDE. Every rule lives in the four files above. What is here
 *  is the order they come up in (registry first — the other three read it) and the one public name
 *  that other modules reach for.
 * ==========================================================================*/

import { makeGisDatasets } from './gis-datasets.js';
import { makeGisOps } from './gis-ops.js';
import { makeGisProject } from './gis-project.js';
import { makeGisPanel } from './gis-panel.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.gisCore = function (HOST) {
  const data = makeGisDatasets();
  const ops = makeGisOps();
  const project = makeGisProject();
  const panel = makeGisPanel(HOST);

  /* The one thing this file adds that none of the four could: turning a dataset into something the
     map draws. ⚠ It goes through window.GeoJSONUpload (js/map-ui.js) rather than adding a source
     itself — that list is what the Object List and the layer rows already read, and a second way to
     put a FeatureCollection on the map would be a second thing to keep in step. */
  function draw(id) {
    const ds = data.get(id);
    if (!ds) return { ok: false, why: 'input-missing' };
    const GU = window.GeoJSONUpload;
    if (!GU || typeof GU.add !== 'function') return { ok: false, why: 'map-unavailable' };
    try {
      GU.add({ type: 'FeatureCollection', features: ds.features() }, ds.title);
      return { ok: true };
    } catch (e) { return { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
  }

  const API = { data, ops, project, panel, draw,
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle() };
  try { window.IntMapGis = API; } catch (_) { }
  return API;
};
