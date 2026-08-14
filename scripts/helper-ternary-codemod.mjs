#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE NINTH SHAPE, CONVERTED — `jp() ? 日本語 : English` → `t(lang, …)`   (#R243)
 * ----------------------------------------------------------------------------
 *  「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
 *    完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかることは
 *    許されない。」
 *
 *  #R242 found this shape and measured it — 486 sites across fifteen files, every one of them English
 *  for de, ru, es, fr, ko, zh and zh-Hans — and wrote the number into the gate rather than fixing it
 *  (scripts/i18n-helper-ternary-audit.mjs, «OPEN GAP»). This is the fix.
 *
 *  ══ WHY `IntMapLang.t(lang, …)` AND NOT A LOCAL `L(…)` ═══════════════════════════════════════
 *  Exactly #R231's argument, which applies here for the same reason: these ternaries live inside
 *  factory closures, template literals, object literals and other conditionals, and four of the
 *  fifteen files already bind `L` to something else in an inner scope (js/widgets.js
 *  `const L=launchCache.data`, js/compare.js `const L=CMP_LAYERS.find(…)`, js/map-tools.js twice).
 *  Rewriting to a bare `L` would need scope analysis to know which sites are inside those functions,
 *  and getting it wrong silently calls a layer table with five strings. `t()` takes the language as
 *  its first argument, so the expression is replaced by an expression that depends on nothing but the
 *  accessor the `jp` helper itself was written with — no new binding, no shadowing, no analysis.
 *
 *  ⚠ AND THE AUDIT NOW SEES `t()` FOR de/ru/es. That was the tenth blind spot, found while writing
 *  this: scripts/i18n-report.mjs counts both shapes (so fr/ko/zh were measured), but
 *  scripts/i18n-positional-audit.mjs only ever looked at CallExpressions whose callee is an
 *  Identifier bound to `pick()` — so the 268 sites #R231 converted to `t()` were outside the de/ru/es
 *  universe entirely and this round would have added 486 more to it. Both audits read both shapes now.
 *
 *  ══ WHAT IT REFUSES ═════════════════════════════════════════════════════════════════════════
 *  Same three rules scripts/lang-ternary-codemod.mjs states, for the same reason — a value that is
 *  not prose must never become a row a translator can edit:
 *    · CODEISH — `jp()?'ja-JP':'en-GB'` is a *locale tag* for `toLocaleString`. Those are handled by
 *      `IntMapLang.locale()` and are listed, not converted.
 *    · TOKENISH — one short all-lower-case token with no space is a KEY (`'jma'`/`'mmi'` chooses the
 *      intensity scale, i.e. physics).
 *    · no letters at all — nothing to translate.
 *  …and one more this tool needs and that one did not: a pair whose English string has no entry in
 *  the dictionary is REFUSED rather than converted to a two-argument call, because a two-argument
 *  call is the same defect wearing the gate's own clothes.
 *
 *      node scripts/helper-ternary-codemod.mjs --dump      # every convertible pair, as JSON
 *      node scripts/helper-ternary-codemod.mjs             # rewrite, reading scripts/i18n/de-ru-es.json
 *      node scripts/helper-ternary-codemod.mjs --check     # exit non-zero if any convertible pair is left
 * ==========================================================================*/
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const DICT_DIR = join(ROOT, 'scripts', 'i18n');
const DUMP = process.argv.includes('--dump');
const CHECK = process.argv.includes('--check');

/* ⚠ THE TEST IS THE JAPANESE ARM, NOT THE ENGLISH ONE, and that is the difference from
   scripts/lang-ternary-codemod.mjs. That tool guessed from the English value because both arms of the
   chains it converted were often bare tokens. Here the pair is `jp() ? 日本語 : English`, so the
   question 「is this prose or is it a code?」 has a direct answer: a value written in kana or kanji is
   prose. Testing the English side instead threw away eight real translations in the first run —
   'latest'/'最新', 'days'/'日', 'today'/'本日', 'variants'/'変異株', 'daylight'/'日照', 'lit'/'照度',
   'd'/'日後' — because they are short lower-case tokens, and the dagger `'†'/'死者 '` because a dagger
   contains no letter. What is genuinely NOT a translation is a pair of LANGUAGE OR LOCALE TAGS
   (`'en-GB'`/`'ja-JP'` for `toLocaleString`, `'en'`/`'jp'` for an API's language parameter), and both
   arms of those are ASCII codes — so that is what is refused. */
const CODEISH = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
const JA_TEXT = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const convertible = (en, ja) => JA_TEXT.test(ja) && !CODEISH.test(en);

function walkAll(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walkAll(c, fn, node));
    else if (v && typeof v.type === 'string') walkAll(v, fn, node);
  }
}

/* `const jp = () => <accessor> === 'jp'` → the accessor's SOURCE TEXT (HOST.lang / currentLang) */
function accessorOf(src, ast) {
  let acc = null;
  walkAll(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.name !== 'jp' || !n.init) return;
    const f = n.init;
    if (f.type !== 'ArrowFunctionExpression' || f.params.length) return;
    const b = f.body;
    if (!b || b.type !== 'BinaryExpression' || b.operator !== '===') return;
    if (!b.right || b.right.type !== 'Literal' || b.right.value !== 'jp') return;
    const text = src.slice(b.left.start, b.left.end);
    if (acc && acc !== text) throw new Error('two different `jp` accessors in one file: ' + acc + ' / ' + text);
    acc = text;
  });
  return acc;
}

const q = (s) => JSON.stringify(s);
/* ⚠ ONE DICTIONARY, SIX COLUMNS, READ BY TWO TOOLS. scripts/i18n/*.json holds
   `"English": [de, ru, es, fr, ko, zh-Hant]` — this codemod takes the first three (they become
   ARGUMENTS at the call site) and scripts/i18n-apply-inline.mjs takes the last three (they become
   rows in ui.fr.js / ui.ko.js / ui.zh.js, and ui.zh-hans.js is derived from ui.zh.js by
   scripts/zh-hans.mjs). Splitting them into two files would be the same translation written twice
   ([[intmap-recurring-lessons]] G). */
export const LANG_COL = { de: 0, ru: 1, es: 2, fr: 3, ko: 4, zh: 5 };
export function loadDict() {
  const out = Object.create(null);
  if (!existsSync(DICT_DIR)) return out;
  for (const f of readdirSync(DICT_DIR).filter((n) => /^r\d+-[a-z]\.json$/.test(n)).sort()) {
    const j = JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8'));
    for (const k of Object.keys(j)) { if (k === '_') continue; out[k] = j[k]; }
  }
  return out;
}
const raw = loadDict();
const dict = Object.create(null);
for (const k of Object.keys(raw)) {
  const v = raw[k];
  dict[k] = { de: v[0], ru: v[1], es: v[2], fr: v[3], ko: v[4], zh: v[5] };
}
const files = readdirSync(JS).filter((n) => n.endsWith('.js')).sort();
const dumped = [];
let converted = 0, refusedCode = [], missing = new Set(), left = 0;

for (const f of files) {
  const src0 = readFileSync(join(JS, f), 'utf8');
  if (src0.indexOf('jp()') < 0) continue;
  let ast;
  try { ast = parse(src0, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { try { ast = parse(src0, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }
  const acc = accessorOf(src0, ast);
  if (!acc) continue;

  const edits = [];
  walkAll(ast, (n) => {
    if (n.type !== 'ConditionalExpression') return;
    const t = n.test;
    if (!t || t.type !== 'CallExpression' || t.arguments.length) return;
    if (!t.callee || t.callee.type !== 'Identifier' || t.callee.name !== 'jp') return;
    const lit = (e) => e && e.type === 'Literal' && typeof e.value === 'string';
    if (!lit(n.consequent) || !lit(n.alternate)) return;
    const ja = n.consequent.value, en = n.alternate.value;
    if (!convertible(en, ja)) { refusedCode.push({ file: f, line: n.loc.start.line, en, ja }); return; }
    if (DUMP) { dumped.push({ file: f, line: n.loc.start.line, en, ja }); return; }
    const row = dict[en];
    if (!row || !row.de || !row.ru || !row.es) { missing.add(en); left++; return; }
    edits.push({ start: n.start, end: n.end,
      text: 'window.IntMapLang.t(' + acc + ',' + q(en) + ',' + q(ja) + ',' + q(row.de) + ',' + q(row.ru) + ',' + q(row.es) + ')' });
  });
  if (DUMP || CHECK || !edits.length) { if (CHECK) left += edits.length; continue; }
  edits.sort((a, b) => b.start - a.start);
  let out = src0;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  writeFileSync(join(JS, f), out);
  converted += edits.length;
  console.log('  ' + f + ' — ' + edits.length + ' site(s)');
}

if (DUMP) { process.stdout.write(JSON.stringify(dumped, null, 1)); process.exit(0); }
if (CHECK) {
  if (left) { console.error('✗ ' + left + ' convertible `jp() ? … : …` pair(s) remain'); process.exit(1); }
  console.log('✓ no convertible `jp() ? … : …` pairs left in js/');
  process.exit(0);
}
console.log('\n✓ ' + converted + ' site(s) rewritten as IntMapLang.t(lang, en, jp, de, ru, es)');
if (missing.size) {
  console.log('⚠ ' + missing.size + ' English string(s) have no de/ru/es row in scripts/i18n/de-ru-es.json:');
  [...missing].slice(0, 20).forEach((s) => console.log('    ' + JSON.stringify(s)));
}
if (refusedCode.length) {
  console.log('\n  ' + refusedCode.length + ' pair(s) left alone (a code, a locale tag or a bare token):');
  refusedCode.forEach((r) => console.log('    ' + r.file + ':' + r.line + '  ' + JSON.stringify(r.en) + ' / ' + JSON.stringify(r.ja)));
}
