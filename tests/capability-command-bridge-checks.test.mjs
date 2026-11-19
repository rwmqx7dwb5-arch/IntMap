import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDeclarations, registeredCommandIds } from '../scripts/atlas-capability-audit.mjs';

const reg = new Set(['view.base.map', 'view.base.sat', 'tab.news']);
const row = (o) => ({ id: 'x', commands: [], src: '', ...o });

test('a true declaration passes and is counted', () => {
  const r = commandDeclarations([row({ id: 'view.basemap', commands: ['view.base.map', 'view.base.sat'], src: "kexec('view.base.map')" })], reg);
  assert.deepEqual(r.bad, []); assert.equal(r.claimed, 2); assert.deepEqual(r.unclaimed, ['tab.news']);
});
test('declaring a command nothing registers fails', () => {
  assert.equal(commandDeclarations([row({ commands: ['view.nope'] })], reg).bad.length, 1);
});
test('two capabilities claiming one command fails', () => {
  const r = commandDeclarations([row({ id: 'a', commands: ['tab.news'] }), row({ id: 'b', commands: ['tab.news'] })], reg);
  assert.ok(r.bad.some((m) => /claimed by both/.test(m)));
});
test('a run that uses a registered command it did not declare fails (the drift the declaration exists to stop)', () => {
  const r = commandDeclarations([row({ src: "kexec('tab.news')" })], reg);
  assert.ok(r.bad.some((m) => /does not declare/.test(m)));
});
test('the real registry discovers the commands the capabilities drive', () => {
  const ids = registeredCommandIds();
  ['view.proj.flat', 'view.base.sat', 'tab.stats'].forEach((c) => assert.ok(ids.has(c), c));
});
