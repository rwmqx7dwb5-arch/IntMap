/* ============================================================================
 *  IntMap · the night side builds even when its one idle landed before the renderer could draw
 *  (js/night-side.js `consider`)
 * ----------------------------------------------------------------------------
 *  Report: Edge on production, z1.59 over Asia at 00:46 JST (15:46 UTC) — a fully lit globe, no night
 *  shading, with 「Day & night shading」 on and no other layer. Measured: `IntMapNightSide.state()`
 *  was `built:false` with the satellite basemap up; it built only when something later fired
 *  `moveend` / `styledata`. `consider()` is event driven, `go()` returned when `build()` declined
 *  (renderer not drawable yet) and nothing asked again; the minute tick only ever repainted.
 *
 *  ⚠ READ, NOT RUN: the module needs a live renderer. What is held is the two re-entry paths.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = codeOnly(fs.readFileSync(path.join(ROOT, 'js/night-side.js'), 'utf8'));

test('a build that could not start is retried when the renderer can draw', () => {
  const go = src.slice(src.indexOf('const go=()=>'), src.indexOf('requestIdleCallback(go'));
  assert.ok(go.length > 0, 'consider() still defers the build to an idle `go`');
  assert.match(go, /GE\(\)\.canDraw\(\)/, 'go asks whether the renderer could draw');
  assert.match(go, /GE\(\)\.whenCanDraw\(\)\.then\(/, 'and waits on the engine\'s own readiness, not on the next camera event');
  assert.match(go, /consider\(\)/, 'then considers again');
});

test('the minute tick re-considers an unbuilt effect instead of only repainting a built one', () => {
  const tick = src.slice(src.indexOf("everyTick('night-side:sun'"));
  assert.match(tick, /if\(built\) refresh\(false\); else consider\(\);/);
});

test('addLimb says which stage refused (layers.limbWhy), so a refusal is never a bare false', () => {
  const eng = codeOnly(fs.readFileSync(path.join(ROOT, 'js/geo-engine.js'), 'utf8'));
  const body = eng.slice(eng.indexOf('addLimb(id,before){'), eng.indexOf('hasLimb(id){'));
  for (const stage of ['kind-not-provided', 'no-webgl2-on-map-canvas', 'phone-class-device', 'software-rasteriser', 'sky-model-missing', 'threw-before-addLayer', 'layer-dead-on-add', 'added']) {
    assert.ok(body.includes("_limbWhy='" + stage + "'"), 'stage named: ' + stage);
  }
  assert.match(eng, /limbWhy:\(\)=>/, 'the contract exposes it');
});
