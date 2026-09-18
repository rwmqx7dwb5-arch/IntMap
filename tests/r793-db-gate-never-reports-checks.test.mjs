/* ============================================================================
 *  #R793 · 必須チェックが「走らない」と「まだ終わっていない」は外から同じに見える
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-19. Three open pull requests — #709, #710, #655 — were green on every
 *  check they could run and all three said BLOCKED, with nothing in the PR or the ruleset
 *  naming what was missing. On 2026-09-18 03:14 the `Protect main` ruleset gained a fourth
 *  required context, `Migrations rebuild + RLS/permission tests`, which is the job in
 *  .github/workflows/db.yml — and that workflow was path-filtered to supabase/**. A required
 *  context a path filter suppresses is never reported at all, and GitHub does not read an
 *  absent report as 「走らせる必要が無かった」; it reads it as 「まだ終わっていない」. The three
 *  rounds that merged immediately before (#702 / #704 / #707) had touched no database file
 *  either — the only thing that changed was the ruleset. So neither setting was wrong on its
 *  own, and TOGETHER they stopped every round that does not touch the database.
 *
 *  ⚠ WHAT IS MEASURED HERE IS NOT 「paths: が無いこと」 as an answer to copy
 *  ([[intmap-restate-the-defect-not-the-fix]]). The defect has two halves and a check that
 *  watched only one would green-light the other:
 *
 *    ① THE REQUIRED CONTEXT MUST BE ABLE TO REPORT ON ANY PULL REQUEST. Re-adding a `paths:`
 *       filter under `pull_request:` restores exactly the state measured above, so that is
 *       what fails here — stated as the reachability of the job, not as the spelling.
 *    ② AND THE TESTS MUST STILL RUN WHEN THEY MATTER. The cheap way to satisfy ① is a job
 *       that reports success and does nothing, which is [[intmap-records-with-no-reader]]
 *       turned inside out: a reader with no record. So every step that needs a database is
 *       asserted to be behind the scope guard, the guard's own path list is asserted to still
 *       name supabase/, and the guard is asserted to FAIL OPEN — a push, a dispatch or a diff
 *       it cannot compute runs the tests in full rather than skipping them.
 *
 *  ⚠ THE RULESET ITSELF IS NOT READABLE FROM HERE. Which contexts are required lives in
 *  GitHub's settings, not in the checkout, so this file cannot assert the pairing directly —
 *  it asserts the half the repository owns (the job is always reachable), which is the half
 *  that makes any requirement safe. The other direction is noted in DEV-NOTES.md #R793.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = '.github/workflows/db.yml';
const JOB_NAME = 'Migrations rebuild + RLS/permission tests';
const src = readFileSync(join(ROOT, WF), 'utf8').replace(/\r\n/g, '\n');

/* the `on:` block, up to the next top-level key */
const onBlock = (() => {
  const at = src.indexOf('\non:\n');
  assert.ok(at !== -1, `${WF} has no \`on:\` block`);
  const rest = src.slice(at + 1).split('\n').slice(1);
  const end = rest.findIndex((l) => /^\S/.test(l) && l.trim() !== '');
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
})();

test('① 必須の名前を持つ job は、どの pull request からも到達できる', () => {
  assert.ok(/^\s*pull_request:\s*$/m.test(onBlock),
    `${WF} no longer triggers on pull_request at all — the required context would never report on any PR`);

  /* the pull_request trigger must carry no filter of any kind: paths, paths-ignore and
     branches all suppress the run, and a suppressed run is an absent report, which the
     ruleset cannot tell apart from one still in flight. */
  const pr = onBlock.slice(onBlock.indexOf('pull_request:'));
  const prBody = pr.split('\n').slice(1);
  const endOfPr = prBody.findIndex((l) => l.trim() !== '' && !/^ {4}/.test(l));
  const body = (endOfPr === -1 ? prBody : prBody.slice(0, endOfPr)).join('\n');
  for (const key of ['paths', 'paths-ignore', 'branches', 'branches-ignore']) {
    assert.equal(new RegExp(`^\\s*${key}:`, 'm').test(body), false,
      `${WF}'s pull_request trigger filters on \`${key}\` — a PR outside the filter never reports «${JOB_NAME}», and a required context that is never reported reads as pending, not as skipped. This is the state MEASURED on 2026-09-19 with #709 / #710 / #655 all green and all BLOCKED. Put the filter inside the job (see the scope step) so the job still reports.`);
  }
});

test('② その job は、いまも上の名前で報告する', () => {
  assert.ok(src.includes(`name: ${JOB_NAME}`),
    `${WF} no longer declares a job named «${JOB_NAME}» — renaming it silently stops satisfying the required context, and every PR goes back to BLOCKED`);
});

test('③ データベースを要する工程は 1 つ残らず scope の見張りの後ろにある', () => {
  /* Steps are asserted by what they NEED, not by a list of names copied from the file:
     anything that talks to supabase or psql cannot run without a database. */
  const steps = src.split(/^      - name: /m).slice(1)
    .map((chunk) => ({ name: chunk.split('\n')[0].trim(), body: chunk }));
  assert.ok(steps.length >= 7, `${WF} has only ${steps.length} named step(s) — the file is not what this check was written against`);

  for (const s of steps) {
    if (s.name === 'Is this a database change?') continue;
    const needsDb = /\bsupabase\s|\bpsql\b|backup-db\.sh|restore-test\.sh/.test(s.body);
    if (!needsDb) continue;
    assert.ok(/if:.*steps\.scope\.outputs\.run == 'true'/.test(s.body),
      `${WF}'s step «${s.name}» reaches a database but is not guarded by \`steps.scope.outputs.run\` — on a PR that changes no database file there is no database for it to reach, and the job would fail for a reason that has nothing to do with the PR`);
  }
});

test('④ 見張り自身が supabase/ を見ており、答えられないときは走らせる側に倒れる', () => {
  const scope = src.slice(src.indexOf('- name: Is this a database change?'));
  const step = scope.slice(0, scope.indexOf('\n      - name: ', 1));

  assert.ok(/supabase\//.test(step),
    `${WF}'s scope step no longer names supabase/ — it would report «no database change» for a migration, and the required check would go green over an untested schema. THAT is the failure this whole arrangement is built to avoid; reporting was never the point on its own.`);

  /* fail-open: everything the diff cannot answer must run the tests, not skip them */
  for (const [what, needle] of [
    ['a push or a manual dispatch', /"\$EVENT" = "pull_request"/],
    ['a base commit this checkout does not have', /git cat-file -e "\$BASE_SHA/],
    ['a diff that could not be computed', /run_full "could not diff/],
  ]) {
    assert.ok(needle.test(step),
      `${WF}'s scope step no longer falls back to running in full for ${what} — an unanswerable question would be answered «skip», which is the one answer it must never give`);
  }

  const full = step.match(/run_full \(\)[^\n]*\n/);
  assert.ok(full && /run=true/.test(full[0]),
    `${WF}'s run_full helper no longer sets run=true — the fallback that is supposed to run everything would skip everything instead`);
});
