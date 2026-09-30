/* ============================================================================
 *  tests/helpers/gate-precondition.mjs — «the gate must be green first», said honestly
 * ----------------------------------------------------------------------------
 *  The mutation tests (r274 / r280 / r399 / r403 / r407 / r473 …) all start the same way: run a
 *  gate on the tree as committed and require it to pass, because nothing they go on to prove
 *  means anything if the tree was already failing. When that precondition fails, the reader has
 *  two completely different problems in front of them:
 *
 *      · THE GATE IS WRONG — it really is red on the committed tree.
 *      · SOMETHING ELSE WROTE THE TREE — another mutation test had it broken while this one looked
 *        (until mutation-tests-off-tree, the likeliest cause; now nothing in the test run may write it).
 *
 *  ⚠⚠⚠ AND THE OLD WAY OF TELLING THEM APART ASSERTED THE OPPOSITE OF WHAT HAPPENED.
 *  `tests/r403-checks.test.mjs` sampled `git status --porcelain` AFTER the gate had returned, and
 *  its own comment said that sample is what decides: dirty means the lock broke, clean means the
 *  gate is at fault. But the interfering write is made AND PUT BACK inside the gate run — that is
 *  what a mutation test is — so by the time the sample is taken the tree is clean again. It
 *  printed «(clean)» in precisely the case it existed to catch. MEASURED: CI run 34389623083 on a
 *  branch that touched none of this; `tests/r403 ①` reported `tests/r399 ②`'s deliberate
 *  «Architecture.md no longer states how many Edge Functions there are» as its own, and the
 *  diagnostic sent the reader to the gate. The window it came through was a half-written owner
 *  stamp in the tree lock (#R623; the lock is removed — dev-notes/2026-10-01-retire-gate-lock.md).
 *
 *  ⚠ THE TREE WAS THE WRONG THING TO ASK THEN, AND THE LOCK WAS ASKED INSTEAD: every writer took
 *  the tree lock, and `lockIntact()` said whether this process's hold was still its own.
 *
 *  ⚠⚠⚠ (mutation-tests-off-tree) MOST OF THE QUESTION WENT AWAY. The mutation tests now break a
 *  PRIVATE COPY of the checkout (tests/helpers/scratch-tree.mjs) and run the gate from there, and
 *  the precondition is asked of that same copy: `runGate(gate, { tree })`. Nobody else can write a
 *  private copy, so there is no interference to rule out and the verdict says so. git is sampled on
 *  the checkout the copy was made from — «the copy carries uncommitted edits» is still an answer.
 *
 *  ⚠⚠ (retire-gate-lock, 2026-10-01) AND THE LOCK IS GONE. check:static's `tree-writer` rule
 *  (scripts/tree-writers.mjs) refuses a test that writes the working tree, so no test took the
 *  lock any more but the lock's own tests. A precondition asked of the SHARED tree now has git as
 *  its only witness, and it asks git the question git CAN answer: did the tree change between the
 *  sample before the gate and the sample after it? A change is a writer caught in the act — from
 *  outside the test run, since no test may write — and the verdict never calls that the gate's own
 *  problem. A tree that stayed the same is still not proof: a writer that mutates AND restores
 *  inside the run is invisible to two samples, and the verdict names that case instead of omitting
 *  it. Ask a private copy to rule it out.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const porcelain = () => {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() || '(clean)'; }
  catch { return '(git status unavailable)'; }
};

/* Everything known about the moment the gate ran, in the order that decides the answer.
   `where` is what `runGate` captured: `{ private: true, why }` for a private copy, otherwise
   `{ private: false, why }` for the shared working tree. */
export function verdict({ before, after, where }) {
  const lines = [];
  if (where.private) {
    if (before !== '(clean)' || after !== '(clean)') {
      lines.push('the gate ran in a PRIVATE COPY of this checkout, and the copy carries its uncommitted edits (git below) —');
      lines.push('no other test can write the copy, so the gate is reading those edits; this is not interference.');
    } else {
      lines.push('the gate ran in a PRIVATE COPY of this checkout, and git reported no change in the checkout it copies,');
      lines.push('so the gate is red on the tree AS COMMITTED — this is the gate’s own problem, not interference:');
      lines.push('no other test can write a private copy (tests/helpers/scratch-tree.mjs).');
    }
  } else if (before !== after) {
    lines.push('⚠ THE WORKING TREE CHANGED WHILE THE GATE READ IT — git differs before and after the run (below).');
    lines.push('  Something wrote the shared tree during the gate. Suspect that writer, NOT the gate. No TEST may write');
    lines.push('  the working tree (check:static `tree-writer`), so it is outside the test run — or a test the rule missed.');
  } else if (before !== '(clean)') {
    lines.push('this precondition ran on the shared working tree, and the tree was NOT clean — the gate is reading uncommitted edits.');
  } else {
    lines.push('⚠ this precondition ran on the shared working tree, not in a private copy, and git reported no change');
    lines.push('  either side of the run. That is not proof the gate is at fault: a writer that mutates and restores the tree');
    lines.push('  inside the run is invisible to two samples. No TEST writes the working tree (check:static `tree-writer`),');
    lines.push('  so such a writer would be outside the test run. To rule it out, ask a copy: runGate(gate, { tree: scratchTree() }).');
  }
  lines.push('--- where the gate ran ---   ' + where.why);
  lines.push('--- git before the gate ---  ' + before);
  lines.push('--- git after the gate ---   ' + after);
  return lines.join('\n');
}

/* Run `gate()` — which must return `{ code, out }` — and return it with `explain()` alongside.

   ⚠⚠⚠ EVERY SAMPLE IS TAKEN HERE, NOT INSIDE `explain()`. The first draft of this helper sampled
   lazily when the message was formatted — and a caller that formats it later (after the assertion
   that failed) would then be told about a moment other than the one the gate ran in: a state read
   at the wrong moment, reported as if it described another one. `explain()` is pure; it can only
   render what was captured in here. */
export function runGate(gate, { tree } = {}) {
  const before = porcelain();
  const r = gate();
  const after = porcelain();
  const where = tree
    ? { private: true, why: 'a private copy at ' + tree.root + ' — nobody else can write it' }
    : { private: false, why: 'the shared working tree at ' + ROOT };
  return { ...r, explain: () => verdict({ before, after, where }) };
}
