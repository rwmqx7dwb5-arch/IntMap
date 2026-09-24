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

/* ── (#R795) THE SHELL IS READ WITH A PARSER, NOT MATCHED AS TEXT ───────────────────────────────
   Until this round #1–#3 pinned the factory call, the shim and their POSITIONS as literal strings
   (`const IM_X=window.IntMapModules.x(IM_HOST);`, `function n(){ return IM_X.n.apply(this,arguments); }`,
   four hand-listed "eager uses" whose spelling had to be refreshed twice). What those strings stood
   for is three properties, and the properties are what is measured now:
     · each factory is instantiated exactly once, after the map exists;
     · each exported name reaches the shell as a HOISTED declaration that forwards receiver and
       arguments — hoisted, because call sites above the factory call must still work;
     · nothing that runs while the closure is still evaluating touches a moved name before the
       factory that provides it has run.
   The shell's exact spelling is free to change; the properties are not. */
const bodyAst = acorn.parse(rd('js/app-body.js'), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
function closureBody() {
  for (const s of bodyAst.body) {
    if (s.type !== 'ExpressionStatement' || s.expression.type !== 'CallExpression') continue;
    const c = s.expression;
    const isDCL = c.callee.type === 'MemberExpression' && c.callee.property.name === 'addEventListener'
      && c.arguments[0] && c.arguments[0].value === 'DOMContentLoaded';
    if (isDCL && c.arguments[1] && /Function/.test(c.arguments[1].type)) {
      /* (#R795) the handler is `() => { const _imAppBoot = () => { …the program… }; … }` since the
         boot barrier (#R180): the closure whose statements matter is the LARGEST function body
         declared directly inside it, found rather than named. */
      let best = c.arguments[1].body.body;
      for (const st of best) {
        if (st.type !== 'VariableDeclaration') continue;
        for (const d of st.declarations) if (d.init && /Function/.test(d.init.type) && d.init.body.type === 'BlockStatement' && d.init.body.body.length > best.length) best = d.init.body.body;
      }
      return best;
    }
  }
  throw new Error('DOMContentLoaded handler not found in js/app-body.js');
}
const STMTS = closureBody();
const SKIP = new Set(['loc', 'start', 'end', 'type']);
const isModulesCall = (n, m) => !!n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
  && !n.callee.computed && (m === null || n.callee.property.name === m)
  && n.callee.object.type === 'MemberExpression' && n.callee.object.property.name === 'IntMapModules'
  && n.callee.object.object.type === 'Identifier' && n.callee.object.object.name === 'window';
/* the statement index and the const the shell binds each factory to — DERIVED, not spelled */
function factorySite(m) {
  const hits = [];
  STMTS.forEach((s, i) => {
    if (s.type !== 'VariableDeclaration') return;
    for (const d of s.declarations) if (isModulesCall(d.init, m) && d.id.type === 'Identifier') hits.push({ i, k: d.id.name, args: d.init.arguments });
  });
  return hits;
}
/* identifiers referenced while the closure EVALUATES: everything in a statement except what is
   inside a nested function body (those run later, when called) */
function eagerIdents(node, out) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((x) => eagerIdents(x, out)); return out; }
  if (/Function/.test(node.type)) return out;
  if (node.type === 'Identifier') { out.add(node.name); return out; }
  if (node.type === 'MemberExpression') { eagerIdents(node.object, out); if (node.computed) eagerIdents(node.property, out); return out; }
  if (node.type === 'Property' && !node.computed) { eagerIdents(node.value, out); return out; }
  for (const k of Object.keys(node)) { if (SKIP.has(k)) continue; eagerIdents(node[k], out); }
  return out;
}
function eagerAssigns(stmt, name) {
  let hit = false;
  (function walk(n) {
    if (!n || typeof n !== 'object' || hit) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (/Function/.test(n.type)) return;
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.left.name === name) { hit = true; return; }
    for (const k of Object.keys(n)) { if (SKIP.has(k)) continue; walk(n[k]); }
  })(stmt);
  return hit;
}
/* the exported names of a module: the object its factory returns, read from the AST */
function factoryExports(file, m) {
  const ast = acorn.parse(rd(file), { ecmaVersion: 'latest', sourceType: 'module' });
  let fn = null;
  (function walk(n) {
    if (!n || typeof n !== 'object' || fn) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.name === m
      && n.left.object.type === 'MemberExpression' && n.left.object.property.name === 'IntMapModules' && /Function/.test(n.right.type)) { fn = n.right; return; }
    for (const k of Object.keys(n)) { if (SKIP.has(k)) continue; walk(n[k]); }
  })(ast);
  assert.ok(fn, file + ' declares the ' + m + ' factory on window.IntMapModules');
  const body = fn.body.body;
  const ret = body[body.length - 1];
  assert.ok(ret && ret.type === 'ReturnStatement' && ret.argument && ret.argument.type === 'ObjectExpression', file + ': the factory ends by returning its export object');
  const declared = new Set();
  for (const s of body) if (s.type === 'FunctionDeclaration' && s.id) declared.add(s.id.name);
  const names = ret.argument.properties.map((p) => (p.key && (p.key.name || p.key.value)));
  for (const n of names) assert.ok(declared.has(n), file + ': export ' + n + ' is a function declared inside the module, not re-exported junk');
  return names;
}

test('R168 #1 all six files are loaded and every factory is declared and instantiated once, after the map exists', () => {
  const mapAt = STMTS.findIndex((s) => eagerAssigns(s, 'map'));
  assert.ok(mapAt >= 0, 'the closure assigns `map` while evaluating (the view is built in the shell)');
  for (const m of NAMES) {
    const { file } = MODULES[m];
    const src = rd(file);
    assert.ok(html.includes(`import '../${file}';`), `src/main.js imports ${file} (#R175)`);
    assert.ok(src.includes('window.IntMapModules=window.IntMapModules||{};'),
      `${file} extends IntMapModules without clobbering what earlier files put there`);
    assert.ok(!/<style>/.test(code(src)), `${file} must not carry CSS — the stylesheet stays in css/intmap.css`);
    const defined = [...src.matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function/g)].map((x) => x[1]);
    assert.deepEqual(defined, [m], `${file} defines exactly one factory`);
    const sites = factorySite(m);
    assert.equal(sites.length, 1, `the shell instantiates ${m} exactly once (found ${sites.length})`);
    assert.ok(sites[0].i > mapAt, `${m} is instantiated AFTER the map is constructed`);
    assert.ok(sites[0].args.length === 1 && sites[0].args[0].type === 'Identifier' && sites[0].args[0].name === 'IM_HOST', `${m} is handed the host object and nothing else`);
    assert.match(html, new RegExp(`'${m}'`), `the boot guard names the ${m} factory, so a missing file cannot hide`);
  }
});

test('R168 #2 THE SHIM CONTRACT: every exported name is a hoisted declaration that forwards receiver and arguments', () => {
  for (const m of NAMES) {
    const { file, exports } = MODULES[m];
    const returned = factoryExports(file, m);
    assert.deepEqual(returned, exports, `${file} must return exactly its declared exports`);
    const k = factorySite(m)[0].k;
    for (const n of exports) {
      /* one declaration of the name in the shell, and it is a function DECLARATION (hoisted) */
      const decls = STMTS.filter((s) => (s.type === 'FunctionDeclaration' && s.id && s.id.name === n)
        || (s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id.type === 'Identifier' && d.id.name === n)));
      assert.equal(decls.length, 1, `${n} is declared exactly once in the shell (found ${decls.length})`);
      const d = decls[0];
      assert.equal(d.type, 'FunctionDeclaration', `${n}'s shim is a hoisted function declaration — a const would break every call site above the factory (TDZ)`);
      const body = d.body.body;
      assert.ok(body.length === 1 && body[0].type === 'ReturnStatement' && body[0].argument && body[0].argument.type === 'CallExpression', `${n}'s shim does nothing but forward`);
      const call = body[0].argument;
      const callee = call.callee;
      /* K.n.apply(this, arguments)  or  K.n.call(this, ...arguments) */
      const viaApply = callee.type === 'MemberExpression' && !callee.computed && (callee.property.name === 'apply' || callee.property.name === 'call')
        && callee.object.type === 'MemberExpression' && callee.object.property.name === n
        && callee.object.object.type === 'Identifier' && callee.object.object.name === k;
      assert.ok(viaApply, `${n}'s shim forwards to ${k}.${n} through apply/call`);
      assert.ok(call.arguments[0] && call.arguments[0].type === 'ThisExpression', `${n}'s shim forwards its receiver (this)`);
      const argsOk = callee.property.name === 'apply'
        ? (call.arguments[1] && call.arguments[1].type === 'Identifier' && call.arguments[1].name === 'arguments')
        : (call.arguments[1] && call.arguments[1].type === 'SpreadElement' && call.arguments[1].argument.name === 'arguments');
      assert.ok(argsOk, `${n}'s shim forwards every argument`);
    }
  }
});

test('R168 #3 POSITION: nothing evaluated before a factory call touches a name that factory provides', () => {
  for (const m of NAMES) {
    const site = factorySite(m)[0];
    const moved = new Set([site.k, ...MODULES[m].exports]);
    for (let i = 0; i < site.i; i++) {
      const used = eagerIdents(STMTS[i], new Set());
      for (const n of moved) assert.ok(!used.has(n), `statement ${i} (line ${STMTS[i].loc.start.line}) evaluates ${n} before ${m}'s factory has run (statement ${site.i})`);
    }
  }
  /* …and the factories run as one block: no statement between the first and the last of them
     does anything but bind a factory or declare a shim — a side effect wedged in there would run against a
     half-assembled shell. */
  const sites = NAMES.map((m) => factorySite(m)[0].i).sort((a, b) => a - b);
  for (let i = sites[0]; i <= sites[sites.length - 1]; i++) {
    const s = STMTS[i];
    const ok = s.type === 'FunctionDeclaration'   /* a shim: hoisted, runs nothing */
      || (s.type === 'VariableDeclaration' && s.declarations.every((d) => isModulesCall(d.init, null)))
      || (s.type === 'ExpressionStatement' && isModulesCall(s.expression, null));   /* a factory that publishes on window instead of returning */
    assert.ok(ok, `statement ${i} (line ${s.loc.start.line}) sits inside the factory block but is neither a factory binding nor a shim`);
  }
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

test('R168 #8 no module body came back inline, and the stylesheet stays in css/', () => {
  /* (#R795) THE LINE CEILING IS GONE. From #R168 to #R465 this test held `lines < N` over the app
     shell, and the paragraph above the number grew by one measurement per round as N moved
     8,200 → 8,600 → 8,300 → 8,200 → 7,950 → 8,000 → 8,020 → 8,050 (the history is in git and in
     DEV-NOTES). What it produced in the end was not a smaller program: eleven `import` lines in
     src/main.js folded two to five modules each onto one line "for the shell budget", switch
     cases folded the same way in js/lazy-modules.js, and every round's note said the shell was at
     N−1. A count of LINES cannot tell a feature that moved out from a line that was joined to its
     neighbour, so it had stopped measuring what it was for. What it was for is measured directly:
       · what the browser must fetch and evaluate before the map is usable — `npm run check:perf`
         (scripts/perf-budget.mjs) ratchets the EAGER bytes and module count both ways, in CI, from
         the build itself;
       · how much of the program reaches through one shared object — `npm run check:surface`
         (scripts/global-surface.mjs) ratchets the IM_HOST members and the window.* names the
         program publishes, shrink-only.
     The two assertions below are the ones this test was always about. */
  assert.ok(!/<style>[\s\S]{4000,}?<\/style>/.test(html), 'the stylesheet stays in css/intmap.css');
  /* A leftover in-page copy of a moved body would WIN over the module (a later function declaration
     overwrites an earlier one). Probe with the longest code lines of EACH module — derived, so a
     module whose body is rewritten keeps being probed for — and require none of them in the shell. */
  const shellCode = code(html);
  for (const m of NAMES) {
    const { file } = MODULES[m];
    const probes = code(rd(file)).split('\n').map((l) => l.trim()).filter((l) => l.length >= 60 && !/^(return|\}|\{)/.test(l))
      .sort((a, b) => b.length - a.length).slice(0, 5);
    assert.ok(probes.length >= 3, file + ' really carries a body to probe for');
    for (const needle of probes) assert.ok(!shellCode.includes(needle), `the shell must not still hold an inline copy of ${file}: ${needle.slice(0, 80)}`);
  }
});
