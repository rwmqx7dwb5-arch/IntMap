// R184 source-level regression checks — the things that are true about the FILES rather than about
// a running browser, and that a later change could quietly undo without any test noticing.
//
// The browser suites (r184-satellites / r184-drone / r184-routing / r184-cesium-fs / r184-imagery)
// prove the behaviour. These prove the wiring: a module that is written but never imported, a
// dependency that is used but not declared, a build alias that stops being needed until a
// dependency bump makes it needed again — none of those show up as a failing behaviour test,
// they show up as a feature that silently is not there (#R162's lesson exactly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';

const root = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const rd = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n')
  : readFileSync(new URL(p, root), 'utf8'));

/* ── ① THE NEW MODULES ARE IMPORTED, INSTANTIATED AND GUARDED ─────────────────────────────── */
test('R184 #1: every new module is in the import graph, the factory guard and app-body', () => {
  const main = rd('src/main.js');
  const body = rd('js/app-body.js');
  const MODULES = [
    ['js/satellites-live.js', 'satellitesLive'],
    ['js/satellite-detail.js', 'satelliteDetail'],
    ['js/drone-ops.js', 'droneOps'],
    ['js/routing-ops.js', 'routingOps'],
  ];
  for (const [file, factory] of MODULES) {
    assert.ok(rd(file).length > 500, `${file} exists and has content`);
    assert.ok(main.includes(`import '../${file}'`), `${file} is imported by src/main.js`);
    assert.match(rd(file), new RegExp(`IntMapModules\\.${factory}\\s*=`),
      `${file} declares exactly the factory the guard looks for`);
    /* the guard list — a file that fails to deploy must say so loudly (#R162/#R163) */
    assert.ok(new RegExp(`'${factory}'`).test(main), `${factory} is in MODULE_FACTORIES`);
    assert.match(body, new RegExp(`IntMapModules\\.${factory}\\(IM_HOST\\)`),
      `${factory} is instantiated once in js/app-body.js`);
  }
});

/* ── ② THE ONE npm DEPENDENCY THIS ROUND ADDS IS DECLARED ─────────────────────────────────── */
test('R184 #2: satellite.js is a declared dependency and the WASM alias that makes it bundle exists', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(pkg.dependencies['satellite.js'], 'satellite.js ships to the browser, so it is a dependency');
  /* DYNAMIC, not static: a static import puts 27 KB gz of SGP4 in the main bundle for every session
     including the ones that never open the layer (the same reasoning js/engine-select.js applies to
     Cesium). And it must sit INSIDE the factory, because no js/ module may have a top-level
     declaration — tests/r175-checks proves that invariant and this round briefly broke it. */
  const sat = rd('js/satellites-live.js');
  assert.match(sat, /import\('satellite\.js'\)/,
    'the propagator is imported, not hand-rolled — see the file header for why');
  assert.ok(!/^import\s/m.test(sat),
    'and imported DYNAMICALLY, so a session that never opens the layer never downloads it');
  assert.ok(sat.indexOf('let SAT=null') > sat.indexOf('IntMapModules.satellitesLive=function'),
    'the lazy-loader state lives inside the factory, not at file scope (#R175 top-level rule)');
  /* satellite.js 7 re-exports an optional WASM accelerator whose Emscripten entry points use
     top-level await and import node:module. Rollup keeps them in the graph (the package declares no
     sideEffects) and the build then fails outright. The alias is what makes `npm run build` work,
     and it is exactly the sort of thing that gets "cleaned up" by someone who does not know why. */
  const vite = rd('vite.config.js');
  assert.match(vite, /#wasm-\(single\|multi\)-thread|#wasm-\(single\|multi\)/,
    'vite.config.js aliases the package-internal WASM subpath imports');
  assert.match(vite, /satellite-wasm-stub\.js/, 'the alias points at the stub');
  const stub = rd('src/satellite-wasm-stub.js');
  assert.match(stub, /throw new Error/,
    'the stub THROWS if anything ever calls it — a silent no-op would hide a real regression');
});

/* ── ③ THE ENGINE CONTRACT GAINED ONE CAPABILITY, DECLARED BY BOTH ADAPTERS ───────────────── */
test('R184 #3: eyeIsPosition is declared by both engines, with opposite values', () => {
  const ge = rd('js/geo-engine.js'), ce = rd('js/cesium-engine.js'), fs = rd('js/flight-sim.js');
  assert.match(ge, /eyeIsPosition:\s*false/, 'MapLibre: the eye is DERIVED from centre+zoom+pitch');
  assert.match(ce, /eyeIsPosition:\s*true/, 'Cesium: the camera IS a position');
  assert.match(ge, /eyeIsPosition:\s*true/, 'the engine file also carries the Cesium contract declaration');
  /* the simulator branches on the capability, not on an engine name — the coupling gate would
     catch the latter, but the point here is that the branch exists at all */
  assert.match(fs, /can\('eyeIsPosition'\)/, 'the flight simulator asks the capability');
  assert.match(fs, /camera\.setEye/, 'and drives a positional camera directly');
  /* the guard that stops the MapLibre fallback undoing it every frame */
  assert.match(fs, /!cam&&!posCam/, 'the last-resort jumpTo does not fire on the positional path');
});

/* ── ④ THE ANTI-ALIASING POLICY IS A FUNCTION, AND IT IS THE ONE THAT WAS MEASURED ────────── */
test('R184 #4: the MSAA rule is one declared function and FXAA is gated on MSAA', () => {
  const ce = rd('js/cesium-engine.js');
  assert.match(ce, /function\s+_msaaFor\s*\(/, 'the rule is a named function, not an inline expression');
  assert.match(ce, /msaaSamples:\([^)]*_msaaFor\(/, 'the widget is constructed from it');
  assert.match(ce, /fx\.enabled=\(o\.antialias!==false\)&&!\(scene\.msaaSamples>1\)/,
    'FXAA runs only when there is no multisampling to do the job — see the measurement in the file');
  /* the measurement itself is recorded next to the code that came out of it */
  assert.match(ce, /sharpness 5\.06/, 'the FXAA sharpness measurement is written down where the change is');
  /* run the rule the way the browser test does, so the two cannot drift */
  const src = ce.match(/function\s+_msaaFor\s*\([^)]*\)\s*\{[^}]*\}/)[0];
  // eslint-disable-next-line no-new-func
  const f = new Function(`${src}; return _msaaFor;`)();
  assert.equal(f(1), 4);
  assert.equal(f(2), 2);
  assert.equal(f(3), 1);
  assert.equal(f(undefined), 4, 'a missing pixel ratio is 1x, not zero samples');
});

/* ── ⑤ EVERY NEW FILE PARSES, AND ADDS NO <style> ─────────────────────────────────────────── */
test('R184 #5: the new modules parse and keep the CSS rule', () => {
  /* comments blanked, because every one of these files SAYS "this file adds no <style>" in its
     header and the naive scan then reports the promise as the violation */
  const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const FILES = ['js/satellite-detail.js', 'js/drone-ops.js', 'js/routing-ops.js'];
  for (const f of FILES) {
    const src = rd(f);
    assert.doesNotThrow(() => acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' }), `${f} parses`);
    assert.ok(!/<style[\s>]|createElement\(\s*['"]style/.test(decomment(src)),
      `${f} adds no <style> — the CSS lives in css/intmap.css (#R162)`);
  }
  /* satellites-live.js is the one ES module among them (it imports satellite.js) */
  assert.doesNotThrow(() => acorn.parse(rd('js/satellites-live.js'), { ecmaVersion: 2022, sourceType: 'module' }),
    'js/satellites-live.js parses as a module');
});

/* ── ⑥ THE FIVE-LANGUAGE RULE, ON THE STRINGS THIS ROUND ADDED ────────────────────────────── */
test('R184 #6: the new layer name exists in all five languages', () => {
  const i18n = rd('js/i18n.js');
  const hits = i18n.match(/lyrSats:/g) || [];
  /* ⚠ (#R223) once per REGISTERED language — a sixth (zh) landed; the claim is coverage, not five. */
  const NL = (rd('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z-]+"/g) || []).length;   /* (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
  assert.equal(hits.length, NL, 'lyrSats is defined once per language');
  /* and it is a DIFFERENT string in each — a copy-paste of the English into all five would pass a
     count check and fail the actual instruction */
  const vals = [...i18n.matchAll(/lyrSats:"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(vals.length, NL);
  assert.equal(new Set(vals).size, NL, 'each language has its own wording');
});

/* ── ⑦ THE NEW LAYER IS WIRED EVERYWHERE A LAYER HAS TO BE ────────────────────────────────── */
test('R184 #7: the satellite layer is registered, grouped, legended and toggled', () => {
  const dl = rd('js/data-layers.js');
  assert.match(dl, /\['sats','lyrSats'\]/, 'the layer row is declared with its i18n key');
  /* (#R202) it was filed under lyrGrpMaritime «beside live aircraft», which is a fact about how the
     two were built and not somewhere anyone looks for satellites — 「いや今衛星レイヤーなんてないわ」.
     What #7 is actually about is that the row reaches a REAL group rather than falling through to
     Others(beta), so it asks that, and the group it names is the one it is in now. */
  assert.match(dl, /lyrGrpOrbit',\[[^\]]*'sats'/, 'it is filed into a real group of its own');
  /* (#R241) the legend TITLE table is written as calls now — `LA('Live satellites', …)` — because a
     bare array is invisible to every translation instrument and has no inline-table fallback, so
     fr/ko/zh read element 0 (English) for ever. Same table, same key, same assertion. */
  assert.match(dl, /sats:LA\('Live satellites'/, 'it has a legend');
  assert.match(dl, /HAS_LEGEND=new Set\(\[[\s\S]{0,400}'sats'/, 'and the panel knows the legend exists');
  assert.match(dl, /id==='sats'\)\{ startSats\(\)/, 'switching it on starts it');
  assert.match(dl, /id==='sats'\)\{ stopSats\(\)/, 'switching it off stops it');
  assert.match(dl, /opacities\.sats|sats:0\.95/, 'it has a default opacity');
  assert.match(dl, /dl-sats/, 'and it is excluded from the layer-reconcile auto-learn like the other live layers');
  /* Atlas: an alias table entry and an action, because a layer Atlas cannot drive is half a feature */
  const atlas = rd('js/atlas-console.js');
  assert.match(atlas, /'satellites':'dl-sats'/, 'the Atlas layer alias table knows it');
  assert.match(atlas, /case 'satellites':/, 'and there is an action');
  assert.match(atlas, /LIVE SATELLITES: \{"type":"satellites"/,
    '…which is in the SYS catalogue — an action the planner cannot see does not exist (#R115)');
  /* the sources page: a new third-party feed has to name itself and its terms */
  const refs = rd('js/reference-data.js');
  assert.match(refs, /CelesTrak/, 'CelesTrak is credited in Sources');
  assert.match(refs, /satellite\.js/, 'and so is the propagator library');
});

/* ── ⑧ THE DRONE AND ROUTE ADDITIONS ARE WIRED INTO ATLAS TOO ─────────────────────────────── */
test('R184 #8: the new drone and routing capabilities are reachable from Atlas and documented in SYS', () => {
  const atlas = rd('js/atlas-console.js');
  /* drone: the operational checks and the three route actions */
  for (const act of ['prepare', 'compare', 'rth', 'conflicts']) {
    assert.ok(atlas.includes(`act==='${act}'`), `the drone action "${act}" is dispatched`);
  }
  assert.match(atlas, /action "prepare" \(or "check"\)/, 'the drone SYS entry describes the checks');
  assert.match(atlas, /EMERGENCY LANDING SITES/, 'including the ones that are new capabilities, not new words');
  /* routing: the three request-shaping options */
  assert.match(atlas, /"avoidAreas"\?:/, 'the directions SYS entry documents the keep-out area');
  assert.match(atlas, /"transitModes"\?:/, '…the transit mode allow-list');
  assert.match(atlas, /"maxWalkM"\?:/, '…and the walking cap');
  assert.match(atlas, /avoidAreas:_areas/, 'and the action actually passes them through');
});

/* ── ⑨ THE SEAMS #R174 DECLARED ARE THE ONES THAT GOT FILLED ──────────────────────────────── */
test('R184 #9: drone-ops attaches through the published seams rather than editing the planner', () => {
  const ops = rd('js/drone-ops.js'), nav = rd('js/drone-nav.js');
  assert.match(ops, /registerWindField/, 'the wind field goes in through the documented seam');
  for (const id of ['wind', 'link', 'nofly', 'return']) {
    assert.ok(new RegExp(`registerHazardSource\\('${id}'`).test(ops), `the "${id}" source registers itself`);
  }
  /* the planner still exports the seams — removing them would break this file silently */
  assert.match(nav, /registerHazardSource,\s*unregisterHazardSource,\s*hazardSourceIds,\s*registerWindField/,
    'js/drone-nav.js still publishes the seams');
  /* every finding kind the ops module produces has a translated label in the planner's one table */
  const kinds = [...ops.matchAll(/kind:'([a-z-]+)'/g)].map((m) => m[1]);
  const labelled = nav.match(/function kindLabel\(k\)\{[\s\S]*?\n  \}/)[0];
  const missing = [...new Set(kinds)].filter((k) => !labelled.includes(`'${k}'`));
  assert.deepEqual(missing, [], 'a finding kind with no label prints its internal slug to the operator');
});
