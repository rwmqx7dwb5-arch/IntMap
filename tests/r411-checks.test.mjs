/* ============================================================================
 *  R411 — three reports about the aircraft layer, and what each one turned out to be
 * ----------------------------------------------------------------------------
 *  「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。
 *    また、より低ズームでもより多くの航空機が表示されるように。」
 *  「いや実際の飛行機の向きのままにしろってこと。」
 *  「それに、不透明度100%が全然100%じゃないのを辞めろ。」
 *
 *  The first sentence is #R401's, word for word, and #R401 is why it came back: it answered the
 *  tilt by drawing the direction a DECAL LYING ON THE GROUND would run, which is what a ground plane
 *  seen edge-on does to a set of bearings. Measured over Japan at z6.2, 400 aircraft:
 *
 *      pitch                         0°     30°     60°     75°     85°
 *      within 20° of horizontal     121     128     181     287     315   of 400
 *      axial concentration        0.238   0.291   0.485   0.711   0.768
 *
 *  …against a near-uniform 0.214 in the reported tracks themselves. Four in five aircraft pointing
 *  the same way, and not one of them flying that way.
 *
 *  The other two reports were both real and neither was where it looked:
 *    · the low-zoom shortage was not the tiles, which #R401 fixed — it was the test deciding which
 *      aircraft are INSIDE the view, written as two ordered comparisons on a bbox that MapLibre
 *      reports UNWRAPPED below about z4 (①);
 *    · 「100%が全然100%じゃない」 was not the opacity plumbing, which carries 1.0 end to end
 *      (measured: at the slider's 100 %, 82.6 % of 3,780 published aircraft had alpha exactly 1.0).
 *      It was the MARK: a six-pixel anti-aliased ramp across an outline whose parts are narrower
 *      than that, so the fill never bottomed out and nothing was ever opaque (③).
 *
 *  ⚠ EVERY SOURCE CHECK READS CODE ONLY (scripts/code-only.mjs), because thirteen times now a check
 *  in this repository has matched its own prose, and this file's prose is full of what it greps for.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const code = (rel) => codeOnly(readLF(join(ROOT, rel)));

globalThis.window = globalThis.window || {};
await import('../js/aviation-model.js');
const M = globalThis.IntMapAviationModel || globalThis.window.IntMapAviationModel;

/* ── ① THE BOX THE APP ACTUALLY SENDS ────────────────────────────────────────────────────────
   These four are what `map.getBounds()` returned in the running application, at the zooms named.
   Two of them are outside [−180, 180] — that is not a fault in MapLibre, it is what a bounding box
   MEANS for a camera that has gone past the seam — and the ordered comparisons could not read them.
   `meridiansKept` counts the 72 five-degree meridians the filter admits, which is the same quantity
   the aircraft themselves are subject to. */
const VIEWS = [
  { name: 'the whole world at z1', bbox: [-180, -63.463, 180, 90], before: 72, after: 72 },
  { name: 'Japan at z3', bbox: [43.568, -15.743, 232.432, 75.347], before: 28, after: 38 },
  { name: 'North America at z3', bbox: [-197.494, -12.343, -2.506, 76.439], before: 35, after: 39 },
  { name: 'Japan at z6', bbox: [130.156, 30.863, 140.844, 38.182], before: 2, after: 2 },
];

/* what supabase/functions/aviation-feed/index.ts did before this round, kept here so the claim
   "this recovers aircraft" is a comparison and not an assertion about one number */
function orderedComparisons(lo, w, e) {
  if (e < w) { return (lo >= w || lo <= e); }
  return !(lo < w || lo > e);
}
const MERIDIANS = [];
for (let lo = -175; lo <= 180; lo += 5) MERIDIANS.push(lo);

test('R411 ① a longitude is an angle, so the view keeps the sky on both sides of the seam', () => {
  assert.equal(typeof M.lonInSpan, 'function', 'the model declares the containment test');
  for (const v of VIEWS) {
    const [w, , e] = v.bbox;
    const before = MERIDIANS.filter((lo) => orderedComparisons(lo, w, e)).length;
    const after = MERIDIANS.filter((lo) => M.lonInSpan(lo, w, e)).length;
    assert.equal(before, v.before, v.name + ': the ordered comparisons kept ' + before + ' meridians');
    assert.equal(after, v.after, v.name + ': the angle test keeps ' + after + ' meridians');
    /* ⚠ THE POINT OF THE ROUND, AS A COMPARISON. A wide view must gain and a narrow one must not
       change — a test that only said "≥ before" would pass a function that returns true always. */
    assert.ok(after >= before, v.name + ': the fix never keeps FEWER');
  }
  const wide = VIEWS.filter((v) => v.after > v.before);
  assert.ok(wide.length >= 2, 'and at least two of the measured views actually gained sky');
});

test('R411 ① b the seam is not a special case, and a span is not an interval', () => {
  /* a box that really does straddle the antimeridian still EXCLUDES the far side */
  assert.equal(M.lonInSpan(175, 170, -170), true, '175°E is inside 170°E … 170°W');
  assert.equal(M.lonInSpan(-175, 170, -170), true, 'and so is 175°W');
  assert.equal(M.lonInSpan(0, 170, -170), false, 'but 0°E is not — a 20° span is still 20° wide');
  /* a narrow ordinary box is unchanged */
  assert.equal(M.lonInSpan(135, 130.156, 140.844), true);
  assert.equal(M.lonInSpan(120, 130.156, 140.844), false);
  assert.equal(M.lonInSpan(-120, 130.156, 140.844), false);
  /* the unwrapped views the application reports, aircraft by aircraft rather than by meridian */
  assert.equal(M.lonInSpan(-150, 43.568, 232.432), true, 'the eastern Pacific IS inside Japan at z3');
  assert.equal(M.lonInSpan(10, 43.568, 232.432), false, '…and western Europe is not');
  assert.equal(M.lonInSpan(170, -197.494, -2.506), true, 'the western Pacific IS inside N. America at z3');
  assert.equal(M.lonInSpan(30, -197.494, -2.506), false, '…and Africa is not');
  /* a camera zoomed out past one whole turn covers the planet rather than a sliver of it */
  assert.equal(M.lonInSpan(-33, -200, 200), true, 'a span of 400° is the whole planet');
  assert.equal(M.lonInSpan(77, -180, 180), true, 'and so is exactly 360°');
  /* nothing is inside a box made of nonsense */
  assert.equal(M.lonInSpan(NaN, 0, 10), false);
  assert.equal(M.lonInSpan(5, NaN, 10), false);
});

test('R411 ① c the Edge Function asks the model, once, and no longer compares longitudes in order', () => {
  const src = code('supabase/functions/aviation-feed/index.ts');
  /* ⚠ `assert.ok(!re.test(…))`, NOT assert.doesNotMatch: a failing doesNotMatch prints the whole
     subject, and this subject is a thousand lines of Edge Function (the #R390 lesson). */
  const absent = (re, msg) => assert.ok(!re.test(src), msg);

  assert.match(src, /MODEL\.lonInSpan\(rec\.lon,\s*w,\s*e\)/,
    'the viewport channel filters through the shared model');
  /* ⚠ ONE COPY. The predicate lived in two places — the first collection and the re-collection a
     stale box does after its tiles land — and fixing the one the report pointed at left the other,
     which is the path a wide view actually goes down. Counting the declaration is what stops a
     third from appearing. */
  const calls = (src.match(/MODEL\.lonInSpan\(/g) || []).length;
  assert.equal(calls, 1, 'and does so from ONE place (found ' + calls + ')');
  assert.match(src, /const collectBox = \(\) => \{/, 'the collection is one declaration');
  const collects = (src.match(/= collectBox\(\);/g) || []).length;
  assert.equal(collects, 2,
    'and BOTH users call it — the first pass and the re-collection after a stale box waits (found '
    + collects + ')');
  /* the exact shapes that were wrong, so a later round cannot reintroduce them beside the call */
  absent(/lo\s*<\s*w\s*\|\|\s*lo\s*>\s*e/, 'the ordered comparison on longitude is gone');
  absent(/if\s*\(e\s*<\s*w\)\s*\{\s*if\s*\(!\(lo\s*>=\s*w/,
    'and so is the antimeridian special case it needed');
});

/* ── ② THE MARK'S ANGLE IS THE MAP'S ROTATION, NOT ITS TILT ──────────────────────────────────
   The pixels are tests/r379.spec.js's — a source check cannot see a rendered frame. What is here is
   the SHAPE of the derivation, i.e. the three things a later round would have to keep for that test
   to be measuring the same claim: three projections, a step east and a step north (not a step along
   the track), and the polar rotation subtracted from the track rather than replacing it. */
test('R411 ② the vertex shader takes a step EAST and a step NORTH, and subtracts their rotation', () => {
  const src = code('js/aircraft-points.js');
  const vert = /const VERT = `([\s\S]*?)`;/.exec(src);
  assert.ok(vert, 'the vertex shader source is still a template literal named VERT');
  const v = vert[1];
  const projections = (v.match(/projectTileFor3D\s*\(/g) || []).length;
  assert.equal(projections, 3,
    'the aircraft, one step east and one step north (found ' + projections + ')');
  assert.match(v, /projectTileFor3D\(p \+ vec2\(u_probe, 0\.0\), e\)/, 'the east step');
  assert.match(v, /projectTileFor3D\(p \+ vec2\(0\.0, -u_probe\), e\)/,
    'the north step — mercator y grows SOUTHWARD, so north is minus');
  /* ⚠ THE DECAL ANSWER, NAMED SO IT CANNOT COME BACK BY ACCIDENT. #R401's step was along the
     track; that is the one thing this round is not. */
  assert.doesNotMatch(v, /sin\(trk\)/, 'no step is taken along the track itself');
  assert.match(v, /vec2\(dE\.x \+ dN\.y, dE\.y - dN\.x\)/,
    'the rotation of the polar factor of [dE dN]');
  assert.match(v, /v_rot = trk - atan\(/, 'and it is SUBTRACTED from the track, not put in its place');
  /* all three projections are guarded, because a point at or behind the eye has no divide */
  assert.match(v, /here\.w > 0\.0 && pe\.w > 0\.0 && pn\.w > 0\.0/, 'all three are guarded on w');
});

test('R411 ② b the Cesium engine answers the same question the same way', () => {
  const src = code('js/cesium-engine.js');
  const fn = /_airHeading\(p,track\)\{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(fn, '_airHeading is still a method of the engine');
  const b = fn[1];
  /* it feeds the screen derivative EAST and NORTH rather than the track direction … */
  assert.match(b, /sx\(ex,ey,ez\)/, 'the east column');
  assert.match(b, /sy\(nx,ny,nz\)/, 'the north column');
  assert.doesNotMatch(b, /ex\s*\*\s*s\s*\+\s*nx\s*\*\s*c/,
    'the track direction is no longer what gets projected');
  /* … takes the same polar rotation … */
  assert.match(b, /const rx=Ex\+Ny, ry=Ey-Nx;/, 'the same polar rotation as the MapLibre shader');
  /* … and returns it MINUS the track, because Cesium measures its billboard rotation the other way */
  assert.match(b, /return th-track;/, 'and Cesium\'s rotation runs the other way round');
  /* the perspective term #R379 added is still there — dropping it is an 18° error in the flight sim */
  assert.match(b, /da\*f-a\*\(/, 'the perspective term survives');
});

/* ── ② c …AND IT IS MEASURED, NOT JUST SHAPED ────────────────────────────────────────────────
   The MapLibre side's angle can only be seen in a rendered frame (tests/r379.spec.js draws it).
   Cesium's is pure arithmetic on the camera's basis, so it can be ASKED here — and the body asked
   is LIFTED OUT OF THE SHIPPED FILE rather than retyped, which is the difference between a test and
   a second copy of the thing under test. The camera below is built from first principles: a station
   over (35 N, 135 E) tilted `pitch` from straight down, looking along compass `bearing`. */
function shippedAirHeading() {
  const src = code('js/cesium-engine.js');
  const m = /_airHeading\(p,track\)\{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(m, '_airHeading is still a method of the engine');
  const Cesium = { SceneMode: { SCENE2D: 2, COLUMBUS_VIEW: 1, SCENE3D: 3 } };
  // eslint-disable-next-line no-new-func
  const f = new Function('Cesium', 'self', 'p', 'track', 'return (function(){' + m[1] + '}).call(self)');
  return (cam, p, track) => f(Cesium, { _camera: cam, _scene: { mode: 3 } }, p, track);
}
const D2R = Math.PI / 180, RE = 6378137;
function station(lat0, lon0, pitch, bearing, hM) {
  const la = lat0 * D2R, lo = lon0 * D2R;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [up[1] * e[2] - up[2] * e[1], up[2] * e[0] - up[0] * e[2], up[0] * e[1] - up[1] * e[0]];
  const s = Math.sin(bearing * D2R), c = Math.cos(bearing * D2R);
  const g = [e[0] * s + n[0] * c, e[1] * s + n[1] * c, e[2] * s + n[2] * c];   /* screen-up on the ground */
  const sp = Math.sin(pitch * D2R), cp = Math.cos(pitch * D2R);
  const F = [-up[0] * cp + g[0] * sp, -up[1] * cp + g[1] * sp, -up[2] * cp + g[2] * sp];
  const U = [up[0] * sp + g[0] * cp, up[1] * sp + g[1] * cp, up[2] * sp + g[2] * cp];
  const R = [F[1] * U[2] - F[2] * U[1], F[2] * U[0] - F[0] * U[2], F[0] * U[1] - F[1] * U[0]];
  const d = RE + hM;
  const E = [up[0] * d - F[0] * hM * 3, up[1] * d - F[1] * hM * 3, up[2] * d - F[2] * hM * 3];
  return { rightWC: { x: R[0], y: R[1], z: R[2] }, upWC: { x: U[0], y: U[1], z: U[2] },
    directionWC: { x: F[0], y: F[1], z: F[2] }, positionWC: { x: E[0], y: E[1], z: E[2] } };
}
const onSphere = (lat, lon) => ({
  x: RE * Math.cos(lat * D2R) * Math.cos(lon * D2R),
  y: RE * Math.cos(lat * D2R) * Math.sin(lon * D2R),
  z: RE * Math.sin(lat * D2R),
});
const norm360 = (d) => ((d % 360) + 360) % 360;
const gap360 = (a, b) => { const x = Math.abs(norm360(a) - norm360(b)); return x > 180 ? 360 - x : x; };

test('R411 ② c the Cesium mark runs along track − bearing at every tilt, to four decimals', () => {
  const heading = shippedAirHeading();
  /* Cesium draws the sprite's top at (−sin rotation, cos rotation), so the SCREEN BEARING of the
     mark — clockwise from screen-up, the same convention the track uses — is minus the rotation. */
  const screenBearing = (cam, trk) => norm360(-heading(cam, onSphere(35, 135), trk * D2R) * 180 / Math.PI);
  const TRACKS = [0, 45, 90, 135, 180, 270, 315];
  let worst = 0, worstAt = '';
  for (const [pitch, bearing] of [[0, 0], [30, 0], [60, 0], [85, 0], [0, 45], [60, 45], [85, 135]]) {
    const cam = station(35, 135, pitch, bearing, 600000);
    for (const trk of TRACKS) {
      const g = gap360(screenBearing(cam, trk), trk - bearing);
      if (g > worst) { worst = g; worstAt = `track ${trk} at pitch ${pitch}, bearing ${bearing}`; }
    }
  }
  /* ⚠ FOUR DECIMALS, NOT A TOLERANCE. The aircraft is at the camera's nadir, where the answer is
     exact; slack here would hide precisely the failure this round is about. */
  assert.ok(worst < 1e-4, 'the mark runs along track − bearing everywhere (worst ' + worst.toFixed(6) + '° at ' + worstAt + ')');

  /* ⚠ THE CONTROL. The decal answer — the track's own projected direction — must MISS by tens of
     degrees at tilt, or this test is not separating the two. */
  const cam = station(35, 135, 85, 0, 600000);
  const R = cam.rightWC, U = cam.upWC, F = cam.directionWC, E = cam.positionWC;
  const p = onSphere(35, 135);
  const decal = (trk) => {
    const t = trk * D2R, mlen = Math.hypot(p.x, p.y, p.z);
    const ux = p.x / mlen, uy = p.y / mlen, uz = p.z / mlen;
    let ex = -uy, ey = ux; const eh = Math.hypot(ex, ey); ex /= eh; ey /= eh;
    const nx = -uz * ey, ny = uz * ex, nz = ux * ey - uy * ex;
    const dx = ex * Math.sin(t) + nx * Math.cos(t), dy = ey * Math.sin(t) + ny * Math.cos(t), dz = nz * Math.cos(t);
    const da = dx * R.x + dy * R.y + dz * R.z, db = dx * U.x + dy * U.y + dz * U.z, df = dx * F.x + dy * F.y + dz * F.z;
    const vx = p.x - E.x, vy = p.y - E.y, vz = p.z - E.z;
    const a = vx * R.x + vy * R.y + vz * R.z, b = vx * U.x + vy * U.y + vz * U.z, f = vx * F.x + vy * F.y + vz * F.z;
    return norm360(Math.atan2(da * f - a * df, db * f - b * df) * 180 / Math.PI);
  };
  assert.ok(gap360(decal(45), 45) > 20,
    'at pitch 85 the decal answer puts a 045° track ' + gap360(decal(45), 45).toFixed(1) + '° away from it');
  assert.ok(gap360(decal(45), decal(135)) < 60,
    'and squeezes 045° and 135° to within ' + gap360(decal(45), decal(135)).toFixed(1) + '° of each other');
});

/* ── ③ AT 100 % THE MARK IS ACTUALLY OPAQUE ──────────────────────────────────────────────────
   This is arithmetic, not pixels: the fragment shader's own expressions, evaluated over the real
   outline in js/plane-glyph.js at v_col.a = 1 and u_opacity = 1. Reading the `aa` line OUT OF THE
   SHIPPED SOURCE is what makes it a gate rather than a copy — change the shader and this changes
   with it; loosen the shader and this goes red. */
function markCoverage(aaOf, vpx, G) {
  const P = G.OUTLINE.map((q) => [q[0] / G.HALF, q[1] / G.HALF]);
  const HS = G.SDF_HALF_STROKE, SA = G.STROKE_ALPHA, aa = aaOf(vpx);
  const sd = (px, py) => {
    let d = (px - P[0][0]) ** 2 + (py - P[0][1]) ** 2, s = 1, j = P.length - 1;
    for (let i = 0; i < P.length; i++) {
      const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1];
      const wx = px - P[i][0], wy = py - P[i][1];
      const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
      const bx = wx - ex * t, by = wy - ey * t;
      d = Math.min(d, bx * bx + by * by);
      const c1 = py >= P[i][1], c2 = py < P[j][1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      j = i;
    }
    return s * Math.sqrt(d);
  };
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  let peak = 0, solid = 0, drawn = 0;
  const N = 240;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const d = sd((ix + 0.5) / N * 2 - 1, (iy + 0.5) / N * 2 - 1);
      const band = ss(aa, -aa, Math.abs(d) - HS) * SA;
      const cov = band + ss(aa, -aa, d) * (1 - band);
      if (cov > peak) peak = cov;
      if (cov > 0.02) { drawn++; if (cov >= 0.99) solid++; }
    }
  }
  return { peak, solidShare: drawn ? solid / drawn : 0 };
}

test('R411 ③ the mark reaches full opacity at the size the layer actually draws it', async () => {
  await import('../js/plane-glyph.js');
  const G = globalThis.window.IntMapPlaneGlyph;
  assert.ok(G && G.OUTLINE && G.OUTLINE.length === 18, 'the one declaration of the mark is readable');

  /* the shipped expression, lifted out of the fragment shader rather than retyped */
  const src = code('js/aircraft-points.js');
  const frag = /const FRAG = `([\s\S]*?)`;/.exec(src);
  assert.ok(frag, 'the fragment shader source is still a template literal named FRAG');
  const line = /float aa = ([^;]+);/.exec(frag[1]);
  assert.ok(line, 'the anti-aliasing half-width is still one declaration named aa');
  const expr = line[1].replace(/\bmax\(/g, 'Math.max(').replace(/\bmin\(/g, 'Math.min(');
  // eslint-disable-next-line no-new-func
  const aaOf = new Function('v_px', 'return ' + expr + ';');

  /* ⚠ ELEVEN. Not 60, which is what tests/r379.spec.js draws its probe at, and not 128: the layer's
     own default sizePx is 11 and its ramp runs 3.5 … 43, so a claim made at a probe size would have
     been green throughout the defect (the six-pixel edge did reach 1.0 by v_px 18). The size a
     reader actually sees is the size this has to be true at. */
  const at11 = markCoverage(aaOf, 11, G);
  assert.ok(at11.peak >= 0.999,
    'at v_px 11 the mark reaches full coverage somewhere (peak ' + at11.peak.toFixed(3) + ')');
  assert.ok(at11.solidShare > 0.05,
    'and a real share of it is opaque, not one lucky texel (' + (100 * at11.solidShare).toFixed(1) + '%)');
  for (const vpx of [8, 14, 22, 40]) {
    const c = markCoverage(aaOf, vpx, G);
    assert.ok(c.peak >= 0.999, 'at v_px ' + vpx + ' too (peak ' + c.peak.toFixed(3) + ')');
  }

  /* ⚠ THE CONTROL, BECAUSE A CHECK THAT HAS NEVER BEEN RED IS A CHECK NOBODY HAS READ. The same
     arithmetic under #R341's expression must FAIL the assertions above — otherwise this file is
     measuring something that was never the defect. */
  const old = markCoverage((v) => Math.max(0.06, 3.0 / Math.max(v, 1)), 11, G);
  assert.ok(old.peak < 0.99,
    'the three-pixel edge could not be opaque anywhere at v_px 11 (peak ' + old.peak.toFixed(3) + ')');
  assert.equal(old.solidShare, 0, 'not one pixel of the mark');

  /* …and the floor mattered as much as the slope: a constant term keeps the mark soft at every
     size, which is why zooming in never made it solid either. */
  const oldBig = markCoverage((v) => Math.max(0.06, 3.0 / Math.max(v, 1)), 64, G);
  const newBig = markCoverage(aaOf, 64, G);
  assert.ok(newBig.solidShare > oldBig.solidShare * 1.5,
    'and a large mark is markedly more solid than the floor allowed ('
    + (100 * oldBig.solidShare).toFixed(1) + '% → ' + (100 * newBig.solidShare).toFixed(1) + '%)');
});

test('R411 ③ b the freshness fade is still there, and is still the only thing that dims an aircraft', () => {
  /* ⚠ WHAT WAS NOT THE DEFECT, PINNED SO THE NEXT ROUND DOES NOT "FIX" IT. §25.2 item 9 fades a
     stale aircraft rather than dropping it, and that fade rides in the colour's alpha. Measured at
     the slider's 100 %: 3,121 of 3,780 published aircraft carried alpha exactly 1.0, 348 carried
     0.72 and 311 carried 0.40 — a mean of 0.925, which is the fade doing its job and not an opacity
     control that leaks. */
  const src = code('src/aviation-worker.js');
  assert.match(src, /out\[o \+ 3\] = staleMul;/, 'the alpha a packed aircraft carries is its freshness');
  assert.match(src, /fresh === 'live' \? 1 :/, 'and a live aircraft carries exactly 1');
  const cloud = code('js/aircraft-points.js');
  assert.match(cloud, /a_col\.a \* u_opacity/, 'the slider multiplies it once');
  assert.doesNotMatch(cloud, /u_opacity\s*\*\s*0\.\d/, 'and nothing scales the slider on the way in');
});
