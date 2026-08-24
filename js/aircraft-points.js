/* ============================================================================
 *  IntMap · aircraft-points — tens of thousands of aircraft as ONE draw call  (#R341)
 * ----------------------------------------------------------------------------
 *  WHAT THIS REPLACES
 *  ------------------
 *  The layer this supersedes rebuilt, on every publish:
 *    · a GeoJSON FeatureCollection with one Feature per aircraft, handed to setSourceData; and
 *    · in 3-D, up to THREE fill-extrusion polygons per aircraft (body, rim, ground post), capped at
 *      4,000 aircraft with the rest culled by distance from the map centre.
 *  Both are per-aircraft CPU work on the main thread, four times a minute. That cap of 4,000 — and
 *  the zoom floor that switched the whole layer off below z2 — are not tuning; they are what a
 *  CPU-side representation costs. Neither exists here.
 *
 *  HOW
 *  ---
 *  One `gl.POINTS` draw call over seven Float32Arrays, the shape js/orbit-points.js has used for
 *  ~11,000 satellites since #R202. Per aircraft: 1 vertex. Per frame: 7 buffer binds, 6 uniforms,
 *  one drawArrays. The CPU touches no aircraft between publishes — position is EXTRAPOLATED in the
 *  vertex shader from the velocity the packer computed, so motion is continuous at display rate
 *  while data arrives every few seconds.
 *
 *  THE GLYPH IS DRAWN, NOT TEXTURED
 *  --------------------------------
 *  gl_PointCoord is rotated by the aircraft's SCREEN angle in the fragment shader and tested
 *  against a signed distance field. That is why heading costs nothing: no texture atlas, no
 *  per-icon image, no icon-rotate expression, and the silhouette stays sharp at any device pixel
 *  ratio. Below a few pixels the silhouette is indistinguishable from a dot and the shader says so
 *  — that is the LOD, and it changes the DETAIL of an aircraft, never whether it is drawn.
 *
 *  ⚠ (#R401) A SCREEN ANGLE, NOT THE COMPASS BEARING. 「地図を傾けても、航空レイヤーの飛行機
 *  アイコンが同じ向きなのを修正して。」 A gl.POINTS sprite is axis-aligned to the VIEWPORT: it does
 *  not tilt with the ground and it does not turn with the map, so handing the fragment shader the
 *  track in radians — which is what #R341 did — draws every aircraft against a compass that is no
 *  longer on screen. Measured with a probe aircraft at the canvas centre, sprite box 64 px:
 *
 *      track   pitch  bearing     the mark pointed      it should have pointed
 *        090°      0°       0°              085° W                     090° E
 *        045°     60°       0°              046° W                     063° E
 *        045°      0°      45°              049° W                     000°
 *
 *  Three faults in one number, and the middle column moves by two degrees across the whole table:
 *  the mark ignored PITCH, it ignored BEARING, and it was MIRRORED (the mat2 in FRAG, see there).
 *  Two of those three are still fixed here. The third was over-corrected — see below.
 *
 *  ⚠ (#R411) …AND TILT IS NOT PART OF IT. 「いや実際の飛行機の向きのままにしろってこと。」 #R401
 *  answered the whole of that table by projecting the aircraft AND a point one step along its track
 *  and taking the difference — the direction a DECAL LYING ON THE GROUND would run, applied to a
 *  silhouette that #R401 left the size and shape it had at pitch 0. Squashing only the ANGLE is half
 *  a transform, and the half it keeps is the half that carries the information: a reader given a
 *  full-size aeroplane pointing along the horizon has been told it is flying along the horizon.
 *  Measured over Japan, 400 aircraft, z6.2:
 *
 *      pitch        0°     30°     60°     75°     78°
 *      within 20° of horizontal   121     128     181     287     315   of 400
 *      axial concentration      0.238   0.291   0.485   0.711   0.768
 *
 *  ⚠ 78°, AND THAT IS THE APPLICATION'S OWN CEILING, NOT A ROUND NUMBER SOMEBODY LIKED. The last
 *  column was asked for at 85 and MEASURED at 78: js/view-controls.js holds the standard tilt limit
 *  at 78 (`STANDARD`), and lifting it is a setting a reader has to switch on, so `jumpTo({pitch:85})`
 *  lands at 78 for anyone who has not. The first version of this table said 85 — a number this file
 *  had not measured, on a machine that cannot reach it.
 *
 *  At the tilt the report was made at, FOUR IN FIVE aircraft pointed the same way — not because
 *  they were flying the same way (the reported tracks are near-uniform, 0.214) but because a ground
 *  plane seen edge-on maps every bearing onto the horizon. So #R411 turned the sprite by the map's
 *  own ROTATION and by nothing else — the rotation of the polar factor of that Jacobian, i.e. the
 *  matrix with the tilt's anisotropic squash divided out.
 *
 *  ⚠ (#R434) …WHICH MADE TILT DO NOTHING AT ALL, AND THAT IS WHAT CAME BACK. 「傾けてるのに上から
 *  見たときとおなじとかあほかボケ。」 Pure pitch is not a rotation, so the quantity #R411 kept does
 *  not move under it: the mark drawn at pitch 78 was, pixel for pixel, the mark drawn at pitch 0.
 *  Both previous answers used HALF of the same 2×2 and threw the other half away — #R401 kept the
 *  angle and dropped the squash, #R411 kept neither. What is drawn now is the whole of it: the
 *  plan-form lying in the aircraft's own horizontal plane, seen by this camera, so its nose is
 *  along its true track IN THE WORLD and the picture foreshortens exactly as the ground under it
 *  does. Nothing about the projection is re-derived here — bearing, the perspective divide and the
 *  globe are all still read out of `projectTileFor3D`, which is the only reason this can be right
 *  for a projection this file does not own. Where the projection has no answer (a point at or
 *  behind the eye) the reported track on a north-up screen is the fallback, and where the squash
 *  would take the mark below the width at which this shader stops drawing an aeroplane at all, the
 *  transform is mixed back towards #R411's rotation — at that limit it IS #R411's mark.
 *  ⚠ js/cesium-engine.js `_airHeading` still answers the ROTATION alone, and cannot answer more: a
 *  BillboardCollection sprite is (rotation × axis-aligned size), the image of a ground plane is
 *  (squash × rotation), and those two families of matrices meet only at the cardinal angles — the
 *  shear this shader carries is not expressible by that primitive. See there for the measurement.
 *
 *  ⚠ (#R379) THE FIELD IS THE APP'S OWN AIRLINER PLAN-FORM, NOT A DART. 「航空機レイヤーの飛行機
 *  アイコンのデザインをもとに戻して。」 #R341 wrote a notched triangle here because an SDF is
 *  cheaper to write for three vertices than for eighteen; that is a property of the author, not of
 *  the layer. The eighteen are in js/plane-glyph.js — ONE declaration, read here as GLSL and by
 *  js/cesium-engine.js as a canvas path, so the two engines cannot drift apart the way #R341's two
 *  transcriptions of the dart could have. A concave outline needs a crossing test for the sign,
 *  which is the only thing planeSD() does that a triangle's three half-planes did not.
 *
 *  ⚠ EXTRAPOLATION IS CAPPED, AND CAPPED SHORTER THAN THE SATELLITES'. A satellite's motion is
 *  deterministic — its velocity is still right four seconds later. An aircraft's is a guess that
 *  ages badly: it turns, it levels off, it lands. Past EXTRAP_MAX_S the glyph HOLDS rather than
 *  flying on, because a smooth line into a place the aircraft never went is a worse answer than a
 *  glyph that stops. §10.5 requires the cap; the client marks anything past it as estimated.
 *
 *  This file is the MapLibre ADAPTER's implementation detail, exactly as js/orbit-points.js and
 *  js/solid3d.js are. Nothing outside IntMapGeoEngine's
 *  `layers.addAircraftCloud/setAircraftCloud/removeAircraftCloud` may reach for it.
 * ==========================================================================*/
/* ⚠ THE MARK ITSELF. Imported rather than transcribed — see the header. The import is hoisted, so
   window.IntMapPlaneGlyph exists before this module's body builds the shader source. */
import './plane-glyph.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.aircraftPoints = function () {
  const D2R = Math.PI / 180;
  /* the WGS84 equatorial circumference MapLibre's mercator is built on — one mercator unit of
     altitude at latitude φ is MERC_CIRC·cos φ metres (the #R174 lesson, from js/solid3d.js) */
  const MERC_CIRC = 2 * Math.PI * 6378137;

  /* Seconds of dead reckoning before a glyph stops moving. Four is right for a satellite; an
     aircraft that has not been heard from for four seconds may already have begun a turn. */
  const EXTRAP_MAX_S = 3;

  /* ── (#R401) HOW FAR AHEAD THE HEADING IS PROBED ─────────────────────────────────────────────
     The sprite's angle is the SCREEN direction of the track, and the only exact way to get that
     from a projection this file does not own is to project a second point and subtract. This is
     how far ahead that point is, in CSS pixels of ground at the current zoom — small enough that
     the chord and the tangent agree, large enough to survive float32.
     ⚠ AND IT HAS A FLOOR IN MERCATOR UNITS, which is the part that is not a matter of taste.
     `a_pos` is a float32 in [0,1]; near 0.5 the spacing between representable values is 6.0e-8, so
     a probe of 1.5e-6 is only ~25 of them and anything much smaller quantises the direction into
     a handful of angles. At z15.3 the pixel figure falls to the floor and the floor takes over. */
  const PROBE_PX = 32;
  const PROBE_MERC_MIN = 1.5e-6;
  /* MapLibre's mercator: one mercator unit is 512·2^zoom CSS pixels. */
  const TILE_PX = 512;

  /* ── (#R434) THE SIZE AT WHICH THIS LAYER STOPS DRAWING AN AEROPLANE ─────────────────────────
     Below this many DEVICE pixels the fragment shader draws a dot instead of the silhouette, and
     that is also the floor the foreshortening is held to: a mark squashed thinner than the width
     at which its shape stops being readable has nothing left to say about its own heading. ONE
     declaration, injected into both shaders, because the two used to carry the same 5.0 in two
     places and only the fragment one was ever a stated rule. */
  const LOD_DOT_PX = 5;

  /* ⚠ EVERY BYTE INSIDE THESE BACKTICKS IS SHIPPED. The minifier strips JS comments; a GLSL comment
     is a string literal to it, so it travels to every browser that opens the layer. The reasoning
     lives out here — the shader keeps one line pointing at it. (#R311's budget caught the first
     draft of #R401 growing this chunk by 2.4 kB of prose.)

     ── (#R401, #R411, #R434) THE WHOLE TRANSFORM, NOT HALF OF IT ───────────────────────────────
     A gl.POINTS sprite is axis-aligned to the VIEWPORT, so the track cannot be handed to the
     fragment shader as a compass bearing: the map turns under it and the sprite does not. Three
     projections (here, one step EAST, one step NORTH) give the local ground→screen Jacobian
     J = [dE dN], and what is built from it here is the 2×2 that maps the MARK'S OWN AXES —
     starboard and nose — onto the screen: A = [J·(cos t, −sin t)  J·(sin t, cos t)] / σ₁, i.e. the
     aircraft's plan-form lying in its own horizontal plane, seen by this camera. Dividing by the
     largest singular value is what keeps `u_sizePx` meaning the same longest extent it always did.
     The fragment shader is handed A's INVERSE and samples the field through it.
     ⚠ AND THE FLOOR IS A BLEND BACK TO #R411'S ANSWER, NOT A CLAMP ON A NUMBER. A itself is
     R·S (polar), so mixing A towards its own rotation R by t lifts BOTH singular values to
     (1−t)σ + t — at t = 1 this is exactly the unforeshortened mark #R411 shipped, and t is chosen
     as the smallest value that keeps the short axis at LOD_DOT_PX device pixels. Without it an
     aircraft near the horizon of a steep view keeps its full 11-px width and is squashed to a
     fraction of a pixel across: the sprite's SIZE does not fall off with distance, so its
     foreshortening must not be allowed to run away either.
     ⚠ mercator y grows SOUTHWARD, which is why the NORTH step is −y (the same sign the packer uses
     for a_vel in src/aviation-worker.js).
     ⚠ w ≤ 0 means a point is at or behind the eye. The perspective divide is meaningless there and
     the sprite is being clipped anyway, so the reported track on a north-up screen is left as the
     fallback rather than turned into a NaN that would take the whole glyph with it.
     ⚠ u_viewport turns the projection's NDC differences into pixels, so the Jacobian this decomposes
     is the one the screen actually has; without it a 16:9 canvas leans every glyph. */
  const VERT = `
in vec2 a_pos;        /* mercator [0..1] at the observation */
in vec2 a_vel;        /* d(mercator)/dt, per second */
in float a_alt;       /* metres above the ellipsoid (0 when the layer is not lifting aircraft) */
in float a_altv;      /* d(altitude)/dt, metres per second */
in float a_mscale;    /* metres → mercator units at THIS aircraft's latitude */
in vec4 a_col;        /* rgba, 0..1 */
in vec2 a_form;       /* x = relative size (1 = ordinary), y = track in radians */
uniform float u_dt;         /* seconds since the observation the buffers hold */
uniform float u_altScale;   /* 0 = the prelude wants metres (globe), 1 = mercator units */
uniform float u_pxRatio;
uniform float u_sizePx;     /* the zoom-dependent base size, so a zoom change needs no repack */
uniform float u_opacity;
uniform float u_probe;      /* (#R401) mercator units to look ahead along the track */
uniform vec2 u_viewport;    /* (#R401) drawing-buffer size, so NDC becomes an on-screen shape */
out vec4 v_col;
out vec4 v_minv;
out float v_px;
void main(){
  v_col = vec4(a_col.rgb, a_col.a * u_opacity);
  vec2 p = a_pos + a_vel * u_dt;
  float alt = a_alt + a_altv * u_dt;
  float e = mix(alt, alt * a_mscale, u_altScale);
  vec4 here = projectTileFor3D(p, e);
  gl_Position = here;

  float px = a_form.x * u_sizePx * u_pxRatio;
  v_px = px;
  gl_PointSize = px;

  /* (#R434) the mark's own axes, projected — see the note above this string */
  float trk = a_form.y, st = sin(trk), ct = cos(trk);
  vec2 fw = vec2(st, ct), rw = vec2(ct, -st);
  vec4 pe = projectTileFor3D(p + vec2(u_probe, 0.0), e);
  vec4 pn = projectTileFor3D(p + vec2(0.0, -u_probe), e);
  if (here.w > 0.0 && pe.w > 0.0 && pn.w > 0.0) {
    vec2 o = here.xy / here.w;
    vec2 dE = (pe.xy / pe.w - o) * u_viewport;
    vec2 dN = (pn.xy / pn.w - o) * u_viewport;
    vec2 F = st * dE + ct * dN;
    vec2 R = ct * dE - st * dN;
    vec2 pr = vec2(dE.x + dN.y, dE.y - dN.x);
    float tr = dot(F, F) + dot(R, R);
    float dt = R.x * F.y - R.y * F.x;
    float s1 = sqrt(max(0.0, 0.5 * (tr + sqrt(max(0.0, tr * tr - 4.0 * dt * dt)))));
    if (s1 > 1e-9 && dot(pr, pr) > 1e-14) {
      float th = atan(pr.y, pr.x), cj = cos(th), sj = sin(th);
      mat2 Rot = mat2(cj, sj, -sj, cj);
      float k = abs(dt) / (s1 * s1);
      float kmin = min(1.0, ${LOD_DOT_PX.toFixed(1)} / max(px, 1.0));
      float t = clamp((kmin - k) / max(1.0 - k, 1e-6), 0.0, 1.0);
      fw = mix(F / s1, Rot * fw, t);
      rw = mix(R / s1, Rot * rw, t);
    }
  }
  float det = rw.x * fw.y - rw.y * fw.x;
  if (abs(det) < 1e-6) det = (det < 0.0) ? -1e-6 : 1e-6;
  v_minv = vec4(fw.y, -rw.y, -fw.x, rw.x) / det;
}`;

  /* (#R379) the one declaration of the mark — see the header */
  const GLYPH = window.IntMapPlaneGlyph;

  /* ⚠ (#R401, #R434) THE SAMPLING GOES THE OTHER WAY — the note for the `mat2` in FRAG below, kept
     out here because a GLSL comment ships (see the note above VERT). The vertex shader builds the
     matrix that carries the MARK onto the SCREEN; the fragment shader has a screen offset and wants
     the point of the mark under it, so what it is handed is that matrix INVERTED. #R341 handed over
     a rotation and applied `mat2(c,-s,s,c)`, the transpose of the right one, i.e. the mark reflected
     about the vertical axis: measured with a probe aircraft tracking 090°, the nose was drawn
     pointing 085° WEST. Nothing caught it because the only test of the mark drew it tracking due
     north, where the matrix is the identity either way. Inverting in the vertex shader — once per
     aircraft rather than once per pixel — is what leaves no second convention here to get wrong.

     ⚠ (#R434) …AND THE EDGE IS STILL MEASURED ON THE SCREEN. `planeSD` returns a distance in the
     MARK's units, and under foreshortening those are no longer screen units: one of them is worth
     as little as LOD_DOT_PX/v_px of a pixel. So the ramp is divided by how fast the field runs
     across the screen at this pixel — the field's own unit gradient carried through the same
     inverse matrix — which is exactly 1 where there is no tilt, so #R411's one-pixel edge is
     unchanged on a flat map and stays one pixel on a steep one. */

  /* ⚠ (#R411) THE EDGE IS ONE PIXEL, AND IT USED TO BE THREE — 「不透明度100%が全然100%じゃない
     のを辞めろ。」 The soft edge was `max(0.06, 3.0/v_px)` half-widths, i.e. a SIX-pixel ramp across
     an outline whose fuselage is 4.4/44 of the sprite and whose white band is 2.6/44. Both are
     narrower than the ramp, so the smoothsteps never bottomed out and the mark could not be opaque
     anywhere: computed over the real outline at v_col.a = 1 and u_opacity = 1,

         v_px                              5      8     11     14     22     40     64
         peak coverage, 3-px edge      0.819  0.889  0.954  0.995  1.000  1.000  1.000
         share of the mark at ≥0.99     0.0%   0.0%   0.0%   0.0%   3.0%  18.3%  25.0%
         mean coverage over the mark   0.512  0.508  0.513  0.525  0.586  0.697  0.739
         ── with one pixel ───────────────────────────────────────────────────────────
         peak coverage                 1.000  1.000  1.000  1.000  1.000  1.000  1.000
         share of the mark at ≥0.99     0.1%   4.3%  12.6%  19.8%  35.1%  48.8%  53.3%
         mean coverage over the mark   0.531  0.601  0.660  0.707  0.786  0.863  0.904

     At the default 11 px the reader asking for 100 % was being shown 95.4 % at the very best pixel
     and 51 % across the mark. ⚠ The floor mattered as much as the slope: `max(0.06, …)` held a
     ramp of 0.06 sprite units — 1.9 px at v_px 64 — no matter how large the mark grew, which is why
     zooming in never made it solid either. What is LEFT below 1.0 after this is the mark's own
     declaration, not the renderer's: STROKE_ALPHA is 0.95 because `ctx.stroke()` painted it at 0.95
     when js/plane-glyph.js was the symbol layer's artwork, and js/cesium-engine.js still fills that
     same path on a canvas — where the interior always has been opaque. Two engines, one mark; this
     is the one that was not matching it. */
  const FRAG = `
precision highp float;
in vec4 v_col;
in vec4 v_minv;
in float v_px;
out vec4 fragColor;

/* The plan-form's vertices in SPRITE space, GENERATED from js/plane-glyph.js rather than typed
   here, so the shader and the Cesium sprite cannot disagree by a decimal point. */
${GLYPH.glsl('PLANE')}
const int PLANE_N = ${GLYPH.OUTLINE.length};
/* Half the white outline, in the same units: the band reaches this far either side of the path,
   exactly as \`ctx.stroke()\` straddles it. */
const float HALF_STROKE = ${GLYPH.SDF_HALF_STROKE.toFixed(7)};

/* Signed distance to the plan-form: negative inside. One pass over the edges for the distance —
   each edge's nearest point, clamped to the segment — and a crossing test for the SIGN, which is
   the part a convex shape does not need. This outline is concave in four places (either side of
   the fuselage, and the steps between wing root and tailplane), and a max-of-half-planes reads
   every one of them as outside. */
float planeSD(vec2 p, out vec2 grad){
  vec2 nb = p - PLANE[0];
  float d = dot(nb, nb);
  float s = 1.0;
  int j = PLANE_N - 1;
  for (int i = 0; i < PLANE_N; i++) {
    vec2 e = PLANE[j] - PLANE[i];
    vec2 w = p - PLANE[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float dd = dot(b, b);
    if (dd < d) { d = dd; nb = b; }
    bvec3 c = bvec3(p.y >= PLANE[i].y, p.y < PLANE[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  /* the field's own direction of steepest ascent — a unit vector, and the one the screen-space
     ramp below has to be measured along */
  grad = nb * inversesqrt(max(d, 1e-12));
  return s * sqrt(d);
}

void main(){
  vec2 q = (gl_PointCoord - vec2(0.5)) * 2.0;   /* [-1,1], +y DOWN in point-coord space */
  q.y = -q.y;                                    /* make +y up, so 0 rad points north */

  /* (#R411) ONE pixel of edge. q spans [-1,1] over v_px, so 1/v_px is half a pixel either side. */
  float aa = 1.0 / max(v_px, 1.0);

  vec3 pre;      /* colour, already multiplied by its own coverage — the blend is premultiplied */
  float cov;
  if (v_px < ${LOD_DOT_PX.toFixed(1)}) {
    /* LOD: below five device pixels an aeroplane and a dot are the same picture, and the dot stays
       legible where the silhouette would alias into noise. The aircraft is still drawn. */
    float r = length(q);
    cov = smoothstep(1.0, 1.0 - aa * 2.0, r);
    pre = v_col.rgb * cov;
  } else {
    mat2 minv = mat2(v_minv.xy, v_minv.zw);      /* (#R434) screen → the mark — see the note above */
    vec2 g;
    float d = planeSD(minv * q, g);
    aa *= length(vec2(dot(minv[0], g), dot(minv[1], g)));
    /* \`ctx.fill()\` and then \`ctx.stroke()\`, which is how this mark has always been drawn: the
       fill is everything inside the outline and the white band is painted OVER it. Composited as
       source-over rather than as two disjoint regions, because the band's inner half is white over
       the body colour and its outer half is white over nothing — those are not the same pixel, and
       a two-region shortcut loses the difference at every edge. */
    float fill = smoothstep(aa, -aa, d);
    float band = smoothstep(aa, -aa, abs(d) - HALF_STROKE) * ${GLYPH.STROKE_ALPHA.toFixed(2)};
    pre = vec3(band) + v_col.rgb * fill * (1.0 - band);
    cov = band + fill * (1.0 - band);
  }

  float a = cov * v_col.a;
  if (a <= 0.003) discard;
  fragColor = vec4(pre * v_col.a, a);
}`;

  function compile(gl, shaderData) {
    const pre = (shaderData && shaderData.vertexShaderPrelude) ||
      'uniform mat4 u_projection_matrix;\nvec4 projectTileFor3D(vec2 p,float e){return u_projection_matrix*vec4(p,e,1.0);}';
    const def = (shaderData && shaderData.define) || '';
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const v = mk(gl.VERTEX_SHADER, '#version 300 es\n' + def + '\n' + pre + '\n' + VERT);
    const f = mk(gl.FRAGMENT_SHADER, '#version 300 es\n' + def + '\n' + FRAG);
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    gl.deleteShader(v); gl.deleteShader(f);
    const loc = (n) => gl.getUniformLocation(p, n);
    return {
      p,
      a: {
        pos: gl.getAttribLocation(p, 'a_pos'), vel: gl.getAttribLocation(p, 'a_vel'),
        alt: gl.getAttribLocation(p, 'a_alt'), altv: gl.getAttribLocation(p, 'a_altv'),
        mscale: gl.getAttribLocation(p, 'a_mscale'), col: gl.getAttribLocation(p, 'a_col'),
        form: gl.getAttribLocation(p, 'a_form'),
      },
      u: {
        dt: loc('u_dt'), altScale: loc('u_altScale'), pxRatio: loc('u_pxRatio'),
        sizePx: loc('u_sizePx'), opacity: loc('u_opacity'),
        probe: loc('u_probe'), viewport: loc('u_viewport'),
        mat: loc('u_projection_matrix'), fallback: loc('u_projection_fallback_matrix'),
        tileCoords: loc('u_projection_tile_mercator_coords'), clip: loc('u_projection_clipping_plane'),
        transition: loc('u_projection_transition'),
      },
    };
  }

  /** mercator [0..1] from lng/lat — UNCLAMPED in y, as js/orbit-points.js is, so a high-latitude
      aircraft is off the top of a flat map rather than pinned to its edge. */
  function merc(lng, lat) {
    const x = (180 + lng) / 360;
    const p = Math.max(-89.9999, Math.min(89.9999, lat)) * D2R;
    const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;
    return [x, y];
  }

  /** metres → mercator units at this latitude; the reciprocal the shader multiplies altitude by */
  function metreScale(lat) {
    return 1 / Math.max(1, MERC_CIRC * Math.cos(lat * D2R));
  }

  function makeLayer(id) {
    const S = { n: 0, t0: 0, visible: true, opacity: 1, sizePx: 11 };
    let gl = null, prog = null, variant = null, mapRef = null, dirty = false;
    let bPos = null, bVel = null, bAlt = null, bAltV = null, bMs = null, bCol = null, bForm = null;
    let aPos = null, aVel = null, aAlt = null, aAltV = null, aMs = null, aCol = null, aForm = null;

    function upload() {
      dirty = false;
      const put = (buf, arr) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      };
      put(bPos, aPos); put(bVel, aVel); put(bAlt, aAlt); put(bAltV, aAltV);
      put(bMs, aMs); put(bCol, aCol); put(bForm, aForm);
    }

    return {
      id, type: 'custom', renderingMode: '3d',
      _state: S,

      /*  o.buffers — ALREADY IN GPU LAYOUT. This is the difference from orbit-points, which takes a
       *  list of objects and packs it here: at 50,000 aircraft the pack loop is the cost, so the
       *  Worker does it once and TRANSFERS the arrays. This method must stay O(1) in aircraft.
       *      pos  Float32Array(n*2)   mercator
       *      vel  Float32Array(n*2)   mercator/second
       *      alt  Float32Array(n)     metres      altv Float32Array(n)  metres/second
       *      ms   Float32Array(n)     metre scale
       *      col  Float32Array(n*4)   rgba 0..1
       *      form Float32Array(n*2)   [relative size, track radians]
       *  o.t0 — performance.now() the observation is valid at.
       */
      _set(o) {
        if (!o) return;
        if (o.buffers) {
          const b = o.buffers;
          aPos = b.pos; aVel = b.vel; aAlt = b.alt; aAltV = b.altv;
          aMs = b.ms; aCol = b.col; aForm = b.form;
          S.n = (aPos ? aPos.length >> 1 : 0);
          S.t0 = (o.t0 != null) ? o.t0 : ((typeof performance !== 'undefined') ? performance.now() : Date.now());
          dirty = true;
        }
        if (o.visible != null) S.visible = !!o.visible;
        if (o.opacity != null && isFinite(o.opacity)) S.opacity = Math.max(0, Math.min(1, +o.opacity));
        if (o.sizePx != null && isFinite(o.sizePx)) S.sizePx = Math.max(1, Math.min(64, +o.sizePx));
        try { if (mapRef && mapRef.triggerRepaint) mapRef.triggerRepaint(); } catch (_) { }
      },

      onAdd(map, ctx) {
        mapRef = map; gl = ctx;
        bPos = gl.createBuffer(); bVel = gl.createBuffer(); bAlt = gl.createBuffer();
        bAltV = gl.createBuffer(); bMs = gl.createBuffer(); bCol = gl.createBuffer();
        bForm = gl.createBuffer();
        dirty = !!aPos;
      },

      onRemove(map, ctx) {
        const g = ctx || gl; if (!g) return;
        try { [bPos, bVel, bAlt, bAltV, bMs, bCol, bForm].forEach((b) => b && g.deleteBuffer(b)); } catch (_) { }
        try { if (prog) g.deleteProgram(prog.p); } catch (_) { }
        prog = null; variant = null; gl = null;
      },

      render(ctx, args) {
        gl = ctx;
        if (!S.visible || !S.n || !aPos) return;
        const sd = args && args.shaderData, vname = (sd && sd.variantName) || 'mercator';
        if (!prog || variant !== vname) {
          try { if (prog) gl.deleteProgram(prog.p); prog = compile(gl, sd); variant = vname; }
          catch (e) { prog = null; try { console.warn('[IntMap aircraftPoints]', e && e.message); } catch (_) { } return; }
        }
        if (dirty) upload();
        if (!prog) return;

        const P = args && args.defaultProjectionData;
        gl.useProgram(prog.p);
        try {
          if (prog.u.mat && P && P.mainMatrix) gl.uniformMatrix4fv(prog.u.mat, false, new Float32Array(P.mainMatrix));
          if (prog.u.fallback && P && P.fallbackMatrix) gl.uniformMatrix4fv(prog.u.fallback, false, new Float32Array(P.fallbackMatrix));
          if (prog.u.tileCoords && P && P.tileMercatorCoords) gl.uniform4fv(prog.u.tileCoords, new Float32Array(P.tileMercatorCoords));
          if (prog.u.clip && P && P.clippingPlane) gl.uniform4fv(prog.u.clip, new Float32Array(P.clippingPlane));
          if (prog.u.transition) gl.uniform1f(prog.u.transition, (P && typeof P.projectionTransition === 'number') ? P.projectionTransition : 0);
        } catch (_) { }

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        /* ⚠ CAPPED — see the header. Past EXTRAP_MAX_S the glyph holds where it was rather than
           continuing along a velocity that is no longer evidence of anything. */
        gl.uniform1f(prog.u.dt, Math.max(0, Math.min(EXTRAP_MAX_S, (now - S.t0) / 1000)));
        gl.uniform1f(prog.u.altScale, (vname === 'mercator') ? 1 : 0);
        gl.uniform1f(prog.u.sizePx, S.sizePx);
        gl.uniform1f(prog.u.opacity, S.opacity);
        let pr = 1; try { pr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)); } catch (_) { }
        gl.uniform1f(prog.u.pxRatio, pr);
        /* (#R401) the two the heading probe needs. The viewport turns the projection's NDC
           difference into a shape with the screen's aspect ratio; without it a 16:9 canvas leans
           every glyph. Read from the drawing buffer rather than from the map, because that is the
           buffer this draw call is writing into. */
        gl.uniform2f(prog.u.viewport, gl.drawingBufferWidth || 1, gl.drawingBufferHeight || 1);
        let z = 0; try { z = mapRef && mapRef.getZoom ? mapRef.getZoom() : 0; } catch (_) { }
        if (!(z >= 0)) z = 0;
        gl.uniform1f(prog.u.probe, Math.max(PROBE_MERC_MIN, PROBE_PX / (TILE_PX * Math.pow(2, z))));

        const bind = (buf, loc, size) => {
          if (loc < 0) return;
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        };
        bind(bPos, prog.a.pos, 2); bind(bVel, prog.a.vel, 2); bind(bAlt, prog.a.alt, 1);
        bind(bAltV, prog.a.altv, 1); bind(bMs, prog.a.mscale, 1); bind(bCol, prog.a.col, 4);
        bind(bForm, prog.a.form, 2);

        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        /* ⚠ DEPTH TESTED, NOT DEPTH WRITTEN — the same rule js/orbit-points.js states. The globe's
           surface is drawn first and writes depth, so an aircraft on the far side of the planet is
           discarded by the test (§27.2 item 8). Writing depth would make the sprites occlude each
           other's anti-aliased edges. */
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, S.n);
        gl.depthMask(true);
      },
    };
  }

  return { makeLayer, merc, metreScale, EXTRAP_MAX_S, MERC_CIRC };
};
