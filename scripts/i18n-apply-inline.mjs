#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ONE DICTIONARY → THE THREE INLINE TABLES   (#R243)
 * ----------------------------------------------------------------------------
 *  scripts/i18n/*.json holds every string this repo has had to translate by hand since #R243, in
 *  ONE row per English string and SIX columns:
 *
 *      "English string": ["Deutsch", "Русский", "Español", "Français", "한국어", "繁體中文"]
 *
 *  The first three are ARGUMENTS at the call site (scripts/helper-ternary-codemod.mjs writes them
 *  into the source); the last three are ROWS in js/locales/ui.fr.js, ui.ko.js and ui.zh.js, because
 *  a language past the fifth is looked up by its English source string (js/lang-registry.js `pick`).
 *  ⚠ ui.zh-hans.js is NOT written here — it is generated from ui.zh.js by scripts/zh-hans.mjs, and
 *  this script runs that generator so the pair can never drift.
 *
 *  ⚠ IT ONLY EVER ADDS. The insertion goes through scripts/i18n-append-inline.mjs, which skips a key
 *  the file already has — see the ⚠⚠ note at the top of that file for the measured reason (the
 *  documented «regenerate from scratch» flow destroyed 205 translations the one time it was run).
 *
 *      node scripts/i18n-apply-inline.mjs
 * ==========================================================================*/
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT_DIR = join(ROOT, 'scripts', 'i18n');
const COLS = [{ code: 'fr', i: 3 }, { code: 'ko', i: 4 }, { code: 'zh', i: 5 }];

const all = Object.create(null);
for (const f of readdirSync(DICT_DIR).filter((n) => /^r\d+-[a-z]\.json$/.test(n)).sort()) {
  const j = JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8'));
  for (const k of Object.keys(j)) { if (k === '_') continue; all[k] = j[k]; }
}
const keys = Object.keys(all);
console.log(`scripts/i18n: ${keys.length} translated string(s) in ${readdirSync(DICT_DIR).filter((n) => /\.json$/.test(n)).length} file(s)`);

/* a row that is short, or has an empty cell, is a half-finished translation and must not ship */
const bad = keys.filter((k) => !Array.isArray(all[k]) || all[k].length !== 6 || all[k].some((v) => typeof v !== 'string' || !v.length));
if (bad.length) {
  console.error('✗ ' + bad.length + ' row(s) are not six non-empty strings:');
  bad.slice(0, 10).forEach((k) => console.error('    ' + JSON.stringify(k) + ' → ' + JSON.stringify(all[k])));
  process.exit(1);
}

for (const { code, i } of COLS) {
  const out = Object.create(null);
  for (const k of keys) out[k] = all[k][i];
  const tmp = join(tmpdir(), 'intmap-i18n-' + code + '.json');
  writeFileSync(tmp, JSON.stringify(out));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-append-inline.mjs'),
      join(ROOT, 'js', 'locales', 'ui.' + code + '.js'), tmp], { stdio: 'inherit' });
  } finally { try { unlinkSync(tmp); } catch (_) {} }
}
/* Simplified Chinese is DERIVED — regenerate it so ui.zh.js's new rows reach it */
execFileSync(process.execPath, [join(ROOT, 'scripts', 'zh-hans.mjs')], { stdio: 'inherit' });
console.log('\n✓ inline tables updated. `node scripts/i18n-audit.mjs --gate` is the check.');
