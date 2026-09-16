/* ============================================================================
 *  #R765 · 「作業を再開できる」と「その結果をもう一度出せる」は別のこと
 * ----------------------------------------------------------------------------
 *  js/gis-project.js save()/load() make an analysis RESUMABLE — the inputs come back whole, the ops
 *  replay, and a changed engine is reported (#R749). That is right, and it is not reproducibility.
 *  A recipe replayed on a different engine, against an upstream that has refreshed, at a different
 *  hour, is a NEW answer wearing the old one's name; the version comparison can only say 「違う」
 *  afterwards, to whoever happens to be looking.
 *
 *  ⚠ WHAT WAS MISSING IS A DOCUMENT, NOT A STORE. 「この数は何から、どうやって出たのか」 had an
 *  answer spread across four modules and reachable only by walking them by hand. `manifest()` walks
 *  them once and writes it down; `verify()` makes 「同じ結果が出たか」 a measurement instead of a hope.
 *
 *  ⚠⚠ THE MOST IMPORTANT FIELD IS `gaps`. A manifest that listed only what the app knows would be
 *  「知らない」を「全部だ」の代わりにする ([[intmap-one-store-was-asked]]) — and the things this app
 *  genuinely cannot establish about its own answer (an upstream nobody versions, an import whose
 *  bytes are not kept, a step computed before the engine stamped itself) are the first thing a
 *  reader checking somebody else's number needs. So the tests below measure that the gaps are
 *  PRESENT and TRUE, not merely that the happy fields are filled.
 *
 *  ⚠⚠⚠ AND ONE DEFECT FOUND ON THE WAY: a record carried no statement of what computed it. #R749
 *  stamped the engine into steps js/gis-project.js SAVES — which covers a reopened project and
 *  nothing else. The record sitting in the registry right now, the one about to be exported, said
 *  nothing, and asking the kernels later answers a different question («what is loaded now»).
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
  const { makeGisProject } = await import('../js/gis-project.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster(); w.IntMapGisExpr = makeGisExpr();
  const project = makeGisProject();
  w.IntMapGisProject = project;
  await geometry.ready();
  return { w, data, ops, project };
}

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

/* ══ ① 記録が、自分を計算したエンジンを述べる ═══════════════════════════════════════════════ */

test('① 演算の出力は、計算した瞬間のエンジンの版を持って登録される', async () => {
  const { data, ops } = await boot();
  const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 5 })] });
  const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
  assert.equal(r.ok, true, r.why);
  const eng = r.dataset.provenance.engine;
  assert.ok(eng && typeof eng === 'object', '計算したエンジンの版が記録に無い');
  assert.ok(eng.ops, 'ops の版が入っていない: ' + JSON.stringify(eng));
  /* ⚠ 「いま載っている版」を後から訊くのとは別の問い。両方が在って、混ざっていないこと。 */
  assert.equal(typeof eng.ops, 'string');
});

test('① そのモジュールが載っていなければ、今日の版で埋めずに黙る', async () => {
  const { w, data, ops } = await boot();
  delete w.IntMapGisProject;                     /* 版を配る者が居ない状態 */
  const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 })] });
  const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 0 }] } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.provenance.engine, undefined, '測れなかった版が、何かで埋められている');
});

/* ══ ② manifest が鎖を 1 つの文書にする ═════════════════════════════════════════════════════ */

test('② manifest は、入力から答えまでを入力が先の順で並べ、各段の由来を述べる', async () => {
  const { data, ops, project } = await boot();
  const src = data.add({
    title: '施設', features: [pt(0, 0, { n: 1, mass: 3 }), pt(1, 1, { n: 5, mass: 8 })],
    provenance: { kind: 'layer', layer: 'pharma', coverage: { completeness: 'all', reason: null } },
  });
  data.declareField(src.id, 'mass', { unit: 'kg' });
  const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
  assert.equal(f.ok, true, f.why);

  const m = await project.manifest(f.dataset.id);
  assert.equal(m.ok, true, m.why);
  assert.equal(m.steps.length, 2, '鎖が 2 段になっていない');
  assert.equal(m.steps[0].id, src.id, '入力が先に来ていない');
  assert.equal(m.steps[1].id, f.dataset.id);

  /* 取得の段は、どのレイヤーから・どこまで答えられたかを持つ */
  assert.equal(m.steps[0].origin, 'layer');
  assert.equal(m.steps[0].acquisition.layer, 'pharma');
  assert.equal(m.steps[0].coverage.completeness, 'all');
  /* 単位は、誰が述べたかごと運ばれる */
  const mass = m.steps[0].fields.find((x) => x.name === 'mass');
  assert.equal(mass.unit, 'kg');
  /* 演算の段は、もう一度走らせられる形のレシピを持つ */
  assert.equal(m.steps[1].origin, 'op');
  assert.equal(m.steps[1].recipe.op, 'filter');
  assert.deepEqual(m.steps[1].recipe.inputs, [src.id]);
  assert.ok(m.steps[1].engineThen && m.steps[1].engineThen.ops, 'その段を計算した版が無い');
  /* そして「いま」と「そのとき」は別の欄で、混ざっていない */
  assert.ok(m.engineNow && m.engineNow.ops);
});

/* ══ ③ 述べられないことを、述べる ═══════════════════════════════════════════════════════════ */

test('③ 上流に版が無いことは、黙って省かれず gap として出る', async () => {
  const { data, ops, project } = await boot();
  const src = data.add({
    title: 'L', features: [pt(0, 0, { n: 1 })],
    provenance: { kind: 'layer', layer: 'aircraft', coverage: { completeness: 'partial', reason: 'supplier-view-bound' } },
  });
  const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 0 }] } });
  const m = await project.manifest(f.dataset.id);
  const kinds = m.gaps.map((g) => g.gap);
  assert.ok(kinds.indexOf('upstream-not-versioned') >= 0,
    '上流に版が無いことが述べられていない: ' + JSON.stringify(kinds));
  /* ⚠ gap は理由の文を持つ — コードだけでは読者に届かない */
  const g = m.gaps.find((x) => x.gap === 'upstream-not-versioned');
  assert.ok(g.means && g.means.length > 5, 'gap に読者向けの説明が無い');
  assert.equal(g.step, src.id, 'どの段の話かが述べられていない');
});

test('③ 取り込んだファイルは、元のバイトを保持していないことを述べる', async () => {
  const { data, project } = await boot();
  const src = data.add({
    title: 'f', features: [pt(0, 0, {})],
    provenance: { kind: 'import', file: 'x.geojson', format: 'geojson', readAt: 1 },
  });
  const m = await project.manifest(src.id);
  const kinds = m.gaps.map((g) => g.gap);
  assert.ok(kinds.indexOf('source-bytes-not-kept') >= 0, JSON.stringify(kinds));
  assert.equal(m.steps[0].file, 'x.geojson');
});

test('③ 供給元が完全性を述べていなければ、それも gap になる', async () => {
  const { data, project } = await boot();
  const src = data.add({
    title: 'L', features: [pt(0, 0, {})],
    provenance: { kind: 'layer', layer: 'webcams' },       /* coverage なし */
  });
  const m = await project.manifest(src.id);
  const kinds = m.gaps.map((g) => g.gap);
  assert.ok(kinds.indexOf('coverage-unstated') >= 0, JSON.stringify(kinds));
});

/* ══ ④ 指紋は「同じ答えか」を測れるようにする ═══════════════════════════════════════════════ */

test('④ 同じ中身は同じ指紋、違う中身は違う指紋', async () => {
  const { data, project } = await boot();
  const a = data.add({ title: 'a', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
  const b = data.add({ title: 'b', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
  const c = data.add({ title: 'c', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 3 })] });
  const ma = await project.manifest(a.id), mb = await project.manifest(b.id), mc = await project.manifest(c.id);
  assert.ok(ma.answer.fingerprint, '指紋が取れていない');
  assert.equal(ma.answer.fingerprint, mb.answer.fingerprint, '同じ中身が違う指紋になった');
  assert.notEqual(ma.answer.fingerprint, mc.answer.fingerprint, '違う中身が同じ指紋になった');
});

test('④ 属性の書き順は指紋を変えない — 並びが違うだけの同じ答えは同じ答え', async () => {
  const { data, project } = await boot();
  const a = data.add({ title: 'a', features: [{ type: 'Feature', properties: { x: 1, y: 2 }, geometry: { type: 'Point', coordinates: [0, 0] } }] });
  const b = data.add({ title: 'b', features: [{ type: 'Feature', properties: { y: 2, x: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } }] });
  const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
  assert.equal(ma.answer.fingerprint, mb.answer.fingerprint,
    'キーの順だけが違うものが、別の答えとして数えられている');
});

test('④ 地物の並び順は指紋を変える — 順序は答えの一部である', async () => {
  const { data, project } = await boot();
  const a = data.add({ title: 'a', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
  const b = data.add({ title: 'b', features: [pt(1, 1, { n: 2 }), pt(0, 0, { n: 1 })] });
  const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
  assert.notEqual(ma.answer.fingerprint, mb.answer.fingerprint);
});

test('④ 格子は、画素の並びと「どこに置かれているか」の両方から指紋を取る', async () => {
  const { data, project } = await boot();
  const mk = (west) => {
    const cells = Float64Array.from([1, 2, 3, 4]);
    return { kind: 'raster', title: 'g', width: 2, height: 2, grid: { west: west, north: 10, pixelLng: 1, pixelLat: 1 }, bands: [{ name: 'v', unit: null, nodata: null }], read: () => cells };
  };
  const a = data.add(mk(0)), b = data.add(mk(50));
  const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
  assert.ok(ma.answer.fingerprint);
  assert.notEqual(ma.answer.fingerprint, mb.answer.fingerprint,
    '同じ画素が別の場所に置かれたものが、同じ答えとして数えられている');
});

/* ══ ⑤ verify は 3 つを答える ═══════════════════════════════════════════════════════════════ */

test('⑤ verify は「同じ」「違う」「測れなかった」を分ける', async () => {
  const { data, ops, project } = await boot();
  const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 5 })] });
  const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
  const m = await project.manifest(f.dataset.id);

  const same = await project.verify(f.dataset.id, m);
  assert.equal(same.verdict, 'same', JSON.stringify(same));

  const diff = await project.verify(src.id, m);
  assert.equal(diff.verdict, 'different', '別の記録が「同じ」と判定された');

  /* 指紋が無ければ「同じ」ではない——ここが潰れると、この仕組みは何も保証しない */
  const un = await project.verify(f.dataset.id, { answer: { fingerprint: null } });
  assert.equal(un.verdict, 'unmeasurable', '測れなかったものが「同じ」に潰れている');
});

test('⑤ 指紋を取らないよう頼めば、そう述べる（黙って null にしない）', async () => {
  const { data, project } = await boot();
  const a = data.add({ title: 'a', features: [pt(0, 0, {})] });
  const m = await project.manifest(a.id, { fingerprint: false });
  assert.equal(m.ok, true);
  assert.equal(m.steps[0].fingerprint, undefined, '頼まれていない指紋の欄が作られている');
  assert.equal(m.gaps.filter((g) => g.gap === 'fingerprint-unavailable').length, 0,
    '取らないと決めたことが「取れなかった」として報告されている');
});

/* ══ ⑥ 宣言と実体 ═══════════════════════════════════════════════════════════════════════════ */

test('⑥ manifest の版が公表されていて、文書がこの口を述べている', async () => {
  const { project } = await boot();
  assert.equal(typeof project.manifestVersion, 'number');
  const doc = read('docs/GIS-CORE.md');
  assert.ok(/manifest\(/.test(doc), 'docs/GIS-CORE.md が manifest を述べていない');
  assert.ok(/gaps/.test(doc), '文書が gaps を述べていない（この文書のいちばん重要な欄）');
});

test('⑥ 知らない id は名前を付けて断る', async () => {
  const { project } = await boot();
  const m = await project.manifest('no-such-thing');
  assert.equal(m.ok, false);
  assert.equal(m.why, 'unknown-dataset');
});
