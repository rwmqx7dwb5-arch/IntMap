/* ============================================================================
 *  IntMap · THE GIS CORE, IN ONE DOOR — window.IntMapGis   (#R729)
 * ----------------------------------------------------------------------------
 *  Nine files arrive together or not at all:
 *
 *      js/gis-datasets.js   window.IntMapData         what a dataset is
 *      js/gis-geometry.js   window.IntMapGisGeometry  what a shape is, and what two shapes are to each other
 *      js/gis-crs.js        window.IntMapGisCrs       what the coordinates mean, and how to bring them here
 *      js/gis-raster.js     window.IntMapGisRaster    what a numeric grid is, and what a zone of one is worth
 *      js/gis-index.js      window.IntMapGisIndex     which pairs are worth testing at all
 *      js/gis-layers.js     window.IntMapGisLayers    how the map's own layers become datasets
 *      js/gis-ops.js        window.IntMapGisOps       what can be done to one, and to its output
 *      js/gis-project.js    window.IntMapGisProject   what survives closing the tab
 *      js/gis-panel.js      window.IntMapGisPanel     the operating surface
 *
 *  ⚠ WHY ONE LAZY ENTRY AND NOT SEVEN. js/lazy-modules.js is part of the app SHELL, and the shell
 *  has a line budget (tests/r168-checks ⑧) with single-digit headroom most rounds — four entries is
 *  twelve lines in three tables. It is also not a real choice: the registry with no ops is a list
 *  nothing can act on, and the ops with no registry have nowhere to put their output. There is no
 *  session that wants one of the nine.
 *
 *  ⚠ AND THE THREE ADDED IN #R732 ARE SHELLS THAT FETCH THEIR OWN WEIGHT LATER. js/gis-geometry.js
 *  and js/gis-crs.js each hold a dynamic import — a sweep-line and a projection engine — pulled at
 *  the first op and the first non-degree file respectively, and never otherwise. So the chunk this
 *  entry loads grew by the wiring, not by the libraries.
 *
 *  ⚠ AND THE READER PAYS FOR NONE OF IT UNTIL A FILE LANDS. js/map-ui.js asks for `gisCore` when a
 *  file has actually been read, and the Data button asks for it when it is pressed. A session that
 *  never opens a dataset never downloads a polygon clipper.
 *
 *  ⚠ THIS FILE MOUNTS; IT DOES NOT DECIDE. Every rule lives in the files above. What is here
 *  is the order they come up in (registry first — the other three read it) and the one public name
 *  that other modules reach for.
 * ==========================================================================*/

import { makeGisDatasets } from './gis-datasets.js';
import { makeGisGeometry } from './gis-geometry.js';
import { makeGisCrs } from './gis-crs.js';
import { makeGisRaster } from './gis-raster.js';
import { makeGisIndex } from './gis-index.js';
import { makeGisExpr } from './gis-expr.js';
import { makeGisLayers } from './gis-layers.js';
import { makeGisOps } from './gis-ops.js';
import { makeGisProject } from './gis-project.js';
import { makeGisPanel } from './gis-panel.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.gisCore = function (HOST) {
  /* ⚠ ORDER IS NOT DECORATION HERE. The registry comes up first because the other eight read it,
     and the geometry kernel before the ops because every op but filter asks it a question. Nothing
     awaits: each publishes a synchronous face and fetches what it borrows on demand, so this is a
     mounting order rather than a boot sequence. */
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const crs = makeGisCrs();
  /* (#R735) The grid arithmetic and the spatial index. Both are pure — no DOM, no network, no lazy
     import of their own — so they cost what their own bytes cost and nothing at boot: this whole
     entry is already behind js/lazy-modules.js and is not fetched until a file lands or the Data
     button is pressed. ⚠ THEY ARE MOUNTED HERE BECAUSE NOTHING ELSE MAY HOLD THEM: js/gis-ops.js
     reads window.IntMapGisRaster / window.IntMapGisIndex at CALL time (the same rule as the registry
     and the geodesy), so a module that imported them privately would be a second copy of a kernel. */
  const raster = makeGisRaster();
  const index = makeGisIndex();
  /* (#R738) The expression kernel behind the compute op. Pure — a tokeniser and a recursive-descent
     parser, no eval and no Function — and mounted here for the reason the note above gives: js/gis-ops.js
     reads window.IntMapGisExpr at CALL time, so a module importing it privately would be a second
     parser with a second opinion about what a column name is. */
  const expr = makeGisExpr();
  const layers = makeGisLayers();
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
    /* ⚠ (#R735) A GRID IS NOT A FeatureCollection, and window.GeoJSONUpload draws one of those. Left
       to fall through, this would have called a features() that raster records do not have — an
       exception inside a click, for a dataset the panel had just listed. Saying so by name is what
       lets the panel offer the reader something else instead of a dead button. */
    if (ds.kind === 'raster') return { ok: false, why: 'draw-needs-features', detail: { id: ds.id, kind: ds.kind } };
    const GU = window.GeoJSONUpload;
    if (!GU || typeof GU.add !== 'function') return { ok: false, why: 'map-unavailable' };
    try {
      /* ⚠ (#R738) THE DRAWN LAYER IS TOLD WHICH DATASET IT IS. Attribute colouring asks the registry
         what a column's values mean (js/map-ui.js style()), and without this the layer a reader just
         drew from an analysis result had no id to ask about — matching it back by TITLE would break
         on the day two datasets share a name, which is the 「識別子で結び、綴りで結ばない」 rule this
         project keeps re-learning. The fourth argument is optional, so every other caller of add() is
         unaffected. */
      /* ⚠ (#R739) THE ANSWER IS WHAT add() REPORTS, NOT THE ABSENCE OF A THROW. This returned ok:true
         unconditionally, and production measured what that is worth: on the Globe renderer the draw
         said ok:true while nothing reached the map, so the reader was told their result was drawn and
         then told 'no-such-layer' when they asked to colour it. js/map-ui.js hands back the item it
         made, or null when it could not make one — «描けた» is now a fact somebody measured. */
      const put = GU.add({ type: 'FeatureCollection', features: ds.features() }, ds.title, null, { datasetId: ds.id });
      if (!put) return { ok: false, why: 'draw-not-rendered', detail: { id: ds.id } };
      return { ok: true, sid: put.sid };
    } catch (e) { return { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
  }

  const API = { data, geometry, crs, raster, index, expr, layers, ops, project, panel, draw,
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle() };
  try { window.IntMapGis = API; } catch (_) { }
  return API;
};
