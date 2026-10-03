/* ============================================================================
 *  IntMap · atlas-outward-effects — WHAT A PRESSED CONTROL DOES IS DECLARED BY THE CONTROL
 * ----------------------------------------------------------------------------
 *  `system.control` (js/atlas-capabilities.js, confirm 'none') presses ANY button in the app. Column 8
 *  cannot say what that press does, because the row is the same whether the button zooms the map or
 *  publishes a community post. So the ELEMENT says it (`data-effect`), js/atlas-controls.js reads it
 *  (`controlEffect`), and js/atlas-executor.js 4b asks the reader first — under exactly the 'explicit'
 *  rule of #R801 — when the effect is 'outward' or 'destructive' and the model is acting after outside
 *  content has been in front of it this turn.
 *
 *  Everything below RUNS the shipped code (tests/r447 ⑤: a check that only reads the source is
 *  satisfied by its own comment) except the gate in section D, which has to read source because its
 *  subject is the source: «a click/change/Enter handler that reaches a write declares what it writes».
 *
 *   A  the kernel asks, before pressing, for an outward control after outside content — and the
 *      reader's answer runs the same call (the capability is not reduced)
 *   B  without outside content, from the UI, or for an undeclared control, nothing changes
 *   C  the control catalogue the MODEL reads never names a personal-information field by its
 *      placeholder (the delete-account field's placeholder is the reader's own address)
 *   D  every click/change/Enter handler that reaches a Supabase write, an rpc, an auth change or a POSTed
 *      Edge Function is on an element that declares `data-effect` — and a new undeclared one is red
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { rpcIsRead } from '../scripts/data-effects.mjs';   /* (supporter-funnel) a GET/HEAD rpc is a read — one predicate, not a second spelling */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};

/* the declared vocabulary — js/atlas-controls.js `_effectOf` documents it */
const EFFECTS = new Set(['outward', 'destructive', 'private', 'none']);

/* ══ a small DOM: exactly the surface js/atlas-controls.js touches on these paths ═════════════════ */
function el(tag, attrs, text) {
  const a = Object.assign({}, attrs || {});
  const e = {
    tagName: tag.toUpperCase(), textContent: text || '', disabled: false, offsetParent: {},
    presses: 0, events: [],
    get id() { return a.id || ''; },
    get type() { return a.type || (tag === 'input' ? 'text' : ''); },
    get placeholder() { return a.placeholder || ''; },
    value: '',
    getAttribute: (k) => (k in a ? String(a[k]) : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: (k) => { delete a[k]; },
    closest: () => null,
    previousElementSibling: null,
    click() { e.presses++; },
    focus() {},
    dispatchEvent(ev) { e.events.push(ev && ev.type); return true; }
  };
  return e;
}
function installDom(els) {
  globalThis.document = {
    querySelectorAll: () => els.slice(),
    querySelector: () => null,
    getElementById: (id) => els.find((x) => x.id === id) || null
  };
  if (typeof globalThis.KeyboardEvent === 'undefined') globalThis.KeyboardEvent = class { constructor(t) { this.type = t; } };
  if (typeof globalThis.Event === 'undefined') globalThis.Event = class { constructor(t) { this.type = t; } };
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const { makeAtlasControls } = await import('../js/atlas-controls.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');

function makeControls() {
  /* the factory arms a 3.5 s naming sweep and a periodic wheel; neither is under test here */
  const st = globalThis.setTimeout; globalThis.setTimeout = () => 0;
  try {
    return makeAtlasControls({ lang: 'en', user: null }, {
      L: (en) => en, R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
      _ctlTogHtml: () => '', esc, note: (s) => s, warn: (s) => s
    });
  } finally { globalThis.setTimeout = st; }
}

/* the world: a declared send button, an undeclared map button, and the delete-account field */
function world() {
  const send = el('button', { id: 'fb-send', 'data-effect': 'outward' }, 'Submit');
  const zoom = el('button', { id: 'btn-zoom-in' }, 'Zoom in');
  const wipe = el('button', { id: 'acct-delete', 'data-effect': 'destructive' }, 'Delete account');
  installDom([send, zoom, wipe]);
  const C = makeControls();
  const caps = makeAtlasCapabilities({});
  caps.bindRuntime({
    dispatch: (a) => (a.type === 'control' ? C.doControl(a) : { ok: false, meta: { code: 'unavailable' } }),
    effects: { 'system.control': C.controlEffect }
  });
  const K = installAtlasKernel({}, {}, { capabilities: caps });
  return { send, zoom, wipe, C, K, caps };
}

/* ══ A ═════════════════════════════════════════════════════════════════════════════════════════ */

test('A①: after outside content, the model pressing an outward control is asked about — BEFORE anything is pressed', async () => {
  const { send, K } = world();
  const r = await K.exec.execute('system.control', { target: 'fb-send' }, { source: 'atlas', externalContent: true });
  assert.equal(r.status, 'needs_input', JSON.stringify(r));
  assert.equal(r.code, 'needs_confirm');
  assert.equal(r.inputRequest && r.inputRequest.effect, 'outward', 'the question says what the press would do');
  assert.equal(send.presses, 0, 'nothing was pressed while the question is open');
});

test('A②: a destructive control is asked about the same way', async () => {
  const { wipe, K } = world();
  const r = await K.exec.execute('system.control', { target: 'acct-delete' }, { source: 'atlas', externalContent: true });
  assert.equal(r.code, 'needs_confirm');
  assert.equal(r.inputRequest.effect, 'destructive');
  assert.equal(wipe.presses, 0);
});

test('A③: the reader\'s answer runs the same call — the capability is asked about, not withdrawn', async () => {
  const { send, K } = world();
  const r = await K.exec.execute('system.control', { target: 'fb-send' }, { source: 'atlas', externalContent: true, confirmed: true });
  assert.notEqual(r.status, 'needs_input', JSON.stringify(r));
  assert.equal(send.presses, 1, 'pressed exactly once');
  assert.equal(r.meta && r.meta.effect, 'outward', 'and the result says what the press did');
});

/* ══ B ═════════════════════════════════════════════════════════════════════════════════════════ */

test('B①: with nothing from outside in the turn, the reader\'s own request presses it as before', async () => {
  const { send, K } = world();
  const r = await K.exec.execute('system.control', { target: 'fb-send' }, { source: 'atlas', externalContent: false });
  assert.notEqual(r.code, 'needs_confirm', JSON.stringify(r));
  assert.equal(send.presses, 1);
});

test('B②: a UI press and a map-click resume are never asked, even with outside content in the turn', async () => {
  for (const source of ['ui', 'atlas-resume']) {
    const { send, K } = world();
    const r = await K.exec.execute('system.control', { target: 'fb-send' }, { source, externalContent: true });
    assert.notEqual(r.code, 'needs_confirm', source + ': ' + JSON.stringify(r));
    assert.equal(send.presses, 1, source);
  }
});

test('B③: an undeclared control is pressed after outside content exactly as before', async () => {
  const { zoom, K } = world();
  const r = await K.exec.execute('system.control', { target: 'btn-zoom-in' }, { source: 'atlas', externalContent: true });
  assert.notEqual(r.code, 'needs_confirm', JSON.stringify(r));
  assert.equal(zoom.presses, 1);
});

test('B④: a fallback that is not the control action (a layer or tool name) never presses a declared control', () => {
  const { send, zoom, C } = world();
  const r = C.doControl({ target: 'fb-send' });
  assert.equal(r.ok, false);
  assert.equal(send.presses, 0, 'the fallback road was not judged by 4b, so it does not reach an outward control');
  assert.equal(C.doControl({ target: 'btn-zoom-in' }).ok, true, 'an undeclared control is still reached by the fallback');
  assert.equal(zoom.presses, 1);
});

test('B⑤: the shipped table did not lose a capability — every row has an effect reader, and only bound ids answer', () => {
  const caps = makeAtlasCapabilities({});
  const rows = caps.all().filter((c) => !c.withdrawn);
  assert.ok(rows.length > 0);
  for (const c of rows) assert.equal(typeof c.effectOf, 'function', c.id);
  assert.equal(rows.find((c) => c.id === 'system.control').confirmation, 'none', 'the row stays confirm-free: the ELEMENT decides');
  assert.equal(rows.find((c) => c.id === 'system.control').effectOf(null, { target: 'x' }), '', 'unbound: nothing is claimed');
});

/* ══ C ═════════════════════════════════════════════════════════════════════════════════════════ */

test('C①: a personal-information field is never named by its placeholder in the catalogue the model reads', () => {
  const email = el('input', { id: 'acct-ask-in', type: 'email', placeholder: 'reader@example.com', autocomplete: 'off' });
  const typed = el('input', { id: 'nick', type: 'text', placeholder: 'Jane Q. Reader', autocomplete: 'nickname' });
  const search = el('input', { id: 'place-search', type: 'text', placeholder: 'Search a place' });
  const labelled = el('input', { id: 'lbl', type: 'text', placeholder: 'fallback', 'aria-label': 'Radius' });
  installDom([email, typed, search, labelled]);
  const cat = makeControls().controlCatalog('');
  assert.ok(!/reader@example\.com/.test(cat), 'the reader\'s address reached the catalogue:\n' + cat);
  assert.ok(!/Jane Q\. Reader/.test(cat), 'a personal autocomplete field is named by its placeholder:\n' + cat);
  assert.match(cat, /\[#acct-ask-in\]/, 'the field is still in the catalogue — by its id');
  assert.match(cat, /Search a place/, 'an ordinary field keeps its placeholder as a last-resort name');
  assert.match(cat, /Radius \[#lbl\]/, 'an authored aria-label outranks the placeholder');
});

/* ══ D — the gate over the source ══════════════════════════════════════════════════════════════
   A handler REACHES A WRITE when its body — or a function it calls by name, in its own file or
   exported under that name from another — contains one of:
     · `.from(t).insert|upsert|update|delete(…)`      (a Supabase table write)
     · `.rpc(…)`                                       (a Postgres function — unless sent as GET/HEAD,
                                                        which PostgREST runs read-only: rpcIsRead)
     · a method call on an `auth` chain that changes the account or the session
     · `fetch('…/functions/v1/…', {method: POST|PUT|PATCH|DELETE})`
   Handlers registered INSIDE that body are separate handlers (a dialog's own «Create» button is
   not the button that opened the dialog), so the walk does not descend into them.
   The ELEMENT it is registered on is resolved from getElementById / querySelector / a
   querySelectorAll(…).forEach parameter / a variable bound to one of those, and must carry
   `data-effect` in its markup (index.html, a standalone page, or any js/*.js), or have it set on that same variable. */
const AUTH_WRITES = new Set(['updateUser', 'signOut', 'resetPasswordForEmail', 'signUp', 'registerPasskey', 'delete', 'unenroll', 'linkIdentity', 'unlinkIdentity']);
const TABLE_WRITES = new Set(['insert', 'upsert', 'update', 'delete']);
/* what a control press can fire: js/atlas-controls.js doControl clicks, sets a value and dispatches
   input/change, or dispatches Enter (keydown) */
const HANDLER_PROP = /^on(click|keydown|keypress|submit|change|input)$/;
const HANDLER_EVENT = /^(click|keydown|keypress|submit|change|input)$/;
/* ANY handler registration — the walk from one handler must not descend into another's body */
const ANY_PROP = /^on[a-z]+$/;
const prop = (m) => (m && m.type === 'MemberExpression' ? (m.computed ? (m.property.type === 'Literal' ? m.property.value : null) : m.property.name) : null);
function chainHas(n, name) {
  for (let k = 0; n && k < 12; k++) {
    if (n.type === 'MemberExpression') { if (prop(n) === name) return true; n = n.object; }
    else if (n.type === 'CallExpression') n = n.callee;
    else return n.type === 'Identifier' && n.name === name;
  }
  return false;
}
function sinkOf(n) {
  if (n.type !== 'CallExpression') return null;
  const p = prop(n.callee);
  if (TABLE_WRITES.has(p) && n.callee.object.type === 'CallExpression' && prop(n.callee.object.callee) === 'from') return 'table.' + p;
  if (p === 'rpc') return rpcIsRead(n) ? null : 'rpc';
  if (AUTH_WRITES.has(p) && chainHas(n.callee.object, 'auth')) return 'auth.' + p;
  if (n.callee.type === 'Identifier' && n.callee.name === 'fetch' && n.arguments[0]) {
    const u = n.arguments[0];
    const txt = u.type === 'Literal' ? String(u.value) : u.type === 'TemplateLiteral' ? u.quasis.map((q) => q.value.cooked).join('') : JSON.stringify(u);
    const o = n.arguments[1];
    if (/functions\/v1\//.test(txt) && o && o.type === 'ObjectExpression' && o.properties.some((q) => q.key && (q.key.name || q.key.value) === 'method' && q.value.type === 'Literal' && /^(post|put|patch|delete)$/i.test(q.value.value))) return 'edge-function';
  }
  return null;
}
function parse(src) {
  for (const sourceType of ['module', 'script']) { try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true }); } catch (_) { } }
  return null;
}
/* is this node a handler registration? → [targetExpr, fnExpr]. `any` = every event, for the walk's skip */
function registration(n, any) {
  if (n.type === 'AssignmentExpression' && (any ? ANY_PROP : HANDLER_PROP).test(prop(n.left) || '')) return [n.left.object, n.right];
  if (n.type === 'CallExpression' && prop(n.callee) === 'addEventListener' && n.arguments[0] && n.arguments[0].type === 'Literal' && (any || HANDLER_EVENT.test(n.arguments[0].value))) return [n.callee.object, n.arguments[1]];
  return null;
}
/* `Obj.name.apply(…)` / `Obj.name.call(…)` — the forwarding-shim shape (js/app-body.js keeps a hoisted
   `function cmAddPost(){ return IM_COMMBOARD.cmAddPost.apply(this,arguments); }` for each name a factory
   moved out). ⚠ ONLY that shape: following every `obj.method()` by name joins `push`, `get` and `add`
   across the whole repository into one graph, and every handler «reaches» every write (measured). */
function memberCallee(n) {
  if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return null;
  const p = prop(n.callee);
  if ((p === 'apply' || p === 'call') && n.callee.object.type === 'MemberExpression') return prop(n.callee.object);
  return null;
}
function namedFunctions(ast) {
  const m = new Map();
  walk.full(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) m.set(n.id.name, n);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type)) m.set(n.id.name, n.init);
  });
  return m;
}
/* the walk that skips nested handler registrations */
function eachNode(root, fn) {
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    const reg = registration(n, true);
    fn(n);
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      if (reg && n[k] === (n.type === 'AssignmentExpression' ? n.right : null)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c, i) => { if (!(reg && n.type === 'CallExpression' && k === 'arguments' && i === 1)) visit(c); });
      else if (v && typeof v.type === 'string') visit(v);
    }
  })(root);
}

/* the names a function binds as its parameters (destructured and defaulted ones included) */
function paramsOf(fn) {
  const out = new Set();
  const add = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') out.add(p.name);
    else if (p.type === 'AssignmentPattern') add(p.left);
    else if (p.type === 'RestElement') add(p.argument);
    else if (p.type === 'ArrayPattern') p.elements.forEach(add);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => add(q.type === 'RestElement' ? q.argument : q.value));
  };
  (fn.params || []).forEach(add);
  return out;
}

export function scanHandlers(files, markup) {
  const parsed = files.map(({ path, src }) => ({ path, src, ast: parse(src) })).filter((f) => f.ast);
  /* names exported across files (a factory's return destructured elsewhere keeps the name) */
  const global = new Map();
  for (const f of parsed) { f.named = namedFunctions(f.ast); for (const [k, v] of f.named) if (!global.has(k)) global.set(k, []); for (const [k, v] of f.named) global.get(k).push({ f, fn: v }); }
  const memo = new Map();
  function writes(fn, file, stack) {
    if (memo.has(fn)) return memo.get(fn);
    if (stack.has(fn)) return null;
    stack.add(fn);
    let hit = null;
    eachNode(fn.body || fn, (n) => {
      if (hit) return;
      const s = sinkOf(n); if (s) { hit = s; return; }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
        const nm = n.callee.name;
        /* ⚠ A PARAMETER IS WHATEVER THE CALLER PASSED, NOT THE FUNCTION THAT HAPPENS TO SHARE ITS NAME.
           MEASURED (news-intelligence): js/ocean-currents.js `_mkIcon(name, S, paint)` calls its
           `paint` argument, and the walk resolved it to js/news-intel.js's `paint` — so twelve
           buttons in four files «reached» an rpc none of them can reach. The value of a parameter is
           not known here, so it is not followed (its caller's argument is walked where it is written). */
        if (paramsOf(fn).has(nm)) return;
        const cands = file.named.has(nm) ? [{ f: file, fn: file.named.get(nm) }] : (global.get(nm) || []);
        for (const c of cands) { const r = writes(c.fn, c.f, stack); if (r) { hit = nm + '→' + r; return; } }
      }
      /* a forwarding shim, followed ONLY into another file's function of that name */
      const mn = memberCallee(n);
      if (mn && global.has(mn)) {
        for (const c of global.get(mn)) { if (c.f === file) continue; const r = writes(c.fn, c.f, stack); if (r) { hit = mn + '→' + r; return; } }
      }
    });
    stack.delete(fn);
    memo.set(fn, hit);
    return hit;
  }
  const found = [];
  for (const f of parsed) {
    walk.ancestor(f.ast, {
      AssignmentExpression(n, anc) { visit(n, anc); },
      CallExpression(n, anc) { visit(n, anc); }
    });
    function visit(n, anc) {
      const reg = registration(n); if (!reg) return;
      let [target, fn] = reg;
      if (fn && fn.type === 'Identifier') fn = f.named.get(fn.name) || null;
      if (!fn) return;
      const w = writes(fn, f, new Set()); if (!w) return;
      const sel = selectorOf(target, anc, f);
      const declaredInJs = target.type === 'Identifier' && new RegExp('\\b' + target.name + '\\s*\\.\\s*(dataset\\.effect\\s*=|setAttribute\\(\\s*[\'"]data-effect[\'"])').test(f.src);
      const line = f.src.slice(0, n.start).split('\n').length;
      found.push({ where: f.path + ':' + line, sink: w, selector: sel, declared: declaredInJs || (sel ? markupDeclares(sel, markup) : false) });
    }
  }
  return found;
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
    /* a forEach parameter over querySelectorAll(lit) */
    for (let i = anc.length - 1; i >= 0; i--) {
      const a = anc[i];
      if ((a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression') && a.params.some((p) => p.type === 'Identifier' && p.name === t.name)) {
        const call = anc[i - 1];
        if (call && call.type === 'CallExpression' && prop(call.callee) === 'forEach' && call.callee.object.type === 'CallExpression' && prop(call.callee.object.callee) === 'querySelectorAll') return literalOf(call.callee.object.arguments[0]);
        return null;
      }
    }
    /* a variable bound to a lookup — the nearest declaration before the registration */
    if (!f.decls) { f.decls = new Map(); walk.full(f.ast, (n) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) { if (!f.decls.has(n.id.name)) f.decls.set(n.id.name, []); f.decls.get(n.id.name).push(n); } }); }
    const at = anc.length ? anc[anc.length - 1].start : Infinity;
    let best = null;
    for (const n of f.decls.get(t.name) || []) if (n.start < at && (!best || n.start > best.start)) best = n;
    if (best && best.init.type === 'CallExpression') return selectorOf(best.init, [], f);
  }
  return null;
}
/* opening tags in the markup corpus: <tag attrs> */
const TAG = /<([a-zA-Z][\w-]*)(\s[^<>]*)?>/g;
function tagsOf(markup) { const out = []; for (const m of markup.matchAll(TAG)) out.push({ tag: m[1].toLowerCase(), attrs: m[2] || '', at: m.index }); return out; }
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
function markupDeclares(sel, markup) {
  const parts = sel.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const tags = markup.tags;
  let hits;
  if (parts.length === 1 || /[#.]/.test(last)) hits = tags.filter((t) => matchesCompound(t, last));
  else {
    /* `.ancestor tag` — the first such tag after each ancestor */
    hits = [];
    tags.forEach((t, i) => { if (!matchesCompound(t, parts[parts.length - 2])) return; const nx = tags.slice(i + 1, i + 13).find((u) => u.tag === last.toLowerCase()); if (nx) hits.push(nx); });
  }
  return hits.length > 0 && hits.every((t) => DECL.test(t.attrs));
}
function corpus(entries) {
  const text = entries.map((e) => e.src).join('\n');
  return { text, tags: tagsOf(text) };
}

const JS_FILES = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => ({ path: 'js/' + f, src: read('js/' + f) }));
/* (sales-channels) index.html AND every standalone page — discovered (scripts/js-reachability.mjs), the same
   markup scripts/data-effects.mjs reads: contact.html's form and the enquiries console declare their controls there */
const { standalonePages } = await import(pathToFileURL(join(ROOT, 'scripts', 'js-reachability.mjs')).href);
const MARKUP = corpus(JS_FILES.concat(['index.html', ...standalonePages(ROOT)].map((n) => ({ path: n, src: read(n) }))));

test('D①: every click/Enter handler that reaches a write is on an element that declares data-effect', () => {
  const found = scanHandlers(JS_FILES, MARKUP);
  assert.ok(found.length >= 10, 'the scan sees the handlers it exists for (feedback, community, account, monitors): ' + found.length);
  const bad = found.filter((x) => !x.declared).map((x) => `${x.where} ${x.selector || '(target not resolved)'} → ${x.sink}`);
  assert.deepEqual(bad, [], 'undeclared:\n' + bad.join('\n'));
});

test('D②: data-effect only ever holds its declared values', () => {
  const vals = [...MARKUP.text.matchAll(/data-effect=\\?["'](\w*)/g)].map((m) => m[1]);
  assert.ok(vals.length > 0);
  for (const v of vals) assert.ok(EFFECTS.has(v), 'data-effect=' + JSON.stringify(v));
});

test('D③: the controls the audit named declare what they do', () => {
  const need = { '#fb-send': 'outward', '#bug-send': 'outward', '#compose-submit': 'outward', '#acct-delete': 'destructive' };
  for (const [sel, eff] of Object.entries(need)) {
    const t = MARKUP.tags.filter((x) => matchesCompound(x, sel));
    assert.ok(t.length > 0, sel + ' is in the markup');
    for (const x of t) assert.equal((DECL.exec(x.attrs) || [])[1], eff, sel);
  }
});

test('D④: a new send button with no declaration turns the gate red — and declaring it turns it green', () => {
  const src = `(function(){ const b=document.getElementById('x-send'); b.onclick=async()=>{ await HOST.DB.from('t').insert({a:1}); }; })();`;
  const bare = corpus([{ path: 'x.js', src: '<button id="x-send">Send</button>' }]);
  const r1 = scanHandlers([{ path: 'x.js', src }], bare);
  assert.equal(r1.length, 1);
  assert.equal(r1[0].declared, false, 'an undeclared write handler is caught');
  const decl = corpus([{ path: 'x.js', src: '<button id="x-send" data-effect="outward">Send</button>' }]);
  assert.equal(scanHandlers([{ path: 'x.js', src }], decl)[0].declared, true);
  /* through a named function in another file, the way app-body reaches community-board's cmAddPost */
  const a = { path: 'a.js', src: `function sendIt(){ return HOST.DB.from('p').insert({}); }` };
  const b = { path: 'b.js', src: `document.getElementById('y').onclick=async()=>{ await sendIt(); };` };
  const r2 = scanHandlers([a, b], corpus([{ path: 'y', src: '<button id="y">Go</button>' }]));
  assert.equal(r2.length, 1); assert.equal(r2[0].declared, false);
  /* a dialog's own button registered inside the opener's body is not the opener's write */
  const c = { path: 'c.js', src: `document.getElementById('open').onclick=()=>{ document.getElementById('save').onclick=()=>HOST.DB.from('q').update({}); };` };
  const r3 = scanHandlers([c], corpus([{ path: 'c', src: '<button id="open">Open</button><button id="save" data-effect="private">Save</button>' }]));
  assert.deepEqual(r3.map((x) => x.selector), ['#save']);
  /* a call to a PARAMETER is not a call to another file's function of the same name — and the same
     call written to the name itself still is (the rule narrows to parameters, nothing else) */
  const d = { path: 'd.js', src: `function paint(){ return HOST.DB.rpc('w', {}); }` };
  const e = { path: 'e.js', src: `function draw(paint){ paint(1); } document.getElementById('z').onclick=()=>{ draw(() => 0); };` };
  assert.deepEqual(scanHandlers([d, e], corpus([{ path: 'z', src: '<button id="z">Z</button>' }])), [], 'a parameter named paint is not d.js paint');
  const e2 = { path: 'e2.js', src: `function draw(){ paint(1); } document.getElementById('z').onclick=()=>{ draw(); };` };
  assert.equal(scanHandlers([d, e2], corpus([{ path: 'z', src: '<button id="z">Z</button>' }])).length, 1, 'a free call to paint still reaches d.js');
});
