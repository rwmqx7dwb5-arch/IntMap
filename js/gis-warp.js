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
 *  ⚠ AND A CLASSIFICATION IS NOT INTERPOLATED AT ALL. `bands[i].categorical === true` with
 *  `method:'bilinear'` is `bilinear-on-categorical`. ⚠ But being an integer is NOT evidence of being
 *  a classification — a population count is an integer — so nothing here GUESSES: a band that does
 *  not declare itself categorical is warped the way the caller asked, and the refusal exists for the
 *  bands whose producer said what they are.
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
 *  `opts.ctx` and ticks once per output ROW rather than writing a second copy of the rule. ⚠ A caller
 *  that hands over no ctx gets a run that cannot be stopped; that is stated rather than papered over,
 *  and it is why the panel and js/gis-ops.js always pass theirs.
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
       .agents/rules/no-ad-hoc-hardcoding.md §2-4 forbids, and a UI can show 「説明が無い」. */
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
    };

    function methods() {
      const R = RAS();
      /* ⚠ null, not [] — 「訊けなかった」 and 「0 件だった」 must not be one answer. */
      if (!R || typeof R.sampleMethods !== 'function') return null;
      return R.sampleMethods().map((id) => {
        const f = METHOD_FACTS[id];
        return f ? Object.assign({ id: id, stated: true }, f) : { id: id, stated: false };
      });
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

    function makeInverse(A, det) {
      const c = A[0], a = A[1], b = A[2], f = A[3], d = A[4], e = A[5];
      return function (x, y) {
        const dx = x - c, dy = y - f;
        return [(e * dx - b * dy) / det, (-d * dx + a * dy) / det];
      };
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
      if (!R || typeof R.sample !== 'function' || typeof R.sampleMethods !== 'function') return refuse('raster-unavailable');
      if (R.sampleMethods().indexOf(method) < 0) return refuse('resample-method-unknown', { method: method, methods: R.sampleMethods() });

      if (method === 'bilinear') {
        for (let i = 0; i < g.bands.length; i++) {
          const b = g.bands[i] || {};
          /* ⚠ DECLARED, not deduced. Integer values are not evidence — a household count is an
             integer and its average IS meaningful. Only a producer's own statement refuses. */
          if (b.categorical === true) return refuse('bilinear-on-categorical', { bandIndex: i, name: b.name == null ? null : b.name });
        }
      }

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
        raster: g, proxy: proxy, method: method, R: R,
        affine: aff.affine, inverse: makeInverse(aff.affine, aff.det),
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

    /* ── the run ──────────────────────────────────────────────────────────────────────────────── */

    /* docs/GIS-CORE.md §2.6's ctx, taken rather than rebuilt (header). A caller that handed none gets
       `null` here and a run that holds the thread — stated, not simulated with a fake that claims to
       be interruptible. */
    function useCtx(opts) {
      const c = opts && opts.ctx;
      return (c && typeof c.tick === 'function') ? c : null;
    }

    async function runWarp(S, P, out, fromCode) {
      const W = out.width, H = out.height, N = W * H;
      const bands = [];
      for (let i = 0; i < S.bandCount; i++) {
        /* ⚠ NO CEILING IS INVENTED — the allocation is the limit, and it fails with the number of
           cells in hand. The same rule js/gis-raster.js `fromSampler` states. */
        try { bands.push(new Float64Array(N)); } catch (e) { return refuse('raster-too-large', { cells: N, bands: S.bandCount }); }
      }
      const ctx = useCtx(S.opts);
      const perBand = [];
      for (let i = 0; i < S.bandCount; i++) perBand.push({ filled: 0, missing: 0, partial: 0 });
      let clipped = 0, failed = 0;
      const sw = S.raster.width, sh = S.raster.height;
      const opt = { method: S.method };

      for (let row = 0; row < H; row++) {
        const lat = out.north - out.pixelLat * (row + 0.5);
        const base = row * W;
        for (let col = 0; col < W; col++) {
          const lng = out.west + out.pixelLng * (col + 0.5);
          const xy = P.wgs84 ? [lng, lat] : P.forward(lng, lat);
          if (!xy) {
            /* ⚠ 「変換できなかった」 is not 「そこには何も無い」. Both write NaN because there is
               nothing else to write, and they are counted apart so the reader can tell. */
            failed++;
            for (let i = 0; i < S.bandCount; i++) bands[i][base + col] = NaN;
            continue;
          }
          const pp = S.inverse(xy[0], xy[1]);
          if (!(pp[0] >= 0 && pp[0] < sw && pp[1] >= 0 && pp[1] < sh)) {
            clipped++;
            for (let i = 0; i < S.bandCount; i++) bands[i][base + col] = NaN;
            continue;
          }
          for (let i = 0; i < S.bandCount; i++) {
            /* The pixel-space proxy: column as 「lng」, negated row as 「lat」 (header). */
            const s = S.R.sample(S.proxy, i, pp[0], -pp[1], opt);
            if (!s.ok) {
              /* `outside` cannot happen after the bounds test above, but a real refusal from the
                 raster kernel (a short band, a read that threw) is the caller's answer, not a NaN
                 pixel — a warp that quietly produced a grid of voids from an unreadable band would
                 be the ハリボテ CONSTITUTION.md forbids. */
              if (s.why === 'outside') { clipped++; bands[i][base + col] = NaN; continue; }
              return s;
            }
            if (s.partial) perBand[i].partial++;
            if (s.value == null) { bands[i][base + col] = NaN; perBand[i].missing++; }
            else { bands[i][base + col] = s.value; perBand[i].filled++; }
          }
        }
        if (ctx && !(await ctx.tick(W, N))) return refuse('cancelled', { done: row * W, total: N });
      }

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

      let filled = 0, missingCount = 0, partial = 0;
      for (const b of perBand) { filled += b.filled; missingCount += b.missing; partial += b.partial; }

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
        report: {
          from: fromCode, to: WGS84, method: S.method,
          width: W, height: H, pixelLng: out.pixelLng, pixelLat: out.pixelLat,
          west: out.west, north: out.north,
          filled: filled, missing: missingCount, partial: partial,
          clipped: clipped, failed: failed,
          cells: N, bands: perBand,
        },
      };
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

    const API = {
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
