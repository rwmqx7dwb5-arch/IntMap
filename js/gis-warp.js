/* ============================================================================
 *  IntMap · THE WARP — window.IntMapGisWarp   (#R749)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §1.4 and §6 state the hole this file fills, and they state it as a REFUSAL:
 *  「格子が違えば `grid-mismatch` で拒む——再標本化は**選択**であって、差分の中で黙って行えば全画素が
 *  誰も名づけていない補間の合成になる」. That refusal was and is correct — but it left the reader with
 *  nowhere to go. IntMap's rasters were EPSG:4326 grids only, a difference was possible only between
 *  two grids that already agreed, and a GeoTIFF in a projected grid could be READ and not USED.
 *  The vectors had a re-projection since #R732 (js/gis-crs.js); the grids had none.
 *
 *  This is the role GDAL's warp plays: coordinate system, resolution, extent, resampling and NoData
 *  handled as ONE layer, so that `grid-mismatch` becomes 「put them on one grid first, HERE, where the
 *  choice is written down」 instead of a dead end.
 *
 *  ══ ⚠⚠⚠ `method` IS REQUIRED. THERE IS NO DEFAULT INTERPOLATION ════════════════════════════════
 *  The single most consequential thing a warp does is decide what a pixel between two pixels is
 *  worth, and that decision changes the ANSWER — a bilinear 「4」 between land-cover classes 3 and 5
 *  is a third class nobody observed, and a nearest-neighbour elevation is a step function a slope
 *  calculation will read as cliffs. Choosing one here would be exactly the thing §1.4 refuses for
 *  `diff`: 「誰も名づけていない補間の合成」, only with a shorter call site. So a caller that did not
 *  say is answered `resample-method-not-stated` and nothing is produced.
 *  ⚠ AND A CLASSIFICATION IS NOT INTERPOLATED AT ALL. A band that declares `categorical:true` is
 *  refused for every method that does not declare `categoricalSafe` — `bilinear-on-categorical`,
 *  whose spelling is historical and whose detail names the method actually asked for. ⚠ But being an
 *  integer is NOT evidence of being a classification — a population count is an integer — so nothing
 *  here GUESSES: a band that does not declare itself categorical is warped the way the caller asked,
 *  and the refusal exists for the bands whose producer said what they are.
 *
 *  ══ ⚠⚠⚠ POINT METHODS AND AREAL METHODS RUN DIFFERENTLY, AND THE DIFFERENCE IS READ, NOT WRITTEN ══
 *  js/gis-raster.js declares each method's `kind`. A POINT method (`nearest`, `bilinear`, `cubic`)
 *  needs one position per output pixel — its centre, taken back through the projection. An AREAL one
 *  (`average`, `mode`, `sum`) needs the FOOTPRINT that output pixel covers, so this file takes the
 *  pixel's four CORNERS back as well and hands the box that holds them over as `opts.cell`; the box
 *  errs outward, which is the only direction a footprint may err. Downsampling is where that matters:
 *  a 30 m land cover onto a 1 km grid with `nearest` answers from one point in a million m², `mode`
 *  answers with the class that covers the ground, and `sum` keeps a population total intact.
 *  ⚠ An areal weight is GROUND AREA, so the kernel must know what latitude each source row stands
 *  for — which the pixel-space proxy below does not carry. It is measured through the projection
 *  (once per source row, at the grid's middle column) and declared as `grid.latAxis`; see `runWarp`.
 *  ⚠ `report.incomplete` is NOT `report.partial`: partial is an interpolation that was abandoned at a
 *  void, incomplete is an aggregate that was carried out over a footprint only partly observed.
 *
 *  ══ ⚠⚠⚠ THE VOID RULE IS NOT COPIED HERE — IT IS ASKED OF js/gis-raster.js ════════════════════
 *  「bilinear で 4 隅のどれかが NaN なら nearest に落ちて partial を数える」 is that file's rule, with
 *  that file's measurement behind it: a terrarium void blended with three real corners reported Lake
 *  Biwa at −7,800.7 m against a spill of 81 m (js/map-readout.js). A second implementation of it here
 *  would be the drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids, and it would be the copy
 *  that quietly loses the rule. So every value this file produces comes out of
 *  `IntMapGisRaster.sample`, and the way that is arranged is the one non-obvious thing below:
 *
 *    THE SOURCE IS READ THROUGH A PIXEL-SPACE PROXY. `sample` takes degrees and turns them into
 *    pixel indices; a projected or rotated source has no degrees to give it. So the proxy declares
 *    `{west:0, north:0, pixelLng:1, pixelLat:1}` — a grid whose 「lng」 IS the fractional column and
 *    whose 「lat」 is the negated fractional row — and this file does the affine inverse itself. The
 *    arithmetic inside `sample` (floor for the owning pixel, −0.5 for the centre offset, the four
 *    surrounding centres, the void rule, the edge clamp) is index arithmetic that never looks at a
 *    latitude, so it is the same answer, unchanged, with the rule where it belongs.
 *
 *  ══ INVERSE MAPPING, BECAUSE A FORWARD ONE LEAVES HOLES ═══════════════════════════════════════
 *  Every output pixel centre is taken back through 4326 into the source grid and asked what is
 *  there. Scattering source pixels forward instead leaves unwritten pixels wherever the output is
 *  finer than the source — holes that look exactly like NoData and are not.
 *
 *  ══ WHAT IS COUNTED, BECAUSE 「描けた」 IS NOT 「答えられた」 ═══════════════════════════════════
 *  `report` separates the three ways an output pixel can have no value, which the picture cannot:
 *  `clipped` (the position is not on the source grid at all), `missing` (it is, and the source has no
 *  value there), `failed` (the coordinate transform itself did not answer). `partial` counts the
 *  bilinear samples that fell back to nearest — the reader who needs an uncontaminated interpolation
 *  needs that number, and it is 0 for a nearest warp by construction.
 *
 *  ══ CANCELLATION AND PACING ARE HANDED IN, NOT REINVENTED ═════════════════════════════════════
 *  docs/GIS-CORE.md §2.6: 「刻みの単位は件数ではなく時間」, and js/gis-ops.js `makeCtx` is where that
 *  judgement lives — 16 ms, yield, report, re-read the signal. This file takes that ctx through
 *  `opts.ctx`. ⚠ A caller that hands over no ctx gets a run that cannot be stopped; that is stated
 *  rather than papered over, and it is why the panel and js/gis-ops.js always pass theirs.
 *  ⚠⚠⚠ (#R756) AND THE OUTPUT PIXELS ARE WALKED BY js/gis-raster.js `paced`, NOT BY A LOOP WRITTEN
 *  HERE. Until #R756 this file kept its own loop and ticked ONCE PER OUTPUT ROW — which is a COUNT,
 *  and one row is 40 pixels on one grid and 40,000 on another, so the budget stated in milliseconds
 *  was being spent in a unit that means a different duration every time. Writing the loop twice had
 *  also let the two files disagree about the shape of a cancellation. One loop, one ctx reader, one
 *  `cancelled(done,total)` — all three from the kernel this file already depends on.
 *
 *  ══ ⚠⚠⚠ (#R819) THE BUDGET COVERS THE OUTPUT TOO, AND A WINDOW IS HOW IT CAN ══════════════════
 *  #R783 bounded the geometry that crosses the thread boundary and nothing else, so the OUTPUT —
 *  W·H·bands float64, alive for the whole run — was still allocated whole before the first block was
 *  planned. 4096² is 128 MiB per band and 512 MiB for four, beside a decoded source of the same
 *  order: the budget was being spent on the smaller half of the residency.
 *  So `runWarp` MEASURES what it will hold and separates two kinds of it. FIXED is what the caller
 *  settled before the warp began — the decoded source this file caches, the measured latitude axis,
 *  the corner rows an areal walk reuses — and it is reported, never used to shrink anything else.
 *  CHOOSABLE is the geometry block and, when a caller offered a SINK, the output WINDOW; both cost
 *  bytes per output ROW, so one row count sizes both and the plan spends the budget across them.
 *  ⚠ THE BUDGET IS NOT A CAP ON WORK (CONSTITUTION.md §5). An output too large for the whole budget
 *  with nowhere to stream it is not refused and does not shrink the blocks to one row — it is
 *  reported (`report.memory.overBudget`, with the reason), and the road out is `opts.sink`.
 *  ⚠ THE NUMBER ITSELF IS NOT WRITTEN HERE: js/gis-worker.js owns it (`budgetBytes()`), and this
 *  file reads the caller's figure or that canon — see `budgetOf`.
 *
 *  ══ ⚠⚠⚠ (#R819) AN OUTWARD-ERRING BOX IS A PREFILTER, NOT AN AREA ═══════════════════════════════
 *  The note above says the footprint box 「errs outward, which is the only direction a footprint may
 *  err」. That is true of a box used to FIND candidate pixels and false of one used to WEIGH them:
 *  under a rotation or a projection the true footprint is not a rectangle, and the box that holds it
 *  covers ground the output pixel does not — so an `average` weighted by the box averages over
 *  ground nobody asked about and a `sum` apportions a total across it. Nothing measured how much.
 *  Now two things do. ① In `box` mode every areal pixel's four corners give a quadrilateral whose
 *  area is compared with the box's, and the WORST excess over the grid is reported with the pixel
 *  that produced it (0 everywhere for a north-up resample, by construction). ② `opts.footprint:
 *  'exact'` with `opts.footprintTolerance` (in SOURCE PIXELS) builds the footprint as a RING —
 *  edges subdivided until the true image of a midpoint is within the tolerance of the chord, shared
 *  between the pixels either side so the footprints TILE — and hands it to js/gis-raster.js, which
 *  cuts it against one source pixel at a time (`sampleCellForms`). ⚠ The default is `box` and it is
 *  bit-for-bit the warp this file has always run; `exact` is a decision, with its cost and its
 *  promise stated, and a promise that cannot be kept is a refusal rather than a quiet approximation.
 *  ⚠ AND THE ROW LATITUDES ARE AN APPROXIMATION TOO — one measurement per row at the middle column.
 *  Its error is measured against the two outer columns and reported as a bound on the WEIGHTS
 *  (`report.footprint.latAxis`); `opts.areaTolerance` turns that measurement into a promise.
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES (docs/GIS-CORE.md §2.2) — `{ ok:false, why, detail }`, and the
 *  nine languages live at the call site. ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③), and
 *  window.* is read at CALL time, so this module loads in Node with no DOM and answers
 *  `raster-unavailable` / `crs-unavailable` by name instead of throwing.
 * ==========================================================================*/

export function makeGisWarp() {
  return (function () {

    /* ── what is borrowed, read at call time ──────────────────────────────────────────────────── */

    function RAS() { try { return (typeof window !== 'undefined' && window.IntMapGisRaster) || null; } catch (_) { return null; } }
    function CRS() { try { return (typeof window !== 'undefined' && window.IntMapGisCrs) || null; } catch (_) { return null; } }

    const WGS84 = 'EPSG:4326';

    function refuse(why, detail) { return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail }; }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function isInt(v) { return isNum(v) && Math.floor(v) === v; }

    /* ── numbers, with their observation ──────────────────────────────────────────────────────── */

    /* A count of pixels that comes out at 1023.9999999997 is 1024, not 1025. THE OBSERVATION: the
       span it was divided by has been through a decimal header (a GeoTIFF tag, an ASCII-grid corner,
       a JSON bounds) and float64 carries ~15–16 significant digits, so the quotient differs from its
       integer by ~1e-12 relative at worst. A millionth of a pixel is orders of magnitude above that
       noise and orders of magnitude below a real extra row.
       THE CANON is js/gis-raster.js `GRID_EPS_FRAC` — the same fact (「a millionth of a pixel is
       noise」) about the same grids. It is restated rather than imported because that file keeps it
       private; if it ever publishes it, this constant is the one to delete.
       EXPIRES the day a producer hands over a span genuinely a millionth of a pixel short of a whole
       one, at which point the grid is one pixel smaller and this rounds the wrong way by one pixel. */
    const COUNT_EPS = 1e-6;

    function pixelCount(span, size) {
      const n = span / size;
      if (!isNum(n) || n <= 0) return null;
      const r = Math.round(n);
      return (Math.abs(n - r) <= COUNT_EPS && r >= 1) ? r : Math.ceil(n);
    }

    /* Two consecutive samples one pixel apart cannot really be more than half a world apart in
       longitude — the same seam fact js/gis-geometry.js unwraps rings with. So a jump past 180° is
       the antimeridian and is undone, and the extent below is taken on the unwrapped numbers. */
    function unwrapTo(prev, lng) {
      let v = lng;
      while (v - prev > 180) v -= 360;
      while (prev - v > 180) v += 360;
      return v;
    }

    /* ── the resampling methods, DECLARED (docs/GIS-CORE.md §2.1) ─────────────────────────────── */

    /* ⚠ THE ID SET IS NOT WRITTEN HERE. js/gis-raster.js `sampleMethods()` is what a value can
       actually be taken with, so that is the list, and this table only says what each one MEANS. A
       method that appears there with no entry here is reported as `stated:false` rather than
       dropped — a hand-kept list that silently loses the next entry is the photograph
       .agents/rules/no-ad-hoc-hardcoding.md §2-4 forbids, and a UI can show 「説明が無い」.
       ⚠ AND `kind` IS NOT WRITTEN HERE EITHER. Whether a method asks about a POINT or about the
       AREA an output pixel covers is a fact about the arithmetic, which lives in the kernel; this
       file carries it through so a UI reads one declaration. */
    const METHOD_FACTS = {
      nearest: {
        neighbours: 1, interpolates: false,
        /* The output value is one of the input values, unchanged — which is the whole of why a
           classification can be warped at all. */
        preservesValues: true, categoricalSafe: true, voidPolicy: 'value-or-missing',
      },
      bilinear: {
        neighbours: 4, interpolates: true,
        preservesValues: false, categoricalSafe: false,
        /* The rule js/gis-raster.js owns and this file asks for: a void among the four corners
           abandons the blend and falls back to nearest, saying so. */
        voidPolicy: 'nearest-fallback',
      },
      cubic: {
        neighbours: 16, interpolates: true,
        preservesValues: false, categoricalSafe: false,
        voidPolicy: 'nearest-fallback',
        /* ⚠ Keys' kernel has NEGATIVE outer weights, so a cubic value can lie outside the range of
           the 16 values it came from — the overshoot at a step. Declared rather than clamped away,
           because a reader asking 「なぜ標高が −3 m になった」 needs the method to have said so. */
        overshoots: true,
      },
      average: {
        interpolates: true, preservesValues: false, categoricalSafe: false,
        /* The areal void rule: a missing input pixel is left OUT of the aggregate (never read as 0),
           and `coverage` says how much of the footprint had an answer. */
        voidPolicy: 'skip-voids', needsFootprint: true,
      },
      mode: {
        interpolates: false,
        /* The output is one of the input values — the class covering the most ground — which is why
           this is the method a classification is DOWNsampled with. */
        preservesValues: true, categoricalSafe: true,
        voidPolicy: 'skip-voids', needsFootprint: true,
      },
      sum: {
        interpolates: false, preservesValues: false, categoricalSafe: false,
        voidPolicy: 'skip-voids', needsFootprint: true,
        /* What makes it different from `average` in one word: the quantity, not the level. Each
           source pixel is apportioned by the fraction of itself the output pixel covers, so a set of
           output pixels tiling the source adds up to the source's total (人口・件数). */
        conserves: 'total',
      },
    };

    function methods() {
      const R = RAS();
      /* ⚠ null, not [] — 「訊けなかった」 and 「0 件だった」 must not be one answer. */
      if (!R || typeof R.sampleMethodFacts !== 'function') return null;
      /* The kernel's statement goes on LAST and is unoverwritable: what a method IS (`id`, `kind`,
         how many neighbours it reads) is the kernel's to say, and what it MEANS is this file's. */
      return R.sampleMethodFacts().map((k) => {
        const f = METHOD_FACTS[k.id];
        return Object.assign({ stated: !!f }, f || {}, k);
      });
    }

    /* Point or areal, asked of the kernel once per warp rather than kept here — the branch below is
       「この方式は何を訊くものか」 read off a declaration, not a list of names written by hand. */
    function kindOf(method) {
      const R = RAS();
      if (!R || typeof R.sampleMethodFacts !== 'function') return null;
      const f = R.sampleMethodFacts().filter((m) => m.id === method)[0];
      return f ? f.kind : null;
    }

    /* ── the affine: where a pixel is ─────────────────────────────────────────────────────────── */

    /* GDAL's GeoTransform order, which is what every decoder in reach produces and what a .tfw
       writes: [c, a, b, f, d, e] with
            x = c + a·px + b·py
            y = f + d·px + e·py
       and (px, py) CONTINUOUS pixel coordinates whose origin is the top-left CORNER of pixel (0,0),
       so a pixel centre is at (col + 0.5, row + 0.5). `b` and `d` are the rotation terms; they are
       zero for every north-up grid and are carried through the arithmetic below rather than refused,
       because the inverse is written out and costs nothing.
       ⚠ A grid that states no affine but states the raster contract's `grid:{west,north,pixelLng,
       pixelLat}` (docs/GIS-CORE.md §1.4) is describing a north-up 4326 grid, and that IS an affine —
       derived here so the two producers this layer has do not need to agree on which field to fill. */
    function affineOf(g) {
      const a = (g && Array.isArray(g.affine)) ? g.affine : null;
      if (a != null) {
        if (!Array.isArray(a) || a.length !== 6 || !a.every(isNum)) return refuse('affine-invalid', { affine: a });
        const det = a[1] * a[5] - a[2] * a[4];
        /* A singular affine puts every pixel on one line: it is not a grid, and an inverse of it
           would produce infinities that read downstream as 「outside」. */
        if (!isNum(det) || det === 0) return refuse('affine-singular', { affine: a.slice() });
        return { ok: true, affine: a.slice(), det: det };
      }
      /* ⚠ (#R749) THE THIRD SPELLING, AND WHY IT IS CONVERTED HERE AND NOT AT THE CALL SITE.
         js/gis-geotiff.js publishes what the FILE said: model.transform is the GeoTIFF
         ModelTransformation (a 4x4 in row-major order), and its own affine{} is a north-up
         DESCRIPTION derived from it — dx/dy are magnitudes, so for a rotated file the description
         has already dropped the rotation it reports in `rotated`. Reading the matrix first is what
         keeps a rotated grid from being warped as if it were axis-aligned, which would be a wrong
         answer delivered quietly. One converter, in the module that owns 「a grid IS an affine」;
         a conversion written at each call site is how the readers would come to disagree. */
      const tr = g && g.model && g.model.transform;
      if (Array.isArray(tr) && tr.length >= 16 && tr.slice(0, 8).every(isNum)) {
        const aff = [tr[3], tr[0], tr[1], tr[7], tr[4], tr[5]];
        const det = aff[1] * aff[5] - aff[2] * aff[4];
        if (!isNum(det) || det === 0) return refuse('affine-singular', { affine: aff });
        return { ok: true, affine: aff, det: det };
      }
      const o = g && g.affine;
      if (o && typeof o === 'object' && !Array.isArray(o) && isNum(o.x0) && isNum(o.y0) && isNum(o.dx) && isNum(o.dy)) {
        /* A descriptor that says it is rotated, with no matrix to say HOW, cannot be honoured: the
           magnitudes alone place every pixel wrong. Refused by name rather than straightened. */
        if (o.rotated === true) return refuse('affine-invalid', { affine: o, reason: 'rotated-without-transform' });
        if (!(o.dx > 0) || !(o.dy > 0)) return refuse('affine-invalid', { affine: o });
        const aff = [o.x0, o.dx, 0, o.y0, 0, -o.dy];
        return { ok: true, affine: aff, det: aff[1] * aff[5] };
      }
      const q = g && g.grid;
      if (q && isNum(q.west) && isNum(q.north) && isNum(q.pixelLng) && isNum(q.pixelLat) && q.pixelLng > 0 && q.pixelLat > 0) {
        const aff = [q.west, q.pixelLng, 0, q.north, 0, -q.pixelLat];
        return { ok: true, affine: aff, det: aff[1] * aff[5] };
      }
      return refuse('affine-missing');
    }

    function fwd(A, px, py) { return [A[0] + A[1] * px + A[2] * py, A[3] + A[4] * px + A[5] * py]; }

    /* ⚠⚠⚠ (#R783) THE TWO FUNCTIONS BELOW ARE THE ONES THAT TRAVEL, and they are written as plain
       arithmetic over their arguments FOR THAT REASON. js/gis-worker.js `provide()` ships a
       function's own source text into the other thread, where it is rebuilt in a scope that holds
       nothing of this module — so a helper that closed over `A`, over `det`, or over any name here
       could not go, and a helper written out a second time inside a job would be the same rule with
       two owners (.agents/rules/no-ad-hoc-hardcoding.md §2-3). These take everything they need.
       ⚠ AND THEY ARE NOT A SECOND SPELLING OF THE INVERSE: `makeInverse` below calls this one, so
       the pixel coordinate this thread computes and the pixel coordinate the worker computes come
       out of the same bytes. tests/r783 measures the two outputs byte for byte. */
    function invAt(A, det, x, y) {
      const dx = x - A[0], dy = y - A[3];
      return [(A[5] * dx - A[2] * dy) / det, (-A[4] * dx + A[1] * dy) / det];
    }

    /* The box that holds an output pixel's four corners, in the pixel-space proxy's coordinates:
       「lng」 is the fractional column and 「lat」 is the NEGATED fractional row (header), so north
       and south are the negated minimum and maximum row. ⚠ IT ERRS OUTWARD — a projected
       quadrilateral is not a rectangle in the source's pixel space — and outward is the only
       direction a footprint may err (see the note in `runWarp`). A corner that did not transform
       arrives as NaN and every bound becomes NaN with it, which is how 「footprint unknown」 stays
       distinguishable from 「footprint empty」. */
    function boxOf(ax, ay, bx, by, cx, cy, dx, dy) {
      return [
        Math.min(ax, bx, cx, dx), -Math.max(ay, by, cy, dy),
        Math.max(ax, bx, cx, dx), -Math.min(ay, by, cy, dy),
      ];
    }

    function makeInverse(A, det) {
      return function (x, y) { return invAt(A, det, x, y); };
    }

    /* ── the source, prepared once ────────────────────────────────────────────────────────────── */

    /* ⚠ THE BANDS ARE READ UP FRONT AND CACHED. `read(bandIndex)` may DECODE (that is why
       js/gis-raster.js split `sampleWith` out of `sample`), and this file calls `sample` once per
       pixel per band — so without a cache a 512×512 warp would decode a quarter of a million times.
       The cache is the proxy's own `read`, so js/gis-raster.js still measures the length of every
       band against width·height and still names `read-failed` / `read-length-mismatch` itself. */
    function prepareSource(g, opts) {
      if (!g || typeof g !== 'object') return refuse('raster-invalid', { field: 'raster' });
      if (!isInt(g.width) || g.width <= 0) return refuse('raster-invalid', { field: 'width', value: g.width });
      if (!isInt(g.height) || g.height <= 0) return refuse('raster-invalid', { field: 'height', value: g.height });
      if (!Array.isArray(g.bands) || !g.bands.length) return refuse('raster-invalid', { field: 'bands' });
      if (typeof g.read !== 'function') return refuse('raster-invalid', { field: 'read' });

      const aff = affineOf(g);
      if (!aff.ok) return aff;

      const method = (opts && opts.method != null) ? String(opts.method) : null;
      /* ⚠ THE HEADER'S FIRST RULE. Not defaulted, not inferred from the band, not 'nearest because
         that is safest' — a warp whose interpolation nobody named is a warp nobody can read back. */
      if (!method) return refuse('resample-method-not-stated', { methods: (methods() || []).map((m) => m.id) });
      const R = RAS();
      /* ⚠ (#R756) `paced` / `useCtx` / `cancelled` ARE PART OF WHAT THIS FILE NEEDS FROM THE KERNEL,
         so a build whose raster kernel does not carry them is refused BY NAME here instead of
         throwing halfway through a warp — or, worse, running a warp that silently cannot be stopped
         because the ctx reader came back undefined. */
      if (!R || typeof R.sample !== 'function' || typeof R.sampleMethods !== 'function'
        || typeof R.paced !== 'function' || typeof R.useCtx !== 'function' || typeof R.cancelled !== 'function') return refuse('raster-unavailable');
      if (R.sampleMethods().indexOf(method) < 0) return refuse('resample-method-unknown', { method: method, methods: R.sampleMethods() });

      /* ⚠ THE REFUSAL FOLLOWS FROM THE DECLARATION, NOT FROM THE METHOD'S NAME. `categoricalSafe` is
         the fact — 「出力値は入力値のどれかである」 — and every method that is not that one destroys a
         classification in the same way: bilinear blends classes 3 and 5 into a 4 nobody observed,
         cubic does it with a wider kernel and an overshoot on top, an average of class codes is
         arithmetic on names, and a sum of them is a total of names. `nearest` and `mode` survive it,
         and `mode` is the one that exists FOR it.
         ⚠ A method this file cannot describe is treated as unsafe: 「説明が無い」 is not evidence that
         classes survive it, and the cost of being wrong that way is a made-up class map.
         ⚠ THE CODE IS `bilinear-on-categorical` FOR ALL OF THEM, and that spelling is historical —
         bilinear was the first method to meet the fact. It is ONE fact and therefore one code (the
         call sites in js/map-ui.js and js/gis-panel.js translate it as one sentence), and the detail
         names the method actually asked for. */
      const mf = METHOD_FACTS[method];
      if (!mf || mf.categoricalSafe !== true) {
        for (let i = 0; i < g.bands.length; i++) {
          const b = g.bands[i] || {};
          /* ⚠ DECLARED, not deduced. Integer values are not evidence — a household count is an
             integer and its average IS meaningful. Only a producer's own statement refuses. */
          if (b.categorical === true) return refuse('bilinear-on-categorical', { bandIndex: i, name: b.name == null ? null : b.name, method: method });
        }
      }

      /* ⚠ 'point' or 'areal' decides whether every output pixel needs a FOOTPRINT computed for it
         (runWarp), and a method the kernel offers without saying which it is cannot be run: the two
         calls are shaped differently and guessing one would silently sample a point where the caller
         asked about an area. It is refused as UNKNOWN rather than under a code of its own, because
         that is what it is from here — a name this build cannot take a value with — and the reader's
         sentence for it is already written. */
      const kind = kindOf(method);
      if (kind !== 'point' && kind !== 'areal') return refuse('resample-method-unknown', { method: method, methods: R.sampleMethods(), reason: 'kind-not-stated' });

      /* ⚠ (#R819) THE FOOTPRINT'S SHAPE IS THE CALLER'S AND IT IS CHECKED BEFORE ANYTHING IS READ,
         so a warp that cannot keep the promise it was given costs no decode. */
      const fp = footprintPlan(R, opts, kind, method);
      if (!fp.ok) return fp;
      let areaTolerance = null;
      if (opts && opts.areaTolerance != null) {
        if (!isNum(opts.areaTolerance) || !(opts.areaTolerance > 0)) return refuse('warp-area-tolerance-invalid', { areaTolerance: (typeof opts.areaTolerance === 'number') ? opts.areaTolerance : null });
        areaTolerance = opts.areaTolerance;
      }

      const cache = [];
      /* ⚠ (#R819) AND WHAT THE CACHE COSTS IS MEASURED HERE, where the arrays are in hand. It is the
         largest FIXED term in the residency `runWarp` reports — a decoded 4096² float64 band is
         128 MiB and it is held for the whole warp — and a number nobody measured is why the budget
         was being spent on the geometry alone. ⚠ A band that is a plain Array has no byteLength; 8
         bytes per member is what a Float64Array of the same values would cost, which is the number
         the reader is comparing against a budget. */
      let sourceBytes = 0;
      for (let i = 0; i < g.bands.length; i++) {
        try { cache[i] = g.read(i); } catch (e) { return refuse('read-failed', { bandIndex: i, error: String((e && e.message) || e) }); }
        const v = cache[i];
        if (v && typeof v.byteLength === 'number') sourceBytes += v.byteLength;
        else if (v && typeof v.length === 'number') sourceBytes += v.length * 8;
      }
      const proxy = {
        width: g.width, height: g.height,
        bands: g.bands,
        /* The pixel-space grid described in the header: 「lng」 is the fractional column, 「lat」 is
           the negated fractional row, so `pixelAt`'s floor and the bilinear −0.5 are the source's own
           index arithmetic and nothing in js/gis-raster.js has to know about a projection. */
        grid: { west: 0, north: 0, pixelLng: 1, pixelLat: 1 },
        read: (i) => cache[(i == null) ? 0 : i],
      };
      return {
        ok: true,
        raster: g, proxy: proxy, method: method, kind: kind, R: R,
        /* `det` travels with the affine because the worker needs both to rebuild the same inverse
           (see `invAt`), and recomputing it there would be a second place that decides what
           singular means. */
        affine: aff.affine, det: aff.det, inverse: makeInverse(aff.affine, aff.det),
        bandCount: g.bands.length,
        sourceBytes: sourceBytes, footprint: fp.plan, areaTolerance: areaTolerance,
      };
    }

    /* ── (#R819) which footprint the caller asked for ─────────────────────────────────────────── */

    /* ⚠ `box` IS THE DEFAULT AND IT IS NOT A GUESS — it is what every warp has done since #R749 and
       what an affine transform makes exact. `exact` is a DECISION with a cost (a ring per output
       pixel, refined per edge) and a promise attached (the tolerance), so it is stated or it is not
       in play. The list is published as `footprintModes()`. */
    const FOOTPRINT_MODES = ['box', 'exact'];

    function footprintPlan(R, opts, kind, method) {
      const mode = (opts && opts.footprint != null) ? String(opts.footprint) : 'box';
      if (FOOTPRINT_MODES.indexOf(mode) < 0) return refuse('warp-footprint-unknown', { footprint: mode, modes: FOOTPRINT_MODES.slice() });
      if (mode === 'box') return { ok: true, plan: { mode: 'box', tolerance: null } };
      /* ⚠ A POINT METHOD HAS NO FOOTPRINT AT ALL (js/gis-raster.js `kind`), so asking for an exact
         one is a call that cannot be answered as asked — refused rather than silently ignored, which
         would leave a reader believing they had bought an accuracy nothing delivered. */
      if (kind !== 'areal') return refuse('warp-footprint-not-areal', { footprint: mode, method: method, kind: kind });
      /* ⚠ ASKED OF THE KERNEL, NOT ASSUMED OF IT. Whether a ring can be weighted at all is
         js/gis-raster.js's statement (`sampleCellForms`), and a build whose raster kernel predates
         it says so by name instead of handing over a cell it cannot read. */
      const forms = (R && typeof R.sampleCellForms === 'function') ? R.sampleCellForms().map((f) => f.id) : [];
      if (forms.indexOf('ring') < 0) return refuse('warp-footprint-unsupported', { footprint: mode, needs: 'ring', forms: forms });
      const tol = opts ? opts.footprintTolerance : null;
      /* ⚠ NO DEFAULT TOLERANCE, for the reason `method` has no default: how close is close enough is
         a property of the question being asked, and a number chosen here would be an accuracy nobody
         stated attached to an answer somebody will quote. */
      if (tol == null) return refuse('warp-footprint-tolerance-not-stated', { footprint: mode, unit: 'source-pixels' });
      if (!isNum(tol) || !(tol > 0)) return refuse('warp-footprint-tolerance-invalid', { footprintTolerance: (typeof tol === 'number') ? tol : null });
      return { ok: true, plan: { mode: 'exact', tolerance: tol } };
    }

    /* ── the coordinate doors ─────────────────────────────────────────────────────────────────── */

    /* One projector per warp: 4326 → the source CRS, which is the direction an inverse mapping
       needs. ⚠ A code that IS 4326 needs no library at all — js/gis-crs.js answers that pair before
       it ever asks whether proj4 arrived — so a resample between two degree grids never downloads a
       projection engine, which is the lazy contract that file states. */
    async function projector(code) {
      const C = CRS();
      if (!C || typeof C.fromWgs84 !== 'function' || typeof C.toWgs84 !== 'function' || typeof C.isWgs84 !== 'function') return refuse('crs-unavailable');
      if (code == null || String(code).trim() === '') return refuse('crs-not-stated');
      const wgs = C.isWgs84(code);
      if (!wgs) {
        const ok = await C.ready();
        /* ⚠ NOT SILENTLY THE IDENTITY. A grid in EPSG:32654 drawn as if its metres were degrees is
           the 「黙って 4326 として置く」 docs/GIS-CORE.md §1.3 refuses for vectors. */
        if (!ok) return refuse('crs-unavailable', { crs: String(code) });
      }
      return {
        ok: true,
        wgs84: wgs,
        code: (typeof C.normalise === 'function' ? C.normalise(code) : String(code)),
        /* [lng, lat] → [x, y] in the source CRS; null when the transform did not answer. */
        forward: (lng, lat) => C.fromWgs84(lng, lat, code),
        /* [x, y] in the source CRS → [lng, lat]. */
        back: (x, y) => C.toWgs84(x, y, code),
        why: () => (typeof C.why === 'function' ? C.why() : null),
      };
    }

    /* ── the extent and the resolution the output should have ─────────────────────────────────── */

    /* THE EXTENT IS WALKED, NOT COMPUTED FROM FOUR CORNERS. A projected edge is a CURVE in degrees —
       the top edge of a UTM tile bows — so the four corners under-state the box on one side and a
       warp built from them clips its own source. The perimeter is walked at ONE PIXEL per step,
       which needs no sampling constant to justify and is the resolution the grid itself has; the
       cost is 2·(width+height) transforms against width·height in the loop that follows. */
    function sourceExtent(S, P) {
      const W = S.raster.width, H = S.raster.height;
      const ring = [];
      for (let px = 0; px <= W; px++) ring.push([px, 0]);
      for (let py = 1; py <= H; py++) ring.push([W, py]);
      for (let px = W - 1; px >= 0; px--) ring.push([px, H]);
      for (let py = H - 1; py >= 1; py--) ring.push([0, py]);

      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      let prev = null;
      for (const p of ring) {
        const xy = fwd(S.affine, p[0], p[1]);
        const ll = P.back(xy[0], xy[1]);
        if (!ll) return refuse(P.why() || 'crs-transform-failed', { at: { px: p[0], py: p[1] } });
        const lng = (prev == null) ? ll[0] : unwrapTo(prev, ll[0]);
        prev = lng;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (ll[1] < south) south = ll[1];
        if (ll[1] > north) north = ll[1];
      }
      if (!(east > west) || !(north > south)) return refuse('extent-degenerate', { bbox: [west, south, east, north] });
      /* ⚠ A source that unwraps past a whole turn has no simple extent in degrees, for the same
         reason js/gis-geometry.js refuses a ring that spans 360°: there is no window that holds it
         once. It is not an empty answer and it is not a guess. */
      if (east - west >= 360) return refuse('warp-spans-world', { lngSpan: east - west });
      return { ok: true, bbox: [west, south, east, north] };
    }

    /* THE OUTPUT PIXEL IS AS BIG AS A SOURCE PIXEL IS, MEASURED AT THE CENTRE OF THE GRID.
       The two edge vectors of the centre pixel are transformed into degrees, which makes them the
       REAL ground size of that pixel expressed at that latitude — a metre at 70°N is more degrees of
       longitude than a metre at the equator, and this reads that off the projection itself rather
       than from any conversion constant. The output takes, for each axis, the LARGER of the two
       vectors' components on that axis:
         · for a north-up grid one vector is purely along each axis, so the output pixel IS the input
           pixel and an identity warp moves nothing;
         · for a rotated one it is the dominant component, so the output never resolves finer than
           the source can support along that axis, and never coarser than the source's own step.
       ⚠ The caller may state `width` / `height` instead; then this is not consulted at all, because
       a stated resolution is a decision and this is only the default when none was made. */
    function nativePixelSize(S, P) {
      const cx = Math.floor(S.raster.width / 2), cy = Math.floor(S.raster.height / 2);
      const at = (px, py) => {
        const xy = fwd(S.affine, px, py);
        return P.back(xy[0], xy[1]);
      };
      const p00 = at(cx + 0.5, cy + 0.5);
      const p10 = at(cx + 1.5, cy + 0.5);
      const p01 = at(cx + 0.5, cy + 1.5);
      if (!p00 || !p10 || !p01) return refuse(P.why() || 'crs-transform-failed', { at: { px: cx, py: cy } });
      const dxLng = Math.abs(unwrapTo(p00[0], p10[0]) - p00[0]), dxLat = Math.abs(p10[1] - p00[1]);
      const dyLng = Math.abs(unwrapTo(p00[0], p01[0]) - p00[0]), dyLat = Math.abs(p01[1] - p00[1]);
      const pixelLng = Math.max(dxLng, dyLng);
      const pixelLat = Math.max(dxLat, dyLat);
      if (!(pixelLng > 0) || !(pixelLat > 0)) {
        return refuse('pixel-size-underivable', { pixelLng: pixelLng, pixelLat: pixelLat, centreLat: p00[1] });
      }
      return { ok: true, pixelLng: pixelLng, pixelLat: pixelLat, centre: p00 };
    }

    /* ══ THE OTHER THREAD, AND WHAT OF A WARP CAN ACTUALLY GO ON IT (#R783) ═══════════════════
       The external audit (§5, P2) asked for the heavy operations to run off the main thread in units
       that fit a memory budget. ⚠ WHAT MOVES HERE IS THE GEOMETRY OF THE OUTPUT AND NOT THE
       SAMPLING, and that boundary is a statement about ownership, not about effort:
         · THE GEOMETRY IS THIS FILE'S OWN ARITHMETIC — every output pixel centre taken back through
           the affine inverse, and, for an areal method, the box holding its four corners. It is
           `invAt` and `boxOf`, it touches nothing else, and it is the part that grows with W·H.
         · THE VALUE IS js/gis-raster.js `sample`'s, AND THAT KERNEL CANNOT BE SHIPPED. It reads
           `window`, it is a factory closed over its own state, and `read(bandIndex)` may DECODE — a
           worker rebuilt from its source text has none of that. Writing 「nearest is just an index
           lookup」 into a job would put the void rule, the edge clamp and the sentinel test in a
           second place, which is the copy that loses the rule (header, §THE VOID RULE). So the
           sampling stays on this thread and the warp is only as parallel as its geometry.
       ⚠ THE SOURCE MUST BE IN DEGREES FOR THIS DOOR. A projected source needs `P.forward` per pixel
       and that is proj4 — not in a worker built from a Blob of this repository's own text — so such a
       warp is answered `crs-not-in-worker` in `report.worker` and runs here, completely.
       ⚠ THE BLOCK IS A ROW RANGE, AND ITS HEIGHT IS THE BUDGET'S. What comes back for one output row
       is 2 floats per pixel (the centre) plus 4 more for an areal footprint; at 4096 wide that is
       64 KiB or 192 KiB PER ROW, so a whole-grid geometry is 256–768 MiB and a budget is not
       optional. js/gis-worker.js `planBlocks` turns those bytes into a block height and `runBlocks`
       runs them, reporting the peak it actually held.
       ⚠ ONE BLOCK AT A TIME (`inFlight: 1`), DELIBERATELY. The sampling walk below carries state —
       one `opt` object, one row cursor, one pair of corner rows — so two blocks taken at once would
       interleave two walks through one cursor. The budget still governs the SIZE; the parallelism
       this door buys is the geometry of the next block being computed while this one is sampled. */

    const WARP_GEOM_JOB = 'warp.geometry';
    /* The library, as the pair of names the job reaches for. ⚠ ONE LIST: the job declares `uses` from
       it and `ensureGeomJob` provides from it, so a name added here cannot be forgotten in either. */
    const WARP_LIBS = [['warpInvAt', invAt], ['warpBoxOf', boxOf]];

    /* ⚠ SELF-CONTAINED, AS js/gis-worker.js's contract requires — every name it uses is either its
       own, a worker global (`Float64Array`, `Array`, `Math`, `isFinite`) or a member of `ctx.lib`.
       ⚠ IT REACHES THE LIBRARY THROUGH `ctx.lib`, NOT AS A FREE NAME. A free `warpInvAt` would be an
       identifier in js/ that resolves to nothing at runtime (scripts/check-split-scope.mjs says so,
       correctly) and inside the worker it would sit where a shadowed intrinsic is unobservable. */
    function warpGeometryJob(p, ctx) {
      const lib = (ctx && ctx.lib) ? ctx.lib : null;
      const inv = lib ? lib.warpInvAt : null;
      const box = lib ? lib.warpBoxOf : null;
      if (typeof inv !== 'function') return { ok: false, why: 'warp-library-missing', detail: { missing: 'warpInvAt' } };
      const num = function (v) { return typeof v === 'number' && isFinite(v); };
      const cnt = function (v) { return num(v) && Math.floor(v) === v && v >= 0; };
      const A = p ? p.affine : null;
      if (!Array.isArray(A) || A.length !== 6 || !A.every(num)) return { ok: false, why: 'affine-invalid', detail: { affine: Array.isArray(A) ? A.slice() : null } };
      if (!num(p.det) || p.det === 0) return { ok: false, why: 'affine-singular', detail: { det: num(p.det) ? p.det : null } };
      if (!num(p.west) || !num(p.north) || !(p.pixelLng > 0) || !(p.pixelLat > 0)) return { ok: false, why: 'target-invalid' };
      const W = p.width, rows = p.rows, row0 = p.row0;
      if (!cnt(W) || W < 1 || !cnt(rows) || rows < 1 || !cnt(row0)) return { ok: false, why: 'block-invalid', detail: { width: cnt(W) ? W : null, rows: cnt(rows) ? rows : null, row0: cnt(row0) ? row0 : null } };
      const areal = p.areal === true;
      if (areal && typeof box !== 'function') return { ok: false, why: 'warp-library-missing', detail: { missing: 'warpBoxOf' } };

      const cells = W * rows;
      let centres, boxes = null;
      /* No ceiling is invented — the allocation is the limit, and it fails with the size in hand.
         The block that asked for it came out of a budget, so this is the answer to a budget that was
         larger than the machine, not to a grid that is too big. */
      try {
        centres = new Float64Array(cells * 2);
        if (areal) boxes = new Float64Array(cells * 4);
      } catch (e) { return { ok: false, why: 'block-too-large', detail: { cells: cells, areal: areal } }; }

      /* A row of corners is computed ONCE and becomes the next row's top edge — the same saving the
         main-thread walk makes, for the same reason: (W+1)·(rows+1) transforms rather than 4·W·rows.
         ⚠ A CORNER ROW IS INDEXED BY AN ABSOLUTE OUTPUT ROW, so a block starts by computing its own
         top edge and every block's boxes are the boxes the ungrouped walk would have produced. */
      const cornerRow = function (r) {
        const lat = p.north - p.pixelLat * r;
        const arr = new Float64Array((W + 1) * 2);
        for (let c = 0; c <= W; c++) {
          const q = inv(A, p.det, p.west + p.pixelLng * c, lat);
          arr[c * 2] = q[0]; arr[c * 2 + 1] = q[1];
        }
        return arr;
      };
      let top = areal ? cornerRow(row0) : null, bot = null;
      /* Progress at most 64 times whatever the block's size — js/gis-worker.js's own number, for the
         reason stated there (inside a worker the interval is message traffic, not responsiveness). */
      const every = Math.max(1, Math.floor(rows / 64));
      for (let r = 0; r < rows; r++) {
        const row = row0 + r;
        const lat = p.north - p.pixelLat * (row + 0.5);
        if (areal) bot = cornerRow(row + 1);
        const base = r * W;
        for (let c = 0; c < W; c++) {
          const q = inv(A, p.det, p.west + p.pixelLng * (c + 0.5), lat);
          centres[(base + c) * 2] = q[0];
          centres[(base + c) * 2 + 1] = q[1];
          if (areal) {
            const b = box(top[c * 2], top[c * 2 + 1], top[c * 2 + 2], top[c * 2 + 3],
              bot[c * 2], bot[c * 2 + 1], bot[c * 2 + 2], bot[c * 2 + 3]);
            const k = (base + c) * 4;
            boxes[k] = b[0]; boxes[k + 1] = b[1]; boxes[k + 2] = b[2]; boxes[k + 3] = b[3];
          }
        }
        if (areal) top = bot;
        if ((r % every) === 0) ctx.progress(base, cells);
      }
      ctx.progress(cells, cells);
      /* ⚠ TRANSFERRED, NOT COPIED. This thread allocated them and nobody else holds a view — the one
         direction of js/gis-worker.js's ownership contract that has no option. */
      return {
        ok: true,
        value: { centres: centres, boxes: boxes, width: W, rows: rows, row0: row0 },
        transfer: boxes ? [centres.buffer, boxes.buffer] : [centres.buffer],
      };
    }

    /* ⚠ THE DOOR IS INJECTED (`opts.worker`), THE SAME WAY js/gis-raster.js takes it and for the
       reason that file states: a second thread is not a question this kernel asks the page, it is a
       RUNNER a caller chose for a particular call. A module that reached for
       `window.IntMapGisWorker` itself would decide for every caller at once and would stop being the
       DOM-free module tests boot with no window at all.
       ⚠ THREE ANSWERS, NOT TWO: no door offered (null — nothing to report), a door that cannot be
       used (a NOTE, carried into `report.worker` so 「なぜこのスレッドで走ったか」 is readable), or
       the door. 「使えなかった」 and 「渡されなかった」 arriving as one silence is
       [[intmap-one-store-was-asked]], in a runner. */
    function workerDoor(opts) {
      const w = opts && opts.worker;
      if (!w) return null;
      /* Every function this file actually calls on it, checked by name — a door missing one of them
         is not a door, and finding that out at the third block is finding it out too late. */
      for (const k of ['run', 'register', 'provide', 'planBlocks', 'runBlocks', 'jobNames', 'libraryNames']) {
        if (typeof w[k] !== 'function') return { note: { used: false, reason: 'worker-door-invalid', detail: { missing: k } } };
      }
      try {
        if (typeof w.available === 'function' && !w.available()) return { note: { used: false, reason: 'worker-unavailable' } };
      } catch (e) {
        return { note: { used: false, reason: 'worker-door-invalid', detail: { message: String((e && e.message) || e) } } };
      }
      return { worker: w };
    }

    /* ══ (#R819) THE THIRD DOOR: WHERE THE OUTPUT GOES ═══════════════════════════════════════════
       A warp's output is the one thing that grows with W·H·bands and lives for the whole run, and
       until this round it was ALWAYS an array of Float64Array this file allocated before it planned
       anything. A caller who could stream the result somewhere had no way to say so, so a 4096²
       four-band warp staked 512 MiB whatever the budget said.
       THE CONTRACT, deliberately small enough that a receiver can be anything:
           begin(decl) → void | {ok:false,…}        — optional. decl: {attempt, width, height,
                                                      rowsPerWindow, bands, crs, grid}.
                                                      ⚠ attempt > 1 MEANS START OVER: a fallback
                                                      re-walks every pixel, so anything taken for an
                                                      earlier attempt must be discarded.
           write(window) → void | {ok:false,…}      — REQUIRED. window: {row0, rows, width, bands:
                                                      [Float64Array(rows·width), …]}.
                                                      ⚠ THE ARRAYS ARE THE SINK'S: they are allocated
                                                      per window and never reused, so an asynchronous
                                                      receiver may hold one.
           end(summary) → void | {ok:false,…} | {ok:true, value}  — optional; `value` reaches the
                                                      caller as report.sink.value.
       Every one of them may be async. ⚠ A REFUSAL FROM ANY OF THEM ENDS THE WARP (`warp-sink-failed`)
       rather than being logged: a window that did not land is a hole in the answer, and a report
       counting pixels nobody kept is the ハリボテ CONSTITUTION.md forbids.
       ⚠ PERSISTENCE IS NOT IMPLEMENTED HERE. js/gis-project.js owns what a saved grid IS; this is the
       door it can arrive through, and the default remains an output held whole in memory. */
    function readSink(opts) {
      const s = opts && opts.sink;
      if (s == null) return null;
      if (typeof s !== 'object') return { bad: refuse('warp-sink-invalid', { field: 'sink' }) };
      if (typeof s.write !== 'function') return { bad: refuse('warp-sink-invalid', { missing: 'write' }) };
      for (const k of ['begin', 'end']) {
        if (s[k] != null && typeof s[k] !== 'function') return { bad: refuse('warp-sink-invalid', { field: k }) };
      }
      return { sink: s };
    }

    /* ⚠⚠⚠ (#R819) THE BUDGET HAS ONE CANON AND IT IS NOT IN THIS FILE. js/gis-worker.js's
       `BLOCK_BUDGET_BYTES` is the number, with the observation that produced it, published as
       `budgetBytes()` precisely so no second caller writes 64 MiB down (.agents/rules/
       no-ad-hoc-hardcoding.md §4-3). So this reads the caller's own figure first and the door's
       canon second — and when there is neither, there is NO BUDGET, which is stated as null rather
       than invented. A sink cannot be sized without one, and that is the one case refused by name:
       every other path behaves exactly as it did before this round.
       ⚠ It is NOT read off `window.IntMapGisWorker`: this module never reaches for a runner the
       caller did not hand it (see `workerDoor`), and a budget taken from a thread pool nobody
       offered would be a decision made for every caller at once. */
    function budgetOf(opts) {
      const b = opts && opts.budgetBytes;
      if (b != null) {
        if (!isNum(b) || !(b > 0)) return refuse('warp-budget-invalid', { budgetBytes: (typeof b === 'number') ? b : null });
        return { ok: true, bytes: b, from: 'stated' };
      }
      /* ⚠ THE DOOR IS ASKED EVEN WHEN IT CANNOT RUN ANYTHING. `budgetBytes()` is a DECLARATION about
         how much this machine may hold, not a capability of the pool — a worker that reports itself
         unavailable still knows the number, and refusing to read it would make 「別スレッドは使え
         ない」 also mean 「予算が無い」, which is two facts under one silence. */
      const w = opts && opts.worker;
      if (w && typeof w.budgetBytes === 'function') {
        let v = null;
        try { v = w.budgetBytes(); } catch (_) { v = null; }
        if (isNum(v) && v > 0) return { ok: true, bytes: v, from: 'worker' };
      }
      return { ok: true, bytes: null, from: null };
    }

    /* Registered and provided ONCE PER DOOR, and ASKED rather than remembered: js/gis-worker.js
       counts a registry change as a revision and retires idle workers built from an older one, so
       providing on every call would spawn a fresh thread for every block. The registry is the record
       of what is registered — a Set here would be a second one. */
    function ensureGeomJob(w) {
      try {
        const have = w.libraryNames();
        for (const pair of WARP_LIBS) {
          if (have.indexOf(pair[0]) >= 0) continue;
          const r = w.provide(pair[0], pair[1]);
          if (!r || !r.ok) return { ok: false, reason: (r && r.why) || 'library-not-provided', detail: (r && r.detail) || null };
        }
        if (w.jobNames().indexOf(WARP_GEOM_JOB) >= 0) return { ok: true };
        const reg = w.register(WARP_GEOM_JOB, warpGeometryJob, {
          uses: WARP_LIBS.map((pair) => pair[0]),
          decl: {
            id: WARP_GEOM_JOB,
            inputs: [{ name: 'affine', type: 'affine' }, { name: 'det', type: 'number' }],
            params: [
              { name: 'west', type: 'degrees' }, { name: 'north', type: 'degrees' },
              { name: 'pixelLng', type: 'degrees' }, { name: 'pixelLat', type: 'degrees' },
              { name: 'width', type: 'count' }, { name: 'row0', type: 'count' }, { name: 'rows', type: 'count' },
              { name: 'areal', type: 'boolean' },
            ],
            output: { centres: 'band', boxes: 'band|null', width: 'count', rows: 'count', row0: 'count' },
          },
        });
        if (!reg || !reg.ok) return { ok: false, reason: (reg && reg.why) || 'job-not-registered', detail: (reg && reg.detail) || null };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'worker-door-invalid', detail: { message: String((e && e.message) || e) } };
      }
    }

    /* ── the run ──────────────────────────────────────────────────────────────────────────────── */

    /* docs/GIS-CORE.md §2.6's ctx, taken rather than rebuilt (header). A caller that handed none gets
       `null` and a run that holds the thread — stated, not simulated with a fake that claims to be
       interruptible.
       ⚠ (#R756) WHAT COUNTS AS A ctx IS ASKED OF js/gis-raster.js, not answered again here. The two
       spellings had already begun to differ in what they did with the answer (a row-counted tick
       against an elapsed-time one), and the reader could not see that from either file. */
    async function runWarp(S, P, out, fromCode) {
      const W = out.width, H = out.height, N = W * H;
      const ctx = S.R.useCtx(S.opts);
      const sw = S.raster.width, sh = S.raster.height;
      const opt = { method: S.method };
      const areal = (S.kind === 'areal');
      const FP = S.footprint;
      const exact = areal && FP.mode === 'exact';

      /* ⚠ (#R819) THE DOOR IS READ HERE, BEFORE ANYTHING IS ALLOCATED, because it carries the one
         number this file may not write down: the memory budget (see `budgetOf`). */
      const door = workerDoor(S.opts);
      const bud = budgetOf(S.opts);
      if (!bud.ok) return bud;

      /* ══ (#R819) WHAT THIS WARP WILL HOLD, AND WHICH PART OF IT IS STILL A CHOICE ═════════════
         #R783 bounded the geometry a worker sends back and nothing else, so the OUTPUT — the one
         thing that grows with W·H·bands and lives for the whole run — was allocated whole before the
         first block was planned: 4096² float64 is 128 MiB per band, 512 MiB for four, beside a
         decoded source of the same order. The budget was being spent on the smaller half.
         THE ACCOUNTING IS THEREFORE OVER THE SUM, and it separates two kinds of residency:
           · FIXED — what the caller settled before the warp began: the decoded source bands this
             file caches (prepareSource), the measured latitude axis, the corner rows an areal walk
             reuses. It is MEASURED and REPORTED, never used to shrink anything else.
           · CHOOSABLE — the geometry block a worker computes, and (when a sink was offered) the
             OUTPUT WINDOW. Both cost a number of bytes PER OUTPUT ROW, so one row count sizes both
             and the budget is spent across them together rather than by the geometry alone.
         ⚠ AND THE BUDGET IS NOT A CAP ON WORK (CONSTITUTION.md §5). A resident output larger than
         the whole budget is not refused and does not shrink the blocks to one row each — it is
         reported as `memory.overBudget` with the reason, and the road out is a sink, which is the
         only thing that can make an output's residency a choice at all. */
      const sinkDoor = readSink(S.opts);
      if (sinkDoor && sinkDoor.bad) return sinkDoor.bad;
      const sink = sinkDoor ? sinkDoor.sink : null;
      if (sink && bud.bytes == null) return refuse('warp-budget-not-stated', { reason: 'sink-offered', from: ['opts.budgetBytes', 'opts.worker.budgetBytes()'] });

      const outRowBytes = W * S.bandCount * 8;
      const geomRowBytes = W * (areal ? 6 : 2) * 8;
      /* two corner rows — this row's top edge and the next one's — held by every areal walk that
         computes its own geometry, and by the blocked one too (the worker holds its own pair). */
      const cornerRowBytes = areal ? (W + 1) * 2 * 8 * 2 : 0;
      const latAxisBytes = areal ? (sh + 1) * 8 : 0;
      const fixedBytes = S.sourceBytes + latAxisBytes + cornerRowBytes;
      const residentOutBytes = sink ? 0 : N * S.bandCount * 8;
      /* The rows a window may hold: what is left of the budget after the fixed residency, divided by
         what one row of window costs. ⚠ ONE ROW IS THE FLOOR and it is not a silent overrun — a
         window smaller than a row cannot exist, and `memory.overBudget` says the budget was not met
         rather than the warp refusing an output the caller asked for. */
      let windowRows = 0;
      if (sink) {
        const spare = bud.bytes - fixedBytes;
        windowRows = Math.max(1, Math.floor(spare / outRowBytes));
        if (windowRows > H) windowRows = H;
      }

      /* ── the output, held as one grid or as one window at a time ─────────────────────────────
         ⚠ A WINDOW IS ALLOCATED FRESH AND HANDED OVER, NEVER REUSED. A sink that writes to storage
         is asynchronous, and a buffer this file reused under it would be rewritten while it was
         being written out — the ownership contract js/gis-worker.js states for a transfer, for the
         same reason and in the same direction. */
      let bands = null, winRow0 = 0, winRows = 0, winOff = 0, windows = 0, attempt = 0;
      const openWindow = (row0, rows) => {
        const cells = rows * W;
        const arr = [];
        for (let i = 0; i < S.bandCount; i++) {
          /* ⚠ NO CEILING IS INVENTED — the allocation is the limit, and it fails with the number of
             cells in hand. The same rule js/gis-raster.js `fromSampler` states. */
          try { arr.push(new Float64Array(cells)); } catch (e) { return refuse('raster-too-large', { cells: cells, bands: S.bandCount }); }
        }
        bands = arr; winRow0 = row0; winRows = rows; winOff = row0 * W;
        return null;
      };
      const flushWindow = async () => {
        if (!sink || !bands) return undefined;
        const w = { row0: winRow0, rows: winRows, width: W, bands: bands };
        bands = null;
        windows++;
        let r;
        try { r = await sink.write(w); } catch (e) { return refuse('warp-sink-failed', { at: 'write', row0: w.row0, error: String((e && e.message) || e) }); }
        /* ⚠ A SINK THAT SAYS NOTHING IS TAKEN AT ITS WORD, and one that refuses ENDS THE WARP: a
           window that did not land is a hole in the answer, and carrying on would produce a report
           whose `filled` counts pixels nobody kept. */
        if (r && r.ok === false) return refuse('warp-sink-failed', { at: 'write', row0: w.row0, why: r.why == null ? null : r.why, detail: r.detail == null ? null : r.detail });
        return undefined;
      };

      /* ⚠ THE WHOLE OUTPUT IS ALLOCATED HERE, ONCE, WHEN THERE IS NOWHERE TO STREAM IT — before the
         door is tried, because both paths write into it and a run that failed to allocate has
         nothing to say about threads. It is the same array a re-walk overwrites (see `reset`). */
      if (!sink) { const whole = openWindow(0, H); if (whole) return whole; }

      /* ⚠ (#R783) THE COUNTERS AND THE ROW CURSOR ARE RESETTABLE, BECAUSE A PASS CAN BE RE-RUN. A
         door that fails at the third block has already written rows into `bands`, and the answer to
         that is not a half-warped grid with statistics for a walk that happened twice: the fallback
         re-walks EVERY output pixel here (each step writes every band at every pixel, so the arrays
         are overwritten rather than merged) and the numbers start again from zero. */
      let perBand = [], clipped = 0, failed = 0;
      let curRow = -1, lat = 0, base = 0, topCorners = null, botCorners = null;
      /* The block of geometry a worker computed, or null when this thread is computing it per pixel
         (which is the cheaper arrangement HERE: nothing is materialised at all). */
      let geom = null, geomBase = 0, offThread = false, walked = 0;
      /* (#R819) what the run can say afterwards about the two approximations under an areal warp:
         the one latitude a row was represented by, and the shape a footprint was taken to have. */
      let latAxisNote = null;
      let boxExcess = 0, boxExcessAt = null, boxExcessSeen = false;
      let segMax = 0, segTotal = 0, devMax = 0, depthLimited = 0, edgePointsPeak = 0;

      if (areal) {
        /* ⚠⚠⚠ AN AREAL AGGREGATE WEIGHS BY GROUND AREA, AND THE PIXEL-SPACE PROXY HAS NO LATITUDE.
           js/gis-raster.js weights a footprint by Δλ·(sin φ_n − sin φ_s) — a 1° row is half the ground
           at 60°N that it is at the equator — but what this file hands it is a grid whose 「lat」 is a
           negated ROW INDEX (header), and a projected source has no latitude in its own coordinates
           at all. So the rows' latitudes are MEASURED through the projection and DECLARED on the
           proxy (`grid.latAxis`), which is the one declaration the kernel needs and cannot derive.
           ⚠ Measured at the grid's MIDDLE column: a row of a projected grid is not an iso-latitude
           line, and its middle is where its ground height is representative rather than extreme. For
           a north-up 4326 source every column gives the same answer and this is exact.
           Cost: sh+1 transforms for a warp that already does W·H of them. */
        const midPx = S.raster.width / 2;
        const edges = new Float64Array(sh + 1);
        for (let r = 0; r <= sh; r++) {
          const xy = fwd(S.affine, midPx, r);
          const ll = P.back(xy[0], xy[1]);
          /* ⚠ NOT DEGRADED TO 「行の高さは全部同じ」. That would be a weighting nobody chose, applied
             to the one case where the latitudes could not be had — and it would be invisible. */
          if (!ll) return refuse(P.why() || 'crs-transform-failed', { at: { px: midPx, py: r } });
          edges[r] = ll[1];
        }
        S.proxy.grid.latAxis = { edges: edges };

        /* ⚠⚠⚠ (#R819) AND 「代表させた」 IS A CLAIM, SO IT IS MEASURED. One latitude per row is exact
           for a north-up degree grid and an APPROXIMATION for every other one — a row of a UTM grid
           bows, and its ends stand at a different latitude from its middle. Nothing said how much,
           so nothing could tell a reader whether the weights under their `average` were good to a
           part in ten thousand or to a part in ten.
           WHAT IS MEASURED: the same row edges at the grid's two OUTER columns, and the weight a row
           would have had there against the weight it was given. The weight is ∝ sin φ_n − sin φ_s
           (js/gis-raster.js `latGround`), so the bound is the largest relative difference of that
           quantity over the rows — an error in the WEIGHTS, which is what an areal aggregate is
           sensitive to, rather than a difference in degrees that means nothing on its own.
           Cost: 2·(sh+1) transforms, against the W·H this warp already makes.
           ⚠ IT IS A BOUND OVER THE GRID, NOT THE ERROR AT A PIXEL: a footprint that covers rows near
           the middle sees less than this. Stating the worst is the honest direction. */
        let spreadDeg = 0, weightErr = 0, worstRow = null, measured = true;
        const sinOf = (a, b) => Math.abs(Math.sin(a * Math.PI / 180) - Math.sin(b * Math.PI / 180));
        for (let r = 0; r < sh && measured; r++) {
          const mid = sinOf(edges[r], edges[r + 1]);
          for (const px of [0, sw]) {
            const n = P.back.apply(null, fwd(S.affine, px, r));
            const s = P.back.apply(null, fwd(S.affine, px, r + 1));
            /* A column whose edge does not transform is not a failure of the warp — the middle
               column answered, and the walk below uses that. It is the MEASUREMENT that cannot be
               made, and 「測れなかった」 is reported as null rather than as zero error. */
            if (!n || !s) { measured = false; break; }
            const d = Math.abs(n[1] - edges[r]);
            if (d > spreadDeg) spreadDeg = d;
            const e = sinOf(n[1], s[1]);
            const rel = mid > 0 ? Math.abs(e - mid) / mid : (e > 0 ? Infinity : 0);
            if (rel > weightErr) { weightErr = rel; worstRow = r; }
          }
        }
        latAxisNote = measured
          ? { at: 'middle-column', columns: [0, sw], maxSpreadDeg: spreadDeg, maxWeightError: weightErr, worstRow: worstRow }
          : { at: 'middle-column', columns: [0, sw], maxSpreadDeg: null, maxWeightError: null, worstRow: null, reason: 'edge-column-did-not-transform' };
        /* ⚠ A TOLERANCE IS A PROMISE SOMEBODY ASKED FOR, so it is checked against the measurement
           and refused by name when it cannot be met — the road js/gis-crs.js takes for the same
           question (`crs-accuracy-outside-tolerance`): state a tolerance the measurement meets, or
           resample onto a grid whose rows do not bow. Nothing is checked when nothing was promised,
           which is why a warp that states no tolerance is the warp it was before this round. */
        if (S.areaTolerance != null) {
          if (!measured) return refuse('warp-accuracy-unmeasured', { of: 'latAxis', reason: 'edge-column-did-not-transform' });
          if (weightErr > S.areaTolerance) {
            return refuse('warp-accuracy-outside-tolerance', { of: 'latAxis', tolerance: S.areaTolerance, measured: weightErr, row: worstRow, spreadDeg: spreadDeg });
          }
        }
      }

      /* THE FOOTPRINT OF AN OUTPUT PIXEL, in source pixel coordinates: its four corners taken back
         through the same two doors its centre goes through, and the box that holds them. ⚠ THE BOX
         ERRS OUTWARD (a projected quadrilateral is not a rectangle in the source's pixel space), and
         outward is the only direction a footprint may err — js/gis-raster.js says the same of its
         column prefilter: an aggregate over slightly more ground is blunt, one over slightly less
         drops observations that were asked for.
         ⚠ A row of corners is computed ONCE and becomes the next row's top edge, so the whole warp
         costs (W+1)·(H+1) extra transforms rather than 4·W·H. */
      const toSrc = (lng, lat) => {
        const xy = P.wgs84 ? [lng, lat] : P.forward(lng, lat);
        if (!xy) return null;
        return S.inverse(xy[0], xy[1]);
      };
      const cornerRow = (r) => {
        const lat = out.north - out.pixelLat * r;
        const arr = new Float64Array((W + 1) * 2);
        for (let c = 0; c <= W; c++) {
          const lng = out.west + out.pixelLng * c;
          const pp = toSrc(lng, lat);
          if (!pp) { arr[c * 2] = NaN; arr[c * 2 + 1] = NaN; continue; }
          arr[c * 2] = pp[0]; arr[c * 2 + 1] = pp[1];
        }
        return arr;
      };

      /* ══ (#R819) THE FOOTPRINT AS A SHAPE, WHEN THE CALLER ASKED FOR ONE ══════════════════════
         The box above is built from FOUR corners, and four corners describe a projected pixel's
         outline only where the transform is affine. Two things follow, and they are separate:
           ① the outline between two corners is a CURVE, so an edge is subdivided until the true
              image of its midpoint is within `footprintTolerance` SOURCE PIXELS of the chord —
              measured, not assumed, and the largest deviation seen is reported;
           ② the outline is not a rectangle, so it is handed to js/gis-raster.js AS A RING
              (`sampleCellForms()`), which cuts it against one source pixel at a time. The box stays
              for what it is good at: it errs OUTWARD, which is what a prefilter must do, and for an
              affine transform it IS the footprint and costs an order less.
         ⚠ AN EDGE IS SUBDIVIDED ONCE AND USED BY BOTH PIXELS THAT SHARE IT. Two neighbours that
         refined the same edge independently would agree to within the tolerance and no further —
         which is a gap or an overlap between their footprints, and for `sum` that is a total which
         is not conserved. Sharing makes the footprints TILE, exactly, whatever the tolerance. */

      /* Each level halves the chord, so the deviation falls by ~4 and the points double: 8 levels
         is up to 255 intermediate points on one edge, i.e. an edge described by 256 segments and a
         deviation ~65,000× smaller than one segment's. OBSERVATION: the transforms to build such a
         ring already cost more than the sampling it feeds, so a tolerance that is not met by then is
         being asked of the wrong grid. ⚠ IT IS NOT A SILENT CAP — every edge that reaches it is
         COUNTED (`footprint.depthLimited`) and the worst deviation is reported beside the tolerance
         that was asked for, so a reader can see that the promise was not kept. */
      const MAX_REFINE_DEPTH = 8;

      /* The points strictly between a and b, in order, or null when a position on the edge would
         not transform — 「この footprint は分からない」, which is not 「この footprint は小さい」. */
      const refineEdge = (a, pa, b, pb, depth, into) => {
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const pm = toSrc(m[0], m[1]);
        if (!pm) return false;
        const dev = Math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[1] - (pa[1] + pb[1]) / 2);
        if (dev > devMax) devMax = dev;
        if (dev <= S.footprint.tolerance) return true;
        if (depth >= MAX_REFINE_DEPTH) { depthLimited++; into.push([pm[0], -pm[1]]); return true; }
        if (!refineEdge(a, pa, m, pm, depth + 1, into)) return false;
        into.push([pm[0], -pm[1]]);
        return refineEdge(m, pm, b, pb, depth + 1, into);
      };

      /* ⚠ PROXY COORDINATES (header): 「lng」 is the fractional column and 「lat」 is the NEGATED
         fractional row, which is why every point pushed above and below carries −py. */
      const edgeNum = (v) => typeof v === 'number' && isFinite(v);
      const countPoints = (lists) => { let n = 0; for (const l of lists) n += l.length; return n; };

      /* The intermediate points of the W horizontal edges along output row boundary r. */
      const hEdgeRow = (r, corners) => {
        const lat = out.north - out.pixelLat * r;
        const rows = [];
        for (let c = 0; c < W; c++) {
          const into = [];
          const pa = [corners[c * 2], corners[c * 2 + 1]], pb = [corners[c * 2 + 2], corners[c * 2 + 3]];
          if (edgeNum(pa[0]) && edgeNum(pb[0])) {
            if (!refineEdge([out.west + out.pixelLng * c, lat], pa, [out.west + out.pixelLng * (c + 1), lat], pb, 1, into)) into.push(null);
          }
          rows.push(into);
        }
        return rows;
      };
      /* …and of the W+1 vertical edges down output row r. */
      const vEdgeRow = (r, top, bot) => {
        const latT = out.north - out.pixelLat * r, latB = out.north - out.pixelLat * (r + 1);
        const cols = [];
        for (let c = 0; c <= W; c++) {
          const into = [];
          const pa = [top[c * 2], top[c * 2 + 1]], pb = [bot[c * 2], bot[c * 2 + 1]];
          if (edgeNum(pa[0]) && edgeNum(pb[0])) {
            const lng = out.west + out.pixelLng * c;
            if (!refineEdge([lng, latT], pa, [lng, latB], pb, 1, into)) into.push(null);
          }
          cols.push(into);
        }
        return cols;
      };
      let hTop = null, hBot = null, vCur = null;

      const reset = (off) => {
        offThread = !!off;
        perBand = [];
        for (let i = 0; i < S.bandCount; i++) perBand.push({ filled: 0, missing: 0, partial: 0, incomplete: 0 });
        clipped = 0; failed = 0; walked = 0;
        curRow = -1; lat = 0; base = 0;
        geom = null; geomBase = 0;
        boxExcess = 0; boxExcessAt = null; boxExcessSeen = false;
        segMax = 0; segTotal = 0; devMax = 0; depthLimited = 0; edgePointsPeak = 0;
        /* The first row's top edge, for the walk that computes its own corners. A blocked run gets
           its corner rows from the worker, so nothing is computed here for it. */
        topCorners = (areal && !offThread) ? cornerRow(0) : null;
        botCorners = null;
        hTop = (exact && topCorners) ? hEdgeRow(0, topCorners) : null;
        hBot = null; vCur = null;
      };

      /* ⚠ (#R783) THE VALUE IS ASKED IN ONE PLACE, WHICHEVER THREAD FOUND THE POSITION. `step`
         below has two arms — one reads a pixel's source position out of a block a worker computed,
         one computes it here — and the moment each of them had its own sampling loop they would be
         two answers to 「この画素は何か」: the bounds test, `outside`, `partial`, `incomplete` and
         the void write are all decisions, and a second copy of them is how the two threads would
         come to disagree about the same grid (.agents/rules/no-ad-hoc-hardcoding.md §2-3). */
      /* ⚠ (#R819) THE OUTPUT INDEX IS THE WHOLE GRID'S AND THE ARRAY IS THE WINDOW'S. `winOff` is 0
         for a run that holds the output whole, so a resident warp writes exactly where it did; a
         windowed one subtracts the window's first pixel and nothing else in the walk changes —
         which is what keeps the two from becoming two walks. */
      const voidAt = (at) => { const k = at - winOff; for (let i = 0; i < S.bandCount; i++) bands[i][k] = NaN; };
      const valueAt = (px, py, at) => {
        if (!(px >= 0 && px < sw && py >= 0 && py < sh)) { clipped++; voidAt(at); return; }
        const k = at - winOff;
        for (let i = 0; i < S.bandCount; i++) {
          /* The pixel-space proxy: column as 「lng」, negated row as 「lat」 (header). */
          const s = S.R.sample(S.proxy, i, px, -py, opt);
          if (!s.ok) {
            /* `outside` cannot happen after the bounds test above, but a real refusal from the
               raster kernel (a short band, a read that threw) is the caller's answer, not a NaN
               pixel — a warp that quietly produced a grid of voids from an unreadable band would
               be the ハリボテ CONSTITUTION.md forbids. */
            if (s.why === 'outside') { clipped++; bands[i][k] = NaN; continue; }
            return s;
          }
          if (s.partial) perBand[i].partial++;
          /* ⚠ `partial` AND `incomplete` ARE NOT THE SAME NUMBER, so they are not one field. A
             point sample is `partial` when the method the caller asked for was ABANDONED (a void
             among the corners, answered with nearest instead); an areal sample is `incomplete`
             when the method was carried out and part of the footprint had no data to carry it
             over. Writing both into one counter would tell a reader that 「補間が汚れた」 where
             what happened is 「観測が足りない」. */
          if (s.value != null && s.coverage != null && s.coverage < 1) perBand[i].incomplete++;
          if (s.value == null) { bands[i][k] = NaN; perBand[i].missing++; }
          else { bands[i][k] = s.value; perBand[i].filled++; }
        }
      };

      /* ⚠⚠⚠ (#R756) THE OUTPUT IS WALKED AS ONE SEQUENCE OF PIXELS BY js/gis-raster.js `paced`, NOT
         AS ROWS BY A LOOP WRITTEN HERE. This file used to tick once per output ROW, and a row is a
         COUNT: 40 pixels of an identity warp and 40,000 pixels of a reprojected areal one are one
         tick each, so the budget docs/GIS-CORE.md §2.6 states in MILLISECONDS was being spent in
         units that mean a different duration on every grid. Handing the walk to the kernel also means
         the cancellation is the kernel's `cancelled(done,total)` — one shape for every pixel walk in
         this layer — instead of a second spelling that only carried `detail`.
         The per-row work (the row's latitude, its base offset, the corner row an areal warp reuses as
         the next row's top edge) is done on the step that FIRST reaches a new row, so it still
         happens exactly H times. */
      const step = (k) => {
        const row = (k / W) | 0;
        if (row !== curRow) {
          /* the previous row's bottom edge IS this row's top edge — the saving the corner row exists
             for, kept exactly as the nested loop had it. ⚠ A BLOCKED RUN HAS NO CORNER ROWS HERE:
             the worker computed the boxes themselves, and it reused the same edge the same way. */
          if (curRow >= 0 && areal && !geom) { topCorners = botCorners; if (exact) hTop = hBot; }
          curRow = row;
          lat = out.north - out.pixelLat * (row + 0.5);
          base = row * W;
          if (areal && !geom) botCorners = cornerRow(row + 1);
          if (exact) {
            /* ⚠ THE SAME TWO EDGE SETS THE NEIGHBOURING PIXELS WILL USE: the bottom edges of this
               row become the top edges of the next (as the corners do), and the vertical edges are
               shared by the two pixels either side of them. That sharing is what makes the
               footprints tile. */
            hBot = hEdgeRow(row + 1, botCorners);
            vCur = vEdgeRow(row, topCorners, botCorners);
            const held = countPoints(hTop) + countPoints(hBot) + countPoints(vCur);
            if (held > edgePointsPeak) edgePointsPeak = held;
          }
        }
        const col = k % W;
        /* ⚠ (#R783) THE OTHER THREAD FOUND THIS PIXEL'S POSITION, AND WITH THE SAME ARITHMETIC: the
           job ran `invAt` and `boxOf` — the very functions the arm below calls — from their own
           source text, over the same affine and the same pixel centres (js/gis-worker.js
           `provide`). So this arm READS two numbers where the other computes them, and tests/r783
           measures the two grids byte for byte rather than trusting that sentence. */
        if (geom) {
          const j = k - geomBase;
          if (areal) {
            const m = j * 4;
            const bw = geom.boxes[m], bs = geom.boxes[m + 1], be = geom.boxes[m + 2], bn = geom.boxes[m + 3];
            /* A corner that would not transform arrives as NaN and takes the whole box with it —
               the same reading as below, and the same count. */
            if (!(isNum(bw) && isNum(bs) && isNum(be) && isNum(bn))) { failed++; voidAt(base + col); return; }
            opt.cell = [bw, bs, be, bn];
          }
          return valueAt(geom.centres[j * 2], geom.centres[j * 2 + 1], base + col);
        }
        {
          const lng = out.west + out.pixelLng * (col + 0.5);
          if (areal) {
            const ax = topCorners[col * 2], ay = topCorners[col * 2 + 1];
            const bx = topCorners[col * 2 + 2], by = topCorners[col * 2 + 3];
            const cx2 = botCorners[col * 2], cy2 = botCorners[col * 2 + 1];
            const dx = botCorners[col * 2 + 2], dy = botCorners[col * 2 + 3];
            if (!(isNum(ax) && isNum(bx) && isNum(cx2) && isNum(dx) && isNum(ay) && isNum(by) && isNum(cy2) && isNum(dy))) {
              /* A corner that would not transform leaves the footprint unknown, and an aggregate over
                 an unknown footprint is not a smaller aggregate — it is no answer. Counted with the
                 other transform failures, which is what it is. */
              failed++;
              voidAt(base + col);
              return;
            }
            /* Proxy coordinates: 「lng」 is the fractional column, 「lat」 is the NEGATED fractional
               row (header), so the box's north/south are the negated minimum/maximum row. ⚠ ONE
               IMPLEMENTATION OF THAT BOX (`boxOf`), because the worker computes the same one. */
            const bx4 = boxOf(ax, ay, bx, by, cx2, cy2, dx, dy);
            if (exact) {
              /* ⚠ THE RING IS WALKED ONCE ROUND: top-left → along the top → down the right → back
                 along the bottom → up the left. Every intermediate list is used in the direction the
                 walk is going, which is why the bottom and left ones are read backwards. A `null` in
                 a list is an edge position that would not transform, and it makes the whole
                 footprint unknown for exactly the reason a NaN corner does. */
              const hT = hTop[col], hB = hBot[col], vL = vCur[col], vR = vCur[col + 1];
              if (hT.indexOf(null) >= 0 || hB.indexOf(null) >= 0 || vL.indexOf(null) >= 0 || vR.indexOf(null) >= 0) {
                failed++; voidAt(base + col); return;
              }
              const ring = [[ax, -ay]];
              for (let i = 0; i < hT.length; i++) ring.push(hT[i]);
              ring.push([bx, -by]);
              for (let i = 0; i < vR.length; i++) ring.push(vR[i]);
              ring.push([dx, -dy]);
              for (let i = hB.length - 1; i >= 0; i--) ring.push(hB[i]);
              ring.push([cx2, -cy2]);
              for (let i = vL.length - 1; i >= 0; i--) ring.push(vL[i]);
              segTotal += ring.length;
              if (ring.length > segMax) segMax = ring.length;
              opt.cell = { ring: ring };
            } else {
              opt.cell = bx4;
              /* ⚠⚠⚠ (#R819) AND HOW MUCH MORE GROUND THAT BOX HOLDS THAN THE FOOTPRINT DOES IS
                 MEASURED HERE, on the four corners that are already in hand. The quadrilateral's own
                 area (the shoelace of the four corners, which is the footprint to first order) against
                 the box's: the ratio is the ground an areal aggregate was weighted over and did not
                 cover. For a north-up resample it is 0 at every pixel and the report says so; for a
                 rotated or projected one it is the number that says whether the fast path can carry
                 the question being asked. ⚠ It is the WORST over the grid, with the pixel that did
                 it, because a mean would hide exactly the pixels a reader is asking about. */
              const qa = Math.abs((ax * by - bx * ay) + (bx * dy - dx * by) + (dx * cy2 - cx2 * dy) + (cx2 * ay - ax * cy2)) / 2;
              const ba = (bx4[2] - bx4[0]) * (bx4[3] - bx4[1]);
              if (qa > 0 && ba > 0) {
                boxExcessSeen = true;
                const ex = ba / qa - 1;
                if (ex > boxExcess) { boxExcess = ex; boxExcessAt = { row: row, col: col }; }
              }
            }
          }
          const xy = P.wgs84 ? [lng, lat] : P.forward(lng, lat);
          if (!xy) {
            /* ⚠ 「変換できなかった」 is not 「そこには何も無い」. Both write NaN because there is
               nothing else to write, and they are counted apart so the reader can tell. */
            failed++;
            voidAt(base + col);
            return;
          }
          const pp = S.inverse(xy[0], xy[1]);
          return valueAt(pp[0], pp[1], base + col);
        }
      };

      /* ── one walk over a range of output pixels ─────────────────────────────────────────────
         ⚠ (#R783) THE CTX IS TOLD THE WARP'S TOTAL AND NOT THE BLOCK'S. `paced` reports progress in
         the units it was given, and a blocked run that handed it a block's size would make a
         reader's progress line restart at every block and their stop button act on a walk they
         cannot see. So the pacer counts pixels of the WHOLE output, and a cancellation is re-stated
         with the pixel the whole warp had reached — through js/gis-raster.js `cancelled`, which is
         the one shape this layer has for it (#R756), and not a third spelling. */
      const walkCtx = ctx ? { tick: (units) => ctx.tick(units, N) } : null;
      const walk = (from, cells) => {
        const r = S.R.paced(cells, (i) => step(from + i), walkCtx, () => undefined);
        if (!ctx) { walked = from + cells; return r; }
        return Promise.resolve(r).then((v) => {
          if (v && v.ok === false && v.why === 'cancelled') {
            walked = from + ((typeof v.done === 'number' && isNum(v.done)) ? v.done : 0);
            return S.R.cancelled(walked, N);
          }
          walked = from + cells;
          return v;
        });
      };

      /* ⚠ (#R819) THE SINK IS TOLD THE WARP IS STARTING, AND TOLD AGAIN WHEN IT STARTS OVER. A door
         that fails at the third block makes this file re-walk every output pixel (see `reset`), and
         a sink that had already taken two windows would otherwise be holding two attempts' worth of
         one grid. `attempt` counts them and a sink that cannot discard what it took answers a
         refusal, which ends the warp rather than producing a grid nobody can read back. */
      const beginSink = async () => {
        if (!sink || typeof sink.begin !== 'function') { attempt++; windows = 0; return undefined; }
        attempt++; windows = 0;
        let r;
        try {
          r = await sink.begin({
            attempt: attempt, width: W, height: H, rowsPerWindow: windowRows,
            bands: S.bandCount, crs: WGS84, grid: { west: out.west, north: out.north, pixelLng: out.pixelLng, pixelLat: out.pixelLat },
          });
        } catch (e) { return refuse('warp-sink-failed', { at: 'begin', attempt: attempt, error: String((e && e.message) || e) }); }
        if (r && r.ok === false) return refuse('warp-sink-failed', { at: 'begin', attempt: attempt, why: r.why == null ? null : r.why, detail: r.detail == null ? null : r.detail });
        return undefined;
      };

      /* THIS THREAD, COMPLETELY — the walk this file has had since #R756. ⚠ THE GEOMETRY IS COMPUTED
         PER PIXEL AND NEVER MATERIALISED, so the only thing resident is the output — which is why
         this path is blocked ONLY when there is a sink to hand a window to. Without one there is
         nothing a split could release, and it would change the order in which floats are produced
         for no gain. */
      const here = async () => {
        reset(false);
        const b = await beginSink();
        if (b !== undefined) return b;
        if (!sink) return walk(0, N);
        for (let r0 = 0; r0 < H; r0 += windowRows) {
          const rows = Math.min(windowRows, H - r0);
          const bad = openWindow(r0, rows);
          if (bad) return bad;
          const v = await walk(r0 * W, rows * W);
          if (v !== undefined) return v;
          const f = await flushWindow();
          if (f !== undefined) return f;
        }
        return undefined;
      };

      /* ── the other thread, in blocks that fit the budget (#R783) ────────────────────────────
         Returns { ended } — the walk's answer, which is `undefined` when it finished — or
         { retry: note }, meaning nothing about this warp is off-thread and the note says why. */
      const there = async (w) => {
        /* ⚠ A PROJECTED SOURCE NEEDS proj4 PER PIXEL AND THE WORKER HAS NONE (see the section above
           the job). This is a capability of the environment, not a failure of the door. */
        if (!P.wgs84) return { retry: { used: false, reason: 'crs-not-in-worker', detail: { crs: fromCode } } };
        /* ⚠ (#R819) AN EXACT FOOTPRINT IS A RING, AND THE JOB ANSWERS WITH BOXES. Shipping a ring
           would mean shipping the refinement — which calls the projection per edge position, which is
           the same proj4 the note above says is not there — and a job that returned boxes for a run
           that asked for rings would be the silent wrong answer this layer refuses. So it is stated
           and the warp runs here, completely, exactly as a projected source does. */
        if (exact) return { retry: { used: false, reason: 'exact-footprint-not-in-worker', detail: { footprint: FP.mode } } };
        const reg = ensureGeomJob(w);
        if (!reg.ok) return { retry: { used: false, reason: reg.reason, detail: reg.detail } };
        /* ⚠ THE UNIT IS AN OUTPUT ROW AND ITS COST IS WHAT COMES BACK FOR IT: two float64 for every
           pixel's centre, four more for an areal footprint. That is the biggest thing in flight —
           the payload going the other way is nine numbers — so it is what the budget is spent on.
           ⚠⚠⚠ (#R819) AND WHEN A SINK WAS OFFERED, AN OUTPUT ROW IS HELD FOR THE SAME BLOCK: the
           window is written when the block is done, so the two are resident together and ONE row
           count sizes both. That is the whole of 「予算を合計に対して効かせる」 here — a plan made for
           the geometry alone was a budget spent on the smaller half. A run with no sink holds the
           output whole whatever this says, and `memory.overBudget` is where that is stated. */
        const bytesPerRow = geomRowBytes + (sink ? outRowBytes : 0);
        const plan = w.planBlocks({ units: H, bytesPerUnit: bytesPerRow, budgetBytes: bud.bytes, inFlight: 1 });
        if (!plan.ok) return { retry: { used: false, reason: plan.why, detail: plan.detail } };
        /* The window and the block are the same rows, so nothing has to reconcile two row counts. */
        if (sink && plan.plan && plan.plan.unitsPerBlock) windowRows = plan.plan.unitsPerBlock;

        /* ⚠ A RUN THAT COULD NOT BE STOPPED IS NOT STARTED OFF-THREAD. js/gis-raster.js says the
           same sentence about the same shape: a reader who handed over a ctx handed over a stop
           button, and starting a job whose cancellation has nowhere to go would make that button
           decoration. */
        let stop = null;
        if (ctx) {
          try { if (typeof ctx.aborted === 'function' && ctx.aborted()) return { ended: S.R.cancelled(0, N) }; } catch (_) { }
          if (typeof AbortController !== 'function') return { retry: { used: false, reason: 'stop-handle-unavailable' } };
          stop = new AbortController();
          /* Carried, not re-read: the ctx's own signal must reach the thread, or the reader's cancel
             stops working the moment the work moves one call deeper. */
          if (ctx.signal) { try { ctx.signal.addEventListener('abort', () => stop.abort(), { once: true }); } catch (_) { } }
        }

        reset(true);
        const b = await beginSink();
        if (b !== undefined) return { ended: b };
        let ended;
        const res = await w.runBlocks(WARP_GEOM_JOB, plan, {
          signal: stop ? stop.signal : null,
          make: (from, count) => ({
            affine: S.affine, det: S.det,
            west: out.west, north: out.north, pixelLng: out.pixelLng, pixelLat: out.pixelLat,
            width: W, row0: from, rows: count, areal: areal,
          }),
          /* ⚠ THE SAMPLING HAPPENS HERE, WHILE THE BLOCK IS HELD, and the block is dropped the
             moment it is done — which is what makes the peak the block's and not the grid's.
             ⚠ THE WORKER IS A RUNNER, NOT AN AUTHORITY: geometry of the wrong size is refused by
             name and the whole warp falls back, rather than being read as a grid. */
          take: async (value, from, count) => {
            const cells = count * W;
            const ok = value && value.centres && value.centres.length === cells * 2
              && (!areal || (value.boxes && value.boxes.length === cells * 4));
            if (!ok) return { ok: false, why: 'worker-answer-malformed', detail: { row0: from, rows: count } };
            /* ⚠ (#R819) THE WINDOW IS THE BLOCK'S ROWS. It is opened before the block is sampled and
               handed to the sink the moment it is done, which is what makes the OUTPUT's peak the
               window's and not the grid's — the same sentence #R783 wrote about the geometry, about
               the half of the residency it did not cover. */
            if (sink) {
              const bad = openWindow(from, count);
              if (bad) { ended = bad; return { ok: false, why: 'walk-ended' }; }
            }
            geom = value; geomBase = from * W;
            const r = await walk(from * W, cells);
            geom = null;
            /* A refusal or a cancellation discovered in the sampling ends the whole run: it is
               carried out past the scheduler (which only knows about blocks) and the remaining
               threads are stopped rather than left computing geometry nobody will read. */
            if (r !== undefined) { ended = r; return { ok: false, why: 'walk-ended' }; }
            if (sink) {
              const f = await flushWindow();
              if (f !== undefined) { ended = f; return { ok: false, why: 'walk-ended' }; }
            }
            return undefined;
          },
        });

        if (ended !== undefined) return { ended: ended };
        if (!res || !res.ok) {
          const why = res ? res.why : 'worker-answered-nothing';
          /* ⚠ A CANCELLATION IS NOT A BROKEN WORKER (js/gis-raster.js, same words): re-running the
             whole warp here on behalf of a reader who asked for none of it is the freeze the stop
             button exists to end. Everything else falls back, because 「別のスレッドが駄目だった」
             is not 「答えが無い」. */
          if (why === 'aborted' || why === 'cancelled') return { ended: S.R.cancelled(walked, N) };
          return { retry: { used: false, reason: why, detail: (res && res.detail) || null } };
        }
        return {
          ended: undefined,
          note: {
            used: true, job: WARP_GEOM_JOB,
            blocks: res.blocks, rowsPerBlock: res.unitsPerBlock,
            budgetBytes: res.budgetBytes, peakBytes: res.peakBytes, transferred: res.transferred,
          },
        };
      };

      let note = door ? (door.note || null) : null;
      let ended;
      if (door && door.worker) {
        const r = await there(door.worker);
        if (r.retry) { note = r.retry; ended = await here(); }
        else { note = r.note || note; ended = r.ended; }
      } else {
        ended = await here();
      }
      /* `step` returning anything stopped the walk and that value IS the answer — a refusal from the
         raster kernel, or the cancellation. */
      if (ended !== undefined) return ended;
      return finishWarp(note);

      async function finishWarp(workerNote) {

      const outBands = S.raster.bands.map((b) => ({
        name: (b && b.name != null) ? b.name : null,
        unit: (b && b.unit != null) ? b.unit : null,
        /* ⚠ `nodata: null` — the warp writes NaN and never a sentinel, because every sentinel pixel
           was already answered as 「値が無い」 by js/gis-raster.js `sample` and never reached the
           output. Declaring the source's sentinel here would claim an encoding this grid does not
           use; NaN is missing by the raster contract regardless (docs/GIS-CORE.md §1.4). */
        nodata: null,
        categorical: (b && b.categorical === true) ? true : undefined,
      }));
      for (const b of outBands) if (b.categorical === undefined) delete b.categorical;

      let filled = 0, missingCount = 0, partial = 0, incomplete = 0;
      for (const b of perBand) { filled += b.filled; missingCount += b.missing; partial += b.partial; incomplete += b.incomplete; }

      /* ⚠ (#R783) 「どのスレッドが答えたか」 IS REPORTED, AND ONLY TO A CALLER WHO OFFERED A DOOR.
         A door that was offered and not used is the diagnosis
         [[intmap-atlas-failed-because-intmap-said-so]] asks for: the run SUCCEEDED, and a reader who
         wonders why it held the thread can read why instead of guessing.
         ⚠ AND ITS FIELD IS `reason`, NOT `why` — in this layer `why` is the code of a REFUSAL
         (docs/GIS-CORE.md §2.2) and this object is `ok:true`. js/gis-raster.js `diff` reports the
         same fact under the same two words, deliberately: one vocabulary for 「別スレッドの話」. */
      const rep = {};
      if (workerNote) rep.worker = workerNote;

      /* ⚠ (#R819) WHAT THE RUN HELD, MEASURED RATHER THAN PLANNED. Every term is a number this
         function is in a position to know: the decoded bands it cached, the axis it measured, the
         corner rows it reuses, the geometry block the plan actually used, and the output — whole, or
         one window of it. ⚠ `overBudget` IS A STATEMENT, NOT A FAILURE: the budget governs what was
         still a choice, and a caller who asked for an output larger than the whole budget and
         offered nothing to write it to gets their grid and the reason (CONSTITUTION.md §5). */
      const geomBlockBytes = (workerNote && workerNote.used === true && workerNote.rowsPerBlock) ? workerNote.rowsPerBlock * geomRowBytes : 0;
      const windowBytes = sink ? Math.min(windowRows, H) * outRowBytes : 0;
      const edgeBytes = edgePointsPeak * 2 * 8;
      const peakBytes = fixedBytes + residentOutBytes + geomBlockBytes + windowBytes + edgeBytes;
      rep.memory = {
        budgetBytes: bud.bytes, budgetFrom: bud.from,
        sourceBytes: S.sourceBytes, latAxisBytes: latAxisBytes, cornerRowBytes: cornerRowBytes,
        footprintEdgeBytes: edgeBytes,
        geometryBlockBytes: geomBlockBytes,
        outputBytes: residentOutBytes || windowBytes,
        outputHeld: sink ? 'window' : 'whole',
        peakBytes: peakBytes,
        overBudget: bud.bytes == null ? null : (peakBytes > bud.bytes),
        reason: (bud.bytes != null && peakBytes > bud.bytes)
          ? (sink ? 'window-minimum-is-one-row' : 'output-resident-no-sink')
          : null,
      };
      if (sink) {
        rep.sink = { windows: windows, rowsPerWindow: Math.min(windowRows, H), attempts: attempt, bytesPerWindow: windowBytes };
      }

      /* ⚠ (#R819) AND WHAT WAS APPROXIMATED, ALWAYS — 「どの条件で走ったか」 belongs beside the answer
         and not in the head of whoever chose the options. `boxExcess` is null when nothing measured
         it (a point method, or geometry computed in the other thread where the corners are not in
         this file's hands), which is not the same as zero. */
      rep.footprint = {
        mode: areal ? FP.mode : null,
        tolerance: FP.tolerance,
        toleranceUnit: FP.tolerance == null ? null : 'source-pixels',
        areaTolerance: S.areaTolerance == null ? null : S.areaTolerance,
        latAxis: latAxisNote,
        boxExcess: (areal && FP.mode === 'box')
          ? (boxExcessSeen ? { max: boxExcess, at: boxExcessAt } : { max: null, at: null, reason: offThread ? 'geometry-off-thread' : 'not-measured' })
          : null,
        ring: exact
          ? { maxPositions: segMax, meanPositions: N > 0 ? segTotal / N : 0, maxDeviation: devMax, depthLimited: depthLimited, maxDepth: MAX_REFINE_DEPTH }
          : null,
      };

      const written = {
        width: W, height: H,
        bands: outBands,
        crs: WGS84,
        /* ⚠ CARRIED, so the result says where it came from rather than looking native. It is the
           same field docs/GIS-CORE.md §1 defines for a vector dataset, meaning the same thing. */
        sourceCrs: fromCode,
        grid: { west: out.west, north: out.north, pixelLng: out.pixelLng, pixelLat: out.pixelLat },
        affine: [out.west, out.pixelLng, 0, out.north, 0, -out.pixelLat],
      };

      const report = Object.assign(rep, {
        from: fromCode, to: WGS84, method: S.method, kind: S.kind,
        width: W, height: H, pixelLng: out.pixelLng, pixelLat: out.pixelLat,
        west: out.west, north: out.north,
        filled: filled, missing: missingCount, partial: partial, incomplete: incomplete,
        clipped: clipped, failed: failed,
        cells: N, bands: perBand,
      });

      /* ⚠⚠⚠ A WINDOWED RUN HAS NO GRID TO HAND BACK, AND SAYS SO BY CARRYING NULL. The alternative
         — a grid object whose `read` answers null for every band — is a raster contract that is not
         one, and a caller would find that out at the first `validate`. `written` describes the grid
         the SINK now holds, in the same fields, so a caller can register what it wrote. */
      if (sink) {
        let value = null;
        if (typeof sink.end === 'function') {
          let r;
          try { r = await sink.end({ windows: windows, width: W, height: H, bands: S.bandCount, report: report }); } catch (e) { return refuse('warp-sink-failed', { at: 'end', error: String((e && e.message) || e) }); }
          if (r && r.ok === false) return refuse('warp-sink-failed', { at: 'end', why: r.why == null ? null : r.why, detail: r.detail == null ? null : r.detail });
          value = (r && r.value !== undefined) ? r.value : null;
        }
        rep.sink.value = value;
        return { ok: true, windowed: true, grid: null, written: written, report: report };
      }

      const held = bands;
      return {
        ok: true,
        grid: Object.assign({}, written, {
          read: (i) => { const k = (i == null) ? 0 : i; return (k >= 0 && k < held.length) ? held[k] : null; },
        }),
        report: report,
      };
      }
    }

    /* ── to4326 ───────────────────────────────────────────────────────────────────────────────── */

    async function to4326(g, opts) {
      const o = opts || {};
      const S = prepareSource(g, o);
      if (!S.ok) return S;
      S.opts = o;
      const P = await projector(g.crs);
      if (!P.ok) return P;

      const ext = sourceExtent(S, P);
      if (!ext.ok) return ext;
      const bb = ext.bbox;

      let pixelLng, pixelLat, width, height;
      const wantW = (o.width == null) ? null : o.width;
      const wantH = (o.height == null) ? null : o.height;
      if (wantW != null && (!isInt(wantW) || wantW <= 0)) return refuse('size-invalid', { field: 'width', value: wantW });
      if (wantH != null && (!isInt(wantH) || wantH <= 0)) return refuse('size-invalid', { field: 'height', value: wantH });

      if (wantW != null && wantH != null) {
        width = wantW; height = wantH;
        pixelLng = (bb[2] - bb[0]) / width; pixelLat = (bb[3] - bb[1]) / height;
      } else {
        const nat = nativePixelSize(S, P);
        if (!nat.ok) return nat;
        pixelLng = nat.pixelLng; pixelLat = nat.pixelLat;
        if (wantW != null) { width = wantW; pixelLng = (bb[2] - bb[0]) / width; }
        else { width = pixelCount(bb[2] - bb[0], pixelLng); }
        if (wantH != null) { height = wantH; pixelLat = (bb[3] - bb[1]) / height; }
        else { height = pixelCount(bb[3] - bb[1], pixelLat); }
        if (width == null || height == null) return refuse('pixel-size-underivable', { pixelLng: pixelLng, pixelLat: pixelLat });
      }
      /* The extent is kept at the NORTH-WEST corner and grown east/south by whole pixels, so the
         output covers the whole source rather than cutting the last fraction of a pixel off it. */
      const out = { west: bb[0], north: bb[3], pixelLng: pixelLng, pixelLat: pixelLat, width: width, height: height };
      return runWarp(S, P, out, P.code);
    }

    /* ── resample: onto a grid the caller names ───────────────────────────────────────────────── */

    function validTarget(t) {
      if (!t || typeof t !== 'object') return refuse('target-invalid', { field: 'target' });
      for (const k of ['west', 'north', 'pixelLng', 'pixelLat']) {
        if (!isNum(t[k])) return refuse('target-invalid', { field: k, value: t[k] });
      }
      if (!(t.pixelLng > 0)) return refuse('target-invalid', { field: 'pixelLng', value: t.pixelLng });
      if (!(t.pixelLat > 0)) return refuse('target-invalid', { field: 'pixelLat', value: t.pixelLat });
      if (!isInt(t.width) || t.width <= 0) return refuse('target-invalid', { field: 'width', value: t.width });
      if (!isInt(t.height) || t.height <= 0) return refuse('target-invalid', { field: 'height', value: t.height });
      return { ok: true };
    }

    /* The other half of the same machine: the grid is already in degrees and the caller has a grid
       they want it ON — which is what `diff`'s `grid-mismatch` sends a reader here for. ⚠ The source
       CRS is still ASKED rather than assumed: a grid that says EPSG:32654 and is resampled as if its
       metres were degrees is the silent wrong answer this layer exists to refuse, and `to4326` is the
       entrance for it. */
    async function resample(g, target, opts) {
      const o = opts || {};
      const tv = validTarget(target);
      if (!tv.ok) return tv;
      const S = prepareSource(g, o);
      if (!S.ok) return S;
      S.opts = o;
      const C = CRS();
      if (!C || typeof C.isWgs84 !== 'function') return refuse('crs-unavailable');
      if (g.crs == null || String(g.crs).trim() === '') return refuse('crs-not-stated');
      if (!C.isWgs84(g.crs)) return refuse('resample-source-not-4326', { crs: String(g.crs) });
      const P = await projector(g.crs);
      if (!P.ok) return P;
      const out = {
        west: target.west, north: target.north,
        pixelLng: target.pixelLng, pixelLat: target.pixelLat,
        width: target.width, height: target.height,
      };
      return runWarp(S, P, out, P.code);
    }

    /* ── align: one grid for two ──────────────────────────────────────────────────────────────── */

    /* The 4326 grid a record states, however it states it. */
    function as4326Grid(g, which) {
      if (!g || typeof g !== 'object') return refuse('raster-invalid', { which: which, field: 'raster' });
      if (!isInt(g.width) || g.width <= 0) return refuse('raster-invalid', { which: which, field: 'width', value: g.width });
      if (!isInt(g.height) || g.height <= 0) return refuse('raster-invalid', { which: which, field: 'height', value: g.height });
      const C = CRS();
      if (!C || typeof C.isWgs84 !== 'function') return refuse('crs-unavailable');
      if (g.crs == null || String(g.crs).trim() === '') return refuse('crs-not-stated', { which: which });
      /* ⚠ A COMMON GRID IS A GRID IN DEGREES. Two rasters in two projections have no common grid
         until both have been through `to4326`, and picking one of the two projections here would be
         a choice made on the caller's behalf — the very thing `rule` exists to stop. */
      if (!C.isWgs84(g.crs)) return refuse('align-needs-4326', { which: which, crs: String(g.crs) });
      const aff = affineOf(g);
      if (!aff.ok) return Object.assign({}, aff, { detail: Object.assign({ which: which }, aff.detail || {}) });
      const A = aff.affine;
      /* A rotated affine in degrees is not a north-up grid, and a north-up common grid cannot
         describe it. It is refused by name rather than approximated by its bounding box. */
      if (A[2] !== 0 || A[4] !== 0) return refuse('align-grid-rotated', { which: which, affine: A });
      if (!(A[1] > 0) || !(A[5] < 0)) return refuse('align-grid-not-north-up', { which: which, affine: A });
      return {
        ok: true,
        west: A[0], north: A[3], pixelLng: A[1], pixelLat: -A[5],
        width: g.width, height: g.height,
      };
    }

    /* ⚠ `rule` IS THE CALLER'S AND HAS NO DEFAULT, for the reason `method` has none: resampling the
       finer grid down destroys detail and resampling the coarser one up invents it, and which of
       those is acceptable depends on the question being asked, not on the grids. */
    const ALIGN_RULES = ['finer', 'coarser', 'first'];

    function align(gridA, gridB, opts) {
      const o = opts || {};
      const rule = (o.rule == null) ? null : String(o.rule);
      if (!rule) return refuse('align-rule-not-stated', { rules: ALIGN_RULES.slice() });
      if (ALIGN_RULES.indexOf(rule) < 0) return refuse('align-rule-unknown', { rule: rule, rules: ALIGN_RULES.slice() });
      const A = as4326Grid(gridA, 'a'); if (!A.ok) return A;
      const B = as4326Grid(gridB, 'b'); if (!B.ok) return B;

      const bbox = (G) => [G.west, G.north - G.pixelLat * G.height, G.west + G.pixelLng * G.width, G.north];
      const ba = bbox(A), bb = bbox(B);
      const west = Math.max(ba[0], bb[0]), east = Math.min(ba[2], bb[2]);
      const south = Math.max(ba[1], bb[1]), north = Math.min(ba[3], bb[3]);
      /* ⚠ TOUCHING IS NOT OVERLAPPING. Two grids that share an edge have an intersection of zero
         width, and a 「共通の格子」 of zero pixels is not an answer — it is the same disjointness with
         a rounding error in front of it. */
      if (!(east > west) || !(north > south)) return refuse('grids-disjoint', { a: ba, b: bb });

      /* The pixel's ground size is compared as an AREA in degrees, so a grid finer in one axis and
         coarser in the other is decided rather than half-chosen. */
      const areaA = A.pixelLng * A.pixelLat, areaB = B.pixelLng * B.pixelLat;
      let ref;
      if (rule === 'first') ref = A;
      else if (rule === 'finer') ref = (areaA <= areaB) ? A : B;
      else ref = (areaA >= areaB) ? A : B;

      /* ⚠ THE ORIGIN IS SNAPPED TO THE REFERENCE GRID'S OWN PIXEL EDGES. Without this, aligning a
         grid with itself would produce a target offset by a fraction of a pixel and every value
         would be resampled — a warp where a copy was the right answer. With it, align(a, a) IS a's
         grid, and a resample onto it moves nothing. */
      const wSteps = Math.floor((west - ref.west) / ref.pixelLng + COUNT_EPS);
      const nSteps = Math.floor((ref.north - north) / ref.pixelLat + COUNT_EPS);
      const tWest = ref.west + wSteps * ref.pixelLng;
      const tNorth = ref.north - nSteps * ref.pixelLat;
      const width = pixelCount(east - tWest, ref.pixelLng);
      const height = pixelCount(tNorth - south, ref.pixelLat);
      if (width == null || height == null) return refuse('grids-disjoint', { a: ba, b: bb });

      return {
        ok: true,
        target: {
          west: tWest, north: tNorth,
          pixelLng: ref.pixelLng, pixelLat: ref.pixelLat,
          width: width, height: height,
        },
        /* Which grid decided the resolution, so a caller can say 「B の解像度に合わせた」 instead of
           reporting a number with no author. */
        rule: rule, from: (ref === A) ? 'a' : 'b',
        intersection: [west, south, east, north],
      };
    }

    /* (#R752) ⚠ THE VERSION OF THIS KERNEL. What this file decides IS an answer: the resampling
       method, the inverse mapping, how the output extent is walked, which grid `align` calls the
       reference. A saved recipe that resampled with bilinear replays through whatever bilinear means
       the day it is reopened, and until this round nothing recorded which one that was — #R749 built
       both this file and the version machinery and did not connect them. The keeper is
       scripts/gis-kernel-versions.mjs; js/gis-project.js records it beside the ops version. */
    const KERNEL_VERSION = 'warp-1';
    const API = {
      /* which implementation answered — see KERNEL_VERSION above */
      version: () => KERNEL_VERSION,
      methods, to4326, resample, align,
      /* the vocabularies, published for the same reason js/gis-raster.js publishes its condition
         ops: a UI reads the declaration rather than keeping a hand-written copy of it */
      alignRules: () => ALIGN_RULES.slice(),
      /* (#R819) the same reason again: a panel offering 「正確な footprint」 reads the list rather
         than keeping a copy of it, and `exact` is only offerable where the raster kernel takes a
         ring — which `footprintPlan` asks it, not this list. */
      footprintModes: () => FOOTPRINT_MODES.slice(),
      /* exposed because js/gis-geotiff.js and the panel describe the same grid, and a second copy of
         「a north-up grid IS an affine」 is how the two would disagree */
      affineOf,
    };
    try { window.IntMapGisWarp = API; } catch (_) { }
    return API;
  })();
}
