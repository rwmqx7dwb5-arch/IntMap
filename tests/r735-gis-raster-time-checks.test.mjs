/* ============================================================================
 *  #R735 · 数値ラスター・時刻の契約・空間索引・中止できる処理
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① a zero-padded cell is a code, not a number — so "01100" and "1100" are not the same row
 *    ② a time declaration is VERIFIED against the data, and a misaligned track axis is refused
 *    ③ a GPX track keeps the time and the height of every fix, aligned with its positions
 *    ④ the registry holds a second payload (a grid), and every vector op refuses one by name
 *    ⑤ the grid ops answer with measured numbers: area-weighted zonal, voids, class areas, a − b
 *    ⑥ the spatial index never drops a pair — measured against the walk it replaced
 *    ⑦ a long step can be stopped, and says where it got to
 *    ⑧ a time window CUTS a trajectory, and the parallel arrays are cut with it
 *    ⑨ clear() does not put the id generator back behind ids that are about to be restored
 *    ⑩ the whole of the reader's job: roads → 500 m → facilities per ward → save → reload → 1 km
 *    ⑪ the layer bridge and the spatial clause are REACHABLE — an export nothing calls is not a feature
 *
 *  ⚠ ① ② ⑥ ⑦ ⑨ ARE DEFECTS THAT WERE MEASURED IN THIS REPOSITORY, not hypotheticals: the padded
 *  code column typed as a number and compared numerically, the track axis that no path verified, the
 *  O(n·m) walk the file itself called 「not a spatial index」, the synchronous loop no signal could
 *  interrupt, and `seq = 0` sitting one line under the comment saying the counter never goes down.
 *
 *  ⚠ ⑤ AND ⑥ COMPARE AGAINST NUMBERS DERIVED FROM GEOMETRY OR FROM THE OTHER CODE PATH, never
 *  against a number this file once saw. A recorded output passes for whatever the code prints
 *  tomorrow; the area of a lat/lon cell and the answer of an exhaustive walk do not move.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r732-gis-geometry-crs-checks: js/geodesy.js publishes onto `window` at top
   level and exports nothing, so it is evaluated the way a browser evaluates it. */
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
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisIndex } = await import('../js/gis-index.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisProject } = await import('../js/gis-project.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const raster = makeGisRaster();
  const index = makeGisIndex();
  const ops = makeGisOps();
  const project = makeGisProject();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster;
  w.IntMapGisIndex = index; w.IntMapGisOps = ops; w.IntMapGisProject = project;
  await geometry.ready();
  return { w, data, geometry, raster, index, ops, project };
}

const R_EARTH_KM = 6371.0088;
const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
const line = (cs, p) => feat({ type: 'LineString', coordinates: cs }, p);
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);

/* The exact area of one lat/lon cell on the sphere: R²·Δλ·(sin φn − sin φs). Nothing here compares
   against a number that was printed once. */
const cellKm2 = (dLngDeg, sDeg, nDeg) =>
  R_EARTH_KM * R_EARTH_KM * (dLngDeg * Math.PI / 180) * (Math.sin(nDeg * Math.PI / 180) - Math.sin(sDeg * Math.PI / 180));

/* A grid of `vals` (row-major, row 0 is the NORTH row) over one degree cells from (west, north). */
function gridSpec(vals, w, h, west, north, step, band) {
  return {
    kind: 'raster', width: w, height: h,
    grid: { west: west, north: north, pixelLng: step, pixelLat: step },
    bands: [band || { name: 'v', unit: null, nodata: null }],
    read: () => Float64Array.from(vals),
  };
}

/* ══ ① 先頭ゼロのセルは符号であって数ではない ═══════════════════════════════════════════════ */

test('R735 ① a zero-padded code column is text, and does not compare equal to the number', async () => {
  const { data, ops } = await boot();

  assert.equal(data.asNumber('01100'), null, '"01100" was still read as a number');
  assert.equal(data.asNumber('00'), null);
  /* ⚠ THE ZERO THAT MEANS SOMETHING SURVIVES. A rule that refused 0, 0.5 or 0e3 would have taken
     arithmetic away from every column that legitimately starts with a zero. */
  assert.equal(data.asNumber('0'), 0);
  assert.equal(data.asNumber('0.5'), 0.5);
  assert.equal(data.asNumber('-0.25'), -0.25);
  assert.equal(data.asNumber('0e3'), 0);

  const ds = data.add({ title: 'codes', features: [pt(0, 0, { cd: '01100', n: '5' }), pt(1, 1, { cd: '01101', n: '6' })] });
  const cd = ds.fields.find((f) => f.name === 'cd');
  assert.equal(cd.type, 'text', 'the code column typed as a number again');
  assert.equal(cd.padded, 2, 'the evidence for the verdict was not carried');
  assert.equal(ds.fields.find((f) => f.name === 'n').type, 'number', 'an ordinary number column stopped being one');

  /* The defect that mattered: the comparison. `"01100" == 1100` was TRUE, because both sides went
     through asNumber. A join or a filter on a municipality code hit the wrong row. */
  const r = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: [{ field: 'cd', op: '==', value: '1100' }] } });
  assert.equal(r.ok, true);
  assert.equal(r.dataset.count, 0, '"01100" still matched "1100"');
  const r2 = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: [{ field: 'cd', op: '==', value: '01100' }] } });
  assert.equal(r2.dataset.count, 1, 'the code no longer matches itself');
});

/* ══ ② 時刻の宣言は検証される ═══════════════════════════════════════════════════════════════ */

test('R735 ② a time declaration is verified, and one that does not hold is refused by name', async () => {
  const { data } = await boot();

  const inst = data.add({ title: 'i', features: [pt(0, 0, { y: '1889' }), pt(1, 1, { y: '1890-06' })], time: { kind: 'instant', field: 'y' } });
  assert.equal(inst.time.kind, 'instant');
  assert.equal(inst.timeRefused, null);
  /* ⚠ A BARE YEAR IS THE WHOLE YEAR. asDate would answer 1889-01-01T00:00:00Z — one millisecond —
     and a window of 「1889 年」 would then miss almost everything stamped 1889. */
  const span = data.timeSpan(inst, inst.features()[0]);
  assert.equal(new Date(span.start).toISOString().slice(0, 10), '1889-01-01');
  assert.equal(new Date(span.end).toISOString().slice(0, 10), '1889-12-31');

  /* ⚠ NOT Date.UTC: a year below 100 must not be moved into the twentieth century (#R602). */
  const early = data.momentOf(5);
  assert.equal(new Date(early.start).getUTCFullYear(), 5, 'the year 5 was read as 1905');
  assert.ok(data.momentOf(-200).start < data.momentOf(1).start, 'a BC year is not expressible');

  const missing = data.add({ title: 'm', features: [pt(0, 0, { a: 1 })], time: { kind: 'instant', field: 'when' } });
  assert.equal(missing.time, null);
  assert.equal(missing.timeRefused.why, 'time-field-missing');

  const unreadable = data.add({ title: 'u', features: [pt(0, 0, { y: '明治22年' })], time: { kind: 'instant', field: 'y' } });
  assert.equal(unreadable.time, null);
  assert.equal(unreadable.timeRefused.why, 'time-unreadable');

  /* The one that cannot be taken on trust: a parallel array is a time axis only while its length is
     the number of positions. js/geodesy.js sanitizeFeatures can drop a position. */
  const ok = data.add({
    title: 't', time: { kind: 'track', timesField: 'coordTimes' },
    features: [line([[0, 0], [1, 1], [2, 2]], { coordTimes: ['2020-01-01', '2020-01-02', '2020-01-03'] })],
  });
  assert.equal(ok.time.kind, 'track');
  const bad = data.add({
    title: 'b', time: { kind: 'track', timesField: 'coordTimes' },
    features: [line([[0, 0], [1, 1], [2, 2]], { coordTimes: ['2020-01-01', '2020-01-02'] })],
  });
  assert.equal(bad.time, null, 'a misaligned axis was accepted');
  assert.equal(bad.timeRefused.why, 'time-track-misaligned');
  assert.equal(bad.timeRefused.detail.positions, 3);
  assert.equal(bad.timeRefused.detail.times, 2);

  /* A grid has no features, so only the whole-dataset shape can apply to one. */
  const ras = data.add(Object.assign(gridSpec([1, 2, 3, 4], 2, 2, 0, 2, 1), { title: 'g', time: { kind: 'instant', field: 'y' } }));
  assert.equal(ras.time, null);
  assert.equal(ras.timeRefused.why, 'time-kind-not-for-raster');
});

/* ══ ③ GPX の点ごとの時刻と標高 ═════════════════════════════════════════════════════════════ */

test('R735 ③ a GPX track keeps every fix\'s time and height, and the arrays stay aligned', () => {
  /* ⚠ THE DECODER IS READ, NOT RUN: js/geo-import.js needs a DOMParser and a File. What is measured
     is the thing the old code did wrong — the position was pushed and the time was not — plus the
     claim that the axis is declared to the registry rather than guessed downstream. */
  const src = read('js/geo-import.js');
  const gpx = src.slice(src.indexOf('function decodeGPX'), src.indexOf("function fc(features)"));
  assert.ok(/const pts = \[\], times = \[\], eles = \[\]/.test(gpx), 'the per-fix arrays are gone');
  /* The position and its timestamp are pushed in the SAME branch — that is what keeps them aligned
     through a repair that drops positions. */
  const branch = gpx.slice(gpx.indexOf('const c = at(k);'), gpx.indexOf('const owner ='));
  assert.ok(/pts\.push\(c\)/.test(branch) && /times\.push\(/.test(branch) && /eles\.push\(/.test(branch),
    'the time or the height is pushed outside the branch that accepted the position');
  assert.ok(/if \(!c\) continue;/.test(branch), 'a refused position no longer skips its timestamp');
  assert.ok(/time: time/.test(gpx) && /kind: 'track'/.test(gpx), 'the decoder no longer declares the axis it found');

  /* ⚠ HEIGHT IS BESIDE THE COORDINATES, NOT INSIDE THEM, and this is why: the shared repair every
     import lands in rebuilds each position as a PAIR. A third ordinate would be silently dropped. */
  const sanitize = read('js/geodesy.js');
  assert.ok(/fixPos=p=>\(Array\.isArray\(p\)&&isFinite\(p\[0\]\)&&isFinite\(p\[1\]\)\)\?\[p\[0\],/.test(sanitize),
    'sanitizeFeatures no longer rebuilds positions as pairs — re-check where elevation should live');

  /* KML's gx:Track is the same thing in another format, and it walked past its <when> elements. */
  const kml = src.slice(src.indexOf("if (name === 'track')"), src.indexOf("if (name === 'multigeometry'"));
  assert.ok(/localName\(k\) === 'when'/.test(kml), 'gx:Track still ignores the time of each fix');
  assert.ok(/TRACK_TIMES/.test(kml) && /TRACK_ELE/.test(kml), 'gx:Track carries its axis under a different spelling');

  /* One spelling, named once: two would be a track whose times nothing can find. */
  assert.equal((src.match(/'coordTimes'/g) || []).length, 1, 'coordTimes is spelt in more than one place');
});

/* ══ ④ レジストリの第2の payload ════════════════════════════════════════════════════════════ */

test('R735 ④ a grid is a dataset, and the vector ops refuse one by name', async () => {
  const { data, ops } = await boot();

  const g = data.add(gridSpec([1, 2, 3, 4], 2, 2, 0, 2, 1, { name: 'elev', unit: 'm', nodata: -9999 }));
  assert.equal(g.kind, 'raster');
  assert.equal(g.count, 4);
  /* The bands ARE the columns, which is what makes 「どのバンドで」 the same control as 「どの列で」. */
  assert.deepEqual(g.fields.map((f) => f.name), ['elev']);
  assert.equal(g.fields[0].type, 'number');
  /* describe() is what the panel and the save file read: the payload doors are not in it. */
  const d = data.describe(g.id);
  assert.equal(d.read, undefined);
  assert.equal(d.raster, undefined);
  assert.equal(d.width, 2);

  /* A grid that is not a grid is refused at the last place that can still say no. */
  for (const broken of [{ width: 0 }, { height: 1.5 }, { grid: { west: 0, north: 2, pixelLng: 0, pixelLat: 1 } }, { read: null }, { bands: [] }]) {
    const spec = Object.assign(gridSpec([1], 1, 1, 0, 1, 1), broken);
    assert.throws(() => data.add(spec), /raster/, 'a broken grid was registered: ' + JSON.stringify(Object.keys(broken)));
  }

  /* ⚠ EVERY OP WRITTEN BEFORE GRIDS EXISTED REFUSES ONE, and it refuses it for the right reason.
     Without `kinds` they would have walked a features() that is not there. */
  const pts = data.add({ title: 'p', features: [pt(0.5, 1.5, {})] });
  for (const op of ['filter', 'buffer', 'dissolve']) {
    const r = await ops.run({ op: op, inputs: [g.id], params: { radiusKm: 1, where: [] } });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'input-kind', op + ' did not refuse a grid by name');
    assert.equal(r.detail.expected, 'vector');
  }
  /* And the grid ops refuse a vector in the slot that needs a grid. */
  const r2 = await ops.run({ op: 'zonal', inputs: [pts.id, pts.id], params: { stat: 'mean' } });
  assert.equal(r2.why, 'input-kind');
  assert.equal(r2.detail.input, 1);
});

/* ══ ⑤ 格子の算術は測った数で確かめる ═══════════════════════════════════════════════════════ */

test('R735 ⑤ the grid ops answer measured numbers: weighted zonal, voids, classes, a − b', async () => {
  const { data, ops, raster } = await boot();

  /* Two rows of 30°, 30–60N and 0–30N, one cell each. ⚠ THE BANDS ARE THAT TALL ON PURPOSE: adjacent
     one-degree rows differ in area by about 2 %, and a weighted mean that close to the flat mean would
     pass whether the weighting were there or not. These two differ by 27 %, so the test can tell. */
  const g = data.add(gridSpec([100, 0], 1, 2, 0, 60, 30, { name: 'v', unit: null, nodata: null }));
  /* ⚠ THE ZONE COVERS THE WHOLE COLUMN. gridSpec uses one step for both axes, so this grid's single
     column spans 0–30E and its pixel centres are at 15E: a zone 1° wide would contain no pixel centre
     at all, and the op would honestly answer 0 — measuring the fixture rather than the arithmetic. */
  const zone = data.add({ title: 'z', features: [poly([box(0, 0, 30, 60)], { name: 'both' })] });
  const rz = await ops.run({ op: 'zonal', inputs: [zone.id, g.id], params: { stat: 'mean' } });
  assert.equal(rz.ok, true, 'zonal refused: ' + rz.why);
  const row = rz.dataset.features()[0].properties;
  const aN = cellKm2(30, 30, 60), aS = cellKm2(30, 0, 30);
  const want = (100 * aN + 0 * aS) / (aN + aS);
  assert.ok(Math.abs(row.mean_v - want) < 1e-6, 'the zonal mean is not area-weighted (' + row.mean_v + ' vs ' + want + ')');
  assert.ok(Math.abs(row.mean_v - 50) > 5, 'the weighted mean is indistinguishable from the flat mean — the test measures nothing');
  assert.equal(row._pixels, 2);
  assert.equal(row._pixelsNodata, 0);
  /* ⚠ COVERAGE IS ON THE ROW. `_gridAreaKm2` is the zone as the grid resolves it and `_valueAreaKm2`
     the part that carried a value: the two being different IS 「一部だけ」, and reporting one of them
     is the shape the memory note 「被覆を件数で報告すると『一部だけ』が見えない」 records. */
  assert.ok(Math.abs(row._valueAreaKm2 - (aN + aS)) / (aN + aS) < 1e-9);

  /* A void is not a zero. */
  const holes = data.add(gridSpec([100, NaN], 1, 2, 0, 60, 30));
  const rh = await ops.run({ op: 'zonal', inputs: [zone.id, holes.id], params: { stat: 'mean' } });
  const hrow = rh.dataset.features()[0].properties;
  assert.equal(hrow.mean_v, 100, 'a void was averaged in as a number');
  assert.equal(hrow._pixelsNodata, 1);
  assert.ok(hrow._valueAreaKm2 < hrow._gridAreaKm2, 'the void did not reduce the area that carried a value');

  /* Areas per class need codes, and a grid of measurements is refused rather than rounded. */
  const codes = data.add(gridSpec([1, 2], 1, 2, 0, 60, 30));
  const rc = await ops.run({ op: 'zonal', inputs: [zone.id, codes.id], params: { stat: 'classes' } });
  const cls = rc.dataset.features()[0].properties.classes_v;
  assert.ok(Math.abs(cls['1'] - aN) / aN < 1e-9, 'the class area is not the pixel area');
  const frac = data.add(gridSpec([1.5, 2.5], 1, 2, 0, 60, 30));
  const rf = await ops.run({ op: 'zonal', inputs: [zone.id, frac.id], params: { stat: 'classes' } });
  assert.equal(rf.ok, false);
  assert.equal(rf.why, 'values-not-integer');

  /* 地点値の取得: three answers, three different truths. */
  const pts = data.add({ title: 'p', features: [pt(0.5, 45, { id: 'in' }), pt(50, 50, { id: 'off' })] });
  const rs = await ops.run({ op: 'sample', inputs: [pts.id, holes.id], params: { band: 'v' } });
  assert.equal(rs.ok, true, 'sample refused: ' + rs.why);
  const got = rs.dataset.features().map((f) => f.properties);
  assert.equal(got[0].v, 100);
  assert.equal(got[1].v, null);
  assert.equal(got[1]._sampleOutside, true, 'a point off the grid is indistinguishable from a void');
  assert.equal(rs.stats.outside, 1);

  /* 条件による抽出 and 時期同士の差分, and the output of one is the input of the next. */
  const rm = await ops.run({ op: 'rasterMask', inputs: [g.id], params: { op: '>=', value: '50' } });
  assert.equal(rm.ok, true, 'rasterMask refused: ' + rm.why);
  assert.equal(rm.dataset.kind, 'raster');
  assert.equal(rm.stats.kept, 1);
  assert.equal(rm.stats.dropped, 1);
  const after = await ops.run({ op: 'zonal', inputs: [zone.id, rm.dataset.id], params: { stat: 'count' } });
  assert.equal(after.dataset.features()[0].properties.count_v, 1, 'the masked grid is not usable as an input');

  const other = data.add(gridSpec([40, 0], 1, 2, 0, 60, 30));
  const rd = await ops.run({ op: 'rasterDiff', inputs: [g.id, other.id], params: {} });
  assert.equal(rd.ok, true, 'rasterDiff refused: ' + rd.why);
  assert.equal(rd.dataset.read(0)[0], 60);
  /* ⚠ TWO GRIDS THAT ARE NOT THE SAME GRID ARE NOT RESAMPLED IN SILENCE. */
  const shifted = data.add(gridSpec([1, 2], 1, 2, 0.5, 60, 30));
  const rbad = await ops.run({ op: 'rasterDiff', inputs: [g.id, shifted.id], params: {} });
  assert.equal(rbad.ok, false);
  assert.equal(rbad.why, 'grid-mismatch');

  /* One cell of the whole sphere is the sphere: the kernel's area is the closed form, not a plane. */
  const whole = raster.pixelAreaKm2({ width: 1, height: 1, bands: [{}], grid: { west: -180, north: 90, pixelLng: 360, pixelLat: 180 }, read: () => [0] }, 0);
  assert.equal(whole.ok, true);
  assert.ok(Math.abs(whole.km2 - 4 * Math.PI * R_EARTH_KM * R_EARTH_KM) / whole.km2 < 1e-9, 'the pixel area is not spherical');
});

/* ══ ⑥ 索引は取りこぼさない ═════════════════════════════════════════════════════════════════ */

test('R735 ⑥ the spatial index hands the predicate the same set the exhaustive walk did', async () => {
  const { data, ops, index, w } = await boot();

  /* A deterministic scatter, plus the two shapes that break a naive grid: something that crosses the
     antimeridian and something that covers the world. */
  let seed = 20260915;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const members = [];
  for (let i = 0; i < 600; i++) {
    const x = -180 + rnd() * 360, y = -80 + rnd() * 160;
    members.push(pt(x, y, { v: 1 }));
  }
  members.push(line([[170, 10], [-170, 12]], { v: 1 }));
  /* ⚠ ONE MEMBER ON EACH SIDE OF THE SEAM, and a zone below whose box reaches across it the other
     way round: a grid that reads a crossing box as one range keeps the near half and drops the far
     one, and this is the member that half holds. Without it the seam is in the fixture and not in the
     answer, so a dropped range would be invisible. */
  members.push(pt(-178, 10, { v: 1 }));
  members.push(pt(178, 10, { v: 1 }));
  const zones = [];
  for (let i = 0; i < 24; i++) {
    const x = -180 + i * 15, y = -60 + (i % 5) * 20;
    zones.push(poly([box(x, y, x + 14, y + 15)], { id: 'z' + i }));
  }
  zones.push(poly([box(175, 5, 185, 15)], { id: 'seam' }));
  zones.push(poly([box(-185, 5, -175, 15)], { id: 'seam-west' }));

  const mDs = data.add({ title: 'm', features: members });
  const zDs = data.add({ title: 'z', features: zones });

  const withIndex = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
  assert.equal(withIndex.ok, true, 'aggregate refused: ' + withIndex.why);

  /* ⚠ THE SAME RUN WITH THE INDEX TAKEN AWAY. That is the only comparison that can catch a dropped
     pair: a count is not wrong-looking, it is just smaller. */
  const kernel = w.IntMapGisIndex;
  w.IntMapGisIndex = null;
  const without = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
  w.IntMapGisIndex = kernel;
  assert.equal(without.ok, true);

  const a = withIndex.dataset.features().map((f) => f.properties.count);
  const b = without.dataset.features().map((f) => f.properties.count);
  assert.deepEqual(a, b, 'the indexed aggregate and the exhaustive one disagree — the index drops pairs');
  assert.ok(a.reduce((s, n) => s + n, 0) > 0, 'nothing was counted either way — the test measures nothing');

  /* And the same for the predicate that measures a distance, where the index is asked with a pad. */
  const withIx = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'nearer-than', maxKm: 400 } });
  w.IntMapGisIndex = null;
  const withoutIx = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'nearer-than', maxKm: 400 } });
  w.IntMapGisIndex = kernel;
  assert.equal(withIx.dataset.count, withoutIx.dataset.count, 'the padded query drops pairs');
  assert.ok(withIx.dataset.count > 0);

  /* ⚠ AND THE SAME FOR clip, WHICH THE FILE'S OWN NOTE ALSO NAMED. A subject clipped by 25 windows
     is the same loop, and an index that drops a window silently returns a shape that was never cut. */
  const clipped = await ops.run({ op: 'clip', inputs: [mDs.id, zDs.id], params: {} });
  w.IntMapGisIndex = null;
  const clippedFlat = await ops.run({ op: 'clip', inputs: [mDs.id, zDs.id], params: {} });
  w.IntMapGisIndex = kernel;
  assert.equal(clipped.ok, true, 'clip refused: ' + clipped.why);
  assert.equal(clipped.dataset.count, clippedFlat.dataset.count, 'the indexed clip keeps a different number of pieces');
  assert.ok(clipped.dataset.count > 0);

  /* The index itself reports whether it is one: everything in one bucket behaves like an index from
     the outside, only slower. */
  const ix = index.build(members.map((f) => ({ bbox: [f.geometry.coordinates[0] || 0, f.geometry.coordinates[1] || 0, f.geometry.coordinates[0] || 0, f.geometry.coordinates[1] || 0] })));
  const st = index.stats(ix);
  assert.ok(st.cells > 1, 'every item landed in one cell');
  assert.ok(st.maxPerCell < members.length, 'one cell holds everything');
});

/* ══ ⑦ 中止できる ══════════════════════════════════════════════════════════════════════════ */

test('R735 ⑦ a long step can be stopped, and it says where it got to', async () => {
  const { data, ops } = await boot();

  const zones = [], members = [];
  for (let i = 0; i < 400; i++) { const x = -170 + (i % 340); zones.push(poly([box(x, 0, x + 0.5, 0.5)], { i: i })); }
  for (let i = 0; i < 400; i++) { members.push(pt(-170 + (i % 340) + 0.25, 0.25, { v: 1 })); }
  const zDs = data.add({ title: 'z', features: zones });
  const mDs = data.add({ title: 'm', features: members });

  /* ⚠ ABORTED BEFORE IT STARTS IS THE CASE A SYNCHRONOUS LOOP COULD NOT ANSWER EITHER. The old code
     would have completed the whole run and registered the result. */
  const ac = new AbortController();
  ac.abort();
  const stopped = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } }, { signal: ac.signal });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.why, 'cancelled');
  assert.equal(stopped.detail.total, 400);
  /* Nothing was registered: a cancelled step must not leave half an answer behind. */
  assert.equal(data.list().length, 2, 'a cancelled run registered a dataset');

  /* And a run that is stopped PART WAY. The signal is read at the yield, so this needs a real one. */
  const ac2 = new AbortController();
  let seen = 0;
  const part = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'intersects' } }, {
    signal: ac2.signal,
    onProgress: (p) => { seen = p.done; if (p.done > 0) ac2.abort(); },
  });
  if (part.ok === false) {
    assert.equal(part.why, 'cancelled');
    assert.ok(part.detail.done > 0, 'it stopped before doing anything, so progress was never reported');
  }
  assert.ok(seen >= 0);

  /* An uninterrupted run still answers, and progress is a report rather than a requirement. */
  const done = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
  assert.equal(done.ok, true);
  assert.equal(done.dataset.count, 400);
});

/* ══ ⑧ 時間の窓は軌跡を切る ═════════════════════════════════════════════════════════════════ */

test('R735 ⑧ a time window cuts a trajectory, and the parallel arrays are cut with it', async () => {
  const { data, ops } = await boot();

  const trace = data.add({
    title: 'ride', time: { kind: 'track', timesField: 'coordTimes', elevationField: 'coordEle' },
    features: [line([[0, 0], [1, 0], [2, 0], [3, 0]], {
      coordTimes: ['2020-05-01T16:30:00Z', '2020-05-01T17:10:00Z', '2020-05-01T17:50:00Z', '2020-05-01T18:30:00Z'],
      coordEle: [10, 20, 30, 40],
    })],
  });
  assert.equal(trace.time.kind, 'track');

  const r = await ops.run({ op: 'timeWindow', inputs: [trace.id], params: { from: '2020-05-01T17:00:00Z', to: '2020-05-01T18:00:00Z' } });
  assert.equal(r.ok, true, 'timeWindow refused: ' + r.why);
  const f = r.dataset.features()[0];
  assert.equal(f.geometry.coordinates.length, 2, 'the whole ride came back instead of the hour asked for');
  assert.deepEqual(f.geometry.coordinates, [[1, 0], [2, 0]]);
  /* ⚠ THE ARRAYS WERE CUT WITH IT. A line whose positions were filtered while its times were not is a
     trace where every timestamp sits on the wrong fix — and the registry measures exactly that, so a
     failure here shows up as a REFUSED declaration on the output. */
  assert.equal(f.properties.coordTimes.length, 2);
  assert.deepEqual(f.properties.coordEle, [20, 30]);
  assert.equal(r.dataset.time.kind, 'track', 'the output lost its axis: ' + JSON.stringify(r.dataset.timeRefused));
  assert.equal(r.dataset.timeRefused, null);

  /* The attribute shapes select rather than cut, and an undated row is dropped and COUNTED. */
  const events = data.add({
    title: 'e', time: { kind: 'interval', startField: 'from', endField: 'to' },
    features: [
      poly([box(0, 0, 1, 1)], { name: 'a', from: '1870', to: '1890' }),
      poly([box(2, 2, 3, 3)], { name: 'b', from: '1900', to: '1910' }),
      poly([box(4, 4, 5, 5)], { name: 'c' }),
    ],
  });
  const rv = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1889', to: '1889' } });
  assert.equal(rv.dataset.count, 1);
  assert.equal(rv.dataset.features()[0].properties.name, 'a');
  assert.equal(rv.stats.undated, 1, 'a row nobody dated was kept or lost without being counted');

  /* `within` is a different question from `overlaps`, and both are asked of the same axis. */
  const rw = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1860', to: '1895', mode: 'within' } });
  assert.equal(rw.dataset.count, 1);
  const rw2 = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1880', to: '1885', mode: 'within' } });
  assert.equal(rw2.dataset.count, 0, 'a span that merely overlaps was reported as contained');

  /* A dataset that never declared an axis is refused BY NAME, not filtered on a guess. */
  const plain = data.add({ title: 'p', features: [pt(0, 0, { y: '1889' })] });
  const rp = await ops.run({ op: 'timeWindow', inputs: [plain.id], params: { from: '1889' } });
  assert.equal(rp.ok, false);
  assert.equal(rp.why, 'time-not-declared');

  /* ⚠ A BUFFER OF A TRACE IS A POLYGON, and the 4,000 timestamps describe fixes it no longer has. */
  const rb = await ops.run({ op: 'buffer', inputs: [trace.id], params: { radiusKm: 5 } });
  assert.equal(rb.ok, true, 'buffer refused: ' + rb.why);
  assert.equal(rb.dataset.time, null, 'a per-position axis was claimed for a geometry with other positions');
  assert.equal(rb.dataset.timeRefused, null, 'the axis was carried and then refused, instead of not being claimed');
});

/* ══ ⑨ clear() は採番を巻き戻さない ═════════════════════════════════════════════════════════ */

test('R735 ⑨ clear() does not put the id generator back behind ids that are about to be restored', async () => {
  const { data } = await boot();
  const a = data.add({ title: 'a', features: [] });
  const b = data.add({ title: 'b', features: [] });
  assert.equal(a.id, 'ds-1');
  assert.equal(b.id, 'ds-2');

  /* This is what js/gis-project.js load() does: empty the registry, then restore saved records BY
     NAME. A counter that went back to 0 would generate `ds-1` again for the next import. */
  data.clear();
  const next = data.add({ title: 'c', features: [] });
  assert.notEqual(next.id, 'ds-1', 'the counter was reset and reissued an id that a saved project names');
  assert.equal(next.id, 'ds-3');

  const src = read('js/gis-datasets.js');
  assert.ok(!/clear:.*seq = 0/.test(src), 'clear() zeroes the counter again');
});

/* ══ ⑩ 利用者の仕事ひとつ、端から端まで ═════════════════════════════════════════════════════ */

test('R735 ⑩ roads → 500 m → facilities per ward → save → reload → 1 km, same layer', async () => {
  const { data, ops, project } = await boot();

  /* A road, two wards, and five facilities — two of them within 500 m of the road, two more within
     1 km, one far away. The distances are the ones geodesy gives, so nothing here is a recorded
     number: 0.005° of latitude is ~556 m, 0.01° is ~1.11 km. */
  const roads = data.add({ title: 'roads', features: [line([[0, 0], [0.2, 0]], { ref: 'R1' })] });
  const wards = data.add({
    title: 'wards', features: [
      poly([box(-0.05, -0.05, 0.1, 0.05)], { name: 'west', cd: '01100' }),
      poly([box(0.1, -0.05, 0.25, 0.05)], { name: 'east', cd: '01101' }),
    ],
  });
  const fac = data.add({
    title: 'facilities', features: [
      pt(0.02, 0.002, { name: 'near-w' }),        /* ~222 m  */
      pt(0.15, 0.003, { name: 'near-e' }),        /* ~333 m  */
      pt(0.05, 0.007, { name: 'mid-w' }),         /* ~778 m  */
      pt(0.18, 0.008, { name: 'mid-e' }),         /* ~889 m  */
      pt(0.05, 0.04, { name: 'far' }),            /* ~4.4 km */
    ],
  });

  /* ⚠ THE DISTANCE IS FROM THE ROAD ITSELF. A bounding-box centre cannot answer this, which is the
     part of the reader's sentence that the old code could not do at all. */
  const near = await ops.run({ id: 'near', op: 'relate', inputs: [fac.id, roads.id], params: { predicate: 'nearer-than', maxKm: 0.5 } });
  assert.equal(near.ok, true, 'relate refused: ' + near.why);
  assert.deepEqual(near.dataset.features().map((f) => f.properties.name).sort(), ['near-e', 'near-w']);

  const byWard = await ops.run({ id: 'byWard', op: 'aggregate', inputs: [wards.id, 'near'], params: { stat: 'count' } });
  assert.equal(byWard.ok, true, 'aggregate refused: ' + byWard.why);
  const counts = {};
  for (const f of byWard.dataset.features()) counts[f.properties.name] = f.properties.count;
  assert.deepEqual(counts, { west: 1, east: 1 });
  /* The ward code came through as a code, not as a number that lost its leading zero. */
  assert.equal(byWard.dataset.features()[0].properties.cd, '01100');

  /* ⚠ THE CHAIN IS A RECIPE, WHICH IS WHAT MAKES THE LAST STEP OF THE SENTENCE POSSIBLE. */
  /* ⚠ (#R765) THE RECIPE IS ASSERTED FIELD BY FIELD, not as the whole object. It used to be a
     deepEqual, which says 「このレシピである」 and ALSO 「provenance にはこれ以外の欄が無い」 — and
     the second half is not what this test is about. #R765 added `engine`: the record now states
     which kernels computed it, stamped as it ran. Asserting the object whole would make every
     truthful addition to a record's own account of itself look like a regression here. */
  const prov = data.describe('byWard').provenance;
  assert.equal(prov.kind, 'op');
  assert.equal(prov.op, 'aggregate');
  assert.deepEqual(prov.inputs, [wards.id, 'near']);
  assert.deepEqual(prov.params, { stat: 'count' });
  /* and the engine that ran it is recorded, because it was mounted (#R765) */
  assert.ok(prov.engine && prov.engine.ops, 'the record does not say which engine computed it');
  assert.deepEqual(data.lineage('byWard').map((r) => r.id), [wards.id, fac.id, roads.id, 'near', 'byWard']);

  /* 「距離だけ変更して、同じ結果レイヤーまで更新できる」 — under the same ids, so a map layer and a
     query pointing at `byWard` simply see new contents. IndexedDB is absent in Node, so what is
     measured here is the recomputation itself; ⑤ of tests/r729-gis-core-checks covers the store. */
  const again = await project.setParams('near', { predicate: 'nearer-than', maxKm: 1.0 });
  assert.equal(again.ok, true, 'setParams failed: ' + JSON.stringify(again.failed || again.why));
  assert.deepEqual(again.rebuilt, ['near', 'byWard'], 'the downstream step was not re-run');
  const after = {};
  for (const f of data.get('byWard').features()) after[f.properties.name] = f.properties.count;
  assert.deepEqual(after, { west: 2, east: 2 }, 'the 1 km answer is not the 1 km answer');
  assert.equal(data.get('byWard').stale, null, 'a successful rebuild left the record marked stale');

  /* And a parameter the op refuses leaves the chain where it was, marked — #R732's guarantee, now
     also over a chain this round can build. */
  const bad = await project.setParams('near', { predicate: 'nearer-than', maxKm: -5 });
  assert.equal(bad.ok, false);
  assert.ok(data.get('near'), 'the record being edited was deleted by a refused parameter');
  assert.ok(data.get('byWard').stale, 'the downstream result was left looking current');
});

/* ══ ⑪ 到達できること ══════════════════════════════════════════════════════════════════════ */

test('R735 ⑪ the layer bridge and the spatial clause are reachable from the reader and the model', () => {
  /* ⚠ AN EXPORT NOTHING CALLS IS NOT A FEATURE. #R732 built js/gis-layers.js, tested it and wrote it
     into three documents; the only references to it in the whole program were those tests and that
     prose, so no reader could put a map layer into an analysis. This is the check that the entrance
     exists — the memory note is 「完成した配線が通電しているかは、配線を描く門からは見えない」. */
  const panel = read('js/gis-panel.js');
  assert.ok(/window\.IntMapGisLayers/.test(panel), 'the panel still does not know the layer bridge exists');
  assert.ok(/L\.sources\(\)/.test(panel), 'nothing lists what the map can hand over');
  assert.ok(/L\.toDataset\(/.test(panel), 'no control turns a layer into a dataset');
  assert.ok(/L\.toRaster\(/.test(panel), 'no control turns a numeric layer into a grid');
  assert.ok(/bodyEl\.appendChild\(sectionLayers\(\)\)/.test(panel), 'the section exists but is not rendered');
  /* A bake outlives the DOM it started in: render() runs on every registry event. */
  assert.ok(/if \(bake\)/.test(panel), 'a running bake cannot be stopped after a repaint');

  /* And the same shape on the model's side: #R732 wired the spatial clause into the evaluator and the
     catalogue prose, and left it out of the argument schema — the list the model is actually shown.
     #R733 measured what that costs (eight steps of one turn spent searching for tools in hand). */
  const schemas = read('js/atlas-schemas.js');
  const line = schemas.split('\n').find((l) => l.indexOf("'data.query'") >= 0);
  assert.ok(line, "data.query is no longer declared");
  assert.ok(/spatial:/.test(line), 'data.query still does not tell the model it can ask by shape');

  /* The evaluator it has to agree with. */
  const query = read('js/atlas-query.js');
  assert.ok(/spatialStage/.test(query), 'the spatial clause is declared and not implemented');
});
