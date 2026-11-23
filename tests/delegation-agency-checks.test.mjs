/* delegation-agency — the limits count what the server counts; data.gis hands the planner the whole record */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

async function entry() {
  const caps = (await import('../js/atlas-cap-research.js')).default;
  return caps.find((c) => c.row[0] === 'research.delegate');
}
function kernel(over) {
  let asked = 0, ran = 0;
  const K = Object.assign({
    R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'ta-1', turnSignal: () => undefined,
    askAIJSONEnvelope: async () => { asked++; return { data: { summary: 's' }, meta: {} }; },
    runReadCapability: async () => { ran++; return { ok: true, text: 'x', meta: {} }; },
    classifyCapability: () => 'read',
    _delegationPolicy: { mode: 'independent', maxChildren: 2, childMaxCalls: 3 },
  }, over || {});
  return { K, counts: () => ({ asked, ran }) };
}

test('capability tasks open no child turn, so they do not count against the worker limit', async () => {
  const e = await entry(); const { K, counts } = kernel();
  const r = await e.run({ tasks: [{ id: 'a', kind: 'capability', capability: 'data.gis', args: { n: 1 } }, { id: 'b', kind: 'capability', capability: 'data.gis', args: { n: 2 } }, { id: 'c', kind: 'capability', capability: 'data.gis', args: { n: 3 } }] }, {}, K);
  assert.notEqual(r.meta && r.meta.code, 'too_many_tasks');
  assert.equal(counts().ran, 3); assert.equal(counts().asked, 0);
});

test('two workers and a capability task fit a two-worker policy', async () => {
  const e = await entry(); const { K, counts } = kernel();
  const r = await e.run({ tasks: [{ goal: 'a' }, { goal: 'b' }, { id: 'g', kind: 'capability', capability: 'data.gis', args: {} }] }, {}, K);
  assert.notEqual(r.meta && r.meta.code, 'too_many_tasks');
  assert.equal(counts().asked, 2); assert.equal(counts().ran, 1);
});

test('verify:true needs a child turn of its own, and is refused up front, with the numbers, before anything is spent', async () => {
  const e = await entry(); const { K, counts } = kernel();
  const r = await e.run({ tasks: [{ goal: 'a', verify: true }, { goal: 'b', verify: true }] }, {}, K);
  assert.equal(r.ok, false); assert.equal(r.meta.code, 'too_many_tasks');
  assert.equal(r.meta.workers, 2); assert.equal(r.meta.checkers, 2);
  assert.equal(counts().asked, 0);
  const ok = await e.run({ tasks: [{ goal: 'a', verify: true }] }, {}, K);
  assert.notEqual(ok.meta && ok.meta.code, 'too_many_tasks');
});

test('data.gis puts the dataset record (crs, time, coverage, origin) in meta, not only the id', () => {
  const src = readFileSync(new URL('../js/atlas-cap-data.js', import.meta.url), 'utf8');
  assert.match(src, /gis:\{op:_gr\.op,dataset:_gr\.dataset\.id,count:_gr\.dataset\.count,drawn:!!_gr\.drawn,record:_gr\.dataset(,semantic:[^}]*)?\}/);
});
