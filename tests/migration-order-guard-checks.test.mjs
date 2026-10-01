/**
 * tests/migration-order-guard-checks.test.mjs — (migration-order-guard) a migration a change adds sorts after
 * every migration on the base, or check:static refuses it (scripts/migration-order.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outOfOrder, stampOf } from '../scripts/migration-order.mjs';

const BASE = ['20261001090000_ai_turn_answers.sql', '20261002100000_ai_counters_never_negative.sql'];

test('migration-order ① the measured case: a migration older than the newest on the base is named', () => {
  const r = outOfOrder(BASE, [...BASE, '20261002090000_usage_counts.sql']);
  assert.deepEqual(r, [{ name: '20261002090000_usage_counts.sql', stamp: '20261002090000', latest: '20261002100000' }]);
});

test('migration-order ② a later migration, and the base\'s own files, pass', () => {
  assert.deepEqual(outOfOrder(BASE, [...BASE, '20261002120000_usage_counts.sql']), []);
  assert.deepEqual(outOfOrder(BASE, BASE), []);
});

test('migration-order ③ an equal timestamp is out of order too (two files cannot share a version)', () => {
  assert.equal(outOfOrder(BASE, ['20261002100000_other.sql']).length, 1);
});

test('migration-order ④ the stamp is the 14-digit prefix; a file without one is not judged here', () => {
  assert.equal(stampOf('supabase/migrations/20261002120000_x.sql'), '20261002120000');
  assert.equal(stampOf('README.md'), null);
  assert.deepEqual(outOfOrder(BASE, ['notes.sql']), []);
});

test('migration-order ⑤ this repository: no migration is newer on the base than one the tree adds', async () => {
  const { readdirSync } = await import('node:fs');
  const names = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((n) => n.endsWith('.sql'));
  const sorted = [...names].sort();
  assert.deepEqual(names.map(stampOf).filter(Boolean).length, names.length, 'every migration carries a 14-digit version');
  assert.equal(new Set(names.map(stampOf)).size, names.length, 'two migrations share a version');
  assert.deepEqual(sorted, [...sorted]);
});
