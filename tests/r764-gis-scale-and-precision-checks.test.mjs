/* ============================================================================
 *  #R764 · 境界の画素と、止められること
 * ----------------------------------------------------------------------------
 *  ⚠ TWO DEFECTS OF OPPOSITE KINDS, and the second one is the worse.
 *
 *  ① THE BOUNDARY RULE WAS A JUDGEMENT, STATED AND ARGUED — and it was the only one on offer.
 *     js/gis-raster.js's header says a pixel belongs to the zone whose polygon holds its CENTRE, and
 *     argues it well: splitting the VALUE of a class code is meaningless, and splitting a point
 *     measurement is an interpolation nobody asked for. Both stay true. What neither settles is the
 *     AREA — 「この流域の面積」 is answered out of the pixels' ground, and a zone that cuts a pixel in
 *     half is answered by neither counting it whole nor dropping it. On a coarse grid against a
 *     narrow catchment, a coastal strip or a small ward, that difference IS the answer.
 *     ⇒ The rule is chosen and NAMED IN THE ANSWER. ⚠ The default does not move: a reader who chose
 *     nothing gets the same numbers as before, to the bit.
 *
 *  ② THE COMMENT ABOVE THE RUNNER TABLE SAID THE OPPOSITE OF WHAT THE TABLE DID:
 *
 *         「The others finish in one turn and are handed it anyway,
 *           so a runner that grows tomorrow has it already.」
 *
 *     MEASURED: six of the twenty-four were handed nothing — filter, buffer, dissolve, timeWindow,
 *     join, compute. `buffer` unions a geodesic disk PER VERTEX. So the runner whose cost grows
 *     fastest in this file was the one being described as finishing in one turn, and a reader
 *     buffering a few thousand features had a stop button that could not reach the work — under a
 *     note explaining that it could. This is [[intmap-sync-loop-cannot-be-cancelled]] one level up,
 *     and it is why ⑨ below measures the TABLE rather than the sentence.
 *
 *  ⚠ WHAT IS MEASURED IS THE ANSWER AND THE WIRING, not the prose. A comment cannot be trusted to
 *  describe the table it sits on — that is the whole finding.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), raster = makeGisRaster(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster; w.IntMapGisOps = ops; w.IntMapGisExpr = makeGisExpr();
  await geometry.ready();
  return { w, data, geometry, raster, ops };
}

const featOf = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const boxOf = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const polyOf = (rings, p) => featOf({ type: 'Polygon', coordinates: rings }, p);

/* ⚠ ONE PIXEL, AND ITS EDGES ARE WHOLE NUMBERS, so every expected weight below is a ratio a reader
   can check by hand rather than a number this file copied out of a run. The pixel spans lng 0→1 and
   lat 0→1; a zone spanning lng 0→0.4 of the same latitudes covers exactly 0.4 of its ground, because
   the spherical cell area is proportional to Δλ at a fixed latitude band. */
function onePixel(value) {
  const cells = Float64Array.from([value]);
  return {
    kind: 'raster', title: 'g', width: 1, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: null, nodata: null }],
    read: () => cells,
  };
}

const ZONE_LEFT_40 = { type: 'Polygon', coordinates: [boxOf(0, 0, 0.4, 1)] };   /* 中心(0.5,0.5)の外 */

/* ══ ① 既定は動かない ═══════════════════════════════════════════════════════════════════════ */

test('① 既定は center のまま — 選ばなかった読者の数は 1 ビットも動かない', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(10));
  const bare = await raster.zonal(g, 0, ZONE_LEFT_40, {});
  const named = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'center' });
  assert.equal(bare.ok, true, bare.why);
  assert.equal(bare.boundary, 'center', '既定の規則が答えに載っていない');
  /* 中心が区域の外なので、この画素は採られない — 出荷前と同じ答え */
  assert.equal(bare.count, 0);
  assert.equal(bare.areaKm2, 0);
  assert.deepEqual({ c: bare.count, a: bare.areaKm2, m: bare.mean }, { c: named.count, a: named.areaKm2, m: named.mean });
  void ops;
});

/* ══ ② allTouched ═══════════════════════════════════════════════════════════════════════════ */

test('② allTouched は、区域が触れた画素を丸ごと採る', async () => {
  const { data, raster } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'allTouched' });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.boundary, 'allTouched');
  assert.equal(r.count, 1, '触れている画素が採られていない');
  const whole = await raster.pixelAreaKm2(g, 0);
  assert.ok(Math.abs(r.areaKm2 - whole.km2) < 1e-6, '丸ごとではない: ' + r.areaKm2 + ' vs ' + whole.km2);
});

/* ══ ③ fractional — 手で確かめられる比 ═════════════════════════════════════════════════════ */

test('③ fractional は、画素のうち区域に入っている面積の割合を重みにする', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.boundary, 'fractional');
  const whole = await raster.pixelAreaKm2(g, 0);
  /* 0.4 は「この緯度帯で Δλ が 0.4 倍」——読者が手で確かめられる比であって、実行から写した数ではない */
  assert.ok(Math.abs(r.areaKm2 / whole.km2 - 0.4) < 1e-9,
    '重みが 0.4 になっていない: ' + (r.areaKm2 / whole.km2));
  assert.ok(Math.abs(r.valueAreaKm2 / whole.km2 - 0.4) < 1e-9);
});

test('③ 区域の中に丸ごと入っている画素は 1 のまま（端だけが分けられる）', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(10));
  const covers = { type: 'Polygon', coordinates: [boxOf(-1, -1, 2, 2)] };
  const r = await raster.zonal(g, 0, covers, { boundary: 'fractional', areaOf: ops.areaKm2 });
  const whole = await raster.pixelAreaKm2(g, 0);
  assert.ok(Math.abs(r.areaKm2 - whole.km2) < 1e-6, '内部の画素が削られた: ' + r.areaKm2 + ' vs ' + whole.km2);
});

/* ══ ④⑤ 断り方 ═════════════════════════════════════════════════════════════════════════════ */

test('④ 面積の規則を渡されなければ fractional は名前を付けて断る（黙って center に落ちない）', async () => {
  const { data, raster } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional' });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'fraction-needs-area-rule');
  assert.equal(r.detail.needs, 'areaOf');
});

test('⑤ 知らない規則は、語彙を添えて断られる', async () => {
  const { data, raster } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'halfway' });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'boundary-rule-unknown');
  assert.deepEqual(r.detail.rules, ['center', 'allTouched', 'fractional']);
});

/* ══ ⑥ 重みが効くのは「地面」だけ ═══════════════════════════════════════════════════════════ */

test('⑥ count と sum は画素を 1 つとして数える — 読み取り値の 3 分の 2 は読み取り値ではない', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(10));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2 });
  assert.equal(r.count, 1, '画素の数が重みで割られている');
  assert.equal(r.sum, 10, '観測値の合計が重みで割られている');
  /* 一方、地面についての統計は重みを取る */
  const whole = await raster.pixelAreaKm2(g, 0);
  assert.ok(Math.abs(r.sumTimesAreaKm2 - 10 * whole.km2 * 0.4) < 1e-6, '積分が重みを取っていない');
  /* 面積加重平均は 1 画素なので値そのもの（重みは分子と分母で打ち消える） */
  assert.ok(Math.abs(r.mean - 10) < 1e-12);
});

test('⑥ 分類ごとの面積は重みを取る（分類は割らない。面積を割る）', async () => {
  const { data, raster, ops } = await boot();
  const g = data.add(onePixel(3));
  const r = await raster.zonal(g, 0, ZONE_LEFT_40, { boundary: 'fractional', areaOf: ops.areaKm2, classes: true });
  assert.equal(r.ok, true, r.why);
  const whole = await raster.pixelAreaKm2(g, 0);
  assert.ok(Math.abs(r.classAreasKm2['3'] / whole.km2 - 0.4) < 1e-9,
    '区分の面積が丸ごと数えられている: ' + JSON.stringify(r.classAreasKm2));
});

/* ══ ⑦ 使った規則は行にも載る ═══════════════════════════════════════════════════════════════ */

test('⑦ zonal op の各行が、どの規則で出した数かを持って出る', async () => {
  const { data, ops } = await boot();
  const g = data.add(onePixel(10));
  const zones = data.add({ title: 'z', features: [polyOf([boxOf(0, 0, 0.4, 1)], { id: 'z1' })] });
  const r = await ops.run({ op: 'zonal', inputs: [zones.id, g.id], params: { stat: 'mean', boundary: 'fractional' } });
  assert.equal(r.ok, true, r.why);
  const p = r.dataset.features()[0].properties;
  assert.equal(p._boundary, 'fractional', '行が規則を持っていない（後から検算できない）');
  /* そして op は面積の規則を自分で渡している — 呼ばれ方を測る */
  assert.ok(/areaOf: areaKm2/.test(read('js/gis-ops.js')), 'op が面積の規則を kernel へ配っていない');
});

test('⑦ 知らない規則は op の側でも語彙を添えて断られる', async () => {
  const { data, ops } = await boot();
  const g = data.add(onePixel(10));
  const zones = data.add({ title: 'z', features: [polyOf([boxOf(0, 0, 1, 1)], { id: 'z1' })] });
  const r = await ops.run({ op: 'zonal', inputs: [zones.id, g.id], params: { stat: 'mean', boundary: 'nope' } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'bad-param');
  assert.equal(r.detail.param, 'boundary');
  assert.deepEqual(r.detail.values, ['center', 'allTouched', 'fractional']);
});

/* ══ ⑧⑨ 止められること ═════════════════════════════════════════════════════════════════════ */

const ABORTED = { aborted: true };

test('⑧ 中止は、今まで ctx を渡されていなかった 6 つの演算に届く', async () => {
  const { data, ops } = await boot();
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(featOf({ type: 'Point', coordinates: [i / 100, i / 100] }, { n: i, code: 'a' }));
  const src = data.add({ title: 's', features: rows, time: { kind: 'constant', start: '2020', end: '2020' } });
  const right = data.add({ title: 'r', features: [featOf({ type: 'Point', coordinates: [0, 0] }, { code: 'a', m: 1 })] });

  const cases = [
    ['filter', { where: [{ field: 'n', op: '>=', value: 0 }] }, [src.id]],
    ['buffer', { radiusKm: 1 }, [src.id]],
    ['timeWindow', { from: '2019', to: '2021' }, [src.id]],
    ['compute', { outName: 'x', expr: 'n * 2' }, [src.id]],
    ['join', { leftField: 'code', rightField: 'code', fields: ['m'] }, [src.id, right.id]],
  ];
  for (const [op, params, inputs] of cases) {
    const r = await ops.run({ op: op, inputs: inputs, params: params }, { signal: ABORTED });
    assert.equal(r.ok, false, op + ' は中止されなかった');
    assert.equal(r.why, 'cancelled', op + ' の中止が名前を持っていない: ' + r.why);
  }

  /* dissolve は面が要るので別の入力で */
  const polys = data.add({ title: 'p', features: [polyOf([boxOf(0, 0, 1, 1)], { k: 'a' }), polyOf([boxOf(2, 2, 3, 3)], { k: 'b' })] });
  const rd = await ops.run({ op: 'dissolve', inputs: [polys.id], params: { by: 'k' } }, { signal: ABORTED });
  assert.equal(rd.ok, false);
  assert.equal(rd.why, 'cancelled', 'dissolve の中止が名前を持っていない: ' + rd.why);
});

test('⑨ 実行表のどの行も ctx を渡されている — 註ではなく表を測る', () => {
  const src = read('js/gis-ops.js');
  const at = src.indexOf('const RUN = {');
  assert.ok(at > 0, 'RUN の表が見つからない');
  const body = src.slice(at, src.indexOf('};', at));
  const rows = body.match(/^\s{8}[a-zA-Z]+: \(\) => [^\n]+$/gm) || [];
  assert.ok(rows.length >= 20, '表の行が読み取れていない: ' + rows.length);
  const without = rows.filter((r) => !/\bctx\b/.test(r));
  assert.deepEqual(without, [],
    'ctx を渡されていない runner がある（この回が直したのはまさにこれ）:\n' + without.join('\n'));
});

test('⑨ ctx を渡されない呼び手は待たされない — 2 つ目の実装は作られていない', async () => {
  const { data, ops } = await boot();
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(featOf({ type: 'Point', coordinates: [i, i] }, { n: i }));
  const src = data.add({ title: 's', features: rows });
  /* signal も onProgress も渡さない = 出荷済みの呼ばれ方。答えは変わらない */
  const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 3 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.count, 2);
});
