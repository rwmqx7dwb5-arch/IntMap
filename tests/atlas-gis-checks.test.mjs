/* ============================================================================
 *  Atlas · the GIS layer as Atlas reaches it (js/gis-atlas.js over js/gis-datasets.js, gis-ops,
 *  gis-layers, gis-sources, gis-raster, gis-warp, gis-crs, gis-project)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from three round files; every test keeps the title it had there
 *  (#R759's titles, which carried no round name, now begin with «#R759»):
 *    · tests/r752-gis-core-checks.test.mjs           — the parts had no floor under them
 *    · tests/r759-gis-pipeline-checks.test.mjs       — acquire → operate → explain as one pipe
 *    · tests/r783-prefetch-catalogue-checks.test.mjs — what is known BEFORE acquiring
 *  Each round built its own world (a fresh window, fresh modules) and still does: the three boot()
 *  helpers are kept apart as boot752 / boot759 / boot783 because they install different collaborators,
 *  and every test builds its own. The window they install is put back after the file.
 * ==========================================================================*/
import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/* (#R763) the acquisition vocabulary, from the module that owns it — see realLayers() below */
import { makeGisLayers } from '../js/gis-layers.js';
import { codeOnly } from '../scripts/code-only.mjs';
import { capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does is its entry in js/atlas-cap-<namespace>.js */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const _saved = { window: globalThis.window };
after(() => { globalThis.window = _saved.window; });

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R752 (formerly tests/r752-gis-core-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
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
function installWindow752() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

async function boot752() {
  const w = installWindow752();
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

const feat752 = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const row = (p) => feat752(null, p);

/* ══ ① データセットの行は、planner が次の op を選べるだけのことを述べる ══════════════════ */

test('R752 ① the row handed to the planner carries the meaning, not just the column names', async () => {
  const { data, atlas } = await boot752();

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
  const { data, atlas } = await boot752();
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
  const { data, atlas, drawn } = await boot752();
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
  const line = (capabilityEntry('map.drawDataset') || {}).schema || '';   /* (atlas-capability-modules) the schema is declared in its entry */
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
  /* kept as a spelling: the claim is about the source itself — that no second list of the vocabulary exists in it, or that the schema line declares a field */
  const src = read('js/gis-project.js');
  /* ⚠ THE DEFECT: `engineNow()` was `{ ops: …, geometry: … }`. js/gis-raster.js and js/gis-warp.js
     were introduced by the SAME ROUND as the record and have never been asked, so a step that
     resampled with bilinear replays through whatever bilinear means today in silence. */
  assert.ok(!/\bfunction engineNow\(\)\s*\{\s*return\s*\{\s*ops:/.test(src),
    'engineNow() names its kernels one at a time again');
  assert.ok(!/const ENGINE_PARTS\s*=\s*\[/.test(src),
    'the parts to compare are a hand-written list again — a part added to engineNow and forgotten there is saved and never compared');

  const w = installWindow752();
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
  /* kept as a spelling: the claim is about the source itself — that no second list of the vocabulary exists in it, or that the schema line declares a field */
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
  const { data, ops } = await boot752();
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
  const { data, ops } = await boot752();
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
  const { data, ops } = await boot752();
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R759 (formerly tests/r759-gis-pipeline-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  #R759 · 取得 → 演算 → 説明 を 1 本に通す（供給の条件・意味の継承）
 * ----------------------------------------------------------------------------
 *  この回が主張したこと。したがって真であり続けなければならないこと:
 *
 *    ① 取得条件の語彙は js/gis-layers.js に 1 つあり、Atlas の扉はそれを「訊く」
 *    ② Atlas 経路が取得条件を実際に下へ渡す（空の {} ではない）
 *    ③ op の無い依頼は「取得」であり、coverage と next が呼び手に届く
 *    ④ 出力の coverage は入力から継承される — 最も弱いものが残る
 *    ⑤ 何も述べていない入力があるとき、`all` とは述べない
 *    ⑥ 名前の残った列の単位は、著者ごと運ばれる
 *    ⑦ 2 つの格子の差は、どちらか一方の時点ではない
 *    ⑧ datasetRow は coverage を「写す」のではなく投影する
 *
 *  ⚠ ①・⑧ は同じ欠陥の 2 面である（[[intmap-two-readers-one-field-list]]）。1 つの契約に
 *  読み手が 2 つあり、片方しか知らない欄は黙って蒸発する。だからこの 2 本は「一覧が 2 つ無いこと」
 *  を測る——欄の値が正しいことではなく、欄の一覧が 1 か所から来ていることを測る。
 * ==========================================================================*/
function installWindow759() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* The one real js/gis-layers.js in this file, built once and asked for the acquisition vocabulary.
   ⚠ It is NOT the stub: everything else here still has to be a stub, because the real door reads
   features off a renderer this process does not have. What it owns is the LIST, and the list is the
   thing two readers must not each keep a copy of ([[intmap-two-readers-one-field-list]]). */
let _realLayers = null;
function realLayers() {
  if (!_realLayers) _realLayers = makeGisLayers();
  return _realLayers;
}

/* The map is a stub, and it RECORDS WHAT IT WAS ASKED — that is the whole of ②. It answers through
   the real registry so the rows it hands back are real records with real provenance. */
function stubLayers(rows) {
  const asked = [];
  return {
    asked,
    /* ⚠⚠⚠ (#R763) THIS USED TO BE THE SECOND LIST THAT ① EXISTS TO FORBID. The stub wrote the
       vocabulary out by hand, so ① — which measures that js/gis-atlas.js has no copy of its own —
       passed while the test file itself held one, and a field added to js/gis-layerss ACQUIRE would
       have been invisible to every assertion here. It is asked for now, from the module that decides
       it, which is the same rule the file under test is being held to. */
    acquireFields: (kind) => realLayers().acquireFields(kind),
    sources: () => rows.map((r) => ({ id: r.id, label: r.label, geometryType: r.geometryType || 'Point', count: (r.features || []).length })),
    canSample: (id) => !!(rows.find((r) => r.id === id) || {}).samplable,
    toDataset: (id, o) => {
      asked.push({ id, opts: o });
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, why: 'layer-unknown', detail: { id: id } };
      const ds = globalThis.window.IntMapData.add({
        title: row.label, features: row.features,
        provenance: { kind: 'layer', layer: id, coverage: row.coverage || { completeness: 'partial', reason: 'extent-undeclared' } },
      });
      const out = { ok: true, dataset: ds };
      if (row.next != null) out.next = row.next;
      return out;
    },
    toRaster: async (id, o) => { asked.push({ id, opts: o, raster: true }); return { ok: false, why: 'layer-not-sampling' }; },
  };
}

async function boot759(layerRows) {
  const w = installWindow759();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const raster = makeGisRaster();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisRaster = raster; w.IntMapGisExpr = makeGisExpr();
  await geometry.ready();
  const layers = stubLayers(layerRows || []);
  w.IntMapGisLayers = layers;
  const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true }) });
  return { w, data, ops, raster, atlas, layers };
}

const feat759 = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt759 = (lng, lat, p) => feat759({ type: 'Point', coordinates: [lng, lat] }, p);

const GRID = { west: 0, north: 10, pixelLng: 1, pixelLat: 1 };
function grid(data, time, extra) {
  const cells = Float64Array.from(data);
  return Object.assign({
    kind: 'raster', title: 't', width: 2, height: 2, grid: GRID,
    bands: [{ name: 'v', unit: null, nodata: null }],
    read: () => cells, time: time || null,
  }, extra || {});
}

/* ══ ① 取得条件の語彙は 1 つで、Atlas はそれを訊く ═══════════════════════════════════════ */

test('#R759 ① js/gis-atlas.js は取得条件の一覧を自分で持たず、js/gis-layers.js に訊く', async () => {
  /* kept as a spelling: the claim is about the source itself — that no second list of the vocabulary exists in it, or that the schema line declares a field */
  const src = read('js/gis-atlas.js');
  assert.ok(/acquireFields\(/.test(src), 'gis-atlas は acquireFields を呼んでいない');
  /* ⚠ 測っているのは「2 つ目の一覧が無いこと」。欄名を並べた配列リテラルがこの file に現れたら、
     それが 2 つ目の一覧である（#R747 の targets はまさにそれで本番の 5 問を全滅させた）。
     `sample` の 3 欄だけは古い綴りの写しとして許す——同じ 3 語が js/gis-layers.js の raster 側に
     在るので、増えも減りもしないことを ② が測る。 */
  /* ⚠ (#729) COMMENTS ARE NOT CODE, AND THIS RULE IS ABOUT CODE. The pattern was run over the raw
     source, so a comment EXPLAINING that a second list was removed — naming the removed literal, the
     way this repository's headers always do — was itself reported as a second list. That is the
     inverse of [[intmap-prose-carriers-are-not-only-markdown]]: a rule about prose must read prose,
     and a rule about what the file DOES must not. Stripping them costs the rule nothing: a list that
     only exists inside a comment is not a list any caller can read. */
  const code = codeOnly(src);
  const lists = code.match(/\[\s*'[a-z]+'(?:\s*,\s*'[a-z]+')+\s*\]/g) || [];
  for (const lit of lists) {
    const names = lit.match(/'[a-z]+'/g).map((s) => s.slice(1, -1));
    const isWindow = names.length === 3 && names.every((n) => ['bounds', 'width', 'height'].indexOf(n) >= 0);
    const isKinds = names.length === 2 && names.indexOf('vector') >= 0 && names.indexOf('raster') >= 0;
    assert.ok(isWindow || isKinds, '取得語彙の 2 つ目の一覧がある: ' + lit);
  }
});

test('#R759 ① 知らない欄は名前で拒まれ、拒否が語彙を運ぶ', async () => {
  const { atlas, layers } = await boot759([{ id: 'heritage', label: 'WHS', features: [pt759(1, 1, { a: 1 })] }]);
  const r = await atlas.run({ inputs: ['layer:heritage'], acquire: { bbox: [0, 0, 1, 1] } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'acquire-unknown-field');
  assert.equal(r.detail.field, 'bbox');
  assert.deepEqual(r.detail.accepts, layers.acquireFields('vector'));
});

/* ══ ② 条件が実際に下へ渡る ═════════════════════════════════════════════════════════════ */

test('#R759 ② Atlas が op を走らせるとき、取得条件がレイヤーの扉まで届く', async () => {
  const { atlas, layers } = await boot759([{ id: 'heritage', label: 'WHS', features: [pt759(1, 1, { m: 5 }), pt759(2, 2, { m: 1 })] }]);
  const want = { bounds: [0, 0, 5, 5], where: [{ field: 'm', op: '>=', value: 2 }], limit: 10, cursor: null, fields: ['m'], time: '1889' };
  const r = await atlas.run({ op: 'filter', inputs: ['layer:heritage'], params: { where: [{ field: 'm', op: '>=', value: 2 }] }, acquire: want });
  assert.equal(r.ok, true, r.why);
  assert.equal(layers.asked.length, 1);
  assert.deepEqual(layers.asked[0].opts, want, 'toDataset に渡った条件が依頼と違う');
});

test('#R759 ② 条件を述べなければ空の要求になる — カメラの箱をこの file が作らない', async () => {
  const { atlas, layers } = await boot759([{ id: 'heritage', label: 'WHS', features: [pt759(1, 1, {})] }]);
  await atlas.run({ inputs: ['layer:heritage'] });
  assert.deepEqual(layers.asked[0].opts, {}, 'この扉は要求を発明してはならない');
});

test('#R759 ② 窓を 2 通りに述べたら拒む（どちらを意味したかは分からない）', async () => {
  const { atlas } = await boot759([{ id: 'dem', label: 'DEM', samplable: true }]);
  const r = await atlas.run({
    op: 'rasterMask', inputs: ['layer:dem'],
    acquire: { bounds: [0, 0, 1, 1], width: 4, height: 4 }, sample: { bounds: [9, 9, 10, 10], width: 4, height: 4 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'window-stated-twice');
});

/* ══ ③ op の無い依頼は取得である ═══════════════════════════════════════════════════════ */

test('#R759 ③ op を述べない依頼は取得で、coverage と next が呼び手に届く', async () => {
  const { atlas } = await boot759([{
    id: 'heritage', label: 'WHS', features: [pt759(1, 1, {})],
    coverage: { completeness: 'partial', reason: 'supplier-page-incomplete', available: 40 },
    next: 'heritage@1',
  }]);
  const r = await atlas.run({ inputs: ['layer:heritage'], acquire: { bounds: [0, 0, 2, 2] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.acquired.length, 1);
  const row = r.acquired[0];
  assert.equal(row.coverage.completeness, 'partial');
  assert.equal(row.coverage.reason, 'supplier-page-incomplete');
  assert.equal(row.coverage.available, 40, 'coverage の欄が途中で落ちている');
  assert.equal(row.next, 'heritage@1', '続きの鍵が呼び手に届いていない');
  assert.equal(row.acquiredFrom, 'layer:heritage');
});

test('#R759 ③ 入力を述べない取得は、何が在るかを添えて拒む', async () => {
  const { atlas } = await boot759([{ id: 'heritage', label: 'WHS', features: [pt759(1, 1, {})] }]);
  const r = await atlas.run({});
  assert.equal(r.ok, false);
  assert.equal(r.why, 'missing-input');
  assert.deepEqual(r.detail.layers, ['layer:heritage']);
});

test('#R759 ③ op を走らせたときも、その途中で取得したものが答えに載る', async () => {
  const { atlas } = await boot759([{ id: 'heritage', label: 'WHS', features: [pt759(1, 1, { m: 5 })], next: 'heritage@1' }]);
  const r = await atlas.run({ op: 'filter', inputs: ['layer:heritage'], params: { where: [{ field: 'm', op: '>=', value: 1 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.acquired.length, 1);
  assert.equal(r.acquired[0].next, 'heritage@1');
});

/* ══ ④⑤ coverage は演算をまたぐ ═════════════════════════════════════════════════════════ */

test('#R759 ④ 出力の coverage は入力から来る — 最も弱いものが残る', async () => {
  const { atlas, ops, data } = await boot759([]);
  const a = data.add({ title: 'a', features: [pt759(1, 1, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'all', reason: null } } });
  const b = data.add({ title: 'b', features: [pt759(2, 2, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'partial', reason: 'limit-truncated' } } });
  const r = await ops.run({ op: 'relate', inputs: [a.id, b.id], params: { predicate: 'nearer-than', maxKm: 5000 } });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.equal(cov.completeness, 'partial');
  assert.equal(cov.reason, 'limit-truncated');
  assert.equal(cov.from, b.id, 'どの入力の判定かが述べられていない');
  assert.equal(cov.derived, true);
  assert.equal(cov.inputs.length, 2);
  /* そして planner に届く */
  const row = atlas.catalogue().datasets.find((d) => d.id === r.dataset.id);
  assert.equal(row.coverage.completeness, 'partial');
  assert.deepEqual(row.coverage.inputs.map((x) => x.completeness).sort(), ['all', 'partial']);
});

test('#R759 ⑤ 何も述べていない入力があるとき `all` とは述べず、開いたままだと言う', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add({ title: 'a', features: [pt759(1, 1, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'all', reason: null } } });
  const b = data.add({ title: 'b', features: [pt759(2, 2, { m: 5 })] });   /* an imported file: nobody measured what it is part of */
  const r = await ops.run({ op: 'relate', inputs: [a.id, b.id], params: { predicate: 'nearer-than', maxKm: 5000 } });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.equal(cov.completeness, undefined, '沈黙を all と読んではならない');
  assert.deepEqual(cov.undeclaredInputs, [b.id]);
});

test('#R759 ⑤ どの入力も何も述べていなければ coverage は作られない', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add({ title: 'a', features: [pt759(1, 1, { m: 5 })] });
  const r = await ops.run({ op: 'filter', inputs: [a.id], params: { where: [{ field: 'm', op: '>=', value: 1 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.provenance.coverage, undefined);
});

/* ══ ⑥ 単位は名前の残った列に付いて回る ═════════════════════════════════════════════════ */

test('#R759 ⑥ 読者が述べた単位は演算の出力にも残り、著者は書き換えられない', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add({ title: 'a', features: [pt759(1, 1, { pop: 5 }), pt759(2, 2, { pop: 1 })] });
  const d = data.declareField(a.id, 'pop', { unit: 'people/km2' });
  assert.equal(d.ok, true, d.why);
  const r = await ops.run({ op: 'filter', inputs: [a.id], params: { where: [{ field: 'pop', op: '>=', value: 2 }] } });
  assert.equal(r.ok, true, r.why);
  const col = r.dataset.fields.find((f) => f.name === 'pop');
  assert.equal(col.unit, 'people/km2');
  assert.equal(col.unitStated, 'inherited', '出力の単位を読者の宣言だと述べてはならない');
  assert.equal(col.unitStatedAt, 'reader');
  assert.equal(col.unitFrom, a.id);
  /* ⚠ 測った型は出力自身のもので、継承は型を上書きしない */
  assert.equal(col.type, 'number');
});

test('#R759 ⑥ 出力に無い列について述べられた単位は、列を発明しない', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add({ title: 'a', features: [pt759(1, 1, { pop: 5 })] });
  data.declareField(a.id, 'pop', { unit: 'people/km2' });
  const r = await ops.run({ op: 'compute', inputs: [a.id], params: { outName: 'twice', expr: 'pop * 2' } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.fields.filter((f) => f.name === 'twice').length, 1);
  const invented = r.dataset.fields.find((f) => f.name === 'nothing');
  assert.equal(invented, undefined);
  /* 新しい列は何も継承しない — その名前について誰も何も述べていない */
  assert.equal(r.dataset.fields.find((f) => f.name === 'twice').unit, undefined);
});

/* ══ ⑦ 2 つの格子の差は、どちらか一方の時点ではない ═══════════════════════════════════════ */

test('#R759 ⑦ 時点の違う 2 つの格子の差は、両方を含む区間になる', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add(grid([4, 4, 4, 4], { kind: 'constant', start: '2020', end: '2020' }));
  const b = data.add(grid([1, 1, 1, 1], { kind: 'constant', start: '2025', end: '2025' }));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time.kind, 'constant');
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2025').end);
  assert.deepEqual(r.dataset.provenance.inputTimes.map((t) => t.id), [a.id, b.id]);
});

test('#R759 ⑦ 片方が時点を述べていなければ、もう片方の日付を答えにしない', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add(grid([4, 4, 4, 4], { kind: 'constant', start: '2020', end: '2020' }));
  const b = data.add(grid([1, 1, 1, 1], null));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time, null, '述べられていない時点を、隣の行から代入してはならない');
  assert.equal(r.dataset.provenance.inputTimes.length, 2);
});

test('#R759 ⑦ 同じ時点の 2 つなら、その時点のまま', async () => {
  const { ops, data } = await boot759([]);
  const t = { kind: 'constant', start: '2020', end: '2020' };
  const a = data.add(grid([4, 4, 4, 4], t));
  const b = data.add(grid([1, 1, 1, 1], { kind: 'constant', start: '2020', end: '2020' }));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2020').end);
});

/* ══ ⑧ datasetRow は coverage を投影する（欄を写さない）═══════════════════════════════════ */

test('#R759 ⑧ coverage に足された欄は、その日のうちに planner へ届く', async () => {
  const { atlas, data } = await boot759([]);
  const a = data.add({
    title: 'a', features: [pt759(1, 1, {})],
    provenance: { kind: 'layer', coverage: { completeness: 'sample', reason: 'grid-is-a-sample', somethingAddedTomorrow: 'x' } },
  });
  const row = atlas.catalogue().datasets.find((d) => d.id === a.id);
  assert.equal(row.coverage.somethingAddedTomorrow, 'x', 'coverage の欄が手書きの一覧で切られている');
});

/* ══ 契約の外側 — 宣言が実装と一致していること ═══════════════════════════════════════════ */

test('#R759 ⑨ data.gis の schema は op を要求せず、acquire を宣言している', async () => {
  /* kept as a spelling: the schema line is the declaration the planner receives; its text IS the declaration */
  const line = (capabilityEntry('data.gis') || {}).schema || '';   /* (atlas-capability-modules) the schema is declared in its entry */
  assert.ok(line, 'data.gis の schema が無い');
  assert.ok(/acquire:\s*obj\(\)/.test(line), 'acquire が宣言されていない＝planner には存在しない');
  assert.ok(/required:\s*\['inputs'\]/.test(line), 'op を要求したままでは取得だけの依頼が送れない');
});

test('#R759 ⑩ planner が読む目録が acquire と coverage を述べている', async () => {
  const src = read('js/atlas-catalog-text.js');
  const i = src.indexOf("ids: ['data.gis'");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf('\n', src.indexOf("t: '", i) + 4000) + 1);
  for (const word of ['"acquire"', 'coverage', 'cursor']) {
    assert.ok(block.indexOf(word) >= 0, '目録が ' + word + ' を述べていない（述べられていない能力は無い能力）');
  }
});

test('#R759 ⑪ 供給元になれると述べた行は、絞り込みを持たない', async () => {
  /* ⚠ 一覧を手で持たない: map-ui.js の宣言そのものを数え上げ、増えたら読み直させる。#R759 の監査
     では 30 の登録のうち述べてよいのは 4 行だけだった（残りは bbox・limit・ページ・時間窓・ズーム・
     視野のいずれかが読み込み経路に在る）。数が動いたら、その行について同じ監査をやり直すこと。 */
  const src = read('js/map-ui.js');
  const declared = (src.match(/holds:\s*\(\)\s*=>/g) || []).length;
  assert.equal(declared, 5, 'holds() を述べる行が増減した — DEV-NOTES.md #R759 の監査をやり直すこと');
  const suppliers = src.split('extent:_HOLDS_WORLD,complete:true,viewBound:false').length - 1;
  assert.equal(suppliers, 3, '供給元になれる行が増減した — その行の読み込み経路を実際に読むこと');
});

/* ══ ⑫ 正規化は冪等 — 自分の出した時点を、自分で読めなくなっていた ═══════════════════════════ */

test('#R759 ⑫ 格子の時点は、その格子から作った格子にも残る（宣言の冪等性）', async () => {
  const { ops, data } = await boot759([]);
  const a = data.add(grid([4, 1, 4, 1], { kind: 'constant', start: '2020', end: '2020' }));
  assert.equal(a.timeRefused, null);
  const r = await ops.run({ op: 'rasterMask', inputs: [a.id], params: { op: '>=', value: 2 } });
  assert.equal(r.ok, true, r.why);
  /* ⚠ 以前はここが null だった。declareTime が「2020」をミリ秒の対にし、そのミリ秒を年として
     読み直そうとして time-unreadable で自分の出力を拒んでいた——時点を述べた格子を一度でも
     処理すると、時点を述べない格子になっていた（誰にも告げられずに）。 */
  assert.equal(r.dataset.timeRefused, null, r.dataset.timeRefused && r.dataset.timeRefused.why);
  assert.deepEqual(r.dataset.time, a.time);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R783 (formerly tests/r783-prefetch-catalogue-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  #R783 · 取得する前に分かることが、取得した後に分かることより薄かった（外部監査 §3.4）
 * ----------------------------------------------------------------------------
 *  実測。js/gis-atlas.js の datasetRow() は取得済みレコードについて、測った列（型・範囲・単位と
 *  その著者）・検証済みの時刻宣言・格子とバンド・取得の coverage 判定を publish する。一方、まだ
 *  取得していない供給元についての行は 5 欄 —— `{ref,label,geometryType,count,samplable}` —— で、
 *  「どれを取得すべきか」を決める側が、取得し終えた側より少ない情報で選んでいた。
 *
 *  この回が主張したこと。したがって真であり続けなければならないこと:
 *
 *    ① 取得前の記述は 5 つの主題（量・時期・範囲・解像度・検索条件）を必ず持つ
 *    ② その値は実在の供給元が述べたものである（この test file が書いた宣言ではない）
 *    ③ 供給元を 1 つ足すと、カタログに自動で現れる（一覧が手書きでないことの証明）
 *    ④ 述べられていない項目は「未申告」として名前で区別され、「該当なし」と混ざらない
 *    ⑤ 宣言された slot は、stated / undeclared / notApplicable のどれか 1 つに必ず入る
 *    ⑥ 既存の 5 欄は 1 つも消えていない（resolveRef が `ref` と `label` で照合する）
 *
 *  ⚠ ② の測り方が、この file の主題である。欄が在ることは測っていない —— 欄の値が
 *  `IntMapGisSources.declarationOf` / `supplierOf` / `conditionOps` と
 *  `IntMapGisLayers.acquireFields` の答えと同じ object であることを測る。fixture に宣言を書いて
 *  「その宣言が返ってきた」を測ると、一緒に作った書き手と読み手が互いについて一致するだけで、
 *  他の誰にも開けない（[[intmap-co-designed-reader-cannot-falsify]]）。だから宣言は登録の中に
 *  置き、判定は実物の module に訊く。
 *  ⚠ そして宣言は「取得の途中で読まれる」のではなく「取得の前に」読まれることを測る:
 *  registration の holds() を差し替えたら、同じ atlas が違う答えを返す（=捕まえていない）。
 * ==========================================================================*/
const WORLD = { w: -180, s: -90, e: 180, n: 90 };
const feat783 = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt783 = (lng, lat, p) => feat783({ type: 'Point', coordinates: [lng, lat] }, p);

/* ⚠ THE REGISTRY IS A STUB AND THE CONTRACT IS NOT. js/map-ui.js needs a DOM this process does not
   have, so the door is rebuilt here with the same shape it publishes — {list, state, featuresIn,
   declarationOf, narrow, sampleAt, loaderOf} — and `holds` is written on the REGISTRATION, exactly
   where a real layer writes it (js/map-ui.js `holds:()=>({extent:_HOLDS_WORLD,complete:true,…})`).
   Everything that READS it below is the real module. */
function makeRegistry() {
  const REG = {};
  return {
    register: (id, impl) => { REG[id] = impl || {}; },
    rows: REG,
    list: () => Object.keys(REG),
    state: (id) => {
      const r = REG[id];
      if (!r) return null;
      const g = (fn, fb) => { try { return r[fn] ? r[fn]() : fb; } catch (_) { return fb; } };
      return { id, on: r.on ? !!r.on() : false, label: g('label', id), time: g('time', null), source: g('source', null), legend: g('legend', null) };
    },
    declarationOf: (id) => {
      const r = REG[id];
      if (!r || r.holds == null) return null;
      try { const d = (typeof r.holds === 'function') ? r.holds() : r.holds; return (d && typeof d === 'object') ? d : null; } catch (_) { return null; }
    },
    featuresIn: (id, bounds) => { const r = REG[id]; if (!r || !r.featuresIn) return null; try { return r.featuresIn(bounds); } catch (_) { return null; } },
    narrow: (all) => all.slice(),
    sampleAt: async (lng, lat, ids) => {
      const use = (ids && ids.length) ? ids : Object.keys(REG);
      return use.filter((id) => REG[id] && REG[id].measure).map((id) => ({ id, asked: true, number: 1, unit: 'm' }));
    },
    loaderOf: (id) => { const r = REG[id]; return (r && typeof r.loader === 'function') ? r.loader : null; },
  };
}

async function boot783() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);

  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');

  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster(); w.IntMapGisExpr = makeGisExpr();
  await geometry.ready();

  const registry = makeRegistry();
  w.IntMapLayers = registry;
  /* ⚠ THE REAL SUPPLY LAYER AND THE REAL MAP BRIDGE. These are the suppliers whose statements the
     description is supposed to be a projection of; a stub in either place would make ② vacuous. */
  const sources = makeGisSources();
  w.IntMapGisSources = sources;
  const layers = makeGisLayers();
  w.IntMapGisLayers = layers;
  const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true }) });
  return { w, data, ops, sources, layers, atlas, registry };
}

/* A bundled document a module holds whole: the shape js/map-ui.js's `heritage`-class rows register. */
function registerWholeWorldRow(registry, id, label) {
  const rows = [pt783(1, 1, { name: 'a', year: 1889 }), pt783(2, 2, { name: 'b', year: 1901 })];
  registry.register(id, {
    label: () => label,
    on: () => true,
    time: () => '1889',
    source: () => 'UNESCO World Heritage Centre',
    holds: () => ({ extent: WORLD, complete: true, viewBound: false, live: false }),
    featuresIn: () => rows.slice(),
  });
  return rows;
}

/* A live row refreshed for the camera: it declares that, and declares no extent. */
function registerViewBoundRow(registry, id, label) {
  registry.register(id, {
    label: () => label,
    on: () => true,
    time: () => '直近 24 h',
    source: () => 'adsb.lol — ODbL 1.0 · ADS-B',
    holds: () => ({ complete: false, viewBound: true, live: true }),
    featuresIn: () => [],
  });
}

/* A field: it answers 「その地点の値は」 and hands no features over, and it says NOTHING about what
   it holds — which is the true state of most rows in this app. */
function registerFieldRow(registry, id, label) {
  registry.register(id, { label: () => label, on: () => true, measure: () => ({ value: 1, unit: 'm' }) });
}

function rowFor(rows, ref) { return rows.find((r) => r.ref === ref) || null; }
function slotsIn(desc) {
  const out = new Map();
  for (const g of Object.keys(desc)) {
    if (g === 'undeclared' || g === 'notApplicable' || g === 'declared') continue;
    const v = desc[g];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    for (const k of Object.keys(v)) out.set(g + '.' + k, v[k]);
  }
  return out;
}

/* ══ ① 5 つの主題が、取得する前に届く ═══════════════════════════════════════════════════════ */

test('R783 ① 取得前の記述は量・時期・範囲・解像度・検索条件の 5 主題を持つ', async () => {
  const { atlas, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');
  registerFieldRow(registry, 'elevation', 'Elevation');

  const subjects = atlas.prefetchSubjects();
  /* 主題の一覧は slot の宣言から導かれる（gis-atlas.js が 2 つ目の一覧を持たないこと）。
     ⚠ ここで英単語を並べて突き合わせると、この test file が 2 つ目の一覧になる。 */
  assert.deepEqual(subjects, atlas.prefetchSlots().map((s) => s.slice(0, s.indexOf('.'))).filter((s, i, a) => a.indexOf(s) === i));
  /* ⚠ (#729) THE FIVE ARE A FLOOR, NOT A COUNT. This read `subjects.length === 5`, and the defect
     #R783 was written against is that the description BEFORE acquiring was THINNER than the one
     after — four of five subjects were missing entirely. A number pinned to the width therefore
     failed the first correct widening: #729 added the governance subjects (where the data came
     from, on what terms, how old, what was measured, which upstream wins) and this line called the
     richer answer a regression. That is a guard for 「the regex hit something」 written as if it were
     the policy ([[intmap-ceiling-guards-are-not-policies]], [[intmap-restate-the-defect-not-the-fix]]).
     What must hold is that none of the five ever goes missing again. */
  for (const g of ['quantity', 'period', 'extent', 'resolution', 'query']) {
    assert.ok(subjects.includes(g), '取得前の記述から主題が消えた: ' + g + ' — いまは ' + subjects.join(','));
  }

  const rows = atlas.catalogue().layers;
  for (const ref of ['layer:heritage', 'layer:elevation']) {
    const row = rowFor(rows, ref);
    assert.ok(row, ref + ' がカタログに無い');
    for (const g of subjects) {
      assert.ok(row[g] && typeof row[g] === 'object', ref + ' に主題 ' + g + ' が無い');
    }
    /* ⚠ 主題が空の object のまま「在る」ことにならないこと: その主題の slot が
       stated / undeclared / notApplicable のどれかに必ず現れる（⑤ が全 slot を測る）。 */
    const named = new Set([...slotsIn(row).keys(), ...row.undeclared.map((u) => u.slot), ...row.notApplicable.map((u) => u.slot)]);
    for (const g of subjects) {
      assert.ok([...named].some((s) => s.indexOf(g + '.') === 0), ref + ' の主題 ' + g + ' に slot が 1 つも無い');
    }
  }
});

test('R783 ① 取得前と取得後の差 — 5 主題は describe() だけが答える', async () => {
  const { atlas, registry, layers, data } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');

  /* 取得前 */
  const before = atlas.describe('layer:heritage');
  assert.ok(before, 'describe が答えていない');
  assert.equal(before.quantity.payload, 'features');
  assert.equal(before.period.statedTime, '1889');
  assert.deepEqual(before.extent.bounds, WORLD);

  /* 取得後 —— datasetRow が答える側。⚠ 取得後にしか分からないものが在ることは欠陥ではない
     （単位は samples が述べる）。測っているのは、取得前に 5 主題が届くことである。 */
  const got = await atlas.acquire({ inputs: ['layer:heritage'] });
  assert.equal(got.ok, true, JSON.stringify(got));
  const after = got.dataset;
  assert.ok(Array.isArray(after.fields) && after.fields.length > 0, '取得後の行に列が無い');
  assert.ok(after.coverage, '取得後の行に coverage が無い');
  assert.ok(data.get(after.id).provenance.coverage, 'レコードに coverage が無い');
  /* ⚠ 取得後の行にも 5 主題は乗らない（そちらは測った事実の行である）。だから取得前の記述が
     無ければ、選ぶ側は選び終わった側より薄い情報で選ぶことになる —— それがこの回の欠陥。 */
  assert.ok(!('resolution' in after) || after.resolution == null, 'datasetRow の形が変わっている');
  void layers;
});

/* ══ ② 値は実在の供給元が述べたもの ═══════════════════════════════════════════════════════ */

test('R783 ② 記述の値は実物の供給元の答えそのもの（この file が書いた宣言ではない）', async () => {
  const { atlas, sources, layers, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');

  const row = atlas.describe('heritage');
  assert.ok(row);

  /* 範囲・完全性・view 依存 — js/gis-sources.js の正規化を通った宣言そのもの */
  const decl = sources.declarationOf('heritage');
  assert.ok(decl, '実物の供給層が宣言を読めていない');
  assert.deepEqual(row.extent.bounds, decl.extent);
  assert.equal(row.extent.complete, decl.complete);
  assert.equal(row.extent.viewBound, decl.viewBound);
  assert.equal(row.period.live, decl.live);
  /* ⚠ 正規化された宣言そのものも運ばれる（readDeclaration が欄を足した翌日に届くため） */
  assert.deepEqual(row.declared, decl);

  /* 検索条件 — 取得語彙は js/gis-layers.js、比較語彙は js/gis-ops.js、能力は供給元自身 */
  assert.deepEqual(row.query.accepts, layers.acquireFields('vector'));
  assert.deepEqual(row.query.conditions, sources.conditionOps());
  assert.deepEqual(row.query.supplier, sources.supplierOf('heritage'));
  assert.ok(row.query.supplier && row.query.supplier.can.where === true, '供給元の能力が届いていない');

  /* 時期・出典 — 登録自身の文。⚠ `1889` は moment として読めるので asOf も立つが、
     読めない文（「直近 24 h」）でも statedTime は届く（次の test）。 */
  assert.equal(row.period.statedTime, registry.state('heritage').time);
  assert.equal(row.quantity.attribution, registry.state('heritage').source);
});

test('R783 ② 宣言は捕まえていない — 登録を書き換えると同じ atlas が違う答えを返す', async () => {
  const { atlas, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');
  assert.deepEqual(atlas.describe('heritage').extent.bounds, WORLD);

  /* 同じ id の登録が、持っているものについての言い方を変えた */
  const narrow = { w: 120, s: 20, e: 150, n: 50 };
  registry.rows.heritage.holds = () => ({ extent: narrow, complete: false, viewBound: false, live: true });

  const again = atlas.describe('heritage');
  assert.deepEqual(again.extent.bounds, narrow, '宣言が読み込み時に捕まえられている');
  assert.equal(again.extent.complete, false);
  assert.equal(again.period.live, true);
});

test('R783 ② moment として読めない時期の文も届く（asOf だけを出すと「時刻が無い」になる）', async () => {
  const { atlas, registry } = await boot783();
  registerViewBoundRow(registry, 'flights', 'Flights');

  const row = atlas.describe('flights');
  assert.ok(row);
  assert.equal(row.period.statedTime, '直近 24 h');
  /* 文は在るが moment ではない ⇒ asOf は「未申告」であって、時期が無いのではない */
  assert.ok(row.undeclared.some((u) => u.slot === 'period.asOf'), 'asOf が未申告として名指されていない');
  assert.ok(!('asOf' in row.period), 'moment でない文が asOf として述べられている');
  /* view 依存であることは、取得する前に分かる —— 世界について何か言う前に分かるべき事実 */
  assert.equal(row.extent.viewBound, true);
  assert.ok(row.undeclared.some((u) => u.slot === 'extent.bounds' && u.why === 'extent-undeclared'));
});

/* ══ ③ 供給元を足すと自動で現れる ═════════════════════════════════════════════════════════ */

test('R783 ③ 供給元を 1 つ足すと、カタログに自動で現れる（一覧が手書きでない）', async () => {
  const { atlas, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');

  const before = atlas.catalogue().layers.map((r) => r.ref);
  assert.ok(before.indexOf('layer:volcanoes') < 0);

  /* atlas は作り終わっている。登録だけを足す。 */
  registerWholeWorldRow(registry, 'volcanoes', 'Volcanoes');
  const after = atlas.catalogue().layers.map((r) => r.ref);
  assert.ok(after.indexOf('layer:volcanoes') >= 0, '足した供給元がカタログに現れない');
  /* そして現れた行は記述済みである（refs だけ増えて記述が空、ではない） */
  const row = rowFor(atlas.catalogue().layers, 'layer:volcanoes');
  for (const g of atlas.prefetchSubjects()) assert.ok(row[g] && typeof row[g] === 'object', '足した行に主題 ' + g + ' が無い');
  assert.deepEqual(row.extent.bounds, WORLD);

  /* ⚠ 描かれていない行も現れる —— 取得はまさにその行のために在る（#R763） */
  registerFieldRow(registry, 'elevation', 'Elevation');
  const withField = rowFor(atlas.catalogue().layers, 'layer:elevation');
  assert.ok(withField, '地物を渡さない行がカタログから落ちている');
  assert.equal(withField.quantity.payload, 'grid');
});

test('R783 ③ 一覧は gis-atlas.js の中に書かれていない', async () => {
  /* kept as a spelling: the claim is about the source itself — that no second list of the vocabulary exists in it, or that the schema line declares a field */
  const src = read('js/gis-atlas.js');
  /* 記述の値は全部「訊いて」得る。訊く先の名前が在ることを測る（値の表が無いことの裏側）。 */
  for (const asked of ['declarationOf', 'supplierOf', 'conditionOps', 'acquireFields', 'canSample']) {
    assert.ok(new RegExp('\\b' + asked + '\\s*\\(').test(src), asked + ' を訊いていない');
  }
  /* ⚠ 主題は slot の接頭辞から導く。主題名を並べた配列リテラルは 2 つ目の一覧である。 */
  assert.ok(!/PREFETCH_SUBJECTS\s*=\s*\[/.test(src), 'PREFETCH_SUBJECTS が手書きの一覧になっている');
});

/* ══ ④⑤ 未申告と該当なしは別、そして全 slot が説明される ═══════════════════════════════════ */

test('R783 ④ 「未申告」と「該当なし」は別の答えで、理由を持つ', async () => {
  const { atlas, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');
  registerFieldRow(registry, 'elevation', 'Elevation');

  const vector = atlas.describe('heritage');
  const field = atlas.describe('elevation');

  /* 該当なし: 地物の複製は解像度を選ばない（格子だけが選ぶ） */
  assert.ok(vector.notApplicable.some((u) => u.slot === 'resolution.chosen'), '地物行に resolution.chosen が該当なしとして無い');
  assert.ok(!('chosen' in vector.resolution));
  /* 格子は選ぶ —— しかも「どの欄を述べればよいか」まで届く（fromLayer が拒む相手そのもの） */
  assert.deepEqual(field.resolution.chosen, ['acquire.bounds', 'acquire.width', 'acquire.height']);

  /* 未申告: 何も述べていない行の範囲は空欄ではなく「誰も述べていない」 */
  const extentSilence = field.undeclared.find((u) => u.slot === 'extent.bounds');
  assert.ok(extentSilence, '宣言の無い行の extent が未申告として名指されていない');
  assert.equal(extentSilence.why, 'extent-undeclared');
  assert.ok(field.undeclared.some((u) => u.slot === 'extent.complete'));

  /* ⚠ 同じ slot が 2 つの答えを持たない。空欄と該当なしを同じにしないための最小条件。 */
  for (const desc of [vector, field]) {
    const un = desc.undeclared.map((u) => u.slot);
    const na = desc.notApplicable.map((u) => u.slot);
    for (const s of un) assert.ok(na.indexOf(s) < 0, s + ' が未申告と該当なしの両方にある');
    for (const u of desc.undeclared.concat(desc.notApplicable)) {
      assert.ok(typeof u.why === 'string' && u.why !== '', u.slot + ' の理由が無い');
    }
  }

  /* ⚠ 単位は取得前には誰も述べていない。欄を出さずに黙るのではなく、そう述べる
     （planner が label から単位を推測するのを止める唯一の手）。 */
  assert.ok(vector.undeclared.some((u) => u.slot === 'quantity.unit' && /samples/.test(u.why)));
});

test('R783 ⑤ 宣言された slot は、必ず 3 つのうち 1 つに入る', async () => {
  const { atlas, registry } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');
  registerViewBoundRow(registry, 'flights', 'Flights');
  registerFieldRow(registry, 'elevation', 'Elevation');

  const declared = atlas.prefetchSlots();
  assert.ok(declared.length > 0);

  for (const row of atlas.catalogue().layers) {
    const stated = slotsIn(row);
    const un = new Set(row.undeclared.map((u) => u.slot));
    const na = new Set(row.notApplicable.map((u) => u.slot));
    for (const slot of declared) {
      const n = (stated.has(slot) ? 1 : 0) + (un.has(slot) ? 1 : 0) + (na.has(slot) ? 1 : 0);
      assert.equal(n, 1, row.ref + ' の ' + slot + ' が ' + n + ' か所にある');
    }
    /* 逆向き: 宣言に無い slot を勝手に足していない（検査から見えない欄を作らない） */
    for (const slot of [...stated.keys(), ...un, ...na]) {
      assert.ok(declared.indexOf(slot) >= 0, row.ref + ' に未宣言の slot ' + slot + ' がある');
    }
  }
});

test('R783 ⑤ 供給層が載っていない環境でも、記述は黙らず理由を述べる', async () => {
  const { atlas, registry, w } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');
  /* 供給層だけを外す —— 「訊けなかった」を「その欄は無い」の代わりにしないこと */
  delete w.IntMapGisSources;

  const row = atlas.describe('heritage');
  assert.ok(row, '供給層が無いと記述そのものが消えている');
  const why = row.undeclared.find((u) => u.slot === 'quantity.payload');
  assert.ok(why, 'payload が未申告として名指されていない');
  assert.equal(why.why, 'supply-layer-unavailable');
  /* 地図の側は生きているので、量の一部は依然として述べられる */
  assert.equal(row.quantity.count, 2);
  assert.equal(row.quantity.name, 'World Heritage');
});

/* ══ ⑦ 1 つの boolean が 4 つの事実を運んでいた（監査 §2.4）═══════════════════════════════ */

test('R783 ⑦ 標本の可否は 4 つの別の欄で届き、未測定は false にならない', async () => {
  const { atlas, sources, registry } = await boot783();
  registerFieldRow(registry, 'elevation', 'Elevation');

  const row = atlas.describe('elevation');
  assert.ok(row);

  /* 供給層が合成した 4 値そのもの —— この file が正解を書かない */
  const ent = sources.list().find((e) => e.id === 'elevation');
  assert.ok(ent && ent.sampling, '供給層が sampling を運んでいない');

  /* ⚠⚠ 能力はまだ誰も測っていない ⇒ false ではなく「未申告」。これが §2.4 の核心。 */
  assert.equal(ent.sampling.capable, null, 'fixture が能力を測ってしまっている');
  const silence = row.undeclared.find((u) => u.slot === 'quantity.sampleCapable');
  assert.ok(silence, '未測定の能力が未申告として名指されていない');
  assert.equal(silence.why, 'sampling-capability-unmeasured');
  assert.ok(!('sampleCapable' in row.quantity), '未測定の能力が値として述べられている');

  /* 残りの 3 つは供給層が述べたとおりに、別々の欄で届く */
  const same = (slot, key) => {
    if (ent.sampling[key] == null) assert.ok(row.undeclared.some((u) => u.slot === slot), slot + ' が未申告でない');
    else assert.equal(row.quantity[slot.slice('quantity.'.length)], ent.sampling[key], slot + ' が供給層の答えと違う');
  };
  same('quantity.samplePrepared', 'prepared');
  same('quantity.sampleAvailable', 'available');
  same('quantity.sampleVisible', 'visible');

  /* ⚠ 既存の欄は消えていない（承認の無い縮小の禁止） */
  assert.ok('samplable' in row, 'samplable が消えている');
  assert.equal(typeof row.samplable, 'boolean');
});

test('R783 ⑦ 表示の on/off は能力の答えを変えない（checkbox は 1 つの欄だけ）', async () => {
  const { atlas, registry } = await boot783();
  registerFieldRow(registry, 'elevation', 'Elevation');
  const on = atlas.describe('elevation');
  assert.equal(on.quantity.sampleVisible, true);
  const capabilityOn = ('sampleCapable' in on.quantity) ? on.quantity.sampleCapable : null;

  /* 同じ登録を消灯する。⚠ 変わってよいのは visible（と、それに依る available）だけ。 */
  registry.rows.elevation.on = () => false;
  const off = atlas.describe('elevation');
  assert.equal(off.quantity.sampleVisible, false);
  const capabilityOff = ('sampleCapable' in off.quantity) ? off.quantity.sampleCapable : null;
  assert.equal(capabilityOff, capabilityOn, '能力の答えが checkbox で動いた');
});

/* ══ ⑥ 既存の欄は 1 つも消えていない ═══════════════════════════════════════════════════════ */

test('R783 ⑥ 既存の 5 欄は残り、resolveRef は今までどおり照合できる', async () => {
  const { atlas, registry, layers } = await boot783();
  registerWholeWorldRow(registry, 'heritage', 'World Heritage');

  const row = rowFor(atlas.catalogue().layers, 'layer:heritage');
  assert.equal(row.ref, 'layer:heritage');
  assert.equal(row.label, 'World Heritage');
  assert.equal(row.geometryType, 'Point');
  assert.equal(row.count, 2);
  /* ⚠ 地図に訊いた答えそのもの（この file が正解を書かない。#R751 の代理述語） */
  assert.equal(row.samplable, layers.canSample('heritage'));

  /* label で名指した入力が解けること（mapRows の行が照合に使われている経路） */
  const r = await atlas.resolve('World Heritage', 0, {}, {});
  assert.equal(r.ok, true, JSON.stringify(r));

  /* 未解決の拒否は今までどおり薄い（一覧が記述で膨らんで planner の予算を食わないこと） */
  const miss = await atlas.resolve('nothing-by-that-name', 0, {}, {});
  assert.equal(miss.ok, false);
  assert.equal(miss.why, 'input-unresolved');
  for (const l of miss.detail.layers) assert.deepEqual(Object.keys(l).sort(), ['label', 'ref']);
});

