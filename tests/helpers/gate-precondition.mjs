/* ============================================================================
 *  tests/helpers/gate-precondition.mjs — «the gate must be green first», said honestly
 * ----------------------------------------------------------------------------
 *  The mutation tests (r274 / r280 / r399 / r403 / r407 / r473 …) all start the same way: run a
 *  gate on the tree as committed and require it to pass, because nothing they go on to prove
 *  means anything if the tree was already failing. When that precondition fails, the reader has
 *  two completely different problems in front of them:
 *
 *      · THE GATE IS WRONG — it really is red on the committed tree.
 *      · THE LOCK BROKE — another mutation test had the tree broken while this one looked.
 *
 *  ⚠⚠⚠ AND THE OLD WAY OF TELLING THEM APART ASSERTED THE OPPOSITE OF WHAT HAPPENED.
 *  `tests/r403-checks.test.mjs` sampled `git status --porcelain` AFTER the gate had returned, and
 *  its own comment said that sample is what decides: dirty means the lock broke, clean means the
 *  gate is at fault. But the interfering write is made AND PUT BACK inside the gate run — that is
 *  what a mutation test is — so by the time the sample is taken the tree is clean again. It
 *  printed «(clean)» in precisely the case it existed to catch. MEASURED: CI run 34389623083 on a
 *  branch that touched none of this; `tests/r403 ①` reported `tests/r399 ②`'s deliberate
 *  «Architecture.md no longer states how many Edge Functions there are» as its own, and the
 *  diagnostic sent the reader to the gate. The window it came through is in the header of
 *  `tests/helpers/gate-lock.mjs`.
 *
 *  ⚠ THE TREE IS THE WRONG THING TO ASK. Every writer takes the tree lock, so the question
 *  «could anybody else have been writing?» is a question about the LOCK, and the lock can answer
 *  it exactly: `lockIntact()` says whether the hold this process took is still the hold it has.
 *  git is still sampled either side of the run — a tree that was dirty before the gate ever ran
 *  is a third answer, and a worthwhile one — but it is no longer asked to testify about a moment
 *  it cannot see.
 *
 *  ⚠⚠ AND WHERE IT STILL CANNOT TELL, IT SAYS SO. One case remains invisible: a writer that
 *  mutates and restores the tree inside the gate run WITHOUT taking the lock. Nothing here can
 *  see that, so the verdict names it rather than quietly excluding it.
 *
 *  ⚠⚠⚠ (mutation-tests-off-tree) MOST OF THE QUESTION WENT AWAY. The mutation tests now break a
 *  PRIVATE COPY of the checkout (tests/helpers/scratch-tree.mjs) and run the gate from there, and
 *  the precondition is asked of that same copy: `runGate(gate, { tree })`. Nobody else can write a
 *  private copy, so there is no interference to rule out and the verdict says so. git is sampled on
 *  the checkout the copy was made from — «the copy carries uncommitted edits» is still an answer.
 *  A precondition asked of the real tree without the lock is no longer a mistake either:
 *  check:static's `tree-writer` rule refuses a test that writes the working tree, so the one way
 *  left to be interfered with is from OUTSIDE the test run, and the verdict names that.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockIntact } from './gate-lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const porcelain = () => {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() || '(clean)'; }
  catch { return '(git status unavailable)'; }
};

/* Everything known about the moment the gate ran, in the order that decides the answer. */
export function verdict({ before, after, lock }) {
  const lines = [];
  if (lock.private) {
    if (before !== '(clean)' || after !== '(clean)') {
      lines.push('the gate ran in a PRIVATE COPY of this checkout, and the copy carries its uncommitted edits (git below) —');
      lines.push('no other test can write the copy, so the gate is reading those edits; this is not interference.');
    } else {
      lines.push('the gate ran in a PRIVATE COPY of this checkout, and git reported no change in the checkout it copies,');
      lines.push('so the gate is red on the tree AS COMMITTED — this is the gate’s own problem, not interference:');
      lines.push('no other test can write a private copy (tests/helpers/scratch-tree.mjs).');
    }
  } else if (!lock.held) {
    lines.push('⚠ this precondition ran on the shared working tree, outside the tree lock and not in a private copy.');
    lines.push('  No TEST writes the working tree (check:static `tree-writer`), so a writer would be outside the test run;');
    lines.push('  git below is the only witness. To rule it out, ask a copy: runGate(gate, { tree: scratchTree() }).');
  } else if (!lock.intact) {
    lines.push('THE LOCK BROKE — ' + lock.why + '.');
    lines.push('Another mutation test had this tree broken while the gate read it. Suspect the lock, NOT the gate:');
    lines.push('the failure above is most likely that other test\u2019s deliberate mutation, reported here as ours.');
  } else if (before !== '(clean)' || after !== '(clean)') {
    lines.push('the tree lock held throughout, but the working tree was NOT clean — the gate is reading uncommitted edits.');
  } else {
    lines.push('the tree lock held throughout, and git reported no change either side of the run,');
    lines.push('so the gate is red on the tree AS COMMITTED — this is the gate\u2019s own problem, not interference.');
    lines.push('⚠ the one thing this cannot see is a writer that mutates and restores the tree inside the gate run');
    lines.push('  WITHOUT taking the tree lock; every writer is required to take it (tests/helpers/gate-lock.mjs).');
  }
  lines.push('--- tree lock ---            ' + lock.why);
  lines.push('--- git before the gate ---  ' + before);
  lines.push('--- git after the gate ---   ' + after);
  return lines.join('\n');
}

/* Run `gate()` — which must return `{ code, out }` — and return it with `explain()` alongside.
   ⚠ CALL IT INSIDE THE HOLD. Sampling after the hold is released is the defect described above.

   ⚠⚠⚠ AND EVERY SAMPLE IS TAKEN HERE, NOT INSIDE `explain()`. The first draft of this helper left
   `lockIntact()` to be called lazily when the message was formatted — and the caller that formats
   it after the hold has been released (`tests/r280 ①` does exactly that, because the assertion is
   outside `withTreeLock`) would then be told «this did not run under the tree lock», which is both
   false and the same mistake in a new place: a state read at the wrong moment, reported as if it
   described another one. `explain()` is pure; it can only render what was captured in here. */
export function runGate(gate, { tree } = {}) {
  const before = porcelain();
  const r = gate();
  const after = porcelain();
  const lock = tree
    ? { private: true, held: false, intact: false, why: 'none needed — the gate ran in a private copy at ' + tree.root }
    : lockIntact();
  return { ...r, explain: () => verdict({ before, after, lock }) };
}
