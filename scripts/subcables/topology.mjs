/* ============================================================================
 *  IntMap · subcables — WHAT IS JOINED TO WHAT
 * ----------------------------------------------------------------------------
 *  A cable system is a graph, not a line: landing points, branching units, and
 *  the legs between them. Getting that graph wrong loses a branch, and the
 *  brief's §1 says not one cable may be lost — a cable that keeps its name and
 *  loses half its legs has been lost in every way that matters.
 *
 *  TeleGeography's schematic geometry is where the graph comes from, and that
 *  is the ONE thing §8 allows it to be used for: which landing points are
 *  joined to which, and roughly which ocean the leg is in. Not one of its
 *  vertices becomes route geometry, and the reconstruction is never attracted
 *  to it — the leg's own reference line is used only to decide which surveyed
 *  piece belongs to which leg, and in what order.
 *
 *  ⚠ THE ANTIMERIDIAN IS A SEAM IN THE SOURCE, NOT A NODE. TeleGeography splits
 *  every Pacific cable into two rings that stop dead at ±180° (measured: 81 ring
 *  endpoints sit exactly on it, and no ring anywhere jumps more than 180° of
 *  longitude). Left alone, each of those becomes a fictitious branching unit in
 *  the middle of the ocean and the leg either side is reconstructed to a place
 *  no cable turns. They are rejoined here, in unwrapped longitude, before
 *  anything else looks at the geometry.
 * ==========================================================================*/
import { haversine, unwrap, dLon } from './geo.mjs';

const SEAM_EPS_DEG = 0.02;        /* how exactly a ring endpoint must sit on ±180 */
const SEAM_LAT_EPS = 0.25;        /* …and how closely the two halves' latitudes must agree */
const LP_SNAP_M = 25000;          /* a ring end within this of one of THIS cable's landing points is that landing */
const NODE_MERGE_M = 20000;       /* two ring ends this close are the same branching unit */
const BRANCH_SNAP_M = 30000;      /* a ring end this close to ANOTHER ring's interior is a branching unit ON it */
const BRANCH_EDGE_M = 15000;      /* …but not if it is that close to the other ring's own end (that is NODE_MERGE's case) */

/* ── rejoin the rings a cable was split into at ±180 ───────────────────────── */
export function mergeSeamRings(rings) {
  const open = rings.map(r => unwrap(r));
  const onSeam = (p) => Math.abs(Math.abs(p[0]) - 180) < SEAM_EPS_DEG;
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < open.length; i++) {
      const a = open[i]; if (!a || a.length < 2) continue;
      for (let j = 0; j < open.length; j++) {
        if (i === j) continue;
        const b = open[j]; if (!b || b.length < 2) continue;
        for (const [aEnd, bEnd] of [[1, 0], [1, 1], [0, 0], [0, 1]]) {
          const pa = aEnd ? a[a.length - 1] : a[0];
          const pb = bEnd ? b[b.length - 1] : b[0];
          if (!onSeam(pa) || !onSeam(pb)) continue;
          if (Math.sign(pa[0]) === Math.sign(pb[0])) continue;      /* both on the same side is not a seam pair */
          if (Math.abs(pa[1] - pb[1]) > SEAM_LAT_EPS) continue;
          /* shift b so its seam end continues a's, then splice */
          const shift = pa[0] - pb[0];
          const bs = b.map(p => [p[0] + shift, p[1]]);
          const A = aEnd ? a : a.slice().reverse();
          const B = bEnd ? bs.slice().reverse() : bs;
          open[i] = A.concat(B.slice(1));
          open[j] = null;
          merged = true;
          break outer;
        }
      }
    }
  }
  return open.filter(Boolean);
}

/* ══ A BRANCH LANDS IN THE MIDDLE OF THE TRUNK, NOT AT ITS END ═══════════════
   The schematic draws a branching unit as a spur ring whose seaward end sits ON
   the trunk ring — between two of its vertices, not at either end of it. A graph
   built only from ring ENDPOINTS therefore cannot join the two, and the cable
   comes out as a heap of disconnected pieces: measured over all 702 cables,
   2,971 ring ends land on one of their own cable's landing points, 135 on
   another ring's end, and 664 on another ring's INTERIOR. 2Africa alone came out
   in 37 pieces.

   So every such end splits the ring it lands on, and is moved onto the split
   point (at most 30 km, on a line whose median leg is four vertices long — and
   the schematic is an anchor and a locator here, never the route). After this
   the graph joins up by coordinate, with no special case anywhere downstream. */
function splitAtBranches(rings, lps) {
  if (rings.length < 2) return rings;
  const near = (p) => { let d = Infinity; const w = [p[0] - 360 * Math.round(p[0] / 360), p[1]]; for (const lp of lps) d = Math.min(d, haversine(w, lp.coord)); return d; };
  const cuts = rings.map(() => []);
  const moves = [];
  for (let i = 0; i < rings.length; i++) {
    for (const end of [0, 1]) {
      const p = end ? rings[i][rings[i].length - 1] : rings[i][0];
      if (near(p) <= LP_SNAP_M) continue;
      const w = [p[0] - 360 * Math.round(p[0] / 360), p[1]];
      let best = null;
      for (let j = 0; j < rings.length; j++) {
        if (j === i) continue;
        const r = refPosition(rings[j], w);
        if (r.dist > BRANCH_SNAP_M) continue;
        if (r.s < BRANCH_EDGE_M || r.s > r.total - BRANCH_EDGE_M) continue;   /* that is an end, not an interior */
        if (!best || r.dist < best.dist) best = { j, s: r.s, dist: r.dist, point: r.point };
      }
      if (!best) continue;
      cuts[best.j].push(best.s);
      moves.push({ i, end, point: best.point });
    }
  }
  for (const m of moves) {
    const r = rings[m.i];
    if (m.end) r[r.length - 1] = m.point.slice(); else r[0] = m.point.slice();
  }
  const out = [];
  for (let j = 0; j < rings.length; j++) {
    if (!cuts[j].length) { out.push(rings[j]); continue; }
    for (const piece of cutRing(rings[j], cuts[j])) if (piece.length >= 2) out.push(piece);
  }
  return out;
}

function cutRing(ring, positions) {
  const ps = [...new Set(positions.map(s => Math.round(s)))].sort((a, b) => a - b);
  const pieces = [];
  let cur = [ring[0]], cum = 0, k = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], seg = haversine(a, b);
    while (k < ps.length && ps[k] <= cum + seg) {
      const t = seg > 0 ? (ps[k] - cum) / seg : 0;
      const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (haversine(cur[cur.length - 1], q) > 1) cur.push(q);
      if (cur.length >= 2) pieces.push(cur);
      cur = [q];
      k++;
    }
    cur.push(b);
    cum += seg;
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces;
}

/* ── the graph ─────────────────────────────────────────────────────────────
   nodes: { id, kind: 'landing'|'junction', coord, lpId? }
   edges: { a, b, ref }  — `ref` is the schematic leg, used ONLY as a locator */
export function buildTopology(cable, landingPoints) {
  const lps0 = cable.landingPointIds.map(id => landingPoints.get(id)).filter(Boolean);
  const rings = splitAtBranches(mergeSeamRings(cable.rings), lps0);
  const lps = lps0;
  const nodes = [];
  const byLp = new Map();

  const nodeForLanding = (lp) => {
    if (byLp.has(lp.id)) return byLp.get(lp.id);
    const n = { id: 'lp:' + lp.id, kind: 'landing', coord: [lp.coord[0], lp.coord[1]], lpId: lp.id, name: lp.name };
    nodes.push(n); byLp.set(lp.id, n); return n;
  };
  const junctions = [];
  const nodeForPoint = (p) => {
    const wrapped = [p[0] - 360 * Math.round(p[0] / 360), p[1]];
    for (const n of junctions) if (haversine(n.coord, wrapped) < NODE_MERGE_M) return n;
    const n = { id: 'j:' + junctions.length + ':' + cable.id, kind: 'junction', coord: wrapped };
    nodes.push(n); junctions.push(n); return n;
  };

  const nearestLanding = (p) => {
    let best = null, bd = Infinity;
    const wrapped = [p[0] - 360 * Math.round(p[0] / 360), p[1]];
    for (const lp of lps) { const d = haversine(wrapped, lp.coord); if (d < bd) { bd = d; best = lp; } }
    return { lp: best, d: bd };
  };

  const edges = [];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const ends = [ring[0], ring[ring.length - 1]].map(p => {
      const n = nearestLanding(p);
      return (n.lp && n.d <= LP_SNAP_M) ? nodeForLanding(n.lp) : nodeForPoint(p);
    });
    if (ends[0] === ends[1]) continue;                      /* a ring that starts and ends at the same node */
    edges.push({ a: ends[0], b: ends[1], ref: ring });
  }

  /* ── landing points the schematic never touched ────────────────────────────
     They are in the cable's own landing list, so the cable DOES land there; the
     schematic simply has no leg for it. Rather than drop the landing (which
     would quietly shrink the cable), each is joined to the nearest node the
     graph does have — the shortest leg that keeps the landing connected. */
  const orphans = [];
  for (const lp of lps) {
    if (byLp.has(lp.id)) continue;
    if (!nodes.length) { nodeForLanding(lp); continue; }
    let best = null, bd = Infinity;
    for (const n of nodes) { const d = haversine(lp.coord, n.coord); if (d < bd) { bd = d; best = n; } }
    const nn = nodeForLanding(lp);
    edges.push({ a: nn, b: best, ref: [lp.coord, best.coord], orphan: true });
    orphans.push(lp.id);
  }
  return { nodes, edges, orphans, rings };
}

/* ── project a point onto a reference leg: distance, how far along, and where ─ */
export function refPosition(ref, p) {
  let bd = Infinity, bs = 0, cum = 0, bp = ref[0];
  const wrapped = [p[0], p[1]];
  for (let i = 1; i < ref.length; i++) {
    const a = ref[i - 1], b = ref[i];
    const seg = haversine(a, b);
    const lat0 = (a[1] + b[1]) * 0.5 * Math.PI / 180, k = Math.cos(lat0);
    const vx = dLon(a[0], b[0]) * k, vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, (dLon(a[0], wrapped[0]) * k * vx + (wrapped[1] - a[1]) * vy) / L2)) : 0;
    const q = [a[0] + dLon(a[0], b[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = haversine(wrapped, q);
    if (d < bd) { bd = d; bs = cum + seg * t; bp = q; }
    cum += seg;
  }
  return { dist: bd, s: bs, total: cum, point: bp };
}
