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

    const SAMPLE_METHODS = ['nearest', 'bilinear'];

    function sample(raster, bandIndex, lng, lat, opts) {
      const v = validate(raster);
      if (!v.ok) return v;
      if (!isNum(lng) || !isNum(lat)) return refuse('position-invalid', { lng: lng, lat: lat });
      const method = (opts && opts.method) ? String(opts.method) : 'nearest';
      if (SAMPLE_METHODS.indexOf(method) < 0) return refuse('sample-method-unknown', { method: method, methods: SAMPLE_METHODS.slice() });
      const V = values(raster, bandIndex);
      if (!V.ok) return V;
      return sampleWith(raster, V, lng, lat, method);
    }

    /* Split from sample() so a caller taking thousands of samples (the zonal walk, `fromSampler`'s
       own consumers) pays for validate() and read() once. */
    function sampleWith(raster, V, lng, lat, method) {
      const at = pixelAt(raster, lng, lat);
      if (!at) return refuse('outside', { lng: lng, lat: lat, bbox: bboxOf(raster) });
      const nearestValue = V.values[at.row * raster.width + at.col];
      const nearest = () => missing(nearestValue, V.nodata)
        ? { ok: true, value: null, nodata: true, row: at.row, col: at.col, method: 'nearest' }
        : { ok: true, value: nearestValue, row: at.row, col: at.col, method: 'nearest' };
      if (method === 'nearest') return nearest();

      /* Bilinear between the four PIXEL CENTRES surrounding the position. The fractional index is
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
      const corners = [
        [cy(y0), cx(x0), (1 - tx) * (1 - ty)],
        [cy(y0), cx(x0 + 1), tx * (1 - ty)],
        [cy(y0 + 1), cx(x0), (1 - tx) * ty],
        [cy(y0 + 1), cx(x0 + 1), tx * ty],
      ];
      let acc = 0;
      for (const c of corners) {
        const val = V.values[c[0] * raster.width + c[1]];
        /* ⚠⚠⚠ ONE VOID AMONG THREE MEASUREMENTS IS THE Lake-Biwa −7,800 m BUG (see the header). The
           blend is abandoned, not patched with a substitute, and the fallback declares itself. */
        if (missing(val, V.nodata)) {
          const near = nearest();
          near.partial = true;
          near.requested = 'bilinear';
          return near;
        }
        acc += val * c[2];
      }
      return { ok: true, value: acc, row: at.row, col: at.col, method: 'bilinear' };
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
      let min = null, max = null;
      const classAreas = wantClasses ? Object.create(null) : null;

      for (let row = row0; row <= row1; row++) {
        const lat = rowCentreLat(raster, row);
        const cellKm2 = rowAreaKm2(raster, row);
        if (cellKm2 == null) return refuse('geodesy-missing');
        const base = row * raster.width;
        for (const range of colRanges) for (let col = range[0]; col <= range[1]; col++) {
          /* ⚠ THE PIXEL BELONGS TO THE ZONE WHEN ITS CENTRE IS INSIDE IT — the judgement stated in
             the header. No boundary pixel is split by area fraction, and none is counted twice. */
          if (!GG.pointInGeometry([colCentreLng(raster, col), lat], geometry)) continue;
          areaKm2 += cellKm2;
          const val = V.values[base + col];
          if (missing(val, V.nodata)) { nodataCount++; continue; }
          count++;
          sum += val;
          wsum += val * cellKm2;
          valueAreaKm2 += cellKm2;
          if (min == null || val < min) min = val;
          if (max == null || val > max) max = val;
          if (classAreas) {
            /* ⚠ NOT ROUNDED. A grid of 0.37 and 1.84 is not a classification with classes 0 and 2 —
               it is a continuous field, and answering 「区分ごとの面積」 about it would be an invented
               classification the reader would then compare against published figures. Refused by
               name, with the pixel that proved it. */
            if (!isInt(val)) return refuse('values-not-integer', { row: row, col: col, value: val });
            const k = String(val);
            classAreas[k] = (classAreas[k] || 0) + cellKm2;
          }
        }
      }

      const out = {
        ok: true,
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
      return out;
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
    function mask(raster, bandIndex, condition) {
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
      for (let i = 0; i < n; i++) {
        const val = V.values[i];
        if (missing(val, V.nodata)) { out[i] = NaN; missingCount++; continue; }
        if (t.test(val)) { out[i] = val; kept++; } else { out[i] = NaN; dropped++; }
      }
      return {
        ok: true,
        raster: derived(raster, [{ name: V.band.name, unit: V.band.unit == null ? null : V.band.unit, nodata: V.nodata }], out),
        kept: kept, dropped: dropped, nodataCount: missingCount,
      };
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

    /* a − b, pixel by pixel, on the grid both of them are on. ⚠ TWO GRIDS THAT ARE NOT THE SAME GRID
       ARE NOT RESAMPLED HERE. Resampling is a CHOICE (which of nearest/bilinear/area-average, onto
       whose grid, with what happening at the voids), and making it silently inside a subtraction
       hands the reader a difference map whose every pixel is a blend of two interpolations nobody
       named. `grid-mismatch` says which fields differ and by how much, and a caller that wants the
       comparison can put both grids on one grid with `fromSampler` — where the choice is theirs and
       is written down. */
    function diff(a, b, bandIndex) {
      /* WHICH of the two is invalid, because 「片方が壊れている」 without saying which one sends the
         reader to look at the grid that was fine. */
      const va = validate(a); if (!va.ok) return refuse('raster-invalid', { which: 'a', field: (va.detail && va.detail.field) || null });
      const vb = validate(b); if (!vb.ok) return refuse('raster-invalid', { which: 'b', field: (vb.detail && vb.detail.field) || null });
      const off = gridDelta(a, b);
      if (off) return refuse('grid-mismatch', off);
      const A = values(a, bandIndex); if (!A.ok) return A;
      const B = values(b, bandIndex); if (!B.ok) return B;
      const n = a.width * a.height;
      let out;
      try { out = new Float64Array(n); } catch (e) { return refuse('raster-too-large', { cells: n }); }
      let count = 0, missingCount = 0;
      for (let i = 0; i < n; i++) {
        const x = A.values[i], y = B.values[i];
        /* ⚠ Either side missing means the DIFFERENCE is missing. A void read as 0 would report the
           other grid's value as the change — the same 「void blended into a measurement」 failure as
           the bilinear above, in subtraction form. */
        if (missing(x, A.nodata) || missing(y, B.nodata)) { out[i] = NaN; missingCount++; continue; }
        out[i] = x - y; count++;
      }
      /* The unit survives only if both sides state the same one: 「mm − °C」 has no unit, and writing
         one of the two would let a chart label a nonsense number confidently. */
      const unit = (A.band.unit != null && B.band.unit != null && String(A.band.unit) === String(B.band.unit)) ? A.band.unit : null;
      const name = String(A.band.name == null ? '' : A.band.name) + ' − ' + String(B.band.name == null ? '' : B.band.name);
      return {
        ok: true,
        /* nodata null: the difference declares no sentinel, it writes NaN (see mask). */
        raster: derived(a, [{ name: name, unit: unit, nodata: null }], out),
        count: count, nodataCount: missingCount,
      };
    }

    /* One constructor for every grid this file produces, so `mask` and `diff` cannot drift in what
       they hand back and both satisfy validate() by construction. `read` answers only for the bands
       it has — an index outside them is band-out-of-range at the entrances, and null here rather
       than a wrong band's numbers. */
    function derived(like, bands, data) {
      const g = like.grid;
      return {
        width: like.width, height: like.height,
        bands: bands,
        grid: { west: g.west, north: g.north, pixelLng: g.pixelLng, pixelLat: g.pixelLat },
        read: (i) => ((i == null ? 0 : i) === 0 ? data : null),
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
          if (sig && sig.aborted) return refuse('cancelled', { done: done, total: total, rows: row, of: height });
          let val;
          try { val = await o.sample(colCentreLng(raster, col), lat); } catch (err) { val = null; failed++; }
          if (isNum(val)) { data[base + col] = val; filled++; }
          else {
            data[base + col] = NaN; empty++;
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
      if (sig && sig.aborted) return refuse('cancelled', { done: done, total: total, rows: height, of: height });
      if (onp) { try { onp({ rows: height, of: height, done: done, total: total, read: filled }); } catch (_) { } }
      return { ok: true, raster: raster, filled: filled, empty: empty, failed: failed, textSeen: textSeen };
    }

    const API = {
      validate,
      bboxOf, pixelAreaKm2, sample, zonal, mask, diff, describeBands, fromSampler, fromSamplerAsync,
      /* ⚠ (#R749) PUBLISHED BECAUSE TWO OTHER FILES ASK THE SAME TWO QUESTIONS PER PIXEL. js/map-ui.js
         burns a grid onto a canvas and has to ask 「このセルは欠損か」 for every one of them, and
         js/gis-sources.js hands a band's values to a caller; both would otherwise spell the rule a
         second time, and the second spelling is always the one that forgets that ±Infinity is not a
         measurement. The meaning is unchanged — these are the private functions, exposed. */
      missing, values,
      /* the one frame budget this layer has (see FRAME_MS), so a caller staying interruptible does
         not write the number a second time */
      frameMs: () => FRAME_MS,
      /* exposed because js/gis-datasets.js describes a grid to the panel with the same numbers, and
         a second walk of the same arithmetic there is how the two would disagree */
      pixelAt, rowCentreLat, colCentreLng,
      /* the condition vocabulary this file accepts, so a UI can offer it without a hand-written list
         (docs/GIS-CORE.md §2.1: 「宣言を読むのは UI の仕事、持つのは op の仕事」) */
      conditionOps: () => CONDITION_OPS.slice(),
      sampleMethods: () => SAMPLE_METHODS.slice(),
    };
    try { window.IntMapGisRaster = API; } catch (_) { }
    return API;
  })();
}
