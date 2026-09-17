/* ============================================================================
 *  IntMap · THE OPS — window.IntMapGisOps   (#R729)
 * ----------------------------------------------------------------------------
 *  js/gis-datasets.js made 「データセット」 one thing whatever produced it. This file is the reason
 *  that mattered: AN OP'S OUTPUT IS REGISTERED THE SAME WAY AN IMPORT IS, so it is the input of the
 *  next op with no special case. 「5km バッファ」→「その中の地震だけ」→「県ごとに数える」 is three
 *  registrations, not one hard-coded pipeline, and the chain is re-runnable because every step
 *  writes {kind:'op', op, inputs, params} as its provenance — the recipe, not a label.
 *
 *  ══ WHAT THIS FILE DECLARES, AND WHAT IT REFUSES ══════════════════════════════════════════════
 *  Nine ops: filter, buffer, clip, intersect, difference, union, dissolve, relate, aggregate. Each
 *  DECLARES its inputs, the geometry each input must be, and its parameters; ops() is the only thing
 *  a panel reads. A UI that carried its own list of 「buffer は半径を聞く」 would be the hand-written
 *  list .agents/rules/no-ad-hoc-hardcoding.md forbids — it decides for the ops that exist today and
 *  silently omits the tenth one. (#R725 is the round that made the work list read the capability's
 *  own declared arguments for the same reason.)
 *
 *  ⚠ AND THERE IS NO SECOND LIST BESIDE DECL (#R732). ops() used to map over
 *  `ORDER = ['filter','buffer','clip','aggregate']`, one line under the comment above — so an op
 *  added to DECL and forgotten there would answer run() and never appear in the panel. ORDER is
 *  Object.keys(DECL) now, and the dispatch in run() is a table keyed the same way, because the
 *  if-chain it replaced ended in an unconditional `else` that would have run aggregate for it.
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES. { ok:false, why, detail } — the nine languages live at the
 *  call site, exactly as js/geo-import.js does it. This module has no business knowing what UI it
 *  is in, and a sentence baked in here would be an English-only sentence.
 *
 *  ══ WHAT #R732 STOPPED REFUSING, AND WHY THAT IS NOT A RELAXATION ═════════════════════════════
 *  #R729 refused two things by name, honestly, because it had no engine:
 *    · `buffer-needs-points` — a buffer of a line or a polygon was not implemented, and a bead of
 *      per-vertex disks called 「5km 圏」 would have been the ハリボテ CONSTITUTION.md forbids.
 *    · `clip-window-not-convex` — Sutherland–Hodgman is only correct for a convex window, so the
 *      convexity of every clipper ring was MEASURED and a ward with a hole was turned away.
 *  js/gis-geometry.js is that engine. Neither code is raised by anything now: the buffer is the
 *  Minkowski sum of any geometry with a geodesic disk, and the clip is a Martinez–Rueda sweep-line
 *  that keeps holes, returns disjoint pieces as disjoint pieces, and does not care about concavity.
 *  ⚠ WHAT REPLACED THEM IS NOT SILENCE. An op that needs the kernel declares `needsGeometry`, run()
 *  awaits its lazy load, and a kernel that did not arrive is `geometry-unavailable` — because
 *  「訊けなかった」 and 「0 件だった」 must not reach the reader as the same answer.
 *
 *  ⚠ THE ARITHMETIC THAT IS STILL HERE IS THE ARITHMETIC ABOUT VALUES, NOT SHAPES: which rows pass
 *  a condition, which column is summed, what is written into the output and what is refused because
 *  it would overwrite something. The shapes are the kernel's. areaKm2 stays here because it is the
 *  number this file writes onto its own rows.
 *
 *  AREA IS NOT PLANAR. `areaKm2` is the spherical excess (Chamberlain–Duquette), outer rings added
 *  and holes subtracted, on IntMapGeodesy._R_EARTH_KM — the one radius the rest of the app uses. A
 *  planar degree area would be wrong by cos φ, i.e. by half at 60°, which is most of Europe. See the
 *  note on ringAreaKm2 for the measurement that forced the window it reads a ring in (a polar buffer
 *  whose area came back as the rest of the planet).
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would have been a global before the bundle, and this file may not reintroduce one.
 *
 *  ⚠ window.IntMapData AND window.IntMapGeodesy ARE READ AT CALL TIME, NOT IMPORTED. This module is
 *  loadable in Node with no DOM: makeGisOps() simply does not publish when there is no `window`,
 *  and run() answers `registry-missing` / `geodesy-missing` instead of throwing.
 *
 *  Returns, always:
 *      { ok:true,  dataset }            — already registered in IntMapData, with its provenance
 *      { ok:false, why, detail? }
 * ==========================================================================*/

export function makeGisOps() {
  return (function () {

    /* ── the two things this module borrows from the app, resolved per call ────────────────────
       Held as functions rather than captured at construction time: js/gis-ops.js may be built
       before js/gis-datasets.js publishes, and a captured `undefined` would be permanent. */
    function registry() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }
    function geodesy() { try { return (typeof window !== 'undefined' && window.IntMapGeodesy) || null; } catch (_) { return null; } }
    /* js/gis-geometry.js — the boolean engine, the Minkowski buffer, the predicates and the
       distance. Read at CALL time for the same reason the two above are: this module may be built
       before it publishes, and a captured `undefined` would be permanent. */
    function geometry() { try { return (typeof window !== 'undefined' && window.IntMapGisGeometry) || null; } catch (_) { return null; } }
    /* (#R774) 「この 2 つは同じ量か」 — js/gis-units.js, read at call time like every other kernel. */
    function unitKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisUnits) || null; } catch (_) { return null; } }
    /* (#R735) The grid arithmetic and the spatial index, asked the same way and for the same reason. */
    function rasterKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisRaster) || null; } catch (_) { return null; } }
    function indexKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisIndex) || null; } catch (_) { return null; } }
    /* (#R738) The expression kernel, read at call time like every other one — a module that imported
       it privately would be a second copy of a parser, and js/gis-core.js is the only mounting point. */
    function exprKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisExpr) || null; } catch (_) { return null; } }
    /* (#R752) The warp — coordinate system, resolution, extent, resampling and NoData in one layer.
       ⚠ IT IS HERE BECAUSE `grid-mismatch` NEEDED SOMEWHERE TO GO. js/gis-raster.js refuses two grids
       that are not the same grid, correctly (a resample inside a difference would make every pixel a
       composite of an interpolation nobody named) — but until this round the op layer had no way to
       say 「ではまず合わせる」, so a reader who hit that refusal had to leave the chain, find a button
       in the import panel, and come back. The kernel existed; the door did not. Read at call time for
       the same reason as every kernel above. */
    function warpKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisWarp) || null; } catch (_) { return null; } }
    /* (#R752) The projections. Only `measure` reaches for this, and only when the reader NAMED a
       plane — the geodesic answer needs no projection at all. */
    function crsKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisCrs) || null; } catch (_) { return null; } }
    /* ⚠⚠⚠ (#R759) 「Worker が在る」 と 「普段の分析が Worker で走る」 は別である。js/gis-worker.js has
       been mounted since #R756 and NOTHING CALLED IT: `run`/`register`/`probe` had zero callers in
       js/ and in tests/, one job was registered, and that one was never asked for either. So every
       pixel loop in the app ran on the thread that draws the map, and the module that existed to
       stop that was a module that existed. ⚠ Read at call time like every other kernel, and its
       ABSENCE IS NOT AN ERROR — js/gis-raster.js finishes the same arithmetic here and records why
       it had to (`result.worker.reason`), which is the diagnosis a reader can act on rather than a
       silence they have to guess at ([[intmap-atlas-failed-because-intmap-said-so]]). */
    function workerKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisWorker) || null; } catch (_) { return null; } }
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }

    const D2R = Math.PI / 180;

    /* Two vertices are the same vertex below this. 1e-12° ≈ 0.1 µm at the equator — far below any
       coordinate the importers can produce (a float64 degree resolves ~1e-13° near ±180) and far
       below the 2 km tolerance of the coarsest geometry the app ships. Expires if coordinates ever
       stop being float64 degrees. */
    const SAME_EPS = 1e-12;
    /* Parallel-edge guard for the line/ring crossing test: |cross| in deg² per unit parameter.
       1e-15 deg² is below any turn a float64 coordinate can express at this scale, so two edges
       under it are parallel rather than nearly so. */
    const PARALLEL_EPS = 1e-15;

    /* Below 8 steps the inscribed polygon discards 10.0% of the disk's area ((n/2π)·sin(2π/n) at
       n=8 is 0.900; at n=4 it is 0.637), which is no longer a 5 km buffer. The ceiling bounds the
       size of the output: 4096 vertices per point. */
    const STEPS_MIN = 8, STEPS_MAX = 4096;

    /* ── small geometry utilities ─────────────────────────────────────────────────────────────── */

    function isPos(p) { return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]); }
    function same(a, b) { return Math.abs(a[0] - b[0]) <= SAME_EPS && Math.abs(a[1] - b[1]) <= SAME_EPS; }

    /* A ring as an OPEN list of finite positions: GeoJSON repeats the first vertex at the end and
       every algorithm below closes the ring itself with (i+1)%n. Keeping the duplicate would add a
       zero-length edge, which is exactly the edge whose cross product is 0 and whose intersection
       parameter is 0/0. */
    function ringPositions(ring) {
      if (!Array.isArray(ring)) return [];
      const out = [];
      for (const p of ring) { if (!isPos(p)) continue; if (out.length && same(out[out.length - 1], p)) continue; out.push([p[0], p[1]]); }
      while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
      return out;
    }

    /* ── area: spherical excess, not planar degrees ───────────────────────────────────────────── */

    /* Chamberlain & Duquette: A = R²/2 · |Σ Δλ·(2 + sin φ₁ + sin φ₂)|.
       ⚠ Δλ IS THE EDGE AS WRITTEN, NOT THE SHORT WAY ROUND, and that is the whole correctness of
       this function for the geometry this file produces. IntMapGeodesy.diskFillPolys returns a polar
       disk as a ring that runs the full width of the window and closes along the 89.9999° line —
       read edge by edge that ring is closed and Σ Δλ is exactly 0, which is the plate-carrée region
       the renderer draws. Normalising each edge to the short way deletes the −360° closing edge, the
       ring then reads as winding once around the pole, and the formula answers with the COMPLEMENT:
       measured, a 500 km buffer at 89°N came out as 509,280,824 km² instead of 785,200.

       ⚠⚠⚠ (#R774) AND THAT SENTENCE WAS TRUE ABOUT ONE READING AND SILENT ABOUT THE OTHER. The
       block above went on to say 「a ring that states a seam crossing by jumping 170 → −170 is not
       in this window at all … its area is not defined here」 — but nothing REFUSED such a ring, so
       an undivided seam-crossing polygon was measured with Δλ = −358 and answered with a number.
       MEASURED: 179°E→179°W × 0°–1° came back as 4,426,211 km², 179 times the 24,727 km² of the
       same band ten degrees away, while js/gis-geometry.js pointInGeometry — which aligns the ring
       to the query point first — called 180°,0.5° INSIDE and 0°,0.5° OUTSIDE, i.e. read it as the
       two-degree band it is. Two readings of one polygon, and the reader could meet either.
       ⚠ js/gis-crs.js areaOn (the planar road, when `measure` names a CRS) already refuses these
       with `plane-seam-crossed`. It was only the geodesic road that answered anyway.

       ⇒ THE TWO CASES ARE TOLD APART BY THE EDGE, AND THE RULE IS ABOUT THE REPRESENTATION, NOT
       ABOUT THE DATA: in plate carrée, no EDGE of a shape this app reads is more than half a world
       long (js/gis-geometry.js SEAM_STEP states the same thing for the same reason), and the one
       edge that is a full 360° is the closing edge a full-width band writes deliberately — that is
       what diskFillPolys emits and what the paragraph above protects. So an edge with
       180° < |Δλ| < 360° is a SEAM CROSSING written undivided, and such a ring is measured on
       js/gis-geometry.js unwrapRing's output — the app's one unwrapping, not a second copy of it
       (.agents/rules/no-ad-hoc-hardcoding.md §2-3), which is also the one pointInGeometry reaches
       through alignTo. Every other ring is measured exactly as before.
       ⚠ Observed 2026-09-17 on this tree: polar disk 500 km @89°N 785,022.8 km² and seam disk
       500 km @179.8°E 784,434.8 km² are BYTE-IDENTICAL before and after; the seam band goes
       4,426,211 → 24,727 km² and a seam band with a seam hole 13,167,667 → 172,949 km².
       ⚠ Expires if this app ever reads a producer that writes a real edge longer than 180° that is
       not a closing 360°: then the edge stops being able to say which case it is, and the answer
       moves to the producer declaring it. Canonical source for the seam convention:
       docs/GIS-CORE.md §2.4.
       ⚠ THE KERNEL IS ASKED, NOT COPIED: with no js/gis-geometry.js published, a seam-crossing ring
       is null — 「measured on an unwrapping this build does not have」 — the same honest null this
       function already answers when js/geodesy.js has not published its radius. */
    const SEAM_EDGE_EPS = 1e-9;
    function crossesSeamUndivided(pts) {
      for (let i = 0; i < pts.length; i++) {
        const d = Math.abs(pts[(i + 1) % pts.length][0] - pts[i][0]);
        if (d > 180 + SEAM_EDGE_EPS && d < 360 - SEAM_EDGE_EPS) return true;
      }
      return false;
    }
    function ringAreaKm2(ring) {
      const R = earthKm();
      if (R == null) return null;
      let pts = ringPositions(ring);
      if (pts.length < 3) return 0;
      if (crossesSeamUndivided(pts)) {
        const G = geometry();
        if (!G || typeof G.unwrapRing !== 'function') return null;
        pts = G.unwrapRing(pts);
        if (pts.length < 3) return 0;
      }
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dl = (b[0] - a[0]) * D2R;
        total += dl * (2 + Math.sin(a[1] * D2R) + Math.sin(b[1] * D2R));
      }
      return Math.abs(total * R * R / 2);
    }

    /* Rings of one polygon: [0] is the outer, the rest are holes — GeoJSON's own rule, and the one
       every producer in this app follows. Holes are SUBTRACTED, so a doughnut reports the doughnut. */
    function polygonAreaKm2(rings) {
      if (!Array.isArray(rings) || !rings.length) return 0;
      const outer = ringAreaKm2(rings[0]);
      if (outer == null) return null;
      let a = outer;
      for (let i = 1; i < rings.length; i++) { const h = ringAreaKm2(rings[i]); if (h == null) return null; a -= h; }
      return a > 0 ? a : 0;
    }

    /* Public. null when IntMapGeodesy has not published — the radius is ITS value, and inventing
       6371 here would be a second copy of a number the app already decides in one place. */
    function areaKm2(geometry) {
      if (!geometry || typeof geometry !== 'object') return 0;
      if (geometry.type === 'Polygon') return polygonAreaKm2(geometry.coordinates);
      if (geometry.type === 'MultiPolygon') {
        let a = 0;
        for (const poly of (geometry.coordinates || [])) { const x = polygonAreaKm2(poly); if (x == null) return null; a += x; }
        return a;
      }
      return 0;
    }

    /* (#R752) 長さ。⚠ THE RADIUS IS IntMapGeodesy'S, exactly as areaKm2's is — 6371 written here
       would be a second copy of a number the app decides in one place, and null is the honest answer
       when that module has not published. Great-circle between consecutive positions: this layer
       measures on the sphere (docs/GIS-CORE.md §2.4), and `measure` is where a reader who wants a
       plane instead names one. Areas contribute their PERIMETER — the outer ring plus every hole,
       because a hole has an edge and a reader asking for 「長さ」 of a polygon is asking for the line
       they can see. */
    function lengthKm(geometry) {
      const Rk = earthKm();
      if (Rk == null) return null;
      const seg = (a, b) => {
        const dLat = (b[1] - a[1]) * D2R, dLon = (b[0] - a[0]) * D2R;
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2;
        return 2 * Rk * Math.asin(Math.min(1, Math.sqrt(s)));
      };
      const line = (ps) => {
        if (!Array.isArray(ps) || ps.length < 2) return 0;
        let t = 0;
        for (let i = 1; i < ps.length; i++) { if (!isPos(ps[i - 1]) || !isPos(ps[i])) return null; t += seg(ps[i - 1], ps[i]); }
        return t;
      };
      const walk = (g) => {
        if (!g || typeof g !== 'object') return 0;
        const c = g.coordinates;
        if (g.type === 'LineString') return line(c);
        if (g.type === 'MultiLineString' || g.type === 'Polygon') {
          let t = 0;
          for (const part of (c || [])) { const x = line(part); if (x == null) return null; t += x; }
          return t;
        }
        if (g.type === 'MultiPolygon') {
          let t = 0;
          for (const poly of (c || [])) for (const ring of (poly || [])) { const x = line(ring); if (x == null) return null; t += x; }
          return t;
        }
        if (g.type === 'GeometryCollection') {
          let t = 0;
          for (const sub of (g.geometries || [])) { const x = walk(sub); if (x == null) return null; t += x; }
          return t;
        }
        /* A point has no length. 0 is the measurement, not an absence. */
        return 0;
      };
      return walk(geometry);
    }

    /* ── point in polygon ──────────────────────────────────────────────────────────────────────
       ⚠ THE RAY CAST USED TO LIVE HERE TOO (#R729), and js/gis-geometry.js now needs the same
       verdict for its own predicates. Two copies of one rule is the drift this project keeps
       paying for, so there is one: the kernel owns it and this file asks. The export below stays,
       because the panel and the checks reach for it by this name.
       ⚠ It answers FALSE when the kernel is not loaded, and every op that needs it declares
       `needsGeometry`, so run() has already refused with `geometry-unavailable` by then. */
    function pointInPolygon(lngLat, geom) {
      const GG = geometry();
      if (!GG || typeof GG.pointInGeometry !== 'function') return false;
      return GG.pointInGeometry(lngLat, geom);
    }
    /* ── convexity, measured ──────────────────────────────────────────────────────────────────── */

    /* ── geometry decomposition ───────────────────────────────────────────────────────────────── */

    function polygonsOf(g) {
      if (!g) return [];
      if (g.type === 'Polygon') return Array.isArray(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) ? g.coordinates : [];
      return [];
    }
    function linesOf(g) {
      if (!g) return [];
      if (g.type === 'LineString') return Array.isArray(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiLineString') return Array.isArray(g.coordinates) ? g.coordinates : [];
      return [];
    }
    function pointsOf(g) {
      if (!g) return [];
      if (g.type === 'Point') return isPos(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiPoint') return (Array.isArray(g.coordinates) ? g.coordinates : []).filter(isPos);
      return [];
    }

    /* ── bounding boxes: the cheap question asked before the expensive one ─────────────────────
       Every pairwise op below is a loop over A × B, and a sweep-line or a distance over two shapes
       that cannot possibly meet costs the same as one over two that do. A box is one walk of the
       coordinates and the rejection is four comparisons. ⚠ IT IS A FILTER, NOT AN ANSWER: boxes
       overlapping proves nothing, so a pair that passes still goes to the real predicate. What it
       removes is only pairs where a box says «no», and a box saying no is exact.
       ⚠ This is not a spatial index. It turns the constant down, not the O(n·m). */
    function bboxOf(g) {
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
          const b = bboxOf(sub);
          if (!b) continue;
          if (b[0] < w) w = b[0]; if (b[2] > e) e = b[2];
          if (b[1] < s) s = b[1]; if (b[3] > n) n = b[3];
        }
      }
      return isFinite(w) && isFinite(s) ? [w, s, e, n] : null;
    }

    /* ⚠ THE PAD IS ASKED FOR IN KILOMETRES, AND THAT IS THE WHOLE OF THE FIX (#R743). Until this
       round the callers turned the distance into DEGREES themselves and this function applied the
       one number to both axes, defended by a comment that argued the direction of its own error:
       「a degree of longitude is shorter than a degree of latitude away from the equator, so the pad
       uses the LATITUDE degree for both — which over-estimates the longitude reach」.

       ⚠ THAT SENTENCE IS BACKWARDS, AND THE PREFILTER ERRED INWARD BECAUSE OF IT. A degree of
       longitude being shorter in km is exactly why covering d km takes MORE of them, not fewer: at
       60°N a degree of longitude is 55.66 km, so 80 km is 1.437° of longitude and only 0.719° of
       latitude. The pad handed to both axes was the latitude one — so two shapes 1° of longitude
       apart at 60°N (55.66 km, well inside a 80 km query) had their boxes declared too far apart
       and never reached GG.distanceKm at all. 「Erring outward is the only direction a prefilter may
       err」 was the right rule, written by the code that broke it.

       ⚠ AND NEITHER PATH COULD SEE IT. tests/r735-gis-raster-time-checks measures the indexed
       source against the unindexed walk — and both of them called this one function with the same
       number. An agreement between two readers of one wrong rule is not a measurement of the rule.

       So the km never becomes a degree outside this file's own box arithmetic. padBoxKm grows the
       QUERY box: latitude first, then longitude by the latitude the padded box actually reaches,
       because cos is smallest there and the widest longitude degree is the conservative one. */
    function padBoxKm(b, km) {
      if (!b) return b;
      if (!(km > 0)) return b;
      const R = earthKm();
      /* No geodesy kernel, no conversion — so every box is a candidate. The ops that pad are all
         declared needsGeodesy, which means a missing kernel is refused upstream by name; erring
         outward here keeps this function from being the place that invents a quiet miss. */
      if (!R) return [-180, -90, 180, 90];
      const dLat = km / (Math.PI * R / 180);
      const s = Math.max(-90, b[1] - dLat), n = Math.min(90, b[3] + dLat);
      const latMax = Math.max(Math.abs(s), Math.abs(n));
      const cos = Math.cos(latMax * D2R);
      /* At the pole a degree of longitude is 0 km wide, so no finite number of them covers d km:
         the answer is every longitude. That is the geometry, not a guard against it. */
      const dLon = (cos > 1e-9) ? (dLat / cos) : 181;
      /* ⚠ A PAD THAT REACHES PAST ±180 BECOMES EVERY LONGITUDE rather than a box that stops at the
         seam. boxesMeet compares plain min/max, so a padded box running from 179.5 to 180.6 would
         miss a candidate at -179.8 — which is 30 km away, not 360° away. Widening is the outward
         error; stopping at the seam is an inward one. */
      if (!(dLon < 180) || b[0] - dLon < -180 || b[2] + dLon > 180) return [-180, s, 180, n];
      return [b[0] - dLon, s, b[2] + dLon, n];
    }

    /* Do two boxes meet? The pad is already IN the box by the time this is asked (padBoxKm), so
       there is one rule, and both readers — this walk and js/gis-index.js — are handed the same
       padded box rather than the same number to convert twice. */
    function boxesMeet(a, b) {
      if (!a || !b) return true;
      return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
    }

    function polyGeometry(polys) {
      if (!polys.length) return null;
      return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    }
    function lineGeometry(lines) {
      if (!lines.length) return null;
      return lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
    }

    function props(f) { return (f && f.properties && typeof f.properties === 'object') ? f.properties : {}; }
    function withProps(base, extra) { return Object.assign({}, base, extra || {}); }

    /* ── filter: the comparisons ──────────────────────────────────────────────────────────────── */

    const CONDITION_OPS = ['>=', '>', '<=', '<', '==', '!=', 'contains', 'in', 'between'];

    /* Numbers when BOTH sides are numbers, text otherwise — measured per cell, by the registry's own
       asNumber, so 「12 km」 stays text here exactly as it stays text in the column typing. Two
       parsers would drift and the drift would show up as a row the panel says matches and the filter
       drops. */
    function cmpPair(R, raw, want) {
      const a = R.asNumber(raw), b = R.asNumber(want);
      if (a != null && b != null) return { num: true, a: a, b: b };
      return { num: false, a: String(raw), b: String(want) };
    }

    /* An empty cell (null / undefined / all spaces) satisfies NOTHING except `!=`: it is not that
       value, but it is not greater than it either, and treating '' as 0 or as '' < 'x' would quietly
       pull every blank row into 「500未満」. */
    function evalCondition(R, value, op, want) {
      const empty = R.isEmpty(value);
      switch (op) {
        case '>=': case '>': case '<=': case '<': {
          if (empty) return false;
          const c = cmpPair(R, value, want);
          if (op === '>=') return c.a >= c.b;
          if (op === '>') return c.a > c.b;
          if (op === '<=') return c.a <= c.b;
          return c.a < c.b;
        }
        case '==': { if (empty) return R.isEmpty(want); const c = cmpPair(R, value, want); return c.a === c.b; }
        case '!=': { if (empty) return !R.isEmpty(want); const c = cmpPair(R, value, want); return c.a !== c.b; }
        /* text containment, case-insensitive: a reader typing a filter is choosing a word, not a
           capitalisation, and 「Tokyo」 must find 「tokyo」. */
        case 'contains': { if (empty) return false; return String(value).toLowerCase().indexOf(String(want == null ? '' : want).toLowerCase()) >= 0; }
        case 'in': {
          if (empty) return false;
          const list = Array.isArray(want) ? want : [want];
          for (const w of list) { const c = cmpPair(R, value, w); if (c.a === c.b) return true; }
          return false;
        }
        case 'between': {
          if (empty) return false;
          const pair = Array.isArray(want) ? want : [];
          if (pair.length !== 2) return false;
          const lo = cmpPair(R, value, pair[0]), hi = cmpPair(R, value, pair[1]);
          return lo.a >= lo.b && hi.a <= hi.b;                   /* both ends included */
        }
        default: return false;
      }
    }

    /* The spatial relations `relate` offers. Declared next to the op that uses them so ops() hands
       the panel the list rather than the panel carrying one. */
    const RELATE_PREDICATES = ['intersects', 'within', 'contains', 'disjoint', 'nearer-than'];

    /* (#R783) The relations a JOIN may stand on — DERIVED from the list above rather than retyped,
       so a tenth predicate added there is offered here the day it lands. ⚠ `disjoint` is the one
       that cannot carry attributes: it is true of a feature and EVERY other feature it does not
       touch, so 「相手の属性を持ってくる」 has no partner to bring them from. That is a property of
       the relation, not an exception written for a case somebody met. */
    const JOIN_PREDICATES = RELATE_PREDICATES.filter((p) => p !== 'disjoint');

    /* (#R783) 1 対多のとき何が起きるか。⚠ THERE IS NO DEFAULT, AND THAT IS THE POINT. A ward with
       forty facilities in it is the ORDINARY case of a spatial join, and both honest answers — one
       output row per matching pair, or one per left feature — change the row count on the strength
       of data the reader has not looked at. `join`'s `duplicates` can default to `refuse` because a
       lookup table that repeats itself is a defect IN THE TABLE; here the multiplicity is the
       subject. So the parameter is `required` in DECL: the caller states it once and the run never
       has to be repeated to discover which it wanted (.agents/rules/one-pass-or-a-reason.md).
         'all'     one row per matching pair — the left geometry travels with each partner
         'first'   one row per left feature, the partner being the FIRST ROW OF INPUT 1 that matched
                   (input 1's own order, never the order a spatial index happened to visit in)
         'refuse'  a left feature with more than one partner is refused by name, with the count */
    const JOIN_CARDINALITY = ['all', 'first', 'refuse'];

    /* (#R783) How a row's STATED END is read when the two sides of a temporal join meet at it.
       See the note above spanReader for the measurement that makes this a question and not a
       detail: 廃藩置県 is stated as 1871-08-29 by the unit that ended and by the unit that began. */
    const TIME_ENDS = ['exclusive', 'inclusive'];

    /* (#R783) The statistics `aggregate` offers. ⚠ ONE LIST: the `stat` enum and the answer to
       「どの stat が列を要るか」 are both derived from it, so a sixth statistic cannot be offered and
       left out of the requirement (it was two hand-written lists one line apart until this round).
       `areaWeightedMean` is the door for the remedy js/gis-units.js hands back — see the note there. */
    const AGG_STATS = ['count', 'sum', 'mean', 'min', 'max', 'areaWeightedMean'];

    /* ── どの面の上で計算したのか (#R756) ──────────────────────────────────────────────────────
       An outside review of R752 said the ops do not state, per op, which surface they compute on.
       They did not, and the answer was not derivable from anywhere: `measure` alone reported a
       plane, and every other op's surface lived only in the kernel it happened to call.
       ⚠ これは実装についての註ではなく、答えについての主張である。 A 「面積」 computed by the
       spherical excess and a 「面積」 computed on an unwrapped lng/lat plane are different numbers,
       and a reader combining two ops has no way to see that they disagree unless each says so.

       The four surfaces this layer actually computes on. ⚠ 語彙は閉じている——a typo would otherwise
       become a fifth surface nobody implements, and every op would still 「declare」 one.

         'sphere'        great-circle / spherical-excess arithmetic on the WGS84 mean radius
                         (js/gis-ops.js areaKm2 · lengthKm, js/gis-geometry.js haversineKm)
         'degree-plane'  lng/lat unwrapped across the seam and treated as a plane
                         (js/gis-geometry.js unwrapRing → the polygon clipper)
         'degree-grid'   a lattice whose cells are degrees (js/gis-raster.js; non-degree grids are
                         refused there as `grid-not-degrees`)
         'stated-plane'  a projection the CALLER named, never one this layer picked

       ⚠ (#R783) THIS PARAGRAPH SAID 「許容誤差はここでは宣言しない」 AND THAT SUCH A MEASUREMENT DID
       NOT EXIST. The first half still holds; the second stopped being true in the same round this
       sentence is being rewritten in, and a note that contradicts the code below it is #R764's
       defect. What exists now is js/gis-crs.js's `certify()`: the envelope of an area and of a
       length against WGS 84, measured over THE READER'S OWN DATA rather than written down per op —
       which is why .agents/rules/no-ad-hoc-hardcoding.md §4 refused a constant here and still does.
       So `measure` carries that certificate's `bound` / `checked` / `within` back in `stats.fit`
       beside the number, and a caller who states a `tolerance` is answered by the kernel that
       measured it: inside the envelope, the same number as always; outside it,
       `crs-accuracy-outside-tolerance` TOGETHER WITH the surfaces that can — a road and never a cap
       (CONSTITUTION.md §5). A caller who states nothing is refused nothing.
       ⚠ THE OTHER OPS STILL DECLARE NO ENVELOPE, for the original reason: nobody has measured them.
       What they state instead is where they refuse rather than approximate — a ring that spans a
       whole turn is `geometry-wraps-world`, and a measured plane crossed at its seam is
       `crs-plane-seam-crossed`. An invented tolerance would read as a measurement and be neither.
       ⚠ AND THE GROUND IS NOT NAMED IN THE LIST BELOW, because its name is not this file's to write.
       js/gis-crs.js publishes the surfaces it can measure on, the ellipsoid included; the vocabulary
       this layer hands out is the four names below UNION that declaration (surfaceVocab). A fifth
       name typed here would be the copy that falls behind the day the kernel adds one. */
    const SURFACES = ['sphere', 'degree-plane', 'degree-grid', 'stated-plane'];

    /* (#R783) この層が計算する四面 ∪ js/gis-crs.js が「測れる」と述べる面 — see the note above. Asked
       at call time for the reason VALUE_SOURCES is: the crs kernel may mount after this factory ran,
       and a vocabulary resolved at construction would be missing a surface for the whole session. */
    function surfaceVocab() {
      const out = SURFACES.slice();
      const src = VALUE_SOURCES['measure-surfaces'];
      let extra = null;
      try { extra = src ? src() : null; } catch (_) { extra = null; }
      for (const name of (extra || [])) if (out.indexOf(name) < 0) out.push(name);
      return out;
    }

    /* (#R783) 地面の名前も、その面を持っている module に訊く。null is 「訊けなかった」. */
    function groundSurfaceName() {
      const CK = crsKernel();
      let list = null;
      try { list = (CK && typeof CK.surfaces === 'function') ? CK.surfaces() : null; } catch (_) { list = null; }
      for (const s of (list || [])) if (s && s.isGround) return String(s.name);
      return null;
    }

    /* ── the declarations a panel reads ───────────────────────────────────────────────────────── */

    /* `accepts` is per input; `params[].input` says WHICH input a field name is chosen from, so the
       panel never has to know that aggregate's field belongs to the points and not to the polygons.
       `requiredWhen` states the one conditional requirement as data rather than as UI code.
       Two more keys are stated rather than hidden, because a caller has a use for both: `mismatchWhy`
       is the code a geometry mismatch on THIS op answers with (buffer says what it needs by name),
       and `needsGeodesy` says the op cannot run without window.IntMapGeodesy — which is how a panel
       can grey the op out before the reader fills a form that is going to be refused. */
    const DECL = {
      filter: {
        id: 'filter',
        surface: [], inputs: 1, accepts: ['any'], output: 'same-as-input',
        params: [{ name: 'where', type: 'conditions', required: true, input: 0, ops: CONDITION_OPS }],
      },
      buffer: {
        /* ⚠ `accepts:['Point']` UNTIL #R732. The refusal was honest — there was no offset curve —
           but it is not honest any more: js/gis-geometry.js builds the Minkowski sum of ANY
           geometry with a geodesic disk, which is what a buffer is. `buffer-needs-points` is
           therefore gone, and so is the mismatchWhy that named it. */
        id: 'buffer',
        surface: ['sphere', 'degree-plane'], inputs: 1, accepts: ['any'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [
          /* Negative means INWARD, and only an areal shape has an inside to eat into; a negative
             radius on points or lines is refused by name rather than silently made positive. */
          { name: 'radiusKm', type: 'number', required: true, unit: 'km' },
          { name: 'steps', type: 'number', required: false, default: 64 },
        ],
      },
      clip: {
        /* ⚠ THE CLIPPER NO LONGER HAS TO BE CONVEX (#R732). A ward with a hole, a concave
           prefecture and a window whose true answer is several disjoint pieces are all ordinary
           now. `clip-window-not-convex` is raised by nothing. */
        id: 'clip',
        surface: ['degree-plane'], inputs: 2, accepts: ['any', 'Polygon'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      intersect: {
        id: 'intersect',
        surface: ['degree-plane'], inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      difference: {
        id: 'difference',
        surface: ['degree-plane'], inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      union: {
        id: 'union',
        surface: ['degree-plane'], inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      dissolve: {
        /* One shape per group, boundaries between members removed. `by` absent means ONE group —
           the whole dataset — which is the 「全部まとめる」 a reader means by dissolve with no
           column named. */
        id: 'dissolve',
        surface: ['degree-plane'], inputs: 1, accepts: ['Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [{ name: 'by', type: 'field', required: false, input: 0 }],
      },
      relate: {
        /* The spatial WHERE: keep the features of input 0 that stand in `predicate` to ANY feature
           of input 1. ⚠ `nearer-than` measures from the SHAPES, not from their centres — which is
           the whole of 「道路そのものからの距離」 and the thing a bounding-box centre cannot answer. */
        id: 'relate',
        surface: ['sphere', 'degree-plane'], inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'predicate', type: 'enum', required: true, default: 'intersects', values: RELATE_PREDICATES },
          { name: 'maxKm', type: 'number', required: false, unit: 'km', requiredWhen: { predicate: ['nearer-than'] } },
        ],
      },
      /* ── the grid ops (#R735) ─────────────────────────────────────────────────────────────────
         ⚠ `kinds` IS WHY THESE CAN EXIST WITHOUT A SPECIAL CASE IN EVERY OTHER OP. `accepts` asks
         about geometry, and a grid has none — so before this key the nine ops above would have taken
         a raster as an input with `geometryType:null` and either refused it as 'Mixed' or, for the
         `any` slots, walked a features() that is not there. Declaring the PAYLOAD each slot needs, and
         defaulting it to 'vector', is what makes 「そのデータはこの処理の入力ではない」 a refusal by
         name (`input-kind`) for every op at once, the old ones included. */
      sample: {
        /* 地点値の取得: each point gets a column holding the grid's value under it. */
        id: 'sample',
        surface: ['degree-grid'], inputs: 2, accepts: ['Point', 'any'], kinds: ['vector', 'raster'], output: 'same-as-input',
        needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 1 },
          /* ⚠ (#R752) THIS READ `values: ['nearest','bilinear']` — a hand-written copy of a list the
             raster kernel owns, and the copy was silently wrong the moment that kernel grew cubic,
             average, mode and sum. `valuesOf` names WHERE THE SET LIVES instead of what is in it, so
             a method added to js/gis-raster.js is offered here the day it lands.
             ⚠ AND IT IS THE POINT METHODS, NOT ALL OF THEM. `sample` asks what the field is worth AT
             a position; the areal methods (average / sum / mode) summarise what an output pixel
             COVERS and need a footprint that a point does not have. That is a fact the kernel
             declares (`kind`), not a rule spelled out twice. */
          { name: 'method', type: 'enum', required: false, default: 'nearest', valuesOf: 'sample-methods-point' },
          { name: 'outName', type: 'text', required: false },
        ],
      },
      zonal: {
        /* 区域内集計 over a grid — 「この区域の人口」「区域内の標高分布」「土地被覆ごとの面積」 as one
           op rather than three features of the app. `classes` is the last of those: the area of each
           distinct value, which only means anything for a grid of codes, so it refuses a grid of
           measurements by name instead of rounding them into classes. */
        id: 'zonal',
        surface: ['degree-grid'], inputs: 2, accepts: ['Polygon', 'any'], kinds: ['vector', 'raster'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 1 },
          { name: 'stat', type: 'enum', required: true, default: 'mean', values: ['mean', 'sum', 'min', 'max', 'count', 'classes'] },
          { name: 'outName', type: 'text', required: false },
          /* ⚠ (#R764) 境界の画素をどう数えるか。既定は 'center' で、これまでの答えと 1 ビットも
             変わらない——選ばなかった読者の数が動くのは、この層がしてはならないことである。
             'fractional' は画素の面積のうち区域に入っている割合を重みにする（狭い流域・海岸線・
             小さい行政区では、これが答えそのものになる）。⚠ 重みが効くのは「地面」についての統計
             （面積・面積加重平均・積分）だけで、count と sum は画素を 1 つとして数える——
             「観測値の合計」において、読み取り値の 3 分の 2 は読み取り値ではない。
             ⚠ 使った規則は答えに載る（stats.boundary）。規則を述べない数は、別の規則で出した数と
             比べられない。 */
          { name: 'boundary', type: 'enum', required: false, default: 'center', values: ['center', 'allTouched', 'fractional'] },
          /* ⚠ (#R783) 「合計」は 3 つある — js/gis-raster.js's TOTAL_RULES: Σ value（観測値の合計）/
             Σ value·km²（密度の積分＝「人/km² の層から県の人口」）/ Σ value·cover（画素自身の総量を
             区域の取り分だけ）。どれを出したのかは量の意味が決めるので、**規則は呼び手が述べ、
             その規則がその量について意味を持つかは js/gis-units.js が判定する**。省略すれば
             `sum` は今までと 1 ビットも変わらない。 */
          { name: 'total', type: 'enum', required: false, valuesOf: 'total-rules' },
          /* (#R783) 帯が量を述べていなければ、呼び手が述べる。See the note on aggregate's. */
          { name: 'quantity', type: 'quantity', required: false, input: 1 },
        ],
      },
      rasterMask: {
        /* 条件による抽出: the same grid with everything that fails the test turned into a void.
           ⚠ The operator list is CONDITION_OPS minus the one that has no meaning for numbers, derived
           rather than retyped — a tenth comparison added to the filter arrives here too. */
        id: 'rasterMask',
        surface: ['degree-grid'], inputs: 1, accepts: ['any'], kinds: ['raster'], output: 'raster',
        needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 0 },
          { name: 'op', type: 'enum', required: true, default: '>=', values: CONDITION_OPS.filter((o) => o !== 'contains') },
          { name: 'value', type: 'text', required: true },
        ],
      },
      rasterDiff: {
        /* 時期同士の差分: a − b, on the grid they share. Two grids that are not the same grid are
           refused rather than resampled — see js/gis-raster.js diff(). */
        id: 'rasterDiff',
        surface: ['degree-grid'], inputs: 2, accepts: ['any', 'any'], kinds: ['raster', 'raster'], output: 'raster',
        needsRaster: true,
        params: [{ name: 'band', type: 'field', required: false, input: 0 }],
      },
      resample: {
        /* (#R752) 格子合わせ: put input 0 onto input 1's lattice. ⚠ THIS IS THE OP `grid-mismatch`
           HAS BEEN POINTING AT SINCE #R749 WITHOUT BEING ABLE TO NAME IT. js/gis-warp.js could do
           this the day it was written; it was reachable from an import-panel button and from nowhere
           a chain could go, so `rasterDiff` and `rasterCalc` were dead ends for anyone whose two
           grids came from different sources — which is most people with two grids.
           ⚠ `rule` IS OPTIONAL AND ITS ABSENCE IS NOT A DEFAULT INTERPOLATION. Omitted, the target
           is input 1's grid exactly — the plain reading of 「b の格子に合わせる」, and a statement the
           reader has already made by choosing b. Given, the target is the COMMON lattice align()
           computes, and the rule says whose resolution won. Either way the choice has an author. */
        id: 'resample',
        surface: ['degree-grid'], inputs: 2, accepts: ['any', 'any'], kinds: ['raster', 'raster'], output: 'raster',
        needsRaster: true, needsWarp: true,
        params: [
          { name: 'method', type: 'enum', required: true, valuesOf: 'sample-methods-all' },
          { name: 'rule', type: 'enum', required: false, valuesOf: 'align-rules' },
        ],
      },
      rasterCalc: {
        /* (#R752) 複数の格子を式で計算する: `(a - b) / b`, `a * 0.1`, `max(a, b)`. ⚠ THE PARSER IS
           NOT A NEW ONE. js/gis-expr.js already tokenises and evaluates an expression over a ROW,
           with rules this project argued out once — missing propagates rather than becoming 0, a
           division by zero is not a measurement, `'a' + 1` is a type error and not a concatenation.
           A pixel is a row whose columns are `a` and `b`, so the same kernel answers, and there is
           one place where 「式とは何か」 is decided rather than two.
           ⚠ BOTH INPUTS MUST BE THE SAME GRID, for the reason rasterDiff refuses otherwise — and
           now the refusal has `resample` to point at. Naming the same dataset twice is legal and is
           how single-grid arithmetic is written. */
        id: 'rasterCalc',
        surface: ['degree-grid'], inputs: 2, accepts: ['any', 'any'], kinds: ['raster', 'raster'], output: 'raster',
        needsRaster: true, needsExpr: true,
        params: [
          { name: 'expr', type: 'text', required: true },
          { name: 'bandA', type: 'field', required: false, input: 0 },
          { name: 'bandB', type: 'field', required: false, input: 1 },
          { name: 'outName', type: 'text', required: false },
          { name: 'unit', type: 'text', required: false },
        ],
      },
      mosaic: {
        /* (#R752) 2 枚を 1 枚に: the union of the two extents on a common lattice, with a STATED rule
           for the pixels both cover. ⚠ THE OVERLAP RULE IS REQUIRED. Two tiles of the same survey
           agree in their overlap and any rule gives the same picture; two grids from different dates
           or different sensors do not, and a silently-chosen 「後の方が勝つ」 is a composite nobody
           described. Chain it for a third: mosaic(mosaic(a,b), c). */
        id: 'mosaic',
        surface: ['degree-grid'], inputs: 2, accepts: ['any', 'any'], kinds: ['raster', 'raster'], output: 'raster',
        needsRaster: true, needsWarp: true,
        params: [
          /* ⚠ ASKED, NOT COPIED — js/gis-raster.js publishes `mergeOverlaps()` for exactly this
             reason, and a list retyped here would fall behind it the first time a rule is added. */
          { name: 'overlap', type: 'enum', required: true, valuesOf: 'merge-overlaps' },
          { name: 'method', type: 'enum', required: true, valuesOf: 'sample-methods-all' },
          { name: 'band', type: 'field', required: false, input: 0 },
        ],
      },
      rasterize: {
        /* (#R752) 地物を格子にする: burn features onto a lattice the reader states. ⚠ THE LATTICE IS
           NOT DERIVED FROM THE FEATURES ALONE. The extent can be (it is theirs), but how finely to
           cut it is a question only the reader can answer — 「日本を 100×100 で」 and 「日本を
           10000×10000 で」 are different analyses, and picking one silently decides what the answer
           means. So width and height are required and the extent defaults to the input's own.
           ⚠ WHAT IS BURNED IS STATED TOO. `field` omitted = presence (1 where a feature touches the
           cell, void elsewhere); named = that column's value, with `stat` deciding what two features
           over one pixel mean. ⚠ 「触れている」は次元ごとに違う——面は画素の中心が形の中にあるとき、
           点はその画素の中にあるとき、線はその画素を通るとき（#R756。burnGeometry を見よ）。 */
        id: 'rasterize',
        surface: ['degree-grid', 'degree-plane'], inputs: 1, accepts: ['any'], kinds: ['vector'], output: 'raster',
        needsRaster: true, needsGeometry: true,
        params: [
          { name: 'width', type: 'number', required: true },
          { name: 'height', type: 'number', required: true },
          { name: 'field', type: 'field', required: false, input: 0 },
          { name: 'stat', type: 'enum', required: false, default: 'first', values: ['first', 'min', 'max', 'sum', 'mean', 'count'] },
          { name: 'bbox', type: 'text', required: false },
        ],
      },
      polygonize: {
        /* (#R752) 格子を領域にする: one area per run of equal values. ⚠ IT REFUSES A GRID OF
           MEASUREMENTS, by the same argument `zonal`'s `classes` refuses one — the boundary between
           12.3 and 12.4 is not a boundary anybody drew, and rounding to make one invents a
           classification nobody defined. A grid of codes (land cover, administrative raster, the
           output of rasterMask) has real edges, and those are what this traces. */
        id: 'polygonize',
        surface: ['degree-grid'], inputs: 1, accepts: ['any'], kinds: ['raster'], output: 'Polygon',
        needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 0 },
          { name: 'outName', type: 'text', required: false },
        ],
      },
      measure: {
        /* (#R752) 面積と長さを、読者が述べた面の上で測る。⚠ THE ANSWER TO 「解析用の座標系を選べ
           ない」 IS NOT A SECOND STORAGE CRS. js/gis-datasets.js keeps every dataset in EPSG:4326 and
           everything downstream — the renderer, point-in-polygon, the clip window — assumes lng/lat
           degrees; a record that stored metres would break all of it silently. But the FRAME A
           NUMBER IS MEASURED IN is a different question from the frame it is stored in, and that one
           the reader has never been able to answer: `_areaKm2` has always been geodesic, full stop.
           ⚠ SO THE PLANE IS A PARAMETER OF THE MEASUREMENT. `crs` omitted = the geodesic answer this
           layer has always given (unchanged, and still the right default for 「面積は？」); named =
           that projection's plane, with the distortion it carries reported IN THE SAME ROW. An area
           measured on Web Mercator at 60°N is four times the truth, and a column of such numbers
           with nothing beside them is the shape this project keeps catching — a value whose author
           and whose caveat are both missing. */
        id: 'measure',
        surface: ['sphere', 'stated-plane'], inputs: 1, accepts: ['any'], kinds: ['vector'], output: 'same-as-input',
        /* (#R783) …AND the surfaces js/gis-crs.js says it can measure on, which is where the ground's
           own name lives. Resolved on the way out (declOut) for the same reason `valuesOf` is. */
        surfaceOf: 'measure-surfaces',
        needsGeodesy: true,
        params: [
          { name: 'what', type: 'enum', required: true, values: ['area', 'length'] },
          { name: 'crs', type: 'text', required: false, valuesOf: 'plane-spellings', open: true },
          /* (#R783) 面そのものを述べる。Omitted, the surface is the one it always was: the geodesic
             default, or the plane when `crs` names one. Stated, it may be the ellipsoidal ground —
             the one surface with no projection in it, and the road a tolerance refusal offers. */
          { name: 'surface', type: 'enum', required: false, valuesOf: 'measure-surfaces' },
          { name: 'unit', type: 'enum', required: false, values: ['km', 'm'] },
          /* (#R783) ⚠ 上限ではなく、別の道である。 A fractional error the CALLER states; nothing here
             invents one, and a run that states none is unchanged to the bit. When the measured
             envelope cannot meet it the answer is `crs-accuracy-outside-tolerance` WITH the surfaces
             that can (CONSTITUTION.md §5 · atlas-full-authority-no-new-limits). */
          { name: 'tolerance', type: 'number', required: false, unit: 'ratio' },
          { name: 'outName', type: 'text', required: false },
        ],
      },
      validate: {
        /* (#R752) 幾何の妥当性: every row keeps its geometry and gains what is wrong with it. ⚠ IT
           DOES NOT REPAIR, AND THAT SEPARATION IS THE POINT. 「何が壊れているか」 is a measurement a
           reader may want to look at, join to, or filter by; 「直した」 is a change to their data.
           The overlay ops have been consuming self-intersecting rings since this layer existed and
           saying nothing, because nothing could ask. */
        id: 'validate',
        surface: ['degree-plane'], inputs: 1, accepts: ['any'], kinds: ['vector'], output: 'same-as-input',
        needsGeometry: true,
        params: [{ name: 'prefix', type: 'text', required: false }],
      },
      repair: {
        /* (#R752) 幾何の修復: close rings, drop duplicate points and zero-area rings, re-node
           self-intersections, orient rings. ⚠ EVERY ROW SAYS WHAT WAS ACTUALLY CHANGED, and what is
           STILL wrong after it — a repair that reports only success is a claim about data the reader
           can no longer inspect. ⚠ AND IT IS NOT buffer(0): that moves vertices by the offset
           arithmetic's error and calls the result the same shape. */
        id: 'repair',
        surface: ['degree-plane'], inputs: 1, accepts: ['any'], kinds: ['vector'], output: 'same-as-input',
        needsGeometry: true,
        params: [
          { name: 'winding', type: 'enum', required: false, default: 'rfc7946', values: ['rfc7946', 'keep'] },
          { name: 'prefix', type: 'text', required: false },
        ],
      },
      timeWindow: {
        /* ⚠ THE TIME AXIS IS THE DATASET'S, NOT A COLUMN NAME TYPED HERE (#R735). js/gis-datasets.js
           holds a VERIFIED declaration — an instant, a span, or one timestamp per position — so this
           op works the same on a table of events, a table of reigns and a GPS trace, and a dataset
           that never declared one is refused by name instead of being filtered on a guess.
           ⚠ For a trace the window CUTS rather than selects: 「17 時台に通った区間」 is a piece of the
           line, not the whole ride, and returning the whole feature because one of its 4,000 fixes is
           inside would answer a question nobody asked. */
        id: 'timeWindow',
        surface: [], inputs: 1, accepts: ['any'], output: 'same-as-input',
        params: [
          { name: 'from', type: 'text', required: false },
          { name: 'to', type: 'text', required: false },
          { name: 'mode', type: 'enum', required: false, default: 'overlaps', values: ['overlaps', 'within'] },
        ],
      },
      /* ── the attribute ops (#R738) ────────────────────────────────────────────────────────────
         Neither of these touches a coordinate, and that is the point: 「行政界＋市区町村コード付き
         CSV →統計値を結合→計算列を作成」 was three things this layer could not do, and the reason
         was not geometry. A boundary file and a table of numbers are the two halves of one analysis,
         and until #R738 the table could not even be imported (js/geo-import.js reads one now). */
      join: {
        /* Bring the right dataset's columns onto the left's rows, matched on a code.
           ⚠ THE MATCH IS IDENTITY, NOT ARITHMETIC. `"01100"` and `"1100"` are different municipalities
           and the same number, which is exactly the defect #R735 removed from the type rule: comparing
           these keys through asNumber would join Sapporo's statistics onto the ward next door, and
           produce a full-looking table with no error anywhere in it. So the comparison is the trimmed
           text of the cell, and the counts of what did and did not match are ANSWERED rather than
           left to be noticed — a reader whose two files write the code differently sees 0 matched and
           a sample of both sides' keys, instead of a column of blanks.
           ⚠ `accepts` IS 'any' ON BOTH SIDES, INCLUDING THE GEOMETRY-LESS TABLE. A table joined onto a
           table is an ordinary thing to want, and the output keeps input 0's geometry whatever it is. */
        id: 'join',
        surface: [], inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        params: [
          { name: 'leftField', type: 'field', required: true, input: 0 },
          { name: 'rightField', type: 'field', required: true, input: 1 },
          { name: 'fields', type: 'fields', required: false, input: 1 },
          { name: 'prefix', type: 'text', required: false },
          { name: 'unmatched', type: 'enum', required: false, default: 'keep', values: ['keep', 'drop'] },
          /* ⚠ One key, many right-hand rows, is a QUESTION and not a detail. Picking the first is a
             real answer for a lookup table that happens to repeat itself, and multiplying the left
             rows is a real answer for a one-to-many join — but choosing either silently makes the row
             count depend on data the reader did not look at. The default refuses and names the key. */
          { name: 'duplicates', type: 'enum', required: false, default: 'refuse', values: ['refuse', 'first'] },
        ],
      },
      /* ── the joins (#R783) ────────────────────────────────────────────────────────────────────
         ⚠⚠⚠ 「結合」 WAS ONE OP AND IT IS FOUR QUESTIONS. `join` above matches on a key the reader
         can point at; the three below match on WHERE a row is, on WHAT IS NEAREST to it, and on
         WHEN it holds — and until this round none of those could bring a partner's attributes over.
         `relate` answered the yes/no half (「その区域に重なる行だけ残す」) and THREW THE PARTNER
         AWAY, so 「区域内の施設を、その施設の属性ごと」, 「最寄りの駅と、そこまでの距離」 and
         「当時の区域」 were each two passes the reader had to stitch back together by hand, with no
         column anywhere saying which row came from which partner.
         ⚠ NOTHING BELOW IS A NEW ENGINE. The relations are RELATE_PREDICATES asked through
         relateOne, the distance is js/gis-geometry.js attempt.distanceKm (the sphere, on
         IntMapGeodesy's radius), the candidates come from candidateSource — the same grid `relate`
         and `aggregate` are queried through — and the time axis is the registry's declaration read
         by R.timeSpan. Four copies of any of those is the drift this file keeps refusing to grow. */
      spatialJoin: {
        /* 空間結合: keep input 0's rows and bring input 1's columns onto the ones that stand in
           `predicate` to them. ⚠ THE CARDINALITY IS STATED, NOT GUESSED (see JOIN_CARDINALITY).
           ⚠ `nearer-than` writes `_distanceKm` for the pair, exactly as `relate` does — the same
           column name, because it is the same measurement and a reader chaining the two ops must
           not have to learn a second spelling. */
        id: 'spatialJoin',
        surface: ['sphere', 'degree-plane'], inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'predicate', type: 'enum', required: true, default: 'intersects', values: JOIN_PREDICATES },
          { name: 'maxKm', type: 'number', required: false, unit: 'km', requiredWhen: { predicate: ['nearer-than'] } },
          { name: 'cardinality', type: 'enum', required: true, values: JOIN_CARDINALITY },
          { name: 'fields', type: 'fields', required: false, input: 1 },
          { name: 'prefix', type: 'text', required: false },
          { name: 'unmatched', type: 'enum', required: false, default: 'keep', values: ['keep', 'drop'] },
        ],
      },
      nearestJoin: {
        /* 最近傍結合: every row of input 0 gets the NEAREST row of input 1, the distance to it, and
           which row it was. ⚠ IT IS ONE PARTNER BY CONSTRUCTION, so there is no cardinality to
           state — what there is instead is a tie, and `stats.ties` counts the rows that had one
           (the lowest row of input 1 wins, stated rather than left to the index's visiting order).
           ⚠ `maxKm` IS A LIMIT, NOT A RADIUS TO SEARCH IN. Omitted, the nearest is the nearest
           however far away it is; given, a row with nothing inside it has NO partner and travels
           unmatched — which is a different answer from 「一番近いのは 4,000 km 先だった」. */
        id: 'nearestJoin',
        surface: ['sphere', 'degree-plane'], inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'maxKm', type: 'number', required: false, unit: 'km' },
          /* Which column of input 1 names the partner. Omitted, the row's POSITION in input 1 is
             still written (`_nearestRow`) — a dataset need not have an identifier column, and an
             answer that cannot say WHICH row it measured to is not an answer. */
          { name: 'idField', type: 'field', required: false, input: 1 },
          { name: 'fields', type: 'fields', required: false, input: 1 },
          { name: 'prefix', type: 'text', required: false },
          { name: 'unmatched', type: 'enum', required: false, default: 'keep', values: ['keep', 'drop'] },
        ],
      },
      timeJoin: {
        /* 時点・期間による結合: 「当時の区域」「観測時点の統計」「期間が重なるイベント」 as one op.
           ⚠ INPUT 1 MUST HAVE A DECLARED TIME AXIS — it is the side being asked when it holds, and
           a dataset that never declared one is refused by name rather than filtered on a guess
           (the rule `timeWindow` already states). The LEFT side is either its own axis or the
           moment the reader stated: `at` / `from` / `to` REPLACE input 0's axis, which is what
           makes 「1871 年時点の区域を、時間の列を持たない表に結合する」 expressible at all.
           ⚠ 半開で訊く。See spanReader: the window is [from, to) and a bare year is that whole
           year, so 「1871」 is 1871-01-01 through 1872-01-01, exclusive. */
        id: 'timeJoin',
        surface: [], inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        params: [
          { name: 'relation', type: 'enum', required: false, default: 'overlaps', values: ['overlaps', 'within', 'contains'] },
          { name: 'at', type: 'text', required: false },
          { name: 'from', type: 'text', required: false },
          { name: 'to', type: 'text', required: false },
          { name: 'ends', type: 'enum', required: false, default: 'exclusive', values: TIME_ENDS },
          { name: 'cardinality', type: 'enum', required: true, values: JOIN_CARDINALITY },
          { name: 'fields', type: 'fields', required: false, input: 1 },
          { name: 'prefix', type: 'text', required: false },
          { name: 'unmatched', type: 'enum', required: false, default: 'keep', values: ['keep', 'drop'] },
        ],
      },
      compute: {
        /* A new column from an expression over the existing ones. ⚠ The expression is PARSED, never
           evaluated as JavaScript (js/gis-expr.js), and the columns it names are checked against the
           dataset the same way filter checks a condition's field — an expression over a column that is
           not there must be refused, not answered with a column of nulls. */
        id: 'compute',
        surface: [], inputs: 1, accepts: ['any'], output: 'same-as-input',
        needsExpr: true,
        params: [
          { name: 'outName', type: 'text', required: true },
          { name: 'expr', type: 'expression', required: true, input: 0 },
          { name: 'replace', type: 'boolean', required: false, default: false },
        ],
      },
      convert: {
        /* ── 単位換算 (#R783) ──────────────────────────────────────────────────────────────────
           ⚠⚠⚠ THE READER'S ONLY ROAD TO 「m を km に」 WAS `compute` WITH A NUMBER TYPED INTO IT,
           and that is the 手作業の倍率計算 the outside review named: `[len] / 1000` produces a
           column whose recipe says 「1000 で割った」 and NOWHERE says what the column was in, what
           it is in now, or that a conversion is what happened. js/gis-units.js has known the factor
           since #R774 and no op asked it for one — it was consulted only to REFUSE mismatched
           arithmetic. ⚠ AND `compute` COULD NOT BE FIXED INTO THIS: an expression is the reader's
           own arithmetic, and #R774 settled that `+` and `−` there do not convert (docs/GIS-CORE.md
           §6). 「換算する」 is a different act and it has to be nameable.
           ⚠ THE FACTOR IS NEVER WRITTEN HERE. Every value goes through js/gis-units.js convert(),
           per cell, and the transform this run used is ASKED of the same kernel rather than derived
           from a table of its own — `.agents/rules/no-ad-hoc-hardcoding.md` §2-3, and the reason
           °C→K cannot be a multiplication at all.
           ⚠ 換算できない組は係数を掛けずに名前で拒む: a pair of different quantities is
           `unit-incompatible`, a spelling the kernel cannot read is `unit-unreadable`, and a column
           nobody has stated a unit for is `unit-not-stated` — 「単位を述べていない値を km に直す」
           is not a thing anybody can do, and picking a source unit for the reader would invent the
           author of the number this op is about to write. */
        id: 'convert',
        surface: [], inputs: 1, accepts: ['any'], kinds: ['vector'], output: 'same-as-input',
        needsUnits: true,
        params: [
          { name: 'field', type: 'field', required: true, input: 0 },
          { name: 'to', type: 'text', required: true },
          /* 換算前の単位。Omitted, it is the one the COLUMN states (its author travels with it in
             `fields[].unitStated`). Given, it must AGREE with any statement the column carries —
             a caller overriding the column's own author silently would be a claim about somebody
             else's data, so the disagreement is refused by name. */
          { name: 'from', type: 'text', required: false },
          { name: 'outName', type: 'text', required: false, requiredWhen: { replace: [false] } },
          { name: 'replace', type: 'boolean', required: false, default: false },
          /* ⚠ 読みか、差か。For every linear pair this changes nothing; for °C / °F / K it is the
             whole answer (a 10 °C reading is 283.15 K, a 10 °C difference is 10 K). It is recorded
             in the recipe either way, because a temperature column that was converted one way and
             a column that was converted the other are not the same column. */
          { name: 'difference', type: 'boolean', required: false, default: false },
        ],
      },
      aggregate: {
        /* ⚠ `accepts[1]` WAS 'Point' (#R729) and the arithmetic was 「面に含まれる点」. With a real
           predicate available it is 「その面に重なるもの」, which is the same answer for points and
           the right one for the roads and parcels a reader actually has. */
        id: 'aggregate',
        surface: ['degree-plane'], inputs: 2, accepts: ['Polygon', 'any'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [
          /* ⚠ (#R783) `areaWeightedMean` IS HERE BECAUSE THE REMEDY HAD TO HAVE A DOOR. js/gis-units.js
             answers 「密度・点観測の単純平均は面の平均ではない、面積で重み付けろ」 — and until this
             round the op that received that verdict had no such stat, so the honest refusal pointed at
             a method the reader could not reach. That is the shape #R752 removed for `grid-mismatch`
             (the kernel could resample; nothing could ask it to). Σ(value·km²)/Σkm² over the members
             that overlap the zone, each member weighted by ITS OWN area — a member with no area
             (a point, a line) carries no weight, and a zone whose members are all of them answers
             `null` rather than dividing by zero. */
          { name: 'stat', type: 'enum', required: true, default: 'count', values: AGG_STATS },
          { name: 'field', type: 'field', required: false, input: 1, requiredWhen: { stat: AGG_STATS.filter((s) => s !== 'count') } },
          { name: 'outName', type: 'text', required: false },
          /* ⚠ (#R783) その列は何の量か。js/gis-units.js's vocabulary (`quantityVocabulary()` —
             kind / space / time / period / unit), stated by the caller because NOTHING in this app
             declares one yet: a dataset's `fields` carry a unit and no quantity. Omitted, the
             verdict is 'undeclared' and the run is exactly what it was before — this layer does not
             read silence as permission, and it does not read it as a refusal either. */
          { name: 'quantity', type: 'quantity', required: false, input: 1 },
        ],
      },
    };
    /* ⚠ THERE IS NO SECOND LIST (#R732). This was `const ORDER = ['filter','buffer','clip',
       'aggregate']`, and ops() mapped over it — so an op added to DECL and forgotten here existed,
       answered run(), and WAS NOT IN THE PANEL: the hand-written list
       .agents/rules/no-ad-hoc-hardcoding.md forbids, sitting one line under the comment that
       explains why the panel may not keep one. The authored key order of DECL is the display
       order, and it cannot fall out of step with itself. */
    const ORDER = Object.keys(DECL);

    function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (_) { return null; } }

    /* ── enum vocabularies that belong to somebody else (#R752) ────────────────────────────────
       ⚠ A PARAMETER'S SET OF LEGAL VALUES IS SOMETIMES NOT THIS FILE'S TO KNOW. `sample`'s `method`
       read `['nearest','bilinear']` — a copy of a list js/gis-raster.js owns — and the copy went
       wrong the moment that kernel grew four more methods: the op refused a name its own kernel
       implements, and the panel and the planner both drew the short list.
       ⚠ THE FIX IS A SOURCE, NOT A LONGER COPY. `valuesOf` names where the set lives; this table
       says how to ask. It is a registry of QUESTIONS (two entries, one per kernel surface), not of
       answers — adding a method to the kernel changes nothing here.
       ⚠ AND IT IS ASKED AT CALL TIME. DECL is built when this factory runs, and js/gis-raster.js may
       mount after it (js/gis-core.js says so: every kernel is read from `window` when it is needed,
       never captured). A set resolved into DECL at construction would be the empty list for the
       whole session. */
    const VALUE_SOURCES = {
      /* what the field is worth AT a position — the methods a point can be asked with. The areal
         methods summarise what an output pixel COVERS and need a footprint a point does not have,
         and which is which is the kernel's declaration rather than a rule written twice. */
      'sample-methods-point': () => {
        const RK = rasterKernel();
        if (!RK || typeof RK.sampleMethodFacts !== 'function') return null;
        try { return RK.sampleMethodFacts().filter((m) => m && m.kind === 'point').map((m) => m.id); } catch (_) { return null; }
      },
      /* every method, point and areal alike — what a resample may be asked with. */
      'sample-methods-all': () => {
        const RK = rasterKernel();
        if (!RK || typeof RK.sampleMethods !== 'function') return null;
        try { return RK.sampleMethods(); } catch (_) { return null; }
      },
      /* what two overlapping sheets mean where they overlap — js/gis-raster.js decides, and refuses
         an unstated rule with this same list. */
      'merge-overlaps': () => {
        const RK = rasterKernel();
        if (!RK || typeof RK.mergeOverlaps !== 'function') return null;
        try { return RK.mergeOverlaps(); } catch (_) { return null; }
      },
      /* how two grids are given one lattice — js/gis-warp.js decides, and it already publishes the
         set for exactly this reason ('a UI reads the declaration rather than keeping a copy'). */
      'align-rules': () => {
        const WK = warpKernel();
        if (!WK || typeof WK.alignRules !== 'function') return null;
        try { return WK.alignRules(); } catch (_) { return null; }
      },
      /* (#R756) HOW A PLANE MAY BE NAMED. `crs` has always been free text, and the one plane whose
         parameters cannot be folded into an EPSG code -- the azimuthal equidistant, whose centre IS
         the argument -- was therefore unreachable from `measure`: four planes were implemented and
         three could be asked for. js/gis-crs.js now derives the spellings from its own PLANES table
         and hands them over, so neither this file nor a panel keeps a second list.
         WARNING `open: true` -- the set is the GRAMMAR, not the values. 'utm:<zone>,<south>' stands
         for every zone, so a caller must not present this as a closed dropdown. */
      /* (#R783) 「合計」のどの読み方か — js/gis-raster.js owns the three (Σ value / Σ value·km² /
         Σ value·cover) and judges each against js/gis-units.js's verdict, so the set is ITS to
         publish. ⚠ Until it does, this answers null and `values` is absent — 「訊けなかった」, not
         「選べる値は無い」 — and the rule the caller named is handed to the kernel, which refuses an
         unknown one by name with its own list. A list retyped here would be the copy that falls
         behind the day a fourth reading is added. */
      'total-rules': () => {
        const RK = rasterKernel();
        if (!RK || typeof RK.totalRules !== 'function') return null;
        try { return RK.totalRules(); } catch (_) { return null; }
      },
      /* (#R783) 測れる面の名前は、この層のものではない。js/gis-crs.js publishes every surface it can
         measure an area AND a length on — the ellipsoidal ground included, whose two doors were
         reachable only from the kernel until this round — so `measure` offers exactly those and no
         spelling of them is written here. null is 「訊けなかった」, not 「選べる面は無い」. */
      'measure-surfaces': () => {
        const CK = crsKernel();
        if (!CK || typeof CK.surfaces !== 'function') return null;
        try {
          const list = CK.surfaces()
            .filter((s) => s && Array.isArray(s.measures) && s.measures.indexOf('area') >= 0 && s.measures.indexOf('length') >= 0)
            .map((s) => String(s.name));
          return list.length ? list : null;
        } catch (_) { return null; }
      },
      'plane-spellings': () => {
        const CK = crsKernel();
        if (!CK || typeof CK.planeSpellings !== 'function') return null;
        try { return CK.planeSpellings(); } catch (_) { return null; }
      },
    };

    /* The legal values of one parameter, resolved. ⚠ null is 「訊けなかった」 (the kernel is not
       mounted) and is NOT an empty set — a caller that treats it as one refuses every value the
       reader could possibly have named. run() reaches the runners only after `needsRaster` has been
       checked, so the runners see a list; ops() may not, and says so by leaving `values` absent. */
    function paramValues(decl, name) {
      const p = (decl.params || []).find((x) => x && x.name === name);
      if (!p) return null;
      if (Array.isArray(p.values)) return p.values;
      if (!p.valuesOf) return null;
      const src = Object.prototype.hasOwnProperty.call(VALUE_SOURCES, p.valuesOf) ? VALUE_SOURCES[p.valuesOf] : null;
      return src ? src() : null;
    }

    /* (#R783) One declaration, handed out with the parts that belong to another module resolved.
       `surfaceOf` names where the REST of an op's surfaces live (the ground's spelling is
       js/gis-crs.js's), and it is asked here rather than at construction for the reason the note
       above VALUE_SOURCES gives: that kernel may mount after this factory ran. */
    function declOut(id) {
      const d = clone(DECL[id]);
      if (!d) return null;
      if (!d.surfaceOf) return d;
      const src = Object.prototype.hasOwnProperty.call(VALUE_SOURCES, d.surfaceOf) ? VALUE_SOURCES[d.surfaceOf] : null;
      let extra = null;
      try { extra = src ? src() : null; } catch (_) { extra = null; }
      if (!Array.isArray(d.surface)) d.surface = [];
      for (const name of (extra || [])) if (d.surface.indexOf(name) < 0) d.surface.push(name);
      return d;
    }

    /* ── the runners ──────────────────────────────────────────────────────────────────────────── */

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }

    /* ── how a long step stays interruptible (#R735) ───────────────────────────────────────────
       ⚠ A SYNCHRONOUS LOOP CANNOT BE CANCELLED, AND THAT IS NOT A LIMITATION OF THE UI. run() was
       already `async`, but every runner inside it was one uninterrupted loop: a 40,000-polygon
       aggregate held the single thread for its whole duration, so the map froze, no progress could be
       drawn, and an AbortSignal could not even be SET — the code that would set it does not run until
       the loop lets go. Offering a cancel button over that would be a control with no effect.

       So the runners whose cost grows with the data yield, and the yield is where the signal is
       read. ⚠ (#R752) THIS SENTENCE SAID 「その二つ」 AND THERE ARE EIGHT — clip, overlay, union
       (twice), relate, aggregate, sample, zonal. It was true when it was written and stopped being
       true as runners were added, which is what a count written in prose beside the code it counts
       always does. The number is not restated here: `grep -c 'await ctx.tick'` is the answer, and it
       is right on the day a ninth runner is added.
       ⚠ THE UNIT IS TIME, NOT A COUNT. A chunk of 「1,000 polygons」 is 3 ms of one dataset and
       40 s of another — the number that matters is how long the thread has been held, and one frame
       at 60 Hz is what the renderer needs to stay alive. So elapsed milliseconds decide, and there is
       no per-dataset count to tune.
       ⚠ IT IS NOT A WORKER, AND #R752 DID NOT MAKE IT ONE. The kernels this file calls
       (js/gis-geometry.js's sweep-line, the registry, the geodesy) all live on this thread; moving
       the loop alone would leave every call it makes behind. What a Worker adds is parallelism; what
       this adds is a thread that answers the reader. js/gis-worker.js now exists and takes PURE
       ARITHMETIC over numeric arrays off this thread — the pixel loops, where there is no registry
       and no geodesy to leave behind. The vector runners below still yield rather than parallelise,
       and that is the honest division rather than a half-finished port. */
    const FRAME_MS = 16;
    function nowMs() { try { if (typeof performance !== 'undefined' && performance && performance.now) return performance.now(); } catch (_) { } return Date.now(); }

    function makeCtx(opts) {
      const o = opts || {};
      const sig = o.signal || null;
      const onp = (typeof o.onProgress === 'function') ? o.onProgress : null;
      let last = nowMs(), done = 0;
      return {
        aborted: () => !!(sig && sig.aborted),
        done: () => done,
        /* (#R752) ⚠ CARRIED, NOT RE-READ FROM `opts`. A runner that delegates to a kernel with its
           own loop (js/gis-warp.js walks the output pixels; js/gis-raster.js walks the rows) must
           hand that kernel the SAME signal and the same progress sink, or the reader's cancel button
           stops working the moment the work moves one call deeper — which is the defect
           [[intmap-sync-loop-cannot-be-cancelled]] records, one level down. */
        signal: sig,
        onProgress: onp,
        /* true = keep going, false = the reader asked to stop. */
        async tick(units, total) {
          done += (typeof units === 'number' && isFinite(units)) ? units : 1;
          if (sig && sig.aborted) return false;
          const t = nowMs();
          if (t - last < FRAME_MS) return true;
          last = t;
          if (onp) { try { onp({ done: done, total: (typeof total === 'number' ? total : null) }); } catch (_) { } }
          await new Promise((res) => setTimeout(res, 0));
          return !(sig && sig.aborted);
        },
      };
    }

    /* ── what the geometry kernel could not compute (#R743) ─────────────────────────────────────
       ⚠ EVERY RUNNER BELOW USED TO READ A FAILED COMPUTATION AS AN ABSENT ROW. js/gis-geometry.js
       answered `null` for 「交わらなかった」 and for 「クリッパが例外を投げた」 alike, and the eight
       runners that call it all said `continue`. So a run that lost rows to a throwing sweep-line
       came back as an ordinary `{ ok: true }` with a smaller answer, and NOTHING in the result said
       so: the file already counts what it drops for six other reasons (`_statSkipped`, `dropped`,
       `undated`, `cut`, `nodata`, `partial`), and the geometry was the one cause with no column.

       The ledger is that column. `ok(r)` is the only way a runner reads an attempt: it answers
       whether there is a result to use and REMEMBERS the ones there were not. Two rules then hold
       for every op at once, which is why they live here and not in eight places:

         · a run that lost part of its answer reports the loss in `stats` — js/gis-panel.js prints
           whatever an op measured without knowing what any of it means, so this reaches the reader
           the day it is added, in every language, with no per-op sentence to write;
         · a run that computed NOTHING is a refusal by name, not an empty success. 「0 件でした」 and
           「0 件しか計算できませんでした」 are the two answers a reader cannot tell apart, and only
           one of them is about their data. */
    function makeGeoLedger() {
      let failed = 0, why = null, detail = null;
      return {
        ok(r) {
          if (r && r.ok) return true;
          failed++;
          if (why == null) { why = (r && r.why) || 'geometry-failed'; detail = (r && r.detail) || null; }
          return false;
        },
        failed: () => failed,
        why: () => why,
        detail: () => detail,
      };
    }

    function withGeoStats(res, led, extra) {
      const more = extra || null;
      if (!led.failed()) {
        if (!more) return res;
        res.stats = Object.assign({}, res.stats || {}, more);
        return res;
      }
      if (!res.features || !res.features.length) {
        return fail('geometry-failed', { failed: led.failed(), why: led.why(), detail: led.detail() });
      }
      res.stats = Object.assign({}, res.stats || {}, more || {}, { geometryFailed: led.failed(), geometryWhy: led.why() });
      return res;
    }

    /* ── the spatial index, where it changes the exponent (#R735) ───────────────────────────────
       `boxesMeet` in this file turns the constant down; it still tests every pair. js/gis-index.js is
       the grid that stops the pairs from being enumerated at all. It is asked for, not required: a
       build without it is slower and answers the same thing, so a missing kernel must not become a
       refusal. ⚠ The FALLBACK IS THE OLD WALK, and both paths hand the same candidate set to the same
       predicate — an index that dropped a true pair would make a count quietly smaller, which is why
       tests/r735-gis-raster-time-checks measures the two against each other. */
    function candidateSource(members) {
      const IX = indexKernel();
      if (IX && typeof IX.build === 'function' && typeof IX.queryEach === 'function') {
        let ix = null;
        try { ix = IX.build(members); } catch (_) { ix = null; }
        if (ix) {
          return {
            indexed: true,
            /* ⚠ THE BOX TEST STILL RUNS. The grid answers with a SUPERSET — an item in a cell the
               query touches need not meet the query box — so keeping boxesMeet here is what makes the
               indexed and the unindexed paths hand the predicate the same set, rather than the same
               answer by two different routes. It is the cheap test; the point of the index is that it
               is now asked about tens of items instead of all of them. */
            each: (box, padKm, fn) => {
              /* ⚠ THE BOX IS PADDED ONCE AND BOTH READERS GET THAT BOX (#R743). The index used to be
                 handed { padDeg } and left to grow the box itself, which made the km-to-degree rule
                 exist in two files; js/gis-index.js is wrap-aware and this walk is not, so the two
                 also disagreed about the seam. One padded box, one rule, one seam decision. */
              const q = padBoxKm(box, padKm);
              try { IX.queryEach(ix, q, (m) => (boxesMeet(q, m.bbox) ? fn(m) : true)); }
              catch (_) { for (const m of members) { if (!boxesMeet(q, m.bbox)) continue; if (fn(m) === false) break; } }
            },
            stats: () => { try { return IX.stats(ix); } catch (_) { return null; } },
          };
        }
      }
      return {
        indexed: false,
        each: (box, padKm, fn) => {
          const q = padBoxKm(box, padKm);
          for (const m of members) { if (!boxesMeet(q, m.bbox)) continue; if (fn(m) === false) break; }
        },
        stats: () => null,
      };
    }

    /* ══ ⚠⚠⚠ (#R783) 集計してよい量なのかを、集計する演算が訊く ═══════════════════════════════════
       js/gis-units.js has known since this round whether a method means anything about a quantity —
       「密度は足せない（面積を掛けてから足せ）」「割合の単純平均は分母で重み付けろ」「区分の平均は
       平均ではない」 — and the two ops that AGGREGATE were not asking. `aggregate` and `zonal` would
       compute the mean of a land-cover code and hand it over as a number.
       ⚠⚠⚠ AND THE HARD PART IS THE OTHER DIRECTION: 「誰も述べていない」 must not become
       「してはいけない」. The kernel answers 'undeclared' for every quantity nobody declared, which is
       every column in this app today — reading that as a refusal would break every existing call and
       would ALSO be wrong, because silence is not a contradiction. So:
         'refused'      → a refusal by name, with the kernel's own remedy (a real contradiction; only
                          reachable once somebody HAS declared the quantity)
         'needs-weight' → the weight is applied where this layer honestly has it, and the answer says
                          so; where it does not, the refusal names the method that does
         'undeclared' / 'unreadable' / 'unasked'
                        → the run is UNCHANGED, and the verdict is recorded rather than silently read
                          as permission ([[intmap-data-must-not-claim-an-author-it-lacks]])
       ⚠ NOTHING THAT DOES NOT DECLARE A QUANTITY CHANGES BY ONE BIT — not a value, not a column, not
       a refusal. MEASURED on this tree: every existing spec that calls `aggregate` or `zonal` passes
       unchanged, because none of them declares one.
       ⚠ THE JUDGEMENT IS NOT MADE HERE. This function ASKS; the verdict, the remedy and the weight
       are the unit kernel's words, carried and not re-decided (the same division js/gis-raster.js
       totalOf states for the three totals). */
    function quantitySpecOf(raw) {
      if (raw == null) return { ok: true, spec: null };
      if (typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, spec: raw };
      /* ⚠ A JSON STRING IS THE SAME DECLARATION. js/gis-panel.js draws a text box for a type it does
         not know, so the reader's road to this parameter is a typed string; refusing that would make
         the parameter reachable from Atlas and unreachable from the screen. A string that is not a
         declaration is refused by name rather than read as silence. */
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (s === '') return { ok: true, spec: null };
        let parsed = null;
        try { parsed = JSON.parse(s); } catch (_) { parsed = null; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('bad-param', { param: 'quantity', value: s });
        return { ok: true, spec: parsed };
      }
      return fail('bad-param', { param: 'quantity', value: String(raw) });
    }

    function aggregationVerdict(spec, method, over) {
      const UQ = unitKernel();
      /* ⚠ 「訊けなかった」 IS ITS OWN STATE. A build with no unit module cannot say whether the
         aggregation means anything, and answering 'allowed' for it would be this file deciding the
         question it just delegated. */
      if (!UQ || typeof UQ.aggregation !== 'function') return { verdict: 'unasked', why: 'units-unavailable', method: method, over: over };
      let v = null;
      try { v = UQ.aggregation(spec, method, { over: over }); } catch (_) { v = null; }
      return v || { verdict: 'unasked', why: 'units-unavailable', method: method, over: over };
    }

    /* What travels in the answer and in the recipe about the rule that was used. ⚠ null when there
       was nothing to say: a run over an undeclared quantity records the verdict, and a build with no
       unit kernel records that it could not ask — but a caller that declared nothing on a `count`
       gets the same record it always got. */
    function aggregationRecord(agg, spec, weight) {
      if (!agg) return null;
      const out = { method: agg.method || null, over: agg.over || null, verdict: agg.verdict || null };
      if (agg.why != null) out.why = String(agg.why);
      if (agg.remedy != null) out.remedy = String(agg.remedy);
      if (weight) out.weight = String(weight);
      if (spec != null) out.quantityStatedBy = 'caller';
      return out;
    }

    function hasField(ds, name) {
      for (const f of (ds.fields || [])) if (f && f.name === name) return true;
      return false;
    }

    /* ── the attribute runners (#R738) ────────────────────────────────────────────────────────── */

    /* ⚠ THE KEY IS TEXT, AND THAT IS THE WHOLE DESIGN. Everything else in this file compares through
       asNumber because everything else is comparing quantities; a join compares IDENTIFIERS, and the
       two rules give different answers for exactly the cells that matter — `"01100"` (札幌市中央区)
       and `"1100"` are one number and two places. #R735 stopped the type rule from calling a
       zero-padded cell a number; this is the reader of that decision. Trimming is the only
       normalisation: whitespace around a cell is a property of the file, not of the code. */
    function joinKey(v) {
      if (v == null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    }

    async function runJoin(left, right, params, ctx) {
      const lf = params.leftField, rf = params.rightField;
      if (lf == null || String(lf) === '') return fail('missing-param', { param: 'leftField' });
      if (rf == null || String(rf) === '') return fail('missing-param', { param: 'rightField' });
      if (!hasField(left, lf)) return fail('unknown-field', { input: 0, field: String(lf) });
      if (!hasField(right, rf)) return fail('unknown-field', { input: 1, field: String(rf) });

      const wanted = Array.isArray(params.fields) && params.fields.length
        ? params.fields.map((x) => String(x))
        : (right.fields || []).map((f) => f.name).filter((n) => n !== rf);
      for (const n of wanted) if (!hasField(right, n)) return fail('unknown-field', { input: 1, field: n });

      const prefix = (params.prefix == null) ? '' : String(params.prefix);
      /* ⚠ A COLLISION IS REFUSED, NOT RESOLVED. Overwriting the left's own column would destroy data
         the reader still has on screen, and renaming it here would invent a name nothing else knows.
         `prefix` is how the reader answers this, and it is in the declaration so the panel can offer
         it without knowing why. */
      const collide = wanted.filter((n) => hasField(left, prefix + n));
      if (collide.length) return fail('join-column-collision', { columns: collide.slice(0, 8), prefix: prefix || null });

      const dup = params.duplicates === 'first' ? 'first' : 'refuse';
      const table = new Map();
      const dupes = [];
      for (const f of right.features()) {
        const p = props(f);
        const k = joinKey(p[rf]);
        if (k == null) continue;
        if (table.has(k)) { if (dup === 'refuse') { if (dupes.indexOf(k) < 0 && dupes.length < 8) dupes.push(k); continue; } continue; }
        table.set(k, p);
      }
      if (dup === 'refuse' && dupes.length) return fail('join-right-not-unique', { field: String(rf), keys: dupes });

      const drop = params.unmatched === 'drop';
      const out = [];
      let matched = 0, unmatched = 0, noKey = 0;
      const missSample = [];
      /* (#R764) 左の行数が費用。右は上で 1 度だけ索引にしてある。 */
      const rows = left.features();
      for (let li = 0; li < rows.length; li++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[li];
        const p = props(f);
        const k = joinKey(p[lf]);
        const hit = (k == null) ? null : table.get(k);
        if (k == null) noKey++;
        if (hit) {
          matched++;
          const merged = Object.assign({}, p);
          for (const n of wanted) { const v = hit[n]; if (v !== undefined) merged[prefix + n] = v; }
          out.push({ type: 'Feature', geometry: f.geometry || null, properties: merged });
        } else {
          unmatched++;
          if (k != null && missSample.length < 5) missSample.push(k);
          if (!drop) out.push(f);
        }
      }
      /* ⚠ THE COUNTS ARE THE ANSWER, NOT A FOOTNOTE. Two files that write the same municipality code
         differently produce a join that is structurally perfect and empty of information, and the
         only way the reader can see that is to be told how many rows found a partner — with a sample
         of the keys that did not, so the difference (a leading zero, a prefecture prefix) is visible
         rather than inferred. `rightKeys` says how big the lookup actually was. */
      /* ⚠⚠⚠ (#R763) A RENAMED COLUMN IS THE SAME QUANTITY, AND THE STATEMENT ABOUT IT HAS TO FOLLOW.
         fieldStatements below keys the inputs' units BY COLUMN NAME, and this op is the one place in
         the app that changes a column's name: `mass` with 「kg」 on it arrives as `joined_mass` with
         nothing on it. The reader cannot put it back either — a derived record refuses to be declared
         on at all (`edit-would-contradict-recipe`) — so the unit was gone for good after one join.
         ⚠ THE COLLISION CHECK ALREADY KNEW: it tests `prefix + n` eleven lines up. Prefixing was
         understood at one end of this function and not at the other. */
      const renamed = prefix ? wanted.reduce((m, n) => { m[prefix + n] = { from: right.id, name: n }; return m; }, {}) : null;
      return {
        ok: true, features: out, renamed: renamed,
        stats: { matched: matched, unmatched: unmatched, noKey: noKey, rightKeys: table.size, columns: wanted.length, unmatchedSample: missSample },
      };
    }

    /* ── the joins (#R783) ──────────────────────────────────────────────────────────────────────
       ⚠ ONE IMPLEMENTATION OF THE THINGS ALL THREE DO. Which columns come over, the name they
       arrive under, the refusal when that name is taken, the `renamed` statement that keeps a
       prefixed column's unit (#R763), what happens to a feature with several partners and to one
       with none — none of that depends on WHAT decided the partners, so it lives here once. Three
       copies would drift the first time one of them was fixed, which is the shape
       .agents/rules/no-ad-hoc-hardcoding.md §2-3 names. */

    /* The right-hand columns and the names they land under, or a refusal. `writes` are the columns
       THIS run invents (a distance, a partner count): a column the reader already has is not
       overwritten, by the same argument `aggregate` refuses `output-column-in-use`. */
    function joinPlan(left, right, params, writes) {
      const wanted = Array.isArray(params.fields) && params.fields.length
        ? params.fields.map((x) => String(x))
        : (right.fields || []).map((f) => f.name);
      for (const n of wanted) if (!hasField(right, n)) return fail('unknown-field', { input: 1, field: n });
      const prefix = (params.prefix == null) ? '' : String(params.prefix);
      /* Same rule as runJoin: a collision is REFUSED, not resolved. Overwriting the left's own
         column would destroy data the reader still has on screen, and renaming it here would
         invent a name nothing else knows. `prefix` is how the reader answers this. */
      const collide = wanted.filter((n) => hasField(left, prefix + n));
      if (collide.length) return fail('join-column-collision', { columns: collide.slice(0, 8), prefix: prefix || null });
      for (const n of (writes || [])) if (hasField(left, n)) return fail('output-column-in-use', { name: n });
      return {
        ok: true, wanted: wanted, prefix: prefix,
        /* (#R763) A renamed column is the same quantity, and the statement about it has to follow —
           fieldStatements keys the inputs' units BY COLUMN NAME, and a prefix is a rename. */
        renamed: prefix ? wanted.reduce((m, n) => { m[prefix + n] = { from: right.id, name: n }; return m; }, {}) : null,
      };
    }

    /* The stated cardinality, or the refusal that names the set. ⚠ NO DEFAULT IS SUPPLIED HERE
       EITHER — a default written in the runner would be the silent choice DECL declined to make. */
    function joinCardinality(params) {
      const v = (params.cardinality == null) ? '' : String(params.cardinality);
      if (!v) return fail('missing-param', { param: 'cardinality', values: JOIN_CARDINALITY });
      if (JOIN_CARDINALITY.indexOf(v) < 0) return fail('bad-param', { param: 'cardinality', value: v, values: JOIN_CARDINALITY });
      return { ok: true, mode: v };
    }

    /* Writes the output rows. `matches` is [{ row, props, extra }] and MUST be in input 1's own row
       order — see the note in runSpatialJoin for why the index's visiting order may not decide
       which partner 'first' means. */
    function joinWriter(plan, mode, drop, countName) {
      const out = [];
      let matched = 0, unmatched = 0, pairs = 0, oneToMany = 0, maxPartners = 0;
      return {
        rows: out,
        take(f, matches) {
          if (!matches.length) {
            unmatched++;
            /* ⚠ THE FEATURE TRAVELS UNCHANGED. A row with no partner keeps the properties the
               reader imported, byte for byte — the same thing runJoin does, so an unmatched row is
               recognisable as one rather than as a row with empty new columns. */
            if (!drop) out.push(f);
            return;
          }
          matched++;
          pairs += matches.length;
          if (matches.length > maxPartners) maxPartners = matches.length;
          if (matches.length > 1) oneToMany++;
          const p = props(f);
          const use = (mode === 'all') ? matches : matches.slice(0, 1);
          for (const m of use) {
            const merged = Object.assign({}, p);
            for (const n of plan.wanted) { const v = m.props[n]; if (v !== undefined) merged[plan.prefix + n] = v; }
            if (m.extra) Object.assign(merged, m.extra);
            /* ⚠ HOW MANY PARTNERS THERE REALLY WERE, ON THE ROW. Under 'first' this is the only
               thing that can tell a reader their forty facilities became one — the count is the
               answer to 「1 対多だった」 and dropping it would make 'first' look like 1-to-1. */
            if (countName) merged[countName] = matches.length;
            out.push({ type: 'Feature', geometry: f.geometry || null, properties: merged });
          }
        },
        stats: () => ({
          matched: matched, unmatched: unmatched, pairs: pairs,
          oneToMany: oneToMany, maxPartners: maxPartners, columns: plan.wanted.length,
        }),
      };
    }

    const JOIN_COUNT = '_joinPartners';

    async function runSpatialJoin(aDs, bDs, params, R, ctx) {
      const GG = geometry();
      const predicate = (params.predicate == null || String(params.predicate) === '') ? 'intersects' : String(params.predicate);
      if (JOIN_PREDICATES.indexOf(predicate) < 0) return fail('bad-param', { param: 'predicate', value: predicate, values: JOIN_PREDICATES });
      let maxKm = null;
      if (predicate === 'nearer-than') {
        maxKm = R.asNumber(params.maxKm);
        if (maxKm == null) return fail('missing-param', { param: 'maxKm' });
        if (!(maxKm >= 0)) return fail('bad-param', { param: 'maxKm', value: params.maxKm });
      }
      const card = joinCardinality(params);
      if (!card.ok) return card;
      const writes = (predicate === 'nearer-than') ? [JOIN_COUNT, '_distanceKm'] : [JOIN_COUNT];
      const plan = joinPlan(aDs, bDs, params, writes);
      if (!plan.ok) return plan;

      /* Read once with its box and its properties, so a 50,000-row input is not walked through its
         accessors again for every left feature — the shape runAggregate uses. */
      const others = [];
      for (const f of bDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        others.push({ row: others.length, geometry: g, bbox: bboxOf(g), props: props(f) });
      }
      /* ⚠ 「相手に地物が 1 つも無い」 IS NOT 「一致が 0 件だった」. The second is an answer about the
         reader's data and the first is about their inputs, and `relate` already tells them apart by
         this name. */
      if (!others.length) return fail('no-features', { input: 1 });

      const pad = (predicate === 'nearer-than') ? maxKm : 0;
      const cand = candidateSource(others);
      const led = makeGeoLedger();
      const w = joinWriter(plan, card.mode, params.unmatched === 'drop', JOIN_COUNT);
      const rows = aDs.features();
      for (let li = 0; li < rows.length; li++) {
        if (!(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[li];
        const g = f && f.geometry;
        /* A row that states no place cannot stand in a spatial relation to anything. It has no
           partner — which is a different fact from 「探したが無かった」 and is counted as such. */
        if (!g) { w.take(f, []); continue; }
        const gb = bboxOf(g);
        const matches = [];
        cand.each(gb, pad, (o) => {
          const r = relateOne(GG, g, o.geometry, predicate, maxKm);
          if (!led.ok(r)) return true;
          if (r.d == null) return true;
          matches.push({ row: o.row, props: o.props, extra: (predicate === 'nearer-than') ? { _distanceKm: r.d } : null });
          /* ⚠ 'first' DOES NOT STOP THE WALK, and 'refuse' cannot either: both need to know HOW
             MANY partners there were, and a walk that stopped at the first would report 1 for every
             row — the silence `cardinality` exists to remove. */
          return true;
        });
        /* ⚠⚠⚠ THE ORDER OF THE PARTNERS IS INPUT 1'S, NOT THE INDEX'S. candidateSource hands
           candidates over in the order its grid happens to hold them, and the unindexed fallback
           hands them over in row order — so 'first' would have meant two different partners
           depending on whether js/gis-index.js was mounted, and a saved recipe would replay to a
           different answer. Sorting by the row the partner came from is what makes 「最初の一致」 a
           statement about the reader's data instead of about the index. */
        matches.sort((x, y) => x.row - y.row);
        if (card.mode === 'refuse' && matches.length > 1) {
          return fail('join-one-to-many', { input: 0, row: li, partners: matches.length, cardinality: JOIN_CARDINALITY });
        }
        w.take(f, matches);
      }
      return withGeoStats({ ok: true, features: w.rows, renamed: plan.renamed }, led,
        Object.assign(w.stats(), { predicate: predicate, cardinality: card.mode, indexed: cand.indexed }));
    }

    async function runNearestJoin(aDs, bDs, params, R, ctx) {
      const GG = geometry();
      let maxKm = null;
      if (params.maxKm != null && String(params.maxKm).trim() !== '') {
        maxKm = R.asNumber(params.maxKm);
        if (maxKm == null || !(maxKm > 0)) return fail('bad-param', { param: 'maxKm', value: params.maxKm });
      }
      const idField = (params.idField == null || String(params.idField) === '') ? null : String(params.idField);
      if (idField && !hasField(bDs, idField)) return fail('unknown-field', { input: 1, field: idField });
      const writes = ['_nearestKm', '_nearestRow'].concat(idField ? ['_nearestId'] : []);
      const plan = joinPlan(aDs, bDs, params, writes);
      if (!plan.ok) return plan;

      const targets = [];
      for (const f of bDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        targets.push({ row: targets.length, geometry: g, bbox: bboxOf(g), props: props(f) });
      }
      if (!targets.length) return fail('no-features', { input: 1 });

      const cand = candidateSource(targets);
      const Rk = earthKm();
      /* The furthest two points on a sphere of this radius can be. Derived, not chosen: it is the
         radius IntMapGeodesy publishes, so 「上限を述べなかった」 is 「地球の裏側まで」 and not a
         number written here. */
      const halfWay = Math.PI * Rk;
      const cap = (maxKm != null) ? Math.min(maxKm, halfWay) : halfWay;
      const kmPerDeg = Math.PI * Rk / 180;
      /* ⚠⚠⚠ THE FIRST RADIUS IS THE INDEX'S OWN CELL, AND THAT IS WHY IT IS NOT A TUNING KNOB.
         js/gis-index.js derives its cell size FROM THE DATA (the median item size, or the core span
         over √n), so one cell is 「この記録では近いとはどのくらいか」 already measured. A fixed
         seed would be a constant with no observation behind it, which §4 of
         .agents/rules/no-ad-hoc-hardcoding.md forbids; with no index mounted there is no grid to
         ask and the walk is over every target anyway, so the first radius is the cap and the search
         is one pass. */
      const seed = (() => {
        const s = cand.stats();
        const deg = s && s.cellDeg;
        const km = (typeof deg === 'number' && isFinite(deg) && deg > 0) ? deg * kmPerDeg : 0;
        return (km > 0 && km < cap) ? km : cap;
      })();

      const led = makeGeoLedger();
      const w = joinWriter(plan, 'first', params.unmatched === 'drop', null);
      const rows = aDs.features();
      let ties = 0, passes = 0, capped = 0;
      for (let li = 0; li < rows.length; li++) {
        if (!(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[li];
        const g = f && f.geometry;
        if (!g) { w.take(f, []); continue; }
        const gb = bboxOf(g);
        let radius = seed, best = null, bestItem = null, tie = 0;
        /* ⚠⚠⚠ WHY THE ANSWER IS THE TRUE NEAREST AND NOT THE NEAREST IN A BOX. padBoxKm grows the
           query box so that NOTHING within `radius` km of it is left out (#R743 measured the round
           that got this backwards), so once a partner is found at `best ≤ radius` there can be no
           closer one outside the box — the box already contained every target that near. When the
           best found is FURTHER than the radius searched, the radius becomes that distance and the
           same query is asked once more: the second pass sees the same winner, now inside its own
           box, and stops. When nothing at all was found the radius grows by 4× until it reaches the
           cap, where the box is the world and the walk is exhaustive.
           ⚠ THE LOOP IS NOT A RETRY OF A FAILURE (.agents/rules/one-pass-or-a-reason.md §5): each
           pass is a DIFFERENT, strictly larger question, it terminates in at most log₄(cap/seed)+1
           of them, and `stats.passes` reports the total so an index that is not helping is visible
           rather than assumed. */
        for (;;) {
          passes++;
          best = null; bestItem = null; tie = 0;
          cand.each(gb, radius, (o) => {
            const r = GG.attempt.distanceKm(g, o.geometry);
            if (!r.ok) {
              /* An empty geometry is not within any distance of anything — the reading relateOne
                 already makes, so one empty row does not poison the dataset. */
              if (r.why !== 'no-comparable-parts') led.ok(r);
              return true;
            }
            const d = r.value;
            if (d == null) return true;
            if (maxKm != null && d > maxKm) return true;
            if (best == null || d < best) { best = d; bestItem = o; tie = 1; return true; }
            /* ⚠ A TIE IS TWO DISTANCES THAT ARE THE SAME FLOAT, not two that are close. A
               tolerance here would be a claim about measurement error that nobody in this project
               has measured; the lowest row of input 1 wins, so the answer is the reader's own
               order rather than the index's. */
            if (d === best) { tie++; if (o.row < bestItem.row) bestItem = o; }
            return true;
          });
          if (best != null && best <= radius) break;
          if (radius >= cap) { if (best == null) capped++; break; }
          radius = (best != null) ? Math.min(best, cap) : Math.min(radius * 4, cap);
        }
        if (best == null || bestItem == null) { w.take(f, []); continue; }
        if (tie > 1) ties++;
        const extra = { _nearestKm: best, _nearestRow: bestItem.row };
        if (idField) extra._nearestId = bestItem.props[idField];
        w.take(f, [{ row: bestItem.row, props: bestItem.props, extra: extra }]);
      }
      return withGeoStats({ ok: true, features: w.rows, renamed: plan.renamed }, led,
        Object.assign(w.stats(), {
          ties: ties, passes: passes, searchedToLimit: capped,
          indexed: cand.indexed, seedKm: seed, capKm: cap,
        }));
    }

    /* ══ ⚠⚠⚠ (#R783) 半開で読む — その日はどちらのものか ══════════════════════════════════════
       The registry hands a span back as a pair of milliseconds in which `end` is the LAST instant
       the row holds: momentOf reads a bare year as the WHOLE year, so 1889 ends at
       1889-12-31T23:59:59.999. Half-open arithmetic needs the first instant the row does NOT hold,
       and the two readings differ by exactly the case this op exists for — 廃藩置県 is stated as
       1871-08-29 by the 令制国 that ended and by the 県 that began, so 「その日の区域」 has one
       answer under [from, to) and two under [from, to].
         · an INTERVAL whose end cell is a stated instant → that instant is the BOUNDARY: the row
           does not hold at it ('exclusive', the default), or it is the last moment it holds
           ('inclusive')
         · an interval whose end cell is a BARE YEAR → the year names a PERIOD, so the boundary is
           the first instant of the next year under either reading; 「1871 年まで」 includes 1871
       ⚠ WHICH OF THE TWO A CELL IS, IS THE REGISTRY'S ANSWER AND NOT A PARSE OF OUR OWN. momentOf
       returns `year` only when its year rule fired, and this asks it for that one fact — a second
       reader of 「その綴りは年か日付か」 would drift from the one that built the span
       (.agents/rules/no-ad-hoc-hardcoding.md §2-3).
       ⚠ AN AXIS WHOSE END CANNOT BE ASKED IS READ AS INCLUSIVE, AND THE ANSWER SAYS SO. A
       `constant` declaration holds milliseconds that js/gis-datasets.js already normalised and a
       `track` holds an array of fixes; neither has a cell this function can put back through
       momentOf, so the last instant it holds is the last instant it holds, and `stats.endsRead`
       reports how many rows were read each way. Moving a boundary on the strength of a guess is
       what 「述べられていないことを地図が述べる」 looks like in arithmetic. */
    function spanReader(ds, R, endsExclusive) {
      const t = ds && ds.time;
      /* Only an interval STATES an end. An instant is a moment (or a year) and occupies itself; a
         constant and a track hold milliseconds nobody can ask about any more. */
      const endField = (t && t.kind === 'interval' && t.endField) ? t.endField : null;
      let asked = 0, assumed = 0;
      return {
        read(f) {
          const s = R.timeSpan(ds, f);
          if (!s) return null;
          const start = (s.start == null) ? -Infinity : s.start;
          /* An open end means 「まだ続いている」/「終わりを誰も述べていない」 — it reaches every
             window, the reading runTimeWindow already states. */
          if (s.end == null) return { start: start, endEx: Infinity };
          const cell = endField ? props(f)[endField] : undefined;
          const m = (cell === undefined || cell === null) ? null : R.momentOf(cell);
          let endEx;
          if (m && m.year == null) { asked++; endEx = endsExclusive ? s.end : s.end + 1; }
          else { assumed++; endEx = s.end + 1; }
          return { start: start, endEx: endEx };
        },
        stated: () => ({ statedEnd: asked, periodEnd: assumed }),
      };
    }

    /* The moment the READER stated, read half-open. ⚠ 「…まで」 NAMES A PERIOD AND THE WHOLE OF IT
       IS IN: a bare year's exclusive bound is the first instant of the next year, so
       from:1871 to:1871 is the whole of 1871. A stated instant IS the bound, so
       from:'1871-08-29' to:'1871-09-01' does not include 1871-09-01. Returns
       `{ ok:true, span:null }` when the reader stated nothing, which is the case where input 0's
       own axis answers instead. */
    function statedWindow(params, R) {
      const txt = (k) => (params[k] == null || String(params[k]).trim() === '') ? null : String(params[k]).trim();
      const atRaw = txt('at');
      if (atRaw) {
        const m = R.momentOf(atRaw);
        if (!m) return fail('bad-param', { param: 'at', value: atRaw });
        if (txt('from') || txt('to')) return fail('bad-param', { param: 'at', value: atRaw, detail: 'at-with-window' });
        return { ok: true, span: { start: m.start, endEx: m.end + 1 }, stated: 'at' };
      }
      const fromRaw = txt('from'), toRaw = txt('to');
      if (!fromRaw && !toRaw) return { ok: true, span: null, stated: null };
      const fromM = fromRaw ? R.momentOf(fromRaw) : null;
      if (fromRaw && !fromM) return fail('bad-param', { param: 'from', value: fromRaw });
      const toM = toRaw ? R.momentOf(toRaw) : null;
      if (toRaw && !toM) return fail('bad-param', { param: 'to', value: toRaw });
      const start = fromM ? fromM.start : -Infinity;
      const endEx = toM ? ((toM.year != null) ? toM.end + 1 : toM.end) : Infinity;
      if (!(start < endEx)) return fail('bad-param', { param: 'to', value: toRaw });
      return { ok: true, span: { start: start, endEx: endEx }, stated: 'window' };
    }

    /* Half-open, all three of them. `overlaps` is a NECESSARY condition for the other two, which is
       what lets the sweep below prune candidates for every relation with one rule. */
    function timeRelates(relation, a, b) {
      if (relation === 'within') return b.start <= a.start && a.endEx <= b.endEx;
      if (relation === 'contains') return a.start <= b.start && b.endEx <= a.endEx;
      return a.start < b.endEx && b.start < a.endEx;
    }

    async function runTimeJoin(aDs, bDs, params, R, ctx) {
      const relation = (params.relation == null || String(params.relation) === '') ? 'overlaps' : String(params.relation);
      const relations = paramValues(DECL.timeJoin, 'relation');
      if (relations.indexOf(relation) < 0) return fail('bad-param', { param: 'relation', value: relation, values: relations });
      const ends = (params.ends == null || String(params.ends) === '') ? 'exclusive' : String(params.ends);
      if (TIME_ENDS.indexOf(ends) < 0) return fail('bad-param', { param: 'ends', value: ends, values: TIME_ENDS });
      const win = statedWindow(params, R);
      if (!win.ok) return win;
      const card = joinCardinality(params);
      if (!card.ok) return card;
      /* ⚠ THE SIDE BEING ASKED WHEN IT HOLDS MUST HAVE SAID SO. `time-not-declared` carries WHICH
         input, and the registry's own refusal when it had one, so 「宣言していない」 and
         「宣言が読めなかった」 do not reach the reader as the same sentence. */
      if (!bDs.time) return fail('time-not-declared', { input: 1, refused: bDs.timeRefused ? String(bDs.timeRefused.why || '') : null });
      if (!win.span && !aDs.time) return fail('time-not-declared', { input: 0, refused: aDs.timeRefused ? String(aDs.timeRefused.why || '') : null });
      const plan = joinPlan(aDs, bDs, params, [JOIN_COUNT]);
      if (!plan.ok) return plan;

      const rightRead = spanReader(bDs, R, ends === 'exclusive');
      const leftRead = win.span ? null : spanReader(aDs, R, ends === 'exclusive');

      const targets = [];
      let undatedRight = 0, ri = -1;
      for (const f of bDs.features()) {
        ri++;
        const s = rightRead.read(f);
        /* ⚠ A ROW WHOSE OWN TIME CANNOT BE READ IS NOT A PARTNER OF EVERY WINDOW. It is counted and
           left out — the reading runTimeWindow states for the same case. */
        if (!s) { undatedRight++; continue; }
        targets.push({ row: ri, start: s.start, endEx: s.endEx, props: props(f) });
      }
      if (!targets.length) return fail('no-features', { input: 1, undated: undatedRight });

      /* ⚠⚠⚠ NOT A LOOP OVER A × B, AND NOT A SECOND COPY OF js/gis-index.js EITHER. That file's
         promise is about BOXES on a plate-carrée plane with a seam; time has one axis and no seam,
         and mapping milliseconds onto degrees to borrow its grid would be a lie about its domain.
         What bounds the work here is the classic sweep: the targets are sorted by their start, a
         binary search finds the last one that can begin before the query ends, and the walk goes
         DOWNWARD from there with a prefix maximum of the exclusive ends — the moment
         `reach[i] <= query.start`, no earlier target can possibly reach the query and the walk
         stops. ⚠ IT HAS NO FALSE NEGATIVE: `reach[i]` is the largest end among targets 0..i, so a
         target that could overlap is never behind the stop. Deeply nested spans (one validity that
         covers the whole record) degrade it toward the full walk, which is the same character as
         js/gis-index.js's `always` bucket — and `stats.scanned` is how a caller sees it happening
         instead of assuming it is not. */
      targets.sort((x, y) => (x.start - y.start) || (x.row - y.row));
      const reach = new Array(targets.length);
      for (let i = 0; i < targets.length; i++) reach[i] = (i ? Math.max(reach[i - 1], targets[i].endEx) : targets[i].endEx);
      /* The first index whose start is >= t (targets are sorted by start). */
      const lowerBound = (t) => {
        let lo = 0, hi = targets.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (targets[mid].start < t) lo = mid + 1; else hi = mid; }
        return lo;
      };

      const w = joinWriter(plan, card.mode, params.unmatched === 'drop', JOIN_COUNT);
      const rows = aDs.features();
      let undatedLeft = 0, scanned = 0;
      for (let li = 0; li < rows.length; li++) {
        if (!(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[li];
        const q = win.span || leftRead.read(f);
        if (!q) { undatedLeft++; w.take(f, []); continue; }
        const matches = [];
        /* Everything at or after the query's exclusive end begins too late for any of the three
           relations — `overlaps` is necessary for `within` and `contains` alike. */
        let i = (q.endEx === Infinity) ? targets.length - 1 : lowerBound(q.endEx) - 1;
        for (; i >= 0; i--) {
          if (reach[i] <= q.start) break;
          scanned++;
          const t = targets[i];
          if (!timeRelates(relation, q, t)) continue;
          matches.push({ row: t.row, props: t.props, extra: null });
        }
        matches.sort((x, y) => x.row - y.row);
        if (card.mode === 'refuse' && matches.length > 1) {
          return fail('join-one-to-many', { input: 0, row: li, partners: matches.length, cardinality: JOIN_CARDINALITY });
        }
        w.take(f, matches);
      }
      const read = rightRead.stated();
      return {
        ok: true, features: w.rows, renamed: plan.renamed,
        stats: Object.assign(w.stats(), {
          relation: relation, cardinality: card.mode, ends: ends,
          /* ⚠ 使った規則は答えに載る。`statedEnd` counted the rows whose end cell was a stated
             instant and so obeyed `ends`; `periodEnd` counted the rows whose end named a period (a
             bare year) or could not be asked at all, and were therefore read inclusively. A number
             that does not say which rule produced it cannot be compared with one produced by the
             other rule. */
          endsRead: read,
          window: win.span ? { start: win.span.start, endEx: win.span.endEx, from: win.stated } : null,
          undatedLeft: undatedLeft, undatedRight: undatedRight,
          targets: targets.length, scanned: scanned,
        }),
      };
    }

    async function runCompute(ds, params, R, ctx) {
      const X = exprKernel();
      if (!X || typeof X.compile !== 'function') return fail('expr-unavailable');
      const name = (params.outName == null) ? '' : String(params.outName).trim();
      if (!name) return fail('missing-param', { param: 'outName' });
      const src = (params.expr == null) ? '' : String(params.expr);
      if (!src.trim()) return fail('missing-param', { param: 'expr' });
      /* ⚠ AN EXISTING COLUMN IS NOT OVERWRITTEN BY DEFAULT. `compute` is how a reader builds 人口密度
         out of 人口 and 面積; typing 人口 into the name field would otherwise replace the input of the
         very expression being written, in a record whose recipe then reproduces the replacement. */
      if (hasField(ds, name) && params.replace !== true) return fail('compute-column-exists', { field: name });

      const parsed = X.parse(src);
      if (!parsed || !parsed.ok) return fail(parsed && parsed.why ? parsed.why : 'expr-syntax', (parsed && parsed.detail) || null);
      /* ⚠ THE SAME RULE runFilter USES. A column that is not there must be refused rather than
         answered — an expression over a misspelt name would otherwise produce a full column of nulls
         and a chart of nothing, with no error anywhere. */
      for (const f of (parsed.fields || [])) if (!hasField(ds, f)) return fail('unknown-field', { field: String(f) });

      /* ⚠⚠⚠ (#R774) `人口 + 面積` HAS ALWAYS BEEN A NUMBER, AND IT HAS NEVER BEEN A QUANTITY. The
         evaluator converts nothing and knows nothing about units, so an expression that adds metres
         to kilometres produced a column and a chart with nothing anywhere saying what had happened —
         the same defect `rasterDiff` shipped with, one layer up. The verdict is asked of
         js/gis-units.js over js/gis-expr.js's own AST, so `compute` and `rasterCalc` below get the
         SAME answer from the SAME place rather than two walks that agree today.
         ⚠ A COLUMN THAT STATES NOTHING IS NOT REFUSED — silence is not a mismatch (most columns in
         this app state no unit), and a literal is neutral, so `pop / area` and `t − 273.15` are
         untouched. What is refused is two columns that BOTH stated, and stated differently.
         ⚠ AND THE OUTPUT NOW CARRIES THE UNIT IT DERIVED, which is the half #R759 could not do for
         a computed column: js/gis-datasets.js applyInherited keys statements by column NAME, and
         this column did not exist until now, so nobody could ever state its unit afterwards. */
      const UQ = unitKernel();
      let derivedUnit = null;
      if (UQ && typeof UQ.unitOfExpr === 'function') {
        const uv = UQ.unitOfExpr(parsed.ast, (n) => unitOfField(ds, n));
        if (!uv.ok) return fail(uv.why, uv.detail);
        derivedUnit = uv.unit || null;
      }

      const c = X.compile(src, R);
      if (!c || !c.ok) return fail(c && c.why ? c.why : 'expr-syntax', (c && c.detail) || null);

      const out = [];
      let errors = 0, empty = 0, firstError = null;
      const rows = ds.features();
      for (let i = 0; i < rows.length; i++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[i];
        const p = props(f);
        let res = null;
        try { res = c.fn(p); } catch (e) { res = { value: null, error: { why: 'expr-internal', detail: (e && e.message) || null } }; }
        if (res && res.error) { errors++; if (!firstError) firstError = res.error; }
        const v = res ? res.value : null;
        if (v == null) empty++;
        const merged = Object.assign({}, p);
        /* A null result is written as an ABSENT cell rather than as the string "null": the registry
           types a column from the cells that are there, and an empty cell is what 「この行では計算
           できなかった」 looks like everywhere else in this layer. */
        if (v == null) delete merged[name]; else merged[name] = v;
        out.push({ type: 'Feature', geometry: f.geometry || null, properties: merged });
      }
      return {
        ok: true, features: out,
        /* (#R774) The runner states the unit of the column it invented — the same shape as
           `renamed` above, and for the same reason: it is the only thing that knows. */
        units: derivedUnit ? { [name]: derivedUnit } : null,
        stats: { computed: out.length - empty, empty: empty, errors: errors, firstError: firstError, returns: parsed.returns, unit: derivedUnit },
      };
    }

    /* ── convert: 換算は、演算であって算術ではない (#R783) ────────────────────────────────────── */

    async function runConvert(ds, params, R, ctx) {
      const UQ = unitKernel();
      if (!UQ || typeof UQ.convert !== 'function' || typeof UQ.compare !== 'function') return fail('units-unavailable');
      const field = (params.field == null) ? '' : String(params.field).trim();
      if (!field) return fail('missing-param', { param: 'field' });
      if (!hasField(ds, field)) return fail('unknown-field', { input: 0, field: field });
      const to = UQ.stated(params.to);
      if (to == null) return fail('missing-param', { param: 'to' });

      const replace = params.replace === true;
      const outNameRaw = (params.outName == null) ? '' : String(params.outName).trim();
      /* ⚠ THE DESTINATION IS NEVER INVENTED. A name built here out of the target spelling would be
         a column called `len_m/s` in some cases and a collision in others, and the reader could not
         predict either. Either they name it, or they say the column itself becomes the converted
         one. */
      if (replace && outNameRaw) return fail('bad-param', { param: 'outName', value: outNameRaw, detail: 'replace-writes-the-same-column' });
      if (!replace && !outNameRaw) return fail('missing-param', { param: 'outName' });
      const outName = replace ? field : outNameRaw;
      if (!replace && hasField(ds, outName)) return fail('output-column-in-use', { name: outName });

      /* 換算前の単位。The column's own statement first, because it has an AUTHOR (`unitStated`) and
         a caller's `from` does not. */
      const column = UQ.stated(unitOfField(ds, field));
      const asked = UQ.stated(params.from);
      if (column != null && asked != null) {
        const same = UQ.compare(column, asked);
        /* ⚠ 'convertible' IS STILL A DISAGREEMENT HERE. 「この列は m だ」 と 列自身の 「km だ」 は
           両方が本当ではありえない——片方を黙って採ると、換算は通り、答えは 1000 倍違う。 */
        if (same.verdict !== 'identical') {
          return fail('unit-from-contradicts-column', { field: field, column: column, from: asked, verdict: same.verdict });
        }
      }
      const from = (asked != null) ? asked : column;
      if (from == null) return fail('unit-not-stated', { field: field, to: to });

      const verdict = UQ.compare(from, to);
      if (verdict.verdict === 'incompatible') return fail('unit-incompatible', { field: field, from: from, to: to });
      if (verdict.verdict === 'unknown') return fail('unit-unreadable', { field: field, from: from, to: to, unreadable: verdict.unreadable || null });
      if (verdict.verdict !== 'identical' && verdict.verdict !== 'convertible') {
        return fail('unit-not-stated', { field: field, from: from, to: to, verdict: verdict.verdict });
      }

      const difference = params.difference === true;
      /* ⚠⚠⚠ THE TRANSFORM IS ASKED OF THE KERNEL, NOT READ OUT OF ITS TABLE. slope is what the
         kernel does to a DIFFERENCE of one (offsets cancel) and intercept is what it does to zero;
         together they are the affine map it applied, in the kernel's own arithmetic. Writing
         `pa.f / pb.f` here would be a second copy of the conversion — and for °C→K there is no
         factor to copy at all, which is exactly why the recipe records a map and not a 倍率. */
      const slope = UQ.convert(1, from, to, { difference: true });
      const intercept = UQ.convert(0, from, to, { difference: difference });
      if (slope == null || intercept == null) return fail('unit-unreadable', { field: field, from: from, to: to });

      const out = [];
      let converted = 0, skipped = 0, empty = 0;
      const sample = [];
      const rows = ds.features();
      for (let i = 0; i < rows.length; i++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[i];
        const p = props(f);
        const raw = p[field];
        const merged = Object.assign({}, p);
        if (R.isEmpty(raw)) {
          empty++;
          /* An empty cell converts to an empty cell. Writing 0 would be the 「欠損を 0 で埋める」
             this project refuses everywhere else it measures. */
          delete merged[outName];
        } else {
          const v = R.asNumber(raw);
          /* ⚠ EVERY VALUE GOES THROUGH THE KERNEL, per cell. Multiplying by `slope` here would be a
             second implementation of the conversion that agrees with the first until the day an
             affine or a compound unit is asked of it. */
          const w = (v == null) ? null : UQ.convert(v, from, to, { difference: difference });
          if (w == null) {
            /* ⚠ A CELL THAT IS NOT A NUMBER IS COUNTED, NOT DROPPED IN SILENCE — the rule
               `aggregate`'s `_statSkipped` states. A column of 「12 km」 strings is a column this op
               did not convert, and the reader must be able to see how much of it. */
            skipped++;
            if (sample.length < 5) sample.push(String(raw));
            delete merged[outName];
          } else { converted++; merged[outName] = w; }
        }
        out.push({ type: 'Feature', geometry: f.geometry || null, properties: merged });
      }
      /* ⚠ 「0 件だった」 と 「1 件も数ではなかった」 は別の答え。An empty dataset converts to an
         empty dataset; a column of codes is not a quantity and saying so is the diagnosis. */
      if (!converted && skipped > 0 && !empty) {
        return fail('convert-nothing-numeric', { field: field, rows: rows.length, sample: sample });
      }
      return {
        ok: true, features: out,
        /* The output column's unit is stated BY THIS RUN — it is the only thing that knows, exactly
           as `compute` is for a column it invented (#R774). Under `replace` this also overrides the
           inherited statement about the same name, which is the point: the column is no longer in
           the unit its input stated. */
        units: { [outName]: to },
        /* ⚠ 換算前後の単位と使った変換は、レシピに残る（`resolved` — see run()). `stats` is read for
           this turn and written nowhere (#R763), so a manifest that held only `params` would say
           「something を km に直した」 and never what it had been in. */
        resolved: {
          field: field, outName: outName, replace: replace,
          from: from, fromStatedBy: (asked != null) ? 'caller' : 'column',
          to: to, conversion: verdict.verdict, difference: difference,
          transform: { kind: (intercept === 0) ? 'factor' : 'affine', slope: slope, intercept: intercept },
        },
        stats: {
          converted: converted, skipped: skipped, empty: empty, notNumeric: sample,
          from: from, to: to, conversion: verdict.verdict, difference: difference,
          slope: slope, intercept: intercept,
        },
      };
    }

    async function runFilter(ds, params, R, ctx) {
      const where = params.where;
      if (!Array.isArray(where) || !where.length) return fail('missing-param', { param: 'where' });
      for (const c of where) {
        if (!c || typeof c !== 'object') return fail('bad-param', { param: 'where' });
        if (CONDITION_OPS.indexOf(c.op) < 0) return fail('unknown-condition-op', { op: c.op == null ? null : String(c.op) });
        /* ⚠ A condition on a column that is not there is REFUSED, not treated as true and not
           treated as false. Both of those would ship a row count the reader cannot question. */
        if (!hasField(ds, c.field)) return fail('unknown-field', { field: c.field == null ? null : String(c.field) });
      }
      const out = [];
      /* ⚠ (#R764) この走査は行数とともに伸びる。ctx がある間だけ譲る——無ければ同期のまま走る
         （2 つの実装は作らない。js/gis-warp.js がこの形の正本）。 */
      const rows = ds.features();
      for (let i = 0; i < rows.length; i++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[i];
        const p = props(f);
        let keep = true;
        for (const c of where) { if (!evalCondition(R, p[c.field], c.op, c.value)) { keep = false; break; } }
        if (keep) out.push(f);
      }
      /* 0 rows is an ANSWER: 「該当なし」 is what the data says, and failing here would make the
         reader unable to chain the empty result or see the count. */
      return { ok: true, features: out };
    }

    async function runBuffer(ds, params, R, ctx) {
      const GG = geometry();
      const radius = R.asNumber(params.radiusKm);
      if (radius == null) return fail('missing-param', { param: 'radiusKm' });
      if (radius === 0) return fail('bad-param', { param: 'radiusKm', value: params.radiusKm });
      let steps = (params.steps == null) ? 64 : R.asNumber(params.steps);
      if (steps == null) return fail('bad-param', { param: 'steps', value: params.steps });
      steps = Math.round(steps);
      if (steps < STEPS_MIN || steps > STEPS_MAX) return fail('bad-param', { param: 'steps', value: steps, min: STEPS_MIN, max: STEPS_MAX });
      /* An inward buffer of something with no interior is not a small buffer, it is not a buffer.
         Refused by name, where the reader can still change the sign. */
      if (radius < 0 && ds.geometryType !== 'Polygon') return fail('inward-buffer-needs-area', { geometryType: ds.geometryType });

      const out = [];
      const led = makeGeoLedger();
      /* ⚠⚠ (#R764) THIS IS THE RUNNER THE OLD COMMENT WAS MOST WRONG ABOUT. A buffer unions a
         geodesic disk PER VERTEX, so its cost grows with the data more steeply than almost anything
         else here — and it was the one being described as finishing 「in one turn」. */
      const rows = ds.features();
      for (let i = 0; i < rows.length; i++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[i];
        const g = f && f.geometry;
        if (!g) continue;
        /* ⚠ ONE OUTPUT FEATURE PER INPUT FEATURE, not per position. #R729 emitted one per point of
           a MultiPoint because it could not union overlapping disks, and folding them would have
           double-counted the overlap in the area. It can union them now, so the MultiPoint's buffer
           is the one shape it should always have been — and `_bufferPart` is gone with the reason
           it existed. */
        const r = GG.attempt.bufferKm(g, radius, steps);
        if (!led.ok(r)) continue;
        const bg = r.geometry;
        if (!bg) continue;
        out.push({
          type: 'Feature',
          properties: withProps(props(f), { _bufferKm: radius, _bufferSteps: steps, _areaKm2: areaKm2(bg) }),
          geometry: bg,
        });
      }
      return withGeoStats({ ok: true, features: out }, led);
    }

    /* Every areal feature of a dataset as a window: what clip cuts with, and what the overlays and
       relate test against. ⚠ The id is the feature's own when it has one and its ORDINAL when it
       does not — the output says which window produced it, and an output that could not say would
       make the reader's first question about it unanswerable. */
    function windowsOf(ds) {
      const out = [];
      const feats = ds.features();
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        out.push({ id: (f && f.id != null) ? f.id : i, geometry: g, bbox: bboxOf(g), props: props(f) });
      }
      return out;
    }

    async function runClip(subject, clipper, ctx) {
      const GG = geometry();
      const windows = windowsOf(clipper);
      if (!windows.length) return fail('no-clip-polygons');
      /* (#R735) Same grid as aggregate and relate: the windows are indexed once and asked per
         subject feature. Clipping a country's roads by its 1,900 wards is the same shape of loop. */
      const cand = candidateSource(windows);

      /* ⚠ #R729 MEASURED EVERY WINDOW FIRST AND REFUSED THE CONCAVE ONES. Nothing about the
         window's shape is measured here any more, because nothing about it is a reason to refuse:
         js/gis-geometry.js takes holes, concavity, multipolygons and the seam. What it still cannot
         take is a ring that wraps the world, and it says so by answering null — which drops that one
         pair rather than refusing the whole run, because one unusable window among three thousand
         prefectures is not a reason to give the reader nothing. */
      const out = [];
      const led = makeGeoLedger();
      const subjects = subject.features();
      for (const f of subjects) {
        if (!(await ctx.tick(1, subjects.length))) return fail('cancelled', { done: ctx.done(), total: subjects.length });
        const g = f && f.geometry;
        if (!g) continue;
        const base = props(f);
        const gb = bboxOf(g);
        cand.each(gb, 0, (w) => {
          /* ⚠ ASKED ONCE, FOR ALL THREE BRANCHES (#R743). A window whose ring wraps the world has no
             simple ring in this plane, and the kernel says so — but hasArea() reports that as
             「面ではない」, so the line branch below would have clipped against ZERO rings (keeping
             nothing) and the point branch against a pointInGeometry that answers false for every
             position. Both would have been an answer about the reader's data. */
          const ar = GG.attempt.areal(w.geometry);
          if (!led.ok(ar)) return true;
          if (polygonsOf(g).length) {
            const r = GG.attempt.intersection(g, w.geometry);
            if (!led.ok(r)) return true;
            const cut = r.geometry;
            if (!cut) return true;
            out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id, _areaKm2: areaKm2(cut) }), geometry: cut });
            return true;
          }
          const lines = linesOf(g);
          if (lines.length) {
            const kept = [];
            for (const line of lines) for (const run of clipLineByPolygon(line.filter(isPos), w.geometry, GG)) kept.push(run);
            const gg = lineGeometry(kept);
            if (gg) out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
            return true;
          }
          const pts = pointsOf(g);
          if (pts.length) {
            const kept = pts.filter((pt) => GG.pointInGeometry(pt, w.geometry));
            if (!kept.length) return true;
            const gg = (kept.length === 1 && g.type === 'Point')
              ? { type: 'Point', coordinates: kept[0] }
              : { type: 'MultiPoint', coordinates: kept };
            out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
          }
          return true;
        });
      }
      return withGeoStats({ ok: true, features: out }, led);
    }

    /* ── clipping a LINE by an arbitrary polygon ───────────────────────────────────────────────
       The sweep-line takes areas, not lines, so this is the one piece the borrowed engine does not
       do. It is not Sutherland–Hodgman's convex walk either: each segment is cut at every crossing
       of every ring of the window, and each resulting piece is kept or dropped by asking whether its
       MIDPOINT is inside. That is the one test that stays right for a concave window and for holes,
       because a piece between two consecutive crossings is entirely in or entirely out. */
    function clipLineByPolygon(coords, win, GG) {
      const rings = GG.ringsOf(win);
      const runs = [];
      let cur = [];
      const flush = () => { if (cur.length >= 2) runs.push(cur); cur = []; };
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1], b = coords[i];
        const ts = [0, 1];
        for (const ring of rings) {
          for (let j = 1; j < ring.length; j++) {
            const t = segmentHit(a, b, ring[j - 1], ring[j]);
            if (t != null && t > 0 && t < 1) ts.push(t);
          }
        }
        ts.sort((x, y) => x - y);
        const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (let k = 1; k < ts.length; k++) {
          const t0 = ts[k - 1], t1 = ts[k];
          if (!(t1 > t0)) continue;
          if (GG.pointInGeometry(at((t0 + t1) / 2), win)) {
            if (!cur.length) cur.push(at(t0));
            cur.push(at(t1));
          } else flush();
        }
      }
      flush();
      return runs;
    }

    /* The parameter along a→b where it crosses c→d, or null when they do not cross. */
    function segmentHit(a, b, c, d) {
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < PARALLEL_EPS) return null;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
      const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return t;
    }

    /* ── the overlays: one runner, because they differ only in which verb is asked ─────────────── */

    async function runOverlay(kind, aDs, bDs, ctx) {
      const GG = geometry();
      const bWins = windowsOf(bDs);
      if (!bWins.length) return fail('no-overlay-polygons', { input: 1 });
      const cand = candidateSource(bWins);
      const out = [];
      const led = makeGeoLedger();
      const subjects = aDs.features();
      for (const f of subjects) {
        if (!(await ctx.tick(1, subjects.length))) return fail('cancelled', { done: ctx.done(), total: subjects.length });
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const base = props(f);
        const gb = bboxOf(g);

        if (kind === 'difference') {
          /* Taken against ALL of B at once. Subtracting one window at a time gives the same answer
             only if the windows do not overlap each other, and nothing in the registry says they do
             not — a second subtraction from an already-cut shape is not the same shape. */
          const near = [];
          cand.each(gb, 0, (w) => { near.push(w.geometry); return true; });
          let cut = g;
          if (near.length) {
            const m = GG.attempt.union(near);
            if (!led.ok(m)) continue;
            if (m.geometry) {
              const d = GG.attempt.difference(g, m.geometry);
              if (!led.ok(d)) continue;
              cut = d.geometry;
            }
          }
          if (!cut) continue;
          out.push({ type: 'Feature', properties: withProps(base, { _areaKm2: areaKm2(cut) }), geometry: cut });
          continue;
        }

        cand.each(gb, 0, (w) => {
          const r = GG.attempt.intersection(g, w.geometry);
          if (!led.ok(r)) return true;
          const res = r.geometry;
          if (!res) return true;
          /* ⚠ BOTH SIDES' COLUMNS SURVIVE, with A winning a collision, and the row says it came from
             a pair (`_overlayId`). Keeping only A would throw away the table the reader brought to
             the overlay; letting B win would rewrite the one they started from. */
          out.push({
            type: 'Feature',
            properties: withProps(withProps(w.props, base), { _overlayId: w.id, _areaKm2: areaKm2(res) }),
            geometry: res,
          });
          return true;
        });
      }
      return withGeoStats({ ok: true, features: out }, led);
    }

    /* ── union: every part of both inputs, exactly once (#R743) ─────────────────────────────────
       ⚠ UNION USED TO BE A BRANCH OF THE OVERLAY LOOP, AND THAT LOOP IS A LOOP OVER PAIRS. It asked
       the candidate source for the windows of B whose box meets this feature of A, and emitted one
       row per pair holding GG.union([a, b]). Two things follow, and both were shipped:

         · 離れている入力では答えが空になる。Two squares that do not touch produce no pair, so the
           loop emitted nothing at all and the op returned `{ ok: true }` over an empty dataset —
           a union in which neither operand appears. A feature of A that met no window of B was
           dropped for meeting nothing, and a window of B that met no feature of A was never read.
         · 重なっている入力では面積が壊れる。Each pair emitted the WHOLE of a plus the WHOLE of b,
           so n pairs carried the same land n times over and `_areaKm2` summed to several Earths.

       A union overlay has three kinds of part, and every point of either input belongs to exactly
       one of them: a ∩ b (carrying both tables), a − B (carrying A's), and b − A (carrying B's).
       Disjoint inputs are then not a special case at all — they are the run where the first kind is
       empty — which is what 「事例ではなく、その事例を生んだ構造を直す」 means here. `_overlaySide`
       says which kind a row is, because a table whose rows come from two different files and do not
       say so is not readable, and the reader cannot recover it from the columns (a row of b − A has
       A's columns absent, which is also what a null cell looks like). */
    async function runUnion(aDs, bDs, ctx) {
      const GG = geometry();
      const aWins = windowsOf(aDs);
      if (!aWins.length) return fail('no-overlay-polygons', { input: 0 });
      const bWins = windowsOf(bDs);
      if (!bWins.length) return fail('no-overlay-polygons', { input: 1 });

      const bCand = candidateSource(bWins);
      const aCand = candidateSource(aWins);
      const total = aWins.length + bWins.length;
      const out = [];
      const led = makeGeoLedger();

      /* ⚠ THE REMAINDER IS TAKEN AGAINST THE UNION OF THE NEIGHBOURS, not one at a time, for the
         reason the difference branch above gives: B's own windows may overlap each other, and
         subtracting them in turn cuts an already-cut shape. */
      const rest = (g, near) => {
        if (!near.length) return { ok: true, geometry: g };
        const m = GG.attempt.union(near);
        if (!m.ok) return m;
        if (!m.geometry) return { ok: true, geometry: g };
        return GG.attempt.difference(g, m.geometry);
      };

      for (const a of aWins) {
        if (!(await ctx.tick(1, total))) return fail('cancelled', { done: ctx.done(), total: total });
        const near = [];
        bCand.each(a.bbox, 0, (w) => { near.push(w); return true; });
        for (const w of near) {
          const r = GG.attempt.intersection(a.geometry, w.geometry);
          if (!led.ok(r)) continue;
          if (!r.geometry) continue;
          out.push({
            type: 'Feature',
            properties: withProps(withProps(w.props, a.props), { _overlayId: w.id, _overlaySide: 'both', _areaKm2: areaKm2(r.geometry) }),
            geometry: r.geometry,
          });
        }
        const only = rest(a.geometry, near.map((w) => w.geometry));
        if (!led.ok(only)) continue;
        if (only.geometry) {
          out.push({
            type: 'Feature',
            properties: withProps(a.props, { _overlaySide: 'a', _areaKm2: areaKm2(only.geometry) }),
            geometry: only.geometry,
          });
        }
      }

      for (const b of bWins) {
        if (!(await ctx.tick(1, total))) return fail('cancelled', { done: ctx.done(), total: total });
        const near = [];
        aCand.each(b.bbox, 0, (w) => { near.push(w.geometry); return true; });
        const only = rest(b.geometry, near);
        if (!led.ok(only)) continue;
        if (only.geometry) {
          out.push({
            type: 'Feature',
            properties: withProps(b.props, { _overlaySide: 'b', _areaKm2: areaKm2(only.geometry) }),
            geometry: only.geometry,
          });
        }
      }

      return withGeoStats({ ok: true, features: out }, led);
    }

    async function runDissolve(ds, params, R, ctx) {
      const GG = geometry();
      const by = (params.by == null || String(params.by).trim() === '') ? null : String(params.by);
      if (by && !hasField(ds, by)) return fail('unknown-field', { field: by });
      /* Map keeps insertion order, so the groups come out in the order they first appear in the
         reader's own table rather than in some order this file invented. */
      const groups = new Map();
      for (const f of ds.features()) {
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const key = by ? String(props(f)[by]) : '';
        if (!groups.has(key)) groups.set(key, { geoms: [], n: 0, first: props(f) });
        const grp = groups.get(key);
        grp.geoms.push(g);
        grp.n++;
      }
      if (!groups.size) return fail('no-features', { input: 0 });
      const out = [];
      const led = makeGeoLedger();
      /* (#R764) 群ごとの union が費用の本体。件数は群の数であって地物の数ではない。 */
      const grps = Array.from(groups.values());
      for (let gi = 0; gi < grps.length; gi++) {
        if (ctx && !(await ctx.tick(1, grps.length))) return fail('cancelled', { done: ctx.done(), total: grps.length });
        const grp = grps[gi];
        const r = GG.attempt.union(grp.geoms);
        if (!led.ok(r)) continue;
        const merged = r.geometry;
        if (!merged) continue;
        /* ⚠ ONLY THE GROUPING COLUMN SURVIVES, plus how many members went in. The other columns of
           the members disagree with one another by construction — that is what a group is — and
           carrying the first member's values would attach one municipality's population to the
           merged prefecture and print it as the prefecture's. */
        const extra = { _dissolvedFrom: grp.n, _areaKm2: areaKm2(merged) };
        if (by) extra[by] = grp.first[by];
        out.push({ type: 'Feature', properties: extra, geometry: merged });
      }
      return withGeoStats({ ok: true, features: out }, led);
    }

    /* ── relate: the spatial WHERE ────────────────────────────────────────────────────────────── */

    /* 0 or the measured distance when the relation holds, null when it does not — so the caller
       gets the verdict and the number from one call. */
    /* ⚠ THE VERDICT AND THE FAILURE ARE NO LONGER THE SAME null (#R743). Every arm of this used to
       answer null both for 「その関係にない」 and for 「答えられなかった」, and the caller read both
       as 「この行は残さない」 — so a throwing clipper silently made a spatial WHERE stricter. The
       distance arm was the plainest: 「測れなかった」 became 「500 m より遠い」. */
    function relateOne(GG, g, w, predicate, maxKm) {
      if (predicate === 'intersects') { const r = GG.attempt.intersects(g, w); return r.ok ? { ok: true, d: r.value ? 0 : null } : r; }
      if (predicate === 'within') { const r = GG.attempt.within(g, w); return r.ok ? { ok: true, d: r.value ? 0 : null } : r; }
      if (predicate === 'contains') { const r = GG.attempt.contains(g, w); return r.ok ? { ok: true, d: r.value ? 0 : null } : r; }
      if (predicate === 'nearer-than') {
        const r = GG.attempt.distanceKm(g, w);
        /* ⚠ 「比べる部分が無かった」 IS NOT A FAILURE TO MEASURE THE PAIR — an empty geometry is
           simply not within maxKm of anything, and refusing the whole run over one would make a
           single empty row poison a dataset. */
        if (!r.ok) return (r.why === 'no-comparable-parts') ? { ok: true, d: null } : r;
        return { ok: true, d: (r.value != null && r.value <= maxKm) ? r.value : null };
      }
      return { ok: false, why: 'unknown-predicate', detail: { predicate: predicate } };
    }

    async function runRelate(aDs, bDs, params, R, ctx) {
      const GG = geometry();
      const predicate = (params.predicate == null) ? 'intersects' : String(params.predicate);
      if (RELATE_PREDICATES.indexOf(predicate) < 0) return fail('bad-param', { param: 'predicate', value: predicate, values: RELATE_PREDICATES });
      let maxKm = null;
      if (predicate === 'nearer-than') {
        maxKm = R.asNumber(params.maxKm);
        if (maxKm == null) return fail('missing-param', { param: 'maxKm' });
        if (!(maxKm >= 0)) return fail('bad-param', { param: 'maxKm', value: params.maxKm });
      }
      const others = [];
      for (const f of bDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        others.push({ geometry: g, bbox: bboxOf(g) });
      }
      if (!others.length) return fail('no-features', { input: 1 });

      /* ⚠ THE DISTANCE IS HANDED ON AS A DISTANCE (#R743). It used to be converted to degrees here
         and the degrees given to a box test that applied them to both axes; padBoxKm carries the
         measurement that made that an inward error at every latitude but the equator. */
      const pad = (predicate === 'nearer-than') ? maxKm : 0;

      /* ⚠ THE INDEX IS BUILT ON THE OTHER SIDE, ONCE — one grid for the whole run, queried per
         feature of input 0, which is the direction the cost runs in. */
      const cand = candidateSource(others);
      const subjects = aDs.features();
      const out = [];
      const led = makeGeoLedger();
      for (const f of subjects) {
        if (!(await ctx.tick(1, subjects.length))) return fail('cancelled', { done: ctx.done(), total: subjects.length });
        const g = f && f.geometry;
        if (!g) continue;
        const gb = bboxOf(g);
        let best = null, hit = false;

        if (predicate === 'disjoint') {
          /* ⚠ disjoint CANNOT USE THE PREFILTER AS A REJECTION. The pairs whose boxes miss are
             exactly the pairs it is true for, so skipping them would skip the answer. It is the one
             predicate that has to look at every other feature, and a box that misses is still a
             proof that those two do not touch — so the box is used the other way round, as an
             acceptance. */
          hit = true;
          let failed = false;
          cand.each(gb, 0, (o) => {
            const r = GG.attempt.intersects(g, o.geometry);
            /* ⚠ disjoint IS THE PREDICATE A FAILURE LOOKS MOST LIKE. `!intersects` answered false on
               a throwing clipper, which this loop read as 「触れていない」 — so the one arm that
               asserts a NEGATIVE about every other feature was the one that asserted it from an
               error. A pair it could not measure means this row's verdict is unknown, not true. */
            if (!led.ok(r)) { failed = true; hit = false; return false; }
            if (!r.value) return true;
            hit = false;
            return false;
          });
          if (failed) continue;
        } else {
          cand.each(gb, pad, (o) => {
            const r = relateOne(GG, g, o.geometry, predicate, maxKm);
            if (!led.ok(r)) return true;
            const d = r.d;
            if (d == null) return true;
            hit = true;
            if (best == null || d < best) best = d;
            /* Only the nearest matters for a distance; for a yes/no the first yes is the answer. */
            return (predicate === 'nearer-than');
          });
        }

        if (!hit) continue;
        /* The measurement is kept, not just the verdict: 500 m 以内 and 「そのうち何 m か」 are the
           same query, and throwing the number away would make the second one a second pass over
           the same two datasets. */
        if (predicate === 'nearer-than' && best != null) {
          out.push({ type: 'Feature', properties: withProps(props(f), { _distanceKm: best }), geometry: g });
        } else out.push(f);
      }
      return withGeoStats({ ok: true, features: out }, led);
    }

    async function runAggregate(polyDs, memberDs, params, R, ctx) {
      const GG = geometry();
      const stat = (params.stat == null) ? 'count' : String(params.stat);
      const allowed = DECL.aggregate.params[0].values;
      if (allowed.indexOf(stat) < 0) return fail('bad-param', { param: 'stat', value: stat, values: allowed });
      const field = (params.field == null) ? null : String(params.field);
      if (stat !== 'count') {
        if (!field) return fail('missing-param', { param: 'field' });
        if (!hasField(memberDs, field)) return fail('unknown-field', { field: field });
      }
      /* (#R783) 「この量をこの方法で集計してよいか」 — asked of js/gis-units.js, never decided here.
         See aggregationVerdict for what each verdict does and for why an undeclared quantity leaves
         this run bit-for-bit what it was. */
      const qs = quantitySpecOf(params.quantity);
      if (!qs.ok) return qs;
      const agg = aggregationVerdict(qs.spec, stat, 'space');
      let weight = null;
      if (agg.verdict === 'refused') {
        return fail('aggregation-refused', { stat: stat, why: agg.why || null, remedy: agg.remedy || null, quantity: agg.quantity || null });
      }
      /* ⚠ A WEIGHT COMES BACK ON 'allowed' TOO — `areaWeightedMean` is allowed WITH weight 'area',
         and that is the rule that produced the number, so it travels into the answer and the recipe
         exactly as the refused one does. */
      if (agg.verdict === 'allowed') weight = agg.weight || null;
      if (agg.verdict === 'needs-weight') {
        weight = agg.weight || null;
        /* ⚠ THE WEIGHT THIS OP HAS IS AREA, AND ONLY THROUGH THE STAT THAT SAYS SO. Quietly turning
           a `mean` into an area-weighted one would change a number under a name the reader chose;
           `areaWeightedMean` is the door, and the refusal names it. A `denominator` weight is a
           column nobody has named, so it is the reader's to supply and not this op's to invent. */
        return fail('aggregation-needs-weight', { stat: stat, weight: weight, why: agg.why || null, remedy: agg.remedy || null });
      }
      const outName = (params.outName != null && String(params.outName).trim() !== '')
        ? String(params.outName).trim()
        : (stat === 'count' ? 'count' : stat + '_' + field);
      /* Writing over a column the polygons already carry would destroy data the reader imported,
         and doing it silently would make the loss invisible until the next op read the wrong column. */
      if (hasField(polyDs, outName)) return fail('output-column-in-use', { name: outName });

      /* ⚠ ONE ROW PER MEMBER FEATURE, not per position (#R729 flattened a MultiPoint into its
         points, which counted a single record as several). A feature is one thing the reader
         counted, whatever shape it has. Read once with its box so a 50,000-row dataset is not
         walked through its geometry accessors again for every polygon. */
      const members = [];
      for (const f of memberDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        /* (#R783) 面積は、使う stat のときだけ測る。It is the member's OWN ground area and it does
           not depend on the zone, so it is measured once per member rather than once per pair. */
        members.push({
          geometry: g, bbox: bboxOf(g), raw: (field ? props(f)[field] : null),
          areaKm2: (stat === 'areaWeightedMean') ? areaKm2(g) : null,
        });
      }

      /* ⚠ THE PAIRS ARE NO LONGER ENUMERATED (#R735). This was 「面をループ × member をループ」, and
         the file's own note on boxesMeet said what that meant: the box test turns the constant down
         and leaves O(n·m). js/gis-index.js is asked once for the members and queried per polygon. */
      const cand = candidateSource(members);
      const zones = polyDs.features();
      const led = makeGeoLedger();
      const out = [];
      for (const f of zones) {
        if (!(await ctx.tick(1, zones.length))) return fail('cancelled', { done: ctx.done(), total: zones.length });
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const gb = bboxOf(g);
        let n = 0, skipped = 0, sum = 0, min = null, max = null;
        /* (#R783) Σ(value·km²) と Σkm²，`areaWeightedMean` のときだけ動く。 */
        let wsum = 0, wtot = 0, noWeight = 0;
        cand.each(gb, 0, (m) => {
          /* ⚠ 「この面に重なるもの」, asked of the one predicate. #R729 asked point-in-polygon, which
             is the same answer for a point and no answer at all for the roads and parcels a reader
             brings to a 区域別集計. A line that crosses the boundary counts for this polygon AND for
             its neighbour, which is what 「重なる」 means and is why `_areaKm2` is on the row: a
             reader dividing by area can see that the parts do not partition. */
          /* ⚠ A MEMBER THE GEOMETRY COULD NOT ANSWER ABOUT IS NOT A MEMBER OUTSIDE THE ZONE (#R743).
             This file already refuses to let a value it cannot read vanish (`_statSkipped`, below);
             a pair it cannot MEASURE was the one loss with no counter, and it lands straight in the
             number the reader reads as 「この区域の件数」. */
          const ir = GG.attempt.intersects(m.geometry, g);
          if (!led.ok(ir)) return true;
          if (!ir.value) return true;
          n++;
          if (stat === 'count') return true;
          const v = R.asNumber(m.raw);
          /* ⚠ A member inside the polygon whose value cannot be a number is COUNTED AS SKIPPED, not
             dropped in silence. A mean over 12 of 400 is not the mean the reader asked for, and
             `_statSkipped` is the only thing that can tell them so. */
          if (v == null) { skipped++; return true; }
          sum += v;
          if (min == null || v < min) min = v;
          if (max == null || v > max) max = v;
          if (stat === 'areaWeightedMean') {
            const a = m.areaKm2;
            /* ⚠ A MEMBER WITH NO AREA CARRIES NO WEIGHT, AND IT IS COUNTED. A point has no ground,
               so weighting by it is not defined — and dropping it in silence would make the answer
               「面積で重み付けた平均」 over a set the reader was never told was smaller. */
            if (a == null || !(a > 0)) { noWeight++; return true; }
            wsum += v * a; wtot += a;
          }
          return true;
        });
        const used = n - skipped;
        let value;
        if (stat === 'count') value = n;
        else if (stat === 'sum') value = used ? sum : null;
        else if (stat === 'mean') value = used ? sum / used : null;
        else if (stat === 'areaWeightedMean') value = (wtot > 0) ? (wsum / wtot) : null;
        else if (stat === 'min') value = min;
        else value = max;
        const extra = { _areaKm2: areaKm2(g) };
        extra[outName] = value;
        if (stat !== 'count') extra._statSkipped = skipped;
        if (stat === 'areaWeightedMean') {
          /* ⚠ 使った重みは行に載る。The row is what gets joined, exported and compared months later
             — the argument `_boundary` makes in runZonal — and a weighted mean whose weight total is
             not beside it cannot be checked. */
          extra._weightKm2 = wtot;
          extra._statNoWeight = noWeight;
        }
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      /* (#R783) 実行した規則は答えとレシピの両方に残る。⚠ `resolved` is written ONLY when there was
         something to say, so an existing call registers the record it has always registered. */
      const rule = aggregationRecord(agg, qs.spec, weight);
      const res = withGeoStats({ ok: true, features: out }, led, rule ? { aggregation: rule } : null);
      if (res.ok && rule && (qs.spec != null || agg.verdict !== 'undeclared')) res.resolved = { aggregation: rule };
      return res;
    }

    /* ── the grid runners (#R735) ───────────────────────────────────────────────────────────────
       ⚠ NONE OF THE ARITHMETIC IS HERE. js/gis-raster.js owns 「格子とは何か」 — where a pixel is,
       what it is worth in km², what a void does to a mean — exactly as js/gis-geometry.js owns shapes.
       What these functions do is the part that is this file's: resolve the parameters a reader chose,
       decide which column the answer is written into, and refuse rather than write over data. */

    /* Which band the reader picked, by the NAME the registry publishes as the grid's column (see
       js/gis-datasets.js addRaster). A name that is not a band is refused with the list, because
       「そのバンドは無い」 with no list leaves the reader guessing. */
    function bandIndexOf(ds, name) {
      const bands = Array.isArray(ds.bands) ? ds.bands : [];
      if (name == null || String(name).trim() === '') return { ok: true, index: 0 };
      const want = String(name);
      for (let i = 0; i < bands.length; i++) if (String(bands[i].name) === want) return { ok: true, index: i };
      return { ok: false, res: fail('unknown-band', { band: want, bands: bands.map((b) => String(b.name)) }) };
    }

    async function runSample(ptDs, rasDs, params, R, ctx) {
      const RK = rasterKernel();
      const b = bandIndexOf(rasDs, params.band);
      if (!b.ok) return b.res;
      const method = (params.method == null || String(params.method) === '') ? 'nearest' : String(params.method);
      /* ⚠ (#R752) ASKED OF THE KERNEL, not of a copy kept here. run() has already refused this step
         if the raster kernel is absent (`needsRaster`), so a null answer at this point means the
         kernel is mounted and cannot say — which is a refusal in its own right rather than a reason
         to accept whatever was typed. */
      const allowed = paramValues(DECL.sample, 'method');
      if (!allowed) return fail('raster-unavailable', { param: 'method' });
      if (allowed.indexOf(method) < 0) return fail('bad-param', { param: 'method', value: method, values: allowed });
      const band = (rasDs.bands[b.index] || {});
      const outName = (params.outName != null && String(params.outName).trim() !== '') ? String(params.outName).trim() : String(band.name || 'value');
      if (hasField(ptDs, outName)) return fail('output-column-in-use', { name: outName });

      const pts = ptDs.features();
      const out = [];
      let read = 0, outside = 0, voids = 0, partial = 0, skipped = 0;
      for (const f of pts) {
        if (!(await ctx.tick(1, pts.length))) return fail('cancelled', { done: ctx.done(), total: pts.length });
        const g = f && f.geometry;
        const c = g && g.coordinates;
        /* ⚠ A MultiPoint IS ONE ROW WITH SEVERAL POSITIONS, and `accepts:['Point']` folds Multi* into
           its singular — so one arrives here legitimately and there is no single value to write for it.
           It is marked and counted rather than passed through bare: a row that is missing the column
           everything else has would read as 「格子に穴があった」, which is a different claim. */
        if (!isPos(c)) {
          out.push({ type: 'Feature', properties: withProps(props(f), { _sampleSkipped: true }), geometry: g });
          skipped++;
          continue;
        }
        const r = RK.sample(rasDs, b.index, c[0], c[1], { method: method });
        const extra = {};
        /* ⚠ THREE DIFFERENT ANSWERS, THREE DIFFERENT COLUMNS' WORTH OF TRUTH — and they are not the
           same claim. `null` with `_sampleOutside` means the point is not on this grid at all;
           `null` with nothing means the grid covers it and holds no value there; a number means a
           reading. Collapsing all three to `null` is how a 「データが無い」 becomes indistinguishable
           from 「範囲外を訊いた」, and the second one is a mistake the reader can fix. */
        if (!r || !r.ok) { extra[outName] = null; extra._sampleOutside = true; outside++; }
        else if (r.value == null) { extra[outName] = null; voids++; }
        else { extra[outName] = r.value; read++; if (r.partial) { extra._samplePartial = true; partial++; } }
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      return { ok: true, features: out, stats: { read: read, outside: outside, nodata: voids, partial: partial, skipped: skipped } };
    }

    async function runZonal(polyDs, rasDs, params, R, ctx) {
      const RK = rasterKernel();
      const b = bandIndexOf(rasDs, params.band);
      if (!b.ok) return b.res;
      const stat = (params.stat == null) ? 'mean' : String(params.stat);
      const allowed = DECL.zonal.params[1].values;
      if (allowed.indexOf(stat) < 0) return fail('bad-param', { param: 'stat', value: stat, values: allowed });
      /* ⚠ (#R764) VALIDATED HERE SO THE REFUSAL CARRIES THE VOCABULARY, and defaulted from the
         declaration rather than from a literal — a second spelling of 'center' in this file is a
         second place for the default to drift. The kernel refuses an unknown rule too; this exists so
         the reader is told by the op they called, with the set in hand. */
      const bDecl = DECL.zonal.params.find((p) => p.name === 'boundary');
      const boundary = (params.boundary == null || String(params.boundary) === '') ? bDecl.default : String(params.boundary);
      if (bDecl.values.indexOf(boundary) < 0) return fail('bad-param', { param: 'boundary', value: boundary, values: bDecl.values.slice() });
      const band = (rasDs.bands[b.index] || {});
      /* ══ (#R783) どの「合計」か、そしてその量についてそれは意味を持つか ══════════════════════════
         ⚠ THE RULE IS THE CALLER'S AND THE VERDICT IS THE KERNELS'. js/gis-raster.js owns the three
         readings of 「合計」 and asks js/gis-units.js whether the one named means anything about this
         quantity; this op's whole job is to carry the reader's choice down and the refusal back up.
         ⚠ A STATED `total` IS THE CALLER ANSWERING THE `sum` QUESTION, so the verdict about the plain
         sum is not the verdict about what they asked for — 「密度は足せない、面積を掛けてから足せ」 IS
         the remedy that makes `areaIntegral` the right arithmetic, and refusing on it here would
         refuse the very thing the kernel recommended. */
      const qs = quantitySpecOf(params.quantity);
      if (!qs.ok) return qs;
      const spec = (qs.spec != null) ? qs.spec : ((band.quantity != null) ? band.quantity : null);
      const total = (params.total == null || String(params.total) === '') ? null : String(params.total);
      if (total) {
        if (stat !== 'sum') return fail('bad-param', { param: 'total', value: total, detail: 'total-rule-is-a-reading-of-sum' });
        const rules = paramValues(DECL.zonal, 'total');
        /* null = the kernel does not publish the set; the rule then travels down and js/gis-raster.js
           refuses an unknown one by name with its own list. Refusing here on a list we could not ask
           for would be this file inventing the vocabulary. */
        if (rules && rules.indexOf(total) < 0) return fail('bad-param', { param: 'total', value: total, values: rules });
      }
      /* ⚠ THE METHOD ASKED ABOUT IS THE STAT, EXCEPT FOR `classes`: that is a table of areas per
         distinct value, which js/gis-units.js has a word for — a majority-style question about a
         nominal quantity — and calling it 'sum' would ask about arithmetic nobody performed. */
      const method = (stat === 'classes') ? 'majority' : stat;
      const agg = aggregationVerdict(spec, method, 'space');
      let weight = null;
      if (!total) {
        if (agg.verdict === 'refused') {
          return fail('aggregation-refused', { stat: stat, why: agg.why || null, remedy: agg.remedy || null, quantity: agg.quantity || null });
        }
        if (agg.verdict === 'needs-weight') {
          weight = agg.weight || null;
          /* ⚠ THIS ONE IS ALREADY SATISFIED, AND THAT IS A FACT ABOUT THE KERNEL RATHER THAN A
             CONCESSION: js/gis-raster.js zonal's `mean` is Σ(value·km²)/Σkm² over the pixels that
             carry a value — the area-weighted mean, since the round it was written. So a density's
             mean over a zone needs no new arithmetic here; what it needed was for somebody to SAY
             which mean it is, which the row and the recipe now do. */
          if (!(weight === 'area' && stat === 'mean')) {
            return fail('aggregation-needs-weight', { stat: stat, weight: weight, why: agg.why || null, remedy: agg.remedy || null });
          }
        }
      }
      const base = (params.outName != null && String(params.outName).trim() !== '')
        ? String(params.outName).trim()
        : (stat + '_' + String(band.name || 'band'));
      /* Same rule for every stat, `classes` included: writing over a column the polygons already
         carry destroys data the reader imported, and the map of class areas is no less destructive
         for being an object. */
      if (hasField(polyDs, base)) return fail('output-column-in-use', { name: base });

      const zones = polyDs.features();
      const out = [];
      for (const f of zones) {
        if (!(await ctx.tick(1, zones.length))) return fail('cancelled', { done: ctx.done(), total: zones.length });
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const z = await RK.zonal(rasDs, b.index, g, {
          classes: stat === 'classes', ctx: ctx, boundary: boundary,
          /* (#R783) 呼び手が述べた量と、述べた「合計」の読み方。Both are optional and the kernel
             answers exactly as before when neither is given. */
          quantity: qs.spec, total: total,
          /* (#R764) 「この多角形は何 km² か」 is this file's rule, and the kernel is handed it rather
             than growing a second one. See js/gis-raster.js coverOf. */
          areaOf: areaKm2,
        });
        /* ⚠ A ZONE THE KERNEL REFUSED IS NOT A ZONE WITH NO DATA. A ring that wraps the world, a
           degenerate polygon, a grid it could not read: each of those is a reason, and writing `null`
           into the column for it would put 「測れなかった」 and 「そこには何も無い」 in the same cell.
           The refusal stops the whole step, because a table where some rows silently mean something
           else is worse than a step the reader has to fix. */
        if (!z || !z.ok) return z || fail('zonal-failed');
        /* ⚠ (#R764) `_boundary` RIDES ON EVERY ROW, not only on the run's stats. The row is what gets
           joined, exported and compared months later, and a column of areas whose boundary rule lives
           only in a stats line the reader saw once is a number nobody can check. */
        const extra = { _areaKm2: areaKm2(g), _gridAreaKm2: z.areaKm2, _valueAreaKm2: z.valueAreaKm2, _pixels: z.count, _pixelsNodata: z.nodataCount, _boundary: z.boundary || boundary };
        if (stat === 'classes') {
          /* One column per distinct value is not a table shape a reader can join to; the map from
             value to km² is carried whole, under a name that says what it is. */
          extra[base] = z.classAreasKm2 || null;
        } else if (total) {
          /* ⚠ THE KERNEL'S VERDICT ABOUT THE RULE IS THE ANSWER. `value` is null whenever the
             verdict is not 'allowed', and writing that null into a column for every row would be a
             complete-looking table of nothing — so the step is refused with what DOES fit this
             quantity, which is a refusal the reader can act on. */
          const t = z.total || null;
          if (!t || t.verdict !== 'allowed') {
            return fail('total-rule-refused', {
              total: total, verdict: t ? t.verdict : null, why: t ? (t.why || null) : 'total-missing',
              fits: t ? (t.fits || null) : null, units: t ? (t.units || null) : null,
            });
          }
          extra[base] = t.value;
          /* 規則も、量を述べたのが誰かも、行に載る。 */
          extra._totalRule = total;
          extra._totalTimesAreaKm2 = t.timesAreaKm2 === true;
          if (t.quantityFrom != null) extra._quantityFrom = t.quantityFrom;
        } else if (stat === 'count') extra[base] = z.count;
        else if (stat === 'sum') extra[base] = z.sum;
        else if (stat === 'mean') extra[base] = z.mean;
        else if (stat === 'min') extra[base] = z.min;
        else extra[base] = z.max;
        if (stat === 'sum' && !total) extra._sumTimesAreaKm2 = z.sumTimesAreaKm2;
        /* (#R783) 面積重み付けの平均であることを、その平均の隣で述べる。⚠ ONLY WHEN THE QUANTITY
           WAS DECLARED: the arithmetic is the same one zonal has always done, so a caller who
           declared nothing must not suddenly find a new column in their table. */
        if (weight === 'area') extra._meanWeight = 'area';
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      const rule = aggregationRecord(agg, qs.spec, weight);
      const stats = { aggregation: rule };
      if (total) stats.total = total;
      const res = { ok: true, features: out, stats: stats };
      /* 実行した規則はレシピにも残る（run() の `resolved`）——ただし述べることがあったときだけ。 */
      if (total || qs.spec != null || (rule && rule.verdict !== 'undeclared')) {
        res.resolved = total ? { aggregation: rule, total: total } : { aggregation: rule };
      }
      return res;
    }

    async function runRasterMask(rasDs, params, R, ctx) {
      const RK = rasterKernel();
      const b = bandIndexOf(rasDs, params.band);
      if (!b.ok) return b.res;
      const op = String(params.op == null ? '' : params.op);
      const allowed = DECL.rasterMask.params[1].values;
      if (allowed.indexOf(op) < 0) return fail('bad-param', { param: 'op', value: op, values: allowed });
      if (params.value == null || params.value === '') return fail('missing-param', { param: 'value' });
      /* `between` and `in` carry a list, exactly as the filter's conditions do. A reader typing
         「10,20」 into one text box is the shape the panel produces for those two, so it is read here
         rather than being refused for not already being an array. */
      let value = params.value;
      if (op === 'between' || op === 'in') {
        if (!Array.isArray(value)) value = String(value).split(',').map((s) => s.trim()).filter((s) => s !== '');
        value = value.map((v) => R.asNumber(v));
        if (value.some((v) => v == null)) return fail('bad-param', { param: 'value', value: params.value });
        if (op === 'between' && value.length !== 2) return fail('bad-param', { param: 'value', value: params.value });
      } else {
        const n = R.asNumber(value);
        if (n == null) return fail('bad-param', { param: 'value', value: params.value });
        value = n;
      }
      /* WARNING (#R756) ctx IS THE CANCEL PATH, AND IT WAS NOT BEING HANDED OVER. js/gis-warp.js has
         had a per-row 'may I continue' since #R749 and js/gis-raster.js has one per slice since
         #R756, and NOTHING IN THIS FILE PASSED `ctx`, so both were unreachable code that read as a
         working cancel. A grid large enough to be worth cancelling was exactly the one that could
         not be. The kernels stay synchronous when `ctx` is absent, so a caller with no cancel path
         is not made to await -- the shape that would have been two implementations of one walk. */
      const r = await RK.mask(rasDs, b.index, { op: op, value: value }, { ctx: ctx });
      if (!r || !r.ok) return r || fail('mask-failed');
      return { ok: true, raster: r.raster, stats: { kept: r.kept, dropped: r.dropped, nodata: r.nodataCount } };
    }

    /* ── resample: where `grid-mismatch` has been pointing since #R749 (#R752) ─────────────────── */

    async function runResample(aDs, bDs, params, ctx) {
      const WK = warpKernel();
      const method = String(params.method == null ? '' : params.method);
      /* ⚠ NO DEFAULT, and the refusal comes from the kernel that owns the set. js/gis-warp.js refuses
         an unstated method itself (`resample-method-not-stated`) for the reason it states: a silently
         chosen interpolation is a composite nobody named. This check exists so the reader is told
         「述べていない」 by the op they called, with the vocabulary in hand. */
      if (!method) {
        const vals = paramValues(DECL.resample, 'method');
        return fail('missing-param', vals ? { param: 'method', values: vals } : { param: 'method' });
      }

      let target;
      const rule = (params.rule == null || String(params.rule) === '') ? null : String(params.rule);
      if (rule) {
        /* The COMMON lattice. Which grid's resolution won is in `from`, so the answer has an author. */
        const al = WK.align(aDs, bDs, { rule: rule });
        if (!al || !al.ok) return al || fail('align-failed');
        target = al.target;
      } else {
        /* ⚠ THE PLAIN READING OF TWO INPUTS: put a onto b. `align(b, b, …)` is not used here even
           though it would give the same lattice — b's grid IS the answer, and asking align for it
           would make an intersection (align clips to where the two overlap) stand in for a statement
           the reader already made by choosing b. */
        const g = bDs.grid || {};
        target = { west: g.west, north: g.north, pixelLng: g.pixelLng, pixelLat: g.pixelLat, width: bDs.width, height: bDs.height };
      }

      /* WARNING (#R756) ctx IS THE CANCEL PATH, AND IT WAS NOT BEING HANDED OVER. js/gis-warp.js has
         had a per-row 'may I continue' since #R749 and js/gis-raster.js has one per slice since
         #R756, and NOTHING IN THIS FILE PASSED `ctx`, so both were unreachable code that read as a
         working cancel. A grid large enough to be worth cancelling was exactly the one that could
         not be. The kernels stay synchronous when `ctx` is absent, so a caller with no cancel path
         is not made to await -- the shape that would have been two implementations of one walk. */
      const r = await WK.resample(aDs, target, {
        method: method,
        ctx: ctx,
        signal: (ctx && ctx.signal) || null,
        onProgress: (ctx && ctx.onProgress) || null,
      });
      if (!r || !r.ok) return r || fail('resample-failed');
      /* ⚠ (#R763) b LENT ITS LATTICE AND NOTHING ELSE. Said here because this is where it was decided
         — `target` above is built out of b's grid, and every value in the answer came from a. Without
         this the record claims to be about a span of time that no pixel in it is from. */
      return { ok: true, raster: r.grid, stats: r.report, shapeOnly: [1] };
    }

    /* ── rasterCalc: one expression kernel, asked about a pixel instead of a row (#R752) ───────── */

    async function runRasterCalc(aDs, bDs, params, R, ctx) {
      const RK = rasterKernel(), EK = exprKernel();
      const src = (params.expr == null) ? '' : String(params.expr);
      if (!src.trim()) return fail('missing-param', { param: 'expr' });
      const ba = bandIndexOf(aDs, params.bandA); if (!ba.ok) return ba.res;
      const bb = bandIndexOf(bDs, params.bandB); if (!bb.ok) return bb.res;

      /* ⚠ THE SAME KERNEL AS `compute`, AND THE SAME NUMBER RULE. js/gis-expr.js refuses to work
         without one (`expr-no-number-rule`) because 「この文字列は数か」 is js/gis-datasets.js's
         decision, not the parser's — and a grid's values are already numbers, so the rule is never
         exercised here. Passing it anyway is what keeps ONE expression language in the app instead
         of a second dialect that happens to agree today. */
      const c = EK.compile(src, R);
      if (!c || !c.ok) return fail(c ? c.why : 'expr-failed', c ? c.detail : undefined);

      /* ⚠ (#R774) `a - b` OVER TWO BANDS IS THE SAME QUESTION `rasterDiff` ASKS, and it is asked in
         the same place — js/gis-units.js over js/gis-expr.js's AST, exactly as `compute` does over a
         row. ⚠ NOTHING IS CONVERTED HERE and that is deliberate: the arithmetic is the READER's, so
         a silent conversion inside their own expression would change a number they wrote. They are
         told which two spellings collided and convert explicitly. A band that states no unit, and
         `a / b` or `a * 0.1`, are untouched. */
      const UQ = unitKernel();
      let calcUnit = null;
      if (UQ && typeof UQ.unitOfExpr === 'function') {
        const parsedCalc = EK.parse(src);
        if (parsedCalc && parsedCalc.ok) {
          const bandUnit = (dsx, idx) => { const bd = (dsx.bands || [])[idx]; return bd && bd.unit != null ? bd.unit : null; };
          const uv = UQ.unitOfExpr(parsedCalc.ast, (n) => (String(n) === 'a' ? bandUnit(aDs, ba.index) : (String(n) === 'b' ? bandUnit(bDs, bb.index) : null)));
          if (!uv.ok) return fail(uv.why, uv.detail);
          calcUnit = uv.unit || null;
        }
      }

      /* ⚠ THE NAMES ARE `a` AND `b`, AND THE REFUSAL SAYS SO. An expression naming anything else is
         reaching for a column that a grid does not have — a pixel has two values, not a row of
         them — and telling the reader which two names exist is one corrected call instead of a
         search (the rule this layer applies to every other vocabulary). */
      const BOUND = ['a', 'b'];
      const unknown = (c.fields || []).filter((f) => BOUND.indexOf(String(f)) < 0);
      if (unknown.length) return fail('unknown-field', { fields: unknown, values: BOUND.slice() });

      const row = { a: null, b: null };
      let firstError = null;
      const fn = (x, y) => {
        row.a = x; row.b = y;
        const r = c.fn(row);
        if (r && r.error) { if (!firstError) firstError = r.error; return null; }
        const v = r ? r.value : null;
        /* ⚠ A BOOLEAN IS NOT A MEASUREMENT, but `a > b` is a question a reader will ask of two grids
           and a mask of 1/0 is the honest answer to it. null stays null: js/gis-expr.js propagates
           absence rather than calling it zero, and this band writes a void for it. */
        if (v === true) return 1;
        if (v === false) return 0;
        return (typeof v === 'number') ? v : null;
      };

      const band = (aDs.bands[ba.index] || {});
      const name = (params.outName != null && String(params.outName).trim() !== '') ? String(params.outName).trim() : src.trim();
      /* ⚠ NO UNIT IS INVENTED. `(a − b) / b` is a ratio and `a × 0.1` is whatever a was; the reader
         states it, or — (#R774) — js/gis-units.js derived it from the expression in the one case
         where it follows without a guess: every additive term stated the SAME unit, so the answer is
         in that unit. ⚠ THE READER'S `params.unit` STILL WINS: they are looking at the expression,
         and an op overruling a stated unit with a derived one would be this layer telling a reader
         what they meant. */
      const unit = (params.unit != null && String(params.unit).trim() !== '') ? String(params.unit).trim() : calcUnit;

      if (!(await ctx.tick(1, 1))) return fail('cancelled', { done: ctx.done(), total: 1 });
      const r = await RK.combine(aDs, bDs, ba.index, bb.index, fn, { name: name, unit: unit, nodata: band.nodata, ctx: ctx });
      if (!r || !r.ok) return r || fail('calc-failed');
      /* ⚠ AN EXPRESSION THAT BROKE ON EVERY PIXEL IS NOT AN EMPTY GRID, and the kernel counts those
         separately from voids for exactly this moment. Registering a grid of NaN under the reader's
         own expression would be the 「もっともらしいものを描かない」 rule broken in full. */
      if (r.failed > 0 && r.count === 0) return fail('expr-failed-every-pixel', { pixels: r.failed, error: firstError || r.failedError || null });
      return {
        ok: true, raster: r.raster,
        stats: { count: r.count, nodata: r.nodataCount, failed: r.failed, error: r.failedError || null },
      };
    }

    /* ── mosaic: two sheets, one sheet, and the overlap rule has an author (#R752) ─────────────── */

    async function runMosaic(aDs, bDs, params, ctx) {
      const RK = rasterKernel(), WK = warpKernel();
      const overlap = (params.overlap == null) ? '' : String(params.overlap);
      const ov = paramValues(DECL.mosaic, 'overlap');
      if (!ov) return fail('raster-unavailable', { param: 'overlap' });
      if (ov.indexOf(overlap) < 0) return fail(overlap ? 'bad-param' : 'missing-param', { param: 'overlap', value: overlap || undefined, values: ov });
      const method = (params.method == null) ? '' : String(params.method);
      const ms = paramValues(DECL.mosaic, 'method');
      if (!ms) return fail('raster-unavailable', { param: 'method' });
      if (ms.indexOf(method) < 0) return fail(method ? 'bad-param' : 'missing-param', { param: 'method', value: method || undefined, values: ms });
      const ba = bandIndexOf(aDs, params.band); if (!ba.ok) return ba.res;

      /* ⚠ THE UNION OF THE TWO EXTENTS, WHICH IS WHAT A MOSAIC IS. js/gis-warp.js's `align` answers
         the INTERSECTION — right for a difference, wrong here: aligning two adjacent tiles would
         produce the sliver they share and throw away the map. So the target lattice is built from
         a's pixel size (the reader chose the order) over the bounding box of both, and both inputs
         are resampled onto it with the method they named. */
      const g = aDs.grid;
      const boxOf = (d) => [d.grid.west, d.grid.north - d.grid.pixelLat * d.height, d.grid.west + d.grid.pixelLng * d.width, d.grid.north];
      const A = boxOf(aDs), B = boxOf(bDs);
      const west = Math.min(A[0], B[0]), south = Math.min(A[1], B[1]);
      const east = Math.max(A[2], B[2]), north = Math.max(A[3], B[3]);
      /* Snapped to a's own pixel edges, so mosaic(a, a) is a and nothing is resampled for a fraction
         of a pixel — the same argument `align` makes about its origin. */
      const wSteps = Math.ceil((g.west - west) / g.pixelLng - 1e-9);
      const nSteps = Math.ceil((north - g.north) / g.pixelLat - 1e-9);
      const tWest = g.west - wSteps * g.pixelLng;
      const tNorth = g.north + nSteps * g.pixelLat;
      const width = Math.round(Math.ceil((east - tWest) / g.pixelLng - 1e-9));
      const height = Math.round(Math.ceil((tNorth - south) / g.pixelLat - 1e-9));
      if (!(width > 0) || !(height > 0)) return fail('grids-disjoint', { a: A, b: B });
      const target = { west: tWest, north: tNorth, pixelLng: g.pixelLng, pixelLat: g.pixelLat, width: width, height: height };

      const opts = { method: method, ctx: ctx, signal: (ctx && ctx.signal) || null, onProgress: (ctx && ctx.onProgress) || null };
      const ra = await WK.resample(aDs, target, opts);
      if (!ra || !ra.ok) return ra || fail('resample-failed');
      const rb = await WK.resample(bDs, target, opts);
      if (!rb || !rb.ok) return rb || fail('resample-failed');

      const m = await RK.merge(ra.grid, rb.grid, ba.index, { overlap: overlap, ctx: ctx });
      if (!m || !m.ok) return m || fail('mosaic-failed');
      return {
        ok: true, raster: m.raster,
        stats: { count: m.count, nodata: m.nodataCount, overlapPixels: m.overlapCount, onlyA: m.onlyA, onlyB: m.onlyB, overlap: m.overlap },
      };
    }

    /* ── rasterize: features onto a lattice the reader stated (#R752) ──────────────────────────── */

    async function runRasterize(ds, params, R, ctx) {
      const RK = rasterKernel();
      const width = Math.round(Number(params.width));
      const height = Math.round(Number(params.height));
      if (!Number.isInteger(width) || width <= 0) return fail('bad-param', { param: 'width', value: params.width });
      if (!Number.isInteger(height) || height <= 0) return fail('bad-param', { param: 'height', value: params.height });
      const stat = (params.stat == null || String(params.stat) === '') ? 'first' : String(params.stat);
      const stats = DECL.rasterize.params[3].values;
      if (stats.indexOf(stat) < 0) return fail('bad-param', { param: 'stat', value: stat, values: stats });

      const field = (params.field == null || String(params.field).trim() === '') ? null : String(params.field).trim();
      if (field != null && !hasField(ds, field)) return fail('unknown-field', { field: field, fields: (ds.fields || []).map((f) => String(f.name)) });

      const fs = ds.features();
      /* ⚠ THE EXTENT IS THE DATA'S — that one IS derivable, and deriving it is not a guess. How
         FINELY to cut it is not, which is why width and height are required above. */
      let box;
      if (params.bbox != null && String(params.bbox).trim() !== '') {
        const parts = String(params.bbox).split(',').map((s) => Number(s.trim()));
        if (parts.length !== 4 || parts.some((v) => !isFinite(v))) return fail('bad-param', { param: 'bbox', value: params.bbox });
        box = { w: Math.min(parts[0], parts[2]), s: Math.min(parts[1], parts[3]), e: Math.max(parts[0], parts[2]), n: Math.max(parts[1], parts[3]) };
      } else {
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, seen = 0;
        for (const f of fs) {
          const bb = bboxOf((f && f.geometry) || null);
          if (!bb) continue;
          seen++;
          if (bb[0] < w) w = bb[0]; if (bb[1] < s) s = bb[1];
          if (bb[2] > e) e = bb[2]; if (bb[3] > n) n = bb[3];
        }
        /* ⚠ 「場所を持つ行が1つも無い」 IS NOT AN EMPTY GRID SOMEWHERE. A statistics table rasterised
           into a grid at 0,0 would be a picture of nothing, placed. */
        if (!seen) return fail('input-has-no-geometry', { id: ds.id });
        box = { w: w, s: s, e: e, n: n };
      }
      /* A single point, or a single row of points, has zero extent in one axis; a lattice of zero
         width is not a lattice, so it is widened by one pixel rather than refused — the reader asked
         for width × height cells and gets them. */
      const spanX = (box.e - box.w) || 1e-9, spanY = (box.n - box.s) || 1e-9;
      const pixelLng = spanX / width, pixelLat = spanY / height;
      const grid = { west: box.w, north: box.n, pixelLng: pixelLng, pixelLat: pixelLat, width: width, height: height };

      const n = width * height;
      let acc, cnt;
      try { acc = new Float64Array(n); cnt = new Float64Array(n); } catch (e) { return fail('raster-too-large', { cells: n }); }
      acc.fill(NaN);

      const put = (i, v) => {
        cnt[i] += 1;
        if (stat === 'count') { acc[i] = cnt[i]; return; }
        if (v == null) return;
        const cur = acc[i];
        if (cur !== cur) { acc[i] = (stat === 'mean') ? v : v; return; }   /* NaN test: first value wins the slot */
        if (stat === 'first') return;
        if (stat === 'min') { if (v < cur) acc[i] = v; return; }
        if (stat === 'max') { if (v > cur) acc[i] = v; return; }
        acc[i] = cur + v;                                                  /* sum and mean accumulate */
      };

      let burned = 0, skipped = 0;
      for (const f of fs) {
        if (!(await ctx.tick(1, fs.length))) return fail('cancelled', { done: ctx.done(), total: fs.length });
        const g = (f && f.geometry) || null;
        if (!g) { skipped++; continue; }
        let v = 1;
        if (field != null) {
          v = R.asNumber(props(f)[field]);
          /* ⚠ A ROW WHOSE VALUE IS NOT A NUMBER IS NOT BURNED AS ZERO. It is counted as skipped, and
             the answer says how many — the same rule `zonal` applies to a cell it cannot read. */
          if (v == null && stat !== 'count') { skipped++; continue; }
        }
        let hit = false;
        const emit = (cc, rr) => { put(rr * width + cc, v); hit = true; };
        if (!burnGeometry(g, grid, emit)) { skipped++; continue; }
        if (hit) burned++;
      }
      if (stat === 'mean') for (let i = 0; i < n; i++) if (cnt[i] > 0 && acc[i] === acc[i]) acc[i] /= cnt[i];

      const b = RK.build(grid, [{
        name: field != null ? field : (stat === 'count' ? 'count' : 'presence'),
        unit: field != null ? unitOfField(ds, field) : null,
        nodata: null,
      }], acc);
      if (!b || !b.ok) return b || fail('rasterize-failed');
      return { ok: true, raster: b.raster, stats: { burned: burned, skipped: skipped, cells: n, stat: stat } };
    }

    /* ── which cells a geometry burns (#R756) ─────────────────────────────────────────────────────
       ⚠ 「その画素はその形に触れているか」は次元ごとに別の問いである。面は内部を持つので画素の
       中心が決める（zonal が逆向きに使っているのと同じ規則で、そうでないと rasterize→zonal の
       往復が自分自身と食い違う）。点と線は内部を持たないので、中心がその上に乗ることは測度 0 で
       まず起きない——問いは「その画素の中にその点があるか」「その画素をその線が通るか」になる。
       ⚠ 1 つの述語に 3 つの次元を答えさせると、答えられない 2 つには `true` を返すしかなく、
       外接矩形がそのまま塗られる。#R756 実測: 16×16 の格子で、対角線 1 本が 256 セル・離れた
       2 点の MultiPoint が 256 セル（GDAL の既定はそれぞれ 16 セル・2 セル）。道路や河川を
       格子にすると、その川がどこにも無い場所まで川になっていた。
       返り値は「場所を持つ形だったか」——burn した数ではない（格子の外の形は 0 セルで正しい）。 */
    function burnGeometry(g, grid, emit) {
      if (!g || typeof g !== 'object') return false;
      const t = g.type;
      if (t === 'GeometryCollection') {
        let any = false;
        for (const s of (g.geometries || [])) if (burnGeometry(s, grid, emit)) any = true;
        return any;
      }
      if (t === 'Polygon' || t === 'MultiPolygon') return burnArea(g, grid, emit);
      if (t === 'Point') return burnPoint(g.coordinates, grid, emit);
      if (t === 'MultiPoint') {
        let any = false;
        for (const p of (g.coordinates || [])) if (burnPoint(p, grid, emit)) any = true;
        return any;
      }
      if (t === 'LineString') return burnLine(g.coordinates, grid, emit);
      if (t === 'MultiLineString') {
        let any = false;
        for (const l of (g.coordinates || [])) if (burnLine(l, grid, emit)) any = true;
        return any;
      }
      return false;
    }

    /* Areas: the pixel centre decides, walked over the rows and columns the feature's box can reach. */
    function burnArea(g, grid, emit) {
      const bb = bboxOf(g);
      if (!bb) return false;
      const c0 = Math.max(0, Math.floor((bb[0] - grid.west) / grid.pixelLng));
      const c1 = Math.min(grid.width - 1, Math.floor((bb[2] - grid.west) / grid.pixelLng));
      const r0 = Math.max(0, Math.floor((grid.north - bb[3]) / grid.pixelLat));
      const r1 = Math.min(grid.height - 1, Math.floor((grid.north - bb[1]) / grid.pixelLat));
      for (let rr = r0; rr <= r1; rr++) {
        const lat = grid.north - grid.pixelLat * (rr + 0.5);
        for (let cc = c0; cc <= c1; cc++) {
          const lng = grid.west + grid.pixelLng * (cc + 0.5);
          if (pointInPolygon([lng, lat], g)) emit(cc, rr);
        }
      }
      return true;
    }

    /* Continuous cell coordinates: cell (c, r) covers [c, c+1) × [r, r+1). ⚠ THE EXTENT DEFAULTS TO
       THE DATA'S OWN, so the easternmost and northernmost coordinates land exactly on the outer edge
       and floor() puts them one cell past the end. They belong to the last cell, not to nothing. */
    function cellX(lng, grid) {
      if (!isFinite(lng)) return null;
      const x = (lng - grid.west) / grid.pixelLng;
      if (x < 0 || x > grid.width) return null;
      return x;
    }
    function cellY(lat, grid) {
      if (!isFinite(lat)) return null;
      const y = (grid.north - lat) / grid.pixelLat;
      if (y < 0 || y > grid.height) return null;
      return y;
    }
    function clampCol(x, grid) { return Math.min(grid.width - 1, Math.max(0, Math.floor(x))); }
    function clampRow(y, grid) { return Math.min(grid.height - 1, Math.max(0, Math.floor(y))); }

    function burnPoint(p, grid, emit) {
      if (!Array.isArray(p) || p.length < 2) return false;
      const x = cellX(Number(p[0]), grid), y = cellY(Number(p[1]), grid);
      if (x == null || y == null) return true;              /* has a place; it is outside this lattice */
      emit(clampCol(x, grid), clampRow(y, grid));
      return true;
    }

    /* Lines: every cell the segment passes through, by the standard grid traversal (Amanatides–Woo).
       ⚠ SAMPLING ALONG THE SEGMENT IS NOT THE SAME THING — a step small enough never to skip a cell
       depends on the cell size, so it is a tolerance, and this is not a question that has one. */
    function burnLine(coords, grid, emit) {
      if (!Array.isArray(coords) || coords.length === 0) return false;
      let placed = false;
      for (let i = 0; i + 1 < coords.length; i++) {
        const a = coords[i], b = coords[i + 1];
        if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
        const x0 = cellX(Number(a[0]), grid), y0 = cellY(Number(a[1]), grid);
        const x1 = cellX(Number(b[0]), grid), y1 = cellY(Number(b[1]), grid);
        placed = true;
        /* ⚠ A SEGMENT WITH AN END OUTSIDE THE LATTICE STILL CROSSES IT. Clipping is the honest fix;
           until this layer has a clipper the traversal simply starts and ends at the clamped cells,
           which is exact whenever both ends are inside and conservative when one is not. */
        if (x0 == null || y0 == null || x1 == null || y1 == null) continue;
        walkCells(x0, y0, x1, y1, grid, emit);
      }
      if (coords.length === 1) return burnPoint(coords[0], grid, emit);
      return placed;
    }

    function walkCells(x0, y0, x1, y1, grid, emit) {
      let c = clampCol(x0, grid), r = clampRow(y0, grid);
      const cEnd = clampCol(x1, grid), rEnd = clampRow(y1, grid);
      emit(c, r);
      const dx = x1 - x0, dy = y1 - y0;
      const stepC = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      const stepR = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
      const dtC = stepC === 0 ? Infinity : 1 / Math.abs(dx);
      const dtR = stepR === 0 ? Infinity : 1 / Math.abs(dy);
      let tC = stepC === 0 ? Infinity : ((stepC > 0 ? (c + 1 - x0) : (x0 - c)) / Math.abs(dx));
      let tR = stepR === 0 ? Infinity : ((stepR > 0 ? (r + 1 - y0) : (y0 - r)) / Math.abs(dy));
      /* The traversal visits |Δc| + |Δr| cells after the first; the bound is a fact about the walk,
         not a tolerance — it exists so a non-finite coordinate cannot spin here forever. */
      const limit = Math.abs(cEnd - c) + Math.abs(rEnd - r) + 2;
      let n = 0;
      while ((c !== cEnd || r !== rEnd) && n++ < limit) {
        if (tC < tR) { c += stepC; tC += dtC; } else { r += stepR; tR += dtR; }
        if (c < 0 || r < 0 || c >= grid.width || r >= grid.height) break;
        emit(c, r);
      }
    }

    function unitOfField(ds, name) {
      const f = (ds.fields || []).find((x) => x && String(x.name) === String(name));
      return (f && f.unit != null) ? f.unit : null;
    }

    /* ── polygonize: the edges a classification really has (#R752) ─────────────────────────────── */

    async function runPolygonize(ds, params, ctx) {
      const RK = rasterKernel();
      const b = bandIndexOf(ds, params.band);
      if (!b.ok) return b.res;
      const r = await RK.polygonize(ds, b.index, {
        signal: (ctx && ctx.signal) || null,
        onProgress: (ctx && ctx.onProgress) || null,
      });
      if (!r || !r.ok) return r || fail('polygonize-failed');
      const band = (ds.bands[b.index] || {});
      const name = (params.outName != null && String(params.outName).trim() !== '') ? String(params.outName).trim() : String(band.name || 'value');
      const out = r.polygons.map((p) => {
        const pr = {};
        pr[name] = p.value;
        /* The pixel count of the region, so a reader can check this against the `zonal` of the same
           shape — two walks of one grid that must agree, and now can be compared. */
        pr._pixels = p.pixels;
        pr._holes = p.holes;
        return { type: 'Feature', properties: pr, geometry: { type: 'Polygon', coordinates: p.rings } };
      });
      return { ok: true, features: out, stats: { count: r.count, regions: r.regions, nodata: r.nodataCount } };
    }

    /* ── validity: a fact about a geometry, measured rather than assumed (#R752) ───────────────── */

    /* One prefix for the columns both ops write, so a reader who ran validate and then repair does
       not get two spellings of the same idea. ⚠ A NAMED PREFIX IS THE READER'S ANSWER TO A CLASH —
       the alternative, renaming silently, invents a column nobody knows about (the rule `join`
       already applies to its own collisions). */
    function validityPrefix(params) {
      const p = (params && params.prefix != null) ? String(params.prefix).trim() : '';
      return p === '' ? '_geom' : p;
    }

    async function runValidate(ds, params, ctx) {
      const GG = geometry();
      const px = validityPrefix(params);
      const fs = ds.features();
      const out = [];
      let invalid = 0, unmeasured = 0;
      for (const f of fs) {
        if (!(await ctx.tick(1, fs.length))) return fail('cancelled', { done: ctx.done(), total: fs.length });
        const g = (f && f.geometry) || null;
        const v = GG.validate(g);
        let extra;
        if (!v || !v.ok) {
          /* ⚠ 「幾何が無い」 IS NOT 「妥当である」. A statistics table travels through this op with
             every row saying so, rather than being marked clean. */
          unmeasured++;
          extra = {};
          extra[px + 'Valid'] = null;
          extra[px + 'Problems'] = null;
          extra[px + 'Unmeasured'] = String((v && v.why) || 'validate-failed');
        } else {
          const val = v.value;
          if (!val.valid) invalid++;
          extra = {};
          extra[px + 'Valid'] = !!val.valid;
          /* The codes, not a sentence — a column a reader can filter on, in one language or none.
             The positions stay in the kernel's answer; a column holding every vertex index of a
             60,000-point ring is not a column. */
          extra[px + 'Problems'] = (val.problems || []).map((p) => String(p.code)).join(' ') || null;
          if (val.truncated) extra[px + 'Truncated'] = true;
          if ((val.notes || []).length) extra[px + 'Notes'] = val.notes.map((n) => String(n.code)).join(' ');
        }
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      return { ok: true, features: out, stats: { invalid: invalid, unmeasured: unmeasured, total: fs.length } };
    }

    async function runRepair(ds, params, ctx) {
      const GG = geometry();
      const px = validityPrefix(params);
      const winding = (params.winding == null || String(params.winding) === '') ? 'rfc7946' : String(params.winding);
      const allowed = DECL.repair.params[0].values;
      if (allowed.indexOf(winding) < 0) return fail('bad-param', { param: 'winding', value: winding, values: allowed });

      const fs = ds.features();
      const out = [];
      let changed = 0, refused = 0, emptied = 0;
      for (const f of fs) {
        if (!(await ctx.tick(1, fs.length))) return fail('cancelled', { done: ctx.done(), total: fs.length });
        const g = (f && f.geometry) || null;
        const r = GG.repair(g, { winding: winding === 'keep' ? 'keep' : undefined });
        let extra = {}, geom = g;
        if (!r || !r.ok) {
          /* ⚠ A ROW THIS OP COULD NOT REPAIR KEEPS ITS GEOMETRY AND SAYS SO. Dropping it would make
             the answer smaller for a reason nothing recorded — the failure #R743 measured when a
             throwing sweep-line came back as an ordinary smaller result. */
          refused++;
          extra[px + 'Repaired'] = false;
          extra[px + 'Refused'] = String((r && r.why) || 'repair-failed');
        } else {
          const changes = r.changes || [];
          if (changes.length) changed++;
          if (r.geometry == null && g != null) emptied++;
          geom = r.geometry;
          extra[px + 'Repaired'] = changes.length > 0;
          extra[px + 'Changes'] = changes.map((c) => String(c.code)).join(' ') || null;
          /* ⚠ WHAT IS STILL WRONG AFTERWARDS. A repair that reports only success is a claim about
             data the reader can no longer inspect — the original is gone. */
          extra[px + 'Remaining'] = (r.remaining || []).map((p) => String(p.code)).join(' ') || null;
        }
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: geom });
      }
      return { ok: true, features: out, stats: { changed: changed, refused: refused, emptied: emptied, total: fs.length } };
    }

    /* ── (#R783) どの面なら、述べられた要求を満たせるのか ─────────────────────────────────────
       ⚠ THIS LAYER DOES NOT ENUMERATE SURFACES AND DOES NOT MEASURE THEM. Every name, every figure
       and every plane below comes out of js/gis-crs.js's own doors: surfaces() for the ground's
       declared accuracy, certify() for the sphere's measured envelope, suggest() for the planes it
       ranks over THIS data. A list assembled here would be the second opinion #R756 removed, and it
       would fall behind the day the kernel gains a fourth surface. */
    function surfacesMeeting(CK, input, what, tol) {
      const out = [];
      let list = null;
      try { list = CK.surfaces(); } catch (_) { list = null; }
      for (const s of (list || [])) {
        if (!s || !Array.isArray(s.measures) || s.measures.indexOf(what) < 0) continue;
        const call = (s.call && s.call[what]) || null;
        if (s.isGround) {
          const w = groundEnvelope(CK, what);
          if (w != null && w <= tol) out.push({ surface: s.name, spec: null, worst: w, call: call });
          continue;
        }
        if (!s.certifiable) continue;
        if (s.name === 'sphere') {
          const w = sphereEnvelope(CK, input, what);
          if (w != null && w <= tol) out.push({ surface: s.name, spec: null, worst: w, call: call });
          continue;
        }
        /* a plane has to be NAMED, so the kernel parameterises its own candidates from this data and
           says which of them stay inside the requirement — it ranks and does not choose */
        let ranked = null;
        try { ranked = CK.suggest(input, { purpose: (what === 'area') ? 'area' : 'distance', tolerance: tol }); } catch (_) { ranked = null; }
        for (const c of ((ranked && ranked.candidates) || [])) {
          if (c.within !== true || !c.worst) continue;
          out.push({ surface: s.name, spec: c.spec, code: c.code, worst: (what === 'area') ? c.worst.area : c.worst.length, call: call });
        }
      }
      return out;
    }

    /* The ground's envelope is its DECLARED accuracy — it is the reference, so certifying it against
       itself would be the co-designed reader js/gis-crs.js refuses to be. */
    function groundEnvelope(CK, what) {
      let list = null;
      try { list = CK.surfaces(); } catch (_) { list = null; }
      for (const s of (list || [])) {
        if (!s || !s.isGround) continue;
        const acc = s.accuracy && s.accuracy[what];
        return (acc && typeof acc.relative === 'number') ? acc.relative : null;
      }
      return null;
    }

    /* The sphere's is MEASURED over the reader's own data, because it depends on where they are. */
    function sphereEnvelope(CK, input, what) {
      let cert = null;
      try { cert = CK.certify('sphere', input); } catch (_) { cert = null; }
      if (!cert || !cert.worst) return null;
      const w = (what === 'area') ? cert.worst.boundArea : cert.worst.boundLength;
      return (typeof w === 'number' && isFinite(w)) ? w : null;
    }

    /* ── measure: the plane is the reader's, and its distortion travels with the number (#R752) ── */

    async function runMeasure(ds, params, R, ctx) {
      const what = String(params.what == null ? '' : params.what);
      /* (#R783) ⚠ BY NAME, NOT BY POSITION. These two read params[0] and params[2] until a fifth
         parameter was inserted between them and `unit` silently became `surface`'s list — an index
         written beside a declaration is a copy of its order. */
      const wants = paramValues(DECL.measure, 'what');
      if (wants.indexOf(what) < 0) return fail('bad-param', { param: 'what', value: what, values: wants });
      const unit = (params.unit == null || String(params.unit) === '') ? 'km' : String(params.unit);
      const units = paramValues(DECL.measure, 'unit');
      if (units.indexOf(unit) < 0) return fail('bad-param', { param: 'unit', value: unit, values: units });

      /* (#R783) 述べた要求と、述べた面。⚠ BOTH ARE READ BEFORE ANY ARITHMETIC: a requirement that is
         not a number is a mistake in the call, and finding that out after a column of areas has been
         computed answers a different question (the kernel reads its own tolerance the same way). */
      let tol = null;
      if (params.tolerance != null && String(params.tolerance).trim() !== '') {
        tol = Number(params.tolerance);
        if (!isFinite(tol) || tol <= 0) return fail('bad-param', { param: 'tolerance', value: params.tolerance, unit: 'ratio' });
      }
      const wanted = (params.surface == null || String(params.surface).trim() === '') ? null : String(params.surface).trim();

      const spec = (params.crs == null || String(params.crs).trim() === '') ? null : String(params.crs).trim();
      let P = null, CK = null;
      if (wanted != null || tol != null) {
        /* ⚠ 「訊けなかった」 は 「無い」 ではない。 Both of these questions belong to js/gis-crs.js, so
           a page where it is not mounted answers that rather than measuring something else. */
        CK = crsKernel();
        if (!CK) return fail('crs-unavailable', wanted != null ? { surface: wanted } : { tolerance: tol });
      }
      if (wanted != null) {
        const allowed = paramValues(DECL.measure, 'surface');
        if (!allowed) return fail('crs-unavailable', { surface: wanted });
        if (allowed.indexOf(wanted) < 0) return fail('bad-param', { param: 'surface', value: wanted, values: allowed });
      }
      const ground = groundSurfaceName();
      /* ⚠ 二つ述べられたら、それは呼び出しの誤りである。 A plane named beside a surface that has no
         plane in it is two answers to one question, and picking one silently is the unit nobody said
         out loud (#R752's whole reason for making the plane a parameter). */
      if (wanted != null && spec && wanted !== 'stated-plane') {
        return fail('bad-param', { param: 'surface', value: wanted, crs: spec, values: paramValues(DECL.measure, 'surface') });
      }
      if (wanted === 'stated-plane' && !spec) {
        return fail('bad-param', { param: 'crs', value: null, surface: wanted, spellings: paramValues(DECL.measure, 'crs') });
      }
      const onGround = wanted != null && ground != null && wanted === ground;
      if (spec) {
        CK = crsKernel();
        if (!CK || typeof CK.projection !== 'function') return fail('crs-unavailable', { crs: spec });
        P = CK.projection(spec);
        /* ⚠ 「その面は作れなかった」 CARRIES ITS OWN REASON. The kernel says why (an unknown code, a
           plane whose parameters were not given, a radius it will not invent); folding all of them
           into one `bad-param` would send the reader to look at the wrong thing. */
        if (!P) {
          /* WARNING (#R756) A REFUSAL THAT DOES NOT SAY WHAT WOULD HAVE WORKED sends the reader to
             guess at a grammar. The spellings come from the kernel that owns the planes. */
          const spellings = paramValues(DECL.measure, 'crs');
          const detail = { crs: spec, why: (CK.why && CK.why()) || null };
          if (spellings) detail.spellings = spellings;
          return fail('crs-plane-unusable', detail);
        }
      }

      const base = (params.outName != null && String(params.outName).trim() !== '')
        ? String(params.outName).trim()
        : (what === 'area' ? ('_area' + (unit === 'm' ? 'M2' : 'Km2')) : ('_length' + (unit === 'm' ? 'M' : 'Km')));
      if (hasField(ds, base)) return fail('output-column-in-use', { name: base });

      const fs = ds.features();

      /* (#R783) ⚠ 数を出してから取り消すことはできない。 For the two surfaces this layer does not hand
         a tolerance to per geometry (the sphere's arithmetic is its own; the ground's accuracy is
         declared by the kernel that implements it), the stated requirement is compared against the
         measured envelope BEFORE the loop. The plane's is applied by the kernel inside areaOn /
         lengthOn, over each geometry, which is where that measurement belongs. */
      if (tol != null && !spec) {
        const env = onGround ? groundEnvelope(CK, what) : sphereEnvelope(CK, fs, what);
        if (env == null) return fail('crs-accuracy-unmeasured', { tolerance: tol, what: what, surface: onGround ? ground : 'sphere' });
        if (!(env <= tol)) {
          return fail('crs-accuracy-outside-tolerance', {
            tolerance: tol, worst: env, what: what, unit: 'ratio', surface: onGround ? ground : 'sphere',
            /* ⚠ 「信頼できない」 だけを返さない（#R783 の kernel 側と同じ形）。 */
            alternatives: surfacesMeeting(CK, fs, what, tol),
          });
        }
      }

      const out = [];
      let measured = 0, refusedRows = 0;
      for (const f of fs) {
        if (!(await ctx.tick(1, fs.length))) return fail('cancelled', { done: ctx.done(), total: fs.length });
        const g = (f && f.geometry) || null;
        const extra = {};
        if (!g) {
          /* A row with no place has no area. null, not 0 — 0 is a measurement. */
          extra[base] = null;
        } else if (onGround) {
          /* (#R783) 地面の上で、平面を1枚も挟まずに測る。 ⚠ THE ARITHMETIC IS NOT REIMPLEMENTED HERE:
             these are js/gis-crs.js's two ground doors, which carry their own declared accuracy. */
          const m = (what === 'area') ? CK.areaOnGround(g, { unit: unit === 'm' ? 'm2' : 'km2' })
            : CK.lengthOnGround(g, { unit: unit });
          if (!m || !m.ok) {
            refusedRows++;
            extra[base] = null;
            extra[base + 'Refused'] = String((m && m.why) || 'measure-failed');
          } else {
            measured++;
            extra[base] = m.value;
          }
        } else if (!P) {
          /* The geodesic answer this layer has always given, unchanged. ⚠ `areaKm2` is the ONE
             implementation of 「面積」 in this file; a second walk here would be a second opinion. */
          const km = (what === 'area') ? areaKm2(g) : lengthKm(g);
          extra[base] = (km == null) ? null : (unit === 'm' ? (what === 'area' ? km * 1e6 : km * 1e3) : km);
          if (extra[base] != null) measured++;
        } else {
          /* ⚠ (#R783) THE TOLERANCE IS HANDED TO THE KERNEL, NOT APPLIED HERE. It measures the
             envelope over this very geometry and either lets the number through or answers with the
             surfaces that would meet it; `options.tolerance` absent means nothing is computed and
             nothing is refused, which is what keeps every old call identical to the bit. */
          const mOpts = (what === 'area') ? { unit: unit === 'm' ? 'm2' : 'km2' } : { unit: unit };
          if (tol != null) mOpts.tolerance = tol;
          const m = (what === 'area') ? CK.areaOn(P, g, mOpts) : CK.lengthOn(P, g, mOpts);
          if (!m || !m.ok) {
            /* ⚠ 要求を満たせなかったことは、この行の話ではなく、この測定の話である。 A reader who
               stated a tolerance asked for numbers they can stand behind; answering with a column of
               nulls beside one refusal code would be the 「表面的な対処」 this project forbids. The
               kernel's own detail — how far off, the certificate, and the surfaces that can — is
               handed up whole. */
            if (tol != null && m && m.why === 'crs-accuracy-outside-tolerance') {
              return fail(m.why, Object.assign({ surface: 'stated-plane', plane: spec }, m.detail || {}));
            }
            refusedRows++;
            extra[base] = null;
            extra[base + 'Refused'] = String((m && m.why) || 'measure-failed');
          } else {
            measured++;
            extra[base] = m.value;
            /* ⚠ THE DISTORTION TRAVELS WITH THE NUMBER, IN THE SAME ROW. An area measured on Web
               Mercator at 60°N is four times the truth; a column of those with nothing beside them
               is a value whose caveat is missing, which is the shape this project keeps catching.
               The scale is the kernel's measurement over this very geometry, not a constant. */
            const sc = (what === 'area') ? m.areaScale : m.scale;
            if (sc) { extra[base + 'ScaleMin'] = sc.min; extra[base + 'ScaleMax'] = sc.max; }
          }
        }
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      /* ⚠ (#R756) 面の「有効範囲」を、宣言したまま誰にも訊いていなかった。 js/gis-crs.js has had
         `assess()` since #R752 — how many of the reader's own positions fall outside the plane's
         stated area of use, by how far, and which one first — and `measure` never called it. A UTM
         zone measured two zones away answered with a number and no sign that it had left the plane.
         ⚠ IT IS REPORTED, NOT ENFORCED. `outside: 0` is not a claim of suitability (a whole-world
         plane can never report anything else), so a refusal here would be a judgement this layer is
         not entitled to make — the reader asked for this plane. What it gets is the measurement. */
      let fit = null;
      if (P && CK && typeof CK.assess === 'function') {
        const a = CK.assess(P, fs);
        if (a) {
          fit = {
            outside: a.outside, of: a.total, unprojectable: a.unprojectable,
            beyond: a.beyond, beyondUnit: a.beyondUnit, sample: a.sample,
            extent: a.extent, areaScale: a.areaScale, scale: a.scale,
          };
        }
        /* ⚠ (#R783) 「面の外へ出たか」の次の問いに、答えが無かった。 assess() says where the data is
           relative to the plane's stated area of use; it says NOTHING about how far off the numbers
           can be, and a column of Web-Mercator areas at 60°N is +324% with a perfectly healthy
           `outside: 0`. certify() is the measurement — the composed envelope, the independent
           reference it was checked against, and whether the check fell inside it — and it is carried
           here as the kernel produced it rather than restated. ⚠ IT IS A MEASUREMENT AND NOT A
           VERDICT: nothing is refused unless the caller stated a tolerance. */
        if (fit && typeof CK.certify === 'function') {
          const cert = CK.certify(P, fs);
          if (cert) { fit.bound = cert.bound; fit.checked = cert.checked; fit.within = cert.within; }
        }
      }
      return {
        ok: true, features: out,
        stats: {
          measured: measured, refused: refusedRows, total: fs.length,
          plane: spec || 'geodesic', unit: unit,
          /* which surface the numbers above were computed on — the same vocabulary ops() declares.
             (#R783) `onGround` is the ground's own name, taken from the module that owns it. */
          surface: onGround ? ground : (P ? 'stated-plane' : 'sphere'),
          fit: fit,
        },
      };
    }

    async function runRasterDiff(aDs, bDs, params, R, ctx) {
      const RK = rasterKernel();
      const b = bandIndexOf(aDs, params.band);
      if (!b.ok) return b.res;
      /* (#R759) 口を渡すのはここである。The kernel decides whether it can be used and says so in the
         result; this layer's whole part is to HAND IT OVER, which is the part that was missing. */
      const r = await RK.diff(aDs, bDs, b.index, { ctx: ctx, worker: workerKernel() });
      if (!r || !r.ok) return r || fail('diff-failed');
      /* ⚠ WHICH THREAD ANSWERED IS PART OF THE ANSWER, not a log line. `stats` is what js/gis-panel.js
         and js/gis-atlas.js print as the runner wrote it, so a run that fell back to the main thread
         says so to the reader who is wondering why the map stopped moving. */
      /* ⚠ THREE ANSWERS, NOT TWO. `used` is the other thread; a `reason` is the door that could not be
         used and why; and NO NOTE AT ALL is 「口そのものが無かった」 — a page where js/gis-worker.js is
         not mounted. Folding the third into either of the others would be this project's recorded
         「訊けなかった」 と 「無かった」 を同じ答えにする shape. */
      const stats = { count: r.count, nodata: r.nodataCount };
      if (r.worker) stats.worker = r.worker.used ? 'used' : ('not-used: ' + r.worker.reason);
      else stats.worker = 'not-used: worker-not-mounted';
      return { ok: true, raster: r.raster, stats: stats };
    }

    /* ── the time window (#R735) ────────────────────────────────────────────────────────────────
       Both ends are optional: 「1889 年以降」 is a window with no upper end, and refusing it would make
       the op answer a narrower question than the reader's. What is NOT optional is a declared axis. */
    async function runTimeWindow(ds, params, R, ctx) {
      if (!ds.time) return fail('time-not-declared', ds.timeRefused ? { refused: String(ds.timeRefused.why || '') } : undefined);
      const fromM = (params.from == null || String(params.from).trim() === '') ? null : R.momentOf(params.from);
      const toM = (params.to == null || String(params.to).trim() === '') ? null : R.momentOf(params.to);
      if (params.from != null && String(params.from).trim() !== '' && !fromM) return fail('bad-param', { param: 'from', value: String(params.from) });
      if (params.to != null && String(params.to).trim() !== '' && !toM) return fail('bad-param', { param: 'to', value: String(params.to) });
      if (!fromM && !toM) return fail('missing-param', { param: 'from' });
      const mode = (params.mode == null || String(params.mode) === '') ? 'overlaps' : String(params.mode);
      const allowed = DECL.timeWindow.params[2].values;
      if (allowed.indexOf(mode) < 0) return fail('bad-param', { param: 'mode', value: mode, values: allowed });
      /* ⚠ THE WINDOW IS THE WHOLE OF WHAT THE READER TYPED. 「1889」 is that year, start to end — the
         registry's momentOf says so — so a from of 1889 and a to of 1890 is two whole years. */
      const lo = fromM ? fromM.start : null;
      const hi = toM ? toM.end : null;
      if (lo != null && hi != null && hi < lo) return fail('bad-param', { param: 'to', value: String(params.to) });

      const inWindow = (s, e) => {
        /* An open end of a feature's own span means 「まだ続いている」/「始まりを誰も述べていない」,
           and it is treated as reaching the window rather than as failing it: the alternative silently
           drops every still-current row from every window. */
        const a = (s == null) ? -Infinity : s, b = (e == null) ? Infinity : e;
        if (mode === 'within') return (lo == null || a >= lo) && (hi == null || b <= hi);
        return (hi == null || a <= hi) && (lo == null || b >= lo);
      };

      const out = [];
      let dropped = 0, undated = 0, cut = 0;
      const track = (ds.time.kind === 'track') ? ds.time : null;
      /* (#R764) 軌跡を切る経路は 1 行あたり数千の位置を歩くので、行数は費用の下限でしかない。 */
      const rows = ds.features();
      for (let i = 0; i < rows.length; i++) {
        if (ctx && !(await ctx.tick(1, rows.length))) return fail('cancelled', { done: ctx.done(), total: rows.length });
        const f = rows[i];
        if (track) {
          const r = cutTrack(f, track, R, inWindow);
          if (r == null) { dropped++; continue; }
          if (r.cut) cut++;
          out.push(r.feature);
          continue;
        }
        const span = R.timeSpan(ds, f);
        /* ⚠ A ROW WHOSE OWN TIME CANNOT BE READ IS DROPPED AND COUNTED, not kept 「just in case」.
           Keeping it would make the answer to 「1889 年のもの」 include rows nobody has dated, and
           `_undated` on the record is how the reader learns how many there were. */
        if (!span) { undated++; continue; }
        if (!inWindow(span.start, span.end)) { dropped++; continue; }
        out.push(f);
      }
      return { ok: true, features: out, stats: { dropped: dropped, undated: undated, cut: cut } };
    }

    /* One trajectory, cut to the window. ⚠ THE PARALLEL ARRAYS ARE CUT WITH IT — a line whose
       positions were filtered while its `coordTimes` were not is a trace whose every timestamp is on
       the wrong fix, which is the exact failure js/gis-datasets.js measures for. Returns null when
       nothing of this feature is inside. */
    function cutTrack(f, track, R, inWindow) {
      const g = f && f.geometry;
      const coords = g && g.coordinates;
      const p = props(f);
      const times = p[track.timesField];
      if (!Array.isArray(coords) || !Array.isArray(times)) return null;
      /* A Point track is one fix: it is in or it is out. */
      if (g.type === 'Point') {
        if (!isPos(coords)) return null;
        const m = R.momentOf(times[0]);
        if (!m || !inWindow(m.start, m.end)) return null;
        return { feature: f, cut: false };
      }
      if (g.type !== 'LineString') return null;
      const eles = track.elevationField ? p[track.elevationField] : null;
      const keepC = [], keepT = [], keepE = [];
      for (let i = 0; i < coords.length; i++) {
        const m = R.momentOf(times[i]);
        if (!m || !inWindow(m.start, m.end)) continue;
        keepC.push(coords[i]); keepT.push(times[i]);
        if (Array.isArray(eles)) keepE.push(eles[i] == null ? null : eles[i]);
      }
      if (!keepC.length) return null;
      const extra = {};
      extra[track.timesField] = keepT;
      if (Array.isArray(eles)) extra[track.elevationField] = keepE;
      const geom = (keepC.length >= 2)
        ? { type: 'LineString', coordinates: keepC }
        /* One surviving fix is a POINT. A LineString of one position is not a line any renderer or
           kernel in this app accepts, and js/geodesy.js sanitizeFeatures would drop it entirely. */
        : { type: 'Point', coordinates: keepC[0] };
      return { feature: { type: 'Feature', properties: withProps(p, extra), geometry: geom }, cut: keepC.length !== coords.length };
    }

    /* Which time declaration an output inherits — see the note at the registration. */
    function outTime(inDs, decl) {
      const t = inDs && inDs.time;
      if (!t) return null;
      if (t.kind === 'track' && String(decl.output || '') !== 'same-as-input') return null;
      return t;
    }

    /* ══ ⚠⚠⚠ (#R759) 答えは、その答えを作った入力より完全にはなれない ════════════════════════════
       #R749 put `coverage` on an ACQUISITION — 「求めた窓のうち、どこまでが答えられたか」 — and #R756
       published it to the planner, and both stopped at the door. An op's output carried the recipe
       (`kind:'op'`, inputs, params) and NO coverage at all, so js/gis-atlas.js datasetRow, which reads
       `provenance.coverage` of the record IN FRONT OF IT, found nothing on every derived record.
       ⚠ THE LOSS IS NOT COSMETIC AND IT IS ONE STEP WIDE. 「一部の地域しか取れていない施設データ」 is
       visible while it is the acquisition; buffer it once and the same rows are a record about which
       nothing is said, and the count computed from it is stated to the reader with no caveat. The
       lineage was still there — a reader could walk `provenance.inputs` back to the acquisition — but
       nothing did, and 「たどれる」 is not 「述べている」 ([[intmap-records-with-no-reader]]).

       ⚠ THE RULE IS A FACT ABOUT DERIVATION, NOT A TABLE OF OPS. Every runner in RUN computes its
       answer OUT OF its inputs, so no output can describe more of the world than the least complete
       thing it was computed from. That is why this is one function applied to every registration
       rather than a per-op inheritance table: an op added to DECL tomorrow inherits by existing.

       ⚠ 'partial' AND 'sample' ARE NOT RANKED AS 「弱い/強い」 BY THIS FILE — js/gis-sources.js says
       in as many words that the third is not a weaker second. What IS ordered is which one must be
       said when both are present: rows that were left out (`partial`) cannot be made whole by asking
       the same question at a finer resolution, so it is the one that survives the join. Both are
       carried in `inputs` regardless, so nothing that was said is lost.

       ⚠ AND SILENCE IS NOT `all`. A dataset the reader imported from a file has no coverage statement
       — nobody measured what the file is a part of — and treating that as 「全部」 is exactly the
       shape this project keeps recording ([[intmap-one-store-was-asked]]). So when any input said
       nothing, no `completeness` is written: the record says which inputs spoke and which did not,
       and a planner reading it is told the question is open instead of being told an answer. */
    const COVERAGE_ORDER = { all: 0, sample: 1, partial: 2 };

    /* ══ ⚠⚠⚠ (#R763) 継承は入力についてしか語らず、演算自身の欠落を落としていた ═══════════════════
       #R759 made an output carry what its INPUTS said. What it still could not say is what THIS RUN
       lost. withGeoStats counts every attempt that failed (`geometryFailed`) and returns it in
       `stats`, and `stats` is read by js/gis-panel.js and js/gis-atlas.js FOR THAT TURN and written
       nowhere — so:
         入力は全部 all  →  buffer で 1,000 行のうち 120 行が計算できない  →  残りが登録される
                         →  その記録の coverage は `all` のまま
       and every count computed from it afterwards is stated to the reader with no caveat. The lineage
       does not help: the loss happened HERE, not upstream, so walking back finds nothing
       ([[intmap-records-with-no-reader]] — the number existed and had no reader).
       ⚠ IT IS A SEPARATE FACT FROM THE ACQUISITION, AND STAYS SEPARATE. 「求めた範囲のうちどこまで
       取れたか」 and 「取れたもののうちどこまで計算できたか」 are two different questions with two
       different fixes, so `computed` sits beside `inputs` rather than overwriting it. What they share
       is the summary word: an answer that lost rows is not complete, whatever its inputs were. */
    function inheritCoverage(ds, stats, opId) {
      const lost = (stats && typeof stats.geometryFailed === 'number' && stats.geometryFailed > 0)
        ? { failed: stats.geometryFailed, why: stats.geometryWhy || null }
        : null;
      const stated = [], silent = [];
      for (const d of ds) {
        const c = d && d.provenance && d.provenance.coverage;
        if (c && c.completeness) stated.push({ id: d.id, coverage: c });
        else if (d) silent.push(d.id);
      }
      /* ⚠ A RUN THAT LOST ROWS HAS SOMETHING TO SAY EVEN WHEN EVERY INPUT WAS SILENT. Returning
         null here on that ground was the second half of the same defect: an imported file states no
         coverage, so a buffer over it that dropped 120 rows produced a record saying nothing at all. */
      if (!stated.length && !lost) return null;
      let worst = stated[0];
      for (const s of stated) {
        const a = COVERAGE_ORDER[String(s.coverage.completeness)];
        const b = COVERAGE_ORDER[String(worst.coverage.completeness)];
        /* ⚠ A WORD THIS FILE DOES NOT KNOW IS NOT SILENTLY RANKED LAST. js/gis-sources.js owns the
           vocabulary; a fourth value added there arrives here as `undefined` and must not be read as
           「一番良い」. It is carried as the one that survives, which is the conservative reading. */
        if (a === undefined || (b !== undefined && a > b)) worst = s;
      }
      const out = {
        /* 「これは導出された記録についての陳述であって、取得の観測ではない」 — the two are different
           claims and a reader that cannot tell them apart would re-ask an upstream that was never
           asked in the first place. */
        derived: true,
        inputs: stated.map((s) => ({ id: s.id, completeness: s.coverage.completeness, reason: s.coverage.reason || null })),
      };
      if (silent.length) out.undeclaredInputs = silent.slice();
      /* `all` only survives when every input spoke; see the header. */
      if (stated.length && (!silent.length || COVERAGE_ORDER[String(worst.coverage.completeness)] > 0)) {
        out.completeness = worst.coverage.completeness;
        out.reason = worst.coverage.reason || null;
        out.from = worst.id;
      }
      /* ⚠ THE RUN'S OWN LOSS IS THE LAST WORD, AND IT ONLY EVER MAKES THE ANSWER LESS COMPLETE.
         Written after the inputs' verdict because it cannot be outvoted by it: an answer computed
         out of complete inputs, which could not compute part of itself, is not complete. `from`
         names this op rather than an input id, so a reader is told WHERE the rows went. */
      if (lost) {
        out.computed = { failed: lost.failed, why: lost.why };
        out.completeness = 'partial';
        out.reason = 'op-rows-not-computed';
        out.from = opId || null;
      }
      return out;
    }

    /* ══ ⚠⚠ (#R759) 2 時点の差は、どちらか一方の時点ではない ══════════════════════════════════════
       A grid result was registered with `time: ds[0].time` — the FIRST input's epoch, whatever the op
       had done with the second. So 「2020 年と 2025 年の差分」 was registered as a dataset that says it
       is 2020, and every timeWindow, label and legend downstream said 2020 about a picture of change.
       ⚠ WHICH INPUTS VOTE IS A FACT, NOT A LIST: the ones whose SAMPLES entered the output. rasterMask
       is a grid masked by a polygon layer — the polygons choose pixels, they do not contribute values
       — so its second input does not move the epoch, and it does not have to be named here for that
       to hold, because it is not a grid.
       ⚠ THE ENDS ARE THE RECORDS' OWN VALUES, NOT A RE-READING OF THEM. js/gis-datasets.js declareTime
       has already turned whatever each upstream wrote into a pair of epoch milliseconds, and that pair
       is what is compared and what is carried; asking momentOf again is only for a value that is not
       one yet, which is what a caller declaring a fresh constant hands over.
       ⚠ AND AN UNKNOWN EPOCH IS NOT A SPAN. If either grid never said when it is, the range of the
       result is not something anybody stated, so no declaration is made and the inputs' own times are
       recorded in the recipe instead — 「述べられていない」 stays 「述べられていない」. */
    /* ══ ⚠⚠⚠ (#R763) 規則は正しく書かれていて、実装は代理を訊いていた ═══════════════════════════
       The comment above states the rule exactly: 「the ones whose SAMPLES entered the output」. The
       code below asked a DIFFERENT question — 「それは格子か」 — and the two agree for rasterMask
       (whose second input is a polygon, so it is not a grid) which is the case the comment reasons
       about. They do not agree for `resample`. runResample reads VALUES from a and takes nothing from
       b but its lattice (west/north/pixel/width/height); b contributes not one sample. Yet its DECL is
       `kinds:['raster','raster']`, so b was a grid, so b voted:
         · 2020 年の a を 2025 年の b の格子に合わせる  →  the record said 2020–2025
         · b が時点を述べていない                      →  a's own date was erased to null
       Both are the defect #R759 fixed for rasterDiff, reappearing one op over, under a comment that
       had already ruled it out ([[intmap-one-predicate-three-dimensions]]).
       ⇒ THE RUNNER SAYS WHICH INPUT IT ONLY BORROWED A SHAPE FROM. It is the only thing that knows —
       it is the code that chose to read `bDs.grid` and nothing else — and saying it is a statement
       about THIS RUN, not a table of ops maintained beside them. An op that says nothing is unchanged:
       every grid it was given contributed, which is true of every other runner in RUN. */
    function rasterOutTime(ds, R, shapeOnly) {
      const skip = Array.isArray(shapeOnly) ? shapeOnly : [];
      const grids = ds.filter((d, i) => d && String(d.kind || 'vector') === 'raster' && skip.indexOf(i) < 0);
      if (!grids.length) return { time: null, stated: [] };
      const stated = grids.map((d) => ({ id: d.id, time: d.time || null }));
      if (grids.length === 1) return { time: grids[0].time || null, stated: stated };
      const first = JSON.stringify(grids[0].time || null);
      if (grids.every((d) => JSON.stringify(d.time || null) === first)) return { time: grids[0].time || null, stated: stated };
      const ms = (v, which) => {
        if (typeof v === 'number' && isFinite(v)) return v;
        const m = R.momentOf(v);
        return m ? (which === 'end' ? m.end : m.start) : null;
      };
      const ends = [];
      for (const d of grids) {
        const t = d.time;
        if (!t || t.kind !== 'constant') return { time: null, stated: stated };
        const s = ms(t.start, 'start'), e = ms(t.end, 'end');
        if (s == null || e == null) return { time: null, stated: stated };
        ends.push({ start: s, end: e });
      }
      let lo = ends[0].start, hi = ends[0].end;
      for (const x of ends) { if (x.start < lo) lo = x.start; if (x.end > hi) hi = x.end; }
      return { time: { kind: 'constant', start: lo, end: hi }, stated: stated };
    }

    /* ══ ⚠⚠ (#R759) 列に付けられた陳述は、列の名前が残る限り残る ═══════════════════════════════════
       js/gis-datasets.js measures an output's columns from the VALUES (describeFields), which is
       right — a type nobody verified is a claim with no author. But a unit cannot be measured from
       values: 「12」 is twelve of something, and the something was stated once, by the reader
       (declareField) or by the grid its band came from. A filter that keeps 40 of 1,000 rows was
       therefore handing back a `population_density` column with no unit on it, and the reader who had
       typed 「人/km²」 five minutes earlier had to type it again — on a record that REFUSES to be
       declared on at all (openFor: `edit-would-contradict-recipe`), so they could not.
       ⚠ CARRIED WITH ITS AUTHOR, NEVER RE-AUTHORED. The output's statement says the unit came from
       the input and who said it there; it is not moved into the reader's declaration store, which
       holds what the READER said about THAT record (js/gis-datasets.js states that split).
       ⚠ ONLY THE UNIT, AND ONLY BY NAME. A column that kept its name kept its quantity — the mean and
       the sum of metres are metres — and a column an op INVENTED has a name nothing stated anything
       about, so it inherits nothing. The measured `type` is always the output's own. */
    function fieldStatements(ds, renamed, authored, by) {
      const out = {};
      /* ⚠ (#R774) A COLUMN THE RUN INVENTED CAN STILL HAVE A UNIT — but only the runner can say it,
         because it is the one that knows the arithmetic. `compute` derives one from the expression
         (js/gis-units.js unitOfExpr) and hands it over here. It is written FIRST so that an inherited
         statement about a column of the same name never silently overrides the run's own; the entries
         below skip a name that is already present. ⚠ The author recorded is the op, not the reader
         and not the input — js/gis-datasets.js applyInherited keeps it in `unitStatedAt`. */
      if (authored && typeof authored === 'object') {
        for (const n of Object.keys(authored)) {
          const u = authored[n];
          if (u == null || String(u) === '') continue;
          out[n] = { unit: String(u), unitStated: 'derived', unitFrom: by == null ? null : String(by) };
        }
      }
      for (const d of ds) {
        for (const f of (d && d.fields) || []) {
          if (!f || !f.name || f.unit == null) continue;
          if (Object.prototype.hasOwnProperty.call(out, f.name)) continue;
          out[f.name] = { unit: String(f.unit), unitStated: f.unitStated || null, unitFrom: d.id };
        }
      }
      /* ⚠ (#R763) THE OUTPUT'S NAME FOR A COLUMN THE RUN RENAMED. `renamed` comes from the runner
         that did the renaming (js/gis-ops.js runJoin), because it is the only thing that knows which
         output column is which input column — the names alone cannot say, and a prefix parsed back
         off a string here would be this file guessing at another op's parameter.
         ⚠ THE OLD NAME IS NOT KEPT ALONGSIDE: the output has no such column, and a statement about a
         column that is not there is the 「列を発明する」 shape the test above this measures. */
      if (renamed && typeof renamed === 'object') {
        for (const to of Object.keys(renamed)) {
          const r = renamed[to];
          if (!r || !r.name) continue;
          const src = out[r.name];
          if (!src) continue;
          /* ⚠ THE OLD NAME IS NOT REMOVED. A join whose LEFT input also has a column called `mass`
             keeps that column, under that name, with its own unit — the collision check only refuses
             a clash on the PREFIXED name. Dropping the entry here would strip the unit off a column
             that is still in the answer. js/gis-datasets.js applies statements by looking up the
             output's own column names, so an entry for a column the output does not have is never
             read, and inventing one is what ⑥ of tests/r759 measures. */
          if (!Object.prototype.hasOwnProperty.call(out, to)) out[to] = { unit: src.unit, unitStated: src.unitStated, unitFrom: src.unitFrom, unitRenamedFrom: r.name };
        }
      }
      return Object.keys(out).length ? out : null;
    }

    /* ── run ──────────────────────────────────────────────────────────────────────────────────── */

    /* async, and now for a reason rather than in anticipation of one: every op but filter needs
       js/gis-geometry.js, which loads its sweep-line on demand. The await happens ONCE per process —
       ready() memoises — and a reader who only ever filters never waits for it at all. */
    async function run(step, opts) {
      const R = registry();
      if (!R) return fail('registry-missing');
      const decl = DECL[step && step.op];
      if (!decl) return fail('op-unknown', { op: (step && step.op) == null ? null : String(step.op) });
      if (decl.needsGeodesy && (!geodesy() || earthKm() == null)) return fail('geodesy-missing');
      /* (#R735) The grid arithmetic is a module like the others, and 「読み込まれていない」 is its own
         answer rather than an empty result. */
      if (decl.needsRaster && !rasterKernel()) return fail('raster-unavailable');
      /* (#R738) Same shape as the line above: 「式を読む機械が来ていない」 is its own answer, not an
         expression that silently evaluates to nothing. */
      if (decl.needsExpr && !exprKernel()) return fail('expr-unavailable');
      /* (#R752) Same shape again — the warp is a module, and 「載っていない」 is an answer. */
      if (decl.needsWarp && !warpKernel()) return fail('warp-unavailable');
      /* (#R783) And again for the units. ⚠ `convert` MAY NOT FALL BACK TO ARITHMETIC OF ITS OWN
         when js/gis-units.js is not mounted: a conversion this file performed with a factor it
         invented would be the one thing the op exists to stop. */
      if (decl.needsUnits && !unitKernel()) return fail('units-unavailable');
      if (decl.needsGeometry) {
        const GG = geometry();
        if (!GG) return fail('geometry-missing');
        /* ⚠ THE MODULE BEING PRESENT IS NOT THE CLIPPER BEING LOADED. available() is what the ops
           actually depend on, and answering 「0 件でした」 because a dynamic import had not landed
           is the shape this project has recorded more than once: 「見つからなかった」 and
           「訊けなかった」 must not be the same answer. */
        let ok = false;
        try { ok = await GG.ready(); } catch (_) { ok = false; }
        if (!ok || !GG.available()) return fail('geometry-unavailable');
      }

      const inputs = Array.isArray(step.inputs) ? step.inputs.slice() : [];
      if (inputs.length !== decl.inputs) return fail('input-count', { expected: decl.inputs, got: inputs.length });
      const ds = [];
      for (const id of inputs) { const rec = R.get(id); if (!rec) return fail('input-missing', { id: id == null ? null : String(id) }); ds.push(rec); }

      /* ⚠ THE PAYLOAD IS CHECKED BEFORE THE GEOMETRY, AND ITS DEFAULT IS 'vector' (#R735). Every op
         written before rasters existed assumes features(), which a grid does not have; declaring the
         kind each slot needs — and defaulting the undeclared ones — is what makes those nine refuse a
         grid by name instead of walking a function that is not there. */
      for (let i = 0; i < ds.length; i++) {
        const kinds = Array.isArray(decl.kinds) ? decl.kinds : null;
        const want = kinds ? String(kinds.length === 1 ? kinds[0] : (kinds[i] == null ? 'vector' : kinds[i])) : 'vector';
        const got = String(ds[i].kind || 'vector');
        if (got !== want) return fail('input-kind', { input: i, expected: want, kind: got });
      }

      /* ⚠ A STALE INPUT IS REFUSED BY NAME (#R732). js/gis-datasets.js marks a dataset stale when a
         recomputation above it failed: the features are still there, but they are the answer to
         parameters the reader has already changed. Consuming them would put that staleness into a
         NEW record whose own provenance says it is current — the one place it stops being visible.
         This is what makes `stale` a state and not a decoration. */
      for (let i = 0; i < ds.length; i++) {
        if (ds[i].stale) return fail('input-stale', { input: i, id: ds[i].id, why: String(ds[i].stale.why || '') });
      }

      /* The geometry contract is checked against the dataset's MEASURED geometryType (Multi* already
         folded into its singular, 'Mixed' when the features disagree). An op that needs one kind
         refuses a mixed dataset by name instead of quietly working on the part it recognises. */
      for (let i = 0; i < ds.length; i++) {
        const acc = decl.accepts[i];
        if (acc === 'any') continue;
        /* A grid has no geometry type to agree with, and the slot that takes one already said so
           through `kinds`; asking `accepts` about it would refuse every raster as 'Mixed'. */
        if (String(ds[i].kind || 'vector') === 'raster') continue;
        if (ds[i].geometryType !== acc) {
          return fail(decl.mismatchWhy || 'geometry-type', { input: i, expected: acc, geometryType: ds[i].geometryType });
        }
      }

      /* ⚠ 'any' MEANS ANY SHAPE, NOT 「形が無くてもよい」 (#R738). A statistics table imports as
         features with `geometry:null` now, and `geometryType` is null for that, for an empty dataset
         AND for a grid — three different things one field cannot separate, which is why
         js/gis-datasets.js MEASURES `withGeometry`. Without this, a table handed to buffer or clip
         would walk every row, find no coordinates and register an empty polygon layer: a run that
         succeeded, an answer of zero, and nothing anywhere saying the input had no places in it.
         ⚠ The test is the op's own declaration, not a list of op names: an op that needs the geometry
         kernel is an op that is going to ask these rows where they are. filter, timeWindow, join and
         compute declare neither, and go on working on a table — which is the entire point of being
         able to import one. */
      if (decl.needsGeometry || decl.needsGeodesy) {
        for (let i = 0; i < ds.length; i++) {
          if (decl.accepts[i] !== 'any') continue;
          if (String(ds[i].kind || 'vector') !== 'vector') continue;
          if (ds[i].count > 0 && ds[i].withGeometry === 0) {
            return fail('input-has-no-geometry', { input: i, id: ds[i].id, rows: ds[i].count });
          }
        }
      }

      const params = (step.params && typeof step.params === 'object') ? step.params : {};
      /* ⚠ A TABLE, NOT AN if-CHAIN ENDING IN else. The chain's last arm was unconditional, so an op
         declared in DECL and not wired here would have run AGGREGATE and registered its output
         under the new op's name. Keyed by the same ids DECL is keyed by, the wiring is checkable —
         and tests/r731-gis-geometry-crs-checks ① measures that every declared op has a runner. */
      /* ⚠⚠⚠ (#R764) THIS COMMENT USED TO SAY THE OPPOSITE OF WHAT THE TABLE BELOW DID. It read:
         「The others finish in one turn and are handed it anyway, so a runner that grows tomorrow has
         it already.」 MEASURED: six of the twenty-four were handed nothing — `filter`, `buffer`,
         `dissolve`, `timeWindow`, `join`, `compute` — and `buffer` unions a geodesic disk per vertex,
         which is about as far from 「one turn」 as anything in this file gets. A reader buffering a
         few thousand features had the stop button they could not use, under a note explaining that
         they could ([[intmap-sync-loop-cannot-be-cancelled]] is the same shape one level down).
         ⚠ THE NOTE IS NOW TRUE OF EVERY ROW, and it is cheap to keep true: a runner that takes `ctx`
         and yields by ELAPSED TIME costs a caller with no cancel path nothing, because `makeCtx`'s
         tick is only awaited when a frame has passed. ⚠ AND THERE ARE NOT TWO IMPLEMENTATIONS — the
         same loop runs either way; `ctx` decides only whether it ever hands the thread back. */
      const ctx = makeCtx(opts);
      const RUN = {
        filter: () => runFilter(ds[0], params, R, ctx),
        buffer: () => runBuffer(ds[0], params, R, ctx),
        clip: () => runClip(ds[0], ds[1], ctx),
        intersect: () => runOverlay('intersect', ds[0], ds[1], ctx),
        difference: () => runOverlay('difference', ds[0], ds[1], ctx),
        union: () => runUnion(ds[0], ds[1], ctx),
        dissolve: () => runDissolve(ds[0], params, R, ctx),
        relate: () => runRelate(ds[0], ds[1], params, R, ctx),
        aggregate: () => runAggregate(ds[0], ds[1], params, R, ctx),
        sample: () => runSample(ds[0], ds[1], params, R, ctx),
        zonal: () => runZonal(ds[0], ds[1], params, R, ctx),
        rasterMask: () => runRasterMask(ds[0], params, R, ctx),
        rasterDiff: () => runRasterDiff(ds[0], ds[1], params, R, ctx),
        /* (#R752) the grid family the review of #R749 named as missing, and the two geometry-quality
           ops. Each is one line here for the reason the table exists at all: DECL and RUN are keyed
           by the same ids, so tests/r732 ① catches a declared op with no runner. */
        resample: () => runResample(ds[0], ds[1], params, ctx),
        rasterCalc: () => runRasterCalc(ds[0], ds[1], params, R, ctx),
        mosaic: () => runMosaic(ds[0], ds[1], params, ctx),
        rasterize: () => runRasterize(ds[0], params, R, ctx),
        polygonize: () => runPolygonize(ds[0], params, ctx),
        measure: () => runMeasure(ds[0], params, R, ctx),
        validate: () => runValidate(ds[0], params, ctx),
        repair: () => runRepair(ds[0], params, ctx),
        timeWindow: () => runTimeWindow(ds[0], params, R, ctx),
        join: () => runJoin(ds[0], ds[1], params, ctx),
        /* (#R783) the three joins the outside review's §9 named, in the order it put them: where a
           row is, what is nearest to it, when it holds. */
        spatialJoin: () => runSpatialJoin(ds[0], ds[1], params, R, ctx),
        nearestJoin: () => runNearestJoin(ds[0], ds[1], params, R, ctx),
        timeJoin: () => runTimeJoin(ds[0], ds[1], params, R, ctx),
        compute: () => runCompute(ds[0], params, R, ctx),
        /* (#R783) 単位換算——同じ §9 の「手作業の倍率計算ではなく」。 */
        convert: () => runConvert(ds[0], params, R, ctx),
      };
      const runner = RUN[decl.id];
      if (!runner) return fail('op-not-wired', { op: decl.id });
      /* ⚠ AWAITED. (#R764) EVERY runner in the table is async now — the count that used to stand here
         was 「four」, and this round made it all of them, which is the same drift the note above the
         table was caught in. A number in prose about a table two lines away is a number nobody
         checks, so it is stated as 「every」: that stays true when the next op is added.
         `res.ok` on an unawaited Promise is
         `undefined` — which this function would have reported as a refusal with no reason. */
      const res = await runner();
      if (!res || !res.ok) return res || fail('op-unknown', { op: decl.id });

      /* The title is an identifier, not a sentence: op(input, input). Nothing here composes prose,
         because prose here would be prose in one language. */
      const title = (step.title != null && String(step.title).trim() !== '')
        ? String(step.title)
        : decl.id + '(' + ds.map((d) => d.title).join(', ') + ')';
      const recorded = clone(params);
      if (recorded == null) return fail('bad-param', { param: 'params' });

      /* THE RECIPE. js/gis-project.js replays exactly this, which is why the params written here are
         the params that ran, cloned — a caller mutating its own object afterwards must not be able to
         rewrite history. */
      const prov = { kind: 'op', op: decl.id, inputs: inputs, params: recorded };
      /* ══ ⚠⚠⚠ (#R765) 「どのエンジンが計算したか」は、計算した瞬間にしか分からない ═════════════
         #R749 established that the same recipe is not the same answer across implementations, and
         wrote the engine's versions into every step js/gis-project.js SAVES. That covers a reopened
         project and nothing else: a record sitting in the registry right now — the one a reader is
         looking at, the one they are about to export — carried no statement about what computed it.
         Asking the kernels later answers a different question («what is loaded now»), and the two
         differ in exactly the case the version exists for.
         ⚠ ASKED, NOT COPIED. js/gis-project.js discovers the kernels (any window.IntMapGis* that
         publishes version()) and that discovery is its rule; a second walk here would be the second
         list this layer keeps refusing to grow. ⚠ AND ITS ABSENCE IS RECORDED AS ABSENCE — a record
         made while that module was not mounted says nothing rather than guessing, and manifest()
         reports the gap instead of printing today's versions as though they were then's. */
      const eng = (() => {
        try {
          const P = (typeof window !== 'undefined') ? window.IntMapGisProject : null;
          if (!P || typeof P.engine !== 'function') return null;
          const e = P.engine();
          return (e && typeof e === 'object' && Object.keys(e).length) ? e : null;
        } catch (_) { return null; }
      })();
      if (eng) prov.engine = eng;
      /* ══ ⚠⚠⚠ (#R783) レシピは、呼び手が打ったものだけでなく、実行が解決したものも持つ ═════════
         `convert` forced this. A reader converting 人口密度 to /km² states only the TARGET, because
         the source unit is already on the column with its own author — so `params` alone says
         「something を /km² に直した」, and the one fact a manifest exists for (換算前後の単位と、
         使った変換) lived in `stats`, which js/gis-panel.js prints for that turn and nobody writes
         down. That is the loss #R763 recorded for the geometry a run could not compute, one op over.
         ⚠ IT IS SEPARATE FROM `params`, AND IT HAS TO BE. `params` is what js/gis-project.js
         REPLAYS: a resolved value merged into it would become a caller's statement on reload, and
         the next replay would stop asking the column — so a column whose unit was corrected in the
         meantime would be recomputed against the old one. `resolved` sits beside `engine` and
         `coverage` — a statement about THAT run, for a reader, never an input to the replay. */
      if (res.resolved && typeof res.resolved === 'object') {
        const rv = clone(res.resolved);
        if (rv) prov.resolved = rv;
      }
      /* (#R759) 取得の陳述は、演算をまたいでも落ちない。See inheritCoverage — null when no input ever
         said anything, which is the state every record made from an imported file is in. */
      const cov = inheritCoverage(ds, res.stats, decl.id);
      if (cov) prov.coverage = cov;
      const grid = rasterOutTime(ds, R, res.shapeOnly);
      /* The inputs' own epochs, recorded whenever more than one grid contributed samples — including
         (especially) when they could not be combined into a span. */
      if (grid.stated.length > 1) prov.inputTimes = grid.stated;
      const statements = fieldStatements(ds, res.renamed, res.units, decl.id);
      let rec;
      try {
        if (res.raster) {
          /* ⚠ A GRID RESULT IS REGISTERED AS A GRID, AND ITS RECIPE IS THE SAME SHAPE (#R735). That is
             the whole reason the raster kind went into the registry rather than into a side table: the
             output of rasterMask is the input of zonal, and a changed threshold is one setParams. The
             record's own time is the input's — masking a grid does not move it in time. */
          rec = R.add({
            kind: 'raster', id: step.id, title: title,
            width: res.raster.width, height: res.raster.height, grid: res.raster.grid,
            bands: res.raster.bands, read: res.raster.read,
            /* (#R759) 全部の格子の時点。See rasterOutTime: one grid keeps its own, two that agree keep
               it, two that differ become the span they bracket, and one that never said becomes null
               rather than the other one's date. */
            time: grid.time,
            sourceCrs: ds[0].sourceCrs || null,
            provenance: prov,
          });
        } else {
          rec = R.add({
            id: step.id, title: title, features: res.features,
            /* An op's output carries the time axis of its input: 「1889 年の行」 is still stamped 1889
               after a clip, and dropping the declaration would make the next timeWindow in the chain
               refuse a dataset that plainly has times in it.
               ⚠ EXCEPT A PER-POSITION AXIS ACROSS AN OP THAT REMAKES THE GEOMETRY. A buffer of a trace
               is a polygon; its 4,000 timestamps describe fixes that polygon no longer has, so the
               declaration is not carried — it would be a claim about positions that do not exist. The
               attribute-based shapes (instant, interval, constant) survive, because the properties do.
               ⚠ AND IT IS RE-VERIFIED ON THE WAY IN (js/gis-datasets.js declareTime): an op that
               dropped the parallel array is told rather than believed. */
            time: outTime(ds[0], decl),
            /* (#R759) 単位は測れないので、名前が残った列については入力の陳述が著者ごと運ばれる。
               See fieldStatements. */
            fieldStatements: statements,
            provenance: prov,
          });
        }
      } catch (e) {
        return fail('id-in-use', { id: step.id == null ? null : String(step.id) });
      }
      return res.stats ? { ok: true, dataset: rec, stats: res.stats } : { ok: true, dataset: rec };
    }

    /* ══ WHICH IMPLEMENTATION COMPUTED THIS (#R749) ═══════════════════════════════════════════════
       js/gis-project.js saves a derived dataset as its RECIPE — op, inputs, params — and recomputes
       it on load, because a recipe replays and a stored answer goes stale the moment its input
       changes (docs/GIS-CORE.md §4). That is right, and it has a consequence nobody was stating:
       ⚠ THE SAME RECIPE IS NOT THE SAME ANSWER ACROSS IMPLEMENTATIONS. #R743 changed what `union`
       and the distance prefilter RETURN — disjoint parts had been dropped, and true pairs off the
       equator had been discarded before the distance was measured. A project saved the week before
       reopens today with different numbers in it, and nothing in the record said so.
       So a record made here carries the version of the thing that made it, and js/gis-project.js
       reports 「同じ」「違う」「測れなかった」 as three states rather than assuming the first.

       ⚠ THIS NUMBER IS A CLAIM, AND A CLAIM NEEDS A KEEPER. A hand-maintained version drifts the
       first time someone edits the kernel and forgets it — so tests/r749-gis-raster-pipeline-checks
       holds the sha256 of this file beside the version it declared, and fails when the bytes moved
       and the version did not. Raise it whenever an edit here can change an ANSWER (a different
       result, a different refusal); a comment or a rename moves the hash, and the recorded hash is
       updated with the version left alone. scripts/gis-kernel-versions.mjs is the ledger. */
    /* ⚠ (#R756) ops-1 → ops-2 BECAUSE A SAVED RECIPE NOW REPLAYS TO A DIFFERENT GRID. `rasterize`
       burned the whole bounding box of every point, line and Multi geometry — a diagonal across a
       16 × 16 lattice lit all 256 cells — and now burns the cells the feature actually touches. A
       project saved last week reopens with different pixels in it, which is precisely the fact this
       version exists to announce. (The ctx handover and the surface declarations do not change an
       answer; the rasterize rule does, and one changed answer is enough.) */
    /* ⚠ (#R783) ops-6 → ops-7 BECAUSE A REFUSAL MOVED. Four ops are new and cannot change an old
       recipe — but `aggregate` grew `areaWeightedMean`, so a step that named it was refused with
       `bad-param` last week and computes a number today, and `aggregate` / `zonal` now REFUSE a
       declared quantity whose aggregation js/gis-units.js says means nothing (`aggregation-refused`,
       `aggregation-needs-weight`). ⚠ A run that declares no quantity is unchanged to the bit — no
       value, no column, no refusal — which is the condition on adding this at all; what moved is
       what the layer does when somebody DOES declare one. */
    /* ⚠ (#R783) RAISED TO ops-8, and the ledger's question is the one to answer: does this edit
       change an ANSWER? ⑴ A recipe that states no `tolerance` and no `surface` replays to the same
       numbers, bit for bit — the geodesic default is still areaKm2 / lengthKm and the plane's number
       is still what js/gis-crs.js's areaOn / lengthOn returns, with no certificate computed behind
       the caller's back. ⑵ But a recipe that states a `tolerance` the measured envelope cannot meet
       now replays to `crs-accuracy-outside-tolerance` where ops-7 produced a column of numbers, and
       one that states `surface: 'ellipsoid'` measures on WGS 84 where ops-7 answered `bad-param`.
       「拒否が答えになった」 and its mirror are exactly the changes a saved project must be able to
       see. The keeper is scripts/gis-kernel-versions.mjs. */
    const KERNEL_VERSION = 'ops-8';
    const API = {
      /* The implementation a saved recipe replays through (see KERNEL_VERSION above). */
      version: () => KERNEL_VERSION,
      /* ⚠ (#R752) THE CLONE IS RESOLVED ON THE WAY OUT. A `valuesOf` parameter carries no `values`
         in DECL — the set belongs to a kernel that may not have mounted when this factory ran — so
         it is filled here, at the moment a panel or a planner asks what exists. A kernel that is not
         mounted leaves `values` ABSENT rather than empty: 「訊けなかった」 and 「選べる値は無い」 are
         different statements, and a UI that draws an empty dropdown for the first one is lying. */
      ops: () => ORDER.map((id) => {
        const d = declOut(id);
        for (const p of (d.params || [])) {
          if (!p.valuesOf || Array.isArray(p.values)) continue;
          const v = paramValues(DECL[id], p.name);
          if (v) p.values = v.slice();
        }
        return d;
      }),
      op: (id) => (DECL[id] ? declOut(id) : null),
      run: run,
      /* exposed because the panel labels a clipped shape with its area and the checks measure the
         same number the ops wrote — one implementation, asked by both */
      areaKm2: areaKm2,
      pointInPolygon: pointInPolygon,
      /* The spatial relations relate offers, so a caller can present them without repeating them. */
      predicates: () => RELATE_PREDICATES.slice(),
      /* (#R756) The closed vocabulary every op's `surface` is drawn from — handed out so a reader,
         a panel and the checks all ask the same question of the same list. */
      surfaces: () => surfaceVocab(),
    };
    try { window.IntMapGisOps = API; } catch (_) { }
    return API;
  })();
}
