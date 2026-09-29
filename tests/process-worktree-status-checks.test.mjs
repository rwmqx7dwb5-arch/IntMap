/* ============================================================================
 *  IntMap · scripts/worktree.mjs — identifiers, clean-up, the preview config, and the deferred steps
 * ----------------------------------------------------------------------------
 *  One tool gives every session its branch, worktree and preview port and reports what the last
 *  round left outstanding. Every behavioural case builds a throw-away repository and runs the real
 *  script (followed with its imports): two sessions never get one identifier and a held slug is
 *  refused (#R295 ⑦), `done` removes what is merged and keeps what is not (#R295 ⑫⑭), the preview
 *  config stays untracked and is still read and written (#R338), and production verification, the
 *  master and the receipt each have a reader with three distinguishable answers (#R771).
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r295 (worktree half), r338, r771 (1)–(5)
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { basename, delimiter, dirname, join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lf, readLF } from '../scripts/eol.mjs';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* (#R674) THE FIXTURE'S COPY OF THE SCRIPT IS NOT ONE FILE. #R295 ⑦⑪⑫⑭ and #R338 ③ build a throwaway repository
   and run scripts/worktree.mjs inside it, and they used to seed it by naming that one file. The
   moment worktree.mjs grew a local import (scripts/round-names.mjs, so the tool and its gate share
   one definition of the names it hands out) both tests died with ERR_MODULE_NOT_FOUND — the fixture
   was a hand-written list, and a hand-written list silently drops whatever is added next
   (.agents/rules/no-ad-hoc-hardcoding.md §2.4). So FOLLOW THE IMPORTS instead: seed the entry point
   and, transitively, every relative specifier it names. Node resolves them the same way. */
function seedScripts(origin, entry = 'scripts/worktree.mjs') {
  mkdirSync(join(origin, 'scripts'), { recursive: true });
  const seen = new Set();
  const take = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = resolve(ROOT, rel);
    cpSync(src, join(origin, rel));
    const body = readFileSync(src, 'utf8');
    for (const m of body.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) {
      take(join(dirname(rel), m[1]).split(sep).join('/'));
    }
  };
  take(entry);
  return seen;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R295 — was tests/r295-checks.test.mjs ⑦⑪⑫⑬⑭ (history: see process-agent-context-checks)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{

const read = (p) => readLF(resolve(ROOT, p));

/* ── ⑦ THE IDENTIFIER A SESSION IS GIVEN IS ONE NOBODY ELSE HOLDS ─────────────────────────────
   The round number was taken three times (#R288, #R289 and once before), each costing a rebase and
   30+ renumbered references: the number was chosen by a SCAN (DEV-NOTES, then also the branches),
   and a scan hands every session that runs it before the others push the SAME answer — #R671 was
   renumbered seven times. (2026-09-25) There is no number any more. A piece of work is named by
   its slug, and the claim is `git worktree add -b feat/<slug>`, which git refuses when the branch
   exists — and every worktree on a machine shares one ref namespace. So the property under test is
   the defect itself: TWO SESSIONS CANNOT BE HANDED THE SAME IDENTIFIER. Run in a throwaway
   repository, because `new` creates branches and worktrees. */
test('#R295 ⑦ scripts/worktree.mjs never hands two sessions the same identifier', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295-new-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    seedScripts(origin);
    mkdirSync(join(origin, 'tests'), { recursive: true });
    writeFileSync(join(origin, 'tests', 'held-by-a-test-checks.test.mjs'), 'export {};\n');
    g(['add', '-A'], origin);
    g(['commit', '-qm', 'seed'], origin);
    g(['branch', 'feat/held-by-a-branch'], origin);

    /* the test must not create worktrees where real sessions keep theirs, nor touch ~/.codex */
    const env = { ...process.env, INTMAP_WORKTREE_BASE: join(tmp, 'wts'), CODEX_HOME: join(tmp, 'codex') };
    const run = (...a) => {
      try { return { code: 0, out: execFileSync(process.execPath, [join(origin, 'scripts/worktree.mjs'), ...a], { cwd: origin, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
    };

    const first = run('new', 'same-subject');
    assert.equal(first.code, 0, 'the first session could not take a free slug:\n' + first.out);
    assert.match(g(['branch', '--list', 'feat/same-subject'], origin), /feat\/same-subject/, 'the branch is the claim');
    const second = run('new', 'same-subject');
    assert.notEqual(second.code, 0, 'a SECOND session was handed an identifier the first one already holds');

    for (const [slug, why] of [['held-by-a-branch', 'a branch'], ['held-by-a-test', 'a test file'], ['r900-numbered', 'a round number']]) {
      const r = run('new', slug);
      assert.notEqual(r.code, 0, `a slug held by ${why} was handed out: ${slug}`);
    }
    /* …and nothing offers a number to take */
    const st = run('status');
    assert.doesNotMatch(st.out, /空きラウンド|free round/i, 'status still offers a round number');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* ── ⑪ worktree.mjs BUILDS OUTSIDE OneDrive ────────────────────────────────────────────────────
   The whole point of the script is AGENTS.md §6: the master is «main, at origin/main», and work
   happens elsewhere. ⚠ comments stripped first — the banner above the code quotes OneDrive by
   name while explaining why the code must not. */
test('#R295 ⑪ scripts/worktree.mjs derives the master and builds outside it', () => {
  /* (tests regrouped by subject) EVALUATED, not read. This grepped the source for
     `--git-common-dir`, for `tmpdir()` and for the absence of «OneDrive» — spellings, which a bypassed
     discovery or a path assembled from parts would pass. What they stood for is observable, so the
     tool is run from a LINKED worktree of a throw-away repository, with the system temp directory
     moved and INTMAP_WORKTREE_BASE unset:
       · the branch must appear in the throw-away repository — the master was DERIVED from where the
         script sits (#R282), not carried as a path;
       · the new worktree must land under the moved temp directory and outside the master
         (AGENTS.md §6 — os.tmpdir() is %LOCALAPPDATA%\Temp on Windows, never OneDrive).
     ⚠ The other half of the old check — `git branch -D` only behind the origin/main tree comparison,
     `-d` otherwise — is behaviour too, and ⑭ below proves it in both directions (a squash-merged
     branch is deleted, one with unmerged work survives). */
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295-out-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    seedScripts(origin);
    g(['add', '-A'], origin);
    g(['commit', '-qm', 'seed'], origin);
    const linked = join(tmp, 'linked');
    g(['worktree', 'add', '-q', '-b', 'feat/some-session', linked, 'main'], origin);

    const systemp = join(tmp, 'systemp');
    const env = { ...process.env, TEMP: systemp, TMP: systemp, TMPDIR: systemp, CODEX_HOME: join(tmp, 'codex') };
    delete env.INTMAP_WORKTREE_BASE;
    const r = spawnSync(process.execPath, [join(linked, 'scripts/worktree.mjs'), 'new', 'outside-check'],
      { cwd: linked, env, encoding: 'utf8' });
    assert.equal(r.status, 0, 'new failed in the fixture:\n' + r.stdout + r.stderr);

    assert.match(g(['branch', '--list', 'feat/outside-check'], origin), /feat\/outside-check/,
      'the branch was not created in the repository the script sits in — the master is not derived from it');
    const made = join(systemp, 'intmap-worktrees', 'wt-outside-check');
    assert.ok(existsSync(made), `the worktree is not under the system temp directory (${made}) — it was built somewhere the master decides`);
    const inside = (a, b) => { const x = resolve(a).toLowerCase() + sep, y = resolve(b).toLowerCase() + sep; return x.startsWith(y); };
    assert.ok(!inside(made, origin), 'the worktree was built inside the master');
    assert.ok(g(['worktree', 'list', '--porcelain'], origin).toLowerCase().includes(basename(made).toLowerCase()),
      'the master does not list the worktree the tool reported');
  } finally { rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); }
});

/* ── ⑫ `done` FINISHES THE JOB EVEN WHEN `git worktree remove` PARTIALLY FAILS ─────────────────
   Measured on this machine while writing #R295: `git worktree remove` deletes the checkout and
   drops the entry from `worktree list`, but cannot delete the bookkeeping directory under the
   master's .git/worktrees/ — the master's .git is in OneDrive, which holds those files open
   («Permission denied»; there are ~95 orphaned admin directories there already). The first
   version treated that error as total failure and exited before deleting the branch, so the run
   left BOTH an orphaned admin directory and a live branch.

   ⚠ WHAT THIS PROVES, EXACTLY: the happy path — worktree gone, branch gone, exit 0 — against a
   REAL repository, not a mock. It does NOT prove the partial-failure recovery: the fixture lives
   on the temp disk, where `git worktree remove` succeeds outright, so the recovery branch is never
   entered. That was measured, not assumed — reinstating the bug here left this test green, which
   is precisely the shape #R274 ③ warns about. §⑬ is the one that fails when the bug comes back. */
test('#R295 ⑫ worktree.mjs done removes the worktree and its branch, and exits 0', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    seedScripts(origin);
    writeFileSync(join(origin, 'DEV-NOTES.md'), '- **#R100** seed\n');
    g(['add', '-A'], origin);
    g(['commit', '-qm', 'seed'], origin);

    const wt = join(tmp, 'wt-r101-x');
    g(['worktree', 'add', '-q', '-b', 'feat/r101-x', wt, 'main'], origin);
    assert.match(g(['worktree', 'list'], origin), /wt-r101-x/, 'fixture worktree was not created');

    const r = execFileSync(process.execPath, [join(wt, 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(r, /worktree を削除/);
    assert.ok(!/wt-r101-x/.test(g(['worktree', 'list'], origin)), 'the worktree is still listed');
    assert.ok(!/feat\/r101-x/.test(g(['branch', '--list', 'feat/r101-x'], origin)),
      'the branch survived — the #R295 partial-failure bug is back');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* ── ⑬ THE VERDICT ON REMOVAL COMES FROM THE LIST, NOT FROM THE ERROR ──────────────────────────
   The bug §⑫ cannot reach: on this machine `git worktree remove` deletes the checkout and drops
   the entry from `worktree list`, then fails to delete the bookkeeping directory under the
   master's .git/worktrees/ because OneDrive holds it open. Treating that error as the verdict
   aborts the run with the worktree already gone and the branch still alive.

   So the invariant is structural and can be read: after the remove attempt the script must PRUNE
   and then ASK THE LIST, and the only `process.exit(1)` on that path must be guarded by the
   list's answer. ⚠ comments stripped first — the explanation above quotes what the code must not
   do (「自分の検査が自分のコメントに当たる」, 19 times). */
test('#R295 ⑬ `done` decides by re-reading the worktree list, not by the remove error', () => {
  const src = codeOnly(read('scripts/worktree.mjs'));
  const from = src.indexOf("'worktree', 'remove'");
  assert.ok(from > 0, 'the removal call is gone — this check no longer has a subject');
  const after = src.slice(from);

  assert.match(after, /'worktree',\s*'prune'/,
    'nothing prunes the orphaned admin directory after a partial removal');
  assert.match(after, /'worktree',\s*'list'/,
    'the script never re-reads the list, so it cannot tell a partial failure from a real one');

  /* The catch around the removal must record the error, not end the run. */
  const catchBlock = (after.match(/catch\s*\([^)]*\)\s*\{[\s\S]{0,200}?\}/) || [''])[0];
  assert.ok(!/process\.exit/.test(catchBlock),
    'the catch around `worktree remove` exits — a partial failure would strand the branch (#R295)');

  /* …and the exit that does exist must be downstream of the list's answer. */
  const guard = after.indexOf('stillListed');
  const exit = after.indexOf('process.exit(1)');
  assert.ok(guard > 0 && exit > guard, 'the failure exit is not guarded by the list re-read');
});

/* ── ⑭ A SQUASH-MERGED BRANCH IS CLEANED UP; A DIVERGENT ONE IS NOT ────────────────────────────
   AGENTS.md §5 merges every round with `--squash`, so the branch's commits never become ancestors
   of main and `git branch -d` calls EVERY finished round «unmerged». A cleanup step that refuses
   in the normal case is a cleanup step nobody uses, and the branches accumulate.
   The replacement asks whether the branch still carries anything main lacks, by comparing trees.
   ⚠ BOTH DIRECTIONS ARE PROVED HERE, because a comparison that answers «identical» to everything
   is exactly how this would be «fixed» by weakening it (#R283's rule). */
test('#R295 ⑭ done deletes a squash-merged branch but keeps one that still has work', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-r295s-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r295@test'], origin);
    g(['config', 'user.name', 'r295'], origin);
    seedScripts(origin);
    writeFileSync(join(origin, 'DEV-NOTES.md'), '- **#R100** seed\n');
    g(['add', '-A'], origin); g(['commit', '-qm', 'seed'], origin);

    /* A branch with a real commit, then main gets the SAME content as one squashed commit —
       which is what `gh pr merge --squash` leaves behind. */
    g(['worktree', 'add', '-q', '-b', 'feat/r101-squashed', join(tmp, 'wt-a'), 'main'], origin);
    writeFileSync(join(tmp, 'wt-a', 'feature.txt'), 'work\n');
    g(['add', '-A'], join(tmp, 'wt-a')); g(['commit', '-qm', 'work'], join(tmp, 'wt-a'));
    writeFileSync(join(origin, 'feature.txt'), 'work\n');
    g(['add', '-A'], origin); g(['commit', '-qm', 'squashed (#1)'], origin);
    /* `done` compares against origin/main, so the fixture needs that ref to exist. */
    g(['update-ref', 'refs/remotes/origin/main', 'main'], origin);

    const outA = execFileSync(process.execPath, [join(tmp, 'wt-a', 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(outA, /squash merge 済み/, 'the squash-merged branch was not recognised');
    assert.equal(g(['branch', '--list', 'feat/r101-squashed'], origin).trim(), '',
      'a squash-merged branch was left behind — every round would leave one');

    /* …and one that still carries work main does not have must SURVIVE. */
    g(['worktree', 'add', '-q', '-b', 'feat/r102-live', join(tmp, 'wt-b'), 'main'], origin);
    writeFileSync(join(tmp, 'wt-b', 'unmerged.txt'), 'not in main\n');
    g(['add', '-A'], join(tmp, 'wt-b')); g(['commit', '-qm', 'later work'], join(tmp, 'wt-b'));

    const outB = execFileSync(process.execPath, [join(tmp, 'wt-b', 'scripts/worktree.mjs'), 'done'],
      { cwd: tmp, encoding: 'utf8' });
    assert.match(outB, /残した/, 'a branch with unmerged work was not reported as kept');
    assert.match(g(['branch', '--list', 'feat/r102-live'], origin), /feat\/r102-live/,
      'unmerged work was deleted — the safety rule is gone');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R338 — was tests/r338-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R338 — machine-local なファイルを共有物として追跡すると、全員の merge を塞ぐ
 * ----------------------------------------------------------------------------
 *  `.claude/launch.json` はラウンドごとのプレビュー設定で、中身は
 *  `C:/Users/.../Temp/intmap-worktrees/wt-r330/dist` のような **このマシンだけの絶対パス**である。
 *  それを追跡していた間、Browser の preview ツールは **原本の**そのファイルへ書いていたので、
 *
 *    並行セッションが 1 つでもプレビューを持つ
 *      → 原本の `git merge --ff-only` が「ローカルの変更が上書きされる」と拒否する
 *      → §6 は他セッションの未コミット変更に触ることを禁じているので、その拒否は**正しい**
 *      → 原本が古いままなので `scripts/backup-usb.ps1` が `skipped master-not-synced` で止まる
 *
 *  という連鎖が**毎ラウンド**起きていた。実測 #R334: 19 セッション同時・原本は 3 コミット遅れ・
 *  USB バックアップは skip。#R320 も同じことを測って記録していたが、原因は残っていた。
 *
 *  ⇒ 追跡から外した。書き込みも読み出しも今までどおりで、他人の merge を塞がなくなっただけ。
 *  この検査は、**うっかり追跡へ戻らないこと**を押さえる。
 * ========================================================================== */

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const rd = (p) => readLF(path.join(ROOT, p));

const LJ = '.claude/launch.json';

/* ── ① 追跡されていない ───────────────────────────────────────────────── */
test('#R338 ① .claude/launch.json is not tracked', () => {
  const tracked = git('ls-files', '--', '.claude/').split('\n').map((s) => s.trim()).filter(Boolean);
  assert.ok(!tracked.includes(LJ),
    LJ + ' is tracked again. It holds absolute paths into this machine\'s worktrees, and the '
    + 'preview tool writes into the MASTER copy — tracking it blocks every concurrent session\'s '
    + 'fast-forward, and with it the USB backup (measured at #R334).');
  /* 同じ理由で危ないものが増えていないか。
     ⚠ 見るのは **ツールが書き換える設定ファイル**（.json）だけである。`.claude/agents/*.md` は
     散文の中で `C:\Users\...` を例として引用しており、それは誰の merge も塞がない——
     最初に書いたこの検査は .md まで見て、その引用で落ちた。**危ないのは「絶対パスが書いてある」
     ことではなく「毎セッションが機械的に書き換える」ことである。** */
  for (const f of tracked.filter((x) => x.endsWith('.json'))) {
    const body = rd(f);
    assert.ok(!/[A-Za-z]:[\\/]Users[\\/]/.test(body),
      f + ' is a TRACKED config file holding a machine-local absolute path (C:\\Users\\…). '
      + 'That is exactly what made ' + LJ + ' block every other session\'s fast-forward.');
  }
});

/* ── ② 無視されている（消しただけでは、次に誰かが add -A したら戻る） ── */
test('#R338 ② it is ignored, so `git add -A` cannot put it back by accident', () => {
  const ignore = rd('.gitignore');
  assert.ok(ignore.includes(LJ), '.gitignore must name ' + LJ);
  /* git 自身に訊く——.gitignore の書き方ではなく、実際の判定を見る。 */
  let ignored = false;
  try { git('check-ignore', '-q', LJ); ignored = true; } catch (e) { ignored = e.status === 0; }
  assert.equal(ignored, true, 'git check-ignore says ' + LJ + ' is NOT ignored');
});

/* ── ③ 外したことで壊れていないこと ─────────────────────────────────────
 * worktree.mjs はこのファイル（原本と全 worktree のもの）から**使用中のプレビューポート**を導いている
 * （2026-09-25 まではラウンド番号を導いていた。番号は名前でなくなった）。
 * 追跡をやめてもファイルは在るので読めるが、その読み取り自体が消えていないかを見る。
 * 振る舞いとしての「2 セッションに同じポートを渡さない」は tests/process-without-round-numbers-checks ①。 */
test('#R338 ③ the port finder still reads it, and the writer can create it', () => {
  /* (tests regrouped by subject) EVALUATED, not read. This matched two source lines — the join that
     reads each launch.json and the `if (!existsSync(ljPath)) writeFileSync(…)` that creates one. Both
     halves are observable in a throw-away repository: a fresh checkout has no launch.json (it is
     ignored), so `new` must CREATE one; and a second `new` must not be handed the port the first
     one's launch.json already names — nothing is listening on it, so only the READ keeps it taken. */
  const tmp = mkdtempSync(join(tmpdir(), 'im-r338-'));
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = join(tmp, 'origin');
    mkdirSync(origin);
    g(['init', '-q', '-b', 'main'], origin);
    g(['config', 'user.email', 'r338@test'], origin);
    g(['config', 'user.name', 'r338'], origin);
    seedScripts(origin);
    g(['add', '-A'], origin);
    g(['commit', '-qm', 'seed'], origin);
    const env = { ...process.env, INTMAP_WORKTREE_BASE: join(tmp, 'wts'), CODEX_HOME: join(tmp, 'codex') };
    const lj = (slug) => join(tmp, 'wts', `wt-${slug}`, '.claude', 'launch.json');
    const portOf = (slug) => (JSON.parse(readFileSync(lj(slug), 'utf8')).configurations || [])
      .find((c) => c.name === `intmap-preview-${slug}`)?.port;
    const make = (slug) => {
      const r = spawnSync(process.execPath, [join(origin, 'scripts/worktree.mjs'), 'new', slug], { cwd: origin, env, encoding: 'utf8' });
      assert.equal(r.status, 0, `new ${slug} failed in the fixture:\n${r.stdout}${r.stderr}`);
    };

    make('first-preview');
    assert.ok(existsSync(lj('first-preview')),
      'the writer did not create .claude/launch.json in a checkout that had none — a clone does not come with one now that it is ignored');
    const p1 = portOf('first-preview');
    assert.ok(Number.isInteger(p1), 'the created launch.json carries no preview entry with a port');

    make('second-preview');
    assert.notEqual(portOf('second-preview'), p1,
      'the second session was given the port the first one\'s launch.json names — the port finder no longer reads launch.json');
  } finally { rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); }
});

/* ── ④ 文書が実体と合っている ────────────────────────────────────────── */
test('#R338 ④ the documents say it is untracked', () => {
  /* (#R503) AGENTS.md now has a hard 32,768-byte ceiling — Codex truncates past it in silence —
     so the MEASUREMENT behind this (19 concurrent sessions, the master three commits behind, the
     USB mirror skipped) moved to docs/AGENT-SETUP.md §4. The standing instructions keep the FACT
     and the pointer; the setup document keeps the story. Both are asserted, because a pointer at
     a document that quietly stopped saying it is the same silence #R338 was written against. */
  assert.match(rd('AGENTS.md'), /追跡対象ではない/,
    'AGENTS.md §2 must say the preview config is untracked');
  assert.match(rd('docs/AGENT-SETUP.md'), /追跡から外した理由/,
    'docs/AGENT-SETUP.md §4 owns why the preview config is untracked, and no longer explains it');
  assert.match(rd('.claude/skills/intmap-round/SKILL.md'), /追跡対象外/,
    'the round skill must say the preview entry does not appear in the commit');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R771 — was tests/r771-shorten-round-waiting-checks.test.mjs (1)–(5)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
}
