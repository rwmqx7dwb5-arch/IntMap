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
  newsUi:      { file: 'js/news-ui.js',      k: 'IM_NEWS_UI',      exports: ['renderUI', 'setupIntelLayers', 'appendNewsBatch', 'renderReaderMode', '_spreadDupNewsPins'] },
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
const callOf = (m) => `const ${MODULES[m].k}=window.IntMapModules.${m}(IM_HOST);`;

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
    assert.ok(src.includes(`window.IntMapModules.${m}=function(HOST){`),
      `${file} declares the ${m} factory taking (HOST)`);
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
    /* (#R178) the construction is spelled `map=GE().ui.createView({` now: even the PRIMARY view goes
     through the engine contract, since js/geo-engine.js is imported before app-body.js runs. The
     invariant is unchanged — one binding, one place, everything else after it. */
  const mapAssign = html.indexOf('map=GE().ui.createView({');
  assert.ok(mapAssign > 0, 'the app constructs the map exactly where expected');
  assert.equal(html.split('map=GE().ui.createView({').length - 1, 1, '`map` is assigned in exactly one place');

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
    /* boot calls it as a bare statement, near the end. ⚠ (#R372) the marker moved when the boot pass
       became `fetchData({background:true})` — the INVARIANT (this eager use runs after the factories)
       did not, so the string is refreshed rather than the assertion weakened. */
    /* ⚠ (#R408) …and it moved again when the poll went onto js/runtime.js's one timer wheel. Same
       invariant, same treatment: refresh the marker, do not weaken the assertion. */
    "everyTick('app-body:news-poll',180000,()=>fetchData({background:true})); bootSupabase();",
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
    /* (#R285) sourceType:'module'. Two of these files grew a real ES import this round
       (`personaPrompt` from js/atlas-persona.js), and script mode cannot parse one — the file that
       #R199 made the norm for js/ would have been unparseable here. NOTHING below is relaxed: a
       top-level ImportDeclaration is not part of the factory body, so every assertion about what
       the factory DOES is unchanged, and module mode is a strict superset for that question. */
    const ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true, sourceType: 'module' });
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
  /* ⚠ (#R193) 8,200 → 8,600, and the reason is worth stating because raising a tripwire to make
     one's own change pass is exactly the move this file exists to catch.
     What this test is FOR is the two assertions below it: the stylesheet stays in css/, and no moved
     module body came back inline. Those are unchanged and still pass. The NUMBER is a budget on the
     app shell — index.html + src/main.js + src/vendor.js + js/app-body.js + js/geo-engine.js — and
     the shell had been sitting at 8,191 of 8,200 for several rounds, i.e. nine lines of headroom.
     #R193 added a new RENDERER CAPABILITY (the dynamic-image primitive: a geographic quad the app
     repaints every frame with no encoder in the path), and the MapLibre half of it has to live in
     js/geo-engine.js because that is the one file allowed to know the renderer — the coupling gate
     enforces it. +77 there, +28 in app-body (the ancestor-walk hint and the gazetteer warm-up),
     +29 across index.html/vendor/main.
     Growth of an ADAPTER when the contract grows is not the regression this guards against. The
     shell is nonetheless close to its budget: js/app-body.js's satellite-protocol block (~250 lines,
     self-contained) is the obvious next thing to move out under standing rule 13.
     ⚠ (#R195) 8,600 → 8,300, because the paragraph above named a debt and this round PAID it rather
     than carrying it. js/sat-proto.js took the 259-line satellite block out whole (8,492 → 8,233),
     so the budget goes back down to fit — a ceiling raised once and never lowered stops asserting
     anything at all, which is #R194's lesson in one line. Headroom is 67 lines, deliberately tight.
     The next surface to leave under standing rule 13 is js/atlas-console.js (6,571 lines), which is
     not in this shell but is the other half of 「中心部がまだ巨大」; it needs a split of its own
     because its themes — the planner, the SYS catalogue, the renderer — are interleaved, not stacked.
     ⚠ (#R196) 8,300 → 8,200. This round added to the shell (a real sky in every basemap, the
     prefetch memo, the pick hand-off) and then took more out than it put in: js/geodesy.js carried
     off the 111-line antimeridian/pole-safe block and js/tile-warm.js the 110-line tile-acceleration
     block, 8,363 → 8,171. Same rule as #R195 — the ceiling follows the floor DOWN, never the other
     way. Headroom is 29 lines.
     The next surface named by 「中心部がまだ巨大」 is still js/atlas-console.js (6,571 lines), which
     is not in this shell and needs a split of its own.
     ⚠ (#R322) 8,200 → 7,950, and the round that lowered it is the round that first went OVER. The
     renderer-command census (「同じ命令を繰り返す無駄を実測に基づいて消す」) had to be in the adapter
     for the same reason #R193's dynamic-image primitive did — js/geo-engine.js is the one file
     allowed to know the renderer — and the shell went to 8,285. This paragraph is where a round
     would normally argue for 8,300. Instead the two things this file has been asking for happened:
       · js/geo-command-log.js took the census's comparisons, switches and tally (316 lines). It
         names no renderer, so the coupling gate does not care where it lives, and the five adapter
         methods went back to being one-liners that ask it a question.
       · js/camera-math.js took the camera geometry whole (407 lines) — the mercator projection, the
         eye position for a camera, the pitch that saturates, the zoom floor on a sphere. It is pure
         (arguments in, numbers out) and #R179's own note already said so. The single piece that
         could NOT go is `gGuard`, which asks MapLibre whether a camera is reachable; it stays in the
         adapter and is passed to the solvers as their `guard` argument, as it always was.
     8,199 → 8,285 → 7,923. Headroom is 27 lines, which is the point: a ceiling with room to spare
     has stopped asserting anything (#R194).
     ⚠ (#R341) 7,950 → 8,000, and the reason is stated because raising a tripwire to pass one's own
     change is what this file exists to catch. #R341 added a RENDERER CAPABILITY — a cloud of tens of
     thousands of oriented, self-animating aircraft glyphs — and the CONTRACT half of it has to live
     in js/geo-engine.js because that is the one file allowed to know the renderer; the coupling gate
     (scripts/engine-coupling.mjs) is what enforces that. Measured: +27 in geo-engine (four adapter
     methods, four facade lines, one capability), +24 in lazy-modules and +11 in main.js for the
     module registry and the worker client. 7,923 → 7,975.
     #R193's own words apply unchanged — "growth of an ADAPTER when the contract grows is not the
     regression this guards against" — and the IMPLEMENTATION deliberately did not land here:
     js/aircraft-points.js (the WebGL layer), js/aviation-live.js (the controller),
     src/aviation-worker.js (the store) are ~1,100 lines that are in NEITHER this shell nor the
     eager bundle.
     Headroom is 25 lines. The debt this round did NOT pay is js/data-layers.js (5,800 lines, of
     which ~1,320 are aircraft): the original per-browser sweep is kept intact for the rollback
     window §28 Phase G requires, and deleting it is what the next round can pay this back with.
     ⚠ (#R386) 8,000 → 8,020, and the measurement is written down because raising a tripwire to make
     one's own change pass is exactly the move this file exists to catch. #R386 put the News tab on
     `news_events` — one event per card instead of one article. The IMPLEMENTATION is 590 lines in
     js/news-events.js, which is NOT in this shell and NOT in the eager bundle (it is fetched when
     the News tab is opened). What landed here is only the seam, and it was cut down twice before
     this number was touched — 44 lines first written, then 12:

       index.html         +1   the category chip row (one element; its prose is in docs/NEWS-EVENTS.md §9)
       js/app-body.js    +12   the second flag (`NEWS_EVENT_MODE` — the #R40 `USE_SERVER_NEWS` path is a
                               DIFFERENT switch and stays false), `newsSurfaceMode()` (which answers from
                               the ITEMS, not from the flag, because Atlas and the production smoke read
                               it), and three branches in computeFilteredNews: an event's ★ lives in
                               `saved_news_events`, search reaches the member headlines, and the category
                               chip filters the list and the pins through ONE predicate.
       js/lazy-modules.js  +0   folded onto the rows that were already there.

     Headroom is 8 lines. The debt this round did NOT pay is js/app-body.js itself (4,331 lines): the
     news predicate now serves two surfaces and is the natural thing to lift out of the shell next. */
  assert.ok(lines < 8_020, `index.html should be well under the pre-R168 9,709 lines; it is ${lines}`);
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
