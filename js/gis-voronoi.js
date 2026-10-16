/* ============================================================================
 *  IntMap · NEAREST-SITE REGIONS ON THE SPHERE — the arithmetic behind `voronoi` (js/gis-ops.js)
 * ----------------------------------------------------------------------------
 *  「どこにとっても、いちばん近いのはどれか」 and its sharpest consequence, 「どの施設からも
 *  いちばん遠い場所はどこか」. Both are questions only a map can answer, and the layer had every
 *  piece except this one: nearestJoin answers it for rows somebody already has, and nothing answered
 *  it for the GROUND — the places nobody has a row for, which is where the farthest one is.
 *
 *  ══ WHAT IS COMPUTED, AND ON WHICH SURFACE ════════════════════════════════════════════════════
 *  The diagram is SPHERICAL, not planar. A cell is the set of points of the sphere nearer (in
 *  great-circle distance) to its site than to any other — an intersection of hemispheres, each
 *  bounded by the great circle that bisects two sites. A planar diagram drawn in lng/lat degrees
 *  would put the boundary between Sapporo and Naha somewhere that is not equidistant from them, by
 *  the same cos φ that docs/GIS-CORE.md §2.4 measures for areas; and it has no answer at all across
 *  the antimeridian or around a pole. On the sphere neither is a special case.
 *
 *    1. NEIGHBOURS — the Delaunay triangulation of points on a sphere IS their 3-D convex hull, so
 *       the hull's edges name every pair of sites whose cells share a border. Built incrementally
 *       with conflict lists (expected O(n log n)) in a seeded, therefore replayable, order.
 *    2. CELLS — each cell is CLIPPED by the bisecting planes of its candidates, on the TRUE
 *       positions. The hull only proposes candidates; it never decides a coordinate, so the
 *       robustness device below cannot move an answer.
 *    3. GROUND — the clipping starts from each of the eight octants of the sphere, so a cell comes
 *       out as up to eight pieces that each lie between two of the 0°/±90°/180° meridians on one
 *       side of the equator: no piece crosses the seam, and a pole is a CORNER of a piece rather
 *       than a point no lng/lat ring can contain. The great-circle edges are densified until the
 *       straight lng/lat chord is within tolerance of the true arc; js/gis-ops.js rejoins the
 *       pieces after it has cut them to the window.
 *
 *  ⚠ CO-CIRCULAR SITES ARE ORDINARY DATA, NOT AN EDGE CASE. Four sites at the corners of a lng/lat
 *  rectangle are symmetric about the middle meridian and therefore lie on one circle of the sphere
 *  — every gridded network of stations is full of them, and an exact hull cannot decide which
 *  diagonal to draw. So the hull is built on positions moved sideways by JITTER_RAD, and the cell
 *  is clipped against the candidates' neighbours AS WELL (the 2-ring): an edge the jitter could
 *  flip belongs to a pair that are 2-ring neighbours of each other. A site the hull still leaves
 *  out (coplanar with a face to within PLANE_EPS) is not dropped: it is given the vertices around
 *  the face it lies on, and they are given it — `orphans` counts them.
 *
 *  ⚠ THE TOLERANCES ARE NOT TUNED, THEY ARE THE SPHERE'S OWN ERROR. SPHERE_REL_ERR is the largest
 *  relative difference between this sphere and the WGS-84 ellipsoid that docs/GIS-CORE.md §2.4.1
 *  measured (0.56 %, on the equator, north–south). A bisector computed on the sphere stands that far
 *  from the ellipsoidal one; drawing it to a finer tolerance than that, or searching the farthest
 *  point to a finer tolerance than that, would be precision this surface does not have.
 *
 *  Pure arithmetic over coordinates: no `window`, no DOM, no registry — js/gis-ops.js hands in the
 *  radius it reads from js/geodesy.js and the point-in-polygon rule it reads from
 *  js/gis-geometry.js, so neither is a second copy here.
 * ==========================================================================*/
export function makeGisVoronoi() {
  return (function () {
    /* (voronoi) scripts/gis-kernel-versions.mjs keeps this honest: raise it when a replayed
       recipe would get a different answer. */
    const KERNEL_VERSION = 'voronoi-1';

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    /* OBSERVED: docs/GIS-CORE.md §2.4.1 — the spherical distance against Vincenty on WGS-84 over 7
       latitudes × 6 distances × 4 bearings, measured by tests/geo-gis-measure-checks.test.mjs; the
       largest relative error anywhere is 0.561 %. EXPIRES when this layer measures on the ellipsoid
       instead of the sphere. SOURCE: that section; this is the only copy that computes with it. */
    const SPHERE_REL_ERR = 0.0056;
    /* The sideways nudge the HULL is built on (never the cells). 1e-9 rad is 6.4 mm on this Earth:
       seven orders of magnitude above the float64 resolution of a unit vector (2.2e-16), so it
       decides every co-circular tie, and far below any distance an answer reports — which it cannot
       reach anyway, because cells are clipped on the true positions. EXPIRES if positions ever
       carry sub-centimetre meaning that two sites could be told apart by. */
    const JITTER_RAD = 1e-9;
    /* A point is beyond a face when its distance from the face's plane exceeds this (unit sphere).
       The error of that distance is a few float64 ulps of the coordinates (~1e-16) because the
       normal's direction error and the lever arm cancel (both scale with the face size), so 1e-15
       is above the noise; the jitter puts a co-circular site ~JITTER_RAD × spacing off the plane,
       which is above this for any two sites more than ~1 m apart. */
    const PLANE_EPS = 1e-15;
    /* A unit vector whose equatorial component is below this IS the pole (6 µm). */
    const POLE_EPS = 1e-12;

    /* ── vectors ───────────────────────────────────────────────────────────────────────────── */
    function vec(lng, lat) { const la = lat * D2R, lo = lng * D2R, c = Math.cos(la); return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function unit(a) { const l = Math.sqrt(dot(a, a)); return (l > 0 && isFinite(l)) ? [a[0] / l, a[1] / l, a[2] / l] : null; }
    /* The central angle, by atan2 of |a×b| and a·b — well-conditioned at 0 and at π, where acos of a
       dot product loses half its digits. */
    function angle(a, b) { const c = cross(a, b); return Math.atan2(Math.sqrt(dot(c, c)), dot(a, b)); }

    /* A deterministic stream per site, so the same sites replay to the same hull. xorshift32. */
    function hash01(i, k) {
      let x = ((i + 1) * 0x9E3779B1 + (k + 1) * 0x85EBCA77) | 0;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return ((x >>> 0) / 4294967296) * 2 - 1;
    }
    function jittered(p, i) {
      const ax = (Math.abs(p[0]) < 0.9) ? [1, 0, 0] : [0, 1, 0];
      const e = unit(cross(p, ax)), f = cross(p, e);
      const a = JITTER_RAD * hash01(i, 0), b = JITTER_RAD * hash01(i, 1);
      return unit([p[0] + a * e[0] + b * f[0], p[1] + a * e[1] + b * f[1], p[2] + a * e[2] + b * f[2]]);
    }

    /* ── 1. the hull, which is the Delaunay triangulation of points on a sphere ─────────────── */
    /* Returns per-site neighbour sets, or null when the points do not span 3-D (all on one circle
       to within PLANE_EPS×1e2) — then every site is every site's candidate. */
    async function hullNeighbours(P, tick) {
      const n = P.length;
      let i1 = -1, best = -1;
      for (let i = 1; i < n; i++) { const d = sub(P[i], P[0]), q = dot(d, d); if (q > best) { best = q; i1 = i; } }
      let i2 = -1; best = -1;
      for (let i = 1; i < n; i++) { const c = cross(sub(P[i1], P[0]), sub(P[i], P[0])), q = dot(c, c); if (q > best) { best = q; i2 = i; } }
      const n0 = unit(cross(sub(P[i1], P[0]), sub(P[i2], P[0])));
      if (!n0) return null;
      let i3 = -1; best = -1;
      for (let i = 1; i < n; i++) { const q = Math.abs(dot(n0, sub(P[i], P[0]))); if (q > best) { best = q; i3 = i; } }
      if (!(best > PLANE_EPS * 100)) return null;

      const C = [0, 1, 2].map((k) => (P[0][k] + P[i1][k] + P[i2][k] + P[i3][k]) / 4);
      const FA = [], FB = [], FC = [], FN = [], FD = [], alive = [], conf = [], mark = [];
      const edge = new Map();
      const key = (u, v) => u * n + v;
      function face(a, b, c) {
        const f = FA.length;
        const nr = unit(cross(sub(P[b], P[a]), sub(P[c], P[a]))) || [0, 0, 0];
        FA.push(a); FB.push(b); FC.push(c); FN.push(nr); FD.push(dot(nr, P[a])); alive.push(1); conf.push([]); mark.push(0);
        edge.set(key(a, b), f); edge.set(key(b, c), f); edge.set(key(c, a), f);
        return f;
      }
      const sd = (f, p) => dot(FN[f], P[p]) - FD[f];
      /* The first four faces, wound so that the interior point C is behind each. Later faces inherit
         the winding of the horizon edge they are built on, which needs no reference point. */
      const simplex = [0, i1, i2, i3];
      for (const [a, b, c] of [[0, i1, i2], [0, i2, i3], [0, i3, i1], [i1, i3, i2]]) {
        const nr = cross(sub(P[b], P[a]), sub(P[c], P[a]));
        if (dot(nr, sub(C, P[a])) > 0) face(a, c, b); else face(a, b, c);
      }
      const pf = new Int32Array(n).fill(-1);
      const orphans = [];
      const inSimplex = new Set(simplex);
      for (let p = 0; p < n; p++) {
        if (inSimplex.has(p)) continue;
        for (let f = 0; f < 4; f++) if (sd(f, p) > PLANE_EPS) { pf[p] = f; conf[f].push(p); break; }
        if (pf[p] < 0) orphans.push(p);
      }
      /* A seeded shuffle: the expected O(n log n) of a randomised insertion, and the same order
         every time the same sites are given. */
      const order = [];
      for (let p = 0; p < n; p++) if (!inSimplex.has(p)) order.push(p);
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor((hash01(k, 7) + 1) / 2 * (k + 1)) % (k + 1); const t = order[k]; order[k] = order[j]; order[j] = t; }

      let stamp = 0;
      for (let oi = 0; oi < order.length; oi++) {
        if (tick && !(await tick())) return { cancelled: true };
        const p = order[oi];
        const f0 = pf[p];
        if (f0 < 0 || !alive[f0]) continue;
        stamp++;
        const vis = [f0]; mark[f0] = stamp;
        const horizon = [];
        for (let k = 0; k < vis.length; k++) {
          const f = vis[k];
          const es = [[FA[f], FB[f]], [FB[f], FC[f]], [FC[f], FA[f]]];
          for (const [u, v] of es) {
            const g = edge.get(key(v, u));
            if (g === undefined) continue;
            if (mark[g] === stamp) continue;
            if (sd(g, p) > PLANE_EPS) { mark[g] = stamp; vis.push(g); } else horizon.push([u, v]);
          }
        }
        const pending = [];
        for (const f of vis) {
          for (const q of conf[f]) if (q !== p) pending.push(q);
          alive[f] = 0; conf[f] = null;
          for (const [u, v] of [[FA[f], FB[f]], [FB[f], FC[f]], [FC[f], FA[f]]]) if (edge.get(key(u, v)) === f) edge.delete(key(u, v));
        }
        const made = [];
        for (const [u, v] of horizon) made.push(face(u, v, p));
        for (const q of pending) {
          pf[q] = -1;
          for (const f of made) if (sd(f, q) > PLANE_EPS) { pf[q] = f; conf[f].push(q); break; }
          if (pf[q] < 0) orphans.push(q);
        }
      }

      const nb = Array.from({ length: n }, () => new Set());
      for (let f = 0; f < FA.length; f++) {
        if (!alive[f]) continue;
        const a = FA[f], b = FB[f], c = FC[f];
        nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
      }
      /* ⚠ A SITE THE HULL LEFT OUT STILL HAS A CELL, AND ITS NEIGHBOURS STILL HAVE IT AS A
         NEIGHBOUR. It lies on the plane of some face of the final hull (co-circular with that
         face's three sites), so the face it is nearest to names where it is; it and the sites
         around that face are made each other's candidates. */
      const extra = Array.from({ length: n }, () => new Set());
      for (const q of orphans) {
        let bf = -1, bd = -Infinity;
        for (let f = 0; f < FA.length; f++) { if (!alive[f]) continue; const d = sd(f, q); if (d > bd) { bd = d; bf = f; } }
        if (bf < 0) continue;
        const around = new Set([FA[bf], FB[bf], FC[bf]]);
        for (const v of [FA[bf], FB[bf], FC[bf]]) for (const w of nb[v]) around.add(w);
        around.delete(q);
        for (const v of around) { extra[q].add(v); extra[v].add(q); }
      }
      return { nb, extra, orphans: orphans.length };
    }

    /* ── 2. a cell, clipped on the true positions ─────────────────────────────────────────── */
    /* ⚠ A CELL IS BUILT AS EIGHT PIECES, ONE PER OCTANT OF THE SPHERE, and that is what makes every
       case the same case. A clip that starts from a hemisphere is a lune after its second plane, and
       a lune's two vertices are antipodal — an edge of 180° has no minor arc, so the next clip has
       nothing well defined to cut. An octant is a spherical triangle with 90° edges, every clip of it
       stays inside it, and the eight of them tile the sphere: one site (the whole sphere), two (a
       hemisphere) and a pole inside a cell need no branch of their own. The octant planes are the
       0°/180° and ±90° meridians and the equator, so each piece also lies in one half of the
       longitudes — no piece crosses the seam, and a pole is a CORNER of a piece. */
    const OCTANTS = (() => {
      const out = [];
      for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
        const a = [sx, 0, 0], b = [0, sy, 0], c = [0, 0, sz];
        /* counter-clockwise seen from outside ⇔ det[a, b, c] > 0 */
        /* Its edges are meridians and the equator — straight in lng/lat, so never densified. */
        const tri = ((sx * sy * sz > 0) ? [a, b, c] : [a, c, b]).map((v) => ({ v: v, tol: Infinity, by: -1 }));
        out.push({ half: sy, tri: tri });
      }
      return out;
    })();
    /* Sutherland–Hodgman on the sphere. Every edge stays a minor arc because the polygon stays inside
       the octant it started as. The crossing point of arc a→b with the plane is |db|·a + |da|·b,
       normalised — the positive combination, so it is ON the arc and not its antipode.
       ⚠ EACH VERTEX CARRIES THE TOLERANCE OF THE EDGE THAT LEAVES IT, and a new edge gets the
       tolerance of the plane that made it (and `by`, the site that plane bisects against). A border between two cells is then densified by the SAME
       rule from both sides (the tolerance is a property of the pair of sites, not of either cell),
       so neighbouring regions share their border instead of leaving slivers between two drawings
       of it. */
    function clip(poly, m, tolNew, byNew) {
      const out = [];
      const L = poly.length;
      for (let k = 0; k < L; k++) {
        const A = poly[k], B = poly[(k + 1) % L];
        const a = A.v, b = B.v;
        const da = dot(a, m), db = dot(b, m);
        const ain = da >= 0, bin = db >= 0;
        if (ain) out.push({ v: a, tol: A.tol, by: A.by });
        if (ain !== bin) {
          const p = unit([a[0] * Math.abs(db) + b[0] * Math.abs(da), a[1] * Math.abs(db) + b[1] * Math.abs(da), a[2] * Math.abs(db) + b[2] * Math.abs(da)]);
          /* leaving: the edge from here runs along the plane; entering: it is the rest of a→b */
          if (p) out.push({ v: p, tol: ain ? tolNew : A.tol, by: ain ? byNew : A.by });
        }
      }
      /* consecutive vertices that are the same vertex (a plane through an existing vertex): the
         zero-length edge goes, and the edge that leaves the survivor is the one that left the second */
      const kept = [];
      for (const e of out) {
        const last = kept[kept.length - 1];
        if (last && angle(last.v, e.v) <= POLE_EPS) { last.tol = e.tol; last.by = e.by; continue; }
        kept.push({ v: e.v, tol: e.tol, by: e.by });
      }
      while (kept.length > 1 && angle(kept[0].v, kept[kept.length - 1].v) <= POLE_EPS) kept.pop();
      return kept;
    }

    /* ── 3. a piece of ground, as a lng/lat ring ──────────────────────────────────────────── */
    /* The longitude of a vector IN A PIECE on side `sgn` of the y = 0 plane (sgn > 0: [0, 180];
       sgn < 0: [-180, 0]). A vertex the clip put on the plane can come out a few ulps on the wrong
       side; it belongs to the meridian its x says (0 when x > 0, the seam when x < 0). */
    function lonLat(v, sgn) {
      const h = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (h < POLE_EPS) return { pole: v[2] > 0 ? 1 : -1, lon: null, lat: v[2] > 0 ? 90 : -90 };
      let lon = Math.atan2(v[1], v[0]) * R2D;
      if (sgn > 0 && lon < 0) lon = (v[0] < 0) ? 180 : 0;
      if (sgn < 0 && lon > 0) lon = (v[0] < 0) ? -180 : 0;
      return { pole: 0, lon: lon, lat: Math.atan2(v[2], h) * R2D };
    }
    function hav(lonA, latA, lonB, latB, R) {
      const s = Math.sin((latB - latA) * D2R / 2) ** 2 + Math.cos(latA * D2R) * Math.cos(latB * D2R) * Math.sin((lonB - lonA) * D2R / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    function ringOf(poly, sgn, R) {
      const pts = [];
      function emitArc(a, b, tolKm, depth) {
        const la = lonLat(a, sgn), lb = lonLat(b, sgn);
        /* A meridian (an end at a pole, or both ends on one meridian) is a straight line in lng/lat. */
        if (la.pole || lb.pole || la.lon === lb.lon || depth > 40) return;
        const m = unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
        if (!m) return;
        const lm = lonLat(m, sgn);
        if (hav(lm.lon, lm.lat, (la.lon + lb.lon) / 2, (la.lat + lb.lat) / 2, R) <= tolKm) return;
        emitArc(a, m, tolKm, depth + 1); pts.push(lm); emitArc(m, b, tolKm, depth + 1);
      }
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k].v, b = poly[(k + 1) % poly.length].v;
        pts.push(lonLat(a, sgn));
        if (poly[k].tol < Infinity) emitArc(a, b, poly[k].tol, 0);
      }
      /* A pole is a LINE of the plane, not a point: it becomes the two ends of the pole edge, at
         the longitudes of the meridians that arrive at it and leave it. */
      const N = pts.length, out = [];
      let polar = false;
      const lonNear = (k, step) => { for (let s = 1; s < N; s++) { const e = pts[((k + step * s) % N + N) % N]; if (!e.pole) return e.lon; } return 0; };
      for (let k = 0; k < N; k++) {
        const e = pts[k];
        if (!e.pole) { out.push([e.lon, e.lat]); continue; }
        polar = true;
        const before = lonNear(k, -1), after = lonNear(k, 1);
        out.push([before, e.lat]);
        if (after !== before) out.push([after, e.lat]);
      }
      const ring = [];
      for (const p of out) { const l = ring[ring.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) ring.push(p); }
      while (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      if (ring.length < 3) return null;
      ring.push([ring[0][0], ring[0][1]]);
      return { ring, polar };
    }

    /* ══ the door ═════════════════════════════════════════════════════════════════════════════
       positions: [[lng, lat], …], already distinct (the caller decides what a duplicate row means).
       opts: { earthKm (required), tick?: async () => boolean }.
       Returns { ok, cells: [{ ok, pieces: [{ ring, half }…], polar, radiusKm, neighbours, edgeTolKm }], method, orphans } —
       `half` is the sign of y the piece lies on (1: longitudes [0, 180], -1: [-180, 0]). */
    async function cells(positions, opts) {
      const o = opts || {};
      const R = o.earthKm;
      if (!(typeof R === 'number' && R > 0 && isFinite(R))) return { ok: false, why: 'geodesy-unavailable' };
      const n = Array.isArray(positions) ? positions.length : 0;
      if (!n) return { ok: false, why: 'no-features' };
      const S = positions.map((p) => vec(p[0], p[1]));
      const tick = (typeof o.tick === 'function') ? o.tick : null;

      let method = 'all-pairs', orphans = 0, H = null;
      if (n >= 5) {
        H = await hullNeighbours(S.map(jittered), tick);
        if (H && H.cancelled) return { ok: false, why: 'cancelled' };
        if (H) { method = 'hull'; orphans = H.orphans; }
      }
      const candidatesOf = (i) => {
        if (!H) { const all = []; for (let j = 0; j < n; j++) if (j !== i) all.push(j); return all; }
        const set = new Set();
        for (const j of H.nb[i]) { set.add(j); for (const k of H.nb[j]) set.add(k); }
        for (const j of H.extra[i]) set.add(j);
        set.delete(i);
        return Array.from(set);
      };

      const out = [];
      for (let i = 0; i < n; i++) {
        if (tick && !(await tick())) return { ok: false, why: 'cancelled' };
        const cands = candidatesOf(i);
        cands.sort((a, b) => dot(S[b], S[i]) - dot(S[a], S[i]));
        const planes = cands.map((j) => sub(S[i], S[j]));
        /* The bisector of i and j stands SPHERE_REL_ERR of their half-separation from the
           ellipsoidal one; its chord may deviate from the arc by no more than that. */
        const tols = cands.map((j) => SPHERE_REL_ERR * R * angle(S[i], S[j]) / 2);
        const pieces = [];
        const borders = new Set();
        let polar = false, rad = 0, edgeTol = 0;
        for (const oct of OCTANTS) {
          let poly = oct.tri;
          for (let k = 0; k < planes.length && poly.length >= 3; k++) poly = clip(poly, planes[k], tols[k], cands[k]);
          if (poly.length < 3) continue;
          const r = ringOf(poly, oct.half, R);
          if (!r) continue;
          pieces.push({ ring: r.ring, half: oct.half });
          if (r.polar) polar = true;
          /* The cell lies inside the cap around its site whose radius is its farthest vertex (a
             convex spherical polygon is the hull of its vertices) — the reach a window is sought in. */
          for (const e of poly) {
            const a = angle(S[i], e.v); if (a > rad) rad = a;
            if (e.by >= 0) { borders.add(e.by); if (e.tol > edgeTol) edgeTol = e.tol; }
          }
        }
        /* `neighbours` — the sites this region actually shares a border with (its Voronoi
           neighbours). A drawn border stands up to `edgeTolKm` from the true one, so a place just
           inside the drawing may be nearer to one of them: the farthest search measures the distance
           to the NEAREST of the site and these, never to the site alone. The cap the window is sought
           in grows by the same amount, because a chord can bow that far outside the arc. */
        out.push({ ok: pieces.length > 0, why: pieces.length ? null : 'cell-empty', pieces, polar,
          radiusKm: rad * R + edgeTol, neighbours: Array.from(borders).sort((a, b) => a - b), edgeTolKm: edgeTol });
      }
      return { ok: true, cells: out, method, orphans };
    }

    /* ══ the farthest place of a region from the nearest site ════════════════════════════════════
       f(x) = the distance from x to the NEAREST of `site` and `others` (its neighbours). Inside the
       true region that is the distance to the site, which has no local maximum on the sphere except
       at its antipode — so the maximum over the region is ON ITS BOUNDARY, and the boundary is
       searched by branch and bound: along a straight lng/lat segment of path length ≤ S between ends
       where f is f1 and f2, nothing is above (f1 + f2 + S) / 2 (f is a minimum of 1-Lipschitz
       functions, so it is 1-Lipschitz), and S is bounded by the segment's metric at its widest
       latitude. A segment is split only while that bound exceeds the best found by more than
       SPHERE_REL_ERR of it.
       ⚠ THE DRAWN BORDER IS NOT THE TRUE ONE — it stands up to `slackKm` away (the cell's
       edgeTolKm) — so a vertex where three regions meet can sit just INSIDE the drawing, where f
       does have a maximum. f there exceeds the drawn border beside it by at most that distance, so
       the bound adds it; the answer `km` is still a value f actually takes, at `at`.
       Returns { km, at:[lng,lat], boundKm } — nothing in the region is farther than `boundKm` from
       its nearest site. */
    function farthest(site, rings, R, contains, others, slackKm) {
      const targets = [site].concat(Array.isArray(others) ? others : []).map((p) => vec(p[0], p[1]));
      const dist = (p) => { const v = vec(p[0], p[1]); let m = Infinity; for (const t of targets) { const a = angle(t, v); if (a < m) m = a; } return m * R; };
      const pathUB = (p, q) => {
        const minLat = (p[1] * q[1] <= 0) ? 0 : Math.min(Math.abs(p[1]), Math.abs(q[1]));
        const c = Math.cos(minLat * D2R), dlat = q[1] - p[1], dlon = q[0] - p[0];
        return R * D2R * Math.sqrt(dlat * dlat + c * c * dlon * dlon);
      };
      const slack = (typeof slackKm === 'number' && slackKm > 0) ? slackKm : 0;
      let best = -1, at = null;
      /* The antipode is the one interior maximum the site's distance has; if the region holds it,
         it is a candidate, and nothing can be proved below half the circumference. */
      const anti = [((site[0] + 360) % 360) - 180, -site[1]];
      const holdsAnti = typeof contains === 'function' && contains(anti);
      if (holdsAnti) { best = dist(anti); at = anti; }
      const stack = [];
      for (const ring of (rings || [])) {
        if (!Array.isArray(ring) || ring.length < 2) continue;
        const d = ring.map(dist);
        for (let k = 0; k < ring.length; k++) if (d[k] > best) { best = d[k]; at = ring[k]; }
        for (let k = 0; k + 1 < ring.length; k++) stack.push([ring[k], ring[k + 1], d[k], d[k + 1]]);
      }
      if (best < 0) return null;
      let bound = best;
      while (stack.length) {
        const [p, q, dp, dq] = stack.pop();
        const ub = (dp + dq + pathUB(p, q)) / 2;
        if (ub - best <= SPHERE_REL_ERR * best) { if (ub > bound) bound = ub; continue; }
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const dm = dist(m);
        if (dm > best) { best = dm; at = m; }
        stack.push([p, m, dp, dm], [m, q, dm, dq]);
      }
      const proved = holdsAnti ? Math.PI * R : Math.max(bound, best) + slack;
      return { km: best, at: at, boundKm: Math.min(proved, Math.PI * R) };
    }

    const API = {
      /* js/gis-project.js records which engine answered (engineNow discovers window.IntMapGis*). */
      version: () => KERNEL_VERSION,
      /* the one tolerance both searches use, handed to the runner so its stats can state it */
      sphereRelError: () => SPHERE_REL_ERR,
      cells,
      farthest,
    };
    try { window.IntMapGisVoronoi = API; } catch (_) { }
    return API;
  })();
}
