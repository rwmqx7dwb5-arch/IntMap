/* atlas-shape-identity — a line of the right KIND is not the right THING (node --test).
   Defect guarded: `atlas.shapes.line:real >= 1` passed a different river's real course for 「信濃川を地図でなぞって」.
   The final map now lists the names its shapes were resolved for, and a `drawn` criterion may say which one. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const MS = await imp('scripts/atlas-eval/map-state.mjs');
const SR = await imp('js/atlas-shape-resolve.js');

const line = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
const snapOf = (items) => ({ atlas: SR.tallyShapes(items) ? { shapes: SR.tallyShapes(items) } : {} });
const ms = { drawn: [{ path: 'atlas.shapes.line:real', min: 1, named: ['信濃川', 'Shinano'], why: 'w' }] };

test('atlas-shape-identity: tallyShapes lists the distinct names, and none when no shape carries one', () => {
  assert.deepEqual(SR.tallyShapes([{ geo: line, basis: 'real', name: '信濃川' }, { geo: line, basis: 'real', name: '信濃川' }]).names, ['信濃川']);
  assert.equal(SR.tallyShapes([{ geo: line, basis: 'real' }]).names, undefined);
});

test('atlas-shape-identity: the right river passes, another river fails, an unnamed map is unobserved', () => {
  assert.equal(MS.gradeMap(ms, snapOf([{ geo: line, basis: 'real', name: 'Shinano River' }])).verdict, 'match');
  const wrong = MS.gradeMap(ms, snapOf([{ geo: line, basis: 'real', name: '利根川' }]));
  assert.equal(wrong.verdict, 'mismatch');
  assert.match(wrong.criteria[0].detail, /not 信濃川/);
  assert.equal(MS.gradeMap(ms, snapOf([{ geo: line, basis: 'real' }])).verdict, 'unobserved', 'never a pass without the names');
});

test('atlas-shape-identity: a criterion without `named` is graded exactly as before', () => {
  const plain = { drawn: [{ path: 'atlas.shapes.line:real', min: 1, why: 'w' }] };
  assert.equal(MS.gradeMap(plain, snapOf([{ geo: line, basis: 'real', name: 'x' }])).verdict, 'match');
});
