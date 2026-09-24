#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE SESSION'S WORKSPACE IS SET UP BY A TOOL, NOT BY REMEMBERING  (#R295)
 * ----------------------------------------------------------------------------
 *  「私にworktree、subagent、agent設定などの手動管理を要求しない。」
 *
 *  AGENTS.md §6 asks every parallel session for its own branch and its own worktree, OUTSIDE
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
 *      node scripts/worktree.mjs status        # everything AGENTS.md §1 asks for, in one read
 *      node scripts/worktree.mjs status --brief # the same, three lines (used by the SessionStart hook)
 *      node scripts/worktree.mjs new <slug>    # branch feat/<slug> + worktree + node_modules + preview port
 *      node scripts/worktree.mjs done          # remove THIS worktree and its branch, after the merge
 *      node scripts/worktree.mjs verified      # record that origin/main was verified in production
 *
 *  ⚠ NO ROUND NUMBERS (利用者承認済み: 「ラウンド番号を名前として使うのをやめる」). This used to pick
 *  «the next free round number» = max+1 over DEV-NOTES, branches, worktrees, launch.json and tests/,
 *  and every session that ran the scan before the others pushed was handed THE SAME number — that is
 *  what the renumbering treadmill was (#R671: seven times in one round). A piece of work is now named
 *  by its SLUG (feat/<slug>, wt-<slug>, tests/<slug>-checks.test.mjs, intmap-preview-<slug>), and
 *  once its PR exists by the PR NUMBER, which the squash merge writes into the subject as «(#N)».
 *  The slug is claimed ATOMICALLY: `git worktree add -b feat/<slug>` fails if the branch exists, and
 *  every worktree on this machine shares one ref namespace.
 *
 *  ⚠ `status` NEVER EXITS NON-ZERO. It is wired to a SessionStart hook, and a hook that fails is a
 *  session that starts with an error instead of its bearings. Anything it cannot determine is
 *  printed as unknown, not thrown.
 *  ⚠ IT NEVER TOUCHES ANOTHER SESSION'S WORK. `new` only ever creates; `done` refuses to remove a
 *  worktree that is not the one it is being run from, and uses `git branch -d` (not -D) so an
 *  unmerged branch is refused by git itself rather than by a rule written here.
 * ==========================================================================*/
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, lstatSync, unlinkSync, rmdirSync, symlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { artefactNames, slugProblem } from './round-names.mjs';
import { latestEntry, NOTES_DIR } from './dev-notes.mjs';

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

/* ── WHO ALREADY HOLDS A SLUG ─────────────────────────────────────────────────────────────────
   The branch is the claim (git refuses a second `-b feat/<slug>`), but a slug can also be held by
   something that is not a branch here yet: a remote branch another machine pushed, a worktree whose
   branch was renamed, a test file or a record already on main. Each of those would make the SECOND
   holder's files collide with the first's (the add/add conflict of #R671), so all of them are asked. */
function slugTaken(master, slug) {
  const branches = q(['branch', '-a', '--format=%(refname:short)']).split('\n').map((b) => b.trim());
  const b = branches.find((x) => x === `feat/${slug}` || x.endsWith(`/feat/${slug}`));
  if (b) return `branch ${b} が既にある`;
  const wts = q(['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree '));
  const w = wts.find((l) => basename(l.slice(9).trim()) === `wt-${slug}`);
  if (w) return `worktree ${w.slice(9).trim()} が既にある`;
  const names = artefactNames(slug);
  for (const rel of [names.checks, names.spec]) if (existsSync(join(master, rel))) return `${rel} が既にある`;
  const notes = join(master, NOTES_DIR);
  if (existsSync(notes) && readdirSync(notes).some((f) => f.endsWith(`-${slug}.md`))) return `${NOTES_DIR}/ に *-${slug}.md が既にある`;
  return null;
}

/* ── THE PREVIEW PORT ───────────────────────────────────────────────────────────────────────────
   It used to be `4000 + N`, i.e. a function of the round number — and two sessions holding the same
   number got the same port. Now it is the lowest port in PREVIEW_PORTS that NO launch.json on this
   machine names (the master's and every worktree's) AND that nothing is listening on right now.
   The range sits above the per-checkout test servers (tests/helpers/session-seed.js, 4174–4373) and
   the canonical 4173, so a preview never takes a port a test run is about to bind.
   ⚠ Two `new` runs in the same instant could still both see a port as free; the second preview
   then fails to bind and says so. That is recoverable (edit launch.json), unlike a shared name. */
export const PREVIEW_PORTS = [4400, 4999];

function portsNamedInLaunchJson(master) {
  const dirs = [master, ...q(['worktree', 'list', '--porcelain']).split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim())];
  const used = new Set();
  for (const d of dirs) {
    const p = join(d, '.claude', 'launch.json');
    if (!existsSync(p)) continue;
    try { for (const c of JSON.parse(readFileSync(p, 'utf8')).configurations || []) if (c && c.port) used.add(+c.port); }
    catch { /* an unreadable launch.json names no port we can avoid; the listen probe still runs */ }
  }
  return used;
}

const listening = (port) => new Promise((res) => {
  const srv = createServer();
  srv.once('error', () => res(true));
  srv.once('listening', () => srv.close(() => res(false)));
  srv.listen(port, '127.0.0.1');
});

async function freePreviewPort(master) {
  const used = portsNamedInLaunchJson(master);
  for (let p = PREVIEW_PORTS[0]; p <= PREVIEW_PORTS[1]; p++) {
    if (used.has(p)) continue;
    if (!(await listening(p))) return p;
  }
  return null;
}

/* The label a commit is known by in a report: its PR number when the squash merge wrote one
   («… (#726)»), otherwise its short sha. Never a round number — that is not an identifier. */
const labelOf = (sha, subject) => {
  const m = /\(#(\d+)\)\s*$/.exec(String(subject || ''));
  return m ? '#' + m[1] : String(sha).slice(0, 7);
};

/* ══ (#R304) THE NIGHTLY'S ANSWER, IN FRONT OF EVERY SESSION ════════════════════════════════════
   The deep tier (109 spec files, 77 minutes — measured #R500; it was 27 files when this was written,
   the number went stale three times before anybody re-measured it, and it moved 81 → 82 DURING that
   round. `node -e "import('./scripts/tiers.mjs').then(t=>console.log(t.tierSpecs('deep').length))"`
   is the answer; scripts/deep-alarm.mjs derives it rather than restating it) has run every night since
   #R203 and has been RED every night from 2026-08-08 to 2026-08-23 — sixteen consecutive scheduled
   runs, all five `Deep rest` shards, and the aggregate job reported it honestly each time. Nobody
   looked. Two of the failures were a spec that counted to eight while the loader had grown to ten,
   and a list of globals naming three features #R296 was told to delete; both had been true since
   the round that caused them.

   ⚠ (#R372) AND THREE OF THE SIXTEEN NEVER RAN AT ALL. They were CANCELLED, not red: `ci.yml` put
   the schedule and pushes to main in one concurrency group, so a merge landing inside the nightly
   window killed it — measured 36 s, 51 s and 31 s after the merge that did it. A cancelled run
   uploads no report, so `deep-alarm.mjs` opened its issue with nothing in it. Both are fixed;
   the reason they are recorded here is that «red» and «never ran» look identical in `gh run list`.

   `gh run list` sorted by time is the reason: a nightly is one run among the dozens a working day
   produces, so «is the deep tier green» is a question nobody thought to ask rather than one anybody
   answered wrongly. AGENTS.md §1 already sends every session through this command before it starts,
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

/* ══ (#R771) THE STEPS THE ROUND NO LONGER WAITS FOR ════════════════════════════════════════════
   AGENTS.md §5.1 ends a round with production verification, the master fast-forward and the USB
   mirror. #R771 moved WHEN those happen — not WHETHER: they are picked up at the START of the next
   session instead of being waited on at the end of this one. Nothing is dropped.

   ⚠ A STEP MOVED LATER NEEDS A READER, or «deferred» and «never done» are the same observation
   (memory: intmap-records-with-no-reader, intmap-background-work-needs-a-receipt). `status` is that
   reader: AGENTS.md §1 sends every session through it before it starts, which makes it the one
   place the answer is guaranteed to be read — the same argument that put the nightly here (#R304).

   ⚠ NONE OF THIS MAY FAIL, THROW, OR MAKE A SESSION WAIT (see the header). `gh` may be missing,
   logged out, offline or rate-limited; master-sync may be gone. Every one of those is «不明», and
   «不明» IS NOT «問題なし» — .agents/rules/one-pass-or-a-reason.md §5: «確認できなかった» is
   neither a failure nor a pass, and the two must not be given the same answer. That is why every
   reader below returns a `known` flag rather than a falsy value that reads as «fine».

   ⚠ origin/main HERE IS WHATEVER THIS CHECKOUT LAST FETCHED. `status` deliberately does not fetch
   — it is wired to a hook and a hook that waits on the network is a session that starts late — so
   these counts can only UNDERSTATE how far behind the world is, never overstate it. `new` fetches,
   and so does `verified`, because the sha IT writes down is a claim about one specific commit. */

/* How many commits, and which PRs, lie between a commit and origin/main — each commit named by
   the PR its squash subject carries («… (#726)») or else by its sha (labelOf above). It used to
   read `R<N>` out of the subject, i.e. a number the commit's author had typed.
   ⚠ `q` answers '' both for «no commits» and for «git could not say», and those are the two
   answers this whole block is about keeping apart — so an empty log is cross-examined: if the
   starting commit is not an object this checkout holds, nothing was measured. */
function commitsAfter(from, to) {
  if (!from || !to) return { known: false };
  const log = q(['log', '--format=%H %s', `${from}..${to}`]);
  if (!log) {
    if (q(['cat-file', '-t', from]) !== 'commit') return { known: false };
    return { known: true, n: 0, labels: [] };
  }
  const lines = log.split('\n').filter(Boolean);
  const labels = [...new Set(lines.map((l) => labelOf(l.slice(0, 40), l.slice(41))))];
  return { known: true, n: lines.length, labels };
}

/* At most this many labels are spelled out before the rest become «ほか N件». Purely a display
   width — the count beside it is always the whole truth, so nothing is hidden by it. */
const LABELS_SHOWN = 6;
const labelList = (labels) => (labels.length > LABELS_SHOWN
  ? labels.slice(0, LABELS_SHOWN).join(' ') + ` ほか${labels.length - LABELS_SHOWN}件`
  : labels.join(' '));

/* (a) WHAT IS ON PRODUCTION. The deploy workflow is the only thing that puts bytes on the Pages
   site, so the sha of its last SUCCESSFUL run is what the public is looking at. A newer run that
   failed is a separate fact and is reported separately: «the deploy is red» and «the deploy has
   not caught up» have different next moves. Capped at five runs and six seconds, like nightly(). */
function deployState() {
  let raw = '';
  try {
    raw = execFileSync('gh', ['run', 'list', '--workflow=deploy.yml', '--limit', '5',
      '--json', 'conclusion,headSha,createdAt,databaseId'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 }).trim();
  } catch { return { known: false }; }
  let runs; try { runs = JSON.parse(raw); } catch { return { known: false }; }
  if (!Array.isArray(runs) || !runs.length) return { known: false };

  const newest = runs[0];
  /* `conclusion` is '' while a run is still going: that is «not finished», not «failed». */
  const broken = newest.conclusion && newest.conclusion !== 'success'
    ? { id: newest.databaseId, what: newest.conclusion, day: String(newest.createdAt || '').slice(0, 10) } : null;
  const ok = runs.find((r) => r.conclusion === 'success');
  if (!ok || !ok.headSha) return { known: false, broken };

  const target = q(['rev-parse', 'origin/main']);
  const gap = commitsAfter(ok.headSha, target);
  return { known: gap.known, broken, sha: ok.headSha, day: String(ok.createdAt || '').slice(0, 10), ...gap };
}

/* (b) WHAT HAS BEEN VERIFIED IN PRODUCTION — a receipt, because nothing else can tell «somebody
   looked at the live site» from «nobody has looked yet». It is machine-local (a claim about what
   THIS operator checked, holding this machine's timestamps) and therefore untracked; it lives
   beside the master so all of this machine's worktrees read the ONE store rather than a copy each
   (memory: intmap-agent-memory-is-one-store). */
const receiptsPath = (master) => join(master, '.intmap', 'receipts.json');

function readReceipts(master) {
  const p = receiptsPath(master);
  if (!existsSync(p)) return { state: 'none' };
  try { return { state: 'ok', data: JSON.parse(readFileSync(p, 'utf8')) || {} }; }
  catch (e) { return { state: 'unreadable', why: e.message }; }
}

function verifiedState(master) {
  const r = readReceipts(master);
  if (r.state === 'unreadable') return { known: false, why: r.why };
  /* ⚠ NO RECEIPT IS NOT AN ALARM. The first session after this lands has none, and a warning that
     is guaranteed on its first run is a warning nobody reads after that. It is simply stated. */
  if (r.state === 'none') return { known: true, none: true };
  const v = r.data && r.data.prodVerified;
  if (!v || !v.sha) return { known: true, none: true };
  const gap = commitsAfter(v.sha, q(['rev-parse', 'origin/main']));
  /* The receipt was read; what could not be answered is how far it is from origin/main. Say which
     of the two it is — «unreadable receipt» and «a commit this checkout does not hold» have
     different next moves (fix the file / fetch). */
  if (!gap.known) return { known: false, why: `受領証の ${String(v.sha).slice(0, 7)} をこの checkout が持っていない`, sha: v.sha };
  /* `round` is what receipts written before the numbers went away carry — shown, never computed */
  return { ...gap, at: v.at || null, pr: v.pr || null, round: v.round || null, sha: v.sha };
}

/* (c) IS THE MASTER THE MERGED STATE. ⚠ THE VERDICT IS NOT RE-DERIVED HERE. scripts/master-sync.mjs
   already owns it, including the one distinction that is easy to lose — «behind» blocks, «dirty»
   does not, because the dirty file usually belongs to a concurrent session and the USB mirror
   copies the working directory as it stands (AGENTS.md §6). So the script is run and ITS exit code
   is the answer; only the presentation happens here. `--offline` because `status` does not fetch. */
function masterState() {
  const script = join(HERE, 'master-sync.mjs');
  if (!existsSync(script)) return { known: false, why: 'scripts/master-sync.mjs が無い' };
  let r;
  try {
    r = spawnSync(process.execPath, [script, '--check', '--offline'],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  } catch (e) { return { known: false, why: e.message }; }
  if (!r || r.error || r.status === null || r.status === undefined) {
    return { known: false, why: (r && r.error && r.error.message) || 'master-sync が答えを返さなかった' };
  }
  if (r.status === 2) return { known: false, why: (r.stderr || '').trim().split('\n')[0] || 'exit 2' };
  const err = String(r.stderr || '');
  /* master-sync prints its blocking reasons on its own «  · » lines and its advisories as
     «warning — …». Read those lines rather than the prose around them. */
  const reasons = err.split('\n').filter((l) => /^\s+·\s/.test(l)).map((l) => l.replace(/^\s+·\s*/, '').trim());
  const warnings = err.split('\n').filter((l) => /warning —/.test(l)).map((l) => l.replace(/^.*warning —\s*/, '').trim());
  return { known: true, ok: r.status === 0, reasons, warnings };
}

/* Everything above, in one call, plus the short labels the hook line is built from.
   An item is «pending» only when it is KNOWN to be outstanding: an unknown is neither pending nor
   done, and the full `status` states it in its own right (the brief follows nightly()'s precedent
   of staying silent about what it could not read, rather than printing a line every session). */
function pendingWork(master) {
  const deploy = deployState();
  const verified = verifiedState(master);
  const copy = masterState();
  const items = [];
  if (deploy.known && deploy.n > 0) items.push(`本番未到達 ${deploy.labels.length ? labelList(deploy.labels) : `${deploy.n} commit`}`);
  if (deploy.broken) items.push(`deploy ${deploy.broken.what} (run ${deploy.broken.id})`);
  if (verified.known && !verified.none && verified.n > 0) {
    items.push(`本番検証 ${verified.labels.length ? labelList(verified.labels) : `${verified.n} commit 分`}`);
  }
  if (copy.known && !copy.ok) items.push(`原本: ${copy.reasons[0] || 'merge 後の状態ではない'}`);
  return { deploy, verified, copy, items };
}

/* ── STATUS ─────────────────────────────────────────────────────────────────────────────────── */
function status(brief) {
  const master = masterDir();
  const here = q(['rev-parse', '--show-toplevel']) || REPO;
  const branch = q(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
  const dirty = q(['status', '--porcelain']).split('\n').filter(Boolean);
  const isMaster = resolve(here) === resolve(master);

  /* This session's identifier is its SLUG — the branch it is on — never a number it was handed.
     There is no «next free number» to offer any more: a slug is chosen from the work, and `new`
     refuses one that is already held. */
  const mine = (branch.match(/^feat\/(.+)$/) || [])[1] || null;

  if (brief) {
    console.log(`IntMap · branch ${branch}${isMaster ? ' (原本＝main の置き場)' : ''} · 未コミット ${dirty.length}件`
      + (mine ? ` · このセッション ${mine}` : ''));
    console.log(`原本: ${master}`);
    if (isMaster) console.log('⚠ 原本では作業しない。node scripts/worktree.mjs new <slug> で worktree を作る（AGENTS.md §6）。');
    const nb = nightly();
    if (nb && !nb.ok) console.log(`⚠ deep tier (nightly ${nb.day}${nb.age}): ${nb.what}  → gh run view ${nb.id} --log-failed`);
    /* (#R771) one line, and ONLY when something is actually outstanding. This prints at the top of
       every session, so a line that is always there is a line nobody reads. */
    const pw = pendingWork(master);
    if (pw.items.length) console.log(`⚠ 前回までの未了: ${pw.items.join(' / ')}  → node scripts/worktree.mjs status`);
    console.log('実行戦略は .agents/rules/execution-strategy.md ／ 手順は .agents/skills/intmap-round/。');
    return;
  }

  const ahead = q(['rev-list', '--count', 'origin/main..HEAD']);
  const behind = q(['rev-list', '--count', 'HEAD..origin/main']);
  /* The newest record, from the ONE function that answers it (scripts/dev-notes.mjs latestEntry).
     This used to be a sixth spelling of «the largest #R in DEV-NOTES.md» — and its first run
     reported a round from 76 rounds ago, because the first `#R…` on the page was in the header. */
  let latest = '(unknown)';
  try {
    const e = latestEntry(master);
    if (e) latest = `${e.kind === 'dated' ? e.date : 'R' + e.round} ${e.title.replace(/\*\*/g, '').slice(0, 60)}`;
  } catch { /* a master that predates dev-notes/ has no answer here — «unknown» is the honest one */ }

  console.log('IntMap · セッションの現在地\n');
  console.log(`  原本 (master)      ${master}${isMaster ? '   ← いまここ' : ''}`);
  console.log(`  作業ディレクトリ    ${here}`);
  console.log(`  branch             ${branch}`);
  console.log(`  origin/main との差  ahead ${ahead || '?'} / behind ${behind || '?'}`);
  console.log(`  未コミット変更      ${dirty.length}件${dirty.length ? '\n' + dirty.slice(0, 12).map((l) => '                       ' + l).join('\n') : ''}`);
  if (dirty.length > 12) console.log(`                       … ほか ${dirty.length - 12}件`);
  console.log(`  最新の記録          ${latest}`);
  if (mine) console.log(`  このセッション      ${mine}（branch feat/${mine}。PR を作ったらその番号が識別子）`);
  const nf = nightly();
  console.log(`  deep tier (nightly) ${nf ? `${nf.what}${nf.ok ? '' : `   → gh run view ${nf.id} --log-failed`}   (${nf.day}${nf.age})` : '不明（gh が無い・未ログイン・オフラインのいずれか）'}`);

  /* (#R771) THE STEPS THIS ROUND'S PREDECESSORS NO LONGER WAITED FOR. Each line says what is
     known, or says that it could not be read — and every outstanding one carries the command that
     clears it, because a report whose reader has to go and look up the next move is a report that
     gets deferred again. */
  const pw = pendingWork(master);
  console.log('\n  前回までの工程（ラウンドの末尾で待たず、ここで回収する——AGENTS.md §5.1）');
  const d = pw.deploy;
  if (!d.known) {
    console.log(`    本番への到達    不明（gh が無い・未ログイン・オフライン・deploy の記録が読めない のいずれか）`);
  } else if (d.n === 0) {
    console.log(`    本番への到達    origin/main が本番に出ている (${String(d.sha).slice(0, 7)}${d.day ? `・${d.day}` : ''})`);
  } else {
    console.log(`    本番への到達    ⚠ ${d.n} commit が本番に届いていない${d.labels.length ? `: ${labelList(d.labels)}` : ''}`);
    console.log(`                    本番 ${String(d.sha).slice(0, 7)}${d.day ? `・${d.day}` : ''}  → gh run list --workflow=deploy.yml`);
  }
  if (d.broken) console.log(`                    ⚠ 最新の deploy が ${d.broken.what}  → gh run view ${d.broken.id} --log-failed`);

  const v = pw.verified;
  if (!v.known) console.log(`    本番検証        不明（${v.why || '受領証を読めなかった'}）`);
  else if (v.none) console.log('    本番検証        記録が無い  → 検証したら node scripts/worktree.mjs verified');
  else if (v.n === 0) console.log(`    本番検証        origin/main まで済み${v.pr ? ` (#${v.pr})` : (v.round ? ` (${v.round})` : '')}${v.at ? `・${String(v.at).slice(0, 10)}` : ''}`);
  else {
    console.log(`    本番検証        ⚠ ${v.n} commit 分が未検証${v.labels.length ? `: ${labelList(v.labels)}` : ''}`);
    console.log(`                    最後の検証 ${String(v.sha).slice(0, 7)}${v.at ? `・${String(v.at).slice(0, 10)}` : ''}  → 本番を見てから node scripts/worktree.mjs verified`);
  }

  const c = pw.copy;
  if (!c.known) console.log(`    原本の同期      不明（${c.why || 'master-sync が答えなかった'}）`);
  else if (c.ok) console.log('    原本の同期      原本は merge 後の状態');
  else {
    console.log('    原本の同期      ⚠ 原本が merge 後の状態ではない  → node scripts/master-sync.mjs --sync');
    for (const r of c.reasons) console.log(`                    · ${r}`);
  }
  /* ⚠ ADVISORY, NOT BLOCKING — master-sync's own distinction (AGENTS.md §6): an uncommitted file
     usually belongs to a concurrent session and the USB mirror copies it as it stands. */
  for (const w of c.warnings || []) console.log(`                    (${w})`);
  /* ⚠ THE MIRROR HAS NO READER HERE, AND SAYS SO. Its ledger lives on the USB drive, which may not
     even be plugged in; claiming anything about it from this side would be the exact shape this
     block exists to avoid. It is named because it follows the sync, not because it was checked. */
  console.log('    USB ミラー      ここでは読んでいない（原本の同期のあとに走らせる。§11.2）');
  console.log('                    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1');
  /* ⚠ «no receipt» is NOT «done», so it does not get to say everything is finished either. */
  if (!pw.items.length && d.known && v.known && !v.none && c.known) {
    console.log('    → 読めた3つ（本番到達・本番検証・原本）は全部済んでいる。');
  }

  const wts = q(['worktree', 'list']).split('\n').filter(Boolean);
  console.log(`\n  worktree ${wts.length}本（${wts.length - 1}本は別セッションのものかもしれない——触らない）`);
  for (const w of wts) console.log('    ' + w);

  if (isMaster) {
    console.log('\n  ⚠ いま原本にいる。原本は「main の置き場」であって作業場ではない（AGENTS.md §6）。');
    console.log('     作業を始めるなら:  node scripts/worktree.mjs new <slug>');
  }
  console.log('\n  次にやること: .agents/rules/execution-strategy.md ／ 手順は .agents/skills/intmap-round/');
}

/* ── NEW ────────────────────────────────────────────────────────────────────────────────────── */
async function makeNew(slug) {
  const master = masterDir();

  /* Fetch first: the slug check reads `git branch -a`, and a stale remote-tracking set is
     precisely how another machine's claim becomes invisible. */
  q(['fetch', 'origin', '--quiet']);

  const why = slugProblem(slug, (s) => slugTaken(master, s));
  if (why) {
    console.error(`✖ ${why}\nusage: node scripts/worktree.mjs new <slug>   （作業の主題。例: dem-tile-budget）`);
    process.exit(1);
  }
  const branch = `feat/${slug}`;

  /* OUTSIDE ONEDRIVE, and said out loud: os.tmpdir() is %LOCALAPPDATA%\Temp on Windows, which is
     what AGENTS.md §6 names. The master must stay a clean `main`. INTMAP_WORKTREE_BASE exists for
     the tests, which must not create worktrees in the real place. */
  const base = process.env.INTMAP_WORKTREE_BASE || join(tmpdir(), 'intmap-worktrees');
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  const dir = join(base, `wt-${slug}`);
  if (existsSync(dir)) { console.error(`✖ ${dir} は既に存在する`); process.exit(1); }

  console.log(`IntMap · ${slug} の作業場を用意する\n`);
  /* ⚠ THIS LINE IS THE CLAIM. Every worktree on this machine shares one ref namespace, and
     `-b` refuses a branch that exists — so of two sessions racing for one slug, exactly one gets
     it, and the other is told so by git rather than by a scan that could be a moment stale. */
  const base0 = q(['rev-parse', '--verify', 'origin/main']) ? 'origin/main' : 'HEAD';
  try { git(['worktree', 'add', '-b', branch, dir, base0]); }
  catch (e) {
    console.error(`✖ ${branch} を作れなかった（同じ slug を別のセッションが今取ったかもしれない）: ${String(e.message || e).split('\n').find((l) => /fatal|error/i.test(l)) || e.message}`);
    process.exit(1);
  }
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

  /* The preview entry is RELATIVE (`dist`) so it means the same thing from any checkout.
     ⚠ (#R338) this file is NO LONGER TRACKED — it holds absolute paths into this machine's
     worktrees, and while it was tracked the preview tool's writes into the MASTER's copy blocked
     every fast-forward there (and with it the USB backup). It is still written and still read.
     ⚠ The Browser preview tool reads the MASTER's .claude/launch.json and caches by name (#R289),
     so a preview wanted before the merge still needs an absolute entry over there. */
  const ljPath = join(dir, '.claude', 'launch.json');
  try {
    const port = await freePreviewPort(master);
    if (port == null) throw new Error(`${PREVIEW_PORTS[0]}〜${PREVIEW_PORTS[1]} に空きポートが無い`);
    /* a fresh clone has no copy at all now that it is ignored — start one rather than warn */
    mkdirSync(dirname(ljPath), { recursive: true });
    if (!existsSync(ljPath)) writeFileSync(ljPath, JSON.stringify({ version: '0.0.1', configurations: [] }, null, 2) + '\n');
    const lj = JSON.parse(readFileSync(ljPath, 'utf8'));
    const name = `intmap-preview-${slug}`;
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

  trustWithCodex(dir);

  console.log('\n  作業ディレクトリ（以降の編集は全部この中で）:');
  console.log('    ' + dir);
  /* (#R674, then without numbers) …AND THE NAMES THIS WORK'S FILES MUST CARRY. MEASURED in #R671:
     two sessions both created tests/r568-checks.test.mjs from the same «next free number», git
     raised an add/add conflict, and the automation committed the markers — the file stopped parsing
     and a whole file of regressions was gone. The slug was just refused if anything holds it, so
     these names are this session's alone. `check:static` (round-name) refuses a new numbered one. */
  const names = artefactNames(slug);
  const d0 = new Date().toLocaleDateString('sv-SE');
  console.log('\n  この作業のファイルの名前（slug で一意。番号は付けない）:');
  console.log(`    ${names.checks}        node --test で走る回帰`);
  console.log(`    ${names.spec}                Playwright の spec（要るなら。変更した spec は PR で core に入る）`);
  console.log(`    ${NOTES_DIR}/${d0}-${slug}.md        記録（front matter に title / date）→ node scripts/dev-notes.mjs --write`);
  console.log('  ⚠ 新しい tests/r<N>… は check:static が拒む（.agents/skills/intmap-round/ §4。memory も同じ規約）');

  console.log('\n  並列実装をするなら、この絶対パスと「触ってよいファイルの一覧」を');
  console.log('  intmap-implementer に渡す。同じファイルを2体に書かせない。');
}

/* ── VERIFIED (#R771) ──────────────────────────────────────────────────────────────────
   The receipt production verification leaves behind. It records origin/main — the state the public
   is being served, not this session's branch, which nobody outside this machine can see.
   ⚠ IT FETCHES FIRST. Everything else here reads whatever the checkout last had, because being a
   little stale only UNDERSTATES the backlog; a receipt is the opposite — it SAYS a commit was
   looked at, so writing down a stale sha would mark commits verified that nobody ever saw. If the
   fetch cannot happen, the run says so rather than quietly recording the older ref.
   ⚠ IT MERGES INTO THE FILE. Other receipts may be added beside this one later; a writer that
   re-emits only its own key deletes them. And an UNREADABLE file is not overwritten — that is a
   thing to look at, not a thing to flatten. */
function markVerified() {
  const master = masterDir();
  let fetched = true;
  try { git(['fetch', 'origin', '--quiet']); } catch { fetched = false; }

  const sha = q(['rev-parse', 'origin/main']);
  if (!sha) {
    console.error('✖ origin/main が分からないので受領証を書けない（remote-tracking ref が無い）。');
    process.exit(1);
  }

  /* The receipt is about ONE COMMIT, and the sha is that commit's identity. The PR number beside
     it is read off the commit's own squash subject («… (#726)») — a property of the commit, not of
     whoever runs this. (It used to take a round number from the subject, or from --round.) */
  const label = labelOf(sha, q(['log', '-1', '--format=%s', sha]));
  const pr = label.startsWith('#') ? label.slice(1) : null;

  const p = receiptsPath(master);
  const prev = readReceipts(master);
  if (prev.state === 'unreadable') {
    console.error(`✖ ${p} を読めなかったので上書きしない: ${prev.why}`);
    process.exit(1);
  }
  const data = prev.state === 'ok' ? (prev.data || {}) : {};
  data.prodVerified = { sha, at: new Date().toISOString(), pr };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ 本番検証を記録: ${sha.slice(0, 7)}${pr ? ` (#${pr})` : ''}  → ${p}`
    + (fetched ? '' : '\n  ⚠ fetch できなかった。この sha はこの checkout が最後に取った origin/main。'));
}

/* ── CODEX TRUST ─────────────────────────────────────────────────────────────────────────────
   (#R503) Codex reads a project's own `.codex/` layer — the five subagent roles, the lifecycle
   hooks, the Codex-specific developer instructions — ONLY in a project it has been told to trust,
   and it records that trust against the PATH. AGENTS.md §6 gives every round a brand-new path, so
   without this step a Codex session in a fresh worktree silently loses all five roles: it still
   reads AGENTS.md (that needs no trust), but the half of the configuration that lives in files is
   skipped, and nothing says so.
   ⚠ IT ONLY EVER ADDS THE DIRECTORY THIS SCRIPT JUST CREATED, and only if it is not already
     listed. It never rewrites, reorders or removes anything else in the user's global config —
     the file is appended to, never parsed and re-emitted, because a TOML round-trip through a
     hand-rolled writer is how comments and formatting get destroyed.
   ⚠ Failure here is not fatal. Codex is optional; the round is not. */
function trustWithCodex(dir) {
  const home = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
  const cfg = join(home, 'config.toml');
  if (!existsSync(cfg)) return;                       /* Codex is not installed here — nothing to do */
  try {
    const body = readFileSync(cfg, 'utf8');
    const path = resolve(dir);
    /* both spellings a human or a previous version might have written */
    if (body.includes(`[projects.'${path}']`) || body.includes(`[projects."${path.replace(/\\/g, '\\\\')}"]`)) {
      console.log('  ✓ codex     この作業場は既に信頼済み');
      return;
    }
    if (path.includes("'")) return;                   /* a literal TOML key cannot hold a quote */
    const add = `${body.endsWith('\n') ? '' : '\n'}\n# (#R503) IntMap worktree — scripts/worktree.mjs new\n`
      + `[projects.'${path}']\ntrust_level = "trusted"\n`;
    writeFileSync(cfg, body + add);
    console.log('  ✓ codex     ~/.codex/config.toml にこの作業場を信頼済みとして登録');
  } catch (e) {
    console.log('  ⚠ codex     信頼の登録に失敗（Codex を使うなら /permissions で手動）: ' + e.message);
  }
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
      /* ⚠ AND IT WILL ALWAYS REFUSE HERE, BECAUSE AGENTS.md §5 MERGES BY SQUASH. A squashed
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
  /* ⚠ (#R396) `powershell`, not `pwsh` — PowerShell 7 is not installed here, so the hint this
     line used to print was a command that could not run. See the USAGE block in the script. */
  console.log('\n  ⚠ まだなら:  node scripts/master-sync.mjs --sync  →  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1');
}

/* ── entry ──────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';
try {
  if (cmd === 'status') status(argv.includes('--brief'));
  else if (cmd === 'new') await makeNew(argv[1]);
  else if (cmd === 'done') done();
  else if (cmd === 'verified') {
    /* ⚠ a leftover `--round R770` is REFUSED rather than ignored: the caller meant to say which
       work was verified, and silently recording something else is the one thing that must not
       happen here. The commit's sha (and its PR) is what is recorded now. */
    if (argv.includes('--round')) {
      console.error('✖ --round はもう無い。受領証は origin/main の commit（sha と、件名の (#PR)）を記録する。');
      process.exit(1);
    }
    markVerified();
  } else { console.error(`unknown command: ${cmd}\nusage: node scripts/worktree.mjs [status [--brief] | new <slug> | done | verified]`); process.exit(1); }
} catch (e) {
  /* status is wired to a hook — it reports and leaves, it does not take the session down with it */
  if (cmd === 'status') { console.log('IntMap · 現在地を読めなかった: ' + e.message); process.exit(0); }
  throw e;
}
