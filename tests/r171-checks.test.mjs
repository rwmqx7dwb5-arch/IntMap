// R171 source-level regression checks.
//
// The round's headline defect could not be seen in the source at all: MapLibre 5's `globe` projection
// IS mercator from about z12 up, so "the flight sim switches to globe" (#R170) was a no-op for a sim
// that flies at z≈15. That one is pinned in tests/r171.spec.js, where the curvature is measured. What
// CAN be pinned here is everything that would silently rot around it:
//
//   · the sim asks for the all-zoom globe, and restores the previous projection UNCONDITIONALLY
//     (the R170 line only restored on a change, and the spec it now sets is not app state);
//   · the flight audio starts muted and remembers the pilot's choice;
//   · the 3-D volume panel never rebuilds itself from an input handler (the actual "cannot type"
//     bug: updateToolPanel() rewrites innerHTML, which destroys the focused field);
//   · the altitude fields tolerate a half-typed value and never swap under the cursor;
//   · shape / colour / opacity exist, in five languages, with the Atlas action and its SYS entry;
//   · the tilt ceiling and the eye-altitude readout are real settings in five languages, wired both
//     ways through Settings and reachable from Atlas;
//   · the renderer-independence claims: the new module never names the map, and the modules cleared
//     this round stay cleared — checked with a PARSER, because `map.` also appears in prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const R = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const INDEX = R('index.html');
const JS_FILES = readdirSync(new URL('../js', import.meta.url)).filter(f => f.endsWith('.js'));

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
/* Count real `map.<something>` member reads, via the parser. A regex cannot do this in either
   direction: js/workspace.js DISCUSSES `map.setPadding(...)` in a comment (not a call), and a
   grep for `map.` also sweeps up unrelated locals. Computed access (`map[key]`) is excluded — the
   renderer is only ever reached as `map.method(...)`, and a `map[k]` is a lookup table. */
function rawMapUses(file) {
  const src = R('js/' + file);
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { assert.fail(`${file} does not parse: ${e.message}`); }
  const hits = [];
  walk.simple(ast, {
    MemberExpression(n) {
      if (!n.computed && n.object && n.object.type === 'Identifier' && n.object.name === 'map') {
        hits.push(n.property && n.property.name || '?');
      }
    },
  });
  return hits;
}

/* ─── 1. the flight sim's globe ─────────────────────────────────────────────────────────────── */

test('the flight sim asks for the ALL-ZOOM globe, not the zoom-dependent one', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /setProjection\(\s*['"]globe-true['"]\s*\)/,
    "start() must ask the engine for 'globe-true' — MapLibre's plain globe is mercator from z≈12, which is where the sim flies");
  assert.ok(!/setProjection\(\s*\{\s*type\s*:/.test(src),
    'the sim must not name a renderer projection spec directly — it goes through IntMapGeoEngine');
});

test('leaving the sim restores the projection unconditionally', () => {
  const src = stripComments(R('js/flight-sim.js'));
  const stop = src.slice(src.indexOf('function stop()'), src.indexOf('function computeTrim()'));
  const line = stop.split('\n').find(l => /view\.proj\.(globe|flat)/.test(l));
  assert.ok(line, 'stop() must put the projection back');
  assert.ok(!/pv\.proj\s*!==\s*HOST\.proj/.test(line),
    'the restore must NOT be conditional on the app-level projection changing: entry now sets a projection SPEC that no app state records, so a pilot who was already on the globe would be left on the all-zoom globe for good');
});

/* ─── 2. silent by default ──────────────────────────────────────────────────────────────────── */

test('flight audio is muted by default and remembers the choice', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /let ctx=null,\s*on=false,\s*muted=_mutedInit\(\)/, 'muted must be seeded from the stored preference, not hard-coded false');
  assert.match(src, /localStorage\.getItem\(SND_KEY\)\s*!==\s*['"]on['"]/, 'anything other than an explicit "on" means silence — that is what "default" means here');
  assert.match(src, /function toggleMute\(\)\{[^}]*localStorage\.setItem\(SND_KEY/, 'the toggle must persist the choice');
  assert.ok(!/<button class="fs-act on" data-act="mute"/.test(src),
    'the HUD SOUND key must reflect the real state, not be hard-coded to "on"');
  assert.match(src, /fsAudio\.isMuted\(\)\?''\:' on'/, 'the deck button reads the audio state');
});

test('a muted flight builds no audio graph at all', () => {
  const src = stripComments(R('js/flight-sim.js'));
  assert.match(src, /function start\(\)\{ if\(on\) return; on=true;[\s\S]{0,200}?if\(!muted\) build\(\);/,
    'start() must only build the synth when sound is wanted — a zeroed gain still keeps an AudioContext running');
  assert.match(src, /if\(!muted&&on&&!ctx\) build\(\)/, 'un-muting mid-flight has to build the graph then (riding that click as the user gesture)');
});

/* ─── 3. the 3-D volume panel ───────────────────────────────────────────────────────────────── */

test('the volume panel never rebuilds itself from an input handler', () => {
  const src = stripComments(R('js/tool-panel.js'));
  const block = src.slice(src.indexOf("if(HOST.toolMode==='volume'){", src.indexOf('const cl=p.querySelector')));
  assert.ok(block.length > 400, 'volume wiring block not found');
  const wiring = block.slice(0, block.indexOf("if(HOST.toolMode==='radius'){"));
  assert.ok(/bI\.oninput=applyAlt/.test(wiring) && /tI\.oninput=applyAlt/.test(wiring), 'the altitude fields drive applyAlt');
  const applyAlt = wiring.slice(wiring.indexOf('const applyAlt='), wiring.indexOf('const applyAlt=') + 200);
  assert.ok(!/updateToolPanel\(\)/.test(applyAlt),
    'applyAlt must NOT call updateToolPanel() — that rewrites the panel innerHTML and destroys the field being typed into (measured: "2500" became "2")');
  assert.match(wiring, /const sync=\(\)=>/, 'derived numbers must be refreshed in place');
  for (const id of ['#v3d-pts', '#v3d-area', '#v3d-thick', '#v3d-vol', '#v3d-gnd']) {
    assert.ok(wiring.includes(id), `sync() must update ${id} in place`);
  }
});

test('the altitude fields survive a half-typed value and never swap under the cursor', () => {
  const src = stripComments(R('js/volume3d.js'));
  assert.match(src, /function _num\(v,cur\)\{[\s\S]{0,260}?s===''\|\|s==='-'/,
    "an empty or lone-minus field is a keyboard state, not the number 0 — +'' is 0, which is how the old isFinite(+b) test silently rewrote a cleared field");
  assert.ok(!/if\(nt<nb\)\{\s*const s=nb;/.test(src), 'the base/top swap is gone — the band is min..max at paint time instead');
  assert.match(src, /const loM=\(\)=>Math\.min\(baseM,topM\), hiM=\(\)=>Math\.max\(baseM,topM\)/, 'the band is derived, not stored swapped');
  assert.match(src, /const rb=Math\.max\(0, loM\(\)-off\), rh=Math\.max\(rb\+0\.5, hiM\(\)-off\)/, 'the extrusion uses the derived band');
});

test('the footprint is no longer only straight lines', () => {
  const src = stripComments(R('js/volume3d.js'));
  for (const s of ['polygon', 'freehand', 'circle', 'rect']) assert.ok(src.includes(`'${s}'`), `shape ${s} must exist`);
  assert.match(src, /function circleRing\(centre,radiusMetres,n\)/, 'a real circular footprint');
  assert.match(src, /function rectRing\(a,b,perSide\)/, 'a rectangle, densified so its sides follow the projection');
  assert.match(src, /function rdp\(pts,eps\)/, 'freehand traces are simplified like the Draw tool');
  assert.match(src, /function destM\(c,distMetres,brg\)/, 'the circle is built in ground METRES, so it is round at any latitude');
  const panel = stripComments(R('js/tool-panel.js'));
  for (const s of ['polygon', 'freehand', 'circle', 'rect']) assert.ok(panel.includes(`['${s}'`), `the panel must offer ${s}`);
});

test('the volume tool has colour and opacity, and they reach the renderer', () => {
  const panel = stripComments(R('js/tool-panel.js'));
  assert.match(panel, /const V3D_COLORS=\[/, 'colour presets');
  assert.match(panel, /id="v3d-color"/, 'a custom colour picker');
  assert.match(panel, /id="v3d-op"/, 'an opacity slider');
  assert.match(panel, /col\.oninput=\(\)=>\{ if\(V\) V\.setStyle\(col\.value,null\)/, 'the picker drives the module');
  assert.match(panel, /op\.oninput=\(\)=>\{ if\(V\) V\.setStyle\(null,parseFloat\(op\.value\)\)/, 'the slider drives the module');
  const mod = stripComments(R('js/volume3d.js'));
  assert.match(mod, /setPaint\(LYR,'fill-extrusion-color',color\)/, 'a colour change must reach the box');
  assert.match(mod, /setPaint\(EDGE,'line-color',color\)/, '…and its ground outline');
  assert.ok(!/coalesce'\],\['get','color'\]/.test(mod) && !/\['coalesce',\['get','color'\]/.test(mod),
    "the layer colour must be a plain value: the coalesce form left the layer's own paint property frozen at its creation colour");
});

test('a stroke shape owns the drag and cannot leave a stray polygon vertex', () => {
  const mod = stripComments(R('js/volume3d.js'));
  assert.match(mod, /GE\(\)\.input\.setDragPan\(!on\)/, 'the tool suspends the renderer pan through the engine, not by touching its handler');
  assert.match(mod, /const ownsGesture=\(\)=>armed/, 'the tool must be able to say when it owns the gesture');
  const readout = stripComments(R('js/map-readout.js'));
  assert.match(readout, /IntMapVolume3D\.ownsGesture\(\)\) return/, 'handleMapClick must ignore the synthetic click at the end of a stroke');
  assert.match(stripComments(INDEX), /IntMapVolume3D\.release\(\)/, 'closing the tool must hand the gesture back, not merely clear the ring');
});

/* ─── 4. tilt ceiling + eye altitude ────────────────────────────────────────────────────────── */

test('the tilt ceiling is a real setting, wired both ways, in five languages', () => {
  assert.match(INDEX, /id="setting-tilt-limit"/, 'the Settings row exists');
  assert.match(INDEX, /tl\.value=window\.IntMapTilt\.isUnlimited\(\)\?'unlimited':'standard'/, 'opening Settings reflects the saved state');
  assert.match(INDEX, /window\.IntMapTilt\.set\(tl\.value==='unlimited'\)/, 'Apply commits it');
  const i18n = R('js/i18n.js');
  for (const k of ['lblTiltLimit', 'tiltStandard', 'tiltUnlimited', 'tiltHint']) {
    assert.ok(INDEX.includes(k + ':'), `${k} missing from the en/jp tables in index.html`);
    assert.equal((i18n.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, `${k} must exist in de, ru and es`);
  }
});

test('the tilt ceiling is the RENDERER\'s, never a literal', () => {
  const src = stripComments(R('js/view-controls.js'));
  assert.match(src, /function engineMax\(\)\{ try\{ const r=GE\(\)\.camera\.tiltRange\(\)/, 'the ceiling comes from the engine capability, so an engine with a different range is not lied about');
  assert.match(src, /const STANDARD=78/, '78 is the standard ceiling index.html sets at boot');
  assert.match(src, /function fromAngle\(deg,bearing\)/, 'angles past the top resolve into a real (pitch, bearing) pair');
  const atlas = stripComments(R('js/atlas-console.js'));
  assert.ok(!/case 'pitch': case 'tilt':[\s\S]{0,400}?Math\.min\(85,tp\)/.test(atlas),
    'the Atlas tilt action must not clamp to a literal 85 — it has to honour the chosen ceiling');
  assert.match(atlas, /_cap=_T\?_T\.ceiling\(\):85/, 'Atlas reads the ceiling from IntMapTilt');
});

test('the viewpoint-altitude readout is a real setting, in five languages, and shows up in the readout', () => {
  assert.match(INDEX, /id="setting-eye-alt"/, 'the Settings row exists');
  assert.match(INDEX, /window\.IntMapEyeAlt\.set\(ea\.value==='on'\)/, 'Apply commits it');
  const i18n = R('js/i18n.js');
  for (const k of ['lblEyeAlt', 'eyeAltOff', 'eyeAltOn']) {
    assert.ok(INDEX.includes(k + ':'), `${k} missing from the en/jp tables in index.html`);
    assert.equal((i18n.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, `${k} must exist in de, ru and es`);
  }
  const readout = stripComments(R('js/map-readout.js'));
  assert.match(readout, /window\.IntMapEyeAlt\.text\(\)/, 'the readout asks the module for its chip');
  assert.match(readout, /if\(!eye\)\{ el\.style\.display='none'; return; \}/,
    'with the option on, the readout must stay up when the cursor leaves the map — the camera altitude is still true, and it is the ALWAYS-on readout');
});

test('the eye altitude is derived from the renderer, not guessed from the zoom', () => {
  const adapter = INDEX.slice(INDEX.indexOf('cameraAltitude(){'), INDEX.indexOf('cameraAltitude(){') + 1400);
  assert.match(adapter, /m\.unproject\(\[w\/2-50,h\/2\]\)/, 'metres-per-pixel is MEASURED off the renderer, so it stays true in globe as well as mercator');
  assert.match(adapter, /cameraToCenterDistance/, "the camera→centre distance comes from the renderer when it is readable (fov is the renderer's business)");
  assert.match(adapter, /getCameraTargetElevation/, 'the terrain under the centre is added, so the number is above SEA LEVEL');
});

/* ─── 5. Atlas is the control plane (the #R115 rule: uncatalogued = nonexistent) ─────────────── */

test('every new switch is operable from Atlas AND catalogued', () => {
  const atlas = R('js/atlas-console.js');
  for (const a of ['tiltLimit', 'eyeAltitude']) {
    assert.ok(atlas.includes(`case '${a}':`), `Atlas must implement ${a}`);
    assert.ok(atlas.includes(`{"type":"${a}"`), `${a} must appear in the SYS catalogue or the planner does not know it exists`);
    assert.ok(new RegExp(`\\b${a}:\\{ lbl:`).test(atlas), `${a} should offer an inline on/off switch in the reply`);
  }
  assert.match(atlas, /"shape"\?:"square"\|"circle"/, 'the volume3d action must advertise the circular footprint');
  assert.match(atlas, /const round=\/\^\(circle\|round\|circular\|円\|丸\)\$\/i/, '…and implement it');
});

/* ─── 6. renderer independence (phase 5) ────────────────────────────────────────────────────── */

test('the new view-controls module never touches the renderer', () => {
  assert.deepEqual(rawMapUses('view-controls.js'), [], 'js/view-controls.js must be written against IntMapGeoEngine alone');
  assert.deepEqual(rawMapUses('volume3d.js'), [], 'js/volume3d.js stays engine-only (#R170)');
});

test('the ten modules cleared this round stay clear of the renderer', () => {
  const cleared = ['ai-core.js', 'community.js', 'companies-ui.js', 'news-feed.js', 'news-timeline.js',
    'feedback.js', 'onboarding.js', 'elevation-profile.js', 'search-geocode.js', 'workspace.js'];
  const dirty = cleared.filter(f => rawMapUses(f).length).map(f => f + ' → ' + rawMapUses(f).join(','));
  assert.deepEqual(dirty, [], 'these modules were migrated to IntMapGeoEngine — a raw map call here is a regression');
});

test('the count of renderer-independent modules only goes up', () => {
  const clean = JS_FILES.filter(f => rawMapUses(f).length === 0);
  // 24 after this round (14 that never touched it + volume3d + view-controls + the ten cleared here,
  // minus the ones already counted). Pinned as a floor so the direction of travel is one-way.
  assert.ok(clean.length >= 24, `only ${clean.length} of ${JS_FILES.length} modules are renderer-independent — this must not go backwards`);
});

test('the engine contract declares what this round needed, and Cesium answers for it too', () => {
  const caps = INDEX.slice(INDEX.indexOf('const MAPLIBRE_CAPS='), INDEX.indexOf('const MAPLIBRE_CAPS=') + 2200);
  for (const k of ['globeAllZooms', 'tiltRange', 'cameraAltitude']) assert.ok(caps.includes(k), `capability ${k} missing`);
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 900);
  for (const k of ['globeAllZooms', 'tiltRange', 'cameraAltitude']) assert.ok(cesium.includes(k), `the Cesium contract must answer for ${k}`);
  for (const m of ['getProjection:', 'setBearing:', 'setPitch:', 'getMaxPitch:', 'setMaxPitch:', 'tiltRange:', 'altitude:']) {
    assert.ok(INDEX.includes(m), `the camera facade must expose ${m}`);
  }
  assert.match(INDEX, /input:\{ setDragPan:on=>_adapter\.setDragPan\(on\) \}/, 'gesture hand-over belongs in the contract');
});

test('the module list, script tag and boot call for view-controls all agree', () => {
  assert.match(INDEX, /<script src="js\/view-controls\.js"><\/script>/, 'the file must be loaded');
  assert.match(INDEX, /window\.IntMapModules\.viewControls\(map,IM_HOST\)/, 'the factory must be instantiated with the other module factories');
  const src = R('js/view-controls.js');
  assert.match(src, /window\.IntMapModules\.viewControls=function\(map,HOST\)/, 'factory shape');
  assert.match(src, /\(function waitForEngine\(n\)\{/,
    'the factories run before IntMapGeoEngine exists (#R170) — the module must wait for it rather than binding to nothing');
});
