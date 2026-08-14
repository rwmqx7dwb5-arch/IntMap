#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE READING PAGES, AUDITED   (#R239)
 * ----------------------------------------------------------------------------
 *  「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまで
 *    たっても言語対応の漏れが見つかることは許されない。」
 *
 *  ⚠⚠⚠ WHY THIS FILE EXISTS. `scripts/i18n-report.mjs` has printed a per-language percentage since
 *  #R221 and it was read, every round since, as «how translated is this language». It is not. It
 *  measures TWO surfaces — the keyed `ui` table and the inline `L(…)` strings — and there is a
 *  third, which no instrument in this repository has ever looked at:
 *
 *      js/locales/pages.<code>.js   — the whole of sources.html and science.html
 *
 *  Measured the first time this script was run: `pages.fr.js` and `pages.ko.js` DO NOT EXIST, so a
 *  French or Korean reader who opens 「データの出典」 gets an English document; and `pages.zh-hant.js`
 *  (from which zh-Hans is generated) carries the titles, the nav labels and the section headings and
 *  **not one `blocks` array** — i.e. every paragraph, table, equation and caveat of both pages, in
 *  English, for both Chinese locales, while every instrument in the project reported 100 %.
 *
 *  That is [[intmap-recurring-lessons]] B — 「計器の『100%』は、その計器が見ている範囲の100%」 — for
 *  the fourth time, and the answer is not another round of hand-checking. It is this: a surface that
 *  can hold a translation gets an instrument, and every instrument answers to one gate
 *  (`scripts/i18n-audit.mjs --gate`).
 *
 *  ══ WHAT «COVERED» MEANS HERE ════════════════════════════════════════════════════════════════
 *  A document is a tree of objects, arrays and strings (see js/page-i18n.js for the shape). Every
 *  STRING in the English document has a PATH — `sources.sections[3].blocks[2][1]` — and a language
 *  covers that path when its own document has a string there. Membership, not a size ratio: that is
 *  the same rule #R231 had to rewrite i18n-report.mjs to use after a table with MORE entries than
 *  there were live strings reported 100 % while five of them were missing.
 *
 *      node scripts/i18n-pages-audit.mjs                 # every language, one line each
 *      node scripts/i18n-pages-audit.mjs --json          # the same, for scripts/i18n-audit.mjs
 *      node scripts/i18n-pages-audit.mjs --missing ko    # the paths ko has no string for
 *      node scripts/i18n-pages-audit.mjs --template ko   # write js/locales/pages.ko.js to translate
 * ==========================================================================*/
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');

/* ⚠ THE LANGUAGE LIST IS THE ONE THE APP USES, AND IT IS THE ui.* FILES — not a literal here and
   not the set of pages.* files. A language with no pages file is exactly the defect this measures,
   so deriving the list from the pages directory would make that defect invisible (the instrument
   would report «100 % of the languages that have a file»). js/page-i18n.js reads
   IntMapLang.list() → js/locales/_langs.js → the ui.* files, so this reads the same list.
   ⚠ AND THE SUFFIX IS THE BCP-47 TAG, NOT THE APP CODE: the app's `jp` is the page's `ja`, and
   `zh` is `zh-hant`. That mapping lives in js/lang-registry.js (`html`), which is what _langs.js is
   generated from; it is read here rather than re-typed. */
export function pageCodes() {
  const src = readFileSync(join(ROOT, 'js', 'lang-registry.js'), 'utf8');
  const out = [];
  const re = /\{\s*code:\s*'([^']+)'\s*,\s*label:\s*'[^']*'\s*,\s*html:\s*'([^']+)'/g;
  let m; while ((m = re.exec(src))) out.push({ code: m[1], html: m[2].toLowerCase() });
  /* the registry only spells out the rows that need an explicit label/tag; every other language is
     one ui.* file whose code IS its tag (js/lang-registry.js derives it). */
  const known = new Set(out.map((r) => r.code));
  const langs = JSON.parse(
    /window\.IntMapLangCodes\s*=\s*(\[[^\]]*\])/.exec(readFileSync(join(LOCALES, '_langs.js'), 'utf8'))[1]);
  for (const c of langs) if (!known.has(c)) out.push({ code: c, html: c });
  return out.filter((r) => langs.includes(r.code));
}

/* ── the document, as a set of string paths ─────────────────────────────────────────────────── */
/* ⚠ PARSED, NOT EVALUATED. These files are browser scripts that call into a global; running them in
   node would need a fake window and would execute whatever the file happens to contain. acorn reads
   the literal that `define()` is called with, which is all this needs and cannot run anything. */
export function pageDoc(html) {
  const p = join(LOCALES, `pages.${html}.js`);
  if (!existsSync(p)) return null;
  const ast = parse(readFileSync(p, 'utf8'), { ecmaVersion: 2022 });
  let obj = null;
  const findDefine = (node) => {
    if (!node || typeof node !== 'object' || obj) return;
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression'
      && node.callee.property && node.callee.property.name === 'define'
      && node.arguments.length === 2 && node.arguments[1].type === 'ObjectExpression') { obj = node.arguments[1]; return; }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(findDefine);
      else if (v && typeof v === 'object' && v.type) findDefine(v);
    }
  };
  findDefine(ast);
  if (!obj) return null;
  const out = new Map();                      /* path → string */
  const walkNode = (n, path) => {
    if (!n) return;
    if (n.type === 'ObjectExpression') {
      for (const pr of n.properties) {
        if (pr.type !== 'Property') continue;
        const k = pr.key.name != null ? pr.key.name : pr.key.value;
        walkNode(pr.value, path ? `${path}.${k}` : String(k));
      }
    } else if (n.type === 'ArrayExpression') {
      n.elements.forEach((el, i) => walkNode(el, `${path}[${i}]`));
    } else if (n.type === 'Literal' && typeof n.value === 'string') {
      out.set(path, n.value);
    } else if (n.type === 'TemplateLiteral' && n.expressions.length === 0) {
      out.set(path, n.quasis.map((q) => q.value.cooked).join(''));
    }
  };
  walkNode(obj, '');
  return out;
}

/* ⚠ THE STRUCTURAL TAGS ARE NOT TRANSLATABLE AND ARE NOT COUNTED AS WORK. A block is
   `['p', html]` / `['table', [head…], [[cell…]…]]`, so element 0 of a block array is the block's
   KIND — 'p', 'ul', 'eq', 'lim', 'note', 'table', 'slot', 'tagline', 'h3'. It has to be identical
   in every language or the page renders the wrong thing, so it is required to be PRESENT (a
   missing tag is a broken document) but it is never counted as a string somebody has to translate.
   The same is true of `sections[i].id`, which is the anchor in the URL. */
/* ⚠ AND A `slot` CARRIES AN ID, NOT PROSE. `['slot', 'src-panel']` names a hole the page fills in
   itself (js/page-i18n.js), and `sections[i].count` names another one; translating either would
   leave the page looking for an element that no longer exists. They are identifiers in a string's
   clothing, so they are structural — which is why this function needs the whole document rather
   than one string to answer. */
/* ⚠⚠⚠ AND A FORMULA IS NOT PROSE. `['tex', 'h = (R·256 + G + B/256) − 32768']` is LaTeX and
   `['eq', …]` is its plain-text form; both are the same in every language, so counting them as work
   would demand that a translator change mathematics. They are structural too. */
const TAGS = new Set(['tagline', 'p', 'h3', 'ul', 'eq', 'tex', 'lim', 'note', 'table', 'slot']);
const VERBATIM = new Set(['slot', 'tex', 'eq']);

/* ⚠ THE HANDFUL OF STRINGS THAT ARE THE SAME WORD IN EVERY LANGUAGE. Same idea, and the same rule,
   as the NEUTRAL list in scripts/i18n-positional-audit.mjs: every entry here was READ once and is a
   claim that the word is right, not a way to quiet the gate. `z` is a zoom symbol, `~10 m` is a
   measurement, and «Tsunami» is the German and Spanish word as well as the English one. */
export const NEUTRAL = new Set(['z', '~10 m', '~54 m', '~860 m', 'Tsunami']);
export function isStructural(path, value, doc) {
  if (/\.sections\[\d+\]\.(id|count)$/.test(path)) return true;
  const m = /^(.*\.blocks\[\d+\])\[(\d+)\]$/.exec(path);
  if (!m) return false;
  if (m[2] === '0') return TAGS.has(value);
  if (m[2] === '1' && doc && doc.get && VERBATIM.has(doc.get(m[1] + '[0]'))) return true;
  /* element 1 of a slot block is the slot's id */
  if (m[2] === '1' && doc && doc.get && doc.get(m[1] + '[0]') === 'slot') return true;
  return false;
}

function main() {
  const en = pageDoc('en');
  if (!en) { console.error('js/locales/pages.en.js is missing or unparsable'); process.exit(2); }
  const enPaths = [...en.keys()];
  const work = enPaths.filter((k) => !isStructural(k, en.get(k), en));

  const wantMissing = process.argv.indexOf('--missing');
  if (wantMissing >= 0) {
    const html = process.argv[wantMissing + 1];
    const doc = pageDoc(html) || new Map();
    const needsWork = (v) => /\p{L}/u.test(String(v)) && !NEUTRAL.has(String(v).trim());
    const gaps = work.filter((k) => !doc.has(k) || (needsWork(en.get(k)) && doc.get(k) === en.get(k)));
    console.error(`${html}: ${gaps.length} of ${work.length} translatable strings have no entry`);
    for (const k of gaps) console.log(k + '\t' + JSON.stringify(en.get(k)));
    return;
  }

  /* ⚠ THE TEMPLATE IS THE ENGLISH FILE WITH ITS `define` CODE CHANGED AND NOTHING ELSE. Rebuilding
     the document from the parsed paths would re-emit the tree in this script's formatting and lose
     every comment in it; a translator wants the file they will actually edit. */
  const wantTemplate = process.argv.indexOf('--template');
  if (wantTemplate >= 0) {
    const html = process.argv[wantTemplate + 1];
    if (!html || !/^[a-z]{2}(-[a-z]+)?$/.test(html)) { console.error('usage: --template <bcp47>'); process.exit(1); }
    const p = join(LOCALES, `pages.${html}.js`);
    if (existsSync(p)) { console.error(`${p} already exists — refusing to overwrite a translation`); process.exit(1); }
    const src = readFileSync(join(LOCALES, 'pages.en.js'), 'utf8');
    const head = `/* ============================================================================\n`
      + ` *  IntMap · Reading pages — ${html}   (template written by scripts/i18n-pages-audit.mjs)\n`
      + ` * ----------------------------------------------------------------------------\n`
      + ` *  TRANSLATE THE STRINGS, NOT THE STRUCTURE. Block kinds ('p', 'ul', 'table', …) and section\n`
      + ` *  ids are the document's shape and must stay byte-identical; everything else is prose.\n`
      + ` *  A key left in English falls back to English at run time, per key, so this file can be\n`
      + ` *  delivered a section at a time — and \`node scripts/i18n-pages-audit.mjs --missing ${html}\`\n`
      + ` *  prints exactly what is left.\n`
      + ` * ========================================================================== */\n`;
    const body = src.slice(src.indexOf("window.IntMapPageI18N=window.IntMapPageI18N") >= 0
      ? src.indexOf('window.IntMapPageI18N=window.IntMapPageI18N')
      : src.indexOf('window.IntMapPageI18N.define'));
    writeFileSync(p, head + body.replace(/\.define\('en',/, `.define('${html}',`));
    console.log(`wrote ${p} — ${work.length} strings to translate`);
    return;
  }

  /* ══ ⚠⚠⚠ COVERED MEANS TRANSLATED, NOT MERELY PRESENT ═══════════════════════════════════════
     The first cut of this file counted a path as covered when the target document HAD a string
     there. That is the right rule for a table whose rows are added one at a time, and it is the
     WRONG rule here, because scripts/i18n-pages-apply.mjs seeds a new language from the ENGLISH
     document — so the instant pages.fr.js existed it reported 333/333, with 276 English sentences
     in it. An instrument that says «done» about untouched English is the exact defect this whole
     round is about ([[intmap-recurring-lessons]] B), and it was one command away from shipping.
     ⚠ SO THE TEST IS «DIFFERENT FROM ENGLISH», with one narrow exemption: a string with no letters
     in it at all (a number, a symbol, a bare year range) is the same in every language and is
     counted as done. Formulas and slot ids never reach here — they are structural, above. */
  const needsWork = (v) => /\p{L}/u.test(String(v)) && !NEUTRAL.has(String(v).trim());
  const rows = pageCodes().map(({ code, html }) => {
    const doc = pageDoc(html);
    const have = doc ? work.filter((k) => doc.has(k)
      && (code === 'en' || !needsWork(en.get(k)) || doc.get(k) !== en.get(k))).length : 0;
    return { code, html, file: !!doc, have, want: work.length };
  });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ surface: 'pages', want: work.length, rows }));
    return;
  }
  console.log(`reading-page strings in js/locales/pages.en.js: ${work.length}`
    + ` (+${enPaths.length - work.length} structural)\n`);
  for (const r of rows) {
    console.log(`${r.code.padEnd(8)} pages.${r.html}.js`.padEnd(30)
      + (r.file ? `${String(r.have).padStart(4)}/${r.want}  ${(100 * r.have / r.want).toFixed(1)}%`
        : '   —  FILE DOES NOT EXIST (the whole of both pages renders in English)'));
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/i18n-pages-audit.mjs')) main();
