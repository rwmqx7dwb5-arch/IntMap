// R180 source-level checks (deterministic, no browser).
//
// Three subjects:
//   ① the decoupling is FINISHED — 324 value references to one, and the two doors that let the
//      renderer through under another name are both gated.
//   ② the STYLE LANGUAGE INTERPRETER, which is the real cost of a second engine (#R179 measured
//      it; this round implements it). It is pure by design — no Cesium, no DOM — precisely so
//      it can be run here against the same inputs MapLibre is given, rather than only being
//      looked at through a browser where a wrong colour is a screenshot nobody diffs.
//   ③ the second engine is OPTIONAL: default MapLibre, nothing downloaded unless chosen, and
//      every user-visible string in all five languages (standing instruction 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as acorn from 'acorn';
import { scanAll, scanFile, VALUE_BUDGET, IMAP_GLOBAL_FILES, ENGINE_FILE } from '../scripts/engine-coupling.mjs';

const ROOT = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (p) => (String(p).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, ROOT), 'utf8')).join('\n')
  : readFileSync(new URL(p, ROOT), 'utf8'));

/* ══ ① THE DECOUPLING ═══════════════════════════════════════════════════════════════════ */

test('R180 ①: the renderer is held or tested as a value in exactly ONE place', () => {
  const outside = scanAll().filter((r) => basename(r.file) !== ENGINE_FILE);
  const values = outside.flatMap((r) => (r.values || []).map((v) => ({ f: r.file, ...v })));
  assert.equal(VALUE_BUDGET, 1, 'the ratchet is at one — #R179 left it at 324');
  assert.ok(values.length <= 1, `expected at most one, got ${values.length}: ` +
    values.map((v) => `${v.file || v.f}:${v.line}`).join(', '));
  if (values.length === 1) {
    assert.equal(basename(values[0].f), 'app-body.js',
      'the one remaining reference is the primary view being handed to the engine');
  }
  assert.equal(outside.reduce((n, r) => n + r.hits.length, 0), 0, 'member access stays at zero');
});

test('R180 ①: no module receives the renderer as a parameter any more', () => {
  const offenders = [];
  for (const f of readdirSync(new URL('js', ROOT)).filter((x) => x.endsWith('.js'))) {
    const src = R('js/' + f);
    for (const m of src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)) {
      const first = m[2].split(',')[0].trim();
      if (first === 'map') offenders.push(`${f}:${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'the module contract was the largest block of #R179\'s 112 held ' +
    'references: every factory was handed the raw renderer whether it wanted one or not');
});

test('R180 ①: window.__imap is gated to the adapter and the line that publishes it', () => {
  const stray = scanAll().filter((r) => (r.imaps || []).length && !IMAP_GLOBAL_FILES.has(basename(r.file)));
  assert.deepEqual(stray.map((r) => r.file), [],
    'reading the global into a local is the same coupling under a name no scan can predict — ' +
    '#R180 found three subsystems doing exactly that');
});

test('R180 ①: the gate finds the renderer even when its binding moves deeper', () => {
  /* #R180 broke this by accident: wrapping app-body's DOMContentLoaded body in the boot barrier
     the second engine needs put `let map` one function deeper, and the hard-coded "depth ≤ 1"
     rule stopped seeing the whole file — reporting 0 for the wrong reason. The rule finds the
     declaration now, so prove it does at BOTH depths, and that an unrelated local still is not
     mistaken for the renderer. */
  const dir = mkdtempSync(join(tmpdir(), 'imdepth-'));
  try {
    const shallow = join(dir, 'a.js');
    writeFileSync(shallow, `window.addEventListener('x',()=>{ let map; map=E.ui.createView({}); window.__imap=map; map.flyTo(1); });\n`);
    assert.ok(scanFile(shallow).hits.length >= 1, 'a renderer bound at depth 1 is seen');

    const deep = join(dir, 'b.js');
    writeFileSync(deep, `window.addEventListener('x',()=>{ const boot=()=>{ let map; map=E.ui.createView({}); window.__imap=map; map.flyTo(1); }; boot(); });\n`);
    assert.ok(scanFile(deep).hits.length >= 1, '…and so is one bound a level deeper — the boot barrier');

    const local = join(dir, 'c.js');
    writeFileSync(local, `window.IntMapModules.x=function(HOST){ function f(){ const map={}; map.k=1; return map; } return f; };\n`);
    assert.equal(scanFile(local).hits.length, 0, 'and somebody\'s plain object called `map` is not the renderer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ══ ② THE STYLE-LANGUAGE INTERPRETER ═══════════════════════════════════════════════════
   js/cesium-style.js publishes itself on `window` like every other module in this project, so
   it is loaded here the same way the browser does — evaluated with a `window` — rather than
   being re-implemented for the test. */
function loadStyle() {
  const src = R('js/cesium-style.js');
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(win);
  return win.IntMapStyle;
}
const S = loadStyle();

test('R180 ②: colours parse in every spelling the app writes them in', () => {
  const near = (a, b) => Math.abs(a - b) < 0.004;
  const c1 = S.parseColor('#ff3b30');
  assert.ok(near(c1.r, 1) && near(c1.g, 0x3b / 255) && near(c1.b, 0x30 / 255) && c1.a === 1);
  assert.ok(near(S.parseColor('#0a84ff88').a, 0x88 / 255), '8-digit hex carries alpha');
  assert.ok(near(S.parseColor('#f00').r, 1), '3-digit hex');
  assert.ok(near(S.parseColor('rgba(0,122,255,0.18)').a, 0.18), 'rgba()');
  assert.ok(near(S.parseColor('rgb(255,255,255)').g, 1), 'rgb()');
  assert.ok(near(S.parseColor('hsl(120,100%,50%)').g, 1), 'hsl()');
  assert.ok(near(S.parseColor('white').b, 1), 'a CSS name');
  assert.equal(S.parseColor('transparent').a, 0);
  assert.equal(S.parseColor('not-a-colour'), null, 'and an unparseable value says so rather than guessing');
});

test('R180 ②: the operators the app actually uses evaluate correctly', () => {
  const ctx = { properties: { kind: 'a', n: 7, name: 'Tokyo' }, geometryType: 'Point', id: 3,
                zoom: 6, state: { hover: true } };
  const e = (x) => S.evaluate(x, ctx);
  assert.equal(e(['get', 'kind']), 'a');
  assert.equal(e(['get', 'missing']), null);
  assert.equal(e(['has', 'n']), true);
  assert.equal(e(['geometry-type']), 'Point');
  assert.equal(e(['id']), 3);
  assert.equal(e(['zoom']), 6);
  assert.equal(e(['feature-state', 'hover']), true);
  assert.equal(e(['==', ['get', 'kind'], 'a']), true);
  assert.equal(e(['!=', ['get', 'kind'], 'a']), false);
  assert.equal(e(['all', ['==', ['get', 'kind'], 'a'], ['>', ['get', 'n'], 3]]), true);
  assert.equal(e(['any', ['==', ['get', 'kind'], 'z'], ['<', ['get', 'n'], 3]]), false);
  assert.equal(e(['!', ['has', 'nope']]), true);
  assert.equal(e(['coalesce', ['get', 'missing'], ['get', 'kind']]), 'a');
  assert.equal(e(['case', ['==', ['get', 'kind'], 'b'], 'B', ['==', ['get', 'kind'], 'a'], 'A', 'Z']), 'A');
  assert.equal(e(['match', ['get', 'kind'], 'x', 1, ['a', 'b'], 2, 0]), 2, 'a match label may be a LIST');
  assert.equal(e(['in', 'ok', ['literal', ['no', 'ok']]]), true);
  assert.equal(e(['concat', 'x', ['get', 'n']]), 'x7');
  assert.equal(e(['to-number', '12.5']), 12.5);
  assert.equal(e(['literal', [1, 2]]).length, 2);
  assert.equal(e(['+', 1, 2, 3]), 6);
  assert.equal(e(['step', ['get', 'n'], 'lo', 5, 'mid', 10, 'hi']), 'mid');
  assert.equal(e(['let', 'v', 4, ['*', ['var', 'v'], 3]]), 12);
  /* a text-font stack is an ARRAY LITERAL whose first element is a string — it must not be
     mistaken for an operator, which is what makes `literal` optional in most of the style */
  assert.deepEqual(e(['Noto Sans Regular']), ['Noto Sans Regular']);
});

test('R180 ②: interpolate matches the arithmetic MapLibre does', () => {
  const at = (n) => S.evaluate(['interpolate', ['linear'], ['get', 'n'], 0, 4, 10, 18],
    { properties: { n }, zoom: 0 });
  assert.equal(at(0), 4);
  assert.equal(at(10), 18);
  assert.equal(at(7), 4 + 14 * 0.7, 'linear between the bracketing stops');
  assert.equal(at(-5), 4, 'clamped below the first stop');
  assert.equal(at(99), 18, 'and above the last');
  /* colours interpolate as colours, not as strings */
  const mid = S.parseColor(S.evaluate(['interpolate', ['linear'], ['zoom'], 0, '#000000', 10, '#ffffff'], { zoom: 5 }));
  assert.ok(Math.abs(mid.r - 0.5) < 0.01, 'a colour ramp mixes channel-wise');
  /* exponential with base 2: halfway in INPUT is not halfway in output */
  const ex = S.evaluate(['interpolate', ['exponential', 2], ['zoom'], 0, 0, 10, 100], { zoom: 5 });
  assert.ok(ex > 0 && ex < 50, `exponential must bend below the linear midpoint, got ${ex}`);
});

test('R180 ②: both filter spellings compile, including $type', () => {
  const P = { properties: { kind: 'equator' }, geometryType: 'LineString' };
  const Q = { properties: { kind: 'minor' }, geometryType: 'Point' };
  /* the LEGACY form, which is what the boot style and every tool layer are written in */
  const legacy = ['all', ['==', '$type', 'LineString'], ['!=', 'kind', 'equator']];
  assert.ok(S.isLegacyFilter(legacy), 'recognised as legacy: the second element is a KEY, not an expression');
  const f1 = S.compileFilter(legacy);
  assert.equal(f1(P), false, 'the equator line is excluded by name');
  assert.equal(f1({ properties: { kind: 'major' }, geometryType: 'LineString' }), true);
  assert.equal(f1(Q), false, 'and a Point is excluded by $type');
  /* …and the MODERN form, which is not legacy because its second element is an expression */
  const modern = ['==', ['get', 'kind'], 'equator'];
  assert.equal(S.isLegacyFilter(modern), false);
  assert.equal(S.compileFilter(modern)(P), true);
  assert.equal(S.compileFilter(null)(Q), true, 'no filter passes everything');
  /* `in` and `!in` legacy forms */
  assert.equal(S.compileFilter(['in', 'kind', 'a', 'equator'])(P), true);
  assert.equal(S.compileFilter(['!in', 'kind', 'equator'])(P), false);
  assert.equal(S.compileFilter(['has', 'kind'])(P), true);
});

test('R180 ②: a constant is told from an expression, and a zoom-only one from a per-feature one', () => {
  assert.equal(S.isExpression('#ff0000'), false);
  assert.equal(S.isExpression([2, 2]), false, 'a dash array is data, not an expression');
  assert.equal(S.isExpression(['get', 'x']), true);
  /* this is what keeps 49 circle layers from being re-evaluated per point per frame */
  assert.equal(S.dependsOnFeature(['interpolate', ['linear'], ['zoom'], 0, 1, 10, 5]), false);
  assert.equal(S.dependsOnFeature(['case', ['==', ['get', 'k'], 1], 'a', 'b']), true);
  assert.equal(S.dependsOnZoom(['interpolate', ['linear'], ['zoom'], 0, 1, 10, 5]), true);
  assert.equal(S.dependsOnZoom(['get', 'k']), false);
});

test('R180 ②: the legacy {stops} function still resolves — the choropleths emit it', () => {
  const fn = { property: 'v', type: 'interval', stops: [[0, '#eee'], [10, '#aaa'], [20, '#333']] };
  assert.equal(S.resolve(fn, { properties: { v: 12 }, zoom: 4 }), '#aaa');
  assert.equal(S.resolve(fn, { properties: { v: 0 }, zoom: 4 }), '#eee');
  const cat = { property: 'k', type: 'categorical', stops: [['a', 1], ['b', 2]], default: 9 };
  assert.equal(S.resolve(cat, { properties: { k: 'b' } }), 2);
  assert.equal(S.resolve(cat, { properties: { k: 'zz' } }), 9, 'and falls to its own default');
});

test('R180 ②: a broken expression costs one wrong value, never the layer', () => {
  assert.equal(S.evaluate(['get'], {}), null);
  assert.deepEqual(S.evaluate(['nonsense-op', 1, 2], {}), ['nonsense-op', 1, 2],
    'an unknown leading string is an ARRAY LITERAL, not a broken operator — which is exactly why ' +
    "a text-font stack like ['Noto Sans Regular'] needs no `literal` wrapper");
  assert.equal(S.evaluate(null, {}), null);
  assert.equal(S.resolveNum(['/', 1, 0], {}, 42), 42, 'and a fallback is used rather than NaN reaching the GPU');
  /* what it knows it cannot do is REPORTED, not hidden (#R162) */
  assert.ok(Array.isArray(S.UNSUPPORTED) && S.UNSUPPORTED.includes('within'));
});

/* ══ ③ THE SECOND ENGINE IS OPTIONAL ════════════════════════════════════════════════════ */

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

test('R180 ③: the Cesium adapter implements the same surface as the MapLibre one', () => {
  /* the point of the seam. Take the method names the MapLibre adapter's returned object
     declares and require the Cesium adapter to declare them too — a missing one is a call
     site that silently does nothing on the second engine. */
  const names = (src, marker) => {
    const i = src.indexOf(marker);
    assert.ok(i > 0, `could not find ${marker}`);
    const out = new Set();
    for (const m of src.slice(i).matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*(?:\(|:\s*(?:\(|function|o=>|\w+=>))/g)) out.add(m[1]);
    return out;
  };
  const ml = names(R('js/geo-engine.js'), "return { id:'maplibre'");
  const cs = names(R('js/cesium-engine.js'), "id:'cesium', capabilities:CESIUM_CAPS");
  /* the facade calls these; anything the MapLibre adapter offers, the Cesium one must answer */
  const REQUIRED = ['flyTo', 'easeTo', 'jumpTo', 'fitBounds', 'setPadding', 'getPadding', 'getCamera',
    'setProjection', 'getProjection', 'globeness', 'getZoom', 'getCenter', 'getBearing', 'getPitch',
    'getBounds', 'setBearing', 'setPitch', 'getRoll', 'setRoll', 'getMaxPitch', 'setMaxPitch',
    'getMinPitch', 'setMinZoom', 'getMinZoom', 'setMaxZoom', 'getMaxZoom', 'zoomRange', 'zoomTo',
    'zoomIn', 'zoomOut', 'stop', 'setCenter', 'panBy', 'setMaxBounds', 'setRenderWorldCopies',
    'getRenderWorldCopies',
    'cameraFromTo', 'cameraAltitude', 'eyePosition', 'setEye', 'setCenterClamped', 'setTiltPivot',
    'eyePivotDiag', 'isAnimating', 'project', 'unproject', 'projectAltitude', 'terrainElevation',
    'queryRenderedFeatures', 'querySourceFeatures', 'worldSize', 'lngLat', 'hasSource', 'addSource',
    'setSourceData', 'removeSource', 'sourceData', 'setSourceTiles', 'updateImageSource', 'hasLayer',
    'getLayer', 'addLayer', 'removeLayer', 'moveLayer', 'setVisible', 'isVisible', 'setPaint',
    'getPaint', 'setLayout', 'getLayout', 'setFilter', 'getFilter', 'setOpacity', 'setFeatureState',
    'getFeatureState', 'removeFeatureState', 'addExtrusion', 'setExtrusionRange', 'addSolid',
    'setSolid', 'removeSolid', 'getStyle', 'setLight', 'setSky', 'getSky', 'setTerrain', 'getTerrain',
    'addImage', 'hasImage', 'removeImage', 'addProtocol', 'setImageConcurrency', 'demContourSource',
    'styleReady', 'styleParsed', 'canDraw', 'on', 'off', 'once', 'onLayer', 'offLayer', 'onceLayer',
    'resize', 'triggerRepaint', 'getCanvas', 'getContainer', 'getCanvasContainer', 'getSize',
    'setCursor', 'setDragPan', 'setGesture', 'gestures', 'setZoomRate', 'popup', 'marker',
    'addMarker', 'addPopup', 'attach', 'createView', 'createSubView', 'raw'];
  const missingFromCesium = REQUIRED.filter((n) => !cs.has(n));
  assert.deepEqual(missingFromCesium, [], 'the Cesium adapter must answer for every contract entry');
  const missingFromMapLibre = REQUIRED.filter((n) => !ml.has(n));
  assert.deepEqual(missingFromMapLibre, [], 'and the list must still describe the MapLibre one');
});

test('R180 ③: the Cesium capabilities are honest about what it does NOT do', () => {
  const eng = R('js/cesium-engine.js');
  /* #R173's closed body is a custom GL shader on the MapLibre side; Cesium's polygon can close
     top and bottom but not reproduce the absorption shading, so it must say no and let the
     caller take its documented fallback rather than be handed a look-alike. */
  assert.match(eng, /solid3d:false/, 'solid3d is declared false, not quietly half-implemented');
  assert.match(eng, /addSolid\(\)\{ return false; \}/, '…and the method refuses too');
  /* maplibre-contour registers a protocol on the MapLibre namespace, which does not exist here */
  assert.match(eng, /demContourSource\(\)\{ return null; \}/, 'contours return null, which the call site already handles');
  assert.match(eng, /globeAllZooms:true/, 'a real ellipsoid at every zoom — the thing MapLibre could not do (#R171)');
  assert.match(eng, /tiltRange:\[0,180\]/);
  assert.match(eng, /eyeControl:true/);
});

test('R180 ③: every new user-visible string exists in all five languages', () => {
  const KEYS = ['lblEngine', 'engineMapLibre', 'engineCesium', 'engineHint', 'engineSwitching',
                'engineFellBack', 'engineActive'];
  /* (#R200) the late Object.assign(i18n.xx,{…}) tail left js/app-body.js for js/i18n-late.js — a real
     ES module app-body imports by name. The question is unchanged (does every string exist in five
     languages?); only the file that answers it moved, and asking THAT file is the stricter form. */
  /* ⚠ (#R239) SAME CLAIM, NEW HOME — every keyed string moved into js/locales/ui.<code>.js.
     The `Object.assign(i18n.en…es,{…})` shape this test read was five languages by
     construction, and fr/ko/zh fell back to English for ~170 keys declared that way
     (scripts/i18n-keyed-audit.mjs). Nine locale files is the stricter form of the same
     question. (#R203: move the assertion, say why.) */
  for (const k of KEYS) {
    for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
      assert.ok((() => { const t = R('js/locales/ui.' + c + '.js'); return t.includes(k + ':') || t.includes('"' + k + '":'); })(), `${k} must be defined for ${c}`);
    }
  }
  /* and the markup references them rather than hard-coding English */
  const html = R('index.html');
  assert.match(html, /data-i18n="lblEngine"/);
  assert.match(html, /data-i18n="engineHint"/);
  assert.match(html, /id="setting-engine"/);
});

test('R180 ③: Atlas can operate the engine, and the planner knows the action exists', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = R('js/atlas-console.js') + '\n' + R('js/atlas-catalog-text.js');
  assert.match(atlas, /case 'engine':/, 'the dispatcher handles it');
  /* #R115's rule: an action parameter not in the SYS catalogue does not exist to the planner */
  assert.match(atlas, /\{"type":"engine","name":"maplibre"\|"cesium"\}/,
    'and the SYS catalogue declares it, or Atlas can never emit it');
  assert.match(atlas, /Omit "name" to REPORT which engine is running/,
    'including the read-only form, so "which engine is this?" is answerable');
});

test('R180 ③: the build keeps Cesium in its own chunk and copies its runtime directories', () => {
  const vite = R('vite.config.js');
  assert.match(vite, /node_modules\/cesium.*return 'cesium'/s, 'a chunk of its own');
  assert.match(vite, /CESIUM_DIRS\s*=\s*\['Workers', 'Assets', 'ThirdParty', 'Widgets'\]/,
    'Cesium resolves these at RUN time — bundling the module is not enough');
  assert.match(vite, /apply: 'serve'/, 'and the dev server maps the same path onto node_modules');
});


/* the AST parser is used by the coupling scanner this file imports; keep the dependency
   explicit so a missing acorn fails here rather than somewhere confusing */
void acorn;
