/* Regression checks for the quiet-fixes sweep (dev-notes/2026-11-17-quiet-fixes-sweep.md).
   Each case EVALUATES the code it guards (no source-text matching): the defect is reproduced
   through the module's own entry point. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEO_IMPORT } from '../js/geo-import.js';
import { fetchRuptureRing } from '../js/seismic-events.js';

const { readGeoFile } = GEO_IMPORT;
const file = (name, body) => new File([Buffer.from(body, 'utf8')], name);
const coords = (r) => r.fc.features.map((f) => f.geometry.coordinates);

test('a ";" CSV with dot decimals keeps its decimal points', async () => {
  const csv = 'name;lat;lon\n' +
    'Amsterdam;52.37;4.9\n' +
    'Utrecht;52.09;5.12\n' +
    'Lyon;45.76;4.83\n' +
    'Nice;43.7;7.26\n';
  const r = await readGeoFile(file('nl.csv', csv));
  assert.equal(r.ok, true);
  assert.deepEqual(coords(r)[0], [4.9, 52.37]);
  assert.deepEqual(coords(r)[3], [7.26, 43.7]);
});

test('a ";" CSV with decimal commas (and dotted thousands) still reads as before', async () => {
  const csv = 'name;lat;lon;pop\n' +
    'Berlin;52,52;13,405;3.645.000\n' +
    'Hamburg;53,55;9,99;1.841.000\n' +
    'München;48,14;11,58;1.472.000\n' +
    'Köln;50,94;6,96;1.086.000\n';
  const r = await readGeoFile(file('de.csv', csv));
  assert.equal(r.ok, true);
  assert.deepEqual(coords(r)[0], [13.405, 52.52]);
});

test("-0°30' keeps its minus sign", async () => {
  const csv = 'name,lat,lon\n' +
    'A,"51°28′0″","-0°30′0″"\n' +
    'B,"51°30′0″","-0°7′0″"\n' +
    'C,"51°45′0″","-1°15′0″"\n' +
    'D,"52°12′0″","0°7′0″"\n';
  const r = await readGeoFile(file('dms.csv', csv));
  assert.equal(r.ok, true);
  const c = coords(r);
  assert.ok(Math.abs(c[0][0] - -0.5) < 1e-9, 'got ' + c[0][0]);
  assert.ok(c[1][0] < 0);
  assert.ok(c[3][0] > 0);
});

test('a failed rupture request is not cached; "no rupture published" is', async () => {
  let calls = 0;
  const failing = () => { calls++; return Promise.resolve({ ok: false, status: 503 }); };
  const ev = { usgs: 'quiet-fixes-sweep-transient' };
  assert.equal(await fetchRuptureRing(ev, failing), null);
  assert.equal(await fetchRuptureRing(ev, failing), null);
  assert.equal(calls, 2, 'the second selection asks again after an HTTP failure');

  let calls2 = 0;
  const noRupture = () => { calls2++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ properties: { products: {} } }) }); };
  const ev2 = { usgs: 'quiet-fixes-sweep-none' };
  assert.equal(await fetchRuptureRing(ev2, noRupture), null);
  assert.equal(await fetchRuptureRing(ev2, noRupture), null);
  assert.equal(calls2, 1, 'an answer of "no rupture" is kept');
});
