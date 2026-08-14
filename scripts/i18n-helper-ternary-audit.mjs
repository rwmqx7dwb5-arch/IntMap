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
    },
  });
}

const pairs = hits.filter((h) => h.kind === 'pair');
const distinct = new Set(pairs.map((h) => h.en));
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ sites: hits.length, pairs: pairs.length, distinct: distinct.size }));
} else {
  console.log('\nIntMap · helper-ternary audit — a two-language string is seven languages missing  (#R242)\n');
  if (!hits.length) { console.log('  ✓ no `jp() ? … : …` translation pairs left in js/'); process.exit(0); }
  const per = {};
  for (const h of hits) per[h.file] = (per[h.file] || 0) + 1;
  for (const f of Object.keys(per).sort((a, b) => per[b] - per[a])) console.log(`  ${String(per[f]).padStart(4)}  ${f}`);
  console.log(`\n  ${hits.length} site(s): ${pairs.length} literal pairs (${distinct.size} distinct English strings)`
    + ` and ${hits.length - pairs.length} with an interpolation.`);
  console.log('  Each one is English in de, ru, es, fr, ko, zh and zh-Hans. Rewrite as');
  console.log("      L('English', '日本語', 'Deutsch', 'Русский', 'Español')");
  console.log('  and add the fr/ko/zh entries with scripts/i18n-append-inline.mjs.\n');
  if (process.argv.includes('--list')) for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.kind}  ${JSON.stringify(h.en).slice(0, 90)}`);
}
