/* IntMap · the worldwide 3D building sources: the geoid grid, which source opens where, and what a better source cuts out of a worse one.
   Hermetic (no network, no WebGL). The live heights are measured in the browser and on the tiles' own data: dev-notes/2026-11-20-world-3d-buildings.md. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { mountGeoid, GEOID_COLS, GEOID_ROWS } from '../js/geoid.js';
import { WORLD_3D_SOURCES, worldSourcesNear, excludeBoxesFor, PLATEAU_QUALITY, worldTilesetId } from '../js/world-3d-sources.js';

const N = mountGeoid(zlib.gunzipSync(fs.readFileSync(new URL('../data/geoid-egm2008.bin.gz', import.meta.url))));

test('the geoid grid has the declared shape and reproduces EGM2008 at known places (±1.5 m, the grid\'s own stated error)', () => {
  assert.equal(zlib.gunzipSync(fs.readFileSync(new URL('../data/geoid-egm2008.bin.gz', import.meta.url))).length, GEOID_COLS * GEOID_ROWS * 2);
  /* values read from the Re:Earth tiles' own heights at these sites (dev-notes 2026-11-20-world-3d-buildings §2) and GSI's calculator for Tokyo */
  for (const [name, lng, lat, n] of [['paris', 2.3522, 48.8566, 44.7], ['denver', -104.99, 39.7392, -17.2], ['mumbai', 72.8777, 19.076, -68.5], ['sydney', 151.2093, -33.8688, 22.2], ['newyork', -73.9857, 40.7484, -32.9], ['tokyo', 139.7671, 35.676, 36.8]])
    assert.ok(Math.abs(N(lng, lat) - n) < 1.5, `${name}: ${N(lng, lat).toFixed(2)} vs ${n}`);
  assert.ok(Math.abs(N(180, 0) - N(-180, 0)) < 1e-9, 'the antimeridian is one place');
  assert.ok(Number.isFinite(N(0, 90)) && Number.isFinite(N(0, -90)), 'the poles are defined');
});

test('mountGeoid refuses a grid of the wrong size instead of reading garbage', () => {
  assert.throws(() => mountGeoid(new ArrayBuffer(10)), /expected/);
});

test('a source opens only from its minZoom and near its extent; hysteresis keeps an open one at the edge', () => {
  const paris = { lng: 2.35, lat: 48.86 };
  assert.deepEqual(worldSourcesNear(WORLD_3D_SOURCES, { ...paris, zoom: 11 }).map((s) => s.id), [], 'below the worldwide minimum zoom nothing opens');
  assert.deepEqual(worldSourcesNear(WORLD_3D_SOURCES, { ...paris, zoom: 14 }).map((s) => s.id), ['reearth-buildings']);
  assert.deepEqual(worldSourcesNear(WORLD_3D_SOURCES, { lng: 4.9, lat: 52.37, zoom: 14 }).map((s) => s.id).sort(), ['3dbag', 'reearth-buildings']);
  assert.ok(!worldSourcesNear(WORLD_3D_SOURCES, { lng: 4.9, lat: 52.37, zoom: 14 }).some((s) => s.id === 'x'));
  /* 3D BAG opens from z10 where the worldwide set does not */
  assert.deepEqual(worldSourcesNear(WORLD_3D_SOURCES, { lng: 4.9, lat: 52.37, zoom: 10.5 }).map((s) => s.id), ['3dbag']);
});

test('a better dataset cuts its extent out of a worse one, and never out of itself or something better', () => {
  const open = [{ quality: PLATEAU_QUALITY, bbox: [139, 35, 140, 36] }, { quality: 2, bbox: [3.2, 50.7, 7.3, 53.6] }, { quality: 1, bbox: [-180, -85, 180, 85] }];
  assert.deepEqual(excludeBoxesFor(1, open), [[139, 35, 140, 36], [3.2, 50.7, 7.3, 53.6]]);
  assert.deepEqual(excludeBoxesFor(2, open), [[139, 35, 140, 36]]);
  assert.deepEqual(excludeBoxesFor(PLATEAU_QUALITY, open), []);
});

test('every source carries its licence, a credit and a URL on a host the privacy ledger knows', () => {
  const hosts = JSON.parse(fs.readFileSync(new URL('../scripts/outbound-hosts.json', import.meta.url), 'utf8'));
  const known = new Set((hosts.hosts || hosts).map((h) => h.host));
  for (const s of WORLD_3D_SOURCES) {
    assert.ok(s.licence && s.licenceUrl && s.credit && s.provider, s.id + ' states its terms');
    assert.ok(known.has(new URL(s.url).host), s.id + ': ' + new URL(s.url).host + ' is in scripts/outbound-hosts.json');
    assert.ok(worldTilesetId(s.id).startsWith('world3d-'));
  }
  assert.equal(new Set(WORLD_3D_SOURCES.map((s) => s.id)).size, WORLD_3D_SOURCES.length);
});

test('the engine contract carries placeTileset in the Cesium adapter, the MapLibre refusal, the facade and the types', () => {
  const R = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.match(R('js/cesium-engine.js'), /\n    placeTileset\(id,o\)\{/);
  assert.match(R('js/geo-engine.js'), /placeTileset\(\)\{ return false; \}/);
  assert.match(R('js/geo-engine.js'), /placeTileset:\(id,o\)=>A\(\)\.placeTileset/);
  assert.match(R('types/geo-engine.d.ts'), /placeTileset\(id\?: any, o\?: any\): any;/);
});
