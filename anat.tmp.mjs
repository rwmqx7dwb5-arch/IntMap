/* Extraction-surface measurement.
 *   node anat.tmp.mjs <file> members            → member map of the biggest function body
 *   node anat.tmp.mjs <file> surface A-B[,C-D]  → in/out surface of those member ranges
 */
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

const file = process.argv[2];
const mode = process.argv[3] || 'members';
const src = readFileSync(file, 'utf8');
let ast;
try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
catch (_) { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }

const L = (n) => `${n.loc.start.line}-${n.loc.end.line}`;
const span = (n) => n.loc.end.line - n.loc.start.line + 1;

function label(s) {
  if (s.type === 'FunctionDeclaration') return `function ${s.id ? s.id.name : '?'}`;
  if (s.type === 'ClassDeclaration') return `class ${s.id ? s.id.name : '?'}`;
  if (s.type === 'VariableDeclaration') return `${s.kind} ${s.declarations.map(d => d.id.name || '{…}').join(',')}`;
  if (s.type === 'ExpressionStatement') {
    const e = s.expression;
    if (e.type === 'AssignmentExpression') return `${src.slice(e.left.start, e.left.end).slice(0, 70)} = …`;
    if (e.type === 'CallExpression') {
      const c = e.callee;
      if (/Function/.test(c.type)) return 'IIFE';
      return `call ${src.slice(c.start, Math.min(c.end, c.start + 60))}(…)`;
    }
  }
  if (s.type === 'ReturnStatement') return 'return …';
  return s.type;
}

function deepestBody(node) {
  let best = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (/Function/.test(n.type) && n.body && n.body.type === 'BlockStatement') {
      const b = n.body.body;
      if (b.length > 12 && (!best || span(n) > span(best.fn))) best = { fn: n, body: b };
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k]); }
  })(node);
  return best;
}

const target = deepestBody(ast);

if (mode === 'members') {
  console.log(`== ${file}: ${src.split('\n').length} lines · body [${L(target.fn)}] · ${target.body.length} members ==`);
  for (const s of target.body) console.log(`  [${L(s)}] (${span(s)}) ${label(s)}`);
  process.exit(0);
}

/* ---- surface mode ---- */
const ranges = (process.argv[4] || '').split(',').filter(Boolean).map(r => r.split('-').map(Number));
const inRange = (ln) => ranges.some(([a, b]) => ln >= a && ln <= b);

/* names each top-level member of the body declares */
function declaredBy(s) {
  const out = [];
  const pat = (p) => { if (!p) return;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(x => pat(x.value || x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(pat);
    else if (p.type === 'AssignmentPattern') pat(p.left);
    else if (p.type === 'RestElement') pat(p.argument); };
  if (s.type === 'VariableDeclaration') s.declarations.forEach(d => pat(d.id));
  else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) out.push(s.id.name);
  return out;
}

const declMove = new Set(), declStay = new Set();
for (const s of target.body) {
  const set = inRange(s.loc.start.line) ? declMove : declStay;
  for (const n of declaredBy(s)) set.add(n);
}

/* identifier references, tagged by whether the reference site is inside the moved range,
   skipping references that resolve to a binding local to some nested scope. */
function refs(node) {
  const found = []; // {name, line}
  const scopes = [new Set()];
  const declare = (n) => scopes[scopes.length - 1].add(n);
  const known = (n) => scopes.some(s => s.has(n));
  const pat = (p, fn) => { if (!p) return;
    if (p.type === 'Identifier') fn(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(x => { if (x.type === 'RestElement') pat(x.argument, fn); else { if (x.computed && x.key) walk(x.key); pat(x.value, fn); } });
    else if (p.type === 'ArrayPattern') p.elements.forEach(e => pat(e, fn));
    else if (p.type === 'AssignmentPattern') { pat(p.left, fn); walk(p.right); }
    else if (p.type === 'RestElement') pat(p.argument, fn); };
  const hoist = (body) => { for (const s of body || []) { if (!s) continue;
    if (s.type === 'FunctionDeclaration' && s.id) declare(s.id.name);
    else if (s.type === 'ClassDeclaration' && s.id) declare(s.id.name);
    else if (s.type === 'VariableDeclaration') s.declarations.forEach(d => pat(d.id, declare)); } };
  function fnScope(n) { scopes.push(new Set());
    if (n.id && n.type === 'FunctionExpression') declare(n.id.name);
    (n.params || []).forEach(p => pat(p, declare));
    declare('arguments'); declare('this');
    if (n.body.type === 'BlockStatement') { hoist(n.body.body); n.body.body.forEach(walk); } else walk(n.body);
    scopes.pop(); }
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    switch (n.type) {
      case 'Identifier': if (!known(n.name)) found.push({ name: n.name, line: n.loc.start.line, w: !!n._w }); return;
      case 'AssignmentExpression':
        if (n.left.type === 'Identifier') n.left._w = true;
        walk(n.left); walk(n.right); return;
      case 'UpdateExpression':
        if (n.argument.type === 'Identifier') n.argument._w = true;
        walk(n.argument); return;
      case 'MemberExpression': walk(n.object); if (n.computed) walk(n.property); return;
      case 'Property': if (n.computed) walk(n.key); walk(n.value); return;
      case 'MethodDefinition': case 'PropertyDefinition': if (n.computed) walk(n.key); walk(n.value); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fnScope(n); return;
      case 'BlockStatement': scopes.push(new Set()); hoist(n.body); n.body.forEach(walk); scopes.pop(); return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': scopes.push(new Set());
        if (n.init) { if (n.init.type === 'VariableDeclaration') { n.init.declarations.forEach(d => pat(d.id, declare)); n.init.declarations.forEach(d => walk(d.init)); } else walk(n.init); }
        if (n.left) { if (n.left.type === 'VariableDeclaration') n.left.declarations.forEach(d => pat(d.id, declare)); else walk(n.left); }
        walk(n.right); walk(n.test); walk(n.update); walk(n.body); scopes.pop(); return;
      case 'CatchClause': scopes.push(new Set()); if (n.param) pat(n.param, declare); hoist(n.body.body); n.body.body.forEach(walk); scopes.pop(); return;
      case 'VariableDeclaration': n.declarations.forEach(d => { pat(d.id, declare); walk(d.init); }); return;
      case 'ClassDeclaration': case 'ClassExpression': if (n.id) declare(n.id.name); walk(n.superClass); walk(n.body); return;
      case 'LabeledStatement': walk(n.body); return;
      case 'BreakStatement': case 'ContinueStatement': return;
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k]); }
  }
  walk(node);
  return found;
}

/* Measure each member ALONE, with an empty scope stack, so every reference to a
   sibling top-level name of the body shows up as free (that is the surface). */
const all = [];
for (const s of target.body) all.push(...refs(s));
const inbound = new Map();   // moved code → names it needs from the code that stays
const outbound = new Map();  // staying code → names it needs from the moved code
const bump = (m, r) => { if (!m.has(r.name)) m.set(r.name, { line: r.line, w: false, n: 0 }); const e = m.get(r.name); e.n++; if (r.w) e.w = true; };
for (const r of all) {
  const here = inRange(r.line);
  if (here && declStay.has(r.name)) bump(inbound, r);
  if (!here && declMove.has(r.name)) bump(outbound, r);
}
const moved = target.body.filter(s => inRange(s.loc.start.line)).reduce((a, s) => a + span(s), 0);
console.log(`ranges ${process.argv[4]} → ${moved} lines of members move`);
const show = (m) => [...m].sort().map(([n, e]) => `  ${e.w ? 'RW' : 'r '} ${n}  (${e.n}×, first line ${e.line})`).join('\n');
console.log(`\nINBOUND (moved code uses ${inbound.size} names that stay behind):\n` + show(inbound));
console.log(`\nOUTBOUND (${outbound.size} moved names are used by code that stays):\n` + show(outbound));
