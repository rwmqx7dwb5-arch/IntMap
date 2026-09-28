/* ============================================================================
 *  cesium-min-zoom-latitude — the second engine's zoom floor follows the latitude, as MapLibre 6's globe
 * ----------------------------------------------------------------------------
 *  ① CesiumView.minZoomAt(lat) equals MapLibre's own floor, minZoom + getZoomAdjustment(0, lat), taken
 *    from the installed maplibre-gl source (bundled here), at every latitude — and is the bare minZoom
 *    off the globe
 *  ② no clamp in the Cesium engine or its input still floors at the bare `_minZoom`
 *  記録: dev-notes/2026-09-29-cesium-min-zoom-latitude.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

async function maplibreGetZoomAdjustment() {
  const out = await build({
    entryPoints: [join(ROOT, 'node_modules/maplibre-gl/src/geo/projection/globe_utils.ts')],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64');
  return (await import(url)).getZoomAdjustment;
}

test('① minZoomAt is MapLibre 6\'s globe floor at every latitude, and the bare floor off the globe', async () => {
  const adj = await maplibreGetZoomAdjustment();
  const Cesium = { SceneMode: { SCENE3D: '3d', SCENE2D: '2d' } };
  const src = rd('js/cesium-engine.js');
  const a = src.indexOf('    minZoomAt(lat){');
  const fnText = src.slice(a, src.indexOf('\n    }\n', a) + 7).trim().replace(/^minZoomAt/, 'function minZoomAt');
  const make = (mode) => {
    const view = { _minZoom: 3, _scene: { mode } };
    const fn = new Function('Cesium', fnText + '\nreturn minZoomAt;')(Cesium);
    return (lat) => fn.call(view, lat);
  };
  const globe = make('3d');
  const EDGE = 85.0511287798066;
  for (const lat of [0, 12.5, 35, 60, 80, 85, 89.9, -45, -80, -89.9]) {
    const want = 3 + adj(0, Math.max(-EDGE, Math.min(EDGE, lat)));
    assert.ok(Math.abs(globe(lat) - want) < 1e-12, `lat ${lat}: ${globe(lat)} vs MapLibre ${want}`);
  }
  assert.ok(globe(80) < 3 - 2.5, 'at 80° the floor is ~2.5 levels below the bare minZoom, as MapLibre allows');
  const flat = make('2d');
  assert.equal(flat(80), 3, 'off the globe the floor is the bare minZoom');
  assert.equal(globe(NaN), 3, 'an unknown latitude does not invent a floor');
});

test('② every zoom clamp reads the latitude-aware floor', () => {
  const eng = rd('js/cesium-engine.js');
  const inp = rd('js/cesium-input.js');
  assert.doesNotMatch(eng, /Math\.max\((?:this|v)\._minZoom,Math\.min\(/, 'no clamp in the engine floors at the bare _minZoom');
  assert.match(inp, /const limits=\(lat\)=>\(\{ minZoom:view\.minZoomAt\(/, 'the input\'s limits come from minZoomAt');
  assert.doesNotMatch(inp, /minZoom:view\._minZoom/, 'and not from the bare field');
});
