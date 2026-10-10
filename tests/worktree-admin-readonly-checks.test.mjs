/* `worktree.mjs done` leaves no half-deleted admin directory behind (2026-10-10: 244 had piled up,
   each holding only read-only logs/ refs/ ORIG_HEAD, and `git worktree prune` failed on all of them
   every run). The sweep is exercised on a real directory tree, not read from the source. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sweepAdminRemnants } from '../scripts/worktree.mjs';

test('a half-deleted, read-only admin directory is swept; a live one is left to git', () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-admin-'));
  try {
    const dead = join(root, 'wt-gone');
    mkdirSync(join(dead, 'logs'), { recursive: true });
    mkdirSync(join(dead, 'refs'), { recursive: true });
    writeFileSync(join(dead, 'logs', 'HEAD.log'), 'x');
    writeFileSync(join(dead, 'ORIG_HEAD'), '0'.repeat(40));
    for (const p of [join(dead, 'logs', 'HEAD.log'), join(dead, 'ORIG_HEAD')]) chmodSync(p, 0o444);

    const live = join(root, 'wt-live');
    mkdirSync(live);
    writeFileSync(join(live, 'gitdir'), 'C:/somewhere/.git\n');
    const headOnly = join(root, 'wt-head');
    mkdirSync(headOnly);
    writeFileSync(join(headOnly, 'HEAD'), 'ref: refs/heads/x\n');

    const swept = sweepAdminRemnants(root);
    assert.deepEqual(swept, ['wt-gone']);
    assert.equal(existsSync(dead), false, 'the read-only remnant must be gone');
    assert.equal(existsSync(live), true, 'a directory with gitdir is a worktree git still knows');
    assert.equal(existsSync(headOnly), true, 'a directory with HEAD is not ours to delete');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing admin root is not an error', () => {
  assert.deepEqual(sweepAdminRemnants(join(tmpdir(), 'no-such-admin-root-' + process.pid)), []);
});

/* The preview tool reads only the MASTER's launch.json, so `new` writes an absolute entry there and
   `done` takes it back out; nothing else in the file is touched. */
import { upsertLaunch, previewName } from '../scripts/worktree.mjs';
import { readFileSync } from 'node:fs';

test('a preview entry is added, replaced by name, and removed without touching its neighbours', () => {
  const root = mkdtempSync(join(tmpdir(), 'wt-launch-'));
  try {
    const p = join(root, '.claude', 'launch.json');
    assert.equal(upsertLaunch(p, null, previewName('x')), false, 'removing from a missing file creates nothing');
    assert.equal(existsSync(p), false);
    upsertLaunch(p, { name: 'someone-else', port: 4100 });
    upsertLaunch(p, { name: previewName('x'), port: 4401 });
    upsertLaunch(p, { name: previewName('x'), port: 4402 });
    let names = JSON.parse(readFileSync(p, 'utf8')).configurations.map((c) => c.name + ':' + c.port);
    assert.deepEqual(names, ['intmap-preview-x:4402', 'someone-else:4100']);
    assert.equal(upsertLaunch(p, null, previewName('x')), true);
    names = JSON.parse(readFileSync(p, 'utf8')).configurations.map((c) => c.name);
    assert.deepEqual(names, ['someone-else']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
