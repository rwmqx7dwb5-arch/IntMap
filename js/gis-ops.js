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
    /* (#R735) The grid arithmetic and the spatial index, asked the same way and for the same reason. */
    function rasterKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisRaster) || null; } catch (_) { return null; } }
    function indexKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisIndex) || null; } catch (_) { return null; } }
    /* (#R738) The expression kernel, read at call time like every other one — a module that imported
       it privately would be a second copy of a parser, and js/gis-core.js is the only mounting point. */
    function exprKernel() { try { return (typeof window !== 'undefined' && window.IntMapGisExpr) || null; } catch (_) { return null; } }
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
       For any ring whose longitude span is ≤ 180° the two readings are identical (no edge can exceed
       180°), so nothing else changes. A ring that states a seam crossing by jumping 170 → −170 is
       not in this window at all; a ring whose longitude span exceeds 180° is not in this
       window, and its area is not defined here. js/gis-geometry.js unwraps such a ring before it
       does anything with it, and hands back pieces that each sit in one window. */
    function ringAreaKm2(ring) {
      const R = earthKm();
      if (R == null) return null;
      const pts = ringPositions(ring);
      if (pts.length < 3) return 0;
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
        id: 'filter', inputs: 1, accepts: ['any'], output: 'same-as-input',
        params: [{ name: 'where', type: 'conditions', required: true, input: 0, ops: CONDITION_OPS }],
      },
      buffer: {
        /* ⚠ `accepts:['Point']` UNTIL #R732. The refusal was honest — there was no offset curve —
           but it is not honest any more: js/gis-geometry.js builds the Minkowski sum of ANY
           geometry with a geodesic disk, which is what a buffer is. `buffer-needs-points` is
           therefore gone, and so is the mismatchWhy that named it. */
        id: 'buffer', inputs: 1, accepts: ['any'], output: 'Polygon',
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
        id: 'clip', inputs: 2, accepts: ['any', 'Polygon'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      intersect: {
        id: 'intersect', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      difference: {
        id: 'difference', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      union: {
        id: 'union', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      dissolve: {
        /* One shape per group, boundaries between members removed. `by` absent means ONE group —
           the whole dataset — which is the 「全部まとめる」 a reader means by dissolve with no
           column named. */
        id: 'dissolve', inputs: 1, accepts: ['Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [{ name: 'by', type: 'field', required: false, input: 0 }],
      },
      relate: {
        /* The spatial WHERE: keep the features of input 0 that stand in `predicate` to ANY feature
           of input 1. ⚠ `nearer-than` measures from the SHAPES, not from their centres — which is
           the whole of 「道路そのものからの距離」 and the thing a bounding-box centre cannot answer. */
        id: 'relate', inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
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
        id: 'sample', inputs: 2, accepts: ['Point', 'any'], kinds: ['vector', 'raster'], output: 'same-as-input',
        needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 1 },
          { name: 'method', type: 'enum', required: false, default: 'nearest', values: ['nearest', 'bilinear'] },
          { name: 'outName', type: 'text', required: false },
        ],
      },
      zonal: {
        /* 区域内集計 over a grid — 「この区域の人口」「区域内の標高分布」「土地被覆ごとの面積」 as one
           op rather than three features of the app. `classes` is the last of those: the area of each
           distinct value, which only means anything for a grid of codes, so it refuses a grid of
           measurements by name instead of rounding them into classes. */
        id: 'zonal', inputs: 2, accepts: ['Polygon', 'any'], kinds: ['vector', 'raster'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, needsRaster: true,
        params: [
          { name: 'band', type: 'field', required: false, input: 1 },
          { name: 'stat', type: 'enum', required: true, default: 'mean', values: ['mean', 'sum', 'min', 'max', 'count', 'classes'] },
          { name: 'outName', type: 'text', required: false },
        ],
      },
      rasterMask: {
        /* 条件による抽出: the same grid with everything that fails the test turned into a void.
           ⚠ The operator list is CONDITION_OPS minus the one that has no meaning for numbers, derived
           rather than retyped — a tenth comparison added to the filter arrives here too. */
        id: 'rasterMask', inputs: 1, accepts: ['any'], kinds: ['raster'], output: 'raster',
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
        id: 'rasterDiff', inputs: 2, accepts: ['any', 'any'], kinds: ['raster', 'raster'], output: 'raster',
        needsRaster: true,
        params: [{ name: 'band', type: 'field', required: false, input: 0 }],
      },
      timeWindow: {
        /* ⚠ THE TIME AXIS IS THE DATASET'S, NOT A COLUMN NAME TYPED HERE (#R735). js/gis-datasets.js
           holds a VERIFIED declaration — an instant, a span, or one timestamp per position — so this
           op works the same on a table of events, a table of reigns and a GPS trace, and a dataset
           that never declared one is refused by name instead of being filtered on a guess.
           ⚠ For a trace the window CUTS rather than selects: 「17 時台に通った区間」 is a piece of the
           line, not the whole ride, and returning the whole feature because one of its 4,000 fixes is
           inside would answer a question nobody asked. */
        id: 'timeWindow', inputs: 1, accepts: ['any'], output: 'same-as-input',
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
        id: 'join', inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
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
      compute: {
        /* A new column from an expression over the existing ones. ⚠ The expression is PARSED, never
           evaluated as JavaScript (js/gis-expr.js), and the columns it names are checked against the
           dataset the same way filter checks a condition's field — an expression over a column that is
           not there must be refused, not answered with a column of nulls. */
        id: 'compute', inputs: 1, accepts: ['any'], output: 'same-as-input',
        needsExpr: true,
        params: [
          { name: 'outName', type: 'text', required: true },
          { name: 'expr', type: 'expression', required: true, input: 0 },
          { name: 'replace', type: 'boolean', required: false, default: false },
        ],
      },
      aggregate: {
        /* ⚠ `accepts[1]` WAS 'Point' (#R729) and the arithmetic was 「面に含まれる点」. With a real
           predicate available it is 「その面に重なるもの」, which is the same answer for points and
           the right one for the roads and parcels a reader actually has. */
        id: 'aggregate', inputs: 2, accepts: ['Polygon', 'any'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'stat', type: 'enum', required: true, default: 'count', values: ['count', 'sum', 'mean', 'min', 'max'] },
          { name: 'field', type: 'field', required: false, input: 1, requiredWhen: { stat: ['sum', 'mean', 'min', 'max'] } },
          { name: 'outName', type: 'text', required: false },
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

    /* ── the runners ──────────────────────────────────────────────────────────────────────────── */

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }

    /* ── how a long step stays interruptible (#R735) ───────────────────────────────────────────
       ⚠ A SYNCHRONOUS LOOP CANNOT BE CANCELLED, AND THAT IS NOT A LIMITATION OF THE UI. run() was
       already `async`, but every runner inside it was one uninterrupted loop: a 40,000-polygon
       aggregate held the single thread for its whole duration, so the map froze, no progress could be
       drawn, and an AbortSignal could not even be SET — the code that would set it does not run until
       the loop lets go. Offering a cancel button over that would be a control with no effect.

       So the two runners whose cost grows with the data yield, and the yield is where the signal is
       read. ⚠ THE UNIT IS TIME, NOT A COUNT. A chunk of 「1,000 polygons」 is 3 ms of one dataset and
       40 s of another — the number that matters is how long the thread has been held, and one frame
       at 60 Hz is what the renderer needs to stay alive. So elapsed milliseconds decide, and there is
       no per-dataset count to tune.
       ⚠ IT IS NOT A WORKER. The kernels this file calls (js/gis-geometry.js's sweep-line, the
       registry, the geodesy) all live on this thread; moving the loop alone would leave every call it
       makes behind. What a Worker would add is parallelism; what this adds is a thread that answers
       the reader — and 「止められる」 was the part that was missing. docs/GIS-CORE.md §6 says which of
       the two is still open. */
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

    function runJoin(left, right, params) {
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
      for (const f of left.features()) {
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
      return {
        ok: true, features: out,
        stats: { matched: matched, unmatched: unmatched, noKey: noKey, rightKeys: table.size, columns: wanted.length, unmatchedSample: missSample },
      };
    }

    function runCompute(ds, params, R) {
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

      const c = X.compile(src, R);
      if (!c || !c.ok) return fail(c && c.why ? c.why : 'expr-syntax', (c && c.detail) || null);

      const out = [];
      let errors = 0, empty = 0, firstError = null;
      for (const f of ds.features()) {
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
      return { ok: true, features: out, stats: { computed: out.length - empty, empty: empty, errors: errors, firstError: firstError, returns: parsed.returns } };
    }

    function runFilter(ds, params, R) {
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
      for (const f of ds.features()) {
        const p = props(f);
        let keep = true;
        for (const c of where) { if (!evalCondition(R, p[c.field], c.op, c.value)) { keep = false; break; } }
        if (keep) out.push(f);
      }
      /* 0 rows is an ANSWER: 「該当なし」 is what the data says, and failing here would make the
         reader unable to chain the empty result or see the count. */
      return { ok: true, features: out };
    }

    function runBuffer(ds, params, R) {
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
      for (const f of ds.features()) {
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

    function runDissolve(ds, params, R) {
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
      for (const grp of groups.values()) {
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
        members.push({ geometry: g, bbox: bboxOf(g), raw: (field ? props(f)[field] : null) });
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
          return true;
        });
        const used = n - skipped;
        let value;
        if (stat === 'count') value = n;
        else if (stat === 'sum') value = used ? sum : null;
        else if (stat === 'mean') value = used ? sum / used : null;
        else if (stat === 'min') value = min;
        else value = max;
        const extra = { _areaKm2: areaKm2(g) };
        extra[outName] = value;
        if (stat !== 'count') extra._statSkipped = skipped;
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      return withGeoStats({ ok: true, features: out }, led);
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
      const allowed = DECL.sample.params[1].values;
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
      const band = (rasDs.bands[b.index] || {});
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
        const z = RK.zonal(rasDs, b.index, g, (stat === 'classes') ? { classes: true } : null);
        /* ⚠ A ZONE THE KERNEL REFUSED IS NOT A ZONE WITH NO DATA. A ring that wraps the world, a
           degenerate polygon, a grid it could not read: each of those is a reason, and writing `null`
           into the column for it would put 「測れなかった」 and 「そこには何も無い」 in the same cell.
           The refusal stops the whole step, because a table where some rows silently mean something
           else is worse than a step the reader has to fix. */
        if (!z || !z.ok) return z || fail('zonal-failed');
        const extra = { _areaKm2: areaKm2(g), _gridAreaKm2: z.areaKm2, _valueAreaKm2: z.valueAreaKm2, _pixels: z.count, _pixelsNodata: z.nodataCount };
        if (stat === 'classes') {
          /* One column per distinct value is not a table shape a reader can join to; the map from
             value to km² is carried whole, under a name that says what it is. */
          extra[base] = z.classAreasKm2 || null;
        } else if (stat === 'count') extra[base] = z.count;
        else if (stat === 'sum') extra[base] = z.sum;
        else if (stat === 'mean') extra[base] = z.mean;
        else if (stat === 'min') extra[base] = z.min;
        else extra[base] = z.max;
        if (stat === 'sum') extra._sumTimesAreaKm2 = z.sumTimesAreaKm2;
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      return { ok: true, features: out };
    }

    function runRasterMask(rasDs, params, R) {
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
      const r = RK.mask(rasDs, b.index, { op: op, value: value });
      if (!r || !r.ok) return r || fail('mask-failed');
      return { ok: true, raster: r.raster, stats: { kept: r.kept, dropped: r.dropped, nodata: r.nodataCount } };
    }

    function runRasterDiff(aDs, bDs, params, R) {
      const RK = rasterKernel();
      const b = bandIndexOf(aDs, params.band);
      if (!b.ok) return b.res;
      const r = RK.diff(aDs, bDs, b.index);
      if (!r || !r.ok) return r || fail('diff-failed');
      return { ok: true, raster: r.raster, stats: { count: r.count, nodata: r.nodataCount } };
    }

    /* ── the time window (#R735) ────────────────────────────────────────────────────────────────
       Both ends are optional: 「1889 年以降」 is a window with no upper end, and refusing it would make
       the op answer a narrower question than the reader's. What is NOT optional is a declared axis. */
    function runTimeWindow(ds, params, R) {
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
      for (const f of ds.features()) {
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
      /* (#R735) `ctx` is how the two runners whose cost grows with the data stay interruptible and
         report where they are; see makeCtx. The others finish in one turn and are handed it anyway, so
         a runner that grows tomorrow has it already. */
      const ctx = makeCtx(opts);
      const RUN = {
        filter: () => runFilter(ds[0], params, R),
        buffer: () => runBuffer(ds[0], params, R),
        clip: () => runClip(ds[0], ds[1], ctx),
        intersect: () => runOverlay('intersect', ds[0], ds[1], ctx),
        difference: () => runOverlay('difference', ds[0], ds[1], ctx),
        union: () => runUnion(ds[0], ds[1], ctx),
        dissolve: () => runDissolve(ds[0], params, R),
        relate: () => runRelate(ds[0], ds[1], params, R, ctx),
        aggregate: () => runAggregate(ds[0], ds[1], params, R, ctx),
        sample: () => runSample(ds[0], ds[1], params, R, ctx),
        zonal: () => runZonal(ds[0], ds[1], params, R, ctx),
        rasterMask: () => runRasterMask(ds[0], params, R),
        rasterDiff: () => runRasterDiff(ds[0], ds[1], params, R),
        timeWindow: () => runTimeWindow(ds[0], params, R),
        join: () => runJoin(ds[0], ds[1], params),
        compute: () => runCompute(ds[0], params, R),
      };
      const runner = RUN[decl.id];
      if (!runner) return fail('op-not-wired', { op: decl.id });
      /* ⚠ AWAITED. Four of the runners are async now, and `res.ok` on an unawaited Promise is
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
            time: ds[0].time || null,
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
    const KERNEL_VERSION = 'ops-1';
    const API = {
      /* The implementation a saved recipe replays through (see KERNEL_VERSION above). */
      version: () => KERNEL_VERSION,
      ops: () => ORDER.map((id) => clone(DECL[id])),
      op: (id) => (DECL[id] ? clone(DECL[id]) : null),
      run: run,
      /* exposed because the panel labels a clipped shape with its area and the checks measure the
         same number the ops wrote — one implementation, asked by both */
      areaKm2: areaKm2,
      pointInPolygon: pointInPolygon,
      /* The spatial relations relate offers, so a caller can present them without repeating them. */
      predicates: () => RELATE_PREDICATES.slice(),
    };
    try { window.IntMapGisOps = API; } catch (_) { }
    return API;
  })();
}
