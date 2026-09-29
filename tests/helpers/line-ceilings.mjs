/*
 * IntMap · line-ceilings — DOES THIS CODE HOLD A FILE'S LINE COUNT UNDER A NUMBER?  (gate-parity-and-shards)
 *
 *  #R795 retired the line ceilings over source files (a count of LINES could not tell a feature that
 *  moved out from a line joined to its neighbour — tests/r168 #8 has the history) and wrote a check
 *  that they do not come back. That check was a regular expression over one ASSERTION FORM,
 *  `assert.ok(<name> < N,`, with the name drawn from a short list (lines|shell|atlas|…). MEASURED
 *  2026-09-29, it missed five ceilings still standing, each for a reason of spelling alone:
 *      tests/r291 ⑳  `body.split('\n').length <= 4400`   — `<=` rather than `<`
 *      tests/r199 ⑤  `body < 5_200`                        — the variable is called `body`
 *      tests/r200 ⑤  `body < 4_400`                        — the same
 *      tests/r278 ⑦  `n < 5300`, n = ATLAS().split(/\r?\n/).length   — `n`, and a regex separator
 *      tests/r350 ⑨e `n < 5300`, n = read(…).split(/\r?\n/).length   — the same
 *  So this asks about the FACT, with a parser: a comparison whose one side is a number and whose
 *  other side is a line count of text read from a file, oriented so the number is the upper bound —
 *  `x < N`, `x <= N`, `N > x`, `N >= x` — wherever it appears (an assert.ok argument, a const, an if).
 *
 *  «a line count» is `.split(<newline>).length`, where the separator is any string containing a
 *  newline, any regular expression that matches one, or String.fromCharCode(10); or `.length` of a
 *  variable holding such a split. Identifiers and helper functions (`const n = (p) =>
 *  read(p).split('\n').length`) are followed to what they are bound to.
 *  «text read from a file» is a value that reaches a readFileSync call — directly, through a
 *  variable, through a method chain on it (`read(p).replace(…)`), through a local function, or
 *  through a function IMPORTED from a relative module (tests/r291's `read` is scripts/eol.mjs's
 *  readLF). The line count of a child process's OUTPUT is a different fact (how many lines a tool
 *  printed) and is not reported.
 *  ⚠ A FLOOR IS NOT A CEILING. `atlas > 0` (the form #R795 left behind so the tests still read the
 *  file) and «the modules hold more than N lines» are lower bounds, and are not reported.
 */
import { readFileSync, globSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/* how many bindings/calls/imports are followed. The deepest real chain today is 4 (a test's
   `read` → an imported helper → readFileSync, then `.split(...).length` through a const). */
const MAX_DEPTH = 8;

const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true });
const isFn = (x) => x.type === 'FunctionDeclaration' || x.type === 'FunctionExpression' || x.type === 'ArrowFunctionExpression';
const isReadFileCall = (n) => n.type === 'CallExpression'
  && ((n.callee.type === 'Identifier' && n.callee.name === 'readFileSync')
    || (n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'readFileSync'));

/** The bindings and imports of one module — scope-blind on purpose: a test file reuses names like `n`
    across tests, and following ANY binding of a name errs toward reporting, which is the safe side
    for a check whose failure mode is a ceiling that slips through. */
function moduleContext(ast, file) {
  const bound = new Map();
  const imports = new Map();
  const bind = (name, node) => { if (!bound.has(name)) bound.set(name, []); bound.get(name).push(node); };
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) bind(n.id.name, n.init);
    if (n.type === 'FunctionDeclaration' && n.id) bind(n.id.name, n);
    if (n.type === 'ImportDeclaration' && typeof n.source.value === 'string' && n.source.value.startsWith('.')) {
      for (const s of n.specifiers) if (s.type === 'ImportSpecifier') imports.set(s.local.name, { from: n.source.value, name: s.imported.name });
    }
  });
  /* `export { local as name }` inside this module */
  const exportAlias = new Map();
  walk.full(ast, (n) => {
    if (n.type === 'ExportNamedDeclaration' && !n.source) for (const s of n.specifiers || []) exportAlias.set(s.exported.name, s.local.name);
  });
  return { file, bound, imports, exportAlias };
}

const moduleCache = new Map();
function importedContext(ctx, spec) {
  if (!ctx.file) return null;
  const path = resolve(dirname(ctx.file), spec);
  if (!moduleCache.has(path)) {
    let c = null;
    try { if (existsSync(path)) c = moduleContext(parse(readFileSync(path, 'utf8')), path); } catch { c = null; }
    moduleCache.set(path, c);
  }
  return moduleCache.get(path);
}

function analyser(ctx) {
  const values = (c, name) => (c.bound.get(name) || []).filter((x) => !isFn(x));
  const fns = (c, name) => (c.bound.get(name) || []).filter(isFn);
  const returnsOf = (fn) => {
    if (fn.body.type !== 'BlockStatement') return [fn.body];
    const out = [];
    walk.simple(fn.body, { ReturnStatement(r) { if (r.argument) out.push(r.argument); } });
    return out;
  };
  /* a function reads a file if its body calls readFileSync, or calls a function that does */
  const fnReadsFile = (c, fn, d) => {
    if (d > MAX_DEPTH) return false;
    let yes = false;
    walk.full(fn.body, (n) => {
      if (yes || n.type !== 'CallExpression') return;
      if (isReadFileCall(n)) yes = true;
      else if (n.callee.type === 'Identifier') yes = calleeReadsFile(c, n.callee.name, d + 1);
    });
    return yes;
  };
  const calleeReadsFile = (c, name, d) => {
    if (d > MAX_DEPTH) return false;
    const local = fns(c, name);
    if (local.length) return local.some((f) => fnReadsFile(c, f, d + 1));
    const imp = c.imports.get(name);
    if (!imp) return false;
    const other = importedContext(c, imp.from);
    if (!other) return false;
    return calleeReadsFile(other, other.exportAlias.get(imp.name) || imp.name, d + 1);
  };

  const isNewline = (a, d = 0) => {
    if (!a || d > MAX_DEPTH) return false;
    if (a.type === 'Literal' && a.regex) {
      try { return new RegExp(a.regex.pattern, a.regex.flags.replace(/[gy]/g, '')).test('\n'); } catch { return false; }
    }
    if (a.type === 'Literal' && typeof a.value === 'string') return a.value.includes('\n');
    if (a.type === 'TemplateLiteral') return a.quasis.some((q) => (q.value.cooked || '').includes('\n'));
    if (a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && a.callee.property.name === 'fromCharCode') {
      return a.arguments.some((x) => x.type === 'Literal' && x.value === 10);
    }
    if (a.type === 'Identifier') return values(ctx, a.name).some((v) => isNewline(v, d + 1));
    return false;
  };

  const fnArgReadsFile = (a, d) => {
    if (d > MAX_DEPTH || !a) return false;
    if (isFn(a)) return fnReadsFile(ctx, a, d + 1);
    if (a.type === 'Identifier') return calleeReadsFile(ctx, a.name, d + 1);
    return false;
  };
  const fromFile = (n, d = 0) => {
    if (!n || d > MAX_DEPTH) return false;
    if (n.type === 'AwaitExpression' || n.type === 'ChainExpression' || n.type === 'ParenthesizedExpression') return fromFile(n.argument || n.expression, d + 1);
    if (n.type === 'Identifier') return values(ctx, n.name).some((v) => fromFile(v, d + 1));
    if (n.type === 'CallExpression') {
      if (isReadFileCall(n)) return true;
      const c = n.callee;
      if (c.type === 'Identifier') return calleeReadsFile(ctx, c.name, d + 1);
      if (c.type === 'MemberExpression') {
        /* read(p).replace(…) — the text flows through the method; and FILES.map(read).join(…) — a
           file-reading function handed to the method is where the text comes from */
        return fromFile(c.object, d + 1) || n.arguments.some((a) => fnArgReadsFile(a, d + 1));
      }
      return false;
    }
    if (n.type === 'MemberExpression') return fromFile(n.object, d + 1);
    if (n.type === 'ConditionalExpression') return fromFile(n.consequent, d + 1) || fromFile(n.alternate, d + 1);
    if (n.type === 'LogicalExpression') return fromFile(n.left, d + 1) || fromFile(n.right, d + 1);
    return false;
  };

  /* The lines of a file are still its lines after they are filtered, sliced or mapped — `.split('\n')
     .filter(notAnImport).length` is a line count of the file (MEASURED: #R795 retired one of exactly
     that shape in tests/r292). So the chain is followed down through the array methods that keep one
     element per line or fewer. */
  const LINE_PRESERVING = new Set(['filter', 'slice', 'map']);
  const isSplitByLine = (n, d) => {
    if (!n || d > MAX_DEPTH || n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return false;
    const m = n.callee.property.name;
    if (m === 'split') return isNewline(n.arguments[0], d) && fromFile(n.callee.object, d);
    if (LINE_PRESERVING.has(m)) return isSplitByLine(n.callee.object, d + 1)
      || (n.callee.object.type === 'Identifier' && values(ctx, n.callee.object.name).some((v) => isSplitByLine(v, d + 1)));
    return false;
  };

  const isLineCount = (n, d = 0) => {
    if (!n || d > MAX_DEPTH) return false;
    if (n.type === 'AwaitExpression' || n.type === 'ChainExpression' || n.type === 'ParenthesizedExpression') return isLineCount(n.argument || n.expression, d + 1);
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'length') {
      if (isSplitByLine(n.object, d)) return true;
      if (n.object.type === 'Identifier') return values(ctx, n.object.name).some((v) => isSplitByLine(v, d + 1));
      return false;
    }
    if (n.type === 'Identifier') return values(ctx, n.name).some((v) => isLineCount(v, d + 1));
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      return fns(ctx, n.callee.name).some((f) => returnsOf(f).some((r) => isLineCount(r, d + 1)));
    }
    return false;
  };
  return { isLineCount };
}

/**
 * The line ceilings in one source text. `file` (absolute) lets imported helpers be followed.
 * @param {string} src
 * @param {{ file?: string }} [o]
 * @returns {{ line: number, text: string }[]}
 */
export function lineCeilings(src, { file } = {}) {
  const ast = parse(src);
  const { isLineCount } = analyser(moduleContext(ast, file));
  const isNumber = (n) => n.type === 'Literal' && typeof n.value === 'number';
  const hits = [];
  walk.full(ast, (n) => {
    if (n.type !== 'BinaryExpression') return;
    /* orient so that [count, bound] reads «count is below bound» */
    const pair = n.operator === '<' || n.operator === '<=' ? [n.left, n.right]
      : n.operator === '>' || n.operator === '>=' ? [n.right, n.left] : null;
    if (pair && isNumber(pair[1]) && isLineCount(pair[0])) hits.push({ line: n.loc.start.line, text: src.slice(n.start, n.end) });
  });
  return hits;
}

/** Every line ceiling held by a node test file of the repository at `root`. */
export function repositoryLineCeilings(root) {
  const out = [];
  for (const rel of globSync('tests/**/*.test.mjs', { cwd: root }).map((f) => f.split('\\').join('/')).sort()) {
    const file = join(root, rel);
    for (const h of lineCeilings(readFileSync(file, 'utf8'), { file })) out.push(`${rel}:${h.line}: ${h.text}`);
  }
  return out;
}
