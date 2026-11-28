import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProbe, normalizeGeo, preflight } from '../js/atlas-geoplan.js';
import { makeAtlasPlan } from '../js/atlas-plan.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';

const gis = await loadGis();
const probe = defaultProbe({ IntMapGis: gis, IntMapCapabilities: { has: () => true } });
gis.data.add({
  id: 'my-points',
  title: 'Survey tracks',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [12, 34] }, properties: {} }],
});

function check(environment, source, method = { ops: ['buffer'] }) {
  const { spec } = normalizeGeo({
    environment,
    region: { bounds: [10, 30, 15, 38] },
    needs: [{ id: 'shape', source, completeness: 'sample' }],
    method,
  });
  return preflight(spec, probe);
}

test('a dataset visible on the device is reported separately from eligibility on the job server', async () => {
  const source = { kind: 'dataset', ref: 'my-points' };
  assert.equal((await check('browser-gis', source)).runnable, true);
  assert.equal((await check('browser-gis', { ...source, ref: 'Survey tracks' })).runnable, true);
  for (const environment of ['server', 'job']) {
    const result = await check(environment, source);
    assert.equal(result.needs[0].state, 'available');
    assert.equal(result.needs[0].execution.compatible, false);
    assert.equal(result.runnable, false);
    assert.ok(result.reasons.some((reason) => /dataset.*cannot be read in/.test(reason)));
  }
});

test('an HTTPS GeoJSON route on the server supports a whole file, without confirming coverage or availability', async () => {
  const geojson = { kind: 'url', ref: 'https://fixtures.example/points', format: 'geojson' };
  const possible = await check('job', { ...geojson, scope: 'whole' }, { ops: ['buffer'], strict: true });
  assert.equal(possible.needs[0].execution.compatible, true);
  assert.equal(possible.needs[0].state, 'unknown');
  assert.equal(possible.method.execution.strict, true);
  assert.equal(possible.runnable, null);
  const window = await check('job', { ...geojson, scope: 'window' });
  assert.equal(window.needs[0].execution.compatible, false);
  assert.equal(window.runnable, false);
  assert.ok(window.reasons.some((reason) => /scope.*window/.test(reason)));
  const grid = await check('job', { ...geojson, format: 'geotiff', scope: 'whole' });
  assert.equal(grid.needs[0].execution.compatible, false);
  assert.ok(grid.reasons.some((reason) => /format.*geotiff/.test(reason)));
});

test('format and scope are checked together for browser acquisition routes', async () => {
  const url = { kind: 'url', ref: 'https://fixtures.example/elevation.tif', format: 'geotiff' };
  const window = await check('browser-gis', { ...url, scope: 'window' });
  assert.equal(window.needs[0].execution.compatible, true);
  const whole = await check('browser-gis', { ...url, scope: 'whole' });
  assert.equal(whole.needs[0].execution.compatible, false);
});

test('the runtime declaration names whether semantic checks can be requested without running an operation', async () => {
  const requirements = { ops: ['buffer'], semantics: true };
  const browser = await check('browser-gis', { kind: 'dataset', ref: 'my-points' }, requirements);
  assert.equal(browser.method.execution.semantics, true);
  assert.equal(browser.runnable, true);
  const server = await check('server', { kind: 'job-output', ref: 'earlier-task' }, requirements);
  assert.equal(server.method.execution.semantics, false);
  assert.equal(server.runnable, false);
  assert.ok(server.reasons.some((reason) => /method\.semantics/.test(reason)));
});

test('later plan steps carry the selected execution location and acquisition requirements', async () => {
  const plan = makeAtlasPlan({ geoProbe: probe });
  plan.beginTurn();
  const source = { kind: 'url', ref: 'https://fixtures.example/features', format: 'geojson', scope: 'window' };
  plan.declare({ steps: ['Read the source', 'Calculate'], geo: { environment: 'job', needs: [{ id: 'data', source }], check: true } });
  await plan.preflight();
  plan.declare({ current: 2 });
  assert.match(plan.promptBlock(), /execution: job/);
  assert.match(plan.promptBlock(), /data url\/geojson\/window/);
  assert.match(plan.promptBlock(), /acquisition scope "window"/);
});

test('absence of a capability registry is an unknown observation', async () => {
  const { spec } = normalizeGeo({ environment: 'server', needs: [{ id: 'shape', source: { kind: 'job-output', ref: 'previous' } }] });
  const result = await preflight(spec, defaultProbe({ IntMapGis: gis }));
  assert.equal(result.environment.available, null);
  assert.equal(result.runnable, null);
});
