/* ============================================================================
 *  IntMap · controls a screen reader cannot name, counted   (map-a11y-structure)
 * ----------------------------------------------------------------------------
 *  A <button> whose only content is «×», «−», «★», «▶» or an icon, with no aria-label, no
 *  aria-labelledby and no title, is announced as «button» and nothing else; an <input>, <select> or
 *  <textarea> with no label is announced as «edit text» / «pop-up button». The static audit that
 *  opened this round (2026-09-29) read such controls by hand in js/photo-geo.js, js/news-ui.js,
 *  js/space.js, js/map-tools.js, js/playground.js, js/atlas-console.js, js/ai-core.js,
 *  js/analysis-world-events.js, js/app-body.js and admin.html.
 *
 *  This is the instrument that keeps the number from growing while it is brought down — the same
 *  contract as scripts/keyboard-reach.mjs: counted PER FILE, held to tests/control-names-baseline.json
 *  in both directions (more → a nameless control was added; fewer → lower the ledger with --update).
 *
 *  WHAT IS COUNTED (shapes, never names):
 *    · MARKUP — an opening <button|input|select|textarea> tag in a root *.html or in a string /
 *      template of js/**\/*.js (comments excluded):
 *        button    counted when its content up to </button> is static (no `' + x + '` / `${…}` in
 *                  it), holds no letter or digit once tags are removed (an <img alt="…"> inside
 *                  names it), and the tag carries none of aria-label / aria-labelledby / title /
 *                  data-i18n-aria / data-i18n-title;
 *        input     (not hidden/submit/reset/button/image), select, textarea — counted when the tag
 *                  carries none of the above nor placeholder / data-i18n-ph (not for select), is not
 *                  inside an open <label>, and its id is not the `for` of any label in the tree.
 *    · CODE — `x = document.createElement('button'|'input'|'select'|'textarea')`, read in the
 *      function that made it:
 *        button    counted when a LITERAL text with no letter or digit is written into it
 *                  (textContent / innerText / innerHTML) and nothing names it (`.title =`,
 *                  `.ariaLabel =`, setAttribute('aria-label' | 'aria-labelledby' | 'title', …));
 *        input…    counted when nothing names it, it is not hidden (type hidden, style display
 *                  none, `.hidden = true`, aria-hidden), and it is not appended into a <label>
 *                  made in the same function nor given the id a label points at.
 *  Anything that does not resolve (a text computed at run time, a node handed in from elsewhere) is
 *  not counted — this measures what the file itself wrote, which is what the file can fix.
 *  An element marked aria-hidden="true" is not something to name.
 *
 *      node scripts/control-names.mjs            report (every nameless control, per file)
 *      node scripts/control-names.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/control-names.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs runs the comparison as its `control-names` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { codeOnly } from './code-only.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const LEDGER = join(ROOT, 'tests', 'control-names-baseline.json');

const blank = (s) => s.replace(/[^\n]/g, ' ');
const OPTS = { ecmaVersion: 'latest', allowHashBang: true, locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
function parseJs(src, file) {
  const spans = [];
  const onComment = (block, text, start, end) => spans.push([start, end]);
  let ast = null;
  try { ast = acorn.parse(src, { ...OPTS, sourceType: 'module', onComment }); } catch (asModule) {
    spans.length = 0;
    try { ast = acorn.parse(src, { ...OPTS, sourceType: 'script', onComment }); } catch (_) {
      throw new Error(`control-names: cannot parse ${file} — ${asModule.message}`);
    }
  }
  let code = '', at = 0;
  for (const [a, b] of spans) { code += src.slice(at, a) + blank(src.slice(a, b)); at = b; }
  return { ast, code: code + src.slice(at) };
}

/* ── the one notion of «named», for both shapes ──────────────────────────────────────────────── */
const NAMED_ATTR = /(?:^|[\s'"`])(aria-label|aria-labelledby|title|data-i18n-aria|data-i18n-title)\s*=/i;
const PLACEHOLDER_ATTR = /(?:^|[\s'"`])(placeholder|data-i18n-ph)\s*=/i;
const HIDDEN_ATTR = /aria-hidden\s*=\s*\\?["']?true|(?:^|\s)hidden(?:\s|=|$)|display\s*:\s*none/i;
const DYNAMIC = /['"`]\s*\+|\+\s*['"`]|\$\{/;
/** does this static text carry a word? Tags are removed; an <img alt="…"> is a word */
export function hasText(html) {
  const s = String(html);
  if (/<img\b[^>]*\balt\s*=\s*\\?["'][^"'\\]*[\p{L}\p{N}]/iu.test(s)) return true;
  const t = s.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&[#a-z0-9]+;/gi, '·');
  return /[\p{L}\p{N}]/u.test(t);
}
const SKIP_INPUT = /\btype\s*=\s*\\?["']?(hidden|submit|reset|button|image)\b/i;

/* ids some <label> points at, over the whole tree (a label in index.html names an input made in js/) */
function labelTargets(texts) {
  const out = new Set();
  for (const t of texts) {
    let m; const re = /\bfor\s*=\s*\\?["']([\w:-]+)["'\\]|htmlFor\s*=\s*['"`]([\w:-]+)['"`]|setAttribute\(\s*['"]for['"]\s*,\s*['"`]([\w:-]+)['"`]/g;
    while ((m = re.exec(t))) out.add(m[1] || m[2] || m[3]);
  }
  return out;
}

/* ── MARKUP ─────────────────────────────────────────────────────────────────────────────────── */
const TAG = /<(button|input|select|textarea)(?![\w-])((?:[^<>]|=>)*?)\/?>/gi;
export function markupUnnamed(text, targets) {
  const out = [];
  let m; TAG.lastIndex = 0;
  while ((m = TAG.exec(text))) {
    const tag = m[1].toLowerCase(), attrs = m[2] || '';
    if (HIDDEN_ATTR.test(attrs) && /aria-hidden|hidden(?:\s|=|$)/i.test(attrs)) continue;
    if (NAMED_ATTR.test(attrs)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    if (tag === 'button') {
      const rest = text.slice(TAG.lastIndex, TAG.lastIndex + 4000);
      const close = rest.search(/<\/button\s*>/i);
      if (close < 0) continue;
      const inner = rest.slice(0, close);
      /* an EMPTY button is filled in at run time (its words are written by code that names it) — not evidence */
      if (!inner.trim() || DYNAMIC.test(inner) || hasText(inner)) continue;
      out.push({ line, tag, via: 'markup' });
      continue;
    }
    if (tag === 'input' && SKIP_INPUT.test(attrs)) continue;
    if (tag !== 'select' && PLACEHOLDER_ATTR.test(attrs)) continue;
    const id = /\bid\s*=\s*\\?["']([\w:-]+)["'\\]/.exec(attrs);
    if (id && targets.has(id[1])) continue;
    const before = text.slice(Math.max(0, m.index - 4000), m.index);
    let lo = -1; for (const x of before.matchAll(/<label(?![\w-])/gi)) lo = x.index;
    const lc = before.toLowerCase().lastIndexOf('</label');
    if (lo >= 0 && lo > lc) continue;
    out.push({ line, tag, via: 'markup' });
  }
  return out;
}

/* ── CODE ───────────────────────────────────────────────────────────────────────────────────── */
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'Program']);
const strOf = (n) => {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked).join('');
  return null;
};
const propName = (m) => (m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier') ? m.property.name : (m && m.type === 'MemberExpression' && m.computed ? strOf(m.property) : null);
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
function within(root, f) {
  (function go(n) {
    if (!n || typeof n.type !== 'string') return;
    f(n);
    for (const k in n) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') go(c); }
      else if (v && typeof v.type === 'string') go(v);
    }
  })(root);
}
const isId = (n, name) => n && n.type === 'Identifier' && n.name === name;
const created = (n) => {
  if (!n) return null;
  if (n.type === 'CallExpression' && propName(n.callee) === 'createElement') return (strOf(n.arguments[0]) || '').toLowerCase();
  return null;
};
export function codeUnnamed(ast, targets) {
  const out = [];
  const { parent, all } = linked(ast);
  const labels = new Set();
  for (const n of all) if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && created(n.init) === 'label') labels.add(n.id.name);
  for (const n of all) {
    let name = null, tag = null, props = null;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') {
      name = n.id.name; tag = created(n.init);
      if (!tag && n.init && n.init.type === 'CallExpression' && propName(n.init.callee) === 'assign' && n.init.arguments.length >= 2) {
        tag = created(n.init.arguments[0]); if (tag && n.init.arguments[1].type === 'ObjectExpression') props = n.init.arguments[1];
      }
    }
    if (!tag || !/^(button|input|select|textarea)$/.test(tag)) continue;
    let scope = parent.get(n); while (scope && !FN.has(scope.type)) scope = parent.get(scope);
    const st = { named: false, hidden: false, text: undefined, labelled: false, skipType: false };
    const setText = (v) => { const s = strOf(v); if (s == null) st.text = null; else if (st.text !== null) st.text = (st.text || '') + s; };
    const onProp = (key, v) => {
      if (/^(title|ariaLabel|ariaLabelledByElements)$/.test(key)) st.named = true;
      else if (key === 'placeholder' && tag !== 'select') st.named = true;
      else if (/^(textContent|innerText|innerHTML)$/.test(key)) setText(v);
      else if (key === 'hidden' && v && v.type === 'Literal' && v.value === true) st.hidden = true;
      else if (key === 'type' && /^(hidden|submit|reset|button|image)$/i.test(strOf(v) || '')) st.skipType = true;
      else if (key === 'id' && targets.has(strOf(v) || '')) st.labelled = true;
      else if (key === 'cssText' && /display\s*:\s*none/i.test(strOf(v) || '')) st.hidden = true;
    };
    if (props) for (const p of props.properties) if (p.type === 'Property') onProp(p.key.name || p.key.value, p.value);
    within(scope || ast, (x) => {
      if (x.type === 'AssignmentExpression' && x.left.type === 'MemberExpression') {
        if (isId(x.left.object, name)) onProp(propName(x.left), x.right);
        else if (x.left.object.type === 'MemberExpression' && isId(x.left.object.object, name) && propName(x.left.object) === 'style') {
          if (propName(x.left) === 'display' && strOf(x.right) === 'none') st.hidden = true;
          if (propName(x.left) === 'cssText' && /display\s*:\s*none/i.test(strOf(x.right) || '')) st.hidden = true;
        }
      } else if (x.type === 'CallExpression' && x.callee.type === 'MemberExpression') {
        const fn = propName(x.callee);
        if (fn === 'setAttribute' && isId(x.callee.object, name)) {
          const a = (strOf(x.arguments[0]) || '').toLowerCase(), v = x.arguments[1];
          if (/^(aria-label|aria-labelledby|title)$/.test(a) || (a === 'placeholder' && tag !== 'select')) st.named = true;
          else if (a === 'aria-hidden' && strOf(v) === 'true') st.hidden = true;
          else if (a === 'type') onProp('type', v);
          else if (a === 'id') onProp('id', v);
        } else if (/^(appendChild|append|prepend|insertBefore)$/.test(fn) && x.callee.object.type === 'Identifier' && labels.has(x.callee.object.name)
          && x.arguments.some((a) => isId(a, name))) st.labelled = true;
      }
    });
    /* an element that never leaves this function — not passed, returned, stored or appended — never
       reaches the document (a file picker made only to be .click()ed), so there is nothing to name */
    let escapes = false;
    within(scope || ast, (x) => {
      if (escapes) return;
      const holds = (a) => a && (isId(a, name) || (a.type === 'SpreadElement' && isId(a.argument, name)));
      if ((x.type === 'CallExpression' || x.type === 'NewExpression') && x.arguments.some(holds)) escapes = true;
      else if (x.type === 'ReturnStatement' && holds(x.argument)) escapes = true;
      else if (x.type === 'AssignmentExpression' && holds(x.right)) escapes = true;
      else if (x.type === 'Property' && holds(x.value)) escapes = true;
      else if (x.type === 'ArrayExpression' && x.elements.some(holds)) escapes = true;
      else if (x.type === 'ArrowFunctionExpression' && holds(x.body)) escapes = true;
    });
    if (!escapes) continue;
    if (st.named || st.hidden || st.labelled || st.skipType) continue;
    if (tag === 'button') {
      if (typeof st.text !== 'string' || hasText(st.text)) continue;   /* only a literal with no word in it is evidence */
    }
    out.push({ line: n.loc.start.line, tag, via: 'createElement' });
  }
  return out;
}

/* ── the tree ───────────────────────────────────────────────────────────────────────────────── */
function walkJs(dir, out) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkJs(p, out); else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
function corpus(R) {
  const rel = (p) => p.slice(R.length + 1).replace(/\\/g, '/');
  const js = walkJs(join(R, 'js'), []).map((p) => { const src = readFileSync(p, 'utf8'); const { ast, code } = parseJs(src, rel(p)); return { file: rel(p), ast, text: code }; });
  const html = readdirSync(R).filter((x) => x.endsWith('.html')).sort().map((f) => {
    const src = readFileSync(join(R, f), 'utf8');
    return { file: f, ast: null, text: codeOnly(src, { lang: 'html', offsets: true }) };
  });
  return js.concat(html);
}
/** { file: [ {line, tag, via} ] } over js/**\/*.js and the root *.html */
export function scan(root) {
  const R = root || ROOT;
  const files = corpus(R);
  const targets = labelTargets(files.map((f) => f.text));
  const out = {};
  for (const f of files) {
    const found = markupUnnamed(f.text, targets).concat(f.ast ? codeUnnamed(f.ast, targets) : []);
    if (found.length) out[f.file] = found.sort((a, b) => a.line - b.line);
  }
  return out;
}
export function measure(root) {
  const s = scan(root), m = {};
  for (const [f, list] of Object.entries(s)) m[f] = list.length;
  return m;
}
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

/** @returns {{ ok: boolean, lines: string[], files: object, total: number, ledgerTotal: number }} */
export function check(root, ledgerPath) {
  const lines = [];
  const P = ledgerPath || LEDGER;
  if (!existsSync(P)) return { ok: false, lines: [`no ledger at ${P} — run: node scripts/control-names.mjs --update`] };
  const was = JSON.parse(readFileSync(P, 'utf8')).files || {};
  const now = measure(root);
  for (const f of Array.from(new Set([...Object.keys(was), ...Object.keys(now)])).sort()) {
    const a = was[f] || 0, b = now[f] || 0;
    if (b > a) lines.push(`${f}: ${b} control(s) with no accessible name, ledger allows ${a} — give it aria-label (data-i18n-aria in index.html) / title, a <label>, or visible words`);
    else if (b < a) lines.push(`${f}: ${b} control(s) with no accessible name, ledger still says ${a} — lower the ledger: node scripts/control-names.mjs --update`);
  }
  return { ok: lines.length === 0, lines, files: now, total: total(now), ledgerTotal: total(was) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const m = measure();
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/control-names.mjs --update — buttons / inputs / selects / textareas with no accessible name, per file; ratcheted both ways by check:static',
      total: total(m), files: m,
    }, null, 1) + '\n');
    console.log(`control-names: ledger written — ${total(m)} across ${Object.keys(m).length} files`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `control-names: ${r.total} controls with no accessible name, as the ledger says` : 'control-names: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    let t = 0;
    for (const [f, list] of Object.entries(scan())) for (const u of list) { console.log(`${f}:${u.line}  <${u.tag}>  ${u.via}`); t++; }
    console.log(`total ${t}`);
  }
}
