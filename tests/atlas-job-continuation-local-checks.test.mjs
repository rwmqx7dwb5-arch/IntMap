import test from 'node:test';
import assert from 'node:assert/strict';
import { makeJobsClient } from '../js/atlas-jobs-client.js';
import { planJob } from '../supabase/functions/_shared/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

test('the model-free GIS job restores its full saved output under a second lease', async () => {
  const coordinates = [[12.75, 48.125], [13.25, 48.5], [15.25, 48.75]];
  const features = coordinates.map((point, index) => ({
    type: 'Feature', properties: { keep: index < 2, payload: String(index).repeat(610000) },
    geometry: { type: 'Point', coordinates: point },
  }));
  const url = "https://example.org/survey.geojson";
  const plan = planJob([
    { id: 'load', kind: 'capability', capability: 'data.gis', args: { inputs: [url] } },
    { id: 'filter', kind: 'capability', capability: 'data.gis', inputs: [{ from: 'load' }], args: {
      op: 'filter', inputs: ['@load:data.result'], params: { where: [{ field: 'keep', op: '==', value: true }] },
    } },
  ], { kinds: ['capability'], capabilityOk: (id) => id === 'data.gis' });
  assert.ok(plan.ok);

  let now = 0;
  const db = fakeDb(plan.tasks);
  const job = db.st.job;
  const execute = (holder) => {
    const caps = makeServerCaps({ gis: makeHeadlessGis({ loadGis, now: () => now }), fetchGeoJson: async (address) => {
      assert.equal(address, url);
      return { ok: true, json: { type: 'FeatureCollection', features } };
    } });
    return runJob({
      db, job, holder, now: () => now, budgetMs: 30, leaseSeconds: 150,
      callModel: () => assert.fail('GIS continuation must never call a model'),
      money: { estimate: () => assert.fail('no model reservation'), actual: () => assert.fail('no model charge') },
      capabilities: { ...caps, async run(...args) { const value = await caps.run(...args); now += 31; return value; } },
    });
  };
  assert.deepEqual(await execute('h1'), { outcome: 'more' });
  assert.equal(job.lease_holder, null);
  assert.equal(db.st.tasks.get('filter').status, 'queued');
  const saved = db.st.tasks.get('load').result.data.output;
  assert.equal(saved.stored, 'artifact');
  assert.ok(saved.parts > 1);
  assert.equal(saved.count, 3);
  assert.deepEqual(saved.geometryTypes, ['Point']);
  assert.deepEqual(saved.sources, [url]);

  job.lease_holder = 'h2';
  assert.deepEqual(await execute('h2'), { outcome: 'finished' });
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result.incomplete, []);
  const filtered = db.st.tasks.get('filter').result;
  assert.deepEqual(filtered.reads, [{ id: saved.id, version: saved.version, count: 3, ok: true }]);
  assert.equal(filtered.data.output.count, 2);
  assert.notEqual(filtered.data.output.version, saved.version);
  assert.deepEqual(filtered.data.result.features.map(f => f.geometry.coordinates), coordinates.slice(0, 2));

  const client = makeJobsClient({ sb: db });
  const first = await client.output(job.id, 'load');
  const second = await client.output(job.id, 'load');
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.deepEqual(first.features, features);
  assert.equal(first.output.version, saved.version);
  db.st.artifacts.find(p => p.task_id === 'load').body.features[0].geometry.coordinates = [0, 0];
  assert.equal((await client.output(job.id, 'load')).code, 'output_incomplete');
});
