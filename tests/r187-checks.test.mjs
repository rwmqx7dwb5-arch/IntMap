/* ============================================================================
 *  R187 — source-level checks (no browser)
 * ----------------------------------------------------------------------------
 *  The parts of this round that are decided by a CONSTANT or by a shipped file,
 *  and would otherwise only be caught by looking at the screen.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const bytes = (p) => fs.readFileSync(path.join(process.cwd(), p));

/* ── 1. the aircraft mark is the FIRST one again ─────────────────────────────────────────────── */
test('R187 aircraft: the glyph is the original outline, stroke and size ramp', () => {
  const src = read('js/data-layers.js');
  /* The outline shipped from the first commit through #R164. Checked point by point rather than as
     a blob so a "tidy-up" that nudges a vertex is a failure, not a silent redesign. */
  const m = /_PLANE_ORIG\s*=\s*\[([\s\S]*?)\];/.exec(src);
  assert.ok(m, '_PLANE_ORIG must exist');
  const pts = JSON.parse('[' + m[1].replace(/\s+/g, '') + ']');
  assert.deepEqual(pts, [[0,-19],[2.2,-6],[2.2,-3],[17,5],[17,9],[2.2,4.5],[2.2,12],[6,16],[6,18],[0,15.5],
                         [-6,18],[-6,16],[-2.2,12],[-2.2,4.5],[-17,9],[-17,5],[-2.2,-3],[-2.2,-6]]);
  /* a flat fill and a 1.6 px white line — no drop shadow, no white rim, no dark hairline */
  const fn = /function ensurePlaneIcons\(\)\{[\s\S]*?\n    \}/.exec(src);
  assert.ok(fn, 'ensurePlaneIcons must exist');
  /* (#R246) 「両方とも：より太いアウトライン」 — the width is `PLANE_STROKE` now, a constant the flat
     glyph AND the lifted 3-D body read, so thickening it cannot make the two renderings disagree. */
  assert.match(fn[0], /lineWidth=PLANE_STROKE/, 'the stroke is the one shared constant');
  assert.match(fn[0], /const s=44\b/, 'the original 44-unit artwork');
  assert.ok(!/shadowBlur/.test(fn[0]), 'the #R183 drop shadow is gone');
  assert.ok(!/lineWidth=2\.6/.test(fn[0]), 'the #R183 white rim is gone');
  /* the original size ramp */
  /* (#R192) the ramp is stated once, in _PLANE_SIZE, and BOTH renderings read it — see
     tests/r192-checks.
     ⚠ (#R247) the STOPS are the original ones scaled by 1.25 —「航空機の大きさを少し大きく」. What this
     test is for is that there is ONE table and that its shape (three stops, at z2/z5/z9) is the
     original ramp's; the scale is the reader's to ask about. */
  assert.match(src, /const _PLANE_SIZE=\[\[2,0\.5\],\[5,0\.725\],\[9,0\.975\]\];/,
    'the icon-size ramp — the original stops at 1.25x (#R247)');
  /* …and the flat glyph is what a default profile SEES: #R185 measured that the lifted 3-D body is
     shown instead of it, so restoring the glyph without this changes nothing on screen. */
  /* (#R189) the key is generation-bumped so a '1' stored under the R172–R186 default-TRUE era can
     no longer override the default — see r189-checks for the migration itself */
  assert.match(src, /let planes3D=true;[\s\S]{0,200}getItem\(PLANES3D_KEY\)/,
    '3-D aircraft bodies must default OFF');
});

/* ── 1b. …and the click still finds the aircraft it can now see ──────────────────────────────── */
test('R187 aircraft: the pick follows the rendering that is on', () => {
  const src = read('js/data-layers.js');
  /* Caught by tests/r175 — which is about the DETAIL CARD and not about 3-D at all. `pickPlane`
     opened with `if(!planes3D) return null`, so the moment the flat glyph became the default again,
     clicking an aircraft selected nothing, opened no card and drew no track. A default change is not
     allowed to take a feature with it. */
  assert.ok(!/function pickPlane\(pt\)\{\s*\n?\s*if\(!planes3D/.test(src),
    'pickPlane must not bail out when the flat glyph is the rendering');
  assert.match(src, /function _planeDrawAlt\(d\)\{[\s\S]{0,200}if\(!planes3D\|\|d\.onGround\) return 0;/,
    'the drawn altitude is 0 for the flat glyph and the reported altitude for the 3-D body');
  /* the pick and the "where is it drawn" diagnostic must BOTH go through it — a pick that used a
     different offset would look for the aeroplane somewhere it is not (#R174) */
  const uses = src.match(/_planeDrawAlt\(d\)/g) || [];
  assert.ok(uses.length >= 2, `only ${uses.length} caller(s) of _planeDrawAlt — pick and screenPos must agree`);
});

/* ── 2. the sweep is wider, and still paced at the measured rate ─────────────────────────────── */
test('R187 aircraft: a bigger budget, the same requests per second', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /PLANE_CIRCLE_NM\s*=\s*250\b/, '250 nm is still the API maximum (300 answers 403)');
  assert.match(src, /PLANE_GAP_MS\s*=\s*1200\b/, 'the measured sustainable spacing must NOT move with the budget');
  const b = /PLANE_CIRCLE_BUDGET=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(src);
  assert.ok(b, 'the budget must be a two-branch mobile/desktop constant');
  /* (#R188) raised again, to 128 / 24, together with a triangular covering lattice — the report came
     back a third time. What this test is really guarding is that the budget only ever GROWS and that
     the pace never moves with it, so the numbers are checked as a floor rather than as an equality
     (tests/r188-checks.test.mjs pins the current values). */
  assert.ok(+b[2] >= 48, `desktop budget ${b[2]} must not fall below #R187's 48`);
  assert.ok(+b[1] >= 12, `mobile budget ${b[1]} must not fall below #R187's 12`);
  /* the poll interval has to be able to EXPRESS the full sweep — a clipped ceiling would mean
     polling faster than the pace that was measured to be sustainable */
  const cl = /Math\.max\(20000,Math\.min\((\d+),Math\.round\(n\*(\d+)\)\)\)/.exec(src);
  assert.ok(cl, 'the poll interval must stay a clamped n×rate rule');
  assert.ok(+cl[1] >= +b[2] * +cl[2], `a ${b[2]}-circle sweep needs ${+b[2] * +cl[2]} ms but the ceiling is ${cl[1]} ms`);
});

/* ── 3. POI labels are ranked by what kind of place it is ────────────────────────────────────── */
test('R187 POI: the zoom window is on `class`, not on the tile sequence number', () => {
  const src = read('js/place-labels.js');
  assert.match(src, /const POI_TIER=\['match',\['get','class'\]/, 'the tier must be decided by class');
  /* MEASURED (central Tokyo, z16): the old `rank ≤ 40` window admitted 2,769 of 12,134 POIs, led by
     723 shops and 372 bus stops, and what survived collision was 24 bus stops and 14 shops. The
     landmark classes must be in the FIRST tier and the street furniture must not be. */
  const t1 = /\['hospital','university','college','school','railway',[\s\S]*?\],1,/.exec(src);
  assert.ok(t1, 'tier 1 must exist');
  for (const c of ['hospital', 'university', 'museum', 'park', 'police', 'railway', 'theatre'])
    assert.ok(t1[0].includes(`'${c}'`), `${c} belongs in the first tier`);
  for (const c of ['bus', 'entrance', 'bollard', 'waste_basket'])
    assert.ok(!t1[0].includes(`'${c}'`), `${c} must not be in the first tier`);
  /* the same expression drives collision, so a crowded corner keeps the landmark */
  assert.match(src, /'symbol-sort-key':\['\+',\['\*',POI_TIER,1000\]/, 'the tier must also sort the collision test');
  assert.match(src, /filter:POI_FILTER/, 'the dot and the label must share one filter');
});

/* ── 4. the numbers the user named ───────────────────────────────────────────────────────────── */
test('R187 sea level: the default opacity is 60 %', () => {
  const src = read('js/data-layers.js');
  const m = /sealevel:([0-9.]+)/.exec(src);
  assert.ok(m, 'the sealevel default must be in the opacities table');
  assert.equal(+m[1], 0.60);
});

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

/* ── 5. the widgets ──────────────────────────────────────────────────────────────────────────── */
test('R187 widgets: the AQI / UV tint is flat and translucent, i.e. glass', () => {
  const src = read('js/widgets.js');
  /* The soft shading on these two cards was never OUTSIDE them: it was a 158° gradient that darkened
     the bottom-right corner by 14 %. Flat, so nothing fades into a corner; translucent, so the
     backdrop-filter the card already carries is what the eye sees. */
  assert.ok(!/linear-gradient\(158deg,'\+_shade/.test(src), 'the colour gradient must be gone');
  assert.ok(!/function _shade/.test(src), 'the shading helper has no remaining use');
  const m = /const _TINT_GLASS=([0-9.]+);/.exec(src);
  assert.ok(m, 'the glass-mode tint alpha must be a named constant');
  assert.ok(+m[1] > 0.2 && +m[1] < 0.9, `a tint alpha of ${m[1]} is not translucent`);
  assert.match(src, /card\.style\.setProperty\('background','rgba\(/, 'the tint must be a flat rgba');
  /* ⚠ SUPERSEDED BY #R188, ON PURPOSE. #R187 tied this alpha to the Solid/Frosted-Glass setting
     (#R33/#R153), which meant 1.0 — fully opaque — in the default Solid mode. Measured afterwards:
     every widget card was opaque and the AQI card was a slab of rgb(255,204,0), i.e. the request
     「全ウィジェットはガラス風の質感に」 was not met for ANY of them. The user confirmed in #R188
     that the widgets are glass regardless of the setting, so the alpha is now a constant and
     `_glassOn` is gone. What #R187 established and #R188 keeps — flat, translucent, contrast judged
     on the composite — is asserted above and below. See tests/r188-checks.test.mjs. */
  assert.match(src, /function _tintA\(\)\{ return _TINT_GLASS; \}/,
    'the tint alpha is a constant (#R188) — the appearance setting no longer decides it');
  /* the text colour has to be decided on the COMPOSITED surface, not on the raw category colour */
  assert.match(src, /_TINT_A\*_lum\(col\)\+\(1-_TINT_A\)\*_themeLum\(\)/, 'contrast must be judged on the blend');
});

/* ── 6. the water draws water ────────────────────────────────────────────────────────────────── */
test('R187 water: the traced course is a raster of water, not a polyline', () => {
  const src = read('js/terrain-water.js');
  assert.ok(!/id:'tw-flow'/.test(src), "the cyan guide line must be gone");
  assert.ok(!/id:'tw-flow-case'/.test(src), 'and so must its casing');
  assert.ok(!/properties:\{kind:'flow'\}/.test(src), 'and the feature that fed them');
  /* ⚠⚠⚠ (#R267) #R187'S CLAIM IS «THE COURSE IS WATER, NOT A LINE», AND IT SURVIVES BY BEING MADE
     TRUE OF THE MODEL RATHER THAN OF A SECOND RASTER. There is no `flowImage` and no per-trace
     sampling to pin, because there is no trace: the water beyond the working rectangle is the SAME
     depth field on the SAME lattice, drawn into the SAME image as the water inside it. Asserting the
     old function name here would have made deleting the second raster look like deleting the
     feature — the shape this file has produced for six rounds running. */
  assert.equal((src.match(/paintImg\(IMG_WATER/g) || []).length, 1, 'water is painted in exactly one place');
  assert.ok(!/tw-flowimg'/.test(src.replace(/GONE_FLOW=\[[^\]]*\]/, '')),
    'the second water overlay is gone except from the line that removes it');
  assert.match(src, /const blk=Math\.max\(1,Math\.ceil\(Math\.max\(bNX,bNY\)\/DRAW_MAX_PX\)\);/,
    'one canvas, sized from the lattice it draws');
  /* ⚠ (#R211) TWO OF THESE THREE WERE REVERSED BY A LATER INSTRUCTION, AND THAT IS RECORDED HERE
     RATHER THAN DELETED. #R187 kept the working rectangle and the per-pond markers because they
     were not the guide line that round was told to remove. #R211 was told to remove them by name:
       「水を配置すると謎の点線長方形が出る」   → the dashed rectangle (tw-area)
       「流れの途中の水色ピンを大量に置くのをやめる」 → the light-blue pond pins (kind:'lake')
     Both are now asserted as ABSENCES, which is the stronger claim: they cannot come back by
     accident, and the reason they went is in the file. The end label — the one thing the picture
     cannot carry — still stays. */
  assert.ok(!/id:'tw-area'/.test(src), 'the working rectangle is gone (#R211)');
  assert.ok(!/kind:'lake'\}/.test(src), 'and so are the per-pond pins (#R211) — the ponds are drawn as water');
  assert.match(src, /kind:'end'/, 'the end label stays');
  /* and the retired overlay is still cleaned up, so a style that has it loses it (#R267) */
  assert.match(src, /GONE_FLOW=\['tw-flowimg','tw-flow-src'\]/, 'wipe() must clear the retired overlay too');
  assert.match(src, /function wipe\(\)\{ \[\[LYR_WATER,IMG_WATER\],\[LYR_TERR,IMG_TERR\],GONE_FLOW\]/);
});

/* ── 7. a refused layer add is retried ───────────────────────────────────────────────────────── */
test('R187 default layers: the cables survive a style that is not ready yet', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /window\.IntMapDefaultLayers=\['dl-climate','dl-subcables'\]/, 'both still default on');
  /* REPRODUCED on a cold load: whenStyleReady() hard-resolves after ~6 s (that escape hatch is #R41's
     and is deliberate), MapLibre then refuses addSource with "Style is not done loading", and the old
     code logged it and stopped — one of the two default layers on screen, which is the report. */
  const fn = /function addSubcables\(\)\{[\s\S]*?\n    \}/.exec(src);
  assert.ok(fn, 'addSubcables must exist');
  assert.match(fn[0], /const build=\(tries\)=>/, 'the build step must be retryable');
  assert.match(fn[0], /setTimeout\(\(\)=>build\(tries-1\),750\)/, 'and actually retry');
  assert.match(fn[0], /build\(12\)/, 'with a bounded number of tries');
  assert.match(fn[0], /cb&&cb\.checked/, 'and give up the moment the user unticks the box');
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
  vm.runInContext(read('js/space-sky.js'), ctx);
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

/* ── 10. the flight starts where the user is looking ─────────────────────────────────────────── */
test('R187 flight sim: an airborne "current map view" start uses the real eye', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /if\(state\.loc==='__here'&&state\.mode!=='ground'\)/, 'scoped to the current-view airborne start');
  assert.match(src, /GE\(\)\.camera\.eye\?GE\(\)\.camera\.eye\(\):null/, 'the viewpoint comes from the engine contract');
  assert.match(src, /o\.keepAlt=true/, 'and start() must not overrule it with the +1,500 m clearance');
  /* ⚠ (#R210 → #R212) THE CLAMP CAME BACK ON REQUEST. #R190 clamped to the service ceiling;
     「一定高度以上は強制的に高度を下げさせられるのを辞めて」 removed it in #R210; 「やっぱ元に戻して」
     put it back in #R212. The claim this test is really about is untouched by all three: the start
     altitude comes from the EYE, not from a round number — plus the floor, which is a fact about the
     ground rather than a preference. The ceiling is the airframe's own, not a literal. */
  assert.match(src, /o\.alt=Math\.max\(150,Math\.min\(_ceil,eye\.alt\)\)/, "the start altitude is the eye's own, floored and capped");
  assert.match(src, /const _ac=AIRCRAFT\[state\.ac\][\s\S]{0,90}_ceil=\(_ac&&_ac\.ceil\)/, 'and the cap is that aircraft’s service ceiling');
});
