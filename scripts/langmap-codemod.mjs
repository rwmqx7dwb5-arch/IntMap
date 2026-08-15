#!/usr/bin/env node
/* ============================================================================
 *  IntMap · the #R244 codemod — a language-keyed OBJECT becomes a CALL
 * ----------------------------------------------------------------------------
 *  The mechanical half of the eleventh shape (see scripts/i18n-langmap-audit.mjs). It rewrites
 *
 *      ({en:'Map weather', jp:'地図中心の天気', de:'Karten-Wetter', ru:'…', es:'…'})[HOST.lang] || 'Map weather'
 *                                                     ↓
 *      window.IntMapLang.t(HOST.lang, 'Map weather', '地図中心の天気', 'Karten-Wetter', '…', '…')
 *
 *  which is byte-for-byte the form the lines around it already use — so the inline report and the
 *  positional audit read it with no edit, and fr / ko / zh / zh-Hans reach the inline table keyed by
 *  the English string instead of falling to `|| 'Map weather'` for ever.
 *
 *  ⚠ IT ONLY TOUCHES A SITE IT CAN COMPLETE. `t(lang, …)` is positional in en/jp/de/ru/es and the
 *  gate fails a call with fewer than five arguments, so a map that names only two or three languages
 *  is LEFT ALONE and listed: those need a translator, not a codemod, and half-converting them would
 *  turn a measured gap into a failing gate. Nothing here invents a translation.
 *
 *      node scripts/langmap-codemod.mjs            # what it would do
 *      node scripts/langmap-codemod.mjs --write    # …and do it
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const SKIP = /(^|\/)lang-registry\.js$|(^|\/)locales\//;
const ORDER = ['en', 'jp', 'de', 'ru', 'es'];      /* the positional slots `t()` reads */
/* ⚠ THE SAME PROSE TEST THE AUDIT USES, AND FOR THE SAME REASON. The first run of this codemod
   rewrote two maps that are not translations at all — Atlas's synonym table
   (`{english:'en', deutsch:'de', 'español':'es'}`, keyed by the word the READER TYPED, which the
   rewrite broke outright) and Google News's `hl=…&gl=…&ceid=…` locale triple — and the second put a
   URL query into the inline translation table. A codemod that cannot tell prose from a code has no
   business rewriting either. */
const CODEY = /^[A-Za-z][A-Za-z0-9_.-]{0,7}$/;
const URLISH = /^[^\s]*[=&?][^\s]*$/;
const isProse = (v) => !CODEY.test(v) && !URLISH.test(v);
const WRITE = process.argv.includes('--write');

const files = [];
(function walkDir(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDir(join(dir, e.name), rel + e.name + '/');
    else if (e.name.endsWith('.js')) files.push([join(dir, e.name), rel + e.name]);
  }
})(JS, 'js/');

let done = 0, skipped = 0;
const skips = [];
for (const [full, rel] of files) {
  if (SKIP.test(rel)) continue;
  let src = readFileSync(full, 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (e) {
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
    catch (e2) { continue; }
  }
  const edits = [];
  const mapOf = (obj) => {
    if (!obj || obj.type !== 'ObjectExpression') return null;
    const m = Object.create(null);
    for (const p of obj.properties) {
      if (p.type !== 'Property' || p.computed) return null;
      const k = p.key.type === 'Identifier' ? p.key.name : (p.key.type === 'Literal' ? String(p.key.value) : null);
      if (k == null) return null;
      if (!(p.value.type === 'Literal' && typeof p.value.value === 'string')) return null;
      m[k === 'ja' ? 'jp' : k] = p.value.raw;
      if (isProse(p.value.value)) m.__prose = true;
    }
    return m.__prose ? m : null;                    /* a map of codes is not a translation */
  };
  /* `<obj>[<lang>] || <fallback>` and the bare `<obj>[<lang>]` */
  const handle = (node, objNode, langNode, start, end) => {
    const m = mapOf(objNode);
    if (!m) return;
    const have = ORDER.filter((k) => m[k] != null);
    if (have.length < 2) return;
    if (have.length < ORDER.length) {
      skipped++; skips.push(`${rel}:${node.loc.start.line}  has ${have.join('/')} — needs ${ORDER.filter((k) => !m[k]).join('/')}`);
      return;
    }
    const lang = src.slice(langNode.start, langNode.end);
    edits.push({ start, end, text: `window.IntMapLang.t(${lang},${ORDER.map((k) => m[k]).join(',')})` });
    done++;
  };
  walk.simple(ast, {
    LogicalExpression(n) {
      if (n.operator !== '||') return;
      const l = n.left;
      if (l.type !== 'MemberExpression' || !l.computed) return;
      handle(n, l.object, l.property, n.start, n.end);
    },
    MemberExpression(n) {
      if (!n.computed || n.object.type !== 'ObjectExpression') return;
      handle(n, n.object, n.property, n.start, n.end);
    },
  });
  if (!edits.length) continue;
  /* an outer `||` edit and the inner MemberExpression edit overlap — keep the outer one */
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const keep = [];
  let last = -1;
  for (const e of edits) { if (e.start >= last) { keep.push(e); last = e.end; } else done--; }
  for (let i = keep.length - 1; i >= 0; i--) src = src.slice(0, keep[i].start) + keep[i].text + src.slice(keep[i].end);
  if (WRITE) writeFileSync(full, src);
  console.log(`${WRITE ? 'wrote' : 'would write'}  ${rel}  (${keep.length} site(s))`);
}
console.log(`\n${done} site(s) converted, ${skipped} left for a translator:`);
skips.slice(0, 60).forEach((s) => console.log('   ' + s));
if (skips.length > 60) console.log(`   …and ${skips.length - 60} more`);
