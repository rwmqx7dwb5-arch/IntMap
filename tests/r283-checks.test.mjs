/* ============================================================================
 *  IntMap · #R283 source checks — a check is about content, not about bytes
 * ----------------------------------------------------------------------------
 *  「two node check files fail locally on Windows purely because of line endings,
 *    while CI is green. This has been re-diagnosed by hand in many rounds, which
 *    wastes time and trains people to ignore red.」
 *
 *  Two source-level checks were written against the bytes the checkout produced:
 *  tests/r261-checks ③ required a line break with nothing in front of it, and
 *  scripts/i18n-langs.mjs --check compared a generated file with the rendered text
 *  character for character. `core.autocrlf` is true here, so both were red on every
 *  local run and green in CI — and #R274, #R279 and #R282 each measured that by hand
 *  and wrote it down again. See scripts/eol.mjs for the finding and the fix.
 *
 *  ⚠ THE INTERESTING HALF OF THIS FILE IS THE ONE THAT GOES RED IN CI TOO. Fixing
 *  the two files makes Windows green, but Windows is the only place the defect was
 *  ever visible, so nothing would stop it coming back the next time somebody writes
 *  a newline into a pattern. § ① and § ③ therefore SYNTHESISE the CRLF text rather
 *  than reading it off the disk, and assert both directions — the claim must fail on
 *  the raw bytes, hold on the content, and STILL FAIL when the line break it demands
 *  is genuinely absent. A normaliser that answered «the same» to everything would
 *  pass § ① and § ③'s first halves and fail their last, which is the point.
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE EVERY SEARCH OF ANOTHER FILE. The notes those
 *  files now carry quote the very expressions § ② and § ③ require to be gone
 *  (「自分の検査が自分のコメントに当たる」 — fifteen rounds have paid for this one).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { lf, readLF, sameText } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚠ DELIBERATELY NOT NORMALISED: this file is the one that has to be able to tell the two apart. */
const raw = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① the defect, the fix, and the line that is still required ─────────────────────────────────
   A miniature of tests/r261-checks ③, built here rather than read from js/terrain-water.js so that
   it says the same thing on Linux. Pinning ③'s own pattern would freeze somebody else's assertion,
   which is the failure this project has now made fourteen rounds in a row; what is asserted is the
   PROPERTY the pattern depends on. */
test('R283 ①: CRLF bytes defeat a newline-anchored pattern, and the content does not', () => {
  const pattern = /sc=>\{\n\s*const left=owed\(sc\);/;
  const crlf = 'sources.forEach(sc=>{\r\n      const left=owed(sc);';

  assert.ok(!pattern.test(crlf),
    'THE DEFECT: a carriage return sits where the pattern demands a line break');
  assert.ok(pattern.test(lf(crlf)),
    'THE FIX: the same claim, asked of the content instead of the checkout, holds');
  assert.ok(pattern.test('sources.forEach(sc=>{\n      const left=owed(sc);'),
    '…and it was always true of an LF checkout, which is why CI never saw this');

  /* ⚠ AND IT IS NOT WEAKER. Normalising drops a carriage return; it does not drop the line break. */
  assert.ok(!pattern.test(lf('sources.forEach(sc=>{ const left=owed(sc);')),
    'a pattern that demands a line break must still refuse a single line');
  assert.equal(lf('a\r\nb'), 'a\nb');
  assert.equal(lf('a\nb'), 'a\nb', 'an LF text is returned unchanged');
  assert.equal(lf('ab'), 'ab', 'and nothing is inserted');
});

/* ── ② the two files that were red on Windows read content ──────────────────────────────────── */
test('R283 ②: the source-level checks that broke read their files as content', () => {
  for (const f of ['tests/r261-checks.test.mjs', 'tests/r232-checks.test.mjs']) {
    const src = codeOnly(raw(f));
    assert.match(src, /import \{ readLF \} from '\.\.\/scripts\/eol\.mjs';/,
      f + ': the reader comes from the one place that knows about line endings');
    assert.match(src, /const read = \(p\) => readLF\(/,
      f + ": the file's only reader goes through it");
    assert.doesNotMatch(src, /readFileSync\([^)]*utf8/,
      f + ': an assertion is reading raw bytes again — if the BYTES are genuinely the subject, read '
      + 'them under a name that says so rather than through `read`');
  }
});

/* ── ③ the generated language list is compared by content, and staleness still fails ────────────
   scripts/i18n-langs.mjs is the other half of the report: tests/r232-checks ① runs its `--check`
   for real (on this machine against a CRLF checkout, in CI against an LF one), and what is added
   here is the direction that run cannot show — that the comparison still says NO. */
test('R283 ③: the _langs.js staleness gate compares content, and a different list still fails', () => {
  const src = codeOnly(raw('scripts/i18n-langs.mjs'));
  assert.match(src, /import \{ sameText \} from '\.\/eol\.mjs';/, 'it uses the shared comparison');
  assert.match(src, /if \(!sameText\(current, text\)\)/, 'the --check branch asks about the content');
  assert.doesNotMatch(src, /current !== text/, 'the byte comparison is gone from both branches');

  const current = raw('js/locales/_langs.js');
  const asCrlf = lf(current).split('\n').join('\r\n');
  assert.ok(sameText(current, asCrlf), 'a CRLF checkout of the current file is not stale');
  assert.ok(sameText(current, lf(current)), '…and neither is an LF one');

  const NEEDLE = 'window.IntMapLangCodes';
  assert.ok(current.includes(NEEDLE), 'the generated file still declares the code list');
  assert.ok(!sameText(current, current.replace(NEEDLE, NEEDLE + 'Stale')),
    'but a file that says something DIFFERENT is still stale — the gate was not softened');
});

/* ── ④ the reader is exercised through the filesystem, not only as a string helper ────────────── */
test('R283 ④: readLF hands back the content of a file written with CRLF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-eol-'));
  try {
    const p = join(dir, 'sample.js');
    writeFileSync(p, 'a=1;\r\nb=2;\r\n');
    assert.notEqual(readFileSync(p, 'utf8'), 'a=1;\nb=2;\n', 'the file on disk really is CRLF');
    assert.equal(readLF(p), 'a=1;\nb=2;\n', '…and readLF answers with the content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
