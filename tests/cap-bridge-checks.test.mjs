/* ============================================================================
 *  cap-bridge — a program calls capabilities itself; the contract, the grants and the fences
 * ----------------------------------------------------------------------------
 *  The wire is exercised for real: a MessageChannel, and a worker_threads Worker that is given nothing but
 *  clientSource()'s text and one port — the same shape the browser Worker (and Pyodide's JS proxy) gets.
 *  The executor is a stand-in with the real contract (call, turn) -> mechanical result.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker, MessageChannel } from 'node:worker_threads';
import { makeCapabilityBridge, attachBridge, makeBridgeClient, clientSource, effectClass, canonicalKey, PROTOCOL } from '../js/cap-bridge.js';

const CAPS = [
  { id: 'data.gis', risk: 'read', effects: { writes: [] }, confirmation: 'none', ingests: '' },
  { id: 'research.brief', risk: 'read', effects: { writes: [] }, confirmation: 'none', ingests: 'external' },
  { id: 'map.drawDataset', risk: 'session', effects: { writes: ['map.object'] }, confirmation: 'none', ingests: '' },
  { id: 'settings.theme', risk: 'persist', effects: { writes: ['settings.theme'] }, confirmation: 'none', ingests: '' },
  { id: 'navigation.start', risk: 'external', effects: { writes: ['navigation'] }, confirmation: 'explicit', ingests: '' },
  { id: 'old.thing', risk: 'read', effects: { writes: [] }, withdrawn: { why: 'gone' } },
];
const registry = { resolve: (i) => CAPS.find((c) => c.id === i) || null, all: () => CAPS };

function rig(over) {
  const log = [];
  const turn = {};
  const execute = over && over.execute || (async (call, t) => {
    log.push({ id: call.arguments.id, args: call.arguments.args, ext: !!t.externalContentSeen });
    return { ok: true, capability: call.arguments.id, status: 'completed', echo: call.arguments.args };
  });
  const bridge = makeCapabilityBridge(Object.assign({ registry, execute, turn }, over || {}));
  const ch = new MessageChannel();
  attachBridge(ch.port1, bridge);
  const client = makeBridgeClient(ch.port2);
  return { bridge, client, log, turn, close: () => { ch.port1.close(); ch.port2.close(); } };
}

test('the class comes from what a capability does, in one function', () => {
  assert.deepEqual(CAPS.slice(0, 5).map(effectClass), ['read', 'read', 'state', 'persist', 'external']);
  assert.equal(effectClass(null), null);
});

test('permission: read by default; a wider grant is named, and a refusal happens before anything runs', async () => {
  const r = rig();
  assert.equal((await r.client.call('data.gis', { a: 1 })).ok, true);
  for (const id of ['map.drawDataset', 'settings.theme', 'navigation.start']) {
    const x = await r.client.call(id, {});
    assert.equal(x.ok, false); assert.equal(x.refused, 'not-granted'); assert.deepEqual(x.granted, ['read']);
  }
  assert.equal(r.log.length, 1, 'only the read executed');
  const w = rig({ grants: ['read', 'state'] });
  assert.equal((await w.client.call('map.drawDataset', {})).ok, true);
  assert.equal((await w.client.call('settings.theme', {})).refused, 'not-granted');
  r.close(); w.close();
});

test('the effect decomposition plugs in through effectsOf without touching anything else', async () => {
  const r = rig({ effectsOf: (c) => ({ class: c.id === 'data.gis' ? 'external' : 'read' }) });
  assert.equal((await r.client.call('data.gis', {})).class, 'external');
  assert.equal((await r.client.call('research.brief', {})).ok, true);
  r.close();
});

test('unknown, withdrawn, malformed and invalid requests are typed refusals', async () => {
  const errs = [];
  const r = rig({ schemaOf: () => ({ type: 'object' }), validate: (s, a, p, e) => { if (a.bad) e.push('bad is not allowed'); } });
  assert.equal((await r.client.call('nope.nope', {})).refused, 'unknown-capability');
  assert.equal((await r.client.call('old.thing', {})).refused, 'unknown-capability');
  const inv = await r.client.call('data.gis', { bad: 1 });
  assert.equal(inv.refused, 'invalid-arguments'); assert.deepEqual(inv.errors, ['bad is not allowed']);
  assert.equal((await r.client.call('data.gis', [1])).refused, 'invalid-arguments');
  assert.equal((await r.bridge.handle({ v: 9, kind: 'call' })).refused, 'bad-request');
  assert.equal(r.log.length, 0, 'nothing ran'); void errs; r.close();
});

test('describe and list carry the schema, the class and whether this run may call it', async () => {
  const r = rig({ schemaOf: (id) => ({ type: 'object', title: id }) });
  const d = await r.client.describe('map.drawDataset');
  assert.equal(d.class, 'state'); assert.equal(d.granted, false); assert.equal(d.schema.title, 'map.drawDataset');
  const l = await r.client.list('data.');
  assert.ok(l.capabilities.some((c) => c.id === 'data.gis' && c.granted));
  assert.ok(!l.capabilities.some((c) => c.id === 'old.thing'));
  r.close();
});

test('the same call twice is answered from the record — not re-run and not dropped', async () => {
  const r = rig();
  const a = await r.client.call('data.gis', { x: 1, y: { b: 2, a: 1 } });
  const b = await r.client.call('data.gis', { y: { a: 1, b: 2 }, x: 1 });      /* same arguments, other key order */
  assert.equal(r.log.length, 1);
  assert.equal(b.alreadyDone, true); assert.equal(b.ofSeq, a.seq); assert.deepEqual(b.result, a.result);
  const c = await r.client.call('data.gis', { x: 2 });                          /* different: runs */
  assert.equal(c.alreadyDone, undefined); assert.equal(r.log.length, 2);
  const [p, q] = await Promise.all([r.client.call('data.gis', { z: 1 }), r.client.call('data.gis', { z: 1 })]);
  assert.equal(r.log.length, 3, 'two in-flight identical calls share one run');
  assert.equal(p.alreadyDone === true || q.alreadyDone === true, true);
  assert.equal(canonicalKey('a', { b: 1, a: 2 }), canonicalKey('a', { a: 2, b: 1 }));
  const s = r.bridge.summary(); assert.equal(s.executed, 3); assert.equal(s.repeats, 2);
  r.close();
});

test('the call fence refuses with a reason; repeats are not counted against it', async () => {
  const r = rig({ limits: { maxCalls: 3 } });
  for (let i = 0; i < 3; i++) assert.equal((await r.client.call('data.gis', { i })).ok, true);
  assert.equal((await r.client.call('data.gis', { i: 0 })).alreadyDone, true);
  const over = await r.client.call('data.gis', { i: 99 });
  assert.equal(over.refused, 'call-limit'); assert.equal(over.limit, 3);
  assert.equal(r.bridge.summary().refused['call-limit'], 1);
  r.close();
});

test('the deadline and cancel() refuse later calls; a call cut off mid-flight is not observed, not failed', async () => {
  let t = 0;
  const d = rig({ now: () => t, limits: { deadlineMs: 100 } });
  assert.equal((await d.client.call('data.gis', { a: 1 })).ok, true);
  t = 101;
  assert.equal((await d.client.call('data.gis', { a: 2 })).refused, 'deadline');
  d.close();

  let release; const gate = new Promise((res) => { release = res; });
  const r = rig({ execute: async () => { await gate; return { ok: true }; } });
  const pend = r.client.call('data.gis', { slow: 1 });
  await new Promise((res) => setTimeout(res, 10));
  r.bridge.cancel('the run was stopped');
  release();
  const cut = await pend;
  assert.equal(cut.ok, false); assert.equal(cut.observed, false); assert.equal(cut.why, 'cancelled');
  assert.equal((await r.client.call('data.gis', { b: 1 })).refused, 'cancelled');
  assert.equal(r.bridge.summary().unobserved, 1);
  r.close();
});

test('an executor that throws is not observed (execute-threw), never a verdict on the capability', async () => {
  const r = rig({ execute: async () => { throw new Error('boom'); } });
  const x = await r.client.call('data.gis', {});
  assert.equal(x.ok, false); assert.equal(x.observed, false); assert.equal(x.why, 'execute-threw'); assert.match(x.detail, /boom/);
  r.close();
});

test('outside text taints the rest of the run, and only the executor decides what that means', async () => {
  const r = rig();
  await r.client.call('data.gis', { n: 1 });
  await r.client.call('research.brief', { n: 1 });
  await r.client.call('data.gis', { n: 2 });
  assert.deepEqual(r.log.map((l) => l.ext), [false, false, true]);
  assert.equal(r.bridge.summary().externalContentSeen, true);
  r.close();
});

test('a Worker given only clientSource() and a port runs a 500-call program; only the final value comes out', async () => {
  const ports = new MessageChannel();
  const bridge = makeCapabilityBridge({ registry, turn: {}, execute: async (call) => ({ ok: true, capability: call.arguments.id,
    nearest: call.arguments.args.city * 2 }) });
  attachBridge(ports.port1, bridge);
  const program = `
    const { workerData, parentPort } = require('node:worker_threads');
    const make = ${clientSource()};
    const intmap = make(workerData.port);
    (async () => {
      const cities = Array.from({ length: 500 }, (_, i) => i);
      const rows = await Promise.all(cities.map((c) => intmap.call('data.gis', { city: c })));   /* intermediate results stay here */
      const total = rows.reduce((s, r) => s + r.result.nearest, 0);
      parentPort.postMessage({ final: total, calls: rows.length, pending: intmap.pending() });
    })();`;
  const w = new Worker(program, { eval: true, workerData: { port: ports.port2 }, transferList: [ports.port2] });
  const out = await new Promise((res, rej) => { w.once('message', res); w.once('error', rej); });
  await w.terminate(); ports.port1.close();
  assert.equal(out.calls, 500); assert.equal(out.final, 2 * (499 * 500 / 2)); assert.equal(out.pending, 0);
  const s = bridge.summary();
  assert.equal(s.executed, 500); assert.deepEqual(s.byCapability, { 'data.gis': 500 }); assert.deepEqual(s.byClass, { read: 500 });
});

test('clientSource() evaluates with nothing in scope', () => {
  const make = new Function('return ' + clientSource())();
  const sent = []; const port = { postMessage: (m) => sent.push(m) };
  const c = make(port); c.call('data.gis', { a: 1 });
  assert.deepEqual(sent[0], { v: PROTOCOL.version, seq: 1, kind: 'call', capability: 'data.gis', args: { a: 1 } });
});
