import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDelegation, makeWorkerExecutor } from '../js/atlas-delegate.js';
import { planJob } from '../js/atlas-job-core.js';
import { makeJobsClient } from '../js/atlas-jobs-client.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

const naturalEarth = process.env.INTMAP_RESULT_TEST_NATURAL_EARTH;
const url = naturalEarth
  ? 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_110m_admin_0_countries.geojson'
  : 'https://example.test/published-observations.geojson';
const group = naturalEarth ? 'Africa' : 'river catchment';
const column = naturalEarth ? 'CONTINENT' : 'survey';
const metric = naturalEarth ? 'POP_EST' : 'observation';
const data = naturalEarth ? JSON.parse(readFileSync(naturalEarth, 'utf8')) : {
  type: 'FeatureCollection',
  features: Array.from({ length: 97 }, (_, i) => ({
    type: 'Feature',
    properties: { survey: i % 2 ? group : 'coastal', observation: 0.25 + i, label: '測'.repeat(256) },
    geometry: { type: 'Point', coordinates: [i / 10, i % 3] },
  })),
};
const selected = data.features.filter((f) => f.properties[column] === group);
const calls = [
  { capability: 'data.gis', args: { inputs: [url] } },
  { capability: 'data.gis', args: { op: 'filter', inputs: ['@1:data.result'], params: { where: [{ field: column, op: '==', value: group }] } } },
  { capability: 'data.gis', args: { op: 'convexHull', inputs: ['@2:data.result'] } },
  { capability: 'data.gis', args: { op: 'aggregate', inputs: ['@3:data.result', '@2:data.result'], params: { stat: 'sum', field: metric, outName: 'total' } } },
];
const results = [
  ...calls.map((c) => ({ calls: [c] })),
  { summary: 'Selected all matching rows.', output: '@2:data.result' },
];
const makeLane = () => makeServerCaps({
  gis: makeHeadlessGis({ loadGis, now: () => 0 }),
  fetchGeoJson: async (requested) => {
    assert.equal(requested, url);
    return { ok: true, json: data };
  },
});
const split = { id: 'selected', goal: 'Select the matching rows.', tools: ['data.gis'] };
const receive = { id: 'next', kind: 'capability', capability: 'data.gis', args: { inputs: ['@selected:data.result'] } };

test('the browser child, the resumed server child and the client restore deliver the same selected geography', async () => {
  const local = makeLane();
  const nextReplies = results.slice();
  let ownCalculation, handed, browserArtifact;
  const worker = makeWorkerExecutor({
    ask: async () => ({ data: nextReplies.shift() }),
    maxCalls: results.length,
    capability: {
      classify: () => 'read',
      run: async (id, args) => {
        const r = await local.run(id, args, {});
        if (args.op === 'aggregate') ownCalculation = r.data?.result?.features[0];
        return { ok: r.ok, text: r.text, meta: { ...r.data, sources: r.sources } };
      },
    },
  });
  await makeDelegation({ executor: { run(task, context) {
    if (task.kind === 'worker') return worker.run(task, context);
    handed = task.args.inputs[0];
    browserArtifact = task.inputs[0].artifact;
    return { state: 'done', summary: 'Read the selected rows.' };
  } } }).run([split, receive]);
  assert.deepEqual(handed.features, selected);
  const expected = selected.reduce((total, f) => total + f.properties[metric], 0);
  assert.ok(Math.abs(ownCalculation.properties.total - expected) < 1e-5);

  const capabilities = makeLane();
  const plan = planJob([split, receive], {
    kinds: ['worker', 'capability'],
    capabilityOk: (id) => capabilities.has(id),
    datasetSlots: (id) => capabilities.datasetSlots(id),
  });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const db = fakeDb(plan.tasks);
  let clock = 0, reply = 0, slices = 0;
  const opts = { db, job: db.st.job, holder: 'handoff-test', system: 'test',
    money: { estimate: () => 100, actual: () => 100 }, capabilities,
    now: () => clock, budgetMs: 30000, leaseSeconds: 150,
    callModel: async () => {
      const next = results[reply++];
      assert.ok(next);
      clock += 40000;
      return { text: JSON.stringify(next), usage: {}, citations: [] };
    },
  };
  while (db.st.job.status === 'running' && slices < results.length + 2) {
    db.st.job.lease_holder = opts.holder;
    await runJob(opts);
    slices++;
  }
  assert.ok(slices > 1);
  const work = db.st.tasks.get('selected');
  const downstream = db.st.tasks.get('next');
  assert.equal(work.status, 'done', JSON.stringify(work.result?.gaps));
  assert.equal(downstream.status, 'done', JSON.stringify(downstream.result?.gaps));
  assert.equal(downstream.result.reads[0].version, work.result.data.output.version);
  assert.equal(browserArtifact.version, work.result.data.output.version);
  assert.deepEqual(browserArtifact.sources, [url]);
  const client = makeJobsClient({ sb: db });
  const restored = await client.output(db.st.job.id, 'selected');
  assert.deepEqual(restored.features, handed.features);
  assert.deepEqual(restored.sources.map((s) => s.url), [url]);
  const aggregate = work.progress.entries.find((entry) => entry.args.op === 'aggregate');
  const reported = JSON.parse(aggregate.preview).match(/"total":([-+\d.eE]+)/);
  assert.ok(reported && Math.abs(Number(reported[1]) - expected) < 1e-5);
  assert.deepEqual(aggregate.sources.map((source) => source.url), [url]);
  if (naturalEarth) {
    assert.equal(data.features.length, 177);
    assert.equal(restored.features.length, 51);
    assert.ok(Math.abs(expected - 1306370215.3) < 1e-5);
  }
});
