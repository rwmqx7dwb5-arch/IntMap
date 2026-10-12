/* ============================================================================
 *  IntMap · WAR GEOMETRY — cutting a country by a front line   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 A front line is a line, but 「勢力」 is an AREA,
 *  and the two must never be able to disagree. So the area is not stored: it is DERIVED from the line
 *  by this file, every time, on both sides of the build/ship boundary —
 *      · scripts/build-wars.mjs imports it to prove each curated line really cuts the country it
 *        claims to cut, and that named cities land under the side the record says held them;
 *      · js/war-fronts.js imports it to paint that same cut in the browser.
 *  One implementation, two callers, name-checked by tests/layer-boot-graph-checks.test.mjs #R175 ③. A second copy could drift,
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

/* ⚠ (#R349) ONE EXPORT, AND THAT IS A RULE OF THIS DIRECTORY, NOT A STYLE CHOICE. tests/layer-boot-graph-checks.test.mjs #R175 ③
   fails any top-level declaration in js/ that is not exported AND imported somewhere by name — the
   property that lets these files be bundled without changing a single name resolution. Half of what
   is below (`segX`, `pathSlice`, `ringSlice`, `clean`) is private arithmetic that nothing outside
   should import, so the whole module is one closure and the closure is the export. */
import polygonClipping from 'polygon-clipping';

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
     actually closest to describes the boundary near it. (war-fill-nearest-front) It is `nearestOnPath`'s
     sign — one reading of «which side», so the cut and the label cannot ask it two ways. */
  function sideOfPath(pt, path) { return nearestOnPath(pt, path).sign; }

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
  /* ⚠ (war-fill-nearest-front) WHEN THE NEAREST POINT IS A CORNER, THE CORNER DECIDES — NOT WHICHEVER OF ITS
     TWO SEGMENTS WAS LOOKED AT FIRST. Beyond a bend the point is exactly as far from both segments (it is
     nearest to the shared vertex), the two infinite lines can put it on opposite sides, and this used to keep
     the first. MEASURED on 1944-12-25: the Western Front's line spikes west to Dinant at the tip of the
     Bulge; the whole of France beyond the tip is nearest to that vertex, the segment coming in from the east
     said «Axis», and the map painted France — Paris, Brittany, the Midi — German for the length of the
     battle. The corner rule: where the two segments agree, that is the side; where they disagree the point
     is beyond the corner, and it lies on the side the path turns AWAY from (a path that turns toward a side
     encloses that side in the narrow wedge, which the point is not in — it would agree with both). */
  function nearestOnPath(pt, path) {
    let best = Infinity, bi = -1, bt = 0, bx = 0, by = 0;
    const segSign = (i) => {
      const a = path[i], b = path[i + 1];
      return Math.sign((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]));
    };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = a[0] + t * dx, cy = a[1] + t * dy;
      const d = (pt[0] - cx) * (pt[0] - cx) + (pt[1] - cy) * (pt[1] - cy);
      if (d < best) { best = d; bi = i; bt = t; bx = cx; by = cy; }
    }
    if (bi < 0) return { dist: Infinity, sign: 1, at: null };
    /* the corner shared with the next (t = 1) or the previous (t = 0) segment, if the nearest point is one */
    const j = bt === 1 && bi < path.length - 2 ? bi : (bt === 0 && bi > 0 ? bi - 1 : -1);
    let sign = segSign(bi);
    if (j >= 0) {
      const s1 = segSign(j), s2 = segSign(j + 1);
      if (s1 === s2 || !s1 || !s2) sign = s1 || s2;
      else {
        const p = path[j], q = path[j + 1], r = path[j + 2];
        const turn = Math.sign((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]));
        sign = turn ? -turn : s2;
      }
    }
    return { dist: Math.sqrt(best), sign: sign || 1, at: [bx, by] };
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

  /* ⚠⚠ (war-fill-nearest-front) «THE NEAREST FRONT DECIDES» IS A RULE ABOUT POINTS, AND THE FILL USED TO APPLY IT
     TO A WHOLE CELL AT ONCE. A cell is what is left between the extended lines; it was labelled by the front
     nearest to ONE point inside it. The lines are extended to the border, so where two fronts cut the same
     country the cells are large, and across one cell the nearest front changes. MEASURED (the city checks of
     scripts/build-wars.mjs asked of the fill instead of the point): 1948-06-11 Lod and Ramla painted Israeli
     though the Central Front puts them on the Arab side; 1942-02-01 Smolensk painted Soviet because its cell
     was labelled from a point nearer the Finnish line. The rule is not changed — it is applied where it is
     stated: a cell whose fronts all give the same side is that side (almost every cell); a cell whose fronts
     disagree is split along the boundary where the nearest front changes, each part taking the side its own
     nearest front gives. The SIDE of a front is the cut's own (`cutPolygon` already sorted the cell left or
     right of that front) — not asked again of a nearest segment, which can face the other way where a line
     bends back on itself.
     The boundary between two fronts' domains is no front line and no source draws it; it is derived. It is
     traced on a grid over the cell from the distance over land (`splitCell`), and the cell is cut by it with the
     same sweep-line the GIS tools use (polygon-clipping). The front lines themselves are never approximated: every edge of the fill
     that lies on a front is the cut's own. */
  const SPLIT_GRID = 192;   /* grid lines along the cell's longer side — the resolution of a DERIVED line no source states.
                               MEASURED 2026-10-13 against 768 over all 159 country-days of data/wars.json that two fronts
                               cut: the side areas differ by at most 1e-3 of the country (0.16 square degrees). Mean 30 ms, worst 91 ms (node 24). Lapses if a source starts
                               drawing this line, or a front much finer than the record's towns is added. */
  function cellsOf(polys, cuts) {
    let cells = polys.map((poly) => ({ poly, sides: new Map() }));
    cuts.forEach((c, ci) => {
      if (!c || !c.pts || c.pts.length < 2) return;
      const next = [];
      for (const cell of cells) {
        const r = cutPolygon([cell.poly], c.pts);
        /* a cut that cannot be made, or a line that does not cross this piece at all, says nothing about which side of
           it the piece is on: the front is then asked at the point. (MEASURED: the Western Front's last bearing,
           prolonged, runs through Corsica, and a side read off one vertex of the island made it German in 1914–18.) */
        if (r.problem || !r.cutRings) { next.push(cell); continue; }
        for (const p of r.left) next.push({ poly: p, sides: new Map(cell.sides).set(ci, -1) });
        for (const p of r.right) next.push({ poly: p, sides: new Map(cell.sides).set(ci, 1) });
      }
      cells = next;
    });
    return cells;
  }
  const liveCuts = (cuts) => cuts.map((c, ci) => (c && c.pts && c.pts.length >= 2 ? ci : -1)).filter((ci) => ci >= 0);
  function sideFaction(cell, cuts, ci, pt) {
    const c = cuts[ci];
    const sd = cell.sides.has(ci) ? cell.sides.get(ci) : nearestOnPath(pt, c.pts).sign;
    return sd < 0 ? c.left : c.right;
  }

  /* One cell whose fronts disagree → [{ faction, polys }], split where the nearest front changes.
     ⚠ (war-fill-nearest-front) «NEAREST» IS MEASURED OVER LAND, INSIDE THE CELL — NOT AS THE CROW FLIES. Measured
     straight, the Finnish line's end on the Karelian Isthmus is nearer to Narva and Tallinn than the Eastern Front
     starting at Leningrad is, ACROSS THE GULF OF FINLAND, and northern Estonia and Ingria — German from 1941 to 1944 —
     were painted Soviet. A front reaches a place by land and without crossing another front's line (the cell is
     bounded by the lines), so the distance is a shortest path over a grid of the cell's own interior, seeded at the
     fronts whose line this cell actually lies along. A part of the cell no such front reaches (an island the lines
     do not cross) falls back to the straight distance. */
  const MOVES = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];   /* 16 directions: a grid path is at most ~1.3 % longer than the straight one */
  function splitCell(cell, cuts) {
    const ring = cell.poly[0];
    const bb = bboxOfRings([ring]);
    const step = Math.max(bb[2] - bb[0], bb[3] - bb[1]) / SPLIT_GRID || 1e-6;
    const x0 = bb[0] - step, y0 = bb[1] - step;
    const nx = Math.ceil((bb[2] - bb[0]) / step) + 3, ny = Math.ceil((bb[3] - bb[1]) / step) + 3, N = nx * ny;
    const X = (i) => x0 + i * step, Y = (j) => y0 + j * step;
    const live = liveCuts(cuts);

    /* the cell's interior, row by row (even–odd over its rings, so lakes are not land) */
    const inside = new Uint8Array(N);
    for (let j = 1; j < ny - 1; j++) {
      const y = Y(j), xs = [];
      for (const r of cell.poly) for (let k = 0; k < r.length - 1; k++) {
        const a = r[k], b = r[k + 1];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.max(1, Math.ceil((xs[k] - x0) / step)); i <= Math.min(nx - 2, Math.floor((xs[k + 1] - x0) / step)); i++) inside[j * nx + i] = 1;
      }
    }

    /* the fronts this cell lies along (the cut put it on one side of them), and the side each gives */
    const along = live.filter((ci) => cell.sides.has(ci));
    const facOf = new Map(along.map((ci) => [ci, sideFaction(cell, cuts, ci, null)]));
    const facs = [...new Set(facOf.values())];
    /* per faction, the land distance from every interior node to the nearest front giving it */
    const dist = new Map(facs.map((F) => [F, new Float64Array(N).fill(Infinity)]));
    const reach = 2 * step;
    /* the other lines, as the cut drew them (extended to the cell's edge): a seed must see its front without crossing one.
       MEASURED: the Finnish line ends on the Karelian Isthmus a few kilometres from the Eastern Front's extension, and
       seeded the cell on the far side of it — Ingria and Estonia — from across that line. */
    const walls = live.map((ci) => extendPath(cuts[ci].pts, bb, [cell.poly]));
    const sees = (p, ci, q) => {
      for (let w = 0; w < live.length; w++) {
        if (live[w] === ci) continue;
        const path = walls[w];
        for (let k = 0; k < path.length - 1; k++) if (segX(p, q, path[k], path[k + 1])) return false;
      }
      return true;
    };
    const land = (a, b) => a >= 1 && b >= 1 && a <= nx - 2 && b <= ny - 2 && inside[b * nx + a] === 1;
    const passable = (i, j, di, dj) => {
      const ai = Math.abs(di), aj = Math.abs(dj), si = Math.sign(di), sj = Math.sign(dj);
      if (ai + aj === 1) return true;
      if (ai === 1 && aj === 1) return land(i + di, j) && land(i, j + dj);
      return ai === 2 ? land(i + si, j) && land(i + si, j + dj) : land(i, j + sj) && land(i + di, j + sj);
    };
    /* step lengths of the 16 moves, and a binary heap over typed arrays (node indices keyed by distance) */
    const MLEN = MOVES.map(([di, dj]) => step * Math.hypot(di, dj));
    let hk = new Float64Array(N + 16), hn = new Int32Array(N + 16);
    for (const F of facs) {
      const D = dist.get(F);
      let hs = 0;
      const push = (n, d) => {
        if (hs >= hk.length) { const k2 = new Float64Array(hk.length * 2), n2 = new Int32Array(hn.length * 2); k2.set(hk); n2.set(hn); hk = k2; hn = n2; }
        let c = hs++; hk[c] = d; hn[c] = n;
        while (c) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; const tk = hk[p]; hk[p] = hk[c]; hk[c] = tk; const tn = hn[p]; hn[p] = hn[c]; hn[c] = tn; c = p; }
      };
      const pop = () => {
        const n = hn[0]; hs--;
        if (hs) {
          hk[0] = hk[hs]; hn[0] = hn[hs];
          let c = 0;
          for (;;) {
            const l = 2 * c + 1, r = l + 1; let m = c;
            if (l < hs && hk[l] < hk[m]) m = l;
            if (r < hs && hk[r] < hk[m]) m = r;
            if (m === c) break;
            const tk = hk[m]; hk[m] = hk[c]; hk[c] = tk; const tn = hn[m]; hn[m] = hn[c]; hn[c] = tn; c = m;
          }
        }
        return n;
      };
      /* seeds lie within `reach` of a line, so only the nodes in each line's box, widened by it, are asked */
      for (const ci of along) {
        if (facOf.get(ci) !== F) continue;
        const lb = bboxOfRings([cuts[ci].pts]);
        const i0 = Math.max(1, Math.floor((lb[0] - reach - x0) / step)), i1 = Math.min(nx - 2, Math.ceil((lb[2] + reach - x0) / step));
        const j0 = Math.max(1, Math.floor((lb[1] - reach - y0) / step)), j1 = Math.min(ny - 2, Math.ceil((lb[3] + reach - y0) / step));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const n = j * nx + i;
          if (!inside[n]) continue;
          const p = [X(i), Y(j)], r = nearestOnPath(p, cuts[ci].pts);
          if (r.dist <= reach && r.dist < D[n] && sees(p, ci, r.at)) D[n] = r.dist;
        }
      }
      for (let n = 0; n < N; n++) if (D[n] < Infinity) push(n, D[n]);
      while (hs) {
        const d = hk[0], n = pop();
        if (d > D[n]) continue;
        const i = n % nx, j = (n / nx) | 0;
        for (let m = 0; m < MOVES.length; m++) {
          const di = MOVES[m][0], dj = MOVES[m][1], a = i + di, b = j + dj;
          if (a < 1 || b < 1 || a > nx - 2 || b > ny - 2 || !inside[b * nx + a]) continue;
          /* a diagonal or a knight's move may not cut across water: the nodes it passes between must be land too */
          if (m >= 4 && !passable(i, j, di, dj)) continue;
          const nd = d + MLEN[m];
          if (nd < D[b * nx + a]) { D[b * nx + a] = nd; push(b * nx + a, nd); }
        }
      }
    }
    /* every node's distance per faction: over land where some front reaches it, else straight (and then every
       live front counts, each on the side it gives at that node) */
    const order = [...facs];
    const fi = new Map(order.map((F, k) => [F, k]));
    const dd = [];   /* dd[k][n]: node n's distance to faction order[k] */
    for (const F of order) dd.push(dist.get(F));
    for (let n = 0; n < N; n++) {
      if (!inside[n]) continue;
      let any = false;
      for (let k = 0; k < facs.length; k++) if (dd[k][n] < Infinity) { any = true; break; }
      if (any) continue;
      for (let k = 0; k < dd.length; k++) dd[k][n] = Infinity;
      const p = [X(n % nx), Y((n / nx) | 0)];
      for (const ci of live) {
        const F = sideFaction(cell, cuts, ci, p), d = nearestOnPath(p, cuts[ci].pts).dist;
        if (!fi.has(F)) { fi.set(F, order.length); order.push(F); dd.push(new Float64Array(N).fill(Infinity)); }
        const k = fi.get(F); if (d < dd[k][n]) dd[k][n] = d;
      }
    }
    /* nodes off the cell take the values of the nearest interior node (by grid steps), so the boundary traced
       below is the interior's own and the clip to the cell discards the rest */
    const src = new Int32Array(N).fill(-1);
    let front = []; for (let n = 0; n < N; n++) if (inside[n]) { src[n] = n; front.push(n); }
    while (front.length) {
      const nxt = [];
      for (const n of front) {
        const i = n % nx, j = (n / nx) | 0;
        for (let m = 0; m < 4; m++) {
          const a = i + MOVES[m][0], b = j + MOVES[m][1];
          if (a < 0 || b < 0 || a >= nx || b >= ny || src[b * nx + a] >= 0) continue;
          src[b * nx + a] = src[n]; nxt.push(b * nx + a);
        }
      }
      front = nxt;
    }
    const BIG = 1e6 * step;
    const out = [];
    let rest = [cell.poly];
    for (let k = 0; k < order.length && rest.length; k++) {
      const F = order[k];
      if (k === order.length - 1) { out.push({ faction: F, polys: rest }); break; }
      const pad = (i, j) => i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      /* < 0 where F's nearest front is nearer than every other faction's */
      const val = new Float64Array(N);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const n = j * nx + i, s = src[n];
        if (pad(i, j) || s < 0) { val[n] = BIG; continue; }
        let dOut = Infinity;
        for (let q = 0; q < dd.length; q++) if (q !== k && dd[q][s] < dOut) dOut = dd[q][s];
        val[n] = Math.max(-BIG, Math.min(BIG, dd[k][s] - dOut));
      }
      if (!val.some((v) => v < 0)) continue;
      const inF = (i, j) => val[j * nx + i] < 0;
      const cross = (i1, j1, i2, j2) => {
        const va = val[j1 * nx + i1], vb = val[j2 * nx + i2];
        const t = Math.min(1, Math.max(0, va / (va - vb)));
        return [X(i1) + (X(i2) - X(i1)) * t, Y(j1) + (Y(j2) - Y(j1)) * t];
      };
      /* marching squares. Corners counter-clockwise v0 (i,j) v1 (i+1,j) v2 (i+1,j+1) v3 (i,j+1); edge e_k runs
         v_k → v_{k+1}. Going round, e_k is an EXIT where v_k is in F and v_{k+1} is not, an ENTRY the other way.
         A segment from an exit crossing to an entry crossing has F on its left. An exit pairs with the entry just
         before it (the F corner alone), or — at a saddle whose centre is in F — the entry just after it. */
      const key = (i1, j1, i2, j2) => (i1 < i2 || (i1 === i2 && j1 < j2)) ? i1 + ',' + j1 + ',' + i2 + ',' + j2 : i2 + ',' + j2 + ',' + i1 + ',' + j1;
      const at = new Map(), next = new Map();
      const node = (e) => { const kk = key(e[0], e[1], e[2], e[3]); if (!at.has(kk)) at.set(kk, cross(e[0], e[1], e[2], e[3])); return kk; };
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const c = [inF(i, j), inF(i + 1, j), inF(i + 1, j + 1), inF(i, j + 1)];
        const n = c[0] + c[1] + c[2] + c[3];
        if (n === 0 || n === 4) continue;
        const E = [[i, j, i + 1, j], [i + 1, j, i + 1, j + 1], [i + 1, j + 1, i, j + 1], [i, j + 1, i, j]];
        const saddleJoined = n === 2 && c[0] === c[2]
          && (val[j * nx + i] + val[j * nx + i + 1] + val[(j + 1) * nx + i + 1] + val[(j + 1) * nx + i]) < 0;
        for (let e = 0; e < 4; e++) {
          if (!(c[e] && !c[(e + 1) % 4])) continue;
          let en = saddleJoined ? (e + 1) % 4 : (e + 3) % 4;
          if (!saddleJoined) { while (!(!c[en] && c[(en + 1) % 4])) en = (en + 3) % 4; }
          next.set(node(E[e]), node(E[en]));
        }
      }
      const rings = [];
      while (next.size) {
        const k0 = next.keys().next().value; const r = []; let kk = k0;
        while (next.has(kk)) { r.push(at.get(kk)); const nk = next.get(kk); next.delete(kk); kk = nk; }
        if (r.length >= 3) { r.push(r[0]); rings.push(r); }
      }
      if (!rings.length) continue;
      /* rings nest (F inside not-F inside F …); the even–odd union of them is the region, whatever the nesting */
      let region = [[rings[0]]];
      for (let r = 1; r < rings.length; r++) region = polygonClipping.xor(region, [[rings[r]]]);
      const mine = polygonClipping.intersection(rest, region);
      rest = polygonClipping.difference(rest, region);
      if (mine.length) out.push({ faction: F, polys: mine });
    }
    return out;
  }

  /* Returns [{ polys:[poly], faction }, ...] — the fill, grouped by the faction that holds it. */
  function warPieces(polys, baseFaction, cuts) {
    /* the common case by far: nothing is cutting this country today, so it is one piece and no
       geometry has to be touched at all */
    if (!cuts || !cuts.length) return [{ faction: baseFaction, polys: polys.slice() }];
    const live = liveCuts(cuts);
    if (!live.length) return [{ faction: baseFaction, polys: polys.slice() }];
    const by = new Map();
    const put = (f, ps) => { if (!by.has(f)) by.set(f, []); for (const p of ps) by.get(f).push(p); };
    for (const cell of cellsOf(polys, cuts)) {
      const ip = interiorPoint(cell.poly[0]) || cell.poly[0][0];
      const votes = new Set(live.map((ci) => sideFaction(cell, cuts, ci, ip)));
      if (votes.size === 1) { put([...votes][0], [cell.poly]); continue; }
      let parts = null;
      try { parts = splitCell(cell, cuts); } catch (_) { parts = null; }
      /* the sweep-line refused (degenerate input — observed, not assumed): the cell keeps the side its own
         nearest front gives at its interior point, as every cell did before the split existed */
      if (!parts || !parts.length) { const ci = live.reduce((b, c) => (nearestOnPath(ip, cuts[c].pts).dist < nearestOnPath(ip, cuts[b].pts).dist ? c : b)); put(sideFaction(cell, cuts, ci, ip), [cell.poly]); continue; }
      for (const piece of parts) put(piece.faction, piece.polys);
    }
    return [...by.entries()].map(([faction, ps]) => ({ faction, polys: ps }));
  }

  /* Which faction holds this point, given the same inputs `warPieces` takes — so the build and the
     browser have one definition of «what the map shows». ⚠ (war-fill-nearest-front) IT IS THE FILL ITSELF:
     the point is looked up in the pieces `warPieces` draws. Asking the point's nearest segment was a second
     definition, and the two parted wherever a front bends or two fronts share a country. */
  function factionAt(pt, polys, baseFaction, cuts) {
    if (!pointInPolys(pt, polys)) return null;
    for (const piece of warPieces(polys, baseFaction, cuts)) if (pointInPolys(pt, piece.polys)) return piece.faction;
    return factionAtPt(pt, baseFaction, cuts);   /* exactly on a front line, in no piece's interior */
  }

  return { bboxOfRings, pointInRing, sideOfPath, extendPath, crossings, cutPolygon, interiorPoint, pointInPolys, simplify, nearestOnPath, warPieces, factionAt, factionAtPt };
})();
