#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ADDING A LANGUAGE, IN ONE COMMAND   (#R239)
 * ----------------------------------------------------------------------------
 *  「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまで
 *    たっても言語対応の漏れが見つかることは許されない。」
 *
 *  ⚠⚠ WHAT WENT WRONG THE LAST FOUR TIMES A LANGUAGE WAS ADDED. Nothing was forgotten by anyone:
 *  the SKELETON a new language started from was smaller than the language. `--template` in
 *  scripts/i18n-report.mjs writes the keyed table as ui.en.js has it and the inline table as the
 *  L(…) sites have it — two surfaces of four. It does not know about the ~170 keyed strings six
 *  other files add at run time (scripts/i18n-keyed-audit.mjs), and it does not know the reading
 *  pages exist at all (scripts/i18n-pages-audit.mjs). So French and Korean were added in #R232 with
 *  a skeleton that could reach at most 63 % of the keyed table and 0 % of sources.html /
 *  science.html — and every instrument said they were fine, because each measured its own half.
 *
 *  ⚠ SO THIS WRITES EVERY FILE THE GATE WILL ASK FOR, AND THE GATE IS THE DEFINITION OF DONE:
 *      js/locales/ui.<code>.js      keyed table (the WHOLE universe) + inline table
 *      js/locales/pages.<tag>.js    both reading pages
 *      js/locales/_langs.js         regenerated (scripts/i18n-langs.mjs)
 *  Every value starts as the English one, so the language is live and readable from the first
 *  commit and gets better per string — js/i18n.js falls back per key, never per screen.
 *
 *      node scripts/i18n-new-language.mjs it            # Italian, tag `it`
 *      node scripts/i18n-new-language.mjs pt pt-BR      # code `pt`, reading-page tag `pt-BR`
 *  then
 *      node scripts/i18n-audit.mjs --todo it            # exactly what is left, as commands
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { survey } from './i18n-keyed-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');
const ESC = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

const code = (process.argv[2] || '').toLowerCase();
const tag = (process.argv[3] || code).toLowerCase();
if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(code)) {
  console.error('usage: node scripts/i18n-new-language.mjs <code> [bcp47-tag]');
  process.exit(1);
}
const uiPath = join(LOCALES, `ui.${code}.js`);
const pgPath = join(LOCALES, `pages.${tag}.js`);
if (existsSync(uiPath)) { console.error(`${uiPath} already exists — refusing to overwrite a translation`); process.exit(1); }

/* ── ① the keyed table — the whole universe, not just ui.en.js ──────────────────────────────── */
const { universe, english } = survey();

/* ── ② the inline table — every L(…) source string, from the one parser that finds them ─────── */
/* ⚠ SPAWNED, NOT RE-PARSED. scripts/i18n-report.mjs is the only thing in this repository that knows
   which identifiers in each file are language helpers; a second copy here would be the class of
   defect [[intmap-recurring-lessons]] G describes, and it would drift on the first round that adds
   a new helper spelling. */
const missing = execFileSync(process.execPath,
  [join(ROOT, 'scripts', 'i18n-report.mjs'), '--missing', code], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const head = `/* ============================================================================
 *  IntMap · UI STRINGS — ${code}   (skeleton written by scripts/i18n-new-language.mjs, #R239)
 * ----------------------------------------------------------------------------
 *  TRANSLATE THE VALUES, NOT THE KEYS. Every value below starts as the English one, so this
 *  language is already readable; js/i18n.js falls back PER KEY, so it improves one string at a
 *  time and never drops a reader into a half-English screen.
 *
 *  ⚠ THIS FILE IS THE WHOLE COST OF THE LANGUAGE IN THE APP. src/locale-boot.js globs
 *  js/locales/ui.*.js, so there is no registry row, no import line and no picker entry to add.
 *  The two reading pages are js/locales/pages.${tag}.js, written beside this one.
 *
 *  ⚠ AND «DONE» IS NOT A JUDGEMENT CALL:
 *      node scripts/i18n-audit.mjs --todo ${code}
 *      node scripts/i18n-audit.mjs --gate        # what CI runs
 * ========================================================================== */
window.IntMapLang.define('${code}', {
  /* ① the keyed table — ${universe.length} strings, gathered from EVERY file that declares one
     (js/locales/ui.en.js plus the six modules scripts/i18n-keyed-audit.mjs lists). */
  ui: {
`;
const uiRows = universe.map((k) => `    ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : ESC(k)}: ${ESC(english.get(k) ?? k)},`).join('\n');
const mid = `
  },
  /* ② the inline strings — every L(…) call site in js/*.js, keyed by its English source text. */
  inline: {
`;
writeFileSync(uiPath, head + uiRows + mid + missing.replace(/\s+$/, '') + '\n  }\n});\n');
console.log(`wrote ${uiPath}`);

/* ── ③ the reading pages ────────────────────────────────────────────────────────────────────── */
if (existsSync(pgPath)) console.log(`${pgPath} already exists — left alone`);
else {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-pages-audit.mjs'), '--template', tag], { stdio: 'inherit' });
}

/* ── ④ the generated language list the two static pages read ───────────────────────────────── */
execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-langs.mjs')], { stdio: 'inherit' });
console.log(`\nNext: translate the two files, then \`node scripts/i18n-audit.mjs --todo ${code}\`.`);
