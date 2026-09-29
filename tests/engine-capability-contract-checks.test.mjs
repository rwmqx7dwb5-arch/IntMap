/* ============================================================================
 *  The renderer contract — what each engine declares it can do, and what its adapter really does
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r323-checks (the three capability tables compared structurally), r180-checks ③
 *  (the Cesium adapter answers the same surface and is honest about what it refuses), and the
 *  contract entries #R171, #R172 and #R173 each needed (r171/r172/r173-checks). Titles keep the round
 *  that wrote them.
 *
 *  ── #R323 — the three renderer-capability tables are compared, not just written ──────────────────
 *  IntMap declares what a renderer can do in THREE places that are supposed to describe the same
 *  two engines:
 *
 *    1. js/geo-engine.js    MAPLIBRE_CAPS                  — the shipping engine
 *    2. js/geo-engine.js    CESIUM_CONTRACT.capabilities   — the declared-only contract
 *    3. js/cesium-engine.js CESIUM_CAPS                    — the real Cesium adapter
 *
 *  Nothing compared them. `npm run check:engine` (scripts/engine-coupling.mjs) forbids NAMING a
 *  renderer outside js/geo-engine.js, which is a different question entirely, and the per-round
 *  tests that touched the tables all matched a regex against the WHOLE TEXT of a file:
 *
 *    tests/r202-checks 3a   assert.match(ge, /orbit3d:true/)      <- satisfied by MAPLIBRE_CAPS's
 *                                                                   copy of the string, so the key
 *                                                                   MISSING from table 2 was invisible
 *    tests/r173-checks      assert.match(cesium, /solid3d:true/)  <- table 2 said true
 *    tests/r180-checks 3    assert.match(eng, /solid3d:false/)    <- table 3 says false
 *
 *  The last two were flatly contradictory assertions about one engine, both green since #R180,
 *  because each looked at one table and neither looked at both. Measured as of #R321:
 *
 *    key      | MAPLIBRE_CAPS | CESIUM_CONTRACT | CESIUM_CAPS
 *    orbit3d  | true          | (absent)        | true          <- contracts().cesium...orbit3d === undefined
 *    solid3d  | true          | true            | false         <- the contract CLAIMED what the adapter REFUSES
 *    flat     | true          | false           | true          <- the contract DENIED what the adapter DOES
 *
 *  So the tables are read OUT OF THE AST and compared structurally. A string appearing somewhere in a
 *  file is no longer an answer to "does this table declare it".
 *
 *  WHAT COUNTS AS A CAPABILITY IS DECIDED BY KIND, NOT BY A NAME LIST. A declared capability is a
 *  property whose value is a literal or an array of literals — a FACT about the engine. CESIUM_CAPS
 *  also carries `styleGaps()`, a live probe, and a probe is not a declaration: `can(f)` is
 *  `!!(c && c[f])`, so a function-valued member answers TRUE to `can()` whatever it would return.
 *  Excluding by kind means a new probe never trips this gate and a new capability always does.
 *  Test 6 holds the other end of that: nothing may ask `can()` for a probe.
 *
 *  ── WHAT IS RUN RATHER THAN READ ─────────────────────────────────────────────────────────────────
 *  The capability tables and the adapter methods that REFUSE (addSolid, demContourSource, the
 *  MapLibre setProjection that declines 'globe-true') are lifted out of the AST and EVALUATED: a
 *  refusal is a return value, and a return value is asked for by calling the method.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';
import { appShell } from './app-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* (#R283/#R317) content, not the checkout's bytes — js/ is left to core.autocrlf, so a check
   written against the working copy's line endings says something different on Windows and in CI. */
const read = (p) => readLF(join(ROOT, p));
const parseSrc = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const parse = (p) => parseSrc(read(p));
/* (#R175) "the page" is index.html + src/main.js + js/app-body.js + js/geo-engine.js, concatenated */
const INDEX = appShell(new URL('../', import.meta.url));

/* ── reading one named object literal out of the AST ──────────────────────────────────────────
   `const NAME = { … }`. Returns the ObjectExpression, or null — never a guess. */
function objectNamed(ast, name) {
  let found = null;
  walk.simple(ast, {
    VariableDeclarator(n) {
      if (n.id && n.id.type === 'Identifier' && n.id.name === name &&
          n.init && n.init.type === 'ObjectExpression') found = n.init;
    },
  });
  return found;
}
function propertyNamed(obj, key) {
  for (const p of obj.properties) {
    if (p.type !== 'Property') continue;
    const k = p.key.type === 'Identifier' ? p.key.name : (p.key.type === 'Literal' ? String(p.key.value) : null);
    if (k === key) return p;
  }
  return null;
}
/* every own property, tagged with its KIND — `declared` is the subset this gate compares */
function membersOf(obj) {
  const out = new Map();
  for (const p of obj.properties) {
    if (p.type !== 'Property') continue;
    const k = p.key.type === 'Identifier' ? p.key.name : (p.key.type === 'Literal' ? String(p.key.value) : null);
    if (k == null) continue;
    const v = p.value;
    if (v.type === 'Literal') out.set(k, { declared: true, value: v.value, line: p.loc.start.line });
    else if (v.type === 'ArrayExpression' && v.elements.every((e) => e && e.type === 'Literal'))
      out.set(k, { declared: true, value: v.elements.map((e) => e.value), line: p.loc.start.line });
    else out.set(k, { declared: false, value: `<${v.type}>`, line: p.loc.start.line });
  }
  return out;
}
const declaredOnly = (m) => new Map([...m].filter(([, v]) => v.declared).map(([k, v]) => [k, v.value]));
const show = (v) => (v === undefined ? '(absent)' : JSON.stringify(v));

/* ── EVALUATING what the AST located ─────────────────────────────────────────────────────────── */
/* a `const NAME = <object literal>` evaluated as a value; `window` is the only free name allowed */
function evalConst(src, ast, name, win = {}) {
  const obj = objectNamed(ast, name);
  assert.ok(obj, `${name} is not a const object literal any more`);
  return new Function('window', `return (${src.slice(obj.start, obj.end)});`)(win);
}
/* the named methods of the adapter object literal whose `id` is `idValue`, evaluated in a scope
   that supplies `deps` — so a method that reaches for anything else throws instead of guessing */
function adapterMethods(src, ast, idValue, names, deps = {}) {
  let obj = null;
  walk.full(ast, (n) => {
    if (obj || n.type !== 'ObjectExpression') return;
    const id = n.properties.find((p) => p.type === 'Property' && p.key && p.key.name === 'id');
    if (id && id.value.type === 'Literal' && id.value.value === idValue) obj = n;
  });
  assert.ok(obj, `no adapter object with id '${idValue}'`);
  const text = names.map((name) => {
    const p = propertyNamed(obj, name);
    assert.ok(p, `the '${idValue}' adapter has no ${name}`);
    return src.slice(p.start, p.end);
  }).join(',\n');
  const keys = Object.keys(deps);
  return new Function(...keys, `return {${text}};`)(...keys.map((k) => deps[k]));
}

/* ── the two comparisons, as pure functions so test 5 can prove they are not vacuous ─────────── */
function keySetDrift(tables) {
  const all = [...new Set(tables.flatMap(([, m]) => [...m.keys()]))].sort();
  return all
    .map((key) => ({ key, missingFrom: tables.filter(([, m]) => !m.has(key)).map(([n]) => n) }))
    .filter((d) => d.missingFrom.length > 0);
}
function valueDrift(a, b) {
  return [...new Set([...a.keys(), ...b.keys()])].sort()
    .map((key) => ({ key, contract: a.get(key), adapter: b.get(key) }))
    .filter((d) => JSON.stringify(d.contract) !== JSON.stringify(d.adapter));
}
/* the direction with consequences: the contract hands a caller a YES the adapter will refuse */
function overClaims(contract, adapter) {
  return [...contract].filter(([k, v]) => v === true && adapter.get(k) === false).map(([k]) => k);
}

const GE_SRC = read('js/geo-engine.js'), CE_SRC = read('js/cesium-engine.js');
const GE = parseSrc(GE_SRC);
const CE = parseSrc(CE_SRC);

const mlObj = objectNamed(GE, 'MAPLIBRE_CAPS');
const contractObj = objectNamed(GE, 'CESIUM_CONTRACT');
const cxObj = objectNamed(CE, 'CESIUM_CAPS');

/* ══ #R323 ═══════════════════════════════════════════════════════════════════════════════════════ */

/* ── 0. THE GATE FOUND ITS SUBJECTS ───────────────────────────────────────────────────────────
   (#R301) a check that silently has nothing to check is not a weaker check, it is not a check.
   If a table is renamed or moved, this must go RED rather than pass over an empty Map. */
test('R323 (0) all three capability tables were located and parsed', () => {
  assert.ok(mlObj, 'MAPLIBRE_CAPS not found as a const object literal in js/geo-engine.js');
  assert.ok(contractObj, 'CESIUM_CONTRACT not found as a const object literal in js/geo-engine.js');
  assert.ok(cxObj, 'CESIUM_CAPS not found as a const object literal in js/cesium-engine.js');
  const capsProp = propertyNamed(contractObj, 'capabilities');
  assert.ok(capsProp && capsProp.value.type === 'ObjectExpression',
    'CESIUM_CONTRACT.capabilities is not an object literal');
  for (const [name, obj] of [['MAPLIBRE_CAPS', mlObj], ['CESIUM_CONTRACT.capabilities', capsProp.value], ['CESIUM_CAPS', cxObj]]) {
    assert.ok(membersOf(obj).size >= 15, `${name} has only ${membersOf(obj).size} members — the parse found the wrong object`);
  }
});

const ML = declaredOnly(membersOf(mlObj));
const CONTRACT = declaredOnly(membersOf(propertyNamed(contractObj, 'capabilities').value));
const CX = declaredOnly(membersOf(cxObj));
const TABLES = [['MAPLIBRE_CAPS', ML], ['CESIUM_CONTRACT.capabilities', CONTRACT], ['CESIUM_CAPS', CX]];

/* ── 1. THE SAME KEY SET ──────────────────────────────────────────────────────────────────────
   The tables answer the same questionnaire; only the ANSWERS are per-engine. A key present in one
   and absent from another is not "false there" — it reads `undefined`, which no caller can tell
   apart from "this engine cannot", and which is exactly how orbit3d disappeared from the contract
   while both adapters implemented it. */
test('R323 (1) the three capability tables declare the same key set', () => {
  const drift = keySetDrift(TABLES);
  assert.deepEqual(drift, [], drift.map((d) => `\n  ${d.key} — missing from ${d.missingFrom.join(', ')}`).join(''));
});

/* ── 2. THE CESIUM PAIR AGREES ON EVERY VALUE ─────────────────────────────────────────────────
   Tables 2 and 3 describe ONE engine, so unlike the MapLibre/Cesium comparison this one is about
   values too. Equality subsumes test 3 below; test 3 is stated separately because it is the
   direction that costs a caller something. */
test('R323 (2) the declared Cesium contract and the real Cesium adapter agree on every value', () => {
  const drift = valueDrift(CONTRACT, CX);
  assert.deepEqual(drift, [], drift.map((d) =>
    `\n  ${d.key} — CESIUM_CONTRACT says ${show(d.contract)}, CESIUM_CAPS says ${show(d.adapter)}`).join(''));
});

/* ── 3. THE CONTRACT MAY NOT CLAIM WHAT THE ADAPTER REFUSES ───────────────────────────────────
   Under-claiming costs a feature; OVER-claiming hands a caller a yes and then fails underneath it.
   js/volume3d.js's canSolid() is the live example: it asks `can('solid3d') && layers.addSolid`, and
   the adapter's addSolid returns a hard false ON PURPOSE so the caller keeps its documented
   fallback. A table declaring solid3d:true for Cesium is the one shape that takes that away. */
test('R323 (3) the declared contract never claims a capability the adapter denies', () => {
  const over = overClaims(CONTRACT, CX);
  assert.deepEqual(over, [], `CESIUM_CONTRACT declares true where CESIUM_CAPS declares false: ${over.join(', ')}`);
});

/* ── 4. THE TABLES ARE READ SEPARATELY, NOT AS ONE BLOB ───────────────────────────────────────
   If the reader were matching strings against whole-file text it could not produce DIFFERENT
   values for one key in two tables of the same file — so a legitimate per-engine disagreement is
   the proof that the reader is per-table. */
test('R323 (4) the reader distinguishes the tables (a per-engine answer really differs)', () => {
  assert.equal(ML.get('engine'), 'maplibre');
  assert.equal(CONTRACT.get('engine'), 'cesium');
  assert.equal(CX.get('engine'), 'cesium');
  const differs = [...ML].filter(([k, v]) => CX.has(k) && JSON.stringify(CX.get(k)) !== JSON.stringify(v)).map(([k]) => k);
  assert.ok(differs.length > 0,
    'no key differs between MAPLIBRE_CAPS and CESIUM_CAPS — either the engines became identical or the reader is reading one text twice');
  /* both tables live in one file; a whole-file regex cannot tell these two apart */
  assert.notEqual(ML.get('globeAllZooms'), CONTRACT.get('globeAllZooms'),
    'MAPLIBRE_CAPS and CESIUM_CONTRACT are both in js/geo-engine.js and must still be read as two objects');
});

/* ── 5. THE COMPARATOR IS NOT VACUOUS ─────────────────────────────────────────────────────────
   (#R320, tenth occurrence of "my check hits my own code") A gate that passes is only reassuring if
   it CAN fail. These are the three real tables as they stood at #R321, fed to the same functions
   tests 1-3 use: the comparator must name all three drifts and nothing else. */
test('R323 (5) the comparator reports exactly the three drifts that stood at #R321', () => {
  const r321Contract = new Map([...CONTRACT].filter(([k]) => k !== 'orbit3d'));
  r321Contract.set('solid3d', true);   /* the contract claimed it */
  r321Contract.set('flat', false);     /* …and denied this one */

  const keyDrift = keySetDrift([['MAPLIBRE_CAPS', ML], ['CESIUM_CONTRACT.capabilities', r321Contract], ['CESIUM_CAPS', CX]]);
  assert.deepEqual(keyDrift.map((d) => d.key), ['orbit3d'], 'the key-set comparison must see the missing orbit3d');
  assert.deepEqual(keyDrift[0].missingFrom, ['CESIUM_CONTRACT.capabilities']);

  assert.deepEqual(valueDrift(r321Contract, CX).map((d) => d.key).sort(),
    ['flat', 'orbit3d', 'solid3d'], 'the value comparison must see all three');

  assert.deepEqual(overClaims(r321Contract, CX), ['solid3d'],
    'and the over-claim rule must single out solid3d — the one that would take volume3d fallback away');

  /* and it must be quiet on the tables as they actually are now */
  assert.deepEqual(keySetDrift(TABLES), []);
  assert.deepEqual(valueDrift(CONTRACT, CX), []);
  assert.deepEqual(overClaims(CONTRACT, CX), []);
});

/* ── 6. A PROBE IS NOT A CAPABILITY, AND NOTHING MAY ASK can() FOR ONE ────────────────────────
   Tests 1-3 compare declarations and skip function-valued members BY KIND. That exclusion is only
   sound while no caller treats a probe as a capability: `can(f)` is `!!(c && c[f])`, so
   `can('styleGaps')` would answer true for a function that returns an empty array. */
test('R323 (6) no caller asks can() for a function-valued member', () => {
  const probes = new Set();
  for (const obj of [mlObj, cxObj, propertyNamed(contractObj, 'capabilities').value]) {
    for (const [k, v] of membersOf(obj)) if (!v.declared) probes.add(k);
  }
  const asked = new Set();
  for (const f of ['js/geo-engine.js', 'js/cesium-engine.js', 'js/volume3d.js', 'js/map-extras.js',
                   'js/app-body.js', 'js/map-ui.js', 'js/data-layers.js', 'js/flight-sim.js']) {
    for (const m of read(f).matchAll(/\.can\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) asked.add(m[1]);
  }
  const bad = [...asked].filter((k) => probes.has(k));
  assert.deepEqual(bad, [], `can() asked for a function-valued member, which is always true: ${bad.join(', ')}`);
  /* every capability can() actually asks for must be a declared key in both engines */
  const unknown = [...asked].filter((k) => !ML.has(k) || !CX.has(k));
  assert.deepEqual(unknown, [], `can() asks for a capability no table declares: ${unknown.join(', ')}`);
});

/* ══ #R180 ③ THE CESIUM ADAPTER ANSWERS THE SAME SURFACE ════════════════════════════════════════ */

/* ⚠ READ, NOT RUN: the method NAMES each adapter offers are a property of its object literal; the
   adapters themselves need a live renderer (MapLibre map / Cesium Viewer) to construct. */
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
  const ml = names(read('js/geo-engine.js'), "return { id:'maplibre'");
  const cs = names(read('js/cesium-engine.js'), "id:'cesium', capabilities:CESIUM_CAPS");
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

/* RUN: the capability table is evaluated as a value, and the refusing methods are CALLED. */
test('R180 ③: the Cesium capabilities are honest about what it does NOT do', () => {
  const caps = evalConst(CE_SRC, CE, 'CESIUM_CAPS', { IntMapStyle: { gaps: () => [] } });
  /* #R173's closed body is a custom GL shader on the MapLibre side; Cesium's polygon can close
     top and bottom but not reproduce the absorption shading, so it must say no and let the
     caller take its documented fallback rather than be handed a look-alike. */
  assert.equal(caps.solid3d, false, 'solid3d is declared false, not quietly half-implemented');
  const A = adapterMethods(CE_SRC, CE, 'cesium', ['addSolid', 'setSolid', 'removeSolid', 'demContourSource']);
  assert.equal(A.addSolid('imv3d-body'), false, '…and the method refuses too');
  assert.equal(A.setSolid('imv3d-body', {}), false);
  assert.equal(A.removeSolid('imv3d-body'), false);
  /* maplibre-contour registers a protocol on the MapLibre namespace, which does not exist here */
  assert.equal(A.demContourSource({ url: 'x' }), null, 'contours return null, which the call site already handles');
  assert.equal(caps.globeAllZooms, true, 'a real ellipsoid at every zoom — the thing MapLibre could not do (#R171)');
  assert.deepEqual(caps.tiltRange, [0, 180]);
  assert.equal(caps.eyeControl, true);
});

/* ══ THE ENTRIES #R171, #R172 AND #R173 NEEDED ══════════════════════════════════════════════════ */

/* ⚠ READ, NOT RUN: whether the facade EXPOSES a name is a property of the facade's object literal;
   the facade binds a live adapter only inside the booted page. */
test('#R171 the engine contract declares what this round needed, and Cesium answers for it too', () => {
  const caps = INDEX.slice(INDEX.indexOf('const MAPLIBRE_CAPS='), INDEX.indexOf('const MapLibreAdapter='));
  for (const k of ['globeAllZooms', 'tiltRange', 'cameraAltitude']) assert.ok(caps.includes(k), `capability ${k} missing`);
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1400);
  for (const k of ['globeAllZooms', 'tiltRange', 'cameraAltitude']) assert.ok(cesium.includes(k), `the Cesium contract must answer for ${k}`);
  for (const m of ['getProjection:', 'setBearing:', 'setPitch:', 'getMaxPitch:', 'setMaxPitch:', 'tiltRange:', 'altitude:']) {
    assert.ok(INDEX.includes(m), `the camera facade must expose ${m}`);
  }
  /* (#R179) the facade is a FUNCTION of an adapter now (engineFacade(A)), so the bindings read
     `A().x()` rather than `_adapter.x()` — an additional view has to get the same object, and it
     cannot if the object closes over the engine's own adapter. The claim is unchanged. */
  assert.match(INDEX, /input:\{ setDragPan:on=>A\(\)\.setDragPan\(on\),/   /* (#R178) the section grew — every gesture by name — but setDragPan is still its first entry */, 'gesture hand-over belongs in the contract');
});

/* RUN: the capability tables are evaluated, and the MapLibre adapter's setProjection is CALLED with a
   renderer stub — the refusal is its return value, and the renderer must never be asked. */
test('#R172 the engine refuses a projection it cannot honour instead of wrecking the view', () => {
  const MAPLIBRE_CAPS = evalConst(GE_SRC, GE, 'MAPLIBRE_CAPS');
  assert.equal(MAPLIBRE_CAPS.globeAllZooms, false, 'MapLibre cannot give a curved Earth at cockpit zoom with a DEM — say so');
  const asked = [];
  const m = { setProjection: (spec) => asked.push(spec) };
  const A = adapterMethods(GE_SRC, GE, 'maplibre', ['setProjection'], { _m: () => m, MAPLIBRE_CAPS });
  assert.equal(A.setProjection('globe-true'), false,
    'setProjection must decline rather than blank the map; the caller then reports honestly');
  assert.deepEqual(asked, [], 'and a declined projection never reaches the renderer');
  assert.equal(A.setProjection('globe'), true, 'the projections it CAN honour still go through');
  assert.deepEqual(asked, [{ type: 'globe' }]);
  const CESIUM_CONTRACT = evalConst(GE_SRC, GE, 'CESIUM_CONTRACT');
  assert.equal(CESIUM_CONTRACT.capabilities.globeAllZooms, true,
    'a positional-camera engine still answers true — the capability is per-engine, not a global no');
});

/* ⚠ READ, NOT RUN: as #R171's contract test above — names on the facade literal. */
test('#R172 the contract grew for what this round needed, and Cesium answers for it too', () => {
  const caps = INDEX.slice(INDEX.indexOf('const MAPLIBRE_CAPS='), INDEX.indexOf('const MapLibreAdapter='));
  assert.ok(caps.includes('eyeControl'), 'capability eyeControl missing');
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1400);
  assert.ok(cesium.includes('eyeControl:true'), 'the Cesium contract must answer for eyeControl');
  for (const m of ['eye:', 'setEye:', 'setCenterClamped:', 'setTiltPivot:', 'isAnimating:', 'forBounds:', 'getPadding:']) {
    assert.ok(INDEX.includes(m), `the camera facade must expose ${m}`);
  }
});

/* ⚠ READ, NOT RUN: as #R171's contract test above — names on the facade literal. */
test('#R173 the three contract entries this round needed are declared, faced and answered by Cesium too', () => {
  for (const m of ['globeness()', 'addSolid(id,before)', 'setSolid(id,o)', 'removeSolid(id)', 'projectAltitude(ll,altM)']) {
    assert.ok(INDEX.includes(m), `the MapLibre adapter implements ${m}`);
  }
  /* (#R179) the facade is a FUNCTION of an adapter now (engineFacade(A)), so the bindings read
     `A().x()` rather than `_adapter.x()`. The claim is unchanged. */
  assert.match(INDEX, /globeness:\(\)=>A\(\)\.globeness/, 'globeness is on the facade');
  assert.match(INDEX, /addSolid:\(id,b\)=>A\(\)\.addSolid/, 'so is addSolid');
  assert.match(INDEX, /projectAltitude:\(ll,a\)=>A\(\)\.projectAltitude/, 'so is projectAltitude');
  assert.match(INDEX, /\n\s+solid3d:true,/, 'and solid3d is a declared capability');
  const cesium = INDEX.slice(INDEX.indexOf('const CESIUM_CONTRACT='), INDEX.indexOf('const CESIUM_CONTRACT=') + 1600);
  /* (#R323) …and its answer is FALSE. This line asserted `solid3d:true` from #R173 until #R323:
     js/cesium-engine.js — written later, with the SDK actually in hand — declares `solid3d:false`
     and refuses addSolid/setSolid/removeSolid outright, because the eye-dependent absorption
     shading js/solid3d.js computes is not native. Two rounds, two green tests, opposite claims about
     one engine — because neither compared the two tables. #R323 above compares them; this line
     agrees with the adapter. The claim worth keeping is unchanged: the contract must ANSWER for
     solid3d rather than omit it. */
  assert.match(cesium, /solid3d:false/, 'the contract answers what the adapter answers, not what the engine ought to manage');
});
