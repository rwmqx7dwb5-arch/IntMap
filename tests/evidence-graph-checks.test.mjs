/* ============================================================================
 *  IntMap · evidence-graph — 元データ → GIS 演算 → Atlas 回答の数値 を、1 本の鎖として辿れる
 * ----------------------------------------------------------------------------
 *  ① グラフ核: 派生は入力の版を固定して持ち、同じ導出は同じ節（冪等）、宙に浮いた入力は拒む
 *  ② 更新: 入力が動くと影響先（鎖の先まで）が分かり、動かす前に wouldStale で調べられる
 *  ③ GIS: 実際の dataset レジストリの演算出力（provenance.inputs）が元データへ遡れる
 *  ④ 回答: 数値は GIS 節（graphRef）経由で元データまで遡れる。記録に無い数値は ai_inference、
 *     何も引かない数値は uncited として数えられ、モデルの書いた id/URL は節を作らない
 *  ⑤ snapshot/restore で往復し、別の版は拒む
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeEvidenceGraph, fingerprint } from '../js/evidence-graph.js';
import { bindGis, recordAnswer } from '../js/evidence-graph-record.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { makeAtlasEvidence } from '../js/atlas-evidence.js';

const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });

test('① derived pins input versions; same derivation is one node; dangling input refused', () => {
  const g = makeEvidenceGraph();
  const a = g.putSource({ type: 'dataset', key: 'layer:rail', version: 'v1' });
  const d1 = g.putDerived({ type: 'gis_op', inputs: [a.id], calc: { op: 'buffer', opVersion: 'ops-13', params: { km: 5 } }, output: { count: 3 } });
  const d2 = g.putDerived({ type: 'gis_op', inputs: [a.id], calc: { op: 'buffer', opVersion: 'ops-13', params: { km: 5 } }, output: { count: 3 } });
  assert.equal(d1.id, d2.id); assert.equal(d2.existed, true); assert.equal(g.size(), 2);
  assert.deepEqual(g.get(d1.id).inputs, [{ id: a.id, version: 'v1' }]);
  assert.equal(g.putDerived({ type: 'metric', inputs: ['src:dataset:nope'], calc: { op: 'x' } }).why, 'unknown-input');
  assert.equal(g.putDerived({ type: 'metric', inputs: [], calc: { op: 'x' } }).why, 'no-inputs');
  assert.equal(g.putSource({ type: 'dataset', key: 'k' }).version, 'unversioned');
  assert.equal(g.get('src:dataset:k').versions[0].basis, 'none');
});

test('② an update reaches the whole chain, and can be asked before it is made', () => {
  const g = makeEvidenceGraph();
  const s = g.putSource({ type: 'dataset', key: 'pop', version: '2020' });
  const o = g.putSource({ type: 'dataset', key: 'other', version: 'a' });
  const buf = g.putDerived({ type: 'gis_op', inputs: [s.id], calc: { op: 'join' }, output: { count: 1 } });
  const agg = g.putDerived({ type: 'gis_op', inputs: [buf.id, o.id], calc: { op: 'aggregate' }, output: { count: 1, value: 9 } });
  assert.deepEqual(g.impact(s.id).derived, [buf.id, agg.id]);
  assert.deepEqual(g.impact(o.id).derived, [agg.id]);
  assert.equal(g.staleness(agg.id), null);
  assert.deepEqual(new Set(g.wouldStale(s.id, '2025').derived), new Set([buf.id, agg.id]));
  assert.deepEqual(g.wouldStale(s.id, '2020').derived, []);
  const up = g.putSource({ type: 'dataset', key: 'pop', version: '2025' });
  assert.equal(up.changed, true); assert.equal(up.previous, '2020');
  assert.equal(g.staleness(buf.id).cause, 'input-version-changed');
  assert.equal(g.staleness(agg.id).cause, 'input-stale');       /* the second link, though its direct input is unchanged */
  assert.equal(g.staleness(s.id), null);
});

test('③ a real dataset registry: op output traces to the imported data', () => {
  const g = makeEvidenceGraph(), data = makeGisDatasets();
  const bind = bindGis(g, data, { opVersion: () => 'ops-13' });
  const a = data.add({ title: 'Stations', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })], provenance: { kind: 'layer', layer: 'rail', rights: { licence: 'ODbL' } } });
  const b = data.add({ title: 'Buffered', features: [pt(0, 0, { n: 1 })], provenance: { kind: 'op', op: 'buffer', inputs: [a.id], params: { radiusKm: 5 } } });
  const c = data.add({ title: 'Counted', features: [pt(0, 0, { n: 2 })], provenance: { kind: 'op', op: 'aggregate', inputs: [b.id], params: { stat: 'count' } } });
  const t = g.trace(bind.refOf(c.id));
  assert.deepEqual(t.steps.map((n) => (n.calc ? n.calc.op : n.key)), ['rail', 'buffer', 'aggregate']);
  assert.equal(t.sources.length, 1); assert.equal(t.sources[0].key, 'rail');
  assert.equal(g.get(bind.refOf(b.id)).calc.opVersion, 'ops-13');
  assert.deepEqual(bind.refused(), []);
  /* a record added BEFORE binding is picked up; replacing the layer's content is a new version of the same source */
  const g2 = makeEvidenceGraph(); const bind2 = bindGis(g2, data);
  assert.ok(bind2.refOf(c.id));
  data.add({ title: 'Stations', features: [pt(0, 0), pt(1, 1), pt(2, 2)], provenance: { kind: 'layer', layer: 'rail' } });
  assert.equal(g2.get('src:dataset:rail').versions.length, 2);
  assert.equal(g2.staleness(bind2.refOf(c.id)).cause, 'input-stale');   /* two links up from the replaced layer */
});

test('④ an answer number traces through the GIS chain; unbacked / uncited / unknown ids are told apart', () => {
  const g = makeEvidenceGraph(), data = makeGisDatasets();
  const bind = bindGis(g, data);
  const a = data.add({ title: 'Wards', features: [pt(0, 0)], provenance: { kind: 'layer', layer: 'wards' } });
  const b = data.add({ title: 'Count', features: [pt(0, 0, { n: 42 })], provenance: { kind: 'op', op: 'aggregate', inputs: [a.id], params: { stat: 'count' } } });
  const reg = makeAtlasEvidence().makeEvidenceRegistry({ callId: 'c1', retrievedAt: '2026-11-20' });
  /* the GIS result handed to the answer: its output.value is what a claim may be backed by */
  const node = g.get(bind.refOf(b.id));
  assert.equal(node.type, 'gis_op');
  const calc = reg.addAppData({ title: 'GIS: 区ごとの件数', graphRef: node.id, supportFacts: [{ concept: 'count', value: 42, unit: 'n' }] });
  const web = reg.addClientSources([{ url: 'https://example.org/report', title: 'Report', date: '2026-01-01', supportFacts: [{ concept: 'pop', value: 100, unit: 'n' }] }])[0];
  assert.equal(calc.graphRef, node.id);
  const claims = [
    { id: 'c1', metric: { value: 42, unit: 'n', concept: 'count' }, evidenceIds: [calc.id] },
    { id: 'c2', metric: { value: 100, unit: 'n', concept: 'pop' }, evidenceIds: [web.id] },
    { id: 'c3', metric: { value: 7, unit: 'n', concept: 'made up' }, evidenceIds: [web.id] },
    { id: 'c4', metric: { value: 5, unit: 'n' }, evidenceIds: [] },
    { id: 'c5', metric: { value: 6, unit: 'n' }, evidenceIds: ['e99'] },
    { id: 'c6', text: 'no figure' },
  ];
  const r = recordAnswer(g, { registry: reg, claims, callId: 'c1' });
  assert.equal(r.recorded.length, 3); assert.equal(r.inference, 1); assert.equal(r.uncited, 2); assert.equal(r.unresolved, 1);
  const num = g.get(r.recorded[0]);
  /* 42 is stated by the GIS node's own fact list, which graphRef routes through */
  assert.deepEqual(g.trace(num.id).sources.map((s) => s.key), ['wards']);
  assert.equal(g.get(r.recorded[2]).type, 'ai_inference');             /* 7 is in no cited record */
  assert.equal(g.get(r.recorded[1]).type, 'answer_number');
  assert.equal(g.get(r.recorded[1]).inputs[0].id.startsWith('src:web_document:'), true);
  /* recording the same answer again adds nothing */
  const before = g.size(); recordAnswer(g, { registry: reg, claims, callId: 'c1' }); assert.equal(g.size(), before);
  /* the layer changes → the answer number is reported as affected */
  assert.ok(g.impact('src:dataset:wards').derived.includes(num.id));
});

test('⑤ snapshot round-trips; a foreign version is refused', () => {
  const g = makeEvidenceGraph();
  const s = g.putSource({ type: 'dataset', key: 'k', version: '1' });
  const d = g.putDerived({ type: 'metric', inputs: [s.id], calc: { op: 'x' }, output: { value: 1 } });
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const h = makeEvidenceGraph();
  assert.equal(h.restore(snap).ok, true);
  assert.deepEqual(h.impact(s.id).derived, [d.id]);
  assert.equal(h.restore({ graphVersion: 99, nodes: [] }).why, 'bad-snapshot');
  assert.equal(fingerprint({ b: 1, a: 2 }), fingerprint({ a: 2, b: 1 }));
});
