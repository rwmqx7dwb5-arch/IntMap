/* An override in the root package.json is a FLOOR, never a ceiling.
 * MEASURED 2026-11-16: `"dompurify": "3.4.16"` held the browser's DOMPurify below 3.4.17 for five weeks after three
 * critical advisories were published against it; the audit job failed on every PR, the weekly data refreshes included.
 * scripts/lock-ranges.mjs exactOverrides, read by check:static. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactOverrides, overrideEdges } from '../scripts/lock-ranges.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

test('no root override names one exact version', () => {
  assert.ok(Object.keys(pkg.overrides || {}).length, 'the shipped package.json carries overrides — the rule must have something to read');
  assert.deepEqual(exactOverrides(pkg), []);
  assert.deepEqual(overrideEdges(pkg, lock), [], 'the floors are met by the lock');
});

test('the measured failure is refused and the floors it should have been are not', () => {
  assert.deepEqual(exactOverrides({ overrides: { dompurify: '3.4.16' } }), [{ name: 'dompurify', spec: '3.4.16' }]);
  assert.equal(exactOverrides({ overrides: { dompurify: '=3.4.16' } }).length, 1);
  for (const spec of ['^3.4.17', '>=3.4.17', '~3.4.17', '3.4.x', '>=3.4.17 <4', '1 || 2']) {
    assert.deepEqual(exactOverrides({ overrides: { dompurify: spec } }), [], spec);
  }
});

test('the browser ships a DOMPurify past the advisories that closed at 3.4.17', () => {
  const v = lock.packages['node_modules/dompurify'].version.split('.').map(Number);
  assert.ok(v[0] > 3 || (v[0] === 3 && (v[1] > 4 || (v[1] === 4 && v[2] >= 17))), `locked ${v.join('.')}`);
});
