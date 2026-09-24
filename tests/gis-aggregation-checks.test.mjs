/* ============================================================================
 *  #R819 · 区域内統計の重みは「区域内の面積」でなければ区域内統計ではない
 * ----------------------------------------------------------------------------
 *  ⚠ MEASURED ON THE SHIPPED BUILD (ops-8). `aggregate` の `areaWeightedMean` は、区域と重なった
 *  member を **その member 自身の全体面積** で重み付けていた。つまり計算していたのは
 *
 *      Σ v·A(P)  /  Σ A(P)        （区域 Z と交差する P について）
 *
 *  であって、「この区域内の面積加重平均」
 *
 *      Σ v·A(P ∩ Z)  /  Σ A(P ∩ Z)
 *
 *  ではない。実例（下の ① が実際に走らせるもの）: 値 10・全体 100 km²・区域内 1 km² の地物 A と、
 *  値 100・全体 1 km²・区域内 1 km² の地物 B。旧来の答えは ≈10.89、区域内の地面で測った平均は 55。
 *
 *  ⚠ 直し方は「訂正」ではなく「基準」である。どちらの問いも実在する——「区域にかかった事業所を、
 *  その規模で重み付けて」は member 自身の広がりで重み付けるのが正しい——ので、既定は
 *  'memberArea' のまま動かさず（③ がそれを測る）、'intersectionArea' は明示したときだけ効く。
 *
 *  ⚠ そして「交差するか」と「どれだけ寄与するか」は別の問いである。区域と交差していても地面を
 *  持たない地物（線・点、そして交差が 0 km² になる面）は member であって重みは 0、値が読めない
 *  地物も member であって平均から外れる——同じ「寄与しなかった」でも読者がやれることが違うので、
 *  2 つは別の欄に数えられる（`_statNoWeight` と `_statSkipped`）。④ がその 2 つを分けて測る。
 *
 *  ⚠ 2 つ目の欠陥は別の形だった: 量（kind / space / time / period / unit / denominator）はラスタの
 *  帯だけが持てて、
 *  ベクタの列は単位しか持てなかった。js/gis-ops.js の #R783 の註が自分でそう書いている
 *  （「a dataset's fields carry a unit and no quantity」）ので、`aggregate` は `params.quantity` を
 *  毎回手で渡されない限り 'undeclared' のままだった。⑤〜⑧ がその経路を測る。
 *
 *  ⚠ 測るのは返り値の形ではなく答えである。すべて実物の registry・実物の op を通す。
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
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisIndex } = await import('../js/gis-index.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisUnits = makeGisUnits();
  try { w.IntMapGisIndex = makeGisIndex(); } catch (_) { /* the index is asked for, never required */ }
  await geometry.ready();
  return { w, data, ops, units: w.IntMapGisUnits };
}

/* ── the fixture ────────────────────────────────────────────────────────────────────────────
   Degrees near the equator, where one degree of longitude and one of latitude are within a percent
   of each other, so the ratios below are the ratios of the boxes' degree areas. The numbers the
   tests assert are NOT hand-computed from that: each one is derived from the areas the op itself
   reports (`_weightKm2`) or from the two members' own measured areas, so a change in the earth
   radius moves the fixture and the expectation together. */
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const feat = (geometry, properties) => ({ type: 'Feature', geometry, properties: properties || {} });

/* One zone: 0..1 lon, 0..1 lat.
   A: value 10, 10x10 degrees of which exactly the 1x1 corner is inside the zone.
   B: value 100, the 1x1 box that IS the zone, entirely inside. */
const ZONE = () => ({ title: 'zone', features: [feat(box(0, 0, 1, 1), { name: 'Z' })] });
const MEMBERS = () => ({
  title: 'members',
  features: [
    feat(box(0, 0, 10, 10), { v: 10, name: 'A' }),
    feat(box(0, 0, 1, 1), { v: 100, name: 'B' }),
  ],
});

const DENSITY = { kind: 'density', space: 'perArea', unit: '1/km2' };

async function aggregate(ops, data, params, members) {
  const z = data.add(ZONE());
  const m = data.add(members || MEMBERS());
  return ops.run({ op: 'aggregate', inputs: [z.id, m.id], params: params });
}

/* ══ ① 区域内の面積で重み付けると 55、member 自身の面積で重み付けると 10.89 ═══════════════ */

test('R819 ① 同じ 2 地物・同じ区域で、重み基準が答えを決める', async () => {
  const { data, ops } = await boot();

  const member = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: 'memberArea' });
  assert.equal(member.ok, true, 'memberArea が拒まれた: ' + member.why + ' ' + JSON.stringify(member.detail));
  const mRow = member.dataset.features()[0].properties;

  const inter = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: 'intersectionArea' });
  assert.equal(inter.ok, true, 'intersectionArea が拒まれた: ' + inter.why + ' ' + JSON.stringify(inter.detail));
  const iRow = inter.dataset.features()[0].properties;

  /* 期待値は固定の数ではなく、その run が報告した重みそのものから導く——地球半径が動けば
     両方が同じだけ動き、この検査が測っているのは「どちらの面積で割ったか」だけになる。 */
  const zoneKm2 = mRow._areaKm2;
  const aWholeKm2 = mRow._weightKm2 - zoneKm2;          /* Σ = A 全体 + B 全体（B は区域と同一） */
  const expectMember = (10 * aWholeKm2 + 100 * zoneKm2) / (aWholeKm2 + zoneKm2);
  assert.ok(Math.abs(mRow.awm - expectMember) < 1e-9, 'memberArea が Σv·A(P)/ΣA(P) ではない: ' + mRow.awm);
  /* その数が「区域内の平均」からどれだけ離れていたか——旧実装が出荷していた誤差そのもの。 */
  assert.ok(mRow.awm > 10 && mRow.awm < 11, '実測の 10.89 という桁から外れた: ' + mRow.awm);

  /* 区域内では A も B もちょうど 1 区画ぶん。だから平均は (10+100)/2 = 55。 */
  assert.ok(Math.abs(iRow.awm - 55) < 1e-9, '区域内の面積で重み付けていない: ' + iRow.awm);
  assert.ok(Math.abs(iRow._weightKm2 - 2 * zoneKm2) < 1e-6, '有効面積が「区域と交差した地面」になっていない: ' + iRow._weightKm2);
});

/* ══ ② 使った重み基準と有効面積は、行にもレシピにも残る ════════════════════════════════════ */

test('R819 ② どちらの算術だったかが、答えとレシピの両方から読める', async () => {
  const { data, ops } = await boot();
  for (const basis of ['memberArea', 'intersectionArea']) {
    const r = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: basis, quantity: DENSITY });
    assert.equal(r.ok, true, basis + ' が拒まれた: ' + r.why);
    const row = r.dataset.features()[0].properties;
    assert.equal(row._weightBy, basis, '行が重み基準を述べていない（' + basis + '）');
    assert.equal(typeof row._weightKm2, 'number', '有効面積が行に無い');
    assert.ok(row._weightKm2 > 0, '有効面積が 0: ' + row._weightKm2);
    assert.equal(typeof row._statNoWeight, 'number', '重みを持てなかった数が行に無い');
    const rule = (r.dataset.provenance || {}).resolved;
    assert.ok(rule && rule.aggregation, 'レシピが走った規則を記録していない');
    assert.equal(rule.aggregation.weight, 'area');
    assert.equal(rule.aggregation.weightBasis, basis, 'レシピが重み基準を述べていない（' + basis + '）');
  }
});

/* ══ ③ 既定は変わっていない — weightBy を書かない呼び出しは同じ数を返す ═══════════════════ */

test('R819 ③ 基準を述べない呼び出しは、これまでと同じ答え（memberArea）', async () => {
  const { data, ops } = await boot();
  const bare = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm' });
  const named = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: 'memberArea' });
  assert.equal(bare.ok, true, bare.why);
  assert.equal(bare.dataset.features()[0].properties.awm, named.dataset.features()[0].properties.awm,
    '既定が黙って変わった（AGENTS.md §3-1）');
  assert.equal(bare.dataset.features()[0].properties._weightBy, 'memberArea');

  /* 重み付けない stat は、基準を名指されたら拒む——読者が選んでいない算術を、その指示の下に
     返してはならない。 */
  const wrong = await aggregate(ops, data, { stat: 'mean', field: 'v', outName: 'm', weightBy: 'intersectionArea' });
  assert.equal(wrong.ok, false, 'areaWeightedMean 以外に weightBy を書けてしまった');
  assert.equal(wrong.why, 'bad-param');
  assert.equal(wrong.detail.param, 'weightBy');

  const unknown = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: 'zoneArea' });
  assert.equal(unknown.ok, false, '知らない基準が通った');
  assert.deepEqual(unknown.detail.values, ['memberArea', 'intersectionArea'], '拒否が語彙を持っていない');
});

/* ══ ④ 接するだけの地物は member であって、重みは 0 ═══════════════════════════════════════ */

test('R819 ④ 交差はするが地面を持たない地物は数えられ、重みは持たない', async () => {
  const { data, ops } = await boot();
  /* 「重なるか」と「どれだけ寄与するか」が別々に答えられることを、4 通りの member で測る。
     ⚠ 辺を共有するだけの面は member ですらない——js/gis-geometry.js の `intersects` は面どうしを
     交差の中身で判定するので、共有辺は空である。数えられて重みを持たないのは、交差はするが
     interior を持たないもの（線・点）のほう。 */
  const mixed = {
    title: 'members',
    features: [
      feat(box(0, 0, 1, 1), { v: 100, name: 'inside' }),
      feat(box(1, 0, 2, 1), { v: 1, name: 'edge-sharing' }),
      feat({ type: 'LineString', coordinates: [[0.2, 0.5], [0.8, 0.5]] }, { v: 3, name: 'line' }),
      feat({ type: 'Point', coordinates: [0.5, 0.5] }, { v: 7, name: 'point' }),
      feat(box(0, 0, 1, 1), { v: 'not a number', name: 'unreadable' }),
    ],
  };
  const r = await aggregate(ops, data, { stat: 'areaWeightedMean', field: 'v', outName: 'awm', weightBy: 'intersectionArea' }, mixed);
  assert.equal(r.ok, true, r.why + ' ' + JSON.stringify(r.detail));
  const row = r.dataset.features()[0].properties;

  /* 値が読めない地物と、地面を持たない地物は、別の欄に数えられる——同じ「寄与しなかった」でも
     読者がやれることが違う。 */
  assert.equal(row._statSkipped, 1, '値が読めない地物が「交差しなかった」ことにされている');
  assert.equal(row._statNoWeight, 2, '線と点が重み無しとして数えられていない: ' + row._statNoWeight);
  /* 寄与したのは中の 1 件だけなので、平均はその値そのもの。 */
  assert.equal(row.awm, 100, '交差面積 0 の地物が平均に寄与した: ' + row.awm);
  assert.ok(Math.abs(row._weightKm2 - row._areaKm2) < 1e-6, '有効面積に地面を持たないものが混じっている');

  /* 辺を共有するだけの面は、そもそも member として数えられていない。 */
  const counted = await aggregate(ops, data, { stat: 'count', outName: 'n' }, mixed);
  assert.equal(counted.dataset.features()[0].properties.n, 4, '辺を共有するだけの面が区域の member に数えられた');
});

/* ══ ⑤ 列が述べた量は、params に書かなくても効く ═════════════════════════════════════════ */

test('R819 ⑤ 量は列のメタデータから拾われ、params がそれに優先する', async () => {
  const { data, ops, units } = await boot();
  const z = data.add(ZONE());
  const m = data.add(MEMBERS());

  /* 読者が「この列は密度だ」と述べる。宣言は js/gis-units.js が読める形でなければならない。 */
  const d = data.declareField(m.id, 'v', { quantity: DENSITY });
  assert.equal(d.ok, true, '列に量を宣言できない: ' + d.why + ' ' + JSON.stringify(d.detail));
  assert.deepEqual(d.field.quantity, DENSITY, '宣言が列に載っていない');
  assert.equal(d.field.quantityStated, 'reader', '誰が述べたかが列に無い');
  assert.equal(d.field.quantityRefused, undefined, '単位核が読める宣言が拒まれている');

  /* 密度の単純平均は面の平均ではない、と js/gis-units.js は述べている。params に何も書かず
     とも、列の宣言だけでその判断に届かなければならない。 */
  assert.equal(units.aggregation(DENSITY, 'mean').verdict, 'needs-weight', '前提が崩れている');
  const plain = await ops.run({ op: 'aggregate', inputs: [z.id, m.id], params: { stat: 'mean', field: 'v', outName: 'm' } });
  assert.equal(plain.ok, false, '列が密度だと述べているのに単純平均が通った');
  assert.equal(plain.why, 'aggregation-needs-weight');
  assert.equal(plain.detail.remedy, 'areaWeightedMean', '出口が名指されていない');

  /* 誰が述べたのかが記録に残る。 */
  const ok = await ops.run({ op: 'aggregate', inputs: [z.id, m.id], params: { stat: 'areaWeightedMean', field: 'v', outName: 'awm' } });
  assert.equal(ok.ok, true, ok.why + ' ' + JSON.stringify(ok.detail));
  assert.equal(ok.stats.aggregation.quantityStatedBy, 'column', '列の宣言が呼び手のものとして記録された');
  assert.equal(ok.stats.aggregation.verdict, 'allowed');

  /* params は列に優先する——呼び手の陳述は「この run について」の、より新しく限定的な陳述。 */
  const CATEGORY = { kind: 'category', space: 'point' };
  const over = await ops.run({ op: 'aggregate', inputs: [z.id, m.id], params: { stat: 'mean', field: 'v', outName: 'm', quantity: CATEGORY } });
  assert.equal(over.ok, false, '呼び手の宣言が無視された');
  assert.equal(over.why, 'aggregation-refused');
  assert.equal(over.detail.why, 'aggregating-a-category', '列の宣言のほうが勝っている');
});

/* ══ ⑥ 量を述べない既存の呼び出しは、1 ビットも変わらない ═══════════════════════════════ */

test('R819 ⑥ 誰も量を述べていない run は、これまでと同じ答えと同じ記録', async () => {
  const { data, ops } = await boot();
  for (const stat of ['count', 'sum', 'mean', 'min', 'max']) {
    const r = await aggregate(ops, data, stat === 'count' ? { stat: stat, outName: 'o' } : { stat: stat, field: 'v', outName: 'o' });
    assert.equal(r.ok, true, stat + ' が拒まれた: ' + r.why + ' ' + JSON.stringify(r.detail));
    const row = r.dataset.features()[0].properties;
    if (stat === 'count') assert.equal(row.o, 2);
    if (stat === 'sum') assert.equal(row.o, 110);
    if (stat === 'mean') assert.equal(row.o, 55);
    if (stat === 'min') assert.equal(row.o, 10);
    if (stat === 'max') assert.equal(row.o, 100);
    assert.equal(row._weightBy, undefined, '重み付けていない stat に基準の列が生えた');
    /* 沈黙は許可でも拒否でもない——判定は記録され、run は変わらない。⚠ `count` だけは 'allowed'
       で、それは量についての判定ではない: 行を数えることは行についての問いなので、js/gis-units.js
       は量を読む前に答える。 */
    const want = (stat === 'count') ? 'allowed' : 'undeclared';
    assert.equal(r.stats.aggregation.verdict, want, stat + ' の判定が ' + r.stats.aggregation.verdict);
    assert.equal(r.stats.aggregation.quantityStatedBy, undefined, '誰も述べていないのに著者が書かれた');
  }
});

/* ══ ⑦ 列名が変わっても量は付いてくる ═══════════════════════════════════════════════════ */

test('R819 ⑦ 量は、名前が残る限り残り、接頭辞が付いても付いてくる', async () => {
  const { data, ops } = await boot();
  const m = data.add(MEMBERS());
  assert.equal(data.declareField(m.id, 'v', { quantity: DENSITY }).ok, true);

  /* 名前が残る演算——行が減っても列は同じ列である。 */
  const f = await ops.run({ op: 'filter', inputs: [m.id], params: { where: [{ field: 'v', op: '>', value: 50 }] } });
  assert.equal(f.ok, true, 'filter が拒まれた: ' + f.why);
  const kept = f.dataset.fields.find((x) => x.name === 'v');
  assert.deepEqual(kept.quantity, DENSITY, 'filter の出力が列の量を落とした');
  assert.equal(kept.quantityStated, 'inherited', '運ばれたものが読者の宣言として書かれている');
  assert.equal(kept.quantityStatedAt, 'reader', '元の著者が忘れられている');

  /* 接頭辞は改名であり、改名された列は同じ量である。 */
  const other = data.add({
    title: 'keys',
    features: [feat({ type: 'Point', coordinates: [0.5, 0.5] }, { name: 'A' })],
  });
  const j = await ops.run({ op: 'join', inputs: [other.id, m.id], params: { leftField: 'name', rightField: 'name', prefix: 'm_', duplicates: 'first' } });
  assert.equal(j.ok, true, 'join が拒まれた: ' + j.why + ' ' + JSON.stringify(j.detail));
  const moved = j.dataset.fields.find((x) => x.name === 'm_v');
  assert.ok(moved, '結合が列を運んでいない');
  assert.deepEqual(moved.quantity, DENSITY, '改名された列が量を失った');

  /* そして運ばれた宣言は、次の op でそのまま効く。 */
  const z = data.add(ZONE());
  const again = await ops.run({ op: 'aggregate', inputs: [z.id, f.dataset.id], params: { stat: 'mean', field: 'v', outName: 'o' } });
  assert.equal(again.ok, false, '運ばれた宣言が次の op に届いていない');
  assert.equal(again.why, 'aggregation-needs-weight');
});

/* ══ ⑧ 格子の帯が述べた量は、列としても読める ═══════════════════════════════════════════ */

test('R819 ⑧ 帯の量は列にも載り、誰が述べたかが記録される', async () => {
  const { data } = await boot();
  const g = data.add({
    kind: 'raster', title: 'g', width: 2, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'pop', unit: '1/km2', quantity: DENSITY }],
    read: () => Float64Array.from([1, 2]),
  });
  assert.deepEqual(g.bands[0].quantity, DENSITY, '帯の宣言が registry で落ちた');
  const col = g.fields.find((x) => x.name === 'pop');
  assert.deepEqual(col.quantity, DENSITY, '帯の量が列に届いていない（同じ picker が指す同じもの）');
  assert.equal(col.quantityStated, 'source', '格子と一緒に来たものが読者の宣言として書かれている');
});

/* ══ ⑨ 割合の分母は「別の列の名前」として述べられる ══════════════════════════════════════ */

test('R819 ⑨ 割合の分母となる列を宣言でき、それがどの判定も変えない', async () => {
  const { units } = await boot();
  const ratio = { kind: 'ratio', space: 'point', denominator: 'households' };
  const q = units.quantity(ratio);
  assert.equal(q.ok, true, '分母つきの宣言が読めない: ' + q.why);
  assert.equal(q.q.denominator, 'households', '分母の列が運ばれていない');
  assert.equal(q.q.weight, 'denominator', '既存の規則が変わった');

  /* 分母を述べたことで判定が動いてはならない——この核が足したのは名前であって規則ではない。 */
  const without = { kind: 'ratio', space: 'point' };
  for (const m of units.quantityVocabulary().methods) {
    const a = units.aggregation(without, m), b = units.aggregation(ratio, m);
    assert.equal(b.verdict, a.verdict, m + ' の判定が分母の有無で変わった');
    assert.equal(b.remedy || null, a.remedy || null, m + ' の出口が変わった');
  }
  assert.ok(units.quantityVocabulary().specFields.indexOf('denominator') >= 0, '宣言の欄が公開されていない');
});
