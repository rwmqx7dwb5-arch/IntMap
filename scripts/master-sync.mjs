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
 *  ⚠ IT NEVER TAKES A BRANCH AWAY FROM ANOTHER SESSION (CLAUDE.md §6). The master is «main, at
 *  origin/main», not a workspace: --sync only ever fast-forwards main, never checks out anything,
 *  and never writes over an uncommitted change. Anything else is reported and left as it was.
 *  ⚠ AND BECAUSE OF THAT IT NEEDS NO LOCK. Fast-forwarding main onto origin/main is idempotent, so
 *  any number of sessions may finish at once; each run carries every commit merged so far, which is
 *  also why a run that refuses can simply be left to the next one.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

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

/* ⚠ «STALE» AND «DIRTY» ARE DIFFERENT CLAIMS AND ONLY ONE OF THEM BLOCKS.
   What §11.4 gates the USB mirror on is that the master IS the merged state — which is about which
   commit it holds, not about whether some file is edited. An uncommitted change usually belongs to
   a CONCURRENT session (.claude/launch.json is the standing example: every session adds its own
   preview entry, and §6 forbids committing or moving another session's work), and the mirror copies
   the working directory anyway, so refusing on it stops correct work for no gain. MEASURED: a
   session hit exactly that on the day this shipped and finished by running git by hand. It is
   reported, loudly, and it does not fail the gate. */
const blocking = (s) => {
  const out = [];
  if (!s.target) out.push('origin/main is unknown to the master (no remote-tracking ref).');
  if (s.branch !== 'main') out.push(`the master is on «${s.branch}», not main — it is not a workspace (CLAUDE.md §6).`);
  if (s.behind) out.push(`the master is ${s.behind} commit(s) behind origin/main.`);
  if (s.ahead) out.push(`the master is ${s.ahead} commit(s) ahead of origin/main (not pushed).`);
  return out;
};
const advisory = (s) => (s.dirty.length
  ? [`the master has ${s.dirty.length} uncommitted change(s) — a concurrent session may own them (CLAUDE.md §6); they are mirrored as they are.`]
  : []);

/* ── MACHINE-LOCAL PATHS: THE ONE THING A FAST-FORWARD IS ALLOWED TO CARRY ACROSS ──────────────
   A machine-local path is one whose CONTENT belongs to this machine and to no commit: absolute
   paths into this machine's worktrees, ports this machine handed out. `.claude/launch.json` is
   the whole list, and it earned its place by measurement (#R339).

   ⚠ THE FILE THAT BLOCKED THE MERGE AND THE FILE THAT UNBLOCKS IT ARE THE SAME FILE.
   While it was tracked, every round committed its own `intmap-preview-r<N>` entry while the
   Browser preview tool wrote absolute paths into the MASTER's copy — so any concurrent session
   with a preview open left the master dirty in exactly the file the next commit changed, and
   `merge --ff-only` refused. Correctly: §6 forbids touching another session's uncommitted work.
   MEASURED 2026-08-23: the master sat 4 commits behind (R325→R335) with three such entries
   (`intmap-r328-pwtest`, `intmap-preview-r326`, `intmap-preview-r328`), and every finish step
   that day reported `RESULT skipped master-not-synced` — the USB backup had silently not run.

   ⚠ UNTRACKING IT (#R338) DOES NOT BY ITSELF FIX THIS — IT MAKES THE BLOCK PERMANENT.
   A fast-forward is one checkout from HEAD's tree to the target's tree, not a replay, so the
   commit that REMOVES the file still has to remove it here, and git refuses to remove a path that
   is locally modified («Your local changes … would be overwritten») or untracked («The following
   untracked working tree files would be removed»). MEASURED both ways in a synthetic repo before
   writing this. Left alone, the master would wedge at that one commit boundary and stay there.

   So the transition is done HERE, where the bytes can be kept: save them, let git remove the path,
   put them back. Nothing is committed, nothing is discarded, and the other session's entries come
   out the far side byte-for-byte — which is the §6 requirement, not a nicety. */
const MACHINE_LOCAL = ['.claude/launch.json'];

/* Git names the paths it refuses to clobber on their own tab-indented lines. Read THEM rather than
   guessing from the prose, so a message this does not recognise simply rescues nothing. */
const obstructedPaths = (why) => why.split('\n')
  .filter((l) => /^\t/.test(l))
  .map((l) => l.trim().replace(/\\/g, '/'))
  .filter(Boolean);

const tracked = (rev, p) => !!git(MASTER, ['ls-tree', '-r', '--name-only', rev, '--', p], { quiet: true });
const trackedNow = (p) => !!git(MASTER, ['ls-files', '--', p], { quiet: true });

/* Which machine-local paths is THIS fast-forward about to remove from the tree? Only those may be
   carried across. ⚠ A path the target still tracks is deliberately NOT eligible: restoring bytes
   over it would discard whatever the incoming commit had to say about it, which is the mistake
   this whole file exists to avoid. */
const departing = () => MACHINE_LOCAL.filter((p) => existsSync(path.join(MASTER, p)) && !tracked('origin/main', p));

if (want('--check')) {
  const s = survey({ fetch: !want('--offline') });
  const bad = blocking(s);
  for (const w of advisory(s)) console.error(`master-sync: warning — ${w}`);
  if (!bad.length) {
    console.log(`master-sync: OK — ${MASTER} is main @ ${String(s.head).slice(0, 7)} = origin/main.`);
    process.exit(0);
  }
  console.error(`master-sync: the master copy is NOT the merged state.\n  ${MASTER}`);
  for (const r of bad) console.error(`  · ${r}`);
  console.error('  run: node scripts/master-sync.mjs --sync');
  process.exit(1);
}

if (want('--sync')) {
  const before = survey();
  /* ⚠ THIS NEVER CHANGES WHICH BRANCH THE MASTER IS ON, AND NEVER TOUCHES A FILE IT DID NOT PULL.
     The first version of this switched to main whenever origin/main already contained the
     checked-out branch — which is precisely what CLAUDE.md §6 forbids. MEASURED: a session sitting
     on «feat/session-a» in the master had its working directory moved to main by ANOTHER session's
     finish step, silently and with a success message. The master is now defined as «main, at
     origin/main» (§6) and nobody works in it, so there is never a branch to leave: anything else
     means somebody is mid-round in the wrong place, and this reports it instead of acting.
     ⚠ AND IT IS IDEMPOTENT, WHICH IS WHY NO LOCK IS NEEDED. It only ever fast-forwards main onto
     origin/main, so two sessions finishing in the same second cannot disagree about the result,
     and a run that refuses costs nothing — the next session's run carries every merged commit,
     including the one belonging to the session that was refused. */
  if (before.branch !== 'main') {
    console.error(`master-sync: refusing — the master is on «${before.branch}», not main.`);
    console.error(`  ${MASTER}`);
    console.error('  the master is «main at origin/main» and is not a workspace (CLAUDE.md §6).');
    console.error('  a session is working in the wrong place; this will NOT move it. Finish or move that work.');
    process.exit(1);
  }
  if (!before.target) {
    console.error('master-sync: origin/main is unknown to the master.');
    process.exit(1);
  }
  /* ⚠ WHO DECIDES WHETHER AN UNCOMMITTED CHANGE IS IN THE WAY: GIT DOES, NOT THIS SCRIPT.
     The first version refused on ANY dirty file, which sounds cautious and is wrong — a
     fast-forward that does not touch that file cannot harm it, and refusing anyway is how a tool
     teaches people to go around it. MEASURED, the day this shipped: a concurrent session found the
     master dirty only in .claude/launch.json (another session's preview entry, which §6 forbids
     committing or moving) and completed its finish step by running `git merge --ff-only` by hand.
     A gate that correct work has to bypass is not protecting anything.
     ⚠ (#R338) THAT EXAMPLE NO LONGER EXISTS: .claude/launch.json is untracked now, because a
     machine-local file that every session edits was blocking everyone's fast-forward — and with
     it the USB backup. The rule below is unchanged and still right for the next such file.
     `merge --ff-only` already refuses, precisely, when the incoming tree would overwrite a locally
     modified file — so run it and report ITS answer. Unrelated edits survive, which is what §6
     actually asks for. */
  const ff = () => {
    try {
      execFileSync('git', ['-C', MASTER, 'merge', '--ff-only', 'origin/main'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return null;
    } catch (e) {
      return String(e.stderr || e.stdout || '').trim() || 'git gave no reason.';
    }
  };

  let why = ff();

  /* ⚠ THE RESCUE IS NARROW ON PURPOSE, AND IT IS NOT A SECOND OPINION ABOUT GIT'S ANSWER.
     It runs only when git named some paths AND every last one of them is a declared machine-local
     file that origin/main has stopped tracking. One unrecognised path and nothing is touched: the
     refusal stands and gets reported, exactly as before. This is the difference between «carry the
     machine's own scratch file across» and «decide somebody else's edit was unimportant». */
  if (why) {
    const leaving = departing();
    const blocked = obstructedPaths(why);
    if (blocked.length && blocked.every((p) => leaving.includes(p))) {
      const headBefore = git(MASTER, ['rev-parse', 'HEAD'], { quiet: true });
      const stash = mkdtempSync(path.join(tmpdir(), 'intmap-machine-local-'));
      const saved = [];
      try {
        for (const p of blocked) {
          const abs = path.join(MASTER, p);
          const keep = path.join(stash, p.replace(/[\\/]/g, '_'));
          /* Buffers, never strings: no encoding guess, no newline rewrite, no reformatting. The
             bytes that come out are the bytes that went in, and that is checkable — it is. */
          const bytes = readFileSync(abs);
          writeFileSync(keep, bytes);
          const wasTracked = trackedNow(p);
          saved.push({ p, abs, keep, wasTracked, sha: sha256(bytes), restored: false });
          if (wasTracked) git(MASTER, ['rm', '--cached', '-q', '--', p], { quiet: true });
          rmSync(abs);
        }
        why = ff();
      } finally {
        /* ⚠ IN `finally`, AND IT PUTS THE INDEX BACK TOO. If the retry failed the master must end
           up exactly as it was found — bytes on disk AND the index entry that `rm --cached` took
           out — or this «rescue» would be the very thing §6 forbids, just with a friendlier name. */
        const moved = git(MASTER, ['rev-parse', 'HEAD'], { quiet: true }) !== headBefore;
        for (const s of saved) {
          if (!moved && s.wasTracked) git(MASTER, ['reset', '-q', '--', s.p], { quiet: true });
          try { writeFileSync(s.abs, readFileSync(s.keep)); } catch { /* left false; reported below */ }
          /* «Restored» is not «writeFileSync did not throw»: read it back and compare the hash. */
          try { s.restored = existsSync(s.abs) && sha256(readFileSync(s.abs)) === s.sha; } catch { s.restored = false; }
        }
        try { rmSync(stash, { recursive: true, force: true }); } catch { /* a temp dir, not a result */ }
      }
      for (const s of saved) {
        console.error(`master-sync: ${s.p} is machine-local — carried across the fast-forward (${s.restored ? 'restored, unchanged' : '⚠ NOT RESTORED'}).`);
      }
      if (saved.some((s) => !s.restored)) {
        console.error('master-sync: a machine-local file did not come back intact — stopping rather than reporting success.');
        process.exit(1);
      }
    }
  }

  if (why) {
    console.error(`master-sync: git refused the fast-forward in ${MASTER}.`);
    for (const line of why.split('\n').slice(0, 8)) console.error(`  ${line}`);
    if (before.dirty.length) {
      console.error(`  the master has ${before.dirty.length} uncommitted change(s); another session may own them (CLAUDE.md §6).`);
    }
    console.error('  nothing is lost: this step is idempotent and the next run carries this commit too.');
    process.exit(1);
  }
  const after = survey({ fetch: false });
  const moved = before.head === after.head ? 'already current' : `${String(before.head).slice(0, 7)} → ${String(after.head).slice(0, 7)}`;
  console.log(`master-sync: ${MASTER} is main @ ${String(after.head).slice(0, 7)} (${moved}).`);
  process.exit(blocking(after).length ? 1 : 0);
}

/* ── DEFAULT: SAY WHERE IT IS AND HOW IT STANDS ────────────────────────────────────────────────*/
const s = survey({ fetch: !want('--offline') });
console.log(`master   ${MASTER}`);
console.log(`branch   ${s.branch}`);
console.log(`head     ${String(s.head).slice(0, 7)}`);
console.log(`origin   ${String(s.target).slice(0, 7)}`);
console.log(`behind   ${s.behind}   ahead ${s.ahead}   uncommitted ${s.dirty.length}`);
const bad = blocking(s);
console.log(bad.length ? `\nNOT the merged state:\n  · ${bad.join('\n  · ')}` : '\nOK — the master is the merged state.');
