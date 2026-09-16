/* ============================================================================
 *  #R756 · 格子に焼くとき、その形が通っていない場所を塗っていないか
 * ----------------------------------------------------------------------------
 *  An outside review read R752 and said `rasterize` fills a feature's bounding box for anything that
 *  is not an area. It does — `coveredBy()` answered `true` for Point, MultiPoint, LineString and
 *  MultiLineString, and the walk that used it visited every cell of the bounding box.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「線は Amanatides–Woo で走る」 is a sentence about an
 *  implementation, and it would pass over a walk that traverses the right cells of the wrong line.
 *  What is measured is what the reader LOSES: a grid made from roads or rivers says there is a road
 *  in places no road passes, and every analysis downstream of that grid inherits it.
 *
 *  The references here are derived from nothing in js/gis-ops.js: a cell set obtained by sampling
 *  the geometry densely and keeping the cells the samples fall in. That set cannot contain a cell
 *  the geometry does not enter, which is the whole claim.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster();
  await geometry.ready();
  return { w, data, ops, raster: w.IntMapGisRaster };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });

/* The lattice every case below uses. 16 × 16 over a 16° × 16° box, so one cell is exactly one
   degree and the reference arithmetic is readable by hand. */
const BOX = { w: 0, s: 0, e: 16, n: 16 };
const N = 16;
const bboxParam = BOX.w + ',' + BOX.s + ',' + BOX.e + ',' + BOX.n;

async function burn(ops, data, geom) {
  const ds = data.add({ title: 'r754', features: [feat(geom, { v: 1 })] });
  const res = await ops.run({
    op: 'rasterize', inputs: [ds.id],
    params: { width: N, height: N, stat: 'count', bbox: bboxParam },
  });
  assert.equal(res.ok, true, 'rasterize refused: ' + JSON.stringify(res.why || res));
  return res.dataset;
}

/* How many cells actually carry a value. The op reports `cells` as the size of the lattice, so the
   count that matters is read off the band itself. */
function painted(raster) {
  const px = raster.read(0);
  let n = 0;
  for (let i = 0; i < px.length; i++) if (px[i] === px[i] && px[i] !== 0) n++;
  return n;
}

function cellKey(lng, lat) {
  const c = Math.min(N - 1, Math.max(0, Math.floor((lng - BOX.w) / ((BOX.e - BOX.w) / N))));
  const r = Math.min(N - 1, Math.max(0, Math.floor((BOX.n - lat) / ((BOX.n - BOX.s) / N))));
  return r * N + c;
}

/* The reference: the cells a densely sampled walk along the geometry falls into. Independent of
   js/gis-ops.js — it knows only the coordinates and the lattice. */
function sampledCells(coords, steps) {
  const set = new Set();
  for (let i = 0; i + 1 < coords.length; i++) {
    const a = coords[i], b = coords[i + 1];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      set.add(cellKey(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  return set;
}

function paintedCells(raster) {
  const px = raster.read(0);
  const set = new Set();
  for (let i = 0; i < px.length; i++) if (px[i] === px[i] && px[i] !== 0) set.add(i);
  return set;
}

/* ══ ① 線 1 本は、その線が通った画素だけを塗る ═══════════════════════════════════════════ */

test('R756 ① a single line burns the cells it passes through, not its bounding box', async () => {
  const { data, ops } = await boot();
  /* A diagonal across the lattice. ⚠ THE SLOPE IS NOT ±1 ON PURPOSE: a line of slope exactly -1
     through this lattice passes through cell CORNERS, where 「その画素を通るか」 has no answer that
     is not a tie-break — a fixture that asks an undefined question measures the tie-break, not the
     traversal. This one crosses cell interiors the whole way. */
  const line = [[0.3, 0.7], [15.7, 14.2]];
  const res = await burn(ops, data, { type: 'LineString', coordinates: line });

  const got = paintedCells(res);
  /* ⚠ THE DEFECT: this was 256 — every cell of the bounding box, which here is the whole lattice. */
  assert.ok(got.size < N * N,
    'the diagonal painted the whole lattice (' + got.size + ' of ' + (N * N) + ') — the bounding box, not the line');

  const ref = sampledCells(line, 20000);
  for (const cell of got) {
    assert.ok(ref.has(cell),
      'cell ' + cell + ' was burned but no point of the line falls in it (row ' + Math.floor(cell / N) + ', col ' + (cell % N) + ')');
  }
  for (const cell of ref) {
    assert.ok(got.has(cell), 'the line passes through cell ' + cell + ' and it was not burned');
  }
  assert.ok(got.size >= N, 'a corner-to-corner diagonal crosses at least ' + N + ' cells, got ' + got.size);
});

/* ══ ② 離れた 2 点は、2 つの画素だけを塗る ══════════════════════════════════════════════ */

test('R756 ② a MultiPoint burns one cell per point, not the box that contains them', async () => {
  const { data, ops } = await boot();
  const pts = [[1.5, 1.5], [14.5, 14.5]];
  const res = await burn(ops, data, { type: 'MultiPoint', coordinates: pts });

  const got = paintedCells(res);
  /* ⚠ THE DEFECT: this was 256. */
  assert.equal(got.size, 2, 'two points burned ' + got.size + ' cells');
  for (const p of pts) assert.ok(got.has(cellKey(p[0], p[1])), 'the cell holding ' + JSON.stringify(p) + ' was not burned');
});

/* ══ ③ 端の座標は、格子の外ではなく最後の画素に属する ═════════════════════════════════ */

test('R756 ③ a point on the eastern or northern edge lands in the last cell, not nowhere', async () => {
  const { data, ops } = await boot();
  /* The extent defaults to the data's own, so the extreme coordinates sit exactly on the edge —
     the common case, not an edge case. */
  const res = await burn(ops, data, { type: 'MultiPoint', coordinates: [[BOX.e, BOX.n], [BOX.w, BOX.s]] });
  const got = paintedCells(res);
  assert.equal(got.size, 2, 'the corner points burned ' + got.size + ' cells');
  assert.ok(got.has(N - 1), 'the north-east corner point did not land in the last cell of the first row');
  assert.ok(got.has((N - 1) * N), 'the south-west corner point did not land in the first cell of the last row');
});

/* ══ ④ 面は今までどおり画素の中心で決まる（rasterize→zonal の往復が食い違わないこと） ═══ */

test('R756 ④ an area still burns by the pixel centre, unchanged', async () => {
  const { data, ops } = await boot();
  /* Exactly the four cells whose centres lie inside: 4°–8° in both axes covers centres 4.5 … 7.5. */
  const ring = [[4, 4], [8, 4], [8, 8], [4, 8], [4, 4]];
  const res = await burn(ops, data, { type: 'Polygon', coordinates: [ring] });
  assert.equal(painted(res), 16, 'the 4° × 4° square should cover 16 one-degree cell centres');
});

/* ══ ⑤ 述語が 1 つで 3 つの次元に答える形が戻っていないこと ═════════════════════════════ */

test('R756 ⑤ no single predicate answers 「is this cell covered」 for every dimension', () => {
  const src = read('js/gis-ops.js');
  /* ⚠ THE DEFECT WAS NOT A MISSING BRANCH — it was one predicate being asked a question that has a
     different meaning per dimension, so the two it could not answer got `true`. A returned-true
     default under a Polygon test is that shape whatever it is called. */
  const shape = /(Polygon'\s*\|\|[^\n]*MultiPolygon')[\s\S]{0,200}?\n\s*return true;/;
  assert.equal(shape.test(src), false,
    'a predicate still falls through to `return true` after testing only for polygons — ' +
    'that is the shape that painted bounding boxes (#R756)');
  assert.ok(/function burnGeometry\(/.test(src), 'the dimension-aware burn is gone');
  assert.ok(/function burnLine\(/.test(src) && /function burnPoint\(/.test(src) && /function burnArea\(/.test(src),
    'one of the three dimensions no longer has its own rule');
});
