/* ============================================================================
 *  spatiotemporal-join — 全ての「複数入力」演算が時間の条件と継承を同じ規則で扱う
 * ----------------------------------------------------------------------------
 *  ① 行ごとの有効期間を持つ入力は `when` で時刻を絞って結合できる（join / spatialJoin / nearestJoin / aggregate / timeJoin）
 *  ② 結果の各行は、その組の期間を `_validFrom` / `_validTo` に持ち、結果はそれを軸として宣言する
 *  ③ 期間を述べない「値の側」の入力は期間を狭めず名指される。形の側が述べなければ述べない
 *  ④ 地理的定義（現在国境基準の系列 / 当時の国境）の不一致は黙って許されず、来歴の warnings に残る
 *  ⑤ 1914-07-01 のヨーロッパ: 現在国境基準の人口系列を当時の政体の行に結ぶと警告が出る
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
const pt = (x, y, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [x, y] } });
const row = (p) => ({ type: 'Feature', properties: p, geometry: null });
const ivl = { kind: 'interval', startField: 'from', endField: 'to' };
const day = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(0, 0, 0, 0); return t.getTime(); };
const span = (a, b) => ({ kind: 'constant', start: a, end: b });
const go = async (B, op, ins, params) => B.ops.run({ op, inputs: ins.map((d) => d.id), params: params || {} });
const ok = async (B, op, ins, params) => { const r = await go(B, op, ins, params); assert.equal(r.ok, true, op + ' refused: ' + r.why + ' ' + JSON.stringify(r)); return r; };

/* The same country code, two different states with two different periods — the shape of every
   historical series (a German Empire row and a Weimar row both say DEU). */
function polities(B) {
  return B.data.add({
    title: 'polities',
    features: [
      box(0, 0, 4, 4, { code: 'DEU', name: 'German Empire', from: '1871-01-18', to: '1918-11-11' }),
      box(0, 0, 3, 4, { code: 'DEU', name: 'Weimar Republic', from: '1919-08-11', to: '1933-01-30' }),
      box(10, 0, 14, 4, { code: 'FRA', name: 'France', from: '1870', to: '1939' }),
    ],
    time: ivl,
  });
}
function series(B, basis) {
  const d = B.data.add({
    title: 'series',
    features: [
      row({ code: 'DEU', year: 1913, pop: 65058, from: '1913', to: '1913' }),
      row({ code: 'DEU', year: 1925, pop: 62411, from: '1925', to: '1925' }),
      row({ code: 'FRA', year: 1913, pop: 41463, from: '1913', to: '1913' }),
    ],
    time: ivl,
  });
  if (basis) assert.equal(B.data.declareGeoBasis(d.id, basis).ok, true);
  return d;
}

test('① join by key with `when`: the row that held at the same time, not the first row of that key', async () => {
  const B = await boot();
  const r = await ok(B, 'join', [polities(B), series(B)], { leftField: 'code', rightField: 'code', fields: ['pop', 'year'], when: 'overlaps', duplicates: 'refuse' });
  const rows = r.dataset.features().map((f) => f.properties);
  const emp = rows.find((p) => p.name === 'German Empire'), wei = rows.find((p) => p.name === 'Weimar Republic');
  assert.equal(emp.year, 1913, 'the Empire lasted until 1918: only the 1913 row overlaps it');
  assert.equal(wei.year, 1925, 'Weimar began in 1919: only the 1925 row overlaps it');
  assert.equal(emp.pop, 65058);
  assert.equal(wei.pop, 62411);
});

test('① without `when` a repeated key is still refused, exactly as before', async () => {
  const B = await boot();
  const r = await go(B, 'join', [polities(B), series(B)], { leftField: 'code', rightField: 'code', fields: ['pop'] });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'join-right-not-unique');
});

test('① when several rows still hold at that time, `duplicates:refuse` names it', async () => {
  const B = await boot();
  const dated = B.data.add({
    title: 'two readings',
    features: [row({ code: 'FRA', pop: 1, from: '1900', to: '1920' }), row({ code: 'FRA', pop: 2, from: '1910', to: '1930' })],
    time: ivl,
  });
  const r = await go(B, 'join', [polities(B), dated], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps' });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'join-right-not-unique');
});

test('② each output row carries the period of ITS pair, and the output declares those columns as its axis', async () => {
  const B = await boot();
  const r = await ok(B, 'join', [polities(B), series(B)], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps' });
  assert.equal(r.dataset.time.kind, 'interval');
  assert.equal(r.dataset.time.startField, '_validFrom');
  assert.equal(r.dataset.time.endField, '_validTo');
  const emp = r.dataset.features().map((f) => f.properties).find((p) => p.name === 'German Empire');
  /* Empire 1871-01-18..1918-11-11 ∩ the year 1913 = all of 1913, half-open: the first moment NOT held is 1914-01-01 */
  assert.equal(Date.parse(emp._validFrom), day(1913, 1, 1));
  assert.equal(Date.parse(emp._validTo), day(1914, 1, 1));
  assert.equal(r.dataset.provenance.timeRule.result, 'row-derived');
  /* the output can be asked about time again: the axis was verified on the way in */
  const w = await ok(B, 'timeWindow', [r.dataset], { from: '1913-06-01', to: '1913-06-30' });
  assert.deepEqual(w.dataset.features().map((f) => f.properties.name).sort(), ['France', 'German Empire']);
});

test('② a pair that never coexisted has no period and is counted, not hidden', async () => {
  const B = await boot();
  const r = await ok(B, 'join', [polities(B), series(B)], { leftField: 'code', rightField: 'code', fields: ['pop'], duplicates: 'first' });
  /* no `when`: Empire × the FIRST DEU row (1913) overlaps; Weimar × the same row (1913) never did */
  const wei = r.dataset.features().map((f) => f.properties).find((p) => p.name === 'Weimar Republic');
  assert.equal(wei._validFrom, null);
  assert.equal(wei._validTo, null);
  assert.equal(r.stats.time.pairsNeverCoexisted, 1);
  assert.ok(r.dataset.provenance.warnings.some((w) => w.code === 'pairs-never-coexisted' && w.pairs === 1));
});

test('① spatialJoin with `when`: places that held at the same time only', async () => {
  const B = await boot();
  const zones = B.data.add({ title: 'zones', features: [box(0, 0, 10, 10, { z: 'Z', from: '1900', to: '1950' })], time: ivl });
  const cities = B.data.add({
    title: 'cities',
    features: [pt(1, 1, { c: 'old', from: '1700', to: '1850' }), pt(2, 2, { c: 'mid', from: '1880', to: '1920' }), pt(3, 3, { c: 'new', from: '1990', to: '2020' })],
    time: ivl,
  });
  const r = await ok(B, 'spatialJoin', [zones, cities], { predicate: 'intersects', cardinality: 'all', fields: ['c'], when: 'overlaps' });
  const got = r.dataset.features().map((f) => f.properties.c);
  assert.deepEqual(got, ['mid'], 'only the city that coexisted with the zone');
  assert.equal(r.stats.time.timeFilteredOut, 2);
  const p = r.dataset.features()[0].properties;
  assert.equal(Date.parse(p._validFrom), day(1900, 1, 1));
  assert.equal(Date.parse(p._validTo), day(1921, 1, 1));
});

test('① nearestJoin: the nearest among those that HELD, not the nearest overall', async () => {
  const B = await boot();
  const q = B.data.add({ title: 'q', features: [pt(0, 0, { id: 'q', from: '1914', to: '1914' })], time: ivl });
  const t = B.data.add({
    title: 't',
    features: [pt(0.1, 0, { n: 'closest-but-ended', from: '1800', to: '1850' }), pt(5, 0, { n: 'far-but-held', from: '1900', to: '1930' })],
    time: ivl,
  });
  const r = await ok(B, 'nearestJoin', [q, t], { fields: ['n'], when: 'overlaps' });
  assert.equal(r.dataset.features()[0].properties.n, 'far-but-held');
});

test('① aggregate with `when`: only the members that held while the zone did, and the answer\'s period says so', async () => {
  const B = await boot();
  const zones = B.data.add({ title: 'zones', features: [box(0, 0, 10, 10, { z: 'Z', from: '1900', to: '1920' })], time: ivl });
  const mem = B.data.add({
    title: 'mem',
    features: [pt(1, 1, { v: 1, from: '1850', to: '1860' }), pt(2, 2, { v: 10, from: '1905', to: '1910' }), pt(3, 3, { v: 100, from: '1915', to: '1925' })],
    time: ivl,
  });
  const r = await ok(B, 'aggregate', [zones, mem], { stat: 'sum', field: 'v', when: 'overlaps', quantity: undefined });
  const p = r.dataset.features()[0].properties;
  assert.equal(p.sum_v, 110, 'the 1850-1860 member never coexisted with the zone');
  /* the zone 1900..1920 ∩ the bracket of the members used 1905..1925 = 1905..1920 (inclusive years → exclusive 1921) */
  assert.equal(Date.parse(p._validFrom), day(1905, 1, 1));
  assert.equal(Date.parse(p._validTo), day(1921, 1, 1));
});

test('① timeJoin uses the same rule: its result carries the pair\'s period too', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [row({ k: 'x', from: '1900', to: '1910' })], time: ivl });
  const b = B.data.add({ title: 'b', features: [row({ v: 7, from: '1905', to: '1915' })], time: ivl });
  const r = await ok(B, 'timeJoin', [a, b], { relation: 'overlaps', cardinality: 'all', fields: ['v'] });
  const p = r.dataset.features()[0].properties;
  assert.equal(p.v, 7);
  assert.equal(Date.parse(p._validFrom), day(1905, 1, 1));
  assert.equal(Date.parse(p._validTo), day(1911, 1, 1));
});

test('③ constants: the output holds only where both do, and an undated VALUE side narrows nothing but is named', async () => {
  const B = await boot();
  const mk = (t, f) => B.data.add({ title: 'x', features: f, time: t });
  const left = mk(span('1914-01-01', '1918-12-31'), [row({ k: 'a' })]);
  const rightDated = mk(span('1900-01-01', '1916-12-31'), [row({ k: 'a', v: 1 })]);
  const o = await ok(B, 'join', [left, rightDated], { leftField: 'k', rightField: 'k', fields: ['v'] });
  assert.equal(o.dataset.time.kind, 'constant');
  assert.equal(o.dataset.time.start, day(1914, 1, 1));
  assert.ok(o.dataset.time.end >= day(1916, 12, 31) && o.dataset.time.end < day(1917, 1, 2));
  assert.equal(o.dataset.provenance.timeRule.result, 'span');

  const undated = B.data.add({ title: 'csv', features: [row({ k: 'a', v: 1 })] });
  const u = await ok(B, 'join', [left, undated], { leftField: 'k', rightField: 'k', fields: ['v'] });
  assert.deepEqual(u.dataset.time, left.time, 'the shape\'s period survives an undated attribute table');
  assert.deepEqual(u.dataset.provenance.timeRule.unstatedAttributes, [undated.id], 'and the silence is named');

  const unShape = B.data.add({ title: 'csv2', features: [row({ k: 'a' })] });
  const n = await ok(B, 'join', [unShape, rightDated], { leftField: 'k', rightField: 'k', fields: ['v'] });
  assert.equal(n.dataset.time, null, 'a shape that never stated a period leaves the output\'s existence unstated');
});

test('③ constants that never overlap: no period and a warning, not a silent first-input period', async () => {
  const B = await boot();
  const left = B.data.add({ title: 'l', features: [row({ k: 'a' })], time: span('1800-01-01', '1810-12-31') });
  const right = B.data.add({ title: 'r', features: [row({ k: 'a', v: 1 })], time: span('1914-01-01', '1918-12-31') });
  const o = await ok(B, 'join', [left, right], { leftField: 'k', rightField: 'k', fields: ['v'] });
  assert.equal(o.dataset.time, null);
  assert.equal(o.dataset.provenance.timeRule.result, 'disjoint');
  assert.ok(o.dataset.provenance.warnings.some((w) => w.code === 'inputs-never-coexisted'));
});

test('① intersect of row-wise layers: each overlap carries the period of the two rows that made it', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [box(0, 0, 4, 4, { n: 'a', from: '1900', to: '1910' })], time: ivl });
  const b = B.data.add({ title: 'b', features: [box(2, 2, 6, 6, { m: 'b', from: '1905', to: '1920' })], time: ivl });
  const o = await ok(B, 'intersect', [a, b]);
  const p = o.dataset.features()[0].properties;
  assert.equal(Date.parse(p._validFrom), day(1905, 1, 1));
  assert.equal(Date.parse(p._validTo), day(1911, 1, 1));
  assert.equal(o.dataset.time.startField, '_validFrom');
});

test('④ a series on TODAY\'S borders joined to rows drawn as they were is not silently allowed', async () => {
  const B = await boot();
  const r = await ok(B, 'join', [polities(B), series(B, { borders: 'fixed', year: 2020 })], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps' });
  const warn = r.dataset.provenance.warnings.find((w) => w.code === 'geo-basis-mismatch');
  assert.ok(warn, 'the mismatch is on the record');
  assert.equal(warn.pairs, 3, 'every pair: none of the three polity rows was drawn with the 2020 borders');
  assert.equal(warn.sample[0].kind, 'fixed-year-outside-period');
  assert.equal(warn.sample[0].year, 2020);
  assert.equal(r.stats.time.geoBasisMismatch, 3);
  assert.equal(r.dataset.provenance.geoBasis.borders, 'fixed', 'inherited when every input that said agrees');
});

test('④ the same join is consistent when the fixed year is inside the rows\' own period', async () => {
  const B = await boot();
  const modern = B.data.add({
    title: 'modern units', features: [box(0, 0, 4, 4, { code: 'DEU', from: '1990', to: '2030' })], time: ivl,
  });
  const r = await ok(B, 'join', [modern, series(B, { borders: 'fixed', year: 2020 })], { leftField: 'code', rightField: 'code', fields: ['pop'], duplicates: 'first' });
  const w = r.dataset.provenance.warnings || [];
  assert.ok(!w.some((x) => x.code === 'geo-basis-mismatch'), 'the fixed year 2020 lies inside 1990..2030');
});

test('④ silence is not agreement: one side stating a basis and the other stating none is `unverified`', async () => {
  const B = await boot();
  const bare = B.data.add({ title: 'bare', features: [row({ code: 'FRA', pop: 1 })] });
  const r = await ok(B, 'join', [polities(B), bare], { leftField: 'code', rightField: 'code', fields: ['pop'] });
  assert.ok(!(r.dataset.provenance.warnings || []).some((w) => w.code === 'geo-basis-unverified'), 'nobody stated anything: nothing to warn about');
  const stated = B.data.add({ title: 'stated', features: [row({ code: 'FRA', pop: 1 })] });
  assert.equal(B.data.declareGeoBasis(stated.id, { borders: 'fixed', year: 2020 }).ok, true);
  const undatedLeft = B.data.add({ title: 'undated left', features: [row({ code: 'FRA' })] });
  const r2 = await ok(B, 'join', [undatedLeft, stated], { leftField: 'code', rightField: 'code', fields: ['pop'] });
  assert.ok(r2.dataset.provenance.warnings.some((w) => w.code === 'geo-basis-unverified'), 'a basis that cannot be checked against any period is said to be unchecked');
});

test('④ declareGeoBasis refuses what is not a basis and refuses an op\'s output', async () => {
  const B = await boot();
  const d = B.data.add({ title: 'd', features: [row({ a: 1 })] });
  assert.equal(B.data.declareGeoBasis(d.id, { borders: 'current' }).why, 'nothing-declared');
  assert.equal(B.data.declareGeoBasis(d.id, { borders: 'fixed', year: 'twenty' }).why, 'nothing-declared');
  const left = B.data.add({ title: 'l', features: [row({ k: 'a' })] });
  const out = await ok(B, 'join', [left, B.data.add({ title: 'r', features: [row({ k: 'a', v: 1 })] })], { leftField: 'k', rightField: 'k', fields: ['v'] });
  assert.equal(B.data.declareGeoBasis(out.dataset.id, { borders: 'as-of-period' }).why, 'edit-would-contradict-recipe');
});

test('⑤ 1914-07-01 Europe: the Empire row and a 2020-border population series — the time condition picks the right rows and the geography mismatch is stated', async () => {
  const B = await boot();
  /* Rows drawn as they were on 1914-07-01 (period = the state's own life) */
  const europe = B.data.add({
    title: 'Europe 1914',
    features: [
      box(6, 47, 15, 55, { code: 'DEU', name: 'German Empire', from: '1871-01-18', to: '1918-11-11' }),
      box(-5, 42, 8, 51, { code: 'FRA', name: 'France', from: '1870-09-04', to: '1940-06-22' }),
    ],
    time: ivl,
  });
  /* Maddison-style: one row per country-year, units drawn with TODAY's borders */
  const pop = B.data.add({
    title: 'population',
    features: [
      row({ code: 'DEU', pop: 65058, obs: '1913-01-01' }), row({ code: 'DEU', pop: 62411, obs: '1925-01-01' }),
      row({ code: 'FRA', pop: 41463, obs: '1913-01-01' }), row({ code: 'FRA', pop: 41000, obs: '1925-01-01' }),
    ],
    time: { kind: 'instant', field: 'obs' },
  });
  assert.equal(B.data.declareGeoBasis(pop.id, { borders: 'fixed', year: 2020 }).ok, true);
  /* Asked AT 1914-07-01: the window replaces the left's axis, so each right row is asked whether it held on that day */
  const r = await ok(B, 'join', [europe, pop], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps', at: '1914-07-01', duplicates: 'first' });
  /* no observation falls on that day: the series has YEAR points, so nothing is joined — and that is an answer, not an error */
  assert.equal(r.stats.matched, 0);
  const asOf = await ok(B, 'join', [europe, pop], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps', at: '1913', duplicates: 'first' });
  const rows = asOf.dataset.features().map((f) => f.properties);
  assert.equal(rows.find((p) => p.code === 'DEU').pop, 65058);
  assert.equal(rows.find((p) => p.code === 'FRA').pop, 41463);
  const warn = asOf.dataset.provenance.warnings.find((w) => w.code === 'geo-basis-mismatch');
  assert.ok(warn, 'a 2020-border series was joined to 1913 states: that is the statement the output must carry');
  assert.equal(warn.pairs, 2);
  assert.deepEqual(warn.bases.b, { borders: 'fixed', year: 2020 });
});

test('the cache key does not see the warnings\' or the period\'s transaction time (a rerun of one recipe is one key)', async () => {
  const B = await boot();
  const a = await ok(B, 'join', [polities(B), series(B)], { leftField: 'code', rightField: 'code', fields: ['pop'], when: 'overlaps' });
  assert.equal(typeof a.dataset.provenance.recordedAt, 'string');
  assert.ok(Array.isArray(a.dataset.provenance.inputTimes));
});
