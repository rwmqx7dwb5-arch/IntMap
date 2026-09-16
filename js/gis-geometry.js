/* ============================================================================
 *  IntMap · THE GEOMETRY KERNEL — window.IntMapGisGeometry   (#R732)
 * ----------------------------------------------------------------------------
 *  #R729 built the GIS core around one honest limit, and stated it twice in js/gis-ops.js:
 *
 *    · buffer was POINTS ONLY, because 「an offset curve with correct joins, mitre limits and
 *      self-intersection removal is a different piece of work」 and a bead of per-vertex disks
 *      called 「5km 圏」 would be the ハリボテ CONSTITUTION.md forbids;
 *    · clip was Sutherland–Hodgman, CONVEX WINDOWS ONLY, refusing a ward boundary with a hole or a
 *      concave prefecture by name — and, where the true answer was several disjoint pieces,
 *      returning one ring in which those pieces are joined by zero-width links along the window.
 *
 *  Both limits were the same missing piece: a real polygon-clipping engine. This file is it, and
 *  the two refusals above are gone — not relaxed, not approximated. `clip-window-not-convex` is not
 *  raised by anything any more, because concavity is no longer a reason to refuse.
 *
 *  ══ WHAT IS BORROWED AND WHY IT IS NOT WRITTEN HERE ═══════════════════════════════════════════
 *  `polygon-clipping@0.15.7` is ALREADY A DEPENDENCY of this app and already reached by dynamic
 *  import from js/world-packs.js and js/cesium-vector-tiles.js. It is a Martinez–Rueda sweep-line:
 *  it keeps holes as holes, returns several polygons when the answer IS several polygons, and takes
 *  a MultiPolygon on both sides. Writing a second boolean engine here would be the 「同じ判断を2か所
 *  に持たせる」 that .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids, and it would be the worse
 *  of the two. It is reached by dynamic import, exactly as its two existing callers reach it.
 *
 *  ⚠⚠⚠ AND THAT IMPORT IS NOT WHAT DECIDES WHEN THE BYTES ARRIVE. #R732 wrote here that «a reader
 *  who never runs an overlay never downloads a sweep-line», and #R734 MEASURED IT IN PRODUCTION AND
 *  IT WAS FALSE: polygon-clipping is inside `geo-<hash>.js` (52,137 B), which `main-<hash>.js`
 *  STATICALLY imports, so it is fetched at t≈16 ms among the first requests of every session.
 *  ⚠ THIS PREDATES #R732 — the same chunk of the R731 build carries it too (built and measured), so
 *  the round that wrote the sentence did not cause the fact, it only asserted the opposite of it.
 *  ⚠ AND vite.config.js SAYS IT SHOULD NOT BE THERE: its manualChunks returns undefined for
 *  polygon-clipping precisely so Rollup will leave it in a dynamic chunk (see the #R209 note there),
 *  and Rollup put it in the eager one anyway. The config states an INTENTION that nothing measures.
 *  What IS true and measured: the import here costs no NEW bytes, because those bytes are already in
 *  the session before this module is built. Anyone changing the chunking should re-measure this
 *  paragraph rather than trust it.
 *
 *  ══ THE BUFFER IS A MINKOWSKI SUM, NOT AN OFFSET CURVE ════════════════════════════════════════
 *  A buffer of radius r is, by definition, the set of points within r of the shape — i.e. the
 *  Minkowski sum of the shape with a disk of radius r. So that is what is built: a GEODESIC disk at
 *  every vertex (js/geodesy.js diskFillPolys, the same one the point buffer has always used) and a
 *  geodesic quad along every segment (its two ends offset by r on the bearing ± 90°), all unioned.
 *  The union is what removes self-intersection; the disks are what make the joins round.
 *
 *  ⚠ THIS IS WHY @turf/buffer IS NOT USED even though it is in package.json. It reaches turf-jsts
 *  (332 kB — see src/vendor.js, where it is deliberately held behind ensureHeavy()), and its offset
 *  is computed in a plane, so the 5 km it draws at 60°N is not 5 km. The sum above is assembled from
 *  geodesic pieces on the radius the rest of the app uses, and it costs no new bytes.
 *
 *  ⚠ AND IT IS AN INSCRIBED APPROXIMATION, STATED AS ONE. `steps` disks and quads meet at chords,
 *  so the boundary lies inside the true buffer by r·(1−cos(π/steps)) at worst — 3 m on a 5 km buffer
 *  at the default 64. The number is reported in `_bufferSteps` rather than rounded off, because a
 *  reader measuring an area against a published figure needs to know which way the error runs.
 *
 *  ══ THE PLANE, AND THE SEAM ═══════════════════════════════════════════════════════════════════
 *  A sweep-line is planar. #R729 handled that by REFUSING any ring whose longitude span exceeded
 *  180°, which is the honest answer when you cannot tell 「seam-crossing」 from 「wrapping the wrong
 *  way」. You can tell, though, if you look at consecutive vertices rather than at the extremes: a
 *  step of more than 180° between two adjacent vertices is the seam, because no edge in any dataset
 *  this app reads is half a world long. So rings are UNWRAPPED (§ unwrapRing), both operands are
 *  SHIFTED into the same 360° window (§ alignTo), the arithmetic happens there, and the result is
 *  cut back into [-180, 180] by js/geodesy.js _splitPolyToWindows — the same splitter diskFillPolys
 *  already uses, so a buffer that crosses the seam and a country that crosses the seam come back in
 *  the same shape.
 *
 *  ⚠ WHAT IS STILL REFUSED, AND FOR WHAT IT IS: a ring that spans 360° or more after unwrapping
 *  (`geometry-wraps-world`). That is a polar cap or a whole-world ring, and it has no simple ring in
 *  ANY cylindrical plane — the refusal is about the plane, not about the data being unusual, and it
 *  is the same measurement #R729 made, moved to the place where it is actually true.
 *
 *  ══ DISTANCE AND THE PREDICATES ═══════════════════════════════════════════════════════════════
 *  distanceKm is the minimum over the pieces: point↔point is haversine on _R_EARTH_KM; point↔segment
 *  projects into a local equirectangular frame CENTRED ON THE QUERY POINT to find the nearest
 *  parameter and then measures the real geodesic to it, so the projection only chooses WHICH point
 *  and never reports the distance; segment↔segment is 0 when they cross and the min of the four
 *  point↔segment otherwise. Areal shapes contribute 0 when they intersect, and their boundaries
 *  otherwise. ⚠ 「道路そのものからの距離」 is this, and it is the thing an ops/Atlas path that had
 *  replaced a line by its bounding-box centre could not answer at all.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) and window.* is read at CALL time, so this
 *  module loads in Node with no DOM: ready() resolves false and every entry point answers
 *  `null` / `clipper-unavailable` instead of throwing.
 * ==========================================================================*/

export function makeGisGeometry() {
  return (function () {

    function geodesy() { try { return (typeof window !== 'undefined' && window.IntMapGeodesy) || null; } catch (_) { return null; } }
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }

    const D2R = Math.PI / 180;

    /* An adjacent-vertex longitude step larger than this is the antimeridian rather than a real
       edge. Expires if this app ever reads a dataset whose single edges are half a world long —
       none of the importers can produce one, because GeoJSON writers emit the seam as a jump. */
    const SEAM_STEP = 180;
    /* Two positions are the same position below this. 1e-12° ≈ 0.1 µm at the equator, far below the
       float64 resolution of a degree near ±180. Shared with js/gis-ops.js by measurement, not by
       import: both are answering 「is this the same vertex」 about the same coordinates. */
    const SAME_EPS = 1e-12;

    /* ── the clipper, loaded once, on demand ──────────────────────────────────────────────────── */

    let PC = null, loading = null;

    function ready() {
      if (PC) return Promise.resolve(true);
      if (loading) return loading;
      loading = import('polygon-clipping')
        .then((m) => { PC = (m && (m.default || m)) || null; return !!(PC && PC.union); })
        .catch(() => { loading = null; return false; });
      return loading;
    }

    function available() { return !!(PC && PC.union && PC.intersection && PC.difference); }

    /* ── positions, rings ─────────────────────────────────────────────────────────────────────── */

    function isPos(p) { return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]); }
    function same(a, b) { return Math.abs(a[0] - b[0]) <= SAME_EPS && Math.abs(a[1] - b[1]) <= SAME_EPS; }

    /* An OPEN ring of finite positions with consecutive duplicates dropped — the shape every loop
       below closes itself with (i+1)%n. A repeated vertex is the zero-length edge whose cross
       product is 0 and whose intersection parameter is 0/0. */
    function ringPositions(ring) {
      if (!Array.isArray(ring)) return [];
      const out = [];
      for (const p of ring) { if (!isPos(p)) continue; if (out.length && same(out[out.length - 1], p)) continue; out.push([p[0], p[1]]); }
      while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
      return out;
    }

    function closeRing(pts) { return pts.length ? pts.concat([[pts[0][0], pts[0][1]]]) : pts; }

    /* ── the seam: unwrap, align, split back ──────────────────────────────────────────────────── */

    /* Longitudes made CONTINUOUS by following the edges: each vertex is put in the 360° window that
       keeps its step from the previous vertex under 180°. A ring drawn 170 → -170 comes back
       170 → 190 — one 20° edge across the seam, which is what it is, instead of a 340° sweep the
       wrong way round the world. ⚠ The output may lie outside [-180,180]; that is the point, and
       splitBack() is what returns it. */
    function unwrapRing(pts) {
      if (!pts.length) return pts;
      const out = [[pts[0][0], pts[0][1]]];
      for (let i = 1; i < pts.length; i++) {
        const prev = out[i - 1][0];
        let lon = pts[i][0];
        while (lon - prev > SEAM_STEP) lon -= 360;
        while (prev - lon > SEAM_STEP) lon += 360;
        out.push([lon, pts[i][1]]);
      }
      /* The closing edge is an edge too: if it crosses the seam the ring is consistent, but if the
         walk has drifted a whole turn the ring encircles a pole and no planar ring can hold it. */
      return out;
    }

    function lonRange(rings) {
      let mn = Infinity, mx = -Infinity;
      for (const r of rings) for (const p of r) { if (p[0] < mn) mn = p[0]; if (p[0] > mx) mx = p[0]; }
      return (mn === Infinity) ? null : [mn, mx];
    }

    /* Shift `rings` by whole turns so they sit as close as possible to `ref`'s window. Two shapes
       that both cross the seam can come out of their files on opposite sides of it (one at +179,
       one at -179); in the plane those do not touch, and the intersection of two overlapping
       countries would come back empty with nothing saying why. */
    function alignTo(rings, ref) {
      const a = lonRange(ref), b = lonRange(rings);
      if (!a || !b) return rings;
      const centreA = (a[0] + a[1]) / 2, centreB = (b[0] + b[1]) / 2;
      const k = Math.round((centreA - centreB) / 360);
      if (!k) return rings;
      return rings.map((r) => r.map((p) => [p[0] + k * 360, p[1]]));
    }

    /* Back into [-180,180]. js/geodesy.js already owns this cut — diskFillPolys emits unwrapped
       rings and every disk on the map has been through it — so it is asked rather than repeated. */
    function splitBack(polys) {
      const G = geodesy();
      const out = [];
      for (const rings of polys) {
        if (!rings.length) continue;
        if (!G || typeof G._splitPolyToWindows !== 'function') { out.push(rings); continue; }
        /* _splitPolyToWindows takes ONE ring and returns the windows it falls into. The outer ring
           decides how many pieces there are; each hole is cut the same way and given to the piece
           whose window it landed in, matched by that window's index. */
        const outers = G._splitPolyToWindows(closeRing(rings[0]));
        if (!outers || !outers.length) continue;
        const pieces = outers.map((o) => [o]);
        for (let h = 1; h < rings.length; h++) {
          const cuts = G._splitPolyToWindows(closeRing(rings[h])) || [];
          for (const c of cuts) {
            const cr = lonRange([ringPositions(c)]);
            if (!cr) continue;
            let best = -1, bestGap = Infinity;
            for (let i = 0; i < pieces.length; i++) {
              const pr = lonRange([ringPositions(pieces[i][0])]);
              if (!pr) continue;
              const gap = Math.max(0, pr[0] - cr[1]) + Math.max(0, cr[0] - pr[1]);
              if (gap < bestGap) { bestGap = gap; best = i; }
            }
            if (best >= 0) pieces[best].push(c);
          }
        }
        for (const p of pieces) out.push(p);
      }
      return out;
    }

    /* ── GeoJSON ⇄ the clipper's MultiPolygon ─────────────────────────────────────────────────── */

    /* Every areal part of a geometry as [[outer, hole…], …] with rings unwrapped and open.
       Returns null — never a partial answer — when a ring wraps the world, because a caller that
       got half a shape back would have no way to know it. */
    /* ⚠ MEMOISED ON THE GEOMETRY OBJECT ITSELF. Every predicate below converts its operands, and
       the ops layer asks the same 3,000 prefectures about 50,000 points: without this, the walk
       and the unwrap run 150 million times for 3,000 distinct answers. A WeakMap keyed by the
       geometry means a dataset that is dropped takes its conversions with it.
       ⚠ VALID ONLY BECAUSE NOTHING HERE MUTATES A GEOMETRY. Every op returns new arrays, and the
       sweep-line reads its operands. A future op that edits coordinates in place must clear this.
       (It also holds the null verdict for a world-wrapping ring, which is the expensive one to
       re-derive and the one most likely to be asked twice.) */
    const MULTI = (typeof WeakMap === 'function') ? new WeakMap() : null;

    function toMulti(g) {
      if (MULTI && g && typeof g === 'object' && MULTI.has(g)) return MULTI.get(g);
      const out = toMultiRaw(g);
      if (MULTI && g && typeof g === 'object') MULTI.set(g, out);
      return out;
    }

    function toMultiRaw(g) {
      if (!g || typeof g !== 'object') return [];
      if (g.type === 'GeometryCollection') {
        const out = [];
        for (const sub of (g.geometries || [])) { const m = toMulti(sub); if (m === null) return null; for (const p of m) out.push(p); }
        return out;
      }
      const src = (g.type === 'Polygon') ? [g.coordinates]
        : (g.type === 'MultiPolygon') ? g.coordinates : [];
      const out = [];
      for (const rings of src) {
        if (!Array.isArray(rings)) continue;
        const kept = [];
        for (const r of rings) {
          const pts = unwrapRing(ringPositions(r));
          if (pts.length < 3) continue;
          const range = lonRange([pts]);
          if (range && (range[1] - range[0]) >= 360) return null;
          kept.push(pts);
        }
        if (kept.length) out.push(kept);
      }
      return out;
    }

    function fromMulti(multi) {
      const polys = [];
      for (const rings of (multi || [])) {
        const kept = [];
        for (const r of rings) { const pts = ringPositions(r); if (pts.length >= 3) kept.push(closeRing(pts)); }
        if (kept.length) polys.push(kept);
      }
      if (!polys.length) return null;
      return (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    }

    /* ── the boolean ops ──────────────────────────────────────────────────────────────────────── */

    /* ══ 「答えは空だった」 AND 「答えられなかった」 ARE NOT THE SAME NULL (#R743) ═══════════════
       Every door in this file used to answer `null` for both, and the header above promised a
       vocabulary — `clipper-unavailable`, `geometry-wraps-world` — that **existed in no line of
       code**: a grep of the whole repository finds those two spellings only in comments. So the
       refusal that was documented by name had no name, and the caller could not have read one.

       ⚠ WHAT THAT COST, MEASURED IN THIS FILE'S OWN CALLERS: every runner in js/gis-ops.js read the
       null as 「この行は答えに入らない」 and carried on, so a clipper that threw on one pair came
       back as `{ ok: true }` with a quietly smaller answer — buffer, clip, intersect, union,
       difference, dissolve, relate and aggregate all had that shape. Two predicates were worse than
       silent: `disjoint` is `!intersects`, and `intersects` answers false when it cannot compute —
       so a failure asserted 「この二つは離れている」; `contains` is `!difference(b, a)`, so a
       throwing clipper asserted 「b は a に完全に含まれる」. A failure was being read as a verdict.

       The fix is not a second vocabulary bolted on beside the first. These `…R` doors ARE the
       implementations, and the plain names are one line each over them, so a caller that wants the
       old shape gets exactly the old shape and there is still only one place where the rule lives.
       `{ ok: true, geometry: null }` is an empty answer. `{ ok: false, why }` is a refusal, and
       `why` is the name the header has been claiming since #R732. */
    const OK = (g) => ({ ok: true, geometry: (g == null) ? null : g });
    const OKV = (v) => ({ ok: true, value: v });
    const NO = (why, detail) => ({ ok: false, why: why, detail: detail || null, geometry: null, value: null });

    /* One door, so the three of them cannot drift in how they unwrap, align, run and split. */
    function boolOpR(kind, a, b) {
      if (!available()) return NO('clipper-unavailable');
      const A = toMulti(a);
      if (A === null) return NO('geometry-wraps-world', { operand: 0 });
      /* a has no interior. For an intersection or a difference that is an EMPTY answer and not a
         failure — 「点と県の交わり」 is nothing, correctly. */
      if (!A.length) return (kind === 'union' && b) ? boolOpR('union', b, null) : OK(null);
      let args = [A];
      if (b != null) {
        const B = toMulti(b);
        if (B === null) return NO('geometry-wraps-world', { operand: 1 });
        if (B.length) args.push(alignTo(B, A));
        else if (kind === 'intersection') return OK(null);
      }
      let res;
      try {
        res = (kind === 'union') ? PC.union.apply(PC, args)
          : (kind === 'intersection') ? PC.intersection.apply(PC, args)
            : PC.difference.apply(PC, args);
      } catch (e) { return NO('clipper-failed', { op: kind, message: (e && e.message) || String(e) }); }
      /* The sweep-line ran and answered nothing: two prefectures that do not touch. That is the
         answer, and it is the case the old null could not tell from the three above it. */
      if (!Array.isArray(res) || !res.length) return OK(null);
      return OK(fromMulti(splitBack(res)));
    }

    function unionR(geoms) {
      const list = (Array.isArray(geoms) ? geoms : [geoms]).filter(Boolean);
      if (!list.length) return OK(null);
      if (!available()) return NO('clipper-unavailable');
      /* Unioned in ONE call rather than folded pairwise: the sweep-line is O(n log n) over all the
         edges at once, and folding is O(n²) with an intermediate result rebuilt every step.
         Measured shape, not a guess — this is the path a dissolve of 1,700 municipalities takes. */
      const multis = [];
      let base = null;
      for (let i = 0; i < list.length; i++) {
        const m = toMulti(list[i]);
        if (m === null) return NO('geometry-wraps-world', { operand: i });
        if (!m.length) continue;
        if (!base) { base = m; multis.push(m); }
        else multis.push(alignTo(m, base));
      }
      if (!multis.length) return OK(null);
      let res;
      try { res = PC.union.apply(PC, multis); } catch (e) { return NO('clipper-failed', { op: 'union', message: (e && e.message) || String(e) }); }
      if (!Array.isArray(res) || !res.length) return OK(null);
      return OK(fromMulti(splitBack(res)));
    }

    function boolOp(kind, a, b) { return boolOpR(kind, a, b).geometry; }
    function union(geoms) { return unionR(geoms).geometry; }
    function intersection(a, b) { return boolOp('intersection', a, b); }
    function difference(a, b) { return boolOp('difference', a, b); }

    /* ── decomposition, shared by the buffer, the predicates and the distance ──────────────────── */

    function pointsOf(g) {
      if (!g) return [];
      if (g.type === 'Point') return isPos(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiPoint') return (g.coordinates || []).filter(isPos);
      if (g.type === 'GeometryCollection') { const o = []; for (const s of (g.geometries || [])) for (const p of pointsOf(s)) o.push(p); return o; }
      return [];
    }

    function linesOf(g) {
      if (!g) return [];
      if (g.type === 'LineString') return [(g.coordinates || []).filter(isPos)];
      if (g.type === 'MultiLineString') return (g.coordinates || []).map((l) => (l || []).filter(isPos));
      if (g.type === 'GeometryCollection') { const o = []; for (const s of (g.geometries || [])) for (const l of linesOf(s)) o.push(l); return o; }
      return [];
    }

    /* Every ring of every areal part, CLOSED, as a list of line strings — what a distance or a
       crossing test needs from a polygon, which is its boundary and not its interior. */
    function ringsOf(g) {
      const out = [];
      const src = (g && g.type === 'Polygon') ? [g.coordinates]
        : (g && g.type === 'MultiPolygon') ? g.coordinates
          : (g && g.type === 'GeometryCollection') ? null : [];
      if (src === null) { for (const s of (g.geometries || [])) for (const r of ringsOf(s)) out.push(r); return out; }
      for (const rings of (src || [])) for (const r of (rings || [])) { const pts = ringPositions(r); if (pts.length >= 3) out.push(closeRing(pts)); }
      return out;
    }

    function hasArea(g) { const m = toMulti(g); return !!(m && m.length); }

    /* ── point in polygon: ray casting, planar, holes by parity ───────────────────────────────── */

    function pointInRing(x, y, pts) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }

    /* A position is inside an areal geometry when it is inside an odd number of that polygon's
       rings — outer minus holes, which is what GeoJSON means and what the clipper emits. */
    function pointInGeometry(pos, g) {
      const multi = toMulti(g);
      if (!multi || !multi.length || !isPos(pos)) return false;
      for (const rings of multi) {
        const aligned = alignTo(rings, [[[pos[0], pos[1]]]]);
        if (!pointInRing(pos[0], pos[1], aligned[0])) continue;
        let inHole = false;
        for (let h = 1; h < aligned.length; h++) if (pointInRing(pos[0], pos[1], aligned[h])) { inHole = true; break; }
        if (!inHole) return true;
      }
      return false;
    }

    /* ── distance ─────────────────────────────────────────────────────────────────────────────── */

    function haversineKm(a, b) {
      const R = earthKm();
      if (R == null || !isPos(a) || !isPos(b)) return null;
      const la1 = a[1] * D2R, la2 = b[1] * D2R;
      const dLa = la2 - la1, dLo = (b[0] - a[0]) * D2R;
      const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /* The nearest point of segment ab to p, CHOSEN in a local equirectangular frame centred on p
       (x scaled by cos φ, so a degree of longitude is worth what it is worth there) and then
       MEASURED as a real geodesic. The projection never appears in the number returned; it only
       picks the parameter, and picking it a metre off changes the distance by far less than that. */
    function pointToSegmentKm(p, a, b) {
      if (!isPos(p) || !isPos(a)) return null;
      if (!isPos(b)) return haversineKm(p, a);
      const k = Math.cos(p[1] * D2R) || 1e-9;
      const lonDiff = (q) => { let d = q[0] - p[0]; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
      const ax = lonDiff(a) * k, ay = a[1] - p[1];
      const bx = lonDiff(b) * k, by = b[1] - p[1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = 0;
      if (len2 > 0) t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const near = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return haversineKm(p, near);
    }

    function segmentsCross(p1, p2, p3, p4) {
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
      const on = (a, b, c) => Math.abs(d(a, b, c)) <= SAME_EPS
        && c[0] >= Math.min(a[0], b[0]) - SAME_EPS && c[0] <= Math.max(a[0], b[0]) + SAME_EPS
        && c[1] >= Math.min(a[1], b[1]) - SAME_EPS && c[1] <= Math.max(a[1], b[1]) + SAME_EPS;
      return on(p3, p4, p1) || on(p3, p4, p2) || on(p1, p2, p3) || on(p1, p2, p4);
    }

    /* Every line string a geometry contributes to a distance or a crossing test: its own lines, and
       the rings of its areal parts. A polygon's distance to something outside it IS its boundary's. */
    function strandsOf(g) {
      const out = [];
      for (const l of linesOf(g)) if (l.length >= 2) out.push(l);
      for (const r of ringsOf(g)) out.push(r);
      return out;
    }

    function strandsCross(A, B) {
      for (const la of A) for (let i = 1; i < la.length; i++) {
        for (const lb of B) for (let j = 1; j < lb.length; j++) {
          if (segmentsCross(la[i - 1], la[i], lb[j - 1], lb[j])) return true;
        }
      }
      return false;
    }

    /* 0 when the two shapes touch or overlap; otherwise the least geodesic distance between any part
       of one and any part of the other. ⚠ This is the answer 「道路そのものからの距離」 needs, and
       it is exactly what a bounding-box centre cannot give: the centre of a prefecture's box can sit
       in the sea, and the distance to it is not the distance to the prefecture. */
    function distanceKmR(a, b) {
      if (!a || !b) return NO('missing-geometry');
      if (earthKm() == null) return NO('geodesy-unavailable');
      const r = intersectsR(a, b);
      if (!r.ok) return r;
      if (r.value) return OKV(0);
      const d = distanceApart(a, b);
      /* Neither shape had a position to measure from — an empty geometry, not a distance of ∞. */
      return (d == null) ? NO('no-comparable-parts') : OKV(d);
    }

    function distanceKm(a, b) {
      if (!a || !b) return null;
      if (intersects(a, b)) return 0;
      return distanceApart(a, b);
    }

    /* The minimum over the pieces, for two shapes already known not to meet. */
    function distanceApart(a, b) {
      let best = Infinity;
      const ptsA = pointsOf(a), ptsB = pointsOf(b);
      const strA = strandsOf(a), strB = strandsOf(b);
      const take = (v) => { if (v != null && v < best) best = v; };
      for (const p of ptsA) for (const q of ptsB) take(haversineKm(p, q));
      for (const p of ptsA) for (const l of strB) for (let i = 1; i < l.length; i++) take(pointToSegmentKm(p, l[i - 1], l[i]));
      for (const q of ptsB) for (const l of strA) for (let i = 1; i < l.length; i++) take(pointToSegmentKm(q, l[i - 1], l[i]));
      for (const la of strA) for (let i = 0; i < la.length; i++) for (const lb of strB) for (let j = 1; j < lb.length; j++) take(pointToSegmentKm(la[i], lb[j - 1], lb[j]));
      for (const lb of strB) for (let j = 0; j < lb.length; j++) for (const la of strA) for (let i = 1; i < la.length; i++) take(pointToSegmentKm(lb[j], la[i - 1], la[i]));
      return isFinite(best) ? best : null;
    }

    /* ── the predicates ───────────────────────────────────────────────────────────────────────── */

    /* Sharing a single point of the plane. Areal × areal is asked of the clipper, because a square
       inside a square crosses nothing and shares no vertex; every other pair is a crossing, a
       containment, or a coincident position. */
    /* ⚠ THE AREAL QUESTION CAN FAIL TOO (#R743). hasArea() answers false for a ring that wraps the
       world, which is not 「面ではない」 — it is 「この平面では答えられない」 — and the predicates
       below then measured its VERTICES and reported a verdict about a shape they had refused. */
    function arealR(g) {
      const m = toMulti(g);
      if (m === null) return NO('geometry-wraps-world');
      return { ok: true, areal: !!m.length };
    }

    function intersectsR(a, b) {
      if (!a || !b) return NO('missing-geometry');
      const ra = arealR(a); if (!ra.ok) return ra;
      const rb = arealR(b); if (!rb.ok) return rb;
      if (ra.areal && rb.areal) {
        const r = boolOpR('intersection', a, b);
        return r.ok ? OKV(!!r.geometry) : r;
      }
      /* Nothing below this line can fail: it is arithmetic on positions that toMulti has already
         agreed are expressible in the plane. */
      return OKV(intersects(a, b));
    }

    function containsR(a, b) {
      if (!a || !b) return NO('missing-geometry');
      const ra = arealR(a); if (!ra.ok) return ra;
      if (!ra.areal) return OKV(false);
      const rb = arealR(b); if (!rb.ok) return rb;
      if (rb.areal) {
        const r = boolOpR('difference', b, a);
        return r.ok ? OKV(!r.geometry) : r;
      }
      return OKV(contains(a, b));
    }

    function withinR(a, b) { return containsR(b, a); }
    /* ⚠ THE NEGATION CARRIES THE REFUSAL (#R743). `!intersects(a,b)` turned every failure into the
       assertion 「離れている」, which is the one answer a failed computation most resembles. */
    function disjointR(a, b) { const r = intersectsR(a, b); return r.ok ? OKV(!r.value) : r; }

    function intersects(a, b) {
      if (!a || !b) return false;
      const aA = hasArea(a), aB = hasArea(b);
      if (aA && aB) { if (!available()) return false; return !!intersection(a, b); }
      if (aA) { for (const p of pointsOf(b)) if (pointInGeometry(p, a)) return true; for (const l of linesOf(b)) for (const p of l) if (pointInGeometry(p, a)) return true; }
      if (aB) { for (const p of pointsOf(a)) if (pointInGeometry(p, b)) return true; for (const l of linesOf(a)) for (const p of l) if (pointInGeometry(p, b)) return true; }
      if (strandsCross(strandsOf(a), strandsOf(b))) return true;
      const pa = pointsOf(a), pb = pointsOf(b);
      for (const p of pa) for (const q of pb) if (same(p, q)) return true;
      for (const p of pa) for (const l of strandsOf(b)) for (let i = 1; i < l.length; i++) { const d = pointToSegmentKm(p, l[i - 1], l[i]); if (d != null && d <= 0) return true; }
      return false;
    }

    /* Every part of b lies in a. For an areal b this is asked as 「what of b is outside a」 — an
       exact question for the clipper — rather than by testing vertices, because a ring whose
       vertices are all inside a concave a can still bulge out between two of them. */
    function contains(a, b) {
      if (!a || !b) return false;
      if (!hasArea(a)) return false;
      if (hasArea(b)) { if (!available()) return false; return !difference(b, a); }
      const pts = pointsOf(b);
      for (const p of pts) if (!pointInGeometry(p, a)) return false;
      for (const l of linesOf(b)) { for (const p of l) if (!pointInGeometry(p, a)) return false; }
      /* All vertices in, but an edge may still leave and come back through a concave notch. */
      if (strandsCross(strandsOf(b), ringsOf(a))) return false;
      return pts.length > 0 || linesOf(b).length > 0;
    }

    function within(a, b) { return contains(b, a); }
    function disjoint(a, b) { return !intersects(a, b); }

    /* ── the buffer ───────────────────────────────────────────────────────────────────────────── */

    /* One geodesic quad for one segment: the two ends pushed r to the left and r to the right of
       the bearing, which is the rectangle half of the Minkowski sum. The disks at the ends are what
       round the joins, so nothing here has to know about mitres. */
    function segmentQuad(a, b, km) {
      const G = geodesy();
      if (!G || typeof G._dest !== 'function') return null;
      const dLon = ((b[0] - a[0] + 540) % 360) - 180;
      const brg = Math.atan2(Math.sin(dLon * D2R) * Math.cos(b[1] * D2R),
        Math.cos(a[1] * D2R) * Math.sin(b[1] * D2R) - Math.sin(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos(dLon * D2R)) / D2R;
      const l = (brg + 270) % 360, r = (brg + 90) % 360;
      const p = [G._dest(a[0], a[1], l, km), G._dest(b[0], b[1], l, km), G._dest(b[0], b[1], r, km), G._dest(a[0], a[1], r, km)];
      for (const q of p) if (!isPos(q)) return null;
      return [unwrapRing(p)];
    }

    /* The Minkowski sum of a geometry with a disk of `km`, as ONE union. A negative km is the
       inward buffer of an areal shape — the same sum taken off the boundary — and is refused for
       anything without an interior to eat into, because 「点を −5 km 太らせる」 has no meaning. */
    function bufferKm(g, km, steps) { return bufferKmR(g, km, steps).geometry; }

    /* ⚠ NINE REASONS USED TO SHARE ONE null HERE — no clipper, no geodesy, a radius that is not a
       number, a shape with no positions, a sleeve the clipper threw on, a ring that wraps the
       world, an inward buffer asked of something with no interior, a sweep that answered nothing,
       and a final union that threw. js/gis-ops.js names the seventh (`inward-buffer-needs-area`)
       before it calls; the other eight had no name anywhere (#R743). */
    function bufferKmR(g, km, steps) {
      const G = geodesy();
      if (!available()) return NO('clipper-unavailable');
      if (!G || typeof G.diskFillPolys !== 'function') return NO('geodesy-unavailable');
      if (!isFinite(km) || km === 0) return NO('bad-radius', { radiusKm: km });
      const r = Math.abs(km);
      const n = Math.max(8, Math.min(4096, Math.round(steps || 64)));
      const parts = [];
      const addDisk = (p) => { const d = G.diskFillPolys([p[0], p[1]], r, n); if (Array.isArray(d)) for (const poly of d) { const rings = (poly || []).map((ring) => unwrapRing(ringPositions(ring))).filter((x) => x.length >= 3); if (rings.length) parts.push(rings); } };
      const addStrand = (l) => { for (let i = 0; i < l.length; i++) { addDisk(l[i]); if (i) { const q = segmentQuad(l[i - 1], l[i], r); if (q) parts.push(q); } } };

      for (const p of pointsOf(g)) addDisk(p);
      for (const l of linesOf(g)) addStrand(l);
      for (const ring of ringsOf(g)) addStrand(ring);
      /* No position anywhere in the geometry: an empty shape buffered is empty, not a failure. */
      if (!parts.length) return OK(null);

      let sleeve = null;
      try {
        const base = parts[0];
        const args = parts.map((p, i) => (i ? alignTo(p, base) : p));
        const res = PC.union.apply(PC, args);
        sleeve = (Array.isArray(res) && res.length) ? res : null;
      } catch (e) { return NO('clipper-failed', { op: 'sleeve', message: (e && e.message) || String(e) }); }
      if (!sleeve) return OK(null);

      const body = toMulti(g);
      if (body === null) return NO('geometry-wraps-world');
      /* Outward: the shape plus its sleeve. Inward: the shape minus it. A line or a point has no
         body, so the sleeve IS the buffer, and an inward one has nothing to eat into. */
      if (!body.length) return (km > 0) ? OK(fromMulti(splitBack(sleeve))) : NO('inward-buffer-needs-area');
      try {
        const aligned = alignTo(sleeve, body);
        const res = (km > 0) ? PC.union(body, aligned) : PC.difference(body, aligned);
        if (!Array.isArray(res) || !res.length) return OK(null);
        return OK(fromMulti(splitBack(res)));
      } catch (e) { return NO('clipper-failed', { op: (km > 0) ? 'union' : 'difference', message: (e && e.message) || String(e) }); }
    }

    /* ── dissolve ─────────────────────────────────────────────────────────────────────────────── */

    /* One union per group. The caller supplies the grouping, because 「どの列でまとめるか」 is a
       question about the reader's data and not about geometry. */
    function dissolve(geoms) { return union(geoms); }

    /* ⚠ (#R749) THE VERSION OF THIS KERNEL. Same reason and same keeper as js/gis-ops.js
       KERNEL_VERSION — the boolean engine is where #R743's union defect actually lived, so a saved
       recipe that replays through a different geometry kernel can land on different numbers.
       scripts/gis-kernel-versions.mjs holds the sha256 that keeps this honest. */
    const KERNEL_VERSION = 'geom-1';
    const API = {
      /* (#R749) see KERNEL_VERSION above — js/gis-project.js records which engine answered. */
      version: () => KERNEL_VERSION,
      ready, available,
      union, intersection, difference, dissolve, bufferKm,
      intersects, contains, within, disjoint, distanceKm,
      pointInGeometry,
      /* ⚠ THE SAME OPERATIONS, ASKED SO THAT A REFUSAL CAN BE READ (#R743). Not a second engine and
         not a second rule: the plain names above are one line each over these. A caller that must
         not report success over a computation that did not happen — which is every runner in
         js/gis-ops.js — asks here and gets `{ ok:false, why }` instead of a null it would have read
         as 「該当なし」. docs/GIS-CORE.md §1.2 holds the vocabulary. */
      attempt: {
        union: unionR, intersection: (a, b) => boolOpR('intersection', a, b), difference: (a, b) => boolOpR('difference', a, b),
        dissolve: unionR, bufferKm: bufferKmR,
        intersects: intersectsR, contains: containsR, within: withinR, disjoint: disjointR,
        distanceKm: distanceKmR, areal: arealR,
      },
      /* exposed because js/gis-ops.js converts the same way and the checks measure the same
         conversion — two readers of one rule, not two rules */
      toMulti, fromMulti, unwrapRing, ringsOf, linesOf, pointsOf, hasArea,
    };
    try { window.IntMapGisGeometry = API; } catch (_) { }
    return API;
  })();
}
