/* ============================================================================
 *  R196 — the source-level and browser-free guards for this round.
 *
 *  The things a real renderer has to answer live in tests/r196.spec.js. What is
 *  here is what can be proved without one: that the two splits are byte-for-byte
 *  moves, that the geometry they carried still behaves at the antimeridian and
 *  over the poles, and that the four numbers this round changed are the numbers
 *  it says it changed.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appShell } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① THE SPLITS ARE MOVES, NOT REWRITES ──────────────────────────────────────────────────────
   #R194's lesson: a "pure transport" is a claim until a machine compares the bytes. Both blocks
   below were lifted whole, so every line of the moved body must still exist verbatim in its new
   file — and must NOT still exist in the shell (a leftover inline copy of a moved function
   declaration WINS over the module, which is the failure mode #R168 #8 was written for). */
test('R196 ①a js/geodesy.js carries the antimeridian block verbatim, and the shell does not', () => {
  const g = rd('js/geodesy.js');
  const shell = rd('js/app-body.js');
  const needles = [
    'const _R_EARTH_KM=6371.0088, _HALF_CIRCUM=Math.PI*_R_EARTH_KM;',
    'function _clipHalf(poly,x,keepGE){',
    'function _splitPolyToWindows(poly){',
    'function _splitLineToWindows(line){',
    'function diskFillPolys(center,radiusKm,steps){',
    'function diskOutlineLines(center,radiusKm,steps){',
    'function sanitizeFeatures(feats){',
  ];
  for (const n of needles) {
    assert.ok(g.includes(n), `js/geodesy.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* …and the shell re-binds them under their ORIGINAL names, because IM_HOST publishes them and
     four other modules read them through it */
  /* ⚠ AS HOISTED FUNCTION DECLARATIONS. Five of the six are bound AT FACTORY TIME through IM_HOST by
     js/tool-panel.js, js/seismic.js, js/dash-extended.js and js/atlas-console.js, and a factory can
     run before a `const` further down the closure exists — #R167's dead-zone rule, which caught the
     first version of this split. */
  for (const n of ['_gcRingUnwrapped', '_splitPolyToWindows', '_splitLineToWindows', 'diskFillPolys', 'diskOutlineLines', 'sanitizeFeatures']) {
    assert.match(shell, new RegExp(`\\n  function ${n}\\(\\)\\{ return window\\.IntMapGeodesy\\.${n}\\.apply\\(null,arguments\\); \\}`),
      `${n} must be a hoisted function declaration delegating to window.IntMapGeodesy`);
  }
});

test('R196 ①b js/tile-warm.js carries the prefetch block, and takes its five values through IM_HOST', () => {
  const w = rd('js/tile-warm.js');
  const shell = rd('js/app-body.js');
  for (const n of ['function registerTileSW(){', 'function predictivePrefetch(aggressive){', "postMessage({type:'prefetch',urls:uniq})"]) {
    assert.ok(w.includes(n), `js/tile-warm.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* ⚠ the free references are the whole risk of a split (#R194) — they arrive through the host */
  assert.match(w, /HOST\.mapType!=='sat'/, 'the basemap is read from IM_HOST, not closed over');
  assert.match(w, /HOST\.satState\.providerId/, 'the provider is read from IM_HOST');
  assert.match(shell, /get satBuildTiles\(\)\{ return satBuildTiles; \}/, 'IM_HOST must publish satBuildTiles');
  /* (#R200) …from js/label-occlusion.js now: the mount sat inside the label/occlusion block, which
     left js/app-body.js this round. The call did not move relative to the code around it — the file
     did — so this asks the file that holds it. */
  assert.match(rd('js/label-occlusion.js'), /window\.IntMapModules\.tileWarm\(HOST\)/, 'the block that always mounted it still does');
  assert.ok(rd('src/main.js').includes("import '../js/tile-warm.js';"), 'the entry imports it');
  assert.ok(rd('src/main.js').includes("import '../js/geodesy.js';"), 'the entry imports js/geodesy.js');
  assert.match(rd('src/main.js'), /'satProto', 'tileWarm',/, 'the factory guard knows about tileWarm');
});

/* ── ② THE GEOMETRY STILL WORKS — IN NODE, WITHOUT A BROWSER ───────────────────────────────────
   This is the point of moving it: the block is a pure function of coordinates, so its two hardest
   cases (a circle that crosses ±180°, and one that swallows a pole) can be asserted here rather
   than only through a rendered map. */
test('R196 ② the pole-safe geometry: a seam-crossing disk splits, a pole-swallowing one caps', async () => {
  const src = rd('js/geodesy.js');
  /* evaluate the module body with a `window` of our own — it publishes onto it and nothing else */
  const box = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(box.window);
  const G = box.window.IntMapGeodesy;
  assert.ok(G && typeof G.diskFillPolys === 'function', 'the module publishes window.IntMapGeodesy');

  /* a 500 km disk sitting ON the antimeridian must come back as pieces that each stay in range */
  const seam = G.diskFillPolys([179.8, 0], 500, 96);
  assert.ok(seam.length >= 2, `a disk over ±180° must be split into pieces; got ${seam.length}`);
  for (const poly of seam) for (const ring of poly) for (const [lng] of ring)
    assert.ok(lng >= -180.001 && lng <= 180.001, `every vertex stays inside [-180,180]; saw ${lng}`);

  /* a disk big enough to contain the north pole must still be drawable — and must reach it */
  const cap = G.diskFillPolys([0, 85], 1500, 96);
  assert.ok(cap.length >= 1, 'a pole-swallowing disk still produces geometry');
  let maxLat = -90;
  for (const poly of cap) for (const ring of poly) for (const [, lat] of ring) if (lat > maxLat) maxLat = lat;
  assert.ok(maxLat > 89, `the polar cap must reach the pole; the highest vertex was ${maxLat}`);

  /* and the ordinary case is unchanged: a small disk is one piece, closed, at the right radius */
  const plain = G.diskFillPolys([139.7, 35.7], 100, 64);
  assert.equal(plain.length, 1, 'a small disk is one polygon');
  const ring0 = plain[0][0];
  assert.deepEqual(ring0[0], ring0[ring0.length - 1], 'the ring is closed');
});

/* ── ③ THE FOUR NUMBERS THIS ROUND CHANGED ─────────────────────────────────────────────────────
   Each one is a fact a future round would otherwise have to re-derive from a screenshot. */
test('R196 ③a the flight simulator sets NO distance fog', () => {
  const fs = rd('js/flight-sim.js');
  const m = /setSky\(\{'sky-color':'#3f78c2'[^}]*\}\)/.exec(fs);
  assert.ok(m, 'the cockpit sky block is still set in one place');
  assert.match(m[0], /'horizon-fog-blend':0\b/, "horizon-fog-blend 0 = the horizon band is the horizon colour");
  assert.match(m[0], /'fog-ground-blend':1\b/, 'fog-ground-blend 1 = fog only exactly at the horizon');
  assert.match(m[0], /'sky-color':'#3f78c2'/, 'the SKY half of the #R99 spec is untouched');
});

test('R196 ③b the sky is set for EVERY basemap, and set3D no longer fights it', () => {
  const shell = appShell(new URL('../', import.meta.url));
  /* (#R199) the sky itself moved to js/theme-sky.js — one coherent subject, taken out of app-body
     whole. set3D stayed behind, so the "one owner" claim is still asked of the shell; the sky's own
     declarations are now asked of the file that holds them, which is stricter than searching a
     concatenation. The satellite-only gate must be absent from BOTH. */
  const sky = rd('js/theme-sky.js');
  assert.doesNotMatch(shell, /if\(currentProj!=='globe'\)\{ try\{ GE\(\)\.scene\.setSky/,
    'set3D must not install a second sky — one owner (#R196)');
  /* ⚠ (#R213) THE PIN MOVED FROM THE LITERAL TO THE CLAIM. This asserted the string `0.55`, which is
     the value #R196 measured AT GROUND LEVEL — but the claim it was standing in for is "the
     atmosphere band is declared, and it is as thick as the Cesium capture showed". #R213 made the
     thickness fall off with the camera's height (the shell subtends less of the view from orbit), so
     the literal is gone while the measurement it encoded is not: `_horizonBlend()` still returns
     0.55 at h = 0. Pinning the literal here would have failed a change that preserves the finding —
     the #R203 trap of writing the previous round's value instead of its meaning. */
  assert.match(sky, /'sky-horizon-blend':_horizonBlend\(\)/, 'the atmosphere band is declared');
  assert.match(sky, /function _horizonBlend\(\)\{\s*const h=Math\.max\(0,_eyeAltM\(\)\);\s*if\(!\(h>0\)\) return 0\.55;/,
    'and at ground level it is still the 0.55 #R196 measured');
  /* ⚠ (#R216) SUPERSEDED, DELIBERATELY. #R196 pinned the fog OFF because it was matching a Cesium
     capture, and Cesium's SkyAtmosphere draws no ground haze. #R216 was asked to make the atmosphere
     「もっとリアルで忠実で」 and put aerial perspective back: it is the same Rayleigh scattering seen
     along a horizontal path, and with it off the terrain met the horizon at a hard line. What #R196
     was actually protecting — that no white wash covers the middle of the map (#R174's complaint about
     the flight simulator) — is kept as a FLOOR on `fog-ground-blend`, and the fog is off entirely above
     the atmosphere, which is where Cesium's capture and this model agree again. */
  assert.match(sky, /'fog-ground-blend':fg\.ground/, 'the fog is not driven by the aerial-perspective term');
  assert.match(sky, /function _aerial\(\)/, 'there is no aerial-perspective term');
  assert.match(sky, /if\(h>=80000\)\s*return\s*\{\s*ground:1,\s*horizon:0\s*\}/,
    'haze is drawn from above the atmosphere, where none is in the line of sight');
  {
    const m = /ground:\+\(1-([\d.]+)\*f\)/.exec(sky);
    assert.ok(m && 1 - parseFloat(m[1]) >= 0.6, 'the haze reaches too far in from the horizon (#R174)');
  }
  /* the horizon colour follows the Sun, so it cannot be a constant */
  assert.match(sky, /function _horizonColour\(\)/);
  assert.match(sky, /function _sunElevAtCentre\(\)/);
  /* …and the early return that made this satellite-only is gone */
  assert.doesNotMatch(shell + sky, /if\(!sat\)\{ if\(_applySkyAtmosphere\._on\)/, 'the satellite-only gate is gone');
});

test('R196 ③c the tile prefetch remembers what it has already asked for', () => {
  const w = rd('js/tile-warm.js');
  assert.match(w, /const _pfSeen=new Set\(\);/, 'the memo exists');
  /* ⚠ declared ABOVE its reader — #R189: a const below the function that reads it is a TDZ waiting
     for the one early call, and every call site here is inside a try/catch that would swallow it */
  assert.ok(w.indexOf('const _pfSeen=new Set();') < w.indexOf('function predictivePrefetch('),
    'the memo must be declared before the function that reads it');
  assert.match(w, /\.filter\(u=>!_pfSeen\.has\(u\)\)/, 'the ring is filtered against the memo');
});

test('R196 ③d a satellite tile fetch is not abortable, and in-flight requests are shared', () => {
  for (const f of ['src/sat-worker.js', 'js/sat-proto.js']) {
    const s = rd(f);
    assert.doesNotMatch(s, /fetch\((?:url\(z, y, x\)|_satUrl\(z,y,x\)),\s*\{\s*signal/,
      `${f}: the HTTP fetch must not carry the abort signal — cancelling it guarantees a refetch`);
    assert.ok(/inflight|_satFly/.test(s), `${f}: concurrent requests for one tile share a promise`);
    assert.match(s, /signal\s*&&\s*signal\.aborted/, `${f}: the abort still stops the ancestor walk`);
  }
});

/* ── ④ THE NIGHT SIDE ──────────────────────────────────────────────────────────────────────── */
test('R196 ④ the night side is a zoom expression, and builds nothing until it would be visible', () => {
  const n = rd('js/night-side.js');
  /* ⚠ the defect that shipped in the first version: a zoom expression may only be the OUTERMOST
     one, and addLayer swallows the rejection, so the layer silently did not exist */
  assert.doesNotMatch(n, /\['\*',\['get','a'\],RAMP\]/, 'no zoom expression nested inside another');
  assert.match(n, /const ramp=\(k\)=>\['interpolate',\['linear'\],\['zoom'\]\]/, 'the scale multiplies the STOPS');
  /* ⚠ (#R201) the rejection is now CAUGHT AND ANSWERED rather than caught and abandoned: the polar
     cap's opacity is data-driven, so if MapLibre ever refuses that form the layer is re-added with a
     plain ramp instead of the night side losing its poles. The property is the same one — addLayer
     swallows a rejected paint expression, so the layer is READ BACK. */
  assert.match(n, /if\(!GE\(\)\.layers\.has\(LYR\)\)\{[\s\S]{0,120}?lastErr='cap-expression';/,
    'a rejected paint expression is detected, and answered with a form that cannot be rejected');
  /* (#R220) …and a failed read-back now UNMAKES what it built: the polar fan on its own is a black
     disc on the pole, which is what seven rounds of that report turned out to be. */
  assert.match(n, /if\(!GE\(\)\.layers\.hasDynamicImage\(DYN\)\)\{[^}]*destroy\(\); return false; \}/,
    'and the image — which now carries the whole effect — is read back too');
  assert.match(n, /imageRowLatitudes/, 'the lights image is placed through the engine’s row→latitude map (#R195)');
  assert.match(n, /if\(zoomNow\(\)>ZMAX\+0\.4\)\{ return; \}/, 'nothing is built until the camera is wide enough');
  /* …and the GIBS request is not on the boot path — the app opens at zoom 1.7 */
  assert.match(n, /requestIdleCallback\(_lights,\{timeout:6000\}\)/, 'the city lights wait for the first idle');
  /* ⚠ MapLibre ONLY — measured: whole-globe clamped-to-ground polygons stopped Cesium's camera
     outright (tests/r182-cesium ③ passed on main, failed here, passed again with this switched off),
     and Cesium does not need them: its globe has real solar lighting, driven by the same
     setSunDirection() call this round now makes for every basemap. */
  assert.match(n, /function engineIsMapLibre\(\)/, 'the engine is checked');
  assert.match(n, /if\(!engineIsMapLibre\(\)\) return false;/, 'build() refuses on a second engine');
  assert.match(n, /if\(!enabled\|\|!engineIsMapLibre\(\)\) return;/, 'and so does the moveend hook');
  assert.ok(existsSync(join(ROOT, 'js/night-side.js')));
  assert.ok(rd('src/main.js').includes("import '../js/night-side.js';"), 'the entry imports it');
});

/* ── ⑤ THE PICK GESTURE ────────────────────────────────────────────────────────────────────── */
test('R196 ⑤ every "place this on the map" button steps its panel aside', () => {
  const p = rd('js/map-pick.js');
  /* ⚠ (#R207) THE INVARIANT IS "THE PANEL STOPS COVERING THE MAP", NOT "THE PANEL IS HIDDEN".
     #R196 measured the real defect — the seismic panel covers 82 % of a 390 × 844 map, so the app
     asked for a tap on a surface it was standing on — and removed the panel to fix it. 「震源地を
     設置ボタンを押すとポップアップが消えるのは不要」: #R207 keeps the panel on screen and takes it
     out of HIT-TESTING instead (`pointer-events:none`), which satisfies the same measurement —
     coverage stops mattering once the cover is transparent to input — without the disappearance.
     So this asserts that the panel is stepped aside SOMEHOW, and that the step is undone afterwards. */
  assert.match(p, /pointerEvents='none'|_hide\(panel\)/, 'the requesting panel stops covering the map for the duration');
  assert.match(p, /_unghost\(s\.panel,s\.prevStyle\)|_show\(s\.panel,s\.prevDisplay\)/,
    '…and teardown puts it back exactly as it was');
  assert.match(p, /GE\(\)\.events\.once\('click',s\.h\)/, 'the delivery mechanism is unchanged');
  assert.match(p, /e\.key==='Escape'/, 'Esc cancels');
  /* the four callers, each still keeping its old path as a fallback */
  const seismic = rd('js/seismic.js');
  assert.match(seismic, /const P=window\.IntMapPick;\s*\n\s*if\(P&&P\.start\)\{/, 'the seismic epicentre uses it');
  /* ⚠ (#R206) THIS ASSERTED A LITERAL AND SO IT BROKE ON A CHANGE THAT KEPT ITS MEANING.
     It read `picking=false; epi=[ll.lng,ll.lat]` byte for byte; #R206 routes the flag through
     setPicking() so the ◎ button can stop looking permanently selected, and the pin went red while
     the behaviour it names — "a pick leaves pick mode and sets the epicentre to what was picked" —
     was untouched. That behaviour is what is asserted now (the same lesson #R205 wrote down after
     five pins broke the same way). */
  const onPick = /onPick:\(ll\)=>\{([^}]*)\}/.exec(seismic);
  assert.ok(onPick, 'the pick has an onPick handler');
  assert.match(onPick[1], /picking\s*=\s*false|setPicking\(\s*false\s*\)/, 'a completed pick leaves pick mode');
  /* WARN (#R210) the same lesson one more time: setEpi() now owns the assignment, because moving
     the epicentre must also clear the observation points. The BEHAVIOUR asserted is unchanged. */
  assert.match(onPick[1], /(?:epi\s*=|setEpi\(\s*)\[\s*ll\.lng\s*,\s*ll\.lat\s*\]/, 'and sets the epicenter from the pick');
  const sims = rd('js/sims.js');
  assert.equal((sims.match(/window\.IntMapPick/g) || []).length, 6, 'the three pickers in js/sims.js use it');
});

/* ── ⑤b ATLAS DRIVES IT ───────────────────────────────────────────────
   STANDING: every feature is operable from Atlas. ⚠ #R115's lesson is that an action parameter the SYS
   catalogue does not mention DOES NOT EXIST to the planner — so all three places are checked. */
test('R196 ⑤b the night side is an Atlas action, in the dispatch AND in the catalogue', () => {
  const a = rd('js/atlas-console.js');
  assert.match(a, /case 'nightSide': \{/, 'the dispatch handles it');
  assert.match(a, /window\.IntMapNightSide\.setEnabled\(want\)/, 'and really drives the module');
  assert.match(a, /nightSide:\{ lbl:\(\)=>L\('Night side of the Earth'/, 'it is a listed on/off surface');
  assert.match(a, /\{"type":"nightSide","on":bool\}/, 'and the SYS catalogue declares it');
});

/* ── ⑥ THE TSUNAMI FOLLOWS THE EARTHQUAKE ──────────────────────────────────────────────────── */
test('R196 ⑥ the propagation model follows the seismic panel, debounced', () => {
  const t = rd('js/tsunami.js');
  assert.match(t, /function follow\(o\)\{/, 'there is a follow()');
  assert.match(t, /if\(!opened\|\|o\.lng==null/, 'it does nothing unless the panel is open');
  assert.match(t, /setTimeout\(\(\)=>\{ srcPending=false; if\(!opened\) return; ranKey=srcKey\(\); build\(\); \},900\)/,
    'it debounces — a magnitude spinner must not start a solve per keystroke');
  /* ⚠ (#R214) THE CLAIM IS «follow IS EXPORTED», NOT «the export literal starts with these bytes».
     This pinned the whole `return { … }` line, so #R214 naming that object `API` (to register its
     share state after it exists) failed a test about the seismic panel's debounce. That is exactly
     #R203's trap. The claim is now derived from the object however it is spelled. */
  const api = /(?:return|const\s+API\s*=)\s*\{\s*open, close, play, pause, setFrame, setTime:setTimeS, at, follow,/.exec(t);
  assert.ok(api, 'follow is on the public API object, whatever that object is called');
  const s = rd('js/seismic.js');
  assert.match(s, /function syncTsunamiSource\(\)\{/);
  assert.match(s, /function refresh\(\)\{ draw\(\); warmEpi\(\); schedField\(\); syncTsunamiSource\(\); \}/);
  assert.match(s, /function touch\(\)\{ draw\(\); warmEpi\(\); markStale\(\); syncTsunamiSource\(\); \}/);
});

test('R196 ⑧ the build stamps have moved on from this round', () => {
  /* ⚠ (#R199) this pinned R196's own two values, and #R174 already wrote down why that is the wrong
     shape: a test that pins the CURRENT round's stamp goes quiet the moment the round ends — it keeps
     passing while the stamp goes stale, which is exactly what happened through #R198 (shipped at
     R196). Same correction #R176 made to #R175's copy: assert the NEGATIVE here, and let the current
     round pin its exact value in its own checks file (tests/r199-checks.test.mjs ⑥). */
  const idx = rd('index.html');
  assert.doesNotMatch(idx, /window\.__imBuild='R196';/, 'the build marker must move every round');
  assert.doesNotMatch(idx, /window\.INTMAP_BUILD='2026-08-06-R196';/, 'and so must the anti-stale-version stamp');
  assert.match(idx, /window\.__imBuild='R\d+';/, 'both are still round stamps');
  assert.match(idx, /window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R\d+';/);
});

/* ── ⑦ THE LOCAL RUN IS PLANNED ────────────────────────────────────────────────────────────── */
test('R196 ⑦ npm test runs the browser suite through the measured plan', () => {
  const pkg = JSON.parse(rd('package.json'));
  /* ⚠ (#R205) THE PIN WAS "`npm test` ENDS WITH run-tests.mjs", WHICH IS A SHAPE, NOT THE PROPERTY.
     `npm test` now delegates to scripts/test-parallel.mjs so the source half and the browser half run
     at the same time. What #R196 established is that the BROWSER HALF GOES THROUGH THE PLANNER rather
     than being handed the whole directory in readdir order — so that is what is asserted, wherever
     `npm test` happens to reach it from. */
  const entry = pkg.scripts.test;
  const reachesRunner = /run-tests\.mjs/.test(entry)
    || (/test-parallel\.mjs/.test(entry) && /run-tests\.mjs/.test(rd('scripts/test-parallel.mjs')));
  assert.ok(reachesRunner, 'the browser half goes through the runner');
  const r = rd('scripts/run-tests.mjs');
  assert.match(r, /poolFiles\('rest'\)/);
  assert.match(r, /run\(solo, 1,/, 'the solo pool gets one worker, as CI gives it one machine');
  assert.match(r, /running the whole directory instead/, 'it degrades to the old behaviour rather than to a subset');
});
