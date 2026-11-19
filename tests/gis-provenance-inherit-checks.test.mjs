/* ============================================================================
 *  GIS · 演算の出力は、入力の出典・条件・取得時刻・対象時点を引き継ぐ
 * ----------------------------------------------------------------------------
 *  欠陥（総合技術評価 2026-11-19）: js/gis-ops.js は coverage だけを入力から運び、licence / creditRequired /
 *  publisher / retrievedAt / asOf は 1 つも運ばなかった。CC BY の入力から作った buffer は何も主張せず、
 *  export は「ライセンスの記載が無い」と述べた——入力の義務が演算 1 回で黙って消えた。
 *  守ること:
 *    ① 入力の rights が、演算出力の provenance.upstreams に入力ごとの行として残る（取得時刻・対象時点つき）
 *    ② 入力が黙っていれば、その入力は {input} だけの行になる——read() の「厳しい義務が残り、沈黙は
 *       不要にならない」が束全体の答えを決める（沈黙を許諾に畳まない）
 *    ③ 演算を重ねても落ちない（演算出力を入力にした演算が、上流を平らに引き継ぐ）
 *    ④ export は、全入力が述べたときだけ license を書く。credit の文は述べた分を全部書く
 *  ⚠ 述べていない入力しか無い出力に、licence は生えない（導出であって新しい主張ではない）。
 * ==========================================================================*/
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow, isolate, read } from './helpers/geo-shared.mjs';

describe('GIS provenance inheritance', () => {
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
    const { makeGisExport } = await import('../js/gis-export.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisRaster = makeGisRaster(); w.IntMapGisWarp = makeGisWarp(); w.IntMapGisCrs = makeGisCrs();
    w.IntMapGisSources = makeGisSources();
    await geometry.ready();
    return { data, ops, EX: makeGisExport() };
  }
  const pt = (x, y, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [x, y] } });
  const box = (w, s, e, n) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
  const CCBY = { publisher: 'Acme Survey', url: 'https://acme.example/data', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, paidBy: 'Acme row' };
  const layerProv = (layer, rights, extra) => ({ kind: 'layer', layer, at: Date.parse('2026-11-01T00:00:00Z'), statedTime: '2020', ...(rights ? { rights } : {}), ...extra });

  test('① 入力の出典・条件・取得時刻・対象時点が、出力に入力ごとの行で残る', async () => {
    const { data, ops } = await boot();
    const a = data.add({ title: 'a', features: [pt(1, 1)], provenance: layerProv('acme', CCBY) });
    const r = await ops.run({ op: 'buffer', inputs: [a.id], params: { radiusKm: 1 } });
    assert.equal(r.ok, true, r.why);
    const up = r.dataset.provenance.upstreams;
    assert.ok(Array.isArray(up) && up.length === 1, '出力が上流を述べていない');
    assert.equal(up[0].input, a.id);
    assert.equal(up[0].licence, 'CC BY 4.0');
    assert.equal(up[0].publisher, 'Acme Survey');
    assert.equal(up[0].attribution, true, '表示が条件であることが落ちた');
    assert.equal(up[0].retrievedAt, '2026-11-01T00:00:00.000Z', '取得時刻が落ちた');
    assert.equal(up[0].asOf, '2020', '対象時点が落ちた');
  });

  test('② 黙った入力は {input} だけの行になり、束の creditRequired は false にならない', async () => {
    const { data, ops } = await boot();
    const { read: readGov } = await import('../js/data-governance.js');
    const a = data.add({ title: 'a', features: [box(0, 0, 10, 10)], provenance: layerProv('acme', { ...CCBY, attribution: false }) });
    const b = data.add({ title: 'b', features: [pt(1, 1)] });   /* 取り込んだファイル: 何も述べていない */
    const r = await ops.run({ op: 'clip', inputs: [b.id, a.id] });
    assert.equal(r.ok, true, r.why);
    const up = r.dataset.provenance.upstreams;
    assert.equal(up.length, 2);
    assert.deepEqual(Object.keys(up.find((u) => u.input === b.id)), ['input'], '黙った入力に、書かれていない欄が生えた');
    assert.equal(readGov(r.dataset.provenance).creditRequired, null,
      '一方が不要と述べ、他方が黙っているのに「不要」と畳まれた（沈黙は許諾ではない）');
  });

  test('③ 演算を重ねても上流は落ちず、平らに引き継がれる', async () => {
    const { data, ops } = await boot();
    const a = data.add({ title: 'a', features: [pt(1, 1)], provenance: layerProv('acme', CCBY) });
    const r1 = await ops.run({ op: 'buffer', inputs: [a.id], params: { radiusKm: 1 } });
    const r2 = await ops.run({ op: 'buffer', inputs: [r1.dataset.id], params: { radiusKm: 0.5 } });
    assert.equal(r2.ok, true, r2.why);
    const up = r2.dataset.provenance.upstreams;
    assert.equal(up.length, 1);
    assert.equal(up[0].input, a.id, '2 段目が 1 段目の出力を上流として名指し、元の入力を失った');
    assert.equal(up[0].licence, 'CC BY 4.0');
  });

  test('④ export: 全入力が述べたときだけ license を書き、述べない入力しか無い出力に licence は生えない', async () => {
    const { data, ops, EX } = await boot();
    const a = data.add({ title: 'a', features: [pt(1, 1)], provenance: layerProv('acme', CCBY, { rights: { ...CCBY, credit: 'Data © Acme Survey' } }) });
    const full = await ops.run({ op: 'buffer', inputs: [a.id], params: { radiusKm: 1 } });
    const out = JSON.parse(EX.write(full.dataset.id, { format: 'geojson' }).text);
    assert.equal(out.license, 'CC BY 4.0');
    assert.equal(out.attribution, 'Data © Acme Survey');

    const mute = data.add({ title: 'm', features: [pt(2, 2)] });
    const mixed = await ops.run({ op: 'nearestJoin', inputs: [a.id, mute.id], params: {} }).catch(() => null);
    const only = await ops.run({ op: 'buffer', inputs: [mute.id], params: { radiusKm: 1 } });
    const o2 = JSON.parse(EX.write(only.dataset.id, { format: 'geojson' }).text);
    assert.equal('license' in o2, false, '何も述べない入力から licence が生えた');
    assert.equal('attribution' in o2, false);
    if (mixed && mixed.ok) {
      const o3 = JSON.parse(EX.write(mixed.dataset.id, { format: 'geojson' }).text);
      assert.equal('license' in o3, false, '黙った入力があるのに、残りの条件が束全体の条件として書かれた');
      assert.equal(o3.attribution, 'Data © Acme Survey', '述べた入力の表示義務が、黙った入力のせいで消えた');
    }
  });

  test('⑤ 取得（layer）は、登録が述べた rights をそのまま provenance に運ぶ', () => {
    const src = read('js/gis-layers.js');
    assert.ok(/provenance\.rights = rt/.test(src) && (src.match(/layerRights\(/g) || []).length >= 3,
      'js/gis-layers.js の 2 つの取得経路（vector・raster）のどちらかが rights を運んでいない');
  });
});
