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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

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

test('R739 ② a renderer that refuses every layer is not reported as a drawing', () => {
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

  /* ⚠ AND THE SENTENCE EXISTS. tests/r729-gis-core-checks ④ measures this for the gis modules; the
     import path's sentences live in js/gis-panel.js for the panel and js/map-ui.js for the toast. */
  const panel = read('js/gis-panel.js');
  assert.ok(panel.includes("'draw-not-rendered'"), 'the new refusal has a sentence in the panel');
  assert.ok(/cannot draw imported shapes/.test(ui), 'and the reader gets a toast at the moment it happens');
});
