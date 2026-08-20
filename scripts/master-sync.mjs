#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE MASTER COPY IS THE ONEDRIVE WORKING DIRECTORY  (#R282)
 * ----------------------------------------------------------------------------
 *  「最近あなたがたくさん作業しても、One driveがあまり変わってなさそうなのはなぜですか？
 *    One driveの"IntMap"が原本なはずですが。」
 *  「いやそもそもOneDriveが原本やろが。なんでOneDriveを編集しとらんねん。」
 *
 *  Measured when that was asked: the OneDrive working directory sat at cf08e4f (R271 追記2) while
 *  origin/main was at dec64f6 — FIFTEEN commits and 159 files behind, R272 through R279 plus the
 *  handoff workflow. OneDrive itself was healthy (OneDrive.exe running, the folder mapped): the
 *  newest write to any tracked file was 2026-08-20 15:29, the exact minute of the last
 *  `pull --ff-only` in the reflog. Nothing had been WRITTEN into the folder for twelve hours, so
 *  there was nothing for the sync engine to carry.
 *
 *  ⚠ THE CAUSE WAS IN THE STANDING RULES, NOT IN ONEDRIVE. CLAUDE.md §6 asks every parallel session
 *  for its own worktree, and those worktrees live under %LOCALAPPDATA%\Temp — outside OneDrive.
 *  §5's workflow ended at «branch deletion», and §11's USB mirror was taken from whatever working
 *  directory the session happened to be in (the ledger for R279 says «mirrored from the session
 *  worktree wt-r279»). GitHub was current and the USB was current; the master was the one copy no
 *  step was responsible for. A round could finish perfectly and leave it untouched.
 *
 *  So the master is now a THING THE TOOLING KNOWS ABOUT rather than a folder someone remembers to
 *  pull. It is never hard-coded here: `git rev-parse --git-common-dir` names the main repository's
 *  .git from ANY worktree, and its parent IS the master working directory. Move the checkout and
 *  this follows it; run it from a temp worktree and it still points at OneDrive.
 *
 *      node scripts/master-sync.mjs           # report where the master is and how it stands
 *      node scripts/master-sync.mjs --path    # print the master working directory, nothing else
 *      node scripts/master-sync.mjs --check   # exit 1 unless the master IS the merged state
 *      node scripts/master-sync.mjs --sync    # fetch, then fast-forward the master onto origin/main
 *
 *  ⚠ --check IS AN END-OF-TASK GATE, NOT A CI GATE, and deliberately not in `npm test`: on a CI
 *  runner the checkout is a detached PR ref and «behind origin/main» is the normal, correct state.
 *  What CI can prove about this rule is proved in tests/r282-checks.test.mjs instead.
 *  ⚠ IT NEVER TAKES A BRANCH AWAY FROM ANOTHER SESSION (CLAUDE.md §6). --sync fast-forwards only a
 *  clean master, and only onto a branch that origin/main already contains; anything else is
 *  reported and left exactly as it was.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ARGS = new Set(process.argv.slice(2));
const want = (f) => ARGS.has(f);

/* `git -C <dir>` for every call, so nothing depends on this process's cwd after discovery. */
const git = (dir, args, { quiet = false } = {}) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] }).trim();
  } catch (e) {
    if (quiet) return null;
    throw e;
  }
};

/* ── WHERE THE MASTER IS ───────────────────────────────────────────────────────────────────────
   The main worktree's .git is the common dir; a linked worktree's .git is a FILE pointing at it.
   Asking for the common dir therefore answers «which checkout is the original» from anywhere. */
const findMaster = (from = process.cwd()) => {
  const common = git(from, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { quiet: true });
  if (!common) return null;
  return path.resolve(path.dirname(common));
};

const MASTER = findMaster();
if (!MASTER) {
  console.error('master-sync: not inside a git repository.');
  process.exit(2);
}

if (want('--path')) {
  console.log(MASTER);
  process.exit(0);
}

/* ── HOW IT STANDS ─────────────────────────────────────────────────────────────────────────────
   Three separate claims, reported separately because they fail separately: which branch is
   checked out, whether the tree is clean, and how far behind origin/main the checkout is. */
const survey = ({ fetch = true } = {}) => {
  if (fetch) git(MASTER, ['fetch', 'origin', '--quiet'], { quiet: true });
  const branch = git(MASTER, ['rev-parse', '--abbrev-ref', 'HEAD'], { quiet: true });
  const head = git(MASTER, ['rev-parse', 'HEAD'], { quiet: true });
  const target = git(MASTER, ['rev-parse', 'origin/main'], { quiet: true });
  const dirty = (git(MASTER, ['status', '--porcelain'], { quiet: true }) || '').split('\n').filter(Boolean);
  const behind = target ? Number(git(MASTER, ['rev-list', '--count', `HEAD..${target}`], { quiet: true }) || 0) : null;
  const ahead = target ? Number(git(MASTER, ['rev-list', '--count', `${target}..HEAD`], { quiet: true }) || 0) : null;
  return { branch, head, target, dirty, behind, ahead };
};

const reasons = (s) => {
  const out = [];
  if (!s.target) out.push('origin/main is unknown to the master (no remote-tracking ref).');
  if (s.branch !== 'main') out.push(`the master is on «${s.branch}», not main.`);
  if (s.dirty.length) out.push(`the master has ${s.dirty.length} uncommitted change(s).`);
  if (s.behind) out.push(`the master is ${s.behind} commit(s) behind origin/main.`);
  if (s.ahead) out.push(`the master is ${s.ahead} commit(s) ahead of origin/main (not pushed).`);
  return out;
};

if (want('--check')) {
  const s = survey({ fetch: !want('--offline') });
  const bad = reasons(s);
  if (!bad.length) {
    console.log(`master-sync: OK — ${MASTER} is main @ ${String(s.head).slice(0, 7)} = origin/main, clean.`);
    process.exit(0);
  }
  console.error(`master-sync: the master copy is NOT the merged state.\n  ${MASTER}`);
  for (const r of bad) console.error(`  · ${r}`);
  console.error('  run: node scripts/master-sync.mjs --sync');
  process.exit(1);
}

if (want('--sync')) {
  const before = survey();
  if (before.dirty.length) {
    console.error(`master-sync: refusing — ${MASTER} has ${before.dirty.length} uncommitted change(s).`);
    console.error('  another session may own them (CLAUDE.md §6). Commit or move them, then run this again.');
    process.exit(1);
  }
  if (!before.target) {
    console.error('master-sync: origin/main is unknown to the master.');
    process.exit(1);
  }
  /* Leaving a branch is only safe when origin/main already contains it — otherwise the branch is
     someone's unmerged work and switching away from it is exactly what §6 forbids. */
  if (before.branch !== 'main') {
    const contained = git(MASTER, ['merge-base', '--is-ancestor', 'HEAD', before.target], { quiet: true }) !== null;
    if (!contained) {
      console.error(`master-sync: refusing — «${before.branch}» is not contained in origin/main; it is unmerged work.`);
      process.exit(1);
    }
    git(MASTER, ['checkout', '--quiet', 'main']);
  }
  git(MASTER, ['merge', '--ff-only', '--quiet', 'origin/main']);
  const after = survey({ fetch: false });
  const moved = before.head === after.head ? 'already current' : `${String(before.head).slice(0, 7)} → ${String(after.head).slice(0, 7)}`;
  console.log(`master-sync: ${MASTER} is main @ ${String(after.head).slice(0, 7)} (${moved}).`);
  process.exit(reasons(after).length ? 1 : 0);
}

/* ── DEFAULT: SAY WHERE IT IS AND HOW IT STANDS ────────────────────────────────────────────────*/
const s = survey({ fetch: !want('--offline') });
console.log(`master   ${MASTER}`);
console.log(`branch   ${s.branch}`);
console.log(`head     ${String(s.head).slice(0, 7)}`);
console.log(`origin   ${String(s.target).slice(0, 7)}`);
console.log(`behind   ${s.behind}   ahead ${s.ahead}   uncommitted ${s.dirty.length}`);
const bad = reasons(s);
console.log(bad.length ? `\nNOT the merged state:\n  · ${bad.join('\n  · ')}` : '\nOK — the master is the merged state.');
