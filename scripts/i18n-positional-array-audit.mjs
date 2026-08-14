#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠ THE SEVENTH SURFACE — «is this tuple of translations a CALL?»   (#R241)
 * ----------------------------------------------------------------------------
 *  「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において対応が
 *    完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかることは
 *    許されない。」
 *
 *  ══ WHAT THIS ONE MEASURES, AND WHY IT IS NOT ANOTHER COVERAGE REPORT ═══════════════════════
 *  Six instruments already answer «how much of the table does this language have» and #R240 added
 *  a seventh question — «is the string in the table at all». This is the eighth question and it is
 *  about a SHAPE rather than a string:
 *
 *      {id:'ec-temp', label:['Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur…','Температура…']}
 *      const ecLbl = (l) => l.label[IntMapLang.index(HOST.lang)] || l.label[0];
 *
 *  That is a five-positional `L(…)` call written as data so it can be resolved later — legitimate,
 *  and it cost three things, every one of them measured on the shipped build:
 *    ① `arr[i] || arr[0]` has no inline-table fallback, so fr/ko/zh got element 0 — English — for
 *       ever, whatever their locale file said;
 *    ② most of the arrays were four long (en/jp/de/ru) or two (en/jp), so es fell to English too;
 *    ③ an array literal is not a CallExpression, so scripts/i18n-report.mjs, -positional-audit and
 *       -two-branch-audit counted none of it and all three printed 100 %.
 *  135 user-visible strings were in that state — layer names, weather descriptions, statistics
 *  indicator names, evacuation-zone names, legend titles.
 *
 *  ⚠ THE ANSWER IS NOT «TRANSLATE THEM», IT IS «STOP THE SHAPE EXISTING». `IntMapLang.pickArgs()`
 *  returns the array it is given, so `LA('Temperature 2 m (ECMWF)', '気温…', …)` is the same data
 *  AND an ordinary call site — the existing instruments pick it up with no edit at all, because
 *  their rule is «an identifier bound to IntMapLang.pick…». `L.arr(x.label)` resolves it through
 *  `pick()` itself, so there is one fallback rule in the app rather than two.
 *
 *  So what this file looks for is the SHAPE COMING BACK, in the two ways it can:
 *    · application code reading `IntMapLang.index(…)` — the only reason to want the index is to
 *      subscript a tuple, and the registry is the only place that should own it;
 *    · a private language→position map (`{jp:0,en:1,de:2,ru:3}`), which is a second copy of the
 *      language ORDER and therefore names a fixed set of languages for ever.
 *  Both are syntax, not strings, so a comment quoting one cannot trip it ([[intmap-recurring-lessons]] E).
 *
 *      node scripts/i18n-positional-array-audit.mjs          # human
 *      node scripts/i18n-positional-array-audit.mjs --json   # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
/* the registry IS the owner of the index and of the language order — it is the one file allowed
   to write either of them down. */
const OWNER = new Set(['lang-registry.js']);
/* the codes that make an object literal a language map rather than an ordinary lookup */
const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans', 'zh-hant']);

const hits = [];
for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
  if (OWNER.has(f)) continue;
  const src = readFileSync(join(JS, f), 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (e) {
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
    catch (e2) { continue; }
  }
  walk.simple(ast, {
    /* ① `IntMapLang.index(…)` outside the registry */
    CallExpression(n) {
      const c = n.callee;
      if (c && c.type === 'MemberExpression' && !c.computed && c.property && c.property.name === 'index'
        && /IntMapLang$/.test(src.slice(c.object.start, c.object.end))) {
        hits.push({ file: f, line: n.loc.start.line, kind: 'index',
          text: src.slice(n.start, Math.min(n.end + 40, src.length)).split('\n')[0] });
      }
    },
    /* ② a private language→position map */
    ObjectExpression(n) {
      const props = n.properties.filter((p) => p.type === 'Property' && !p.computed);
      if (props.length < 3 || props.length !== n.properties.length) return;
      let codes = 0;
      for (const p of props) {
        const k = p.key.type === 'Identifier' ? p.key.name
          : (p.key.type === 'Literal' ? String(p.key.value) : null);
        if (k == null || !CODES.has(k)) return;
        if (!(p.value.type === 'Literal' && typeof p.value.value === 'number')) return;
        codes++;
      }
      if (codes >= 3) {
        hits.push({ file: f, line: n.loc.start.line, kind: 'order-map',
          text: src.slice(n.start, Math.min(n.end, n.start + 90)) });
      }
    },
  });
}

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ hits }));
} else {
  console.log('\nIntMap · positional-array audit — a tuple of translations must be a CALL  (#R241)\n');
  if (!hits.length) {
    console.log('  ✓ no language index and no private language-order map outside js/lang-registry.js');
  } else {
    for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
    console.log(`\n  ${hits.length} site(s). Write the tuple as a call instead:`);
    console.log("      const LA = window.IntMapLang.pickArgs();     // once per scope");
    console.log("      label: LA('English','日本語','Deutsch','Русский','Español')");
    console.log("      …and resolve it with L.arr(x.label), which is pick() itself.\n");
  }
  process.exit(hits.length ? 1 : 0);
}
