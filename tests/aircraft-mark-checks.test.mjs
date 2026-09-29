/* ============================================================================
 *  IntMap · the aircraft MARK — its angle, its squash and its opacity (js/aircraft-points.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from the mark halves of tests/r401-checks.test.mjs (⑤⑥), tests/r411-checks.test.mjs
 *  (②–③b) and tests/r434-checks.test.mjs (①–③b): the same report 「地図を傾けても、航空レイヤーの
 *  飛行機アイコンが同じ向きなのを修正して」 answered three times, each round keeping part of the 2×2
 *  the next one completed. The OTHER half of those rounds — which sky the viewport asks about — is
 *  tests/aviation-feed-checks.test.mjs, together with #R401's full header.
 *  ⚠ The pixels are tests/r379.spec.js's — a source check cannot see a rendered frame. Original
 *  headers follow.
 * ==========================================================================*/
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
 *      pitch                         0°     30°     60°     75°     78°
 *      within 20° of horizontal     121     128     181     287     315   of 400
 *      axial concentration        0.238   0.291   0.485   0.711   0.768
 *
 *  …against a near-uniform 0.214 in the reported tracks themselves. Four in five aircraft pointing
 *  the same way, and not one of them flying that way.
 *  ⚠ 78° is where the application stops (js/view-controls.js `STANDARD`); asking for 85 lands there
 *  for any reader who has not switched the limit off, which is what the first version of this table
 *  did not know when it wrote 85.
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
/* ============================================================================
 *  R434 — the aircraft mark tilts with the map, and a wide view buys new sky
 * ----------------------------------------------------------------------------
 *  「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。傾けてるのに上から
 *    見たときとおなじとかあほかボケ。また、より低ズームでもより多くの航空機が表示されるように。」
 *
 *  THE SAME TWO SENTENCES FOR THE THIRD TIME (#R401, #R411, here), and the first one is now
 *  unambiguous: the mark must not be the picture it is at pitch 0. Both earlier rounds used HALF of
 *  the same 2×2 — #R401 kept the projected ANGLE and left the silhouette its full plan-view size,
 *  #R411 kept only the rotation, which pure pitch does not move at all. Measured in the running
 *  application with #R411's shader (tests/r379.spec.js, probe at the canvas centre, sprite 128 px):
 *
 *      pitch                       0°       60°
 *      drawn angle              45.0°     45.0°      ← the report, as one number
 *      the projection says      45.0°     63.5°
 *      mark's own area        1368 px   1368 px
 *
 *  Not "close to" the flat picture: THE flat picture. What ①–③ below pin is the whole transform —
 *  the plan-form lying in the aircraft's own horizontal plane — together with the one thing that
 *  must not follow the projection all the way, which is a mark squashed thinner than the width at
 *  which this shader stops drawing an aeroplane at all.
 *
 *  ④–⑥ are the second sentence. The viewport channel's budget is unchanged, because the provider's
 *  is; what was wrong is that BOTH halves of "spend it on what?" were decided by the wrong quantity.
 *
 *  ⚠ EVERY SOURCE CHECK READS CODE ONLY (scripts/code-only.mjs) — this file's own prose contains
 *  most of what it greps for.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const code = (rel) => codeOnly(readLF(join(ROOT, rel)));

globalThis.window = globalThis.window || {};           /* js/plane-glyph.js publishes on window (#R411 ③) */

const CLOUD = code('js/aircraft-points.js');
const vertOf = () => {
  const m = /const VERT = `([\s\S]*?)`;/.exec(CLOUD);
  assert.ok(m, 'the vertex shader source is still a template literal named VERT');
  return m[1];
};
const fragOf = () => {
  const m = /const FRAG = `([\s\S]*?)`;/.exec(CLOUD);
  assert.ok(m, 'the fragment shader source is still a template literal named FRAG');
  return m[1];
};
/* a GLSL scalar expression, as a JS function — the same lift #R411 ③ in this file uses on
   the anti-aliasing line, and the reason these are GATES rather than second copies */
function glslExpr(src, decl, args) {
  const m = new RegExp('float ' + decl + ' = ([^;]+);').exec(src);
  assert.ok(m, 'the shader still declares `' + decl + '` in one place');
  /* ⚠ THE TEMPLATE HOLE IS FILLED FROM THE JS CONSTANT IT NAMES, which is the part that makes this
     a gate on the SHIPPED number: change LOD_DOT_PX and this arithmetic changes with it. */
  const lod = /const LOD_DOT_PX = (\d+);/.exec(CLOUD);
  assert.ok(lod, 'the LOD threshold is a named constant');
  const js = m[1]
    .replace(/\$\{LOD_DOT_PX\.toFixed\(1\)\}/g, (+lod[1]).toFixed(1))
    .replace(/\bclamp\(/g, 'CLAMP(').replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(').replace(/\babs\(/g, 'Math.abs(');
  assert.ok(!js.includes('${'), 'nothing else in `' + decl + '` is a template hole');
  // eslint-disable-next-line no-new-func
  return new Function('CLAMP', ...args, 'return ' + js + ';')
    .bind(null, (x, lo, hi) => Math.max(lo, Math.min(hi, x)));
}

/* ══════════════════════════ #R401 · the angle is derived, not copied ══════════════════════════ */
/* ── ⑤ THE SPRITE'S ANGLE IS DERIVED, NOT COPIED ──────────────────────────────────────────────
   Two claims, both of which the #R341 shader fails:
     · the vertex shader PROJECTS MORE THAN ONCE, because no angle at all can be had from a single
       projected point. ⚠ (#R411) the COUNT moved from two to three when the answer stopped being
       the projected track and became the map's rotation without its tilt — a step EAST and a step
       NORTH in place of a step ahead. What survived the round is "derived from the projection", so
       that is what this asserts; #R411 ② in this file owns WHICH three they are;
     · the fragment shader does not sample the field through the RAW point-coordinate. Whatever
       carries the mark onto the screen, `q` has to go through its inverse first; #R341 applied a
       rotation the wrong way round (mat2 takes its COLUMNS, so the mirror is two minus signs) and
       the one test that drew the mark before #R401 drew it tracking due north, where the matrix is
       the identity either way. ⚠ (#R434) that rotation is now a full 2×2 built in the vertex
       shader and inverted there, so what survives here is the SHAPE of the claim — the fragment
       shader transforms q by something it was handed — and #R434 ① in this file owns which
       2×2 it is. */
test('R401 ⑤ the mark is turned by a transform read out of the projection', () => {
  /* spelling kept — GLSL cannot run in Node; the rendered angle is measured by tests/r379.spec.js in a browser, and this pins the derivation that spec depends on */
  const src = code('js/aircraft-points.js');
  const vert = /const VERT = `([\s\S]*?)`;/.exec(src);
  assert.ok(vert, 'the vertex shader source is still a template literal named VERT');
  /* (maplibre-6-migration) projectLifted is the prelude's projectTileFor3D with each half fed its own unit
     (js/lifted-projection.js) */
  const projections = (vert[1].match(/projectLifted\s*\(/g) || []).length;
  assert.ok(projections >= 2,
    'the vertex shader projects the aircraft AND at least one neighbour (found ' + projections + ')');
  assert.match(vert[1], /atan\(/, 'and it reads an angle out of what it projected');
  assert.doesNotMatch(vert[1], /v_rot\s*=\s*a_form\.y\s*;/,
    'the reported bearing is no longer handed straight to a screen-aligned sprite');

  const frag = /const FRAG = `([\s\S]*?)`;/.exec(src);
  assert.ok(frag, 'the fragment shader source is still a template literal named FRAG');
  assert.match(frag[1], /planeSD\(minv \* q/, 'the field is sampled through the inverse transform');
  assert.doesNotMatch(frag[1], /planeSD\(q\b/,
    'and never through the raw point-coordinate, which is a compass that is not on screen');
  assert.doesNotMatch(frag[1], /mat2\(c,\s*-s,\s*s,\s*c\)/,
    'the mirrored matrix — #R341\'s — reflects the mark about the vertical axis');
});

/* ── ⑥ THE PROBE HAS A FLOOR, AND THE FLOOR IS THE REASON IT WORKS AT z20 ─────────────────────
   The heading is the difference of two projections, and the second point is `a_pos + step`. `a_pos`
   is a float32: near 0.5 the gap between representable values is 6.0e-8, so a step scaled purely by
   zoom quantises the direction into a handful of angles once the map is zoomed in far enough. The
   floor is what stops that, and a later round that "simplifies" the expression to one term is the
   change this asserts against. */
test('R401 ⑥ the heading probe never shrinks below what float32 can represent', () => {
  /* spelling kept — the floor is a WebGL uniform; its VALUE is read and checked numerically, the clamp is read from the code that sets the uniform */
  const src = code('js/aircraft-points.js');
  const floor = /const PROBE_MERC_MIN\s*=\s*([\d.e-]+)\s*;/.exec(src);
  assert.ok(floor, 'the floor is declared');
  const v = Number(floor[1]);
  /* 24 representable steps at mercator 0.5 is the smallest that keeps the angle error under a
     degree; anything at or above that is fine, anything below it is the quantisation this guards */
  assert.ok(v >= 24 * 6.0e-8, 'the floor is at least 24 float32 steps wide: ' + v);
  assert.ok(v <= 1e-4, 'and small enough that the chord still follows the tangent: ' + v);
  assert.match(src, /Math\.max\(PROBE_MERC_MIN,/, 'and the uniform is clamped to it');
});

/* ══════════════════════════ #R411 · the map's rotation, and the opaque mark ══════════════════════════ */
/* ── ② THE MARK'S ANGLE IS THE MAP'S ROTATION, NOT ITS TILT ──────────────────────────────────
   The pixels are tests/r379.spec.js's — a source check cannot see a rendered frame. What is here is
   the SHAPE of the derivation, i.e. the three things a later round would have to keep for that test
   to be measuring the same claim: three projections, a step east and a step north (not a step along
   the track), and the polar rotation subtracted from the track rather than replacing it. */
test('R411 ② the vertex shader takes a step EAST and a step NORTH, and still knows their rotation', () => {
  /* spelling kept — GLSL cannot run in Node (see R401 ⑤); the Cesium half of the same arithmetic IS evaluated in ② c */
  const src = code('js/aircraft-points.js');
  const vert = /const VERT = `([\s\S]*?)`;/.exec(src);
  assert.ok(vert, 'the vertex shader source is still a template literal named VERT');
  const v = vert[1];
  /* (maplibre-6-migration) through projectLifted — the prelude's projectTileFor3D with the sphere fed metres
     and the plane mercator units (js/lifted-projection.js) */
  const projections = (v.match(/projectLifted\s*\(/g) || []).length;
  assert.equal(projections, 3,
    'the aircraft, one step east and one step north (found ' + projections + ')');
  assert.match(v, /projectLifted\(p \+ vec2\(u_probe, 0\.0\), alt, em\)/, 'the east step');
  assert.match(v, /projectLifted\(p \+ vec2\(0\.0, -u_probe\), alt, em\)/,
    'the north step — mercator y grows SOUTHWARD, so north is minus');
  /* ⚠ THE STEPS ARE EAST AND NORTH, NOT ALONG THE TRACK. #R401 projected a step ahead and used its
     angle alone; the two steps here span the whole ground→screen Jacobian, which is what lets
     (#R434) the mark carry the tilt's squash as well as its rotation. The track enters as the two
     numbers that turn that basis into the MARK's own axes, not as a third projection. */
  const projTrack = /projectTileFor3D\([^)]*sin\(trk\)/.test(v);
  assert.ok(!projTrack, 'no step is PROJECTED along the track itself');
  assert.match(v, /vec2\(dE\.x \+ dN\.y, dE\.y - dN\.x\)/,
    'the rotation of the polar factor of [dE dN] is still computed');
  /* ⚠ …AND IT IS STILL WHAT THE MARK FALLS BACK TO. #R411 made that rotation the answer outright;
     #R434 makes it the LIMIT the answer is mixed towards when the squash would take the mark below
     the size at which this shader stops drawing an aeroplane. The mix is the thing to pin, because
     dropping it is how a steep view loses aircraft into sub-pixel slivers. */
  assert.match(v, /float t = clamp\(\(kmin - k\)/, 'the blend back to that rotation is computed');
  assert.match(v, /mix\(F \/ s1, Rot \* fw, t\)/, 'and the mark IS that mix, nose …');
  assert.match(v, /mix\(R \/ s1, Rot \* rw, t\)/, '… and starboard');
  /* all three projections are guarded, because a point at or behind the eye has no divide */
  assert.match(v, /here\.w > 0\.0 && pe\.w > 0\.0 && pn\.w > 0\.0/, 'all three are guarded on w');
});

test('R411 ② b the Cesium engine answers the same question the same way', () => {
  /* spelling kept — pins the shape of the body that ② c lifts and evaluates — without it ② c could be measuring a different function */
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
  /* spelling kept — the fade is packed in a Web Worker and applied in a WebGL shader; neither runs in Node */
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
/* ══════════════════════════ #R434 · the whole 2×2, and its floor ══════════════════════════ */
/* ── ① THE MARK'S OWN AXES, PROJECTED ────────────────────────────────────────────────────────
   The pixels are tests/r379.spec.js's — a source check cannot see a rendered frame. What is here is
   the SHAPE of the derivation: the two ground steps still span the Jacobian, the track turns that
   basis into the mark's starboard and nose, the largest singular value normalises it, and the
   fragment shader is handed the INVERSE so one matrix multiply replaces a per-pixel rotation. */
test('R434 ① the vertex shader builds the mark\'s two axes and hands over the inverse', () => {
  /* spelling kept — GLSL cannot run in Node; the scalar lines of the same shader ARE evaluated in ③ */
  const v = vertOf();
  assert.match(v, /vec2 F = st \* dE \+ ct \* dN;/, 'the nose is the track, in the ground basis');
  assert.match(v, /vec2 R = ct \* dE - st \* dN;/, 'and starboard is a right angle from it');
  assert.match(v, /float s1 = sqrt\(max\(0\.0, 0\.5 \* \(tr \+ sqrt\(/,
    'the larger singular value of [R F] is what the pair is normalised by');
  assert.match(v, /v_minv = vec4\(fw\.y, -rw\.y, -fw\.x, rw\.x\) \/ det;/,
    'and the varying is that 2×2 INVERTED — once per aircraft, not once per pixel');
  /* ⚠ NOT A ROTATION ANY MORE. A single angle cannot carry a squash, so a `v_rot` reappearing here
     is the #R411 behaviour coming back whatever it is called. */
  assert.ok(!/\bv_rot\b/.test(v), 'no single angle survives into the fragment shader');
  assert.ok(!/\bv_rot\b/.test(fragOf()), '…and none is read there');

  const f = fragOf();
  assert.match(f, /mat2 minv = mat2\(v_minv\.xy, v_minv\.zw\);/, 'the fragment shader rebuilds it');
  assert.match(f, /planeSD\(minv \* q, g\)/, 'and samples the field through it');
});

/* ── ② THE EDGE IS STILL ONE PIXEL, AND THE PIXEL IS ON THE SCREEN ───────────────────────────
   `planeSD` measures in the MARK's units, and under foreshortening one of those is worth as little
   as LOD_DOT_PX/v_px of a screen pixel — so a ramp of a fixed number of mark-units is a ramp of a
   fraction of a pixel across the squashed axis, which is an aliased edge. #R411's whole round was
   about this edge; keeping its declaration and dividing by the field's own screen gradient is what
   leaves the flat map bit-for-bit unchanged (the gradient is exactly 1 where minv is a rotation)
   while holding the ramp at one pixel on a steep one. */
test('R434 ② the anti-aliasing ramp is measured through the same transform', () => {
  /* spelling kept — GLSL cannot run in Node; the ramp line itself is evaluated in R411 ③ */
  const f = fragOf();
  assert.match(f, /float aa = 1\.0 \/ max\(v_px, 1\.0\);/,
    '#R411\'s one-pixel declaration is untouched — #R411 ③ in this file evaluates it');
  assert.match(f, /aa \*= length\(vec2\(dot\(minv\[0\], g\), dot\(minv\[1\], g\)\)\);/,
    'and it is scaled by how fast the field runs across the SCREEN at this pixel');
  assert.match(f, /float planeSD\(vec2 p, out vec2 grad\)\{/, 'the field reports its own gradient');
  assert.match(f, /grad = nb \* inversesqrt\(max\(d, 1e-12\)\);/, 'as a unit vector, guarded at the outline');
  /* ⚠ THE NEAREST POINT HAS TO BE TRACKED, NOT JUST THE DISTANCE. `d = min(d, dot(b,b))` keeps the
     number and throws away the direction, and a gradient recovered from the wrong edge is a ramp
     measured along the wrong axis. */
  assert.match(f, /if \(dd < d\) \{ d = dd; nb = b; \}/, 'the winning edge is remembered');
  assert.ok(!/d = min\(d, dot\(b, b\)\);/.test(f), 'and the distance-only form is gone');
});

/* ── ③ THE FLOOR, AND WHY IT IS A BLEND RATHER THAN A CLAMP ──────────────────────────────────
   The sprite's SIZE does not fall off with distance — that is deliberate, it is what makes every
   aircraft legible — so its foreshortening must not be allowed to run away either: an aircraft near
   the horizon of a steep view would keep its full width and be squashed to a fraction of a pixel
   across. The floor is the layer's own LOD threshold, and it is reached by mixing the transform
   towards its polar ROTATION, which is exactly the mark #R411 shipped. */
test('R434 ③ the squash stops where the shader stops drawing an aeroplane', () => {
  const v = vertOf();
  /* ONE declaration of the threshold, injected into both shaders */
  assert.match(CLOUD, /const LOD_DOT_PX = 5;/, 'the LOD threshold is a named constant');
  assert.match(CLOUD, /kmin = min\(1\.0, \$\{LOD_DOT_PX\.toFixed\(1\)\} \/ max\(px, 1\.0\)\)/,
    'the vertex shader reads it from there');
  assert.match(CLOUD, /if \(v_px < \$\{LOD_DOT_PX\.toFixed\(1\)\}\)/,
    '…and so does the fragment shader, so the two cannot drift apart');

  const kmin = glslExpr(v, 'kmin', ['px']);
  const tOf = glslExpr(v, 't', ['kmin', 'k']);
  /* the sizes the layer actually draws at: sizePx 11 is its default, 3.5–43 its ramp, and v_px is
     that times the device pixel ratio */
  assert.equal(+kmin(5).toFixed(6), 1, 'a mark at the LOD threshold is not squashed at all');
  assert.equal(+kmin(11).toFixed(4), 0.4545, 'at the default size on a 1× screen the floor is 5/11');
  assert.equal(+kmin(22).toFixed(4), 0.2273, 'and half that on a 2× one, because it has the pixels');

  /* ⚠ AND IT IS INERT WHERE THE MARK IS BIG, which is where a reader is looking at aeroplanes
     rather than at traffic. At the centre of the screen the ground foreshortens to cos(pitch), so
     against the layer's own size ramp (3.5 px at z0 … 42.9 px from z9, times the device ratio):

         v_px                       11      16      22      43      86
         floor  = 5/v_px         0.455   0.313   0.227   0.116   0.058
         held at pitch 78°       0.455   0.313   0.227   0.208   0.208   ← 0.208 is the projection
         held at pitch 60°       0.500   0.500   0.500   0.500   0.500   ← untouched

     So the tilt a reader sees is exact everywhere up to about 63° whatever the screen, exact at
     every tilt once the mark is drawn at 40 px or more, and held short of the projection only where
     the alternative is a sliver. A floor that fired everywhere would be a clamp wearing a blend's
     clothes; this one is off in most of the table. */
  const cos78 = Math.cos(78 * Math.PI / 180), cos60 = Math.cos(60 * Math.PI / 180);
  const held = (px, k) => { const t = tOf(kmin(px), k); return (1 - t) * k + t; };
  assert.deepEqual([11, 16, 22, 43, 86].map((px) => +held(px, cos78).toFixed(3)),
    [0.455, 0.313, 0.227, 0.208, 0.208], 'the short axis at pitch 78, by mark size');
  assert.deepEqual([11, 16, 22, 43, 86].map((px) => +held(px, cos60).toFixed(3)),
    [0.5, 0.5, 0.5, 0.5, 0.5], 'and at pitch 60, where the floor never fires');
  assert.equal(tOf(kmin(43), cos78), 0, 'a mark drawn at 43 px follows the projection exactly');

  /* ⚠ AND IT REACHES THE FLOOR EXACTLY. `mix(A, R, t)` is R·((1−t)S + tI) for the polar factor
     A = R·S, so it lifts BOTH singular values to (1−t)σ + t; with σ₁ normalised to 1 that leaves
     σ₁ alone and takes σ₂ from k to (1−t)k + t. This is the identity the one line rests on, so it
     is checked as an identity rather than asserted as a comment. */
  for (const px of [8, 11, 22, 44]) {
    for (const k of [1e-4, 0.01, 0.05, 0.2, 0.5, 0.9, 1]) {
      const t = tOf(kmin(px), k);
      const got = (1 - t) * k + t;
      const want = Math.max(k, kmin(px));
      assert.ok(Math.abs(got - want) < 1e-9,
        'px ' + px + ', k ' + k + ': the short axis lands on ' + got.toFixed(6) + ', wanted ' + want.toFixed(6));
      assert.ok(got * px >= Math.min(px, 5) - 1e-9,
        'px ' + px + ', k ' + k + ': the mark never gets thinner than the LOD threshold');
    }
  }
});

/* ── ③ b THE OTHER ENGINE CANNOT DO THIS, AND THAT IS ARITHMETIC ─────────────────────────────
   Cesium draws the aircraft as billboards, and BillboardCollectionVS sizes an axis-aligned quad and
   THEN rotates it — so every image it can produce is (rotation × diagonal), while the image of a
   plan-form lying in the ground plane is (diagonal × rotation). The two families agree only where
   the rotation is a multiple of a right angle. The quantity below is what a reader would see: the
   artwork's wingspan and fuselage are square, and this is how far out of square the projection puts
   them. js/cesium-engine.js states the same table beside `_airHeading`. */
test('R434 ③ b the shear a billboard cannot express is most of the shape at tilt', () => {
  const outOfSquare = (pitchDeg, trackDeg) => {
    const cp = Math.cos(pitchDeg * Math.PI / 180);
    const T = trackDeg * Math.PI / 180, st = Math.sin(T), ct = Math.cos(T);
    const dE = [1, 0], dN = [0, cp];
    const F = [st * dE[0] + ct * dN[0], st * dE[1] + ct * dN[1]];
    const R = [ct * dE[0] - st * dN[0], ct * dE[1] - st * dN[1]];
    const cos = (F[0] * R[0] + F[1] * R[1]) / (Math.hypot(...F) * Math.hypot(...R));
    return Math.abs(90 - Math.acos(Math.abs(cos)) * 180 / Math.PI);
  };
  const at45 = [0, 30, 60, 78].map((p) => +outOfSquare(p, 45).toFixed(1));
  assert.deepEqual(at45, [0, 8.2, 36.9, 66.5], 'the mark\'s own axes, out of square, at track 045°');
  /* the same rotation-only answer is what js/cesium-engine.js keeps, and it says so */
  const ces = code('js/cesium-engine.js');
  assert.match(ces, /return th-track;/, 'Cesium still returns the rotation alone');
  const rot = /_airHeading\(p,track\)\{([\s\S]*?)\n {4}\}/.exec(ces);
  assert.ok(rot, '_airHeading is still a method of the engine');
  assert.ok(!/width\s*=|height\s*=/.test(rot[1]),
    'and does not pretend to a squash by resizing the quad, which is the #R401 failure again');
});
