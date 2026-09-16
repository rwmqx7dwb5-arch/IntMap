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

/* The map is a stub, and it RECORDS WHAT IT WAS ASKED — that is the whole of ②. It answers through
   the real registry so the rows it hands back are real records with real provenance. */
function stubLayers(rows) {
  const asked = [];
  return {
    asked,
    acquireFields: (kind) => (String(kind) === 'raster'
      ? ['bounds', 'width', 'height', 'where', 'unit']
      : ['bounds', 'where', 'fields', 'limit', 'cursor', 'time']),
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

async function boot(layerRows) {
  const w = installWindow();
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

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);

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

test('① js/gis-atlas.js は取得条件の一覧を自分で持たず、js/gis-layers.js に訊く', async () => {
  const src = read('js/gis-atlas.js');
  assert.ok(/acquireFields\(/.test(src), 'gis-atlas は acquireFields を呼んでいない');
  /* ⚠ 測っているのは「2 つ目の一覧が無いこと」。欄名を並べた配列リテラルがこの file に現れたら、
     それが 2 つ目の一覧である（#R747 の targets はまさにそれで本番の 5 問を全滅させた）。
     `sample` の 3 欄だけは古い綴りの写しとして許す——同じ 3 語が js/gis-layers.js の raster 側に
     在るので、増えも減りもしないことを ② が測る。 */
  const lists = src.match(/\[\s*'[a-z]+'(?:\s*,\s*'[a-z]+')+\s*\]/g) || [];
  for (const lit of lists) {
    const names = lit.match(/'[a-z]+'/g).map((s) => s.slice(1, -1));
    const isWindow = names.length === 3 && names.every((n) => ['bounds', 'width', 'height'].indexOf(n) >= 0);
    const isKinds = names.length === 2 && names.indexOf('vector') >= 0 && names.indexOf('raster') >= 0;
    assert.ok(isWindow || isKinds, '取得語彙の 2 つ目の一覧がある: ' + lit);
  }
});

test('① 知らない欄は名前で拒まれ、拒否が語彙を運ぶ', async () => {
  const { atlas, layers } = await boot([{ id: 'heritage', label: 'WHS', features: [pt(1, 1, { a: 1 })] }]);
  const r = await atlas.run({ inputs: ['layer:heritage'], acquire: { bbox: [0, 0, 1, 1] } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'acquire-unknown-field');
  assert.equal(r.detail.field, 'bbox');
  assert.deepEqual(r.detail.accepts, layers.acquireFields('vector'));
});

/* ══ ② 条件が実際に下へ渡る ═════════════════════════════════════════════════════════════ */

test('② Atlas が op を走らせるとき、取得条件がレイヤーの扉まで届く', async () => {
  const { atlas, layers } = await boot([{ id: 'heritage', label: 'WHS', features: [pt(1, 1, { m: 5 }), pt(2, 2, { m: 1 })] }]);
  const want = { bounds: [0, 0, 5, 5], where: [{ field: 'm', op: '>=', value: 2 }], limit: 10, cursor: null, fields: ['m'], time: '1889' };
  const r = await atlas.run({ op: 'filter', inputs: ['layer:heritage'], params: { where: [{ field: 'm', op: '>=', value: 2 }] }, acquire: want });
  assert.equal(r.ok, true, r.why);
  assert.equal(layers.asked.length, 1);
  assert.deepEqual(layers.asked[0].opts, want, 'toDataset に渡った条件が依頼と違う');
});

test('② 条件を述べなければ空の要求になる — カメラの箱をこの file が作らない', async () => {
  const { atlas, layers } = await boot([{ id: 'heritage', label: 'WHS', features: [pt(1, 1, {})] }]);
  await atlas.run({ inputs: ['layer:heritage'] });
  assert.deepEqual(layers.asked[0].opts, {}, 'この扉は要求を発明してはならない');
});

test('② 窓を 2 通りに述べたら拒む（どちらを意味したかは分からない）', async () => {
  const { atlas } = await boot([{ id: 'dem', label: 'DEM', samplable: true }]);
  const r = await atlas.run({
    op: 'rasterMask', inputs: ['layer:dem'],
    acquire: { bounds: [0, 0, 1, 1], width: 4, height: 4 }, sample: { bounds: [9, 9, 10, 10], width: 4, height: 4 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'window-stated-twice');
});

/* ══ ③ op の無い依頼は取得である ═══════════════════════════════════════════════════════ */

test('③ op を述べない依頼は取得で、coverage と next が呼び手に届く', async () => {
  const { atlas } = await boot([{
    id: 'heritage', label: 'WHS', features: [pt(1, 1, {})],
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

test('③ 入力を述べない取得は、何が在るかを添えて拒む', async () => {
  const { atlas } = await boot([{ id: 'heritage', label: 'WHS', features: [pt(1, 1, {})] }]);
  const r = await atlas.run({});
  assert.equal(r.ok, false);
  assert.equal(r.why, 'missing-input');
  assert.deepEqual(r.detail.layers, ['layer:heritage']);
});

test('③ op を走らせたときも、その途中で取得したものが答えに載る', async () => {
  const { atlas } = await boot([{ id: 'heritage', label: 'WHS', features: [pt(1, 1, { m: 5 })], next: 'heritage@1' }]);
  const r = await atlas.run({ op: 'filter', inputs: ['layer:heritage'], params: { where: [{ field: 'm', op: '>=', value: 1 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.acquired.length, 1);
  assert.equal(r.acquired[0].next, 'heritage@1');
});

/* ══ ④⑤ coverage は演算をまたぐ ═════════════════════════════════════════════════════════ */

test('④ 出力の coverage は入力から来る — 最も弱いものが残る', async () => {
  const { atlas, ops, data } = await boot([]);
  const a = data.add({ title: 'a', features: [pt(1, 1, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'all', reason: null } } });
  const b = data.add({ title: 'b', features: [pt(2, 2, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'partial', reason: 'limit-truncated' } } });
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

test('⑤ 何も述べていない入力があるとき `all` とは述べず、開いたままだと言う', async () => {
  const { ops, data } = await boot([]);
  const a = data.add({ title: 'a', features: [pt(1, 1, { m: 5 })], provenance: { kind: 'layer', coverage: { completeness: 'all', reason: null } } });
  const b = data.add({ title: 'b', features: [pt(2, 2, { m: 5 })] });   /* an imported file: nobody measured what it is part of */
  const r = await ops.run({ op: 'relate', inputs: [a.id, b.id], params: { predicate: 'nearer-than', maxKm: 5000 } });
  assert.equal(r.ok, true, r.why);
  const cov = r.dataset.provenance.coverage;
  assert.equal(cov.completeness, undefined, '沈黙を all と読んではならない');
  assert.deepEqual(cov.undeclaredInputs, [b.id]);
});

test('⑤ どの入力も何も述べていなければ coverage は作られない', async () => {
  const { ops, data } = await boot([]);
  const a = data.add({ title: 'a', features: [pt(1, 1, { m: 5 })] });
  const r = await ops.run({ op: 'filter', inputs: [a.id], params: { where: [{ field: 'm', op: '>=', value: 1 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.provenance.coverage, undefined);
});

/* ══ ⑥ 単位は名前の残った列に付いて回る ═════════════════════════════════════════════════ */

test('⑥ 読者が述べた単位は演算の出力にも残り、著者は書き換えられない', async () => {
  const { ops, data } = await boot([]);
  const a = data.add({ title: 'a', features: [pt(1, 1, { pop: 5 }), pt(2, 2, { pop: 1 })] });
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

test('⑥ 出力に無い列について述べられた単位は、列を発明しない', async () => {
  const { ops, data } = await boot([]);
  const a = data.add({ title: 'a', features: [pt(1, 1, { pop: 5 })] });
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

test('⑦ 時点の違う 2 つの格子の差は、両方を含む区間になる', async () => {
  const { ops, data } = await boot([]);
  const a = data.add(grid([4, 4, 4, 4], { kind: 'constant', start: '2020', end: '2020' }));
  const b = data.add(grid([1, 1, 1, 1], { kind: 'constant', start: '2025', end: '2025' }));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time.kind, 'constant');
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2025').end);
  assert.deepEqual(r.dataset.provenance.inputTimes.map((t) => t.id), [a.id, b.id]);
});

test('⑦ 片方が時点を述べていなければ、もう片方の日付を答えにしない', async () => {
  const { ops, data } = await boot([]);
  const a = data.add(grid([4, 4, 4, 4], { kind: 'constant', start: '2020', end: '2020' }));
  const b = data.add(grid([1, 1, 1, 1], null));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time, null, '述べられていない時点を、隣の行から代入してはならない');
  assert.equal(r.dataset.provenance.inputTimes.length, 2);
});

test('⑦ 同じ時点の 2 つなら、その時点のまま', async () => {
  const { ops, data } = await boot([]);
  const t = { kind: 'constant', start: '2020', end: '2020' };
  const a = data.add(grid([4, 4, 4, 4], t));
  const b = data.add(grid([1, 1, 1, 1], { kind: 'constant', start: '2020', end: '2020' }));
  const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.time.start, data.momentOf('2020').start);
  assert.equal(r.dataset.time.end, data.momentOf('2020').end);
});

/* ══ ⑧ datasetRow は coverage を投影する（欄を写さない）═══════════════════════════════════ */

test('⑧ coverage に足された欄は、その日のうちに planner へ届く', async () => {
  const { atlas, data } = await boot([]);
  const a = data.add({
    title: 'a', features: [pt(1, 1, {})],
    provenance: { kind: 'layer', coverage: { completeness: 'sample', reason: 'grid-is-a-sample', somethingAddedTomorrow: 'x' } },
  });
  const row = atlas.catalogue().datasets.find((d) => d.id === a.id);
  assert.equal(row.coverage.somethingAddedTomorrow, 'x', 'coverage の欄が手書きの一覧で切られている');
});

/* ══ 契約の外側 — 宣言が実装と一致していること ═══════════════════════════════════════════ */

test('⑨ data.gis の schema は op を要求せず、acquire を宣言している', async () => {
  const src = read('js/atlas-schemas.js');
  const line = src.split('\n').find((l) => l.indexOf("'data.gis':") >= 0);
  assert.ok(line, 'data.gis の schema が無い');
  assert.ok(/acquire:\s*obj\(\)/.test(line), 'acquire が宣言されていない＝planner には存在しない');
  assert.ok(/required:\s*\['inputs'\]/.test(line), 'op を要求したままでは取得だけの依頼が送れない');
});

test('⑩ planner が読む目録が acquire と coverage を述べている', async () => {
  const src = read('js/atlas-catalog-text.js');
  const i = src.indexOf("ids: ['data.gis'");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf('\n', src.indexOf("t: '", i) + 4000) + 1);
  for (const word of ['"acquire"', 'coverage', 'cursor']) {
    assert.ok(block.indexOf(word) >= 0, '目録が ' + word + ' を述べていない（述べられていない能力は無い能力）');
  }
});

test('⑪ 供給元になれると述べた行は、絞り込みを持たない', async () => {
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

test('⑫ 格子の時点は、その格子から作った格子にも残る（宣言の冪等性）', async () => {
  const { ops, data } = await boot([]);
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
