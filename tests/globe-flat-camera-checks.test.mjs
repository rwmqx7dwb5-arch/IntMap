/* ============================================================================
 *  globe-flat-camera — Cesium's flat map (COLUMBUS_VIEW) is read in its own frame
 * ----------------------------------------------------------------------------
 *  In COLUMBUS_VIEW `camera.positionWC` is (height, easting, northing), not ECEF. The camera read-back and the
 *  pose save/restore must therefore go through the mode-aware helpers, never `positionWC` directly.
 *  The behaviour itself is measured in a real browser by tests/globe-flat-camera.spec.js.
 *  記録: dev-notes/2026-11-20-globe-flat-camera.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'js/cesium-engine.js'), 'utf8').replace(/\r\n/g, '\n');
const body = (name) => { const a = src.indexOf(`    ${name}(`); assert.ok(a > 0, name); return src.slice(a, src.indexOf('\n    }\n', a)); };

test('① the orbit read-back asks the eye through the scene-mode-aware helper', () => {
  const t = body('_hprRaw');
  assert.match(t, /_eyeOffsetEnu\(/);
  assert.doesNotMatch(t, /positionWC/, '_hprRaw must not read positionWC as ECEF');
});

test('② the helper has a plane branch that uses the map projection and the camera\'s own position', () => {
  const t = body('_eyeOffsetEnu');
  assert.match(t, /_isPlane\(\)/);
  assert.match(t, /mapProjection\.project\(/);
  assert.match(t, /this\._camera\.position;/);
});

test('③ pose save/restore and the eye readers use the ECEF eye, not positionWC, off the globe', () => {
  assert.match(body('_readPose'), /_isPlane\(\)/);
  assert.match(src, /orientation:this\._poseOrientation\(dest\)/);
  assert.match(src, /Cartographic\.fromCartesian\(v\._eyeEcef\(\)\)/);
  assert.match(src, /geodeticSurfaceNormal\(this\._eyeEcef\(\)/);
});
