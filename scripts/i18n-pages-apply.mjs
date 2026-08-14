#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WRITE A READING-PAGE TRANSLATION, STRING BY STRING   (#R239)
 * ----------------------------------------------------------------------------
 *  The reading pages are a TREE, not a table, so `scripts/i18n-append-inline.mjs` cannot top them
 *  up: a translation has to land at the same path in the same shape or js/page-i18n.js renders the
 *  wrong block. This writes translations INTO a copy of the English document, at the exact source
 *  positions its own parser found them, so:
 *    · the structure is English's by construction — block kinds, section ids and array shapes
 *      cannot drift (which is exactly the defect this round found in de/ru/es: an `['eq', …]` block
 *      those three still carried after English replaced it with `['tex', …]`, so every later block
 *      in that section sat at a different index from its English twin);
 *    · an untranslated string simply stays English and js/page-i18n.js falls back on it per key;
 *    · a partial batch is safe and repeatable — run it as many times as there are sections.
 *
 *  ⚠ TRANSLATIONS ARE KEYED BY THE INDEX `--list` PRINTS, not by path: the paths are long and the
 *  order is the document's own reading order, so a translator works down a numbered list. The tool
 *  refuses an index it cannot match and prints what it expected, so a misaligned batch fails loudly
 *  instead of silently writing German into a Korean table cell.
 *
 *      node scripts/i18n-pages-apply.mjs --list                    # numbered English strings
 *      node scripts/i18n-pages-apply.mjs --list 40 80              # a slice of them
 *      node scripts/i18n-pages-apply.mjs fr batch.json             # {"0":"…","1":"…"} → pages.fr.js
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { isStructural } from './i18n-pages-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');

/* every string literal of the document, in source order, with its path and source range */
function leaves(src) {
  const ast = parse(src, { ecmaVersion: 2022 });
  let obj = null;
  const findDefine = (n) => {
    if (!n || typeof n !== 'object' || obj) return;
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression'
      && n.callee.property && n.callee.property.name === 'define'
      && n.arguments.length === 2 && n.arguments[1].type === 'ObjectExpression') { obj = n.arguments[1]; return; }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(findDefine);
      else if (v && typeof v === 'object' && v.type) findDefine(v);
    }
  };
  findDefine(ast);
  if (!obj) throw new Error('no IntMapPageI18N.define(...) call found');
  const out = [];
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
      out.push({ path, value: n.value, start: n.start, end: n.end });
    }
  };
  walkNode(obj, '');
  return out;
}

const enSrc = readFileSync(join(LOCALES, 'pages.en.js'), 'utf8');
const enAll = leaves(enSrc);
const enMap = new Map(enAll.map((l) => [l.path, l.value]));
const work = enAll.filter((l) => !isStructural(l.path, l.value, enMap));

const iList = process.argv.indexOf('--list');
if (iList >= 0) {
  const a = +(process.argv[iList + 1] || 0), b = +(process.argv[iList + 2] || work.length);
  work.slice(a, b).forEach((l, i) => console.log(`${a + i}\t${l.path}\t${JSON.stringify(l.value)}`));
  console.error(`${work.length} translatable strings (+${enAll.length - work.length} structural)`);
  process.exit(0);
}

const tag = process.argv[2];
const jsonPath = process.argv[3];
if (!tag || !jsonPath) { console.error('usage: i18n-pages-apply.mjs <bcp47-tag> <batch.json>  |  --list [from] [to]'); process.exit(2); }

const target = join(LOCALES, `pages.${tag}.js`);
/* ⚠ THE FILE STARTS AS ENGLISH, NOT AS AN EMPTY SHELL. A half-written document must still render —
   js/page-i18n.js falls back per key, so an English string here is the same thing a missing one
   would be, and the file is valid and complete at every point in the work. */
if (!existsSync(target)) {
  const head = `/* ============================================================================\n`
    + ` *  IntMap · Reading pages — ${tag}   (#R239)\n`
    + ` * ----------------------------------------------------------------------------\n`
    + ` *  Written string-by-string into a copy of pages.en.js by scripts/i18n-pages-apply.mjs, so the\n`
    + ` *  document's STRUCTURE is English's exactly — block kinds, section ids and array shapes cannot\n`
    + ` *  drift from the source. Anything still in English falls back to English at run time, per key.\n`
    + ` *      node scripts/i18n-pages-audit.mjs --missing ${tag}\n`
    + ` * ========================================================================== */\n`;
  const body = enSrc.slice(enSrc.indexOf('window.IntMapPageI18N'));
  writeFileSync(target, head + body.replace(/\.define\('en',/, `.define('${tag}',`));
  console.log(`created ${target} from the English document`);
}

const src = readFileSync(target, 'utf8');
const mine = leaves(src);
const mineWork = mine.filter((l, i) => !isStructural(l.path, enAll[i] ? enAll[i].value : l.value, enMap));
if (mineWork.length !== work.length) {
  console.error(`${target}: ${mineWork.length} translatable strings vs ${work.length} in English — structure has drifted, refusing to write`);
  process.exit(1);
}

const batch = JSON.parse(readFileSync(jsonPath, 'utf8'));
const edits = [];
for (const k of Object.keys(batch)) {
  const i = +k;
  if (!(i >= 0 && i < work.length)) { console.error(`index ${k} is out of range (0..${work.length - 1})`); process.exit(1); }
  edits.push({ i, start: mineWork[i].start, end: mineWork[i].end, text: batch[k] });
}
edits.sort((a, b) => b.start - a.start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + JSON.stringify(e.text) + out.slice(e.end);
writeFileSync(target, out);
/* re-parse, so a bad string can never be committed as a broken file */
try { leaves(out); } catch (e) { console.error('the result does not parse — ' + e.message); process.exit(1); }
console.log(`${target}: wrote ${edits.length} string(s)`);
