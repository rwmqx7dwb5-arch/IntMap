/* ============================================================================
 *  GIS · PIPELINES OVER A REGION, AND EXTERNAL FORECAST DATA BROUGHT BACK
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE WRITTEN AS THE DEFECT, NOT AS THE FIX:
 *    ① moving the region recomputes ONLY the steps that use it and what is made from them; an
 *      unrelated branch is left alone (a reused step is the same dataset, not a re-fetch)
 *    ② a failed step does not leave its dependents holding the old region's answer as if it matched:
 *      they are skipped, invalidated (`stale`), and the failing reason is the registry/door's own
 *    ③ an analysis the session already holds can be captured, and an import (no recipe) is REFUSED
 *      by name rather than frozen in while the region moves
 *    ④ the pipeline survives a save and a load: the datasets come back under their ids and the steps
 *      are found again, so the first run after a reopen reuses them
 *    ⑤ forecast data are kept as FOUR things: model estimates and the provider-stated uncertainty are
 *      separate datasets with their own provenance; observations are only referenced, and with none
 *      the record says so; the reader's condition is compared, never fed to the model
 *    ⑥ a request that failed is a missing point, never a zero, and the record says it is incomplete
 *    ⑦ no source is named that is not actually called: the table's URLs are the two real ones
 * ==========================================================================*/
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIDB, installWindow, isolate } from './helpers/geo-shared.mjs';

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);

describe('§ pipelines · region-driven partial recomputation', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot(execFor) {
    const w = installWindow();
    const store = new Map();
    w.indexedDB = globalThis.indexedDB = fakeIDB(store);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    const { makeGisPipeline } = await import('../js/gis-analysis-pipeline.js');
    const data = makeGisDatasets(); const geometry = makeGisGeometry(); const ops = makeGisOps(); const project = makeGisProject();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisProject = project;
    await geometry.ready();
    const calls = [];
    /* the stand-in for the `gis` door: acquisitions make points inside the asked window, ops go to the real kernel */
    const exec = async (a) => {
      calls.push(a.op ? 'op:' + a.op : 'acquire:' + a.inputs[0]);
      if (execFor && execFor(a) === 'refuse') return { ok: false, why: 'layer-not-visible', detail: { layer: a.inputs[0] } };
      if (!a.op) {
        const b = a.acquire.bounds;
        const d = data.add({ title: 'acq ' + a.inputs[0], features: [pt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, { n: 1 })], provenance: { kind: 'layer', layer: a.inputs[0].replace(/^layer:/, ''), bounds: b, at: 1 } });
        return { ok: true, dataset: { id: d.id } };
      }
      const r = await ops.run({ op: a.op, inputs: a.inputs, params: a.params || {} });
      return r.ok ? { ok: true, dataset: { id: r.dataset.id } } : r;
    };
    const pipeline = makeGisPipeline({ exec });
    w.IntMapGisPipeline = pipeline;
    return { w, data, ops, project, pipeline, calls, store };
  }
  const REGION_A = [139, 35, 140, 36], REGION_B = [135, 34, 136, 35];
  const twoBranches = () => ({
    region: REGION_A,
    steps: [
      { id: 'roads', action: { type: 'gis', inputs: ['layer:roads'], acquire: { bounds: '$region' } } },
      { id: 'buf', action: { type: 'gis', op: 'buffer', inputs: ['$step:roads'], params: { radiusKm: 2 } } },
      { id: 'fixed', action: { type: 'gis', inputs: ['layer:ports'], acquire: { bounds: [0, 0, 1, 1] } } },
    ],
  });

  test('① the region moves only the steps that use it and what is made from them', async () => {
    const { pipeline, calls } = await boot();
    const d = pipeline.define(twoBranches());
    assert.equal(d.ok, true);
    assert.deepEqual(d.regionBound, ['roads']);
    const first = await pipeline.run(d.id);
    assert.deepEqual(first.ran, ['roads', 'buf', 'fixed']);
    const portsBefore = first.datasets.fixed;
    const again = await pipeline.run(d.id);
    assert.deepEqual(again.ran, [], 'nothing changed, so nothing is recomputed');
    assert.deepEqual(again.reused, ['roads', 'buf', 'fixed']);
    const plan = pipeline.plan(d.id, { region: REGION_B });
    assert.deepEqual(plan.affected, ['roads', 'buf']);
    assert.deepEqual(plan.reused, ['fixed']);
    calls.length = 0;
    const moved = await pipeline.setRegion(d.id, REGION_B);
    assert.deepEqual(moved.ran, ['roads', 'buf']);
    assert.deepEqual(moved.reused, ['fixed']);
    assert.equal(moved.datasets.fixed, portsBefore, 'the unrelated branch is the SAME dataset');
    assert.ok(!calls.some((c) => c === 'acquire:layer:ports'), 'and it was not fetched again');
    assert.notEqual(moved.datasets.roads, first.datasets.roads);
  });

  test('① a parameter change recomputes that step and its dependents, not the acquisition', async () => {
    const { pipeline, calls } = await boot();
    const d = pipeline.define(twoBranches());
    await pipeline.run(d.id);
    calls.length = 0;
    const r = await pipeline.setParams(d.id, 'buf', { radiusKm: 5 });
    assert.deepEqual(r.ran, ['buf']);
    assert.deepEqual(r.reused, ['roads', 'fixed']);
    assert.deepEqual(calls, ['op:buffer']);
  });

  test('② a failed step skips and invalidates what is below it, and an unrelated branch still runs', async () => {
    let refuse = false;
    const { pipeline, data } = await boot((a) => (refuse && a.inputs[0] === 'layer:roads') ? 'refuse' : null);
    const d = pipeline.define(twoBranches());
    const first = await pipeline.run(d.id);
    refuse = true;
    const r = await pipeline.setRegion(d.id, REGION_B);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failed.map((f) => f.id), ['roads']);
    assert.equal(r.failed[0].why, 'layer-not-visible', "the door's own reason is carried");
    assert.deepEqual(r.skipped.map((f) => f.id), ['buf']);
    assert.ok(data.stale(first.datasets.buf), 'the old buffer is marked stale, not silently kept');
    assert.ok(data.has(first.datasets.roads), 'the last computed answer is kept, marked, not deleted');
    assert.deepEqual(r.reused, ['fixed']);
  });

  test('③ capture: an op chain becomes a pipeline; an import is refused by name', async () => {
    const { pipeline, data, ops } = await boot();
    const acq = data.add({ title: 'roads', features: [pt(139.5, 35.5)], provenance: { kind: 'layer', layer: 'roads', bounds: REGION_A, at: 1 } });
    const b = await ops.run({ op: 'buffer', inputs: [acq.id], params: { radiusKm: 3 } });
    assert.equal(b.ok, true);
    const c = pipeline.capture(b.dataset.id);
    assert.equal(c.ok, true);
    assert.deepEqual(c.region, REGION_A);
    const desc = pipeline.describe(c.id);
    assert.deepEqual(desc.steps.map((s) => s.dependsOn), [[], ['s1']]);
    assert.equal(desc.steps[0].usesRegion, true, 'the acquisition window became $region');
    assert.deepEqual((await pipeline.run(c.id)).ran, [], 'bound to what exists, so the first run reuses it');
    const imported = data.add({ title: 'a csv', features: [pt(1, 1)], provenance: { kind: 'import' } });
    const bi = await ops.run({ op: 'buffer', inputs: [imported.id], params: { radiusKm: 1 } });
    const refused = pipeline.capture(bi.dataset.id);
    assert.equal(refused.ok, false);
    assert.equal(refused.why, 'not-capturable');
  });

  test('③ a definition is refused when a step names a later or unknown step, or $region has no region', async () => {
    const { pipeline } = await boot();
    const act = (x) => ({ type: 'gis', inputs: [x] });
    assert.equal(pipeline.define({ steps: [{ id: 'a', action: act('$step:b') }, { id: 'b', action: act('layer:x') }] }).why, 'step-order');
    assert.equal(pipeline.define({ steps: [{ id: 'a', action: act('$step:zz') }] }).why, 'step-unknown');
    assert.equal(pipeline.define({ steps: [{ id: 'a', action: { inputs: ['layer:x'], acquire: { bounds: '$region' } } }] }).why, 'region-missing');
    assert.equal(pipeline.define({ steps: [] }).why, 'no-steps');
    assert.equal(pipeline.define({ region: [10, 0, 5, 1], steps: [{ id: 'a', action: act('layer:x') }] }).why, 'region-invalid');
  });

  test('④ saved with the project and found again after a reopen', async () => {
    const { pipeline, project, data, w, store } = await boot();
    const d = pipeline.define(twoBranches());
    const first = await pipeline.run(d.id);
    const s = await pipeline.save('with pipeline');
    assert.equal(s.ok, true);
    data.clear();
    const loaded = await project.load(s.id);
    assert.ok(loaded.restored >= 1);
    assert.ok(loaded.extras && loaded.extras.pipelines.length === 1, 'the definitions came back in the same record');
    const { makeGisPipeline } = await import('../js/gis-analysis-pipeline.js');
    let ran = 0;
    const fresh = makeGisPipeline({ exec: async () => { ran++; return { ok: false, why: 'should-not-run' }; } });
    assert.deepEqual(fresh.restore(loaded).restored, [{ id: d.id, ok: true }]);
    const r = await fresh.run(d.id);
    assert.equal(ran, 0, 'every step found its dataset under the saved id');
    assert.deepEqual(r.reused, ['roads', 'buf', 'fixed']);
    assert.deepEqual(r.datasets, first.datasets);
    assert.ok(w && store);
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
describe('§ forecast · external model output as separate, labelled datasets', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* the documented shape of the real answers (measured 2026-11-20): an array for several locations */
  const floodAnswer = (lats, lngs) => lats.map((la, i) => ({
    latitude: la, longitude: lngs[i],
    daily_units: { river_discharge: 'm³/s' },
    daily: { time: ['2026-11-20', '2026-11-21', '2026-11-22'], river_discharge: [100 + i, 180 + i, 90], river_discharge_min: [95, 150, 80], river_discharge_max: [110, 260, 99], river_discharge_p25: [98, 170, 85], river_discharge_p75: [104, 200, 95] },
  }));
  const qs = (url) => { const u = new URL(url); return { la: u.searchParams.get('latitude').split(',').map(Number), lo: u.searchParams.get('longitude').split(',').map(Number), u }; };

  async function boot(fetchJSON) {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisForecast } = await import('../js/gis-forecast.js');
    const data = makeGisDatasets();
    w.IntMapData = data;
    const urls = [];
    const fc = makeGisForecast({ data, now: () => Date.UTC(2026, 10, 20, 3), fetchJSON: async (u) => { urls.push(u); return fetchJSON(u); } });
    return { fc, data, urls };
  }
  const ASK = { source: 'open-meteo-flood', bounds: [139, 35, 140, 36], nx: 2, ny: 2, days: 3, conditions: { threshold: 150 } };

  test('⑤ estimates and uncertainty are separate datasets; observations are only referenced', async () => {
    const { fc, data, urls } = await boot((u) => { const q = qs(u); return floodAnswer(q.la, q.lo); });
    const res = await fc.fetchForecast(ASK);
    assert.equal(res.ok, true);
    assert.match(urls[0], /^https:\/\/flood-api\.open-meteo\.com\/v1\/flood\?/);
    assert.equal(res.record.observations.status, 'none-supplied');
    assert.deepEqual(res.record.userConditions, { threshold: 150 });
    assert.equal(res.record.complete, true);
    const reg = fc.register(res);
    assert.equal(reg.ok, true);
    assert.notEqual(reg.datasets.modelEstimate, reg.datasets.uncertainty);
    const est = data.get(reg.datasets.modelEstimate).features(), unc = data.get(reg.datasets.uncertainty).features();
    assert.ok(est.every((f) => f.properties.dataClass === 'model-estimate'));
    assert.ok(unc.every((f) => f.properties.dataClass === 'uncertainty'));
    assert.equal(est.length, 4);
    assert.equal(est[0].properties.value, 180, 'the peak over the horizon');
    assert.equal(est[0].properties.peakDate, '2026-11-21');
    assert.equal(est[0].properties.exceeds, true, 'compared with the reader\'s threshold');
    assert.equal(unc[0].properties.low, 150); assert.equal(unc[0].properties.high, 260);
    assert.equal(unc[0].properties.spread, 110);
    assert.equal(unc[0].properties.basis, 'ensemble-members');
    assert.equal(data.get(reg.datasets.modelEstimate).provenance.dataClass, 'model-estimate');
    assert.equal(data.get(reg.datasets.uncertainty).provenance.dataClass, 'uncertainty');
    assert.equal(data.get(reg.datasets.modelEstimate).provenance.terms.dataLicence, 'CC BY 4.0');
    /* the answered coordinates, not the asked ones, are what is recorded */
    assert.ok(est.every((f, i) => f.geometry.coordinates[0] === qs(urls[0]).lo[i]));
    /* observations given by the caller stay references */
    const res2 = await fc.fetchForecast(Object.assign({}, ASK, { observations: ['ds-9'] }));
    assert.deepEqual(res2.record.observations, { status: 'referenced', datasets: ['ds-9'] });
  });

  test('⑤ without a stated threshold nothing is compared; a source with no spread states none', async () => {
    const wx = (u) => { const q = qs(u); return q.la.map((la, i) => ({ latitude: la, longitude: q.lo[i], daily: { time: ['2026-11-20', '2026-11-21'], precipitation_sum: [1.5, 12] } })); };
    const { fc, urls } = await boot(wx);
    const res = await fc.fetchForecast({ source: 'open-meteo-forecast', bounds: [139, 35, 140, 36], nx: 1, ny: 1, days: 2 });
    assert.equal(res.ok, true);
    assert.equal(res.estimates[0].properties.exceeds, null);
    assert.equal(res.uncertainty.length, 0, 'no spread is invented from a single run');
    assert.equal(res.record.uncertainty.basis, 'not-stated');
    assert.match(urls[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    assert.equal(res.estimates[0].properties.unit, 'mm');
  });

  test('⑥ a failed request is a missing point, never a zero', async () => {
    let n = 0;
    const { fc } = await boot((u) => { n++; if (n === 2) throw new Error('HTTP 429'); const q = qs(u); return floodAnswer(q.la, q.lo); });
    /* 60 points → two chunks of 50 and 10; the second fails */
    const res = await fc.fetchForecast({ source: 'open-meteo-flood', bounds: [139, 35, 140, 36], nx: 10, ny: 6, days: 3 });
    assert.equal(res.ok, true);
    assert.equal(res.estimates.length, 50);
    assert.equal(res.record.complete, false);
    assert.equal(res.record.failed.length, 1);
    assert.equal(res.record.failed[0].points, 10);
    const none = await (await boot(() => { throw new Error('offline'); })).fc.fetchForecast(ASK);
    assert.equal(none.ok, false);
    assert.equal(none.why, 'no-data');
  });

  test('⑦ refusals are named, and the table holds only the two real sources', async () => {
    const { fc } = await boot(() => []);
    assert.equal((await fc.fetchForecast({ source: 'population-forecast-v9', bounds: [0, 0, 1, 1] })).why, 'source-unknown');
    assert.equal((await fc.fetchForecast({ source: 'open-meteo-flood', bounds: [5, 0, 1, 1] })).why, 'bounds-invalid');
    assert.equal((await fc.fetchForecast({ source: 'open-meteo-forecast', bounds: [0, 0, 1, 1], variable: 'nonsense' })).why, 'variable-unknown');
    assert.deepEqual(fc.sources().map((s) => s.url).sort(), ['https://api.open-meteo.com/v1/forecast', 'https://flood-api.open-meteo.com/v1/flood']);
    assert.ok(fc.sources().every((s) => s.terms.url === 'https://open-meteo.com/en/terms' && /non-commercial/.test(s.terms.freeApi)));
  });

  test('⑤ the scenario report always has its four fields and says what it did not do', async () => {
    const { forecastReport } = await import('../js/atlas-reasoning.js');
    const { fc } = await boot((u) => { const q = qs(u); return floodAnswer(q.la, q.lo); });
    const res = await fc.fetchForecast(ASK);
    const rep = forecastReport(res.record);
    assert.equal(rep.complete, true);
    assert.equal(rep.assumptions[0].name, 'threshold');
    assert.equal(rep.assumptions[0].applied, true);
    assert.ok(rep.excluded.some((t) => /No observations/.test(t[0])));
    assert.ok(/Open-Meteo[.]com/.test(rep.dataUsed[0][0]) && /2026-11-20/.test(rep.dataUsed[0][0]));
    const other = forecastReport(Object.assign({}, res.record, { userConditions: { rainScale: 1.2 } }));
    assert.equal(other.assumptions[0].applied, false, 'a stated condition is recorded, not fed to the model');
  });
});
