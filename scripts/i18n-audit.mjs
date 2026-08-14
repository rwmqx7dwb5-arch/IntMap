#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE ONE TRANSLATION GATE — every surface, every language   (#R239)
 * ----------------------------------------------------------------------------
 *  「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまで
 *    たっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ ⚠⚠⚠ WHY A ROUND KEEPS FINDING A NEW GAP ═════════════════════════════════════════════════
 *  Not because anyone forgot to translate. Because «translated» has never had ONE definition in
 *  this repository. Text that a reader sees lives in FIVE different shapes, each shape grew its own
 *  instrument at a different time, and each instrument printed a percentage of ITS OWN shape:
 *
 *    #R221  scripts/i18n-report.mjs           the keyed `ui` table + the inline `L(…)` table
 *    #R235  scripts/i18n-positional-audit     the five positional arguments at each L(…) site
 *    #R237  scripts/i18n-two-branch-audit     `jp ? '…' : '…'` — invisible to the one above
 *    #R239  scripts/i18n-pages-audit          js/locales/pages.*.js — sources.html + science.html
 *    #R239  this file, `html` below           data-i18n="…" keys that no ui table defines
 *
 *  Every one of them was, at the moment it was written, «the instrument». And every round, a reader
 *  found English on a screen while the instrument of the day printed 100 % — #R231 (281 hand-written
 *  ternaries), #R232 (40 positional sites), #R236 (3 sites in a shape the audit could not parse),
 *  #R239 (pages.fr.js and pages.ko.js DO NOT EXIST, and pages.zh-hant.js has not one paragraph of
 *  either page). That is [[intmap-recurring-lessons]] B four times over, and adding a sixth
 *  instrument would only guarantee a fifth time.
 *
 *  ⚠ SO THE ANSWER IS NOT ANOTHER INSTRUMENT. IT IS THAT THERE IS ONLY ONE ANSWER.
 *  This file spawns every instrument that exists, prints ONE matrix — language × surface — and
 *  `--gate` fails if any cell is short. It holds NO parser of its own for anything another file
 *  already measures ([[intmap-recurring-lessons]] G: two copies of one quantity means one of them
 *  is stale), and the language list comes from the locale directory, which is what the app itself
 *  reads. A new surface is added HERE, once, and every language is measured against it forever.
 *
 *  ⚠ AND ADDING A LANGUAGE IS ONE COMMAND: `node scripts/i18n-new-language.mjs <code>` writes every
 *  file this gate will ask for, so the answer to «what is left» is this gate rather than memory.
 *
 *      node scripts/i18n-audit.mjs             # the matrix
 *      node scripts/i18n-audit.mjs --gate      # …and exit 1 if anything is short (CI runs this)
 *      node scripts/i18n-audit.mjs --todo fr   # every command that would close fr's gaps
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';



const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');
const run = (f, ...a) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'scripts', f), '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const app = run('i18n-report.mjs');
const keyed = run('i18n-keyed-audit.mjs');
const pages = run('i18n-pages-audit.mjs');
const pos = run('i18n-positional-audit.mjs');
const two = run('i18n-two-branch-audit.mjs');
/* ══ ⚠⚠⚠ (#R240) THE SIXTH SURFACE — «is this string in the system at all» ═════════════════════════
   Every instrument above measures HOW MUCH OF THE TABLE a language has. None of them can see a
   string that was never given a key, and 49 of those were shipping: every `title`, `aria-label` and
   `placeholder` in index.html was a bare literal, i.e. English on nine languages while all five
   percentages read 100 %. That is 「まだある」, and it is a different question, so it is a new
   surface HERE rather than a sixth free-standing instrument. */
const attrs = run('i18n-attr-audit.mjs');
/* ══ ⚠⚠⚠ (#R241) THE SEVENTH SURFACE — «is this tuple of translations a CALL» ═══════════════════
   #R240 asked whether a string is in the system at all. This asks whether a tuple of translations
   is written in a shape any of the instruments above can READ. Six tables in js/ held theirs as a
   bare array subscripted by the language's position — 188 user-visible strings that every one of
   the audits counted as zero while printing 100 %, and that fr/ko/zh saw in English for ever
   because an `arr[i]||arr[0]` has no inline-table fallback. `IntMapLang.pickArgs()` makes the tuple
   a call site, at which point the report and the positional audit pick it up with no edit; this
   surface is what stops the shape coming back. Like the one above it is a NEW QUESTION, so it is a
   line in this gate rather than a seventh free-standing instrument (#R239's rule). */
const arrays = run('i18n-positional-array-audit.mjs');
const orphanKeys = keyed.undeclared;

const keyedBy = new Map(keyed.rows.map((r) => [r.code, r]));
const pageBy = new Map(pages.rows.map((r) => [r.code, r]));
const posBy = new Map(pos.rows.map((r) => [r.code, r]));

/* ── the matrix ─────────────────────────────────────────────────────────────────────────────── */
const rows = app.rows.map((r) => {
  const pg = pageBy.get(r.code) || { have: 0, want: pages.want, file: false };
  const ps = posBy.get(r.code);
  const kd = keyedBy.get(r.code) || { have: 0, want: keyed.want };
  return {
    code: r.code,
    /* ⚠ NOT `app.keyed` — that counts against js/locales/ui.en.js alone, and the keyed table is
       written in seven files (see scripts/i18n-keyed-audit.mjs). This is the whole universe. */
    keyed: [kd.have, kd.want],
    /* one of the two is `n/a` for every language, by construction: the first five carry their
       translations as ARGUMENTS at the call site, the rest carry them in an `inline` table. */
    inline: r.positional ? null : [r.inline, app.inlineWant],
    positional: ps ? [pos.sites - ps.same, pos.sites] : null,
    pages: [pg.have, pg.want],
    pagesFile: pg.file !== false,
  };
});

const pct = (p) => (p ? `${String(p[0]).padStart(5)}/${String(p[1]).padEnd(5)} ${(100 * p[0] / Math.max(1, p[1])).toFixed(1).padStart(5)}%` : '        n/a        ');
const shortOf = (r) => (r.keyed[0] < r.keyed[1]) || (r.inline && r.inline[0] < r.inline[1])
  || (r.positional && r.positional[0] < r.positional[1]) || (r.pages[0] < r.pages[1]);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, orphanKeys, twoBranch: two.total, shortSites: pos.short, unkeyedAttrs: attrs.total, positionalArrays: arrays.hits.length }));
  process.exit(0);
}

/* ── `--todo <code>`: the exact commands, so «what is left» is never a judgement call ────────── */
const wantTodo = process.argv.indexOf('--todo');
if (wantTodo >= 0) {
  const code = process.argv[wantTodo + 1];
  const r = rows.find((x) => x.code === code);
  if (!r) { console.error(`unknown language: ${code}`); process.exit(1); }
  const pg = pageBy.get(code);
  console.log(`# what is left for «${code}»`);
  if (r.keyed[0] < r.keyed[1]) console.log(`node scripts/i18n-keyed-audit.mjs --missing ${code}   # ${r.keyed[1] - r.keyed[0]} keyed strings`);
  if (r.inline && r.inline[0] < r.inline[1]) console.log(`node scripts/i18n-report.mjs --missing ${code}   # ${r.inline[1] - r.inline[0]} inline strings`);
  if (pg && !pg.file) console.log(`node scripts/i18n-pages-audit.mjs --template ${pg.html}   # the reading pages do not exist`);
  else if (pg && pg.have < pg.want) console.log(`node scripts/i18n-pages-audit.mjs --missing ${pg.html}   # ${pg.want - pg.have} reading-page strings`);
  if (r.positional && r.positional[0] < r.positional[1]) console.log(`node scripts/i18n-positional-audit.mjs --all   # ${r.positional[1] - r.positional[0]} call-site arguments still English`);
  if (!shortOf(r)) console.log('# nothing — this language is complete on every surface');
  process.exit(0);
}

console.log('IntMap · translation coverage — every surface, every language  (#R239)\n');
console.log('lang      keyed  ui table       inline L(…) table    positional L(…) args   reading pages');
for (const r of rows) {
  console.log(r.code.padEnd(9)
    + pct(r.keyed) + '  ' + pct(r.inline) + '  ' + pct(r.positional) + '  '
    + (r.pagesFile ? pct(r.pages) : '   NO pages.*.js FILE')
    + (shortOf(r) ? '   ⚠' : ''));
}
console.log(`\ntwo-branch \`jp ? … : …\` ternaries carrying prose: ${two.total}`
  + `\ncall sites with fewer than five positional arguments: ${pos.shortSites ?? pos.short}`
  + `\ndata-i18n keys in HTML that NO language declares: ${orphanKeys.length}`
  + (orphanKeys.length ? '\n    ' + orphanKeys.join('\n    ') : '')
  /* (#R240) the sixth surface — see the note by `attrs` above */
  + `\ntitle / aria-label / placeholder / alt with NO key at all: ${attrs.total}`
  + (attrs.total ? '\n    ' + [...new Set(attrs.findings.map((f) => f.text))].slice(0, 20).join('\n    ')
      + '\n    (node scripts/i18n-attr-audit.mjs lists every one, with its line)' : '')
  /* (#R241) the seventh surface — see the note by `arrays` above */
  + `\ntranslation tuples held as data instead of as a call: ${arrays.hits.length}`
  + (arrays.hits.length ? '\n    ' + arrays.hits.slice(0, 20).map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n    ')
      + '\n    (node scripts/i18n-positional-array-audit.mjs lists every one)' : ''));

if (process.argv.includes('--gate')) {
  const bad = rows.filter(shortOf).map((r) => r.code);
  const problems = [];
  if (bad.length) problems.push(`incomplete language(s): ${bad.join(', ')}`);
  if (two.total) problems.push(`${two.total} two-branch ternary/ies carrying prose`);
  if ((pos.short ?? 0) > 0) problems.push(`${pos.short} L(…) site(s) with fewer than five arguments`);
  if (orphanKeys.length) problems.push(`${orphanKeys.length} data-i18n key(s) with no English entry`);
  if (attrs.total) problems.push(`${attrs.total} user-visible attribute(s) with no translation key — run scripts/i18n-attr-audit.mjs`);
  if (arrays.hits.length) problems.push(`${arrays.hits.length} translation tuple(s) held as data — run scripts/i18n-positional-array-audit.mjs`);
  if (problems.length) {
    console.error('\n✖ i18n gate: ' + problems.join('; '));
    console.error('  `node scripts/i18n-audit.mjs --todo <code>` prints the commands that close each gap.');
    process.exit(1);
  }
  console.log('\n✓ i18n gate: every language is complete on every measured surface.');
}
