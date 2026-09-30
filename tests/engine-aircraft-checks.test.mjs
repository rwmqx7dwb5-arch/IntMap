/* ============================================================================
 *  Live aircraft on the map — the mark (js/plane-glyph.js), how both engines draw it, the altitude it
 *  is drawn at, picking and the observed track.
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r379-checks (「航空機レイヤーの飛行機アイコンのデザインをもとに戻して。」), the
 *  aircraft halves of r172-checks (lifted with real geometry) and r173-checks (picked where drawn, the
 *  observed track), and r185-checks (the altitude readers do not read a part base). The aviation WIRE
 *  (codec, model, feed) is tests/backend-aviation-checks. Titles keep the round that wrote them.
 *
 *  #R379 — the mark this app shipped with is an airliner plan-form. #R183 replaced it, #R187 put it
 *  back, #R190–#R192 spent three rounds proving the two renderings of it were the SAME mark, and #R341
 *  then replaced it again — not as a decision, but as what a signed distance field costs when you write
 *  it for three vertices instead of eighteen. What these checks hold:
 *    ① the shader evaluates the plan-form, and the dart's numbers are gone from it
 *    ② there is ONE declaration of the mark, and nothing else carries a copy (the frozen `?aviation=v1`
 *      path that did was removed with its provider — remove-synthetic-planes)
 *    ③ neither engine types the outline out for itself — the #R341 defect
 *    ④ the vertices really do describe an aeroplane (asserted so that a triangle would fail)
 *    ⑤ the white stroke is half the mark, in both engines
 *    ⑥ the top of the size ramp is the original mark's own size, and the bottom is untouched
 *    ⑦ Cesium draws the pair, and never half of one
 *    ⑧ nobody who never opens the layer pays for any of it
 *  ⚠ Every source-text check reads CODE ONLY (scripts/code-only.mjs). Eleven times now a check in this
 *  repository has matched its own prose — and this file's prose is full of the word "dart".
 *  ⚠ The mark itself (js/plane-glyph.js) is EVALUATED; the shader (GLSL inside js/aircraft-points.js)
 *  and the Cesium billboards need WebGL, so those are read, and say so.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { appShell } from './app-source.mjs';
import { dispatchName } from './helpers/dispatch-spelling.mjs';   /* (atlas-one-declaration) a spelling reaches its case through the registry */
import { codeOnly as stripComments } from '../scripts/code-only.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootURL = new URL('../', import.meta.url);

/* ⚠ #R317: read through readLF so a CRLF working copy cannot make a source-text check permanently
   red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const { lazyFiles } = await import('./app-source.mjs');

const code = (rel) => codeOnly(readLF(join(ROOT, rel)));
const R = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/* (#R175) "the page" is index.html + src/main.js + js/app-body.js (+ js/geo-engine.js) */
const INDEX = appShell(rootURL);

/* the mark itself, evaluated — it is a window-global publisher, so give it a window for the length of
   the import and take the published object away with us */
const G = await (async () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  if (!had) globalThis.window = {};
  try { await import('../js/plane-glyph.js'); return globalThis.window.IntMapPlaneGlyph; }
  finally { if (!had) delete globalThis.window; }
})();

/** the array initialiser of `const <name> = [...]` in a file, as data */
function arrayFrom(rel, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;').exec(code(rel));
  return m ? JSON.parse(m[1].replace(/\s+/g, '')) : null;
}

/* ── ① THE SHADER EVALUATES THE PLAN-FORM ─────────────────────────────────────────────────────
   The dart was `triSD(p, vec2(0.0,0.98), …)` twice and a `max(body,-notch)`. Those numbers are facts
   about the shape, so their absence is the honest way to say the shape is gone.
   ⚠ READ, NOT RUN: GLSL compiled by WebGL. */
test('R379 ① the fragment shader tests the plan-form, and the dart is gone from it', () => {
  const src = code('js/aircraft-points.js');
  /* ⚠ (#R434) the signature grew an `out vec2 grad` — the field reports the direction of its own
     nearest edge, so the anti-aliasing ramp can be measured on the SCREEN. The field is still the
     plan-form's, not a dart's. */
  assert.match(src, /float planeSD\(vec2 p(, out vec2 grad)?\)/, 'the field is the plan-form\'s');
  assert.match(src, /\$\{GLYPH\.glsl\('PLANE'\)\}/, 'whose vertices are GENERATED from the one declaration');
  assert.match(src, /\$\{GLYPH\.SDF_HALF_STROKE/, 'and so is the width of its white band');
  assert.doesNotMatch(src, /triSD/, 'the triangle field is gone');
  for (const n of ['0.98', '0.72', '0.86', '0.12', '0.95'])
    assert.ok(!src.includes('vec2(0.0, ' + n) && !src.includes('vec2(-' + n),
      `the dart's ${n} is gone from the shader`);
  /* …and the LOD is still a LOD: below five device pixels the shape stops mattering, it does not stop
     being drawn. ⚠ (#R434) the five is a JS constant interpolated into the shader, because the vertex
     shader needs the same number. */
  assert.match(src, /const LOD_DOT_PX = 5;/, 'five device pixels, declared once');
  assert.match(src, /if \(v_px < \$\{LOD_DOT_PX\.toFixed\(1\)\}\)/,
    'the dot below five device pixels survives');
});

/* ── ② ONE DECLARATION, AND NOTHING ELSE CARRIES A COPY ────────────────────────────────────────
   Until remove-synthetic-planes, js/data-layers.js still rendered the old symbol layer for
   `?aviation=v1` and kept its own literal, which this test held to the shared one vertex for vertex.
   That path is gone with its provider, so the claim is now the stronger one it was standing in for:
   js/plane-glyph.js is the ONLY place the mark is written down. */
test('R379 ② the shared declaration is the only one — no second copy of the mark survives', () => {
  const dl = code('js/data-layers.js');
  assert.equal(arrayFrom('js/data-layers.js', '_PLANE_ORIG'), null, 'js/data-layers.js no longer declares an outline');
  assert.doesNotMatch(dl, /const\s+(?:_PLANE_ORIG|_PLANE_SIZE|PLANE_STROKE)\s*=/, 'nor a stroke width or size ramp of its own');
  assert.equal(G.OUTLINE.length, 18, 'the one declaration carries the eighteen vertices');
  assert.equal(G.STROKE, 2.6, 'the shared stroke is #R246\'s 2.6, not the original 1.6');
  assert.deepEqual(G.SIZE, [[2, 0.5], [5, 0.725], [9, 0.975]], 'and the size ramp is #R192\'s one table, #R247\'s scale');
});

/* ── ③ NEITHER ENGINE TYPES THE OUTLINE OUT FOR ITSELF ────────────────────────────────────────
   The defect this group exists for. #R341 transcribed its dart into the shader and into the Cesium
   sprite — two copies, nothing holding them together, and a comment saying so as if the saying were
   the mechanism.
   ⚠ READ, NOT RUN: a copy of the outline is a property of the text; both consumers need WebGL. */
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
   ⚠ WRITTEN SO THAT #R341's DART FAILS IT. A triangle from the nose to two trailing corners contains
   every point between them: it has no waist at mid-length, no gap between fuselage and outer wing,
   and no tailplane. Each assertion below is one of those three. */
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
   「元に戻せと言っているのに、色を勝手に変えるな。」 #R191 measured what that complaint was about: the
   restored mark had the silhouette and not the white line, and 0.037 white pixels per body pixel is
   the difference between the two. Both engines have to draw both halves.
   ⚠ READ, NOT RUN (the engine halves): GLSL and Cesium billboards need WebGL. */
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
   Restoring the shape without the size puts the old mark back at a third of it, which is a different
   picture again. The high stops are DERIVED from the same table `icon-size` was built from; the low
   ones are #R341's, and are deliberately not touched. */
test('R379 ⑥ high zoom is the original size; low zoom is untouched', () => {
  /* ⚠ READ (this half): the ramp is a MapLibre style expression in the lazy aviation controller */
  const src = code('js/aviation-live.js');
  assert.match(src, /\[8, G\.boxPx\(8\)\], \[9, G\.boxPx\(9\)\]/, 'the high stops are derived, not typed');
  assert.match(src, /\[0, 3\.5\], \[2, 5\.5\], \[5, 9\]/, 'and the low stops are the ones #R341 shipped');
  /* the numbers those produce: the artwork box, 44 × icon-size, held flat from z9 as the original
     interpolation was — an aeroplane that keeps growing to z14 was never part of the mark */
  assert.equal(G.boxPx(9), 44 * 0.975);
  assert.equal(G.boxPx(14), G.boxPx(9), 'flat above the table\'s last stop');
  assert.ok(G.boxPx(8) > 40 && G.boxPx(8) < G.boxPx(9), 'and z8 is on the way there');
  /* the silhouette inside that box is 37 units of 44 long (y from -19 to +18): 36.1 CSS px at z9,
     against the 19 px #R341's ramp gave at z11. ⚠ 37, not 2×19: the tail sits 18 units behind. */
  const span = Math.max(...G.OUTLINE.map((p) => p[1])) - Math.min(...G.OUTLINE.map((p) => p[1]));
  assert.equal(span, 37, 'nose to tail is 37 artwork units');
  assert.ok(Math.abs((span / G.CANVAS) * G.boxPx(9) - 36.1) < 0.1, 'the mark is 36.1 CSS px long from z9 up');
});

/* ── ⑦ CESIUM DRAWS THE PAIR, NEVER HALF OF ONE ───────────────────────────────────────────────
   A billboard's texel is multiplied by its colour, so one tint cannot make a coloured body and a white
   outline out of one image. Two billboards per aircraft, added in pairs so the index of one determines
   the index of the other, and hidden from twice the count.
   ⚠ READ, NOT RUN: a BillboardCollection on a live Cesium Scene (WebGL). */
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
   js/data-layers.js is eager (src/main.js imports it), which is why the shared module is NOT the one
   it reads: an import there would put the mark in the startup graph for a layer that is off by default.
   ⚠ READ, NOT RUN: an import graph is a property of the text. */
test('R379 ⑧ the shared declaration is behind the same door as the layer', () => {
  assert.doesNotMatch(code('src/main.js'), /plane-glyph/, 'the entry does not import it');
  assert.doesNotMatch(code('js/data-layers.js'), /plane-glyph/, 'and neither does the eager layer module');
  const lazy = lazyFiles(rootURL);
  assert.ok(lazy.includes('js/aviation-live.js'), 'the controller that reads it is load-on-demand');
  assert.match(code('js/engine-select.js'), /import\('\.\/cesium-engine\.js'\)/, 'and so is the second engine');
});

/* ══ THE ALTITUDE AN AIRCRAFT IS DRAWN AT, PICKING IT, AND ITS TRACK ════════════════════════════ */

/* ⚠ (remove-synthetic-planes) The lifted `fill-extrusion` bodies (#R172), the counters that read an
   aircraft's altitude off them (#R185) and the pick that projected them (#R173) belonged to the
   airplanes.live sweep's rendering and went with it. What the reader asked for in each survives in
   the GPU cloud, and these ask it there. R185's check has no counterpart — the cloud has no parts
   whose base could be mistaken for the aeroplane's altitude — and is withdrawn; the removal is
   measured in tests/remove-synthetic-planes-checks.test.mjs. */

/* ⚠ READ, NOT RUN: the cloud draws in a WebGL shader; the setting reaches it through two modules. */
test('#R172 aircraft are drawn at their real altitude, and the reader\'s setting decides it', () => {
  const d = stripComments(R('js/data-layers.js'));
  assert.match(d, /lift:planes3D/, 'the cloud is started with the reader\'s real-altitude setting');
  assert.match(d, /_av2\.setLift\(planes3D\)/, 'and told when the reader changes it');
  assert.match(d, /function planesLayerOn\(\)\{ try\{ return !!\(_av2&&_av2\.isOn\(\)\);/,
    '"is the layer on" asks the one rendering there is');
  const live = code('js/aviation-live.js');
  assert.match(live, /await W\(\)\.lift\(ST\.lift\)/, 'the controller hands it to the worker');
  const worker = code('src/aviation-worker.js');
  assert.match(worker, /liftAltitude = !!m\.on;/, 'which packs the altitude into what the GPU draws');
});

/* ⚠ READ, NOT RUN: picking projects through a live renderer; tests/maplibre-6-migration.spec.js ③
   measures the engine's projection against the pixels MapLibre draws. */
test('#R173 an aircraft can be picked where it is DRAWN, not where its shadow falls', () => {
  const d = stripComments(R('js/data-layers.js'));
  assert.match(d, /hex=_av2&&_av2\.pick\(e\.point\)/, 'the click asks the cloud\'s own pick');
  const live = code('js/aviation-live.js');
  /* the pre-cull radius carries an ALTITUDE ALLOWANCE, so a lifted aircraft is found where it is drawn */
  assert.match(live, /if \(ST\.lift\) \{/, 'the pick knows whether the aircraft are lifted');
  assert.match(live, /const rad = \(PICK_PX \* 3\) \/ world \+ altAllow;/, 'and widens its search by the altitude it draws at');
  assert.match(INDEX, /projectAltitude\(ll,altM\)\{/, 'the engine can project a point that is up in the air');
  /* (maplibre-6-migration) 6.0 removed transform.getMatrixForModel; the projection goes through the
     renderer's projection data (`_lifted`) */
  assert.match(INDEX, /projectAltitude\(ll,altM\)\{ const m=_m\(\); if\(!m\) return null;\s*try\{\s*const P=_lifted\(m\);/, 'through the renderer’s own projection data, so the globe is right too');
  assert.match(d, /events\.on\('mousemove',_planesHover\)/   /* (#R178) …through the contract */, 'hover uses it');
  assert.ok(!/map\.on\('click',ly,/.test(d),
    'ONE click handler: two of them each toggled, so a click that satisfied both selected and deselected in the same event');
  assert.equal((d.match(/events\.on\('click',_planesClear\)/g) || []).length, 1, 'and it is installed once');
});

test('#R173 the clicked aircraft draws the track this browser has actually observed', () => {
  /* RUN: _av2TrackApply is lifted out of js/data-layers.js with the buffers it closes over. The
     fixes are the worker's recording (#R506) — feet on the wire, metres in planeTracks. */
  const src = R('js/data-layers.js');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const want = ['FT_M', 'planeTracks', 'selectedPlane', '_av2TrackApply'];
  const stmts = [];
  walk.full(ast, (n) => {
    const hit = (n.type === 'FunctionDeclaration' && want.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => want.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  const drawn = [];
  const T = new Function('drawTrack', '_trackCard', 'window', `${stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n')}
    return { apply: _av2TrackApply, planeTracks, select: (k) => { selectedPlane = k; } };`)((k) => drawn.push(k), () => ({}), {});
  T.apply('abc123', [{ lon: 139, lat: 35, altFt: 10000, t: 1 }, { lon: 139.1, lat: 35, altFt: 10000, t: 2 }]);
  assert.equal(T.planeTracks.ABC123.length, 2, 'every recorded fix becomes a vertex, keyed by the upper-case ICAO address');
  assert.ok(Math.abs(T.planeTracks.ABC123[0][2] - 3048) < 1e-6, 'and its altitude is metres — the wire is feet');
  assert.equal(drawn.length, 0, 'an aircraft nobody selected is recorded, not drawn');
  T.select('ABC123');
  T.apply('abc123', [{ lon: 139, lat: 35, altFt: 0, t: 1 }, { lon: null, lat: 35, t: 2 }]);
  assert.equal(T.planeTracks.ABC123.length, 1, 'a fix without a position is not a vertex');
  assert.deepEqual(drawn, ['ABC123'], 'the selected aircraft\'s track is redrawn when its fixes arrive');
  T.apply('abc123', []);
  assert.equal(T.planeTracks.ABC123, undefined, 'an aircraft the worker no longer has fixes for is forgotten');
  /* ⚠ READ (these halves): the ribbon, the tooltip and Atlas's action live in the booted layer/console */
  const d = stripComments(src);
  assert.match(d, /function legRing\(a,b,halfM\)/, 'each leg becomes a ribbon…');
  assert.match(d, /properties:\{kind:'leg',alt,top:alt\+thick\}/, '…extruded at the altitude that leg was flown at');
  assert.match(d, /Observed track:/, 'the tooltip says what the track is, because there is no history feed behind it');
  /* (#R318) …plus js/atlas-catalog-text.js, where the action catalogue lives now. */
  const a = (R('js/atlas-console.js') + '\n' + capsSource()) + '\n' + R('js/atlas-catalog-text.js');
  assert.ok(capabilityEntry('aircraftTrack'), 'Atlas can do it too (#R82)');
  assert.equal(dispatchName('planeTrack'), 'aircraftTrack', '…under either spelling its row declares (atlas-one-declaration)');
  assert.match(a, /\{"type":"aircraftTrack","aircraft":str/, '…and the catalogue says so, or the planner cannot reach it (#R115)');
});
