/* ============================================================================
 *  IntMap · free-identifier check for the split-out files  (#R162)
 * ----------------------------------------------------------------------------
 *  index.html's app code lives inside ONE big DOMContentLoaded closure, so every
 *  top-level `let`/`const`/`function` in it is a closure variable, NOT a global.
 *  When a module is moved into js/*.js it loses that closure — and the failure is
 *  usually SILENT, because this codebase guards soft dependencies with
 *  `typeof X !== 'undefined'` and wraps work in try/catch. A moved module can
 *  therefore keep "working" while quietly skipping a whole branch (that is exactly
 *  how #R162 first broke Area Monitors' radius capture: `radiusItems` became
 *  undefined, so activeArea() silently fell through to "no area selected").
 *
 *  So: parse each js/*.js with a REAL parser, resolve its scopes, and fail if any
 *  free identifier is a name index.html declares at closure top level. Such a name
 *  must be passed in explicitly (a factory parameter or a live host accessor)
 *  instead of being silently inherited.
 *
 *      node scripts/check-split-scope.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Browser + vendor globals that legitimately exist at runtime. */
const GLOBALS = new Set(`globalThis window document navigator location history localStorage sessionStorage console
fetch Promise Math JSON Date Array Object String Number Boolean RegExp Map Set WeakMap WeakSet Symbol Error TypeError
RangeError SyntaxError Intl parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback
cancelIdleCallback queueMicrotask structuredClone Infinity NaN undefined performance crypto CustomEvent Event MouseEvent
KeyboardEvent TouchEvent PointerEvent Image Blob File FileReader URL URLSearchParams Headers Request Response
AbortController FormData XMLHttpRequest WebSocket Worker EventSource IntersectionObserver ResizeObserver MutationObserver PerformanceObserver
DOMParser XMLSerializer TextEncoder TextDecoder Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array
Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array ArrayBuffer DataView BigInt Proxy Reflect Notification
IDBKeyRange indexedDB matchMedia getComputedStyle alert confirm prompt atob btoa caches screen self top parent frames
closest HTMLElement Element Node NodeList Text OffscreenCanvas ImageData CanvasRenderingContext2D WebGLRenderingContext
AudioContext SpeechSynthesisUtterance speechSynthesis isSecureContext devicePixelRatio innerWidth innerHeight scrollX scrollY
CSS Audio Option DOMRect Range getSelection AbortSignal WeakRef SVGElement ClipboardItem escape unescape scrollTo print
ImageBitmap createImageBitmap WebGL2RenderingContext ReadableStream
DecompressionStream CompressionStream scheduler
maplibregl turf topojson mlcontour html2canvas katex supabase sb gtag clarity pmtiles`.split(/\s+/).filter(Boolean));
/* (#R180) `ImageBitmap`/`createImageBitmap` were already used in js/app-body.js's satellite
   protocol (#R178) but only ever inside a `typeof` guard, which this walker does not treat as a
   reference; the Cesium providers use them directly. WebGL2RenderingContext is how the engine
   selector checks whether the second engine can run at all before importing 8 MB of it. */
/* `pmtiles` is loaded on demand from unpkg by the land-cover pack (js/layer-packs.js) and every use
   is guarded by `typeof pmtiles!=='undefined'`, so it is a real vendor global, not a lost closure name. */

/* ── 1. names the app body declares at the closure's TOP level ────────────────
   (#R175) The closure moved: it was the last inline <script> in index.html and it is now
   js/app-body.js, imported last by src/main.js (the Vite entry). Nothing else about this check
   changes — the closure is the same single `window.addEventListener('DOMContentLoaded', …)`
   expression it always was, so it is parsed straight from that file instead of being sliced out
   of the HTML first. Being a module now makes the check MORE important, not less: a module's
   top-level names were never global either. */
function closureTopLevelNames(js) {
  const names = new Set();
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  let fn = null;
  for (const s of ast.body) {
    if (s.type !== 'ExpressionStatement' || s.expression.type !== 'CallExpression') continue;
    const c = s.expression;
    const isDCL = c.callee.type === 'MemberExpression' && c.callee.property.name === 'addEventListener' &&
      c.arguments[0] && c.arguments[0].value === 'DOMContentLoaded';
    if (isDCL && c.arguments[1] && /Function/.test(c.arguments[1].type)) fn = c.arguments[1];
  }
  if (!fn) throw new Error('DOMContentLoaded handler not found in js/app-body.js');
  const stmts = fn.body && fn.body.body ? fn.body.body : [];
  const collectPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => collectPattern(x.value || x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(collectPattern);
    else if (p.type === 'AssignmentPattern') collectPattern(p.left);
    else if (p.type === 'RestElement') collectPattern(p.argument);
  };
  for (const s of stmts) {
    if (s.type === 'VariableDeclaration') s.declarations.forEach((d) => collectPattern(d.id));
    else if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') { if (s.id) names.add(s.id.name); }
  }
  return names;
}

/* ── 2. free identifiers of a standalone script ───────────────────────────── */
/* (#R184) PARSE IT THE WAY IT RUNS. Every js/ file is imported by src/main.js and therefore
   executes as an ES module, but until this round none of them contained an `import`, so parsing
   them as scripts happened to work. js/satellites-live.js imports satellite.js — SGP4 is not
   something to hand-roll — and the check then failed with a PARSE ERROR, which is the check being
   wrong about the program rather than the program being wrong. Script mode is still tried first,
   because it is the stricter reading for the files that are still plain scripts, and module mode is
   the fallback for the ones that are not. */
function parseFile(src, extra) {
  const opts = Object.assign({ ecmaVersion: 'latest' }, extra || {});
  try { return acorn.parse(src, Object.assign({ sourceType: 'script' }, opts)); }
  catch (_) { return acorn.parse(src, Object.assign({ sourceType: 'module' }, opts)); }
}

function freeIdentifiers(src) {
  const ast = parseFile(src, { allowReturnOutsideFunction: true });
  const free = new Map(); // name -> first line
  const scopes = [new Set()];
  const declare = (n) => scopes[scopes.length - 1].add(n);
  const declareVar = (n) => scopes[0].add(n); // approximation: var → outermost of this file
  const known = (n) => scopes.some((s) => s.has(n));

  const pat = (p, fn) => {
    if (!p) return;
    if (p.type === 'Identifier') fn(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => { if (x.type === 'RestElement') pat(x.argument, fn); else { if (x.computed && x.key) walk(x.key); pat(x.value, fn); } });
    else if (p.type === 'ArrayPattern') p.elements.forEach((e) => pat(e, fn));
    else if (p.type === 'AssignmentPattern') { pat(p.left, fn); walk(p.right); }
    else if (p.type === 'RestElement') pat(p.argument, fn);
  };

  // hoist function/var/class declarations of a statement list into the current scope
  const hoist = (body) => {
    for (const s of body || []) {
      if (!s) continue;
      if (s.type === 'FunctionDeclaration' && s.id) declare(s.id.name);
      else if (s.type === 'ClassDeclaration' && s.id) declare(s.id.name);
      else if (s.type === 'VariableDeclaration') s.declarations.forEach((d) => pat(d.id, s.kind === 'var' ? declareVar : declare));
      /* (#R184) an import binding is a declaration — without this, `import * as SAT` makes every
         use of SAT look like a name that resolves to nothing at runtime, which is the exact defect
         this check exists to find and would be a false positive of the loudest kind */
      else if (s.type === 'ImportDeclaration') (s.specifiers || []).forEach((sp) => { if (sp.local) declare(sp.local.name); });
      /* (#R202) `export function f(){}` is an ExportNamedDeclaration WRAPPING the declaration, so a
         scan that only looks for FunctionDeclaration walks straight past it — and then every use of
         `f` inside its own file reads as a name that resolves to nothing. This is #R199's lesson
         (the same node type made a whole category invisible to the seam scanner) in a second place:
         a module that exports two functions and has one call the other tripped this check three
         times over for names declared four lines above the call. Unwrap and hoist. */
      else if (s.type === 'ExportNamedDeclaration' && s.declaration) hoist([s.declaration]);
      else if (s.type === 'ExportDefaultDeclaration' && s.declaration
               && (s.declaration.type === 'FunctionDeclaration' || s.declaration.type === 'ClassDeclaration')
               && s.declaration.id) declare(s.declaration.id.name);
    }
  };

  function fnScope(node) {
    scopes.push(new Set());
    if (node.id && node.type === 'FunctionExpression') declare(node.id.name);
    (node.params || []).forEach((p) => pat(p, declare));
    declare('arguments'); declare('this');
    if (node.body.type === 'BlockStatement') { hoist(node.body.body); node.body.body.forEach(walk); }
    else walk(node.body);
    scopes.pop();
  }

  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    switch (n.type) {
      case 'Identifier':
        if (!known(n.name) && !GLOBALS.has(n.name) && !free.has(n.name)) free.set(n.name, n.loc ? n.loc.start.line : 0);
        return;
      case 'MemberExpression':
        walk(n.object); if (n.computed) walk(n.property); return;
      case 'Property':
        if (n.computed) walk(n.key); walk(n.value); return;
      /* (#R180) `case 'A' | 'B':` is a BITWISE OR OF TWO STRINGS, i.e. `case 0:` — this arm has
         never matched anything. It was dormant because no file in js/ used `class` until the
         Cesium adapter needed one for Cesium's provider interfaces; the moment one did, every
         method NAME was walked as an identifier reference and reported as a lost closure
         variable (104 of them). The same lesson as #R178's regex and #R179's AST: a check that
         has never fired is not a check that passes. */
      case 'MethodDefinition': case 'PropertyDefinition':
        if (n.computed) walk(n.key); walk(n.value); return;
      case 'ClassBody':
        n.body.forEach(walk); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        fnScope(n); return;
      case 'BlockStatement':
        scopes.push(new Set()); hoist(n.body); n.body.forEach(walk); scopes.pop(); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement':
        scopes.push(new Set());
        if (n.init) { if (n.init.type === 'VariableDeclaration') { n.init.declarations.forEach((d) => pat(d.id, declare)); n.init.declarations.forEach((d) => walk(d.init)); } else walk(n.init); }
        if (n.left) { if (n.left.type === 'VariableDeclaration') n.left.declarations.forEach((d) => pat(d.id, declare)); else walk(n.left); }
        walk(n.right); walk(n.test); walk(n.update); walk(n.body);
        scopes.pop(); return;
      case 'CatchClause':
        scopes.push(new Set()); if (n.param) pat(n.param, declare); hoist(n.body.body); n.body.body.forEach(walk); scopes.pop(); return;
      case 'VariableDeclaration':
        n.declarations.forEach((d) => { pat(d.id, n.kind === 'var' ? declareVar : declare); walk(d.init); }); return;
      case 'ClassDeclaration': case 'ClassExpression':
        if (n.id) declare(n.id.name); walk(n.superClass); walk(n.body); return;
      case 'LabeledStatement': walk(n.body); return;
      case 'BreakStatement': case 'ContinueStatement': return;
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k]); }
  }

  hoist(ast.body); ast.body.forEach(walk);
  return free;
}

/* ── 3. (#R163) names that are DEAD in the original too ───────────────────────
 *  index.html has a handful of `typeof X !== 'undefined'` guards whose X was ALREADY
 *  unreachable before any split: it is declared inside a SIBLING IIFE, so the block that
 *  reads it never had it in scope. Moving such a block into js/ changes nothing — the
 *  reference resolves to nothing in both places — but the check below would otherwise
 *  report it as a new hole. Each entry is verified against the pre-split file and must say
 *  where the name really lives. Do NOT add to this list to silence a genuine dependency.
 */
const KNOWN_DEAD = new Map([
  ['js/compare.js:layerDates',        'declared inside the layers IIFE ("const layerDates=", since #R164 in js/data-layers.js) — never in IntMapCompare\'s scope, before or after the splits. The guard falls back to the literal dates. Live value is window._imLayerDates.'],
  ['js/time-borders.js:whenStyleReady', 'declared inside the layers IIFE ("function whenStyleReady()", since #R164 in js/data-layers.js) — never in IntMapTimeBorders\' scope, before or after the splits, so the #R140 style-ready retry has never actually run.'],
  ['js/flight-sim.js:clearHl',        'declared inside the IntMapConsole IIFE (since #R165 in js/atlas-console.js) — never in IntMapFlightSim\'s scope, before or after the splits. The `typeof clearHl==="function"` guard has always been false.'],
  ['js/widgets.js:closeSheet',        'declared inside initMobileUI()\'s scope (index.html "function closeSheet()") — never in the widget board\'s scope, before or after #R164. The `typeof closeSheet==="function"` guard has always been false; the mobile sheet closes through its own handlers instead.'],
  /* (#R166) three more of the same shape, surfaced by the fifth split. All three live inside the
     layers IIFE (js/data-layers.js since #R164) and were referenced from SIBLING top-level IIFEs,
     so they resolved to nothing in index.html too — the split changes nothing about them. */
  ['js/map-ui.js:withCountries',      'declared inside the layers IIFE ("function withCountries(cb)", since #R164 in js/data-layers.js) — never in the label-popup block\'s scope, before or after the splits. The `typeof withCountries==="function"` guard has always been false, so the popup always takes the plain `fill()` path.'],
  ['js/map-ui.js:opacities',          'declared inside the layers IIFE ("const opacities={…}", since #R164 in js/data-layers.js) — never in the layer-presets block\'s scope, before or after the splits. Both reads sit in try/catch, so the ReferenceError is swallowed: a saved preset has always stored an EMPTY opacity map. Real bug, but a pre-existing one; fixing it would change behaviour and belongs in its own round.'],
  ['js/map-ui.js:setLayerOpacity',    'declared inside the layers IIFE ("function setLayerOpacity(id,v)", since #R164 in js/data-layers.js) — never in the layer-presets block\'s scope. It is only reached through `p.ops`, which is always empty for the reason above, so the call never ran.'],
]);

/* ── 3b. (#R163) nothing inside a module may shadow the HOST parameter ────────
 *  Every split-out module is `window.IntMapModules.x=function(map,HOST){…}` and reads the
 *  index.html closure values as HOST.lang, HOST.countryStats, … A nested binding called HOST
 *  would silently redirect those reads to the wrong object — undefined, no error, feature gone:
 *  the #R162 failure mode again. (#R163 renamed the parameter from H to HOST precisely because
 *  `H` collided with five ordinary locals — Height, Hourly, a step size — across the new files.)
 */
function hostShadows(src) {
  const out = [];
  const ast = parseFile(src, { locations: true });
  const pat = (p, cb) => { if (!p) return;
    if (p.type === 'Identifier') cb(p);
    else if (p.type === 'ObjectPattern') p.properties.forEach((x) => pat(x.value || x.argument, cb));
    else if (p.type === 'ArrayPattern') p.elements.forEach((e) => pat(e, cb));
    else if (p.type === 'AssignmentPattern') pat(p.left, cb);
    else if (p.type === 'RestElement') pat(p.argument, cb); };
  (function walk(n, inFactory) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => walk(x, inFactory)); return; }
    let nowIn = inFactory;
    if (/Function/.test(n.type)) {
      const isFactory = (n.params || []).some((p) => p.type === 'Identifier' && p.name === 'HOST');
      if (isFactory) nowIn = true;
      else if (inFactory) (n.params || []).forEach((p) => pat(p, (id) => { if (id.name === 'HOST') out.push(id.loc.start.line); }));
    }
    if (nowIn && n.type === 'VariableDeclaration') n.declarations.forEach((d) => pat(d.id, (id) => { if (id.name === 'HOST') out.push(id.loc.start.line); }));
    if (nowIn && (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id && n.id.name === 'HOST') out.push(n.id.loc.start.line);
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k], nowIn); }
  })(ast, false);
  return out;
}

/* ── 4. run ───────────────────────────────────────────────────────────────── */
/* (#R175) the app body — the closure every other js/ file must NOT inherit from. It is a js/ file
   itself now, so it is both the source of `closure` and the one file excluded from the sweep. */
const APP_BODY = 'app-body.js';

export function checkSplitScope() {
  const problems = [];
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const bodyPath = join(ROOT, 'js', APP_BODY);
  if (!existsSync(bodyPath)) return [{ file: 'js/' + APP_BODY, msg: 'the app body is missing — scope check cannot run' }];
  const closure = closureTopLevelNames(readFileSync(bodyPath, 'utf8'));
  if (!closure) return [{ file: 'js/' + APP_BODY, msg: 'could not parse the main closure — scope check skipped' }];

  const jsDir = join(ROOT, 'js');
  if (!existsSync(jsDir)) return problems;
  const jsFiles = readdirSync(jsDir).filter((x) => x.endsWith('.js') && x !== APP_BODY).sort();
  /* Everything the app itself publishes as a runtime global, from index.html and from js/. */
  const published = new Set();
  const collectGlobals = (src) => {
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) published.add(m[1]);
    for (const m of src.matchAll(/window\[\s*['"]([^'"]+)['"]\s*\]\s*=(?!=)/g)) published.add(m[1]);
  };
  collectGlobals(html);
  collectGlobals(readFileSync(bodyPath, 'utf8'));   /* (#R175) the body still publishes most of them */
  for (const f of jsFiles) collectGlobals(readFileSync(join(jsDir, f), 'utf8'));

  for (const f of jsFiles) {
    const src = readFileSync(join(jsDir, f), 'utf8');
    let free;
    try { free = freeIdentifiers(src); } catch (e) { problems.push({ file: 'js/' + f, msg: 'parse error: ' + e.message }); continue; }
    for (const line of hostShadows(src)) {
      problems.push({ file: 'js/' + f, msg: `a binding named "HOST" on line ${line} shadows the module's host parameter — every HOST.x read in that scope silently becomes undefined; rename the local` });
    }
    for (const [name, line] of free) {
      if (closure.has(name)) {
        problems.push({ file: 'js/' + f, msg: `free identifier "${name}" (line ${line}) is a closure variable of js/app-body.js — pass it in explicitly; inherited it silently reads as undefined` });
      } else if (!published.has(name) && !KNOWN_DEAD.has(`js/${f}:${name}`)) {
        /* Neither a browser/vendor global, nor a closure top-level name, nor something the app
           ever assigns to window: at runtime this is a bare unresolvable identifier. Usually it
           means the name lives inside ANOTHER IIFE and the reference is (or has become) dead. */
        problems.push({ file: 'js/' + f, msg: `free identifier "${name}" (line ${line}) resolves to nothing at runtime — it is not a browser global, not a closure top-level name, and the app never assigns window.${name}` });
      }
    }
  }
  return problems;
}

if (process.argv[1] && process.argv[1].endsWith('check-split-scope.mjs')) {
  const p = checkSplitScope();
  if (!p.length) { console.log('split-scope check: OK — no js/*.js file depends on an index.html closure variable'); process.exit(0); }
  for (const x of p) console.error(`  · ${x.file}: ${x.msg}`);
  console.error(`\nsplit-scope check FAILED (${p.length})`);
  process.exit(1);
}
