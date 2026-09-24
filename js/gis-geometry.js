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
 *
 *  ══ ⚠⚠⚠ (#R819) THE ARITHMETIC IS ONE FUNCTION, AND IT CLOSES OVER NOTHING ════════════════════
 *  js/gis-worker.js grew a geometry intake — `provideGeometry(op, fn)` puts a KERNEL'S OWN FUNCTION
 *  TEXT in the other thread and `geometry.op` applies JSON arguments to it — and MEASURED against
 *  this file, not one operation here could go through it: every door closed over the module scope
 *  around it (`PC`, `geodesy()`, `SAME_EPS`, every helper), and a function rebuilt from its own
 *  source text arrives in a scope that holds none of those. The protocol says so by name
 *  (`job-not-self-contained`). The receiving end was finished and there was nothing to carry.
 *  So the arithmetic is wrapped — not rewritten — in ONE self-contained factory, `geomKernel(deps)`,
 *  exactly as js/gis-expr.js `exprKernel()` did for the evaluator in the same round. Everything the
 *  arithmetic needs is inside it; the two things it BORROWS FROM THE ENVIRONMENT stay outside and
 *  arrive as arguments:
 *    · `deps.clipper` — the sweep-line, which `ready()` still imports on this thread;
 *    · `deps.geodesy` — window.IntMapGeodesy, still read at CALL time (see K() below).
 *  ⚠ THERE IS STILL ONE IMPLEMENTATION. This thread calls the kernel BUILT here; the worker calls
 *  the same function rebuilt from the same bytes. 「両方が同じだけ間違っていれば緑」 is not available.
 *  ⚠ NOT ONE RULE OF MEANING MOVED, so KERNEL_VERSION stays `geom-2` (see the note above it).
 *
 *  ══ ⚠⚠⚠ AND WHAT CANNOT TRAVEL IS NOT PRETENDED AWAY ══════════════════════════════════════════
 *  MEASURED, in node, on the very object this file imports: `polygon-clipping`'s union is
 *  «function (geom) { … return operation.run("union", geom, moreGeoms); }» — `operation` is a free
 *  name in ITS module, so the sweep-line cannot be `provide`d, and a classic worker built from a
 *  Blob (js/gis-worker.js, §WHY THE SOURCE IS A BLOB) can neither `import` a bare specifier nor
 *  `importScripts` a chunk whose URL this module does not have. js/geodesy.js is the same shape.
 *  ⇒ THE OTHER THREAD BUILDS THE KERNEL WITH NO DEPS, and every operation that consults one answers
 *  the refusal it already has on this thread — `clipper-unavailable` / `geodesy-unavailable`.
 *  ⚠ THAT VERDICT IS ASKED BEFORE A POLYGON IS COPIED, and it is not a hand-written list: `worker`
 *  below asks A KERNEL BUILT THE WAY THE WORKER BUILDS ONE (`PORTABLE = geomKernel(null)`) which of
 *  its own operations it could complete. An operation added inside the kernel is therefore
 *  classified by the same code that runs it, not by a list beside it
 *  (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
 * ==========================================================================*/

export function makeGisGeometry() {
  return (function () {

    /* ── what is borrowed, and why it is NOT inside the kernel (#R819) ─────────────────────────
       「どこから規則を借りるか」 is a fact about the environment and not about arithmetic, so the
       two lookups below stay on this side of the factory — resolved per call, because this module
       may be built before js/geodesy.js publishes and a captured `undefined` would be permanent. */
    function geodesy() { try { return (typeof window !== 'undefined' && window.IntMapGeodesy) || null; } catch (_) { return null; } }

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

    /* ══ THE KERNEL (#R819) ═══════════════════════════════════════════════════════════════════════
       ⚠ THE BODY BELOW IS NOT RE-INDENTED, AND THAT IS DELIBERATE: the diff of this round is then
       exactly the wrapper, and a reader comparing two revisions can see that no rule of meaning
       moved. Same choice, same reason, as js/gis-expr.js `exprKernel()`.
       ⚠ `call` IS THE OTHER THREAD'S DOOR AND NOTHING ELSE. js/gis-worker.js's `geometry.op` applies
       JSON arguments to the library it resolved, so a worker cannot receive an API object of
       functions (it would not survive structured clone) — it has to name an operation and get that
       operation's ANSWER. Omitted, which is what this thread does, the factory returns the API. */
    function geomKernel(deps, call) {

    /* The two borrowed things, as VALUES. A kernel built with none — which is the kernel the other
       thread builds — is not broken: `available()` is false and every door that needs the sweep
       line answers `clipper-unavailable`, which is the same refusal this thread gets before
       ready() has resolved. */
    const PC = (deps && deps.clipper) || null;
    const GEODESY = (deps && deps.geodesy) || null;
    function geodesy() { return GEODESY || null; }
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }
    function available() { return !!(PC && PC.union && PC.intersection && PC.difference); }

    const D2R = Math.PI / 180;

    /* An adjacent-vertex longitude step larger than this is the antimeridian rather than a real
       edge. Expires if this app ever reads a dataset whose single edges are half a world long —
       none of the importers can produce one, because GeoJSON writers emit the seam as a jump. */
    const SEAM_STEP = 180;
    /* Two positions are the same position below this. 1e-12° ≈ 0.1 µm at the equator, far below the
       float64 resolution of a degree near ±180. Shared with js/gis-ops.js by measurement, not by
       import: both are answering 「is this the same vertex」 about the same coordinates. */
    const SAME_EPS = 1e-12;

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

    /* The least and greatest longitude anywhere inside a coordinate array — a ring, a list of rings,
       a list of PARTS, or a single position, ALL THE SAME.
       ⚠⚠⚠ THIS USED TO ASK ITS CALLER WHAT IT HAD BEEN GIVEN, BY ASSUMING (#R783). It was written as
       `for (const r of rings) for (const p of r)`, which is exactly two levels, and three callers
       hand it a MultiPolygon: boolOpR, unionR and bufferKmR all align one multi against another.
       One level too shallow, `p[0]` is a POSITION rather than a number, `p[0] < mn` against a number
       is false whichever way it runs, `mn` stays Infinity and the answer is null — so alignTo did
       nothing and two shapes written one turn apart stayed 360° apart in the plane. MEASURED from
       js/gis-raster.js's coverOf: `intersection(pixel at 200-201°E, box at −161…−158°E)` — the same
       ground — returned null, and a null there is read as 「該当なし」 by every caller.
       ⚠ A POSITION IS A LIST OF NUMBERS AND EVERYTHING ELSE IS A LIST OF SOMETHING, so the depth is
       a question the VALUE answers (isPos, the same reader the rest of this file uses). No caller
       passes a flag and none is special-cased — the rule is on the fact, not on the caller
       (.agents/rules/no-ad-hoc-hardcoding.md §2-2). Identical answers for correctly-nested input:
       a ring is still walked as a ring. */
    function lonRange(node) {
      let mn = Infinity, mx = -Infinity;
      const walk = (x) => {
        if (isPos(x)) { if (x[0] < mn) mn = x[0]; if (x[0] > mx) mx = x[0]; return; }
        if (Array.isArray(x)) for (const c of x) walk(c);
      };
      walk(node);
      return (mn === Infinity) ? null : [mn, mx];
    }

    /* Every position in a coordinate array moved east by `dx`, at whatever depth it lives, keeping
       the array's shape. ⚠ Two dimensions out, like the loop it replaces — the third ordinate is
       not carried here, and js/gis-geometry.js reads none (elevation travels beside the coordinates,
       [[intmap-declared-axis-must-be-verified]]). */
    function shiftLng(node, dx) {
      if (isPos(node)) return [node[0] + dx, node[1]];
      /* Anything that is neither a position nor a list is carried through untouched rather than
         thrown over: every caller here filters through isPos before it gets this far, and a helper
         that turns malformed input into a TypeError would convert a defect validate() reports by
         name (`position-not-finite`) into a crash somewhere else. */
      return Array.isArray(node) ? node.map((c) => shiftLng(c, dx)) : node;
    }

    /* Shift `coords` by whole turns so they sit as close as possible to `ref`'s window. Two shapes
       that both cross the seam can come out of their files on opposite sides of it (one at +179,
       one at -179); in the plane those do not touch, and the intersection of two overlapping
       countries would come back empty with nothing saying why.
       ⚠ A WHOLE TURN IS EXACT IN FLOAT64 (360 is a power of two times 45), so this moves nothing:
       the shifted copy is the same point on the sphere, written in the window where the other
       operand lives. */
    function alignTo(coords, ref) {
      const a = lonRange(ref), b = lonRange(coords);
      if (!a || !b) return coords;
      const centreA = (a[0] + a[1]) / 2, centreB = (b[0] + b[1]) / 2;
      const k = Math.round((centreA - centreB) / 360);
      if (!k) return coords;
      return shiftLng(coords, k * 360);
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

    function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }

    /* Does c lie ON segment ab. ⚠ LIFTED OUT OF segmentsCross UNCHANGED (#R752) rather than written
       a second time for the validity walk below: 「この点はこの辺の上か」 is one question, and the
       two readers that ask it must not be able to answer it differently. */
    function onSegment(a, b, c) {
      return Math.abs(orient(a, b, c)) <= SAME_EPS
        && c[0] >= Math.min(a[0], b[0]) - SAME_EPS && c[0] <= Math.max(a[0], b[0]) + SAME_EPS
        && c[1] >= Math.min(a[1], b[1]) - SAME_EPS && c[1] <= Math.max(a[1], b[1]) + SAME_EPS;
    }

    function segmentsCross(p1, p2, p3, p4) {
      const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
      return onSegment(p3, p4, p1) || onSegment(p3, p4, p2) || onSegment(p1, p2, p3) || onSegment(p1, p2, p4);
    }

    /* Does ab PASS THROUGH cd — each segment's endpoints on strictly opposite sides of the other's
       line, by more than the width at which two positions are already the same position.
       ⚠ THIS IS A DIFFERENT QUESTION FROM segmentsCross ABOVE, not a stricter setting of it, and
       both answers are needed. 「この二つの境界は触れているか」 is what intersects / contains /
       distance ask, so segmentsCross is generous ON PURPOSE: a shared vertex, a collinear overlap
       and a T-junction are all meetings. 「一方の境界が他方の内部を通り抜けたか」 is what an OVERLAP
       between two parts of one MultiPolygon is, and there a tangency must NOT count — two islands
       meeting at a point, and the two halves of one part cut at the antimeridian which share the
       seam edge, have meeting boundaries and DISJOINT INTERIORS, and calling those invalid would
       condemn most of the shipped record.
       ⚠ The sign test is guarded at SAME_EPS, WHICH IS THE SAME TOLERANCE onSegment USES, and that
       is the property that matters rather than the number: a position onSegment accepts as lying on
       an edge (|orient| ≤ SAME_EPS) can never be read here as a passage through it, so the two
       classifications cannot disagree about one meeting. Measured: an endpoint lying exactly on the
       other edge computes to ±1e-17 rather than to 0, and an unguarded `d > 0` reads that noise as a
       crossing — every touching island would have been reported as an overlap. */
    function crossesTransversally(p1, p2, p3, p4) {
      const side = (v) => ((v > SAME_EPS) ? 1 : ((v < -SAME_EPS) ? -1 : 0));
      return side(orient(p3, p4, p1)) * side(orient(p3, p4, p2)) < 0
        && side(orient(p1, p2, p3)) * side(orient(p1, p2, p4)) < 0;
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

    /* ── validity, and repair ─────────────────────────────────────────────────────────────────── */

    /* ══ THESE TWO BELONG TO THE GEOMETRY, NOT TO ANY ONE OP (#R752) ══════════════════════════════
     *  Until here a ring that crossed itself, a hole lying outside its shell, a ring that was never
     *  closed, a repeated vertex, a collapsed sliver or a vertex at latitude 95 went STRAIGHT INTO
     *  intersect / union / difference / dissolve. The sweep line was handed a shape that is not a
     *  shape, and whatever came back was reported to the reader as THEIR answer — nothing in the
     *  kernel had measured the input, so nothing could say which of the two, the data or the engine,
     *  a wrong number came from.
     *
     *  ⚠ THE RULE IS ATTACHED TO THE FACT, NOT TO A CALLER (.agents/rules/no-ad-hoc-hardcoding.md
     *  §2-2). validate() answers about any geometry this kernel can read, whatever is about to be
     *  done with it; nothing here knows which op asked, and there is no per-op check anywhere.
     *
     *  ⚠ WHERE, NOT JUST WHAT. Every problem carries `path` — the index path FROM THE GEOMETRY THE
     *  CALLER PASSED IN, so `path.reduce((o,k)=>o[k], geom)` is the very array that is wrong — and
     *  `vertex`, which indexes the RAW ring, not the cleaned copy this file works on. A reader told
     *  「頂点 7 が重複」 has to be able to find vertex 7 in the array they wrote.
     *
     *  ⚠ WINDING IS REPORTED AND NOT FAILED, AND THAT IS A MEASUREMENT OF THIS REPOSITORY RATHER
     *  THAN A READING OF THE RFC. RFC 7946 §3.1.6 asks for an exterior ring counter-clockwise and
     *  its holes clockwise — but NOTHING in this app requires it: pointInRing above is a parity
     *  test, js/gis-ops.js ringAreaKm2 takes |Σ|, and the sweep line reads rings[0] as the shell
     *  whichever way it runs. js/gis-shapefile.js normalises to RFC 7946 on the way in (ESRI states
     *  the opposite convention), and js/gis-geopackage.js deliberately does not — 「a ring's winding
     *  is a statement this reader has no basis to correct」. So a ring that runs the other way is a
     *  NOTE: a true statement about the data, not a defect. Inventing a validity rule the app does
     *  not have would be a rule with no reader. repair() will turn it, and says that it did.
     *
     *  ⚠ AND `ring-wraps-world` IS A NOTE FOR THE REASON THE HEADER GIVES: that refusal is about the
     *  plane, not about the data being wrong.
     *
     *  ⚠ NO LOOSE TWIN. The plain names above (union, intersects…) exist because callers predate
     *  #R743; these two doors are new, so they only exist in the readable shape. Adding a
     *  `validate()` that returns null for both 「問題は無かった」 and 「測れなかった」 would be
     *  rebuilding, in a new door, exactly the defect #R743 removed from all the old ones. */

    /* The shoelace of an OPEN ring in raw degrees; positive is counter-clockwise, which is RFC
       7946's exterior sense. ⚠ NOT a second copy of js/gis-ops.js ringAreaKm2 — that one is
       spherical excess in km² and takes an absolute value, so it cannot answer 「どちら向きか」 at
       all. This number is never reported as an area: it is read for its SIGN and for the collapse
       test below, both of which are planar questions about the ring as drawn. */
    function signedAreaDeg2(pts) {
      let a = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
      return a / 2;
    }

    /* A ring encloses nothing when EVERY vertex lies on one line — the perpendicular distance from
       the ring's longest chord is under the resolution at which two positions are already the same
       position. ⚠ NOT 「signed area is 0」, which was the first thing written here and was WRONG:
       measured, the bow-tie [0,0]→[2,2]→[2,0]→[0,2] has a shoelace of EXACTLY ZERO because its two
       lobes cancel, and it was being reported as a collapsed ring — hiding the self-intersection
       that is the actual defect. A cancelling area is a statement about winding, not about width.
       ⚠ And the tolerance is a WIDTH (degrees), which is what SAME_EPS is; an area threshold in
       degree² would mean one thing for a long thin ring and another for a small round one. */
    function ringCollapsed(pts) {
      let fi = -1, fd = -1;
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; fi = i; } }
      if (!(fd > 0)) return true;                       /* every vertex is the same position */
      const a = pts[0], b = pts[fi];
      for (const p of pts) if (Math.abs(orient(a, b, p)) > SAME_EPS * fd) return false;
      return true;
    }

    /* One ring as this kernel reads it, KEEPING THE RAW INDEX of every vertex it kept. `closed` is
       measured on the array as written (does the last position repeat the first) and not on the
       cleaned copy, because that is the statement GeoJSON makes and the one a reader can check. */
    function scanRing(raw) {
      const out = { pts: [], src: [], bad: [], dupes: [], closed: false, length: 0 };
      if (!Array.isArray(raw)) { out.bad.push({ code: 'ring-not-an-array', vertex: null, detail: { got: (raw === null) ? 'null' : typeof raw } }); return out; }
      out.length = raw.length;
      for (let i = 0; i < raw.length; i++) {
        const p = raw[i];
        if (!isPos(p)) { out.bad.push({ code: 'position-not-finite', vertex: i, detail: { got: Array.isArray(p) ? p.slice(0, 2) : ((p === null) ? 'null' : typeof p) } }); continue; }
        if (!(p[1] >= -90 && p[1] <= 90)) out.bad.push({ code: 'latitude-out-of-range', vertex: i, detail: { lat: p[1] } });
        if (!(p[0] >= -180 && p[0] <= 180)) out.bad.push({ code: 'longitude-out-of-range', vertex: i, detail: { lng: p[0] } });
        if (out.pts.length && same(out.pts[out.pts.length - 1], p)) { out.dupes.push(i); continue; }
        out.pts.push([p[0], p[1]]); out.src.push(i);
      }
      const first = raw[0], last = raw[raw.length - 1];
      out.closed = raw.length >= 2 && isPos(first) && isPos(last) && same(first, last);
      /* The repeated closing position is the closure, not a duplicate vertex — dropped here for the
         same reason ringPositions drops it, and NOT reported as `duplicate-point`. */
      while (out.pts.length > 1 && same(out.pts[0], out.pts[out.pts.length - 1])) { out.pts.pop(); out.src.pop(); }
      return out;
    }

    /* Every edge of every ring of ONE polygon part, as bbox-carrying segments the sweep below can
       prune on. `r` is which ring, `i` which edge of it; the ring is closed by (i+1)%n exactly as
       everything else in this file closes one. */
    function ringSegments(rings) {
      const segs = [];
      for (const ring of rings) {
        const pts = ring.pts, n = pts.length;
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          segs.push({
            r: ring.r, ring: ring, i: i, n: n, a: a, b: b,
            x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
            y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]),
          });
        }
      }
      return segs;
    }

    /* Two edges of the same ring that share a vertex ALWAYS meet at it, which is what a ring is. The
       defect is when they meet anywhere else: the far end of one lying on the other is a spike or a
       zero-angle backtrack, and it is the degeneracy the sweep line turns into an empty result. */
    function adjacentEdges(s, t) { return s.r === t.r && (Math.abs(s.i - t.i) === 1 || Math.abs(s.i - t.i) === s.n - 1); }

    function adjacentDegenerate(s, t) {
      const shared = (same(s.a, t.a) || same(s.a, t.b)) ? s.a : s.b;
      const p = same(s.a, shared) ? s.b : s.a;
      const q = same(t.a, shared) ? t.b : t.a;
      return onSegment(s.a, s.b, q) || onSegment(t.a, t.b, p);
    }

    /* A SWEEP, not the square of the edges. Segments are visited in order of their left end and kept
       in an active list only while their right end is still ahead of it, so a ring of n vertices
       costs O(n log n + k) on map data instead of O(n²) — 3,000 municipal boundaries of 2,000
       vertices each is 6 million edges, and the square of that is not a thing that finishes.
       ⚠ THE WORST CASE IS STILL QUADRATIC (every edge spanning the whole width, e.g. a star) — the
       prune is a prune and not a guarantee, which is why `limit` exists and is reported. */
    function sweepBoxes(items, onPair) {
      const order = items.slice().sort((p, q) => p.x0 - q.x0);
      const active = [];
      for (const s of order) {
        let k = 0;
        for (let i = 0; i < active.length; i++) if (active[i].x1 >= s.x0 - SAME_EPS) active[k++] = active[i];
        active.length = k;
        for (const t of active) {
          if (t.y1 < s.y0 - SAME_EPS || s.y1 < t.y0 - SAME_EPS) continue;
          if (onPair(s, t) === false) return;
        }
        active.push(s);
      }
    }

    /* The edge walk is the box sweep above with one question asked of each surviving pair. ⚠ The
       prune is written ONCE (#R783): the between-parts stage below needs the same active-list walk
       over part bounding boxes, and a second copy of it would be the 「同じ判断を2か所」 this file
       refuses elsewhere — a pair the edge walk prunes and the part walk keeps could then be reported
       by one reader and not the other. */
    function sweepMeetings(segs, onMeet) {
      sweepBoxes(segs, (s, t) => {
        const meets = adjacentEdges(s, t) ? adjacentDegenerate(s, t) : segmentsCross(s.a, s.b, t.a, t.b);
        if (!meets) return true;
        return onMeet(s, t) !== false;
      });
    }

    /* ONE TOPOLOGY WALK WITH TWO READERS (this file's own note on toMulti, applied again): validate()
       reports every meeting with the ring and the vertex it happened at, repair() only needs to know
       whether there was one. Two readers of one rule, never two rules — if the walk and the repair
       could disagree about what a hole outside its shell is, repair would be able to "fix" something
       validate goes on reporting, or leave something it reports unfixed.
       `rings` is [{r, pts}] with pts OPEN, UNWRAPPED and already aligned into one 360° window. */
    function partTopology(rings, report) {
      let crossed = false;
      sweepMeetings(ringSegments(rings), (s, t) => {
        if (s.r === t.r) return report('ring-self-intersects', { ring: s.r, edges: [Math.min(s.i, t.i), Math.max(s.i, t.i)], vertex: s.ring.src[s.i] });
        crossed = true;
        return report('rings-intersect', { rings: [Math.min(s.r, t.r), Math.max(s.r, t.r)], vertex: s.ring.src[s.i] });
      });
      /* Containment only means anything once the boundaries are known not to cross: 「穴が外環の外に
         ある」 and 「穴が外環を跨いでいる」 are different defects, and reporting the second as the
         first would send a reader to the wrong ring. */
      if (crossed || rings.length < 2 || rings[0].r !== 0) return;
      const shell = rings[0];
      const probes = [];
      for (let i = 1; i < rings.length; i++) {
        const h = rings[i];
        /* A vertex of the hole that is not itself ON another ring's boundary — on the boundary the
           parity test answers arbitrarily. ⚠ Cost: the first vertex almost always serves; a hole
           every one of whose vertices lies on the shell is a hole traced along the shell, and only
           that shape makes this walk the product of the two rings. */
        let probe = null;
        for (const v of h.pts) { if (!onBoundary(v, shell.pts)) { probe = v; break; } }
        probes.push(probe);
        if (!probe) { if (report('hole-on-shell-boundary', { ring: h.r }) === false) return; continue; }
        if (!pointInRing(probe[0], probe[1], shell.pts)) { if (report('hole-outside-shell', { ring: h.r, at: probe.slice() }) === false) return; }
      }
      for (let i = 1; i < rings.length; i++) {
        const p = probes[i - 1];
        if (!p) continue;
        for (let j = 1; j < rings.length; j++) {
          if (i === j) continue;
          if (pointInRing(p[0], p[1], rings[j].pts)) { if (report('hole-inside-hole', { ring: rings[i].r, insideOf: rings[j].r, at: p.slice() }) === false) return; }
        }
      }
    }

    function onBoundary(p, pts) {
      for (let i = 0, n = pts.length; i < n; i++) if (onSegment(pts[i], pts[(i + 1) % n], p)) return true;
      return false;
    }

    /* Rings of one part put in one 360° window, so a shell written at +179 and a hole written at
       −179 are compared where they actually are. alignTo is the same one the boolean ops use. */
    function alignPart(rings) {
      if (rings.length < 2) return rings;
      const base = [rings[0].pts];
      for (let i = 1; i < rings.length; i++) rings[i].pts = alignTo([rings[i].pts], base)[0];
      return rings;
    }

    /* ── the third stage: BETWEEN the parts of one MultiPolygon (#R783) ───────────────────────── */

    /* ══ VALIDITY HAS THREE STAGES AND ONLY TWO OF THEM WERE ASKED ════════════════════════════════
     *  scanRing answers about POSITIONS AND RINGS, partTopology answers about the RINGS OF ONE PART,
     *  and until #R783 that was the whole of it: validate() looped `for (i) checkPolygon(a[i])` over
     *  a MultiPolygon and returned `valid: true` whenever every part was faultless ON ITS OWN.
     *  MEASURED on the code as shipped: two squares overlapping in a quarter of their area — the
     *  first example in any account of OGC validity — were VALID, and the area of that geometry is
     *  the sum of two parts that cover the same ground twice. repair() had the same shape one level
     *  down: it cleaned each part and CONCATENATED the results, so a defect that exists only between
     *  parts survived a repair and was not in `remaining` either, because validate() was not looking.
     *  OGC's rule is about the multipolygon: THE INTERIORS OF ITS PARTS MUST NOT INTERSECT.
     *
     *  ⚠ INTERIORS, AND THE WORD IS LOAD-BEARING. Parts of one geometry TOUCHING is not this defect,
     *  and reporting it would condemn the shipped record rather than measure it: the two halves of
     *  one part cut at the antimeridian share the seam edge, and islands meeting at a point are
     *  written by every clipper. So the test asks whether one boundary PASSES THROUGH the other
     *  (crossesTransversally, whose note says why it is not segmentsCross) and whether a point
     *  strictly inside one part is strictly inside the other — never whether two boundaries met.
     *
     *  ⚠ AND THE THREE ANSWERS ARE THREE CODES, because they send a reader to different places:
     *  `parts-overlap` is two parts covering common ground, `part-inside-part` is a part swallowed by
     *  another (GEOS calls it a nested shell — the area is double-counted and nothing looks wrong on
     *  a map), `part-duplicates-part` is the same region written twice. Collapsing them into one
     *  would be [[intmap-restate-the-defect-not-the-fix]] in the vocabulary itself.
     *
     *  ⚠ WHAT THIS STAGE DOES NOT REPORT, STATED RATHER THAN IMPLIED:
     *    · parts that touch, along an edge or at a point — their interiors are disjoint (above);
     *    · an overlap whose boundary intersection is ENTIRELY COLLINEAR (two rectangles sharing the
     *      lines of their top and bottom edges and overlapping in a band) when every interior point
     *      sampled below happens to land on the other part's boundary. There is no transversal
     *      crossing to find, and the parity test cannot answer about a point on a boundary. Deciding
     *      that case needs the sweep-line boolean, and validate() answers WITHOUT it on purpose —
     *      nothing else in validate() depends on the clipper having loaded, and a check that can
     *      only run sometimes would make 「valid」 mean two different things. repair() does have the
     *      clipper, and what it could not resolve comes back in `remaining`;
     *    · the parts of DIFFERENT geometries, and a GeometryCollection's members. Two overlapping
     *      features are a statement about a DATASET, not about a geometry — see the note on the
     *      dataset-wide topology this stage deliberately does not attempt.
     *
     *  ⚠ THE DATASET-WIDE QUESTION IS A DIFFERENT SUBJECT, AND UNTIL #R819 THIS PARAGRAPH SAID IT
     *  WAS NOT ANSWERED HERE. 「地物同士が重ならない」 and 「区域の間に隙間が無い」 (an
     *  administrative or land-cover coverage) are properties of a FEATURE COLLECTION: they need
     *  every feature of a layer at once, a shared precision model, and a gap tolerance somebody
     *  states — a sliver of 1 µm between two municipal boundaries is the float64 the file was
     *  written with, not a hole in the world. All three were right; the conclusion drawn from them
     *  ("it belongs beside js/gis-datasets.js") was not, because THE TOLERANCE IS THE CALLER'S and
     *  so nothing had to be invented here, while the sweep, the boolean and the geodesic distance
     *  the answer is built from are all in this file and in no other. It is now coverage(), below,
     *  and it stays a SEPARATE DOOR: what this stage answers about one geometry does not change. */

    /* All rings of one part in one bounding box. ⚠ Every ring, not the shell alone: a hole drawn
       outside its shell is already reported by partTopology, and a box that does not contain it
       would let this stage prune away a pair whose rings really do meet. */
    function partBounds(rings) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const rg of rings) for (const p of rg.pts) {
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
      return (x0 === Infinity) ? null : [x0, y0, x1, y1];
    }

    function boxInside(a, b) {
      return !!a && !!b && a[0] >= b[0] - SAME_EPS && a[1] >= b[1] - SAME_EPS && a[2] <= b[2] + SAME_EPS && a[3] <= b[3] + SAME_EPS;
    }

    /* Inside the part, by the parity pointInGeometry reads: an odd number of rings — shell minus its
       holes, which is what GeoJSON means. ⚠ Asked of the SCANNED rings rather than of the geometry,
       because this stage works on the unwrapped, aligned copies. */
    function pointInPart(p, rings) {
      let n = 0;
      for (const rg of rings) if (pointInRing(p[0], p[1], rg.pts)) n++;
      return (n % 2) === 1;
    }

    function onPartBoundary(p, rings) {
      for (const rg of rings) if (onBoundary(p, rg.pts)) return true;
      return false;
    }

    /* Up to `want` points STRICTLY INSIDE a part, each found on a horizontal line that passes
       through no vertex: between two consecutive distinct vertex latitudes every ring crossing is
       transversal, so the crossings sort into an even number of x values whose odd-numbered
       intervals are the inside of the part (holes included, by the same parity as above). The
       midpoint of the widest such interval is as far from every boundary as this walk can put it.
       ⚠ WHY NOT PROBE WITH THE PART'S OWN VERTICES, the way partTopology probes a hole with its
       first off-shell vertex: a vertex is ON its part's boundary, so for the question 「この部分の
       内部は相手の内部と交わるか」 it answers about a point that belongs to neither interior.
       MEASURED: a diamond whose four vertices sit on the mid-points of a square's edges is inside
       that square, crosses it nowhere, and has NO vertex the parity test can answer about — a
       vertex-probing walk reports nothing at all. ⚠ Nothing computed here is ever emitted as
       geometry; these are measurements, not positions the repair writes. */
    function interiorPoints(rings, want) {
      const ys = [];
      for (const rg of rings) for (const p of rg.pts) ys.push(p[1]);
      ys.sort((a, b) => a - b);
      const out = [];
      const gaps = [];
      for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > SAME_EPS) gaps.push(i);
      if (!gaps.length) return out;
      /* Spread the scanlines over the part rather than taking the first few: consecutive gaps are
         usually the same sliver of one ring, and a probe near the boundary is the one most likely to
         land ON another part's boundary, where the parity test cannot answer. */
      const step = Math.max(1, Math.floor(gaps.length / want));
      for (let k = Math.floor(step / 2); k < gaps.length && out.length < want; k += step) {
        const i = gaps[k];
        const y = (ys[i - 1] + ys[i]) / 2;
        if (!(y > ys[i - 1] && y < ys[i])) continue;              /* the gap was below float64 here */
        const xs = [];
        for (const rg of rings) {
          const pts = rg.pts, n = pts.length;
          for (let e = 0; e < n; e++) {
            const a = pts[e], b = pts[(e + 1) % n];
            if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        let best = null, width = -1;
        for (let e = 0; e + 1 < xs.length; e += 2) { const d = xs[e + 1] - xs[e]; if (d > width) { width = d; best = [(xs[e] + xs[e + 1]) / 2, y]; } }
        if (best && width > SAME_EPS) out.push(best);
      }
      return out;
    }

    /* How many interior probes one part contributes. ⚠ NOT a threshold on correctness — one probe
       decides every configuration in which a boundary is not walked along, and the extra two exist
       because a single probe can land on the OTHER part's boundary, where parity is arbitrary (the
       residual that leaves is stated in the block above). Three keeps the cost of a pair at O(V):
       measured over data/ecoregions_2017.geojson, the whole between-parts stage adds well under a
       second to a 10 MB record whose MultiPolygons hold 39,000 parts. */
    const PART_PROBES = 3;

    function probesOf(part) {
      if (!part.probes) part.probes = interiorPoints(part.rings, PART_PROBES);
      return part.probes;
    }

    /* A point in one interior that is also in the other. Both directions, because one part may be
       far bigger than the other and only the smaller one's probes land inside. */
    function interiorsMeet(A, B) {
      for (const p of probesOf(A)) if (!onPartBoundary(p, B.rings) && pointInPart(p, B.rings)) return p;
      for (const p of probesOf(B)) if (!onPartBoundary(p, A.rings) && pointInPart(p, A.rings)) return p;
      return null;
    }

    /* Is the whole of A inside B. ⚠ Only ever asked of a pair whose interiors have ALREADY been
       found to meet and whose boundaries do not cross — this is the O(Va·Vb) walk, and on valid data
       it never runs. Its job is not detection but DIRECTION: nesting and duplication are the same
       finding until you know which part is which, and a reader told 「part 0 is inside part 1」
       about the OUTER part has been sent to the wrong array.
       ⚠ TWO CONDITIONS, AND THE SECOND ONE IS THE ONE THAT IS EASY TO MISS: every position of A
       lying inside B is not enough, because B's HOLE can lie inside A. Measured on the synthetic
       case ⑤ covers: a square inside a donut's shell, with the donut's hole entirely inside that
       square, has all four of its corners inside the donut and its boundary crosses nothing — and
       it is NOT contained, because it covers the ground the donut left out. A vertex of B strictly
       inside A is exactly that shape, whichever ring of B it belongs to. */
    function containedIn(A, B) {
      if (!boxInside(A.box, B.box)) return false;
      for (const rg of A.rings) for (const p of rg.pts) {
        if (pointInPart(p, B.rings)) continue;
        if (onPartBoundary(p, B.rings)) continue;
        return false;
      }
      for (const rg of B.rings) for (const p of rg.pts) if (!onPartBoundary(p, A.rings) && pointInPart(p, A.rings)) return false;
      return true;
    }

    /* The first place where a boundary of A passes through a boundary of B. The edges of both parts
       go through ONE sweep (the same one the per-part walk uses) and meetings within a part are
       skipped — those are partTopology's finding, reported there with the ring and the vertex. */
    function transversalBetween(A, B) {
      const segs = [];
      for (const s of ringSegments(A.rings)) { s.part = A; segs.push(s); }
      for (const s of ringSegments(B.rings)) { s.part = B; segs.push(s); }
      let hit = null;
      sweepBoxes(segs, (s, t) => {
        if (s.part === t.part) return true;
        if (!crossesTransversally(s.a, s.b, t.a, t.b)) return true;
        const a = (s.part === A) ? s : t, b = (s.part === A) ? t : s;
        hit = {
          rings: [a.ring.r, b.ring.r],
          vertices: [a.ring.src ? a.ring.src[a.i] : null, b.ring.src ? b.ring.src[b.i] : null],
        };
        return false;
      });
      return hit;
    }

    /* Parts put in ONE 360° window, for the reason alignPart does it for the rings of one part: a
       MultiPolygon whose parts sit on opposite sides of the antimeridian is written at +179 and
       −179, and in the plane those are 358° apart. ⚠ A whole-turn shift cannot invent an overlap —
       it either brings two parts to where they really are or leaves them far apart — so the only
       thing a misalignment can cost this stage is a finding, never a false one. */
    function alignParts(parts) {
      if (parts.length < 2) return parts;
      const base = parts[0].rings.map((x) => x.pts);
      for (let i = 1; i < parts.length; i++) {
        const shifted = alignTo(parts[i].rings.map((x) => x.pts), base);
        for (let k = 0; k < parts[i].rings.length; k++) parts[i].rings[k].pts = shifted[k];
      }
      return parts;
    }

    /* [{ i, rings:[{r, pts, src}] }] → the findings, through ONE reader, exactly as partTopology is
       read by both validate() and repair(). `i` is the index in the MultiPolygon the caller wrote,
       so every `part` and `insideOf` below names an array the reader can open. */
    function partsTopology(parts, report) {
      const boxes = [];
      for (const part of alignParts(parts)) {
        /* A part whose first ring was dropped has no known outside — partTopology declines
           containment on the same ground (`rings[0].r !== 0`), and guessing which of the survivors
           is the shell is a statement the file has no basis for. */
        if (!part.rings.length || part.rings[0].r !== 0) continue;
        part.box = partBounds(part.rings);
        if (!part.box) continue;
        boxes.push({ part: part, x0: part.box[0], y0: part.box[1], x1: part.box[2], y1: part.box[3] });
      }
      if (boxes.length < 2) return;
      sweepBoxes(boxes, (s, t) => {
        const A = (s.part.i <= t.part.i) ? s.part : t.part;
        const B = (A === s.part) ? t.part : s.part;
        /* ⚠ A PART WITH NO INTERIOR CANNOT INTERSECT ONE, AND A CROSSING BOUNDARY IS NOT AN
           INTERIOR. interiorPoints finds nothing when no scanline through the part encloses a width
           above SAME_EPS — a spike, a sliver traced out and back, a ring whose positions are all one
           position. MEASURED: this was the stage's ONLY disagreement with the sweep-line over
           data/ecoregions_2017.geojson in the direction of over-reporting. Cape York part 776 is
           eight positions inside 0.01° with three duplicates and two spikes; its boundary really
           does cross part 756's, and the clipper gives their intersection NO AREA, because 776
           encloses nothing. Reporting it as an overlap would be claiming double-counted ground for
           a part that covers none — and the defect it does have (`ring-self-intersects`,
           `duplicate-point`) is already reported against the ring itself by stage two. */
        if (!probesOf(A).length || !probesOf(B).length) return true;
        /* ⚠ A SELF-CROSSING PART IS STILL COMPARED, and that is a decision measured rather than
           assumed. Its interior is READ BY PARITY here and by re-noding in a sweep-line engine, and
           for a bow-tie those two readings differ — so the CLASS below (nested, duplicated, merely
           overlapping) is the parity reading and it is stated as such in `selfCrossing`. What does
           not differ is the finding: the two parts do cover common ground. Excluding them was tried
           and measured first: 355 of the 568 interior intersections the sweep-line finds in
           data/ecoregions_2017.geojson involve a part that crosses itself, and dropping them left
           the reader with no statement at all about most of the record's real overlaps. The residual
           is one pair (Albertine Rift 114 & 118), where 0.027% of a bow-tie's area falls on the
           far side of the two readings and this stage says 「inside」 where the engine says
           「overlapping」. */
        const cross = transversalBetween(A, B);
        const which = [A, B].filter((p) => p.crossed).map((p) => p.i);
        const flag = which.length ? which : null;
        if (cross) return report('parts-overlap', { part: A.i, parts: [A.i, B.i], rings: cross.rings, vertices: cross.vertices, selfCrossing: flag });
        const meet = interiorsMeet(A, B);
        if (!meet) return true;
        const aInB = containedIn(A, B), bInA = containedIn(B, A);
        /* Each inside the other is the same region twice. ⚠ Not 「頂点が同じ」: the same ground
           traced with an extra collinear vertex is the same ground, and a comparison of vertex lists
           would call that two different parts and report the wrong defect. */
        if (aInB && bInA) return report('part-duplicates-part', { part: B.i, duplicateOf: A.i, at: meet.slice(), selfCrossing: flag });
        if (aInB) return report('part-inside-part', { part: A.i, insideOf: B.i, at: meet.slice(), selfCrossing: flag });
        if (bInA) return report('part-inside-part', { part: B.i, insideOf: A.i, at: meet.slice(), selfCrossing: flag });
        return report('parts-overlap', { part: A.i, parts: [A.i, B.i], at: meet.slice(), selfCrossing: flag });
      });
    }

    /* ── validate ─────────────────────────────────────────────────────────────────────────────── */

    /* validate(geom, opts) →
         { ok:true, value: { valid, problems:[{code,path,vertex,detail}], notes:[…], truncated } }
         { ok:false, why:'missing-geometry' }               ← there was nothing to answer about
       opts.limit caps the number of findings (default 200; 0 = every one). A ring that crosses
       itself 40,000 times is one defect to the reader and 40,000 entries to an array, so the cap is
       reported as `truncated` rather than being a silently shorter list. */
    function validate(g, opts) {
      if (!g || typeof g !== 'object') return NO('missing-geometry');
      const limit = (opts && opts.limit != null) ? Math.max(0, opts.limit | 0) : 200;
      const problems = [], notes = [];
      let truncated = false;
      function add(list, code, path, vertex, detail) {
        if (limit && (problems.length + notes.length) >= limit) { truncated = true; return false; }
        list.push({ code: code, path: path.slice(), vertex: (vertex == null) ? null : vertex, detail: detail || null });
        return true;
      }
      const bad = (code, path, vertex, detail) => add(problems, code, path, vertex, detail);
      const note = (code, path, vertex, detail) => add(notes, code, path, vertex, detail);

      function checkPos(p, path, vertex) {
        if (!isPos(p)) return bad('position-not-finite', path, vertex, { got: Array.isArray(p) ? p.slice(0, 2) : ((p === null) ? 'null' : typeof p) });
        if (!(p[1] >= -90 && p[1] <= 90)) bad('latitude-out-of-range', path, vertex, { lat: p[1] });
        if (!(p[0] >= -180 && p[0] <= 180)) bad('longitude-out-of-range', path, vertex, { lng: p[0] });
        return true;
      }

      function checkLine(raw, path) {
        const s = scanRing(raw);
        for (const b of s.bad) bad(b.code, path, b.vertex, b.detail);
        for (const v of s.dupes) bad('duplicate-point', path, v, null);
        /* A LINE MAY CROSS ITSELF and this does not report it: a road that loops under itself is a
           legal LineString and the commonest shape in any street file. Only rings are simple. */
        if (s.pts.length < 2) bad('line-too-few-points', path, null, { distinct: s.pts.length, need: 2 });
      }

      /* → { rings, crossed } — the part's usable rings (scanned, unwrapped, aligned) and whether its
         own boundary was found to cross, so the third stage can compare one part with the next
         WITHOUT scanning or sweeping anything twice. ⚠ Two readers of one walk, never two walks: a
         between-parts stage that read the raw arrays again could disagree with this one about which
         rings a part has, and one that measured self-crossing again could disagree about whether the
         part has an interior at all. */
      function checkPolygon(ringsRaw, path) {
        if (!Array.isArray(ringsRaw) || !ringsRaw.length) { bad('polygon-no-rings', path, null, null); return null; }
        const usable = [];
        for (let r = 0; r < ringsRaw.length; r++) {
          const rp = path.concat([r]);
          const s = scanRing(ringsRaw[r]);
          for (const b of s.bad) bad(b.code, rp, b.vertex, b.detail);
          for (const v of s.dupes) bad('duplicate-point', rp, v, null);
          if (!s.closed) bad('ring-not-closed', rp, null, { positions: s.length });
          if (s.pts.length < 3) { bad('ring-too-few-points', rp, null, { distinct: s.pts.length, need: 3 }); continue; }
          if (ringCollapsed(s.pts)) { bad('ring-zero-area', rp, null, null); continue; }
          const un = unwrapRing(s.pts);
          const range = lonRange([un]);
          if (range && (range[1] - range[0]) >= 360) { note('ring-wraps-world', rp, null, { lngSpanDeg: range[1] - range[0] }); continue; }
          const ccw = signedAreaDeg2(un) > 0;
          const wantCcw = (r === 0);
          if (ccw !== wantCcw) note('ring-winding-differs-from-rfc7946', rp, null, { role: r ? 'hole' : 'exterior', winding: ccw ? 'ccw' : 'cw', rfc7946: wantCcw ? 'ccw' : 'cw' });
          usable.push({ r: r, pts: un, src: s.src });
        }
        if (usable.length < 1) return null;
        let crossed = false;
        partTopology(alignPart(usable), (code, info) => {
          if (code === 'ring-self-intersects' || code === 'rings-intersect') crossed = true;
          const rp = (info.ring != null) ? path.concat([info.ring]) : path;
          return bad(code, rp, (info.vertex == null) ? null : info.vertex, info);
        });
        return { rings: usable, crossed: crossed };
      }

      function visit(node, path) {
        if (!node || typeof node !== 'object') { bad('unsupported-type', path, null, { type: null }); return; }
        const t = node.type;
        if (t === 'GeometryCollection') {
          if (!Array.isArray(node.geometries)) { bad('unsupported-type', path, null, { type: t }); return; }
          for (let i = 0; i < node.geometries.length; i++) visit(node.geometries[i], path.concat(['geometries', i]));
          return;
        }
        const c = path.concat(['coordinates']);
        if (t === 'Point') { checkPos(node.coordinates, c, null); return; }
        if (t === 'MultiPoint') { const a = node.coordinates; if (!Array.isArray(a)) { bad('unsupported-type', path, null, { type: t }); return; } for (let i = 0; i < a.length; i++) checkPos(a[i], c, i); return; }
        if (t === 'LineString') { checkLine(node.coordinates, c); return; }
        if (t === 'MultiLineString') { const a = node.coordinates || []; for (let i = 0; i < a.length; i++) checkLine(a[i], c.concat([i])); return; }
        if (t === 'Polygon') { checkPolygon(node.coordinates, c); return; }
        if (t === 'MultiPolygon') {
          const a = node.coordinates;
          if (!Array.isArray(a)) { bad('unsupported-type', path, null, { type: t }); return; }
          const parts = [];
          for (let i = 0; i < a.length; i++) {
            const part = checkPolygon(a[i], c.concat([i]));
            if (part) parts.push({ i: i, rings: part.rings, crossed: part.crossed, probes: null, box: null });
          }
          /* The third stage (#R783). Its subject is the MultiPolygon, so it is asked here and
             nowhere else — a Polygon has one part and this loop would have nothing to compare. */
          partsTopology(parts, (code, info) => bad(code, c.concat([info.part]), null, info));
          return;
        }
        /* Not 「不正な形」 — a type this kernel does not read. Said as its own code so a caller can
           tell 「この幾何は壊れている」 from 「この幾何のことは知らない」. */
        bad('unsupported-type', path, null, { type: (typeof t === 'string') ? t : null });
      }

      visit(g, []);
      return { ok: true, value: { valid: problems.length === 0, problems: problems, notes: notes, truncated: truncated } };
    }

    /* ── repair ───────────────────────────────────────────────────────────────────────────────── */

    /* ⚠ A REPAIR IS A CLAIM, SO IT IS ENUMERATED (#R752). repair() never returns a quietly different
       shape: every ring it closed, every vertex it dropped, every ring it turned and every part it
       re-noded is one entry in `changes`, with the same `path` validate() would have used. And what
       it did NOT fix is in `remaining` — the problems validate() still finds in the OUTPUT — because
       a repair that leaves something behind and does not say so is worse than one that refuses.
       ⚠ IT IS NOT buffer(0). A zero-width buffer resolves self-intersection through offset
       arithmetic, which moves every vertex by whatever the offset rounds to; here the only thing
       that computes is the sweep line, which splits edges AT THEIR REAL CROSSINGS and keeps the
       vertices that were already there. Nothing in this function moves a position: it drops
       positions, reverses the order of positions, and shifts longitudes by WHOLE TURNS (which is the
       same point on the sphere, exactly, in float64 as well — 360 is a power of two times 45).
       ⚠ WHAT IT WILL NOT DO IS NAMED AND REFUSED, never guessed:
         · `latitude-out-of-range` — a clamp to ±90 is a claim about where that vertex is, and this
           file does not have one. It poisons everything downstream (the parity test, the area, the
           sweep), so the whole call refuses rather than returning a partly-repaired shape.
         · `geometry-wraps-world` / `clipper-unavailable` / `clipper-failed` — the topology cannot be
           computed, so the topology is not touched. Same three names the ops already use.
         · `unsupported-type` — repair cannot rebuild what it cannot read.
         · A polygon whose FIRST ring is degenerate is dropped whole rather than promoting a hole:
           which ring is the outside is a statement the file made, not one this function may make. */
    function Refusal(why, detail) { this.why = why; this.detail = detail || null; }

    function repair(g, opts) {
      if (!g || typeof g !== 'object') return NO('missing-geometry');
      const o = opts || {};
      const fixWinding = (o.winding !== 'keep');
      const node = (o.node !== false);
      const changes = [];
      const change = (code, path, detail) => { changes.push({ code: code, path: path.slice(), detail: detail || null }); };

      function refusePos(p, path, vertex) {
        if (isPos(p) && !(p[1] >= -90 && p[1] <= 90)) throw new Refusal('latitude-out-of-range', { path: path.slice(), vertex: vertex, lat: p[1] });
      }

      function cleanLine(raw, path) {
        const s = scanRing(raw);
        for (const b of s.bad) {
          if (b.code === 'latitude-out-of-range') throw new Refusal('latitude-out-of-range', { path: path.slice(), vertex: b.vertex, lat: b.detail && b.detail.lat });
          if (b.code === 'position-not-finite') change('dropped-invalid-position', path, { vertex: b.vertex });
        }
        for (const v of s.dupes) change('dropped-duplicate-point', path, { vertex: v });
        /* scanRing drops a repeated FIRST==LAST as a closure; on a line that repetition is a real
           vertex the line came back to, so it is put back. */
        const pts = s.pts.slice();
        if (s.closed && pts.length >= 2) pts.push([pts[0][0], pts[0][1]]);
        if (pts.length < 2) { change('dropped-degenerate-line', path, { distinct: pts.length }); return null; }
        return pts;
      }

      /* One polygon part → a list of parts (noding can turn one self-crossing ring into several, and
         a part that crosses the antimeridian into the pieces splitBack cuts). */
      function cleanPolygon(ringsRaw, path) {
        if (!Array.isArray(ringsRaw) || !ringsRaw.length) { change('dropped-empty-part', path, null); return []; }
        const rings = [];
        for (let r = 0; r < ringsRaw.length; r++) {
          const rp = path.concat([r]);
          const s = scanRing(ringsRaw[r]);
          for (const b of s.bad) {
            if (b.code === 'latitude-out-of-range') throw new Refusal('latitude-out-of-range', { path: rp, vertex: b.vertex, lat: b.detail && b.detail.lat });
            if (b.code === 'position-not-finite') change('dropped-invalid-position', rp, { vertex: b.vertex });
            if (b.code === 'ring-not-an-array') change('dropped-degenerate-ring', rp, b.detail);
          }
          for (const v of s.dupes) change('dropped-duplicate-point', rp, { vertex: v });
          const drop = (code, detail) => {
            change(code, rp, detail || null);
            if (r === 0) { change('dropped-degenerate-polygon', path, { reason: code }); return true; }
            return false;
          };
          if (s.pts.length < 3) { if (drop('dropped-degenerate-ring', { distinct: s.pts.length })) return []; continue; }
          if (ringCollapsed(s.pts)) { if (drop('dropped-zero-area-ring', null)) return []; continue; }
          if (!s.closed) change('closed-ring', rp, null);
          const un = unwrapRing(s.pts);
          const range = lonRange([un]);
          if (range && (range[1] - range[0]) >= 360) throw new Refusal('geometry-wraps-world', { path: rp, lngSpanDeg: range[1] - range[0] });
          rings.push({ r: r, pts: un, wrapped: s.pts, src: s.src });
        }
        if (!rings.length) return [];
        alignPart(rings);

        /* Ask the ONE topology walk what is wrong, then decide once. */
        let selfCross = false, ringCross = false, holeBad = false;
        if (node) {
          partTopology(rings, (code) => {
            if (code === 'ring-self-intersects') selfCross = true;
            else if (code === 'rings-intersect') ringCross = true;
            else holeBad = true;
            return !(selfCross && ringCross && holeBad);   /* stop once nothing more can be learned */
          });
        }

        /* ⚠ A PART THAT NEEDED NOTHING GOES OUT AS IT CAME IN. The unwrapped copy above exists so
           the topology and the winding can be measured in one plane; it is not an improvement to the
           coordinates. Measured: a perfectly good square written 179 → −179 unwraps to 179 → 181,
           and emitting THAT sends it through splitBack, which cut a valid Polygon into a
           two-part MultiPolygon and called it a repair. Nothing was wrong with it. */
        const noded = (selfCross || ringCross || holeBad);
        const rawRange = lonRange(rings.map((x) => x.wrapped));
        const rawInWindow = !!rawRange && rawRange[0] >= -180 - SAME_EPS && rawRange[1] <= 180 + SAME_EPS;
        let multi = [rings.map((x) => ((!noded && rawInWindow) ? x.wrapped : x.pts))];
        if (noded) {
          if (!available()) throw new Refusal('clipper-unavailable', { path: path.slice() });
          try {
            const res = PC.union(multi);
            multi = (Array.isArray(res) && res.length) ? res.map((poly) => poly.map((r) => ringPositions(r)).filter((p) => p.length >= 3)).filter((p) => p.length) : [];
          } catch (e) { throw new Refusal('clipper-failed', { path: path.slice(), op: 'node', message: (e && e.message) || String(e) }); }
          /* ⚠ The union of a shape WITH NOTHING is a re-noding of that shape: the sweep line splits
             every edge at every real crossing and reassembles the boundary, so a figure-eight comes
             back as the two lobes it draws and a hole outside its shell comes back as a second part.
             The vertices that survive are the ones that were written; the ones that are added sit
             exactly on two edges that were written. */
          if (selfCross) change('resolved-self-intersection', path, null);
          if (ringCross) change('resolved-ring-intersection', path, null);
          /* A hole outside its shell, or inside another hole, subtracts nothing from anything: the
             sweep line drops it. That is not the same event as two boundaries crossing. */
          if (holeBad) change('resolved-hole-placement', path, null);
          if (!multi.length) change('dropped-degenerate-polygon', path, { reason: 'noded-to-nothing' });
        }

        const out = backIntoWindow(multi, path);

        /* Winding last, so it is measured on the rings that are actually going out. */
        const parts = [];
        for (const poly of out) {
          const kept = windAndClose(poly, path);
          if (kept.length) parts.push(kept);
        }
        return parts;
      }

      /* Back inside [-180,180]. A whole-turn shift is exact and keeps the part in one piece; only a
         part that really straddles the seam is handed to the splitter, and that one changes the
         number of parts, so it says so. ⚠ WRITTEN ONCE (#R783) for the same reason windAndClose is:
         the between-parts union below also computes in the unwrapped plane and also has to come
         back, and two copies of this could shift one part and split the other. */
      function backIntoWindow(multi, path) {
        const out = [];
        for (const poly of multi) {
          const range2 = lonRange(poly);
          if (range2 && (range2[0] < -180 - SAME_EPS || range2[1] > 180 + SAME_EPS)) {
            const turns = -Math.round(((range2[0] + range2[1]) / 2) / 360);
            const lo = range2[0] + turns * 360, hi = range2[1] + turns * 360;
            if (turns && lo >= -180 - SAME_EPS && hi <= 180 + SAME_EPS) {
              change('shifted-longitude-into-range', path, { turns: turns });
              out.push(poly.map((r) => r.map((p) => [p[0] + turns * 360, p[1]])));
              continue;
            }
            const cut = splitBack([poly]);
            if (cut.length !== 1) change('split-at-antimeridian', path, { parts: cut.length });
            for (const piece of cut) out.push(piece.map((r) => ringPositions(r)).filter((p) => p.length >= 3));
            continue;
          }
          out.push(poly);
        }
        return out;
      }

      /* One part's OPEN rings → the closed rings that go out, wound as RFC 7946 asks unless the
         caller said `winding:'keep'`. ⚠ WRITTEN ONCE (#R783) because the between-parts stage below
         re-nodes parts AFTER cleanPolygon has finished with them, and a second copy of this loop
         could reverse a ring without saying so — or say so about a ring it did not reverse. */
      function windAndClose(poly, path) {
        const kept = [];
        for (let r = 0; r < poly.length; r++) {
          let pts = poly[r];
          if (pts.length < 3) continue;
          if (fixWinding) {
            /* unwrapRing is idempotent on an already-unwrapped ring and is what makes the sign
               mean anything on a ring written across the seam. */
            const ccw = signedAreaDeg2(unwrapRing(pts)) > 0;
            const wantCcw = (r === 0);
            if (ccw !== wantCcw) { pts = pts.slice().reverse(); change('reversed-ring-winding', path.concat([r]), { role: r ? 'hole' : 'exterior', from: ccw ? 'ccw' : 'cw', to: wantCcw ? 'ccw' : 'cw' }); }
          }
          kept.push(closeRing(pts));
        }
        return kept;
      }

      /* ⚠ THE DEFECT THAT ONLY EXISTS BETWEEN PARTS (#R783). cleanPolygon above repairs ONE part at
         a time and the caller concatenated the results, so two parts covering the same ground came
         out of a repair untouched — and not in `remaining` either, because validate() was not
         looking. Now that it looks, a repair that returned them unchanged would be the thing the
         block at the top of this function refuses: a shape that still fails the check that asked
         for the repair, over a report that says it was repaired.
         ⚠ THE FIX IS THE SAME SWEEP LINE, ASKED THE SAME WAY cleanPolygon asks it. A union of the
         parts with nothing is a re-noding of the whole MultiPolygon: overlapping parts come back as
         the region they cover ONCE, a part swallowed by another comes back inside it, a part written
         twice comes back once, and parts that merely touch are left alone because touching is not
         an overlap. Nothing is moved: the vertices that survive were written, and the ones that are
         added sit on two edges that were written.
         ⚠ AND IT COMPUTES IN THE UNWRAPPED, ALIGNED PLANE, not on the rings as written. MEASURED,
         and the first version of this function got it wrong: a part written across the antimeridian
         (170 → −170, which is what GeoJSON writes and what cleanPolygon deliberately LEAVES ALONE
         when nothing else is wrong with it) is, to a planar sweep, a ring 350° wide. Handing that to
         the union turned a genuine seam-straddling overlap into ONE self-intersecting ring and
         reported `resolved-part-overlap` over it. So both operands are unwrapped and aligned — the
         same plane the stage above detected the overlap in — and the answer comes back through
         backIntoWindow, exactly as cleanPolygon's own union does. */
      function repairBetweenParts(parts, path) {
        if (!node || parts.length < 2) return parts;
        /* `crossed: false` is a fact here rather than an assumption: every part in this array has
           been through cleanPolygon with noding on, so a part whose boundary crossed itself has
           already been re-noded into parts whose boundaries do not. */
        const scan = parts.map((rings, i) => ({
          i: i,
          rings: rings.map((r, k) => ({ r: k, pts: unwrapRing(ringPositions(r)), src: null })).filter((x) => x.pts.length >= 3),
          crossed: false, probes: null, box: null,
        }));
        let overlap = false, nested = false, duplicate = false;
        partsTopology(scan, (code) => {
          if (code === 'parts-overlap') overlap = true;
          else if (code === 'part-inside-part') nested = true;
          else duplicate = true;
          return !(overlap && nested && duplicate);      /* stop once nothing more can be learned */
        });
        if (!(overlap || nested || duplicate)) return parts;
        if (!available()) throw new Refusal('clipper-unavailable', { path: path.slice() });
        /* partsTopology has aligned `scan` into one window — the operands are those rings, because
           the plane the defect was measured in is the plane it has to be resolved in. */
        let multi;
        try { multi = PC.union(scan.map((p) => p.rings.map((r) => r.pts))); }
        catch (e) { throw new Refusal('clipper-failed', { path: path.slice(), op: 'union-parts', message: (e && e.message) || String(e) }); }
        const united = (Array.isArray(multi) ? multi : []).map((poly) => poly.map((r) => ringPositions(r)).filter((p) => p.length >= 3)).filter((p) => p.length);
        const polys = backIntoWindow(united, path);
        const out = [];
        for (let k = 0; k < polys.length; k++) {
          /* The parts are new, so a ring's address is its address in the OUTPUT — and when there is
             only one part left, that output is a Polygon and its rings hang off `coordinates`
             directly, exactly as the type decision below will write it. */
          const kept = windAndClose(polys[k], (polys.length > 1) ? path.concat([k]) : path);
          if (kept.length) out.push(kept);
        }
        /* One entry per KIND of thing that was wrong, the way cleanPolygon enumerates its own three.
           The part counts are in the detail because merging is the one repair here that changes how
           many parts a reader's geometry has. */
        const counts = { from: parts.length, to: out.length };
        if (overlap) change('resolved-part-overlap', path, counts);
        if (nested) change('resolved-part-nesting', path, counts);
        if (duplicate) change('resolved-duplicate-part', path, counts);
        if (!out.length) change('dropped-degenerate-polygon', path, { reason: 'noded-to-nothing' });
        return out;
      }

      function visit(nodeG, path) {
        if (!nodeG || typeof nodeG !== 'object') throw new Refusal('unsupported-type', { path: path.slice(), type: null });
        const t = nodeG.type;
        const c = path.concat(['coordinates']);
        if (t === 'GeometryCollection') {
          if (!Array.isArray(nodeG.geometries)) throw new Refusal('unsupported-type', { path: path.slice(), type: t });
          const subs = [];
          for (let i = 0; i < nodeG.geometries.length; i++) { const s = visit(nodeG.geometries[i], path.concat(['geometries', i])); if (s) subs.push(s); }
          if (!subs.length) { change('dropped-empty-part', path, null); return null; }
          return { type: 'GeometryCollection', geometries: subs };
        }
        if (t === 'Point') {
          const p = nodeG.coordinates;
          refusePos(p, c, null);
          if (!isPos(p)) { change('dropped-invalid-position', c, { vertex: null }); return null; }
          return { type: 'Point', coordinates: [p[0], p[1]] };
        }
        if (t === 'MultiPoint') {
          const a = Array.isArray(nodeG.coordinates) ? nodeG.coordinates : null;
          if (!a) throw new Refusal('unsupported-type', { path: path.slice(), type: t });
          const kept = [];
          for (let i = 0; i < a.length; i++) { refusePos(a[i], c, i); if (isPos(a[i])) kept.push([a[i][0], a[i][1]]); else change('dropped-invalid-position', c, { vertex: i }); }
          if (!kept.length) { change('dropped-empty-part', path, null); return null; }
          return { type: 'MultiPoint', coordinates: kept };
        }
        if (t === 'LineString') { const l = cleanLine(nodeG.coordinates, c); return l ? { type: 'LineString', coordinates: l } : null; }
        if (t === 'MultiLineString') {
          const a = Array.isArray(nodeG.coordinates) ? nodeG.coordinates : [];
          const kept = [];
          for (let i = 0; i < a.length; i++) { const l = cleanLine(a[i], c.concat([i])); if (l) kept.push(l); }
          if (!kept.length) { change('dropped-empty-part', path, null); return null; }
          return { type: 'MultiLineString', coordinates: kept };
        }
        if (t === 'Polygon' || t === 'MultiPolygon') {
          const src = (t === 'Polygon') ? [nodeG.coordinates] : (Array.isArray(nodeG.coordinates) ? nodeG.coordinates : null);
          if (!src) throw new Refusal('unsupported-type', { path: path.slice(), type: t });
          let parts = [];
          for (let i = 0; i < src.length; i++) for (const p of cleanPolygon(src[i], (t === 'Polygon') ? c : c.concat([i]))) parts.push(p);
          if (!parts.length) return null;
          parts = repairBetweenParts(parts, c);
          if (!parts.length) return null;
          /* A Polygon that had to become several is a MultiPolygon, and that is a change to the
             geometry's own type — stated, not slipped in. */
          if (t === 'Polygon' && parts.length > 1) change('type-changed', path, { from: 'Polygon', to: 'MultiPolygon', parts: parts.length });
          if (t === 'MultiPolygon' && parts.length === 1) change('type-changed', path, { from: 'MultiPolygon', to: 'Polygon', parts: 1 });
          return (parts.length === 1) ? { type: 'Polygon', coordinates: parts[0] } : { type: 'MultiPolygon', coordinates: parts };
        }
        throw new Refusal('unsupported-type', { path: path.slice(), type: (typeof t === 'string') ? t : null });
      }

      let out;
      try { out = visit(g, []); }
      catch (e) { if (e instanceof Refusal) return NO(e.why, e.detail); throw e; }
      /* Everything was degenerate: an EMPTY ANSWER (ok:true, geometry:null) and not a failure — the
         same distinction §2.5.1 made for the ops, kept here on purpose. */
      const after = out ? validate(out, { limit: (opts && opts.limit != null) ? opts.limit : 200 }) : null;
      return { ok: true, geometry: out, value: null, changes: changes, remaining: after && after.ok ? after.value.problems : [] };
    }

    /* ── the dataset: what is true BETWEEN features (#R819) ───────────────────────────────────── */

    /* ══ VALIDITY IS ABOUT ONE GEOMETRY. A COVERAGE IS A CLAIM ABOUT A SET ════════════════════════
     *  validate() answers three stages — positions, the rings of one part, the parts of one
     *  MultiPolygon — and the block above it says, in as many words, that the fourth is a different
     *  subject and is not attempted: 「地物同士が重ならない」 and 「区域の間に隙間が無い」 are
     *  properties of a FEATURE COLLECTION, they need every feature of a layer at once, and they need
     *  A TOLERANCE SOMEBODY STATES. That paragraph was right about all three and wrong only about
     *  where the answer goes: the tolerance is stated BY THE CALLER, so the kernel does not have to
     *  invent one, and the predicates the answer is built from (the sweep, the boolean, the geodesic
     *  distance) all live here. So this stage is here, and it takes the statement as an argument.
     *
     *  ⚠ WHAT IT COSTS A READER TO NOT HAVE THIS, WHICH IS THE REASON IT EXISTS: two municipal
     *  polygons that are each perfectly valid ON THEIR OWN can overlap by a hectare, and a
     *  population joined to both counts that hectare's people TWICE; a hectare that falls between
     *  them belongs to nobody and its people are in no total at all. Neither is visible on a map and
     *  neither is a defect of either geometry — the defect exists only in the pair, and until now
     *  nothing in this app could be asked about it.
     *
     *  ⚠⚠⚠ AN OVERLAP IS NOT AUTOMATICALLY AN ERROR, AND THIS DOOR REFUSES TO ASSUME IT IS.
     *  IntMap deliberately draws sets that overlap: two claimants to the same ground in a historical
     *  layer are a DISPUTE, two records of the same place from two sources are a DUPLICATE, and the
     *  join between two surveys is a SEAM — three different things that no measurement can tell
     *  apart (.agents/rules/historical-verification.md §2-5). So the caller says which conditions
     *  are being asserted, in the same three words for each:
     *    · 'forbid' — a violation is a FINDING and the set does not conform;
     *    · 'report' — measure it and return the geometry, but the set still conforms (this is the
     *      historical-dispute case: 「重なりを見たいが、誤りではない」);
     *    · 'allow'  — do not compute it at all (the default for every condition).
     *  A call that asserts nothing is refused (`coverage-nothing-asked`) rather than answered with a
     *  vacuous 「conforms: true」 — a green verdict nobody asked for is the shape
     *  [[intmap-restate-the-defect-not-the-fix]] warns about.
     *
     *  ⚠ THE OUTPUT IS GEOMETRY, NOT A COUNT. 「重複が3件」 sends a reader nowhere. Every finding
     *  carries the overlapping polygon, the gap polygon or the unmatched linework, in [-180,180] and
     *  in the same GeoJSON this kernel's ops take — so `coverage` → `area`, `coverage` → draw, or
     *  `coverage` → `difference` are one step each, and the op layer can register the findings as a
     *  dataset without recomputing anything.
     *
     *  ⚠ WHAT IS MEASURED, AND WITH WHAT:
     *    · overlaps — the pairwise INTERSECTION through boolOpR, the same sweep-line every other op
     *      asks. Features that merely touch intersect in nothing and are not reported, which is the
     *      same 「interiors」 rule the between-parts stage states above.
     *    · gaps — the HOLES of the union of the whole set. A hole in the union is ground the set
     *      encloses and does not cover. ⚠ The space BETWEEN two disconnected groups is not a hole
     *      and is not reported as a gap; that is what `cover` is for. ⚠⚠ NEITHER IS A SLIVER
     *      PINCHED AT BOTH ENDS, and that residual is measured rather than assumed — the note at
     *      stage ② says what was built, what it returned, and which check does find it.
     *    · uncovered — `cover` minus the union, when the caller states the extent the set is
     *      supposed to fill.
     *    · edge mismatches — the analogue of PostGIS ST_CoverageInvalidEdges: an edge of one feature
     *      that lies ALONG an edge of another (collinear, sharing more than a point) without being
     *      the same edge. That is the defect a reader cannot see and cannot fix by hand — one
     *      polygon split its side at a vertex the neighbour does not have, so the two boundaries
     *      agree as lines and disagree as edges, and every re-noding of that set moves the border.
     *      An edge with no collinear neighbour at all is the OUTSIDE of the coverage and is not a
     *      defect.
     *
     *  ⚠ BOTH TOLERANCES ARE DISTANCES IN KILOMETRES AND BOTH ARE THE CALLER'S. A 1 µm sliver
     *  between two municipal boundaries is the float64 the file was written with, not a hole in the
     *  world — but WHICH width stops being float64 and starts being a hole is a statement about the
     *  survey that produced the data, and this file has no basis for it. Default 0 = measure exactly
     *  as written.
     *    · a gap is TOLERATED when eroding it by half the tolerance leaves nothing — i.e. when no
     *      circle of that diameter fits inside it, which is what 「細い」 means for a shape that may
     *      be 10 km long and 1 mm wide. The erosion is bufferKm's own negative buffer, so there is
     *      one offset rule in this file and not two; it is an inscribed approximation (see the
     *      header) and errs by r·(1−cos(π/steps)), 3 m on a 5 km radius, in the direction of eroding
     *      slightly LESS than asked.
     *    · `edgeToleranceKm` is THE DISTANCE WITHIN WHICH TWO BOUNDARIES ARE TAKEN TO BE DESCRIBING
     *      THE SAME BORDER, which is the same thing PostGIS's tolerance is and is NOT only a
     *      forgiveness. It forgives in one direction — two edges whose ends match within it ARE the
     *      same edge, so the metre of rounding between two surveys of one border stops being a
     *      finding — and it widens in the other: two boundaries that run along each other within it
     *      without matching are a disagreement, which is how a sliver pinched at both ends (above)
     *      is found at all. At 0 it means what it says: only an exactly shared line is compared.
     *      ⚠ Measured as GEODESIC distances (haversineKm, pointToSegmentKm), never as degrees: a
     *      tolerance in degrees is a different distance at 60°N than at the equator, and the
     *      boundary files this reads are written at both.
     *
     *  ⚠ NO REPAIR, AND THAT IS A DECISION RATHER THAN AN OMISSION. Every fix for these defects is a
     *  CLAIM ABOUT THE DATA that geometry cannot supply: which of a gap's two neighbours should
     *  swallow it, which of two overlapping claimants owns the disputed hectare, which of two
     *  vertices is the surveyed one and which is the slip. repair() above may only do things that
     *  move no position, and none of these qualify — snapping a coverage moves vertices somebody
     *  measured. So the findings come back AS GEOMETRY and the caller applies its own stated rule
     *  with the ops that already exist (difference to cut an overlap out of one side, union to give
     *  a gap to a neighbour). ⚠ If a repair is ever added it must enumerate what it moved and which
     *  feature the ground came from, exactly as repair()'s `changes` does.
     *
     *  ⚠ THE SEAM IS HANDLED PER PAIR, NOT IN ONE GLOBAL PLANE. Aligning every feature to the first
     *  one breaks down for a worldwide set — two neighbours either side of the rounding boundary of
     *  alignTo's `k` land a whole turn apart — so the bounding-box prune canonicalises each box into
     *  [-180,180] AND KEEPS A SECOND COPY of any box that straddles the cut (the cylinder has two
     *  ends and a shape on the seam is at both), and every pair test then aligns its own two
     *  operands. A missed alignment can only cost a finding, never invent one. */

    /* SAME_EPS is a WIDTH IN DEGREES and everything below is a width in KILOMETRES, so it is
       converted ONCE, here, from the same radius every distance in this file uses — 1e-12° is
       1.1e-10 km ≈ 0.1 µm along a meridian. It is the FLOOR under a caller's tolerance and never a
       policy: at tolerance 0 it is what keeps float64 noise on an exactly shared edge from being
       read as a disagreement. */
    function epsKm() { const R = earthKm(); return (R == null) ? null : SAME_EPS * D2R * R; }

    const COVERAGE_MODES = ['forbid', 'report', 'allow'];

    function coverageGeometry(item) {
      if (!item || typeof item !== 'object') return null;
      /* A Feature is accepted because that is what a layer holds, and its properties are NOT read:
         which column names a unit is the dataset layer's question, and a geometry kernel that
         started reading attributes would be answering it in a second place. */
      if (item.type === 'Feature') return (item.geometry && typeof item.geometry === 'object') ? item.geometry : null;
      return item;
    }

    /* One box per part of a multi, in the plane toMulti left it in (rings unwrapped, so a
       seam-crossing part reads 179 → 181). */
    function multiBoxes(multi) {
      const out = [];
      for (const part of (multi || [])) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const ring of part) for (const p of ring) {
          if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
        }
        if (x0 !== Infinity) out.push([x0, y0, x1, y1]);
      }
      return out;
    }

    /* A box moved by whole turns until its centre is inside [-180,180], plus the copy at the other
       end of the cut when it straddles ±180. ⚠ Two entries for one shape is not a duplicate
       finding: every caller below keys what it has already reported on the PAYLOAD, not on the box. */
    function canonBoxes(box, of, out) {
      const k = Math.round(((box[0] + box[2]) / 2) / 360);
      const x0 = box[0] - k * 360, x1 = box[2] - k * 360;
      out.push({ x0: x0, y0: box[1], x1: x1, y1: box[3], of: of });
      if (x0 < -180) out.push({ x0: x0 + 360, y0: box[1], x1: x1 + 360, y1: box[3], of: of });
      else if (x1 > 180) out.push({ x0: x0 - 360, y0: box[1], x1: x1 - 360, y1: box[3], of: of });
    }

    function boxesTouch(a, b) {
      for (const s of a) for (const t of b) {
        if (s.x1 < t.x0 - SAME_EPS || t.x1 < s.x0 - SAME_EPS) continue;
        if (s.y1 < t.y0 - SAME_EPS || t.y1 < s.y0 - SAME_EPS) continue;
        return true;
      }
      return false;
    }

    /* Every pair of DIFFERENT features whose boxes meet, once each, through the one sweep. */
    function coveragePairs(feats, onPair) {
      const boxes = [];
      for (const f of feats) for (const b of multiBoxes(f.multi)) canonBoxes(b, f, boxes);
      const seen = new Set();
      sweepBoxes(boxes, (s, t) => {
        if (s.of === t.of) return true;
        const a = (s.of.i <= t.of.i) ? s.of : t.of;
        const b = (a === s.of) ? t.of : s.of;
        const key = a.i + ':' + b.i;
        if (seen.has(key)) return true;
        seen.add(key);
        return onPair(a, b) !== false;
      });
    }

    /* ── edges: the shared boundary, vertex for vertex ────────────────────────────────────────── */

    function coverageSegments(feats) {
      const segs = [];
      for (const f of feats) for (const part of f.multi) for (let r = 0; r < part.length; r++) {
        const pts = part[r], n = pts.length;
        /* Holes too: the inner boundary of a doughnut is shared with whatever sits in the hole, and
           an enclave whose edges do not match its host is the same defect as any other. */
        for (let e = 0; e < n; e++) segs.push({ f: f, r: r, e: e, a: pts[e], b: pts[(e + 1) % n], bad: false });
      }
      return segs;
    }

    /* `t` written in the 360° window nearest to `s`. Two edges that really lie along each other have
       midpoints less than a degree apart once the right turn is chosen, so the rounding is not
       close; two that do not are left where they are and fail the tests below anyway. */
    function shiftSeg(t, s) {
      const dx = 360 * Math.round((((s.a[0] + s.b[0]) / 2) - ((t.a[0] + t.b[0]) / 2)) / 360);
      return dx ? { a: [t.a[0] + dx, t.a[1]], b: [t.b[0] + dx, t.b[1]] } : t;
    }

    /* Do these two edges lie along each other WITHOUT being the same edge — the coverage defect
       ST_CoverageInvalidEdges names. Returns the overlapping stretch (as it runs on `s`) or null.
       ⚠ The parameter along `s` is computed in the lon/lat plane and CHOOSES points only; every
       distance compared against the tolerance is geodesic, which is the same division of labour
       pointToSegmentKm's own note describes. */
    function edgesDisagree(s, t0, tol) {
      const t = shiftSeg(t0, s);
      if ((haversineKm(s.a, t.a) <= tol && haversineKm(s.b, t.b) <= tol)
        || (haversineKm(s.a, t.b) <= tol && haversineKm(s.b, t.a) <= tol)) return null;   /* the same edge */
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
      const len2 = dx * dx + dy * dy;
      if (!(len2 > 0)) return null;
      const par = (p) => ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / len2;
      let u0 = par(t.a), u1 = par(t.b);
      if (u0 > u1) { const z = u0; u0 = u1; u1 = z; }
      const lo = Math.max(0, u0), hi = Math.min(1, u1);
      if (!(hi > lo)) return null;
      const at = (u) => [s.a[0] + dx * u, s.a[1] + dy * u];
      const p0 = at(lo), p1 = at(hi);
      /* Meeting in at most a point — two boundaries that cross or touch at a corner share no
         stretch, and a stretch shorter than the tolerance is not a stretch the caller can see. */
      if (haversineKm(p0, p1) <= tol) return null;
      /* Both ends of the common stretch lie ON the other edge: asked of the stretch rather than of
         the endpoints, because a short edge lying inside a long one has endpoints nowhere near it
         and a test on those would answer about the wrong pair. */
      if (pointToSegmentKm(p0, t.a, t.b) > tol) return null;
      if (pointToSegmentKm(p1, t.a, t.b) > tol) return null;
      return [p0, p1];
    }

    /* A 2-position line put back inside [-180,180]: shifted by whole turns, and cut at the meridian
       when it straddles it — the same rule splitBack applies to a ring, for the one case a ring
       splitter cannot be handed (a single edge). The latitude at the cut is the planar interpolation
       _splitPolyToWindows also uses, so an edge and the ring it came from are cut at the same
       latitude. */
    function lineIntoWindow(seg) {
      const k = Math.round(((seg[0][0] + seg[1][0]) / 2) / 360);
      const a = [seg[0][0] - k * 360, seg[0][1]], b = [seg[1][0] - k * 360, seg[1][1]];
      const side = (a[0] > 180) ? 1 : (a[0] < -180) ? -1 : (b[0] > 180) ? 1 : (b[0] < -180) ? -1 : 0;
      if (!side) return [[a, b]];
      const cut = side * 180;
      const span = b[0] - a[0];
      if (!span) return [[a, b]];
      const u = (cut - a[0]) / span;
      if (!(u > 0 && u < 1)) return [[a, b]];
      const lat = a[1] + (b[1] - a[1]) * u;
      const far = (p) => ((p[0] * side > 180) ? [p[0] - side * 360, p[1]] : p);
      return [[far(a), (a[0] * side > 180) ? [-cut, lat] : [cut, lat]],
      [(a[0] * side > 180) ? [cut, lat] : [-cut, lat], far(b)]];
    }

    function linesGeometry(segs) {
      const out = [];
      for (const s of segs) for (const piece of lineIntoWindow(s)) out.push([[piece[0][0], piece[0][1]], [piece[1][0], piece[1][1]]]);
      if (!out.length) return null;
      return (out.length === 1) ? { type: 'LineString', coordinates: out[0] } : { type: 'MultiLineString', coordinates: out };
    }

    /* ── gaps ─────────────────────────────────────────────────────────────────────────────────── */

    /* Which features touch this ring. A gap's vertices come from the union of the set, so each of
       them lies on the boundary of at least one feature — asked that way rather than by distance,
       because 「近い」 needs a threshold and 「この地物の境界の上にある」 does not. */
    function ringNeighbours(ring, feats) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      if (x0 === Infinity) return [];
      const rb = [];
      canonBoxes([x0, y0, x1, y1], null, rb);
      const out = [];
      for (const f of feats) {
        if (!boxesTouch(rb, f.boxes)) continue;
        const pts = alignTo([ring], f.multi)[0];
        let hit = false;
        for (const part of f.multi) { for (const r of part) { for (const p of pts) if (onBoundary(p, r)) { hit = true; break; } if (hit) break; } if (hit) break; }
        if (hit) out.push(f.i);
      }
      return out;
    }

    /* Is this piece of ground narrower, everywhere, than the caller's tolerance: eroding it by half
       the tolerance leaves nothing. ⚠ The three answers are three answers — tolerated, not
       tolerated, and NOT MEASURABLE — and the third is reported as itself rather than folded into
       either (.agents/rules/one-pass-or-a-reason.md §5: 「確認できなかった」 is not 「失敗した」). */
    function narrowerThan(geom, tolKm) {
      if (!(tolKm > 0)) return { tolerated: false, erosion: 'not-asked' };
      const r = bufferKmR(geom, -tolKm / 2);
      if (!r.ok) return { tolerated: false, erosion: 'unmeasured', why: r.why };
      return { tolerated: r.geometry == null, erosion: (r.geometry == null) ? 'empty' : 'survives' };
    }

    /* Each part of a geometry on its own, so a finding is one piece of ground rather than a bag. */
    function partsAsPolygons(g) {
      if (!g) return [];
      if (g.type === 'Polygon') return [g];
      if (g.type === 'MultiPolygon') return (g.coordinates || []).map((rings) => ({ type: 'Polygon', coordinates: rings }));
      return [];
    }

    /* ── coverage ─────────────────────────────────────────────────────────────────────────────── */

    /* coverage(features, opts) →
         { ok:true, value: {
             conforms,                       ← nothing the caller FORBADE was found
             asked:     { overlaps, gaps, edges, cover, gapToleranceKm, edgeToleranceKm },
             counts:    { features, areal, overlap, gap, uncovered, edge, tolerated },
             findings:  [{ kind, features:[i…], geometry, detail }],   ← forbidden, and found
             tolerated: [{ … same shape … }],                          ← 'report', or within tolerance
             truncated } }
         { ok:false, why }
       `kind` is one of 'overlap' | 'gap' | 'uncovered' | 'edge-mismatch'; `features` holds INDEXES
       INTO THE ARRAY THE CALLER PASSED (a gap's are its neighbours, an uncovered piece's is empty),
       and `geometry` is GeoJSON in [-180,180] — a Polygon for the first three, a LineString or
       MultiLineString for the fourth. */
    function coverage(items, opts) {
      const list = Array.isArray(items) ? items : null;
      if (!list || !list.length) return NO('missing-geometry');
      const o = opts || {};
      const mode = (v) => ((v == null) ? 'allow' : String(v));
      const wantOverlaps = mode(o.overlaps), wantGaps = mode(o.gaps), wantEdges = mode(o.edges);
      const asked = [['overlaps', wantOverlaps], ['gaps', wantGaps], ['edges', wantEdges]];
      for (const pair of asked) {
        if (COVERAGE_MODES.indexOf(pair[1]) < 0) return NO('coverage-unknown-condition', { condition: pair[0], got: pair[1], expected: COVERAGE_MODES.slice() });
      }
      const cover = (o.cover && typeof o.cover === 'object') ? o.cover : null;
      if (o.cover != null && !cover) return NO('coverage-bad-extent', { got: (o.cover === null) ? 'null' : typeof o.cover });
      if (wantOverlaps === 'allow' && wantGaps === 'allow' && wantEdges === 'allow' && !cover) return NO('coverage-nothing-asked', { expected: ['overlaps', 'gaps', 'edges', 'cover'] });
      const gapTol = (o.gapToleranceKm == null) ? 0 : +o.gapToleranceKm;
      const edgeTol = (o.edgeToleranceKm == null) ? 0 : +o.edgeToleranceKm;
      if (!(isFinite(gapTol) && gapTol >= 0)) return NO('bad-tolerance', { which: 'gapToleranceKm', got: o.gapToleranceKm });
      if (!(isFinite(edgeTol) && edgeTol >= 0)) return NO('bad-tolerance', { which: 'edgeToleranceKm', got: o.edgeToleranceKm });
      if (!available()) return NO('clipper-unavailable');
      const eps = epsKm();
      if (eps == null) return NO('geodesy-unavailable');

      const limit = (o.limit != null) ? Math.max(0, o.limit | 0) : 200;
      const findings = [], tolerated = [];
      let truncated = false;
      /* `keep` is the caller's word for this condition, so one adder serves all four kinds and
         'report' cannot accidentally make a set non-conforming. */
      function add(keep, kind, feats, geometry, detail) {
        if (limit && (findings.length + tolerated.length) >= limit) { truncated = true; return false; }
        const where = (keep === 'forbid') ? findings : tolerated;
        where.push({ kind: kind, features: feats || [], geometry: geometry || null, detail: detail || null });
        return true;
      }

      /* Every input converted ONCE, through the same door the ops use. A feature with no interior
         (a point layer, a null geometry) is not a coverage defect and is not an error either — it is
         counted and skipped, and `counts.areal` is what the rest of the answer is about. */
      const feats = [];
      for (let i = 0; i < list.length; i++) {
        const g = coverageGeometry(list[i]);
        if (!g) continue;
        const m = toMulti(g);
        if (m === null) return NO('geometry-wraps-world', { feature: i });
        if (!m.length) continue;
        const boxes = [];
        for (const b of multiBoxes(m)) canonBoxes(b, null, boxes);
        feats.push({ i: i, geom: g, multi: m, boxes: boxes });
      }

      /* ① overlaps — the pairwise intersection, through the same sweep-line every op asks. */
      if (wantOverlaps !== 'allow' && feats.length > 1) {
        let refusal = null;
        coveragePairs(feats, (a, b) => {
          const r = boolOpR('intersection', a.geom, b.geom);
          if (!r.ok) { refusal = r; return false; }
          if (!r.geometry) return true;                    /* disjoint, or touching: no common interior */
          for (const piece of partsAsPolygons(r.geometry)) if (!add(wantOverlaps, 'overlap', [a.i, b.i], piece, null)) return false;
          return true;
        });
        if (refusal) return refusal;
      }

      /* ② and ③ — both need the union of the whole set, so it is computed once. */
      let united = null;
      if (wantGaps !== 'allow' || cover) {
        const u = unionR(feats.map((f) => f.geom));
        if (!u.ok) return u;
        united = u.geometry;
      }

      /* ② gaps — the HOLES of that union: ground the set encloses and does not cover.
         ⚠⚠⚠ AND A PINCHED SLIVER IS NOT A HOLE, WHICH IS MEASURED HERE RATHER THAN ASSUMED. A
         square whose neighbour draws the shared side 5.6 cm into its own ground leaves a lens of
         nobody’s land between them — and because the two boundaries MEET at the two ends of that
         lens, the sweep-line returns the union as two parts touching at two points, with no inner
         ring anywhere. A complement taken against an enclosing frame does not find it either, and
         that was built and measured before this comment was written: `difference(frame, set)`
         comes back as ONE part carrying the two features as holes, because the lens is connected
         to the outside THROUGH those two points. Any construction that asks a boolean engine
         「which components are enclosed」 gets the same answer, so that machinery was removed
         rather than kept for the shape of it.
         ⇒ THE PINCHED CASE IS FOUND BY THE EDGE CHECK, at a matching distance the caller states:
         the two boundaries run along each other within that distance and are not the same edge.
         A reader who wants slivers asks `edges` with `edgeToleranceKm`, and this note is here so
         that 「gaps: forbid が 0 件」 is not read as 「隙間は無い」.
         ⚠ The space BETWEEN two disconnected groups is not a hole either, and that one is what
         `cover` is for. */
      if (wantGaps !== 'allow' && united) {
        let stop = false;
        for (const part of partsAsPolygons(united)) {
          if (stop) break;
          const rings = part.coordinates || [];
          for (let r = 1; r < rings.length && !stop; r++) {
            const ring = ringPositions(rings[r]);
            if (ring.length < 3) continue;
            const hole = { type: 'Polygon', coordinates: [closeRing(ring)] };
            const narrow = narrowerThan(hole, gapTol);
            const detail = { toleranceKm: gapTol, erosion: narrow.erosion };
            if (narrow.why) detail.why = narrow.why;
            if (!add(narrow.tolerated ? 'report' : wantGaps, 'gap', ringNeighbours(ring, feats), hole, detail)) stop = true;
          }
        }
      }

      /* ③ uncovered — the extent the caller says the set fills, minus what it fills. */
      if (cover) {
        const d = united ? boolOpR('difference', cover, united) : OK(cover);
        if (!d.ok) return d;
        if (d.geometry) {
          for (const piece of partsAsPolygons(d.geometry)) {
            const narrow = narrowerThan(piece, gapTol);
            const detail = { toleranceKm: gapTol, erosion: narrow.erosion };
            if (narrow.why) detail.why = narrow.why;
            if (!add(narrow.tolerated ? 'report' : 'forbid', 'uncovered', [], piece, detail)) break;
          }
        }
      }

      /* ④ edge mismatches — collected per feature, because the linework a reader has to go and fix
         belongs to one polygon's boundary even though the defect is in the pair. */
      if (wantEdges !== 'allow' && feats.length > 1) {
        const tol = Math.max(edgeTol, eps);
        const segs = coverageSegments(feats);
        const boxes = [];
        for (const s of segs) canonBoxes([Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])], s, boxes);
        const perFeature = new Map();
        sweepBoxes(boxes, (p, q) => {
          const s = p.of, t = q.of;
          if (s.f === t.f) return true;                     /* one feature's own edges are validate()'s subject */
          if (!edgesDisagree(s, t, tol)) return true;
          for (const seg of [s, t]) {
            if (seg.bad) continue;
            seg.bad = true;
            if (!perFeature.has(seg.f.i)) perFeature.set(seg.f.i, []);
            perFeature.get(seg.f.i).push([seg.a, seg.b]);
          }
          return true;
        });
        const order = Array.from(perFeature.keys()).sort((x, y) => x - y);
        for (const fi of order) {
          const lines = perFeature.get(fi);
          if (!add(wantEdges, 'edge-mismatch', [fi], linesGeometry(lines), { edges: lines.length, toleranceKm: edgeTol })) break;
        }
      }

      const counts = { features: list.length, areal: feats.length, overlap: 0, gap: 0, uncovered: 0, edge: 0, tolerated: tolerated.length };
      const bucket = { 'overlap': 'overlap', 'gap': 'gap', 'uncovered': 'uncovered', 'edge-mismatch': 'edge' };
      for (const f of findings) counts[bucket[f.kind]]++;
      return {
        ok: true,
        value: {
          conforms: findings.length === 0,
          asked: { overlaps: wantOverlaps, gaps: wantGaps, edges: wantEdges, cover: !!cover, gapToleranceKm: gapTol, edgeToleranceKm: edgeTol },
          counts: counts,
          findings: findings,
          tolerated: tolerated,
          truncated: truncated,
        },
      };
    }

    /* ── what this kernel can be ASKED FOR BY NAME, and what each asking needs (#R819) ──────────
       ⚠ ONE ENTRY DISPATCHES AND DECLARES. The function in `fn` is THE function the door above
       exposes — the same object, not a second spelling of it — and `needs` names the borrowed
       things that call may consult. Splitting the two apart is the shape
       .agents/rules/no-ad-hoc-hardcoding.md forbids: a list beside the dispatcher goes out of step
       the first time an operation is added, and the one that goes stale is always the list.
       ⚠ `needs` IS CONSERVATIVE AND SAYS SO. `intersects` reaches the sweep line only when BOTH
       operands are areal, and `repair` only when parts have to be re-noded — but whether this call
       is that call is a property of the DATA, and a door that answered 「運べる」 and then refused
       in the other thread would have spent a thread to say it. What is verified rather than
       asserted is the other direction: tests/gis-geometry-portable-checks drives every entry
       through a kernel built with the dep withheld and requires the refusal this table predicts,
       so a wrong `needs` is a red test and not a silent claim.
       ⚠ THE READABLE DOORS ARE THE ONES DISPATCHED. A refusal has to survive the trip — the loose
       twins answer `null` for 「答えは空だった」 and 「答えられなかった」 alike (#R743), and a null
       arriving through postMessage is exactly the 「該当なし」 that defect was about. */
    const OPS = {
      union: { fn: unionR, needs: ['clipper'] },
      intersection: { fn: (a, b) => boolOpR('intersection', a, b), needs: ['clipper'] },
      difference: { fn: (a, b) => boolOpR('difference', a, b), needs: ['clipper'] },
      dissolve: { fn: unionR, needs: ['clipper'] },
      bufferKm: { fn: bufferKmR, needs: ['clipper', 'geodesy'] },
      intersects: { fn: intersectsR, needs: ['clipper'] },
      contains: { fn: containsR, needs: ['clipper'] },
      within: { fn: withinR, needs: ['clipper'] },
      disjoint: { fn: disjointR, needs: ['clipper'] },
      distanceKm: { fn: distanceKmR, needs: ['clipper', 'geodesy'] },
      areal: { fn: arealR, needs: [] },
      /* Ray casting and the topology walks, which are arithmetic over the positions themselves —
         these are the ones that travel today, and `validate` is the expensive one (the header's own
         「6 million edges」 is this walk). */
      pointInGeometry: { fn: pointInGeometry, needs: [] },
      validate: { fn: validate, needs: [] },
      repair: { fn: repair, needs: ['clipper'] },
      coverage: { fn: coverage, needs: ['clipper', 'geodesy'] },
    };

    function opNames() { return Object.keys(OPS); }
    function hasDep(dep) { return (dep === 'clipper') ? available() : !!geodesy(); }
    /* The borrowed things THIS kernel was not given, for one operation. Asked of the kernel the
       other thread builds (`PORTABLE` below), it is the answer to 「その演算はあちらで走るのか」 —
       derived by the code that would run it rather than predicted by a list. */
    function unmet(op) {
      const rec = Object.prototype.hasOwnProperty.call(OPS, String(op)) ? OPS[String(op)] : null;
      return rec ? rec.needs.filter((d) => !hasDep(d)) : null;
    }

    /* ⚠ THE VOCABULARY OF THE REFUSALS IS js/gis-worker.js's OWN, not a second one: that file
       answers `geometry-op-unavailable` (with the set that WAS there) and `geometry-args-invalid`
       for the same two facts about the same call, and two spellings of one fact is the drift this
       repository keeps paying for. Nothing here adds a code a reader has no sentence for. */
    function callOp(spec) {
      const op = (spec && spec.op != null) ? String(spec.op) : '';
      const rec = (op && Object.prototype.hasOwnProperty.call(OPS, op)) ? OPS[op] : null;
      if (!rec) return { ok: false, why: 'geometry-op-unavailable', detail: { op: op || null, have: opNames() } };
      const args = (spec && Array.isArray(spec.args)) ? spec.args : null;
      if (!args) return { ok: false, why: 'geometry-args-invalid', detail: { op: op, got: (spec && spec.args === undefined) ? 'undefined' : typeof (spec && spec.args) } };
      const out = rec.fn.apply(null, args);
      /* A refusal the operation wrote travels as that refusal. Everything else — a geometry, a
         boolean, a report, `repair`'s {geometry, changes, remaining} — travels WHOLE: reading one
         field out of it here would be this door deciding which half of somebody else's answer the
         other thread is allowed to see. */
      if (out && typeof out === 'object' && out.ok === false) return out;
      return { ok: true, value: out };
    }

    const KERNEL = {
      available,
      union, intersection, difference, dissolve, bufferKm,
      intersects, contains, within, disjoint, distanceKm,
      pointInGeometry,
      /* ⚠ VALIDITY IS A FACT ABOUT A GEOMETRY, SO IT LIVES BESIDE THE OPERATIONS AND NOT INSIDE ONE
         (#R752). Both doors already return the readable shape, so neither has a loose twin above and
         neither is repeated inside `attempt` — one name, one place. See the block above for what is
         reported, what is refused by name, and why a ring's winding is a note and not a defect. */
      validate, repair,
      /* ⚠ AND THE FOURTH STAGE IS ABOUT A SET, SO IT TAKES A SET AND THE CONDITIONS SOMEBODY
         ASSERTS ABOUT IT (#R819). validate() answers 「この幾何は幾何か」 and cannot answer
         「この区域群は区分か」 — see the block above coverage() for what is measured, why an
         overlap is not automatically an error, and why no repair is offered. Readable shape
         only, for the same reason validate and repair have no loose twin. */
      coverage,
      /* ⚠ (#R819) 条件の語は、それを受理する側が publish する。A caller — js/gis-ops.js's
         `coverage` op, and the panel that draws its parameters — has to offer 'forbid' / 'report' /
         'allow' to a reader, and a set retyped there is the copy that refuses the fourth word the
         day this kernel grows one (.agents/rules/no-ad-hoc-hardcoding.md §1). ⚠ AND IT IS THE SET
         coverage() ITSELF TESTS AGAINST, not a second spelling of it: the same array the refusal
         `coverage-unknown-condition` hands back as `expected`, copied only so a caller cannot edit
         the kernel's own. */
      coverageModes: () => COVERAGE_MODES.slice(),
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
      /* (#R819) what can be asked by name, what that asking borrows, and what THIS kernel is
         missing for it — the three questions the worker door asks of a dep-less kernel. */
      ops: opNames, requires: (op) => { const r = Object.prototype.hasOwnProperty.call(OPS, String(op)) ? OPS[String(op)] : null; return r ? r.needs.slice() : null; }, unmet: unmet,
      call: callOp,
    };

    /* The other thread arrives here and nowhere else (see the note on `call` above the factory). */
    if (call != null) return callOp(call);
    return KERNEL;
    }

    /* ── one kernel per (clipper, geodesy) pair ─────────────────────────────────────────────────
       ⚠ REBUILT ONLY WHEN THE BORROWED THINGS THEMSELVES CHANGE, which happens at most twice in a
       session (the sweep line resolves; js/geodesy.js publishes). Rebuilding per call would throw
       away the toMulti memo on every question — the header's 150-million-walk note — and reading
       window once at construction would freeze a `null` that arrived early. */
    let INST = null, INST_PC = null, INST_G = null;
    function K() {
      const g = geodesy();
      if (!INST || INST_PC !== PC || INST_G !== g) { INST = geomKernel({ clipper: PC, geodesy: g }); INST_PC = PC; INST_G = g; }
      return INST;
    }

    /* ⚠ THE KERNEL AS THE OTHER THREAD BUILDS IT: no clipper, no geodesy. It is what `worker.ops()`
       and `worker.ready()` ask, so 「あちらで走るか」 is answered by the same code that would run it
       — and it is also the object the public door's shape is READ from, so an operation added
       inside the kernel cannot be missing outside it. */
    const PORTABLE = geomKernel(null);

    /* Every name the kernel publishes, delegating to the CURRENT kernel. Derived, never listed:
       a hand-written façade is the list that silently drops whatever is added next. */
    function bindTo(path) {
      return function () {
        let t = K();
        for (let i = 0; i < path.length - 1; i++) t = t[path[i]];
        return t[path[path.length - 1]].apply(t, arguments);
      };
    }
    function delegated(node, path) {
      const out = {};
      for (const name of Object.keys(node)) {
        const v = node[name];
        if (typeof v === 'function') out[name] = bindTo(path.concat([name]));
        else if (v && typeof v === 'object') out[name] = delegated(v, path.concat([name]));
      }
      return out;
    }

    /* ══ (#R819) THE SAME KERNEL, IN THE OTHER THREAD ═════════════════════════════════════════════
       What is handed over is `geomKernel` ITSELF — js/gis-worker.js `provide()` evaluates its own
       source text there, so the bytes that answer in the worker are the bytes that answer here.
       ⚠ THE ARGUMENTS ARE THE FACTORY'S OWN: `[deps, call]`, with `deps` null because nothing this
       kernel borrows survives postMessage (see the header). `request()` is the only place that
       shape is written, so no caller writes it twice. */
    const WORKER_OP = 'kernel';

    function workerOps() { return PORTABLE.ops().filter((op) => !PORTABLE.unmet(op).length); }

    function workerReady(w, op) {
      const name = (typeof op === 'string') ? op : '';
      const provided = (w && typeof w.geometryReady === 'function') ? w.geometryReady(WORKER_OP) : null;
      if (!provided || !provided.ok) return provided || { ok: false, why: 'geometry-op-unavailable', detail: { op: WORKER_OP, have: [] } };
      const need = PORTABLE.unmet(name);
      if (need === null) return { ok: false, why: 'geometry-op-unavailable', detail: { op: name || null, have: workerOps() } };
      /* ⚠ NAMED BEFORE A POLYGON IS COPIED, in the kernel's own vocabulary — the refusal a caller
         would otherwise have received after a spawn, a clone and a sweep that never started
         (.agents/rules/one-pass-or-a-reason.md §4). */
      if (need.length) return { ok: false, why: (need[0] === 'clipper') ? 'clipper-unavailable' : 'geodesy-unavailable', detail: { op: name, needs: PORTABLE.requires(name), missing: need } };
      return { ok: true, op: name };
    }

    function workerRequest(op, args) { return { op: WORKER_OP, args: [null, { op: (typeof op === 'string') ? op : '', args: args }] }; }

    /* Provided ONCE, and ASKED rather than remembered: js/gis-worker.js counts a registry change as
       a revision and retires idle workers built from an older one, so providing on every call would
       spawn a fresh thread per call. */
    function workerInstall(w) {
      for (const k of ['provideGeometry', 'geometryOps', 'geometryReady']) {
        if (!w || typeof w[k] !== 'function') return { ok: false, reason: 'worker-door-invalid', detail: { missing: k } };
      }
      try {
        if (w.geometryOps().indexOf(WORKER_OP) < 0) {
          const r = w.provideGeometry(WORKER_OP, geomKernel);
          if (!r || !r.ok) return { ok: false, reason: (r && r.why) || 'library-not-provided', detail: (r && r.detail) || null };
        }
        return { ok: true, op: WORKER_OP, ops: workerOps() };
      } catch (e) {
        return { ok: false, reason: 'worker-door-invalid', detail: { message: String((e && e.message) || e) } };
      }
    }

    /* ⚠ (#R749) THE VERSION OF THIS KERNEL. Same reason and same keeper as js/gis-ops.js
       KERNEL_VERSION — the boolean engine is where #R743's union defect actually lived, so a saved
       recipe that replays through a different geometry kernel can land on different numbers.
       scripts/gis-kernel-versions.mjs holds the sha256 that keeps this honest. */
    /* (#R783) geom-1 -> geom-2: A REPLAYED STEP NOW GETS A DIFFERENT ANSWER, in both doors, and the
       choice this gate exists to force is not a close one. `validate` answers `valid: false` for a
       MultiPolygon whose parts cover common ground — two squares overlapping in a quarter of their
       area were VALID before today — so a saved `validate` step re-runs to different columns, and
       measured on data/ecoregions_2017.geojson that is 126 of its 635 MultiPolygons. `repair` unions
       parts that overlap, nest or repeat, so a saved `repair` step replays to a geometry with fewer
       parts and LESS AREA than the one it produced last week. Both differences are corrections, and
       both are exactly the kind of thing a reader comparing two loads of one project is entitled to
       have announced.
       ⚠ AND THE THIRD DIFFERENCE IS THE LARGEST, because it is a wrong number becoming a right one
       rather than a new statement: alignTo was reading a MultiPolygon as a list of rings (see its
       note), so `intersection`, `difference`, `union` and `bufferKm` between operands written a
       whole turn apart were computed 360° apart in the plane. Measured: an intersection of 72,561
       km² came back EMPTY, a union of 362,769 km² came back 435,331 km², and a 5 km buffer came back
       437,364 km² where the shape's own perimeter caps it at 348,513. Every saved step that ever
       crossed that case replays to a different — correct — answer. */
    /* ⚠ (#R819) NOT RAISED, AND THE CHOICE IS THE ONE THIS GATE EXISTS TO FORCE. The round wrapped
       the arithmetic in a factory and added a door to the other thread; it did not change one rule
       of meaning — same precedence of the seam, same refusals, same tolerances, same sweep — so a
       recipe saved last week replays to the same numbers. New capability is not a changed answer.
       (The hash in scripts/gis-kernel-versions.mjs does change, and is re-recorded there.) */
    const KERNEL_VERSION = 'geom-2';
    const API = Object.assign(delegated(PORTABLE, []), {
      /* (#R749) see KERNEL_VERSION above — js/gis-project.js records which engine answered. */
      version: () => KERNEL_VERSION,
      /* The dynamic import of the sweep line, which is this side's business and not the kernel's. */
      ready,
      /* (#R819) the other thread. `install` provides the kernel itself; `ops` is what a dep-less
         kernel can complete, `ready` refuses by name before a shape is copied, and `request` is the
         one place the payload shape is written. */
      worker: {
        install: workerInstall,
        op: WORKER_OP,
        ops: workerOps,
        ready: workerReady,
        request: workerRequest,
        /* The function itself, so a caller that assembles its own door ships the same bytes. */
        kernelFunction: () => geomKernel,
      },
    });
    try { window.IntMapGisGeometry = API; } catch (_) { }
    return API;
  })();
}
