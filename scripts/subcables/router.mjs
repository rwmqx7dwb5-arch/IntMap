/* ============================================================================
 *  IntMap · subcables — LEAST-COST PATH OVER THE SEA FLOOR
 * ----------------------------------------------------------------------------
 *  A submarine cable is not a great circle. Between two landing points it is the
 *  cheapest line the sea floor allows, and "cheapest" for a cable-laying ship is
 *  not "shortest": it is distance, plus everything that makes a length of route
 *  expensive to lay or likely to break.
 *
 *  ── THE COST ──────────────────────────────────────────────────────────────
 *  Every term below is read from the 1/12° sea-floor grid built by
 *  scripts/subcables/seafloor.mjs (mean depth, within-cell depth σ, sea
 *  fraction) or computed between two cells (gradient). The multiplier starts at
 *  1 — the geodesic — and only ever adds, so the A* heuristic "straight-line
 *  distance" is admissible and the path it returns is the optimum of this cost.
 *
 *    land                 hard barrier. Not a cost: a cable does not cross it.
 *    shelf  (<200 m)      trawlers and anchors: ~70 % of all cable faults are on
 *                         the shelf, so a route crosses it and does not follow it
 *    very shallow (<30 m) burial territory — expensive per kilometre
 *    abyssal (>6000 m)    beyond routine repair-ship reach
 *    within-cell σ        the canyon / escarpment / seamount-flank term: a flat
 *                         abyssal plain has σ of metres, a canyon wall hundreds
 *    gradient             the slope actually crossed by THIS step, so a route
 *                         may run along a contour where it may not climb it
 *    part-land cell       keeps the line off the coast except where it lands
 *
 *  ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *  ⚠ It is not a survey. The grid is 9.26 km at the equator, so the result is
 *  a plausible corridor at that scale and NOTHING finer. Everything downstream
 *  treats it as such: it is smoothed to the grid's own resolution rather than
 *  decorated with vertices, and it is labelled `reconstructed`, never
 *  `verified` (the brief's §21 — no false precision).
 * ==========================================================================*/
import { haversine, R_EARTH } from './geo.mjs';

const RAD = Math.PI / 180;

export class SeafloorRouter {
  constructor(grid, opts = {}) {
    this.w = grid.w; this.h = grid.h;
    this.depth = grid.depth; this.rough = grid.rough; this.seaFrac = grid.seaFrac;
    this.cellDeg = 360 / grid.w;
    const N = this.w * this.h;

    /* per-cell multiplier and passability */
    this.seaMin = opts.seaMin ?? 0.12;
    this.mult = new Float32Array(N);
    this.passable = new Uint8Array(N);
    let nPass = 0;
    for (let i = 0; i < N; i++) {
      const sf = this.seaFrac[i] / 255;
      if (sf < this.seaMin) continue;
      this.passable[i] = 1; nPass++;
      const d = this.depth[i], r = this.rough[i];
      let m = 1;
      if (d < 30) m += 1.9;
      else if (d < 200) m += 0.75 * (200 - d) / 170;
      if (d > 6000) m += Math.min(1.2, (d - 6000) / 3500);
      m += Math.min(2.2, r / 240);                 /* within-cell roughness */
      m += (1 - sf) * 0.9;                          /* part-land cell */
      this.mult[i] = m;
    }
    this.passableCells = nPass;

    /* geometry tables: metres per cell step, and the unit vector of each row/col */
    this.dyM = this.cellDeg * RAD * R_EARTH;
    this.dxM = new Float64Array(this.h);
    this.cosLat = new Float64Array(this.h); this.sinLat = new Float64Array(this.h);
    for (let j = 0; j < this.h; j++) {
      const lat = 90 - (j + 0.5) * this.cellDeg;
      this.cosLat[j] = Math.cos(lat * RAD); this.sinLat[j] = Math.sin(lat * RAD);
      this.dxM[j] = this.dyM * Math.max(1e-6, this.cosLat[j]);
    }
    this.cosLon = new Float64Array(this.w); this.sinLon = new Float64Array(this.w);
    for (let k = 0; k < this.w; k++) {
      const lon = -180 + (k + 0.5) * this.cellDeg;
      this.cosLon[k] = Math.cos(lon * RAD); this.sinLon[k] = Math.sin(lon * RAD);
    }

    /* search state — a generation stamp so nothing is ever cleared between runs */
    this.g = new Float32Array(N);
    this.prev = new Int32Array(N);
    this.stamp = new Int32Array(N);
    this.state = new Uint8Array(N);
    this.gen = 0;
    this._hk = new Float64Array(1024); this._hv = new Int32Array(1024); this._hn = 0;
    this.stats = { runs: 0, expanded: 0, retries: 0, failures: 0, reSnapped: 0, noSharedWater: 0 };
    this._comp = null;
  }

  idx(j, k) { return j * this.w + ((k % this.w) + this.w) % this.w; }
  lonOf(k) { return -180 + (k + 0.5) * this.cellDeg; }
  latOf(j) { return 90 - (j + 0.5) * this.cellDeg; }
  colOf(lon) { let k = Math.floor((lon + 180) / this.cellDeg); return ((k % this.w) + this.w) % this.w; }
  rowOf(lat) { return Math.max(0, Math.min(this.h - 1, Math.floor((90 - lat) / this.cellDeg))); }
  centre(i) { return [this.lonOf(i % this.w), this.latOf(Math.floor(i / this.w))]; }

  /* ── nearest passable cell to a coordinate, searched outward in rings ────── */
  snapToSea(lon, lat, maxRings = 40) {
    const j0 = this.rowOf(lat), k0 = this.colOf(lon);
    if (this.passable[this.idx(j0, k0)]) return this.idx(j0, k0);
    for (let r = 1; r <= maxRings; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        const j = j0 + dj; if (j < 0 || j >= this.h) continue;
        const span = (Math.abs(dj) === r) ? 1 : 2 * r;          /* ring, not disc */
        for (let s = 0; s < (Math.abs(dj) === r ? 2 * r + 1 : 2); s++) {
          const dk = (Math.abs(dj) === r) ? (-r + s) : (s === 0 ? -r : r);
          const i = this.idx(j, k0 + dk);
          if (!this.passable[i]) continue;
          const d = haversine([lon, lat], this.centre(i));
          if (d < bd) { bd = d; best = i; }
        }
        void span;
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /* ══ ⚠⚠⚠ (#R384) THE NEAREST WATER IS OFTEN NOT THE WATER THE CABLE IS IN ═══
     A 9.26 km cell turns a fjord, an inlet, an archipelago channel or a river
     mouth into a POND: a handful of passable cells with no cell-to-cell path to
     the ocean. `snapToSea` finds it — it is the nearest water, and it is 5 km
     away — and A* then searches a puddle it can never leave. The leg comes back
     UNROUTABLE and falls all the way through to a geodesic drawn over land.

     MEASURED on the shipped dataset: the grid has 2,331 disconnected bodies of
     water. One of them is the world ocean (6,260,491 cells); the rest are ponds,
     and the landing points sitting in them are why 46 cables carry 47,181 km of
     `estimated` route — Halifax (c1348), Stockholm (c849), Hillsboro (c1332),
     Valdez (c770), Whittier (c795), Milton NL (c1272), Port Alberni (c1241),
     Thanlyin (c1731), Jacksonville (c1588), Tortel (c2125), Bima (c1942), Fauske
     (c448), Puvirnituq (c835), Deception (c720) and 14 of Connected Coast's 105
     British Columbia landings. exa-express drew a straight line from Halifax to
     Cork over 4,687 km because Halifax harbour is a pond.

     ⚠ THE ANSWER IS NOT A LONGER SNAP. #R355 bounded the snap at 60 km on
     purpose, because a cable laid up the Amazon that is dragged out to the
     Atlantic and back is a route between two places the cable is not. The bound
     stays exactly where it is; what changes is WHICH water the two ends are
     allowed to pick — they must pick water that is CONNECTED TO EACH OTHER's.
     A leg whose ends share no body of water within the bound is still refused,
     which is what keeps the Amazon honest (measured below: it still is).

     The components are flood-filled once, after the lakes and channels have been
     carved, and the fill is invalidated if anything opens a cell afterwards. */
  invalidateComponents() { this._comp = null; }

  components() {
    if (this._comp) return this._comp;
    const { w, h, passable } = this, N = w * h;
    const comp = new Int32Array(N).fill(-1);
    const stack = new Int32Array(N);
    const sizes = [];
    for (let s = 0; s < N; s++) {
      if (!passable[s] || comp[s] >= 0) continue;
      const id = sizes.length; let n = 0, sp = 0;
      stack[sp++] = s; comp[s] = id;
      while (sp > 0) {
        const cur = stack[--sp]; n++;
        const k = cur % w, j = (cur - k) / w;
        for (let dj = -1; dj <= 1; dj++) {
          const nj = j + dj; if (nj < 0 || nj >= h) continue;
          for (let dk = -1; dk <= 1; dk++) {
            if (!dj && !dk) continue;
            const i = this.idx(nj, k + dk);
            if (passable[i] && comp[i] < 0) { comp[i] = id; stack[sp++] = i; }
          }
        }
      }
      sizes.push(n);
    }
    this._comp = { comp, sizes };
    return this._comp;
  }

  /* every body of water within `maxSnapM` of a point, with the nearest cell of
     each — the raw material for "which one do BOTH ends have?" */
  componentsNear(lon, lat, maxSnapM, maxRings = 40) {
    const { comp } = this.components();
    const out = new Map();
    const j0 = this.rowOf(lat), k0 = this.colOf(lon);
    for (let r = 0; r <= maxRings; r++) {
      for (let dj = -r; dj <= r; dj++) {
        const j = j0 + dj; if (j < 0 || j >= this.h) continue;
        const edge = Math.abs(dj) === r;
        const steps = edge ? 2 * r + 1 : 2;
        for (let s = 0; s < steps; s++) {
          const dk = edge ? (-r + s) : (s === 0 ? -r : r);
          if (!r && s) continue;
          const i = this.idx(j, k0 + dk);
          if (!this.passable[i]) continue;
          const d = haversine([lon, lat], this.centre(i));
          if (d > maxSnapM) continue;
          const c = comp[i];
          const cur = out.get(c);
          if (!cur || d < cur.d) out.set(c, { i, d });
        }
      }
    }
    return out;
  }

  /* the pair of cells, one near each end, in the SAME body of water, that costs
     the least snapping. null when the two ends share no water within the bound. */
  sharedSnap(from, to, maxSnapM) {
    const A = this.componentsNear(from[0], from[1], maxSnapM);
    if (!A.size) return null;
    const B = this.componentsNear(to[0], to[1], maxSnapM);
    let best = null;
    for (const [c, a] of A) {
      const b = B.get(c); if (!b) continue;
      const score = Math.max(a.d, b.d);
      if (!best || score < best.score) best = { score, si: a.i, ti: b.i, comp: c };
    }
    return best;
  }

  /* ── heap ─────────────────────────────────────────────────────────────────── */
  _hgrow() {
    if (this._hn < this._hk.length) return;
    const k = new Float64Array(this._hk.length * 2), v = new Int32Array(this._hv.length * 2);
    k.set(this._hk); v.set(this._hv); this._hk = k; this._hv = v;
  }
  _hpush(key, val) {
    this._hgrow();
    let i = this._hn++;
    this._hk[i] = key; this._hv[i] = val;
    while (i > 0) { const p = (i - 1) >> 1; if (this._hk[p] <= this._hk[i]) break;
      const tk = this._hk[p], tv = this._hv[p]; this._hk[p] = this._hk[i]; this._hv[p] = this._hv[i]; this._hk[i] = tk; this._hv[i] = tv; i = p; }
  }
  _hpop() {
    const top = this._hv[0];
    this._hn--;
    if (this._hn > 0) {
      this._hk[0] = this._hk[this._hn]; this._hv[0] = this._hv[this._hn];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < this._hn && this._hk[l] < this._hk[s]) s = l;
        if (r < this._hn && this._hk[r] < this._hk[s]) s = r;
        if (s === i) break;
        const tk = this._hk[s], tv = this._hv[s]; this._hk[s] = this._hk[i]; this._hv[s] = this._hv[i]; this._hk[i] = tk; this._hv[i] = tv; i = s;
      }
    }
    return top;
  }

  /* ── the search ───────────────────────────────────────────────────────────
     `corridorM` bounds the search to a band around the great circle A→B. A
     cable that detours further than that from the straight line is not being
     routed, it is being lost, and the band is what keeps a Pacific crossing
     from expanding the whole northern hemisphere. It widens and retries. */
  route(from, to, opts = {}) {
    const D = haversine(from, to);
    /* ⚠ HOW FAR THE ENDS MAY BE SNAPPED IS PART OF THE QUESTION, NOT A DETAIL.
       `snapToSea` will happily walk forty cells to find water, and for a point
       deep inland — a cable laid up the Amazon, an anchor on a lake the grid
       does not have — that means routing between two places the cable is not.
       Measured without this bound: Norte Conectado Infovia-05 came out 6,287 km
       against a published 1,116, because each hop of its river route was snapped
       out to the Atlantic and back. Past the bound the leg is UNROUTABLE, which
       is the honest answer and the one the caller can fall back from. */
    const maxSnap = opts.maxSnapM ?? 60e3;
    let si = this.snapToSea(from[0], from[1]);
    let ti = this.snapToSea(to[0], to[1]);
    if (si < 0 || ti < 0) { this.stats.failures++; return null; }
    if (haversine(from, this.centre(si)) > maxSnap || haversine(to, this.centre(ti)) > maxSnap) { this.stats.failures++; return null; }
    /* (#R384) …and the two ends must be in the same body of water. When the
       nearest cells are not, ask for the cheapest pair that is — still inside
       the SAME `maxSnap`, so nothing is dragged anywhere #R355 refused to drag
       it. `stats.reSnapped` counts the ends this moved, because a fix that
       fires on a leg that was already fine is a fix that is doing something
       else. */
    const cmp = this.components().comp;
    if (cmp[si] !== cmp[ti]) {
      const sh = this.sharedSnap(from, to, maxSnap);
      if (!sh) { this.stats.failures++; this.stats.noSharedWater++; return null; }
      si = sh.si; ti = sh.ti; this.stats.reSnapped++;
    }
    const bands = opts.bands || [Math.max(400e3, D * 0.30), Math.max(1200e3, D * 0.75), Infinity];
    for (let b = 0; b < bands.length; b++) {
      const r = this._search(from, to, bands[b], { ...opts, startCell: si, goalCell: ti });
      if (r) { if (b) this.stats.retries++; return r; }
    }
    this.stats.failures++;
    return null;
  }

  _search(from, to, corridorM, opts) {
    const si = opts.startCell ?? this.snapToSea(from[0], from[1]);
    const ti = opts.goalCell ?? this.snapToSea(to[0], to[1]);
    if (si < 0 || ti < 0) return null;
    if (si === ti) return { cells: [si], cost: 0 };

    /* great-circle frame for the corridor test */
    const toVec = (lon, lat) => { const c = Math.cos(lat * RAD); return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)]; };
    const A = toVec(from[0], from[1]), B = toVec(to[0], to[1]);
    let n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    const useCorridor = corridorM < Infinity && nl > 1e-9;
    if (nl > 1e-9) n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const sinMax = Math.min(1, corridorM / R_EARTH);
    const angAB = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
    const slack = Math.min(Math.PI / 2, corridorM / R_EARTH + 0.02);
    const cosLimit = Math.cos(Math.min(Math.PI, angAB + slack));

    const gen = ++this.gen;
    const { w, h, mult, passable, depth, g, prev, stamp, state } = this;
    this._hn = 0;
    const goalLon = this.lonOf(ti % w), goalLat = this.latOf(Math.floor(ti / w));
    const hOf = (i) => {
      const k = i % w, j = (i - k) / w;
      const dLat = (this.latOf(j) - goalLat) * this.dyM;
      let dl = this.lonOf(k) - goalLon; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
      const dLon = dl * RAD * R_EARTH * Math.min(this.cosLat[j], Math.cos(goalLat * RAD));
      return Math.hypot(dLat, dLon);
    };

    g[si] = 0; prev[si] = -1; stamp[si] = gen; state[si] = 1;
    this._hpush(hOf(si), si);
    const limit = opts.maxExpand || 12_000_000;
    let expanded = 0;

    while (this._hn > 0) {
      const cur = this._hpop();
      if (stamp[cur] !== gen || state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === ti) {
        this.stats.runs++; this.stats.expanded += expanded;
        const cells = []; for (let i = cur; i >= 0; i = prev[i]) cells.push(i);
        cells.reverse();
        return { cells, cost: g[cur] };
      }
      if (++expanded > limit) break;
      const k = cur % w, j = (cur - k) / w;
      const gc = g[cur], dm = depth[cur], mc = mult[cur];
      const dx = this.dxM[j], dy = this.dyM;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = j + dj; if (nj < 0 || nj >= h) continue;
        const ndx = this.dxM[nj];
        for (let dk = -1; dk <= 1; dk++) {
          if (!dj && !dk) continue;
          const ni = this.idx(nj, k + dk);
          if (!passable[ni] || (stamp[ni] === gen && state[ni] === 2)) continue;
          /* corridor test — done once per cell, on first sight */
          if (useCorridor && stamp[ni] !== gen) {
            const px = this.cosLat[nj] * this.cosLon[ni % w], py = this.cosLat[nj] * this.sinLon[ni % w], pz = this.sinLat[nj];
            if (Math.abs(n[0] * px + n[1] * py + n[2] * pz) > sinMax) { stamp[ni] = gen; state[ni] = 3; g[ni] = Infinity; continue; }
            const dA = A[0] * px + A[1] * py + A[2] * pz, dB = B[0] * px + B[1] * py + B[2] * pz;
            if (dA < cosLimit || dB < cosLimit) { stamp[ni] = gen; state[ni] = 3; g[ni] = Infinity; continue; }
          }
          if (stamp[ni] === gen && state[ni] === 3) continue;
          const stepX = dk ? (dx + ndx) * 0.5 : 0, stepY = dj ? dy : 0;
          const len = Math.hypot(stepX, stepY);
          /* the gradient actually crossed by THIS step */
          const grad = Math.abs(depth[ni] - dm) / len;
          const gradPen = Math.min(2.0, grad * 12);
          const cost = len * ((mc + mult[ni]) * 0.5 + gradPen);
          const ng = gc + cost;
          if (stamp[ni] !== gen) { stamp[ni] = gen; state[ni] = 1; g[ni] = ng; prev[ni] = cur; this._hpush(ng + hOf(ni), ni); }
          else if (ng < g[ni]) { g[ni] = ng; prev[ni] = cur; state[ni] = 1; this._hpush(ng + hOf(ni), ni); }
        }
      }
    }
    this.stats.expanded += expanded;
    return null;
  }

  /* ── the cell path as coordinates (cell centres) ──────────────────────────── */
  toCoords(cells) { return cells.map(i => this.centre(i)); }

  /* ── does a straight leg between two coordinates cross an impassable cell? ── */
  crossesLand(a, b, stepM = 3000) {
    const d = haversine(a, b);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let dl = b[0] - a[0]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
      const lon = a[0] + dl * t, lat = a[1] + (b[1] - a[1]) * t;
      if (!this.passable[this.idx(this.rowOf(lat), this.colOf(lon))]) return true;
    }
    return false;
  }
}
