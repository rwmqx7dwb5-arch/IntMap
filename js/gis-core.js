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
 *
 *  ══ #R783 — 同じ GIS を、画面の無いところでも動かす ═══════════════════════════════════════════
 *  An outside review read this layer and named what the mounting order above hides: every kernel
 *  resolves its neighbours from the GLOBAL SCOPE at call time (js/gis-ops.js:70, js/gis-layers.js:87,
 *  js/gis-raster.js:138 — each of them `window.X` inside a try), and the things this layer does NOT
 *  own — the geodesy, the layer registry, the renderer, the upload door — are supplied by the page.
 *  Each module is individually loadable in Node; the ASSEMBLY was not, because nothing but a browser
 *  ever built the scope they read each other out of.
 *
 *  ⚠ THE FIX IS NOT A SECOND GIS. A separate «headless GIS» beside this one would be two kernels
 *  with two opinions, and the panel, Atlas and any outside caller would stop being able to hand each
 *  other an id. js/gis-runtime.js holds the ONE assembler: the browser entry calls it with no
 *  dependencies (so the page supplies them, exactly as before), and a caller with no window passes
 *  `{scope, externals}` and gets the same instances, reachable through the same globals. What this
 *  file publishes is the mounting order ITSELF — `mountGis`, the function the assembler calls once
 *  it has decided what the scope is and what has been handed over.
 *
 *  ⚠ WHY THE ASSEMBLER IS A SECOND FILE. Its reader is outside js/: a Node caller imports
 *  `makeGisRuntime` from THIS file (docs/GIS-CORE.md §5.8), while the browser comes in through
 *  window.IntMapModules.gisCore below. An export no js/ module names is dead code by
 *  tests/r175-checks ③ — and the answer to that is a real reader, not a hidden export. So the
 *  mounting order and the assembler are two files that import each other by name: this one reads
 *  `makeGisRuntime` (to re-export it, and to build the browser door out of it), and
 *  js/gis-runtime.js reads `mountGis`. The cycle is evaluation-safe because neither half CALLS the
 *  other while the modules evaluate; js/gis-runtime.js's header says the same thing from its side.
 *
 *  ══ #R819 — 組み立てに「どの実行コンテキストのものか」を持たせる ═══════════════════════════════
 *  #R783 left one sentence true and unsaid: an assembly had no NAME for the world it lives in. Every
 *  kernel resolves its neighbours by bare global name (`window.IntMapData` inside a try, fifteen
 *  times), so 「which assembly is this」 was answerable only as 「the one this realm's window carries」
 *  — and js/gis-runtime.js held exactly ONE slot for that answer. mount() now takes a third argument,
 *  the EXECUTION CONTEXT, and the assembly states it in two places a later reader can ask:
 *
 *      API.context            — anybody holding the assembled face can say which context it is in
 *      scope.IntMapGisContext — the SCOPE states its own identity, asked the way the kernels ask for
 *                               everything else, and verified below like every other publish
 *
 *  ⚠ WHAT THIS IS NOT: A SECOND LOOKUP PATH. No kernel reads it, and none is asked to — a kernel
 *  still finds its neighbours by global name, so TWO contexts in ONE realm would still be two sets of
 *  kernels answering under one name. That is why js/gis-runtime.js still refuses `scope-conflict`
 *  unchanged, and why a second context needs a second REALM (its serve()/attach()/workerSource()
 *  half). What the context adds is an identity an assembly can be HELD BY: the runtime keeps a table
 *  of them rather than one slot, a context can be released — its globals taken off the scope it
 *  published them on, using the very list verified below — and a kernel that one day stops reading a
 *  bare global has a stated place to read instead. ⚠ THE DEFAULT IS THE IMPLICIT AMBIENT SCOPE this
 *  file has always mounted on: mount() with no context names one, so the browser path is unmoved.
 * ==========================================================================*/

import { makeGisDatasets } from './gis-datasets.js';
import { makeGisGeometry } from './gis-geometry.js';
import { makeGisCrs } from './gis-crs.js';
import { makeGisRaster } from './gis-raster.js';
import { makeGisWarp } from './gis-warp.js';
import { makeGisAtlas } from './gis-atlas.js';
import { makeGisIndex } from './gis-index.js';
import { makeGisExpr } from './gis-expr.js';
import { makeGisUnits } from './gis-units.js';
import { makeGisWorker } from './gis-worker.js';
import { makeGisLayers } from './gis-layers.js';
import { makeGisSources } from './gis-sources.js';
import { makeGisOps } from './gis-ops.js';
import { makeGisProject } from './gis-project.js';
import { makeGisPanel } from './gis-panel.js';
/* ⚠ (#R783) THE ASSEMBLER, READ BY NAME AND HANDED STRAIGHT ON. The re-export is what an outside
   caller imports (`import { makeGisRuntime } from './js/gis-core.js'`), and shellEntry below is the
   browser's way into the same function — one assembler, two doors, no second set of kernels. */
import { makeGisRuntime } from './gis-runtime.js';
export { makeGisRuntime };
/* ══ ⚠ (#R783) ONE TOP-LEVEL BINDING, AND THE REST OF THE FILE INSIDE IT ═════════════════════
   tests/r175-checks ③ is the property the bundling rests on: a js/ module may hold NO unexported
   top-level declaration, because a classic script's top-level `const`/`function` was a global and
   this file is still loaded as the `gisCore` chunk beside fifteen kernels that resolve each other
   by global name. What is inside this closure is `mount` and `shellEntry` — module-private in
   intent, neither of them wrapped in fact before this round, and the rule does not admit an export
   written only so a test can reach a helper. So the mounting order lives in one closure and the
   file publishes the ONE name the assembler reads: `mountGis`.
   ⚠ WRAPPED WHOLE, NOT REFORMATTED. The body below is byte-for-byte what it was — the same
   expressions, the same indentation, the same order, and the window registration still running at
   module evaluation — so this change cannot alter an answer. Re-indenting 185 lines while calling
   it a move is the shape [[intmap-my-own-fix-had-the-shape-i-was-fixing]] records. */
export const mountGis = (function () {

function mount(scope, HOST, CONTEXT) {
  /* ⚠ (#R819) WHICH EXECUTION CONTEXT THIS ASSEMBLY BELONGS TO, stated before anything is built.
     A caller that names one (js/gis-runtime.js does) gets that name back on the face and on the
     scope; a caller that names none is mounting the implicit ambient scope this file has always
     mounted on, and that is what it is CALLED — 「unstated」 rather than a scopeSource invented here,
     because the assembler is the half that knows whether the scope was the realm's own or installed
     into it. Frozen: an assembly that could be renamed after the fact would be an identity that two
     holders disagree about. */
  const ctx = Object.freeze({
    id: (CONTEXT && CONTEXT.id != null) ? String(CONTEXT.id) : 'gis:ambient',
    scopeSource: (CONTEXT && CONTEXT.scopeSource != null) ? String(CONTEXT.scopeSource) : 'unstated',
  });
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
  /* (#R774) 「この 2 つは同じ量か」. Mounted here for the same reason as every kernel above: both
     js/gis-raster.js (before it subtracts two grids) and js/gis-ops.js (before it evaluates a
     reader's expression) read window.IntMapGisUnits at CALL time, and a private import in either
     would be a second opinion about whether metres and kilometres are the same quantity. */
  const units = makeGisUnits();
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
    /* From the scope this assembly was mounted on, at CALL time — the same rule every kernel above
       follows, and the reason a headless runtime reaches the same door (#R783). */
    let GU = null; try { GU = scope.GeoJSONUpload || null; } catch (_) { GU = null; }
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

  /* ⚠ (#R783) THE FIVE STAGES, AS THE FUNCTIONS THAT ACTUALLY DO THEM. The outside review drew the
     flow 「データを探す → 内容・時期・単位・取得可能範囲を確認する → 必要な条件で取得する → 共通 GIS
     演算を実行する → 結果・根拠・制約・再取得用の参照を返す」, and every one of those already had an
     implementation — reachable only by knowing which of fifteen modules held it. These are REFERENCES
     to those implementations, so this is a table of contents and not a fifth caller: a copy would be
     the 「Atlas 用 GIS と外部 AI 用 GIS を別々に作る」 this round exists to refuse.
     ⚠ `find` ANSWERS TWO STAGES AND THAT IS NOT A SHORTCUT: js/gis-atlas.js's catalogue() states,
     for every dataset and every map layer, what it holds, its time declaration, its columns with
     their units and the window it can answer for. 探す and 確認する are one document there. */
  const flow = Object.freeze({
    find: atlas.catalogue,
    acquire: atlas.acquire,
    run: atlas.run,
    draw: atlas.draw,
    /* 「根拠・制約・再取得用の参照」 — js/gis-project.js manifest(), whose `gaps` are the 制約 part. */
    account: project.manifest,
    verify: project.verify,
  });

  const API = { data, geometry, crs, raster, warp, index, expr, units, worker, sources, layers, ops, project, panel, draw, atlas, flow,
    context: ctx,
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle() };
  try { scope.IntMapGis = API; } catch (_) { }
  /* (#R819) The scope says which assembly it is carrying. ⚠ It is published HERE and verified with
     the kernels below for the same reason they are: a context nobody can read off the scope would be
     an identity this function believes and no one else can check. */
  try { scope.IntMapGisContext = ctx; } catch (_) { }

  /* ⚠ THE KERNELS ARE ASKED WHETHER THEY ARE REACHABLE, NOT ASSUMED TO BE. Each module publishes
     ITSELF onto the scope (its own `try { window.X = API }`), which is the right owner of its name —
     naming them again here would be a second naming authority. What is verified is the thing the
     whole assembly rests on: that the object the kernels publish into is the object they read out of.
     A headless scope where this failed would give a registry nobody else can find, and every op
     would answer `registry-missing` with no reason a reader could act on. */
  /* ⚠ (#R819) THE TABLE HAS A NAME NOW BECAUSE IT HAS A SECOND READER, and that reader must not
     write the list again: js/gis-runtime.js takes an assembly back OFF a scope when its context is
     released, and a hand-copied list there would leave behind whichever kernel was added last —
     under a name the next assembly is about to publish. One list, verified here, handed back below
     (.agents/rules/no-ad-hoc-hardcoding.md §2-4: 「一覧が要るなら、一覧を発見する」). */
  const verified = [['IntMapData', data], ['IntMapGisGeometry', geometry], ['IntMapGisCrs', crs],
    ['IntMapGisRaster', raster], ['IntMapGisWarp', warp], ['IntMapGisIndex', index], ['IntMapGisExpr', expr],
    ['IntMapGisUnits', units], ['IntMapGisWorker', worker], ['IntMapGisSources', sources],
    ['IntMapGisLayers', layers], ['IntMapGisOps', ops], ['IntMapGisProject', project], ['IntMapGis', API],
    ['IntMapGisContext', ctx]];
  const unreachable = [];
  for (const [g, inst] of verified) {
    let seen = null; try { seen = scope[g] || null; } catch (_) { seen = null; }
    if (seen !== inst) unreachable.push(g);
  }
  if (unreachable.length) return { ok: false, why: 'kernel-not-reachable', detail: { globals: unreachable } };

  /* The shell's own door, on whatever scope this assembly lives in — so the one below (which runs at
     import time, and only where a window already exists) is not the only way in. */
  try { scope.IntMapModules = scope.IntMapModules || {}; scope.IntMapModules.gisCore = shellEntry; } catch (_) { }
  /* ⚠ (#R819) WHAT WAS PUBLISHED IS ONE NAME WIDER THAN WHAT IS VERIFIED, and the difference is not
     an oversight in either direction. js/gis-panel.js publishes ITSELF as IntMapGisPanel (its own
     line 2221), like every kernel above — but it is the one that has never been in the reachability
     check, and putting it there now would be a NEW way for a mount that works today to fail. It does
     belong in what a released context takes back off the scope, though: a name left behind is a name
     the NEXT assembly is about to publish, and #R819's first run of the check found exactly this one
     still sitting on a scope after release. ⚠ IntMapModules.gisCore is deliberately absent from both:
     it is the door to the ASSEMBLER, not part of this assembly, and it mounts a fresh one when it is
     next called. */
  const published = verified.concat([['IntMapGisPanel', panel]]);
  return { ok: true, gis: API, context: ctx, verified: verified, published: published };
}

/* ⚠ (#R783) THE BROWSER ENTRY IS UNCHANGED IN WHAT IT DOES AND WHAT IT RETURNS. It hands over no
   dependencies, so the page is the supplier and every absence stays a call-time question, which is
   what js/lazy-modules.js has always got back from here. */
function shellEntry(HOST) {
  const r = makeGisRuntime({ host: HOST });
  /* ⚠ A REFUSAL IS NOT AN API. `gisCore` is expected to return the mounted layer; where it cannot,
     the reason is thrown rather than returned as an object that looks like one — a caller handed
     `{ok:false}` would call .data on it and fail one step later, with the wrong sentence. */
  if (!r.ok) throw new Error('gisCore: ' + r.why + (r.detail ? ' ' + JSON.stringify(r.detail) : ''));
  return r.gis;
}

/* Registered where there is a window, which is every browser and no Node import. ⚠ AN UNGUARDED
   `window.IntMapModules` at module top level made this file the one member of the fifteen that could
   not be IMPORTED in Node at all (ReferenceError before the first line of anybody's test), which is
   how the assembly came to be the part nothing headless could measure. */
try {
  if (typeof window !== 'undefined' && window) {
    window.IntMapModules = window.IntMapModules || {};
    window.IntMapModules.gisCore = shellEntry;
  }
} catch (_) { }

return mount;
})();
