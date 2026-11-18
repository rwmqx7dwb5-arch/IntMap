/* IntMap · the 3D Tiles capability and the Cesium frame instrument — what a regression here would look like.
   Source-level: the engine is not run (no WebGL in node); what is asserted is the CONTRACT between the three tables, the
   adapter and the layer, plus the catalogue facts the layer relies on. The live behaviour is measured in the browser (dev-notes). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLATEAU_CITY_CODES, plateauTilesetUrl, plateauTilesetId, plateauSpecs } from '../js/plateau-cities.js';

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

test('the PLATEAU list is the 23 special wards, one distinct URL and id each, on the host the privacy ledger names', () => {
  assert.equal(PLATEAU_CITY_CODES.length, 23);
  assert.equal(PLATEAU_CITY_CODES[0], 13101); assert.equal(PLATEAU_CITY_CODES.at(-1), 13123);
  assert.equal(new Set(PLATEAU_CITY_CODES.map(plateauTilesetUrl)).size, 23);
  assert.equal(new Set(PLATEAU_CITY_CODES.map(plateauTilesetId)).size, 23);
  assert.equal(plateauTilesetUrl(13101), 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod2-texture-latest/tileset.json');
  assert.equal(plateauSpecs().length, 23);
  const hosts = JSON.parse(R('scripts/outbound-hosts.json')).hosts.map((h) => h.host);
  assert.ok(hosts.includes('api.plateauview.mlit.go.jp'));
});

test('the engine never applies an invented geoid offset: heightOffset defaults to nothing', () => {
  assert.doesNotMatch(cesium, /geoidOffset|GEOID_/);
  assert.match(R('js/plateau-cities.js'), /no geoid offset|nothing here applies a geoid/);
});
