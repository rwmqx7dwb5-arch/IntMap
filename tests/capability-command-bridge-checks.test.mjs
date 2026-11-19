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

test('a command with a stated reason is declined, not unclaimed; a bare or stale reason fails', () => {
  const why = 'a reason that is long enough to actually be one, naming what is true';
  const ok = commandDeclarations([], reg, { 'tab.news': why });
  assert.deepEqual(ok.bad, []); assert.deepEqual(ok.declined, ['tab.news']); assert.ok(!ok.unclaimed.includes('tab.news'));
  assert.ok(commandDeclarations([], reg, { 'tab.news': 'todo' }).bad.some((m) => /too short/.test(m)));
  assert.ok(commandDeclarations([], reg, { 'view.nope': why }).bad.some((m) => /nothing registers/.test(m)));
  assert.ok(commandDeclarations([row({ id: 'a', commands: ['tab.news'] })], reg, { 'tab.news': why }).bad.some((m) => /now claimed/.test(m)));
});
test('every registered command is claimed by a capability or declined with a reason (none left unaccounted)', async () => {
  const fs = await import('node:fs');
  const unb = JSON.parse(fs.readFileSync(new URL('../scripts/atlas-command-unbridged.json', import.meta.url), 'utf8'));
  const claimed = new Set();
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter((x) => /^atlas-cap-.*\.js$/.test(x)))
    for (const m of fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8').matchAll(/commands:\s*\[([^\]]*)\]/g))
      for (const x of m[1].matchAll(/'([^']+)'/g)) claimed.add(x[1]);
  const left = [...registeredCommandIds()].filter((c) => !claimed.has(c) && !(c in unb));
  assert.deepEqual(left, [], 'commands with neither a capability nor a stated reason');
});
