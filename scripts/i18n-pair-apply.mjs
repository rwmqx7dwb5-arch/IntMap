#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE TWELFTH SHAPE, REWRITTEN FROM A DICTIONARY   (#R251)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  scripts/i18n-pair-codemod.mjs (#R248) rewrites the containers that are NOTHING BUT a tuple —
 *  `lbl:['Population','人口',…]` → `lbl:LA('Population','人口',…)`. Every one of those is done. What
 *  is left is the harder half it deliberately refused: a tuple sitting INSIDE a row that also holds
 *  an id, a year, a coordinate or a colour —
 *
 *      _dc('d-ramstein','mil','mil',7.6,49.44,'Ramstein Air Base','ラムシュタイン空軍基地', …)
 *      E(1492,-74.48,24.10,'geo','Columbus reaches the Americas','コロンブスのアメリカ到達', …)
 *
 *  — where the two adjacent slots must COLLAPSE INTO ONE, so the row gets shorter and whatever
 *  reads it has to move with it. That reader edit is per-file and is made BY HAND; this script does
 *  the part that is identical everywhere and must not be done by eye 475 times.
 *
 *  ⚠ IT TRANSLATES NOTHING. It reads scripts/i18n/*.json — the same six-column dictionary
 *  scripts/i18n-apply-inline.mjs reads, so de/ru/es land in the source and fr/ko/zh land in the
 *  locale tables FROM ONE ROW, and the two can never disagree. A pair whose English string is not
 *  in the dictionary is REPORTED AND LEFT ALONE: a half-translated row that ships is worse than an
 *  untouched one, and #R244's langmap codemod is what guessing looks like.
 *
 *  ⚠ AND IT ONLY EVER TOUCHES A PAIR scripts/i18n-pair-audit.mjs REPORTS. That file owns the
 *  question «is this adjacent pair a translation?» — including the `@i18n-entity-data` exemption and
 *  its validation — so a proper-noun record cannot be rewritten here by accident.
 *
 *      node scripts/i18n-pair-apply.mjs --dry                 # every pair, and what is missing
 *      node scripts/i18n-pair-apply.mjs js/reference-data.js  # write, one file at a time
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const DICT_DIR = join(ROOT, 'scripts', 'i18n');
const DRY = process.argv.includes('--dry');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => a.replace(/^js[\\/]/, ''));

const JA = /[぀-ヿ㐀-鿿！-｠]/;
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const KEYISH = /^[a-z0-9]+([_.][a-z0-9]+)+$/;
const FILEISH = /^[\w./-]+\.(png|jpg|jpeg|svg|gz|json|js|css|webp|bin|tle)$/i;
const URLISH = /^[^\s]*[=&?][^\s]*$/;
const isProse = (v) => v.length > 1 && /[A-Za-z]/.test(v)
  && !HEX.test(v) && !KEYISH.test(v) && !FILEISH.test(v) && !URLISH.test(v) && !JA.test(v);

/* ── the dictionary: English → [de, ru, es, fr, ko, zh-Hant] ────────────────────────────────── */
const dict = Object.create(null);
for (const f of readdirSync(DICT_DIR).filter((n) => /\.json$/.test(n)).sort()) {
  const j = JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8'));
  for (const k of Object.keys(j)) { if (k === '_') continue; dict[k] = j[k]; }
}

/* how a string is written back — single-quoted, matching the surrounding source */
const Q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

/* ── which pairs count: ASKED, NOT RE-DERIVED ──────────────────────────────────────────────────
   scripts/i18n-pair-audit.mjs owns «is this adjacent pair a translation?» — the prose test, the
   already-a-translation-call exemption, the match-term-list shape and the validated
   `@i18n-entity-data` marker. An early draft of this file re-implemented the walk and immediately
   diverged on the marker: it offered to rewrite 303 pairs in js/tables.js, of which the audit counts
   24 — the other 279 are the satellite-product and place-name records the marker exists to protect,
   and rewriting them is exactly 「次のラウンドが照合用の語を律儀に翻訳しにくる」. So the audit is
   spawned and its `pairs` (every pair of every REPORTED container, with byte offsets) are the work
   list. Two copies of one quantity means one of them is stale ([[intmap-recurring-lessons]] G). */
const AUDIT = JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', 'i18n-pair-audit.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 }));

const byFile = new Map();
for (const p of AUDIT.pairs) {
  const f = p.file.replace(/^js\//, '');
  if (ONLY.length && ONLY.indexOf(f) < 0) continue;
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(p);
}

const missing = new Map();
let wrote = 0, rewrote = 0;
for (const [f, list] of [...byFile.entries()].sort()) {
  const src = readFileSync(join(JS, f), 'utf8');
  list.sort((a, b) => a.start - b.start);
  let out = '', at = 0, n = 0;
  for (const p of list) {
    if (p.start < at) continue;                       /* overlapping pair — one rewrite per slot */
    /* ⚠ THE SOURCE WINS WHERE IT ALREADY ANSWERS. `have` is the three de/ru/es slots the audit
       found sitting after the pair (a five-language tuple that is merely not a call). Preferring the
       dictionary there would silently REPLACE translations authored in an earlier round with this
       round's wording — a diff that looks like progress and is churn. */
    const row = p.have || dict[p.en];
    if (!row || row.length < 3 || row.slice(0, 3).some((v) => typeof v !== 'string' || !v.length)) {
      if (!missing.has(p.en)) missing.set(p.en, { ja: p.ja, files: [] });
      const m = missing.get(p.en); if (m.files.indexOf(f) < 0) m.files.push(f);
      continue;
    }
    /* ⚠ ENGLISH FIRST, WHATEVER ORDER THE ROW WAS IN. The inline table is keyed by the English
       source string, so a `[ja, en]` row that kept its order would key every later language off
       the Japanese one and never find a translation. */
    out += src.slice(at, p.start) + 'LA(' + [p.en, p.ja, row[0], row[1], row[2]].map(Q).join(',') + ')';
    at = p.end; n++;
  }
  if (!n) continue;
  out += src.slice(at);
  rewrote += n; wrote++;
  if (!DRY) writeFileSync(join(JS, f), out);
  console.log(`${DRY ? 'would rewrite' : 'rewrote'} ${String(n).padStart(4)} pair(s) in js/${f}`);
}

console.log(`
${DRY ? 'would rewrite' : 'rewrote'} ${rewrote} pair(s) in ${wrote} file(s).`);
if (missing.size) {
  console.log(`
⚠ ${missing.size} English string(s) have no dictionary row — LEFT UNTOUCHED:`);
  if (process.argv.includes('--missing')) {
    const o = {};
    for (const [en] of missing) o[en] = ['', '', '', '', '', ''];
    console.log(JSON.stringify(o, null, 1));
  } else if (process.argv.includes('--pairs')) {
    for (const [en, m] of missing) console.log(JSON.stringify([en, m.ja]));
  } else {
    for (const [en, m] of [...missing].slice(0, 20)) console.log(`    ${JSON.stringify(en).slice(0, 90)}  ${m.files[0]}`);
    if (missing.size > 20) console.log(`    …and ${missing.size - 20} more (--missing prints them all as a dictionary skeleton)`);
  }
  process.exitCode = 1;
}
