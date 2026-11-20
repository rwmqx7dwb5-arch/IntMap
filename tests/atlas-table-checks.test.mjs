/* data.table — rows an investigation gathered become a dataset spec the registry takes (js/atlas-table.js).
   The properties asserted are the ones the engine exists for: nothing invented, nothing dropped, and what the
   caller did not state stays unstated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toSpec } from '../js/atlas-table.js';

const fabs = [
  { name: 'Fab A', lat: 24.77, lon: 121.01, power_gco2_kwh: 560, year: 2024, source: 'https://example.org/a' },
  { name: 'Fab B', lat: '33.78', lon: '-112.16', power_gco2_kwh: 380, year: 2024, source: 'https://example.org/b' },
  { name: 'Fab C (no position)', power_gco2_kwh: null, year: 2024 },
];

test('rows become point features; a row with no position stays a row and is counted', () => {
  const r = toSpec({ title: 'fabs', rows: fabs });
  assert.equal(r.ok, true);
  assert.equal(r.spec.features.length, 3);
  assert.deepEqual(r.spec.features[0].geometry, { type: 'Point', coordinates: [121.01, 24.77] });
  assert.deepEqual(r.spec.features[1].geometry.coordinates, [-112.16, 33.78], 'numeric strings are read as numbers');
  assert.equal(r.spec.features[2].geometry, null);
  assert.equal(r.stats.withPosition, 2);
  assert.equal(r.stats.withoutPosition, 1);
  assert.equal(r.stats.latColumn, 'lat'); assert.equal(r.stats.lngColumn, 'lon');
});

test('every column of every row is carried verbatim, null stays null', () => {
  const r = toSpec({ rows: fabs });
  assert.equal(r.spec.features[2].properties.power_gco2_kwh, null);
  assert.equal(r.spec.features[0].properties.source, 'https://example.org/a');
});

test('a declared unit becomes a field statement authored by the caller; an undeclared column states nothing', () => {
  const r = toSpec({ rows: fabs, columns: { power_gco2_kwh: { unit: 'gCO2e/kWh', from: 'Ember 2024' } } });
  assert.deepEqual(Object.keys(r.spec.fieldStatements), ['power_gco2_kwh']);
  assert.equal(r.spec.fieldStatements.power_gco2_kwh.unit, 'gCO2e/kWh');
  assert.equal(r.spec.fieldStatements.power_gco2_kwh.unitStated, 'source');
  assert.equal(r.spec.fieldStatements.year, undefined);
});

test('a declared column no row has, and text in a unit column, are reported — not silently fixed', () => {
  const r = toSpec({ rows: [{ lat: 1, lng: 2, water: '12 MW' }], columns: { water: { unit: 'MW' }, ghost: { unit: 'm' } } });
  assert.deepEqual(r.stats.unknownColumns, ['ghost']);
  assert.deepEqual(r.stats.textWithUnit, ['water']);
  assert.equal(r.spec.fieldStatements.ghost, undefined);
});

test('positions out of range are counted as bad, never clamped or swapped', () => {
  const r = toSpec({ rows: [{ lat: 91, lng: 10 }, { lat: 10, lng: 200 }, { lat: 'x', lng: 1 }] });
  assert.equal(r.stats.withPosition, 0); assert.equal(r.stats.badPosition, 3);
  assert.ok(r.spec.features.every((f) => f.geometry === null));
});

test('an explicit column name is honoured and a missing one is refused by name', () => {
  assert.equal(toSpec({ rows: [{ la: 1, lo: 2 }], lat: 'la', lng: 'lo' }).stats.withPosition, 1);
  const bad = toSpec({ rows: [{ la: 1 }], lat: 'nope', lng: 'lo' });
  assert.equal(bad.ok, false); assert.equal(bad.code, 'position_column_missing');
});

test('there is no row limit and an empty table is refused', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ lat: i % 90, lng: i % 180, v: i }));
  assert.equal(toSpec({ rows: many }).spec.features.length, 5000);
  assert.equal(toSpec({ rows: [] }).code, 'no_rows');
});
