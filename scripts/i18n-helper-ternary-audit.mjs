#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE NINTH SURFACE — «is this two-language, behind a helper?»   (#R242)
 * ----------------------------------------------------------------------------
 *  「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
 *    完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかることは
 *    許されない。」
 *
 *  ══ WHAT EIGHT INSTRUMENTS DO NOT SEE ═══════════════════════════════════════════════════════
 *  #R237 wrote an audit for the two-branch ternary — `HOST.lang === 'jp' ? '日本語' : 'English'` —
 *  because a string with two arms has seven languages missing by construction. It matches on the
 *  TEST being a comparison against a language code. Fifteen files in js/ do not write the comparison:
 *  they call a one-line helper,
 *
 *      const jp = () => HOST.lang === 'jp';
 *      …
 *      title: jp() ? '時系列グラフ' : 'Time-series'
 *
 *  which is the same statement with the same cost — English for de, ru, es, fr, ko, zh and zh-Hans —
 *  and is invisible to every gauge this repo has, because the test is a CallExpression rather than a
 *  BinaryExpression. Measured on the shipped build: 485 sites, 432 distinct English strings, of which
 *  373 have no entry in any inline table. All nine languages therefore printed 100 % while a Korean
 *  reader saw English on the Widgets board, in the Playground, in Compare, in Feedback and in the
 *  map's own tool panels.
 *
 *  ⚠ THIS FILE DOES NOT FAIL THE BUILD, AND THAT IS A DELIBERATE, TEMPORARY, WRITTEN-DOWN CHOICE.
 *  #R242 found the shape and could not convert 485 call sites in the same round it was found; a gate
 *  that fails on the day it is written would simply have been switched off. What it does instead is
 *  PRINT THE NUMBER inside `scripts/i18n-audit.mjs --gate`, so no round after this one can call the
 *  translation complete without reading how much of it is not — which is the whole failure this
 *  family of instruments exists to stop ([[intmap-recurring-lessons]] B). The moment the count
 *  reaches zero, delete the `soft` flag in i18n-audit.mjs and this becomes a gate like the others.
 *
 *      node scripts/i18n-helper-ternary-audit.mjs           # human, with the per-file counts
 *      node scripts/i18n-helper-ternary-audit.mjs --list    # every site
 *      node scripts/i18n-helper-ternary-audit.mjs --json    # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');

/* A helper is «a nullary call whose name says it answers a language question». `jp()` is the one this
   repo has; the pattern is written as a rule rather than as that one name so a second one cannot be
   introduced under a different spelling and stay invisible. */
const HELPER = /^(?:jp|ja|isJp|isJa|zh|isZh|ko|isKo|de|isDe|ru|isRu|es|isEs)$/;

const hits = [];
for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(join(JS, f), 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (e) {
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
    catch (e2) { continue; }
  }
  walk.simple(ast, {
    ConditionalExpression(n) {
      const t = n.test;
      if (!t || t.type !== 'CallExpression' || t.arguments.length) return;
      if (!t.callee || t.callee.type !== 'Identifier' || !HELPER.test(t.callee.name)) return;
      const lit = (e) => e && e.type === 'Literal' && typeof e.value === 'string';
      /* both arms literal = a translation pair; one arm literal = a pair with an interpolation in it,
         which is the same defect and is counted separately so the fix can be planned. */
      if (lit(n.consequent) && lit(n.alternate)) hits.push({ file: f, line: n.loc.start.line, kind: 'pair', en: n.alternate.value });
      else if (lit(n.consequent) || lit(n.alternate)) hits.push({ file: f, line: n.loc.start.line, kind: 'partial', en: '' });
      /* ══ ⚠⚠⚠ (#R247) THE THIRTEENTH SHAPE — THE SAME TERNARY, ONE CONTAINER DEEP ═══════════════
         「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。」
         Both arms of the test above have to be STRINGS. js/feedback.js's bug-report categories are
         the same statement written as two ARRAYS:
             return jp() ? [['ui','UI・表示'],…] : [['ui','UI / display'],…]
         — seven whole languages missing, from a list a reader has to choose from before they can
         file a report, and not one instrument in this repository counted a single string of it: the
         pair audit wants literal arms, the positional audit wants a call, the langmap audit wants
         language-coded keys and the adjacent-pair audit exempts nothing here because there is no
         Japanese string ADJACENT to an English one — they are in different arms.
         ⚠ COUNTED AS STRINGS, NOT AS SITES: one ternary can hide a whole menu, and the number that
         matters to a reader of Korean is how many words they see in English. */
      else if (n.consequent && n.alternate
        && (n.consequent.type === 'ArrayExpression' || n.consequent.type === 'ObjectExpression')
        && n.consequent.type === n.alternate.type) {
        let n_ = 0;
        walk.simple(n.alternate, { Literal(l) { if (typeof l.value === 'string' && l.value.trim()) n_++; } });
        if (n_) hits.push({ file: f, line: n.loc.start.line, kind: 'container', en: '', strings: n_ });
      }
    },
  });
}

const pairs = hits.filter((h) => h.kind === 'pair');
const conts = hits.filter((h) => h.kind === 'container');
const contStrings = conts.reduce((a, h) => a + h.strings, 0);
const distinct = new Set(pairs.map((h) => h.en));
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ sites: hits.length, pairs: pairs.length, distinct: distinct.size,
    containers: conts.length, containerStrings: contStrings }));
} else {
  console.log('\nIntMap · helper-ternary audit — a two-language string is seven languages missing  (#R242)\n');
  if (!hits.length) { console.log('  ✓ no `jp() ? … : …` translation pairs left in js/'); process.exit(0); }
  const per = {};
  for (const h of hits) per[h.file] = (per[h.file] || 0) + 1;
  for (const f of Object.keys(per).sort((a, b) => per[b] - per[a])) console.log(`  ${String(per[f]).padStart(4)}  ${f}`);
  console.log(`\n  ${hits.length} site(s): ${pairs.length} literal pairs (${distinct.size} distinct English strings),`
    + ` ${conts.length} whole CONTAINERS holding ${contStrings} strings (#R247),`
    + ` and ${hits.length - pairs.length - conts.length} with an interpolation.`);
  console.log('  Each one is English in de, ru, es, fr, ko, zh and zh-Hans. Rewrite as');
  console.log("      L('English', '日本語', 'Deutsch', 'Русский', 'Español')");
  console.log('  and add the fr/ko/zh entries with scripts/i18n-append-inline.mjs.\n');
  if (process.argv.includes('--list')) for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.kind}  ${JSON.stringify(h.en).slice(0, 90)}`);
}
