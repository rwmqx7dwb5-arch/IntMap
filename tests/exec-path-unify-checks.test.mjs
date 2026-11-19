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

/* ── GUI → execute(): the migration's standing check ─────────────────────────────────────────────
   A control that a capability drives 1:1 presses the capability (IntMapOS.press → execute), so the
   button and Atlas share the operation record, the observation and the postcondition. A direct
   IntMapOS.exec(command) caller must say why in scripts/gui-exec-sites.json. */
import { codeOnly } from '../scripts/code-only.mjs';
const jsDir = new URL('../js/', import.meta.url);
const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
const codeOf = (f) => codeOnly(fs.readFileSync(new URL(f, jsDir), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(new URL('../scripts/gui-exec-sites.json', import.meta.url), 'utf8'));
delete ledger._doc;
const DIRECT = /\b(?:IntMapOS|OS)\.exec\(/;
/* the Atlas shell (atlas-*.js) runs commands under capabilities by design */
const guiFiles = jsFiles.filter((f) => !/^atlas-/.test(f));

test('every GUI file that calls exec() directly states why in the ledger, and no entry is stale', () => {
  const callers = guiFiles.filter((f) => DIRECT.test(codeOf(f)));
  assert.deepEqual(callers.filter((f) => !(f in ledger)), [], 'direct exec() callers with no stated reason — press a capability or add a reason');
  assert.deepEqual(Object.keys(ledger).filter((f) => !callers.includes(f)), [], 'stale ledger entries');
  for (const [f, why] of Object.entries(ledger)) assert.ok(why.length >= 60, f + ': the reason is too short to be one');
});

test('every IntMapOS.press(capability, args, command) names a capability that claims that command', () => {
  const rows = new Map();
  for (const f of jsFiles.filter((x) => /^atlas-cap-.*\.js$/.test(x))) {
    const s = codeOf(f);
    for (const m of s.matchAll(/row:\s*\[\s*'([^']+)'[\s\S]*?commands:\s*\[([^\]]*)\]/g))
      rows.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  }
  let n = 0;
  for (const f of guiFiles) for (const m of codeOf(f).matchAll(/IntMapOS\.press\('([^']+)'\s*,\s*[^)]*?,\s*'([^']+)'\)/g)) {
    n++;
    assert.ok(rows.has(m[1]), f + ': no capability ' + m[1]);
    assert.ok(rows.get(m[1]).includes(m[2]), f + ': ' + m[1] + ' does not claim command ' + m[2]);
  }
  assert.ok(n >= 8, 'the eight toolbar buttons (projection ×2, basemap ×2, tabs ×4) press capabilities');
});

test('press() runs execute, and falls back to the command only when execute REJECTS', async () => {
  const s = fs.readFileSync(new URL('../js/atlas-capabilities.js', import.meta.url), 'utf8');
  const a = s.indexOf('OS.press = function'); const b = s.indexOf('};', s.indexOf('});', a)) + 2;
  const mk = (execute) => { const calls = []; const OS = { execute, has: () => true, exec: (c, o) => { calls.push([c, o.source]); return { ok: true }; } };
    new Function('OS', s.slice(a, b))(OS); return { OS, calls }; };
  let seen; const ok = mk((id, args, o) => { seen = [id, args, o.source]; return Promise.resolve({ status: 'failed' }); });
  assert.deepEqual(await ok.OS.press('view.projection', { mode: 'flat' }, 'view.proj.flat'), { status: 'failed' });
  assert.deepEqual(seen, ['view.projection', { mode: 'flat' }, 'ui']); assert.deepEqual(ok.calls, []);
  const bad = mk(() => Promise.reject(new Error('chunk')));
  assert.deepEqual(await bad.OS.press('view.projection', { mode: 'flat' }, 'view.proj.flat'), { ok: true });
  assert.deepEqual(bad.calls, [['view.proj.flat', 'ui']]);
});
