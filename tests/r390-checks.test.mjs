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
// The guard this round widened — it asked the file what it CONTAINS rather than what it is
// CALLED — is gone since #R529, together with the list it compared against: `test:checks` now
// discovers `tests/**/*.test.mjs`, so no hand-maintained line can drop a file, name one twice, or
// name one that is not there. The naming exception that made all of this necessary is gone too:
// `tests/security-logic.mjs` was renamed to `tests/security-logic.test.mjs`, so the only rule
// left is the one the runner itself applies. ①–⑤ below asked about the guard and went with it.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for (#R298).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ⑥ the change is written where the next reader will look ─────────────────────────────────── */
test('#R390 ⑥ the round is in DEV-NOTES, and docs/TESTING.md still describes the node tier', () => {
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
  assert.ok(/node:test/.test(t), 'docs/TESTING.md still names the framework the node tier runs on');
  assert.ok(/security-logic/.test(t), '…and still names the file the name-only rule could not protect');
});
