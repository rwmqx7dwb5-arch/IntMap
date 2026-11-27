/* objects-area-opacity-observer — the `object` capability's verdict is read back per requested attribute from the live object list.
   THESE TESTS EVALUATE the shipped registry (makeAtlasCapabilities) over a stub IntMapObjects; the fill-opacity base and the
   per-figure removal are evaluated in tests/atlas-completion-routes-checks.test.mjs (B2b). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule, swappable } from './helpers/import-module.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { IntMapGeoEngine: ENGINE } = await import('../js/geo-engine.js');
const seat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: seat.value } } });
const cap = makeAtlasCapabilities({ lang: 'en' }).resolve('map.object');

/* two drawn lines: what the list reports is what the map holds */
function lines(a, b) { const objs = [Object.assign({ id: 'line_1', kind: 'line', name: 'A', hidden: false }, a), Object.assign({ id: 'line_2', kind: 'line', name: 'B', hidden: false }, b)]; window.IntMapObjects = { list: () => objs.map((o) => Object.assign({}, o)) }; return objs; }
function judge(args, mutate, applied, objectIds) {
  const o = lines({ color: '#2f9bff', width: 3, opacity: 0.9 }, { color: '#2f9bff', width: 3, opacity: 0.9 });
  const before = cap.observe();
  mutate(o);
  window.IntMapObjects = { list: () => o.map((x) => Object.assign({}, x)) };
  return cap.verify({}, args, before, cap.observe(), { ok: true, html: '', applied, objectIds });
}

test('colour asked, colour read back red → ok; the asked line, not the other', () => {
  const v = judge({ op: 'set', id: 'line_1', color: 'red' }, (o) => { o[0].color = '#ff0000'; }, { color: '#ff0000' }, ['line_1']);
  assert.equal(v.status, 'completed'); assert.equal(v.code, 'ok'); assert.deepEqual(v.objectIds, ['line_1']);
});
test('colour asked red but the map still reads blue (before and after both blue) is NOT completed', () => {
  const v = judge({ op: 'set', id: 'line_1', color: 'red' }, () => {}, { color: '#ff0000' }, ['line_1']);
  assert.notEqual(v.status, 'completed'); assert.equal(v.code, 'not_rendered'); assert.deepEqual(v.observed.notReadBack, ['color']);
});
test('only the width moved while the colour was asked: the colour is still not read back', () => {
  const v = judge({ op: 'set', id: 'line_1', color: 'red', width: 6 }, (o) => { o[0].width = 6; }, { color: '#ff0000', width: 6 }, ['line_1']);
  assert.notEqual(v.status, 'completed'); assert.deepEqual(v.observed.notReadBack, ['color']);
});
test('a value that was already right is already_there, not a change', () => {
  const v = judge({ op: 'set', id: 'line_1', color: '#2f9bff' }, () => {}, { color: '#2f9bff' }, ['line_1']);
  assert.equal(v.status, 'completed'); assert.equal(v.code, 'already_there');
});
test('opacity is compared as a value (0–100 input already normalised by the setter)', () => {
  const v = judge({ op: 'set', id: 'line_2', opacity: 50 }, (o) => { o[1].opacity = 0.5; }, { opacity: 0.5 }, ['line_2']);
  assert.equal(v.code, 'ok');
});
test('the call touched a different object than the one asked → wrong_target', () => {
  const v = judge({ op: 'set', id: 'line_1', color: 'red' }, (o) => { o[1].color = '#ff0000'; }, { color: '#ff0000' }, ['line_2']);
  assert.equal(v.status, 'failed'); assert.equal(v.code, 'wrong_target');
});
test('an attribute the setter did not apply is not completed', () => {
  const v = judge({ op: 'set', id: 'line_1', color: 'red' }, () => {}, {}, ['line_1']);
  assert.notEqual(v.status, 'completed');
});
test('an object that does not expose a value is not a failure (not observed ≠ failed)', () => {
  const v = judge({ op: 'set', id: 'line_1', opacity: 0.5 }, (o) => { delete o[0].opacity; }, { opacity: 0.5 }, ['line_1']);
  assert.equal(v.status, 'completed'); assert.deepEqual(v.observed.unread, ['opacity']);
});
