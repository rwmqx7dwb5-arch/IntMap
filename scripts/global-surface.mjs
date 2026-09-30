/* ============================================================================
 *  IntMap · the global surface, measured  (#R795)
 * ----------------------------------------------------------------------------
 *  How much of the program reaches through one shared object. Two registers:
 *    · HOST     — the members of IM_HOST (js/app-body.js), the object every split-out module is
 *                 handed and reads its closure values through (274 getters at #R795, 52 of them
 *                 writable, plus three attached after the literal);
 *    · WINDOW   — every `window.NAME =` a js/ or src/ file performs (301 IntMap* names at #R795,
 *                 683 names in all).
 *  Neither is a line count. A feature that moves out of the shell but keeps every HOST getter it
 *  read and publishes one more window global has not become independent — it has moved. This is
 *  the instrument that says so, and it replaces the line ceilings tests/news-module-split-checks.test.mjs (#R168) #8 (and twenty copies)
 *  held from #R168 to #R795: those measured the shell's LENGTH and produced folded import lines;
 *  this measures the shell's REACH.
 *
 *  THE BASELINE (tests/global-surface-baseline.json) IS RATCHETED BOTH WAYS, like check:perf:
 *    · a name that appears and is not in the baseline FAILS — a new coupling has to be named
 *      (run `--update` and say why in DEV-NOTES), never slipped in;
 *    · a name in the baseline that is gone FAILS too — the baseline has stopped asserting what it
 *      says (#R194's rule: a ceiling raised once and never lowered asserts nothing). `--update`
 *      records the smaller surface, and that commit is the receipt for the migration.
 *  ⚠ The baseline holds NAMES, not counts, so the diff it prints is the exact member or global
 *  that changed — the thing a reviewer needs, rather than "277 → 278".
 *
 *      node scripts/global-surface.mjs            report
 *      node scripts/global-surface.mjs --check    compare with the baseline (exit 1 on any diff)
 *      node scripts/global-surface.mjs --update   rewrite the baseline from the tree
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { codeOnly as codeOnlyOf } from './code-only.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const BASELINE = join(ROOT, 'tests', 'global-surface-baseline.json');

/* comments, string literals, template-literal text and regular-expression literals blanked (same
   offsets, line breaks kept), so that prose — or a pattern — about `window.X =` is not a publication.
   ⚠⚠ (stalled-fetch-and-surface-gauge) THE TOKENS COME FROM THE PARSER, NOT FROM A CHARACTER LOOP.
   The loop this replaces knew comments and quotes but not regular expressions, so a literal like
   js/data-layers.js `/named '([^']+)'/` (three quotes) opened a «string» that ran on into the code
   after it: every `window.X =` in that stretch was blanked, and adding one apostrophe to a comment
   anywhere later flipped the stretch back. Measured on the tree this round: 76 names published by
   js/ were missing from the register (window._refreshThermal and _setThermalOpacity among them),
   and the missing set agreed exactly with an AST walk of every `window.X =` assignment.
   Whether a `/` opens a regular expression or divides is decided by the grammar, which only the
   parser knows — so acorn tokenizes (the same acorn hostMembers() already parses with), and a file
   it cannot parse is an error, not a guess.
   (test-code-only-one) That tokenizing reader now lives in scripts/code-only.mjs as the options
   { parser: 'acorn', literals: 'blank' } — module first, then a classic script, the backquotes
   blanked too so window[`X`] reads like window['X'] — and this is the name this module exports it by. */
export function codeOnly(src, file) {
  try { return codeOnlyOf(src, { parser: 'acorn', literals: 'blank' }); } catch (e) {
    throw new Error(`global-surface: cannot tokenize ${file || 'source'} — ${e.message}`);
  }
}

/** The members of IM_HOST, from the parser: literal properties (getter/setter/value, deduplicated)
    plus every later `IM_HOST.name =` in the same file. */
export function hostMembers(root) {
  const src = readFileSync(join(root || ROOT, 'js', 'app-body.js'), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const members = new Set();
  const writable = new Set();
  let found = false;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'IM_HOST' && n.init && n.init.type === 'ObjectExpression') {
      found = true;
      for (const p of n.init.properties) {
        if (!p.key) continue;
        const name = p.key.name || p.key.value;
        members.add(name);
        if (p.kind === 'set') writable.add(name);
      }
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
      && n.left.object.type === 'Identifier' && n.left.object.name === 'IM_HOST' && n.left.property.name) {
      members.add(n.left.property.name); writable.add(n.left.property.name);
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k]); }
  })(ast);
  if (!found) throw new Error('IM_HOST literal not found in js/app-body.js');
  return { members: Array.from(members).sort(), writable: Array.from(writable).sort() };
}

/** Every name js/ and src/ assign on window. */
export function windowPublications(root) {
  const R = root || ROOT;
  const names = new Map();   /* name → first file */
  for (const dir of ['js', 'src']) {
    const d = join(R, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.js')).sort()) {
      const raw = readFileSync(join(d, f), 'utf8');
      const src = codeOnly(raw, dir + '/' + f);
      for (const m of src.matchAll(/(?<![\w$.])window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) if (!names.has(m[1])) names.set(m[1], dir + '/' + f);
      /* the bracket form names the global INSIDE a string literal, which codeOnly() blanked. The match
         is taken on the blanked text (so comments and prose cannot match) and the name is read back
         from the same offsets of the raw source. */
      for (const m of src.matchAll(/(?<![\w$.])window\[( +)\]\s*=(?!=)/g)) {
        const start = m.index + m[0].indexOf(m[1]);
        const name = raw.slice(start, start + m[1].length).trim().replace(/^['"`]|['"`]$/g, '');
        if (/^[A-Za-z_$][\w$]*$/.test(name) && !names.has(name)) names.set(name, dir + '/' + f);
      }
      for (const name of aliasedPublications(raw)) if (!names.has(name)) names.set(name, dir + '/' + f);
    }
  }
  return names;
}

/* ⚠ THE SPELLING `window.X =` IS ONE WAY TO PUBLISH A GLOBAL, NOT THE FACT. Measured 2026-09-30: five
   modules published through `globalThis.X =` and three through an IIFE handed the global object
   (`(function (G) { G.X = … })(typeof window !== 'undefined' ? window : globalThis)`) — none of them was
   in the register, so this ratchet could not see them grow. The fact is «an assignment to a property
   of the global object»; it is asked of the parse tree: the object is `window` / `globalThis` / `self`,
   or a parameter of a function that is CALLED with one of those (or a conditional of them) in that
   position. A file that does not parse is left to the spelling rule above. */
const GLOBAL_OBJECT = new Set(['window', 'globalThis', 'self']);
function isGlobalObjectExpr(n) {
  if (!n) return false;
  if (n.type === 'Identifier') return GLOBAL_OBJECT.has(n.name);
  if (n.type === 'ConditionalExpression') return isGlobalObjectExpr(n.consequent) || isGlobalObjectExpr(n.alternate);
  if (n.type === 'LogicalExpression') return isGlobalObjectExpr(n.left) || isGlobalObjectExpr(n.right);
  return false;
}
export function aliasedPublications(raw) {
  let ast = null;
  for (const sourceType of ['module', 'script']) {
    try { ast = acorn.parse(raw, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true }); break; } catch (_) { /* try the other */ }
  }
  if (!ast) return [];
  const out = new Set();
  const FN = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);
  (function visit(node, aliases) {
    if (!node || typeof node.type !== 'string') return;
    let scope = aliases;
    if (node.type === 'CallExpression' && FN.has(node.callee.type)) {
      const fn = node.callee, add = [];
      fn.params.forEach((p, i) => { if (p.type === 'Identifier' && isGlobalObjectExpr(node.arguments[i])) add.push(p.name); });
      if (add.length) fn.__imAliases = add;
    }
    if (FN.has(node.type)) {
      /* a parameter of this function shadows an outer alias of the same name unless the call handed it the global */
      const own = new Set(node.__imAliases || []);
      const shadow = node.params.filter((p) => p.type === 'Identifier').map((p) => p.name);
      scope = new Set([...aliases].filter((a) => !shadow.includes(a) || own.has(a)));
      own.forEach((a) => scope.add(a));
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.type === 'Identifier') {
      const o = node.left.object.name, L = node.left;
      if (o !== 'window' && o !== 'self' && (GLOBAL_OBJECT.has(o) || scope.has(o))) {
        const name = !L.computed && L.property.type === 'Identifier' ? L.property.name
          : (L.computed && L.property.type === 'Literal' && typeof L.property.value === 'string' ? L.property.value : null);
        /* a worker installing a `window` shim on its own global (js/gis-runtime.js) is not a page publication */
        if (name && !GLOBAL_OBJECT.has(name) && /^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
      }
    }
    for (const k of Object.keys(node)) {
      if (k === '__imAliases') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, scope));
      else if (v && typeof v.type === 'string') visit(v, scope);
    }
  })(ast, new Set());
  return [...out];
}

/* ══ (dead-code-removal) A PUBLICATION THAT NOTHING READS ═══════════════════════════════════════
   The register above counts what is published; it could not say that 60 of the 683 names were
   read by nobody — not by js/ or src/, not by a page, not by a test or a script, not by the one
   code path that enumerates window. They were found by hand, removed with the owner's approval,
   and this is the rule that finds the next one: every published name has a reader other than its
   own assignment. The names that have none are recorded in the baseline (`unread`) and ratcheted
   both ways like everything else here, so a new publication with no reader is named in review
   instead of accreting, and a name that gains a reader or is removed drops off by --update.
   WHAT COUNTS AS A READER:
     · an occurrence of the name in the CODE of any js/ src/ tests/ scripts/ file or a top-level
       page, other than a `window.NAME =` assignment — comments are blanked (prose about a name is
       not a use of it), strings are NOT (an inline `onclick="_x()"` or `window['X']` is a use);
     · a program that ENUMERATES window (`Object.keys(window)` filtered by a regular expression) —
       discovered from the source, not listed here. Atlas's module catalogue is one (js/atlas-controls.js:
       an IntMap* name joins the planner's catalogue if its object has one of the entry points the
       same function lists), so such a name is read when the file that publishes it defines one of
       those entry points. ⚠ That test is per FILE, not per object: it can only err toward «read»,
       which is the safe direction — this rule must never be the reason an Atlas-reachable module
       is deleted (CONSTITUTION.md §5). */
const READER_DIRS = ['js', 'src', 'tests', 'scripts'];
function readerFiles(R) {
  const out = [];
  const walk = (rel) => {
    const d = join(R, rel);
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = rel + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(m|c)?js$/.test(e.name)) out.push(p);
    }
  };
  READER_DIRS.forEach(walk);
  for (const f of readdirSync(R)) if (f.endsWith('.html')) out.push(f);
  return out;
}
/* comments blanked (same offsets), strings and code kept; a file acorn cannot read is taken whole */
function withoutComments(src, file) {
  const s = String(src);
  if (file.endsWith('.html')) return codeOnlyOf(s, { lang: 'html', offsets: true });
  try { return codeOnlyOf(s, { parser: 'acorn', offsets: true }); } catch (_) { return s; }
}
/* every `Object.keys(window)` walk in js/ or src/: the regular expression it filters by, and — when the
   walk also demands entry points — the string list it takes them from. Read from the parse tree of the
   file, so renaming either constant moves the rule with it instead of leaving it behind. */
export function windowEnumerators(root) {
  const R = root || ROOT;
  const found = [];
  for (const dir of ['js', 'src']) {
    const d = join(R, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.js'))) {
      const src = readFileSync(join(d, f), 'utf8');
      if (!/Object\.keys\(\s*window\s*\)/.test(src)) continue;
      const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
      const consts = new Map();   /* name → { regex } | { strings } */
      const fns = [];
      (function walk(n, fn) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach((x) => walk(x, fn)); return; }
        if (/Function/.test(n.type)) fn = n;
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
          if (n.init.type === 'Literal' && n.init.regex) consts.set(n.id.name, { regex: new RegExp(n.init.regex.pattern, n.init.regex.flags) });
          else if (n.init.type === 'ArrayExpression' && n.init.elements.length && n.init.elements.every((e) => e && e.type === 'Literal' && typeof e.value === 'string')) consts.set(n.id.name, { strings: n.init.elements.map((e) => e.value) });
        }
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object'
          && n.callee.property.name === 'keys' && n.arguments[0] && n.arguments[0].type === 'Identifier' && n.arguments[0].name === 'window' && fn) fns.push(fn);
        for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k], fn);
      })(ast, null);
      for (const fn of fns) {
        const used = new Set();
        (function ids(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(ids); if (n.type === 'Identifier') used.add(n.name); for (const k of Object.keys(n)) if (k !== 'type') ids(n[k]); })(fn.body);
        const re = [...used].map((u) => consts.get(u)).find((c) => c && c.regex);
        if (!re) continue;
        const methods = [...used].map((u) => consts.get(u)).find((c) => c && c.strings);
        found.push({ file: dir + '/' + f, regex: re.regex, methods: methods ? methods.strings : null });
      }
    }
  }
  return found;
}

/** The published names nothing reads (see the note above). */
export function unreadPublications(root) {
  const R = root || ROOT;
  const pubs = windowPublications(R);
  const counts = new Map(), assigns = new Map();
  for (const f of readerFiles(R)) {
    const text = withoutComments(readFileSync(join(R, f), 'utf8'), f);
    for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
    for (const m of text.matchAll(/(?<![\w$.])window\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"`]([A-Za-z_$][\w$]*)['"`]\s*\])\s*=(?!=)/g)) {
      const n = m[1] || m[2]; assigns.set(n, (assigns.get(n) || 0) + 1);
    }
  }
  const enums = windowEnumerators(R);
  const entryPoint = new Map();   /* file → does it define one of the listed entry points */
  const definesEntry = (file, methods) => {
    const key = file + '\0' + methods.join(',');
    if (!entryPoint.has(key)) {
      const code = withoutComments(readFileSync(join(R, file), 'utf8'), file);
      const alt = methods.map((x) => x.replace(/[$]/g, '[$]')).join('|');
      entryPoint.set(key, new RegExp(`(?<![\\w$])(?:${alt})\\s*(?::|\\(|=(?!=))|[{,]\\s*(?:${alt})\\s*[,}]|\\.(?:${alt})\\s*=(?!=)`).test(code));
    }
    return entryPoint.get(key);
  };
  const out = [];
  for (const [name, file] of pubs) {
    if ((counts.get(name) || 0) - (assigns.get(name) || 0) > 0) continue;
    if (enums.some((e) => e.regex.test(name) && (!e.methods || definesEntry(file, e.methods)))) continue;
    out.push(name);
  }
  return out.sort();
}

export function measure(root) {
  const host = hostMembers(root);
  const win = windowPublications(root);
  return {
    host: host.members,
    hostWritable: host.writable,
    window: Array.from(win.keys()).sort(),
    unread: unreadPublications(root),
  };
}

function diff(label, before, after) {
  const b = new Set(before), a = new Set(after);
  const added = after.filter((x) => !b.has(x));
  const removed = before.filter((x) => !a.has(x));
  return { label, added, removed };
}

/** @returns {{ok:boolean, lines:string[]}} */
export function check(root) {
  const cur = measure(root);
  if (!existsSync(BASELINE)) return { ok: false, lines: ['no baseline at tests/global-surface-baseline.json — run `node scripts/global-surface.mjs --update`'] };
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const lines = [];
  let ok = true;
  for (const d of [diff('IM_HOST member', base.host || [], cur.host), diff('IM_HOST writable member', base.hostWritable || [], cur.hostWritable), diff('window global', base.window || [], cur.window)]) {
    for (const x of d.added) { ok = false; lines.push(`  + ${d.label} ${x}  — new coupling: name it (DEV-NOTES) and run --update, or route it through the module's own dependencies`); }
    for (const x of d.removed) { ok = false; lines.push(`  − ${d.label} ${x}  — gone: run --update so the baseline records the smaller surface`); }
  }
  const u = diff('unread window global', base.unread || [], cur.unread);
  for (const x of u.added) { ok = false; lines.push(`  + ${u.label} ${x}  — published, and nothing reads it: remove the publication, or give it its reader (a console-only diagnostic says so in dev-notes and runs --update)`); }
  for (const x of u.removed) { ok = false; lines.push(`  − ${u.label} ${x}  — now read or gone: run --update so the baseline records it`); }
  lines.unshift(`global surface: IM_HOST ${cur.host.length} members (${cur.hostWritable.length} writable) · window ${cur.window.length} names, ${cur.unread.length} unread` + (ok ? ' — matches the baseline' : ''));
  return { ok, lines };
}

if (process.argv[1] && process.argv[1].endsWith('global-surface.mjs')) {
  const arg = process.argv[2];
  if (arg === '--update') {
    const cur = measure();
    writeFileSync(BASELINE, JSON.stringify({ '//': 'written by scripts/global-surface.mjs --update — names, not counts, so a diff names the member that changed', ...cur }, null, 1) + '\n');
    console.log(`baseline written: IM_HOST ${cur.host.length} (${cur.hostWritable.length} writable) · window ${cur.window.length}`);
  } else if (arg === '--check') {
    const r = check();
    for (const l of r.lines) (r.ok ? console.log : console.error)(l);
    process.exit(r.ok ? 0 : 1);
  } else {
    const cur = measure();
    console.log(`IM_HOST: ${cur.host.length} members, ${cur.hostWritable.length} writable`);
    console.log(`window:  ${cur.window.length} names published by js/ and src/`);
    const im = cur.window.filter((n) => /^IntMap/.test(n)).length;
    console.log(`         ${im} of them IntMap*`);
  }
}
