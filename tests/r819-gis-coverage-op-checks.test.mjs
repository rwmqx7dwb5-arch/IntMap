/* ============================================================================
 *  #R819 · 「この区域群は区分か」を、読者と Atlas が訊けるようにする
 * ----------------------------------------------------------------------------
 *  js/gis-geometry.js は coverage() を持っていた——重複・隙間・未被覆・合っていない共有境界を、
 *  件数ではなく**幾何**で返す関数——が、op にも catalogue にも載っていなかった。持っている計算に
 *  扉が無いのは、この repository が何度も記録している形（[[intmap-catalogue-silence-is-a-denial]]）
 *  で、Atlas から見れば「その機能は無い」と同じである。
 *
 *  ⚠ 測るのは返り値の形ではなく、読者が失うものである:
 *    ① 正しい区分は 0 件で、しかも「何を訊いたか」が答えに残る（訊いていない緑と区別できる）
 *    ② 所見は**次の処理の入力**である——同じ幾何が difference の窓として使えること
 *    ③ 'report' と 'forbid' は同じ重なりについて違うことを述べる（係争は誤りではない）
 *    ④ 所見は元の地物を**身元**で名指す（添字のままなら「どこかに重複がある」で終わる）
 *    ⑤ 隙間は、その隙間の幾何で返る
 *    ⑥ kernel の拒否は綴りを変えずに op の外まで届く
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
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, data, ops, geometry };
}

const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const feat = (geometry, properties, id) => {
  const f = { type: 'Feature', properties: properties || {}, geometry: geometry };
  if (id != null) f.id = id;
  return f;
};

/* 2×2 に貼られた 4 枚。辺は正確に共有され、穴は無く、内部は交わらない。 */
const TILES = () => ({
  title: 'tiles',
  features: [
    feat(box(0, 0, 1, 1), { n: 'sw' }, 'sw'),
    feat(box(1, 0, 2, 1), { n: 'se' }, 'se'),
    feat(box(0, 1, 1, 2), { n: 'nw' }, 'nw'),
    feat(box(1, 1, 2, 2), { n: 'ne' }, 'ne'),
  ],
});

/* ══ ① 正しい区分は 0 件。ただし「何を訊いたか」は答えに残る ═══════════════════════════════ */

test('R819 ① 正しい区分は所見ゼロで、訊いた条件が答えに載る', async () => {
  const { data, ops } = await boot();
  const ds = data.add(TILES());
  const r = await ops.run({ op: 'coverage', inputs: [ds.id], params: { overlaps: 'forbid', gaps: 'forbid' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.dataset.count, 0, '正しい区分に所見は無い');
  assert.equal(r.stats.conforms, true);
  /* ⚠ 「何も訊かずに緑」と区別できること。訊かなかった edges は kernel の 'allow' として残る。 */
  assert.equal(r.stats.asked.overlaps, 'forbid');
  assert.equal(r.stats.asked.gaps, 'forbid');
  assert.equal(r.stats.asked.edges, 'allow');
  assert.equal(r.stats.counts.areal, 4);
  /* レシピの隣にも同じ陳述が残る——0 件は「何を訊いたか」が無ければ読めない。 */
  assert.deepEqual(r.dataset.provenance.resolved.coverage, r.stats.asked);
});

/* ══ ② 所見は次の処理の入力である ═══════════════════════════════════════════════════════════ */

test('R819 ② 重なりの所見は、そのまま次の op の窓として使える', async () => {
  const { data, ops } = await boot();
  /* 0..2 と 1..3。重なりは 1..2 の正方形。 */
  const ds = data.add({ title: 'claims', features: [feat(box(0, 0, 2, 2), {}, 'a'), feat(box(1, 0, 3, 2), {}, 'b')] });
  const cov = await ops.run({ op: 'coverage', inputs: [ds.id], params: { overlaps: 'forbid' } });
  assert.equal(cov.ok, true, JSON.stringify(cov));
  assert.equal(cov.dataset.count, 1);
  assert.equal(cov.stats.conforms, false);
  assert.equal(cov.stats.counts.overlap, 1);

  const row = cov.dataset.features()[0];
  assert.equal(row.properties._coverage, 'overlap');
  /* ④ 身元で名指す。添字ではない。 */
  assert.deepEqual(row.properties._coverageOf, ['a', 'b']);
  const overlapKm2 = row.properties._areaKm2;
  assert.ok(overlapKm2 > 0, '重なりの面積が測られている');

  /* ⚠ 本題: この行は**データセット**であって図ではない。同じ幾何を difference の窓に使えるなら、
     coverage → 次の処理は 1 手である。 */
  assert.equal(cov.dataset.geometryType, 'Polygon');
  const cut = await ops.run({ op: 'difference', inputs: [ds.id, cov.dataset.id] });
  assert.equal(cut.ok, true, JSON.stringify(cut));
  const before = ops.areaKm2(ds.features()[0].geometry) + ops.areaKm2(ds.features()[1].geometry);
  let after = 0;
  for (const f of cut.dataset.features()) after += ops.areaKm2(f.geometry);
  /* 重なりを両方から切り落としたので、合計は 2 枚ぶん減っている。 */
  assert.ok(Math.abs((before - after) - 2 * overlapKm2) < overlapKm2 * 1e-6,
    '切り落とされた地面が、所見の面積と一致しない: ' + (before - after) + ' vs ' + (2 * overlapKm2));
});

/* ══ ③ 'report' は測るが、違反にはしない ═══════════════════════════════════════════════════ */

test("R819 ③ 同じ重なりが、'forbid' では違反・'report' では測定になる", async () => {
  const { data, ops } = await boot();
  const mk = () => data.add({ title: 'claims', features: [feat(box(0, 0, 2, 2), {}, 'a'), feat(box(1, 0, 3, 2), {}, 'b')] });
  const forbid = await ops.run({ op: 'coverage', inputs: [mk().id], params: { overlaps: 'forbid' } });
  const report = await ops.run({ op: 'coverage', inputs: [mk().id], params: { overlaps: 'report' } });
  assert.equal(forbid.ok, true);
  assert.equal(report.ok, true, JSON.stringify(report));

  /* 同じ地面が測られている——違うのは判定だけ。 */
  assert.equal(report.dataset.count, 1);
  assert.equal(report.stats.conforms, true, '係争・重複・継ぎ目は誤りではない');
  assert.equal(report.stats.counts.overlap, 0, "'report' は違反として数えない");
  assert.equal(report.stats.counts.tolerated, 1);
  assert.equal(report.dataset.features()[0].properties._coverageTolerated, true);
  assert.equal(forbid.dataset.features()[0].properties._coverageTolerated, false);
  assert.ok(Math.abs(report.dataset.features()[0].properties._areaKm2 - forbid.dataset.features()[0].properties._areaKm2) < 1e-9);
});

/* ══ ⑤ 隙間は、その隙間の幾何で返る ═════════════════════════════════════════════════════════ */

test('R819 ⑤ 穴の空いた区分は、穴の幾何を返す', async () => {
  const { data, ops } = await boot();
  /* 3×3 のうち中央を抜いた 8 枚。union の内側に 1×1 の穴が残る。 */
  const features = [];
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      if (x === 1 && y === 1) continue;
      features.push(feat(box(x, y, x + 1, y + 1), {}, x + ',' + y));
    }
  }
  const ds = data.add({ title: 'ring', features: features });
  const r = await ops.run({ op: 'coverage', inputs: [ds.id], params: { gaps: 'forbid' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.stats.counts.gap, 1);
  assert.equal(r.stats.conforms, false);
  const hole = r.dataset.features()[0];
  assert.equal(hole.properties._coverage, 'gap');
  /* 穴は 1×1。その面積が返っていなければ、読者は「どこか」としか言えない。 */
  const one = ops.areaKm2(box(1, 1, 2, 2));
  assert.ok(Math.abs(hole.properties._areaKm2 - one) < one * 1e-6, '穴の面積: ' + hole.properties._areaKm2 + ' / ' + one);
  /* 隙間は隣接する地物を名指す——直す読者が見るのはその 2 枚である。 */
  assert.ok(hole.properties._coverageOf.length > 0, '穴が誰の隣かを述べていない');
});

/* ══ ⑥ kernel の拒否は、綴りを変えずに外まで届く ═══════════════════════════════════════════ */

test('R819 ⑥ 何も述べない呼び出しは空虚な緑ではなく拒否で、語は kernel のもの', async () => {
  const { data, ops } = await boot();
  const ds = data.add(TILES());
  const nothing = await ops.run({ op: 'coverage', inputs: [ds.id], params: {} });
  assert.equal(nothing.ok, false);
  assert.equal(nothing.why, 'coverage-nothing-asked', '訊かれていない緑を返してはならない');

  const unknown = await ops.run({ op: 'coverage', inputs: [ds.id], params: { overlaps: 'maybe' } });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.why, 'coverage-unknown-condition');
  assert.equal(unknown.detail.condition, 'overlaps');

  const tol = await ops.run({ op: 'coverage', inputs: [ds.id], params: { gaps: 'forbid', gapToleranceKm: 'soon' } });
  assert.equal(tol.ok, false);
  assert.equal(tol.why, 'bad-tolerance', '読めない許容距離を 0 に丸めてはならない');
  assert.equal(tol.detail.which, 'gapToleranceKm');
});

/* ══ ⑦ 宣言されている＝Atlas から到達できる ═══════════════════════════════════════════════ */

test('R819 ⑦ coverage は宣言の一覧に載り、条件の値は kernel に訊かれる', async () => {
  const { ops, geometry } = await boot();
  const decl = ops.ops().find((d) => d.id === 'coverage');
  assert.ok(decl, 'catalogue に載っていない op は、Atlas にとって存在しない');
  assert.equal(decl.inputs, 1);
  assert.deepEqual(decl.accepts, ['Polygon']);
  const names = decl.params.map((p) => p.name);
  for (const nm of ['overlaps', 'gaps', 'edges', 'gapToleranceKm', 'edgeToleranceKm']) {
    assert.ok(names.indexOf(nm) >= 0, '条件 ' + nm + ' を述べる道が無い');
  }
  /* ⚠ 値の集合をこの層が写していないこと。kernel が公開していれば載り、していなければ
     `values` は**無い**（「訊けなかった」であって「選べる値は無い」ではない）。 */
  const overlaps = decl.params.find((p) => p.name === 'overlaps');
  assert.equal(overlaps.valuesOf, 'coverage-modes');
  const published = (typeof geometry.coverageModes === 'function') ? geometry.coverageModes() : null;
  if (published) assert.deepEqual(overlaps.values, published);
  else assert.equal(overlaps.values, undefined, '訊けなかった集合を、空の集合として描いてはならない');
  /* 既定はこの層に無い——述べなかった条件の意味は kernel のものである。 */
  assert.equal(overlaps.default, undefined);
});
