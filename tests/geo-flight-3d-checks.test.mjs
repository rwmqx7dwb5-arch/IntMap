/* ============================================================================
 *  FLIGHT, TILT AND 3-D BODIES — 飛行シム・傾き・航空機の航跡・立体
 * ----------------------------------------------------------------------------
 *  The flight simulator's sky and camera, the eye-anchored tilt that must still zoom, an aircraft's
 *  track under its own ground, the solid body's altitude per projection, and the 3-D volume tool.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { appShell } from './app-source.mjs';
import { isolate } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R174 · flight, tilt, aircraft, solids   (was tests/r174-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R174's own header — the reports that opened the round — is kept with its block in
   tests/geo-drone-planner-checks.test.mjs.) */
describe('§ #R174 · flight, tilt, aircraft, solids', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const root = new URL('../', import.meta.url);

  /* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
     live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
     reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
  const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
    .concat(readdirSync(new URL('../js/locales/', import.meta.url))
      .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
  const R = (p) => (String(p).endsWith('js/i18n.js')
    ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
    : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  /* comments are prose here — every one of these files documents its own traps at length, and a naive
     substring search would happily match the explanation of a bug instead of the code that fixes it */
  const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

  /* ─── 1. the flight simulator ──────────────────────────────────────────────────────────────── */

  test('#R174 the flight simulator paints no sky of its own', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（js/flight-sim.js は操縦席の描画ループ）。 */
    const fs = R('js/flight-sim.js'), code = stripComments(fs);
    assert.doesNotMatch(code, /_fsSkyDraw|_fsSkyOn|_fsSkyOff|_skyTop/, 'the #R173 painted sky is gone');
    assert.doesNotMatch(code, /#map \.fs-sky/, '…and so is the element it lived in');
    assert.match(code, /setSky\(\{'sky-color':'#3f78c2'/, 'the renderer’s own sky is what the cockpit uses');
    assert.match(code, /'atmosphere-blend':\['interpolate'/, 'with the #R99 atmosphere ramp restored');
  });

  test('#R174 the cockpit camera can look up: no axis clamp, no padding compensation', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（カメラは MapLibre の FreeCamera）。 */
    const code = stripComments(R('js/flight-sim.js'));
    assert.doesNotMatch(code, /_cockpitCam|_AXIS_MARGIN/, 'the clamped-axis camera is gone');
    assert.doesNotMatch(code, /padding:pad|setPadding/, 'and nothing compensates with the projection centre');
    assert.match(code, /camera\.fromTo\(\{lng:cEyeLng,lat:cEyeLat\},cEyeAlt,\{lng:tLng,lat:tLat\},tAlt\)/   /* (#R178) the same call, asked of the contract; (#R189) via the intro-blend aliases whose steady state is eLng/eLat/camAlt */,
      'the eye→target camera is back — its pitch comes out of the geometry, so it passes 90°');
    assert.match(code, /setMaxPitch\(179\)/, 'and the renderer is allowed to go there');
  });

  /* ─── 2. eye-anchored tilt ─────────────────────────────────────────────────────────────────── */

  test('#R174 the tilt anchor lets a zoom move the camera', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（傾きの錨は app shell の MapLibre フック）。 */
    /* (#R175) SUPERSEDED IN MECHANISM, KEPT IN INTENT. #R174 made zoom work again by freezing the solve
       at the APPLIED zoom — and that is why the same report came back: freezing the distance also froze
       the look-at TARGET's altitude, which after any tilt is a point in the sky, so "approach the
       target" walked the eye towards the air (measured at pitch 110: 8,373 → 12,955 m while zooming IN).
       The fix pre-scales the anchored eye by the zoom ratio and solves at the proposed zoom, which is
       the identity for a pure tilt and a true dolly for a zoom. The assertion below is the same
       QUESTION #R174 asked — does a zoom still move the camera — expressed against that solution. */
    const idx = appShell(root);
    const hook = idx.slice(idx.indexOf('setTiltPivot(mode)'), idx.indexOf('setTiltPivot(mode)') + 20000);
    const code = stripComments(hook);
    /* (#R176) SUPERSEDED AGAIN IN MECHANISM, KEPT IN INTENT. The solve now runs in MERCATOR units —
       the metres-per-degree conversion these assertions named was a tangent plane, true at z12 where
       every round measured and wrong by 22,218 km at z3. The question is unchanged: does a zoom still
       move the camera?
       (#R177) AND AGAIN. The renderer has TWO camera models — `globe` is vertical-perspective below
       z12 and mercator above — so one set of merc expressions could not be the whole answer; the
       geometry moved into gEye/gSolve, which speak both. The dolly is now a PARAMETER of gEye rather
       than a hand-written `k*Cz` term, and the reference for k moved to the proposal's own history
       because the sphere branch returns a zoom (see the note in the hook). Same question again. */
    assert.match(code, /Math\.pow\(2,zRef-cur\.zoom\)/, 'the zoom ratio is computed…');
    assert.match(code, /const anchor=gEye\(was,c2c,tile,sphere,k\);/, '…and applied to the anchored eye');
    assert.match(code, /const sol=gLimitPitch\(anchor,cur\.pitch,cur\.bearing,c2c,tile,cur\.zoom,sphere,cur,guard,was\.pitch\);/   /* (#R178) gSolve split into gSolveAt (one exact answer + feasibility) and gLimitPitch (the largest holdable tilt); it is still handed the PROPOSED zoom, which is what this asserts */,
      'so the solve runs at the PROPOSED look distance');
    /* where the eye WAS is still taken from the APPLIED camera; it is the solve that moved */
    assert.match(code, /gEye\(was,/, 'the starting camera is still the applied one');
    assert.doesNotMatch(code, /d1=c2c\*mpp\(lat,was\.zoom\)/, 'the frozen-distance solve is gone');
  });

  /* ─── 3. the aircraft track ────────────────────────────────────────────────────────────────── */

  test('#R174 the ground offset is read under each aircraft, not under the map centre', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（航空機の航跡は js/data-layers.js の描画 closure）。 */
    const code = stripComments(R('js/data-layers.js'));
    /* THE reported bug. One centre reading subtracted from every aircraft on screen meant that as soon as the
       centre stood on ground higher than an aircraft's altitude, the difference clamped to 0 — and the track
       dropped every leg while the glyph survived. Measured over Mt Fuji: 0 legs at every zoom from z10.5 to
       z14.3, with the aeroplane plainly on screen. */
    assert.match(code, /function _groundAt\(lng,lat\)/, 'the ground is read at a POINT');
    assert.match(code, /const off=_groundAt\(d\.lng,d\.lat\)/, 'under each aircraft…');
    assert.match(code, /const off=_groundAt\(\(a\[0\]\+b\[0\]\)\/2,\(a\[1\]\+b\[1\]\)\/2\)/, '…and under each track leg');
    assert.doesNotMatch(code, /if\(!\(alt>0\)\) continue;/, 'a leg at ground level is DRAWN, never dropped');
    /* the pick must use the same offset the drawing does, or a click looks where the aircraft is not */
    assert.match(code, /_gndFresh\(\); let best=null, bestD=PICK_PX\*PICK_PX/, 'the pick shares the per-aircraft ground');
  });

  test('#R174 a double-click zoom no longer clears the selected aircraft (a separate defect, found on the way)', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（ダブルクリックは地図のイベント）。 */
    const dl = R('js/data-layers.js'), code = stripComments(dl);
    assert.match(code, /originalEvent&&\(e\.originalEvent\.detail\|0\)>=2\) return/,
      'the second click of a double-click is ignored outright');
    assert.match(code, /events\.on\('dblclick',_planesDbl\)/   /* (#R178) …through the contract */, 'and a dblclick cancels a pending clear');
    assert.match(code, /_planesClearT=setTimeout\(\(\)=>\{ _planesClearT=null; if\(selectedPlane\) selectPlane\(null\); \},320\)/,
      'clearing is deferred past the double-click window');
    assert.match(code, /if\(selectedPlane\) drawTrack\(selectedPlane\)/, 'the track is rebuilt when the scale changes');
  });

  /* ─── 4. the closed 3-D body ───────────────────────────────────────────────────────────────── */

  test('#R174 the solid body scales its altitude to the projection variant', () => {
    /* 綴りのまま: 対象が WebGL のシェーダ文字列と投影ごとの換算で、Node に GL が無い。 */
    const s = R('js/solid3d.js'), code = stripComments(s);
    assert.match(code, /uniform float u_altScale/, 'the shader takes a scale');
    /* (maplibre-6-migration) the scale is now always metres → mercator units, and the shader is handed the
       metres AS WELL: projectLifted (js/lifted-projection.js) gives the globe prelude metres and the plane
       mercator units — both at once while the globe cross-fades, which MapLibre 6 made live */
    assert.match(code, /projectLifted\(a_pos, a_alt, a_alt\*u_altScale\)/, 'and applies it to the elevation');
    assert.match(code, /MERC_CIRC\*Math\.cos/, 'mercator wants altitude / (2πR·cos φ), not metres');
    assert.match(code, /const MERC_CIRC=2\*Math\.PI\*6378137/, 'on the WGS84 equatorial radius MapLibre uses');
  });

  /* ─── 5. the 3-D volume tool ───────────────────────────────────────────────────────────────── */

  test('#R174 the volume tool has a finish-drawing button and no Solid choice', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（パネルのボタンと Atlas の分岐）。 */
    const v = R('js/volume3d.js'), tp = R('js/tool-panel.js'), atlas = R('js/atlas-console.js');
    const vcode = stripComments(v), tcode = stripComments(tp);
    assert.match(vcode, /function seal\(v\)/, 'the module can seal the footprint');
    assert.match(vcode, /seal, isSealed:\(\)=>sealed/, 'and says so');
    /* `E.layers.setSolid` is the ENGINE's own call for drawing the body and stays; what is gone is the
       module's public setSolid/isSolid and the `solid` flag they switched. */
    assert.doesNotMatch(vcode, /\bisSolid\b/, 'the module no longer reports a solid/shell mode');
    assert.doesNotMatch(vcode, /let solid=/, 'and no longer keeps the flag');
    assert.match(vcode, /const asSolid=canSolid\(\)&&E\.layers\.has\(BODY\)/, 'the closed body is simply what is drawn');
    assert.match(tcode, /#v3d-seal/, 'the panel has the button');
    assert.doesNotMatch(tcode, /v3d-solid/, 'and not the checkbox');
    assert.doesNotMatch(stripComments(atlas), /V\.setSolid/, 'Atlas does not offer it either');
    assert.doesNotMatch(atlas, /"solid"\?:bool/, 'and it is not in the SYS catalogue');
    const mr = stripComments(R('js/map-readout.js'));
    assert.match(mr, /IntMapVolume3D\.isSealed\(\)\) return/, 'a sealed footprint stops taking map clicks');
  });

  ISOLATED.built();
});
