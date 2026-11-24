/* ============================================================================
 *  IntMap · logistics — the rail graph and the nearest-port labelling (pure; build-time only)
 * ----------------------------------------------------------------------------
 *  data/railways/c/*.json.gz is OpenStreetMap rail as CHAINS: lines simplified at 0.0012° (~130 m) and cut at every
 *  5° cell edge (scripts/rail/build.mjs). Two consequences this file exists to handle, both MEASURED on the shipped
 *  cells (2026-11-20): joining chains only where their vertices coincide leaves 66,213 components and the largest
 *  holds 3.4 % of the vertices (so Rotterdam and Berlin are not connected) — because simplification removed the
 *  junction vertex from the through-line while the branch still ends on it.
 *  ⇒ A chain END that lies within `snapM` of ANOTHER chain's segment is a junction: a node is inserted on that
 *    segment at the projection and the end is joined to it. Nothing else is joined — two lines that merely cross
 *    without either ending on the other stay apart (a level crossing / a bridge is not a switch).
 *
 *  ⚠ THIS IS A MODEL OF REACHABILITY, NOT OF FREIGHT. Track gauge, electrification, capacity and operator are not
 *    constraints here; "reachable by rail" means the OSM geometry is connected. The build says so in the file header.
 * ==========================================================================*/

const R = 6371.0088;
const rad = Math.PI / 180;
export function hav(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Equirectangular distance in metres and the foot of the perpendicular of p on segment ab (t in [0,1]). */
export function project(px, py, ax, ay, bx, by) {
  const k = Math.cos(py * rad);
  const ux = (bx - ax) * k, uy = by - ay, vx = (px - ax) * k, vy = py - ay;
  const L2 = ux * ux + uy * uy;
  let t = L2 > 0 ? (vx * ux + vy * uy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = (px - (ax + (bx - ax) * t)) * k, dy = py - (ay + (by - ay) * t);
  return { t, m: Math.sqrt(dx * dx + dy * dy) * 111195 };
}

const GRID = 0.02; /* degrees; a segment is filed in every grid cell its bounding box touches */
const gk = (gx, gy) => gx * 100000 + gy;

/**
 * chains: [{ id, xs: Float64Array|number[], ys: ... }]   (lng, lat per vertex)
 * returns a graph with CSR adjacency: { n, lng[], lat[], off[], to[], km[] , attach(id,lng,lat,maxM) }
 */
export function buildRailGraph(chains, opts) {
  const snapM = opts.snapM;
  /* ── vertices, merged where coordinates are identical ── */
  const ids = new Map();
  const lng = [], lat = [];
  const vid = (x, y) => {
    const key = Math.round(x * 1e5) * 1e9 + Math.round(y * 1e5);
    let i = ids.get(key);
    if (i === undefined) { i = lng.length; ids.set(key, i); lng.push(x); lat.push(y); }
    return i;
  };
  const cv = chains.map((c) => { const a = new Int32Array(c.xs.length); for (let i = 0; i < a.length; i++) a[i] = vid(c.xs[i], c.ys[i]); return a; });

  /* ── segment index ── */
  const grid = new Map();
  const segs = []; /* [chain, segIndex] packed as chain*2^20? chains have < 1M vertices; use two parallel arrays */
  const segC = [], segI = [];
  chains.forEach((c, ci) => {
    for (let i = 0; i + 1 < c.xs.length; i++) {
      const sid = segC.length; segC.push(ci); segI.push(i);
      const x0 = Math.min(c.xs[i], c.xs[i + 1]), x1 = Math.max(c.xs[i], c.xs[i + 1]);
      const y0 = Math.min(c.ys[i], c.ys[i + 1]), y1 = Math.max(c.ys[i], c.ys[i + 1]);
      for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) {
        const k = gk(gx, gy); let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(sid);
      }
    }
  });

  /** nearest segment to (x,y) within maxM, optionally not on chain `skip`; searches the 3x3 grid block */
  function nearest(x, y, maxM, skip) {
    let best = null;
    const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
    const reach = Math.max(1, Math.ceil(maxM / 111195 / GRID));
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
      const l = grid.get(gk(gx + dx, gy + dy)); if (!l) continue;
      for (const sid of l) {
        const ci = segC[sid]; if (ci === skip) continue;
        const c = chains[ci], i = segI[sid];
        const p = project(x, y, c.xs[i], c.ys[i], c.xs[i + 1], c.ys[i + 1]);
        if (p.m <= maxM && (!best || p.m < best.m)) best = { sid, t: p.t, m: p.m };
      }
    }
    return best;
  }

  /* inserted nodes per segment: sid -> [{t, node}] */
  const ins = new Map();
  const insertOn = (hit, x, y) => {
    const ci = segC[hit.sid], i = segI[hit.sid], c = chains[ci];
    if (hit.t <= 1e-9) return cv[ci][i];
    if (hit.t >= 1 - 1e-9) return cv[ci][i + 1];
    const px = c.xs[i] + (c.xs[i + 1] - c.xs[i]) * hit.t, py = c.ys[i] + (c.ys[i + 1] - c.ys[i]) * hit.t;
    let l = ins.get(hit.sid); if (!l) { l = []; ins.set(hit.sid, l); }
    for (const e of l) if (Math.abs(e.t - hit.t) < 1e-7) return e.node;
    const node = lng.length; lng.push(px); lat.push(py); l.push({ t: hit.t, node });
    return node;
  };

  /* ── chain ends that lie on another chain: junctions ── */
  const extra = []; /* [a,b] zero-length-ish joins: end vertex to the inserted node (their gap is real: <= snapM) */
  let junctions = 0;
  chains.forEach((c, ci) => {
    for (const end of [0, c.xs.length - 1]) {
      const x = c.xs[end], y = c.ys[end];
      const hit = nearest(x, y, snapM, ci);
      if (!hit) continue;
      const node = insertOn(hit, x, y);
      if (node !== cv[ci][end]) { extra.push([cv[ci][end], node]); junctions++; }
    }
  });

  /* ── attach points (ports, cities, factories): the same operation, the gap is reported ── */
  const attachments = [];
  function attach(x, y, maxM) {
    const hit = nearest(x, y, maxM, -1);
    if (!hit) return null;
    const node = insertOn(hit, x, y);
    attachments.push(node);
    return { node, m: hit.m, hit };
  }

  /** call once after every attach(): builds the adjacency */
  function finish() {
    const eu = [], ev = [], ew = [];
    const push = (a, b) => { if (a !== b) { eu.push(a); ev.push(b); ew.push(hav(lng[a], lat[a], lng[b], lat[b])); } };
    chains.forEach((c, ci) => {
      const v = cv[ci];
      for (let i = 0; i + 1 < v.length; i++) {
        const l = ins.get(segFor(ci, i));
        if (!l) { push(v[i], v[i + 1]); continue; }
        l.sort((p, q) => p.t - q.t);
        let prev = v[i];
        for (const e of l) { push(prev, e.node); prev = e.node; }
        push(prev, v[i + 1]);
      }
    });
    for (const [a, b] of extra) push(a, b);
    const n = lng.length;
    const deg = new Int32Array(n + 1);
    for (let i = 0; i < eu.length; i++) { deg[eu[i] + 1]++; deg[ev[i] + 1]++; }
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    const off = deg, fill = new Int32Array(n), to = new Int32Array(eu.length * 2), km = new Float32Array(eu.length * 2);
    for (let i = 0; i < eu.length; i++) {
      let p = off[eu[i]] + fill[eu[i]]++; to[p] = ev[i]; km[p] = ew[i];
      p = off[ev[i]] + fill[ev[i]]++; to[p] = eu[i]; km[p] = ew[i];
    }
    return { n, off, to, km, lng, lat, edges: eu.length };
  }
  /* segment id of (chain, i): segments were numbered consecutively per chain in construction order */
  const firstSeg = new Int32Array(chains.length);
  { let s = 0; chains.forEach((c, ci) => { firstSeg[ci] = s; s += Math.max(0, c.xs.length - 1); }); }
  const segFor = (ci, i) => firstSeg[ci] + i;

  return { attach, finish, stats: () => ({ vertices: ids.size, junctions, inserted: lng.length - ids.size }) };
}

/** connected-component sizes (by node) of a CSR graph: labels[] and the size of each label */
export function components(g) {
  const lab = new Int32Array(g.n).fill(-1), size = [];
  const stack = [];
  for (let s = 0; s < g.n; s++) {
    if (lab[s] >= 0) continue;
    const id = size.length; let cnt = 0; lab[s] = id; stack.push(s);
    while (stack.length) { const u = stack.pop(); cnt++; for (let p = g.off[u]; p < g.off[u + 1]; p++) { const v = g.to[p]; if (lab[v] < 0) { lab[v] = id; stack.push(v); } } }
    size.push(cnt);
  }
  return { lab, size };
}

/* ── a binary heap on (dist, node, src) ── */
class Heap {
  constructor() { this.d = []; this.n = []; this.s = []; }
  get size() { return this.d.length; }
  push(d, n, s) {
    const D = this.d, N = this.n, S = this.s; let i = D.length; D.push(d); N.push(n); S.push(s);
    while (i > 0) { const p = (i - 1) >> 1; if (D[p] <= D[i]) break; [D[p], D[i]] = [D[i], D[p]]; [N[p], N[i]] = [N[i], N[p]]; [S[p], S[i]] = [S[i], S[p]]; i = p; }
  }
  pop() {
    const D = this.d, N = this.n, S = this.s; const out = [D[0], N[0], S[0]];
    const ld = D.pop(), ln = N.pop(), ls = S.pop();
    if (D.length) {
      D[0] = ld; N[0] = ln; S[0] = ls; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < D.length && D[l] < D[m]) m = l; if (r < D.length && D[r] < D[m]) m = r; if (m === i) break;
        [D[m], D[i]] = [D[i], D[m]]; [N[m], N[i]] = [N[i], N[m]]; [S[m], S[i]] = [S[i], S[m]]; i = m; }
    }
    return out;
  }
}

/**
 * The K nearest DISTINCT sources of every node, by path length on the graph, within maxKm.
 * sources: [{ node, src, startKm }]  (src = the source's index; startKm = its access leg, so a port 3 km off the rail starts at 3)
 * `blocked`: Set of src indexes that are removed (a closed port) — used by tests to compare the label walk against a rerun.
 * returns labels: Array(n) of [[src, km], …] ascending, length <= K
 */
export function nearestSources(g, sources, K, maxKm, blocked) {
  const have = new Array(g.n);
  const H = new Heap();
  for (const s of sources) { if (blocked && blocked.has(s.src)) continue; H.push(s.startKm || 0, s.node, s.src); }
  while (H.size) {
    const [d, u, s] = H.pop();
    if (d > maxKm) break;
    let l = have[u];
    if (!l) { l = have[u] = []; }
    if (l.length >= K) continue;
    let dup = false; for (let i = 0; i < l.length; i++) if (l[i][0] === s) { dup = true; break; }
    if (dup) continue;
    l.push([s, d]);
    for (let p = g.off[u]; p < g.off[u + 1]; p++) {
      const v = g.to[p], nd = d + g.km[p];
      if (nd > maxKm) continue;
      const lv = have[v];
      if (lv && (lv.length >= K || lv.some((x) => x[0] === s))) continue;
      H.push(nd, v, s);
    }
  }
  return have;
}
