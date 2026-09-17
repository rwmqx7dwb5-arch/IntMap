/* ============================================================================
 *  #R774 · 単位の違う 2 つの量を、引き算してはならない
 * ----------------------------------------------------------------------------
 *  ⚠ MEASURED ON THE SHIPPED BUILD (2026-09-17, commit 5d5f9312), both `ok:true`:
 *      1000 m − 1 km    →   999      unit null
 *      10 °C − 283.15 K → −273.15    unit null
 *  Both differences are ZERO. js/gis-raster.js kept the unit when the two spellings were equal and
 *  wrote null when they were not — and subtracted the raw numbers either way. ⚠ DROPPING THE LABEL
 *  OFF A WRONG NUMBER REMOVES THE EVIDENCE, NOT THE ERROR ([[intmap-a-fix-that-removes-the-evidence]]),
 *  and every chart, zonal statistic and Atlas answer downstream then carried it with no caveat.
 *
 *  ⚠ WHAT IS MEASURED HERE IS THE ANSWER, NOT THE PLUMBING. Every test below runs the real op
 *  through the real registry and reads the REGISTERED RECORD — the values in the grid and the unit
 *  on the band — because the defect was never in the return shape.
 *
 *  ⚠ AND THE RULE IS MEASURED IN MORE THAN ONE CALLER ON PURPOSE. `rasterDiff`, `mosaic`, `compute`
 *  and `rasterCalc` all combine two quantities arithmetically; a fix that lived in `rasterDiff`
 *  would be the 「規則を関数に付ける」 shape .agents/rules/no-ad-hoc-hardcoding.md §3 forbids, and
 *  the only way to tell the two apart from outside is to ask each caller.
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
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster(); w.IntMapGisWarp = makeGisWarp(); w.IntMapGisCrs = makeGisCrs();
  w.IntMapGisExpr = makeGisExpr(); w.IntMapGisUnits = makeGisUnits();
  await geometry.ready();
  return { w, data, ops, units: w.IntMapGisUnits };
}

const gridOf = (values, unit) => ({
  kind: 'raster', title: 'g', width: values.length, height: 1,
  grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 },
  bands: [{ name: 'v', unit: unit === undefined ? null : unit, nodata: null }],
  read: () => Float64Array.from(values), time: null,
});
const rowsOf = (props) => ({
  title: 't',
  features: props.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: p })),
});

async function diff(ops, data, ua, va, ub, vb) {
  const a = data.add(gridOf(va, ua)), b = data.add(gridOf(vb, ub));
  return ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
}

/* ══ ① 同じ量を違う綴りで述べた 2 枚は、換算されてから引かれる ═══════════════════════════════ */

test('① 1000 m − 1 km は 0 であって 999 ではない', async () => {
  const { data, ops } = await boot();
  const r = await diff(ops, data, 'm', [1000], 'km', [1]);
  assert.equal(r.ok, true, '拒まれた: ' + r.why);
  assert.equal(Array.from(r.dataset.read())[0], 0, '換算せずに生の数を引いている');
  /* 答えは A の単位で述べられる——B を A へ直したのだから。 */
  assert.equal(r.dataset.bands[0].unit, 'm', '換算したのに単位を落とした（証拠だけ消える）');
});

test('① 10 °C − 283.15 K は 0 であって −273.15 ではない（アフィン単位）', async () => {
  const { data, ops } = await boot();
  const r = await diff(ops, data, '°C', [10], 'K', [283.15]);
  assert.equal(r.ok, true, '拒まれた: ' + r.why);
  const v = Array.from(r.dataset.read())[0];
  assert.ok(Math.abs(v) < 1e-9, '読みを差として換算している（オフセットが落ちている）: ' + v);
  assert.equal(r.dataset.bands[0].unit, '°C');
});

/* ══ ② 同じ量でないものは、名前を付けて拒む ═══════════════════════════════════════════════════ */

test('② m と kg は引けない — もっともらしい数を返さない', async () => {
  const { data, ops } = await boot();
  const r = await diff(ops, data, 'm', [5], 'kg', [2]);
  assert.equal(r.ok, false, '違う量どうしの差が ok:true で返った');
  assert.equal(r.why, 'unit-mismatch');
  assert.equal(r.detail.a, 'm');
  assert.equal(r.detail.b, 'kg');
  assert.equal(r.detail.verdict, 'incompatible', '読者に「別の量」と「読めない綴り」の区別が届かない');
});

test('② 読めない綴りが 2 つ違っていたら拒む — 「わからない」は「同じ」ではない', async () => {
  const { data, ops } = await boot();
  const r = await diff(ops, data, 'NDVI', [5], 'EVI', [2]);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'unit-mismatch');
  assert.equal(r.detail.verdict, 'unknown');
});

/* ══ ③ 沈黙は不一致ではない（ここを緩めないと、この app のほとんどの格子が拒まれる） ═════════ */

test('③ 片方または両方が単位を述べていなければ、今までどおり引ける', async () => {
  const { data, ops } = await boot();
  for (const [ua, ub] of [['m', null], [null, 'm'], [null, null]]) {
    const r = await diff(ops, data, ua, [5], ub, [2]);
    assert.equal(r.ok, true, ua + ' / ' + ub + ' が拒まれた: ' + r.why);
    assert.equal(Array.from(r.dataset.read())[0], 3);
    assert.equal(r.dataset.bands[0].unit, null, '誰も述べていない単位が出力に付いた');
  }
});

test('③ 同じ綴りどうしは、この回の前とバイトで同じ答え', async () => {
  const { data, ops } = await boot();
  const r = await diff(ops, data, 'm', [5, 7], 'm', [2, 1]);
  assert.equal(r.ok, true, r.why);
  assert.deepEqual(Array.from(r.dataset.read()), [3, 6]);
  assert.equal(r.dataset.bands[0].unit, 'm');
});

/* ══ ④ 欠損の見分けが換算で変わらない ════════════════════════════════════════════════════════ */

test('④ 換算しても、欠損だった画素は欠損のまま（番兵が倍率で別の数にならない）', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1000, 2000], 'm'));
  const b = data.add({
    kind: 'raster', title: 'b', width: 2, height: 1,
    grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: 'km', nodata: -9999 }],
    read: () => Float64Array.from([1, -9999]), time: null,
  });
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  const out = Array.from(r.dataset.read());
  assert.equal(out[0], 0, '換算された画素の差が 0 でない');
  assert.ok(Number.isNaN(out[1]), '番兵 −9999 が換算されて実測値になった: ' + out[1]);
  assert.equal(r.stats.nodata, 1, '欠損が 1 画素と数えられていない');
});

/* ══ ⑤ 規則は rasterDiff のものではない — 他の呼び手も同じ答えを返す ═════════════════════════ */

test('⑤ mosaic の mean も換算してから平均する', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1000], 'm')), b = data.add(gridOf([1], 'km'));
  const r = await ops.run({ op: 'mosaic', inputs: [a.id, b.id], params: { overlap: 'mean', method: 'nearest' } });
  assert.equal(r.ok, true, r.why);
  assert.equal(Array.from(r.dataset.read())[0], 1000, '1000 m と 1 km の平均が 500.5 になっている');
  assert.equal(r.dataset.bands[0].unit, 'm');
});

test('⑤ mosaic も違う量は拒む', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1], 'm')), b = data.add(gridOf([1], 'kg'));
  const r = await ops.run({ op: 'mosaic', inputs: [a.id, b.id], params: { overlap: 'mean', method: 'nearest' } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'unit-mismatch');
});

test('⑤ compute の + と − も、2 列が別々の単位を述べていたら拒む', async () => {
  const { data, ops } = await boot();
  const ds = data.add(rowsOf([{ len: 1000, dist: 1 }]));
  data.declareField(ds.id, 'len', { unit: 'm' });
  data.declareField(ds.id, 'dist', { unit: 'km' });
  const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'len + dist', outName: 'out' } });
  assert.equal(r.ok, false, '「m + km」が列として登録された');
  assert.equal(r.why, 'unit-mismatch');
  assert.equal(r.detail.op, '+', 'どの演算子で衝突したのかが読者に届かない');
});

test('⑤ rasterCalc の a − b も、2 バンドが別々の単位を述べていたら拒む', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1000], 'm')), b = data.add(gridOf([1], 'km'));
  const r = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'a - b', outName: 'd' } });
  assert.equal(r.ok, false, '読者の式の中で m と km が黙って引かれた');
  assert.equal(r.why, 'unit-mismatch');
});

/* ══ ⑥ 式の中では換算しない（読者の算術を黙って書き換えない） ═══════════════════════════════ */

test('⑥ compute はリテラルを中立に扱う — t − 273.15 は拒まれない', async () => {
  const { data, ops } = await boot();
  const ds = data.add(rowsOf([{ t: 300 }]));
  data.declareField(ds.id, 't', { unit: 'K' });
  const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 't - 273.15', outName: 'c' } });
  assert.equal(r.ok, true, 'リテラルを単位ありとして扱っている: ' + r.why);
  assert.equal(r.dataset.features()[0].properties.c, 300 - 273.15);
});

test('⑥ 同じ単位どうしの + は通り、その単位が出力の列に付く（#R759 が付けられなかった半分）', async () => {
  const { data, ops } = await boot();
  const ds = data.add(rowsOf([{ a: 1, b: 2 }]));
  data.declareField(ds.id, 'a', { unit: 'm' });
  data.declareField(ds.id, 'b', { unit: 'm' });
  const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'a + b', outName: 'sum' } });
  assert.equal(r.ok, true, r.why);
  const col = r.dataset.fields.find((f) => f.name === 'sum');
  assert.ok(col, '列が無い');
  assert.equal(col.unit, 'm', '和の単位が誰にも届いていない');
  /* 著者は op であって読者でも入力でもない。js/gis-datasets.js applyInherited が
     unitStated を 'inherited' にし、元の主張者を unitStatedAt に残す。 */
  assert.equal(col.unitStatedAt, 'derived');
  assert.equal(col.unitFrom, 'compute');
});

test('⑥ × と ÷ は綴りを発明しない', async () => {
  const { data, ops } = await boot();
  const ds = data.add(rowsOf([{ pop: 100, area: 4 }]));
  data.declareField(ds.id, 'pop', { unit: '1' });
  data.declareField(ds.id, 'area', { unit: 'km2' });
  const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'pop / area', outName: 'dens' } });
  assert.equal(r.ok, true, r.why);
  const col = r.dataset.fields.find((f) => f.name === 'dens');
  assert.ok(col.unit == null, '誰も書いていない「1/km2」が列に付いた: ' + col.unit);
});

/* ══ ⑦ 換算表そのもの — 定数は SI の定義値で、この app が測ったものではない ═══════════════════ */

test('⑦ compare は 5 つの答えを返し分ける', async () => {
  const { units } = await boot();
  assert.equal(units.compare('m', 'm').verdict, 'identical');
  assert.equal(units.compare('m', 'km').verdict, 'convertible');
  assert.equal(units.compare('m', 'kg').verdict, 'incompatible');
  assert.equal(units.compare('NDVI', 'EVI').verdict, 'unknown');
  assert.equal(units.compare('m', null).verdict, 'unstated');
  assert.equal(units.compare('', 'm').verdict, 'unstated', '空文字は「無次元」ではなく「述べていない」');
});

test('⑦ 合成した単位は表に並べず、解析される', async () => {
  const { units } = await boot();
  for (const [a, b] of [['mm/h', 'm/s'], ['km/h', 'kn'], ['m2', 'km2'], ['m²', 'm2'], ['hPa', 'Pa'], ['W/m2', 'kW/m2'], ['µg/m3', 'kg/m3']]) {
    assert.equal(units.compare(a, b).verdict, 'convertible', a + ' と ' + b + ' が同じ量と読めていない');
  }
  assert.equal(units.compare('m/s', 'm/s2').verdict, 'incompatible', '指数が読まれていない');
});

test('⑦ 換算の値が定義どおり（測る対象の外に書いた期待値）', async () => {
  const { units } = await boot();
  const near = (got, want, why) => assert.ok(Math.abs(got - want) < 1e-9, why + ': ' + got);
  near(units.convert(1, 'km', 'm'), 1000, '1 km');
  near(units.convert(1, 'mi', 'm'), 1609.344, '1 mile — 1959 international agreement');
  near(units.convert(1, 'ft', 'm'), 0.3048, '1 foot');
  near(units.convert(1, 'lb', 'kg'), 0.45359237, '1 pound');
  near(units.convert(1, 'nmi', 'm'), 1852, '1 nautical mile');
  near(units.convert(1, 'atm', 'Pa'), 101325, 'standard atmosphere');
  near(units.convert(1, 'ha', 'm2'), 10000, '1 hectare');
  near(units.convert(212, '°F', '°C'), 100, '212 °F is boiling');
  near(units.convert(32, '°F', '°C'), 0, '32 °F is freezing');
  near(units.convert(0, '°C', 'K'), 273.15, '0 °C');
});

test('⑦ 読みの換算と、差の換算は別（アフィン単位でだけ違う）', async () => {
  const { units } = await boot();
  assert.equal(units.convert(10, '°C', 'K'), 283.15);
  assert.equal(units.convert(10, '°C', 'K', { difference: true }), 10);
  /* 非アフィンではどちらも同じ。ここが違ったら difference が余計なことをしている。 */
  assert.equal(units.convert(1, 'km', 'm'), units.convert(1, 'km', 'm', { difference: true }));
});

test('⑦ 合成の中のアフィン原子はオフセットを持たない（°C/km は気温減率）', async () => {
  const { units } = await boot();
  const p = units.parse('°C/km');
  assert.equal(p.affine, false, '減率にオフセットが効いている');
  assert.equal(p.off, 0);
  assert.equal(units.compare('°C/km', 'K/m').verdict, 'convertible');
});

/* ══ ⑧ 単位のカーネルが無いビルドでは、何も拒まず何も換算しない ═══════════════════════════════ */

test('⑧ js/gis-units.js が載っていなければ、この回の前と同じ答えに戻る（黙って「合っている」とは言わない）', async () => {
  const { w, data, ops } = await boot();
  delete w.IntMapGisUnits;
  const r = await diff(ops, data, 'm', [1000], 'km', [1]);
  assert.equal(r.ok, true, 'カーネルが無いのに拒んだ');
  assert.equal(Array.from(r.dataset.read())[0], 999, '載っていないモジュールが答えを変えている');
});
