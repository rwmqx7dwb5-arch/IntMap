#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DOES THE FILE LEDGER STILL DESCRIBE THE FILES THAT EXIST?  (#R236)
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

/* (#R280) THE LEDGER MOVED OUT OF Architecture.md. §3 was 399 of its 1,918 lines — a quarter of
   the spec was a table of contents for js/ — so it is docs/FILES.md now, keeping the SAME section
   numbers (§3.1…§3.13) so every `§3.x` reference in the other documents still resolves. What this
   file measures did not change; only where it reads it from. */
const DOC = 'docs/FILES.md';
const doc = readFileSync(join(ROOT, DOC), 'utf8');

/* the ledger is the whole file below its own §3.1 heading */
const start = doc.indexOf('### 3.1');
if (start < 0) { console.error(DOC + ': the §3.1 heading is gone — this check needs rewriting'); process.exit(1); }
const section = doc.slice(start);

/* (#R694) WHICH LINES ARE `js/` DECLARATIONS IS A QUESTION ABOUT THE LEDGER'S STRUCTURE, NOT
   ABOUT SPELLING. This used to read every «name.js» at the start of a line anywhere below §3.1
   and then subtract the ones it could recognise as belonging somewhere else — the src/ and
   scripts/ directories, plus a hand-written `sw|admin|vite.config|playwright|_.*` list for the
   root files in §3.1. Two things were wrong with that, and both were felt:

     · The subtraction is a list of cases somebody thought of. §3.12 describes `supabase/`, and
       the moment the `_shared/` roster there wrapped onto a line beginning `radiation-sources.js`
       the check read it as a js/ module and went red on a CORRECT document. The roster could
       only be line-wrapped at the five names that happen to also exist in js/ — a formatting
       constraint leaking out of a checker, which is how you know the checker is measuring the
       wrong thing (.agents/rules/no-ad-hoc-hardcoding.md §1).
     · It is silent in the other direction too: a js/ module described ONLY in the supabase or
       docs block counted as described.

   §3 already says which directory each block is about — that is what its headings ARE:
   «### 3.4 `js/` — 地図の表面», «### 3.12 `supabase/` / `docs/` / …». So ask the heading.
   A block declares js/ when `js/` is one of the backticked paths in its own heading; §3.1
   (ルート), §3.2 (css/, src/, fonts/), §3.11 (data/) and §3.12 (supabase/, …) declare other
   directories and are not this check's business. With that, all three excuse-lists go away and
   the answer is unchanged: 284 described, 284 present, nothing missing and nothing stale. */
const DIR = 'js/';
const blocks = section.split(/^(?=### )/m);
const declaresJs = (block) => {
  const heading = block.slice(0, block.indexOf('\n') + 1 || undefined);
  return [...heading.matchAll(/`([A-Za-z0-9_./-]+\/)`/g)].some((m) => m[1] === DIR);
};
const owned = blocks.filter(declaresJs);
if (!owned.length) {
  console.error(DOC + `: no §3 block declares \`${DIR}\` in its heading — this check needs rewriting`);
  process.exit(1);
}

/* within a block that declares js/, a listed module is a bare filename at the start of a line,
   at any indent — descriptions wrap onto continuation lines */
const listed = new Set();
for (const block of owned) for (const m of block.matchAll(/^[ \t]*([A-Za-z0-9_.-]+\.js)\b/gm)) listed.add(m[1]);

const actual = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));

const missing = actual.filter((f) => !listed.has(f)).sort();
const stale = [...listed].filter((f) => !actual.includes(f)).sort();

console.log(DOC + ' — modules described: ' + listed.size + ' · js/ holds ' + actual.length);
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
  console.error('\n✖ ' + DOC + ' is out of sync with js/ — describe the new files, or remove the gone ones.');
  process.exit(1);
}
