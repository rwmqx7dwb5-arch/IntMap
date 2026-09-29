/* ============================================================================
 *  THE SEISMIC SIMULATOR — the wavefronts
 * ----------------------------------------------------------------------------
 *  How the P / S / surface-wave fronts are built from the rupture, sampled and labelled.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The fronts are built inside js/seismic.js's factory
 *    closure (faultRing, frontDelta, the per-bearing builder) against a live renderer; nothing there
 *    is exported, so the tests that pin them read the source, comments stripped. Where a relation can
 *    be restated, it is evaluated here beside the pin.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #15 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{
test('R189 seismic: rings go through the polar-safe helpers', () => {
  const src = read('js/seismic.js');
  /* ⚠ (#R237) THE STEP COUNT IS NO LONGER 180 AND MUST NOT BE PINNED — 「動作は離散的ではなく
     スムーズにして」 made it a function of the front's size on screen (see _frontSteps). The claim
     this test makes is about WHICH HELPER draws the ring, which is what carries the seam and pole
     behaviour; the number of vertices was never part of it. */
  assert.match(src, /HOST\.diskOutlineLines\(centre,a\*D\*RE,/, 'circular fronts use the shared seam/pole machinery');
  assert.match(src, /HOST\._splitLineToWindows\(ringPts\)/, 'and the finite-source envelope is seam-split the same way');
  assert.match(src, /Math\.max\(-89\.99,Math\.min\(89\.99,la2\/D\)\)/, 'destAng clamps the asin pole case');
  assert.match(src, /const h=Math\.sin\(dla\)\*Math\.sin\(dla\)/, 'gcDelta is the haversine now');
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #8 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => codeOnly(String(s));

test('R232 seismic: the wavefronts are named, and the observation points are cities that shake', () => {
  const s = read('js/seismic.js');
  for (const n of ['P wave', 'S wave', 'Rayleigh wave', 'Love wave']) {
    assert.ok(s.includes(`'${n}'`), `the ${n} front says what it is`);
  }
  assert.match(s, /kind:'frontLabel'/, 'the name is drawn on the ring');
  assert.match(s, /id:'seis-front-lbl'/, '…by a layer of its own');
  /* the cut is the instruction's: JMA 3 or MMI IV and below are not observation points */
  assert.match(s, /function obsCut\(a\)/, 'the intensity filter exists');
  assert.match(s, /\(scale==='jma'\) \? \(a\.jma>=3\.5\) : \(a\.mmi>=4\.5\)/, '震度4以上 / MMI V以上 のみ');
  assert.match(s, /a\.km<=MMI_CALIB_KM/, 'and only where the model will answer at all');
  assert.match(s, /OBS_MIN_SEP_KM/, 'a metropolis is not ten rows of its own wards');
  assert.doesNotMatch(noJs(s), /r\[0\]==='capital'\)\s*$/m, 'capitals are no longer the source');
  /* the population the ranking needs is kept by the gazetteer.
     ⚠ (#R495) …and the ISO-2 country now rides behind it, for js/atlas-query.js's `cities`→`countries`
     join. The field this test is about is `pop`, and it is still the SEVENTH — appending an eighth
     cannot move it, which is the property worth asserting rather than the exact end of the line. */
  assert.match(read('js/gazetteer.js'), /out\.push\(\[pop>=250000\?'city':'town', terms, lng, lat, en, ja\|\|en, pop(, iso2)?[,\]]/,
    'the row carries its population, in the seventh slot');
});
}

/* ═══ from tests/r234-checks.test.mjs (tests #11 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 5 · the wave names follow the view ─────────────────────────────────────────────────────── */
test('R234 seismic: the front labels are placed toward the map centre, not at a fixed 45°', () => {
  const s = read('js/seismic.js');
  assert.doesNotMatch(s, /const p=destAng\(epi,45,/, 'the fixed bearing is gone');
  /* ⚠ (#R235) the CONTRACT, not the expression. The bearing is now hoisted into `vb` so the RADIUS
     can be read at the same bearing the label is placed at — with a laterally varying surface-wave
     path those became two different numbers, and a name taken from bearing 0 floats off its ring.
     What this line protects is unchanged: the placement follows the map centre. */
  assert.match(s, /const vb=_viewBearing\(\); const r=rad\(vb\);/, 'the label reads the radius at the bearing it will sit on');
  assert.match(s, /const p=destAng\(epi,vb,/, 'the label sits on the arc that is in view');
  assert.match(s, /function _viewBearing\(\)\{[^}]*const b=bearingTo\(epi,\[c\.lng,c\.lat\]\);/s,
    '…which is the bearing from the epicentre to the camera centre');
  assert.match(s, /GE\(\)\.events\.on\('moveend',\(\)=>\{ try\{ if\(opened&&epi\) drawFronts\(\); \}catch\(_\)\{\} \}\);/,
    'and it follows a pan — on moveend, never per frame');
});
}

/* ═══ from tests/r235-checks.test.mjs (tests #3, #4, #5 of 9) ═══
    R235 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic it is COMPUTED here rather than pinned to a
    number this round happened to produce (#R203/#R229).

   (layer-manifest) the lists are views of js/layer-manifest.js */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234 — SEVEN rounds of a check hitting its own explanation). Strip the
   comments and match the SYNTAX. */

/* ── 3 · the front envelope: spherical, and concave where the source is ─────────────────────── */
test('R235 wavefronts: the envelope is the spherical outer root, not the convex support function', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /const cand=k\.off\*Math\.cos\(\(b-k\.phi\)\*D\)\+r;/,
    'the flat support function (= the convex hull) is gone');
  assert.match(s, /Math\.atan2\(B,A\)\+Math\.acos\(q\)/, 'the outer root of the spherical triangle is used');
  assert.match(s, /function _srcPts\(\)/, 'the source points are sampled with their own depths');
  assert.match(s, /dep=zT\+\(zB-zT\)\*f;/, 'each point takes the plane’s depth at its own across-strike position');
  /* ⚠ (#R238) the depth is READ OUT FIRST now, because the body-wave radius takes the bearing too
     (the crustal correction — see `_bodyStretch`). The claim is unchanged and is the whole of #R235's
     finding: the curve is asked for THAT point's depth rather than the hypocentre's. */
  assert.match(s, /const dep=\(k&&k\.dep!=null\)\?k\.dep:depthKm;/, 'each point’s own depth is taken');
  assert.match(s, /frontDelta\(ph\.k,dep,/, 'and asks the travel-time curve for THAT depth');

  /* the maths, run: the exact root must (a) reduce to the old line for small angles and
     (b) exceed it — i.e. bulge outward where the flat formula under-reaches — at large ones. */
  const D = Math.PI / 180;
  const exact = (offDeg, rDeg, dbDeg) => {
    const A = Math.cos(offDeg * D), B = Math.sin(offDeg * D) * Math.cos(dbDeg * D);
    const C = Math.hypot(A, B); const q = Math.cos(rDeg * D) / C;
    if (q < -1 || q > 1) return null;
    return (Math.atan2(B, A) + Math.acos(q)) / D;
  };
  /* the old expression, kept here so the DIFFERENCE is asserted rather than described */
  const support = (offDeg, rDeg, dbDeg) => offDeg * Math.cos(dbDeg * D) + rDeg;
  /* the planar union boundary — the thing the spherical root must agree with when the sphere is
     flat enough for that to be a fair comparison. `support` replaces this square root with `r`,
     which is the tangent line, which is where the convex hull came from. */
  const planar = (offDeg, rDeg, dbDeg) => {
    const s = offDeg * Math.sin(dbDeg * D);
    return offDeg * Math.cos(dbDeg * D) + Math.sqrt(Math.max(0, rDeg * rDeg - s * s));
  };
  /* (a) the spherical root IS the union boundary: at crustal scale it matches the planar union to
     far better than the ring's own 2.5° sampling, at every bearing */
  for (const db of [0, 30, 45, 90, 135, 180]) {
    const e = exact(0.2, 0.5, db), p = planar(0.2, 0.5, db);
    assert.ok(Math.abs(e - p) < 1e-3,
      'the spherical root matches the planar union at Δbearing ' + db + ' (' + (e - p).toExponential(1) + '°)');
  }
  /* (b) …and the OLD expression does not, by a margin that matters even for a small event:
     0.02° of arc is 2.3 km, on a 55 km front */
  const dSmall = Math.abs(support(0.2, 0.5, 90) - exact(0.2, 0.5, 90));
  assert.ok(dSmall > 0.015, 'across strike the support function over-reaches even at crustal scale ('
    + (dSmall * 111.19).toFixed(1) + ' km)');
  /* (c) at Sumatra scale it is wrong by degrees — hundreds of km */
  const dBig = Math.abs(support(10, 20, 90) - exact(10, 20, 90));
  assert.ok(dBig > 0.4, 'at 10°/20° the support function is off by ' + dBig.toFixed(2) + '° of arc');
  /* (c) the identities that make it a wavefront at all */
  assert.ok(Math.abs(exact(0, 5, 123) - 5) < 1e-9, 'a point source gives a circle of radius r');
  assert.ok(Math.abs(exact(3, 5, 0) - 8) < 1e-9, 'forward of the source point the front is off + r');
  assert.ok(Math.abs(exact(3, 5, 180) - 2) < 1e-9, 'behind it the front is r − off');
  assert.equal(exact(30, 1, 90), null, 'a ray that never reaches a source point contributes nothing');
});

/* ── 4 · the surface-wave path is integrated, not a constant ────────────────────────────────── */
test('R235 wavefronts: surface-wave group velocity is a path integral over the crust', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /let OCEAN_G=/, 'the one lateral-heterogeneity assumption is named and adjustable');
  assert.match(s, /function _pathBuild\(\)/, 'a per-epicentre slowness table');
  assert.match(s, /s\+=stepKm\/g;/, 'it integrates 1/g along the great circle');
  assert.match(s, /function _pathDeg\(reducedKm,brg\)/, 'and the front inverts it per bearing');
  assert.match(s, /if\(!tab\) return reducedKm\/\(D\*RE\);/,
    'with no land mask it degrades to exactly the constant-velocity circle it replaced');
  /* the reference values are UNCHANGED, or this would be a silent re-tuning of #R176's physics */
  assert.match(s, /\{ v:3\.5, col:'#0a84ff'/, 'Rayleigh is still 3.5 km/s');
  assert.match(s, /\{ v:4\.4, col:'#bf5af2'/, 'Love is still 4.4 km/s');
  /* an all-continental path must reproduce the plain great-circle answer exactly */
  const RE = 6371.0, D = Math.PI / 180, PS = 1.0, stepKm = PS * D * RE;
  let cum = 0; const N = 40; for (let i = 1; i <= N; i++) cum += stepKm / 1;
  assert.ok(Math.abs(cum - N * stepKm) < 1e-9, 'g = 1 integrates to the plain distance');

  /* ══ ⚠⚠ AND IT HAS TO BE *WIRED* PER BEARING, which is where the first cut of this round failed.
     `rFor` originally took only the source point, so the surface-wave radius was evaluated at
     `k.phi` — the bearing OF THE SOURCE POINT, not of the ray — and came out identical for every
     direction: measured on Tōhoku at t = 400 s, east and west were both 1441 km, ratio 1.000.
     A circle wearing a path integral's clothes. Both halves of the wiring are asserted. */
  assert.match(s, /const k=K\[i\], r=rFor\(k,b\);/, '_envR passes the RAY bearing into the radius function');
  /* ⚠ (#R241) the ELAPSED TIME moved out of this expression into `_frontT(k)` — the front now leaves
     the broken fault rather than the hypocentre, so «has this piece broken yet» and «how long has it
     been radiating» are two questions and only the first is a per-point one. What this line asserts
     is unchanged and is the whole of its subject: the radius is still a function of the RAY bearing
     `b`, not of the source point's own azimuth. */
  assert.match(s, /const d=_pathDeg\(sw\.v\*_frontT\(k\),b\|\|0\);/,
    'the surface-wave radius is a function of that bearing');
  assert.match(s, /function _frontT\(k\)\{/, '…and the elapsed time has one owner');
  /* ⚠ and a POINT source must go through the per-bearing builder too — `ringLines` takes one radius,
     so routing the no-fault case through it would silently discard the integral again */
  /* ⚠ (#R239) via `train()`, which asks `faultRing()` for the leading edge (and, with a rupture,
     the trailing one). The per-bearing property this line protects is unchanged. */
  assert.match(s, /train\(rad,sw\.col,1\.8\)/,
    'surface fronts always use the per-bearing builder, fault or not');
  /* ══ ⚠⚠ (#R238) THE BODY WAVES NO LONGER KEEP THE CIRCULAR HELPER, AND THAT IS THE FIX ═══════════
     This asserted that P and S go through `ringLines` because 「they have no lateral model, so they
     ARE circles」. They now have one: the crustal legs are corrected over the same land/ocean table
     the surface waves invert (`_bodyStretch`), weighted by the crustal share of the path. That was
     the point — P and S are the two biggest rings on the screen, so leaving them bearing-free by
     construction is most of what 「まだ震央中心の同心円に見える」 was looking at, reported for a
     third round. The reasoning above is preserved verbatim; only its conclusion has changed, and it
     changed because the premise did. Same trap as `ringLines` for the surface waves: one radius
     drawn all the way round would throw the correction away, so both families use the builder. */
  assert.doesNotMatch(s, /ringLines\(epi,rad\(null\)\)/,
    'no front is drawn from a single bearing-free radius any more');
  assert.match(s, /const s=_bodyStretch\(b\|\|0,d,dep\);/, 'the body-wave radius is a function of the bearing too');
  /* the label is placed at the view bearing, so it must read the radius there */
  assert.match(s, /const vb=_viewBearing\(\); const r=rad\(vb\);/, 'the front name reads its own bearing’s radius');
});

/* ── 5 · the playback is a frame, not an 11 Hz timer ────────────────────────────────────────── */
test('R235 wavefronts: playback runs on the shared frame loop and keeps its fractional clock', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /playing=setInterval\(/, 'the 90 ms stepper is gone');
  assert.doesNotMatch(s, /tl\.value=Math\.round\(tSec\)/, 'the slider no longer quantises the clock to whole seconds');
  assert.match(s, /R\.frame\('seismic:play',step\)/, 'it re-arms through the one runtime frame loop (#R234)');
  assert.match(s, /step="0\.01"/, 'the range input can express the fractional value it is given');
  /* 90 ms is 11 Hz; the point of the change is that it was well under a display frame */
  assert.ok(1000 / 90 < 30, 'the old rate (11.1 Hz) was below any display refresh');
});
}

/* ═══ from tests/r237-checks.test.mjs (tests #4 of 8) ═══
    R237 — the air over the disc, the front's resolution, the panel's shape, and the shape of
    string the positional audit cannot see.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap #R235 hit eight
   times and #R236 hit once more. */

/* ── 3 · the wavefront's resolution ─────────────────────────────────────────────────────────────
   「動作は離散的ではなくスムーズにして」 — 144 bearings is 2.5° of arc whatever the zoom. */
test('R237 seismic: the front is densified from the screen, not from a constant', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function _frontSteps\(Rdeg\)/, 'there is a rule');
  assert.doesNotMatch(s, /const NB2=144/, 'and 144 is no longer a constant in the builder');
  assert.match(s, /const NB2=_frontSteps\(R0\)/, 'the rupture envelope asks it');
  /* the floor is the old behaviour, so nothing can regress; the ceiling keeps a phone honest */
  assert.match(s, /Math\.max\(144,\s*Math\.min\(720,\s*n\)\)/, 'bounded by the old value and by 720');
  /* ⚠ the point source goes through the same rule, or 「スムーズに」 is true of one shape only */
  assert.match(s, /_frontSteps\(a\)\/2/, 'the point-source ring is densified by the same rule');
});
}

/* ═══ from tests/r238-checks.test.mjs (tests #3, #4, #5, #6, #7, #8, #9 of 16) ═══
    R238 — the air that was still missing, the front that could only be a circle, the panel that
    read as three alternatives, and the floating things that now have somewhere to go.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. Where a check pins a RELATION rather than a value, it says
    so — #R237's chip constant is exactly what happens when a measurement of one browser is written
    into the source as if it were a fact about all of them. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap that has now been
   hit nine times across #R208…#R237. */

/* ── 2 · ③ the wavefront radius is interpolated, not quantised to the traced samples ────────────
   Measured before the fix: frontDelta('S', 24 km, t) returned 0.8961573° for BOTH t = 30 s and
   t = 60 s — the S front stood still for half a minute and then jumped. That is 「動作は離散的」,
   and neither #R235 (tick rate) nor #R237 (vertex count) touched it. */
test('R238 fronts: frontDelta interpolates between the bracketing samples', () => {
  const s = code(read('js/seismic.js'));
  const i = s.indexOf('function frontDelta');
  assert.ok(i > 0, 'frontDelta exists');
  const body = s.slice(i, i + 900);
  /* the old body was a single max-scan and returned it directly */
  assert.match(body, /const\s+f\s*=\s*\(t\s*-\s*bestT\)\s*\/\s*\(nx\[1\]\s*-\s*bestT\)/,
    'the answer is interpolated linearly in TIME across the one gap that brackets it');
  assert.match(body, /return\s+best\s*\+\s*Math\.max\(0,\s*Math\.min\(1,\s*f\)\)\s*\*\s*\(nx\[0\]\s*-\s*best\)/,
    'and the interpolation is clamped, so it can never overshoot the next sample');
});

/* ⚠ …and the interpolation is exercised, not just spelled. The same shape frontDelta has: a sorted
   (Δ, T) sample list, and the question «how far by t». A staircase answers with a sample; this must
   answer strictly between two of them. */
test('R238 fronts: the interpolation rule is strictly monotone between samples', () => {
  const pts = [[0, 0], [1, 20], [2, 45], [3, 75]];
  const frontDelta = (t) => {
    let best = null, bestT = null, bi = -1;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[1] <= t && (best == null || q[0] > best)) { best = q[0]; bestT = q[1]; bi = i; } }
    if (best == null) return null;
    let nx = null;
    for (let i = bi + 1; i < pts.length; i++) { if (pts[i][0] > best) { nx = pts[i]; break; } }
    if (!nx || !(nx[1] > bestT)) return best;
    const f = (t - bestT) / (nx[1] - bestT);
    return best + Math.max(0, Math.min(1, f)) * (nx[0] - best);
  };
  assert.equal(frontDelta(20), 1, 'a sample time gives that sample exactly');
  const mid = frontDelta(32.5);
  assert.ok(mid > 1 && mid < 2, 'and half-way between two samples the front is half-way between them');
  assert.equal(+mid.toFixed(3), 1.5);
  /* strictly increasing — a staircase would repeat */
  let prev = -1;
  for (let t = 1; t <= 74; t += 1) { const d = frontDelta(t); assert.ok(d > prev, 'the front never stands still at t=' + t); prev = d; }
});

/* ── 3 · ③ the rupture's own front is drawn, because the wavefronts provably cannot carry the shape ─
   t(x) = min_k ( off_k/Vr + dist(k,x)/V ) ≈ d/V + min_k [ off_k·(1/Vr − cos(b−φ_k)/V) ], and every
   bracket is ≥ 0 while Vr ≤ V, so the first-arrival isochron is exactly the hypocentre's circle. */
test('R238 fronts: the envelope collapses to the hypocentre for every shipped wave speed', () => {
  const BETA = 3500, VR = 0.75 * BETA;
  for (const V of [6100, BETA, 3500, 4400]) {
    let worst = Infinity;
    for (let db = 0; db <= 180; db += 5) worst = Math.min(worst, 1 / VR - Math.cos(db * Math.PI / 180) / V);
    assert.ok(worst > 0, 'with Vr=' + VR + ' and V=' + V + ' the hypocentre always wins, so the wavefront is a circle');
  }
});

test('R238 fronts: the broken part of the rupture is emitted as its own feature', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /properties:\{kind:'rup'\}/, 'the broken area is drawn');
  assert.match(s, /properties:\{kind:'rupedge'\}/, 'and its leading edge is drawn');
  assert.match(s, /const\s+rB\s*=\s*\(VRUP_KMS\s*\*\s*tSec\)\s*\/\s*\(D\s*\*\s*RE\)/,
    'the break runs at the rupture velocity, from the nucleation point');
  /* both layers must exist, or the features are computed and never seen (#R235's defect shape) */
  assert.match(s, /id:'seis-rup-fill'/, 'the fill layer is registered');
  assert.match(s, /id:'seis-rup-edge'/, 'the edge layer is registered');
});

/* ── 4 · ③ the body waves cross the crust they are actually crossing ────────────────────────────
   P and S were bearing-INDEPENDENT by construction, so two of the four rings were exact circles
   whatever the reader drew, which is most of what 「まだ震央中心の同心円に見える」 was looking at. */
test('R238 fronts: P and S go through the per-bearing builder and the crustal correction', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /function\s+_bodyStretch\s*\(brg,deltaDeg,depKm\)/, 'the correction exists');
  assert.match(s, /return\s+deltaDeg\s*\*\s*\(1-wC\+wC\*g\)/, 'and it is applied to the crustal SHARE only');
  /* the old line drew a plain ring for a point source and threw the bearing away */
  const i = s.indexOf('PH.forEach');
  const blk = s.slice(i, i + 700);
  assert.doesNotMatch(blk, /fault\?faultFrontLines\(rad\):\(\(rad\(null\)/,
    'the point-source shortcut that ignored the bearing must be gone');
  /* ⚠ (#R239) SAME CLAIM, NEW SPELLING. #R238 wrote `const lines = faultFrontLines(rad)`; #R239 gave
     each phase a leading edge, a trailing edge and the band between them, so the call is
     `train(rad, …)` — which builds BOTH rings through `faultRing()`, i.e. through the per-bearing
     builder this test is about. The property being asserted is unchanged: no phase gets a
     bearing-independent shortcut. (#R203's rule: move the assertion, say why.) */
  assert.match(blk, /train\(rad,ph\.col,ph\.w\)/, 'both body waves go through the per-bearing builder');
  assert.match(s, /function faultRing\(rFor,side\)/, 'and that builder is one function for both edges');
  assert.match(s, /function faultFrontLines\(rFor\)\{\s*const r=faultRing\(rFor,'front'\)/,
    'the old entry point is still there, as the leading edge of that one builder');
});

/* the correction is bounded — it must never turn into a decorative wobble, and the prune below
   depends on that bound being true */
test('R238 fronts: the crustal correction cannot exceed the mask ratio it is built from', () => {
  const s = code(read('js/seismic.js'));
  const g = Number((s.match(/let\s+OCEAN_G\s*=\s*([\d.]+)/) || [])[1]);
  assert.ok(g > 1 && g < 1.15, 'OCEAN_G is the only source of azimuthal spread and is ' + g);
  const slack = Number((s.match(/const\s+_PRUNE_SLACK\s*=\s*([\d.]+)/) || [])[1]);
  assert.ok(slack > g, 'the prune slack (' + slack + ') must clear the largest factor the path can apply (' + g + ')');
});

/* ── 5 · ③ the per-frame work is cut where the answer is already known ──────────────────────────
   Measured: 25 source points survive the prune to 1 at t = 60 s, so the bearing loop does 1/25 of
   the work it did. The cache and the carried trig are the other half. */
test('R238 fronts: the source points are cached and carry their own trig', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /let\s+_spCache\s*=\s*null,\s*_spKey\s*=\s*''/, 'the source points are cached');
  assert.match(s, /if\(_spCache&&_spKey===key\)\s*return\s+_spCache/, '…and the cache is actually consulted');
  assert.match(s, /k\.cA\s*=\s*Math\.cos\(k\.off\*D\);\s*k\.sA\s*=\s*Math\.sin\(k\.off\*D\)/,
    'cos(off) and sin(off) are computed once per point, not once per (point, bearing)');
  const i = s.indexOf('function _envR');
  const body = s.slice(i, i + 420);
  assert.doesNotMatch(body, /Math\.cos\(k\.off\*D\)/, '_envR must not recompute them per bearing');
  assert.match(body, /const\s+A\s*=\s*k\.cA/, 'it reads the carried value');
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #2, #3 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */

/* ══ ⚠⚠⚠ (#R241) THE BLEND-RAMP TEST THAT STOOD HERE WAS OVERTURNED BY THE READER ════════════════
   It pinned #R240's answer to 「ある程度までズームインすると途端に見えなくなってしまう」: hold the
   ramp FLAT to z11 and keep 0.55 satellite / 0.80 dark map / 0.15 light map. The next round's report
   was the same complaint, sharper — 「ある程度までズームしたらいきなりもやが消えるものさらに不自然」
   — with 「大気にもやがかかりすぎ。地図をちゃんと見せろ」 and 「衛生写真ではあっても、標準マップでは
   大気はなし」 beside it. Measured with real screenshots (x/r241-atm-sat-z11.png vs -z12.png): the
   z11 frame is milk over the Sahara and z12 is raw imagery, ONE zoom apart, because maplibre 5.24's
   `case 'globe'` interpolates vertical-perspective→mercator across z11→z12 and multiplies
   `atmosphere-blend` by that transition. Holding the ramp up made the step BIGGER, not smaller.
   ⚠ THE ASSERTIONS ARE NOT DELETED, THEY MOVED AND REVERSED — #R241 ④ (tests/hazard-other-sky-atmosphere-checks) pins the new
   contract (map basemap: no air at all, both owners; satellite: one curve, zero BY z11). A test
   whose subject a reader has overruled has to say so where it used to stand, or the next round
   reads its absence as an oversight. */

/* ══ ② THE WAVEFRONTS — a drawn rupture reaches the picture from t = 0 ═════════════════════════
   Measured on the shipped build with a 500 km rupture: band and ringBack were 0 until t = 400 s,
   because T_last does not exist anywhere until the last piece of the fault has broken. */
test('R240 ② while the fault is still tearing, the band is bounded by the broken fault', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /let brokeRing=null;/, 'the broken outline is kept for the band as well as the fill');
  assert.match(s, /brokeRing=brokePts\.concat\(\[brokePts\[0\]\]\);/, '…in continuous longitudes');
  const train = s.slice(s.indexOf('const train=(rad,col,w)=>'), s.indexOf('const train=(rad,col,w)=>') + 1400);
  assert.match(train, /const back=faultRing\(rad,'back'\)/, 'the trailing edge is still tried first');
  assert.match(train, /else if\(brokeRing&&brokeRing\.length>3\)/, 'and the source bounds it when there is none yet');
  assert.match(train, /coordinates:\[front\.ring,brokeRing\.slice\(\)\.reverse\(\)\]/, 'the hole is the broken fault');
});

test('R240 ② the front carries the rupture’s directivity, and only when there is a rupture', () => {
  const s = code(R('js/seismic.js'));
  assert.match(s, /function emitFrontArcs\(feats,r,col,w\)/, 'the front is emitted arc by arc');
  const fn = s.slice(s.indexOf('function emitFrontArcs'), s.indexOf('function emitFrontArcs') + 1400);
  assert.match(fn, /fdAt\(/, 'each arc asks the SAME directivity the field is painted from');
  assert.match(fn, /1\/Math\.sqrt\(/, 'peak goes as 1/√Fd (Ben-Menahem’s apparent duration)');
  assert.match(fn, /kind:'ring'/, 'they are still ring features');
  const train = s.slice(s.indexOf('const train=(rad,col,w)=>'), s.indexOf('const train=(rad,col,w)=>') + 1600);
  assert.match(train, /if\(!\(hasRupture&&emitFrontArcs\(feats,front,col,w\)\)\) emit\(front\.windows/,
    'with no rupture drawn the ring is one feature, exactly as before');
  assert.match(s, /'line-opacity':\['coalesce',\['get','o'\],0\.92\]/, 'a whole ring keeps the old constant');
});
}

/* ═══ from tests/r241-checks.test.mjs (tests #5 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;

/* ══ ② THE WAVEFRONT LEAVES THE RUPTURE ════════════════════════════════════════════════════════ */

test('R241 ② the front radiates from the broken fault, not from the hypocentre', () => {
  const s = code(R('js/seismic.js'));
  /* the elapsed time has ONE owner, and it is not the per-source-point delay any more */
  assert.match(s, /function _frontT\(k\)\{ return \(k&&k\.delay>tSec\)\?0:Math\.max\(0,tSec\); \}/,
    'the front runs for the whole elapsed time from every piece that has broken');
  /* both wave families ask the same two questions: has this piece broken, and how long has it run */
  assert.match(s, /if\(k&&k\.delay>tSec\) return null;\s+const d=frontDelta\(ph\.k,dep,_frontT\(k\)\)/,
    'body waves: unbroken pieces do not radiate');
  assert.match(s, /const rad=\(k,b\)=>\{ if\(k&&k\.delay>tSec\) return null;\s*\n?\s*const d=_pathDeg\(sw\.v\*_frontT\(k\),b\|\|0\)/,
    'surface waves: the same rule');
  /* ⚠ THE OLD FORM MUST BE GONE. `tSec - k.delay` is what collapses the envelope to the hypocentre's
     own circle for every Vr ≤ V — #R238's theorem — and three rounds shipped that circle. */
  assert.doesNotMatch(s, /tSec-\(\(k&&k\.delay\)\|\|0\)/, "the first-arrival form must not come back");

  /* ⚠ AND THE OUTLINE IS WALKED. A rupture rectangle is FOUR points, so «sample every
     ring.length/24-th vertex» sampled four corners and nothing along the 500 km edges: measured, the
     front at t = 30 s was byte-identical to a point source's. */
  assert.match(s, /function _walkRing\(R2,n\)/, 'the outline is densified before it is sampled');
  assert.match(s, /const R2=_walkRing\(fault\.ring,28\), step=1;/, 'the source points walk it');
  assert.match(s, /const R2=_walkRing\(fault\.ring,48\)/, 'and so does the broken-region outline');

  /* the panel has ONE distance, and it is the distance to the rupture — or the ring sweeps over a
     city while the table still prints a time measured from a point 500 km away */
  assert.match(s, /const km=distKmTo\(lng,lat\);\s*\n\s*const deg=km\/\(D\*RE\), kmEpi=km;/,
    'the table measures from the rupture, like the picture and like the ground-motion model');
});
}
