// R390 source-level regression checks.
//
// The round: the guard #R301 built to stop a node test file from being left out of `test:checks`
// decided what a test WAS by asking its NAME — /\.test\.mjs$/. So the one file of tests in this
// repository that predates the convention was outside anything the guard could demand:
// `tests/security-logic.mjs` (#R138 — 31 tests over the constant-time secret comparison, the admin
// console's data-literal parser, the fail-closed refresh-news guard, the pinned GitHub Actions).
// #R377 dropped it from the list as collateral in that one long hand-maintained line, and
// `npm test`, `npm run check:static` and CI all stayed green for three rounds — until #R380
// happened to put it back. MEASURED before this round's fix, on this tree: with that one path
// deleted from `test:checks`, `node scripts/static-checks.mjs` exited 0 and said nothing about it.
//
// So the guard now asks the file what it CONTAINS. A `.mjs` under tests/ that imports `node:test`
// declares tests, whatever it is called, and must be in the list. The name rule is kept alongside
// it, so a `*.test.mjs` that has not written its first `test(…)` yet is still caught.
//
// The same one line produced the mirror defect in the same window — `tests/r356-checks.test.mjs`
// was listed TWICE from #R356 to #R379 — and #R385 closed that direction while this round was in
// flight. The two land on the same function, so ④ below asks the question neither of them asks
// alone: that the source rule and the duplicate rule compose rather than shadow each other.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for (#R298).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTestList, checkTestListHere, listMjs, isNodeTest, IS_NODE_TEST, DECLARES_NODE_TESTS }
  from '../scripts/check-test-list.mjs';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = () => JSON.parse(read('package.json'));
const listedIn = (s) => String(s).split(/\s+/).filter((x) => /^tests\//.test(x));

/* ── ① the file #R377 lost is in the list, and it really is a file of tests ───────────────────── */
test('#R390 ① tests/security-logic.mjs is in `npm run test:checks`, and its name cannot say so', () => {
  assert.ok(listedIn(pkg().scripts['test:checks']).includes('tests/security-logic.mjs'),
    'the 31 security tests are named in the list — without that one path they do not run at all');
  const src = read('tests/security-logic.mjs');
  const declared = [...src.matchAll(/^test\(/gm)].length;
  assert.ok(declared >= 25, `and it declares tests to run (found ${declared})`);
  /* ⚠ THE OLD RULE COULD NOT SEE THIS FILE. That is the whole round, in two assertions. */
  assert.ok(!IS_NODE_TEST.test('tests/security-logic.mjs'), 'its name does not end in .test.mjs…');
  assert.ok(isNodeTest('tests/security-logic.mjs', src), '…and the guard demands it anyway, from its source');
});

/* ── ② the guard demands an unlisted test file whatever it is called — exercised ──────────────── */
test('#R390 ② a file of tests that is not named `*.test.mjs` is still demanded', () => {
  const script = 'node --test tests/a.test.mjs';
  const onDisk = ['tests/a.test.mjs', 'tests/security-logic.mjs'];
  const asTests = () => "import { test } from 'node:test';\ntest('x', () => {});\n";
  const asHelper = () => 'export const CORPUS = [1, 2, 3];';
  /* the #R377 case exactly: a hand-named file full of tests, on disk, never named in the list */
  assert.deepEqual(checkTestList(script, onDisk, asTests).map((p) => p.kind + ' ' + p.file),
    ['unlisted tests/security-logic.mjs']);
  /* …and the very same path, when it really is a helper, is still left alone */
  assert.deepEqual(checkTestList(script, onDisk, asHelper), []);
  /* every spelling of the import, because the rule has to hold for a file nobody has written yet */
  for (const s of ["import { test } from 'node:test';", 'const { test } = require("node:test");',
    "const { test } = await import('node:test');", "import 'node:test';"]) {
    assert.ok(DECLARES_NODE_TESTS.test(s), `it recognises: ${s}`);
  }
  assert.ok(!DECLARES_NODE_TESTS.test('// a helper. it is not a node:test file.\nexport const X = 1;'),
    'and a bare mention in a comment is not an import');
});

/* ── ③ the same question asked of the REAL tree, and asked of a non-empty set ─────────────────── */
test('#R390 ③ every .mjs under tests/ that declares node tests is in the list', () => {
  assert.deepEqual(checkTestListHere(ROOT).map((p) => p.msg), [],
    'the list and the disk disagree — see scripts/check-test-list.mjs');
  const listed = new Set(listedIn(pkg().scripts['test:checks']));
  const onDisk = listMjs(ROOT);
  const bySourceOnly = onDisk.filter((f) => !IS_NODE_TEST.test(f) && isNodeTest(f, read(f)));
  /* ⚠ A CHECK OVER AN EMPTY SET IS A CHECK THAT CANNOT FAIL. The widened rule has to be carrying
     something in this repository, or ③ is green for a reason that has nothing to do with it. */
  assert.ok(bySourceOnly.includes('tests/security-logic.mjs'),
    'the rule reaches the file #R377 lost, which its name alone cannot');
  for (const f of bySourceOnly) assert.ok(listed.has(f), `${f} declares node tests and must be listed`);
  /* ⚠ AND IT STILL DOES NOT DEMAND WHAT IT SHOULD NOT — asked of the real fixtures, corpora and
     shared helpers, through the real machinery, with an empty list so every file is a candidate. */
  const helpers = onDisk.filter((f) => !IS_NODE_TEST.test(f) && !isNodeTest(f, read(f)));
  assert.ok(helpers.length >= 3, `there are helpers under tests/ to leave alone (found ${helpers.length})`);
  const demanded = checkTestList('node --test', onDisk, read)
    .filter((p) => p.kind === 'unlisted').map((p) => p.file);
  assert.equal(demanded.length, onDisk.length - helpers.length,
    'it demands exactly the test files, and none of the helpers');
  for (const f of helpers) assert.ok(!demanded.includes(f), `${f} declares no tests and is not demanded`);
});

/* ── ④ the source rule composes with the other three directions, rather than shadowing them ───── */
test('#R390 ④ a list wrong in all four ways at once reports all four', () => {
  /* ⚠ THE OVERLAP IS THE POINT. #R385 added the duplicate direction to this same function while
     this round was in flight; #R385 ④ composes the three it knew about, all of them spelled
     `*.test.mjs`. What neither round asks alone is whether a file that is a test only by its
     SOURCE is still seen when the other three findings are also present. */
  const src = (f) => (f === 'tests/security-logic.mjs'
    ? "import { test } from 'node:test';" : '/* a helper */');
  const out = checkTestList(
    'node --test tests/a.test.mjs tests/a.test.mjs tests/gone.test.mjs',
    ['tests/a.test.mjs', 'tests/c.test.mjs', 'tests/security-logic.mjs', 'tests/newsgeo-corpus.mjs'],
    src);
  assert.deepEqual(out.map((p) => p.kind + ' ' + p.file).sort(), [
    'duplicate tests/a.test.mjs',           // #R385 — named twice
    'missing tests/gone.test.mjs',          // #R301 — named, not on disk
    'unlisted tests/c.test.mjs',            // #R301 — on disk by name, never named
    'unlisted tests/security-logic.mjs',    // #R390 — on disk by SOURCE, never named
  ]);
  /* …and the corpus, which is a `.mjs` under tests/ and neither, is in none of the four */
  assert.ok(!out.some((p) => p.file === 'tests/newsgeo-corpus.mjs'), 'a plain helper is left alone');
});

/* ── ⑤ the reader is required, so nobody gets the old blindness back by accident ──────────────── */
test('#R390 ⑤ a caller that omits the source reader gets an error, not a quieter check', () => {
  assert.throws(() => checkTestList('node --test tests/a.test.mjs', ['tests/security-logic.mjs']),
    /readSource is required/,
    'an optional reader would hand #R377 its behaviour back — silently, and green');
});

/* ── ⑥ the change is written where the next reader will look ─────────────────────────────────── */
test('#R390 ⑥ the round is in DEV-NOTES, and docs/TESTING.md states the rule it now uses', () => {
  /* ⚠ THE ROUND IS READ OFF THIS FILE'S OWN NAME. Every round that renumbers before pushing has to
     edit its stamps too, and the ones that forget leave a check pointing at a round that is not
     there (#R381). Derived from the filename, it cannot drift. */
  const round = /^r(\d+)-checks\.test\.mjs$/.exec(basename(HERE));
  assert.ok(round, 'this file is named for its round');
  /* ⚠ ASSERTED AS BOOLEANS, NOT `assert.match`. A failed match prints the WHOLE haystack, and
     DEV-NOTES.md is ~900,000 characters — the report of the failure buries the run it came from. */
  const dn = read('DEV-NOTES.md');
  assert.ok(new RegExp('^## R' + round[1] + '\\b', 'm').test(dn), 'DEV-NOTES has a section for this round');
  assert.ok(new RegExp('^- \\*\\*#R' + round[1] + '\\*\\*', 'm').test(dn), '…and an index line for it');
  const t = read('docs/TESTING.md');
  assert.ok(/check-test-list\.mjs/.test(t), 'docs/TESTING.md still names the guard');
  assert.ok(/node:test/.test(t), '…and says the rule reads the source, not only the file name');
  assert.ok(/security-logic/.test(t), '…and names the file the name-only rule could not protect');
  /* the size it states is the size the list actually has */
  const n = listedIn(pkg().scripts['test:checks']).length;
  const m = /\*\*(\d+) Node test files\*\*/.exec(t);
  assert.ok(m, 'the node tier size is still stated');
  assert.equal(Number(m[1]), n, 'and it is the size the list has');
});
