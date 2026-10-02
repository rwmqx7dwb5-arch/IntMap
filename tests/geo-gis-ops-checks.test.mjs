/* ============================================================================
 *  GIS · THE OPS SURFACE — Atlas への宣言・結合・意味の継承・ラスタ化・描画の真偽
 * ----------------------------------------------------------------------------
 *  The declaration of the GIS operations as Atlas and the panel see it, and the operations whose claim
 *  is about MEANING rather than geometry: joins (one-to-many, nearest, temporal, unit conversion),
 *  what a result inherits from its inputs (time, units, completeness), how a vector burns into a grid,
 *  and whether draw() reports what the map actually did.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { installWindow, isolate, read } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { capabilityEntry, catalogueText } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does is its entry in js/atlas-cap-<namespace>.js */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R743 · the surface Atlas is handed   (was tests/r743-gis-atlas-surface-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R743 · Atlas が GIS の処理を走らせられる — 宣言をそのまま公開する
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ⑧ the catalogue Atlas is handed IS js/gis-ops.js's declaration, not a copy of it
 *    ⑨ the text the planner reads names every declared op — a new op cannot hide in it
 *    ⑩ a step's output is a dataset id, and that id is the input of the next step
 *    ⑪ a refusal carries the vocabulary: what exists, or the op's own declaration
 *    ⑫ drawing is a separate capability from computing
 *
 *  ⚠ ⑧ AND ⑨ ARE THE SAME DEFECT MEASURED TWICE BEFORE. #R732 found `ORDER = [four ids]` in the
 *  panel while DECL held nine — an op that answered run() and was invisible on screen — under the
 *  paragraph forbidding hand-written lists. #R733 measured the other half in production: a planner
 *  told to SEARCH for capabilities it had already been handed spent all eight steps of a turn
 *  searching. So the catalogue is derived, and the prose that cannot be derived is MEASURED against
 *  what is.
 * ==========================================================================*/
describe('§ #R743 · the surface Atlas is handed', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* The map is a stub here, and a small one on purpose: what this file measures is the SURFACE — what
     the planner is offered, how a reference resolves, what a refusal says — and a real renderer would
     only make those answers harder to read. js/gis-layers.js is measured against the real thing in
     tests/r732 ⑨ and tests/r735 ⑪. */
  function stubLayers(rows) {
    return {
      /* (#R759) 取得条件の語彙はこの扉のもの（js/gis-layers.js）。stub も同じものを述べる。 */
      acquireFields: (kind) => (String(kind) === 'raster'
        ? ['bounds', 'width', 'height', 'where', 'unit']
        : ['bounds', 'where', 'fields', 'limit', 'cursor', 'time']),
      sources: () => rows.map((r) => ({ id: r.id, label: r.label, geometryType: r.geometryType || 'Point', count: (r.features || []).length })),
      canSample: (id) => !!(rows.find((r) => r.id === id) || {}).samplable,
      toDataset: (id, o) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return { ok: false, why: 'layer-unknown', detail: { id: id } };
        return { ok: true, dataset: globalThis.window.IntMapData.add({ title: (o && o.title) || row.label, features: row.features }) };
      },
      toRaster: async () => ({ ok: false, why: 'layer-not-sampling' }),
    };
  }

  async function boot(layerRows) {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisAtlas } = await import('../js/gis-atlas.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    await geometry.ready();
    const layers = stubLayers(layerRows || []);
    w.IntMapGisLayers = layers;
    const drawn = [];
    const atlas = makeGisAtlas({
      data, ops, layers,
      draw: (id) => { drawn.push(id); return { ok: true, sid: 'ugj-' + drawn.length }; },
    });
    return { w, data, ops, atlas, drawn };
  }

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
  const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);
  const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

  /* ══ ⑧ 目録は宣言そのものである ═════════════════════════════════════════════════════════ */

  test('R743 ⑧ the catalogue Atlas is handed is the ops declaration itself', async () => {
    const { ops, atlas, data } = await boot([{ id: 'rail', label: 'Railways', features: [pt(0, 0)] }]);
    const cat = atlas.catalogue();
    assert.deepEqual(cat.ops, ops.ops(), 'the catalogue is a copy that has already drifted from DECL');
    assert.ok(cat.ops.length >= 16, 'only ' + cat.ops.length + ' ops reached the planner');

    /* What the reader has, and what the map has — both asked, neither listed. */
    data.add({ title: 'Clinics', features: [pt(1, 1, { n: 'a' })] });
    const again = atlas.catalogue();
    assert.equal(again.datasets.length, 1);
    assert.equal(again.datasets[0].title, 'Clinics');
    assert.deepEqual(again.layers.map((l) => l.ref), ['layer:rail']);
  });

  /* ══ ⑨ 案内文は宣言された op を全部名指す ═══════════════════════════════════════════════ */

  test('R743 ⑨ the planner text names every declared op — a new op cannot hide in it', async () => {
    const { ops } = await boot();

    /* ⚠ THIS IS THE ONE HAND-WRITTEN LIST THE ROUND COULD NOT REMOVE: the catalogue is prose sent to
       a model, and js/atlas-catalog-text.js is evaluated before the GIS chunk is loaded, so it cannot
       ask DECL what exists. It is therefore MEASURED against DECL instead — an op added tomorrow
       fails this line until the sentence the planner reads knows about it. #R733 is why it must be
       named rather than searched for: a capability the model is not told it can pass is a capability
       it does not use. */
    const text = await catalogueText(['data.gis']);   /* (atlas-capability-single-source) the prose moved into the entries — read the catalogue the planner is given */
    assert.ok(text, 'the GIS catalogue block is gone');
    const named = new Set();
    const re = /([a-zA-Z][a-zA-Z0-9]*)\((1|2)[:)]/g;
    let m;
    while ((m = re.exec(text))) named.add(m[1]);
    const declared = ops.ops().map((d) => d.id).sort();
    const missing = declared.filter((id) => !named.has(id));
    assert.deepEqual(missing, [], 'declared ops the planner is never told about: ' + missing.join(', '));
    const invented = [...named].filter((id) => declared.indexOf(id) < 0).sort();
    assert.deepEqual(invented, [], 'the text offers ops that do not exist: ' + invented.join(', '));
  });

  /* ══ ⑩ 出力の id が次の入力になる ═══════════════════════════════════════════════════════ */

  test('R743 ⑩ a step answers with a dataset id, and that id is the next step input', async () => {
    const { atlas, data } = await boot([
      { id: 'rail', label: 'Railways', features: [pt(139.7, 35.68), pt(139.8, 35.68)] },
    ]);
    const wards = data.add({
      title: 'Wards',
      features: [poly([box(139.5, 35.5, 140.0, 35.9)], { ward: 'central' })],
    });

    /* ⚠ THE CHAIN STARTS FROM A LAYER OF THE MAP. A session that has imported nothing has an empty
       registry and a map full of data; without this door Atlas could never begin. */
    const buf = await atlas.run({ op: 'buffer', inputs: ['layer:rail'], params: { radiusKm: 5 } });
    assert.equal(buf.ok, true, 'buffer refused: ' + buf.why + ' ' + JSON.stringify(buf.detail));
    assert.ok(buf.dataset.id, 'the step did not say what it made');
    assert.equal(buf.dataset.count, 2);

    const merged = await atlas.run({ op: 'dissolve', inputs: [buf.dataset.id] });
    assert.equal(merged.ok, true, 'dissolve refused: ' + merged.why);
    assert.equal(merged.dataset.count, 1, 'the two overlapping buffers did not become one shape');

    const counted = await atlas.run({ op: 'aggregate', inputs: [wards.id, merged.dataset.id], params: { stat: 'count' } });
    assert.equal(counted.ok, true, 'aggregate refused: ' + counted.why);
    assert.equal(counted.dataset.count, 1);
    assert.equal(data.get(counted.dataset.id).features()[0].properties.count, 1);

    /* The reply tells the planner the id, in the reader's own languages, and says what to do with it. */
    assert.ok(buf.html.indexOf(buf.dataset.id) >= 0, 'the answer does not carry the id it made');

    /* ⚠ RESOLVING THE SAME LAYER TWICE DOES NOT BAKE IT TWICE within one step. */
    const before = data.list().length;
    await atlas.run({ op: 'relate', inputs: ['layer:rail', 'layer:rail'], params: { predicate: 'intersects' } });
    assert.equal(data.list().length, before + 2, 'one layer referenced twice was copied twice into the registry');
  });

  /* ══ ⑪ 拒否は語彙を運ぶ ═════════════════════════════════════════════════════════════════ */

  test('R743 ⑪ a refusal carries what exists, or the declaration of the op that refused', async () => {
    const { atlas, ops, data } = await boot([{ id: 'rail', label: 'Railways', features: [pt(0, 0)] }]);
    data.add({ title: 'Clinics', features: [pt(1, 1)] });

    const bad = await atlas.run({ op: 'bufferr', inputs: ['Clinics'], params: {} });
    assert.equal(bad.ok, false);
    assert.equal(bad.why, 'op-unknown');
    assert.deepEqual(bad.detail.ops, ops.ops().map((d) => d.id), 'a misspelled op was refused without the list');

    const lost = await atlas.run({ op: 'buffer', inputs: ['Clinic'], params: { radiusKm: 1 } });
    assert.equal(lost.ok, false);
    assert.equal(lost.why, 'input-unresolved');
    assert.deepEqual(lost.detail.datasets.map((d) => d.title), ['Clinics']);
    assert.deepEqual(lost.detail.layers.map((l) => l.ref), ['layer:rail']);

    /* ⚠ A REFUSED STEP HANDS BACK THE OP'S SHAPE. js/gis-ops.js names the parameter it refused; what
       it cannot know is that its caller has never seen the op. */
    const noRadius = await atlas.run({ op: 'buffer', inputs: ['Clinics'], params: {} });
    assert.equal(noRadius.ok, false);
    assert.equal(noRadius.why, 'missing-param');
    assert.equal(noRadius.declaration.id, 'buffer');
    assert.ok(noRadius.declaration.params.some((p) => p.name === 'radiusKm' && p.required));

    /* A grid slot fed a samplable layer says exactly what it is missing, rather than inventing a
       window and a resolution nobody asked for. */
    const { atlas: a2, data: d2 } = await boot([{ id: 'elev', label: 'Elevation', samplable: true, features: [] }]);
    d2.add({ title: 'Zones', features: [poly([box(0, 0, 1, 1)], {})] });
    const grid = await a2.run({ op: 'zonal', inputs: ['Zones', 'layer:elev'], params: { stat: 'mean' } });
    assert.equal(grid.ok, false);
    assert.equal(grid.why, 'raster-sample-needs-window');
    /* (#R759) 綴りが `acquire.*` になった。取得条件は 1 つの object になり、窓はその 3 欄である
       (js/gis-layers.js acquireFields)。⚠ `sample` は消していない——#R743 が出荷した綴りで、同じ 3 欄を
       指し、今日も動く（すぐ下の行が測る）。拒否が名指すのは、目録が planner に教えているほうである。 */
    assert.deepEqual(grid.detail.needs, ['acquire.bounds', 'acquire.width', 'acquire.height']);
    assert.deepEqual(grid.detail.accepts, ['bounds', 'width', 'height', 'where', 'unit']);
    /* ⚠ 古い綴りが今日も届くこと。届かなくなっていたら、それは黙って縮小したのと同じである。 */
    const still = await a2.run({ op: 'zonal', inputs: ['Zones', 'layer:elev'], params: { stat: 'mean' }, sample: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
    assert.notEqual(still.why, 'raster-sample-needs-window');
  });

  /* ══ ⑫ 描くことは別の約束である ═════════════════════════════════════════════════════════ */

  test('R743 ⑫ computing and drawing are two capabilities, not one', async () => {
    const { atlas, drawn, data } = await boot();
    data.add({ title: 'Clinics', features: [pt(1, 1)] });

    /* ⚠ A STEP DOES NOT PAINT. Four intermediate results of a chain on the map are four layers the
       reader did not ask for — and a capability that paints only sometimes cannot declare that it
       paints, which is how a correct answer gets reported `not_rendered` (#R736/#R737). */
    const buf = await atlas.run({ op: 'buffer', inputs: ['Clinics'], params: { radiusKm: 1 } });
    assert.equal(buf.ok, true, 'buffer refused: ' + buf.why);
    assert.deepEqual(drawn, [], 'a computing step drew on the map without being asked');

    const shown = await atlas.draw({ dataset: buf.dataset.id });
    assert.equal(shown.ok, true, 'draw refused: ' + shown.why);
    assert.deepEqual(drawn, [buf.dataset.id]);
    assert.equal(shown.drawn, true);

    /* And the two are registered as two capabilities with two schemas — the audit in
       scripts/atlas-capability-audit.mjs measures the rest of that claim. */
    for (const id of ['data.gis', 'map.drawDataset']) {   /* (atlas-capability-modules) each is an entry with its own row and schema */
      const e = capabilityEntry(id);
      assert.ok(e && e.row && e.schema, id + ' is a capability with its own row and schema');
    }
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R739 · draw() answers with what the map reported   (was tests/r739-gis-draw-truth-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R739 · 「描いた」は誰かが測った事実である — draw() が成功を報告していた相手は誰もいなかった
 * ----------------------------------------------------------------------------
 *  #R738 の production verification。本番（R738）で実測:
 *
 *      IntMapGis.draw(id)            → {ok:true}
 *      GeoJSONUpload.find(id)        → null        ← 地図には何も無い
 *      GeoJSONUpload.style(id, …)    → {ok:false, why:'no-such-layer'}
 *
 *  読者は「描けました」と言われ、その直後に「そのレイヤーはありません」と言われる。⚠ これは
 *  #R736 が記録した形の裏返し（あちらは成功した描画が「描かれていない」と報告した）で、根は同じ
 *  ——**描画の結果を、描画した当人以外が推測している**。
 *
 *  ⑴ js/map-ui.js の addFC() は 3 枚のレイヤーを 1 つの try で囲み、`catch(_){}` で飲んでいた。
 *     ソースは受け付けるがレイヤーは全部拒む描画器（実測: Globe）では、一覧に行が残り、engine に
 *     ソースが残り、**地図には何も無い**。
 *  ⑵ js/gis-core.js の draw() は `GU.add(...)` が throw しないことだけを見て `ok:true` を返していた。
 *
 *  どちらも「例外が出なかった」を「できた」の代わりに使っている。
 * ==========================================================================*/
describe('§ #R739 · draw() answers with what the map reported', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ══ ① draw() は add() が報告したものを答える ═════════════════════════════════════════════ */

  test('R739 ① draw() answers with what the map reported, not with the absence of a throw', async () => {
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const w = {};
    globalThis.window = w;
    const data = makeGisDatasets();
    w.IntMapData = data;

    const ds = data.add({
      title: 'result', provenance: { kind: 'op', op: 'compute', inputs: [], params: {} },
      features: [{ type: 'Feature', properties: { a: '1' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
    });

    /* The whole of draw(), lifted out of js/gis-core.js's factory by evaluating the file the way the
       browser does would need the other eight modules; what is under test is one branch, so the branch
       is exercised against the two answers js/map-ui.js can give. */
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisIndex } = await import('../js/gis-index.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    void makeGisGeometry; void makeGisCrs; void makeGisRaster; void makeGisIndex;
    void makeGisExpr; void makeGisLayers; void makeGisOps; void makeGisProject;

    /* ⚠ THE MAP THAT CANNOT DRAW. It does not throw — that is the entire point: the defect was that
       «no exception» was being read as «drawn». */
    let asked = null;
    w.GeoJSONUpload = { add: (fc, title, r, opts) => { asked = { title, opts }; return null; } };

    const src = read('js/gis-core.js');
    assert.ok(/const put = GU\.add\(/.test(src), 'draw() keeps what add() returned');
    assert.ok(/if \(!put\) return \{ ok: false, why: 'draw-not-rendered'/.test(src),
      'and a map that could not draw is answered by name rather than with ok:true');
    assert.ok(!/GU\.add\([^;]*\);\s*\n\s*return \{ ok: true \};/.test(src),
      'the unconditional ok:true is gone');
    void ds; void asked;
  });

  /* ══ ② 3 枚のレイヤーは、まとめて飲まれない ══════════════════════════════════════════════ */

  test('R739 ② a renderer that refuses every layer is not reported as a drawing', async () => {
    /* 綴りのまま（前半）: addFC は js/map-ui.js の layerRegistry の中の、描画エンジンに 3 枚のレイヤーを
       足す closure で、Node で組み立てられる扉が無い——実際の描画での答えは ① が js/gis-core.js
       越しに評価で測っている。後半（読者への文）は評価で測る。 */
    const ui = read('js/map-ui.js');
    const at = ui.indexOf('function addFC(');
    assert.ok(at > 0);
    const body = ui.slice(at, at + 4000);

    /* ⚠ THE SHAPE, NOT THE SPELLING. What must be true is that the three layer additions are counted
       and that zero of them is an outcome the function acts on — measured by the presence of a counter
       that the failure branch reads, not by matching the exact identifier. */
    assert.ok(/for\s*\(const \w+ of \[/.test(body), 'the three layers are added from one list rather than three copies');
    assert.ok(/drawn\+\+/.test(body), 'what was actually added is counted');
    assert.ok(/if\(!drawn\)\{/.test(body), 'and none of them is a case the function handles');
    assert.ok(/removeSource/.test(body.slice(body.indexOf('if(!drawn)'))), 'the orphan source goes with it');
    assert.ok(/return null;/.test(body.slice(body.indexOf('if(!drawn)'))), 'and the caller is told');

    /* ⚠ AND THE SENTENCE EXISTS. tests/geo-gis-datasets-checks.test.mjs (#R729) ④ measures this for the gis modules; the
       import path's sentences live in js/gis-panel.js for the panel and js/map-ui.js for the toast. */
    /* ⚠ EVALUATED (it used to look for the quoted code anywhere in js/gis-panel.js, which a comment or
       an unreachable row satisfies): the panel is built and asked, and a sentence counts only if it is
       not the fallback — the fallback carries the code, so the code in the answer means no sentence. */
    const w = installWindow();
    w.IntMapLang = { t: (which, en, jp) => (which === 'jp' ? jp : en), locale: () => 'en-US' };
    const { makeGisPanel } = await import('../js/gis-panel.js');
    for (const which of ['en', 'jp']) {
      const text = makeGisPanel({ lang: which }).reasonText('draw-not-rendered', {});
      assert.ok(typeof text === 'string' && text.length > 0 && text.indexOf('draw-not-rendered') < 0,
        'the new refusal has a sentence in the panel (' + which + '): ' + text);
    }
    assert.ok(/cannot draw imported shapes/.test(ui), 'and the reader gets a toast at the moment it happens');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · joins   (was tests/r783-joins-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 異なるデータを組み合わせる — 空間結合・最近傍・時間結合・単位換算・集計の可否
 * ----------------------------------------------------------------------------
 *  The outside review's §9 named four things the ops layer could not do, and all four are about
 *  COMBINING records rather than about computing one:
 *
 *    「汎用空間結合（区域内の施設・災害範囲と地物を、相手の属性付きで。1 対多を明示的に）」
 *    「最近傍結合（各地物から最寄りの対象を、距離と対象 ID 付きで）」
 *    「時点・期間に基づく結合（当時の区域・観測時点の統計・期間が重なるイベント）」
 *    「明示的な単位変換（手作業の倍率計算ではなく、換算前後の単位と変換をレシピに残す）」
 *
 *  …and §9 also said the two ops that AGGREGATE were not reading js/gis-units.js's verdict about
 *  whether the arithmetic means anything for the quantity.
 *
 *    ① 1 対多が、取りこぼしも重複もなく返る（件数と ID の集合で測る）
 *    ② 1 対多のとき何が起きるかは呼び手が述べる — 既定で黙って先頭を採らない
 *    ③ 最近傍は本当に最寄り — 索引ありの答えを全探索の答えと突き合わせる
 *    ④ 時点結合が境界の瞬間で正しい（開始日・終了日そのもの・裸の年・半開）
 *    ⑤ 空の結果と「できなかった」は別の答え
 *    ⑥ 換算前後の単位と使った変換が、レシピを読み返すと在る
 *    ⑦ 換算できない組は、係数を掛けずに理由のある拒否になる
 *    ⑧ 集計の可否は js/gis-units.js に訊かれ、未申告は黙って allowed にならない
 *    ⑨ 宣言と実行が食い違わない（新しい op に runner があり、面と語彙を述べている）
 * ==========================================================================*/
describe('§ #R783 · joins', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* `opts.without` leaves a kernel unmounted, which is how ⑤ and ⑦ tell 「訊けなかった」 from
     「0 件」. ⚠ EACH FACTORY PUBLISHES ITSELF onto `window` as its last act (js/gis-core.js is the
     only mounting point in the product), so a kernel is left out by NOT BUILDING IT — skipping the
     assignment would leave the module mounted anyway and this file would be measuring nothing. */
  async function boot(opts) {
    const o = opts || {};
    const without = Array.isArray(o.without) ? o.without : [];
    const has = (k) => without.indexOf(k) < 0;
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets();
    let geometry = null, index = null, units = null;
    if (has('geometry')) { geometry = (await import('../js/gis-geometry.js')).makeGisGeometry(); }
    if (has('index')) { index = (await import('../js/gis-index.js')).makeGisIndex(); }
    if (has('units')) { units = (await import('../js/gis-units.js')).makeGisUnits(); }
    const ops = makeGisOps();
    w.IntMapData = data;
    w.IntMapGisOps = ops;
    if (geometry) await geometry.ready();
    return { w, data, ops, geometry, index, units };
  }

  const pt = (lng, lat, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
  const poly = (ring, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Polygon', coordinates: [ring] } });
  const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const rowOnly = (props) => ({ type: 'Feature', properties: props, geometry: null });

  /* ══ ① 1 対多が、取りこぼしも重複もなく返る ═══════════════════════════════════════════════ */

  test('R783 ① a one-to-many spatial join loses nothing and duplicates nothing', async () => {
    const { data, ops } = await boot();

    /* Two wards, and clinics whose ward is known BY CONSTRUCTION — so the expected pairs are a fact
       about the fixture rather than a second run of the thing being measured. */
    const wards = data.add({
      title: 'Wards',
      features: [
        poly(box(0, 0, 1, 1), { ward: 'west' }),
        poly(box(1, 0, 2, 1), { ward: 'east' }),
      ],
    });
    const clinicRows = [];
    const expected = { west: [], east: [] };
    for (let i = 0; i < 40; i++) {
      const west = (i % 3) !== 0;
      const lng = west ? (0.05 + (i % 9) * 0.1) : (1.05 + (i % 9) * 0.1);
      const id = 'c' + i;
      clinicRows.push(pt(lng, 0.2 + (i % 7) * 0.1, { id: id, beds: 10 + i }));
      expected[west ? 'west' : 'east'].push(id);
    }
    /* One clinic outside both wards: it must appear in NO pair. */
    clinicRows.push(pt(5, 5, { id: 'far', beds: 1 }));
    const clinics = data.add({ title: 'Clinics', features: clinicRows });

    const res = await ops.run({
      op: 'spatialJoin', inputs: [wards.id, clinics.id],
      params: { predicate: 'intersects', cardinality: 'all', prefix: 'c_' },
    });
    assert.equal(res.ok, true, 'spatialJoin refused: ' + res.why + ' ' + JSON.stringify(res.detail));

    const rows = data.get(res.dataset.id).features();
    /* ⚠ 件数で測るだけでは「取りこぼし」と「重複」が打ち消し合う。ID の集合で測る。 */
    assert.equal(rows.length, expected.west.length + expected.east.length, 'the pair count is not the number of pairs the fixture has');
    const got = { west: [], east: [] };
    for (const r of rows) got[r.properties.ward].push(r.properties.c_id);
    for (const ward of ['west', 'east']) {
      const a = got[ward].slice().sort(), b = expected[ward].slice().sort();
      assert.deepEqual(a, b, ward + ': the partners are not exactly the ones inside it');
      assert.equal(new Set(a).size, a.length, ward + ': a clinic was handed over twice');
    }
    /* The count of partners rides on the row, so 'first' cannot look like 1-to-1 (see ②). */
    assert.equal(rows.filter((r) => r.properties.ward === 'west')[0].properties._joinPartners, expected.west.length);
    assert.equal(res.stats.pairs, rows.length);
    assert.equal(res.stats.matched, 2);
    assert.equal(res.stats.unmatched, 0);
    assert.equal(res.stats.oneToMany, 2);

    /* ⚠ AND THE INDEXED AND UNINDEXED PATHS ANSWER THE SAME THING. An index that dropped a true pair
       would make this count quietly smaller (js/gis-index.js's own promise), and an agreement between
       two readers of one wrong rule is not a measurement — so the reference is the walk without it. */
    const plain = await boot({ without: ['index'] });
    const w2 = plain.data.add({ title: 'Wards', features: data.get(wards.id).features() });
    const c2 = plain.data.add({ title: 'Clinics', features: data.get(clinics.id).features() });
    const res2 = await plain.ops.run({
      op: 'spatialJoin', inputs: [w2.id, c2.id],
      params: { predicate: 'intersects', cardinality: 'all', prefix: 'c_' },
    });
    assert.equal(res2.ok, true, 'the unindexed walk refused: ' + res2.why);
    assert.equal(res.stats.indexed, true, 'the indexed run did not use the index');
    assert.equal(res2.stats.indexed, false, 'the reference run used an index');
    const ids = (d, recs) => recs.features().map((r) => r.properties.ward + '/' + r.properties.c_id).sort();
    assert.deepEqual(ids(data, data.get(res.dataset.id)), ids(plain.data, plain.data.get(res2.dataset.id)),
      'the index changed which pairs exist');
  });

  /* ══ ② 1 対多のとき何が起きるかは、呼び手が述べる ═════════════════════════════════════════ */

  test('R783 ② the cardinality is stated, and `first` is input 1s first row rather than the index order', async () => {
    const { data, ops } = await boot();
    const zone = data.add({ title: 'Zone', features: [poly(box(0, 0, 1, 1), { z: 'z' })] });
    const inside = data.add({
      title: 'Inside',
      features: [pt(0.9, 0.9, { id: 'a' }), pt(0.1, 0.1, { id: 'b' }), pt(0.5, 0.5, { id: 'c' })],
    });

    /* ⚠ NO DEFAULT. A silently-picked cardinality makes the row count depend on data the reader has
       not looked at, and the refusal carries the set so the caller needs no second attempt. */
    const nude = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects' } });
    assert.equal(nude.ok, false);
    assert.equal(nude.why, 'missing-param');
    assert.equal(nude.detail.param, 'cardinality');
    assert.deepEqual(nude.detail.values, ['all', 'first', 'refuse']);

    const refused = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects', cardinality: 'refuse' } });
    assert.equal(refused.ok, false);
    assert.equal(refused.why, 'join-one-to-many');
    assert.equal(refused.detail.partners, 3);
    assert.equal(refused.dataset, undefined, 'a refused join registered a dataset anyway');

    const first = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects', cardinality: 'first', prefix: 'p_' } });
    assert.equal(first.ok, true, 'spatialJoin refused: ' + first.why);
    const rows = data.get(first.dataset.id).features();
    assert.equal(rows.length, 1);
    /* 'a' is the first ROW of input 1 and the furthest point from the zone's origin — so an
       implementation that took whichever partner the grid visited first would answer 'b' or 'c'. */
    assert.equal(rows[0].properties.p_id, 'a', "'first' is not input 1's first matching row");
    assert.equal(rows[0].properties._joinPartners, 3, "'first' hid the fact that there were three");
  });

  /* ══ ③ 最近傍は本当に最寄り ═══════════════════════════════════════════════════════════════ */

  test('R783 ③ the nearest join answers the true nearest — measured against the exhaustive walk', async () => {
    const { data, ops, geometry } = await boot();

    /* 400 targets in a grid plus a handful far away, and 60 subjects scattered over and past them:
       enough that js/gis-index.js is really doing the work, and coarse enough to run in a test. */
    const targets = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) targets.push(pt(0.37 * i, 0.29 * j, { id: 't' + i + '_' + j }));
    targets.push(pt(60, 40, { id: 'far1' }));
    targets.push(pt(-70, -20, { id: 'far2' }));
    const stations = data.add({ title: 'Stations', features: targets });

    const subjects = [];
    for (let k = 0; k < 60; k++) {
      subjects.push(pt(-1 + (k * 0.191) % 9, -1 + (k * 0.137) % 7, { id: 's' + k }));
    }
    const homes = data.add({ title: 'Homes', features: subjects });

    const res = await ops.run({
      op: 'nearestJoin', inputs: [homes.id, stations.id],
      params: { idField: 'id', fields: ['id'], prefix: 'n_' },
    });
    assert.equal(res.ok, true, 'nearestJoin refused: ' + res.why + ' ' + JSON.stringify(res.detail));
    const rows = data.get(res.dataset.id).features();
    assert.equal(rows.length, subjects.length, 'the join changed the row count of a 1-to-1 op');

    /* ⚠ THE EXPECTED ANSWER IS THE FULL WALK, NOT THE INDEXED ONE. Comparing the index against
       itself measures the index's consistency and not its correctness (#R743). */
    for (let k = 0; k < subjects.length; k++) {
      let best = Infinity, bestId = null;
      for (const t of targets) {
        const d = geometry.distanceKm(subjects[k].geometry, t.geometry);
        if (d != null && d < best) { best = d; bestId = t.properties.id; }
      }
      const row = rows[k];
      assert.equal(row.properties.id, 's' + k, 'the rows came back in a different order');
      assert.equal(row.properties._nearestId, bestId,
        's' + k + ': the join says ' + row.properties._nearestId + ' and the exhaustive walk says ' + bestId);
      assert.ok(Math.abs(row.properties._nearestKm - best) < 1e-9,
        's' + k + ': the distance is ' + row.properties._nearestKm + ' and the walk measured ' + best);
      assert.equal(typeof row.properties._nearestRow, 'number', 'the answer does not say which row it measured to');
    }

    /* ⚠ `maxKm` IS A LIMIT AND NOT A SEARCH RADIUS: a subject with nothing inside it has NO partner,
       which is a different answer from 「一番近いのは遠かった」. */
    const lonely = data.add({ title: 'Lonely', features: [pt(120, 60, { id: 'x' })] });
    const near = await ops.run({ op: 'nearestJoin', inputs: [lonely.id, stations.id], params: { maxKm: 10, prefix: 'n_' } });
    assert.equal(near.ok, true, 'nearestJoin refused: ' + near.why);
    const lone = data.get(near.dataset.id).features()[0];
    assert.equal(lone.properties._nearestKm, undefined, 'a row with nothing within 10 km was given a partner');
    assert.equal(near.stats.unmatched, 1);
    assert.equal(near.stats.matched, 0);

    /* …and the same row DOES get a partner with no limit, so the check above is not passing on an
       implementation that never matches anything. */
    const any = await ops.run({ op: 'nearestJoin', inputs: [lonely.id, stations.id], params: { prefix: 'm_' } });
    assert.equal(any.ok, true, 'nearestJoin refused: ' + any.why);
    assert.equal(data.get(any.dataset.id).features()[0].properties._nearestKm > 10, true);

    /* A tie is reported rather than silently broken: the lowest row of input 1 wins. */
    const mid = data.add({ title: 'Mid', features: [pt(0, 0, { id: 'm' })] });
    const two = data.add({ title: 'Two', features: [pt(-1, 0, { id: 'left' }), pt(1, 0, { id: 'right' })] });
    const tie = await ops.run({ op: 'nearestJoin', inputs: [mid.id, two.id], params: { idField: 'id', fields: ['id'], prefix: 't_' } });
    assert.equal(tie.ok, true, 'nearestJoin refused: ' + tie.why);
    assert.equal(tie.stats.ties, 1, 'a tie was not reported');
    assert.equal(data.get(tie.dataset.id).features()[0].properties._nearestId, 'left', 'the tie was not broken by input 1s order');
  });

  /* ══ ④ 時点結合が、境界の瞬間で正しい ═════════════════════════════════════════════════════ */

  test('R783 ④ the temporal join reads the boundary half-open — the day belongs to the successor', async () => {
    const { data, ops } = await boot();

    /* 廃藩置県: the 国 ends on 1871-08-29 and the 県 begins on 1871-08-29. Both upstreams state that
       same day, and 「その日の区域」 has one answer under [from, to) and two under [from, to]. */
    const units = data.add({
      title: 'Units',
      features: [
        rowOnly({ unit: 'kuni', from: '1868-01-01', to: '1871-08-29' }),
        rowOnly({ unit: 'ken', from: '1871-08-29', to: '' }),
      ],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    const obs = data.add({ title: 'Obs', features: [rowOnly({ id: 'o1' })] });

    const ask = (at, ends) => ops.run({
      op: 'timeJoin', inputs: [obs.id, units.id],
      params: { at: at, ends: ends, cardinality: 'all', fields: ['unit'], prefix: 'u_' },
    });

    const onTheDay = await ask('1871-08-29', 'exclusive');
    assert.equal(onTheDay.ok, true, 'timeJoin refused: ' + onTheDay.why + ' ' + JSON.stringify(onTheDay.detail));
    assert.deepEqual(data.get(onTheDay.dataset.id).features().map((f) => f.properties.u_unit), ['ken'],
      'the stated end instant was counted as still holding');

    const before = await ask('1871-08-28', 'exclusive');
    assert.deepEqual(data.get(before.dataset.id).features().map((f) => f.properties.u_unit), ['kuni'],
      'the day before the end is not inside the span');

    /* ⚠ AND THE OTHER READING IS REACHABLE AND DIFFERENT. A check that only ever sees one answer
       cannot tell a half-open implementation from one that hard-codes the successor. */
    const inclusive = await ask('1871-08-29', 'inclusive');
    assert.deepEqual(data.get(inclusive.dataset.id).features().map((f) => f.properties.u_unit).sort(), ['ken', 'kuni'],
      'the inclusive reading did not keep the row whose last instant that is');
    assert.equal(onTheDay.stats.ends, 'exclusive');
    assert.equal(onTheDay.stats.endsRead.statedEnd > 0, true, 'the answer does not say how the ends were read');

    /* 裸の年はその年 1 年 — and its exclusive bound is the first instant of the next year. */
    const years = data.add({
      title: 'Years',
      features: [rowOnly({ era: 'meiji4', from: '1871', to: '1871' })],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    const yearAt = (at) => ops.run({
      op: 'timeJoin', inputs: [obs.id, years.id],
      params: { at: at, cardinality: 'all', fields: ['era'], prefix: 'y_' },
    });
    const lastDay = await yearAt('1871-12-31');
    assert.equal(data.get(lastDay.dataset.id).features()[0].properties.y_era, 'meiji4', 'a bare year did not cover its own 31 December');
    const nextDay = await yearAt('1872-01-01');
    assert.equal(nextDay.stats.matched, 0, 'a bare year reached into the next one');
    assert.equal(nextDay.ok, true, 'a year that does not match is a refusal rather than an answer');

    /* A window, and the same half-open rule for the reader's own `to`. */
    const win = await ops.run({
      op: 'timeJoin', inputs: [obs.id, units.id],
      params: { from: '1871-08-01', to: '1871-08-29', cardinality: 'all', fields: ['unit'], prefix: 'w_' },
    });
    assert.deepEqual(data.get(win.dataset.id).features().map((f) => f.properties.w_unit), ['kuni'],
      'the window included the instant it stops at');

    /* 期間が重なるイベント: both sides read from their own axes, and `within`/`contains` are exact. */
    const events = data.add({
      title: 'Events',
      features: [rowOnly({ ev: 'long', from: '1869', to: '1875' }), rowOnly({ ev: 'short', from: '1870-06-01', to: '1870-06-10' })],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    const spans = data.add({
      title: 'Spans',
      features: [rowOnly({ sp: '1870', from: '1870', to: '1870' })],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    const overlaps = await ops.run({ op: 'timeJoin', inputs: [events.id, spans.id], params: { relation: 'overlaps', cardinality: 'all', fields: ['sp'], prefix: 's_' } });
    assert.equal(overlaps.stats.matched, 2, 'both events overlap 1870');
    const within = await ops.run({ op: 'timeJoin', inputs: [events.id, spans.id], params: { relation: 'within', cardinality: 'all', fields: ['sp'], prefix: 'v_' } });
    assert.equal(within.stats.matched, 1, 'only the ten-day event is inside 1870');
    assert.deepEqual(data.get(within.dataset.id).features().filter((f) => f.properties.v_sp).map((f) => f.properties.ev), ['short']);

    /* An axis is REQUIRED of the side being asked when it holds, and the refusal says which input. */
    const noAxis = await ops.run({ op: 'timeJoin', inputs: [obs.id, obs.id], params: { at: '1871', cardinality: 'all' } });
    assert.equal(noAxis.ok, false);
    assert.equal(noAxis.why, 'time-not-declared');
    assert.equal(noAxis.detail.input, 1);
    const noLeft = await ops.run({ op: 'timeJoin', inputs: [obs.id, units.id], params: { cardinality: 'all' } });
    assert.equal(noLeft.ok, false);
    assert.equal(noLeft.why, 'time-not-declared');
    assert.equal(noLeft.detail.input, 0, 'a left side with neither an axis nor a stated moment was accepted');
  });

  /* ══ ⑤ 空の結果と「できなかった」は別の答え ═══════════════════════════════════════════════ */

  test('R783 ⑤ nothing matched, no partner to match against, and could not be asked are three answers', async () => {
    const { data, ops } = await boot();
    const here = data.add({ title: 'Here', features: [poly(box(0, 0, 1, 1), { a: 1 })] });
    const there = data.add({ title: 'There', features: [pt(50, 50, { b: 2 })] });

    /* ⑴ a real answer of zero: the run worked and the data does not meet. */
    const none = await ops.run({ op: 'spatialJoin', inputs: [here.id, there.id], params: { predicate: 'intersects', cardinality: 'all', prefix: 'x_' } });
    assert.equal(none.ok, true, 'a join that matched nothing was reported as a failure');
    assert.equal(none.stats.matched, 0);
    assert.equal(none.stats.unmatched, 1);
    assert.equal(data.get(none.dataset.id).count, 1, 'the unmatched row was dropped without being asked to be');
    const dropped = await ops.run({ op: 'spatialJoin', inputs: [here.id, there.id], params: { predicate: 'intersects', cardinality: 'all', unmatched: 'drop', prefix: 'y_' } });
    assert.equal(data.get(dropped.dataset.id).count, 0, 'unmatched:drop kept the row');

    /* ⑵ the right-hand input has no geometry at all — a fact about the inputs, not about the data. */
    const table = data.add({ title: 'Table', features: [rowOnly({ code: '01100' })] });
    const noGeom = await ops.run({ op: 'spatialJoin', inputs: [here.id, table.id], params: { predicate: 'intersects', cardinality: 'all' } });
    assert.equal(noGeom.ok, false);
    assert.ok(noGeom.why === 'no-features' || noGeom.why === 'input-has-no-geometry', 'a table joined spatially answered ' + noGeom.why);

    /* ⑶ the kernel that decides the relation is not mounted: 「訊けなかった」, by name, and NOT an
       empty success. */
    const blind = await boot({ without: ['geometry'] });
    const h2 = blind.data.add({ title: 'Here', features: [poly(box(0, 0, 1, 1), { a: 1 })] });
    const t2 = blind.data.add({ title: 'There', features: [pt(0.5, 0.5, { b: 2 })] });
    const unasked = await blind.ops.run({ op: 'spatialJoin', inputs: [h2.id, t2.id], params: { predicate: 'intersects', cardinality: 'all', prefix: 'z_' } });
    assert.equal(unasked.ok, false, 'a join with no geometry kernel answered with rows');
    assert.ok(unasked.why === 'geometry-missing' || unasked.why === 'geometry-unavailable', 'the refusal is ' + unasked.why);
  });

  /* ══ ⑥ 換算前後の単位と使った変換が、レシピに残る ═════════════════════════════════════════ */

  test('R783 ⑥ the conversion states what it was in, what it is in, and the transform — in the recipe', async () => {
    const { data, ops } = await boot();
    const ds = data.add({
      title: 'Roads',
      features: [pt(0, 0, { name: 'a', len: 1500 }), pt(1, 1, { name: 'b', len: 250 })],
      fieldStatements: { len: { unit: 'm', unitStated: 'reader' } },
    });
    assert.equal(data.get(ds.id).fields.find((f) => f.name === 'len').unit, 'm', 'the fixture did not carry a unit');

    const res = await ops.run({ op: 'convert', inputs: [ds.id], params: { field: 'len', to: 'km', outName: 'len_km' } });
    assert.equal(res.ok, true, 'convert refused: ' + res.why + ' ' + JSON.stringify(res.detail));
    const rows = data.get(res.dataset.id).features();
    assert.equal(rows[0].properties.len_km, 1.5, 'the values were not converted');
    assert.equal(rows[1].properties.len_km, 0.25);
    assert.equal(rows[0].properties.len, 1500, 'the source column was rewritten');

    /* ⚠ READ BACK OFF THE RECORD, not off the return value: `stats` is printed for this turn and
       written nowhere (#R763), so a manifest holding only `params` would never say what the column
       had been in — the reader states only the TARGET, because the source is on the column. */
    const prov = data.get(res.dataset.id).provenance;
    assert.equal(prov.kind, 'op');
    assert.equal(prov.op, 'convert');
    assert.ok(prov.resolved, 'the recipe does not record what the run resolved');
    assert.equal(prov.resolved.from, 'm', 'the recipe does not say what the column was in');
    assert.equal(prov.resolved.to, 'km');
    assert.equal(prov.resolved.fromStatedBy, 'column');
    assert.equal(prov.resolved.transform.slope, 0.001, 'the recipe does not carry the transform that was used');
    assert.equal(prov.resolved.transform.intercept, 0);
    assert.equal(prov.resolved.transform.kind, 'factor');
    /* …and the output column carries the unit it is now in, authored by the op. */
    const col = data.get(res.dataset.id).fields.find((f) => f.name === 'len_km');
    assert.equal(col.unit, 'km', 'the converted column does not state its own unit');

    /* An affine pair is a map and not a 倍率, and which reading was used is in the recipe too. */
    const temps = data.add({
      title: 'Temps', features: [pt(0, 0, { t: 10 })],
      fieldStatements: { t: { unit: '°C', unitStated: 'reader' } },
    });
    const reading = await ops.run({ op: 'convert', inputs: [temps.id], params: { field: 't', to: 'K', outName: 'tK' } });
    assert.equal(reading.ok, true, 'convert refused: ' + reading.why + ' ' + JSON.stringify(reading.detail));
    assert.ok(Math.abs(data.get(reading.dataset.id).features()[0].properties.tK - 283.15) < 1e-9, 'a 10 °C reading is 283.15 K');
    const rp = data.get(reading.dataset.id).provenance.resolved;
    assert.equal(rp.transform.kind, 'affine');
    assert.equal(rp.difference, false);
    const gap = await ops.run({ op: 'convert', inputs: [temps.id], params: { field: 't', to: 'K', outName: 'dK', difference: true } });
    assert.equal(data.get(gap.dataset.id).features()[0].properties.dK, 10, 'a 10 °C difference is 10 K');
    assert.equal(data.get(gap.dataset.id).provenance.resolved.difference, true);

    /* `replace` keeps the name and moves the unit with the values. */
    const inPlace = await ops.run({ op: 'convert', inputs: [ds.id], params: { field: 'len', to: 'km', replace: true } });
    assert.equal(inPlace.ok, true, 'convert refused: ' + inPlace.why);
    const rec = data.get(inPlace.dataset.id);
    assert.equal(rec.features()[0].properties.len, 1.5);
    assert.equal(rec.fields.find((f) => f.name === 'len').unit, 'km', 'the replaced column still claims the old unit');
  });

  /* ══ ⑦ 換算できない組は、係数を掛けずに理由のある拒否になる ═══════════════════════════════ */

  test('R783 ⑦ a pair that cannot be converted is refused by name, never multiplied anyway', async () => {
    const { data, ops } = await boot();
    const ds = data.add({
      title: 'Mixed',
      features: [pt(0, 0, { len: 1500, mass: 2, code: '01100', plain: 5 })],
      fieldStatements: { len: { unit: 'm', unitStated: 'reader' }, mass: { unit: 'kg', unitStated: 'reader' }, code: { unit: 'm', unitStated: 'reader' } },
    });

    const cases = [
      [{ field: 'len', to: 'kg', outName: 'x' }, 'unit-incompatible'],
      [{ field: 'len', to: 'furlong', outName: 'x' }, 'unit-unreadable'],
      [{ field: 'plain', to: 'km', outName: 'x' }, 'unit-not-stated'],
      [{ field: 'len', from: 'km', to: 'm', outName: 'x' }, 'unit-from-contradicts-column'],
      [{ field: 'nope', to: 'km', outName: 'x' }, 'unknown-field'],
      [{ field: 'len', to: 'km' }, 'missing-param'],
      [{ field: 'len', to: 'km', outName: 'mass' }, 'output-column-in-use'],
      [{ field: 'code', to: 'km', outName: 'x' }, 'convert-nothing-numeric'],
    ];
    for (const [params, why] of cases) {
      const r = await ops.run({ op: 'convert', inputs: [ds.id], params: params });
      assert.equal(r.ok, false, JSON.stringify(params) + ' was answered instead of refused');
      assert.equal(r.why, why, JSON.stringify(params) + ' was refused as ' + r.why);
      assert.equal(r.dataset, undefined, JSON.stringify(params) + ' registered a dataset');
    }

    /* ⚠ AND WITH NO UNIT KERNEL IT DOES NOT FALL BACK TO ARITHMETIC OF ITS OWN — a factor invented
       here is the one thing this op exists to stop. */
    const blind = await boot({ without: ['units'] });
    const d2 = blind.data.add({
      title: 'Mixed', features: [pt(0, 0, { len: 1500 })],
      fieldStatements: { len: { unit: 'm', unitStated: 'reader' } },
    });
    const r = await blind.ops.run({ op: 'convert', inputs: [d2.id], params: { field: 'len', to: 'km', outName: 'x' } });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'units-unavailable');
  });

  /* ══ ⑧ 集計の可否は js/gis-units.js に訊かれる ════════════════════════════════════════════ */

  test('R783 ⑧ aggregate reads the unit kernels verdict, and an undeclared quantity is not permission', async () => {
    const { data, ops } = await boot();
    const zone = data.add({ title: 'Zone', features: [poly(box(0, 0, 4, 4), { z: 'z' })] });
    /* Two areal members of different sizes, so the plain mean and the area-weighted one differ. */
    const members = data.add({
      title: 'Members',
      features: [poly(box(0, 0, 1, 1), { v: 10, cover: 'forest' }), poly(box(2, 2, 3.8, 3.8), { v: 20, cover: 'urban' })],
    });

    /* ⑴ 未申告 — the run is what it always was, and the verdict is RECORDED rather than read as
       permission ([[intmap-data-must-not-claim-an-author-it-lacks]]). */
    const plain = await ops.run({ op: 'aggregate', inputs: [zone.id, members.id], params: { stat: 'mean', field: 'v' } });
    assert.equal(plain.ok, true, 'aggregate refused: ' + plain.why + ' ' + JSON.stringify(plain.detail));
    assert.equal(data.get(plain.dataset.id).features()[0].properties.mean_v, 15, 'the undeclared mean stopped being the plain mean');
    assert.equal(plain.stats.aggregation.verdict, 'undeclared', 'an undeclared quantity was recorded as ' + plain.stats.aggregation.verdict);
    assert.equal(data.get(plain.dataset.id).provenance.resolved, undefined,
      'a run over an undeclared quantity wrote a rule into the recipe it had not been given');

    /* ⑵ refused — a real contradiction, with the kernel's own remedy. */
    const cat = await ops.run({
      op: 'aggregate', inputs: [zone.id, members.id],
      params: { stat: 'mean', field: 'cover', quantity: { kind: 'category' } },
    });
    assert.equal(cat.ok, false, 'the mean of a category was answered with a number');
    assert.equal(cat.why, 'aggregation-refused');
    assert.equal(cat.detail.remedy, 'majority', 'the refusal does not carry the remedy the kernel gave');

    /* ⑶ needs-weight — the refusal names the method that HAS the weight, and that method exists. */
    const density = { kind: 'density', space: 'perArea', unit: 'kg/m2' };
    const needs = await ops.run({
      op: 'aggregate', inputs: [zone.id, members.id],
      params: { stat: 'mean', field: 'v', quantity: density },
    });
    assert.equal(needs.ok, false, 'the unweighted mean of a density was answered');
    assert.equal(needs.why, 'aggregation-needs-weight');
    assert.equal(needs.detail.weight, 'area');
    assert.equal(needs.detail.remedy, 'areaWeightedMean');
    const stats = ops.op('aggregate').params.find((p) => p.name === 'stat');
    assert.ok(stats.values.indexOf(needs.detail.remedy) >= 0,
      'the remedy the refusal points at is not a stat this op offers — the door #R752 kept finding missing');

    /* …and the remedy really answers: Σ(v·km²)/Σkm² over the members, each weighted by its own area. */
    const weighted = await ops.run({
      op: 'aggregate', inputs: [zone.id, members.id],
      params: { stat: 'areaWeightedMean', field: 'v', quantity: density, outName: 'awm' },
    });
    assert.equal(weighted.ok, true, 'areaWeightedMean refused: ' + weighted.why + ' ' + JSON.stringify(weighted.detail));
    const a1 = ops.areaKm2(data.get(members.id).features()[0].geometry);
    const a2 = ops.areaKm2(data.get(members.id).features()[1].geometry);
    const expect = (10 * a1 + 20 * a2) / (a1 + a2);
    const row = data.get(weighted.dataset.id).features()[0];
    assert.ok(Math.abs(row.properties.awm - expect) < 1e-9, 'the weighted mean is ' + row.properties.awm + ' and Σ(v·km²)/Σkm² is ' + expect);
    assert.ok(Math.abs(row.properties.awm - 15) > 0.5, 'the weighted mean came out as the plain mean — the weights are not being used');
    assert.equal(row.properties._weightKm2 > 0, true, 'the weight used is not beside the number it produced');
    /* 実行した規則はレシピに残る。 */
    const rule = data.get(weighted.dataset.id).provenance.resolved;
    assert.ok(rule && rule.aggregation, 'the recipe does not record the rule that ran');
    assert.equal(rule.aggregation.verdict, 'allowed');
    assert.equal(rule.aggregation.weight, 'area');
    assert.equal(rule.aggregation.method, 'areaWeightedMean');

    /* ⚠ A MEMBER WITH NO GROUND CARRIES NO WEIGHT, AND IS COUNTED. */
    const pts = data.add({ title: 'Points', features: [pt(1, 1, { v: 7 })] });
    const noArea = await ops.run({
      op: 'aggregate', inputs: [zone.id, pts.id],
      params: { stat: 'areaWeightedMean', field: 'v', quantity: density, outName: 'awm2' },
    });
    assert.equal(noArea.ok, true, 'areaWeightedMean refused: ' + noArea.why);
    const r2 = data.get(noArea.dataset.id).features()[0];
    assert.equal(r2.properties.awm2, null, 'a zone whose members have no area was given a weighted mean anyway');
    assert.equal(r2.properties._statNoWeight, 1, 'the member that could not be weighted was not counted');

    /* `count` is a question about the ROWS, so it is answerable for a quantity nobody declared —
       and a build with no unit kernel says 「訊けなかった」 rather than 「よい」. */
    const counted = await ops.run({ op: 'aggregate', inputs: [zone.id, members.id], params: { stat: 'count' } });
    assert.equal(counted.ok, true, 'count refused: ' + counted.why);
    assert.equal(counted.stats.aggregation.verdict, 'allowed');
    const blind = await boot({ without: ['units'] });
    const z2 = blind.data.add({ title: 'Zone', features: [poly(box(0, 0, 4, 4), { z: 'z' })] });
    const m2 = blind.data.add({ title: 'Members', features: [poly(box(0, 0, 1, 1), { v: 10 })] });
    const unasked = await blind.ops.run({ op: 'aggregate', inputs: [z2.id, m2.id], params: { stat: 'mean', field: 'v' } });
    assert.equal(unasked.ok, true, 'a build with no unit kernel stopped aggregating: ' + unasked.why);
    assert.equal(unasked.stats.aggregation.verdict, 'unasked', 'a missing unit kernel was recorded as ' + unasked.stats.aggregation.verdict);
  });

  /* ══ ⑨ 宣言と実行が食い違わない ═══════════════════════════════════════════════════════════ */

  test('R783 ⑨ the new ops are declared the way every other one is, and each has a runner', async () => {
    const { ops } = await boot();
    const src = read('js/gis-ops.js');
    const declared = ops.ops().map((d) => d.id);
    for (const id of ['spatialJoin', 'nearestJoin', 'timeJoin', 'convert']) {
      assert.ok(declared.indexOf(id) >= 0, id + ' is not declared');
    }
    /* ⚠ MEASURED AGAINST THE DISPATCH TABLE, not against a list written here: an op in DECL with no
       runner answers `op-not-wired`, which is a refusal nobody would see until they asked for it. */
    const runBlock = src.slice(src.indexOf('const RUN = {'), src.indexOf('const runner = RUN['));
    for (const id of declared) {
      assert.ok(new RegExp('(^|\\s)' + id + ':').test(runBlock), 'declared op with no runner: ' + id);
    }
    const vocab = ops.surfaces();
    for (const d of ops.ops()) {
      assert.ok(Array.isArray(d.surface), d.id + ' does not say which surface it computes on');
      for (const s of d.surface) assert.ok(vocab.indexOf(s) >= 0, d.id + ' names a surface nothing implements: ' + s);
    }
    /* The two joins that can produce a one-to-many both require the choice, and the enum they offer
       is the one the refusals quote. */
    for (const id of ['spatialJoin', 'timeJoin']) {
      const p = ops.op(id).params.find((x) => x.name === 'cardinality');
      assert.ok(p && p.required === true, id + ' does not require the cardinality to be stated');
      assert.deepEqual(p.values, ['all', 'first', 'refuse']);
      assert.equal(p.default, undefined, id + ' supplies a default cardinality — the silent choice the parameter exists to remove');
    }
    /* `disjoint` is true of everything a feature does not touch, so it cannot carry attributes. */
    const pred = ops.op('spatialJoin').params.find((x) => x.name === 'predicate');
    assert.equal(pred.values.indexOf('disjoint'), -1, 'the spatial join offers a relation with no partner to bring columns from');
    for (const p of ops.predicates()) {
      if (p === 'disjoint') continue;
      assert.ok(pred.values.indexOf(p) >= 0, 'a relate predicate the join does not offer: ' + p);
    }
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R763 · meaning carried across ops   (was tests/r763-gis-meaning-across-ops-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R763 · meaning carried across ops', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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

  test('#R763 ⑩ 2020 年の格子を 2025 年の格子に合わせても、答えは 2020 年のまま', async () => {
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

  test('#R763 ⑩ 格子を貸しただけの相手が時点を述べていなくても、値の日付は消えない', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([1, 2, 3, 4], AT('2020')));
    const b = data.add(gridOf([0, 0, 0, 0], null));
    const r = await ops.run({ op: 'resample', inputs: [a.id, b.id], params: { method: 'nearest' } });
    assert.equal(r.ok, true, r.why);
    assert.ok(r.dataset.time, '格子を貸しただけの入力の沈黙で、値の時点が消えた');
    assert.equal(r.dataset.time.start, data.momentOf('2020').start);
    assert.equal(r.dataset.time.end, data.momentOf('2020').end);
  });

  test('#R763 ⑩ 両方が値を出す演算では、今までどおり両方が投票する（緩めてはいない）', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([5, 5, 5, 5], AT('2020')));
    const b = data.add(gridOf([1, 1, 1, 1], AT('2025')));
    const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.dataset.time.start, data.momentOf('2020').start);
    assert.equal(r.dataset.time.end, data.momentOf('2025').end, '2 時点の差が片方の時点になっている');
  });

  test('#R763 ⑩ 「どの入力が投票するか」は、走った runner が述べる（op の表ではない）', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（宣言表に op ごとの一覧が無いこと。答えの側は同じ節の他の検査が評価で測る）。 */
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

  test('#R763 ⑪ prefix を付けて結合した列の単位は、新しい名前へ付いていく', async () => {
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

  test('#R763 ⑪ prefix が無いときは、今までどおり同じ名前で継承する', async () => {
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

  test('#R763 ⑪ 改名を述べるのは、改名した runner である（この規則が 2 か所に無いこと）', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（答えの側は同じ節の他の検査が評価で測る）。 */
    const src = read('js/gis-ops.js');
    assert.ok(/renamed: renamed/.test(src), 'join が改名を述べていない');
    /* fieldStatements は渡されたものを読むだけで、prefix を自分で解釈しない */
    const at = src.indexOf('function fieldStatements(');
    const body = src.slice(at, at + 2200);
    /* ⚠ 測るのはコードであって註ではない（註は prefix の話をしてよい）。この関数が別の op の
       引数を読んだり、名前を組み立て直したりしていないことだけを測る。 */
    const code = codeOnly(body);
    assert.ok(!/params\.prefix|prefix \+/.test(code), 'fieldStatements が prefix を自分で解釈している（別の op の引数を推測している）');
  });

  /* ══ ⑫ 演算自身が失ったものは、記録に残る ═══════════════════════════════════════════════════ */

  test('#R763 ⑫ 演算が行を落としたら、入力が全部 all でも記録は all と言わない', async () => {
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

  test('#R763 ⑫ 入力が何も述べていなくても、演算が落としたことは述べられる', async () => {
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

  test('#R763 ⑫ 何も落とさなかった演算は、今までどおり入力の判定をそのまま残す', async () => {
    const { data, ops } = await boot();
    const subject = data.add({ title: 's', features: [polyOf([boxOf(0, 81, 10, 88)], { id: 's1' })], provenance: covAll('x') });
    const windows = data.add({ title: 'w', features: [polyOf([boxOf(0, 81, 5, 88)], { id: 'w2' })], provenance: covAll('y') });
    const r = await ops.run({ op: 'clip', inputs: [subject.id, windows.id] });
    assert.equal(r.ok, true, r.why);
    const cov = r.dataset.provenance.coverage;
    assert.equal(cov.completeness, 'all');
    assert.equal(cov.computed, undefined, '失っていない run が失ったと述べている');
  });

  test('#R763 ⑫ 「なぜ all ではないか」の語彙は 1 つで、新しい理由もそこに在る', async () => {
    const { sources } = await boot();
    assert.ok(sources.coverageReasons().indexOf('op-rows-not-computed') >= 0,
      'js/gis-ops.js が、js/gis-sources.js の持たない理由を書いている（2 つ目の語彙）');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · rasterize burns what it passes through   (was tests/r756-gis-rasterize-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R756 · 格子に焼くとき、その形が通っていない場所を塗っていないか
 * ----------------------------------------------------------------------------
 *  An outside review read R752 and said `rasterize` fills a feature's bounding box for anything that
 *  is not an area. It does — `coveredBy()` answered `true` for Point, MultiPoint, LineString and
 *  MultiLineString, and the walk that used it visited every cell of the bounding box.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「線は Amanatides–Woo で走る」 is a sentence about an
 *  implementation, and it would pass over a walk that traverses the right cells of the wrong line.
 *  What is measured is what the reader LOSES: a grid made from roads or rivers says there is a road
 *  in places no road passes, and every analysis downstream of that grid inherits it.
 *
 *  The references here are derived from nothing in js/gis-ops.js: a cell set obtained by sampling
 *  the geometry densely and keeping the cells the samples fall in. That set cannot contain a cell
 *  the geometry does not enter, which is the whole claim.
 * ==========================================================================*/
describe('§ #R756 · rasterize burns what it passes through', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisRaster = makeGisRaster();
    await geometry.ready();
    return { w, data, ops, raster: w.IntMapGisRaster };
  }

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });

  /* The lattice every case below uses. 16 × 16 over a 16° × 16° box, so one cell is exactly one
     degree and the reference arithmetic is readable by hand. */
  const BOX = { w: 0, s: 0, e: 16, n: 16 };
  const N = 16;
  const bboxParam = BOX.w + ',' + BOX.s + ',' + BOX.e + ',' + BOX.n;

  async function burn(ops, data, geom) {
    const ds = data.add({ title: 'r754', features: [feat(geom, { v: 1 })] });
    const res = await ops.run({
      op: 'rasterize', inputs: [ds.id],
      params: { width: N, height: N, stat: 'count', bbox: bboxParam },
    });
    assert.equal(res.ok, true, 'rasterize refused: ' + JSON.stringify(res.why || res));
    return res.dataset;
  }

  /* How many cells actually carry a value. The op reports `cells` as the size of the lattice, so the
     count that matters is read off the band itself. */
  function painted(raster) {
    const px = raster.read(0);
    let n = 0;
    for (let i = 0; i < px.length; i++) if (px[i] === px[i] && px[i] !== 0) n++;
    return n;
  }

  function cellKey(lng, lat) {
    const c = Math.min(N - 1, Math.max(0, Math.floor((lng - BOX.w) / ((BOX.e - BOX.w) / N))));
    const r = Math.min(N - 1, Math.max(0, Math.floor((BOX.n - lat) / ((BOX.n - BOX.s) / N))));
    return r * N + c;
  }

  /* The reference: the cells a densely sampled walk along the geometry falls into. Independent of
     js/gis-ops.js — it knows only the coordinates and the lattice. */
  function sampledCells(coords, steps) {
    const set = new Set();
    for (let i = 0; i + 1 < coords.length; i++) {
      const a = coords[i], b = coords[i + 1];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        set.add(cellKey(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
      }
    }
    return set;
  }

  function paintedCells(raster) {
    const px = raster.read(0);
    const set = new Set();
    for (let i = 0; i < px.length; i++) if (px[i] === px[i] && px[i] !== 0) set.add(i);
    return set;
  }

  /* ══ ① 線 1 本は、その線が通った画素だけを塗る ═══════════════════════════════════════════ */

  test('R756 ① a single line burns the cells it passes through, not its bounding box', async () => {
    const { data, ops } = await boot();
    /* A diagonal across the lattice. ⚠ THE SLOPE IS NOT ±1 ON PURPOSE: a line of slope exactly -1
       through this lattice passes through cell CORNERS, where 「その画素を通るか」 has no answer that
       is not a tie-break — a fixture that asks an undefined question measures the tie-break, not the
       traversal. This one crosses cell interiors the whole way. */
    const line = [[0.3, 0.7], [15.7, 14.2]];
    const res = await burn(ops, data, { type: 'LineString', coordinates: line });

    const got = paintedCells(res);
    /* ⚠ THE DEFECT: this was 256 — every cell of the bounding box, which here is the whole lattice. */
    assert.ok(got.size < N * N,
      'the diagonal painted the whole lattice (' + got.size + ' of ' + (N * N) + ') — the bounding box, not the line');

    const ref = sampledCells(line, 20000);
    for (const cell of got) {
      assert.ok(ref.has(cell),
        'cell ' + cell + ' was burned but no point of the line falls in it (row ' + Math.floor(cell / N) + ', col ' + (cell % N) + ')');
    }
    for (const cell of ref) {
      assert.ok(got.has(cell), 'the line passes through cell ' + cell + ' and it was not burned');
    }
    assert.ok(got.size >= N, 'a corner-to-corner diagonal crosses at least ' + N + ' cells, got ' + got.size);
  });

  /* ══ ② 離れた 2 点は、2 つの画素だけを塗る ══════════════════════════════════════════════ */

  test('R756 ② a MultiPoint burns one cell per point, not the box that contains them', async () => {
    const { data, ops } = await boot();
    const pts = [[1.5, 1.5], [14.5, 14.5]];
    const res = await burn(ops, data, { type: 'MultiPoint', coordinates: pts });

    const got = paintedCells(res);
    /* ⚠ THE DEFECT: this was 256. */
    assert.equal(got.size, 2, 'two points burned ' + got.size + ' cells');
    for (const p of pts) assert.ok(got.has(cellKey(p[0], p[1])), 'the cell holding ' + JSON.stringify(p) + ' was not burned');
  });

  /* ══ ③ 端の座標は、格子の外ではなく最後の画素に属する ═════════════════════════════════ */

  test('R756 ③ a point on the eastern or northern edge lands in the last cell, not nowhere', async () => {
    const { data, ops } = await boot();
    /* The extent defaults to the data's own, so the extreme coordinates sit exactly on the edge —
       the common case, not an edge case. */
    const res = await burn(ops, data, { type: 'MultiPoint', coordinates: [[BOX.e, BOX.n], [BOX.w, BOX.s]] });
    const got = paintedCells(res);
    assert.equal(got.size, 2, 'the corner points burned ' + got.size + ' cells');
    assert.ok(got.has(N - 1), 'the north-east corner point did not land in the last cell of the first row');
    assert.ok(got.has((N - 1) * N), 'the south-west corner point did not land in the first cell of the last row');
  });

  /* ══ ④ 面は今までどおり画素の中心で決まる（rasterize→zonal の往復が食い違わないこと） ═══ */

  test('R756 ④ an area still burns by the pixel centre, unchanged', async () => {
    const { data, ops } = await boot();
    /* Exactly the four cells whose centres lie inside: 4°–8° in both axes covers centres 4.5 … 7.5. */
    const ring = [[4, 4], [8, 4], [8, 8], [4, 8], [4, 4]];
    const res = await burn(ops, data, { type: 'Polygon', coordinates: [ring] });
    assert.equal(painted(res), 16, 'the 4° × 4° square should cover 16 one-degree cell centres');
  });

  /* ══ ⑤ 述語が 1 つで 3 つの次元に答える形が戻っていないこと ═════════════════════════════ */

  test('R756 ⑤ no single predicate answers 「is this cell covered」 for every dimension', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（次元ごとの答えは ①〜④ が評価で測る）。 */
    const src = read('js/gis-ops.js');
    /* ⚠ THE DEFECT WAS NOT A MISSING BRANCH — it was one predicate being asked a question that has a
       different meaning per dimension, so the two it could not answer got `true`. A returned-true
       default under a Polygon test is that shape whatever it is called. */
    const shape = /(Polygon'\s*\|\|[^\n]*MultiPolygon')[\s\S]{0,200}?\n\s*return true;/;
    assert.equal(shape.test(src), false,
      'a predicate still falls through to `return true` after testing only for polygons — ' +
      'that is the shape that painted bounding boxes (#R756)');
    assert.ok(/function burnGeometry\(/.test(src), 'the dimension-aware burn is gone');
    assert.ok(/function burnLine\(/.test(src) && /function burnPoint\(/.test(src) && /function burnArea\(/.test(src),
      'one of the three dimensions no longer has its own rule');
  });

  ISOLATED.built();
});
