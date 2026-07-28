// R173 source checks — the mechanisms this round put in, asserted where they live.
//
// The behavioural half is tests/r173.spec.js (a real browser). These are the checks that survive a
// refactor of the wiring but not a removal of the mechanism: the flight simulator's camera is solved on
// a sphere, the volume is one closed body rather than a stack of extrusions, the eye anchor answers
// EVERY proposal, and the engine gained the three contract entries the round needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(import.meta.dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const INDEX = R('index.html');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* the same parser-based detector the earlier rounds use: a real `map.<x>` member access, never a
   comment and never an unrelated lookup table (#R171) */
function rawMapUses(file) {
  const src = R('js/' + file);
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { assert.fail(`${file} does not parse: ${e.message}`); }
  const hits = [];
  walk.simple(ast, {
    MemberExpression(n) {
      if (!n.computed && n.object && n.object.type === 'Identifier' && n.object.name === 'map') hits.push(n.property?.name || '?');
    },
  });
  return hits;
}

/* ─── 1. the flight simulator flies a real sphere ───────────────────────────────────────────── */

test('the cockpit camera is solved on the round Earth, not aimed at a fixed distance', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /function _cockpitCam\(eLng,eLat,altM,bearing,pitchWanted,roll\)/, 'one function owns the camera');
  assert.match(src, /const d=\(s\*s-1\)\/Math\.max\(1e-12, s\*c\+Math\.sqrt\(disc\)\)/,
    'the look distance is SOLVED (written so two nearly equal terms are never subtracted), not a literal');
  assert.match(src, /const axis=Math\.min\(pitchWanted, 90-dip-_AXIS_MARGIN\)/,
    'the map axis is aimed below the horizon — where MapLibre can represent a spherical camera at all');
  assert.match(src, /const pad=\{ top:Math\.max\(0,2\*sy\), bottom:Math\.max\(0,-2\*sy\), left:Math\.max\(0,-2\*sx\), right:Math\.max\(0,2\*sx\) \}/,
    'the difference between that axis and the pilot’s line of sight rides in the projection’s centre offset');
  assert.ok(!/_D=1800/.test(src), 'the fixed 1.8 km look-ahead is gone — it is what pinned the sim to z15 and a flat map');
  assert.match(src, /const _D_FLOOR=1800/, '…but 1.8 km survives as the floor the solve collapses to on the ground');
});

test('the simulator restores what it borrows', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /pad:\(map\.getPadding\?map\.getPadding\(\):null\)/, 'the padding is remembered on entry');
  assert.match(src, /map\.setPadding\(pv\.pad\|\|\{top:0,bottom:0,left:0,right:0\}\)/, '…and given back on exit');
  assert.match(src, /function _fsSkyOff\(\)/, 'the sim’s own sky element is removed');
});

test('the sim paints its own sky, because the renderer stops painting one', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /function _fsSkyDraw\(camAlt,pitch,roll\)/, 'a sky that follows the camera');
  assert.match(src, /Math\.acos\(Math\.max\(-1,Math\.min\(1,R\/\(R\+Math\.max\(0,\+camAlt\|\|0\)\)\)\)\)/,
    'the horizon sits at the DIP angle, which is what makes it a globe and not a plane');
  assert.match(src, /GE\.camera\.globeness\(\)/, 'and it scales with how spherical the view actually is, so there is no seam');
  assert.match(src, /'atmosphere-blend':0/, "MapLibre's from-space scattering is off — flown from inside the air it saturates to white");
});

/* ─── 2. the 3-D volume is a closed body ────────────────────────────────────────────────────── */

test('the volume is drawn as one closed mesh — floor included, no interior sheets', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.match(v, /E\.layers\.addSolid\(BODY\)/, 'asked of the engine as a solid');
  assert.match(v, /function canSolid\(\)/, '…and it falls back to the open shell where the engine has no solids');
  assert.ok(!/imv3d-slab-/.test(v), 'no interior sheets — they were invisible behind the body’s own depth writes');
  assert.ok(!/imv3d-floor/.test(v), 'and no floor slab, for the same reason');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'the tool is still engine-only');

  const s = stripComments(R('js/solid3d.js'));
  assert.match(s, /function triangulate\(p\)/, 'the caps are triangulated (ear clipping — a traced outline can be concave)');
  assert.match(s, /idx\.push\(capBot\[tri\[t\+2\]\],capBot\[tri\[t\+1\]\],capBot\[tri\[t\]\]\)/, 'the BOTTOM cap exists and faces down');
  assert.match(s, /float a=clamp\(1\.0-pow\(1\.0-face,1\.0\/c\),0\.0,0\.985\)/, 'opacity follows the path length through the face');
  assert.match(s, /gl\.cullFace\(gl\.FRONT\); gl\.drawElements/, 'far side first…');
  assert.match(s, /gl\.cullFace\(gl\.BACK\);  gl\.drawElements/, '…then the near side, so the body composites as glass');
  assert.match(s, /gl\.depthMask\(false\)/, 'depth is TESTED against the world but not written, or the body hides itself');
  assert.match(s, /projectTileFor3D\(a_pos, a_alt\)/, 'projected through MapLibre’s own prelude, so it is right on the globe too');
});

/* ─── 3. unlimited tilt keeps the viewpoint ─────────────────────────────────────────────────── */

test('the eye anchor answers every proposal, not only the ones that change the pitch', () => {
  const hook = INDEX.slice(INDEX.indexOf('setTiltPivot(mode){'), INDEX.indexOf('setTiltPivot(mode){') + 8000);
  assert.ok(!/Math\.abs\(cur\.pitch-was\.pitch\)<1e-4\) return \{\}/.test(hook),
    'declining a no-op frame applied the PROPOSED camera and wiped the anchor — measured: the eye fell 18.6 km on the last frame');
  assert.match(hook, /const movedFromLast=/, 'travel is judged against the previous proposal…');
  assert.match(hook, /const movedFromApplied=/, '…and against the camera actually on screen, because the proposal is re-cloned between gestures');
  assert.match(hook, /if\(movedFromApplied&&\(movedFromLast\|\|!last\)\) return \{\}/, 'a real journey is still left alone');
  assert.match(hook, /window\.__fsCamActive/, 'never while the flight sim owns the camera');
});

/* ─── 4. live aircraft: real altitude, pickable, with a track ───────────────────────────────── */

test('an aircraft can be picked where it is DRAWN, not where its shadow falls', () => {
  const d = stripComments(R('js/data-layers.js'));
  assert.match(d, /function pickPlane\(pt\)/, 'the pick is ours');
  assert.match(d, /E\.coords\.projectAltitude/, 'and it projects the aircraft’s real altitude through the engine');
  assert.match(INDEX, /projectAltitude\(ll,altM\)\{/, 'the engine can project a point that is up in the air');
  assert.match(INDEX, /t\.getMatrixForModel\(\{lng,lat\},\+altM\|\|0\)/, 'through the renderer’s own model matrix, so the globe is right too');
  assert.match(d, /map\.on\('mousemove',_planesHover\)/, 'hover uses it');
  assert.match(d, /let d=pickPlane\(e\.point\), props=null;/, 'and so does the click');
  assert.ok(!/map\.on\('click',ly,/.test(d),
    'ONE click handler: two of them each toggled, so a click that satisfied both selected and deselected in the same event');
});

test('the clicked aircraft draws the track this browser has actually observed', () => {
  const d = stripComments(R('js/data-layers.js'));
  assert.match(d, /function recordTracks\(list,tMs\)/, 'every poll is recorded');
  assert.match(d, /const TRACK_MAX=400/, 'bounded');
  assert.match(d, /const TRACK_TTL=20\*60000/, 'and forgotten when the aircraft goes');
  assert.match(d, /function legRing\(a,b,halfM\)/, 'each leg becomes a ribbon…');
  assert.match(d, /properties:\{kind:'leg',alt,top:alt\+thick\}/, '…extruded at the altitude that leg was flown at');
  assert.match(d, /Observed track:/, 'the tooltip says what the track is, because there is no history feed behind it');
  const a = R('js/atlas-console.js');
  assert.match(a, /case 'aircraftTrack': case 'planeTrack':/, 'Atlas can do it too (#R82)');
  assert.match(a, /\{"type":"aircraftTrack","aircraft":str/, '…and the catalogue says so, or the planner cannot reach it (#R115)');
});

/* ─── 5. the engine contract ────────────────────────────────────────────────────────────────── */

test('the three contract entries this round needed are declared, faced and answered by Cesium too', () => {
  for (const m of ['globeness()', 'addSolid(id,before)', 'setSolid(id,o)', 'removeSolid(id)', 'projectAltitude(ll,altM)']) {
    assert.ok(INDEX.includes(m), `the MapLibre adapter implements ${m}`);
  }
  assert.match(INDEX, /globeness:\(\)=>_adapter\.globeness/, 'globeness is on the facade');
  assert.match(INDEX, /addSolid:\(id,b\)=>_adapter\.addSolid/, 'so is addSolid');
  assert.match(INDEX, /projectAltitude:\(ll,a\)=>_adapter\.projectAltitude/, 'so is projectAltitude');
  assert.match(INDEX, /\n\s+solid3d:true,/, 'and solid3d is a declared capability');
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1600);
  assert.match(cesium, /solid3d:true/, 'a positional-camera engine answers it too — the capability is per-engine');
});

test('two more modules stopped touching the renderer', () => {
  assert.deepEqual(rawMapUses('street-view.js'), [], 'street-view is engine-only');
  assert.deepEqual(rawMapUses('monitors.js'), [], 'monitors is engine-only');
});
