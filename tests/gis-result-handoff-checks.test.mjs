/* (gis-result-handoff) WHAT ONE TASK OF A JOB HANDS THE NEXT — through the real planner, runner, GIS, page conversion and work store.
   Measured 2026-11-27 (an outside audit): 500 points → A done; B (filter A's result) failed wrong_input_count; C (a worker) never saw A's last rows;
   the job said done; the page filed no dataset; the GIS result said sources:[] / headless-input; a GIS step whose arguments predated the reader's
   change of request was stamped with the latest version. Each test below runs the pieces themselves (no source-reading), with a fake database
   that keeps the SQL's rules (lease, finish once, artifacts beside the row) and a fake model; the GIS is the page's own (js/gis-core.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planJob, normaliseContract, refsOf } from '../js/atlas-job-core.js';
import { runJob, INLINE_OUTPUT_BYTES } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { jobFacts, jobText, makeJobsClient } from '../js/atlas-jobs-client.js';
import { saveJobAsWork } from '../js/atlas-job-products.js';
import { currentProducts, WORK_STATE } from '../js/atlas-work-store.js';
import jobsCaps from '../js/atlas-cap-jobs.js';
import workCaps from '../js/atlas-cap-work.js';
import mapCaps from '../js/atlas-cap-map.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

const FILE = 'https://data.example.org/open/points-500.geojson';
const pt = (i, pad) => ({ type: 'Feature', properties: Object.assign({ n: i, name: 'c' + i }, pad ? { pad: 'x'.repeat(pad) } : null), geometry: { type: 'Point', coordinates: [130 + i / 1000, 33 + i / 2000] } });
const fc = (n, pad) => ({ type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => pt(i, pad)) });

/* the files a job may read by address: a fake of gis-input-fetch's reader (the rule is tested with the real one in gis-fetch's own checks) */
function files(map, onRead) { return async (url) => { if (onRead) onRead(url); const j = map[url]; return j ? { ok: true, json: JSON.parse(JSON.stringify(j)) } : { ok: false, code: 'upstream_404', text: 'not found' }; }; }

const gis = makeHeadlessGis({ loadGis, now: () => 0 });
const usage = { input: 100, cached_read: 0, output: 50 };
const money = { estimate: () => 1000, actual: () => 500 };
const plan = (contracts) => { const lane = makeServerCaps(); const p = planJob(contracts, { kinds: ['worker', 'capability'], capabilityOk: (id) => lane.has(id) }); assert.equal(p.ok, true, JSON.stringify(p)); return p.tasks; };
const run = (db, callModel, fetchGeoJson) => runJob({ db, job: db.st.job, holder: 'h1', callModel: callModel || (async () => { throw new Error('no model in this job'); }), money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: makeServerCaps({ gis, fetchGeoJson }) });
const jobRow = (db) => Object.assign({}, db.st.job, { tasks_total: db.st.tasks.size, spent_micros: 0, cost_cap_micros: 1000000, amend_count: db.st.job.amends.length });
const pageClient = (db) => makeJobsClient({ sb: { from: db.from, rpc: db.rpc } });
/* a work store that is SERIALISED — a store reopened later reads only what was written */
function deviceStore(disk = new Map()) { return { disk, get: async (id) => (disk.has(id) ? JSON.parse(disk.get(id)) : null), put: async (w) => { disk.set(w.id, JSON.stringify(w)); } }; }

/* ── ① the audit's pipeline: 500 points fetched, the last one selected from what was fetched, a worker that reads to the end, filed on the page ── */
test('① A fetches 500 points from a file; B selects the last one FROM A; C reads A to its last row; the job is done; the page files the datasets and keeps the source', async () => {
  const tasks = plan([
    { id: 'A', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [FILE], params: { where: [{ field: 'n', op: '>=', value: 0 }] } } },
    { id: 'B', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['@A:data.result'], params: { where: [{ field: 'n', op: '==', value: 499 }] } } },
    { id: 'C', goal: 'Name the point with the highest n among what A fetched.', inputs: [{ from: 'A' }] },
  ]);
  assert.deepEqual(tasks.find((t) => t.id === 'B').deps, ['A'], 'the reference IS the dependency: B waits for A without listing it');
  const db = fakeDb(tasks);
  const prompts = [];
  /* the fake worker reads the rest of A page by page, as the manifest and each answer tell it where it is, until an answer says it is the end */
  const callModel = async (sys, prompt) => {
    prompts.push(prompt);
    const m = /MANIFEST (\{[^\n]*\})/.exec(prompt);
    assert.ok(m, 'C is told A was cut, with a manifest');
    const man = JSON.parse(m[1]);
    assert.equal(man.rows, 500, 'the manifest counts the features');
    const seen = Array.from(prompt.matchAll(/characters (\d+)-(\d+) of (\d+)( \(the end\))?/g));
    const last = seen.at(-1);
    if (last && last[4]) return { text: JSON.stringify({ summary: 'read A to its end', findings: [{ claim: 'c499 is the last', source: 'read_step', excerpt: 'c499' }], gaps: [] }), usage, citations: [] };
    const from = last ? Number(last[2]) : Number(/characters 0-(\d+) of/.exec(prompt)[1]);
    return { text: JSON.stringify({ calls: [{ capability: 'read_step', args: { ref: 'input:A', offset: from, length: 6000 } }] }), usage, citations: [] };
  };
  const reads = [];
  await run(db, callModel, files({ [FILE]: fc(500) }, (u) => reads.push(u)));
  const A = db.st.tasks.get('A'), B = db.st.tasks.get('B'), C = db.st.tasks.get('C');
  assert.equal(A.status, 'done');
  assert.equal(A.result.data.count, 500);
  assert.equal(B.status, 'done', 'B ran on what A produced (it failed wrong_input_count before)');
  assert.equal(B.result.data.count, 1);
  assert.equal(B.result.data.result.features[0].properties.n, 499, 'B is the last of the 500');
  assert.deepEqual(B.result.reads.map((r) => [r.id, r.version, r.count]), [[A.result.data.output.id, A.result.data.output.version, 500]], 'B states which output, at which version, it read');
  assert.equal(C.status, 'done');
  assert.ok(prompts.some((p) => /"name":"c499"/.test(p) || /\\"name\\":\\"c499\\"/.test(p)), 'the worker was given the last row of A (it never was)');
  assert.equal(C.result.reads[0].id, A.result.data.output.id, 'C states it read A');
  assert.equal(db.st.job.finished.status, 'done');
  assert.deepEqual(reads, [FILE], 'the file was read once: B read A, not the file again');

  /* ② the source is carried: the file's address on A, and through A on B; the GIS provenance names it */
  assert.deepEqual(A.result.sources.map((x) => x.url), [FILE]);
  assert.deepEqual(B.result.sources.map((x) => x.url), [FILE], "B names the file A's points came from");
  assert.doesNotMatch(JSON.stringify(A.result.data.manifest), /headless-input/, 'no input is called headless-input');
  assert.match(JSON.stringify(A.result.data.manifest), /points-500\.geojson/, 'the manifest names the file');

  /* the page: what Atlas is told, what is filed, and what a reopened page can read */
  const facts = jobFacts(jobRow(db), Array.from(db.st.tasks.values()));
  const previousRows = structuredClone(Array.from(db.st.tasks.values()));
  delete previousRows.find((t) => t.task_id === 'B').result.data.output.geometryTypes;
  assert.deepEqual(jobFacts(jobRow(db), previousRows).tasks.find((t) => t.id === 'B').output.geometryTypes, ['Point'], 'older inline outputs also expose their geometry');
  const text = jobText(facts);
  assert.match(text, /output job:[^ ]+\/B v\w+: 1 feature/, 'Atlas is told what B made as data');
  const store = deviceStore();
  const client = pageClient(db);
  const saved = await saveJobAsWork(facts, store, { readOutput: (taskId) => client.output(facts.id, taskId) });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const reopened = deviceStore(store.disk);   /* a new page: only what was written to disk */
  const work = JSON.parse(store.disk.get(saved.workId));
  const ds = currentProducts(work).filter((p) => p.kind === 'dataset');
  assert.deepEqual(ds.map((p) => p.content.count).sort((a, b) => a - b), [1, 500], 'both datasets are products (there were none)');
  const one = ds.find((p) => p.content.count === 1);
  const reread = await saveJobAsWork(facts, reopened, { readOutput: (taskId) => client.output(facts.id, taskId) });
  assert.deepEqual(reread.saved, [], 'reading an already filed result does not create another version');
  const place = reread.datasets.find((d) => d.task === 'B');
  assert.equal(place.product, one.id);
  const record = jobText(facts, reread);
  assert.ok(record.includes(JSON.stringify({ type: 'work', action: 'restore', id: saved.workId, product: one.id })));
  assert.match(record, /\bPoint\b/, 'the result states the geometry it holds');
  assert.deepEqual(one.content.features[0].geometry.coordinates, pt(499).geometry.coordinates, 'the one point and its coordinates are read back');
  assert.equal(one.from.url, FILE, '… with the file it came from');

  /* Follow the actual capability results on a reopened page. Only the renderer boundary is a test double. */
  const page = globalThis.window;
  WORK_STATE.store = reopened;
  page.sb = db;
  page.SUPABASE_URL = 'https://test.example.org';
  page.IntMapLazy = { need: loadGis };
  const layers = [];
  page.GeoJSONUpload = { add: (geojson, title, data, options) => {
    layers.push({ geojson, dataset: options.datasetId });
    return { sid: 'GIS result' };
  } };
  const K = { R: (ok, html, extra) => ({ ok, html, ...extra }), L: (en) => en, esc: String, warn: String, note: String };
  const call = (caps, id, args) => caps.find((c) => c.row[0] === id).run(args, {}, K);
  try {
    const status = await call(jobsCaps, 'jobs.status', { id: facts.id });
    assert.ok(status.ok);
    assert.equal(status.meta.datasets.find((d) => d.task === 'B').product, one.id);
    const restore = JSON.parse(status.meta.record.split('\n').find((line) => line.startsWith('- B:')).split(' · session import ')[1]);
    const restored = await call(workCaps, 'work.job', restore);
    assert.ok(restored.ok);
    const draw = JSON.parse(restored.meta.record.split(': ')[1]);
    const rendered = await call(mapCaps, 'map.drawDataset', draw);
    assert.ok(rendered.ok, rendered.html);
    assert.deepEqual(layers, [{ geojson: { type: 'FeatureCollection', features: [pt(499)] }, dataset: draw.dataset }]);
    assert.equal(page.IntMapData.get(draw.dataset).provenance.file, FILE);
  } finally {
    WORK_STATE.store = null;
    for (const key of ['sb', 'SUPABASE_URL', 'IntMapLazy', 'GeoJSONUpload']) delete page[key];
  }
});

/* ── ① the failure is not hidden: a piece that cannot be made leaves the job partial, and the result names it ── */
test('① a reference that leads nowhere fails B by name; what depends on it is blocked; the job is partial, not done', async () => {
  const db = fakeDb(plan([
    { id: 'A', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [FILE], params: { where: [{ field: 'n', op: '>=', value: 0 }] } } },
    { id: 'B', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['@A:data.nothing'], params: { where: [{ field: 'n', op: '==', value: 1 }] } } },
    { id: 'C', kind: 'capability', capability: 'data.gis', args: { op: 'centroid', inputs: ['@B:data.result'] } },
  ]));
  await run(db, null, files({ [FILE]: fc(5) }));
  assert.equal(db.st.tasks.get('B').status, 'failed');
  assert.equal(db.st.tasks.get('B').code, 'input_ref_unresolved');
  assert.equal(db.st.tasks.get('C').status, 'failed');
  assert.equal(db.st.job.finished.status, 'partial', 'B failed, so the job is not done');
  assert.deepEqual(db.st.job.finished.result.incomplete.map((x) => x.id), ['B', 'C']);
  assert.match(db.st.job.finished.result.summary, /piece B ended failed/);
  const facts = jobFacts(jobRow(db), Array.from(db.st.tasks.values()));
  assert.equal(facts.running, false, 'partial is an ended state on the page');
  assert.match(jobText(facts), /NOT FINISHED/);
});

/* ── ① a large output is kept whole beside its row, and the next piece reads all of it ── */
test('① an output larger than the row is kept whole in parts beside it; the next piece and the page read every feature back', async () => {
  const n = Math.ceil((INLINE_OUTPUT_BYTES * 1.6) / 3100);
  const db = fakeDb(plan([
    { id: 'A', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [FILE], params: { where: [{ field: 'n', op: '>=', value: 0 }] } } },
    { id: 'B', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['@A:data.result'], params: { where: [{ field: 'n', op: '==', value: n - 1 }] } } },
  ]));
  await run(db, null, files({ [FILE]: fc(n, 3000) }));
  const A = db.st.tasks.get('A');
  assert.equal(A.status, 'done');
  assert.equal(A.result.data.result, null, 'the row does not hold the features');
  assert.equal(A.result.data.output.stored, 'artifact');
  assert.ok(A.result.data.output.parts >= 2);
  assert.equal(db.st.artifacts.filter((x) => x.task_id === 'A').length, A.result.data.output.parts);
  assert.equal(A.result.data.output.count, n);
  assert.deepEqual(A.result.data.output.geometryTypes, ['Point']);
  assert.equal(db.st.tasks.get('B').result.data.result.features[0].properties.n, n - 1, 'B found the last feature, which lives in the last part');
  const got = await pageClient(db).output(db.st.job.id, 'A');
  assert.equal(got.ok, true);
  assert.equal(got.features.length, n, 'the page reads all of them back, in order');
  assert.equal(got.features.at(-1).properties.n, n - 1);
  const facts = jobFacts(jobRow(db), Array.from(db.st.tasks.values()));
  const store = deviceStore();
  const filed = await saveJobAsWork(facts, store);
  assert.deepEqual(filed.datasets.find((d) => d.task === 'A').geometryTypes, ['Point']);
  const again = await saveJobAsWork(facts, store);
  assert.equal(again.datasets.find((d) => d.task === 'A').product, filed.datasets.find((d) => d.task === 'A').product);
  const raced = await saveJobAsWork(facts, deviceStore(), {
    readOutput: async (taskId) => {
      const result = await pageClient(db).output(db.st.job.id, taskId);
      return { ...result, output: { ...result.output, version: 'newer' } };
    },
  });
  assert.deepEqual(raced.datasets, [], 'a changed server version is not exposed under the earlier output ID');
});

/* ── ③ two versions: started under the latest, computed under the old ── */
test('③ the GIS step whose arguments predate the change is stamped with the version its conditions were written under, and the report says so', async () => {
  const db = fakeDb(plan([
    { id: 'A', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [FILE], params: { where: [{ field: 'n', op: '>=', value: 0 }] } } },
    { id: 'B', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['@A:data.result'], params: { where: [{ field: 'name', op: '==', value: 'c3' }] } } },
  ]));
  /* the reader changes the request while A is reading its file */
  await run(db, null, files({ [FILE]: fc(10) }, () => { db.st.job.amends.push('use c7 instead of c3'); }));
  const B = db.st.tasks.get('B');
  assert.equal(B.status, 'done');
  assert.equal(B.result.requestVersion, 1, 'B started after the change');
  assert.equal(B.result.conditionsVersion, 0, '… but its arguments were written before it');
  const res = db.st.job.finished.result;
  assert.equal(res.requestVersion, 1);
  assert.deepEqual(res.stale.map((x) => x.id).sort(), ['A', 'B']);
  assert.match(res.summary, /computed under the request as it was before the reader's change[^\]]*use c7 instead of c3/);
  assert.deepEqual(res.stale.find((x) => x.id === 'B').missed, ['use c7 instead of c3']);

  /* the planner revises B (atlas_job_revise: new contract, writtenAt = 1, queued) and KEEPS A (its result now holds under version 1): A is reused as
     it was — its file is not read again — and nothing is marked stale. A piece nobody revised or kept stays marked. */
  const t2 = plan([
    { id: 'A', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [FILE], params: { where: [{ field: 'n', op: '>=', value: 0 }] } } },
    { id: 'B', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['@A:data.result'], params: { where: [{ field: 'name', op: '==', value: 'c7' }] } } },
  ]);
  const db2 = fakeDb(t2, { amends: ['use c7 instead of c3'] });
  Object.assign(db2.st.tasks.get('A'), { status: 'done', result: Object.assign(JSON.parse(JSON.stringify(db.st.tasks.get('A').result)), { conditionsVersion: 1, keptAt: 1 }) });
  db2.st.tasks.get('B').contract = Object.assign({}, db2.st.tasks.get('B').contract, { writtenAt: 1 });
  const read2 = [];
  await run(db2, null, files({ [FILE]: fc(10) }, (u) => read2.push(u)));
  assert.deepEqual(read2, [], 'the kept national data is not fetched again');
  assert.equal(db2.st.tasks.get('B').result.conditionsVersion, 1);
  assert.equal(db2.st.tasks.get('B').result.data.result.features[0].properties.name, 'c7', 'the revised piece computed the new condition');
  assert.deepEqual(db2.st.job.finished.result.stale, [], 'nothing is marked: B was revised, A was kept');
  const db3 = fakeDb(t2, { amends: ['use c7 instead of c3'] });
  Object.assign(db3.st.tasks.get('A'), { status: 'done', result: JSON.parse(JSON.stringify(db.st.tasks.get('A').result)) });
  db3.st.tasks.get('B').contract = Object.assign({}, db3.st.tasks.get('B').contract, { writtenAt: 1 });
  await run(db3, null, files({ [FILE]: fc(10) }));
  assert.deepEqual(db3.st.job.finished.result.stale.map((x) => [x.id, !!x.missed, !!x.readStale]), [['A', true, false], ['B', false, true]], 'unkept A is marked, and B is marked as built on it');
});

/* ── the reference form is one: the page delegation and the job runner read the same @task:path ── */
test('the reference form is ONE implementation, shared by the page delegation and the server runner', async () => {
  const D = await import('../js/atlas-delegate.js');
  const C = await import('../js/atlas-job-core.js');
  assert.equal(D.resolveArgs, C.resolveArgs);
  assert.deepEqual(refsOf({ a: ['@@literal', '@A:data.result', { b: '@B:summary' }] }), ['A', 'B']);
  assert.deepEqual(normaliseContract({ kind: 'capability', capability: 'data.gis', args: { inputs: ['@A:data.result'] }, inputs: [{ from: 'Z' }] }).contract.inputs.map((i) => i.from), ['Z', 'A']);
  assert.equal(planJob([{ id: 'B', kind: 'capability', capability: 'data.gis', args: { inputs: ['@nope:data.result'] } }], { kinds: ['capability'], capabilityOk: () => true }).error, 'input_unknown', 'a reference to a task that is not in the job is refused at planning');
});

/* ── ④ the shared rule for an input list a capability cuts: the original count stays, and the cut is stated ── */
test('④ counted(): a cut keeps the original count as the denominator; no max, or a list within it, is not cut', async () => {
  const { counted } = await import('../js/atlas-caps.js');
  assert.deepEqual(counted([1, 2, 3], 2), { kept: [1, 2], received: 3, used: 2, dropped: 1 });
  assert.deepEqual(counted([1, 2], 2), { kept: [1, 2], received: 2, used: 2, dropped: 0 });
  assert.deepEqual(counted([1, 2, 3]), { kept: [1, 2, 3], received: 3, used: 3, dropped: 0 });
  assert.deepEqual(counted(null, 5), { kept: [], received: 0, used: 0, dropped: 0 });
});

/* ── (gis-handoff-entry) what Atlas actually wrote in production (2026-11-28) reaches the hand-over ──
   The page's data.gis names a file "url:https://…" and an input by a dataset id; the planner wrote the same in a job — the file as "url:https://…geojson",
   the earlier task by its bare id — and both were refused (with the world graph's sentence), so the hand-over above was never reached. */
test('the page vocabulary reaches the hand-over: "url:https://…" reads the file, and a bare task id that is one of the inputs is that task\'s output', async () => {
  const CT = 'https://data.example.org/open/countries.geojson';
  const countries = { type: 'FeatureCollection', features: Array.from({ length: 12 }, (_, i) => ({ type: 'Feature', properties: { NAME: 'k' + i, CONTINENT: i % 3 === 0 ? 'Africa' : 'Asia', POP_EST: 1000 + i }, geometry: { type: 'Point', coordinates: [i, i] } })) };
  const db = fakeDb(plan([
    { id: 'africa_filter', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: ['url:' + CT], params: { where: [{ field: 'CONTINENT', op: '==', value: 'Africa' }] } } },
    { id: 'centres', kind: 'capability', capability: 'data.gis', inputs: [{ from: 'africa_filter' }], args: { op: 'centroid', inputs: ['africa_filter'] } },
  ]));
  await run(db, null, files({ [CT]: countries }));
  const f = db.st.tasks.get('africa_filter'), c = db.st.tasks.get('centres');
  assert.equal(f.status, 'done', JSON.stringify(f.result && f.result.gaps));
  assert.equal(f.result.data.count, 4);
  assert.deepEqual(f.result.sources.map((x) => x.url), [CT], 'the address after "url:" is the source');
  assert.equal(c.status, 'done', JSON.stringify(c.result && c.result.gaps));
  assert.equal(c.result.data.count, 4, 'the bare id read the earlier output, all of it');
  assert.deepEqual(c.result.sources.map((x) => x.url), [CT]);
  assert.equal(db.st.job.finished.status, 'done');
  /* a name that is not one of the inputs is not guessed into one, and the refusal says what data.gis reads — not the world graph */
  const lane = makeServerCaps({ gis, fetchGeoJson: files({}) });
  const r = await lane.run('data.gis', { op: 'centroid', inputs: ['africa_filter'] }, {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'part_unsupported_on_server');
  assert.doesNotMatch(r.text, /world graph/);
  assert.match(r.text, /@<task id>:data\.result/);
});

/* ── (gis-read-step) the job Atlas built in production on 2026-11-28, as it built it: a read step with inputs and NO op, then a filter that names it ──
   The read step answered with the list of operations (ok:true, no data), so the filter had nothing; its refusal then said the name meant nothing. */
test('a data.gis step with inputs and no op READS them (as on the page); a step that names an input which made no features is told so', async () => {
  const PP = 'https://data.example.org/open/populated_places.geojson';
  const places = { type: 'FeatureCollection', features: ['Japan', 'Japan', 'France', 'Japan', 'Peru'].map((c, i) => ({ type: 'Feature', properties: { NAME: 'p' + i, ADM0NAME: c, POP_MAX: 1000 * (i + 1) }, geometry: { type: 'Point', coordinates: [i, i] } })) };
  const db = fakeDb(plan([
    { id: 'read', kind: 'capability', capability: 'data.gis', args: { inputs: ['url:' + PP] } },
    { id: 'filter', kind: 'capability', capability: 'data.gis', inputs: [{ from: 'read' }], args: { op: 'filter', inputs: ['read'], params: { where: [{ field: 'ADM0NAME', op: '==', value: 'Japan' }] } } },
  ]));
  await run(db, null, files({ [PP]: places }));
  const read = db.st.tasks.get('read'), filter = db.st.tasks.get('filter');
  assert.equal(read.status, 'done');
  assert.equal(read.result.data.count, 5, 'the read step holds the file, not the list of operations');
  assert.deepEqual(read.result.sources.map((x) => x.url), [PP]);
  assert.equal(read.result.data.output.count, 5);
  assert.equal(filter.status, 'done', JSON.stringify(filter.result && filter.result.gaps));
  assert.equal(filter.result.data.count, 3);
  assert.equal(filter.result.data.result.features.reduce((s, f) => s + f.properties.POP_MAX, 0), 1000 + 2000 + 4000);
  assert.deepEqual(filter.result.sources.map((x) => x.url), [PP], 'the file is still the source after the filter');
  assert.equal(db.st.job.finished.status, 'done');
  /* {"describe":true} and a call with neither op nor inputs still list the operations */
  const lane = makeServerCaps({ gis });
  assert.ok(Array.isArray((await lane.run('data.gis', { describe: true }, {})).data.ops));
  assert.ok(Array.isArray((await lane.run('data.gis', {}, {})).data.ops));
  /* an input task that answered without features: the refusal names that, not «none of these» */
  const db2 = fakeDb(plan([
    { id: 'list', kind: 'capability', capability: 'data.gis', args: { describe: true } },
    { id: 'use', kind: 'capability', capability: 'data.gis', inputs: [{ from: 'list' }], args: { op: 'centroid', inputs: ['list'] } },
  ]));
  await run(db2, null, files({}));
  const use = db2.st.tasks.get('use');
  assert.equal(use.status, 'failed');
  assert.equal(use.code, 'input_has_no_features');
  assert.match(use.result.gaps[0], /"list" is one of the inputs, but its result holds no features/);
  assert.equal(db2.st.job.finished.status, 'partial');
});

/* ── (gis-dataset-slots) the African job of 2026-11-28 as Atlas built it: four capability tasks, the earlier ones named ONLY in data.gis "inputs",
   every contract's inputs empty. No dependency was made, all four started at once, and three were refused. ── */
const planServer = (contracts) => { const lane = makeServerCaps(); const p = planJob(contracts, { kinds: ['worker', 'capability'], capabilityOk: (id) => lane.has(id), datasetSlots: (id) => lane.datasetSlots(id) }); assert.equal(p.ok, true, JSON.stringify(p)); return p.tasks; };
test('a task named where data.gis takes its data is a dependency: filter → hull → count/sum run in order on the real GIS', async () => {
  const CT = 'https://data.example.org/open/countries-poly.geojson';
  const sq = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
  const countries = { type: 'FeatureCollection', features: Array.from({ length: 9 }, (_, i) => ({ type: 'Feature', properties: { NAME: 'k' + i, CONTINENT: i < 5 ? 'Africa' : 'Asia', POP_EST: 100 * (i + 1) }, geometry: sq(i * 2, 0) })) };
  const tasks = planServer([
    { id: 'africa', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [CT], params: { where: [{ field: 'CONTINENT', op: '==', value: 'Africa' }] } } },
    { id: 'zone', kind: 'capability', capability: 'data.gis', args: { op: 'convexHull', inputs: ['africa'] } },
    { id: 'count', kind: 'capability', capability: 'data.gis', args: { op: 'aggregate', inputs: ['zone', 'africa'], params: { stat: 'count', outName: 'n' } } },
    { id: 'sum', kind: 'capability', capability: 'data.gis', args: { op: 'aggregate', inputs: ['zone', 'africa'], params: { stat: 'sum', field: 'POP_EST', outName: 'pop' } } },
  ]);
  assert.deepEqual(tasks.map((t) => [t.id, t.deps]), [['africa', []], ['zone', ['africa']], ['count', ['zone', 'africa']], ['sum', ['zone', 'africa']]]);
  const db = fakeDb(tasks);
  await run(db, null, files({ [CT]: countries }));
  for (const id of ['africa', 'zone', 'count', 'sum']) assert.equal(db.st.tasks.get(id).status, 'done', id + ': ' + JSON.stringify(db.st.tasks.get(id).result && db.st.tasks.get(id).result.gaps));
  assert.equal(db.st.tasks.get('africa').result.data.count, 5);
  const row = (id) => db.st.tasks.get(id).result.data.result.features[0].properties;
  assert.equal(row('count').n, 5, 'counted over the five African rows');
  assert.equal(row('sum').pop, 100 + 200 + 300 + 400 + 500, 'summed over them');
  assert.deepEqual(db.st.tasks.get('sum').result.sources.map((x) => x.url), [CT], 'the file is the source at the end of the chain');
  assert.equal(db.st.job.finished.status, 'done');
  /* only the declared slot is read: a filter VALUE equal to a task id is not a reference */
  const t2 = planServer([
    { id: 'Africa', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [CT], params: { where: [{ field: 'CONTINENT', op: '==', value: 'Asia' }] } } },
    { id: 'asia', kind: 'capability', capability: 'data.gis', args: { op: 'filter', inputs: [CT], params: { where: [{ field: 'CONTINENT', op: '==', value: 'Africa' }] } } },
  ]);
  assert.deepEqual(t2.map((t) => t.deps), [[], []]);
});

/* ── (gis-dataset-slots) a worker's findings reach Atlas: they were reduced to a count, so Atlas said the result held no figures ── */
test('jobFacts carries the findings themselves, and jobText states them', () => {
  const f = jobFacts({ id: 'j1', status: 'done', tasks_total: 1, result: { summary: 's' } }, [{ task_id: 'aggregate', status: 'done', contract: { goal: 'count Japan' }, result: { summary: 'counted', findings: [{ claim: 'Japan has 3 places, POP_MAX total 48775000', source: 'data.gis', excerpt: '{"count":3,"sum":48775000}' }], gaps: [] } }]);
  assert.equal(f.tasks[0].findings.length, 1);
  assert.equal(f.tasks[0].findings[0].claim, 'Japan has 3 places, POP_MAX total 48775000');
  assert.match(jobText(f), /findings: \[1\] Japan has 3 places, POP_MAX total 48775000 \(data\.gis\) — "\{"count":3,"sum":48775000\}"/);
});

/* ── (gis-worker-chain) inside a worker: one call's result is the next call's argument, across a slice too ──
   Production 2026-11-28: the worker read 177 countries and filtered them to 51, then "@3:data.result" was refused, and it re-read and re-filtered the
   file for 40 calls until the cost cap ended the job. Its describe answer was cut before aggregate's parameters, so it wrote "stats" for "stat". */
test('a worker hands a call\'s whole result to its next call ("@<n>:data.result"), the kept results survive a slice, and describe names one op in full', async () => {
  const CT = 'https://data.example.org/open/countries-poly-w.geojson';
  const sq = (x) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] });
  const countries = { type: 'FeatureCollection', features: Array.from({ length: 9 }, (_, i) => ({ type: 'Feature', properties: { NAME: 'k' + i, CONTINENT: i < 5 ? 'Africa' : 'Asia', POP_EST: 100 * (i + 1) }, geometry: sq(i * 2) })) };
  const steps = [
    { capability: 'data.gis', args: { describe: true, op: 'aggregate' } },
    { capability: 'data.gis', args: { inputs: [CT] } },
    { capability: 'data.gis', args: { op: 'filter', inputs: ['@2:data.result'], params: { where: [{ field: 'CONTINENT', op: '==', value: 'Africa' }] } } },
    { capability: 'data.gis', args: { op: 'convexHull', inputs: ['@3:data.result'] } },
    { capability: 'data.gis', args: { op: 'aggregate', inputs: ['@4:data.result', '@3:data.result'], params: { stat: 'sum', field: 'POP_EST', outName: 'pop' } } },
  ];
  const tasks = plan([{ id: 'africa', goal: 'count the African countries and sum POP_EST', tools: ['data.gis'] }]);
  const db = fakeDb(tasks);
  let round = 0, clock = 0;
  const callModel = async (sys, prompt) => {
    clock += 40000;   /* each round is past the slice: the loop writes its state and the next slice resumes */
    if (round < steps.length) return { text: JSON.stringify({ calls: [steps[round++]] }), usage, citations: [] };
    return { text: JSON.stringify({ summary: 'summed', findings: [{ claim: 'done', source: 'data.gis', excerpt: 'x' }], gaps: [] }), usage, citations: [] };
  };
  const lane = makeServerCaps({ gis, fetchGeoJson: files({ [CT]: countries }) });
  for (let slice = 0; slice < 10 && db.st.job.status === 'running'; slice++) {
    db.st.job.lease_holder = 'h1';
    await runJob({ db, job: db.st.job, holder: 'h1', callModel, money, now: () => clock, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: lane });
  }
  const t = db.st.tasks.get('africa');
  assert.equal(t.status, 'done', JSON.stringify(t.result && t.result.gaps));
  const entries = t.progress.entries;
  const body = (e) => JSON.parse(e.preview);   /* what the worker was shown of the answer (the whole is kept beside it — #1502) */
  assert.deepEqual(entries.map((e) => [e.n, e.ok]), [[1, true], [2, true], [3, true], [4, true], [5, true]], JSON.stringify(entries.map((e) => [e.n, e.code, body(e).slice(0, 300)])));
  assert.match(body(entries[0]), /^aggregate\(2 input\(s\)[^:]*\): stat\*=count\|sum/, 'describe with op names that op in full: "stat", required, and its values');
  assert.match(body(entries[2]), /filter -> 5 feature\(s\)/, 'the filter read the 9 features the read call kept, not the clipped text');
  assert.match(body(entries[4]), /"pop":1500/, 'the sum over the five African rows, from results handed on across slices');
  /* the list of all operations is short enough to be read whole, and names each one's parameters */
  const all = await lane.run('data.gis', { describe: true }, {});
  assert.ok(JSON.stringify(all.data).length < 6000, 'the brief list fits what a worker reads back: ' + JSON.stringify(all.data).length);
  assert.ok(all.data.ops.find((o) => o.id === 'aggregate').params.includes('stat*'));
});
