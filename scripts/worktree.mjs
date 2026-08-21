#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE SESSION'S WORKSPACE IS SET UP BY A TOOL, NOT BY REMEMBERING  (#R295)
 * ----------------------------------------------------------------------------
 *  「私にworktree、subagent、agent設定などの手動管理を要求しない。」
 *
 *  CLAUDE.md §6 asks every parallel session for its own branch and its own worktree, OUTSIDE
 *  OneDrive, with the master copy left alone on `main`. That is six steps done by hand at the start
 *  of every round — pick a free round number, branch from origin/main, add the worktree somewhere
 *  under %LOCALAPPDATA%\Temp, link node_modules, add the preview entry, print the path — and the
 *  record says what happens to steps done by hand:
 *
 *    · THE ROUND NUMBER WAS TAKEN THREE TIMES (#R288, #R289 and once before). Each collision cost a
 *      rebase and 30+ renumbered references, because the number was chosen by reading DEV-NOTES and
 *      nothing else — while another session already held `feat/r<N>-…` on the remote.
 *    · #R278 records a worktree with no node_modules, which fails in a way that looks like a broken
 *      install rather than a missing junction.
 *    · #R282 measured the master fifteen commits behind because no step owned it.
 *
 *  So the workspace is a THING THE TOOLING KNOWS ABOUT. Nothing here is hard-coded: the master
 *  working directory is derived from `git rev-parse --git-common-dir` exactly as
 *  scripts/master-sync.mjs derives it, so this points at OneDrive from ANY worktree, and follows
 *  the checkout if it ever moves.
 *
 *      node scripts/worktree.mjs status        # everything CLAUDE.md §1 asks for, in one read
 *      node scripts/worktree.mjs status --brief # the same, three lines (used by the SessionStart hook)
 *      node scripts/worktree.mjs new <slug>    # free round number + branch + worktree + node_modules + preview
 *      node scripts/worktree.mjs done          # remove THIS worktree and its branch, after the merge
 *
 *  ⚠ `status` NEVER EXITS NON-ZERO. It is wired to a SessionStart hook, and a hook that fails is a
 *  session that starts with an error instead of its bearings. Anything it cannot determine is
 *  printed as unknown, not thrown.
 *  ⚠ IT NEVER TOUCHES ANOTHER SESSION'S WORK. `new` only ever creates; `done` refuses to remove a
 *  worktree that is not the one it is being run from, and uses `git branch -d` (not -D) so an
 *  unmerged branch is refused by git itself rather than by a rule written here.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, lstatSync, unlinkSync, rmdirSync, symlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/* ── git helpers. `q` is the quiet form: a failure is a value, not an exception ──────────────── */
const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const q = (args, cwd = REPO) => { try { return git(args, cwd); } catch { return ''; } };

/* ── WHERE THE MASTER IS. Derived, never written down (the #R282 rule) ──────────────────────────
   `--git-common-dir` names the MAIN repository's .git from inside any linked worktree, so its
   parent is the master working directory. Resolve it relative to REPO: git answers with a relative
   path when it can. */
function masterDir() {
  const common = q(['rev-parse', '--git-common-dir']);
  if (!common) return REPO;
  return dirname(resolve(REPO, common));
}

/* ── EVERY ROUND NUMBER ANYBODY HAS CLAIMED ────────────────────────────────────────────────────
   A number is taken if ANY of these has it, and the only one of them the old by-hand method read
   was the first: the notes say what has MERGED, the branches say what is being worked on RIGHT NOW.
   That gap is exactly where the three collisions happened. */
function claimedRounds(master) {
  const seen = new Set();
  const add = (s, re) => { for (const m of String(s).matchAll(re)) seen.add(+m[1]); };

  for (const f of ['DEV-NOTES.md', 'DEV-NOTES-ARCHIVE.md']) {
    const p = join(master, f);
    if (existsSync(p)) add(readFileSync(p, 'utf8'), /#R(\d{2,4})\b/g);
  }
  add(q(['branch', '-a', '--format=%(refname:short)']), /\br(\d{2,4})-/gi);
  add(q(['worktree', 'list', '--porcelain']), /\bwt-r(\d{2,4})\b/gi);

  const lj = join(master, '.claude', 'launch.json');
  if (existsSync(lj)) add(readFileSync(lj, 'utf8'), /intmap-preview-r(\d{2,4})/g);

  const tests = join(master, 'tests');
  if (existsSync(tests)) {
    try { add(readdirSync(tests).join('\n'), /\br(\d{2,4})[-.]/g); }
    catch { /* readdir is a convenience here; the branches are the load-bearing source */ }
  }
  return seen;
}

const nextRound = (master) => {
  const seen = claimedRounds(master);
  return seen.size ? Math.max(...seen) + 1 : 200;
};

/* ══ (#R304) THE NIGHTLY'S ANSWER, IN FRONT OF EVERY SESSION ════════════════════════════════════
   The deep tier (27 spec files, 78 minutes) has run every night since #R203 and has been RED every
   night from 2026-08-08 to 2026-08-21 — fourteen consecutive runs, all five `Deep rest` shards, and
   the aggregate job reported it honestly each time. Nobody looked. Two of the failures were a spec
   that counted to eight while the loader had grown to ten, and a list of globals naming three
   features #R296 was told to delete; both had been true since the round that caused them.

   `gh run list` sorted by time is the reason: a nightly is one run among the dozens a working day
   produces, so «is the deep tier green» is a question nobody thought to ask rather than one anybody
   answered wrongly. CLAUDE.md §1 already sends every session through this command before it starts,
   which makes this the one place the answer is guaranteed to be read.

   ⚠ IT NEVER MAKES A SESSION WAIT OR FAIL. `gh` may be missing, logged out, offline or rate-limited;
   every one of those prints nothing at all rather than an error, and the call is capped at six
   seconds. `status` must never exit non-zero (see the header). */
function nightly() {
  let raw = '';
  try {
    raw = execFileSync('gh', ['run', 'list', '--workflow=ci.yml', '--event=schedule', '--limit', '1',
      '--json', 'conclusion,createdAt,databaseId'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 }).trim();
  } catch { return null; }
  let r; try { r = JSON.parse(raw)[0]; } catch { return null; }
  if (!r || !r.createdAt) return null;
  const days = Math.floor((Date.now() - Date.parse(r.createdAt)) / 86400000);
  /* ⚠ «cancelled» IS NOT «green». A run that was cut short proved nothing, and a gate that reads
     silence as a pass is the shape this whole round is about. */
  const ok = r.conclusion === 'success';
  return {
    ok,
    day: String(r.createdAt).slice(0, 10),
    age: days > 1 ? `・${days}日前` : '',
    id: r.databaseId,
    what: ok ? '緑' : (r.conclusion === 'cancelled' ? '中断（何も証明していない）' : '赤'),
  };
}

/* ── STATUS ─────────────────────────────────────────────────────────────────────────────────── */
function status(brief) {
  const master = masterDir();
  const here = q(['rev-parse', '--show-toplevel']) || REPO;
  const branch = q(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
  const dirty = q(['status', '--porcelain']).split('\n').filter(Boolean);
  const round = nextRound(master);
  const isMaster = resolve(here) === resolve(master);

  const onRound = (branch.match(/\br(\d{2,4})-/i) || [])[1];

  if (brief) {
    console.log(`IntMap · branch ${branch}${isMaster ? ' (原本＝main の置き場)' : ''} · 未コミット ${dirty.length}件`
      + (onRound ? ` · このセッションは R${onRound}` : ` · 空きラウンド R${round}`));
    console.log(`原本: ${master}`);
    if (isMaster) console.log('⚠ 原本では作業しない。node scripts/worktree.mjs new <slug> で worktree を作る（CLAUDE.md §6）。');
    const nb = nightly();
    if (nb && !nb.ok) console.log(`⚠ deep tier (nightly ${nb.day}${nb.age}): ${nb.what}  → gh run view ${nb.id} --log-failed`);
    console.log('実行戦略は .claude/rules/execution-strategy.md ／ ラウンドの手順は /intmap-round。');
    return;
  }

  const ahead = q(['rev-list', '--count', 'origin/main..HEAD']);
  const behind = q(['rev-list', '--count', 'HEAD..origin/main']);
  /* ⚠ THE NEWEST ROUND IS THE LARGEST NUMBER, NOT THE FIRST ONE ON THE PAGE. The first `#R…` in
     DEV-NOTES.md is «(#R217 で整理)» in the explanatory header — read as «latest», it reported a
     round from 76 rounds ago on the very first run of this script. */
  const notes = join(master, 'DEV-NOTES.md');
  let latest = '(unknown)';
  if (existsSync(notes)) {
    const ns = [...readFileSync(notes, 'utf8').matchAll(/#R(\d{2,4})/g)].map((m) => +m[1]);
    if (ns.length) latest = 'R' + Math.max(...ns);
  }
  /* If this checkout is already on a round branch, THAT is this session's number — «next free» is
     the number for the NEXT piece of work and saying only that mid-round is misleading. */
  const mine = onRound;

  console.log('IntMap · セッションの現在地\n');
  console.log(`  原本 (master)      ${master}${isMaster ? '   ← いまここ' : ''}`);
  console.log(`  作業ディレクトリ    ${here}`);
  console.log(`  branch             ${branch}`);
  console.log(`  origin/main との差  ahead ${ahead || '?'} / behind ${behind || '?'}`);
  console.log(`  未コミット変更      ${dirty.length}件${dirty.length ? '\n' + dirty.slice(0, 12).map((l) => '                       ' + l).join('\n') : ''}`);
  if (dirty.length > 12) console.log(`                       … ほか ${dirty.length - 12}件`);
  console.log(`  DEV-NOTES の最新    ${latest}`);
  if (mine) console.log(`  このセッションの番号 R${mine}`);
  console.log(`  空きラウンド番号    R${round}   ⚠ push の直前にもう一度取り直すこと`);
  const nf = nightly();
  console.log(`  deep tier (nightly) ${nf ? `${nf.what}${nf.ok ? '' : `   → gh run view ${nf.id} --log-failed`}   (${nf.day}${nf.age})` : '不明（gh が無い・未ログイン・オフラインのいずれか）'}`);

  const wts = q(['worktree', 'list']).split('\n').filter(Boolean);
  console.log(`\n  worktree ${wts.length}本（${wts.length - 1}本は別セッションのものかもしれない——触らない）`);
  for (const w of wts) console.log('    ' + w);

  if (isMaster) {
    console.log('\n  ⚠ いま原本にいる。原本は「main の置き場」であって作業場ではない（CLAUDE.md §6）。');
    console.log('     作業を始めるなら:  node scripts/worktree.mjs new <slug>');
  }
  console.log('\n  次にやること: .claude/rules/execution-strategy.md ／ 手順は /intmap-round');
}

/* ── NEW ────────────────────────────────────────────────────────────────────────────────────── */
function makeNew(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error('usage: node scripts/worktree.mjs new <slug>   (小文字・数字・ハイフンのみ)');
    process.exit(1);
  }
  const master = masterDir();

  /* Fetch first: the free-number scan reads `git branch -a`, and a stale remote-tracking set is
     precisely how another session's claim becomes invisible. */
  q(['fetch', 'origin', '--quiet']);

  const n = nextRound(master);
  const branch = `feat/r${n}-${slug}`;
  const port = 4000 + n;

  /* OUTSIDE ONEDRIVE, and said out loud: os.tmpdir() is %LOCALAPPDATA%\Temp on Windows, which is
     what CLAUDE.md §6 names. The master must stay a clean `main`. */
  const base = join(tmpdir(), 'intmap-worktrees');
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  const dir = join(base, `wt-r${n}-${slug}`);
  if (existsSync(dir)) { console.error(`✖ ${dir} は既に存在する`); process.exit(1); }

  console.log(`IntMap · R${n} の作業場を用意する\n`);
  git(['worktree', 'add', '-b', branch, dir, 'origin/main']);
  console.log(`  ✓ branch    ${branch}  (origin/main から)`);
  console.log(`  ✓ worktree  ${dir}`);

  /* node_modules is a junction to the master's, not a copy: #R278 spent a round on a worktree that
     had none, and `npm ci` per worktree is ~31,000 files that package-lock.json can regenerate. */
  const nm = join(dir, 'node_modules');
  const src = join(master, 'node_modules');
  if (existsSync(src) && !existsSync(nm)) {
    try { symlinkSync(src, nm, 'junction'); console.log('  ✓ node_modules  原本から junction'); }
    catch (e) { console.log('  ⚠ node_modules を貼れなかった: ' + e.message + '  → npm ci を手で走らせる'); }
  } else if (!existsSync(src)) {
    console.log('  ⚠ 原本に node_modules が無い → その worktree で npm ci');
  }

  /* The preview entry is RELATIVE (`dist`), because this copy gets committed. ⚠ The Browser
     preview tool reads the MASTER's .claude/launch.json and caches by name (#R289) — if a preview
     is needed before the merge, add a temporary ABSOLUTE entry there and take it out again. */
  const ljPath = join(dir, '.claude', 'launch.json');
  try {
    const lj = JSON.parse(readFileSync(ljPath, 'utf8'));
    const name = `intmap-preview-r${n}`;
    if (!lj.configurations.some((c) => c.name === name)) {
      lj.configurations.unshift({
        name,
        runtimeExecutable: 'node',
        runtimeArgs: ['scripts/serve.mjs', '--root', 'dist', '--port', String(port)],
        port,
        url: `http://127.0.0.1:${port}`,
      });
      writeFileSync(ljPath, JSON.stringify(lj, null, 2) + '\n');
      console.log(`  ✓ preview   ${name}  →  http://127.0.0.1:${port}`);
    }
  } catch (e) { console.log('  ⚠ launch.json を更新できなかった: ' + e.message); }

  console.log('\n  作業ディレクトリ（以降の編集は全部この中で）:');
  console.log('    ' + dir);
  console.log('\n  並列実装をするなら、この絶対パスと「触ってよいファイルの一覧」を');
  console.log('  intmap-implementer に渡す。同じファイルを2体に書かせない。');
}

/* ── DONE ───────────────────────────────────────────────────────────────────────────────────── */
function done() {
  const master = masterDir();
  const here = resolve(q(['rev-parse', '--show-toplevel']) || REPO);
  if (here === resolve(master)) {
    console.error('✖ ここは原本。原本の worktree は消せない（そもそも作業場ではない）。');
    process.exit(1);
  }
  const branch = q(['rev-parse', '--abbrev-ref', 'HEAD']);
  console.log(`IntMap · 片付け\n  worktree ${here}\n  branch   ${branch}`);

  /* Unlink the junction WITHOUT following it — rm -rf on a junction that resolved would delete the
     master's node_modules. unlink/rmdir both operate on the link itself. */
  const nm = join(here, 'node_modules');
  try {
    if (existsSync(nm) && lstatSync(nm).isSymbolicLink()) { unlinkSync(nm); console.log('  ✓ node_modules の junction を外した'); }
  } catch { try { rmdirSync(nm); } catch { /* leave it; git worktree remove --force handles it */ } }

  /* ⚠ `git worktree remove` PARTIALLY SUCCEEDS ON THIS MACHINE, AND THE FIRST VERSION OF THIS
     FUNCTION TREATED THAT AS TOTAL FAILURE. Measured: the checkout is deleted and the entry drops
     out of `worktree list`, but deleting the bookkeeping directory under the master's
     .git/worktrees/ raises «Permission denied» — the master's .git lives in OneDrive, which holds
     those files open. The old code exited 1 on that error, so the worktree was gone, the admin
     directory was orphaned AND the branch was left behind: the one outcome nobody wants.
     So the error is not the verdict. `prune` clears the orphan, and then the LIST is asked whether
     the worktree is really gone. */
  let removeErr = '';
  try { git(['worktree', 'remove', here, '--force'], master); }
  catch (e) { removeErr = String(e.message || e).split('\n').filter((l) => /error|fatal/i.test(l))[0] || 'unknown'; }
  q(['worktree', 'prune'], master);

  const stillListed = q(['worktree', 'list', '--porcelain'], master)
    .split('\n').some((l) => l.startsWith('worktree ') && resolve(l.slice(9).trim()) === here);
  if (stillListed) {
    console.error('  ✖ worktree を削除できなかった: ' + removeErr);
    console.error('     開いているシェルやエディタがそのディレクトリを掴んでいないか確認して、やり直す。');
    process.exit(1);
  }
  console.log('  ✓ worktree を削除' + (removeErr ? `（管理ディレクトリは prune で回収: ${removeErr}）` : ''));

  if (branch && branch !== 'main' && branch !== 'HEAD') {
    /* -d, never -D: git refuses an unmerged branch, and that refusal is the safety rule. */
    try { git(['branch', '-d', branch], master); console.log(`  ✓ branch ${branch} を削除`); }
    catch {
      /* ⚠ AND IT WILL ALWAYS REFUSE HERE, BECAUSE CLAUDE.md §5 MERGES BY SQUASH. A squashed
         branch's commits are not ancestors of main, so `-d` calls every finished round «unmerged»
         and the branches pile up — the rule would be technically safe and useless in practice.
         So ask the question -d is a proxy for: does this branch still carry anything main lacks?
         `git diff --quiet origin/main <branch>` compares the two TREES, which is exactly right
         after a squash: identical content means nothing would be lost. Any difference at all —
         including work committed after the merge — leaves the branch alone. */
      const sameTree = (() => {
        try { git(['diff', '--quiet', 'origin/main', branch], master); return true; } catch { return false; }
      })();
      if (sameTree) {
        try {
          git(['branch', '-D', branch], master);
          console.log(`  ✓ branch ${branch} を削除（squash merge 済み——origin/main と同一内容）`);
        } catch (e) { console.log(`  ⚠ ${branch} を削除できなかった: ${e.message}`); }
      } else {
        console.log(`  ⚠ ${branch} は origin/main に無い変更を持っているので残した（消すなら merge を先に）`);
      }
    }
  }
  console.log('\n  ⚠ まだなら:  node scripts/master-sync.mjs --sync  →  pwsh -File scripts/backup-usb.ps1');
}

/* ── entry ──────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';
try {
  if (cmd === 'status') status(argv.includes('--brief'));
  else if (cmd === 'new') makeNew(argv[1]);
  else if (cmd === 'done') done();
  else { console.error(`unknown command: ${cmd}\nusage: node scripts/worktree.mjs [status [--brief] | new <slug> | done]`); process.exit(1); }
} catch (e) {
  /* status is wired to a hook — it reports and leaves, it does not take the session down with it */
  if (cmd === 'status') { console.log('IntMap · 現在地を読めなかった: ' + e.message); process.exit(0); }
  throw e;
}
