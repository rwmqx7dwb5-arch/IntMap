/* ============================================================================
 *  #R401 — 「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。
 *           また、より低ズームでもより多くの航空機が表示されるように。」
 * ----------------------------------------------------------------------------
 *  Two reports, two root causes, and neither of them was in the place the symptom pointed at.
 *
 *  ① THE MARK'S ANGLE WAS A COMPASS BEARING HANDED TO A SCREEN-ALIGNED SPRITE. A gl.POINTS sprite
 *     is axis-aligned to the viewport, so `v_rot = a_form.y` draws every aircraft against a compass
 *     that is not on the screen any more the moment the map turns or tilts. Measured with a probe
 *     aircraft at the canvas centre (sprite box 64 px), the mark ignored PITCH, ignored BEARING and
 *     was MIRRORED as well — a track of 090° drew the nose pointing 085° west. The angle is now the
 *     difference of two projections, so the map's own matrix supplies all three answers.
 *     ⚠ The claim that the PIXELS moved is in tests/r379.spec.js, which owns the mark's rendering.
 *     Nothing here can see a shader; what a source-level check can hold is that the angle is no
 *     longer read straight out of the attribute, and that the rotation turns the way it says.
 *
 *  ② THE VIEWPORT CHANNEL WAS NOT ASKED BELOW z3.5, AND WHEN IT WAS ASKED IT READ THE WRONG SKY.
 *     Measured against production, parked over North America with the layer on for 45 s:
 *
 *         z3.2  →  ?ch=world ×3 only          4 aircraft on screen  →   4
 *         z4.2  →  ?ch=view ×4 as well        0 aircraft on screen  → 177
 *
 *     …and `tilesForBbox`, the function that decides WHICH tiles a viewport read asks for, walked
 *     its candidates from the box's SOUTH-WEST CORNER and stopped at `max × 8` of them before
 *     sorting by distance from the centre. For any view wider than about 40° the cap was reached on
 *     the first row, so the sort could only choose between tiles on the box's southern edge:
 *
 *         the whole world (centred on Tokyo)  →  four tiles at latitude −58  (the Southern Ocean)
 *         Europe at z2                        →  four tiles at latitude  26  (the Sahara)
 *         Japan  at z3                        →  four tiles at latitude  18  (the Philippine Sea)
 *
 *     A cap applied before the selection IS the selection (#R320, #R388). The candidates now fan
 *     out from the centre, so the cap can only ever discard the farthest.
 *
 *  ⚠ Every source-text check reads CODE ONLY (scripts/code-only.mjs). Twelve times now a check in
 *  this repository has matched its own prose, and this file's prose is full of the words it greps
 *  for.
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

/* The three views the report was measured on, as the app's own `getBounds()` reported them, plus
   the camera latitude each one was taken at. ⚠ The bbox mid-latitude is NOT the camera latitude —
   Mercator stretches away from the equator — and mistaking one for the other is half of ②. */
const VIEWS = [
  { name: 'the whole world, centred on Tokyo', bbox: [5.1, -58.2, 274.4, 81.4], camera: [139.767, 35.681] },
  { name: 'Japan at z3', bbox: [101.1, 6.6, 178.4, 57.1], camera: [139.75, 35.681] },
  { name: 'Europe at z2', bbox: [-60, 20, 80, 70], camera: [10, 51.4] },
];
const RADIUS_NM = 250;
/* one lattice row, in degrees of latitude — the resolution the answer can possibly have */
const ROW_DEG = (RADIUS_NM * 1.852 * Math.sqrt(3) * 0.96) * (Math.sqrt(3) / 2) / 111.32;

/* ── ① THE VIEWPORT READ ASKS ABOUT THE SKY IN THE MIDDLE OF THE VIEW ─────────────────────────
   This is the assertion the old implementation fails by 90 degrees of latitude. */
test('R401 ① a wide viewport asks for tiles at the centre of the view, not along its edge', () => {
  for (const v of VIEWS) {
    const [w, s, e, n] = v.bbox;
    const tiles = M.tilesForBbox(w, s, e, n, RADIUS_NM, 4, 75);
    assert.ok(tiles.length > 0, v.name + ': it asks for something');
    const [cLon, cLat] = v.camera;
    for (const t of tiles) {
      assert.ok(Math.abs(t.lat - cLat) <= ROW_DEG * 1.5,
        v.name + ': tile latitude ' + t.lat + ' is not the view centre ' + cLat +
        ' (arithmetic mid-latitude would be ' + ((s + n) / 2).toFixed(1) + ')');
    }
    /* …and in longitude too, allowing for the wrap */
    for (const t of tiles) {
      const d = Math.abs(((t.lon - cLon + 540) % 360) - 180);
      assert.ok(d <= 12, v.name + ': tile longitude ' + t.lon + ' is far from ' + cLon);
    }
  }
});

/* ── ② THE CAP MAY ONLY DISCARD THE FARTHEST ──────────────────────────────────────────────────
   The defect was not "too few tiles", it was that the truncation happened BEFORE the choice. So
   the property to hold is that asking for more tiles never changes which sky the first ones cover:
   the four a viewport read takes must be among the twelve a bigger budget would take. Under the
   old corner-first walk this is false for a wide box — a larger cap reaches further north and the
   nearest-first sort then returns an entirely different set. */
test('R401 ② asking for more tiles only ADDS sky — the first ones do not move', () => {
  const key = (t) => t.lat + '/' + t.lon;
  for (const v of VIEWS) {
    const [w, s, e, n] = v.bbox;
    const four = M.tilesForBbox(w, s, e, n, RADIUS_NM, 4, 75).map(key);
    const twelve = new Set(M.tilesForBbox(w, s, e, n, RADIUS_NM, 12, 75).map(key));
    for (const k of four) {
      assert.ok(twelve.has(k), v.name + ': ' + k + ' is dropped when the budget grows');
    }
  }
});

/* ── ③ AND THE BOUNDS #R341 MEASURED STILL HOLD ───────────────────────────────────────────────
   The fan-out is a change to WHICH tiles are asked for, never to HOW MANY. The cap, the latitude
   limit and the antimeridian are the three things a bbox-to-tiles routine gets wrong, and #R341
   pinned all three in tests/r341-checks — this re-asks them of a WIDE box, which is the case that
   never reached those assertions because the old walk never got past the first row. */
test('R401 ③ a world-sized view is still capped, clamped, wrapped and free of duplicates', () => {
  for (const max of [1, 4, 8, 12]) {
    const tiles = M.tilesForBbox(-180, -85, 180, 85, RADIUS_NM, max, 75);
    assert.ok(tiles.length > 0 && tiles.length <= max, 'cap ' + max + ' respected: ' + tiles.length);
    const seen = new Set();
    for (const t of tiles) {
      assert.ok(t.lat >= -75.001 && t.lat <= 75.001, 'clamped to the latitude limit: ' + t.lat);
      assert.ok(t.lon >= -180 && t.lon <= 180, 'longitude stays wrapped: ' + t.lon);
      assert.ok(!seen.has(t.lat + '/' + t.lon), 'no duplicate tile centre');
      seen.add(t.lat + '/' + t.lon);
    }
  }
});

/* ── ④ ZOOM NO LONGER DECIDES WHETHER THE VIEWPORT IS ASKED ABOUT ─────────────────────────────
   The floor was a `return` in pollView, not a flag anybody could see from outside — so the check
   has to read the function. It also has to make sure the floor did not come back as a constant of
   zero, which is a gate that can never fire and reads as a live rule to the next person. */
test('R401 ④ pollView asks about the viewport at every zoom', () => {
  const src = code('js/aviation-live.js');
  const m = /async function pollView\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(m, 'pollView is still a function in js/aviation-live.js');
  const body = m[1];
  assert.doesNotMatch(body, /getZoom/, 'pollView does not consult the zoom: ' + body.trim());
  assert.doesNotMatch(src, /VIEW_ZOOM_MIN/, 'the floor is gone, not renamed');
  assert.doesNotMatch(src, /VIEW_POLL_MIN_ZOOM/, 'and it did not come back as a floor of zero');
  /* the world channel never had a floor and must not acquire one */
  const mw = /async function pollWorld\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(mw, 'pollWorld is still a function');
  assert.doesNotMatch(mw[1], /getZoom/, 'and the world channel still does not consult the zoom');
  /* zoom is still allowed to decide the SIZE of the mark — that is the LOD, and it stays */
  assert.match(src, /function sizeForZoom\(z\)/, 'zoom still decides how big an aircraft is drawn');
});

/* ── ⑤ THE SPRITE'S ANGLE IS DERIVED, NOT COPIED ──────────────────────────────────────────────
   Two claims, both of which the #R341 shader fails:
     · the vertex shader PROJECTS TWICE — once for the aircraft and once for a point ahead of it —
       because a screen angle cannot be got from one projected point;
     · the fragment shader's rotation is the CLOCKWISE one. mat2 takes its columns, so the mirrored
       version differs from the correct one only in where two minus signs sit, and the one test that
       drew the mark before this round drew it tracking due north, where the matrix is the identity
       either way. */
test('R401 ⑤ the mark is turned by a screen angle, clockwise', () => {
  const src = code('js/aircraft-points.js');
  const vert = /const VERT = `([\s\S]*?)`;/.exec(src);
  assert.ok(vert, 'the vertex shader source is still a template literal named VERT');
  const projections = (vert[1].match(/projectTileFor3D\s*\(/g) || []).length;
  assert.equal(projections, 2,
    'the vertex shader projects the aircraft AND a point along its track (found ' + projections + ')');
  assert.match(vert[1], /v_rot\s*=\s*atan\(/, 'and v_rot is an angle it computed');
  assert.doesNotMatch(vert[1], /v_rot\s*=\s*a_form\.y\s*;/,
    'v_rot is no longer the reported bearing handed straight to a screen-aligned sprite');

  const frag = /const FRAG = `([\s\S]*?)`;/.exec(src);
  assert.ok(frag, 'the fragment shader source is still a template literal named FRAG');
  assert.match(frag[1], /mat2\(c,\s*s,\s*-s,\s*c\)/, 'the sprite is turned clockwise');
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
