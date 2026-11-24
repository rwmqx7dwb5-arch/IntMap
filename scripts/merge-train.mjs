#!/usr/bin/env node
/* ============================================================================
 *  IntMap · MERGE TRAIN — MANY PULL REQUESTS, ONE CI RUN   (merge-train)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-11-21: 55 open pull requests, 53 CI runs queued and 180 jobs waiting while 19 ran —
 *  the account's concurrent-job ceiling. One PR's CI is ~78 runner-minutes (run 44901155717: the
 *  critical path is ~25 min, the run took 2 h 24 min, the rest was waiting for a runner). Every PR is
 *  also run again on main after it merges. So the queue is not a speed problem inside a job; it is the
 *  NUMBER of full runs, and it grows faster than it drains.
 *
 *  A second measurement: 13 of the 55 conflicted with main as GitHub sees it, 8 of those merge cleanly
 *  once the repository's own merge drivers run (scripts/merge-driver.mjs — perf-baseline, the
 *  capability table, docs/FILES.md …). GitHub never runs those drivers, so the PR page says DIRTY
 *  until somebody rebases, and the session that opened the PR has usually gone.
 *
 *  This takes the open PRs whose author asked for them to land (auto-merge is on), merges them one
 *  after another onto origin/main WITH the drivers, runs the generators once, and opens ONE pull
 *  request whose CI tests the combined tree. It tests strictly more than the separate runs did: the
 *  tree that lands is the tree that was tested, with every PR's neighbour in it (the skew that made
 *  main red in 2026-11-15's burst — two PRs each green alone — is inside the tested tree here).
 *
 *  ⚠ NOTHING IS SKIPPED. The train's PR runs the same required checks as any PR; a red train lands
 *    nothing. The individual PRs stop spending runners only once they are inside a train.
 *  ⚠ THE RECORD OF WHAT A TRAIN CARRIES IS A TRAILER, `Merge-Train-Includes: #N@<head sha>`, one per
 *    PR, in the train PR's body AND in its squash commit. `--close` (run on main by CI) reads the
 *    commit and closes each PR whose head is still that sha. A PR its author pushed to after it
 *    boarded is NOT closed — its newer commits are not on main — and is told so.
 *  ⚠ CANDIDATES ARE A FACT ABOUT EACH PR, NOT A LIST: open, not a draft, based on main, auto-merge on,
 *    no failed check of its own, and not already carried by an open train (read from that train's
 *    trailer). A PR whose own CI is red needs its author's fix, not a train.
 *
 *      node scripts/merge-train.mjs --plan  [--max N] [--pr a,b] [--exclude a,b]   what would board
 *      node scripts/merge-train.mjs --build [--max N] [--pr a,b] [--exclude a,b]   build, push, open
 *                                        [--dry]       build locally only (no push, no PR, nothing touched)
 *                                        [--with-red]  board PRs whose own CI is red (the train's CI judges)
 *      node scripts/merge-train.mjs --push-only <worktree>   after fixing a train the quick gates stopped
 *      node scripts/merge-train.mjs --release <train PR>   train went red: give the PRs back
 *      node scripts/merge-train.mjs --close <commit>       (CI, on main) close what a train landed
 * ==========================================================================*/
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const TRAILER = 'Merge-Train-Includes';
export const BRANCH_PREFIX = 'train/';

/** `Merge-Train-Includes: #12@abc…` lines → [{ n, sha }]. Anything else in the text is ignored. */
export function parseTrailer(text) {
  const out = [];
  const re = new RegExp('^' + TRAILER + ':\\s*#(\\d+)@([0-9a-f]{7,40})\\s*$', 'gm');
  for (const m of String(text || '').matchAll(re)) out.push({ n: Number(m[1]), sha: m[2] });
  return out;
}

export function formatTrailer(items) {
  return items.map((p) => `${TRAILER}: #${p.n}@${p.sha}`).join('\n');
}

/**
 * Which PRs may board. `prs` is gh's JSON (number, isDraft, baseRefName, autoMergeRequest,
 * headRefName, createdAt) plus `failed` (names of this PR's own failed checks). `carried` is the set
 * of PR numbers an open train already carries. Returns { board, held } — held with the reason.
 */
export function selectCandidates(prs, { carried = new Set(), only = null, exclude = new Set(), max = Infinity, withRed = false } = {}) {
  const board = [], held = [];
  const sorted = [...prs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const p of sorted) {
    const why =
      String(p.headRefName || '').startsWith(BRANCH_PREFIX) ? 'それ自体が列車' :
      only && !only.has(p.number) ? null :
      exclude.has(p.number) ? '除外の指定' :
      p.isDraft ? 'draft' :
      p.baseRefName !== 'main' ? `base が ${p.baseRefName}` :
      !p.autoMergeRequest ? 'auto-merge が付いていない（作者が merge を求めていない）' :
      carried.has(p.number) ? '別の列車に載っている' :
      // A red from a run on an OLDER main is not a verdict on this PR over today's main (measured
      // 2026-11-21: four PRs red only on check:perf, against a ceiling #1310 wrote below its own tree's
      // build). --with-red lets the train's CI judge them on the current main instead.
      (p.failed || []).length && !withRed ? `自分の CI が赤: ${p.failed.join(' / ')}` :
      '';
    if (why === null) continue;
    if (why) held.push({ ...p, why });
    else if (board.length < max) board.push(p);
    else held.push({ ...p, why: `--max ${max} を超えた` });
  }
  return { board, held };
}

/* ── shell ─────────────────────────────────────────────────────────────── */
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const gh = (args, opts) => sh('gh', args, opts);
const ghJson = (args, opts) => JSON.parse(gh(args, opts) || 'null');

function openPRs() {
  return ghJson(['pr', 'list', '--state', 'open', '--limit', '200', '--json',
    'number,title,isDraft,baseRefName,headRefName,headRefOid,autoMergeRequest,createdAt,body']);
}

function failedChecks(n) {
  const r = run('gh', ['pr', 'checks', String(n), '--json', 'name,bucket']);
  // gh exits non-zero when any check failed or is pending; the JSON is still on stdout.
  try { return (JSON.parse(r.stdout || '[]') || []).filter((c) => c.bucket === 'fail').map((c) => c.name); }
  catch { return []; }
}

function carriedByOpenTrains(prs) {
  const s = new Set();
  for (const p of prs) if (String(p.headRefName).startsWith(BRANCH_PREFIX)) for (const t of parseTrailer(p.body)) s.add(t.n);
  return s;
}

const numList = (v) => new Set(String(v || '').split(',').map((x) => Number(x.replace('#', ''))).filter(Boolean));

function plan(args) {
  const prs = openPRs();
  for (const p of prs) if (!String(p.headRefName).startsWith(BRANCH_PREFIX) && p.autoMergeRequest) p.failed = failedChecks(p.number);
  return selectCandidates(prs, {
    carried: carriedByOpenTrains(prs),
    only: args.pr ? numList(args.pr) : null,
    exclude: numList(args.exclude),
    max: args.max ? Number(args.max) : Infinity,
    withRed: !!args['with-red'],
  });
}

function printPlan({ board, held }) {
  console.log(`載せる候補 ${board.length} 本`);
  for (const p of board) console.log(`  #${p.number}  ${p.title}`);
  if (held.length) console.log(`載せない ${held.length} 本`);
  for (const p of held) console.log(`  #${p.number}  ${p.why}  — ${p.title}`);
}

/* ── build ─────────────────────────────────────────────────────────────── */
function build(args) {
  const { board, held } = plan(args);
  printPlan({ board, held });
  if (!board.length) { console.log('載せるものが無い'); return; }

  const common = resolve(sh('git', ['rev-parse', '--git-common-dir']));
  const master = dirname(common);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const branch = BRANCH_PREFIX + stamp;
  const dir = join(tmpdir(), 'intmap-trains', stamp);
  mkdirSync(dirname(dir), { recursive: true });
  sh('git', ['-C', master, 'fetch', '-q', 'origin', 'main']);
  sh('git', ['-C', master, 'worktree', 'add', '-q', '-b', branch, dir, 'origin/main']);
  const nm = join(master, 'node_modules');
  if (existsSync(nm) && !existsSync(join(dir, 'node_modules'))) symlinkSync(nm, join(dir, 'node_modules'), 'junction');
  const git = (a) => run('git', ['-C', dir, ...a]);
  // (data-outside-git) the generators read datasets that are not in git; place them as `worktree.mjs new` does.
  if (existsSync(join(dir, 'data-assets.json'))) run(process.execPath, [join(dir, 'scripts', 'data-assets.mjs'), 'pull'], { cwd: dir, stdio: 'inherit' });

  const boarded = [], refused = [], fetched = [];
  for (const p of board) {
    const ref = `refs/train/pr/${p.number}`;
    const f = git(['fetch', '-q', 'origin', `+pull/${p.number}/head:${ref}`]);
    const sha = git(['rev-parse', ref]).stdout.trim();
    if (f.status !== 0 || !sha) { refused.push({ ...p, why: 'head を取れなかった' }); continue; }
    // A PR that changes .gitattributes changes HOW the merges after it resolve (it declares merge
    // drivers), so it boards first; otherwise the oldest first, as selected.
    const declares = git(['diff', '--quiet', 'HEAD...' + sha, '--', '.gitattributes']).status !== 0;
    fetched.push({ ...p, sha, declares });
  }
  fetched.sort((a, b) => Number(b.declares) - Number(a.declares));
  for (const p of fetched) {
    const { sha } = p;
    const m = git(['merge', '--no-ff', '--no-edit', '-m', `train: #${p.number} ${p.title}`, sha]);
    if (m.status !== 0) {
      const files = git(['diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n').filter(Boolean);
      git(['merge', '--abort']);
      refused.push({ ...p, why: `driver でも解けない衝突: ${files.join(', ') || m.stderr.trim().split('\n').pop()}` });
      continue;
    }
    boarded.push({ n: p.number, sha, title: p.title });
    console.log(`  ✓ #${p.number} を載せた`);
  }
  for (const r of refused) console.log(`  ✗ #${r.number}  ${r.why}`);
  if (!boarded.length) { console.log('1 本も載らなかった。worktree: ' + dir); return; }

  // The generators the drivers recorded, then the bookkeeping every commit gets (intmap-round §4).
  run('node', ['scripts/merge-driver.mjs', '--finish'], { cwd: dir, stdio: 'inherit' });
  run(process.execPath, ['scripts/regen.mjs'], { cwd: dir, stdio: 'inherit' });   // = npm run regen
  git(['add', '-A']);
  if (git(['diff', '--cached', '--quiet']).status !== 0) git(['commit', '-q', '-m', 'train: 生成物と台帳を merge 後の木で作り直す']);
  /* SECONDS HERE BEFORE AN HOUR THERE. Two PRs that each move a count the SAME way (25 → 26 Edge
     Functions, twice) merge with no conflict and the count moves once; two that each claim catalogue
     position 52 merge cleanly and the catalogue cannot be assembled. Measured on the first train
     (2026-11-21): all four of its red jobs were these, and the gates that name them take seconds
     locally. A red here stops before the push, with the tree left for a person to fix and rerun. */
  const state = { dir, branch, stamp, boarded, refused: refused.map((r) => ({ number: r.number, why: r.why })) };
  writeFileSync(dir + '.json', JSON.stringify(state, null, 2));
  if (!quickGatesGreen(dir)) return;
  if (args.dry) {
    console.log(`\n--dry: push も PR もしない。載った ${boarded.length} 本・載らなかった ${refused.length} 本。worktree: ${dir}（branch ${branch}）`);
    return;
  }
  publish(state);
}

function quickGatesGreen(dir) {
  /* check:datagov is here because a derived ledger (data/device-storage-ledger.json) went stale in a
     train with no conflict on the ledger itself: main changed the code it is derived from, so
     `--finish` had nothing to regenerate and the CI's Regression shard was the first to notice
     (measured 2026-11-24, #1372). */
  const quick = ['check:docs', 'check:catalog', 'check:capabilities', 'check:testbudget', 'check:datagov'];
  const red = quick.filter((g) => run(process.execPath, ['--run', g], { cwd: dir, stdio: 'inherit' }).status !== 0);
  /* …and the start-up budget, which needs a build (minutes, not the CI's hour). The driver keeps MAIN's
     size for every row both sides moved (intmap-clash=upstream), so N PRs that each raised a ceiling
     for a reason they wrote down arrive over it together (measured on the first train: six rows). The
     raise is a decision: `node scripts/perf-budget.mjs --update` in the train's worktree, with the
     boarded PRs' reasons, then --push-only. */
  if (!red.length) {
    const b = run(process.execPath, ['--run', 'build'], { cwd: dir, stdio: 'inherit' });
    if (b.status !== 0 || run(process.execPath, ['--run', 'check:perf'], { cwd: dir, stdio: 'inherit' }).status !== 0) red.push('build / check:perf');
  }
  if (!red.length) return true;
  console.log(`\n✗ 手元の門が赤: ${red.join(' ')}。push しない。直して commit し、続きは: node scripts/merge-train.mjs --push-only ${dir}`);
  return false;
}

/** Resume a train whose quick gates were red: the person fixed and committed in its worktree. */
function pushOnly(dir) {
  const state = JSON.parse(readFileSync(String(dir).replace(/[\\/]$/, '') + '.json', 'utf8'));
  if (run('git', ['-C', state.dir, 'status', '--porcelain']).stdout.trim()) throw new Error('未コミットの変更がある: ' + state.dir);
  if (!quickGatesGreen(state.dir)) return;
  publish(state);
}

function publish({ dir, branch, stamp, boarded, refused }) {
  const git = (a) => run('git', ['-C', dir, ...a]);
  const push = git(['push', '-q', '-u', 'origin', branch]);
  if (push.status !== 0) throw new Error('push に失敗: ' + push.stderr);
  const list = boarded.map((p) => `- #${p.n} ${p.title}`).join('\n');
  const trailer = formatTrailer(boarded);
  const body = `${boarded.length} 本の PR を 1 回の CI で通す merge train（scripts/merge-train.mjs）。\n` +
    `各 PR を origin/main の上へ順に merge driver 込みで merge し、生成物を作り直した木。\n` +
    `merge されると main の CI が下の trailer を読み、head が同じ PR を閉じる。\n\n${list}\n\n` +
    (refused.length ? `載らなかったもの:\n${refused.map((r) => `- #${r.number} ${r.why}`).join('\n')}\n\n` : '') +
    `${trailer}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n`;
  const bodyFile = join(dir, '..', `${stamp}-body.md`);
  writeFileSync(bodyFile, body);
  const url = gh(['pr', 'create', '--base', 'main', '--head', branch,
    '--title', `merge train ${stamp}: ${boarded.map((p) => '#' + p.n).join(' ')}`.slice(0, 250), '--body-file', bodyFile]);
  const trainNo = url.split('/').pop();
  const commitFile = join(dir, '..', `${stamp}-commit.md`);
  writeFileSync(commitFile, `${list}\n\n${trailer}\n`);
  gh(['pr', 'merge', trainNo, '--squash', '--auto', '--delete-branch', '--body-file', commitFile]);

  // The boarded PRs stop competing for runners and cannot land a second time on their own.
  for (const p of boarded) {
    run('gh', ['pr', 'merge', String(p.n), '--disable-auto']);
    run('gh', ['pr', 'comment', String(p.n), '--body',
      `merge train #${trainNo} に載せた（head ${p.sha.slice(0, 8)}）。この PR 自身の auto-merge は外し、走っていた CI は止めた。train が merge されると自動で閉じる。train が赤なら \`node scripts/merge-train.mjs --release ${trainNo}\` で戻る。`]);
    const runs = ghJson(['run', 'list', '--commit', p.sha, '--limit', '50', '--json', 'databaseId,status']) || [];
    for (const r of runs) if (r.status !== 'completed') run('gh', ['run', 'cancel', String(r.databaseId)]);
  }
  console.log(`\nmerge train: ${url}\nworktree: ${dir}（merge 後に git worktree remove で片付ける）`);
}

/* ── release / close ───────────────────────────────────────────────────── */
function release(trainNo) {
  const t = ghJson(['pr', 'view', String(trainNo), '--json', 'body,state,headRefName']);
  if (!String(t.headRefName).startsWith(BRANCH_PREFIX)) throw new Error(`#${trainNo} は merge train ではない`);
  for (const p of parseTrailer(t.body)) {
    run('gh', ['pr', 'merge', String(p.n), '--squash', '--auto', '--delete-branch']);
    run('gh', ['pr', 'comment', String(p.n), '--body', `merge train #${trainNo} から降ろした。auto-merge を元に戻した。`]);
    console.log(`  #${p.n} を戻した`);
  }
  if (t.state === 'OPEN') gh(['pr', 'close', String(trainNo), '--delete-branch', '--comment', '列車を解散した（載っていた PR は auto-merge を戻した）。']);
}

function close(commit) {
  const msg = sh('git', ['log', '-1', '--format=%B', commit]);
  const items = parseTrailer(msg);
  if (!items.length) { console.log(`${commit}: merge train の trailer は無い`); return; }
  const sha = sh('git', ['rev-parse', commit]);
  for (const p of items) {
    const v = ghJson(['pr', 'view', String(p.n), '--json', 'state,headRefOid']);
    if (v.state !== 'OPEN') { console.log(`  #${p.n} は既に ${v.state}`); continue; }
    if (!v.headRefOid.startsWith(p.sha) && !p.sha.startsWith(v.headRefOid)) {
      run('gh', ['pr', 'comment', String(p.n), '--body',
        `merge train の commit ${sha.slice(0, 8)} は head ${p.sha.slice(0, 8)} までを main へ入れた。その後の push（${v.headRefOid.slice(0, 8)}）は main に無いので、この PR は閉じずに残す。`]);
      console.log(`  #${p.n} は載った後に push されたので残した`);
      continue;
    }
    gh(['pr', 'close', String(p.n), '--delete-branch', '--comment', `merge train の commit ${sha.slice(0, 8)} で main に入った。`]);
    console.log(`  #${p.n} を閉じた`);
  }
}

/* ── cli ───────────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { a[k.slice(2)] = next; i++; } else a[k.slice(2)] = true;
  }
  return a;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (a.plan) printPlan(plan(a));
  else if (a.build) build(a);
  else if (a['push-only']) pushOnly(a['push-only']);
  else if (a.release) release(a.release);
  else if (a.close) close(a.close === true ? 'HEAD' : a.close);
  else { console.error('usage: --plan | --build | --release <train PR> | --close <commit>'); process.exit(2); }
}
