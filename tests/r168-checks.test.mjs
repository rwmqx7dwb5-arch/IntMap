// R168 source-level regression checks — the seventh index.html split.
//
// #R162–#R167 took index.html from 36,955 lines to 9,709 by moving out whole self-contained BLOCKS.
// #R167 reported that seam exhausted: what remained was one dense core in which no single statement
// is independent (10–36 free references each). That is true of STATEMENTS. It is not true of
// SUBJECTS: take a seed function, then absorb every statement whose declared names nothing outside
// reads, and the private helpers come with it while the external surface shrinks. Six such subjects
// came out this round — countries, news, companies, the tool panel, auth and community.
//
// Two things are genuinely new here, and both are what this file pins down:
//
//   1. SHIMS. These are the first modules index.html still calls BY NAME (renderStats, renderUI,
//      openAuthModal, …). Each exported function therefore keeps a hoisted `function` shim in
//      index.html that forwards with `.apply(this,arguments)`. A shim must be a function
//      DECLARATION: the originals were hoisted, so call sites textually above the factory call —
//      and IM_HOST's own getters, which sit ~1,300 lines earlier — must keep working unchanged.
//   2. DECLARATION-ONLY FACTORIES. All six are instantiated in one place right after `map` is built,
//      much earlier than the code they replaced. That is only safe because none of these factories
//      DOES anything while running: every top-level statement in them is a declaration. Test #4
//      proves that property rather than trusting it — it is what rules out both a temporal dead zone
//      (the #R167 trap) and any reordered side effect.
//
// The RW contract (now an owner SET — some of this state genuinely has two writers) lives in
// r165-checks.test.mjs; the real-browser proofs live in r168.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

/* Blank comments + string/template literals so identifier scanning reads CODE only. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
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

/* factory -> { file, const, the names index.html keeps a shim for }. The order of this object is the
   order the six calls must appear in — one block, right after the map is constructed. */
const MODULES = {
  countriesUi: { file: 'js/countries-ui.js', k: 'IM_COUNTRIES_UI', exports: ['renderStats', 'showCountryDetail', 'renderCountryDetailBody', 'loadCountryData', 'addCountryLayers'] },
  newsUi:      { file: 'js/news-ui.js',      k: 'IM_NEWS_UI',      exports: ['renderUI', 'setupIntelLayers', 'appendNewsBatch', 'renderReaderMode', 'aiGeocodeNews', '_spreadDupNewsPins'] },
  companiesUi: { file: 'js/companies-ui.js', k: 'IM_COMPANIES_UI', exports: ['renderCompanies', 'showCompanyDetail', 'renderDashboard', '_coCmpEnsureCss', '_coCmpRender'] },
  toolPanel:   { file: 'js/tool-panel.js',   k: 'IM_TOOL_PANEL',   exports: ['updateToolPanel', 'buildToolFeatures', 'showContextMenu'] },
  authUi:      { file: 'js/auth-ui.js',      k: 'IM_AUTH_UI',      exports: ['bootSupabase', '_openSetPassword', 'openAuthModal'] },
  community:   { file: 'js/community.js',    k: 'IM_COMMUNITY',    exports: ['renderCommunity', 'wireCommList'] },
};
const NAMES = Object.keys(MODULES);
/* Escape EVERY regex metacharacter, not just `$`. Exported names here are ordinary identifiers, so
   in practice only `$` can occur — but a partial escape is the kind of thing that is right until the
   day it isn't, and CodeQL flags it (js/incomplete-sanitization) rather than guess. */
const rx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shimOf = (m, n) => `function ${n}(){ return ${MODULES[m].k}.${n}.apply(this,arguments); }`;
const callOf = (m) => `const ${MODULES[m].k}=window.IntMapModules.${m}(map,IM_HOST);`;

/* Closure values these modules read that are REASSIGNED at runtime → live host getters, never a bare
   identifier inside a js/ file. A captured copy would silently go stale (the #R162 shape). */
const LIVE = {
  currentLang: 'lang', currentUser: 'user', currentMode: 'mode', currentMapType: 'mapType',
  countryGeo: 'countryGeo', countryDataLoaded: 'countryDataLoaded', countryDataPromise: 'countryDataPromise',
  globalData: 'globalData', newsFeatures: 'newsFeatures', newsFiltered: 'newsFiltered', renderedCount: 'renderedCount',
  bookmarks: 'bookmarks', dashFeatures: 'dashFeatures', toolMode: 'toolMode', measurePoints: 'measurePoints',
  radiusItems: 'radiusItems', radiusKm: 'radiusKm', radiusColor: 'radiusColor', radiusOpacity: 'radiusOpacity',
  geoRaw: 'geoRaw', commCatFilter: 'commCatFilter', commSearch: 'commSearch', communitySort: 'communitySort',
  communityPosts: 'communityPosts', replyingTo: 'replyingTo', pendingPostLoc: 'pendingPostLoc',
  communityAddArmed: 'communityAddArmed',
};

test('R168 #1 all six files are loaded and every factory is declared and instantiated once', () => {
  for (const m of NAMES) {
    const { file } = MODULES[m];
    const src = rd(file);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(src.includes(`window.IntMapModules.${m}=function(map,HOST){`),
      `${file} declares the ${m} factory taking (map,HOST)`);
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    const calls = html.split(callOf(m)).length - 1;
    assert.equal(calls, 1, `index.html must instantiate ${m} exactly once (found ${calls})`);
    const defined = [...src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function/g)].map((x) => x[1]);
    assert.deepEqual(defined, [m], `${file} defines exactly one factory`);
    assert.match(html, new RegExp(`'${m}'`), `the boot guard names the ${m} factory, so a missing file cannot hide`);
  }
});

test('R168 #2 THE SHIM CONTRACT: every exported name is a hoisted forwarding declaration', () => {
  for (const m of NAMES) {
    const { file, exports } = MODULES[m];
    const src = rd(file);

    // (a) the module returns exactly the declared export list.
    const retAt = src.lastIndexOf('return {');
    const ret = src.slice(retAt, src.indexOf('};', retAt) + 2);
    const returned = ret.replace(/^return \{|\};$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(returned, exports, `${file} must return exactly its declared exports`);

    for (const n of exports) {
      // (b) each one really is a function declared INSIDE the module (not, say, re-exported junk).
      assert.match(src, new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?function ${n}\\(`),
        `${file} declares function ${n}`);

      // (c) index.html keeps exactly one shim, and it is a hoisted function DECLARATION that
      //     forwards receiver AND arguments. `const ${n}=…` would break every call site above the
      //     factory (TDZ) and `(...a)=>` would silently drop `this`.
      const shim = shimOf(m, n);
      assert.equal(html.split(shim).length - 1, 1, `index.html holds exactly one shim for ${n}: ${shim}`);

      // (d) and index.html no longer declares the real thing anywhere.
      const inline = [...code(html).matchAll(new RegExp(`(?:^|[^.\\w$])(?:async\\s+function|function|const|let|var)\\s+${rx(n)}(?![\\w$])`, 'g'))];
      assert.equal(inline.length, 1, `${n} must exist in index.html only as its shim (found ${inline.length} declarations)`);
    }
  }
});

test('R168 #3 POSITION: the six calls sit together after the map is built, before any eager use', () => {
  // The factories are called much earlier than the statements they replaced, which is only a
  // question of TWO boundaries: `map` must already exist (it is assigned exactly once, in the
  // maplibregl.Map try block), and nothing that runs during closure evaluation may have used a
  // moved name yet. Both are asserted here against real offsets.
  const mapAssign = html.indexOf('map=new maplibregl.Map({');
  assert.ok(mapAssign > 0, 'index.html constructs the map exactly where expected');
  assert.equal(html.split('map=new maplibregl.Map({').length - 1, 1, '`map` is assigned in exactly one place');

  const at = NAMES.map((m) => ({ m, i: html.indexOf(callOf(m)) }));
  for (const x of at) assert.ok(x.i > mapAssign, `${x.m} is instantiated AFTER the map is constructed`);
  assert.deepEqual(at.slice().sort((a, b) => a.i - b.i).map((x) => x.m), NAMES, 'the six calls keep their declared order');
  const last = Math.max(...at.map((x) => x.i));

  // The five places that USE a moved name while the closure is still evaluating (as opposed to
  // inside a function body that runs later). Every one must come after the last factory call.
  const eager = [
    'window.IntMapModules.layerPreviews(',   // takes loadCountryData as an argument
    'window.renderCompanies=renderCompanies;',
    'window.showCompanyDetail=showCompanyDetail;',
    'window._imOpenSetPassword=_openSetPassword;',
    'setInterval(fetchData,180000); bootSupabase();',   // boot calls it as a bare statement, near the end
  ];
  const lf = html.replace(/\r\n/g, '\n');            // index.html is CRLF in the working tree
  const lastLF = Math.max(...NAMES.map((m) => lf.indexOf(callOf(m))));
  for (const e of eager) {
    const i = typeof e === 'string' ? lf.indexOf(e) : lf.search(e);
    assert.ok(i > 0, `the eager use ${e} still exists`);
    assert.ok(i > lastLF, `${e} must run after the factories (it evaluates a moved name eagerly)`);
  }
  assert.ok(last > 0);
});

test('R168 #4 DECLARATION-ONLY: a factory body does nothing while it runs', () => {
  // This is the property that makes calling all six early safe. If any factory body held a
  // statement that EXECUTES (a call, an assignment, an if), moving the call site would move that
  // side effect — and reading closure state at factory time is exactly the #R167 dead-zone trap.
  for (const m of NAMES) {
    const src = rd(MODULES[m].file);
    const ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true });
    let body = null;
    for (const st of ast.body) {
      if (st.type !== 'ExpressionStatement' || st.expression.type !== 'AssignmentExpression') continue;
      const { left, right } = st.expression;
      if (left.type === 'MemberExpression' && left.property.name === m && /Function/.test(right.type)) body = right.body.body;
    }
    assert.ok(body, `${MODULES[m].file}: found the ${m} factory body`);
    const doers = body.filter((st) => st.type !== 'FunctionDeclaration' && st.type !== 'VariableDeclaration' && st.type !== 'ReturnStatement');
    assert.deepEqual(doers.map((st) => `${st.type}@${st.loc.start.line}`), [],
      `${MODULES[m].file} must only DECLARE at factory level — these statements would run: `);
    assert.equal(body[body.length - 1].type, 'ReturnStatement', `${MODULES[m].file} ends with the export return`);

    // …and no initialiser may CALL anything either (a `const x=f()` runs f at factory time).
    for (const st of body.filter((s) => s.type === 'VariableDeclaration')) {
      for (const d of st.declarations) {
        (function scan(n) {
          if (!n || typeof n.type !== 'string') return;
          if (/^(Function|Arrow)/.test(n.type) || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') return;
          assert.ok(n.type !== 'CallExpression', `${MODULES[m].file}:${n.loc.start.line} — a factory-level initialiser must not call anything`);
          for (const k of Object.keys(n)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === 'string' && scan(x));
            else if (v && typeof v.type === 'string') scan(v);
          }
        })(d.init);
      }
    }
  }
});

test('R168 #5 no module reads a live value as a bare identifier', () => {
  // The rewrite that makes the host contract meaningful (same probe as R165 #4, for the six new
  // files): inside a module these names must only ever appear as HOST.<prop>. A bare `currentLang`
  // in js/news-ui.js is the #R162 silent failure — undefined, no error, feature quietly wrong.
  for (const m of NAMES) {
    const src = code(rd(MODULES[m].file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const hits = (src.match(new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g')) || []).length;
      assert.equal(hits, 0, `${MODULES[m].file} mentions ${name} as a bare identifier — it must use HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R168 #6 every live member really is a getter over a really-reassigned variable', () => {
  // Prove the classification instead of trusting it: each name is assigned somewhere in index.html
  // outside its own declaration, so a captured copy would go stale.
  for (const [name, prop] of Object.entries(LIVE)) {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    assert.ok(html.split('\n').some((l) => asg.test(l) && !decl.test(l)),
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a live member`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

test('R168 #7 the parser-backed split-scope check still passes across all six new files', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R168 #8 index.html shrank and no module body came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 8_200, `index.html should be well under the pre-R168 9,709 lines; it is ${lines}`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
  // A leftover in-page copy of a moved body would WIN over the module (a later function declaration
  // overwrites an earlier one). Probe with a line from deep inside each of the three biggest bodies,
  // so the needle cannot accidentally match the one-line shim that legitimately carries the name.
  const deep = {
    'js/auth-ui.js': "const settingsBtn=document.getElementById('btn-open-settings')",
    'js/news-ui.js': "if(!GE.layers.hasSource('news-points')){",
    'js/countries-ui.js': "const feed=document.getElementById('countries-feed')",
  };
  for (const [file, needle] of Object.entries(deep)) {
    assert.ok(rd(file).includes(needle), `${file} really carries the body this probes for`);
    assert.ok(!html.includes(needle), `index.html must not still hold an inline copy of ${file}: ${needle}`);
  }
});
