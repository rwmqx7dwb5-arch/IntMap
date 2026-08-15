#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE ELEVENTH SHAPE — a translation tuple held as an OBJECT   (#R244)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ WHY THERE WAS STILL SOMETHING TO FIND, FOR THE ELEVENTH TIME ═══════════════════════════════
 *  #R241 found translations held as an ARRAY subscripted by the language's position, and closed it:
 *  `IntMapLang.pickArgs()` makes the tuple a CALL, and every existing instrument reads calls. The
 *  audit it left behind (scripts/i18n-positional-array-audit.mjs) watches for the shape coming back
 *  in the two ways an ARRAY can come back — a private language→POSITION map, and `IntMapLang.index()`
 *  outside the registry. Its language-map test requires the values to be NUMBERS, because a position
 *  map is what it is about.
 *
 *  So the sibling shape walked straight past it:
 *
 *      nm: { en:'Tibet', jp:'チベット', de:'Tibet', ru:'Тибет', es:'Tíbet' }      …read as  nm[lg] || nm.en
 *
 *  A tuple of translations keyed by LANGUAGE CODE instead of by position. Measured this round:
 *  678 such objects in 24 files — historical country names on the time axis, World Bank indicator
 *  names, widget names and descriptions, ocean-current names, the same-name place disambiguations
 *  Atlas prints, the news language list. Every one of them:
 *    ① is invisible to every instrument — an object literal is not a CallExpression, so the inline
 *       report, the positional audit, the two-branch audit and the helper audit all count ZERO of it
 *       and print 100 %;
 *    ② has NO inline-table fallback — `nm[lg] || nm.en` is English for any language the object does
 *       not name, whatever that language's ui.<code>.js says;
 *    ③ and most of them name four or five languages, so fr / ko / zh / zh-Hans (and often es) were
 *       English for ever, by construction.
 *
 *  ⚠ THE ANSWER IS THE SAME ONE #R241 FOUND, ONE SHAPE UP: STOP THE SHAPE EXISTING. Written as
 *  `LA('Tibet','チベット','Tibet','Тибет','Tíbet')` — `IntMapLang.pickArgs()`, which returns the array
 *  it was given — the same data becomes an ordinary call site, the report and the positional audit
 *  pick it up with no edit, and `L.arr(x)` resolves it through `pick()` itself, so a language past
 *  the arguments gets the inline table keyed by the English string like every other call site.
 *
 *  ⚠ AND THIS FILE IS WHAT STOPS IT COMING BACK. It is syntax, not strings, so a comment quoting one
 *  cannot trip it ([[intmap-recurring-lessons]] E), and it is a SURFACE of the one gate
 *  (scripts/i18n-audit.mjs) rather than a twelfth free-standing percentage — that mistake is what
 *  #R239's own header is about.
 *
 *      node scripts/i18n-langmap-audit.mjs           # the list
 *      node scripts/i18n-langmap-audit.mjs --json    # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
/* the registry owns the language list; the locale files ARE the tables this is about */
const SKIP = /(^|\/)lang-registry\.js$|(^|\/)locales\//;
const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans', 'zh-hant']);

/* ⚠ A LANGUAGE-KEYED MAP OF CODES IS NOT A TRANSLATION. `{jp:'JPY',ko:'KRW',de:'EUR'}` is which
   currency to format a price in for a reader of that language, and `{jp:'JP',ko:'KR'}` is a region
   for `Intl`; neither is prose and translating them would be the defect. The rule is the one #R243
   wrote for the helper-ternary conversion: what makes a value PROSE is that it is not a bare ASCII
   token. A value with a space, a non-ASCII letter, or more than eight characters is prose; a short
   all-caps/all-lowercase ASCII token is a code. */
const CODEY = /^[A-Za-z][A-Za-z0-9_.-]{0,7}$/;
/* …and a per-language URL or query fragment is a code too: js/news-feed.js keys Google News's
   `hl=…&gl=…&ceid=…` triple by the reader's language, which is a locale SELECTOR, not a sentence.
   No whitespace anywhere plus a `=` / `&` / `?` is what tells the two apart. */
const URLISH = /^[^\s]*[=&?][^\s]*$/;
const isProse = (v) => !CODEY.test(v) && !URLISH.test(v);

const files = [];
(function walkDir(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDir(join(dir, e.name), rel + e.name + '/');
    else if (e.name.endsWith('.js')) files.push([join(dir, e.name), rel + e.name]);
  }
})(JS, 'js/');

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
  walk.simple(ast, {
    ObjectExpression(n) {
      /* ⚠ THE TUPLE DOES NOT HAVE TO BE THE WHOLE OBJECT. js/atlas-console.js's same-name place table
         is `{en:'Georgia (the country)', jp:'ジョージア（国）', lng:43.4, lat:42.2}` — two translations
         and two coordinates in one literal, read as `o.jp` or `o.en`. A rule that demanded EVERY
         property be a language code would call that clean and it is the same defect: fr/ko/zh see
         the English. So the test is on the language-coded properties alone, and the rest of the
         object is none of this instrument's business. (This is the «what is the worst way to be
         green under my own rule» step #R239 made standing — the first draft of this file was green
         on that table.) */
      const props = n.properties.filter((p) => p.type === 'Property' && !p.computed);
      const langs = [];
      const vals = [];
      for (const p of props) {
        const k = p.key.type === 'Identifier' ? p.key.name
          : (p.key.type === 'Literal' ? String(p.key.value) : null);
        if (k == null || !CODES.has(String(k).toLowerCase())) continue;
        if (!(p.value.type === 'Literal' && typeof p.value.value === 'string')) continue;
        langs.push(String(k).toLowerCase());
        vals.push(p.value.value);
      }
      if (langs.length < 2) return;
      if (!vals.some(isProse)) return;                    /* a map of codes, not of prose */
      hits.push({
        file: rel, line: n.loc.start.line,
        langs: langs.slice().sort().join(','),
        text: src.slice(n.start, Math.min(n.end, n.start + 96)).replace(/\s+/g, ' '),
      });
    },
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

console.log('\nIntMap · language-keyed OBJECT audit — a tuple of translations must be a CALL  (#R244)\n');
if (!hits.length) {
  console.log('  ✓ no translation tuple is held as an object keyed by language code.\n');
  process.exit(0);
}
if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.langs}]  ${h.text}`);
  console.log('');
}
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\n  ${hits.length} object(s) in ${byFile.size} file(s). Write the tuple as a call instead:`);
console.log("      const LA = window.IntMapLang.pickArgs();     // once per scope");
console.log("      nm: LA('Tibet','チベット','Tibet','Тибет','Tíbet')");
console.log('      …and resolve it with L.arr(x.nm), which is pick() itself, so fr/ko/zh reach the inline table.\n');
process.exit(1);
