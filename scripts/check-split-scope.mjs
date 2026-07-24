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
AbortController FormData XMLHttpRequest WebSocket Worker EventSource IntersectionObserver ResizeObserver MutationObserver
DOMParser XMLSerializer TextEncoder TextDecoder Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array
Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array ArrayBuffer DataView BigInt Proxy Reflect Notification
IDBKeyRange indexedDB matchMedia getComputedStyle alert confirm prompt atob btoa caches screen self top parent frames
closest HTMLElement Element Node NodeList Text OffscreenCanvas ImageData CanvasRenderingContext2D WebGLRenderingContext
AudioContext SpeechSynthesisUtterance speechSynthesis isSecureContext devicePixelRatio innerWidth innerHeight scrollX scrollY
maplibregl turf topojson mlcontour html2canvas katex supabase sb gtag clarity`.split(/\s+/).filter(Boolean));

/* ── 1. names index.html declares at the closure's TOP level ──────────────── */
function closureTopLevelNames(html) {
  const names = new Set();
  // Find the <script> block that holds the main closure and parse it as a whole program,
  // then pick out the DOMContentLoaded handler — far more robust than slicing text.
  const marker = html.lastIndexOf("window.addEventListener('DOMContentLoaded'");
  if (marker < 0) throw new Error('main DOMContentLoaded closure not found in index.html');
  const open = html.lastIndexOf('<script>', marker);
  const close = html.indexOf('</script>', marker);
  if (open < 0 || close < 0) throw new Error('could not delimit the main <script> block');
  const js = html.slice(open + '<script>'.length, close);

  const ast = acorn.parse(js, { ecmaVersion: 'latest' });
  let fn = null;
  for (const s of ast.body) {
    if (s.type !== 'ExpressionStatement' || s.expression.type !== 'CallExpression') continue;
    const c = s.expression;
    const isDCL = c.callee.type === 'MemberExpression' && c.callee.property.name === 'addEventListener' &&
      c.arguments[0] && c.arguments[0].value === 'DOMContentLoaded';
    if (isDCL && c.arguments[1] && /Function/.test(c.arguments[1].type)) fn = c.arguments[1];
  }
  if (!fn) throw new Error('DOMContentLoaded handler not found in the main script block');
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
function freeIdentifiers(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
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
      case 'MethodDefinition' | 'PropertyDefinition':
        if (n.computed) walk(n.key); walk(n.value); return;
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

/* ── 3. run ───────────────────────────────────────────────────────────────── */
export function checkSplitScope() {
  const problems = [];
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const closure = closureTopLevelNames(html);
  if (!closure) return [{ file: 'index.html', msg: 'could not parse the main closure — scope check skipped' }];

  const jsDir = join(ROOT, 'js');
  if (!existsSync(jsDir)) return problems;
  for (const f of readdirSync(jsDir).filter((x) => x.endsWith('.js')).sort()) {
    const src = readFileSync(join(jsDir, f), 'utf8');
    let free;
    try { free = freeIdentifiers(acorn.parse ? src : src); } catch (e) { problems.push({ file: 'js/' + f, msg: 'parse error: ' + e.message }); continue; }
    for (const [name, line] of free) {
      if (closure.has(name)) problems.push({ file: 'js/' + f, msg: `free identifier "${name}" (line ${line}) is a closure variable of index.html — pass it in explicitly; inherited it silently reads as undefined` });
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
