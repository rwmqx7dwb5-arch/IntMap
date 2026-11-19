import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* Evaluate the kernel IIFE itself (not its spelling): IntMapOS.dispatch must write its record
   AFTER the dispatcher answered, and settle it for a thenable, as exec does. */
const src = fs.readFileSync(new URL('../js/app-body.js', import.meta.url), 'utf8');
const a = src.indexOf('window.IntMapOS=(function(){');
const b = src.indexOf('})();', a);
assert.ok(a > 0 && b > a, 'kernel IIFE found');
const body = src.slice(a, b + 5).replace('window.IntMapOS=', 'IntMapOS=');
function kernel() { const ctx = { IntMapOS: null }; vm.runInNewContext(body, ctx); return ctx.IntMapOS; }

test('dispatch with no dispatcher records a failure, never a success', () => {
  const OS = kernel(); const r = OS.dispatch({ type: 'x' });
  assert.equal(r.ok, false);
  assert.equal(OS.log().at(-1).ok, false);
});
test('dispatch records the action only after the dispatcher answered ok:false', () => {
  const OS = kernel(); OS._setDispatch(() => ({ ok: false, err: 'nope' }));
  OS.dispatch({ type: 'x' });
  const e = OS.log().at(-1); assert.equal(e.ok, false); assert.equal(e.err, 'nope');
});
test('a rejected promise settles the record to failure; pending until then', async () => {
  const OS = kernel(); let rej; OS._setDispatch(() => new Promise((_, r) => { rej = r; }));
  const seen = []; OS.on(e => seen.push({ ...e }));
  const p = OS.dispatch({ type: 'x' });
  assert.equal(OS.log().at(-1).pending, true);
  rej(new Error('boom')); await p.catch(() => {}); await new Promise(r => setTimeout(r, 0));
  const last = seen.at(-1); assert.equal(last.ok, false); assert.equal(last.pending, false);
});
test('a resolved ok action stays ok', async () => {
  const OS = kernel(); OS._setDispatch(() => Promise.resolve({ ok: true }));
  await OS.dispatch({ type: 'x' }); await new Promise(r => setTimeout(r, 0));
  assert.equal(OS.log().at(-1).ok, true);
});
