/* ============================================================================
 *  IntMap · a control that WRITES, and does not say so   (output-taint-gate)
 * ----------------------------------------------------------------------------
 *  Atlas presses buttons (`system.control`, js/atlas-controls.js doControl). What a press DOES is
 *  declared by the element — `data-effect` = outward | destructive | private | none — and
 *  js/atlas-controls.js `controlEffect()` reads it so that js/atlas-executor.js 4b asks the reader
 *  before pressing an 'outward' or 'destructive' control after outside content has been in front of the
 *  model. That confirmation is exactly as good as the declarations: a control that writes to the
 *  database and declares nothing is pressed without a question.
 *
 *  This finds, from the parse tree, every UI handler (onclick / onchange / oninput / onkeydown /
 *  onkeypress / onsubmit, or addEventListener for those events — what doControl can fire) whose body
 *  reaches a WRITE, and asks whether the element it is registered on declares `data-effect`.
 *
 *    a WRITE   `.from(t).insert | upsert | update | delete(…)` (a Supabase table write), `.rpc(…)`,
 *              `.functions.invoke(…)`, an auth change (`auth.updateUser | signOut | resetPasswordForEmail
 *              | signUp | registerPasskey | delete | unenroll | linkIdentity | unlinkIdentity`), or
 *              `fetch('…/functions/v1/…', { method: POST | PUT | PATCH | DELETE })`
 *    REACHES   directly, or through a function called by name — in the same file, or defined under that
 *              name in another js/ file (a factory's return destructured elsewhere keeps the name) — or
 *              through a forwarding shim `Obj.name.apply(this, arguments)`, or through a member of a
 *              factory's host parameter (`HOST.cmAddPost(…)`), which is the repository's shared surface.
 *              A handler registered INSIDE a handler's body is a separate handler and is not followed.
 *    ELEMENT   resolved from getElementById / querySelector / a querySelectorAll(…).forEach parameter /
 *              a variable bound to one of those; declared when its markup (index.html or any string in
 *              js/) carries `data-effect`, or the same variable is given one in code.
 *              An element that cannot be resolved counts as undeclared — nothing can read a declaration
 *              that the analysis cannot find either.
 *
 *  tests/atlas-outward-effects-checks.test.mjs D① holds its own (narrower) walk to zero; this is the
 *  ledger form over a wider net (functions.invoke and host-member calls), counted per file and held to
 *  tests/data-effect-baseline.json in both directions: more → a new writing control declares nothing
 *  (give it data-effect in its markup); fewer → lower the ledger (`--update`).
 *  ⚠ js/atlas-*.js is read like every other file; nothing here edits it.
 *
 *      node scripts/data-effects.mjs            report every undeclared writing control
 *      node scripts/data-effects.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/data-effects.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs (§21) runs the comparison as its `data-effect` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, walk } from '../tests/helpers/ast.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
export const LEDGER = join(ROOT, 'tests', 'data-effect-baseline.json');
export const EFFECTS = new Set(['outward', 'destructive', 'private', 'none']);

const AUTH_WRITES = new Set(['updateUser', 'signOut', 'resetPasswordForEmail', 'signUp', 'registerPasskey', 'delete', 'unenroll', 'linkIdentity', 'unlinkIdentity']);
const TABLE_WRITES = new Set(['insert', 'upsert', 'update', 'delete']);
/* what doControl can fire: click(), a value + input/change, or Enter (keydown) */
const HANDLER_PROP = /^on(click|keydown|keypress|submit|change|input)$/;
const HANDLER_EVENT = /^(click|keydown|keypress|submit|change|input)$/;
const ANY_PROP = /^on[a-z]+$/;
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const prop = (m) => (m && m.type === 'MemberExpression' ? (m.computed ? (m.property.type === 'Literal' ? m.property.value : null) : m.property.name) : null);
function chainHas(n, name) {
  for (let k = 0; n && k < 12; k++) {
    if (n.type === 'MemberExpression') { if (prop(n) === name) return true; n = n.object; }
    else if (n.type === 'CallExpression') n = n.callee;
    else return n.type === 'Identifier' && n.name === name;
  }
  return false;
}
const literalText = (u) => (u.type === 'Literal' ? String(u.value) : u.type === 'TemplateLiteral' ? u.quasis.map((q) => q.value.cooked).join('${}') : null);
/* the known text of a URL expression. A request is usually built `base + '/functions/v1/<name>'`, and
   reading only a whole-literal URL lost exactly that (MEASURED 2026-09-30: the feedback form's send to
   reader-reports vanished from the writers the day it stopped being a table insert). The parts that are
   not text read as `${}`, so a concatenation says as much as a template literal does. */
const urlText = (u) => {
  if (!u) return null;
  const t = literalText(u); if (t != null) return t;
  if (u.type === 'BinaryExpression' && u.operator === '+') return (urlText(u.left) ?? '${}') + (urlText(u.right) ?? '${}');
  return null;
};

/** Is this node a write? → a short name of what it writes, or null. */
export function writeOf(n) {
  if (n.type !== 'CallExpression') return null;
  const p = prop(n.callee);
  if (TABLE_WRITES.has(p) && n.callee.object.type === 'CallExpression' && prop(n.callee.object.callee) === 'from') return 'table.' + p;
  if (p === 'rpc') return 'rpc';
  if (p === 'invoke' && chainHas(n.callee.object, 'functions')) return 'functions.invoke';
  if (AUTH_WRITES.has(p) && chainHas(n.callee.object, 'auth')) return 'auth.' + p;
  if (n.callee.type === 'Identifier' && n.callee.name === 'fetch' && n.arguments[0]) {
    const txt = urlText(n.arguments[0]) ?? '';
    const o = n.arguments[1];
    if (/functions\/v1\//.test(txt) && o && o.type === 'ObjectExpression' && o.properties.some((q) => q.key && (q.key.name || q.key.value) === 'method'
      && q.value.type === 'Literal' && /^(post|put|patch|delete)$/i.test(q.value.value))) return 'edge-function';
  }
  return null;
}
/* a handler registration → [targetExpr, fnExpr]; `any` = every event (for the walk's skip) */
function registration(n, any) {
  if (n.type === 'AssignmentExpression' && (any ? ANY_PROP : HANDLER_PROP).test(prop(n.left) || '')) return [n.left.object, n.right];
  if (n.type === 'CallExpression' && prop(n.callee) === 'addEventListener' && n.arguments[0] && n.arguments[0].type === 'Literal'
    && (any || HANDLER_EVENT.test(n.arguments[0].value))) return [n.callee.object, n.arguments[1]];
  return null;
}
/* the walk from one handler: it does not descend into another handler registered inside it */
function eachNode(root, fn) {
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    const reg = registration(n, true);
    fn(n);
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      if (reg && n.type === 'AssignmentExpression' && n[k] === n.right) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c, i) => { if (!(reg && n.type === 'CallExpression' && k === 'arguments' && i === 1)) visit(c); });
      else if (v && typeof v.type === 'string') visit(v);
    }
  })(root);
}
function namedFunctions(ast) {
  const m = new Map();
  const put = (k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  walk.full(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) put(n.id.name, n);
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && FN.has(n.init.type)) put(n.id.name, n.init);
    else if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && FN.has(n.value.type)) put(n.key.name, n.value);
    else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && FN.has(n.right.type)) put(n.left.property.name, n.right);
  });
  return m;
}
/* names this file binds to something that is NOT a function it defines (a parameter, a plain variable, a
   catch binding). A call through such a name is a call of whatever value it holds, and following it by
   NAME into another file joins every `fn()` / `run()` / `cb()` in the repository into one graph
   (measured: 433 of 462 handlers «reached» a write that way). A destructured or imported name is the
   other file's function under the same name, and is followed. */
function plainNames(ast) {
  const s = new Set();
  const pat = (p) => { if (p && p.type === 'Identifier') s.add(p.name); else if (p && p.type === 'AssignmentPattern') pat(p.left); };
  walk.full(ast, (n) => {
    if (FN.has(n.type)) n.params.forEach(pat);
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && !(n.init && FN.has(n.init.type))) s.add(n.id.name);
    else if (n.type === 'CatchClause' && n.param) pat(n.param);
  });
  return s;
}
/* functions published as `window.<name> = function …` — a `window.<name>(…)` call reaches exactly these */
function windowFunctions(ast) {
  const m = new Map();
  walk.full(ast, (n) => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && FN.has(n.right.type)
      && n.left.object.type === 'Identifier' && n.left.object.name === 'window') {
      if (!m.has(n.left.property.name)) m.set(n.left.property.name, []); m.get(n.left.property.name).push(n.right);
    }
  });
  return m;
}
const pathOf = (n) => (n.type === 'Identifier' ? n.name : (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && pathOf(n.object)) ? pathOf(n.object) + '.' + n.property.name : '');
/* THE HOST A FACTORY IS GIVEN. `window.IntMapModules.countriesUi = function (HOST) {…}` is called as
   `window.IntMapModules.countriesUi(IM_HOST)`, and IM_HOST is an object literal in the caller — so
   `HOST.cmAddPost(…)` inside the factory is that literal's `cmAddPost` (a shorthand, a getter returning a
   name, or a function), resolved in the CALLER's file. Discovered from the calls, not listed. */
function hostObjects(parsed) {
  const defs = new Map();   /* factory key → [{ f, fn }] */
  for (const f of parsed) walk.full(f.ast, (n) => {
    if (n.type === 'AssignmentExpression' && FN.has(n.right.type) && /^(?:window.)?IntMapModules.[w$]+$/.test(pathOf(n.left))) {
      const k = pathOf(n.left).replace(/^window./, ''); if (!defs.has(k)) defs.set(k, []); defs.get(k).push({ f, fn: n.right });
    }
  });
  const out = new Map();    /* factory fn → { df: its file, m: Map(paramName → [{ f, obj }]) } */
  for (const f of parsed) {
    const objOf = (a) => {
      if (!a) return null;
      if (a.type === 'ObjectExpression') return a;
      if (a.type === 'Identifier') { let o = null; walk.full(f.ast, (n) => { if (!o && n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === a.name && n.init && n.init.type === 'ObjectExpression') o = n.init; }); return o; }
      return null;
    };
    walk.full(f.ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const k = pathOf(n.callee).replace(/^window./, '');
      for (const d of defs.get(k) || []) d.fn.params.forEach((p, i) => {
        if (p.type !== 'Identifier') return;
        const o = objOf(n.arguments[i]); if (!o) return;
        if (!out.has(d.fn)) out.set(d.fn, { df: d.f, m: new Map() });
        const m = out.get(d.fn).m; if (!m.has(p.name)) m.set(p.name, []); m.get(p.name).push({ f, obj: o });
      });
    });
  }
  return out;
}

function literalOf(n) { return n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : (n && n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null); }
function selectorOf(t, anc, f) {
  if (!t) return null;
  if (t.type === 'CallExpression') {
    const lit = literalOf(t.arguments[0]); if (lit == null) return null;
    const p = prop(t.callee);
    if (p === 'querySelector') return lit;
    if (p === 'getElementById' || t.callee.type === 'Identifier') return '#' + lit;
    return null;
  }
  if (t.type === 'Identifier') {
    for (let i = anc.length - 1; i >= 0; i--) {
      const a = anc[i];
      if ((a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression') && a.params.some((p) => p.type === 'Identifier' && p.name === t.name)) {
        const call = anc[i - 1];
        if (call && call.type === 'CallExpression' && prop(call.callee) === 'forEach' && call.callee.object.type === 'CallExpression'
          && prop(call.callee.object.callee) === 'querySelectorAll') return literalOf(call.callee.object.arguments[0]);
        return null;
      }
    }
    if (!f.decls) { f.decls = new Map(); walk.full(f.ast, (n) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) { if (!f.decls.has(n.id.name)) f.decls.set(n.id.name, []); f.decls.get(n.id.name).push(n); } }); }
    const at = anc.length ? anc[anc.length - 1].start : Infinity;
    let best = null;
    for (const n of f.decls.get(t.name) || []) if (n.start < at && (!best || n.start > best.start)) best = n;
    if (best && best.init.type === 'CallExpression') return selectorOf(best.init, [], f);
  }
  return null;
}

/* opening tags in the markup corpus */
const TAG = /<([a-zA-Z][\w-]*)(\s[^<>]*)?>/g;
export function corpus(entries) {
  const text = entries.map((e) => e.src).join('\n');
  const tags = [];
  for (const e of entries) for (const m of e.src.matchAll(TAG)) tags.push({ tag: m[1].toLowerCase(), attrs: m[2] || '', file: e.path });
  return { text, tags };
}
function matchesCompound(t, comp) {
  const m = /^([a-z][\w-]*)?((?:[#.][\w-]+|\[[\w-]+\])*)$/i.exec(comp); if (!m) return false;
  if (m[1] && t.tag !== m[1].toLowerCase()) return false;
  for (const at of (m[2].match(/\[[\w-]+\]/g) || [])) if (!new RegExp('(^|\\s)' + at.slice(1, -1) + '=').test(t.attrs)) return false;
  for (const part of (m[2].match(/[#.][\w-]+/g) || [])) {
    const name = part.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (part[0] === '#' && !new RegExp('\\bid=\\\\?["\']' + name + '\\\\?["\']').test(t.attrs)) return false;
    if (part[0] === '.' && !new RegExp('\\bclass=\\\\?["\'][^"\']*(?<![\\w-])' + name + '(?![\\w-])').test(t.attrs)) return false;
  }
  return true;
}
const DECL = /\bdata-effect=\\?["'](\w+)/;
/* ⚠ A selector names markup, and the SAME attribute can mean different controls in different files
   (`[data-del]` is a preset's delete in js/map-ui.js and a waypoint's in js/drone-nav.js, which writes
   nothing). When the handler's own file carries markup the selector matches, that is the markup it is
   wired to; only a handler whose file carries none (an id in index.html) is answered from the corpus. */
function markupDeclares(sel, markup, file) {
  const parts = sel.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const own = file ? markup.tags.filter((t) => t.file === file) : [];
  const hits = (own.length && selectorHits(parts, last, own).length) ? selectorHits(parts, last, own) : selectorHits(parts, last, markup.tags);
  return hits.length > 0 && hits.every((t) => DECL.test(t.attrs));
}
function selectorHits(parts, last, tags) {
  let hits;
  if (parts.length === 1 || /[#.]/.test(last)) hits = tags.filter((t) => matchesCompound(t, last));
  else {
    hits = [];
    tags.forEach((t, i) => { if (!matchesCompound(t, parts[parts.length - 2])) return; const nx = tags.slice(i + 1, i + 13).find((u) => u.tag === last.toLowerCase()); if (nx) hits.push(nx); });
  }
  return hits;
}

/* the trees are only read here; an unchanged text is parsed once per process (the regression test runs
   the gate on several mutated copies of the tree) */
const AST_CACHE = new Map();
/** Every handler that reaches a write: { file, line, sink, selector, declared }. */
export function scanHandlers(files, markup) {
  const parsed = [];
  for (const { path, src } of files) {
    const ast = AST_CACHE.has(src) ? AST_CACHE.get(src) : AST_CACHE.set(src, parseSource(src, { orNull: true })).get(src);
    if (ast) parsed.push({ path, src, ast });
  }
  const global = new Map();
  for (const f of parsed) {
    f.named = namedFunctions(f.ast); f.plain = plainNames(f.ast); f.win = windowFunctions(f.ast);
    for (const [k, vs] of f.named) { if (!global.has(k)) global.set(k, []); for (const v of vs) global.get(k).push({ f, fn: v }); }
  }
  const hosts = hostObjects(parsed);
  /* per file: parameter name → the literal objects its factory is called with */
  for (const f of parsed) f.host = new Map();
  for (const { df, m } of hosts.values()) for (const [k, v] of m) df.host.set(k, (df.host.get(k) || []).concat(v));
  /* HOST.x → the function the caller's literal gives as x */
  const hostMember = (file, recv, key) => {
    const out = [];
    for (const { f, obj } of file.host.get(recv) || []) {
      const pr = obj.properties.find((q) => q.type === 'Property' && !q.computed && ((q.key.name ?? String(q.key.value)) === key));
      if (!pr) continue;
      let v = pr.value;
      if (pr.kind === 'get' && FN.has(v.type)) { let r = null; walk.full(v.body, (x) => { if (!r && x.type === 'ReturnStatement' && x.argument) r = x.argument; }); v = r || v; }
      if (FN.has(v.type)) out.push({ f, fn: v });
      else if (v.type === 'Identifier') for (const g of f.named.get(v.name) || []) out.push({ f, fn: g });
    }
    return out;
  };
  const memo = new Map();
  function writes(fn, file, stack) {
    if (memo.has(fn)) return memo.get(fn);
    if (stack.has(fn)) return null;
    stack.add(fn);
    let hit = null;
    const follow = (cands, label) => { for (const c of cands) { const r = writes(c.fn, c.f, stack); if (r) { hit = label + '→' + r; return true; } } return false; };
    eachNode(fn.body || fn, (n) => {
      if (hit) return;
      const s = writeOf(n); if (s) { hit = s; return; }
      if (n.type !== 'CallExpression') return;
      const c = n.callee;
      if (c.type === 'Identifier') {
        const nm = c.name;
        const own = (file.named.get(nm) || []).map((v) => ({ f: file, fn: v }));
        if (own.length) { if (follow(own, nm)) return; }
        else if (!file.plain.has(nm) && follow(global.get(nm) || [], nm)) return;
      }
      if (c.type === 'MemberExpression') {
        const p = prop(c);
        /* the forwarding shim `Obj.name.apply(this, arguments)` — followed into another file's function of that name */
        if ((p === 'apply' || p === 'call') && c.object.type === 'MemberExpression') {
          const mn = prop(c.object);
          if (mn && follow((global.get(mn) || []).filter((x) => x.f !== file), mn)) return;
        }
        /* window.name(…) — the functions published under that name */
        if (p && c.object.type === 'Identifier' && c.object.name === 'window') {
          const cands = parsed.flatMap((g) => (g.win.get(p) || []).map((v) => ({ f: g, fn: v })));
          if (follow(cands, 'window.' + p)) return;
        }
        /* HOST.name(…) — what the factory's caller put in the host literal under that name */
        if (p && c.object.type === 'Identifier' && file.host.has(c.object.name)) {
          if (follow(hostMember(file, c.object.name, p), c.object.name + '.' + p)) return;
        }
      }
    });
    stack.delete(fn);
    memo.set(fn, hit);
    return hit;
  }
  const found = [];
  for (const f of parsed) {
    const visit = (n, anc) => {
      const reg = registration(n); if (!reg) return;
      let [target, fn] = reg;
      if (fn && fn.type === 'Identifier') fn = (f.named.get(fn.name) || [])[0] || null;
      if (!fn || !(FN.has(fn.type))) return;
      const w = writes(fn, f, new Set()); if (!w) return;
      const sel = selectorOf(target, anc, f);
      const declaredInJs = target.type === 'Identifier'
        && new RegExp('\\b' + target.name + '\\s*\\.\\s*(dataset\\.effect\\s*=|setAttribute\\(\\s*[\'"]data-effect[\'"])').test(f.src);
      found.push({ file: f.path, line: n.loc.start.line, sink: w, selector: sel, declared: declaredInJs || (sel ? markupDeclares(sel, markup, f.path) : false) });
    };
    walk.ancestor(f.ast, { AssignmentExpression: visit, CallExpression: visit });
  }
  return found;
}

export function readTree(root = ROOT) {
  const files = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).sort()
    .map((f) => ({ path: 'js/' + f, src: readFileSync(join(root, 'js', f), 'utf8') }));
  const markup = corpus(files.concat([{ path: 'index.html', src: readFileSync(join(root, 'index.html'), 'utf8') }]));
  return { files, markup };
}
export function measure(tree = readTree()) {
  const found = scanHandlers(tree.files, tree.markup);
  const counts = {};
  for (const x of found) if (!x.declared) counts[x.file] = (counts[x.file] || 0) + 1;
  const bad = [...tree.markup.text.matchAll(/data-effect=\\?["'](\w*)/g)].map((m) => m[1]).filter((v) => !EFFECTS.has(v));
  return { found, counts, badValues: bad };
}
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

export function check(tree = readTree(), ledgerPath = LEDGER) {
  const lines = [];
  if (!existsSync(ledgerPath)) return { ok: false, lines: [`no ledger at ${ledgerPath} — run: node scripts/data-effects.mjs --update`] };
  const was = JSON.parse(readFileSync(ledgerPath, 'utf8')).files || {};
  const m = measure(tree);
  for (const v of m.badValues) lines.push(`data-effect="${v}" is not one of ${[...EFFECTS].join(' / ')} — js/atlas-controls.js reads nothing else`);
  for (const f of [...new Set([...Object.keys(was), ...Object.keys(m.counts)])].sort()) {
    const a = was[f] || 0, b = m.counts[f] || 0;
    if (b > a) {
      const where = m.found.filter((x) => x.file === f && !x.declared).map((x) => `${x.line} ${x.selector || '(element not resolved)'} → ${x.sink}`).join('; ');
      lines.push(`${f}: ${b} control(s) reach a database write without data-effect, the ledger allows ${a} — declare what the press does in its markup (outward / destructive / private / none): ${where}`);
    } else if (b < a) lines.push(`${f}: ${b} undeclared writing control(s), the ledger still says ${a} — lower it: node scripts/data-effects.mjs --update`);
  }
  return { ok: lines.length === 0, lines, counts: m.counts, total: total(m.counts), found: m.found };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const m = measure();
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/data-effects.mjs --update — UI handlers that reach a Supabase write / rpc / functions.invoke / auth change / POSTed Edge Function on an element that declares no data-effect, per file; ratcheted both ways by check:static',
      reaching: m.found.length, total: total(m.counts), files: Object.fromEntries(Object.entries(m.counts).sort()),
    }, null, 1) + '\n');
    console.log(`data-effects: ledger written — ${total(m.counts)} undeclared of ${m.found.length} writing controls`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `data-effects: ${r.total} undeclared writing controls, as the ledger says` : 'data-effects: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    const m = measure();
    for (const x of m.found) console.log(`${x.declared ? 'declared  ' : 'UNDECLARED'} ${x.file}:${x.line}  ${x.selector || '(element not resolved)'}  → ${x.sink}`);
    console.log(`\nwriting controls ${m.found.length} · undeclared ${total(m.counts)}`);
  }
}
