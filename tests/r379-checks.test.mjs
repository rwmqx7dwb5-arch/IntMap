/* ============================================================================
 *  #R379 — 「航空機レイヤーの飛行機アイコンのデザインをもとに戻して。」
 * ----------------------------------------------------------------------------
 *  The mark this app shipped with is an airliner plan-form. #R183 replaced it, #R187 put it back,
 *  #R190–#R192 spent three rounds proving the two renderings of it were the SAME mark, and #R341
 *  then replaced it again — not as a decision, but as what a signed distance field costs when you
 *  write it for three vertices instead of eighteen.
 *
 *  What these checks hold:
 *    ① the shader evaluates the plan-form, and the dart's numbers are gone from it
 *    ② there is ONE declaration of the mark, and the frozen `?aviation=v1` path still agrees with it
 *    ③ neither engine types the outline out for itself — the #R341 defect this file is named for
 *    ④ the vertices really do describe an aeroplane (asserted so that a triangle would fail)
 *    ⑤ the white stroke is half the mark, in both engines
 *    ⑥ the top of the size ramp is the original mark's own size, and the bottom is untouched
 *    ⑦ Cesium draws the pair, and never half of one
 *    ⑧ nobody who never opens the layer pays for any of it
 *
 *  ⚠ Every source-text check reads CODE ONLY (scripts/code-only.mjs). Eleven times now a check in
 *  this repository has matched its own prose — and this file's prose is full of the word "dart".
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootURL = new URL('../', import.meta.url);

/* ⚠ #R317: read through readLF so a CRLF working copy cannot make a source-text check permanently
   red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const { lazyFiles } = await import('./app-source.mjs');

const code = (rel) => codeOnly(readLF(join(ROOT, rel)));

/* the module itself, evaluated — it is a window-global publisher, so give it a window */
globalThis.window = globalThis.window || {};
await import('../js/plane-glyph.js');
const G = globalThis.window.IntMapPlaneGlyph;

/** the array initialiser of `const <name> = [...]` in a file, as data */
function arrayFrom(rel, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;').exec(code(rel));
  return m ? JSON.parse(m[1].replace(/\s+/g, '')) : null;
}

/* ── ① THE SHADER EVALUATES THE PLAN-FORM ─────────────────────────────────────────────────────
   The dart was `triSD(p, vec2(0.0,0.98), …)` twice and a `max(body,-notch)`. Those numbers are
   facts about the shape, so their absence is the honest way to say the shape is gone. */
test('R379 ① the fragment shader tests the plan-form, and the dart is gone from it', () => {
  const src = code('js/aircraft-points.js');
  assert.match(src, /float planeSD\(vec2 p\)/, 'the field is the plan-form\'s');
  assert.match(src, /\$\{GLYPH\.glsl\('PLANE'\)\}/, 'whose vertices are GENERATED from the one declaration');
  assert.match(src, /\$\{GLYPH\.SDF_HALF_STROKE/, 'and so is the width of its white band');
  assert.doesNotMatch(src, /triSD/, 'the triangle field is gone');
  for (const n of ['0.98', '0.72', '0.86', '0.12', '0.95'])
    assert.ok(!src.includes('vec2(0.0, ' + n) && !src.includes('vec2(-' + n),
      `the dart's ${n} is gone from the shader`);
  /* …and the LOD is still a LOD: below five device pixels the shape stops mattering, it does not
     stop being drawn (§11, and the rule #R341 stated in as many words) */
  assert.match(src, /if \(v_px < 5\.0\)/, 'the dot below five device pixels survives');
});

/* ── ② ONE DECLARATION, AND THE FROZEN PATH STILL AGREES WITH IT ──────────────────────────────
   js/data-layers.js still renders the old symbol layer for `?aviation=v1`, and #R341 left it
   byte-for-byte alone on purpose. So it keeps its own literal — and this is what stops that from
   becoming a second, drifting truth. */
test('R379 ② the shared declaration is the frozen v1 path\'s, vertex for vertex', () => {
  const orig = arrayFrom('js/data-layers.js', '_PLANE_ORIG');
  assert.ok(Array.isArray(orig) && orig.length === 18, 'js/data-layers.js still declares _PLANE_ORIG');
  assert.deepEqual(G.OUTLINE, orig, 'js/plane-glyph.js carries the same eighteen vertices');

  const stroke = /const\s+PLANE_STROKE\s*=\s*([\d.]+)\s*;/.exec(code('js/data-layers.js'));
  assert.ok(stroke, 'and the v1 path still declares its stroke width');
  assert.equal(G.STROKE, Number(stroke[1]), 'the shared stroke is #R246\'s 2.6, not the original 1.6');

  const size = arrayFrom('js/data-layers.js', '_PLANE_SIZE');
  assert.deepEqual(G.SIZE, size, 'and the size ramp is the same table (#R192 stated it once, #R247 scaled it)');
});

/* ── ③ NEITHER ENGINE TYPES THE OUTLINE OUT FOR ITSELF ────────────────────────────────────────
   This is the defect the file exists for. #R341 transcribed its dart into the shader and into the
   Cesium sprite — two copies, nothing holding them together, and a comment saying so as if the
   saying were the mechanism. */
test('R379 ③ both engines READ the mark; neither declares it', () => {
  for (const f of ['js/aircraft-points.js', 'js/cesium-engine.js']) {
    const src = code(f);
    assert.match(src, /IntMapPlaneGlyph/, `${f} reads the shared declaration`);
    assert.match(src, /import '\.\/plane-glyph\.js'/, `${f} names the dependency in the module graph`);
    /* an 18-vertex outline typed here would show up as a long list of coordinate pairs */
    const pairs = (src.match(/\[\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\]/g) || []).length;
    assert.ok(pairs < 6, `${f} does not carry a polygon of its own (${pairs} coordinate pairs)`);
  }
  assert.doesNotMatch(code('js/cesium-engine.js'), /dartSprite/, 'the dart sprite builder is gone');
  assert.match(code('js/cesium-engine.js'), /function planeSprites\(\)/, 'and the mark is built from the shared path');
});

/* ── ④ THE VERTICES DESCRIBE AN AEROPLANE ─────────────────────────────────────────────────────
   ⚠ WRITTEN SO THAT #R341's DART FAILS IT. A triangle from the nose to two trailing corners
   contains every point between them: it has no waist at mid-length, no gap between fuselage and
   outer wing, and no tailplane. Each assertion below is one of those three. */
test('R379 ④ the outline is a fuselage, swept wings and a tailplane — not a triangle', () => {
  const inside = (x, y) => {          /* even-odd crossing test, in the artwork's own units */
    let n = false;
    for (let i = 0, j = G.OUTLINE.length - 1; i < G.OUTLINE.length; j = i, i++) {
      const [xi, yi] = G.OUTLINE[i], [xj, yj] = G.OUTLINE[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  assert.ok(inside(0, -18), 'the nose is inside');
  assert.ok(!inside(0, -20), '…and 19 units up is where it ends');
  assert.ok(inside(2.0, -4) && !inside(3.0, -4), 'the fuselage is 2.2 units of half-width at mid-body');
  assert.ok(inside(16, 7), 'the wing reaches 17 units out');
  assert.ok(!inside(8, 8), 'and there is OPEN AIR between fuselage and outer wing at the trailing edge');
  assert.ok(inside(4, 17), 'the tailplane is there');
  assert.ok(!inside(10, 17), '…and it is far narrower than the wing');
  const xs = G.OUTLINE.map((p) => p[0]), ys = G.OUTLINE.map((p) => p[1]);
  assert.equal(Math.max(...xs), 17, 'half-span 17');
  assert.equal(Math.min(...ys), -19, 'and half-length 19 — the number icon-size multiplied');
  /* the mark, stroke included, fits the sprite it is drawn in */
  const reach = (19 + G.STROKE / 2) / G.HALF;
  assert.ok(reach < 1, `the mark reaches ${reach.toFixed(3)} of the sprite half and is not clipped`);
});

/* ── ⑤ THE WHITE STROKE IS HALF THE MARK ──────────────────────────────────────────────────────
   「元に戻せと言っているのに、色を勝手に変えるな。」 #R191 measured what that complaint was about:
   the restored mark had the silhouette and not the white line, and 0.037 white pixels per body
   pixel is the difference between the two. Both engines have to draw both halves. */
test('R379 ⑤ the mark is a coloured body AND a white outline, on both engines', () => {
  const shader = code('js/aircraft-points.js');
  assert.match(shader, /float band = smoothstep\(aa, -aa, abs\(d\) - HALF_STROKE\)/, 'the shader paints the band');
  assert.match(shader, /pre = vec3\(band\) \+ v_col\.rgb \* fill \* \(1\.0 - band\)/, 'over the fill, as source-over');
  const ces = code('js/cesium-engine.js');
  assert.match(ces, /AIR_RIM_ALPHA\s*=\s*0\.95/, 'Cesium tints the rim at the stroke\'s own alpha');
  assert.equal(G.STROKE_ALPHA, 0.95, '…which is the shared declaration\'s');
  assert.match(ces, /rim\.color\s*=\s*C/, 'and the rim is coloured per aircraft');
  assert.match(ces, /core\.color\s*=\s*C/, 'beside the body');
});

/* ── ⑥ THE TOP OF THE RAMP IS THE ORIGINAL MARK'S OWN SIZE ────────────────────────────────────
   Restoring the shape without the size puts the old mark back at a third of it, which is a
   different picture again. The high stops are DERIVED from the same table `icon-size` was built
   from; the low ones are #R341's, and are deliberately not touched — see the note in the source. */
test('R379 ⑥ high zoom is the original size; low zoom is untouched', () => {
  const src = code('js/aviation-live.js');
  assert.match(src, /\[8, G\.boxPx\(8\)\], \[9, G\.boxPx\(9\)\]/, 'the high stops are derived, not typed');
  assert.match(src, /\[0, 3\.5\], \[2, 5\.5\], \[5, 9\]/, 'and the low stops are the ones #R341 shipped');
  /* the numbers those produce: the artwork box, 44 × icon-size, held flat from z9 as the original
     interpolation was — an aeroplane that keeps growing to z14 was never part of the mark */
  assert.equal(G.boxPx(9), 44 * 0.975);
  assert.equal(G.boxPx(14), G.boxPx(9), 'flat above the table\'s last stop');
  assert.ok(G.boxPx(8) > 40 && G.boxPx(8) < G.boxPx(9), 'and z8 is on the way there');
  /* the silhouette inside that box is 37 units of 44 long (y from -19 to +18): 36.1 CSS px at z9,
     against the 19 px #R341's ramp gave at z11 — the measurement the size question was decided on.
     ⚠ 37, not 2×19: the tail sits 18 units behind the centre, the nose 19 in front. */
  const span = Math.max(...G.OUTLINE.map((p) => p[1])) - Math.min(...G.OUTLINE.map((p) => p[1]));
  assert.equal(span, 37, 'nose to tail is 37 artwork units');
  assert.ok(Math.abs((span / G.CANVAS) * G.boxPx(9) - 36.1) < 0.1, 'the mark is 36.1 CSS px long from z9 up');
});

/* ── ⑦ CESIUM DRAWS THE PAIR, NEVER HALF OF ONE ───────────────────────────────────────────────
   A billboard's texel is multiplied by its colour, so one tint cannot make a coloured body and a
   white outline out of one image. Two billboards per aircraft, added in pairs so the index of one
   determines the index of the other, and hidden from twice the count. */
test('R379 ⑦ Cesium pairs the two billboards, and hides from twice the count', () => {
  const src = code('js/cesium-engine.js');
  assert.match(src, /while\(B\.length<m\*2\)/, 'the pool grows in pairs');
  assert.match(src, /B\.get\(k\*2\), core=B\.get\(k\*2\+1\)/, 'rim at the even index, core at the odd');
  assert.match(src, /for\(let k=m\*2,L=B\.length;k<L;k\+\+\)/, 'and the surplus is hidden from 2m, not m');
  assert.match(src, /A\.bbs\.get\(k\*2\), core=A\.bbs\.get\(k\*2\+1\)/, 'the style sweep uses the same pairing');
  assert.match(src, /rim\.position=p; rim\.rotation=rot/, 'and the rim rides the core exactly');
  /* the two sprites do not overlap, so which of them a collection draws first cannot change the
     picture — #R192's reason for making the lifted 3-D body a ring plus a core */
  assert.match(src, /core\.g\.globalCompositeOperation='destination-out'/, 'the core is the outline inset');
  assert.match(src, /rim\.g\.lineWidth=G\.STROKE\*k/, 'and the rim is the annulus the stroke paints');
});

/* ── ⑧ NOBODY WHO NEVER OPENS THE LAYER PAYS FOR IT ───────────────────────────────────────────
   js/data-layers.js is eager (src/main.js imports it), which is why the shared module is NOT the
   one it reads: an import there would put the mark in the startup graph for the sake of a layer
   that is off by default. */
test('R379 ⑧ the shared declaration is behind the same door as the layer', () => {
  assert.doesNotMatch(code('src/main.js'), /plane-glyph/, 'the entry does not import it');
  assert.doesNotMatch(code('js/data-layers.js'), /plane-glyph/, 'and neither does the eager layer module');
  const lazy = lazyFiles(rootURL);
  assert.ok(lazy.includes('js/aviation-live.js'), 'the controller that reads it is load-on-demand');
  assert.match(code('js/engine-select.js'), /import\('\.\/cesium-engine\.js'\)/, 'and so is the second engine');
});
