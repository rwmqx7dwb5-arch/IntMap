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

      const cache = [];
      for (let i = 0; i < g.bands.length; i++) {
        try { cache[i] = g.read(i); } catch (e) { return refuse('read-failed', { bandIndex: i, error: String((e && e.message) || e) }); }
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
      };
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
      const bands = [];
      for (let i = 0; i < S.bandCount; i++) {
        /* ⚠ NO CEILING IS INVENTED — the allocation is the limit, and it fails with the number of
           cells in hand. The same rule js/gis-raster.js `fromSampler` states. */
        try { bands.push(new Float64Array(N)); } catch (e) { return refuse('raster-too-large', { cells: N, bands: S.bandCount }); }
      }
      const ctx = S.R.useCtx(S.opts);
      const sw = S.raster.width, sh = S.raster.height;
      const opt = { method: S.method };
      const areal = (S.kind === 'areal');

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
      }

      /* THE FOOTPRINT OF AN OUTPUT PIXEL, in source pixel coordinates: its four corners taken back
         through the same two doors its centre goes through, and the box that holds them. ⚠ THE BOX
         ERRS OUTWARD (a projected quadrilateral is not a rectangle in the source's pixel space), and
         outward is the only direction a footprint may err — js/gis-raster.js says the same of its
         column prefilter: an aggregate over slightly more ground is blunt, one over slightly less
         drops observations that were asked for.
         ⚠ A row of corners is computed ONCE and becomes the next row's top edge, so the whole warp
         costs (W+1)·(H+1) extra transforms rather than 4·W·H. */
      const cornerRow = (r) => {
        const lat = out.north - out.pixelLat * r;
        const arr = new Float64Array((W + 1) * 2);
        for (let c = 0; c <= W; c++) {
          const lng = out.west + out.pixelLng * c;
          const xy = P.wgs84 ? [lng, lat] : P.forward(lng, lat);
          if (!xy) { arr[c * 2] = NaN; arr[c * 2 + 1] = NaN; continue; }
          const pp = S.inverse(xy[0], xy[1]);
          arr[c * 2] = pp[0]; arr[c * 2 + 1] = pp[1];
        }
        return arr;
      };
      const reset = (off) => {
        offThread = !!off;
        perBand = [];
        for (let i = 0; i < S.bandCount; i++) perBand.push({ filled: 0, missing: 0, partial: 0, incomplete: 0 });
        clipped = 0; failed = 0; walked = 0;
        curRow = -1; lat = 0; base = 0;
        geom = null; geomBase = 0;
        /* The first row's top edge, for the walk that computes its own corners. A blocked run gets
           its corner rows from the worker, so nothing is computed here for it. */
        topCorners = (areal && !offThread) ? cornerRow(0) : null;
        botCorners = null;
      };

      /* ⚠ (#R783) THE VALUE IS ASKED IN ONE PLACE, WHICHEVER THREAD FOUND THE POSITION. `step`
         below has two arms — one reads a pixel's source position out of a block a worker computed,
         one computes it here — and the moment each of them had its own sampling loop they would be
         two answers to 「この画素は何か」: the bounds test, `outside`, `partial`, `incomplete` and
         the void write are all decisions, and a second copy of them is how the two threads would
         come to disagree about the same grid (.agents/rules/no-ad-hoc-hardcoding.md §2-3). */
      const voidAt = (at) => { for (let i = 0; i < S.bandCount; i++) bands[i][at] = NaN; };
      const valueAt = (px, py, at) => {
        if (!(px >= 0 && px < sw && py >= 0 && py < sh)) { clipped++; voidAt(at); return; }
        for (let i = 0; i < S.bandCount; i++) {
          /* The pixel-space proxy: column as 「lng」, negated row as 「lat」 (header). */
          const s = S.R.sample(S.proxy, i, px, -py, opt);
          if (!s.ok) {
            /* `outside` cannot happen after the bounds test above, but a real refusal from the
               raster kernel (a short band, a read that threw) is the caller's answer, not a NaN
               pixel — a warp that quietly produced a grid of voids from an unreadable band would
               be the ハリボテ CONSTITUTION.md forbids. */
            if (s.why === 'outside') { clipped++; bands[i][at] = NaN; continue; }
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
          if (s.value == null) { bands[i][at] = NaN; perBand[i].missing++; }
          else { bands[i][at] = s.value; perBand[i].filled++; }
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
          if (curRow >= 0 && areal && !geom) topCorners = botCorners;
          curRow = row;
          lat = out.north - out.pixelLat * (row + 0.5);
          base = row * W;
          if (areal && !geom) botCorners = cornerRow(row + 1);
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
            opt.cell = boxOf(ax, ay, bx, by, cx2, cy2, dx, dy);
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

      /* THIS THREAD, COMPLETELY — the walk this file has had since #R756, unchanged. ⚠ NOTHING IS
         BLOCKED HERE ON PURPOSE: the geometry is computed per pixel and never materialised, so the
         only thing resident is the output itself and there is no residency for a budget to govern.
         A block structure here would be a split that saves nothing and changes the order in which
         floats are produced. */
      const here = () => { reset(false); return walk(0, N); };

      /* ── the other thread, in blocks that fit the budget (#R783) ────────────────────────────
         Returns { ended } — the walk's answer, which is `undefined` when it finished — or
         { retry: note }, meaning nothing about this warp is off-thread and the note says why. */
      const there = async (w) => {
        /* ⚠ A PROJECTED SOURCE NEEDS proj4 PER PIXEL AND THE WORKER HAS NONE (see the section above
           the job). This is a capability of the environment, not a failure of the door. */
        if (!P.wgs84) return { retry: { used: false, reason: 'crs-not-in-worker', detail: { crs: fromCode } } };
        const reg = ensureGeomJob(w);
        if (!reg.ok) return { retry: { used: false, reason: reg.reason, detail: reg.detail } };
        /* ⚠ THE UNIT IS AN OUTPUT ROW AND ITS COST IS WHAT COMES BACK FOR IT: two float64 for every
           pixel's centre, four more for an areal footprint. That is the biggest thing in flight —
           the payload going the other way is nine numbers — so it is what the budget is spent on. */
        const bytesPerRow = W * (areal ? 6 : 2) * 8;
        const plan = w.planBlocks({ units: H, bytesPerUnit: bytesPerRow, budgetBytes: (S.opts && S.opts.budgetBytes != null) ? S.opts.budgetBytes : null, inFlight: 1 });
        if (!plan.ok) return { retry: { used: false, reason: plan.why, detail: plan.detail } };

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
            geom = value; geomBase = from * W;
            const r = await walk(from * W, cells);
            geom = null;
            /* A refusal or a cancellation discovered in the sampling ends the whole run: it is
               carried out past the scheduler (which only knows about blocks) and the remaining
               threads are stopped rather than left computing geometry nobody will read. */
            if (r !== undefined) { ended = r; return { ok: false, why: 'walk-ended' }; }
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

      const door = workerDoor(S.opts);
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

      function finishWarp(workerNote) {

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

      return {
        ok: true,
        grid: {
          width: W, height: H,
          bands: outBands,
          crs: WGS84,
          /* ⚠ CARRIED, so the result says where it came from rather than looking native. It is the
             same field docs/GIS-CORE.md §1 defines for a vector dataset, meaning the same thing. */
          sourceCrs: fromCode,
          grid: { west: out.west, north: out.north, pixelLng: out.pixelLng, pixelLat: out.pixelLat },
          affine: [out.west, out.pixelLng, 0, out.north, 0, -out.pixelLat],
          read: (i) => { const k = (i == null) ? 0 : i; return (k >= 0 && k < bands.length) ? bands[k] : null; },
        },
        report: Object.assign(rep, {
          from: fromCode, to: WGS84, method: S.method, kind: S.kind,
          width: W, height: H, pixelLng: out.pixelLng, pixelLat: out.pixelLat,
          west: out.west, north: out.north,
          filled: filled, missing: missingCount, partial: partial, incomplete: incomplete,
          clipped: clipped, failed: failed,
          cells: N, bands: perBand,
        }),
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
      /* exposed because js/gis-geotiff.js and the panel describe the same grid, and a second copy of
         「a north-up grid IS an affine」 is how the two would disagree */
      affineOf,
    };
    try { window.IntMapGisWarp = API; } catch (_) { }
    return API;
  })();
}
