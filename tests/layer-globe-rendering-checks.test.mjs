/* ============================================================================
 *  The renderers: camera geometry, the Cesium globe and its polar caps, the sky, the atmosphere and the shared border style
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r190-checks.test.mjs, tests/r175-checks.test.mjs, tests/r184-checks.test.mjs, tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs, { readFileSync, readdirSync } from 'node:fs';
import path, { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as BS from '../js/border-style.js';
import { asClassicScript } from './app-source.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 5 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* ============================================================================
 *  R187 — source-level checks (no browser)
 * ----------------------------------------------------------------------------
 *  The parts of this round that are decided by a CONSTANT or by a shipped file,
 *  and would otherwise only be caught by looking at the screen.
 * ==========================================================================*/
const bytes = (p) => fs.readFileSync(path.join(process.cwd(), p));

test('R187 atmosphere: the limb is blended thinner than saturation', () => {
  /* (#R199) …and the file it reads is js/theme-sky.js now: the theme + sky block left js/app-body.js
     whole this round. Pointing the assertion at the file the thing actually lives in is stricter than
     the concatenation it used to search, not looser — the ramps must be in the sky module or nowhere. */
  const src = read('js/theme-sky.js');
  /* ⚠ (#R196) THERE ARE TWO RAMPS NOW, and this test's finding applies to ONE of them. #R187's
     complaint — 「質感がチープ」「日光当たってる側が、ちょっと明るくしすぎ」 — was measured over the
     SATELLITE imagery, where the channels clip. #R196 gave the map basemap a sky too, and over a
     dark vector basemap nothing clips, so that one is blended harder (swept and screenshotted at
     0.55 / 0.80 / 1.00). The satellite number is still the one this test guards. */
  /* ⚠ (#R205) THE SATELLITE RAMP IS THE FIRST ONE, NOT THE SMALLEST ONE. This test picked it with
     `Math.min`, which was true while there were exactly two ramps and became false the moment #R205
     added a third for the LIGHT map basemap at 0.15 — brighter surfaces clip sooner, which is this
     test's own argument applied one basemap further. The ramps are read in source order instead:
     `'atmosphere-blend':(sat ? <satellite> : (<light map> or <dark map>))`. */
  /* ⚠ (#R227) …AND THE THREE RAMPS NOW SIT BEHIND ONE MORE CONDITION, which does not change what
     this test is about. Where the app draws the limb ITSELF (js/limb-layer.js — maplibre discards
     the whole sky block on the globe, so its own atmosphere pass was the only thing drawing the
     Earth's edge), this property is 0 so the two do not add. Everywhere else the ramps below are
     what #R187 and #R205 measured, unchanged, and that is what is read here. */
  /* ══ ⚠⚠ (#R241) THERE IS ONE RAMP AGAIN, AND IT IS THIS TEST'S ONE ═══════════════════════════════
     「衛生写真ではあっても、標準マップでは大気はなし」 — the map basemap's ramps (#R196's 0.80 and
     #R205's 0.15) are not weakened, they are gone, so `map` below has nothing to read. This test's
     own finding is about SATELLITE and it is untouched: an optically-correct scattering term
     multiplied until it clips is what read as 「質感がチープ」, so the peak stays well under 1.0 —
     it is 0.45 now (was 0.55), which is further from the clipping range, not closer. The peak is
     handed to `_airRamp()` rather than written into the expression (tests/r241-checks ④ pins the
     curve itself), so it is read from there. */
  const blend = /'atmosphere-blend':\((?:limb\?0:\()?sat[\s\S]{0,800}?\)\}\);/.exec(src);
  assert.ok(blend, 'the atmosphere-blend expression must still be there');
  /* ⚠ (#R240) THE SECOND STOP IS NO LONGER z4. maplibre multiplies this property by globeness, which
     is already 0 by z12, so the ramp's OWN taper was a second one — measured, it halved the air on
     screen between z4 and z11 while the reader was zooming in, which is 「ある程度までズームインすると
     途端に見えなくなってしまう」. The middle of the curve is flat now and the tail past z13 remains.
     What this test is about is the z0 STRENGTH of each ramp — #R187's and #R205's measured values —
     so it reads the first stop and stops caring which zoom the second one is at. */
  const peak = /_airRamp\(([0-9.]+)\)/.exec(src);
  assert.ok(peak, 'the satellite peak must still be a number this file owns');
  assert.match(src, /'atmosphere-blend':\((?:limb\?0:\()?sat/, 'the strength is chosen by basemap');
  const sat = +peak[1];
  /* 1.0 clipped the channels — an optically correct scattering term multiplied until it saturates
     is what read as a cheap white collar, and as an over-bright sunlit limb. */
  assert.ok(sat < 0.8, `the satellite atmosphere-blend at z0 is ${sat} — that is back in the clipping range`);
  assert.ok(sat > 0.2, `the satellite atmosphere-blend at z0 is ${sat} — the atmosphere would be invisible`);
  assert.match(blend[0], /:0\)\}\);/, 'and the map basemap gets none at all (#R241)');
  /* the SUN's own contribution to the shading came down with it */
  assert.match(read('js/geo-engine.js'), /o\.intensity==null\?0\.3:o\.intensity/, 'light intensity 0.5 → 0.3');
});

/* ── 8. the poles get tiled imagery, not one stretched row ───────────────────────────────────── */
test('R187 Cesium: the polar cap comes from a tiled ±90° source', () => {
  const src = read('js/cesium-engine.js');
  /* An equirectangular image has ONE row of pixels for its topmost 0.176° of latitude; a single
     whole-globe tile hands that row to the entire cap, which draws as a radial smear. */
  assert.match(src, /UrlTemplateImageryProvider/, 'a tiled provider is needed');
  assert.match(src, /GeographicTilingScheme/, 'and it must not be Mercator — that is the whole problem');
  assert.match(src, /gibs\.earthdata\.nasa\.gov\/wmts\/epsg4326/, 'GIBS EPSG:4326 reaches ±90°');
  /* ⚠ AND ITS GRID IS NOT A QUADTREE. Cesium's default scheme doubles from 2 × 1 and asked GIBS for
     2/3/3, which answers `TileOutOfRange` — the cap went BLACK, which is worse than the smear it
     replaced. The service declares 500 m as L0 2×1, L1 3×2, L2 5×3, L3 10×5, L4 20×10 … so only
     L3 onward is a doubling pyramid, and that is the one this enters. */
  assert.match(src, /numberOfLevelZeroTilesX:10,numberOfLevelZeroTilesY:5/, 'the pyramid starts at GIBS L3 (10 × 5)');
  assert.match(src, /customTags:\{ gibsZ:\(prov,x,y,level\)=>level\+3 \}/, 'and the three skipped levels go back onto the path');
  assert.match(src, /maximumLevel:5/, 'L3 + 5 = GIBS L8, the deepest 500 m level');
  /* ⚠ …and scoped to the two bands Mercator cannot reach, which is the layer's ONLY job. Given the
     whole globe it fetches tiles wherever the camera is — including under a flight simulator, where
     they are all hidden behind the app's own imagery. Measured: that cost failed
     tests/r184-cesium-fs three times out of three on a GPU-less runner while main was green. */
  assert.match(src, /const MERC_EDGE=85\.0511287798066;/, 'the Mercator edge is the boundary, named');
  assert.match(src, /\[\[MERC_EDGE,90\],\[-90,-MERC_EDGE\]\]/, 'one layer per cap, not one over the world');
  assert.ok(!/rectangle:rect,\s*\n\s*credit:'NASA EOSDIS GIBS/.test(src),
    'the tiled polar source must not claim the whole globe');
  assert.match(src, /SingleTileImageryProvider/, 'the bundled picture stays as the offline floor');
  /* and both follow the basemap, so a bright blue cap no longer sits on the dark map */
  assert.match(src, /setWorldBase\(on\)\{/, 'the floor must be switchable');
  assert.match(read('js/world-base.js'), /GE\(\)\.scene\.setWorldBase/, 'one caller drives both engines');
  assert.match(read('js/geo-engine.js'), /setWorldBase:on=>/, 'through the contract, not the raw handle');
});

/* ── 9. the sky is deep enough to be a sky ───────────────────────────────────────────────────── */
test('R187 sky: the shipped catalogue is far deeper than the naked-eye sky', () => {
  const b = bytes('data/stars.bin');
  const n = b.readUInt32LE(8);
  /* MEASURED before this round: 331 stars in view, 0.16 % of the space canvas lit, mean channel
     value 0.396 / 255 — numerically black. The Bright Star Catalogue is the naked-eye sky and no
     brightness curve turns 331 dots into one. */
  assert.ok(n > 40000, `only ${n} stars — the naked-eye sky measured as black`);
  const manifest = JSON.parse(read('data/stars.json'));
  assert.match(manifest.source, /Hipparcos/i);
  assert.ok(manifest.magnitude.max >= 9, `catalogue stops at V ${manifest.magnitude.max}`);
  assert.ok(manifest.magnitude.min < -1, 'Sirius must be in it');
});

test('R187 sky: the fast star path is the same rotation as the contract', () => {
  /* js/space-sky.js reads nothing at load time, so its geometry is testable without a browser.
     projectDirection() is what tests/r186 checked against map.project(); viewMatrix() is the
     composed form the 99,000-star loop uses. If they ever disagree the fast path is wrong. */
  const ctx = { window: {}, document: { baseURI: 'http://x/' }, requestAnimationFrame: () => 0, setInterval: () => 0,
                performance: { now: () => 0 } };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(asClassicScript(read('js/space-sky.js')), ctx);
  const S = ctx.window.IntMapSky;
  const D2R = Math.PI / 180;
  let worst = 0;
  for (const F of [
    { width: 1400, height: 900, fovRad: 0.6435, lng: 0, lat: 0, bearingDeg: 0, pitchDeg: 0, rollDeg: 0, offsetX: 0, offsetY: 0 },
    { width: 1400, height: 900, fovRad: 0.6435, lng: 139.7, lat: 35.7, bearingDeg: 42, pitchDeg: 51, rollDeg: 0, offsetX: 0, offsetY: 0 },
    { width: 900, height: 1400, fovRad: 0.6435, lng: -74, lat: -33.4, bearingDeg: -117, pitchDeg: 12, rollDeg: 7, offsetX: 60, offsetY: -40 },
  ]) {
    for (const gmst of [0, 97.3, 280.46]) {
      const M = S.viewMatrix(F, gmst);
      for (const ra of [0, 45, 131.9, 265, 349]) for (const dec of [-80, -20, 0, 37, 88]) {
        const slow = S.projectDirection(ra - gmst, dec, F);
        const v = S.sphereVec(ra, dec);
        /* the fast path: one matrix, then the same projection */
        const d = [0, 1, 2].map((r) => M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2]);
        const w = -d[2];
        if (!(w > 1e-9)) { assert.equal(slow, null, 'both must agree a star is behind the camera'); continue; }
        const f = 1 / Math.tan(F.fovRad / 2), aspect = F.width / F.height;
        const x = (((f / aspect) * d[0] + (-F.offsetX * 2 / F.width) * d[2]) / w * 0.5 + 0.5) * F.width;
        const y = (0.5 - (f * d[1] + (F.offsetY * 2 / F.height) * d[2]) / w * 0.5) * F.height;
        assert.ok(slow, 'the contract must also place it');
        worst = Math.max(worst, Math.hypot(x - slow[0], y - slow[1]));
      }
    }
  }
  assert.ok(worst < 1e-6, `the composed matrix drifts from projectDirection by ${worst} px`);
  void D2R;
});

test('R187 sky: the brightness curve spans the whole catalogue', () => {
  const src = read('js/space-sky.js');
  /* #R186's curve ran out at V 6.8 because that was the end of BSC; every Hipparcos star fainter
     than that would have been pinned to one floor value and the deep sky would be a flat wash. */
  const m = /const b=Math\.max\(0,Math\.min\(1,\(([0-9.]+)-v\)\/([0-9.]+)\)\);/.exec(src);
  assert.ok(m, 'the magnitude→brightness map must be a single readable expression');
  const zero = +m[1];
  assert.ok(zero >= 9.5, `stars fade out at V ${zero} but the catalogue goes to 9.5`);
  /* and the per-frame cost is bounded by precomputing the unit vectors */
  assert.match(src, /vx:new Float32Array\(n\)/, 'unit vectors are precomputed');
  assert.match(src, /stars\.vx\[i\]=Math\.sin\(a\)\*c/, 'and filled at precession time, not per frame');
});
}

/* ══════════ from tests/r188-checks.test.mjs — 1 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* (#R188) the round's header note is kept with its largest block, in tests/layer-aircraft-checks.test.mjs */

/* ── 3. Cesium: the poles are lit under BOTH basemaps ────────────────────────────────────────── */
test('R188 Cesium: the polar bands are always shown, and wear the map palette', () => {
  const src = read('js/cesium-engine.js');
  /* measured before the change: satellite 88°S = 239.3/255, MAP 88°S = 0.56/255, MAP 88°N = 12.0/255 */
  assert.match(src, /this\._polarBase=\[\];/, 'the polar bands are their own collection');
  assert.match(src, /L\.show=polar\?true:!!this\._wantWorldBase;/,
    'a polar band is shown whatever the basemap is');
  assert.match(src, /_polarTreatment\(\)\{/, '…and switches treatment with it');
  assert.match(src, /const t=sat\?\{b:1,c:1,s:1,g:1\}:\(dark\?\{b:0\.42,c:0\.90,s:0\.35,g:1\}:\{b:1\.22,c:0\.92,s:0\.34,g:0\.9\}\);/,
    'satellite untouched; the map gets the swept treatment (b .42 / c .90) in dark, its own in light');
  /* the light and dark maps are different targets, and the theme changes without the basemap doing so */
  assert.match(src, /attributeFilter:\['data-theme'\]/, 'the treatment must follow the theme');
  /* the ±85.0511° scoping #R187 added is load-bearing (it made tests/r184-cesium-fs fail 3/3) */
  assert.match(src, /const MERC_EDGE=85\.0511287798066;/, 'the bands stay scoped to the caps');
  /* the single-tile bundled picture is a DIFFERENT object and must stay with the satellite view:
     one equirectangular row over a whole cap is the radial smear #R187 replaced. */
  assert.match(src, /Cesium\.SingleTileImageryProvider\.fromUrl\(worldUrl,\{rectangle:rect,tileWidth:2048,tileHeight:1024\}\)\s*\n?\s*\.then\(add\)/,
    'the bundled floor is added without the polar flag, so it still follows the satellite basemap');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 8 · the two engines ─────────────────────────────────────────────────────────────────────── */
test('R190 renderers: the caches that hold what a moving camera touches', () => {
  const ces = read('js/cesium-engine.js');
  assert.match(ces, /this\._globe\.tileCacheSize=_mob\?320:768;/, 'Cesium’s working set');
  /* the knob #R189 measured and withdrew is named only in the note that warns about it */
  assert.equal((ces.match(/preloadSiblings/g) || []).length, 2,
    '⚠ #R189 measured that this one changes the meaning of "the globe is quiet" — it stays out of the code');
  assert.doesNotMatch(ces, /\.preloadSiblings\s*=/, 'never assigned');
});
}

/* ══════════ from tests/r175-checks.test.mjs — 2 of its 16 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* (#R175) the round's header note is kept with its largest block, in tests/layer-boot-graph-checks.test.mjs */

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
/* (#R175) the application body is js/app-body.js now — the camera hook, the tooltip clamp and the
   module instantiations all live there. THAT is what those assertions must read: pointed at
   index.html they would pass vacuously, which is precisely the failure this file exists to prevent. */
/* (#R178) the application body is TWO files now — js/geo-engine.js was carved out of app-body.js
   this round (the renderer adapter + the IntMapGeoEngine facade, moved verbatim). Same program,
   two files, so every invariant below still asks the same question. */
const body = [readFileSync(join(ROOT, 'js/app-body.js'), 'utf8'),
              readFileSync(join(ROOT, 'js/geo-engine.js'), 'utf8'),
              /* (#R322) …and THREE now: the camera geometry moved to js/camera-math.js when the
                 renderer-command census pushed the shell over its line ceiling (tests/r168 #8).
                 Same program, same invariants — the functions are byte-identical to the versions
                 that were in js/geo-engine.js, modulo the indentation of the move.
                 ⚠ THIS JOIN, NOT appShell(): r168 #8 counts the SHELL'S LINES from appShell, and
                 putting 375 lines back into it would undo the move this file is following. */
              readFileSync(join(ROOT, 'js/camera-math.js'), 'utf8')].join('\n');

/* ── ① the camera: zoom must move the eye, at every tilt ─────────────────────────────────────
   #R174 fixed "cannot zoom in past a point" by freezing the solve at the APPLIED zoom. That made a
   pure zoom pass through, but it also froze the look-at target's ALTITUDE — and after any tilt that
   target is up in the sky (6,914 m at pitch 85 from z12 over Tokyo). Since MapLibre's zoom means
   "approach the target", the eye then converged on a point in the air: measured 8,373 → 7,205 m over
   2.3 zoom levels at pitch 85, and 8,373 → 12,955 m (i.e. AWAY from the ground) at pitch 110. */
test('R175 ①: the tilt hook dollies — the target scales with the look distance', () => {
  /* (#R176) SUPERSEDED IN MECHANISM, KEPT IN INTENT — the same shape as the note #R175 left on
     #R174's version of this test. The whole solve moved out of metres-per-degree into MERCATOR units,
     because the tangent plane it stood on is only true while the look distance is small next to the
     Earth (16 km at z12, 8,573 km at z3 — measured drift 22,218 km). In merc units the dolly is free:
     k·d0 IS d1, so "pre-scale the eye by k" and "take the old attitude at the new look distance" are
     the same expression, and a pure zoom is still the identity.
     (#R177) SUPERSEDED AGAIN. Two things changed and both are forced:
       · the geometry is now gEye/gSolve, which speak the renderer's SPHERE model as well as its
         mercator one — `globe` uses both, and the merc expressions named above were wrong by
         thousands of kilometres below z12, where the app spends most of its time;
       · `k` is measured against the PROPOSAL's own previous zoom, not the applied zoom, because the
         sphere branch returns a zoom and `_requestedCameraState` never receives it. Measured on a
         globe z3 drag with the old reference: cur z3 against was z2.967, i.e. every frame of a plain
         tilt read as a 2.3 % dolly, six frames running.
     The claim is #R175's, unchanged: the dolly scales the anchored eye, a pure zoom is the identity,
     and the target is solved at the PROPOSED look distance. */
  assert.match(body, /const zSame=\(!!last&&Math\.abs\(cur\.zoom-last\.zoom\)<1e-9\)\|\|Math\.abs\(cur\.zoom-was\.zoom\)<1e-9;/,
    'a zoom is only real when it differs from BOTH histories — the drag answers in `last`, jumpTo in `was`');
  assert.match(body, /const zRef=zSame\?cur\.zoom:\(\(last&&isFinite\(last\.zoom\)\)\?last\.zoom:was\.zoom\);/,
    'the dolly is measured against whichever history the proposal actually came from');
  assert.match(body, /const k=\(isFinite\(cur\.zoom\)&&isFinite\(zRef\)\)\?Math\.pow\(2,zRef-cur\.zoom\):1;/,
    'the look-distance ratio must be derived from the zoom difference');
  assert.match(body, /function gEye\(cam,c2c,tile,sphere,k\)\{/,
    'the dolly is a parameter of the ONE camera geometry, not a hand-written term');
  assert.match(body, /const anchor=gEye\(was,c2c,tile,sphere,k\);/,
    'the anchored eye is still scaled by k, so a pure zoom is a dolly and a pure tilt is unchanged');
  assert.match(body, /const sol=gLimitPitch\(anchor,cur\.pitch,cur\.bearing,c2c,tile,cur\.zoom,sphere,cur,guard,was\.pitch\);/   /* (#R178) gSolve became gSolveAt (one exact answer + feasibility) wrapped in gLimitPitch (the largest holdable tilt); the anchor and the dolly `k` are unchanged, which is what this asserts */,
    'and the target is solved at the PROPOSED look distance (#R174 froze it at was.zoom)');
  assert.doesNotMatch(body, /d1=c2c\*mpp\(lat,was\.zoom\)/,
    'the #R174 frozen-distance solve must be gone — it is what made the report come back');
});

test('R175 ①: a zoom that also travels still carries the target altitude', () => {
  /* wheel zoom is zoom-around-the-POINTER, so the centre moves and every frame is classified as
     travel; without this branch the frozen-elevation bug survives the fix on the commonest gesture */
  /* (#R177) SUPERSEDED IN MECHANISM, KEPT IN INTENT: the mercator branch still scales the target's
     altitude by k and leaves the centre alone. The SPHERE branch cannot — its pivot is welded to the
     surface, so the target's elevation moves the camera not at all — and it must actively zero the
     number instead of letting a mercator-era one ride along: one did (1,488 km, at pitch 120) and
     the next camera change froze the renderer inside its tile cover. */
  /* (#R179) SUPERSEDED IN MECHANISM AGAIN, KEPT IN INTENT. Two things moved:
       · the sphere branch now also STOPS THE ZOOM when the dolly would drive the eye through the
         crust (gLimitZoom) — measured, the eye reached −0.193 of its altitude at globe z6/pitch 105
         before that. It still zeroes the elevation for #R177's reason.
       · a caller that NAMED a centre is now recognised before any of this (the `_decl` branch), so
         「journey」 no longer has to be inferred from two frames of history. A declared zoom with no
         centre is a DOLLY and deliberately still lands here, which is what this test is about. */
  assert.match(body, /if\(movedFromApplied&&\(movedFromLast\|\|!last\)\)\{[\s\S]*?if\(sphere\)\{[\s\S]*?gLimitZoom\(cur,c2c,tile,was\.zoom\)[\s\S]*?elevation:0[\s\S]*?\}[\s\S]*?if\(!zoomed\) return NOOP\(\);[\s\S]*?let el=was\.elevation\*k;[\s\S]*?return isFinite\(el\)\?\{ elevation:el \}:\{\};/,
    'a travelling frame that also zooms must scale the elevation and leave the centre alone');
  assert.match(body, /if\(_decl&&_decl\.center\)\{/,
    '(#R179) …and a caller that named a CENTRE is a journey by declaration, not by inference');
});
}

/* ══════════ from tests/r184-checks.test.mjs — 2 of its 9 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している）（MSAA の規則は関数を切り出して実行している） */
/* (#R184) the round's header note is kept with its largest block, in tests/layer-space-satellites-checks.test.mjs */

const root = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const rd = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n')
  : readFileSync(new URL(p, root), 'utf8'));

/* ── ③ THE ENGINE CONTRACT GAINED ONE CAPABILITY, DECLARED BY BOTH ADAPTERS ───────────────── */
test('R184 #3: eyeIsPosition is declared by both engines, with opposite values', () => {
  const ge = rd('js/geo-engine.js'), ce = rd('js/cesium-engine.js'), fs = rd('js/flight-sim.js');
  assert.match(ge, /eyeIsPosition:\s*false/, 'MapLibre: the eye is DERIVED from centre+zoom+pitch');
  assert.match(ce, /eyeIsPosition:\s*true/, 'Cesium: the camera IS a position');
  assert.match(ge, /eyeIsPosition:\s*true/, 'the engine file also carries the Cesium contract declaration');
  /* the simulator branches on the capability, not on an engine name — the coupling gate would
     catch the latter, but the point here is that the branch exists at all */
  assert.match(fs, /can\('eyeIsPosition'\)/, 'the flight simulator asks the capability');
  assert.match(fs, /camera\.setEye/, 'and drives a positional camera directly');
  /* the guard that stops the MapLibre fallback undoing it every frame */
  assert.match(fs, /!cam&&!posCam/, 'the last-resort jumpTo does not fire on the positional path');
});

/* ── ④ THE ANTI-ALIASING POLICY IS A FUNCTION, AND IT IS THE ONE THAT WAS MEASURED ────────── */
test('R184 #4: the MSAA rule is one declared function and FXAA is gated on MSAA', () => {
  const ce = rd('js/cesium-engine.js');
  assert.match(ce, /function\s+_msaaFor\s*\(/, 'the rule is a named function, not an inline expression');
  assert.match(ce, /msaaSamples:\([^)]*_msaaFor\(/, 'the widget is constructed from it');
  assert.match(ce, /fx\.enabled=\(o\.antialias!==false\)&&!\(scene\.msaaSamples>1\)/,
    'FXAA runs only when there is no multisampling to do the job — see the measurement in the file');
  /* the measurement itself is recorded next to the code that came out of it */
  assert.match(ce, /sharpness 5\.06/, 'the FXAA sharpness measurement is written down where the change is');
  /* run the rule the way the browser test does, so the two cannot drift */
  const src = ce.match(/function\s+_msaaFor\s*\([^)]*\)\s*\{[^}]*\}/)[0];
  // eslint-disable-next-line no-new-func
  const f = new Function(`${src}; return _msaaFor;`)();
  assert.equal(f(1), 4);
  assert.equal(f(2), 2);
  assert.equal(f(3), 1);
  assert.equal(f(undefined), 4, 'a missing pixel ratio is 1x, not zero samples');
});
}

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している）（境界線のスタイルは js/border-style.js を import して評価している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 7. one border line, three layers ──────────────────────────────────────────────────────────── */
test('R212 ⑦: today’s borders, provinces and historical borders read one style module', () => {
  /* (consolidation) EVALUATED: the style module is imported and its exports are what is checked */
  assert.match(BS.BORDER_COLOR, /^#[0-9a-f]{6}$/, 'the module exports the border colour');
  assert.ok(Array.isArray(BS.BORDER_WIDTH) && BS.BORDER_WIDTH[0] === 'interpolate', 'and the border width as a zoom ramp');
  /* spelling kept below: js/app-body.js and js/time-borders.js build MapLibre layers inside the app
     shell and cannot be evaluated here, so the wiring of the module into them is read as source */
  const app = read('js/app-body.js');
  assert.match(app, /import \{ BORDER_COLOR, ADMIN1_COLOR, BORDER_WIDTH, BORDER_CASING, ADMIN1_WIDTH \} from '\.\/border-style\.js'/);
  assert.match(app, /'line-color':BORDER_COLOR,[^}]*'line-width':BORDER_WIDTH/, 'the national border uses them');
  assert.match(app, /'line-color':ADMIN1_COLOR,[^}]*'line-width':ADMIN1_WIDTH/, 'and so does the province line');
  const tb = read('js/time-borders.js');
  assert.match(tb, /_BS\.color\|\|/, 'the historical border reads the same module');
  assert.match(tb, /_BS\.width\|\|/);
  /* the fallback literals must BE the module's values, or the two disagree the moment one changes */
  assert.ok(tb.includes("_BS.color||'" + BS.BORDER_COLOR + "'"), 'the historical fallback colour is the module’s own');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ═══ ⑤ THE DAY/NIGHT SWITCH REACHES WHATEVER IS DRAWING ═════════════════════════════════════
   「設定から、昼夜を表示するのをオフに…（追記：オフにしてもオフにならない。MapLibre。）」 */
test('R215 ⑤: with the day/night display off, the Sun is not aimed on ANY engine', () => {
  const ts = read('js/theme-sky.js');
  const aim = ts.slice(ts.indexOf('function _aimSun()'), ts.indexOf('function _aimSun()') + 700);
  assert.match(aim, /_nightSideOff\(\)/, 'the switch is read before the Sun is aimed, not after (#R214)');
  /* ══ ⚠⚠⚠ (#R240) «OFF» MEANS «NO TERMINATOR», NOT «NO SUN» — AND THAT DISTINCTION IS THE BUG ════
     This asserted `setSunDirection(null)`, i.e. hand the light back to maplibre's default. Measured
     this round, that default is `{anchor:'viewport',position:[1.15,210,30]}` — a sun fixed at a low
     angle in SCREEN space while the scattering integral marches in PLANET space — and maplibre's
     globe atmosphere takes `u_sun_pos` from `style.light` and from nowhere else. Same camera, same
     build, only the light changed: Congo [71,112,77] → [35,62,13], Atlantic [44,105,134] → [2,51,72].
     So switching the day/night side off switched THE ATMOSPHERE off with it, and on the vector
     basemap `_nightSideOff()` is always true — 「そもそも前作った大気がなくなってる」.
     The requirement this test exists for is unchanged and is still asserted: with the switch off no
     light/dark division may appear. It is met by aiming the sun at the point the camera is looking
     at, which puts the terminator 90° away from the centre of the view at every zoom. */
  assert.doesNotMatch(aim, /setSunDirection\(null\)/,
    'the default light is a sun in the wrong frame — it takes the atmosphere with it (#R240)');
  assert.match(aim, /camera\.getCenter\(\)/, 'off aims the Sun at the sub-camera point instead');
  assert.match(aim, /setSunDirection\(\{lng:c\.lng,lat:c\.lat\}\)/, '…so there is no terminator on screen');
  assert.equal(/_rendererLightsTheGlobe/.test(aim), false,
    'no engine is excused — maplibre-gl’s own atmosphere pass reads style.light for u_sun_pos');
  /* and the sky must stop reporting which side is night, or the terminator is still on screen */
  const elev = ts.slice(ts.indexOf('function _sunElevAtCentre()'), ts.indexOf('function _sunElevAtCentre()') + 200);
  assert.match(elev, /_nightSideOff\(\)/, 'horizon-color and sky-color fall back to their day values');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 1 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/cesium-engine.js・js/theme-sky.js・js/geo-engine.js・js/app-body.js は WebGL の描画エンジンとアプリ本体に閉じていて node では評価できない（js/space-sky.js は vm で実行している） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑫ the atmosphere has air in it ─────────────────────────────────────────────────── */
test('#R216 ⑫ aerial perspective is on near the ground and off above the atmosphere', async () => {
  const s = read('js/theme-sky.js');
  /* ⚠ (#R223) THIS ROUND REMOVED THE GROUND HAZE, AT THE READER'S EXPLICIT INSTRUCTION —
     「衛星画像で地平線付近を白い靄で見えなくするな。クソ機能つけるな。」 (confirmed: on every
     basemap, not only over satellite imagery). #R216's argument was right about the physics and
     wrong about the picture: `fog-ground-blend` is WHERE ALONG THE GROUND the wash starts, so 0.62
     put a pale curtain across the far third of the screen — over the imagery the reader opened.
     What this test now guards is that the removal has ONE owner and cannot creep back per-altitude;
     the rest of #R216's sky (the band above the horizon) is untouched and still asserted below. */
  assert.match(s, /function _aerial\(\)/, 'the single owner of the pair must still exist');
  assert.match(s, /'horizon-fog-blend':fg\.horizon/, 'the sky block reads it rather than writing literals');
  assert.match(s, /'fog-ground-blend':fg\.ground/, 'the sky block reads it rather than writing literals');
  assert.match(s, /function _aerial\(\)\{ return \{ ground:1, horizon:0 \}; \}/,
    'off at every altitude, from one line');
  assert.ok(!/ground:\+\(1-[\d.]+\*f\)/.test(s), 'no altitude ramp may bring the wash back');
});
}
