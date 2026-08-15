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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { appSource, appShell } from './app-source.mjs';

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
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);
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
    /* (#R175) the tag became an import in src/main.js — same question, new mechanism. */
    const tag = `import '../${f}';`;
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
    // (#R180) …and the renderer parameter is gone: no module receives the raw handle any more.
    'window.IntMapMonitors=window.IntMapModules.monitors(IM_HOST);': ['js/monitors.js', 'monitors', ['HOST']],
    /* (#R225) one argument fewer: geoLayersDB went with the geopolitics layers it described */
    'window.IntMapLayerPreviews=window.IntMapModules.layerPreviews(countryStats,loadCountryData);':
      ['js/layer-previews.js', 'layerPreviews', ['countryStats', 'loadCountryData']],
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
  /* (#R178) the construction is spelled `map=GE().ui.createView({` now: even the PRIMARY view goes
     through the engine contract, since js/geo-engine.js is imported before app-body.js runs. The
     invariant is unchanged — one binding, one place, everything else after it. */
  assert.ok(m[0].text.includes('map=GE().ui.createView('),
    'the single map binding is the renderer construction — a later rebind would strand every extracted module on the old instance');

  // `countryStats` is declared once and thereafter only ever MUTATED IN PLACE.
  const cs = reassignments('countryStats');
  assert.equal(cs.length, 0, `countryStats must never be reassigned; found: ` + JSON.stringify(cs));

  // (#R225) `geoLayersDB` is GONE with the nine geopolitics layers it described. The invariant this
  // block protects — a factory is handed values that cannot be rebound under it — is carried by the
  // remaining data argument, and by the fact that the removed one can no longer be reassigned at all.
  assert.equal(reassignments('geoLayersDB').length, 0, 'geoLayersDB is gone and cannot be reassigned');
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
  /* (#R221) js/i18n.js still PUBLISHES window.IntMapI18N — it just builds it from js/locales/ui.*.js
     now instead of being a literal, so the assertion is on the assignment rather than on `={`. */
  assert.ok(/window\.IntMapI18N\s*=/.test(rd('js/i18n.js')), 'i18n.js sets window.IntMapI18N');
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
  /* (#R221) one file per language now — `rd('js/i18n.js')` returns the whole table (see the reader
     at the top), so the question is still "are all five here", asked of the new shape. */
  for (const lang of ['en', 'jp', 'de', 'ru', 'es']) {
    assert.ok(i18n.includes(`IntMapLang.define('${lang}'`), `${lang} is still carried (standing rule 3: all five languages)`);
  }
  const gz = rd('js/gazetteer.js');
  assert.ok((gz.match(/\['flashpoint',/g) || []).length > 10, 'flashpoint rows survived');
  /* (#R198) the export grew — `warm`/`index`/`world` joined it when the long tail
     (data/gazetteer-world.json) became a third source — so this asks the question it always meant:
     BOTH curated arrays are still the thing this file hands out. Pinning the literal return line
     would only be pinning the day it was written. */
  assert.match(gz, /return \{[^}]*\bbuiltin:_BUILTIN_GZ\b/, 'gazetteer still exports the built-in array');
  assert.match(gz, /return \{[^}]*\bextra:_EXTRA_GZ\b/, 'gazetteer still exports the extra array');
  const ref = rd('js/reference-data.js');
  assert.ok((ref.match(/_dc\(/g) || []).length > 100, 'dashboard cards survived');
  /* (#R246) …plus the ONE resolver for the registry's descriptions, which moved to
     js/locales/pages.<code>.js so that the pages audit measures them. Both tables still leave here. */
  assert.ok(ref.includes('return { dashCards:DEFAULT_DASH_CARDS, dataSources:DATA_SOURCES, useText, ensureDocs };'),
    'reference-data exports both tables');
});

test('R162 #8 index.html actually shrank and the CSS really moved', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 33500, `index.html is ${lines} lines — the split must not be undone`);
  const css = rd('css/intmap.css');
  assert.ok(css.length > 200000, 'css/intmap.css holds the real stylesheet');
  // ⚠ (#R210) This used to pin the LITERAL `--sidebar-w:440px`. The claim is "the design
  // tokens live in the extracted stylesheet", not "the sidebar is 440 px wide" — pinning
  // the value made a legitimate width change fail a split-integrity test (#R203's trap).
  assert.match(css, /--sidebar-w:\s*\d+(px|vw)/, 'the design tokens moved with it');
  assert.ok(css.includes('.mon-'), 'monitor styles stayed in CSS (no CSS-in-JS template literal — #R152)');
});

test('R162 #9 source-level suites read the whole app, not just index.html', () => {
  // Otherwise moving a line between files silently flips a `gone()` assertion green.
  assert.ok(app.length > html.length, 'appSource() is broader than index.html alone');
  // (#R210) derived from the stylesheet, so the two can never drift apart silently.
  const decl = (rd('css/intmap.css').match(/--sidebar-w:\s*\d+(?:px|vw)/) || [])[0];
  assert.ok(decl, 'css/intmap.css declares --sidebar-w');
  assert.ok(app.includes(decl), 'app source includes the extracted CSS');
  assert.ok(/window\.IntMapI18N\s*=/.test(app), 'app source includes the extracted JS');
  /* (#R221) …and the locale files, which is where the strings themselves went */
  assert.ok(app.includes("IntMapLang.define('jp'"), 'app source includes js/locales/');
});
