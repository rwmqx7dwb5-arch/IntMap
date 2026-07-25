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
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
const html = rd('index.html');
const lf = html.replace(/\r\n/g, '\n');   // index.html is CRLF in the working tree

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
  aiCore:           { file: 'js/ai-core.js', k: 'IM_AI', exports: ['aiDev', 'aiEsc', 'aiFetchUsage', 'aiGate', 'aiLimitMsg', 'aiLoginMsg', 'aiParseJSON', 'aiReady', 'aiRenderSettings', 'aiReport', 'aiSaveSettings', 'aiSetBtnBusy', 'aiSyncFeatureButtons', 'aiToast', 'aiToday', 'aiUsesLeft', 'aiVisionReady', 'aiWaitMapIdle', 'askAI', 'askAIJSON', 'askAIJSONEnvelope'] },
  placeLabels:      { file: 'js/place-labels.js', k: 'IM_LABELS', exports: ['applyLabelLang', 'buildGeoFC', 'ensureGeoLayers', 'ensurePlaceLabels', 'localizeGeoLabels', 'updateGeoLayers'] },
  windowManager:    { file: 'js/window-manager.js', k: 'IM_WINMGR', exports: ['addEdgeResize', 'bringToFront', 'makeDraggable', 'registerWindow'] },
  searchGeocode:    { file: 'js/search-geocode.js', k: 'IM_SEARCH', exports: ['doGeocode', 'localFuzzyPlaces'] },
  newsContext:      { file: 'js/news-context.js', k: 'IM_NEWSCTX', exports: ['analyzeContext', 'rebuildGeoIndex'] },
  newsFeed:         { file: 'js/news-feed.js', k: 'IM_NEWSFEED', exports: ['aiTranslateTitles', 'fetchData', 'loadNewsFromSupabase', 'startNews'] },
  articleReader:    { file: 'js/article-reader.js', k: 'IM_READER', exports: ['openArticleInSidebar'] },
  communityBoard:   { file: 'js/community-board.js', k: 'IM_COMMBOARD', exports: ['cmAddPost', 'cmEditPost', 'commCatLabel', 'imViewProfile', 'loadCommunity', 'openComposeModal', 'renderCommList', 'setupCommunityLayer', 'visibleCommunityPosts'] },
  mapReadout:       { file: 'js/map-readout.js', k: 'IM_READOUT', exports: ['_demZoomForSpan', 'demElevAt', 'demElevBilinear', 'demZoomForMap', 'fetchBathymetry', 'fmtElevVal', 'fmtLL', 'handleMapClick', 'refreshGrid', 'renderCoordReadout', 'setGrid', 'showMeasureTip', 'updateCompass', 'updateCoord', 'updateLayerReadout', 'warmDEMTiles'] },
  elevationProfile: { file: 'js/elevation-profile.js', k: 'IM_ELEVPROF', exports: ['_openProfilePanel'] },
};
const NAMES = Object.keys(MODULES);
const rx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shimOf = (m, n) => `function ${n}(){ return ${MODULES[m].k}.${n}.apply(this,arguments); }`;
const callOf = (m) => `const ${MODULES[m].k}=window.IntMapModules.${m}(map,IM_HOST);`;

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
    assert.ok(html.includes(`<script src="${file}"></script>`), `index.html loads ${file}`);
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

test('R169 #2 THE SHIM CONTRACT: every exported name is a hoisted forwarding declaration', () => {
  for (const m of NAMES) {
    const { file, exports } = MODULES[m];
    const src = rd(file);

    // (a) the module returns exactly the declared export list.
    const retAt = src.lastIndexOf('return {');
    const ret = src.slice(retAt, src.indexOf('};', retAt) + 2);
    const returned = ret.replace(/^return \{|\};$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(returned, exports, `${file} must return exactly its declared exports`);

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
  const mapAssign = lf.indexOf('map=new maplibregl.Map({');
  assert.ok(mapAssign > 0, 'index.html constructs the map exactly where expected');

  const at = NAMES.map((m) => ({ m, i: lf.indexOf(callOf(m)) }));
  for (const x of at) assert.ok(x.i > mapAssign, `${x.m} is instantiated AFTER the map is constructed`);
  assert.deepEqual(at.slice().sort((a, b) => a.i - b.i).map((x) => x.m), NAMES, 'the eleven calls keep their declared order');

  // The #R169 block must follow the #R168 block — both are declaration-only, but keeping them in
  // one place is what makes "everything is instantiated here" a checkable statement.
  const r168 = lf.indexOf('const IM_COMMUNITY=window.IntMapModules.community(map,IM_HOST);');
  assert.ok(r168 > 0 && at[0].i > r168, 'the #R169 block sits directly after the #R168 block');

  // Nothing may CALL a moved name while the closure is still evaluating and before the factories
  // exist. Checked transitively: parse the closure, find every call that runs at closure-evaluation
  // time (i.e. not inside a function body) BEFORE the first factory call, then follow the call graph
  // of the functions those calls reach. A hit would be a temporal-dead-zone crash at boot.
  const marker = lf.lastIndexOf("window.addEventListener('DOMContentLoaded'");
  const open = lf.lastIndexOf('<script>', marker), close = lf.indexOf('</script>', marker);
  const js = lf.slice(open + '<script>'.length, close);
  const ast = acorn.parse(js, { ecmaVersion: 'latest', locations: true });
  const fn = ast.body[0].expression.arguments[1];
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
  const lines = html.split('\n').length;
  assert.ok(lines < 6_200, `index.html should be well under the pre-R169 7,690 lines; it is ${lines}`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
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
  //     silently tolerates. One open <script> ⇒ one close. Counted on the markup only: an HTML
  //     comment (the CSP note) and the document.write fallback both spell the word deliberately.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.equal((markup.match(/<script\b/g) || []).length, (markup.match(/<\/script>/g) || []).length,
    'index.html has as many </script> as <script> tags');
  // (b) the MapLibre stylesheet was linked twice, byte-identical — a second request for a file the
  //     browser already had.
  const cssLinks = (html.match(/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/g) || []).length;
  assert.equal(cssLinks, 1, 'the MapLibre stylesheet is linked exactly once');
  // (c) the anti-stale-version guard compares the build stamp it ships with against the newest one
  //     this device has seen. A stamp that never advances makes the guard inert; both stamps were
  //     last touched in #R121 / #R133.
  assert.match(html, /window\.INTMAP_BUILD='2026-07-25-R169';/, 'INTMAP_BUILD is stamped for this round');
  assert.match(html, /window\.__imBuild='R169';/, '__imBuild is stamped for this round');
});
