/* ============================================================================
 *  #R752 · 揃った部品が、任意のデータと組み合わせに対して使える基盤になっているか
 * ----------------------------------------------------------------------------
 *  An outside review of R749 read the code and the design documents and named six places where the
 *  GIS core had parts but not a floor under them. Every one of the six was verified against the code
 *  before anything was written here, and docs/GIS-CORE.md §6 had already stated four of them itself.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「datasetRow が単位を返す」 is a sentence about an
 *  implementation and it would pass over a row that returns a unit nobody stated. What is measured
 *  is what the reader and the planner LOSE:
 *
 *    ① a planner handed a dataset cannot tell an identifier column from a measurement, cannot see
 *       the unit, the time declaration, the bands or the grid — every one of which the record HOLDS
 *    ② a grid with three bands is drawn as its first band, whatever the reader asked for, because
 *       the Atlas door passed no options at all to a drawer that reads them
 *    ③ the fields one reader accepts and the fields the schema declares are two lists, and the half
 *       only one of them knows about evaporates ([[intmap-two-readers-one-field-list]])
 *    ④ a saved recipe replays through kernels nobody recorded, so 「同じエンジンです」 is said about
 *       an engine that has changed — and the LIST OF WHICH KERNELS TO ASK was itself hand-written,
 *       wrong from the hour it was written
 *    ⑤ a GIS module can be neither a recorded kernel nor a stated non-kernel, which is how four
 *       answer-bearing files sat outside the ledger for a round
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  const drawn = [];
  const atlas = makeGisAtlas({
    data: data, ops: ops, layers: null,
    draw: (id, o) => { drawn.push({ id: id, opts: o || null }); return { ok: true, sid: 's1', band: (o && o.band) || 0 }; },
  });
  return { w, data, ops, atlas, drawn };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const row = (p) => feat(null, p);

/* ══ ① データセットの行は、planner が次の op を選べるだけのことを述べる ══════════════════ */

test('R752 ① the row handed to the planner carries the meaning, not just the column names', async () => {
  const { data, atlas } = await boot();

  const ds = data.add({
    title: '市区町村別人口',
    provenance: { kind: 'import', file: 'pop.csv' },
    features: [
      row({ cd: '01100', name: '札幌市中央区', pop: '248680', dens: '3123.4' }),
      row({ cd: '13101', name: '千代田区', pop: '66680', dens: '5758.1' }),
    ],
  });
  assert.equal(data.declareField(ds.id, 'dens', { type: 'number', unit: '人/km2' }).ok, true);

  const cat = atlas.catalogue();
  const r = cat.datasets.find((x) => x.id === ds.id);
  assert.ok(r, 'the dataset is not in the catalogue at all');

  /* ⚠ THE DEFECT: `fields` used to be `['cd','name','pop','dens']` — names with nothing attached. A
     planner cannot tell that `cd` is an identifier whose leading zero is a code and not a number
     (js/gis-datasets.js §1.1 measured exactly that cell), so it offers to sum it. */
  const fields = r.fields || [];
  assert.ok(fields.length, 'the row carries no columns');
  assert.ok(fields.every((f) => f && typeof f === 'object'),
    'the columns are bare names again — a planner cannot tell an identifier from a measurement: ' + JSON.stringify(fields));
  const cd = fields.find((f) => f.name === 'cd');
  const dens = fields.find((f) => f.name === 'dens');
  assert.ok(cd && cd.type, 'the identifier column does not say what it is');
  assert.notEqual(cd.type, 'number', 'a leading-zero code was handed to the planner as a number');
  assert.equal(dens.unit, '人/km2', 'the unit the reader stated never reaches the planner, so the answer is reported without it');

  /* 「表」「空」「格子」 are three situations behind one null geometryType; without this the planner
     buffers a table and gets an empty layer of areas back. */
  assert.equal(r.withGeometry, 0, 'the row does not say how many rows actually have a place');
  assert.equal(r.crs, 'EPSG:4326', 'the frame the numbers are in is left to be assumed');
  assert.equal(r.origin, 'import', 'the row does not say whether this is data or a result');
});

test('R752 ① (grid) a grid says how many bands it has and how coarse it is', async () => {
  const { data, atlas } = await boot();
  const ds = data.add({ kind: 'raster',
    title: 'rain', width: 4, height: 2,
    grid: { west: 130, north: 40, pixelLng: 0.5, pixelLat: 0.5 },
    bands: [{ name: 'mm', unit: 'mm/h' }, { name: 'class' }],
    read: () => new Array(8).fill(1),
  });
  const r = atlas.catalogue().datasets.find((x) => x.id === ds.id);
  /* ⚠ THE DEFECT: the planner was shown `kind:'raster'` and a count, so it asked for band 0 of a
     two-band grid because 0 was the only number it had ever been given. */
  assert.equal((r.bands || []).length, 2, 'a two-band grid is offered as though it held one picture');
  assert.equal(r.bands[0].unit, 'mm/h', 'the band unit the source stated is dropped on the way to the planner');
  assert.ok(r.grid && r.width === 4 && r.height === 2, 'the lattice is not described at all');
  assert.ok(r.pixelKmLat > 50 && r.pixelKmLat < 60, 'the resolution is only in degrees: ' + r.pixelKmLat);
});

/* ══ ② 描画のオプションは、受け取れる本体まで届く ═════════════════════════════════════════ */

test('R752 ② the band the caller named reaches the drawer instead of being chosen silently', async () => {
  const { data, atlas, drawn } = await boot();
  const ds = data.add({ kind: 'raster',
    title: 'rain', width: 2, height: 2,
    grid: { west: 130, north: 40, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'a' }, { name: 'b' }],
    read: () => [1, 2, 3, 4],
  });

  const r = await atlas.draw({ dataset: ds.id, band: 1 });
  assert.equal(r.ok, true, JSON.stringify(r));
  /* ⚠ THE DEFECT: this call was `core.draw(r.id)` with no second argument, under a comment in
     js/gis-core.js saying 「AND THE BAND IS THE CALLER'S TO NAME … choosing one silently would be
     this project's 「誰も述べていない主張」 in colour」. */
  assert.equal(drawn.length, 1);
  assert.ok(drawn[0].opts, 'the drawer was handed no options at all');
  assert.equal(drawn[0].opts.band, 1, 'the band the caller named did not reach the drawer');
});

/* ══ ③ 受け取る側と宣言する側の欄の一覧が、2 つ在ってはならない ══════════════════════════ */

test('R752 ③ every field the draw door reads is a field the schema declares', () => {
  /* ⚠ THE DEFECT, MEASURED IN PRODUCTION (#R747): `{targets:[…16 countries]}` failed and
     `{countries:[…the same 16]}` succeeded, because two readers of one request each had their own
     list of field names. The half only one of them knew about evaporated. Here the two halves are
     js/atlas-schemas.js (what a planner may write) and js/gis-atlas.js (what the door reads). */
  const schema = read('js/atlas-schemas.js');
  const line = schema.split('\n').find((l) => l.includes("'map.drawDataset':"));
  assert.ok(line, 'the drawDataset schema is gone');
  const declared = new Set();
  const props = /properties:\s*\{([^}]*)\}/.exec(line);
  assert.ok(props, 'the schema declares no properties');
  for (const m of props[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) declared.add(m[1]);

  const door = read('js/gis-atlas.js');
  const body = door.slice(door.indexOf('async function draw(action)'));
  const end = body.indexOf('\n    }');
  const readFields = new Set();
  for (const m of body.slice(0, end).matchAll(/\ba\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) readFields.add(m[1]);

  const unreachable = [...readFields].filter((f) => !declared.has(f)).sort();
  assert.deepEqual(unreachable, [],
    'the door reads fields no planner can write, because the schema does not declare them: ' + unreachable.join(', '));
  /* The other direction: `band` and `spec` are declared BECAUSE the door reads them. A schema field
     nothing reads is a promise to the planner that nothing keeps. */
  const ignored = [...declared].filter((f) => f !== 'dataset' && !readFields.has(f)).sort();
  assert.deepEqual(ignored, [],
    'the schema offers fields the door silently ignores: ' + ignored.join(', '));
});

/* ══ ④ どのカーネルに訊くかは、発見される ═══════════════════════════════════════════════ */

test('R752 ④ the set of kernels a saved recipe records is discovered, not written down', async () => {
  const src = read('js/gis-project.js');
  /* ⚠ THE DEFECT: `engineNow()` was `{ ops: …, geometry: … }`. js/gis-raster.js and js/gis-warp.js
     were introduced by the SAME ROUND as the record and have never been asked, so a step that
     resampled with bilinear replays through whatever bilinear means today in silence. */
  assert.ok(!/\bfunction engineNow\(\)\s*\{\s*return\s*\{\s*ops:/.test(src),
    'engineNow() names its kernels one at a time again');
  assert.ok(!/const ENGINE_PARTS\s*=\s*\[/.test(src),
    'the parts to compare are a hand-written list again — a part added to engineNow and forgotten there is saved and never compared');

  const w = installWindow();
  const { makeGisProject } = await import('../js/gis-project.js');
  w.IntMapGisAlpha = { version: () => 'alpha-9' };
  w.IntMapGisBeta = { run: () => null };                       /* not a kernel: declares nothing */
  w.IntMapSomethingElse = { version: () => 'nope-1' };         /* not this layer at all */
  const p = makeGisProject();
  const e = p.engine();
  assert.equal(e.alpha, 'alpha-9', 'a kernel mounted today is not recorded until somebody edits a list');
  assert.ok(!('beta' in e), 'a module that declares no version was recorded as a kernel that failed to answer');
  assert.ok(!('somethingElse' in e), 'a version outside this layer was recorded as one of its kernels');
});

/* ══ ⑤ GIS の module は、記録されたカーネルか、理由を述べた非カーネルか、どちらかである ═══ */

test('R752 ⑤ no GIS module is neither a recorded kernel nor a stated non-kernel', async () => {
  const { KERNELS, NOT_A_KERNEL, classifyKernels, declaredVersion } = await import('../scripts/gis-kernel-versions.mjs');

  /* ⚠ COUNTED, NOT LISTED. A file added to js/ tomorrow is in this population the day it lands —
     which is the whole difference between an omission and a decision
     ([[intmap-discovered-list-is-a-photograph]]). */
  const files = readdirSync(join(ROOT, 'js'))
    .filter((f) => /^gis-.*\.js$/.test(f))
    .map((f) => 'js/' + f)
    .sort();
  assert.ok(files.length >= 15, 'the GIS modules were not found at all: ' + files.length);

  const c = classifyKernels(files, read);
  assert.deepEqual(c.undecided, [],
    'GIS modules that are neither a recorded kernel nor a stated non-kernel: ' + c.undecided.join(', ')
    + ' — declare KERNEL_VERSION in the file if it can change an answer, or say in NOT_A_KERNEL why it cannot');
  assert.deepEqual(c.unrecorded, [],
    'kernels that declare a version and have no row in the ledger, so nothing compares their bytes: ' + c.unrecorded.join(', '));
  assert.deepEqual(c.stale, [],
    'ledger rows whose file no longer declares a version: ' + c.stale.join(', '));

  /* Every recorded kernel is a real file in the population — a row for a file that has been renamed
     would keep a hash of something nothing runs. */
  for (const rel of Object.keys(KERNELS)) assert.ok(files.includes(rel), 'ledger row for a file that is not a GIS module: ' + rel);
  for (const rel of Object.keys(NOT_A_KERNEL)) assert.ok(files.includes(rel), 'excused a file that is not a GIS module: ' + rel);

  /* ⚠ 「まだ版を付けていない」 is not a reason, so the reason must at least be a sentence. */
  for (const [rel, why] of Object.entries(NOT_A_KERNEL)) {
    assert.ok(typeof why === 'string' && why.trim().length > 20, rel + ' is excused without a stated reason');
    assert.ok(!declaredVersion(read(rel)), rel + ' is excused from having a version and declares one');
  }
});

/* ══ ⑥ 格子の鎖が、途中で外へ出ずに最後まで通る ═══════════════════════════════════════════ */

test('R752 ⑥ two grids from different sources reach a difference without leaving the chain', async () => {
  const { data, ops } = await boot();
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const raster = makeGisRaster(); const crs = makeGisCrs(); const warp = makeGisWarp();
  globalThis.window.IntMapGisRaster = raster;
  globalThis.window.IntMapGisCrs = crs;
  globalThis.window.IntMapGisWarp = warp;
  await crs.ready();

  /* Two grids of the same place on DIFFERENT lattices — which is what two dates from two sources
     look like, and what `rasterDiff` has always refused. */
  const g = (px, v) => data.add({
    kind: 'raster', title: 'g' + px, width: Math.round(2 / px), height: Math.round(2 / px),
    grid: { west: 130, north: 36, pixelLng: px, pixelLat: px },
    bands: [{ name: 'v', unit: 'mm' }],
    read: () => new Array(Math.round(2 / px) * Math.round(2 / px)).fill(v),
  });
  const a = g(0.5, 10), b = g(0.25, 4);

  /* ⚠ THE REFUSAL IS STILL THE RIGHT ONE. This op must not start resampling on its own. */
  const straight = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id] });
  assert.equal(straight.ok, false, 'rasterDiff silently resampled two different lattices');
  assert.equal(straight.why, 'grid-mismatch');

  /* ⚠ AND NOW IT HAS SOMEWHERE TO GO. Before #R752 the reader had to leave the chain entirely:
     js/gis-warp.js could do this and was reachable only from an import-panel button. */
  const r = await ops.run({ op: 'resample', inputs: [a.id, b.id], params: { method: 'bilinear' } });
  assert.equal(r.ok, true, 'resample refused: ' + r.why + ' ' + JSON.stringify(r.detail));
  const moved = data.get(r.dataset.id);
  assert.equal(moved.width, b.width, 'the output is not on the lattice of input 1');
  assert.equal(moved.grid.pixelLng, b.grid.pixelLng);

  const d = await ops.run({ op: 'rasterDiff', inputs: [moved.id, b.id] });
  assert.equal(d.ok, true, 'the difference still refused after aligning: ' + d.why);
  const vals = data.get(d.dataset.id).read(0);
  assert.equal(vals[0], 6, 'a − b is not what came out: ' + vals[0]);

  /* ⚠ `method` STILL HAS NO DEFAULT. The whole reason grid-mismatch existed was that a silently
     chosen interpolation is a composite nobody named; the new door must not become that. */
  const bare = await ops.run({ op: 'resample', inputs: [a.id, b.id], params: {} });
  assert.equal(bare.ok, false, 'a resample with no stated method ran anyway');
  assert.ok(bare.detail && bare.detail.values && bare.detail.values.length > 2,
    'the refusal did not offer the methods the kernel actually has: ' + JSON.stringify(bare.detail));
});

/* ══ ⑦ 式の言語は 1 つで、画素は行である ═══════════════════════════════════════════════════ */

test('R752 ⑦ the grid calculator is the expression kernel, not a second dialect', async () => {
  const { data, ops } = await boot();
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  globalThis.window.IntMapGisRaster = makeGisRaster();
  globalThis.window.IntMapGisExpr = makeGisExpr();

  const mk = (vals) => data.add({
    kind: 'raster', title: 't', width: 2, height: 2,
    grid: { west: 0, north: 2, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v' }], read: () => vals.slice(),
  });
  const a = mk([10, 20, 30, NaN]), b = mk([5, 5, 0, 5]);

  const r = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: '(a - b) / b', outName: 'ratio' } });
  assert.equal(r.ok, true, 'rasterCalc refused: ' + r.why + ' ' + JSON.stringify(r.detail));
  const v = data.get(r.dataset.id).read(0);
  assert.equal(v[0], 1);
  assert.equal(v[1], 3);
  /* ⚠ RULE ③ OF THE EXPRESSION KERNEL, UNCHANGED: a division by zero is not a measurement. A second
     dialect written for grids would have produced Infinity here and it would have survived into
     every later mean of this band. */
  assert.ok(Number.isNaN(v[2]), 'a division by zero became a number: ' + v[2]);
  /* ⚠ AND RULE ①: a void propagates rather than counting as 0. */
  assert.ok(Number.isNaN(v[3]), 'a missing pixel was read as zero: ' + v[3]);

  /* ⚠ A PIXEL HAS TWO VALUES, NOT A ROW OF THEM — and the refusal says which two names exist, so a
     wrong call is one corrected call rather than a search (#R733). */
  const bad = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'pop / area' } });
  assert.equal(bad.ok, false, 'an expression naming columns a grid has no such thing as ran anyway');
  assert.deepEqual(bad.detail.values, ['a', 'b']);
});

/* ══ ⑧ 測る面は読者のもので、歪みは同じ行に載る ═══════════════════════════════════════════ */

test('R752 ⑧ an area measured on a named plane carries that plane’s distortion beside it', async () => {
  const { data, ops } = await boot();
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const crs = makeGisCrs();
  globalThis.window.IntMapGisCrs = crs;
  await crs.ready();

  /* 0.1° × 0.1° at 60°N, where Web Mercator's area error is ~4× and impossible to notice in a
     column of numbers with nothing beside them. */
  const ring = [[10, 60], [10.1, 60], [10.1, 60.1], [10, 60.1], [10, 60]];
  const ds = data.add({
    title: 'box',
    features: [{ type: 'Feature', properties: { n: 1 }, geometry: { type: 'Polygon', coordinates: [ring] } }],
  });

  /* The geodesic answer this layer has always given — unchanged, and still what you get by default. */
  const geo = await ops.run({ op: 'measure', inputs: [ds.id], params: { what: 'area' } });
  assert.equal(geo.ok, true, 'measure refused: ' + geo.why + ' ' + JSON.stringify(geo.detail));
  const gv = data.get(geo.dataset.id).features()[0].properties._areaKm2;
  assert.ok(gv > 30 && gv < 80, 'the geodesic area is not a plausible number: ' + gv);

  const wm = await ops.run({ op: 'measure', inputs: [ds.id], params: { what: 'area', crs: 'EPSG:3857' } });
  assert.equal(wm.ok, true, 'measure on a named plane refused: ' + wm.why + ' ' + JSON.stringify(wm.detail));
  const p = data.get(wm.dataset.id).features()[0].properties;
  const wv = p._areaKm2;
  assert.ok(wv > gv * 3, 'Web Mercator at 60°N did not report its own inflation: ' + wv + ' vs ' + gv);
  /* ⚠ THE DEFECT THIS MEASURES: a value whose caveat is missing. The scale is the kernel's
     measurement over THIS geometry, not a constant written beside the op. */
  assert.ok(p._areaKm2ScaleMin > 3, 'the distortion did not travel with the number: ' + JSON.stringify(p));

  /* ⚠ AND THE FRAME THE DATA IS STORED IN DID NOT MOVE. Everything downstream assumes degrees. */
  assert.equal(data.get(wm.dataset.id).crs, 'EPSG:4326');
});
