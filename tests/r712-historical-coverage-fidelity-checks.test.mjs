import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, selectRecords, SOURCE } from '../scripts/build-hist-places.mjs';

const read = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'));

test('modern-name evidence never removes an otherwise eligible independent historical place', () => {
  const ancient = { r: 'Ancient source name', a: '', l: 'la', s: -500, e: 600 };
  const modern = { r: 'Modern source name', a: '', l: 'en', s: 1700, e: 2100 };
  const p = { id: '1', title: 'Source settlement', rights: 'Creative Commons Attribution 3.0',
    types: ['settlement'], rp: [10, 20], names: [ancient, modern] };
  const record = { source: SOURCE, asOf: '2026-09-11', places: selectRecords([p], 2026) };
  assert.equal(record.places.length, 1);
  const result = compile(record, new Set(['pl-other']));
  assert.equal(result.places.length, 1);
  assert.deepEqual(result.places[0].names, [ancient, modern], 'both assertions retain their own periods');
  assert.equal(compile(record, new Set(['pl-1'])).places.length, 0, 'only actual shipped identity suppresses duplication');
});

test('every eligible source identity reaches exactly one of the historical place delivery paths', () => {
  const record = read('scripts/histplaces/pleiades-record.json');
  const cities = new Set(read('data/hist-cities.json').cities.map(p => p.id));
  const places = read('data/hist-places.json').places;
  const ids = new Set(places.map(p => p.id));
  assert.equal(ids.size, places.length);
  let modernNames = 0;
  for (const p of record.places) {
    const id = 'pl-' + p.id;
    assert.notEqual(cities.has(id), ids.has(id), id + ' must reach exactly one delivery path');
    if (ids.has(id) && p.names.some(n => n.e >= 2026)) modernNames++;
  }
  assert.ok(modernNames > 0, 'the actual source population must exercise the former coverage gap');
  assert.deepEqual(compile(record, cities).places, places);
});
