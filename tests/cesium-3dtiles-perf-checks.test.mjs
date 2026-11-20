/* IntMap · the 3D Tiles capability and the Cesium frame instrument — what a regression here would look like.
   Source-level: the engine is not run (no WebGL in node); what is asserted is the CONTRACT between the three tables, the
   adapter and the layer, plus the catalogue facts the layer relies on. The live behaviour is measured in the browser (dev-notes). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { plateauTilesetUrl, plateauTilesetId, plateauSpec, plateauUnitsNear, distanceToBoxKm } from '../js/plateau-cities.js';

const R = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const cesium = R('js/cesium-engine.js'), geo = R('js/geo-engine.js'), types = R('types/geo-engine.d.ts');

test('tiles3d is declared by all three capability tables: true for Cesium, false for MapLibre', () => {
  assert.equal((cesium.match(/tiles3d:true/g) || []).length, 1);
  assert.equal((geo.match(/tiles3d:true/g) || []).length, 1, 'the contract copy of the Cesium table');
  assert.equal((geo.match(/tiles3d:false/g) || []).length, 1, 'MapLibre has no 3D Tiles primitive');
  assert.match(types, /tiles3d: boolean/);
});

test('the Cesium adapter answers the five tileset members and both measurement members; MapLibre refuses the tileset ones', () => {
  for (const m of ['addTileset', 'removeTileset', 'setTilesetVisible', 'hasTileset', 'tilesetInfo', 'instrumentFrames', 'sceneStats'])
    assert.match(cesium, new RegExp('\\n      ' + m + '\\('),'adapter member ' + m);
  assert.match(geo, /addTileset\(\)\{ return false; \}/);
  assert.match(geo, /addTileset:\(id,s\)=>A\(\)\.addTileset\?/, 'the facade forwards it');
});

test('instrumentFrames wraps scene.render once and never twice', () => {
  const body = cesium.slice(cesium.indexOf('    instrumentFrames(cb){'), cesium.indexOf('    sceneStats(){'));
  assert.match(body, /if\(!this\.__frameSinks\)/, 'the wrapper is installed under a guard, so a second caller adds a sink and not a wrapper');
  assert.equal((body.match(/sc\.render=function/g) || []).length, 1);
});

test('sceneStats answers null for an unknown tile count, never 0', () => {
  const body = cesium.slice(cesium.indexOf('    sceneStats(){'), cesium.indexOf('    addTileset(id,spec){'));
  assert.match(body, /let tiles=null,held=null,via='unknown'/);
});

const REG = JSON.parse(R('data/plateau-cities.json')).units;

test('the PLATEAU registry is derived (hundreds of units, Tokyo included), one distinct id and URL each, on the host the privacy ledger names', () => {
  assert.ok(REG.length >= 300, 'units: ' + REG.length);
  assert.equal(new Set(REG.map((u) => plateauTilesetUrl(u))).size, REG.length);
  assert.equal(new Set(REG.map((u) => plateauTilesetId(u.code))).size, REG.length);
  const tokyo = REG.filter((u) => /^131(0[1-9]|1[0-9]|2[0-3])$/.test(u.code));
  assert.equal(tokyo.length, 23);                                        /* the 23 wards are still all there, now by discovery */
  assert.equal(plateauTilesetUrl(REG.find((u) => u.code === '13101')), 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json');
  const hosts = JSON.parse(R('scripts/outbound-hosts.json')).hosts.map((h) => h.host);
  assert.ok(hosts.includes('api.plateauview.mlit.go.jp'));
  assert.doesNotMatch(R('js/plateau-cities.js'), /PLATEAU_CITY_CODES|length: 23/);   /* no hand-written list */
});

test('the geoid height is per city and derived — Tokyo ≈ 36.7 m as measured, other cities different, none invented in the engine', () => {
  assert.doesNotMatch(cesium, /geoidOffset|GEOID_/);                       /* the engine invents none: heightOffset defaults to 0 */
  const chiyoda = REG.find((u) => u.code === '13101');
  assert.ok(Math.abs(chiyoda.geoid - 36.7) < 0.5, 'Chiyoda geoid ' + chiyoda.geoid);   /* the rendered-tile measurement of 2026-11-19 */
  const g = REG.map((u) => u.geoid); assert.ok(Math.max(...g) - Math.min(...g) > 10, 'one number for all of Japan would be wrong');
  for (const u of REG) { assert.ok(u.geoid > 0 && u.geoid < 60, u.code); assert.equal(plateauSpec(u).spec.heightOffset, -u.geoid); }
  assert.match(R('scripts/build-plateau-cities.mjs'), /GSI|vldb.gsi.go.jp/);   /* the derivation names its source */
});

test('only units near the camera are open, nearest first, capped; nothing below the building zoom', () => {
  const tokyo = { lng: 139.76, lat: 35.68 };
  assert.deepEqual(plateauUnitsNear(REG, { ...tokyo, zoom: 6 }), []);
  const near = plateauUnitsNear(REG, { ...tokyo, zoom: 11 });
  assert.ok(near.length > 0 && near.length <= 32);
  assert.ok(near.every((u) => distanceToBoxKm(tokyo.lng, tokyo.lat, u.bbox) <= 60));
  assert.equal(near[0].code, '13101');                                      /* the ward under the camera comes first */
  assert.ok(!near.some((u) => u.pref === '大阪府'));
  const osaka = plateauUnitsNear(REG, { lng: 135.5, lat: 34.69, zoom: 11 });
  assert.ok(osaka.length > 0 && osaka[0].code.startsWith('27') && osaka.some((u) => u.code === '27127'));
});
