/* ============================================================================
 *  IntMap · THE EVENT BUS — every event IntMap raises is declared once  (event-bus)
 * ----------------------------------------------------------------------------
 *  js/bus.js holds the one table of IntMap's own window events (name · meaning · payload · who raises
 *  it · which files still use the bare DOM calls). This check DISCOVERS the event sites from the
 *  shipped source — it does not keep a list of its own — and holds the table to them both ways:
 *    ① a name raised or listened to anywhere in js/, src/ or a page, and not declared → FAIL
 *       (a new event has to be named in the table, with its meaning, before it can ship);
 *    ② a declared name nothing raises or hears → FAIL (the table stops describing the program);
 *    ③ `from` is exactly the files that raise it; `pending` is exactly the files that still call
 *       addEventListener / dispatchEvent for it by hand, each with a reason from WHY;
 *    ④ a payload declared as `{ a, b }` is the keys of every object literal raised with it, and an
 *       event declared without one is never raised with one;
 *    ⑤ the bus itself is RUN: delivery, off, once, the alias in both directions exactly once, and the
 *       refusal of an undeclared name under node (the development build's behaviour).
 *
 *  WHAT IS A SITE. Parsed with acorn (the grammar decides, not a pattern): the first argument of any
 *  `.addEventListener` / `.removeEventListener`, of `new Event` / `new CustomEvent`, of a bus call
 *  (`<ns>.emit|on|once` where <ns> is the file's `import * as <ns> from './bus.js'`), and the second
 *  argument of a runtime scope's `.on(target, name, fn)` (js/runtime.js). A name is a string literal,
 *  a template without holes, or an identifier bound to one — in the file, or imported by name from
 *  the file that declares it. IntMap's names are those spelled `intmap-…` / `intmap:…`; a
 *  `new CustomEvent` or a bus call of ANY name is IntMap's too (the platform never needs either).
 *  ⚠ LIMIT, stated rather than hidden: `new Event('resize')` re-raising a platform event is not an
 *  IntMap event and is not declared. A new event spelled WITHOUT the prefix and raised with
 *  `new Event(...)` would pass ① unseen — the prefix is the namespace this check can see.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { importModule } from './helpers/import-module.mjs';
import { EVENTS, WHY } from '../js/bus.js';

const ROOT = join(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const OURS = /^intmap[-:]/;

function parse(src, file) {
  try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true }); }
  catch (_) {
    try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, locations: true }); }
    catch (e) { throw new Error(`event-bus: cannot parse ${file} — ${e.message}`); }
  }
}
const strOf = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value
  : (n && n.type === 'TemplateLiteral' && !n.expressions.length) ? n.quasis[0].value.cooked : null;

/* top-level `const X = 'lit'` (exported or not) of a file — the binding an identifier argument may name */
const constCache = new Map();
function constsOf(file) {
  if (constCache.has(file)) return constCache.get(file);
  const out = {}; constCache.set(file, out);
  let ast; try { ast = parse(read(file), file); } catch (_) { return out; }
  for (const s of ast.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (d && d.type === 'VariableDeclaration' && d.kind === 'const') for (const v of d.declarations) {
      const val = v.id.type === 'Identifier' ? strOf(v.init) : null; if (val != null) out[v.id.name] = val;
    }
  }
  return out;
}

/** Every event site in one source text. kind: 'emit' | 'listen'; via: 'bus' | 'raw'. */
export function sitesIn(src, file) {
  const ast = parse(src, file);
  const dir = file.replace(/[^/]*$/, '');
  const bound = { ...constsOf(file) };
  const busNs = new Set();
  for (const s of ast.body) {
    if (s.type !== 'ImportDeclaration') continue;
    const from = String(s.source.value);
    if (/(^|\/)bus\.js$/.test(from)) for (const sp of s.specifiers) if (sp.type === 'ImportNamespaceSpecifier') busNs.add(sp.local.name);
    if (from.startsWith('.')) {
      const target = join(dir, from).replace(/\\/g, '/');
      const theirs = constsOf(target);
      for (const sp of s.specifiers) if (sp.type === 'ImportSpecifier' && theirs[sp.imported.name] != null) bound[sp.local.name] = theirs[sp.imported.name];
    }
  }
  /* a file-level const declared in THIS text (sitesIn is also handed synthetic sources) */
  for (const s of ast.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (d && d.type === 'VariableDeclaration' && d.kind === 'const') for (const v of d.declarations) {
      const val = v.id.type === 'Identifier' ? strOf(v.init) : null; if (val != null) bound[v.id.name] = val;
    }
  }
  const nameOf = (n) => strOf(n) ?? (n && n.type === 'Identifier' ? bound[n.name] ?? null : null);
  const out = [];
  const add = (node, name, kind, via, detail) => out.push({ file, line: node.loc.start.line, name, kind, via, detail });
  walk.full(ast, (n) => {
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && (n.callee.name === 'Event' || n.callee.name === 'CustomEvent')) {
      const name = nameOf(n.arguments[0]);
      if (name == null || (!OURS.test(name) && n.callee.name === 'Event')) return;
      const init = n.arguments[1];
      const dp = init && init.type === 'ObjectExpression' ? init.properties.find((p) => p.key && (p.key.name === 'detail' || p.key.value === 'detail')) : null;
      add(n, name, 'emit', 'raw', dp ? dp.value : null);
      return;
    }
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
    const prop = n.callee.property.name, obj = n.callee.object;
    if (obj.type === 'Identifier' && busNs.has(obj.name)) {
      const name = nameOf(n.arguments[0]); if (name == null) return;
      if (prop === 'emit') add(n, name, 'emit', 'bus', n.arguments[1] || null);
      else if (prop === 'on' || prop === 'once') add(n, name, 'listen', 'bus');
      return;
    }
    if (prop === 'addEventListener' || prop === 'removeEventListener') {
      const name = nameOf(n.arguments[0]); if (name != null && OURS.test(name)) add(n, name, 'listen', 'raw');
    } else if (prop === 'on' && n.arguments.length >= 3) {
      const name = nameOf(n.arguments[1]); if (name != null && OURS.test(name)) add(n, name, 'listen', 'raw');
    }
  });
  return out;
}

/* the population: every js/ and src/ module (js/bus.js is the mechanism, not a site), and the pages'
   inline scripts */
function jsFiles(dir) {
  return readdirSync(join(ROOT, dir), { recursive: true }).map((f) => String(f).replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.js') && !f.split('/').includes('vendor')).map((f) => dir + '/' + f);
}
const FILES = [...jsFiles('js'), ...jsFiles('src')].filter((f) => f !== 'js/bus.js');
const SITES = FILES.flatMap((f) => sitesIn(read(f), f));
for (const page of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const html = read(page);
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1]; if (!/intmap[-:]/.test(body)) continue;
    const line = html.slice(0, m.index).split('\n').length;
    let found; try { found = sitesIn(body, page); } catch (_) { continue; }   /* a JSON / non-JS block */
    for (const s of found) SITES.push({ ...s, line: line + s.line - 1 });
  }
}

const CANON = new Map();
for (const [name, d] of Object.entries(EVENTS)) { CANON.set(name, name); for (const a of d.aliases || []) CANON.set(a, name); }
const at = (s) => `${s.file}:${s.line}`;
const byEvent = new Map(Object.keys(EVENTS).map((k) => [k, []]));
for (const s of SITES) { const c = CANON.get(s.name); if (c) byEvent.get(c).push(s); }
const sorted = (xs) => [...new Set(xs)].sort();

test('the discovery sees the sites it claims to (a synthetic file, so the walk itself is measured)', () => {
  const src = `import * as bus from './bus.js';
    const N = 'intmap-made-up';
    window.addEventListener('intmap-lang', f); bus.on(N, f); A.on(window, 'intmap:x', f);
    window.dispatchEvent(new CustomEvent('anything-at-all', { detail: { a: 1 } })); bus.emit('intmap-y');
    window.dispatchEvent(new Event('resize'));`;
  const got = sitesIn(src, 'js/synthetic.js').map((s) => `${s.kind}:${s.via}:${s.name}`);
  assert.deepEqual(got.sort(), ['emit:bus:intmap-y', 'emit:raw:anything-at-all', 'listen:bus:intmap-made-up', 'listen:raw:intmap-lang', 'listen:raw:intmap:x'].sort());
  assert.ok(SITES.length > 50, `only ${SITES.length} sites found in the tree — the walk has stopped seeing them`);
});

test('① every event raised or heard is declared in js/bus.js', () => {
  const bad = SITES.filter((s) => !CANON.has(s.name)).map((s) => `${at(s)} ${s.kind} «${s.name}»`);
  assert.deepEqual(bad, [], 'undeclared event — add it to EVENTS in js/bus.js with what it means, its payload and who raises it');
});

test('② every declared event is raised or heard somewhere; a canonical name is not also an alias', () => {
  const dead = [...byEvent].filter(([, s]) => !s.length).map(([n]) => n);
  assert.deepEqual(dead, [], 'declared but used nowhere — take it out of the table');
  const names = Object.keys(EVENTS);
  for (const [n, d] of Object.entries(EVENTS)) for (const a of d.aliases || []) {
    assert.ok(!names.includes(a), `${a} is both an alias of ${n} and a declared name`);
    assert.equal([...CANON].filter(([k]) => k === a).length, 1);
  }
});

test('③ `from` is the files that raise it; `pending` the files still using the bare DOM calls, with a reason', () => {
  for (const [name, sites] of byEvent) {
    const d = EVENTS[name];
    assert.deepEqual(sorted(d.from), sorted(sites.filter((s) => s.kind === 'emit').map((s) => s.file)), `${name}: from`);
    assert.deepEqual(sorted(Object.keys(d.pending || {})), sorted(sites.filter((s) => s.via === 'raw').map((s) => s.file)),
      `${name}: pending — a file that moved to the bus leaves the list; a file that calls the DOM by hand must be in it`);
    for (const [f, why] of Object.entries(d.pending || {})) assert.ok(WHY[why], `${name} ${f}: reason «${why}» is not in WHY`);
    const heard = sites.some((s) => s.kind === 'listen'), raised = sites.some((s) => s.kind === 'emit');
    assert.equal(!!d.orphan, heard && !raised, `${name}: «orphan» says exactly that it is heard and never raised`);
    assert.ok(typeof d.means === 'string' && d.means.length > 20, `${name}: say what it means`);
  }
  for (const w of Object.keys(WHY)) assert.ok(Object.values(EVENTS).some((d) => Object.values(d.pending || {}).includes(w)), `WHY.${w} is used by no pending file`);
});

test('④ the payload raised is the payload declared', () => {
  for (const [name, sites] of byEvent) {
    const decl = EVENTS[name].detail;
    for (const s of sites.filter((x) => x.kind === 'emit')) {
      if (decl == null) { assert.equal(s.detail, null, `${at(s)} raises ${name} with a payload the table says it has none of`); continue; }
      assert.ok(s.detail, `${at(s)} raises ${name} without the payload the table declares (${decl})`);
      const keys = /^\{([^}]*)\}$/.exec(decl.trim());
      if (keys && s.detail.type === 'ObjectExpression') {
        assert.deepEqual(sorted(s.detail.properties.map((p) => p.key.name || p.key.value)), sorted(keys[1].split(',').map((k) => k.trim()).filter(Boolean)), `${at(s)} ${name}: keys`);
      }
    }
  }
});

/* ── ⑤ RUN ─────────────────────────────────────────────────────────────────────────────── */
function fakeWindow() {
  const L = new Map();
  return {
    L,
    addEventListener(t, f, o) { const a = L.get(t) || []; if (!a.some((x) => x.f === f)) a.push({ f, once: !!(o && o.once) }); L.set(t, a); },
    removeEventListener(t, f) { L.set(t, (L.get(t) || []).filter((x) => x.f !== f)); },
    dispatchEvent(ev) { for (const x of [...(L.get(ev.type) || [])]) { if (x.once) this.removeEventListener(ev.type, x.f); x.f(ev); } return true; },
  };
}
test('⑤ the bus delivers through window, so a bare listener and a bus listener hear the same event', async () => {
  const w = fakeWindow();
  const B = await importModule('js/bus.js', { globals: { window: w } });
  const got = [];
  const off = B.on('intmap-basemode', (e) => got.push(['bus', e.detail.mode]));
  w.addEventListener('intmap-basemode', (e) => got.push(['raw', e.detail.mode]));
  B.emit('intmap-basemode', { mode: 'clean' });
  off(); B.emit('intmap-basemode', { mode: 'default' });
  assert.deepEqual(got, [['bus', 'clean'], ['raw', 'clean'], ['raw', 'default']]);
  let n = 0; B.once('intmap-lang', () => n++); B.emit('intmap-lang'); B.emit('intmap-lang');
  assert.equal(n, 1, 'once');
  let typed = null; B.on('intmap-units', (e) => { typed = e; }); B.emit('intmap-units');
  assert.ok(typed instanceof Event && !(typed instanceof CustomEvent), 'an event without a payload is a plain Event, as the bare calls raised it');
});

test('⑤ an alias is heard under either spelling, exactly once', async () => {
  const [name, d] = Object.entries(EVENTS).find(([, x]) => (x.aliases || []).length);
  const alias = d.aliases[0];
  const w = fakeWindow();
  const B = await importModule('js/bus.js', { globals: { window: w } });
  let bus = 0, rawOld = 0, rawNew = 0;
  B.on(name, () => bus++); w.addEventListener(alias, () => rawOld++); w.addEventListener(name, () => rawNew++);
  B.emit(name);
  assert.deepEqual([bus, rawOld, rawNew], [1, 1, 1], 'raised through the bus: each spelling once, the bus listener once');
  w.dispatchEvent(new Event(alias));
  assert.deepEqual([bus, rawOld, rawNew], [2, 2, 1], 'raised by hand under the old spelling: the bus listener still hears it');
  let viaAlias = 0; B.on(alias, () => viaAlias++); B.emit(alias);
  assert.equal(viaAlias, 1, 'listening by the old spelling is listening to the event');
});

test('⑤ an undeclared name is refused in development (node) — never silently delivered', async () => {
  const B = await importModule('js/bus.js', { globals: { window: fakeWindow() } });
  assert.throws(() => B.emit('intmap-not-declared'), /not declared/);
  assert.throws(() => B.on('intmap-not-declared', () => {}), /not declared/);
  assert.match(read('js/bus.js'), /import\.meta\.env && import\.meta\.env\.PROD/,
    'the production build warns instead of throwing — the switch must stay the one Vite replaces');
});
