/* ============================================================================
 *  IntMap · THE RASTER KERNEL — window.IntMapGisRaster   (#R735)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §0 states the defect the GIS core was built to close: 「地図に載せたもの」 and
 *  「分析できるもの」 were two unrelated mechanisms, and the second had no entrance. #R729–#R732 closed
 *  it for VECTORS — `kind:'vector'` datasets, boolean ops, a geodesic buffer, a spatial predicate.
 *
 *  ⚠ AND THE SAME DEFECT WAS STILL OPEN, UNTOUCHED, FOR NUMERIC GRIDS. docs/GIS-CORE.md §6 says it
 *  in its own words: 「ラスターのデータセットが無い。この層は kind:'vector' だけを持つ。数値グリッドを
 *  読む経路はアプリの中に既にある（降水など）が、任意のグリッドを処理器が共通に読む入口には
 *  なっていない。」 The app HAS grids — DEM tiles, precipitation, Köppen, the pandemic field — and every
 *  one of them is read by a private sampler belonging to the layer that draws it. 「この県の平均標高」
 *  and 「この流域の土地被覆ごとの面積」 were not hard questions the app answered badly; they were
 *  questions with no addressee at all. This file is the addressee: the geometry and the arithmetic of
 *  a grid, so a grid can be asked the same things a vector dataset is asked.
 *
 *  ══ WHAT IS HERE AND WHAT IS DELIBERATELY NOT ═════════════════════════════════════════════════
 *  Here: the geodesic area of a pixel, sampling, zonal statistics over a polygon, masking by a
 *  condition, the difference of two grids, a measured description of each band, and TWO doors that
 *  turn an existing in-app sampler into a grid this file can read — `fromSampler` for a synchronous
 *  field, and `fromSamplerAsync` (#R749) for one that answers with a promise, which is every field
 *  this app actually has (`IntMapLayers.sampleAt`). The async one yields and reads its signal BY
 *  ELAPSED TIME, not per row: see its own note.
 *  Not here: dataset registration (js/gis-datasets.js), the op declarations that make a result the
 *  input of the next op (js/gis-ops.js), and file decoding (js/geo-import.js). This module has NO
 *  imports at all — not proj4, not polygon-clipping — because it is arithmetic over numbers and the
 *  coordinates it is handed. Everything it borrows it borrows from `window.*` AT CALL TIME, exactly
 *  as js/gis-geometry.js and js/gis-ops.js do, so it loads in Node with no DOM and answers
 *  `geodesy-missing` / `geometry-unavailable` by name instead of throwing.
 *
 *  ══ THE CONTRACT (the shape js/gis-datasets.js writes, and the only shape read here) ═══════════
 *      { width, height, bands:[{ name, unit, nodata }], grid:{ west, north, pixelLng, pixelLat },
 *        read(bandIndex) → number[] of length width·height, row-major, ROW 0 IS THE NORTHERNMOST }
 *  Degrees only (EPSG:4326), like every other coordinate in this layer — docs/GIS-CORE.md §1 states
 *  `crs` as a VALUE rather than an assumption for exactly this reason. Rows run north→south because
 *  every raster format this app can reach (GeoTIFF, ASCII grid, an image) writes them that way, so
 *  the alternative would be a flip performed by each producer and forgotten by one of them.
 *
 *  ⚠ `nodata: null` MEANS 「欠損値の宣言が無い」, NOT 「欠損が無い」. Those are the two things
 *  .agents/rules/historical-verification.md §3 keeps separating, and a grid whose producer declared
 *  no sentinel can still carry NaN — so NaN (and ±Infinity, which is not a measurement either) is
 *  ALWAYS missing, whatever the declaration says.
 *
 *  ══ ⚠⚠⚠ A VOID MUST NOT BE BLENDED INTO A MEASUREMENT ═════════════════════════════════════════
 *  This app has already paid for that mistake, and the measurement is in js/map-readout.js: a
 *  terrarium DEM tile of RGB(0,0,0) decodes to −32,768 m, 2,240 of 7,680 cells over the Sava
 *  floodplain read it, and Lake Biwa's largest basin reported a water level of **−7,800.7 m against a
 *  spill of 81 m** — 「a bilinear blend of one void corner with three real ones」. The blend did not
 *  fail; it returned a number, and the number was catastrophic and plausible.
 *  ⇒ SO bilinear here NEVER averages a void with a value. If any of the four surrounding centres is
 *  missing, the sample falls back to `nearest` and SAYS SO (`partial:true`, `method:'nearest'`). It is
 *  not an error — the reader asked about a place that has a value — and it is not silent either, so a
 *  caller that needs an uncontaminated interpolation can reject the point itself. The alternative
 *  (refuse the whole sample) would throw away the one honest number available at that pixel; the
 *  alternative the app used to have (blend anyway) invented one.
 *
 *  ══ ⚠⚠⚠ THE MEAN OF A GRID IS AREA-WEIGHTED, BECAUSE PIXELS ARE NOT EQUAL ═════════════════════
 *  A lat/lng cell shrinks with cos φ: measured below, 1°×1° is 12,363 km² at the equator and
 *  6,183 km² at 60°N — HALF. A plain Σvalue/count over a zone therefore counts the high-latitude half
 *  of that zone twice as heavily as the ground deserves, and 「ヨーロッパの大半」 is where that error
 *  lives (js/gis-ops.js says the same sentence about planar area). So `mean` is Σ(value·area)/Σarea,
 *  and the two sums are returned under names that cannot be mistaken for each other: `sum` is the sum
 *  of the VALUES (the count-weighted one, in the band's own unit) and `sumTimesAreaKm2` is the sum of
 *  value·km² (unit = the band's unit × km²) — which is the integral over the zone, and is what an
 *  「人口 per km² の層を面積で積む」 question actually wants.
 *
 *  ══ ⚠⚠⚠ A POINT METHOD AND AN AREAL METHOD ANSWER TWO DIFFERENT QUESTIONS ═════════════════════
 *  `sampleMethods()` holds six: `nearest`, `bilinear`, `cubic` ask what the field is worth AT one
 *  position; `average`, `mode`, `sum` ask about the input pixels an output pixel COVERS, and so they
 *  require the caller to state that footprint (`opts.cell`) — `sample-cell-not-stated` otherwise.
 *  The difference is DECLARED (`kind:'point'|'areal'` in `sampleMethodFacts()`), not left to each
 *  caller's memory of which name is which, and the two kinds do not share an implementation: an
 *  area-weighted MEAN and a total that survives resampling are two different arithmetics, and a file
 *  that computed one from the other would be wrong at every pixel of whichever it did not write.
 *  ⚠ The areal weights are ground area, with the same closed form as `rowAreaKm2` — and because a
 *  row's latitude is not always the row's coordinate (js/gis-warp.js reads every source through a
 *  pixel-space proxy), a grid may declare what its rows stand for: see `latGround`.
 *  ⚠⚠⚠ (#R819) AND THE FOOTPRINT ITSELF HAS TWO FORMS, `box` AND `ring` (`sampleCellForms()`). A box
 *  is four numbers and is exactly the footprint when the transform above it is an affine; when it is
 *  not — a rotation, a projection — the box that HOLDS the true footprint is bigger than it, and an
 *  aggregate weighted by the box is weighted by ground the output pixel does not cover. The ring is
 *  the footprint as given, cut against one pixel at a time. ⚠ ONE aggregation, one void rule, one
 *  apportionment: the form decides HOW MUCH of a source pixel is covered and nothing else.
 *
 *  ══ A PIXEL BELONGS TO A ZONE WHEN ITS CENTRE IS INSIDE IT ════════════════════════════════════
 *  That is a JUDGEMENT, stated here rather than omitted. The alternative — splitting each boundary
 *  pixel by the fraction of its area inside the polygon — is a different and more expensive answer,
 *  and it is only more accurate if the pixel's value is a DENSITY that can be subdivided. For a class
 *  code (land cover, Köppen) a fractional pixel is meaningless, and for anything measured at a point
 *  the fraction is an interpolation nobody asked for. Centre-in-polygon is exact about what it claims:
 *  each pixel is counted once, by the polygon that holds its centre, with its own geodesic area. A
 *  reader who needs sub-pixel precision needs a finer grid, and can get one from `fromSampler`.
 *
 *  ⚠ AND THE INSIDE/OUTSIDE VERDICT IS NOT WRITTEN HERE. js/gis-geometry.js owns it
 *  (`pointInGeometry`: ray casting, holes by parity, operands aligned across the seam), and
 *  js/gis-ops.js already asks it rather than keeping the copy it used to have. A third copy is the
 *  drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids, so this file asks too — and answers
 *  `geometry-unavailable` when the kernel did not arrive, because 「訊けなかった」 and 「0 件だった」
 *  must not reach the reader as one answer.
 *
 *  ══ ⚠⚠⚠ A PIXEL LOOP THAT CANNOT BE STOPPED IS A FROZEN MAP (#R756) ═══════════════════════════
 *  `mask`, `diff`, `combine`, `merge` and `zonal` each walked every pixel in one uninterruptible
 *  `for`, so a caller that started a 16-million-pixel calculation could not get the thread back until
 *  it finished — and the code that would have set `signal.aborted` does not run on a held thread, so
 *  the stop button was not slow, it was UNREACHABLE ([[intmap-sync-loop-cannot-be-cancelled]]).
 *  ⇒ SO THEY TAKE A ctx, in the options argument each of them already ends with, and the walk is
 *  `paced` — ONE loop, shared by all five, whose only difference with a ctx is WHEN IT LETS GO. A
 *  call that hands over no ctx returns its answer synchronously, exactly as before and computed by
 *  the same arithmetic; a call that hands one over returns a promise of the same answer, or of
 *  `cancelled(done,total)`. ⚠ The unit of the yield is ELAPSED TIME (`frameMs()`), never a count of
 *  rows or pixels: docs/GIS-CORE.md §2.6, and one row is a different duration on every grid.
 *  ⚠ `sample` DELIBERATELY TAKES NO ctx. It answers about ONE position; the walk that calls it
 *  millions of times is the caller's (js/gis-warp.js), and that is where the ctx belongs — making
 *  `sample` awaitable would make every warp await once per output pixel per band for no cancellation
 *  the warp's own ctx does not already provide.
 *
 *  ══ ⚠⚠⚠ AND ONE OF THOSE WALKS NOW RUNS ON THE OTHER THREAD (#R759) ══════════════════════════
 *  js/gis-worker.js was written in #R752 and, measured before this round, had NO CALLER: `run()`,
 *  `register()` and `probe()` appear nowhere in js/ or tests/, and its one registered job was run by
 *  nobody. 「Worker が実装されている」 was true; 「普段の分析が Worker で走る」 was not.
 *  ⇒ `diff` takes a worker as an option (`opts.worker`, INJECTED — see `workerDoor`) and runs its
 *  pixels there when it is given one. The arithmetic is not copied across the two paths: the job
 *  function is registered into the worker AND called on this thread, and the per-pixel rule is
 *  reached through a door in it so `paced` keeps owning the main-thread loop. A worker that is
 *  absent, blocked, dead or answering the wrong shape finishes HERE, with the reason written into
 *  the result (`worker.used === false`) — but a CANCELLED run is not re-run, because 「読者が止めた」
 *  is not 「別スレッドが壊れた」.
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES — `{ ok:false, why, detail }`, and the nine languages live at
 *  the call site (docs/GIS-CORE.md §2.2). ⚠ AND THEY ARE REAL REFUSALS: two grids that do not share a
 *  grid are not resampled to be subtractable (`grid-mismatch`), and non-integer values are not
 *  rounded into classes (`values-not-integer`). Producing a plausible number from inputs that do not
 *  support it is the ハリボテ CONSTITUTION.md forbids.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) — an unexported top-level declaration in js/
 *  would be a global before the bundle, and this file may not reintroduce one.
 * ==========================================================================*/

export function makeGisRaster() {
  return (function () {

    /* ── what is borrowed, read at call time ──────────────────────────────────────────────────── */

    function geodesy() { try { return (typeof window !== 'undefined' && window.IntMapGeodesy) || null; } catch (_) { return null; } }
    function geometryKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisGeometry) || null; } catch (_) { return null; } }
    function unitKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisUnits) || null; } catch (_) { return null; } }

    /* ⚠⚠⚠ (#R774) TWO GRIDS THAT DO NOT MEASURE THE SAME QUANTITY ARE NOT SUBTRACTED, AND THE
       LABEL WAS NEVER THE PROBLEM. `diffResult` and `merge` each kept the unit when the two
       spellings matched and wrote null when they did not — and then did the arithmetic on the raw
       numbers either way. MEASURED 2026-09-17 on the shipped build: 1000 m − 1 km → 999, and
       10 °C − 283.15 K → −273.15, both `ok:true`. Both differences are zero. Dropping the unit off
       a wrong number removes the evidence, not the error ([[intmap-a-fix-that-removes-the-evidence]]).

       ⇒ THE RULE IS ASKED OF js/gis-units.js AND LIVES NOWHERE ELSE, because it belongs to the FACT
       (two quantities are being combined arithmetically) rather than to `diff`, and a copy inside
       `merge` is how the two would come to disagree (.agents/rules/no-ad-hoc-hardcoding.md §2-3).
         · both silent, or the same spelling → untouched, byte for byte as before. ⚠ SILENCE IS NOT
           A MISMATCH: most grids in this app state no unit at all, and refusing them would be
           refusing data over a claim nobody made.
         · convertible → B IS CONVERTED INTO A'S UNIT and the answer is in A's unit. The reading is
           absolute (10 °C really is 283.15 K); a DIFFERENCE of two readings is handed back in that
           same unit, which is what both callers already did when the spellings matched.
         · different quantities, or a spelling this app cannot read → `unit-mismatch`, named, with
           both spellings in the detail.
       ⚠ THE CONVERTED COPY DECLARES NO SENTINEL. B's nodata is a number a producer wrote into a
       header; multiplied by a conversion factor it is no longer that number, so the copy writes NaN
       where B was missing and states `nodata:null` — `missing()` reads NaN as missing whatever the
       band declares, so not one cell changes its verdict.
       ⚠ WITH NO js/gis-units.js PUBLISHED nothing is refused and nothing is converted: this kernel
       boots with no window at all (tests/r735), and a build without the unit module is one that
       cannot answer the question rather than one where the answer is 「合っている」. */
    function commensurate(A, B) {
      const U = unitKernel();
      if (!U || typeof U.compare !== 'function') return { ok: true, B: B };
      const c = U.compare(A.band.unit, B.band.unit);
      if (c.verdict === 'unstated' || c.verdict === 'identical') return { ok: true, B: B };
      if (c.verdict !== 'convertible') {
        return { ok: false, refusal: refuse('unit-mismatch', { a: c.a, b: c.b, verdict: c.verdict }) };
      }
      const n = B.values.length;
      let out;
      try { out = new Float64Array(n); } catch (e) { return { ok: false, refusal: refuse('raster-too-large', { cells: n }) }; }
      for (let i = 0; i < n; i++) {
        const v = B.values[i];
        if (missing(v, B.nodata)) { out[i] = NaN; continue; }
        const k = U.convert(v, c.b, c.a);
        out[i] = (typeof k === 'number' && isFinite(k)) ? k : NaN;
      }
      return {
        ok: true, converted: { from: c.b, to: c.a },
        B: { ok: true, index: B.index, band: { name: B.band.name, unit: c.a, nodata: null }, values: out, nodata: null },
      };
    }

    /* The ONE radius this app has. js/gis-ops.js says why inventing 6371 here would be wrong: it
       would be a second copy of a number the app already decides in one place. */
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }

    const D2R = Math.PI / 180;

    /* Two grids are THE SAME grid when their origins and pixel sizes agree to within a millionth of
       a pixel. Derivation: float64 carries ~15–16 significant decimal digits, so a corner coordinate
       that has been through a decimal header (GeoTIFF tags, an ASCII-grid `xllcorner`, a JSON bounds)
       differs from its twin by ~1e-12 relative at worst — a millionth of a pixel is orders of
       magnitude above that noise and orders of magnitude below any offset that could move a sample
       into a different pixel. Expires if a reader ever hands over two grids genuinely offset by less
       than 1e-6 pixel, at which point they are the same grid and the answer is still right. */
    const GRID_EPS_FRAC = 1e-6;

    /* How long a run may hold the single thread before it lets go. Observation: the renderer draws at
       60 Hz, so one frame is 16.7 ms and anything longer is a frame the map did not draw and a moment
       the stop button could not be read (docs/GIS-CORE.md §2.6 measured that as a frozen map on a
       40,000-polygon aggregate). Expires if the app ever runs its heavy reads off this thread, at
       which point the yield has nothing to yield to. ⚠ The canon for this fact is this line; the copy
       in js/gis-ops.js predates it and is the one to remove when that file is next opened — this file
       publishes `frameMs()` so no third one has to be written. */
    const FRAME_MS = 16;
    function nowMs() { try { if (typeof performance !== 'undefined' && performance && performance.now) return performance.now(); } catch (_) { } return Date.now(); }

    /* How often a pixel walk ASKS THE PACER whether to let go — NOT how much work a slice contains.
       ⚠ THAT DISTINCTION IS THE WHOLE POINT: how long a slice runs is decided by elapsed time and by
       nothing else, and the clock that decides it is the ctx's (js/gis-ops.js `makeCtx`, FRAME_MS
       above), read in ONE place. This number only stops the walk from paying for the question.
       Observation: asking is an `await` of an async function even when the answer is 「continue」 —
       one microtask, tens of nanoseconds — and a pixel step here is a handful of arithmetic
       operations, so asking at every pixel would roughly double the cost of `mask`; at one ask per
       256 it is under half a percent, and 256 pixels of arithmetic are far under one frame, so the
       pacer's own budget is still honoured to within the cost of 256 steps. Expires if a step ever
       becomes expensive enough for 256 of them to exceed a frame — a step that itself awaits
       (`fromSamplerAsync`) already does, which is why that loop asks at every pixel instead.
       ⚠ Canon: this line. `polygonize` below had the same number written as a bare `& 255` and now
       reads it here, so the two cannot drift. */
    const CLOCK_EVERY = 256;
    const CLOCK_MASK = CLOCK_EVERY - 1;

    /* ── pacing: ONE loop over pixels, for every whole-grid walk in this file ──────────────────── */

    /* docs/GIS-CORE.md §2.6's ctx, taken rather than rebuilt: `{ tick(units,total)→Promise<boolean>,
       done()→number }` as js/gis-ops.js `makeCtx` builds it. A caller that handed none gets `null`,
       and the walk below then runs straight through — stated, not simulated with a fake that claims
       to be interruptible. ⚠ Read from the LAST argument of every op, so 「どこに ctx を書くか」 is
       one answer for the whole file. */
    function useCtx(opts) {
      const c = opts && opts.ctx;
      return (c && typeof c.tick === 'function') ? c : null;
    }

    /* ⚠⚠⚠ THE ONE SHAPE OF A CANCELLATION IN THIS LAYER, BUILT IN ONE PLACE. js/gis-panel.js reads
       `detail.done` / `detail.total` (it has since #R749) and js/gis-ops.js hands the pair back at the
       top level; a walk that wrote only one of the two would be invisible to one of its two readers —
       the [[intmap-two-readers-one-field-list]] shape, in a refusal. So both are written here, once,
       from the same two numbers, and js/gis-warp.js calls THIS rather than keeping a third spelling. */
    function cancelled(done, total) {
      return { ok: false, why: 'cancelled', done: done, total: total, detail: { done: done, total: total } };
    }

    /* Run `step(i)` for i = 0 … total−1, then `finish()`.
       ⚠ THERE IS ONE LOOP OVER THE PIXELS (`slice`), AND `ctx` CHANGES WHEN IT LETS GO OF THE THREAD,
       NOT WHAT IT DOES. The alternative — a synchronous walk beside an interruptible one — is two
       implementations of one contract, and the way they fail is that one of them quietly stops
       matching the other ([[intmap-contract-is-not-implementation]]); here the arithmetic is written
       once and executed by both paths, so a ctx cannot change a single output pixel.
       ⚠ WITHOUT A CTX THE ANSWER IS RETURNED, NOT A PROMISE OF IT. Every synchronous caller this file
       already has (js/gis-warp.js samples inside its own loop, js/gis-datasets.js describes a grid)
       keeps working unchanged, and only a caller that HANDS ONE OVER opts into awaiting.
       ⚠ `step` RETURNING ANYTHING STOPS THE WALK AND THAT VALUE IS THE ANSWER — which is how a refusal
       discovered mid-walk (`geodesy-missing`, `values-not-integer`) still reaches the caller by name
       instead of being swallowed into a half-built grid.
       ⚠⚠⚠ HOW LONG A SLICE RUNS IS NOT DECIDED HERE. It is decided by `ctx.tick`, which yields when a
       frame has elapsed and returns at once when one has not — docs/GIS-CORE.md §2.6's 「刻みの単位は
       件数ではなく時間」, in the one place that owns it. This walk only chooses HOW OFTEN TO ASK
       (CLOCK_EVERY, and see its note for why asking is not free), exactly as `polygonize` below has
       always done. A second clock here would be a second gate on one budget, and the two would drift
       apart in a way neither file could show its reader. */
    function paced(total, step, ctx, finish) {
      let i = 0, stop;
      /* THE loop. `chunk` is Infinity for a run nobody can interrupt, so the pause can never be taken
         and the first pass is the only pass — the arithmetic below it is the same either way. */
      const run = (chunk) => {
        const end = (chunk >= total - i) ? total : (i + chunk);
        while (i < end) {
          stop = step(i);
          i++;
          if (stop !== undefined) return;
        }
      };
      if (!ctx) { run(total); return stop !== undefined ? stop : finish(); }
      return (async () => {
        let reported = 0;
        for (;;) {
          run(CLOCK_EVERY);
          /* ⚠ A REFUSAL DISCOVERED IN THE WALK BEATS A CANCELLATION ARRIVING IN THE SAME BREATH:
             「この帯は読めない」 is why the run ended, and reporting 「中止しました」 instead would
             send the reader to look at their own stop button. */
          if (stop !== undefined) return stop;
          const units = i - reported;
          reported = i;
          /* ⚠ THE PACER IS ASKED EVEN ON THE LAST PASS, so `ctx.done()` ends equal to `total` and a
             caller's progress line reaches 100% instead of stopping one pass short. */
          if (!(await ctx.tick(units, total))) return cancelled(i, total);
          if (i >= total) return finish();
        }
      })();
    }

    /* ── validity: measured, not assumed ──────────────────────────────────────────────────────── */

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function isInt(v) { return isNum(v) && Math.floor(v) === v; }

    /* A raster is valid when the contract at the top of this file holds. It is checked once at every
       entrance rather than trusted, because the producers are several (js/gis-datasets.js, a decoder,
       `fromSampler`, `mask`, `diff`) and a grid with `pixelLat` of 0 does not fail — it silently puts
       every row at the same latitude. */
    function validate(raster) {
      if (!raster || typeof raster !== 'object') return refuse('raster-invalid', { field: 'raster' });
      if (!isInt(raster.width) || raster.width <= 0) return refuse('raster-invalid', { field: 'width', value: raster.width });
      if (!isInt(raster.height) || raster.height <= 0) return refuse('raster-invalid', { field: 'height', value: raster.height });
      if (!Array.isArray(raster.bands) || !raster.bands.length) return refuse('raster-invalid', { field: 'bands' });
      const g = raster.grid;
      if (!g || typeof g !== 'object') return refuse('raster-invalid', { field: 'grid' });
      for (const k of ['west', 'north', 'pixelLng', 'pixelLat']) {
        if (!isNum(g[k])) return refuse('raster-invalid', { field: 'grid.' + k, value: g[k] });
      }
      /* Both strictly positive: the contract fixes west→east and north→south, so a negative pixel
         size is a grid that states its rows in the other order and means something else entirely. */
      if (g.pixelLng <= 0) return refuse('raster-invalid', { field: 'grid.pixelLng', value: g.pixelLng });
      if (g.pixelLat <= 0) return refuse('raster-invalid', { field: 'grid.pixelLat', value: g.pixelLat });
      /* ⚠ `grid.latAxis` is OPTIONAL (absent = the contract's degrees) and is checked in O(1). This
         function runs once per `sample` call, and a warp calls `sample` once per output pixel per
         band — so walking the height+1 edges here would be a walk of the whole axis per pixel. The
         entries themselves are read where they are used, and a non-numeric one is refused there with
         the row that carried it. */
      if (g.latAxis !== undefined && g.latAxis !== null) {
        const ax = g.latAxis;
        const axOk = (ax === 'equal')
          || (!!ax && typeof ax === 'object' && !!ax.edges && typeof ax.edges.length === 'number' && ax.edges.length === raster.height + 1);
        if (!axOk) return refuse('raster-invalid', { field: 'grid.latAxis', value: (typeof ax === 'string' ? ax : null) });
      }
      if (typeof raster.read !== 'function') return refuse('raster-invalid', { field: 'read' });
      return { ok: true };
    }

    function refuse(why, detail) { return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail }; }

    function band(raster, bandIndex) {
      const i = (bandIndex == null) ? 0 : bandIndex;
      if (!isInt(i) || i < 0 || i >= raster.bands.length) return refuse('band-out-of-range', { bandIndex: bandIndex, bands: raster.bands.length });
      const b = raster.bands[i] || {};
      return { ok: true, index: i, band: b };
    }

    /* The band's values, ONCE. read() may decode, so nothing below calls it twice, and its length is
       measured against width·height — a short buffer would otherwise read as a grid full of
       `undefined` in its last rows, which is missing data that nobody declared. */
    function values(raster, bandIndex) {
      const b = band(raster, bandIndex);
      if (!b.ok) return b;
      let arr;
      try { arr = raster.read(b.index); } catch (e) { return refuse('read-failed', { bandIndex: b.index, error: String(e && e.message || e) }); }
      const need = raster.width * raster.height;
      if (!arr || typeof arr.length !== 'number') return refuse('read-not-array', { bandIndex: b.index });
      if (arr.length !== need) return refuse('read-length-mismatch', { bandIndex: b.index, got: arr.length, want: need });
      return { ok: true, index: b.index, band: b.band, values: arr, nodata: isNum(b.band.nodata) ? b.band.nodata : null };
    }

    /* ⚠ NaN and ±Infinity are missing whatever the band declares — the declaration is about a
       SENTINEL the producer wrote, not about the set of unusable readings. The sentinel itself is
       compared EXACTLY (`-9999`, `-32768`): it is a number a producer wrote into a header, not a
       measurement to be matched with a tolerance, and a tolerance would swallow real values next
       to it.
       ⚠ PUBLISHED (#R749): js/map-ui.js asks this once per pixel while burning a grid onto a canvas,
       and a second spelling of 「このセルは欠損か」 there is how the map and the panel would come to
       disagree about the same cell. */
    function missing(v, nodata) {
      if (typeof v !== 'number' || !isFinite(v)) return true;
      return (nodata != null && v === nodata);
    }

    /* ⚠⚠⚠ 「この格子は分類か」 IS ONE JUDGEMENT AND IT LIVES HERE (#R752). `zonal`'s `classes` has
       refused a measured grid since #R735 — a grid of 0.37 and 1.84 is not a classification with
       classes 0 and 2 — and `polygonize` asks EXACTLY the same question for exactly the same reason:
       the connected regions of a continuous field are an artefact of float equality, and 「等しい値の
       領域」 over measurements would draw one polygon per pixel and call it a map. A second spelling
       of the test is the drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids, so both callers
       call this and both refuse with the pixel that proved it. */
    function classValue(v, row, col) {
      if (!isInt(v)) return refuse('values-not-integer', { row: row, col: col, value: v });
      return null;
    }

    /* ── the grid as geometry ─────────────────────────────────────────────────────────────────── */

    function bboxOf(raster) {
      const v = validate(raster);
      if (!v.ok) return null;
      const g = raster.grid;
      const east = g.west + g.pixelLng * raster.width;
      const south = g.north - g.pixelLat * raster.height;
      return [g.west, south, east, g.north];
    }
    /* ⚠ bboxOf returns the array (or null), NOT an { ok } envelope, because js/gis-ops.js's bboxOf
       for a geometry has exactly that shape and a caller composing the two must not have to unwrap
       two different answers to the same question. Every entry point that returns a MEASUREMENT or a
       RESULT uses the envelope. */

    function rowNorth(raster, row) { return raster.grid.north - raster.grid.pixelLat * row; }
    function rowCentreLat(raster, row) { return raster.grid.north - raster.grid.pixelLat * (row + 0.5); }
    function colCentreLng(raster, col) { return raster.grid.west + raster.grid.pixelLng * (col + 0.5); }

    /* The EXACT area of a spherical lat/lng cell: A = R²·Δλ·(sin φ_n − sin φ_s). Not an
       approximation of an integral — it is the closed form of ∫∫ R² cos φ dφ dλ over the cell, and it
       is the same sphere js/gis-ops.js measures polygons on (Chamberlain–Duquette on the same R), so
       a zone's `areaKm2` here and its polygon's areaKm2 there are comparable numbers.
       ⚠ φ IS CLAMPED TO ±90°. That is not a repair of a bad grid — it is the answer: a row declared
       to reach 91°N overlaps the sphere only up to the pole, and the area of the part beyond it is
       zero because there is no such ground. A row entirely beyond the pole therefore measures 0. */
    function rowAreaKm2(raster, row) {
      const R = earthKm();
      if (R == null) return null;
      const n = Math.max(-90, Math.min(90, rowNorth(raster, row)));
      const s = Math.max(-90, Math.min(90, rowNorth(raster, row + 1)));
      const a = R * R * (raster.grid.pixelLng * D2R) * (Math.sin(n * D2R) - Math.sin(s * D2R));
      return a > 0 ? a : 0;
    }

    function pixelAreaKm2(raster, row) {
      const v = validate(raster);
      if (!v.ok) return v;
      const r = (row == null) ? 0 : row;
      if (!isInt(r) || r < 0 || r >= raster.height) return refuse('row-out-of-range', { row: row, height: raster.height });
      const km2 = rowAreaKm2(raster, r);
      if (km2 == null) return refuse('geodesy-missing');
      return { ok: true, km2: km2, row: r, north: rowNorth(raster, r), south: rowNorth(raster, r + 1) };
    }

    /* Which pixel holds a position. Floor, so the cell owns [west, west+pixelLng) — the half-open
       interval that makes every position belong to exactly one pixel. The east and south EDGES of the
       whole grid are therefore outside it by one limit; that is one line of pixels' worth of edge and
       it is the price of not double-counting every interior boundary. */
    function pixelAt(raster, lng, lat) {
      const g = raster.grid;
      const col = Math.floor((lng - g.west) / g.pixelLng);
      const row = Math.floor((g.north - lat) / g.pixelLat);
      if (!(col >= 0 && col < raster.width && row >= 0 && row < raster.height)) return null;
      return { row: row, col: col };
    }

    /* ── sampling ─────────────────────────────────────────────────────────────────────────────── */

    /* ⚠⚠⚠ A METHOD IS EITHER A QUESTION ABOUT A POINT OR A QUESTION ABOUT AN AREA, AND THE TWO ARE
       NOT VARIANTS OF ONE THING. `nearest`/`bilinear`/`cubic` ask what the field is worth AT one
       position — the centre of the output pixel — and the size of that pixel does not enter the
       arithmetic at all. `average`/`mode`/`sum` ask about the SET of input pixels that output pixel
       COVERS, so the caller has to say how big it is (`opts.cell`), and the same position with a
       10 km footprint and with a 10 m one has two different right answers.
       That difference is what makes downsampling honest: a 30 m land cover taken onto a 1 km grid
       with `nearest` reports whatever happened to lie under one point and discards 99.9% of the
       observations, `mode` reports the class that actually covers the ground, and `sum` keeps the
       total a count quantity (人口・件数) has to keep.
       ⚠ IT IS DECLARED AS DATA (`kind`) rather than left to each reader's memory of which names are
       which. A UI has to ask for a footprint for some of these and not for others, and an op has to
       know whether a point has an answer at all — 「average のときだけ違う経路」 written by hand at
       each call site is the drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. The ids
       themselves are the keys of this table, so `sampleMethods()` cannot fall behind it. */
    const SAMPLE_METHOD_FACTS = {
      nearest: { kind: 'point', neighbours: 1 },
      bilinear: { kind: 'point', neighbours: 4 },
      /* Keys' cubic convolution over a 4×4 neighbourhood — see `tapWeights` for which kernel and why
         its outer weights are negative. */
      cubic: { kind: 'point', neighbours: 16 },
      average: { kind: 'areal', aggregate: 'area-weighted-mean' },
      mode: { kind: 'areal', aggregate: 'largest-area-value' },
      sum: { kind: 'areal', aggregate: 'area-apportioned-total' },
    };
    const SAMPLE_METHODS = Object.keys(SAMPLE_METHOD_FACTS);

    /* ⚠⚠⚠ (#R819) A FOOTPRINT HAS TWO FORMS, AND THE SECOND ONE EXISTS BECAUSE THE FIRST IS AN
       APPROXIMATION THAT NOBODY COULD SEE. `box` is what every caller has handed over since this
       method existed: four numbers, an axis-aligned rectangle. js/gis-warp.js builds it by taking an
       output pixel's four corners back through a projection and keeping the box that HOLDS them —
       which errs outward, which is the only direction a footprint may err for a PREFILTER, and which
       is NOT the same thing as the area the aggregate should be weighted by. A rotated or curved
       footprint's box includes ground the output pixel does not cover, and an `average` weighted by
       that box is an average over ground nobody asked about.
       ⚠ So the second form is the footprint ITSELF — a ring of positions in this grid's own
       coordinates, implicitly closed. It is not a repair of the first: the box is still what a
       caller should hand over when the transform is an affine (there the box IS the footprint and
       the arithmetic is cheaper by an order), and both forms go through the SAME aggregation, the
       SAME void rule, the SAME ground weighting and the SAME apportionment for `sum`. What changes
       is how much of a source pixel a footprint is said to cover.
       ⚠ IT IS DECLARED AS DATA for the reason `kind` is: a caller that wants to know whether this
       build can take a polygon footprint reads `sampleCellForms()` rather than testing the version
       of the file it happens to be loaded beside. */
    const SAMPLE_CELL_FORMS = {
      box: {
        shape: 'rectangle', members: 4,
        /* what it is: [west, south, east, north] in this grid's coordinates */
        errs: 'outward-when-the-true-footprint-is-not-a-rectangle',
      },
      ring: {
        shape: 'polygon', members: null,
        /* positions [[x, y], …], implicitly closed, in this grid's coordinates. Self-intersecting
           rings are not detected — the shoelace of one is not an area and this file does not police
           the caller's geometry — so the ring a caller builds is the ring it is weighted by. */
        errs: 'none-beyond-the-ring-it-was-given',
      },
    };
    const SAMPLE_CELL_FORM_IDS = Object.keys(SAMPLE_CELL_FORMS);

    /* Which of the two forms arrived, checked once per call. ⚠ A RING OF FEWER THAN THREE POSITIONS
       HAS NO AREA and a ring whose bounding box is degenerate covers nothing — both are refused by
       the same code the malformed box is, because from here they are one fact: 「その footprint では
       面積を測れない」. */
    function readCell(c, method) {
      if (Array.isArray(c)) {
        if (c.length !== 4 || !c.every(isNum) || !(c[2] > c[0]) || !(c[3] > c[1])) {
          return refuse('sample-cell-invalid', { method: method, form: 'box', cell: c.slice() });
        }
        return { ok: true, cell: { form: 'box', box: c } };
      }
      if (c && typeof c === 'object' && Array.isArray(c.ring)) {
        const ring = c.ring;
        if (ring.length < 3) return refuse('sample-cell-invalid', { method: method, form: 'ring', positions: ring.length });
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          if (!Array.isArray(p) || p.length < 2 || !isNum(p[0]) || !isNum(p[1])) {
            return refuse('sample-cell-invalid', { method: method, form: 'ring', at: i });
          }
          if (p[0] < w) w = p[0];
          if (p[0] > e) e = p[0];
          if (p[1] < s) s = p[1];
          if (p[1] > n) n = p[1];
        }
        if (!(e > w) || !(n > s)) return refuse('sample-cell-invalid', { method: method, form: 'ring', bbox: [w, s, e, n] });
        return { ok: true, cell: { form: 'ring', ring: ring, box: [w, s, e, n] } };
      }
      return refuse('sample-cell-invalid', { method: method, forms: SAMPLE_CELL_FORM_IDS.slice(), cell: (typeof c === 'object') ? null : c });
    }

    function sample(raster, bandIndex, lng, lat, opts) {
      const v = validate(raster);
      if (!v.ok) return v;
      if (!isNum(lng) || !isNum(lat)) return refuse('position-invalid', { lng: lng, lat: lat });
      const method = (opts && opts.method) ? String(opts.method) : 'nearest';
      const facts = SAMPLE_METHOD_FACTS[method];
      if (!facts) return refuse('sample-method-unknown', { method: method, methods: SAMPLE_METHODS.slice() });
      let cell = null;
      if (facts.kind === 'areal') {
        /* ⚠ NO FOOTPRINT IS INVENTED. An areal method with a made-up cell size would answer a
           question nobody asked — 「この地点の周り 1 画素ぶんの平均」 is not 「この出力画素の平均」 —
           and the reader would have no way to see which of the two they were given. The refusal
           carries the kind, so a caller that reached here with a point-shaped call knows what is
           missing rather than only that something was. */
        const c = opts && opts.cell;
        if (c == null) return refuse('sample-cell-not-stated', { method: method, kind: facts.kind, forms: SAMPLE_CELL_FORM_IDS.slice() });
        const cv = readCell(c, method);
        if (!cv.ok) return cv;
        cell = cv.cell;
      }
      const V = values(raster, bandIndex);
      if (!V.ok) return V;
      return sampleWith(raster, V, lng, lat, method, cell);
    }

    /* The separable interpolation kernels AS WEIGHTS over consecutive columns (and rows), so bilinear
       and cubic are one walk and not two implementations of the void rule. */
    const TAP_OFFSETS = { bilinear: [0, 1], cubic: [-1, 0, 1, 2] };

    function tapWeights(method, t) {
      if (method === 'bilinear') return [1 - t, t];
      /* Keys (1981) cubic convolution with a = −0.5 — the value that makes the kernel agree with the
         Taylor series of the sampled function to third order, and the one GDAL, OpenCV and
         ImageMagick all use, so 「cubic」 here means what it means everywhere else rather than being
         this app's private curve.
         ⚠ ITS OUTER WEIGHTS ARE NEGATIVE, so a cubic sample can land OUTSIDE the range of the 16
         values it was taken from (the overshoot at a step). That is the method and not a defect —
         it is why `preservesValues` is false for it in js/gis-warp.js's table, and a reader who must
         stay inside the observed range asks for bilinear. Clamping here would hide the overshoot
         while keeping the ringing that produced it. */
      const a = -0.5;
      const w = [];
      for (const d of TAP_OFFSETS.cubic) {
        const x = Math.abs(t - d);
        w.push(x <= 1
          ? ((a + 2) * x * x * x - (a + 3) * x * x + 1)
          : (x < 2 ? (a * x * x * x - 5 * a * x * x + 8 * a * x - 4 * a) : 0));
      }
      return w;
    }

    /* Split from sample() so a caller taking thousands of samples (the zonal walk, `fromSampler`'s
       own consumers) pays for validate() and read() once. */
    function sampleWith(raster, V, lng, lat, method, cell) {
      const at = pixelAt(raster, lng, lat);
      if (!at) return refuse('outside', { lng: lng, lat: lat, bbox: bboxOf(raster) });
      const nearestValue = V.values[at.row * raster.width + at.col];
      const nearest = () => missing(nearestValue, V.nodata)
        ? { ok: true, value: null, nodata: true, row: at.row, col: at.col, method: 'nearest' }
        : { ok: true, value: nearestValue, row: at.row, col: at.col, method: 'nearest' };
      if (method === 'nearest') return nearest();
      const facts = SAMPLE_METHOD_FACTS[method];
      if (facts && facts.kind === 'areal') return arealWith(raster, V, at, cell, method);

      /* Interpolation between the PIXEL CENTRES surrounding the position. The fractional index is
         offset by 0.5 because the value belongs to the centre of its cell, not to its corner — the
         same −0.5 js/map-readout.js's DEM sampler applies for the same reason. */
      const g = raster.grid;
      const fx = (lng - g.west) / g.pixelLng - 0.5;
      const fy = (g.north - lat) / g.pixelLat - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      /* Indices clamped to the grid, which makes the blend degenerate to the edge pixel's value at
         the outer half-pixel border. That is an edge EXTENSION of published data, not an invented
         value: outside the last centre there is no second sample to interpolate towards, and the
         only alternatives are to refuse a position that is inside the grid or to extrapolate. */
      const cx = (x) => Math.max(0, Math.min(raster.width - 1, x));
      const cy = (y) => Math.max(0, Math.min(raster.height - 1, y));
      const offs = TAP_OFFSETS[method];
      const wx = tapWeights(method, tx), wy = tapWeights(method, ty);
      let acc = 0;
      for (let j = 0; j < offs.length; j++) {
        const row = cy(y0 + offs[j]);
        const base = row * raster.width;
        for (let i = 0; i < offs.length; i++) {
          const val = V.values[base + cx(x0 + offs[i])];
          /* ⚠⚠⚠ ONE VOID AMONG THE MEASUREMENTS IS THE Lake-Biwa −7,800 m BUG (see the header). The
             blend is abandoned, not patched with a substitute, and the fallback declares itself.
             ⚠ The same rule, ONE implementation, for every point kernel: cubic reads a wider
             neighbourhood and therefore meets voids MORE often, which is a reason to keep the rule
             in one place rather than a reason to soften it for the wider one. */
          if (missing(val, V.nodata)) {
            const near = nearest();
            near.partial = true;
            near.requested = method;
            return near;
          }
          acc += val * wx[i] * wy[j];
        }
      }
      return { ok: true, value: acc, row: at.row, col: at.col, method: method };
    }

    /* ── areal aggregation: what an output pixel COVERS ───────────────────────────────────────── */

    /* ⚠⚠⚠ THE WEIGHT IS GROUND AREA, NOT PIXEL COUNT. It is the same fact the header states for
       `mean` and `zonal` measures with `rowAreaKm2` — a 1°×1° cell is 12,363 km² at the equator and
       6,183 km² at 60°N — applied to a footprint instead of a polygon, with the same closed form
       (area ∝ Δλ·(sin φ_n − sin φ_s)). R² and the degree→radian factor are NOT applied because every
       answer below is a RATIO of weights and they cancel exactly; `zonal` needs the km² itself and
       keeps them.
       ⚠ AND A ROW'S LATITUDE IS NOT ALWAYS THE ROW'S COORDINATE. js/gis-warp.js reads every source
       through a PIXEL-SPACE proxy whose 「lat」 is a negated row index, and a projected grid has no
       latitude in its own coordinates at all — so a grid may DECLARE what its rows stand for, and
       the three forms are the three real cases:
         · `grid.latAxis` absent   — this grid's own coordinates ARE degrees (the contract at the top
                                     of this file), which is every grid that existed before this
         · `grid.latAxis:'equal'`  — the rows have no latitude, and equal coordinate height is equal
                                     ground
         · `{ edges:[…height+1] }` — the degree latitude of each row EDGE, measured by whoever built
                                     the grid (js/gis-warp.js transforms them through the projection)
       Guessing instead — 「行の座標は度だろう」 — is how the proxy's row −200 would be clamped to the
       pole and weighted zero, which is a wrong answer that looks like an empty one. */
    function clampLat(v) { return v < -90 ? -90 : (v > 90 ? 90 : v); }

    /* A quantity PROPORTIONAL to the ground height of [topCoord, botCoord] within row `row`. Returns
       null when the grid's own declaration cannot answer for this row — 「訊けなかった」 is not
       「面積が 0 だった」, and the caller turns it into a refusal rather than a weight. */
    function latGround(raster, row, topCoord, botCoord) {
      const g = raster.grid;
      const ax = g.latAxis;
      if (ax === 'equal') return topCoord - botCoord;
      let phiN, phiS;
      if (ax && typeof ax === 'object') {
        const eN = ax.edges[row], eS = ax.edges[row + 1];
        if (!isNum(eN) || !isNum(eS)) return null;
        /* Where inside the row the overlap sits, in the row's own coordinates, carried onto the
           declared latitudes linearly — the row is one pixel tall and no projection curves
           measurably across one pixel. */
        const rTop = rowNorth(raster, row);
        const f0 = (rTop - topCoord) / g.pixelLat, f1 = (rTop - botCoord) / g.pixelLat;
        phiN = eN + (eS - eN) * f0;
        phiS = eN + (eS - eN) * f1;
      } else { phiN = topCoord; phiS = botCoord; }
      const d = Math.sin(clampLat(phiN) * D2R) - Math.sin(clampLat(phiS) * D2R);
      return d > 0 ? d : 0;
    }

    /* ── (#R819) a footprint that is a polygon, cut against one pixel at a time ────────────────
       Sutherland–Hodgman against ONE axis-aligned half-plane, which is all the clipping a grid
       needs: a pixel is the intersection of four of them, and a row band of two. ⚠ The vertex on
       the cut is written with the limit ITSELF rather than with the interpolated coordinate, so two
       pixels sharing an edge see the same number there and a footprint that spans them is neither
       counted twice nor lost in a rounding. `a[axis] === b[axis]` cannot reach the interpolation —
       two equal coordinates are on the same side of the cut — so there is no division by zero. */
    function clipAxis(poly, axis, limit, keepGreater) {
      const out = [];
      const n = poly.length;
      if (!n) return out;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const ia = keepGreater ? (a[axis] >= limit) : (a[axis] <= limit);
        const ib = keepGreater ? (b[axis] >= limit) : (b[axis] <= limit);
        if (ia) out.push(a);
        if (ia !== ib) {
          const t = (limit - a[axis]) / (b[axis] - a[axis]);
          const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          p[axis] = limit;
          out.push(p);
        }
      }
      return out;
    }

    /* The shoelace, unsigned — a footprint's winding is the caller's business and its AREA is not. */
    function ringArea(poly) {
      const n = poly.length;
      if (n < 3) return 0;
      let s = 0;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s) / 2;
    }

    function arealWith(raster, V, at, cell, method) {
      const g = raster.grid;
      const ring = (cell && cell.form === 'ring') ? cell.ring : null;
      const box = (cell && cell.box) ? cell.box : cell;
      const fW = box[0], fS = box[1], fE = box[2], fN = box[3];
      /* Every pixel the footprint touches, clipped to the grid. ⚠ The part of a footprint that hangs
         off the grid is not counted as a void: it is not this grid's to answer, and `coverage` below
         is measured over the part that IS on it — the caller already learns about the other part
         from `outside` on the centre. */
      let c0 = Math.max(0, Math.floor((fW - g.west) / g.pixelLng));
      let c1 = Math.min(raster.width - 1, Math.ceil((fE - g.west) / g.pixelLng) - 1);
      let r0 = Math.max(0, Math.floor((g.north - fN) / g.pixelLat));
      let r1 = Math.min(raster.height - 1, Math.ceil((g.north - fS) / g.pixelLat) - 1);
      const out = { ok: true, row: at.row, col: at.col, method: method, pixels: 0, missingPixels: 0, coverage: 0 };
      if (c1 < c0 || r1 < r0) { out.value = null; out.nodata = true; return out; }

      let wsum = 0, vsum = 0, voidW = 0, used = 0, voids = 0, apportioned = 0;
      const classW = (method === 'mode') ? new Map() : null;
      /* The same 「a millionth of a pixel is noise」 the column overlap uses, in the unit a ring's
         weight comes out in: a whole pixel's ground weight rather than a whole pixel's coordinates.
         It is re-derived per row because the ground of a row is not the ground of the next one. */
      let areaEps = 0;
      for (let row = r0; row <= r1; row++) {
        if (ring) {
          const rg = latGround(raster, row, rowNorth(raster, row), rowNorth(raster, row + 1));
          if (rg == null) return refuse('raster-invalid', { field: 'grid.latAxis', row: row });
          areaEps = g.pixelLng * rg * GRID_EPS_FRAC;
        }
        const rTop = rowNorth(raster, row), rBot = rowNorth(raster, row + 1);
        const top = Math.min(rTop, fN), bot = Math.max(rBot, fS);
        /* ⚠ An overlap under a millionth of a pixel is the decimal noise GRID_EPS_FRAC is derived
           from (see its comment), not a pixel the footprint reaches. Counting it would make an
           identity resample read a neighbouring column at weight 1e-16 and answer 「ほぼ同じ値」
           where the answer is the value. */
        if (!(top - bot > g.pixelLat * GRID_EPS_FRAC)) continue;
        const gh = ring ? null : latGround(raster, row, top, bot);
        if (!ring && gh == null) return refuse('raster-invalid', { field: 'grid.latAxis', row: row });
        if (!ring && !(gh > 0)) continue;
        /* For `sum`: the whole row-pixel's weight, which is what each overlap is a FRACTION of. */
        const whole = (method === 'sum') ? (g.pixelLng * latGround(raster, row, rTop, rBot)) : 0;
        /* ⚠⚠⚠ (#R819) THE RING IS WEIGHED IN THE SAME UNIT THE BOX IS, AND IT IS NOT AN AVERAGE OF
           IT. A box's ground weight is Δλ·(sin φ_n − sin φ_s) — an area in (λ, sin φ) — and that is
           exactly what an area is in that plane, so the polygon is MAPPED INTO IT and its shoelace
           is the same quantity. ⚠ NOT 「row 全体の ground を面積で按分する」, which is what a first
           draft of this did: it is the mean of a quantity that varies across the row, and it made a
           ring around exactly one box disagree with that box by 1.5e-4 — two answers to one
           question, which is the thing this file refuses to have.
           The map is monotone within a row (φ is linear in the row's coordinate and sin is monotone
           over ±90°), so the row band's cut is unaffected by it and the column cuts below are
           vertical lines in both planes. What IS approximated is that a straight edge stays straight
           under it — second order across ONE pixel row, which is the same interval latGround already
           declares a projection does not curve measurably across. */
        let rowPoly = null;
        if (ring) {
          const cut = clipAxis(clipAxis(ring, 1, rTop, false), 1, rBot, true);
          if (cut.length < 3) continue;
          rowPoly = [];
          for (let i = 0; i < cut.length; i++) {
            /* latGround measures a BAND, so the height of [coord, rBot] is the coordinate's own
               position in the plane the weights live in, taken from the same function. */
            const gy = latGround(raster, row, cut[i][1], rBot);
            if (gy == null) return refuse('raster-invalid', { field: 'grid.latAxis', row: row });
            rowPoly.push([cut[i][0], gy]);
          }
        }
        const base = row * raster.width;
        for (let col = c0; col <= c1; col++) {
          const cW = g.west + g.pixelLng * col;
          let wgt;
          if (ring) {
            const cut = clipAxis(clipAxis(rowPoly, 0, cW, true), 0, cW + g.pixelLng, false);
            /* Already the ground weight: an area in (λ, sin φ) IS Δλ·Δ(sin φ) summed over the shape,
               which is the quantity the box path computes in closed form for a rectangle. */
            wgt = (cut.length < 3) ? 0 : ringArea(cut);
            if (!(wgt > areaEps)) continue;
          } else {
            const ov = Math.min(cW + g.pixelLng, fE) - Math.max(cW, fW);
            if (!(ov > g.pixelLng * GRID_EPS_FRAC)) continue;
            wgt = ov * gh;
          }
          const val = V.values[base + col];
          /* ⚠ A VOID IS EXCLUDED FROM THE AGGREGATE, NOT READ AS 0 — the header's rule in aggregate
             form. It is counted instead, and `coverage` says how much of the footprint had an
             answer, so 「半分しか観測が無い平均」 does not reach the reader as a plain number. */
          if (missing(val, V.nodata)) { voidW += wgt; voids++; continue; }
          used++; wsum += wgt; vsum += val * wgt;
          if (method === 'sum' && whole > 0) {
            /* ⚠⚠⚠ THE TOTAL IS APPORTIONED, NOT ADDED UP. A source pixel half inside the footprint
               contributes half of its value, so the sums of a set of output pixels that tile the
               source add up to the source's own total — which is the whole reason `sum` exists for a
               count quantity, and exactly what `average` must not do. Sharing one implementation
               between the two would mean one of them is wrong at every pixel. */
            apportioned += val * (wgt / whole);
          }
          if (classW) classW.set(val, (classW.get(val) || 0) + wgt);
        }
      }
      out.pixels = used;
      out.missingPixels = voids;
      out.coverage = (wsum + voidW) > 0 ? (wsum / (wsum + voidW)) : 0;
      if (!used) { out.value = null; out.nodata = true; return out; }
      if (method === 'average') out.value = vsum / wsum;
      else if (method === 'sum') out.value = apportioned;
      else {
        /* `mode`: the value covering the most ground. ⚠ TIES GO TO THE SMALLER VALUE, stated because
           ties are REAL — two classes over exactly equal area is what a 2:1 downsample of a regular
           grid produces constantly — and an answer that fell out of Map iteration order would make
           the same warp draw two different pictures on two engines. */
        let best = null, bestW = -Infinity;
        classW.forEach((w, k) => { if (w > bestW || (w === bestW && best != null && k < best)) { best = k; bestW = w; } });
        out.value = best;
        out.classes = classW.size;
      }
      return out;
    }

    /* ── zonal statistics ─────────────────────────────────────────────────────────────────────── */

    /* The zone's bounding box from its coordinates AS WRITTEN — used for the LATITUDE range only,
       which no wrapping changes. The longitude range is a harder question and is answered below. */
    function geometryBbox(g) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      (function walk(c) {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number' && typeof c[1] === 'number') {
          if (!isFinite(c[0]) || !isFinite(c[1])) return;
          if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
          if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
          return;
        }
        for (const x of c) walk(x);
      })(g && g.coordinates);
      if (g && g.type === 'GeometryCollection') {
        for (const sub of (g.geometries || [])) {
          const b = geometryBbox(sub);
          if (!b) continue;
          if (b[0] < w) w = b[0]; if (b[2] > e) e = b[2];
          if (b[1] < s) s = b[1]; if (b[3] > n) n = b[3];
        }
      }
      return isFinite(w) && isFinite(s) ? [w, s, e, n] : null;
    }

    /* ⚠⚠⚠ THE COLUMNS A ZONE CAN REACH ARE NOT ONE RANGE, AND THE FIRST VERSION OF THIS FUNCTION WAS
       WRONG IN A WAY A TEST FOUND: a zone that states the antimeridian as a 170 → −170 jump has a raw
       bbox of −170…170, and against a grid written as 175…185 that box lies entirely WEST of every
       column — so the clamped window came out empty and the zone measured ZERO PIXELS while covering
       all of them. Refusing to narrow at all would have been correct and unusably slow.
       So the longitudes are asked of the kernel: `toMulti` UNWRAPS every ring (its SEAM_STEP fact —
       no edge in any dataset this app reads is half a world long), turning that zone into 170…190,
       which is what it is. And because a grid may be written on either side of the seam, the window is
       taken for the box SHIFTED BY EACH WHOLE TURN it could meet the grid on, so 170…190 against a
       −180…180 grid yields two ranges (the last columns and the first ones) rather than one wrong one.
       ⚠ Erring OUTWARD is the only direction a prefilter may err (js/gis-ops.js says the same of its
       box pad): overlapping ranges are merged so no pixel is visited twice, a ring that wraps the
       world (toMulti → null) narrows nothing, and the per-pixel verdict is always the kernel's
       pointInGeometry, which aligns the operands itself and is exact. */
    function columnRanges(raster, GG, geometry, rawSpan) {
      /* ⚠⚠⚠ AND THE PLANE HAS A LIMIT THAT MUST BE SPOKEN, NOT ANSWERED WITH 0 (measured: the whole
         world as a zone came back `count: 0` before this refusal existed). js/gis-geometry.js refuses
         a ring spanning 360° after unwrapping (`geometry-wraps-world` — a polar cap or a whole-world
         ring has no simple ring in ANY cylindrical plane), but a world ring WRITTEN as −180…180 does
         not reach that test: the unwrap reads its closing 360° step as the seam and pulls every vertex
         onto one meridian, leaving a zero-width polygon that contains nothing. So the width is
         measured on the RAW coordinates, where 「touches both ±180」 is exactly 「spans the world」, and
         the collapse is caught as well for anything else that degenerates in the plane. Neither is an
         empty answer: 「訊けなかった」 and 「0 件だった」 must not reach the reader as one sentence.
         ⚠ AND THE WHOLE GRID IS STILL ASKABLE — as two zones, one per hemisphere, whose sums add. The
         refusal is about the ring, not about the question. */
      if (rawSpan != null && rawSpan >= 360) return refuse('zone-wraps-world', { lngSpan: rawSpan });
      const all = [[0, raster.width - 1]];
      let multi = null;
      try { multi = GG.toMulti(geometry); } catch (_) { multi = null; }
      if (!multi || !multi.length) return refuse('zone-wraps-world', { lngSpan: rawSpan == null ? null : rawSpan });
      let lo = Infinity, hi = -Infinity;
      for (const rings of multi) for (const r of rings) for (const p of r) {
        if (!isNum(p[0])) continue;
        if (p[0] < lo) lo = p[0];
        if (p[0] > hi) hi = p[0];
      }
      if (!isFinite(lo)) return { ok: true, colRanges: all };
      if (hi === lo && rawSpan > 0) return refuse('zone-degenerate-in-plane', { lngSpan: rawSpan, unwrappedSpan: 0 });
      const g = raster.grid;
      const gridSpan = g.pixelLng * raster.width;
      /* How many whole turns could bring the box onto the grid: enough to cover both, and derived
         from the two spans rather than fixed at ±1, so a grid or a zone wider than 360° (a global
         grid written −180…540 by an unwrapping producer) is not silently cut. */
      const turns = Math.ceil((gridSpan + (hi - lo)) / 360) + 1;
      const ranges = [];
      for (let k = -turns; k <= turns; k++) {
        let c0 = Math.floor((lo + k * 360 - g.west) / g.pixelLng);
        let c1 = Math.floor((hi + k * 360 - g.west) / g.pixelLng);
        c0 = Math.max(0, c0); c1 = Math.min(raster.width - 1, c1);
        if (c1 >= c0) ranges.push([c0, c1]);
      }
      if (!ranges.length) return { ok: true, colRanges: [] };
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [ranges[0]];
      for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1];
        if (ranges[i][0] <= last[1] + 1) last[1] = Math.max(last[1], ranges[i][1]);
        else merged.push(ranges[i]);
      }
      return { ok: true, colRanges: merged };
    }

    /* ══ ⚠ (#R764) 1 画素が区域にどれだけ覆われているか ═════════════════════════════════════════
       Returns a weight in [0,1], or a refusal object. A zone of a few thousand pixels has a boundary
       of a few hundred, and only those few hundred need a boolean intersection — which is what keeps
       the expensive road off the interior. ⚠ WHAT KEEPS IT OFF IS NOT THE CORNERS (#R783).

       ⚠⚠⚠ FOUR CORNERS AND THE CENTRE INSIDE IS NOT A PROOF THAT THE PIXEL IS INSIDE, and the
       shortcut that read it as one reported every notched zone as whole. MEASURED (#R783): a 1°×1°
       pixel against a zone with a slot 0.2° wide and 0.4° deep cut in from above holds all four
       corners AND the centre inside the zone, and the weight came back 1 where the sphere says
       0.9200039 — the slot's own ground, missing from 「この区域の面積」, from the integral, from the
       land-cover areas and from the area-weighted mean. ⚠ NO NUMBER OF SAMPLE POINTS REPAIRS THIS:
       against any finite set of probes a concave zone can be given a slot that misses every one.

       ⇒ THE SHORTCUT NOW ASKS SOMETHING IT CAN PROVE: does any edge of the zone come near this pixel
       at all? If none does, the pixel meets the zone's boundary nowhere, so the whole pixel — one
       connected rectangle — lies on ONE side of that boundary, and the centre says which side. That
       is a proof rather than a sample; it costs one pass over the edges' boxes and no clipper. What
       it cannot prove goes down the intersection road, which is exact.
       ⚠ THE PIXEL WITH NO CORNER INSIDE WAS NEVER DECIDED BY THE CORNERS EITHER: a zone narrower than
       a pixel can pass straight through its middle touching no corner, so 「隅が全部外」 is not 「外」.
       With the boundary question above, the corners decide nothing at all — so they are no longer
       asked, and an interior pixel now costs ONE point-in-polygon test instead of five.
       ⚠ AND THE HOLE NEEDS NO SPECIAL CASE. A doughnut hole smaller than one pixel is invisible to any
       corner test, which is why `fractional` used to intersect whenever the zone had a hole ANYWHERE;
       a hole's ring is an edge like any other, so the pixel holding it fails the boundary question and
       is measured, while a pixel nowhere near a hole is no longer charged for its existence. */
    function pixelRing(raster, row, col) {
      const g = raster.grid;
      const w = g.west + g.pixelLng * col, e = g.west + g.pixelLng * (col + 1);
      const n = rowNorth(raster, row), s = rowNorth(raster, row + 1);
      return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
    }

    /* Every edge of the zone's boundary as a lat/lng box, in one flat array: [latLo, latHi, lngLo,
       lngHi] per edge. Computed ONCE PER ZONE and handed to the walk — not cached against the
       geometry object, because a cache would have to answer 「この多角形は書き換えられたか」 and the
       walk already has the one lifetime during which the answer cannot change.
       ⚠ THE RINGS COME FROM THE GEOMETRY KERNEL. `ringsOf` is 「多角形の境界」 as this app decides it
       (every ring of every areal part, closed, holes included) and `unwrapRing` is its seam rule; a
       second reading of GeoJSON here would be a second spelling of both
       (.agents/rules/no-ad-hoc-hardcoding.md §2-3). */
    function edgeBoxesOf(GG, geometry) {
      if (typeof GG.ringsOf !== 'function') return null;
      const rings = GG.ringsOf(geometry);
      if (!Array.isArray(rings) || !rings.length) return null;
      const out = [];
      for (const raw of rings) {
        const r = (typeof GG.unwrapRing === 'function') ? GG.unwrapRing(raw) : raw;
        for (let i = 1; i < r.length; i++) {
          const a = r[i - 1], b = r[i];
          if (!(Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(b[0]) && Number.isFinite(b[1]))) return null;
          out.push(Math.min(a[1], b[1]), Math.max(a[1], b[1]), Math.min(a[0], b[0]), Math.max(a[0], b[0]));
        }
      }
      return out.length ? Float64Array.from(out) : null;
    }

    /* Whether [lngLo,lngHi] and [w,e] can overlap AFTER ANY WHOLE NUMBER OF TURNS — exists k with
       lngLo + 360k ≤ e and lngHi + 360k ≥ w, which is floor((e−lngLo)/360) ≥ ceil((w−lngHi)/360).
       ⚠ ASKED ACROSS EVERY TURN ON PURPOSE. The geometry kernel shifts a part by whole turns before it
       clips or tests a point (js/gis-geometry.js §alignTo), while a pixel's longitudes come from the
       grid exactly as the producer wrote them — a global grid written −180…540 puts the two frames a
       turn apart. Ruling out all the turns rules out whichever one the kernel picks, so this test
       cannot be wrong in the direction that matters: a false 「近い」 only sends the pixel down the exact
       road, while a false 「遠い」 would be the #R783 defect again. */
    function lngsMeetAnyTurn(lngLo, lngHi, w, e) {
      return Math.floor((e - lngLo) / 360) >= Math.ceil((w - lngHi) / 360);
    }

    /* True unless NO edge of the zone can touch this pixel. Nothing to read ⇒ true, so a pixel is
       sent down the intersection road rather than proved interior out of an absence. */
    function edgesMayTouch(edgeBoxes, w, s, e, n) {
      if (!edgeBoxes) return true;
      for (let i = 0; i < edgeBoxes.length; i += 4) {
        if (edgeBoxes[i] > n || edgeBoxes[i + 1] < s) continue;
        if (lngsMeetAnyTurn(edgeBoxes[i + 2], edgeBoxes[i + 3], w, e)) return true;
      }
      return false;
    }

    /* ══ ⚠⚠⚠ (#R783) 「合計」は 3 つある。どれを出したのかは、量の意味が決める ═══════════════════
       An answer with one field called 「合計」 over a grid of unknown meaning is three different
       numbers wearing one name:

         observations   Σ value                — 「観測値の合計」. One term per contributing pixel,
                                                 whatever its cover. The reading of a station is a
                                                 reading, and two thirds of it is not one.
         areaIntegral   Σ value·km²            — the INTEGRAL of a density over the zone. This is the
                                                 one 「人/km² の層から県の人口」 wants, and it differs
                                                 from the first by a factor that varies with latitude.
         apportioned    Σ value·cover          — a pixel whose value IS that pixel's own total, split
                                                 by the fraction of the pixel inside the zone. The
                                                 integral would count the area twice here; the plain
                                                 sum would hand a border pixel's whole population to
                                                 both neighbours.

       ⚠ NOTHING THAT EXISTED CHANGES ITS MEANING. `sum` is still Σ value with one term per pixel,
       `sumTimesAreaKm2` is still the integral, and a caller that does not ask for a rule gets exactly
       the answer it got before, field for field. What is added is the ability to ASK, and to be told
       whether the arithmetic asked for means anything about this quantity.
       ⚠ AND THE JUDGEMENT IS NOT MADE HERE. js/gis-units.js owns 「その集計をしてよいか」 — it reads the
       declared quantity (kind / space / time / period) and answers a verdict with a remedy. This
       table only says which of its verdicts each rule corresponds to, and WHICH RULES FIT is then
       derived from the table rather than written out a second time: a rule added below is offered as
       a remedy automatically, and a rule cannot claim a verdict the unit kernel did not give.
       ⚠⚠⚠ AN UNDECLARED QUANTITY IS NOT A PERMISSION. 「誰も述べていない」 and 「足してよい」 are
       different facts, and the first has been the more expensive one in this app
       ([[intmap-data-must-not-claim-an-author-it-lacks]]). So an undeclared band gets the rule it
       asked for BY NAME AND NO NUMBER — never a complete-looking total nobody vouched for. The way
       out is to declare the quantity (on the band, or in the call), not to read silence as consent. */
    const TOTAL_RULES = {
      /* asks / wants / remedy / from — the verdict js/gis-units.js must give for this rule to mean anything.
         ⚠ 'refused' IS NOT A MISTAKE HERE: 「密度は足せない、面積を掛けてから足せ」 is precisely the
         unit kernel SAYING that the area integral is the right arithmetic, so the rule that performs
         it reads that remedy rather than re-deciding what a density is. */
      observations: { asks: 'sum', wants: 'allowed', remedy: null, from: 'sum', timesAreaKm2: false },
      areaIntegral: { asks: 'sum', wants: 'refused', remedy: 'multiply-by-area-then-sum', from: 'sumTimesAreaKm2', timesAreaKm2: true },
      apportioned: { asks: 'sum', wants: 'allowed', remedy: null, from: 'sumWeighted', timesAreaKm2: false },
    };
    const TOTAL_RULE_NAMES = Object.keys(TOTAL_RULES);

    function ruleFits(rule, verdict) {
      const R = TOTAL_RULES[rule];
      if (!R || !verdict || verdict.verdict !== R.wants) return false;
      return R.remedy == null || verdict.remedy === R.remedy;
    }

    /* The total the caller asked for, with the unit kernel's verdict attached to it. ⚠ `value` is null
       whenever the verdict is not 'allowed' — a number here would be the thing this whole block
       exists to prevent, and `fits` names the rules that DO mean something about this quantity so the
       refusal is actionable rather than a door closing. */
    function totalOf(rule, spec, acc) {
      const R = TOTAL_RULES[rule];
      const out = {
        rule: rule, value: null, verdict: null, why: null, detail: null,
        fits: null, bandUnit: acc.bandUnit, timesAreaKm2: R.timesAreaKm2,
        quantityFrom: acc.quantityFrom, units: null,
      };
      const U = unitKernel();
      /* A build with no unit module cannot answer 「してよいか」, and 「訊けなかった」 is not 「よい」
         — the same line js/gis-raster.js already takes over unit conversion (see commensurate). */
      if (!U || typeof U.aggregation !== 'function') return Object.assign(out, { verdict: 'unavailable', why: 'units-unavailable' });
      const v = U.aggregation(spec, R.asks, { over: 'space' });
      out.units = { verdict: v.verdict, why: v.why == null ? null : v.why, remedy: v.remedy == null ? null : v.remedy };
      if (v.verdict === 'undeclared' || v.verdict === 'unreadable') {
        return Object.assign(out, { verdict: 'undeclared', why: v.why || 'quantity-undeclared', detail: v.detail || null, fits: [] });
      }
      const fits = TOTAL_RULE_NAMES.filter((k) => ruleFits(k, v));
      if (fits.indexOf(rule) < 0) {
        return Object.assign(out, { verdict: 'refused', why: 'total-rule-does-not-fit-the-quantity', detail: v.detail || null, fits: fits });
      }
      return Object.assign(out, { verdict: 'allowed', value: acc[R.from], fits: fits });
    }

    function coverOf(raster, GG, geometry, row, col, boundary, areaOf, edgeBoxes) {
      const g = raster.grid;
      const w = g.west + g.pixelLng * col, e = g.west + g.pixelLng * (col + 1);
      const n = rowNorth(raster, row), s = rowNorth(raster, row + 1);
      /* ⚠ (#R783) THE INTERIOR PIXEL, PROVED RATHER THAN SAMPLED (see the header). No edge of the zone
         anywhere near this rectangle ⇒ the rectangle lies wholly on one side of the zone's boundary
         ⇒ the centre says which side, and 「内側」 means the whole pixel. The pixel that fails this
         goes on to the intersection below, whatever its corners say. */
      if (!edgesMayTouch(edgeBoxes, w, s, e, n)) {
        return GG.pointInGeometry([colCentreLng(raster, col), rowCentreLat(raster, row)], geometry) ? 1 : 0;
      }

      const pix = pixelRing(raster, row, col);
      /* ⚠ ASKED SO THAT A REFUSAL CAN BE READ. js/gis-geometry.js's `attempt` door exists precisely
         because a null from the plain door means both 「交わらなかった」 and 「計算できなかった」, and
         a zonal statistic must not read the second as the first (docs/GIS-CORE.md §2.5.1). */
      const att = GG.attempt && GG.attempt.intersection ? GG.attempt.intersection(pix, geometry) : null;
      if (!att) return refuse('geometry-unavailable');
      if (att.ok === false) return att;
      const cut = att.geometry;
      if (!cut) return 0;                       /* they really do not meet */
      if (boundary === 'allTouched') return 1;

      const partKm2 = areaOf(cut);
      const wholeKm2 = areaOf(pix);
      if (partKm2 == null || wholeKm2 == null) return refuse('geodesy-missing');
      if (!(wholeKm2 > 0)) return 0;
      const frac = partKm2 / wholeKm2;
      /* ⚠ CLAMPED, AND THE CLAMP IS NOT HIDING AN ERROR. Both areas come from the same closed form on
         the same sphere, so the ratio is exact to floating point; the clamp exists so that a
         degenerate cut at the pole cannot put a weight slightly over 1 into a sum. */
      return frac <= 0 ? 0 : (frac >= 1 ? 1 : frac);
    }

    function zonal(raster, bandIndex, geometry, opts) {
      const v = validate(raster);
      if (!v.ok) return v;
      const GG = geometryKernel();
      if (!GG || typeof GG.pointInGeometry !== 'function' || typeof GG.hasArea !== 'function' || typeof GG.toMulti !== 'function') return refuse('geometry-unavailable');
      if (!geometry || typeof geometry !== 'object') return refuse('zone-invalid');
      if (!GG.hasArea(geometry)) return refuse('zone-not-areal', { type: geometry.type == null ? null : String(geometry.type) });
      if (earthKm() == null) return refuse('geodesy-missing');
      const V = values(raster, bandIndex);
      if (!V.ok) return V;
      const wantClasses = !!(opts && (opts.classes === true || opts.histogram === true));

      /* ══ ⚠⚠⚠ (#R764) 境界の画素をどう数えるか — 判断であって、既定の変更ではない ═════════════
         The header above states centre-in-polygon as a JUDGEMENT and argues it well: a fractional
         pixel is meaningless for a class CODE, and for a point measurement the fraction is an
         interpolation nobody asked for. Both of those are about splitting the VALUE, and they stay
         true. What they do not settle is the AREA — 「この流域の面積」 and 「この区域の平均標高」 are
         answered from the pixels' ground area, and a zone that cuts a pixel in half is not answered
         by counting that pixel once or zero times. On a coarse grid against a narrow catchment, a
         thin coastal strip or a small ward, the difference is the answer.
         ⇒ THE RULE IS CHOSEN BY THE CALLER AND NAMED IN THE ANSWER. Nothing changes for a caller
         that does not choose: `center` is the default and its arithmetic is untouched.

           center       the pixel's centre decides. Weight 1 or 0. (default — unchanged)
           allTouched   any pixel the zone touches is in, whole. Weight 1 or 0.
           fractional   weight = the fraction of the pixel's area inside the zone, in [0,1].

         ⚠ WHICH STATISTICS THE WEIGHT TOUCHES IS ITSELF A JUDGEMENT, and it is stated rather than
         assumed. `areaKm2`, `valueAreaKm2`, `sumTimesAreaKm2`, `mean` and the class areas are about
         GROUND, so they take the weight. `count` and `sum` are about PIXELS — 「観測値の合計」 is a
         sum of readings, and two thirds of a reading is not a reading — so they count a contributing
         pixel once, whatever its weight. A caller comparing `sum` across boundary rules gets the
         same kind of number each time.
         ⚠ AND THE AREA RULE IS INJECTED, NOT WRITTEN HERE. js/gis-ops.js owns 「この多角形は何 km²
         か」 (Chamberlain–Duquette on js/geodesy.js's radius, with the seam window its comment
         explains); a second copy here would be the third spelling of the sphere in this app and the
         two would agree until they did not (.agents/rules/no-ad-hoc-hardcoding.md §2-3: あれば配る、
         写さない). Without it, `fractional` is refused BY NAME — never silently downgraded to
         centre, which would answer a different question with a complete-looking number. */
      const BOUNDARY = ['center', 'allTouched', 'fractional'];
      const boundary = (opts && opts.boundary != null && String(opts.boundary) !== '') ? String(opts.boundary) : 'center';
      if (BOUNDARY.indexOf(boundary) < 0) return refuse('boundary-rule-unknown', { boundary: boundary, rules: BOUNDARY.slice() });
      const areaOf = (opts && typeof opts.areaOf === 'function') ? opts.areaOf : null;
      if (boundary === 'fractional' && !areaOf) return refuse('fraction-needs-area-rule', { needs: 'areaOf' });
      const needsCover = (boundary !== 'center');
      /* Once per zone, before the walk: the same edges answer for every pixel (edgeBoxesOf above
         says why this is a parameter and not a cache). */
      const edgeBoxes = needsCover ? edgeBoxesOf(GG, geometry) : null;

      /* ⚠ (#R783) OPT-IN, AND REFUSED BY NAME WHEN UNREADABLE — the same shape as `boundary` above, for
         the same reason: a rule nobody can spell is not a rule the answer should guess at. The
         quantity is taken from the CALL if the caller declared one, otherwise from the BAND, and
         which of the two answered is written into the result — 「帯が述べた」 and 「呼び手が述べた」
         are different provenance and a reader checking a published figure needs to know which. */
      const totalRule = (opts && opts.total != null && String(opts.total) !== '') ? String(opts.total) : null;
      if (totalRule && TOTAL_RULE_NAMES.indexOf(totalRule) < 0) return refuse('total-rule-unknown', { total: totalRule, rules: TOTAL_RULE_NAMES.slice() });
      const declaredHere = (opts && opts.quantity != null) ? opts.quantity : null;
      const quantitySpec = declaredHere != null ? declaredHere : (V.band && V.band.quantity != null ? V.band.quantity : null);
      const quantityFrom = declaredHere != null ? 'caller' : (quantitySpec != null ? 'band' : null);

      const zb = geometryBbox(geometry);
      if (!zb) return refuse('zone-invalid');

      /* Only the rows and columns whose pixels can possibly meet the zone. A whole-grid walk over a
         43,200×21,600 global grid for one prefecture is 933 million centre-in-polygon tests for a few
         thousand real ones. The window is INCLUSIVE at both ends after flooring, so a zone narrower
         than one pixel still visits the pixel holding it. */
      const g = raster.grid;
      let row0 = Math.floor((g.north - zb[3]) / g.pixelLat);
      let row1 = Math.floor((g.north - zb[1]) / g.pixelLat);
      row0 = Math.max(0, row0); row1 = Math.min(raster.height - 1, row1);
      const cw = columnRanges(raster, GG, geometry, zb[2] - zb[0]);
      if (!cw.ok) return cw;
      const colRanges = cw.colRanges;

      let count = 0, nodataCount = 0, sum = 0, wsum = 0, areaKm2 = 0, valueAreaKm2 = 0;
      /* Σ value·cover — the pixel's OWN total split by the fraction of it inside the zone. Kept
         beside the other two because it is a third quantity and not a scaling of either: under
         `center` every cover is 1 and it equals `sum` exactly, which is the honest answer when no
         pixel was split. */
      let sumWeighted = 0;
      let min = null, max = null;
      /* ⚠ (#R764) A REFUSAL RAISED INSIDE THE WALK IS CARRIED OUT, NOT SWALLOWED. The step function
         cannot return one (its return value means 「この画素は終わり」), so the first one is kept and
         `finish` answers with it — a zonal answer computed with some pixels silently skipped would
         be a complete-looking number about a different zone. */
      let failedCover = null;
      const classAreas = wantClasses ? Object.create(null) : null;

      /* ⚠ THE WINDOW IS WALKED AS ONE SEQUENCE, so the walk can be let go of BETWEEN TWO PIXELS
         rather than only between two rows. A row of a 43,200-column global grid is not a unit of
         time — it is 43,200 centre-in-polygon tests against one zone and one against another — so
         pacing by rows would be the 「刻みは件数」 mistake with the count spelled differently. The
         column list is the same columns in the same order the nested loop visited them (the ranges
         come back sorted and merged), so no pixel moves and none is visited twice. */
      const cols = [];
      for (const range of colRanges) for (let col = range[0]; col <= range[1]; col++) cols.push(col);
      const rowsN = Math.max(0, row1 - row0 + 1);
      const perRow = cols.length;
      /* Carried across steps so the row's latitude and ground area are computed once per row, exactly
         as the nested loop computed them — the walk is flat, the arithmetic is not repeated. */
      let curRow = -1, lat = 0, cellKm2 = 0, base = 0;

      const step = (k) => {
        const row = row0 + ((k / perRow) | 0);
        if (row !== curRow) {
          curRow = row;
          lat = rowCentreLat(raster, row);
          const km2 = rowAreaKm2(raster, row);
          if (km2 == null) return refuse('geodesy-missing');
          cellKm2 = km2;
          base = row * raster.width;
        }
        const col = cols[k % perRow];
        /* ⚠ THE PIXEL BELONGS TO THE ZONE WHEN ITS CENTRE IS INSIDE IT — the judgement stated in
           the header, and still the default. No boundary pixel is split by area fraction under
           `center`, and none is counted twice. */
        let w = 1;
        if (!needsCover) {
          if (!GG.pointInGeometry([colCentreLng(raster, col), lat], geometry)) return;
        } else {
          const cov = coverOf(raster, GG, geometry, curRow, col, boundary, areaOf, edgeBoxes);
          /* a refusal from the area rule or the kernel is the answer, not a zero */
          if (cov && cov.ok === false) { failedCover = cov; return; }
          w = cov;
          if (!(w > 0)) return;
        }
        const cellW = cellKm2 * w;
        areaKm2 += cellW;
        const val = V.values[base + col];
        if (missing(val, V.nodata)) { nodataCount++; return; }
        count++;
        sum += val;
        sumWeighted += val * w;
        wsum += val * cellW;
        valueAreaKm2 += cellW;
        if (min == null || val < min) min = val;
        if (max == null || val > max) max = val;
        if (classAreas) {
          /* ⚠ THE CLASS AREA TAKES THE WEIGHT for the same reason `areaKm2` does: it is ground, and
             a zone that covers a tenth of a land-cover pixel contains a tenth of that pixel's
             ground. This is NOT the 「分類を按分する」 the header refuses — the class is not divided,
             the AREA is, and the class code the area is filed under is the pixel's own. */
          /* ⚠ NOT ROUNDED. A grid of 0.37 and 1.84 is not a classification with classes 0 and 2 —
             it is a continuous field, and answering 「区分ごとの面積」 about it would be an invented
             classification the reader would then compare against published figures. Refused by
             name, with the pixel that proved it. */
          const notAClass = classValue(val, row, col);
          if (notAClass) return notAClass;
          const key = String(val);
          classAreas[key] = (classAreas[key] || 0) + cellW;
        }
      };

      const finish = () => {
        if (failedCover) return failedCover;
        const out = {
        ok: true,
        /* ⚠ (#R764) WHICH RULE PRODUCED THIS. Two zonal answers over the same zone and grid can now
           differ, and a number whose rule is not stated cannot be compared with another one. */
        boundary: boundary,
        count: count,
        nodataCount: nodataCount,
        /* `sum` — Σ value, in the band's own unit, one term per pixel. `sumTimesAreaKm2` — Σ value·km²,
           in (band unit)·km², which is the INTEGRAL of the field over the zone. A reader wanting
           「この県の人口」 from a persons-per-km² band wants the second; a reader wanting 「観測値の
           合計」 wants the first. They differ by a factor that varies with latitude, so they are two
           fields and never one. */
        sum: sum,
        sumTimesAreaKm2: wsum,
        /* AREA-WEIGHTED (see the header): Σ(value·area)/Σarea over the pixels that HAVE a value.
           Dividing by `areaKm2` instead would silently treat every void as a zero. */
        mean: valueAreaKm2 > 0 ? (wsum / valueAreaKm2) : null,
        min: min,
        max: max,
        /* `areaKm2` — the zone as this grid resolves it, voids included, which is what the class
           areas and the coverage of the answer must be read against. `valueAreaKm2` — the part that
           carried a value. The two being different IS the coverage of the answer, and reporting only
           one of them is the 「件数で報告すると『一部だけ』が原理的に見えない」 shape. */
        areaKm2: areaKm2,
        valueAreaKm2: valueAreaKm2,
        /* The window actually walked, reported rather than hidden: it is what a caller measuring the
           cost of a zonal run needs, and `colRanges` having two entries is how a seam-crossing zone
           announces itself. */
        rows: [row0, row1],
        colRanges: colRanges,
        };
        if (classAreas) out.classAreasKm2 = classAreas;
        /* ⚠ (#R783) PRESENT ONLY WHEN ASKED FOR. Every field above answers exactly what it answered
           before this round, so a caller that chose no rule cannot tell that the choice exists —
           which is the condition the audit put on adding it. */
        if (totalRule) out.total = totalOf(totalRule, quantitySpec, { sum: sum, sumWeighted: sumWeighted, sumTimesAreaKm2: wsum, bandUnit: (V.band && V.band.unit != null) ? V.band.unit : null, quantityFrom: quantityFrom });
        return out;
      };

      return paced(rowsN * perRow, step, useCtx(opts), finish);
    }

    /* ── mask ─────────────────────────────────────────────────────────────────────────────────── */

    /* ⚠ THE COMPARISONS ARE NOT INVENTED HERE. js/gis-ops.js `evalCondition` is the canon for what
       `>=`/`in`/`between`… mean in this app, and this is the same meaning over numbers: `between`
       includes BOTH ends, `in` is membership, and an empty cell satisfies nothing except `!=`.
       ⚠ Two things differ, and both are because the operand is a number and not a spreadsheet cell:
         · `contains` is absent. It is text containment (「Tokyo」 finding 「tokyo」), and a numeric
           grid has no text to contain — offering it would mean inventing a string form for a
           measurement. An unknown op is refused by name rather than falling through to `false`,
           which is how a typo becomes 「該当なし」.
         · the empty-cell rule is inherited but UNOBSERVABLE: a missing input pixel is missing in the
           output whatever the verdict says, because there is no value to keep. It is written out
           anyway, so that the two files read the same. */
    const CONDITION_OPS = ['==', '!=', '<', '<=', '>', '>=', 'between', 'in'];

    function conditionTest(condition) {
      if (!condition || typeof condition !== 'object') return refuse('condition-invalid');
      const op = String(condition.op == null ? '' : condition.op);
      if (CONDITION_OPS.indexOf(op) < 0) return refuse('condition-op-unknown', { op: op, ops: CONDITION_OPS.slice() });
      const want = condition.value;
      if (op === 'between') {
        const pair = Array.isArray(want) ? want : [];
        if (pair.length !== 2 || !isNum(pair[0]) || !isNum(pair[1])) return refuse('condition-value-invalid', { op: op, value: want });
        const lo = pair[0], hi = pair[1];
        return { ok: true, test: (v) => v >= lo && v <= hi };
      }
      if (op === 'in') {
        const list = Array.isArray(want) ? want : [want];
        /* ⚠ A non-numeric member is REFUSED, not dropped. No number in a grid can equal 'A', so
           keeping the rest would narrow the reader's list behind their back and answer confidently
           about a set they did not ask for. */
        if (!list.length || !list.every(isNum)) return refuse('condition-value-invalid', { op: op, value: want });
        return { ok: true, test: (v) => list.indexOf(v) >= 0 };
      }
      if (!isNum(want)) return refuse('condition-value-invalid', { op: op, value: want });
      const w = want;
      const tests = {
        '==': (v) => v === w, '!=': (v) => v !== w,
        '<': (v) => v < w, '<=': (v) => v <= w,
        '>': (v) => v > w, '>=': (v) => v >= w,
      };
      return { ok: true, test: tests[op] };
    }

    /* A grid with the SAME geometry and one band, in which every pixel that fails the condition is
       missing. ⚠ The output declares the SAME `nodata` as the input — including `null` — and writes
       NaN for what it removed, because NaN is missing by contract (header) and any number chosen as a
       sentinel could be a real value of this band. Inventing one is how a mask turns −9999 °C into a
       temperature two layers downstream. */
    function mask(raster, bandIndex, condition, opts) {
      const v = validate(raster);
      if (!v.ok) return v;
      const t = conditionTest(condition);
      if (!t.ok) return t;
      const V = values(raster, bandIndex);
      if (!V.ok) return V;
      const n = raster.width * raster.height;
      let out;
      try { out = new Float64Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      let kept = 0, dropped = 0, missingCount = 0;
      return paced(n, (i) => {
        const val = V.values[i];
        if (missing(val, V.nodata)) { out[i] = NaN; missingCount++; return; }
        if (t.test(val)) { out[i] = val; kept++; } else { out[i] = NaN; dropped++; }
      }, useCtx(opts), () => ({
        ok: true,
        raster: derived(raster, [{ name: V.band.name, unit: V.band.unit == null ? null : V.band.unit, nodata: V.nodata }], out),
        kept: kept, dropped: dropped, nodataCount: missingCount,
      }));
    }

    /* ── diff ─────────────────────────────────────────────────────────────────────────────────── */

    function gridDelta(a, b) {
      const ga = a.grid, gb = b.grid;
      const tol = (px) => Math.abs(px) * GRID_EPS_FRAC;
      const off = {};
      if (a.width !== b.width) off.width = [a.width, b.width];
      if (a.height !== b.height) off.height = [a.height, b.height];
      if (Math.abs(ga.pixelLng - gb.pixelLng) > tol(ga.pixelLng)) off.pixelLng = [ga.pixelLng, gb.pixelLng];
      if (Math.abs(ga.pixelLat - gb.pixelLat) > tol(ga.pixelLat)) off.pixelLat = [ga.pixelLat, gb.pixelLat];
      if (Math.abs(ga.west - gb.west) > tol(ga.pixelLng)) off.west = [ga.west, gb.west];
      if (Math.abs(ga.north - gb.north) > tol(ga.pixelLat)) off.north = [ga.north, gb.north];
      return Object.keys(off).length ? off : null;
    }

    /* ══ ⚠⚠⚠ THE DIFFERENCE IS WRITTEN ONCE AND RUN BY TWO RUNNERS (#R759) ═════════════════════
       MEASURED BEFORE THIS WAS WRITTEN: js/gis-worker.js existed, and `run()` / `register()` /
       `probe()` had ZERO callers in js/ and in tests/ — one registered job (`grid.binary`) that
       nothing ran. 「Worker がある」 and 「普段の分析が Worker で走る」 are not the same sentence, and
       only the first of them was true. This is the second one, for the walk that had the best claim
       to it: a pixel-for-pixel subtraction, which is arithmetic over numbers and nothing else.

       ⚠ A JOB IS REBUILT FROM ITS OWN SOURCE TEXT IN THE WORKER'S GLOBAL SCOPE, SO IT CLOSES OVER
       NOTHING (js/gis-worker.js states the contract three ways). That is why this function names no
       helper of this module — not `missing`, not `isNum`, not `refuse` — and why the two runners do
       not each get a copy of the arithmetic: THE SAME FUNCTION OBJECT is registered into the worker
       and called here. A second spelling of 「片方が欠損なら差も欠損」 in a main-thread arm is the
       copy .agents/rules/no-ad-hoc-hardcoding.md §1 forbids, and it is the copy that would keep
       agreeing with this one right up until somebody edited one of them.

       ⚠ AND THE PER-PIXEL RULE IS REACHABLE ON ITS OWN (`{ rule:true }`), BECAUSE THE TWO RUNNERS DO
       NOT AGREE ABOUT WHO OWNS THE LOOP. In the worker the loop belongs to the job — there is no
       frame to yield to and no signal to read, the whole thread is the unit of cancellation. On this
       thread the loop belongs to `paced`, which is what makes the walk let go between two pixels and
       report `done`/`total` in PIXELS (#R756, and tests/r756 ② measures both numbers). So the job
       hands its rule out to a runner that owns its own pacing, and `diffHere` below walks with THIS
       function rather than with a second one. The door answers a function, which is not structured-
       cloneable — a worker asked for it would report `result-not-transferable`, by name — and no
       caller sends it there: it is the main thread's door into the job, and `diff` is its only user.

       ⚠ THE MISSING RULE IS `missing()`'s, NOT A SECOND ONE. The text below cannot call it (see the
       contract above), so tests/r759 ① runs both over the same values — NaN, ±Infinity, the declared
       sentinel, a grid with no sentinel — and fails if they classify one pixel differently. An
       assertion in a comment is what would rot; a measurement is what does not. */
    function gridDiffJob(p, ctx) {
      /* ⚠ NaN OUT MEANS 「入力が欠損だった」 AND NOTHING ELSE: the difference of two finite numbers
         is never NaN. It can overflow to ±Infinity (1e308 − −1e308), which `diff` has always counted
         as a value, so the caller's count is exact rather than nearly right. */
      function pixel(x, y, ndA, ndB) {
        if (typeof x !== 'number' || !isFinite(x) || (ndA != null && x === ndA)) return NaN;
        if (typeof y !== 'number' || !isFinite(y) || (ndB != null && y === ndB)) return NaN;
        return x - y;
      }
      if (p && p.rule === true) return { ok: true, value: pixel };
      const a = p ? p.a : null, b = p ? p.b : null;
      /* ⚠ THE KERNEL'S OWN WORDS FOR THE SAME TWO FACTS, not a private vocabulary for this job:
         「帯が配列として読めなかった」 is `read-not-array` (with WHICH side, because 「片方が壊れて
         いる」 without saying which one sends the reader to the grid that was fine) and 「その二つは
         同じ格子ではない」 is `grid-mismatch`. A job that invented two more names would be two more
         codes arriving at a panel that has a sentence for neither. */
      if (!a || typeof a.length !== 'number') return { ok: false, why: 'read-not-array', detail: { which: 'a' } };
      if (!b || typeof b.length !== 'number') return { ok: false, why: 'read-not-array', detail: { which: 'b' } };
      const n = a.length;
      if (b.length !== n) return { ok: false, why: 'grid-mismatch', detail: { a: n, b: b.length } };
      const ndA = (typeof p.nodataA === 'number' && isFinite(p.nodataA)) ? p.nodataA : null;
      const ndB = (typeof p.nodataB === 'number' && isFinite(p.nodataB)) ? p.nodataB : null;
      let out;
      /* The same refusal, by the same name, from whichever thread ran out of memory. */
      try { out = new Float64Array(n); } catch (e) { return { ok: false, why: 'raster-too-large', detail: { cells: n } }; }
      let count = 0, nodataCount = 0;
      /* Progress at most 64 times whatever the grid's size — the number js/gis-worker.js's own job
         derives, for the reason it states there: inside a worker the interval is about message
         traffic, not about responsiveness, and 64 is what a progress bar can show. */
      const step = Math.max(1, Math.floor(n / 64));
      const say = (ctx && typeof ctx.progress === 'function') ? ctx.progress : null;
      for (let i = 0; i < n; i++) {
        const v = pixel(a[i], b[i], ndA, ndB);
        out[i] = v;
        if (Number.isNaN(v)) nodataCount++; else count++;
        if (say && (i % step) === 0) say(i, n);
      }
      if (say) say(n, n);
      /* ⚠ THE RESULT IS TRANSFERRED, NOT COPIED. The worker allocated this buffer and nobody else
         holds a view of it, so there is no owner to surprise — js/gis-worker.js's transfer contract,
         in the one direction that has no option. */
      return { ok: true, value: { values: out, length: n, count: count, nodataCount: nodataCount }, transfer: [out.buffer] };
    }

    const DIFF_JOB = 'raster.diff';
    /* The per-pixel rule, taken out of the job ONCE (see the door above) rather than per call. */
    const DIFF_RULE = gridDiffJob({ rule: true }).value;

    /* ⚠ THE WORKER IS INJECTED, LIKE THE ctx AND UNLIKE `window.IntMapGeodesy`. This kernel reads
       `window.*` for the things it ASKS QUESTIONS OF (a radius, a point-in-polygon verdict); a second
       thread is not a question, it is a RUNNER the caller chooses for a particular call, and a kernel
       that reached for `window.IntMapGisWorker` itself would decide for every caller at once and
       would stop being the DOM-free module #R575 requires (tests/r735 boots it with no window at
       all). So the door is `opts.worker`, and a caller that hands none gets exactly the walk it got
       before this round — same arithmetic, same thread, byte for byte. */
    /* ⚠ THREE ANSWERS, NOT TWO: no door was offered (null — nothing to report, and the result keeps
       the shape every caller before this round reads), a door that cannot be used (a NOTE, carried
       into the answer so 「なぜこの計算はこのスレッドで走ったのか」 is readable rather than guessed),
       or the door itself. 「使えなかった」 and 「渡されなかった」 reaching the reader as one silence is
       [[intmap-one-store-was-asked]], in a runner. */
    function workerDoor(opts) {
      const w = opts && opts.worker;
      if (!w) return null;
      if (typeof w.run !== 'function') return { note: { used: false, reason: 'worker-door-invalid' } };
      /* `available()` is the SYNCHRONOUS capability question (js/gis-worker.js separates it from
         `probe()` for exactly this: a caller has to choose a path without awaiting one). A door that
         says no is not a failure — it is an environment without workers, and the answer is the main
         thread with that fact written down. */
      try {
        if (typeof w.available === 'function' && !w.available()) return { note: { used: false, reason: 'worker-unavailable' } };
      } catch (e) {
        return { note: { used: false, reason: 'worker-door-invalid', detail: { message: String((e && e.message) || e) } } };
      }
      return { worker: w };
    }

    /* Registered ONCE PER DOOR, and asked rather than remembered: js/gis-worker.js counts a
       registry change as a revision and retires idle workers built from an older one, so registering
       on every call would spawn a fresh thread for every difference. The registry itself is the
       record of what is registered — a WeakSet here would be a second one. */
    function ensureDiffJob(w) {
      try {
        const names = (typeof w.jobNames === 'function') ? w.jobNames() : null;
        if (names && names.indexOf(DIFF_JOB) >= 0) return { ok: true };
        if (typeof w.register !== 'function') return { ok: false, reason: 'job-not-registrable' };
        const r = w.register(DIFF_JOB, gridDiffJob, {
          decl: {
            id: DIFF_JOB,
            inputs: [{ name: 'a', type: 'band' }, { name: 'b', type: 'band' }],
            params: [{ name: 'nodataA', type: 'number|null' }, { name: 'nodataB', type: 'number|null' }],
            output: { values: 'band', length: 'count', count: 'count', nodataCount: 'count' },
          },
        });
        if (!r || !r.ok) return { ok: false, reason: (r && r.why) || 'job-not-registered', detail: (r && r.detail) || null };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'job-not-registered', detail: { message: String((e && e.message) || e) } };
      }
    }

    /* a − b, pixel by pixel, on the grid both of them are on. ⚠ TWO GRIDS THAT ARE NOT THE SAME GRID
       ARE NOT RESAMPLED HERE. Resampling is a CHOICE (which of nearest/bilinear/area-average, onto
       whose grid, with what happening at the voids), and making it silently inside a subtraction
       hands the reader a difference map whose every pixel is a blend of two interpolations nobody
       named. `grid-mismatch` says which fields differ and by how much, and a caller that wants the
       comparison can put both grids on one grid with `fromSampler` — where the choice is theirs and
       is written down. */
    function diff(a, b, bandIndex, opts) {
      /* WHICH of the two is invalid, because 「片方が壊れている」 without saying which one sends the
         reader to look at the grid that was fine. */
      const va = validate(a); if (!va.ok) return refuse('raster-invalid', { which: 'a', field: (va.detail && va.detail.field) || null });
      const vb = validate(b); if (!vb.ok) return refuse('raster-invalid', { which: 'b', field: (vb.detail && vb.detail.field) || null });
      const off = gridDelta(a, b);
      if (off) return refuse('grid-mismatch', off);
      const A = values(a, bandIndex); if (!A.ok) return A;
      const B0 = values(b, bandIndex); if (!B0.ok) return B0;
      /* (#R774) 「同じ量か」 before 「いくつ違うか」 — see commensurate() above. */
      const comm = commensurate(A, B0);
      if (!comm.ok) return comm.refusal;
      const B = comm.B;
      const ctx = useCtx(opts);
      const door = workerDoor(opts);
      /* ⚠ THE ANSWER IS THE SAME EITHER WAY AND THE SHAPE OF THE CALL IS NOT: a usable door means a
         promise, because another thread cannot answer within this turn. A caller that hands over no
         door is untouched — including every synchronous one this file already has. */
      if (door && door.worker) return diffOffThread(a, A, B, door.worker, ctx);
      return diffHere(a, A, B, ctx, door ? door.note : null);
    }

    /* The result of a finished difference, built in ONE place, because two arms that assemble their
       own would be two answers to 「単位は残るのか」 wearing one name. */
    function diffResult(a, A, B, out, count, nodataCount, note) {
      /* The unit survives only if both sides state the same one. ⚠ (#R774) THAT IS NOW A STATEMENT
         ABOUT WHAT REACHES HERE, NOT A POLICY: commensurate() has already converted a convertible B
         into A's unit and refused an incompatible one, so the two spellings are equal whenever
         either was stated at all. The null arm is left standing for the case it always meant —
         「片方だけが述べた」 — and never again labels a subtraction of two different quantities. */
      const unit = (A.band.unit != null && B.band.unit != null && String(A.band.unit) === String(B.band.unit)) ? A.band.unit : null;
      const name = String(A.band.name == null ? '' : A.band.name) + ' − ' + String(B.band.name == null ? '' : B.band.name);
      const res = {
        ok: true,
        /* nodata null: the difference declares no sentinel, it writes NaN (see mask). */
        raster: derived(a, [{ name: name, unit: unit, nodata: null }], out),
        count: count, nodataCount: nodataCount,
      };
      /* ⚠ 「Worker で走った」 と 「Worker が使えなかった」 ARE BOTH REPORTED, and only to a caller who
         offered one. A door that was offered and not used is the diagnosis
         [[intmap-atlas-failed-because-intmap-said-so]] asks for — the run SUCCEEDED, and the reader
         who wonders why it took the thread can read why instead of guessing.
         ⚠ AND ITS FIELD IS `reason`, NOT `why`. In this layer `why` is the code of a REFUSAL
         (docs/GIS-CORE.md §2.2, and this object is `ok:true`), and js/gis-panel.js has a sentence
         for every one of those. A diagnosis about which runner answered is not one of them — the
         reader got their grid — so it does not borrow the word that would make a reader, or a check
         over the refusal vocabulary, read a successful run as a failed one. The value it carries is
         js/gis-worker.js's own code, unchanged, because 「なぜ別スレッドが使えなかったか」 is that
         module's statement and paraphrasing it here would be a second vocabulary. */
      if (note) res.worker = note;
      return res;
    }

    /* THIS thread, `paced` — the walk #R756 made interruptible, unchanged except that the arithmetic
       it runs is now the job's own rule rather than a copy of it. */
    function diffHere(a, A, B, ctx, note) {
      const n = a.width * a.height;
      let out;
      try { out = new Float64Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      let count = 0, missingCount = 0;
      return paced(n, (i) => {
        /* ⚠ Either side missing means the DIFFERENCE is missing. A void read as 0 would report the
           other grid's value as the change — the same 「void blended into a measurement」 failure as
           the bilinear above, in subtraction form. */
        const v = DIFF_RULE(A.values[i], B.values[i], A.nodata, B.nodata);
        out[i] = v;
        if (Number.isNaN(v)) missingCount++; else count++;
      }, ctx, () => diffResult(a, A, B, out, count, missingCount, note));
    }

    /* ⚠⚠⚠ THE OTHER THREAD, AND THE ONE THING IT ADDS THAT PACING NEVER COULD (#R735): a stop that
       reaches arithmetic ALREADY RUNNING, because js/gis-worker.js answers an abort with
       `terminate()` rather than by asking the loop's permission.
       ⚠ THE ctx MEANS THE SAME THING HERE. `tick(units,total)` is still what decides whether the run
       continues and still accumulates the same units in PIXELS, so a caller's `ctx.done()` and a
       cancellation's `done`/`total` read identically on both paths; the only difference is that a
       tick which yields yields to a thread that is not doing the arithmetic.
       ⚠ AND A RUN THAT COULD NOT BE STOPPED IS NOT STARTED. If a ctx was handed over and there is no
       way to build a stop handle for it, this returns to the main thread rather than starting a job
       whose reader's stop button would be decoration — which is the defect, not a variant of it.
       ⚠ THE PAYLOAD IS CLONED (`own:'caller'`), DELIBERATELY. `own:'worker'` detaches every buffer it
       can reach, and these two are the INPUT GRIDS' own planes (`read()` hands back the array it
       holds) — transferring them would empty the caller's rasters as a side effect of asking a
       question about them. The result travels the other way with no copy at all. */
    async function diffOffThread(a, A, B, w, ctx) {
      const n = a.width * a.height;
      const fallback = (reason, detail) => diffHere(a, A, B, ctx, detail ? { used: false, reason: reason, detail: detail } : { used: false, reason: reason });

      const reg = ensureDiffJob(w);
      if (!reg.ok) return fallback(reg.reason, reg.detail);

      let stop = null;
      if (ctx) {
        try { if (typeof ctx.aborted === 'function' && ctx.aborted()) return cancelled(0, n); } catch (_) { }
        if (typeof AbortController !== 'function') return fallback('stop-handle-unavailable');
        stop = new AbortController();
        /* Carried, not re-read: the ctx's own signal must reach the thread, or the reader's cancel
           stops working the moment the work moves one call deeper (js/gis-ops.js `makeCtx` says the
           same sentence about the same shape). */
        if (ctx.signal) { try { ctx.signal.addEventListener('abort', () => stop.abort(), { once: true }); } catch (_) { } }
      }

      /* Progress messages ARE the ticks. The protocol's `onProgress` is synchronous and `tick` is
         not, so the asks are chained — one at a time, in order — and the first 「止めて」 aborts the
         thread. `reported` is where the walk had got to when that happened, which is the `done` the
         cancellation carries. */
      let reported = 0, stopped = false;
      let chain = Promise.resolve(true);
      const onProgress = (p) => {
        if (!ctx || stopped) return;
        const at = (p && typeof p.done === 'number' && isFinite(p.done)) ? p.done : reported;
        const units = at - reported;
        if (units <= 0) return;
        reported = at;
        chain = chain.then((go) => (go ? ctx.tick(units, n) : false)).then((go) => {
          if (!go && !stopped) { stopped = true; try { stop.abort(); } catch (_) { } }
          return go;
        }, () => true);
      };

      const res = await w.run(DIFF_JOB, {
        a: A.values, b: B.values, nodataA: A.nodata, nodataB: B.nodata,
      }, { own: 'caller', signal: stop ? stop.signal : null, onProgress: ctx ? onProgress : null });

      if (ctx) { try { await chain; } catch (_) { } }
      if (stopped) return cancelled(reported, n);

      if (!res || !res.ok) {
        const why = res ? res.why : 'worker-answered-nothing';
        /* ⚠ A CANCELLATION IS NOT A BROKEN WORKER. Re-running it here would spend the whole grid's
           work on this thread on behalf of a reader who had just asked for none of it — the exact
           freeze the stop button exists to end. Everything else falls back, because 「別のスレッドが
           駄目だった」 is not 「答えが無い」 and a silent empty answer is what this layer refuses. */
        if (why === 'aborted' || why === 'cancelled') return cancelled(reported, n);
        return fallback(why, res && res.detail ? res.detail : null);
      }
      const value = res.value;
      const out = value ? value.values : null;
      /* The worker is a runner, not an authority: an answer of the wrong shape is re-computed here
         rather than handed on. */
      if (!out || typeof out.length !== 'number' || out.length !== n) return fallback('worker-answer-malformed');

      if (ctx) {
        /* ⚠ THE PACER IS ASKED ON THE LAST PASS TOO, exactly as `paced` asks it, so `ctx.done()` ends
           equal to `total` and a progress line reaches 100% instead of stopping one pass short. */
        const go = await ctx.tick(n - reported, n);
        reported = n;
        if (!go) return cancelled(n, n);
      }
      return diffResult(a, A, B, out, value.count, value.nodataCount, { used: true, job: DIFF_JOB });
    }

    /* ── combine: the same subtraction, with the arithmetic named by the caller ───────────────── */

    /* ⚠ `diff` IS ONE QUESTION AND THIS IS THE FAMILY IT BELONGS TO (#R752). js/gis-ops.js's
       `rasterCalc` needs a − b, a / b, a > b ? 1 : 0, (a + b) / 2 … and writing each as its own walk
       here would be one file per operator, each with its own answer to 「片方が欠損だったら」.
       ⚠ SO THE CALLER SUPPLIES THE ARITHMETIC AND THIS SUPPLIES EVERYTHING ELSE, and 「everything
       else」 is the part that keeps being got wrong:
         · THE SAME GRID TEST, the same implementation (`gridDelta`). Two grids that are not one grid
           are not resampled to be combinable — the reason is written out at `diff` and it does not
           get weaker because the operator changed.
         · A VOID REACHES `fn` AS null, ALWAYS. NaN, ±Infinity and the band's declared sentinel are
           all one thing to the caller, so 「欠損とは何か」 is not written a second time at every call
           site — which is where it would be written differently.
         · `fn` RETURNING null OR A NON-FINITE NUMBER IS A VOID IN THE OUTPUT. 0/0 and 「この画素は
           答えられない」 are the same statement, and writing 0 for either is the 「void blended into a
           measurement」 failure this file's header measures.
       ⚠ THE UNIT IS NOT INVENTED. `diff` can keep a unit because it knows it is subtracting; an
       arbitrary fn does not have one — mm ÷ °C is not mm — so `meta.unit` is the CALLER's statement
       and null when they make none. Deriving one here would let a chart label a nonsense number.
       ⚠ AND A THROWING `fn` DOES NOT TAKE THE GRID WITH IT, and does not vanish either: the pixel is
       a void (there is no answer for it), `failed` counts them and `failedError` carries the first
       message — the same shape `fromSampler` uses for a sampler that throws, for the same reason.

       ⚠⚠⚠ AND THIS IS WHY `combine` DOES NOT GET THE SECOND THREAD `diff` GOT (#R759). It is not a
       size judgement — this walk is the expensive one — it is that `fn` CANNOT CROSS. Read from the
       implementation, not assumed: js/gis-ops.js `runRasterCalc` builds `fn` as `(x, y) => { row.a =
       x; row.b = y; const r = c.fn(row); … }`, which closes over `row`, over `firstError`, and over
       `c` — and `c.fn` is js/gis-expr.js `compile`'s own arrow, closing over the parsed AST `p.ast`
       and the number rule `R`, neither of which is in the text of either function. js/gis-worker.js
       registers `fn.toString()` and evaluates it in the worker's global scope, so every one of those
       names arrives there as a ReferenceError — reported by name as `job-not-self-contained`, which
       is a refusal rather than a wrong answer, and still not a difference map.
       ⇒ WHAT WOULD MAKE IT CARRIABLE, so this is a route and not a wall: the closure's contents are
       DATA. `p.ast` is JSON (js/gis-expr.js `parse` builds plain nodes) and the number rule is a
       declaration. A job whose TEXT is the evaluator — the walk plus `evalNode` and the `FUNCS` table
       written self-containedly, or generated from js/gis-expr.js's source in one place so there is
       still one expression language — taking `{ ast, rule }` as `deps` would run the same expression
       on the other thread. That is a job for whoever moves the evaluator, and it is the only shape
       that does not end with two dialects of the same expression language. */
    function combine(a, b, bandA, bandB, fn, meta) {
      const va = validate(a); if (!va.ok) return refuse('raster-invalid', { which: 'a', field: (va.detail && va.detail.field) || null });
      const vb = validate(b); if (!vb.ok) return refuse('raster-invalid', { which: 'b', field: (vb.detail && vb.detail.field) || null });
      if (typeof fn !== 'function') return refuse('combine-fn-not-a-function');
      const off = gridDelta(a, b);
      if (off) return refuse('grid-mismatch', off);
      const A = values(a, bandA); if (!A.ok) return A;
      const B = values(b, bandB); if (!B.ok) return B;
      const n = a.width * a.height;
      let out;
      try { out = new Float64Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      const m = (meta && typeof meta === 'object') ? meta : {};
      let count = 0, missingCount = 0, failed = 0, failedError = null;
      return paced(n, (i) => {
        const x = A.values[i], y = B.values[i];
        let r;
        try { r = fn(missing(x, A.nodata) ? null : x, missing(y, B.nodata) ? null : y); }
        catch (err) { failed++; if (failedError == null) failedError = String((err && err.message) || err); r = null; }
        if (typeof r !== 'number' || !isFinite(r)) { out[i] = NaN; missingCount++; return; }
        out[i] = r; count++;
      }, useCtx(m), () => ({
        ok: true,
        raster: derived(a, [{
          name: m.name == null ? null : m.name,
          unit: m.unit == null ? null : m.unit,
          /* ⚠ DECLARED, NOT WRITTEN. The output still writes NaN for what it could not answer (see
             `mask`); a sentinel here is the caller telling the NEXT reader which number this band
             uses for a void, and if their fn can produce that number as a real value they have said
             so about their own data. */
          nodata: isNum(m.nodata) ? m.nodata : null,
        }], out),
        /* `nodataCount` includes the pixels `fn` threw on — they have no answer, which is what a void
           is — and `failed` is how a reader tells 「そこに値が無かった」 from 「式が壊れていた」. */
        count: count, nodataCount: missingCount, failed: failed, failedError: failedError,
      }));
    }

    /* ── merge: two sheets, one sheet ─────────────────────────────────────────────────────────── */

    /* ⚠ THE OVERLAP RULE IS REQUIRED, AND THAT IS THE WHOLE POINT OF THIS FUNCTION (#R752). A mosaic
       of two tiles is trivial where they do not overlap and is a JUDGEMENT everywhere they do, and a
       default — 「後から来たほうで上書き」 is the usual one — would make the answer depend on the
       argument order the caller happened to use, for a question they were never asked. `first` and
       `second` are honest choices (a newer survey wins); `min`/`max`/`mean` are different ones; none
       of them is the obvious one, so an unstated rule is refused by name with the list.
       ⚠ AND THE TWO GRIDS MUST ALREADY BE ONE GRID. This does not resample — the reason is `diff`'s,
       verbatim: a mosaic that silently interpolates hands back a sheet whose every seam pixel is a
       blend of two interpolations nobody named. js/gis-warp.js is where the caller puts them on one
       lattice, and there the choice is theirs and is written down.
       ⚠ THE OVERLAP IS MEASURED AND RETURNED (`overlapCount`), because 「重なっていたのは何画素か」
       is the one number that tells a reader whether the rule they chose mattered at all. */
    const MERGE_OVERLAPS = ['first', 'second', 'min', 'max', 'mean'];

    function merge(a, b, bandIndex, opts) {
      const va = validate(a); if (!va.ok) return refuse('raster-invalid', { which: 'a', field: (va.detail && va.detail.field) || null });
      const vb = validate(b); if (!vb.ok) return refuse('raster-invalid', { which: 'b', field: (vb.detail && vb.detail.field) || null });
      const stated = (opts && opts.overlap != null) ? String(opts.overlap) : '';
      if (!stated) return refuse('merge-overlap-not-stated', { overlaps: MERGE_OVERLAPS.slice() });
      if (MERGE_OVERLAPS.indexOf(stated) < 0) return refuse('merge-overlap-unknown', { overlap: stated, overlaps: MERGE_OVERLAPS.slice() });
      const off = gridDelta(a, b);
      if (off) return refuse('grid-mismatch', off);
      const A = values(a, bandIndex); if (!A.ok) return A;
      const B0 = values(b, bandIndex); if (!B0.ok) return B0;
      /* (#R774) A mosaic of two sheets is one sheet: `min`, `max` and `mean` are arithmetic over
         both, and `first`/`second` still hand the reader one band with one unit on it. Same rule,
         same place — see commensurate(). */
      const comm = commensurate(A, B0);
      if (!comm.ok) return comm.refusal;
      const B = comm.B;
      const n = a.width * a.height;
      let out;
      try { out = new Float64Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      let count = 0, missingCount = 0, both = 0, onlyA = 0, onlyB = 0;
      return paced(n, (i) => {
        const x = A.values[i], y = B.values[i];
        const hasA = !missing(x, A.nodata), hasB = !missing(y, B.nodata);
        if (hasA && hasB) {
          both++; count++;
          out[i] = (stated === 'first') ? x
            : (stated === 'second') ? y
              : (stated === 'min') ? Math.min(x, y)
                : (stated === 'max') ? Math.max(x, y)
                  /* `mean` of the two SHEETS, not of the coverage: both sides carry one observation
                     of this pixel and they weigh the same. A count-weighted mean over more than two
                     sheets is a different function and is not pretended to here. */
                  : (x + y) / 2;
          return;
        }
        if (hasA) { out[i] = x; onlyA++; count++; return; }
        if (hasB) { out[i] = y; onlyB++; count++; return; }
        /* ⚠ BOTH MISSING IS MISSING. Neither sheet has an observation here, and a 0 would be this
           function inventing the one number the reader would then plot. */
        out[i] = NaN; missingCount++;
      }, useCtx(opts), () => {
        /* Same two rules as `diff`, for the same reasons, and (#R774) the same single commensurate()
           before either: a unit survives only if both sides state the same one — which they do by
           the time this runs, or one of them said nothing — and the name says what was merged rather
           than claiming to be one of them. */
        const unit = (A.band.unit != null && B.band.unit != null && String(A.band.unit) === String(B.band.unit)) ? A.band.unit : null;
        const na = A.band.name == null ? null : String(A.band.name);
        const nb = B.band.name == null ? null : String(B.band.name);
        const name = (na != null && nb != null) ? (na === nb ? na : (na + ' ∪ ' + nb)) : (na != null ? na : nb);
        return {
          ok: true,
          raster: derived(a, [{ name: name, unit: unit, nodata: null }], out),
          count: count, nodataCount: missingCount,
          overlapCount: both, onlyA: onlyA, onlyB: onlyB, overlap: stated,
        };
      });
    }

    /* One constructor for every grid this file produces, so `mask`, `diff`, `combine`, `merge` and
       `rasterize`'s caller cannot drift in what they hand back and all of them satisfy validate() by
       construction. ⚠ It is PRIVATE and has two public doors (`derived`, `build`) that differ only in
       where the lattice comes from — see `build`. */
    function assemble(width, height, gridFields, bands, planes) {
      const grid = { west: gridFields.west, north: gridFields.north, pixelLng: gridFields.pixelLng, pixelLat: gridFields.pixelLat };
      /* ⚠ CARRIED, and only when the source declared one: a mask or a difference sits on the same
         rows as its input, so the latitudes those rows stand for are the same statement. Dropping it
         would make an areal aggregate over a masked grid weight by row index where the input weighted
         by ground — the same numbers, silently differently weighted. */
      if (gridFields.latAxis !== undefined && gridFields.latAxis !== null) grid.latAxis = gridFields.latAxis;
      return {
        width: width, height: height,
        bands: bands,
        grid: grid,
        /* `read` answers only for the bands it has — an index outside them is band-out-of-range at
           the entrances, and null here rather than a wrong band's numbers. */
        read: (i) => { const k = (i == null) ? 0 : i; return (isInt(k) && k >= 0 && k < planes.length) ? planes[k] : null; },
      };
    }

    function derived(like, bands, data) {
      return assemble(like.width, like.height, like.grid, bands, [data]);
    }

    /* ⚠⚠⚠ THE SECOND DOOR, AND IT IS THE SAME CONSTRUCTOR (#R752). `derived` can only make a grid on
       the lattice it was handed, which is right for `mask`/`diff`/`combine` — they answer pixel by
       pixel about grids that already agree — and wrong for anything whose OUTPUT lattice is the
       caller's choice (`rasterize` burns vectors onto a window and a resolution that no input grid
       has). Writing a second object literal there is how the two would come to disagree about what a
       raster IS: one of them would forget `latAxis`, or write `read` so that band 1 answers band 0's
       numbers, and nothing would fail until an aggregate came out silently differently weighted. So
       both doors assemble through `assemble` and differ only in where the lattice comes from.
       ⚠ AND THIS ONE IS CHECKED, because its grid is an argument rather than a grid that was already
       validated at an entrance: the result goes through `validate()` — the same one every entrance
       uses — and a lattice that cannot hold a grid comes back as `raster-invalid` naming the field,
       not as an object that fails three ops later.
         grid  — { west, north, pixelLng, pixelLat, width, height } (+ optional latAxis)
         bands — [{ name, unit, nodata }, …]; anything absent is null, which is 「宣言が無い」
         data  — one array for a one-band grid, or one array PER BAND (arrays, not numbers, so a
                 one-cell one-band grid written as [5] is still that grid's single plane) */
    function build(grid, bands, data) {
      if (!grid || typeof grid !== 'object') return refuse('raster-invalid', { field: 'grid' });
      if (!Array.isArray(bands) || !bands.length) return refuse('raster-invalid', { field: 'bands' });
      const decl = bands.map((b) => {
        const s = (b && typeof b === 'object') ? b : {};
        return {
          name: s.name == null ? null : s.name,
          unit: s.unit == null ? null : s.unit,
          /* Same rule as `fromSampler`'s band: a sentinel survives only if one was declared as a
             number, and `null` stays 「宣言が無い」 rather than becoming 「欠損が無い」. */
          nodata: isNum(s.nodata) ? s.nodata : null,
        };
      });
      const arrayLike = (x) => !!x && typeof x !== 'string' && typeof x !== 'number' && typeof x.length === 'number';
      const planes = (Array.isArray(data) && data.length === decl.length && data.every(arrayLike)) ? data.slice() : [data];
      const raster = assemble(grid.width, grid.height, grid, decl, planes);
      const v = validate(raster);
      if (!v.ok) return v;
      return { ok: true, raster: raster };
    }

    /* ── polygonize: 等しい値の連結領域を面にする ─────────────────────────────────────────── */

    /* ⚠⚠⚠ THIS IS `zonal` RUN BACKWARDS, AND IT INHERITS `zonal`'s REFUSAL (#R752). A classification
       grid — land cover, Köppen, an administrative raster — is a set of REGIONS that were stored as
       pixels, and until this existed the only way to ask 「その区分の面を出せ」 was to already have
       the polygons. ⚠ A MEASURED grid is refused by the same `classValue` `zonal` asks, not by a
       second copy of the test: the connected regions of a continuous field are an artefact of float
       equality, and drawing one polygon per pixel and calling it 「地域」 is the ハリボテ
       CONSTITUTION.md forbids.
       ══ WHAT IT DECIDES, STATED ═══════════════════════════════════════════════════════════════
       · 4-NEIGHBOUR CONNECTIVITY. Two pixels of the same value touching only at a corner are two
         regions. With 8-connectivity they would be one region whose boundary crosses itself at that
         corner — not a simple polygon, and not something a GeoJSON reader can fill. The choice is
         stated rather than left to whichever the implementation happened to do.
       · A HOLE IS A HOLE. An enclosed region of another value is not covered by the polygon around
         it; it is a ring inside it. A polygonize that returned only outer rings would report the
         island's area as part of the lake's, which is the one thing these polygons get used for.
       · THE RINGS FOLLOW RFC 7946 §3.1.6 — exterior COUNTER-CLOCKWISE, holes CLOCKWISE, each closed
         (last coordinate === first). `rings[0]` is the exterior. That is the orientation a GeoJSON
         Polygon wants, so the caller assembles `{type:'Polygon', coordinates: p.rings}` and nothing
         in between has to guess which way round these are — the failure js/gis-shapefile.js records
         (#R738: 「環の向きが外と穴を分ける唯一の区別」).
       · THE COORDINATES ARE PIXEL EDGES, NOT CENTRES. A region of one pixel is that pixel's square,
         so the polygons of a whole grid TILE it and their areas add up to the grid's. Tracing the
         centres instead would shrink every region by half a pixel on each side.
       · A MISSING PIXEL IS IN NO POLYGON. It has no value, so it is not a region of one — it becomes
         a hole or a gap, and `nodataCount` says how many there were.
       ⚠ AND IT IS ASYNC, because it walks the grid twice and then the boundary. A synchronous walk
       over a 4,000×4,000 grid holds the one thread for seconds, during which the map does not draw
       and `signal.aborted` cannot even be SET by the code that would set it — the shape
       docs/GIS-CORE.md §2.6 measured and [[intmap-sync-loop-cannot-be-cancelled]] names. The unit of
       the yield is ELAPSED TIME (`frameMs()`), exactly as `fromSamplerAsync`'s is; the `& CLOCK_MASK` below
       is about how often the CLOCK is read, not about how much work a slice contains. */
    async function polygonize(g, bandIndex, opts) {
      const v = validate(g);
      if (!v.ok) return v;
      /* ⚠ A GRID THAT HAS DECLARED ITS ROWS ARE NOT DEGREES CANNOT BE HANDED BACK AS lng/lat. The
         pixel-space proxies js/gis-warp.js reads through carry `grid.latAxis` precisely to say so
         (their 「lat」 is a negated row index), and emitting `north − row·pixelLat` from one would be
         a polygon claiming a position on the Earth that nobody measured. The caller warps first. */
      if (g.grid.latAxis !== undefined && g.grid.latAxis !== null) {
        return refuse('grid-not-degrees', { latAxis: (typeof g.grid.latAxis === 'string') ? g.grid.latAxis : 'edges' });
      }
      const V = values(g, bandIndex);
      if (!V.ok) return V;
      const o = opts || {};
      const sig = o.signal || null;
      const onp = (typeof o.onProgress === 'function') ? o.onProgress : null;
      const width = g.width, height = g.height, n = width * height;
      let labels, stack;
      try { labels = new Int32Array(n); stack = new Int32Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      labels.fill(-1);

      const comps = [];
      let last = nowMs();
      async function breathe(phase, done, total) {
        const t = nowMs();
        if (t - last < FRAME_MS) return !(sig && sig.aborted);
        last = t;
        if (onp) { try { onp({ phase: phase, done: done, total: total, polygons: comps.length }); } catch (_) { } }
        /* one turn of the event loop — the camera, the renderer and the stop button are all here */
        await new Promise((res) => setTimeout(res, 0));
        return !(sig && sig.aborted);
      }
      /* (#R756) THE SAME SHAPE AS EVERY OTHER STOPPED WALK IN THIS FILE — `cancelled` builds it — with
         the phase ADDED rather than substituted, because 「どの段で止まったか」 is real information a
         three-pass walk has and a one-pass walk does not. */
      const stopped = (phase, done, total) => Object.assign(cancelled(done, total), { detail: { phase: phase, done: done, total: total } });

      /* ══ ① label: the 4-connected regions of equal value ═════════════════════════════════════
         Equality is EXACT. These are integers by the refusal above, so 「等しい」 has no tolerance to
         choose and a tolerance would merge two adjacent classes. −2 marks a pixel that is missing,
         which is neither a region nor unvisited. The flood fill carries its own stack: a grid one
         region deep would put 16 million frames on the call stack, and 「大きい入力で落ちる」 is not
         a property this file is allowed to have. */
      let nodataCount = 0;
      for (let i = 0; i < n; i++) {
        if ((i & CLOCK_MASK) === 0 && !(await breathe('label', i, n))) return stopped('label', i, n);
        if (labels[i] !== -1) continue;
        const val = V.values[i];
        if (missing(val, V.nodata)) { labels[i] = -2; nodataCount++; continue; }
        /* Seeds only: every other pixel of a region was reached because its value is EXACTLY this
           one, so checking the seed checks every distinct value in the grid exactly once. */
        const notAClass = classValue(val, (i / width) | 0, i % width);
        if (notAClass) return notAClass;
        const L = comps.length;
        comps.push({ value: val, pixels: 0 });
        let sp = 0, cnt = 0;
        stack[sp++] = i; labels[i] = L;
        while (sp > 0) {
          const p = stack[--sp]; cnt++;
          if ((cnt & CLOCK_MASK) === 0 && !(await breathe('label', i, n))) return stopped('label', i, n);
          const r = (p / width) | 0, c = p - r * width;
          if (c > 0 && labels[p - 1] === -1 && V.values[p - 1] === val) { labels[p - 1] = L; stack[sp++] = p - 1; }
          if (c < width - 1 && labels[p + 1] === -1 && V.values[p + 1] === val) { labels[p + 1] = L; stack[sp++] = p + 1; }
          if (r > 0 && labels[p - width] === -1 && V.values[p - width] === val) { labels[p - width] = L; stack[sp++] = p - width; }
          if (r < height - 1 && labels[p + width] === -1 && V.values[p + width] === val) { labels[p + width] = L; stack[sp++] = p + width; }
        }
        comps[L].pixels = cnt;
      }

      /* ══ ② the boundary edges, ORIENTED ═══════════════════════════════════════════════════════
         A node is a pixel CORNER: (col, row) with col ∈ [0,width], row ∈ [0,height], numbered
         col + row·(width+1). Work in (X, Y) = (col, −row) so Y increases northward exactly as lat
         does — then 「interior on the left」 is the ordinary counter-clockwise convention and the sign
         of the shoelace below is the sign RFC 7946 asks about, with no flip to remember.
         Each side of a pixel whose neighbour is NOT in the same region emits ONE directed edge with
         the region on its left: south edge →+X, east →+Y, north →−X, west →−Y. */
      const NW = width + 1;
      const edges = new Map();
      function addEdge(L, s, e) {
        let m = edges.get(L);
        if (!m) { m = new Map(); edges.set(L, m); }
        const list = m.get(s);
        if (list) list.push(e); else m.set(s, [e]);
      }
      for (let i = 0; i < n; i++) {
        if ((i & CLOCK_MASK) === 0 && !(await breathe('edges', i, n))) return stopped('edges', i, n);
        const L = labels[i];
        if (L < 0) continue;
        const r = (i / width) | 0, c = i - r * width;
        if (r === 0 || labels[i - width] !== L) addEdge(L, (c + 1) + r * NW, c + r * NW);
        if (r === height - 1 || labels[i + width] !== L) addEdge(L, c + (r + 1) * NW, (c + 1) + (r + 1) * NW);
        if (c === 0 || labels[i - 1] !== L) addEdge(L, c + r * NW, c + (r + 1) * NW);
        if (c === width - 1 || labels[i + 1] !== L) addEdge(L, (c + 1) + (r + 1) * NW, (c + 1) + r * NW);
      }

      const nodeX = (id) => id % NW;
      const nodeY = (id) => -((id / NW) | 0);
      const dirOf = (a, b) => [Math.sign(nodeX(b) - nodeX(a)), Math.sign(nodeY(b) - nodeY(a))];
      /* ⚠ AT A PINCH THE TRAVERSAL TURNS RIGHT. A node where the region occupies two diagonally
         opposite pixels has TWO outgoing edges, and the choice between them is not free: taking the
         sharpest right turn keeps the ring hugging the interior it is walking around, so the two
         lobes come back as one non-self-intersecting outer ring and a hole, instead of two rings that
         cross at that corner. Left-turn preference is the same algorithm for 8-connectivity, and this
         file chose 4 (see the header). */
      function turnScore(dx, dy, ex, ey) {
        if (ex === dy && ey === -dx) return 0;      /* right  */
        if (ex === dx && ey === dy) return 1;       /* ahead  */
        if (ex === -dy && ey === dx) return 2;      /* left   */
        return 3;                                    /* back   */
      }
      /* One closed ring, consuming the edges it walks. Collinear nodes are dropped as they are met —
         a 100×100 square is 4 corners and not 400 — which is exact: a vertex in the middle of a
         straight side changes no geometry, and keeping them would quadruple every file downstream. */
      function traceRing(m, s0) {
        const nodes = [];
        let cur = s0, dx = 0, dy = 0, have = false;
        for (; ;) {
          const list = m.get(cur);
          if (!list || !list.length) break;
          let k = 0;
          if (list.length > 1 && have) {
            let best = 9;
            for (let j = 0; j < list.length; j++) {
              const d = dirOf(cur, list[j]);
              const s = turnScore(dx, dy, d[0], d[1]);
              if (s < best) { best = s; k = j; }
            }
          }
          const nxt = list[k];
          if (list.length === 1) m.delete(cur); else list.splice(k, 1);
          const nd = dirOf(cur, nxt);
          if (!have || !(nd[0] === dx && nd[1] === dy)) nodes.push(cur);
          dx = nd[0]; dy = nd[1]; have = true;
          cur = nxt;
          if (cur === s0) break;
        }
        /* The node the walk STARTED at is only a vertex if the ring turns there — and it was chosen
           by map order, not because it is a corner. Dropping it when the closing direction matches
           the opening one keeps 「頂点は角である」 true all the way round. */
        if (nodes.length >= 3 && have) {
          const d0 = dirOf(nodes[0], nodes[1]);
          if (d0[0] === dx && d0[1] === dy) nodes.shift();
        }
        return nodes;
      }
      /* Twice the signed area in node coordinates: > 0 is counter-clockwise, i.e. an exterior ring. */
      function ringArea2(nodes) {
        let s = 0;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i], b = nodes[(i + 1) % nodes.length];
          s += nodeX(a) * nodeY(b) - nodeX(b) * nodeY(a);
        }
        return s;
      }
      function ringBox(nodes) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const id of nodes) {
          const x = nodeX(id), y = nodeY(id);
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return [x0, y0, x1, y1];
      }
      const gr = g.grid;
      function toCoords(nodes) {
        const ring = [];
        for (const id of nodes) ring.push([gr.west + gr.pixelLng * nodeX(id), gr.north + gr.pixelLat * nodeY(id)]);
        /* Closed explicitly: RFC 7946 requires the first position repeated, and a caller that had to
           add it would be the second place this file's ring convention lived. */
        if (ring.length) ring.push(ring[0].slice());
        return ring;
      }

      /* ══ ③ ring → polygon ════════════════════════════════════════════════════════════════════
         A 4-connected region has ONE exterior ring and one ring per enclosed hole, so the assignment
         below is normally 「全部 rings[0] の穴」. It is written as a containment test anyway — the
         smallest exterior whose node box holds the hole's — because that costs a few lines and
         removes the need to TRUST the topology claim; the rings of one region nest strictly, so their
         boxes nest too, and a reading that would be wrong is one this file never produces. */
      const polygons = [];
      for (let L = 0; L < comps.length; L++) {
        if (!(await breathe('rings', L, comps.length))) return stopped('rings', L, comps.length);
        const m = edges.get(L);
        if (!m) continue;
        const outer = [], holes = [];
        for (const s0 of Array.from(m.keys())) {
          for (; ;) {
            const list = m.get(s0);
            if (!list || !list.length) break;
            const ring = traceRing(m, s0);
            if (ring.length < 3) continue;
            (ringArea2(ring) > 0 ? outer : holes).push(ring);
          }
        }
        if (!outer.length) continue;
        const boxes = outer.map(ringBox);
        const built = outer.map((ring) => [toCoords(ring)]);
        for (const hole of holes) {
          const hb = ringBox(hole);
          let pick = -1, pickArea = Infinity;
          for (let k = 0; k < outer.length; k++) {
            const b = boxes[k];
            if (!(b[0] <= hb[0] && b[1] <= hb[1] && b[2] >= hb[2] && b[3] >= hb[3])) continue;
            const area = (b[2] - b[0]) * (b[3] - b[1]);
            if (area < pickArea) { pickArea = area; pick = k; }
          }
          if (pick >= 0) built[pick].push(toCoords(hole));
        }
        for (const rings of built) {
          polygons.push({
            value: comps[L].value,
            /* The pixels of the REGION this polygon's rings came from — the count `zonal` would
               return for the same shape, so a caller can check the two against each other. */
            pixels: comps[L].pixels,
            rings: rings,
            holes: rings.length - 1,
          });
        }
      }
      if (onp) { try { onp({ phase: 'done', done: n, total: n, polygons: polygons.length }); } catch (_) { } }
      return {
        ok: true,
        polygons: polygons,
        count: polygons.length,
        /* `regions` is how many 4-connected regions were found and `count` how many polygons came
           out; they are equal for every grid this has been run on, and reporting both is how a reader
           would see it if they ever were not. */
        regions: comps.length,
        nodataCount: nodataCount,
      };
    }

    /* ── describe ─────────────────────────────────────────────────────────────────────────────── */

    /* ⚠ MEASURED, NOT COPIED. min/max are walked rather than read from whatever the producer
       declared, because a declared range is a claim about the file and this is a statement about the
       numbers actually in it — and a decoder that mis-scaled a band shows up here and nowhere else.
       `nodata` IS copied, because it is the declaration itself, and the measured companion to it is
       `nodataCount`. */
    function describeBands(raster) {
      const v = validate(raster);
      if (!v.ok) return v;
      const out = [];
      for (let i = 0; i < raster.bands.length; i++) {
        const V = values(raster, i);
        if (!V.ok) return V;
        let min = null, max = null, count = 0, nodataCount = 0;
        const n = raster.width * raster.height;
        for (let k = 0; k < n; k++) {
          const val = V.values[k];
          if (missing(val, V.nodata)) { nodataCount++; continue; }
          count++;
          if (min == null || val < min) min = val;
          if (max == null || val > max) max = val;
        }
        out.push({
          name: V.band.name == null ? null : V.band.name,
          unit: V.band.unit == null ? null : V.band.unit,
          nodata: V.nodata,
          min: min, max: max, count: count, nodataCount: nodataCount,
        });
      }
      return { ok: true, bands: out };
    }

    /* ── fromSampler: the grids the app already has ───────────────────────────────────────────── */

    /* THIS IS THE DOOR docs/GIS-CORE.md §6 said was missing. The app's numeric fields are reachable
       as FUNCTIONS — a layer's sampleAt, a DEM snapshot's at(), the pandemic field — never as a grid
       anything could iterate. Burning one into a grid over a stated window at a stated resolution is
       what makes 「この県の平均○○」 askable of it with the same arithmetic as a decoded GeoTIFF, and it
       is also the honest way to put two mismatched grids on one grid for `diff`.
       ⚠ THE RESOLUTION IS THE CALLER'S AND IS RECORDED IN THE GRID. Choosing one here would be a
       constant with no provenance, and it would decide the accuracy of every answer downstream.
       ⚠ SYNCHRONOUS SAMPLERS ONLY. An async field (tiles that must be fetched) is a different
       problem — what is missing, how long to wait, what to report — and pretending to solve it with a
       sampler that returns a promise would fill the grid with objects. `sampler-not-a-function`.
       ⚠ A sampler that answers null, undefined or a non-finite number is answering 「そこには値が
       ない」, and that is written as NaN and counted. It is not turned into 0. */
    /* The grid a sampler will be burnt into, built ONCE for both doors below. ⚠ IT IS SHARED RATHER
       THAN WRITTEN TWICE: `fromSampler` and `fromSamplerAsync` differ only in how they call the
       sampler, and two copies of 「その窓・その解像度・そのバンド宣言はどう格子になるか」 is the
       drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. */
    function samplerGrid(spec) {
      if (!spec || typeof spec !== 'object') return refuse('sampler-spec-invalid');
      const b = spec.bounds;
      if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum)) return refuse('sampler-bounds-invalid', { bounds: b });
      const w = b[0], s = b[1], e = b[2], n = b[3];
      if (!(e > w)) return refuse('sampler-bounds-invalid', { field: 'east<=west', bounds: b });
      if (!(n > s)) return refuse('sampler-bounds-invalid', { field: 'north<=south', bounds: b });
      if (!isInt(spec.width) || spec.width <= 0) return refuse('sampler-size-invalid', { field: 'width', value: spec.width });
      if (!isInt(spec.height) || spec.height <= 0) return refuse('sampler-size-invalid', { field: 'height', value: spec.height });
      if (typeof spec.sample !== 'function') return refuse('sampler-not-a-function');
      const width = spec.width, height = spec.height;
      const cells = width * height;
      let data;
      /* ⚠ NO CEILING IS INVENTED. The allocation itself is the limit — it is what actually fails, and
         it fails with the number of cells in hand — so a number written here would be a constant with
         no observation behind it that would go stale with every engine and machine. */
      try { data = new Float64Array(cells); } catch (err) { return refuse('raster-too-large', { cells: cells }); }
      const grid = { west: w, north: n, pixelLng: (e - w) / width, pixelLat: (n - s) / height };
      const bandSpec = (spec.band && typeof spec.band === 'object') ? spec.band : {};
      const raster = {
        width: width, height: height,
        bands: [{
          name: bandSpec.name == null ? null : bandSpec.name,
          unit: bandSpec.unit == null ? null : bandSpec.unit,
          /* The sampler's own declaration survives if it made one; otherwise null — 「宣言が無い」,
             which is not 「欠損が無い」, and the NaNs written below are missing regardless. */
          nodata: isNum(bandSpec.nodata) ? bandSpec.nodata : null,
        }],
        grid: grid,
        read: (i) => ((i == null ? 0 : i) === 0 ? data : null),
      };
      return { ok: true, raster: raster, data: data, width: width, height: height };
    }

    function fromSampler(spec) {
      const built = samplerGrid(spec);
      if (!built.ok) return built;
      const raster = built.raster, data = built.data, width = built.width, height = built.height;
      let filled = 0, empty = 0, failed = 0;
      for (let row = 0; row < height; row++) {
        const lat = rowCentreLat(raster, row);
        const base = row * width;
        for (let col = 0; col < width; col++) {
          let val;
          /* A sampler that throws on one position has not invalidated the grid — the cell is
             unanswered, which is exactly what a void is — but the count is reported so a caller
             cannot read a grid of NaN as 「そこには何も無い」. */
          try { val = spec.sample(colCentreLng(raster, col), lat); } catch (err) { val = null; failed++; }
          if (isNum(val)) { data[base + col] = val; filled++; }
          else { data[base + col] = NaN; empty++; }
        }
      }
      return { ok: true, raster: raster, filled: filled, empty: empty, failed: failed };
    }

    /* ── fromSamplerAsync: the same door, for a field that answers with a promise ──────────────── */

    /* ⚠ (#R749) THE ASYNC FIELDS HAD NO DOOR AT ALL. `fromSampler` refuses a sampler that returns a
       promise (`sampler-not-a-function` is not even the right sentence for it), so every field this
       app reads through `IntMapLayers.sampleAt` — precipitation, elevation, land cover, the whole
       readout registry — could only be burnt into a grid by a loop written OUTSIDE this file. One such
       loop existed (js/gis-layers.js `toRaster`), it was the only one, and it yielded to the event
       loop ONCE PER ROW. That is the shape docs/GIS-CORE.md §2.6 names: 「刻みの単位は件数ではなく
       時間」. A row of 512 pixels against a cached field is well under a frame and the yield is pure
       overhead; a row of 512 pixels against a field that fetches is tens of seconds during which the
       signal cannot be read, because the code that would set it does not run until the row lets go.

       So the unit here is ELAPSED MILLISECONDS, measured between pixels, and the signal is read at the
       same place. ⚠ THERE IS NO CHUNK SIZE TO TUNE and no per-layer constant.
       ⚠ AND THIS IS NOT A BULK DOOR. `IntMapLayers` has exactly one entrance — one position, one
       answer — so a `sampleRegion(positions)` parameter here would be an export with no caller
       (docs/GIS-CORE.md §5.1 records what this project pays for those). What makes the read
       REGION-shaped is that the caller states a window and a resolution and gets a grid back; what is
       async is one pixel at a time, honestly. */
    async function fromSamplerAsync(spec) {
      const built = samplerGrid(spec);
      if (!built.ok) return built;
      const raster = built.raster, data = built.data, width = built.width, height = built.height;
      const o = spec || {};
      const sig = o.signal || null;
      const onp = (typeof o.onProgress === 'function') ? o.onProgress : null;
      const total = width * height;
      let filled = 0, empty = 0, failed = 0, done = 0, last = nowMs();
      /* The first non-numeric answer, kept so a caller can say WHAT the layer replied with. A field
         that answers 「12 °C」 has values — it just does not have them as numbers — and that is a
         different thing to fix than a field that answers nothing. */
      let textSeen = null;
      for (let row = 0; row < height; row++) {
        const lat = rowCentreLat(raster, row);
        const base = row * width;
        for (let col = 0; col < width; col++) {
          if (sig && sig.aborted) return Object.assign(cancelled(done, total), { detail: { done: done, total: total, rows: row, of: height } });
          let val, threw = false;
          try { val = await o.sample(colCentreLng(raster, col), lat); } catch (err) { val = null; failed++; threw = true; }
          if (isNum(val)) { data[base + col] = val; filled++; }
          else {
            data[base + col] = NaN;
            /* ⚠ (#R763) `failed` AND `empty` ARE DISJOINT. A pixel that threw used to be counted in
               both, so 「答えたが値が無かった画素」 could not be read off the pair at all — and a
               caller deciding whether a window is real NoData or a broken upstream needs exactly
               that difference (js/gis-sources.js region() splits its refusal on it). */
            if (!threw) empty++;
            if (textSeen == null && val != null && val !== '') textSeen = String(val);
          }
          done++;
          const t = nowMs();
          if (t - last >= FRAME_MS) {
            last = t;
            /* `rows`/`of` are the keys js/gis-panel.js's progress line already reads; `done`/`total`
               are the pixel-exact pair, because a yield now falls in the middle of a row. */
            if (onp) { try { onp({ rows: Math.floor(done / width), of: height, done: done, total: total, read: filled }); } catch (_) { } }
            /* one turn of the event loop: the camera, the renderer and the stop button are all on
               this thread (docs/GIS-CORE.md §2.6 — a Worker would add parallelism, not this) */
            await new Promise((res) => setTimeout(res, 0));
          }
        }
      }
      if (sig && sig.aborted) return Object.assign(cancelled(done, total), { detail: { done: done, total: total, rows: height, of: height } });
      if (onp) { try { onp({ rows: height, of: height, done: done, total: total, read: filled }); } catch (_) { } }
      return { ok: true, raster: raster, filled: filled, empty: empty, failed: failed, textSeen: textSeen };
    }

    /* ⚠⚠⚠ THE VERSION OF THIS KERNEL, AND IT WAS MISSING FROM THE ROUND THAT INVENTED VERSIONS
       (#R752). js/gis-project.js does not save a grid's numbers — it saves the RECIPE and replays it,
       so what the reader sees the next time they open the project is whatever THIS file computes
       then. And this file is where the answers are decided, not merely carried: the interpolation
       rule for `sample` (bilinear that refuses to blend a void, Keys a = −0.5 for cubic), the
       area weighting of `zonal`'s mean, what `diff`/`combine` do when one side is missing,
       `merge`'s overlap rules, `polygonize`'s 4-connectivity and ring orientation. Change any one of
       them and a replayed recipe lands on different numbers under the same name — which is exactly
       what a version exists to make visible.
       #R749 built the version mechanism (js/gis-ops.js `ops-1`, js/gis-geometry.js `geom-1`) in the
       same round it built this file, and this file did not get one: the recipe recorded which
       geometry engine answered and said nothing about which grid arithmetic did.
       ⚠ scripts/gis-kernel-versions.mjs holds the sha256 that keeps this honest — a bump written
       without touching the arithmetic, or arithmetic touched without a bump, is what it measures. */
    /* (#R783) raster-3 -> raster-4: A REPLAYED ZONAL STEP LANDS ON A DIFFERENT NUMBER, and that is
       the one thing this version exists to announce. `coverOf` used to read 「四隅と中心が区域内」 as a
       proof that the pixel was wholly inside, which is false of every concave zone — a slot 0.2° wide
       and 0.4° deep in a 1° pixel was reported as cover 1 where the sphere says 0.9200039. Every
       `fractional` and `allTouched` answer over a notched, bayed or holed zone therefore moves:
       areaKm2, sumTimesAreaKm2, mean and the class areas. ⚠ `center` is untouched — it never asked
       for a cover — and a project saved with the default replays to the same numbers as before. */
    const KERNEL_VERSION = 'raster-4';

    const API = {
      /* see KERNEL_VERSION above — js/gis-project.js records which kernel answered */
      version: () => KERNEL_VERSION,
      /* ⚠ (#R783) THE VOCABULARY OF `total` IS PUBLISHED BECAUSE A PANEL HAS TO OFFER IT. `zonal`
         already refuses an unknown rule BY NAME and hands back the list with the refusal, but a
         refusal is not an offer: without this door `js/gis-ops.js`'s `valuesOf:'total-rules'` had
         nothing to ask, so the choice existed and no reader could reach it (#R751's shape — a
         capability nobody describes is a capability Atlas answers "there is none" about).
         ⚠ Derived from TOTAL_RULES itself, so a rule added there appears here the same day. */
      totalRules: () => TOTAL_RULE_NAMES.slice(),
      validate,
      bboxOf, pixelAreaKm2, sample, zonal, mask, diff, describeBands, fromSampler, fromSamplerAsync,
      /* (#R752) the arithmetic js/gis-ops.js's rasterCalc / mosaic / rasterize / polygonize run on.
         ⚠ `polygonize` is ALWAYS ASYNC (it walks the grid three times and keeps its own phases).
         ⚠ (#R756) `combine` / `merge` — and `mask` / `diff` / `zonal` above — answer SYNCHRONOUSLY
         when no ctx is handed over and with a PROMISE when one is, which is `paced`'s contract and
         not a per-function choice: see its note. `build` has no walk. */
      build, combine, merge, polygonize,
      /* ⚠ (#R749) PUBLISHED BECAUSE TWO OTHER FILES ASK THE SAME TWO QUESTIONS PER PIXEL. js/map-ui.js
         burns a grid onto a canvas and has to ask 「このセルは欠損か」 for every one of them, and
         js/gis-sources.js hands a band's values to a caller; both would otherwise spell the rule a
         second time, and the second spelling is always the one that forgets that ±Infinity is not a
         measurement. The meaning is unchanged — these are the private functions, exposed. */
      missing, values,
      /* the one frame budget this layer has (see FRAME_MS), so a caller staying interruptible does
         not write the number a second time */
      frameMs: () => FRAME_MS,
      /* (#R756) ⚠ THE WALK ITSELF, PUBLISHED BECAUSE js/gis-warp.js WALKS PIXELS TOO. That file had
         the ctx reader spelled a second time and paced ONCE PER OUTPUT ROW — a count, not a duration
         — and its cancellation carried `detail.done` only, so the top-level pair js/gis-ops.js
         reports was missing from exactly the runs that took long enough to be stopped. Three
         divergences from one loop being written twice; now there is one loop. */
      useCtx, cancelled, paced,
      /* exposed because js/gis-datasets.js describes a grid to the panel with the same numbers, and
         a second walk of the same arithmetic there is how the two would disagree */
      pixelAt, rowCentreLat, colCentreLng,
      /* the condition vocabulary this file accepts, so a UI can offer it without a hand-written list
         (docs/GIS-CORE.md §2.1: 「宣言を読むのは UI の仕事、持つのは op の仕事」) */
      conditionOps: () => CONDITION_OPS.slice(),
      /* the same reason, for `merge`: the rule is REQUIRED, so whoever asks the reader for one has to
         be able to read the list rather than keep a hand-written copy that falls behind this one */
      mergeOverlaps: () => MERGE_OVERLAPS.slice(),
      sampleMethods: () => SAMPLE_METHODS.slice(),
      /* ⚠ THE SAME LIST, WITH WHAT EACH ENTRY IS — so a reader that has to behave differently for a
         point method and an areal one (a UI asking for a footprint, an op that samples at a point and
         therefore cannot offer the areal ones) reads `kind` instead of keeping its own list of which
         names are which. Both come off ONE table, so neither can fall behind the other. */
      sampleMethodFacts: () => SAMPLE_METHODS.map((id) => Object.assign({ id: id }, SAMPLE_METHOD_FACTS[id])),
      /* ⚠ (#R819) THE FORMS A FOOTPRINT MAY ARRIVE IN, for the same reason the methods are
         published: js/gis-warp.js decides whether it can offer an EXACT footprint by reading this,
         not by assuming that the kernel it is loaded beside is the one that grew the polygon path.
         A build whose raster kernel is older answers without `ring` and the warp says so by name. */
      sampleCellForms: () => SAMPLE_CELL_FORM_IDS.map((id) => Object.assign({ id: id }, SAMPLE_CELL_FORMS[id])),
    };
    try { window.IntMapGisRaster = API; } catch (_) { }
    return API;
  })();
}
