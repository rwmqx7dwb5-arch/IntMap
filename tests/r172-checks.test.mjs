// R172 source-level regression checks.
//
// The round's headline defect was a REGRESSION THIS PROJECT SHIPPED: #R171 pointed the flight
// simulator at MapLibre's vertical-perspective projection to get a curved Earth, and the cockpit
// then drew nothing at all — a white void with the HUD floating in it. #R171's own test could not
// see that, because it measured CURVATURE (a property of the projection) and never asked whether
// anything had been DRAWN. So the pixel-level proof lives in tests/r172.spec.js; what can be pinned
// here is everything that would let the same class of mistake back in:
//
//   · the sim never names a renderer projection, and the engine REFUSES the one that blanks it;
//   · unlimited tilt keeps the viewpoint still, and does it through the engine's own pre-apply hook
//     (correcting the camera from a 'pitch' event kills the gesture — jumpTo begins with stop());
//   · the 3-D volume has a floor and a filled interior, no altitude ceiling, and a unit picker;
//   · live aircraft carry a real altitude into the scene, with the terrain reference handled;
//   · every new switch is operable from Atlas AND catalogued (#R115: uncatalogued = nonexistent);
//   · five languages for every new string;
//   · renderer independence keeps going up, checked with a PARSER (prose says `map.` too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const R = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js — so INDEX
   is the concatenation. Pointed at the new index.html these assertions would pass vacuously.
   JS_FILES stays the MODULE list: js/app-body.js is the page's own program, not a module. */
const INDEX = appShell(new URL('../', import.meta.url));
/* (#R178) …and js/geo-engine.js is not a module either — it is the renderer adapter, carved out of
   app-body.js this round. It is part of the page's program (see appShell), so questions asked of
   the MODULES must not be asked of it: it is the one file that is SUPPOSED to name MapLibre. */
const JS_FILES = readdirSync(new URL('../js', import.meta.url)).filter(f => f.endsWith('.js') && f !== 'app-body.js' && f !== 'geo-engine.js');
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* Real `map.<x>` member reads, via the parser — a regex cannot do this in either direction
   (comments discuss `map.setPadding(...)`, and `[].map.call` is not the renderer). */
function rawMapUses(file) {
  const src = R('js/' + file);
  let ast;
/* (#R184) PARSE IT THE WAY IT RUNS. Every js/ file executes as an ES module (src/main.js
   imports them), and until this round none of them CONTAINED an import, so script mode happened
   to work. js/satellites-live.js imports satellite.js — SGP4 is not something to hand-roll — and
   script mode then throws a parse error, which is this check being wrong about the program rather
   than the program being wrong. Script first (the stricter reading for the files that really are
   plain scripts), module as the fallback. */
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (_) { try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' }); }
              catch (e) { assert.fail(`${file} does not parse: ${e.message}`); } }
  const hits = [];
  walk.simple(ast, {
    MemberExpression(n) {
      if (!n.computed && n.object && n.object.type === 'Identifier' && n.object.name === 'map') hits.push(n.property?.name || '?');
    },
  });
  return hits;
}

/* ─── 1. the flight simulator is not blanked again ──────────────────────────────────────────── */

test('the sim asks for the app Globe and nothing else — the projection that blanks it is gone', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /IntMapOS\.exec\('view\.proj\.globe'/, 'entry forces the app Globe view');
  assert.ok(!/globe-true/.test(src), "'globe-true' renders an empty white cockpit — it must not come back");
  assert.ok(!/setProjection\(\s*\{\s*type\s*:/.test(src), 'the sim must never name a renderer projection spec');
});

test('the engine refuses a projection it cannot honour instead of wrecking the view', () => {
  assert.match(INDEX, /globeAllZooms:false/, 'MapLibre cannot give a curved Earth at cockpit zoom with a DEM — say so');
  assert.match(INDEX, /if\(mode==='globe-true'&&!MAPLIBRE_CAPS\.globeAllZooms\) return false;/,
    'setProjection must decline rather than blank the map; the caller then reports honestly');
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1400);
  assert.match(cesium, /globeAllZooms:true/, 'a positional-camera engine still answers true — the capability is per-engine, not a global no');
});

test('the sim hands the tilt pivot back on the way out', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /setTiltPivot\('target'\)/, 'the sim takes the pivot for the flight (it drives the camera itself every frame)');
  assert.match(src, /window\.IntMapTilt\.apply\(\); window\.IntMapTilt\.wireTilt\(\);/,
    'stop() must give it back — the sim also re-pins the ground clamp, which would silently undo the unlimited-tilt setting');
});

/* ─── 2. unlimited tilt does not move the viewpoint ─────────────────────────────────────────── */

test('the tilt pivot is expressed as an intent and implemented on the pre-apply hook', () => {
  assert.match(INDEX, /setTiltPivot\(mode\)\{/, 'the contract states WHAT ("pivot about the eye"), not HOW');
  assert.match(INDEX, /m\.transformCameraUpdate=/, 'the correction rides along with the gesture');
  const vc = stripComments(R('js/view-controls.js'));
  const tilt = vc.slice(vc.indexOf('window.IntMapTilt=(function()'), vc.indexOf('window.IntMapEyeAlt=(function()'));
  assert.ok(!/events\.on\('pitch/.test(tilt),
    "correcting from a 'pitch' event aborts the drag — MapLibre's jumpTo starts with stop(). Traced: the twelve-step drag died on the first correction");
  assert.ok(!/setEye\(/.test(tilt), 'the tilt module states the intent; the engine owns the geometry');
  assert.match(vc, /const want=unlimited\?'eye':'target'/, 'standard tilt keeps the renderer\'s own behaviour, byte for byte');
  assert.match(vc, /setCenterClamped\(!unlimited\)/,
    'the view target has to be unpinned for the eye to stay put — a ground-pinned target makes the eye a function of zoom and pitch');
});

test('the pivot only fires on a PURE tilt, or "fly to Paris tilted" lands short', () => {
  /* (#R177) the window is wider because the hook now says WHICH of the renderer's two camera models
     it is solving for; the assertions themselves are #R172's, untouched.
     (#R179) wider again — the hook gained the branch that reads what the caller DECLARED, which is
     what stopped a zoom button fighting the eye-hold. Widening a fixed-size source window is a
     maintenance cost of asserting on source at all; the assertions below are still #R172's. */
  const hook = INDEX.slice(INDEX.indexOf('setTiltPivot(mode){'), INDEX.indexOf('setTiltPivot(mode){') + 20000);
  assert.match(hook, /Math\.abs\(cur\.lng-last\.lng\)>1e-9\|\|Math\.abs\(cur\.lat-last\.lat\)>1e-9/,
    'an update that also travels is a journey, not a tilt (measured: Paris arrived 4.3 km off centre without this)');
  assert.match(hook, /const last=req; req=cur;/,
    'the centre test compares like with like — the proposed camera has its own running state and never sees our override');
  assert.match(hook, /window\.__fsCamActive/, 'never while the flight sim owns the camera');
});

test('the viewpoint can be read and put back, and the scale is valid at any pitch', () => {
  assert.match(INDEX, /eyePosition\(\)\{/, 'the engine can say WHERE the viewpoint is');
  assert.match(INDEX, /setEye\(o\)\{/, '…and put it back');
  assert.match(INDEX, /eyeControl:true/, '…and declares it as a capability');
  const eye = INDEX.slice(INDEX.indexOf('eyePosition(){'), INDEX.indexOf('eyePosition(){') + 1200);
  assert.ok(!/unproject\(\[w\/2-50,h\/2\]\)/.test(eye),
    'past 90° of pitch the centre row is SKY — the unproject measurement was ~100 km out and is gone');
  /* (#R177) SUPERSEDED IN MECHANISM, KEPT IN INTENT: the map scale is still the renderer's own, but
     it is now read inside gEye — the single geometry the tilt anchor shares — rather than copied
     here. The metres-per-pixel identity this used to name is the MERCATOR branch of it. */
  const geo = INDEX.slice(INDEX.indexOf('function gEye('), INDEX.indexOf('function gEye(') + 1600);
  assert.match(geo, /const d=k\*c2c\/world, circ=GEO_CIRC\*Math\.cos\(cam\.lat\*GEO_RAD\);/,
    "metres-per-pixel comes from the renderer's own map scale (worldSize and circumferenceAtLatitude)");
});

/* ─── 3. the 3-D volume ─────────────────────────────────────────────────────────────────────── */

/* (#R173) The CLAIM is unchanged — the volume must be a closed body with a floor and a filled interior.
   The MECHANISM is not: #R172 built it out of a floor slab and eight interior sheets, and those were
   never visible, because fill-extrusion writes depth and everything inside the body failed the depth
   test behind its own near wall. R173 draws the whole prism as one closed mesh through the engine's
   solid contract, so the assertions follow the code that is there now rather than pretending the old
   layer ids still exist. */
test('the volume is a closed body: a floor and a filled interior', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.match(v, /BODY='imv3d-body'/, 'the closed body has its own layer');
  assert.match(v, /E\.layers\.addSolid\(BODY\)/, 'asked of the engine as a SOLID, not as another extrusion');
  assert.match(v, /E\.layers\.setSolid\(BODY,\{ ring:r, base:rb, top:rh, color, opacity \}\)/, 'from the same ring and the same band');
  assert.ok(!/imv3d-slab-/.test(v), 'and no interior sheets — 「内部にシートなんていうあほなことをするな」');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'the tool stays engine-only');
});

test('the altitude band has no ceiling and can be typed in a chosen unit', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.ok(!/-430,100000/.test(v), 'the Kármán-line clamp is gone — 「上限の高度は無しに」');
  assert.match(v, /const MAX_M=1e9, MIN_M=-6371000/, 'the only limits left are the renderer\'s and the centre of the Earth');
  assert.match(v, /const UNITS=\{ m:1, km:1000, ft:0\.3048, mi:1609\.344 \}/, 'm / km / ft / mi');
  assert.match(v, /function setUnit\(u\)/, 'and the unit is a setting');
  const tp = stripComments(R('js/tool-panel.js'));
  assert.match(tp, /V3D_UNITS=\['m','km','ft','mi'\]/, 'the picker offers them');
  assert.match(tp, /id="v3d-unit"/, 'the picker is in the panel');
  assert.match(tp, /const _toM=\(raw\)=>/, 'the fields convert into metres on the way in');
  assert.match(tp, /if\(s===''\|\|s==='-'\|\|s==='\+'\|\|s==='\.'\|\|s==='-\.'\) return s;/,
    "a half-typed value must reach setAltitudes UNCHANGED — converting '' first would write 0 m and undo #R171");
});

test('a footprint that did not come from clicks survives a panel refresh', () => {
  const v = stripComments(R('js/volume3d.js'));
  assert.match(v, /function syncClicks\(pts\)/, 'the click flow has its own entry point');
  assert.match(v, /if\(!n&&!ringFromClicks\) return false;/, 'and it refuses to replace a ring it did not create');
  const tp = stripComments(R('js/tool-panel.js'));
  assert.match(tp, /V\.syncClicks\(HOST\.measurePoints\)/, 'the panel goes through it');
  assert.ok(!/V\.setRing\(HOST\.measurePoints\)/.test(tp), 'the old unconditional push wiped Atlas-drawn footprints');
});

/* ─── 4. live aircraft at their real altitude ───────────────────────────────────────────────── */

test('aircraft are lifted with real geometry, because this renderer cannot lift a symbol', () => {
  const d = stripComments(R('js/data-layers.js'));
  assert.match(d, /PLANE3D_LYR='lyr-planes-3d'/, 'a 3-D layer exists');
  assert.match(d, /type:'fill-extrusion',source:PLANE3D_SRC/, 'it is extrusion geometry — MapLibre 5.24 has no symbol-z-offset');
  assert.match(d, /'fill-extrusion-base':\['get','alt'\]/, 'the base is the aircraft\'s own altitude, per feature');
  /* (#R191) the shared helper is `planeRingPts(…,pts)`; `planeRing` was a one-argument wrapper for the
     bare outline and went when the mark gained its stroke (the body is the outline INSET by it, the
     stroke is it OUTSET). Still an aeroplane, still turned to its track, still built in ground metres —
     which is what this assertion is about. */
  assert.match(d, /function planeRingPts\(lng,lat,hdg,halfM,pts\)/, 'the glyph is an aeroplane turned to its track, built in ground metres');
  assert.match(d, /const _PLANE_CORE=_outsetRing\(_PLANE_OUTLINE,-_PLANE_STROKE\);/, 'and the body is that outline');
  assert.match(d, /const alt=d\.onGround\?0:Math\.max\(0,\(d\.geoAlt!=null\?d\.geoAlt:\(d\.baroAlt!=null\?d\.baroAlt:0\)\)-off\)/,
    'airborne aircraft get the ground offset taken off (renderer metres are above the DEM when terrain is on); aircraft ON the ground stay at 0 so they sit on it');
  assert.match(d, /function planesLayerOn\(\)/, '"is the layer on" must accept either rendering — asking after one by name reports the other as off');
  assert.match(d, /function applyPlanesMode\(visible\)/, 'one representation at a time');
});

/* ─── 5. Atlas is the control plane (#R115: uncatalogued = nonexistent) ─────────────────────── */

test('every new switch is operable from Atlas AND catalogued', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js');
  assert.ok(atlas.includes("case 'planeAltitude':"), 'Atlas must implement planeAltitude');
  assert.ok(atlas.includes('{"type":"planeAltitude"'), 'planeAltitude must appear in the SYS catalogue');
  assert.match(atlas, /\bplaneAltitude:\{ lbl:/, 'and offer an inline on/off switch in the reply');
  assert.match(atlas, /"unit"\?:"m"\|"km"\|"ft"\|"mi"/, 'the volume action must advertise the unit');
  /* (#R174) the closed-body OPTION is gone — "わざわざSolidを選択制なんてするな". A volume is a closed body,
     so there is nothing left to catalogue, and an advertised parameter with no control behind it is the
     exact failure this test exists to catch. Asserted in the negative so it cannot creep back. */
  assert.doesNotMatch(atlas, /"solid"\?:bool/, 'the solid/hollow choice was withdrawn in #R174');
  assert.match(atlas, /\/volume\|立体\|体積\/\.test\(n\)\?'btn-tool-volume'/,
    '{"type":"tool","name":"volume"} has been advertised since #R170 with no branch behind it — it fell through and did nothing');
});

test('the new UI strings exist in all five languages', () => {
  const tp = R('js/tool-panel.js'), d = R('js/data-layers.js');
  /* _L(en, jp, de, ru, es) — walk to the matching close paren, because the English text itself
     contains brackets and a naive indexOf(')') truncates the call. */
  const callAt = (src, needle) => {
    const i = src.indexOf(needle); assert.ok(i > 0, `${needle} is missing`);
    let start = src.lastIndexOf('_L(', i), depth = 0;
    for (let k = start + 2; k < src.length; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')') { depth--; if (!depth) return src.slice(start, k + 1); }
    }
    assert.fail(`unterminated _L( for ${needle}`);
  };
  /* (#R174) 'Solid (floor + filled interior)' is gone with the checkbox it labelled — a volume is a
     closed body, not a choice. The button that replaced it in that slot is checked here instead. */
  for (const needle of ['Finish drawing', 'Altitude band above sea level']) {
    const call = callAt(tp, needle);
    assert.equal((call.match(/','/g) || []).length, 4, `${needle} must carry all five languages, got: ${call.slice(0, 160)}`);
  }
  for (const s2 of ['実際の高度で表示', 'In echter Höhe', 'На реальной высоте', 'A su altitud real', 'At real altitude'])
    assert.ok(d.includes(s2), `the aircraft-altitude toggle is missing its ${s2} string`);
});

/* ─── 6. renderer independence (phase 6) ────────────────────────────────────────────────────── */

test('the five modules migrated this round never touch the renderer again', () => {
  const cleared = ['widgets.js', 'mobile-ui.js', 'community-board.js', 'stats-compare.js', 'countries-ui.js'];
  const dirty = cleared.filter(f => rawMapUses(f).length).map(f => f + ' → ' + rawMapUses(f).join(','));
  assert.deepEqual(dirty, [], 'these were migrated to IntMapGeoEngine — a raw map call here is a regression');
});

test('the count of renderer-independent modules only goes up', () => {
  const clean = JS_FILES.filter(f => rawMapUses(f).length === 0);
  // 26 after #R171, 31 after this round (widgets, mobile-ui, community-board, stats-compare, countries-ui).
  assert.ok(clean.length >= 31, `only ${clean.length} of ${JS_FILES.length} modules are renderer-independent — this must not go backwards`);
});

test('the contract grew for what this round needed, and Cesium answers for it too', () => {
  const caps = INDEX.slice(INDEX.indexOf('const MAPLIBRE_CAPS='), INDEX.indexOf('const MapLibreAdapter='));
  assert.ok(caps.includes('eyeControl'), 'capability eyeControl missing');
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1400);
  assert.ok(cesium.includes('eyeControl:true'), 'the Cesium contract must answer for eyeControl');
  for (const m of ['eye:', 'setEye:', 'setCenterClamped:', 'setTiltPivot:', 'isAnimating:', 'forBounds:', 'getPadding:']) {
    assert.ok(INDEX.includes(m), `the camera facade must expose ${m}`);
  }
});
