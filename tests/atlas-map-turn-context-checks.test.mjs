import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasState } from '../js/atlas-state.js';
import { makeTurnObserver } from '../js/evidence-graph-record.js';
import { makeGoalVerify } from '../js/atlas-goal-verify.js';

test('the first map context follows the selected object geometry and keeps other objects brief', () => {
  const state = makeAtlasState({});
  const selection = { id: 'draw-1', at: 1700000000000 };
  const line = { id: 'draw-1', kind: 'annot', geom: 'line', name: 'Drawing', shape: {
    endpoints: [[30, 40], [30.25, 40.75]], bounds: [30, 40, 30.25, 40.75],
    provenance: { author: 'user', createdAt: 1700000000000, transformation: 'manual_drawing' },
  } };
  const area = { id: 'zone-1', kind: 'shape', geom: 'area', name: 'Watershed', areaKm2: 45,
    shape: { bounds: [30, 40, 32, 42], provenance: { author: 'atlas', source: 'Regional Survey', createdAt: 1700000000001 } },
    edited: { author: 'user', at: 1700000000002 } };
  const other = { id: 'draw-2', kind: 'annot', geom: 'line', name: 'Other', shape: { endpoints: [[1, 2], [3, 4]] } };
  const snap = { objects: { n: 3, selected: selection, items: [line, area, other] } };
  const before = state.renderPrompt(snap);
  assert.match(before, /"endpoints":\[\[30,40\],\[30\.25,40\.75\]\]/);
  assert.match(before, /"areaKm2":45/);
  assert.match(before, /"source":"Regional Survey"/);
  assert.match(before, /"createdBy":"atlas".*"lastEditedBy":"user"/);
  assert.doesNotMatch(before, /\[\[1,2\],\[3,4\]\]/);
  line.shape.endpoints[1] = [31.25, 41.75];
  assert.match(state.renderPrompt(snap), /"endpoints":\[\[30,40\],\[31\.25,41\.75\]\]/);
});

test('the opening map context exposes held dataset extent, time, fields and coverage', () => {
  const state = makeAtlasState({});
  const snap = { viewport: { west: 171, south: 2, east: -171, north: 7 }, datasets: [
    { id: 'slope', title: 'Elevation', kind: 'raster', bounds: [174, 3, -174, 6], boundsBasis: 'measured',
      time: { kind: 'constant', start: Date.parse('2022-01-01'), end: Date.parse('2022-12-31') },
      bands: [{ name: 'elevation', unit: 'm' }], coverage: { completeness: 'partial', reason: 'tile-missing' } },
  ] };
  const initial = state.renderPrompt(snap);
  for (const fact of ['slope', 'Elevation', 'elevation', '2022-01-01', 'tile-missing', '[174,3,-174,6]']) assert.ok(initial.includes(fact), fact);
});

test('concurrent page datasets are only attributed with an exact creation receipt and matching version', () => {
  const datasets = [{ id: 'reader', title: 'Reader layer', count: 1, createdAt: 15 }, { id: 'atlas', title: 'Atlas result', count: 1, createdAt: 16 }];
  const scope = { IntMapData: { list: () => datasets, versionOf: (id) => id === 'atlas' ? '16' : '15' } };
  const observe = makeTurnObserver(10, scope, 'turn-key');
  const lines = observe({ results: [{ ok: true, details: { gis: { dataset: 'reader' }, datasetsCreated: [{ id: 'atlas', version: '16' }] } }] });
  assert.match(lines.join('\n'), /Atlas result/);
  assert.doesNotMatch(lines.join('\n'), /Reader layer/);
  assert.deepEqual(observe({ results: [{ ok: true, details: { datasetsCreated: [{ id: 'atlas', version: 'old' }] } }] }), []);
});

test('the verifier observes the opening map reference and only Atlas outputs with this turn’s operation and provenance', async () => {
  const state = makeAtlasState({});
  const row = (id, author, turnId, geom = 'line') => ({
    id, name: id, geom, shape: { bounds: [47, -12, 49, -10], endpoints: [[47, -12], [49, -10]],
      provenance: { author, turnId, createdAt: 1700000000000 } },
  });
  const input = row('Reader transect', 'user');
  const opening = state.focusObjects({ selected: { id: input.id, at: 1700000000010 }, items: [input] });
  const scope = { IntMapObjects: { list: () => [input, row('Manual measurement', 'user'), row('Previous result', 'atlas', 6),
    row('Basalt area', 'atlas', 7, 'area'), row('Unreceipted drawing', 'atlas', 7)] } };
  let prompt;
  const verify = makeGoalVerify({
    observe: makeTurnObserver(10, scope, 'turn-key', { turn: 7, initial: opening, describe: state.describeMapObject }),
    ask: async (text) => { prompt = text; return { data: { unmet: [] } }; },
  });
  await verify({ request: 'Use my transect and draw the basalt exposure.', text: 'Done.', results: [{
    ok: true, objectIds: ['Reader transect', 'Manual measurement', 'Previous result', 'Basalt area'],
  }] });
  assert.match(prompt, /Map reference present at request time: .*"id":"Reader transect".*"createdBy":"user"/);
  assert.match(prompt, /Atlas created and drew this object in this turn: .*"id":"Basalt area".*"createdBy":"atlas","createdAt":/);
  assert.doesNotMatch(prompt, /Manual measurement|Previous result|Unreceipted drawing/);
});
