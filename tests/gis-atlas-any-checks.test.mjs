/* ============================================================================
 *  #R819 · `'any'` の枠は、要求そのものにどちらの扉かを訊く
 * ----------------------------------------------------------------------------
 *  js/gis-atlas.js resolveRef() decided the door with `decl.kinds[slot] === 'raster'` and nothing
 *  else. That is correct for every slot that DECLARES a kind — and it means a slot declared `'any'`
 *  (#R819's `profile` / `reach`, which put the same question to features and to a grid) could only
 *  ever be fetched through the FEATURE door when the reference was a layer of the map. The grid half
 *  of two new ops was unreachable from Atlas, and the refusal that came back named a window field
 *  (`acquire-unknown-field`) rather than the door, so the planner could not see what had happened.
 *
 *  ⚠ WHAT THIS FILE MEASURES IS THAT THERE IS ONE RULE, NOT TWO. acquireOnly() already read the
 *  request for exactly this ('kind', else a stated resolution). The fix asks that judgement rather
 *  than writing a second copy of it, so ⑤ holds the two answers against each other on the same
 *  request — [[intmap-two-readers-one-field-list]] is what a second copy becomes.
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

let _realLayers = null;
async function realLayers() {
  if (!_realLayers) {
    const { makeGisLayers } = await import('../js/gis-layers.js');
    _realLayers = makeGisLayers({ map: null });
  }
  return _realLayers;
}

/* The map is a stub that RECORDS WHICH DOOR IT WAS ASKED — that is the whole measurement. ⚠ The
   acquisition vocabulary is asked for from the module that owns it, never retyped here: a copy in
   this file would let a field added to js/gis-layers.js pass unseen (#R763 measured that). */
function stubLayers(rows, fields) {
  const asked = [];
  return {
    asked,
    acquireFields: (kind) => fields(kind),
    sources: () => rows.map((r) => ({ id: r.id, label: r.label, geometryType: r.geometryType || 'Point', count: (r.features || []).length })),
    canSample: (id) => !!(rows.find((r) => r.id === id) || {}).samplable,
    toDataset: (id, o) => {
      asked.push({ id, opts: o, door: 'vector' });
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, why: 'layer-unknown', detail: { id: id } };
      return { ok: true, dataset: globalThis.window.IntMapData.add({ title: row.label, features: row.features }) };
    },
    toRaster: async (id, o) => { asked.push({ id, opts: o, door: 'raster' }); return { ok: false, why: 'layer-not-sampling' }; },
  };
}

async function boot(layerRows) {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisRaster = makeGisRaster();
  await geometry.ready();
  const L = await realLayers();
  const layers = stubLayers(layerRows || [], (kind) => L.acquireFields(kind));
  w.IntMapGisLayers = layers;
  const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true }) });
  return { w, data, ops, atlas, layers };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

/* One session: a samplable layer of the map, and zones the reader already holds. */
async function session() {
  const b = await boot([{ id: 'elev', label: 'Elevation', samplable: true, features: [] }]);
  b.data.add({ title: 'Zones', features: [poly([box(0, 0, 1, 1)], { n: 'z' })] });
  return b;
}
const doors = (layers) => layers.asked.map((a) => a.door);

/* ══ ① そもそも `'any'` の枠は宣言に在る ═══════════════════════════════════════════════ */

test('R819 ① profile と reach は入力 1 の種別を any と宣言している', async () => {
  const { ops } = await session();
  for (const id of ['profile', 'reach']) {
    const d = ops.ops().find((x) => x.id === id);
    assert.ok(d, id + ' が宣言されていない');
    assert.equal(d.kinds[1], 'any', id + ' の入力 1 が any ではない — この file が測る枠が無い');
  }
});

/* ══ ② 解像度を述べた要求は、格子の扉である ═══════════════════════════════════════════ */

test('R819 ② any の枠にレイヤーと窓を渡すと、格子の扉が開く', async () => {
  const { atlas, layers } = await session();
  const r = await atlas.run({
    op: 'profile', inputs: ['Zones', 'layer:elev'], params: {},
    acquire: { bounds: [0, 0, 1, 1], width: 4, height: 4 },
  });
  /* 扉の向こうが答えられなかったのは stub の事実で、この検査のものではない。 */
  assert.deepEqual(doors(layers), ['raster'], '窓を述べた要求が地物として取得された: ' + JSON.stringify(layers.asked));
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-not-sampling');
  /* ⚠ 退行の形そのもの: 直る前は、幅が「地物の取得には無い欄」として断られていた。 */
  assert.notEqual(r.why, 'acquire-unknown-field');
});

test('R819 ② kind を述べた要求も、#R743 の sample 綴りも同じ扉へ着く', async () => {
  const a = await session();
  await a.atlas.run({ op: 'profile', inputs: ['Zones', 'layer:elev'], params: {}, kind: 'raster', acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
  assert.deepEqual(doors(a.layers), ['raster']);

  const b = await session();
  await b.atlas.run({ op: 'reach', inputs: ['Zones', 'layer:elev'], params: {}, sample: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
  assert.deepEqual(doors(b.layers), ['raster'], 'reach の any の枠が sample を読まなかった');
});

/* ══ ③ 何も述べない要求は、今日までどおり地物である ═══════════════════════════════════ */

test('R819 ③ 窓を述べない any の枠は地物の扉 — 既定は動いていない', async () => {
  const { atlas, layers } = await session();
  await atlas.run({ op: 'profile', inputs: ['Zones', 'layer:elev'], params: {} });
  assert.deepEqual(doors(layers), ['vector'], '何も述べていない要求が格子として焼かれた');
});

test('R819 ③ 種別を宣言している枠は、要求に何が書かれていても動かない', async () => {
  /* raster と宣言された枠は格子のまま。 */
  const a = await session();
  await a.atlas.run({ op: 'zonal', inputs: ['Zones', 'layer:elev'], params: { stat: 'mean' }, kind: 'vector', acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
  assert.deepEqual(doors(a.layers), ['raster'], 'raster の枠が要求の kind に従ってしまった');

  /* vector と宣言された枠は地物のまま——窓を述べても、格子にはならない。 */
  const b = await session();
  const r = await b.atlas.run({ op: 'buffer', inputs: ['layer:elev'], params: { radiusKm: 1 }, acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'acquire-unknown-field', 'vector の枠の語彙が変わっている: ' + r.why);
  assert.equal(r.detail.field, 'width');
  assert.deepEqual(doors(b.layers), [], '断るべき要求が扉まで届いた');
});

/* ══ ④ 読めない kind は、扉を黙って選ばずに名指して断る ═══════════════════════════════ */

test('R819 ④ any の枠に読めない kind を渡すと、語彙つきで断られる', async () => {
  const { atlas, layers } = await session();
  const r = await atlas.run({ op: 'profile', inputs: ['Zones', 'layer:elev'], params: {}, kind: 'grid' });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'bad-param');
  assert.equal(r.detail.param, 'kind');
  assert.deepEqual(r.detail.kinds, ['vector', 'raster'], '拒否が語彙を運んでいない');
  assert.deepEqual(doors(layers), [], '読めない kind のまま扉が開いた');
});

/* ══ ⑤ 判断は 1 つ — 取得の段と、op の枠が同じ要求に同じ答えを返す ═══════════════════ */

test('R819 ⑤ acquire の段と any の枠は、同じ要求について一致する', async () => {
  const REQUESTS = [
    { inputs: ['layer:elev'] },
    { inputs: ['layer:elev'], acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } },
    { inputs: ['layer:elev'], acquire: { bounds: [0, 0, 1, 1] } },
    { inputs: ['layer:elev'], kind: 'raster', acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } },
    { inputs: ['layer:elev'], kind: 'vector', acquire: { bounds: [0, 0, 1, 1], width: 2, height: 2 } },
    { inputs: ['layer:elev'], sample: { bounds: [0, 0, 1, 1], width: 2, height: 2 } },
  ];
  for (const req of REQUESTS) {
    /* 取得の段: `op` の無い呼び出し。 */
    const a = await session();
    await a.atlas.run(Object.assign({}, req));
    /* op の段: 同じ要求を `profile` の any の枠へ。⚠ 枠 0 は登録済みなので扉は 1 回しか開かない。 */
    const b = await session();
    await b.atlas.run(Object.assign({ op: 'profile', inputs: ['Zones', 'layer:elev'], params: {} }, req, { inputs: ['Zones', 'layer:elev'] }));
    assert.deepEqual(doors(b.layers), doors(a.layers),
      '同じ要求に 2 つの答え — 判断の写しが出来ている: ' + JSON.stringify(req));
  }
});

/* ⚠ そして、その規則は 1 か所にしか書かれていない。2 つ目の写しが出来た日にここが赤くなる。 */
test('R819 ⑤ 扉を決める規則は js/gis-atlas.js に 1 つだけ書かれている', async () => {
  const src = read('js/gis-atlas.js');
  const copies = src.match(/win\.width != null \|\| win\.height != null/g) || [];
  assert.equal(copies.length, 1, '扉を決める判断が ' + copies.length + ' か所にある');
});
