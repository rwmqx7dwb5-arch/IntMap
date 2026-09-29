/* ============================================================================
 *  IntMap · click receivers a keyboard cannot reach, counted   (a11y-shared-dialog)
 * ----------------------------------------------------------------------------
 *  A click handler on a <div>, <span>, <td>, <img>, <li>… is invisible to a keyboard: the element is
 *  not in the Tab order and nothing turns Enter or Space into a press. The static audit that opened
 *  this round (2026-09-29) read 37 of them by hand — the layer tiles, the layer-mode rows, the section
 *  headers, the time-zone rows, the main search results among them. js/dialog.js now carries the one
 *  way out: an element that says `role="button"` (or option/radio/…) AND `tabindex` is pressed by
 *  Enter/Space through one delegated listener, and `IntMapDialog.makeActionable(el)` writes both.
 *
 *  This is the instrument that keeps the number from growing while it is brought down. It counts,
 *  PER FILE and from the parser, every CLICK RECEIVER whose element resolves to a non-interactive
 *  tag and carries no tabindex, and holds the counts to tests/keyboard-reach-baseline.json in both
 *  directions (more → a new unreachable press was added; fewer → lower the ledger with --update).
 *
 *  WHAT IS A CLICK RECEIVER (shapes, never names):
 *    · `R.onclick = …` and `R.addEventListener('click', …)`;
 *    · a delegated handler of either form: every `.closest('<selector>')` inside it is a receiver;
 *    · a hyperscript call `h('div', { onclick: … })` — a tag literal and a props object naming onclick.
 *  HOW R IS RESOLVED TO AN ELEMENT:
 *    · a binding initialised by `document.createElement('<tag>')`;
 *    · a binding or a `.forEach` parameter that came from `querySelector(All)` / `closest` /
 *      `getElementById` — the selector's last compound is looked up in the markup this file writes
 *      (and index.html, for ids): the first opening tag carrying all its classes / attributes / id.
 *      When no markup carries it, an element made in code whose className/classList names it is used.
 *    · anything that does not resolve (a node handed in from elsewhere, `document`, the map) is not
 *      counted — this measures what the file itself built, which is what the file can fix.
 *  REACHABLE when the tag is interactive (button, a, input, select, textarea, summary, label,
 *  option), or the markup carries `tabindex`, or the same function gives the element a tabindex
 *  (`.tabIndex =`, `setAttribute('tabindex', …)`) or passes it to `makeActionable(…)`.
 *  ⚠ A tabindex is taken at its word — this does not prove the element has a role Enter can press
 *  (js/dialog.js reads the role). It guarantees that a press no keyboard can reach is not ADDED unseen.
 *
 *      node scripts/keyboard-reach.mjs            report (every receiver, per file)
 *      node scripts/keyboard-reach.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/keyboard-reach.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs runs the comparison as its `keyboard-reach` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const LEDGER = join(ROOT, 'tests', 'keyboard-reach-baseline.json');

/* elements that are not in the Tab order and have no key activation of their own */
export const NONINTERACTIVE = new Set(['div', 'span', 'td', 'th', 'tr', 'li', 'ul', 'ol', 'img', 'p', 'section', 'article',
  'header', 'footer', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'i', 'em', 'strong', 'small', 'svg', 'canvas']);
const INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'details']);

/* an element that declares itself presentational (a scrim, a backdrop) is not something to reach —
   its keyboard equivalent is the dialog's Escape and close button, which js/dialog.js provides */
const HIDDEN = /\baria-hidden\s*=\s*["']?true/i;
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function parse(src, file) {
  const o = { ecmaVersion: 'latest', allowHashBang: true, locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch (asModule) {
    try { return acorn.parse(src, { ...o, sourceType: 'script' }); } catch (_) {
      throw new Error(`keyboard-reach: cannot parse ${file} — ${asModule.message}`);
    }
  }
}
function linked(ast) {
  const parent = new Map(); const all = [];
  (function go(n, p) {
    if (!n || typeof n.type !== 'string') return;
    parent.set(n, p); all.push(n);
    for (const k in n) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') go(c, n); }
      else if (v && typeof v.type === 'string') go(v, n);
    }
  })(ast, null);
  return { parent, all };
}
const strOf = (n) => {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked;
  return null;
};
const propName = (m) => (m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier') ? m.property.name : null;
const keyName = (p) => p && p.type === 'Property' && !p.computed ? (p.key.name || p.key.value) : null;

/* descendants of `root`, not entering nested functions unless `deep` */
function walk(root, f, deep) {
  (function go(n) {
    if (!n || typeof n.type !== 'string') return;
    f(n);
    for (const k in n) {
      if (k === 'loc') continue;
      const v = n[k];
      const each = (c) => { if (c && typeof c.type === 'string' && (deep || !FN.has(c.type))) go(c); };
      if (Array.isArray(v)) v.forEach(each); else each(v);
    }
  })(root);
}

/* ── the markup a file writes: every opening tag in its source text ─────────────────────────── */
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)(\s(?:[^<>]|=>)*?)?\/?>/g;
/* A file that drives a combobox (aria-activedescendant, or IntMapDialog.listbox) reaches its
   role="option" rows from the text field with the arrow keys — the WAI-ARIA combobox pattern keeps
   focus in the field, so an option there needs no tabindex of its own. */
const COMBO = /aria-activedescendant|\.listbox\(/;
function tagsOf(text) {
  const out = []; let m;
  const combo = COMBO.test(text);
  OPEN_TAG.lastIndex = 0;
  while ((m = OPEN_TAG.exec(text))) out.push({ tag: m[1].toLowerCase(), attrs: m[2] || '', combo });
  return out;
}
const OPTION = /\brole\s*=\s*["']?option\b/i;
const markupOk = (t) => INTERACTIVE.has(t.tag) || /\btabindex\b/i.test(t.attrs) || HIDDEN.test(t.attrs) || (t.combo && OPTION.test(t.attrs));
/* the last compound of each selector in a list: { tag, classes, ids, attrs } */
function compounds(sel) {
  return String(sel).split(',').map((s) => {
    const last = s.trim().split(/[\s>+~]+/).filter(Boolean).pop() || '';
    const c = { tag: null, classes: [], ids: [], attrs: [] };
    const t = last.match(/^[a-zA-Z][a-zA-Z0-9-]*/); if (t) c.tag = t[0].toLowerCase();
    last.replace(/\.([\w-]+)/g, (_, x) => { c.classes.push(x); return ''; });
    last.replace(/#([\w-]+)/g, (_, x) => { c.ids.push(x); return ''; });
    last.replace(/\[([\w-]+)/g, (_, x) => { c.attrs.push(x.toLowerCase()); return ''; });
    return c;
  }).filter((c) => c.tag || c.classes.length || c.ids.length || c.attrs.length);
}
/* every regex metacharacter, the backslash included (CodeQL js/incomplete-sanitization) */
const reEsc = (w) => String(w).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const word = (w) => new RegExp('(?<![\\w-])' + reEsc(w) + '(?![\\w-])');
function tagMatches(t, c) {
  if (c.tag && t.tag !== c.tag) return false;
  if (c.classes.length && !/\bclass\s*=/.test(t.attrs)) return false;
  if (!c.classes.every((x) => word(x).test(t.attrs))) return false;
  if (!c.ids.every((x) => new RegExp('\\bid\\s*=\\s*["\']?' + reEsc(x) + '(?![\\w-])').test(t.attrs))) return false;
  if (!c.attrs.every((x) => new RegExp('(?:^|\\s)' + reEsc(x) + '(?:\\s*=|\\s|$)').test(t.attrs))) return false;
  return !!(c.classes.length || c.ids.length || c.attrs.length);
}

function mentionsActionable(fnNode, name, combo) {
  let yes = false;
  walk(fnNode, (n) => {
    if (yes) return;
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier'
      && n.left.object.name === name && /^tab[iI]ndex$/.test(propName(n.left) || '')) yes = true;
    if (n.type === 'CallExpression') {
      const cal = n.callee;
      if (propName(cal) === 'setAttribute' && cal.object.type === 'Identifier' && cal.object.name === name
        && (/^tabindex$/i.test(strOf(n.arguments[0]) || '') || (combo && /^role$/i.test(strOf(n.arguments[0]) || '') && strOf(n.arguments[1]) === 'option'))) yes = true;
      const fname = cal.type === 'Identifier' ? cal.name : propName(cal);
      if (fname === 'makeActionable' && n.arguments[0] && n.arguments[0].type === 'Identifier' && n.arguments[0].name === name) yes = true;
    }
  }, true);
  return yes;
}

/** Every click receiver in one source that no keyboard can reach: [{ line, tag, via }] */
/** @param {string} src @param {string} file
 *  @param {{ids?: {tag:string,attrs:string}[], shared?: {tag:string,attrs:string}[]}} [ctx]
 *    ids    — markup that may carry an id this file asks for by getElementById (index.html)
 *    shared — markup every other js/ file writes: a row one module renders and another wires
 *             (community-board writes .comm-post-loc, community.js wires it) is still a row */
export function unreachable(src, file, ctx) {
  const tree = parse(src, file);
  const { parent, all } = linked(tree);
  const markup = tagsOf(src);
  const combo = COMBO.test(src);
  const idMarkup = (ctx && ctx.ids) || [];
  const shared = (ctx && ctx.shared) || [];
  const out = [];

  const fnOf = (n) => { let p = parent.get(n); while (p && !FN.has(p.type) && p.type !== 'Program') p = parent.get(p); return p; };
  /* elements this file makes in code, with the class words it gives them */
  const made = [];
  for (const n of all) {
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !n.init) continue;
    const tag = createdTag(n.init); if (!tag) continue;
    const fn = fnOf(n), name = n.id.name, words = [];
    walk(fn, (x) => {
      if (x.type === 'AssignmentExpression' && x.left.type === 'MemberExpression' && x.left.object.type === 'Identifier' && x.left.object.name === name && propName(x.left) === 'className') {
        (function lit(e) { const s = strOf(e); if (s != null) words.push(...s.split(/\s+/)); else if (e.type === 'BinaryExpression') { lit(e.left); lit(e.right); } else if (e.type === 'TemplateLiteral') e.quasis.forEach((q) => words.push(...q.value.cooked.split(/\s+/))); })(x.right);
      }
      if (x.type === 'CallExpression' && propName(x.callee) === 'add' && x.callee.object.type === 'MemberExpression' && propName(x.callee.object) === 'classList'
        && x.callee.object.object.type === 'Identifier' && x.callee.object.object.name === name) x.arguments.forEach((a) => { const s = strOf(a); if (s) words.push(s); });
    }, true);
    made.push({ tag, fn, name, words: words.filter(Boolean), ok: mentionsActionable(fn, name, combo) });
  }
  function createdTag(init) {
    if (!init || init.type !== 'CallExpression') return null;
    if (propName(init.callee) === 'createElement') return (strOf(init.arguments[0]) || '').toLowerCase() || null;
    /* a hyperscript helper — el('td', …), h('div', …): a bare function given a tag name first */
    const t = (strOf(init.arguments[0]) || '').toLowerCase();
    if (init.callee.type === 'Identifier' && t.length > 1 && (NONINTERACTIVE.has(t) || INTERACTIVE.has(t))) return t;
    return null;
  }
  /* a selector → { tag, ok } or null when this file does not say what it is */
  function bySelector(sel) {
    for (const c of compounds(sel)) {
      if (c.tag && !c.classes.length && !c.ids.length && !c.attrs.length) return { tag: c.tag, ok: INTERACTIVE.has(c.tag) };
      const hit = markup.find((t) => tagMatches(t, c)) || (c.ids.length ? idMarkup.find((t) => tagMatches(t, c)) : null);
      if (hit) return { tag: hit.tag, ok: markupOk(hit) };
      if (c.classes.length) {
        const m = made.find((e) => c.classes.every((x) => e.words.includes(x)) && (!c.tag || c.tag === e.tag));
        if (m) return { tag: m.tag, ok: INTERACTIVE.has(m.tag) || m.ok };
      }
      const far = shared.find((t) => tagMatches(t, c));
      if (far) return { tag: far.tag, ok: markupOk(far) };
    }
    return null;
  }
  function selectorCall(e) {
    if (!e || e.type !== 'CallExpression') return null;
    const p = propName(e.callee);
    if (p === 'querySelector' || p === 'querySelectorAll' || p === 'closest') return strOf(e.arguments[0]);
    if (p === 'getElementById') { const id = strOf(e.arguments[0]); return id ? '#' + id : null; }
    return null;
  }
  /* the collection a .forEach is called on, through [...x] and Array.from(x) */
  function listSelector(e) {
    if (!e) return null;
    if (e.type === 'ArrayExpression' && e.elements.length === 1 && e.elements[0] && e.elements[0].type === 'SpreadElement') return listSelector(e.elements[0].argument);
    if (e.type === 'CallExpression' && propName(e.callee) === 'from' && e.callee.object.type === 'Identifier' && e.callee.object.name === 'Array') return listSelector(e.arguments[0]);
    return selectorCall(e);
  }
  function resolve(r, at) {
    if (!r) return null;
    const sel = selectorCall(r);
    if (sel) return bySelector(sel);
    if (r.type !== 'Identifier') return null;
    /* the nearest enclosing function that binds the name */
    let f = fnOf(at);
    while (f) {
      if (f.params && f.params.some((p) => p.type === 'Identifier' && p.name === r.name)) {
        const call = parent.get(f);
        if (call && call.type === 'CallExpression' && call.arguments[0] === f && /^(forEach|map)$/.test(propName(call.callee) || '')) {
          const s = listSelector(call.callee.object);
          if (s == null) return null;
          const got = bySelector(s);
          return got && { tag: got.tag, ok: got.ok || mentionsActionable(f, r.name, combo) };
        }
        return null;
      }
      let decl = null;
      walk(f.type === 'Program' ? f : f.body, (x) => { if (!decl && x.type === 'VariableDeclarator' && x.id.type === 'Identifier' && x.id.name === r.name) decl = x; });
      if (decl) {
        const tag = createdTag(decl.init);
        if (tag) return { tag, ok: INTERACTIVE.has(tag) || mentionsActionable(f, r.name, combo) };
        const s = selectorCall(decl.init);
        if (s) { const got = bySelector(s); return got && { tag: got.tag, ok: got.ok || mentionsActionable(f, r.name, combo) }; }
        return null;
      }
      if (f.type === 'Program') break;
      f = fnOf(f);
    }
    return null;
  }
  /* Two handler shapes are not presses on the element: a BACKDROP (it acts only when the event's
     target IS the receiver — the dialog's Escape is its keyboard twin) and a handler that only stops
     the event (it keeps a press inside a panel from reaching the map; it does nothing itself). */
  const STOPS = new Set(['stopPropagation', 'preventDefault', 'stopImmediatePropagation']);
  function notAPress(recv, h) {
    if (!h || !FN.has(h.type)) return false;
    let backdrop = false, acts = false;
    const same = (a, b) => a && b && a.type === 'Identifier' && b.type === 'Identifier' && a.name === b.name;
    walk(h, (x) => {
      if (x.type === 'BinaryExpression' && /^[!=]==?$/.test(x.operator)) {
        const t = (s) => s.type === 'MemberExpression' && /^(target|currentTarget)$/.test(propName(s) || '');
        if ((t(x.left) && same(x.right, recv)) || (t(x.right) && same(x.left, recv))) backdrop = true;
      }
      if (x.type === 'CallExpression') { const nm = x.callee.type === 'Identifier' ? x.callee.name : propName(x.callee); if (!STOPS.has(nm)) acts = true; }
      if (x.type === 'AssignmentExpression') acts = true;
    }, true);
    return backdrop || !acts;
  }
  const count = (n, got, via) => { if (got && NONINTERACTIVE.has(got.tag) && !got.ok) out.push({ line: n.loc.start.line, tag: got.tag, via }); };
  const delegated = (n, handler) => {
    if (!handler || !FN.has(handler.type)) return false;
    let any = false;
    /* only a closest() asked of the EVENT's target names what was pressed (c.el.closest(…) walks
       from some other node); alternatives joined by || are ONE receiver — whichever matches */
    const onTarget = (x) => x.type === 'CallExpression' && propName(x.callee) === 'closest' && strOf(x.arguments[0])
      && x.callee.object.type === 'MemberExpression' && /^(target|srcElement)$/.test(propName(x.callee.object) || '');
    /* a closest() that only decides to LEAVE (if (e.target.closest('button')) return;) is a guard
       that hands the press to a real control, not a receiver */
    const guard = (x) => {
      let c = x, p = parent.get(c);
      while (p && (p.type === 'LogicalExpression' || p.type === 'UnaryExpression')) { c = p; p = parent.get(c); }
      if (!p || p.type !== 'IfStatement' || p.test !== c) return false;
      const k = p.consequent;
      return k.type === 'ReturnStatement' || (k.type === 'BlockStatement' && k.body.length === 1 && k.body[0].type === 'ReturnStatement');
    };
    const seen = new Set();
    /* a handler that asks a local helper «which card was pressed» (const cardOf = (ev) => ev.target.closest(…))
       is delegated through it — the helpers it calls by name are read one level deep */
    const bodies = [handler];
    walk(handler, (x) => {
      if (x.type !== 'CallExpression' || x.callee.type !== 'Identifier') return;
      const nm = x.callee.name;
      for (const d of all) {
        if (d.type === 'VariableDeclarator' && d.id.type === 'Identifier' && d.id.name === nm && d.init && FN.has(d.init.type)) bodies.push(d.init);
        else if (d.type === 'FunctionDeclaration' && d.id && d.id.name === nm) bodies.push(d);
      }
    }, true);
    for (const body of bodies) walk(body, (x) => {
      if (!onTarget(x) || seen.has(x) || guard(x)) return;
      let top = x; while (parent.get(top) && parent.get(top).type === 'LogicalExpression' && parent.get(top).operator === '||') top = parent.get(top);
      const alts = [];
      walk(top, (y) => { if (onTarget(y)) { alts.push(y); seen.add(y); } }, false);
      any = true;
      const got = alts.map((y) => bySelector(strOf(y.arguments[0])));
      if (got.some((g) => !g || g.ok || !NONINTERACTIVE.has(g.tag))) return;
      count(x, got[0], 'closest(' + alts.map((y) => strOf(y.arguments[0])).join(' || ') + ')');
    }, true);
    return any;
  };

  for (const n of all) {
    let recv = null, handler = null;
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && propName(n.left) === 'onclick') { recv = n.left.object; handler = n.right; }
    else if (n.type === 'CallExpression' && propName(n.callee) === 'addEventListener' && strOf(n.arguments[0]) === 'click') { recv = n.callee.object; handler = n.arguments[1]; }
    else if (n.type === 'CallExpression' && n.arguments.length >= 2 && n.arguments[1] && n.arguments[1].type === 'ObjectExpression') {
      const tag = (strOf(n.arguments[0]) || '').toLowerCase();
      if (!NONINTERACTIVE.has(tag)) continue;
      const keys = n.arguments[1].properties.map(keyName);
      const hidden = n.arguments[1].properties.some((p) => keyName(p) === 'aria-hidden' && strOf(p.value) === 'true');
      if (keys.includes('onclick') && !hidden && !keys.some((k) => /^tab[iI]ndex$/.test(k || ''))) out.push({ line: n.loc.start.line, tag, via: 'props.onclick' });
      continue;
    }
    if (!recv) continue;
    if (notAPress(recv, handler)) continue;
    if (delegated(n, handler)) continue;
    count(n, resolve(recv, n), 'onclick');
  }
  return out;
}

function context(R) {
  const files = readdirSync(join(R, 'js')).filter((x) => x.endsWith('.js')).sort().map((f) => ['js/' + f, readFileSync(join(R, 'js', f), 'utf8')]);
  const index = existsSync(join(R, 'index.html')) ? readFileSync(join(R, 'index.html'), 'utf8') : '';
  const ids = tagsOf(index);
  return { files, ctx: { ids, shared: files.flatMap(([, s]) => tagsOf(s)).concat(ids) } };
}
/** { 'js/x.js': n, … } over js/*.js; files with none are absent. */
export function measure(root) {
  const R = root || ROOT;
  const perFile = {};
  const { files, ctx } = context(R);
  for (const [rel, src] of files) {
    const n = unreachable(src, rel, ctx).length;
    if (n) perFile[rel] = n;
  }
  return perFile;
}
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

/** @returns {{ ok: boolean, lines: string[], files: object, total: number, ledgerTotal: number }} */
export function check(root, ledgerPath) {
  const lines = [];
  const P = ledgerPath || LEDGER;
  if (!existsSync(P)) return { ok: false, lines: [`no ledger at ${P} — run: node scripts/keyboard-reach.mjs --update`] };
  const was = JSON.parse(readFileSync(P, 'utf8')).files || {};
  const now = measure(root);
  for (const f of Array.from(new Set([...Object.keys(was), ...Object.keys(now)])).sort()) {
    const a = was[f] || 0, b = now[f] || 0;
    if (b > a) lines.push(`${f}: ${b} click receiver(s) no keyboard can reach, ledger allows ${a} — use a <button>, or window.IntMapDialog.makeActionable(el) / role="button" tabindex="0" in the markup`);
    else if (b < a) lines.push(`${f}: ${b} click receiver(s) no keyboard can reach, ledger still says ${a} — lower the ledger: node scripts/keyboard-reach.mjs --update`);
  }
  return { ok: lines.length === 0, lines, files: now, total: total(now), ledgerTotal: total(was) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const m = measure();
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/keyboard-reach.mjs --update — click receivers no keyboard can reach, per file; ratcheted both ways by check:static',
      total: total(m), files: m,
    }, null, 1) + '\n');
    console.log(`keyboard-reach: ledger written — ${total(m)} across ${Object.keys(m).length} files`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `keyboard-reach: ${r.total} unreachable click receivers, as the ledger says` : 'keyboard-reach: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    const { files, ctx } = context(ROOT);
    let t = 0;
    for (const [rel, src] of files) {
      for (const u of unreachable(src, rel, ctx)) { console.log(`${rel}:${u.line}  <${u.tag}>  ${u.via}`); t++; }
    }
    console.log(`total ${t}`);
  }
}
