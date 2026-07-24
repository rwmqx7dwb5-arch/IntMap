// R162 source-level regression checks — the index.html file split.
//
// index.html was 36,955 lines / 4.28 MB of single-file no-build app. #R162 moved the parts
// that are provably self-contained into css/ + js/ (standing rule 13):
//   • the whole stylesheet                     → css/intmap.css
//   • the 5-language UI string table           → js/i18n.js
//   • the built-in news gazetteer              → js/gazetteer.js
//   • dashboard cards + data-source registry   → js/reference-data.js
//   • IntMapLayerPreviews / Maddison / HistStates / HistId / IntMapMonitors → js/*.js
//
// The modules' BODIES were moved byte-identically; what used to be closure variables became
// explicit FACTORY PARAMETERS. That is only sound while those variables are assigned exactly
// once — a parameter captures a value, a closure re-reads a binding. If a later round makes
// `map` or `countryStats` reassignable, every extracted module silently keeps the stale value
// and nothing else in the suite would notice. That invariant is the load-bearing test here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
const html = rd('index.html');
const app = appSource(root);

/* Strip comments and string literals so identifier scanning is not fooled by prose or data. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}
const HTML_CODE = code(html);

test('R162 #1 index.html loads every extracted file, before the main script body', () => {
  const need = ['js/i18n.js', 'js/gazetteer.js', 'js/reference-data.js',
    'js/layer-previews.js', 'js/history.js', 'js/monitors.js'];
  // The app has small DOMContentLoaded handlers early in <head> (theme, stale-build notice);
  // the MAIN body is the last one — that is what must run after the module files are loaded.
  const mainAt = html.lastIndexOf("window.addEventListener('DOMContentLoaded'");
  assert.ok(mainAt > 0, 'the main DOMContentLoaded body still exists');
  for (const f of need) {
    const tag = `<script src="${f}"></script>`;
    assert.ok(html.includes(tag), `index.html loads ${f}`);
    assert.ok(html.indexOf(tag) < mainAt, `${f} is loaded BEFORE the main script body runs`);
    assert.ok(existsSync(new URL(f, root)), `${f} exists on disk`);
  }
  assert.ok(html.includes('<link rel="stylesheet" href="css/intmap.css">'), 'stylesheet is linked');
  assert.ok(existsSync(new URL('css/intmap.css', root)), 'css/intmap.css exists');
});

test('R162 #2 the moved code is GONE from index.html (no stale duplicate copy)', () => {
  for (const needle of [
    'const i18n={', 'const _BUILTIN_GZ=[', 'const _EXTRA_GZ=[',
    'const DEFAULT_DASH_CARDS=[', 'const DATA_SOURCES=[',
    'window.IntMapMonitors=(function(){', 'window.IntMapMaddison=(function(){',
    'window.IntMapHistStates=(function(){', 'window.IntMapHistId=(function(){',
    'window.IntMapLayerPreviews=(function(){',
  ]) assert.ok(!html.includes(needle), `index.html no longer defines ${needle}`);
  // …and the stylesheet is not re-inlined
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'no large inline <style> block remains');
});

test('R162 #3 index.html binds each extracted global back into the closure', () => {
  assert.ok(html.includes('const i18n=window.IntMapI18N;'), 'i18n rebound');
  assert.ok(html.includes('const _BUILTIN_GZ=window.IntMapGazetteer.builtin, _EXTRA_GZ=window.IntMapGazetteer.extra;'), 'gazetteer rebound');
  assert.ok(html.includes('const DEFAULT_DASH_CARDS=window.IntMapRefData.dashCards;'), 'dash cards rebound');
  assert.ok(html.includes('const DATA_SOURCES=window.IntMapRefData.dataSources;'), 'data sources rebound');
});

test('R162 #4 each factory is instantiated with exactly its declared dependencies', () => {
  const calls = {
    'window.IntMapMaddison=window.IntMapModules.maddison();': ['js/history.js', 'maddison', []],
    'window.IntMapHistStates=window.IntMapModules.histStates(countryStats);': ['js/history.js', 'histStates', ['countryStats']],
    'window.IntMapHistId=window.IntMapModules.histId(countryStats);': ['js/history.js', 'histId', ['countryStats']],
    // (#R163) the private host object became the shared IM_HOST and the parameter was renamed H → HOST
    'window.IntMapMonitors=window.IntMapModules.monitors(map,IM_HOST);': ['js/monitors.js', 'monitors', ['map', 'HOST']],
    'window.IntMapLayerPreviews=window.IntMapModules.layerPreviews(countryStats,geoLayersDB,loadCountryData);':
      ['js/layer-previews.js', 'layerPreviews', ['countryStats', 'geoLayersDB', 'loadCountryData']],
  };
  for (const [call, [file, name, params]] of Object.entries(calls)) {
    assert.ok(html.includes(call), `index.html instantiates ${name}`);
    const src = rd(file);
    const sig = `window.IntMapModules.${name}=function(${params.join(',')}){`;
    assert.ok(src.includes(sig), `${file} declares ${name} taking (${params.join(',')})`);
  }
});

test('R162 #5 INVARIANT: every value passed to a factory is assigned exactly once', () => {
  // A closure re-reads its binding; a parameter captures the value at call time. These are
  // equivalent ONLY while the binding is never reassigned after the factory runs. Guard it.
  // Lines that assign the bare name WITHOUT declaring it — i.e. true re-bindings. A line like
  // `let map=null, x=1` or `const map={…}` (an unrelated inner lookup table) is a declaration,
  // not a re-binding of the outer one.
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    const out = [];
    HTML_CODE.split('\n').forEach((l, i) => { if (asg.test(l) && !decl.test(l)) out.push({ line: i + 1, text: l.trim().slice(0, 80) }); });
    return out;
  };

  // `map`: declared `let map=null`, then bound exactly once — the MapLibre construction.
  const m = reassignments('map');
  assert.equal(m.length, 1, `map must be bound exactly once; found ${m.length}: ` + JSON.stringify(m));
  assert.ok(m[0].text.includes('map=new maplibregl.Map('),
    'the single map binding is the MapLibre construction — a later rebind would strand every extracted module on the old instance');

  // `countryStats` is declared once and thereafter only ever MUTATED IN PLACE.
  const cs = reassignments('countryStats');
  assert.equal(cs.length, 0, `countryStats must never be reassigned; found: ` + JSON.stringify(cs));

  // `geoLayersDB` is const, `loadCountryData` is a function declaration — both unrebindable.
  // (#R167) the table itself moved to js/tables.js, so the const is now a destructuring rebind
  // (`const {geoLayersDB,…}=window.IntMapTables`). Still a const binding, still never reassigned —
  // which is the property this assertion exists to protect.
  assert.ok(/const\s+(?:geoLayersDB\s*=|\{[^}]*\bgeoLayersDB\b[^}]*\}\s*=\s*window\.IntMapTables)/.test(HTML_CODE),
    'geoLayersDB is const');
  assert.equal(reassignments('geoLayersDB').length, 0, 'geoLayersDB is never reassigned');
  assert.ok(/function\s+loadCountryData\s*\(/.test(HTML_CODE), 'loadCountryData is a function declaration');
});

test('R162 #5b INVARIANT: mutable host values reach monitors as GETTERS, never copies', () => {
  // The bug this guards: js/monitors.js read `radiusItems` via `typeof radiusItems!=='undefined'`.
  // Once moved out of the closure that guard silently evaluated false, so activeArea() fell
  // through to "no area selected" — the radius→monitor path was lost with NO error. These four
  // are all rebound at runtime, so a captured parameter would reintroduce exactly that failure.
  // (#R163) these four moved from monitors' own inline host object into the shared IM_HOST, and the
  // module parameter was renamed H → HOST. Same invariant, one object: still getters, never copies.
  const host = html.slice(html.indexOf('const IM_HOST={'), html.indexOf('const IM_HOST={') + 3000);
  for (const [prop, src] of [['lang', 'currentLang'], ['user', 'currentUser'], ['mode', 'currentMode'], ['radiusItems', 'radiusItems']]) {
    assert.ok(new RegExp(`get\\s+${prop}\\(\\)\\s*\\{\\s*return\\s+${src};`).test(host),
      `${prop} must be a live getter over ${src}, not a captured value`);
  }
  const mon = rd('js/monitors.js');
  for (const stale of ["typeof radiusItems!=='undefined'", "typeof currentLang!=='undefined'", "typeof currentUser!=='undefined'", "typeof currentMode!=='undefined'"]) {
    assert.ok(!mon.includes(stale), `monitors.js must not probe the vanished closure binding (${stale})`);
  }
  assert.ok(mon.includes('HOST.radiusItems') && mon.includes('HOST.lang') && mon.includes('HOST.user') && mon.includes('HOST.mode'),
    'monitors.js reads the mutable state through the host interface');
});

test('R162 #6 the extracted files define the globals the app depends on', () => {
  assert.ok(rd('js/i18n.js').includes('window.IntMapI18N={'), 'i18n.js sets window.IntMapI18N');
  assert.ok(rd('js/gazetteer.js').includes('window.IntMapGazetteer='), 'gazetteer.js sets window.IntMapGazetteer');
  assert.ok(rd('js/reference-data.js').includes('window.IntMapRefData='), 'reference-data.js sets window.IntMapRefData');
  for (const f of ['js/layer-previews.js', 'js/history.js', 'js/monitors.js']) {
    assert.ok(rd(f).includes('window.IntMapModules=window.IntMapModules||{};'), `${f} extends IntMapModules without clobbering it`);
  }
  // a missing file must announce itself instead of surfacing as "undefined" much later
  assert.ok(html.includes('required module file(s) failed to load'), 'index.html fails loudly if a module file is missing');
});

test('R162 #7 the data survived the move intact (all 5 languages, real row counts)', () => {
  const i18n = rd('js/i18n.js');
  for (const lang of ['en:{', 'jp:{', 'de:{', 'ru:{', 'es:{']) {
    assert.ok(i18n.includes(lang), `i18n.js still carries ${lang.slice(0, 2)} (standing rule 3: all five languages)`);
  }
  const gz = rd('js/gazetteer.js');
  assert.ok((gz.match(/\['flashpoint',/g) || []).length > 10, 'flashpoint rows survived');
  assert.ok(gz.includes('return { builtin:_BUILTIN_GZ, extra:_EXTRA_GZ };'), 'gazetteer exports both arrays');
  const ref = rd('js/reference-data.js');
  assert.ok((ref.match(/_dc\(/g) || []).length > 100, 'dashboard cards survived');
  assert.ok(ref.includes('return { dashCards:DEFAULT_DASH_CARDS, dataSources:DATA_SOURCES };'), 'reference-data exports both tables');
});

test('R162 #8 index.html actually shrank and the CSS really moved', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 33500, `index.html is ${lines} lines — the split must not be undone`);
  const css = rd('css/intmap.css');
  assert.ok(css.length > 200000, 'css/intmap.css holds the real stylesheet');
  assert.ok(css.includes('--sidebar-w:440px'), 'the design tokens moved with it');
  assert.ok(css.includes('.mon-'), 'monitor styles stayed in CSS (no CSS-in-JS template literal — #R152)');
});

test('R162 #9 source-level suites read the whole app, not just index.html', () => {
  // Otherwise moving a line between files silently flips a `gone()` assertion green.
  assert.ok(app.length > html.length, 'appSource() is broader than index.html alone');
  assert.ok(app.includes('--sidebar-w:440px'), 'app source includes the extracted CSS');
  assert.ok(app.includes('window.IntMapI18N={'), 'app source includes the extracted JS');
});
