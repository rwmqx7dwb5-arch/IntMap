#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHICH MERGE BROKE IT — MEASURED, NOT GUESSED  (delivery-quality)
 * ----------------------------------------------------------------------------
 *  scripts/nightly-blame.mjs turns a regression (a test red on two read nights in a row) into a
 *  range of merges and ranks them by static evidence. Evidence is not a verdict: a spec reaches most
 *  of the app through its boot, which no static reading sees. This file produces the verdict by the
 *  only means that cannot be argued with — it runs the failing test, ALONE, at every merge of the
 *  range (and at the night it last passed, as the control), in parallel, and reads where it turns.
 *
 *  .github/workflows/nightly-bisect.yml is the runner; nightly-blame.mjs `--dispatch` starts it from
 *  the nightly, once per regression and range. Four steps, each a subcommand here:
 *
 *    plan     good, bad → the commits to probe: the control (`good`) and every first-parent commit
 *             of (good, bad], oldest first — as the job matrix
 *    run      at one checked-out commit: does the spec exist, did the site build, and how many of
 *             the REPEAT runs of that one test passed (Playwright's own JSON report, nothing parsed
 *             from prose) → one result file
 *    verdict  all result files → one of the outcomes below, as words and as JSON
 *    post     the words → a comment on the nightly issue, and on the PR the verdict names
 *
 *  ── THE OUTCOMES (judge(); every one is a statement about what was RUN) ─────────────────────
 *    culprit             the last commit it passes on is immediately followed by one it fails on
 *    narrowed            it passes up to X and fails from Y, with commits between that could not be
 *                        measured or did not decide (mixed) — the range is those commits, not one
 *    passes-alone        at the commit the nightly saw red, the test PASSES by itself: the red needs
 *                        the nightly shard (its load or a neighbouring test), not a merge. Nobody to
 *                        blame in the range — the test's isolation is the defect.
 *    control-not-clean   at the night it passed, it does not pass cleanly alone: the test is unstable
 *                        on its own and the range cannot be read
 *    flaky-at-bad        at the red commit it sometimes passes: not a regression a commit can own
 *    unmeasured          the red end did not build, or the test was not found — nothing was learned
 *  ⚠ «unmeasured» is not «passes» (one-pass-or-a-reason.md §5): a commit whose build failed is
 *  recorded as such and never read as either side of the boundary.
 *
 *  ⚠ THE TEST AT EACH COMMIT IS THAT COMMIT'S OWN SPEC. If a merge changed the spec and the spec is
 *  what went wrong, the bisect names that merge — which is right: the claim changed there.
 * ==========================================================================*/
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLog, titleOf } from './nightly-blame.mjs';
import { specOf } from './deep-history.mjs';
import { TITLE as ALARM_TITLE } from './deep-alarm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* GitHub Actions refuses a matrix of more than 256 jobs (docs: «A matrix can generate a maximum of
   256 jobs per workflow run»). A platform limit, not a budget: a longer range is SAMPLED evenly —
   control and red end always kept — and the verdict then names a narrowed range to dispatch again. */
export const MATRIX_MAX = 256;

/** How many times the one test runs at each commit. Three, so that one run cannot decide: a clean
    pass is 3/3, a clean fail 0/3, and anything else is reported as «mixed» rather than rounded. */
export const REPEAT = 3;

/* ── plan ─────────────────────────────────────────────────────────────────────────────────── */
/** commits = first-parent (good, bad], oldest first (nightly-blame parseLog). → the matrix rows. */
export function plan(good, commits, max = MATRIX_MAX) {
  const rows = [{ sha: good, pr: null, subject: '(control — the night it passed)', control: true }, ...commits.map((c) => ({ sha: c.sha, pr: c.pr, subject: c.subject, control: false }))];
  let pick = rows;
  let sampled = false;
  if (rows.length > max) {
    sampled = true;
    const keep = new Set([0, rows.length - 1]);
    for (let k = 0; keep.size < max; k++) keep.add(Math.round((k * (rows.length - 1)) / (max - 1)));
    pick = [...keep].sort((a, b) => a - b).map((i) => rows[i]);
  }
  return { sampled, total: rows.length, include: pick.map((r, i) => ({ order: i, sha: r.sha, pr: r.pr, control: r.control, subject: String(r.subject).slice(0, 120) })) };
}

/* ── run (at one commit) ──────────────────────────────────────────────────────────────────── */
const reEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Playwright's JSON report → { passed, failed } for every result of every test it holds. */
export function countResults(report) {
  let passed = 0, failed = 0;
  const walk = (suite) => {
    for (const s of suite.suites || []) walk(s);
    for (const spec of suite.specs || []) for (const t of spec.tests || []) for (const r of t.results || []) {
      if (r.status === 'passed') passed++;
      else if (r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted') failed++;
    }
  };
  for (const s of (report && report.suites) || []) walk(s);
  return { passed, failed };
}

/** one probe's state, from what happened at that commit */
export function stateOf({ exists, built, passed, failed }) {
  if (!exists) return 'absent';
  if (!built) return 'error';
  if (passed + failed === 0) return 'error';
  if (failed === 0) return 'pass';
  if (passed === 0) return 'fail';
  return 'mixed';
}

/* ── verdict ──────────────────────────────────────────────────────────────────────────────── */
/** results: one per probe ({ order, sha, pr, control, subject, state, passed, failed }) */
export function judge(results) {
  const rs = [...results].sort((a, b) => a.order - b.order);
  const control = rs.find((r) => r.control) || null;
  const bad = rs[rs.length - 1] || null;
  const base = { probes: rs.length, control: control && control.state, bad: bad && bad.state };
  if (!bad || bad.state === 'error' || bad.state === 'absent') return { ...base, kind: 'unmeasured', commits: [] };
  if (bad.state === 'pass') return { ...base, kind: 'passes-alone', commits: [] };
  if (bad.state === 'mixed') return { ...base, kind: 'flaky-at-bad', commits: [] };
  if (!control || control.state !== 'pass') return { ...base, kind: 'control-not-clean', commits: [] };
  /* the LAST commit it passes on, and the first it fails on after that */
  let g = -1;
  rs.forEach((r, i) => { if (r.state === 'pass') g = i; });
  let f = -1;
  for (let i = g + 1; i < rs.length; i++) if (rs[i].state === 'fail') { f = i; break; }
  const between = rs.slice(g + 1, f + 1);
  /* it failed somewhere before passing again: the newest boundary is the one that holds today */
  const nonMonotonic = rs.slice(0, g).some((r) => r.state === 'fail');
  if (f === g + 1) return { ...base, kind: 'culprit', commits: [rs[f]], lastPass: rs[g], nonMonotonic };
  return { ...base, kind: 'narrowed', commits: between, lastPass: rs[g], nonMonotonic };
}

const ref = (r) => (r.pr ? `#${r.pr}` : '`' + String(r.sha).slice(0, 8) + '`');
const cell = (r) => `${r.state}${r.passed + r.failed ? ` ${r.passed}/${r.passed + r.failed}` : ''}`;

export function words(v, { test, good, bad, results, runUrl, sampled }) {
  const L = [`### Bisect: \`${test}\``, '', `Range \`${String(good).slice(0, 8)}\` .. \`${String(bad).slice(0, 8)}\` — the test run alone, ${REPEAT} times, at each commit${runUrl ? ` ([run](${runUrl}))` : ''}.`, ''];
  const say = {
    culprit: () => `**Verdict: ${ref(v.commits[0])} broke it.** It passes ${REPEAT}/${REPEAT} at ${ref(v.lastPass)} and fails at ${ref(v.commits[0])}${v.commits[0].subject ? ` — ${v.commits[0].subject}` : ''}.`,
    narrowed: () => `**Verdict: one of ${v.commits.map(ref).join(', ')}.** It passes at ${ref(v.lastPass)} and fails at ${ref(v.commits[v.commits.length - 1])}; the commits between did not decide (could not be built, or mixed).`,
    'passes-alone': () => '**Verdict: no merge in this range broke it.** At the commit the nightly saw red, the test passes by itself every time — the red needs the nightly shard (its load, or a test that ran before it on the same worker). The defect is the test\'s isolation, not a change in the range.',
    'control-not-clean': () => '**Verdict: unreadable.** On the night it passed, the test does not pass cleanly when run alone — it is unstable on its own, so no boundary in the range means anything.',
    'flaky-at-bad': () => '**Verdict: not a regression a merge can own.** At the commit the nightly saw red, the test sometimes passes and sometimes fails alone.',
    unmeasured: () => '**Verdict: nothing was learned.** The red end of the range could not be built, or the test was not found there.',
  };
  L.push(say[v.kind](), '');
  if (v.nonMonotonic) L.push('(It also failed earlier in the range and passed again; the boundary named is the newest one.)', '');
  if (sampled) L.push(`⚠ The range had more commits than one run can probe (${MATRIX_MAX}); it was sampled evenly — dispatch again on the narrowed range.`, '');
  L.push('| # | commit | result |', '|---|---|---|');
  for (const r of [...results].sort((a, b) => a.order - b.order)) L.push(`| ${r.order}${r.control ? ' (control)' : ''} | ${ref(r)} ${String(r.subject || '').replace(/\|/g, '\\|').replace(/\s*\(#\d+\)\s*$/, '').slice(0, 80)} | ${cell(r)} |`);
  L.push('', '<sub>Written by `scripts/nightly-bisect.mjs` (`.github/workflows/nightly-bisect.yml`), started by the nightly for a test red on two nights in a row.</sub>');
  return L.join('\n');
}

/* ── CLI ───────────────────────────────────────────────────────────────────────────────────── */
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...argv] = process.argv.slice(2);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const env = process.env;

  if (cmd === 'plan') {
    /* env, not argv, in CI: the inputs are user-supplied and never interpolated into a shell body */
    const good = val('--good') || env.BISECT_GOOD, bad = val('--bad') || env.BISECT_BAD;
    const resolveSha = (s) => sh('git', ['rev-parse', '--verify', `${s}^{commit}`]);
    let G, B;
    try { G = resolveSha(good); B = resolveSha(bad); } catch { console.error(`nightly-bisect: ${good}..${bad} does not resolve to two commits`); process.exit(1); }
    const commits = parseLog(sh('git', ['log', '--first-parent', '--reverse', '--name-only', '--format=@@%H%x09%s', `${G}..${B}`]));
    if (!commits.length) { console.error(`nightly-bisect: no commit in ${G}..${B} — nothing to bisect`); process.exit(1); }
    const p = plan(G, commits);
    const out = `matrix=${JSON.stringify({ include: p.include })}\nsampled=${p.sampled}\ntotal=${p.total}\n`;
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, out);
    process.stdout.write(out);
    process.exit(0);
  }

  if (cmd === 'run') {
    /* run at the commit checked out in the CURRENT directory; this script itself lives elsewhere
       (the workflow checks the tool out apart from the tree under test, which may predate it) */
    const test = env.BISECT_TEST || val('--test');
    const spec = specOf(test), title = titleOf(test);
    const built = (env.BISECT_BUILT || val('--built')) === 'success';
    const exists = existsSync(spec);
    const out = val('--out') || 'bisect-result.json';
    const row = { order: +env.BISECT_ORDER, sha: env.BISECT_SHA, pr: env.BISECT_PR ? +env.BISECT_PR || null : null, control: env.BISECT_CONTROL === 'true', subject: env.BISECT_SUBJECT || '', exists, built, passed: 0, failed: 0 };
    if (exists && built) {
      const report = join(dirname(resolve(out)), 'bisect-report.json');   /* beside the result, not in the tree under test */
      /* IM_TIER=all: the tier rule of that commit must not hide the spec being asked about.
         The CLI is that commit's own Playwright, run by node directly — no shell, so the title's
         parentheses and quotes reach `-g` as written; the pattern is anchored to the END of the full
         title so «… schemes» does not also select «… schemes unchanged». */
      const cli = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
      const r = spawnSync(process.execPath, [cli, 'test', spec, '-g', `${reEscape(title)}$`, '--retries=0', `--repeat-each=${REPEAT}`, '--workers=1', '--reporter=json'],
        { encoding: 'utf8', env: { ...env, IM_TIER: 'all', IM_PREBUILT_DIST: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: report }, stdio: ['ignore', 'inherit', 'inherit'] });
      let rep = null; try { rep = JSON.parse(readFileSync(report, 'utf8')); } catch { /* no report: counted as nothing run → «error» */ }
      Object.assign(row, countResults(rep), { exit: r.status });
    }
    row.state = stateOf(row);
    writeFileSync(out, JSON.stringify(row, null, 1) + '\n');
    console.log(`nightly-bisect: ${row.sha.slice(0, 8)} → ${row.state} (${row.passed} passed, ${row.failed} failed)`);
    process.exit(0);
  }

  if (cmd === 'verdict' || cmd === 'post') {
    const dir = val('--results') || '_bisect';
    const files = [];
    const walk = (d) => { for (const e of (existsSync(d) ? readdirSync(d) : [])) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e === 'bisect-result.json') files.push(p); } };
    walk(dir);
    const results = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
    const test = env.BISECT_TEST || val('--test');
    const v = judge(results);
    const md = words(v, { test, good: env.BISECT_GOOD || val('--good'), bad: env.BISECT_BAD || val('--bad'), results, runUrl: env.BISECT_RUN_URL || val('--run-url'), sampled: (env.BISECT_SAMPLED || '') === 'true' });
    console.log(md);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n');
    writeFileSync(join(dir, 'verdict.json'), JSON.stringify({ test, ...v }, null, 1) + '\n');
    if (cmd === 'post') {
      const gh = (a) => sh('gh', a);
      /* the nightly issue, if it is open (deep-alarm.mjs owns its title) */
      try {
        const list = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title']));
        const hit = list.find((i) => i.title === ALARM_TITLE);
        if (hit) { gh(['issue', 'comment', String(hit.number), '--body', md]); console.log(`nightly-bisect: commented on #${hit.number}`); }
      } catch (e) { console.error('nightly-bisect: could not comment on the nightly issue: ' + String(e.message || e).split('\n')[0]); }
      /* …and on the PR it names — only for a verdict that names one */
      if (v.kind === 'culprit' && v.commits[0].pr) {
        try { gh(['pr', 'comment', String(v.commits[0].pr), '--body', md]); console.log(`nightly-bisect: commented on #${v.commits[0].pr}`); }
        catch (e) { console.error('nightly-bisect: could not comment on the PR: ' + String(e.message || e).split('\n')[0]); }
      }
    }
    process.exit(0);
  }

  console.error('usage: nightly-bisect.mjs plan|run|verdict|post …  (see the header)');
  process.exit(2);
}
