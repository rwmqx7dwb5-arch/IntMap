/* ============================================================================
 *  #R819 · 「窓は取れた。条件はまだ走っていない」 を、読者と Atlas に出さない
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  js/gis-sources.js acquirePlanned() states WHERE EACH CONDITION RUNS and refuses to pretend the
 *  later stage ran: a window whose attribute conditions are still pending comes back as
 *  `kind:'staged'`, never as `kind:'features'`. That is right, and it is only half an answer —
 *  measurable on the code as it stood:
 *
 *    ① js/gis-layers.js acquireDataset() called acquire(), so the staged road was unreachable from
 *       the one door Atlas holds: a supplier that serves a window but cannot filter refused the whole
 *       request (`where-not-supported`), and 「区域は上流で、属性条件は後段で」 could be PLANNED and
 *       not RUN. A reader that does run it would be running comparisons of its own, which is the
 *       second spelling of js/gis-ops.js's filter that #R783 measured the cost of.
 *    ② The planner could not say 「この取得は測定である」. `analysis` was implemented below and absent
 *       from js/gis-layers.js acquireFields(), which is the list js/gis-atlas.js validates against —
 *       so a field that exists is refused by name ([[intmap-prompt-that-hid-the-tools-in-hand]]).
 *    ③ 「この供給元は画面と独立に取れるか・期間を扱えるか・全件の終わりを確認できるか」 could only be
 *       learnt by acquiring and looking at what came back. capabilitiesOf() derives all three from the
 *       registration, and nothing published it before a fetch.
 *
 *  ⚠ WHAT MUST STAY TRUE, AND HOW IT IS MEASURED HERE:
 *    · `kind:'staged'` never reaches a reader — the later stage RUNS, through js/gis-ops.js's filter
 *      and not through a comparison written in the bridge, and the record says who executed what.
 *    · The resolved reason is CARRIED, not deleted: `where-pending-post-stage` is what was resolved
 *      and the record names it, because 「後段は無かった」 と 「後段を実行した」 are different answers.
 *    · An acquisition with no later stage answers EXACTLY what it answered before — measured against
 *      the old door (sources.acquire) statement by statement, not against a copy written here.
 *    · `plan-unsatisfiable` and `renderer-view-dependent` travel all the way up, unswallowed.
 *    · The working records the op needed do not survive: the answer's recipe is the ACQUISITION.
 *
 *  ⚠ THE READERS BELOW ARE THE REAL MODULES. The registry is the only stub (js/map-ui.js needs a DOM
 *  this process has not got) and it is no more capable than the real one; every judgement measured
 *  here is made by js/gis-sources.js, js/gis-layers.js, js/gis-ops.js or js/gis-atlas.js
 *  ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const WORLD = { w: -180, s: -90, e: 180, n: 90 };
const BOX = [[0, 0], [10, 10]];
const pt = (lng, lat, p, id) => {
  const f = { type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } };
  if (id != null) f.id = id;
  return f;
};
const inBox = (f, b) => {
  const c = f && f.geometry && f.geometry.coordinates;
  return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
};
const boxOf = (bbox) => (bbox == null ? { ...WORLD }
  : (Array.isArray(bbox) ? { w: bbox[0], s: bbox[1], e: bbox[2], n: bbox[3] } : bbox));

/* ⚠ THE REGISTRY IS A STUB AND THE CONTRACT IS NOT — the shape js/map-ui.js publishes, with `holds`
   written on the REGISTRATION exactly where a real layer writes it. */
function makeRegistry() {
  const REG = {};
  return {
    register: (id, impl) => { REG[id] = impl || {}; },
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
    featuresIn: (id, bounds) => {
      const r = REG[id];
      if (!r || !r.featuresIn) return null;
      try { return r.featuresIn(bounds); } catch (_) { return null; }
    },
    featuresInSource: () => null,
    narrow: (all, bounds) => {
      if (!Array.isArray(all)) return null;
      if (!bounds) return all.slice();
      const b = { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] };
      return all.filter((f) => inBox(f, b));
    },
    sampleAt: async () => [],
    loaderOf: (id) => { const r = REG[id]; return (r && typeof r.loader === 'function') ? r.loader : null; },
    active: () => Object.keys(REG).filter((id) => REG[id].on && REG[id].on()),
    context: () => [],
  };
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);

  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');

  const data = makeGisDatasets();
  const ops = makeGisOps();
  w.IntMapData = data;
  w.IntMapGisOps = ops;
  w.IntMapGisRaster = makeGisRaster();
  const registry = makeRegistry();
  w.IntMapLayers = registry;
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => -180, getSouth: () => -90, getEast: () => 180, getNorth: () => 90 }) },
  };
  const sources = makeGisSources();
  w.IntMapGisSources = sources;
  const layers = makeGisLayers();
  w.IntMapGisLayers = layers;
  const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true }) });
  return { w, data, ops, sources, layers, atlas, registry };
}

/* 区域は答えられるが属性条件は実行できない上流。⚠ 黙って無視するのではなく、能力を申告していない。 */
function windowOnly(feats) {
  let calls = 0;
  const impl = {
    where: false, cursor: false, limit: false, fields: false,
    fetch: async (req) => {
      calls++;
      const b = boxOf(req.bbox);
      const got = feats.filter((f) => inBox(f, b));
      return { ok: true, features: got, next: null, coverage: { served: b, complete: true, available: got.length } };
    },
  };
  impl.calls = () => calls;
  return impl;
}

/* 区域も属性条件も上流で実行する。比較は 1 つ（>=）だけで、それがこの上流の全部。 */
function filtering(feats) {
  return {
    where: true, cursor: false, limit: false, fields: false,
    fetch: async (req) => {
      const b = boxOf(req.bbox);
      let got = feats.filter((f) => inBox(f, b));
      for (const c of (req.where || [])) got = got.filter((f) => Number(f.properties[c.field]) >= Number(c.value));
      return { ok: true, features: got, next: null, coverage: { served: b, complete: true, available: got.length, filteredBy: 'supplier' } };
    },
  };
}

const ROWS = () => [pt(1, 1, { v: 1 }, 'a'), pt(2, 2, { v: 2 }, 'b'), pt(3, 3, { v: 3 }, 'c')];
const WHERE = [{ field: 'v', op: '>=', value: 2 }];
const vsOf = (features) => features.map((f) => f.properties.v).sort((a, b) => a - b);

/* ══ ① staged は読者に出ない —— 後段が実行され、完全な答えになる ═══════════════════════════════ */

test('R819 ① 属性条件に未対応の供給元でも、取得の扉は条件を実行した答えを返す', async () => {
  const { sources, layers, data } = await boot();
  const impl = windowOnly(ROWS());
  sources.supply('win', impl);

  /* 供給層の側では、これはまだ答えではない（そこが正しい） */
  const staged = await sources.acquirePlanned('win', { bbox: [0, 0, 10, 10], where: WHERE });
  assert.equal(staged.kind, 'staged', '前提が崩れている: 供給層が staged を名乗っていない');

  const made = await layers.acquireDataset('win', { bounds: BOX, where: WHERE });
  assert.equal(made.ok, true, JSON.stringify(made));
  const rec = data.get(made.dataset.id);
  /* ⚠⚠⚠ 後段が走っていなければ、ここは 3 件になる（窓の全件がそのまま答えを名乗る） */
  assert.deepEqual(vsOf(rec.features()), [2, 3], '後段の条件が実行されていない');
  assert.equal(rec.count, 2);
});

test('R819 ① 記録は「誰が条件を実行したか」と「解消した理由」を述べる', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const made = await layers.acquireDataset('win', { bounds: BOX, where: WHERE });
  const cov = data.get(made.dataset.id).provenance.coverage;

  /* 解消したことが分かる形で述べられている —— 黙って消していない */
  assert.equal(cov.wherePlan.resolved, 'where-pending-post-stage', '解消した理由が記録から消えている');
  assert.match(String(cov.wherePlan.resolvedBy), /IntMapGisOps/, '実行者（正本の module）が述べられていない');
  assert.deepEqual(cov.wherePlan.pending, [], '実行したのに保留のままになっている');
  assert.deepEqual(cov.wherePlan.executed.map((c) => c.field), ['v'], '何を実行したかが残っていない');
  assert.deepEqual(cov.wherePlan.upstream, [], '上流が実行していない条件を上流のものと述べている');
  /* ⚠ 「誰も実行していない」を「供給元が実行した」と述べない（#R783 の形）——実行者は後段である */
  assert.equal(cov.filteredBy, cov.wherePlan.executedBy[0], '実行者と filteredBy が食い違う');
  assert.notEqual(cov.filteredBy, null, '実行した条件を誰も実行していないと述べている');
  assert.notEqual(cov.filteredBy, 'supplier', '後段が実行したものを供給元の仕事と述べている');
  /* 窓は取り切れており、条件も実行された ⇒ 答えは完全である */
  assert.equal(cov.completeness, 'all');
  assert.equal(cov.reason, null);
  /* 求めた条件は記録に残り続ける（答えだけを見て問いが復元できなくならない） */
  assert.equal(cov.requested.where.length, 1);
  assert.equal(cov.count, 2, '件数が答えのものになっていない');
  /* 窓についての陳述は、後段が走っても書き換わらない（件数だけが答えのものになる） */
  const staged = await sources.acquirePlanned('win', { bbox: [0, 0, 10, 10], where: WHERE });
  assert.deepEqual(cov.available, staged.coverage.available, '窓についての陳述が書き換わっている');
  assert.deepEqual(cov.served, staged.coverage.served);
  assert.equal(staged.coverage.count, 3, '前提が崩れている: 前段は窓の全件のはず');
});

test('R819 ① 後段のための作業レコードは残らない（答えのレシピは取得そのもの）', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const before = data.ids().length;
  const made = await layers.acquireDataset('win', { id: 'answer', bounds: BOX, where: WHERE });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.dataset.id, 'answer', '呼び手が名づけた id が答えに付いていない');
  assert.equal(data.ids().length, before + 1, '中間のレコードが残っている: ' + data.ids().join(','));
  /* 取得の記録であって、2 段の連鎖ではない —— 再実行できるのは「取り直す」ことである */
  const prov = data.get('answer').provenance;
  assert.equal(prov.kind, 'layer');
  assert.equal(prov.layer, 'win');
});

test('R819 ① 後段の条件が読めない列なら、filter 自身の拒否がそのまま届く', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const before = data.ids().length;
  const made = await layers.acquireDataset('win', { bounds: BOX, where: [{ field: 'nope', op: '>=', value: 2 }] });
  assert.equal(made.ok, false);
  assert.equal(made.why, 'unknown-field', '実行者の理由が別の言葉に置き換えられている');
  assert.equal(data.ids().length, before, '拒否されたのに作業レコードが残っている');
});

test('R819 ① 実行する機械が載っていなければ、条件を黙って落とさずに断る', async () => {
  const { w, sources, layers } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  delete w.IntMapGisOps;
  const made = await layers.acquireDataset('win', { bounds: BOX, where: WHERE });
  assert.equal(made.ok, false, '条件が未実行のまま答えが返っている');
  assert.equal(made.why, 'ops-unavailable');
  assert.equal(made.detail.needs, 'IntMapGisOps');
});

/* ══ ② 後段が無い取得は、変更前とまったく同じ答え ═══════════════════════════════════════════════ */

test('R819 ② 上流が条件を実行できるなら、答えも記録も従来の扉と一語も違わない', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('flt', filtering(ROWS()));
  const req = { bbox: [0, 0, 10, 10], where: WHERE };
  /* 従来の扉（acquire）——比較相手をこの file で書かない */
  const flat = await sources.acquire('flt', req);
  assert.equal(flat.ok, true, JSON.stringify(flat));

  const made = await layers.acquireDataset('flt', { bounds: BOX, where: WHERE });
  const rec = data.get(made.dataset.id);
  assert.deepEqual(rec.features().map((f) => f.properties.v), flat.features.map((f) => f.properties.v));
  const cov = rec.provenance.coverage;
  /* 従来の扉が述べた陳述は、1 つ残らずそのまま述べられている */
  for (const k of Object.keys(flat.coverage)) {
    assert.deepEqual(cov[k], flat.coverage[k], '取得の陳述 ' + k + ' が変わっている');
  }
  assert.equal(cov.filteredBy, 'supplier', '上流が実行した条件が別の実行者のものになっている');
  /* 「後段は無い」 は述べられる（「計画を通っていない」 と区別できる）。⚠ `resolved` が付くのは
     解消された後段が実在したときだけ —— ここで付いていたら、走っていない段を走ったと述べている。 */
  assert.deepEqual(cov.wherePlan.pending, []);
  assert.deepEqual(cov.wherePlan.upstream.map((c) => c.field), ['v']);
  assert.equal(cov.wherePlan.resolved == null, true, '走っていない後段を走ったと述べている');
});

test('R819 ② 条件が無い取得も、従来の扉と同じ答えである', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const flat = await sources.acquire('win', { bbox: [0, 0, 10, 10] });
  const made = await layers.acquireDataset('win', { bounds: BOX });
  const rec = data.get(made.dataset.id);
  assert.deepEqual(vsOf(rec.features()), vsOf(flat.features));
  const cov = rec.provenance.coverage;
  for (const k of Object.keys(flat.coverage)) {
    assert.deepEqual(cov[k], flat.coverage[k], '取得の陳述 ' + k + ' が変わっている');
  }
  assert.equal(cov.filteredBy, null, '条件が無いのに絞ったと記録されている');
});

/* ══ ③ 断りは上まで届く（握り潰さない） ═══════════════════════════════════════════════════════ */

test('R819 ③ 満たせない計画は plan-unsatisfiable として扉の外まで届く', async () => {
  const { sources, layers, data } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const before = data.ids().length;
  /* 上位 N 件を切ってから絞るのは「条件を満たした検索」ではない（取る前に断る） */
  const made = await layers.acquireDataset('win', { bounds: BOX, where: WHERE, limit: 1 });
  assert.equal(made.ok, false, '取れた分だけが答えとして返っている');
  assert.equal(made.why, 'plan-unsatisfiable');
  assert.equal(made.detail.why, 'limit-precedes-filter');
  assert.equal(data.ids().length, before, '断ったのにレコードが作られている');
});

test('R819 ③ 画面が母集団を決める取得は、測定としては断られる', async () => {
  const { layers, registry, atlas } = await boot();
  /* 何を持っているか誰も述べていない行 —— 供給元は立たず、読むのはレンダラである */
  registry.register('view', { label: () => 'View', on: () => true, featuresIn: () => ROWS() });

  /* 測定だと述べなければ、今までどおり答えが返る（fallback は取り除かれていない） */
  const plain = await layers.acquireDataset('view', { bounds: BOX });
  assert.equal(plain.ok, true, JSON.stringify(plain));

  const measured = await layers.acquireDataset('view', { bounds: BOX, analysis: true });
  assert.equal(measured.ok, false, '画面に依存した母集団が測定の答えとして返っている');
  assert.equal(measured.why, 'renderer-view-dependent');

  /* 同じ断りが Atlas の扉からも届く —— 語彙は js/gis-layers.js のものを通っている */
  assert.ok(layers.acquireFields('vector').indexOf('analysis') >= 0, '取得の語彙に analysis が無い');
  const viaAtlas = await atlas.acquire({ inputs: ['layer:view'], acquire: { bounds: BOX, analysis: true } });
  assert.equal(viaAtlas.ok, false);
  assert.equal(viaAtlas.why, 'renderer-view-dependent', '語彙に在る欄が別の理由で落ちている: ' + viaAtlas.why);
});

/* ══ ② planner に渡る行が、誰が答えたか・後段が走ったかを述べる ═══════════════════════════════ */

test('R819 ② 取得した行は answeredBy と後段の実行を planner に渡す', async () => {
  const { sources, atlas } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const r = await atlas.acquire({ inputs: ['layer:win'], acquire: { bounds: BOX, where: WHERE } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = r.acquired[0];
  /* 既存の欄は 1 つも消えていない */
  for (const k of ['id', 'title', 'kind', 'count', 'origin', 'acquiredFrom']) {
    assert.ok(row[k] != null, '行から ' + k + ' が消えている');
  }
  assert.equal(row.count, 2, '後段が走っていない行が planner に渡っている');
  assert.equal(row.coverage.answeredBy, 'supplier', 'どちらの道が答えたかが行に載っていない');
  assert.deepEqual(row.coverage.wherePlan.executed.map((c) => c.field), ['v']);
  assert.deepEqual(row.coverage.wherePlan.pending, []);
  assert.equal(row.coverage.wherePlan.resolved, 'where-pending-post-stage');
});

/* ══ ③ 供給元の能力は、取得する前に読める ═══════════════════════════════════════════════════════ */

test('R819 ③ planner は取得する前に供給元の能力を読める', async () => {
  const { sources, atlas } = await boot();
  const impl = windowOnly(ROWS());
  sources.supply('win', impl);

  const desc = atlas.describe('win');
  assert.ok(desc, '供給元が記述されていない');
  const caps = desc.query.capabilities;
  assert.ok(caps && typeof caps === 'object', '能力が取得前に述べられていない');
  /* ⚠ 値は供給層が導いたものそのもの（この file が第 2 の一覧を持たない） */
  assert.deepEqual(caps, sources.capabilitiesOf('win'));
  /* 問いの一覧も供給層のもの —— ここに能力名を並べない */
  for (const name of sources.capabilityNames()) {
    assert.ok(name in caps.claimed, '能力 ' + name + ' が申告に無い');
  }
  /* 依頼された 3 つの問いは、この行について実際に答えが出る */
  assert.equal(caps.claimed.offscreen, true, '画面と独立に取れるかが述べられていない');
  assert.equal(caps.claimed.conditions, false, '属性条件を上流で実行できないことが述べられていない');
  assert.equal(caps.road, 'supplier');
  /* ⚠⚠ 「取得する前に」である: 記述のために上流へ問い合わせていない */
  assert.equal(impl.calls(), 0, '記述が取得を発生させている');

  /* slot は宣言されており、述べられた欄として 1 度だけ現れる（検査から見えない欄を作らない） */
  assert.ok(atlas.prefetchSlots().indexOf('query.capabilities') >= 0, 'slot が宣言されていない');
  assert.equal(desc.undeclared.filter((u) => u.slot === 'query.capabilities').length, 0);
  assert.equal(desc.notApplicable.filter((u) => u.slot === 'query.capabilities').length, 0);
});

test('R819 ③ 供給層が載っていなければ、能力は「訊けなかった」として名指される', async () => {
  const { w, sources, atlas, registry } = await boot();
  registry.register('heritage', { label: () => 'Heritage', on: () => true, featuresIn: () => ROWS() });
  assert.ok(sources.capabilitiesOf('heritage'), '前提が崩れている');
  delete w.IntMapGisSources;
  const desc = atlas.describe('heritage');
  assert.ok(desc, '供給層が無いと記述そのものが消えている');
  const why = desc.undeclared.find((u) => u.slot === 'query.capabilities');
  assert.ok(why, '能力が未申告として名指されていない');
  assert.equal(why.why, 'supply-layer-unavailable');
});

test('R819 ③ 申告と実測を並べる扉が Atlas から届く', async () => {
  const { sources, atlas } = await boot();
  sources.supply('win', windowOnly(ROWS()));
  const audited = await atlas.capabilities('layer:win', { bbox: [0, 0, 10, 10] });
  assert.equal(audited.ok, true, JSON.stringify(audited));
  /* 申告と実測が両方在り、食い違いは名指される（null は食い違いではない） */
  assert.ok(audited.claimed && audited.measured, '片方しか返っていない');
  assert.ok(Array.isArray(audited.conflicts));
  assert.equal(audited.agrees, audited.conflicts.length === 0);
  assert.equal(audited.measured.offscreen, true, '同じ扉を通した実測が得られていない');
  /* 知らない id は供給層の言葉で断られる */
  const missing = await atlas.capabilities('layer:nope');
  assert.equal(missing.ok, false);
  assert.equal(missing.why, 'layer-unknown');
});
