/* ============================================================================
 *  atlas-one-declaration — ONE capability, declared ONCE; the rest is derived
 * ----------------------------------------------------------------------------
 *  Measured 2026-09-29 on routing.isochrone: one capability was written in seven places. Its row in
 *  js/atlas-capabilities.js (id, column-1 spelling, four aliases, observer, writes, target); the
 *  dispatch label run `case 'isochrone': case 'reach': case 'reachability': case 'reachable':
 *  case 'catchment':` — the aliases a SECOND time; the map-chip table `OVL_OF` — the aliases a THIRD
 *  time; and `_OVL`, which typed the layer ids js/map-tools.js creates, beside the render.claim that
 *  js/map-tools.js already makes and the observer already reads (the #R736 shape: a typed id list
 *  beside the fact it copies).
 *
 *  What changed, and what each section below RUNS to hold it:
 *    ① the dispatch switches on `CAPS.dispatchName(a.type)`; a case carries one spelling. Every
 *       spelling the dispatch answered before still reaches the SAME case — asked of the resolver the
 *       dispatch calls, against the label runs photographed before the change.
 *    ② `updateWctx` asks the same resolver, so every declared spelling feeds the conversation state.
 *    ③ `OVL_OF` is keyed by capability id and reached through the row's spellings.
 *    ④ the chip's layers for a claimed kind are what the painter claimed — the painters and the
 *       claims are the shipped code, run against one renderer with the shipped claim bookkeeping.
 *    ⑤ SYS(): the one language-dependent line is last, so the prefix is the same in every language.
 *
 *  THE BEFORE is tests/fixtures/atlas-one-declaration-before.json — the label runs, `_OVL` and `OVL_OF`
 *  as they stood at origin/main 6dad1019. It is a photograph, and it is the point: a refactor that
 *  may not lose a spelling or a switched layer has to be measured against what existed.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction, liftLiteral } from './helpers/lift-function.mjs';
import { capsSource, dispatchRuns } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { personaPrompt } = await import('../js/atlas-persona.js');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const BEFORE = JSON.parse(read('tests/fixtures/atlas-one-declaration-before.json'));
const CAPS = makeAtlasCapabilities({});
const CON_SRC = (read('js/atlas-console.js') + '\n' + capsSource());
const CON = codeOnly(CON_SRC);

/* the dispatch's fall-through label runs, read from the switch that calls the resolver */
/* (atlas-capability-modules) the switch became ONE lookup — `CAP_RUN[CAPS.dispatchName(a.type)]` — over the entries in
   js/atlas-cap-<namespace>.js, so a «run» is now the spellings whose entries name the same run (a spelling that used
   to fall through to the next case's body names that body's function). */
function liveRuns() {
  assert.ok(/CAPS\.dispatchName\(a\.type\)/.test(codeOnly(read('js/atlas-console.js'))), 'the dispatch no longer asks CAPS.dispatchName(a.type) — the aliases would stop arriving');
  return dispatchRuns();
}

/* ── ① every spelling the dispatch answered still reaches the same case ─────────────────────── */
test('atlas-one-declaration ①: all 368 dispatch spellings of the photograph reach the case they reached before', () => {
  const runs = liveRuns(), live = new Set(runs.flat());
  let n = 0;
  for (const before of BEFORE.dispatchRuns) {
    for (const sp of before) {
      const to = CAPS.dispatchName(sp);
      assert.ok(before.includes(to), `'${sp}' now reaches '${to}', which was not in its case before (${before.join(', ')})`);
      assert.ok(live.has(to), `'${sp}' resolves to '${to}', which no case answers any more`);
      n++;
    }
  }
  assert.equal(n, BEFORE.dispatchRuns.flat().length);
  assert.ok(n >= 368, `the photograph holds ${n} spellings — it was taken with 368`);
  /* no label moved to another body: every live run is a subset of one run of the photograph */
  /* (world-at-time) a run made only of spellings the photograph never held is a capability added after it
     (`time.coverage`) — it cannot mix cases that used to be apart, having none of them */
  const pictured = new Set(BEFORE.dispatchRuns.flat());
  for (const run of runs) {
    if (!run.some((x) => pictured.has(x))) continue;
    assert.ok(BEFORE.dispatchRuns.some((b) => run.every((x) => b.includes(x))), `the run ${run.join(', ')} mixes cases that used to be apart`);
  }
  /* and a case carries the row's column-1 spelling, never a copy of an alias */
  for (const label of live) {
    const c = CAPS.ofSpelling(label);
    assert.ok(!c || c.legacy === label, `case '${label}' repeats an alias of ${c && c.id} — its row already declares it`);
  }
});

test('atlas-one-declaration ①b: every spelling a row declares reaches a live case — including the ones no label ever carried', () => {
  const live = new Set(liveRuns().flat());
  const before = new Set(BEFORE.dispatchRuns.flat());
  const gained = [];
  for (const c of CAPS.all()) {
    if (!c.legacy) continue;
    for (const a of c.aliases) {
      const to = CAPS.dispatchName(a);
      assert.equal(to, c.legacy, `'${a}' of ${c.id} resolves to '${to}'`);
      assert.ok(live.has(to), `'${a}' of ${c.id} reaches no case`);
      if (!before.has(a)) gained.push(a);
    }
  }
  /* measured: 12 declared spellings (explainTerm, defineTerm, shaking, pressureContours, isolines and the seven
     base-display presets) used to fall through to `default`. Named, not counted: the list may only grow. */
  for (const a of ['explainTerm', 'defineTerm', 'shaking', 'pressureContours', 'isolines', 'baseMode', 'displayPreset']) assert.ok(gained.includes(a), a);
});

test('atlas-one-declaration ①c: the resolver compares exactly, as a switch does — it answers no spelling nobody declared', () => {
  assert.equal(CAPS.dispatchName('reach'), 'isochrone');
  assert.equal(CAPS.dispatchName('isochrone'), 'isochrone');
  assert.equal(CAPS.dispatchName('Reach'), 'Reach', 'resolve() folds case; the dispatch never did, and must not start');
  assert.equal(CAPS.dispatchName('routing.isochrone'), 'routing.isochrone', 'a capability id is not a dispatch spelling');
  assert.equal(CAPS.dispatchName('noSuchThing'), 'noSuchThing', 'an unknown spelling reaches `default` unchanged');
  assert.equal(CAPS.ofSpelling(undefined), null);
  /* a capability defined at run time is a row like any other */
  const X = makeAtlasCapabilities({});
  X.define({ id: 'test.late', legacy: 'lateThing', aliases: ['lateThing', 'lateAlias'], execute: () => null });
  assert.equal(X.dispatchName('lateAlias'), 'lateThing');
});

/* ── ② the conversation state hears every spelling ───────────────────────────────────────────── */
test('atlas-one-declaration ②: updateWctx counts every declared spelling — `historical` and `synthesize` were missed', () => {
  const make = new Function('CAPS', '_wctx', liftFunction(CON, '_eraYear') + '\n' + liftFunction(CON, 'updateWctx') + '\nreturn updateWctx;');
  const hist = CAPS.resolve('research.historicalMap');
  for (const sp of hist.aliases) {
    const w = { countries: [], metrics: [], year: null };
    make(CAPS, w)([{ type: sp, era: 'Europe 1914' }], []);
    assert.equal(w.year, 1914, `${sp} did not carry its year to the next turn`);
  }
  for (const sp of CAPS.resolve('research.analyze').aliases) {
    const w = { countries: [], metrics: [] };
    make(CAPS, w)([{ type: sp, question: 'why' }], []);
    assert.equal(w.topic, 'why', `${sp} did not carry its topic`);
  }
  const w = { countries: [], metrics: [] };
  make(CAPS, w)([{ type: 'Analyze', question: 'why' }], []);
  assert.equal(w.topic, undefined, 'an undeclared spelling counts for nothing, as before');
});

/* ── ③ OVL_OF: one entry per capability, every spelling through the row ───────────────────────── */
/* the kinds that became the effect key their painter claims under */
const RENAMED = { poi: 'map.poi', elevation: 'map.elevation', historical: 'map.factions', fly: 'map.fly', blast: 'map.ballistic', isochrone: 'map.isochrone', compose: 'map.compose',
  route: 'map.route', radiation: 'map.radiation', compare: 'panel.compare', los: 'map.los', shakemap: 'map.shakemap', outbreaks: 'map.outbreaks' };
/* (atlas-capability-single-source) the table is each entry's `chips` now — js/atlas-console.js derives OVL_OF from them the same way */
const OVL_OF = Object.create(null);
for (const e of (await import('../js/atlas-caps.js')).capabilityEntries((await import('../js/atlas-caps-modules.js')).CAPABILITY_MODULES)) if (e.chips) OVL_OF[e.id] = e.chips;
assert.ok(CON.includes('const OVL_OF=Object.create(null); capabilityEntries(CAPABILITY_MODULES).forEach(e=>{ if(e.chips) OVL_OF[e.id]=e.chips; });'), 'js/atlas-console.js derives its chip table from the entries');
const ovlOf = new Function('CAPS', 'OVL_OF', liftFunction(CON, '_ovlOf') + '\nreturn _ovlOf;')(CAPS, OVL_OF);
const kindsOf = (v) => (v == null ? null : [].concat(v));

test('atlas-one-declaration ③: every spelling that had a chip still has the same one, and every OVL_OF key is a capability id', () => {
  for (const [sp, old] of Object.entries(BEFORE.ovlOf)) {
    const c = CAPS.ofSpelling(sp);
    if (!c) {
      /* flyPath, greatCircle, radarShadow, isolateRegion, focus, marker: no row declares them and no case answered them */
      assert.ok(!BEFORE.dispatchRuns.flat().includes(sp), `'${sp}' was a dispatch spelling with a chip and lost it`);
      continue;
    }
    const want = kindsOf(old) && kindsOf(old).map((k) => RENAMED[k] || k);
    const got = kindsOf(ovlOf(sp));
    /* sim.ballistic: fly + blast are now fly + ballistic (the ballistic key claims both of its sources) */
    assert.deepEqual(got, want, `'${sp}' (${c.id}) switches ${JSON.stringify(got)}, it switched ${JSON.stringify(want)}`);
  }
  for (const id of Object.keys(OVL_OF)) assert.ok(CAPS.resolve(id) && CAPS.resolve(id).id === id, `OVL_OF key '${id}' is not a capability id`);
  /* one row, all spellings: the aliases OVL_OF used to omit now get the chip their capability has */
  for (const [sp, id] of [['rfCoverage', 'sim.rfCoverage'], ['trajectory', 'sim.flyAnimate'], ['transitRoute', 'routing.route'], ['facilities', 'map.poi'], ['extent', 'map.outline'], ['newsEvents', 'research.events'], ['airports', 'data.runways']]) {
    assert.deepEqual(kindsOf(ovlOf(sp)), kindsOf(OVL_OF[id]), `${sp} → ${id}`);
  }
});

/* ── ④ a claimed kind's layers are what the painter claimed ───────────────────────────────────── */
/* one renderer: the claim bookkeeping is js/geo-engine.js's own (lifted), over an adapter holding a style */
function engine() {
  const GEO = codeOnly(read('js/geo-engine.js'));
  const { claimSurfaces, surfacesDrawn } = new Function(liftFunction(GEO, 'claimSurfaces') + '\n' + liftFunction(GEO, 'surfacesDrawn') + '\nreturn { claimSurfaces, surfacesDrawn };')();
  const sources = new Map(), layers = [], claims = new Map();
  const vis = (id) => { const l = layers.find((x) => x.id === id); return !!l && !(l.layout && l.layout.visibility === 'none'); };
  const adapter = { raw: () => ({}), canDraw: () => true, hasSource: (id) => sources.has(id), sourceData: (id) => (sources.get(id) || {}).data || null,
    getStyle: () => ({ layers: layers.map((l) => JSON.parse(JSON.stringify(l))) }), isVisible: vis };
  const noop = new Proxy({}, { get: () => () => null });
  const E = {
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id, spec) => { sources.set(id, JSON.parse(JSON.stringify(spec))); },
      removeSource: (id) => { sources.delete(id); }, updateImage: () => true,
      has: (id) => layers.some((l) => l.id === id), add: (l) => { layers.push(JSON.parse(JSON.stringify(l))); },
      remove: (id) => { const i = layers.findIndex((x) => x.id === id); if (i >= 0) layers.splice(i, 1); },
      setSourceData: (id, d) => { if (sources.has(id)) sources.get(id).data = d; },
      getLayout: (id, k) => { const l = layers.find((x) => x.id === id); return l && l.layout ? l.layout[k] : undefined; },
      setLayout: (id, k, v) => { const l = layers.find((x) => x.id === id); if (l) (l.layout || (l.layout = {}))[k] = v; },
    },
    scene: { getStyle: adapter.getStyle },
    render: { claim: (ids, owner, o) => claimSurfaces(claims, ids, owner, o), drawn: (q) => surfacesDrawn(() => adapter, claims, q), canvas: () => null },
    canDraw: () => true, hasRenderer: () => true,
    events: noop, ui: noop,
  };
  return { GE: () => E, claims, layers };
}

/* the named `const` string values a lifted function closes over, read from the file that ships them */
function constsOf(code, names) {
  const out = {};
  for (const n of names) {
    const m = new RegExp('\\b' + n + "\\s*=\\s*'([^']+)'").exec(code);
    if (m) { out[n] = m[1]; continue; }
    /* an array literal — brackets matched, strings stepped over (the source is comment-stripped) */
    const a = new RegExp('\\b' + n + '\\s*=\\s*\\[').exec(code);
    assert.ok(a, `const ${n} not found`);
    let i = a.index + a[0].length - 1, d = 0, q = null;
    for (; i < code.length; i++) { const c = code[i]; if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c; else if (c === '[') d++; else if (c === ']' && !--d) break; }
    out[n] = Function('return ' + code.slice(a.index + a[0].length - 1, i + 1))();
  }
  return out;
}
/* run a lifted function (or several) with the named values in scope */
function runLifted(code, fns, scope, call) {
  const keys = Object.keys(scope);
  return new Function(...keys, fns.map((n) => liftFunction(code, n)).join('\n') + '\n' + call)(...keys.map((k) => scope[k]));
}

function paintEverything(eng) {
  const W = { IntMapLabelScale: { sub: (x) => 11 * x } };
  const yes = () => true, nop = () => {};
  /* js/map-tools.js — the reach panel's painter and its claim, both as they ship */
  const MT = codeOnly(read('js/map-tools.js'));
  const iso = MT.slice(MT.indexOf("const SRC='im-iso-src'"));
  const isoClaim = /try\{ GE\(\)\.render\.claim\(SRC,'map\.isochrone',\{clear\}\); \}catch\(_\)\{\}/.exec(iso);
  assert.ok(isoClaim, 'js/map-tools.js no longer claims the reach under map.isochrone');
  new Function('GE', "const SRC='im-iso-src'; const clear=()=>{};\n" + liftFunction(iso, 'ensureLayers') + '\nensureLayers();\n' + isoClaim[0])(eng.GE);
  /* js/atlas-sims.js — the four surfaces js/atlas-console.js claims for it */
  const SIMS = codeOnly(read('js/atlas-sims.js'));
  for (const f of ['ensureFlyLayers', 'ensureBlastLayers', 'ensureElevLayers', 'ensureFacLayers']) runLifted(SIMS, [f], { GE: eng.GE, geo: () => ({}), window: W }, f + '();');
  /* js/atlas-console.js — the POI layer, and the mount-time claim statement exactly as it ships */
  runLifted(CON, ['ensurePoiLayer'], { GE: eng.GE, window: W }, 'ensurePoiLayer();');
  const mount = /try\{ const RC=GE\(\)\.render; RC\.claim\([^\n]*?\}catch\(_\)\{\}/.exec(CON);
  assert.ok(mount, 'the mount-time claim statement moved');
  const stubs = ['clearPolyHl', 'clearLineHl', 'clearPois', 'clearFly', 'clearBlast', 'clearElev', 'clearFac'];
  new Function('GE', ...stubs, mount[0])(eng.GE, ...stubs.map(() => nop));
  /* js/atlas-map-compose.js — the real module claims at construction; its painter is lifted */
  const C = makeAtlasMapCompose({ GE: eng.GE });
  runLifted(codeOnly(read('js/atlas-map-compose.js')), ['ensureLayers'], { GE: eng.GE, window: W, SRC: C.SRC }, 'ensureLayers();');
  /* js/routing.js — the journey, and the drawn keep-out areas */
  const RT = codeOnly(read('js/routing.js'));
  runLifted(RT, ['ensureLayers', '_layersOK'], { GE: eng.GE, _watchStyle: nop, _imCanDraw: yes, _wireLineEvents: nop, ...constsOf(RT, ['SRC', 'LAYERS']) }, 'ensureLayers();');
  runLifted(RT, ['_areaLayers'], { GE: eng.GE, ...constsOf(RT, ['AREA_SRC', 'AREA_FILL', 'AREA_LINE']) }, '_areaLayers();');
  /* js/routing-ops.js's two analyses are not claimed — the residual row — but they are created, so the chip has them */
  eng.GE().layers.addSource('imroute-diff-src', {}); eng.GE().layers.add({ id: 'imroute-diff', source: 'imroute-diff-src' });
  eng.GE().layers.addSource('imroute-hist-src', {}); eng.GE().layers.add({ id: 'imroute-hist', source: 'imroute-hist-src' });
  /* js/sims.js — the radiation plume (the first IIFE of the file: its SRC is the plume's) */
  const SM = codeOnly(read('js/sims.js'));
  runLifted(SM, ['ensureLayers'], { GE: eng.GE, _imCanDraw: yes, ...constsOf(SM, ['SRC', 'DEP']) }, 'ensureLayers();');
  /* js/stats-compare.js — the compared countries */
  const SC = codeOnly(read('js/stats-compare.js'));
  const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { iso: 'JPN' }, geometry: { type: 'Point', coordinates: [0, 0] } }] };
  runLifted(SC, ['ensureCmpMap'], { GE: eng.GE, _LY: () => eng.GE().layers, HOST: {}, window: { countryGeo: geo } }, 'ensureCmpMap();');
  /* js/viewshed.js — the site layer, and the one image the analysis paints */
  const VS = codeOnly(read('js/viewshed.js'));
  runLifted(VS, ['ensureLayers', 'paint'], { GE: eng.GE, _imCanDraw: yes, ...constsOf(VS, ['SRC', 'IMGSRC', 'IMGLYR']) }, "ensureLayers(); paint('data:,', [[0,1],[1,1],[1,0],[0,0]]);");
  /* js/shakemap.js — contours and field, and the two module-level claims as they ship */
  const SK = codeOnly(read('js/shakemap.js'));
  const skConsts = constsOf(SK, ['SRC_IMG', 'LYR_IMG', 'SRC_LN', 'LYR_LN', 'LYR_LB']);
  runLifted(SK, ['drawContours', 'drawField'], { GE: eng.GE, beforeId: () => undefined, opacity: 0.72, clearField: nop, ...skConsts },
    "drawContours({type:'FeatureCollection',features:[]}); drawField({url:'data:,',coords:[[0,1],[1,1],[1,0],[0,0]]});");
  const skClaims = SK.match(/try \{ GE\(\)\.render\.claim\(SRC_(?:LN|IMG), 'map\.shakemap'[^\n]*?\} catch \(_\) \{ \}/g) || [];
  assert.equal(skClaims.length, 2, 'js/shakemap.js claims its contours and its field under map.shakemap');
  new Function('GE', 'close', ...Object.keys(skConsts), skClaims.join('\n'))(eng.GE, nop, ...Object.values(skConsts));
  /* js/outbreaks.js — the WHO points */
  const OB = codeOnly(read('js/outbreaks.js'));
  runLifted(OB, ['ensureLayers'], { GE: eng.GE, lastFC: { type: 'FeatureCollection', features: [] }, ...constsOf(OB, ['SRC', 'LYR_HALO', 'LYR_PT', 'LYR_LB', 'AGE_RAMP']) }, 'ensureLayers();');
}

/* layer ids some shipped file creates — the photograph's rows held three that nothing creates */
const created = (() => { const all = ['js/viewshed.js', 'js/street-view.js', 'js/atlas-console.js'].map((p) => codeOnly(read(p))).join('\n');
  return (id) => new RegExp("id:\\s*'" + id + "'").test(all); })();

test('atlas-one-declaration ④: each claimed kind switches the layers its painter draws — run, not read', () => {
  const eng = engine();
  paintEverything(eng);
  const OVL = Function('return ' + liftLiteral(CON, '_OVL'))();
  const ovlIds = new Function('GE', '_OVL', liftFunction(CON, '_ovlIds') + '\nreturn _ovlIds;')(eng.GE, OVL);
  const sorted = (a) => a.slice().sort();
  for (const [old, key] of Object.entries(RENAMED)) {
    assert.ok(!(old in OVL), `_OVL still types '${old}' — the claim under ${key} is the list`);
    if (old === 'blast' || old === 'radiation' || old === 'los') continue;   /* measured below */
    assert.deepEqual(sorted(ovlIds(key)), sorted(BEFORE.ovl[old]), `${key} switches ${ovlIds(key)} — it switched ${BEFORE.ovl[old]}`);
  }
  assert.deepEqual(sorted(ovlIds('map.ballistic')), sorted(BEFORE.ovl.fly.concat(BEFORE.ovl.blast)), 'a strike switches its trajectory and its rings — the same union as fly + blast');
  /* measured when replaced: the radiation row missed the deposition outline, which stayed on the map when the chip went OFF */
  assert.deepEqual(sorted(ovlIds('map.radiation')), sorted(BEFORE.ovl.radiation.concat(['imrad-dep-line'])));
  /* …and the line-of-sight row named three layers no file creates, and missed the analysis image */
  for (const id of BEFORE.ovl.los) assert.equal(ovlIds('map.los').includes(id), created(id), `${id}: switched iff something creates it`);
  assert.ok(ovlIds('map.los').includes('los-img'), 'the viewshed image is switched with its site');
  assert.deepEqual(sorted(ovlIds('map.compose')), sorted(makeAtlasMapCompose({}).LAYERS), 'the compose chip is the module\'s own layer list');
  /* what is still typed: the photograph's rows for the unclaimed kinds, unchanged, and routing-ops' two analyses under the route key */
  for (const k of Object.keys(OVL)) {
    if (k === 'map.route') { assert.deepEqual(OVL[k], ['imroute-diff', 'imroute-hist']); continue; }
    assert.deepEqual(OVL[k], BEFORE.ovl[k], `_OVL.${k} changed`);
  }
  assert.deepEqual(sorted(Object.keys(OVL).filter((k) => k !== 'map.route').concat(Object.keys(RENAMED))), sorted(Object.keys(BEFORE.ovl)), 'a kind was dropped without a claim to replace it');
  assert.deepEqual(ovlIds('arc'), [], 'the arc canvas is not a layer');
  assert.deepEqual(ovlIds('map.nothingClaimed'), [], 'an unclaimed key switches nothing');
});

test('atlas-one-declaration ④b: the chip only READS the claims, and every claim is the painter\'s own', () => {
  const eng = engine();
  paintEverything(eng);
  const snapshot = () => JSON.stringify([...eng.claims.entries()].map(([id, c]) => [id, c.owners.slice().sort(), !!c.clear]).sort());
  const before = snapshot();
  const inventory = JSON.stringify(eng.GE().render.drawn({}));
  const OVL = Function('return ' + liftLiteral(CON, '_OVL'))();
  const ovlIds = new Function('GE', '_OVL', liftFunction(CON, '_ovlIds') + '\nreturn _ovlIds;')(eng.GE, OVL);
  for (const k of Object.values(RENAMED).concat(Object.keys(OVL))) ovlIds(k);
  assert.equal(snapshot(), before, 'asking which layers a chip switches changed the claims — the observers\' input');
  assert.equal(JSON.stringify(eng.GE().render.drawn({})), inventory, 'and so what paintNow() / ownSurfaces() would read');
  /* every claim is made under an effect key a capability declares it writes */
  const writes = new Set(CAPS.all().flatMap((c) => c.effects.writes));
  for (const [id, owners] of JSON.parse(before)) for (const o of owners) assert.ok(writes.has(o), `${id} is claimed under '${o}', which no capability writes`);
  /* the painters added in this change pass NO remover, so the one undo (js/atlas-state.js 'surfaces') treats them as before */
  const added = ['imroute-src', 'imroute-area-src', 'imrad-src', 'imrad-dep-src', 'imcmp-src', 'los-src', 'los-img-src', 'shk-field-src', 'who-don-src'];
  for (const [id, , hasClear] of JSON.parse(before)) if (added.includes(id)) assert.equal(hasClear, false, `${id} carries a remover`);
  assert.deepEqual(added.filter((id) => !JSON.parse(before).some((x) => x[0] === id)), [], 'a painter stopped claiming');
});

/* ── ⑤ SYS(): the language line is last ──────────────────────────────────────────────────────── */
test('atlas-one-declaration ⑤: everything SYS() sends before the reply-language line is the same bytes in every language', () => {
  const lines = CON_SRC.split('\n');
  const s = lines.findIndex((l) => /^\s*function SYS\(\w*\)\s*\{/.test(l));
  const e = lines.findIndex((l, i) => i > s && /^    \}$/.test(l));
  const lifted = ['_capIndex', '_directCaps'].map((n) => liftFunction(CON_SRC, n)).join('\n');
  const tools = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: () => {} }).baseTools();
  const build = (lang) => {
    const env = { personaPrompt, POLICY: makeAtlasPolicy(), CAPS, Object, String, JSON, __baseTools: tools, _langLine: () => lang };
    const stub = new Proxy(env, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (typeof k === 'string' ? () => '' : undefined))) });
    return new Function('__stub', 'with(__stub){ ' + lifted + '\n' + lines.slice(s, e + 1).join('\n') + ' return SYS(__baseTools); }')(stub);
  };
  /* (atlas-legacy-protocol-removal) SYS() has one form now; the second, for the retired one-string transport, was measured here too */
  const en = build('English'), jp = build('Japanese');
  const tEn = 'Write final_text in English.\n', tJp = 'Write final_text in Japanese.\n';
  assert.ok(en.endsWith(tEn) && jp.endsWith(tJp), 'the reply-language line is not the last line of SYS()');
  assert.equal(en.slice(0, -tEn.length), jp.slice(0, -tJp.length), 'something above the language line depends on the language');
  assert.match(en, /\[WHAT INTMAP CAN DO\]/, 'the capability index is part of what is measured');
  /* measured 2026-09-29 with the real index and base tools: the shared prefix grew from 11,199 to 14,172
     characters — every byte but the last line */
  assert.ok(en.length - tEn.length > 14000, `the prefix is ${en.length - tEn.length}`);
});

/* ── ⑥ the answer families of js/atlas-turn-results.js come from the same rows ────────────────── */
test('atlas-one-declaration ⑥: ANSWER_TYPES is derived from five capability rows — the same 14 spellings, none written down', async () => {
  const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
  const had = globalThis.IntMapCapabilities;
  const own = makeAtlasTurnResults({});
  assert.deepEqual(Object.keys(own.ANSWER_TYPES).sort(), BEFORE.answerTypes.slice().sort(), 'without an injected registry');
  assert.equal(globalThis.IntMapCapabilities, had, 'building the private registry replaced the app\'s published one');
  const injected = makeAtlasTurnResults({ capabilities: CAPS });
  assert.deepEqual(Object.keys(injected.ANSWER_TYPES).sort(), BEFORE.answerTypes.slice().sort(), 'with the app\'s registry');
  /* the key is the family's, whichever spelling asked */
  assert.equal(injected.answerKey({ type: 'powerMap', era: '1914' }), injected.answerKey({ type: 'historicalMap', era: '1914' }));
  assert.equal(injected.answerKey({ type: 'Analyze', question: 'x' }), '', 'an undeclared spelling is not an answer family, as before');
  const src = codeOnly(read('js/atlas-turn-results.js'));
  assert.doesNotMatch(src, /\bnewsMap\s*:|'newsMap'|\bresearch_map\b/, 'the spellings are written out again');
});
