/* ============================================================================
 *  IntMap · the master copy is discovered, fast-forwarded, and never taken from another session
 * ----------------------------------------------------------------------------
 *  scripts/master-sync.mjs owns the step that makes a round exist in the master (AGENTS.md §6). Every
 *  behavioural case builds a real repository under os.tmpdir() and runs the real script: behind →
 *  red, synced → green, never off its branch, unrelated dirt does not block, idempotent (#R282);
 *  the machine-local preview config is carried across the commit that untracks it and nothing
 *  else is ever rescued (#R339).
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r282, r339
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R282 — was tests/r282-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · #R282 source checks
 * ----------------------------------------------------------------------------
 *  「最近あなたがたくさん作業しても、One driveがあまり変わってなさそうなのはなぜですか？」
 *  「いやそもそもOneDriveが原本やろが。なんでOneDriveを編集しとらんねん。」
 *
 *  The master copy sat fifteen commits behind origin/main because no step in the workflow owned
 *  it. #R282 gave it an owner: scripts/master-sync.mjs plus the three places in AGENTS.md that
 *  name it. This file is the measurement of that rule (#R278: a rule written in prose gets a check
 *  that measures it, in the same round) — and of the one property that makes the tool correct at
 *  all, namely that it FINDS the master rather than being told where it is.
 *
 *  ⚠ §③ AND §④ BUILD A REAL REPOSITORY AND RUN THE REAL SCRIPT AGAINST IT. A gate that only ever
 *  saw a healthy tree would be green because it looked at nothing (#R274 ③); here the synthetic
 *  master is deliberately put one commit behind, the check is required to go RED and to say so,
 *  and only then is it fast-forwarded and required to go green.
 *  ⚠ (tests regrouped by subject) §① NO LONGER SEARCHES THE SCRIPT AT ALL. It used to strip the
 *  comments and grep for `--git-common-dir` and for a machine path, because the script's own banner
 *  quotes the paths it forbids; it now runs the script in a throw-away repository and a linked
 *  worktree of it, which is what those spellings stood for.
 *  ⚠ package.json IS READ AS JSON, NOT AS TEXT — the `//master` note beside the commands says the
 *  words §⑥ looks for, and a raw-text search would find the note instead of the command.
 *  ⚠ CONTENT ASSERTIONS NORMALISE LINE ENDINGS. core.autocrlf=true is the local setting, so a
 *  checkout hands back CRLF; the claim being made here is about the bytes of the CONTENT, and
 *  writing it any other way makes the file fail on Windows for a reason that is not the subject.
 * ==========================================================================*/

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
  /* (tests regrouped by subject) EVALUATED, not read. This used to grep the script for
     `--git-common-dir` and for a `C:\Users\…` literal — which proves a spelling: a discovery that is
     written but bypassed, or a machine path assembled from parts, passed it. The property is that the
     tool names WHICHEVER repository it is run in, so it is run in a throw-away one that lives where no
     hard-coded path could point, and in a linked worktree of it (the case --git-common-dir exists for:
     a linked worktree's .git is a file, and only the common dir names the original). */
  const s = scenario();
  try {
    const norm = (p) => resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    const fromMaster = run(['--path'], s.master);
    assert.equal(fromMaster.code, 0, fromMaster.stderr);
    assert.equal(norm(fromMaster.stdout.trim()), norm(s.master),
      'run inside a throw-away repository, --path must name THAT repository — anything else is a path the script carries');
    const linked = join(s.tmp, 'linked');
    gitIn(s.master, 'worktree', 'add', '--quiet', '-b', 'r282-linked', linked);
    const fromLinked = run(['--path'], linked);
    assert.equal(fromLinked.code, 0, fromLinked.stderr);
    assert.equal(norm(fromLinked.stdout.trim()), norm(s.master),
      'from a linked worktree it must still name the main one — the master is derived, not the cwd echoed back');
  } finally { drop(s.tmp); }
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

/* ── ④ IT NEVER MOVES THE MASTER OFF THE BRANCH IT IS ON (AGENTS.md §6) ─────────────────────────
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
   The defect #R282 fixed was a MISSING STEP in AGENTS.md, so the regression to guard against is
   that step quietly falling back out of the workflow. */
test('R282 (5) AGENTS.md ends the workflow at the master and sources the USB mirror from it', () => {
  const md = read('AGENTS.md');

  /* ⚠ (#R771) THE DEFECT IS «THE MASTER UPDATE FELL OUT OF THE WORKFLOW», NOT «THERE IS ONE FENCE».
     This read the chain as a single fence ending 「branch deletion → 原本」 until #R771 split §5.1
     into what the round does (no waiting) and what the NEXT round's opening collects (production
     verification · master · USB). Nothing was removed — the master update moved — and a check
     written against the shape rather than the defect calls that a regression.
     [[intmap-restate-the-defect-not-the-fix]]: what must hold is that §5.1 still names the merge,
     still names the master update, and does not stop at deleting the branch. */
  const s51 = md.slice(md.indexOf('### 5.1'), md.indexOf('\n### ただし'));
  assert.ok(s51.length > 200, '§5.1 still states the workflow');
  assert.match(s51, /squash merge|--squash/, '§5.1 must still name the merge');
  assert.match(s51, /master-sync\.mjs --sync/, 'the workflow must not end at branch deletion — the master update is part of it');
  assert.ok(s51.indexOf('master-sync.mjs --sync') > s51.search(/squash merge|--squash/),
    'the master update must come AFTER the merge, or it carries a commit that is not on main yet');
  const fence = (s51.match(/```[\s\S]*?```/g) || []).find((b) => /→/.test(b));
  assert.ok(fence, '§5.1 still states the order as a fenced chain');

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
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R339 — was tests/r339-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
      'the other session\'s bytes must survive byte-for-byte (AGENTS.md §6)');
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
/* ⚠ (tests regrouped by subject) A SOURCE PIN, AND IT HAS TO BE. §③ and §⑤ prove behaviourally that
   an ordinary file and a still-tracked one are never rescued, but «the list holds ONLY this path» is
   a claim about a list no scenario can enumerate — a second entry is simply never exercised until the
   day it discards somebody's file — and scripts/master-sync.mjs runs at import and exports nothing. */
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
}
