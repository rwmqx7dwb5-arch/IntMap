#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DECOUPLING, SECOND PASS — the shapes the first pass would not guess
 * ----------------------------------------------------------------------------
 *  scripts/decouple-codemod.mjs rewrites calls that are 1:1. What it deliberately
 *  refuses is anything whose meaning spans more than one expression, which after
 *  the first pass is almost entirely one idiom:
 *
 *      const s = map.getSource(ID);  if (s) s.setData(X);
 *
 *  — a source HANDLE, fetched only to write to. That is `layers.setSourceData`,
 *  but only a two-statement rule can see it. The other residue is existence
 *  GUARDS (`map && map.on`, `map.getLayer && …`, `if (map.dragRotate)`) that the
 *  contract makes redundant, since every contract method already answers safely
 *  when there is no renderer.
 *
 *  Same discipline as the first pass: parse, rewrite only proven shapes, report
 *  the rest. Run with --write; without it, it lists.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const patNames = (p, out) => { if (!p) return;
  if (p.type === 'Identifier') out.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => patNames(q.value || q.argument, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => patNames(e, out));
  else if (p.type === 'AssignmentPattern') patNames(p.left, out);
  else if (p.type === 'RestElement') patNames(p.argument, out); };

export function transform(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const edits = [];
  const shadowed = new Set();
  const parent = new Map();
  (function link(n, p) { if (!n || typeof n.type !== 'string') return; parent.set(n, p);
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && link(c, n));
      else if (v && typeof v.type === 'string') link(v, n); } })(ast, null);
  (function scopes(n, d0) { if (!n || typeof n.type !== 'string') return;
    const isFn = FN.has(n.type), d = d0 + (isFn ? 1 : 0);
    if (d >= 2 && (isFn || n.type === 'BlockStatement')) {
      const names = new Set();
      if (isFn) { n.params.forEach(p => patNames(p, names)); if (n.id) names.add(n.id.name); }
      const body = n.type === 'BlockStatement' ? n.body : (n.body && n.body.type === 'BlockStatement' ? n.body.body : null);
      if (Array.isArray(body)) body.forEach(st => {
        if (st.type === 'VariableDeclaration') st.declarations.forEach(x => patNames(x.id, names));
        if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) names.add(st.id.name); });
      if (names.has('map')) shadowed.add(n);
    }
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && scopes(c, d));
      else if (v && typeof v.type === 'string') scopes(v, d); } })(ast, 0);
  const inShadow = n => { let p = n; while (p) { if (shadowed.has(p)) return true; p = parent.get(p); } return false; };
  const isMap = n => n && n.type === 'Identifier' && n.name === 'map' && !inShadow(n);
  const txt = n => src.slice(n.start, n.end);
  const push = (a, b, t) => edits.push({ start: a, end: b, text: t });
  const isGetSource = n => n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' &&
        isMap(n.callee.object) && n.callee.property.name === 'getSource';

  /* ── ① the handle idiom, over two statements in the same block ───────────── */
  const scanBlock = list => {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (a.type !== 'VariableDeclaration' || a.declarations.length !== 1) continue;
      const d = a.declarations[0];
      if (!d.id || d.id.type !== 'Identifier' || !isGetSource(d.init)) continue;
      const name = d.id.name;
      if (b.type !== 'IfStatement') continue;
      /* the test must be nothing but "the handle exists" */
      const t = b.test;
      const testsHandle = (t.type === 'Identifier' && t.name === name) ||
        (t.type === 'LogicalExpression' && t.operator === '&&' && t.left.type === 'Identifier' && t.left.name === name &&
         t.right.type === 'MemberExpression' && t.right.object.type === 'Identifier' && t.right.object.name === name);
      if (!testsHandle || b.alternate) continue;
      /* …and the body must be exactly one `handle.setData(x)` / `.updateImage(x)` */
      let body = b.consequent;
      if (body.type === 'BlockStatement') { if (body.body.length !== 1) continue; body = body.body[0]; }
      if (body.type !== 'ExpressionStatement') continue;
      const c = body.expression;
      if (c.type !== 'CallExpression' || c.callee.type !== 'MemberExpression') continue;
      if (c.callee.object.type !== 'Identifier' || c.callee.object.name !== name) continue;
      const meth = c.callee.property.name;
      if (meth !== 'setData' && meth !== 'updateImage') continue;
      const id = txt(d.init.arguments[0]);
      const arg = c.arguments.length ? src.slice(c.arguments[0].start, c.arguments[c.arguments.length - 1].end) : '';
      const fn = meth === 'setData' ? 'setSourceData' : 'updateImage';
      push(a.start, b.end, `GE().layers.${fn}(${id},${arg});`);
    }
  };
  (function walkBlocks(n) { if (!n || typeof n.type !== 'string') return;
    if (Array.isArray(n.body) && (n.type === 'BlockStatement' || n.type === 'Program')) scanBlock(n.body);
    if (n.type === 'SwitchCase' && Array.isArray(n.consequent)) scanBlock(n.consequent);
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walkBlocks(c));
      else if (v && typeof v.type === 'string') walkBlocks(v); } })(ast);

  /* ── ② existence guards the contract makes redundant ─────────────────────── */
  (function guards(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'LogicalExpression' && n.operator === '&&') {
      /* `map.<anything> && REST`  or  `map && REST` → REST */
      const bare = isMap(n.left) ||
        (n.left.type === 'MemberExpression' && isMap(n.left.object) && !n.left.computed) ||
        (n.left.type === 'LogicalExpression' && n.left.operator === '&&' &&
         (isMap(n.left.left) || (n.left.left.type === 'MemberExpression' && isMap(n.left.left.object))) &&
         (n.left.right.type === 'MemberExpression' && isMap(n.left.right.object)));
      if (bare) {
        /* only when the RIGHT side no longer mentions the raw handle — otherwise this is a real use */
        if (!/\bmap\s*[.[]/.test(txt(n.right))) push(n.start, n.end, txt(n.right));
      }
    }
    for (const k in n) { if (k === 'loc') continue; const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && guards(c));
      else if (v && typeof v.type === 'string') guards(v); } })(ast);

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src, last = Infinity, applied = 0;
  for (const e of edits) { if (e.end > last) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end); last = e.start; applied++; }
  return { code: out, applied };
}

const write = process.argv.includes('--write');
const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'geo-engine.js').map(f => 'js/' + f);
let total = 0;
for (const rel of files) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  let r; try { r = transform(src); } catch (e) { console.error(`  PARSE ${rel}: ${e.message}`); continue; }
  if (!r.applied) continue;
  console.log(`${rel}: ${r.applied}`);
  total += r.applied;
  if (write) fs.writeFileSync(file, r.code);
}
console.log(`\n${write ? 'rewrote' : 'would rewrite'} ${total}`);
