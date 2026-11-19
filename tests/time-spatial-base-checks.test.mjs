/* ============================================================================
 *  time-spatial-base — 複数ベクタ演算の有効時刻、有効時刻と記録時刻の分離、政体識別子による結合
 * ----------------------------------------------------------------------------
 *  ① intersect: 出力の有効期間は両入力の期間の重なり。重ならなければ期間を述べず `disjoint` と記録する
 *  ② union: 出力は 2 つを括る期間で、間に隙間があれば `contiguous:false`
 *  ③ 述べていない入力が 1 つでもあれば期間は述べない（未知は未知のまま）。入力の期間は recipe に残る
 *  ④ 有効時刻（`time`）と記録時刻（`provenance.recordedAt`）は別の欄で、前者に後者が入らない
 *  ⑤ 1 入力しか形を出さない op（filter / clip）は従来どおり第 1 入力の期間
 *  ⑥ 政体の識別子（`polityKey`）で結び、綴りでは結ばない: 同じ gw の改称は「続いている」、
 *     綴りだけ同じで識別子が違う行は結ばない
 *  ⚠ 期待値は本ファイルに手で書いた年月日から導いた。op の補助関数には訊かない。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/geo-shared.mjs';

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisUnits = makeGisUnits();
  await geometry.ready();
  return { data, ops };
}
const ring = (W, S, E, N) => [[W, S], [E, S], [E, N], [W, N], [W, S]];
const box = (W, S, E, N, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [ring(W, S, E, N)] } });
const day = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(0, 0, 0, 0); return t.getTime(); };
const span = (a, b) => ({ kind: 'constant', start: a, end: b });
async function pair(B, ta, tb) {
  const a = B.data.add({ title: 'a', features: [box(0, 0, 4, 4, { n: 'a' })], time: ta });
  const b = B.data.add({ title: 'b', features: [box(2, 2, 6, 6, { n: 'b' })], time: tb });
  return [a, b];
}
const run = async (B, op, ins) => { const r = await B.ops.run({ op, inputs: ins.map((d) => d.id) }); assert.equal(r.ok, true, op + ' refused: ' + r.why); return r.dataset; };

test('① intersect: the period is the overlap of the two periods', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1914-07-28', '1918-11-11'), span('1900-01-01', '1916-12-31'));
  const o = await run(B, 'intersect', [a, b]);
  assert.equal(o.time.kind, 'constant');
  assert.equal(o.time.start, day(1914, 7, 28), 'starts when the LATER input starts');
  assert.ok(o.time.end >= day(1916, 12, 31) && o.time.end < day(1917, 1, 2), 'ends when the EARLIER input ends');
  assert.equal(o.provenance.timeRule.rule, 'intersection');
  assert.equal(o.provenance.timeRule.result, 'span');
  assert.equal(o.provenance.inputTimes.length, 2, 'each input\'s own period stays in the recipe');
});

test('① intersect of periods that never overlap states no period and says why', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1800-01-01', '1810-12-31'), span('1914-01-01', '1918-12-31'));
  const o = await run(B, 'intersect', [a, b]);
  assert.equal(o.time, null);
  assert.equal(o.provenance.timeRule.result, 'disjoint');
});

test('② union: the bracket, and a gap is declared rather than hidden', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1800-01-01', '1810-12-31'), span('1914-01-01', '1918-12-31'));
  const o = await run(B, 'union', [a, b]);
  assert.equal(o.time.start, day(1800, 1, 1));
  assert.ok(o.time.end >= day(1918, 12, 31));
  assert.equal(o.provenance.timeRule.contiguous, false);
  const [c, d] = await pair(B, span('1900-01-01', '1910-12-31'), span('1905-01-01', '1918-12-31'));
  const u = await run(B, 'union', [c, d]);
  assert.equal(u.provenance.timeRule.contiguous, true);
});

test('③ an input that never said when makes the result say nothing (and the recipe says who was silent)', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1914-01-01', '1918-12-31'), null);
  const o = await run(B, 'intersect', [a, b]);
  assert.equal(o.time, null);
  assert.equal(o.provenance.timeRule.result, 'unknown');
  assert.equal(o.provenance.inputTimes[1].time, null);
});

test('④ valid time and recording time are different fields', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1914-01-01', '1918-12-31'), span('1914-01-01', '1918-12-31'));
  const before = Date.now();
  const o = await run(B, 'intersect', [a, b]);
  const rec = Date.parse(o.provenance.recordedAt);
  assert.ok(rec >= before - 1000 && rec <= Date.now() + 1000, 'recordedAt is when the run happened');
  assert.ok(o.time.start < before - 1e11, 'the valid period is 1914, not the moment of the run');
  assert.ok(!('recordedAt' in o.time));
});

test('⑤ ops that take only one input\'s shape keep that input\'s period', async () => {
  const B = await boot();
  const [a, b] = await pair(B, span('1914-01-01', '1918-12-31'), span('1900-01-01', '1901-12-31'));
  const o = await run(B, 'clip', [a, b]);
  assert.equal(o.time.start, day(1914, 1, 1));
  assert.equal(o.provenance.timeRule, undefined);
});

/* ══ ⑥ 政体の識別子 ═════════════════════════════════════════════════════════════════════════════ */
test('⑥ polityKey: the record\'s identifiers, tagged with their registry; a name is never an identifier', async () => {
  const { polityKey } = await import('../js/year-book.js');
  assert.equal(polityKey({ _gw: 501, NAME: 'Kenya' }), 'gw:501');
  assert.equal(polityKey({ _qid: 'Q183' }), 'wd:Q183');
  assert.equal(polityKey({ _gw: 255, _qid: 'Q183' }), 'gw:255', 'the day-exact record\'s code wins');
  assert.equal(polityKey({ NAME: 'Kenya' }), null, 'a piece that states no identifier has none — it is not given one made of its name');
  assert.equal(polityKey({ _qid: 'not-a-qid' }), null);
  assert.equal(polityKey(null), null);
});

test('⑥ diffPolities links by identifier: a rename is one polity, two polities with one spelling are two', async () => {
  const { diffPolities, followPolities } = await import('../js/atlas-reasoning.js');
  const A = [{ en: 'British East Africa', name: 'BEA', km2: 100, key: 'gw:501' }, { en: 'Georgia', name: 'Georgia', km2: 50, key: 'gw:372' }, { en: 'Spelt', name: 'Spelt', km2: 5, key: null }];
  const B = [{ en: 'Kenya', name: 'Kenya', km2: 110, key: 'gw:501' }, { en: 'Georgia', name: 'Georgia', km2: 70, key: 'wd:Q230' }, { en: 'Spelt', name: 'Spelt', km2: 5, key: null }];
  const d = diffPolities(A, B, null);
  assert.deepEqual(d.renamed.map((r) => [r.from, r.to]), [['British East Africa', 'Kenya']]);
  assert.ok(!d.appeared.some((x) => x.en === 'Kenya') && !d.gone.some((x) => x.en === 'British East Africa'), 'a renamed polity neither ends nor begins');
  assert.ok(d.appeared.some((x) => x.en === 'Georgia') && d.gone.some((x) => x.en === 'Georgia'), 'same spelling, different identifier: NOT linked');
  assert.deepEqual(d.matchedByName, ['Spelt'], 'a link made on a spelling is listed as such');
  /* rows that carry no identifier behave exactly as they did: linked by English name */
  const o = diffPolities([{ en: 'X', name: 'X', km2: 1 }], [{ en: 'X', name: 'X', km2: 2 }], null);
  assert.equal(o.reshaped.length, 1);
  /* followed across eras */
  const f = followPolities([{ year: 1900, rows: [{ en: 'German Empire', key: 'gw:255', km2: 5 }, { en: 'Loose', key: null, km2: 1 }] }, { year: 1925, rows: [{ en: 'Weimar Republic', key: 'gw:255', km2: 4 }] }]);
  assert.deepEqual(f.get('gw:255').names.map((n) => n.en), ['German Empire', 'Weimar Republic']);
  assert.equal(f.unkeyed[1900], 1, 'an unkeyed row is counted, never followed by name');
});
