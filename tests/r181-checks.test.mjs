// R181 source-level checks (deterministic, no browser).
//
// 「全部点検して全部直して。」— this round found six defects by driving BOTH engines through the
// same contract and diffing every answer. The browser half of the evidence is in
// tests/r181-cesium.spec.js; what is here is the part that can be pinned in the SOURCE, so a
// future edit that quietly re-opens one of them fails immediately rather than at the next audit.
//
// Each check names the measurement that found the defect, because the number is the reason the
// fix looks the way it does — see DEV-NOTES #R181.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import * as acorn from 'acorn';
import { scanAll, VALUE_BUDGET, ENGINE_FILE } from '../scripts/engine-coupling.mjs';

const ROOT = new URL('../', import.meta.url);
const R = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ══ ① THE IMAGERY: EVERY TEXTURE THIS ENGINE MAKES IS ORIENTED IN ONE PLACE ═══════════════
   The reported defect. A tile handed to Cesium as an ImageBitmap is uploaded upside down,
   because the WebGL spec ignores UNPACK_FLIP_Y_WEBGL for that source type — and since each
   tile flips about its own centre the map tears into tile rows rather than simply mirroring.
   Four producers in js/cesium-layers.js hand over a bitmap; all four were affected. */

test('R181 ①: no texture producer builds a bitmap without saying which way up it is', () => {
  const src = R('js/cesium-layers.js');
  /* the only createImageBitmap calls allowed to omit an orientation are the ones whose result
     is READ (the DEM decoder samples pixels through a 2-D canvas) rather than uploaded */
  const offenders = [];
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (!/createImageBitmap\s*\(/.test(ln)) return;
    if (/imageOrientation/.test(ln)) return;
    if (/await r\.blob\(\)/.test(ln)) return;          // the DEM decode — sampled, never a texture
    offenders.push(`${i + 1}: ${ln.trim().slice(0, 90)}`);
  });
  assert.deepEqual(offenders, [], 'a bitmap that becomes a texture must be decoded flipY — ' +
    'see toTexture(); an unoriented one renders the tile upside down and tears the map into rows');
});

test('R181 ①: transferToImageBitmap is gone — it cannot carry an orientation', () => {
  const src = R('js/cesium-layers.js');
  const uses = src.split('\n')
    .map((ln, i) => [i + 1, ln])
    .filter(([, ln]) => /\.transferToImageBitmap\s*\(/.test(ln) && !/^\s*\*/.test(ln));
  assert.deepEqual(uses.map(([n]) => n), [],
    'transferToImageBitmap takes no options, so a canvas transferred that way arrives upside down');
});

test('R181 ①: all four texture producers go through the one helper', () => {
  const src = R('js/cesium-layers.js');
  assert.match(src, /function toTexture\(/, 'the single place that decides orientation');
  /* hillshade, colour-relief and heatmap each end in the helper… */
  assert.equal((src.match(/return toTexture\(c\);/g) || []).length, 3,
    'hillshade, colour relief and the heatmap each hand their canvas over through it');
  /* …and so does the protocol path, for both shapes a handler may return */
  const proto = src.slice(src.indexOf('const proto=scheme&&protocols['));
  assert.match(proto, /toTexture\(d\)/, 'a handler that already returns a bitmap');
  assert.match(proto, /toTexture\(new Blob\(\[d\]\)\)/, 'a handler that returns encoded bytes');
});

/* ══ ② THE CAMERA: A BEARING READ OFF A QUANTITY THAT IS NOT THERE ═════════════════════════
   At pitch 0 the horizontal part of the look-at offset is zero by definition, and the guard
   that was supposed to notice sat four orders of magnitude below its own residue — so `atan2`
   was handed rounding and answered with a direction (67.34° at z9, 123.54° at z6, −177.63° at
   boot, for a camera pointing due north). */

test('R181 ②: the degenerate-offset guard scales with range and is far above the residue', () => {
  const src = R('js/cesium-engine.js');
  assert.doesNotMatch(src, /horiz\s*>\s*range\s*\*\s*1e-9/,
    'the old constant was BELOW the measured residue at every zoom, so it never fired');
  const m = src.match(/_enuNoise\(range\)\{[\s\S]{0,220}?return\s+r\s*\*\s*([0-9.e-]+)\s*;/);
  assert.ok(m, '_enuNoise must derive the threshold from the range it was given');
  const k = Number(m[1]);
  /* the gap it has to sit in, both ends measured (DEV-NOTES #R181):
       largest residue seen  horiz/range = 8.4e-8   (z1.7)
       smallest real signal  sin(0.5°)   = 8.7e-3            */
  assert.ok(k > 8.4e-8 * 10, `${k} leaves under 10x of margin over the largest residue measured`);
  assert.ok(k < 8.7e-3 / 100, `${k} is within 100x of half a degree of real tilt`);
});

test('R181 ②: the same predicate decides the readback and the repair', () => {
  const src = R('js/cesium-engine.js');
  const uses = (src.match(/_enuNoise\(range\)/g) || []).length;
  assert.ok(uses >= 2, 'both _hpr (reading the bearing back) and _faceHeading (putting it there) ' +
    'must ask the same question, or they can disagree about the same camera');
  assert.match(src, /_faceHeading\(bearing,pitch,range\)/, 'the repair exists');
  /* it must not be a second copy of the geometry: it turns until Cesium's own heading agrees */
  const fn = src.slice(src.indexOf('_faceHeading(bearing,pitch,range){'));
  assert.match(fn.slice(0, 900), /twistRight/,
    'a twist about the view axis keeps the position and the look direction exactly as lookAt left them');
  assert.doesNotMatch(fn.slice(0, 900), /setView\(\{\s*orientation/,
    'setView aims down the normal at the CAMERA, which on an oblate ellipsoid is not the line ' +
    'back to the target — measured, it slid the look-point 11 m at z9');
});

test('R181 ②: every path that re-asserts the camera re-asserts the heading', () => {
  const src = R('js/cesium-engine.js');
  const calls = (src.match(/this\._faceHeading\(/g) || []).length;
  assert.ok(calls >= 2, 'setCamera and _settle both place the eye with lookAt, and lookAt is ' +
    'exactly what drops the heading when the orbit offset is vertical');
});

/* ══ ③ THE EVENTS: A SUBSCRIPTION WITH NO SOURCE IS A FEATURE THAT NEVER RUNS ══════════════ */

test('R181 ③: the adapter can raise every event name the app subscribes to', () => {
  const wanted = new Set();
  for (const f of readdirSync(new URL('js', ROOT)).filter((x) => x.endsWith('.js'))) {
    for (const m of R('js/' + f).matchAll(/events\.(?:on|once)\('([a-z]+)'/g)) wanted.add(m[1]);
  }
  const eng = R('js/cesium-engine.js');
  /* names raised literally, plus the ones dispatched from the DOM listener table */
  const raised = new Set();
  for (const m of eng.matchAll(/fire\('([a-z]+)'/g)) raised.add(m[1]);
  for (const m of eng.matchAll(/dispatch\('([a-z]+)'/g)) raised.add(m[1]);
  for (const m of eng.matchAll(/\['([a-z]+)',(?:true|false)\]/g)) raised.add(m[1]);
  for (const m of eng.matchAll(/\['pointer[a-z]+','([a-z]+)'\]/g)) raised.add(m[1]);
  const missing = [...wanted].filter((n) => !raised.has(n)).sort();
  assert.deepEqual(missing, [], 'each of these is subscribed to somewhere in js/ and would ' +
    'silently never fire on the second engine');
});

test('R181 ③: mousedown/mouseup come from the pointer, not the mouse', () => {
  const src = R('js/cesium-engine.js');
  assert.match(src, /\['pointerdown','mousedown'\]/,
    'Cesium binds pointer events and prevents their default, which suppresses the browser\'s ' +
    'compatibility mouse events — measured 0 mousedown against 4 on MapLibre');
  assert.match(src, /\['pointerup','mouseup'\]/);
  assert.match(src, /pointerType&&e\.pointerType!=='mouse'/,
    'a touch already arrives as touchstart/touchend; MapLibre does not raise mousedown for one');
});

test('R181 ③: leaving the canvas closes out the layer hovers it opened', () => {
  const src = R('js/cesium-engine.js');
  const blk = src.slice(src.indexOf("if(name==='mouseout'"));
  assert.match(blk.slice(0, 400), /mouseleave/,
    'there are no more mousemoves once the pointer is gone, so nothing else can end the hover');
});

/* ══ ④ fitBounds: A RECTANGLE ON A SPHERE IS NOT A RECTANGLE ═══════════════════════════════ */

test('R181 ④: a box that goes the whole way round is 360 degrees wide, not zero', () => {
  const src = R('js/cesium-engine.js');
  assert.doesNotMatch(src, /wrapLng\(bb\.east-bb\.west\)/,
    'wrapLng sends 360 to 0, which reads as "no width" and drops the longitude constraint');
  assert.match(src, /if\(span===0&&bb\.east!==bb\.west\) span=360;/);
});

test('R181 ④: the fit asks the sphere when the scene is one', () => {
  const src = R('js/cesium-engine.js');
  const fn = src.slice(src.indexOf('cameraForBounds(b,o){'), src.indexOf('setPadding(p){'));
  assert.match(fn, /SceneMode\.SCENE3D/, 'the correction applies only where the surface curves');
  assert.match(fn, /R_EARTH\*u\+R_EARTH\*Math\.max/,
    'd >= R*u + R*max(|e|/tanX, |n|/tanY) — the closed form, evaluated over the box boundary');
  assert.match(fn, /myInv\(\(my\(bb\.north\)\+my\(bb\.south\)\)\/2\)/,
    'and the centre is the Mercator midpoint, which is what the zoom is derived in');
});

/* ══ ⑤ THE DEFAULT ENGINE: applyTheme CALLED SOMETHING THAT CALLED IT BACK ═════════════════ */

test('R181 ⑤: applyTheme cannot re-enter itself', () => {
  const src = R('js/app-body.js');
  assert.match(src, /if\(applyTheme\._busy\) return;/,
    'pressing Satellite threw RangeError: Maximum call stack size exceeded on the DEFAULT ' +
    'engine — applyTheme rebuilds a sprite, which fires styledata synchronously, and the ' +
    'styledata handler calls applyTheme back');
  assert.match(src, /applyTheme\._busy=true;[\s\S]{0,120}finally\s*\{\s*applyTheme\._busy=false;/,
    'the flag has to come off even if the body throws');
});

test('R181 ⑤: and the handler that closes the loop is still there', () => {
  const src = R('js/app-body.js');
  assert.match(src, /wantSat!==isSat\) applyTheme\(\)/,
    'the desync repair is the point of that handler — it is the RE-ENTRY that was wrong, ' +
    'not the correction');
});

/* ══ ⑥ VECTOR TILES: "STILL WANTED" IS A SET OF TILES, NOT A COUNTER ══════════════════════ */

test('R181 ⑥: queued tile work is cancelled by the view, not by the caller', () => {
  const src = R('js/cesium-vector-tiles.js');
  assert.doesNotMatch(src, /job\.gen!==generation/,
    'update() is called once per LAYER per frame, so a counter bumped there means "someone ' +
    'asked", not "the camera moved" — ten layers over one source cancelled each other');
  assert.match(src, /if\(!wantSet\.has\(job\.k\)\)\{ cache\.delete\(job\.k\); continue; \}/);
  assert.match(src, /if\(wantSet\.has\(k\)&&onChange\)/,
    'a tile that landed and is still on screen must always announce itself — this gate is what ' +
    'left 714 filter-passing features undrawn with the layer visible and in zoom range');
});

test('R181 ⑥: the tile source no longer keeps a generation counter at all', () => {
  const src = R('js/cesium-vector-tiles.js');
  const code = src.split('\n').filter((ln) => !/^\s*[*/]/.test(ln)).join('\n');
  assert.doesNotMatch(code, /generation\s*\+\+/, 'nothing should be bumping it any more');
});

/* ══ ⑦ THE ROUND'S STANDING PROPERTIES ════════════════════════════════════════════════════
   Everything above is a repair; these are the promises the round must not have broken. */

test('R181 ⑦: the decoupling ratchet is still at one', () => {
  const outside = scanAll().filter((r) => basename(r.file) !== ENGINE_FILE);
  const values = outside.flatMap((r) => r.values || []);
  assert.equal(VALUE_BUDGET, 1);
  assert.ok(values.length <= 1, `the renderer is held as a value in ${values.length} places`);
  assert.equal(outside.reduce((n, r) => n + r.hits.length, 0), 0);
});

test('R181 ⑦: MapLibre is still the default and Cesium still costs a chooser nothing', () => {
  const sel = R('js/engine-select.js');
  assert.match(sel, /VALID\.indexOf\(v\)>0\?v:'maplibre'/, 'anything unrecognised reads as MapLibre');
  assert.match(sel, /if\(choice\(\)!=='cesium'\) return null;/, 'and nothing at all happens otherwise');
  for (const f of ['cesium-style.js', 'cesium-layers.js', 'cesium-vector-tiles.js', 'cesium-engine.js']) {
    assert.match(sel, new RegExp(`import\\('\\./${f.replace('.', '\\.')}'\\)`),
      `${f} must stay behind a dynamic import`);
  }
  /* and no static import pulls Cesium into the main chunk */
  for (const f of readdirSync(new URL('js', ROOT)).filter((x) => x.endsWith('.js'))) {
    const src = R('js/' + f);
    const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' });
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        assert.ok(!/cesium/i.test(node.source.value),
          `js/${f} imports ${node.source.value} statically — that ships Cesium to everyone`);
      }
    }
  }
});

test('R181 ⑦: no Ion token, no Cesium-hosted asset — the second engine stays keyless', () => {
  for (const f of ['cesium-engine.js', 'cesium-layers.js', 'cesium-vector-tiles.js', 'cesium-style.js']) {
    const src = R('js/' + f);
    /* the token may be BLANKED (which is what js/cesium-engine.js does, so an accidental Ion
       call fails loudly instead of phoning home) — it may never be given a value */
    for (const m of src.matchAll(/Ion\.defaultAccessToken\s*=\s*([^;]+);/g)) {
      assert.equal(m[1].trim(), 'undefined', `js/${f} assigns an Ion token`);
    }
    assert.doesNotMatch(src, /assets\.ion\.cesium\.com/, `js/${f}`);
    assert.doesNotMatch(src, /createWorldTerrain|IonImageryProvider/, `js/${f}`);
  }
});

test('R181 ⑦: every file this round touched still parses as a module', () => {
  for (const f of ['app-body.js', 'cesium-engine.js', 'cesium-layers.js', 'cesium-vector-tiles.js']) {
    assert.doesNotThrow(() => acorn.parse(R('js/' + f), { ecmaVersion: 2022, sourceType: 'module' }),
      `js/${f} must parse`);
  }
});
