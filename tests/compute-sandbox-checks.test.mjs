/* ============================================================================
 *  compute-sandbox — Atlas runs Python (Pyodide) in an isolated Worker and gets datasets back
 * ----------------------------------------------------------------------------
 *  What Node CAN hold without a browser: the request contract, what a returned value becomes, the
 *  provenance, the line between 「観測された失敗」 and 「観測できなかった」 (driven through a stand-in
 *  Worker that speaks the real message protocol), the capability row, the CSP, the deny-list the
 *  worker closes, and the two neighbours this round touched (js/gis-datasets.js's edit gate and
 *  js/gis-project.js's re-run and manifest). Pyodide itself is measured in a browser by
 *  tests/compute-sandbox.spec.js and in dev-notes/2026-11-19-compute-sandbox.md.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const { makeComputeSandbox } = await import('../js/compute-sandbox.js');
const { makeGisDatasets } = await import('../js/gis-datasets.js');

/* A stand-in for the browser's Worker that speaks the host's protocol. `script` decides what the
   "worker" answers once it is sent its job; the host under test is the real one. */
function fakeWorker(script) {
  return class {
    constructor(url) { this.url = url; this.dead = false; }
    postMessage(m) { if (m && m.t === 'run') setTimeout(() => script(this, m.job), 0); }
    send(m) { if (!this.dead && this.onmessage) this.onmessage({ data: m }); }
    terminate() { this.dead = true; }
  };
}
function sandbox(script, registry) {
  return makeComputeSandbox({ Worker: fakeWorker(script), registry: registry || makeGisDatasets(), publish: false });
}

test('① the request is refused before a worker exists when it cannot run, and says why', () => {
  const D = makeGisDatasets();
  const C = makeComputeSandbox({ registry: D, publish: false, Worker: fakeWorker(() => { throw new Error('must not start'); }) });
  assert.equal(C.validate({}).why, 'code-missing');
  assert.equal(C.validate({ code: '   ' }).why, 'code-missing');
  const L = C.limits();
  const long = C.validate({ code: 'x'.repeat(L.codeMaxChars + 1) });
  assert.equal(long.why, 'code-too-long');
  assert.equal(long.detail.max, L.codeMaxChars);
  assert.equal(C.validate({ code: 'x=1', outputs: ['ok', 'not-an-identifier'] }).why, 'outputs-invalid');
  D.add({ id: 'csv-a', title: 'a table', features: [{ type: 'Feature', geometry: null, properties: { v: 1 } }] });
  const miss = C.validate({ code: 'x=1', inputs: ['nope'] });
  assert.equal(miss.why, 'no-such-dataset');
  assert.deepEqual(miss.detail.available, [{ id: 'csv-a', title: 'a table' }], 'the refusal lists what exists, so the next call is not a guess');
  assert.equal(miss.observed, true, 'a refusal is an observation about the request');
  assert.equal(C.validate({ code: 'x=1', inputs: ['a table'] }).inputs[0].id, 'csv-a', 'a title names a dataset as well as an id');
  D.invalidate('csv-a', 'upstream-failed');
  assert.equal(C.validate({ code: 'x=1', inputs: ['csv-a'] }).why, 'input-stale', 'a stale input is refused the way js/gis-ops.js refuses it');
  const ok = C.validate({ code: 'x=1' });
  assert.deepEqual(ok.outputs, ['result']);
  assert.equal(ok.outputsNamed, false);
  assert.equal(ok.execMs, L.execDefaultMs);
  assert.equal(C.validate({ code: 'x=1', timeoutSec: 99999 }).execMs, L.execMaxMs, 'a longer limit is clamped to the fence');
});

test('② what comes back: a table or GeoJSON becomes a dataset, anything else is a value, a bad geometry is refused by name', () => {
  const C = sandbox(() => { });
  assert.equal(C.classify(3.5).kind, 'value');
  assert.equal(C.classify({ slope: 2 }).kind, 'value');
  assert.equal(C.classify([]).kind, 'value', 'an empty list states no rows and no columns — it is not invented into a table');
  const t = C.classify([{ a: 1 }, { a: 2 }]);
  assert.equal(t.kind, 'dataset');
  assert.equal(t.features[0].geometry, null, 'rows without geometry are features with geometry null (js/gis-datasets.js has no third payload)');
  const fc = C.classify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { k: 1 } }] });
  assert.equal(fc.kind, 'dataset');
  assert.equal(C.classify([{ type: 'Feature', geometry: { type: 'Point', coordinates: [139.7, 35.6] }, properties: null }]).features[0].properties.constructor, Object);
  const proj = C.classify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [500000, 4000000] }, properties: {} }] });
  assert.equal(proj.why, 'output-not-lonlat', 'a projected metre would be a false statement under crs EPSG:4326');
  assert.equal(proj.detail.index, 0);
  assert.equal(C.classify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Blob', coordinates: [] } }] }).why, 'output-invalid');
  assert.equal(C.classify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], ['x', 1]] } }] }).why, 'output-invalid');
  assert.equal(C.classify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: 7 }] }).why, 'output-invalid');
});

test('③ a dataset reaches the code as JSON: features for a vector, samples for a grid', () => {
  const D = makeGisDatasets();
  const C = sandbox(() => { }, D);
  const v = D.add({ title: 'v', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { n: 3 } }] });
  const pv = C.payloadOf(v);
  assert.equal(pv.kind, 'vector');
  assert.equal(pv.features.length, 1);
  assert.deepEqual(pv.fields.map((f) => f.name), ['n']);
  const g = D.add({ kind: 'raster', title: 'g', width: 2, height: 1, grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 }, bands: [{ name: 'b' }], read: () => new Float32Array([1, NaN]) });
  const pg = C.payloadOf(g);
  assert.equal(pg.kind, 'raster');
  assert.equal(JSON.stringify(pg.bands[0].values), '[1,null]', 'a missing sample travels as null, the way JSON writes NaN');
});

test('④ observed failures and unobserved outcomes are different answers (one-pass-or-a-reason §5)', async () => {
  const R0 = sandbox((w) => { w.send({ t: 'phase', phase: 'packages' }); w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: false, why: 'python-exception', detail: { type: 'ValueError', message: 'bad' }, stdout: 'x', stderr: '' }); });
  const ex = await R0.run({ code: 'raise ValueError("bad")' });
  assert.equal(ex.ok, false); assert.equal(ex.why, 'python-exception'); assert.equal(ex.observed, true);
  assert.equal(ex.detail.type, 'ValueError'); assert.equal(ex.stdout, 'x');

  const boot = await sandbox((w) => w.send({ t: 'boot-failed', detail: 'integrity mismatch' })).run({ code: 'x=1' });
  assert.equal(boot.why, 'runtime-unavailable'); assert.equal(boot.observed, false, 'the code never ran, so nothing is known of it');

  /* ⚠ the clock is armed ONCE: code that keeps announcing 「始めます」 cannot keep itself alive */
  const t0 = Date.now();
  const to = await sandbox((w) => {
    w.send({ t: 'phase', phase: 'run' });
    const iv = setInterval(() => { if (w.dead) { clearInterval(iv); return; } w.send({ t: 'phase', phase: 'run' }); }, 100);
  }).run({ code: 'while True: pass', timeoutSec: 1 });
  assert.equal(to.why, 'timeout'); assert.equal(to.observed, false); assert.equal(to.phase, 'run');
  assert.ok(Date.now() - t0 < 3000, 'a re-sent phase message re-armed the time limit');

  const forged = await sandbox((w) => { w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: false, why: 'cancelled' }); }).run({ code: 'x=1' });
  assert.equal(forged.why, 'output-invalid', 'a message cannot declare its own outcome unobserved — the host classifies');
  assert.equal(forged.observed, true);

  const died = await sandbox((w) => { w.send({ t: 'phase', phase: 'run' }); w.onerror({ message: 'out of memory' }); }).run({ code: 'x=1' });
  assert.equal(died.why, 'worker-died'); assert.equal(died.observed, false);

  const ac = new AbortController();
  const p = sandbox((w) => w.send({ t: 'phase', phase: 'run' })).run({ code: 'x=1' }, { signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  const c = await p;
  assert.equal(c.why, 'cancelled'); assert.equal(c.observed, false);

  const r = C_reasons();
  for (const w of ['timeout', 'runtime-unavailable', 'runtime-load-timeout', 'worker-died', 'cancelled']) assert.ok(r.unobserved.includes(w), w);
  for (const w of ['python-exception', 'output-missing', 'output-invalid', 'output-not-lonlat', 'output-too-large', 'package-unavailable']) assert.ok(r.failures.includes(w), w);
});
function C_reasons() { return sandbox(() => { }).reasons(); }

test('⑤ a successful run registers its outputs, with the code as their recipe', async () => {
  const D = makeGisDatasets();
  D.add({ id: 'csv-1', title: 'csv', features: [{ type: 'Feature', geometry: null, properties: { x: 1, y: 2 } }] });
  let sent = null;
  const C = sandbox((w, job) => {
    sent = job;
    w.send({ t: 'phase', phase: 'run' });
    w.send({ t: 'done', ok: true, observed: true, python: '3.14.2', packages: ['numpy'],
      outputs: { result: JSON.stringify({ v: [{ x: 1, fit: 2.5 }], nf: 0 }), coef: JSON.stringify({ v: { slope: 2, r2: null }, nf: 1 }) },
      stdout: 'hi', stderr: '', timings: { bootMs: 1, packagesMs: 1, runMs: 1 } });
  }, D);
  const r = await C.run({ code: 'result=...\ncoef=...', inputs: ['csv-1'], outputs: ['result', 'coef'], title: 'OLS' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(JSON.parse(sent.inputsJson)[0].id, 'csv-1', 'the inputs crossed as one JSON document');
  assert.deepEqual(sent.outputs, ['result', 'coef']);
  assert.equal(r.datasets.length, 1);
  assert.equal(r.values.coef.value.slope, 2);
  assert.equal(r.values.coef.nonFinite, 1, 'a NaN that became null is counted, not hidden');
  const rec = D.get(r.datasets[0].id);
  assert.equal(rec.title, 'OLS · result');
  const p = rec.provenance;
  assert.equal(p.kind, 'compute');
  assert.equal(p.code, 'result=...\ncoef=...', 'the code is kept whole — every record can be re-run');
  assert.match(String(p.codeSha256), /^[0-9a-f]{64}$/);
  assert.deepEqual(p.inputs, ['csv-1']);
  assert.equal(p.output, 'result');
  assert.equal(p.runtime, 'pyodide@' + C.runtime().version);
  assert.deepEqual(D.lineage(rec.id).map((x) => x.id), ['csv-1', rec.id], 'the record is downstream of its inputs');
  /* the edit gate: the output of a recipe is not edited, whichever kind of recipe it is */
  const e = D.editValues(rec.id, [{ index: 0, field: 'x', value: 9 }]);
  assert.equal(e.why, 'edit-would-contradict-recipe');
  assert.equal(e.detail.kind, 'compute');

  /* a named output the code did not bind is a fact about the code */
  const m = await sandbox((w) => { w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: false, why: 'output-missing', detail: { name: 'res' } }); }, D).run({ code: 'x=1', outputs: ['res'] });
  assert.equal(m.why, 'output-missing'); assert.equal(m.observed, true);

  /* rerun puts the answer back under the record's own id */
  const C2 = sandbox((w) => { w.send({ t: 'phase', phase: 'run' }); w.send({ t: 'done', ok: true, outputs: { result: JSON.stringify({ v: [{ x: 7 }], nf: 0 }) } }); }, D);
  const id = rec.id;
  D.remove(id);
  const rr = await C2.rerun({ id, title: 'OLS · result', provenance: p });
  assert.equal(rr.ok, true, JSON.stringify(rr));
  assert.equal(D.get(id).features()[0].properties.x, 7);
});

test('⑥ the worker source: fetch is gated before Pyodide loads, the scrub runs before the code, and every door it names is closed', () => {
  const C = sandbox(() => { });
  const src = C.workerSource();
  const at = (s) => { const i = src.indexOf(s); assert.ok(i >= 0, 'missing: ' + s); return i; };
  assert.ok(at("pin(G, 'fetch', gatedFetch)") < at('G.loadPyodide('), 'fetch must be replaced before any Pyodide byte runs');
  assert.ok(at('var open = scrub();') < at("post({ t: 'ready'"), 'the scrub runs before the worker says it is ready');
  assert.ok(at('ready.then(function () { if (py) return runJob(m.job); })') > 0, 'a job runs only after ready, and only with an interpreter');
  /* the deny-list, held to docs/SECURITY-ARCHITECTURE.md §6 so the two cannot drift apart */
  const DOORS = ['indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'XMLHttpRequest', 'WebSocket', 'EventSource',
    'WebTransport', 'Notification', 'importScripts', 'loadPyodide', 'FontFace'];
  const sec = R('docs/SECURITY-ARCHITECTURE.md');
  for (const d of DOORS) {
    assert.match(src, new RegExp("'" + d + "'"), 'the worker no longer closes ' + d);
    assert.ok(sec.includes('`' + d + '`'), 'docs/SECURITY-ARCHITECTURE.md §6 no longer names ' + d);
  }
  for (const n of ['locks', 'storage']) assert.match(src, new RegExp("'" + n + "'"));
  assert.match(src, /credentials: 'omit'/);
  assert.match(src, /redirect: 'error'/);
  assert.match(src, /'sha256-' \+ hexToB64\(p\.sha256\)/, 'packages are pinned by the hash the verified lock states');
  /* the text the Blob is made of parses as a script on its own (it runs in a realm with none of this module) */
  assert.doesNotThrow(() => new Function(src));
});

test('⑦ the runtime is pinned: one version, five core files with SRI hashes, served from that version path', () => {
  const C = sandbox(() => { });
  const rt = C.runtime();
  assert.match(rt.version, /^\d+\.\d+\.\d+$/);
  assert.equal(rt.base, 'https://cdn.jsdelivr.net/pyodide/v' + rt.version + '/full/');
  assert.deepEqual(Object.keys(rt.files).sort(), ['pyodide-lock.json', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'pyodide.js', 'python_stdlib.zip']);
  for (const [f, h] of Object.entries(rt.files)) assert.match(h, /^sha256-[A-Za-z0-9+/]{43}=$/, f);
});

test('⑧ the CSP gains nothing: Pyodide runs from blob: after an integrity-checked fetch, so no CDN host is admitted', () => {
  const html = R('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const dir = (name) => (new RegExp('(?:^|; )' + name + ' ([^;]+)').exec(csp) || [])[1] || '';
  const scriptSrc = dir('script-src').split(/\s+/);
  assert.ok(scriptSrc.includes('blob:'), 'the worker executes the verified bytes from blob:');
  assert.ok(!scriptSrc.some((s) => /jsdelivr|pyodide/.test(s)), 'script-src must not admit the CDN — 17.3 「新しい CDN ホストを CSP に足さない」');
  assert.ok(dir('worker-src').split(/\s+/).includes('blob:'));
  assert.ok(dir('connect-src').split(/\s+/).includes('https:'), 'the integrity-checked fetches ride connect-src');
  assert.ok(!/pyodide|jsdelivr/.test(/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(R('admin.html'))[1]), 'admin.html is untouched');
});

test('⑨ gis-worker keeps its premise: its pool runs only this repository\'s jobs, and the sandbox is a different worker', () => {
  const gw = R('js/gis-worker.js'), cs = R('js/compute-sandbox.js');
  assert.ok(!/compute-sandbox|IntMapCompute/.test(codeOnly(gw)), 'js/gis-worker.js code must not reach the sandbox');
  assert.ok(!/IntMapGisWorker|\.register\(/.test(codeOnly(cs)), 'the sandbox must not route code through js/gis-worker.js register()');
  assert.match(gw, /register\(\) IS NOT A DOOR FOR TEXT FROM OUTSIDE/);
});

test('⑩ the capability row: one row, closed table, the columns this round decided', async () => {
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const c = caps.resolve('compute.run');
  assert.ok(c, 'compute.run is in the registry');
  const row = (await import('../js/atlas-cap-compute.js')).default[0].row;
  assert.deepEqual(row.slice(0, 11), ['compute.run', 'python', 'runPython,pythonRun,computePython', 'data', 'none', 'gis.dataset', 'explanation', 'session', 'none', '', 'gisCore']);
  assert.equal(caps.dispatchName ? caps.dispatchName('python') : 'python', 'python');
  const mods = R('js/atlas-caps-modules.js');
  assert.match(mods, /import caps_compute from '\.\/atlas-cap-compute\.js';/);
  assert.match(R('js/atlas-capabilities.js'), /THE ONE EXCEPTION, AND WHERE ITS EDGE IS \(compute-sandbox\)/);
  /* the observer: a run that could not be seen to finish is 「観測できなかった」, not 「失敗した」 */
  const v = caps.OBSERVERS.none.verify(null, {}, null, null, { ok: false, html: 'x', meta: { unobserved: 'timeout', code: 'timeout' } });
  assert.equal(v.status, 'unobserved'); assert.equal(v.code, 'timeout');
  const f = caps.OBSERVERS.none.verify(null, {}, null, null, { ok: false, html: 'x', meta: { code: 'python-exception' } });
  assert.equal(f.status, 'failed');
});

test('⑪ the project: a Python record is saved as a body with its recipe, re-run when its input is recomputed, and traced as a recipe', async () => {
  const D = makeGisDatasets();
  globalThis.window.IntMapData = D;
  const { makeGisProject } = await import('../js/gis-project.js');
  const P = makeGisProject();
  /* an op upstream, stood in by the one door setParams calls */
  D.add({ id: 'src', title: 'src', features: [1, 2, 3, 4].map((v) => ({ type: 'Feature', geometry: null, properties: { v } })), provenance: { kind: 'import', file: 'x.csv' } });
  const filt = (min) => D.add({ id: 'flt', title: 'flt', features: D.get('src').features().filter((f) => f.properties.v >= min), provenance: { kind: 'op', op: 'filter', inputs: ['src'], params: { min } } });
  filt(2);
  const code = 'result=[{"n":len(rows(0))}]';
  D.add({ id: 'py', title: 'py', features: [{ type: 'Feature', geometry: null, properties: { n: 3 } }],
    provenance: { kind: 'compute', language: 'python', code, codeSha256: 'a'.repeat(64), inputs: ['flt'], output: 'result', runtime: 'pyodide@314.0.7', python: '3.14.2' } });
  globalThis.window.IntMapGisOps = { run: async (step) => { D.remove(step.id); const r = filt(step.params.min); return { ok: true, dataset: r }; } };
  const asked = [];
  globalThis.window.IntMapCompute = { rerun: async (step) => { asked.push(step); D.add({ id: step.id, title: step.title, features: [{ type: 'Feature', geometry: null, properties: { n: D.get('flt').count } }], provenance: step.provenance }); return { ok: true, dataset: D.get(step.id) }; } };
  try {
    const r = await P.setParams('flt', { min: 3 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.rebuilt, ['flt', 'py']);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].provenance.code, code, 'the sandbox is handed the record\'s own code');
    assert.equal(D.get('py').features()[0].properties.n, 2, 'the Python record now answers the new input');
    /* the manifest names it a recipe, computed here, in a recorded environment */
    const m = await P.manifest('py', { fingerprint: false });
    const step = m.steps.find((s) => s.id === 'py');
    assert.equal(step.origin, 'compute');
    assert.equal(step.trace.data, 'recipe');
    assert.equal(step.trace.environment, 'recorded');
    assert.equal(step.trace.retrieval.call, 'IntMapCompute.run');
    /* without the sandbox the chain is marked, not silently kept */
    delete globalThis.window.IntMapCompute;
    const r2 = await P.setParams('flt', { min: 1 });
    assert.equal(r2.ok, false);
    assert.deepEqual(r2.failed.map((x) => [x.id, x.why]), [['py', 'compute-unavailable']]);
    assert.equal(D.get('py').stale.why, 'compute-unavailable', 'the old answer is kept and says it no longer answers its recipe');
  } finally {
    delete globalThis.window.IntMapGisOps; delete globalThis.window.IntMapCompute; delete globalThis.window.IntMapData;
  }
});
