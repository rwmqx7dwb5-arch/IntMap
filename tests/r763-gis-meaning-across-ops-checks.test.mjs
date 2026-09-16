/* ============================================================================
 *  #R763 · 演算を通っても、時点・単位・失敗が落ちない
 * ----------------------------------------------------------------------------
 *  ⚠ THREE DEFECTS OF ONE SHAPE: a fact is gathered from ALL the inputs, or looked up by a name the
 *  op has just changed, or counted and then dropped on the floor. In each case the code was right
 *  about something adjacent and wrong about the thing itself.
 *
 *    ⑩ rasterOutTime's own comment states the rule exactly — 「the ones whose SAMPLES entered the
 *       output」 — and the code asked 「それは格子か」 instead. The two agree for rasterMask (a
 *       polygon is not a grid), which is the case the comment reasons about, and disagree for
 *       `resample`, whose second input lends a lattice and contributes not one value. So 2020 年の a
 *       を 2025 年の b の格子へ合わせた記録が 2020–2025 を名乗り、b が時点を述べていなければ a の
 *       日付ごと消えた ([[intmap-one-predicate-three-dimensions]]).
 *    ⑪ fieldStatements keys the inputs' units BY COLUMN NAME, and `join` is the one op in the app
 *       that renames a column. `mass` with 「kg」 arrived as `joined_mass` with nothing — and a
 *       derived record refuses to be declared on (`edit-would-contradict-recipe`), so the reader
 *       could not put it back either. The collision check eleven lines up already knew about the
 *       prefix: it was understood at one end of the function and not at the other.
 *    ⑫ withGeoStats counts every attempt that failed and hands it back in `stats`, which
 *       js/gis-panel.js and js/gis-atlas.js print FOR THAT TURN and nothing writes down. So a buffer
 *       that dropped 120 of 1,000 rows registered a record still calling itself `all`, and every
 *       count taken from it afterwards was stated with no caveat ([[intmap-records-with-no-reader]]).
 *
 *  ⚠ WHAT IS MEASURED IS THE ANSWER, NOT THE PLUMBING. Each test below runs the real op through the
 *  real registry and reads the REGISTERED RECORD — not the return value of the turn, which is the
 *  channel that already worked and which is precisely why nobody noticed.
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
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster(); w.IntMapGisWarp = makeGisWarp(); w.IntMapGisCrs = makeGisCrs();
  w.IntMapGisSources = makeGisSources();
  await geometry.ready();
  return { w, data, ops, sources: w.IntMapGisSources };
}

const featOf = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const polyOf = (rings, p) => featOf({ type: 'Polygon', coordinates: rings }, p);
const boxOf = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/* 一周する環。どの円筒面にも載らないので幾何カーネルが名前を付けて拒む（#R743 の fixture）。 */
const WRAPS = { type: 'Polygon', coordinates: [[[-180, 80], [-60, 80], [60, 80], [180, 80], [180, 89], [-180, 89], [-180, 80]]] };

function gridOf(values, time) {
  const cells = Float64Array.from(values);
  return {
    kind: 'raster', title: 'g', width: 2, height: 2,
    grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: null, nodata: null }],
    read: () => cells, time: time || null,
  };
}
const AT = (y) => ({ kind: 'constant', start: y, end: y });
const covAll = (layer) => ({ kind: 'layer', layer: layer, coverage: { completeness: 'all', reason: null } });

/* ══ ⑩ 格子だけ借りた入力は、時点に投票しない ═══════════════════════════════════════════════ */

test('⑩ 2020 年の格子を 2025 年の格子に合わせても、答えは 2020 年のまま', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1, 2, 3, 4], AT('2020')));
  const b = data.add(gridOf([0, 0, 0, 0], AT('2025')));
  const r = await ops.run({ op: 'resample', inputs: [a.id, b.id], params: { method: 'nearest' } });
  assert.equal(r.ok, true, r.why);
  const t = r.dataset.time;
  assert.ok(t, '時点が落ちた');
  /* declareTime は述べられた文を epoch ms の対に正規化する（js/gis-datasets.js）。だから比べるのは
     「2020 年という窓」であって、綴りではない。 */
  assert.equal(t.start, data.momentOf('2020').start, '値を 1 つも出していない入力の時点が混ざった: ' + JSON.stringify(t));
  assert.equal(t.end, data.momentOf('2020').end, '2025 年まで伸ばされている: ' + JSON.stringify(t));
});

test('⑩ 格子を貸しただけの相手が時点を述べていなくても、値の日付は消えない', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([1, 2, 3, 4], AT('2020')));
  const b = data.add(gridOf([0, 0, 0, 0], null));
  const r = await ops.run({ op: 'resample', inputs: [a.id, b.id], params: { method: 'nearest' } });
  assert.equal(r.ok, true, r.why);
  assert.ok(r.dataset.time, '格子を貸しただけの入力の沈黙で、値の時点が消えた');
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2020').end);
});

test('⑩ 両方が値を出す演算では、今までどおり両方が投票する（緩めてはいない）', async () => {
  const { data, ops } = await boot();
  const a = data.add(gridOf([5, 5, 5, 5], AT('2020')));
  const b = data.add(gridOf([1, 1, 1, 1], AT('2025')));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2025').end, '2 時点の差が片方の時点になっている');
});

test('⑩ 「どの入力が投票するか」は、走った runner が述べる（op の表ではない）', () => {
  const src = read('js/gis-ops.js');
  /* ⚠ 測っているのは「op ごとの一覧が無いこと」。shapeOnly を DECL に書いた瞬間に、それは
     このファイルが嫌っている手書きの表になる。 */
  assert.ok(/shapeOnly: \[1\]/.test(src), 'resample が「格子だけ借りた」と述べていない');
  const declAt = src.indexOf('const DECL = {');
  const declEnd = src.indexOf('const ORDER = Object.keys(DECL)');
  assert.ok(declAt > 0 && declEnd > declAt);
  assert.ok(!/shapeOnly/.test(src.slice(declAt, declEnd)), 'shapeOnly が宣言表に書かれている（op ごとの一覧になった）');
});

/* ══ ⑪ 名前が変わっても単位は付いていく ═══════════════════════════════════════════════════ */

test('⑪ prefix を付けて結合した列の単位は、新しい名前へ付いていく', async () => {
  const { data, ops } = await boot();
  const left = data.add({ title: 'L', features: [featOf({ type: 'Point', coordinates: [0, 0] }, { code: 'a' })] });
  const right = data.add({ title: 'R', features: [featOf({ type: 'Point', coordinates: [1, 1] }, { code: 'a', mass: 12 })] });
  const dec = data.declareField(right.id, 'mass', { unit: 'kg' });
  assert.equal(dec.ok, true, dec.why);

  const r = await ops.run({ op: 'join', inputs: [left.id, right.id], params: { leftField: 'code', rightField: 'code', fields: ['mass'], prefix: 'joined_' } });
  assert.equal(r.ok, true, r.why);
  const col = (r.dataset.fields || []).find((f) => f.name === 'joined_mass');
  assert.ok(col, 'joined_mass が出力に無い');
  assert.equal(col.unit, 'kg', '名前が変わった瞬間に単位が失われた（読者は派生記録に宣言し直せない）');
});

test('⑪ prefix が無いときは、今までどおり同じ名前で継承する', async () => {
  const { data, ops } = await boot();
  const left = data.add({ title: 'L', features: [featOf({ type: 'Point', coordinates: [0, 0] }, { code: 'a' })] });
  const right = data.add({ title: 'R', features: [featOf({ type: 'Point', coordinates: [1, 1] }, { code: 'a', mass: 12 })] });
  data.declareField(right.id, 'mass', { unit: 'kg' });
  const r = await ops.run({ op: 'join', inputs: [left.id, right.id], params: { leftField: 'code', rightField: 'code', fields: ['mass'] } });
  assert.equal(r.ok, true, r.why);
  const col = (r.dataset.fields || []).find((f) => f.name === 'mass');
  assert.ok(col, 'mass が出力に無い');
  assert.equal(col.unit, 'kg');
});

test('⑪ 改名を述べるのは、改名した runner である（この規則が 2 か所に無いこと）', () => {
  const src = read('js/gis-ops.js');
  assert.ok(/renamed: renamed/.test(src), 'join が改名を述べていない');
  /* fieldStatements は渡されたものを読むだけで、prefix を自分で解釈しない */
  const at = src.indexOf('function fieldStatements(');
  const body = src.slice(at, at + 2200);
  /* ⚠ 測るのはコードであって註ではない（註は prefix の話をしてよい）。この関数が別の op の
     引数を読んだり、名前を組み立て直したりしていないことだけを測る。 */
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/params\.prefix|prefix \+/.test(code), 'fieldStatements が prefix を自分で解釈している（別の op の引数を推測している）');
});

/* ══ ⑫ 演算自身が失ったものは、記録に残る ═══════════════════════════════════════════════════ */

test('⑫ 演算が行を落としたら、入力が全部 all でも記録は all と言わない', async () => {
  const { data, ops } = await boot();
  const subject = data.add({ title: 's', features: [polyOf([boxOf(0, 81, 10, 88)], { id: 's1' })], provenance: covAll('x') });
  const windows = data.add({ title: 'w', features: [featOf(WRAPS, { id: 'w1' }), polyOf([boxOf(0, 81, 5, 88)], { id: 'w2' })], provenance: covAll('y') });
  const r = await ops.run({ op: 'clip', inputs: [subject.id, windows.id] });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.stats.geometryFailed, 1, 'fixture が部分失敗になっていない');

  const cov = r.dataset.provenance.coverage;
  assert.ok(cov, '演算が行を落としたのに、記録が何も述べていない');
  assert.equal(cov.completeness, 'partial', '計算できなかった行があるのに all を名乗っている');
  assert.equal(cov.reason, 'op-rows-not-computed');
  assert.equal(cov.computed.failed, 1, '失ったのが何件かがターンの外へ出ていない');
  assert.equal(cov.from, 'clip', 'どこで失われたのかが述べられていない');
  /* 取得についての陳述は消されていない — 2 つの別の問いは別の欄のまま */
  assert.ok(Array.isArray(cov.inputs) && cov.inputs.length === 2, '入力の申告が上書きされた');
});

test('⑫ 入力が何も述べていなくても、演算が落としたことは述べられる', async () => {
  const { data, ops } = await boot();
  /* 取り込んだファイルの形: coverage を誰も述べていない */
  const subject = data.add({ title: 's', features: [polyOf([boxOf(0, 81, 10, 88)], { id: 's1' })] });
  const windows = data.add({ title: 'w', features: [featOf(WRAPS, { id: 'w1' }), polyOf([boxOf(0, 81, 5, 88)], { id: 'w2' })] });
  const r = await ops.run({ op: 'clip', inputs: [subject.id, windows.id] });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.ok(cov, '入力が沈黙していると、演算自身の欠落まで落ちている');
  assert.equal(cov.computed.failed, 1);
  assert.equal(cov.completeness, 'partial');
});

test('⑫ 何も落とさなかった演算は、今までどおり入力の判定をそのまま残す', async () => {
  const { data, ops } = await boot();
  const subject = data.add({ title: 's', features: [polyOf([boxOf(0, 81, 10, 88)], { id: 's1' })], provenance: covAll('x') });
  const windows = data.add({ title: 'w', features: [polyOf([boxOf(0, 81, 5, 88)], { id: 'w2' })], provenance: covAll('y') });
  const r = await ops.run({ op: 'clip', inputs: [subject.id, windows.id] });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.equal(cov.completeness, 'all');
  assert.equal(cov.computed, undefined, '失っていない run が失ったと述べている');
});

test('⑫ 「なぜ all ではないか」の語彙は 1 つで、新しい理由もそこに在る', async () => {
  const { sources } = await boot();
  assert.ok(sources.coverageReasons().indexOf('op-rows-not-computed') >= 0,
    'js/gis-ops.js が、js/gis-sources.js の持たない理由を書いている（2 つ目の語彙）');
});
