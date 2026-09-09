/* ============================================================================
 *  IntMap · The wave layer's renderer — window.IntMapWavesGL  (#R577)
 * ----------------------------------------------------------------------------
 *  Draws significant wave height as a colour field with a wave-direction particle animation over it,
 *  reproducing what Windy draws. The reader asked for 「Windyと画素、RGBレベルで完全に同一な
 *  グラフィックに」 and 「アニメーションのグラフィックも同一に」, so every constant below is a
 *  MEASURED value from windy.com's shipped bundle (v51.2.1, read 2026-09-09), not a taste decision.
 *  Where a number is ours rather than theirs it says so.
 *
 *  ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────────────────────
 *  Every other weather layer here goes through the Open-Meteo SDK's tile rasteriser (js/wx-ecmwf.js).
 *  ⚠ THAT PATH CANNOT PRODUCE THIS PICTURE, and the reason is not a setting we forgot:
 *    · MEASURED in the 0.0.19 bundle — the SDK interpolates the grid with 2×2 BILINEAR on every
 *      path (raster, contours, arrows, point read). It exports `hermite`, `derivative` and
 *      `secondDerivative`, but nothing inside the SDK calls them; they are parts, not a policy.
 *      Windy interpolates 4×4 BICUBIC (Catmull-Rom). Bilinear cannot be talked into being bicubic.
 *    · the rasteriser lives inside a Blob-URL Web Worker built from a string in the bundle, so the
 *      interpolator is not reachable from configuration either.
 *    · its colour lookup is a nearest bucket with NO blend between entries; Windy's is a LINEAR
 *      texture fetch into the same 1024-entry ramp.
 *  So the raster is drawn here instead, with Windy's own shader arithmetic. The DATA still comes
 *  through js/wx-ecmwf.js — `load()` hands back the raw grid, which is all this file wants.
 *
 *  ── WHAT IS AND IS NOT 「THE SAME PICTURE」 ───────────────────────────────────────────────────────
 *  ⚠ Be exact about the claim, because three different things get called 「identical」:
 *    · THE COLOUR RAMP is byte-identical. js/waves-palette.js reproduces Windy's live 1024-entry LUT
 *      exactly — 1024/1024 entries, max delta 0, checksum pinned in tests/r558-palette.test.mjs.
 *    · THE ARITHMETIC is the same: the same Catmull-Rom kernel, the same [0,1] clamp at each stage,
 *      the same 0.66 alpha threshold for the coastline, the same particle integrator and constants.
 *    · THE VALUES ARE NOT THE SAME NUMBERS. Windy serves ECMWF WAM through its own 257×257 tiles
 *      capped at zoom 3–4 and upsamples everything above that; we read the model's native 0.25°
 *      grid. Same model family, different sampling, and a different run whenever the runs differ.
 *      A screenshot of this will not diff to zero against a screenshot of Windy, and no
 *      implementation could make it, because Windy's own tiles are not published to us.
 *  ⚠ ONE DELIBERATE DIFFERENCE: over land Windy paints flat grey (its `seaMask` layer, rgb(128,128,
 *  128)). We leave land transparent so IntMap's own basemap shows through — the sea pixels are the
 *  ones being matched, and covering the map with grey to imitate a competitor's chrome would be a
 *  worse map. `opts.landGrey` restores Windy's behaviour for a side-by-side comparison.
 *
 *  ── THE RASTER PASS ──────────────────────────────────────────────────────────────────────────────
 *  A screen-covering quad in Web-Mercator space. Per fragment: unproject to lon/lat, find the grid
 *  cell, take 4×4 taps, and run the separable Catmull-Rom Windy runs:
 *
 *      a = −X₀/2 + 3X₁/2 − 3X₂/2 + X₃/2      c = −X₀/2 + X₂/2
 *      b =  X₀ − 5X₁/2 + 2X₂ − X₃/2          d =  X₁          → clamp(at³+bt²+ct+d, 0, 1)
 *
 *  ⚠ THE CLAMP IS PER STAGE, and it is a clamp to [0,1] of the NORMALISED height, not to the
 *  neighbourhood. Windy's red-channel path additionally clamps the result into the 2×2 min/max to
 *  kill ringing; ⚠ THE BLUE-CHANNEL PATH — which is the one waves use — DOES NOT. The overshoot is
 *  part of the picture: a steep gradient rings, and suppressing it would be a different image.
 *  Heights are normalised by the ramp's own 0–12 m before interpolation, exactly as Windy's tiles
 *  arrive normalised, so the clamp bites at the same places.
 *
 *  The coastline comes from the same 4 taps' validity, bilinear, then `max(sign(w − 0.66), 0)` — a
 *  hard edge at 0.66, not a fade. That single threshold is why Windy's coast looks crisp while a
 *  naive alpha-blend of the same data looks fogged.
 *
 *  ── THE PARTICLE PASS ────────────────────────────────────────────────────────────────────────────
 *  Windy's `waves` preset, MEASURED: multiplier {constant 50, pow 1.3, zoom 2}, glCountMul 1.5,
 *  glSpeedPx 8, glMinSpeedParam 0.5, glMaxSpeedParam 10, glSpeedCurvePowParam 1, glParticleWidth
 *  5.5, glParticleLengthEx 1, glOpacity 1.6, glBlending 0.93. 16 state blocks × 8 frames = a 128
 *  frame life, one block re-randomised every 8 frames. Trail decay is a MULTIPLY of the whole
 *  back buffer by 0.905 per frame, not a translucent quad over it.
 *
 *  ⚠⚠⚠ THE SPEED IS THE WAVE PERIOD IN SECONDS, AND `g` NEVER APPEARS IN IT. Windy's wave tiles
 *  carry a vector in R,G, and THEIR OWN DECODER SAYS WHAT ITS MAGNITUDE IS — read out of the live
 *  bundle on 2026-09-10, verbatim:
 *      W.utils.wave2obj = ([e,t,n]) => ({ period: hypot(e,t), dir: …(e,t,10), size: n })
 *  so the LENGTH of the R,G vector IS the wave period in seconds, its bearing is the direction, and
 *  B is the significant height. Not inferred from the picture: it is the name Windy's own function
 *  gives the quantity. MEASURED by decoding six live `waves-surface.png` tiles from ims.windy.com
 *  (283,490 sea pixels, 2026-09-10): hypot(R,G) runs p5 3.84 / p25 7.70 / p50 9.37 / p75 11.18 /
 *  p95 14.27, max 22.58 — that is a period distribution in seconds, not a velocity in m/s — while
 *  B runs p5 0.26 / p50 2.17 / p95 6.53 with a declared per-tile range of 0.023…3.34 m, i.e. a wave
 *  height. ⚠ THEREFORE `glMaxSpeedParam = 10` READS AS 「ten SECONDS is full speed」, and the
 *  normalised speed the shader is fed is, with glSpeedCurvePowParam = 1 (linear),
 *      clamp(T / glMaxSpeedParam, glMinSpeedParam/glMaxSpeedParam = 0.05, 1)
 *  ⚠ TWO PHYSICAL VELOCITIES WERE TRIED HERE BEFORE THIS AND BOTH WERE WRONG. Until #R577 this file
 *  used the phase speed c = gT/2π ≈ 1.56·T m/s; #R577 replaced it with the deep-water GROUP speed
 *  cg = gT/4π ≈ 0.78·T because the phase speed pinned 84.9% of the ocean against the ceiling. Both
 *  arguments were about physics, and the ceiling is not about physics: it is ten of whatever units
 *  the field is in, and those units are seconds. ⚠ IF THE PRESENT LAW LOOKS PHYSICALLY WRONG, IT IS:
 *  a period is not a speed. The reader asked for 「全部 Windy と同じ挙動に」 and Windy animates the
 *  period, so putting a velocity back here is a PRODUCT decision to stop matching Windy, not a bug
 *  fix — make it deliberately or not at all (#R622).
 *  MEASURED on our own field with the same statistic (ecmwf_wam025, run 2026-09-09 12Z, 665,628 sea
 *  nodes carrying a period): p5 4.50 / p25 7.05 / p50 8.60 / p75 10.25 / p95 13.60 s, mean 8.85,
 *  min 1.25, max 25.0 — and 28.5% of it at or over the 10 s ceiling, against the 38.7% measured in
 *  Windy's own tiles. (The two are different samples: ours is every sea node on the globe, theirs is
 *  six tiles, so the ceiling shares are of the same order rather than the same number.)
 *
 *  ⚠ THE SPEED ARITHMETIC IS THEIRS, READ OUT OF `plugins/gl-particles.js` (v51.2.1, 2026-09-09):
 *      frameTime = min(now − last, 0.1) s          ← the 0.1 clamp is Windy's, not a guess of ours
 *      timeScale = glVelocity · glSpeedPx · zoom2speed[tileZoom] · ratioScale,  ratioScale = the
 *                  map's pixel ratio, glVelocity = 1 for `waves`
 *      o = frameTime · timeScale / canvas.width     ← canvas.width is DEVICE pixels
 *  so a full-speed particle covers `timeScale` DEVICE pixels per second: at MapLibre z3 — where
 *  `tileZoom` is 4, see `windyZoom` — that is 8 × 0.7 × dpr = 5.6 px/s at dpr 1 and 11.2 at dpr 2.
 *  ⚠ A px/s figure measured off a Windy screencast on a hidpi screen is therefore already doubled by
 *  `ratioScale`, and is not evidence of a faster integrator — that is what the「Windy is 11 px/s」
 *  reading was.
 *
 *  ── THE GLOBE ────────────────────────────────────────────────────────────────────────────────────
 *  ⚠ WINDY REFUSES THIS PICTURE AND WE DO NOT. Their overlays carry a `globeNotSupported` flag and
 *  the wave animation is one of the overlays that sets it. IntMap's DEFAULT projection is the globe,
 *  so「the flat one is the real one」is not a position this layer can take: a wave layer that only
 *  drew on mercator would be blank in the view the reader opens.
 *    · THE RASTER is projected by MapLibre's own `projectTile` out of `shaderData.vertexShaderPrelude`
 *      — the same function its built-in layers use — so the sphere, the plane, and the animated
 *      transition between them are all one code path (see RASTER_VS). On mercator that prelude is
 *      literally `u_projection_matrix * vec4(p,0,1)`, i.e. the multiply this file did by hand, so
 *      THE FLAT PICTURE IS UNCHANGED — verified pixel by pixel (#R577): 0 differing pixels at z1,
 *      z3 and z5 outside the harness's own HUD, where two runs of the SAME build differ anyway
 *      because the HUD prints load times in milliseconds.
 *    · THE PARTICLES need the inverse: a screen position has to become a lon/lat before the field
 *      can be read. On the sphere that is a ray/sphere intersection through the inverse of the same
 *      matrix, and a bearing becomes a screen direction through that matrix's Jacobian. Both are
 *      exact — no lookup table, no epsilon (see UPDATE_FS). MEASURED against MapLibre's own
 *      `project()` over 156–2,282 live particles at z0.5, z1 and z3: median 2.4–3.0°, 97–99% within
 *      10°, and the residual is the measurement's own path averaging (the same probe reads 0.02° on
 *      the flat branch, where the direction does not vary along the path).
 *
 *  ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────────────────────────
 *  It does not fetch, and it does not know which model is on. It is handed grids and a viewport.
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ══ WINDY'S `waves` PARTICLE PRESET ══════════════════════════════════════════════════════════
     MEASURED from the shipped bundle. Names are Windy's so the table can be diffed against theirs.
     ⚠ Do not "tidy" these into rounder numbers: each one is visible in the animation. */
  /* ⚠ RE-READ OUT OF THE LIVE BUNDLE ON 2026-09-10 (`/v/51.2.1.ind.3f7b/plugins/gl-particles.js`,
     the `waves` entry of its preset table): every value below still agrees, and two things that are
     NOT here were checked at the same time and deliberately left out —
       · `lineWidth`: the width is `max(1, getLineWidth(zoom) · glParticleWidth · ratioScale)`, and
         for wind that table runs 0.6 → 3 with zoom. THE `waves` PRESET OVERRIDES IT WITH ALL 1s,
         so for this layer the zoom term is identically 1 and `glParticleWidth · dpr` IS their width.
       · the 1.15× blending boost and the ×0.5 particle count are inside `platform !== 'desktop'`. */
  var W = {
    multiplierConstant: 50,
    multiplierPow: 1.3,
    multiplierZoom: 2,
    glCountMul: 1.5,
    glSpeedPx: 8,
    glMinSpeedParam: 0.5,
    glMaxSpeedParam: 10,
    glParticleWidth: 5.5,
    glParticleLengthEx: 1,
    glOpacity: 1.6,
    glBlending: 0.93,
    /* index is the integer zoom; Windy slows the animation down at world scale so the ocean does not
       look like it is boiling. Length 25, flat 1 from z7 up. */
    zoom2speed: [.5, .5, .5, .6, .7, .8, .9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    /* the alpha envelope over a particle's 128-frame life: (rise 0.7, pow 1.2, fall 0.3, pow 1.4).
       Waves rise over 90 of the 128 frames — much slower than wind's 26 — which is what makes the
       swell lines appear to swell rather than blink. */
    alphaRise: 0.7, alphaRisePow: 1.2, alphaFall: 0.3, alphaFallPow: 1.4,
    blocks: 16,
    blockFrames: 8,
    stateW: 256,
    stateH: 16,
    maxParticles: 15000
  };
  var LIFE_FRAMES = W.blocks * W.blockFrames;   /* 128 */

  /* ══ ⚠⚠⚠ WINDY'S ZOOM IS NOT MAPLIBRE'S ZOOM, AND BOTH THE COUNT AND THE SPEED ARE INDEXED BY IT ═
     Every zoom-indexed number in the preset above — `multiplier` and `zoom2speed` — is looked up in
     the bundle by `this.tileParams.zoom`, which is `SwitchableTileCache.lastZoom`, which is
     `Math.round(map.getZoom())` of WINDY'S OWN map facade. That facade counts in 256-px tiles while
     MapLibre counts in 512-px ones, so it is MapLibre's zoom PLUS ONE.
     ⚠ MEASURED IN THE LIVE APP, not inferred (2026-09-10, headless Chromium on
     `https://www.windy.com/?waves,40,-40,3`): `W.map.map.getZoom()` = 3 while
     `W.map.map.maplibreMap.getZoom()` = 2 for the same view. Their own code says the same thing in
     the other direction — `plugins/gl-particles.js` writes `maplibreMap.getZoom() + 1` wherever it
     needs the facade's number, and `index.js` computes the world size as `256 * 2**(getZoom()+1)`.
     What it costs to get wrong, at the view IntMap opens the layer at (MapLibre z3):
       · the count divisor is `50 · 1.3^(z − 2)`, so one zoom step is a factor of 1.3 — reading it
         at z instead of z+1 draws 1.30× TOO MANY PARTICLES at every zoom under the 15,000 cap.
       · `zoom2speed` reads 0.6 where Windy reads 0.7, i.e. the animation runs at 0.86× their rate.
     Both were live until #R622; the count is half of why the sea looked grainier than Windy's.
     (#R577 recorded the +1 as a SUSPICION about `zoom2speed` and left it out for want of proof.
     The measurement above is the proof, and it applies to the count as well.) */
  /* ══ ⚠⚠⚠ THE NORMALISED PARTICLE SPEED IS THE WAVE PERIOD, IN SECONDS, OVER `glMaxSpeedParam` ══
     THE EVIDENCE IS WINDY'S OWN DECODER, not a reading of their animation. `W.utils.wave2obj`, read
     out of the live bundle on 2026-09-10, is
         ([e,t,n]) => ({ period: hypot(e,t), dir: …(e,t,10), size: n })
     — the R,G vector their particle shader is steered by has the WAVE PERIOD for its magnitude and
     the direction for its bearing, and B is the significant height. MEASURED over 283,490 sea pixels
     of six live `waves-surface.png` tiles: hypot(R,G) p5 3.84 / p25 7.70 / p50 9.37 / p75 11.18 /
     p95 14.27, max 22.58, which is seconds; B p5 0.26 / p50 2.17 / p95 6.53 with a per-tile declared
     range of 0.023…3.34 m, which is metres of swell. So `glMaxSpeedParam = 10` is TEN SECONDS,
     `glMinSpeedParam = 0.5` is half a second, `glSpeedCurvePowParam = 1` makes the map linear, and
     full speed is a ten-second period.
     ⚠ 38.7% of those sea pixels (109,593 of 283,490) sit at or over the ceiling, so Windy's own
     picture spends better than a third of the ocean saturated. That is not a defect to be designed
     away here: it is what their animation looks like, and their animation is what was asked for.
     ⚠ DO NOT PUT A VELOCITY BACK. This file used the phase speed c = gT/2π ≈ 1.56·T until #R577 and
     the deep-water GROUP speed cg = gT/4π ≈ 0.78·T until #R622; both were reasoned from physics, and
     physics is not what the ceiling is denominated in — it is ten of whatever units the field is in,
     and those units are seconds. A period is not a speed, so this function is deliberately not a
     dispersion relation: changing it is a decision to stop matching Windy, not a bug fix (#R622). */
  /* ══ ⚠⚠ WINDY DRAWS HALF AS MANY PARTICLES, AND LETS THEM LINGER LONGER, OFF THE DESKTOP ════
     Two lines of theirs sit inside `platform !== 'desktop'` (read out of `plugins/gl-particles.js`,
     v51.2.1, 2026-09-10): the particle count is halved, and `glBlending` is multiplied by 1.15 —
     1.15 for `waves` where every other overlay gets 1.06, so a wave line survives noticeably longer
     when there are half as many of them. Both are in force here from #R622.
     ⚠ THE DEVICE QUESTION IS NOT ASKED AGAIN HERE. `window._imPhoneClass` is the answer js/app-body.js
     publishes for exactly this case — modules that hold no HOST — and #R232/#R498 are about why it is
     the DEVICE and not the viewport width (a phone turned sideways is 844 px wide and is still a
     phone GPU). Writing another media query here would be a second copy of that judgement.
     ⚠ IT IS NARROWER THAN WINDY'S. Theirs is 「not desktop」, which includes tablets; this repo's is
     「phone-class」. A tablet therefore gets the desktop count here and the mobile count there. That
     is deliberate: the halving is a GPU budget, and this repo already decides GPU budgets that way.
     In a page that has no such answer — the harness, node — the desktop numbers stand. */
  function phoneClass() {
    try { return typeof root._imPhoneClass === 'function' ? !!root._imPhoneClass() : false; }
    catch (e) { return false; }
  }


  function speedParam(periodSeconds) {
    var T = periodSeconds;
    if (!(T === T) || !isFinite(T) || T <= 0) return 0;   /* no period: the shader's own floor takes over */
    return Math.min(W.glMaxSpeedParam, Math.max(W.glMinSpeedParam, T)) / W.glMaxSpeedParam;
  }


  function windyZoom(mapZoom) {
    return Math.max(0, Math.min(24, Math.round(mapZoom) + 1));
  }

  /* ── the raster program ─────────────────────────────────────────────────────────────────────── */

  /* ══ ⚠⚠⚠ THE RASTER IS PROJECTED BY MAPLIBRE'S OWN PRELUDE, NOT BY A MATRIX OF OURS ═══════════
     IntMap's default projection is the GLOBE, and a layer that multiplies by one matrix can only
     draw a plane. MapLibre 5 hands every custom layer `args.shaderData.vertexShaderPrelude` — the
     same source its built-in layers are compiled with — and `projectTile(vec2 posInTile)` inside it
     is the one function that is correct in BOTH regimes AND during the animated transition between
     them. MEASURED (maplibre-gl 5.24.0, both variants read out of a running map):
       · mercator: `vec4 projectTile(vec2 p){ return u_projection_matrix * vec4(p,0.0,1.0); }`
         — literally the multiply this file used to do by hand with `defaultProjectionData.mainMatrix`,
         so THE FLAT PICTURE CANNOT CHANGE: same matrix, same operand, same operation.
       · globe: the point is put on the sphere (`projectToSphere`) and the horizon is handled by
         writing a clip-space z that leaves the [−1,1] volume behind the limb, so the far side is
         culled by the GPU with no depth buffer and no work here.
     ⚠ THE PRELUDE IS GLSL ES 1.00-COMPATIBLE and this program stays at ES 1.00 on purpose: the
     other four programs are, and mixing versions inside one file buys nothing. (js/orbit-points.js
     prepends `#version 300 es` because ITS OWN shader needs `in`/`out`, not because the prelude does.)
     ⚠ `uMatrix` is gone as a name — `u_projection_matrix` is the prelude's, and declaring a second
     one would shadow it. */
  var RASTER_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vMerc;',
    'void main(){ vMerc = aPos; gl_Position = projectTile(aPos); }'
  ].join('\n');

  /* the prelude to compile against when the host is not MapLibre 5 (a bare context in a test, an
     older generation that passed a matrix). Flat only — there is no sphere to be had without one. */
  var FALLBACK_PRELUDE = [
    'uniform mat4 u_projection_matrix;',
    'vec4 projectTile(vec2 p){ return u_projection_matrix * vec4(p, 0.0, 1.0); }'
  ].join('\n');

  /* ⚠ `uGrid` is (nx, ny, 1/nx, 1/ny); `uGeo` is (lonMin, latMin, 1/dx, 1/dy).
     `uData` holds the normalised height in R and the validity in G — two 8-bit channels rather than
     one float, so the layer works on a WebGL1 context. 8 bits over 0–12 m is 0.047 m, finer than the
     0.08 m Windy's own per-tile byte gives at a typical tile range, so the quantisation is not the
     thing that limits the match. */
  var RASTER_FS = [
    'precision highp float;',
    'varying vec2 vMerc;',
    'uniform sampler2D uData;',
    'uniform sampler2D uLut;',
    'uniform vec4 uGrid;',
    'uniform vec4 uGeo;',
    'uniform float uOpacity;',
    'uniform float uLandGrey;',
    '',
    /* Windy's cubicHermite, transcribed. The clamp to [0,1] at every stage is theirs. */
    'float ch(vec4 X, float t){',
    '  float a = -X.x*0.5 + 3.0*X.y*0.5 - 3.0*X.z*0.5 + X.w*0.5;',
    '  float b =  X.x - 5.0*X.y*0.5 + 2.0*X.z - X.w*0.5;',
    '  float c = -X.x*0.5 + X.z*0.5;',
    '  float d =  X.y;',
    '  float tt = t*t;',
    '  return clamp(a*tt*t + b*tt + c*t + d, 0.0, 1.0);',
    '}',
    'vec4 chv(vec4 A, vec4 B, vec4 C, vec4 D, float t){',
    '  vec4 a = -A*0.5 + 3.0*B*0.5 - 3.0*C*0.5 + D*0.5;',
    '  vec4 b =  A - 5.0*B*0.5 + 2.0*C - D*0.5;',
    '  vec4 c = -A*0.5 + C*0.5;',
    '  vec4 d =  B;',
    '  float tt = t*t;',
    '  return clamp(a*tt*t + b*tt + c*t + d, vec4(0.0), vec4(1.0));',
    '}',
    /* one texel of the data grid, wrapping in longitude and clamping in latitude */
    'vec2 tap(float gx, float gy){',
    '  float x = mod(gx + uGrid.x, uGrid.x);',
    '  float y = clamp(gy, 0.0, uGrid.y - 1.0);',
    '  return texture2D(uData, vec2((x + 0.5) * uGrid.z, (y + 0.5) * uGrid.w)).rg;',
    '}',
    '',
    'void main(){',
    '  float lon = vMerc.x * 360.0 - 180.0;',
    '  float ty  = 3.14159265358979 * (1.0 - 2.0 * vMerc.y);',
    '  float lat = degrees(atan(0.5 * (exp(ty) - exp(-ty))));',
    '  if (lat > 89.9 || lat < -89.9) discard;',
    /* ══ ⚠⚠⚠ NO HALF-TEXEL HERE. THE HALF-TEXEL IS `tap`'S, AND IT WAS BEING PAID TWICE ═══════════
       `(lon − lonMin)/dx` IS the fractional grid index already: node j sits at lon = lonMin + j·dx.
       `tap()` then adds the +0.5 that turns an index into a texel centre. Subtracting another 0.5
       here moved the entire field half a grid cell — MEASURED (#R577) by lighting ONE node and
       finding the lobe: at z7 over 45N the picture sat **+22.3 px east and −32.8 px north** of
       where MapLibre projects that node, against a predicted half cell of 22.76 px (0.125° of
       longitude) and 32.18 px (0.125° of latitude ÷ cos 45°). About 19 km diagonally — invisible at
       z3, where it is under a pixel, and invisible against a coastline at any zoom because the
       model's own land mask is 0.25° blocky. */
    '  float gx = (lon - uGeo.x) * uGeo.z;',
    '  float gy = (lat - uGeo.y) * uGeo.w;',
    '  float ix = floor(gx), iy = floor(gy);',
    '  vec2 f = vec2(gx - ix, gy - iy);',
    '',
    /* 4×4 taps: rows iy-1..iy+2, columns ix-1..ix+2 */
    '  vec4 hRow[4]; vec4 vRow[4];',
    '  for (int r = 0; r < 4; r++){',
    '    float yy = iy + float(r) - 1.0;',
    '    vec2 s0 = tap(ix - 1.0, yy), s1 = tap(ix, yy), s2 = tap(ix + 1.0, yy), s3 = tap(ix + 2.0, yy);',
    '    hRow[r] = vec4(s0.r, s1.r, s2.r, s3.r);',
    '    vRow[r] = vec4(s0.g, s1.g, s2.g, s3.g);',
    '  }',
    /* separable: down the columns first, then across — the order Windy uses */
    '  vec4 col = chv(hRow[0], hRow[1], hRow[2], hRow[3], f.y);',
    '  float h = ch(col, f.x);',
    '',
    /* the coastline: bilinear over the 2×2 validity, hard threshold at 0.66 */
    '  float v11 = vRow[1].y, v12 = vRow[1].z, v21 = vRow[2].y, v22 = vRow[2].z;',
    '  vec4 w4 = vec4((1.0-f.x)*(1.0-f.y), f.x*(1.0-f.y), (1.0-f.x)*f.y, f.x*f.y);',
    '  float sea = max(sign(dot(vec4(v11, v12, v21, v22), w4) - 0.66), 0.0);',
    '  if (sea < 0.5 && uLandGrey < 0.5) discard;',
    '',
    '  vec3 col3 = texture2D(uLut, vec2(h, 0.5)).rgb;',
    '  vec3 outc = mix(vec3(0.5), col3, sea);',
    '  gl_FragColor = vec4(outc * uOpacity, uOpacity);',
    '}'
  ].join('\n');

  /* ── the particle programs (Windy's, transcribed) ───────────────────────────────────────────── */

  var QUAD_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  /* Position is a 16-bit fixed point split across BA (high) and RG (low), exactly as Windy stores
     it: `pos = ba + rg/255.5`. Keeping their encoding keeps their motion, including the way a
     particle that has nowhere to go is written as all-zero and skipped by the draw. */
  var UPDATE_FS = [
    'precision highp float;',
    'uniform sampler2D uState;',
    'uniform sampler2D uData;',
    'uniform vec4 uGrid;',
    'uniform vec4 uGeo;',
    'uniform vec4 uView;',      /* west, south, east, north of the visible map, degrees */
    'uniform vec2 uStep;',      /* THIS frame's displacement scale in normalised screen units */
    'uniform vec2 uRate;',      /* the same thing PER SECOND — see the note over the TRESH test */
    'uniform float uGlobe;',    /* 1 while the map really is a sphere — see the block below */
    'uniform mat4 uProj;',      /* globe only: unit sphere → clip */
    'uniform mat4 uProjInv;',   /* globe only: its inverse, computed on the CPU once a frame */
    'uniform float uAspect;',   /* height/width of the drawing buffer — see the note by `dir` */
    'varying vec2 vUv;',
    'const float TRESH = 0.025;',
    '',
    /* ⚠⚠⚠ `.rgba`, AND THE `a` IS THE WHOLE POINT — see the note over `spd` below. */
    'vec4 sample4(float gx, float gy){',
    '  float x = mod(gx + uGrid.x, uGrid.x);',
    '  float y = clamp(gy, 0.0, uGrid.y - 1.0);',
    '  return texture2D(uData, vec2((x + 0.5) * uGrid.z, (y + 0.5) * uGrid.w));',
    '}',
    '',
    /* ══ THE GLOBE: A SCREEN POINT IS A RAY, AND A PARTICLE IS WHERE IT MEETS THE SPHERE ═════════
       On a plane the inverse projection is two `mix`es. On the sphere there is no analytic inverse
       of a matrix product, so the honest one is the geometric one: unproject the near and far clip
       points of this screen position, intersect the ray with the unit sphere MapLibre's globe
       actually is (`projectToSphere` in its own prelude returns a unit vector, so the sphere in
       `mainMatrix`'s space has radius 1), and take the NEAR root — the far root is the hemisphere
       behind the planet, which no reader can see. A ray that misses returns false and the particle
       is killed, which is what empties the sky around the limb.
       ⚠ NOTHING HERE IS APPROXIMATED. No lookup table, no small-angle expansion, no per-frame CPU
       unprojection of a grid: the same matrix MapLibre projects with, inverted. */
    'bool screenToSphere(vec2 sp, out vec3 sph){',
    '  vec2 ndc = vec2(sp.x * 2.0 - 1.0, 1.0 - sp.y * 2.0);',
    '  vec4 pn = uProjInv * vec4(ndc, -1.0, 1.0);',
    '  vec4 pf = uProjInv * vec4(ndc,  1.0, 1.0);',
    '  vec3 o = pn.xyz / pn.w;',
    '  vec3 d = normalize(pf.xyz / pf.w - o);',
    '  float b = dot(o, d), c = dot(o, o) - 1.0;',
    '  float disc = b * b - c;',
    '  if (disc < 0.0) return false;',
    '  float t = -b - sqrt(disc);',
    '  if (t < 0.0) t = -b + sqrt(disc);',
    '  if (t < 0.0) return false;',
    '  sph = o + d * t;',
    '  return true;',
    '}',
    /* ══ A BEARING BECOMES A SCREEN DIRECTION THROUGH THE JACOBIAN, NOT THROUGH A SMALL STEP ══════
       The first version of this walked the particle a fixed 0.02° of arc along its great circle and
       subtracted the two screen positions. It is the obvious method and it is NOT ACCURATE ENOUGH:
       MEASURED (#R577, globe at z1, 223 particles compared against MapLibre's own `project()` of
       the same bearing) the median error was 18.8° and the 90th percentile 57.9°, because at world
       scale 0.02° of arc is 0.03 SCREEN PIXELS and subtracting two float32 screen positions that
       agree to five digits leaves noise, not a direction.
       So the tangent is carried through the projection instead of a difference of two points. For
       a matrix M and a point p on the sphere, the screen position is (M·p̃).xy / (M·p̃).w, and the
       derivative along a tangent t is ((M·t̃).xy·w − (M·p̃).xy·(M·t̃).w) / w² with t̃ = (t, 0) — the
       quotient rule, one multiply, no cancellation and no epsilon to choose. The positive factor
       1/w² is dropped because only the direction is wanted.
       The tangent itself is the unit vector at that point: east = ∂p/∂λ ∝ (p.z, 0, −p.x) (read off
       MapLibre's own parameterisation, not assumed), north = p × east, and the bearing mixes them.
       ⚠ y IS NEGATED because clip y points up and this file's screen y points down, and the aspect
       ratio is applied because `dir` has to be a unit vector in PIXELS — see `uStep`. */
    'vec2 bearingToScreen(vec3 p, float ang){',
    '  vec3 east = normalize(vec3(p.z, 0.0, -p.x));',
    '  vec3 north = normalize(cross(p, east));',
    '  vec3 t = north * cos(ang) + east * sin(ang);',
    '  vec4 c = uProj * vec4(p, 1.0);',
    '  vec4 ct = uProj * vec4(t, 0.0);',
    '  return vec2(ct.x * c.w - c.x * ct.w, -(ct.y * c.w - c.y * ct.w) * uAspect);',
    '}',
    '',
    'void main(){',
    '  vec4 tex = texture2D(uState, vUv);',
    '  vec2 pos = tex.ba + tex.rg / 255.5;',
    '  vec2 sp = fract(pos);',
    '  float lon, lat;',
    '  vec3 sph = vec3(0.0);',
    '  if (uGlobe > 0.5) {',
    '    if (!screenToSphere(sp, sph)) { gl_FragColor = vec4(0.0); return; }',   /* off the planet */
    '    lon = degrees(atan(sph.x, sph.z));',
    '    lat = degrees(asin(clamp(sph.y, -1.0, 1.0)));',
    '  } else {',
    /* screen position → lon/lat. The particles live in the visible rectangle, so the mapping is the
       linear one across the current view in Mercator-y, matching where the raster put the colours.
       ⚠ `pos.y` = 0 is the NORTH edge, i.e. the top of the screen; DRAW_VS reconciles that with
       clip space, and the globe branch above uses the same y-down convention. */
    '    lon = mix(uView.x, uView.z, sp.x);',
    '    float myS = log(tan(radians(45.0 + clamp(uView.y, -85.0, 85.0) * 0.5)));',
    '    float myN = log(tan(radians(45.0 + clamp(uView.w, -85.0, 85.0) * 0.5)));',
    '    lat = degrees(2.0 * atan(exp(mix(myN, myS, sp.y))) - 1.5707963267948966);',
    '  }',
    /* the same correction as the raster pass, and here it also makes `floor(x + 0.5)` mean what it
       reads as: the NEAREST node. With the extra −0.5 it was a plain floor, so every particle was
       steered by the node down-left of it rather than the one it is standing on. */
    '  float gx = (lon - uGeo.x) * uGeo.z;',
    '  float gy = (lat - uGeo.y) * uGeo.w;',
    '  vec4 s = sample4(floor(gx + 0.5), floor(gy + 0.5));',
    '  if (s.g < 0.5) { gl_FragColor = vec4(0.0); return; }',   /* land: kill */
    /* ══ ⚠⚠⚠ THE SPEED IS IN `A`. IT WAS BEING READ OUT OF `R`, WHICH IS THE WAVE HEIGHT ═══════════
       `setData` packs R = height/12, G = validity, B = direction, A = speed/glMaxSpeedParam — and
       this line sampled `.rgb` and took `s.r`. The particles were therefore steered at a speed
       proportional to the SIGNIFICANT WAVE HEIGHT, in units of "twelve metres = full speed".
       MEASURED (#R577, headless Chromium/SwiftShader, z3 over the North Atlantic, uniform synthetic
       direction so every particle drifts the same way): 0.9 px/s against the 4.8 px/s this file's
       constants predicted AT THE TIME (5.6 since #R622 corrected the zoom index) — the
       factor being exactly the mean of height/12 over the visible ocean. It also explains the deaths: `TRESH` kills a particle whose step is under 0.025
       thousandths of a screen, which at this scale is everything under about 1.1 m of swell, so
       calm water went blank. Two symptoms, one wrong channel letter. */
    '  float spd = max(s.a, ' + (W.glMinSpeedParam / W.glMaxSpeedParam).toFixed(6) + ');',
    /* ══ ⚠⚠⚠ THE PARTICLES GO THE OTHER WAY — `wave_direction` IS THE DIRECTION WAVES COME FROM ═══
       `+ PI` is not a taste correction. `wave_direction` is stated in the meteorological convention
       (the bearing the waves arrive FROM, as wind direction is), so what a reader watching swell
       leave a storm expects to see is `direction + 180°`. MEASURED against windy.com on 2026-09-09
       (ECMWF WAM, the same model): forty frames of a CDP screencast at each of four points, static
       background removed by the temporal median, motion recovered by phase correlation —

           point        wave_direction   direction+180   Windy's particles measured
           45N  40W          223°             43°                  65°
           37N  47W          249°             69°                  82°
           25N  40W           78°            258°                 252°     ← the opposite quadrant
           51N  35W          145°            325°                  52°     ← 21 h apart, storm area

       The 25N row is the one that settles it: its propagation is WSW where the other two are NE, and
       Windy turns with it. Three of the four agree with `+180` to within 23°, and none agrees with
       the raw direction. This renderer was measured the same way with a uniform synthetic field:
       at `wave_direction = 90°` it drifted EAST (+1 px at step 8, +8 px at step 16 of a 1-D shift
       scan), i.e. towards the bearing the waves come FROM. Hence the half turn. */
    '  float ang = s.b * 6.283185307179586 + 3.14159265358979;',
    /* ══ ON THE SPHERE A BEARING IS NOT A FIXED SCREEN DIRECTION ══════════════════════════════════
       On the plane, north is up everywhere and `(sin, −cos)` is the whole story. On the globe the
       meridians converge, the sphere is turned by the map's bearing and tilted by its pitch, so the
       screen direction of「due north」is different in every part of the picture and cannot be a
       constant. It is not estimated here either: the particle's own position is walked one arc
       minute along the great circle of its bearing — the standard destination formula, no small
       angle assumption — and BOTH points are put through the same `uProj` the geometry is drawn
       with. The difference of the two screen positions IS the direction, exactly, including the
       convergence, the bearing and the pitch.
       ⚠ 0.02° of arc ≈ 2.2 km: small enough that the field is the same at both ends (the grid is
       0.25°, twelve times coarser), large enough that the subtraction of two screen positions does
       not land in float noise at any zoom this layer is drawn at. A destination that comes out
       BEHIND the camera (w ≤ 0) is on the far side of the limb, and the particle is killed rather
       than sent off in the direction a divide by a negative w would invent. */
    '  vec2 dir;',
    '  if (uGlobe > 0.5) {',
    '    vec2 dv = bearingToScreen(sph, ang);',
    /* the poles are the one place where「east」has no direction, and a particle exactly on the axis
       has no bearing to draw; it is killed rather than sent somewhere arbitrary. */
    '    if (dot(dv, dv) <= 0.0 || abs(sph.y) > 0.999999) { gl_FragColor = vec4(0.0); return; }',
    '    dir = normalize(dv);',
    '  } else {',
    '    dir = vec2(sin(ang), -cos(ang));',
    '  }',
    '  vec2 dpos = dir * spd * uStep;',
    /* ══ ⚠⚠⚠ THE "IS IT GOING ANYWHERE" TEST IS ASKED PER SECOND, NOT PER FRAME ═════════
       Windy asks it of the per-frame step because their step is a fixed frame; ours is `dt` and dt
       is whatever the machine gives. Asking a FIXED threshold of a step that shrinks with the frame
       time makes the threshold a FRAME-RATE-DEPENDENT SPEED CUT, and it does not fail quietly:
       MEASURED (#R577, headless Chromium/SwiftShader) at dt = 8.2 ms the cut sat at 0.81 of full
       speed, above the median 0.53 of the visible ocean, and ALL 20,487 live particles were dead
       three frames later — 100% of them, 93% of them over open water. The faster the machine, the
       emptier the ocean. With the test asked per second, 44,371 of 65,536 slots stay alive, which
       is the sea fraction of the view.
       ⚠ THIS IS A DELIBERATE DIFFERENCE FROM WINDY, and it is the only one in the integrator.
       Their `hasMovement(deltaPos)` compares the PER-FRAME step against the same 0.025, which at
       their nominal 60 Hz and dpr 2 lands at about 0.4 of full speed — a cut they can live with
       because their frame is fixed. Ours is not: `dt` is whatever the machine gives, so the same
       line would be a speed cut that moves with the frame rate. The question the test is asking —
       "does this particle have a velocity at all" — is about the field, not about the frame.
       Windy's own constant is kept; only the quantity it is compared against stops moving. */
    '  vec2 rate = dir * spd * uRate;',
    '  if (abs(rate.x * 1000.0) < TRESH && abs(rate.y * 1000.0) < TRESH) { gl_FragColor = vec4(0.0); return; }',
    '  pos = fract(pos + dpos);',
    '  gl_FragColor.rg = fract(pos * 255.0 + 0.25 / 255.0);',
    '  gl_FragColor.ba = pos - gl_FragColor.rg / 255.0;',
    '}'
  ].join('\n');

  /* The draw: one quad per particle, extruded from the previous position to the current one, widened
     perpendicular by `uWidth` and lengthened along the direction by `uLenEx` (Windy does the second
     one only under `#define WAVES`, which is why the swell lines look like dashes rather than dots). */
  /* ⚠ `uSide` IS A UNIFORM OF ITS OWN AND THAT IS THE POINT. It used to share `uVP2.zw` with the
     length extension, and the two want different numbers: the extension's offset is in CLIP units
     (about 0.002) while the side coordinate's is in PIXELS (about −4.4). MEASURED (#R577): with
     them shared, every particle quad was displaced 4.4 clip units — more than two screens — so the
     animation was not slow or faint, IT WAS ENTIRELY OFF SCREEN. */
  var DRAW_VS = [
    'attribute vec4 aVec;',
    'uniform sampler2D sState0;',
    'uniform sampler2D sState1;',
    'uniform vec4 uVP0;',
    'uniform vec4 uVP1;',
    'uniform vec4 uVP2;',
    'uniform vec2 uSide;',
    'varying float vSide;',
    'varying float vDiscard;',
    /* ══ ⚠⚠⚠ THE STATE'S Y RUNS DOWN THE SCREEN, AND THIS IS WHERE IT WAS BEING READ AS UP ═══════
       The integrator gives the state's y a meaning: `mix(myN, myS, pos.y)` — y = 0 is the NORTH
       edge of the view, i.e. the TOP of the screen. Clip space runs the other way, so writing
       `pos * 2 − 1` drew the whole animation MIRRORED TOP TO BOTTOM against the field steering it.
       MEASURED (#R577, z3 over the North Atlantic, 4,096 slots, the live particles unprojected
       through MapLibre and looked up in the model's own land mask):
           read as `pos * 2 − 1`  ······ 74.3% of live particles over sea
           read as `1 − pos * 2`  ······ 100.0% of live particles over sea
       against 66.8% sea in the view, i.e. the first reading is barely better than throwing them at
       the map at random. It is visible without any instrument once you look: particles streamed
       across Canada, Iberia and Greenland while the Bay of Biscay was empty, because the empty
       patches are the sea mask upside down. The vertical component of the DIRECTION was mirrored
       with it, so northbound swell was drawn heading south.
       ⚠ WINDY HAS THE SAME RECONCILIATION, ON THE OTHER SIDE. Read out of the shipped bundle
       (v51.2.1, 2026-09-10): their draw shader does NOT flip — `posA = fract(…) * 2.0 − 1.0` — and
       instead their field sampler carries a NEGATIVE y scale, `uPars0 = (mulX, −mulY, addX,
       mulY + addY)`, so `tc.y = mulY·(1 − pos.y) + addY`. Their field is a screen-space texture
       whose v = 0 is its top row, so the two negations cancel and their state's y = 0 is the bottom
       of the screen AND the south of the view. Ours reads a lat/lon grid instead of that texture,
       so the flip has nowhere to hide: it belongs on one side or the other, and it was on neither.
       It is put here rather than on the latitude because flipping the latitude would also have to
       flip `−cos`, and would leave the globe branch reasoning about a y axis pointing the opposite
       way from the screen it computes rays through. */
    'vec2 toClip(vec2 p){ return vec2(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0); }',
    'void main(){',
    '  vec2 tc = aVec.xy * uVP0.xy + uVP0.zw;',
    '  vec4 t0 = texture2D(sState0, tc);',
    '  vDiscard = step(0.025, t0.r + t0.g + t0.b + t0.a);',
    '  vec4 t1 = texture2D(sState1, tc);',
    '  vec2 posA = toClip(fract(t0.ba + t0.rg / 255.5));',
    '  vec2 posB = toClip(fract(t1.ba + t1.rg / 255.5));',
    '  vec2 dF = posA - posB;',
    '  float d = length(dF);',
    /* ⚠ normalize(vec2(0)) is NaN, and a NaN gl_Position takes the whole quad with it. The
       degenerate case has to be answered before the divide, not culled after it. */
    '  vec2 dN = d > 0.0 ? dF / d : vec2(0.0, 1.0);',
    '  vec2 dR = vec2(dN.y, -dN.x);',
    '  vec2 pos = mix(posB, posA, aVec.w * 0.003921569);',
    '  pos += dR * (aVec.zz * uVP1.xy + uVP1.zw);',
    '  pos += dN * (aVec.ww * uVP2.xy + uVP2.zw);',
    '  if (d > 0.5 || d < 0.00005) { pos.x += 10.0; }',
    '  gl_Position = vec4(pos, 0.0, 1.0);',
    '  vSide = aVec.z * uSide.x + uSide.y;',
    '}'
  ].join('\n');

  var DRAW_FS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'uniform float uHalf;',
    'varying float vSide;',
    'varying float vDiscard;',
    'void main(){',
    '  if (vDiscard <= 0.0) discard;',
    '  float aa = clamp(uHalf - abs(vSide), 0.0, 1.0);',
    '  gl_FragColor = uColor * vec4(aa);',
    '}'
  ].join('\n');

  var FADE_FS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'void main(){ gl_FragColor = uColor; }'
  ].join('\n');

  var COPY_FS = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec4 uMul;',
    'uniform vec4 uAdd;',
    'varying vec2 vUv;',
    'void main(){ gl_FragColor = texture2D(uTex, vUv) * uMul + uAdd; }'
  ].join('\n');

  /* ── GL helpers ─────────────────────────────────────────────────────────────────────────────── */

  /* `prelude` is prepended to the VERTEX shader only — it is what MapLibre compiles its own layers
     with, and it is the projection. `define` goes on both so a shader can tell the variants apart. */
  function compile(gl, vsSrc, fsSrc, shaderData) {
    var def = (shaderData && shaderData.define) || '';
    var pre = (shaderData && shaderData.vertexShaderPrelude) || '';
    if (pre) { vsSrc = def + '\n' + pre + '\n' + vsSrc; fsSrc = def + '\n' + fsSrc; }
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(s); gl.deleteShader(s);
        throw new Error('waves-gl: shader: ' + log);
      }
      return s;
    }
    var v = sh(gl.VERTEX_SHADER, vsSrc), f = sh(gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var plog = gl.getProgramInfoLog(p); gl.deleteProgram(p);
      throw new Error('waves-gl: link: ' + plog);
    }
    /* uniforms and attributes by name, so the call sites read like the shader */
    var u = {}, a = {};
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < nu; i++) { var ni = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[ni] = gl.getUniformLocation(p, ni); }
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var j = 0; j < na; j++) { var nj = gl.getActiveAttrib(p, j).name; a[nj] = gl.getAttribLocation(p, nj); }
    return { prog: p, u: u, a: a };
  }

  /* MapLibre hands its matrices out as Float64Array; `uniformMatrix4fv` wants 32-bit. */
  function f32(a) { return (a instanceof Float32Array) ? a : new Float32Array(a); }

  /* ⚠ THE INVERSE IS COMPUTED HERE RATHER THAN ASKED FOR, because MapLibre does not publish one.
     The globe branch of the particle integrator needs to turn a screen position back into a place
     on the planet, and that is the inverse of the very matrix the geometry is drawn with — column
     major, cofactor expansion, `null` when the matrix is singular (which a projection never is,
     but a caller that passed something else would otherwise get NaN particles instead of an
     answer). Standard 4×4 adjugate; no library is worth a dependency for sixteen numbers. */
  function invert4(src) {
    var m = src, o = new Float32Array(16);
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    var a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    var a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    var a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    var b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    var b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }

  function tex(gl, w, h, data, filter) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    return t;
  }

  /* ── the alpha envelope ─────────────────────────────────────────────────────────────────────── */

  /* Windy's `prepareAlphaLUT`: a rise of `a·128` frames with exponent `b`, a fall of `c·128` frames
     with exponent `d`, flat 1 in between. For waves the rise is 90 frames and the fall 38, so a
     particle is at full strength for none of its life — it is always either arriving or leaving. */
  function alphaLut() {
    var n = LIFE_FRAMES;
    var rise = Math.round(W.alphaRise * n), fall = Math.round(W.alphaFall * n);
    var out = new Float32Array(n);
    for (var o = 0; o < n; o++) {
      if (o < rise) out[o] = Math.pow(o / rise, W.alphaRisePow);
      else if (o >= n - fall) out[o] = Math.pow((n - o) / fall, W.alphaFallPow);
      else out[o] = 1;
    }
    return out;
  }

  /* ── the renderer ───────────────────────────────────────────────────────────────────────────── */

  function create(opts) {
    opts = opts || {};
    var landGrey = !!opts.landGrey;

    var gl = null, progRaster = null, progUpdate = null, progDraw = null, progFade = null, progCopy = null;
    var quadBuf = null, worldBuf = null, partBuf = null, partIdx = null;
    var dataTex = null, lutTex = null, state0 = null, state1 = null, backTex = null, fbo = null, stateFbo = null;
    var backW = 0, backH = 0;
    var rasterVariant = null;    /* which projection the raster program is currently compiled for */
    var projData = null;         /* MapLibre's defaultProjectionData for THIS frame */
    var grid = null;             /* {nx, ny, lonMin, latMin, dx, dy} */
    var pending = null;          /* Uint8Array of the packed grid, waiting for a context */
    var opacity = 1;
    var particlesOn = true;
    var alphaTab = alphaLut();
    var blockIndex = 0, blockTimer = 0, timeFrame = 0;
    var lastT = 0, accum = 0;
    /* ══ ⚠ THE PASS FADES IN, IT DOES NOT APPEAR ══════════════════════════════════════
       Windy's `alpha += frameTime * 1.8`, clamped at 1, multiplies the whole particle composite
       on its way to the map — so a switch-on takes 1/1.8 = 0.56 s to reach full strength instead
       of arriving whole. It is not the same thing as the trail filling up: the trail decays 0.905
       per FRAME, so on a fast machine it is full in a third of a second and on a slow one it is
       not, whereas this ramp is in SECONDS and looks the same on both. Reset whenever the pass is
       switched on, so every switch-on fades rather than only the first (#R622). */
    var appear = 0;
    var drawnPerBlock = 0;
    var dpr = (root.devicePixelRatio || 1);
    /* what the integrator actually ran on, per frame — see `positions()` on why this is kept */
    var stats = { frames: 0, dtSum: 0, dtLast: 0, dtClamped: 0, stepPxX: 0, speedPx: 0, zoom: 0 };

    /* ── data in ────────────────────────────────────────────────────────────────────────────────
       R = height / 12 clamped to [0,1] — the same normalisation Windy's tiles arrive with, so the
       shader's clamp bites in the same places and the LUT is indexed directly by R.
       G = 1 where the model has a value, 0 where it does not (land, outside the domain).
       B = mean wave direction as a turn in [0,1).
       A = `speedParam(wave_period)` — the PERIOD IN SECONDS over glMaxSpeedParam, clamped. Windy's
           own tiles carry the same quantity in the same place; see `speedParam` and the header. */
    function setData(d) {
      if (!d || !d.values || !d.grid) return false;
      var g = d.grid;
      var nx = g.nx | 0, ny = g.ny | 0;
      if (!(nx > 1 && ny > 1)) return false;
      var vals = d.values, dirs = d.directions || null, pers = d.periods || null;
      var n = nx * ny;
      if (vals.length < n) return false;
      var buf = new Uint8Array(n * 4);
      var maxH = root.IntMapWavePalette ? root.IntMapWavePalette.MAX : 12;
      for (var i = 0; i < n; i++) {
        var h = vals[i];
        var ok = (h === h) && isFinite(h);       /* NaN is land; the model publishes it that way */
        var nh = ok ? h / maxH : 0;
        buf[i * 4] = Math.max(0, Math.min(255, Math.round(nh * 255)));
        buf[i * 4 + 1] = ok ? 255 : 0;
        var dg = dirs ? dirs[i] : NaN;
        buf[i * 4 + 2] = (dg === dg && isFinite(dg)) ? Math.round(((dg % 360) + 360) % 360 / 360 * 255) : 0;
        buf[i * 4 + 3] = Math.round(speedParam(pers ? pers[i] : NaN) * 255);
      }
      grid = { nx: nx, ny: ny, lonMin: g.lonMin, latMin: g.latMin, dx: g.dx, dy: g.dy };
      pending = buf;
      if (gl) uploadData();
      return true;
    }

    function uploadData() {
      if (!gl || !pending || !grid) return;
      if (dataTex) gl.deleteTexture(dataTex);
      dataTex = tex(gl, grid.nx, grid.ny, pending, gl.NEAREST);
      pending = null;
    }

    /* ── the particle state ─────────────────────────────────────────────────────────────────────
       256×256 RGBA, sixteen 256×16 blocks. One block is re-randomised every 8 frames, so a particle
       lives 128 frames and the sixteen cohorts are evenly spread across that life. */
    function randomBlock() {
      var b = new Uint8Array(W.stateW * W.stateH * 4);
      for (var i = 0; i < b.length; i++) b[i] = (Math.random() * 256) | 0;
      return b;
    }

    function initState() {
      var full = new Uint8Array(W.stateW * W.stateW * 4);
      for (var i = 0; i < full.length; i++) full[i] = (Math.random() * 256) | 0;
      if (state0) gl.deleteTexture(state0);
      if (state1) gl.deleteTexture(state1);
      state0 = tex(gl, W.stateW, W.stateW, full, gl.NEAREST);
      state1 = tex(gl, W.stateW, W.stateW, full, gl.NEAREST);
    }

    /* Windy's count: screen area over a zoom-dependent divisor, capped, then scaled per block.
       ⚠ `w`, `h` are CSS pixels — Windy's `getAmount` is handed `this._map.getSize()`, which is the
       map's CSS size, NOT the drawing buffer. ⚠ `zoom` is MAPLIBRE's zoom and is converted to
       Windy's by `windyZoom` (see the note there); passing a zoom that has already been shifted
       would shift it twice. The result is per BLOCK: sixteen blocks are drawn, so the total is
       sixteen times this, which is `amount · glCountMul` — that is what makes `relativeAmount`
       (a fraction of the whole 256×256 state) and `drawn_per_block` (a fraction of one 256×16
       block) the same quantity in Windy's arithmetic and in ours. */
    function particleCount(w, h, zoom) {
      var amount = Math.min(W.maxParticles, Math.round(w * h / (W.multiplierConstant * Math.pow(W.multiplierPow, windyZoom(zoom) - W.multiplierZoom))));
      /* ⚠ halved OFF THE DESKTOP, after the cap — Windy's own order (see `phoneClass`) */
      if (phoneClass()) amount = Math.max(1, Math.round(amount * 0.5));
      var rel = amount / (W.stateW * W.stateW) * W.glCountMul;
      return Math.max(1, Math.min(W.stateW * W.stateH, Math.round(rel * W.stateW * W.stateH)));
    }

    function buildParticleBuffers() {
      /* one quad per particle slot in a block: 4 vertices, 6 indices, shared by all 16 blocks */
      var slots = W.stateW * W.stateH;
      var verts = new Uint8Array(slots * 4 * 4);
      var idx = new Uint16Array(slots * 6);
      var corner = [[0, 0], [255, 0], [255, 255], [0, 255]];
      for (var s = 0; s < slots; s++) {
        var px = s % W.stateW, py = (s / W.stateW) | 0;
        for (var c = 0; c < 4; c++) {
          var o = (s * 4 + c) * 4;
          verts[o] = px; verts[o + 1] = py; verts[o + 2] = corner[c][0]; verts[o + 3] = corner[c][1];
        }
        var vi = s * 4, ii = s * 6;
        idx[ii] = vi; idx[ii + 1] = vi + 1; idx[ii + 2] = vi + 2;
        idx[ii + 3] = vi; idx[ii + 4] = vi + 2; idx[ii + 5] = vi + 3;
      }
      partBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      partIdx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, partIdx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    }

    function onAdd(map, context) {
      gl = context;
      /* ⚠ THE RASTER IS NOT COMPILED HERE. Its vertex shader is MapLibre's prelude plus three
         lines, and which prelude that is only becomes known at the first `render` — and changes
         again the moment the reader switches projection. `ensureRaster` builds it on demand. */
      progUpdate = compile(gl, QUAD_VS, UPDATE_FS);
      progDraw = compile(gl, DRAW_VS, DRAW_FS);
      progFade = compile(gl, QUAD_VS, FADE_FS);
      progCopy = compile(gl, QUAD_VS, COPY_FS);

      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      /* the raster quad covers the whole world in Mercator units, subdivided so that the
         unprojection in the fragment shader stays accurate under the perspective matrix */
      var seg = 64, v = [];
      for (var y = 0; y < seg; y++) {
        for (var x = 0; x <= seg; x++) {
          v.push(x / seg, y / seg, x / seg, (y + 1) / seg);
        }
      }
      worldBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      worldBuf.count = v.length / 2;
      worldBuf.seg = seg;

      var lutBytes = root.IntMapWavePalette ? root.IntMapWavePalette.lut() : new Uint8Array(1024 * 4);
      lutTex = tex(gl, 1024, 1, lutBytes, gl.LINEAR);

      fbo = gl.createFramebuffer();
      stateFbo = gl.createFramebuffer();
      initState();
      buildParticleBuffers();
      uploadData();
    }

    function ensureBack(w, h) {
      /* Windy sizes the trail buffer at 0.8× on hidpi and caps it at 2048 */
      var k = dpr > 1.5 ? 0.8 : 1;
      var tw = Math.max(1, Math.min(2048, Math.round(k * w)));
      var th = Math.max(1, Math.min(2048, Math.round(k * h)));
      if (backTex && tw === backW && th === backH) return;
      if (backTex) gl.deleteTexture(backTex);
      backTex = tex(gl, tw, th, null, gl.LINEAR);
      backW = tw; backH = th;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, backTex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function drawQuad(p) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(p.a.aPos);
      gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* (re)compile the raster program for whichever projection MapLibre is in. Cheap: it happens
       once per projection, not once per frame. A failure is reported and the raster is skipped —
       an exception thrown out of `render` takes the whole map's frame loop with it. */
    function ensureRaster(sd) {
      var name = (sd && sd.variantName) || 'fallback';
      if (progRaster && rasterVariant === name) return progRaster;
      if (progRaster) { gl.deleteProgram(progRaster.prog); progRaster = null; }
      try {
        progRaster = compile(gl, RASTER_VS, RASTER_FS,
          (sd && sd.vertexShaderPrelude) ? sd : { define: '', vertexShaderPrelude: FALLBACK_PRELUDE });
        rasterVariant = name;
      } catch (e) {
        rasterVariant = name;
        try { console.warn('[IntMap waves-gl] raster shader (' + name + '): ' + e.message); } catch (_) {}
      }
      return progRaster;
    }

    /* `pd` is MapLibre 5's `defaultProjectionData`. Every uniform the prelude declares is set from
       it; the ones a given variant does not use are simply not active in the linked program and
       their location is absent, which `uni*` treat as a no-op. */
    function setProjectionUniforms(p, pd) {
      if (!pd) return;
      if (p.u.u_projection_matrix && pd.mainMatrix) gl.uniformMatrix4fv(p.u.u_projection_matrix, false, f32(pd.mainMatrix));
      if (p.u.u_projection_fallback_matrix && pd.fallbackMatrix) gl.uniformMatrix4fv(p.u.u_projection_fallback_matrix, false, f32(pd.fallbackMatrix));
      if (p.u.u_projection_tile_mercator_coords && pd.tileMercatorCoords) gl.uniform4fv(p.u.u_projection_tile_mercator_coords, f32(pd.tileMercatorCoords));
      if (p.u.u_projection_clipping_plane && pd.clippingPlane) gl.uniform4fv(p.u.u_projection_clipping_plane, f32(pd.clippingPlane));
      if (p.u.u_projection_transition) gl.uniform1f(p.u.u_projection_transition, typeof pd.projectionTransition === 'number' ? pd.projectionTransition : 0);
    }

    function renderRaster(pd, sd) {
      if (!dataTex || !grid) return;
      var p = ensureRaster(sd);
      if (!p) return;
      gl.useProgram(p.prog);
      setProjectionUniforms(p, pd);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dataTex);
      gl.uniform1i(p.u.uData, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.uniform1i(p.u.uLut, 1);
      gl.uniform4f(p.u.uGrid, grid.nx, grid.ny, 1 / grid.nx, 1 / grid.ny);
      gl.uniform4f(p.u.uGeo, grid.lonMin, grid.latMin, 1 / grid.dx, 1 / grid.dy);
      gl.uniform1f(p.u.uOpacity, opacity);
      gl.uniform1f(p.u.uLandGrey, landGrey ? 1 : 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
      gl.enableVertexAttribArray(p.a.aPos);
      gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
      var perRow = (worldBuf.seg + 1) * 2;
      for (var r = 0; r < worldBuf.seg; r++) gl.drawArrays(gl.TRIANGLE_STRIP, r * perRow, perRow);
    }

    function renderParticles(map) {
      if (!particlesOn || !dataTex || !grid) return;
      var cw = gl.drawingBufferWidth, chh = gl.drawingBufferHeight;
      ensureBack(cw, chh);

      var now = (root.performance && root.performance.now ? root.performance.now() : Date.now()) / 1000;
      var raw = lastT ? (now - lastT) : 1 / 60;
      var dt = Math.min(raw, 0.1);
      if (raw > 0.1) stats.dtClamped++;
      lastT = now;
      /* ⚠ THE REMAINDER IS KEPT, NOT DROPPED — AND WINDY KEEPS IT TOO. The cohort clock counts
         1/60 s ticks; `accum = 0` threw away whatever part of a tick had not been spent, so at any
         frame rate above 60 Hz — where a frame is worth less than one tick but is forced to spend
         a whole one by the `max(1, …)` — the sixteen cohorts recycled FASTER than real time and a
         particle's 128-frame life was shorter than the alpha envelope assumes. Windy's own line,
         read out of `plugins/gl-particles.js` on 2026-09-09, is
             frames60timer += frameTime;
             frames60 = Math.max(1, Math.round(frames60timer * 60));
             frames60timer -= frames60 * 0.0166667;
         i.e. it subtracts what it spent. This now does the same. */
      appear = Math.min(1, appear + dt * 1.8);   /* Windy's own rate — see `appear` */
      accum += dt;
      var frames60 = Math.max(1, Math.round(accum * 60));
      accum = Math.max(0, accum - frames60 / 60);

      var b = map.getBounds();
      var zoom = Math.max(0, Math.min(24, Math.round(map.getZoom())));
      drawnPerBlock = particleCount(map.getCanvas().clientWidth, map.getCanvas().clientHeight, zoom);

      /* ── integrate ── */
      var pu = progUpdate;
      gl.useProgram(pu.prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, stateFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state1, 0);
      gl.viewport(0, 0, W.stateW, W.stateW);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state0);
      gl.uniform1i(pu.u.uState, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dataTex);
      gl.uniform1i(pu.u.uData, 1);
      gl.uniform4f(pu.u.uGrid, grid.nx, grid.ny, 1 / grid.nx, 1 / grid.ny);
      gl.uniform4f(pu.u.uGeo, grid.lonMin, grid.latMin, 1 / grid.dx, 1 / grid.dy);
      gl.uniform4f(pu.u.uView, b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      /* ══ WHICH INVERSE PROJECTION THE INTEGRATOR USES THIS FRAME ═════════════════════════════════
         ⚠ THE TEST IS THE TRANSITION, NOT THE NAME. MapLibre's globe is not a mode, it is a
         continuum: `projectionTransition` runs 1 → 0 as the reader zooms in, and the geometry is
         drawn by `interpolateProjection`, which BLENDS the sphere and the plane in between. A
         particle field cannot be blended — a particle is at one place — so the integrator follows
         the same rule the picture does and calls it a sphere only while the picture is one. Below
         that, the plane branch is right, and it is exactly what MapLibre's own `fallbackMatrix` is
         drawing. During the second or so of the animated switch the two disagree slightly; nothing
         is killed by it, the particles simply lag the surface for that second. */
      var sphere = !!(projData && projData.mainMatrix && projData.projectionTransition > 0.999);
      var inv = sphere ? invert4(f32(projData.mainMatrix)) : null;
      gl.uniform1f(pu.u.uGlobe, inv ? 1 : 0);
      gl.uniform1f(pu.u.uAspect, chh / cw);
      if (inv) {
        gl.uniformMatrix4fv(pu.u.uProj, false, f32(projData.mainMatrix));
        gl.uniformMatrix4fv(pu.u.uProjInv, false, inv);
      }
      /* ⚠ `zoom2speed` is Windy's `zoomWindFactor`, and their own line is
         `c.zoom2speed[this._cache.lastZoom]` — the TILE zoom, i.e. MapLibre's + 1 (see `windyZoom`). */
      var speedPx = W.glSpeedPx * W.zoom2speed[Math.min(W.zoom2speed.length - 1, windyZoom(zoom))] * dpr;
      /* ══ WHAT THE INTEGRATOR ACTUALLY DELIVERS, MEASURED RATHER THAN ASSUMED (#R577) ═════════════
         Two things were in doubt and both are now closed by measurement, not by argument:
           ① THE STEP IS NOT LOST TO THE 16-BIT POSITION ENCODING. Over one-second windows, with the
              period field forced so every node is at full speed, the median displacement read back
              out of the state was 4.96, 4.98 px against Σdt·speedPx = 4.96, 5.03 px — a ratio of
              0.999 and 0.991. There is no hidden factor left between this file's own constants and
              what the particles do; the「five times slower than its own theory」reading was the
              wave HEIGHT being used as the speed (see `spd`).
           ② THE CLOCK COVERS REAL TIME. Σdt over three 4-second windows was 3.94, 3.98, 3.97 s —
              98.2%, 99.3%, 98.9% of the wall clock, with 0–2 frames hitting the 0.1 s clamp. The
              `accum` remainder is kept (below), so the cohort clock does not drift either.
           ③ AND THE WHOLE LAW IS NOW CONFIRMED IN THE RUNNING RENDERER, not only on paper. MEASURED
              2026-09-10 at MapLibre z3, 1200×800 CSS, dpr 1, 45N 40W, by reading `positions()` back
              over 32 rendered frames and dividing by the integrator's own Σdt — with the period field
              forced to one value, and then as it comes:
                  T = 10 s everywhere → 5.60 px/s   (= speedPx: the ceiling is ten SECONDS)
                  T =  5 s everywhere → 2.78 px/s   (×0.50)
                  T =  2 s everywhere → 1.12 px/s   (×0.20)
                  the real field      → 3.79 px/s   (×0.677, and the field's own median in view is
                                                     6.95 s → 0.695 — the same number)
              ⚠ DIVIDE BY Σdt, NOT BY THE WALL CLOCK, when the GPU is a software one. In headless
              SwiftShader the same window read 1.0 px/s against the wall, because MapLibre renders in
              bursts there and the gaps between them are cut to 0.1 s by Windy's own frameTime clamp.
              The clamp is correct and the integrator is exact; it is the frame supply that is not.
         Windy's own figure for the same view is 5.6 × the same normalised speed, because both the
         arithmetic above and the field are now the same: sampled through their
         `W.interpolator.getLatLonInterpolator()` and decoded by their own `W.utils.wave2obj` over the
         open North Atlantic, their median period is 7.40 s against our 7.35 s (see the header).
         ⚠ 5.6 and 11.2 were 4.8 and 9.6 until #R622, when the zoom index was found to be Windy's tile
         zoom rather than MapLibre's (`windyZoom`). ⚠ The remaining「half speed」of #R577 is gone with
         the group velocity it came from (see `speedParam`). */
      gl.uniform2f(pu.u.uStep, dt * speedPx / cw, dt * speedPx / chh);
      gl.uniform2f(pu.u.uRate, speedPx / cw, speedPx / chh);
      stats.frames++; stats.dtSum += dt; stats.dtLast = dt;
      stats.stepPxX = dt * speedPx; stats.speedPx = speedPx; stats.zoom = zoom;
      drawQuad(pu);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      var swap = state0; state0 = state1; state1 = swap;

      /* ── the cohort clock ── */
      blockTimer += frames60;
      while (blockTimer >= W.blockFrames) {
        blockTimer -= W.blockFrames;
        blockIndex = (blockIndex + 1) % W.blocks;
        var rb = randomBlock();
        gl.bindTexture(gl.TEXTURE_2D, state0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, blockIndex * W.stateH, W.stateW, W.stateH, gl.RGBA, gl.UNSIGNED_BYTE, rb);
        gl.bindTexture(gl.TEXTURE_2D, state1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, blockIndex * W.stateH, W.stateW, W.stateH, gl.RGBA, gl.UNSIGNED_BYTE, rb);
      }
      timeFrame = (timeFrame + frames60) % LIFE_FRAMES;

      /* ── draw the cohorts into the trail buffer ── */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, backW, backH);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      var pd = progDraw;
      gl.useProgram(pd.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state0); gl.uniform1i(pd.u.sState0, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, state1); gl.uniform1i(pd.u.sState1, 1);
      var widthPx = Math.max(1, W.glParticleWidth * dpr);
      var half = Math.max(1, widthPx * 0.8);
      gl.uniform1f(pd.u.uHalf, half);
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.enableVertexAttribArray(pd.a.aVec);
      gl.vertexAttribPointer(pd.a.aVec, 4, gl.UNSIGNED_BYTE, false, 4, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, partIdx);
      /* ══ ⚠⚠⚠ THE QUAD'S TWO EXTENTS ARE WINDY'S OWN FOUR LINES, AND THEY DIVIDE BY THE CANVAS ═══
         Read out of `drawParticles` in `plugins/gl-particles.js` (v51.2.1, 2026-09-10) verbatim:
             i = widthFactor + 1
             a = i / lastClientWidth              o = i / lastClientHeight
             s = glParticleLengthEx / lastClientWidth   c = glParticleLengthEx / lastClientHeight
             uVPars1 = (a·2/255, o·2/255, −a, −o)   uVPars2 = (s·2/255, c·2/255, −s, −c)
         and `lastClientWidth` is `gl.canvas.width` — the DRAWING BUFFER, in device pixels — while
         the pass is drawn into a trail texture that is only 0.8× of it on hidpi and capped at 2048.
         Dividing by the canvas rather than by that texture is not an oversight of theirs: the quad
         then comes out proportionally smaller in the smaller buffer and lands at the SAME on-screen
         size once the trail is blitted back up. Dividing by the trail texture instead — which this
         file did until #R622 — inflates the particle by `canvas/back` = 1.25× on any hidpi screen.
         ⚠ AND THE LENGTH CARRIES NO `ratioScale`. The width does (`widthFactor` is
         `getLineWidth(zoom) · glParticleWidth · ratioScale`); `glParticleLengthEx` is used raw. So
         Windy's mark is `widthFactor + 1` device px ACROSS the direction of travel and exactly
         `glParticleLengthEx` = 1 device px ALONG it — a hair, not a dash, because the per-frame
         displacement it is drawn over (5.6–11.2 px/s ÷ 60 Hz ≈ 0.1–0.2 px) adds nothing to the length.
         ⚠ #R577 read the old `2 · lex / backW` as a fix for a half-pixel extension and called the
         difference 「invisible either way」. It is not: with `lex = glParticleLengthEx · dpr` and the
         extra factor of two, the mark was `2·dpr·(canvas/back)` times too thick along its motion —
         2× at dpr 1 and 5× at dpr 2 — which is precisely the reported 「短く太いダッシュ」 against
         Windy's 「細く疎な毛髪状の線」. MEASURED at MapLibre z3, 1200×800 CSS, dpr 1, by differencing
         a frame against the same frame with the particles switched off: the ocean crop went from
         37.2% covered (535 merged blobs, median 44 px² each) to 22.2–25.5% (≈1,100–2,200 blobs,
         median 25–26 px²), against windy.com 19.4–22.3% measured the same way.
         ⚠ THAT COMPARISON IS OF BOTH FIXES TOGETHER: the count is 1.30× of it (`windyZoom`) and the
         thickness the rest. Windy's own `drawn_per_block` for that viewport is 1,065 and so is ours
         now; it was 1,385.
         ⚠ THE COVERAGE FIGURE IS A RANGE BECAUSE IT IS NOT REPEATABLE TO BETTER THAN ±3 POINTS, and
         the range is the honest number. Two runs of this same measurement, in two different windows,
         gave 23.5% vs 22.3% and 25.5% vs 19.4% for the same pair — a ratio of 1.05 and one of 1.30.
         It is a screen statistic over a moving, decaying smear: it depends on which frames the
         browser happened to deliver, and it moves again with the basemap under the crop. It also
         cannot be compared across METHODS at all — a canvas read-back of the very frame that a page
         screenshot scored 25.5% scores 11.6%. So: ours is heavier than Windy's, somewhere between
         1.05× and 1.3×, and WHY is not established. ⚠ Do not close that gap with a coefficient —
         `glCountMul` and `glParticleWidth` are Windy's own numbers and match their bundle. The
         prose version of this, with the method, is docs/MAP-LAYERS.md §7.14. */
      var wA = (widthPx + 1) / cw, wB = (widthPx + 1) / chh;
      var lA = W.glParticleLengthEx / cw, lB = W.glParticleLengthEx / chh;
      gl.uniform4f(pd.u.uVP1, wA * 2 / 255, wB * 2 / 255, -wA, -wB);
      gl.uniform4f(pd.u.uVP2, lA * 2 / 255, lB * 2 / 255, -lA, -lB);
      gl.uniform2f(pd.u.uSide, (2 * half) / 255, -half);
      for (var k = 0; k < W.blocks; k++) {
        var f = (timeFrame - k * W.blockFrames + LIFE_FRAMES) % LIFE_FRAMES;
        var a = alphaTab[f];
        if (a <= 0) continue;
        gl.uniform4f(pd.u.uColor, a, a, a, a);
        /* ⚠ THE ROW STRIDE IS THE TEXTURE'S, NOT THE BLOCK'S. `1/(stateW*blocks)` squeezed a
           block's 16 rows into 1/16 of their own height, so with NEAREST sampling all 4,096 slots
           in a block read from roughly ONE row — 256 distinct particles drawn sixteen times over.
           MEASURED (#R577): the offset `uVP0.w` was already `(k*stateH + 0.5)/stateW`, i.e. right;
           only the stride disagreed with it. */
        gl.uniform4f(pd.u.uVP0, 1 / W.stateW, 1 / W.stateW, 0.5 / W.stateW, (k * W.stateH + 0.5) / W.stateW);
        gl.drawElements(gl.TRIANGLES, drawnPerBlock * 6, gl.UNSIGNED_SHORT, 0);
      }

      /* ── decay the trail: a MULTIPLY of the buffer, not a translucent wash ── */
      var glB = W.glBlending * (phoneClass() ? 1.15 : 1);   /* Windy's mobile boost — see `phoneClass` */
      var fade = Math.min(0.9 + 0.5 * (glB - 0.92), 0.98);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
      gl.blendColor(fade, fade, fade, fade);
      gl.useProgram(progFade.prog);
      gl.uniform4f(progFade.u.uColor, 0, 0, 0, 0);
      drawQuad(progFade);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      /* ── and out to the map ── */
      gl.viewport(0, 0, cw, chh);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      var mulRGB = W.glOpacity * 0.7 + 0.4;
      var mulA = W.glOpacity > 1 ? (2 - W.glOpacity) : W.glOpacity;
      mulA += 0.1;
      var mr = 0.4 * mulRGB, mg = 0.4 * mulRGB, mb = 0.4 * mulRGB, ma = 0.4 * mulA, add = -0.1;
      /* ══ ⚠⚠⚠ CLOSE IN, WINDY STOPS TINTING THE TRAIL AND PAINTS THE PARTICLES ONE COLOUR ══════
         Their condition is on the MapLibre zoom alone — `maplibreMap.getZoom() >= grayMapZoomEnd - 0.5`
         with `grayMapZoomEnd = 11`, i.e. z >= 10.5 — and the composite becomes
             (0.5, 0, 0.4, glOpacity * 0.44 + 0.3)      = (0.5, 0, 0.4, 1.004) for `waves`
         ⚠ THE NAME SAYS 「grey basemap」 AND THE TEST DOES NOT ASK ABOUT ONE. It is the zoom at which
         Windy's own basemap has finished turning grey, but nothing in the branch reads the basemap,
         so a renderer that matches their behaviour matches the zoom. IntMap's basemap does not turn
         grey, so this purple is drawn over a colour map here; MEASURED at z11 over the Kanto coast
         (screenshot, #R622) the marks read as dark violet hairs and stay legible over both the wave
         ramp and the land. ⚠ The threshold is a RAW zoom, not the rounded `zoom` above — half a
         level is exactly what it is about.
         ⚠ AND THE WHOLE COMPOSITE IS SCALED BY `appear` (both the multiply and the bias), because the
         blend is premultiplied: scaling only the alpha would leave the colour arriving at full
         strength. */
      if (map && typeof map.getZoom === 'function' && map.getZoom() >= 10.5) {
        var mulAZoomed = W.glOpacity * 0.44 + 0.3;
        mr = 0.5; mg = 0; mb = 0.4; ma = mulAZoomed; add = 0;
      }
      var pc = progCopy;
      gl.useProgram(pc.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, backTex); gl.uniform1i(pc.u.uTex, 0);
      gl.uniform4f(pc.u.uMul, mr * appear, mg * appear, mb * appear, ma * appear);
      gl.uniform4f(pc.u.uAdd, add * appear, add * appear, add * appear, add * appear);
      drawQuad(pc);
    }

    var api = {
      setData: setData,
      hasData: function () { return !!(dataTex || pending); },
      setOpacity: function (o) { opacity = Math.max(0, Math.min(1, o)); },
      setParticles: function (on) { if (on && !particlesOn) appear = 0; particlesOn = !!on; },
      particleCount: particleCount,
      alphaTable: function () { return alphaTab; },
      /* ══ THE MEASUREMENT HOOK ═══════════════════════════════════════════════════════════════════
         ⚠ This is not decoration and not a debug leftover: HOW FAR A PARTICLE MOVES PER SECOND
         CANNOT BE READ OFF THE SCREEN. The trail buffer is a decaying smear of 4,096 quads, so a
         cross-correlation of two screenshots answers with the smear's own autocorrelation, and at
         the speeds involved (a fraction of a pixel per frame) the answer is inside the noise —
         MEASURED that way first (#R577), and it is what hid the deficit this hook then found.
         `positions()` reads the integrator's own state back, so a displacement is counted, not
         inferred, and `stats()` reports the clock the integrator actually ran on. */
      positions: function (count) {
        if (!gl || !state0 || !stateFbo) return null;
        var n = Math.max(1, Math.min(W.stateW * W.stateW, count | 0));
        var rows = Math.ceil(n / W.stateW);
        var buf = new Uint8Array(W.stateW * rows * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, stateFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state0, 0);
        gl.readPixels(0, 0, W.stateW, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        /* the same decode the shaders use: high byte in BA, low byte in RG */
        var out = new Float64Array(n * 2);
        for (var i = 0; i < n; i++) {
          var o = i * 4;
          out[i * 2] = buf[o + 2] / 255 + buf[o] / 255 / 255.5;
          out[i * 2 + 1] = buf[o + 3] / 255 + buf[o + 1] / 255 / 255.5;
        }
        return out;
      },
      stats: function () { return stats; },
      /* The MapLibre custom layer. ⚠ `2d`, AND THAT IS WHAT MAKES THE GLOBE WORK, not what stops
         it: MapLibre hands `shaderData` to both modes, and the 2d prelude's `projectTile` is the
         one that writes the horizon-clipping z (`globeComputeClippingZ`), so the far side of the
         planet leaves the clip volume and is dropped by the GPU. A `3d` layer would get
         `projectTileFor3D`, which does NOT clip the horizon and would need a depth buffer to hide
         the ocean on the other side of the world. js/orbit-points.js is `3d` because its satellites
         are ABOVE the surface and are supposed to be occluded by it; this raster is ON the surface. */
      layer: function (id) {
        return {
          id: id || 'im-waves',
          type: 'custom',
          renderingMode: '2d',
          onAdd: function (map, context) { api._map = map; onAdd(map, context); },
          onRemove: function () { api.destroy(); },
          /* ══ ⚠⚠⚠ MapLibre 5 DOES NOT HAND A MATRIX HERE, AND THE OBVIOUS FIELD IS THE WRONG ONE ══
             MEASURED (#R577, maplibre-gl 5.24.0, headless Chromium/SwiftShader):
               ① the second argument is a `CustomRenderMethodInput` OBJECT. Passing it straight to
                  `uniformMatrix4fv` throws «The object must have a callable @@iterator property»
                  on the very first frame, and the layer drew nothing at all.
               ② `modelViewProjectionMatrix` — the field whose name says «world→clip» — is
                  `transform._viewProjMatrix`, which takes WORLD space, i.e. mercator × worldSize.
                  Feeding it a [0,1] quad shrinks the whole planet to one 4096th of itself at z3:
                  no error, no warning, AND STILL AN EMPTY SCREEN. Measured that too, which is why
                  this note exists rather than a one-line change.
             `defaultProjectionData` is what the whole projection arrives in — on mercator its
             `mainMatrix` is the [0,1]-mercator→clip matrix (MapLibre builds it by rescaling the z0
             tile matrix by EXTENT for exactly this caller) and on globe it is the unit-sphere→clip
             one, together with the fallback matrix, the tile's mercator coords, the clipping plane
             and the transition. ⚠ THE WHOLE OBJECT IS FORWARDED, not just one matrix, because the
             prelude declares all five and the globe uses four of them.
             A bare matrix from an older generation is still accepted and wrapped.
             ⚠ They arrive as Float64Array; `uniformMatrix4fv` wants 32-bit, so they are copied. */
          render: function (context, arg) {
            gl = context;
            var pd = (arg && arg.defaultProjectionData) || null;
            if (!pd) {
              /* an older MapLibre, or a host that hands a bare matrix: build the one field the
                 fallback prelude needs out of whatever was passed */
              var m = (arg && arg.modelViewProjectionMatrix) ? arg.modelViewProjectionMatrix : arg;
              pd = (m && (m.length === 16)) ? { mainMatrix: m, projectionTransition: 0 } : null;
            }
            projData = pd;
            if (!dataTex && pending) uploadData();
            renderRaster(pd, arg && arg.shaderData);
            renderParticles(api._map);
            if (particlesOn && api._map && api._map.triggerRepaint) api._map.triggerRepaint();
          }
        };
      },
      destroy: function () {
        if (!gl) return;
        [dataTex, lutTex, state0, state1, backTex].forEach(function (t) { if (t) gl.deleteTexture(t); });
        [quadBuf, worldBuf, partBuf, partIdx].forEach(function (b) { if (b) gl.deleteBuffer(b); });
        [progRaster, progUpdate, progDraw, progFade, progCopy].forEach(function (p) { if (p) gl.deleteProgram(p.prog); });
        if (fbo) gl.deleteFramebuffer(fbo);
        if (stateFbo) gl.deleteFramebuffer(stateFbo);
        dataTex = lutTex = state0 = state1 = backTex = null;
        gl = null;
      }
    };
    return api;
  }

  root.IntMapWavesGL = {
    create: create,
    /* exported so the tests can check the animation's arithmetic without a GPU */
    PRESET: W,
    LIFE_FRAMES: LIFE_FRAMES,
    alphaLut: alphaLut,
    /* ⚠ the speed law, exported for the same reason `alphaLut` is: it is a pure function of the
       preset, it decides what the animation looks like, and it can be checked without a GPU. */
    speedParam: speedParam,
    shaders: { RASTER_FS: RASTER_FS, UPDATE_FS: UPDATE_FS, DRAW_VS: DRAW_VS }
  };
})(typeof window !== 'undefined' ? window : globalThis);
