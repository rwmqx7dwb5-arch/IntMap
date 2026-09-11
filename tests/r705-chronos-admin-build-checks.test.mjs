import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const source = fs.readFileSync(new URL('../scripts/build-hist-admin1.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function dateInfo(');
const end = source.indexOf('/* ── Douglas', start);
const ctx = vm.createContext({ Date });
vm.runInContext(source.slice(start, end), ctx);
const parse = (raw, edge = 'end') => JSON.parse(JSON.stringify(ctx.edtf(raw, edge)));
test('OHM end dates are exclusive at their stated precision', () => {
  assert.deepEqual(parse('1871-05-04'), [1871, 5, 4]);
  assert.deepEqual(parse('1871-05'), [1871, 6, 1]);
  assert.deepEqual(parse('1871'), [1872, 1, 1]);
  assert.deepEqual(parse('-0500'), [-499, 1, 1]);
  assert.deepEqual(parse('0099-12'), [100, 1, 1]);
  assert.deepEqual(parse('0000-02'), [0, 3, 1]);
});
test('calendar validation does not normalize impossible source dates', () => {
  for (const raw of ['1900-02-29', '0001-02-29', '2020-04-31', '2020-00', '2020-13', '2020-01-00']) assert.equal(parse(raw), null, raw);
  assert.deepEqual(parse('0000-02-29', 'start'), [0, 2, 29]);
  assert.deepEqual(parse('2000-02-29', 'start'), [2000, 2, 29]);
  assert.deepEqual(parse('-0400-02-29', 'start'), [-400, 2, 29]);
});
test('source precision and uncertainty survive normalization', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.dateInfo('1871~'))), { raw: '1871~', precision: 'year', qualified: true });
  assert.equal(ctx.dateInfo(null).precision, 'unknown');
});
test('a rebuild retains the stored coordinate precision', () => {
  const from = source.indexOf('function coordinateDecimals(');
  const to = source.indexOf('const DECIMALS', from);
  vm.runInContext(source.slice(from, to), ctx);
  assert.equal(ctx.coordinateDecimals({ rings: [[[1.1234, 2.01]]] }), 4);
  assert.equal(ctx.coordinateDecimals({ decimals: 5, rings: [[[1, 2]]] }), 5);
  assert.equal(ctx.coordinateDecimals(undefined), 3);
});
test('equal explicit days retain one day and carry the normalization reason', () => {
  const span = ctx.dateSpan('1861-01-09', '1861-01-09');
  assert.equal(span.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(span.e)), [1861, 1, 10]);
  assert.equal(span.metadata.normalization, 'single-day');
  assert.equal(span.metadata.end.raw, '1861-01-09');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.dateSpan('0000-02-29', '0000-02-29').e)), [0, 3, 1]);
});
test('contradictory periods cannot become one-day records', () => {
  for (const pair of [['1930', '1929'], ['1930-01-02', '1930-01-01'], ['1930-01-01', '1929']]) {
    const span = ctx.dateSpan(...pair);
    assert.equal(span.valid, false);
    assert.equal(span.metadata.normalization, undefined);
  }
  const invalid = ctx.dateSpan('1900-02-29', '1900-02-29');
  assert.equal(invalid.metadata.normalization, undefined);
  assert.equal(invalid.valid, false);
});

test('qualified or imprecisely formatted dates are not certified as a single day', () => {
  for (const raw of ['1930-01-01?', '1930-01-01~', '1930-1-1']) {
    const span = ctx.dateSpan(raw, raw);
    assert.equal(span.metadata.normalization, undefined);
    assert.equal(span.valid, false);
  }
});
test('unknown starts preserve published display bounds independently of the clock floor', () => {
  const previous = ['unit', 4, -199, 1, 1, 1900, 1, 1, [[0]], { en: 'unit', ja: '地方' }, 1];
  const snapshot = JSON.stringify(previous);
  const span = ctx.dateSpan(null, '1900');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.boundedStart(span, previous))), [-199, 1, 1]);
  assert.equal(span.metadata.start.raw, null);
  assert.equal(span.metadata.start.precision, 'unknown');
  assert.equal(span.metadata.start.boundary, 'preserved-display-bound');
  assert.equal(JSON.stringify(previous), snapshot, 'names, geometry and the original row remain intact');
  assert.equal(ctx.boundedStart(ctx.dateSpan(null, '1900'), null), null, 'new unknown starts need source resolution');
});
test('sourced BCE starts remain available despite an earlier published display bound', () => {
  const span = ctx.dateSpan('-0500', '-0400');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.boundedStart(span, ['unit', 4, -199, 1, 1]))), [-500, 1, 1]);
  assert.equal(span.metadata.start.boundary, undefined);
});
