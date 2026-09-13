import test from 'node:test';
import assert from 'node:assert/strict';
import { planDetailBuild, detailAssets } from '../scripts/build-border-detail.mjs';

function fixture() {
  const { index, selected } = planDetailBuild(null);
  for (const [file, global] of selected) {
    index.sets[global] = { 0: ['geometry-' + file, [[file + '-0123456789abcdef.json', [0, 0, 1, 1]]]] };
    index.stats[global] = { records: 1, refined: 1, retained: 0, vertices: 5, bytes: 20, chunks: 1 };
  }
  return index;
}

test('partial admin refresh preserves country manifest and measurements', () => {
  const before = fixture(), snapshot = JSON.stringify(before);
  const { index, selected } = planDetailBuild(before, ['hist-admin1', 'hist-admin2']);
  assert.deepEqual(selected.map(s => s[0]), ['hist-admin1', 'hist-admin2']);
  index.sets.__HISTADM1 = { 1: ['new', [['hist-admin1-fedcba9876543210.json', [1, 1, 2, 2]]]] };
  index.stats.__HISTADM1 = { records: 2, refined: 1, retained: 1, vertices: 8, bytes: 30, chunks: 1 };
  assert.deepEqual(index.sets.__HISTB, before.sets.__HISTB);
  assert.deepEqual(index.stats.__HISTB, before.stats.__HISTB);
  assert.equal(JSON.stringify(before), snapshot);
  const used = detailAssets(index);
  assert.ok(used.has('hist-borders-0123456789abcdef.json'), 'cleanup preserves the unselected country asset');
  assert.ok(used.has('hist-admin1-fedcba9876543210.json'));
  assert.ok(!used.has('hist-admin1-0123456789abcdef.json'), 'cleanup releases the replaced admin asset');
});

test('partial builds reject incompatible shared provenance before writing', () => {
  const before = fixture();
  for (const [key, value] of Object.entries({ v: 2, source: 'other', targetTolerance: 0.01, decimals: 4, inlandKm: -1 }))
    assert.throws(() => planDetailBuild({ ...before, [key]: value }, ['hist-admin1']), /incompatible/);
  for (const names of [[], ['unknown'], ['hist-admin1', 'hist-admin1'], ['']])
    assert.throws(() => planDetailBuild(before, names), /--sets/);
  assert.throws(() => planDetailBuild(null, ['hist-admin1']), /existing index/);
  assert.throws(() => planDetailBuild({ ...before, stats: {} }, ['hist-admin1']), /no stats/);
  assert.throws(() => planDetailBuild({ ...before, sets: { ...before.sets, __UNKNOWN: {} } }, ['hist-admin1']), /unknown/);
});

test('full rebuild starts every set fresh and does not inherit stale index metadata', () => {
  const { index, selected } = planDetailBuild({ broken: true });
  assert.equal(selected.length, 3);
  assert.deepEqual(index.sets, {});
  assert.deepEqual(index.stats, {});
  assert.equal(index.broken, undefined);
});
