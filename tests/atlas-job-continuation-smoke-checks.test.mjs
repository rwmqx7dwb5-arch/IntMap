import test from 'node:test';
import assert from 'node:assert/strict';
import { runContinuationSmoke, verifyContinuation } from '../scripts/atlas-job-continuation-smoke.mjs';
import { planJob } from '../supabase/functions/_shared/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

test('production smoke reads the two real runner slices and rejects incomplete receipts', async () => {
  const caps = makeServerCaps({ gis: makeHeadlessGis({ loadGis, now: () => 0 }) });
  const features = [[12.75, 48.125], [13.25, 48.5], [15.25, 48.75]].map((coordinates, index) => ({
    type: 'Feature', properties: { keep: index < 2 }, geometry: { type: 'Point', coordinates },
  }));
  const plan = planJob([
    { id: 'load', kind: 'capability', capability: 'data.gis', args: { inputs: [{ type: 'FeatureCollection', features }] } },
    { id: 'filter', kind: 'capability', capability: 'data.gis', inputs: [{ from: 'load' }], args: {
      op: 'filter', inputs: ['@load:data.result'], params: { where: [{ field: 'keep', op: '==', value: true }] },
    } },
  ], { kinds: ['capability'], capabilityOk: caps.has, datasetSlots: caps.datasetSlots });
  assert.ok(plan.ok);
  const db = fakeDb(plan.tasks);
  const job = db.st.job;
  job.spent_micros = 0;
  const events = [{ kind: 'created' }];
  const rpc = db.rpc;
  db.rpc = async (name, args) => {
    const reply = await rpc(name, args);
    if (reply.data === true) {
      const task = db.st.tasks.get(args.p_task);
      if (name === 'atlas_job_task_start') events.push({ kind: 'task.started', data: { task: args.p_task } });
      if (name === 'atlas_job_task_finish') {
        events.push({ kind: 'task.ended', data: { task: args.p_task } });
        task.calls = args.p_calls;
        task.cost_micros = args.p_cost;
      }
      if (name === 'atlas_job_finish') events.push({ kind: 'ended' });
    }
    return reply;
  };
  const lease = async (holder, options) => {
    job.lease_holder = holder;
    events.push({ kind: 'lease', data: { holder } });
    return runJob({
      db, job, holder, capabilities: caps, now: () => 0, budgetMs: 30, leaseSeconds: 150,
      callModel: () => assert.fail('GIS probe can never call a model'), ...options,
    });
  };
  const requests = [];
  const receipt = await runContinuationSmoke({
    SUPABASE_URL: 'https://example.test', SUPABASE_PUBLISHABLE_KEY: 'public',
    ATLAS_JOBS_PROBE_ACCESS_TOKEN: 'test-account-token', ATLAS_JOBS_SECRET: 'test-tick-secret',
  }, async (url, init) => {
    requests.push(url.pathname);
    assert.equal(init.headers.Authorization, 'Bearer test-account-token');
    assert.equal(init.redirect, 'error');
    if (url.pathname === '/functions/v1/atlas-jobs') {
      const body = JSON.parse(init.body);
      assert.equal(body.op, 'create');
      assert.equal(body.probe, true);
      assert.equal(body.tasks, undefined);
      assert.equal(init.headers['x-atlas-jobs-secret'], 'test-tick-secret');
      assert.deepEqual(await lease('edge:first', { yieldAtTaskBoundary: true, inlineOutputBytes: 128 }), { outcome: 'more' });
      assert.equal(db.st.tasks.get('load').result.data.output.stored, 'artifact');
      assert.equal(db.st.tasks.get('filter').status, 'queued');
      return Response.json({ jobId: db.st.job.id, created: true, probe: true });
    }
    assert.equal(init.headers['x-atlas-jobs-secret'], undefined);
    if (url.pathname.endsWith('/atlas_jobs')) {
      const state = JSON.parse(JSON.stringify(job));
      if (job.lease_holder === null && job.status === 'running') assert.deepEqual(await lease('edge:second'), { outcome: 'finished' });
      return Response.json([state]);
    }
    if (url.pathname.endsWith('/atlas_job_tasks')) return Response.json([...db.st.tasks.values()]);
    if (url.pathname.endsWith('/atlas_job_events')) return Response.json(events);
    if (url.pathname.endsWith('/atlas_job_artifacts')) return Response.json(db.st.artifacts);
    assert.fail('unexpected path ' + url.pathname);
  });
  assert.equal(requests.filter(path => path.startsWith('/functions/')).length, 1, 'the smoke never manually ticks the function');
  assert.equal(receipt.slices, 2);
  assert.equal(receipt.artifactParts, 3);
  assert.equal(receipt.count, 2);
  assert.notEqual(receipt.inputVersion, receipt.outputVersion);
  assert.equal(receipt.spentMicros, 0);
  const rows = { job, tasks: [...db.st.tasks.values()], events, artifacts: db.st.artifacts };
  assert.throws(() => verifyContinuation({ ...rows, events: events.filter(e => e.data?.holder !== 'edge:second') }), /distinct second lease/);
  assert.throws(() => verifyContinuation({ ...rows, artifacts: db.st.artifacts.slice(1) }), /saved.parts/);
  const wrong = structuredClone(rows);
  wrong.tasks.find(t => t.task_id === 'filter').result.data.result.features[0].geometry.coordinates = [0, 0];
  assert.throws(() => verifyContinuation(wrong), /deep-equal/);
});
