#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE TWO-BRANCH AUDIT  —  the shape scripts/i18n-positional-audit.mjs cannot see
 * ----------------------------------------------------------------------------
 *  #R236 found three strings that were English in de/ru/es while the positional audit reported
 *  100 %, and its lesson was 「計器が緑なら、その計器が『何を見ていないか』を先に言え」. This is that
 *  instrument. The positional audit parses `L(…)` / `t(…)` CALL SITES and counts their arguments; a
 *  string written as
 *
 *      jp ? '取得できませんでした: ' : 'Could not load: '
 *
 *  is not a call site at all, so it is invisible to it — and every language except Japanese gets the
 *  English branch. Four rounds have now each found instances of this by hand (#R231's 281 hand-written
 *  ternaries, #R232's 40, #R236's 3); counting them is what stops the next round doing it again.
 *
 *  ⚠ IT DISTINGUISHES TEXT FROM CODES, because most two-branch ternaries on the language are CORRECT.
 *  `HOST.lang==='jp'?'ja':'en'` picks a Wikipedia subdomain, `'ja-JP':'en-US'` picks a date locale,
 *  `'ja':undefined` picks a collator — none of those are UI text and none of them should be five-way.
 *  A branch is treated as PROSE when it holds a space, a CJK character or a sentence mark, and the
 *  pair is only reported when at least one side is prose. That is a heuristic, and it is the reason
 *  this prints a LIST rather than a gate: the list is for a human to read.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== 'locales' && n !== 'node_modules') walk(p); }
    else if (n.endsWith('.js')) files.push(p);
  }
})(join(ROOT, 'js'));

/* a branch that a reader would READ, as opposed to a code a machine consumes.
   ⚠ NO LENGTH FLOOR ON CJK. The first cut required three characters and therefore did not see
   「軍用」「速力」「種別」 — fifteen real leaks, every one of them a two-character label, which is
   most of what a Japanese UI string IS. A single CJK character is prose. */
const CJK = /[぀-ヿ一-鿿]/;
const isProse = (s) => CJK.test(s) || (s.length > 2 && (/\s/.test(s) || /[.:：。、,!?…]/.test(s)));
/* …and the codes we know are codes, listed rather than inferred */
const isCode = (s) => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(s) || /^https?:/.test(s) || /^[a-z-]+$/.test(s);

/*  jp ? 'A' : 'B'   /   HOST.lang==='jp' ? 'A' : 'B'   — single-quoted branches only, which is what
    this codebase writes; a template literal branch is caught by the second pattern below. */
const PAT = /(?:HOST\.lang\s*===\s*'jp'|(?<![A-Za-z0-9_$])jp)\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;

let total = 0;
const hits = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = f.slice(ROOT.length).replace(/\\/g, '/');
  let m;
  PAT.lastIndex = 0;
  while ((m = PAT.exec(src))) {
    const [a, b] = [m[1], m[2]];
    /* the two branches being the SAME string is not a leak — it is a ternary that predates a
       translation and now says the same thing either way (「2023 EIU」, 「per km²」, an emoji) */
    if (a === b) continue;
    if (isCode(a) && isCode(b)) continue;
    if (!isProse(a) && !isProse(b)) continue;
    /* a line that is entirely a comment is documentation of the defect, not the defect */
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const line = src.slice(lineStart, src.indexOf('\n', m.index));
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
    const no = src.slice(0, m.index).split('\n').length;
    hits.push({ rel, no, a, b });
    total++;
  }
}

const byFile = new Map();
for (const h of hits) byFile.set(h.rel, (byFile.get(h.rel) || 0) + 1);

/* ⚠ (#R239) …AND IT IS A GATE NOW, WHICH IT REFUSED TO BE WHEN IT WAS WRITTEN. The note at the
   bottom of this file says 「going to zero is a project, not a commit」 — that was true of the 281
   sites #R231 found and the 65 #R237 found. It reached zero, and a count that has reached zero and
   is not held there simply climbs back. `--json` is what scripts/i18n-audit.mjs reads; that gate
   fails on anything above zero. */
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ surface: 'twobranch', total, files: byFile.size }));
  process.exit(0);
}

console.log('two-branch language ternaries carrying PROSE (de/ru/es/fr/ko/zh get the English branch)\n');
for (const [f, n] of [...byFile].sort((x, y) => y[1] - x[1])) console.log(String(n).padStart(5) + '  ' + f);
console.log('\ntotal: ' + total + ' site(s) in ' + byFile.size + ' file(s)');
if (process.argv.includes('--list')) {
  console.log();
  for (const h of hits) console.log(h.rel + ':' + h.no + '   jp=' + JSON.stringify(h.a) + '  en=' + JSON.stringify(h.b));
}
/* ⚠ NOT A GATE. `--gate` is deliberately not offered: the count is large and going to zero is a
   project, not a commit, and a gate that is switched off is worse than a number that is read. */
