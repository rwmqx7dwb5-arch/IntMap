/* ============================================================================
 *  ptc-python-bridge — the Python program calls capabilities itself (Programmatic Tool Calling)
 * ----------------------------------------------------------------------------
 *  js/cap-bridge.js is the contract (PR #1276), js/compute-sandbox.js is the Python worker (#1272). This file
 *  holds what joins them, in Node: the port is handed to the worker with the job, the client text is written into
 *  the worker's source (eval is closed there, so it cannot arrive as a string), the program's calls are answered by
 *  the real bridge, the history of those calls comes back and is kept on every output, and the compute.run row
 *  opens the bridge through the SAME executor a model's run_capability goes through. Pyodide itself — `await
 *  cap_call(...)` from real Python — is measured by tests/compute-sandbox.spec.js (the browser half).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { makeCapabilityBridge, attachBridge, makeBridgeClient, clientSource, PROTOCOL, REFUSALS } from '../js/cap-bridge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeComputeSandbox } = await import('../js/compute-sandbox.js');
const { makeGisDatasets } = await import('../js/gis-datasets.js');
const computeEntries = (await import('../js/atlas-cap-compute.js')).default;

const CAPS = [
  { id: 'data.value', risk: 'read', effects: { writes: [] }, confirmation: 'none', ingests: '' },
  { id: 'map.drawDataset', risk: 'session', effects: { writes: ['map.object'] }, confirmation: 'none', ingests: '' },
  { id: 'compute.run', risk: 'session', effects: { writes: ['gis.dataset'] }, confirmation: 'none', ingests: '' },
];
const registry = { resolve: (i) => CAPS.find((c) => c.id === i) || null, all: () => CAPS };
const okExec = async (call) => ({ ok: true, capability: call.arguments.id, status: 'completed', text: 'pop=' + JSON.stringify(call.arguments.args) });

function wire(over) {
  const bridge = makeCapabilityBridge(Object.assign({ registry, execute: okExec, turn: {} }, over || {}));
  const ch = new MessageChannel();
  attachBridge(ch.port1, bridge);
  return { bridge, client: makeBridgeClient(ch.port2), close: () => { ch.port1.close(); ch.port2.close(); } };
}

test('① the protocol gained one read-only kind, and every refusal it states is a published name', async () => {
  assert.ok(PROTOCOL.kinds.includes('dataset'));
  assert.ok(REFUSALS.includes('unknown-dataset'));
  const rows = { d1: { id: 'd1', kind: 'vector', features: [{ type: 'Feature', geometry: null, properties: { a: 1 } }] } };
  const r = wire({ readDataset: async (id) => rows[id] || null });
  const ok = await r.client.dataset('d1');
  assert.equal(ok.ok, true); assert.equal(ok.dataset.features[0].properties.a, 1);
  const no = await r.client.dataset('zz');
  assert.equal(no.ok, false); assert.equal(no.refused, 'unknown-dataset');
  r.close();
  /* a run granted nothing cannot read the session either */
  const none = wire({ grants: [], readDataset: async () => ({}) });
  assert.equal((await none.client.dataset('d1')).refused, 'not-granted');
  none.close();
  /* a reader that throws is an unobserved read, never a failure of the dataset */
  const th = wire({ readDataset: async () => { throw new Error('boom'); } });
  const t = await th.client.dataset('d1');
  assert.equal(t.ok, false); assert.equal(t.observed, false);
  assert.equal(th.bridge.summary().unobserved, 1);
  th.close();
  /* without a reader the bridge says so instead of answering 「無い」 for a dataset it never looked for */
  const nr = wire({});
  const x = await nr.client.dataset('d1');
  assert.equal(x.refused, 'unknown-dataset'); assert.match(String(x.detail), /without a dataset reader/);
  nr.close();
});

test('② the history: every call, refusal and repeat is logged; what is not logged is counted, not hidden', async () => {
  const r = wire({ forbid: (c) => c.id === 'compute.run' ? 'one interpreter per run' : null, limits: { logMax: 4 } });
  await r.client.call('data.value', { country: 'JP' });
  await r.client.call('data.value', { country: 'JP' });            /* the same call: answered, not re-run */
  await r.client.call('map.drawDataset', {});                      /* not granted */
  const f = await r.client.call('compute.run', { code: 'x=1' });   /* forbidden by the host */
  assert.equal(f.refused, 'not-granted'); assert.match(String(f.detail), /one interpreter/);
  await r.client.call('data.value', { country: 'FR' });            /* the 5th: past logMax 4 */
  const calls = r.bridge.calls();
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => c.refused || (c.alreadyDone ? 'repeat' : 'ran')), ['ran', 'repeat', 'not-granted', 'not-granted']);
  assert.equal(r.bridge.logOmitted(), 1);
  const s = r.bridge.summary();
  assert.equal(s.executed, 2); assert.equal(s.repeats, 1); assert.equal(s.logged, 4); assert.equal(s.logOmitted, 1);
  assert.ok(calls.every((c) => typeof c.ms === 'number' && typeof c.seq === 'number'));
  r.close();
});

/* A stand-in Worker that does what the real worker's bridge function does: it receives the port WITH the job and
   speaks the real client protocol over it. The host under test is the real one. */
function bridgedWorker(program) {
  return class {
    constructor(url) { this.url = url; this.dead = false; }
    postMessage(m, transfer) {
      this.transfer = transfer || null;
      if (m && m.t === 'run') setTimeout(async () => {
        const client = m.port ? makeBridgeClient(m.port) : null;
        this.send({ t: 'phase', phase: 'run' });
        try { const outputs = await program(client, m); this.send({ t: 'done', ok: true, observed: true, outputs, packages: [], python: '3.14.0' }); }
        catch (e) { this.send({ t: 'done', ok: false, observed: true, why: 'python-exception', detail: { type: 'Error', message: String(e) } }); }
      }, 0);
    }
    send(m) { if (!this.dead && this.onmessage) this.onmessage({ data: m }); }
    terminate() { this.dead = true; }
  };
}
function handle(over) {
  const ch = new MessageChannel();
  const bridge = makeCapabilityBridge(Object.assign({ registry, execute: okExec, turn: {} }, over || {}));
  attachBridge(ch.port1, bridge);
  return { port: ch.port2, source: clientSource(), bridge, close: () => { ch.port1.close(); ch.port2.close(); } };
}

test('③ the host hands the worker the port and the client, and what the program did comes back as history on every output', async () => {
  const seen = {};
  const W = bridgedWorker(async (client) => {
    const results = [];
    for (const c of ['Japan', 'France', 'Brazil']) results.push((await client.call('data.value', { country: c })).result.text);
    const denied = await client.call('map.drawDataset', {});
    seen.denied = denied.refused;
    return { result: JSON.stringify({ v: results.map((t, i) => ({ i, t })), nf: 0 }) };
  });
  const D = makeGisDatasets();
  const C = makeComputeSandbox({ Worker: W, registry: D, publish: false });
  const h = handle();
  const r = await C.run({ code: 'result = 1', title: 'ptc' }, { bridge: h });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(seen.denied, 'not-granted', 'a class outside the grant is refused before anything runs');
  assert.equal(r.bridge.summary.executed, 3);
  assert.equal(r.bridge.calls.length, 4);
  assert.deepEqual(r.bridge.grants, ['read']);
  assert.match(r.bridge.logSha256, /^[0-9a-f]{64}$/);
  const rec = D.get(r.datasets[0].id);
  assert.deepEqual(rec.provenance.bridge.grants, ['read'], 'the record says what the code was allowed to do');
  assert.equal(rec.provenance.bridge.summary.executed, 3);
  assert.equal(rec.provenance.bridge.logSha256, r.bridge.logSha256);
  assert.ok(!('calls' in rec.provenance.bridge), 'the record keeps the summary, not thousands of lines');
  h.close();
});

test('④ a failed run still reports what the program had done; no handle means no port and no bridge key', async () => {
  const W = bridgedWorker(async (client) => { await client.call('data.value', { country: 'JP' }); throw new Error('later failure'); });
  const C = makeComputeSandbox({ Worker: W, registry: makeGisDatasets(), publish: false });
  const h = handle();
  const bad = await C.run({ code: 'x=1' }, { bridge: h });
  assert.equal(bad.ok, false); assert.equal(bad.why, 'python-exception');
  assert.equal(bad.bridge.summary.executed, 1, 'the call that ran is on the record of the run that failed');
  h.close();
  let sawPort = null;
  const W2 = bridgedWorker(async (client, m) => { sawPort = !!m.port; return { result: JSON.stringify({ v: 1, nf: 0 }) }; });
  const r2 = await makeComputeSandbox({ Worker: W2, registry: makeGisDatasets(), publish: false }).run({ code: 'result = 1' });
  assert.equal(sawPort, false); assert.equal(r2.bridge, null);
});

test('⑤ the worker source carries the client text, the Python side exists, and it still parses on its own', () => {
  const C = makeComputeSandbox({ Worker: bridgedWorker(async () => ({})), registry: makeGisDatasets(), publish: false });
  const plain = C.workerSource();
  const withBridge = C.workerSource(clientSource());
  assert.doesNotThrow(() => new Function(plain));
  assert.doesNotThrow(() => new Function(withBridge));
  assert.ok(withBridge.includes('makeBridgeClient'), 'the client text is part of the worker source');
  assert.match(plain, /, null\);\s*$/, 'without a bridge the third argument is null');
  const src = C.prelude();
  for (const n of ['cap_call', 'cap_call_many', 'cap_list', 'cap_describe', 'cap_dataset', 'cap_rows', '_im_ask']) assert.match(src, new RegExp('def ' + n + '\\('), n);
  assert.match(src, /_IM_BRIDGE is None/, 'a run without the bridge says why cap_call cannot work, in Python');
  assert.match(withBridge, /_IM_BRIDGE/);
  /* the bridge function in the worker answers only the five kinds the protocol has */
  for (const k of PROTOCOL.kinds) assert.match(withBridge, new RegExp("kind === '" + k + "'"), k);
});

test('⑥ compute.run: no grants → no bridge; grants → the SAME executor, the run\'s turn, a host-forbidden compute.run, closed afterwards', async () => {
  const entry = computeEntries[0];
  const opened = [];
  const closes = [];
  const K = {
    R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), warn: (s) => s, esc: (s) => String(s), L: (a, b) => b || a,
    programBridge: (opts) => {
      opened.push(opts);
      const ch = new MessageChannel();
      const bridge = makeCapabilityBridge({ registry, execute: okExec, turn: opts.turn, grants: opts.grants, forbid: opts.forbid, readDataset: opts.readDataset });
      attachBridge(ch.port1, bridge);
      return { port: ch.port2, source: clientSource(), bridge, close: () => { closes.push(1); ch.port1.close(); ch.port2.close(); } };
    },
  };
  const D = makeGisDatasets();
  D.add({ id: 'in1', title: 'in1', features: [{ type: 'Feature', geometry: null, properties: { n: 7 } }] });
  const got = {};
  globalThis.IntMapLazy = { need: async () => { } };
  globalThis.IntMapData = D;
  const sbx = makeComputeSandbox({ Worker: bridgedWorker(async (client, m) => {
    got.hadPort = !!m.port;
    if (client) {
      const rows = await client.dataset('in1'); got.rows = rows.dataset && rows.dataset.features.length;
      got.nested = (await client.call('compute.run', { code: 'x=1' })).refused;
      got.stale = (await client.dataset('nope')).refused;
    }
    return { result: JSON.stringify({ v: 5, nf: 0 }) };
  }), registry: D, publish: false });
  globalThis.IntMapCompute = sbx;
  const turn = { externalContentSeen: false };

  const plain = await entry.run({ code: 'result = 5' }, turn, K);
  assert.equal(plain.ok, true); assert.equal(opened.length, 0, 'a run granted nothing opens nothing'); assert.equal(got.hadPort, false);

  const r = await entry.run({ code: 'result = 5', grants: ['read', 'persist', 'bogus'] }, turn, K);
  assert.equal(r.ok, true, r.html);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].turn, turn, 'the program reads and sets the SAME turn record the model\'s calls do');
  assert.deepEqual(opened[0].grants, ['read'], 'only the classes the schema offers are granted — persist and external are not reachable from here');
  assert.equal(got.hadPort, true); assert.equal(got.rows, 1); assert.equal(got.nested, 'not-granted'); assert.equal(got.stale, 'unknown-dataset');
  assert.deepEqual(closes, [1], 'the port is closed when the run ends');
  assert.match(r.html, /Capability calls|能力の呼び出し/);
  assert.equal(r.meta.compute.bridge.summary.executed, 0);
  assert.deepEqual(r.meta.compute.bridge.grants, ['read']);
});

test('⑦ the row, the schema, the catalogue text and the wiring all say the same thing', () => {
  const entry = computeEntries[0];
  assert.deepEqual(entry.schema().properties.grants.items.enum, ['read', 'state']);
  const doc = entry.doc[0].text;
  for (const w of ['cap_call', 'cap_call_many', 'cap_describe', 'cap_rows', 'alreadyDone', 'needs_confirm', '"grants"']) assert.ok(doc.includes(w), 'the catalogue text no longer says ' + w);
  assert.match(R('js/atlas-console.js'), /get programBridge\(\)\{ return \(opts\)=>TOOLS\.openProgramBridge\(TOOLS\.baseTools\(\), AGENT, opts\); \}/);
  assert.match(R('js/atlas-toolsurface.js'), /forbid: opts\.forbid, readDataset: opts\.readDataset/);
  assert.match(R('js/atlas-cap-compute.js'), /compute\.run/);
});
