/* ============================================================================
 *  «the gate must be green first», said honestly — the verdict of tests/helpers/gate-precondition.mjs
 *  (the verdict half of the former tests/gate-lock-checks.test.mjs; the lock half went with the lock)
 * ----------------------------------------------------------------------------
 *  A mutation test first requires its gate to be green on the tree as it stands. When that
 *  precondition fails, the reader has two different problems in front of them — the gate is wrong,
 *  or something else was writing the tree while the gate read it — and the verdict has to tell
 *  them apart, and must say so when it cannot. #R623 measured it saying the opposite.
 *
 *  The tree lock that used to be one of its witnesses is removed (retire-gate-lock, 2026-10-01):
 *  check:static's `tree-writer` rule refuses a test that writes the working tree, so no test took the
 *  lock but its own. What the lock testified to — «nobody wrote the tree while the gate read it» — is
 *  now answered by where the gate ran (a private copy nobody else can write) or, on the shared tree,
 *  by the two git samples either side of the run. Facts kept here:
 *
 *    ① the verdict never blames the gate when it cannot rule out interference, and names what it
 *      cannot see instead of omitting it
 *    ② a shared tree that CHANGED during the run is reported as a writer, never as the gate
 *    ③ the samples are taken WHILE the gate runs, not when the message is printed — evaluated on a
 *      real git repository that a gate really writes to, then cleans before the message is read
 *
 *  ⚠ ③ does not touch this checkout: it copies the helper's current bytes into a throwaway git
 *  repository in the temp directory (the helper derives ROOT from its own location), so the rule
 *  is exercised as written — not a hand-maintained second copy of it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { verdict } from './helpers/gate-precondition.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLEAN = '(clean)';
const SHARED = { private: false, why: 'the shared working tree' };
const PRIVATE = { private: true, why: 'a private copy — nobody else can write it' };

test('① the verdict never blames the gate on a tree it cannot vouch for, and names what it cannot see', () => {
  /* a private copy: clean → the committed tree, so red is the gate's own */
  const copied = verdict({ before: CLEAN, after: CLEAN, where: PRIVATE });
  assert.match(copied, /PRIVATE COPY/, copied);
  assert.match(copied, /AS COMMITTED/, 'a clean private copy is the committed tree — red there is the gate’s own:\n' + copied);
  /* …a copy of a dirty checkout is not the committed tree */
  const copiedDirty = verdict({ before: ' M Architecture.md', after: ' M Architecture.md', where: PRIVATE });
  assert.doesNotMatch(copiedDirty, /AS COMMITTED/, 'a copy of a dirty checkout is not the committed tree:\n' + copiedDirty);
  assert.match(copiedDirty, /uncommitted edits/, copiedDirty);

  /* the shared tree, unchanged and clean: two samples cannot see a writer that mutates AND restores
     inside the run, so this is not proof — it must say so, and point at the copy that would be */
  const shared = verdict({ before: CLEAN, after: CLEAN, where: SHARED });
  assert.doesNotMatch(shared, /AS COMMITTED/, 'a sample of the shared tree proves nothing about the gate:\n' + shared);
  assert.match(shared, /mutates and restores/, 'the one case it cannot see must be named, not omitted:\n' + shared);
  assert.match(shared, /scratchTree\(\)/, 'it must say how to rule the case out:\n' + shared);

  /* the shared tree, dirty but unchanged: the gate is reading those edits */
  const dirty = verdict({ before: ' M Architecture.md', after: ' M Architecture.md', where: SHARED });
  assert.match(dirty, /NOT clean/, dirty);
  assert.doesNotMatch(dirty, /AS COMMITTED/, 'a tree that was already dirty is not evidence about the committed tree:\n' + dirty);
});

test('② a shared tree that changed while the gate read it is reported as a writer, never as the gate', () => {
  for (const [before, after] of [[CLEAN, ' M Architecture.md'], [' M js/app.js', CLEAN], [' M a', ' M a\n M b']]) {
    const v = verdict({ before, after, where: SHARED });
    assert.match(v, /CHANGED WHILE THE GATE READ IT/, `before «${before}» after «${after}»:\n` + v);
    assert.match(v, /NOT the gate/, v);
    assert.doesNotMatch(v, /AS COMMITTED/, v);
  }
});

test('③ the samples are taken while the gate runs, not when the message is printed', async () => {
  const DIR = mkdtempSync(join(tmpdir(), 'intmap-gate-precondition-'));
  try {
    mkdirSync(join(DIR, 'tests', 'helpers'), { recursive: true });
    cpSync(join(ROOT, 'tests', 'helpers', 'gate-precondition.mjs'), join(DIR, 'tests', 'helpers', 'gate-precondition.mjs'));
    execFileSync('git', ['init', '-q'], { cwd: DIR });
    writeFileSync(join(DIR, '.git', 'info', 'exclude'), 'tests/\n');      // the helper itself is not the subject
    const { runGate } = await import(pathToFileURL(join(DIR, 'tests', 'helpers', 'gate-precondition.mjs')).href);

    const probe = join(DIR, 'written-during-the-gate.txt');
    const r = runGate(() => { writeFileSync(probe, 'x'); return { code: 1, out: 'pretend the gate went red' }; });
    rmSync(probe);                                                       // the tree is clean again before anyone reads the verdict
    assert.equal(r.code, 1);
    assert.equal(r.out, 'pretend the gate went red');
    const v = r.explain();
    assert.match(v, /CHANGED WHILE THE GATE READ IT/,
      'the write made during the gate was not seen — the verdict is sampling at the wrong moment:\n' + v);
    assert.match(v, /git after the gate --- +\?\? written-during-the-gate\.txt/, v);
    assert.equal(r.explain(), v, 'explain() must render what was captured, not sample again');
  } finally {
    rmSync(DIR, { recursive: true, force: true });
  }
});
