#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE TWELFTH SHAPE — a translation tuple held as ADJACENT DATA   (#R246)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ WHY THERE WAS STILL SOMETHING TO FIND, FOR THE TWELFTH TIME ════════════════════════════════
 *  #R241 closed the tuple held as an ARRAY subscripted by the language's POSITION. #R244 measured
 *  and #R246 closed the tuple held as an OBJECT keyed by the language's CODE. Both instruments ask
 *  the same question — «is this container indexed by a language?» — and there is a third container,
 *  indexed by NOTHING at all:
 *
 *      _dc('d-ramstein','mil','mil',7.6,49.44,'Ramstein Air Base','ラムシュタイン空軍基地', …)
 *      A1:['Light (< 7 t)','小型機（7 t 未満）','Leicht (< 7 t)','Лёгкий (< 7 т)','Ligero (< 7 t)']
 *      ['東京','Tokyo',139.7671,35.6812,0]
 *
 *  The languages simply sit NEXT TO EACH OTHER, in argument order or in element order, and which
 *  slot is which is knowledge held in whatever reads the row. Every instrument here counts ZERO of
 *  it: the langmap audit wants language-coded KEYS, the positional-array audit wants a
 *  language→POSITION map, the positional audit wants a callee bound to IntMapLang, and the
 *  two-branch and helper audits want a ternary between two LITERALS. So they all print 100 %, and
 *  the strings are English in every language the row does not happen to list. That is
 *  [[intmap-recurring-lessons]] B for the seventh time.
 *
 *  ══ WHAT THIS MEASURES ═════════════════════════════════════════════════════════════════════════
 *  A CONTAINER — one array literal, or one call's argument list — holding two ADJACENT string
 *  literals of which exactly one is Japanese and the other is Latin prose. One finding per
 *  container, so a five-language row is one thing to fix rather than four.
 *
 *  ⚠ A CALL THAT IS ALREADY A TRANSLATION CALL IS EXEMPT, and «already» is resolved from the FILE,
 *  not from a list of names: the identifiers bound to `IntMapLang.pick()` / `.pickArgs()` / `.t` in
 *  that file (and those destructured out of js/world-packs.js's `_ui`, which hands `L` over) are
 *  collected first. `L('Tokyo','東京',…)` is exactly the shape this file exists to ask for, and its
 *  arguments are adjacent by construction; a missing fifth argument there is reported by
 *  scripts/i18n-positional-audit.mjs, which is the instrument that owns that question.
 *
 *  ⚠ AND THE ANSWER IS THE SAME ONE, TWICE OVER: STOP THE SHAPE EXISTING. `IntMapLang.pickArgs()`
 *  returns the array it is handed, so `LA('Tokyo','東京',…)` is byte-identical DATA that is also an
 *  ordinary call site — which the positional audit and the inline report then read with no edit.
 *
 *      node scripts/i18n-pair-audit.mjs           # the list
 *      node scripts/i18n-pair-audit.mjs --list    # …every one, with its line
 *      node scripts/i18n-pair-audit.mjs --json    # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
/* the registry owns the language machinery; the locale files ARE the tables this is about */
const SKIP = /(^|\/)lang-registry\.js$|(^|\/)locales\//;

/* Japanese script: hiragana, katakana, CJK ideographs and the fullwidth forms the app's own
   Japanese strings use. ⚠ NOT a general CJK test — this file only ever looks at js/, whose second
   language is Japanese; a Chinese string would match the ideograph range too, and that is fine. */
const JA = /[぀-ヿ㐀-鿿！-｠]/;
/* …and the other half of a pair has to be Latin PROSE, not a token. Same rule as the langmap audit:
   an id, a colour, a code or a URL is not a translation. */
/* ⚠ THE PROSE TEST IS LOOSER HERE THAN IN THE LANGMAP AUDIT, ON PURPOSE. There, a short ASCII token
   («EUR», «JP») had to be excluded because a language-keyed map of CODES is a real and legitimate
   shape. Here the OTHER half of the pair is already known to be Japanese prose, so a short English
   word beside it — «Coal», «Gas», «Oil» — is a translation and not a code. Keeping the strict rule
   made this file measure three of those rows by their COLOUR instead of by their label. */
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const KEYISH = /^[a-z0-9]+([_.][a-z0-9]+)+$/;              /* coal_share_of_electricity__pct */
const FILEISH = /^[\w./-]+\.(png|jpg|jpeg|svg|gz|json|js|css|webp|bin|tle)$/i;
const URLISH = /^[^\s]*[=&?][^\s]*$/;
const isProse = (v) => v.length > 1 && /[A-Za-z]/.test(v)
  && !HEX.test(v) && !KEYISH.test(v) && !FILEISH.test(v) && !URLISH.test(v) && !JA.test(v);

const files = [];
(function walkDir(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDir(join(dir, e.name), rel + e.name + '/');
    else if (e.name.endsWith('.js')) files.push([join(dir, e.name), rel + e.name]);
  }
})(JS, 'js/');

/* ── which identifiers in THIS file are translation functions ─────────────────────────────────
   ⚠ NOT A LIST OF NAMES. Half the files wrap the registry in a local helper of their own —
   `_authL(...)`, `L5(...)`, `OL(...)`, `_L5(...)` — and a name list would have to be maintained
   against every one of them for ever, which is the maintenance surface this whole family of
   instruments exists to remove. The test is instead STRUCTURAL and then TEXTUAL: a name bound
   directly to `IntMapLang.pick()/.pickArgs()/.t`, a name destructured out of js/world-packs.js's
   `_ui` (which hands `L` over), or a function whose own body names `IntMapLang` at all. A function
   that reaches the registry IS a translation call, whatever it is called. */
function langNames(ast, src) {
  const names = new Set();
  const uiHolders = new Set();          /* identifiers bound to IntMapWorld._ui */
  const srcOf = (n) => {
    /* window.IntMapLang.pick(…) / IntMapLang.pickArgs() / …_ui / IntMapWorld._ui */
    let s = '', cur = n;
    for (let i = 0; i < 8 && cur; i++) {
      if (cur.type === 'CallExpression') { cur = cur.callee; continue; }
      if (cur.type === 'LogicalExpression') { cur = cur.right; continue; }
      if (cur.type === 'MemberExpression') { s = '.' + (cur.property.name || cur.property.value) + s; cur = cur.object; continue; }
      if (cur.type === 'Identifier') { s = cur.name + s; }
      break;
    }
    return s;
  };
  walk.simple(ast, {
    VariableDeclarator(d) {
      if (!d.init) return;
      const s = srcOf(d.init);
      if (d.id.type === 'Identifier') {
        if (/IntMapLang\.(pick|pickArgs|t)$/.test(s)) names.add(d.id.name);
        if (/IntMapWorld\._ui$/.test(s)) uiHolders.add(d.id.name);
        if ((d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
          && src.slice(d.init.start, d.init.end).includes('IntMapLang')) names.add(d.id.name);
      } else if (d.id.type === 'ObjectPattern' && d.init.type === 'Identifier' && uiHolders.has(d.init.name)) {
        for (const p of d.id.properties) {
          const v = p.value && p.value.type === 'Identifier' ? p.value : (p.key && p.key.type === 'Identifier' ? p.key : null);
          if (v) names.add(v.name);
        }
      }
    },
    FunctionDeclaration(d) {
      if (d.id && src.slice(d.start, d.end).includes('IntMapLang')) names.add(d.id.name);
    },
  });
  return names;
}

const hits = [];
for (const [full, rel] of files) {
  if (SKIP.test(rel)) continue;
  const src = readFileSync(full, 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (e) {
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
    catch (e2) { continue; }
  }
  const LANG = langNames(ast, src);
  const isLangCall = (c) => {
    if (c.type === 'Identifier') return LANG.has(c.name);
    if (c.type !== 'MemberExpression' || c.computed) return false;
    const p = c.property.name;
    if (p === 'arr' || p === 'apply' || p === 'call') return isLangCall(c.object) || c.object.type === 'MemberExpression';
    /* window.IntMapLang.t(…) and friends */
    let cur = c.object, s = p;
    for (let i = 0; i < 6 && cur; i++) {
      if (cur.type === 'MemberExpression' && !cur.computed) { s = cur.property.name + '.' + s; cur = cur.object; continue; }
      if (cur.type === 'Identifier') { s = cur.name + '.' + s; }
      break;
    }
    return /IntMapLang\.(t|pick|pickArgs|arr)$/.test(s);
  };
  const scan = (list, node, what) => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      if (!a || !b || a.type !== 'Literal' || b.type !== 'Literal') continue;
      if (typeof a.value !== 'string' || typeof b.value !== 'string') continue;
      const aJa = JA.test(a.value), bJa = JA.test(b.value);
      if (aJa === bJa) continue;
      const en = aJa ? b.value : a.value, ja = aJa ? a.value : b.value;
      if (!isProse(en)) continue;
      hits.push({
        file: rel, line: node.loc.start.line, what,
        text: (JSON.stringify(en) + ', ' + JSON.stringify(ja)).slice(0, 110),
      });
      return;                       /* ⚠ ONE finding per container */
    }
  };
  walk.simple(ast, {
    ArrayExpression(n) { scan(n.elements, n, 'array'); },
    CallExpression(n) { if (!isLangCall(n.callee)) scan(n.arguments, n, 'call'); },
    NewExpression(n) { scan(n.arguments, n, 'call'); },
  });
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    total: hits.length,
    files: [...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ file: f, n })),
    hits: hits.slice(0, 400),
  }));
  process.exit(0);
}

console.log('\nIntMap · adjacent-pair audit — a translation tuple must be a CALL, not two data slots  (#R246)\n');
if (!hits.length) {
  console.log('  ✓ no translation tuple is held as adjacent data slots.\n');
  process.exit(0);
}
if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.what}]  ${h.text}`);
  console.log('');
}
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\n  ${hits.length} container(s) in ${byFile.size} file(s). Write the tuple as a call instead:`);
console.log('      const LA = window.IntMapLang.pickArgs();     // once per scope');
console.log("      nm: LA('Tokyo','東京','Tokio','Токио','Tokio')");
console.log('      …and resolve it with L.arr(x.nm), which is pick() itself, so fr/ko/zh reach the inline table.\n');
process.exit(1);
