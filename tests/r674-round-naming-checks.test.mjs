/* ============================================================================
 *  #R674 · the round number is not a name
 * ----------------------------------------------------------------------------
 *  Parallel sessions all take «the next free round number» from the same scan, and take it again
 *  whenever origin/main moves. #R671 was renumbered SEVEN times; a second session in the same
 *  window four. Two of them created tests/r568-checks.test.mjs, git raised an add/add conflict,
 *  the automation committed the markers, and the file stopped parsing — a whole file of
 *  regressions gone silently. scripts/round-names.mjs made the SUBJECT part of the name and
 *  scripts/static-checks.mjs refused names without one.
 *
 *  (2026-09-25) …and then the number went away as a name altogether (利用者承認済み): new files are
 *  tests/<slug>-checks.test.mjs / tests/<slug>.spec.js, the slug being the one `worktree.mjs new`
 *  was given — and `new` refuses a slug that a branch, a worktree or a file already holds. The
 *  r<N>… files stay as history, held by two numbers that only go down. The defect under test is
 *  unchanged: two sessions creating the same file name.
 *
 *  ⚠ THE PREDICATE UNDER TEST IS THE SHIPPED ONE. Nothing here re-implements the classification;
 *    a hand-written copy would drift from the gate and go on passing (#R499). Cases ①–⑥ call the
 *    exported functions, and ⑦ goes through `check:static` itself so the wiring is proved too —
 *    the module can be perfect and unreachable (#R628 measured a gate with no caller at all).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { runGate } from './helpers/gate-precondition.mjs';
import {
  roundArtefact, roundNameProblems, artefactNames, slugProblem,
  LEGACY_NUMBERED_COUNT, LEGACY_NUMBERED_MAX_ROUND,
} from '../scripts/round-names.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = join(ROOT, 'tests');
const realNames = () => readdirSync(TESTS, { withFileTypes: true })
  .filter((e) => e.isFile()).map((e) => e.name);
const NEW = LEGACY_NUMBERED_MAX_ROUND + 1;

test('R674 ① a round-numbered name is recognised, with or without a subject', () => {
  for (const n of [`r${NEW}-checks.test.mjs`, `r${NEW}.spec.js`]) {
    assert.equal(roundArtefact(n)?.bare, true, `${n} carries nothing but its round number`);
  }
  for (const n of [`r${NEW}-hover-checks.test.mjs`, `r${NEW}-model.test.mjs`, `r${NEW}-cesium.spec.js`]) {
    assert.equal(roundArtefact(n)?.bare, false, `${n} names a subject`);
    assert.equal(roundArtefact(n)?.round, NEW, `${n} is still a round-numbered name`);
  }
  /* not round-numbered at all — helpers, corpora, the named suites and the slug-named files */
  for (const n of ['security-logic.test.mjs', 'helpers.mjs', 'durations.json', 'smoke.spec.js',
    'process-without-round-numbers-checks.test.mjs', 'dem-tile-budget.spec.js']) {
    assert.equal(roundArtefact(n), null, `${n} is not a round-numbered artefact`);
  }
});

test('R674 ② the recorded snapshot matches this tree exactly', () => {
  assert.deepEqual(roundNameProblems(realNames()), [],
    'the legacy numbers in scripts/round-names.mjs have drifted from tests/');
});

test('R674 ③ a numbered name above the recorded round is refused by name — with or without a subject', () => {
  for (const n of [`r${NEW}-checks.test.mjs`, `r${NEW}-hover-checks.test.mjs`, `r${NEW}-cesium.spec.js`]) {
    const p = roundNameProblems([...realNames(), n]);
    assert.ok(p.some((m) => m.includes(`tests/${n}`)),
      `a round-numbered file written after the numbers went away must be refused: ${n}\n` + p.join('\n'));
  }
});

test('R674 ④ …and a numbered name at an unused LOW round is refused by count', () => {
  /* the round clause cannot see this one — the whole reason the ratchet is two numbers */
  const low = `r7-checks.test.mjs`;
  assert.equal(roundArtefact(low).round > LEGACY_NUMBERED_MAX_ROUND, false, 'r7 is below the snapshot');
  const p = roundNameProblems([...realNames(), low]);
  assert.ok(p.some((m) => m.includes(String(LEGACY_NUMBERED_COUNT + 1))),
    'the count must catch what the round number cannot:\n' + p.join('\n'));
});

test('R674 ⑤ the slug names worktree.mjs hands out are accepted — and a numbered or held slug is not handed out', () => {
  /* ⚠ a rule that refuses everything proves nothing. This is the case that must stay GREEN. */
  const { checks, spec } = artefactNames('round-naming');
  const names = [...realNames(), checks.slice('tests/'.length), spec.slice('tests/'.length)];
  assert.deepEqual(roundNameProblems(names), [],
    'the names scripts/worktree.mjs hands out must be names its own gate accepts');
  /* the producer refuses what the judge would refuse, at the moment the slug is chosen */
  assert.equal(slugProblem('dem-tile-budget'), null, 'a subject is a valid slug');
  assert.ok(slugProblem(`r${NEW}-dem`), 'a slug that starts with a round number must be refused');
  assert.ok(slugProblem('taken', () => 'held'), 'a slug that something already holds must be refused');
});

test('R674 ⑥ the ratchet is refused when it is left too high after a rename', () => {
  const names = realNames();
  const legacy = names.find((n) => roundArtefact(n));
  assert.ok(legacy, 'this tree still has at least one legacy round-numbered name');
  const p = roundNameProblems(names.filter((n) => n !== legacy));
  assert.ok(p.some((m) => m.includes('Lower it to')),
    'a snapshot nobody tightens stops asserting anything:\n' + p.join('\n'));
});

test('R674 ⑦ check:static actually goes red for a new round-numbered name on disk', async () => {
  await withTreeLock(() => {
    const gate = () => {
      try {
        execFileSync(process.execPath, [join(ROOT, 'scripts/static-checks.mjs')],
          { cwd: ROOT, encoding: 'utf8' });
        return { code: 0, out: '' };
      } catch (e) {
        return { code: e.status ?? -1, out: String(e.stdout || '') + String(e.stderr || '') };
      }
    };
    const pre = runGate(gate);
    assert.equal(pre.code, 0, 'check:static must be green before this means anything:\n'
      + pre.out + '\n--- who to suspect ---\n' + pre.explain());

    /* ⚠ A FILE THE RUNNER WOULD DISCOVER MUST NOT EXIST EVEN FOR A MOMENT under a name it will
       then try to execute — this one is created and removed inside the lock, and `node --test`
       globbed tests/ before any of this ran, so it is never handed to a second runner.
       ⚠ It carries a SUBJECT on purpose: that form was accepted under #R674 and is refused now. */
    const victim = join(TESTS, `r${NEW}-some-subject-checks.test.mjs`);
    let created = false;
    try {
      writeFileSync(victim, 'export {};\n');
      created = true;
      const r = gate();
      assert.notEqual(r.code, 0, 'check:static stayed green with a new round-numbered test file');
      assert.match(r.out, /round-name/, 'it failed, but not for this reason:\n' + r.out);
    } finally {
      if (created) unlinkSync(victim);
    }
    /* ⚠ The restore is checked, not re-gated: this mutation is one CREATED file, so «the file
       is gone» is the whole of «the tree is back» — and check:static costs ~45 s a run. */
    assert.equal(existsSync(victim), false, 'the tree was not restored');
  });
});
