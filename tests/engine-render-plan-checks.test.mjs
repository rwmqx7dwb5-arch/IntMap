// The engine contract's two decisions that depend on the device and the engine: HOW to draw (render-plan) and HOW MUCH
// 3D Tiles the device is given (tileset-budget). Both are pure; the Cesium adapter and the facade must use them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickRenderMethod } from '../js/render-plan.js';
import { deviceTier, TIERS, tilesetBudget } from '../js/tileset-budget.js';
const R = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const PLAN = [{ method: 'tiles3d', needs: ['tiles3d'] }, { method: 'extrusion', needs: ['extrusion3d'] }];

test('the first candidate the engine can do is chosen; the rest are the fallback', () => {
  assert.deepEqual(pickRenderMethod({ tiles3d: true, extrusion3d: true }, PLAN), { method: 'tiles3d', index: 0, missing: [] });
  assert.deepEqual(pickRenderMethod({ tiles3d: false, extrusion3d: true }, PLAN), { method: 'extrusion', index: 1, missing: [] });
  const none = pickRenderMethod({}, PLAN);
  assert.equal(none.method, null); assert.deepEqual(none.missing, ['tiles3d']);
  assert.equal(pickRenderMethod(null, PLAN).method, null, 'no engine yet is "cannot", not a throw');
});

test('the real capability tables give the plan the answer the PLATEAU layer relies on', () => {
  const geo = R('js/geo-engine.js'), cesium = R('js/cesium-engine.js');
  assert.match(cesium, /tiles3d:true/); assert.match(geo, /tiles3d:false/);
  assert.match(geo, /plan\(candidates\)\{[^}]*pickRenderMethod\(a&&a\.capabilities,candidates\)/);
  assert.match(R('js/beta-overlays.js'), /GE\(\)\.plan\(PLATEAU_PLAN\)\.method==='tiles3d'/);
});

test('device tier: reported memory, cores, data-saver and phones each lower the budget; absent signals do not guess low', () => {
  assert.equal(deviceTier({}), 'high', 'nothing reported → the desktop figure the engine always used');
  assert.equal(deviceTier({ userAgent: 'Mozilla/5.0 (iPhone)' }), 'mobile');
  assert.equal(deviceTier({ deviceMemory: 4 }), 'mid');
  assert.equal(deviceTier({ hardwareConcurrency: 4 }), 'mid');
  assert.equal(deviceTier({ deviceMemory: 8, hardwareConcurrency: 8 }), 'high');
  assert.equal(deviceTier({ deviceMemory: 2 }), 'low');
  assert.equal(deviceTier({ saveData: true, deviceMemory: 16 }), 'low');
  assert.equal(deviceTier({ userAgent: 'Android Mobi', deviceMemory: 1 }), 'low');
});

test('the budgets are monotone and keep the figures the engine shipped with', () => {
  const order = ['low', 'mobile', 'mid', 'high'].map((k) => TIERS[k]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i].totalMiB >= order[i - 1].totalMiB);
  assert.deepEqual([TIERS.high.sse, TIERS.high.cacheMiB, TIERS.high.overflowMiB], [16, 384, 192]);
  assert.deepEqual([TIERS.mobile.sse, TIERS.mobile.cacheMiB, TIERS.mobile.overflowMiB], [24, 128, 64]);
  assert.ok(TIERS.low.sse > TIERS.mid.sse);
  assert.equal(tilesetBudget({ deviceMemory: 2 }), TIERS.low);
});

test('the Cesium adapter takes its numbers from the budget, with no phone/desktop literal left', () => {
  const c = R('js/cesium-engine.js');
  const body = c.slice(c.indexOf('    addTileset(id,spec){'), c.indexOf('    removeTileset(id){'));
  assert.match(body, /tilesetBudget\(\)/);
  assert.doesNotMatch(body, /\(mob\?/);
});
