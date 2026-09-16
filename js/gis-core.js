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
import { makeGisWarp } from './gis-warp.js';
import { makeGisAtlas } from './gis-atlas.js';
import { makeGisIndex } from './gis-index.js';
import { makeGisExpr } from './gis-expr.js';
import { makeGisWorker } from './gis-worker.js';
import { makeGisLayers } from './gis-layers.js';
import { makeGisSources } from './gis-sources.js';
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
  /* (#R749) The grid's coordinate arithmetic: reprojection and resampling. Mounted here for the
     reason the note above gives — it reads window.IntMapGisRaster and window.IntMapGisCrs at CALL
     time (the sampling rule and the projection engine both belong to somebody else), so a module
     that imported either privately would be a second copy of a kernel. Pure otherwise: no DOM, no
     network, and the projection library it needs is the one js/gis-crs.js already fetches on
     demand, so this costs what its own bytes cost. */
  const warp = makeGisWarp();
  const index = makeGisIndex();
  /* (#R738) The expression kernel behind the compute op. Pure — a tokeniser and a recursive-descent
     parser, no eval and no Function — and mounted here for the reason the note above gives: js/gis-ops.js
     reads window.IntMapGisExpr at CALL time, so a module importing it privately would be a second
     parser with a second opinion about what a column name is. */
  const expr = makeGisExpr();
  /* (#R752) Parallelism, which is the half of 「重い処理」 the yield in js/gis-ops.js does NOT provide
     (docs/GIS-CORE.md §6 said so: 「ここで足りないのは並列性であって応答性ではない」). It takes PURE
     ARITHMETIC over numeric arrays — pixel loops, where there is no registry and no geodesy to leave
     behind on this thread. Mounted here for the same reason as every kernel above: a caller reads
     window.IntMapGisWorker at CALL time, and a module importing it privately would hold a second
     pool. ⚠ It costs what its own bytes cost: this whole file is behind the `gisCore` chunk, so
     nothing of it is fetched at boot. */
  const worker = makeGisWorker();
  /* (#R749) Where data is acquired FROM, as opposed to what is done with it. js/gis-layers.js
     reads window.IntMapGisSources at call time and will make one if nobody has — so this mount is
     not what makes it work; it is what makes the order VISIBLE, which is what this file is for. */
  const sources = makeGisSources();
  const layers = makeGisLayers();
  const ops = makeGisOps();
  const project = makeGisProject();
  const panel = makeGisPanel(HOST);

  /* The one thing this file adds that none of the four could: turning a dataset into something the
     map draws. ⚠ It goes through window.GeoJSONUpload (js/map-ui.js) rather than adding a source
     itself — that list is what the Object List and the layer rows already read, and a second way to
     put a FeatureCollection on the map would be a second thing to keep in step. */
  function draw(id, opts) {
    const ds = data.get(id);
    if (!ds) return { ok: false, why: 'input-missing' };
    const GU = window.GeoJSONUpload;
    if (!GU || typeof GU.add !== 'function') return { ok: false, why: 'map-unavailable' };
    /* ⚠ (#R749) A GRID IS STILL NOT A FeatureCollection — IT IS NOW DRAWN AS A PICTURE. #R735 named
       the refusal rather than throwing inside a click, and that was right for a build with nowhere
       to put a grid. It stopped being right the moment the ops could MAKE grids: a difference, a
       masked extract, a baked layer — every one of them could be computed and none of them could be
       looked at, so a raster op was the end of a chain instead of a step in one. The picture goes on
       through the engine's own dynamic-image primitive (js/map-ui.js addRaster), which both
       renderers implement, so this is one door to the map and not two. */
    if (ds.kind === 'raster') return drawRaster(ds, GU, opts);
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

  /* (#R749) Painting a grid. ⚠ THE EXTREMES ARE MEASURED IN ONE PLACE. describeBands() walks the
     band and reports what is actually in it; js/map-ui.js is handed that report rather than the
     values, because a min/max computed a second time beside the ramp is how the legend and the
     picture come to disagree (docs/GIS-CORE.md §1.4 says the same about declared ranges).
     ⚠ AND THE BAND IS THE CALLER'S TO NAME. A grid with three bands has three pictures in it, and
     choosing one silently would be this project's 「誰も述べていない主張」 in colour. */
  function drawRaster(ds, GU, opts) {
    if (typeof GU.addRaster !== 'function') return { ok: false, why: 'map-unavailable', detail: { id: ds.id, kind: 'raster' } };
    const band = Math.max(0, Math.round(Number(opts && opts.band) || 0));
    const bands = Array.isArray(ds.bands) ? ds.bands.length : 0;
    if (!(band < bands)) return { ok: false, why: 'band-out-of-range', detail: { bandIndex: band, bands: bands } };
    const stats = raster.describeBands(ds);
    if (!stats.ok) return stats;
    let put = null;
    try {
      put = GU.addRaster(ds, ds.title, { datasetId: ds.id, band: band, stats: stats.bands, spec: (opts && opts.spec) || null });
    } catch (e) { return { ok: false, why: 'map-unavailable', detail: { message: e && e.message } }; }
    /* Same rule as the vector arm (#R739): 「描けた」 is what the renderer reported, never the
       absence of a throw. */
    if (!put) return { ok: false, why: 'draw-not-rendered', detail: { id: ds.id, kind: 'raster' } };
    return { ok: true, sid: put.sid, band: band, legend: put.legend || null, drawnAt: put.drawnAt || null };
  }

  /* (#R743) The Atlas-facing door of this layer. ⚠ IT LIVES HERE AND NOT IN js/atlas-console.js
     BECAUSE THE OPS DECLARE THEMSELVES: the catalogue it hands the planner is `ops.ops()`, so an op
     added to DECL is offered to Atlas the same day it is offered to the panel. The other direction —
     a list of ops written on the Atlas side — is the defect #R732 measured in the panel, where
     `ORDER` had four entries and DECL had nine. It needs no lazy door of its own: the whole of this
     file is behind `gisCore`, and asking Atlas to run an op is asking for this file. */
  const atlas = makeGisAtlas({ data: data, ops: ops, layers: layers, draw: (id, o) => draw(id, o) });

  const API = { data, geometry, crs, raster, warp, index, expr, worker, sources, layers, ops, project, panel, draw, atlas,
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle() };
  try { window.IntMapGis = API; } catch (_) { }
  return API;
};
