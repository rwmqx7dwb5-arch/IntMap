/* ============================================================================
 *  #R672 · the round number is not a name
 * ----------------------------------------------------------------------------
 *  Parallel sessions all take «the next free round number» from the same scan, and take it again
 *  whenever origin/main moves. #R671 was renumbered SEVEN times; a second session in the same
 *  window four. Two of them created tests/r568-checks.test.mjs, git raised an add/add conflict,
 *  the automation committed the markers, and the file stopped parsing — a whole file of
 *  regressions gone silently. scripts/round-names.mjs makes the SUBJECT part of the name and
 *  scripts/static-checks.mjs refuses names without one.
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
  roundArtefact, roundNameProblems, roundArtefactNames,
  LEGACY_BARE_COUNT, LEGACY_BARE_MAX_ROUND,
} from '../scripts/round-names.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = join(ROOT, 'tests');
const realNames = () => readdirSync(TESTS, { withFileTypes: true })
  .filter((e) => e.isFile()).map((e) => e.name);
const NEW = LEGACY_BARE_MAX_ROUND + 1;

test('R672 ① the round number alone is bare; anything else in the name is a subject', () => {
  for (const n of [`r${NEW}-checks.test.mjs`, `r${NEW}.spec.js`]) {
    assert.equal(roundArtefact(n)?.bare, true, `${n} carries nothing but its round number`);
  }
  for (const n of [`r${NEW}-hover-checks.test.mjs`, `r${NEW}-model.test.mjs`, `r${NEW}-cesium.spec.js`]) {
    assert.equal(roundArtefact(n)?.bare, false, `${n} names a subject`);
  }
  /* not a per-round artefact at all — helpers, corpora and the two named suites stay untouched */
  for (const n of ['security-logic.test.mjs', 'helpers.mjs', 'durations.json', 'smoke.spec.js']) {
    assert.equal(roundArtefact(n), null, `${n} is not a per-round artefact`);
  }
});

test('R672 ② the recorded snapshot matches this tree exactly', () => {
  assert.deepEqual(roundNameProblems(realNames()), [],
    'the legacy numbers in scripts/round-names.mjs have drifted from tests/');
});

test('R672 ③ a bare name above the recorded round is refused by name', () => {
  const p = roundNameProblems([...realNames(), `r${NEW}-checks.test.mjs`]);
  assert.ok(p.some((m) => m.includes(`tests/r${NEW}-checks.test.mjs`)),
    'a round-number-only file from a round after the rule landed must be named:\n' + p.join('\n'));
});

test('R672 ④ …and a bare name at an unused LOW round is refused by count', () => {
  /* the round clause cannot see this one — the whole reason the ratchet is two numbers */
  const low = `r7-checks.test.mjs`;
  assert.equal(roundArtefact(low).round > LEGACY_BARE_MAX_ROUND, false, 'r7 is below the snapshot');
  const p = roundNameProblems([...realNames(), low]);
  assert.ok(p.some((m) => m.includes(String(LEGACY_BARE_COUNT + 1))),
    'the count must catch what the round number cannot:\n' + p.join('\n'));
});

test('R672 ⑤ a subject-bearing name from the same new round is accepted', () => {
  /* ⚠ a rule that refuses everything proves nothing. This is the case that must stay GREEN. */
  const { checks, spec } = roundArtefactNames(NEW, 'round-naming');
  const names = [...realNames(), checks.slice('tests/'.length), spec.slice('tests/'.length)];
  assert.deepEqual(roundNameProblems(names), [],
    'the names scripts/worktree.mjs hands out must be names its own gate accepts');
});

test('R672 ⑥ the ratchet is refused when it is left too high after a rename', () => {
  const names = realNames();
  const legacy = names.find((n) => roundArtefact(n)?.bare);
  assert.ok(legacy, 'this tree still has at least one legacy bare name');
  const p = roundNameProblems(names.filter((n) => n !== legacy));
  assert.ok(p.some((m) => m.includes('Lower it to')),
    'a snapshot nobody tightens stops asserting anything:\n' + p.join('\n'));
});

test('R672 ⑦ check:static actually goes red for a bare name on disk', async () => {
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
       globbed tests/ before any of this ran, so it is never handed to a second runner. */
    const victim = join(TESTS, `r${NEW}-checks.test.mjs`);
    let created = false;
    try {
      writeFileSync(victim, 'export {};\n');
      created = true;
      const r = gate();
      assert.notEqual(r.code, 0, 'check:static stayed green with a round-number-only test file');
      assert.match(r.out, /round-name/, 'it failed, but not for this reason:\n' + r.out);
    } finally {
      if (created) unlinkSync(victim);
    }
    /* ⚠ The restore is checked, not re-gated: this mutation is one CREATED file, so «the file
       is gone» is the whole of «the tree is back» — and check:static costs ~45 s a run, which is
       a third of this test's wall clock for an assertion the deletion already made. */
    assert.equal(existsSync(victim), false, 'the tree was not restored');
  });
});
