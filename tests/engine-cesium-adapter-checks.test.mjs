// The Cesium engine adapter — js/cesium-engine.js, js/cesium-layers.js, js/cesium-vector-tiles.js.
//
// Gathered from tests/r180-checks ③ (the second engine is OPTIONAL: MapLibre by default, nothing
// downloaded unless chosen, every user-visible string in every language), tests/r181-checks (「全部点検
// して全部直して。」 — six defects found by driving BOTH engines through the same contract and diffing
// every answer; the browser half is tests/r181-cesium.spec.js) and tests/r185-checks (the redraw gate
// and the imagery level). Titles keep the round that wrote them.
//
// What moved elsewhere: R180 ① and R181 ⑦'s decoupling ratchet → tests/engine-decoupling-checks;
// R180 ② (the style interpreter) → tests/engine-cesium-rendering-checks; R180 ③'s adapter surface and
// capability honesty → tests/engine-capability-contract-checks; R181 ⑤ (applyTheme, the DEFAULT
// engine) → tests/engine-basemap-checks.
//
// ⚠ RUN WHERE IT CAN BE RUN. CesiumView is constructed by a Cesium Viewer (WebGL), so the adapter as a
// whole cannot be built in Node — but most of its arithmetic is plain methods. Those are LIFTED out of
// the class with the parser and called against a view stub (the technique tests/engine-cesium-
// rendering-checks uses for the background and the imagery floor): the fit of a box, the degenerate-
// offset threshold, the per-type "loaded" answer, the imagery level policy. The vector-tile pyramid is
// a self-contained module and is driven for real, with a fetch stub and genuine MVT bytes. What is
// still READ is marked, with the reason, at each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { PbfWriter } from 'pbf';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = new URL('../', import.meta.url);
const R = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ── lifting CesiumView's methods out of the file ─────────────────────────────────────────────
   `methods` come from `class CesiumView`; `decls` are the module-scope function / const statements
   they close over (found by the NAME they declare); `deps` are everything else, supplied by the test
   — a method that reaches for a name nobody supplied throws, rather than finding a global. */
const CE_SRC = R('js/cesium-engine.js');
const CE_AST = acorn.parse(CE_SRC, { ecmaVersion: 'latest', sourceType: 'module' });
function declOf(name) {
  let hit = null;
  walk.full(CE_AST, (n) => {
    if (hit) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = n;
    if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === name)) hit = n;
  });
  assert.ok(hit, `js/cesium-engine.js no longer declares ${name}`);
  return hit;
}
function cesiumView(methodNames, deps = {}, declNames = []) {
  let cls = null;
  walk.full(CE_AST, (n) => { if (n.type === 'ClassDeclaration' && n.id && n.id.name === 'CesiumView') cls = n; });
  assert.ok(cls, 'class CesiumView is not in js/cesium-engine.js any more');
  const methods = methodNames.map((name) => {
    const m = cls.body.body.find((x) => x.key && x.key.name === name);
    assert.ok(m, `CesiumView has no ${name}`);
    return CE_SRC.slice(m.start, m.end);
  }).join('\n');
  const decls = [...new Set(declNames.map(declOf))].map((n) => CE_SRC.slice(n.start, n.end)).join('\n');
  const keys = Object.keys(deps);
  return new Function(...keys, `${decls}\nreturn class {${methods}}.prototype;`)(...keys.map((k) => deps[k]));
}

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — the UI strings live in js/locales/ui.<code>.js */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
void IM_I18N_FILES;

/* ══ #R180 ③ THE SECOND ENGINE IS OPTIONAL ═════════════════════════════════════════════════════ */

/* ⚠ READ, NOT RUN: "never statically imported" and "no token assigned" are properties of the import
   graph and of the text; running the loader would download Cesium, which is the thing being avoided. */
test('R180 ③: MapLibre is the default and Cesium is never statically imported', () => {
  const sel = R('js/engine-select.js');
  assert.match(sel, /VALID\.indexOf\(v\)>0\?v:'maplibre'/, 'anything unrecognised reads as MapLibre');
  const main = R('src/main.js');
  assert.doesNotMatch(main, /import '\.\.\/js\/cesium-/, 'the entry must not pull the second engine in statically');
  for (const f of ['cesium-engine.js', 'cesium-layers.js', 'cesium-style.js', 'cesium-vector-tiles.js']) {
    assert.ok(sel.includes(`import('./${f}')`), `js/${f} is reached only by dynamic import`);
  }
  /* and the engine module itself imports Cesium dynamically, inside a function */
  const eng = R('js/cesium-engine.js');
  assert.match(eng, /await import\('cesium'\)/, 'Cesium loads on demand');
  assert.doesNotMatch(eng, /^import .*cesium/m, 'and never at module scope');
  /* no Ion token, ever — the app is keyless by policy */
  assert.doesNotMatch(eng, /defaultAccessToken\s*=\s*['"`]/, 'no Ion access token may be set');
  assert.match(eng, /Ion\.defaultAccessToken=undefined/, 'and the default one is cleared so a stray Ion call fails loudly');
});

/* ⚠ READ, NOT RUN: presence of a key in each locale table is the claim; the tables are data. */
test('R180 ③: every new user-visible string exists in all five languages', () => {
  const KEYS = ['lblEngine', 'engineMapLibre', 'engineCesium', 'engineHint', 'engineSwitching',
                'engineFellBack', 'engineActive'];
  /* ⚠ (#R239) SAME CLAIM, NEW HOME — every keyed string moved into js/locales/ui.<code>.js. Nine
     locale files is the stricter form of the same question. (#R203: move the assertion, say why.) */
  for (const k of KEYS) {
    for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
      const t = R('js/locales/ui.' + c + '.js');
      assert.ok(t.includes(k + ':') || t.includes('"' + k + '":'), `${k} must be defined for ${c}`);
    }
  }
  /* and the markup references them rather than hard-coding English */
  const html = R('index.html');
  assert.match(html, /data-i18n="lblEngine"/);
  assert.match(html, /data-i18n="engineHint"/);
  assert.match(html, /id="setting-engine"/);
});

/* ⚠ READ, NOT RUN: the SYS catalogue TEXT is what the planner reads, so its wording is the artefact. */
test('R180 ③: Atlas can operate the engine, and the planner knows the action exists', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it. */
  const atlas = R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js');
  assert.match(atlas, /case 'engine':/, 'the dispatcher handles it');
  /* #R115's rule: an action parameter not in the SYS catalogue does not exist to the planner */
  assert.match(atlas, /\{"type":"engine","name":"maplibre"\|"cesium"\}/,
    'and the SYS catalogue declares it, or Atlas can never emit it');
  assert.match(atlas, /Omit "name" to REPORT which engine is running/,
    'including the read-only form, so "which engine is this?" is answerable');
});

test('R180 ③: the build keeps Cesium in its own chunk and copies its runtime directories', async () => {
  const vite = R('vite.config.js');
  /* ⚠ The chunking is EVALUATED, not spelled. vite 8 (Rolldown) expresses the split as prioritised
     codeSplitting groups, and a group that also matched the helpers main imports is exactly how
     Cesium once came in at boot — so what is asserted is who OWNS each module, and that the lazy
     engine loses every tie. */
  const { default: cfg } = await import('../vite.config.js');
  const groups = cfg.build.rolldownOptions.output.codeSplitting.groups;
  const hit = (g, id) => (typeof g.test === 'function' ? g.test(id) : g.test.test(id));
  /* ⚠ (MapLibre shared worker) a group's `name` may be a FUNCTION of the module graph — `null` means
     "not this group". No graph is handed over here (getModuleInfo answers null), so each group answers
     for a module nothing has been shown to reach: the most conservative placement. */
  const ctx = { getModuleInfo: () => null };
  const nameOf = (g, id) => (typeof g.name === 'function' ? g.name(id, ctx) : g.name);
  const owner = (id) => groups.filter((g) => hit(g, id) && nameOf(g, id)).sort((a, b) => b.priority - a.priority).map((g) => nameOf(g, id))[0];
  assert.equal(owner('/r/node_modules/cesium/Source/Cesium.js'), 'cesium', 'a chunk of its own');
  /* the helper lands in one of the renderer's two EAGER chunks (tests/maplibre-6-migration-checks ④
     evaluates which one with a graph) */
  assert.match(owner('\0vite/preload-helper.js') || '', /^maplibre-gl(-shared)?$/, 'the bundler helpers main imports never sit in the lazy chunk');
  const c = groups.find((g) => g.name === 'cesium');
  assert.ok(c && groups.every((g) => g === c || g.priority > c.priority), 'the lazy engine is the lowest priority');
  /* ⚠ READ (this half only): the copy list and the dev-server alias are plugin configuration whose
     effect exists only inside a running vite build / dev server. */
  assert.match(vite, /CESIUM_DIRS\s*=\s*\['Workers', 'Assets', 'ThirdParty', 'Widgets'\]/,
    'Cesium resolves these at RUN time — bundling the module is not enough');
  assert.match(vite, /apply: 'serve'/, 'and the dev server maps the same path onto node_modules');
});

/* ══ #R181 ① THE IMAGERY: EVERY TEXTURE THIS ENGINE MAKES IS ORIENTED IN ONE PLACE ═════════════
   The reported defect. A tile handed to Cesium as an ImageBitmap is uploaded upside down, because the
   WebGL spec ignores UNPACK_FLIP_Y_WEBGL for that source type — and since each tile flips about its
   own centre the map tears into tile rows rather than simply mirroring. Four producers in
   js/cesium-layers.js hand over a bitmap; all four were affected. */

/* ⚠ READ, NOT RUN: createImageBitmap and its imageOrientation exist only in a browser; the claim is
   about every call site in the file, so the file is the universe. */
test('R181 ①: no texture producer builds a bitmap without saying which way up it is', () => {
  const src = R('js/cesium-layers.js');
  /* the only createImageBitmap calls allowed to omit an orientation are the ones whose result
     is READ (the DEM decoder samples pixels through a 2-D canvas) rather than uploaded */
  const offenders = [];
  src.split('\n').forEach((ln, i) => {
    if (!/createImageBitmap\s*\(/.test(ln)) return;
    if (/imageOrientation/.test(ln)) return;
    if (/await r\.blob\(\)/.test(ln)) return;          // the DEM decode — sampled, never a texture
    offenders.push(`${i + 1}: ${ln.trim().slice(0, 90)}`);
  });
  assert.deepEqual(offenders, [], 'a bitmap that becomes a texture must be decoded flipY — ' +
    'see toTexture(); an unoriented one renders the tile upside down and tears the map into rows');
});

/* ⚠ READ, NOT RUN: OffscreenCanvas.transferToImageBitmap is a browser API. */
test('R181 ①: transferToImageBitmap is gone — it cannot carry an orientation', () => {
  const src = R('js/cesium-layers.js');
  /* (test-code-only-one) the comments are gone with their line breaks kept, so a line number is
     still a line number — the filter no longer guesses which lines belong to a comment */
  const uses = codeOnly(src).split('\n')
    .map((ln, i) => [i + 1, ln])
    .filter(([, ln]) => /\.transferToImageBitmap\s*\(/.test(ln));
  assert.deepEqual(uses.map(([n]) => n), [],
    'transferToImageBitmap takes no options, so a canvas transferred that way arrives upside down');
});

/* ⚠ READ, NOT RUN: the producers draw into canvases and hand bitmaps to WebGL — browser-only. */
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

/* ══ #R181 ② THE CAMERA: A BEARING READ OFF A QUANTITY THAT IS NOT THERE ════════════════════════
   At pitch 0 the horizontal part of the look-at offset is zero by definition, and the guard that was
   supposed to notice sat four orders of magnitude below its own residue — so `atan2` was handed
   rounding and answered with a direction (67.34° at z9, 123.54° at z6, −177.63° at boot, for a camera
   pointing due north). */

/* RUN: the threshold is a method; it is called. */
test('R181 ②: the degenerate-offset guard scales with range and is far above the residue', () => {
  const view = Object.create(cesiumView(['_enuNoise']));
  const k = view._enuNoise(1e6) / 1e6;
  /* the old constant (range·1e-9) was BELOW the measured residue at every zoom, so it never fired;
     the threshold must be derived from the range it was given */
  assert.ok(Math.abs(view._enuNoise(2e6) - 2 * view._enuNoise(1e6)) < 1e-12, '_enuNoise must scale with the range');
  assert.ok(Math.abs(view._enuNoise(137) / 137 - k) < 1e-15, '…at every range');
  /* the gap it has to sit in, both ends measured (DEV-NOTES #R181):
       largest residue seen  horiz/range = 8.4e-8   (z1.7)
       smallest real signal  sin(0.5°)   = 8.7e-3            */
  assert.ok(k > 8.4e-8 * 10, `${k} leaves under 10x of margin over the largest residue measured`);
  assert.ok(k < 8.7e-3 / 100, `${k} is within 100x of half a degree of real tilt`);
});

/* ⚠ READ, NOT RUN: _hpr and _faceHeading read and twist a live Cesium Camera. */
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

/* ⚠ READ, NOT RUN: setCamera and _settle drive a live Cesium Camera. */
test('R181 ②: every path that re-asserts the camera re-asserts the heading', () => {
  const src = R('js/cesium-engine.js');
  const calls = (src.match(/this\._faceHeading\(/g) || []).length;
  assert.ok(calls >= 2, 'setCamera and _settle both place the eye with lookAt, and lookAt is ' +
    'exactly what drops the heading when the orbit offset is vertical');
});

/* ══ #R181 ③ THE EVENTS: A SUBSCRIPTION WITH NO SOURCE IS A FEATURE THAT NEVER RUNS ═════════════ */

/* ⚠ READ, NOT RUN: the universe is every subscription in js/ against every name the adapter can raise;
   the raising happens on DOM and Cesium events of a live Viewer. */
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

/* ⚠ READ, NOT RUN: pointer vs compatibility mouse events are a browser's DOM behaviour. */
test('R181 ③: mousedown/mouseup come from the pointer, not the mouse', () => {
  const src = R('js/cesium-engine.js');
  assert.match(src, /\['pointerdown','mousedown'\]/,
    'Cesium binds pointer events and prevents their default, which suppresses the browser\'s ' +
    'compatibility mouse events — measured 0 mousedown against 4 on MapLibre');
  assert.match(src, /\['pointerup','mouseup'\]/);
  assert.match(src, /pointerType&&e\.pointerType!=='mouse'/,
    'a touch already arrives as touchstart/touchend; MapLibre does not raise mousedown for one');
});

test('R181 ③: every sourcedata fire carries isSourceLoaded', () => {
  /* RUN: the per-type answer and the one fire path are lifted and called. */
  const proto = cesiumView(['_sourceLoaded', '_fireSourceData', '_markSourceDirty']);
  const fired = [];
  let scheduled = 0;
  const vt = (pending) => ({ stats: () => ({ pending }) });
  const view = Object.assign(Object.create(proto), {
    _globe: { tilesLoaded: false }, _layers: [], _dirty: new Set(), _schedule() { scheduled++; },
    fire: (name, e) => fired.push({ name, ...e }),
    _sources: new Map([
      ['gj-full', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }],
      ['gj-empty', { type: 'geojson', data: null }],
      ['vt-done', { type: 'vector', vt: vt(0) }],
      ['vt-busy', { type: 'vector', vt: vt(3) }],
      ['raster', { type: 'raster' }],
    ]),
  });
  /* "loaded" means something different per source type, so each type answers for itself */
  const loaded = (id) => { fired.length = 0; view._fireSourceData(id); return fired[0]; };
  assert.equal(loaded('gj-full').isSourceLoaded, true, 'a GeoJSON source is loaded once it holds data');
  assert.equal(loaded('gj-empty').isSourceLoaded, false);
  assert.equal(loaded('vt-done').isSourceLoaded, true, 'a vector source is loaded when no tile is pending');
  assert.equal(loaded('vt-busy').isSourceLoaded, false, '…and not while one is');
  assert.equal(loaded('raster').isSourceLoaded, false, 'a raster source follows the globe\'s tile queue');
  view._globe.tilesLoaded = true;
  assert.equal(loaded('raster').isSourceLoaded, true, '…which becomes loaded when that queue drains');
  assert.equal(loaded('nope').isSourceLoaded, false, 'an unknown source is not loaded — and the flag is still there');
  for (const e of [loaded('gj-full')]) {
    assert.equal(e.name, 'sourcedata'); assert.equal(e.sourceId, 'gj-full'); assert.equal(e.dataType, 'source');
  }
  /* a vector tile landing is the one moment "loaded" can become true with nothing else happening */
  fired.length = 0;
  view._markSourceDirty('vt-done');
  assert.deepEqual(fired.map((e) => [e.name, e.isSourceLoaded]), [['sourcedata', true]], 'a tile landing announces itself, with the flag');
  assert.equal(scheduled, 1);

  /* ⚠ READ (these halves): "no fire bypasses _fireSourceData" is about every call site in the file;
     the raster signal is a Cesium Viewer event; the subscribers live in the booted app. */
  const src = R('js/cesium-engine.js');
  const bare = src.split('\n')
    .map((ln, i) => [i + 1, ln])
    .filter(([, ln]) => /fire\('sourcedata'/.test(ln) && !/isSourceLoaded/.test(ln));
  assert.deepEqual(bare.map(([n]) => n), [],
    'route it through _fireSourceData so the payload cannot be forgotten');
  assert.match(src, /tileLoadProgressEvent/,
    'a raster source becomes loaded when the globe\'s tile queue drains — the only signal there is');
  /* and the app's three subscribers are still testing the flag we now send */
  const app = R('js/app-body.js') + R('js/satellite.js');
  assert.ok((app.match(/e\.isSourceLoaded/g) || []).length >= 3);
});

/* ⚠ READ, NOT RUN: mouseout/mouseleave are DOM events on the Cesium canvas. */
test('R181 ③: leaving the canvas closes out the layer hovers it opened', () => {
  const src = R('js/cesium-engine.js');
  const blk = src.slice(src.indexOf("if(name==='mouseout'"));
  assert.match(blk.slice(0, 400), /mouseleave/,
    'there are no more mousemoves once the pointer is gone, so nothing else can end the hover');
});

/* ══ #R181 ④ fitBounds: A RECTANGLE ON A SPHERE IS NOT A RECTANGLE ══════════════════════════════
   RUN: cameraForBounds is lifted with the zoom mapping it shares with the rest of the adapter
   (_canvasW/_canvasH/_c2cPx/zoomFor/minZoomAt) and the module constants it closes over, and called
   on a 1024×768 view. Cesium itself is only needed for the scene-mode enum. */
const SceneMode = { SCENE2D: 2, COLUMBUS_VIEW: 1, SCENE3D: 3, MORPHING: 0 };
function fitView(mode) {
  const proto = cesiumView(['_canvasH', '_canvasW', '_c2cPx', 'zoomFor', 'minZoomAt', 'cameraForBounds'],
    { Cesium: { SceneMode } }, ['R_EARTH', 'ML_FOVY', 'wrapLng', 'normBounds']);
  return Object.assign(Object.create(proto), {
    _widget: { canvas: { clientWidth: 1024, clientHeight: 768 } },
    _scene: { mode }, _minZoom: 0, _maxZoom: 22,
  });
}

test('R181 ④: a box that goes the whole way round is 360 degrees wide, not zero', () => {
  const v = fitView(SceneMode.SCENE2D);
  /* 360° of longitude in 1024 px of 512-px tiles is exactly zoom log2(1024/512) = 1. `wrapLng(east-west)`
     sent 360 to 0, which read as "no width" and let the latitude alone decide the zoom. */
  const round = v.cameraForBounds([[-180, -10], [180, 10]]);
  assert.ok(Math.abs(round.zoom - Math.log2(1024 / 512)) < 1e-9,
    `a box all the way round must be fitted by its 360° width (zoom 1), got ${round.zoom}`);
  const band = v.cameraForBounds([[-20, -10], [20, 10]]);
  assert.ok(band.zoom > round.zoom + 2, 'and a 40° box is framed far closer than a 360° one');
  /* …while a box that really has no width is still fitted by its height alone */
  const line = v.cameraForBounds([[10, -10], [10, 10]]);
  assert.ok(line.zoom > round.zoom, 'a zero-width box is not mistaken for a full circle');
});

test('R181 ④: the fit asks the sphere when the scene is one', () => {
  const flat = fitView(SceneMode.SCENE2D), globe = fitView(SceneMode.SCENE3D);
  /* the centre is the Mercator midpoint, which is what the zoom is derived in — measured against
     MapLibre for [[135,33],[141,37]]: 35.024 there, 35.000 for the plain mean */
  const kanto = flat.cameraForBounds([[135, 33], [141, 37]]);
  assert.ok(Math.abs(kanto.center.lat - 35.024) < 0.001, `centre latitude ${kanto.center.lat}, expected the Mercator midpoint 35.024`);
  assert.equal(kanto.center.lng, 138);
  /* the correction applies only where the surface curves: on the sphere a continent-sized box is
     fitted further out (its far parts turn away from the eye — measured, 6% of [[-10,35],[30,60]] fell
     off screen with the flat fit) … */
  const euFlat = flat.cameraForBounds([[-10, 35], [30, 60]]), euGlobe = globe.cameraForBounds([[-10, 35], [30, 60]]);
  assert.ok(euGlobe.zoom < euFlat.zoom - 0.02, `the sphere must frame Europe further out (${euGlobe.zoom} vs ${euFlat.zoom})`);
  /* …and for a city-sized box u→1 and the closed form reduces to the Mercator expression */
  const paris = [[2, 48], [3, 49]];
  assert.ok(Math.abs(globe.cameraForBounds(paris).zoom - flat.cameraForBounds(paris).zoom) < 0.01,
    'on a city-sized box the sphere and the plane agree');
});

/* ══ #R181 ⑥ VECTOR TILES: "STILL WANTED" IS A SET OF TILES, NOT A COUNTER ═════════════════════
   update() is called once per LAYER per frame, so a counter bumped there meant "someone asked", not
   "the camera moved" — ten layers over one source cancelled each other, and the gate on onChange left
   714 filter-passing features undrawn with the layer visible and in zoom range.
   RUN: js/cesium-vector-tiles.js is evaluated with a fetch stub that answers when the test says so,
   and every tile is a genuine Mapbox Vector Tile (one point feature), decoded by the real libraries. */
function mvtBytes() {
  const w = new PbfWriter();
  w.writeMessage(3, (_, L) => {                                    /* Tile.layers */
    L.writeVarintField(15, 2);                                     /* version */
    L.writeStringField(1, 'place');                                /* name */
    L.writeMessage(2, (__, F) => {                                 /* features */
      F.writeVarintField(1, 1); F.writeVarintField(3, 1);           /* id, type=POINT */
      F.writePackedVarint(4, [9, 4096, 4096]);                     /* MoveTo(1) (2048,2048) zig-zagged */
    }, null);
    L.writeVarintField(5, 4096);                                   /* extent */
  }, null);
  return w.finish();
}
const TILE_SPEC = { type: 'vector', tiles: ['https://t.test/{z}/{x}/{y}.pbf'], maxzoom: 14 };
const WORLD = { west: -180, east: 179.9, north: 80, south: -80 };
function tileHarness() {
  const pending = [], urls = [];
  const fetchStub = (url) => { urls.push(String(url)); return new Promise((res) => pending.push(res)); };
  const win = {};
  /* ⚠ new Function rather than vm: the module imports its decoders with import(), which a vm context
     has no loader for; this way it resolves them from node_modules exactly as the app bundle does */
  new Function('window', 'fetch', R('js/cesium-vector-tiles.js'))(win, fetchStub);
  const body = mvtBytes();
  /* a load awaits the decoders before it fetches, so what is "in flight" is only known once the
     microtask queue has drained */
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  const land = async () => {
    while (pending.length) pending.shift()({ ok: true, status: 200, arrayBuffer: async () => body.slice().buffer });
    await settle();
  };
  return { VT: win.IntMapVectorTiles, urls, land, settle, inFlight: () => pending.length };
}
const keysOf = (sig) => sig.trim().split(/\s+/).filter(Boolean);
const urlOf = (k) => { const [z, x, y] = k.split('/'); return `https://t.test/${z}/${x}/${y}.pbf`; };

test('R181 ⑥: queued tile work is cancelled by the view, not by the caller', async () => {
  /* ten layers over one source ask the same question before anything lands */
  const h = tileHarness();
  let announced = 0;
  const src = h.VT.makeSource('s', TILE_SPEC, () => { announced++; });
  const n = keysOf(src.want(WORLD, 2)).length;
  await h.settle();
  assert.ok(n > 8 && h.inFlight() === 8, `${n} tiles against 8 in flight — the rest are QUEUED, which is what is under test`);
  for (let layer = 1; layer < 10; layer++) src.want(WORLD, 2);
  for (let guard = 0; h.inFlight() && guard < 20; guard++) await h.land();
  assert.equal(new Set(h.urls).size, n, 'every tile of the cover was fetched — another layer asking cancelled nothing');
  assert.equal(announced, n,
    'and every tile that landed while still on screen announced itself — the gate that left 714 features undrawn');

  /* …and when the VIEW moves, the queued tiles it no longer covers are dropped */
  const h2 = tileHarness();
  let announced2 = 0;
  const s2 = h2.VT.makeSource('s', TILE_SPEC, () => { announced2++; });
  s2.want(WORLD, 2);
  await h2.settle();
  const started = h2.urls.slice();
  const now = keysOf(s2.want({ west: 100, east: 110, north: 10, south: 0 }, 2));
  for (let guard = 0; h2.inFlight() && guard < 20; guard++) await h2.land();
  const expected = new Set([...started, ...now.map(urlOf)]);
  assert.deepEqual([...new Set(h2.urls)].sort(), [...expected].sort(),
    'only what was already in flight and what the new view covers is fetched — the queue behind it was dropped');
  assert.ok(expected.size < n);
  assert.equal(announced2, now.length, 'and only a tile the current view wants is announced');
});

test('R181 ⑥: the tile source no longer keeps a generation counter at all', async () => {
  /* the shape the counter produced, driven through update() — the entrance the layer above calls once
     PER LAYER PER FRAME: ten calls a frame with the camera standing still must not starve the queue */
  const h = tileHarness();
  let announced = 0;
  const src = h.VT.makeSource('s', TILE_SPEC, () => { announced++; });
  const n = keysOf(src.want(WORLD, 2)).length;
  await h.settle();
  for (let frame = 0; h.inFlight() && frame < 20; frame++) {
    for (let layer = 0; layer < 10; layer++) src.update(WORLD, 2);
    await h.land();
  }
  assert.equal(new Set(h.urls).size, n, 'the whole cover arrives with ten layers asking every frame');
  assert.equal(announced, n);
  assert.equal(src.update(WORLD, 2).length, n, 'and the features of every tile are there to draw (one per tile)');
  assert.equal(src.stats().pending, 0);
});

/* ══ #R181 ⑦ THE ROUND'S STANDING PROPERTIES ═══════════════════════════════════════════════════
   (the decoupling ratchet that stood first here is in tests/engine-decoupling-checks, R180 ①) */

/* ⚠ READ, NOT RUN: an import graph is a property of the text (AST); running it would load Cesium. */
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
    const ast = acorn.parse(R('js/' + f), { ecmaVersion: 2022, sourceType: 'module' });
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        assert.ok(!/cesium/i.test(node.source.value),
          `js/${f} imports ${node.source.value} statically — that ships Cesium to everyone`);
      }
    }
  }
});

/* ⚠ READ, NOT RUN: "never assigned a value" / "never names an Ion asset" are claims over the text. */
test('R181 ⑦: no Ion token, no Cesium-hosted asset — the second engine stays keyless', () => {
  for (const f of ['cesium-engine.js', 'cesium-layers.js', 'cesium-vector-tiles.js', 'cesium-style.js']) {
    const src = R('js/' + f);
    /* the token may be BLANKED (so an accidental Ion call fails loudly instead of phoning home) —
       it may never be given a value */
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

/* ══ #R185 THE REDRAW GATE AND THE IMAGERY LEVEL ════════════════════════════════════════════════ */

/* ⚠ READ, NOT RUN: the gate is consulted inside the frame loop of a live Viewer; the effect (979 ms of
   assembly and 2,963 ms of rebuilding saved over a 40-step drag) is measured in the browser. */
test('R185 cesium: the redraw gate asks what the layers actually depend on', () => {
  const src = R('js/cesium-engine.js');
  /* the tile cover, per source, compared by signature */
  assert.match(src, /rec\.vt\.want\(b,z\)/);
  assert.match(src, /moved\.set\(id,sig!==rec\.coverSig\)/);
  /* zoom only dirties layers whose own document reads the zoom, or whose window the zoom crossed */
  assert.match(src, /_zoomSensitive\(l\)/);
  assert.match(src, /_inZoomWindow\(l\.def,prev\)!==this\._inZoomWindow\(l\.def,z\)/);
  /* the styling zoom is the one that was ASKED for while the camera is where setCamera left it */
  assert.match(src, /_styleZoom\(\)/);
  assert.match(src, /_noteCommanded\(zoom\)/);
  /* and the per-frame camera readback is memoised on the pose plus the frame */
  assert.match(src, /_poseUnchanged\(\)/);
});

test('R185 cesium: the imagery level is stated as a policy, not a constant', async () => {
  /* RUN: the provider is built by js/cesium-layers.js against the real Cesium engine package, and the
     engine side (_providerFor) is lifted and asked what it hands over.
     Cesium picks the imagery level from the provider's declared tileWidth, so tileSize/sse is one
     texel per DEVICE pixel rather than one per `maximumScreenSpaceError` pixels (MapLibre 22.7 vs
     Cesium 7.5 mean |Laplacian| on the same z13 Jungfrau view before this). */
  const C = await import('@cesium/engine');
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(R('js/cesium-layers.js'), ctx);
  const L = ctx.window.IntMapCesiumLayers;
  const mk = (cfg) => L.makeTileImageryProvider(C, { tiles: ['https://t.test/{z}/{x}/{y}.png'], tileSize: 512, ...cfg });
  assert.equal(mk({ screenSpaceError: 2 }).tileWidth, 256, 'Cesium\'s default error of 2 halves the declared width');
  assert.equal(mk({}).tileWidth, 256, 'no error given means Cesium\'s default, 2');
  assert.equal(mk({ screenSpaceError: 1 }).tileWidth, 512);
  assert.equal(mk({ screenSpaceError: 4 }).tileWidth, 128, 'the policy follows a changed screen-space error');
  assert.equal(mk({ screenSpaceError: 2, fullResolution: false }).tileWidth, 512,
    'a phone opts out — four times the resident texture memory is the crash risk #R20 ranked first');
  assert.equal(mk({ screenSpaceError: 2 }).tileHeight, 256);

  /* the engine passes both, so the policy follows a changed screen-space error */
  const handed = (ua, globe) => {
    const proto = cesiumView(['_providerFor'], {
      CL: () => ({ makeTileImageryProvider: (_C, cfg) => cfg }), Cesium: C, PROTOCOLS: {}, navigator: { userAgent: ua },
    });
    const view = Object.assign(Object.create(proto), {
      _globe: globe, _sources: new Map([['src', { spec: { tiles: ['t'], tileSize: 512 } }]]),
    });
    return view._providerFor({ def: { type: 'raster', source: 'src' } });
  };
  const desk = handed('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { maximumScreenSpaceError: 3 });
  assert.equal(desk.screenSpaceError, 3, 'the globe\'s own error is what is handed over');
  assert.equal(desk.fullResolution, true);
  assert.equal(handed('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', { maximumScreenSpaceError: 2 }).fullResolution, false,
    'a phone is detected and opted out');
  assert.equal(handed('Mozilla/5.0 (X11; Linux x86_64)', null).screenSpaceError, 2, 'before the globe exists, Cesium\'s default');
});
