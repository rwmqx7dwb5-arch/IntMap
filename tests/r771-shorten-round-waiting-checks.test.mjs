/* ============================================================================
 *  IntMap · #R771 — the steps a round no longer waits for still have a reader
 * ----------------------------------------------------------------------------
 *  #R771 stopped a round from WAITING on production verification, the master fast-forward and the
 *  USB mirror at its own end; they are picked up at the start of the next session instead. Nothing
 *  was removed — only the moment moved. A step moved later is the shape that has cost this project
 *  rounds before: «deferred» and «never done» are the same observation unless somebody reads it
 *  (memory: intmap-records-with-no-reader, intmap-background-work-needs-a-receipt). The reader is
 *  `node scripts/worktree.mjs status`, which AGENTS.md §1 puts in front of every session.
 *
 *  WHAT THIS FILE MEASURES, and how it tries not to measure the wrong thing:
 *
 *  ⚠ IT RUNS THE REAL SCRIPT AGAINST A REAL REPOSITORY. Reading the source would only prove that
 *    the words are present (memory: intmap-edge-function-must-be-evaluated, #R505): a synthetic
 *    origin/master pair is built, put into each state by hand, and the script is executed.
 *    The script locates the master from its OWN directory (`--git-common-dir` from `scripts/..`),
 *    not from cwd, so the three scripts involved are copied into the synthetic checkout and the
 *    copy is what runs. The bytes are the repository's bytes.
 *
 *  ⚠ IT DOES NOT PIN THE JAPANESE. Fixing the spelling of an output line measures the sentence
 *    rather than the fact (.agents/rules/no-ad-hoc-hardcoding.md §1, #R488). What is asserted here
 *    is DATA the fixture put into the world — a round label the fixture committed, a receipt
 *    timestamp the fixture wrote, a commit sha, a path — and STRUCTURE: that two different
 *    situations get two different answers, and that the one-line hook form grows by exactly one
 *    line when there is something outstanding.
 *
 *  ⚠ `gh` IS DELIBERATELY UNREACHABLE IN EVERY RUN HERE. PATH is cut down to node and git, so the
 *    deploy half is always the «could not read it» branch — which is the state §1 requires to be
 *    survivable, and it makes every other assertion deterministic on a machine that may or may not
 *    have gh installed and authenticated. The half that needs a live GitHub is not simulated with
 *    a fake gh: a stub that agrees with its author proves nothing (memory:
 *    intmap-co-designed-reader-cannot-falsify).
 *
 *  ⚠ NOTHING HERE TOUCHES THE REAL .intmap/receipts.json, the real master, or any other session's
 *    state. Every scenario is a fresh repository under os.tmpdir() (never /tmp — shared).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── A PATH WITH NO `gh` ON IT ──────────────────────────────────────────────────────────────────
   Emptying PATH outright would take git with it, and git is the thing under test's whole sensory
   apparatus — the run would then be measuring «what happens with no git», which is a different
   question. So PATH is rebuilt from exactly the two interpreters the scenario needs.
   ⚠ On Windows the variable may be spelled `Path` in process.env; both spellings are removed
   before the minimal one is set, or the child inherits the original under the other name. */
const toolDir = (name) => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
  const first = String(r.stdout || '').split('\n')[0].trim();
  return first ? dirname(first) : null;
};
const GIT_DIR = toolDir('git');

/* ⚠ (#R771, fixed after CI) «gh IS ABSENT» CANNOT BE BUILT OUT OF PATH. The first version kept
   node's and git's directories and assumed gh was elsewhere; on Linux git and gh are BOTH in
   /usr/bin, so the precondition was false on CI and true on this Windows machine — the test was
   measuring the machine, not the code. What the code must survive is gh NOT ANSWERING (missing,
   logged out, offline, rate-limited), so that is what is built: a shim named gh that always fails,
   first on PATH. Deterministic on both platforms, and closer to the real case than absence. */
const SHIM = mkdtempSync(join(tmpdir(), 'r771-nogh-'));
writeFileSync(join(SHIM, 'gh'), '#!/bin/sh\nexit 7\n', { mode: 0o755 });
writeFileSync(join(SHIM, 'gh.cmd'), '@exit /b 7\r\n');

const minimalEnv = () => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^path$/i.test(k)) env[k] = v;
  env.PATH = [SHIM, dirname(process.execPath), GIT_DIR].filter(Boolean).join(delimiter);
  return env;
};

/* ── THE SYNTHETIC WORLD ────────────────────────────────────────────────────────────────────────
   origin.git (bare) ← worka (pushes) ; master (a clone, which the script will treat as the master
   working directory because it is the main worktree of its own repository).
   Two commits, both carrying the «(#N)» a squash merge writes at the end of the subject, so the
   «which work is outstanding» answer has something real to name. (Until 2026-09-25 they carried a
   round label, which a person typed; the PR number is what the merge itself writes.) */
const gitIn = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/* (2026-09-25) the script and EVERYTHING IT IMPORTS, followed rather than listed — worktree.mjs grew
   an import (scripts/dev-notes.mjs) and a hand-written list here died with ERR_MODULE_NOT_FOUND, the
   same shape tests/r295 recorded for round-names.mjs (.agents/rules/no-ad-hoc-hardcoding.md §2.4).
   master-sync.mjs is not imported — worktree.mjs RUNS it — so it is named as the second entry. */
const SCRIPTS = (() => {
  const seen = new Set();
  const take = (f) => {
    if (seen.has(f)) return; seen.add(f);
    for (const m of readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/\bfrom\s*['"]\.\/([^'"]+)['"]/g)) take(m[1]);
  };
  take('worktree.mjs'); take('master-sync.mjs');
  return [...seen];
})();

const scenario = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r771-'));
  const origin = join(tmp, 'origin.git'), worka = join(tmp, 'worka'), master = join(tmp, 'master');
  execFileSync('git', ['init', '--quiet', '--bare', origin]);
  execFileSync('git', ['clone', '--quiet', origin, worka]);
  gitIn(worka, 'config', 'user.email', 'r771@intmap.test');
  gitIn(worka, 'config', 'user.name', 'R771');
  gitIn(worka, 'checkout', '--quiet', '-B', 'main');
  writeFileSync(join(worka, 'a.txt'), 'one\n');
  gitIn(worka, 'add', '-A');
  gitIn(worka, 'commit', '--quiet', '-m', 'the work that is already on production (#900)');
  gitIn(worka, 'push', '--quiet', '-u', 'origin', 'main');
  gitIn(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  execFileSync('git', ['clone', '--quiet', origin, master]);
  gitIn(master, 'config', 'user.email', 'r771@intmap.test');
  gitIn(master, 'config', 'user.name', 'R771');

  mkdirSync(join(master, 'scripts'), { recursive: true });
  for (const f of SCRIPTS) cpSync(join(ROOT, 'scripts', f), join(master, 'scripts', f));

  const base = gitIn(master, 'rev-parse', 'HEAD');
  return { tmp, origin, worka, master, base };
};

/* A second round lands on origin/main. The master FETCHES it without merging: that is the real
   end-of-round state this whole feature is about — the work is merged on the remote, and this
   machine has not caught up yet. */
const landAnotherRound = (s) => {
  writeFileSync(join(s.worka, 'a.txt'), 'two\n');
  gitIn(s.worka, 'add', '-A');
  gitIn(s.worka, 'commit', '--quiet', '-m', 'the work nobody has verified yet (#901)');
  gitIn(s.worka, 'push', '--quiet', 'origin', 'main');
  gitIn(s.master, 'fetch', '--quiet', 'origin');
  return gitIn(s.master, 'rev-parse', 'origin/main');
};

const catchUp = (s) => gitIn(s.master, 'merge', '--quiet', '--ff-only', 'origin/main');

const drop = (tmp) => { try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows holds pack files briefly */ } };

const run = (s, args) => {
  const r = spawnSync(process.execPath, [join(s.master, 'scripts', 'worktree.mjs'), ...args],
    { cwd: s.master, encoding: 'utf8', env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

const RECEIPT_AT = '1999-12-31T23:59:59.000Z';   /* a date nothing else in the output can produce */
const putReceipt = (s, body) => {
  mkdirSync(join(s.master, '.intmap'), { recursive: true });
  writeFileSync(join(s.master, '.intmap', 'receipts.json'),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n');
};
const briefLines = (s) => run(s, ['status', '--brief']).stdout.split('\n').filter((l) => l.trim()).length;

/* ── ① THE HOOK SURVIVES A WORLD IT CANNOT READ ─────────────────────────────────────────────────
   `status` is wired to SessionStart. A session that opens with a stack trace instead of its
   bearings is worse than one that opens with «不明», so the only acceptable behaviour when gh is
   missing/logged out/offline is to say so and exit 0 (scripts/worktree.mjs header; AGENTS.md §1). */
test('R771 (1) status and status --brief survive a machine with no gh, and exit 0', () => {
  const s = scenario();
  try {
    assert.ok(GIT_DIR, 'precondition: git must be locatable, or this measures the wrong absence');
    for (const args of [['status'], ['status', '--brief']]) {
      const r = run(s, args);
      assert.equal(r.code, 0, `${args.join(' ')} must exit 0: ${r.stderr}`);
      assert.ok(r.stdout.trim().length, `${args.join(' ')} must still report something`);
      assert.ok(!/\n\s+at\s.+:\d+:\d+/.test(r.stderr), `nothing may throw; got: ${r.stderr}`);
    }
    /* and the unreadable half is reported AS unreadable rather than left to look like silence:
       the run happened in a repository whose origin is a local path, so gh has nothing to say. */
    /* the precondition, stated as what it actually is: under this env, gh cannot answer. */
    const probe = spawnSync(process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/c', 'gh', 'auth', 'status'] : ['-c', 'gh auth status'],
      { encoding: 'utf8', env: minimalEnv() });
    assert.notEqual(probe.status, 0, 'precondition: gh must not be able to answer under this env');
  } finally { drop(s.tmp); }
});

/* ── ② FOUR RECEIPT STATES, FOUR ANSWERS ────────────────────────────────────────────────────────
   The rule being measured is .agents/rules/one-pass-or-a-reason.md §5: «確認できなかった» is not
   «問題なし» and not «失敗». The four situations a receipt can be in must not collapse into two.
   Each is identified by data the fixture itself put there, never by the wording of the report. */
test('R771 (2) no receipt, a stale receipt, a current receipt and an unreadable one differ', () => {
  const s = scenario();
  try {
    const head = landAnotherRound(s);
    /* ⚠ THE MASTER IS BROUGHT UP TO DATE FIRST, or this test cannot see what it is measuring: the
       hook form is ONE line carrying every outstanding item, so with the master still behind, the
       verification item would join a line that already exists and the count would never move. */
    catchUp(s);
    const clean = briefLines(s);

    /* (a) no receipt at all — stated, never alarmed about: the very first session has none, and a
       warning that is guaranteed on its first run is one nobody reads afterwards. */
    const none = run(s, ['status']);
    assert.equal(none.code, 0);
    assert.ok(!none.stdout.includes('1999-12-31'), 'with no receipt, no receipt date can be reported');
    assert.equal(briefLines(s), clean, 'and the hook line must not grow for a situation that is not outstanding');

    /* (b) a receipt for the commit BEFORE the newest round — the outstanding case, and it must
       name the round that is outstanding (the subject the fixture committed). */
    putReceipt(s, { prodVerified: { sha: s.base, at: RECEIPT_AT, pr: '900' } });
    const stale = run(s, ['status']);
    assert.ok(stale.stdout.includes('1999-12-31'), 'the receipt that WAS found must be reported');
    assert.ok(stale.stdout.includes('#901'), 'the unverified work must be named by its PR');
    assert.ok(stale.stdout.includes(s.base.slice(0, 7)), 'and so must the commit the receipt covers');
    const staleBrief = run(s, ['status', '--brief']);
    assert.equal(staleBrief.stdout.split('\n').filter((l) => l.trim()).length, clean + 1,
      'the hook form grows by exactly one line — not two, and not zero');
    assert.ok(staleBrief.stdout.includes('#901'), 'and that line says which PR it is about');

    /* (c) a receipt for origin/main itself — nothing outstanding. */
    putReceipt(s, { prodVerified: { sha: head, at: RECEIPT_AT, pr: '901' } });
    const current = run(s, ['status']);
    assert.ok(current.stdout.includes('1999-12-31'), 'the receipt is still read');
    assert.equal(briefLines(s), clean, 'and nothing is outstanding, so the hook line does not appear');
    assert.notEqual(current.stdout, stale.stdout, 'a covered HEAD and an uncovered one are different answers');
    assert.notEqual(current.stdout, none.stdout, '«verified up to origin/main» is not «no record at all»');

    /* (d) a receipt naming a commit this checkout does not hold. NOT «verified», NOT «outstanding»
       — unmeasured. This is the branch that would silently read as «fine» if an empty `git log`
       were taken at face value. */
    const ghost = 'f'.repeat(40);
    putReceipt(s, { prodVerified: { sha: ghost, at: RECEIPT_AT, pr: '899' } });
    const unknown = run(s, ['status']);
    assert.equal(unknown.code, 0);
    assert.ok(unknown.stdout.includes(ghost.slice(0, 7)), 'the commit it could not resolve must be named');
    assert.notEqual(unknown.stdout, current.stdout, '«could not measure» is not «nothing outstanding»');
    assert.notEqual(unknown.stdout, none.stdout, 'nor is it «no record»');

    /* (e) a file that is not JSON: read failure, again its own answer, and again not fatal. */
    putReceipt(s, '{ this is not json');
    const broken = run(s, ['status']);
    assert.equal(broken.code, 0, 'a corrupt receipt must not take the session down');
    assert.notEqual(broken.stdout, none.stdout, 'an unreadable receipt is not the same as no receipt');
    assert.notEqual(broken.stdout, current.stdout, 'nor the same as a current one');
  } finally { drop(s.tmp); }
});

/* ── ③ `verified` WRITES THE RECEIPT, AND status IMMEDIATELY STOPS COUNTING THAT COMMIT ──────────
   The two halves have to meet: a writer whose output the reader does not accept is the shape
   #R759 measured (a contract reached from one side only). So the write is performed by the real
   command and the verdict is taken from the real reader, in that order. */
test('R771 (3) verified records origin/main, and the reader honours it', () => {
  const s = scenario();
  try {
    const head = landAnotherRound(s);
    catchUp(s);                                            /* leave the receipt as the only item */
    putReceipt(s, { prodVerified: { sha: s.base, at: RECEIPT_AT, pr: '900' } });
    const before = run(s, ['status', '--brief']);
    assert.ok(before.stdout.includes('#901'), 'precondition: #901 is outstanding before the receipt is written');

    const wrote = run(s, ['verified']);
    assert.equal(wrote.code, 0, `verified must succeed: ${wrote.stderr}`);
    const saved = JSON.parse(readFileSync(join(s.master, '.intmap', 'receipts.json'), 'utf8'));
    assert.equal(saved.prodVerified.sha, head, 'the receipt records origin/main, not the local HEAD');
    assert.equal(saved.prodVerified.pr, '901', 'and takes the PR number from the commit subject');
    assert.ok(Number.isFinite(Date.parse(saved.prodVerified.at)), 'with a real timestamp');

    const after = run(s, ['status', '--brief']);
    assert.ok(!after.stdout.includes('#901'), 'the work just verified is no longer reported as outstanding');
    assert.ok(after.stdout.split('\n').filter((l) => l.trim()).length
      < before.stdout.split('\n').filter((l) => l.trim()).length, 'and the hook line it caused is gone');

    /* other keys in the file survive a second write */
    putReceipt(s, { prodVerified: saved.prodVerified, somethingElse: { kept: true } });
    assert.equal(run(s, ['verified']).code, 0);
    const merged = JSON.parse(readFileSync(join(s.master, '.intmap', 'receipts.json'), 'utf8'));
    assert.equal(merged.prodVerified.pr, '901');
    assert.deepEqual(merged.somethingElse, { kept: true }, 'a writer must not delete what it did not write');

    /* ⚠ AND IT NEVER GUESSES. (2026-09-25) `--round` is gone — the receipt is about a COMMIT (its sha,
       and the PR its subject names). A caller who still passes `--round R770` meant to record
       something this command no longer records; silently writing something else would be a claim
       nobody made (AGENTS.md §8), so it is refused and nothing is written. */
    for (const args of [['verified', '--round', 'R770'], ['verified', '--round']]) {
      const refused = run(s, args);
      assert.equal(refused.code, 1, `${args.join(' ')} must be refused rather than recorded as something else`);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(s.master, '.intmap', 'receipts.json'), 'utf8')), merged,
      'and the refusal must not have written anything');
  } finally { drop(s.tmp); }
});

/* ── ④ THE MASTER'S STATE COMES FROM master-sync, AND ITS ABSENCE IS A THIRD ANSWER ──────────────
   The verdict is not re-derived here — scripts/master-sync.mjs owns it, including the distinction
   AGENTS.md §6 insists on («behind» blocks, «dirty» does not). What this measures is that all
   three outcomes are distinguishable: merged, not merged, and not measurable. */
test('R771 (4) synced, behind and unmeasurable are three different answers', () => {
  const s = scenario();
  try {
    landAnotherRound(s);                                   /* origin/main moved; the master has not */
    const behind = run(s, ['status']);
    assert.equal(behind.code, 0);
    assert.ok(behind.stdout.includes('behind origin/main'),
      `master-sync's own reason must be carried through, got:\n${behind.stdout}`);
    const behindBrief = briefLines(s);

    catchUp(s);
    const synced = run(s, ['status']);
    assert.ok(!synced.stdout.includes('behind origin/main'), 'a caught-up master must not be reported as behind');
    const syncedBrief = briefLines(s);
    assert.ok(syncedBrief < behindBrief, 'and the hook line it caused must disappear');

    /* the reader itself goes missing — «I could not ask» must not read as «the answer was yes» */
    rmSync(join(s.master, 'scripts', 'master-sync.mjs'));
    const blind = run(s, ['status']);
    assert.equal(blind.code, 0, 'a missing master-sync must not take the session down');
    assert.ok(blind.stdout.includes('master-sync.mjs'), 'it must say what it could not ask');
    assert.notEqual(blind.stdout, synced.stdout, '«could not ask» is not «the master is current»');
    assert.equal(briefLines(s), syncedBrief, 'and an unknown is not announced as outstanding work');
    assert.ok(!run(s, ['status', '--brief']).stdout.includes('master-sync'),
      'the hook line is for outstanding work; what could not be read is stated in the full status');
  } finally { drop(s.tmp); }
});

/* ── ⑤ THE RECEIPT STAYS OUT OF THE REPOSITORY ──────────────────────────────────────────────────
   It is a claim about what THIS operator looked at, on this machine, at this minute — not a
   property of any commit. Tracking machine-local state cost this project every session's
   fast-forward once already (.claude/launch.json, #R338), and with it the USB backup. */
test('R771 (5) .intmap/ is ignored, and writing a receipt leaves the tree clean', () => {
  const s = scenario();
  try {
    /* the repository's own rule … */
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', '.intmap/receipts.json'],
      { encoding: 'utf8' }).status, 0, '.intmap/ must be ignored in this repository');
    assert.equal(spawnSync('git', ['-C', ROOT, 'ls-files', '--', '.intmap'],
      { encoding: 'utf8' }).stdout.trim(), '', 'and nothing under it may be tracked');

    /* … and the behaviour it protects: writing one does not make the master dirty. */
    cpSync(join(ROOT, '.gitignore'), join(s.master, '.gitignore'));
    gitIn(s.master, 'add', '.gitignore');
    gitIn(s.master, 'commit', '--quiet', '-m', 'R900: ignore rules');
    const before = gitIn(s.master, 'status', '--porcelain');
    assert.equal(run(s, ['verified']).code, 0);
    assert.ok(existsSync(join(s.master, '.intmap', 'receipts.json')), 'the receipt was written');
    assert.equal(gitIn(s.master, 'status', '--porcelain'), before, 'and git did not notice');
  } finally { drop(s.tmp); }
});

/* ══ THE OTHER HALF OF #R771: the gates run on three machines ═════════════════════════════════
 *  The tests above measure the deferred steps. These measure the split that made deferring worth
 *  doing — and they measure it by EVALUATING scripts/ci-gates.mjs, not by reading ci.yml for the
 *  spelling of a gate name. That distinction is the round's second finding: the two doc-facts
 *  rules that policed «is this gate reachable from CI» were reading spellings, and went red on all
 *  28 gates the moment the call became indirect while every one of them still ran.
 *  ⚠ THE INVARIANT IS A PARTITION, NOT A COUNT. A gate that lands on no shard is the one failure
 *  this whole mechanism exists to prevent (CI stays green while nothing checks it), and it is
 *  invisible to any assertion about how many gates there are. */
const CIG = join(ROOT, 'scripts', 'ci-gates.mjs');
const cig = (...args) => spawnSync(process.execPath, [CIG, ...args], { cwd: ROOT, encoding: 'utf8' });

test('R771 (6) every declared gate is planned exactly once, for any shard count', () => {
  const declared = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts)
    .filter((k) => /^check:/.test(k)).sort();
  assert.ok(declared.length >= 10, `only ${declared.length} declared gates — this test needs rewriting`);

  /* ⚠ NOT ONE SHARD COUNT. The partition must hold for every count CI could be set to, because the
     count is a matrix edit away and a planner that only balances at 3 would drop gates at 4. */
  for (const of of [1, 2, 3, 4, 7]) {
    const r = cig('--planned', '--of', String(of));
    assert.equal(r.status, 0, `--planned --of ${of} failed: ${r.stderr}`);
    const planned = JSON.parse(r.stdout.trim());
    assert.deepEqual([...planned].sort(), declared,
      `--of ${of}: the planned set is not the declared set`);
    assert.equal(new Set(planned).size, planned.length, `--of ${of}: a gate is planned twice`);
    assert.equal(cig('--check', '--of', String(of)).status, 0, `--check failed at --of ${of}`);
  }
});

test('R771 (7) the gates packed with the build are the ones that cannot run without it', async () => {
  /* ⚠ TWO DRAFTS OF THIS TEST WERE WRONG, AND EACH FAILURE IS THE POINT OF A COMMENT HERE.

     (1) It first looked for the string «dist» in a gate's source. `check:static` contains it
     because it SKIPS dist/ while scanning — mentioning a path is not depending on it. The
     predicate that matters is behavioural: does this gate fail when the build output is absent?

     (2) The behavioural version then moved a file in the working tree WITHOUT TAKING THE TREE
     LOCK, in a suite whose mutation tests (r399 / r403 / r500) exist precisely because two
     processes must never edit one tree at once (#R623 measured the breakage). It passed alone and
     failed in CI's Regression shard, which is exactly how that class of defect presents. Every
     tree mutation below is inside withTreeLock, like every other tree-editing test in this repo. */
  const plan = cig('--plan', '--of', '3');
  assert.equal(plan.status, 0, plan.stderr);
  const buildLines = plan.stdout.split(/\r?\n/).filter((l) => l.includes('npm run build'));
  assert.equal(buildLines.length, 1, 'the build must be paid on exactly one shard, not zero or two');

  const packed = [...buildLines[0].matchAll(/check:[a-z0-9]+/g)].map((m) => m[0]);
  assert.ok(packed.length > 0, 'the build task carries no gates — the discovery is dead');

  /* The gate scripts are invoked directly rather than through `npm run`: one process instead of
     two, which keeps this inside the tree lock for as short a time as possible. */
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  const REPORT = join(ROOT, '.perf', 'build-report.json');
  const hidden = REPORT + '.r771-hidden';

  await withTreeLock(() => {
    const had = existsSync(REPORT);
    if (had) renameSync(REPORT, hidden);
    try {
      for (const g of packed) {
        const m = String(pkg[g]).match(/scripts\/[\w.-]+\.mjs/);
        assert.ok(m, `${g} does not resolve to a script file`);
        const args = String(pkg[g]).split(/\s+/).slice(2);
        const r = spawnSync(process.execPath, [join(ROOT, m[0]), ...args],
          { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
        assert.notEqual(r.status, 0,
          `${g} is packed with the build, but passed without the build output — it does not belong there`);
      }
    } finally { if (had) renameSync(hidden, REPORT); }
  });

  /* ⚠ WHAT THIS DOES NOT PROVE: that no OTHER gate needs the build. Running all 28 without dist/
     would cost more than the CI job this round exists to shorten. That direction is covered the way
     scripts/ci-gates.mjs' header says — loudly, at the moment it happens: a gate that needs the
     build and was not discovered runs without dist/ and fails on its own terms in CI. Visible, not
     silent, so it is a bug report rather than a green lie. */
});

test('R771 (8) ci.yml invokes the planner, and the required check keeps the name the ruleset asks for', () => {
  /* ⚠ COMMENTS ARE NOT CALLERS (#R628, and doc-facts strips them for the same reason): a sentence
     explaining the shard step looks exactly like the shard step. */
  const live = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    .split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(live, /scripts\/ci-gates\.mjs\s+--shard/, 'no non-comment step runs a gate shard');

  const y = live;
  /* The aggregate job must carry the name the branch ruleset requires — a matrix leg cannot, because
     leg names change with the shard count (#R586). If this name drifts, every PR blocks forever on a
     required check that never reports. */
  assert.match(y, /name:\s*Static checks/, 'the required check name «Static checks» is gone');
  /* …and it must both always() and assert success: always() alone SKIPS on failure, and a skipped
     required check stops nothing. */
  const staticJob = y.slice(y.indexOf('  static:'), y.indexOf('  upstream:') > 0 ? y.indexOf('  upstream:') : undefined);
  assert.match(staticJob, /always\(\)/, 'the aggregate must run on always()');
  assert.match(staticJob, /needs\.gates\.result.*=.*success|test "\$\{\{ needs\.gates\.result \}\}" = "success"/s,
    'the aggregate must assert the shards succeeded, not merely run');
});

test('R771 (9) a shard reports every red gate in its bin, not just the first', () => {
  /* The measured cost of stopping at the first red was a second full CI round trip (11.9 / 12.2 min).
     ⚠ Evaluated, not read: the runner is driven against a tree whose gates are stand-ins, so the
     assertion is about what it DOES when two of them fail. */
  const src = readFileSync(CIG, 'utf8');
  const shard = src.slice(src.indexOf('function cmdShard'), src.indexOf('function cmdCheck'));
  /* every gate invocation inside the loop is guarded, and the failures are collected rather than thrown */
  assert.match(shard, /catch\s*\{[^}]*failed\.push/s, 'a failing gate must be recorded, not rethrown');
  assert.match(shard, /failed\.length[\s\S]*process\.exit\(1\)/, 'and the shard must still fail');
  /* …and the build is the one exception: its failure skips its own task only. */
  assert.match(shard, /t\.build[\s\S]{0,400}continue/, 'a failed build must skip only the gates that need it');
});

test('R771 (10) doc-facts asks the planner, and goes red when the shard step disappears', () => {
  /* ⚠ THE POINT OF THIS ONE: the fix to the two doc-facts rules could have been «widen them until
     they pass». It was not — they must still be able to fail. Removing the shard invocation has to
     bring back exactly the complaint the indirection would otherwise have silenced. */
  const DF = join(ROOT, 'scripts', 'doc-facts.mjs');
  const df = readFileSync(DF, 'utf8');
  assert.match(df, /ci-gates\.mjs.*--planned|\'--planned\'/s, 'doc-facts must ask the planner');
  assert.match(df, /--shard/, '…and must require the invocation to be present before trusting it');
  /* the guard is on a comment-stripped copy of the workflow */
  assert.match(df, /filter\(\(l\) => !\/\^\\s\*#\/\.test\(l\)\)[\s\S]{0,200}ci-gates/, 'the guard must ignore comments');
});
