#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DOES Architecture.md §3 STILL DESCRIBE THE FILES THAT EXIST?  (#R236)
 * ----------------------------------------------------------------------------
 *  「Architecture.mdやDEVNOTES.md等のmd、方針や記録系ファイルが増大してきており、
 *    また現状にそぐわない記述が増加しており」
 *
 *  §3 is a hand-written list of every file and what it is for. It is the most
 *  useful section in the document and the one that rots fastest: a file split,
 *  renamed or added leaves the list silently wrong, and nothing notices. When
 *  this check was first written, §3 described 122 modules and js/ held 139 —
 *  seventeen files the specification had never heard of.
 *
 *  ⚠ THIS DOES NOT GENERATE §3, AND DELIBERATELY SO. What each file is FOR is a
 *  judgement a person makes; only the question «is every file still listed, and
 *  does every listed file still exist» is mechanical. So the prose stays
 *  hand-written and this refuses to let it drift out of step with the directory.
 *
 *      node scripts/arch-files-check.mjs           # report
 *      node scripts/arch-files-check.mjs --check   # exit 1 if out of sync (CI)
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const doc = readFileSync(join(ROOT, 'Architecture.md'), 'utf8');

/* §3 runs from its own heading to the next top-level heading */
const start = doc.indexOf('## 3. ファイル構成');
if (start < 0) { console.error('Architecture.md: §3 not found'); process.exit(1); }
const after = doc.indexOf('\n## ', start + 1);
const section = doc.slice(start, after < 0 ? doc.length : after);

/* a listed module is a bare filename at the start of a line, at any indent — the
   list nests (js/ then the file), and descriptions wrap onto continuation lines */
const listed = new Set();
for (const m of section.matchAll(/^[ \t]*([A-Za-z0-9_.-]+\.js)\b/gm)) listed.add(m[1]);

const actual = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));

const missing = actual.filter((f) => !listed.has(f)).sort();
/* only complain about names that look like they were meant to be js/ modules —
   §3 also mentions src/ and scripts/ files, which are not this directory's job */
const srcDir = new Set(readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')));
const scriptsDir = new Set(readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')));
const stale = [...listed].filter((f) => !actual.includes(f) && !srcDir.has(f) && !scriptsDir.has(f)
  && !/^(sw|admin|vite\.config|playwright[.a-z]*|_.*)\.js$/.test(f)).sort();

console.log('Architecture.md §3 — modules described: ' + listed.size + ' · js/ holds ' + actual.length);
if (missing.length) {
  console.log('\n' + missing.length + ' file(s) in js/ that §3 does not describe:');
  missing.forEach((f) => console.log('  + ' + f));
}
if (stale.length) {
  console.log('\n' + stale.length + ' name(s) §3 describes that no longer exist:');
  stale.forEach((f) => console.log('  - ' + f));
}
if (!missing.length && !stale.length) console.log('\n✓ §3 is in sync with js/');

if (CHECK && (missing.length || stale.length)) {
  console.error('\n✖ Architecture.md §3 is out of sync with js/ — describe the new files, or remove the gone ones.');
  process.exit(1);
}
