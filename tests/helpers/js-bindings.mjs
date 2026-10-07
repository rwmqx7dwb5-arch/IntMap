/* ============================================================================
 *  tests/helpers/js-bindings.mjs — what a NAME in js/ is bound to, not what it is spelled   (relay-entry-by-binding)
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS EXISTS FOR: tests/own-fetch-relay-checks matched a call to an entry point by the
 *  callee's SPELLING (an identifier, or the property name of any member expression). One function in
 *  js/where-when.js named `indexOf` handed its first parameter to a relay entry, and from then on every
 *  `x.indexOf(…)` in js/ was an entry too: ENTRIES grew 460 → 764 and the partial evaluator behind it
 *  ran a CI shard past an hour (PR #1029). Even on main, `set`, `every`, `add`, `push` and `apply` were
 *  entries — not because anything bound to them reached a relay, but because something SPELLED so did.
 *
 *  So a call is resolved to the function VALUES its callee can hold:
 *    an identifier        → its declaration by lexical scope (block, function, hoisted var, catch, for,
 *                           class), then across files through the `import` edge to the exporting module
 *                           (named, default, namespace, re-export, `export *`);
 *    a member `o.p`       → only when `o` is itself a value we know: an imported namespace, an object
 *                           literal (its property, shorthand, method, getter or spread; and `o.p = v`
 *                           written to THAT object anywhere), or the global object (`window.p = v`,
 *                           and a free identifier is a global). A member of anything else — a string,
 *                           an array, a Map, an unknown parameter — resolves to nothing. That is the
 *                           whole point: `arr.indexOf` is not a call of anybody's function `indexOf`.
 *    a parameter          → the matching argument at every call site whose callee resolves to the
 *                           function (dependency injection: `makeAtlasSources(HOST, { _fetchJSON })`
 *                           and then `CTX._fetchJSON(url)`), solved to a fixpoint over the program;
 *    a call               → what the callee returns (factories: `makeFetchJSON()` returns `_fetchJSON`);
 *                           `f.bind(x)` is `f`; `Object.freeze(o)` is `o`;
 *    `o[k]`, k unknown    → every property of `o` when `o` is an object literal we know (the object is
 *                           bound, only the key is not: js/lazy-modules.js's `R[name].load()`);
 *    `import('./x.js')`   → the namespace of x.js; a promise is followed as the value it settles to
 *                           (as `await` is), and `p.then(cb)` hands that value to cb's first parameter.
 *                           ⚠ `then` is the Promise protocol, not a function anybody in js/ declared: it
 *                           only carries a value we already know, it never makes a call reach a function.
 *
 *  It is deliberately an under-approximation: a value that flows through something it does not model
 *  (an array, a Map, a computed member of an unknown value) resolves to nothing, and a value read
 *  inside a cycle (a function returning its own call) keeps what was known when the cycle was cut.
 *  Callers that need coverage measure it separately (own-fetch-relay ① asserts every relay has a
 *  caller found here, ⓪ that the hand-checked entries are).
 *
 *    bindProgram(files: [{ f, ast }]) → {
 *      valuesOf(expr)   → [value]   value = a function node | an ObjectExpression | { ns: file } | GLOBAL
 *      fnsOf(call)      → [function node]   the functions a CallExpression may call
 *      lookup(ident)    → declaration record | null (a global)
 *      exportValues(file, name) → [value]
 *      callSitesOf(fn)  → [CallExpression]   every call whose callee resolves to fn
 *      calls            → every CallExpression, with .file
 *    }
 *  Each file's AST must carry `parent` links (linkParents below).
 * ==========================================================================*/
import { posix } from 'node:path';

export const GLOBAL = Object.freeze({ global: true });
const isFn = (n) => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const GLOBAL_NAMES = new Set(['window', 'globalThis', 'self']);

export function linkParents(ast) {
  (function link(n, p) {
    if (!n || typeof n.type !== 'string') return;
    n.parent = p;
    for (const k of Object.keys(n)) {
      if (k === 'parent') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => link(c, n));
      else if (v && typeof v.type === 'string') link(v, n);
    }
  })(ast, null);
  return ast;
}

const keyName = (p) => (p.computed ? (p.key.type === 'Literal' ? String(p.key.value) : null)
  : p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null);

export function bindProgram(files) {
  const byFile = new Map(files.map((x) => [x.f, x]));
  const fileOf = new Map();               /* Program node → file */
  for (const x of files) fileOf.set(x.ast, x.f);
  const programOf = (n) => { while (n.parent) n = n.parent; return n; };

  /* ── scopes ─────────────────────────────────────────────────────────────────────────────── */
  const SCOPES = new Map();               /* scope node → Map(name → record) */
  function patternNames(p, mk, path, add) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': add(p.name, mk(path)); break;
      case 'ObjectPattern':
        for (const pr of p.properties) {
          if (pr.type === 'RestElement') patternNames(pr.argument, mk, [...path, null], add);
          else patternNames(pr.value, mk, [...path, keyName(pr)], add);
        }
        break;
      case 'ArrayPattern': p.elements.forEach((e) => patternNames(e, mk, [...path, null], add)); break;
      case 'AssignmentPattern': patternNames(p.left, mk, path, add); break;
      case 'RestElement': patternNames(p.argument, mk, [...path, null], add); break;
      default: break;
    }
  }
  function declareStatement(s, add, alsoVar) {
    if (!s) return;
    if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') && s.declaration) s = s.declaration;
    if (s.type === 'VariableDeclaration' && (s.kind !== 'var' || alsoVar)) {
      for (const d of s.declarations) patternNames(d.id, (path) => ({ kind: 'var', decl: d, path }), [], add);
    } else if (s.type === 'FunctionDeclaration' && s.id) add(s.id.name, { kind: 'fn', node: s });
    else if (s.type === 'ClassDeclaration' && s.id) add(s.id.name, { kind: 'opaque', node: s });
    else if (s.type === 'ImportDeclaration') {
      const from = resolveImport(programOf(s), s.source.value);
      for (const sp of s.specifiers) {
        const imported = sp.type === 'ImportNamespaceSpecifier' ? '*' : sp.type === 'ImportDefaultSpecifier' ? 'default'
          : (sp.imported.type === 'Identifier' ? sp.imported.name : String(sp.imported.value));
        add(sp.local.name, { kind: 'import', file: from, imported });
      }
    }
  }
  function hoistedVars(owner, add) {
    for (const d of OWNED.get(owner)?.vars || []) patternNames(d.id, (path) => ({ kind: 'var', decl: d, path }), [], add);
  }
  function scopeOf(node) {
    if (SCOPES.has(node)) return SCOPES.get(node);
    const m = new Map();
    const add = (name, rec) => { if (!m.has(name)) m.set(name, rec); };
    switch (node.type) {
      case 'Program':
        for (const s of node.body) declareStatement(s, add, true);
        hoistedVars(node, add);
        break;
      case 'BlockStatement': case 'StaticBlock':
        for (const s of node.body) declareStatement(s, add, false);
        break;
      case 'SwitchStatement':
        for (const c of node.cases) for (const s of c.consequent) declareStatement(s, add, false);
        break;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const d = node.type === 'ForStatement' ? node.init : node.left;
        if (d && d.type === 'VariableDeclaration') declareStatement(d, add, true);
        break;
      }
      case 'CatchClause': if (node.param) patternNames(node.param, () => ({ kind: 'opaque', node }), [], add); break;
      case 'ClassExpression': case 'ClassDeclaration': if (node.id) add(node.id.name, { kind: 'opaque', node }); break;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        node.params.forEach((p, index) => patternNames(p, (path) => ({ kind: 'param', fn: node, index, path }), [], add));
        if (node.type === 'FunctionExpression' && node.id) add(node.id.name, { kind: 'fn', node });
        hoistedVars(node, add);
        break;
      default: break;
    }
    SCOPES.set(node, m);
    return m;
  }
  const SCOPE_TYPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchStatement', 'ForStatement', 'ForInStatement',
    'ForOfStatement', 'CatchClause', 'ClassExpression', 'ClassDeclaration', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const LOOKUP = new Map();
  function lookup(id) {
    if (LOOKUP.has(id)) return LOOKUP.get(id);
    let found = null;
    for (let p = id.parent; p && !found; p = p.parent) if (SCOPE_TYPES.has(p.type)) found = scopeOf(p).get(id.name) || null;
    LOOKUP.set(id, found);
    return found;
  }

  /* ── modules ────────────────────────────────────────────────────────────────────────────── */
  function resolveImport(program, spec) {
    const f = fileOf.get(program);
    if (!f || typeof spec !== 'string' || !spec.startsWith('.')) return null;
    const p = posix.normalize(posix.join(posix.dirname(f), spec));
    return byFile.has(p) ? p : null;
  }
  const EXPORTS = new Map();
  function exportsOf(file) {
    if (EXPORTS.has(file)) return EXPORTS.get(file);
    const ast = byFile.get(file).ast;
    const named = new Map(), stars = [];
    for (const s of ast.body) {
      if (s.type === 'ExportNamedDeclaration') {
        if (s.declaration) declareStatement(s.declaration, (name, rec) => named.set(name, rec), true);
        for (const sp of s.specifiers || []) {
          const local = sp.local.type === 'Identifier' ? sp.local.name : String(sp.local.value);
          const exported = sp.exported.type === 'Identifier' ? sp.exported.name : String(sp.exported.value);
          named.set(exported, s.source ? { kind: 'import', file: resolveImport(ast, s.source.value), imported: local }
            : (scopeOf(ast).get(local) || { kind: 'opaque' }));
        }
      } else if (s.type === 'ExportDefaultDeclaration') {
        const d = s.declaration;
        named.set('default', isFn(d) ? { kind: 'fn', node: d } : { kind: 'expr', node: d });
      } else if (s.type === 'ExportAllDeclaration') {
        const from = resolveImport(ast, s.source.value);
        if (s.exported) named.set(s.exported.type === 'Identifier' ? s.exported.name : String(s.exported.value), { kind: 'import', file: from, imported: '*' });
        else if (from) stars.push(from);
      }
    }
    const out = { named, stars };
    EXPORTS.set(file, out);
    return out;
  }

  /* ── indices over the whole program ──────────────────────────────────────────────────────── */
  const calls = [];
  const thens = [];                        /* `p.then(cb)` — cb's first parameter is what p settles to */
  const OWNED = new Map();                 /* function | Program → { returns: [expr], vars: [declarator] }  (not into nested functions) */
  const owned = (o) => { if (!OWNED.has(o)) OWNED.set(o, { returns: [], vars: [] }); return OWNED.get(o); };
  const memberWrites = new Map();          /* property → [{ object, rhs }]      `o.p = rhs` */
  const identWrites = new Map();           /* name → [{ id, rhs }]              `x = rhs` */
  for (const { f, ast } of files) {
    const owners = [ast];
    (function go(n) {
      if (!n || typeof n.type !== 'string') return;
      const own = isFn(n);
      const o = owners[owners.length - 1];
      if (n.type === 'ReturnStatement' && n.argument) owned(o).returns.push(n.argument);
      if (n.type === 'VariableDeclaration' && n.kind === 'var') owned(o).vars.push(...n.declarations);
      visit(n);
      if (own) owners.push(n);
      for (const k of Object.keys(n)) {
        if (k === 'parent') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v);
      }
      if (own) owners.pop();
    })(ast);
    function visit(n) {
      if (n.type === 'CallExpression') {
        n.file = f; calls.push(n);
        const c = n.callee;
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'then' && n.arguments[0]) thens.push(n);
      }
      if (n.type === 'AssignmentExpression' && n.operator === '=') {
        const l = n.left;
        if (l.type === 'MemberExpression') {
          const k = l.computed ? (l.property.type === 'Literal' ? String(l.property.value) : null) : l.property.name;
          if (k != null) { if (!memberWrites.has(k)) memberWrites.set(k, []); memberWrites.get(k).push({ object: l.object, rhs: n.right }); }
        } else if (l.type === 'Identifier') {
          if (!identWrites.has(l.name)) identWrites.set(l.name, []);
          identWrites.get(l.name).push({ id: l, rhs: n.right });
        }
      }
    }
  }

  /* `x = rhs`, grouped by the declaration x resolves to (resolved once, on first need) */
  let WRITES = null;
  function writesTo(r) {
    if (!WRITES) {
      WRITES = new Map();
      for (const ws of identWrites.values()) for (const w of ws) {
        const d = lookup(w.id);
        if (!d) continue;
        if (!WRITES.has(d)) WRITES.set(d, []);
        WRITES.get(d).push(w.rhs);
      }
    }
    return WRITES.get(r) || [];
  }

  /* ── values ─────────────────────────────────────────────────────────────────────────────── */
  let callSites = new Map();               /* function node → [call]   (from the previous pass) */
  let MEMO = new Map();
  const busy = new Set();
  const NS = new Map();
  const nsOf = (file) => { if (!NS.has(file)) NS.set(file, Object.freeze({ ns: file })); return NS.get(file); };
  const uniq = (xs) => [...new Set(xs)];

  let paramReads = 0;
  function memo(key, compute, isParam) {
    const hit = MEMO.get(key);
    if (hit) { if (hit.dep) paramReads++; return hit.out; }
    if (busy.has(key)) return [];   /* a cycle: cut it (see below) */
    busy.add(key);
    const reads = paramReads;
    let out;
    try { out = uniq(compute()); } finally { busy.delete(key); }
    if (isParam) paramReads++;
    /* a value computed while a cycle was cut short is kept too (an under-approximation, deterministic);
       not keeping it made the recomputation exponential */
    MEMO.set(key, { out, dep: paramReads !== reads });
    return out;
  }

  function returnsOf(fn) {
    return memo(fn, () => {
      if (fn.body.type !== 'BlockStatement') return valuesOf(fn.body);
      return (OWNED.get(fn)?.returns || []).flatMap(valuesOf);
    });
  }
  function propValues(v, key) {
    if (key == null) return [];
    if (v === GLOBAL) return globalValues(key);
    if (v && v.ns) return exportValues(v.ns, key);
    if (!v || v.type !== 'ObjectExpression') return [];
    return memoProp(v, key);
  }
  function memoProp(obj, key) {
    return memo('prop:' + key + '\u0000' + nodeKey(obj), () => {
      const out = [];
      for (const p of obj.properties) {
        if (p.type === 'SpreadElement') { for (const s of valuesOf(p.argument)) out.push(...propValues(s, key)); continue; }
        if (keyName(p) !== key) continue;
        if (p.kind === 'get') out.push(...returnsOf(p.value));
        else if (p.kind === 'init') out.push(...valuesOf(p.value));
      }
      for (const w of memberWrites.get(key) || []) if (valuesOf(w.object).includes(obj)) out.push(...valuesOf(w.rhs));
      return out;
    });
  }
  const KEYS = new WeakMap(); let nextKey = 0;
  const nodeKey = (n) => { if (!KEYS.has(n)) KEYS.set(n, ++nextKey); return KEYS.get(n); };
  function globalValues(key) {
    return memo('global:' + key, () => {
      const out = [];
      for (const w of memberWrites.get(key) || []) if (valuesOf(w.object).includes(GLOBAL)) out.push(...valuesOf(w.rhs));
      return out;
    });
  }
  function everyProp(v) {
    if (!v || v.type !== 'ObjectExpression') return [];
    return memo('every:' + nodeKey(v), () => {
      const out = [];
      for (const p of v.properties) {
        if (p.type === 'SpreadElement') { out.push(...valuesOf(p.argument).flatMap(everyProp)); continue; }
        if (p.kind === 'get') out.push(...returnsOf(p.value)); else if (p.kind === 'init') out.push(...valuesOf(p.value));
      }
      return out;
    });
  }
  function exportValues(file, name, seen) {
    if (!file || !byFile.has(file)) return [];
    if (name === '*') return [nsOf(file)];
    const s = seen || new Set();
    if (s.has(file)) return [];
    s.add(file);
    const ex = exportsOf(file);
    if (ex.named.has(name)) return recordValues(ex.named.get(name));
    if (name === 'default') return [];
    const out = [];
    for (const from of ex.stars) out.push(...exportValues(from, name, s));
    return uniq(out);
  }
  function along(vals, path) {
    let cur = vals;
    for (const k of path) { cur = uniq(cur.flatMap((v) => propValues(v, k))); if (!cur.length) break; }
    return cur;
  }
  function recordValues(r) {
    if (!r) return [];
    switch (r.kind) {
      case 'fn': return [r.node];
      case 'expr': return valuesOf(r.node);
      case 'import': return exportValues(r.file, r.imported);
      case 'var': return memo(r, () => {
        const base = r.decl.init ? along(valuesOf(r.decl.init), r.path) : [];
        if (r.path.length) return base;
        const out = [...base];
        for (const rhs of writesTo(r)) out.push(...valuesOf(rhs));
        return out;
      });
      case 'param': return memo(r, () => {
        const out = [];
        if (r.index === 0) for (const t of thens) if (valuesOf(t.arguments[0]).includes(r.fn)) out.push(...along(valuesOf(t.callee.object), r.path));
        for (const c of callSites.get(r.fn) || []) {
          const a = c.arguments[r.index];
          if (!a || a.type === 'SpreadElement' || c.arguments.slice(0, r.index).some((x) => x.type === 'SpreadElement')) continue;
          out.push(...along(valuesOf(a), r.path));
        }
        return out;
      }, true);
      default: return [];
    }
  }
  function valuesOf(n) {
    if (!n) return [];
    switch (n.type) {
      case 'FunctionExpression': case 'ArrowFunctionExpression': case 'FunctionDeclaration': return [n];
      case 'ObjectExpression': return [n];
      case 'Identifier': {
        const r = lookup(n);
        if (r) return recordValues(r);
        return GLOBAL_NAMES.has(n.name) ? [GLOBAL] : globalValues(n.name);
      }
      case 'MemberExpression': {
        const k = n.computed ? (n.property.type === 'Literal' ? String(n.property.value) : null) : n.property.name;
        /* `o[k]` with k unknown: every property of an object literal o resolves to — the object is
           bound, only the key is not (js/lazy-modules.js's `R[name].load()`) */
        if (k == null) return memo(n, () => valuesOf(n.object).flatMap(everyProp));
        return memo(n, () => valuesOf(n.object).flatMap((v) => propValues(v, k)));
      }
      case 'ImportExpression': {
        const from = n.source.type === 'Literal' ? resolveImport(programOf(n), n.source.value) : null;
        return from ? [nsOf(from)] : [];
      }
      case 'ChainExpression': return valuesOf(n.expression);
      case 'AwaitExpression': return valuesOf(n.argument);
      case 'ConditionalExpression': return uniq([...valuesOf(n.consequent), ...valuesOf(n.alternate)]);
      case 'LogicalExpression': return uniq([...valuesOf(n.left), ...valuesOf(n.right)]);
      case 'SequenceExpression': return valuesOf(n.expressions[n.expressions.length - 1]);
      case 'AssignmentExpression': return n.operator === '=' ? valuesOf(n.right) : [];
      case 'CallExpression': return memo(n, () => {
        const c = n.callee;
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'bind') return valuesOf(c.object).filter(isFn);
        /* Object.freeze(o) is o */
        if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'Object'
            && !lookup(c.object) && /^(freeze|seal|preventExtensions)$/.test(c.property.name)) return valuesOf(n.arguments[0]);
        /* a promise is followed as the value it settles to (as `await` is): p.then(cb) settles to what cb returns */
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'then' && n.arguments[0]) {
          const cbs = valuesOf(n.arguments[0]).filter(isFn);
          if (cbs.length) return cbs.flatMap(returnsOf);
        }
        return fnsOf(n).flatMap(returnsOf);
      });
      default: return [];
    }
  }
  function fnsOf(call) { return valuesOf(call.callee).filter(isFn); }

  /* the parameter flow needs every call site of a function, and a call site's callee may itself be
     a parameter: solve it to a fixpoint (each pass sees the call sites the last one found) */
  for (let edges = -1, pass = 0; ; pass++) {
    for (const [k, v] of MEMO) if (v.dep) MEMO.delete(k);
    const next = new Map();
    let count = 0;
    for (const c of calls) for (const fn of fnsOf(c)) { if (!next.has(fn)) next.set(fn, []); next.get(fn).push(c); count++; }
    callSites = next;
    if (count === edges) break;
    edges = count;
    if (pass > 20) throw new Error('js-bindings: the call graph did not settle in 20 passes');
  }

  return { valuesOf, fnsOf, lookup, exportValues, calls, callSitesOf: (fn) => callSites.get(fn) || [], isFn };
}
