/* ============================================================================
 *  IntMap · #R282 source checks
 * ----------------------------------------------------------------------------
 *  「最近あなたがたくさん作業しても、One driveがあまり変わってなさそうなのはなぜですか？」
 *  「いやそもそもOneDriveが原本やろが。なんでOneDriveを編集しとらんねん。」
 *
 *  The master copy sat fifteen commits behind origin/main because no step in the workflow owned
 *  it. #R282 gave it an owner: scripts/master-sync.mjs plus the three places in CLAUDE.md that
 *  name it. This file is the measurement of that rule (#R278: a rule written in prose gets a check
 *  that measures it, in the same round) — and of the one property that makes the tool correct at
 *  all, namely that it FINDS the master rather than being told where it is.
 *
 *  ⚠ §③ AND §④ BUILD A REAL REPOSITORY AND RUN THE REAL SCRIPT AGAINST IT. A gate that only ever
 *  saw a healthy tree would be green because it looked at nothing (#R274 ③); here the synthetic
 *  master is deliberately put one commit behind, the check is required to go RED and to say so,
 *  and only then is it fast-forwarded and required to go green.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH OF THE SCRIPT. The script's own banner quotes paths
 *  and directory names that §① forbids in executable code (「自分の検査が自分のコメントに当たる」,
 *  fifteen times now).
 *  ⚠ package.json IS READ AS JSON, NOT AS TEXT — the `//master` note beside the commands says the
 *  words §⑥ looks for, and a raw-text search would find the note instead of the command.
 *  ⚠ CONTENT ASSERTIONS NORMALISE LINE ENDINGS. core.autocrlf=true is the local setting, so a
 *  checkout hands back CRLF; the claim being made here is about the bytes of the CONTENT, and
 *  writing it any other way makes the file fail on Windows for a reason that is not the subject.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const body = (p) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const SCRIPT = resolve(ROOT, 'scripts/master-sync.mjs');

/* Runs the real script; returns its exit code and streams instead of throwing, because a non-zero
   exit is the thing under test in half of these.
   ⚠ spawnSync, NOT execFileSync. execFileSync only hands back stderr by THROWING, so a run that
   succeeds has no stderr to read — and §4c asks whether a SUCCESSFUL --check still warns out loud.
   Written the other way this helper reports stderr:'' for every green run and the assertion can
   only ever fail. */
const run = (args, cwd) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/* ── ① THE MASTER IS DISCOVERED, NEVER DECLARED ─────────────────────────────────────────────────
   This is the whole reason the tool can be run from a temp worktree and still mean OneDrive. A
   literal path would work on exactly one machine and would rot the day the checkout moves. */
test('R282 (1) the master is derived from git, with no machine path in the code', () => {
  const src = codeOnly(read('scripts/master-sync.mjs'));
  assert.match(src, /--git-common-dir/, 'the master is located via `git rev-parse --git-common-dir`');
  const hard = src.match(/[A-Za-z]:[\\/]+Users[\\/]+[^\s'"`]+/g);
  assert.equal(hard, null, `a machine-specific path is hard-coded in the executable code: ${hard && hard[0]}`);
});

/* ── ② AND WHAT IT FINDS IS THE MAIN WORKTREE ───────────────────────────────────────────────────
   `git worktree list --porcelain` lists the main worktree FIRST; that is the master by definition.
   Comparing against it is mechanical and true on a CI runner as much as on the real machine. */
test('R282 (2) --path resolves to this repository\'s main worktree', () => {
  const first = execFileSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
    .split('\n')[0].replace(/^worktree\s+/, '').trim();
  const got = run(['--path'], ROOT);
  assert.equal(got.code, 0, got.stderr);
  const norm = (p) => resolve(p).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(norm(got.stdout.trim()), norm(first));
});

/* ── THE SYNTHETIC MASTER ───────────────────────────────────────────────────────────────────────
   origin.git (bare) ← worka (pushes) ; master (a clone, put behind on purpose) */
const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const scenario = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r282-'));
  const origin = join(tmp, 'origin.git'), worka = join(tmp, 'worka'), master = join(tmp, 'master');
  execFileSync('git', ['init', '--quiet', '--bare', origin]);
  execFileSync('git', ['clone', '--quiet', origin, worka]);
  gitIn(worka, 'config', 'user.email', 'r282@intmap.test');
  gitIn(worka, 'config', 'user.name', 'R282');
  gitIn(worka, 'checkout', '--quiet', '-B', 'main');
  writeFileSync(join(worka, 'a.txt'), 'one\n');
  /* a second tracked file that NO later commit touches — the stand-in for .claude/launch.json,
     which every concurrent session edited and §6 forbids committing or moving on their behalf
     (⚠ #R338 untracked that particular file; the invariant this test measures is unchanged) */
  writeFileSync(join(worka, 'keep.txt'), 'untouched by any later commit\n');
  gitIn(worka, 'add', '-A'); gitIn(worka, 'commit', '--quiet', '-m', 'one');
  gitIn(worka, 'push', '--quiet', '-u', 'origin', 'main');
  /* the bare repo's HEAD decides what a fresh clone checks out — pin it rather than trusting
     whatever init.defaultBranch happens to be on the machine running the suite */
  gitIn(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  execFileSync('git', ['clone', '--quiet', origin, master]);
  gitIn(master, 'config', 'user.email', 'r282@intmap.test');
  gitIn(master, 'config', 'user.name', 'R282');
  return { tmp, origin, worka, master };
};

const advanceOrigin = (worka) => {
  writeFileSync(join(worka, 'a.txt'), 'two\n');
  gitIn(worka, 'add', '-A'); gitIn(worka, 'commit', '--quiet', '-m', 'two');
  gitIn(worka, 'push', '--quiet', 'origin', 'main');
};

const drop = (tmp) => { try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows keeps pack files open briefly */ } };

/* ── ③ THE CHECK GOES RED ON A MASTER THAT IS BEHIND, AND SAYS SO ───────────────────────────────*/
test('R282 (3) --check fails on a master that is behind, and passes once it is synced', () => {
  const s = scenario();
  try {
    const clean = run(['--check'], s.master);
    assert.equal(clean.code, 0, `a current master should pass: ${clean.stderr}`);

    advanceOrigin(s.worka);

    const behind = run(['--check'], s.master);
    assert.equal(behind.code, 1, 'a master one commit behind origin/main must fail the check');
    assert.match(behind.stderr, /1 commit\(s\) behind origin\/main/, `the reason must be stated, got: ${behind.stderr}`);

    const synced = run(['--sync'], s.master);
    assert.equal(synced.code, 0, `--sync should fast-forward it: ${synced.stderr}`);
    assert.equal(run(['--check'], s.master).code, 0, 'and the check must then pass');
    assert.equal(body(join(s.master, 'a.txt')), 'two\n', 'the new content is actually IN the master working tree');
  } finally { drop(s.tmp); }
});

/* ── ④ IT NEVER MOVES THE MASTER OFF THE BRANCH IT IS ON (CLAUDE.md §6) ─────────────────────────
   ⚠ THIS IS THE REGRESSION TEST FOR A DEFECT THIS ROUND SHIPPED AND THE NEXT ONE TOOK OUT. The
   first --sync checked out main whenever origin/main ALREADY CONTAINED the checked-out branch, on
   the theory that a contained branch is merged and therefore safe to leave. MEASURED: a session
   sitting on «feat/session-a» in the master had its working directory switched to main by another
   session's finish step — silently, with a success message. Containment says nothing about whether
   somebody is standing there. The master is «main at origin/main» and nothing else, so the answer
   to every other state is to report it and act on nothing. */
test('R282 (4) --sync never changes the branch the master is on, merged or not', () => {
  const s = scenario();
  try {
    /* (a) A BRANCH origin/main ALREADY CONTAINS — the case the old rule walked straight through. */
    gitIn(s.master, 'checkout', '--quiet', '-b', 'session-a-merged');
    advanceOrigin(s.worka);
    /* ⚠ fetch FIRST, or origin/main is still the commit HEAD sits on and «contained» would be true
       for the trivial reason rather than the one under test. `merge-base --is-ancestor` says yes by
       exit code and prints nothing, so a throw is the no. */
    gitIn(s.master, 'fetch', '--quiet', 'origin');
    let contained = true;
    try { gitIn(s.master, 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'); } catch { contained = false; }
    assert.ok(contained, 'precondition: origin/main has MOVED PAST and still contains this branch — what made the old rule fire');
    assert.notEqual(gitIn(s.master, 'rev-parse', 'HEAD').trim(), gitIn(s.master, 'rev-parse', 'origin/main').trim(),
      'precondition: and they are genuinely different commits');

    const merged = run(['--sync'], s.master);
    assert.equal(merged.code, 1, '--sync must refuse while the master is on any branch but main');
    assert.match(merged.stderr, /not main/, `it must say why, got: ${merged.stderr}`);
    assert.equal(gitIn(s.master, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'session-a-merged',
      'the other session is STILL on its branch — this is the whole point');

    /* (b) a branch carrying work origin/main does not have */
    writeFileSync(join(s.master, 'b.txt'), 'unmerged\n');
    gitIn(s.master, 'add', '-A'); gitIn(s.master, 'commit', '--quiet', '-m', 'unmerged work');
    const unmerged = run(['--sync'], s.master);
    assert.equal(unmerged.code, 1, '--sync must refuse to abandon unmerged work');
    assert.equal(gitIn(s.master, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'session-a-merged', 'the branch is left exactly as it was');
    assert.equal(body(join(s.master, 'b.txt')), 'unmerged\n', 'and so is the work on it');

  } finally { drop(s.tmp); }
});

/* ── ④c AN UNCOMMITTED CHANGE BLOCKS ONLY WHAT GIT SAYS IT BLOCKS ───────────────────────────────
   ⚠ THE SECOND HALF OF THIS TEST IS THE ONE THAT MATTERS. The first --sync refused on ANY dirty
   file, which sounds like caution and is how a tool gets bypassed: MEASURED, the day it shipped, a
   concurrent session found the master dirty only in .claude/launch.json (#R338 untracked it) — another session's preview
   entry, which §6 forbids committing or moving — and completed its finish step by running
   `git merge --ff-only` by hand. Correct work should not have to go around the gate. */
test('R282 (4c) an unrelated edit does not block the sync; one in the way does', () => {
  const s = scenario();
  try {
    /* in the way: the incoming commit rewrites a.txt, and a.txt is locally modified */
    writeFileSync(join(s.master, 'a.txt'), 'edited by another session\n');
    advanceOrigin(s.worka);
    const blocked = run(['--sync'], s.master);
    assert.equal(blocked.code, 1, 'git must refuse to overwrite a locally modified file');
    assert.match(blocked.stderr, /a\.txt/, `git's own reason must be shown, got: ${blocked.stderr}`);
    assert.equal(body(join(s.master, 'a.txt')), 'edited by another session\n', 'and the edit survives');

    /* not in the way: keep.txt is modified, and no incoming commit touches it */
    /* ⚠ let GIT put a.txt back. Writing 'one\n' by hand leaves it modified on a core.autocrlf
       checkout, so the file would still be in the way and the test would measure the wrong thing. */
    gitIn(s.master, 'checkout', '--', 'a.txt');
    writeFileSync(join(s.master, 'keep.txt'), "another session's preview entry\n");
    const ok = run(['--sync'], s.master);
    assert.equal(ok.code, 0, `an unrelated edit must NOT block the finish step: ${ok.stderr}`);
    assert.equal(body(join(s.master, 'keep.txt')), "another session's preview entry\n",
      "and the other session's edit is still there afterwards");
    assert.equal(body(join(s.master, 'a.txt')), 'two\n', 'while the master did move to the merged state');

    /* and --check reports it without failing — the USB mirror gates on this (§11.4) */
    const checked = run(['--check'], s.master);
    assert.equal(checked.code, 0, `--check must not fail on somebody else's uncommitted file: ${checked.stderr}`);
    assert.match(checked.stderr, /warning/, 'but it must say out loud that the tree is not clean');
  } finally { drop(s.tmp); }
});

/* ── ④b AND BECAUSE IT ONLY EVER FAST-FORWARDS, IT NEEDS NO LOCK ────────────────────────────────
   The alternative design — sessions working IN the master — needs a mutex to decide who owns it,
   and a mutex needs a stale-lock story. This design has neither because the operation is
   idempotent: running it twice, or from two sessions at once, lands on the same commit. */
test('R282 (4b) --sync is idempotent, so concurrent finishes cannot disagree', () => {
  const s = scenario();
  try {
    advanceOrigin(s.worka);
    const first = run(['--sync'], s.master);
    assert.equal(first.code, 0, first.stderr);
    const head = gitIn(s.master, 'rev-parse', 'HEAD').trim();

    for (let i = 0; i < 3; i++) {
      const again = run(['--sync'], s.master);
      assert.equal(again.code, 0, `repeat ${i} should be a no-op success: ${again.stderr}`);
      assert.equal(gitIn(s.master, 'rev-parse', 'HEAD').trim(), head, 'and must land on the same commit');
    }
    assert.match(first.stdout + run(['--sync'], s.master).stdout, /already current/,
      'a repeat says it had nothing to do rather than inventing work');
  } finally { drop(s.tmp); }
});

/* ── ⑤ THE STANDING RULES STILL NAME THE STEP ───────────────────────────────────────────────────
   The defect #R282 fixed was a MISSING STEP in CLAUDE.md, so the regression to guard against is
   that step quietly falling back out of the workflow. */
test('R282 (5) CLAUDE.md ends the workflow at the master and sources the USB mirror from it', () => {
  const md = read('CLAUDE.md');

  const fence = (md.match(/```[\s\S]*?```/g) || []).find((b) => b.includes('squash merge'));
  assert.ok(fence, '§5 still states the workflow as a fenced chain');
  assert.match(fence, /branch deletion\s*→\s*原本/, 'the chain must not end at branch deletion');

  const s6 = md.slice(md.indexOf('\n## 6.'), md.indexOf('\n## 7.'));
  assert.match(s6, /原本/, '§6 names the master copy');
  assert.match(s6, /OneDrive[\\/]IntMap/, '§6 says which directory it is');
  /* the two halves that keep parallel sessions apart — both were briefly missing at once */
  assert.match(s6, /原本で\s*branch\s*を切って作業してはならない/,
    '§6 must keep the master out of the workspace role — a workspace needs a lock, and a lock needs a stale-lock story');
  assert.match(s6, /同一の\s*working directory\s*を共有してはならない/,
    '§6 must still forbid two sessions sharing one working directory');
  assert.match(s6, /冪等/, '§6 must record WHY no lock is needed, or the next round will add one');

  /* ⚠ (#R280) THE SECTION IS FOUND BY ITS SUBJECT, NOT BY ITS NUMBER. This read §11.4 literally
     until #R280 turned §11 into «when to run it» plus scripts/backup-usb.ps1, which renumbered the
     subsections. What must hold is that §11 — wherever inside it — gates the mirror on the master
     being current and names the master as the source. */
  const s11 = md.slice(md.indexOf('## 11.'), md.indexOf('## 12.'));
  assert.match(s11, /master-sync\.mjs --check/, '§11 gates the USB mirror on the master being current');
  assert.match(s11, /原本/, '§11 names the master as the mirror source');
});

/* ── ⑦ PARALLEL SESSIONS DO NOT SHARE ONE DEV SERVER ────────────────────────────────────────────
   playwright.config.js sets `reuseExistingServer: !isCI`, and the port used to be 4173 for every
   checkout on the machine. Two sessions testing at once therefore shared a server, and both
   outcomes were silent: the second run skipped its own build and tested the FIRST one's dist/, or
   it died with ERR_CONNECTION_REFUSED when the first took the server down. MEASURED, in this very
   round: 2 failed / 25 did not run on a tree whose own tests all pass — the same suite went
   52 passed the moment it was given a port of its own. */
test('R282 (7) the test port follows the checkout, so two sessions cannot collide', async () => {
  const seed = await import('../tests/helpers/session-seed.js');

  assert.equal(seed.portForPath('C:/anywhere', false), 4173,
    'the main worktree keeps 4173 — the documents and CI say 4173 and must stay true');

  const a = seed.portForPath('C:/tmp/wt-alpha', true);
  const b = seed.portForPath('C:/tmp/wt-beta', true);
  assert.notEqual(a, 4173, 'a linked worktree must not land on the shared port');
  assert.notEqual(a, b, 'two worktrees must not land on each other');
  assert.equal(a, seed.portForPath('C:/tmp/wt-alpha', true), 'and the same path must always give the same port');
  for (const p of [a, b]) assert.ok(p >= 4174 && p <= 4373, `ports stay in the reserved band — got ${p}`);

  /* the live export agrees with the pure function for THIS checkout, whichever kind it is */
  assert.equal(seed.PORT, Number(process.env.PORT || seed.portForPath(seed.REPO_ROOT, seed.isLinkedWorktree(seed.REPO_ROOT))));
  assert.equal(seed.BASE, `http://127.0.0.1:${seed.PORT}`);
});

/* ── ⑥ THE COMMANDS EXIST, AND ARE DELIBERATELY OUT OF `npm test` ───────────────────────────────
   On a CI runner the checkout is a detached PR ref, so «behind origin/main» is the correct state
   there and this gate would fail every build if it were wired into the suite. */
test('R282 (6) master:check and master:sync are exposed, and not wired into npm test', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['master:check'] || '', /master-sync\.mjs --check/);
  assert.match(pkg.scripts['master:sync'] || '', /master-sync\.mjs --sync/);
  for (const key of ['test', 'test:seq', 'test:checks']) {
    assert.ok(!/master-sync|master:check|master:sync/.test(pkg.scripts[key] || ''), `${key} must not run the master gate`);
  }
  assert.match(pkg.scripts['test:checks'] || '', /tests\/r282-checks\.test\.mjs/, 'this file runs in the suite');
});
