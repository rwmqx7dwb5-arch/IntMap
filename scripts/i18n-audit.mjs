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
/* ⚠ (#R372) THE PARSE IS NOT THIS FILE'S. #R239's rule — pinned by tests/r241 ① — is that the one
   gate holds no parser of its own; scripts/i18n-helpers.mjs already parses every file in js/ ONCE
   for this whole family of instruments, and `deadDash` below reads that syntax tree rather than
   growing a second reader of JavaScript here. */
import { parseAll } from './i18n-helpers.mjs';



const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');
/* ⚠⚠⚠ (#R251) AN INSTRUMENT THAT CANNOT SAY WHICH CHILD FAILED IS THE DEFECT IT EXISTS TO FIND.
   This was a bare `JSON.parse(execFileSync(…))`, and when a child died on CI the whole gate printed
   one line — `<anonymous_script>:1` — with no file name, no exit code and no stderr, because the
   child's own error went nowhere and the parse then failed on an empty string. Three CI runs were
   spent guessing. The child's stderr is INHERITED (so it lands in the log where it happened), the
   exit status is reported with the script that produced it, and a parse failure says which file
   returned unreadable JSON and how much of it there was. */
const run = (f, ...a) => {
  let out;
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts', f), '--json', ...a],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (e) {
    console.error(`
✗ scripts/${f} --json ${a.join(' ')} failed: ${e.status != null ? 'exit ' + e.status : e.code || e.message}`);
    process.exit(1);
  }
  try { return JSON.parse(out); }
  catch (e) {
    console.error(`
✗ scripts/${f} --json ${a.join(' ')} returned ${out.length} byte(s) that are not JSON: ${e.message}`);
    console.error(out.slice(0, 400));
    process.exit(1);
  }
};

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
/* ⚠⚠⚠ (#R242) THE NINTH SURFACE, AND THE ONLY ONE HERE THAT DOES NOT FAIL THE BUILD.
   `jp() ? '日本語' : 'English'` — #R237's two-branch audit cannot see it because the test is a CALL
   rather than a comparison against a language code. 486 sites, 432 distinct strings, every one of
   them English in de/ru/es/fr/ko/zh/zh-Hans. #R242 found the shape and could not convert 486 call
   sites in the round that found it, so the number is PRINTED below rather than quietly absent: no
   round after this one can read this report and believe the translation is finished.
   ⚠ When it reaches zero, move it into `problems` and delete this note. */
const helper = run('i18n-helper-ternary-audit.mjs');
/* ══ ⚠⚠⚠ (#R244) THE ELEVENTH SHAPE, AND THE ONLY ONE HERE THAT DOES NOT FAIL THE BUILD ═══════════
   `{en:'Tibet', jp:'チベット', de:'Tibet', ru:'Тибет'}` read as `nm[lg] || nm.en` — a tuple of
   translations keyed by LANGUAGE CODE rather than by position. #R241 closed the ARRAY form and left
   an audit that watches for a language→POSITION map (values are NUMBERS, by construction), so the
   object form walked straight past it: 728 objects in 23 files, none of them visible to any of the
   percentages above, none of them with an inline-table fallback, and most of them naming four or
   five languages — so fr / ko / zh / zh-Hans were English there by construction.
   This round converts what it can and PRINTS the rest, per the rule #R242 wrote for exactly this
   situation: a gate that fails on a number nobody can reach in one round gets deleted by the next
   round, so the number goes in the report as an OPEN GAP instead, is not counted in any percentage,
   and no round after this one can read this output and believe the translation is finished.
   ⚠ (#R246) IT REACHED ZERO. All 590 remaining objects became `pickArgs()` calls this round, so
   this line is now a gate below like every other surface, and the OPEN GAP slot it occupied is
   taken by the TWELFTH shape (see next). Its output stays in the report at 0 rather than being
   deleted: a surface that is measured and empty is the only evidence that it is still watched. */
const langmap = run('i18n-langmap-audit.mjs');
/* ══ ⚠⚠⚠ (#R246) THE TWELFTH SHAPE — A TUPLE HELD AS ADJACENT DATA, AND THE NEW OPEN GAP ═════════
   `['North Pacific Ocean','北太平洋','Nordpazifik',…]` inside a row that also carries a longitude,
   `_dc(…,'Ramstein Air Base','ラムシュタイン空軍基地',…)`, `lbl:['Population','人口',…]`. Nothing
   indexes these by language at all — which slot is which is knowledge held in whatever reads the
   row — so the langmap audit (keys), the positional-array audit (a language→position map) and the
   positional audit (a callee bound to IntMapLang) each count ZERO of them.
   MEASURED THIS ROUND: 2,262 containers in 37 files. That is more than one round can convert, and
   #R242's rule for exactly this situation is that the number goes in the report as an OPEN GAP —
   printed, never counted in a percentage — rather than into a gate that the next round deletes.
   ⚠ When it reaches zero, move it into `problems` below and delete this note. */
const pairs = run('i18n-pair-audit.mjs');
/* ══ ⚠⚠⚠ (#R249) THE FIFTEENTH SURFACE — THE DOCUMENT'S OWN METADATA ═══════════════════════════
   Every surface above walks ELEMENTS or the tables behind them. `<title>` and
   `<meta name="description">` are neither, so index.html's browser tab, bookmark and every shared
   link were English in all nine languages while every row of the matrix below read 100 %. That is
   [[intmap-recurring-lessons]] B for the eighth time, and — exactly as in #R240 — the answer is a
   NEW QUESTION asked here rather than a new free-standing percentage. It is a GATE from the day it
   is added, because unlike the shape audits there is nothing to migrate: three documents, two
   fields each. See scripts/i18n-doc-audit.mjs for what is measured and what is excluded on
   purpose (og:/twitter: cards, admin.html). */
const docs = run('i18n-doc-audit.mjs');
/* ══ ⚠⚠⚠ (#R370) THE SEVENTEENTH SURFACE — «does this English key mean ONE thing» ═══════════════
   Every surface above asks whether a string HAS a translation. This asks whether the translation
   it has can possibly be right, and it is the first one whose answer can be «no» while the row is
   present and the percentage is 100. fr / ko / zh-Hant / zh-Hans resolve a call site by its
   ENGLISH string (`inline[code][arguments[0]]`), so two sites that share a key share one row
   whatever they mean — while the positional five carry their own arguments and cannot collide.
   MEASURED: `'Clear'` was one row over five meanings and ten sites, so the weather widget said
   «erase» for a clear sky in four languages. See scripts/i18n-key-collision-audit.mjs. */
const collide = run('i18n-key-collision-audit.mjs');
const orphanKeys = keyed.undeclared;

/* ══ ⚠⚠⚠ (#R372) THE OPEN GAP IS EXEMPT FOR ONE REASON, AND THIS MEASURES THAT REASON ═══════════
   Every one of the adjacent-data tuples counted by `pairs` is in js/reference-data.js, and what
   reads that file is the Information dashboard's card list — which was RETIRED (#R139). The tab
   became Companies, and `renderDashboard()` in js/companies-ui.js now begins by returning
   `renderCompanies()`; the sidebar cards and the `HOST.dashFeatures` assignment that puts their
   pins on the map both sit AFTER that return, so they run only if renderCompanies() itself throws.
   So these rows are not «English in eight languages» — they are on screen in NONE of the nine, and
   that is the whole of why the gate below tolerates them.
   ⚠ AN EXEMPTION WHOSE JUSTIFICATION NOTHING MEASURES OUTLIVES ITS JUSTIFICATION. The day the
   delegation goes, every tuple in that file is on screen again in nine languages and the only thing
   that would notice is a reader — which is the failure this whole file exists to stop. So the
   justification is MEASURED, on the AST rather than on the text of one line: re-indenting, moving
   the comment or wrapping the file changes nothing here, while deleting the delegation — or making
   it conditional, which reaches the same body — turns the gate red with the sentence that says what
   has to be written before the dashboard can come back.
   ⚠ …AND THE JUSTIFICATION COVERS ONE FILE. A tuple in any OTHER file is a live English fallback,
   and the ratchet on the TOTAL cannot see tuples move house, so the file list is held too. */
const DEAD_DASHBOARD = 'js/companies-ui.js';
const DEAD_DASHBOARD_DATA = 'js/reference-data.js';
const deadDash = (() => {
  const entry = parseAll().get(DEAD_DASHBOARD.replace(/^js\//, ''));
  if (!entry) return { ok: false, why: `${DEAD_DASHBOARD} is gone, or no longer parses — the OPEN GAP below rested on what it does` };
  /* every `function renderDashboard(){…}` however deeply it is nested — the file wraps its module in
     a factory, and a check that only looked at the top level would find nothing and say so */
  const found = [];
  (function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const c of n) visit(c); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'renderDashboard') found.push(n);
    for (const k of Object.keys(n)) { if (k !== 'loc' && k !== 'type') visit(n[k]); }
  })(entry.ast);
  if (found.length !== 1) return { ok: false, why: `${DEAD_DASHBOARD} declares renderDashboard() ${found.length} time(s), not once — this check needs rewriting` };
  /* the delegation may be bare or wrapped in the try/catch it has carried since #R139. What it may
     NOT be is conditional, or preceded by anything, or absent: each of those reaches the body. */
  const delegates = (st) => !!st && st.type === 'ReturnStatement' && !!st.argument
    && st.argument.type === 'CallExpression' && st.argument.callee.type === 'Identifier'
    && st.argument.callee.name === 'renderCompanies';
  const first = found[0].body.body[0];
  if (delegates(first)) return { ok: true, where: `${DEAD_DASHBOARD}:${first.loc.start.line}` };
  if (first && first.type === 'TryStatement' && delegates(first.block.body[0])) {
    return { ok: true, where: `${DEAD_DASHBOARD}:${first.block.body[0].loc.start.line}` };
  }
  return { ok: false, why: `renderDashboard() in ${DEAD_DASHBOARD} no longer begins by returning renderCompanies()`
    + (first ? ` — its first statement is of type ${first.type}, at line ${first.loc.start.line}` : ' — its body is empty')
    + `. The card list below that return draws every tuple in ${DEAD_DASHBOARD_DATA}, so those rows are`
    + ' on screen again: write them with pickArgs() in all nine languages, or, if the dashboard is gone'
    + ' for good rather than back, delete this check together with it' };
})();

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
    /* ⚠⚠⚠ (#R251) HOW MANY INLINE ROWS ARE STILL THE ENGLISH STRING. #R239 wrote the rule after an
       instrument it had just written called an English copy 100 % — 「被覆は『存在する』でなく
       『英語と違う』」 — and applied it to the reading pages. The inline table still counted
       PRESENCE, and `node scripts/i18n-new-language.mjs it` writes 3,576 rows whose value IS the
       key, on purpose, so the language is readable from its first commit. The column above then
       said 100.0 % and `--todo it` named only the 367 page strings. Printed, not subtracted: a row
       that equals its key is often right (「Satellite」, 「Zoom」, 「Distance」 and 「Atlas」 are
       French; 「km」 and 「UTC」 are everybody's), and certifying 213 of those as reviewed is a claim
       no instrument here has earned. The NUMBER is the signal, and --todo now says it. */
    identical: r.positional ? null : (r.identical || 0),
    positional: ps ? [pos.sites - ps.same, pos.sites] : null,
    pages: [pg.have, pg.want],
    pagesFile: pg.file !== false,
  };
});

const pct = (p) => (p ? `${String(p[0]).padStart(5)}/${String(p[1]).padEnd(5)} ${(100 * p[0] / Math.max(1, p[1])).toFixed(1).padStart(5)}%` : '        n/a        ');
/* ⚠ (#R251) …and «=EN» counts. A language every one of whose inline rows is still the English
   string is not translated, whatever the presence column says — that is the whole point of the
   column. The threshold is HALF the table rather than zero, because a handful of rows legitimately
   equal their key in any language (units, product names, cognates) and the four shipping languages
   sit at 11–213 of 3,576. A skeleton sits at 3,576. */
const shortOf = (r) => (r.keyed[0] < r.keyed[1]) || (r.inline && r.inline[0] < r.inline[1])
  || (r.positional && r.positional[0] < r.positional[1]) || (r.pages[0] < r.pages[1])
  || (r.inline && r.identical > r.inline[1] / 2);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, orphanKeys, twoBranch: two.total, shortSites: pos.short, unkeyedAttrs: attrs.total, positionalArrays: arrays.hits.length, langMaps: langmap.total, pairs: pairs.total, unlocalisedDocs: docs.bad }));
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
  if (r.identical) console.log(`node scripts/i18n-report.mjs --identical ${code}   # ${r.identical} inline rows are still the English string`);
  if (pg && !pg.file) console.log(`node scripts/i18n-pages-audit.mjs --template ${pg.html}   # the reading pages do not exist`);
  else if (pg && pg.have < pg.want) console.log(`node scripts/i18n-pages-audit.mjs --missing ${pg.html}   # ${pg.want - pg.have} reading-page strings`);
  if (r.positional && r.positional[0] < r.positional[1]) console.log(`node scripts/i18n-positional-audit.mjs --all   # ${r.positional[1] - r.positional[0]} call-site arguments still English`);
  if (!shortOf(r)) console.log('# nothing — this language is complete on every surface');
  process.exit(0);
}

console.log('IntMap · translation coverage — every surface, every language  (#R239)\n');
console.log('lang      keyed  ui table       inline L(…) table    positional L(…) args   reading pages        =EN');
for (const r of rows) {
  console.log(r.code.padEnd(9)
    + pct(r.keyed) + '  ' + pct(r.inline) + '  ' + pct(r.positional) + '  '
    + (r.pagesFile ? pct(r.pages) : '   NO pages.*.js FILE')
    + (r.identical == null ? '      n/a' : String(r.identical).padStart(9))
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
  /* (#R241) the seventh surface — see the note by `arrays` above.
     (#R248) …and the FOURTEENTH shape now reports here too, because it is the same table: a
     language→POSITION map written as a ternary chain rather than as an object. Six readers in three
     files were reading tuples that way, i.e. subscripting the array directly and never asking the
     registry, so fr/ko/zh/zh-Hans took arm `0` — English — with no inline fallback possible. */
  + `\ntranslation tuples held as data instead of as a call (incl. language→index chains): ${arrays.hits.length}`
  + (arrays.hits.length ? '\n    ' + arrays.hits.slice(0, 20).map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n    ')
      + '\n    (node scripts/i18n-positional-array-audit.mjs lists every one)' : '')
  /* ══ ⚠ (#R243) THE NINTH SURFACE IS A GATE NOW, AND THE OPEN GAP IS CLOSED ══════════════════════
     #R242 found this shape, could not convert 486 call sites in the round that found it, and wrote
     down the exact condition for promoting it: 「The moment the count reaches zero, delete the `soft`
     flag in i18n-audit.mjs and this becomes a gate like the others.」 It is zero (467 sites converted
     by scripts/helper-ternary-codemod.mjs, 11 locale tags moved to `IntMapLang.locale()`, three
     {en,jp} tables moved to `pickArgs()`, two defaults moved to a language-keyed table), so the line
     below counts like every other row instead of printing a number nobody has to act on. */
  /* ⚠ (#R247) `sites` NOW INCLUDES THE THIRTEENTH SHAPE — the same ternary with ARRAY arms
     (`jp() ? [['ui','UI・表示'],…] : [['ui','UI / display'],…]`). It hid a whole bug-report menu, the
     calendar's weekday initials and which Wikipedia two widgets read, in seven languages, and it hid
     from EVERY instrument here: the pair audit wants literal arms, and the adjacent-pair audit needs
     the two languages NEXT TO each other, which they are not — they are in different arms. Counted
     as CONTAINERS and as the strings inside them, because one ternary can hide a whole menu. */
  + `\ntwo-language strings behind a helper (\`jp() ? … : …\`): ${helper.sites}`
    + (helper.containers ? ` (of which ${helper.containers} whole container(s), ${helper.containerStrings} strings)` : '')
  + (helper.sites ? '\n    node scripts/i18n-helper-ternary-audit.mjs --list' : '')
  /* (#R244) the eleventh shape, closed by #R246 — it is a gate now, and stays printed at 0. */
  + `\ntranslation tuples held as an OBJECT keyed by language code: ${langmap.total}`
  + (langmap.total ? '\n    node scripts/i18n-langmap-audit.mjs --list' : '')
  /* (#R249) the fifteenth surface — see the note by `docs` above */
  + `\nreader-facing documents whose <title>/<meta description> are NOT localised: ${docs.bad.length}`
  + (docs.bad.length ? '\n    ' + docs.bad.join('\n    ') + '\n    (node scripts/i18n-doc-audit.mjs)' : '')
  /* (#R370) the seventeenth surface — see the note by `collide` above. The benign count is printed
     beside the failing one because it IS the judgement: 177 keys where one row genuinely serves
     every site, re-derived on every run so the list cannot quietly grow stale. */
  + `\nEnglish keys carrying MORE THAN ONE meaning (fr/ko/zh resolve by the English string): ${collide.unlisted.length}`
    + ` unlisted, ${collide.listed} judged benign, of ${collide.keys} keys`
  + (collide.unlisted.length ? '\n    ' + collide.unlisted.map((u) => JSON.stringify(u.en) + ' — ' + u.meanings.join(' / ')).join('\n    ')
      + '\n    (node scripts/i18n-key-collision-audit.mjs --list)' : '')
  /* (#R246) the twelfth shape — see the note by `pairs` above. OPEN GAP: printed, not counted. */
  /* ⚠⚠⚠ (#R249) THE EXEMPTION IS PRINTED ON EVERY RUN. 「固有名詞は構造的に除外し、UI文だけ全言語化」
     — and an exemption nobody can see is an exemption nobody re-examines. #R248's matcher rule
     checked slot 0 only, so 328 match-term lists in js/gazetteer.js sat inside the OPEN GAP as
     «strings somebody must translate» for two rounds. The number below is what is NOT being asked
     for, beside the number that is. */
  + `\n\nexempt — proper-noun records and match-term lists, NOT text the app wrote: ${pairs.exempt}`
  + (pairs.exemptFiles && pairs.exemptFiles.length
    ? '\n    ' + pairs.exemptFiles.slice(0, 6).map((f) => String(f.n).padStart(4) + '  ' + f.file).join('\n    ')
      + (pairs.exemptFiles.length > 6 ? `\n    …and ${pairs.exemptFiles.length - 6} more file(s)` : '')
      + '\n    Declared with `@i18n-entity-data` and VALIDATED against the row carrying a coordinate /'
      + '\n    ISO code / ticker / domain, so the marker cannot be used to silence UI prose.' : '')
  + `\n\n⚠ OPEN GAP — translation tuples held as ADJACENT DATA SLOTS: ${pairs.total}`
  + (pairs.total
    ? '\n    ' + pairs.files.slice(0, 12).map((f) => String(f.n).padStart(4) + '  ' + f.file).join('\n    ')
      + (pairs.files.length > 12 ? `\n    …and ${pairs.files.length - 12} more file(s)` : '')
      + '\n    (node scripts/i18n-pair-audit.mjs --list lists every one, with its line)'
      + '\n    These are NOT counted in any percentage above: nothing indexes them by language, so no'
      + '\n    instrument here can see them.'
      /* ⚠ (#R372) WHAT THIS PARAGRAPH USED TO SAY WAS NOT TRUE — see the note by `deadDash` above.
         「every language the row does not list reads English」 described a live defect; no language
         reads these rows at all, because the screen that drew them was retired. The sentence is
         DERIVED from the measurement now rather than written down, so it cannot outlive it. */
      + (deadDash.ok
        ? '\n    ⚠ AND THEY ARE NOT ON SCREEN IN ANY LANGUAGE — NOT EVEN ENGLISH. The Information'
          + `\n    dashboard that drew them was retired (#R139): ${deadDash.where} returns`
          + '\n    renderCompanies() before the card list and before the HOST.dashFeatures assignment that'
          + '\n    places their pins, so that body now runs only if renderCompanies() itself throws.'
          + '\n    That — and nothing else — is why this is an OPEN GAP rather than a live English'
          + '\n    fallback, so the gate MEASURES the delegation: the day it goes, these rows are back on'
          + '\n    screen and need real text in nine languages before the dashboard can return.'
        : `\n    ⚠ THE PATH THAT DRAWS THEM IS REACHABLE AGAIN — ${deadDash.why}`
          + '\n    Until that is undone, every language the row does not list reads English, on screen.')
      + '\n    Convert with pickArgs(), the same answer the seventh and eleventh shapes got.'
    : ''));

if (process.argv.includes('--gate')) {
  const bad = rows.filter(shortOf).map((r) => r.code);
  const problems = [];
  if (bad.length) problems.push(`incomplete language(s): ${bad.join(', ')}`);
  if (two.total) problems.push(`${two.total} two-branch ternary/ies carrying prose`);
  if ((pos.short ?? 0) > 0) problems.push(`${pos.short} L(…) site(s) with fewer than five arguments`);
  if (orphanKeys.length) problems.push(`${orphanKeys.length} data-i18n key(s) with no English entry`);
  if (attrs.total) problems.push(`${attrs.total} user-visible attribute(s) with no translation key — run scripts/i18n-attr-audit.mjs`);
  if (arrays.hits.length) problems.push(`${arrays.hits.length} translation tuple(s) held as data — run scripts/i18n-positional-array-audit.mjs`);
  /* (#R243) the ninth surface, promoted from a printed number to a gate — see the note above */
  if (helper.sites) problems.push(`${helper.sites} two-language string(s) behind a helper — run scripts/helper-ternary-codemod.mjs`);
  /* (#R246) the eleventh surface, promoted from a printed number to a gate — it reached zero */
  if (langmap.total) problems.push(`${langmap.total} translation tuple(s) held as a language-keyed object — run scripts/langmap-codemod.mjs`);
  /* (#R249) the fifteenth surface — a gate from the day it was added: three documents, two fields */
  if (docs.bad.length) problems.push(`${docs.bad.length} document(s) with unlocalised <title>/<meta description> — run scripts/i18n-doc-audit.mjs`);
  /* ⚠⚠⚠ (#R249) A MISAPPLIED EXEMPTION IS A HARD FAILURE, and it is the only part of the twelfth
     shape that IS gated. The OPEN GAP itself may not be gated (#R242's rule: a gate nobody can
     reach in one round gets deleted by the next), but `@i18n-entity-data` on something that is not
     entity data would let any round go green by declaring its prose to be proper nouns — which is
     the one way this whole family of instruments can be defeated. The audit validates every marker
     against the row's coordinate / ISO code / ticker / domain; this makes a failed validation stop
     the build rather than print a line nobody reads. */
  if (pairs.badMarkers && pairs.badMarkers.length) problems.push(`${pairs.badMarkers.length} misapplied @i18n-entity-data marker(s) — run scripts/i18n-pair-audit.mjs`);
  /* (#R370) the seventeenth surface — a gate from the day it was added, in BOTH directions: an
     unlisted collision is a live mistranslation in fr/ko/zh-Hant/zh-Hans, and a BENIGN entry that
     no longer collides has stopped asserting anything (see the header of the audit). */
  if (collide.unlisted.length) problems.push(`${collide.unlisted.length} English key(s) carrying more than one meaning — one inline row cannot serve both, so fr/ko/zh-Hant/zh-Hans are wrong at one of the sites. Run scripts/i18n-key-collision-audit.mjs --list`);
  if (collide.stale.length) problems.push(`${collide.stale.length} stale BENIGN entr(ies) in scripts/i18n-key-collision-audit.mjs — delete them, or the allowlist becomes a place a real collision can hide`);

  /* ══ ⚠ (#R311) …AND THE OPEN GAP IS A RATCHET NOW, WHICH IS NOT THE SAME AS A GATE ═════════════
     「性能改善でUI生成方法やdescriptor構造を変える前に、この領域も品質gateへ含めてください…
       英語fallbackの新規発生なし」.
     #R242's rule stands and is the reason this is not `=== 0`: a gate nobody can reach in one round
     gets deleted by the next, and closing these 275 tuples means writing real text in four more
     languages, which is a translation project rather than a check. What CAN be asked every push is
     the thing the request actually names — that the number never goes UP. A new tuple written in
     this shape is a new English fallback for fr / ko / zh-Hant / zh-Hans, and it is invisible to
     every percentage above, so without this line it could only ever be found by a reader.
     ⚠ It fails in BOTH directions, like scripts/test-budget.mjs: a ceiling that keeps headroom it
     no longer needs has stopped asserting anything (#R194). Converting tuples is meant to cost one
     edit here — that edit is the record that the number moved.
     MEASURED now: 143, all of them js/reference-data.js. The other 132 were the world-events archive
     (js/analysis-world-events.js, split out of js/analysis-panels.js this round); #R322 wrote all 132
     names and one-line descriptions in de / ru / es as positional LA(…) arguments and in fr / ko /
     zh-Hant / zh-Hans in each locale's `inline` table, so that file is at zero and this line moved
     with it — 275 → 143. */
  const PAIR_CEILING = 143;
  if (pairs.total > PAIR_CEILING) problems.push(`${pairs.total - PAIR_CEILING} NEW translation tuple(s) held as adjacent data (${pairs.total} > ${PAIR_CEILING}) — every one is a fresh English fallback in fr/ko/zh-Hant/zh-Hans that no percentage above can see. Convert with pickArgs(); run scripts/i18n-pair-audit.mjs --list`);
  else if (pairs.total < PAIR_CEILING) problems.push(`the adjacent-data tuples are down to ${pairs.total} but PAIR_CEILING in scripts/i18n-audit.mjs still says ${PAIR_CEILING} — lower it, or the ratchet stops asserting anything`);
  /* ══ ⚠⚠⚠ (#R372) …AND THE RATCHET IS ONLY HONEST WHILE THE EXEMPTION'S REASON HOLDS ═════════════
     The ceiling says «no NEW English fallback». It says nothing about the 143 that are already
     there, and what earns them that silence is that no reader can see them (see `deadDash` above).
     A reason nobody measures is a reason that quietly stops being true, so BOTH halves of it are
     asserted: the delegation that makes the card list unreachable, and the fact that every tuple is
     in the one file that delegation covers — tuples moving house would leave the total, and
     therefore the ratchet, completely unmoved. */
  if (pairs.total > 0 && !deadDash.ok) problems.push(`the ${pairs.total} adjacent-data tuple(s) are tolerated ONLY because nothing draws them, and that has stopped being true: ${deadDash.why}`);
  const strayGap = (pairs.files || []).filter((f) => f.file !== DEAD_DASHBOARD_DATA);
  if (strayGap.length) problems.push(`${strayGap.reduce((n, f) => n + f.n, 0)} adjacent-data tuple(s) live outside ${DEAD_DASHBOARD_DATA} (${strayGap.map((f) => `${f.file} ${f.n}`).join(', ')}) — the OPEN GAP is exempt only where the retired dashboard makes it unreachable, so these ARE on screen and every language the row does not list reads English. Convert with pickArgs(); run scripts/i18n-pair-audit.mjs --list`);
  if (problems.length) {
    console.error('\n✖ i18n gate: ' + problems.join('; '));
    console.error('  `node scripts/i18n-audit.mjs --todo <code>` prints the commands that close each gap.');
    process.exit(1);
  }
  /* ⚠⚠⚠ (#R372) A PASS LINE MAY NOT BE WIDER THAN WHAT WAS MEASURED. This said «every language is
     complete on every measured surface.» three lines under an OPEN GAP of 143 — true word for word,
     and read by every round as «the translation is finished». The count that is OUTSIDE the
     measurement now travels in the same sentence as the count that is inside it, so the reader
     cannot take one without the other. The exit code does not move: this is a report of what was
     measured, not a new gate (#R242's rule still stands). */
  console.log('\n✓ i18n gate: every language is complete on every MEASURED surface'
    + (pairs.total
      ? ` — and ${pairs.total} translation tuple(s) in ${pairs.files.length} file(s) are OUTSIDE that`
        + ` measurement (the OPEN GAP above; no percentage counts them, and nothing draws them:`
        + ` ${deadDash.where}).`
      : ', and no surface is left outside the measurement.'));
}
