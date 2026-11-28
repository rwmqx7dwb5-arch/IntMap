/* ============================================================================
 *  worker-reach — what a delegated worker may run: «unless it changes what the READER sees or owns»
 *  js/atlas-capabilities.js (facetsOf · privateKeys → facets.changesSeen) · js/atlas-console.js (classifyCapability,
 *  runReadCapability) · js/atlas-cap-compute.js · js/atlas-cap-model.js · js/atlas-cap-data.js · js/atlas-cap-web.js
 *  The defect (measured 2026-11-25 on the registry): the worker lane admitted only capabilities that change no state at
 *  all — 56 of 287 — so Python, geo.ml and satellite change were refused although what a worker needs from them is the
 *  result as data, filed in the session's GIS store where nothing shows it.
 *    ① the lane admits the private-result capabilities, and keeps everything the reader sees refused
 *    ② the private keys are derived from the table: no namespace of one is ever shown by any row, and every writer is session-bound
 *    ③ a capability the registry has no facets for (define()) is refused — an effect nobody can name counts as seen
 *    ④ a worker run of model.run returns the forecast as data and neither pins nor moves the camera; the reader's run still does both
 *    ⑤ a worker run of data.query asks the engine for no pins and hands the rows back as data
 *    ⑥ a worker's compute.run keeps only the 'read' grant, its program may call only what the worker may, and is not filed
 *    ⑦ web.fetchFile registers a worker's download without drawing and returns the dataset id
 *  Every run is evaluated with the source the lane itself hands the kernel (⑩ of atlas-delegation-wiring), not a spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { CAPABILITY_MODULES } = await import('../js/atlas-caps-modules.js');

const CONSOLE = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
function lane(name) {
  const i = CONSOLE.indexOf('const ' + name + ' = ');
  assert.ok(i > 0, name + ' is defined in the console');
  const j = Math.min(...['\n    const ', '\n    /*', '\n    function '].map((m) => { const k = CONSOLE.indexOf(m, i + 10); return k < 0 ? Infinity : k; }));
  return CONSOLE.slice(i, j);
}
const laneSrc = lane('classifyCapability') + '\n' + lane('runReadCapability');
const makeLane = (CAPS, EXEC) => new Function('CAPS', 'EXEC', '_curTurn', laneSrc + '\nreturn { classifyCapability, runReadCapability };')(CAPS, EXEC, 9);
const CAPS = makeAtlasCapabilities({}, { publish: false });
const { classifyCapability: classify } = makeLane(CAPS, null);
const entry = (id) => Object.values(CAPABILITY_MODULES).flat().find((e) => e.row[0] === id);

/* the execution context the lane really gives a run: runReadCapability → EXEC.execute(id, args, opts) → the run's dctx */
async function workerCtx() {
  let seen = null;
  const { runReadCapability } = makeLane(CAPS, { execute: async (id, a, o) => { seen = o; return { status: 'completed' }; } });
  await runReadCapability('x', {});
  return seen;
}
const baseK = (over) => Object.assign({ R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x, note: (x) => x }, over || null);

test('① the lane admits the private-result capabilities and keeps the reader-visible ones refused', () => {
  ['compute.run', 'geo.ml', 'geo.imageChange', 'model.run', 'data.query'].forEach((id) => assert.equal(classify(id), 'read', id));   /* model.run / data.query by their headless declaration — ④ ⑤ hold that they then draw nothing */
  ['map.highlight', 'layers.toggle', 'view.flyTo', 'research.delegate', 'dialog.ask', 'data.gisProject'].forEach((id) => assert.equal(classify(id), 'other', id));
  const settings = CAPS.all().filter((c) => c.id.startsWith('settings.'));
  assert.ok(settings.length > 5);
  settings.forEach((c) => assert.equal(classify(c.id), 'other', c.id));
  /* nothing that was admitted before is refused now */
  CAPS.all().forEach((c) => { const f = c.facets; if (!f.mutatesState && !f.asksUser && !f.showsUI && !f.savesFile && !f.delegates && c.confirmation === 'none') assert.equal(classify(c.id), 'read', c.id); });
});

test('② a key counts as private only if no row of its namespace shows anything and every writer is session-bound', () => {
  const KEEPS = ['map', 'panel', 'chart', 'camera', 'route', 'view', 'object', 'time', 'setting', 'file'];
  const all = CAPS.all();
  const admittedWriters = all.filter((c) => classify(c.id) === 'read' && c.effects.writes.length && !c.facets.headless);   /* headless ones are admitted by their declaration (④ ⑤), not by a private key */
  assert.ok(admittedWriters.length >= 3);
  admittedWriters.forEach((c) => c.effects.writes.forEach((k) => {
    const ns = k.split('.')[0];
    all.filter((o) => o.effects.writes.some((w) => w.split('.')[0] === ns)).forEach((o) => assert.ok(!o.produces.some((p) => KEEPS.includes(p)), c.id + ' writes ' + k + ', and ' + o.id + ' shows the namespace'));
    all.filter((o) => o.effects.writes.includes(k)).forEach((o) => assert.ok(o.risk === 'read-only' || o.risk === 'reversible-session', o.id + ' writes ' + k + ' at risk ' + o.risk));
  }));
  /* a session row that names nothing it writes changes something nobody named */
  all.filter((c) => c.risk === 'reversible-session' && !c.effects.writes.length).forEach((c) => assert.equal(c.facets.changesSeen, true, c.id));
});

test('③ a capability with no derived facets is refused', () => {
  const C = makeAtlasCapabilities({}, { publish: false });
  assert.equal(C.define({ id: 'probe.noFacets', execute: () => ({ ok: true }), risk: 'read-only' }), true);
  assert.equal(makeLane(C, null).classifyCapability('probe.noFacets'), 'other');
});

/* a GloFAS answer for the 3×3 probe: 60 past days at 100 m³/s, a forecast that peaks at 320 */
function floodJson() {
  const today = new Date().toISOString().slice(0, 10), t0 = Date.parse(today + 'T00:00:00Z');
  const time = [], q = [];
  for (let i = -60; i < 16; i++) { time.push(new Date(t0 + i * 864e5).toISOString().slice(0, 10)); q.push(i < 0 ? 100 : i === 5 ? 320 : 150); }
  const cell = { latitude: 35.1, longitude: 136.9, daily: { time, river_discharge: q } };
  ['mean', 'median', 'min', 'max', 'p25', 'p75'].forEach((k, n) => { cell.daily['river_discharge_' + k] = q.map((v) => v * (0.8 + n * 0.08)); });
  return Array.from({ length: 9 }, () => cell);
}
function drawSpies() {
  const calls = { pin: 0, fly: 0 };
  const GE = () => ({ camera: { flyTo: () => { calls.fly++; }, getZoom: () => 3 } });
  return { calls, K: baseK({ GE, addPin: () => { calls.pin++; return 1; }, geocode: async () => null, _fetchJSON: async () => floodJson() }) };
}

test('④ model.run in a worker returns the forecast as data and does not draw; the reader\'s run still pins and flies', async () => {
  const run = entry('model.run').run;
  const a = { model: 'flood.glofas', lat: 35.1, lng: 136.9, place: 'Nagoya' };
  const w = drawSpies();
  const r = await run(a, await workerCtx(), w.K);
  assert.equal(r.ok, true, r.html);
  assert.deepEqual(w.calls, { pin: 0, fly: 0 }, 'a worker run touches neither the pins nor the camera');
  const sm = r.meta.specialistModel;
  assert.equal(sm.drawn, false);
  assert.equal(sm.result.peak, 320); assert.equal(typeof sm.result.ensemble.max, 'number'); assert.ok(Array.isArray(sm.result.series) && sm.result.series.length > 5);
  assert.deepEqual([sm.place.lat, sm.place.lng], [35.1, 136.9]);
  const u = drawSpies();
  const r2 = await run(a, { source: 'atlas', turnId: 1 }, u.K);
  assert.equal(r2.ok, true);
  assert.deepEqual(u.calls, { pin: 1, fly: 1 }, 'the reader\'s own run is unchanged');
  assert.equal(r2.meta.specialistModel.result, undefined);
});

test('⑤ data.query in a worker asks the engine for no pins and returns the rows as data', async () => {
  const asked = [];
  const res = { ok: true, rows: [{ name: 'A', lat: 1, lng: 2, v: { pop: 5 } }] };
  window.IntMapLazy = { need: async () => true };
  window.IntMapQuery = { bind() { return this; }, answer: async (a, ui) => { asked.push(ui); return { ok: true, html: '<table></table>', objectIds: ui.pin === false ? [] : ['p1'], resultKey: 'k', result: res }; },
    compact: (x) => ({ rows: x.rows.map((r) => ({ name: r.name, v: r.v })) }) };
  try {
    const K = baseK({ ensureData: async () => {}, _mirrorLang: () => 'en', countryStats: {} });
    const r = await entry('data.query').run({ from: 'cities' }, await workerCtx(), K);
    assert.deepEqual(asked[0], { pin: false });
    assert.equal(r.ok, true); assert.equal(r.meta.drawn, false); assert.deepEqual(r.meta.query.rows, [{ name: 'A', v: { pop: 5 } }]);
    assert.equal(r.objectIds, undefined, 'no pin was made');
    const r2 = await entry('data.query').run({ from: 'cities' }, { source: 'atlas' }, K);
    assert.deepEqual(asked[1], {}); assert.deepEqual(r2.objectIds, ['p1']); assert.deepEqual(r2.meta.query.rows, [{ name: 'A', v: { pop: 5 } }]);
  } finally { delete window.IntMapQuery; delete window.IntMapLazy; }
});

test('⑥ compute.run in a worker: read grant only, the program calls only what the worker may, nothing filed', async () => {
  const bridges = [];
  window.IntMapLazy = { need: async () => true };
  window.IntMapCompute = { readDataset: () => null, run: async () => ({ ok: true, runtime: 'pyodide', datasets: [{ id: 'ds1', name: 'out', title: 'out', count: 3, fields: [{ name: 'x', type: 'number' }] }], values: { slope: { value: 1.5 } }, observed: true }) };
  try {
    const K = baseK({ classifyCapability: classify, programBridge: (o) => { bridges.push(o); return { bridge: { cancel() {} }, close() {} }; } });
    const r = await entry('compute.run').run({ code: 'result = 1', grants: ['read', 'state'] }, await workerCtx(), K);
    assert.equal(r.ok, true);
    assert.deepEqual(bridges[0].grants, ['read']); assert.deepEqual(r.meta.compute.grantsDropped, ['state']);
    assert.equal(r.meta.compute.datasets[0].id, 'ds1'); assert.equal(r.meta.compute.values.slope.value, 1.5);
    assert.equal(r.meta.compute.filed, undefined);
    const forbid = bridges[0].forbid;
    assert.ok(forbid({ id: 'map.highlight' }), 'a drawing capability is refused to the worker\'s program');
    assert.ok(forbid({ id: 'compute.run' }), 'no program inside a program');
    assert.equal(forbid({ id: 'geo.ml' }), null, 'what the worker may run, its program may call');
    await entry('compute.run').run({ code: 'result = 1', grants: ['read', 'state'] }, { source: 'atlas' }, K);
    assert.deepEqual(bridges[1].grants, ['read', 'state'], 'the reader\'s own run keeps what it asked');
    assert.equal(bridges[1].forbid({ id: 'map.highlight' }), null);
  } finally { delete window.IntMapCompute; delete window.IntMapLazy; }
});

test('⑦ web.fetchFile in a worker keeps the download for inspection without drawing, even if requested', async () => {
  const src = 'https://example.test/resources/observations.csv';
  const b64 = Buffer.from('latitude,longitude,height\n12,35,100\n').toString('base64');
  const asked = [];
  const sha256 = 'a'.repeat(64);
  const realFetch = globalThis.fetch;
  const endpoint = window.SUPABASE_URL;
  window.SUPABASE_URL = 'https://relay.test';
  globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, file: { b64, name: 'observations.csv', type: 'text/csv', url: src, sha256 } }) });
  window.GeoJSONUpload = { handle: async ([file], opts) => {
    asked.push({ text: await file.text(), ...opts });
    return [{ ok: true, format: 'csv', features: 1, datasetId: 'ds-retained', layer: opts.draw ? 27 : null,
      description: { bounds: [35, 12, 35, 12], quality: { rowsWithoutGeometry: 0 } } }];
  } };
  try {
    assert.equal(classify('web.fetchFile'), 'read');
    const K = baseK({ HOST: { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } } });
    const cap = entry('web.fetchFile');
    const r = await cap.run({ url: src, draw: true }, await workerCtx(), K);
    assert.equal(r.ok, true);
    assert.deepEqual(r.exec.web.dataset, { id: 'ds-retained', format: 'csv', rows: 1, layer: null,
      label: 'observations.csv', bounds: [35, 12, 35, 12], quality: { rowsWithoutGeometry: 0 } });
    assert.deepEqual(asked[0], { text: 'latitude,longitude,height\n12,35,100\n', quiet: true, draw: false, inspect: true, source: src, sourceSha256: sha256 });
    const parent = await cap.run({ url: src }, { source: 'atlas' }, K);
    assert.equal(parent.exec.web.dataset.layer, 27);
  } finally {
    globalThis.fetch = realFetch;
    window.SUPABASE_URL = endpoint;
    delete window.GeoJSONUpload;
  }
});

test('⑧ geo.regionStat names what it writes and is headless: a worker gets the figures, never the reader\'s layer', async () => {
  const c = CAPS.all().find((x) => x.id === 'geo.regionStat');
  assert.deepEqual([...c.effects.writes].sort(), ['gis.dataset', 'map.object'], 'with draw:true it registers a boundary layer and colours it — said in the row');
  assert.equal(c.facets.headless, true);
  assert.equal(classify('geo.regionStat'), 'read', 'the lane admits it');
  const src = readFileSync(new URL('../js/atlas-cap-geo.js', import.meta.url), 'utf8');
  assert.match(src, /const worker = !!dctx && dctx\.source === 'atlas-worker';\s*\n\s*if \(a\.draw && !worker\)/, 'a worker run leaves draw out');
});
