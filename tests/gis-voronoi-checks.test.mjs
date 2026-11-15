/* ============================================================================
 *  GIS · 最寄り圏と、いちばん遠い場所 — `voronoi` (js/gis-ops.js) over js/gis-voronoi.js
 * ----------------------------------------------------------------------------
 *  What the op claims, and therefore what has to stay true (docs/GIS-CORE.md §2.9):
 *
 *    ① the regions PARTITION the window — their areas add up to the window's, with no gap
 *       between two drawings of one border
 *    ② every place is in the region of its nearest site (brute force over all sites), up to the
 *       drawing tolerance the section states — 0.56 % of the half-separation
 *    ③ the farthest place is a real point at least as far as a brute-force grid finds, and the
 *       bound proves nothing is farther (bound ≤ found × (1 + the sphere's error))
 *    ④ poles, the seam, one / two / three / four sites and the whole sphere need no special case
 *    ⑤ co-circular sites (every lng/lat grid) still partition the ground exactly
 *    ⑥ rows: one position is one site (lower row), MultiPoint is one identity, refusals by name
 *    ⑦ the same input replays to the same bytes, and the kernel is mounted where provenance can
 *       see its version — and Atlas is told about the op
 *
 *  ⚠ THE REFERENCE IS BRUTE FORCE, written here and not in the kernel: «which site is nearest to
 *  this point» over every site, by IntMapGeodesy's own haversine. A check that asked the kernel's
 *  own neighbour sets would agree with the kernel by construction.
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
  const { makeGisVoronoi } = await import('../js/gis-voronoi.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(); const geometry = makeGisGeometry();
  const voronoi = (opts && opts.noVoronoi) ? null : makeGisVoronoi();
  if (!voronoi) delete w.IntMapGisVoronoi;
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, data, geometry, voronoi, ops, R: w.IntMapGeodesy._R_EARTH_KM, km: (a, b) => w.IntMapGeodesy._distKm(a, b) };
}

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const box = (W, S, E, N, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [[[W, S], [E, S], [E, N], [W, N], [W, S]]] } });
const HALVES = [box(-180, -90, 0, 90), box(0, -90, 180, 90)];
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
const positionsOf = (f) => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates);

async function voronoi(B, sites, wins) {
  const s = B.data.add({ title: 'sites', features: sites });
  const w = B.data.add({ title: 'window', features: wins });
  const res = await B.ops.run({ op: 'voronoi', inputs: [s.id, w.id] });
  assert.equal(res.ok, true, 'voronoi refused: ' + res.why + ' ' + JSON.stringify(res.detail));
  return res;
}

function areaSum(B, feats) { let a = 0; for (const f of feats) a += f.properties._areaKm2; return a; }

/* ② — sample the window, find the region each point is in, and compare its site with the true nearest. */
/* `box` is where the samples are drawn (uniform on the sphere inside it); omitted, the whole Earth. */
function membership(B, sites, rows, wins, n, rand, box) {
  const [W0, S0, E0, N0] = box || [-180, -90, 180, 90];
  const s0 = Math.sin(S0 * Math.PI / 180), s1 = Math.sin(N0 * Math.PI / 180);
  const REL = B.voronoi.sphereRelError();
  let tested = 0, unassigned = 0;
  const worst = { excess: 0, allowed: 0 };
  const bb = wins.map((x) => B.ops.areaKm2(x.geometry) > 0 && x);
  for (let k = 0; k < n; k++) {
    const q = [W0 + rand() * (E0 - W0), Math.asin(s0 + rand() * (s1 - s0)) * 180 / Math.PI];
    if (!bb.some((x) => B.geometry.pointInGeometry(q, x.geometry))) continue;
    const f = rows.find((r) => B.geometry.pointInGeometry(q, r.geometry));
    if (!f) { unassigned++; continue; }
    tested++;
    let best = Infinity, second = Infinity;
    for (const s of sites) for (const c of positionsOf(s)) {
      const d = B.km(q, c);
      if (d < best) { second = best; best = d; } else if (d < second) second = d;
    }
    let mine = Infinity;
    for (const c of positionsOf(sites[f.properties._siteRow])) mine = Math.min(mine, B.km(q, c));
    const excess = mine - best;
    /* The drawn border stands within REL × half-separation of the true one, so a point the drawing
       hands to a neighbour lies within that band of the border: its distance to the wrong site
       exceeds the right one by at most twice the band (the separation is ≤ best + second). */
    const allowed = 2 * REL * (best + second) / 2 + 1e-6;
    if (excess - allowed > worst.excess - worst.allowed) { worst.excess = excess; worst.allowed = allowed; }
  }
  return { tested, unassigned, worst };
}

/* ══ ① ② ③ — a regional window ═══════════════════════════════════════════════════════════════ */

test('① ② ③ 日本の窓・300 地点: 圏は窓を隙間なく分け、各点は最寄りの地点の圏にあり、いちばん遠い場所は総当たりより遠い', async () => {
  const B = await boot();
  const r = rng(1);
  const sites = []; for (let i = 0; i < 300; i++) sites.push(pt(125 + r() * 25, 25 + r() * 20, { name: 'S' + i }));
  const win = [box(128, 30, 142, 42)];
  const res = await voronoi(B, sites, win);
  const rows = res.dataset.features();
  const W = B.ops.areaKm2(win[0].geometry);

  /* ① */
  const A = areaSum(B, rows);
  assert.ok(Math.abs(A - W) / W < 1e-9, 'regions add up to ' + A + ' km², the window is ' + W + ' km² — a gap or an overlap between neighbours');
  assert.equal(res.stats.geometryFailed, undefined, 'part of the answer was lost: ' + res.stats.geometryWhy);
  assert.equal(res.stats.neighbours, 'hull');
  assert.ok(res.stats.sitesOutsideWindow > 0 && res.stats.sitesOutsideWindow < 300);
  assert.equal(rows.length + res.stats.sitesOutsideWindow, 300);
  assert.ok(rows.every((f) => f.properties.name === 'S' + f.properties._siteRow), 'a row does not carry its own site\'s columns');

  /* ② */
  const m = membership(B, sites, rows, win, 4000, rng(2), [128, 30, 142, 42]);
  assert.ok(m.tested > 1000, 'too few samples landed: ' + m.tested);
  assert.equal(m.unassigned, 0, m.unassigned + ' places inside the window are in no region');
  assert.ok(m.worst.excess <= m.worst.allowed, 'a place is ' + m.worst.excess + ' km nearer to another site than to its own (allowed ' + m.worst.allowed + ')');

  /* ③ — brute force on a 0.05° grid over every site */
  let gridMax = 0;
  for (let x = 128; x <= 142 + 1e-9; x += 0.05) for (let y = 30; y <= 42 + 1e-9; y += 0.05) {
    let d = Infinity; for (const s of sites) d = Math.min(d, B.km([x, y], s.geometry.coordinates));
    if (d > gridMax) gridMax = d;
  }
  const st = res.stats;
  assert.ok(st.farthestKm >= gridMax - 1e-9, 'the search found ' + st.farthestKm + ' km, a grid finds ' + gridMax + ' km');
  assert.ok(st.farthestBoundKm >= st.farthestKm, 'the bound is below the answer');
  assert.ok(st.farthestBoundKm <= st.farthestKm * (1 + B.voronoi.sphereRelError()) + st.borderToleranceKm + 1e-9, 'the bound is looser than the stated tolerance');
  /* the point it names IS that far from its nearest site */
  let dAt = Infinity; for (const s of sites) dAt = Math.min(dAt, B.km([st.farthestLng, st.farthestLat], s.geometry.coordinates));
  assert.ok(Math.abs(dAt - st.farthestKm) < 1e-6, 'the farthest point is ' + dAt + ' km from its nearest site, the answer says ' + st.farthestKm);
  assert.ok(B.geometry.pointInGeometry([st.farthestLng, st.farthestLat], win[0].geometry) || Math.abs(st.farthestLng - 128) < 1e-9 || Math.abs(st.farthestLat - 30) < 1e-9 || Math.abs(st.farthestLng - 142) < 1e-9 || Math.abs(st.farthestLat - 42) < 1e-9,
    'the farthest place is outside the window');
  const row = rows.find((f) => f.properties._siteRow === st.farthestRow);
  assert.ok(row && row.properties._farthestKm === st.farthestKm, 'the row named as farthest does not carry the answer');
});

/* ══ ④ — the whole sphere, the poles, the seam, and very few sites ═══════════════════════════ */

test('④ 全球・極・日付変更線・地点 1〜4: 別の枝なしに同じ答えの形', async () => {
  const B = await boot();
  const SPHERE = 4 * Math.PI * B.R * B.R;
  const r = rng(7);
  const glob = []; for (let i = 0; i < 400; i++) glob.push(pt(-180 + r() * 360, Math.asin(2 * r() - 1) * 180 / Math.PI));
  const cases = [
    ['400 sites', glob],
    ['1 site', [pt(10, 20)]],
    ['2 sites', [pt(10, 20), pt(-100, -30)]],
    ['3 sites', [pt(10, 20), pt(-100, -30), pt(170, 60)]],
    ['4 sites', [pt(10, 20), pt(-100, -30), pt(170, 60), pt(0, -80)]],
    ['equator', Array.from({ length: 30 }, (_, i) => pt(-180 + i * 12, 0))],
  ];
  for (const [name, sites] of cases) {
    const res = await voronoi(B, sites, HALVES);
    const rows = res.dataset.features();
    assert.equal(rows.length, sites.length, name + ': not every site has a region');
    const A = areaSum(B, rows);
    assert.ok(Math.abs(A - SPHERE) / SPHERE < 1e-9, name + ': regions add up to ' + A + ' km² on a sphere of ' + SPHERE);
    const m = membership(B, sites, rows, HALVES, 1500, rng(name.length));
    assert.equal(m.unassigned, 0, name + ': a place on Earth is in no region');
    assert.ok(m.worst.excess <= m.worst.allowed, name + ': a place is ' + m.worst.excess + ' km nearer to another site');
  }
  /* one site: the farthest place on Earth is its antipode, at half the circumference */
  const one = await voronoi(B, [pt(10, 20)], HALVES);
  assert.ok(Math.abs(one.stats.farthestKm - Math.PI * B.R) < 1e-6);
  assert.deepEqual([one.stats.farthestLng, one.stats.farthestLat], [-170, -20]);
  /* thirty sites on the equator: the poles are the farthest places, a quarter of the way round —
     to within the latitude js/gis-geometry.js caps a ring at (89.9999°, 11 m short of the pole) */
  const eq = await voronoi(B, cases[5][1], HALVES);
  const quarter = Math.PI * B.R / 2;
  assert.ok(eq.stats.farthestKm <= quarter + 1e-9 && quarter - eq.stats.farthestKm < 0.02, 'equator sites: farthest is ' + eq.stats.farthestKm + ', a quarter is ' + quarter);
  assert.ok(Math.abs(eq.stats.farthestLat) > 89.99);
  assert.ok(eq.stats.farthestBoundKm >= quarter - 0.02);
});

test('④ 日付変更線をまたぐ窓: 圏は窓を分け、どの片も ±180 の外に出ない', async () => {
  const B = await boot();
  const r = rng(11);
  const sites = []; for (let i = 0; i < 60; i++) { const x = 170 + r() * 20; sites.push(pt(x > 180 ? x - 360 : x, -10 + r() * 20)); }
  const wins = [box(170, -10, 180, 10), box(-180, -10, -170, 10)];
  const res = await voronoi(B, sites, wins);
  const rows = res.dataset.features();
  const W = wins.reduce((a, x) => a + B.ops.areaKm2(x.geometry), 0);
  assert.ok(Math.abs(areaSum(B, rows) - W) / W < 1e-9);
  for (const f of rows) for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const ring of poly) for (const p of ring) {
    assert.ok(p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90, 'a vertex outside the plane: ' + p);
  }
  const m = membership(B, sites, rows, wins, 3000, rng(12), [170, -10, 190, 10]);
  assert.equal(m.unassigned, 0);
  assert.ok(m.worst.excess <= m.worst.allowed);
});

/* ══ ⑤ — co-circular sites are ordinary data ═══════════════════════════════════════════════════ */

test('⑤ 経緯度の格子（共円の 4 点だらけ）: 隙間も重なりも無い', async () => {
  const B = await boot();
  const grid = []; for (let x = 130; x <= 140; x += 1) for (let y = 30; y <= 40; y += 1) grid.push(pt(x, y));
  const win = [box(129.5, 29.5, 140.5, 40.5)];
  const res = await voronoi(B, grid, win);
  const rows = res.dataset.features();
  assert.equal(rows.length, grid.length);
  const W = B.ops.areaKm2(win[0].geometry);
  assert.ok(Math.abs(areaSum(B, rows) - W) / W < 1e-9, 'a grid of co-circular sites left a gap or an overlap');
  /* each cell centre (the site) and a point a third of the way to each diagonal neighbour belong to it */
  for (const f of rows) {
    const [x, y] = grid[f.properties._siteRow].geometry.coordinates;
    for (const [dx, dy] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
      const q = [x + dx, y + dy];
      if (!B.geometry.pointInGeometry(q, win[0].geometry)) continue;
      assert.ok(B.geometry.pointInGeometry(q, f.geometry), 'the region of ' + [x, y] + ' does not hold ' + q);
    }
  }
});

/* ══ ⑥ — what a row is, and the refusals ══════════════════════════════════════════════════════ */

test('⑥ 同じ位置の 2 行は 1 地点（小さい行番号）・MultiPoint は 1 つの身元・拒否は名前で', async () => {
  const B = await boot();
  const win = [box(0, 0, 10, 10)];
  const dup = await voronoi(B, [pt(1, 1, { a: 1 }), pt(1, 1, { a: 2 }), pt(5, 5), pt(9, 1), pt(3, 8), pt(7, 7)], win);
  const rows = dup.dataset.features();
  assert.equal(dup.stats.coincidentRows, 1);
  assert.equal(rows.length, 5);
  assert.ok(rows.some((f) => f.properties._siteRow === 0 && f.properties.a === 1), 'the shared position did not go to the lower row');
  assert.ok(!rows.some((f) => f.properties._siteRow === 1), 'the second row at one position got a region of its own');

  const multi = await voronoi(B, [{ type: 'Feature', properties: { id: 'chain' }, geometry: { type: 'MultiPoint', coordinates: [[1, 1], [9, 9]] } }, pt(5, 5), pt(1, 9), pt(9, 1)], win);
  const chain = multi.dataset.features().find((f) => f.properties.id === 'chain');
  assert.ok(chain && chain.geometry.type === 'MultiPolygon', 'a MultiPoint row is not one region of several parts');
  assert.equal(multi.dataset.features().length, 4);

  const s = B.data.add({ title: 's', features: [pt(1, 1, { _farthestKm: 3 })] });
  const w = B.data.add({ title: 'w', features: win });
  const clash = await B.ops.run({ op: 'voronoi', inputs: [s.id, w.id] });
  assert.equal(clash.why, 'output-column-in-use');
  assert.equal(clash.detail.name, '_farthestKm');

  const lines = B.data.add({ title: 'l', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] });
  assert.equal((await B.ops.run({ op: 'voronoi', inputs: [lines.id, w.id] })).why, 'geometry-type');

  const B2 = await boot({ noVoronoi: true });
  const s2 = B2.data.add({ title: 's', features: [pt(1, 1)] });
  const w2 = B2.data.add({ title: 'w', features: win });
  const gone = await B2.ops.run({ op: 'voronoi', inputs: [s2.id, w2.id] });
  assert.equal(gone.why, 'geometry-unavailable', 'a kernel that did not arrive answered as if it had');
});

test('⑥ 対蹠点を含む圏の答えは対蹠点（境界の探索では見つからない最大）', async () => {
  const B = await boot();
  const f = B.voronoi.farthest([0, 0], [[[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]], B.R, () => true);
  assert.equal(f.km, Math.PI * B.R);
  assert.deepEqual(f.at, [-180, -0]);
});

/* ══ ⑦ — replay, mounting, and the planner ══════════════════════════════════════════════════════ */

test('⑦ 同じ入力は同じバイトに・カーネルは版を述べて組み込まれ・Atlas の案内文が op を名指す', async () => {
  const B = await boot();
  const r = rng(5);
  const sites = []; for (let i = 0; i < 120; i++) sites.push(pt(r() * 20, r() * 20));
  const a = await voronoi(B, sites, [box(2, 2, 18, 18)]);
  const b = await voronoi(B, sites, [box(2, 2, 18, 18)]);
  assert.equal(JSON.stringify(a.dataset.features()), JSON.stringify(b.dataset.features()), 'the same sites replayed to a different diagram');
  assert.equal(JSON.stringify(a.stats), JSON.stringify(b.stats));

  assert.equal(typeof B.voronoi.version(), 'string');
  const decl = B.ops.op('voronoi');
  assert.deepEqual([decl.inputs, decl.accepts, decl.output], [2, ['Point', 'Polygon'], 'Polygon']);

  /* mounted where js/gis-project.js discovers kernels (window.IntMapGis*), verified by the assembly */
  const core = readFileSync(join(ROOT, 'js/gis-core.js'), 'utf8');
  assert.match(core, /\['IntMapGisVoronoi', voronoi\]/, 'js/gis-core.js does not mount and verify the kernel');
  const { KERNELS } = await import('../scripts/gis-kernel-versions.mjs');
  assert.equal(KERNELS['js/gis-voronoi.js'] && KERNELS['js/gis-voronoi.js'].version, B.voronoi.version());

  const text = await catalogueText(['data.gis']);
  assert.match(text, /voronoi\(2: Point sites, Polygon window\)/, 'the planner is not told about the op');
  assert.match(text, /farthestBoundKm/);
});

/* ══ ⑧ — ground that was not computed withdraws the proof ═══════════════════════════════════════ */

test('⑧ 区域が欠けたら上界を主張しない——結合に失敗した行・作れなかった圏でも、いちばん遠い場所は先に畳み、farthestBoundKm は null・記録は partial', async () => {
  const B = await boot();
  const r = rng(21);
  /* a window across the 0° meridian and the equator, so most regions are rejoined from octant pieces */
  const sites = []; for (let i = 0; i < 80; i++) sites.push(pt(-10 + r() * 20, -10 + r() * 20));
  const win = [box(-8, -8, 8, 8)];
  const whole = await voronoi(B, sites, win);
  assert.ok(whole.stats.farthestBoundKm != null && whole.stats.farthestBoundWhy == null);
  const winner = whole.stats.farthestRow;

  /* ⑴ every rejoin fails: rows are lost, but the farthest place they measured is still the answer */
  const real = B.w.IntMapGisGeometry;
  B.w.IntMapGisGeometry = Object.assign({}, real, { attempt: Object.assign({}, real.attempt, { union: () => ({ ok: false, why: 'clipper-failed' }) }) });
  try {
    const s = B.data.add({ title: 's', features: sites }); const w = B.data.add({ title: 'w', features: win });
    const res = await B.ops.run({ op: 'voronoi', inputs: [s.id, w.id] });
    assert.equal(res.ok, true, res.why);
    assert.ok(res.stats.geometryFailed > 0, 'no rejoin failed — the case is not exercised');
    assert.ok(res.dataset.count < whole.dataset.count);
    assert.equal(res.stats.farthestKm, whole.stats.farthestKm, 'a lost row took its farthest point with it');
    assert.equal(res.stats.farthestRow, winner);
    assert.equal(res.stats.farthestBoundKm, null, 'a bound was claimed over ground that was not computed');
    assert.equal(res.stats.farthestBoundWhy, 'regions-not-computed');
    assert.equal(res.dataset.provenance.coverage.completeness, 'partial');
  } finally { B.w.IntMapGisGeometry = real; }

  /* ⑵ the kernel could not build the cell that holds the farthest place */
  const V = B.w.IntMapGisVoronoi;
  B.w.IntMapGisVoronoi = Object.assign({}, V, {
    cells: async (positions, o) => {
      const built = await V.cells(positions, o);
      const at = positions.findIndex((p) => p[0] === sites[winner].geometry.coordinates[0] && p[1] === sites[winner].geometry.coordinates[1]);
      built.cells[at] = { ok: false, why: 'cell-empty' };
      return built;
    },
  });
  try {
    const s = B.data.add({ title: 's2', features: sites }); const w = B.data.add({ title: 'w2', features: win });
    const res = await B.ops.run({ op: 'voronoi', inputs: [s.id, w.id] });
    assert.equal(res.ok, true, res.why);
    /* the farthest place usually sits where several regions meet, so a neighbour may still reach it —
       what may not survive is the claim that nothing is farther */
    assert.ok(res.stats.geometryFailed > 0 && res.stats.farthestKm <= whole.stats.farthestKm);
    assert.ok(!res.dataset.features().some((f) => f.properties._siteRow === winner), 'the region the kernel could not build still has a row');
    assert.equal(res.stats.farthestBoundKm, null, 'a smaller farthest place was «proved» with its region missing');
    assert.equal(res.dataset.provenance.coverage.completeness, 'partial');
  } finally { B.w.IntMapGisVoronoi = V; }
});
