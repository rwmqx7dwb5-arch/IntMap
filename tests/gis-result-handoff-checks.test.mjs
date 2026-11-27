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
import { currentProducts } from '../js/atlas-work-store.js';

const FILE = 'https://data.example.org/open/points-500.geojson';
const pt = (i, pad) => ({ type: 'Feature', properties: Object.assign({ n: i, name: 'c' + i }, pad ? { pad: 'x'.repeat(pad) } : null), geometry: { type: 'Point', coordinates: [130 + i / 1000, 33 + i / 2000] } });
const fc = (n, pad) => ({ type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => pt(i, pad)) });

/* the files a job may read by address: a fake of gis-input-fetch's reader (the rule is tested with the real one in gis-fetch's own checks) */
function files(map, onRead) { return async (url) => { if (onRead) onRead(url); const j = map[url]; return j ? { ok: true, json: JSON.parse(JSON.stringify(j)) } : { ok: false, code: 'upstream_404', text: 'not found' }; }; }

/* a fake of the job tables and RPCs, keeping the rules the runner depends on (supabase/migrations/…atlas_durable_jobs.sql, …atlas_job_handoff.sql) */
function fakeDb(plan, o = {}) {
  const st = {
    job: { id: '11111111-2222-4333-8444-555555555555', user_id: 'u1', status: 'running', lease_holder: 'h1', cancel_requested: false, amends: o.amends || [], finished: null, title: 'handoff' },
    tasks: new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key, progress: null, cost_micros: 0 }])),
    artifacts: [], events: [],
  };
  const j = st.job;
  const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => (!mine(a.p_holder) ? [{ ok: false, action: 'lost', amends: [] }] : [{ ok: true, action: 'go', amends: j.amends.slice() }]),
    atlas_job_reserve: (a) => mine(a.p_holder),
    atlas_job_settle: () => true,
    atlas_job_task_start: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_progress: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.progress = a.p_progress; if (a.p_yield) t.status = 'queued'; return true; },
    atlas_job_task_finish: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.status = a.p_status; t.code = a.p_code; t.result = JSON.parse(JSON.stringify(a.p_result)); return true; },
    atlas_job_task_block: (a) => { const t = st.tasks.get(a.p_task); if (!t || t.status !== 'queued') return false; t.status = 'failed'; t.code = a.p_code; return true; },
    atlas_job_artifact_put: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running' || !(a.p_part >= 0)) return false; st.artifacts = st.artifacts.filter((x) => !(x.task_id === a.p_task && x.part === a.p_part)); st.artifacts.push({ job_id: j.id, task_id: a.p_task, part: a.p_part, body: JSON.parse(JSON.stringify(a.p_body)) }); return true; },
    atlas_job_finish: (a) => { if (!mine(a.p_holder)) return false; j.status = a.p_status; j.stop_reason = a.p_stop_reason; j.result = a.p_result; j.finished = { status: a.p_status, reason: a.p_stop_reason, result: a.p_result }; j.lease_holder = null; j.ended_at = 'now'; return true; },
    atlas_job_release: (a) => { if (!mine(a.p_holder)) return false; j.lease_holder = null; return true; },
  };
  /* a tiny query builder: select().eq()…order()/maybeSingle(), awaited at any point */
  const query = (table) => {
    const where = [];
    let ord = null;
    const rows = () => {
      let list = table === 'atlas_job_tasks' ? Array.from(st.tasks.values()) : table === 'atlas_job_artifacts' ? st.artifacts : table === 'atlas_jobs' ? [j] : [];
      list = list.filter((r) => where.every(([k, v]) => (k === 'job_id' && table === 'atlas_job_tasks') ? v === j.id : (k === 'id' ? r.id === v : r[k] === v)));
      if (ord) list = list.slice().sort((a, b) => a[ord] - b[ord]);
      return JSON.parse(JSON.stringify(list));
    };
    const b = {
      select: () => b, eq: (k, v) => { where.push([k, v]); return b; }, order: (k) => { ord = k; return b; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
      insert: async (row) => { st.events.push(row); return { error: null }; },
    };
    return b;
  };
  return { st, rpc: async (name, args) => ({ data: rpcs[name](args), error: null }), from: query };
}

const gis = makeHeadlessGis({ loadGis, now: () => 0 });
const usage = { input: 100, cached_read: 0, output: 50 };
const money = { estimate: () => 1000, actual: () => 500 };
const plan = (contracts) => { const lane = makeServerCaps(); const p = planJob(contracts, { kinds: ['worker', 'capability'], capabilityOk: (id) => lane.has(id) }); assert.equal(p.ok, true, JSON.stringify(p)); return p.tasks; };
const run = (db, callModel, fetchGeoJson) => runJob({ db, job: db.st.job, holder: 'h1', callModel: callModel || (async () => { throw new Error('no model in this job'); }), money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: makeServerCaps({ gis, fetchGeoJson }) });
const jobRow = (db) => Object.assign({}, db.st.job, { tasks_total: db.st.tasks.size, spent_micros: 0, cost_cap_micros: 1000000, amend_count: db.st.job.amends.length });
const pageClient = (db) => makeJobsClient({ sb: { from: db.from, rpc: db.rpc } });
/* a work store that is SERIALISED — a store reopened later reads only what was written */
function deviceStore() { const disk = new Map(); return { disk, get: async (id) => (disk.has(id) ? JSON.parse(disk.get(id)) : null), put: async (w) => { disk.set(w.id, JSON.stringify(w)); } }; }

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
  const text = jobText(facts);
  assert.match(text, /output job:[^ ]+\/B v\w+: 1 feature/, 'Atlas is told what B made as data');
  const store = deviceStore();
  const client = pageClient(db);
  const saved = await saveJobAsWork(facts, store, { readOutput: (taskId) => client.output(facts.id, taskId) });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const reopened = deviceStore(); reopened.disk = store.disk;   /* a new page: only what was written to disk */
  const work = JSON.parse(store.disk.get(saved.workId));
  const ds = currentProducts(work).filter((p) => p.kind === 'dataset');
  assert.deepEqual(ds.map((p) => p.content.count).sort((a, b) => a - b), [1, 500], 'both datasets are products (there were none)');
  const one = ds.find((p) => p.content.count === 1);
  assert.deepEqual(one.content.features[0].geometry.coordinates, pt(499).geometry.coordinates, 'the one point and its coordinates are read back');
  assert.equal(one.from.url, FILE, '… with the file it came from');
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
  assert.equal(db.st.tasks.get('B').result.data.result.features[0].properties.n, n - 1, 'B found the last feature, which lives in the last part');
  const got = await pageClient(db).output(db.st.job.id, 'A');
  assert.equal(got.ok, true);
  assert.equal(got.features.length, n, 'the page reads all of them back, in order');
  assert.equal(got.features.at(-1).properties.n, n - 1);
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
