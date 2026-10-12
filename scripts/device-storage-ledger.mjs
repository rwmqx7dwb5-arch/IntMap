#!/usr/bin/env node
/* ============================================================================
 *  scripts/device-storage-ledger.mjs — data/device-storage-ledger.json   (wave4-security)
 * ----------------------------------------------------------------------------
 *  WHAT INTMAP SAYS IT KEEPS IN THE READER'S BROWSER, DISCOVERED FROM THE CODE THAT WRITES IT.
 *  js/device-storage-panel.js (Settings ▸ Privacy ▸ «Stored on this device», Atlas `system.deviceStorage`)
 *  reads what the browser ACTUALLY holds for this site — every localStorage / sessionStorage key, every
 *  IndexedDB database, every Cache Storage cache — and holds each name against the file this script writes.
 *
 *  ⚠ THE NAMES ARE DISCOVERED, NEVER LISTED (.agents/rules/no-ad-hoc-hardcoding.md §2-4). The universe is
 *  every WRITE the browser code makes — `localStorage.setItem(n, …)` / `sessionStorage.setItem(n, …)`,
 *  `indexedDB.open(n)`, `caches.open(n)` — parsed with acorn from every tracked file under js/, src/,
 *  sw.js and every tracked page's inline <script>. The first argument is resolved through the file's own bindings (a literal, a const, a `+` or
 *  template concatenation, an object of keys, a function that returns one, the argument a wrapper is
 *  called with); the parts no binding fixes become `*`, so `'intmap_login_count_'+uid` is the pattern
 *  `intmap_login_count_*`. A write whose name cannot be read AT ALL (a bare `*`) is reported, never
 *  guessed at — it would match every key and describe nothing.
 *  The only names not found this way are those a LIBRARY the page ships writes under its own key (the
 *  sign-in client's session). They are declared in the words file with the package and the source line
 *  that forms the name, and check() reads that line in node_modules — a library that renames its key
 *  fails here, not silently on the reader's device.
 *
 *  THE WORDS. What each name holds, in the reader's words (en + jp, CONSTITUTION.md §7), and its KIND —
 *  the question a reader brings («does this browser hold my sign-in? my API key? what I wrote?»):
 *    credential · what you made · a record of what you did · a preference · a copy of public data.
 *  They live in scripts/device-storage-words.json, one row per discovered name; check() fails while a
 *  discovered name has no row, or a row names nothing the code still writes. The words cannot be derived
 *  — a key's name is not its meaning — so this is the catalogue, the same shape as the account catalogue
 *  (supabase/migrations/20261003130000_account_data_center.sql) holds for the server side.
 *
 *  Run:
 *    node scripts/device-storage-ledger.mjs             list every discovered name and its writers
 *    node scripts/device-storage-ledger.mjs --write     write data/device-storage-ledger.json
 *    node scripts/device-storage-ledger.mjs --check     exit 1 on a gap, a stale row, an unreadable write
 *                                                       or a file that is not what the code derives
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
/* the one matching rule — the panel matches the reader's stored names with it, and the ledger merges with it */
import { globMatch } from '../js/device-storage-panel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/device-storage-ledger.json';
export const WORDS = 'scripts/device-storage-words.json';
/* the kinds, most personal first — the order the panel shows them in (js/device-storage-panel.js KIND_WORDS
   holds the same keys; tests/wave4-security-checks.test.mjs fails while the two differ) */
export const KINDS = Object.freeze(['credential', 'content', 'history', 'preference', 'cache']);
/* the four places a page keeps things for itself. Cookies are not one of them: IntMap's code sets none
   (a write would be found below as `document.cookie =`, and is — check() fails on one). */
export const AREAS = Object.freeze(['local', 'session', 'idb', 'cache']);

/* the governance record — check:datagov reads it. The file states facts about IntMap's own code (what it
   writes into the reader's browser), written by this repository; no supplier's data travels in it. */
export const GOVERNANCE = {
  'data/device-storage-ledger.json': {   /* a literal key: the governance gate reads this declaration statically (scripts/data-governance.mjs) — same path as OUT */
    publisher: 'IntMap (scripts/device-storage-words.json)',
    url: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/scripts/device-storage-words.json',
    licence: 'IntMap — Personal & Research Use License (LICENSE)',
    licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
    attribution: false,
    cadence: 'static',
    cadenceBasis: {
      observed: 'derived from the browser code, which changes only when a module starts or stops keeping something in the browser (--check fails until the words say so)',
      expires: 'when a storage write is added, renamed or removed — check:datagov then fails until this file is written again',
      canon: 'scripts/device-storage-words.json',
    },
    builtBy: 'scripts/device-storage-ledger.mjs',
    schema: 'intmap-device-storage-ledger/1',
  },
};

/* ── the universe: every tracked browser script ─────────────────────────────────────────────── */
const BROWSER = /^(?:(?:js|src)\/.+\.m?js|sw\.js)$/;
/* ⚠ A PAGE'S INLINE <script> IS BROWSER CODE TOO. The first universe was js/, src/ and sw.js, and the real browser
   (tests/security-next.spec.js) then showed a key no row named: `intmap_build_seen`, written by index.html's own
   inline boot guard (the CSP admits it by its hash). Every tracked page's inline scripts are read, each as a file of
   its own whose lines are the page's lines; a <script src> is its file, read above; data blocks (JSON, import maps)
   are not code. */
const INLINE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const CODE_TYPE = /^\s*$|^\s*(?:module|text\/javascript|application\/javascript)\s*$/i;
function inlineScripts(file, html) {
  const out = [];
  let i = 0;
  for (const m of html.matchAll(INLINE)) {
    const attrs = m[1], type = (/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs) || [, ''])[1];
    if (/\bsrc\s*=/i.test(attrs) || !CODE_TYPE.test(type) || !m[2].trim()) continue;
    const before = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
    out.push({ file: file + '#script' + (++i), text: '\n'.repeat(before) + m[2] });
  }
  return out;
}
export function browserScripts(root = ROOT) {
  const ls = (...p) => execFileSync('git', ['ls-files', '-z', ...p], { cwd: root, maxBuffer: 1 << 26 }).toString('utf8').split('\0').filter(Boolean);
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = ls('js', 'src', 'sw.js').filter((f) => BROWSER.test(f)).sort().map((file) => ({ file, text: read(file) }));
  const pages = ls('*.html').sort().flatMap((file) => inlineScripts(file, read(file)));
  return scripts.concat(pages);
}

function parse(src, file) {
  const o = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch (asModule) {
    try { return acorn.parse(src, { ...o, sourceType: 'script' }); } catch (_) {
      throw new Error(`device-storage-ledger: cannot parse ${file} — ${asModule.message}`);
    }
  }
}

/* every node, with the chain of nodes above it. The chain is ONE array pushed and popped as the walk descends
   (copying it at every node made a 1-second walk a 17-second one); a visitor that keeps it slices it. */
const SKIP = new Set(['type', 'start', 'end', 'loc', 'range']);
function walk(node, visit, stack = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, stack);
  stack.push(node);
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, stack); }
    else if (v && typeof v.type === 'string') walk(v, visit, stack);
  }
  stack.pop();
}
const isFn = (n) => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

/* the method that writes, per storage global. A receiver counts when it EVALUATES to the global — `localStorage`,
   `window.indexedDB`, or a binding / parameter / function result that carries it there (`idbBackend(indexedDB)`
   then `idb.open(DB)` in another module; `const g = idbGlobal(); g.open(…)`), never by the receiver's spelling. */
const WRITERS = { localStorage: ['setItem', 'local'], sessionStorage: ['setItem', 'session'], indexedDB: ['open', 'idb'], caches: ['open', 'cache'] };
const GLOBAL_HOSTS = new Set(['window', 'self', 'globalThis']);

/* ── one module's bindings ─────────────────────────────────────────────────────────────────── */
/* By NAME, not by scope: two `KEY`s in one file are both candidates, and both are real keys the file writes — the
   union over-describes, it never drops one. Each remembered node keeps the chain above it, so a binding resolved
   later is read where it stands (a parameter is a parameter of ITS function). */
function indexFile(file, text) {
  const ast = parse(text, file);
  const decl = new Map(), fns = new Map(), calls = [], imports = new Map(), exported = new Set(), above = new WeakMap();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  walk(ast, (n, stack) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      above.set(n.init, stack.concat(n)); add(decl, n.id.name, n.init);
      if (isFn(n.init)) add(fns, n.id.name, n.init);
    } else if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') { above.set(n.right, stack.concat(n)); add(decl, n.left.name, n.right); }
    else if (n.type === 'FunctionDeclaration' && n.id) add(fns, n.id.name, n);
    else if (n.type === 'CallExpression') { above.set(n, stack.slice()); calls.push(n); }
    else if (n.type === 'ForOfStatement' && n.left.type === 'VariableDeclaration' && n.left.declarations[0].id.type === 'Identifier') {
      /* `for (const name of await caches.keys())` — the binding is each item of the listing */
      const it = { type: 'ForOfItem', of: n.right, start: n.right.start, end: n.right.end };
      above.set(it, stack.slice()); add(decl, n.left.declarations[0].id.name, it);
    }
    else if (n.type === 'ImportDeclaration') {
      for (const s of n.specifiers) if (s.type === 'ImportSpecifier') imports.set(s.local.name, { from: n.source.value, name: s.imported.name || s.imported.value });
    } else if (n.type === 'ExportNamedDeclaration') {
      const d = n.declaration;
      if (d && d.id) exported.add(d.id.name);
      if (d && d.declarations) for (const x of d.declarations) if (x.id.type === 'Identifier') exported.add(x.id.name);
      for (const s of n.specifiers || []) exported.add(s.local.name);
    }
    if (isFn(n)) above.set(n, stack.slice());
  });
  return { file, text, ast, decl, fns, calls, imports, exported, above };
}
const resolveImport = (cx, from) => (/^\.\.?\//.test(from) ? path.posix.join(path.posix.dirname(cx.file), from) : null);

const WILD = '*';
/* a name read back from the store's own listing (`caches.keys()`, `indexedDB.databases()`): opening it names nothing new */
const LISTED = '';
/* an argument a call site does not pass — `name || 'default'` then takes the right-hand side */
const ABSENT = '\u0000';
const squash = (g) => g.replace(/\*+/g, '*');
function cross(as, bs) { const out = []; for (const a of as) for (const b of bs) out.push(a === ABSENT || b === ABSENT ? WILD : squash(a + b)); return out; }
const srcOf = (cx, n) => cx.text.slice(n.start, n.end);
const namesIn = (pattern) => { const out = []; walk(pattern, (n) => { if (n.type === 'Identifier') out.push(n.name); }); return out; };
/* the function a name is a parameter of, and its place in the list (-1: inside a destructured or defaulted one) */
function paramOf(name, parents) {
  for (let i = parents.length - 1; i >= 0; i--) {
    const f = parents[i];
    if (!isFn(f)) continue;
    const at = f.params.findIndex((p) => p.type === 'Identifier' && p.name === name);
    if (at >= 0) return { fn: f, at, parents: parents.slice(0, i) };
    if (f.params.some((p) => p.type !== 'Identifier' && namesIn(p).includes(name))) return { fn: f, at: -1, parents: parents.slice(0, i) };
  }
  return null;
}
/* the name a function is known by in its file: its declaration, or the binding it initialises */
function fnName(fn, parents) {
  if (fn.id && fn.id.name) return fn.id.name;
  const p = parents[parents.length - 1];
  if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  return null;
}
/** every place a function is called: in its own module by name, and — when it is exported — in every module that
    imports it, under the local name it is imported as. @returns {{ call, cx }[]} */
function callSites(p, cx, world) {
  const name = fnName(p.fn, p.parents);
  if (!name) return [];
  const byName = (m, local) => m.calls.filter((c) => c.callee.type === 'Identifier' && c.callee.name === local).map((call) => ({ call, cx: m }));
  const out = byName(cx, name);
  if (cx.exported.has(name)) for (const { cx: other, local } of world.importersOf(cx.file, name)) out.push(...byName(other, local));
  return out;
}

/** Every glob `node` can evaluate to. `truthy` holds the source text of expressions a `?:` / `&&` test has just
    proved non-empty (`B ? 'intmap-shell-' + B : ''` — inside the consequent B is not the empty string a build
    placeholder holds in the source, so it is a part the reader's copy fills in: `*`). */
function globsOf(node, cx, parents, world, depth = 0, truthy = new Set()) {
  if (!node || depth > 12) return [WILD];
  const again = (n, ps = parents, t = truthy, c = cx) => globsOf(n, c, ps, world, depth + 1, t);
  if (truthy.size && truthy.has(srcOf(cx, node))) return again(node, parents, new Set()).map((g) => (g === '' || g === ABSENT ? WILD : g));
  switch (node.type) {
    case 'Literal': return typeof node.value === 'string' || typeof node.value === 'number' ? [String(node.value)] : [WILD];
    case 'TemplateLiteral': {
      let acc = [node.quasis[0].value.cooked];
      node.expressions.forEach((e, i) => { acc = cross(cross(acc, again(e)), [node.quasis[i + 1].value.cooked]); });
      return acc;
    }
    case 'BinaryExpression': return node.operator === '+' ? cross(again(node.left), again(node.right)) : [WILD];
    case 'ConditionalExpression': {
      const t = new Set(truthy); t.add(srcOf(cx, node.test));
      return [...again(node.consequent, parents, t), ...again(node.alternate)];
    }
    case 'LogicalExpression': {
      if (node.operator === '&&') { const t = new Set(truthy); t.add(srcOf(cx, node.left)); return again(node.right, parents, t); }
      /* `a || b` / `a ?? b`: b is reached when a is absent (or, for ||, empty) */
      return [...again(node.left).filter((g) => g !== ABSENT && (node.operator === '??' || g !== '')), ...again(node.right)];
    }
    case 'Identifier': {
      const p = paramOf(node.name, parents);
      if (p) {
        /* a parameter: what it is CALLED with — in this module, and in every module that imports the function */
        const sites = p.at >= 0 ? callSites(p, cx, world) : [];
        return sites.length ? sites.flatMap(({ call, cx: c }) => (call.arguments[p.at] ? again(call.arguments[p.at], c.above.get(call) || [], new Set(), c) : [ABSENT])) : [WILD];
      }
      const ds = cx.decl.get(node.name);
      if (ds) return ds.flatMap((d) => again(d, cx.above.get(d) || []));
      /* an imported binding: its declaration in the module it comes from */
      const imp = cx.imports.get(node.name);
      const other = imp ? world.get(resolveImport(cx, imp.from)) : null;
      const od = other ? other.decl.get(imp.name) : null;
      return od ? od.flatMap((d) => again(d, other.above.get(d) || [], new Set(), other)) : [WILD];
    }
    case 'MemberExpression': {
      /* KEYS[id] or KEYS.x — the values of the object the binding holds */
      const objs = node.object.type === 'Identifier' ? (cx.decl.get(node.object.name) || []) : [node.object];
      const out = [];
      for (const o of objs) {
        if (!o || o.type !== 'ObjectExpression') continue;
        for (const pr of o.properties) {
          if (pr.type !== 'Property') continue;
          const k = pr.computed ? null : (pr.key.name || pr.key.value);
          if (!node.computed && k !== node.property.name) continue;
          out.push(...again(pr.value));
        }
      }
      return out.length ? out : [WILD];
    }
    case 'CallExpression': {
      /* String(x), or a function in this module that returns the name (`notifiedKey()`) */
      if (node.callee.type === 'Identifier' && node.callee.name === 'String' && node.arguments[0]) return again(node.arguments[0]);
      const out = [];
      for (const { f, fp } of returnsOf(node, cx)) out.push(...again(f, fp));
      return out.length ? out : [WILD];
    }
    case 'ForOfItem': {
      const of = node.of.type === 'AwaitExpression' ? node.of.argument : node.of;
      const c = of && of.type === 'CallExpression' && of.callee.type === 'MemberExpression' && !of.callee.computed ? of.callee : null;
      const listing = c && ((c.property.name === 'keys' && reaches(c.object, 'caches', cx, parents, world)) || (c.property.name === 'databases' && reaches(c.object, 'indexedDB', cx, parents, world)));
      return [listing ? LISTED : WILD];
    }
    default: return [WILD];
  }
}
/* the expressions a call to a function of this module can return, each with the chain above it */
function returnsOf(call, cx) {
  const fs_ = call.callee.type === 'Identifier' ? (cx.fns.get(call.callee.name) || []) : [];
  const out = [];
  for (const f of fs_) {
    const fp = (cx.above.get(f) || []).concat(f);
    if (f.expression) { out.push({ f: f.body, fp }); continue; }
    walk(f.body, (n, stack) => { if (n.type === 'ReturnStatement' && n.argument && !stack.some(isFn)) out.push({ f: n.argument, fp: fp.concat(stack) }); });
  }
  return out;
}

/** Does `node` evaluate to the storage global `g`? Through bindings, parameters (across modules), function results,
    `?:` and `||` — the same walk as globsOf, asking a different question. */
function reaches(node, g, cx, parents, world, depth = 0) {
  if (!node || depth > 12) return false;
  const again = (n, ps = parents, c = cx) => reaches(n, g, c, ps, world, depth + 1);
  switch (node.type) {
    case 'Identifier': {
      const p = paramOf(node.name, parents);
      if (p) return p.at >= 0 && callSites(p, cx, world).some(({ call, cx: c }) => call.arguments[p.at] && again(call.arguments[p.at], c.above.get(call) || [], c));
      const ds = cx.decl.get(node.name);
      if (ds) return ds.some((d) => again(d, cx.above.get(d) || []));
      return node.name === g;   /* not bound in the module: the global itself */
    }
    case 'MemberExpression':
      return !node.computed && node.property.name === g && node.object.type === 'Identifier' && GLOBAL_HOSTS.has(node.object.name);
    case 'ConditionalExpression': return again(node.consequent) || again(node.alternate);
    case 'LogicalExpression': return again(node.left) || again(node.right);
    case 'CallExpression': return returnsOf(node, cx).some(({ f, fp }) => again(f, fp));
    default: return false;
  }
}
/** the storage area a call writes to, or null */
function writeArea(call, cx, stack, world) {
  const c = call.callee;
  if (!c || c.type !== 'MemberExpression' || c.computed) return null;
  for (const [g, [method, area]] of Object.entries(WRITERS)) {
    if (c.property.name === method && reaches(c.object, g, cx, stack, world)) return area;
  }
  return null;
}

/** Every storage write in the given files: { area, glob, file, line } — and every write whose name nothing fixes,
    and every `document.cookie =` (IntMap sets no cookie; the panel and the security page say so). */
export function discover(files) {
  const texts = new Map(files.map((f) => [f.file, f.text]));
  const parsed = new Map();
  const world = {
    get(file) {
      if (!file) return null;
      if (!parsed.has(file)) parsed.set(file, texts.has(file) ? indexFile(file, texts.get(file)) : null);
      return parsed.get(file);
    },
    /* the modules that import `name` from `file`, and the local name each uses */
    importersOf(file, name) {
      const out = [];
      for (const [f, text] of texts) {
        /* only a module that names both the function and the file can import one from the other — parse no other */
        if (f === file || !text.includes(name) || !text.includes(path.posix.basename(file))) continue;
        const m = world.get(f);
        for (const [local, imp] of m.imports) if (imp.name === name && resolveImport(m, imp.from) === file) out.push({ cx: m, local });
      }
      return out;
    },
  };
  const writes = [], unreadable = [], cookies = [];
  for (const { file, text } of files) {
    if (!/setItem|\.open\(|cookie/.test(text)) continue;
    const cx = world.get(file);
    const lineOf = (pos) => text.slice(0, pos).split('\n').length;
    walk(cx.ast, (n, stack) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.name === 'cookie'
        && n.left.object.type === 'Identifier' && n.left.object.name === 'document') cookies.push({ file, line: lineOf(n.start) });
      if (n.type !== 'CallExpression' || !n.arguments[0]) return;
      const area = writeArea(n, cx, stack, world);
      if (!area) return;
      /* an empty name is a guarded branch that never writes (`B ? name : ''` then `if (!name) return`), not a key */
      const all = [...new Set(globsOf(n.arguments[0], cx, stack.slice(), world))];
      if (all.length && all.every((g) => g === LISTED)) return;
      const globs = all.filter((g) => g !== '' && g !== ABSENT);
      if (!globs.length || globs.some((g) => g.replace(/\*/g, '') === '')) { unreadable.push({ area, file, line: lineOf(n.start) }); return; }
      for (const glob of globs) writes.push({ area, glob, file, line: lineOf(n.start) });
    });
  }
  return { writes, unreadable, cookies };
}


/** the names, one per area+glob, with the files that write each */
export function names(writes) {
  const by = new Map();
  for (const w of writes) {
    const k = w.area + ':' + w.glob;
    if (!by.has(k)) by.set(k, { area: w.area, name: w.glob, writers: new Set() });
    by.get(k).writers.add(w.file);
  }
  /* a fixed name a pattern of the same area already covers is that pattern's row (`'intmap_watch_notified:' + (id || '')`
     is one key per account and one signed out — one thing to the reader, one row of words) */
  const rows = [...by.values()];
  for (const r of rows) {
    if (r.name.includes('*')) continue;
    const g = rows.find((x) => x !== r && x.area === r.area && x.name.includes('*') && globMatch(x.name, r.name));
    if (g) { for (const w of r.writers) g.writers.add(w); r.merged = true; }
  }
  return rows.filter((r) => !r.merged).map((r) => ({ area: r.area, name: r.name, writers: [...r.writers].sort() }))
    .sort((a, b) => (a.area + a.name).localeCompare(b.area + b.name));
}

export function readWords(root = ROOT) { return JSON.parse(fs.readFileSync(path.join(root, WORDS), 'utf8')); }

/* a library's own key: the declared `form` must still be in the package's shipped source */
function libraryLine(root, lib) {
  try { return fs.readFileSync(path.join(root, 'node_modules', lib.package, lib.file), 'utf8').includes(lib.form); } catch (_) { return false; }
}

/** The derived file: provenance as values, then one row per name (discovered + declared library names), and how many places in the code set a cookie (`cookiesWritten` — the security page reads it; check() refuses any above 0). */
export function derive(found, words, cookies = []) {
  const rows = [];
  const w = new Map((words.names || []).map((r) => [r.area + ':' + r.name, r]));
  for (const n of found) {
    const r = w.get(n.area + ':' + n.name);
    const row = { area: n.area, name: n.name, kind: r ? r.kind : null, en: r ? r.en : '', jp: r ? r.jp : '', by: n.writers };
    if (r && r.signsOut) row.signsOut = true;
    rows.push(row);
  }
  for (const lib of words.libraries || []) {
    const row = { area: lib.area, name: lib.name, kind: lib.kind, en: lib.en, jp: lib.jp, by: ['node_modules/' + lib.package] };
    if (lib.signsOut) row.signsOut = true;
    rows.push(row);
  }
  const seen = new Set();
  return {
    publisher: GOVERNANCE[OUT].publisher, url: GOVERNANCE[OUT].url, licence: GOVERNANCE[OUT].licence, licenceUrl: GOVERNANCE[OUT].licenceUrl,
    attribution: false, cadence: 'static', builtBy: GOVERNANCE[OUT].builtBy, schema: GOVERNANCE[OUT].schema,
    quality: {
      rows: rows.length,
      missing: { kind: rows.filter((r) => !r.kind).length, en: rows.filter((r) => !r.en).length, jp: rows.filter((r) => !r.jp).length },
      outOfRange: { kind: rows.filter((r) => r.kind && !KINDS.includes(r.kind)).length, area: rows.filter((r) => !AREAS.includes(r.area)).length },
      duplicates: rows.filter((r) => { const k = r.area + ':' + r.name; return seen.has(k) ? true : (seen.add(k), false); }).length,
    },
    src: 'derived by scripts/device-storage-ledger.mjs from every storage write in js/, src/, sw.js and the inline scripts of every page, with the words of ' + WORDS,
    kinds: KINDS.slice(), areas: AREAS.slice(), cookiesWritten: cookies.length,
    names: rows,
  };
}

/** Everything wrong, as sentences. Empty = the ledger describes exactly what the code writes. */
export function check(root = ROOT, files = browserScripts(root)) {
  const problems = [];
  const { writes, unreadable, cookies } = discover(files);
  const found = names(writes);
  const words = readWords(root);
  const have = new Set(found.map((n) => n.area + ':' + n.name));
  for (const u of unreadable) problems.push(`${u.file}:${u.line} writes to ${u.area} storage under a name no binding in the file fixes — give the name a literal (or a const) so the reader can be told what it is`);
  for (const c of cookies) problems.push(`${c.file}:${c.line} sets a cookie — IntMap's statement (and the device panel) says it sets none; describe it in ${WORDS} and the panel before shipping one`);
  for (const n of found) {
    const r = (words.names || []).find((x) => x.area === n.area && x.name === n.name);
    if (!r) problems.push(`${n.area}:${n.name} (written by ${n.writers.join(', ')}) has no row in ${WORDS} — say what it holds, in en and jp, and its kind`);
    else {
      if (!KINDS.includes(r.kind)) problems.push(`${WORDS}: ${n.area}:${n.name} has kind «${r.kind}», not one of ${KINDS.join(' / ')}`);
      if (!r.en || !r.jp) problems.push(`${WORDS}: ${n.area}:${n.name} needs both en and jp words`);
    }
  }
  for (const r of words.names || []) if (!have.has(r.area + ':' + r.name)) problems.push(`${WORDS}: ${r.area}:${r.name} — no code writes this name any more; remove the row`);
  for (const lib of words.libraries || []) {
    if (!libraryLine(root, lib)) problems.push(`${WORDS}: library name ${lib.name} — node_modules/${lib.package}/${lib.file} no longer contains «${lib.form}»; the library renamed its key`);
    if (!KINDS.includes(lib.kind) || !lib.en || !lib.jp) problems.push(`${WORDS}: library name ${lib.name} needs a kind and en + jp words`);
  }
  const want = JSON.stringify(derive(found, words, cookies)) + '\n';
  let file = '';
  try { file = fs.readFileSync(path.join(root, OUT), 'utf8'); } catch (_) { /* missing */ }
  if (file !== want) problems.push(`${OUT} is not what the code and ${WORDS} derive — run: node scripts/device-storage-ledger.mjs --write`);
  return { problems, found, want };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const { writes, cookies } = discover(browserScripts());
    const want = JSON.stringify(derive(names(writes), readWords(), cookies)) + '\n';
    fs.writeFileSync(path.join(ROOT, OUT), want);
    console.log('wrote ' + OUT + ' (' + want.length + ' bytes)');
  } else if (process.argv.includes('--check')) {
    const r = check();
    if (r.problems.length) { for (const p of r.problems) console.error('✗ ' + p); process.exit(1); }
    console.log(OUT + ' describes all ' + r.found.length + ' names the browser code writes');
  } else {
    const { writes, unreadable, cookies } = discover(browserScripts());
    for (const n of names(writes)) console.log(n.area.padEnd(8) + n.name.padEnd(42) + n.writers.join(' '));
    for (const u of unreadable) console.log('UNREADABLE ' + u.area + ' ' + u.file + ':' + u.line);
    for (const c of cookies) console.log('COOKIE ' + c.file + ':' + c.line);
  }
}
