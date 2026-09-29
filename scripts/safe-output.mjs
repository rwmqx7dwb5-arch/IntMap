/* ============================================================================
 *  IntMap · ONE output encoder — a ratchet on the copies   (safe-output-one-source)
 * ----------------------------------------------------------------------------
 *  The canonical output encoder is `window.IntMapSafe` = { html, esc, url }, defined in the first
 *  <head> script of index.html (docs/SECURITY-ARCHITECTURE.md §4). MEASURED 2026-09-29, before
 *  this rule: 48 files carried 49 HTML escapers of their OWN, of differing strength — five did not
 *  encode `"` (so an attribute value could be closed from the data), one deleted `<>&` instead of
 *  encoding them, one defaulted to the identity function — and two markup sinks put an untrusted
 *  URL into href/src without IntMapSafe.url's scheme check. A copy is not wrong on the day it is
 *  written; it is wrong on the day the rule changes and the copy does not.
 *
 *  This counts three SHAPES — never names, never spellings of a helper:
 *
 *    escaper     a function (or the program, for a top-level map) that OUTPUTS both the string
 *                literal '&amp;' and '&lt;' — as a replacement argument of .replace/.replaceAll,
 *                as the argument of .join, or as a property VALUE of a lookup table. A decoder
 *                ('&amp;' as a key or a search pattern) is not an encoder and is not counted.
 *    parseText   `X.innerHTML = <not a constant>` where X is an element made by createElement in
 *                the same function and the same function then READS X.textContent / X.innerText —
 *                the «parse HTML just to get its text» idiom. An element created in the LIVE
 *                document fetches `<img src=x onerror=…>` and runs the handler even though it is
 *                never attached. A document from document.implementation.createHTMLDocument has
 *                no browsing context and parses the same text without fetching or running anything.
 *    rawUrlAttr  a markup string whose literal part ends in `href="` / `src="` (either quote, or
 *                none) followed by an expression that did not come out of IntMapSafe.url — the
 *                expression that STARTS an attribute value is the one that decides its scheme.
 *                A constant (literal / template without substitutions) is not counted.
 *
 *  THE LEDGER (scripts/safe-output-ledger.json) holds, per file, how many of each shape remain.
 *  More than the ledger → a new copy was written: route it through IntMapSafe instead. Fewer → a
 *  copy was removed and the ledger must come DOWN with it (`node scripts/safe-output.mjs --write`),
 *  so the number can never drift back up unobserved. `kept` entries are escapers for ANOTHER
 *  GRAMMAR (XML written to a file, not the DOM) and must say why in a sentence.
 *
 *    node scripts/safe-output.mjs            # report every occurrence + ledger comparison
 *    node scripts/safe-output.mjs --write    # rewrite the `pending` ledger to what is measured
 *
 *  scripts/static-checks.mjs (§12) calls safeOutputProblems(); that is the gate.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const LEDGER_PATH = join(ROOT, 'scripts', 'safe-output-ledger.json');
export const KINDS = ['escaper', 'parseText', 'rawUrlAttr'];

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const ATTR_START = /\b(?:href|src)\s*=\s*["']?$/i;

function parse(src) {
  const base = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  try { return acorn.parse(src, { ...base, sourceType: 'module' }); }
  catch { return acorn.parse(src, { ...base, sourceType: 'script' }); }
}

/* Every node with its parent, in source order. */
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
const isConst = (n) => strOf(n) != null || (n && n.type === 'Literal');
const calleeName = (c) => {
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') return c.property.name;
  return '';
};

/* Is the literal OUTPUT by an encoder (not a key, not a search pattern)? */
function isOutput(lit, parent) {
  const p = parent.get(lit);
  if (!p) return false;
  if (p.type === 'Property' && p.value === lit) return true;
  if (p.type === 'CallExpression') {
    const nm = calleeName(p.callee);
    if ((nm === 'replace' || nm === 'replaceAll') && p.arguments[1] === lit) return true;
    if (nm === 'join' && p.arguments[0] === lit) return true;
  }
  if (p.type === 'ReturnStatement' || p.type === 'ConditionalExpression' || p.type === 'ArrowFunctionExpression') return true;
  return false;
}

function enclosingFn(n, parent) {
  let p = parent.get(n);
  while (p && !FN.has(p.type) && p.type !== 'Program') p = parent.get(p);
  return p;
}

function fnName(fn, parent) {
  if (!fn || fn.type === 'Program') return '(top level)';
  if (fn.id && fn.id.name) return fn.id.name;
  const p = parent.get(fn);
  if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if (p && p.type === 'Property' && p.key) return p.key.name || String(p.key.value);
  if (p && p.type === 'AssignmentExpression') return p.left.type === 'Identifier' ? p.left.name : (p.left.property && p.left.property.name) || '(assigned)';
  return '(inline)';
}

export function scanSource(src, { lineOffset = 0 } = {}) {
  const ast = parse(src);
  const { parent, all } = linked(ast);
  const out = { escaper: [], parseText: [], rawUrlAttr: [] };
  const line = (n) => n.loc.start.line + lineOffset;
  const text = (n) => src.slice(n.start, n.end);

  /* bindings: name → initialiser / function node (flat per file: an approximation that only ever
     makes the url() test MORE permissive for a name that is also bound to IntMapSafe elsewhere) */
  const inits = new Map();
  for (const n of all) {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) (inits.get(n.id.name) || inits.set(n.id.name, []).get(n.id.name)).push(n.init);
    if (n.type === 'FunctionDeclaration' && n.id) (inits.get(n.id.name) || inits.set(n.id.name, []).get(n.id.name)).push(n);
  }
  const boundToSafe = (name) => (inits.get(name) || []).some((i) => /IntMapSafe/.test(text(i)));

  // ── escaper ──
  const perFn = new Map();
  for (const n of all) {
    const s = strOf(n);
    if (s !== '&amp;' && s !== '&lt;') continue;
    if (!isOutput(n, parent)) continue;
    const fn = enclosingFn(n, parent);
    const e = perFn.get(fn) || perFn.set(fn, { amp: false, lt: false, first: n }).get(fn);
    if (s === '&amp;') e.amp = true; else e.lt = true;
  }
  for (const [fn, e] of perFn) {
    if (!(e.amp && e.lt)) continue;
    /* an encoder that is only the inner callback of a named one is reported under the outer name */
    let named = fn, p = fn && parent.get(fn);
    while (p && p.type !== 'Program' && !FN.has(p.type)) p = parent.get(p);
    const outer = p && FN.has(p.type) ? p : null;
    const outerIsJustWrapper = outer && fnName(fn, parent) === '(inline)' && fnName(outer, parent) !== '(inline)'
      && text(outer).length < 400;
    if (outerIsJustWrapper) named = outer;
    out.escaper.push({ line: line(named.type === 'Program' ? e.first : named), name: fnName(named, parent) });
  }

  // ── parseText ──
  /* created by the LIVE document (`document` / `window.document`) — an element of an inert document
     (document.implementation.createHTMLDocument) parses without fetching or running anything */
  const isCreate = (n) => n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
    && calleeName(n.callee) === 'createElement' && /^(?:window\.|self\.|globalThis\.)?document$/.test(text(n.callee.object));
  const creates = all.filter((m) => m.type === 'VariableDeclarator' && m.id.type === 'Identifier' && isCreate(m.init));
  const textReads = all.filter((m) => m.type === 'MemberExpression' && !m.computed && m.object.type === 'Identifier'
    && (m.property.name === 'textContent' || m.property.name === 'innerText')
    && !(parent.get(m).type === 'AssignmentExpression' && parent.get(m).left === m));
  for (const n of all) {
    if (n.type !== 'AssignmentExpression' || n.operator !== '=') continue;
    const L = n.left;
    if (L.type !== 'MemberExpression' || L.computed || L.property.name !== 'innerHTML') continue;
    if (isConst(n.right)) continue;
    const fn = enclosingFn(n, parent);
    if (isCreate(L.object)) { out.parseText.push({ line: line(n), name: fnName(fn, parent) }); continue; }
    if (L.object.type !== 'Identifier') continue;
    const v = L.object.name;
    const made = creates.some((m) => m.id.name === v && enclosingFn(m, parent) === fn);
    if (!made) continue;
    const reads = textReads.some((m) => m.object.name === v && enclosingFn(m, parent) === fn);
    if (reads) out.parseText.push({ line: line(n), name: fnName(fn, parent) });
  }

  // ── rawUrlAttr ──
  const flat = (n, acc) => { if (n.type === 'BinaryExpression' && n.operator === '+') { flat(n.left, acc); flat(n.right, acc); } else acc.push(n); return acc; };
  const safeUrlCall = (c) => {
    const cal = c.callee;
    if (cal.type === 'MemberExpression' && !cal.computed && cal.property.name === 'url') {
      const o = cal.object;
      if (/IntMapSafe/.test(text(o))) return true;
      if (o.type === 'Identifier' && boundToSafe(o.name)) return true;
      return false;
    }
    if (cal.type === 'Identifier') return (inits.get(cal.name) || []).some((i) => /IntMapSafe[\s\S]*\.url\b|\.url\b[\s\S]*IntMapSafe/.test(text(i)));
    return false;
  };
  /* A constant prefix that already fixes the scheme (an absolute http(s) URL, mailto/tel, a
     same-origin path, a fragment or a query): whatever is appended cannot change the scheme. */
  const FIXED_PREFIX = /^(?:https?:\/\/|mailto:|tel:|\/|\.\.?\/|#|\?)/i;
  const seen = new Set();
  const viaBinding = (name, test) => {
    const bs = inits.get(name) || [];
    if (!bs.length || seen.has(name)) return false;
    seen.add(name);
    try { return bs.every((b) => !FN.has(b.type) && test(b)); } finally { seen.delete(name); }
  };
  /* Does the value START with something whose scheme is settled? The start of a concatenation is
     what decides the scheme, so only the leftmost operand is asked. */
  const schemeFixed = (n) => {
    const s0 = strOf(n);
    if (s0 != null) return FIXED_PREFIX.test(s0);
    if (n.type === 'Identifier') return viaBinding(n.name, schemeFixed);
    if (n.type === 'BinaryExpression' && n.operator === '+') return schemeFixed(flat(n, [])[0]);
    if (n.type === 'TemplateLiteral') {
      const q0 = n.quasis[0].value.cooked || '';
      return q0 ? FIXED_PREFIX.test(q0) : (n.expressions.length > 0 && schemeFixed(n.expressions[0]));
    }
    return urlPassed(n);
  };
  /* Is the WHOLE value safe to start an href/src with? A constant is the author's own; a value that
     came out of IntMapSafe.url is checked; a call given such a value (html(url(x)), an encoder
     reached through HOST, String(...)) keeps its scheme — a call that BUILDS the URL from an unknown
     (wikiLink(name)) is judged by what it was given, which is unknown, so it is counted. */
  const returnsOf = (fn) => {
    if (fn.body.type !== 'BlockStatement') return [fn.body];
    const rs = [];
    (function go(x) {
      if (!x || typeof x.type !== 'string') return;
      if (x !== fn && FN.has(x.type)) return;
      if (x.type === 'ReturnStatement') { rs.push(x.argument); return; }
      for (const k in x) { if (k === 'loc') continue; const v = x[k];
        if (Array.isArray(v)) v.forEach(go); else if (v && typeof v.type === 'string') go(v); }
    })(fn);
    return rs;
  };
  const builds = (name) => {
    const bs = (inits.get(name) || []).filter((b) => FN.has(b.type));
    if (!bs.length || seen.has('()' + name)) return false;
    seen.add('()' + name);
    try { return bs.every((b) => { const rs = returnsOf(b); return rs.length > 0 && rs.every((r) => !!r && schemeFixed(r)); }); }
    finally { seen.delete('()' + name); }
  };
  const urlPassed = (n) => {
    if (!n) return false;
    if (isConst(n)) return true;
    if (n.type === 'Identifier') return viaBinding(n.name, urlPassed);
    if (n.type === 'TemplateLiteral' || (n.type === 'BinaryExpression' && n.operator === '+')) return schemeFixed(n);
    if (n.type === 'ConditionalExpression') return urlPassed(n.consequent) && urlPassed(n.alternate);
    if (n.type === 'LogicalExpression') return urlPassed(n.left) && urlPassed(n.right);
    if (n.type === 'CallExpression') {
      if (safeUrlCall(n)) return true;
      const a0 = n.arguments[0];
      /* a METHOD's value comes from its receiver (String(u).replace(/"/g, …) is still u), so a
         constant first argument proves nothing there; a function given a constant builds from it */
      if (n.callee.type === 'MemberExpression') return urlPassed(n.callee.object) || (!!a0 && !isConst(a0) && urlPassed(a0));
      /* a link BUILDER defined in this file is read: if every value it returns starts with a fixed
         scheme, what it was given cannot change that (wikiLink(name) → 'https://…'+encode(name)) */
      if (n.callee.type === 'Identifier' && builds(n.callee.name)) return true;
      return !!a0 && urlPassed(a0);
    }
    return false;
  };
  for (const n of all) {
    let parts;
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      const p = parent.get(n);
      if (p && p.type === 'BinaryExpression' && p.operator === '+') continue;
      parts = flat(n, []);
      for (let i = 0; i < parts.length - 1; i++) {
        const s = strOf(parts[i]);
        if (s == null || !ATTR_START.test(s)) continue;
        if (!urlPassed(parts[i + 1])) out.rawUrlAttr.push({ line: line(parts[i + 1]), name: text(parts[i + 1]).slice(0, 60) });
      }
    } else if (n.type === 'TemplateLiteral' && n.expressions.length) {
      n.quasis.forEach((q, i) => {
        if (i >= n.expressions.length || !ATTR_START.test(q.value.cooked || '')) return;
        if (!urlPassed(n.expressions[i])) out.rawUrlAttr.push({ line: line(n.expressions[i]), name: text(n.expressions[i]).slice(0, 60) });
      });
    }
  }
  return out;
}

/* What the gate reads: every js/**.js, and every inline <script> of every page at the root. */
function walkJs(dir, acc) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const s = statSync(abs);
    if (s.isDirectory()) walkJs(abs, acc);
    else if (name.endsWith('.js')) acc.push(abs);
  }
  return acc;
}
export function measure(root = ROOT) {
  const rel = (p) => relative(root, p).replace(/\\/g, '/');
  const res = {};
  const add = (file, found) => {
    for (const k of KINDS) if (found[k].length) ((res[file] ||= {})[k] ||= []).push(...found[k]);
  };
  for (const abs of walkJs(join(root, 'js'), [])) {
    try { add(rel(abs), scanSource(readFileSync(abs, 'utf8'))); }
    catch (e) { ((res[rel(abs)] ||= {}).unparsed = [{ line: 0, name: String(e.message) }]); }
  }
  for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {
    const html = readFileSync(join(root, name), 'utf8');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
    while ((m = re.exec(html))) {
      if (/\bsrc\s*=/.test(m[1]) || /type\s*=\s*["']?(?:application\/(?:ld\+)?json|importmap|text\/template)/i.test(m[1])) continue;
      const lineOffset = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1;
      try { add(name, scanSource(m[2], { lineOffset })); } catch { /* a non-JS inline block is not a sink */ }
    }
  }
  return res;
}

export function readLedger() {
  if (!existsSync(LEDGER_PATH)) return { pending: {}, kept: {} };
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
}

const count = (m, f, k) => ((m[f] && m[f][k]) || []).length;

export function safeOutputProblems({ measured = measure(), ledger = readLedger() } = {}) {
  const problems = [];
  const files = new Set([...Object.keys(measured), ...Object.keys(ledger.pending || {}), ...Object.keys(ledger.kept || {})]);
  for (const f of files) {
    if (measured[f] && measured[f].unparsed) { problems.push(`${f}: could not be parsed (${measured[f].unparsed[0].name}) — the ratchet cannot see into it`); continue; }
    const kept = (ledger.kept || {})[f] || {};
    if (Object.keys(kept).length && !(typeof kept.why === 'string' && kept.why.trim().length > 20)) {
      problems.push(`${f}: a kept entry must say WHY in a sentence (another grammar than HTML?)`);
    }
    for (const k of KINDS) {
      const have = count(measured, f, k);
      const allowed = (((ledger.pending || {})[f] || {})[k] || 0) + (kept[k] || 0);
      if (have > allowed) {
        const where = measured[f][k].map((x) => `${x.line} ${x.name}`).join('; ');
        problems.push(`${f}: ${have} ${k} where the ledger allows ${allowed} (${where}) — `
          + (k === 'escaper' ? 'use window.IntMapSafe.html, the one encoder'
            : k === 'parseText' ? 'parsing HTML in the live document fetches and runs what it contains; parse in document.implementation.createHTMLDocument()'
              : 'a URL that starts an href/src value must come out of window.IntMapSafe.url'));
      } else if (have < allowed) {
        problems.push(`${f}: ${have} ${k} but the ledger still allows ${allowed} — one was removed; lower the ledger`
          + ' (node scripts/safe-output.mjs --write) so it cannot come back unobserved');
      }
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measured = measure();
  const ledger = readLedger();
  if (process.argv.includes('--write')) {
    const pending = {};
    for (const f of Object.keys(measured).sort()) {
      const kept = (ledger.kept || {})[f] || {};
      for (const k of KINDS) {
        const n = count(measured, f, k) - (kept[k] || 0);
        if (n > 0) (pending[f] ||= {})[k] = n;
      }
    }
    const next = { ...ledger, pending };
    writeFileSync(LEDGER_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(`wrote ${relative(ROOT, LEDGER_PATH)}`);
  }
  const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const f of Object.keys(measured).sort()) {
    for (const k of KINDS) for (const x of (measured[f][k] || [])) { totals[k]++; console.log(`${k.padEnd(10)} ${f}:${x.line}  ${x.name}`); }
  }
  console.log('\ntotals', JSON.stringify(totals));
  const problems = process.argv.includes('--write') ? safeOutputProblems({ measured, ledger: readLedger() }) : safeOutputProblems({ measured, ledger });
  for (const p of problems) console.log('✗ ' + p);
  process.exit(problems.length ? 1 : 0);
}
