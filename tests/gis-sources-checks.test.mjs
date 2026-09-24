/* ============================================================================
 *  #R819 · 「引数が在る」 と 「その条件で取れる」 は別の主張である
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  js/gis-sources.js had a fetch contract with eight parameters and one place where 「その相手が
 *  それを実行できるか」 was decided (`where-not-supported`). What was measurable on the shipped code:
 *
 *    ① A supplier that serves a WINDOW but cannot filter refused the whole request. There was no
 *       way to say 「区域は上流で、属性条件は後段で」, so the caller's only alternatives were to be
 *       refused or to fetch the window and filter it with rules of its own — a second spelling of
 *       js/gis-ops.js's comparisons, which is the drift .agents/rules/no-ad-hoc-hardcoding.md
 *       forbids. And the record could not say who had executed what, because nobody had planned it.
 *    ② An answer never said WHICH ROAD produced it. `m.supplied` was computed on every acquisition
 *       and dropped on the floor, so 「この平均は何の平均か」 — a store's holdings, or whatever the
 *       renderer happened to be holding for the current camera — could not be answered from the
 *       record even in principle. The fact was in the file's hands and was not written down.
 *    ③ Capabilities were the supplier's four booleans and nothing measured them. #R783 had already
 *       recorded what that costs (a road declaring `where:true` and applying nothing, with
 *       `filteredBy:'supplier'` written over every unfiltered answer), and there was still no door
 *       through which a claim could be put next to an observation.
 *
 *  ⚠ AND THE ONE THING A PLAN MUST NOT DO: filter a capped page and call the result an answer.
 *  「取れた分のうち条件に合うもの」 is a real number over real data and it is not what was asked, so
 *  the planned road pages by the supplier's own cursor, divides the window when the cap has no
 *  cursor, and REFUSES when neither reaches the end (`plan-unsatisfiable`).
 *
 *  ⚠ THE STUB REGISTRY IS NO MORE CAPABLE THAN js/map-ui.js's ([[intmap-r671-lessons]]): `featuresIn`
 *  answers null for a row the renderer has not drawn, `narrow` is the one box predicate, and a row
 *  declares what it holds through `declarationOf` exactly as a shipped registration does.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pt = (lng, lat, p, id) => {
  const f = { type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } };
  if (id != null) f.id = id;
  return f;
};
const inBox = (f, b) => {
  const c = f && f.geometry && f.geometry.coordinates;
  return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
};
const boxOf = (bbox) => (bbox == null ? { w: -180, s: -90, e: 180, n: 90 }
  : (Array.isArray(bbox) ? { w: bbox[0], s: bbox[1], e: bbox[2], n: bbox[3] } : bbox));
const WORLD = { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false };

/* ── the registry, answering what js/map-ui.js's answers ──────────────────────────────────────── */

function makeFakeMap(w) {
  const rows = new Map();
  let camera = { w: -180, s: -90, e: 180, n: 90 };
  const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

  w.IntMapLayers = {
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
    },
    featuresIn: (id, bounds) => {
      const r = rows.get(String(id));
      if (!r || !r.features) return null;
      const b = asBox(bounds);
      return r.features.filter((f) => inBox(f, b));
    },
    featuresInSource: () => null,
    sampleAt: async () => [],
    loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
    narrow: (features, bounds) => {
      if (!Array.isArray(features)) return null;
      if (!bounds) return features.slice();
      const b = asBox(bounds);
      return features.filter((f) => inBox(f, b));
    },
    declarationOf: (id) => { const r = rows.get(String(id)); return (r && r.holds) ? r.holds : null; },
    active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
    context: () => [],
  };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
  };
  return { rows, setCamera: (b) => { camera = b; } };
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
  const map = makeFakeMap(w);
  w.IntMapData = makeGisDatasets();
  w.IntMapGisOps = makeGisOps();
  w.IntMapGisRaster = makeGisRaster();
  w.IntMapGisSources = makeGisSources();
  w.IntMapGisLayers = makeGisLayers();
  return { w, map, sources: w.IntMapGisSources };
}

/* ── suppliers, each honest about exactly what it claims ──────────────────────────────────────── */

/* 区域は答えられるが属性条件は実行できない。⚠ 黙って無視するのではなく、能力を申告していない。 */
function windowOnly(feats) {
  return {
    where: false, cursor: false, limit: false, fields: false,
    fetch: async (req) => {
      const b = boxOf(req.bbox);
      const got = feats.filter((f) => inBox(f, b));
      return { ok: true, features: got, next: null, coverage: { served: b, complete: true, available: got.length } };
    },
  };
}

/* 区域も属性条件も上流で実行する。比較は 1 つ（>=）だけで、それがこの試験の全部。 */
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

/* 上流に件数制限がある。⚠ カーソルは無い——「窓に何件在るか」は述べるが、続きは渡せない。
   これが「取れた分だけ」を答えにしてはならない場面そのもの。 */
function cappedAt(feats, cap) {
  let calls = 0;
  const impl = {
    where: false, cursor: false, limit: false, fields: false,
    fetch: async (req) => {
      calls++;
      const b = boxOf(req.bbox);
      const all = feats.filter((f) => inBox(f, b));
      const got = all.slice(0, cap);
      return { ok: true, features: got, next: null, coverage: { served: b, complete: got.length === all.length, available: all.length } };
    },
  };
  impl.calls = () => calls;
  return impl;
}

/* ページ送りできる上流。⚠ 続きを「述べ」、最後のページで「これで終わり」と言う。 */
function paged(feats, per) {
  return {
    where: false, cursor: true, limit: false, fields: false,
    fetch: async (req) => {
      const b = boxOf(req.bbox);
      const all = feats.filter((f) => inBox(f, b));
      const at = req.cursor == null ? 0 : Number(String(req.cursor).split('@')[1]);
      const got = all.slice(at, at + per);
      const end = at + got.length >= all.length;
      return {
        ok: true, features: got,
        next: end ? null : ('p@' + (at + got.length)),
        coverage: { served: b, complete: end, available: all.length },
      };
    },
  };
}

const vs = (r) => r.features.map((f) => f.properties.v).sort((a, b) => a - b);

/* ══ ① 取得できない条件に、処理側から進める経路 ═══════════════════════════════════════════════ */

test('R819 ① 属性条件に未対応の供給元で、区域取得＋後段フィルタの計画が立つ', async () => {
  const { sources } = await boot();
  sources.supply('win', windowOnly([pt(1, 1, { v: 1 }, 'a'), pt(2, 2, { v: 2 }, 'b'), pt(3, 3, { v: 3 }, 'c')]));
  const ask = { bbox: [0, 0, 10, 10], where: [{ field: 'v', op: '>=', value: 2 }] };

  /* 従来の扉は今までどおり断る——意味を変えていない */
  const flat = await sources.acquire('win', ask);
  assert.equal(flat.ok, false);
  assert.equal(flat.why, 'where-not-supported', '既存の拒否の意味が変わっている');

  const p = sources.plan('win', ask);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.satisfiable, true, p.why);
  assert.equal(p.stages.length, 2, '段が 1 つしかない＝どこで何を処理するかを述べていない');
  assert.equal(p.stages[0].at, 'supplier');
  assert.deepEqual(p.stages[0].where, [], '実行できない条件が上流へ渡っている');
  assert.deepEqual(p.stages[0].bbox, { w: 0, s: 0, e: 10, n: 10 });
  assert.equal(p.stages[1].at, 'post');
  assert.equal(p.stages[1].does, 'filter');
  assert.equal(p.where.post.length, 1);
  assert.equal(p.exhaustive, true, '後段が在るのに前段の全件性が要求されていない');
  /* ⚠ 後段の実装はここに無い（正本は js/gis-ops.js の filter）——名指すだけ */
  assert.match(p.stages[1].by, /IntMapGisOps/);
});

test('R819 ① 計画の内訳は結果に残り、staged は「答え」を名乗らない', async () => {
  const { sources } = await boot();
  sources.supply('win', windowOnly([pt(1, 1, { v: 1 }, 'a'), pt(2, 2, { v: 2 }, 'b'), pt(3, 3, { v: 3 }, 'c')]));
  const r = await sources.acquirePlanned('win', { bbox: [0, 0, 10, 10], where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  /* ⚠⚠⚠ kind が 'features' なら、後段を走らせない読み手がこれを答えだと思える */
  assert.equal(r.kind, 'staged', '条件が未実行のまま features を名乗っている');
  assert.deepEqual(vs(r), [1, 2, 3], '前段は窓の全件であるべき');
  assert.deepEqual(r.coverage.wherePlan.pending.map((c) => c.field), ['v']);
  assert.deepEqual(r.coverage.wherePlan.upstream, []);
  /* ⚠ 「誰も実行していない」を「供給元が実行した」と述べない（#R783 の形） */
  assert.equal(r.coverage.filteredBy, null, '実行していない条件を実行したと述べている');
  assert.equal(r.coverage.requested.where.length, 1, '求めた条件が記録に残っていない');
  assert.equal(r.coverage.completeness, 'partial');
  assert.equal(r.coverage.reason, 'where-pending-post-stage');
  assert.ok(sources.coverageReasons().indexOf('where-pending-post-stage') >= 0, '理由が語彙に無い');
});

test('R819 ① 上流で実行できる条件は上流で実行され、段は 1 つになる', async () => {
  const { sources } = await boot();
  sources.supply('flt', filtering([pt(1, 1, { v: 1 }), pt(2, 2, { v: 2 }), pt(3, 3, { v: 3 })]));
  const p = sources.plan('flt', { where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(p.stages.length, 1, '実行できる条件が後段へ回されている');
  assert.equal(p.where.post.length, 0);
  const r = await sources.acquirePlanned('flt', { bbox: [0, 0, 10, 10], where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(r.kind, 'features', '答えなのに staged を名乗っている');
  assert.deepEqual(vs(r), [2, 3]);
  assert.equal(r.coverage.filteredBy, 'supplier');
  assert.deepEqual(r.coverage.wherePlan.pending, []);
});

/* ══ ① 全件に届かないとき、「条件を満たした」と述べない ═══════════════════════════════════════ */

test('R819 ① 上流の件数制限は、窓を分割して満たす（分割は観測された不足のあとだけ）', async () => {
  const { sources } = await boot();
  /* 4 象限に 1 点ずつ。1 回の問い合わせでは 2 件までしか返らない上流。 */
  const feats = [pt(-90, -45, { v: 1 }, 'a'), pt(90, -45, { v: 2 }, 'b'), pt(-90, 45, { v: 3 }, 'c'), pt(90, 45, { v: 4 }, 'd')];
  const impl = cappedAt(feats, 2);
  sources.supply('cap', impl);

  /* 分割前: 1 回で訊くと 2 件しか来ず、供給元自身が「まだ在る」と述べる */
  const one = await sources.acquire('cap', {});
  assert.equal(one.features.length, 2);
  assert.equal(one.coverage.reason, 'supplier-page-incomplete');
  assert.notEqual(one.coverage.completeness, 'all', '取れた分だけを all と述べている');

  const before = impl.calls();
  const r = await sources.acquirePlanned('cap', { where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(vs(r), [1, 2, 3, 4], '窓を取り切っていない');
  assert.ok(r.plan.run.windows.length > 1, '分割が記録に残っていない');
  assert.equal(r.plan.run.complete, true);
  assert.equal(r.plan.run.why, null);
  assert.equal(r.plan.run.dedupBy, 'id', '重なりの判定が ID で行われていない');
  /* ⚠ 繰り返しは「実在した不足」のあとだけで、回数は記録に残る（one-pass-or-a-reason §5） */
  assert.equal(r.plan.run.requests, impl.calls() - before, '問い合わせ回数が記録と食い違う');
  assert.ok(r.plan.run.requests >= 5);
});

test('R819 ① 分割でも届かないなら、答えではなく「満たせない」と述べる', async () => {
  const { sources } = await boot();
  /* 同じ 1 点に 3 件。どれだけ窓を割っても 1 回 1 件しか来ない上流。 */
  const same = [pt(0.5, 0.5, { v: 1 }, 'a'), pt(0.5, 0.5, { v: 2 }, 'b'), pt(0.5, 0.5, { v: 3 }, 'c')];
  sources.supply('stuck', cappedAt(same, 1));
  const r = await sources.acquirePlanned('stuck', {
    bbox: [0, 0, 1, 1], where: [{ field: 'v', op: '>=', value: 2 }], maxRequests: 8,
  });
  /* ⚠⚠⚠ 「取れた分だけ」を黙って答えにしない */
  assert.equal(r.ok, false, '満たせない検索が答えとして返っている: ' + JSON.stringify(r && r.coverage));
  assert.equal(r.why, 'plan-unsatisfiable');
  assert.equal(r.detail.why, 'request-budget-spent');
  assert.ok(r.detail.plan.run.requests <= 8, '述べた予算を超えて問い合わせている');
  assert.ok(sources.refusalCodes().indexOf('plan-unsatisfiable') >= 0, '拒否コードが宣言されていない');
});

test('R819 ① 件数制限や位置を条件より先に効かせる計画は、実行前に断る', async () => {
  const { sources } = await boot();
  sources.supply('win', windowOnly([pt(1, 1, { v: 1 })]));
  const where = [{ field: 'v', op: '>=', value: 2 }];

  const limited = sources.plan('win', { where: where, limit: 1 });
  assert.equal(limited.satisfiable, false);
  assert.equal(limited.why, 'limit-precedes-filter');
  const r1 = await sources.acquirePlanned('win', { where: where, limit: 1 });
  assert.equal(r1.ok, false);
  assert.equal(r1.why, 'plan-unsatisfiable');

  const resumed = sources.plan('win', { where: where, cursor: 'x@1' });
  assert.equal(resumed.why, 'cursor-precedes-filter');
});

test('R819 ① 供給元が続きを述べるなら、分割ではなくその続きをたどる', async () => {
  const { sources } = await boot();
  sources.supply('pg', paged([pt(1, 1, { v: 1 }, 'a'), pt(2, 2, { v: 2 }, 'b'), pt(3, 3, { v: 3 }, 'c')], 1));
  const r = await sources.acquirePlanned('pg', { bbox: [0, 0, 10, 10], where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(vs(r), [1, 2, 3]);
  assert.equal(r.plan.run.windows.length, 1, '続きが在るのに窓を割っている');
  assert.equal(r.plan.run.windows[0].pages, 3);
  assert.equal(r.plan.run.complete, true);
});

test('R819 ① 描画側の保持データは、終わりを誰も述べていない限り条件付きの答えにならない', async () => {
  const { map, sources } = await boot();
  /* 宣言の無い行——「いま描かれているもの」が全部かどうかを誰も述べていない */
  map.rows.set('drawn', { label: 'Drawn', on: true, holds: null, features: [pt(1, 1, { v: 1 }), pt(2, 2, { v: 2 })] });
  const ask = { bbox: [0, 0, 10, 10], where: [{ field: 'v', op: '>=', value: 2 }] };

  const p = sources.plan('drawn', ask);
  assert.equal(p.road, 'renderer');
  assert.equal(p.stages[1].at, 'post');
  const r = await sources.acquirePlanned('drawn', ask);
  /* ⚠⚠⚠ 画面に在った分を絞って「条件を満たした」と述べない */
  assert.equal(r.ok, false, '画面の中身を条件付きの答えにしている');
  assert.equal(r.why, 'plan-unsatisfiable');
  assert.equal(r.detail.why, 'continuation-unstated');

  /* その行が「この範囲を漏れなく持つ」と述べたなら、同じ計画が成立する */
  sources.declare('drawn', { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, live: false });
  const ok = await sources.acquirePlanned('drawn', ask);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.kind, 'staged');
  assert.equal(ok.coverage.answeredBy, 'renderer');
  assert.equal(ok.plan.run.complete, true);
});

/* ══ ② カメラで答えたことと、供給元に訊いたことが区別できる ═══════════════════════════════════ */

test('R819 ② どちらの道が答えたかが、すべての結果に残る', async () => {
  const { map, sources } = await boot();
  /* 宣言の無い行＝レンダラが持っているものしか無い（供給元は作られない） */
  map.rows.set('drawn', { label: 'Drawn', on: true, holds: null, features: [pt(1, 1, { v: 1 })] });
  const byRenderer = await sources.acquire('drawn', {});
  assert.equal(byRenderer.ok, true, byRenderer.why);
  assert.equal(byRenderer.coverage.answeredBy, 'renderer', '描画側で答えたことが記録に残らない');

  sources.supply('sup', windowOnly([pt(1, 1, { v: 1 })]));
  const bySupplier = await sources.acquire('sup', {});
  assert.equal(bySupplier.coverage.answeredBy, 'supplier');
});

test('R819 ② 解析用の要求は、カメラが母集団を決める経路を標準にしない', async () => {
  const { map, sources } = await boot();
  map.rows.set('drawn', { label: 'Drawn', on: true, holds: null, features: [pt(1, 1, { v: 1 })] });

  /* 既定は何も変わらない——フォールバックは消していない */
  const plain = await sources.acquire('drawn', {});
  assert.equal(plain.ok, true);
  assert.ok(sources.viewDependentReasons().indexOf(plain.coverage.reason) >= 0, plain.coverage.reason);

  const strict = await sources.acquire('drawn', { analysis: true });
  assert.equal(strict.ok, false, '画面依存の母集団が解析の答えとして返っている');
  assert.equal(strict.why, 'renderer-view-dependent');
  assert.equal(strict.detail.reason, plain.coverage.reason);
  assert.ok(sources.refusalCodes().indexOf('renderer-view-dependent') >= 0);
});

test('R819 ② 画面に依存しないと述べられた描画側の保持データは、解析でも断られない', async () => {
  const { map, sources } = await boot();
  map.rows.set('doc', { label: 'Doc', on: true, holds: null, features: [pt(1, 1, { v: 1 })] });
  /* その行が「この範囲を漏れなく持ち、更新もされない」と述べたとき（js/map-ui.js の upload 経路） */
  sources.declare('doc', { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, live: false });
  const r = await sources.acquire('doc', { analysis: true });
  assert.equal(r.ok, true, '宣言のある保持データまで断っている: ' + r.why);
  assert.equal(r.coverage.answeredBy, 'renderer');
  assert.equal(r.coverage.completeness, 'all');
});

/* ══ ② 能力は申告ではなく実測で持ち、食い違えば落ちる ════════════════════════════════════════ */

test('R819 ② 能力は登録から導かれ、一覧として書かれていない', async () => {
  const { sources } = await boot();
  const names = sources.capabilityNames();
  for (const n of ['offscreen', 'window', 'time', 'conditions', 'boundedEnd', 'stableId']) {
    assert.ok(names.indexOf(n) >= 0, n + ' が能力の語彙に無い');
  }
  /* 登録した瞬間に能力を持つ——id はどこにも書かれていない */
  assert.equal(sources.capabilitiesOf('later'), null);
  sources.supply('later', filtering([pt(1, 1, { v: 1 })]));
  const c = sources.capabilitiesOf('later');
  assert.equal(c.road, 'supplier');
  assert.equal(c.claimed.conditions, true);
  assert.equal(c.claimed.offscreen, true, '供給元が在るのに表示が要ると述べている');
  assert.equal(c.claimed.stableId, null, '誰も述べていないことを false と述べている');
});

test('R819 ② 申告と実体が食い違えば、監査が名指しで落とす', async () => {
  const { sources } = await boot();
  /* 申告: 範囲を漏れなく持つ（＝終わりが在る）。実体: 窓を無視し、続きについて何も述べない。 */
  const liar = {
    where: true, cursor: false, limit: false, fields: false,
    fetch: async () => ({ ok: true, features: [pt(-170, -80, { v: 1 }, 'x'), pt(170, 80, { v: 2 }, 'y')] }),
  };
  sources.supply('liar', liar);
  sources.declare('liar', { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true });

  const audit = await sources.auditCapabilities('liar', { bbox: [-180, -90, 180, 90] });
  assert.equal(audit.ok, true, JSON.stringify(audit));
  assert.equal(audit.agrees, false, '申告と実体の食い違いが見えていない');
  const by = new Map(audit.conflicts.map((c) => [c.capability, c]));
  assert.ok(by.has('window'), '求めた窓の外を返したのに、窓の能力が緑のまま: ' + JSON.stringify(audit.notes));
  assert.equal(by.get('window').measured, false);
  assert.ok(by.has('boundedEnd'), '「全部持っている」と述べたのに終わりを確認できない');
  assert.equal(audit.measured.boundedEnd, false);
  assert.equal(audit.measured.stableId, true, '同じ ID が二度返っている');
});

test('R819 ② 正直な供給元は監査を通り、null は食い違いにならない', async () => {
  const { sources } = await boot();
  sources.supply('ok', windowOnly([pt(-90, -45, { v: 1 }, 'a'), pt(90, 45, { v: 3 }, 'c')]));
  const audit = await sources.auditCapabilities('ok', { bbox: [-180, -90, 180, 90] });
  assert.equal(audit.agrees, true, JSON.stringify(audit.conflicts));
  assert.equal(audit.measured.window, true);
  assert.equal(audit.measured.boundedEnd, true, '「これで終わり」と述べたことが読まれていない');
  assert.equal(audit.measured.offscreen, true);
  /* 訊かなかったことは null のまま——「測れなかった」を「できない」と述べない */
  assert.equal(audit.measured.time, null);
  assert.equal(audit.measured.conditions, null);
  const note = audit.notes.find((n) => n.capability === 'time');
  assert.equal(note.saw, 'no-time-asked');
});

test('R819 ② 安定した ID を持たない供給元は、そう述べられる', async () => {
  const { sources } = await boot();
  let n = 0;
  sources.supply('drift', {
    where: false, cursor: false, limit: false, fields: false,
    fetch: async () => { n++; return { ok: true, features: [pt(1, 1, { v: 1 }, 'id-' + n)], next: null, coverage: { complete: true } }; },
  });
  const audit = await sources.auditCapabilities('drift', {});
  assert.equal(audit.measured.stableId, false, '呼ぶたびに変わる ID が安定と述べられている');

  sources.supply('nameless', windowOnly([pt(1, 1, { v: 1 })]));
  const second = await sources.auditCapabilities('nameless', {});
  assert.equal(second.measured.stableId, false);
  assert.equal(second.notes.find((x) => x.capability === 'stableId').saw, 'no-id-member');
});

/* ══ 新しい拒否は宣言され、読者に届く前に文を要求する ════════════════════════════════════════ */

test('R819 新しい拒否コードは宣言され、読者の扉へ配線するなら 9 言語より先に文が要る', async () => {
  const { sources } = await boot();
  const codes = ['plan-unsatisfiable', 'renderer-view-dependent'];
  for (const c of codes) assert.ok(sources.refusalCodes().indexOf(c) >= 0, c + ' が REFUSALS に無い');

  /* ⚠ この 2 つは新しい引数を名指した呼び出し元からしか届かない。届く配線を足したなら、
     js/gis-panel.js に読者への文が要る（#R763 ⑨ と同じ規則を、この回の分にも当てる）。 */
  const wired = readdirSync(join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js') && f !== 'gis-sources.js')
    .filter((f) => {
      const src = read(join('js', f));
      return /acquirePlanned\s*\(/.test(src) || /analysis\s*:\s*true/.test(src);
    });
  if (wired.length) {
    const panel = read('js/gis-panel.js');
    for (const c of codes) {
      assert.ok(panel.indexOf("'" + c + "'") > 0, c + ' に読者への文が無いまま配線されている（配線: ' + wired.join(', ') + '）');
    }
  }
});
