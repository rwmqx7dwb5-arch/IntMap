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
import { existsSync, readFileSync, writeFileSync, lstatSync, unlinkSync, rmdirSync, symlinkSync, mkdirSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { artefactNames, slugProblem } from './round-names.mjs';
import { latestEntry, NOTES_DIR } from './dev-notes.mjs';
import { liveDeployment } from './pages-publish-guard.mjs';
import { install as installMergeDriver, pending as mergePending } from './merge-driver.mjs';
import { blame as blameNights } from './nightly-blame.mjs';
import { fetchAtlasEval, atlasEvalLine } from './lib/nightly-status.mjs';

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

export const previewName = (slug) => `intmap-preview-${slug}`;

/* Add (or replace) one configuration by name; with `entry` null, remove it. A missing file is
   created only when there is something to add. */
export function upsertLaunch(path, entry, name = entry && entry.name) {
  let lj = { version: '0.0.1', configurations: [] };
  if (existsSync(path)) lj = JSON.parse(readFileSync(path, 'utf8'));
  else if (!entry) return false;
  const before = (lj.configurations || []).length;
  lj.configurations = (lj.configurations || []).filter((c) => c && c.name !== name);
  if (entry) lj.configurations.unshift(entry);
  if (!entry && lj.configurations.length === before) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(lj, null, 2) + '\n');
  return true;
}

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
   The deep tier (156 spec files, 77 minutes — measured #R500; it was 27 files when this was written,
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

/* ══ THE NIGHTS TOGETHER — which red is a regression and which is a wobble ══════════════════════
   nightly() above is ONE night wide, and one night cannot tell the two apart: from 2026-08-08 every
   scheduled run was red with a different one-to-three tests, and a real regression (the same test,
   the same failure, two nights running) sat in the same one-word 「赤」 as tests that failed once.
   scripts/deep-history.mjs reads the window (job logs, cached per run in <master>/.intmap/) and
   sorts them; this only prints its answer. It runs as a child with a deadline, because `status`
   must never make a session wait (see the header) — a night it could not read in time is said to
   be unread by the script itself, and the next session's cache already holds what this one read. */
function deepHistory() {
  const r = spawnSync(process.execPath, [join(HERE, 'deep-history.mjs'), '--json', '--budget', '6000'],
    { cwd: REPO, encoding: 'utf8', timeout: 9000, windowsHide: true });
  if (r.status !== 0 || !r.stdout) return null;
  try { const h = JSON.parse(r.stdout.trim().split('\n').pop()); return h && h.known ? h : null; } catch { return null; }
}
/* (delivery-quality) …AND WHOSE IT IS. A regression printed without the merges it broke in is a
   regression the next session also walks past (#275 named restored-layer-before-style four nights
   running and never the ten merges around it). scripts/nightly-blame.mjs turns each one into its
   range and the suspects with evidence; this prints one line of it. Local git and the spec's reach
   only — no network beyond what deepHistory() already did — and like everything here it cannot throw. */
function suspectsOf(dh) {
  try { const b = blameNights(dh, { cwd: REPO }); return b.known ? b.regressions : []; } catch { return []; }
}
const suspectWords = (r) => (!r.range ? `範囲なし（${r.why}）`
  : `範囲 ${r.good.sha}..${r.bad.sha}（main の ${r.range.commits} 本）・手がかりのある変更 ${r.withEvidence.length
    ? r.withEvidence.slice(0, 4).map((c) => (c.pr ? '#' + c.pr : c.sha.slice(0, 8))).join(' ') + (r.withEvidence.length > 4 ? ' …' : '') : 'なし（bisect が測る）'}`);
/* ══ (shell-experience) THE ATLAS EVALUATION — WHEN IT LAST SUCCEEDED, AND WHY IT DID NOT RUN ═══════════════
   MEASURED 2026-10-03: atlas-eval.yml had run eight times (its whole history) and every run stopped at its
   first step for want of two repository secrets — 「Nothing was measured」. Nothing in this command said so,
   and a red cross among dozens of runs a day is the line nobody reads (the deep tier's lesson, above).
   scripts/lib/nightly-status.mjs reads the runs, whether the newest uploaded a report (no report = nothing was
   measured) and its failing step's own annotation; this prints it. Same rules as nightly(): a few seconds per
   call at most, never fails, and «不明» when gh cannot answer. The repository is read from origin's URL so no
   call is spent asking gh which repository this is. */
function atlasEval() {
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(q(['remote', 'get-url', 'origin']).trim());
  if (!m) return null;
  return atlasEvalLine(fetchAtlasEval(m[1], { cwd: REPO, timeoutMs: 6000, perPage: 30 }));
}
const specTitle = (id, w = 90) => { const s = String(id); return s.length > w ? s.slice(0, w - 1) + '…' : s; };

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

/* (a) WHAT IS ON PRODUCTION. ⚠ (deploy-order) It is the newest `github-pages` DEPLOYMENT whose latest
   status is success — asked through scripts/pages-publish-guard.mjs, the same rule the publishing jobs
   use — not «the newest run that published». Runs are ordered by when they STARTED, and the run that
   started first can publish last: 2026-09-30 this line said production was 8d7e473 (deploy.yml, started
   20:11:32) while 1a66ec7 (CI, started 20:07:57, published 20:17:32) had overwritten it. The runs are
   still read, for one separate fact: «the deploy is red» and «the deploy has not caught up» have
   different next moves. Capped at five runs and six seconds, like nightly(). */
/** The display name of a workflow's job that publishes (the one using actions/deploy-pages). */
export function pagesJobName(yml) {
  const lines = String(yml || '').split(/\r?\n/);
  let job = null;
  for (const l of lines) {
    const k = /^  ([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (k) { job = { name: k[1] }; continue; }
    const n = /^    name:\s*(.+?)\s*$/.exec(l);
    if (job && n && !job.display) job.display = n[1].replace(/^['"]|['"]$/g, '');
    if (job && /uses:\s*actions\/deploy-pages@/.test(l)) return job.display || job.name;
  }
  return null;
}

function deployState() {
  /* (ci-build-once) TWO workflows can publish now: ci.yml publishes on every push to main once all its
     gates are green (the dist/ that CI tested is the dist/ that ships), and deploy.yml is kept for a
     manual re-publish (and for the catalogue bot, whose GITHUB_TOKEN merge starts no push workflow).
     Both are asked, and each run counts only when ITS publishing job — found in that workflow file as
     the one using actions/deploy-pages — succeeded. A CI run is never judged by its overall colour: a
     nightly or a red gate means «did not publish», not «production is broken». */
  const sources = [];
  for (const [file, extra] of [['deploy.yml', []], ['ci.yml', ['--event', 'push', '--branch', 'main']]]) {
    let pagesJob = null;
    try { pagesJob = pagesJobName(readFileSync(join(REPO, '.github', 'workflows', file), 'utf8')); } catch { /* no workflow file */ }
    if (!pagesJob) continue;
    let raw = '';
    try {
      raw = execFileSync('gh', ['run', 'list', '--workflow=' + file, ...extra, '--limit', '5',
        '--json', 'conclusion,headSha,createdAt,databaseId'],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 }).trim();
    } catch { continue; }
    let runs; try { runs = JSON.parse(raw); } catch { continue; }
    if (Array.isArray(runs)) for (const r of runs) sources.push({ ...r, file, pagesJob });
  }
  const live = liveOnPages();
  const runs = sources.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));

  const jobOk = (r) => {
    try {
      const jobs = JSON.parse(execFileSync('gh', ['run', 'view', String(r.databaseId), '--json', 'jobs'],
        { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 })).jobs || [];
      const j = jobs.find((x) => x.name === r.pagesJob);
      return j ? j.conclusion : null;
    } catch { return null; }
  };
  /* ⚠ A RED RUN CAN STILL HAVE PUT ITS BYTES ON THE SITE. The publishing job and the live-URL smoke are
     separate jobs; when only the smoke is red the Pages job succeeded and the public is looking at that
     commit. Measured 2026-09-28: three runs red on a smoke assertion alone, and this line said «3 commits
     have not reached production» while the served build stamp was the newest of them. */
  const published = (r) => {
    if (!r.conclusion) return false;                      /* still going: not finished, not failed */
    if (r.file === 'deploy.yml' && r.conclusion === 'success') return true;
    return jobOk(r) === 'success';
  };
  /* «the deploy is red» is about a run whose PUBLISHING job failed — a CI run red on a gate did not try */
  const newest = runs.find((r) => r.conclusion);
  let broken = null;
  if (newest && !published(newest)) {
    const pj = newest.file === 'deploy.yml' ? newest.conclusion : jobOk(newest);
    if (pj && pj !== 'success' && pj !== 'skipped') broken = { id: newest.databaseId, what: pj, day: String(newest.createdAt || '').slice(0, 10) };
  }
  if (!live || !live.sha) return { known: false, broken };

  const target = q(['rev-parse', 'origin/main']);
  const gap = commitsAfter(live.sha, target);
  return { known: gap.known, broken, sha: live.sha, day: String(live.at || '').slice(0, 10), ...gap };
}

/** The live deployment through `gh api` ({owner}/{repo} is filled in by gh from this checkout).
    Usually two calls (the newest deployment is the live one). 12 s each, not nightly()'s 6: measured
    2026-10-01 on this machine, one `gh api` call took 4.3–39 s, and an answer that times out is
    reported as «不明», never guessed from the runs. */
function liveOnPages() {
  const getJson = (path) => JSON.parse(execFileSync('gh', ['api', path],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 12000 }));
  try { return liveDeployment(getJson, '{owner}/{repo}', { pages: 1 }); } catch { return null; }
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
/* ── (proportional-finish) A PR WAITING ON AUTO-MERGE WHOSE CI IS RED HAS NO OTHER READER ──────
   The full run moved from the session's own machine to the PR's CI (AGENTS.md §4), and the session
   does not sit and watch that CI (§5.1: auto-merge on green). A green PR lands by itself; a RED one
   with auto-merge set waits forever and nothing says so — the session that opened it has ended.
   So it is outstanding work, named by PR number with the checks that failed, exactly like a commit
   that has not reached production. Only auto-merge PRs: one without it was not put on this chain
   (a bot refresh, a PR held on purpose), and naming it every session would be the line nobody reads.
   gh missing/logged out/offline → known:false, and the brief stays silent like the others. */
const RED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR']);
export function redAutoMerge(prs) {
  return (prs || []).filter((p) => p.autoMergeRequest).map((p) => ({
    number: p.number,
    failed: [...new Set((p.statusCheckRollup || [])
      .filter((c) => RED.has(c.conclusion || c.state)).map((c) => c.name || c.context))],
  })).filter((p) => p.failed.length);
}
function redPRs() {
  try {
    const raw = execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', '100',
      '--json', 'number,autoMergeRequest,statusCheckRollup'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 });
    return { known: true, prs: redAutoMerge(JSON.parse(raw)) };
  } catch { return { known: false, prs: [] }; }
}

function pendingWork(master) {
  const deploy = deployState();
  const red = redPRs();
  const verified = verifiedState(master);
  const copy = masterState();
  const items = [];
  if (deploy.known && deploy.n > 0) items.push(`本番未到達 ${deploy.labels.length ? labelList(deploy.labels) : `${deploy.n} commit`}`);
  if (deploy.broken) items.push(`deploy ${deploy.broken.what} (run ${deploy.broken.id})`);
  if (verified.known && !verified.none && verified.n > 0) {
    items.push(`本番検証 ${verified.labels.length ? labelList(verified.labels) : `${verified.n} commit 分`}`);
  }
  if (copy.known && !copy.ok) items.push(`原本: ${copy.reasons[0] || 'merge 後の状態ではない'}`);
  if (red.prs.length) items.push(`CI が赤い auto-merge 待ち ${red.prs.map((p) => '#' + p.number).join(' ')}`);
  return { deploy, verified, copy, red, items };
}

/* ── (generated-file-merge-driver) THE MERGE DRIVER IS CONFIGURATION, SO IT IS INSTALLED HERE ──────
   .gitattributes names the driver, but git runs it only if the clone's config defines it, and the
   config is not tracked. Every worktree of a clone shares one config (measured), and `status --brief`
   is what both products run at session start — so registering it here (idempotent, silent when it is
   already there) is what makes it present in every session on this machine without anyone being told
   to run a setup step. It also says when a merge left a regeneration waiting: the driver cannot run
   a generator itself (the working tree is not the merged tree while it runs), so `--finish` is a
   step, and a step nobody is reminded of is a step that does not happen. */
function mergeDriver(dir) {
  const r = installMergeDriver(dir);
  let waiting = [];
  try { waiting = mergePending(dir); } catch { /* unreadable = nothing we can name */ }
  return { ...r, waiting };
}
/* ⚠ ONLY WHAT NEEDS SOMEONE. A successful (re-)registration is routine and is not a line in the hook
   form — a line that appears on a machine's first session and never again would also move the line
   count the hook is held to (tests/process-worktree-status-checks.test.mjs). */
const mergeDriverLines = (md) => [
  ...(md.ok ? [] : [`⚠ merge driver を登録できなかった: ${md.why} → node scripts/merge-driver.mjs --install`]),
  ...(md.waiting.length ? [`⚠ merge が再生成・確認を保留している: ${[...new Set(md.waiting.map((w) => w.path))].slice(0, 4).join(' / ')}${md.waiting.length > 4 ? ' …' : ''} → node scripts/merge-driver.mjs --finish`] : []),
];

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
  const md = mergeDriver(here);

  if (brief) {
    console.log(`IntMap · branch ${branch}${isMaster ? ' (原本＝main の置き場)' : ''} · 未コミット ${dirty.length}件`
      + (mine ? ` · このセッション ${mine}` : ''));
    console.log(`原本: ${master}`);
    if (isMaster) console.log('⚠ 原本では作業しない。node scripts/worktree.mjs new <slug> で worktree を作る（AGENTS.md §6）。');
    const nb = nightly();
    if (nb && !nb.ok) {
      console.log(`⚠ deep tier (nightly ${nb.day}${nb.age}): ${nb.what}  → gh run view ${nb.id} --log-failed`);
      /* one more line only when the history says a red is a REGRESSION — a sporadic list printed at
         the top of every session would be the line nobody reads (the #R771 rule for this hook) */
      const dh = deepHistory();
      if (dh && dh.regressions.length) {
        console.log(`⚠ deep tier で ${dh.regressions.length} 件が連続で落ちている（退行の疑い）: `
          + dh.regressions.map((x) => `${x.id.split(' › ')[0]}（${x.streak} 晩）`).join(' / ') + '  → node scripts/deep-history.mjs');
        for (const r of suspectsOf(dh)) console.log(`    ${r.spec}: ${suspectWords(r)}  → node scripts/nightly-blame.mjs`);
      }
    }
    /* (shell-experience) the Atlas evaluation, ONLY when it is not green — the same rule as the deep tier above */
    const ae = atlasEval();
    if (ae && !ae.ok) console.log(`⚠ ${ae.text}${ae.url ? `  → ${ae.url}` : ''}`);
    /* (#R771) one line, and ONLY when something is actually outstanding. This prints at the top of
       every session, so a line that is always there is a line nobody reads. */
    const pw = pendingWork(master);
    if (pw.items.length) console.log(`⚠ 前回までの未了: ${pw.items.join(' / ')}  → node scripts/worktree.mjs status`);
    for (const l of mergeDriverLines(md)) console.log(l);
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
  console.log(`  merge driver        ${md.ok ? '登録済み（生成物・台帳・件数の衝突を解く。scripts/merge-driver.mjs）' : '未登録（' + md.why + '）'}`
    + (md.waiting.length ? ` · 保留 ${md.waiting.length} 件 → node scripts/merge-driver.mjs --finish` : ''));
  const nf = nightly();
  console.log(`  deep tier (nightly) ${nf ? `${nf.what}${nf.ok ? '' : `   → gh run view ${nf.id} --log-failed`}   (${nf.day}${nf.age})` : '不明（gh が無い・未ログイン・オフラインのいずれか）'}`);
  const aev = atlasEval();
  console.log(`  Atlas 夜間評価       ${aev ? aev.text.replace(/^Atlas 夜間評価: /, '') + (aev.ok ? '' : `   → ${aev.url || 'gh run list --workflow=atlas-eval.yml'}`) : '不明（gh が無い・未ログイン・オフラインのいずれか）'}`);
  const dh = deepHistory();
  if (!dh) {
    console.log('    直近の晩の分類   不明（gh が無い・未ログイン・オフライン・時間切れ のいずれか）→ node scripts/deep-history.mjs');
  } else {
    console.log(`    直近 ${dh.nights} 晩（読めた ${dh.read} 晩）: 連続で赤＝退行の疑い ${dh.regressions.length} 件 / 続けて赤だったが最新は通過 ${dh.mended.length} 件 / 散発 ${dh.sporadic.length} 件`
      + (dh.unread.length ? ` / 未読 ${dh.unread.length} 晩（緑とは数えない）` : ''));
    if (dh.stale) console.log(`      ⚠ ${dh.stale}`);
    for (const x of dh.regressions) console.log(`      ⚠ ${specTitle(x.id)}  ${x.streak} 晩連続（${x.since} から）`);
    for (const r of suspectsOf(dh)) console.log(`        ${r.spec}: ${suspectWords(r)}  → node scripts/nightly-blame.mjs`);
    console.log('      台帳（散発の名前と回数・直ったかを確かめるもの）→ node scripts/deep-history.mjs');
  }

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

  const rp = pw.red;
  if (!rp.known) console.log('    赤い PR         不明（gh が無い・未ログイン・オフラインのいずれか）');
  else if (!rp.prs.length) console.log('    赤い PR         auto-merge 待ちで CI が赤いものは無い');
  else {
    console.log(`    赤い PR         ⚠ auto-merge 待ちのまま CI が赤い: ${rp.prs.map((p) => '#' + p.number).join(' ')}`);
    for (const p of rp.prs) console.log(`                    #${p.number}: ${p.failed.slice(0, 4).join(' / ')}${p.failed.length > 4 ? ' …' : ''}  → gh pr checks ${p.number}`);
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
/* (data-outside-git) the datasets that live outside git (data-assets.json), handled like node_modules: one
   copy in a store outside the checkout, a link in each worktree. `pull` places them in a new worktree
   (with THAT worktree's own manifest and script); `unlink` removes the links before the worktree is
   deleted, so no recursive delete can reach through a junction into the shared store. A failure is
   said, with the command, and does not abort — the gates refuse a checkout without the data by name. */
function placeData(dir, verb) {
  if (!existsSync(join(dir, 'data-assets.json'))) return;
  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'data-assets.mjs'), verb], { cwd: dir, stdio: 'inherit' });
  if (r.status !== 0) console.log(`  ⚠ data (${verb}) に失敗した → その worktree で npm run data:pull`);
}

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
  /* (generated-file-merge-driver) the config is the clone's, so after the first time this is a no-op */
  const md = installMergeDriver(dir);
  console.log(md.ok ? `  ✓ merge     生成物の merge driver ${md.changed.length ? 'を登録した' : 'は登録済み'}（scripts/merge-driver.mjs）`
    : `  ⚠ merge driver を登録できなかった: ${md.why} → node scripts/merge-driver.mjs --install`);

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

  placeData(dir, 'pull');

  /* Two entries, because there are two readers. The worktree's copy is RELATIVE (`dist`) so it means
     the same thing from that checkout. The Browser preview tool reads only the MASTER's
     .claude/launch.json and caches by name (#R289), so the master gets an ABSOLUTE entry pointing
     into this worktree — before 2026-10-10 only the relative one was written and `preview_start`
     answered «No server named …». `done` removes both again (it used to remove neither, and the
     master's file had grown to ~200 dead entries).
     ⚠ (#R338) this file is NOT TRACKED — it holds absolute paths into this machine's worktrees. */
  try {
    const port = await freePreviewPort(master);
    if (port == null) throw new Error(`${PREVIEW_PORTS[0]}〜${PREVIEW_PORTS[1]} に空きポートが無い`);
    const name = previewName(slug);
    const abs = (p) => join(dir, p).replace(/\\/g, '/');
    upsertLaunch(join(dir, '.claude', 'launch.json'), {
      name, runtimeExecutable: 'node',
      runtimeArgs: ['scripts/serve.mjs', '--root', 'dist', '--port', String(port)],
      port, url: `http://127.0.0.1:${port}`,
    });
    upsertLaunch(join(master, '.claude', 'launch.json'), {
      name, runtimeExecutable: 'node',
      runtimeArgs: [abs('scripts/serve.mjs'), '--root', abs('dist'), '--port', String(port)],
      port,
    });
    console.log(`  ✓ preview   ${name}  →  http://127.0.0.1:${port}`);
  } catch (e) { console.log('  ⚠ launch.json を更新できなかった: ' + e.message); }

  trustWithCodex(dir);

  console.log('\n  作業ディレクトリ（以降の編集は全部この中で）:');
  console.log('    ' + dir);
  /* (#R674, then without numbers) …AND THE NAMES THIS WORK'S FILES MUST CARRY. MEASURED in #R671:
     two sessions both created tests/r568-checks.test.mjs (since regrouped into tests/radiation-plume-checks.test.mjs) from the same «next free number», git
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
/* An admin directory under <common git dir>/worktrees/ that has lost both `gitdir` and `HEAD` is not a
   worktree any more: git began deleting it and stopped. MEASURED 2026-10-10: 244 of 318 such
   directories had piled up, every one holding only read-only `logs/`, `refs/` and `ORIG_HEAD`, and
   `git worktree prune` printed «Permission denied» for all 244 on every run. The cause is the
   read-only attribute, not an open handle — clearing it lets the delete through. A directory that
   still has `gitdir` or `HEAD` is left to git, so a live worktree is never touched. */
export function sweepAdminRemnants(adminRoot) {
  if (!existsSync(adminRoot)) return [];
  const swept = [];
  for (const name of readdirSync(adminRoot)) {
    const dir = join(adminRoot, name);
    try { if (!lstatSync(dir).isDirectory()) continue; } catch { continue; }
    if (existsSync(join(dir, 'gitdir')) || existsSync(join(dir, 'HEAD'))) continue;
    const writable = (p) => {
      try { chmodSync(p, 0o666); } catch { /* best effort */ }
      try { if (lstatSync(p).isDirectory()) for (const c of readdirSync(p)) writable(join(p, c)); } catch { /* gone */ }
    };
    writable(dir);
    try { rmSync(dir, { recursive: true, force: true }); swept.push(name); } catch { /* leave it for the next run */ }
  }
  return swept;
}

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

  placeData(here, 'unlink');

  /* the preview entries `new` wrote — the master's absolute one outlives the worktree otherwise */
  {
    const m = /^wt-(.+)$/.exec(basename(here));
    if (m) {
      try {
        if (upsertLaunch(join(master, '.claude', 'launch.json'), null, previewName(m[1]))) console.log(`  ✓ preview ${previewName(m[1])} を原本の launch.json から外した`);
      } catch (e) { console.log('  ⚠ 原本の launch.json を直せなかった: ' + e.message); }
    }
  }

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
  {
    const common = resolve(master, q(['rev-parse', '--git-common-dir'], master) || '.git');
    const swept = sweepAdminRemnants(join(common, 'worktrees'));
    if (swept.length) console.log(`  ✓ 消しかけの管理ディレクトリ ${swept.length} 件を片付けた（読み取り専用属性）`);
  }

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
/* (proportional-finish) only when run as a command: tests import redAutoMerge() from here, and an
   import must not print the session's status. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}
