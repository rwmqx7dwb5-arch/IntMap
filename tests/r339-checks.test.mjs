/* ============================================================================
 *  IntMap · #R339 source checks — carrying a machine-local file across a fast-forward
 * ----------------------------------------------------------------------------
 *  「`node scripts/master-sync.mjs --sync` が繰り返し塞がれていて、そのたびに
 *    `scripts/backup-usb.ps1` が `RESULT skipped master-not-synced` で終わる
 *    ——つまり USB バックアップが黙って行われていない。」
 *
 *  MEASURED 2026-08-23: the master sat 4 commits behind origin/main (R325→R335) and the
 *  fast-forward was refused with «Your local changes to the following files would be overwritten
 *  by merge: .claude/launch.json». The uncommitted change was three preview entries pointing at
 *  OTHER sessions' worktrees — absolute machine paths written by the Browser preview tool, which
 *  always writes into the MASTER's copy no matter which worktree the session works in. §6 forbids
 *  stashing or discarding another session's uncommitted work, so the refusal was CORRECT and the
 *  master simply drifted, silently taking the USB backup down with it.
 *
 *  ⚠ THE FIX THAT LOOKS OBVIOUS — «stop tracking it» (#R338) — DOES NOT BY ITSELF WORK, AND §② IS
 *  HERE TO KEEP THAT MEASURED RATHER THAN REMEMBERED. A fast-forward is a single checkout from
 *  HEAD's tree to the target's tree, not a replay of the commits between, so the commit that
 *  REMOVES the file still has to remove it here — and git refuses to remove a path that is locally
 *  modified, and equally refuses to remove one that is untracked. Untracked alone, the master
 *  wedges at that one commit boundary and stays there. The bytes have to be carried across by
 *  something, and the only place that can do it without committing or discarding them is the sync
 *  tool itself.
 *
 *  ⚠ EVERY CASE HERE BUILDS A REAL REPOSITORY AND RUNS THE REAL SCRIPT (#R282 ③'s rule). §② and
 *  §③ additionally require the UNRESCUED path to stay red: a rescue that fired on everything would
 *  pass §① while quietly being the §6 violation this file exists to prevent.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(ROOT, 'scripts/master-sync.mjs');
const LOCAL = '.claude/launch.json';
const sha = (b) => createHash('sha256').update(b).digest('hex');

const run = (args, cwd) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const gitTry = (dir, ...args) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};

/* The three entries that were actually sitting in the master when this was measured. */
const OTHER_SESSIONS = JSON.stringify({
  version: '0.0.1',
  configurations: [
    { name: 'intmap-r328-pwtest', port: 4264, runtimeArgs: ['scripts/serve.mjs', '--root', 'C:/Users/gyuuk/AppData/Local/Temp/intmap-worktrees/wt-r328-r328-routing-nav/dist'] },
    { name: 'intmap-preview-r326', port: 4326, runtimeArgs: ['scripts/serve.mjs', '--root', 'C:/Users/gyuuk/AppData/Local/Temp/intmap-worktrees/wt-r326-deep-time-wars/dist'] },
  ],
}, null, 2) + '\n';

/* origin.git (bare) ← worka (pushes) ; master (a clone, put behind on purpose) */
const scenario = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r339-'));
  const origin = join(tmp, 'origin.git'), worka = join(tmp, 'worka'), master = join(tmp, 'master');
  execFileSync('git', ['init', '--quiet', '--bare', origin]);
  execFileSync('git', ['clone', '--quiet', origin, worka]);
  gitIn(worka, 'config', 'user.email', 'r339@intmap.test');
  gitIn(worka, 'config', 'user.name', 'R339');
  gitIn(worka, 'checkout', '--quiet', '-B', 'main');
  mkdirSync(join(worka, '.claude'), { recursive: true });
  writeFileSync(join(worka, LOCAL), '{\n  "version": "0.0.1",\n  "configurations": []\n}\n');
  writeFileSync(join(worka, 'a.txt'), 'one\n');
  writeFileSync(join(worka, '.gitignore'), 'node_modules/\n');
  gitIn(worka, 'add', '-A'); gitIn(worka, 'commit', '--quiet', '-m', 'one');
  gitIn(worka, 'push', '--quiet', '-u', 'origin', 'main');
  gitIn(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  execFileSync('git', ['clone', '--quiet', origin, master]);
  gitIn(master, 'config', 'user.email', 'r339@intmap.test');
  gitIn(master, 'config', 'user.name', 'R339');
  return { tmp, origin, worka, master };
};

/* THE #R338 COMMIT: stop tracking the machine-local file, and ignore it, in one commit. */
const originUntracksLocal = (worka) => {
  gitIn(worka, 'rm', '--quiet', '--cached', '--', LOCAL);
  writeFileSync(join(worka, '.gitignore'), `node_modules/\n${LOCAL}\n`);
  writeFileSync(join(worka, 'a.txt'), 'two\n');
  gitIn(worka, 'add', '-A'); gitIn(worka, 'commit', '--quiet', '-m', 'untrack the machine-local preview config');
  gitIn(worka, 'push', '--quiet', 'origin', 'main');
};

const drop = (tmp) => { try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows keeps pack files open briefly */ } };

/* ── ① THE TRANSITION SUCCEEDS AND THE OTHER SESSION'S BYTES SURVIVE IT ─────────────────────────
   This is the whole point: the master ends up AT origin/main, and the file that was in the way
   comes out the other side byte-for-byte. Not «similar», not «regenerated» — identical. */
test('R339 (1) --sync carries the machine-local file across the commit that untracks it', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.master, LOCAL), OTHER_SESSIONS);
    const before = sha(readFileSync(join(s.master, LOCAL)));
    originUntracksLocal(s.worka);

    const got = run(['--sync'], s.master);
    assert.equal(got.code, 0, `--sync must fast-forward past the untrack commit, got: ${got.stderr}`);

    assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), gitIn(s.master, 'rev-parse', 'origin/main').trim(),
      'the master must actually be at origin/main afterwards');
    assert.ok(existsSync(join(s.master, LOCAL)), 'the machine-local file must still exist');
    assert.equal(sha(readFileSync(join(s.master, LOCAL))), before,
      'the other session\'s bytes must survive byte-for-byte (CLAUDE.md §6)');
    assert.match(got.stderr, /machine-local/, 'the carry must be reported out loud, not done silently');
    /* and the tree is clean, because the incoming commit also started ignoring it — which is what
       makes the NEXT round's --check pass and the USB backup actually run */
    assert.equal(gitIn(s.master, 'status', '--porcelain').trim(), '',
      'once ignored upstream the master should be clean, so --check stops warning');
  } finally { drop(s.tmp); }
});

/* ── ② …AND PLAIN GIT REFUSES THE SAME MOVE, WHICH IS WHY §① IS NOT GREEN FOR FREE ──────────────
   #R338's untracking, alone, leaves exactly this state. If this case ever goes green on its own,
   git changed its mind about clobbering and §① is measuring nothing. */
test('R339 (2) the same fast-forward is refused without the rescue — the block is real', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.master, LOCAL), OTHER_SESSIONS);
    originUntracksLocal(s.worka);
    gitIn(s.master, 'fetch', '--quiet', 'origin');

    const raw = gitTry(s.master, 'merge', '--ff-only', 'origin/main');
    assert.equal(raw.code, 1, 'plain `git merge --ff-only` must still refuse this');
    assert.match(raw.out, /\.claude[\\/]launch\.json/, `git must name the file, got: ${raw.out}`);
    assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), gitIn(s.master, 'rev-parse', 'origin/main~1').trim(),
      'and the master must not have moved');
  } finally { drop(s.tmp); }
});

/* ── ③ AN OBSTRUCTION THAT IS NOT MACHINE-LOCAL STILL REFUSES, AND NOTHING IS TOUCHED ───────────
   The failure mode a rescue invites is «rescue everything». A dirty a.txt belongs to whoever
   edited it; §6 says leave it alone, and that means the refusal must survive. */
test('R339 (3) --sync still refuses when a non-machine-local file is in the way', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.master, 'a.txt'), 'someone else was editing this\n');
    const mine = sha(readFileSync(join(s.master, 'a.txt')));
    const head = gitIn(s.master, 'rev-parse', 'HEAD').trim();
    originUntracksLocal(s.worka);

    const got = run(['--sync'], s.master);
    assert.equal(got.code, 1, 'a dirty unrelated file must still stop the fast-forward');
    assert.match(got.stderr, /refused the fast-forward/, `git's own answer must be reported: ${got.stderr}`);
    assert.equal(sha(readFileSync(join(s.master, 'a.txt'))), mine, 'the other session\'s edit must be untouched');
    assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), head, 'and the master must not have moved');
  } finally { drop(s.tmp); }
});

/* ── ④ A MIXED OBSTRUCTION IS ALL-OR-NOTHING ────────────────────────────────────────────────────
   The bug this case exists for: rescuing the machine-local half of a mixed obstruction, failing on
   the other half, and leaving the master half-dismantled while reporting a clean refusal. MEASURED
   while writing this: git names BOTH categories in one message («local changes … would be
   overwritten» AND «untracked working tree files would be …»), so `blocked` contains the
   non-machine-local path too and the rescue correctly declines to start.
   ⚠ WHAT THIS CASE DOES *NOT* MEASURE, SAID OUT LOUD: the index restore in the script's `finally`.
   Deleting that line leaves this test green, because here the rescue never starts and there is no
   `rm --cached` to undo. It is unreachable from any scenario this suite can stage — a diverged
   master aborts before naming any path, and a mixed obstruction is named all at once. It guards a
   PRODUCTION RACE instead: the Browser preview tool writes the master's launch.json at arbitrary
   moments, so it can recreate the file between the rmSync and the retry. §⑧ pins the line; nothing
   here proves it fires. */
test('R339 (4) a mixed obstruction refuses without starting the rescue', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.master, LOCAL), OTHER_SESSIONS);
    writeFileSync(join(s.master, 'a.txt'), 'also being edited\n');
    const localSha = sha(readFileSync(join(s.master, LOCAL)));
    const head = gitIn(s.master, 'rev-parse', 'HEAD').trim();
    const statusBefore = gitIn(s.master, 'status', '--porcelain').trim();
    originUntracksLocal(s.worka);

    const got = run(['--sync'], s.master);
    assert.equal(got.code, 1, 'one non-rescuable path must sink the whole fast-forward');
    assert.doesNotMatch(got.stderr, /machine-local/,
      'the rescue must not even start when one of the named paths is not machine-local');
    assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), head, 'the master must not have moved');
    assert.ok(existsSync(join(s.master, LOCAL)), 'the machine-local file must not be left deleted');
    assert.equal(sha(readFileSync(join(s.master, LOCAL))), localSha, 'its bytes must be back exactly');
    assert.equal(gitIn(s.master, 'status', '--porcelain').trim(), statusBefore,
      'the index must be back too — `rm --cached` must not survive a failed rescue');
  } finally { drop(s.tmp); }
});

/* ── ⑤ A PATH THE TARGET STILL TRACKS IS NOT ELIGIBLE ───────────────────────────────────────────
   Restoring bytes over a file the incoming commit still has something to say about would discard
   that commit's content. The rescue is for a file that is LEAVING the tree, and only that. */
test('R339 (5) the rescue does not fire while origin/main still tracks the file', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.master, LOCAL), OTHER_SESSIONS);
    const head = gitIn(s.master, 'rev-parse', 'HEAD').trim();
    /* origin changes the file but keeps tracking it — the pre-#R338 world */
    writeFileSync(join(s.worka, LOCAL), '{\n  "version": "0.0.1",\n  "configurations": [{ "name": "upstream" }]\n}\n');
    gitIn(s.worka, 'add', '-A'); gitIn(s.worka, 'commit', '--quiet', '-m', 'upstream edits the preview config');
    gitIn(s.worka, 'push', '--quiet', 'origin', 'main');

    const got = run(['--sync'], s.master);
    assert.equal(got.code, 1, 'a still-tracked file must fall through to git\'s ordinary refusal');
    assert.doesNotMatch(got.stderr, /machine-local/, 'the rescue must not claim to have carried anything');
    assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), head, 'the master must not have moved');
    assert.equal(sha(readFileSync(join(s.master, LOCAL))), sha(Buffer.from(OTHER_SESSIONS)),
      'and the local bytes must be untouched');
  } finally { drop(s.tmp); }
});

/* ── ⑥ THE STEADY STATE COSTS NOTHING ───────────────────────────────────────────────────────────
   After the transition the file is untracked and ignored, so a fast-forward has no opinion about
   it and the rescue must never run. */
test('R339 (6) once the file is untracked and ignored, --sync is an ordinary fast-forward', () => {
  const s = scenario();
  try {
    originUntracksLocal(s.worka);
    writeFileSync(join(s.master, LOCAL), OTHER_SESSIONS);
    const first = run(['--sync'], s.master);
    assert.equal(first.code, 0, `the transition itself must pass: ${first.stderr}`);

    /* a later, ordinary commit that has nothing to do with the machine-local file */
    writeFileSync(join(s.worka, 'a.txt'), 'three\n');
    gitIn(s.worka, 'add', '-A'); gitIn(s.worka, 'commit', '--quiet', '-m', 'three');
    gitIn(s.worka, 'push', '--quiet', 'origin', 'main');

    const kept = sha(readFileSync(join(s.master, LOCAL)));
    const again = run(['--sync'], s.master);
    assert.equal(again.code, 0, `an ordinary fast-forward must pass: ${again.stderr}`);
    assert.doesNotMatch(again.stderr, /machine-local/, 'nothing needed carrying, so nothing should be reported');
    assert.equal(sha(readFileSync(join(s.master, LOCAL))), kept, 'and the file is simply left alone');
  } finally { drop(s.tmp); }
});

/* ── ⑦ THE LIST IS DECLARED, NARROW, AND SAYS WHY ───────────────────────────────────────────────
   A rescue list that grows by habit becomes «overwrite whatever is inconvenient». One entry today;
   anything added has to be a file whose content belongs to the machine and to no commit. */
test('R339 (7) the machine-local list is explicit and holds only the preview config', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const decl = src.match(/const MACHINE_LOCAL = \[([^\]]*)\]/);
  assert.ok(decl, 'scripts/master-sync.mjs must declare MACHINE_LOCAL explicitly');
  const paths = [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(paths, [LOCAL], `the list must hold exactly ${LOCAL}, got: ${paths.join(', ')}`);
});

/* ── ⑧ THE UNDO PATH IS PINNED IN SOURCE, BECAUSE NO SCENARIO HERE CAN FIRE IT ──────────────────
   ⚠ THIS IS A WEAKER CLAIM THAN EVERY CASE ABOVE AND IS LABELLED AS ONE. §④ explains why the
   half-dismantled state is unreachable from a staged repository; the line still has to exist,
   because the race it covers is real (the preview tool writes the master's launch.json whenever a
   concurrent session opens a preview, including between the rmSync and the retry). Pinning it in
   source is the honest amount of confidence available: it catches deletion, not misbehaviour. */
test('R339 (8) a rescue that does not move HEAD puts the index entry back', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const fin = src.match(/finally \{[\s\S]*?\n      \}/);
  assert.ok(fin, 'the rescue must restore inside a `finally`, not on the success path');
  assert.match(fin[0], /!moved && s\.wasTracked/,
    'a rescue that failed must undo its own `git rm --cached` (see §④ for why no case here fires it)');
  assert.match(fin[0], /reset/, 'and it must do that with `git reset -- <path>`');
  assert.match(fin[0], /s\.restored = /, 'and it must verify the bytes came back, not assume it');
});
