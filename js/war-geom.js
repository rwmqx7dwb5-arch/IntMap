/* ============================================================================
 *  IntMap · WAR GEOMETRY — cutting a country by a front line   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 A front line is a line, but 「勢力」 is an AREA,
 *  and the two must never be able to disagree. So the area is not stored: it is DERIVED from the line
 *  by this file, every time, on both sides of the build/ship boundary —
 *      · scripts/build-wars.mjs imports it to prove each curated line really cuts the country it
 *        claims to cut, and that named cities land under the side the record says held them;
 *      · js/war-fronts.js imports it to paint that same cut in the browser.
 *  One implementation, two callers, name-checked by tests/r175-checks ③. A second copy could drift,
 *  and the way it would drift is invisible: a fill that says Kharkov was German on a date when the
 *  line beside it runs sixty kilometres to the west.
 *
 *  ══ WHY THE AREA IS NOT SHIPPED ═════════════════════════════════════════════════════════════
 *  The Eastern Front alone has dozens of dated positions and the polygon it cuts is the Soviet Union —
 *  131 CShapes polygons. Shipping both sides of that cut once per date is tens of megabytes of almost
 *  identical coastline. Shipping the LINE is a few hundred points, and the coastline is already on the
 *  reader's machine (data/cshapes.js, which the time machine loads anyway).
 *
 *  == IT CUTS AS MANY TIMES AS THE LINE REALLY CROSSES =======================================
 *  WARNING: THE FIRST VERSION OF THIS FILE ALLOWED EXACTLY TWO CROSSINGS, and that was wrong about
 *  the world rather than strict about it. A chord drawn between two border towns crosses a real,
 *  wiggly frontier again and again; the Soviet Union is 136 polygons across 170 degrees of
 *  longitude. Measured against the record in scripts/wars/, the two-crossing rule rejected 34 of 41
 *  dated lines - every one of them a line the record actually gives. So the cut is general:
 *  crossings come in PAIRS along the path (it starts outside the country, so its arcs alternate
 *  inside / outside), each inside arc is a connector, and the pieces are traced from ring arcs
 *  joined by those connectors. An ODD count is still a fault and still refuses - it means the
 *  extension never left the country, and a cut computed from it would be arbitrary.
 *
 *  Coordinates are [lon, lat] degrees throughout. The cuts are computed in plain planar geometry:
 *  over one country at one moment the error is far below the precision the source lines carry.
 * ==========================================================================*/

/* ⚠ (#R349) ONE EXPORT, AND THAT IS A RULE OF THIS DIRECTORY, NOT A STYLE CHOICE. tests/r175-checks ③
   fails any top-level declaration in js/ that is not exported AND imported somewhere by name — the
   property that lets these files be bundled without changing a single name resolution. Half of what
   is below (`segX`, `pathSlice`, `ringSlice`, `clean`) is private arithmetic that nothing outside
   should import, so the whole module is one closure and the closure is the export. */
export const WarGeom = (function () {

  /* ── basics ─────────────────────────────────────────────────────────────────────────────────── */
  function bboxOfRings(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const p of r) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return [x0, y0, x1, y1];
  }

  function pointInRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Which side of the DIRECTED path a point lies on: −1 left, +1 right (0 only exactly on it).
     ⚠ The nearest segment decides, not the first one. A path that bends — every real front does — has
     segments whose infinite lines put the same point on opposite sides; only the segment the point is
     actually closest to describes the boundary near it. */
  function sideOfPath(pt, path) {
    let best = Infinity, sign = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = a[0] + t * dx, cy = a[1] + t * dy;
      const d = (pt[0] - cx) * (pt[0] - cx) + (pt[1] - cy) * (pt[1] - cy);
      if (d < best) { best = d; sign = Math.sign(dx * (pt[1] - a[1]) - dy * (pt[0] - a[0])); }
    }
    return sign || 1;
  }

  /* Push both ends of the path past the shape it has to cut, so a line quoted between two border
     towns still reaches the border itself. The extension follows the first/last segment's own
     bearing - it adds no claim the source did not make, it only stops the cut from ending in
     mid-country.
     WARNING: AND IT STOPS AS SOON AS IT IS OUT. The first version reached twice the polygon's own
     span, which for the Soviet Union is three hundred and forty degrees: the "extension" swung back
     across Asia and cut the country a second time, in a place no front ever was. It now grows until
     the end point is outside the polygons - a step at a time, to a hard ceiling - so the reach is
     set by the border it has to clear rather than by the size of the country behind it. */
  function extendPath(path, bbox, polys) {
    if (path.length < 2) return path.slice();
    const out = path.slice();
    const grow = (from, to) => {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const L = Math.hypot(dx, dy) || 1;
      let reach = 1.5;
      for (let k = 0; k < 12; k++) {
        const pt = [to[0] + (dx / L) * reach, to[1] + (dy / L) * reach];
        if (!polys || !pointInPolys(pt, polys)) return pt;
        reach *= 1.6;
      }
      return [to[0] + (dx / L) * reach, to[1] + (dy / L) * reach];
    };
    out.unshift(grow(path[1], path[0]));
    out.push(grow(path[path.length - 2], path[path.length - 1]));
    return out;
  }

  /* ── segment intersection ───────────────────────────────────────────────────────────────────── */
  function segX(p1, p2, p3, p4) {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (!d) return null;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, pt: [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] };
  }

  /* Every crossing of `ring` by `path`, in ring order. `ringT` is the position along the ring
     (edgeIndex + t) and `pathT` the position along the path (segIndex + u). */
  function crossings(ring, path) {
    const out = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const hits = [];
      for (let k = 0; k < path.length - 1; k++) {
        const x = segX(ring[i], ring[i + 1], path[k], path[k + 1]);
        if (x) hits.push({ ringT: i + x.t, pathT: k + x.u, pt: x.pt });
      }
      hits.sort((a, b) => a.ringT - b.ringT);
      for (const h of hits) out.push(h);
    }
    return out;
  }

  /* the path from parameter a to parameter b (either direction), as a point list */
  function pathSlice(path, a, b) {
    const at = (p) => {
      const i = Math.min(path.length - 2, Math.max(0, Math.floor(p)));
      const f = p - i;
      return [path[i][0] + f * (path[i + 1][0] - path[i][0]), path[i][1] + f * (path[i + 1][1] - path[i][1])];
    };
    const out = [at(a)];
    if (b > a) { for (let i = Math.ceil(a); i <= Math.floor(b); i++) out.push(path[i]); }
    else { for (let i = Math.floor(a); i >= Math.ceil(b); i--) out.push(path[i]); }
    out.push(at(b));
    return out;
  }

  /* the ring from ring-parameter a forward to ring-parameter b (ring is closed: last === first) */
  function ringSlice(ring, a, b) {
    const n = ring.length - 1;
    const at = (p) => {
      const i = Math.floor(p) % n, f = p - Math.floor(p);
      return [ring[i][0] + f * (ring[i + 1][0] - ring[i][0]), ring[i][1] + f * (ring[i + 1][1] - ring[i][1])];
    };
    const out = [at(a)];
    let i = Math.ceil(a);
    const stop = (b > a) ? b : b + n;
    while (i < stop) { out.push(ring[i % n]); i++; }
    out.push(at(b));
    return out;
  }

  const clean = (ring) => {
    const out = [];
    for (const p of ring) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) out.push(p);
    }
    if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
    return out;
  };

  /* ---- the cut ------------------------------------------------------------------------------ */
  /* `polys` is GeoJSON-style: [ [outerRing, ...holes], ... ]. Returns
   *    { left:[polys], right:[polys], cutRings:n, problem:'...'|null }
   * `problem` is set - and left/right left empty - only when a ring is crossed an ODD number of
   * times; see the header for why that is a fault rather than a case to approximate. */
  function cutPolygon(polys, rawPath) {
    const all = [];
    for (const poly of polys) for (const r of poly) all.push(r);
    if (!all.length) return { left: [], right: [], cutRings: 0, problem: 'empty polygon' };
    const path = extendPath(rawPath, bboxOfRings(all), polys);
    const left = [], right = [];
    let cutRings = 0;

    for (const poly of polys) {
      const outer = poly[0];
      const holes = poly.slice(1);
      const xs = crossings(outer, path);
      if (xs.length === 0) {
        const side = sideOfPath(outer[0], path);
        (side < 0 ? left : right).push([outer].concat(holes));
        continue;
      }
      if (xs.length % 2) return { left: [], right: [], cutRings: 0, problem: 'ring crossed ' + xs.length + ' times - an odd count means the line stops inside the country' };
      for (const h of holes) {
        if (crossings(h, path).length) return { left: [], right: [], cutRings: 0, problem: 'the cut passes through a hole' };
      }
      cutRings++;
      /* WARNING: THE PAIRING IS ALONG THE PATH, NOT ALONG THE RING. The path begins outside the
         country, so walking it the crossings alternate ENTER, LEAVE, ENTER, LEAVE ...: the arc
         between the 1st and 2nd is inside, between the 2nd and 3rd outside, and so on. So the
         connector for the crossing at path-order j is the one at j XOR 1, and no containment test
         is needed to find it. */
      const n = xs.length;
      const order = xs.map((x, i) => ({ i, pathT: x.pathT })).sort((a, b) => a.pathT - b.pathT);
      const pathPos = new Array(n);
      order.forEach((o, j) => { pathPos[o.i] = j; });
      const used = new Array(n).fill(false);
      const pieces = [];
      for (let s = 0; s < n; s++) {
        if (used[s]) continue;
        let ring = [];
        let cur = s;
        for (let guard = 0; guard <= n; guard++) {
          if (used[cur]) break;
          used[cur] = true;
          const nxt = (cur + 1) % n;
          ring = ring.concat(ringSlice(outer, xs[cur].ringT, xs[nxt].ringT));
          const back = order[pathPos[nxt] ^ 1].i;
          ring = ring.concat(pathSlice(path, xs[nxt].pathT, xs[back].pathT));
          cur = back;
          if (cur === s) break;
        }
        const closed = clean(ring);
        if (closed.length >= 4) pieces.push(closed);
      }
      for (const ring of pieces) {
        /* a piece's side is decided by a point that is genuinely inside it, not by a vertex - every
           vertex of the cut edge sits ON the path, where the side is undefined */
        const c = interiorPoint(ring);
        const side = c ? sideOfPath(c, path) : sideOfPath(ring[1], path);
        const kept = [ring].concat(holes.filter((h) => pointInRing(h[0], ring)));
        (side < 0 ? left : right).push(kept);
      }
    }
    return { left, right, cutRings, problem: null };
  }

  /* a point strictly inside the ring — the centroid when it lands inside, else a scan line */
  function interiorPoint(ring) {
    let cx = 0, cy = 0, a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      a += f; cx += (ring[i][0] + ring[i + 1][0]) * f; cy += (ring[i][1] + ring[i + 1][1]) * f;
    }
    if (a) {
      const c = [cx / (3 * a), cy / (3 * a)];
      if (pointInRing(c, ring)) return c;
    }
    const bb = bboxOfRings([ring]);
    for (let k = 1; k < 12; k++) {
      const y = bb[1] + ((bb[3] - bb[1]) * k) / 12;
      const hits = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const y1 = ring[i][1], y2 = ring[i + 1][1];
        if ((y1 > y) !== (y2 > y)) hits.push(ring[i][0] + ((y - y1) / (y2 - y1)) * (ring[i + 1][0] - ring[i][0]));
      }
      hits.sort((p, q) => p - q);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        if (hits[i + 1] - hits[i] > 1e-7) return [(hits[i] + hits[i + 1]) / 2, y];
      }
    }
    return null;
  }

  /* Is this point inside any of the polygons (outer ring minus holes)? */
  function pointInPolys(pt, polys) {
    for (const poly of polys) {
      if (!pointInRing(pt, poly[0])) continue;
      let inHole = false;
      for (let i = 1; i < poly.length; i++) if (pointInRing(pt, poly[i])) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }

  /* Ramer–Douglas–Peucker, for the ONE place it is honest to use: drawing a cut coastline that the
     reader is looking at from three thousand kilometres up. The stored line is never simplified. */
  function simplify(ring, tol) {
    if (ring.length < 4 || !tol) return ring;
    const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
    const stack = [[0, ring.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      let worst = -1, wi = -1;
      const a = ring[i], b = ring[j];
      const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
      for (let k = i + 1; k < j; k++) {
        const p = ring[k];
        let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
        const d = ex * ex + ey * ey;
        if (d > worst) { worst = d; wi = k; }
      }
      if (worst > tol * tol && wi > 0) { keep[wi] = 1; stack.push([i, wi], [wi, j]); }
    }
    const out = [];
    for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
    return out.length >= 4 ? out : ring;
  }

  /* ---- every cut that applies, and which side of which one a place is on -----------------------
     WARNING: A COUNTRY CAN BE CUT BY MORE THAN ONE FRONT AT ONCE, and BOTH earlier attempts at this
     were wrong in a way that only a check could see. Picking one front (the last declared) let a line
     in Karelia answer «who held Rostov in November 1942». COMPOSING them - cut by front A, then cut
     each piece by front B, taking B's two factions - was worse: the Finnish line crosses the Karelian
     neck of the piece the Eastern Front had already given to Germany, and «the other side of the
     Finnish line» is then the whole of German-held Ukraine, relabelled Soviet in one step.
     THE RULE IS: THE NEAREST FRONT DECIDES. Geometry and labelling are separate. The cuts compose to
     produce the CELLS (that is just arithmetic - two lines across a country make three or four
     regions), and each cell is then labelled by the front whose line is closest to it, on the side it
     lies. Near the Eastern Front the Eastern Front decides; in Karelia the Finnish Front does; and
     nothing a thousand kilometres away can relabel either. */
  function nearestOnPath(pt, path) {
    let best = Infinity, sign = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = a[0] + t * dx, cy = a[1] + t * dy;
      const d = (pt[0] - cx) * (pt[0] - cx) + (pt[1] - cy) * (pt[1] - cy);
      if (d < best) { best = d; sign = Math.sign(dx * (pt[1] - a[1]) - dy * (pt[0] - a[0])) || 1; }
    }
    return { dist: Math.sqrt(best), sign };
  }

  /* `cuts` is [{ pts, left, right }, ...]. Returns the faction holding `pt`. */
  function factionAtPt(pt, baseFaction, cuts) {
    if (!cuts || !cuts.length) return baseFaction;
    let best = null, bestD = Infinity, bestSign = 1;
    for (const c of cuts) {
      if (!c.pts || c.pts.length < 2) continue;
      const n = nearestOnPath(pt, c.pts);
      if (n.dist < bestD) { bestD = n.dist; best = c; bestSign = n.sign; }
    }
    if (!best) return baseFaction;
    return bestSign < 0 ? best.left : best.right;
  }

  /* Returns [{ polys:[poly], faction }, ...] — the cells, grouped by the faction that holds them. */
  function warPieces(polys, baseFaction, cuts) {
    /* the common case by far: nothing is cutting this country today, so it is one piece and no
       geometry has to be touched at all */
    if (!cuts || !cuts.length) return [{ faction: baseFaction, polys: polys.slice() }];
    let cells = polys.slice();
    for (const c of (cuts || [])) {
      if (!c || !c.pts || c.pts.length < 2) continue;
      const next = [];
      for (const cell of cells) {
        const r = cutPolygon([cell], c.pts);
        if (r.problem || !r.cutRings) { next.push(cell); continue; }
        for (const p of r.left) next.push(p);
        for (const p of r.right) next.push(p);
      }
      cells = next;
    }
    const by = new Map();
    for (const cell of cells) {
      const ip = interiorPoint(cell[0]) || cell[0][0];
      const f = factionAtPt(ip, baseFaction, cuts);
      if (!by.has(f)) by.set(f, []);
      by.get(f).push(cell);
    }
    return [...by.entries()].map(([faction, ps]) => ({ faction, polys: ps }));
  }

  /* Which faction holds this point, given the same inputs `warPieces` takes — so the build and the
     browser have one definition of «what the map shows». */
  function factionAt(pt, polys, baseFaction, cuts) {
    if (!pointInPolys(pt, polys)) return null;
    return factionAtPt(pt, baseFaction, cuts);
  }

  return { bboxOfRings, pointInRing, sideOfPath, extendPath, crossings, cutPolygon, interiorPoint, pointInPolys, simplify, nearestOnPath, warPieces, factionAt, factionAtPt };
})();
