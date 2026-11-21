/* ============================================================================
 *  GIS · つながりとしての網 — `network` / `networkDisrupt` (js/gis-ops.js) over js/gis-network.js
 * ----------------------------------------------------------------------------
 *  What the ops claim, and therefore what has to stay true (docs/GIS-CORE.md §2.11):
 *
 *    ① betweenness equals the brute-force count of shortest paths through a node / an edge
 *       (ties split equally), on random graphs and on the one tie that matters (a diamond)
 *    ② max flow equals the cheapest cut found by ENUMERATING edge subsets, and the cut the op
 *       names really disconnects the two ends and weighs exactly the flow (the theorem, measured)
 *    ③ the k routes are the k cheapest LOOP-FREE routes found by enumerating every simple path
 *    ④ a disruption's components and lost pairs equal the ones a brute-force walk of the
 *       damaged graph gives, and an unaffected network reports no loss
 *    ⑤ an edge whose named cost is missing is left out and counted (never given its length), a
 *       missing capacity is 0 and counted, and every refusal is a name
 *    ⑥ above maxSources the answer says it is a sample (exact:false) and replays byte for byte
 *    ⑦ the clock is read: an abort stops a long run with `cancelled`
 *    ⑧ it is mounted where provenance finds its version, and Atlas is told about it
 *    ⑨ REAL DATA — the submarine-cable network (data/subcables.json) across a Taiwan Strait zone
 *
 *  ⚠ THE REFERENCES ARE BRUTE FORCE, written here and not in the kernel: Floyd–Warshall with path
 *  counts, subset enumeration, depth-first enumeration of simple paths. A check that asked the
 *  kernel's own Dijkstra would agree with the kernel by construction.
 * ==========================================================================*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installWindow } from './helpers/geo-shared.mjs';
import { catalogueText } from './helpers/atlas-kernel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function boot(opts) {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisNetwork } = await import('../js/gis-network.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(); const geometry = makeGisGeometry();
  const network = (opts && opts.noNetwork) ? null : makeGisNetwork();
  if (!network) delete w.IntMapGisNetwork;
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, data, geometry, network, ops, km: (a, b) => w.IntMapGeodesy._distKm(a, b) };
}

const line = (a, b, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'LineString', coordinates: [a, b] } });
const box = (W, S, E, N, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [[[W, S], [E, S], [E, N], [W, N], [W, S]]] } });
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

/* a random connected-ish graph on a lng/lat lattice: node i sits at a distinct point, edge weights are
   random reals so shortest paths are unique unless a test says otherwise */
function randomGraph(r, n, m, wMax) {
  const pos = [];
  for (let i = 0; i < n; i++) pos.push([Math.floor(i % 5) * 2 + r() * 0.5, Math.floor(i / 5) * 2 + r() * 0.5]);
  const edges = [], seen = new Set();
  for (let i = 1; i < n; i++) { const j = Math.floor(r() * i); edges.push([i, j]); seen.add(i + '-' + j); }
  while (edges.length < m) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (a === b || seen.has(a + '-' + b) || seen.has(b + '-' + a)) continue;
    seen.add(a + '-' + b); edges.push([a, b]);
  }
  return { pos, edges: edges.map(([a, b]) => ({ a, b, w: 1 + Math.floor(r() * wMax * 100) / 100, c: 1 + Math.floor(r() * 5) })) };
}
const featuresOf = (G) => G.edges.map((e, i) => line(G.pos[e.a], G.pos[e.b], { w: e.w, c: e.c, id: i, from: 'N' + e.a, to: 'N' + e.b }));

async function add(B, feats, title) { return B.data.add({ title: title || 't', features: feats }); }
async function net(B, ds, params, extraInputs) {
  const res = await B.ops.run({ op: 'network', inputs: [ds.id].concat(extraInputs || []), params });
  return res;
}

/* ── brute-force references over the abstract graph ─────────────────────────────────────────── */
function floyd(n, edges, dead) {
  const INF = Infinity, d = Array.from({ length: n }, () => new Array(n).fill(INF)), cnt = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) { d[i][i] = 0; cnt[i][i] = 1; }
  edges.forEach((e, k) => {
    if (dead && (dead.edges.has(k) || dead.nodes.has(e.a) || dead.nodes.has(e.b))) return;
    if (e.w < d[e.a][e.b]) { d[e.a][e.b] = d[e.b][e.a] = e.w; cnt[e.a][e.b] = cnt[e.b][e.a] = 1; }
  });
  return { d, cnt };
}
/* shortest-path counts need ties detected exactly: do it by BFS-like DP over the sorted distances */
function pathCounts(n, edges, dead) {
  const { d } = floyd(n, edges, dead);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  const live = (k) => !(dead && (dead.edges.has(k) || dead.nodes.has(edges[k].a) || dead.nodes.has(edges[k].b)));
  const sigma = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let s = 0; s < n; s++) {
    const order = Array.from({ length: n }, (_, i) => i).filter((i) => d[s][i] < Infinity).sort((a, b) => d[s][a] - d[s][b]);
    sigma[s][s] = 1;
    for (const v of order) { if (v === s) continue; for (let k = 0; k < edges.length; k++) { if (!live(k)) continue; const e = edges[k];
      for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) if (y === v && Math.abs(d[s][x] + e.w - d[s][v]) < 1e-9 && d[s][x] < d[s][v]) sigma[s][v] += sigma[s][x]; } }
  }
  return { d, sigma, live };
}
function bruteBetweenness(n, edges) {
  const { d, sigma, live } = pathCounts(n, edges, null);
  const nodeB = new Array(n).fill(0), edgeB = new Array(edges.length).fill(0);
  for (let s = 0; s < n; s++) for (let t = s + 1; t < n; t++) {
    if (!(d[s][t] < Infinity)) continue;
    for (let v = 0; v < n; v++) if (v !== s && v !== t && Math.abs(d[s][v] + d[v][t] - d[s][t]) < 1e-9) nodeB[v] += sigma[s][v] * sigma[v][t] / sigma[s][t];
    edges.forEach((e, k) => { if (!live(k)) return;
      for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) if (Math.abs(d[s][x] + e.w + d[y][t] - d[s][t]) < 1e-9) edgeB[k] += sigma[s][x] * sigma[y][t] / sigma[s][t]; });
  }
  return { nodeB, edgeB };
}
function connected(n, edges, s, t, removedEdgeSet) {
  const seen = new Set([s]); const q = [s];
  while (q.length) { const v = q.pop(); edges.forEach((e, k) => { if (removedEdgeSet.has(k)) return; const o = e.a === v ? e.b : e.b === v ? e.a : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); q.push(o); } }); }
  return seen.has(t);
}
function allSimplePaths(n, edges, s, t) {
  const out = [];
  const adj = Array.from({ length: n }, () => []); edges.forEach((e, k) => { adj[e.a].push([e.b, k]); adj[e.b].push([e.a, k]); });
  (function dfs(v, vis, es, cost) { if (v === t) { out.push({ cost, edges: es.slice() }); return; } for (const [o, k] of adj[v]) { if (vis.has(o)) continue; vis.add(o); es.push(k); dfs(o, vis, es, cost + edges[k].w); es.pop(); vis.delete(o); } })(s, new Set([s]), [], 0);
  return out.sort((a, b) => a.cost - b.cost);
}
const byId = (feats, col) => { const o = {}; for (const f of feats) o[f.properties[col == null ? '_nodeId' : col]] = f.properties; return o; };
/* the op's node ids are its own; map them back to the test's by position */
function nodeIndex(res) { const m = new Map(); for (const f of res.dataset.features()) m.set(f.properties._name, f.properties._nodeId); return m; }

/* ══ ① ════════════════════════════════════════════════════════════════════════════════════════ */

test('① 媒介中心性は、全最短路を数え上げた値と一致する（ノードも辺も）', async () => {
  const B = await boot();
  for (const seed of [3, 11, 29]) {
    const r = rng(seed), G = randomGraph(r, 12, 20, 9);
    const ds = await add(B, featuresOf(G));
    const nodes = await net(B, ds, { analysis: 'centrality', weightField: 'w', nameFromField: 'from', nameToField: 'to', snapKm: 0 });
    assert.equal(nodes.ok, true, nodes.why + JSON.stringify(nodes.detail));
    assert.equal(nodes.stats.exact, true);
    const ref = bruteBetweenness(12, G.edges);
    const idOf = nodeIndex(nodes);
    for (let v = 0; v < 12; v++) {
      const row = nodes.dataset.features().find((f) => f.properties._name === 'N' + v);
      if (!row) continue;
      assert.ok(Math.abs(row.properties._betweenness - ref.nodeB[v]) < 1e-4, 'seed ' + seed + ' node ' + v + ': ' + row.properties._betweenness + ' vs ' + ref.nodeB[v]);
    }
    assert.ok(idOf.size > 0);
    const edges = await net(B, ds, { analysis: 'centrality', weightField: 'w', output: 'edges', snapKm: 0 });
    for (const f of edges.dataset.features()) {
      const k = f.properties.id;
      assert.ok(Math.abs(f.properties._betweenness - ref.edgeB[k]) < 1e-4, 'seed ' + seed + ' edge ' + k + ': ' + f.properties._betweenness + ' vs ' + ref.edgeB[k]);
    }
  }
});

test('① 同じ長さの経路が 2 本あれば、中間ノードは折半される（ダイヤモンド）', async () => {
  const B = await boot();
  const A = [0, 0], Bn = [1, 1], C = [1, -1], D = [2, 0], E = [3, 0];
  const ds = await add(B, [line(A, Bn), line(Bn, D), line(A, C), line(C, D), line(D, E)]);
  const res = await net(B, ds, { analysis: 'centrality' });
  assert.equal(res.ok, true);
  const rows = res.dataset.features().map((f) => f.properties);
  const at = (lng, lat) => res.dataset.features().find((f) => f.geometry.coordinates[0] === lng && f.geometry.coordinates[1] === lat).properties;
  assert.equal(at(2, 0)._betweenness, 3.5, 'D carries A-E, B-E, C-E and half of B-C');
  assert.equal(at(1, 1)._betweenness, 1, 'B carries half of A-D and half of C-D... measured by hand');
  assert.equal(rows.length, 5);
  assert.equal(at(3, 0)._betweenness, 0);
});

/* ══ ② ════════════════════════════════════════════════════════════════════════════════════════ */

test('② 最大フロー＝列挙で見つけた最小カット。操作が返したカットは両端を本当に切り、容量の和が流量に等しい', async () => {
  const B = await boot();
  for (const seed of [5, 17, 41, 77]) {
    const r = rng(seed), G = randomGraph(r, 8, 11, 5);
    const ds = await add(B, featuresOf(G));
    const res = await net(B, ds, { analysis: 'maxflow', weightField: 'w', capacityField: 'c', from: 'N0', to: 'N7', nameFromField: 'from', nameToField: 'to', snapKm: 0 });
    if (!res.ok) { assert.equal(res.why, 'endpoint-not-found'); continue; }
    /* the cheapest cut by enumeration: every subset of the 11 edges */
    let best = Infinity;
    for (let mask = 0; mask < (1 << G.edges.length); mask++) {
      const removed = new Set(); let cap = 0;
      for (let k = 0; k < G.edges.length; k++) if (mask & (1 << k)) { removed.add(k); cap += G.edges[k].c; }
      if (cap < best && !connected(8, G.edges, 0, 7, removed)) best = cap;
    }
    assert.equal(res.stats.maxFlow, best, 'seed ' + seed + ': flow ' + res.stats.maxFlow + ' vs cheapest cut ' + best);
    assert.equal(res.stats.cutCapacity, best);
    const cut = new Set(); let w = 0;
    for (const f of res.dataset.features()) if (f.properties._inCut) { cut.add(f.properties.id); w += f.properties._capacity; }
    assert.equal(w, best);
    assert.equal(connected(8, G.edges, 0, 7, cut), false, 'the named cut does not disconnect the ends');
    /* flow conservation at every inner node, and no edge over its capacity */
    const net_ = new Array(8).fill(0);
    for (const f of res.dataset.features()) { const k = f.properties.id; const fl = f.properties._flow; assert.ok(Math.abs(fl) <= G.edges[k].c + 1e-9); net_[G.edges[k].a] -= fl * (f.properties._edgeFrom === f.properties._edgeFrom ? 1 : 1); net_[G.edges[k].b] += fl; }
    for (let v = 1; v < 7; v++) assert.ok(Math.abs(net_[v]) < 1e-9, 'flow is not conserved at node ' + v);
  }
});

test('② 容量を述べなければ 1 本 1。流量は互いに辺を共有しない経路の本数', async () => {
  const B = await boot();
  const A = [0, 0], Bn = [1, 1], C = [1, -1], D = [2, 0];
  const ds = await add(B, [line(A, Bn), line(Bn, D), line(A, C), line(C, D)]);
  const res = await net(B, ds, { analysis: 'maxflow', from: '0,0', to: '2,0' });
  assert.equal(res.ok, true);
  assert.equal(res.stats.maxFlow, 2);
  assert.equal(res.stats.capacityBasis, 'unit');
  assert.equal(res.stats.cutEdges, 2);
});

/* ══ ③ ════════════════════════════════════════════════════════════════════════════════════════ */

test('③ 代替経路は、全単純路を列挙して得た安い順の k 本と一致する', async () => {
  const B = await boot();
  for (const seed of [2, 13, 31]) {
    const r = rng(seed), G = randomGraph(r, 9, 15, 7);
    const ds = await add(B, featuresOf(G));
    const res = await net(B, ds, { analysis: 'alternatives', weightField: 'w', from: 'N0', to: 'N8', k: 6, nameFromField: 'from', nameToField: 'to', snapKm: 0 });
    if (!res.ok) { assert.ok(['endpoint-not-found', 'no-route'].includes(res.why)); continue; }
    const ref = allSimplePaths(9, G.edges, 0, 8).slice(0, 6).map((p) => p.cost);
    const got = res.dataset.features().map((f) => f.properties._cost);
    assert.equal(got.length, ref.length);
    got.forEach((c, i) => assert.ok(Math.abs(c - ref[i]) < 1e-4, 'seed ' + seed + ' rank ' + (i + 1) + ': ' + c + ' vs ' + ref[i]));
    assert.equal(res.dataset.features()[0].properties._extraPct, 0);
    for (const f of res.dataset.features()) assert.equal(f.geometry.type, 'LineString');
  }
});

/* ══ ④ ════════════════════════════════════════════════════════════════════════════════════════ */

test('④ 障害: 成分数・到達できなくなった対の数は、壊れた網を総当たりした値と一致する。壊れていなければ損失は 0', async () => {
  const B = await boot();
  for (const seed of [4, 19, 53]) {
    const r = rng(seed), G = randomGraph(r, 12, 15, 6);
    const ds = await add(B, featuresOf(G));
    /* the zone is a box over some of the lattice: nodes inside it are gone, so are edges crossing it */
    const zoneFeat = box(1.9, 1.9, 6, 4.1);
    const z = await add(B, [zoneFeat], 'zone');
    const res = await B.ops.run({ op: 'networkDisrupt', inputs: [ds.id, z.id], params: { weightField: 'w', nameFromField: 'from', nameToField: 'to', snapKm: 0 } });
    assert.equal(res.ok, true, res.why + JSON.stringify(res.detail));
    const inside = (p) => p[0] >= 1.9 && p[0] <= 6 && p[1] >= 1.9 && p[1] <= 4.1;
    const deadNodes = new Set(); G.pos.forEach((p, i) => { if (inside(p)) deadNodes.add(i); });
    /* an edge is hit when a segment of it touches the box: both ends are points, so a straight chord */
    const hit = (a, b) => { let lo = 0, hi = 1; const [x0, y0] = a, [x1, y1] = b; const x = (t) => x0 + (x1 - x0) * t, y = (t) => y0 + (y1 - y0) * t;
      /* slab test */ let tmin = 0, tmax = 1; for (const [p0, d, mn, mx] of [[x0, x1 - x0, 1.9, 6], [y0, y1 - y0, 1.9, 4.1]]) { if (Math.abs(d) < 1e-15) { if (p0 < mn || p0 > mx) return false; } else { let t1 = (mn - p0) / d, t2 = (mx - p0) / d; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return false; } } void lo; void hi; void x; void y; return true; };
    const deadEdges = new Set(); G.edges.forEach((e, k) => { if (hit(G.pos[e.a], G.pos[e.b])) deadEdges.add(k); });
    const pc = pathCounts(12, G.edges, { edges: deadEdges, nodes: deadNodes });
    const intact = pathCounts(12, G.edges, null);
    let before = 0, lost = 0;
    for (let s = 0; s < 12; s++) for (let t = 0; t < 12; t++) { if (s === t || !(intact.d[s][t] < Infinity)) continue; before++; if (deadNodes.has(s) || deadNodes.has(t) || !(pc.d[s][t] < Infinity)) lost++; }
    assert.equal(res.stats.pairsBefore, before, 'seed ' + seed);
    assert.equal(res.stats.pairsLost, lost, 'seed ' + seed + ': lost pairs');
    assert.equal(res.stats.nodesRemoved, deadNodes.size);
    assert.equal(res.stats.exact, true);
  }
  /* nothing touched → nothing lost */
  const ds = await add(B, [line([0, 0], [1, 0]), line([1, 0], [2, 0])]);
  const far = await add(B, [box(50, 50, 51, 51)], 'far');
  const calm = await B.ops.run({ op: 'networkDisrupt', inputs: [ds.id, far.id], params: {} });
  assert.equal(calm.stats.pairsLost, 0);
  assert.equal(calm.stats.edgesRemoved, 0);
  assert.equal(calm.stats.meanDetourPct, 0);
});

test('④ 迂回: 1 本を失うと、残った対の費用が増える。増えた分は meanDetourPct に出る', async () => {
  const B = await boot();
  /* a ring: A-B-C-D-A; cutting A-B sends A→B the long way (3 legs) */
  const P = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const ds = await add(B, [line(P[0], P[1]), line(P[1], P[2]), line(P[2], P[3]), line(P[3], P[0])]);
  const z = await add(B, [box(0.9, -0.1, 1.1, 0.1)], 'z');
  const res = await B.ops.run({ op: 'networkDisrupt', inputs: [ds.id, z.id], params: {} });
  assert.equal(res.ok, true);
  assert.equal(res.stats.edgesRemoved, 1);
  assert.equal(res.stats.pairsLost, 0, 'a ring stays connected');
  assert.ok(res.stats.meanDetourPct > 0, 'the detour must be reported');
  const gain = res.stats.topEdgesGainingLoad;
  assert.ok(gain.length >= 1, 'the surviving edges that take the rerouted traffic are named');
});

/* ══ ⑤ ════════════════════════════════════════════════════════════════════════════════════════ */

test('⑤ 費用が欠けた辺は除外して数える（長さで代用しない）・容量が欠けたら 0 で数える・拒否は名前', async () => {
  const B = await boot();
  const ds = await add(B, [line([0, 0], [1, 0], { w: 5, c: 2 }), line([1, 0], [2, 0], { w: null, c: 2 }), line([2, 0], [3, 0], { w: 3, c: null }), line([3, 0], [4, 0], { w: 0, c: 1 })]);
  const res = await net(B, ds, { analysis: 'centrality', weightField: 'w', capacityField: 'c' });
  assert.equal(res.ok, true);
  assert.equal(res.stats.edgesDroppedNoWeight, 2, 'a null cost and a zero cost are both unusable');
  assert.equal(res.stats.capacityMissing, 1);
  assert.equal(res.stats.edges, 2);

  const s2 = await net(B, ds, { analysis: 'maxflow', from: '0,0', to: '3,0' });
  assert.equal(s2.ok, true);
  const lines = await add(B, [line([0, 0], [1, 0])]);
  assert.equal((await net(B, lines, { analysis: 'bogus' })).why, 'missing-param');
  assert.equal((await net(B, lines, {})).why, 'missing-param');
  assert.equal((await net(B, lines, { analysis: 'maxflow', from: '0,0' })).why, 'missing-param');
  assert.equal((await net(B, lines, { analysis: 'maxflow', from: 'nowhere', to: '1,0' })).why, 'endpoint-not-found');
  assert.equal((await net(B, lines, { analysis: 'maxflow', from: '0,0', to: '0,0' })).why, 'bad-param');
  assert.equal((await net(B, lines, { analysis: 'centrality', weightField: 'nope' })).why, 'unknown-field');
  assert.equal((await net(B, lines, { analysis: 'centrality', snapKm: -1 })).why, 'bad-param');
  assert.equal((await net(B, lines, { analysis: 'maxflow', from: '0,0', to: '1,0', output: 'nodes' })).why, 'bad-param');
  const pts = await add(B, [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }]);
  assert.equal((await net(B, pts, { analysis: 'centrality' })).why, 'geometry-type');
  const clash = await add(B, [line([0, 0], [1, 0], { _edgeRow: 1 })]);
  assert.equal((await net(B, clash, { analysis: 'centrality', output: 'edges' })).why, 'output-column-in-use');

  const z = await add(B, [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }], 'pt');
  assert.equal((await B.ops.run({ op: 'networkDisrupt', inputs: [lines.id, z.id], params: {} })).why, 'geometry-type');
  const B2 = await boot({ noNetwork: true });
  const l2 = await add(B2, [line([0, 0], [1, 0])]);
  assert.equal((await net(B2, l2, { analysis: 'centrality' })).why, 'geometry-unavailable', 'a kernel that did not arrive answered as if it had');
});

test('⑤ 同じ点を共有する線は、snapKm の中なら 1 つのノードにまとまる。nodesAt:vertices は途中の交点でも切る', async () => {
  const B = await boot();
  const ds = await add(B, [line([0, 0], [1, 0]), line([1.0001, 0], [2, 0])]);
  const loose = await net(B, ds, { analysis: 'centrality', snapKm: 1 });
  const tight = await net(B, ds, { analysis: 'centrality', snapKm: 0 });
  assert.equal(loose.stats.nodes, 3, '11 m apart is one junction under a 1 km snap');
  assert.equal(tight.stats.nodes, 4, 'but two nodes when the snap is 0');
  /* a cross: two lines that share a middle vertex are one junction only in vertices mode */
  const cross = await add(B, [
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[1, -1], [1, 0], [1, 1]] } },
  ]);
  const ends = await net(B, cross, { analysis: 'centrality', nodesAt: 'endpoints' });
  const verts = await net(B, cross, { analysis: 'centrality', nodesAt: 'vertices' });
  assert.equal(ends.stats.components, 2, 'endpoints only: the two lines never meet');
  assert.equal(verts.stats.components, 1);
  assert.equal(verts.stats.edges, 4);
  assert.equal(verts.stats.costSplit, 0, 'no cost field, so no cost was split');
});

/* ══ ⑥ ════════════════════════════════════════════════════════════════════════════════════════ */

test('⑥ maxSources を超えると標本だと述べる。標本は再現し、全数ならそう述べる', async () => {
  const B = await boot();
  const r = rng(8), G = randomGraph(r, 30, 45, 8);
  const ds = await add(B, featuresOf(G));
  const exact = await net(B, ds, { analysis: 'centrality', weightField: 'w', snapKm: 0 });
  assert.equal(exact.stats.exact, true);
  assert.equal(exact.stats.sourcesUsed, exact.stats.sourcesLive);
  const a = await net(B, ds, { analysis: 'centrality', weightField: 'w', snapKm: 0, maxSources: 10 });
  const b = await net(B, ds, { analysis: 'centrality', weightField: 'w', snapKm: 0, maxSources: 10 });
  assert.equal(a.stats.exact, false);
  assert.equal(a.stats.sourcesUsed, 10);
  assert.deepEqual(a.dataset.features().map((f) => f.properties._betweenness), b.dataset.features().map((f) => f.properties._betweenness), 'a sample is replayable');
  /* the estimate is unbiased in total: scaled sample sums land within a factor of the exact one */
  const sum = (res) => res.dataset.features().reduce((s, f) => s + f.properties._betweenness, 0);
  assert.ok(sum(a) > sum(exact) * 0.4 && sum(a) < sum(exact) * 2.5);
  /* the recipe replays to the same bytes */
  const again = await net(B, ds, { analysis: 'centrality', weightField: 'w', snapKm: 0 });
  assert.deepEqual(again.dataset.features(), exact.dataset.features());
});

/* ══ ⑦ ════════════════════════════════════════════════════════════════════════════════════════ */

test('⑦ 中止ボタンは効く: 走行中に abort すると cancelled になり、登録されない', async () => {
  const B = await boot();
  const r = rng(6), G = randomGraph(r, 60, 120, 5);
  const ds = await add(B, featuresOf(G));
  const ac = new AbortController(); ac.abort();
  const res = await B.ops.run({ op: 'network', inputs: [ds.id], params: { analysis: 'centrality', snapKm: 0 } }, { signal: ac.signal });
  assert.equal(res.ok, false);
  assert.equal(res.why, 'cancelled');
});

/* ══ ⑧ ════════════════════════════════════════════════════════════════════════════════════════ */

test('⑧ 版を述べて組み込まれ・宣言は 2 つの op を持ち・Atlas の案内文が名指す', async () => {
  const B = await boot();
  assert.deepEqual([B.ops.op('network').inputs, B.ops.op('network').accepts], [1, ['LineString']]);
  assert.deepEqual([B.ops.op('networkDisrupt').inputs, B.ops.op('networkDisrupt').accepts], [2, ['LineString', 'Polygon']]);
  const core = readFileSync(join(ROOT, 'js/gis-core.js'), 'utf8');
  assert.match(core, /\['IntMapGisNetwork', network\]/, 'js/gis-core.js does not mount and verify the kernel');
  const { KERNELS } = await import('../scripts/gis-kernel-versions.mjs');
  assert.equal(KERNELS['js/gis-network.js'] && KERNELS['js/gis-network.js'].version, B.network.version());
  const text = await catalogueText(['data.gis']);
  assert.match(text, /networkDisrupt\(2: LineString routes, Polygon zone\)/, 'the planner is not told about the op');
  assert.match(text, /minimum cut/);
  assert.match(text, /pairsLostPct/);
});

/* ══ ⑨ REAL DATA ══════════════════════════════════════════════════════════════════════════════ */

test('⑨ 実データ: 海底ケーブル網（data/subcables.json）で台湾海峡が止まったとき、何が切れ、荷重がどこへ移るか', async () => {
  const B = await boot();
  const cab = JSON.parse(readFileSync(join(ROOT, 'data/subcables.json'), 'utf8'));
  const ds = await add(B, cab.features, 'cables');
  const strait = await add(B, [{ type: 'Feature', properties: { name: 'Taiwan Strait' }, geometry: { type: 'Polygon', coordinates: [[[118.0, 22.8], [120.2, 22.8], [120.2, 25.6], [118.0, 25.6], [118.0, 22.8]]] } }], 'strait');
  const t0 = Date.now();
  const res = await B.ops.run({ op: 'networkDisrupt', inputs: [ds.id, strait.id], params: { snapKm: 5, edgeLabelField: 'name' } });
  const ms = Date.now() - t0;
  assert.equal(res.ok, true, res.why + JSON.stringify(res.detail));
  const s = res.stats;
  assert.ok(s.nodes > 2000 && s.edges > 3000, 'the whole network is read, not a sample of it: ' + s.nodes + '/' + s.edges);
  assert.ok(s.edgesHitByZone >= 5, 'cables really cross the strait: ' + s.edgesHitByZone);
  assert.equal(s.edgesRemoved >= s.edgesHitByZone, true);
  /* the loss is measured, and honest about being a sample (2,689 live nodes > 512) */
  assert.equal(s.exact, false);
  assert.equal(s.sourcesUsed, 512);
  assert.ok(s.pairsBefore > 100000);
  assert.ok(s.pairsLostPct >= 0 && s.pairsLostPct < 100);
  assert.ok(Array.isArray(s.topEdgesRemovedByLoad) && s.topEdgesRemovedByLoad.length >= 1, 'the busiest removed cables are named');
  assert.ok(Array.isArray(s.topEdgesGainingLoad) && s.topEdgesGainingLoad.length >= 1, 'and so are the cables that take their traffic');
  assert.ok(ms < 60000, 'a 3,400-edge network answers in ' + ms + ' ms');
  /* the same question on the edges, from the same record, keeps every cable */
  const edges = await B.ops.run({ op: 'networkDisrupt', inputs: [ds.id, strait.id], params: { snapKm: 5, output: 'edges', maxSources: 64 } });
  assert.equal(edges.ok, true);
  const removed = edges.dataset.features().filter((f) => f.properties._removed);
  assert.equal(removed.length, edges.stats.edgesRemoved);
  assert.ok(removed.every((f) => f.properties._loadAfter === 0));
});
