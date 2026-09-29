/* Place framing — js/place-framing.js: how much of the map a named place gets.
 *
 * (was the framing half of tests/r185-checks.test.mjs; the satellites half is in
 * tests/engine-satellites-checks, the aircraft half in tests/engine-aircraft-checks, the Cesium half in
 * tests/engine-cesium-adapter-checks)
 *
 * (#R185) Everything here pins a decision that was made from a MEASUREMENT, so the test states the
 * measurement rather than the code: what the framing ladder answers for a place.
 * js/place-framing.js publishes window.IntMapPlaceFraming and touches nothing else, which is what makes
 * it testable without a browser — see its own header. Everything here RUNS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const framing = (() => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/place-framing.js'), ctx);
  return ctx.window.IntMapPlaceFraming;
})();

test('R185 framing: a compact country keeps its own footprint', () => {
  /* MEASURED from Nominatim: Monaco's administrative extent is 0.124° x 0.235° and its point sits at
     fy = 0.92 — near the north edge. #R183's "the point must be in the middle 60 %" rule threw that box
     away and fell back to the flat `country` zoom of 4.4, i.e. the whole Mediterranean in answer to
     "Monaco". The rule is looking for an OUTLYING TERRITORY, and an outlier is a DISTANCE: Tokyo's point
     is 6.3° from the centre of its extent, Monaco's is 0.10°. */
  const monaco = { class: 'boundary', type: 'administrative', addresstype: 'country',
    boundingbox: ['43.7247', '43.7519', '7.4090', '7.5333'], lat: '43.7495', lon: '7.4128' };
  const fr = framing.framingFor(monaco, null);
  assert.equal(fr.cls, 'country');
  assert.ok(fr.bounds && !fr.bounds.huge, 'Monaco must be framed by its own extent, not by the country zoom');
});

test('R185 framing: an outlying territory still throws the extent away', () => {
  /* Tokyo Metropolis reaches 1,000 km south to Ogasawara; framing that real extent centres the map in
     open ocean with the city a speck at the top (#R183). The absolute-distance gate must not have let
     this one back in. */
  const tokyo = { class: 'boundary', type: 'administrative', addresstype: 'province',
    boundingbox: ['20.2531', '35.8984', '135.8548', '153.9868'], lat: '35.6764', lon: '139.6500' };
  const fr = framing.framingFor(tokyo, null);
  assert.equal(fr.bounds, null, 'an extent driven by an outlying territory is not a frame');
});

test('R185 framing: the classes that fell through to the town-sized default', () => {
  /* MEASURED: both are mapped in OSM as single NODES, so there is no extent and the class IS the answer
     — and neither class existed, so a 2,300 km reef and a 446 km canyon were both framed at the 12.2
     default, an 8 km window. */
  const reef = framing.placeClass({ class: 'natural', type: 'reef' }, null);
  const canyon = framing.placeClass({ class: 'natural', type: 'valley' }, null);
  assert.equal(reef, 'reef');
  assert.equal(canyon, 'valley');
  const z = framing.zoomTable();
  assert.ok(z.reef < 10 && z.valley < 11, 'a reef and a canyon are not town-sized');
  /* …and an unnamed natural feature is still a natural feature, not a default-sized one */
  assert.equal(framing.placeClass({ class: 'natural', type: 'moraine' }, null), 'natural');
  assert.ok(z.natural < framing.defaultZoom());
});

test('R185 framing: a protected area is not just "a boundary"', () => {
  assert.equal(framing.placeClass({ class: 'boundary', type: 'protected_area' }, null), 'reserve');
  assert.equal(framing.placeClass({ class: 'leisure', type: 'nature_reserve' }, null), 'reserve');
  /* the generic boundary answer is unchanged for everything else */
  assert.equal(framing.placeClass({ class: 'boundary', type: 'administrative' }, null), 'region');
});
