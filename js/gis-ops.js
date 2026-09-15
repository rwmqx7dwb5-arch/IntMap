/* ============================================================================
 *  IntMap · THE OPS — window.IntMapGisOps   (#R729)
 * ----------------------------------------------------------------------------
 *  js/gis-datasets.js made 「データセット」 one thing whatever produced it. This file is the reason
 *  that mattered: AN OP'S OUTPUT IS REGISTERED THE SAME WAY AN IMPORT IS, so it is the input of the
 *  next op with no special case. 「5km バッファ」→「その中の地震だけ」→「県ごとに数える」 is three
 *  registrations, not one hard-coded pipeline, and the chain is re-runnable because every step
 *  writes {kind:'op', op, inputs, params} as its provenance — the recipe, not a label.
 *
 *  ══ WHAT THIS FILE MEASURES, AND WHAT IT REFUSES ══════════════════════════════════════════════
 *  Four ops: filter, buffer, clip, aggregate. Each DECLARES its inputs, the geometry each input
 *  must be, and its parameters; ops() is the only thing a panel reads. A UI that carried its own
 *  list of 「buffer は半径を聞く」 would be the hand-written list .agents/rules/no-ad-hoc-hardcoding.md
 *  forbids — it decides for the ops that exist today and silently omits the fifth one. (#R725 is the
 *  round that made the work list read the capability's own declared arguments for the same reason.)
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES. { ok:false, why, detail } — the nine languages live at the
 *  call site, exactly as js/geo-import.js does it. This module has no business knowing what UI it
 *  is in, and a sentence baked in here would be an English-only sentence.
 *
 *  ⚠ AND IT REALLY REFUSES, RATHER THAN DRAWING SOMETHING PLAUSIBLE.
 *    · A buffer of a line or a polygon is NOT implemented. An offset curve with correct joins,
 *      mitre limits and self-intersection removal is a different piece of work; approximating it
 *      with per-vertex disks would put a bumpy bead on the map and call it 「5km 圏」. Refused by
 *      name (`buffer-needs-points`) — CONSTITUTION.md: no 偽物, no ハリボテ.
 *    · clip is Sutherland–Hodgman, WHICH IS ONLY CORRECT FOR A CONVEX WINDOW. So the convexity of
 *      every clipper ring is MEASURED (the sign of the cross product must be consistent all the way
 *      round) and a window that fails is refused. 「buffer の出力だから凸のはず」 is an assumption,
 *      and an assumption about the shape of someone else's data is the thing that breaks silently:
 *      diskFillPolys returns a polar cap or a world-minus-hole for a big enough radius, and neither
 *      of those is convex. They are refused for what they are, not waved through for where they
 *      came from.
 *
 *  ══ THE PLANE THIS ARITHMETIC HAPPENS ON ═══════════════════════════════════════════════════════
 *  Sutherland–Hodgman and the ray cast are PLANAR, on raw lng/lat degrees (plate carrée). That is
 *  a deliberate choice and it has two consequences that are handled rather than hoped about:
 *
 *    ① THE ANTIMERIDIAN. In that plane a shape spanning the seam is two shapes, and a ring whose
 *       longitudes run 170 → -170 is read as a 340° sweep the wrong way round the world. There is
 *       no repair that does not guess which side the reader meant, so a clipper ring whose longitude
 *       span exceeds 180° is REFUSED (`clip-window-crosses-antimeridian`). A buffer never trips it:
 *       IntMapGeodesy.diskFillPolys already splits its disks at the seam, and each returned piece
 *       stays inside one 360° window.
 *    ② THE POLES. A cap around a pole has no single longitude for its apex; the ring
 *       diskFillPolys emits for it runs the full width of the window, so its longitude span is 360°
 *       and it is caught by exactly the same measurement as ①. Nothing special-cases the pole,
 *       because the pole is not a special case here — it is a ring that cannot be a simple ring in
 *       this plane, which is what the span already says.
 *
 *  AREA IS NOT PLANAR. `areaKm2` is the spherical excess (Chamberlain–Duquette), outer rings added
 *  and holes subtracted, on IntMapGeodesy._R_EARTH_KM — the one radius the rest of the app uses. A
 *  planar degree area would be wrong by cos φ, i.e. by half at 60°, which is most of Europe. It
 *  reads a ring in the SAME window the clip does; see the note on ringAreaKm2 for the measurement
 *  that forced that (a polar buffer whose area came back as the rest of the planet).
 *
 *  ⚠ ONE SUTHERLAND–HODGMAN LIMIT, STATED RATHER THAN HIDDEN: when the true intersection of a
 *  concave subject with the convex window is SEVERAL disjoint pieces, S-H returns one ring in which
 *  those pieces are joined by zero-width links along the window boundary. The set of points is
 *  right and so is the area; the ring is not simple. Splitting it needs a full polygon-clipping
 *  engine (Vatti/Greiner–Hormann), which is not what this round built.
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
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }

    const D2R = Math.PI / 180;

    /* Two vertices are the same vertex below this. 1e-12° ≈ 0.1 µm at the equator — far below any
       coordinate the importers can produce (a float64 degree resolves ~1e-13° near ±180) and far
       below the 2 km tolerance of the coarsest geometry the app ships. Expires if coordinates ever
       stop being float64 degrees. */
    const SAME_EPS = 1e-12;
    /* A turn this small is not a turn. The cross product of two edges is in deg²; 1e-12 deg² is a
       triangle of about 1.2e-2 m² (111,320 m per degree, squared) — 6 mm on a side. Collinear
       vertices, which every simplifier and every clipper emits, must not decide convexity. */
    const TURN_EPS = 1e-12;
    /* Parallel-edge guard for the segment clip: |cross| in deg² per unit parameter. Same scale. */
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

    function closeRing(pts) { return pts.length ? pts.concat([[pts[0][0], pts[0][1]]]) : pts; }

    /* Planar signed area, in deg². Used ONLY for orientation (which way round the window runs) —
       never as an area, which is what areaKm2 is for. */
    function signedAreaDeg(pts) {
      let s = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
      return s / 2;
    }

    /* The longitude span of a ring in the plane the clip happens in. > 180° means the ring either
       crosses the seam or wraps a pole, and in both cases the planar reading of it is not the shape
       the author meant. See ① and ② in the header. */
    function lonSpan(pts) {
      let mn = Infinity, mx = -Infinity;
      for (const p of pts) { if (p[0] < mn) mn = p[0]; if (p[0] > mx) mx = p[0]; }
      return (mn === Infinity) ? 0 : (mx - mn);
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
       not in this window at all; that is the same lonSpan > 180 property clip refuses, and its area
       is not defined here. */
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

    /* ── point in polygon: ray casting, planar ────────────────────────────────────────────────── */

    /* The crossing-number rule with the half-open comparison (yi > y) !== (yj > y): a vertex exactly
       at the test latitude is counted once, not twice, which is what stops a point level with a
       vertex from reading as outside. */
    function pointInRing(x, y, pts) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }

    /* Inside the outer ring and inside NO hole. A polygon with holes whose holes were ignored would
       count every point in the lake as being on the land. */
    function pointInRings(x, y, rings) {
      if (!Array.isArray(rings) || !rings.length) return false;
      if (!pointInRing(x, y, ringPositions(rings[0]))) return false;
      for (let i = 1; i < rings.length; i++) if (pointInRing(x, y, ringPositions(rings[i]))) return false;
      return true;
    }

    /* Public. Accepts a Polygon or a MultiPolygon geometry; anything else has no interior. */
    function pointInPolygon(lngLat, geometry) {
      if (!isPos(lngLat) || !geometry) return false;
      const x = lngLat[0], y = lngLat[1];
      if (geometry.type === 'Polygon') return pointInRings(x, y, geometry.coordinates);
      if (geometry.type === 'MultiPolygon') {
        for (const poly of (geometry.coordinates || [])) if (pointInRings(x, y, poly)) return true;
      }
      return false;
    }

    /* ── convexity, measured ──────────────────────────────────────────────────────────────────── */

    /* Every turn round the ring must have the same sign. Zero turns (collinear runs) abstain rather
       than vote — a simplified coastline is full of them and they say nothing about convexity.
       A ring with no non-zero turn at all is degenerate (a line or a point) and is not a window. */
    function ringIsConvex(pts) {
      if (pts.length < 3) return false;
      let sign = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cr) <= TURN_EPS) continue;
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
      }
      return sign !== 0;
    }

    /* ── Sutherland–Hodgman against one convex window ring (counter-clockwise) ────────────────── */

    function ccw(pts) { return signedAreaDeg(pts) < 0 ? pts.slice().reverse() : pts; }

    /* Signed distance-ish: > 0 strictly left of a→b. With the window run counter-clockwise, "left of
       every edge" is "inside", and >= 0 puts the boundary itself inside — a feature that exactly
       touches the clip window is kept, which is the answer a reader expects from 「この範囲の中」. */
    function leftOf(a, b, p) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); }

    function clipRingByConvex(subject, win) {
      let out = subject;
      for (let e = 0; e < win.length && out.length; e++) {
        const a = win[e], b = win[(e + 1) % win.length];
        const next = [];
        for (let k = 0; k < out.length; k++) {
          const c = out[k], d = out[(k + 1) % out.length];
          const fc = leftOf(a, b, c), fd = leftOf(a, b, d);
          const ci = fc >= 0, di = fd >= 0;
          if (ci) next.push(c);
          if (ci !== di) {
            const den = fc - fd;
            if (Math.abs(den) > 0) { const t = fc / den; next.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]); }
          }
        }
        out = next;
      }
      /* Collapse the zero-length edges the cuts leave behind, then drop what is no longer a ring. */
      const tidy = [];
      for (const p of out) { if (tidy.length && same(tidy[tidy.length - 1], p)) continue; tidy.push(p); }
      while (tidy.length > 1 && same(tidy[0], tidy[tidy.length - 1])) tidy.pop();
      return tidy.length >= 3 ? tidy : [];
    }

    /* The convex-window analogue for a segment: the intersection of the parameter intervals each
       edge allows. Because the window is convex, that intersection is ONE interval — which is why
       the convexity is measured before any of this runs. */
    function clipSegmentByConvex(p0, p1, win) {
      let tIn = 0, tOut = 1;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      for (let e = 0; e < win.length; e++) {
        const a = win[e], b = win[(e + 1) % win.length];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const c0 = ex * (p0[1] - a[1]) - ey * (p0[0] - a[0]);   /* leftOf(a,b,p0) */
        const cd = ex * dy - ey * dx;                            /* d/dt of the above */
        if (Math.abs(cd) <= PARALLEL_EPS) { if (c0 < 0) return null; continue; }
        const t = -c0 / cd;
        if (cd > 0) { if (t > tIn) tIn = t; } else { if (t < tOut) tOut = t; }
        if (tIn > tOut) return null;
      }
      return [tIn, tOut];
    }

    /* A line becomes the runs of it that are inside. Consecutive segments that both start inside are
       joined, so a line crossing the window once comes out as one LineString rather than as one per
       input segment. */
    function clipLineByConvex(coords, win) {
      const runs = [];
      let cur = null;
      for (let i = 0; i + 1 < coords.length; i++) {
        const p0 = coords[i], p1 = coords[i + 1];
        const r = clipSegmentByConvex(p0, p1, win);
        if (!r) { cur = null; continue; }
        const q0 = [p0[0] + (p1[0] - p0[0]) * r[0], p0[1] + (p1[1] - p0[1]) * r[0]];
        const q1 = [p0[0] + (p1[0] - p0[0]) * r[1], p0[1] + (p1[1] - p0[1]) * r[1]];
        if (cur && r[0] <= 0 && same(cur[cur.length - 1], q0)) { if (!same(cur[cur.length - 1], q1)) cur.push(q1); }
        else { cur = [q0, q1]; runs.push(cur); }
        if (r[1] < 1) cur = null;                                /* it left the window inside this segment */
      }
      return runs.filter((r) => r.length >= 2 && !(r.length === 2 && same(r[0], r[1])));
    }

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
        id: 'buffer', inputs: 1, accepts: ['Point'], output: 'Polygon',
        mismatchWhy: 'buffer-needs-points', needsGeodesy: true,
        params: [
          { name: 'radiusKm', type: 'number', required: true, unit: 'km' },
          { name: 'steps', type: 'number', required: false, default: 64 },
        ],
      },
      clip: {
        id: 'clip', inputs: 2, accepts: ['any', 'Polygon'], output: 'same-as-input',
        needsGeodesy: true, params: [],
      },
      aggregate: {
        id: 'aggregate', inputs: 2, accepts: ['Polygon', 'Point'], output: 'Polygon',
        needsGeodesy: true,
        params: [
          { name: 'stat', type: 'enum', required: true, default: 'count', values: ['count', 'sum', 'mean', 'min', 'max'] },
          { name: 'field', type: 'field', required: false, input: 1, requiredWhen: { stat: ['sum', 'mean', 'min', 'max'] } },
          { name: 'outName', type: 'text', required: false },
        ],
      },
    };
    const ORDER = ['filter', 'buffer', 'clip', 'aggregate'];

    function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (_) { return null; } }

    /* ── the runners ──────────────────────────────────────────────────────────────────────────── */

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }

    function hasField(ds, name) {
      for (const f of (ds.fields || [])) if (f && f.name === name) return true;
      return false;
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
      const G = geodesy();
      const radius = R.asNumber(params.radiusKm);
      if (radius == null) return fail('missing-param', { param: 'radiusKm' });
      if (!(radius > 0)) return fail('bad-param', { param: 'radiusKm', value: params.radiusKm });
      let steps = (params.steps == null) ? 64 : R.asNumber(params.steps);
      if (steps == null) return fail('bad-param', { param: 'steps', value: params.steps });
      steps = Math.round(steps);
      if (steps < STEPS_MIN || steps > STEPS_MAX) return fail('bad-param', { param: 'steps', value: steps, min: STEPS_MIN, max: STEPS_MAX });
      const out = [];
      for (const f of ds.features()) {
        const pts = pointsOf(f && f.geometry);
        /* One output feature PER POSITION. A MultiPoint's disks overlap as soon as two of its points
           are within 2r of each other, and folding them into one MultiPolygon would make a shape
           whose area double-counts the overlap. Unioning them is polygon clipping, which this round
           did not build — so the parts stay separate and say which part they are. */
        for (let i = 0; i < pts.length; i++) {
          const polys = G.diskFillPolys([pts[i][0], pts[i][1]], radius, steps);
          if (!Array.isArray(polys) || !polys.length) continue;
          const g = polyGeometry(polys);
          if (!g) continue;
          const extra = { _bufferKm: radius };
          if (pts.length > 1) extra._bufferPart = i;
          out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
        }
      }
      return { ok: true, features: out };
    }

    function runClip(subject, clipper) {
      /* ① collect the windows and MEASURE each one before anything is cut. */
      const windows = [];
      const clipFeats = clipper.features();
      for (let fi = 0; fi < clipFeats.length; fi++) {
        const f = clipFeats[fi];
        const id = (f && f.id != null) ? f.id : fi;
        const polys = polygonsOf(f && f.geometry);
        for (let pi = 0; pi < polys.length; pi++) {
          const rings = polys[pi];
          /* A window with a hole is not convex by construction, and Sutherland–Hodgman has no
             notion of a hole in the clipper. Named for what it is rather than silently ignored. */
          if (Array.isArray(rings) && rings.length > 1) return fail('clip-window-not-convex', { ring: 1, feature: fi });
          const pts = ringPositions(rings && rings[0]);
          if (pts.length < 3) continue;
          if (lonSpan(pts) > 180) return fail('clip-window-crosses-antimeridian', { ring: 0, feature: fi, span: lonSpan(pts) });
          if (!ringIsConvex(pts)) return fail('clip-window-not-convex', { ring: 0, feature: fi });
          windows.push({ id: id, pts: ccw(pts) });
        }
      }
      if (!windows.length) return fail('no-clip-polygons');

      /* ② cut. One output feature per (subject feature × window) that actually intersects. */
      const out = [];
      for (const f of subject.features()) {
        const g = f && f.geometry;
        const base = props(f);
        for (const w of windows) {
          const polys = polygonsOf(g);
          if (polys.length) {
            const kept = [];
            for (const rings of polys) {
              const outer = clipRingByConvex(ringPositions(rings[0]), w.pts);
              if (outer.length < 3) continue;
              const cut = [closeRing(outer)];
              for (let h = 1; h < rings.length; h++) {
                const hole = clipRingByConvex(ringPositions(rings[h]), w.pts);
                if (hole.length >= 3) cut.push(closeRing(hole));
              }
              kept.push(cut);
            }
            const gg = polyGeometry(kept);
            if (gg) out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id, _areaKm2: areaKm2(gg) }), geometry: gg });
            continue;
          }
          const lines = linesOf(g);
          if (lines.length) {
            const kept = [];
            for (const line of lines) {
              const coords = line.filter(isPos);
              for (const run of clipLineByConvex(coords, w.pts)) kept.push(run);
            }
            const gg = lineGeometry(kept);
            if (gg) out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
            continue;
          }
          const pts = pointsOf(g);
          if (pts.length) {
            const kept = pts.filter((p) => pointInRing(p[0], p[1], w.pts));
            if (!kept.length) continue;
            const gg = (kept.length === 1 && g.type === 'Point')
              ? { type: 'Point', coordinates: kept[0] }
              : { type: 'MultiPoint', coordinates: kept };
            out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
          }
        }
      }
      return { ok: true, features: out };
    }

    function runAggregate(polyDs, pointDs, params, R) {
      const stat = (params.stat == null) ? 'count' : String(params.stat);
      const allowed = DECL.aggregate.params[0].values;
      if (allowed.indexOf(stat) < 0) return fail('bad-param', { param: 'stat', value: stat, values: allowed });
      const field = (params.field == null) ? null : String(params.field);
      if (stat !== 'count') {
        if (!field) return fail('missing-param', { param: 'field' });
        if (!hasField(pointDs, field)) return fail('unknown-field', { field: field });
      }
      const outName = (params.outName != null && String(params.outName).trim() !== '')
        ? String(params.outName).trim()
        : (stat === 'count' ? 'count' : stat + '_' + field);
      /* Writing over a column the polygons already carry would destroy data the reader imported,
         and doing it silently would make the loss invisible until the next op read the wrong column. */
      if (hasField(polyDs, outName)) return fail('output-column-in-use', { name: outName });

      /* The points are read once into (position, value) so a 50,000-point dataset is not walked
         through its geometry accessors once per polygon. */
      const pts = [];
      for (const f of pointDs.features()) {
        const p = props(f);
        for (const pos of pointsOf(f && f.geometry)) pts.push({ pos: pos, raw: (field ? p[field] : null) });
      }

      const out = [];
      for (const f of polyDs.features()) {
        const g = f && f.geometry;
        const polys = polygonsOf(g);
        if (!polys.length) continue;
        let n = 0, skipped = 0, sum = 0, min = null, max = null;
        for (const pt of pts) {
          let hit = false;
          for (const rings of polys) { if (pointInRings(pt.pos[0], pt.pos[1], rings)) { hit = true; break; } }
          if (!hit) continue;
          n++;
          if (stat === 'count') continue;
          const v = R.asNumber(pt.raw);
          /* ⚠ A point inside the polygon whose value cannot be a number is COUNTED AS SKIPPED, not
             dropped in silence. A mean over 12 of 400 points is not the mean the reader asked for,
             and `_statSkipped` is the only thing that can tell them so. */
          if (v == null) { skipped++; continue; }
          sum += v;
          if (min == null || v < min) min = v;
          if (max == null || v > max) max = v;
        }
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
      return { ok: true, features: out };
    }

    /* ── run ──────────────────────────────────────────────────────────────────────────────────── */

    /* async because a later op (a raster read, a network join) will be, and a caller written against
       a synchronous return today would have to be rewritten then. Nothing here awaits. */
    async function run(step) {
      const R = registry();
      if (!R) return fail('registry-missing');
      const decl = DECL[step && step.op];
      if (!decl) return fail('op-unknown', { op: (step && step.op) == null ? null : String(step.op) });
      if (decl.needsGeodesy && (!geodesy() || earthKm() == null)) return fail('geodesy-missing');

      const inputs = Array.isArray(step.inputs) ? step.inputs.slice() : [];
      if (inputs.length !== decl.inputs) return fail('input-count', { expected: decl.inputs, got: inputs.length });
      const ds = [];
      for (const id of inputs) { const rec = R.get(id); if (!rec) return fail('input-missing', { id: id == null ? null : String(id) }); ds.push(rec); }

      /* The geometry contract is checked against the dataset's MEASURED geometryType (Multi* already
         folded into its singular, 'Mixed' when the features disagree). An op that needs one kind
         refuses a mixed dataset by name instead of quietly working on the part it recognises. */
      for (let i = 0; i < ds.length; i++) {
        const acc = decl.accepts[i];
        if (acc === 'any') continue;
        if (ds[i].geometryType !== acc) {
          return fail(decl.mismatchWhy || 'geometry-type', { input: i, expected: acc, geometryType: ds[i].geometryType });
        }
      }

      const params = (step.params && typeof step.params === 'object') ? step.params : {};
      let res;
      if (decl.id === 'filter') res = runFilter(ds[0], params, R);
      else if (decl.id === 'buffer') res = runBuffer(ds[0], params, R);
      else if (decl.id === 'clip') res = runClip(ds[0], ds[1]);
      else res = runAggregate(ds[0], ds[1], params, R);
      if (!res || !res.ok) return res || fail('op-unknown', { op: decl.id });

      /* The title is an identifier, not a sentence: op(input, input). Nothing here composes prose,
         because prose here would be prose in one language. */
      const title = (step.title != null && String(step.title).trim() !== '')
        ? String(step.title)
        : decl.id + '(' + ds.map((d) => d.title).join(', ') + ')';
      const recorded = clone(params);
      if (recorded == null) return fail('bad-param', { param: 'params' });

      let rec;
      try {
        rec = R.add({
          id: step.id,
          title: title,
          features: res.features,
          /* THE RECIPE. js/gis-project.js replays exactly this, which is why the params written here
             are the params that ran, cloned — a caller mutating its own object afterwards must not
             be able to rewrite history. */
          provenance: { kind: 'op', op: decl.id, inputs: inputs, params: recorded },
        });
      } catch (e) {
        return fail('id-in-use', { id: step.id == null ? null : String(step.id) });
      }
      return { ok: true, dataset: rec };
    }

    const API = {
      ops: () => ORDER.map((id) => clone(DECL[id])),
      op: (id) => (DECL[id] ? clone(DECL[id]) : null),
      run: run,
      /* exposed because the panel labels a clipped shape with its area and the checks measure the
         same number the ops wrote — one implementation, asked by both */
      areaKm2: areaKm2,
      pointInPolygon: pointInPolygon,
    };
    try { window.IntMapGisOps = API; } catch (_) { }
    return API;
  })();
}
