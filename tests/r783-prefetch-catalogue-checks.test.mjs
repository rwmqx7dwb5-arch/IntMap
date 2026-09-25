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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const WORLD = { w: -180, s: -90, e: 180, n: 90 };
const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);

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

async function boot() {
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
  const rows = [pt(1, 1, { name: 'a', year: 1889 }), pt(2, 2, { name: 'b', year: 1901 })];
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
    source: () => 'airplanes.live',
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry, layers, data } = await boot();
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
  const { atlas, sources, layers, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry, w } = await boot();
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
  const { atlas, sources, registry } = await boot();
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
  const { atlas, registry } = await boot();
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
  const { atlas, registry, layers } = await boot();
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
