#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE TWELFTH SHAPE, REWRITTEN AS CALLS   (#R248)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  scripts/i18n-pair-audit.mjs measures the shape (a translation tuple held as ADJACENT DATA
 *  SLOTS); this writes the answer for the part of it that is mechanical, which is the part where
 *  the container is NOTHING BUT the tuple:
 *
 *      lbl:['Population','人口','Bevölkerung','Население','Población']
 *   →  lbl:LA('Population','人口','Bevölkerung','Население','Población')
 *
 *  `IntMapLang.pickArgs()` returns the array it is handed, so the DATA is byte-identical — what
 *  changes is that the file now holds a CallExpression whose callee is bound to the registry, which
 *  is the one thing scripts/i18n-report.mjs and scripts/i18n-positional-audit.mjs look for. Both
 *  pick these up with no edit (#R241 proved that when it closed the seventh shape).
 *
 *  ⚠ IT ONLY TOUCHES CONTAINERS THAT ARE PURE TUPLES. An array with a number, an id, a colour or a
 *  nested array in it — `[lng,lat,minzoom,en,jp,de,ru,es]`, a gazetteer row, a call's argument list
 *  — is a DIFFERENT edit (the tuple has to be lifted out of the row and the row's readers moved onto
 *  it), and a codemod that guessed at those is how #R244's langmap codemod broke a working feature
 *  by rewriting `{english:'en'}`. Those are converted by hand, in the round that can also read their
 *  readers.
 *
 *  ⚠ AND CONVERTING THE DATA IS HALF THE JOB ([[intmap-recurring-lessons]] B7). A container that is
 *  read with `arr[i]||arr[0]` still answers English for every language past the arguments given, so
 *  the READER has to move onto `pick()` too — this script REFUSES to run on a file whose readers
 *  still subscript by a hand-rolled language index, and names them, rather than leaving a file whose
 *  instruments are green and whose screen is English.
 *
 *      node scripts/i18n-pair-codemod.mjs --dry            # what it would do, everywhere
 *      node scripts/i18n-pair-codemod.mjs js/drone-nav.js  # write, one file at a time
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const DRY = process.argv.includes('--dry');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const JA = /[぀-ヿ㐀-鿿！-｠]/;
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const KEYISH = /^[a-z0-9]+([_.][a-z0-9]+)+$/;
const FILEISH = /^[\w./-]+\.(png|jpg|jpeg|svg|gz|json|js|css|webp|bin|tle)$/i;
const URLISH = /^[^\s]*[=&?][^\s]*$/;
/* a letter of SOME alphabet the app's languages are written in — Latin, Cyrillic or Greek. An emoji,
   a hex colour or a bare symbol has none, and is therefore not a translation of anything. */
const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſЀ-ӿΆ-ώ]/;
const isProse = (v) => v.length > 1 && /[A-Za-z]/.test(v)
  && !HEX.test(v) && !KEYISH.test(v) && !FILEISH.test(v) && !URLISH.test(v) && !JA.test(v);

/* ⚠ THE FOURTEENTH SHAPE, FOUND BY SYNTAX AND NOT BY TEXT. A reader that turns a language into an
   ARRAY POSITION with a ternary chain — `lang==='jp'?1:lang==='de'?2:…:0` — cannot be converted by
   machine, because only the file knows which helper should replace it. Matching it with a regular
   expression is how [[intmap-recurring-lessons]] E happens for the ninth time: the note this round
   wrote ABOVE each fixed reader quotes the chain, and a text test then fails on the very files it
   has already been fixed in. So the test is on the AST — a ConditionalExpression whose two arms are
   an integer and (another such chain | an integer), and whose test compares something to a language
   code — and comments are not part of the AST. */
const LANG_CODE = new Set(['jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans', 'en']);
function indexChains(ast) {
  const hits = [];
  const intish = (n) => n && n.type === 'Literal' && typeof n.value === 'number' && Number.isInteger(n.value);
  const langTest = (n) => {
    if (!n || n.type !== 'BinaryExpression' || (n.operator !== '===' && n.operator !== '==')) return false;
    for (const side of [n.left, n.right]) {
      if (side.type === 'Literal' && typeof side.value === 'string' && LANG_CODE.has(side.value.toLowerCase())) return true;
    }
    return false;
  };
  walk.full(ast, (n) => {
    if (n.type !== 'ConditionalExpression' || !langTest(n.test)) return;
    if (!intish(n.consequent)) return;
    if (!(intish(n.alternate) || n.alternate.type === 'ConditionalExpression')) return;
    hits.push(n.loc.start.line);
  });
  return [...new Set(hits)].sort((a, b) => a - b);
}

const files = [];
(function walkDir(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDir(join(dir, e.name), rel + e.name + '/');
    else if (e.name.endsWith('.js')) files.push([join(dir, e.name), rel + e.name]);
  }
})(JS, 'js/');

/* which identifier in this file is already bound to IntMapLang.pickArgs() — and in WHICH scope.
   A file may hold several (js/analysis-panels.js has three IIFEs), so the one that is in scope at
   the container's own position is the one to use: a name declared in a sibling IIFE is not visible,
   and reaching for it is the TDZ/shadowing defect #R246 spent a round on. */
const FN_SCOPE = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'Program']);
function pickArgsBindings(ast, src) {
  /* scope node -> the name bound to pickArgs() in it */
  const byScope = new Map();
  walk.ancestor(ast, {
    VariableDeclarator(n, _s, anc) {
      if (!n.init || n.id.type !== 'Identifier') return;
      if (!/IntMapLang\s*\.\s*pickArgs\s*\(\s*\)/.test(src.slice(n.init.start, n.init.end))) return;
      for (let i = anc.length - 1; i >= 0; i--) {
        if (FN_SCOPE.has(anc[i].type)) { byScope.set(anc[i], { name: n.id.name, at: n.start }); break; }
      }
    },
  });
  return byScope;
}
/* ⚠⚠ THE BINDING HAS TO BE IN SCOPE, NOT MERELY EARLIER IN THE FILE. The first pass of this codemod
   took «the nearest declaration before this position», which is a fair description of a file with
   one scope and wrong for every file without one: js/layer-packs.js has four sibling IIFEs, three of
   which declare their own `LA`, and the fourth got handed a name from a sibling — a `const` that is
   not in scope. The result was `ReferenceError: LA is not defined` at module evaluation, i.e. the
   whole religion/language pack dead, and NOT ONE node check saw it ([[intmap-recurring-lessons]] L,
   #R246: the browser is what catches this). So the lookup walks the ancestor chain, and a container
   whose scopes hold no binding is LEFT ALONE and reported rather than rewritten. */
function bindingFor(byScope, ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const b = byScope.get(ancestors[i]);
    if (b) return b.name;
  }
  return null;
}

let totalFiles = 0, totalHits = 0;
const blocked = [];
for (const [full, rel] of files) {
  if (ONLY.length && !ONLY.some((o) => rel === o || rel.endsWith('/' + o) || rel === 'js/' + o)) continue;
  if (/(^|\/)lang-registry\.js$|(^|\/)locales\//.test(rel)) continue;
  const src = readFileSync(full, 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }

  const bindings = pickArgsBindings(ast, src);
  if (!bindings.size) continue;                       /* no LA in this file — a hand edit, not this */

  /* ⚠ THE READER GATE (see the header). */
  const chains = indexChains(ast);
  if (chains.length) { blocked.push([rel, chains]); continue; }

  const edits = [];
  const skipped = [];
  walk.ancestor(ast, {
    ArrayExpression(n, _st, anc) {
      /* ⚠ A MATCH-TERM LIST IS NOT A TRANSLATION TUPLE. js/tables.js's `_ORG_GZ` and js/gazetteer.js
         are rows of the form [[…terms…], lng, lat, nameEn, nameJp]: the first element is the list of
         SPELLINGS a headline may use, which happens to contain an English one and a Japanese one and
         is therefore shaped exactly like a tuple. Rewriting it as `LA(…)` changes no behaviour
         (pickArgs returns its arguments), but it FILES A MATCHER AS UI — and the next round would
         then dutifully «translate» a list whose job is to be matched against, not read. The rule is
         structural: element 0 of a row whose later elements are coordinates is a matcher. */
      const parent = anc[anc.length - 2];
      if (parent && parent.type === 'ArrayExpression' && parent.elements[0] === n
        && parent.elements.length >= 3
        && parent.elements.some((e) => e && e.type === 'Literal' && typeof e.value === 'number')) return;
      const el = n.elements;
      if (el.length < 2 || el.length > 5) return;
      if (!el.every((e) => e && e.type === 'Literal' && typeof e.value === 'string')) return;
      /* ⚠⚠⚠ THE TUPLE HAS TO BE IN THE REGISTRY'S OWN ORDER, WHOLE, FROM POSITION 0. The first pass
         of this codemod asked only «is there an adjacent en/ja pair somewhere in this array», which
         is the pair AUDIT's question — the right question for measuring and the wrong one for
         rewriting. It rewrote three families of array that are not tuples at all, and every one of
         them would have shipped a wrong string rather than an English one:
             CO_CC:  ['United States','アメリカ','🇺🇸']    → 🇺🇸 becomes the GERMAN translation
             parts:  ['coal_share…__pct','Coal','石炭','#6b6b6b'] → the data key becomes the English
             JMA:    ['暴風雪','Snowstorm']                 → 暴風雪 becomes the ENGLISH
         That is #R244's langmap codemod defect exactly (「codemod は散文とコードを見分けろ」), so the
         test is now positional and total: slot 0 English prose, slot 1 Japanese, and every later
         slot a plausible TRANSLATION — a string carrying a letter of some alphabet, which an emoji,
         a hex colour, a snake_case key and a file name all fail. */
      if (JA.test(el[0].value) || !isProse(el[0].value)) return;
      if (!JA.test(el[1].value)) return;
      for (let i = 2; i < el.length; i++) {
        const v = el[i].value;
        if (JA.test(v)) return;                                   /* only one Japanese slot */
        if (!LETTER.test(v)) return;                              /* 🇺🇸, #6b6b6b, «—» */
        if (HEX.test(v) || KEYISH.test(v) || FILEISH.test(v) || URLISH.test(v)) return;
      }
      const name = bindingFor(bindings, anc);
      if (!name) { skipped.push(`${rel}:${n.loc.start.line}`); return; }
      edits.push({ start: n.start, end: n.end, text: name + '(' + src.slice(n.start + 1, n.end - 1) + ')' });
    },
  });
  if (skipped.length) console.log(`  ⚠ ${skipped.length} container(s) in ${rel} have no pickArgs binding IN SCOPE — declare one at the top of that scope first (${skipped.slice(0,3).join(', ')})`);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  totalFiles++; totalHits += edits.length;
  console.log(`${DRY ? 'would rewrite' : 'rewrote'} ${String(edits.length).padStart(4)}  ${rel}`);
  if (!DRY) writeFileSync(full, out);
}

if (blocked.length) {
  console.log('\n⚠ SKIPPED — the reader still subscripts by a hand-rolled language index, so converting');
  console.log('  the data would leave the instruments green and the screen English (the fourteenth shape).');
  console.log('  Move the reader onto `pick().arr(…)` first, then run this file again:');
  for (const [rel, lines] of blocked) console.log(`      ${rel}  line ${lines.join(', ')}`);
}
console.log(`\n${DRY ? 'would rewrite' : 'rewrote'} ${totalHits} container(s) in ${totalFiles} file(s).`);
