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
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const body = (p) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const SCRIPT = resolve(ROOT, 'scripts/master-sync.mjs');

/* Runs the real script; returns its exit code and streams instead of throwing, because a non-zero
   exit is the thing under test in half of these. */
const run = (args, cwd) => {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
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

/* ── ④ AND IT NEVER TAKES A BRANCH AWAY FROM ANOTHER SESSION (CLAUDE.md §6) ─────────────────────*/
test('R282 (4) --sync refuses to leave unmerged work or an unclean tree', () => {
  const s = scenario();
  try {
    gitIn(s.master, 'checkout', '--quiet', '-b', 'someone-elses-round');
    writeFileSync(join(s.master, 'b.txt'), 'unmerged\n');
    gitIn(s.master, 'add', '-A'); gitIn(s.master, 'commit', '--quiet', '-m', 'unmerged work');
    advanceOrigin(s.worka);

    const refused = run(['--sync'], s.master);
    assert.equal(refused.code, 1, '--sync must refuse to abandon a branch origin/main does not contain');
    assert.match(refused.stderr, /unmerged work/i, `it must say why, got: ${refused.stderr}`);
    assert.equal(gitIn(s.master, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'someone-elses-round', 'the branch is left exactly as it was');

    /* the same refusal for a dirty tree, on a branch that IS contained */
    gitIn(s.master, 'checkout', '--quiet', 'main');
    writeFileSync(join(s.master, 'a.txt'), 'edited by another session\n');
    const dirty = run(['--sync'], s.master);
    assert.equal(dirty.code, 1, '--sync must refuse while the master has uncommitted changes');
    assert.match(dirty.stderr, /uncommitted change/, `it must say why, got: ${dirty.stderr}`);
    assert.equal(body(join(s.master, 'a.txt')), 'edited by another session\n', 'the edit survives untouched');
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

  /* ⚠ (#R280) THE SECTION IS FOUND BY ITS SUBJECT, NOT BY ITS NUMBER. This read §11.4 literally
     until #R280 turned §11 into «when to run it» plus scripts/backup-usb.ps1, which renumbered the
     subsections. What must hold is that §11 — wherever inside it — gates the mirror on the master
     being current and names the master as the source. */
  const s11 = md.slice(md.indexOf('## 11.'), md.indexOf('## 12.'));
  assert.match(s11, /master-sync\.mjs --check/, '§11 gates the USB mirror on the master being current');
  assert.match(s11, /原本/, '§11 names the master as the mirror source');
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
