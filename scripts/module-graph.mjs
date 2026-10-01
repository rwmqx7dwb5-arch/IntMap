/* ============================================================================
 *  IntMap · THE MODULE GRAPH — measured, planned, and migrated one edge at a time  (module-graph)
 * ----------------------------------------------------------------------------
 *  「求めるのは修正ではなく革命・改革。整形ではなく造形。」
 *
 *  Until 2026-10-01 the files of js/ and src/ were joined through `window`: a file published itself
 *  as `window.IntMapX = …` and every reader reached for `window.IntMapX` again. Measured that day on
 *  the tree this file was written against: 650 names published, 6,388 reads of them from js/ and
 *  src/, 203 of 392 files with any `import`, and src/main.js holding 136 hand-ordered import lines
 *  plus a 107-name list of factories it could only check AFTER the fact («ORDER IS LOAD-BEARING»).
 *  An edge that lives on `window` is invisible to the bundler, to Node, to the type checker and to
 *  the reader — which is why 216 of 421 node checks evaluated shipped code by reading its TEXT.
 *
 *  This is the instrument and the tool for turning those edges into `import`:
 *
 *      node scripts/module-graph.mjs                    the graph's numbers (the ledger's columns)
 *      node scripts/module-graph.mjs --plan             what to migrate next, leaves first
 *      node scripts/module-graph.mjs --migrate NAME     dry run: which readers of window.NAME change
 *      node scripts/module-graph.mjs --migrate NAME --write
 *
 *  ── WHAT --migrate DOES, AND WHY IT IS SAFE TO DO MECHANICALLY ─────────────────────────────────
 *  For a global NAME whose owner `export`s it (`export const NAME = …` in exactly one file), every
 *  js/ or src/ file that reads `window.NAME` gets `import { NAME } from '<owner>'` and each read
 *  becomes the bare binding. Three facts make that a no-op for behaviour, and the tool checks each
 *  rather than assuming it:
 *    · IDENTITY — the owner publishes the same object it exports, and nothing else assigns
 *      `window.NAME` (refused if anything in js/ or src/ does: a reassigned global and an import
 *      binding would part).
 *    · ORDER — an import is evaluated before its importer. The read can only see the object
 *      EARLIER than it did, never later; the reads that guarded against «not yet» keep guarding.
 *    · REACH — only files that are ES modules in every context that loads them are touched: reached
 *      from src/main.js (statically or by `import()`), not loaded as a classic <script> by a page,
 *      and not inside a Worker's graph. Anything else is reported, not rewritten.
 *  A file that declares its own binding called NAME is rewritten only when that declaration is the
 *  plain alias `const NAME = window.NAME` (the declaration is dropped); any other shadowing is
 *  reported for a person to decide.
 *
 *  ── LEAVES FIRST (--plan) ──────────────────────────────────────────────────────────────────────
 *  A name can be migrated once its owner is a module that exports it. An owner is a LEAF when every
 *  global it itself reads off `window` is already imported — then converting it cannot introduce a
 *  cycle through the names still on `window`. --plan ranks the remaining names by reads, marks
 *  which owners are leaves, and says what blocks the rest.
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { windowPublications } from './global-surface.mjs';
import { codeOnly } from './code-only.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCE_DIRS = ['js', 'src'];
const PAGES = ['index.html', 'admin.html', 'privacy.html', 'terms.html', 'science.html', 'sources.html'];

export function sourceFiles(root = ROOT) {
  const out = [];
  const walk = (rel) => {
    const d = join(root, rel);
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = rel + '/' + e.name;
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  SOURCE_DIRS.forEach(walk);
  return out.sort();
}

export function parse(src) {
  for (const sourceType of ['module', 'script']) {
    try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: sourceType === 'script' }); } catch (_) { /* try the other */ }
  }
  return null;
}

function walk(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (fn(node, parent) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, fn, node); }
    else if (v && typeof v.type === 'string') walk(v, fn, node);
  }
}

/* the global object, by any of its three names — `globalThis.X =` publishes exactly what `window.X =`
   does (scripts/global-surface.mjs counts both), so a read through either is the same edge */
const GLOBAL_OBJECT = new Set(['window', 'globalThis', 'self']);
const isWindow = (n) => n && n.type === 'Identifier' && GLOBAL_OBJECT.has(n.name);
const memberName = (n) => (!n.computed && n.property.type === 'Identifier' ? n.property.name
  : (n.computed && n.property.type === 'Literal' && typeof n.property.value === 'string' ? n.property.value : null));

/** Static facts about one file: its imports, exports, `window.X` reads and writes. */
export function fileFacts(rel, root = ROOT) {
  const src = readFileSync(join(root, rel), 'utf8');
  const ast = parse(src);
  const facts = { rel, src, ast, parsed: !!ast, imports: [], dynamicImports: [], globs: [], exports: new Set(), reads: [], writes: new Set(), declares: new Set(), imported: new Set(), bare: new Map() };
  if (!ast) return facts;
  walk(ast, (n, parent) => {
    if (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) facts.imports.push(n.source.value);
    if (n.type === 'ImportExpression' && n.source.type === 'Literal') facts.dynamicImports.push(n.source.value);
    /* the bundler's `import.meta.glob('../js/locales/ui.*.js')` is a set of dynamic imports */
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'glob'
      && n.callee.object.type === 'MetaProperty' && n.arguments[0] && n.arguments[0].type === 'Literal') facts.globs.push(n.arguments[0].value);
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) {
        if (n.declaration.id) facts.exports.add(n.declaration.id.name);
        for (const d of n.declaration.declarations || []) if (d.id.type === 'Identifier') facts.exports.add(d.id.name);
      }
      for (const s of n.specifiers || []) facts.exports.add(s.exported.name || s.exported.value);
    }
    if (n.type === 'ExportDefaultDeclaration') facts.exports.add('default');
    if (n.type === 'ImportDeclaration') for (const sp of n.specifiers) facts.imported.add(sp.local.name);
    /* a BARE reference — the implicit global (`IntMapGeoEngine.camera` with no window. in front) is the same
       edge as `window.IntMapGeoEngine`, and only a file that neither declares nor imports the name has one */
    if (n.type === 'Identifier' && isReference(n, parent)) facts.bare.set(n.name, (facts.bare.get(n.name) || 0) + 1);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') facts.declares.add(n.id.name);
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) facts.declares.add(n.id.name);
    if (/Function/.test(n.type)) for (const p of n.params) if (p.type === 'Identifier') facts.declares.add(p.name);
    if (n.type === 'MemberExpression' && isWindow(n.object)) {
      const name = memberName(n);
      if (!name) return;
      const assigned = parent && parent.type === 'AssignmentExpression' && parent.left === n;
      const updated = parent && parent.type === 'UpdateExpression';
      const deleted = parent && parent.type === 'UnaryExpression' && parent.operator === 'delete';
      if (assigned || updated || deleted) facts.writes.add(name);
      else facts.reads.push({ name, start: n.start, end: n.end });
    }
  });
  return facts;
}

function isReference(n, p) {
  if (!p) return true;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed) return false;
  if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed) return p.type === 'Property' && p.shorthand;
  if (p.type === 'VariableDeclarator' && p.id === n) return false;
  if (/Function|Class/.test(p.type) && (p.id === n || (p.params || []).includes(n))) return false;
  if (/Import|Export/.test(p.type) && p.type !== 'ExportDefaultDeclaration') return false;
  if ((p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') && p.label === n) return false;
  if (p.type === 'CatchClause' && p.param === n) return false;
  if (p.type === 'AssignmentPattern' && p.left === n) return false;
  if (p.type === 'ArrayPattern' || p.type === 'RestElement') return false;
  return true;
}

const resolveRel = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  return posix.normalize(posix.join(posix.dirname(from), spec));
};

/** The whole graph: per-file facts, reachability from the page entries, worker graphs, classic loads. */
export function graph(root = ROOT) {
  const files = sourceFiles(root);
  const facts = new Map(files.map((f) => [f, fileFacts(f, root)]));
  const reach = (entries, withDynamic) => {
    const seen = new Set();
    const stack = entries.filter((e) => facts.has(e));
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      const ff = facts.get(f);
      for (const s of [...ff.imports, ...(withDynamic ? ff.dynamicImports : [])]) {
        const r = resolveRel(f, s);
        if (r && facts.has(r) && !seen.has(r)) stack.push(r);
      }
      if (withDynamic) for (const g of ff.globs) {
        const pat = resolveRel(f, g);
        if (!pat) continue;
        const re = new RegExp('^' + pat.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
        for (const cand of facts.keys()) if (re.test(cand) && !seen.has(cand)) stack.push(cand);
      }
    }
    return seen;
  };
  /* worker entries: every `new Worker(new URL('./x.js', import.meta.url))` */
  const workerEntries = [];
  for (const [f, ff] of facts) for (const m of ff.src.matchAll(/new\s+Worker\(\s*new\s+URL\(\s*['"](\.[^'"]+)['"]/g)) { const r = resolveRel(f, m[1]); if (r) workerEntries.push(r); }
  const inWorker = reach(workerEntries, true);
  /* classic loads: <script src> without type=module in a page, minus the module entry itself */
  const classic = new Set();
  const moduleEntries = [];
  for (const p of PAGES) {
    if (!existsSync(join(root, p))) continue;
    const html = codeOnly(readFileSync(join(root, p), 'utf8'), { lang: 'html' });   /* a commented-out tag loads nothing */
    for (const m of html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/g)) {
      const attrs = m[1] + ' ' + m[3];
      const rel = m[2].replace(/^\.?\//, '');
      if (/type=["']module["']/.test(attrs)) moduleEntries.push(rel); else classic.add(rel);
    }
  }
  const asModule = reach(moduleEntries, true);
  return { files, facts, asModule, inWorker, classic, workerEntries, moduleEntries };
}

/** Owner of NAME: the one file that exports it AND publishes it on the global. */
export function ownerOf(G, name) {
  const owners = [...G.facts.values()].filter((f) => f.exports.has(name));
  return owners.length === 1 ? owners[0].rel : null;
}

/** Can this file take an `import`? (see REACH in the header) */
export function importable(G, rel) {
  if (!G.asModule.has(rel)) return 'not reached from a page module entry';
  if (G.classic.has(rel)) return 'loaded as a classic <script> by a page';
  if (G.inWorker.has(rel)) return 'inside a Worker graph';
  return '';
}

function eolOf(src) { return /\r\n/.test(src) ? '\r\n' : '\n'; }

/** Where the import line goes: after the last top-level import, else after the leading comments. */
function importInsertAt(ff) {
  const body = ff.ast.body;
  let lastImport = null;
  for (const n of body) if (n.type === 'ImportDeclaration') lastImport = n;
  /* after the END OF THE LINE the last import is on — a trailing `/* why … *\/` belongs to that import */
  if (lastImport) {
    let at = ff.src.indexOf('\n', lastImport.end);
    if (at < 0) at = ff.src.length; else if (ff.src[at - 1] === '\r') at -= 1;
    return { at, lead: true };
  }
  const first = body[0];
  if (!first) return { at: ff.src.length, lead: true };
  /* before the first statement, i.e. after the header comment block */
  let at = first.start;
  /* keep a leading `// @ts-check` / directive prologue above us */
  if (first.type === 'ExpressionStatement' && first.directive) return { at: first.end, lead: true };
  return { at, lead: false };
}

/** `src` with `import { NAME } from '<owner>'` added if it does not already import NAME — for a script that
    WRITES code which uses NAME (a codemod, the new-language scaffold), so what it writes is a module edge
    and not a read of the global that check:surface would refuse. `rel` is the file's repository path. */
export function ensureImport(src, rel, name, ownerRel) {
  const ast = parse(src);
  if (!ast) return src;
  if (ast.body.some((n) => n.type === 'ImportDeclaration' && n.specifiers.some((s) => s.local.name === name))) return src;
  let spec = posix.relative(posix.dirname(rel), ownerRel);
  if (!spec.startsWith('.')) spec = './' + spec;
  const line = `import { ${name} } from '${spec}';`;
  const ins = importInsertAt({ ast, src });
  const eol = eolOf(src);
  return src.slice(0, ins.at) + (ins.lead ? eol + line : line + eol) + src.slice(ins.at);
}

/** Rewrite one file's reads of window.NAME into an import binding. Returns {text, reads, note} or {skip}. */
export function migrateFile(G, rel, name, ownerRel) {
  const ff = G.facts.get(rel);
  if (!ff || !ff.parsed) return { skip: 'does not parse' };
  const reads = ff.reads.filter((r) => r.name === name);
  const bare = !ff.declares.has(name) && !ff.imported.has(name) ? (ff.bare.get(name) || 0) : 0;
  if (!reads.length && !bare) return { skip: 'no reads' };
  const why = importable(G, rel);
  if (why) return { skip: why };
  if (ff.writes.has(name)) return { skip: 'assigns window.' + name };
  /* shadowing: a binding named NAME anywhere in the file */
  const edits = [];
  if (ff.declares.has(name)) {
    let other = false;
    walk(ff.ast, (n, parent) => {
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name) {
        const init = n.init;
        const alias = init && init.type === 'MemberExpression' && isWindow(init.object) && memberName(init) === name;
        if (!alias) { other = true; return; }
        /* drop the alias: the whole statement when it is the sole declarator */
        if (parent.declarations.length === 1) edits.push({ start: parent.start, end: parent.end, text: '' });
        else other = true;
      }
      if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id && n.id.name === name) other = true;
      if (/Function/.test(n.type) && n.params.some((p) => p.type === 'Identifier' && p.name === name)) other = true;
    });
    if (other) return { skip: 'declares its own binding named ' + name };
  }
  const dropped = edits.map((e) => [e.start, e.end]);
  for (const r of reads) {
    if (dropped.some(([s, e]) => r.start >= s && r.end <= e)) continue;
    edits.push({ start: r.start, end: r.end, text: name });
  }
  const eol = eolOf(ff.src);
  let spec = posix.relative(posix.dirname(rel), ownerRel);
  if (!spec.startsWith('.')) spec = './' + spec;
  const line = `import { ${name} } from '${spec}';`;
  const ins = importInsertAt(ff);
  edits.push({ start: ins.at, end: ins.at, text: ins.lead ? eol + line : line + eol });
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let text = ff.src;
  for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return { text, reads: reads.length + bare };
}

export function migrate(name, { write = false, root = ROOT } = {}) {
  const G = graph(root);
  const owner = ownerOf(G, name);
  if (!owner) return { ok: false, why: `no single file exports ${name} — convert its owner first (export const ${name} = …)` };
  const writers = [...G.facts.values()].filter((f) => f.writes.has(name) && f.rel !== owner).map((f) => f.rel);
  if (writers.length) return { ok: false, why: `window.${name} is assigned outside its owner: ${writers.join(', ')}` };
  const changed = [], skipped = [];
  for (const rel of G.files) {
    if (rel === owner) continue;
    const r = migrateFile(G, rel, name, owner);
    if (r.skip) { if (r.skip !== 'no reads') skipped.push({ rel, why: r.skip, reads: G.facts.get(rel).reads.filter((x) => x.name === name).length }); continue; }
    changed.push({ rel, reads: r.reads });
    if (write) writeFileSync(join(root, rel), r.text);
  }
  return { ok: true, owner, changed, skipped };
}

/* ══ AN OWNER BECOMES A MODULE (--export NAME) ═════════════════════════════════════════════════
   The step before --migrate. `window.NAME = <expr>;` at the top level of its one owner becomes
   `export const NAME = <expr>;` followed by the compat publication `globalThis.NAME = NAME;` (what the
   browser specs, the console and the not-yet-migrated readers still see — the SAME object), and the
   owner's own reads of window.NAME become the binding. Refused when the publication is not a single
   top-level statement in a file that is a module everywhere it is loaded. */
export function exportOwner(name, { write = false, root = ROOT } = {}) {
  const G = graph(root);
  const owners = [...G.facts.values()].filter((f) => f.writes.has(name));
  if (owners.length !== 1) return { ok: false, why: `window.${name} is assigned in ${owners.length} files (${owners.map((f) => f.rel).join(', ')})` };
  const ff = owners[0];
  const why = importable(G, ff.rel);
  if (why) return { ok: false, why: `${ff.rel}: ${why}` };
  if (ff.exports.has(name)) return { ok: false, why: `${ff.rel} already exports ${name}` };
  if (ff.declares.has(name) || ff.imported.has(name)) return { ok: false, why: `${ff.rel} already has a binding named ${name}` };
  let stmt = null, count = 0;
  walk(ff.ast, (n, parent) => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && isWindow(n.left.object) && memberName(n.left) === name) {
      count++;
      if (parent && parent.type === 'ExpressionStatement' && ff.ast.body.includes(parent) && n.operator === '=') stmt = parent;
    }
  });
  if (count !== 1 || !stmt) return { ok: false, why: `${ff.rel}: window.${name} is not published by exactly one top-level \`window.${name} = …;\`` };
  const eol = eolOf(ff.src);
  const assign = stmt.expression;
  const edits = [];
  /* the statement head `window.NAME =` → `export const NAME =`; the right-hand side stays byte for byte */
  edits.push({ start: stmt.start, end: assign.right.start, text: `export const ${name} = ` });
  let end = stmt.end; if (ff.src[end - 1] !== ';') edits.push({ start: end, end, text: ';' });
  edits.push({ start: end, end, text: eol + `globalThis.${name} = ${name};   /* (module-graph) the compat window: importers get the binding above */` });
  for (const r of ff.reads.filter((x) => x.name === name)) edits.push({ start: r.start, end: r.end, text: name });
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let text = ff.src;
  for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  if (write) writeFileSync(join(root, ff.rel), text);
  return { ok: true, owner: ff.rel };
}

/* ══ THE FACTORY REGISTRY, DISSOLVED (--factories) ═════════════════════════════════════════════
   `window.IntMapModules.x = function (HOST) { … };` was how a split-out file handed its factory to
   js/app-body.js: by a string key on a shared object, checked after the fact by src/main.js's
   MODULE_FACTORIES list. Each becomes `export function x(HOST) { … }`, and each caller imports the
   name from the file that defines it — a missing factory is then a link error the bundler and the
   browser both refuse, instead of a console line after boot.
   ⚠ A STATIC EDGE TO A LAZY FILE WOULD MOVE IT INTO THE START-UP BUNDLE. A caller is rewritten only
   when the defining file is already in src/main.js's static graph; js/lazy-modules.js receives the
   namespace its own import() resolves to instead (written by hand, once). */
const isRegistry = (n) => n && n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier'
  && n.property.name === 'IntMapModules' && isWindow(n.object);

export function factories(root = ROOT) {
  const G = graph(root);
  const eager = (() => {
    const seen = new Set(); const stack = ['src/main.js'];
    while (stack.length) { const f = stack.pop(); if (seen.has(f) || !G.facts.has(f)) continue; seen.add(f); for (const s of G.facts.get(f).imports) { const r = resolveRel(f, s); if (r) stack.push(r); } }
    return seen;
  })();
  const defs = new Map();   /* name → { rel, stmt, fn } */
  const problems = [];
  for (const ff of G.facts.values()) {
    walk(ff.ast, (n, parent) => {
      if (n.type !== 'AssignmentExpression' || n.left.type !== 'MemberExpression' || !isRegistry(n.left.object)) return;
      const name = !n.left.computed && n.left.property.name;
      const stmt = ff.ast.body.find((s) => s.type === 'ExpressionStatement' && s.expression === n);
      const fn = n.right;
      if (!name || !stmt || fn.type !== 'FunctionExpression') { problems.push(`${ff.rel}: ${name || '?'} is not a top-level function registration — move it by hand`); return; }
      if (defs.has(name)) { problems.push(`${name} registered twice (${defs.get(name).rel}, ${ff.rel})`); return; }
      defs.set(name, { rel: ff.rel, stmt, fn });
    });
  }
  /* every other mention of the registry: a call or a test of one factory, or the bare registry */
  const uses = new Map();   /* rel → [{start,end,name}] */
  const inits = new Map();  /* rel → [stmt] (window.IntMapModules = window.IntMapModules || {}) */
  for (const ff of G.facts.values()) {
    walk(ff.ast, (n, parent) => {
      if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && isRegistry(n.expression.left)) {
        if (!inits.has(ff.rel)) inits.set(ff.rel, []); inits.get(ff.rel).push(n); return false;
      }
      /* the bare registry in a test (`window.IntMapModules && …`): once nothing creates it, that test is
         false forever — never rewritten silently */
      if (isRegistry(n) && !(parent && parent.type === 'MemberExpression' && parent.object === n)
        && !(parent && parent.type === 'AssignmentExpression' && parent.left === n)) {
        if (!uses.has(ff.rel)) uses.set(ff.rel, []);
        uses.get(ff.rel).push({ start: n.start, end: n.end, name: null });
      }
      if (n.type === 'MemberExpression' && isRegistry(n.object) && !(parent && parent.type === 'AssignmentExpression' && parent.left === n)) {
        const name = !n.computed && n.property.name;
        if (!uses.has(ff.rel)) uses.set(ff.rel, []);
        uses.get(ff.rel).push({ start: n.start, end: n.end, name });
      }
    });
  }
  return { G, eager, defs, uses, inits, problems };
}

export function migrateFactories({ write = false, root = ROOT } = {}) {
  const F = factories(root);
  const { G, eager, defs, uses, inits } = F;
  const problems = F.problems.slice();
  const out = new Map();   /* rel → edits */
  const add = (rel, e) => { if (!out.has(rel)) out.set(rel, []); out.get(rel).push(e); };
  const needs = new Map(); /* rel → Set(name) to import */
  /* callers first: decide which files can take the edge */
  const blocked = new Set();
  for (const [rel, list] of uses) {
    const ff = G.facts.get(rel);
    for (const u of list) {
      if (!u.name || !defs.has(u.name)) { problems.push(`${rel}: reads the registry itself (${ff.src.slice(u.start, u.end + 20).replace(/\s+/g, ' ')}…) — by hand`); blocked.add(rel); continue; }
      const d = defs.get(u.name);
      if (d.rel !== rel && !eager.has(d.rel)) { problems.push(`${rel}: calls ${u.name}, defined in the lazy ${d.rel} — a static import would make it eager; by hand`); blocked.add(rel); continue; }
      if (d.rel !== rel && ff.declares.has(u.name)) { problems.push(`${rel}: declares its own ${u.name} — by hand`); blocked.add(rel); continue; }
    }
  }
  for (const [rel, list] of uses) {
    if (blocked.has(rel)) continue;
    for (const u of list) {
      add(rel, { start: u.start, end: u.end, text: u.name });
      const d = defs.get(u.name);
      if (d.rel !== rel) { if (!needs.has(rel)) needs.set(rel, new Map()); needs.get(rel).set(u.name, d.rel); }
    }
  }
  /* definitions */
  for (const [name, d] of defs) {
    const ff = G.facts.get(d.rel);
    const { stmt, fn } = d;
    const between = ff.src.slice(stmt.expression.left.end, fn.start).replace(/^\s*=/, '').trim();   /* a comment between `=` and `function` */
    let fnText = ff.src.slice(fn.start, fn.end);
    if (fn.id && fn.id.name !== name) { problems.push(`${d.rel}: the function registered as ${name} is named ${fn.id.name} — renamed`); }
    fnText = fnText.replace(/^(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/, (_m, a) => (a || '') + 'function ' + name + '(');
    add(d.rel, { start: stmt.start, end: stmt.end, text: (between ? between + ' ' : '') + 'export ' + fnText });
  }
  for (const [rel, stmts] of inits) for (const s of stmts) add(rel, { start: s.start, end: s.end, text: '' });
  /* imports */
  for (const [rel, m] of needs) {
    const ff = G.facts.get(rel);
    const eol = eolOf(ff.src);
    const byFile = new Map();
    for (const [name, from] of m) { if (!byFile.has(from)) byFile.set(from, []); byFile.get(from).push(name); }
    const lines = [...byFile].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([from, names]) => {
      let spec = posix.relative(posix.dirname(rel), from); if (!spec.startsWith('.')) spec = './' + spec;
      return `import { ${names.sort().join(', ')} } from '${spec}';`;
    });
    const ins = importInsertAt(ff);
    add(rel, { start: ins.at, end: ins.at, text: ins.lead ? eol + lines.join(eol) : lines.join(eol) + eol });
  }
  const changed = [];
  for (const [rel, edits] of out) {
    const ff = G.facts.get(rel);
    edits.sort((a, b) => b.start - a.start || b.end - a.end);
    let text = ff.src;
    for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    changed.push(rel);
    if (write) writeFileSync(join(root, rel), text);
  }
  return { factories: defs.size, changed, problems };
}

/* ══ THE ENTRY, DERIVED (--entry) ═══════════════════════════════════════════════════════════════
   src/main.js imported every file in a hand-kept order because nothing else said who needed whom.
   A line there is LOAD-BEARING only if evaluating that file at that moment has an effect someone
   later relies on. A file can leave the list — and be evaluated when its first importer is — when:
     · PURE: its top level only declares (imports, exports, function and class declarations, and
       consts whose initialisers run no code: functions, arrows, literals); evaluating it earlier or
       later is unobservable;
     · REACHED: some other module in the start-up graph imports it, so it is still loaded;
     · NOTHING MOVES WITH IT: every impure file it pulls in transitively is evaluated before its old
       slot anyway (an earlier main.js line, or one of those lines' own imports), so dropping it cannot
       make a side effect happen later than it did.
   What stays in src/main.js is the list of files whose side effects have not been turned into
   imports yet — the migration's remaining work, not an order to memorise. */
function inertInit(n) {
  if (!n) return true;
  if (/Function/.test(n.type) || n.type === 'Literal' || n.type === 'ClassExpression') return true;
  if (n.type === 'TemplateLiteral') return n.expressions.length === 0;
  if (n.type === 'ArrayExpression') return n.elements.every((e) => !e || inertInit(e));
  if (n.type === 'ObjectExpression') return n.properties.every((p) => p.type === 'Property' && !p.computed && inertInit(p.value));
  if (n.type === 'UnaryExpression' && n.operator === '-') return inertInit(n.argument);
  return false;
}
export function isPure(ff) {
  return ff.parsed && ff.ast.body.every((s) => {
    if (s.type === 'ImportDeclaration' || s.type === 'EmptyStatement' || s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') return true;
    if (s.type === 'ExpressionStatement') return !!s.directive;
    if (s.type === 'ExportAllDeclaration') return true;
    if (s.type === 'ExportNamedDeclaration') {
      const d = s.declaration;
      if (!d) return true;
      if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') return true;
      if (d.type === 'VariableDeclaration') return d.declarations.every((x) => inertInit(x.init));
      return false;
    }
    if (s.type === 'ExportDefaultDeclaration') return /Function|Class/.test(s.declaration.type);
    if (s.type === 'VariableDeclaration') return s.declarations.every((x) => inertInit(x.init));
    return false;
  });
}

export function entryPlan(root = ROOT) {
  const G = graph(root);
  const main = G.facts.get('src/main.js');
  const lines = main.ast.body.filter((n) => n.type === 'ImportDeclaration').map((n) => ({ node: n, rel: resolveRel('src/main.js', n.source.value) }));
  const deps = (f) => (G.facts.get(f) ? G.facts.get(f).imports.map((s) => resolveRel(f, s)).filter((r) => r && G.facts.has(r)) : []);
  const closure = (f) => { const seen = new Set(); const st = [f]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); deps(x).forEach((d) => st.push(d)); } return seen; };
  /* who imports whom, inside the start-up graph, not counting src/main.js itself */
  const importers = new Map();
  for (const f of closure('src/main.js')) if (f !== 'src/main.js') for (const d of deps(f)) { if (!importers.has(d)) importers.set(d, new Set()); importers.get(d).add(f); }
  const out = [];
  const evaluatedBefore = new Set();   /* files evaluated before the current line (kept lines and their closures) */
  for (const L of lines) {
    const rel = L.rel;
    const ff = rel && G.facts.get(rel);
    let keep = '';
    if (!ff) keep = 'not a js/ or src/ file';
    else if (!isPure(ff)) keep = 'its top level does something';
    else if (!(importers.get(rel) && importers.get(rel).size)) keep = 'nothing else imports it';
    else {
      const moved = [...closure(rel)].filter((x) => x !== rel && !evaluatedBefore.has(x) && !isPure(G.facts.get(x)));
      if (moved.length) keep = 'it pulls in ' + moved.slice(0, 3).join(', ') + (moved.length > 3 ? ', …' : '') + ' early';
    }
    out.push({ rel, keep, node: L.node });
    if (keep) for (const x of closure(rel)) evaluatedBefore.add(x);
  }
  return { G, main, lines: out };
}

/** Rewrite src/main.js without the lines that carry no ordering (and the comment attached to each). */
export function pruneEntry({ write = false, root = ROOT } = {}) {
  const { main, lines } = entryPlan(root);
  const src = main.src;
  const drop = lines.filter((l) => !l.keep);
  const edits = [];
  for (const l of drop) {
    /* the whole physical line(s) of the import, including a trailing same-line comment */
    let start = src.lastIndexOf('\n', l.node.start - 1) + 1;
    let end = src.indexOf('\n', l.node.end); end = end < 0 ? src.length : end + 1;
    /* …and a block comment that sits directly above it with no blank line between, when nothing else
       follows that comment */
    const before = src.slice(0, start);
    const m = /\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*\r?\n$/.exec(before);
    if (m) {
      const cStart = before.lastIndexOf('\n', m.index - 1) + 1;
      if (/^\s*$/.test(src.slice(cStart, m.index))) start = cStart;
    }
    edits.push({ start, end });
  }
  edits.sort((a, b) => b.start - a.start);
  let text = src;
  for (const e of edits) text = text.slice(0, e.start) + text.slice(e.end);
  if (write) writeFileSync(join(root, 'src/main.js'), text);
  return { dropped: drop.map((l) => l.rel), kept: lines.filter((l) => l.keep).map((l) => ({ rel: l.rel, why: l.keep })) };
}

/** Every read of a published global from js/ and src/, by name (the `reads` register of check:surface). */
export function windowReads(root = ROOT, published) {
  const G = graph(root);
  const by = new Map();
  for (const ff of G.facts.values()) for (const r of ff.reads) {
    if (published && !published.has(r.name)) continue;
    by.set(r.name, (by.get(r.name) || 0) + 1);
  }
  return Object.fromEntries([...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** Globals whose one publishing file also EXPORTS them — they have an import edge, so a module that still
    reads them off `window` is reaching around it. → [{ name, owner, readers: [{rel, reads}] }] */
export function exportedGlobals(root = ROOT) {
  const G = graph(root);
  const out = [];
  for (const ff of G.facts.values()) {
    for (const name of ff.exports) {
      if (!ff.writes.has(name)) continue;
      const others = [...G.facts.values()].filter((f) => f !== ff && f.writes.has(name));
      if (others.length) continue;
      const readers = [];
      for (const r of G.facts.values()) {
        const n = r.reads.filter((x) => x.name === name).length
          + (r !== ff && !r.declares.has(name) && !r.imported.has(name) ? (r.bare.get(name) || 0) : 0);
        if (n && !importable(G, r.rel)) readers.push({ rel: r.rel, reads: n, exempt: importable(G, r.rel) });
        else if (n) readers.push({ rel: r.rel, reads: n });
      }
      out.push({ name, owner: ff.rel, readers });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** The ledger's columns. */
export function report(root = ROOT) {
  const G = graph(root);
  const all = [...G.facts.values()];
  /* reads of names js/ or src/ itself publishes — `window.location` or `window.maplibregl` is the
     platform or a vendor, not an edge between two of our files */
  const published = new Set(windowPublications(root).keys());
  const ours = (f) => f.reads.filter((r) => published.has(r.name));
  const reads = all.reduce((s, f) => s + ours(f).length, 0);
  const withImport = all.filter((f) => f.imports.length || f.exports.size).length;
  const main = G.facts.get('src/main.js');
  const mainImports = main ? main.ast.body.filter((n) => n.type === 'ImportDeclaration').length : 0;
  const registrations = all.reduce((s, f) => s + (f.src.match(/(?<![\w$])window\.IntMapModules\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || []).length, 0);
  const names = new Set(all.flatMap((f) => ours(f).map((r) => r.name)));
  return { files: all.length, withImport, windowOnly: all.length - withImport, mainImports, reads, namesRead: names.size, registrations };
}

/** Leaves first: what can move next, and what blocks the rest. */
export function plan(root = ROOT) {
  const G = graph(root);
  const pubBy = new Map();   /* name → files that write window.name */
  for (const ff of G.facts.values()) for (const w of ff.writes) { if (!pubBy.has(w)) pubBy.set(w, []); pubBy.get(w).push(ff.rel); }
  const readBy = new Map();
  for (const ff of G.facts.values()) for (const r of ff.reads) { if (!readBy.has(r.name)) readBy.set(r.name, new Set()); readBy.get(r.name).add(ff.rel); }
  const rows = [];
  for (const [name, readers] of readBy) {
    const owners = pubBy.get(name) || [];
    if (!owners.length) continue;   /* not published by js/src (a vendor global such as maplibregl) */
    const count = [...readers].reduce((s, f) => s + G.facts.get(f).reads.filter((r) => r.name === name).length, 0);
    const owner = owners.length === 1 ? owners[0] : null;
    const exported = owner ? G.facts.get(owner).exports.has(name) : false;
    const ownerReads = owner ? [...new Set(G.facts.get(owner).reads.map((r) => r.name))].filter((n) => n !== name && pubBy.has(n)) : [];
    rows.push({ name, reads: count, readers: readers.size, owner: owner || owners.join(' + '), exported, leaf: !!owner && ownerReads.length === 0, blockedBy: ownerReads });
  }
  return rows.sort((a, b) => b.reads - a.reads);
}

if (process.argv[1] && process.argv[1].endsWith('module-graph.mjs')) {
  const args = process.argv.slice(2);
  if (args[0] === '--migrate') {
    const r = migrate(args[1], { write: args.includes('--write') });
    if (!r.ok) { console.error('module-graph: ' + r.why); process.exit(1); }
    console.log(`${args.includes('--write') ? 'migrated' : 'would migrate'} window.${args[1]} → import from ${r.owner}: ${r.changed.length} files, ${r.changed.reduce((s, c) => s + c.reads, 0)} reads`);
    for (const s of r.skipped) console.log(`  skipped ${s.rel} (${s.reads} reads) — ${s.why}`);
  } else if (args[0] === '--export') {
    const r = exportOwner(args[1], { write: args.includes('--write') });
    if (!r.ok) { console.error('module-graph: ' + r.why); process.exit(1); }
    console.log(`${args.includes('--write') ? 'exported' : 'would export'} ${args[1]} from ${r.owner}`);
  } else if (args[0] === '--factories') {
    const r = migrateFactories({ write: args.includes('--write') });
    console.log(`${args.includes('--write') ? 'exported' : 'would export'} ${r.factories} factories; ${r.changed.length} files change`);
    for (const p of r.problems) console.log('  ' + p);
  } else if (args[0] === '--entry') {
    const r = pruneEntry({ write: args.includes('--write') });
    console.log(`src/main.js: ${r.dropped.length} lines carry no ordering${args.includes('--write') ? ' — removed' : ''}; ${r.kept.length} stay`);
    for (const k of r.kept) console.log(`  keeps ${k.rel} — ${k.why}`);
    if (args.includes('--verbose')) for (const d of r.dropped) console.log(`  drops ${d}`);
  } else if (args[0] === '--plan') {
    const rows = plan();
    console.log('name'.padEnd(34) + 'reads  files  owner');
    for (const r of rows.slice(0, Number(args[1]) || 40)) {
      console.log(r.name.padEnd(34) + String(r.reads).padStart(5) + String(r.readers).padStart(7) + '  ' + r.owner
        + (r.exported ? '  [exported]' : r.leaf ? '  [leaf: can export now]' : '  [owner reads ' + r.blockedBy.slice(0, 4).join(', ') + (r.blockedBy.length > 4 ? ', …' : '') + ']'));
    }
  } else {
    const r = report();
    console.log(`files ${r.files} · with import/export ${r.withImport} · window-only ${r.windowOnly}`);
    console.log(`src/main.js import lines ${r.mainImports} · window.IntMapModules registrations ${r.registrations}`);
    console.log(`window reads from js/ and src/ ${r.reads} (of ${r.namesRead} names)`);
  }
}
