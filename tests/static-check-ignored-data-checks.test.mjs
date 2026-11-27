/* check:static judges what git would commit, not everything on disk.
   Measured 2026-11-28: the directory walk also read the gitignored data/border-detail/ (9,143 files, 773 MB) three times
   each, and the gate never finished on a machine that has it. The universe is now `git ls-files --cached --others
   --exclude-standard`; this test builds a throw-away git checkout (outside this one) holding an IGNORED file and a
   COMMITTABLE file, both carrying a merge marker and invalid JSON, and asks the gate's own --list what it would read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gitUniverse } from '../scripts/check-universe.mjs';

test('the static gate reads files git would commit and skips gitignored ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-static-universe-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), '/data/ignored\n/node_modules\n');
    const bad = '<<<<<<< x\n{';
    mkdirSync(join(dir, 'data', 'ignored'), { recursive: true });
    writeFileSync(join(dir, 'data', 'ignored', 'big.json'), bad);
    mkdirSync(join(dir, 'data', 'kept'), { recursive: true });
    writeFileSync(join(dir, 'data', 'kept', 'new.json'), '{}');
    const out = gitUniverse(dir, new Set()).map((f) => f.rel);
    assert.ok(out.includes('data/kept/new.json'), 'an untracked-but-committable file is still in the universe');
    assert.equal(gitUniverse(join(dir, 'data', 'nowhere')), null, 'not a git checkout: the caller falls back to the walk');
    assert.ok(!out.includes('data/ignored/big.json'), 'a gitignored file is not read');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
