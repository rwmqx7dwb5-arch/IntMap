/* atlas-server-caps — the server twin of the page's GIS (data.gis) runs the page's own GIS on a whole table in ONE call (no model per row) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';
import { SERVER_CAPS, makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';

const gis = makeHeadlessGis({ loadGis, now: () => Date.now() });
const lane = makeServerCaps({ gis });

test('① data.gis is a twin the lane hands out, and its operations are the ones the GIS declares', async () => {
  assert.ok(SERVER_CAPS['data.gis']);
  assert.ok(lane.catalogue().some((c) => c.id === 'data.gis'));
  const r = await lane.run('data.gis', { describe: true });
  assert.equal(r.ok, true);
  assert.ok(r.data.ops.length >= 10, 'discovered, not written: ' + r.data.ops.length);
  assert.deepEqual(r.data.ops.map((o) => o.id), (await gis.ops()).map((o) => o.id));
});

test('② a whole table is answered by one operation: 500 points against 40 sites, no per-row call', async () => {
  const pt = (k, id, lng, lat) => ({ type: 'Feature', properties: { [k]: id }, geometry: { type: 'Point', coordinates: [lng, lat] } });
  const cities = Array.from({ length: 500 }, (_, i) => pt('city', 'c' + i, -170 + (i * 340) / 500, -60 + ((i * 37) % 120)));
  const ports = Array.from({ length: 40 }, (_, i) => pt('port', 'p' + i, -170 + i * 8.5, -50 + ((i * 53) % 100)));
  const r = await lane.run('data.gis', { op: 'nearestJoin', inputs: [cities, ports], params: {} });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
  assert.equal(r.data.count, 500);
  assert.equal(r.data.result.features.length, 500, 'the whole answer: where it is kept is decided by the runner (keepOutput), not by the twin');
  const keys = Object.keys(r.data.result.features[0].properties);
  assert.ok(keys.some((k) => /dist|km|nearest/i.test(k)), 'a distance column came back: ' + keys.join(','));
});

test('③ what the server cannot do is named, never a smaller answer', async () => {
  assert.equal((await lane.run('data.gis', { op: 'buffer', inputs: ['layer:ports'] })).code, 'part_unsupported_on_server');
  assert.equal((await lane.run('data.gis', { op: 'buffer', inputs: [], acquire: { bounds: [0, 0, 1, 1] } })).code, 'part_unsupported_on_server');
  assert.equal((await lane.run('data.gis', { op: 'nope', inputs: [[]] })).code, 'unknown_op');
  assert.equal((await makeServerCaps({}).run('data.gis', { describe: true })).code, 'no_gis', 'a runtime with no GIS says so');
});

test('④ a worker task\'s maxOutput is carried by a runner that says so, and still refused by name by one that does not; images stay refused by name', async () => {
  const { planJob } = await import('../js/atlas-job-core.js');
  assert.equal(planJob([{ goal: 'g', maxOutput: 8000 }], { maxOutput: true }).ok, true);
  assert.equal(planJob([{ goal: 'g', maxOutput: 8000 }], {}).error, 'output_size_unsupported_on_server');
  assert.equal(planJob([{ goal: 'g', images: ['image-1'] }], { maxOutput: true }).error, 'images_unsupported_on_server');
  const { readFileSync } = await import('node:fs');
  const run = readFileSync(new URL('../supabase/functions/_shared/atlas-job-runner.js', import.meta.url), 'utf8');
  assert.equal((run.match(/maxOutput: contract\.maxOutput/g) || []).length, 2, 'both model requests of the runner carry the task\'s budget');
  assert.equal((run.match(/estimate\([^)]*contract\.maxOutput[,)]/g) || []).length, 2, 'and both reservations are sized by it');
});
