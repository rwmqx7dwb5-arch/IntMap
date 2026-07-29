// R174 source-level checks (node --test). These pin the ROOT CAUSES the round fixed, so a later
// refactor cannot quietly reintroduce any of them, plus the shape of the new drone planner.
//
//   1. the flight simulator draws no sky of its own, and its camera is the FromTo one that can look up
//   2. the eye-anchored tilt solves at the APPLIED zoom, not the proposed one (zoom must still zoom)
//   3. the aircraft track survives a double-click zoom
//   4. the solid body's altitude is scaled per projection variant (metres vs mercator units)
//   5. the 3-D volume has a "drawing complete" button and no Solid choice anywhere
//   6. the drone planner exists, is catalogued for Atlas, and speaks five languages
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const R = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/* comments are prose here — every one of these files documents its own traps at length, and a naive
   substring search would happily match the explanation of a bug instead of the code that fixes it */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/* ─── 1. the flight simulator ──────────────────────────────────────────────────────────────── */

test('the flight simulator paints no sky of its own', () => {
  const fs = R('js/flight-sim.js'), code = stripComments(fs);
  assert.doesNotMatch(code, /_fsSkyDraw|_fsSkyOn|_fsSkyOff|_skyTop/, 'the #R173 painted sky is gone');
  assert.doesNotMatch(code, /#map \.fs-sky/, '…and so is the element it lived in');
  assert.match(code, /setSky\(\{'sky-color':'#3f78c2'/, 'the renderer’s own sky is what the cockpit uses');
  assert.match(code, /'atmosphere-blend':\['interpolate'/, 'with the #R99 atmosphere ramp restored');
});

test('the cockpit camera can look up: no axis clamp, no padding compensation', () => {
  const code = stripComments(R('js/flight-sim.js'));
  assert.doesNotMatch(code, /_cockpitCam|_AXIS_MARGIN/, 'the clamped-axis camera is gone');
  assert.doesNotMatch(code, /padding:pad|setPadding/, 'and nothing compensates with the projection centre');
  assert.match(code, /calculateCameraOptionsFromTo\(\{lng:eLng,lat:eLat\},camAlt,\{lng:tLng,lat:tLat\},tAlt\)/,
    'the eye→target camera is back — its pitch comes out of the geometry, so it passes 90°');
  assert.match(code, /setMaxPitch\(179\)/, 'and the renderer is allowed to go there');
});

/* ─── 2. eye-anchored tilt ─────────────────────────────────────────────────────────────────── */

test('the tilt anchor lets a zoom move the camera', () => {
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
  assert.match(code, /const sol=gSolve\(anchor,cur\.pitch,cur\.bearing,c2c,tile,cur\.zoom,sphere,cur,zLim\);/,
    'so the solve runs at the PROPOSED look distance');
  /* where the eye WAS is still taken from the APPLIED camera; it is the solve that moved */
  assert.match(code, /gEye\(was,/, 'the starting camera is still the applied one');
  assert.doesNotMatch(code, /d1=c2c\*mpp\(lat,was\.zoom\)/, 'the frozen-distance solve is gone');
});

/* ─── 3. the aircraft track ────────────────────────────────────────────────────────────────── */

test('the ground offset is read under each aircraft, not under the map centre', () => {
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

test('a double-click zoom no longer clears the selected aircraft (a separate defect, found on the way)', () => {
  const dl = R('js/data-layers.js'), code = stripComments(dl);
  assert.match(code, /originalEvent&&\(e\.originalEvent\.detail\|0\)>=2\) return/,
    'the second click of a double-click is ignored outright');
  assert.match(code, /map\.on\('dblclick',_planesDbl\)/, 'and a dblclick cancels a pending clear');
  assert.match(code, /_planesClearT=setTimeout\(\(\)=>\{ _planesClearT=null; if\(selectedPlane\) selectPlane\(null\); \},320\)/,
    'clearing is deferred past the double-click window');
  assert.match(code, /if\(selectedPlane\) drawTrack\(selectedPlane\)/, 'the track is rebuilt when the scale changes');
});

/* ─── 4. the closed 3-D body ───────────────────────────────────────────────────────────────── */

test('the solid body scales its altitude to the projection variant', () => {
  const s = R('js/solid3d.js'), code = stripComments(s);
  assert.match(code, /uniform float u_altScale/, 'the shader takes a scale');
  assert.match(code, /projectTileFor3D\(a_pos, a_alt\*u_altScale\)/, 'and applies it to the elevation');
  assert.match(code, /vname==='mercator'/, 'chosen by the variant the renderer reports');
  assert.match(code, /MERC_CIRC\*Math\.cos/, 'mercator wants altitude / (2πR·cos φ), not metres');
  assert.match(code, /const MERC_CIRC=2\*Math\.PI\*6378137/, 'on the WGS84 equatorial radius MapLibre uses');
});

/* ─── 5. the 3-D volume tool ───────────────────────────────────────────────────────────────── */

test('the volume tool has a finish-drawing button and no Solid choice', () => {
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

/* ─── 6. the drone planner ─────────────────────────────────────────────────────────────────── */

test('the drone planner is wired into the app', () => {
  const idx = appShell(root);
  assert.match(idx, /import '\.\.\/js\/drone-nav\.js';/, 'the file is loaded by the Vite entry (#R175)');
  assert.match(idx, /window\.IntMapModules\.droneNav\(map,IM_HOST\)/, 'and instantiated');
  /* (#R176) 「DronesはMeasureに置くな。どこにも置くな。」 — the launcher was removed from the Measure menu
     AND from the mobile tools sheet. The planner itself is untouched: the assertions above (loaded,
     instantiated) and the Atlas ones below are what keep the feature alive. */
  assert.doesNotMatch(idx, /id="btn-tool-drone"/, 'the Measure menu does NOT offer it');
  assert.doesNotMatch(idx, /data-proxy="btn-tool-drone"/, 'and neither does the mobile tools sheet');
});

test('the planner reads REAL terrain and keeps AMSL and AGL apart', () => {
  const d = stripComments(R('js/drone-nav.js'));
  assert.match(d, /HOST\.warmDEMTiles/, 'it warms the DEM tiles it is about to read');
  assert.match(d, /HOST\.demElevBilinear/, 'and samples the shared keyless DEM — no invented elevation');
  /* the only randomness in the file is the id a new route gets; nothing the ANSWER depends on may be
     random, so the check is scoped to compute() rather than to the whole file */
  const comp = d.slice(d.indexOf('async function compute()'), d.indexOf('const FOLLOW_PASSES'));
  assert.doesNotMatch(comp, /Math\.random\(\)/, 'nothing in the computation is random');
  assert.match(d, /const wpAmsl=\(i\)=>\{ const p=wp\[i\]; return p\.ref==='amsl'\?\(\+p\.alt\|\|0\):\(\(\+p\.alt\|\|0\)\+wpGround\[i\]\); \}/,
    'ONE conversion from a waypoint’s own reference to AMSL');
  assert.match(d, /s\.agl=s\.amsl-s\.ground/, 'and AGL is always AMSL minus the ground under that point');
  /* every waypoint carries the reference it was typed in — a display-only setting would be the bug */
  assert.match(d, /ref:\(ref==='amsl'\?'amsl':\(ref\|\|typedRef\)\)/, 'the reference is stored per waypoint');
});

test('every limit in the brief is actually computed, and each has a specific reason', () => {
  const d = stripComments(R('js/drone-nav.js'));
  ['cruiseSpeed', 'maxSpeed', 'maxAgl', 'minAgl', 'rangeKm', 'batteryWh', 'massKg', 'payloadKg', 'climbRate', 'descentRate']
    .forEach(k => assert.ok(d.includes(`k:'${k}'`), `${k} is an editable aircraft limit`));
  ['terrain-collision', 'min-clearance', 'max-altitude', 'range', 'battery']
    .forEach(k => assert.ok(d.includes(`kind:'${k}'`), `${k} is reported as its own finding`));
  assert.match(d, /Math\.pow\(\(m0\+pay\)\/m0,1\.5\)/, 'payload scales power by momentum theory, not a fudge');
  assert.match(d, /m\*g0\*dz\/CLIMB_EFF/, 'climbing is charged as real work against gravity');
  assert.match(d, /const t=Math\.max\(tH,tV\)/, 'a leg takes the longer of flying it and climbing it');
});

test('the planner can be edited, recomputed, saved and deleted', () => {
  const d = stripComments(R('js/drone-nav.js'));
  ['addWaypoint', 'setWaypoint', 'removeWaypoint', 'moveWaypoint', 'clearRoute', 'compute', 'followTerrain',
    'saveRoute', 'openRoute', 'deleteRoute'].forEach(f => assert.ok(d.includes('function ' + f) || d.includes(f + ','), `${f} exists`));
  assert.match(d, /localStorage\.setItem\(KEY/, 'routes persist');
});

test('the future-integration list has a seam, and it is one seam', () => {
  const d = stripComments(R('js/drone-nav.js'));
  assert.match(d, /function registerHazardSource\(id,fn\)/, 'weather / NFZ / wires / traffic all attach here');
  assert.match(d, /function registerWindField\(fn\)/, 'and wind, which changes the arithmetic, attaches here');
  assert.match(d, /Object\.keys\(hazardSources\)\.forEach/, 'the sources are actually consulted by compute()');
  assert.match(d, /if\(w\)\{ const br=bearingDeg\(a,b\)\*D2R; gs=Math\.max\(0\.5, gs \+ \(w\.u\*Math\.sin\(br\)\+w\.v\*Math\.cos\(br\)\)\); \}/,
    'a wind field really does change ground speed');
});

test('the drone planner is operable from Atlas AND catalogued (#R115)', () => {
  const atlas = R('js/atlas-console.js');
  assert.ok(atlas.includes("case 'drone':"), 'Atlas implements it');
  assert.ok(atlas.includes('{"type":"drone"'), 'and advertises it in the SYS catalogue');
  assert.match(atlas, /"name":"measure"\|"radius"\|"draw"\|"volume"\|"drone"/, 'the tool switch lists it too');
  /* (#R176) …and with no button left to click, the `tool` switch calls the planner directly. */
  assert.match(atlas, /if\(\/drone\|ドローン\|无人机\|무인기\/\.test\(n\)\)\{[^}]*window\.IntMapDrone&&window\.IntMapDrone\.toggle\(\)/, 'with a branch behind the name');
});

test('the new UI strings exist in all five languages', () => {
  const i18n = R('js/i18n.js'), d = R('js/drone-nav.js'), tp = R('js/tool-panel.js');
  assert.equal((i18n.match(/droneBtn:/g) || []).length, 5, 'the launcher label is in EN/JP/DE/RU/ES');
  /* L(en, jp, de, ru, es) — walk to the matching close paren, because the English text contains brackets */
  const callAt = (src, needle) => {
    const i = src.indexOf(needle); assert.ok(i > 0, `${needle} is missing`);
    let depth = 0; for (let j = i; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (!depth) return src.slice(i, j + 1); } }
    throw new Error('unbalanced call at ' + needle);
  };
  const five = call => assert.equal(call.split(/','|', '/).length >= 5, true, 'five language arguments: ' + call.slice(0, 60));
  five(callAt(d, "L('Drone navigation'"));
  five(callAt(d, "L('Follow terrain'"));
  five(callAt(d, "L('Conditions not met'"));
  five(callAt(tp, "_L('Finish drawing'"));
  five(callAt(tp, "_L('Resume drawing'"));
});

test('every route that enters the planner is sanitised at the door (#R174 SEC)', () => {
  const d = stripComments(R('js/drone-nav.js'));
  assert.match(d, /function sanitizeRoute\(r\)/, 'one door for a whole route');
  assert.match(d, /function sanitizeSpec\(sp\)/, '…and one for the aircraft limits');
  /* the three ways in that never touch the panel's own number fields */
  assert.match(d, /routes=Array\.isArray\(j\)\?j\.map\(sanitizeRoute\)\.filter\(Boolean\):\[\]/, 'localStorage');
  assert.match(d, /const clean=sanitizeRoute\(r\);/, 'setRoute()');
  assert.match(d, /route\.spec=sanitizeSpec\(Object\.assign\(\{\},route\.spec,patch\|\|\{\}\)\)/, 'setSpec()');
  /* …and the sink escapes anyway — CodeQL found it there, and one of the two being right is not a design */
  assert.match(d, /value="\$\{esc\(route\.spec\[f\.k\]\)\}"/, 'the spec field escapes at the sink');
  assert.match(d, /value="\$\{esc\(Math\.round\(_fin\(w\.alt,0\)\)\)\}"/, 'and so does the waypoint altitude');
});

test('the planner owns no camera and hijacks no gesture', () => {
  const d = stripComments(R('js/drone-nav.js'));
  assert.doesNotMatch(d, /setDragPan|dragPan|jumpTo\(/, 'it never takes the map’s input or writes the whole camera');
  assert.match(d, /function onMapClick\(e\)\{ if\(!addMode\|\|!panelOpen\(\)\) return;/,
    'its one click handler does nothing unless its own add mode is armed');
});
