// R169 source-level regression checks — the EIGHTH index.html split, plus the head-level defects
// found while auditing the file.
//
// #R168 carved six SUBJECTS out of the core. What was left was one 6,894-line DOMContentLoaded
// closure of 857 statements in which almost nothing is a self-contained block any more. #R169 cuts
// it on a different axis: not "which statements sit together" but "which statements are pure
// DECLARATIONS". 277 KB of the closure declares functions and tables and executes nothing; those
// declarations can be lifted into a factory and instantiated anywhere after `map` exists, because a
// declaration has no observable effect until something calls it. Every statement that actually RUNS
// (the DOM wiring, the map.on() handlers, the boot sequence) stays exactly where it was, in its
// original order — so this round cannot reorder a single side effect.
//
// The contract pinned here (tests/r169.spec.js proves the same things in a real browser):
//   · each of the eleven files is loaded, declares exactly one factory, is instantiated exactly once
//     and is named in the boot guard, so a file that fails to deploy cannot fail silently;
//   · every exported name keeps ONE hoisted forwarding shim in index.html and is declared nowhere
//     else there — call sites textually above the factory call still work, `this` and the argument
//     list are preserved;
//   · the eleven calls sit together, after the map is constructed, and nothing that runs during
//     closure evaluation touches a moved name before them (checked transitively through the call
//     graph, not just at the top level);
//   · a factory body only DECLARES — proven statement by statement with a real parser;
//   · no module reads a reassigned closure value as a bare identifier (the #R162 silent-loss shape).
//
// The RW contract (which module may WRITE which host member) lives in r165-checks.test.mjs.
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
const lf = html.replace(/\r\n/g, '\n');   // index.html is CRLF in the working tree
/* (#R175) two different subjects, so two different sources: `lf` is THE PAGE (index.html +
   src/main.js + js/app-body.js, concatenated by appShell) for every question about the program, and
   INDEX_FILE is the HTML FILE itself for the questions about its markup and its size. */
const INDEX_FILE = rd('index.html').replace(/\r\n/g, '\n');

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

/* factory -> { file, the const index.html binds it to, the names index.html keeps a shim for }.
   The order of this object is the order the eleven calls must appear in — one block, right after
   the #R168 block. */
const MODULES = {
  satellite:        { file: 'js/satellite.js', k: 'IM_SAT', exports: ['aiCaptureSatAt', 'satApply', 'satBuildTiles', 'satCaptureLabel', 'satChipHTML', 'satHasKey', 'satProviderById', 'satReady', 'satRefreshReadout', 'satRenderController', 'satRenderKeyInputs', 'satRevertToFallback', 'satSaveKeyInputs', 'satSelectProvider', 'satSetOpacity', 'satSetup', 'satStepDay', 'satToast'] },
  /* (#R318) +2: `_aiLangName` / `_aiLangLine` came over from js/app-body.js — the instruction
     that tells the model which language to answer in belongs with the transport that carries it,
     and the app shell had no line to spare (tests/r168 #8). */
  aiCore:           { file: 'js/ai-core.js', k: 'IM_AI', exports: ['_aiLangLine', '_aiLangName', 'aiDev', 'aiEsc', 'aiFetchUsage', 'aiGate', 'aiLimitMsg', 'aiLoginMsg', 'aiParseJSON', 'aiReady', 'aiRenderSettings', 'aiReport', 'aiSaveSettings', 'aiSetBtnBusy', 'aiSyncFeatureButtons', 'aiToast', 'aiToday', 'aiUsesLeft', 'aiVisionReady', 'aiWaitMapIdle', 'askAI', 'askAIJSON', 'askAIJSONEnvelope'] },
  placeLabels:      { file: 'js/place-labels.js', k: 'IM_LABELS', exports: ['applyLabelLang', 'ensurePlaceLabels'] },
  /* (#R238) +5: the dock (setDocked/isDocked/dockedCount/dockRefresh) and its app-side glue
     (wireDock). ⚠ Only `registerWindow` and the three above it are SHIMMED into index.html —
     the dock's five are called through IM_WINMGR directly, which is why (c) below still finds
     exactly four shims. That is the contract this table encodes: what the module returns, and
     separately what the shell forwards. */
  windowManager:    { file: 'js/window-manager.js', k: 'IM_WINMGR', exports: ['addEdgeResize', 'bringToFront', 'makeDraggable', 'registerWindow'], direct: ['setDocked', 'isDocked', 'dockedCount', 'dockRefresh', 'wireDock'] },
  searchGeocode:    { file: 'js/search-geocode.js', k: 'IM_SEARCH', exports: ['doGeocode', 'localFuzzyPlaces'] },
  newsContext:      { file: 'js/news-context.js', k: 'IM_NEWSCTX', exports: ['analyzeContext', 'rebuildGeoIndex'] },
  newsFeed:         { file: 'js/news-feed.js', k: 'IM_NEWSFEED', exports: ['aiTranslateTitles', 'fetchData', 'loadNewsFromSupabase', 'startNews', 'newsFeatureOf'] },   /* (#R416) newsFeatureOf — the ONE news-pin builder; js/news-ui.js reaches it through HOST */
  articleReader:    { file: 'js/article-reader.js', k: 'IM_READER', exports: ['enterReaderPane', 'openArticleInSidebar'] },   /* (#R435) enterReaderPane — the ONE way into the reading surface; js/news-events.js reaches it through HOST */
  communityBoard:   { file: 'js/community-board.js', k: 'IM_COMMBOARD', exports: ['cmAddPost', 'cmEditPost', 'commCatLabel', 'imViewProfile', 'loadCommunity', 'openComposeModal', 'renderCommList', 'setupCommunityLayer', 'visibleCommunityPosts'] },
  mapReadout:       { file: 'js/map-readout.js', k: 'IM_READOUT', /* (#R221) demTilePoints + releaseDEMHold: the intensity field asks for one point per DEM TILE and PINS what it warms — see js/map-readout.js */ exports: ['_demZoomForSpan', 'demElevAt', 'demElevBilinear', 'demSnapshot', 'demTilePoints', 'demVoidStats', 'demZoomForMap', 'releaseDEMHold', 'fetchBathymetry', 'fmtElevVal', 'fmtLL', 'handleMapClick', 'refreshGrid', 'renderCoordReadout', 'setGrid', 'showMeasureTip', 'updateCompass', 'updateCoord', 'updateLayerReadout', 'warmDEMTiles'] },
  elevationProfile: { file: 'js/elevation-profile.js', k: 'IM_ELEVPROF', exports: ['_openProfilePanel'] },
};
const NAMES = Object.keys(MODULES);
const rx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shimOf = (m, n) => `function ${n}(){ return ${MODULES[m].k}.${n}.apply(this,arguments); }`;
const callOf = (m) => `const ${MODULES[m].k}=window.IntMapModules.${m}(IM_HOST);`;

/* Closure values these modules read that are REASSIGNED at runtime → live host getters, never a
   bare identifier inside a js/ file. A captured copy would silently go stale (the #R162 shape). */
const LIVE = {
  currentLang: 'lang', currentUser: 'user', currentMode: 'mode', currentMapType: 'mapType',
  satActive: 'satActive', satErrCount: 'satErrCount', satAutoBackoff: 'satAutoBackoff',
  satLastGood: 'satLastGood', satPanelDismissed: 'satPanelDismissed',
  searchMarker: 'searchMarker', panelDrag: 'panelDrag', geoDB: 'geoDB',
  globalData: 'globalData', newsFeatures: 'newsFeatures', newsFiltered: 'newsFiltered',
  renderedCount: 'renderedCount', readerOpen: 'readerOpen', readerCurrent: 'readerCurrent',
  communityPosts: 'communityPosts', commCaps: 'commCaps', composeCat: 'composeCat',
  composeEditId: 'composeEditId', pendingImg: 'pendingImg', pendingPostLoc: 'pendingPostLoc',
  isGridOn: 'isGridOn', toolMode: 'toolMode', measureSnapClose: 'measureSnapClose',
  lastElev: 'lastElev', lastLayerVal: 'lastLayerVal', elevTimer: 'elevTimer',
  _crLng: '_crLng', _crLat: '_crLat', _elevSeq: '_elevSeq',
  geoLabelsOn: 'geoLabelsOn', namesOn: 'namesOn', userTheme: 'userTheme', newsLangs: 'newsLangs',
};

test('R169 #1 all eleven files are loaded and every factory is declared and instantiated once', () => {
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

test('R169 #2 THE SHIM CONTRACT: every exported name is a hoisted forwarding declaration', () => {
  for (const m of NAMES) {
    const { file, exports, direct = [] } = MODULES[m];
    const src = rd(file);

    /* (a) the module returns exactly the declared export list.
       ⚠ (#R238) `direct` is the second half of that list: names the app calls THROUGH `IM_WINMGR.x()`
       rather than through a hoisted shim in index.html. The distinction is not cosmetic — a shim is a
       line in the app SHELL, which tests/r168 #8 budgets, and #R238's dock is 60 lines that were moved
       OUT of the shell precisely so the budget would hold. Requiring a shim for every export would
       therefore make this file and r168 #8 pull against each other. So both halves are declared, (a)
       still demands the return list match EXACTLY, and only the shimmed half is checked for a shim. */
    const retAt = src.lastIndexOf('return {');
    const ret = src.slice(retAt, src.indexOf('};', retAt) + 2);
    const returned = ret.replace(/^return \{|\};$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(returned, exports.concat(direct), `${file} must return exactly its declared exports`);

    /* every `direct` name really is declared in the module, and index.html does NOT shim it */
    for (const n of direct) {
      assert.match(src, new RegExp(`(?:^|\\n)\\s*(?:(?:async\\s+)?function ${rx(n)}\\(|const ${rx(n)}\\s*=)`),
        `${file} declares ${n}`);
      assert.equal(html.split(shimOf(m, n)).length - 1, 0, `${n} is called through IM_WINMGR, so it must NOT be shimmed`);
    }

    for (const n of exports) {
      // (b) each one really is a function declared INSIDE the module — either a function
      //     declaration or, for the handful that were written that way in index.html
      //     (satProviderById, satHasKey …), a const bound to an arrow.
      assert.match(src, new RegExp(`(?:^|\\n)\\s*(?:(?:async\\s+)?function ${rx(n)}\\(|const ${rx(n)}\\s*=\\s*(?:async\\s*)?\\()`),
        `${file} declares ${n}`);

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

test('R169 #3 POSITION: the eleven calls sit together after the map is built, before any eager use', () => {
  /* (#R178) the construction is spelled `map=GE().ui.createView({` now: even the PRIMARY view goes
     through the engine contract, since js/geo-engine.js is imported before app-body.js runs. The
     invariant is unchanged — one binding, one place, everything else after it. */
  const mapAssign = lf.indexOf('map=GE().ui.createView({');
  assert.ok(mapAssign > 0, 'the app constructs the map exactly where expected');

  const at = NAMES.map((m) => ({ m, i: lf.indexOf(callOf(m)) }));
  for (const x of at) assert.ok(x.i > mapAssign, `${x.m} is instantiated AFTER the map is constructed`);
  assert.deepEqual(at.slice().sort((a, b) => a.i - b.i).map((x) => x.m), NAMES, 'the eleven calls keep their declared order');

  // The #R169 block must follow the #R168 block — both are declaration-only, but keeping them in
  // one place is what makes "everything is instantiated here" a checkable statement.
  const r168 = lf.indexOf('const IM_COMMUNITY=window.IntMapModules.community(IM_HOST);');
  assert.ok(r168 > 0 && at[0].i > r168, 'the #R169 block sits directly after the #R168 block');

  // Nothing may CALL a moved name while the closure is still evaluating and before the factories
  // exist. Checked transitively: parse the closure, find every call that runs at closure-evaluation
  // time (i.e. not inside a function body) BEFORE the first factory call, then follow the call graph
  // of the functions those calls reach. A hit would be a temporal-dead-zone crash at boot.
  /* (#R175) the closure is a file of its own now, so there is nothing to slice out of the HTML. */
  const js = rd('js/app-body.js').replace(/\r\n/g, '\n');
  const ast = acorn.parse(js, { ecmaVersion: 'latest', locations: true, sourceType: 'module' });
  const dcl = ast.body.find((n) => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression');
  const fn = dcl.expression.arguments[1];
  const stmts = fn.body.body;
  const firstCallLine = js.slice(0, js.indexOf(callOf(NAMES[0]))).split('\n').length;
  const moved = new Set(NAMES.flatMap((m) => MODULES[m].exports));

  const declaredBy = new Map();     // top-level name -> statement
  for (const st of stmts) {
    if (st.type === 'FunctionDeclaration' && st.id) declaredBy.set(st.id.name, st);
    if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier') declaredBy.set(d.id.name, st);
  }
  const callsIn = (node, immediateOnly) => {
    const out = new Set();
    (function w(n, inFn) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((x) => w(x, inFn));
      const nowIn = inFn || /Function/.test(n.type);
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && (!immediateOnly || !nowIn)) out.add(n.callee.name);
      for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; w(n[k], nowIn); }
    })(node, false);
    return out;
  };
  const hazards = [];
  for (const st of stmts) {
    if (st.loc.start.line >= firstCallLine) continue;
    if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') continue;
    for (const rootName of callsIn(st, true)) {
      const seen = new Set([rootName]), queue = [rootName];
      while (queue.length) {
        const c = queue.shift();
        if (moved.has(c)) { hazards.push(`line ${st.loc.start.line}: ${rootName} … → ${c}`); queue.length = 0; break; }
        const d = declaredBy.get(c);
        if (!d) continue;
        for (const nx of callsIn(d, false)) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
      }
    }
  }
  assert.deepEqual(hazards, [], 'a moved name is reached by code that runs before the factories exist');
});

test('R169 #4 DECLARATION-ONLY: a factory body does nothing while it runs', () => {
  // This is the property that makes calling all eleven early safe. A factory-level statement that
  // EXECUTES would have its side effect moved with it; a factory-level initialiser that CALLS
  // anything would read closure state at factory time — the #R167 dead-zone trap.
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

    for (const st of body.filter((s) => s.type === 'VariableDeclaration')) {
      for (const d of st.declarations) {
        (function scan(n) {
          if (!n || typeof n.type !== 'string') return;
          if (/Function/.test(n.type)) return;
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

test('R169 #5 no module reads a live value as a bare identifier', () => {
  for (const m of NAMES) {
    const src = code(rd(MODULES[m].file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const hits = (src.match(new RegExp(`(?<![.\\w$])${rx(name)}(?![\\w$])`, 'g')) || []).length;
      assert.equal(hits, 0, `${MODULES[m].file} mentions ${name} as a bare identifier — it must use HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R169 #6 every live member really is a getter over a really-reassigned variable', () => {
  for (const [name, prop] of Object.entries(LIVE)) {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${rx(name)}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${rx(name)}\\s*=`);
    const reassigned = lf.split('\n').some((l) => asg.test(l) && !decl.test(l));
    const setter = new RegExp(`set\\s+${rx(prop)}\\(v\\)\\{\\s*${rx(name)}=v;\\s*\\}`).test(lf);
    assert.ok(reassigned || setter,
      `${name} must be reassigned somewhere (in index.html, or through its IM_HOST setter) — otherwise it need not be a live member`);
    assert.match(lf, new RegExp(`get\\s+${rx(prop)}\\(\\)\\{\\s*return\\s+${rx(name)};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
});

test('R169 #7 the parser-backed split-scope check still passes across all eleven new files', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R169 #8 index.html shrank and no module body came back inline', () => {
  /* (#R175) the file, not the page. index.html was 6,319 lines before this round and is markup again
     now — the 496 KB body moved to js/app-body.js so the bundler can minify it. The ceiling stays at
     the #R169 figure rather than being tightened to today's, because what this asserts is "it did not
     grow back", and a ceiling that tracks the current size asserts nothing. */
  const lines = INDEX_FILE.split('\n').length;
  assert.ok(lines < 6_200, `index.html should be well under the pre-R169 7,690 lines; it is ${lines}`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(INDEX_FILE), 'the stylesheet stays in css/intmap.css');
  // A leftover in-page copy of a moved body would WIN over the module (a later function declaration
  // overwrites an earlier one). Probe with a line from deep inside the biggest bodies, so the needle
  // cannot accidentally match the one-line shim that legitimately carries the name.
  const deep = {
    'js/place-labels.js': "function _harvestOne(kind,sourceLayer,filter,cellDeg){",
    'js/map-readout.js': "function buildGridFeatures(){",
    'js/ai-core.js': "async function aiCallServerFull(prompt, system, imgs, opts){",
    'js/satellite.js': "function satBuildTiles(p){",
    'js/community-board.js': "function postCardHTML(post){",
    'js/news-feed.js': "function feedUrls(){",
  };
  for (const [file, needle] of Object.entries(deep)) {
    assert.ok(rd(file).includes(needle), `${file} really holds the moved body (${needle})`);
    assert.ok(!lf.includes(needle), `index.html must not still carry ${file}'s body inline (${needle})`);
  }
});

test('R169 #9 the head defects found while auditing index.html are fixed', () => {
  // (a) a stray second </script> closed nothing — a leftover from an old edit that the browser
  //     silently tolerates. One open <script> ⇒ one close. Tags INSIDE an HTML comment don't count
  //     (the CSP note spells `<script src=evil-host>` on purpose); the ranges are computed and the
  //     matches filtered by offset rather than stripped out of the string, because a single-pass
  //     removal of a multi-character delimiter is exactly the "incomplete sanitization" shape.
  /* (#R175) …asked of the HTML FILE, which is the only thing that has <script> tags at all now. */
  const comments = [...INDEX_FILE.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
  const outside = (i) => !comments.some(([a, b]) => i >= a && i < b);
  const opens = [...INDEX_FILE.matchAll(/<script\b/g)].filter((m) => outside(m.index)).length;
  const closes = [...INDEX_FILE.matchAll(/<\/script>/g)].filter((m) => outside(m.index)).length;
  assert.equal(opens, closes, `index.html has as many </script> (${closes}) as <script> (${opens}) tags`);
  // (b) the MapLibre stylesheet was linked twice, byte-identical — a second request for a file the
  //     browser already had.
  /* (#R175) the stylesheet is no longer a <link> at all — it is an import in src/vendor.js, which
     the bundler emits once. The defect this guards against (asking for the same file twice) is
     therefore asserted where it can now happen: exactly one import, and no CDN link left behind. */
  const cssImports = (rd('src/vendor.js').match(/maplibre-gl\/dist\/maplibre-gl\.css/g) || []).length;
  assert.equal(cssImports, 1, 'the MapLibre stylesheet is imported exactly once');
  assert.ok(!/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/.test(INDEX_FILE), 'and the CDN link is gone');
  // (c) the anti-stale-version guard compares the build stamp it ships with against the newest one
  //     this device has seen. A stamp that never advances makes the guard inert; both stamps were
  //     last touched in #R121 / #R133.
  //     (#R170) This asserted the literal R169 strings, which contradicts the point being made: a stamp
  //     that never advances makes the guard inert, so pinning one VALUE forever guarantees exactly the
  //     defect. Assert the SHAPE and that it has not gone backwards past the round that fixed this.
  const ib = html.match(/window\.INTMAP_BUILD='(\d{4}-\d{2}-\d{2})-R(\d+)';/);
  assert.ok(ib, 'INTMAP_BUILD must be a date-ordered `YYYY-MM-DD-R<n>` stamp');
  assert.ok(ib[1] >= '2026-07-25', `INTMAP_BUILD went backwards (${ib[1]}) — the anti-stale guard compares these`);
  assert.ok(Number(ib[2]) >= 169, `INTMAP_BUILD round went backwards (R${ib[2]})`);
  const mb = html.match(/window\.__imBuild='R(\d+)';/);
  assert.ok(mb, '__imBuild must be an `R<n>` stamp');
  assert.equal(mb[1], ib[2], 'the two build stamps must name the SAME round');
});
