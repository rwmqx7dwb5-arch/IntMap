/* The reader's reasoning-effort pick (js/atlas-effort.js) and where it lands on the server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAtlasEffort } from '../js/atlas-effort.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function withStore(initial, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const mem = new Map(initial ? [['intmap.atlas.effort', initial]] : []);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) } });
  try { return fn(); } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
}

test('auto sends exactly what Atlas always sent: high for a compound request, nothing otherwise', () => {
  withStore(null, () => {
    const e = makeAtlasEffort({ L: (a) => a });
    assert.equal(e.get(), 'auto');
    assert.equal(e.pick(true), 'high');
    assert.equal(e.pick(false), undefined);
  });
});

test('a stored pick overrides the complexity guess, and an unknown stored value means auto', () => {
  withStore('xhigh', () => { const e = makeAtlasEffort({ L: (a) => a }); assert.equal(e.pick(false), 'xhigh'); assert.equal(e.pick(true), 'xhigh'); });
  withStore('low', () => { assert.equal(makeAtlasEffort({ L: (a) => a }).pick(true), 'low'); });
  withStore('ultra', () => { assert.equal(makeAtlasEffort({ L: (a) => a }).get(), 'auto'); });
});

test('with no storage at all the picker still works (private window)', () => {
  const e = makeAtlasEffort({ L: (a) => a });
  assert.equal(e.get(), 'auto');
});

test('the server applies the pick only to tasks that opt in, and xhigh reaches the provider with its own budget', () => {
  const ask = read('supabase/functions/ai-proxy/ask.ts');
  assert.match(ask, /spec\.effortHint && \["low", "medium", "high", "xhigh"\]\.includes\(effortHint\)/);
  const oa = read('supabase/functions/ai-proxy/providers/openai.ts');
  assert.match(oa, /effort === "xhigh" \? 8_000/, 'xhigh has a bigger reasoning allowance than high');
  assert.match(oa, /effort: effort === "xhigh" \? "xhigh"/, 'xhigh is passed through, not crushed to low');
  assert.match(oa, /effort === "xhigh" \? "high" : effort/, 'a fallback model is asked for high, not a tier it may not have');
});

test('the console sends the pick as the turn hint and mounts the menu', () => {
  const c = read('js/atlas-console.js');
  assert.match(c, /effortHint:_effort/);
  assert.match(c, /let _effort=EFFORT\.pick\(_cplx\)/);
  assert.match(c, /EFFORT\.mount\(panel\)/);
});

test('auto asks a model once and uses its tier; the reader\'s own pick never costs a call', async () => {
  await withStoreAsync(null, async () => {
    const e = makeAtlasEffort({ L: (a) => a });
    const calls = [];
    const ask = async (prompt, system, imgs, opts) => { calls.push(opts); return { data: { effort: 'High' } }; };
    assert.equal(await e.decide({ ask, request: 'compare the GDP of five countries', fallback: undefined }), 'high');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].task, 'atlas_effort');
    assert.equal(calls[0].webMode, 'off');
  });
  await withStoreAsync('medium', async () => {
    const e = makeAtlasEffort({ L: (a) => a });
    let n = 0;
    assert.equal(await e.decide({ ask: async () => { n++; return { data: { effort: 'low' } }; }, request: 'x', fallback: 'high' }), 'medium');
    assert.equal(n, 0, 'a manual pick makes no sizing call');
  });
});

test('only a failed sizing call falls back; an answer that is not a tier counts as failed', async () => {
  await withStoreAsync(null, async () => {
    const e = makeAtlasEffort({ L: (a) => a });
    assert.equal(await e.decide({ ask: async () => { throw new Error('upstream 500'); }, request: 'x', fallback: 'high' }), 'high');
    assert.equal(await e.decide({ ask: async () => ({ data: { effort: 'maximum' } }), request: 'x', fallback: 'medium' }), 'medium');
    assert.equal(await e.decide({ ask: async () => ({ data: null }), request: 'x', fallback: undefined }), undefined);
  });
});

test('the sizing task exists on the server with a server-owned schema, and the console decides before the first step', () => {
  assert.match(read('supabase/functions/ai-proxy/tasks/all.ts'), /atlas_effort/);
  const t = read('supabase/functions/ai-proxy/tasks/atlas_effort.ts');
  assert.match(t, /name: "atlas_effort"/);
  assert.match(t, /reasoning: "low"/);
  const c = read('js/atlas-console.js');
  assert.match(c, /EFFORT\.decide\(/);
  assert.ok(c.indexOf('EFFORT.decide(') < c.indexOf('effortHint:_effort'), 'the tier is decided before the step loop uses it');
});

async function withStoreAsync(initial, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const mem = new Map(initial ? [['intmap.atlas.effort', initial]] : []);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) } });
  try { return await fn(); } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
}
