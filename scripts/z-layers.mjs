/* ============================================================================
 *  IntMap · the stacking order, written down   (map-a11y-structure)
 * ----------------------------------------------------------------------------
 *  MEASURED when this file was written (2026-09-29, static audit): css/intmap.css carried 96
 *  z-index declarations over 56 distinct values from 0 to 200001, and js/ another ~140 numeric
 *  literals (the largest 2147483647 in js/perf-hud.js). No shared token existed, and two unrelated
 *  surfaces sat on the same number by coincidence — 1500 was both `.btn-toggle-sidebar` and
 *  `.search-result-card` — so «which is on top» was answered by source order, which nobody chose.
 *
 *  The stylesheet now names its LAYERS once, in :root (`--z-inset` … `--z-system`), and every
 *  declaration in it reads one of them: `var(--z-controls)`, or `calc(var(--z-controls) + 100)`
 *  where a surface sits a fixed step above its layer. The steps are the old numbers minus the layer
 *  base, so the painting order is unchanged — and this instrument is what proves that, and keeps
 *  proving it:
 *
 *    · STACK — every z-index declaration in css/intmap.css, in file order, RESOLVED to the integer
 *      the browser computes (custom properties substituted, calc() evaluated). The ledger holds that
 *      list; any difference fails. A change to the painting order is therefore never silent: it has
 *      to be written into the ledger with --update, where the diff shows which surface moved.
 *    · LITERALS — per file over css/*.css, js/**\/*.js and the root *.html, the number of z-index
 *      values written as a bare number (`z-index:1234`, `zIndex = '1234'`, `zIndex: 1234`,
 *      `setProperty('z-index', '1234')`), comments excluded. Ratcheted both ways, the same contract
 *      as scripts/keyboard-reach.mjs: more → a new unnamed layer was added (read a --z-* token:
 *      `var(--z-popup)` in a style string, or getComputedStyle for a number); fewer → lower the
 *      ledger with --update.
 *
 *      node scripts/z-layers.mjs            report (literals per file, the resolved stack)
 *      node scripts/z-layers.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/z-layers.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs runs the comparison as its `z-layers` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const LEDGER = join(ROOT, 'tests', 'z-layers-baseline.json');
export const STYLESHEET = 'css/intmap.css';

/* a comment is blanked to spaces of the same length, so positions and line numbers survive */
const blank = (s) => s.replace(/[^\n]/g, ' ');
export const stripCssComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, blank);
function stripJsComments(src) {
  const spans = [];
  const o = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true,
    onComment: (block, text, start, end) => spans.push([start, end]) };
  try { acorn.parse(src, { ...o, sourceType: 'module' }); } catch (_) {
    spans.length = 0;
    try { acorn.parse(src, { ...o, sourceType: 'script' }); } catch (e) { return null; }
  }
  let out = '', at = 0;
  for (const [a, b] of spans) { out += src.slice(at, a) + blank(src.slice(a, b)); at = b; }
  return out + src.slice(at);
}
const stripHtmlComments = (src) => stripCssComments(src.replace(/<!--[\s\S]*?-->/g, blank));

/* THE SHAPES OF A BARE NUMBER — one per way the codebase writes a z-index, none per file */
const LITERAL = [
  /z-index\s*:\s*-?\d/gi,                                     /* CSS text: a sheet, a style="", a cssText string */
  /\bzIndex\s*(?:=|:)\s*[`'"]?-?\d/g,                         /* el.style.zIndex = '12' / { zIndex: 12 } */
  /setProperty\(\s*[`'"]z-index[`'"]\s*,\s*[`'"]?-?\d/g,     /* style.setProperty('z-index', '12') */
];
export function countLiterals(text) {
  let n = 0;
  for (const re of LITERAL) { re.lastIndex = 0; while (re.exec(text)) n++; }
  return n;
}

function walkJs(dir, out) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkJs(p, out); else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
/** { 'path': n } — files with none are absent. */
export function measureLiterals(root) {
  const R = root || ROOT, out = {};
  const rel = (p) => p.slice(R.length + 1).replace(/\\/g, '/');
  const put = (p, text) => { const n = countLiterals(text); if (n) out[rel(p)] = n; };
  for (const f of readdirSync(join(R, 'css')).filter((x) => x.endsWith('.css')).sort()) {
    const p = join(R, 'css', f); put(p, stripCssComments(readFileSync(p, 'utf8')));
  }
  for (const p of walkJs(join(R, 'js'), [])) {
    const src = readFileSync(p, 'utf8');
    const code = stripJsComments(src);
    if (code == null) throw new Error('z-layers: cannot parse ' + rel(p));
    put(p, code);
  }
  for (const f of readdirSync(R).filter((x) => x.endsWith('.html')).sort()) {
    const p = join(R, f); put(p, stripHtmlComments(readFileSync(p, 'utf8')));
  }
  return out;
}

/* ── the stack: every z-index declaration in the stylesheet, resolved ─────────────────────────── */
/** the --z-* tokens the stylesheet defines: { name: integer } (read, never listed here) */
export function tokens(css) {
  const t = {}; const re = /(--z-[a-z0-9-]+)\s*:\s*(-?\d+)\s*[;}]/g; let m;
  const c = stripCssComments(css);
  while ((m = re.exec(c))) t[m[1]] = +m[2];
  return t;
}
/** a declared value → the integer it computes to, or its keyword ('auto'); throws on anything else */
export function resolveValue(raw, tok) {
  let v = String(raw).replace(/!important/i, '').trim();
  if (/^auto$/i.test(v)) return 'auto';
  for (let guard = 0; /var\(/.test(v); guard++) {
    if (guard > 8) throw new Error('z-layers: unresolvable ' + raw);
    v = v.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]+))?\)/gi, (_, name, fb) => {
      if (tok[name] != null) return String(tok[name]);
      if (fb != null) return fb.trim();
      throw new Error('z-layers: ' + name + ' is not defined in :root');
    });
  }
  const m = /^calc\((.*)\)$/i.exec(v); if (m) v = m[1];
  if (!/^[-+\d\s]+$/.test(v)) throw new Error('z-layers: not an integer expression: ' + raw);
  const terms = v.replace(/\s+/g, '').match(/[-+]?\d+/g) || [];
  return terms.reduce((a, b) => a + +b, 0);
}
/** [{ selector, value, important }] in file order */
export function stack(css) {
  const c = stripCssComments(css), tok = tokens(css), out = [];
  const re = /(?<![\w-])z-index\s*:\s*([^;}]+)/g; let m;
  while ((m = re.exec(c))) {
    const before = c.slice(0, m.index), ob = before.lastIndexOf('{');
    const cb = Math.max(before.lastIndexOf('}', ob), before.lastIndexOf(';', ob));
    const selector = before.slice(cb + 1, ob).replace(/\s+/g, ' ').trim();
    out.push({ selector, value: resolveValue(m[1], tok), important: /!important/i.test(m[1]) });
  }
  return out;
}
const fmt = (s) => `${s.selector} → ${s.value}${s.important ? ' !important' : ''}`;
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

/** @returns {{ ok: boolean, lines: string[], literals: object, total: number, stack: string[] }} */
export function check(root, ledgerPath) {
  const R = root || ROOT, P = ledgerPath || LEDGER, lines = [];
  if (!existsSync(P)) return { ok: false, lines: [`no ledger at ${P} — run: node scripts/z-layers.mjs --update`] };
  const was = JSON.parse(readFileSync(P, 'utf8'));
  const now = measureLiterals(R);
  const wl = was.literals || {};
  for (const f of Array.from(new Set([...Object.keys(wl), ...Object.keys(now)])).sort()) {
    const a = wl[f] || 0, b = now[f] || 0;
    if (b > a) lines.push(`${f}: ${b} z-index value(s) written as a bare number, ledger allows ${a} — name the layer: var(--z-…) from css/intmap.css :root (calc(var(--z-…) + n) for a step above it)`);
    else if (b < a) lines.push(`${f}: ${b} bare z-index number(s), ledger still says ${a} — lower the ledger: node scripts/z-layers.mjs --update`);
  }
  let st;
  try { st = stack(readFileSync(join(R, STYLESHEET), 'utf8')).map(fmt); } catch (e) { lines.push(String(e.message || e)); st = []; }
  const ws = was.stack || [];
  const n = Math.max(ws.length, st.length);
  for (let i = 0; i < n; i++) {
    if (ws[i] !== st[i]) {
      lines.push(`${STYLESHEET}: the painting order changed at declaration ${i + 1} — ledger «${ws[i] || '(none)'}», stylesheet «${st[i] || '(none)'}». If that is intended, write it down: node scripts/z-layers.mjs --update`);
      break;
    }
  }
  return { ok: lines.length === 0, lines, literals: now, total: total(now), stack: st };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const lit = measureLiterals();
    const st = stack(readFileSync(join(ROOT, STYLESHEET), 'utf8')).map(fmt);
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/z-layers.mjs --update — bare z-index numbers per file (ratcheted both ways) and every z-index of css/intmap.css resolved, in order (any change fails); held by check:static',
      total: total(lit), literals: lit, stack: st,
    }, null, 1) + '\n');
    console.log(`z-layers: ledger written — ${total(lit)} bare numbers across ${Object.keys(lit).length} files, ${st.length} stylesheet declarations`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `z-layers: ${r.total} bare z-index numbers and ${r.stack.length} resolved declarations, as the ledger says` : 'z-layers: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    const lit = measureLiterals();
    for (const [f, n] of Object.entries(lit)) console.log(`${f}  ${n}`);
    console.log(`total ${total(lit)}`);
    const css = readFileSync(join(ROOT, STYLESHEET), 'utf8');
    console.log('tokens', tokens(css));
    for (const s of stack(css)) console.log('  ' + fmt(s));
  }
}
