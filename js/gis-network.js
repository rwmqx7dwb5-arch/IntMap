/* ============================================================================
 *  IntMap · NETWORKS AS CONNECTIONS, NOT DISTANCES — the arithmetic behind `network` / `networkDisrupt`
 *  (js/gis-ops.js)
 * ----------------------------------------------------------------------------
 *  Routing answers 「A から B へ行くには」. A port, a railway, a cable, a grid or a supply chain is
 *  asked a different question: 「これが止まったら、何がつながらなくなるか」. That is a question about
 *  the GRAPH — which nodes are joined by which edges, how much each edge carries, how much of the
 *  rest depends on this one — and it has no meaning on a distance alone.
 *
 *  ══ WHAT A NETWORK IS HERE ════════════════════════════════════════════════════════════════════
 *  Any dataset of lines. Its nodes are where lines meet (endpoints, or every shared vertex for a
 *  road-like network), its edges are the lines, and the weight and the capacity of an edge are
 *  columns the reader NAMES. Nothing is guessed about what a column means:
 *    · cost    — `weightField`, else the great-circle length of the line in km. ⚠ An edge whose
 *      named cost is missing or not positive is LEFT OUT and counted (`edgesDroppedNoWeight`),
 *      never given its length: a length stands in a column of hours as a lie in the wrong unit.
 *    · capacity — `capacityField`, else 1 per edge (the answer is then the number of edge-disjoint
 *      routes, and `capacityBasis` says so). A named capacity that is missing is 0 and counted.
 *    · a feature that becomes several pieces (a MultiLineString, or a line split at the junctions
 *      it shares) gives each piece its share of the feature's cost in proportion to length. It is
 *      stated (`costSplit`) because it is exact for time and length and not for a toll.
 *
 *  ══ WHAT IS COMPUTED ══════════════════════════════════════════════════════════════════════════
 *    centrality   degree, harmonic closeness, betweenness (Brandes) on nodes and on edges
 *    maxflow      Dinic max flow between two node sets, the flow on every edge and the MIN CUT
 *                 (the bottleneck: the cheapest set of edges whose loss disconnects them)
 *    alternatives Yen's k shortest loop-free routes and how much each costs over the best
 *    disrupt      remove nodes/edges (everything a zone touches) and measure what changed: components,
 *                 pairs that can no longer reach each other, the detour of the pairs that still can,
 *                 and where the rerouted traffic lands (edge betweenness before and after)
 *
 *  ⚠ SAMPLING IS A STATED PROPERTY, NOT A DEFAULT. Betweenness and the disruption's pair counts walk
 *  a shortest-path tree from each source. Up to `maxSources` (default 512) every node is a source and
 *  the answer is EXACT; above it a seeded, replayable sample is used, scaled, and `exact:false` +
 *  `sourcesUsed` say so. 512 is a time budget (observed: one tree over the 2,995-node submarine
 *  cable graph is ~1 ms), not a property of networks; it is a parameter.
 *  ⚠ EVERY LOOP YIELDS BY TIME through `tick` (the host's one-frame rule), so a large network
 *  neither freezes the page nor ignores the cancel button.
 *
 *  Pure arithmetic: no `window`, no DOM. js/gis-ops.js hands in the distance function, the clock
 *  (`tick`) and the two geometry questions a zone needs.
 * ==========================================================================*/
export function makeGisNetwork() {
  return (function () {
    /* scripts/gis-kernel-versions.mjs keeps this honest: raise it when a replayed recipe would
       get a different answer. */
    const KERNEL_VERSION = 'network-1';

    /* Two path costs are the same when they differ by float64 summation noise only. OBSERVED: costs
       are sums of up to ~10^4 great-circle legs of ~10^0-10^3 km, i.e. ~10^-12 relative error;
       1e-9 stands three orders above it and far below any difference a reader would read as a
       different route. EXPIRES if costs ever carry sub-ppb meaning. */
    const COST_EPS = 1e-9;
    /* Default number of shortest-path trees walked exactly (see header). */
    const DEFAULT_MAX_SOURCES = 512;
    /* The sample is replayable: one seed, so the same recipe gives the same numbers. */
    const SAMPLE_SEED = 0x1f2e3d4c;

    const D2R = Math.PI / 180;
    function vec(p) { const la = p[1] * D2R, lo = p[0] * D2R, c = Math.cos(la); return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)]; }
    function isPos(p) { return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[1]) <= 90; }
    function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    /* ── binary min-heap over (key, node), lazy deletion ───────────────────────────────────────── */
    function makeHeap() {
      let keys = [], vals = [];
      return {
        size: () => keys.length,
        clear() { keys = []; vals = []; },
        push(k, v) {
          let i = keys.length; keys.push(k); vals.push(v);
          while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= k) break; keys[i] = keys[p]; vals[i] = vals[p]; i = p; }
          keys[i] = k; vals[i] = v;
        },
        pop() {
          const topK = keys[0], topV = vals[0];
          const lk = keys.pop(), lv = vals.pop();
          const n = keys.length;
          if (n > 0) {
            let i = 0;
            for (;;) {
              let c = 2 * i + 1; if (c >= n) break;
              if (c + 1 < n && keys[c + 1] < keys[c]) c++;
              if (keys[c] >= lk) break;
              keys[i] = keys[c]; vals[i] = vals[c]; i = c;
            }
            keys[i] = lk; vals[i] = lv;
          }
          return { k: topK, v: topV };
        },
      };
    }

    /* ══ BUILD ═══════════════════════════════════════════════════════════════════════════════════
       Points that are within snapKm of each other are ONE node. Found on 3-D unit vectors in a grid of
       cells snapKm wide, so the antimeridian and the poles are not special cases (the lng/lat grid a
       planar version would use has neither). Each point looks only at earlier points in its 27
       neighbouring cells, so each pair is tested once. */
    async function clusterPoints(pts, snapKm, R, tick) {
      const n = pts.length;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      /* A cell is never narrower than 100 m so the integer key below stays inside 2^53
         (3 × 17 bits). Wider cells only mean more candidates; the test is the real distance. */
      const cell = Math.max(snapKm, 0.1) / R;
      const chord = 2 * Math.sin(Math.min(Math.PI, snapKm / R) / 2);
      const OFF = 1 << 16, M = 1 << 17;
      const grid = new Map();
      const V = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) {
        if ((i & 2047) === 2047 && !(await tick(2048))) return null;
        const v = vec(pts[i]);
        V[3 * i] = v[0]; V[3 * i + 1] = v[1]; V[3 * i + 2] = v[2];
        const cx = Math.floor(v[0] / cell), cy = Math.floor(v[1] / cell), cz = Math.floor(v[2] / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const list = grid.get(((cx + dx + OFF) * M + (cy + dy + OFF)) * M + (cz + dz + OFF));
          if (!list) continue;
          for (let q = 0; q < list.length; q++) {
            const j = list[q];
            const ex = V[3 * j] - v[0], ey = V[3 * j + 1] - v[1], ez = V[3 * j + 2] - v[2];
            if (Math.sqrt(ex * ex + ey * ey + ez * ez) <= chord) { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
          }
        }
        const key = ((cx + OFF) * M + (cy + OFF)) * M + (cz + OFF);
        const own = grid.get(key);
        if (own) own.push(i); else grid.set(key, [i]);
      }
      const rep = new Int32Array(n);
      for (let i = 0; i < n; i++) rep[i] = find(i);
      return rep;
    }

    function lineKm(coords, distKm) { let s = 0; for (let i = 1; i < coords.length; i++) s += distKm(coords[i - 1], coords[i]); return s; }

    /* segs: [{row, coords, cost|null, cap|null, nameA, nameB}] one per LINE PART (a MultiLineString is
       several). Returns the graph, or null when cancelled. */
    async function build(segs, o) {
      const tick = o.tick, distKm = o.distKm;
      const stats = { loopsDropped: 0, edgesDroppedNoWeight: 0, capacityMissing: 0, costSplit: 0 };
      /* every position of every part, in order, so a point's index is its identity */
      const pts = [], first = [], last = [];
      for (const s of segs) {
        s.lo = pts.length;
        if (o.nodesAt === 'vertices') for (const p of s.coords) pts.push(p);
        else { pts.push(s.coords[0]); pts.push(s.coords[s.coords.length - 1]); }
        s.hi = pts.length - 1;
      }
      const rep = await clusterPoints(pts, o.snapKm, o.R, tick);
      if (!rep) return null;

      const nodeOf = new Int32Array(pts.length).fill(-1);   /* cluster rep -> node index */
      const nodes = [];
      const addNode = (pi, name) => {
        const r = rep[pi];
        let id = nodeOf[r];
        if (id < 0) { id = nodes.length; nodeOf[r] = id; nodes.push({ id, lng: pts[pi][0], lat: pts[pi][1], name: null, deg: 0 }); }
        if (name != null && nodes[id].name == null) nodes[id].name = name;
        return id;
      };
      const edges = [];
      const pushEdge = (u, v, coords, s, share) => {
        if (u === v) { stats.loopsDropped++; return; }
        const len = lineKm(coords, distKm);
        let w = len;
        if (s.cost != null) {
          if (!(s.cost > 0)) { stats.edgesDroppedNoWeight++; return; }
          w = s.cost * share;
          if (share < 1) stats.costSplit++;
        } else if (o.hasWeightField) { stats.edgesDroppedNoWeight++; return; }
        if (!(w > 0)) { stats.edgesDroppedNoWeight++; return; }
        let cap = 1;
        if (o.hasCapacityField) { if (s.cap != null && s.cap >= 0) cap = s.cap; else { cap = 0; stats.capacityMissing++; } }
        edges.push({ id: edges.length, u, v, w, cap, len, row: s.row, coords });
      };

      if (o.nodesAt === 'vertices') {
        /* a vertex is a node when a line ends there or two lines (or two visits) share it */
        const seen = new Int32Array(pts.length);
        for (const s of segs) { let prev = -1; for (let i = s.lo; i <= s.hi; i++) { const r = rep[i]; if (r !== prev) seen[r]++; prev = r; } }
        let yielded = 0;
        for (const s of segs) {
          if ((++yielded & 255) === 0 && !(await tick(256))) return null;
          const idx = []; let prev = -1;
          for (let i = s.lo; i <= s.hi; i++) { if (rep[i] !== prev) idx.push(i); prev = rep[i]; }
          if (idx.length < 2) { stats.loopsDropped++; continue; }
          const cutAt = [0];
          for (let q = 1; q < idx.length - 1; q++) if (seen[rep[idx[q]]] >= 2) cutAt.push(q);
          cutAt.push(idx.length - 1);
          const total = lineKm(s.coords, distKm) || 1;
          for (let c = 1; c < cutAt.length; c++) {
            const a = cutAt[c - 1], b = cutAt[c];
            const coords = s.coords.slice(idx[a] - s.lo, idx[b] - s.lo + 1);
            const share = cutAt.length > 2 ? lineKm(coords, distKm) / total : 1;
            const u = addNode(idx[a], a === 0 ? s.nameA : null), v = addNode(idx[b], b === idx.length - 1 ? s.nameB : null);
            pushEdge(u, v, coords, s, share);
          }
        }
      } else {
        const rowTotal = new Map();
        for (const s of segs) rowTotal.set(s.row, (rowTotal.get(s.row) || 0) + lineKm(s.coords, distKm));
        let yielded = 0;
        for (const s of segs) {
          if ((++yielded & 1023) === 0 && !(await tick(1024))) return null;
          const u = addNode(s.lo, s.nameA), v = addNode(s.hi, s.nameB);
          const tot = rowTotal.get(s.row) || 0;
          const mine = lineKm(s.coords, distKm);
          pushEdge(u, v, s.coords, s, (tot > 0 && mine < tot) ? mine / tot : 1);
        }
      }
      /* adjacency in CSR form. A directed edge is an arc u->v only. */
      const n = nodes.length, m = edges.length;
      const cnt = new Int32Array(n + 1);
      for (const e of edges) { cnt[e.u + 1]++; if (!o.directed) cnt[e.v + 1]++; }
      for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
      const fill = cnt.slice(0, n);
      const adjE = new Int32Array(cnt[n]), adjT = new Int32Array(cnt[n]);
      for (const e of edges) {
        adjE[fill[e.u]] = e.id; adjT[fill[e.u]++] = e.v;
        if (!o.directed) { adjE[fill[e.v]] = e.id; adjT[fill[e.v]++] = e.u; }
        nodes[e.u].deg++; nodes[e.v].deg++;
      }
      return { n, m, nodes, edges, start: cnt, adjE, adjT, directed: !!o.directed, stats };
    }

    /* ── components (weak, over edges not switched off) ───────────────────────────────────────── */
    function components(g, nodeOff, edgeOff) {
      const parent = new Int32Array(g.n);
      for (let i = 0; i < g.n; i++) parent[i] = i;
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      for (const e of g.edges) {
        if (edgeOff && edgeOff[e.id]) continue;
        if (nodeOff && (nodeOff[e.u] || nodeOff[e.v])) continue;
        const a = find(e.u), b = find(e.v);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
      const label = new Int32Array(g.n).fill(-1);
      const size = [];
      for (let i = 0; i < g.n; i++) {
        if (nodeOff && nodeOff[i]) continue;
        const r = find(i);
        if (label[r] < 0) { label[r] = size.length; size.push(0); }
        label[i] = label[r]; size[label[r]]++;
      }
      return { label, size, count: size.length, largest: size.length ? Math.max.apply(null, size) : 0 };
    }

    /* ── one shortest-path tree, optionally with the path counts Brandes needs ────────────────────
       `acc` (when given) receives betweenness; `scratch` holds the buffers so a sweep of thousands
       of sources allocates once. Returns false when the clock said stop. */
    function makeScratch(g) {
      return { dist: new Float64Array(g.n), sigma: new Float64Array(g.n), delta: new Float64Array(g.n), done: new Uint8Array(g.n),
        predHead: new Int32Array(g.n), predNext: new Int32Array(g.adjE.length + 1), predEdge: new Int32Array(g.adjE.length + 1), predFrom: new Int32Array(g.adjE.length + 1),
        order: new Int32Array(g.n), heap: makeHeap(), via: new Int32Array(g.n), viaNode: new Int32Array(g.n) };
    }
    async function tree(g, s, sc, off, acc, tick, stopAt) {
      const { dist, sigma, delta, done, predHead, predNext, predEdge, predFrom, order, heap, via, viaNode } = sc;
      const nodeOff = off && off.node, edgeOff = off && off.edge;
      dist.fill(Infinity); done.fill(0); via.fill(-1); viaNode.fill(-1);
      const brandes = !!(acc && acc.edgeB);
      if (brandes) { sigma.fill(0); delta.fill(0); predHead.fill(-1); }
      let np = 0, ord = 0, pops = 0;
      dist[s] = 0; if (brandes) sigma[s] = 1;
      heap.clear(); heap.push(0, s);
      while (heap.size()) {
        const { k, v } = heap.pop();
        if (done[v]) continue;
        if (k > dist[v]) continue;
        done[v] = 1; order[ord++] = v;
        if ((++pops & 1023) === 0 && !(await tick(0))) return false;
        if (stopAt === v) break;
        for (let a = g.start[v]; a < g.start[v + 1]; a++) {
          const eid = g.adjE[a], to = g.adjT[a];
          if (edgeOff && edgeOff[eid]) continue;
          if (nodeOff && nodeOff[to]) continue;
          const nd = k + g.edges[eid].w;
          if (nd < dist[to] * (1 - COST_EPS)) {
            dist[to] = nd; via[to] = eid; viaNode[to] = v;
            heap.push(nd, to);
            if (brandes) { sigma[to] = sigma[v]; predHead[to] = -1; np++; predEdge[np] = eid; predFrom[np] = v; predNext[np] = predHead[to]; predHead[to] = np; }
          } else if (brandes && Math.abs(nd - dist[to]) <= COST_EPS * dist[to] && !done[to]) {
            sigma[to] += sigma[v]; np++; predEdge[np] = eid; predFrom[np] = v; predNext[np] = predHead[to]; predHead[to] = np;
          }
        }
      }
      if (brandes) {
        for (let i = ord - 1; i >= 0; i--) {
          const w = order[i];
          const c = (1 + delta[w]) / sigma[w];
          for (let p = predHead[w]; p > 0; p = predNext[p]) {
            const v = predFrom[p];
            const share = sigma[v] * c;
            delta[v] += share;
            acc.edgeB[predEdge[p]] += share;
          }
          if (w !== s) acc.nodeB[w] += delta[w];
        }
      }
      sc.ordered = ord;
      return true;
    }

    /* which nodes serve as sources, and whether that is every node (exact) */
    function pickSources(g, nodeOff, maxSources) {
      const live = [];
      for (let i = 0; i < g.n; i++) if (!(nodeOff && nodeOff[i]) && g.start[i + 1] > g.start[i]) live.push(i);
      const cap = (maxSources != null && maxSources >= 1) ? Math.floor(maxSources) : DEFAULT_MAX_SOURCES;
      if (live.length <= cap) return { list: live, exact: true, live: live.length };
      const rnd = mulberry32(SAMPLE_SEED);
      for (let i = live.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = live[i]; live[i] = live[j]; live[j] = t; }
      return { list: live.slice(0, cap).sort((a, b) => a - b), exact: false, live: live.length };
    }

    /* ══ CENTRALITY ══════════════════════════════════════════════════════════════════════════════ */
    async function centrality(g, o) {
      const tick = o.tick, sc = makeScratch(g);
      const src = pickSources(g, null, o.maxSources);
      const acc = o.betweenness === false ? null : { nodeB: new Float64Array(g.n), edgeB: new Float64Array(g.m) };
      const harmonic = new Float64Array(g.n), reach = new Int32Array(g.n);
      for (let q = 0; q < src.list.length; q++) {
        const s = src.list[q];
        if (!(await tick(1, src.list.length))) return null;
        if (!(await tree(g, s, sc, null, acc, tick))) return null;
        let h = 0, r = 0;
        for (let i = 1; i < sc.ordered; i++) { const d = sc.dist[sc.order[i]]; if (d > 0) h += 1 / d; r++; }
        harmonic[s] = h; reach[s] = r;
      }
      /* sources that were not walked have no closeness of their own: it is left null, not guessed */
      const scale = src.exact ? 1 : src.live / src.list.length;
      const norm = g.directed ? 1 : 2;
      if (acc) { for (let i = 0; i < g.n; i++) acc.nodeB[i] *= scale / norm; for (let e = 0; e < g.m; e++) acc.edgeB[e] *= scale / norm; }
      const comp = components(g, null, null);
      const walked = new Uint8Array(g.n); for (const s of src.list) walked[s] = 1;
      return { harmonic, reach, walked, betweenness: acc, comp, exact: src.exact, sourcesUsed: src.list.length, sourcesLive: src.live, pairsMax: (g.n - 1) * (g.n - 2) / (g.directed ? 1 : 2) };
    }

    /* ══ MAX FLOW (Dinic) AND THE MIN CUT ════════════════════════════════════════════════════════
       Sources and sinks are SETS (a super-source and a super-sink hang off them with unlimited
       capacity). An undirected edge carries `cap` in each direction at once; its reported flow is the
       NET flow along the line as digitised. The cut returned is the one nearest the sources: the set
       of edges leaving the nodes still reachable in the residual graph. It is A minimum cut — when
       several tie, which one is a property of the algorithm, and `cutIsUnique` is not claimed. */
    async function maxFlow(g, S, T, o) {
      const tick = o.tick, off = o.off || null;
      const nodeOff = off && off.node, edgeOff = off && off.edge;
      const n = g.n, SS = n, TT = n + 1, N = n + 2;
      const head = new Int32Array(N).fill(-1);
      const to = [], cap = [], nxt = [];
      const arc = (a, b, c1, c2) => {
        to.push(b); cap.push(c1); nxt.push(head[a]); head[a] = to.length - 1;
        to.push(a); cap.push(c2); nxt.push(head[b]); head[b] = to.length - 1;
      };
      for (const e of g.edges) {
        if (edgeOff && edgeOff[e.id]) continue;
        if (nodeOff && (nodeOff[e.u] || nodeOff[e.v])) continue;
        arc(e.u, e.v, e.cap, g.directed ? 0 : e.cap);          /* arc index 2*k : the k-th live edge */
      }
      /* remember which arc is which edge */
      const arcOf = new Int32Array(g.m).fill(-1);
      { let k = 0; for (const e of g.edges) { if ((edgeOff && edgeOff[e.id]) || (nodeOff && (nodeOff[e.u] || nodeOff[e.v]))) continue; arcOf[e.id] = 2 * k; k++; } }
      const origCap = cap.slice();
      let anyS = false, anyT = false;
      for (const s of S) if (!(nodeOff && nodeOff[s])) { arc(SS, s, Infinity, 0); anyS = true; }
      for (const t of T) if (!(nodeOff && nodeOff[t])) { arc(t, TT, Infinity, 0); anyT = true; }
      if (!anyS || !anyT) return { value: 0, flow: new Float64Array(g.m), inCut: new Uint8Array(g.m), cutCapacity: 0, cutEdges: 0 };
      let maxCap = 0; for (const c of origCap) if (c > maxCap && isFinite(c)) maxCap = c;
      const EPS = (maxCap > 0 ? maxCap : 1) * 1e-12;
      const level = new Int32Array(N), it = new Int32Array(N), queue = new Int32Array(N);
      let value = 0, steps = 0;
      const bfs = () => {
        level.fill(-1); level[SS] = 0; let qh = 0, qt = 0; queue[qt++] = SS;
        while (qh < qt) { const v = queue[qh++]; for (let a = head[v]; a >= 0; a = nxt[a]) if (cap[a] > EPS && level[to[a]] < 0) { level[to[a]] = level[v] + 1; queue[qt++] = to[a]; } }
        return level[TT] >= 0;
      };
      const pathArc = [], pathNode = [];
      for (;;) {
        if (!(await tick(1))) return null;
        if (!bfs()) break;
        for (let v = 0; v < N; v++) it[v] = head[v];
        /* iterative blocking-flow DFS */
        for (;;) {
          pathArc.length = 0; pathNode.length = 0;
          let v = SS;
          while (v !== TT) {
            let advanced = false;
            while (it[v] >= 0) {
              const a = it[v];
              if (cap[a] > EPS && level[to[a]] === level[v] + 1) { pathArc.push(a); pathNode.push(v); v = to[a]; advanced = true; break; }
              it[v] = nxt[a];
            }
            if (!advanced) {
              if (v === SS) break;
              level[v] = -1;                                    /* dead end */
              const a = pathArc.pop(); pathNode.pop(); v = to[a ^ 1]; it[v] = nxt[it[v]];
            }
          }
          if (v !== TT) break;
          let f = Infinity; for (const a of pathArc) if (cap[a] < f) f = cap[a];
          for (const a of pathArc) { cap[a] -= f; cap[a ^ 1] += f; }
          value += f;
          if ((++steps & 4095) === 0 && !(await tick(0))) return null;
        }
      }
      if (!isFinite(value)) return { unbounded: true };
      const flow = new Float64Array(g.m);
      for (const e of g.edges) { const a = arcOf[e.id]; if (a >= 0) flow[e.id] = origCap[a] - cap[a]; }
      /* the cut: nodes reachable from the sources in what is left */
      const seen = new Uint8Array(N); let qh = 0, qt = 0; queue[qt++] = SS; seen[SS] = 1;
      while (qh < qt) { const v = queue[qh++]; for (let a = head[v]; a >= 0; a = nxt[a]) if (cap[a] > EPS && !seen[to[a]]) { seen[to[a]] = 1; queue[qt++] = to[a]; } }
      const inCut = new Uint8Array(g.m); let cutCapacity = 0, cutEdges = 0;
      for (const e of g.edges) {
        const a = arcOf[e.id]; if (a < 0) continue;
        const su = seen[e.u], sv = seen[e.v];
        if (su && !sv) { if (e.cap > 0) { inCut[e.id] = 1; cutCapacity += e.cap; cutEdges++; } }
        else if (!g.directed && sv && !su) { if (e.cap > 0) { inCut[e.id] = 1; cutCapacity += e.cap; cutEdges++; } }
      }
      return { value, flow, inCut, cutCapacity, cutEdges, sourceSide: seen };
    }

    /* ══ YEN'S k SHORTEST LOOP-FREE ROUTES ═══════════════════════════════════════════════════════ */
    async function kShortest(g, s, t, k, o) {
      const tick = o.tick, sc = makeScratch(g);
      const pathOf = async (from, nodeOff, edgeOff) => {
        const ok = await tree(g, from, sc, { node: nodeOff, edge: edgeOff }, null, tick, t);
        if (!ok) return null;
        if (!(sc.dist[t] < Infinity)) return { none: true };
        const edgesP = [], nodesP = [t]; let v = t;
        while (v !== from) { edgesP.push(sc.via[v]); v = sc.viaNode[v]; nodesP.push(v); }
        edgesP.reverse(); nodesP.reverse();
        return { edges: edgesP, nodes: nodesP, cost: sc.dist[t] };
      };
      const first = await pathOf(s, null, null);
      if (!first) return null;
      if (first.none) return { paths: [], none: true };
      const A = [first], B = [];
      const key = (p) => p.edges.join(',');
      const seenKeys = new Set([key(first)]);
      for (let kk = 1; kk < k; kk++) {
        const last = A[A.length - 1];
        for (let i = 0; i < last.nodes.length - 1; i++) {
          if (!(await tick(1))) return null;
          const spur = last.nodes[i];
          const rootE = last.edges.slice(0, i);
          const edgeOff = new Uint8Array(g.m), nodeOff = new Uint8Array(g.n);
          for (const p of A) if (p.edges.length > i && p.edges.slice(0, i).join(',') === rootE.join(',')) edgeOff[p.edges[i]] = 1;
          for (let q = 0; q < i; q++) nodeOff[last.nodes[q]] = 1;
          const sp = await pathOf(spur, nodeOff, edgeOff);
          if (!sp) return null;
          if (sp.none) continue;
          let rootCost = 0; for (const e of rootE) rootCost += g.edges[e].w;
          const cand = { edges: rootE.concat(sp.edges), nodes: last.nodes.slice(0, i).concat(sp.nodes), cost: rootCost + sp.cost };
          const kc = key(cand);
          if (seenKeys.has(kc)) continue;
          seenKeys.add(kc); B.push(cand);
        }
        if (!B.length) break;
        let bi = 0; for (let i = 1; i < B.length; i++) if (B[i].cost < B[bi].cost) bi = i;
        A.push(B.splice(bi, 1)[0]);
      }
      return { paths: A };
    }

    /* ══ DISRUPTION ══════════════════════════════════════════════════════════════════════════════
       `off` = {node, edge} masks of what is gone. Walks the same sources on the intact network and on
       the damaged one, so every number is a difference between two walks of the SAME sample. */
    async function disrupt(g, off, o) {
      const tick = o.tick, sc = makeScratch(g), sc2 = makeScratch(g);
      const n = g.n, m = g.m;
      const src = pickSources(g, null, o.maxSources);
      const bBefore = { nodeB: new Float64Array(n), edgeB: new Float64Array(m) }, bAfter = { nodeB: new Float64Array(n), edgeB: new Float64Array(m) };
      const lost = new Int32Array(n), before = new Int32Array(n), conn = new Int32Array(n);
      const sumDetour = new Float64Array(n), sumBase = new Float64Array(n);
      const d0 = new Float64Array(n);
      let pairsBefore = 0, pairsLost = 0, detourSum = 0, baseSum = 0, connPairs = 0;
      const nodeOff = off.node, anyOff = (i) => nodeOff[i] === 1;
      for (let q = 0; q < src.list.length; q++) {
        const s = src.list[q];
        if (!(await tick(1, src.list.length))) return null;
        if (!(await tree(g, s, sc, null, bBefore, tick))) return null;
        d0.set(sc.dist);
        const sRemoved = anyOff(s);
        if (!sRemoved && !(await tree(g, s, sc2, off, bAfter, tick))) return null;
        for (let t = 0; t < n; t++) {
          if (t === s || !(d0[t] < Infinity)) continue;
          pairsBefore++; before[t]++;
          if (sRemoved || anyOff(t) || !(sc2.dist[t] < Infinity)) { pairsLost++; lost[t]++; }
          else { const dd = Math.max(0, sc2.dist[t] - d0[t]); conn[t]++; sumDetour[t] += dd; sumBase[t] += d0[t]; detourSum += dd; baseSum += d0[t]; connPairs++; }
        }
      }
      const scale = (src.exact ? 1 : src.live / src.list.length) / (g.directed ? 1 : 2);
      for (let i = 0; i < n; i++) { bBefore.nodeB[i] *= scale; bAfter.nodeB[i] *= scale; }
      for (let e = 0; e < m; e++) { bBefore.edgeB[e] *= scale; bAfter.edgeB[e] *= scale; }
      return { lost, before, conn, sumDetour, sumBase, pairsBefore, pairsLost, detourSum, baseSum, connPairs, edgeBefore: bBefore.edgeB, edgeAfter: bAfter.edgeB, nodeBefore: bBefore.nodeB, nodeAfter: bAfter.nodeB, exact: src.exact, sourcesUsed: src.list.length, sourcesLive: src.live };
    }

    /* ── resolving where a reader points: a name already on the network, or lng,lat ────────────── */
    function resolveEnds(g, text, distKm) {
      const out = { nodes: [], snapKm: [], tokens: [] };
      const toks = String(text == null ? '' : text).split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
      for (const tk of toks) {
        const lower = tk.toLowerCase();
        const byName = [];
        for (const nd of g.nodes) if (nd.name != null && String(nd.name).trim().toLowerCase() === lower) byName.push(nd.id);
        if (byName.length) { for (const id of byName) { out.nodes.push(id); out.snapKm.push(0); } out.tokens.push(tk); continue; }
        const mm = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(tk);
        if (!mm) return { missing: tk };
        const p = [parseFloat(mm[1]), parseFloat(mm[2])];
        if (!isPos(p)) return { missing: tk };
        let best = -1, bd = Infinity;
        for (const nd of g.nodes) { if (nd.deg === 0) continue; const d = distKm(p, [nd.lng, nd.lat]); if (d < bd) { bd = d; best = nd.id; } }
        if (best < 0) return { missing: tk };
        out.nodes.push(best); out.snapKm.push(bd); out.tokens.push(tk);
      }
      return out;
    }

    /* ══ THE OP, END TO END ══════════════════════════════════════════════════════════════════════
       env = { features: [{properties, geometry}], hasField(name), asNumber(v), distKm(a,b), R, tick(units,total),
               zone?: { hitsEdge(coords) -> true|false|null, hasPoint(pos) -> bool } }.
       Returns { ok:true, features, stats } or { ok:false, why, detail }. Nothing here touches the
       registry: js/gis-ops.js registers what comes back. */
    const NETWORK_ANALYSES = ['centrality', 'maxflow', 'alternatives'];
    const NODES_AT = ['endpoints', 'vertices'];
    const OUTPUTS = ['nodes', 'edges'];
    function bad(param, value, extra) { return { ok: false, why: 'bad-param', detail: Object.assign({ param, value: value == null ? null : value }, extra || {}) }; }
    function truthy(v) { return v === true || String(v).toLowerCase() === 'true'; }
    function nameOf(g, i) { const nd = g.nodes[i]; return nd.name != null ? String(nd.name) : ('node ' + i + ' (' + nd.lng.toFixed(2) + ',' + nd.lat.toFixed(2) + ')'); }
    function topList(ids, score, label, k) {
      return ids.filter((i) => score(i) > 0).sort((a, b) => score(b) - score(a) || a - b).slice(0, k).map(label);
    }
    function round(x, d) { if (x == null || !isFinite(x)) return null; const f = Math.pow(10, d == null ? 6 : d); return Math.round(x * f) / f; }
    const text = (v) => (v == null || String(v).trim() === '') ? null : String(v).trim();

    async function analyse(kind, env, params) {
      const P = params || {};
      const analysis = kind === 'networkDisrupt' ? 'disrupt' : (P.analysis == null ? '' : String(P.analysis));
      if (kind === 'network' && NETWORK_ANALYSES.indexOf(analysis) < 0) return { ok: false, why: 'missing-param', detail: { param: 'analysis', values: NETWORK_ANALYSES } };
      const weightField = text(P.weightField), capacityField = text(P.capacityField), nameFrom = text(P.nameFromField), nameTo = text(P.nameToField), labelField = text(P.edgeLabelField);
      for (const [p, f] of [['edgeLabelField', labelField], ['weightField', weightField], ['capacityField', capacityField], ['nameFromField', nameFrom], ['nameToField', nameTo]]) {
        if (f && !env.hasField(f)) return { ok: false, why: 'unknown-field', detail: { input: 0, field: f, param: p } };
      }
      let snapKm = 1;
      if (P.snapKm != null && String(P.snapKm).trim() !== '') { snapKm = env.asNumber(P.snapKm); if (snapKm == null || !(snapKm >= 0)) return bad('snapKm', P.snapKm); }
      const nodesAt = P.nodesAt == null || P.nodesAt === '' ? 'endpoints' : String(P.nodesAt);
      if (NODES_AT.indexOf(nodesAt) < 0) return bad('nodesAt', P.nodesAt, { values: NODES_AT });
      const directed = truthy(P.directed);
      let maxSources = null;
      if (P.maxSources != null && String(P.maxSources).trim() !== '') { maxSources = env.asNumber(P.maxSources); if (maxSources == null || !(maxSources >= 1)) return bad('maxSources', P.maxSources); }
      const out = text(P.output);
      if (out != null && OUTPUTS.indexOf(out) < 0) return bad('output', P.output, { values: OUTPUTS });
      let k = 3;
      if (analysis === 'alternatives' && P.k != null && String(P.k).trim() !== '') { k = env.asNumber(P.k); if (k == null || !(k >= 1) || k > 50) return bad('k', P.k, { min: 1, max: 50 }); k = Math.floor(k); }
      if ((analysis === 'maxflow' || analysis === 'alternatives') && out === 'nodes') return bad('output', P.output, { values: ['edges'], why: 'this analysis answers on edges' });

      /* the segments: one per line part */
      const segs = [];
      let rowsWithoutLines = 0, partsDropped = 0;
      env.features.forEach((f, row) => {
        const geom = f && f.geometry; const p = (f && f.properties) || {};
        const parts = !geom ? [] : geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
        let any = false;
        for (const c of parts) {
          if (!Array.isArray(c) || c.length < 2 || !c.every(isPos)) { partsDropped++; continue; }
          any = true;
          const cost = weightField ? env.asNumber(p[weightField]) : null, cap = capacityField ? env.asNumber(p[capacityField]) : null;
          const nm = (v) => (v == null || String(v).trim() === '') ? null : String(v).trim();
          segs.push({ row, coords: c, cost, cap, nameA: nameFrom ? nm(p[nameFrom]) : null, nameB: nameTo ? nm(p[nameTo]) : null });
        }
        if (!any) rowsWithoutLines++;
      });
      if (!segs.length) return { ok: false, why: 'no-features', detail: { input: 0 } };
      const g = await build(segs, { tick: env.tick, distKm: env.distKm, R: env.R, snapKm, nodesAt, directed, hasWeightField: !!weightField, hasCapacityField: !!capacityField });
      if (!g) return { ok: false, why: 'cancelled' };
      if (!g.m) return { ok: false, why: 'no-features', detail: { input: 0, edgesDroppedNoWeight: g.stats.edgesDroppedNoWeight, loopsDropped: g.stats.loopsDropped } };

      const base = Object.assign({
        nodes: g.n, edges: g.m, snapKm, nodesAt, directed, costBasis: weightField || 'length-km', capacityBasis: capacityField || 'unit',
        rowsWithoutLines, partsDropped, kernel: KERNEL_VERSION,
      }, g.stats);
      const edgeProps = (e, extra) => Object.assign({}, (env.features[e.row] && env.features[e.row].properties) || {}, extra);
      const edgeFeature = (e, extra) => ({ type: 'Feature', properties: edgeProps(e, Object.assign({ _edgeRow: e.row, _edgeFrom: e.u, _edgeTo: e.v }, extra)), geometry: { type: 'LineString', coordinates: e.coords } });
      const nodeFeature = (i, extra) => ({ type: 'Feature', properties: Object.assign({ _nodeId: i, _name: g.nodes[i].name }, extra), geometry: { type: 'Point', coordinates: [g.nodes[i].lng, g.nodes[i].lat] } });
      const writesEdge = (cols) => { for (const c of cols) if (env.hasField(c)) return { ok: false, why: 'output-column-in-use', detail: { input: 0, name: c } }; return null; };
      const allIds = Array.from({ length: g.n }, (_, i) => i);
      /* how a route is named in a summary: the column the reader pointed at, else its row */
      const edgeLabel = (i) => { const e = g.edges[i]; const v = labelField && env.features[e.row] && env.features[e.row].properties ? env.features[e.row].properties[labelField] : null; return (v != null && String(v).trim() !== '') ? String(v).trim() : 'row ' + e.row; };

      if (analysis === 'centrality') {
        const r = await centrality(g, { tick: env.tick, maxSources, betweenness: P.betweenness == null ? true : truthy(P.betweenness) });
        if (!r) return { ok: false, why: 'cancelled' };
        const stats = Object.assign(base, { components: r.comp.count, largestComponent: r.comp.largest, exact: r.exact, sourcesUsed: r.sourcesUsed, sourcesLive: r.sourcesLive });
        if (r.betweenness) stats.topBetweenness = topList(allIds, (i) => r.betweenness.nodeB[i], (i) => nameOf(g, i) + ' (' + round(r.betweenness.nodeB[i], 2) + ')', 5);
        if ((out || 'nodes') === 'edges') {
          const w = writesEdge(['_edgeRow', '_edgeFrom', '_edgeTo', '_cost', '_betweenness']); if (w) return w;
          return { ok: true, features: g.edges.map((e) => edgeFeature(e, { _cost: round(e.w, 6), _betweenness: r.betweenness ? round(r.betweenness.edgeB[e.id], 6) : null })), stats };
        }
        return { ok: true, nodeOutput: true, stats, features: g.nodes.map((nd) => {
          const i = nd.id, c = r.comp.label[i];
          return nodeFeature(i, {
            _degree: nd.deg, _reach: r.walked[i] ? r.reach[i] : null, _harmonic: r.walked[i] ? round(r.harmonic[i], 9) : null,
            _betweenness: r.betweenness ? round(r.betweenness.nodeB[i], 6) : null,
            _betweennessShare: (r.betweenness && r.pairsMax > 0) ? round(r.betweenness.nodeB[i] / r.pairsMax, 9) : null,
            _component: c, _componentSize: r.comp.size[c],
          });
        }) };
      }

      /* two ends, for the analyses that ask for them */
      const ends = () => {
        if (!text(P.from)) return { ok: false, why: 'missing-param', detail: { param: 'from' } };
        if (!text(P.to)) return { ok: false, why: 'missing-param', detail: { param: 'to' } };
        const A = resolveEnds(g, P.from, env.distKm), B = resolveEnds(g, P.to, env.distKm);
        if (A.missing) return { ok: false, why: 'endpoint-not-found', detail: { param: 'from', token: A.missing } };
        if (B.missing) return { ok: false, why: 'endpoint-not-found', detail: { param: 'to', token: B.missing } };
        const sSet = Array.from(new Set(A.nodes)), tSet = Array.from(new Set(B.nodes));
        if (sSet.some((x) => tSet.indexOf(x) >= 0)) return bad('to', P.to, { why: 'from and to name the same node' });
        return { ok: true, sSet, tSet, stats: { fromNodes: sSet.length, toNodes: tSet.length, fromSnapKm: round(Math.max.apply(null, A.snapKm), 3), toSnapKm: round(Math.max.apply(null, B.snapKm), 3) } };
      };

      if (analysis === 'maxflow') {
        const E = ends(); if (!E.ok) return E;
        const w = writesEdge(['_edgeRow', '_edgeFrom', '_edgeTo', '_capacity', '_flow', '_utilisation', '_inCut']); if (w) return w;
        const f = await maxFlow(g, E.sSet, E.tSet, { tick: env.tick });
        if (!f) return { ok: false, why: 'cancelled' };
        if (f.unbounded) return bad('to', P.to, { why: 'from and to share a node, so the flow has no bound' });
        const stats = Object.assign(base, E.stats, { maxFlow: round(f.value, 9), cutCapacity: round(f.cutCapacity, 9), cutEdges: f.cutEdges, components: components(g, null, null).count });
        const cutRows = []; for (const e of g.edges) if (f.inCut[e.id]) cutRows.push(e.row);
        stats.bottleneckRows = Array.from(new Set(cutRows)).sort((a, b) => a - b).slice(0, 20);
        if (labelField) stats.bottleneck = Array.from(new Set(g.edges.filter((e) => f.inCut[e.id]).map((e) => edgeLabel(e.id)))).slice(0, 20);
        return { ok: true, stats, features: g.edges.map((e) => edgeFeature(e, {
          _capacity: e.cap, _flow: round(f.flow[e.id], 9), _utilisation: e.cap > 0 ? round(Math.abs(f.flow[e.id]) / e.cap, 6) : null, _inCut: f.inCut[e.id] ? true : false,
        })) };
      }

      if (analysis === 'alternatives') {
        const E = ends(); if (!E.ok) return E;
        const { sSet, tSet } = E;
        if (sSet.length !== 1 || tSet.length !== 1) return bad(sSet.length !== 1 ? 'from' : 'to', sSet.length !== 1 ? P.from : P.to, { why: 'alternatives needs one node at each end', fromNodes: sSet.length, toNodes: tSet.length });
        const w = writesEdge(['_rank', '_cost', '_extraPct', '_lengthKm', '_hops', '_edgeRows', '_sharedWithBest']); if (w) return w;
        const r = await kShortest(g, sSet[0], tSet[0], k, { tick: env.tick });
        if (!r) return { ok: false, why: 'cancelled' };
        if (r.none || !r.paths.length) return { ok: false, why: 'no-route', detail: { from: P.from, to: P.to } };
        const best = r.paths[0], bestSet = new Set(best.edges);
        const feats = r.paths.map((p, idx) => {
          const coords = []; let len = 0;
          for (let q = 0; q < p.edges.length; q++) {
            const e = g.edges[p.edges[q]]; const fwd = e.u === p.nodes[q];
            const cs = fwd ? e.coords : e.coords.slice().reverse();
            for (let c = (coords.length ? 1 : 0); c < cs.length; c++) coords.push(cs[c]);
            len += e.len;
          }
          const rows = Array.from(new Set(p.edges.map((id) => g.edges[id].row)));
          return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {
            _rank: idx + 1, _cost: round(p.cost, 6), _extraPct: round((p.cost / best.cost - 1) * 100, 4), _lengthKm: round(len, 3), _hops: p.edges.length,
            _edgeRows: rows.join(','), _sharedWithBest: p.edges.filter((id) => bestSet.has(id)).length,
          } };
        });
        return { ok: true, features: feats, stats: Object.assign(base, E.stats, { routes: feats.length, requested: k, bestCost: round(best.cost, 6), fromName: nameOf(g, sSet[0]), toName: nameOf(g, tSet[0]) }) };
      }

      /* disrupt: everything the zone touches is gone */
      if (!env.zone) return { ok: false, why: 'no-overlay-polygons', detail: { input: 1 } };
      const nodeOff = new Uint8Array(g.n), edgeOff = new Uint8Array(g.m);
      let undecided = 0, hitEdges = 0, nodesRemoved = 0;
      for (const e of g.edges) {
        if (!(await env.tick(1, g.m + g.n))) return { ok: false, why: 'cancelled' };
        const h = env.zone.hitsEdge(e.coords);
        if (h === null) undecided++; else if (h) { edgeOff[e.id] = 1; hitEdges++; }
      }
      for (const nd of g.nodes) {
        if (!(await env.tick(1, g.m + g.n))) return { ok: false, why: 'cancelled' };
        if (env.zone.hasPoint([nd.lng, nd.lat])) { nodeOff[nd.id] = 1; nodesRemoved++; }
      }
      for (const e of g.edges) if (nodeOff[e.u] || nodeOff[e.v]) edgeOff[e.id] = 1;
      let edgesRemoved = 0; for (let i = 0; i < g.m; i++) if (edgeOff[i]) edgesRemoved++;
      const off = { node: nodeOff, edge: edgeOff };
      const compB = components(g, null, null), compA = components(g, nodeOff, edgeOff);
      const degAfter = new Int32Array(g.n);
      for (const e of g.edges) if (!edgeOff[e.id]) { degAfter[e.u]++; degAfter[e.v]++; }
      let isolated = 0; for (const nd of g.nodes) if (!nodeOff[nd.id] && nd.deg > 0 && degAfter[nd.id] === 0) isolated++;
      const d = await disrupt(g, off, { tick: env.tick, maxSources });
      if (!d) return { ok: false, why: 'cancelled' };
      const stats = Object.assign(base, {
        nodesRemoved, edgesHitByZone: hitEdges, edgesRemoved, zoneUndecided: undecided, nodesIsolated: isolated,
        componentsBefore: compB.count, componentsAfter: compA.count, largestBefore: compB.largest, largestAfter: compA.largest,
        pairsBefore: d.pairsBefore, pairsLost: d.pairsLost, pairsLostPct: d.pairsBefore ? round(100 * d.pairsLost / d.pairsBefore, 4) : null,
        meanDetourPct: d.baseSum > 0 ? round(100 * d.detourSum / d.baseSum, 4) : null, exact: d.exact, sourcesUsed: d.sourcesUsed, sourcesLive: d.sourcesLive,
      });
      if (text(P.from) || text(P.to)) {
        const E = ends(); if (!E.ok) return E;
        const f0 = await maxFlow(g, E.sSet, E.tSet, { tick: env.tick });
        const f1 = f0 && await maxFlow(g, E.sSet, E.tSet, { tick: env.tick, off });
        if (!f0 || !f1) return { ok: false, why: 'cancelled' };
        stats.flowBefore = round(f0.value, 9); stats.flowAfter = round(f1.value, 9);
        stats.flowLossPct = f0.value > 0 ? round(100 * (f0.value - f1.value) / f0.value, 4) : null;
      }
      const lostShare = (i) => d.before[i] ? d.lost[i] / d.before[i] : 0;
      stats.topNodesLost = topList(allIds, (i) => nodeOff[i] ? 0 : lostShare(i), (i) => nameOf(g, i) + ' (' + round(100 * lostShare(i), 1) + '%)', 5);
      stats.topNodesDetoured = topList(allIds, (i) => (!nodeOff[i] && d.conn[i] && d.sumBase[i] > 0) ? d.sumDetour[i] / d.sumBase[i] : 0, (i) => nameOf(g, i) + ' (+' + round(100 * d.sumDetour[i] / d.sumBase[i], 1) + '%)', 5);
      const eIds = Array.from({ length: g.m }, (_, i) => i);
      stats.topEdgesRemovedByLoad = topList(eIds, (i) => edgeOff[i] ? d.edgeBefore[i] : 0, (i) => edgeLabel(i) + ' (' + round(d.edgeBefore[i], 1) + ')', 5);
      stats.topEdgesGainingLoad = topList(eIds, (i) => edgeOff[i] ? 0 : d.edgeAfter[i] - d.edgeBefore[i], (i) => edgeLabel(i) + ' (+' + round(d.edgeAfter[i] - d.edgeBefore[i], 1) + ')', 5);
      if ((out || 'nodes') === 'edges') {
        const w = writesEdge(['_edgeRow', '_edgeFrom', '_edgeTo', '_removed', '_loadBefore', '_loadAfter', '_loadChange']); if (w) return w;
        return { ok: true, stats, features: g.edges.map((e) => edgeFeature(e, { _removed: edgeOff[e.id] ? true : false, _loadBefore: round(d.edgeBefore[e.id], 4), _loadAfter: edgeOff[e.id] ? 0 : round(d.edgeAfter[e.id], 4), _loadChange: edgeOff[e.id] ? round(-d.edgeBefore[e.id], 4) : round(d.edgeAfter[e.id] - d.edgeBefore[e.id], 4) })) };
      }
      return { ok: true, nodeOutput: true, stats, features: g.nodes.map((nd) => {
        const i = nd.id;
        return nodeFeature(i, {
          _removed: nodeOff[i] ? true : false, _degreeBefore: nd.deg, _degreeAfter: nodeOff[i] ? 0 : degAfter[i],
          _componentBefore: compB.label[i], _componentAfter: nodeOff[i] ? null : compA.label[i],
          _componentSizeBefore: compB.size[compB.label[i]], _componentSizeAfter: nodeOff[i] ? null : compA.size[compA.label[i]],
          _lostPairs: d.lost[i], _lostShare: d.before[i] ? round(d.lost[i] / d.before[i], 6) : null,
          _detourMean: d.conn[i] ? round(d.sumDetour[i] / d.conn[i], 6) : null, _detourPct: (d.conn[i] && d.sumBase[i] > 0) ? round(100 * d.sumDetour[i] / d.sumBase[i], 4) : null,
        });
      }) };
    }

    const API = { version: () => KERNEL_VERSION, build, components, centrality, maxFlow, kShortest, disrupt, resolveEnds, pickSources, isPos, analyse,
      analyses: () => NETWORK_ANALYSES.slice(), defaults: () => ({ maxSources: DEFAULT_MAX_SOURCES, costEps: COST_EPS }) };
    try { window.IntMapGisNetwork = API; } catch (_) { }
    return API;
  })();
}
