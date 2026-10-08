#!/usr/bin/env node
/* ============================================================================
 *  IntMap · A TEST DOES NOT WRITE THE CHECKOUT — found by what the call writes   (mutation-tests-off-tree)
 * ----------------------------------------------------------------------------
 *  The mutation tests proved a gate fails by making a fact wrong in the WORKING TREE, running the
 *  gate and putting it back. `node --test` runs test files in parallel, so every other file that
 *  read the same tree could see the mutant, and the tree lock (tests/helpers/gate-lock.mjs, since removed) only
 *  serialised the writers. MEASURED 2026-09-30 in one `npm test`: 10 red — 6 files dying in the
 *  600/900 s wait for the lock, 1 breach of the lock itself (#R623's 2.7 %), and 3 readers that took
 *  no lock tripping over js/__r717-probe.js, which tests/chronos-claims-checks.test.mjs created for
 *  the length of one gate run. The writers now break a PRIVATE COPY (tests/helpers/scratch-tree.mjs)
 *  and run the gate from there.
 *
 *  THIS RULE KEEPS IT THAT WAY. From the parse tree of every .js/.mjs/.cjs under tests/, it finds the
 *  calls that WRITE the filesystem — writeFileSync/appendFileSync/rmSync/unlinkSync/renameSync/
 *  copyFileSync/cpSync/mkdirSync/rmdirSync/symlinkSync/linkSync/truncateSync/createWriteStream and
 *  their async and fs.promises forms — and asks where the DESTINATION comes from:
 *
 *    · tmp      — derived from os.tmpdir(), mkdtemp(Sync) or $TMPDIR/$TEMP/$TMP. Allowed.
 *    · checkout — derived from import.meta (url/dirname/filename), __dirname/__filename,
 *                 process.cwd(), or a relative path literal (resolved against the cwd, which
 *                 under `npm test` is the checkout). REFUSED.
 *    · scratch  — derived from scratchTree(). REFUSED: the copy's files are hard links into the
 *                 checkout, and an fs write through one writes the checkout. Change the copy
 *                 with its own write()/remove()/rename()/mutate(), which unlink first.
 *
 *  «Derived» is followed through variables (by scope, not by name), through calls to local helper
 *  functions (what the helper RETURNS), and through helpers that WRITE A PARAMETER (the call site
 *  is then judged by the argument it passes) — the forms the 13 writers this replaced actually had:
 *  `writeFileSync(join(ROOT, f), …)`, `writeFileSync(path('js/…'))` with `path` a local arrow over
 *  `new URL(p, ROOT)`, a `probe` variable, a `victim` joined onto a TESTS constant.
 *  A destination that is neither (a parameter nobody passes a checkout path to, a value returned by
 *  an imported helper) is not judged — the rule is about what can be SEEN to be the checkout.
 *
 *    node scripts/tree-writers.mjs            # every refused write, exit 1 if any
 *
 *  It is a rule in check:static and not a check:* of its own, for the reason given in
 *  scripts/static-checks.mjs §15 (the gate list in .agents/rules/execution-strategy.md is full).
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['tests'];
const SKIP = new Set(['node_modules', 'fixtures', '.cache']);

/* fs functions that change the filesystem → which argument(s) name what is changed */
export const WRITES = {
  writeFileSync: [0], writeFile: [0], appendFileSync: [0], appendFile: [0],
  rmSync: [0], rm: [0], unlinkSync: [0], unlink: [0], rmdirSync: [0], rmdir: [0],
  renameSync: [0, 1], rename: [0, 1],
  copyFileSync: [1], copyFile: [1], cpSync: [1], cp: [1],
  mkdirSync: [0], mkdir: [0], symlinkSync: [1], symlink: [1], linkSync: [1], link: [1],
  truncateSync: [0], truncate: [0], createWriteStream: [0], chmodSync: [0], chmod: [0],
};
const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);

function parse(src) {
  for (const sourceType of ['module', 'script']) {
    try {
      return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, locations: true, allowReturnOutsideFunction: true });
    } catch { /* next */ }
  }
  return null;
}

/* Child nodes of a node, in source order (enough of acorn's shape for this walk). */
function children(n) {
  const out = [];
  for (const k of Object.keys(n)) {
    if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); }
    else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}

const isFunction = (n) => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
const isScope = (n) => n.type === 'Program' || isFunction(n) || n.type === 'BlockStatement'
  || /^For(In|Of)?Statement$/.test(n.type) || n.type === 'CatchClause' || n.type === 'StaticBlock';

/* Every name a pattern binds (const { a, b: [c] } = …) */
function patternNames(p, out = []) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out);
  else if (p.type === 'ArrayPattern') for (const q of p.elements) patternNames(q, out);
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  return out;
}

/**
 * Every refused write in one source text: [{ line, kind: 'checkout'|'scratch', call, target }].
 * Returns null when the source does not parse.
 */
export function scanSource(src) {
  src = String(src);
  const ast = parse(src);
  if (!ast) return null;
  const text = (n) => src.slice(n.start, n.end);

  /* ── 1. bindings, by scope: name → { kind, node, chain } ─────────────────────────────── */
  const scopes = new Map();                 // scope node → Map(name → [binding])
  const fsNames = new Map();                // local name → 'fn:<fsname>' | 'ns'
  const bind = (scope, name, b) => {
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    const m = scopes.get(scope);
    if (!m.has(name)) m.set(name, []);
    m.get(name).push(b);
  };
  const nearest = (chain, pred) => { for (let i = chain.length - 1; i >= 0; i--) if (pred(chain[i])) return chain[i]; return chain[0]; };
  const calls = [];                         // [{ node, chain }]
  const assigns = [];                       // [{ name, node, chain }] — `name = …` anywhere

  (function visit(n, chain) {
    const here = chain.concat(n);
    if (n.type === 'ImportDeclaration' && FS_MODULES.has(n.source.value)) {
      for (const s of n.specifiers) {
        if (s.type === 'ImportSpecifier') fsNames.set(s.local.name, 'fn:' + (s.imported.name || s.imported.value));
        else fsNames.set(s.local.name, 'ns');
      }
    }
    if (n.type === 'VariableDeclarator') {
      const scope = n.parent_kind === 'var' ? nearest(chain, isFunction) : nearest(chain, isScope);
      /* require('fs') and its destructurings */
      if (n.init && n.init.type === 'CallExpression' && n.init.callee.name === 'require'
        && n.init.arguments[0] && FS_MODULES.has(n.init.arguments[0].value)) {
        if (n.id.type === 'Identifier') fsNames.set(n.id.name, 'ns');
        else if (n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.key && p.value && p.value.type === 'Identifier') fsNames.set(p.value.name, 'fn:' + (p.key.name || p.key.value));
      }
      /* `const { promises: fsp } = fs` / `const fsp = fs.promises` */
      if (n.init && n.id.type === 'Identifier' && n.init.type === 'MemberExpression'
        && n.init.object.type === 'Identifier' && fsNames.get(n.init.object.name) === 'ns') fsNames.set(n.id.name, 'ns');
      for (const name of patternNames(n.id)) bind(scope, name, { kind: 'init', node: n.init, chain: here });
    }
    if (n.type === 'FunctionDeclaration' && n.id) bind(nearest(chain, isScope), n.id.name, { kind: 'fn', node: n, chain: here });
    if (isFunction(n)) {
      n.params.forEach((p, i) => { for (const name of patternNames(p)) bind(n, name, { kind: 'param', fn: n, index: i }); });
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') {
      /* bound where the name is declared — found at resolve time, so record it on a side list */
      assigns.push({ name: n.left.name, node: n.right, chain: here });
    }
    if (n.type === 'CallExpression' || n.type === 'NewExpression') calls.push({ node: n, chain: here });
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) d.parent_kind = n.kind;
    for (const c of children(n)) visit(c, here);
  })(ast, []);

  /* ── 2. resolve a name at a point to its bindings ─────────────────────────────────────── */
  function lookup(name, chain) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const m = scopes.get(chain[i]);
      if (m && m.has(name)) {
        const found = m.get(name);
        const scope = chain[i];
        /* assignments to this same binding: any `name = …` whose own lookup lands in this scope */
        const extra = assigns.filter((a) => a.name === name && a.chain.includes(scope)
          && !a.chain.slice(a.chain.indexOf(scope) + 1).some((s) => scopes.get(s) && scopes.get(s).has(name)))
          .map((a) => ({ kind: 'init', node: a.node, chain: a.chain }));
        return found.concat(extra);
      }
    }
    return null;                            // a global
  }

  /* ── 3. where does a value come from? a Set of 'tmp' | 'checkout' | 'scratch' | 'param' ── */
  const fnOf = (b) => (b.kind === 'fn' ? b.node : (b.node && isFunction(b.node) ? b.node : null));
  const memo = new Map();
  function origin(n, chain, seen = new Set()) {
    const out = new Set();
    if (!n) return out;
    const add = (s) => { for (const x of s) out.add(x); };
    switch (n.type) {
      case 'MetaProperty': out.add('checkout'); return out;
      case 'Literal': return out;
      case 'Identifier': {
        if (n.name === '__dirname' || n.name === '__filename') { out.add('checkout'); return out; }
        const bs = lookup(n.name, chain);
        if (!bs) return out;
        for (const b of bs) {
          const key = b;
          if (seen.has(key)) continue;
          const s2 = new Set(seen); s2.add(key);
          if (b.kind === 'param') out.add('param:' + b.index + ':' + b.fn.start);
          else if (b.kind === 'init' && b.node && !isFunction(b.node)) add(origin(b.node, b.chain, s2));
        }
        return out;
      }
      case 'MemberExpression': {
        const o = text(n.object);
        if (o === 'process.env' && /^(TMPDIR|TEMP|TMP)$/.test(n.property.name || n.property.value || '')) { out.add('tmp'); return out; }
        add(origin(n.object, chain, seen));
        if (n.computed) add(origin(n.property, chain, seen));
        return out;
      }
      case 'CallExpression':
      case 'NewExpression': {
        const callee = n.callee;
        const name = callee.type === 'Identifier' ? callee.name
          : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : '';
        if (/^tmpdir$/.test(name)) { out.add('tmp'); return out; }
        if (/^mkdtemp(Sync)?$/.test(name)) {
          const a = origin(n.arguments[0], chain, seen);
          if (a.has('checkout') && !a.has('tmp')) out.add('checkout'); else out.add('tmp');
          return out;
        }
        if (name === 'scratchTree') { out.add('scratch'); return out; }
        if (text(callee) === 'process.cwd') { out.add('checkout'); return out; }
        /* a local helper: what it RETURNS, with its own parameters bound to these arguments */
        if (callee.type === 'Identifier') {
          const bs = lookup(callee.name, chain) || [];
          for (const b of bs) {
            const fn = fnOf(b);
            if (!fn || seen.has(fn)) continue;
            const s2 = new Set(seen); s2.add(fn);
            const ret = returned(fn, s2);
            for (const x of ret) {
              const m = /^param:(\d+):(\d+)$/.exec(x);
              if (m && Number(m[2]) === fn.start) add(origin(n.arguments[Number(m[1])], chain, seen));
              else out.add(x);
            }
          }
        }
        add(origin(callee.type === 'MemberExpression' ? callee.object : null, chain, seen));
        for (const a of n.arguments) add(origin(a, chain, seen));
        return out;
      }
      default:
        if (isFunction(n)) return out;
        for (const c of children(n)) add(origin(c, chain, seen));
        return out;
    }
  }
  /* what a function returns (arrow expression body, or its return statements) */
  const fnChains = new Map();
  (function index(n, chain) {
    const here = chain.concat(n);
    if (isFunction(n)) fnChains.set(n, here);
    for (const c of children(n)) index(c, here);
  })(ast, []);
  function returned(fn, seen) {
    const key = fn;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, new Set());
    const out = new Set();
    const base = fnChains.get(fn) || [fn];
    if (fn.body.type !== 'BlockStatement') for (const x of origin(fn.body, base, seen)) out.add(x);
    else {
      (function find(n, chain) {
        if (n !== fn && isFunction(n)) return;
        const here = chain.concat(n);
        if (n.type === 'ReturnStatement' && n.argument) for (const x of origin(n.argument, here, seen)) out.add(x);
        for (const c of children(n)) find(c, here);
      })(fn.body, base);
    }
    memo.set(key, out);
    return out;
  }

  /* ── 4. the write calls, and the helpers that write a parameter ───────────────────────── */
  const writeName = (n) => {
    const c = n.callee;
    if (c.type === 'Identifier') {
      const f = fsNames.get(c.name);
      return f && f.startsWith('fn:') && WRITES[f.slice(3)] ? f.slice(3) : null;
    }
    if (c.type === 'MemberExpression' && !c.computed && WRITES[c.property.name]) {
      /* fs.x(…), fsp.x(…), fs.promises.x(…) */
      let o = c.object;
      while (o.type === 'MemberExpression' && !o.computed && o.property.name === 'promises') o = o.object;
      if (o.type === 'Identifier' && fsNames.get(o.name) === 'ns') return c.property.name;
    }
    return null;
  };
  const problems = [];
  const writesParam = new Map();            // fn node → Set(index)
  const judge = (targetOrigin, report) => {
    if (targetOrigin.has('tmp')) return;
    if (targetOrigin.has('scratch')) report('scratch');
    else if (targetOrigin.has('checkout')) report('checkout');
  };
  const paramsOf = (o) => [...o].map((x) => /^param:(\d+):(\d+)$/.exec(x)).filter(Boolean);
  const fnAt = new Map([...fnChains.keys()].map((f) => [f.start, f]));
  const seenProblem = new Set();
  const push = (p) => { const k = p.line + '|' + p.target; if (!seenProblem.has(k)) { seenProblem.add(k); problems.push(p); } };

  let changed = true;
  for (let round = 0; changed && round < 8; round++) {
    changed = false;
    for (const { node: n, chain } of calls) {
      const w = writeName(n);
      let targets = [];
      if (w) targets = WRITES[w].map((i) => n.arguments[i]).filter(Boolean).map((a) => ({ a, call: w }));
      else if (n.callee.type === 'Identifier') {
        for (const b of lookup(n.callee.name, chain) || []) {
          const fn = fnOf(b);
          if (fn && writesParam.has(fn)) for (const i of writesParam.get(fn)) if (n.arguments[i]) targets.push({ a: n.arguments[i], call: n.callee.name });
        }
      }
      for (const { a, call } of targets) {
        /* a relative path literal is resolved against the cwd — the checkout under `npm test` */
        const lit = a.type === 'Literal' && typeof a.value === 'string' ? a.value
          : a.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null;
        const o = lit != null ? new Set(/^([A-Za-z]:[\\/]|[\\/])/.test(lit) ? [] : ['checkout']) : origin(a, chain);
        judge(o, (kind) => push({ line: n.loc.start.line, kind, call, target: text(a).slice(0, 120) }));
        for (const m of paramsOf(o)) {
          if (o.has('tmp')) continue;
          const fn = fnAt.get(Number(m[2]));
          if (!fn) continue;
          if (!writesParam.has(fn)) writesParam.set(fn, new Set());
          if (!writesParam.get(fn).has(Number(m[1]))) { writesParam.get(fn).add(Number(m[1])); changed = true; }
        }
      }
    }
  }
  return problems.sort((x, y) => x.line - y.line);
}

function files(root) {
  const out = [];
  const w = (d) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      if (SKIP.has(f)) continue;
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) w(p);
      else if (/\.(m?js|cjs)$/.test(f)) out.push(p);
    }
  };
  for (const d of DIRS) w(join(root, d));
  return out;
}

/** Every refused write under tests/: [«file:line message»]. */
export function treeWriterProblems(root = ROOT) {
  const lines = [];
  for (const abs of files(root)) {
    const rel = relative(root, abs).split('\\').join('/');
    const found = scanSource(readFileSync(abs, 'utf8'));
    if (found == null) { lines.push(rel + ': does not parse, so what it writes cannot be read'); continue; }
    for (const p of found) {
      lines.push(p.kind === 'scratch'
        ? `${rel}:${p.line} ${p.call}(${p.target}) writes into a scratchTree() copy with fs — its files are hard links into the checkout; use the copy's write()/remove()/rename()/mutate()`
        : `${rel}:${p.line} ${p.call}(${p.target}) writes the checkout — break a private copy instead (tests/helpers/scratch-tree.mjs) and run the gate from it`);
    }
  }
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const lines = treeWriterProblems();
  for (const l of lines) console.log('  ✖ ' + l);
  console.log(lines.length ? `\n${lines.length} test-side write(s) into the checkout` : '✓ no test writes the checkout');
  process.exit(lines.length ? 1 : 0);
}
