import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeAtlasToolSurface } from '../js/atlas-toolsurface.js';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { CAPABILITY_MODULES } from '../js/atlas-caps-modules.js';
import { capabilityEntries } from '../js/atlas-caps.js';
import { makeAtlasVerify } from '../js/atlas-verify.js';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';

const gate = () => Promise.withResolvers();
const tick = () => new Promise((resolve) => setImmediate(resolve));
const call = (id, name = id, args = {}) => ({ id, name, arguments: args });
const reply = (...calls) => ({
  toolCalls: calls,
  items: calls.map((c) => ({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.arguments) })),
});
const tools = Object.fromEntries(['fast', 'slow', 'dependent', 'paint'].map((name) => [name, {
  name, parameters: { type: 'object', properties: { value: { type: 'number' } } },
}]));
const messages = [{ role: 'user', content: 'q' }];
const footprint = (c) => c.name === 'paint' ? { writes: ['map.object'] } : { reads: ['dataset'], writes: [], readOnly: true };

test('independent reads deliver the first result and start a dependent read before the slow sibling settles', async () => {
  const agent = makeAtlasAgent(), slow = gate(), started = [];
  const requests = [];
  const run = agent.runTurn({
    tools, footprint, messages, memoryTurn: 19,
    model: async (req) => {
      requests.push(req);
      if (req.step === 0) return reply(call('fast'), call('slow'));
      if (req.step === 1) return reply(call('dependent', 'dependent', { value: 7 }));
      if (req.step === 2) return { text: 'Tentative', toolCalls: [] };
      return { text: 'Complete', toolCalls: [] };
    },
    execute: async (c) => {
      started.push(c.name);
      if (c.name === 'slow') return slow.promise;
      return { ok: true, value: c.arguments.value ?? 7 };
    },
  });
  try {
    await tick();
    assert.deepEqual(started, ['fast', 'slow', 'dependent']);
    assert.equal(requests.length, 3);
    const built = agent.composeInput({ transcript: requests[1].messages, request: 'q' });
    assert.deepEqual(built.input.filter((it) => it.type === 'function_call').map((it) => it.call_id), ['fast']);
    assert.deepEqual(built.input.filter((it) => it.type === 'function_call_output').map((it) => it.call_id), ['fast']);
    assert.ok(built.input.some((it) => it.type === 'message' && String(it.content).includes('slow')));
  } finally { slow.resolve({ ok: true, value: 11, delegatedCostUsd: 0.01, delegated: [{ id: 'child' }] }); await run; }
  const out = await run;
  assert.equal(out.text, 'Complete');
  assert.deepEqual(out.results.map((r) => r.id), ['fast', 'slow', 'dependent']);
  const finalInput = agent.composeInput({ transcript: requests[3].messages, request: 'q' });
  assert.deepEqual(finalInput.input.filter((it) => it.type === 'function_call_output').map((it) => it.call_id), ['fast', 'slow', 'dependent']);
  assert.deepEqual(finalInput.input.filter((it) => it.type === 'function_call').map((it) => it.call_id), ['fast', 'slow', 'dependent']);
  assert.deepEqual(out.results.map((r) => r.requestVersion), [19, 19, 19]);
  assert.equal(out.run.delegatedCostUsd, 0.01);
  assert.equal(out.run.delegatedTasks, 1);
  assert.equal(out.run.modelCalls, 4);
  assert.equal(out.trace.stepTiming[0].pendingAtUse, 1);
  assert.equal(out.trace.stepTiming[0].ran, 2);
});

test('shipped capability declarations admit isolated readers and keep portal state and map writers out', () => {
  const surface = makeAtlasToolSurface({
    capabilities: makeAtlasCapabilities(), independentReads: new Set(capabilityEntries(CAPABILITY_MODULES).filter((e) => e.independentRead).map((e) => e.id)),
  });
  const footprintOf = (id) => surface.footprintOf(call(id, 'run_capability', { id }));
  assert.equal(footprintOf('web.render').readOnly, false);
  assert.equal(footprintOf('web.search').readOnly, true);
  assert.equal(footprintOf('web.browse').readOnly, false);
  assert.notEqual(footprintOf('map.drawDataset').readOnly, true);
  assert.notEqual(footprintOf('data.gis').readOnly, true);
});

test('a superseded turn cannot dispatch a planned map write when its slow reader finishes', async () => {
  const slow = gate(), ctrl = new AbortController(), started = [];
  const run = makeAtlasAgent().runTurn({
    tools, footprint, messages, memoryTurn: 26, requestVersion: 'submission-2', signal: ctrl.signal,
    model: async ({ step }) => step === 0 ? reply(call('first', 'fast'), call('second', 'slow')) : reply(call('paint')),
    execute: async (c, facts) => {
      assert.equal(facts.requestVersion, 'submission-2');
      started.push(c.name);
      if (c.name === 'slow') return slow.promise;
      return { ok: true, value: 12 };
    },
  });
  try {
    await tick();
    assert.deepEqual(started, ['fast', 'slow']);
    ctrl.abort();
    const out = await run;
    assert.equal(out.stopped, 'aborted');
    assert.deepEqual(out.results.map((r) => r.id), ['first']);
    slow.resolve({ id: 'overridden', ok: true, value: 24, delegatedCostUsd: 0.03 });
    await tick();
    assert.deepEqual(started, ['fast', 'slow']);
    assert.equal(out.run.delegatedCostUsd, 0.03);
  } finally { ctrl.abort(); slow.resolve({ ok: true }); await run; }
});

test('a place geocoded after a newer request arrives cannot replace its pins or move its camera', async () => {
  let current = true, places = [], moves = 0, writes = 0;
  const lookup = gate(), started = gate();
  const verify = makeAtlasVerify({}, { L: (en) => en, esc: String });
  const pin = verify.makePinReplyPlaces({
    GE: () => ({ camera: { flyTo: () => { moves++; }, fitBounds: () => { moves++; } } }),
    GEOBJ: makeAtlasGeoObject(), L: (en) => en,
    geocode: () => { started.resolve(); return lookup.promise; },
    paintPois: () => true, getPois: () => places,
    setPois: (value) => { writes++; places = value; },
  });
  const run = pin([{ name: 'Port Esperance', kind: 'port' }], { isCurrent: () => current, placesDeclared: true });
  await started.promise;
  current = false;
  places = [{ name: 'Newer map', lng: 10, lat: 20 }];
  lookup.resolve({ name: 'Port Esperance', lng: 145.3, lat: -43.2 });
  assert.equal(await run, '');
  assert.deepEqual(places.map(({ name }) => name), ['Newer map']);
  assert.deepEqual([writes, moves], [0, 0]);
});
