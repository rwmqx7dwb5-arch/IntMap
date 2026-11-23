/* The board (js/board*.js): a declaration is checked against the data, and ONE store links the widgets. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardState, passes } from '../js/board-state.js';
import { normalise, columnsOf, rowsToFeatures, MAX_ROWS } from '../js/board-spec.js';

const rows = [{ name: 'A', pop: 10, lng: 139, lat: 35 }, { name: 'B', pop: 30, lng: 2, lat: 48 }, { name: 'C', pop: null, lng: 'x', lat: 1 }];
const good = { title: 'T', source: 'unit test', data: { rows, lngField: 'lng', latField: 'lat' }, widgets: [{ kind: 'table' }, { kind: 'chart', x: 'name', y: 'pop' }, { kind: 'filter', field: 'pop' }, { kind: 'map' }] };

test('a declaration maps every widget kind to its Artifact section', () => {
  const r = normalise(good, null); assert.ok(r.ok);
  assert.deepEqual(r.spec.widgets.map((w) => w.section), ['Data', 'Analysis', 'Data', 'Map']);
  assert.equal(new Set(r.spec.widgets.map((w) => w.id)).size, 4);
});

test('refusals are named: unknown kind, missing column, missing source, no data', () => {
  assert.equal(normalise({ ...good, widgets: [{ kind: 'script', src: 'x' }] }, null).issues[0].why, 'unknown-kind:script');
  assert.match(normalise({ ...good, widgets: [{ kind: 'chart', x: 'name', y: 'nope' }] }, null).issues[0].why, /unknown-column:nope/);
  assert.equal(normalise({ ...good, source: '' }, null).issues[0].why, 'source-required');
  assert.equal(normalise({ ...good, data: {} }, null).issues[0].why, 'needs-dataset-or-rows');
  /* a dataset's columns are only known once it is loaded; they are then checked */
  assert.ok(normalise({ ...good, data: { dataset: 'ds-1' }, widgets: [{ kind: 'filter', field: 'zzz' }] }, null).ok);
  assert.ok(!normalise({ ...good, data: { dataset: 'ds-1' }, widgets: [{ kind: 'filter', field: 'zzz' }] }, ['pop']).ok);
});

test('no markup field survives normalisation', () => {
  const r = normalise({ ...good, widgets: [{ kind: 'table', html: '<img onerror=x>', columns: ['name'] }] }, null);
  assert.equal(JSON.stringify(r.spec).includes('onerror'), false);
});

test('param needs a real range', () => {
  assert.ok(!normalise({ ...good, widgets: [{ kind: 'param', dataset: 'ds-2', key: 'radiusKm', min: 5, max: 5 }] }, null).ok);
  const p = normalise({ ...good, widgets: [{ kind: 'param', dataset: 'ds-2', key: 'radiusKm', min: 1, max: 21 }] }, null).spec.widgets[0];
  assert.equal(p.step, 1);
});

test('rows become features; only valid coordinates make a point', () => {
  const f = rowsToFeatures(rows, 'lng', 'lat');
  assert.equal(f[0].geometry.type, 'Point'); assert.equal(f[2].geometry, null);
  assert.deepEqual(columnsOf(f), ['name', 'pop', 'lng', 'lat']);
  assert.equal(rowsToFeatures(new Array(MAX_ROWS + 5).fill({ a: 1 })).length, MAX_ROWS);
});

test('one store: selection, filter and params reach every subscriber, and a snapshot restores', () => {
  const st = createBoardState(); const seen = [];
  st.subscribe((e) => seen.push(e.what + ':' + e.source));
  const feats = rowsToFeatures(rows, 'lng', 'lat');
  st.toggle(1, 'table'); st.setFilter('f1', { field: 'pop', min: 20 }, 'f1'); st.setParam('p1', '7', 'p1');
  assert.deepEqual(seen, ['selection:table', 'filter:f1', 'param:p1']);
  assert.deepEqual(st.visible(feats), [1]);                         /* A is below the minimum; C has no value, which does not pass */
  const snap = st.snapshot(); const st2 = createBoardState(snap);
  assert.deepEqual(st2.get(), snap); assert.deepEqual(st2.visible(feats), [1]);
  st.toggle(1, 'table'); assert.deepEqual(st.get().selection, []);
  st.setFilter('f1', null); assert.deepEqual(st.visible(feats), [0, 1, 2]);
});

test('a missing value does not pass a range or category filter', () => {
  assert.equal(passes({ field: 'a', min: 0 }, { a: '' }), false);
  assert.equal(passes({ field: 'a', values: ['x'] }, { a: 'x' }), true);
  assert.equal(passes({ field: 'a', values: [] }, { a: 'q' }), true);
});

test('a throwing subscriber does not stop the others', () => {
  const st = createBoardState(); let n = 0;
  st.subscribe(() => { throw new Error('boom'); }); st.subscribe(() => { n++; });
  st.select([0]); assert.equal(n, 1);
});
