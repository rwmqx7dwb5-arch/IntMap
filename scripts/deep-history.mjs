#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE NIGHTLY DEEP TIER, READ AS A HISTORY RATHER THAN AS ONE NIGHT
 * ----------------------------------------------------------------------------
 *  scripts/deep-alarm.mjs says what failed LAST NIGHT, and `worktree.mjs status` repeats that
 *  verdict. Both are one night wide — and one night cannot tell the two things a red nightly can
 *  mean apart. MEASURED (2026-09-30): no green scheduled run since 2026-08-08, every night red with
 *  a different one-to-three tests. Among them was a genuine regression — the same test failing the
 *  same way two nights running, from the night the commits that broke it landed — sitting in the
 *  same one-line 「赤」 as a test that failed once and has not failed since. With nothing to tell
 *  them apart, nobody read either.
 *
 *  So this reads the last nights TOGETHER and sorts every failing test into:
 *
 *    · 連続（退行の疑い）— it failed on the newest night that could be read AND on the night before
 *      it. CI already retries a failing test once (playwright.config.js `retries: isCI ? 1 : 0`), so
 *      one night's failure is already two failed attempts; a second night is a second independent
 *      checkout on a second machine. Two is therefore the smallest streak that is not «one bad
 *      night», and it is the whole rule: nothing about the test's name or file decides it.
 *    · 散発（揺らぎ）— every other test that failed at least once in the window, with how many nights
 *      it failed and how many it needed its retry to pass. That list is the LEDGER: the name and the
 *      count are what the next reader needs to go and fix it. Nothing here skips, quarantines or
 *      hides a test — a sporadic failure is still a failure, it is only not evidence of a regression.
 *
 *  ── WHERE THE FACTS COME FROM ──────────────────────────────────────────────────────────────
 *  Each deep shard's job log ends with Playwright's own summary (the `list` reporter every CI run
 *  uses):
 *      1 failed
 *        [chromium] › tests/r170.spec.js:122:1 › Measure ▸ 3-D volume draws …
 *      1 flaky
 *        [chromium] › tests/r203.spec.js:123:1 › R203 ③ …
 *      109 passed (18.4m)
 *  That block is written by the test runner itself, so it names exactly the tests that failed
 *  both attempts ("failed") and the ones that passed only on the retry ("flaky"). Job logs are
 *  kept for the repository's log retention, so every past night can be read, not only the ones
 *  after this file existed. The report artifacts are NOT used: a failing shard's report carries its
 *  traces and measured 133–512 MB each (run 36634094537).
 *
 *  ⚠ A NIGHT THAT COULD NOT BE READ IS NOT A GREEN NIGHT (.agents/rules/one-pass-or-a-reason.md
 *  §5: 「確認できなかった」 is not 「失敗」 and not 「成功」). A cancelled run, a log that is gone,
 *  a shard whose log has no summary (it died around the suite) — each is recorded as such and
 *  skipped by the streak, never counted as a pass that would break it.
 *
 *  ── THE WINDOW ─────────────────────────────────────────────────────────────────────────────
 *  As many nights as the shards' Playwright reports are kept (`retention-days` of the «Upload
 *  Playwright report» step in .github/actions/browser-tier/action.yml, read — not restated), so
 *  every night this lists still has its traces to download. Change the retention and the window
 *  follows.
 *
 *  ── THE CACHE ──────────────────────────────────────────────────────────────────────────────
 *  A finished run never changes, so what was read from it is kept in <master>/.intmap/
 *  deep-history.json (untracked, beside the production receipts, one store for every worktree on
 *  this machine). Only nights not yet in it cost a network call.
 *
 *      node scripts/deep-history.mjs                 the ledger, in full
 *      node scripts/deep-history.mjs --json          the same, as JSON (worktree.mjs status reads it)
 *      node scripts/deep-history.mjs --budget <ms>   stop fetching after <ms>; what was not read is said
 *      node scripts/deep-history.mjs --include-run <id>  read this (still running) run as the newest night
 * ==========================================================================*/
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/* ── the summary block of one job log ──────────────────────────────────────────────────────── */
/* GitHub prefixes every log line with an ISO timestamp; Playwright's own line follows it. */
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const COUNT = /^\s*(\d+) (failed|flaky|passed|skipped|interrupted|did not run)\b/;
const ENTRY = /^\s+\[[^\]]+\] › (.+?)\s*$/;

/** The test ids Playwright's final summary names, by category — `null` when the log carries no
    summary at all (the job died before or around the suite: nothing about any test was said). */
export function parseSummary(log) {
  const lines = String(log || '').split(/\r?\n/).map((l) => l.replace(STAMP, ''));
  /* the LAST summary in the log is the run's — a step that printed an earlier one (none does today)
     must not be merged with it */
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*\d+ passed \(/.test(lines[i]) || /^\s*\d+ (failed|flaky)$/.test(lines[i])) {
      start = i;
      while (start > 0 && (COUNT.test(lines[start - 1]) || ENTRY.test(lines[start - 1]))) start--;
      break;
    }
  }
  if (start < 0) return null;
  const out = { failed: [], flaky: [] };
  let cat = null;
  for (let i = start; i < lines.length; i++) {
    const c = COUNT.exec(lines[i]);
    if (c) { cat = c[2]; continue; }
    const e = ENTRY.exec(lines[i]);
    if (!e) { if (cat) break; continue; }
    if (cat === 'failed' || cat === 'flaky') out[cat].push(normaliseId(e[1]));
  }
  return out;
}

/* A test is its FILE and its TITLE. The `:line:col` Playwright prints is where the title sits today, and
   an edit above it moves it — MEASURED in this window: r203's «space crossing» test was :117 on one
   night and :123 on the next, r159's «sidebar handle» :125 and :132. Keyed by position, one test became
   two half-counted ones and a streak broke on an unrelated edit. A Windows path (`tests\x.spec.js`) and
   a POSIX one are one file; the `─` the reporter pads a long title with is not part of the title. */
export function normaliseId(id) {
  const parts = String(id).replace(/\\/g, '/').replace(/[\s─]+$/, '').split(' › ');
  parts[0] = parts[0].replace(/:\d+:\d+$/, '');
  return parts.join(' › ');
}
/** the spec file of an id — the unit a reader opens */
export const specOf = (id) => String(id).split(' › ')[0];

/* ── classification ────────────────────────────────────────────────────────────────────────── */
/** The smallest run of consecutive red nights that is not «one bad night» — see the header.
    Changing CI's retry count does not change it: a night is still one checkout on one machine. */
export const STREAK = 2;

/**
 * @param {Array<{runId:number, day:string, conclusion:string, read:boolean, failed:string[], flaky:string[], infra?:string[]}>} nights newest first
 * @returns {{ nights:number, read:number, unread:Array<{day:string, runId:number, why:string}>,
 *   regressions:Array<{id:string, streak:number, failedNights:number, since:string}>,
 *   mended:Array<{id:string, longest:number, failedNights:number, last:string}>,
 *   sporadic:Array<{id:string, failedNights:number, flakyNights:number, days:string[], last:string}>,
 *   infra:Array<{day:string, runId:number, jobs:string[]}> }}
 */
export function classify(nights) {
  /* normalised HERE, not only at parse time, so a cache written by an older rule reads the same */
  const norm = (ids) => [...new Set((ids || []).map(normaliseId))];
  const read = nights.filter((n) => n.read).map((n) => ({ ...n, failed: norm(n.failed), flaky: norm(n.flaky) }));
  const ids = new Set();
  for (const n of read) { for (const id of n.failed) ids.add(id); for (const id of n.flaky) ids.add(id); }
  const regressions = [], mended = [], sporadic = [];
  for (const id of ids) {
    /* the streak counts READ nights only: an unread night is skipped, it neither extends nor breaks it */
    let streak = 0;
    for (const n of read) { if (n.failed.includes(id)) streak++; else break; }
    const failedDays = read.filter((n) => n.failed.includes(id)).map((n) => n.day);
    const flakyDays = read.filter((n) => n.flaky.includes(id)).map((n) => n.day);
    /* the longest run of consecutive red nights anywhere in the window */
    let longest = 0, run = 0;
    for (const n of read) { run = n.failed.includes(id) ? run + 1 : 0; longest = Math.max(longest, run); }
    const row = { id, failedNights: failedDays.length, flakyNights: flakyDays.length,
      days: [...new Set([...failedDays, ...flakyDays])].sort().reverse(),
      last: [...failedDays, ...flakyDays].sort().reverse()[0] };
    /* (delivery-quality) …and WHERE it broke, as two nights: the oldest red night of the streak and
       the read night just before it, on which this test did not fail. Those two commits bound every
       change that can have caused it — scripts/nightly-blame.mjs lists the PRs between them and
       scripts/nightly-bisect.mjs runs the test at each one. A streak that reaches the end of the
       window has no `good`: nothing read says when it last passed, and no range is invented. */
    const at = (n) => (n ? { day: n.day, sha: n.sha || null, runId: n.runId } : null);
    if (streak >= STREAK) regressions.push({ ...row, streak, since: read[streak - 1].day,
      bad: at(read[streak - 1]), good: at(read[streak] || null), goodWasFlaky: !!(read[streak] && read[streak].flaky.includes(id)) });
    /* it WAS red night after night and the newest read night passed it: a regression that looks
       mended. Kept apart from the sporadic list — nine red nights in a row are not a wobble — and
       apart from the live regressions, because the next move is to confirm the mend, not to hunt. */
    else if (longest >= STREAK) mended.push({ ...row, longest });
    else sporadic.push(row);
  }
  regressions.sort((a, b) => b.streak - a.streak || a.id.localeCompare(b.id));
  mended.sort((a, b) => b.longest - a.longest || b.last.localeCompare(a.last) || a.id.localeCompare(b.id));
  /* a test that FAILED outright ranks above one that only needed its retry, then by how often */
  sporadic.sort((a, b) => b.failedNights - a.failedNights || b.flakyNights - a.flakyNights || a.id.localeCompare(b.id));
  return {
    nights: nights.length, read: read.length,
    unread: nights.filter((n) => !n.read).map((n) => ({ day: n.day, runId: n.runId, why: n.why || '読めなかった' })),
    regressions, mended, sporadic,
    infra: read.filter((n) => n.infra && n.infra.length).map((n) => ({ day: n.day, runId: n.runId, jobs: n.infra })),
  };
}

/* ── the window, read from the one place it is set ─────────────────────────────────────────── */
export function windowNights(actionYml) {
  const src = String(actionYml || '');
  const i = src.indexOf('name: Upload Playwright report');
  if (i < 0) return null;
  const m = /retention-days:\s*(\d+)/.exec(src.slice(i));
  return m ? +m[1] : null;
}

/* ── the GitHub side ───────────────────────────────────────────────────────────────────────── */
const gh = (args, timeout) => new Promise((res) => {
  execFile('gh', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout, windowsHide: true },
    (err, out) => res(err ? { ok: false, why: String((err && err.message) || err).split('\n')[0] } : { ok: true, out }));
});

function masterDir() {
  return new Promise((res) => execFile('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' },
    (err, out) => res(err ? REPO : dirname(resolve(REPO, String(out).trim())))));
}
const cachePath = (master) => join(master, '.intmap', 'deep-history.json');
function readCache(p) { try { return JSON.parse(readFileSync(p, 'utf8')) || {}; } catch { return {}; } }

/** One finished scheduled run → one night. Every deep shard's log is read, not only the red ones:
    a test that needed its retry in a GREEN shard is part of the same ledger. */
async function readNight(run, deadline) {
  const night = { runId: run.databaseId, day: String(run.createdAt).slice(0, 10), sha: String(run.headSha || '').slice(0, 8),
    conclusion: run.conclusion, read: false, failed: [], flaky: [], infra: [] };
  if (run.conclusion === 'cancelled') { night.why = '中断（何も証明していない）'; return { night, final: true }; }
  const left = () => deadline - Date.now();
  if (left() <= 0) { night.why = '時間切れで未読'; return { night, final: false }; }
  const jobs = await gh(['run', 'view', String(run.databaseId), '--json', 'jobs'], Math.max(1000, left()));
  if (!jobs.ok) { night.why = 'job 一覧を読めなかった: ' + jobs.why; return { night, final: false }; }
  let list; try { list = (JSON.parse(jobs.out).jobs || []).filter((j) => /^Deep /.test(j.name)); } catch { list = []; }
  if (!list.length) { night.why = 'deep の job が無い（build が落ちた夜）'; night.read = false; return { night, final: true }; }
  const logs = await Promise.all(list.map((j) => (j.conclusion === 'skipped' || j.conclusion === 'cancelled')
    ? Promise.resolve({ ok: false, why: j.conclusion })
    : gh(['api', `repos/{owner}/{repo}/actions/jobs/${j.databaseId}/logs`], Math.max(1000, left()))));
  let final = true;
  list.forEach((j, k) => {
    const L = logs[k];
    if (!L.ok) {
      /* a shard that did not run proved nothing about its tests; a log that could not be fetched is
         unknown. Either way the night is not fully read, and a partial night must not look complete. */
      night.infra.push(`${j.name}（${L.why}）`);
      if (!/skipped|cancelled/.test(L.why)) final = false;
      return;
    }
    const s = parseSummary(L.out);
    if (!s) { if (j.conclusion !== 'success') night.infra.push(`${j.name}（要約なし＝スイートの外で落ちた）`); return; }
    night.failed.push(...s.failed); night.flaky.push(...s.flaky);
  });
  night.failed = [...new Set(night.failed)].sort();
  night.flaky = [...new Set(night.flaky)].sort();
  night.read = final;
  if (!final) night.why = '一部の shard の log を読めなかった';
  return { night, final };
}

/** The last `n` finished scheduled nights, newest first, reading only what the cache lacks. */
export async function history({ nights: want, budgetMs = 60000, includeRun = null } = {}) {
  const deadline = Date.now() + budgetMs;
  let n = want;
  if (!n) { try { n = windowNights(readFileSync(join(REPO, '.github/actions/browser-tier/action.yml'), 'utf8')); } catch { n = null; } }
  if (!n) return { known: false, why: 'window を action.yml から読めなかった' };
  const master = await masterDir();
  const p = cachePath(master);
  const cache = readCache(p);
  const runs = await gh(['run', 'list', '--workflow=ci.yml', '--event=schedule', '--status=completed', '--limit', String(n),
    '--json', 'databaseId,createdAt,conclusion,headSha'], Math.max(1000, deadline - Date.now()));
  let list = null;
  if (runs.ok) { try { list = JSON.parse(runs.out); } catch { list = null; } }
  if (!list) {
    /* The list of runs could not be had (MEASURED 2026-09-30: the same `gh run list` took 2 s, then
       7–25 s, minutes apart). What was already read is still true — a finished run never changes — so
       it is classified, and the answer SAYS that the window was not refreshed rather than posing as
       tonight's. With nothing cached, there is nothing to say. */
    const saved = Object.values(cache).sort((a, b) => String(b.day).localeCompare(String(a.day)) || b.runId - a.runId).slice(0, n);
    if (!saved.length) return { known: false, why: 'gh run list: ' + (runs.ok ? '出力を読めなかった' : runs.why) };
    return { known: true, stale: 'run の一覧を取れなかったので、保存済みの晩だけで分類した（' + (runs.ok ? '出力を読めなかった' : runs.why) + '）',
      window: n, latest: saved[0], ...classify(saved) };
  }
  /* NEWEST FIRST, A FEW AT A TIME. Starting every uncached night at once under a short budget (the
     status hook's) finishes none of them: MEASURED 2026-09-30, one night is 1 `run view` + 8 job logs
     in parallel ≈ 2–5 s here, and 14 nights together did not fit 6 s. In batches, the newest nights —
     the ones a streak is read from — complete first and are cached, and the next call continues. */
  /* ⚠ THE WINDOW IS THE NEWEST n BY RUN ID, OVER THE LIST AND THE CACHE TOGETHER. MEASURED 2026-09-30:
     one `gh run list … --limit 14` answered with 2026-08-30…09-13 — two weeks stale — minutes after
     the same call had answered 09-16…09-29, and the first version of this file trusted it: it read the
     old fortnight as the window and pruned the cache down to it. Run ids only grow, so the newest n
     of the union is right whichever of the two is behind. */
  const byId = new Map();
  for (const v of Object.values(cache)) byId.set(+v.runId, { cached: v });
  for (const r of list) if (!byId.has(+r.databaseId)) byId.set(+r.databaseId, { run: r });
  /* (delivery-quality) THE RUN THAT IS ASKING. The nightly's own alarm job runs while its workflow is
     still in progress, so `--status=completed` leaves TONIGHT out — and a test that went red for the
     second night running would be named a regression only tomorrow. Its deep shards are finished by
     then (the alarm job needs them), so tonight is read like any other night. */
  if (includeRun && !byId.has(+includeRun)) {
    const one = await gh(['run', 'view', String(includeRun), '--json', 'databaseId,createdAt,headSha'], Math.max(1000, deadline - Date.now()));
    if (one.ok) { try { const r = JSON.parse(one.out); byId.set(+r.databaseId, { run: { ...r, conclusion: 'in_progress' } }); } catch { /* unread: said below as the window's own gap */ } }
  }
  list = [...byId.entries()].sort((a, b) => b[0] - a[0]).slice(0, n).map(([, v]) => v);
  const fresh = new Array(list.length);
  const IN_FLIGHT = 3;
  for (let i = 0; i < list.length; i += IN_FLIGHT) {
    const batch = list.slice(i, i + IN_FLIGHT);
    const got = await Promise.all(batch.map((v) => (v.cached ? { night: v.cached, final: true, cached: true } : readNight(v.run, deadline))));
    got.forEach((g, k) => { fresh[i + k] = g; });
  }
  let wrote = false;
  /* a night read while its run was still in progress is not cached — its conclusion is not final */
  for (const f of fresh) if (f.final && !f.cached && f.night.conclusion !== 'in_progress') { cache[f.night.runId] = f.night; wrote = true; }
  if (wrote) {
    /* bounded, by run id (see above) — never by what one list happened to say */
    const ids = Object.keys(cache).map(Number).sort((a, b) => b - a);
    for (const k of ids.slice(3 * n)) delete cache[k];
    try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(cache, null, 1) + '\n'); } catch { /* a cache that cannot be written only costs the next run a fetch */ }
  }
  const nights = fresh.map((f) => f.night);
  return { known: true, window: n, latest: nights[0] || null, ...classify(nights) };
}

/* ── CLI ───────────────────────────────────────────────────────────────────────────────────── */
const short = (id, w = 110) => (id.length > w ? id.slice(0, w - 1) + '…' : id);
export function render(h) {
  const L = [];
  if (!h.known) { L.push(`deep tier の履歴: 不明（${h.why}）`); return L.join('\n'); }
  L.push(`deep tier の履歴 — 直近 ${h.nights} 晩（読めた ${h.read} 晩）`);
  if (h.stale) L.push(`⚠ ${h.stale}`);
  L.push('');
  L.push(`■ 連続で落ちている（退行の疑い・${STREAK} 晩以上続けて赤）: ${h.regressions.length} 件`);
  for (const r of h.regressions) L.push(`  · ${short(r.id)}\n      ${r.streak} 晩連続（${r.since} から）・${h.read} 晩中 ${r.failedNights} 晩赤`);
  L.push('');
  L.push(`■ 続けて落ちていたが、最新の晩は通った（直ったかを確かめる）: ${h.mended.length} 件`);
  for (const m of h.mended) L.push(`  · ${short(m.id)}\n      最長 ${m.longest} 晩連続・${h.read} 晩中 ${m.failedNights} 晩赤（最後 ${m.last}）`);
  L.push('');
  L.push(`■ 散発（揺らぎ）の台帳: ${h.sporadic.length} 件  — 赤＝再試行でも落ちた晩／再試行＝2 回目で通った晩`);
  for (const s of h.sporadic) L.push(`  · ${short(s.id)}\n      赤 ${s.failedNights} 晩・再試行 ${s.flakyNights} 晩（最後 ${s.last}）`);
  if (h.infra.length) {
    L.push('');
    L.push('■ スイートの外で落ちた・読めなかった shard');
    for (const x of h.infra) L.push(`  · ${x.day} run ${x.runId}: ${x.jobs.join(' / ')}`);
  }
  if (h.unread.length) {
    L.push('');
    L.push('■ 読めなかった晩（緑とは数えない）');
    for (const u of h.unread) L.push(`  · ${u.day} run ${u.runId}: ${u.why}`);
  }
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const h = await history({ nights: +arg('--nights') || undefined, budgetMs: +arg('--budget') || 120000, includeRun: arg('--include-run') });
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(h) + '\n');
  else console.log(render(h));
}
