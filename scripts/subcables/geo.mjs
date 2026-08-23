/* ============================================================================
 *  IntMap · subcables — geodesy, simplification, and the medial axis of a
 *  corridor polygon
 * ----------------------------------------------------------------------------
 *  Everything here works in UNWRAPPED longitude: a route is a continuous run of
 *  longitudes that may leave [-180, 180] while it is being built, and is wrapped
 *  back — splitting the line at the antimeridian — exactly once, at the end
 *  (`splitAntimeridian`). Doing it any other way is how a Pacific cable ends up
 *  drawn as a horizontal streak across the whole map.
 * ==========================================================================*/

export const R_EARTH = 6371008.8;
const RAD = Math.PI / 180, DEG = 180 / Math.PI;

/* ── great-circle distance, metres ─────────────────────────────────────────── */
export function haversine(a, b) {
  const φ1 = a[1] * RAD, φ2 = b[1] * RAD;
  const dφ = φ2 - φ1, dλ = (b[0] - a[0]) * RAD;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += haversine(coords[i - 1], coords[i]);
  return s;
}

/* ── point at fraction f along the great circle a→b ────────────────────────── */
export function interpGC(a, b, f) {
  const φ1 = a[1] * RAD, λ1 = a[0] * RAD, φ2 = b[1] * RAD, λ2 = b[0] * RAD;
  const d = haversine(a, b) / R_EARTH;
  if (d < 1e-12) return [a[0], a[1]];
  const sd = Math.sin(d);
  const A = Math.sin((1 - f) * d) / sd, B = Math.sin(f * d) / sd;
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(y, x) * DEG, Math.atan2(z, Math.hypot(x, y)) * DEG];
}

/* ── unwrap a run of longitudes so consecutive points never jump > 180° ────── */
export function unwrap(coords) {
  if (!coords.length) return coords;
  const out = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, coords[i][1]]);
  }
  return out;
}

/* ── wrap back into [-180, 180], splitting where the line crosses ±180 ──────
   The split inserts the crossing point on BOTH sides at exactly ±180 so the two
   pieces meet on the seam instead of stopping short of it. */
export function splitAntimeridian(coords) {
  if (coords.length < 2) return coords.length ? [coords.map(c => [wrapLon(c[0]), c[1]])] : [];
  const parts = [];
  let cur = [[wrapLon(coords[0][0]), coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const lonA = a[0], lonB = b[0];
    /* how many seam crossings between the two unwrapped longitudes */
    const kA = Math.floor((lonA + 180) / 360), kB = Math.floor((lonB + 180) / 360);
    if (kA === kB) { cur.push([wrapLon(lonB), b[1]]); continue; }
    const step = kB > kA ? 1 : -1;
    let prevLon = lonA, prevLat = a[1];
    for (let k = kA; k !== kB; k += step) {
      const seam = step > 0 ? (k + 1) * 360 - 180 : k * 360 - 180;
      const t = (seam - lonA) / (lonB - lonA);
      const lat = a[1] + (b[1] - a[1]) * t;
      const edge = step > 0 ? 180 : -180;
      cur.push([edge, lat]);
      if (cur.length > 1) parts.push(cur);
      cur = [[-edge, lat]];
      prevLon = seam; prevLat = lat;
    }
    cur.push([wrapLon(lonB), b[1]]);
  }
  if (cur.length > 1) parts.push(cur);
  return parts;
}

export function wrapLon(lon) {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = -180;
  return x;
}

/* ── shortest signed longitude delta a→b ───────────────────────────────────── */
export function dLon(a, b) { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }

/* ── Douglas–Peucker on the sphere ─────────────────────────────────────────
   The perpendicular distance is measured as the cross-track distance to the
   great circle through the segment ends, in metres, so the tolerance means the
   same thing at 70°N as at the equator. Input must be unwrapped. */
export function simplify(coords, toleranceM) {
  if (coords.length <= 2 || !(toleranceM > 0)) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = 1; keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 - i0 < 2) continue;
    let worst = -1, wi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = crossTrack(coords[i0], coords[i1], coords[i]);
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst > toleranceM) { keep[wi] = 1; stack.push([i0, wi], [wi, i1]); }
  }
  const out = [];
  for (let i = 0; i < coords.length; i++) if (keep[i]) out.push(coords[i]);
  return out;
}

/* distance from p to the SEGMENT a→b, in metres (local equirectangular — the
   segments here are short relative to the Earth, and the error at 1000 km is
   well under the tolerances this is used with) */
export function crossTrack(a, b, p) {
  const lat0 = (a[1] + b[1]) * 0.5 * RAD, k = Math.cos(lat0);
  const ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1];
  const px = p[0] * k, py = p[1];
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  let t = L2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy) * RAD * R_EARTH;
}

/* ── densify: no leg longer than `stepM`, points placed on the great circle ── */
export function densify(coords, stepM) {
  if (coords.length < 2) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], d = haversine(a, b);
    const n = Math.ceil(d / stepM);
    for (let k = 1; k < n; k++) {
      const p = interpGC([wrapLon(a[0]), a[1]], [wrapLon(a[0]) + dLon(wrapLon(a[0]), wrapLon(b[0])), b[1]], k / n);
      out.push([a[0] + dLon(a[0], p[0]), p[1]]);
    }
    out.push(b);
  }
  return out;
}

/* ── drop consecutive duplicates (the NOAA rings carry many) ───────────────── */
export function dedupe(coords, epsM = 1) {
  if (!coords.length) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) if (haversine(out[out.length - 1], coords[i]) > epsM) out.push(coords[i]);
  return out;
}

/* ══ THE MEDIAL AXIS OF A CORRIDOR POLYGON ═══════════════════════════════════
   NOAA's Marine Cadastre publishes US cable routes as CORRIDORS — a thin buffer
   around the laid route, median width 120 m over a route tens or hundreds of km
   long (measured: p10 56 m, p50 120 m, p90 381 m). The route itself is the
   polygon's medial axis, and for a shape that thin the axis is recoverable:
   every vertex on one wall has a partner on the other wall, and the midpoints
   of those pairs are the centreline.

   ── TIPS, NOT "THE TWO ENDS" ───────────────────────────────────────────────
   A TIP is a place where the corridor turns around: a vertex whose nearest
   partner — nearest among the vertices that are far from it ALONG THE RING — is
   only a short way along the ring instead of half a ring away. A simple
   corridor has two. A branched one (a trunk with a spur; several island hops
   published as one polygon) has three or more, and cutting such a ring at two
   tips explains only one limb: measured on `SCCN`, a 2,870 km ring in the
   Hawaiian islands, that produced an "axis" 449 km away from part of its own
   polygon. So ALL the tips are found, the ring is cut at every one of them, and
   the resulting chains are PAIRED into walls by asking each chain's own
   vertices which chain their partners live in. Every mutually-agreeing pair
   yields one limb of the axis; a chain whose partners disagree is dropped.

   ⚠ THE SEPARATION MUST BE MEASURED IN METRES ALONG THE RING, NOT IN VERTICES.
   These rings mix 0.5 m and 100 km segments, so "at least k vertices away"
   admitted a same-wall neighbour two metres off as a "partner", and every tip
   test then found its minimum wherever the vertices happened to be densest.

   ⚠ THIS IS NOT A GENERAL SKELETONISER AND MUST NOT PRETEND TO BE. Every limb
   it returns is handed back with the wall vertices it was built from, so the
   caller can measure how far the polygon actually sits from the line it just
   claimed is its centre — and drop it if that is more than the corridor is
   wide. A cable-AREA protection zone tens of km across is not a corridor, and
   its medial axis is not a cable route. */
export function corridorAxes(ring, { maxWidthM = 4000 } = {}) {
  const r = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring.slice();
  const m = r.length;
  if (m < 8) return [];
  const { area, perim } = ringAreaPerim(r);
  if (!(perim > 0) || !(area > 0)) return [];
  const width = 4 * area / perim;             /* thin shape: A ≈ (P/2 − w)·w ⇒ w ≈ 4A/P for w ≪ P */
  if (!(width > 0) || width > maxWidthM) return [];

  /* local metric: metres, via a plate-carrée scaling at the ring's own latitude */
  const latRef = r.reduce((s, p) => s + p[1], 0) / m;
  const kx = Math.cos(latRef * RAD) * RAD * R_EARTH, ky = RAD * R_EARTH;
  const X = new Float64Array(m), Y = new Float64Array(m);
  for (let i = 0; i < m; i++) { X[i] = r[i][0] * kx; Y[i] = r[i][1] * ky; }

  const arc = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) arc[i + 1] = arc[i] + Math.hypot(X[(i + 1) % m] - X[i], Y[(i + 1) % m] - Y[i]);
  const P = arc[m];
  const arcGap = (i, j) => { const d = Math.abs(arc[i] - arc[j]); return Math.min(d, P - d); };
  const minSep = Math.max(width * 4, 250);
  if (P < minSep * 4) return [];

  /* grid index over the ring so the partner search is local, not O(m²) */
  const cell = Math.max(width * 3, 25);
  let minX = Infinity, minY = Infinity, maxX = -Infinity;
  for (let i = 0; i < m; i++) { if (X[i] < minX) minX = X[i]; if (Y[i] < minY) minY = Y[i]; if (X[i] > maxX) maxX = X[i]; }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const buckets = new Map();
  const key = (cx, cy) => cy * cols + cx;
  for (let i = 0; i < m; i++) {
    const k = key(Math.floor((X[i] - minX) / cell), Math.floor((Y[i] - minY) / cell));
    let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i);
  }
  const partner = new Int32Array(m).fill(-1);
  const partnerGap = new Float64Array(m).fill(P);
  const partnerDist = new Float64Array(m).fill(Infinity);
  for (let i = 0; i < m; i++) {
    const cx = Math.floor((X[i] - minX) / cell), cy = Math.floor((Y[i] - minY) / cell);
    let best = -1, bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const a = buckets.get(key(cx + dx, cy + dy)); if (!a) continue;
      for (const j of a) {
        if (arcGap(i, j) < minSep) continue;
        const d = (X[i] - X[j]) ** 2 + (Y[i] - Y[j]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    }
    partner[i] = best;
    if (best >= 0) { partnerGap[i] = arcGap(i, best); partnerDist[i] = Math.sqrt(bd); }
  }

  /* ── every tip: a run of consecutive vertices whose partner is close along the
       ring, collapsed to the single vertex where it is closest ──────────────── */
  const tipThresh = Math.max(width * 10, minSep * 2);
  const isTip = new Uint8Array(m);
  for (let i = 0; i < m; i++) if (partner[i] < 0 || partnerGap[i] < tipThresh) isTip[i] = 1;
  const tips = [];
  {
    let start = 0;
    while (start < m && isTip[start]) start++;
    if (start === m) return [];                       /* the whole ring is "tip" — not a corridor */
    for (let k = 0; k < m; k++) {
      const i = (start + k) % m;
      if (!isTip[i]) continue;
      let bi = i, bg = partnerGap[i], n = 0;
      while (isTip[(start + k) % m] && n < m) {
        const j = (start + k) % m;
        if (partnerGap[j] <= bg) { bg = partnerGap[j]; bi = j; }
        k++; n++;
      }
      tips.push(bi);
      k--;
    }
  }
  if (tips.length < 2) return [];
  tips.sort((a, b) => a - b);

  /* ── cut the ring at the tips → chains, each running tip[c] → tip[c+1] ────── */
  const chains = [], chainOf = new Int32Array(m).fill(-1);
  for (let c = 0; c < tips.length; c++) {
    const a = tips[c], b = tips[(c + 1) % tips.length];
    const idx = [];
    for (let i = a; ; i = (i + 1) % m) { idx.push(i); if (i === b) break; if (idx.length > m) return []; }
    if (idx.length < 2) { chains.push(null); continue; }
    chains.push({ idx, a, b });
    for (const i of idx) if (i !== a && i !== b) chainOf[i] = c;
  }

  /* ── pair the chains: each chain votes for the chain its partners live in ─── */
  const vote = chains.map(() => new Map());
  for (let c = 0; c < chains.length; c++) {
    const ch = chains[c]; if (!ch) continue;
    for (const i of ch.idx) {
      const j = partner[i]; if (j < 0) continue;
      const k = chainOf[j]; if (k < 0 || k === c) continue;
      vote[c].set(k, (vote[c].get(k) || 0) + 1);
    }
  }
  const mate = chains.map((ch, c) => {
    if (!ch || !vote[c].size) return -1;
    let best = -1, bv = 0, total = 0;
    for (const [k, v] of vote[c]) { total += v; if (v > bv) { bv = v; best = k; } }
    return bv >= total * 0.6 ? best : -1;                /* a chain whose walls disagree is dropped */
  });

  const out = [];
  for (let c = 0; c < chains.length; c++) {
    const d = mate[c];
    if (d < 0 || mate[d] !== c || d < c) continue;        /* mutual pairs only, once each */
    const A = chains[c].idx.map(i => r[i]);
    let B = chains[d].idx.map(i => r[i]);
    /* both walls must run the same way before they can be averaged */
    const head = Math.hypot(X[chains[c].idx[0]] - X[chains[d].idx[0]], Y[chains[c].idx[0]] - Y[chains[d].idx[0]]);
    const tail = Math.hypot(X[chains[c].idx[0]] - X[chains[d].idx[chains[d].idx.length - 1]],
      Y[chains[c].idx[0]] - Y[chains[d].idx[chains[d].idx.length - 1]]);
    if (tail < head) B = B.slice().reverse();
    const limb = averageWalls(A, B, width);
    if (limb) out.push({ axis: limb.axis, width: limb.width, walls: A.concat(B) });
  }
  return out;
}

/* ══ AVERAGING THE TWO WALLS ══════════════════════════════════════════════════
   ⚠ NOT BY ARC-LENGTH FRACTION. Where the corridor bends, the outer wall is
   longer than the inner one by w·Δθ, so "the point 40 % of the way along each
   wall" names two places that are not opposite each other, and the error
   compounds over every bend — measured at a median of 2.9 × the corridor's own
   half-width, i.e. the "centreline" sat outside the corridor.

   The medial axis of a thin shape is where the two walls are CLOSEST, so each
   point of one wall is projected onto the OTHER WALL ITSELF (the polyline, not
   its vertices) and the midpoint of that pair is an axis point. The wall being
   walked is densified first, so the axis is sampled at half the corridor width
   however sparsely the source described that wall — the NOAA rings mix 0.5 m
   and 100 km segments.

   The width the caller gets back is MEASURED here (the median wall separation),
   not the 4A/P estimate, which a branch junction inflates. */
export function averageWalls(A, B, approxWidth) {
  const step = Math.max(approxWidth * 0.5, 15);
  const AD = densify(A, step);
  if (AD.length < 2 || B.length < 2) return null;
  const WINDOW = 24, bad = Math.max(approxWidth * 5, 500);
  const mids = new Array(AD.length), seps = new Array(AD.length);
  let hint = 0;
  for (let i = 0; i < AD.length; i++) {
    let r = nearestOnLine(B, AD[i], Math.max(0, hint - WINDOW), hint + WINDOW);
    if (!(r.dist < bad)) r = nearestOnLine(B, AD[i]);
    hint = r.i;
    mids[i] = [(AD[i][0] + r.point[0]) / 2, (AD[i][1] + r.point[1]) / 2];
    seps[i] = r.dist;
  }
  const axis = dedupe(mids, Math.max(1, approxWidth * 0.25));
  if (axis.length < 2) return null;
  const s = seps.slice().sort((a, b) => a - b);
  return { axis, width: s[s.length >> 1] };
}

/* ── how far does the polygon actually sit from the line we call its centre? ──
   The acceptance test for `corridorAxes`. For a true medial axis of a corridor
   of width w this is w/2 everywhere; the caller drops anything above a small
   multiple of that rather than shipping a "verified" route that is not one. */
export function axisFit(axis, walls) {
  let worst = 0;
  for (const p of walls) { const d = nearestOnLine(axis, p).dist; if (d > worst) worst = d; }
  return worst;
}
/* ── N points spread evenly by arc length along a polyline (ends included) ─── */
export function resampleByArc(coords, n) {
  if (coords.length < 2 || n < 2) return coords.slice();
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return coords.slice();
  const out = [coords[0]];
  let j = 1;
  for (let k = 1; k < n - 1; k++) {
    const s = total * k / (n - 1);
    while (j < cum.length - 1 && cum[j] < s) j++;
    const s0 = cum[j - 1], s1 = cum[j];
    const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const a = coords[j - 1], b = coords[j];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

export function ringAreaPerim(r) {
  const m = r.length;
  const latRef = r.reduce((s, p) => s + p[1], 0) / m;
  const kx = Math.cos(latRef * RAD) * RAD * R_EARTH, ky = RAD * R_EARTH;
  let A = 0, P = 0;
  for (let i = 0; i < m; i++) {
    const a = r[i], b = r[(i + 1) % m];
    const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky;
    P += Math.hypot(bx - ax, by - ay);
    A += ax * by - bx * ay;
  }
  return { area: Math.abs(A) / 2, perim: P };
}

/* ── nearest point on a polyline, and the distance to it ───────────────────
   `from`/`to` bound the segment range searched. The corridor walker walks both
   walls in step, so it passes a window around where it last landed and only
   falls back to the whole line when that window answers badly. */
export function nearestOnLine(coords, p, from = 0, to = Infinity) {
  let bd = Infinity, bi = 0, bt = 0;
  const hi = Math.min(coords.length - 1, to);
  for (let i = Math.max(1, from + 1); i <= hi; i++) {
    const d = crossTrack(coords[i - 1], coords[i], p);
    if (d < bd) {
      bd = d; bi = i - 1;
      const a = coords[i - 1], b = coords[i];
      const lat0 = (a[1] + b[1]) * 0.5 * RAD, k = Math.cos(lat0);
      const vx = (b[0] - a[0]) * k, vy = b[1] - a[1];
      const L2 = vx * vx + vy * vy;
      bt = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * k * vx + (p[1] - a[1]) * vy) / L2)) : 0;
    }
  }
  const a = coords[bi], b = coords[Math.min(bi + 1, coords.length - 1)];
  return { dist: bd, i: bi, t: bt, point: [a[0] + (b[0] - a[0]) * bt, a[1] + (b[1] - a[1]) * bt] };
}

/* ── Chaikin corner cutting, distance-limited ──────────────────────────────
   A least-cost path on a lattice is a staircase of 22.5° turns. Smoothing it is
   not decoration: the staircase is an artefact of the grid, not of the sea
   floor, and leaving it in claims a precision the grid does not have (the brief's
   §21). Corner cutting moves no point further than a quarter of the shorter
   adjacent leg, so the smoothed line stays inside the corridor the router
   proved is passable — but every result is re-checked against land afterwards. */
export function chaikin(coords, iterations = 2) {
  let out = coords;
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) return out;
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/* ── do two segments cross? (planar, for self-intersection QA) ─────────────── */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
