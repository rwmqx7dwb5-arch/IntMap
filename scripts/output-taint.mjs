/* ============================================================================
 *  IntMap · WHAT FLOWS INTO AN HTML SINK — measured, not counted by the copies   (output-taint-gate)
 * ----------------------------------------------------------------------------
 *  scripts/safe-output.mjs keeps the ENCODER single: it counts local escapers, live-document text
 *  parses and href/src values by their shape. It never asks the question an XSS is made of — «is the
 *  value that reaches this sink one that cannot carry markup?». MEASURED 2026-09-30 (AST, js/):
 *  562 innerHTML / outerHTML assignments and insertAdjacentHTML calls, 469 with an expression in them,
 *  300 mixing in a call or identifier that is no escaper — and among them OpenFreeMap/OSM country names
 *  (js/map-extras.js), the ADS-B callsign / registration / type / squawk of every aircraft tooltip
 *  (js/data-layers.js; the SHIP half of the same function escaped its fields) and the Natural Earth
 *  name + capital of the country card (js/countries-ui.js), all written into markup raw.
 *
 *  This reads every value that reaches an HTML sink and splits it into its LEAVES — the parts of the
 *  expression written AT THE SINK that decide what text lands there — and judges each leaf:
 *
 *    SAFE     a literal; a number (arithmetic, Math.*, Number(), parseInt/Float, .toFixed, a Date's
 *             formatting, ++/--, a comparison, typeof, `!`); `.length`; a serialisation of the DOM
 *             (`x.innerHTML` / `x.outerHTML` READ); the return of IntMapSafe.html / esc / url / text;
 *             encodeURIComponent / encodeURI (they encode < > " — see ⚠ below);
 *             a translation from a TRUSTED entry below with authored arguments;
 *             `a && b` when b is safe (a falsy left side is '', 0, NaN, false, null or undefined);
 *             a ternary / `||` / `??` / template / `+` whose parts are safe;
 *             a local variable every one of whose assignments (`=`, `+=`, `.push`, `x[k] =`) is safe;
 *             a member of a local object/array literal every value of which is safe;
 *             `arr.map(fn).join(sep)` when fn returns only safe values (whatever it is given);
 *             a call to a function DEFINED IN THE SAME FILE whose every return is safe (an escaper, an
 *             icon builder, a row builder) — or, if it only passes its parameters through, whose
 *             arguments at THIS call are safe;
 *             a name received from another file (a destructured factory dependency) when EVERY function
 *             of that name defined anywhere in js/ is judged safe by the rules above — the name means
 *             one thing across the repository (escapeHtml, esc).
 *    UNJUDGED everything else: a property of a record (`p.name`, `s.capital`), a parameter, a call into
 *             another module (`HOST.fmtMoney(…)`), `await`, `JSON.stringify`, `.textContent`.
 *
 *  ⚠ UNJUDGED IS NOT «UNSAFE». Most unjudged leaves are our own numbers and labels reached through a
 *  path the analysis does not follow. That is exactly why they are held by a LEDGER and not refused:
 *  tests/output-taint-baseline.json holds, per file, how many unjudged leaves remain. More → a new raw
 *  value was written into markup: pass it through IntMapSafe.html (or a local delegate). Fewer → lower
 *  the ledger (`node scripts/output-taint.mjs --update`) so it cannot drift back up unobserved.
 *
 *  ⚠ THE ONE THING THIS DOES DECLARE — calls into another module that are translations. Following
 *  `IntMapLang.t` into js/lang-registry.js would need cross-file flow the rest of the rule does not
 *  have, so each is written down in TRUSTED with the file and function that implement it and a reason
 *  in a sentence. The gate refuses an entry whose function no longer exists in that file, one without
 *  a reason, and one nothing calls — a declaration is a claim about code, and it is checked like one.
 *  ⚠ encodeURIComponent leaves `'` unencoded: it is safe in text and in a "double-quoted" attribute, not
 *  inside a 'single-quoted' one. It is counted SAFE because every call site in js/ measured
 *  2026-09-30 builds a URL for a double-quoted href or a query; a single-quoted use would be a defect.
 *
 *  Sinks:  X.innerHTML = / += v   X.outerHTML = / += v   X.insertAdjacentHTML(pos, v)
 *          X.setHTML(v)  (MapLibre Popup — parses its argument as HTML, 30 call sites in js/)
 *
 *      node scripts/output-taint.mjs            report every unjudged leaf, per file
 *      node scripts/output-taint.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/output-taint.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs (§20) runs the comparison as its `output-taint` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource } from '../tests/helpers/ast.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
export const LEDGER = join(ROOT, 'tests', 'output-taint-baseline.json');
const MIN_WHY = 40;

/* ── the declared translations (see the ⚠ in the header) ─────────────────────────────────────────
   callee  — the trailing member path of the call (`window.IntMapLang.t` and `IntMapLang.t` both match)
   file/fn — where it is implemented; the gate refuses the entry if that function is gone
   args    — 'from:N': safe when every argument from index N on is safe (it returns one of them or an
             authored translation of the first); 'none': safe whatever it is given
   factory — the call RETURNS such a function (a name bound to its result is judged by `args`) */
export const TRUSTED = [
  { callee: 'IntMapLang.t', file: 'js/lang-registry.js', fn: 't', args: 'from:1',
    why: 'returns one of its own arguments after the language (the translation the author wrote at the call site), or the inline table entry keyed by the English argument, never anything else' },
  { callee: 'IntMapLang.pick', file: 'js/lang-registry.js', fn: 'pick', factory: true, args: 'from:0', members: ['arr'],
    why: 'returns a picker that answers one of the authored strings it is called with (positional for the first five languages, the inline table for the rest), never its caller\'s data; its .arr(tuple) is the same picker applied to an array of them' },
  { callee: 'HOST.t', file: 'js/app-body.js', fn: 't', args: 'none',
    why: 'looks the key up in the authored i18n tables of the current and the English locale and returns that entry or undefined; a key that is not in the tables is never echoed back' },
];

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const SCOPE = (n) => FN.has(n.type) || n.type === 'Program';
/* `flag` is an encoder too: it returns escaped text, or the one inline-SVG image the flag builders make,
   rebuilt from its parsed data: URI (js/safe-html.js) — nothing the caller passes reaches the output as markup */
const ESCAPER_PATH = /(?:^|\.)IntMapSafe\.(?:html|esc|url|text|flag)$/;
/* methods whose result is a number or a boolean, whatever the receiver */
const NUM_METHODS = new Set(['toFixed', 'toPrecision', 'toExponential', 'indexOf', 'lastIndexOf', 'findIndex', 'findLastIndex',
  'search', 'charCodeAt', 'codePointAt', 'localeCompare', 'getTime', 'includes', 'some', 'every', 'startsWith', 'endsWith',
  'test', 'has', 'isArray', 'isFinite', 'isInteger', 'isNaN']);
/* array methods whose callback receives (element, index, array) of the receiver */
const ITER = new Set(['map', 'forEach', 'filter', 'flatMap', 'some', 'every', 'find', 'findLast', 'findIndex', 'findLastIndex']);
const STR_THROUGH = new Set(['trim', 'trimStart', 'trimEnd', 'toUpperCase', 'toLowerCase', 'toLocaleUpperCase',
  'toLocaleLowerCase', 'slice', 'substring', 'substr', 'charAt', 'padStart', 'padEnd', 'repeat', 'concat',
  'replace', 'replaceAll', 'normalize', 'toString', 'toLocaleString', 'at']);
const ARR_THROUGH = new Set(['filter', 'slice', 'sort', 'reverse', 'concat', 'flat', 'toSorted', 'toReversed']);
const GLOBAL_SAFE = new Set(['Number', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Boolean', 'encodeURIComponent', 'encodeURI']);
const GLOBAL_THROUGH = new Set(['String']);
const SAFE_GLOBAL_NAMES = new Set(['undefined', 'NaN', 'Infinity']);
const SAFE_NS = new Set(['Math', 'Date', 'Number']);

/* the dotted text of a member chain (`window.IntMapLang.t`), or '' when any part is computed */
function pathOf(n) {
  if (!n) return '';
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
    const o = pathOf(n.object);
    return o ? o + '.' + n.property.name : '';
  }
  if (n.type === 'ChainExpression') return pathOf(n.expression);
  return '';
}
const endsWithPath = (p, tail) => p === tail || p.endsWith('.' + tail);
const propName = (m) => (m && m.type === 'MemberExpression'
  ? (m.computed ? (m.property.type === 'Literal' ? String(m.property.value) : null) : m.property.name) : null);

/* every node with its parent and its enclosing scope (the nearest function, or the program), in source order */
function linked(ast) {
  const parent = new Map(); const scope = new Map(); const all = [];
  (function go(n, p, sc) {
    if (!n || typeof n.type !== 'string') return;
    parent.set(n, p); scope.set(n, sc); all.push(n);
    const inner = SCOPE(n) ? n : sc;
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') go(c, n, inner); }
      else if (v && typeof v.type === 'string') go(v, n, inner);
    }
  })(ast, null, null);
  return { parent, scope, all };
}

function patternNames(p, out = []) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  else if (p.type === 'ArrayPattern') p.elements.forEach((e) => patternNames(e, out));
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
  return out;
}

function returnsOf(fn) {
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  const rs = [];
  (function go(x) {
    if (!x || typeof x.type !== 'string') return;
    if (x !== fn && FN.has(x.type)) return;
    if (x.type === 'ReturnStatement') { if (x.argument) rs.push(x.argument); return; }
    for (const k in x) {
      if (k === 'loc') continue; const v = x[k];
      if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v);
    }
  })(fn.body);
  return rs;
}

/* ══ one file: scopes, bindings, and the judge ═══════════════════════════════════════════════════ */
export function analyse(src, { file = '', names: namesIn = null } = {}) {
  let names = namesIn;
  const ast = parseSource(src);
  const { parent, scope, all } = linked(ast);
  const text = (n) => src.slice(n.start, n.end);
  const scopeOf = (n) => { if (scope.has(n)) return scope.get(n) || ast; let p = parent.get(n); while (p && !SCOPE(p)) p = parent.get(p); return p || ast; };

  /* scope → name → { param: bool, opaque: bool, defs: [expr|fn], mut: [expr], plusDefs: [expr] } */
  const decls = new Map();
  const entry = (scope, name) => {
    let m = decls.get(scope); if (!m) decls.set(scope, (m = new Map()));
    let e = m.get(name); if (!e) m.set(name, (e = { param: false, opaque: false, defs: [], mut: [], fns: [], props: new Map() }));
    return e;
  };
  const globals = new Map();
  for (const n of all) {
    if (FN.has(n.type)) {
      n.params.forEach((p) => {
        if (p.type === 'Identifier') entry(n, p.name).param = true;
        else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') { const e = entry(n, p.left.name); e.param = true; e.defs.push(p.right); }
        else for (const nm of patternNames(p)) entry(n, nm).opaque = true;
      });
      if (n.type === 'FunctionDeclaration' && n.id) { const e = entry(scopeOf(n), n.id.name); e.fns.push(n); }
    } else if (n.type === 'VariableDeclarator') {
      const sc = scopeOf(n);
      const decl = parent.get(n); const loop = decl && parent.get(decl);
      const inLoopHead = loop && (loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') && loop.left === decl;
      if (n.id.type === 'Identifier' && !inLoopHead) {
        const e = entry(sc, n.id.name);
        if (n.init) { if (FN.has(n.init.type)) e.fns.push(n.init); else e.defs.push(n.init); }
      } else for (const nm of patternNames(n.id)) entry(sc, nm).opaque = true;
    } else if (n.type === 'CatchClause' && n.param) {
      for (const nm of patternNames(n.param)) entry(scopeOf(n), nm).opaque = true;
    } else if (n.type === 'ClassDeclaration' && n.id) entry(scopeOf(n), n.id.name).opaque = true;
    else if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') entry(ast, n.local.name).opaque = true;
  }
  const ownerOf = (idNode) => {
    const name = idNode.name;
    let s = scopeOf(idNode);
    while (s) {
      const m = decls.get(s);
      if (m && m.has(name)) return s;
      if (s === ast) return null;
      s = scopeOf(s);
    }
    return null;
  };
  const bindingOf = (idNode) => {
    const s = ownerOf(idNode);
    if (s) return { scope: s, e: decls.get(s).get(idNode.name) };
    const g = globals.get(idNode.name);
    return g ? { scope: null, e: g } : null;
  };
  /* assignments and mutations, attached to the binding they write */
  for (const n of all) {
    if (n.type === 'AssignmentExpression') {
      const L = n.left;
      if (L.type === 'Identifier') {
        const s = ownerOf(L);
        const e = s ? decls.get(s).get(L.name) : (globals.get(L.name) || globals.set(L.name, { param: false, opaque: false, defs: [], mut: [], fns: [], props: new Map() }).get(L.name));
        if (n.operator === '=' || n.operator === '+=' || n.operator === '||=' || n.operator === '??=' || n.operator === '&&=') {
          if (FN.has(n.right.type)) e.fns.push(n.right); else e.defs.push(n.right);
        } /* any other compound operator yields a number */
      } else if (L.type === 'MemberExpression' && L.object.type === 'Identifier') {
        const b = bindingOf(L.object);
        if (b) {
          b.e.mut.push(n.right);
          const k = propName(L); if (k != null) { if (!b.e.props.has(k)) b.e.props.set(k, []); b.e.props.get(k).push(n.right); }
        }
      } else if (L.type === 'ArrayPattern' || L.type === 'ObjectPattern') {
        for (const nm of patternNames(L)) { const id = { name: nm, type: 'Identifier' }; parent.set(id, n); const b = bindingOf(id); if (b) b.e.opaque = true; }
      }
    } else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier'
      && ['push', 'unshift', 'splice', 'fill'].includes(propName(n.callee))) {
      const b = bindingOf(n.callee.object);
      if (b) for (const a of (propName(n.callee) === 'splice' ? n.arguments.slice(2) : n.arguments)) b.e.mut.push(a.type === 'SpreadElement' ? { __spread: a.argument } : a);
    } else if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'Identifier') {
      const b = bindingOf(n.left); if (b) b.e.opaque = true;
    }
  }

  /* ── the judge ─────────────────────────────────────────────────────────────────────────────── */
  let fid = 0; const fids = new WeakMap();
  const idOf = (f) => (fids.has(f) ? fids.get(f) : (fids.set(f, ++fid), fid));
  /* a context is the set of functions whose parameters are assumed safe, plus 'x:<fid>:<name>' for a
     parameter held OUT of that assumption (to ask which parameters a builder's output depends on) */
  const ctxKey = (ctx) => [...ctx].map((c) => (typeof c === 'string' ? c : idOf(c))).sort().join(',');
  const paramAssumed = (fn, name, ctx) => ctx.has(fn) && !ctx.has('x:' + idOf(fn) + ':' + name);
  const memo = new Map(); const busy = new Set(); let hits = 0;
  function remember(kind, node, ctx, compute) {
    const k = kind + ':' + idOf(node) + '|' + ctxKey(ctx);
    if (memo.has(k)) return memo.get(k);
    if (busy.has(k)) { hits++; return kind === 'sum' ? 'unconditional' : true; }   /* a cycle adds no value of its own */
    busy.add(k); const h0 = hits;
    let r; try { r = compute(); } finally { busy.delete(k); }
    if (hits === h0) memo.set(k, r);
    return r;
  }
  const ok = (n, ctx) => leaves(n, ctx).length === 0;

  /* what a function returns: 'unconditional' (safe whatever it is given), 'transparent' (safe when its
     arguments are), or null */
  /* which arguments of a 'transparent' function its output actually depends on: `row(k, v)` that escapes
     v itself needs only k to be safe. null = all of them (it reads `arguments`, or a parameter is a pattern) */
  function needs(fn, ctx) {
    return remember('needs', fn, ctx, () => {
      if (fn.params.some((p) => p.type !== 'Identifier') || /\barguments\b/.test(text(fn.body))) return null;
      const inner = new Set(ctx); inner.add(fn);
      const rs = returnsOf(fn);
      const out = [];
      fn.params.forEach((p, i) => {
        const probe = new Set(inner); probe.add('x:' + idOf(fn) + ':' + p.name);
        if (!rs.every((r) => ok(r, probe))) out.push(i);
      });
      return out;
    });
  }
  function summary(fn, ctx) {
    return remember('sum', fn, ctx, () => {
      const rs = returnsOf(fn);
      if (rs.every((r) => ok(r, ctx))) return 'unconditional';
      const inner = new Set(ctx); inner.add(fn);
      if (rs.every((r) => ok(r, inner))) return 'transparent';
      return null;
    });
  }
  const rank = { unconditional: 2, transparent: 1 };
  const weakest = (xs) => (xs.length && xs.every(Boolean) ? xs.reduce((a, b) => (rank[a] <= rank[b] ? a : b)) : null);
  function trustedFor(path) { return TRUSTED.find((t) => endsWithPath(path, t.callee)); }
  /* a TRUSTED entry is also the verdict on its own implementation, in its own file (app-body's `t` is HOST.t) */
  const verdictOf = (t) => (t.factory ? null : (t.args === 'none' ? 'unconditional' : 'transparent'));
  /* the declared implementation itself: the outermost function of that name in the declared file. A call
     is judged by the entry only when its name RESOLVES to that binding (app-body also binds `t` to a
     touch point inside a handler, which is not the translation function). */
  const depthOf = (n) => { let d = 0, p = scopeOf(n); while (p && p !== ast) { d++; p = scopeOf(p); } return d; };
  const declaredFn = new Map();
  for (const t of TRUSTED) {
    if (t.file !== file || t.factory) continue;
    let best = null;
    for (const n of all) {
      const f = (n.type === 'FunctionDeclaration' && n.id && n.id.name === t.fn) ? n
        : (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === t.fn && n.init && FN.has(n.init.type)) ? n.init : null;
      if (f && (!best || depthOf(f) < depthOf(best))) best = f;
    }
    if (best) declaredFn.set(t, best);
  }
  const ownTrusted = (name, idNode) => TRUSTED.find((t) => {
    const f = declaredFn.get(t); if (!f || t.fn !== name) return false;
    if (!idNode) return true;
    const b = bindingOf(idNode); return !!b && b.e.fns.includes(f);
  });
  /* a receiver that is a factory's parameter or a destructured dependency (HOST, CTX, deps) — its members
     are the repository's shared functions, judged through the name index */
  const hostReceiver = (o) => {
    if (!o || o.type !== 'Identifier') return false;
    const b = bindingOf(o);
    return !!b && (b.e.param || b.e.opaque) && !b.e.defs.length && !b.e.fns.length;
  };
  /* the value of a name/expression AS A FUNCTION */
  function fnValue(n, ctx) {
    if (!n) return null;
    if (FN.has(n.type)) return summary(n, ctx);
    const p = pathOf(n);
    if (p && ESCAPER_PATH.test(p)) return 'unconditional';
    if (n.type === 'Identifier') {
      const own = ownTrusted(n.name, n); if (own) return verdictOf(own);
      const b = bindingOf(n);
      if (!b) return names ? names(n.name) : null;
      const e = b.e;
      if (e.opaque || e.param) return (e.opaque && !e.param && names) ? names(n.name) : null;
      return remember('fnv', e, ctx, () => weakest([...e.fns.map((f) => summary(f, ctx)), ...e.defs.map((d) => fnValue(d, ctx))]));
    }
    if (n.type === 'LogicalExpression') return weakest([fnValue(n.left, ctx), fnValue(n.right, ctx)]);
    if (n.type === 'ConditionalExpression') return weakest([fnValue(n.consequent, ctx), fnValue(n.alternate, ctx)]);
    if (n.type === 'CallExpression') {
      if (propName(n.callee) === 'bind') return fnValue(n.callee.object, ctx);
      const t = trustedFor(pathOf(n.callee));
      if (t && t.factory) return t.args === 'none' ? 'unconditional' : 'transparent';
    }
    if (n.type === 'MemberExpression') {
      const t = trustedFor(p);
      if (t && !t.factory) return t.args === 'none' ? 'unconditional' : 'transparent';
      const f = objMember(n, ctx, true); if (f) return f;
      const k = propName(n);
      if (k != null && n.object.type === 'Identifier') {
        /* obj.k = <function or factory result>, assigned in this file (a memoised picker: `_L._p = pick(…)`) */
        const b = bindingOf(n.object);
        if (b && b.e.props.has(k)) { const v = weakest(b.e.props.get(k).map((x) => fnValue(x, ctx))); if (v) return v; }
        if ((hostReceiver(n.object) || (/^(?:window|globalThis|self)$/.test(n.object.name) && !b)) && names) return names(k);
        /* a member of a TRUSTED factory's result that the declaration names (`L.arr([...])`) */
        if (b && !b.e.opaque && !b.e.param && b.e.defs.length && b.e.defs.every((d) => d.type === 'CallExpression' && ((trustedFor(pathOf(d.callee)) || {}).members || []).includes(k))) return 'transparent';
      }
    }
    return null;
  }
  /* obj.k where obj is a local object literal: the member's value (as a function when asFn) */
  function objMember(n, ctx, asFn) {
    if (n.object.type !== 'Identifier') return null;
    const b = bindingOf(n.object); if (!b || b.e.opaque || b.e.param || b.e.mut.length) return null;
    const k = propName(n); if (k == null) return null;
    const out = [];
    for (const d of b.e.defs) {
      if (d.type !== 'ObjectExpression') return null;
      const pr = d.properties.find((q) => q.type === 'Property' && !q.computed && ((q.key.name ?? String(q.key.value)) === k));
      if (!pr) return null;
      out.push(asFn ? fnValue(pr.value, ctx) : (ok(pr.value, ctx) ? 'unconditional' : null));
    }
    return weakest(out);
  }
  function argsOk(call, t, ctx) {
    const from = t && t.args && t.args.startsWith('from:') ? +t.args.slice(5) : 0;
    return call.arguments.slice(from).flatMap((a) => leaves(a.type === 'SpreadElement' ? a.argument : a, ctx));
  }
  /* is the value an array all of whose elements are safe? */
  function arrayOk(n, ctx) {
    if (!n) return false;
    return remember('arr', n, ctx, () => {
      if (n.type === 'ArrayExpression') return n.elements.every((e) => !e || (e.type === 'SpreadElement' ? arrayOk(e.argument, ctx) : ok(e, ctx)));
      if (n.type === 'Identifier') {
        const b = bindingOf(n); if (!b || b.e.opaque || b.e.param) return false;
        return b.e.defs.length > 0 && b.e.defs.every((d) => arrayOk(d, ctx))
          && b.e.mut.every((m) => (m.__spread ? arrayOk(m.__spread, ctx) : ok(m, ctx)));
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
        const m = propName(n.callee);
        if (m === 'map' || m === 'flatMap') { const f = fnValue(n.arguments[0], ctx); return f === 'unconditional' || (f === 'transparent' && arrayOk(n.callee.object, ctx)); }
        if (ARR_THROUGH.has(m)) return arrayOk(n.callee.object, ctx) && (m !== 'concat' || n.arguments.every((a) => arrayOk(a, ctx) || ok(a, ctx)));
        /* the keys of a local literal table are the author's identifiers; its values are judged as a table */
        if (pathOf(n.callee) === 'Object.keys') return keysOk(n.arguments[0]);
        if (pathOf(n.callee) === 'Object.values') return tableOk(n.arguments[0], ctx);
        if (pathOf(n.callee) === 'Array.from') return n.arguments[1] ? fnValue(n.arguments[1], ctx) === 'unconditional' : arrayOk(n.arguments[0], ctx);
        if (m === 'split') return ok(n.callee.object, ctx);
      }
      if (n.type === 'LogicalExpression') return arrayOk(n.right, ctx) && (n.operator === '&&' || arrayOk(n.left, ctx));
      if (n.type === 'ConditionalExpression') return arrayOk(n.consequent, ctx) && arrayOk(n.alternate, ctx);
      return false;
    });
  }
  const isDate = (n) => {
    if (!n) return false;
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date') return true;
    if (n.type === 'Identifier') { const b = bindingOf(n); return !!b && !b.e.opaque && !b.e.param && b.e.defs.length > 0 && b.e.defs.every(isDate); }
    return false;
  };

  /* the unjudged leaves of an expression — nodes AT THE SINK SITE (composites are split, atoms are judged whole) */
  function leaves(n, ctx) {
    if (!n) return [];
    switch (n.type) {
      case 'Literal': return [];
      case 'TemplateLiteral': return n.expressions.flatMap((e) => leaves(e, ctx));
      case 'BinaryExpression': return n.operator === '+' ? [...leaves(n.left, ctx), ...leaves(n.right, ctx)] : [];
      case 'UnaryExpression': case 'UpdateExpression': return [];
      case 'LogicalExpression': return n.operator === '&&' ? leaves(n.right, ctx) : [...leaves(n.left, ctx), ...leaves(n.right, ctx)];
      case 'ConditionalExpression': return [...leaves(n.consequent, ctx), ...leaves(n.alternate, ctx)];
      case 'SequenceExpression': return leaves(n.expressions[n.expressions.length - 1], ctx);
      case 'AssignmentExpression': return n.operator === '=' ? leaves(n.right, ctx) : (n.operator === '+=' ? [...leaves(n.left, ctx), ...leaves(n.right, ctx)] : []);
      case 'ChainExpression': return leaves(n.expression, ctx);
      case 'ParenthesizedExpression': return leaves(n.expression, ctx);
      case 'Identifier': return identOk(n, ctx) ? [] : [n];
      case 'MemberExpression': return memberOk(n, ctx) ? [] : [n];
      case 'CallExpression': return callLeaves(n, ctx);
      case 'NewExpression': return (n.callee.type === 'Identifier' && n.callee.name === 'Date') ? [] : [n];
      case 'TaggedTemplateExpression': return fnValue(n.tag, ctx) === 'unconditional' ? [] : [n];
      case 'ArrayExpression': return n.elements.flatMap((e) => (!e ? [] : e.type === 'SpreadElement' ? (arrayOk(e.argument, ctx) ? [] : [e]) : leaves(e, ctx)));
      default: return [n];
    }
  }
  /* the element / index / array a callback of arr.map / forEach / filter … is handed: as safe as arr */
  function iterParamOk(fn, name, ctx) {
    if (!fn || !FN.has(fn.type)) return false;
    const call = parent.get(fn);
    if (!call || call.type !== 'CallExpression' || call.arguments[0] !== fn || call.callee.type !== 'MemberExpression' || !ITER.has(propName(call.callee))) return false;
    const i = fn.params.findIndex((p) => p.type === 'Identifier' && p.name === name);
    if (i === 1) return true;
    if (i === 0 || i === 2) return arrayOk(call.callee.object, ctx);
    return false;
  }
  function identOk(n, ctx) {
    if (n.name === 'arguments') return false;
    const b = bindingOf(n);
    if (!b) return SAFE_GLOBAL_NAMES.has(n.name);
    return remember('id', b.e, ctx, () => {
      const e = b.e;
      if (e.opaque) return false;
      if (e.param && !(b.scope && paramAssumed(b.scope, n.name, ctx)) && !iterParamOk(b.scope, n.name, ctx)) return false;
      if (e.fns.length) return false;                   /* a function's source text is not a value to print */
      return e.defs.every((d) => ok(d, ctx)) && e.mut.length === 0;
    });
  }
  function memberOk(n, ctx) {
    const k = propName(n);
    if (k === 'length' || k === 'size' || (!n.computed && (k === 'innerHTML' || k === 'outerHTML'))) return true;
    if (n.object.type === 'Identifier' && n.object.name === 'arguments') {
      const s = scopeOf(n); return ctx.has(s);
    }
    if (n.object.type === 'Identifier' && SAFE_NS.has(n.object.name) && !bindingOf(n.object)) return true;   /* Math.PI */
    const t = trustedFor(pathOf(n)); if (t) return false;   /* a function, not a string */
    /* a member of a local literal table (ICONS[k], LABELS.x) */
    return remember('mem', n, ctx, () => tableOk(n.object, ctx));
  }
  function keysOk(o) {
    if (!o) return false;
    if (o.type === 'ObjectExpression') return o.properties.every((q) => q.type === 'Property' && !q.computed);
    if (o.type === 'Identifier') {
      const b = bindingOf(o); if (!b || b.e.opaque || b.e.param || b.e.fns.length || b.e.mut.length) return false;
      return b.e.defs.length > 0 && b.e.defs.every(keysOk);
    }
    return false;
  }
  function tableOk(o, ctx) {
    if (!o) return false;
    if (o.type === 'ObjectExpression') return o.properties.every((q) => q.type === 'Property' && !FN.has(q.value.type) && (ok(q.value, ctx) || tableOk(q.value, ctx)));
    if (o.type === 'ArrayExpression') return o.elements.every((e) => !e || (e.type !== 'SpreadElement' && (ok(e, ctx) || tableOk(e, ctx))));
    if (o.type === 'MemberExpression') return tableOk(o.object, ctx);
    if (o.type === 'ConditionalExpression') return tableOk(o.consequent, ctx) && tableOk(o.alternate, ctx);   /* jp ? [...] : [...] */
    if (o.type === 'LogicalExpression') return tableOk(o.right, ctx) && (o.operator === '&&' || tableOk(o.left, ctx));
    if (o.type === 'Identifier') {
      const b = bindingOf(o); if (!b || b.e.opaque || b.e.param || b.e.fns.length) return false;
      return b.e.defs.length > 0 && b.e.defs.every((d) => tableOk(d, ctx)) && b.e.mut.every((m) => !m.__spread && ok(m, ctx));
    }
    return false;
  }
  /* a .replace chain that rewrites both `&` and `<` into something safe is an encoder whatever it is given
     (the shape scripts/safe-output.mjs counts as a local escaper — still to be routed to IntMapSafe, but
     what it outputs cannot open a tag) */
  function encodesMarkup(n, ctx) {
    const seen = new Set();
    let x = n;
    while (x && x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && ['replace', 'replaceAll'].includes(propName(x.callee))) {
      const re = x.arguments[0], rep = x.arguments[1];
      /* only a GLOBAL match of ONE character (`/</g`, `/[&<>"']/g`) replaces every occurrence — `/<b>/g`
         leaves `<i>` standing, and a decoder (`/&lt;/g` → '<') puts the character back */
      const global = propName(x.callee) === 'replaceAll' || (re && re.regex && re.regex.flags.includes('g'));
      const src = re && re.regex ? re.regex.pattern : (re && typeof re.value === 'string' ? re.value : null);
      if (src == null || !rep || !global) return false;
      const oneChar = /^\[[^\]]+\]$/.test(src) || /^\\?[^\\]$/.test(src);
      const repStr = typeof rep.value === 'string' ? rep.value : null;
      const repOk = repStr != null ? !/[<]/.test(repStr)
        : (FN.has(rep.type) ? summary(rep, ctx) === 'unconditional' : fnValue(rep, ctx) === 'unconditional');
      if (!repOk) return false;
      if (oneChar) for (const ch of ['&', '<']) if (src.includes(ch)) seen.add(ch);
      x = x.callee.object;
    }
    return seen.has('&') && seen.has('<');
  }
  function callLeaves(n, ctx) {
    const c = n.callee;
    /* an immediately invoked function: what it returns */
    if (FN.has(c.type)) { const f = summary(c, ctx); return f === 'unconditional' ? [] : f === 'transparent' ? n.arguments.flatMap((a) => leaves(a, ctx)) : [n]; }
    const p = pathOf(c);
    if (p && ESCAPER_PATH.test(p)) return [];
    const t = trustedFor(p);
    if (t && !t.factory) return t.args === 'none' ? [] : argsOk(n, t, ctx);
    if (c.type === 'Identifier') {
      const own = ownTrusted(c.name, c);
      if (own) return own.args === 'none' ? [] : argsOk(n, own, ctx);
      const b = bindingOf(c);
      if (!b) {
        if (GLOBAL_SAFE.has(c.name)) return [];
        if (GLOBAL_THROUGH.has(c.name)) return n.arguments.flatMap((a) => leaves(a, ctx));
        const f = names ? names(c.name) : null;
        if (f === 'unconditional') return [];
        if (f === 'transparent') return argsOk(n, null, ctx);
        return [n];
      }
      const f = fnValue(c, ctx);
      if (f === 'unconditional') return [];
      if (f === 'transparent') {
        const fac = b.e.defs.map((d) => (d.type === 'CallExpression' ? trustedFor(pathOf(d.callee)) : null)).find(Boolean);
        if (!fac && b.e.fns.length === 1 && !b.e.defs.length) {
          const idx = needs(b.e.fns[0], ctx);
          if (idx) return idx.flatMap((i) => (n.arguments[i] ? leaves(n.arguments[i].type === 'SpreadElement' ? n.arguments[i].argument : n.arguments[i], ctx) : []));
        }
        return argsOk(n, fac && fac.factory ? fac : null, ctx);
      }
      return [n];
    }
    if (c.type === 'MemberExpression') {
      const m = propName(c);
      const recv = c.object;
      if (recv.type === 'Identifier' && SAFE_NS.has(recv.name) && !bindingOf(recv)) return [];   /* Math.round, Date.now, Number.parseFloat */
      if (NUM_METHODS.has(m)) return [];
      if (isDate(recv)) return [];
      if (m === 'apply' || m === 'call') {
        /* f.apply(this, arguments) / f.call(this, a, b) — the call of f with those arguments */
        const f = fnValue(recv, ctx);
        if (f === 'unconditional') return [];
        if (f === 'transparent') {
          if (m === 'call') return n.arguments.slice(1).flatMap((a) => leaves(a, ctx));
          const a1 = n.arguments[1];
          if (a1 && a1.type === 'Identifier' && a1.name === 'arguments' && ctx.has(scopeOf(n))) return [];
          return (a1 && arrayOk(a1, ctx)) ? [] : [n];
        }
        return [n];
      }
      if (m === 'join') return (arrayOk(recv, ctx) && n.arguments.every((a) => ok(a, ctx))) ? [] : [n];
      if ((m === 'replace' || m === 'replaceAll') && encodesMarkup(n, ctx)) return [];
      if (STR_THROUGH.has(m)) {
        const argsFine = (m === 'replace' || m === 'replaceAll') ? ok(n.arguments[1], ctx)
          : (['padStart', 'padEnd', 'concat'].includes(m) ? n.arguments.slice(m === 'concat' ? 0 : 1).every((a) => ok(a, ctx)) : true);
        return (ok(recv, ctx) && argsFine) ? [] : [n];
      }
      const f = fnValue(c, ctx);
      if (f === 'unconditional') return [];
      if (f === 'transparent') return argsOk(n, null, ctx);
      return [n];
    }
    return [n];
  }

  /* ── the sinks ──────────────────────────────────────────────────────────────────────────────── */
  const EMPTY = new Set();
  /* the function a parameter belongs to, when EVERY use of that function's name in this file is a direct
     call — then what reaches the sink through the parameter is what the callers pass, and the leaf is
     judged at each call site instead (a local `bubble(who, html){ d.innerHTML = html }` is exactly as safe
     as its callers). A function that is passed around, stored or exported has callers this file cannot see,
     so its parameter stays a leaf. */
  const refsByBinding = new Map();
  for (const n of all) {
    if (n.type !== 'Identifier') continue;
    const p = parent.get(n);
    if (p && ((p.type === 'MemberExpression' && p.property === n && !p.computed) || (p.type === 'Property' && p.key === n && !p.shorthand)
      || (FN.has(p.type) && p.id === n) || (p.type === 'VariableDeclarator' && p.id === n))) continue;
    if (p && FN.has(p.type) && p.params.includes(n)) continue;
    const s = ownerOf(n); if (!s) continue;
    const e = decls.get(s).get(n.name);
    if (!refsByBinding.has(e)) refsByBinding.set(e, []);
    refsByBinding.get(e).push(n);
  }
  function localCallers(fn) {
    let e = null;
    if (fn.type === 'FunctionDeclaration' && fn.id) e = decls.get(scopeOf(fn)).get(fn.id.name);
    else { const p = parent.get(fn); if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') e = decls.get(scopeOf(p)).get(p.id.name); }
    if (!e || e.fns.length !== 1 || e.defs.length || e.opaque || e.param) return null;
    const refs = refsByBinding.get(e) || [];
    const calls = [];
    for (const r of refs) { const p = parent.get(r); if (!(p && p.type === 'CallExpression' && p.callee === r)) return null; calls.push(p); }
    return calls;
  }
  function lift(leaf, depth, seen) {
    if (leaf.type !== 'Identifier' || depth > 6) return [leaf];
    const b = bindingOf(leaf);
    if (!b || !b.e.param || b.e.opaque || b.e.defs.length || b.e.mut.length || !b.scope || b.scope === ast) return [leaf];
    const fn = b.scope;
    const i = fn.params.findIndex((p) => p.type === 'Identifier' && p.name === leaf.name);
    if (i < 0 || seen.has(fn)) return [leaf];
    const calls = localCallers(fn); if (!calls) return [leaf];
    const next = new Set(seen); next.add(fn);
    return calls.flatMap((c) => {
      const a = c.arguments[i];
      if (!a) return [];
      if (a.type === 'SpreadElement') return [a];
      return leaves(a, EMPTY).flatMap((l) => lift(l, depth + 1, next));
    });
  }
  /* an element made by a document with no browsing context (document.implementation.createHTMLDocument —
     IntMapSafe.text's parse) fetches and runs nothing: writing markup into it is not a sink */
  function inertElement(o) {
    if (!o || o.type !== 'Identifier') return false;
    const b = bindingOf(o); if (!b || b.e.opaque || b.e.param || b.e.defs.length !== 1) return false;
    const d = b.e.defs[0];
    if (d.type !== 'CallExpression' || propName(d.callee) !== 'createElement' || d.callee.object.type !== 'Identifier') return false;
    const db = bindingOf(d.callee.object);
    return !!db && !db.e.opaque && !db.e.param && db.e.defs.length > 0
      && db.e.defs.every((x) => /\.implementation\.createHTMLDocument\(/.test(text(x)));
  }
  function sinks() {
    const out = [];
    for (const n of all) {
      let kind = null, value = null;
      if (n.type === 'AssignmentExpression' && (n.operator === '=' || n.operator === '+=') && n.left.type === 'MemberExpression') {
        const k = propName(n.left);
        if (k === 'innerHTML' || k === 'outerHTML') { kind = k; value = n.right; }
      } else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
        const k = propName(n.callee);
        if (k === 'insertAdjacentHTML') { kind = k; value = n.arguments[1]; }
        else if (k === 'setHTML') { kind = k; value = n.arguments[0]; }
      }
      if (!kind) continue;
      if (kind === 'innerHTML' && inertElement(n.left.object)) continue;
      const bad = value ? [...new Set(leaves(value, EMPTY).flatMap((l) => lift(l, 0, new Set())))] : [];
      out.push({ line: n.loc.start.line, kind, leaves: bad.map((x) => ({ line: x.loc.start.line, text: text(x).replace(/\s+/g, ' ').slice(0, 80), why: () => explain(x) })) });
    }
    return out;
  }
  /* --why: follow a leaf into the local definitions and the returns of the local functions that make it
     unjudged, down to the reads that actually decide it (a record's field, a parameter, another module) */
  function explain(x, depth = 0, seen = new Set()) {
    if (depth > 5 || seen.has(x)) return [];
    seen.add(x);
    const here = (n) => ({ line: n.loc.start.line, text: text(n).replace(/\s+/g, ' ').slice(0, 90) });
    const ofBinding = (id) => { const b = bindingOf(id); return (b && !b.e.opaque && !b.e.param) ? [...b.e.defs, ...b.e.mut.map((m) => m.__spread || m)].flatMap((d) => leaves(d, EMPTY)) : []; };
    let inner = [];
    if (x.type === 'Identifier') inner = ofBinding(x);
    else if (x.type === 'CallExpression') {
      const c = x.callee;
      if (c.type === 'Identifier') { const b = bindingOf(c); if (b) inner = b.e.fns.flatMap((f) => returnsOf(f).flatMap((r) => leaves(r, EMPTY))); }
      else if (c.type === 'MemberExpression' && ['join', 'map'].includes(propName(c))) {
        let o = c.object; if (o.type === 'CallExpression' && propName(o.callee) === 'map') o = o.arguments[0];
        if (o && FN.has(o.type)) inner = returnsOf(o).flatMap((r) => leaves(r, EMPTY));
        else if (o && o.type === 'Identifier') inner = ofBinding(o);
      }
    }
    if (!inner.length) return [here(x)];
    return inner.flatMap((y) => explain(y, depth + 1, seen));
  }

  /* functions this file OFFERS by name — the repository-wide name index. A helper only ever called
     directly inside its own function (a CSV quoter called `esc` inside an export routine) cannot be what
     another file receives as `esc`, so it is not offered; a function at the top of the file, stored in an
     object, passed or returned is. */
  const offered = (e) => (refsByBinding.get(e) || []).some((r) => { const p = parent.get(r); return !(p && p.type === 'CallExpression' && p.callee === r); });
  const named = new Map();
  const note = (name, f) => { if (!named.has(name)) named.set(name, []); named.get(name).push(f); };
  for (const n of all) {
    if (n.type === 'FunctionDeclaration' && n.id) {
      const sc = scopeOf(n);
      if (sc === ast || offered(decls.get(sc).get(n.id.name))) note(n.id.name, n);
    } else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init
      && (FN.has(n.init.type) || ESCAPER_PATH.test(pathOf(n.init)) || (n.init.type === 'CallExpression' && (trustedFor(pathOf(n.init.callee)) || {}).factory))) {
      const sc = scopeOf(n);
      if (sc === ast || offered(decls.get(sc).get(n.id.name))) note(n.id.name, n.init);
    } else if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && FN.has(n.value.type) && n.kind !== 'set') {
      /* a getter (`get escapeHtml(){ return escapeHtml; }` — js/app-body.js IM_HOST) offers what it RETURNS */
      note(n.key.name, n.kind === 'get' ? { getter: n.value } : n.value);
    } else if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'MemberExpression' && !n.left.computed && FN.has(n.right.type)) {
      note(n.left.property.name, n.right);   /* window.fmtTemp = function(…){…} / HOST.x = (…) => … */
    } else if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && n.value.type === 'Identifier' && n.kind === 'init' && parent.get(n).type === 'ObjectExpression') {
      note(n.key.name, n.value);       /* { escapeHtml } / { esc: escapeHtml } — what the name is bound to */
    }
  }
  const verdictAsFunction = (f) => (f.getter ? weakest(returnsOf(f.getter).map((r) => fnValue(r, EMPTY)))
    : (FN.has(f.type) ? summary(f, EMPTY) : fnValue(f, EMPTY)));
  const definedFunctions = () => new Map([...named].map(([k, fs]) => [k, fs.map((f) => {
    const t = [...declaredFn].find(([, d]) => d === f);
    return t ? verdictOf(t[0]) : verdictAsFunction(f);
  })]));
  const calledPaths = new Set();
  for (const n of all) if (n.type === 'CallExpression') { const p = pathOf(n.callee); if (p) calledPaths.add(p); }
  /* the index changes between rounds of scan(); every verdict computed under the old one is dropped */
  const setNames = (fnOrNull) => { names = fnOrNull; memo.clear(); };
  /* the unjudged leaves of what a named function RETURNS — for markup that is built in one place and
     written into a sink somewhere else (a tooltip builder handed to a shared tooltip) */
  function functionLeaves(name) {
    const fns = all.filter((n) => (n.type === 'FunctionDeclaration' && n.id && n.id.name === name)
      || (FN.has(n.type) && parent.get(n) && parent.get(n).type === 'VariableDeclarator' && parent.get(n).id.name === name));
    return fns.flatMap((f) => returnsOf(f).flatMap((r) => leaves(r, EMPTY)))
      .map((x) => ({ line: x.loc.start.line, text: text(x).replace(/\s+/g, ' ').slice(0, 80) }));
  }
  return { sinks, definedFunctions, calledPaths, file, setNames, functionLeaves };
}

/* ══ the repository ══════════════════════════════════════════════════════════════════════════════ */
function walkJs(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkJs(abs, acc);
    else if (name.endsWith('.js')) acc.push(abs);
  }
  return acc;
}

/* parsing and binding a file is most of the cost; an unchanged (file, text) is analysed once per process —
   the regression test re-runs the gate on mutated copies of the tree. Every verdict is dropped by
   setNames() before it is reused, so nothing computed under another tree's index survives. */
const ANALYSED = new Map();
/** Scan js/ (or the given { rel: source } map). */
export function scan(root = ROOT, sources = null) {
  const srcs = sources || Object.fromEntries(walkJs(join(root, 'js')).map((a) => [relative(root, a).replace(/\\/g, '/'), readFileSync(a, 'utf8')]));
  const unparsed = []; const A = {};
  for (const [rel, src] of Object.entries(srcs)) {
    const key = rel + ' ' + src;
    try { A[rel] = ANALYSED.get(key) || ANALYSED.set(key, analyse(src, { file: rel })).get(key); } catch (e) { unparsed.push(rel + ' — ' + e.message); }
  }
  /* the name index is a fixpoint: `esc = (x) => HOST.escapeHtml(x)` is an escaper only once escapeHtml is
     known to be one. Each round can only turn «unjudged» into «safe» (a name is safe when every offered
     definition is), so it settles after a handful of rounds; the bound is a guard, not a budget. */
  let index = new Map(), sig = '';
  const names = (nm) => {
    const vs = index.get(nm); if (!vs || !vs.length) return null;
    if (vs.every((v) => v === 'unconditional')) return 'unconditional';
    return vs.every((v) => v === 'unconditional' || v === 'transparent') ? 'transparent' : null;
  };
  for (let round = 0; round < 8; round++) {
    const next = new Map();
    for (const a of Object.values(A)) {
      a.setNames(round ? names : null);
      for (const [k, vs] of a.definedFunctions()) { if (!next.has(k)) next.set(k, []); next.get(k).push(...vs); }
    }
    const s = JSON.stringify([...next].sort());
    index = next;
    if (s === sig) break;
    sig = s;
  }
  const files = {}; const called = new Set();
  for (const [rel, a] of Object.entries(A)) {
    a.setNames(names);
    const ss = a.sinks();
    if (ss.length) files[rel] = ss;
    for (const p of a.calledPaths) called.add(p);
  }
  return { files, unparsed, called, srcs, analyzers: A };
}

export const unjudged = (sinks) => (sinks || []).reduce((a, s) => a + s.leaves.length, 0);

/** Problems with the TRUSTED declarations themselves. */
export function trustedProblems({ called, srcs }, trusted = TRUSTED) {
  const out = [];
  for (const t of trusted) {
    if (!t.why || String(t.why).trim().length < MIN_WHY) out.push(`TRUSTED ${t.callee}: needs a reason — a sentence saying why what it returns cannot carry the caller's data`);
    const src = srcs[t.file];
    if (src == null) { out.push(`TRUSTED ${t.callee}: ${t.file} does not exist`); continue; }
    let found = false;
    try {
      const { all } = linked(parseSource(src));
      found = all.some((n) => (n.type === 'FunctionDeclaration' && n.id && n.id.name === t.fn)
        || (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === t.fn && n.init && FN.has(n.init.type))
        || (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && n.key.name === t.fn && FN.has(n.value.type)));
    } catch (_) { /* reported as unparsed */ }
    if (!found) out.push(`TRUSTED ${t.callee}: ${t.file} no longer defines a function ${t.fn} — the declaration describes code that is gone`);
    if (![...called].some((p) => endsWithPath(p, t.callee))) out.push(`TRUSTED ${t.callee}: nothing in js/ calls it — remove the declaration`);
  }
  return out;
}

export function measure(root = ROOT, sources = null) {
  const r = scan(root, sources);
  const counts = {};
  for (const [f, sinks] of Object.entries(r.files)) { const n = unjudged(sinks); if (n) counts[f] = n; }
  return { counts, ...r };
}
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

export function check(root = ROOT, ledgerPath = LEDGER, sources = null) {
  const lines = [];
  if (!existsSync(ledgerPath)) return { ok: false, lines: [`no ledger at ${ledgerPath} — run: node scripts/output-taint.mjs --update`] };
  const was = JSON.parse(readFileSync(ledgerPath, 'utf8')).files || {};
  const m = measure(root, sources);
  for (const u of m.unparsed) lines.push(`${u} — could not be parsed, so what flows into its HTML sinks is not measured`);
  lines.push(...trustedProblems(m));
  for (const f of [...new Set([...Object.keys(was), ...Object.keys(m.counts)])].sort()) {
    const a = was[f] || 0, b = m.counts[f] || 0;
    if (b > a) {
      const where = (m.files[f] || []).flatMap((s) => s.leaves.map((l) => `${l.line} ${l.text}`)).join('; ');
      lines.push(`${f}: ${b} unjudged value(s) reach an HTML sink, the ledger allows ${a} — pass the new one through window.IntMapSafe.html (or the file's esc delegate): ${where}`);
    } else if (b < a) lines.push(`${f}: ${b} unjudged value(s) reach an HTML sink, the ledger still says ${a} — lower it: node scripts/output-taint.mjs --update`);
  }
  return { ok: lines.length === 0, lines, counts: m.counts, total: total(m.counts), ledgerTotal: total(was) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const m = measure();
    const sinks = Object.values(m.files).reduce((a, s) => a + s.length, 0);
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/output-taint.mjs --update — values reaching an HTML sink (innerHTML/outerHTML/insertAdjacentHTML/setHTML) that the analysis cannot show to be markup-free, per file; ratcheted both ways by check:static',
      sinks, total: total(m.counts), files: Object.fromEntries(Object.entries(m.counts).sort()),
    }, null, 1) + '\n');
    console.log(`output-taint: ledger written — ${total(m.counts)} unjudged values in ${Object.keys(m.counts).length} files (${sinks} sinks)`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `output-taint: ${r.total} unjudged values, as the ledger says` : 'output-taint: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    const m = measure();
    let s = 0, withExpr = 0, t = 0;
    for (const [f, sinks] of Object.entries(m.files)) for (const k of sinks) {
      s++; if (k.leaves.length) withExpr++;
      for (const l of k.leaves) {
        t++; console.log(`${f}:${l.line}  [${k.kind}@${k.line}]  ${l.text}`);
        if (process.argv.includes('--why')) for (const w of l.why()) if (w.text !== l.text) console.log(`      <- ${w.line}  ${w.text}`);
      }
    }
    console.log(`\nsinks ${s} · with an unjudged value ${withExpr} · unjudged values ${t}`);
    for (const p of trustedProblems(m)) console.log('✗ ' + p);
  }
}
