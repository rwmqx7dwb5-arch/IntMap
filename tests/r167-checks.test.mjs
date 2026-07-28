// R167 source-level regression checks — the sixth index.html split.
//
// #R162–#R166 took index.html from 36,955 lines to 11,810 by moving whole features into js/. What
// was left is mostly the core: state, boot, the map, the news pipeline, auth and the render tree.
// #R167 therefore splits along two different seams instead of hunting for more big blocks:
//
//   1. PURE DATA (Architecture.md §3.1 step 4). 27 lookup tables that are never mutated move to
//      js/tables.js and index.html rebinds each name. No factory, no host, no order to preserve —
//      but the "never mutated" claim has to be enforced, because a table that IS mutated would
//      silently share one object across reloads of nothing at all. Test #3 pins it.
//   2. The self-contained blocks that were left: legal texts, the feedback/bug modals, onboarding,
//      the mobile UI, the news timeline, the dashboard cache and the last map-surface widgets.
//      Same factory contract as #R163–#R166, with two new READ-WRITE owners (see r165-checks).
//
// The trap specific to THIS round is the temporal dead zone. Earlier rounds could bind stable
// helpers at factory time (`const imToast=HOST.imToast`) because every one of them was a hoisted
// function declaration. js/feedback.js needs `DB`, which is a `const` declared ~1,300 lines BELOW
// its call site: binding it at factory time throws. So it is read as HOST.DB at each use, and
// test #5 keeps it that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appShell } from './app-source.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const root = new URL('../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root), 'utf8');
/* (#R175) "the page" is three files now — index.html + src/main.js + js/app-body.js.
   appShell() concatenates them so every assertion below keeps meaning what it meant. */
const html = appShell(root);

/* Blank out comments and string/template literals so identifier scanning reads CODE only — the
   module headers document the rewrites in prose, which would otherwise register as violations. */
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

/* file -> the factories it defines */
const MOVED = {
  'js/legal.js': ['legal'],
  'js/feedback.js': ['feedback'],
  'js/onboarding.js': ['onboarding', 'progressCtl'],
  'js/mobile-ui.js': ['mobileUI', 'layoutReflow'],
  'js/news-timeline.js': ['newsTimeline'],
  'js/dash-extended.js': ['dashExtended'],
  'js/map-extras.js': ['locate', 'annotations', 'layerHoverPopup', 'layerSearch', 'runwaySearch', 'terrain', 'railSeaOverlays'],
};
const ALL_FACS = Object.values(MOVED).flat();
/* mobileUI is the one factory whose RETURN VALUE is bound: index.html still calls initMobileUI()
   by name at the end of boot, so the factory just hands the function back. */
const RETURNED = { mobileUI: 'initMobileUI' };
const callOf = (f) => (RETURNED[f]
  ? `const ${RETURNED[f]}=window.IntMapModules.${f}(map,IM_HOST);`
  : `window.IntMapModules.${f}(map,IM_HOST);`);

/* The order the blocks occupied in the closure = the order their calls must appear in index.html. */
const ORDER = [
  'feedback', 'legal', 'newsTimeline', 'locate', 'mobileUI', 'layoutReflow', 'dashExtended',
  'annotations', 'layerHoverPopup', 'layerSearch', 'runwaySearch', 'onboarding', 'progressCtl',
  'terrain', 'railSeaOverlays',
];

/* The 27 tables. */
const TABLES = ['SAT_PROVIDERS', '_ORG_GZ', '_DEMONYM_GZ', 'sourceDict', '_DERU_GZ', '_DERU_DEM', '_ES_GZ', '_ES_DEM',
  'geoLayersDB', 'GEO_LABEL_JP', 'GDP', 'HDI', 'DEM', 'MILSPEND', 'LIFE', 'INTERNET', 'CAPITAL', 'CURRENCY', 'LANGS',
  'RADIUS_PRESETS', 'CO_SECTORS', 'CO_CC', '_DASH_BADGE', 'NEWS_EDITIONS_MULTI', 'NEWS_COUNTRY_EDITIONS',
  'COMM_CATEGORIES', 'NEWS_COUNTRY_FEEDS'];

/* Closure values these blocks read that are REASSIGNED at runtime → live host getters, never a bare
   identifier inside a js/ file. (isGridOn and countryInfoOn are new this round.) */
const LIVE = {
  currentLang: 'lang', currentUser: 'user', currentMode: 'mode', currentProj: 'proj',
  currentMapType: 'mapType', userTheme: 'userTheme', unitMode: 'unitMode', toolMode: 'toolMode',
  globalData: 'globalData', newsFeatures: 'newsFeatures', extendedDashDB: 'extendedDashDB',
  isGridOn: 'isGridOn', countryInfoOn: 'countryInfoOn',
};

test('R167 #1 all eight files are loaded and every factory they define is instantiated', () => {
  assert.ok(html.includes("import '../js/tables.js';"), 'src/main.js imports js/tables.js (#R175)');
  for (const [file, facs] of Object.entries(MOVED)) {
    const src = rd(file);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    for (const f of facs) {
      assert.ok(src.includes(`window.IntMapModules.${f}=function(map,HOST){`),
        `${file} declares the ${f} factory taking (map,HOST)`);
      const calls = html.split(callOf(f)).length - 1;
      assert.equal(calls, 1, `index.html must call ${f} exactly once (found ${calls})`);
    }
    const defined = [...src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function/g)].map((m) => m[1]);
    assert.deepEqual(defined.slice().sort(), facs.slice().sort(), `${file} defines exactly its declared factories`);
  }
});

test('R167 #2 ORDER: every call sits where its block used to run', () => {
  // Same reason as #R166: several of these append to shared containers (the mobile FAB column, the
  // layer dropdown, map controls), so their relative order is user-visible.
  const seen = ALL_FACS
    .map((f) => ({ f, at: html.indexOf(callOf(f)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.f);
  assert.deepEqual(seen, ORDER, 'factory call order in index.html must match the original block order');
});

test('R167 #3 THE TABLE CONTRACT: js/tables.js is pure data that index.html never mutates', () => {
  const src = rd('js/tables.js');
  assert.ok(src.includes('window.IntMapTables=(function(){'), 'js/tables.js defines window.IntMapTables');
  assert.ok(src.includes('window.SEA_LABELS=['),
    'SEA_LABELS keeps its own global — its consumers already read it off window');

  // (a) every table is exported, and the app rebinds every one of them. (#R168) the rebinding
  //     statement is no longer always in index.html: the country tables went into js/countries-ui.js
  //     with the code that reads them, the company ones into js/companies-ui.js, RADIUS_PRESETS into
  //     js/tool-panel.js. Which FILE rebinds a table is not what this contract is about — that it is
  //     rebound from window.IntMapTables exactly once, and never re-declared inline, is.
  //     (#R169) the same again: the publisher/demonym gazetteers went into js/news-context.js with
  //     analyzeContext, the satellite provider table into js/satellite.js, the news editions into
  //     js/news-feed.js and the community categories into js/community-board.js.
  //     (#R175) 'index.html' became 'js/app-body.js' — the same code, in the file it now lives in.
  const consumers = ['js/app-body.js', 'js/countries-ui.js', 'js/companies-ui.js', 'js/tool-panel.js',
    'js/news-context.js', 'js/satellite.js', 'js/news-feed.js', 'js/community-board.js'].map((p) => [p, rd(p)]);
  const retAt = src.lastIndexOf('return {');
  const ret = src.slice(retAt, src.indexOf('};', retAt) + 2);
  for (const t of TABLES) {
    assert.match(ret, new RegExp(`[{,]${t}[,}]`), `js/tables.js returns ${t}`);
    const where = consumers.filter(([, s]) => new RegExp(`const \\{[^}]*\\b${t}\\b[^}]*\\}=window\\.IntMapTables;`).test(s)).map(([p]) => p);
    assert.equal(where.length, 1, `exactly one file must rebind ${t} from window.IntMapTables (found: ${where.join(', ') || 'none'})`);
    for (const [p, s] of consumers) {
      assert.ok(!new RegExp(`(?:^|\\n)\\s*const ${t}\\s*=`).test(s), `${t} must not be declared inline in ${p} again`);
    }
  }

  // (b) THE reason a plain value hand-off is safe here: nothing ever writes these objects. A member
  //     write or a mutating call anywhere would mean the table is really shared state, and it would
  //     have to move back or become a host member. Checked with a real parser — over index.html's
  //     closure AND every js/ module, since #R168 moved consumers of these tables into modules.
  /* (#R175) the closure used to be sliced out of index.html's last inline <script>; it is
     js/app-body.js now, so the js/ sweep below already covers it — one source list, no HTML slicing. */
  const sources = [];
  for (const f of readdirSync(new URL('js/', root)).filter((x) => x.endsWith('.js')).sort()) sources.push(['js/' + f, rd('js/' + f)]);
  const names = new Set(TABLES);
  const MUT = new Set(['push', 'pop', 'splice', 'sort', 'shift', 'unshift', 'reverse', 'fill', 'copyWithin']);
  const writes = [];
  for (const [where, js] of sources) {
    const ast = acorn.parse(js, { ecmaVersion: 'latest' });
    walk.full(ast, (n) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
          && n.left.object.type === 'Identifier' && names.has(n.left.object.name)) writes.push(where + ': ' + n.left.object.name + '.<member>=');
      if (n.type === 'UnaryExpression' && n.operator === 'delete' && n.argument.type === 'MemberExpression'
          && n.argument.object.type === 'Identifier' && names.has(n.argument.object.name)) writes.push(where + ': delete ' + n.argument.object.name);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
          && n.callee.object.type === 'Identifier' && names.has(n.callee.object.name) && MUT.has(n.callee.property.name))
        writes.push(where + ': ' + n.callee.object.name + '.' + n.callee.property.name + '()');
    });
  }
  assert.deepEqual(writes, [], 'a table in js/tables.js is mutated: ' + writes.join(', '));
});

test('R167 #4 INVARIANT: every reassigned closure value these blocks touch is a LIVE host member', () => {
  const reassignments = (name) => {
    const asg = new RegExp(`(?:^|[^.\\w$=!<>+\\-*/%&|^])${name}\\s*=(?!=)`);
    const decl = new RegExp(`(?:const|let|var)\\b[^;]*\\b${name}\\s*=`);
    return html.split('\n').filter((l) => asg.test(l) && !decl.test(l)).length;
  };
  for (const [name, prop] of Object.entries(LIVE)) {
    assert.ok(reassignments(name) > 0,
      `${name} is reassigned at runtime — if that ever stops being true, revisit why it is a live member`);
    assert.match(html, new RegExp(`get\\s+${prop}\\(\\)\\{\\s*return\\s+${name};\\s*\\}`),
      `IM_HOST.${prop} must be a live getter over ${name}`);
  }
  for (const file of Object.keys(MOVED)) {
    const src = code(rd(file));
    for (const [name, prop] of Object.entries(LIVE)) {
      const hits = (src.match(new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g')) || []).length;
      assert.equal(hits, 0, `${file} still mentions ${name} as a bare identifier — it must read HOST.${prop} (${hits} hit(s))`);
    }
  }
});

test('R167 #5 THE DEAD-ZONE RULE: js/feedback.js never binds HOST.DB at factory time', () => {
  // `const DB=window.sb` is declared ~1,300 lines below this module's call site. Every earlier
  // round could safely write `const imToast=HOST.imToast;` at the top of a factory because those
  // helpers were all hoisted FUNCTION DECLARATIONS. A `const` is not hoisted: reading HOST.DB while
  // the factory runs enters that const's temporal dead zone and throws before the modal exists.
  const src = rd('js/feedback.js');
  const i = src.indexOf('window.IntMapModules.feedback=function(map,HOST){');
  assert.ok(i > 0, 'js/feedback.js declares the feedback factory');
  const bindLine = src.slice(i).split('\n')[1];
  assert.ok(!/\bDB\s*=\s*HOST\.DB\b/.test(bindLine),
    'DB must NOT be bound at factory time — read HOST.DB at each use instead');
  assert.match(src, /HOST\.DB\b/, 'js/feedback.js reads HOST.DB at its use sites');
  assert.match(html, /get DB\(\)\{ return DB; \}/, 'IM_HOST exposes DB as a getter');

  // The flip side: what IS bound at factory time must be a hoisted function declaration (or a const
  // declared above every call site), or the same dead zone applies. Prove it for all eight files.
  const ABOVE_ALL = new Set(['t', 'isMobile']);   // `const t` / `const isMobile` sit at the very top
  for (const file of Object.keys(MOVED)) {
    const s = rd(file);
    for (const m of s.matchAll(/^ {2}const ((?:[\w$]+=HOST\.[\w$]+)(?:, [\w$]+=HOST\.[\w$]+)*);$/gm)) {
      for (const pair of m[1].split(', ')) {
        const name = pair.split('=')[0];
        assert.ok(ABOVE_ALL.has(name) || new RegExp(`\\n  (?:async )?function ${name}\\s*\\(`).test(html),
          `${file} binds ${name} at factory time, so index.html must declare it as a hoisted function`);
      }
    }
  }
});

test('R167 #6 the parser-backed split-scope check passes (and covers the eight new files)', () => {
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope problems:\n' + problems.map((p) => `${p.file}: ${p.msg}`).join('\n'));
});

test('R167 #7 the boot guard names IntMapTables and every new factory', () => {
  assert.match(html, /'IntMapTables'/, 'the boot guard lists the IntMapTables data namespace');
  for (const f of ALL_FACS) assert.ok(html.includes(`'${f}'`), `the boot guard lists the ${f} factory`);
});

test('R167 #8 index.html shrank and no moved block came back inline', () => {
  const lines = html.split('\n').length;
  assert.ok(lines < 10_200, `index.html should be well under the pre-R167 11,810 lines; it is ${lines}`);
  for (const g of ['RunwaySearch', 'IntMapLocate', 'IntMapAnnotations', 'IntMapTerrain']) {
    assert.ok(!new RegExp(`window\\.${g}\\s*=\\s*\\(function`).test(html),
      `${g} must not be defined inline in index.html again`);
  }
  for (const f of ['legalPrivacyHTML', 'legalTermsHTML', '_imDiag', '_imWelcome', '_imStartDemo', 'initMobileUI'])
    assert.ok(!new RegExp(`\\n  function ${f}\\s*\\(`).test(html),
      `${f} must not be declared inline in index.html again`);
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
});
