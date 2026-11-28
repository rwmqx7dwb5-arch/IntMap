import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDelegation, makeWorkerExecutor } from '../js/atlas-delegate.js';
import { planJob } from '../js/atlas-job-core.js';
import { makeJobsClient } from '../js/atlas-jobs-client.js';
import { runJob, INLINE_OUTPUT_BYTES } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

const collection = (size, width) => ({ type: 'FeatureCollection', features: Array.from({ length: size }, (_, i) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [i / size, 0] },
  properties: { i, label: '水'.repeat(width) },
})) });

test('a browser delegation keeps full structured data behind its existing task reference through resume', async () => {
  const result = collection(87, 311);
  const contracts = [
    { id: 'survey', kind: 'capability', capability: 'data.gis' },
    { id: 'inspect', kind: 'capability', capability: 'data.gis', args: { collection: '@survey:data.result' } },
  ];
  const executor = { run: async (task) => {
    if (task.id === 'survey') return { state: 'done', summary: 'surveyed', data: { result }, sources: [{ url: 'https://example.org/survey' }] };
    assert.deepEqual(task.args.collection, result);
    return { state: 'done', summary: 'inspected' };
  } };
  const first = makeDelegation({ executor });
  const ended = await first.run(contracts.slice(0, 1));
  assert.ok(ended[0].dataRef);
  assert.equal(ended[0].data, undefined);
  const resumed = makeDelegation({ executor, resume: first.snapshot() });
  const done = await resumed.run(contracts);
  assert.equal(done[1].state, 'done', done[1].summary);
});

test('a server worker selects one chained call, retaining all its features, sources and version for the next task and browser', async () => {
  const source = 'https://example.org/survey.geojson';
  const alternate = 'https://example.org/other.geojson';
  const result = collection(1150, Math.ceil(INLINE_OUTPUT_BYTES / 1150) + 10);
  const planned = planJob([
    { id: 'work', goal: 'Read and derive.', tools: ['data.gis'] },
    { id: 'next', kind: 'capability', capability: 'data.gis', args: { inputs: ['@work:data.result'] } },
  ], { kinds: ['worker', 'capability'], capabilityOk: () => true });
  assert.equal(planned.ok, true);
  const db = fakeDb(planned.tasks);
  const lane = makeServerCaps({ gis: { run: async ({ inputs }) => ({ features: inputs[0].slice(1), op: 'filter' }) }, fetchGeoJson: async (url) => ({ ok: true, json: url === alternate ? collection(1, 0) : result }) });
  let n = 0;
  const calls = [
    { calls: [
      { capability: 'data.gis', args: { inputs: ['@2:data.result'], op: 'filter' } },
      { capability: 'data.gis', args: { inputs: [source] } },
      { capability: 'data.gis', args: { inputs: [alternate] } },
      { capability: 'data.gis', args: { inputs: ['@4:data.result'] } },
    ] },
    { summary: 'The transformed data.', output: '@1:data.result' },
  ];
  await runJob({ db, job: db.st.job, holder: 'h1', callModel: async () => ({ text: JSON.stringify(calls[n++]), usage: {}, citations: [] }), money: { estimate: () => 1000, actual: () => 500 }, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: lane });
  const work = db.st.tasks.get('work');
  const next = db.st.tasks.get('next');
  assert.equal(work.status, 'done', work.result?.summary);
  assert.equal(work.result.tools[3].code, 'input_cycle');
  assert.equal(work.result.data?.output.count, result.features.length - 1);
  assert.equal(next.status, 'done', next.result?.summary);
  assert.equal(next.result.reads[0].version, work.result.data.output.version);
  assert.deepEqual(next.result.data.output.sources, [source]);
  const client = makeJobsClient({ sb: db });
  const restored = await client.output(db.st.job.id, 'work');
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.features, result.features.slice(1));
  assert.deepEqual(restored.sources.map((item) => item.url), [source]);
  assert.ok(work.result.sources.some((item) => item.url === alternate));
  const publishedPart = db.st.artifacts.find((part) => part.task_id === 'work' && part.part === restored.output.first);
  publishedPart.body.version = 'another-version';
  assert.equal((await client.output(db.st.job.id, 'work')).code, 'output_incomplete');
});

test('browser child calls can chain a full result in one round and return the selected structured value to its sibling', async () => {
  const points = collection(101, 256);
  const received = [];
  const calls = [
    { calls: [
      { capability: 'data.gis', args: { op: 'copy', input: '@2:data.result' } },
      { capability: 'data.gis', args: { op: 'read' } },
      { capability: 'data.gis', args: { op: 'copy', input: '@2:data.result' } },
      { capability: 'data.gis', args: { op: 'cyclic', input: '@4:data.result' } },
    ] },
    { summary: 'Processed the survey.', output: '@1:data' },
  ];
  const worker = makeWorkerExecutor({ ask: async () => ({ data: calls.shift() }), maxCalls: 3, capability: {
    classify: () => 'read',
    run: async (_, args) => {
      received.push(args.op);
      if (args.op === 'copy') assert.deepEqual(args.input, points);
      return { ok: true, text: 'dataset', meta: { result: points } };
    },
  } });
  const delegation = makeDelegation({ executor: { run: (task, context) => {
    if (task.kind === 'worker') return worker.run(task, context);
    assert.deepEqual(task.args.input, points);
    return { state: 'done', summary: 'used all data' };
  } } });
  const results = await delegation.run([
    { id: 'survey', goal: 'Return the survey dataset', tools: ['data.gis'] },
    { id: 'use', kind: 'capability', capability: 'data.gis', args: { input: '@survey:data.result' } },
  ]);
  assert.deepEqual(received, ['read', 'copy']);
  assert.equal(results[0].dataRef.count, points.features.length);
  assert.equal(results[1].state, 'done', results[1].summary);
});

test('a temporary server tool-artifact read failure does not poison identical reference arguments', async () => {
  const source = 'https://example.org/lakes.geojson';
  const points = collection(43, 221);
  const plan = planJob([{ id: 'lakes', goal: 'Derive a result.', tools: ['data.gis'] }], { capabilityOk: () => true });
  assert.equal(plan.ok, true);
  const db = fakeDb(plan.tasks);
  const from = db.from;
  let failOnce = true;
  db.from = (table) => {
    const query = from(table);
    if (table !== 'atlas_job_artifacts') return query;
    const read = query.maybeSingle;
    query.maybeSingle = () => {
      if (!failOnce) return read();
      failOnce = false;
      return Promise.resolve({ data: null, error: null });
    };
    return query;
  };
  const second = { calls: [{ capability: 'data.gis', args: { inputs: ['@1:data.result'] } }] };
  const messages = [
    { calls: [{ capability: 'data.gis', args: { inputs: [source] } }] },
    second,
    second,
    { summary: 'Kept the derived set.', output: '@3:data.result' },
  ];
  const lane = makeServerCaps({ gis: { run: async () => assert.fail('read needs no operation') }, fetchGeoJson: async () => ({ ok: true, json: points }) });
  await runJob({ db, job: db.st.job, holder: 'h1', callModel: async () => ({ text: JSON.stringify(messages.shift()), usage: {}, citations: [] }), money: { estimate: () => 1000, actual: () => 500 }, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', capabilities: lane });
  const task = db.st.tasks.get('lakes');
  assert.equal(task.status, 'done', JSON.stringify(task.result?.gaps));
  assert.deepEqual(task.result.tools.map((entry) => entry.ok), [true, false, true]);
  assert.deepEqual(task.result.data.output.sources, [source]);
  assert.equal(task.result.data.output.count, points.features.length);
});

test('server strict mode checks inherited declarations before executing a GIS operation', async () => {
  const left = collection(1, 0);
  const right = collection(1, 0);
  left.provenance = { semantics: { columns: { i: { keyKind: 'facility-id' } } } };
  right.provenance = { semantics: { columns: { i: { keyKind: 'company-id' } } } };
  const gis = makeHeadlessGis({ loadGis, now: () => 0 });
  const lane = makeServerCaps({ gis });
  const a = await lane.run('data.gis', { inputs: [left] });
  const b = await lane.run('data.gis', { inputs: [right] });
  const inputs = [a, b].map(({ data }) => ({ ...data.result, intmap: { provenance: data.provenance } }));
  const args = { op: 'join', inputs, params: { leftField: 'i', rightField: 'i', prefix: 'right_' } };
  const loose = await lane.run('data.gis', args);
  assert.equal(loose.ok, true, loose.text);
  const strict = await lane.run('data.gis', { ...args, strict: true });
  assert.equal(strict.code, 'semantic-mismatch', strict.text);
  assert.match(strict.text, /different identifiers/);
});
